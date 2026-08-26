import "server-only";

import {
  findMapIdByVersion, findProcessIdByRevision, getQualityMapDetail,
  getQualityProcessDetail,
} from "@/lib/db/quality-processes";
import { getDocumentControlDetail, listMyAlerts, listMyTasks } from "@/lib/db/document-control";
import { getIndicator, listIndicatorConfigs, listMeasurements } from "@/lib/db/quality-indicators";
import { getMethodologyVersion } from "@/lib/db/risks";
import {
  QUALITY_CATEGORY_LABEL as CATEGORY_LABEL,
  QUALITY_IO_KIND_LABEL as IO_KIND_LABEL,
  QUALITY_REVISION_STATUS_LABEL as REVISION_STATUS_LABEL,
} from "@/lib/domain/quality-processes";
import { QUALITY_DOC_MODULE } from "@/lib/db/quality-documents";
import { LIFECYCLE_LABEL } from "@/lib/domain/document-control";
import {
  AGGREGATION_LABEL, METHODOLOGY_APPROACH_LABEL, METHODOLOGY_SCOPE_LABEL,
  VERSION_STATUS_LABEL,
} from "@/lib/domain/risks";
import { EVALUATION_LABEL } from "@/lib/domain/quality-indicators";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  currentStateNote, fields, note, paragraph, requiredField, section, table,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * EXPORT-01.1 · Los registros que SÍ son del pasado.
 *
 * Una revisión de proceso, una versión del mapa, una revisión documental, una
 * medición y una versión de metodología tienen algo en común que las separa de
 * casi todo lo demás: la base guarda su versión. No hay que reconstruir nada,
 * solo dejar de imprimirlas únicamente dentro de la ficha viva de su padre —
 * que cambia — y darles hoja propia.
 *
 * Esa es la diferencia entre un documento histórico y una foto de hoy con
 * fecha antigua escrita encima.
 */
const SYSTEM = "Trazaloop Quality · sistema de gestión";
const SYSTEM_PERF = "Trazaloop Quality · desempeño";
const SYSTEM_RISK = "Trazaloop Quality · riesgos y oportunidades";

const day = (v: string | null | undefined): string => (v ? v.slice(0, 10) : "—");
const num = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : String(v);

/* -------------------------------------------------------------------------
 * Revisión de proceso (§31)
 * ---------------------------------------------------------------------- */

export const qualityProcessRevisionDetail: ExportDefinition = {
  key: "quality.process-revision.detail",
  module: "quality",
  entity: "Revisión de proceso",
  recordType: "Revisión de proceso",
  documentName: "Revisión de proceso",
  kind: "historical",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const processId = await findProcessIdByRevision(req.organizationId, req.id);
    if (!processId) return null;
    // El detalle ya sabe mostrar UNA revisión concreta: se le pide esa, no la
    // vigente. Reescribirlo aquí habría creado un segundo relato del proceso.
    const detail = await getQualityProcessDetail(req.organizationId, processId, req.id);
    if (!detail) return null;

    const rev = detail.revisions.find((r) => r.id === req.id);
    if (!rev) return null;
    const p = detail.process;
    const inputs = detail.io.filter((i) => i.direction === "input");
    const outputs = detail.io.filter((i) => i.direction === "output");
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Revision-de-proceso",
        title: p.name,
        code: `${p.code ?? ""}-rev${rev.revisionNumber}`.replace(/^-/, ""),
      },
      document: {
        recordType: "Revisión de proceso",
        title: `${p.name} · revisión ${rev.revisionNumber}`,
        code: p.code,
        subtitle: CATEGORY_LABEL[p.categoryCode as never] ?? p.categoryCode,
        badges: [
          { text: REVISION_STATUS_LABEL[rev.status as never] ?? rev.status, tone: "info" },
        ],
        organization: org,
        systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        sections: [
          section("Vigencia de ESTA revisión", fields([
            requiredField("Revisión", String(rev.revisionNumber)),
            requiredField("Estado", REVISION_STATUS_LABEL[rev.status as never] ?? rev.status),
            requiredField("Vigente desde", day(rev.effectiveFrom)),
            requiredField("Vigente hasta", day(rev.effectiveTo)),
          ], 2),
          paragraph(rev.changeNote)),
          section("Contenido de la revisión",
            rev.purpose ? { type: "fields", items: [{ label: "Propósito", value: rev.purpose, wide: true }] } : null,
            rev.scope ? { type: "fields", items: [{ label: "Alcance", value: rev.scope, wide: true }] } : null),
          section("Entradas de esta revisión", table(
            [{ header: "Entrada", width: 4 }, { header: "Tipo", width: 2 }, { header: "Descripción", width: 5 }],
            inputs.map((i) => [i.name, IO_KIND_LABEL[i.ioKind as never] ?? i.ioKind, i.description ?? "—"]),
            "Esta revisión no declara entradas."
          )),
          section("Salidas de esta revisión", table(
            [{ header: "Salida", width: 4 }, { header: "Tipo", width: 2 }, { header: "Descripción", width: 5 }],
            outputs.map((o) => [o.name, IO_KIND_LABEL[o.ioKind as never] ?? o.ioKind, o.description ?? "—"]),
            "Esta revisión no declara salidas."
          )),
          section(null, note(
            "Este documento reproduce el contenido de UNA revisión concreta. " +
            "El proceso puede haber cambiado después; esta hoja no cambia con él."
          )),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Versión del mapa (§31)
 * ---------------------------------------------------------------------- */

export const qualityMapVersionDetail: ExportDefinition = {
  key: "quality.map-version.detail",
  module: "quality",
  entity: "Versión del mapa de procesos",
  recordType: "Versión del mapa",
  documentName: "Versión del mapa de procesos",
  kind: "historical",
  permission: "member",
  orientation: "landscape",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const mapId = await findMapIdByVersion(req.organizationId, req.id);
    if (!mapId) return null;
    const detail = await getQualityMapDetail(req.organizationId, mapId, req.id);
    if (!detail) return null;
    const v = detail.versions.find((x) => x.id === req.id) ?? detail.shownVersion;
    if (!v) return null;
    const org = await organizationIdentity(req.organizationId);

    const groups = new Map<string, { id: string; label: string; sublabel?: string | null }[]>();
    for (const n of detail.nodes) {
      const key = CATEGORY_LABEL[n.categoryCode as never] ?? n.categoryCode ?? "Sin categoría";
      const list = groups.get(key) ?? [];
      list.push({ id: n.processId, label: n.processName, sublabel: n.processCode });
      groups.set(key, list);
    }

    return {
      filenameParts: {
        recordType: "Mapa-de-procesos",
        title: detail.map.name,
        code: `v${v.versionNumber}`,
      },
      document: {
        recordType: "Versión del mapa",
        title: `${detail.map.name} · versión ${v.versionNumber}`,
        subtitle: `Vigente desde ${day(v.effectiveFrom)} hasta ${day(v.effectiveTo)}`,
        badges: [{ text: REVISION_STATUS_LABEL[v.status as never] ?? v.status, tone: "info" }],
        organization: org,
        systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        sections: [
          section("Procesos y relaciones de ESTA versión", {
            type: "graph",
            graph: {
              groups: [...groups.entries()].map(([title, nodes]) => ({ title, nodes })),
              edges: detail.edges.map((e) => ({
                from: e.sourceProcessId,
                to: e.targetProcessId,
                label: e.informationItem ?? null,
              })),
            },
          }),
          section(null, paragraph(v.changeNote), note(
            "Este mapa reproduce la versión publicada tal como quedó. Los " +
            "cambios posteriores en los procesos no la modifican."
          )),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Revisión documental (§31)
 * ---------------------------------------------------------------------- */

export const qualityDocumentRevisionDetail: ExportDefinition = {
  key: "quality.document-revision.detail",
  module: "quality",
  entity: "Revisión documental",
  recordType: "Revisión documental",
  documentName: "Revisión documental",
  kind: "historical",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  filters: [{ key: "documento", label: "Documento", kind: "uuid" }],
  async load(req): Promise<ExportResult | null> {
    // La revisión se identifica por su id; el documento llega como filtro
    // declarado porque el motor documental lee por documento. Si no viene, o
    // la revisión no es de ese documento, la respuesta es la de siempre: nada.
    if (!req.id || !req.filters.documento) return null;
    const detail = await getDocumentControlDetail(
      req.organizationId, req.filters.documento, QUALITY_DOC_MODULE
    );
    if (!detail) return null;
    const rev = detail.revisions.find((r) => r.id === req.id);
    if (!rev) return null;

    const participants = detail.participants.filter((p) => p.revisionId === rev.id);
    const decisions = detail.decisions.filter((d) => d.revisionId === rev.id);
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Revision-documental",
        title: detail.title,
        code: `${detail.code ?? ""}-${rev.revisionLabel}`.replace(/^-/, ""),
      },
      document: {
        recordType: "Revisión documental",
        title: `${detail.title} · ${rev.revisionLabel}`,
        code: detail.code,
        badges: [{ text: LIFECYCLE_LABEL[rev.workflowState as never] ?? rev.workflowState, tone: "info" }],
        organization: org,
        systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        sections: [
          section("Vigencia de ESTA revisión", fields([
            requiredField("Revisión", rev.revisionLabel),
            requiredField("Estado", LIFECYCLE_LABEL[rev.workflowState as never] ?? rev.workflowState),
            requiredField("Vigente desde", day(rev.effectiveFrom)),
            requiredField("Vigente hasta", day(rev.effectiveTo)),
            requiredField("Aprobada el", day(rev.approvedAt)),
            requiredField("Aprobó", rev.approvedByName),
          ], 2),
          paragraph(rev.changeNote)),
          section("Quiénes participaron", table(
            [{ header: "Rol", width: 2 }, { header: "Persona", width: 3 },
             { header: "Cargo", width: 2.5 }, { header: "Decisión", width: 2 },
             { header: "Cuándo", width: 1.6 }],
            participants.map((p) => [
              p.participantRole, p.profileName, p.positionName ?? "—",
              p.decision, day(p.decidedAt),
            ]),
            "Esta revisión no registró participantes."
          )),
          section("Decisiones", table(
            [{ header: "Cuándo", width: 1.6 }, { header: "Decisión", width: 2.5 },
             { header: "Quién", width: 2.5 }, { header: "Motivo", width: 4 }],
            decisions.map((d) => [
              day(d.decidedAt), d.decisionType, d.decidedByName ?? "—", d.reason ?? "—",
            ]),
            "Sin decisiones registradas en esta revisión."
          )),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Medición (§28)
 * ---------------------------------------------------------------------- */

export const qualityMeasurementDetail: ExportDefinition = {
  key: "quality.measurement.detail",
  module: "quality",
  entity: "Medición",
  recordType: "Medición",
  documentName: "Medición de indicador",
  kind: "historical",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  filters: [{ key: "indicador", label: "Indicador", kind: "uuid" }],
  async load(req): Promise<ExportResult | null> {
    if (!req.id || !req.filters.indicador) return null;
    const indicator = await getIndicator(req.organizationId, req.filters.indicador);
    if (!indicator) return null;
    const measurements = await listMeasurements(req.organizationId, indicator.indicatorId, {
      includeSuperseded: true,
    });
    const m = measurements.find((x) => x.id === req.id);
    if (!m) return null;

    const configs = await listIndicatorConfigs(req.organizationId, indicator.indicatorId);
    const org = await organizationIdentity(req.organizationId);

    // OI-07 · La meta que REGÍA. Comparar el valor de enero contra la meta de
    // hoy convierte un incumplimiento leve en uno grave, y deja indefendible
    // la decisión que se tomó entonces.
    const meta = m.appliedTargetValue !== null
      ? `${m.appliedTargetValue} ${m.appliedUnitLabel ?? m.appliedUnitCode}`
      : "sin meta declarada";

    return {
      filenameParts: {
        recordType: "Medicion",
        title: indicator.name,
        code: `${indicator.code ?? ""}-${m.periodLabel}`.replace(/^-/, ""),
      },
      document: {
        recordType: "Medición",
        title: `${indicator.name} · ${m.periodLabel}`,
        code: indicator.code,
        subtitle: `Periodo ${day(m.periodStart)} → ${day(m.periodEnd)}`,
        badges: [
          { text: EVALUATION_LABEL[m.evaluation as never] ?? m.evaluation, tone: "info" },
          ...(m.isCurrent ? [] : [{ text: "Corregida por otra medición", tone: "warn" as const }]),
        ],
        organization: org,
        systemLine: SYSTEM_PERF,
        orientation: "portrait",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        sections: [
          section("Qué se midió", {
            type: "references",
            items: [
              {
                kind: "live",
                label: "INDICADOR · REFERENCIA VIVA",
                value: `${indicator.code ?? "—"} · ${indicator.name}`,
              },
              {
                kind: "snapshot",
                label: "META · COMO ESTABA ENTONCES",
                value: meta,
                context: `La meta vigente en el periodo ${m.periodLabel}, no la de hoy.`,
              },
            ],
          }),
          section("Resultado", fields([
            requiredField("Valor", num(m.value)),
            requiredField("Unidad", m.appliedUnitLabel ?? m.appliedUnitCode),
            requiredField("Evaluación", EVALUATION_LABEL[m.evaluation as never] ?? m.evaluation),
            requiredField("Estado del dato", m.dataState),
            requiredField("Calidad del dato", m.dataQuality),
            requiredField("Medido el", day(m.measuredAt)),
          ], 2),
          paragraph(m.evaluationExplanation),
          m.correctionReason
            ? note(`Esta medición corrige a otra anterior. Motivo declarado: ${m.correctionReason}`)
            : null),
          section("Configuración que regía", table(
            [{ header: "Versión", width: 1.2 }, { header: "Desde", width: 1.6 },
             { header: "Hasta", width: 1.6 }, { header: "Meta", width: 2 },
             { header: "Unidad", width: 2 }],
            configs.map((c) => [
              String(c.versionNumber), day(c.effectiveFrom), day(c.effectiveTo),
              num(c.targetValue), c.unitLabel ?? c.unitCode,
            ]),
            "Este indicador no tiene configuraciones publicadas."
          )),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Versión de metodología (§30)
 * ---------------------------------------------------------------------- */

/**
 * v1 sigue exportándose como v1.
 *
 * `quality.methodology.detail` imprime la metodología con su versión vigente.
 * Esta clave imprime UNA versión concreta, elegida por su identificador. Sin
 * ella, «la metodología» significaba siempre «la de ahora», y una evaluación
 * hecha con la v1 no tenía forma de acompañarse de la v1.
 */
export const qualityMethodologyVersionDetail: ExportDefinition = {
  key: "quality.methodology-version.detail",
  module: "quality",
  entity: "Versión de metodología",
  recordType: "Versión de metodología",
  documentName: "Metodología de riesgos",
  kind: "historical",
  permission: "member",
  orientation: "landscape",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const found = await getMethodologyVersion(req.organizationId, req.id);
    if (!found) return null;
    const { methodology: m, version: v } = found;
    const org = await organizationIdentity(req.organizationId);

    const dimensiones = v.scales.filter((s) => s.scaleKind === "dimension");
    const resultados = v.scales.filter((s) => s.scaleKind === "result");

    return {
      filenameParts: {
        recordType: "Metodologia",
        title: m.name,
        code: `${m.code}-v${v.versionNumber}`,
      },
      document: {
        recordType: "Versión de metodología",
        title: `${m.name} · versión ${v.versionNumber}`,
        code: m.code,
        subtitle: METHODOLOGY_SCOPE_LABEL[m.appliesTo] ?? m.appliesTo,
        badges: [
          { text: VERSION_STATUS_LABEL[v.status] ?? v.status, tone: "info" },
          { text: AGGREGATION_LABEL[v.aggregation] ?? v.aggregation, tone: "neutral" },
        ],
        organization: org,
        systemLine: SYSTEM_RISK,
        orientation: "landscape",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        sections: [
          section("Identidad de esta versión", fields([
            requiredField("Enfoque", METHODOLOGY_APPROACH_LABEL[m.approach] ?? m.approach),
            requiredField("Agregación", AGGREGATION_LABEL[v.aggregation] ?? v.aggregation),
            requiredField("Vigente desde", day(v.effectiveFrom)),
            requiredField("Vigente hasta", day(v.effectiveTo)),
            requiredField("Publicada el", day(v.publishedAt)),
            requiredField("Estado", VERSION_STATUS_LABEL[v.status] ?? v.status),
          ], 2),
          paragraph(m.description),
          paragraph(v.changeNote)),
          ...dimensiones.map((s) => section(`Escala · ${s.label}`, table(
            [{ header: "Nivel", width: 3 }, { header: "Valor", width: 1 },
             { header: "Descripción", width: 6 }],
            s.levels.map((l) => [l.label, String(l.value), l.description ?? "—"]),
            "Esta escala no tiene niveles."
          ))),
          ...resultados.map((s) => section(`Bandas de resultado · ${s.label}`, table(
            [{ header: "Banda", width: 2.5 }, { header: "Desde", width: 1.2 },
             { header: "Hasta", width: 1.2 }, { header: "¿Aceptable?", width: 1.5 },
             { header: "Revisar cada", width: 1.6 }, { header: "Descripción", width: 4 }],
            s.levels.map((l) => [
              l.label, num(l.minScore), num(l.maxScore),
              l.isAcceptable ? "Sí" : "No",
              l.reviewMonths ? `${l.reviewMonths} meses` : "—",
              l.description ?? "—",
            ]),
            "Esta escala no tiene bandas."
          ))),
          section(null, note(
            "Esta hoja reproduce UNA versión de la metodología. Las evaluaciones " +
            "hechas con ella siguen explicándose con estos criterios aunque hoy " +
            "rija otra versión."
          )),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Mis tareas (§4 del inventario)
 * ---------------------------------------------------------------------- */

export const qualityTaskList: ExportDefinition = {
  key: "quality.task.list",
  module: "quality",
  entity: "Mis tareas",
  recordType: "Mis tareas",
  documentName: "Listado de tareas y avisos",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La bandeja es una vista del trabajo pendiente HOY para quien la mira. No " +
    "es un registro versionado: cada tarea remite al documento o al registro " +
    "que la originó, y ese sí conserva su historia.",
  async load(req): Promise<ExportResult | null> {
    // La bandeja es PERSONAL: se lee con el identificador de quien descarga,
    // nunca con uno que venga de la URL.
    const [tasks, alerts, org] = await Promise.all([
      listMyTasks(req.organizationId, req.userId, { includeClosed: true }),
      listMyAlerts(req.organizationId, req.userId),
      organizationIdentity(req.organizationId),
    ]);
    return {
      filenameParts: { recordType: "Mis-tareas", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Mis tareas",
        title: "Mis tareas y avisos",
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        recordCount: tasks.length,
        sections: [
          section("Tareas", table(
            [{ header: "Tarea", width: 4 }, { header: "Tipo", width: 2 },
             { header: "Documento", width: 2 }, { header: "Estado", width: 1.6 },
             { header: "Vence", width: 1.5 }],
            tasks.map((t) => [
              t.title, t.taskType, t.documentCode ?? "—", t.status, day(t.dueAt),
            ]),
            "No tienes tareas asignadas."
          )),
          section("Avisos", table(
            [{ header: "Aviso", width: 4.5 }, { header: "Tipo", width: 2 },
             { header: "Severidad", width: 1.8 }, { header: "Cuándo", width: 1.7 }],
            alerts.map((a) => [a.title, a.alertType, a.severity, day(a.createdAt)]),
            "No tienes avisos."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};
