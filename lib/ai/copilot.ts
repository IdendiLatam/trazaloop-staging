import "server-only";

import { aiConfig, aiCredentialConfigured } from "./config";
import { buildContext, type ContextRequest } from "./context/builder";
import "./context/adapters";
import { resolveProvider } from "./provider";
import { ANSWER_SCHEMA, ANSWER_SCHEMA_NAME, evidenceFromContext, validateAnswer,
         type AiAnswer } from "./schemas";
import { tenantBlock, type PromptTemplate } from "./prompts";
import type { ContextPack, TemporalScope } from "./context/types";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · QUALITY-12 · El orquestador.
 *
 * EL ORDEN, QUE NO ES CASUAL
 *
 *   1. La base decide si se puede (empresa encendida, uso permitido, topes) y
 *      abre la ejecución. Si dice que no, NO se llama al proveedor: un tope que
 *      se comprueba después de gastar no es un tope (§147).
 *   2. El servidor construye el contexto autorizado con la sesión de quien
 *      pregunta. Aquí es donde se aplica todo lo que esta persona no puede ver.
 *   3. Las referencias se escriben en la base ANTES de llamar al modelo. Por
 *      eso una cita solo puede apuntar a algo que ya existía (§21).
 *   4. Se llama al proveedor con la política, la tarea y —marcado como
 *      material— el contexto y la pregunta.
 *   5. Se valida la respuesta y se limpian las citas inventadas.
 *   6. Se cierra la ejecución con lo que costó y con cuánta evidencia había.
 *
 * SI ALGO FALLA EN EL PASO 4, LOS PASOS 1 A 3 YA OCURRIERON: queda constancia
 * de qué se preguntó y con qué contexto, y la ejecución se marca fallida (§146).
 * Lo que NO ocurre en ningún caso es una escritura en una tabla de negocio.
 */

export type CopilotRequest = {
  organizationId: string;
  useCase: string;
  feature: "general" | "people" | "customer" | "drafts";
  prompt: PromptTemplate;
  question: string;
  temporal: TemporalScope;
  pinned?: { type: string; id: string; label?: string } | null;
  sessionId?: string | null;
  allow: { people: boolean; customer: boolean };
};

export type CopilotOutcome =
  | {
      ok: true;
      runId: string;
      answer: AiAnswer;
      references: ContextPack["refs"];
      context: { sources: string[]; limitations: string[]; conflicts: string[];
                 truncated: boolean; items: number };
      provider: string; model: string; live: boolean;
      droppedCitations: number;
    }
  | { ok: false; runId: string | null; reason: string; message: string };

/**
 * `client` existe para poder comprobar esto contra una base real sin montar un
 * servidor: se le pasa la sesión de un usuario de prueba y el orquestador hace
 * exactamente lo mismo que en producción. Sin él, una parte enorme de este
 * sprint solo se podría comprobar leyendo el código.
 */
export async function runCopilot(
  req: CopilotRequest,
  client?: Awaited<ReturnType<typeof createServerClient>>
): Promise<CopilotOutcome> {
  const cfg = aiConfig();
  const { provider, live } = resolveProvider();
  const db = client ?? await createServerClient();

  // §90 · Lo que una persona puede escribir de una vez tiene tope. Un texto
  // enorme no mejora la respuesta: engorda la factura y diluye el contexto.
  const pregunta = req.question.trim().slice(0, cfg.maxQuestionChars);
  if (pregunta.length === 0) {
    return { ok: false, runId: null, reason: "empty", message: "Escribe una pregunta." };
  }

  // ---- 1 · ¿Se puede? ------------------------------------------------------
  const { data: permiso, error: errPermiso } = await db.rpc("quality_ai_start_run", {
    p_organization_id: req.organizationId,
    p_use_case: req.useCase,
    p_feature: req.feature,
    p_provider: provider.name,
    p_model: cfg.model,
    p_prompt_template: req.prompt.name,
    p_prompt_version: req.prompt.version,
    p_session_id: req.sessionId ?? null,
    p_question: pregunta,
    p_temporal_mode: req.temporal.mode,
    p_as_of: req.temporal.asOf ?? null,
    p_period_start: req.temporal.periodStart ?? null,
    p_period_end: req.temporal.periodEnd ?? null,
  });
  if (errPermiso) {
    return { ok: false, runId: null, reason: "denied", message: errPermiso.message };
  }
  const p = permiso as { allowed: boolean; reason?: string; message?: string; run_id?: string };
  if (!p?.allowed) {
    return {
      ok: false, runId: null, reason: p?.reason ?? "denied",
      message: p?.message ?? "El Copilot no está disponible para esta empresa.",
    };
  }
  const runId = String(p.run_id);

  // ---- 2 · El contexto autorizado -----------------------------------------
  const ctxReq: ContextRequest = {
    organizationId: req.organizationId,
    useCase: req.useCase,
    question: pregunta,
    temporal: req.temporal,
    pinned: req.pinned ? { type: req.pinned.type, id: req.pinned.id } : null,
    allow: req.allow,
  };
  const pack = await buildContext(ctxReq, db);

  // ---- 3 · Las referencias, ANTES de preguntar ----------------------------
  for (const r of pack.refs) {
    await db.rpc("quality_ai_add_reference", {
      p_run_id: runId,
      p_ordinal: r.ordinal,
      p_source_code: r.sourceCode,
      p_entity_type: r.entityType,
      p_entity_id: r.entityId,
      p_label: r.label,
      p_deep_link: r.deepLink,
      p_as_of: r.asOf ?? null,
      p_revision: r.revisionLabel ?? null,
    });
  }

  // §19/§67 · Sin contexto no se llama al proveedor: se responde que no hay
  // información suficiente, que es la verdad y además no cuesta nada.
  if (pack.refs.length === 0) {
    const respuesta: AiAnswer = {
      summary: "No encontré información suficiente en Trazaloop para responder a esto.",
      facts: [],
      interpretation: [],
      suggestions: [],
      unanswered: [
        "No hay datos autorizados relacionados con la pregunta, o quedan fuera de lo que tu rol puede consultar.",
      ],
      evidence: "missing",
    };
    await db.rpc("quality_ai_complete_run", {
      p_run_id: runId, p_answer: respuesta as unknown as Record<string, unknown>,
      p_evidence_level: "missing", p_input_tokens: 0, p_output_tokens: 0, p_tool_calls: 0,
    });
    return {
      ok: true, runId, answer: respuesta, references: [],
      context: { sources: [], limitations: pack.temporalLimitations,
                 conflicts: pack.conflicts, truncated: false, items: 0 },
      provider: provider.name, model: cfg.model, live, droppedCitations: 0,
    };
  }

  // ---- 4 · Preguntar ------------------------------------------------------
  const material = renderContext(pack);
  const resultado = await provider.generateStructured({
    system: req.prompt.system,
    schemaName: ANSWER_SCHEMA_NAME,
    schema: ANSWER_SCHEMA,
    config: cfg,
    messages: [
      { role: "user", content:
        `${material}\n\n`
        + tenantBlock("PREGUNTA DE LA PERSONA", pregunta)
        + `\n\nResponde usando la estructura pedida. Cita por número.` },
    ],
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
        ? "El Copilot tardó demasiado. Inténtalo de nuevo en un momento."
        : "El Copilot no está disponible temporalmente. El resto de Trazaloop sigue funcionando.",
    };
  }

  // ---- 5 · Validar y limpiar las citas ------------------------------------
  const validado = validateAnswer(resultado.value, pack.refs.length);
  if (!validado.ok) {
    await db.rpc("quality_ai_fail_run", {
      p_run_id: runId, p_status: "failed", p_error: validado.error,
    });
    return {
      ok: false, runId, reason: "invalid_output",
      message: "El Copilot devolvió una respuesta que no se pudo interpretar. No se guardó nada.",
    };
  }

  // §66 · El nivel de evidencia lo pone el SERVIDOR contando lo que encontró,
  // no el modelo opinando sobre sí mismo.
  const evidencia = evidenceFromContext(pack.refs.length, validado.answer.facts.length);
  const respuesta: AiAnswer = { ...validado.answer, evidence: evidencia };

  await db.rpc("quality_ai_complete_run", {
    p_run_id: runId,
    p_answer: respuesta as unknown as Record<string, unknown>,
    p_evidence_level: evidencia,
    p_input_tokens: resultado.usage.inputTokens,
    p_output_tokens: resultado.usage.outputTokens,
    p_tool_calls: 0,
  });

  return {
    ok: true, runId, answer: respuesta, references: pack.refs,
    context: {
      sources: pack.sourcesUsed, limitations: pack.temporalLimitations,
      conflicts: pack.conflicts, truncated: pack.truncated, items: pack.refs.length,
    },
    provider: provider.name, model: cfg.model, live,
    droppedCitations: validado.droppedCitations,
  };
}

/**
 * §23 · Cómo se le presenta el contexto al modelo.
 *
 * Tres bloques, y el orden importa: primero las fuentes numeradas —para poder
 * citar—, luego los hechos ya calculados —para no tener que contar—, y al final
 * el texto de la empresa, envuelto y marcado como material.
 */
export function renderContext(pack: ContextPack): string {
  const partes: string[] = [];

  partes.push("FUENTES AUTORIZADAS (cita por su número):");
  for (const r of pack.refs) {
    partes.push(`[${r.ordinal}] ${r.label}${r.asOf ? ` · situación al ${r.asOf}` : ""}`);
  }

  if (pack.facts.length > 0) {
    partes.push("");
    partes.push("HECHOS YA CALCULADOS POR TRAZALOOP (no los recalcules):");
    for (const f of pack.facts) {
      partes.push(`· ${f.statement} [${f.refs.join(", ")}]`);
    }
  }

  if (pack.temporal.mode !== "current") {
    partes.push("");
    partes.push(pack.temporal.mode === "as_of"
      ? `LA PREGUNTA ES SOBRE LA SITUACIÓN AL ${pack.temporal.asOf}.`
      : `LA PREGUNTA ES SOBRE EL PERIODO ${pack.temporal.periodStart} — ${pack.temporal.periodEnd}.`);
  }
  if (pack.temporalLimitations.length > 0) {
    partes.push("LIMITACIONES DE LAS FUENTES: " + pack.temporalLimitations.join(" "));
  }
  if (pack.conflicts.length > 0) {
    partes.push("FUENTES QUE SE CONTRADICEN: " + pack.conflicts.join(" "));
  }
  if (pack.truncated) {
    partes.push("AVISO: el contexto se recortó por tamaño. Dilo en la respuesta.");
  }

  const cuerpo = partes.join("\n");
  if (pack.notes.length === 0) return cuerpo;

  const texto = pack.notes
    .map((n) => `— ${n.title} [${n.refs.join(", ")}]\n${n.body}`)
    .join("\n\n");
  return `${cuerpo}\n\n${tenantBlock("TEXTOS REGISTRADOS EN TRAZALOOP", texto)}`;
}

export function copilotConfigured(): boolean {
  return aiCredentialConfigured();
}
