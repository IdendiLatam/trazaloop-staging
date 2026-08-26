import "server-only";

import {
  getAction, getCase, listActionContexts, listActionHistory, listAllActions,
  listVerifications,
} from "@/lib/db/work-cases";
import { getControl, getRiskAssessment, listControls, listRisks } from "@/lib/db/risks";
import { listPeriodClosures } from "@/lib/db/quality-indicators";
import {
  ACTION_KIND_LABEL, ACTION_STATUS_LABEL, EFFECTIVENESS_LABEL, PRIORITY_LABEL,
  REFERENCE_KIND_LABEL, describeDecision,
} from "@/lib/domain/work-cases";
import {
  ASSESSMENT_KIND_LABEL, CONTROL_NATURE_LABEL, CONTROL_STATUS_LABEL,
  DESIGN_VERDICT_LABEL, EFFECTIVENESS_VERDICT_LABEL, IMPLEMENTATION_VERDICT_LABEL,
  OPERATION_MODE_LABEL, RISK_STATUS_LABEL,
} from "@/lib/domain/risks";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  currentStateNote, fields, note, paragraph, requiredField, section, table, timeline,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * EXPORT-01.1 · Los objetos de Quality que tenían identidad propia y no tenían
 * papel propio: la acción, el control, la evaluación de riesgo.
 *
 * Los tres se imprimían DENTRO del PDF de su padre. Eso basta para leerlos, y
 * no basta para lo que la gente hace de verdad con ellos: llevar UNA acción a
 * una reunión, entregar UN control a un auditor, adjuntar UNA evaluación a un
 * expediente. Una entidad con identidad de negocio necesita poder salir sola.
 */
const SYSTEM_WORK = "Trazaloop Quality · acciones";
const SYSTEM_RISK = "Trazaloop Quality · riesgos y controles";
const SYSTEM_PERF = "Trazaloop Quality · desempeño";

const day = (v: string | null | undefined): string => (v ? v.slice(0, 10) : "—");

/* -------------------------------------------------------------------------
 * Acción · ficha propia y transversal (§11, §12, §47)
 * ---------------------------------------------------------------------- */

/**
 * UNA definición para acciones de cualquier origen.
 *
 * MDR-46 dice que la acción es transversal, y §47 pide que se demuestre: la
 * misma clave exporta la acción que nació de un caso y la que nació de un
 * riesgo. Dos exportadores distintos habrían convertido una diferencia de
 * CONTEXTO en una diferencia de MOTOR, que es exactamente lo que EXPORT-01
 * vino a evitar.
 */
export const qualityActionDetail: ExportDefinition = {
  key: "quality.action.detail",
  module: "quality",
  entity: "Acción",
  recordType: "Acción",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const action = await getAction(req.organizationId, req.id);
    if (!action) return null;

    const [contexts, history, verifications, org] = await Promise.all([
      listActionContexts(req.organizationId, action.id),
      listActionHistory(req.organizationId, action.id),
      listVerifications(req.organizationId, [action.id]),
      organizationIdentity(req.organizationId),
    ]);

    // El contexto se nombra, no se copia: la ficha de la acción no puede ser
    // una captura de su padre (§11).
    const contextRows: string[][] = [];
    for (const c of contexts) {
      let label = "—";
      if (c.refKind === "work_case") {
        const parent = await getCase(req.organizationId, c.refId);
        label = parent ? `${parent.code} · ${parent.title}` : "Caso no disponible";
      } else if (c.refKind === "quality_risk") {
        const risks = await listRisks(req.organizationId);
        const r = risks.find((x) => x.riskId === c.refId);
        label = r ? `${r.code ?? "—"} · ${r.title}` : "Riesgo no disponible";
      } else if (c.refKind === "quality_opportunity") {
        label = "Oportunidad";
      }
      contextRows.push([
        REFERENCE_KIND_LABEL[c.refKind] ?? c.refKind,
        label,
        c.relation,
        c.note ?? "—",
      ]);
    }

    // §12 · La prórroga se ve. Si la fecha objetivo cambió, se imprimen las
    // dos: esconder la original convierte un incumplimiento en un cumplimiento.
    const prorrogada =
      action.originalDueOn !== null &&
      action.dueOn !== null &&
      action.originalDueOn !== action.dueOn;

    return {
      filenameParts: { recordType: "Accion", title: action.title, code: action.code },
      document: {
        recordType: "Acción",
        title: action.title,
        code: action.code,
        badges: [
          { text: ACTION_KIND_LABEL[action.actionKind] ?? action.actionKind, tone: "neutral" },
          { text: ACTION_STATUS_LABEL[action.status] ?? action.status, tone: "info" },
          { text: PRIORITY_LABEL[action.priority] ?? action.priority, tone: "neutral" },
        ],
        organization: org,
        systemLine: SYSTEM_WORK,
        orientation: "portrait",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Tipo", ACTION_KIND_LABEL[action.actionKind] ?? action.actionKind),
            requiredField("Estado", ACTION_STATUS_LABEL[action.status] ?? action.status),
            requiredField("Responsable", action.ownerPositionName ?? "sin asignar"),
            requiredField("Prioridad", PRIORITY_LABEL[action.priority] ?? action.priority),
          ], 2)),
          section("Descripción",
            paragraph(action.description),
            action.expectedResult
              ? { type: "fields", items: [{ label: "Resultado esperado", value: action.expectedResult, wide: true }] }
              : null),
          section("Plazos", fields([
            requiredField("Fecha objetivo original", day(action.originalDueOn)),
            requiredField("Fecha objetivo vigente", day(action.dueOn)),
            requiredField("Completada el", day(action.completedOn)),
            requiredField("Cerrada el", day(action.closedAt)),
          ], 2),
          prorrogada
            ? note(
                `Esta acción fue prorrogada: su fecha objetivo original era ${day(action.originalDueOn)} ` +
                `y la vigente es ${day(action.dueOn)}.`
              )
            : null,
          paragraph(action.completionNote)),
          section("Verificación de eficacia", fields([
            requiredField("¿Requiere verificación?", action.requiresEffectiveness ? "Sí" : "No"),
            requiredField("Resultado", EFFECTIVENESS_LABEL[action.effectiveness] ?? action.effectiveness),
          ], 2),
          action.effectivenessCriteria
            ? { type: "fields", items: [{ label: "Criterio declarado", value: action.effectivenessCriteria, wide: true }] }
            : null,
          table(
            [{ header: "Fecha", width: 1.5 }, { header: "Resultado", width: 1.8 },
             { header: "Criterio", width: 3.5 }, { header: "Observación", width: 3.2 },
             { header: "Quién", width: 2 }],
            // §12 · Una verificación NO EFICAZ se conserva tal cual. La acción
            // que vino después es otra acción, no una corrección de esta.
            verifications.map((v) => [
              day(v.verifiedOn),
              v.result === "effective" ? "Eficaz" : "No eficaz",
              v.criteria,
              v.comment ?? "—",
              v.verifiedByName ?? "—",
            ]),
            "Esta acción todavía no tiene verificaciones."
          )),
          section("De dónde viene", table(
            [{ header: "Origen", width: 2 }, { header: "Registro", width: 4.5 },
             { header: "Relación", width: 2 }, { header: "Nota", width: 2.5 }],
            contextRows,
            "Esta acción no está vinculada a ningún registro."
          )),
          section("Historial", timeline(
            history.map((d) => ({
              title: describeDecision(d.decisionKind, d.outcome),
              when: day(d.decidedAt),
              who: d.decidedByName,
              detail: d.rationale,
            })),
            "Sin decisiones registradas sobre esta acción."
          )),
        ],
      },
    };
  },
};

/** «Mis tareas» de la pantalla es el listado de acciones de la empresa. */
export const qualityActionList: ExportDefinition = {
  key: "quality.action.list",
  module: "quality",
  entity: "Acciones",
  recordType: "Acciones",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "Un listado retrata las acciones tal como están hoy. La historia de cada " +
    "una vive en su propia ficha, que sí es histórica.",
  filters: [
    { key: "estado", label: "Estado", kind: "text" },
    { key: "tipo", label: "Tipo", kind: "text" },
  ],
  async load(req): Promise<ExportResult | null> {
    const [all, org] = await Promise.all([
      listAllActions(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const applied: { label: string; value: string }[] = [];
    let rows = all;
    if (req.filters.estado) {
      rows = rows.filter((a) => a.status === req.filters.estado);
      applied.push({
        label: "Estado",
        value: ACTION_STATUS_LABEL[req.filters.estado as keyof typeof ACTION_STATUS_LABEL] ?? req.filters.estado,
      });
    }
    if (req.filters.tipo) {
      rows = rows.filter((a) => a.actionKind === req.filters.tipo);
      applied.push({
        label: "Tipo",
        value: ACTION_KIND_LABEL[req.filters.tipo as keyof typeof ACTION_KIND_LABEL] ?? req.filters.tipo,
      });
    }
    return {
      filenameParts: { recordType: "Acciones", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Acciones", title: "Acciones",
        organization: org, systemLine: SYSTEM_WORK, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Código", width: 1.5 }, { header: "Acción", width: 4 },
           { header: "Tipo", width: 2 }, { header: "Responsable", width: 2.5 },
           { header: "Vence", width: 1.4 }, { header: "Estado", width: 1.8 },
           { header: "Eficacia", width: 1.8 }],
          rows.map((a) => [
            a.code, a.title,
            ACTION_KIND_LABEL[a.actionKind] ?? a.actionKind,
            a.ownerPositionName ?? "sin asignar",
            day(a.dueOn),
            ACTION_STATUS_LABEL[a.status] ?? a.status,
            EFFECTIVENESS_LABEL[a.effectiveness] ?? a.effectiveness,
          ]),
          "No hay acciones con ese filtro."
        )), section(null, currentStateNote(req.generatedAt))],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Control · ficha propia (§13, §14)
 * ---------------------------------------------------------------------- */

export const qualityControlDetail: ExportDefinition = {
  key: "quality.control.detail",
  module: "quality",
  entity: "Control",
  recordType: "Control",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El control es un objeto PERMANENTE: su ficha retrata cómo opera hoy. Lo " +
    "que sí es histórico son sus revisiones de eficacia, y salen fechadas una " +
    "por una. La eficacia que se usó en una evaluación de riesgo concreta vive " +
    "en el PDF de ESA evaluación, con su propio snapshot.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const c = await getControl(req.organizationId, req.id);
    if (!c) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: { recordType: "Control", title: c.title, code: c.code },
      document: {
        recordType: "Control",
        title: c.title,
        code: c.code,
        badges: [
          { text: CONTROL_NATURE_LABEL[c.controlNature] ?? c.controlNature, tone: "neutral" },
          { text: CONTROL_STATUS_LABEL[c.status] ?? c.status, tone: "info" },
        ],
        organization: org,
        systemLine: SYSTEM_RISK,
        orientation: "portrait",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        sections: [
          // RO-23 · Un control NO es una acción de tratamiento: no tiene fecha
          // de vencimiento porque no se termina. Esta nota está aquí porque el
          // papel es donde más fácil se confunden las dos cosas.
          section(null, note(
            "Un control es una barrera permanente: opera de forma continua y no " +
            "tiene fecha de cierre. Las acciones de tratamiento, que sí se " +
            "terminan, se documentan por separado."
          )),
          section("Identidad", fields([
            requiredField("Naturaleza", CONTROL_NATURE_LABEL[c.controlNature] ?? c.controlNature),
            requiredField("Modo de operación", OPERATION_MODE_LABEL[c.operationMode] ?? c.operationMode),
            requiredField("Frecuencia", c.frequency),
            requiredField("Estado", CONTROL_STATUS_LABEL[c.status] ?? c.status),
            requiredField("Responsable", c.ownerPositionName ?? "sin asignar"),
            requiredField("Revisiones registradas", String(c.reviewCount)),
          ], 2),
          paragraph(c.description)),
          section("Dónde opera", table(
            [{ header: "Proceso", width: 4 }, { header: "Código", width: 1.5 },
             { header: "Nota", width: 4 }],
            c.processes.map((p) => [p.name, p.code ?? "—", p.note ?? "—"]),
            "Este control no declara en qué procesos opera."
          )),
          section("Soportes", table(
            [{ header: "Tipo", width: 2 }, { header: "Registro", width: 5 },
             { header: "Código", width: 2 }],
            [
              ...c.documentRefs.map((d) => ["Documento", d.title, d.code ?? "—"]),
              ...c.indicatorRefs.map((i) => ["Indicador", i.name, i.code ?? "—"]),
            ],
            "Este control no tiene documentos ni indicadores asociados."
          )),
          section("Revisiones de eficacia", table(
            // RO-26 · Tres juicios INDEPENDIENTES. Fundirlos en una nota daría
            // un control «bueno» que está bien pensado y no se aplica.
            [{ header: "Fecha", width: 1.5 }, { header: "Diseño", width: 1.8 },
             { header: "Implementación", width: 2 }, { header: "Eficacia", width: 2 },
             { header: "Criterio", width: 3 }, { header: "Quién", width: 2 }],
            c.reviews.map((r) => [
              day(r.reviewedOn),
              DESIGN_VERDICT_LABEL[r.design] ?? r.design,
              IMPLEMENTATION_VERDICT_LABEL[r.implementation] ?? r.implementation,
              EFFECTIVENESS_VERDICT_LABEL[r.effectiveness] ?? r.effectiveness,
              r.criterion ?? "—",
              r.reviewedByName ?? "—",
            ]),
            "Este control todavía no ha sido revisado."
          )),
          section("Riesgos donde se considera", table(
            [{ header: "Código", width: 1.5 }, { header: "Riesgo", width: 5.5 },
             { header: "Estado", width: 2 }],
            c.risks.map((r) => [
              r.code ?? "—", r.title,
              RISK_STATUS_LABEL[r.status as keyof typeof RISK_STATUS_LABEL] ?? r.status,
            ]),
            "Este control no está vinculado a ningún riesgo."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

export const qualityControlList: ExportDefinition = {
  key: "quality.control.list",
  module: "quality",
  entity: "Controles",
  recordType: "Controles",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "Retrata los controles vigentes. Cada revisión de eficacia queda fechada " +
    "en la ficha del control.",
  filters: [{ key: "estado", label: "Estado", kind: "text" }],
  async load(req): Promise<ExportResult | null> {
    const [all, org] = await Promise.all([
      listControls(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const applied: { label: string; value: string }[] = [];
    let rows = all;
    if (req.filters.estado) {
      rows = rows.filter((c) => c.status === req.filters.estado);
      applied.push({
        label: "Estado",
        value: CONTROL_STATUS_LABEL[req.filters.estado as keyof typeof CONTROL_STATUS_LABEL] ?? req.filters.estado,
      });
    }
    return {
      filenameParts: { recordType: "Controles", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Controles", title: "Controles",
        organization: org, systemLine: SYSTEM_RISK, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Código", width: 1.5 }, { header: "Control", width: 4 },
           { header: "Naturaleza", width: 2 }, { header: "Modo", width: 2 },
           { header: "Responsable", width: 2.5 }, { header: "Estado", width: 1.8 }],
          rows.map((c) => [
            c.code, c.title,
            CONTROL_NATURE_LABEL[c.controlNature] ?? c.controlNature,
            OPERATION_MODE_LABEL[c.operationMode] ?? c.operationMode,
            c.ownerPositionName ?? "sin asignar",
            CONTROL_STATUS_LABEL[c.status] ?? c.status,
          ]),
          "No hay controles con ese filtro."
        )), section(null, currentStateNote(req.generatedAt))],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Evaluación de riesgo · histórica de verdad (§29)
 * ---------------------------------------------------------------------- */

export const qualityRiskAssessmentDetail: ExportDefinition = {
  key: "quality.risk-assessment.detail",
  module: "quality",
  entity: "Evaluación de riesgo",
  recordType: "Evaluación de riesgo",
  kind: "historical",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const a = await getRiskAssessment(req.organizationId, req.id);
    if (!a) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Evaluacion-de-riesgo",
        title: a.riskTitle,
        code: `${a.riskCode ?? ""}-${a.assessedOn}`.replace(/^-/, ""),
      },
      document: {
        recordType: "Evaluación de riesgo",
        title: `${ASSESSMENT_KIND_LABEL[a.kind] ?? a.kind} · ${a.riskTitle}`,
        code: a.riskCode,
        subtitle: `Evaluación del ${day(a.assessedOn)}`,
        badges: [
          { text: ASSESSMENT_KIND_LABEL[a.kind] ?? a.kind, tone: "neutral" },
          ...(a.levelLabel ? [{ text: a.levelLabel, tone: "info" as const }] : []),
        ],
        organization: org,
        systemLine: SYSTEM_RISK,
        orientation: "portrait",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        sections: [
          section("Qué se evaluó", {
            type: "references",
            items: [
              { kind: "live", label: "RIESGO", value: `${a.riskCode ?? "—"} · ${a.riskTitle}` },
              {
                kind: "snapshot",
                label: "METODOLOGÍA USADA",
                value: `${a.methodologyName} v${a.versionNumber}`,
                context: "La versión con la que se hizo esta evaluación, aunque hoy rija otra.",
              },
            ],
          }),
          section("Resultado", fields([
            requiredField("Fecha", day(a.assessedOn)),
            requiredField("Puntaje", String(a.score)),
            requiredField("Nivel", a.levelLabel),
            requiredField("Evaluó", a.assessedByName),
          ], 2),
          paragraph(a.rationale)),
          section("Cómo se llegó a ese número", table(
            [{ header: "Escala", width: 3 }, { header: "Nivel elegido", width: 3 },
             { header: "Valor", width: 1.2 }, { header: "Peso", width: 1.2 }],
            a.factors.map((f) => [
              f.scaleLabel, f.levelLabel, String(f.levelValue), String(f.weight),
            ]),
            "Esta evaluación no registró factores por escala."
          )),
          section("Controles considerados", table(
            [{ header: "Código", width: 1.5 }, { header: "Control", width: 5 },
             { header: "Eficacia de entonces", width: 2.5 }],
            // RO-27 · Lo que decía el control AQUEL DÍA. Si hoy dice otra cosa,
            // esta hoja sigue diciendo lo de entonces: es su razón de existir.
            a.controlsConsidered.map((c) => [c.controlCode, c.controlTitle, c.effectiveness]),
            a.kind === "inherent"
              ? "Una evaluación inherente no considera controles: eso es lo que la define."
              : "Esta evaluación no registró controles considerados."
          )),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Cierre de periodo (§3 del inventario)
 * ---------------------------------------------------------------------- */

export const qualityPeriodClosureList: ExportDefinition = {
  key: "quality.period-closure.list",
  module: "quality",
  entity: "Cierres de periodo",
  recordType: "Cierres de periodo",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    const [rows, org] = await Promise.all([
      listPeriodClosures(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    return {
      filenameParts: { recordType: "Cierres-de-periodo", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Cierres de periodo",
        title: "Cierres de periodo",
        organization: org, systemLine: SYSTEM_PERF, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Periodo", width: 2 }, { header: "Cerrado el", width: 1.8 },
           { header: "Quién", width: 2.5 }, { header: "Estado", width: 1.8 },
           { header: "Nota", width: 3 }],
          rows.map((r) => [
            `${day(r.periodStart)} → ${day(r.periodEnd)}`,
            day(r.closedAt),
            r.closedByName ?? "—",
            r.reopenedAt ? "Reabierto" : "Cerrado",
            r.reopenReason ?? r.note ?? "—",
          ]),
          "Esta empresa todavía no ha cerrado ningún periodo."
        ))],
      },
    };
  },
};
