import "server-only";

import { aiConfig } from "@/lib/ai/config";
import { resolveProvider } from "@/lib/ai/provider";
import { createServerClient } from "@/lib/supabase/server";
import type { AuthoringGuidance } from "@/lib/db/authoring-guidance";
import type { OrganizationAuthoringContext } from "@/lib/domain/organization-profile";
import type { RelatedContextType } from "@/lib/domain/document-review";
import { buildReviewContext, type EmptyReason } from "./routing";
import { reviewPrompt } from "./policy";
import { REVIEW_SCHEMA, REVIEW_SCHEMA_NAME, validateReview, type DocumentReview } from "./schema";
import {
  renderReviewInput, type ReviewContextUsed, type ReviewDocumentContext, type ReviewLimit,
} from "./context";
import type { ReviewRef } from "./facts";

/**
 * Trazaloop · QUALITY-12.2D · La revisión contextual, de principio a fin.
 *
 * EL ORDEN, QUE OTRA VEZ NO ES CASUAL
 *
 *   1. Sin texto no hay nada que revisar.
 *   2. La base decide si se puede, con el permiso del MÓDULO DEL DOCUMENTO.
 *      Antes de construir contexto: leer la empresa entera y descubrir después
 *      que no había permiso sería exactamente al revés.
 *   3. Se enruta el contexto según la guía. Solo lo que declara.
 *   4. SI NO HAY UN SOLO HECHO, NO SE LLAMA A NADIE.
 *   5. La llamada, con la política corta y el esquema pequeño.
 *   6. Se valida. Se ASCIENDEN las discrepancias que el código ya comprobó.
 *   7. Se cierra con lo que costó, y se guardan las fuentes.
 *
 * EL PASO 4 ES EL QUE MÁS SE NOTA
 *
 * Una sección sin cargos, sin procesos y sin nada registrado alrededor no
 * tiene contra qué contrastarse. Se podría llamar igual y el modelo diría, con
 * mucha educación, que no encontró nada; pero eso cuesta ochocientos tokens y
 * tres segundos para producir una frase que el código ya sabe escribir. Se
 * responde sin llamar, `provider_called` queda en falso, y quien lea el
 * consumo dentro de seis meses verá la verdad y no una llamada de cortesía.
 *
 * LO QUE NO OCURRE NUNCA
 *
 * No se escribe nada del sistema de gestión. Ni el documento, ni su revisión,
 * ni un caso, ni una acción, ni un riesgo, ni un control. Los hallazgos NO se
 * guardan: viven en la respuesta y desaparecen. Lo único que queda en la base
 * es la operación —quién, cuándo, con qué guía, qué costó— porque eso es
 * consumo y procedencia, no un diagnóstico del sistema de gestión.
 */

export type ContextualReviewRequest = {
  organizationId: string;
  documentId: string;
  /** El módulo DOCUMENTAL: `cpr`, `textiles`, `quality`. */
  moduleKey: string;
  sectionKey: string;
  userText: string;
  guidance: AuthoringGuidance | null;
  organization: OrganizationAuthoringContext | null;
  document: ReviewDocumentContext;
  ownerPositionId: string | null;
  /** Fecha de corte. La pantalla no la manda hoy; la biblioteca la soporta. */
  asOf?: string | null;
};

export type ContextualReviewOutcome =
  | {
      ok: true;
      runId: string | null;
      review: DocumentReview;
      used: ReviewContextUsed;
      /** Todas las fuentes citadas, para guardarlas. */
      sources: ReviewRef[];
      /**
       * Las fuentes DE CADA HALLAZGO, en el mismo orden que `review.findings`.
       *
       * Va aparte y no dentro del hallazgo por una razón concreta: hay dos
       * numeraciones —los HECHOS, que son lo que el modelo cita, y las FUENTES,
       * que son a dónde lleva el enlace— y hacer esa traducción en el navegador
       * salió mal a la primera. Se hace aquí, donde están las dos tablas.
       */
      findingSources: ReviewRef[][];
      providerCalled: boolean;
      provider: string;
      model: string;
      latencyMs: number;
    }
  | { ok: false; runId: string | null; reason: string; message: string };

/** §2 de 12.2C, que aquí sigue valiendo: sin texto escrito no hay revisión. */
export const MIN_USER_TEXT = 20;

export async function runContextualReview(
  req: ContextualReviewRequest,
  client?: Awaited<ReturnType<typeof createServerClient>>
): Promise<ContextualReviewOutcome> {
  const cfg = aiConfig();
  const { provider, live } = resolveProvider();
  const db = client ?? await createServerClient();
  const t0 = Date.now();

  // ---- 1 · Hay que haber escrito algo ------------------------------------
  const texto = req.userText.trim();
  if (texto.length < MIN_USER_TEXT) {
    return {
      ok: false, runId: null, reason: "empty",
      message: "Escribe primero el contenido de la sección. Esta revisión compara "
        + "lo que has escrito con lo que ya está registrado en Trazaloop.",
    };
  }

  // §32 · Sin proveedor real NO se finge uno. La distinción es la misma que en
  // 12.2C: falta la credencial (se rechaza) o alguien pidió el doble por
  // escrito (se permite, porque a eso no se llega por accidente).
  if (!live && cfg.provider !== "fake") {
    return {
      ok: false, runId: null, reason: "not_configured",
      message: "La revisión contra Trazaloop no está configurada en este entorno.",
    };
  }

  const prompt = reviewPrompt();

  // ---- 2 · ¿Se puede? El permiso es del MÓDULO DEL DOCUMENTO --------------
  //
  // Antes de leer un solo cargo. Construir el contexto de una empresa que no
  // tiene derecho a esto y descartarlo después sería leer lo que no toca.
  const { data: permiso, error: errPermiso } = await db.rpc("document_review_start_run", {
    p_organization_id: req.organizationId,
    p_document_id: req.documentId,
    p_module_key: req.moduleKey,
    p_section_key: req.sectionKey,
    p_provider: provider.name,
    p_model: cfg.model,
    p_prompt_template: prompt.name,
    p_prompt_version: prompt.version,
    p_guidance_revision_id: req.guidance?.revisionId ?? null,
    p_related_context_types: null,
    p_context_queries: null,
    p_daily_limit: 60,
  });
  if (errPermiso) {
    return { ok: false, runId: null, reason: "denied", message: errPermiso.message };
  }
  const p = permiso as { allowed: boolean; reason?: string; message?: string; run_id?: string };
  if (!p?.allowed) {
    return {
      ok: false, runId: null, reason: p?.reason ?? "denied",
      message: p?.message ?? "No se puede revisar esta sección contra Trazaloop.",
    };
  }
  const runId = String(p.run_id);

  // ---- 3 · El contexto, gobernado por la guía ----------------------------
  const ruta = await buildReviewContext({
    db,
    organizationId: req.organizationId,
    documentId: req.documentId,
    ownerPositionId: req.ownerPositionId,
    userText: texto,
    declaredTypes: req.guidance?.relatedContextTypes ?? [],
    organization: req.organization,
    asOf: req.asOf ?? null,
  });

  const used: ReviewContextUsed = {
    guidance: req.guidance !== null && !req.guidance.restricted
      && (req.guidance.guidance ?? "").trim().length > 0,
    guidanceRevisionId: req.guidance?.revisionId ?? null,
    types: ruta.resolved,
    factCount: ruta.writer.facts.length,
    refCount: ruta.writer.refs.length,
    queries: ruta.writer.queries,
    limits: ruta.limits,
  };

  await registrarContexto(db, runId, ruta.resolved, ruta.writer.queries);

  // ---- 4 · Sin hechos no se llama ----------------------------------------
  if (ruta.writer.isEmpty()) {
    await db.rpc("quality_ai_complete_run", {
      p_run_id: runId,
      p_answer: { summary: sinContexto(ruta.emptyReason, ruta.limits), findings: [] },
      p_evidence_level: "missing",
      p_input_tokens: 0, p_output_tokens: 0, p_tool_calls: 0,
      p_cached_input_tokens: null, p_reasoning_tokens: null, p_total_tokens: 0,
      p_provider_called: false,
    });
    return {
      ok: true, runId, providerCalled: false,
      review: { summary: sinContexto(ruta.emptyReason, ruta.limits), findings: [] },
      used, sources: [], findingSources: [], provider: provider.name, model: cfg.model,
      latencyMs: Date.now() - t0,
    };
  }

  // ---- 5 · La llamada -----------------------------------------------------
  const material = renderReviewInput({
    userText: texto,
    guidance: req.guidance,
    document: req.document,
    facts: ruta.writer.facts,
    refs: ruta.writer.refs,
    observations: ruta.observations,
    limits: ruta.limits,
    asOf: req.asOf ?? null,
  });

  const resultado = await provider.generateStructured({
    system: prompt.system,
    schemaName: REVIEW_SCHEMA_NAME,
    schema: REVIEW_SCHEMA,
    config: cfg,
    messages: [{ role: "user", content: material }],
  });

  if (!resultado.ok) {
    await db.rpc("quality_ai_fail_run", {
      p_run_id: runId,
      p_status: resultado.kind === "refused" ? "refused" : "failed",
      p_error: resultado.message,
      // QUALITY-12.2F · Un rechazo viene DEL proveedor: hubo llamada y hubo
      // tokens. Un tiempo de espera o una caída, no. Decirlo mal falsea el
      // recuento de llamadas, que es de lo que cuelga el análisis de coste.
      p_provider_called: resultado.kind === "refused",
    });
    return {
      ok: false, runId, reason: resultado.kind,
      message: resultado.kind === "timeout"
        ? "La revisión tardó demasiado. Tu texto no se ha tocado; inténtalo otra vez."
        : "La revisión no está disponible en este momento. Tu texto no se ha tocado.",
    };
  }

  // ---- 6 · Validar y ASCENDER lo que el código ya comprobó ---------------
  const validado = validateReview(resultado.value, ruta.writer.facts.length);
  if (!validado.ok) {
    await db.rpc("quality_ai_fail_run", {
      p_run_id: runId, p_status: "failed", p_error: validado.error,
      // La respuesta llegó del proveedor: no cumplió el esquema, pero se pagó.
      p_provider_called: true,
    });
    return {
      ok: false, runId, reason: "invalid_output",
      message: "La revisión no se pudo interpretar y no se ha aplicado nada. "
        + "Tu texto sigue como estaba.",
    };
  }

  const review = promoteConfirmed(validado.review, ruta.observations);

  // ---- 7 · Cerrar, y dejar las fuentes ------------------------------------
  const citados = new Set(review.findings.flatMap((f) => f.sourceRefs));
  const sources = ruta.writer.sourcesFor([...citados]);
  const findingSources = review.findings.map((f) => ruta.writer.sourcesFor(f.sourceRefs));
  await guardarFuentes(db, runId, sources);

  await db.rpc("quality_ai_complete_run", {
    p_run_id: runId,
    p_answer: review as unknown as Record<string, unknown>,
    p_evidence_level: review.findings.length > 0 ? "sufficient" : "limited",
    p_input_tokens: resultado.usage.inputTokens,
    p_output_tokens: resultado.usage.outputTokens,
    p_tool_calls: 0,
    p_cached_input_tokens: resultado.usage.cachedInputTokens ?? null,
    p_reasoning_tokens: resultado.usage.reasoningTokens ?? null,
    p_total_tokens: resultado.usage.totalTokens ?? null,
    p_provider_called: true,
  });

  return {
    ok: true, runId, review, used, sources, findingSources, providerCalled: true,
    provider: provider.name, model: cfg.model, latencyMs: Date.now() - t0,
  };
}

/**
 * Asciende a «confirmada» una discrepancia que el CÓDIGO ya comprobó.
 *
 * La condición es estrecha a propósito: el hallazgo tiene que ser un
 * `possible_conflict` Y citar el mismo hecho sobre el que la comparación
 * determinista se pronunció. Sin esa coincidencia de cita, el modelo estaría
 * hablando de otra cosa y ascenderlo sería regalarle la palabra.
 *
 * Y el ascenso también arrastra la severidad: si el código dice que dos
 * valores no coinciden, eso ya no es «para tu información».
 */
function promoteConfirmed(
  review: DocumentReview, observations: { kind: string; refs: number[] }[]
): DocumentReview {
  const confirmados = new Set<number>();
  for (const o of observations) {
    if (o.kind === "position_differs" || o.kind === "frequency_differs") {
      for (const r of o.refs) confirmados.add(r);
    }
  }
  if (confirmados.size === 0) return review;

  return {
    ...review,
    findings: review.findings.map((f) =>
      f.type === "possible_conflict" && f.sourceRefs.some((r) => confirmados.has(r))
        ? { ...f, type: "confirmed_conflict" as const, severity: "conflict" as const }
        : f),
  };
}

/**
 * El resumen cuando no hubo nada contra qué contrastar. Lo escribe el código:
 * es lo que hace honesto no llamar al proveedor.
 *
 * Y dice CUÁL de las dos cosas pasó. La primera versión daba el mismo texto
 * para «la guía de esta sección no señala ningún registro» y para «este
 * documento no está atado a nada», que son problemas distintos: el segundo
 * tiene arreglo y el primero no. Durante la validación humana de 12.2D esa
 * ambigüedad hizo pasar por defecto de la funcionalidad lo que era una
 * relación que faltaba en los datos.
 */
function sinContexto(reason: EmptyReason, limits: ReviewLimit[]): string {
  const base = reason === "no_types"
    ? "La guía de esta sección no señala ningún registro de Trazaloop con el que "
      + "contrastar, así que no hay nada que revisar aquí. No falta ningún dato: "
      + "esta sección se redacta sin contraste."
    : "Este documento no está relacionado con ningún proceso y no tiene un cargo "
      + "responsable registrado, así que no hay nada con lo que contrastar tu texto. "
      + "Si lo relacionas con su proceso —o le asignas un cargo responsable— la "
      + "revisión podrá comparar. Que falte esa relación no significa que el texto "
      + "esté mal.";
  return limits.length > 0
    ? `${base} Además, algunos tipos de contexto que la guía señala no se han podido revisar.`
    : base;
}

async function registrarContexto(
  db: Awaited<ReturnType<typeof createServerClient>>,
  runId: string, types: RelatedContextType[], queries: number
): Promise<void> {
  // Por función, no por `update` directo. `quality_ai_runs` solo tiene política
  // de lectura: un `update` con la sesión de quien pregunta no da error y no
  // toca ninguna fila, que es la peor forma de fallar. Lo descubrió una prueba
  // que fue a leer la columna después de escribirla.
  await db.rpc("document_review_record_context", {
    p_run_id: runId, p_types: types, p_queries: queries,
  });
}

async function guardarFuentes(
  db: Awaited<ReturnType<typeof createServerClient>>,
  runId: string, sources: ReviewRef[]
): Promise<void> {
  for (const s of sources) {
    await db.rpc("quality_ai_add_reference", {
      p_run_id: runId,
      p_ordinal: s.ordinal,
      p_source_code: s.sourceCode,
      p_entity_type: s.entityType,
      p_entity_id: s.entityId,
      p_label: s.label,
      p_deep_link: s.deepLink,
      p_as_of: s.asOf,
      p_revision: s.revisionLabel,
    });
  }
}
