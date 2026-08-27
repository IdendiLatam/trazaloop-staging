import "server-only";

import {
  getFollowUp, getReadiness, getReview, getReviewDetail, listAgenda,
  listDecisions, listInputs, listMinutes, listNotes, listParticipants,
  listReviews,
} from "@/lib/db/quality-management-review";
import {
  AI_DOES_NOT_DECIDE, ATTENDANCE_IS_NOT_APPROVAL, CLOSING_DOES_NOT_CLOSE_ACTIONS,
  CUSTOMER_ANONYMITY_HOLDS, DECISION_IS_NOT_AN_ACTION, DECISION_KIND_LABEL,
  describeDecisionOutcome, describeLineage, formatDate, INPUT_MODE_LABEL,
  INPUT_STATE_LABEL, MANUAL_ENTRY_KIND_LABEL, MANUAL_INPUT_IS_DECLARED,
  MINUTES_ARE_FROZEN_FOLLOWUP_IS_LIVE, MISSING_IS_NOT_ZERO, NO_MAGIC_NUMBERS,
  NOT_APPLICABLE_IS_NOT_MISSING, PARTICIPANT_HISTORY_IS_FROZEN,
  PARTICIPATION_ROLE_LABEL, PEOPLE_DATA_IS_AGGREGATED, REVIEW_IS_NOT_A_DASHBOARD,
  REVIEW_IS_NOT_AN_AUDIT, REVIEW_KIND_LABEL, REVIEW_STATUS_LABEL,
  type DecisionKind, type InputMode, type InputState, type ManualEntryKind,
  type ParticipationRole, type ReviewKind, type ReviewStatus,
} from "@/lib/domain/quality-management-review";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  currentStateNote, field, fields, note, paragraph, requiredField, section, table,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * Trazaloop · QUALITY-10 · Los papeles de la Revisión por la Dirección.
 *
 * CUATRO REGLAS QUE ATRAVIESAN LOS SIETE
 *
 * §75 · EL ACTA SE IMPRIME DESDE SU INSTANTÁNEA. La revisión de 2027 reimpresa
 * en 2029 devuelve 2027: las entradas tal como se revisaron, el análisis tal
 * como se escribió y los participantes con el cargo de entonces. Leer el estado
 * de hoy bajo el encabezado de un acta de 2027 sería fabricar un pasado.
 *
 * §41 · NINGUNO CONFUNDE DECISIÓN CON ACCIÓN. Las dos columnas van separadas y
 * el papel explica por qué los números no coinciden.
 *
 * §36 · NINGUNO ESCRIBE CERO DONDE NO HUBO MEDICIÓN. «Sin datos en el periodo»
 * se imprime tal cual.
 *
 * §63 · Y NINGUNO ROMPE EL ANONIMATO. La entrada de voz del cliente imprime
 * agregados porque agregados es lo único que guarda.
 */

const SYSTEM = "Trazaloop Quality · revisión por la dirección";

function stamp(iso: string): string {
  return iso.slice(0, 10);
}

function reviewBadges(r: { status: ReviewStatus; reviewKind: ReviewKind; reopenCount: number }) {
  return [
    { text: REVIEW_STATUS_LABEL[r.status], tone: "info" as const },
    ...(r.reviewKind !== "full"
      ? [{ text: REVIEW_KIND_LABEL[r.reviewKind], tone: "info" as const }] : []),
    ...(r.reopenCount > 0
      ? [{ text: `Reabierta ×${r.reopenCount}`, tone: "warn" as const }] : []),
  ];
}

// ---------------------------------------------------------------------------
// 1 · Listado de revisiones
// ---------------------------------------------------------------------------

export const qualityManagementReviewList: ExportDefinition = {
  key: "quality.management-review.list",
  module: "quality",
  entity: "Listado de revisiones por la dirección",
  recordType: "Revisiones por la dirección",
  documentName: "Listado de revisiones por la dirección",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata la situación de hoy. Lo fechado es el acta de cada revisión, "
    + "que conserva su propia instantánea del periodo que analizó.",
  filters: [
    {
      key: "status", label: "Estado", kind: "enum",
      values: ["draft", "preparing", "ready_for_review", "in_review", "closed", "cancelled"],
    },
    { key: "kind", label: "Tipo", kind: "enum", values: ["full", "extraordinary", "thematic"] },
  ],
  async load(req): Promise<ExportResult | null> {
    const [reviews, org] = await Promise.all([
      listReviews(req.organizationId, {
        status: req.filters.status, kind: req.filters.kind,
      }),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Revisiones por la dirección", title: "Listado",
        code: null, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Revisiones por la dirección",
        title: "Listado de revisiones por la dirección",
        code: null,
        subtitle: `${reviews.length} revisión(es)`,
        badges: [],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(REVIEW_IS_NOT_A_DASHBOARD), currentStateNote(req.generatedAt)),
          section("Revisiones", table(
            [
              { header: "Código", width: 2 },
              { header: "Revisión", width: 4 },
              { header: "Tipo", width: 2 },
              { header: "Periodo", width: 3 },
              { header: "Sesión", width: 2 },
              { header: "Estado", width: 2 },
              { header: "Entradas", width: 3 },
              { header: "Decisiones", width: 2 },
              { header: "Acciones", width: 3 },
            ],
            reviews.map((r) => [
              r.code, r.title, REVIEW_KIND_LABEL[r.reviewKind],
              `${r.periodLabel} · ${formatDate(r.periodStart)}—${formatDate(r.periodEnd)}`,
              formatDate(r.sessionHeldOn),
              REVIEW_STATUS_LABEL[r.status],
              `${r.inputsPrepared + r.inputsReviewed + r.inputsMissing + r.inputsNotApplicable}`
                + ` de ${r.inputCount}`
                + (r.inputsPending > 0 ? ` · ${r.inputsPending} sin mirar` : ""),
              String(r.decisionCount),
              `${r.actionCount}`
                + (r.overdueActionCount > 0 ? ` · ${r.overdueActionCount} vencida(s)` : ""),
            ]),
            "Todavía no hay ninguna revisión por la dirección."
          )),
          section(null, note(
            "Las columnas «Decisiones» y «Acciones» son números distintos a "
            + "propósito: una decisión puede generar cero, una o cinco acciones."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 2 · Ficha de la revisión
// ---------------------------------------------------------------------------

export const qualityManagementReviewDetail: ExportDefinition = {
  key: "quality.management-review.detail",
  module: "quality",
  entity: "Revisión por la dirección",
  recordType: "Revisión por la dirección",
  documentName: "Ficha de revisión por la dirección",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La ficha imprime la revisión como está hoy. El documento del PASADO es su "
    + "acta emitida, que se imprime desde su propia instantánea.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const review = await getReview(req.organizationId, req.id);
    if (!review) return null;

    const [detail, participants, decisions, readiness, followUp, org] = await Promise.all([
      getReviewDetail(req.organizationId, review.id),
      listParticipants(req.organizationId, review.id),
      listDecisions(req.organizationId, review.id),
      getReadiness(review.id),
      getFollowUp(review.id),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Revisión por la dirección", title: review.title,
        code: review.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Revisión por la dirección",
        title: review.title,
        code: review.code,
        subtitle: `${review.periodLabel} · ${formatDate(review.periodStart)} — ${formatDate(review.periodEnd)}`,
        badges: reviewBadges(review),
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(REVIEW_IS_NOT_A_DASHBOARD), note(REVIEW_IS_NOT_AN_AUDIT),
            currentStateNote(req.generatedAt)),
          section("Identificación", fields([
            requiredField("Código", review.code),
            requiredField("Título", review.title),
            requiredField("Tipo", REVIEW_KIND_LABEL[review.reviewKind]),
            requiredField("Estado", REVIEW_STATUS_LABEL[review.status]),
            requiredField("Periodo analizado", review.periodLabel),
            requiredField("Desde", formatDate(review.periodStart)),
            requiredField("Hasta", formatDate(review.periodEnd)),
            requiredField("Responsable", review.ownerPositionName ?? "Sin asignar"),
            field("Sesión", review.sessionHeldOn ? formatDate(review.sessionHeldOn) : null),
            field("Lugar", detail?.sessionLocation ?? null),
            field("Cerrada el", review.closedAt ? formatDate(review.closedAt.slice(0, 10)) : null),
          ])),
          section("Alcance", paragraph(detail?.scopeNote ?? null)),
          section("Participantes", table(
            [
              { header: "Quién", width: 4 },
              { header: "Papel", width: 3 },
              { header: "Cargo entonces", width: 3 },
              { header: "Asistió", width: 2 },
            ],
            participants.map((p) => [
              p.personName ?? p.externalName ?? "—",
              PARTICIPATION_ROLE_LABEL[p.participationRole as ParticipationRole],
              p.positionNameAtReview ?? "—",
              p.attended ? "Sí" : "No",
            ]),
            "Sin participantes registrados."
          ), note(ATTENDANCE_IS_NOT_APPROVAL)),
          section("Estado de preparación", fields([
            requiredField("Entradas requeridas", String(readiness?.required_inputs ?? 0)),
            requiredField("Preparadas o revisadas", String(readiness?.ready ?? 0)),
            requiredField("Sin datos en el periodo", String(readiness?.missing ?? 0)),
            requiredField("No aplicables", String(readiness?.not_applicable ?? 0)),
            requiredField("Sin mirar", String(readiness?.pending ?? 0)),
            requiredField("Sin análisis", String(readiness?.without_analysis ?? 0)),
          ]), note(MISSING_IS_NOT_ZERO)),
          section("Decisiones", table(
            [
              { header: "Código", width: 2 },
              { header: "Tema", width: 3 },
              { header: "Decisión", width: 5 },
              { header: "Tipo", width: 2 },
              { header: "Acciones", width: 2 },
            ],
            decisions.map((d) => [
              d.code, d.topic, d.decision,
              DECISION_KIND_LABEL[d.decisionKind as DecisionKind],
              String(d.actionCount),
            ]),
            "Todavía no hay decisiones registradas."
          ), note(DECISION_IS_NOT_AN_ACTION)),
          section("Conclusiones", paragraph(detail?.conclusions ?? null)),
          section("Seguimiento", fields([
            requiredField("Decisiones", String(followUp?.decisions ?? 0)),
            requiredField("Acciones", String(followUp?.actions ?? 0)),
            requiredField("Abiertas", String(followUp?.open ?? 0)),
            requiredField("Vencidas", String(followUp?.overdue ?? 0)),
            requiredField("Eficaces", String(followUp?.effective ?? 0)),
          ]), note(CLOSING_DOES_NOT_CLOSE_ACTIONS)),
          section("Cierre", paragraph(detail?.closureNote ?? null),
            paragraph(detail?.followupNote ?? null)),
          section("Próxima revisión", fields([
            requiredField("Prevista para", formatDate(review.nextReviewPlannedOn)),
            field("Nota", detail?.nextReviewNote ?? null),
          ])),
          section(null, note(AI_DOES_NOT_DECIDE)),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 3 · Agenda y participantes
// ---------------------------------------------------------------------------

export const qualityManagementReviewAgenda: ExportDefinition = {
  key: "quality.management-review-agenda.detail",
  module: "quality",
  entity: "Agenda de la revisión por la dirección",
  recordType: "Agenda de revisión",
  documentName: "Agenda de revisión por la dirección",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La agenda se imprime como está hoy. Lo que se trató de verdad queda en el acta, "
    + "que sí guarda su instantánea.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const review = await getReview(req.organizationId, req.id);
    if (!review) return null;

    const [detail, agenda, participants, org] = await Promise.all([
      getReviewDetail(req.organizationId, review.id),
      listAgenda(req.organizationId, review.id),
      listParticipants(req.organizationId, review.id),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Agenda de revisión", title: review.title,
        code: review.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Agenda de revisión",
        title: review.title,
        code: review.code,
        subtitle: review.sessionHeldOn
          ? `Sesión del ${formatDate(review.sessionHeldOn)}`
          : "Sesión sin fecha todavía",
        badges: reviewBadges(review),
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "La revisión se prepara durante semanas y suele terminar en una "
            + "sesión. Esta agenda es la de esa sesión: no es la revisión."
          ), currentStateNote(req.generatedAt)),
          section("La sesión", fields([
            requiredField("Revisión", `${review.code} · ${review.title}`),
            requiredField("Periodo analizado", review.periodLabel),
            field("Día", review.sessionHeldOn ? formatDate(review.sessionHeldOn) : null),
            field("Lugar", detail?.sessionLocation ?? null),
            field("Nota", detail?.sessionNote ?? null),
          ])),
          section("Orden del día", table(
            [
              { header: "#", width: 1 },
              { header: "Punto", width: 6 },
              { header: "Entrada", width: 3 },
              { header: "Horario", width: 2 },
              { header: "Presenta", width: 3 },
            ],
            agenda.map((a) => [
              String(a.order), a.title, a.catalogCode ?? "—",
              a.timeLabel ?? "—", a.presenterName ?? "—",
            ]),
            "La agenda todavía está vacía."
          ), paragraph(detail?.agendaNote ?? null)),
          section("Convocados", table(
            [
              { header: "Quién", width: 4 },
              { header: "Papel", width: 3 },
              { header: "Cargo entonces", width: 3 },
              { header: "Asistió", width: 2 },
            ],
            participants.map((p) => [
              p.personName ?? p.externalName ?? "—",
              PARTICIPATION_ROLE_LABEL[p.participationRole as ParticipationRole],
              p.positionNameAtReview ?? "—",
              p.attended ? "Sí" : "No",
            ]),
            "Sin convocados registrados."
          ), note(PARTICIPANT_HISTORY_IS_FROZEN), note(ATTENDANCE_IS_NOT_APPROVAL)),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 4 · El paquete de entradas
// ---------------------------------------------------------------------------

/** Convierte el retrato guardado en filas legibles, sin inventar nada. */
function snapshotRows(snapshot: Record<string, unknown> | null): string[][] {
  if (snapshot === null) return [];
  const out: string[][] = [];
  const walk = (prefix: string, value: unknown) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      out.push([prefix, `${value.length} elemento(s)`]);
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === "lineage" || k === "detail" || k === "note") continue;
        walk(prefix ? `${prefix} · ${k}` : k, v);
      }
      return;
    }
    out.push([prefix, String(value)]);
  };
  for (const [k, v] of Object.entries(snapshot)) {
    if (k === "lineage" || k === "note" || k === "anonymity_note") continue;
    walk(k, v);
  }
  return out;
}

export const qualityManagementReviewInputs: ExportDefinition = {
  key: "quality.management-review-inputs.detail",
  module: "quality",
  entity: "Paquete de entradas de la revisión por la dirección",
  recordType: "Entradas de revisión",
  documentName: "Paquete de entradas de revisión por la dirección",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El paquete imprime las entradas tal como están AHORA en la revisión. Cuando la "
    + "revisión se cierra, su acta las congela y esa es la versión del pasado.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const review = await getReview(req.organizationId, req.id);
    if (!review) return null;

    const [inputs, readiness, org] = await Promise.all([
      listInputs(req.organizationId, review.id),
      getReadiness(review.id),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Entradas de revisión", title: review.title,
        code: review.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Entradas de revisión",
        title: review.title,
        code: review.code,
        subtitle: `${review.periodLabel} · ${inputs.length} entrada(s)`,
        badges: reviewBadges(review),
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(MISSING_IS_NOT_ZERO), note(NOT_APPLICABLE_IS_NOT_MISSING),
            note(NO_MAGIC_NUMBERS), currentStateNote(req.generatedAt)),
          section("Estado de preparación", fields([
            requiredField("Entradas requeridas", String(readiness?.required_inputs ?? 0)),
            requiredField("Preparadas o revisadas", String(readiness?.ready ?? 0)),
            requiredField("Sin datos en el periodo", String(readiness?.missing ?? 0)),
            requiredField("No aplicables", String(readiness?.not_applicable ?? 0)),
            requiredField("Sin mirar", String(readiness?.pending ?? 0)),
          ])),
          // Una sección por entrada: el dato, el linaje y el análisis, en ese
          // orden y separados.
          ...inputs.flatMap((i) => {
            const lineage = describeLineage(i.snapshot?.lineage);
            const nota = typeof i.snapshot?.note === "string" ? i.snapshot.note : null;
            const anon = typeof i.snapshot?.anonymity_note === "string"
              ? i.snapshot.anonymity_note : null;
            return [
              section(`${i.order}. ${i.catalogLabel}`,
                fields([
                  requiredField("Origen", i.inputMode === "manual"
                    ? "Aportación de la dirección"
                    : (i.sourceDomain ?? "Automática")),
                  requiredField("Modo", INPUT_MODE_LABEL[i.inputMode as InputMode]),
                  requiredField("Estado", INPUT_STATE_LABEL[i.state as InputState]),
                  field("Periodo consultado", i.sourcePeriodStart
                    ? `${formatDate(i.sourcePeriodStart)} — ${formatDate(i.sourcePeriodEnd)}`
                    : null),
                  field("Preparada el", i.preparedAt ? formatDate(i.preparedAt.slice(0, 10)) : null),
                  field("No aplica porque", i.notApplicableReason),
                ]),
                paragraph(i.summary),
                nota ? paragraph(nota, true) : null,
                anon ? note(anon) : null,
                i.inputMode === "manual" ? note(MANUAL_INPUT_IS_DECLARED) : null,
                i.catalogCode === "resources_adequacy" ? note(PEOPLE_DATA_IS_AGGREGATED) : null,
                i.catalogCode === "customer_voice" ? note(CUSTOMER_ANONYMITY_HOLDS) : null),
              ...(snapshotRows(i.snapshot).length > 0
                ? [section(null, table(
                    [{ header: "Dato", width: 6 }, { header: "Valor", width: 4 }],
                    snapshotRows(i.snapshot),
                    "—"))]
                : []),
              ...(i.manualEntries.length > 0
                ? [section(null, table(
                    [
                      { header: "Fecha", width: 2 },
                      { header: "Tipo", width: 3 },
                      { header: "Título", width: 3 },
                      { header: "Contenido", width: 5 },
                    ],
                    i.manualEntries.map((m) => [
                      formatDate(m.recordedOn),
                      MANUAL_ENTRY_KIND_LABEL[m.entryKind as ManualEntryKind],
                      m.title, m.body,
                    ]),
                    "—"))]
                : []),
              ...(lineage.length > 0
                ? [section(null, table(
                    [{ header: "De dónde viene este dato", width: 10 }],
                    lineage.map((l) => [l]),
                    "—"))]
                : []),
              ...(i.analysis
                ? [section(null,
                    paragraph(`Análisis de la dirección: ${i.analysis}`),
                    i.conclusion ? paragraph(`Conclusión: ${i.conclusion}`) : null,
                    i.requiresDecision
                      ? note("Marcada como pendiente de decisión. Decirlo no es haberlo resuelto.")
                      : null)]
                : []),
            ];
          }),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 5 · Decisiones
// ---------------------------------------------------------------------------

export const qualityManagementReviewDecisionList: ExportDefinition = {
  key: "quality.management-review-decision.list",
  module: "quality",
  entity: "Decisiones de la revisión por la dirección",
  recordType: "Decisiones de la dirección",
  documentName: "Listado de decisiones de la revisión por la dirección",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado imprime las decisiones con el estado de sus acciones HOY. Lo que se "
    + "decidió y cuántas acciones había al emitir queda congelado en el acta.",
  filters: [{ key: "reviewId", label: "Revisión", kind: "uuid" }],
  async load(req): Promise<ExportResult | null> {
    const reviewId = req.id ?? req.filters.reviewId ?? null;
    const org = await organizationIdentity(req.organizationId);

    const reviews = reviewId
      ? [await getReview(req.organizationId, reviewId)].filter((r) => r !== null)
      : await listReviews(req.organizationId);
    if (reviews.length === 0 && reviewId) return null;

    const porRevision = await Promise.all(
      reviews.map(async (r) => {
        const ds = await listDecisions(req.organizationId, r!.id);
        return ds.map((d) => ({ ...d, review: r! }));
      })
    );
    const decisiones = porRevision.flat();

    return {
      filenameParts: {
        recordType: "Decisiones de la dirección",
        title: reviewId ? (reviews[0]?.title ?? "Revisión") : "Listado",
        code: reviewId ? (reviews[0]?.code ?? null) : null,
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Decisiones de la dirección",
        title: reviewId
          ? `Decisiones de ${reviews[0]?.title ?? "la revisión"}`
          : "Listado de decisiones de la revisión por la dirección",
        code: reviewId ? (reviews[0]?.code ?? null) : null,
        subtitle: `${decisiones.length} decisión(es)`,
        badges: [],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(DECISION_IS_NOT_AN_ACTION), currentStateNote(req.generatedAt)),
          section("Decisiones", table(
            [
              { header: "Revisión", width: 2 },
              { header: "Periodo", width: 2 },
              { header: "Código", width: 1 },
              { header: "Tema", width: 3 },
              { header: "Decisión", width: 5 },
              { header: "Tipo", width: 2 },
              { header: "Fundamento", width: 3 },
              { header: "Resultado esperado", width: 3 },
              { header: "Acciones", width: 3 },
            ],
            decisiones.map((d) => [
              d.review.code, d.review.periodLabel, d.code, d.topic, d.decision,
              DECISION_KIND_LABEL[d.decisionKind as DecisionKind],
              d.rationale ?? "—", d.expectedResult ?? "—",
              describeDecisionOutcome(d),
            ]),
            "Todavía no hay decisiones registradas."
          )),
          section(null, note(
            "El número de decisiones y el de acciones no coinciden, y no es un "
            + "error: una decisión puede generar cero, una o cinco acciones, y "
            + "sigue siendo una decisión."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 6 · El informe de la revisión — §74
// ---------------------------------------------------------------------------

export const qualityManagementReviewReport: ExportDefinition = {
  key: "quality.management-review-report.detail",
  module: "quality",
  entity: "Informe de revisión por la dirección",
  recordType: "Informe de revisión por la dirección",
  documentName: "Informe de revisión por la dirección",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "Este informe se compone con el estado ACTUAL de la revisión, y lo dice. El "
    + "documento del pasado es el ACTA emitida, que se imprime desde su instantánea.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const review = await getReview(req.organizationId, req.id);
    if (!review) return null;

    const [detail, participants, agenda, inputs, decisions, notes, followUp, org] =
      await Promise.all([
        getReviewDetail(req.organizationId, review.id),
        listParticipants(req.organizationId, review.id),
        listAgenda(req.organizationId, review.id),
        listInputs(req.organizationId, review.id),
        listDecisions(req.organizationId, review.id),
        listNotes(req.organizationId, review.id),
        getFollowUp(review.id),
        organizationIdentity(req.organizationId),
      ]);

    return {
      filenameParts: {
        recordType: "Informe de revisión por la dirección", title: review.title,
        code: review.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Informe de revisión por la dirección",
        title: review.title,
        code: review.code,
        subtitle: `${review.periodLabel} · ${formatDate(review.periodStart)} — ${formatDate(review.periodEnd)}`,
        badges: reviewBadges(review),
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(REVIEW_IS_NOT_A_DASHBOARD), note(AI_DOES_NOT_DECIDE),
            currentStateNote(req.generatedAt)),
          section("1 · Identificación", fields([
            requiredField("Código", review.code),
            requiredField("Título", review.title),
            requiredField("Tipo", REVIEW_KIND_LABEL[review.reviewKind]),
            requiredField("Estado", REVIEW_STATUS_LABEL[review.status]),
            requiredField("Responsable", review.ownerPositionName ?? "Sin asignar"),
          ])),
          section("2 · Periodo revisado", fields([
            requiredField("Etiqueta", review.periodLabel),
            requiredField("Desde", formatDate(review.periodStart)),
            requiredField("Hasta", formatDate(review.periodEnd)),
            field("Sesión celebrada", review.sessionHeldOn
              ? formatDate(review.sessionHeldOn) : null),
            field("Lugar", detail?.sessionLocation ?? null),
          ]), paragraph(detail?.scopeNote ?? null)),
          section("3 · Participantes", table(
            [
              { header: "Quién", width: 4 },
              { header: "Papel", width: 3 },
              { header: "Cargo entonces", width: 3 },
              { header: "Asistió", width: 1 },
              { header: "Aportación", width: 3 },
            ],
            participants.map((p) => [
              p.personName ?? p.externalName ?? "—",
              PARTICIPATION_ROLE_LABEL[p.participationRole as ParticipationRole],
              p.positionNameAtReview ?? "—",
              p.attended ? "Sí" : "No",
              p.contributionNote ?? "—",
            ]),
            "Sin participantes registrados."
          ), note(ATTENDANCE_IS_NOT_APPROVAL)),
          section("4 · Agenda", table(
            [
              { header: "#", width: 1 },
              { header: "Punto", width: 6 },
              { header: "Horario", width: 2 },
              { header: "Presenta", width: 3 },
            ],
            agenda.map((a) => [
              String(a.order), a.title, a.timeLabel ?? "—", a.presenterName ?? "—",
            ]),
            "Sin agenda registrada."
          )),
          section("5 · Entradas, datos y análisis", note(MISSING_IS_NOT_ZERO)),
          ...inputs.flatMap((i) => [
            section(`5.${i.order} · ${i.catalogLabel}`,
              fields([
                requiredField("Modo", INPUT_MODE_LABEL[i.inputMode as InputMode]),
                requiredField("Estado", INPUT_STATE_LABEL[i.state as InputState]),
                field("Periodo consultado", i.sourcePeriodStart
                  ? `${formatDate(i.sourcePeriodStart)} — ${formatDate(i.sourcePeriodEnd)}`
                  : null),
                field("No aplica porque", i.notApplicableReason),
              ]),
              paragraph(i.summary),
              i.analysis ? paragraph(`Análisis: ${i.analysis}`) : null,
              i.conclusion ? paragraph(`Conclusión: ${i.conclusion}`) : null,
              i.manualEntries.length > 0
                ? table(
                    [
                      { header: "Aportación de la dirección", width: 3 },
                      { header: "Contenido", width: 7 },
                    ],
                    i.manualEntries.map((m) => [
                      `${MANUAL_ENTRY_KIND_LABEL[m.entryKind as ManualEntryKind]} · ${m.title}`,
                      m.body,
                    ]),
                    "—")
                : null),
          ]),
          section("6 · Conclusiones de la dirección",
            paragraph(detail?.conclusions ?? null),
            note("Las escribe una persona. El sistema reúne los datos y se detiene ahí.")),
          section("7 · Decisiones y salidas", table(
            [
              { header: "Código", width: 1 },
              { header: "Tema", width: 3 },
              { header: "Decisión", width: 5 },
              { header: "Tipo", width: 2 },
              { header: "Responsable", width: 2 },
              { header: "Resultado esperado", width: 3 },
            ],
            decisions.map((d) => [
              d.code, d.topic, d.decision,
              DECISION_KIND_LABEL[d.decisionKind as DecisionKind],
              d.ownerPositionName ?? "—", d.expectedResult ?? "—",
            ]),
            "Todavía no hay decisiones registradas."
          ), note(DECISION_IS_NOT_AN_ACTION)),
          section("8 · Acciones y seguimiento", table(
            [
              { header: "Decisión", width: 2 },
              { header: "Acción", width: 2 },
              { header: "Qué hay que hacer", width: 5 },
              { header: "Estado", width: 2 },
              { header: "Vence", width: 2 },
              { header: "Eficacia", width: 2 },
            ],
            decisions.flatMap((d) => d.actions.map((a) => [
              d.code, a.code, a.title, a.status,
              formatDate(a.dueOn), a.effectiveness,
            ])),
            "Ninguna decisión ha generado acciones todavía."
          ), fields([
            requiredField("Decisiones", String(followUp?.decisions ?? 0)),
            requiredField("Acciones", String(followUp?.actions ?? 0)),
            requiredField("Abiertas", String(followUp?.open ?? 0)),
            requiredField("Vencidas", String(followUp?.overdue ?? 0)),
            requiredField("Eficaces", String(followUp?.effective ?? 0)),
          ]), note(CLOSING_DOES_NOT_CLOSE_ACTIONS)),
          section("9 · Notas de la sesión", table(
            [{ header: "Fecha", width: 2 }, { header: "Nota", width: 8 }],
            notes.map((n) => [formatDate(n.recordedOn), n.body]),
            "Sin notas complementarias."
          )),
          section("10 · Cierre y próxima revisión", fields([
            field("Cerrada el", review.closedAt
              ? formatDate(review.closedAt.slice(0, 10)) : null),
            requiredField("Próxima revisión", formatDate(review.nextReviewPlannedOn)),
            field("Nota de la próxima", detail?.nextReviewNote ?? null),
          ]), paragraph(detail?.closureNote ?? null),
             paragraph(detail?.followupNote ?? null)),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 7 · EL ACTA — desde su instantánea (§50, §75, RD-07, RD-18)
// ---------------------------------------------------------------------------

type Snap = Record<string, unknown>;
function arr(o: Snap, key: string): Snap[] {
  const v = o[key];
  return Array.isArray(v) ? (v as Snap[]) : [];
}
function obj(o: Snap, key: string): Snap {
  const v = o[key];
  return v !== null && typeof v === "object" ? (v as Snap) : {};
}
function str(o: Snap, key: string): string | null {
  const v = o[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * §75 · El acta se imprime desde `snapshot`, NUNCA desde el estado de hoy.
 *
 * Si en 2028 sube la meta de un indicador, cambia el equipo o avanza una
 * acción, el acta de 2027 sigue diciendo lo que decía: 82 sobre 95, aquel
 * equipo y aquel estado. Leer el presente bajo el encabezado de un acta de
 * 2027 sería fabricar un pasado con formato de prueba.
 */
export const qualityManagementReviewMinutes: ExportDefinition = {
  key: "quality.management-review-minutes.detail",
  module: "quality",
  entity: "Acta de revisión por la dirección",
  recordType: "Acta de revisión por la dirección",
  documentName: "Acta de revisión por la dirección",
  kind: "historical",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;

    // El acta se busca por su id; la revisión sale después. Manda la
    // instantánea, no el estado de la revisión hoy.
    const reviews = await listReviews(req.organizationId);
    let minutes: Awaited<ReturnType<typeof listMinutes>>[number] | null = null;
    let reviewId: string | null = null;
    for (const r of reviews) {
      const list = await listMinutes(req.organizationId, r.id);
      const found = list.find((m) => m.id === req.id);
      if (found) { minutes = found; reviewId = r.id; break; }
    }
    if (!minutes || !reviewId) return null;

    const org = await organizationIdentity(req.organizationId);
    const snap = minutes.snapshot as Snap;
    const sr = obj(snap, "review");
    const followUp = obj(snap, "followup_at_issue");

    return {
      filenameParts: {
        recordType: "Acta de revisión por la dirección",
        title: str(sr, "title") ?? "Revisión",
        code: str(sr, "code"), stamp: minutes.issuedOn,
      },
      document: {
        recordType: "Acta de revisión por la dirección",
        title: str(sr, "title") ?? "Revisión por la dirección",
        code: str(sr, "code"),
        subtitle: `Versión ${minutes.versionNumber} · emitida el ${formatDate(minutes.issuedOn)}`,
        badges: [
          { text: `Versión ${minutes.versionNumber}`, tone: "info" as const },
          ...(minutes.supersedesId
            ? [{ text: "Corrige un acta anterior", tone: "warn" as const }] : []),
          ...(minutes.documentRevisionId
            ? [{ text: "Documento controlado", tone: "info" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Esta acta se imprime desde la FOTO tomada al emitirla. Si el equipo "
            + "cambió después, si una meta subió o si una acción avanzó, este "
            + "papel sigue diciendo lo que decía entonces."
          ), note(MINUTES_ARE_FROZEN_FOLLOWUP_IS_LIVE)),
          section("1 · Identificación", fields([
            requiredField("Código", str(sr, "code") ?? "—"),
            requiredField("Título", str(sr, "title") ?? "—"),
            requiredField("Tipo",
              REVIEW_KIND_LABEL[(str(sr, "kind") ?? "full") as ReviewKind] ?? "—"),
            requiredField("Acta emitida el", formatDate(minutes.issuedOn)),
            requiredField("Versión del acta", String(minutes.versionNumber)),
          ])),
          section("2 · Periodo revisado", fields([
            requiredField("Etiqueta", str(sr, "period_label") ?? "—"),
            requiredField("Desde", formatDate(str(sr, "period_start"))),
            requiredField("Hasta", formatDate(str(sr, "period_end"))),
            field("Sesión celebrada", str(sr, "session_held_on")
              ? formatDate(str(sr, "session_held_on")) : null),
            field("Lugar", str(sr, "session_location")),
          ]), paragraph(str(sr, "scope_note"))),
          section("3 · Participantes de entonces", table(
            [
              { header: "Quién", width: 4 },
              { header: "Papel", width: 3 },
              { header: "Cargo entonces", width: 3 },
              { header: "Asistió", width: 1 },
              { header: "Aportación", width: 3 },
            ],
            arr(snap, "participants").map((p) => [
              str(p, "name") ?? "—",
              PARTICIPATION_ROLE_LABEL[(str(p, "role") ?? "member") as ParticipationRole]
                ?? str(p, "role") ?? "—",
              str(p, "position") ?? "—",
              p.attended === true ? "Sí" : "No",
              str(p, "contribution") ?? "—",
            ]),
            "Sin participantes registrados."
          ), note(PARTICIPANT_HISTORY_IS_FROZEN)),
          section("4 · Agenda", table(
            [
              { header: "#", width: 1 },
              { header: "Punto", width: 6 },
              { header: "Horario", width: 2 },
              { header: "Nota", width: 3 },
            ],
            arr(snap, "agenda").map((a) => [
              String(a.order ?? "—"), str(a, "title") ?? "—",
              str(a, "time") ?? "—", str(a, "note") ?? "—",
            ]),
            "Sin agenda registrada."
          )),
          section("5 · Entradas tal como se revisaron", note(MISSING_IS_NOT_ZERO)),
          ...arr(snap, "inputs").flatMap((i, idx) => {
            const lineage = describeLineage(obj(i, "snapshot").lineage);
            const manual = arr(i, "manual_entries");
            return [
              section(`5.${idx + 1} · ${str(i, "label") ?? str(i, "code") ?? "Entrada"}`,
                fields([
                  requiredField("Modo",
                    INPUT_MODE_LABEL[(str(i, "mode") ?? "automatic") as InputMode] ?? "—"),
                  requiredField("Estado",
                    INPUT_STATE_LABEL[(str(i, "state") ?? "pending") as InputState] ?? "—"),
                  field("Periodo consultado", str(i, "source_period_start")
                    ? `${formatDate(str(i, "source_period_start"))} — `
                      + `${formatDate(str(i, "source_period_end"))}`
                    : null),
                  field("No aplica porque", str(i, "not_applicable_reason")),
                ]),
                paragraph(str(i, "summary")),
                str(i, "analysis") ? paragraph(`Análisis: ${str(i, "analysis")}`) : null,
                str(i, "conclusion") ? paragraph(`Conclusión: ${str(i, "conclusion")}`) : null,
                manual.length > 0
                  ? table(
                      [
                        { header: "Aportación de la dirección", width: 3 },
                        { header: "Contenido", width: 7 },
                      ],
                      manual.map((m) => [
                        `${MANUAL_ENTRY_KIND_LABEL[(str(m, "kind") ?? "other") as ManualEntryKind]
                          ?? str(m, "kind")} · ${str(m, "title") ?? ""}`,
                        str(m, "body") ?? "—",
                      ]),
                      "—")
                  : null,
                lineage.length > 0
                  ? table(
                      [{ header: "De dónde vino este dato", width: 10 }],
                      lineage.map((l) => [l]),
                      "—")
                  : null),
            ];
          }),
          section("6 · Conclusiones de la dirección", paragraph(str(sr, "conclusions"))),
          section("7 · Decisiones", table(
            [
              { header: "Código", width: 1 },
              { header: "Tema", width: 3 },
              { header: "Decisión", width: 5 },
              { header: "Tipo", width: 2 },
              { header: "Fundamento", width: 3 },
              { header: "Resultado esperado", width: 3 },
            ],
            arr(snap, "decisions").map((d) => [
              str(d, "code") ?? "—", str(d, "topic") ?? "—",
              str(d, "decision") ?? "—",
              DECISION_KIND_LABEL[(str(d, "kind") ?? "other") as DecisionKind]
                ?? str(d, "kind") ?? "—",
              str(d, "rationale") ?? "—", str(d, "expected_result") ?? "—",
            ]),
            "No se registraron decisiones."
          ), note(DECISION_IS_NOT_AN_ACTION)),
          section("8 · Acciones al emitir el acta", table(
            [
              { header: "Decisión", width: 2 },
              { header: "Acción", width: 2 },
              { header: "Qué había que hacer", width: 5 },
              { header: "Estado entonces", width: 2 },
              { header: "Vencía", width: 2 },
            ],
            arr(snap, "decisions").flatMap((d) =>
              arr(d, "actions_at_issue").map((a) => [
                str(d, "code") ?? "—", str(a, "code") ?? "—",
                str(a, "title") ?? "—", str(a, "status") ?? "—",
                formatDate(str(a, "due_on")),
              ])),
            "Ninguna decisión había generado acciones al emitir el acta."
          ), fields([
            requiredField("Decisiones al emitir", String(followUp.decisions ?? 0)),
            requiredField("Acciones al emitir", String(followUp.actions ?? 0)),
            requiredField("Abiertas entonces", String(followUp.open ?? 0)),
          ]), note(
            "Estos son los estados de ENTONCES. El estado de hoy se lee en el "
            + "reporte de seguimiento, que es otra capa y se conserva aparte."
          )),
          section("9 · Notas de la sesión", table(
            [{ header: "Fecha", width: 2 }, { header: "Nota", width: 8 }],
            arr(snap, "notes").map((n) => [
              formatDate(str(n, "recorded_on")), str(n, "body") ?? "—",
            ]),
            "Sin notas complementarias."
          )),
          section("10 · Próxima revisión", fields([
            requiredField("Prevista para", formatDate(str(sr, "next_review_planned_on"))),
            field("Nota", str(sr, "next_review_note")),
          ])),
          section("Resumen ejecutivo", paragraph(minutes.summary)),
          ...(minutes.supersedesId
            ? [section("Corrección", paragraph(
                "Esta acta corrige a una versión anterior, que NO se borró: las "
                + "dos se conservan, y quien recibió la primera puede comprobar "
                + "qué cambió.", true))]
            : []),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 8 · Seguimiento de acciones
// ---------------------------------------------------------------------------

export const qualityManagementReviewFollowUp: ExportDefinition = {
  key: "quality.management-review-followup.list",
  module: "quality",
  entity: "Seguimiento de la revisión por la dirección",
  recordType: "Seguimiento de la dirección",
  documentName: "Reporte de seguimiento de la revisión por la dirección",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El seguimiento es, por definición, la situación de hoy: qué sigue abierto ahora. "
    + "Lo que quedaba abierto al emitir el acta se lee en el acta de esa fecha.",
  filters: [{ key: "reviewId", label: "Revisión", kind: "uuid" }],
  async load(req): Promise<ExportResult | null> {
    const reviewId = req.id ?? req.filters.reviewId ?? null;
    const org = await organizationIdentity(req.organizationId);

    const todas = await listReviews(req.organizationId);
    const reviews = reviewId ? todas.filter((r) => r.id === reviewId) : todas;
    if (reviews.length === 0 && reviewId) return null;

    const porRevision = await Promise.all(
      reviews.map(async (r) => {
        const ds = await listDecisions(req.organizationId, r.id);
        return ds.map((d) => ({ ...d, review: r }));
      })
    );
    const decisiones = porRevision.flat();

    return {
      filenameParts: {
        recordType: "Seguimiento de la dirección",
        title: reviewId ? (reviews[0]?.title ?? "Revisión") : "Reporte",
        code: reviewId ? (reviews[0]?.code ?? null) : null,
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Seguimiento de la dirección",
        title: "Reporte de seguimiento de la revisión por la dirección",
        code: reviewId ? (reviews[0]?.code ?? null) : null,
        subtitle: `${reviews.length} revisión(es) · ${decisiones.length} decisión(es)`,
        badges: [],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(MINUTES_ARE_FROZEN_FOLLOWUP_IS_LIVE),
            note(CLOSING_DOES_NOT_CLOSE_ACTIONS), currentStateNote(req.generatedAt)),
          section("Por revisión", table(
            [
              { header: "Código", width: 2 },
              { header: "Revisión", width: 4 },
              { header: "Periodo", width: 2 },
              { header: "Estado", width: 2 },
              { header: "Decisiones", width: 2 },
              { header: "Acciones", width: 2 },
              { header: "Abiertas", width: 2 },
              { header: "Vencidas", width: 2 },
              { header: "Eficaces", width: 2 },
            ],
            reviews.map((r) => [
              r.code, r.title, r.periodLabel, REVIEW_STATUS_LABEL[r.status],
              String(r.decisionCount), String(r.actionCount),
              String(r.openActionCount), String(r.overdueActionCount),
              String(r.effectiveActionCount),
            ]),
            "Todavía no hay revisiones con seguimiento."
          )),
          section("Acción por acción", table(
            [
              { header: "Revisión", width: 2 },
              { header: "Decisión", width: 2 },
              { header: "Tema", width: 3 },
              { header: "Acción", width: 2 },
              { header: "Qué hay que hacer", width: 4 },
              { header: "Estado", width: 2 },
              { header: "Vence", width: 2 },
              { header: "Eficacia", width: 2 },
            ],
            decisiones.flatMap((d) => d.actions.map((a) => [
              d.review.code, d.code, d.topic, a.code, a.title,
              a.status, formatDate(a.dueOn), a.effectiveness,
            ])),
            "Ninguna decisión ha generado acciones todavía."
          )),
          section(null, note(
            "Una revisión cerrada con acciones abiertas es una situación NORMAL. "
            + "Exigir que todas estén terminadas para poder cerrar produce "
            + "revisiones abiertas durante años por una acción de nadie."
          )),
        ],
      },
    };
  },
};
