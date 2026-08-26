import "server-only";

import {
  getApprovalDecision, getCriticalityDetail, getSupplierEvaluation, getSupplierFile,
  listRequirementAssignments, listScopeOptions, listSupplierCategories,
  listSupplierEvaluations, listSupplierOverview, listSupplierRequirements,
  supplierApprovalOn, todayIso,
} from "@/lib/db/quality-suppliers";
import {
  APPROVAL_DECISION_LABEL, CRITERION_METHOD_LABEL, describeScope, describeTrend,
  EVALUATION_KIND_LABEL, EVALUATION_STATUS_LABEL, EXPIRY_IS_NOT_SUSPENSION, formatDate,
  INCIDENT_IS_NOT_NC, INCIDENT_KIND_LABEL, INCIDENT_SEVERITY_LABEL,
  RELATIONSHIP_STATUS_LABEL, REQUIREMENT_ENFORCEMENT_LABEL, REQUIREMENT_KIND_LABEL,
  RESULT_OUTCOME_LABEL, SUPPLIER_SOURCE_LABEL, summarizeOutcomes,
} from "@/lib/domain/quality-suppliers";
import type { ExportDefinition, ExportResult } from "../registry-types";
import { currentStateNote, field, fields, note, paragraph, requiredField, section, table } from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * Trazaloop · QUALITY-07 · Los papeles del dominio de proveedores.
 *
 * LA REGLA QUE ATRAVIESA LOS DOCE
 *
 * Ninguno de estos PDF dice «proveedor aprobado» a secas. Un proveedor está
 * aprobado PARA ALGO —una sede, una categoría—, y un papel que omitiera el
 * alcance sería una afirmación más amplia que la decisión que documenta. Es
 * exactamente el documento que alguien enseña en una auditoría creyendo que
 * dice lo que no dice.
 *
 * Y ninguno convierte una puntuación en una homologación. La evaluación
 * informa; la decisión es un acto humano, fechado y con fundamento, y va en su
 * propio documento.
 */

const SYSTEM = "Trazaloop Quality · proveedores";
const SCORE_NOTE =
  "El resultado de una evaluación NO aprueba a un proveedor. La decisión de aprobación es "
  + "un acto aparte, de una persona, para un alcance concreto y con su fundamento.";
const SCOPE_NOTE =
  "La aprobación se lee siempre POR ALCANCE. Un proveedor aprobado para una categoría no "
  + "queda aprobado para otra, ni una sede aprueba a las demás.";

/** El identificador se resuelve dentro de la sesión: si RLS no lo entrega, la
 *  respuesta es la misma que para un identificador inventado (§50). */
function stamp(iso: string): string {
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// 1 · Ficha del proveedor
// ---------------------------------------------------------------------------

export const qualitySupplierDetail: ExportDefinition = {
  key: "quality.supplier.detail",
  module: "quality",
  entity: "Proveedor evaluado",
  recordType: "Proveedor",
  documentName: "Ficha de proveedor",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La ficha reúne la situación vigente de cada alcance —criticidad, decisión sin sustituir "
    + "y última evaluación cerrada—. Para leer una fecha concreta están el documento de la "
    + "decisión de aprobación y el de la evaluación, que sí conservan su propia versión.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const file = await getSupplierFile(req.organizationId, req.id);
    if (!file) return null;
    const org = await organizationIdentity(req.organizationId);
    const o = file.overview;

    const cerradas = file.evaluations.filter((e) => e.status === "closed");
    const tendencia = describeTrend(
      cerradas[0] ? { score: cerradas[0].score, on: cerradas[0].evaluatedOn ?? "" } : null,
      cerradas[1] ? { score: cerradas[1].score, on: cerradas[1].evaluatedOn ?? "" } : null
    );
    const origen = [
      o.cprSupplierId ? SUPPLIER_SOURCE_LABEL.cpr : null,
      o.textileSupplierId ? SUPPLIER_SOURCE_LABEL.textiles : null,
    ].filter(Boolean).join(" y ");

    return {
      filenameParts: {
        recordType: "Proveedor", title: o.legalName, code: o.taxId, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Proveedor",
        title: o.legalName,
        code: o.taxId,
        subtitle: RELATIONSHIP_STATUS_LABEL[o.relationshipStatus],
        badges: [
          { text: `${o.approvedScopeCount} de ${o.scopeCount} alcances aprobados`, tone: "info" },
          ...(o.reevaluationOverdue
            ? [{ text: "Reevaluación vencida", tone: "warn" as const }] : []),
          ...(o.expiredApprovalCount > 0
            ? [{ text: "Aprobación caducada", tone: "warn" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(SCOPE_NOTE), currentStateNote(req.generatedAt)),
          section("Quién es", fields([
            requiredField("Razón social", o.legalName),
            field("Nombre comercial", o.tradeName),
            field("Identificación fiscal", o.taxId),
            field("Ubicación", [o.city, o.country].filter(Boolean).join(", ")),
            requiredField("Relación", RELATIONSHIP_STATUS_LABEL[o.relationshipStatus]),
            requiredField("Responsable interno", o.ownerPositionName ?? "Sin asignar"),
            field("También registrado en", origen || null),
          ])),
          section("Aprobación por alcance", table(
            [
              { header: "Alcance", width: 4 },
              { header: "Criticidad", width: 2 },
              { header: "Decisión", width: 2 },
              { header: "Vigencia", width: 2 },
              { header: "Última evaluación", width: 2 },
            ],
            file.scopes.map((s) => [
              describeScope({ siteName: s.siteName, categoryName: s.categoryName }),
              s.criticalityLabel ?? "Sin clasificar",
              s.decision ? APPROVAL_DECISION_LABEL[s.decision] : "Sin decidir",
              s.decisionValidUntil
                ? `${formatDate(s.decisionValidUntil)}${s.approvalExpired ? " (vencida)" : ""}`
                : (s.decision ? "Sin fecha límite" : "—"),
              s.lastEvaluatedOn
                ? `${formatDate(s.lastEvaluatedOn)} · ${s.lastScore ?? "—"}`
                : "Sin evaluar",
            ]),
            "Este proveedor no tiene alcances declarados, así que no está aprobado para nada."
          )),
          section("Qué suministra", table(
            [
              { header: "Categoría", width: 5 },
              { header: "Sede", width: 3 },
              { header: "Desde", width: 2 },
              { header: "Hasta", width: 2 },
            ],
            file.categories.map((c) => [
              c.categoryName, c.siteName ?? "Todas",
              formatDate(c.sinceOn), c.untilOn ? formatDate(c.untilOn) : "Vigente",
            ]),
            "Sin categorías asignadas."
          )),
          section("Sedes", table(
            [
              { header: "Sede", width: 4 },
              { header: "Código", width: 2 },
              { header: "Ubicación", width: 4 },
              { header: "Principal", width: 2 },
            ],
            file.sites.map((s) => [
              s.name, s.code ?? "—",
              [s.city, s.country].filter(Boolean).join(", ") || "—",
              s.isPrimary ? "Sí" : "—",
            ]),
            "Sin sedes declaradas."
          )),
          section("Cómo ha evolucionado",
            paragraph(tendencia.text),
            table(
              [
                { header: "Fecha", width: 2 },
                { header: "Clase", width: 3 },
                { header: "Plantilla", width: 3 },
                { header: "Resultado", width: 2 },
                { header: "Criterios", width: 2 },
              ],
              file.evaluations.map((e) => [
                e.evaluatedOn ? formatDate(e.evaluatedOn) : "—",
                EVALUATION_KIND_LABEL[e.kind],
                e.templateName ? `${e.templateName} v${e.versionNumber}` : "—",
                e.score === null ? "—" : `${e.score}${e.resultBand ? ` · ${e.resultBand}` : ""}`,
                `${e.criteriaScored}/${e.criteriaTotal}`,
              ]),
              "Todavía no se ha evaluado a este proveedor."
            ),
            note(SCORE_NOTE)
          ),
          section("Documentos y certificaciones",
            table(
              [
                { header: "Documento", width: 4 },
                { header: "Emisor", width: 3 },
                { header: "Emitido", width: 2 },
                { header: "Vence", width: 2 },
                { header: "Estado", width: 2 },
              ],
              file.documents.map((d) => [
                d.title, d.issuer ?? "—",
                d.issuedOn ? formatDate(d.issuedOn) : "—",
                d.expiresOn ? formatDate(d.expiresOn) : "No vence",
                d.status,
              ]),
              "Sin documentos registrados."
            ),
            note(EXPIRY_IS_NOT_SUSPENSION)
          ),
          section("Incidentes",
            table(
              [
                { header: "Fecha", width: 2 },
                { header: "Incidente", width: 5 },
                { header: "Tipo", width: 2 },
                { header: "Gravedad", width: 2 },
              ],
              file.incidents.map((i) => [
                formatDate(i.occurredOn), i.title,
                INCIDENT_KIND_LABEL[i.kind], INCIDENT_SEVERITY_LABEL[i.severity],
              ]),
              "Sin incidentes registrados."
            ),
            note(INCIDENT_IS_NOT_NC)
          ),
          section("Cuándo se reevalúa", fields([
            requiredField("Cadencia", `${o.reevaluationMonths} meses`),
            requiredField("Última evaluación",
              o.lastEvaluatedOn ? formatDate(o.lastEvaluatedOn) : "Nunca"),
            requiredField("Siguiente revisión",
              o.nextReviewOn ? formatDate(o.nextReviewOn) : "Sin fecha"),
          ]), note(
            "Pasarse de la fecha no suspende a nadie: significa que hay una revisión "
            + "pendiente."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 2 · Listado de proveedores
// ---------------------------------------------------------------------------

export const qualitySupplierList: ExportDefinition = {
  key: "quality.supplier.list",
  module: "quality",
  entity: "Listado de proveedores evaluados",
  recordType: "Proveedores",
  documentName: "Listado de proveedores",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata la situación vigente. Para una fecha concreta hay que ir a la "
    + "decisión de aprobación del alcance, que sí conserva su versión.",
  filters: [
    {
      key: "status", label: "Relación", kind: "enum",
      values: ["prospect", "active", "inactive", "retired"],
    },
    { key: "search", label: "Búsqueda", kind: "text" },
  ],
  async load(req): Promise<ExportResult | null> {
    const [suppliers, org] = await Promise.all([
      listSupplierOverview(req.organizationId, {
        status: req.filters.status, search: req.filters.search,
      }),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Proveedores", title: "Listado de proveedores",
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Proveedores",
        title: "Listado de proveedores",
        subtitle: `${suppliers.length} registro${suppliers.length === 1 ? "" : "s"}`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(SCOPE_NOTE), currentStateNote(req.generatedAt)),
          section(null, table(
            [
              { header: "Proveedor", width: 4 },
              { header: "Identificación", width: 2 },
              { header: "Relación", width: 2 },
              { header: "Criticidad máxima", width: 2 },
              { header: "Alcances aprobados", width: 2 },
              { header: "Última evaluación", width: 2 },
              { header: "Siguiente revisión", width: 2 },
            ],
            suppliers.map((s) => [
              s.legalName, s.taxId ?? "—",
              RELATIONSHIP_STATUS_LABEL[s.relationshipStatus],
              s.topCriticalityLabel ?? "Sin clasificar",
              `${s.approvedScopeCount} de ${s.scopeCount}`,
              s.lastEvaluatedOn ? formatDate(s.lastEvaluatedOn) : "Nunca",
              s.nextReviewOn
                ? `${formatDate(s.nextReviewOn)}${s.reevaluationOverdue ? " (vencida)" : ""}`
                : "—",
            ]),
            "No hay proveedores registrados."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 3 · Lista de proveedores aprobados (GP-08)
// ---------------------------------------------------------------------------

export const qualityApprovedSupplierList: ExportDefinition = {
  key: "quality.approved-supplier.list",
  module: "quality",
  entity: "Lista de proveedores aprobados",
  recordType: "Proveedores aprobados",
  // La nomenclatura de la plataforma manda sobre la del dominio: todos los
  // listados empiezan por «Listado». La ASL de la norma se sigue llamando así
  // en el cuerpo del papel, que es donde la busca quien la lee.
  documentName: "Listado de proveedores aprobados",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "La lista se DERIVA de las decisiones vigentes: no se mantiene a mano y por eso no "
    + "tiene versiones propias. Cada línea remite a una decisión que sí las tiene.",
  async load(req): Promise<ExportResult | null> {
    const [scopes, org] = await Promise.all([
      listScopeOptions(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const hoy = todayIso();

    const filas: string[][] = [];
    for (const sc of scopes) {
      const decision = await supplierApprovalOn(req.organizationId, sc.scopeId, hoy);
      if (!decision || !decision.wasValid) continue;
      filas.push([
        sc.label,
        APPROVAL_DECISION_LABEL[decision.decision],
        formatDate(decision.effectiveFrom),
        decision.validUntil ? formatDate(decision.validUntil) : "Sin fecha límite",
        decision.conditions ?? "—",
      ]);
    }

    return {
      filenameParts: {
        recordType: "Proveedores aprobados", title: "Lista de proveedores aprobados",
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Proveedores aprobados",
        title: "Lista de proveedores aprobados",
        subtitle: `${filas.length} alcance${filas.length === 1 ? "" : "s"} con aprobación vigente`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Esta lista NO se mantiene a mano: sale de las decisiones vigentes. Por eso no "
            + "puede quedarse desactualizada, y por eso tampoco se puede añadir a nadie sin "
            + "decidirlo."
          ), note(SCOPE_NOTE)),
          section(null, table(
            [
              { header: "Proveedor y alcance", width: 5 },
              { header: "Decisión", width: 2 },
              { header: "Desde", width: 2 },
              { header: "Vigente hasta", width: 2 },
              { header: "Condiciones", width: 4 },
            ],
            filas,
            "Ningún alcance tiene hoy una aprobación vigente."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 4 · Sede del proveedor
// ---------------------------------------------------------------------------

export const qualitySupplierSiteDetail: ExportDefinition = {
  key: "quality.supplier-site.detail",
  module: "quality",
  entity: "Sede de proveedor",
  recordType: "Sede de proveedor",
  documentName: "Ficha de sede de proveedor",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La sede no conserva versiones: lo que cambia con el tiempo son los alcances que la "
    + "incluyen, y esos se leen en sus propias decisiones y evaluaciones.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    // El identificador es el de la SEDE. Se busca en los proveedores que la
    // sesión puede ver: lo que RLS no entrega no existe para este papel.
    const suppliers = await listSupplierOverview(req.organizationId, {});
    let file = null;
    for (const s of suppliers) {
      const f = await getSupplierFile(req.organizationId, s.profileId);
      if (f && f.sites.some((x) => x.id === req.id)) { file = f; break; }
    }
    if (!file) return null;

    const sede = file.sites.find((s) => s.id === req.id)!;
    const alcances = file.scopes.filter((s) => s.siteId === sede.id);
    const idsAlcance = new Set(alcances.map((s) => s.scopeId));
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Sede de proveedor",
        title: `${file.overview.legalName} · ${sede.name}`,
        code: sede.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Sede de proveedor",
        title: sede.name,
        code: sede.code,
        subtitle: file.overview.legalName,
        badges: sede.isPrimary ? [{ text: "Sede principal", tone: "info" }] : [],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Lo que dice este documento vale PARA ESTA SEDE. Que la misma empresa esté "
            + "aprobada en otra planta no aprueba esta."
          ), currentStateNote(req.generatedAt)),
          section("Dónde está", fields([
            requiredField("Sede", sede.name),
            field("Código", sede.code),
            field("Ciudad", sede.city),
            field("País", sede.country),
            field("Dirección", sede.address, true),
          ])),
          section("Qué se le compra aquí", table(
            [
              { header: "Categoría", width: 6 },
              { header: "Desde", width: 3 },
              { header: "Hasta", width: 3 },
            ],
            file.categories.filter((c) => c.siteId === sede.id).map((c) => [
              c.categoryName, formatDate(c.sinceOn),
              c.untilOn ? formatDate(c.untilOn) : "Vigente",
            ]),
            "No hay categorías asignadas a esta sede en concreto."
          )),
          section("Alcances de esta sede", table(
            [
              { header: "Alcance", width: 4 },
              { header: "Criticidad", width: 2 },
              { header: "Decisión", width: 3 },
              { header: "Vigencia", width: 3 },
            ],
            alcances.map((s) => [
              describeScope({ siteName: s.siteName, categoryName: s.categoryName }),
              s.criticalityLabel ?? "Sin clasificar",
              s.decision ? APPROVAL_DECISION_LABEL[s.decision] : "Sin decidir",
              s.decisionValidUntil
                ? `${formatDate(s.decisionValidUntil)}${s.approvalExpired ? " (vencida)" : ""}`
                : (s.decision ? "Sin fecha límite" : "—"),
            ]),
            "Esta sede no tiene alcances propios."
          )),
          section("Evaluaciones de esta sede", table(
            [
              { header: "Fecha", width: 3 },
              { header: "Clase", width: 3 },
              { header: "Resultado", width: 3 },
              { header: "Estado", width: 3 },
            ],
            file.evaluations.filter((e) => idsAlcance.has(e.scopeId)).map((e) => [
              e.evaluatedOn ? formatDate(e.evaluatedOn) : "—",
              EVALUATION_KIND_LABEL[e.kind],
              e.score === null ? "—" : `${e.score}${e.resultBand ? ` · ${e.resultBand}` : ""}`,
              EVALUATION_STATUS_LABEL[e.status],
            ]),
            "Todavía no se ha evaluado esta sede."
          )),
          section("Contactos", table(
            [
              { header: "Nombre", width: 4 },
              { header: "Función", width: 3 },
              { header: "Correo", width: 3 },
              { header: "Teléfono", width: 2 },
            ],
            file.contacts.filter((c) => c.siteId === sede.id).map((c) => [
              c.fullName, c.roleTitle ?? "—", c.email ?? "—", c.phone ?? "—",
            ]),
            "Sin contactos propios de esta sede."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 5 · Categorías
// ---------------------------------------------------------------------------

export const qualitySupplierCategoryList: ExportDefinition = {
  key: "quality.supplier-category.list",
  module: "quality",
  entity: "Categorías de proveedor",
  recordType: "Categorías de proveedor",
  documentName: "Listado de categorías de proveedor",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El catálogo de categorías no guarda versiones: lo fechado son las asignaciones de "
    + "categoría a cada proveedor, que llevan su propio periodo.",
  async load(req): Promise<ExportResult | null> {
    const [categories, org] = await Promise.all([
      listSupplierCategories(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Categorías de proveedor", title: "Categorías de proveedor",
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Categorías de proveedor",
        title: "Categorías de proveedor",
        subtitle: `${categories.length} categoría${categories.length === 1 ? "" : "s"}`,
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Una categoría clasifica QUÉ se compra. No dice cuánto importa —eso es la "
            + "criticidad— ni si alguien está aprobado —eso es una decisión—."
          ), currentStateNote(req.generatedAt)),
          section(null, table(
            [
              { header: "Categoría", width: 4 },
              { header: "Código", width: 2 },
              { header: "Descripción", width: 5 },
              { header: "Activa", width: 1 },
            ],
            categories.map((c) => [
              c.name, c.code ?? "—", c.description ?? "—", c.isActive ? "Sí" : "No",
            ]),
            "Todavía no hay categorías."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 6 · Requisitos
// ---------------------------------------------------------------------------

export const qualitySupplierRequirementList: ExportDefinition = {
  key: "quality.supplier-requirement.list",
  module: "quality",
  entity: "Requisitos a proveedores",
  recordType: "Requisitos a proveedores",
  documentName: "Listado de requisitos a proveedores",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El requisito en sí no versiona; lo que lleva fecha es su ASIGNACIÓN, y este documento "
    + "la imprime con su periodo de vigencia.",
  async load(req): Promise<ExportResult | null> {
    const [requirements, assignments, org] = await Promise.all([
      listSupplierRequirements(req.organizationId),
      listRequirementAssignments(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Requisitos a proveedores", title: "Requisitos a proveedores",
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Requisitos a proveedores",
        title: "Requisitos a proveedores",
        subtitle: `${requirements.length} requisito${requirements.length === 1 ? "" : "s"}`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Un requisito describe una exigencia; no la ejecuta. Ni siquiera uno bloqueante "
            + "suspende a nadie por su cuenta: impide que la aprobación se decida sin mirarlo."
          )),
          section("Qué se exige", table(
            [
              { header: "Requisito", width: 4 },
              { header: "Código", width: 2 },
              { header: "Tipo", width: 2 },
              { header: "Exigencia", width: 2 },
              { header: "Descripción", width: 4 },
            ],
            requirements.map((r) => [
              r.title, r.code ?? "—",
              REQUIREMENT_KIND_LABEL[r.kind],
              REQUIREMENT_ENFORCEMENT_LABEL[r.enforcement],
              r.description ?? "—",
            ]),
            "Todavía no hay requisitos definidos."
          )),
          section("A quién se le aplica", table(
            [
              { header: "Requisito", width: 4 },
              { header: "Se aplica a", width: 5 },
              { header: "Desde", width: 2 },
              { header: "Hasta", width: 2 },
            ],
            assignments.map((a) => [
              a.requirementTitle,
              a.categoryName ? `Categoría · ${a.categoryName}` : `Alcance · ${a.scopeLabel ?? "—"}`,
              formatDate(a.effectiveFrom),
              a.effectiveTo ? formatDate(a.effectiveTo) : "Vigente",
            ]),
            "Ningún requisito está asignado todavía."
          ), note(
            "Retirar un requisito lo retira desde su fecha. Lo evaluado antes se sigue "
            + "leyendo contra lo que se exigía entonces."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 7 · Evaluación (documento del pasado)
// ---------------------------------------------------------------------------

export const qualitySupplierEvaluationDetail: ExportDefinition = {
  key: "quality.supplier-evaluation.detail",
  module: "quality",
  entity: "Evaluación de proveedor",
  recordType: "Evaluación de proveedor",
  documentName: "Evaluación de proveedor",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  // GP-15 · La evaluación guarda la VERSIÓN de plantilla con la que se hizo, y
  // sus criterios y pesos se leen de ahí. Es un documento del pasado de verdad.
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const detail = await getSupplierEvaluation(req.organizationId, req.id);
    if (!detail) return null;

    const [scopes, org] = await Promise.all([
      listScopeOptions(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const scope = scopes.find((s) => s.scopeId === detail.evaluation.scopeId);
    const e = detail.evaluation;
    const resumen = summarizeOutcomes(detail.results);

    return {
      filenameParts: {
        recordType: "Evaluación de proveedor",
        title: scope?.label ?? "Evaluación de proveedor",
        stamp: e.evaluatedOn ?? stamp(req.generatedAt),
      },
      document: {
        recordType: "Evaluación de proveedor",
        title: scope?.label ?? "Evaluación de proveedor",
        subtitle: `${EVALUATION_KIND_LABEL[e.kind]}`
          + (e.evaluatedOn ? ` · ${formatDate(e.evaluatedOn)}` : ""),
        badges: [
          { text: EVALUATION_STATUS_LABEL[e.status], tone: e.status === "closed" ? "info" : "neutral" },
          ...(e.resultBand ? [{ text: e.resultBand, tone: "neutral" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(SCORE_NOTE)),
          section("Qué se evaluó", fields([
            requiredField("Proveedor y alcance", scope?.label ?? "—"),
            requiredField("Clase", EVALUATION_KIND_LABEL[e.kind]),
            requiredField("Plantilla",
              e.templateName ? `${e.templateName} · versión ${e.versionNumber}` : "—"),
            requiredField("Estado", EVALUATION_STATUS_LABEL[e.status]),
            field("Periodo", e.periodLabel),
            field("Fecha de la evaluación", e.evaluatedOn ? formatDate(e.evaluatedOn) : null),
            field("Por qué se hizo", e.triggerReason, true),
          ])),
          section("Resultado", fields([
            requiredField("Puntuación", e.score === null ? "Sin cerrar" : String(e.score)),
            requiredField("Banda", e.resultBand ?? "—"),
            requiredField("Criterios puntuados", `${resumen.scored} de ${detail.results.length}`),
            requiredField("No aplican", String(resumen.not_applicable)),
            requiredField("Sin dato", String(resumen.unavailable)),
            requiredField("Sin evaluar", String(resumen.not_evaluated)),
          ]), note(
            "«No aplica» no cuenta como cero: sale del cálculo. Un cero dice «lo hizo mal»; "
            + "«no aplica» dice «esto no se le puede pedir»."
          )),
          section("Criterio a criterio", table(
            [
              { header: "Código", width: 1 },
              { header: "Criterio", width: 4 },
              { header: "Peso", width: 1 },
              { header: "Cómo se miró", width: 2 },
              { header: "Resultado", width: 2 },
              { header: "Puntos", width: 1 },
              { header: "Observación", width: 3 },
            ],
            detail.results.map((r) => [
              r.code, r.label, String(r.weight),
              CRITERION_METHOD_LABEL[r.method],
              RESULT_OUTCOME_LABEL[r.outcome],
              r.outcome === "scored" ? `${r.points ?? "—"}/${r.maxPoints}` : "—",
              r.observation ?? "—",
            ]),
            "Esta versión de la plantilla no tenía criterios."
          ), note(
            "Los criterios y los pesos son los de la versión con la que se hizo esta "
            + "evaluación, no los de la plantilla de hoy."
          )),
          section("Conclusión", paragraph(e.summary) ?? paragraph(
            "La evaluación no dejó conclusión escrita.", true
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 8 · Listado de evaluaciones
// ---------------------------------------------------------------------------

export const qualitySupplierEvaluationList: ExportDefinition = {
  key: "quality.supplier-evaluation.list",
  module: "quality",
  entity: "Listado de evaluaciones de proveedor",
  recordType: "Evaluaciones de proveedor",
  documentName: "Listado de evaluaciones de proveedor",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado enumera las evaluaciones tal como están hoy. Cada una, por separado, sí es "
    + "un documento del pasado con su propia versión de plantilla.",
  filters: [
    {
      key: "status", label: "Estado", kind: "enum",
      values: ["draft", "in_progress", "closed", "cancelled"],
    },
  ],
  async load(req): Promise<ExportResult | null> {
    const [evaluations, scopes, org] = await Promise.all([
      listSupplierEvaluations(req.organizationId, { status: req.filters.status }),
      listScopeOptions(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const etiqueta = new Map(scopes.map((s) => [s.scopeId, s.label]));

    return {
      filenameParts: {
        recordType: "Evaluaciones de proveedor", title: "Evaluaciones de proveedor",
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Evaluaciones de proveedor",
        title: "Evaluaciones de proveedor",
        subtitle: `${evaluations.length} evaluación${evaluations.length === 1 ? "" : "es"}`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(SCORE_NOTE)),
          section(null, table(
            [
              { header: "Proveedor y alcance", width: 5 },
              { header: "Clase", width: 2 },
              { header: "Periodo", width: 2 },
              { header: "Fecha", width: 2 },
              { header: "Resultado", width: 2 },
              { header: "Criterios", width: 2 },
              { header: "Estado", width: 2 },
            ],
            evaluations.map((e) => [
              etiqueta.get(e.scopeId) ?? "Alcance",
              EVALUATION_KIND_LABEL[e.kind],
              e.periodLabel ?? "—",
              e.evaluatedOn ? formatDate(e.evaluatedOn) : "—",
              e.score === null ? "—" : `${e.score}${e.resultBand ? ` · ${e.resultBand}` : ""}`,
              `${e.criteriaScored}/${e.criteriaTotal}`,
              EVALUATION_STATUS_LABEL[e.status],
            ]),
            "No hay evaluaciones registradas."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 9 · Criticidad
// ---------------------------------------------------------------------------

export const qualitySupplierCriticalityDetail: ExportDefinition = {
  key: "quality.supplier-criticality.detail",
  module: "quality",
  entity: "Criticidad de proveedor",
  recordType: "Criticidad de proveedor",
  documentName: "Clasificación de criticidad de proveedor",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  // La clasificación guarda la versión de metodología que la produjo, y es
  // inmutable: publicar una metodología nueva no la recalcula.
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    // El identificador es el del ALCANCE: la criticidad se clasifica por
    // alcance, no por proveedor. El mismo proveedor puede ser crítico en una
    // categoría e irrelevante en otra.
    const detail = await getCriticalityDetail(req.organizationId, req.id);
    if (!detail) return null;

    const [scopes, org] = await Promise.all([
      listScopeOptions(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const scope = scopes.find((s) => s.scopeId === req.id);

    return {
      filenameParts: {
        recordType: "Criticidad de proveedor",
        title: scope?.label ?? "Criticidad de proveedor",
        stamp: detail.assessedOn,
      },
      document: {
        recordType: "Criticidad de proveedor",
        title: scope?.label ?? "Criticidad de proveedor",
        subtitle: `${detail.levelLabel} · ${formatDate(detail.assessedOn)}`,
        badges: [{ text: detail.levelLabel, tone: "info" }],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "La criticidad NO es una nota de desempeño. Mide cuánto daño haría que este "
            + "proveedor fallara, no lo bien o mal que lo ha hecho. Un proveedor crítico "
            + "puede llevar años sin un solo fallo y seguir siendo crítico."
          )),
          section("Qué se clasificó", fields([
            requiredField("Proveedor y alcance", scope?.label ?? "—"),
            requiredField("Nivel", detail.levelLabel),
            requiredField("Puntuación", String(detail.score)),
            requiredField("Fecha", formatDate(detail.assessedOn)),
            field("Metodología", detail.methodologyName),
            field("Versión", detail.versionNumber === null ? null : String(detail.versionNumber)),
            field("Obliga a revisar cada",
              detail.reviewMonths === null ? null : `${detail.reviewMonths} meses`),
          ])),
          section("Cómo se llegó a ese nivel", table(
            [
              { header: "Dimensión", width: 5 },
              { header: "Valor elegido", width: 5 },
              { header: "Puntos", width: 2 },
            ],
            detail.factors.map((f) => [f.scaleLabel, f.levelLabel, String(f.value)]),
            "La clasificación no conserva el detalle por dimensión."
          ), note(
            "Estos valores son los de la versión de metodología con la que se clasificó. "
            + "Publicar una metodología nueva no recalcula esta clasificación."
          )),
          section("Por qué", paragraph(detail.rationale) ?? paragraph(
            "La clasificación no dejó explicación escrita.", true
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 10 · Decisión de aprobación
// ---------------------------------------------------------------------------

export const qualitySupplierApprovalDetail: ExportDefinition = {
  key: "quality.supplier-approval.detail",
  module: "quality",
  entity: "Decisión de aprobación de proveedor",
  recordType: "Decisión de aprobación",
  documentName: "Decisión de aprobación de proveedor",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  // MDR-49 · Una decisión formal no se edita: se sustituye por otra. Este papel
  // imprime el acto tal como se tomó.
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const d = await getApprovalDecision(req.organizationId, req.id);
    if (!d) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Decisión de aprobación",
        title: `${d.supplierName} · ${d.scopeLabel}`,
        stamp: d.effectiveFrom,
      },
      document: {
        recordType: "Decisión de aprobación",
        title: `${d.supplierName} · ${d.scopeLabel}`,
        subtitle: `${APPROVAL_DECISION_LABEL[d.decision]} desde el ${formatDate(d.effectiveFrom)}`,
        badges: [
          { text: APPROVAL_DECISION_LABEL[d.decision], tone: "info" },
          ...(d.supersededBy ? [{ text: "Sustituida", tone: "warn" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Esta decisión vale PARA ESTE ALCANCE. No aprueba al proveedor para nada más, y "
            + "los otros alcances del mismo proveedor no cambian por ella."
          )),
          section("Qué se decidió", fields([
            requiredField("Proveedor", d.supplierName),
            requiredField("Alcance", d.scopeLabel),
            requiredField("Decisión", APPROVAL_DECISION_LABEL[d.decision]),
            requiredField("En vigor desde", formatDate(d.effectiveFrom)),
            requiredField("Vigente hasta",
              d.validUntil ? formatDate(d.validUntil) : "Sin fecha límite"),
            requiredField("Quién decidió", d.decidedByName ?? "—"),
            requiredField("Cuándo se registró", formatDate(d.decidedAt.slice(0, 10))),
          ])),
          section("En qué se basa", paragraph(d.rationale)),
          section("Condiciones",
            paragraph(d.conditions) ?? paragraph("Sin condiciones.", true)),
          section("Evaluación que la informó", d.evaluationId
            ? fields([
                requiredField("Resultado",
                  d.evaluationScore === null ? "—" : String(d.evaluationScore)),
                requiredField("Banda", d.evaluationBand ?? "—"),
              ])
            : paragraph("No se apoyó en ninguna evaluación registrada.", true),
            note(SCORE_NOTE)
          ),
          ...(d.supersededBy
            ? [section(null, note(
                "Esta decisión fue SUSTITUIDA por otra posterior. Se conserva porque explica "
                + "qué se creía y por qué en el momento en que se tomó."
              ))]
            : []),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 11 · Aprobación en una fecha (verdad histórica)
// ---------------------------------------------------------------------------

export const qualitySupplierApprovalHistorical: ExportDefinition = {
  key: "quality.supplier-approval.historical",
  module: "quality",
  entity: "Aprobación de proveedor en una fecha",
  recordType: "Aprobación en una fecha",
  documentName: "Aprobación de proveedor en una fecha",
  kind: "historical",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  filters: [{ key: "date", label: "Fecha", kind: "date" }],
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const on = req.filters.date ?? todayIso();
    const [decision, criticality, scopes, org] = await Promise.all([
      supplierApprovalOn(req.organizationId, req.id, on),
      getCriticalityDetail(req.organizationId, req.id),
      listScopeOptions(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const scope = scopes.find((s) => s.scopeId === req.id);
    if (!scope) return null;

    return {
      filenameParts: {
        recordType: "Aprobación en una fecha", title: scope.label, stamp: on,
      },
      document: {
        recordType: "Aprobación en una fecha",
        title: scope.label,
        subtitle: `Situación al ${formatDate(on)}`,
        badges: decision
          ? [{
              text: decision.wasValid
                ? APPROVAL_DECISION_LABEL[decision.decision]
                : `${APPROVAL_DECISION_LABEL[decision.decision]} (caducada)`,
              tone: decision.wasValid ? "info" : "warn",
            }]
          : [{ text: "Sin decisión en esa fecha", tone: "neutral" }],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            `Este documento responde a una pregunta concreta: qué estaba decidido sobre este `
            + `alcance el ${formatDate(on)}. No es el estado de hoy, y no se recalcula con lo `
            + `que se haya decidido después.`
          )),
          section("Qué estaba decidido", decision
            ? fields([
                requiredField("Decisión", APPROVAL_DECISION_LABEL[decision.decision]),
                requiredField("En vigor desde", formatDate(decision.effectiveFrom)),
                requiredField("Vigente hasta",
                  decision.validUntil ? formatDate(decision.validUntil) : "Sin fecha límite"),
                requiredField("¿Estaba vigente ese día?", decision.wasValid ? "Sí" : "No"),
                field("Condiciones", decision.conditions, true),
              ])
            : paragraph(
                "En esa fecha no había ninguna decisión de aprobación sobre este alcance. "
                + "No es lo mismo que «no aprobado»: es que todavía no se había decidido.",
                true
              ),
            decision ? paragraph(decision.rationale) : null
          ),
          section("Criticidad", criticality
            ? fields([
                requiredField("Nivel", criticality.levelLabel),
                requiredField("Clasificado el", formatDate(criticality.assessedOn)),
              ])
            : paragraph("El alcance no tiene clasificación de criticidad.", true)),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 12 · Reevaluaciones pendientes
// ---------------------------------------------------------------------------

export const qualitySupplierReevaluationList: ExportDefinition = {
  key: "quality.supplier-reevaluation.list",
  module: "quality",
  entity: "Reevaluaciones de proveedor pendientes",
  recordType: "Reevaluaciones pendientes",
  documentName: "Listado de reevaluaciones de proveedor",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado dice qué está pendiente HOY. Reconstruir qué estaba pendiente el año pasado "
    + "exigiría guardar cada fecha de revisión calculada, y el dominio no lo hace.",
  async load(req): Promise<ExportResult | null> {
    const [suppliers, org] = await Promise.all([
      listSupplierOverview(req.organizationId, {}),
      organizationIdentity(req.organizationId),
    ]);
    const vivos = suppliers.filter((s) => s.relationshipStatus !== "retired");
    const vencidas = vivos.filter((s) => s.reevaluationOverdue);

    return {
      filenameParts: {
        recordType: "Reevaluaciones pendientes", title: "Reevaluaciones de proveedor",
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Reevaluaciones pendientes",
        title: "Reevaluaciones de proveedor",
        subtitle: `${vencidas.length} vencida${vencidas.length === 1 ? "" : "s"}`
          + ` de ${vivos.length} proveedor${vivos.length === 1 ? "" : "es"}`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Pasarse de la fecha de reevaluación NO suspende a nadie ni caduca ninguna "
            + "aprobación por su cuenta. Significa que hay una revisión pendiente."
          ), currentStateNote(req.generatedAt)),
          section("Vencidas", table(
            [
              { header: "Proveedor", width: 4 },
              { header: "Criticidad", width: 2 },
              { header: "Última evaluación", width: 2 },
              { header: "Tocaba el", width: 2 },
              { header: "Cadencia", width: 2 },
              { header: "Alcances aprobados", width: 2 },
            ],
            vencidas.map((s) => [
              s.legalName, s.topCriticalityLabel ?? "Sin clasificar",
              s.lastEvaluatedOn ? formatDate(s.lastEvaluatedOn) : "Nunca",
              s.nextReviewOn ? formatDate(s.nextReviewOn) : "—",
              `${s.reevaluationMonths} meses`,
              `${s.approvedScopeCount} de ${s.scopeCount}`,
            ]),
            "Ninguna revisión vencida."
          )),
          section("Programadas", table(
            [
              { header: "Proveedor", width: 4 },
              { header: "Criticidad", width: 2 },
              { header: "Última evaluación", width: 2 },
              { header: "Toca el", width: 2 },
              { header: "Cadencia", width: 2 },
              { header: "Alcances aprobados", width: 2 },
            ],
            vivos.filter((s) => !s.reevaluationOverdue && s.nextReviewOn !== null).map((s) => [
              s.legalName, s.topCriticalityLabel ?? "Sin clasificar",
              s.lastEvaluatedOn ? formatDate(s.lastEvaluatedOn) : "Nunca",
              s.nextReviewOn ? formatDate(s.nextReviewOn) : "—",
              `${s.reevaluationMonths} meses`,
              `${s.approvedScopeCount} de ${s.scopeCount}`,
            ]),
            "Ninguna revisión programada."
          )),
          section("Sin fecha de revisión", table(
            [
              { header: "Proveedor", width: 5 },
              { header: "Criticidad", width: 3 },
              { header: "Alcances aprobados", width: 4 },
            ],
            vivos.filter((s) => s.nextReviewOn === null).map((s) => [
              s.legalName, s.topCriticalityLabel ?? "Sin clasificar",
              `${s.approvedScopeCount} de ${s.scopeCount}`,
            ]),
            "Todos los proveedores tienen fecha de revisión."
          ), note(
            "Un proveedor sin fecha de revisión es uno que nunca se ha evaluado: no hay "
            + "desde cuándo contar."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 13 · Informe de desempeño del proveedor
// ---------------------------------------------------------------------------

export const qualitySupplierPerformanceDetail: ExportDefinition = {
  key: "quality.supplier-performance.detail",
  module: "quality",
  entity: "Desempeño de proveedor",
  recordType: "Desempeño de proveedor",
  documentName: "Informe de desempeño de proveedor",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El informe reúne las evaluaciones cerradas y los incidentes registrados hasta hoy. Cada "
    + "evaluación, por separado, sí es un documento del pasado con su propia versión.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const file = await getSupplierFile(req.organizationId, req.id);
    if (!file) return null;
    const org = await organizationIdentity(req.organizationId);
    const o = file.overview;

    const cerradas = file.evaluations.filter((e) => e.status === "closed");
    const tendencia = describeTrend(
      cerradas[0] ? { score: cerradas[0].score, on: cerradas[0].evaluatedOn ?? "" } : null,
      cerradas[1] ? { score: cerradas[1].score, on: cerradas[1].evaluatedOn ?? "" } : null
    );
    const conDato = cerradas.filter((e) => e.score !== null);
    const media = conDato.length > 0
      ? Math.round((conDato.reduce((a, e) => a + (e.score ?? 0), 0) / conDato.length) * 100) / 100
      : null;

    return {
      filenameParts: {
        recordType: "Desempeño de proveedor", title: o.legalName,
        code: o.taxId, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Desempeño de proveedor",
        title: o.legalName,
        code: o.taxId,
        subtitle: tendencia.text,
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Desempeño es cómo lo ha hecho. Criticidad es cuánto pesa depender de él. Son "
            + "dos preguntas distintas y este informe solo contesta la primera."
          ), note(SCORE_NOTE), currentStateNote(req.generatedAt)),
          section("En resumen", fields([
            requiredField("Evaluaciones cerradas", String(cerradas.length)),
            requiredField("Resultado medio", media === null ? "Sin datos" : String(media)),
            requiredField("Último resultado",
              cerradas[0]?.score === undefined || cerradas[0]?.score === null
                ? "—" : String(cerradas[0].score)),
            requiredField("Incidentes registrados", String(file.incidents.length)),
            requiredField("Siguiente revisión",
              o.nextReviewOn ? formatDate(o.nextReviewOn) : "Sin fecha"),
          ])),
          section("Evolución", table(
            [
              { header: "Fecha", width: 2 },
              { header: "Alcance", width: 4 },
              { header: "Clase", width: 2 },
              { header: "Resultado", width: 2 },
              { header: "Criterios puntuados", width: 2 },
            ],
            cerradas.map((e) => {
              const sc = file.scopes.find((s) => s.scopeId === e.scopeId);
              return [
                e.evaluatedOn ? formatDate(e.evaluatedOn) : "—",
                sc ? describeScope({ siteName: sc.siteName, categoryName: sc.categoryName }) : "—",
                EVALUATION_KIND_LABEL[e.kind],
                e.score === null ? "—" : `${e.score}${e.resultBand ? ` · ${e.resultBand}` : ""}`,
                `${e.criteriaScored} de ${e.criteriaTotal}`,
              ];
            }),
            "Todavía no hay evaluaciones cerradas."
          ), note(
            "Dos resultados solo se comparan si se midieron con la misma plantilla. La "
            + "columna de la evaluación dice cuál se usó en cada caso."
          )),
          section("Incidentes", table(
            [
              { header: "Fecha", width: 2 },
              { header: "Incidente", width: 5 },
              { header: "Tipo", width: 2 },
              { header: "Gravedad", width: 2 },
              { header: "Caso abierto", width: 2 },
            ],
            file.incidents.map((i) => [
              formatDate(i.occurredOn), i.title,
              INCIDENT_KIND_LABEL[i.kind], INCIDENT_SEVERITY_LABEL[i.severity],
              i.caseId ? "Sí" : "No",
            ]),
            "Sin incidentes registrados."
          ), note(INCIDENT_IS_NOT_NC)),
        ],
      },
    };
  },
};
