import "server-only";

import {
  activeVersion, getOpportunity, getRisk, listMethodologies, listOpportunities, listRisks,
} from "@/lib/db/risks";
import {
  CONTROL_NATURE_LABEL, EFFECTIVENESS_VERDICT_LABEL,
  IMPACT_AREA_LABEL, MATERIALIZATION_SEVERITY_LABEL,
  OPERATION_MODE_LABEL, OPPORTUNITY_DECISION_LABEL, OPPORTUNITY_KIND_LABEL,
  OPPORTUNITY_STATUS_LABEL, PLAN_STATUS_LABEL, RISK_STATUS_LABEL, RISK_STRATEGY_LABEL,
  CAUSE_SOURCE_LABEL, describeReview, explainDerivation,
} from "@/lib/domain/risks";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  fields, note, requiredField, section, table, timeline, type PrintBlock, type PrintMatrix,
} from "../print-model";
import { organizationIdentity } from "../branding";

const SYSTEM = "Trazaloop Quality · riesgos y oportunidades";

/** Traduce la banda de resultado a un tono. El tono ACOMPAÑA: la etiqueta
 *  siempre está escrita al lado. */
function levelTone(acceptable: boolean | null | undefined): "good" | "danger" | "neutral" {
  if (acceptable === true) return "good";
  if (acceptable === false) return "danger";
  return "neutral";
}

export const qualityRiskDetail: ExportDefinition = {
  key: "quality.risk.detail",
  module: "quality",
  entity: "Riesgo",
  recordType: "Riesgo",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const r = await getRisk(req.id);
    if (!r || r.organizationId !== req.organizationId) return null;

    const inherent = r.assessments.find((a) => a.kind === "inherent") ?? null;
    const residual = r.assessments.find((a) => a.kind === "residual") ?? null;
    const plan = r.plans.find((p) => p.status === "active" || p.status === "pending_approval") ?? null;
    const org = await organizationIdentity(req.organizationId);

    // §38 · La matriz que acompaña al riesgo es la de LA VERSIÓN con la que se
    // evaluó, no la de hoy. Si la empresa publicó criterios nuevos, esta ficha
    // sigue explicándose con los suyos.
    const shown = residual ?? inherent;
    let matrix: PrintMatrix | null = null;
    if (shown?.derivation) {
      const methodologies = await listMethodologies(req.organizationId, "risk");
      const version = methodologies
        .flatMap((m) => m.versions)
        .find((v) => v.versionId === shown.derivation!.version_id);
      if (version) {
        const factors = shown.derivation.factors ?? [];
        const dims = version.scales.filter((sc) => sc.scaleKind === "dimension");
        const xCode = dims[0]?.code;
        const yCode = dims[1]?.code;
        matrix = buildMatrix(version, {
          x: factors.find((f) => f.scale_code === xCode)?.level_label ?? null,
          y: factors.find((f) => f.scale_code === yCode)?.level_label ?? null,
        });
      }
    }

    // §37 · Inherente y residual NO se mezclan: cada una es su propia sección,
    // con su metodología, sus factores y su explicación.
    const assessmentBlock = (a: typeof inherent, label: string): PrintBlock[] => {
      if (!a) return [{ type: "paragraph", text: `Sin ${label.toLowerCase()} registrada.`, muted: true }];
      const explanation = explainDerivation(a.derivation);
      return [
        {
          type: "badges",
          items: [{
            text: a.derivation?.level_label ?? "—",
            tone: levelTone(a.derivation?.is_acceptable),
          }, ...(a.derivation?.is_acceptable === false
            ? [{ text: "Sobre el criterio aceptable", tone: "danger" as const }] : [])],
        },
        ...(explanation ? [{ type: "paragraph" as const, text: explanation }] : []),
        {
          type: "fields",
          items: [
            requiredField("Evaluada el", a.assessedOn),
            requiredField("Por", a.assessedByName ?? "—"),
            requiredField("Metodología", `${a.methodologyName} v${a.versionNumber}`),
            requiredField("Puntaje", String(a.score)),
          ],
          columns: 2,
        },
        ...(a.controlsConsidered.length > 0
          ? [{
              type: "fields" as const,
              items: [{
                label: "Controles considerados",
                value: a.controlsConsidered
                  .map((c) => `${c.controlCode} · ${c.controlTitle} (${EFFECTIVENESS_VERDICT_LABEL[c.effectiveness as never] ?? c.effectiveness})`)
                  .join("\n"),
                wide: true,
              }],
            }]
          : []),
        ...(a.rationale ? [{ type: "fields" as const, items: [{ label: "Fundamento", value: a.rationale, wide: true }] }] : []),
      ];
    };

    return {
      filenameParts: { recordType: "Riesgo", title: r.title, code: r.code },
      document: {
        recordType: "Riesgo",
        title: r.title,
        code: r.code,
        badges: [
          { text: r.currentLevel ?? "Sin evaluar", tone: levelTone(r.currentIsAcceptable) },
          { text: RISK_STATUS_LABEL[r.status], tone: r.status === "active" ? "info" : "neutral" },
          ...(r.treatmentStrategy
            ? [{ text: RISK_STRATEGY_LABEL[r.treatmentStrategy],
                 tone: r.treatmentStatus === "pending_approval" ? "warn" as const : "info" as const }]
            : []),
        ],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Qué puede pasar",
            fields([
              requiredField("Responsable", r.ownerPositionName ?? "Sin asignar"),
              requiredField("Identificado el", r.identifiedOn),
              requiredField("Próxima revisión", describeReview(r.nextReviewOn)),
              requiredField("Estado", RISK_STATUS_LABEL[r.status]),
            ], 2),
            {
              type: "fields",
              items: [
                { label: "Causa", wide: true,
                  value: r.causes.length > 0
                    ? r.causes.map((c) => `${c.description} (${CAUSE_SOURCE_LABEL[c.sourceKind]})`).join("\n")
                    : "Sin causas registradas." },
                { label: "Evento", value: r.eventDescription, wide: true },
                { label: "Consecuencia", wide: true,
                  value: r.consequences.length > 0
                    ? r.consequences.map((c) => `${c.description} (${IMPACT_AREA_LABEL[c.impactArea]})`).join("\n")
                    : "Sin consecuencias registradas." },
              ],
            },
            r.processes.length > 0
              ? { type: "fields", items: [{ label: "Procesos afectados", value: r.processes.map((p) => p.name).join(" · "), wide: true }] }
              : null,
            r.objectives.length > 0
              ? { type: "fields", items: [{ label: "Objetivos en juego", value: r.objectives.map((o) => o.name).join(" · "), wide: true }] }
              : null,
          ),
          { title: "Evaluación inherente — sin contar ningún control", blocks: assessmentBlock(inherent, "Evaluación inherente") },
          section("Controles existentes", table(
            [{ header: "Código", width: 1.6 }, { header: "Control", width: 4 },
             { header: "Naturaleza", width: 1.8 }, { header: "Operación", width: 1.6 },
             { header: "Última eficacia", width: 2.4 }],
            r.controls.map((c) => [
              c.code, c.title,
              CONTROL_NATURE_LABEL[c.controlNature],
              OPERATION_MODE_LABEL[c.operationMode],
              c.lastReview
                ? `${EFFECTIVENESS_VERDICT_LABEL[c.lastReview.effectiveness]} (${c.lastReview.reviewedOn})`
                : "Sin evaluar",
            ]),
            "Sin controles asociados."
          ),
          note("Un control YA existe y opera. No es una tarea pendiente: eso es una acción, y va en su propia sección.")),
          { title: "Evaluación residual — con los controles puestos", blocks: assessmentBlock(residual, "Evaluación residual") },
          section("Decisión y tratamiento",
            plan
              ? fields([
                  requiredField("Estrategia", RISK_STRATEGY_LABEL[plan.strategy]),
                  requiredField("Estado", PLAN_STATUS_LABEL[plan.status]),
                  requiredField("Decidido el", plan.decidedOn),
                  requiredField("Por", plan.decidedByName ?? "—"),
                  requiredField("Se revisa el", plan.reviewOn ?? "—"),
                  requiredField("Aprobado por", plan.approvedByName ?? (plan.requiresApproval ? "Pendiente" : "No requiere")),
                ], 2)
              : { type: "paragraph", text: "Todavía no se ha decidido qué hacer.", muted: true },
            plan?.rationale ? { type: "fields", items: [{ label: "Fundamento", value: plan.rationale, wide: true }] } : null,
          ),
          section("Acciones de tratamiento", table(
            [{ header: "Código", width: 1.6 }, { header: "Acción", width: 5 },
             { header: "Estado", width: 2 }, { header: "Vence", width: 2 }],
            r.actions.map((a) => [a.code, a.title, a.status, a.dueOn ?? "—"]),
            "Sin acciones planificadas."
          )),
          section("Si llegó a ocurrir", table(
            [{ header: "Ocurrió", width: 1.8 }, { header: "Gravedad", width: 1.6 },
             { header: "Qué pasó", width: 5 }, { header: "Caso", width: 1.6 }],
            r.materializations.map((m) => [
              m.occurredOn, MATERIALIZATION_SEVERITY_LABEL[m.severity],
              m.description, m.caseCode ?? "Sin caso",
            ]),
            "Este riesgo no se ha materializado."
          ),
          r.materializations.some((m) => !m.caseId)
            ? note("Que un riesgo se materialice no crea una no conformidad. Que lo sea o no es una decisión humana posterior.")
            : null),
          ...(matrix ? [section("Cómo se calcula", { type: "matrix" as const, matrix },
            note("Esta matriz sale de la versión de metodología con la que se evaluó este riesgo, no de la vigente hoy."))] : []),
          section("Historial", timeline(
            r.decisions.map((d) => ({
              title: decisionTitle(d.decisionKind, d.outcome),
              when: d.decidedAt.slice(0, 10),
              who: d.decidedByName,
              detail: d.rationale,
            })),
            "Sin decisiones registradas."
          )),
        ],
      },
    };
  },
};

function decisionTitle(kind: string, outcome: string | null): string {
  if (kind === "risk_assessed") {
    const [k, ...rest] = (outcome ?? "").split(":");
    const label = k === "inherent" ? "Evaluación inherente" : k === "residual" ? "Evaluación residual" : "Evaluado";
    const level = rest.join(":");
    return level ? `${label} · ${level}` : label;
  }
  if (kind === "risk_treatment") return `Tratamiento decidido · ${RISK_STRATEGY_LABEL[outcome as never] ?? outcome ?? ""}`;
  if (kind === "risk_acceptance") return outcome === "approved" ? "Aceptación aprobada" : "Aceptación decidida";
  if (kind === "risk_materialized") return `Se materializó · ${MATERIALIZATION_SEVERITY_LABEL[outcome as never] ?? outcome ?? ""}`;
  if (kind === "risk_review") return "Riesgo revisado";
  if (kind === "closure") return outcome === "retired" ? "Retirado" : "Cerrado";
  if (kind === "reopen") return "Reabierto";
  return kind;
}

export const qualityRiskList: ExportDefinition = {
  key: "quality.risk.list",
  module: "quality",
  entity: "Riesgos",
  recordType: "Riesgos",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  filters: [
    { key: "vista", label: "Vista", kind: "enum", values: ["activos", "sobre-criterio", "revision-vencida", "todos"] },
    { key: "proceso", label: "Proceso", kind: "uuid" },
  ],
  async load(req): Promise<ExportResult | null> {
    let rows = await listRisks(req.organizationId);
    const applied: { label: string; value: string }[] = [];

    const vista = req.filters.vista ?? "activos";
    if (vista === "activos") {
      rows = rows.filter((r) => r.status === "draft" || r.status === "active");
      applied.push({ label: "Vista", value: "Activos" });
    } else if (vista === "sobre-criterio") {
      rows = rows.filter((r) => r.currentIsAcceptable === false && r.status === "active");
      applied.push({ label: "Vista", value: "Por encima del criterio aceptable" });
    } else if (vista === "revision-vencida") {
      rows = rows.filter((r) => r.reviewOverdue);
      applied.push({ label: "Vista", value: "Con revisión vencida" });
    } else {
      applied.push({ label: "Vista", value: "Todos" });
    }

    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Riesgos", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Riesgos", title: "Registro de riesgos",
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [
          section(null, table(
            [{ header: "Código", width: 1.5 }, { header: "Riesgo", width: 4.5 },
             { header: "Responsable", width: 2.4 }, { header: "Nivel vigente", width: 2 },
             { header: "Estado", width: 1.5 }, { header: "Tratamiento", width: 2 },
             { header: "Próxima revisión", width: 2 }, { header: "Controles", width: 1.2 }],
            rows.map((r) => [
              r.code, r.title, r.ownerPositionName ?? "Sin asignar",
              (r.currentLevel ?? "Sin evaluar") + (r.currentIsAcceptable === false ? " · sobre el criterio" : ""),
              RISK_STATUS_LABEL[r.status],
              r.treatmentStrategy ? RISK_STRATEGY_LABEL[r.treatmentStrategy] : "Sin tratar",
              r.nextReviewOn ?? "—",
              String(r.controlCount),
            ]),
            "No hay riesgos con ese filtro."
          )),
          section(null, note(
            "El NIVEL dice cuánto preocupa; el ESTADO dice en qué punto va la ficha. " +
            "Son ejes distintos: un riesgo alto puede estar activo y tratado, y uno bajo cerrado."
          )),
        ],
      },
    };
  },
};

export const qualityOpportunityDetail: ExportDefinition = {
  key: "quality.opportunity.detail",
  module: "quality",
  entity: "Oportunidad",
  recordType: "Oportunidad",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const o = await getOpportunity(req.id);
    if (!o || o.organizationId !== req.organizationId) return null;
    const priority = o.assessments.find((a) => a.kind === "prioritization") ?? null;
    const benefit = o.assessments.find((a) => a.kind === "realized_benefit") ?? null;
    const org = await organizationIdentity(req.organizationId);

    // §40 · Una oportunidad NO se imprime como «riesgo positivo». Su ficha
    // tiene sus propias preguntas: qué se vio, qué mejoraría, qué decidimos.
    return {
      filenameParts: { recordType: "Oportunidad", title: o.title, code: o.code },
      document: {
        recordType: "Oportunidad",
        title: o.title,
        code: o.code,
        badges: [
          { text: OPPORTUNITY_KIND_LABEL[o.opportunityKind], tone: "neutral" },
          { text: OPPORTUNITY_STATUS_LABEL[o.status], tone: o.status === "implemented" ? "good" : "info" },
          ...(o.treatmentDecision
            ? [{ text: OPPORTUNITY_DECISION_LABEL[o.treatmentDecision], tone: "info" as const }] : []),
          ...(o.priorityLevel ? [{ text: `Prioridad ${o.priorityLevel}`, tone: "info" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Qué se vio",
            fields([
              requiredField("Responsable", o.ownerPositionName ?? "Sin asignar"),
              requiredField("Identificada el", o.identifiedOn),
            ], 2),
            { type: "fields", items: [
              { label: "Situación observada", value: o.situation, wide: true },
              ...(o.expectedBenefit ? [{ label: "Beneficio esperado", value: o.expectedBenefit, wide: true }] : []),
            ] },
            o.processes.length > 0
              ? { type: "fields", items: [{ label: "Procesos relacionados", value: o.processes.map((p) => p.name).join(" · "), wide: true }] }
              : null,
            o.objectives.length > 0
              ? { type: "fields", items: [{ label: "Objetivos a los que contribuiría", value: o.objectives.map((x) => x.name).join(" · "), wide: true }] }
              : null,
          ),
          section("Priorización",
            priority
              ? fields([
                  requiredField("Prioridad", priority.derivation?.level_label ?? "—"),
                  requiredField("Evaluada el", priority.assessedOn),
                  requiredField("Por", priority.assessedByName ?? "—"),
                  requiredField("Metodología", `${priority.methodologyName} v${priority.versionNumber}`),
                ], 2)
              : { type: "paragraph", text: "Sin priorizar todavía.", muted: true },
            priority ? { type: "paragraph", text: explainDerivation(priority.derivation) ?? "" } : null,
          ),
          section("Decisión",
            o.treatmentDecision
              ? fields([
                  requiredField("Decisión", OPPORTUNITY_DECISION_LABEL[o.treatmentDecision]),
                  requiredField("Decidida el", o.decidedOn ?? "—"),
                ], 2)
              : { type: "paragraph", text: "Todavía no se ha decidido.", muted: true },
            o.treatmentRationale ? { type: "fields", items: [{ label: "Fundamento", value: o.treatmentRationale, wide: true }] } : null,
          ),
          section("Acciones de mejora", table(
            [{ header: "Código", width: 1.6 }, { header: "Acción", width: 5 },
             { header: "Estado", width: 2 }, { header: "Vence", width: 2 }],
            o.actions.map((a) => [a.code, a.title, a.status, a.dueOn ?? "—"]),
            "Sin acciones."
          ),
          note("La oportunidad no se convierte en la acción: sigue existiendo como el motivo por el que se hizo.")),
          ...(benefit ? [section("Beneficio obtenido",
            fields([
              requiredField("Resultado", benefit.derivation?.level_label ?? "—"),
              requiredField("Comprobado el", benefit.assessedOn),
            ], 2),
            benefit.rationale ? { type: "fields", items: [{ label: "Detalle", value: benefit.rationale, wide: true }] } : null,
          )] : []),
          section("Historial", timeline(
            o.decisions.map((d) => ({
              title: d.decisionKind === "opportunity_assessed" ? "Priorizada" : "Decisión de tratamiento",
              when: d.decidedAt.slice(0, 10),
              who: d.decidedByName,
              detail: d.rationale,
            })),
            "Sin decisiones registradas."
          )),
        ],
      },
    };
  },
};

export const qualityOpportunityList: ExportDefinition = {
  key: "quality.opportunity.list",
  module: "quality",
  entity: "Oportunidades",
  recordType: "Oportunidades",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  filters: [{ key: "estado", label: "Estado", kind: "enum",
              values: ["abiertas", "implementadas", "todas"] }],
  async load(req): Promise<ExportResult | null> {
    let rows = await listOpportunities(req.organizationId);
    const applied: { label: string; value: string }[] = [];
    const estado = req.filters.estado ?? "abiertas";
    if (estado === "abiertas") {
      rows = rows.filter((o) => o.status !== "closed" && o.status !== "discarded");
      applied.push({ label: "Estado", value: "Abiertas" });
    } else if (estado === "implementadas") {
      rows = rows.filter((o) => o.status === "implemented");
      applied.push({ label: "Estado", value: "Implementadas" });
    } else {
      applied.push({ label: "Estado", value: "Todas" });
    }
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Oportunidades", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Oportunidades", title: "Registro de oportunidades",
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Código", width: 1.6 }, { header: "Oportunidad", width: 5 },
           { header: "Tipo", width: 2 }, { header: "Prioridad", width: 1.8 },
           { header: "Estado", width: 2 }, { header: "Decisión", width: 2.2 }],
          rows.map((o) => [
            o.code, o.title, OPPORTUNITY_KIND_LABEL[o.opportunityKind],
            o.priorityLevel ?? "Sin priorizar",
            OPPORTUNITY_STATUS_LABEL[o.status],
            o.treatmentDecision ? OPPORTUNITY_DECISION_LABEL[o.treatmentDecision] : "Sin decidir",
          ]),
          "No hay oportunidades con ese filtro."
        ))],
      },
    };
  },
};

export const qualityMethodologyDetail: ExportDefinition = {
  key: "quality.methodology.detail",
  module: "quality",
  entity: "Metodología de valoración",
  recordType: "Metodología",
  kind: "historical",
  permission: "member",
  orientation: "landscape",
  async load(req): Promise<ExportResult | null> {
    const all = await listMethodologies(req.organizationId);
    // Sin identificador: la versión publicada de la metodología de riesgos.
    // Con él: ESA versión, aunque esté sustituida (§39).
    let meth = null as (typeof all)[number] | null;
    let version = null as ReturnType<typeof activeVersion> | null;
    if (req.id) {
      for (const m of all) {
        const v = m.versions.find((x) => x.versionId === req.id);
        if (v) { meth = m; version = v; break; }
      }
    } else {
      meth = all.find((m) => m.appliesTo === "risk" && activeVersion(m)) ?? null;
      version = meth ? activeVersion(meth) : null;
    }
    if (!meth || !version) return null;

    const dims = version.scales.filter((s) => s.scaleKind === "dimension");
    const result = version.scales.find((s) => s.scaleKind === "result");
    const org = await organizationIdentity(req.organizationId);

    const matrix = buildMatrix(version);

    return {
      filenameParts: { recordType: "Metodologia", title: meth.name, code: `v${version.versionNumber}` },
      document: {
        recordType: "Metodología de valoración",
        title: meth.name,
        code: `${meth.code} · v${version.versionNumber}`,
        subtitle: meth.appliesTo === "risk" ? "Riesgos" : "Oportunidades",
        badges: [
          { text: version.status === "published" ? "Publicada"
                : version.status === "superseded" ? "Sustituida"
                : version.status === "draft" ? "Borrador" : "Retirada",
            tone: version.status === "published" ? "good" : "neutral" },
        ],
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Vigente desde", version.effectiveFrom ?? "—"),
            requiredField("Vigente hasta", version.effectiveTo ?? "En vigor"),
            requiredField("Regla de combinación", aggregationLabel(version.aggregation)),
            requiredField("Publicada el", version.publishedAt?.slice(0, 10) ?? "—"),
          ], 2),
          version.changeNote ? { type: "fields", items: [{ label: "Qué cambió", value: version.changeNote, wide: true }] } : null),
          ...dims.map((s) => section(`Escala · ${s.label}`, table(
            [{ header: "Nivel", width: 3 }, { header: "Valor", width: 1 }, { header: "Descripción", width: 6 }],
            s.levels.map((l) => [l.label, String(l.value), l.description ?? "—"]),
            "Sin niveles."
          ))),
          ...(result ? [section(`Bandas de resultado · ${result.label}`, table(
            [{ header: "Nivel", width: 2 }, { header: "Desde", width: 1 }, { header: "Hasta", width: 1 },
             { header: "¿Aceptable?", width: 2 }, { header: "Revisar cada", width: 2 }],
            result.levels.map((l) => [
              l.label, String(l.minScore ?? "—"), String(l.maxScore ?? "—"),
              l.isAcceptable ? "Sí" : "No — exige decisión formal",
              l.reviewMonths ? `${l.reviewMonths} meses` : "—",
            ]),
            "Sin bandas."
          ))] : []),
          ...(matrix ? [section("Matriz", { type: "matrix", matrix })] : []),
          section(null, note(
            "Una versión publicada queda congelada. Para cambiar criterios se publica una versión " +
            "nueva; las evaluaciones ya hechas siguen explicándose con la suya."
          )),
        ],
      },
    };
  },
};

function aggregationLabel(a: string): string {
  switch (a) {
    case "product": return "Multiplicando los valores";
    case "sum": return "Sumando los valores";
    case "weighted_sum": return "Sumando los valores según su peso";
    case "max": return "Tomando el valor más alto";
    case "min": return "Tomando el valor más bajo";
    default: return a;
  }
}

/** La matriz se DERIVA de la versión. No hay ninguna 5×5 escrita aquí (§38). */
export function buildMatrix(
  version: { aggregation: string; scales: { scaleKind: string; code: string; label: string; weight: number;
             levels: { label: string; value: number; minScore: number | null; maxScore: number | null;
                       isAcceptable: boolean; reviewMonths: number | null }[] }[] },
  current?: { x?: string | null; y?: string | null }
): PrintMatrix | null {
  const dims = version.scales.filter((s) => s.scaleKind === "dimension");
  const result = version.scales.find((s) => s.scaleKind === "result");
  if (dims.length !== 2 || !result) return null;

  const [x, y] = dims;
  const cols = [...x.levels].sort((a, b) => a.value - b.value);
  const rows = [...y.levels].sort((a, b) => b.value - a.value);
  const bands = [...result.levels].sort((a, b) => (a.minScore ?? 0) - (b.minScore ?? 0));

  const combine = (a: number, b: number): number => {
    switch (version.aggregation) {
      case "sum": return a + b;
      case "weighted_sum": return a * x.weight + b * y.weight;
      case "max": return Math.max(a, b);
      case "min": return Math.min(a, b);
      default: return a * b;
    }
  };
  const bandOf = (score: number) => {
    const i = bands.findIndex(
      (l) => (l.minScore == null || score >= l.minScore) && (l.maxScore == null || score <= l.maxScore)
    );
    return i < 0 ? null : { band: bands[i], index: i };
  };
  const toneFor = (i: number): PrintMatrix["cells"][number][number]["tone"] => {
    if (bands.length <= 1) return "neutral";
    const r = i / (bands.length - 1);
    if (r < 0.34) return "good";
    if (r < 0.67) return "warn";
    return "danger";
  };

  return {
    rowsLabel: y.label,
    colsLabel: x.label,
    rowHeaders: rows.map((r) => r.label),
    colHeaders: cols.map((c) => c.label),
    cells: rows.map((r) =>
      cols.map((c) => {
        const score = combine(c.value, r.value);
        const b = bandOf(score);
        return {
          label: b?.band.label ?? "—",
          score: String(Number(score.toFixed(2))),
          tone: b ? toneFor(b.index) : "neutral",
          current: current?.x === c.label && current?.y === r.label,
        };
      })
    ),
    legend: bands.map((b, i) => ({
      label: b.label,
      detail: `${b.minScore ?? "—"}–${b.maxScore ?? "—"} · ${b.isAcceptable ? "aceptable" : "sobre el criterio"}` +
              (b.reviewMonths ? ` · revisar cada ${b.reviewMonths} m` : ""),
      tone: toneFor(i),
    })),
  };
}
