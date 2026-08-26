import "server-only";

import {
  demonstratedLevelOn, getCompetenceMatrix, getOrgChart, getPersonFile,
  listAssignments, listCompetencies, listCompetencyLevels, listOrgUnits, listPeople,
  listPositionVersions, positionHoldersOn, requiredLevelOn,
} from "@/lib/db/quality-people";
import { listQualityPositions } from "@/lib/db/quality-processes";
import {
  ASSIGNMENT_TYPE_LABEL, COMPETENCE_METHOD_LABEL, CRITICALITY_LABEL,
  competenceGap, describeEvidenceExpiry, EVIDENCE_STATUS_LABEL, formatDate,
  HOLDER_LEVEL_LABEL, PERSON_COMPETENCE_STATUS_LABEL, PERSON_RELATIONSHIP_LABEL,
  PERSON_STATUS_LABEL, POSITION_FUNCTION_KIND_LABEL, POSITION_VERSION_STATUS_LABEL,
} from "@/lib/domain/quality-people";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  currentStateNote, field, fields, note, paragraph, requiredField, section, table,
  type PrintNode,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * Trazaloop · QUALITY-06 · Los PDF del dominio Personas (estructura,
 * personas y competencia).
 *
 * TRES REGLAS QUE ATRAVIESAN TODOS ESTOS DOCUMENTOS
 *
 * 1 · §63 · UN PDF NO CONCEDE PERMISOS. Cada adaptador lee por las mismas
 *     funciones que la pantalla, y esas funciones pasan por RLS con la sesión
 *     de quien descarga. Si alguien no puede ver una evaluación en pantalla,
 *     tampoco la ve aquí: no hay una ruta «de servidor» que se salte el
 *     círculo de privacidad.
 *
 * 2 · §65 · La matriz NO es un ranking. No lleva totales por persona, no
 *     ordena por brecha y no colorea a nadie de rojo. Ordena alfabéticamente,
 *     que es lo que sirve para buscar a alguien.
 *
 * 3 · §54 · Lo histórico se lee del pasado, no del presente. Los documentos
 *     con fecha usan las funciones `..._on()` de 0123; ninguno reconstruye
 *     ayer con los valores de hoy.
 */

const SYSTEM = "Trazaloop Quality · personas y competencia";
const FOOTER =
  "Este PDF es una representación de lo registrado en Trazaloop en el momento indicado. "
  + "La fuente sigue siendo el sistema.";

/** Aviso de privacidad del papel. Un PDF sale del sistema y se reenvía. */
const PRIVACY_NOTE =
  "Contiene información de personas. Compártelo solo con quien tenga que verlo: "
  + "un PDF no lleva consigo los permisos que lo produjeron.";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ===========================================================================
// Estructura de la empresa
// ===========================================================================

export const qualityOrgUnitList: ExportDefinition = {
  key: "quality.org-unit.list",
  module: "quality",
  entity: "Unidad de la empresa",
  recordType: "Unidades de la empresa",
  documentName: "Listado de unidades de la empresa",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "Las unidades no conservan versión temporal: se puede decir cómo está organizada la "
    + "empresa hoy, no cómo lo estaba en una fecha pasada.",
  async load(req): Promise<ExportResult | null> {
    const [units, org] = await Promise.all([
      listOrgUnits(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const byId = new Map(units.map((u) => [u.id, u]));

    return {
      filenameParts: { recordType: "Unidades", title: "Estructura de la empresa" },
      document: {
        recordType: "Unidades de la empresa",
        title: "Estructura de la empresa",
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        recordCount: units.length,
        sections: [
          section(null, currentStateNote(req.generatedAt)),
          section("Unidades", table(
            [
              { header: "Unidad", width: 4 },
              { header: "Código", width: 2 },
              { header: "Depende de", width: 3 },
              { header: "Estado", width: 2 },
            ],
            units.map((u) => [
              u.name, u.code ?? "—",
              u.parentId ? byId.get(u.parentId)?.name ?? "—" : "Unidad raíz",
              u.isActive ? "Activa" : "Inactiva",
            ]),
            "Esta empresa todavía no ha declarado unidades. No es obligatorio: una empresa "
              + "puede funcionar con una sola unidad y varios cargos."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

/**
 * PC-02 · El organigrama es DERIVADO. Se dibuja como jerarquía real —unidades
 * y, dentro, los cargos con su titular— y no como una imagen pegada.
 *
 * §64 · Estructurado y multipágina: el renderizador parte la jerarquía cuando
 * no cabe, en vez de encogerla hasta que no se lea.
 */
export const qualityOrgChartDetail: ExportDefinition = {
  key: "quality.orgchart.detail",
  module: "quality",
  entity: "Organigrama",
  recordType: "Organigrama",
  documentName: "Organigrama",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "Las unidades y la jerarquía de cargos no conservan versión temporal. Para saber quién "
    + "ocupaba cada cargo en una fecha existe «Titulares de cargos en una fecha», que sí se "
    + "reconstruye con verdad.",
  async load(req): Promise<ExportResult | null> {
    const [chart, units, org] = await Promise.all([
      getOrgChart(req.organizationId),
      listOrgUnits(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const active = chart.filter((p) => p.isActive);

    // La jerarquía se arma por unidades; los cargos sin unidad cuelgan de un
    // grupo aparte, porque esconderlos sería peor que enseñarlos sueltos.
    const unitNodes: PrintNode[] = units
      .filter((u) => u.isActive)
      .map((u) => ({
        label: u.name,
        sublabel: u.code,
        children: positionsUnder(active, u.id),
      }));
    const orphan = positionsUnder(active, null);
    const roots: PrintNode[] = [
      ...unitNodes,
      ...(orphan.length > 0
        ? [{ label: "Cargos sin unidad asignada", sublabel: null, children: orphan }]
        : []),
    ];

    const vacantCritical = active.filter((p) => p.isCritical && p.holderCount === 0);

    return {
      filenameParts: { recordType: "Organigrama", title: org.name },
      document: {
        recordType: "Organigrama",
        title: "Organigrama",
        subtitle: `${active.length} cargo(s) activo(s) · ${units.length} unidad(es)`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        recordCount: active.length,
        sections: [
          section(null,
            currentStateNote(req.generatedAt),
            note(
              "Este organigrama se genera a partir de las unidades, los cargos, su jerarquía y "
              + "las asignaciones vigentes. No hay ninguna imagen guardada: cambiar un cargo "
              + "cambia este documento."
            )),
          section("Estructura", { type: "hierarchy", roots }),
          vacantCritical.length > 0
            ? section("Cargos críticos sin titular", table(
                [{ header: "Cargo", width: 5 }, { header: "Unidad", width: 3 }],
                vacantCritical.map((p) => [p.positionName, p.orgUnitLabel ?? "—"]),
              ))
            : section(null),
        ].filter((s) => s.blocks.length > 0),
        footerNote: FOOTER,
      },
    };
  },
};

function positionsUnder(
  chart: readonly Awaited<ReturnType<typeof getOrgChart>>[number][],
  unitId: string | null
): PrintNode[] {
  const inUnit = chart.filter((p) => p.orgUnitId === unitId);
  const byParent = (parent: string | null): PrintNode[] =>
    inUnit
      .filter((p) => p.parentPositionId === parent)
      .map((p) => ({
        label: p.isCritical ? `${p.positionName} · cargo crítico` : p.positionName,
        // §64 · El titular se ve, pero la caja habla del CARGO. Un organigrama
        // que solo dice nombres deja de servir el día que alguien se va.
        sublabel: p.holderCount === 0
          ? "Sin titular vigente"
          : p.primaryHolderName
            ?? `${p.holderCount} persona(s) asignada(s)`,
        children: byParent(p.positionId),
      }));
  // Un cargo cuyo padre está en OTRA unidad se dibuja como raíz de la suya:
  // de lo contrario desaparecería del papel sin que nadie lo notara.
  const roots = byParent(null);
  const drawn = new Set<string>();
  const collect = (nodes: PrintNode[]) => {
    for (const n of nodes) { drawn.add(n.label); collect(n.children ?? []); }
  };
  collect(roots);
  const missing = inUnit
    .filter((p) => !drawn.has(p.positionName) && !drawn.has(`${p.positionName} · cargo crítico`))
    .map((p) => ({
      label: p.positionName,
      sublabel: p.primaryHolderName ?? "Sin titular vigente",
      children: [],
    }));
  return [...roots, ...missing];
}

/**
 * §54/§69 · Quién ocupaba cada cargo EN una fecha.
 *
 * Este documento es la respuesta en papel a la pregunta que da sentido a
 * MDR-33. Lee de `quality_position_holders_on()`; no mira ni una vez la
 * asignación vigente.
 */
export const qualityPositionHoldersHistorical: ExportDefinition = {
  key: "quality.position-holders.historical",
  module: "quality",
  entity: "Titularidad de cargo",
  recordType: "Titulares de cargos",
  documentName: "Titulares de cargos en una fecha",
  kind: "historical",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  filters: [{ key: "date", label: "Fecha", kind: "date" }],
  async load(req): Promise<ExportResult | null> {
    const on = req.filters.date ?? todayIso();
    const [positions, org] = await Promise.all([
      listQualityPositions(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);

    const rows: string[][] = [];
    for (const p of positions) {
      const holders = await positionHoldersOn(req.organizationId, p.id, on);
      if (holders.length === 0) {
        rows.push([p.name, "Sin titular en esa fecha", "—"]);
        continue;
      }
      for (const h of holders) {
        rows.push([
          p.name,
          h.personName ?? "Persona sin ficha",
          ASSIGNMENT_TYPE_LABEL[h.assignmentType],
        ]);
      }
    }

    return {
      filenameParts: { recordType: "Titulares", title: `al ${formatDate(on)}`, stamp: on },
      document: {
        recordType: "Titulares de cargos",
        title: `Titulares de cargos al ${formatDate(on)}`,
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: [{ label: "Fecha", value: formatDate(on) }],
        recordCount: rows.length,
        sections: [
          section(null, note(
            "Reconstruido con las asignaciones vigentes EN esa fecha. La responsabilidad "
            + "estructural es del cargo; la persona lo ocupó entre fechas."
          )),
          section(null, table(
            [
              { header: "Cargo", width: 4 },
              { header: "Persona", width: 4 },
              { header: "Vínculo", width: 2 },
            ],
            rows,
            "No había cargos definidos en esa fecha."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

// ===========================================================================
// Perfil de cargo
// ===========================================================================

export const qualityPositionProfileDetail: ExportDefinition = {
  key: "quality.position-profile.detail",
  module: "quality",
  entity: "Perfil de cargo",
  recordType: "Perfil de cargo",
  documentName: "Perfil de cargo",
  kind: "historical",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const positions = await listQualityPositions(req.organizationId);
    // El identificador que llega es el del CARGO; el documento imprime todas
    // sus versiones, con su vigencia. Así una versión de 2025 se puede leer
    // tal como regía en 2025.
    const position = positions.find((p) => p.id === req.id);
    if (!position) return null;

    const [versions, org] = await Promise.all([
      listPositionVersions(req.organizationId, position.id),
      organizationIdentity(req.organizationId),
    ]);
    if (versions.length === 0) return null;

    const published = versions.filter((v) => v.status !== "draft");

    return {
      filenameParts: { recordType: "Perfil de cargo", title: position.name, code: position.code },
      document: {
        recordType: "Perfil de cargo",
        title: position.name,
        code: position.code,
        badges: published.length > 0
          ? [{ text: `${published.length} versión(es) del perfil`, tone: "info" }]
          : [{ text: "Sin perfil publicado", tone: "warn" }],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Cambiar el perfil de un cargo no reescribe el pasado. Cada versión conserva su "
            + "vigencia y sus requisitos: una evaluación de una fecha anterior se sigue "
            + "leyendo contra lo que se exigía entonces."
          )),
          ...versions.map((v) => section(
            `Versión ${v.versionNumber} · ${POSITION_VERSION_STATUS_LABEL[v.status]}`,
            fields([
              requiredField("Vigencia",
                v.effectiveFrom
                  ? `${formatDate(v.effectiveFrom)} → ${v.effectiveTo ? formatDate(v.effectiveTo) : "vigente"}`
                  : "Sin publicar"),
              field("Motivo del cambio", v.changeNote),
              field("Formación requerida", v.education),
              field("Experiencia requerida", v.experience),
            ]),
            paragraph(v.purpose),
            field("Alcance", v.scope) ? fields([field("Alcance", v.scope, true)], 1) : null,
            field("Autoridad", v.authority) ? fields([field("Autoridad", v.authority, true)], 1) : null,
            table(
              [{ header: "Tipo", width: 2 }, { header: "Función", width: 6 }],
              v.functions.map((f) => [POSITION_FUNCTION_KIND_LABEL[f.kind], f.description]),
              "Esta versión no detalla funciones."
            ),
            table(
              [
                { header: "Competencia exigida", width: 5 },
                { header: "Nivel", width: 1, align: "right" },
                { header: "Obligatoria", width: 2 },
              ],
              v.requirements.map((r) => [
                r.competencyName, String(r.requiredLevel), r.isMandatory ? "Sí" : "Deseable",
              ]),
              "Esta versión no exige competencias."
            ),
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

// ===========================================================================
// Personas
// ===========================================================================

export const qualityPersonList: ExportDefinition = {
  key: "quality.person.list",
  module: "quality",
  entity: "Persona",
  recordType: "Personas",
  documentName: "Listado de personas",
  kind: "list",
  permission: "governor",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata quién está vinculado hoy. La historia de cada persona —sus cargos, "
    + "sus competencias, sus fechas— va en su ficha, que sí conserva las vigencias.",
  filters: [
    {
      key: "status", label: "Estado", kind: "enum",
      values: ["active", "inactive", "former"],
    },
    { key: "search", label: "Búsqueda", kind: "text" },
  ],
  async load(req): Promise<ExportResult | null> {
    const [people, org] = await Promise.all([
      listPeople(req.organizationId, {
        status: req.filters.status, search: req.filters.search,
      }),
      organizationIdentity(req.organizationId),
    ]);
    const assignments = await listAssignments(req.organizationId);
    const today = todayIso();
    const currentByPerson = new Map<string, string[]>();
    for (const a of assignments) {
      if (!a.personId) continue;
      if (a.effectiveFrom > today) continue;
      if (a.effectiveTo !== null && a.effectiveTo < today) continue;
      const list = currentByPerson.get(a.personId) ?? [];
      list.push(a.positionName);
      currentByPerson.set(a.personId, list);
    }

    return {
      filenameParts: { recordType: "Personas", title: org.name },
      document: {
        recordType: "Personas",
        title: "Listado de personas",
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: [
          ...(req.filters.status
            ? [{ label: "Estado", value: PERSON_STATUS_LABEL[req.filters.status as never] ?? req.filters.status }]
            : []),
          ...(req.filters.search ? [{ label: "Búsqueda", value: req.filters.search }] : []),
        ],
        recordCount: people.length,
        sections: [
          section(null, currentStateNote(req.generatedAt), note(PRIVACY_NOTE)),
          section(null, table(
            [
              { header: "Persona", width: 4 },
              { header: "Código", width: 2 },
              { header: "Vínculo", width: 2 },
              { header: "Cargo(s) vigente(s)", width: 4 },
              { header: "Estado", width: 2 },
            ],
            // §63 · El listado NO lleva correo, ni fechas de vinculación, ni
            // notas. Que un dato esté en la base no es razón para imprimirlo:
            // quien necesite la ficha, abre la ficha.
            people.map((p) => [
              p.fullName, p.employeeCode ?? "—",
              PERSON_RELATIONSHIP_LABEL[p.relationship],
              (currentByPerson.get(p.id) ?? []).join(", ") || "—",
              PERSON_STATUS_LABEL[p.status],
            ]),
            "No hay personas registradas con ese criterio."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

export const qualityPersonDetail: ExportDefinition = {
  key: "quality.person.detail",
  module: "quality",
  entity: "Persona",
  recordType: "Persona",
  documentName: "Ficha de persona",
  kind: "detail",
  permission: "governor",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La ficha imprime la historia con sus fechas —cargos ocupados, competencia declarada, "
    + "evaluaciones— pero se compone en el momento de la descarga. Para una fotografía "
    + "fechada de la empresa existen los documentos históricos de cargos y competencias.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const file = await getPersonFile(req.organizationId, req.id);
    if (!file) return null;
    const org = await organizationIdentity(req.organizationId);
    const p = file.person;

    return {
      filenameParts: {
        recordType: "Persona", title: p.fullName, code: p.employeeCode,
      },
      document: {
        recordType: "Persona",
        title: p.fullName,
        code: p.employeeCode,
        badges: [
          { text: PERSON_STATUS_LABEL[p.status], tone: p.status === "active" ? "good" : "neutral" },
          { text: PERSON_RELATIONSHIP_LABEL[p.relationship], tone: "info" },
          // PC-05 · Se dice en el papel, porque es la confusión más frecuente:
          // no todo el mundo que trabaja tiene cuenta, y no pasa nada.
          { text: p.profileId ? "Con cuenta de Trazaloop" : "Sin cuenta de Trazaloop", tone: "neutral" },
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(PRIVACY_NOTE)),
          section("Datos del sistema de gestión", fields([
            requiredField("Nombre", p.fullName),
            field("Código interno", p.employeeCode),
            field("Correo laboral", p.workEmail),
            requiredField("Vínculo", PERSON_RELATIONSHIP_LABEL[p.relationship]),
            field("Vinculación", p.joinedOn ? formatDate(p.joinedOn) : null),
            field("Desvinculación", p.leftOn ? formatDate(p.leftOn) : null),
          ])),
          section("Cargos ocupados", table(
            [
              { header: "Cargo", width: 4 },
              { header: "Vínculo", width: 2 },
              { header: "Desde", width: 2 },
              { header: "Hasta", width: 2 },
            ],
            file.assignments.map((a) => [
              a.positionName, ASSIGNMENT_TYPE_LABEL[a.assignmentType],
              formatDate(a.effectiveFrom),
              a.effectiveTo ? formatDate(a.effectiveTo) : "Vigente",
            ]),
            "Esta persona no tiene cargos asignados."
          )),
          section("Competencia demostrada", table(
            [
              { header: "Competencia", width: 4 },
              { header: "Nivel", width: 1, align: "right" },
              { header: "Método", width: 3 },
              { header: "Evaluada", width: 2 },
              { header: "Estado", width: 2 },
            ],
            file.competencies.map((c) => [
              c.competencyName, String(c.demonstratedLevel),
              COMPETENCE_METHOD_LABEL[c.method], formatDate(c.assessedOn),
              PERSON_COMPETENCE_STATUS_LABEL[c.status],
            ]),
            "Todavía no se ha declarado competencia demostrada."
          )),
          section("Evidencia", table(
            [
              { header: "Competencia", width: 3 },
              { header: "Evidencia", width: 3 },
              { header: "Emisor", width: 2 },
              { header: "Vence", width: 2 },
              { header: "Estado", width: 2 },
            ],
            file.competencies.flatMap((c) => c.evidence.map((e) => [
              c.competencyName, e.title, e.issuer ?? "—",
              e.expiresOn ? formatDate(e.expiresOn) : "No vence",
              EVIDENCE_STATUS_LABEL[e.status],
            ])),
            "Sin evidencia registrada."
          ), note(
            // PC-24 · La frase entera va en el papel: una evidencia vencida en
            // una ficha impresa es exactamente donde alguien deduce lo que no
            // debe deducir.
            "Una evidencia vencida pide revisión. No significa por sí sola que la persona "
            + "haya dejado de ser competente: esa es una decisión aparte, de una persona."
          )),
          section("Desarrollo", table(
            [
              { header: "Necesidad", width: 5 },
              { header: "Origen", width: 3 },
              { header: "Estado", width: 2 },
            ],
            file.needs.map((n) => [n.title, n.origin, n.status]),
            "Sin necesidades de desarrollo registradas."
          )),
          section("Formación y aprendizaje", table(
            [
              { header: "Actividad", width: 4 },
              { header: "Asistencia", width: 2 },
              { header: "Aprendizaje", width: 3 },
            ],
            file.participations.map((x) => [
              x.activityTitle, x.participant.attendance, x.participant.learningResult,
            ]),
            "Sin participaciones registradas."
          ), note(
            "Asistir no es aprender, y aprobar una evaluación de aprendizaje no es ser "
            + "competente. Son registros distintos a propósito."
          )),
          section("Conocimiento que sostiene", table(
            [
              { header: "Conocimiento", width: 5 },
              { header: "Criticidad", width: 2 },
              { header: "Papel", width: 2 },
            ],
            file.knowledge.map((k) => [
              k.title, CRITICALITY_LABEL[k.criticality],
              k.isPrimaryHolder
                ? `${HOLDER_LEVEL_LABEL[k.holderLevel]} · responde primero`
                : HOLDER_LEVEL_LABEL[k.holderLevel],
            ]),
            "No figura como holder de ningún conocimiento registrado."
          ), note(
            "La persona SOSTIENE el conocimiento; no es su dueña. El conocimiento pertenece "
            + "a la empresa."
          )),
          // §63 · Si quien descarga no puede ver evaluaciones, esta lista llega
          // vacía por RLS y la sección lo dice. No se filtra en el papel algo
          // que la base ya decidió no entregar.
          section("Evaluaciones de desempeño", table(
            [
              { header: "Ciclo", width: 3 },
              { header: "Fecha", width: 2 },
              { header: "Evaluador", width: 3 },
              { header: "Estado", width: 2 },
            ],
            file.evaluations.map((e) => [
              e.cycleName, e.evaluatedOn ? formatDate(e.evaluatedOn) : "—",
              e.evaluatorName ?? "—", e.status,
            ]),
            "Sin evaluaciones de desempeño visibles para quien genera este documento."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

// ===========================================================================
// Competencia
// ===========================================================================

export const qualityCompetencyList: ExportDefinition = {
  key: "quality.competency.list",
  module: "quality",
  entity: "Competencia",
  recordType: "Competencias",
  documentName: "Listado de competencias",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El catálogo retrata las competencias vigentes. Lo que sí conserva historia es el "
    + "requisito: vive en la versión del perfil de cargo que lo exigía.",
  async load(req): Promise<ExportResult | null> {
    const [competencies, levels, org] = await Promise.all([
      listCompetencies(req.organizationId),
      listCompetencyLevels(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: { recordType: "Competencias", title: org.name },
      document: {
        recordType: "Competencias",
        title: "Catálogo de competencias",
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        recordCount: competencies.length,
        sections: [
          section(null, currentStateNote(req.generatedAt)),
          section("Escala de niveles", table(
            [
              { header: "Nivel", width: 1, align: "right" },
              { header: "Nombre", width: 3 },
              { header: "Qué significa", width: 6 },
            ],
            levels.map((l) => [String(l.value), l.label, l.description ?? "—"]),
            "Esta empresa todavía no ha definido su escala de niveles."
          )),
          section("Competencias", table(
            [
              { header: "Competencia", width: 4 },
              { header: "Código", width: 2 },
              { header: "Categoría", width: 2 },
              { header: "Estado", width: 2 },
            ],
            competencies.map((c) => [
              c.name, c.code ?? "—", c.category ?? "—", c.isActive ? "Activa" : "Inactiva",
            ]),
            "Sin competencias en el catálogo."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

export const qualityCompetencyDetail: ExportDefinition = {
  key: "quality.competency.detail",
  module: "quality",
  entity: "Competencia",
  recordType: "Competencia",
  documentName: "Ficha de competencia",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La ficha describe la competencia tal como está definida hoy. Quién la exigía y en qué "
    + "nivel en una fecha pasada se lee en la versión del perfil de cargo correspondiente.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const competencies = await listCompetencies(req.organizationId);
    const c = competencies.find((x) => x.id === req.id);
    if (!c) return null;

    const [matrix, levels, org] = await Promise.all([
      getCompetenceMatrix(req.organizationId),
      listCompetencyLevels(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const rows = matrix.filter((m) => m.competencyId === c.id);

    return {
      filenameParts: { recordType: "Competencia", title: c.name, code: c.code },
      document: {
        recordType: "Competencia",
        title: c.name,
        code: c.code,
        badges: [{ text: c.isActive ? "Activa" : "Inactiva", tone: c.isActive ? "good" : "neutral" }],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, currentStateNote(req.generatedAt)),
          section("Definición", fields([
            requiredField("Nombre", c.name),
            field("Código", c.code),
            field("Categoría", c.category),
          ]), paragraph(c.description)),
          section("Escala vigente", table(
            [
              { header: "Nivel", width: 1, align: "right" },
              { header: "Nombre", width: 3 },
              { header: "Qué significa", width: 6 },
            ],
            levels.map((l) => [String(l.value), l.label, l.description ?? "—"]),
            "Sin escala definida."
          )),
          section("Dónde se exige y quién la demuestra", table(
            [
              { header: "Cargo", width: 3 },
              { header: "Persona", width: 3 },
              { header: "Exigido", width: 1, align: "right" },
              { header: "Demostrado", width: 1, align: "right" },
              { header: "Brecha", width: 1, align: "right" },
            ],
            rows.map((r) => [
              r.positionName, r.personName, String(r.requiredLevel),
              r.demonstratedLevel === null ? "—" : String(r.demonstratedLevel),
              r.gap === 0 ? "—" : String(r.gap),
            ]),
            "Ningún cargo vigente exige esta competencia todavía."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

/**
 * §65 · La matriz.
 *
 * Distingue visualmente requerido, demostrado, brecha y estado de la
 * evidencia, en columnas separadas. Lo que NO hace: sumar, promediar ni
 * ordenar personas por brecha. Se ordena por nombre, que es como se busca a
 * alguien, no como se le puntúa.
 */
export const qualityCompetenceMatrixDetail: ExportDefinition = {
  key: "quality.competence-matrix.detail",
  module: "quality",
  entity: "Matriz de competencias",
  recordType: "Matriz de competencias",
  documentName: "Matriz de competencias",
  kind: "list",
  permission: "governor",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "La matriz vigente cruza los requisitos publicados hoy con la competencia demostrada "
    + "hoy. Para una fecha pasada existe «Matriz de competencias en una fecha», que lee el "
    + "requisito que regía entonces.",
  async load(req): Promise<ExportResult | null> {
    const [matrix, org] = await Promise.all([
      getCompetenceMatrix(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: { recordType: "Matriz de competencias", title: org.name },
      document: {
        recordType: "Matriz de competencias",
        title: "Matriz de competencias",
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        recordCount: matrix.length,
        sections: [
          section(null,
            currentStateNote(req.generatedAt),
            note(
              "Una brecha es la diferencia entre el nivel exigido por el cargo y el nivel "
              + "demostrado. No es una calificación de la persona, y este documento no "
              + "ordena, suma ni promedia personas."
            ),
            note(PRIVACY_NOTE)),
          section(null, table(
            [
              { header: "Persona", width: 3 },
              { header: "Cargo", width: 3 },
              { header: "Competencia", width: 3 },
              { header: "Exigido", width: 1, align: "right" },
              { header: "Demostrado", width: 1, align: "right" },
              { header: "Brecha", width: 1, align: "right" },
              { header: "Evidencia", width: 2 },
            ],
            matrix.map((m) => [
              m.personName, m.positionName, m.competencyName,
              String(m.requiredLevel),
              m.demonstratedLevel === null ? "Sin evaluar" : String(m.demonstratedLevel),
              m.gap === 0 ? "Sin brecha" : String(m.gap),
              m.evidenceStatus === "valid" ? "Vigente"
                : m.evidenceStatus === "expired" ? "Vencida · revisar" : "Sin evidencia",
            ]),
            "Todavía no hay cargos con perfil publicado y personas asignadas."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

/**
 * PC-23 en papel.
 *
 * La misma matriz, en una FECHA. El nivel exigido sale de la versión del
 * perfil que regía entonces y el demostrado de la evaluación vigente entonces.
 * Subir hoy un requisito no cambia este documento.
 */
export const qualityCompetenceMatrixHistorical: ExportDefinition = {
  key: "quality.competence-matrix.historical",
  module: "quality",
  entity: "Matriz de competencias",
  recordType: "Matriz de competencias",
  documentName: "Matriz de competencias en una fecha",
  kind: "historical",
  permission: "governor",
  orientation: "landscape",
  temporality: "historical",
  filters: [{ key: "date", label: "Fecha", kind: "date" }],
  async load(req): Promise<ExportResult | null> {
    const on = req.filters.date ?? todayIso();
    const [positions, people, competencies, org] = await Promise.all([
      listQualityPositions(req.organizationId),
      listPeople(req.organizationId),
      listCompetencies(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);

    const rows: string[][] = [];
    for (const position of positions) {
      const holders = await positionHoldersOn(req.organizationId, position.id, on);
      if (holders.length === 0) continue;
      for (const competency of competencies) {
        const required = await requiredLevelOn(
          req.organizationId, position.id, competency.id, on
        );
        if (required === null) continue;
        for (const h of holders) {
          if (!h.personId) continue;
          const demonstrated = await demonstratedLevelOn(
            req.organizationId, h.personId, competency.id, on
          );
          rows.push([
            h.personName ?? people.find((p) => p.id === h.personId)?.fullName ?? "—",
            position.name, competency.name,
            String(required),
            demonstrated === null ? "Sin evaluar" : String(demonstrated),
            competenceGap(required, demonstrated) === 0
              ? "Sin brecha"
              : String(competenceGap(required, demonstrated)),
          ]);
        }
      }
    }

    return {
      filenameParts: {
        recordType: "Matriz de competencias", title: `al ${formatDate(on)}`, stamp: on,
      },
      document: {
        recordType: "Matriz de competencias",
        title: `Matriz de competencias al ${formatDate(on)}`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: [{ label: "Fecha", value: formatDate(on) }],
        recordCount: rows.length,
        sections: [
          section(null, note(
            "El nivel exigido es el de la versión del perfil de cargo que regía en esa fecha, "
            + "y el demostrado es la evaluación vigente entonces. Cambiar hoy un requisito no "
            + "cambia lo que se exigía ese día."
          ), note(PRIVACY_NOTE)),
          section(null, table(
            [
              { header: "Persona", width: 3 },
              { header: "Cargo", width: 3 },
              { header: "Competencia", width: 3 },
              { header: "Exigido entonces", width: 2, align: "right" },
              { header: "Demostrado entonces", width: 2, align: "right" },
              { header: "Brecha", width: 1, align: "right" },
            ],
            rows,
            "En esa fecha no había cargos con perfil publicado y titulares asignados."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

export const qualityPersonCompetenceDetail: ExportDefinition = {
  key: "quality.person-competence.detail",
  module: "quality",
  entity: "Competencia demostrada",
  recordType: "Evaluación de competencia",
  documentName: "Evaluación de competencia",
  kind: "detail",
  permission: "governor",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    // El identificador es el de la PERSONA: el documento imprime todas sus
    // decisiones de competencia, incluidas las sustituidas. Una decisión sola
    // fuera de su cadena no se puede juzgar.
    const file = await getPersonFile(req.organizationId, req.id);
    if (!file) return null;
    const org = await organizationIdentity(req.organizationId);
    const today = todayIso();

    return {
      filenameParts: {
        recordType: "Evaluación de competencia", title: file.person.fullName,
        code: file.person.employeeCode,
      },
      document: {
        recordType: "Evaluación de competencia",
        title: file.person.fullName,
        code: file.person.employeeCode,
        subtitle: "Historial de decisiones de competencia",
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(PRIVACY_NOTE), note(
            "Cada decisión conserva su fecha, su método y su fundamento. Una decisión nueva "
            + "SUSTITUYE a la anterior sin borrarla: lo que se declaró entonces sigue "
            + "diciendo lo que decía."
          )),
          ...file.competencies.map((c) => section(
            `${c.competencyName} · nivel ${c.demonstratedLevel} · ${PERSON_COMPETENCE_STATUS_LABEL[c.status]}`,
            fields([
              requiredField("Evaluada el", formatDate(c.assessedOn)),
              requiredField("Método", COMPETENCE_METHOD_LABEL[c.method]),
              field("Vigente hasta", c.validUntil ? formatDate(c.validUntil) : "Sin fecha límite"),
            ]),
            paragraph(c.rationale),
            table(
              [
                { header: "Evidencia", width: 3 },
                { header: "Emisor", width: 2 },
                { header: "Emitida", width: 2 },
                { header: "Situación", width: 4 },
              ],
              c.evidence.map((e) => [
                e.title, e.issuer ?? "—",
                e.issuedOn ? formatDate(e.issuedOn) : "—",
                describeEvidenceExpiry({ status: e.status, expiresOn: e.expiresOn }, today),
              ]),
              "Sin evidencia asociada a esta decisión."
            ),
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};
