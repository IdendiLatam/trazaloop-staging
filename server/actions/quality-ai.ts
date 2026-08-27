"use server";

import { revalidatePath } from "next/cache";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  acceptSuggestion, createSession, createSuggestion, getSettings, listReferences,
  recordFeedback, rejectSuggestion, resolveCustomerTheme, updateSettings,
} from "@/lib/db/quality-ai";
import { runCopilot } from "@/lib/ai/copilot";
import {
  PROMPT_ASK, PROMPT_AUDIT_PREP, PROMPT_CUSTOMER_THEMES, PROMPT_EXPLAIN_SIGNAL,
  PROMPT_REVIEW_SUMMARY, PROMPT_RISK_CANDIDATES, PROMPT_ROOT_CAUSE,
  type PromptTemplate,
} from "@/lib/ai/prompts";
import { SUGGESTION_KINDS } from "@/lib/domain/quality-ai";
import { readTemporal, readUseCase } from "@/lib/domain/quality-ai-request";
import type { AiAnswer } from "@/lib/ai/schemas";

/**
 * Trazaloop · QUALITY-12 · Las acciones del Copilot.
 *
 * LO QUE NINGUNA DE ESTAS FUNCIONES HACE
 *
 * Ninguna escribe en una tabla de negocio. Ni una. No hay aquí un `insert` en
 * `work_actions`, ni en `quality_risks`, ni en `work_cases`, ni en nada que sea
 * un registro del sistema de gestión. Lo máximo que ocurre es que se guarda un
 * BORRADOR —en la tabla de borradores— y que alguien, después, decide usarlo.
 *
 * Y cuando lo usa, no lo usa desde aquí: lo usa con el comando de su dominio,
 * que ya tiene sus validaciones y que registra a esa persona como autora (§44,
 * §104). Esta separación es incómoda a propósito. Un botón que crea la acción
 * «porque la IA lo dijo» es exactamente lo que este sprint no puede tener.
 */

export type AiActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
  runId?: string;
  answer?: AiAnswer;
  references?: { ordinal: number; label: string; deepLink: string | null }[];
  meta?: {
    provider: string; model: string; live: boolean; sources: string[];
    limitations: string[]; conflicts: string[]; truncated: boolean;
    droppedCitations: number;
    /** QUALITY-12.1 · Cuántos temas de clientes quedaron guardados. */
    themesRecorded?: number;
    /** QUALITY-12.1 · Si se llegó a llamar al proveedor. */
    providerCalled?: boolean;
  };
};

type Gate = { organizationId: string; roleCode: string; userId: string };

async function gate(): Promise<{ ok: Gate | null; error: string | null }> {
  const access = await requireQualityForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const { user } = await requireSession();
  return {
    ok: {
      organizationId: access.org.organizationId,
      roleCode: access.org.roleCode,
      userId: user.id,
    },
    error: null,
  };
}

function text(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}
function optional(form: FormData, name: string): string | null {
  const v = text(form, name);
  return v.length > 0 ? v : null;
}

const PROMPTS: Record<string, PromptTemplate> = {
  ask: PROMPT_ASK,
  explain_signal: PROMPT_EXPLAIN_SIGNAL,
  root_cause: PROMPT_ROOT_CAUSE,
  risk_candidates: PROMPT_RISK_CANDIDATES,
  review_summary: PROMPT_REVIEW_SUMMARY,
  audit_prep: PROMPT_AUDIT_PREP,
  customer_themes: PROMPT_CUSTOMER_THEMES,
};

function featureFor(useCase: string): "general" | "people" | "customer" | "drafts" {
  if (useCase === "customer_themes") return "customer";
  return "general";
}

// ---------------------------------------------------------------------------
// Preguntar (§47, §48, §113)
// ---------------------------------------------------------------------------

export async function askCopilotAction(
  _prev: AiActionState, formData: FormData
): Promise<AiActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const question = text(formData, "question");
  if (question.length < 3) return { error: "Escribe una pregunta." };

  const useCase = readUseCase(formData);
  const prompt = PROMPTS[useCase] ?? PROMPT_ASK;

  const ajustes = await getSettings(g.ok.organizationId);
  if (!ajustes.isEnabled) {
    return {
      error: "El Copilot no está encendido para esta empresa. Puede activarlo "
        + "quien administra Calidad desde los ajustes del Copilot.",
    };
  }

  // §49 · El contexto fijado, si la consulta se abrió desde algo concreto.
  const pinnedType = optional(formData, "pinned_type");
  const pinnedId = optional(formData, "pinned_id");
  const pinned = pinnedType && pinnedId ? { type: pinnedType, id: pinnedId } : null;

  // §21/§22 · Sobre qué momento se pregunta. Lo elige la pantalla con una lista
  // cerrada, no una fecha suelta escrita a mano.
  const temporal = readTemporal(formData);

  try {
    const r = await runCopilot({
      organizationId: g.ok.organizationId,
      useCase,
      feature: featureFor(useCase),
      prompt,
      question,
      temporal,
      pinned,
      sessionId: optional(formData, "session_id"),
      allow: { people: ajustes.allowPeople, customer: ajustes.allowCustomer },
    });

    if (!r.ok) {
      return { error: r.message, runId: r.runId ?? undefined };
    }

    revalidatePath("/quality/copilot");
    if (r.themesRecorded > 0) revalidatePath("/quality/customer-voice");
    return {
      error: null,
      success: true,
      runId: r.runId,
      answer: r.answer,
      references: r.references.map((x) => ({
        ordinal: x.ordinal, label: x.label, deepLink: x.deepLink,
      })),
      meta: {
        provider: r.provider, model: r.model, live: r.live,
        sources: r.context.sources, limitations: r.context.limitations,
        conflicts: r.context.conflicts, truncated: r.context.truncated,
        droppedCitations: r.droppedCitations,
        themesRecorded: r.themesRecorded,
        providerCalled: r.providerCalled,
      },
    };
  } catch (e) {
    // §85 · Que el Copilot falle no puede tumbar Calidad.
    return {
      error: e instanceof Error && e.message.length < 200
        ? e.message
        : "El Copilot no está disponible temporalmente. El resto de Trazaloop sigue funcionando.",
    };
  }
}

// ---------------------------------------------------------------------------
// Borradores (§43, §44, §102)
// ---------------------------------------------------------------------------

export async function saveSuggestionAction(
  _prev: AiActionState, formData: FormData
): Promise<AiActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const runId = text(formData, "run_id");
  const kind = text(formData, "kind");
  const title = text(formData, "title");
  if (!runId) return { error: "Falta la consulta de origen." };
  if (!(SUGGESTION_KINDS as readonly string[]).includes(kind)) {
    return { error: "Ese tipo de borrador no existe." };
  }
  if (title.length < 3) return { error: "El borrador necesita un título." };

  try {
    const id = await createSuggestion(runId, kind, title,
      { detail: text(formData, "detail") }, optional(formData, "rationale"));
    revalidatePath("/quality/copilot");
    return {
      error: null, success: true, runId: id,
      message: "Borrador guardado. Sigue siendo un borrador: para que exista un "
        + "registro tienes que crearlo tú con el comando de su dominio.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el borrador." };
  }
}

/**
 * §44/§104 · Aceptar. Esto NO crea nada.
 *
 * Marca el borrador como aceptado por esta persona y, si ya existe el objeto de
 * negocio que salió de él, anota cuál fue. El objeto lo creó ella, con el
 * comando de su dominio, y por eso figura como su autora.
 */
export async function acceptSuggestionAction(
  _prev: AiActionState, formData: FormData
): Promise<AiActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const mutate = await checkQualityCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  const id = text(formData, "suggestion_id");
  if (!id) return { error: "Falta el borrador." };
  const tipo = optional(formData, "resulting_type");
  const objeto = optional(formData, "resulting_id");

  try {
    await acceptSuggestion(id, optional(formData, "note"),
      tipo && objeto ? { type: tipo, id: objeto } : null);
    revalidatePath("/quality/copilot");
    return {
      error: null, success: true,
      message: "Borrador aceptado. Recuerda que aceptar no crea el registro: si "
        + "todavía no lo has creado, hazlo desde su módulo.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo aceptar el borrador." };
  }
}

export async function rejectSuggestionAction(
  _prev: AiActionState, formData: FormData
): Promise<AiActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const id = text(formData, "suggestion_id");
  if (!id) return { error: "Falta el borrador." };

  try {
    await rejectSuggestion(id, text(formData, "reason") || "Sin motivo indicado.");
    revalidatePath("/quality/copilot");
    return { error: null, success: true, message: "Borrador descartado." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo descartar el borrador." };
  }
}

export async function feedbackAction(
  _prev: AiActionState, formData: FormData
): Promise<AiActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const runId = text(formData, "run_id");
  if (!runId) return { error: "Falta la consulta." };

  try {
    await recordFeedback(runId, text(formData, "useful") === "yes",
      optional(formData, "reason"), optional(formData, "note"));
    return { error: null, success: true, message: "Gracias." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar tu valoración." };
  }
}

export async function startSessionAction(
  _prev: AiActionState, formData: FormData
): Promise<AiActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const tipo = optional(formData, "pinned_type");
  const id = optional(formData, "pinned_id");
  const etiqueta = optional(formData, "pinned_label");

  try {
    const sesion = await createSession(
      g.ok.organizationId,
      tipo && id ? { type: tipo, id, label: etiqueta ?? tipo } : null,
      optional(formData, "title"));
    return { error: null, success: true, runId: sesion };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo abrir la conversación." };
  }
}

// ---------------------------------------------------------------------------
// Ajustes (§77, §78)
// ---------------------------------------------------------------------------

export async function updateAiSettingsAction(
  _prev: AiActionState, formData: FormData
): Promise<AiActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!["admin", "quality"].includes(g.ok.roleCode)) {
    return { error: "Tu rol no permite configurar el Copilot." };
  }

  const entero = (name: string, alt: number) => {
    const n = Number.parseInt(text(formData, name), 10);
    return Number.isFinite(n) ? n : alt;
  };

  try {
    await updateSettings(g.ok.organizationId, {
      isEnabled: formData.get("is_enabled") === "on",
      allowPeople: formData.get("allow_people") === "on",
      allowCustomer: formData.get("allow_customer") === "on",
      allowDrafts: formData.get("allow_drafts") === "on",
      monthlyRunLimit: entero("monthly_run_limit", 500),
      dailyUserLimit: entero("daily_user_limit", 50),
      retainQuestion: formData.get("retain_question") === "on",
      retainAnswer: formData.get("retain_answer") === "on",
    });
    revalidatePath("/quality/copilot");
    return { error: null, success: true, message: "Configuración del Copilot guardada." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** Las fuentes citadas de una consulta, para el panel lateral (§115). */
export async function referencesForRunAction(
  organizationId: string, runId: string
) {
  return listReferences(organizationId, runId);
}


// ---------------------------------------------------------------------------
// QUALITY-12.1 · Resolver un tema de clientes · GAP-03 de QUALITY-12
// ---------------------------------------------------------------------------
// Confirmar un tema NO crea nada en el sistema de gestión: solo dice que una
// persona lo ha mirado y que sirve para seguirlo. Descartarlo tampoco lo borra;
// queda constando quién lo descartó, que es lo que permite explicar dentro de
// dos años por qué esa serie tiene un hueco.

export async function resolveCustomerThemeAction(
  _prev: AiActionState, formData: FormData
): Promise<AiActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const mutate = await checkQualityCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  const themeId = text(formData, "theme_id");
  const status = text(formData, "status");
  if (!themeId) return { error: "Falta el tema." };
  if (status !== "confirmed" && status !== "discarded") {
    return { error: "Un tema se confirma o se descarta." };
  }

  try {
    await resolveCustomerTheme(themeId, status, optional(formData, "note"));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo resolver el tema." };
  }

  revalidatePath("/quality/copilot");
  revalidatePath("/quality/customer-voice");
  return {
    error: null,
    success: true,
    message: status === "confirmed"
      ? "Tema confirmado. A partir de ahora se puede seguir periodo a periodo."
      : "Tema descartado. Queda constancia de quién lo descartó.",
  };
}
