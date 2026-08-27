import "server-only";

import {
  describeVersion, getRule, getRun, getSignal, listRules, listRuns, listSignals,
  listSources, listVersions,
} from "@/lib/db/quality-automation";
import {
  ACKNOWLEDGE_IS_NOT_RESOLVE, ALERT_IS_NOT_A_TASK, AUTOMATION_DOMAIN_LABEL,
  AUTOMATION_IS_NOT_AI, AUTONOMY_LEVEL_LABEL, AUTONOMY_LEVEL_MEANING,
  AUTO_RESOLUTION_LIMITS, CONDITION_IS_NOT_A_DECISION, CUSTOMER_ANONYMITY_HOLDS,
  describeCondition, describeRun, describeSignalOrigin, explanationLines,
  FAILURE_IS_ISOLATED,
  formatDate, formatDateTime, IDEMPOTENT_AND_REARMS, NO_EMPLOYEE_SURVEILLANCE,
  NO_LEVEL_DECIDES, OUTPUT_KIND_LABEL, RECIPIENT_KIND_LABEL,
  RUN_COUNTS_WHAT_IT_CREATED, RUN_KIND_LABEL, RUN_STATUS_LABEL,
  RULE_STATUS_LABEL, SEVERITY_LABEL, SIGNAL_IS_NOT_AN_ALERT,
  SIGNAL_STATUS_LABEL, SNAPSHOT_IS_MINIMAL, TASK_IS_NOT_AN_ACTION,
  VERSION_IS_FROZEN, VERSION_STATUS_LABEL,
  type AutomationDomain, type AutonomyLevel, type OutputKind,
  type RecipientKind, type RunKind, type RunStatus, type RuleStatus,
  type Severity, type SignalStatus, type VersionStatus,
} from "@/lib/domain/quality-automation";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  currentStateNote, field, fields, note, paragraph, requiredField, section, table,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * Trazaloop · QUALITY-11 · Los papeles de la Automatización.
 *
 * CUATRO REGLAS QUE ATRAVIESAN LOS SEIS
 *
 * §41 · TODO SE EXPLICA. Ninguna señal se imprime sin decir qué regla la
 * produjo, con qué versión, con qué condición y con qué valores. Una señal que
 * no se puede explicar no sirve de nada en una reunión ni delante de un auditor.
 *
 * §21 · LA VERSIÓN MANDA. La señal que emitió la v1 se imprime con la v1,
 * aunque hoy exista una v3 que avisa a otros días.
 *
 * §19 · NINGUNO AFIRMA QUE LA PLATAFORMA DECIDIÓ. Ni «no conformidad», ni
 * «proveedor rechazado», ni «persona no competente».
 *
 * §92 · Y NINGUNO ROMPE EL ANONIMATO. En una señal de voz del cliente hay
 * métricas; no hay respondentes, porque en la señal nunca se guardó ninguno.
 */

const SYSTEM = "Trazaloop Quality · automatización";

function stamp(iso: string): string {
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// 1 · Listado de reglas
// ---------------------------------------------------------------------------

export const qualityAutomationRuleList: ExportDefinition = {
  key: "quality.automation-rule.list",
  module: "quality",
  entity: "Listado de reglas de automatización",
  recordType: "Reglas de automatización",
  documentName: "Listado de reglas de automatización",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata qué observa la plataforma HOY. Lo fechado son las versiones "
    + "de cada regla, que conservan su vigencia y su contenido.",
  filters: [
    {
      key: "status", label: "Estado", kind: "enum",
      values: ["draft", "active", "inactive", "retired"],
    },
    {
      key: "category", label: "Dominio", kind: "enum",
      values: ["documents", "indicators", "objectives", "cases", "actions", "risks",
               "people", "suppliers", "customer", "audits", "management_review",
               "cross_domain"],
    },
  ],
  async load(req): Promise<ExportResult | null> {
    const [rules, org] = await Promise.all([
      listRules(req.organizationId, {
        status: req.filters.status, category: req.filters.category,
      }),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Reglas de automatización", title: "Listado",
        code: null, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Reglas de automatización",
        title: "Listado de reglas de automatización",
        code: null,
        subtitle: `${rules.length} regla(s)`,
        badges: [],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(AUTOMATION_IS_NOT_AI), note(CONDITION_IS_NOT_A_DECISION),
            currentStateNote(req.generatedAt)),
          section("Reglas", table(
            [
              { header: "Código", width: 2 },
              { header: "Regla", width: 4 },
              { header: "Dominio", width: 2 },
              { header: "Observa", width: 3 },
              { header: "Versión vigente", width: 2 },
              { header: "Autonomía", width: 1 },
              { header: "Estado", width: 2 },
              { header: "Señales abiertas", width: 2 },
              { header: "Última evaluación", width: 2 },
            ],
            rules.map((r) => [
              r.code, r.name,
              AUTOMATION_DOMAIN_LABEL[r.category as AutomationDomain] ?? r.category,
              r.sourceLabel,
              r.currentVersionNumber !== null
                ? `v${r.currentVersionNumber} desde ${formatDate(r.currentEffectiveFrom)}`
                : "Sin publicar",
              r.autonomyLevel,
              r.isSuppressed ? "Silenciada"
                : (RULE_STATUS_LABEL[r.status as RuleStatus] ?? r.status),
              `${r.openSignalCount}`
                + (r.criticalSignalCount > 0 ? ` · ${r.criticalSignalCount} crítica(s)` : ""),
              r.lastEvaluatedAt ? formatDate(r.lastEvaluatedAt) : "Nunca",
            ]),
            "Todavía no hay ninguna regla."
          )),
          section(null, note(NO_LEVEL_DECIDES)),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 2 · Ficha de una regla, con todas sus versiones
// ---------------------------------------------------------------------------

export const qualityAutomationRuleDetail: ExportDefinition = {
  key: "quality.automation-rule.detail",
  module: "quality",
  entity: "Regla de automatización",
  recordType: "Regla de automatización",
  documentName: "Ficha de regla de automatización",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const rule = await getRule(req.organizationId, req.id);
    if (!rule) return null;

    const [versions, sources, signals, org] = await Promise.all([
      listVersions(req.organizationId, rule.id),
      listSources(),
      listSignals(req.organizationId, { ruleId: rule.id }),
      organizationIdentity(req.organizationId),
    ]);
    const fuente = sources.find((s) => s.code === rule.sourceCode) ?? null;
    const etiquetas = Object.fromEntries((fuente?.fields ?? []).map((f) => [f.field, f.label]));
    const vigente = versions.find((v) => v.status === "published") ?? null;
    const resumen = vigente ? await describeVersion(vigente.id) : null;

    return {
      filenameParts: {
        recordType: "Regla de automatización", title: rule.name,
        code: rule.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Regla de automatización",
        title: rule.name,
        code: rule.code,
        subtitle: rule.sourceLabel,
        badges: [
          { text: RULE_STATUS_LABEL[rule.status as RuleStatus] ?? rule.status,
            tone: "info" as const },
          ...(rule.isSuppressed ? [{ text: "Silenciada", tone: "warn" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(AUTOMATION_IS_NOT_AI), note(VERSION_IS_FROZEN)),
          // §132 · Lo que un papel de regla tiene que decir.
          section("Identificación", fields([
            requiredField("Código", rule.code),
            requiredField("Nombre", rule.name),
            requiredField("Dominio",
              AUTOMATION_DOMAIN_LABEL[rule.category as AutomationDomain] ?? rule.category),
            requiredField("Qué observa", rule.sourceLabel),
            requiredField("Estado", RULE_STATUS_LABEL[rule.status as RuleStatus] ?? rule.status),
            requiredField("Nivel de autonomía",
              AUTONOMY_LEVEL_LABEL[rule.autonomyLevel as AutonomyLevel] ?? rule.autonomyLevel),
            requiredField("Cargo responsable", rule.ownerPositionName ?? "Sin asignar"),
            field("Creada desde plantilla", rule.templateCode),
          ])),
          section("Descripción", paragraph(rule.description)),
          section("Qué hace", paragraph(resumen),
            note(AUTONOMY_LEVEL_MEANING[rule.autonomyLevel as AutonomyLevel] ?? ""),
            note(NO_LEVEL_DECIDES)),
          // §132 · Todas las versiones, con sus condiciones y su vigencia.
          ...versions.map((v) =>
            section(`Versión ${v.versionNumber} · ${VERSION_STATUS_LABEL[v.status as VersionStatus]}`,
              fields([
                requiredField("Estado", VERSION_STATUS_LABEL[v.status as VersionStatus]),
                requiredField("Disparo", v.triggerKind === "schedule"
                  ? `Observación programada (${v.scheduleFrequency})` : "Por evento"),
                requiredField("Gravedad", SEVERITY_LABEL[v.severity as Severity]),
                requiredField("Vigente desde", formatDate(v.effectiveFrom)),
                field("Vigente hasta", v.effectiveTo ? formatDate(v.effectiveTo) : null),
                field("Qué cambió", v.changeNote),
              ]),
              table(
                [{ header: "Condición", width: 10 }],
                v.conditions.map((c) => [describeCondition(c, etiquetas[c.field])]),
                "Sin condiciones."),
              table(
                [
                  { header: "Salida", width: 4 },
                  { header: "Destinatario", width: 4 },
                  { header: "Plazo", width: 2 },
                ],
                v.outputs.map((o) => [
                  OUTPUT_KIND_LABEL[o.kind as OutputKind] ?? o.kind,
                  o.recipientKind
                    ? (RECIPIENT_KIND_LABEL[o.recipientKind as RecipientKind] ?? o.recipientKind)
                    : "—",
                  o.dueInDays !== undefined ? `${o.dueInDays} días` : "—",
                ]),
                "Sin salidas."))
          ),
          section("Señales que ha emitido", table(
            [
              { header: "Señal", width: 4 },
              { header: "Objeto", width: 3 },
              { header: "Versión", width: 1 },
              { header: "Detectada", width: 2 },
              { header: "Estado", width: 2 },
            ],
            signals.slice(0, 50).map((s) => [
              s.title, s.subjectLabel ?? "—",
              s.ruleVersionNumber !== null ? `v${s.ruleVersionNumber}` : "—",
              formatDate(s.firstDetectedAt),
              SIGNAL_STATUS_LABEL[s.status as SignalStatus] ?? s.status,
            ]),
            "Esta regla no ha emitido ninguna señal todavía."
          ), note(
            "Cada señal se explica con la versión que la emitió, no con la "
            + "vigente hoy. Si la regla cambió, la señal antigua sigue diciendo "
            + "lo que decía."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 3 · Listado de señales
// ---------------------------------------------------------------------------

export const qualityAutomationSignalList: ExportDefinition = {
  key: "quality.automation-signal.list",
  module: "quality",
  entity: "Listado de señales de automatización",
  recordType: "Señales",
  documentName: "Listado de señales",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata lo que sigue siendo cierto hoy. Cada señal, por separado, sí "
    + "conserva cuándo se detectó por primera vez y con qué versión de la regla.",
  filters: [
    {
      key: "status", label: "Estado", kind: "enum",
      values: ["open", "acknowledged", "in_treatment", "resolved", "dismissed", "suppressed"],
    },
    { key: "severity", label: "Gravedad", kind: "enum",
      values: ["info", "warning", "critical"] },
    {
      key: "domain", label: "Dominio", kind: "enum",
      values: ["documents", "indicators", "objectives", "cases", "actions", "risks",
               "people", "suppliers", "customer", "audits", "management_review"],
    },
  ],
  async load(req): Promise<ExportResult | null> {
    const [signals, org] = await Promise.all([
      listSignals(req.organizationId, {
        status: req.filters.status, severity: req.filters.severity,
        domain: req.filters.domain,
      }),
      organizationIdentity(req.organizationId),
    ]);
    const abiertas = signals.filter((s) => s.resolvedAt === null);

    return {
      filenameParts: {
        recordType: "Señales", title: "Listado",
        code: null, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Señales",
        title: "Listado de señales",
        code: null,
        subtitle: `${signals.length} señal(es) · ${abiertas.length} abierta(s)`,
        badges: [],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(SIGNAL_IS_NOT_AN_ALERT), note(ALERT_IS_NOT_A_TASK),
            note(IDEMPOTENT_AND_REARMS), currentStateNote(req.generatedAt)),
          section("Señales", table(
            [
              { header: "Gravedad", width: 1 },
              { header: "Señal", width: 4 },
              { header: "Objeto", width: 3 },
              { header: "Dominio", width: 2 },
              { header: "Regla", width: 2 },
              { header: "Versión", width: 1 },
              { header: "Detectada", width: 2 },
              { header: "Veces", width: 1 },
              { header: "Avisos", width: 1 },
              { header: "Tareas", width: 1 },
              { header: "Estado", width: 2 },
            ],
            signals.map((s) => [
              SEVERITY_LABEL[s.severity as Severity] ?? s.severity,
              s.title, s.subjectLabel ?? "—",
              AUTOMATION_DOMAIN_LABEL[s.domain as AutomationDomain] ?? s.domain,
              s.ruleCode ?? "—",
              s.ruleVersionNumber !== null ? `v${s.ruleVersionNumber}` : "—",
              formatDate(s.firstDetectedAt),
              String(s.detectionCount),
              String(s.alertCount),
              String(s.taskCount),
              SIGNAL_STATUS_LABEL[s.status as SignalStatus] ?? s.status,
            ]),
            "No hay ninguna señal."
          )),
          section(null, note(
            "Las columnas «Avisos» y «Tareas» son números distintos a propósito: "
            + "avisar a alguien no es asignarle trabajo, y una señal puede "
            + "producir uno, la otra, las dos o ninguna."
          ), note(TASK_IS_NOT_AN_ACTION)),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 4 · Ficha de una señal — §133
// ---------------------------------------------------------------------------

export const qualityAutomationSignalDetail: ExportDefinition = {
  key: "quality.automation-signal.detail",
  module: "quality",
  entity: "Señal de automatización",
  recordType: "Señal",
  documentName: "Ficha de señal",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const signal = await getSignal(req.organizationId, req.id);
    if (!signal) return null;
    const org = await organizationIdentity(req.organizationId);
    const retrato = signal.sourceSnapshot ?? {};

    return {
      filenameParts: {
        recordType: "Señal", title: signal.title,
        code: signal.ruleCode, stamp: stamp(signal.firstDetectedAt),
      },
      document: {
        recordType: "Señal",
        title: signal.title,
        code: signal.ruleCode,
        subtitle: signal.subjectLabel,
        badges: [
          { text: SEVERITY_LABEL[signal.severity as Severity] ?? signal.severity,
            tone: signal.severity === "critical" ? "warn" as const : "info" as const },
          { text: SIGNAL_STATUS_LABEL[signal.status as SignalStatus] ?? signal.status,
            tone: "info" as const },
          ...(signal.recipientUnresolved
            ? [{ text: "Sin destinatario", tone: "warn" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(SIGNAL_IS_NOT_AN_ALERT), note(CONDITION_IS_NOT_A_DECISION)),
          // §133 · Qué, dónde, cuándo, con qué regla y con qué versión.
          section("Qué se detectó", fields([
            requiredField("Señal", signal.title),
            requiredField("Objeto observado", signal.subjectLabel ?? "—"),
            requiredField("Dominio",
              AUTOMATION_DOMAIN_LABEL[signal.domain as AutomationDomain] ?? signal.domain),
            requiredField("Fuente observada", signal.sourceLabel),
            requiredField("Gravedad", SEVERITY_LABEL[signal.severity as Severity]),
            requiredField("Estado", SIGNAL_STATUS_LABEL[signal.status as SignalStatus]),
          ])),
          section("Con qué regla", fields([
            requiredField("Regla", signal.ruleName ?? "—"),
            field("Código", signal.ruleCode),
            requiredField("Versión de la regla",
              signal.ruleVersionNumber !== null ? `v${signal.ruleVersionNumber}` : "—"),
            // QUALITY-11.1 · §38 · Y por qué camino se detectó.
            requiredField("Origen",
              describeSignalOrigin(signal.fromEvent, signal.sourceEventLabel)),
            field("El hecho ocurrió",
              signal.sourceEventAt ? formatDateTime(signal.sourceEventAt) : null),
          ]), note(
            "Esta señal se explica con la versión que la emitió. Si la regla "
            + "cambió después, este papel sigue diciendo lo que decía entonces."
          )),
          section("Cuándo", fields([
            requiredField("Detectada por primera vez", formatDateTime(signal.firstDetectedAt)),
            requiredField("Vista por última vez", formatDateTime(signal.lastDetectedAt)),
            requiredField("Veces detectada", String(signal.detectionCount)),
          ]), note(IDEMPOTENT_AND_REARMS)),
          // §41 · Por qué disparó, línea a línea.
          section("Por qué se generó", table(
            [{ header: "Explicación", width: 10 }],
            explanationLines(signal.explanation).map((l) => [l]),
            "—"
          )),
          section("Datos que la regla miró", table(
            [{ header: "Campo", width: 4 }, { header: "Valor", width: 6 }],
            Object.entries(retrato).map(([k, v]) => [
              k, v === null ? "sin dato" : JSON.stringify(v),
            ]),
            "La regla no guardó ningún dato."
          ), note(SNAPSHOT_IS_MINIMAL),
             signal.domain === "customer" ? note(CUSTOMER_ANONYMITY_HOLDS) : null,
             signal.domain === "people" ? note(NO_EMPLOYEE_SURVEILLANCE) : null),
          section("Qué hizo el sistema", fields([
            requiredField("Avisos emitidos", String(signal.alertCount)),
            requiredField("Tareas creadas", String(signal.taskCount)),
            requiredField("Tareas abiertas", String(signal.openTaskCount)),
            requiredField("Destinatario resuelto",
              signal.recipientUnresolved ? "No: nadie con cuenta en el cargo" : "Sí"),
          ]), note(ALERT_IS_NOT_A_TASK), note(TASK_IS_NOT_AN_ACTION)),
          section("Resolución", fields([
            field("Reconocida el", signal.acknowledgedAt
              ? formatDateTime(signal.acknowledgedAt) : null),
            field("Cerrada el", signal.resolvedAt ? formatDateTime(signal.resolvedAt) : null),
            field("Cómo", signal.resolutionKind === "auto"
              ? "La condición dejó de cumplirse"
              : signal.resolutionKind === "manual" ? "Resuelta por una persona"
                : signal.resolutionKind === "dismissed" ? "Descartada"
                  : signal.resolutionKind === "suppressed" ? "Silenciada" : null),
          ]), paragraph(signal.resolutionNote),
             note(ACKNOWLEDGE_IS_NOT_RESOLVE), note(AUTO_RESOLUTION_LIMITS)),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 5 · Informe de una ejecución — §134
// ---------------------------------------------------------------------------

export const qualityAutomationRunDetail: ExportDefinition = {
  key: "quality.automation-run.detail",
  module: "quality",
  entity: "Ejecución de la automatización",
  recordType: "Ejecución de la automatización",
  documentName: "Informe de ejecución de la automatización",
  kind: "detail",
  permission: "member",
  orientation: "landscape",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const run = await getRun(req.organizationId, req.id);
    if (!run) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Ejecución de la automatización",
        title: RUN_KIND_LABEL[run.runKind as RunKind] ?? run.runKind,
        code: null, stamp: stamp(run.startedAt),
      },
      document: {
        recordType: "Ejecución de la automatización",
        title: `Ejecución del ${formatDateTime(run.startedAt)}`,
        code: null,
        subtitle: describeRun(run),
        badges: [
          { text: RUN_KIND_LABEL[run.runKind as RunKind] ?? run.runKind, tone: "info" as const },
          { text: RUN_STATUS_LABEL[run.status as RunStatus] ?? run.status,
            tone: run.status === "success" ? "info" as const : "warn" as const },
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(RUN_COUNTS_WHAT_IT_CREATED), note(FAILURE_IS_ISOLATED)),
          // §134 · Alcance, inicio, fin, reglas, sujetos, coincidencias, salidas
          // y fallos. Y ningún secreto.
          section("La ejecución", fields([
            requiredField("Tipo", RUN_KIND_LABEL[run.runKind as RunKind]),
            requiredField("Estado", RUN_STATUS_LABEL[run.status as RunStatus]),
            requiredField("Día de negocio evaluado", formatDate(run.businessDate)),
            requiredField("Empezó", formatDateTime(run.startedAt)),
            requiredField("Terminó", run.finishedAt ? formatDateTime(run.finishedAt) : "—"),
            requiredField("Duración", run.durationMs !== null ? `${run.durationMs} ms` : "—"),
          ])),
          section("Alcance", fields([
            requiredField("Reglas evaluadas", String(run.rulesEvaluated)),
            requiredField("De la empresa", String(run.organizationRules)),
            requiredField("Observadores de plataforma", String(run.platformObservers)),
            requiredField("Sujetos evaluados", String(run.subjectsEvaluated)),
          ]), note(
            "Los observadores de plataforma son los barridos que QUALITY-03 a "
            + "QUALITY-10 ya traían. Se ejecutan aquí para que exista UNA sola "
            + "puerta: no se han reescrito ni duplicado."
          )),
          section("Resultado", fields([
            requiredField("Coincidencias", String(run.matches)),
            requiredField("Señales nuevas", String(run.signalsCreated)),
            requiredField("Avisos nuevos", String(run.alertsCreated)),
            requiredField("Tareas nuevas", String(run.tasksCreated)),
            requiredField("Fallos", String(run.failures)),
          ])),
          section("Qué se evaluó, una por una", table(
            [
              { header: "Regla u observador", width: 4 },
              { header: "Sujetos", width: 1 },
              { header: "Coincidencias", width: 1 },
              { header: "Señales", width: 1 },
              { header: "Avisos", width: 1 },
              { header: "Tareas", width: 1 },
              { header: "Estado", width: 1 },
              { header: "Duración", width: 1 },
              { header: "Mensaje", width: 4 },
            ],
            run.detail.map((d) => [
              d.ruleName ?? d.platformObserver ?? "—",
              String(d.subjectsEvaluated), String(d.matches),
              String(d.signalsCreated), String(d.alertsCreated), String(d.tasksCreated),
              d.status === "success" ? "Correcta"
                : d.status === "failed" ? "Falló" : "Omitida",
              d.durationMs !== null ? `${d.durationMs} ms` : "—",
              d.errorMessage ?? "—",
            ]),
            "La ejecución no evaluó nada."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 6 · Histórico de ejecuciones
// ---------------------------------------------------------------------------

export const qualityAutomationRunList: ExportDefinition = {
  key: "quality.automation-run.list",
  module: "quality",
  entity: "Histórico de ejecuciones de la automatización",
  recordType: "Ejecuciones de la automatización",
  documentName: "Reporte de ejecuciones de la automatización",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El histórico se compone con las ejecuciones que existen hoy. Cada una, por "
    + "separado, sí es un documento del pasado y se imprime tal cual ocurrió.",
  async load(req): Promise<ExportResult | null> {
    const [runs, org] = await Promise.all([
      listRuns(req.organizationId, 200),
      organizationIdentity(req.organizationId),
    ]);
    const fallidas = runs.filter((r) => r.status === "failed" || r.status === "partial");

    return {
      filenameParts: {
        recordType: "Ejecuciones de la automatización", title: "Reporte",
        code: null, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Ejecuciones de la automatización",
        title: "Reporte de ejecuciones de la automatización",
        code: null,
        subtitle: `${runs.length} ejecución(es) · ${fallidas.length} con fallos`,
        badges: [],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(RUN_COUNTS_WHAT_IT_CREATED), currentStateNote(req.generatedAt)),
          section("Ejecuciones", table(
            [
              { header: "Cuándo", width: 3 },
              { header: "Día de negocio", width: 2 },
              { header: "Tipo", width: 2 },
              { header: "Estado", width: 2 },
              { header: "Reglas", width: 1 },
              { header: "Sujetos", width: 1 },
              { header: "Coincidencias", width: 1 },
              { header: "Señales", width: 1 },
              { header: "Avisos", width: 1 },
              { header: "Tareas", width: 1 },
              { header: "Fallos", width: 1 },
              { header: "Duración", width: 2 },
            ],
            runs.map((r) => [
              formatDateTime(r.startedAt), formatDate(r.businessDate),
              RUN_KIND_LABEL[r.runKind as RunKind] ?? r.runKind,
              RUN_STATUS_LABEL[r.status as RunStatus] ?? r.status,
              String(r.rulesEvaluated), String(r.subjectsEvaluated), String(r.matches),
              String(r.signalsCreated), String(r.alertsCreated), String(r.tasksCreated),
              String(r.failures),
              r.durationMs !== null ? `${r.durationMs} ms` : "—",
            ]),
            "Todavía no se ha ejecutado ningún barrido."
          )),
          section(null, note(
            "Una ejecución con cero señales nuevas NO es una ejecución fallida: "
            + "es lo que ocurre cuando nada ha cambiado desde la anterior, y es "
            + "exactamente lo que se espera de un motor idempotente."
          )),
        ],
      },
    };
  },
};
