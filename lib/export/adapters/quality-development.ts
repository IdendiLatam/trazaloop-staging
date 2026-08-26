import "server-only";

import {
  getKnowledgeContinuity, getPerformanceEvaluation, listDevelopmentNeeds,
  listDevelopmentPlans, listKnowledgeItems, listLearningActivities, listLessons,
  listPerformanceCycles,
} from "@/lib/db/quality-people";
import {
  ACTIVITY_KIND_LABEL, ATTENDANCE_STATUS_LABEL, CRITICALITY_LABEL,
  DEVELOPMENT_KIND_LABEL, DOCUMENTATION_STATUS_LABEL, EFFECTIVENESS_METHOD_LABEL,
  EFFECTIVENESS_RESULT_LABEL, EVALUATION_STATUS_LABEL, formatDate, HOLDER_LEVEL_LABEL,
  KNOWLEDGE_KIND_LABEL, KNOWLEDGE_SIGNAL_LABEL, LEARNING_RESULT_LABEL,
  LESSON_ORIGIN_LABEL, LESSON_STATUS_LABEL, NEED_ORIGIN_LABEL, NEED_STATUS_LABEL,
  PERFORMANCE_CYCLE_STATUS_LABEL, PERFORMANCE_RESULT_LABEL, PLAN_ITEM_STATUS_LABEL,
  PROPOSAL_KIND_LABEL, PROPOSAL_STATUS_LABEL, TRANSFER_METHOD_LABEL,
  TRANSFER_STATUS_LABEL,
} from "@/lib/domain/quality-people";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  currentStateNote, field, fields, note, paragraph, requiredField, section, table,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * Trazaloop · QUALITY-06 · Los PDF de desarrollo, desempeño, conocimiento y
 * lecciones aprendidas.
 *
 * LO QUE ESTOS DOCUMENTOS SE NIEGAN A HACER
 *
 * · Marcar eficaz una acción por haberse ejecutado. Terminar el curso y que el
 *   curso sirviera son dos afirmaciones distintas, y el papel las mantiene
 *   separadas incluso cuando la segunda está en blanco.
 * · Llamar «riesgo» a una persona. La señal de continuidad dice que un
 *   conocimiento está concentrado; el sujeto de la frase es el conocimiento.
 * · Sumar, promediar u ordenar personas por resultado.
 * · Presentar una lección como si ya hubiera cambiado algo. Una propuesta
 *   aceptada es una propuesta aceptada, no un procedimiento actualizado.
 */

const SYSTEM = "Trazaloop Quality · desarrollo y conocimiento";
const FOOTER =
  "Este PDF es una representación de lo registrado en Trazaloop en el momento indicado. "
  + "La fuente sigue siendo el sistema.";
const PRIVACY_NOTE =
  "Contiene información de personas. Compártelo solo con quien tenga que verlo: "
  + "un PDF no lleva consigo los permisos que lo produjeron.";

// ===========================================================================
// Desarrollo
// ===========================================================================

export const qualityDevelopmentNeedList: ExportDefinition = {
  key: "quality.development-need.list",
  module: "quality",
  entity: "Necesidad de desarrollo",
  recordType: "Necesidades de desarrollo",
  documentName: "Listado de necesidades de desarrollo",
  kind: "list",
  permission: "governor",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La necesidad conserva su origen y su fecha de creación, pero no versiones: el listado "
    + "retrata cómo están hoy.",
  filters: [
    {
      key: "status", label: "Estado", kind: "enum",
      values: ["open", "planned", "in_progress", "closed", "discarded"],
    },
  ],
  async load(req): Promise<ExportResult | null> {
    const [needs, org] = await Promise.all([
      listDevelopmentNeeds(req.organizationId, { status: req.filters.status }),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: { recordType: "Necesidades de desarrollo", title: org.name },
      document: {
        recordType: "Necesidades de desarrollo",
        title: "Necesidades de desarrollo",
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: req.filters.status
          ? [{ label: "Estado", value: NEED_STATUS_LABEL[req.filters.status as never] ?? req.filters.status }]
          : [],
        recordCount: needs.length,
        sections: [
          section(null, currentStateNote(req.generatedAt), note(
            "Una necesidad no obliga a un curso. Puede resolverse con práctica supervisada, "
            + "mentoría, acompañamiento, rotación, autoestudio o experiencia dirigida."
          ), note(PRIVACY_NOTE)),
          section(null, table(
            [
              { header: "Necesidad", width: 4 },
              { header: "Persona", width: 3 },
              { header: "Origen", width: 3 },
              { header: "Prioridad", width: 2 },
              { header: "Estado", width: 2 },
            ],
            needs.map((n) => [
              n.title, n.personName ?? "Del cargo o de la empresa",
              NEED_ORIGIN_LABEL[n.origin], n.priority, NEED_STATUS_LABEL[n.status],
            ]),
            "Sin necesidades registradas con ese criterio."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

export const qualityDevelopmentPlanList: ExportDefinition = {
  key: "quality.development-plan.list",
  module: "quality",
  entity: "Plan de desarrollo",
  recordType: "Planes de desarrollo",
  documentName: "Listado de planes de desarrollo",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El listado enumera los planes tal como están hoy. Cada plan conserva la fecha en que "
    + "entró cada item, y eso se imprime en su ficha.",
  async load(req): Promise<ExportResult | null> {
    const [plans, org] = await Promise.all([
      listDevelopmentPlans(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: { recordType: "Planes de desarrollo", title: org.name },
      document: {
        recordType: "Planes de desarrollo",
        title: "Planes de desarrollo",
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        recordCount: plans.length,
        sections: [
          section(null, currentStateNote(req.generatedAt)),
          section(null, table(
            [
              { header: "Año", width: 1, align: "right" },
              { header: "Plan", width: 5 },
              { header: "Items", width: 1, align: "right" },
              { header: "Estado", width: 2 },
            ],
            plans.map((p) => [
              String(p.year), p.title, String(p.items.length), p.status,
            ]),
            "Sin planes de desarrollo."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

export const qualityDevelopmentPlanDetail: ExportDefinition = {
  key: "quality.development-plan.detail",
  module: "quality",
  entity: "Plan de desarrollo",
  recordType: "Plan de desarrollo",
  documentName: "Plan de desarrollo",
  kind: "detail",
  permission: "governor",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El plan es un documento vivo: cada item lleva la fecha en que entró y por qué, así que "
    + "la ficha ya dice qué se planeó en enero y qué se incorporó después.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const plans = await listDevelopmentPlans(req.organizationId);
    const plan = plans.find((p) => p.id === req.id);
    if (!plan) return null;
    const org = await organizationIdentity(req.organizationId);

    // §29 · Lo planeado al principio y lo incorporado después se distinguen en
    // el papel. Un plan que no lo distingue no se puede revisar: parece que
    // todo estaba previsto desde enero.
    const start = `${plan.year}-01-31`;
    const initial = plan.items.filter((i) => i.addedOn <= start);
    const later = plan.items.filter((i) => i.addedOn > start);

    const itemRows = (items: typeof plan.items) => items.map((i) => [
      i.title,
      DEVELOPMENT_KIND_LABEL[i.developmentKind],
      i.personName ?? "Del cargo",
      i.targetDate ? formatDate(i.targetDate) : "—",
      formatDate(i.addedOn),
      PLAN_ITEM_STATUS_LABEL[i.status],
    ]);
    const columns = [
      { header: "Item", width: 4 },
      { header: "Tipo de desarrollo", width: 3 },
      { header: "Para", width: 3 },
      { header: "Fecha objetivo", width: 2 },
      { header: "Entró el", width: 2 },
      { header: "Estado", width: 2 },
    ];

    return {
      filenameParts: { recordType: "Plan de desarrollo", title: plan.title, code: String(plan.year) },
      document: {
        recordType: "Plan de desarrollo",
        title: plan.title,
        code: String(plan.year),
        badges: [{ text: plan.status, tone: plan.status === "active" ? "good" : "neutral" }],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        recordCount: plan.items.length,
        sections: [
          section(null, currentStateNote(req.generatedAt), note(PRIVACY_NOTE)),
          section("El plan", fields([
            requiredField("Año", String(plan.year)),
            requiredField("Estado", plan.status),
            field("Aprobado", plan.approvedAt ? formatDate(plan.approvedAt.slice(0, 10)) : null),
          ]), paragraph(plan.objective)),
          section("Previsto al inicio del año", table(columns, itemRows(initial),
            "Ningún item entró en el arranque del año.")),
          section("Incorporado durante el año", table(columns, itemRows(later),
            "Ningún item se incorporó después del arranque."),
            note(
              "El plan sigue admitiendo items durante el año, cada uno con su fecha y su "
              + "motivo. No se congela en enero."
            )),
          section("Tipos de desarrollo usados", table(
            [{ header: "Tipo", width: 4 }, { header: "Items", width: 1, align: "right" }],
            [...new Set(plan.items.map((i) => i.developmentKind))].map((k) => [
              DEVELOPMENT_KIND_LABEL[k], String(plan.items.filter((i) => i.developmentKind === k).length),
            ]),
            "—"
          ), note(
            "La formación es UN tipo de desarrollo. Un plan que solo tenga cursos merece una "
            + "pregunta: no todo hueco de competencia se cierra en un aula."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

export const qualityLearningActivityList: ExportDefinition = {
  key: "quality.learning-activity.list",
  module: "quality",
  entity: "Actividad de aprendizaje",
  recordType: "Actividades de aprendizaje",
  documentName: "Listado de actividades de aprendizaje",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "Cada actividad conserva sus fechas de ejecución; el listado retrata el conjunto tal "
    + "como está hoy.",
  filters: [
    {
      key: "status", label: "Estado", kind: "enum",
      values: ["planned", "in_progress", "completed", "cancelled"],
    },
  ],
  async load(req): Promise<ExportResult | null> {
    const [activities, org] = await Promise.all([
      listLearningActivities(req.organizationId, { status: req.filters.status }),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: { recordType: "Actividades de aprendizaje", title: org.name },
      document: {
        recordType: "Actividades de aprendizaje",
        title: "Actividades de aprendizaje",
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: req.filters.status
          ? [{ label: "Estado", value: req.filters.status }] : [],
        recordCount: activities.length,
        sections: [
          section(null, currentStateNote(req.generatedAt)),
          section(null, table(
            [
              { header: "Actividad", width: 4 },
              { header: "Tipo", width: 2 },
              { header: "Fechas", width: 3 },
              { header: "Participantes", width: 2, align: "right" },
              { header: "Eficacia", width: 3 },
            ],
            activities.map((a) => [
              a.title, ACTIVITY_KIND_LABEL[a.activityKind],
              a.startsOn ? `${formatDate(a.startsOn)} → ${a.endsOn ? formatDate(a.endsOn) : "—"}` : "—",
              String(a.participants.length),
              // §72 · Aquí es donde más cuesta no mentir: la columna dice
              // «pendiente» aunque la actividad esté terminada, porque
              // terminarla no la vuelve eficaz.
              describeEffectiveness(a.effectiveness),
            ]),
            "Sin actividades registradas."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

function describeEffectiveness(
  reviews: readonly { result: string }[]
): string {
  if (reviews.length === 0) return "Sin criterio declarado";
  const decided = reviews.filter((r) => r.result !== "pending");
  if (decided.length === 0) return "Pendiente";
  return decided
    .map((r) => EFFECTIVENESS_RESULT_LABEL[r.result as never] ?? r.result)
    .join(" · ");
}

export const qualityLearningActivityDetail: ExportDefinition = {
  key: "quality.learning-activity.detail",
  module: "quality",
  entity: "Actividad de aprendizaje",
  recordType: "Actividad de aprendizaje",
  documentName: "Actividad de aprendizaje",
  kind: "detail",
  permission: "governor",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La ficha imprime la actividad con sus fechas reales de ejecución y el resultado de cada "
    + "participante; no existe una versión anterior de la actividad que reconstruir.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const activities = await listLearningActivities(req.organizationId);
    const a = activities.find((x) => x.id === req.id);
    if (!a) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: { recordType: "Actividad de aprendizaje", title: a.title },
      document: {
        recordType: "Actividad de aprendizaje",
        title: a.title,
        badges: [
          { text: ACTIVITY_KIND_LABEL[a.activityKind], tone: "info" },
          { text: a.status, tone: a.status === "completed" ? "good" : "neutral" },
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(PRIVACY_NOTE)),
          section("La actividad", fields([
            requiredField("Tipo", ACTIVITY_KIND_LABEL[a.activityKind]),
            field("Proveedor", a.provider),
            field("Inicio", a.startsOn ? formatDate(a.startsOn) : null),
            field("Fin", a.endsOn ? formatDate(a.endsOn) : null),
            field("Duración", a.durationHours === null ? null : `${a.durationHours} h`),
          ]), paragraph(a.description)),
          // §32/§33 · Las dos columnas están separadas en el papel porque
          // están separadas en la realidad: se puede asistir al 100 % y no
          // demostrar nada, y eso tiene que poder leerse.
          section("Participación", table(
            [
              { header: "Persona", width: 4 },
              { header: "Asistencia", width: 3 },
              { header: "Aprendizaje", width: 3 },
              { header: "Evaluado el", width: 2 },
            ],
            a.participants.map((p) => [
              p.personName, ATTENDANCE_STATUS_LABEL[p.attendance],
              LEARNING_RESULT_LABEL[p.learningResult],
              p.evaluatedOn ? formatDate(p.evaluatedOn) : "—",
            ]),
            "Sin participantes."
          ), note(
            "Asistencia y aprendizaje son columnas distintas a propósito. Y aprobar una "
            + "evaluación de aprendizaje tampoco declara competencia: eso es otra decisión, "
            + "y va en la ficha de la persona."
          )),
          section("Eficacia", table(
            [
              { header: "Criterio", width: 5 },
              { header: "Método", width: 2 },
              { header: "Resultado", width: 2 },
              { header: "Revisado", width: 2 },
            ],
            a.effectiveness.map((e) => [
              e.criterion, EFFECTIVENESS_METHOD_LABEL[e.method],
              EFFECTIVENESS_RESULT_LABEL[e.result],
              e.reviewedOn ? formatDate(e.reviewedOn) : "—",
            ]),
            "No se ha declarado ningún criterio de eficacia para esta actividad."
          ), note(
            "Haber ejecutado la actividad no la vuelve eficaz. La eficacia se juzga contra un "
            + "criterio declarado antes, y mientras nadie la juzgue el resultado es «pendiente»."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

export const qualityEffectivenessDetail: ExportDefinition = {
  key: "quality.effectiveness.detail",
  module: "quality",
  entity: "Evaluación de eficacia",
  recordType: "Registro de eficacia",
  documentName: "Registro de eficacia",
  kind: "detail",
  permission: "governor",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    // El identificador es el de la ACTIVIDAD: la eficacia se lee junto a lo
    // que se hizo. Una eficacia suelta no dice nada.
    const activities = await listLearningActivities(req.organizationId);
    const a = activities.find((x) => x.id === req.id);
    if (!a) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: { recordType: "Registro de eficacia", title: a.title },
      document: {
        recordType: "Registro de eficacia",
        title: a.title,
        subtitle: "Las cuatro capas, por separado",
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(PRIVACY_NOTE), note(
            "Asistencia, aprendizaje, competencia y eficacia son cuatro preguntas distintas. "
            + "Este documento las presenta en ese orden y no rellena unas con otras."
          )),
          section("1 · Asistencia", table(
            [{ header: "Persona", width: 5 }, { header: "Asistencia", width: 3 }],
            a.participants.map((p) => [p.personName, ATTENDANCE_STATUS_LABEL[p.attendance]]),
            "Sin participantes."
          )),
          section("2 · Aprendizaje", table(
            [
              { header: "Persona", width: 4 },
              { header: "Resultado", width: 3 },
              { header: "Cómo se evaluó", width: 3 },
            ],
            a.participants.map((p) => [
              p.personName, LEARNING_RESULT_LABEL[p.learningResult], p.learningMethod ?? "—",
            ]),
            "Sin participantes."
          )),
          section("3 · Competencia", paragraph(
            "La competencia demostrada no se declara aquí. Vive en la ficha de cada persona, "
            + "con su método y su fundamento, y se puede sostener en esta actividad como "
            + "evidencia, entre otras.", true
          )),
          section("4 · Eficacia", table(
            [
              { header: "Criterio declarado", width: 4 },
              { header: "Método", width: 2 },
              { header: "Resultado", width: 2 },
              { header: "Observación", width: 4 },
            ],
            a.effectiveness.map((e) => [
              e.criterion, EFFECTIVENESS_METHOD_LABEL[e.method],
              EFFECTIVENESS_RESULT_LABEL[e.result], e.observation ?? "—",
            ]),
            "No se ha declarado ningún criterio de eficacia."
          ), note(
            "Un resultado «no eficaz» se conserva. Si después se hace otra acción, será OTRA "
            + "acción, con su propio criterio y su propia eficacia."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

// ===========================================================================
// Desempeño
// ===========================================================================

export const qualityPerformanceCycleDetail: ExportDefinition = {
  key: "quality.performance-cycle.detail",
  module: "quality",
  entity: "Ciclo de evaluación",
  recordType: "Ciclo de evaluación",
  documentName: "Ciclo de evaluación de desempeño",
  kind: "detail",
  permission: "governor",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El ciclo describe un periodo con su población declarada; el documento histórico del "
    + "desempeño es cada evaluación cerrada, que sí conserva lo que se firmó.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const cycles = await listPerformanceCycles(req.organizationId);
    const cycle = cycles.find((c) => c.id === req.id);
    if (!cycle) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: { recordType: "Ciclo de evaluación", title: cycle.name },
      document: {
        recordType: "Ciclo de evaluación",
        title: cycle.name,
        badges: [{ text: PERFORMANCE_CYCLE_STATUS_LABEL[cycle.status], tone: "info" }],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        recordCount: cycle.population.length,
        sections: [
          section(null, note(PRIVACY_NOTE)),
          section("El ciclo", fields([
            requiredField("Periodo",
              `${formatDate(cycle.periodStart)} → ${formatDate(cycle.periodEnd)}`),
            requiredField("Estado", PERFORMANCE_CYCLE_STATUS_LABEL[cycle.status]),
          ]), paragraph(cycle.purpose)),
          section("Población aplicable", table(
            [{ header: "Persona", width: 5 }, { header: "Por qué está incluida", width: 5 }],
            cycle.population.map((p) => [p.personName, p.reason ?? "—"]),
            "Todavía no se ha declarado quién es aplicable en este ciclo."
          ), note(
            // §37 · Se dice para que nadie lea «no evaluados» donde pone «no
            // aplicables».
            "El ciclo aplica a quien está en esta lista, no necesariamente a toda la empresa. "
            + "La población se declara antes de evaluar."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

export const qualityPerformanceEvaluationDetail: ExportDefinition = {
  key: "quality.performance-evaluation.detail",
  module: "quality",
  entity: "Evaluación de desempeño",
  recordType: "Evaluación de desempeño",
  documentName: "Evaluación de desempeño",
  kind: "detail",
  permission: "governor",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    // §59 · Si RLS no entrega la fila, aquí llega `null` y el endpoint
    // responde 404, exactamente igual que si la evaluación no existiera. No
    // hay ninguna vía por la que este PDF conceda lo que la pantalla niega.
    const ev = await getPerformanceEvaluation(req.organizationId, req.id);
    if (!ev) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Evaluación de desempeño", title: ev.personName,
        stamp: ev.evaluatedOn,
      },
      document: {
        recordType: "Evaluación de desempeño",
        title: ev.personName,
        subtitle: ev.cycleName,
        badges: [{ text: EVALUATION_STATUS_LABEL[ev.status],
                   tone: ev.status === "closed" ? "good" : "neutral" }],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(PRIVACY_NOTE)),
          section("La evaluación", fields([
            requiredField("Persona evaluada", ev.personName),
            requiredField("Ciclo", ev.cycleName),
            requiredField("Evaluador", ev.evaluatorName ?? "—"),
            requiredField("Fecha", ev.evaluatedOn ? formatDate(ev.evaluatedOn) : "—"),
          ]), paragraph(ev.summary)),
          ev.contextNote
            ? section("Contexto", paragraph(ev.contextNote), note(
                "El contexto forma parte del registro. Un desempeño bajo con una herramienta "
                + "averiada no es el mismo hecho que un desempeño bajo sin impedimentos."
              ))
            : section(null),
          section("Contra qué se evaluó", table(
            [
              { header: "Criterio", width: 5 },
              { header: "Resultado", width: 3 },
              { header: "Observación", width: 4 },
            ],
            ev.items.map((i) => [
              i.criterion, PERFORMANCE_RESULT_LABEL[i.result], i.observation ?? "—",
            ]),
            "Sin criterios registrados."
          )),
          section(null, note(
            // PC-06 y PC-28, en el documento donde más falta hacen.
            "Esta evaluación no modifica la competencia declarada de la persona: competencia "
            + "y desempeño son cosas distintas. Los datos de indicadores, procesos o casos "
            + "pueden haber servido de contexto al evaluador, pero no calculan este resultado: "
            + "la decisión es de la persona que firma."
          )),
        ].filter((s) => s.blocks.length > 0),
        footerNote: FOOTER,
      },
    };
  },
};

// ===========================================================================
// Conocimiento
// ===========================================================================

export const qualityKnowledgeList: ExportDefinition = {
  key: "quality.knowledge.list",
  module: "quality",
  entity: "Elemento de conocimiento",
  recordType: "Conocimiento",
  documentName: "Listado de conocimiento",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El registro de holders conserva fechas de inicio y fin, pero el elemento en sí no tiene "
    + "versiones: el listado retrata el conocimiento tal como está declarado hoy.",
  filters: [
    {
      key: "criticality", label: "Criticidad", kind: "enum",
      values: ["low", "medium", "high", "critical"],
    },
  ],
  async load(req): Promise<ExportResult | null> {
    const [continuity, org] = await Promise.all([
      getKnowledgeContinuity(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const rows = req.filters.criticality
      ? continuity.filter((c) => c.criticality === req.filters.criticality)
      : continuity;

    return {
      filenameParts: { recordType: "Conocimiento", title: org.name },
      document: {
        recordType: "Conocimiento",
        title: "Conocimiento de la empresa",
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: req.filters.criticality
          ? [{ label: "Criticidad", value: CRITICALITY_LABEL[req.filters.criticality as never] }]
          : [],
        recordCount: rows.length,
        sections: [
          section(null, currentStateNote(req.generatedAt)),
          section(null, table(
            [
              { header: "Conocimiento", width: 4 },
              { header: "Tipo", width: 2 },
              { header: "Criticidad", width: 2 },
              { header: "Documentación", width: 3 },
              { header: "Personas", width: 1, align: "right" },
              { header: "Continuidad", width: 3 },
            ],
            rows.map((k) => [
              k.title, KNOWLEDGE_KIND_LABEL[k.knowledgeKind],
              CRITICALITY_LABEL[k.criticality],
              DOCUMENTATION_STATUS_LABEL[k.documentationStatus],
              String(k.holderCount),
              // La frase habla del conocimiento. Nunca de la persona.
              k.continuityAttention ? "Concentrado · requiere atención" : "Sin señal",
            ]),
            "Sin conocimiento registrado."
          )),
          section(null, note(
            "«Concentrado» significa que un conocimiento que la empresa necesita depende "
            + "de una sola persona, o de ninguna. Es una observación sobre la empresa, "
            + "no sobre nadie en particular, y no es un riesgo formal mientras alguien no "
            + "decida abrirlo."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

export const qualityKnowledgeDetail: ExportDefinition = {
  key: "quality.knowledge.detail",
  module: "quality",
  entity: "Elemento de conocimiento",
  recordType: "Elemento de conocimiento",
  documentName: "Ficha de conocimiento",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La ficha imprime los registros de holders con sus fechas, pero el elemento no conserva "
    + "versiones de sí mismo que reconstruir.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const items = await listKnowledgeItems(req.organizationId);
    const k = items.find((x) => x.id === req.id);
    if (!k) return null;
    const org = await organizationIdentity(req.organizationId);
    const current = k.holders.filter((h) => h.untilOn === null);

    return {
      filenameParts: { recordType: "Conocimiento", title: k.title },
      document: {
        recordType: "Elemento de conocimiento",
        title: k.title,
        badges: [
          { text: KNOWLEDGE_KIND_LABEL[k.knowledgeKind], tone: "info" },
          { text: `Criticidad ${CRITICALITY_LABEL[k.criticality].toLowerCase()}`,
            tone: k.criticality === "critical" || k.criticality === "high" ? "warn" : "neutral" },
          { text: DOCUMENTATION_STATUS_LABEL[k.documentationStatus], tone: "neutral" },
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Qué es", paragraph(k.description),
            fields([
              requiredField("Tipo", KNOWLEDGE_KIND_LABEL[k.knowledgeKind]),
              requiredField("Criticidad", CRITICALITY_LABEL[k.criticality]),
              requiredField("Documentación", DOCUMENTATION_STATUS_LABEL[k.documentationStatus]),
              field("Por qué es crítico", k.criticalityNote),
            ])),
          section("Quién lo sostiene", table(
            [
              { header: "Persona", width: 4 },
              { header: "Papel", width: 3 },
              { header: "Desde", width: 2 },
              { header: "Hasta", width: 2 },
            ],
            k.holders.map((h) => [
              h.isPrimaryHolder ? `${h.personName} · responde primero` : h.personName,
              HOLDER_LEVEL_LABEL[h.holderLevel],
              h.sinceOn ? formatDate(h.sinceOn) : "—",
              h.untilOn ? formatDate(h.untilOn) : "Vigente",
            ]),
            "Nadie figura como holder de este conocimiento."
          ), note(
            "Estas personas SOSTIENEN el conocimiento. No son sus dueñas: el conocimiento "
            + "pertenece a la empresa y al sistema de gestión."
          )),
          section("Señales de continuidad", table(
            [
              { header: "Señal", width: 5 },
              { header: "Estado", width: 2 },
              { header: "Riesgo formal", width: 3 },
            ],
            k.signals.map((s) => [
              KNOWLEDGE_SIGNAL_LABEL[s.signalKind], s.status,
              s.riskId ? "Sí, alguien decidió abrirlo" : "No",
            ]),
            current.length <= 1 && (k.criticality === "high" || k.criticality === "critical")
              ? "Todavía no se ha ejecutado la revisión que genera la señal."
              : "Sin señales."
          ), note(
            "Una señal dice que un conocimiento está concentrado. Convertirla en un riesgo "
            + "formal del sistema de gestión es una decisión humana explícita: el sistema no "
            + "lo hace solo."
          )),
          section("Planes de transferencia", table(
            [
              { header: "Plan", width: 4 },
              { header: "Método", width: 2 },
              { header: "Origen", width: 2 },
              { header: "Estado", width: 2 },
              { header: "Verificado", width: 2 },
            ],
            k.transfers.map((t) => [
              t.title, TRANSFER_METHOD_LABEL[t.method], t.sourcePersonName ?? "—",
              TRANSFER_STATUS_LABEL[t.status],
              t.verifiedOn ? formatDate(t.verifiedOn) : "—",
            ]),
            "Sin planes de transferencia."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

export const qualityTransferPlanDetail: ExportDefinition = {
  key: "quality.transfer-plan.detail",
  module: "quality",
  entity: "Plan de transferencia",
  recordType: "Plan de transferencia",
  documentName: "Plan de transferencia de conocimiento",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const items = await listKnowledgeItems(req.organizationId);
    let plan: (typeof items)[number]["transfers"][number] | null = null;
    let parent: (typeof items)[number] | null = null;
    for (const k of items) {
      const found = k.transfers.find((t) => t.id === req.id);
      if (found) { plan = found; parent = k; break; }
    }
    if (!plan || !parent) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: { recordType: "Plan de transferencia", title: plan.title },
      document: {
        recordType: "Plan de transferencia",
        title: plan.title,
        subtitle: parent.title,
        badges: [
          { text: TRANSFER_STATUS_LABEL[plan.status],
            tone: plan.status === "completed" ? "good" : "neutral" },
          { text: TRANSFER_METHOD_LABEL[plan.method], tone: "info" },
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(PRIVACY_NOTE)),
          section("El plan", fields([
            requiredField("Conocimiento", parent.title),
            requiredField("Criticidad", CRITICALITY_LABEL[parent.criticality]),
            requiredField("Método", TRANSFER_METHOD_LABEL[plan.method]),
            field("Desde", plan.sourcePersonName),
            field("Fecha objetivo", plan.targetDate ? formatDate(plan.targetDate) : null),
          ]), paragraph(plan.objective)),
          section("Actividades", table(
            [
              { header: "Actividad", width: 4 },
              { header: "Para", width: 3 },
              { header: "Fecha", width: 2 },
              { header: "Estado", width: 2 },
              { header: "Evidencia", width: 3 },
            ],
            plan.items.map((i) => [
              i.activity, i.targetPersonName ?? "—",
              i.dueOn ? formatDate(i.dueOn) : "—", i.status, i.evidenceNote ?? "—",
            ]),
            "Sin actividades declaradas."
          )),
          section("Verificación", plan.verifiedOn
            ? fields([
                requiredField("Verificado el", formatDate(plan.verifiedOn)),
                { label: "En qué se comprobó", value: plan.verificationNote ?? "—", wide: true },
              ], 1)
            : paragraph(
                "Todavía sin verificar. Ejecutar las actividades no demuestra que el "
                + "conocimiento haya pasado: la verificación es un acto aparte.", true
              )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

// ===========================================================================
// Lecciones aprendidas
// ===========================================================================

export const qualityLessonList: ExportDefinition = {
  key: "quality.lesson.list",
  module: "quality",
  entity: "Lección aprendida",
  recordType: "Lecciones aprendidas",
  documentName: "Listado de lecciones aprendidas",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "Cada lección conserva la fecha de lo ocurrido y sus propuestas con su decisión; el "
    + "listado retrata el conjunto tal como está hoy.",
  filters: [
    { key: "status", label: "Estado", kind: "enum", values: ["draft", "published", "archived"] },
  ],
  async load(req): Promise<ExportResult | null> {
    const [lessons, org] = await Promise.all([
      listLessons(req.organizationId, { status: req.filters.status }),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: { recordType: "Lecciones aprendidas", title: org.name },
      document: {
        recordType: "Lecciones aprendidas",
        title: "Lecciones aprendidas",
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: req.filters.status
          ? [{ label: "Estado", value: LESSON_STATUS_LABEL[req.filters.status as never] }] : [],
        recordCount: lessons.length,
        sections: [
          section(null, currentStateNote(req.generatedAt)),
          section(null, table(
            [
              { header: "Lección", width: 4 },
              { header: "Código", width: 2 },
              { header: "Origen", width: 2 },
              { header: "Ocurrió", width: 2 },
              { header: "Propuestas", width: 2, align: "right" },
              { header: "Estado", width: 2 },
            ],
            lessons.map((l) => [
              l.title, l.code ?? "—", LESSON_ORIGIN_LABEL[l.origin],
              l.occurredOn ? formatDate(l.occurredOn) : "—",
              String(l.proposals.length), LESSON_STATUS_LABEL[l.status],
            ]),
            "Sin lecciones registradas."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};

export const qualityLessonDetail: ExportDefinition = {
  key: "quality.lesson.detail",
  module: "quality",
  entity: "Lección aprendida",
  recordType: "Lección aprendida",
  documentName: "Lección aprendida",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const lessons = await listLessons(req.organizationId);
    const l = lessons.find((x) => x.id === req.id);
    if (!l) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: { recordType: "Lección aprendida", title: l.title, code: l.code },
      document: {
        recordType: "Lección aprendida",
        title: l.title,
        code: l.code,
        badges: [
          { text: LESSON_STATUS_LABEL[l.status], tone: l.status === "published" ? "good" : "neutral" },
          { text: LESSON_ORIGIN_LABEL[l.origin], tone: "info" },
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          // Las cuatro preguntas, en secciones separadas. Colapsarlas en un
          // párrafo es como se pierden las lecciones.
          section("Qué ocurrió", paragraph(l.whatHappened)),
          section("Qué se aprendió", paragraph(l.whatWasLearned)),
          section("Dónde aplica", paragraph(l.applicableContext)
            ?? paragraph("Sin contexto de aplicación declarado.", true)),
          section("Qué se recomienda cambiar", paragraph(l.recommendation)
            ?? paragraph("Sin recomendación declarada.", true)),
          section("Origen", fields([
            requiredField("Tipo de origen", LESSON_ORIGIN_LABEL[l.origin]),
            field("Ocurrió el", l.occurredOn ? formatDate(l.occurredOn) : null),
          ])),
          section("Propuestas derivadas", table(
            [
              { header: "Propuesta", width: 5 },
              { header: "Tipo", width: 3 },
              { header: "Decisión", width: 2 },
              { header: "Qué se creó", width: 2 },
            ],
            l.proposals.map((p) => [
              p.summary, PROPOSAL_KIND_LABEL[p.proposalKind],
              PROPOSAL_STATUS_LABEL[p.status],
              p.outcomeId ? p.outcomeKind ?? "—" : "—",
            ]),
            "Esta lección todavía no propone ningún cambio."
          ), note(
            "Una propuesta aceptada NO cambia nada por su cuenta. El documento, el proceso o "
            + "la competencia se modifican con su propio acto, y aquí queda registrado qué se "
            + "creó a partir de esta lección."
          )),
        ],
        footerNote: FOOTER,
      },
    };
  },
};
