import "server-only";

import {
  getCase, listCaseActions, listCaseHistory, listCaseReferences, listCaseRequirements,
  listCases, listCauses, listFindings, listVerifications,
} from "@/lib/db/work-cases";
import {
  ACTION_KIND_LABEL, ACTION_STATUS_LABEL, CASE_ORIGIN_LABEL, CASE_STATUS_LABEL,
  CASE_TYPE_LABEL, CLASSIFICATION_LABEL, EFFECTIVENESS_LABEL, PRIORITY_LABEL,
  REFERENCE_KIND_LABEL, describeDecision,
} from "@/lib/domain/work-cases";
import type { ExportDefinition, ExportResult } from "../registry-types";
import { fields, note, requiredField, section, table, timeline } from "../print-model";
import { organizationIdentity } from "../branding";

const SYSTEM = "Trazaloop Quality · casos y acciones";

export const qualityCaseDetail: ExportDefinition = {
  key: "quality.case.detail",
  module: "quality",
  entity: "Caso",
  recordType: "Caso",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const c = await getCase(req.organizationId, req.id);
    if (!c) return null;

    const [findings, causes, actions, refs, requirements] = await Promise.all([
      listFindings(req.organizationId, c.caseId),
      listCauses(req.organizationId, c.caseId),
      listCaseActions(req.organizationId, c.caseId),
      listCaseReferences(req.organizationId, c.caseId),
      listCaseRequirements(req.organizationId, c.caseId),
    ]);
    const actionIds = actions.map((a) => a.id);
    // El historial incluye las decisiones de LAS ACCIONES, no solo las del
    // caso: «se completó» y «se verificó» son parte de la misma historia.
    const [verifications, history] = await Promise.all([
      listVerifications(req.organizationId, actionIds),
      listCaseHistory(req.organizationId, c.caseId, actionIds),
    ]);
    const org = await organizationIdentity(req.organizationId);
    const isNc = c.classification === "nonconformity";

    return {
      filenameParts: { recordType: isNc ? "No-conformidad" : "Caso", title: c.title, code: c.code },
      document: {
        recordType: isNc ? "No conformidad" : "Caso",
        title: c.title,
        code: c.code,
        subtitle: `${CASE_TYPE_LABEL[c.caseType]} · Origen: ${CASE_ORIGIN_LABEL[c.originKind]}`,
        badges: [
          { text: CLASSIFICATION_LABEL[c.classification],
            tone: isNc ? "danger" : c.classification === "pending" ? "warn" : "neutral" },
          { text: CASE_STATUS_LABEL[c.status], tone: c.status === "closed" ? "neutral" : "info" },
          { text: PRIORITY_LABEL[c.priority], tone: "neutral" },
        ],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Qué pasó",
            fields([
              requiredField("Detectado el", c.detectedOn),
              requiredField("Responsable", c.ownerPositionName ?? "Sin asignar"),
              requiredField("Reportó", c.reportedByName ?? "—"),
              requiredField("Procesos", c.processNames || "—"),
            ], 2),
            c.description ? { type: "fields", items: [{ label: "Descripción", value: c.description, wide: true }] } : null,
            c.originNote ? { type: "fields", items: [{ label: "De dónde viene", value: c.originNote, wide: true }] } : null,
          ),
          // §25 · Las referencias distinguen lo VIVO de la FOTO histórica.
          ...(refs.length > 0 ? [section("De dónde viene", {
            type: "references" as const,
            items: refs.map((r) => {
              const snap = (r.snapshot ?? {}) as Record<string, unknown>;
              const hasContext = typeof snap.context === "string" && snap.context.length > 0;
              return {
                kind: hasContext ? ("snapshot" as const) : ("live" as const),
                label: REFERENCE_KIND_LABEL[r.refKind as never] ?? r.refKind,
                value: typeof snap.label === "string" ? snap.label : (r.note ?? "—"),
                context: hasContext ? (snap.context as string) : null,
              };
            }),
          })] : []),
          section("Hallazgos", table(
            [{ header: "Qué se encontró", width: 6 }, { header: "Dónde", width: 2 }, { header: "Cuándo", width: 2 }],
            findings.map((f) => [f.statement, f.locationText ?? "—", f.observedOn]),
            "Sin hallazgos registrados."
          )),
          // §35 · Requisito, evidencia e incumplimiento NUNCA se funden en un
          // párrafo. Son tres afirmaciones distintas y una auditoría las
          // separa; el PDF también.
          section("Evaluación",
            fields([requiredField("Clasificación", CLASSIFICATION_LABEL[c.classification])], 1),
            {
              type: "fields",
              items: [
                { label: "Requisito incumplido", wide: true,
                  value: c.requirementText ?? (requirements.length > 0
                    ? requirements.map((r) => `${r.label} (${r.source})`).join("\n")
                    : "No se declaró un requisito.") },
                { label: "Evidencia observada", value: c.evidenceText ?? "No se declaró evidencia.", wide: true },
                { label: "En qué consiste el incumplimiento", value: c.nonconformityText ?? "—", wide: true },
              ],
            },
            !isNc ? note(
              "Este caso NO está clasificado como no conformidad. Un hecho observado no lo es " +
              "hasta que alguien con autoridad lo evalúa contra un requisito."
            ) : null,
          ),
          section("Análisis de causa", table(
            [{ header: "Causa validada", width: 4 }, { header: "Análisis", width: 4 },
             { header: "Método", width: 1.6 }, { header: "Aprobada", width: 1.6 }],
            causes.map((x) => [
              x.validatedCause ?? x.hypothesis ?? "—", x.analysis, x.methodology,
              x.approvedAt ? x.approvedAt.slice(0, 10) : "No",
            ]),
            "Sin análisis de causa."
          )),
          section("Plan de acciones", table(
            [{ header: "Código", width: 1.5 }, { header: "Acción", width: 4 },
             { header: "Tipo", width: 1.8 }, { header: "Responsable", width: 2 },
             { header: "Vence", width: 1.5 }, { header: "Estado", width: 1.6 },
             { header: "Eficacia", width: 1.8 }],
            actions.map((a) => [
              a.code, a.title,
              ACTION_KIND_LABEL[a.actionKind as never] ?? a.actionKind,
              a.ownerPositionName ?? "Sin asignar",
              a.dueOn ?? "—",
              ACTION_STATUS_LABEL[a.status as never] ?? a.status,
              EFFECTIVENESS_LABEL[a.effectiveness as never] ?? a.effectiveness,
            ]),
            "Sin acciones planificadas."
          ),
          note("Completada no es lo mismo que eficaz. Una acción se cierra cuando se comprueba que sirvió.")),
          ...(verifications.length > 0 ? [section("Verificación de eficacia", table(
            [{ header: "Acción", width: 1.6 }, { header: "Verificada el", width: 1.6 },
             { header: "Resultado", width: 1.8 }, { header: "Criterio", width: 3.5 },
             { header: "Observación", width: 3 }],
            verifications.map((v) => [
              actions.find((a) => a.id === v.actionId)?.code ?? "—",
              v.verifiedOn,
              v.result === "effective" ? "Eficaz" : "No eficaz",
              v.criteria,
              v.comment ?? "—",
            ]),
            "Sin verificaciones."
          ))] : []),
          section("Cierre",
            c.closedAt
              ? fields([
                  requiredField("Cerrado el", c.closedAt.slice(0, 10)),
                  requiredField("Reaperturas", String(c.reopenCount)),
                ], 2)
              : { type: "paragraph", text: "El ciclo todavía no se ha cerrado.", muted: true },
            c.closureNote ? { type: "fields", items: [{ label: "Fundamento del cierre", value: c.closureNote, wide: true }] } : null,
          ),
          section("Historial", timeline(
            history.map((d) => ({
              title: describeDecision(d.decisionKind as never, d.outcome),
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

export const qualityCaseList: ExportDefinition = {
  key: "quality.case.list",
  module: "quality",
  entity: "Casos",
  recordType: "Casos",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  filters: [
    { key: "vista", label: "Vista", kind: "enum", values: ["abiertos", "nc", "vencidos", "todos"] },
  ],
  async load(req): Promise<ExportResult | null> {
    let rows = await listCases(req.organizationId);
    const applied: { label: string; value: string }[] = [];
    const vista = req.filters.vista ?? "abiertos";
    if (vista === "abiertos") {
      rows = rows.filter((c) => c.status !== "closed");
      applied.push({ label: "Vista", value: "Abiertos" });
    } else if (vista === "nc") {
      rows = rows.filter((c) => c.classification === "nonconformity");
      applied.push({ label: "Vista", value: "No conformidades" });
    } else if (vista === "vencidos") {
      rows = rows.filter((c) => c.overdueActionCount > 0);
      applied.push({ label: "Vista", value: "Con acciones vencidas" });
    } else {
      applied.push({ label: "Vista", value: "Todos" });
    }
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Casos", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Casos", title: "Casos y acciones",
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Código", width: 1.4 }, { header: "Caso", width: 4.5 },
           { header: "Tipo", width: 2 }, { header: "Clasificación", width: 2 },
           { header: "Estado", width: 1.8 }, { header: "Responsable", width: 2.4 },
           { header: "Detectado", width: 1.6 }, { header: "Acciones", width: 1.2 },
           { header: "Vencidas", width: 1.2 }],
          rows.map((c) => [
            c.code, c.title, CASE_TYPE_LABEL[c.caseType],
            CLASSIFICATION_LABEL[c.classification], CASE_STATUS_LABEL[c.status],
            c.ownerPositionName ?? "Sin asignar", c.detectedOn,
            String(c.actionCount), String(c.overdueActionCount),
          ]),
          "No hay casos con ese filtro."
        )),
        section(null, note(
          "La CLASIFICACIÓN dice si algo incumple un requisito; el ESTADO dice en qué punto del " +
          "ciclo va. Un caso abierto puede no ser una no conformidad, y una no conformidad puede " +
          "estar cerrada."
        ))],
      },
    };
  },
};
