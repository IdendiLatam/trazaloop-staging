"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { checkCprCanMutate } from "@/server/actions/module-plans";
import {
  getVersionQuestions,
  getCurrentDiagnosticVersion,
  getDiagnosticAnswers,
  getLatestDiagnostic,
  getVersionScoringConfig,
} from "@/lib/db/diagnostic";
import { computeDiagnosticResult } from "@/lib/diagnostic/scoring";

export type DiagnosticActionState = { error: string | null };

/** Inicia un diagnóstico si no hay uno en progreso. */
export async function startDiagnosticAction(): Promise<DiagnosticActionState> {
  const org = await requireActiveOrg();

  // Sprint 10A (Bloqueante 3): una suscripción suspended/cancelled deja a
  // la empresa en modo SOLO LECTURA — nunca bloquea ver el diagnóstico,
  // solo iniciar/guardar/completar uno nuevo.
  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const supabase = await createServerClient();

  const latest = await getLatestDiagnostic(org.organizationId);
  if (latest?.status === "in_progress") {
    return { error: "Ya hay un diagnóstico en progreso." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /*
    PUBLIC-DIAGNOSTICS-01B · El diagnóstico nace ATADO a una versión.
    A partir de aquí es suya: publicar otra no le cambia las preguntas.
  */
  const versionId = await getCurrentDiagnosticVersion("pcr");
  if (!versionId) {
    // Falla cerrado: sin instrumento publicado no se empieza a medir nada.
    return { error: "El diagnóstico no está disponible en este momento." };
  }

  const { error } = await supabase.from("diagnostics").insert({
    organization_id: org.organizationId, // SIEMPRE desde la empresa activa
    started_by: user!.id,
    diagnostic_version_id: versionId,
  });

  if (error) return { error: "No fue posible iniciar el diagnóstico." };

  revalidatePath("/diagnostic");
  return { error: null };
}

/**
 * Guarda (upsert) un bloque de respuestas Sí/No de un diagnóstico en progreso.
 * payload: [{ questionId, answer, observations }]
 */
export async function saveDiagnosticAnswersAction(
  diagnosticId: string,
  answers: { questionId: string; answer: boolean; observations?: string }[]
): Promise<DiagnosticActionState> {
  const org = await requireActiveOrg();
  if (answers.length === 0) return { error: null };

  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const supabase = await createServerClient();
  const rows = answers.map((a) => ({
    organization_id: org.organizationId,
    diagnostic_id: diagnosticId,
    question_id: a.questionId,
    answer: a.answer,
    observations: a.observations?.trim() || null,
  }));

  const { error } = await supabase
    .from("diagnostic_answers")
    .upsert(rows, { onConflict: "diagnostic_id,question_id" });

  if (error) {
    return { error: "No fue posible guardar las respuestas. Verifica que el diagnóstico siga en progreso." };
  }

  revalidatePath("/diagnostic");
  return { error: null };
}

/**
 * Completa el diagnóstico: verifica en SERVIDOR que todas las preguntas
 * activas están respondidas, calcula el resultado (función pura) y lo guarda.
 */
export async function completeDiagnosticAction(
  diagnosticId: string
): Promise<DiagnosticActionState> {
  const org = await requireActiveOrg();

  const mutateCheck = await checkCprCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const supabase = await createServerClient();

  /*
    Se puntúa con la versión CON LA QUE SE RESPONDIÓ, no con la vigente. Es la
    misma razón que en la pantalla: si se publicara una v2 entre empezar y
    completar, el resultado saldría de preguntas que esta empresa nunca vio.
  */
  const { data: fila } = await supabase
    .from("diagnostics")
    .select("diagnostic_version_id")
    .eq("id", diagnosticId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  const versionId = (fila as { diagnostic_version_id: string | null } | null)
    ?.diagnostic_version_id ?? null;
  if (!versionId) {
    return { error: "No fue posible identificar la versión del diagnóstico. No se guardó nada." };
  }

  /*
    PUBLIC-DIAGNOSTICS-01F · Y con el PERFIL de esa versión.

    Se puntuaba con los umbrales escritos en `lib/diagnostic/scoring.ts`. Para
    PCR v1 son exactamente los mismos que guardó 0195 —hay una prueba que lo
    comprueba contra la base—, así que ningún resultado cambia hoy. Lo que
    cambia es el día que exista una v2 con otros umbrales: entonces un
    diagnóstico de la v1 se seguirá puntuando con los suyos.

    Es además lo que permite afirmar que el diagnóstico público y el
    autenticado comparten motor Y entradas, no solo la función.
  */
  const scoringConfig = await getVersionScoringConfig(versionId);
  if (!scoringConfig) {
    return { error: "No fue posible leer la configuración del diagnóstico. No se guardó nada." };
  }

  const questions = await getVersionQuestions(versionId);
  const answersMap = await getDiagnosticAnswers(diagnosticId);
  const answers = new Map<string, boolean>();
  for (const [questionId, a] of answersMap) answers.set(questionId, a.answer);

  const result = computeDiagnosticResult(questions, answers, scoringConfig);

  if (!result.complete) {
    return {
      error: `Faltan ${result.missingQuestionIds.length} pregunta(s) por responder. Responde todas antes de completar.`,
    };
  }

  const sectionScores = Object.fromEntries(
    result.sectionScores.map((s) => [
      s.sectionCode,
      { percent: s.percent, answeredYes: s.answeredYes, total: s.total },
    ])
  );

  const { error } = await supabase
    .from("diagnostics")
    .update({
      status: "completed",
      maturity_percent: result.maturityPercent,
      readiness_level: result.readinessLevel,
      critical_gaps: result.criticalGaps,
      section_scores: sectionScores,
      completed_at: new Date().toISOString(),
    })
    .eq("id", diagnosticId)
    .eq("organization_id", org.organizationId)
    .eq("status", "in_progress");

  if (error) return { error: "No fue posible completar el diagnóstico." };

  revalidatePath("/diagnostic");
  return { error: null };
}

/** Variante para usar directamente como action de <form> (retorna void). */
export async function startDiagnosticFormAction(): Promise<void> {
  await startDiagnosticAction();
}
