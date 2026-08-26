import "server-only";

import {
  getIndicator, getObjective, listIndicatorConfigs, listIndicators,
  listIndicatorsForObjective, listMeasurements, listObjectiveIndicatorIds, listObjectives,
} from "@/lib/db/quality-indicators";
import {
  DIRECTION_LABEL, EVALUATION_LABEL, FREQUENCY_LABEL, INDICATOR_ADMIN_STATE_LABEL,
  OBJECTIVE_ADMIN_STATE_LABEL, SOURCE_KIND_LABEL,
} from "@/lib/domain/quality-indicators";
import type { ExportDefinition, ExportResult } from "../registry-types";
import { fields, note, requiredField, section, table } from "../print-model";
import { organizationIdentity } from "../branding";

const SYSTEM = "Trazaloop Quality · objetivos e indicadores";

/**
 * §24, §32, §33 · La VERDAD HISTÓRICA de una medición.
 *
 * Este es el caso donde reconstruir el pasado con datos de hoy es más fácil y
 * más dañino. Si en enero la meta era 90 y hoy es 95, imprimir «enero: 82,
 * meta 95 → no cumple» convierte un incumplimiento leve en uno grave y hace
 * imposible defender la decisión que se tomó entonces.
 *
 * `listMeasurements` ya devuelve `appliedTargetValue`: la meta que REGÍA en
 * ese periodo. El PDF usa esa, nunca la vigente.
 */
function targetText(m: {
  appliedTargetValue: number | null; appliedTargetMin: number | null;
  appliedTargetMax: number | null; appliedDirection: string;
}): string {
  if (m.appliedTargetValue !== null) return String(m.appliedTargetValue);
  if (m.appliedTargetMin !== null || m.appliedTargetMax !== null) {
    return `${m.appliedTargetMin ?? "—"} – ${m.appliedTargetMax ?? "—"}`;
  }
  return "—";
}

export const qualityIndicatorDetail: ExportDefinition = {
  key: "quality.indicator.detail",
  module: "quality",
  entity: "Indicador",
  recordType: "Indicador",
  documentName: "Ficha de indicador",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const i = await getIndicator(req.organizationId, req.id);
    if (!i) return null;
    const [configs, measurements] = await Promise.all([
      listIndicatorConfigs(req.organizationId, i.indicatorId),
      listMeasurements(req.organizationId, i.indicatorId),
    ]);
    const org = await organizationIdentity(req.organizationId);
    const current = measurements.find((m) => m.isCurrent) ?? measurements[0] ?? null;

    return {
      filenameParts: { recordType: "Indicador", title: i.name, code: i.code },
      document: {
        recordType: "Indicador",
        title: i.name,
        code: i.code,
        subtitle: i.scopeProcessName ? `Proceso: ${i.scopeProcessName}` : "Alcance: toda la empresa",
        badges: [
          { text: INDICATOR_ADMIN_STATE_LABEL[i.adminState as never] ?? i.adminState,
            tone: i.adminState === "active" ? "good" : "neutral" },
          ...(current ? [{
            text: EVALUATION_LABEL[current.evaluation as never] ?? current.evaluation,
            tone: current.evaluation === "complies" ? "good" as const
                : current.evaluation === "not_met" ? "danger" as const : "warn" as const,
          }] : []),
        ],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad",
            fields([
              requiredField("Responsable", i.ownerPositionName ?? "Sin asignar"),
              requiredField("Unidad", i.unitLabel ?? i.unitCode ?? "—"),
              requiredField("Dirección", i.direction ? (DIRECTION_LABEL[i.direction as never] ?? i.direction) : "—"),
              requiredField("Periodicidad", i.frequency ? (FREQUENCY_LABEL[i.frequency as never] ?? i.frequency) : "—"),
            ], 2),
            i.description ? { type: "fields", items: [{ label: "Qué mide", value: i.description, wide: true }] } : null,
          ),
          section("Configuración vigente",
            fields([
              requiredField("Versión", i.configVersion ? `v${i.configVersion}` : "Sin configurar"),
              requiredField("Vigente desde", i.configEffectiveFrom ?? "—"),
              requiredField("Meta", i.targetValue !== null ? String(i.targetValue)
                : (i.targetMin !== null || i.targetMax !== null) ? `${i.targetMin ?? "—"} – ${i.targetMax ?? "—"}` : "—"),
              requiredField("Origen del dato", i.sourceKind ? (SOURCE_KIND_LABEL[i.sourceKind as never] ?? i.sourceKind) : "—"),
            ], 2)),
          section("Historial de mediciones", table(
            [{ header: "Periodo", width: 2 }, { header: "Resultado", width: 1.4 },
             { header: "Meta de entonces", width: 1.8 }, { header: "Evaluación", width: 1.8 },
             { header: "Estado del dato", width: 1.6 }, { header: "Corrección", width: 2.4 }],
            measurements.map((m) => [
              m.periodLabel,
              m.value === null ? "Sin dato" : String(m.value),
              targetText(m),
              EVALUATION_LABEL[m.evaluation as never] ?? m.evaluation,
              m.dataState,
              m.correctsMeasurementId ? `Corrige una anterior · ${m.correctionReason ?? ""}` : "—",
            ]),
            "Este indicador todavía no tiene mediciones."
          ),
          note(
            "La columna «Meta de entonces» es la que regía en ese periodo, no la vigente hoy. " +
            "Un resultado se juzga contra el criterio que existía cuando se midió."
          )),
          section("Historial de configuraciones", table(
            [{ header: "Versión", width: 1.2 }, { header: "Vigente desde", width: 1.8 },
             { header: "Hasta", width: 1.8 }, { header: "Meta", width: 1.8 },
             { header: "Periodicidad", width: 1.8 }, { header: "Qué cambió", width: 3 }],
            configs.map((c) => [
              `v${c.versionNumber}`, c.effectiveFrom, c.effectiveTo ?? "En vigor",
              c.targetValue !== null ? String(c.targetValue)
                : `${c.targetMin ?? "—"} – ${c.targetMax ?? "—"}`,
              FREQUENCY_LABEL[c.frequency as never] ?? c.frequency,
              c.changeNote ?? "—",
            ]),
            "Sin configuraciones."
          )),
        ],
      },
    };
  },
};

export const qualityIndicatorList: ExportDefinition = {
  key: "quality.indicator.list",
  module: "quality",
  entity: "Indicadores",
  recordType: "Indicadores",
  documentName: "Listado de indicadores",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  filters: [{ key: "estado", label: "Estado", kind: "enum", values: ["activos", "todos"] }],
  async load(req): Promise<ExportResult | null> {
    let rows = await listIndicators(req.organizationId);
    const applied: { label: string; value: string }[] = [];
    if ((req.filters.estado ?? "activos") === "activos") {
      rows = rows.filter((i) => i.adminState === "active");
      applied.push({ label: "Estado", value: "Activos" });
    } else applied.push({ label: "Estado", value: "Todos" });

    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Indicadores", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Indicadores", title: "Indicadores de desempeño",
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Código", width: 1.4 }, { header: "Indicador", width: 4.5 },
           { header: "Alcance", width: 2.4 }, { header: "Responsable", width: 2.4 },
           { header: "Meta", width: 1.4 }, { header: "Último resultado", width: 1.8 },
           { header: "Evaluación", width: 1.8 }, { header: "Estado", width: 1.4 }],
          rows.map((i) => [
            i.code ?? "—", i.name,
            i.scopeProcessName ?? "Toda la empresa",
            i.ownerPositionName ?? "Sin asignar",
            i.targetValue !== null ? String(i.targetValue) : "—",
            i.lastValue !== null && i.lastValue !== undefined ? String(i.lastValue) : "Sin dato",
            i.lastEvaluation ? (EVALUATION_LABEL[i.lastEvaluation as never] ?? i.lastEvaluation) : "—",
            INDICATOR_ADMIN_STATE_LABEL[i.adminState as never] ?? i.adminState,
          ]),
          "No hay indicadores con ese filtro."
        ))],
      },
    };
  },
};

export const qualityObjectiveDetail: ExportDefinition = {
  key: "quality.objective.detail",
  module: "quality",
  entity: "Objetivo",
  recordType: "Objetivo",
  documentName: "Ficha de objetivo",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const o = await getObjective(req.organizationId, req.id);
    if (!o) return null;
    // El objetivo guarda QUÉ indicadores lo comprueban; hay que resolver los
    // identificadores antes de pedir las filas.
    const indicatorIds = await listObjectiveIndicatorIds(req.organizationId, o.objectiveId);
    const indicators = await listIndicatorsForObjective(req.organizationId, indicatorIds);
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Objetivo", title: o.name, code: o.code },
      document: {
        recordType: "Objetivo",
        title: o.name,
        code: o.code,
        subtitle: `Vigencia: ${o.periodStart} — ${o.periodEnd}`,
        badges: [{ text: OBJECTIVE_ADMIN_STATE_LABEL[o.adminState as never] ?? o.adminState,
                   tone: o.adminState === "active" ? "good" : "neutral" }],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad",
            fields([
              requiredField("Responsable", o.ownerPositionName ?? "Sin asignar"),
              requiredField("Vigencia", `${o.periodStart} — ${o.periodEnd}`),
              requiredField("Regla de evaluación", o.evaluationRule),
              requiredField("Estado", OBJECTIVE_ADMIN_STATE_LABEL[o.adminState as never] ?? o.adminState),
            ], 2),
            o.purpose ? { type: "fields", items: [{ label: "Para qué", value: o.purpose, wide: true }] } : null,
            o.description ? { type: "fields", items: [{ label: "Descripción", value: o.description, wide: true }] } : null,
          ),
          section("Cómo se comprueba", table(
            [{ header: "Código", width: 1.5 }, { header: "Indicador", width: 5 },
             { header: "Meta", width: 1.5 }, { header: "Último resultado", width: 2 },
             { header: "Evaluación", width: 2 }],
            indicators.map((i) => [
              i.code ?? "—", i.name,
              i.targetValue !== null ? String(i.targetValue) : "—",
              i.lastValue !== null && i.lastValue !== undefined ? String(i.lastValue) : "Sin dato",
              i.lastEvaluation ? (EVALUATION_LABEL[i.lastEvaluation as never] ?? i.lastEvaluation) : "—",
            ]),
            "Este objetivo no tiene indicadores asociados."
          )),
          section("Desempeño", fields([
            requiredField("Indicadores que cumplen", String(o.indicatorsComplying)),
            requiredField("En atención", String(o.indicatorsAttention)),
            requiredField("Fuera de meta", String(o.indicatorsNotMet)),
            requiredField("Sin dato", String(o.indicatorsWithoutData)),
          ], 2)),
        ],
      },
    };
  },
};

export const qualityObjectiveList: ExportDefinition = {
  key: "quality.objective.list",
  module: "quality",
  entity: "Objetivos",
  recordType: "Objetivos",
  documentName: "Listado de objetivos",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  filters: [{ key: "estado", label: "Estado", kind: "enum", values: ["activos", "todos"] }],
  async load(req): Promise<ExportResult | null> {
    let rows = await listObjectives(req.organizationId);
    const applied: { label: string; value: string }[] = [];
    if ((req.filters.estado ?? "activos") === "activos") {
      rows = rows.filter((o) => o.adminState === "active");
      applied.push({ label: "Estado", value: "Activos" });
    } else applied.push({ label: "Estado", value: "Todos" });
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Objetivos", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Objetivos", title: "Objetivos de calidad",
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Código", width: 1.4 }, { header: "Objetivo", width: 5 },
           { header: "Responsable", width: 2.4 }, { header: "Vigencia", width: 2.6 },
           { header: "Indicadores", width: 1.4 }, { header: "Fuera de meta", width: 1.6 }],
          rows.map((o) => [
            o.code ?? "—", o.name, o.ownerPositionName ?? "Sin asignar",
            `${o.periodStart} — ${o.periodEnd}`,
            String(o.indicatorCount), String(o.indicatorsNotMet),
          ]),
          "No hay objetivos con ese filtro."
        ))],
      },
    };
  },
};
