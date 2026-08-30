import "server-only";

import {
  customerViewOf, getAssessment, getStakeholderDetail, getSummary,
  listPeripheralRefs, listStrategies, monitoringForAssessments,
  resolvePeripheralLabels, searchAssessments, supplierViewOf,
} from "@/lib/db/quality-interested-parties";
import {
  ENTRY_KIND_LABEL, LINK_KIND_LABEL, MONITORING_METHOD_LABEL,
  PERIPHERAL_REF_LABEL, PRIORITY_LABEL_TEXT, RELATION_LABEL, RELEVANCE_LABEL,
  REQUIREMENT_KIND_LABEL, REVIEW_STATE_LABEL, REVIEW_VERDICT_LABEL,
  STRATEGY_SCOPE_LABEL, STRATEGY_STATUS_LABEL, SUBJECT_KIND_LABEL,
  priorityView, strategyScope, today,
  type EntryKind, type LinkKind, type MonitoringMethod, type PeripheralRefKind,
  type PriorityLabel, type RelevanceState, type RequirementKind,
  type ReviewVerdict, type StrategyStatus, type SubjectKind,
} from "@/lib/domain/quality-interested-parties";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  currentStateNote, fields, note, requiredField, section, table,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * Trazaloop · QUALITY-12.3B3B · Las partes interesadas, en papel.
 *
 * TRES DOCUMENTOS Y NINGÚN MOTOR NUEVO
 *
 * Se declaran en el registro cerrado de EXPORT-01 y los dibuja el mismo
 * renderizador que el resto de la plataforma: misma cabecera corporativa,
 * mismo pie, mismo sello de generación. Aquí solo se describe QUÉ va dentro.
 *
 * LA DISTINCIÓN QUE JUSTIFICA QUE SEAN DOS INFORMES Y NO UNO CON UN FILTRO
 *
 *   · El informe **actual** dice lo que rige hoy y lo declara: `current`.
 *   · El informe **al [fecha]** reconstruye lo que regía ese día y es
 *     `historical`, porque el dominio SÍ guarda su pasado —análisis con
 *     vigencia, requisitos con vigencia, estrategias con vigencia— y puede
 *     imprimirlo sin inventar nada.
 *
 * Un solo informe con un filtro de fecha tendría que declarar UNA temporalidad
 * para las dos cosas, y cualquiera de las dos sería mentira la mitad del
 * tiempo. Por eso son dos claves distintas.
 */

const SYSTEM = "Trazaloop Quality · partes interesadas";
const FOOTER =
  "Lo que este documento recoge es lo que la empresa ha registrado y decidido. "
  + "No acredita conformidad con ninguna norma por sí solo.";

const fecha = (v: string | null | undefined) => (v && v.length >= 10 ? v : "—");

function prioridadTexto(a: {
  priorityLabel: string | null; priorityScore: number | null; priorityMethodNote: string | null;
}): string {
  const v = priorityView(a);
  if (v.kind === "none") return "Sin prioridad";
  if (v.kind === "qualitative") return PRIORITY_LABEL_TEXT[v.label as PriorityLabel];
  // Un número JAMÁS sin su metodología: en papel es todavía más importante,
  // porque el papel se firma y se entrega.
  return `${v.score} · ${v.method}`;
}

// ===========================================================================
// 1 · LA FICHA DE UNA PARTE INTERESADA
// ===========================================================================

export const qualityInterestedPartyDetail: ExportDefinition = {
  key: "quality.interested-party.detail",
  module: "quality",
  entity: "Parte interesada",
  recordType: "Parte interesada",
  documentName: "Ficha de parte interesada",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La ficha imprime el análisis VIGENTE con su historia al lado. Para "
    + "reconstruir un día concreto está «Partes interesadas al [fecha]», que sí "
    + "es un documento histórico.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const ancla = await getAssessment(req.organizationId, req.id);
    if (!ancla) return null;

    const detalle = await getStakeholderDetail(
      req.organizationId,
      { kind: ancla.subjectKind, id: ancla.subjectId, categoryId: ancla.categoryId },
      {},
    );
    const a = detalle.assessment ?? ancla;

    const [org, estrategias, refs, cliente, proveedor] = await Promise.all([
      organizationIdentity(req.organizationId),
      listStrategies(req.organizationId, a.id, { includeEnded: true }),
      listPeripheralRefs(req.organizationId, "stakeholder_assessment", a.id),
      a.subjectKind === "external_party"
        ? customerViewOf(req.organizationId, a.subjectId) : Promise.resolve(null),
      a.subjectKind === "external_party"
        ? supplierViewOf(req.organizationId, a.subjectId) : Promise.resolve(null),
    ]);
    const etiquetas = await resolvePeripheralLabels(req.organizationId, refs);

    const entradas = (k: EntryKind) => detalle.requirements.filter((r) => r.entryKind === k);
    const filasEntrada = (k: EntryKind) => entradas(k).map((r) => [
      r.title,
      r.entryKind === "requirement" && r.requirementKind
        ? REQUIREMENT_KIND_LABEL[r.requirementKind as RequirementKind] ?? r.requirementKind
        : "—",
      RELEVANCE_LABEL[r.relevanceStatus],
      r.effectiveTo ? `${fecha(r.effectiveFrom)} → ${fecha(r.effectiveTo)}` : fecha(r.effectiveFrom),
    ]);

    return {
      filenameParts: { recordType: "Parte-interesada", title: a.subjectLabel },
      document: {
        recordType: "Parte interesada",
        title: a.subjectLabel,
        subtitle: `${SUBJECT_KIND_LABEL[a.subjectKind as SubjectKind]} · `
          + `${a.categoryName ?? "Sin categoría"}`,
        badges: [
          { text: RELEVANCE_LABEL[a.relevanceStatus as RelevanceState],
            tone: a.relevanceStatus === "relevant" ? "good"
              : a.relevanceStatus === "not_relevant" ? "neutral" : "warn" },
        ],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("El análisis vigente",
            fields([
              requiredField("Pertinencia", RELEVANCE_LABEL[a.relevanceStatus as RelevanceState]),
              requiredField("Analizada el", fecha(a.assessedOn)),
              requiredField("Prioridad", prioridadTexto(a)),
              requiredField("Vigente desde", fecha(a.effectiveFrom)),
            ], 2),
            a.relevanceRationale
              ? { type: "fields", items: [
                  { label: "Justificación", value: a.relevanceRationale, wide: true }] }
              : null,
            a.summary
              ? { type: "fields", items: [{ label: "Resumen", value: a.summary, wide: true }] }
              : null,
          ),

          section("Necesidades", table(
            [{ header: "Enunciado", width: 5 }, { header: "Tipo", width: 2 },
             { header: "Pertinencia", width: 2 }, { header: "Vigencia", width: 3 }],
            filasEntrada("need"), "Sin necesidades registradas.")),
          section("Expectativas", table(
            [{ header: "Enunciado", width: 5 }, { header: "Tipo", width: 2 },
             { header: "Pertinencia", width: 2 }, { header: "Vigencia", width: 3 }],
            filasEntrada("expectation"), "Sin expectativas registradas.")),
          section("Requisitos", table(
            [{ header: "Enunciado", width: 5 }, { header: "Tipo", width: 2 },
             { header: "Pertinencia", width: 2 }, { header: "Vigencia", width: 3 }],
            filasEntrada("requirement"), "Sin requisitos registrados.")),

          section("Procesos que los atienden", table(
            [{ header: "Requisito", width: 5 }, { header: "Proceso", width: 3 },
             { header: "Relación", width: 2 }, { header: "Desde", width: 2 }],
            detalle.processLinks.map((l) => [
              detalle.requirements.find((r) => r.id === l.requirementId)?.title ?? "—",
              l.processName ?? "—",
              LINK_KIND_LABEL[l.linkKind as LinkKind],
              fecha(l.effectiveFrom),
            ]),
            "Ningún requisito está relacionado todavía con un proceso.")),

          section("Estrategias", table(
            [{ header: "Estrategia", width: 4 }, { header: "Alcance", width: 3 },
             { header: "Responsable", width: 2 }, { header: "Seguimiento", width: 2 },
             { header: "Revisión", width: 2 }],
            estrategias.map((s) => [
              `${s.title}${s.effectiveTo ? ` (cerrada el ${fecha(s.effectiveTo)})` : ""}`,
              `${STRATEGY_SCOPE_LABEL[strategyScope(s.requirementIds.length)]}`
                + ` · ${STRATEGY_STATUS_LABEL[s.status as StrategyStatus] ?? s.status}`,
              s.ownerPositionName ?? "Sin asignar",
              s.monitoringMethod
                ? MONITORING_METHOD_LABEL[s.monitoringMethod as MonitoringMethod]
                  ?? s.monitoringMethod
                : "Sin definir",
              REVIEW_STATE_LABEL[s.reviewState],
            ]),
            "No hay ninguna estrategia registrada.")),

          section("Revisiones", table(
            [{ header: "Fecha", width: 2 }, { header: "Resultado", width: 3 },
             { header: "Notas", width: 5 }, { header: "Próxima", width: 2 }],
            detalle.reviews.map((r) => [
              fecha(r.reviewedOn),
              REVIEW_VERDICT_LABEL[r.verdict as ReviewVerdict] ?? r.verdict,
              r.note ?? "—",
              fecha(r.nextReviewOn),
            ]),
            "Todavía no se ha registrado ninguna revisión.")),

          section("Historia del análisis", table(
            [{ header: "Vigencia", width: 4 }, { header: "Estado", width: 2 },
             { header: "Pertinencia", width: 2 }, { header: "Justificación", width: 5 }],
            detalle.history.map((h) => [
              h.effectiveTo
                ? `${fecha(h.effectiveFrom)} → ${fecha(h.effectiveTo)}`
                : `Desde ${fecha(h.effectiveFrom)}`,
              h.effectiveTo === null ? "Vigente"
                : h.status === "superseded" ? "Sucedido" : "Cerrado",
              RELEVANCE_LABEL[h.relevanceStatus as RelevanceState],
              h.relevanceRationale ?? "—",
            ]),
            "Una sola lectura registrada.")),

          ...(refs.length > 0 ? [section("Relacionado", table(
            [{ header: "Tipo", width: 3 }, { header: "Registro", width: 5 },
             { header: "Relación", width: 3 }],
            refs.map((r) => [
              PERIPHERAL_REF_LABEL[r.refKind as PeripheralRefKind] ?? "Registro",
              etiquetas.get(`${r.refKind}:${r.refId}`) ?? "Sin nombre",
              RELATION_LABEL[r.relation],
            ]),
            "Sin registros relacionados."))] : []),

          ...(cliente || proveedor ? [section("En otros módulos",
            note(
              "Es la misma empresa, no una copia. El detalle vive en su módulo."
              + (cliente
                ? ` En Voz del cliente: relación ${cliente.relationshipStatus}`
                  + `${cliente.lastFeedbackOn ? `, última retroalimentación el ${cliente.lastFeedbackOn}` : ""}.`
                : "")
              + (proveedor
                ? ` En Proveedores: relación ${proveedor.relationshipStatus}`
                  + `${proveedor.lastEvaluatedOn ? `, última evaluación el ${proveedor.lastEvaluatedOn}` : ", sin evaluación cerrada"}.`
                : "")
            ))] : []),

          section(null, currentStateNote(req.generatedAt)),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

// ===========================================================================
// 2 · EL INFORME DE PARTES INTERESADAS · lo que rige hoy
// ===========================================================================

export const qualityInterestedPartyList: ExportDefinition = {
  key: "quality.interested-party.list",
  module: "quality",
  entity: "Parte interesada",
  recordType: "Partes interesadas",
  // «Reporte» y no «Informe»: la plataforma exige que un listado se llame
  // Listado, Lista maestra, Maestro o Reporte, y hay una prueba que lo vigila.
  // Sesenta documentos con la misma convención valen más que uno con el
  // nombre que a este dominio le sonaba mejor.
  documentName: "Reporte de partes interesadas",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "Este reporte recoge el estado vigente. La reconstrucción de una fecha "
    + "concreta tiene su propio documento: «Partes interesadas al [fecha]».",
  filters: [
    { key: "pertinencia", label: "Pertinencia", kind: "enum",
      values: ["relevant", "not_relevant", "under_review"] },
    { key: "tipo", label: "Tipo de sujeto", kind: "enum",
      values: ["external_party", "group"] },
  ],
  async load(req): Promise<ExportResult | null> {
    const org = await organizationIdentity(req.organizationId);
    const resumen = await getSummary(req.organizationId);

    // §13 · Sobre 1 000 filas se pagina hasta agotar: un informe que corta en
    // mil y no lo dice es peor que uno que no se genera.
    const filas: string[][] = [];
    let page = 1;
    for (;;) {
      const p = await searchAssessments(req.organizationId, {
        page: String(page), pageSize: 200,
        relevance: req.filters.pertinencia as RelevanceState | undefined,
        subjectKind: req.filters.tipo as SubjectKind | undefined,
      });
      if (p.rows.length === 0) break;
      const seguimiento = await monitoringForAssessments(
        req.organizationId, p.rows.map((r) => r.id));
      for (const r of p.rows) {
        const m = seguimiento.get(r.id);
        filas.push([
          r.subjectLabel,
          SUBJECT_KIND_LABEL[r.subjectKind as SubjectKind],
          r.categoryName ?? "—",
          RELEVANCE_LABEL[r.relevanceStatus as RelevanceState],
          prioridadTexto(r),
          m && m.activeStrategies > 0 ? String(m.activeStrategies) : "0",
          m?.reviewState ? REVIEW_STATE_LABEL[m.reviewState] : "Sin estrategia",
        ]);
      }
      if (page * p.pageSize >= p.total) break;
      page += 1;
    }

    const aplicados = [
      req.filters.pertinencia
        ? { label: "Pertinencia",
            value: RELEVANCE_LABEL[req.filters.pertinencia as RelevanceState] }
        : null,
      req.filters.tipo
        ? { label: "Tipo", value: SUBJECT_KIND_LABEL[req.filters.tipo as SubjectKind] }
        : null,
    ].filter(Boolean) as { label: string; value: string }[];

    return {
      filenameParts: { recordType: "Partes-interesadas", title: "informe" },
      document: {
        recordType: "Partes interesadas",
        title: "Reporte de partes interesadas",
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: aplicados,
        recordCount: filas.length,
        sections: [
          section("Resumen", fields([
            requiredField("Pertinentes", String(resumen.relevant)),
            requiredField("En evaluación", String(resumen.underReview)),
            requiredField("Requisitos pertinentes", String(resumen.requirements)),
            requiredField("Estrategias vigentes", String(resumen.strategiesActive)),
            requiredField("Revisiones vencidas", String(resumen.strategiesOverdue)),
            requiredField("Pertinentes sin estrategia", String(resumen.relevantWithoutStrategy)),
          ], 3)),
          section(null, table(
            [{ header: "Parte interesada", width: 4 }, { header: "Tipo", width: 2 },
             { header: "Categoría", width: 2 }, { header: "Pertinencia", width: 2 },
             { header: "Prioridad", width: 3 }, { header: "Estrategias", width: 1 },
             { header: "Revisión", width: 2 }],
            filas, "No hay ninguna parte interesada analizada.")),
          section(null, currentStateNote(req.generatedAt)),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

// ===========================================================================
// 3 · EL INFORME AL [FECHA] · lo que regía ese día
// ===========================================================================

export const qualityInterestedPartyHistorical: ExportDefinition = {
  key: "quality.interested-party.historical",
  module: "quality",
  entity: "Parte interesada",
  recordType: "Partes interesadas",
  documentName: "Partes interesadas en una fecha",
  kind: "historical",
  permission: "member",
  orientation: "landscape",
  temporality: "historical",
  filters: [{ key: "date", label: "Fecha", kind: "date" }],
  async load(req): Promise<ExportResult | null> {
    const corte = req.filters.date ?? today();
    const org = await organizationIdentity(req.organizationId);

    // TODO lo que sigue se lee CON la fecha. Ni una consulta al presente:
    // rellenar un hueco del pasado con un dato de hoy convierte el documento
    // en una afirmación falsa con formato de prueba.
    const filas: string[][] = [];
    const detalle: string[][] = [];
    let page = 1;
    for (;;) {
      const p = await searchAssessments(req.organizationId, {
        page: String(page), pageSize: 200, asOf: corte,
      });
      if (p.rows.length === 0) break;
      for (const a of p.rows) {
        const d = await getStakeholderDetail(
          req.organizationId,
          { kind: a.subjectKind, id: a.subjectId, categoryId: a.categoryId },
          { asOf: corte },
        );
        const reqs = d.requirements.filter((r) => r.entryKind === "requirement");
        filas.push([
          a.subjectLabel,
          SUBJECT_KIND_LABEL[a.subjectKind as SubjectKind],
          a.categoryName ?? "—",
          RELEVANCE_LABEL[a.relevanceStatus as RelevanceState],
          prioridadTexto(a),
          String(reqs.length),
          String(d.strategies.length),
        ]);
        for (const r of reqs) {
          detalle.push([
            a.subjectLabel,
            r.title,
            r.requirementKind
              ? REQUIREMENT_KIND_LABEL[r.requirementKind as RequirementKind] ?? r.requirementKind
              : "—",
            RELEVANCE_LABEL[r.relevanceStatus as RelevanceState],
            String(d.processLinks.filter((l) => l.requirementId === r.id).length),
          ]);
        }
        for (const s of d.strategies) {
          detalle.push([
            a.subjectLabel,
            `Estrategia: ${s.title}`,
            STRATEGY_SCOPE_LABEL[strategyScope(s.requirementIds.length)],
            s.ownerPositionName ?? "Sin asignar",
            s.monitoringMethod
              ? MONITORING_METHOD_LABEL[s.monitoringMethod as MonitoringMethod]
                ?? s.monitoringMethod
              : "Sin definir",
          ]);
        }
      }
      if (page * p.pageSize >= p.total) break;
      page += 1;
    }

    return {
      filenameParts: {
        recordType: "Partes-interesadas", title: `al ${corte}`, stamp: corte,
      },
      document: {
        recordType: "Partes interesadas",
        title: `Partes interesadas al ${corte}`,
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: [{ label: "Estado al", value: corte }],
        recordCount: filas.length,
        sections: [
          section(null, note(
            `Estado al ${corte}. Reconstruido con los análisis, los requisitos y las `
            + "estrategias que estaban VIGENTES ese día: lo que se registró después no "
            + "aparece, y ningún hueco se ha rellenado con datos de hoy."
          )),
          section("Partes interesadas", table(
            [{ header: "Parte interesada", width: 4 }, { header: "Tipo", width: 2 },
             { header: "Categoría", width: 2 }, { header: "Pertinencia", width: 2 },
             { header: "Prioridad", width: 3 }, { header: "Requisitos", width: 1 },
             { header: "Estrategias", width: 1 }],
            filas, `Ese día no había ninguna parte interesada analizada.`)),
          section("Requisitos y estrategias de esa fecha", table(
            [{ header: "Parte interesada", width: 3 }, { header: "Registro", width: 4 },
             { header: "Tipo / alcance", width: 3 }, { header: "Pertinencia / responsable", width: 3 },
             { header: "Procesos / seguimiento", width: 2 }],
            detalle, "Ese día no había requisitos ni estrategias vigentes.")),
        ],
        footerNote: FOOTER,
      },
    };
  },
};
