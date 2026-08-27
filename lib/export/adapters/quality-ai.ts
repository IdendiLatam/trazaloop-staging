import "server-only";

import {
  getRun, getSuggestion, listReferences, listRuns, listSuggestions,
} from "@/lib/db/quality-ai";
import {
  AI_DISCLAIMER, AI_DRAFT_IS_NOT_A_RECORD, AI_INFERENCE_IS_NOT_EVIDENCE,
  AI_IS_NOT_A_DECISION, AI_IS_NOT_A_FACT, AI_IS_NOT_AUTOMATION,
  AI_SUMMARY_IS_NOT_THE_SOURCE, EVIDENCE_LABEL, HUMAN_IN_THE_LOOP,
  NO_LEARNING_CLAIM, RUN_STATUS_LABEL, SUGGESTION_KIND_LABEL,
  SUGGESTION_STATUS_LABEL, USE_CASE_LABEL,
  type AiRunStatus, type AiUseCase, type SuggestionKind, type SuggestionStatus,
} from "@/lib/domain/quality-ai";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  currentStateNote, field, fields, note, paragraph, requiredField, section, table,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * Trazaloop · QUALITY-12 · Los papeles del Copilot.
 *
 * DOS REGLAS QUE ATRAVIESAN LOS TRES
 *
 * §127 · UN BORRADOR SE IMPRIME COMO BORRADOR. En la primera línea, no en una
 * nota al pie. Un papel con el logotipo de la empresa que no dice de dónde sale
 * acaba en una carpeta como si fuera un documento aprobado, y ahí ya no hay
 * forma de distinguirlo.
 *
 * §18 · Y SIEMPRE CON SUS FUENTES. Si el borrador no puede decir de dónde sale
 * lo que dice, no vale para nada: ni para decidir ni para discutirlo.
 */

const SYSTEM = "Trazaloop Quality · Copilot";

function stamp(iso: string): string {
  return iso.slice(0, 10);
}

function fecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-CO");
}

// ---------------------------------------------------------------------------
// 1 · Ficha de un borrador
// ---------------------------------------------------------------------------

export const qualityAiSuggestionDetail: ExportDefinition = {
  key: "quality.ai-suggestion.detail",
  module: "quality",
  entity: "Borrador del Copilot",
  recordType: "Borrador generado con IA",
  documentName: "Borrador generado con IA",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const s = await getSuggestion(req.organizationId, req.id);
    if (!s) return null;
    const [org, refs] = await Promise.all([
      organizationIdentity(req.organizationId),
      listReferences(req.organizationId, s.runId).catch(() => []),
    ]);
    const detalle = typeof s.payload.detail === "string" ? s.payload.detail : null;

    return {
      filenameParts: {
        recordType: "Borrador generado con IA", title: s.title,
        code: null, stamp: stamp(s.createdAt),
      },
      document: {
        recordType: "Borrador generado con IA",
        title: s.title,
        code: null,
        subtitle: SUGGESTION_KIND_LABEL[s.kind as SuggestionKind] ?? s.kind,
        badges: [
          { text: "BORRADOR · IA", tone: "warn" as const },
          { text: SUGGESTION_STATUS_LABEL[s.status as SuggestionStatus] ?? s.status,
            tone: "info" as const },
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          // §127 · Lo primero que se lee, antes que el contenido.
          section(null,
            note("ESTE DOCUMENTO ES UN BORRADOR GENERADO CON INTELIGENCIA "
              + "ARTIFICIAL. No es un registro aprobado, no es evidencia y no "
              + "constituye ninguna decisión de la empresa."),
            note(AI_DRAFT_IS_NOT_A_RECORD),
            note(HUMAN_IN_THE_LOOP)),

          section("Qué propone", paragraph(detalle ?? "—"),
            s.rationale ? paragraph(`Razonamiento: ${s.rationale}`) : null),

          section("Con qué se generó", fields([
            requiredField("Modelo", `${s.provider} · ${s.model}`),
            requiredField("Instrucciones", `${s.promptTemplate} v${s.promptVersion}`),
            requiredField("Lo pidió", s.requestedByName ?? "—"),
            requiredField("Generado el", fecha(s.createdAt)),
            requiredField("Fuentes consultadas", String(s.referenceCount)),
          ]), note(
            "Cambiar el modelo o las instrucciones mañana no reescribe este "
            + "papel: aquí queda con qué se produjo."
          )),

          section("En qué quedó", fields([
            requiredField("Estado",
              SUGGESTION_STATUS_LABEL[s.status as SuggestionStatus] ?? s.status),
            field("Lo revisó", s.reviewedByName),
            field("Fecha de revisión", s.reviewedAt ? fecha(s.reviewedAt) : null),
            field("Nota", s.decisionNote),
            field("Registro que salió de esto",
              s.resultingType ? `${s.resultingType} · ${s.resultingId ?? "—"}` : null),
          ]), note(
            "Aceptar un borrador no crea ningún registro. Si existe un registro "
            + "relacionado, lo creó una persona con el comando de su dominio y "
            + "figura como su autora."
          )),

          section("Fuentes", table(
            [{ header: "#", width: 1 }, { header: "Fuente", width: 7 },
             { header: "Situación al", width: 2 }],
            refs.map((r) => [String(r.ordinal), r.label, r.asOf ?? "—"]),
            "La consulta no usó ninguna fuente."
          ), note(AI_SUMMARY_IS_NOT_THE_SOURCE)),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 2 · Listado de borradores
// ---------------------------------------------------------------------------

export const qualityAiSuggestionList: ExportDefinition = {
  key: "quality.ai-suggestion.list",
  module: "quality",
  entity: "Listado de borradores del Copilot",
  recordType: "Borradores del Copilot",
  documentName: "Listado de borradores generados con IA",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata los borradores que existen hoy. Cada uno, por separado, "
    + "sí conserva con qué modelo y con qué instrucciones se generó.",
  filters: [
    { key: "status", label: "Estado", kind: "enum",
      values: ["generated", "reviewed", "accepted", "rejected", "expired"] },
  ],
  async load(req): Promise<ExportResult | null> {
    const [items, org] = await Promise.all([
      listSuggestions(req.organizationId,
        req.filters.status ? { status: req.filters.status } : {}),
      organizationIdentity(req.organizationId),
    ]);
    const aceptados = items.filter((s) => s.status === "accepted").length;

    return {
      filenameParts: {
        recordType: "Borradores del Copilot", title: "Listado",
        code: null, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Borradores del Copilot",
        title: "Listado de borradores generados con IA",
        code: null,
        subtitle: `${items.length} borrador(es) · ${aceptados} aceptado(s) por una persona`,
        badges: [{ text: "BORRADORES · IA", tone: "warn" as const }],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(AI_IS_NOT_A_DECISION), note(AI_DRAFT_IS_NOT_A_RECORD),
            currentStateNote(req.generatedAt)),
          section("Borradores", table(
            [
              { header: "Título", width: 4 },
              { header: "Tipo", width: 2 },
              { header: "Estado", width: 2 },
              { header: "Lo pidió", width: 2 },
              { header: "Modelo", width: 2 },
              { header: "Instrucciones", width: 2 },
              { header: "Fuentes", width: 1 },
              { header: "Generado", width: 2 },
              { header: "Revisó", width: 2 },
            ],
            items.map((s) => [
              s.title,
              SUGGESTION_KIND_LABEL[s.kind as SuggestionKind] ?? s.kind,
              SUGGESTION_STATUS_LABEL[s.status as SuggestionStatus] ?? s.status,
              s.requestedByName ?? "—",
              `${s.provider} · ${s.model}`,
              `${s.promptTemplate} v${s.promptVersion}`,
              String(s.referenceCount),
              stamp(s.createdAt),
              s.reviewedByName ?? "—",
            ]),
            "No hay ningún borrador."
          )),
          section(null, note(
            "«Aceptado» significa que una persona lo revisó y le pareció útil. "
            + "NO significa que exista un registro: eso se ve en el módulo que "
            + "corresponda, con su autor y su fecha."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 3 · Reporte de consultas al Copilot
// ---------------------------------------------------------------------------

export const qualityAiRunList: ExportDefinition = {
  key: "quality.ai-run.list",
  module: "quality",
  entity: "Consultas al Copilot",
  recordType: "Consultas al Copilot",
  documentName: "Reporte de consultas al Copilot",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El reporte se compone con las consultas que existen hoy. Cada una conserva "
    + "con qué modelo y con qué instrucciones se respondió.",
  async load(req): Promise<ExportResult | null> {
    const [runs, org] = await Promise.all([
      listRuns(req.organizationId, 200),
      organizationIdentity(req.organizationId),
    ]);
    const fallidas = runs.filter((r) => r.status === "failed").length;
    const bloqueadas = runs.filter((r) => r.status === "rate_limited").length;

    return {
      filenameParts: {
        recordType: "Consultas al Copilot", title: "Reporte",
        code: null, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Consultas al Copilot",
        title: "Reporte de consultas al Copilot",
        code: null,
        subtitle: `${runs.length} consulta(s) · ${fallidas} con fallo · `
          + `${bloqueadas} bloqueada(s) por el tope`,
        badges: [],
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(AI_IS_NOT_A_FACT), note(AI_IS_NOT_AUTOMATION),
            note(NO_LEARNING_CLAIM), currentStateNote(req.generatedAt)),
          // §119 · Este papel es de CONSUMO. No lleva el texto de las preguntas
          // ni de las respuestas: quien lo descarga puede estar viendo el gasto
          // de toda la empresa, y eso no le da derecho a leer lo que preguntó
          // otra persona.
          section("Consultas", table(
            [
              { header: "Cuándo", width: 3 },
              { header: "Para qué", width: 3 },
              { header: "Quién", width: 3 },
              { header: "Estado", width: 2 },
              { header: "Modelo", width: 3 },
              { header: "Instrucciones", width: 2 },
              { header: "Fuentes", width: 1 },
              { header: "Evidencia", width: 2 },
              { header: "Tiempo", width: 2 },
            ],
            runs.map((r) => [
              fecha(r.startedAt),
              USE_CASE_LABEL[r.useCase as AiUseCase] ?? r.useCase,
              r.actorName ?? "—",
              RUN_STATUS_LABEL[r.status as AiRunStatus] ?? r.status,
              `${r.provider} · ${r.model}`,
              `${r.promptTemplate} v${r.promptVersion}`,
              String(r.contextItems),
              r.evidenceLevel ? EVIDENCE_LABEL[r.evidenceLevel] ?? r.evidenceLevel : "—",
              r.latencyMs !== null ? `${r.latencyMs} ms` : "—",
            ]),
            "Todavía no se ha consultado al Copilot."
          )),
          section(null, note(
            "Este reporte no incluye el texto de las preguntas ni de las "
            + "respuestas. Ver cuánto se consulta y ver qué se consultó son dos "
            + "permisos distintos."
          ), note(AI_INFERENCE_IS_NOT_EVIDENCE), note(AI_DISCLAIMER)),
        ],
      },
    };
  },
};
