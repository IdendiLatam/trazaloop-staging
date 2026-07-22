"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireTextilesForAction } from "@/lib/auth/require-textiles-module";
import { checkOrganizationCanMutate } from "@/server/actions/plans";
import {
  getActiveTextileQuestions,
  getLatestTextileDiagnostic,
  getTextileDiagnosticAnswers,
  getTextileDiagnosticSections,
} from "@/lib/db/textiles-diagnostic";
import {
  computeTextileDiagnosticResult,
  isTextileAnswerValue,
  type TextileAnswerValue,
} from "@/lib/domain/textiles-diagnostic";

/**
 * Trazaloop · Sprint T2 (Textil) · Server actions del diagnóstico textil.
 *
 * Mismo patrón que server/actions/diagnostic.ts (CPR) SIN reutilizar sus
 * tablas ni su scoring: catálogo global + instancia por empresa + upsert de
 * respuestas + completar con cálculo PURO en servidor. Guardas, en orden:
 *  1. requireActiveOrg (organization_id JAMÁS del cliente);
 *  2. módulo Textil accesible: flag TEXTILES_MODULE_ENABLED + habilitación
 *     en organization_modules (misma regla que el guard de /textiles);
 *  3. checkOrganizationCanMutate (Bloqueante 3, transversal de plataforma):
 *     suscripción suspended/cancelled = SOLO LECTURA.
 */

export type TextileDiagnosticActionState = { error: string | null };

/** Inicia un diagnóstico textil si no hay uno en progreso. */
export async function startTextileDiagnosticAction(): Promise<TextileDiagnosticActionState> {
  const gate = await requireTextilesForAction();
  if (gate.org === null) return { error: gate.error };
  const org = gate.org;

  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const latest = await getLatestTextileDiagnostic(org.organizationId);
  if (latest?.status === "in_progress") {
    return { error: "Ya hay un diagnóstico textil en progreso." };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("textile_diagnostics").insert({
    organization_id: org.organizationId, // SIEMPRE desde la empresa activa
    started_by: user!.id,
  });

  if (error) return { error: "No fue posible iniciar el diagnóstico textil." };

  revalidatePath("/textiles/diagnostic");
  revalidatePath("/textiles");
  return { error: null };
}

/** Variante para usar directamente como action de <form> (retorna void). */
export async function startTextileDiagnosticFormAction(): Promise<void> {
  await startTextileDiagnosticAction();
}

/**
 * Guarda (upsert) un bloque de respuestas de un diagnóstico en progreso.
 * Valida en servidor: valor dentro de la escala de 4 opciones y "No aplica"
 * rechazado en preguntas que no lo admiten (allows_na = false).
 */
export async function saveTextileDiagnosticAnswersAction(
  diagnosticId: string,
  answers: { questionId: string; answer: string; observations?: string }[]
): Promise<TextileDiagnosticActionState> {
  const gate = await requireTextilesForAction();
  if (gate.org === null) return { error: gate.error };
  const org = gate.org;

  if (answers.length === 0) return { error: null };

  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const questions = await getActiveTextileQuestions();
  const byId = new Map(questions.map((q) => [q.id, q]));

  const rows: {
    organization_id: string;
    diagnostic_id: string;
    question_id: string;
    answer: TextileAnswerValue;
    observations: string | null;
  }[] = [];

  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q) return { error: "Respuesta para una pregunta desconocida." };
    if (!isTextileAnswerValue(a.answer)) {
      return { error: "Respuesta fuera de la escala Sí / Parcial / No / No aplica." };
    }
    if (a.answer === "not_applicable" && !q.allowsNa) {
      return {
        error: `La pregunta ${q.code} no admite "No aplica": responde Sí, Parcial o No.`,
      };
    }
    rows.push({
      organization_id: org.organizationId,
      diagnostic_id: diagnosticId,
      question_id: a.questionId,
      answer: a.answer,
      observations: a.observations?.trim() || null,
    });
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("textile_diagnostic_answers")
    .upsert(rows, { onConflict: "diagnostic_id,question_id" });

  if (error) {
    return {
      error:
        "No fue posible guardar las respuestas. Verifica que el diagnóstico siga en progreso.",
    };
  }

  revalidatePath("/textiles/diagnostic");
  return { error: null };
}

/**
 * Finaliza el diagnóstico mediante la RPC controlada
 * finalize_textile_diagnostic (0072). Desde T2.1 NO existe update directo
 * de textile_diagnostics para clientes: la RPC re-valida en BD identidad,
 * membresía, habilitación del módulo, propiedad, estado borrador,
 * completitud, "No aplica" inválidos y la regla de contexto, y CALCULA el
 * resultado en SQL — nada calculado por el cliente se persiste. Aquí solo
 * se pre-valida con la función pura para dar mensajes amigables antes de
 * llamar a la RPC (la autoridad es la RPC).
 */
export async function completeTextileDiagnosticAction(
  diagnosticId: string
): Promise<TextileDiagnosticActionState> {
  const gate = await requireTextilesForAction();
  if (gate.org === null) return { error: gate.error };

  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const [sections, questions, answersMap] = await Promise.all([
    getTextileDiagnosticSections(),
    getActiveTextileQuestions(),
    getTextileDiagnosticAnswers(diagnosticId),
  ]);

  const answers = new Map<string, TextileAnswerValue>();
  for (const [questionId, a] of answersMap) answers.set(questionId, a.answer);

  const result = computeTextileDiagnosticResult(sections, questions, answers);

  if (!result.complete) {
    if (result.invalidNaQuestionIds.length > 0) {
      return {
        error: `Hay ${result.invalidNaQuestionIds.length} pregunta(s) con "No aplica" donde no se admite. Corrígelas antes de finalizar.`,
      };
    }
    return {
      error: `Faltan ${result.missingQuestionIds.length} pregunta(s) por responder. Responde todas antes de finalizar.`,
    };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("finalize_textile_diagnostic", {
    p_diagnostic_id: diagnosticId,
  });

  if (error) return { error: "No fue posible finalizar el diagnóstico textil." };

  // Verificación de consistencia (cinturón y tirantes): el cálculo SQL de
  // la RPC debe coincidir con la función pura de dominio. Una divergencia
  // indicaría desalineación entre ambas implementaciones y se registra en
  // el log del servidor — el valor persistido (RPC) es el autoritativo.
  const stored = data as { maturity_percent?: number; maturity_level?: string } | null;
  if (
    stored &&
    (Math.abs(Number(stored.maturity_percent ?? 0) - result.maturityPercent) > 0.01 ||
      stored.maturity_level !== result.maturityLevel)
  ) {
    console.error(
      "[trazaloop] finalize_textile_diagnostic: divergencia entre cálculo SQL y dominio",
      { diagnosticId, sql: stored, domain: { percent: result.maturityPercent, level: result.maturityLevel } }
    );
  }

  revalidatePath("/textiles/diagnostic");
  revalidatePath("/textiles/diagnostic/results");
  revalidatePath("/textiles");
  return { error: null };
}
