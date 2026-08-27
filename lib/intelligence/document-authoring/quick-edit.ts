import "server-only";

import { aiConfig } from "@/lib/ai/config";
import { resolveProvider } from "@/lib/ai/provider";
import { createServerClient } from "@/lib/supabase/server";
import {
  QUICK_EDIT_SCHEMA, QUICK_EDIT_SCHEMA_NAME, validateQuickEdit,
  type QuickEditSuggestion,
} from "./schema";
import { quickEditPrompt, type QuickEditAction } from "./policy";
import {
  contextUsed, renderQuickEditInput, type ContextUsed, type QuickEditContext,
} from "./context";

/**
 * Trazaloop · QUALITY-12.2C · La asistencia de redacción.
 *
 * EL ORDEN, QUE NO ES CASUAL
 *
 *   1. Sin texto escrito, no se llama a nadie. La filosofía es que la persona
 *      escriba primero; un botón que rellena una sección vacía es otra cosa y
 *      no es esta.
 *   2. La base decide si se puede, con el permiso del MÓDULO DEL DOCUMENTO.
 *      Si dice que no, no hay llamada: un tope que se comprueba después de
 *      gastar no es un tope.
 *   3. Se construyen los cuatro cajones —texto, guía, perfil, documento— y
 *      nada más. Ni un adaptador del Copilot.
 *   4. Se llama al proveedor con una política corta y un esquema pequeño.
 *   5. Se valida la propuesta. Una salida que no cumple no se pinta.
 *   6. Se cierra la operación con lo que costó.
 *
 * LO QUE NO OCURRE NUNCA
 *
 * La propuesta no toca el contenido. No crea revisión, no aprueba, no publica,
 * no guarda. Es un texto que vive en la pantalla hasta que una persona decide
 * ponerlo en su borrador, y después esa persona sigue teniendo que guardar.
 */

export type QuickEditRequest = {
  organizationId: string;
  documentId: string;
  /** El módulo DOCUMENTAL: `cpr`, `textiles`, `quality`. */
  moduleKey: string;
  sectionKey: string;
  action: QuickEditAction;
  context: QuickEditContext;
};

export type QuickEditOutcome =
  | {
      ok: true;
      runId: string;
      suggestion: QuickEditSuggestion;
      used: ContextUsed;
      provider: string;
      model: string;
      latencyMs: number;
    }
  | { ok: false; runId: string | null; reason: string; message: string };

/** §2 · Sin texto no hay nada que mejorar, y no se gasta una llamada. */
export const MIN_USER_TEXT = 20;

export async function runQuickEdit(
  req: QuickEditRequest,
  client?: Awaited<ReturnType<typeof createServerClient>>
): Promise<QuickEditOutcome> {
  const cfg = aiConfig();
  const { provider, live } = resolveProvider();
  const db = client ?? await createServerClient();
  const t0 = Date.now();

  // ---- 1 · Edit-first -----------------------------------------------------
  const texto = req.context.userText.trim();
  if (texto.length < MIN_USER_TEXT) {
    return {
      ok: false, runId: null, reason: "empty",
      message: "Escribe primero el contenido de la sección. Esta ayuda mejora lo "
        + "que ya está escrito; no redacta la sección por ti.",
    };
  }

  // §32 · Sin proveedor real NO se finge uno.
  //
  // La distinción importa: `live` es falso en dos casos muy distintos. Uno es
  // «hay un proveedor configurado pero le falta la credencial» —y ahí caer en
  // el doble sería vender como mejora un texto que no pasó por ningún modelo—.
  // El otro es «alguien pidió explícitamente el doble», escribiendo `fake` en
  // la configuración, que es lo que hacen las pruebas.
  //
  // El primero se rechaza. El segundo se permite, porque nadie llega a él por
  // accidente: hay que escribirlo.
  if (!live && cfg.provider !== "fake") {
    return {
      ok: false, runId: null, reason: "not_configured",
      message: "La asistencia de redacción no está configurada en este entorno.",
    };
  }

  const prompt = quickEditPrompt(req.action);

  // ---- 2 · ¿Se puede? El permiso es del MÓDULO DEL DOCUMENTO -------------
  const { data: permiso, error: errPermiso } = await db.rpc("document_authoring_start_run", {
    p_organization_id: req.organizationId,
    p_document_id: req.documentId,
    p_module_key: req.moduleKey,
    p_section_key: req.sectionKey,
    p_action: req.action,
    p_provider: provider.name,
    p_model: cfg.model,
    p_prompt_template: prompt.name,
    p_prompt_version: prompt.version,
    p_guidance_revision_id: req.context.guidance?.revisionId ?? null,
    p_daily_limit: 100,
  });
  if (errPermiso) {
    return { ok: false, runId: null, reason: "denied", message: errPermiso.message };
  }
  const p = permiso as { allowed: boolean; reason?: string; message?: string; run_id?: string };
  if (!p?.allowed) {
    return {
      ok: false, runId: null, reason: p?.reason ?? "denied",
      message: p?.message ?? "No se puede usar la asistencia de redacción aquí.",
    };
  }
  const runId = String(p.run_id);

  // ---- 3 · Los cuatro cajones --------------------------------------------
  const material = renderQuickEditInput({ ...req.context, userText: texto });

  // ---- 4 · La llamada -----------------------------------------------------
  const resultado = await provider.generateStructured({
    system: prompt.system,
    schemaName: QUICK_EDIT_SCHEMA_NAME,
    schema: QUICK_EDIT_SCHEMA,
    config: cfg,
    messages: [{ role: "user", content: material }],
  });

  if (!resultado.ok) {
    await db.rpc("quality_ai_fail_run", {
      p_run_id: runId,
      p_status: resultado.kind === "refused" ? "refused" : "failed",
      p_error: resultado.message,
    });
    return {
      ok: false, runId, reason: resultado.kind,
      message: resultado.kind === "timeout"
        ? "La asistencia tardó demasiado. Tu texto no se ha tocado; inténtalo otra vez."
        : "La asistencia no está disponible en este momento. Tu texto no se ha tocado.",
    };
  }

  // ---- 5 · Validar. Una salida rota no se pinta --------------------------
  const validado = validateQuickEdit(resultado.value, texto.length);
  if (!validado.ok) {
    await db.rpc("quality_ai_fail_run", {
      p_run_id: runId, p_status: "failed", p_error: validado.error,
    });
    return {
      ok: false, runId, reason: "invalid_output",
      message: "La propuesta no se pudo interpretar y no se aplicó nada. "
        + "Tu texto sigue como estaba.",
    };
  }

  // ---- 6 · Cerrar con lo que costó ---------------------------------------
  await db.rpc("quality_ai_complete_run", {
    p_run_id: runId,
    p_answer: validado.suggestion as unknown as Record<string, unknown>,
    p_evidence_level: null,
    p_input_tokens: resultado.usage.inputTokens,
    p_output_tokens: resultado.usage.outputTokens,
    p_tool_calls: 0,
    p_cached_input_tokens: resultado.usage.cachedInputTokens ?? null,
    p_reasoning_tokens: resultado.usage.reasoningTokens ?? null,
    p_total_tokens: resultado.usage.totalTokens ?? null,
    p_provider_called: true,
  });

  return {
    ok: true,
    runId,
    suggestion: validado.suggestion,
    used: contextUsed(req.context),
    provider: provider.name,
    model: cfg.model,
    latencyMs: Date.now() - t0,
  };
}
