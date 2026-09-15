import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { ScoringQuestion } from "@/lib/diagnostic/scoring";

export type DiagnosticSection = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  orderIndex: number;
};

export type DiagnosticQuestion = ScoringQuestion & {
  sectionId: string;
  helpText: string | null;
  standardRefs: string[];
  orderIndex: number;
};

export type DiagnosticRow = {
  id: string;
  /** Con qué versión del instrumento se hizo. Se fija al empezar. */
  diagnostic_version_id: string | null;
  status: "in_progress" | "completed";
  maturity_percent: number | null;
  readiness_level: string | null;
  critical_gaps: number;
  section_scores: Record<string, { percent: number; answeredYes: number; total: number }>;
  started_at: string;
  completed_at: string | null;
};

/**
 * PUBLIC-DIAGNOSTICS-01B · La versión VIGENTE del instrumento.
 *
 * Una sola respuesta y un solo sitio donde se da. Antes no hacía falta porque
 * el catálogo era uno; con versiones, preguntar por `is_active` devolvería las
 * preguntas de todas las versiones mezcladas.
 */
export async function getCurrentDiagnosticVersion(
  diagnosticType = "pcr"
): Promise<string | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("diagnostic_current_version", {
    p_type: diagnosticType,
  });
  if (error || typeof data !== "string") return null;
  return data;
}

export async function getDiagnosticSections(versionId: string): Promise<DiagnosticSection[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("diagnostic_sections")
    .select("id, code, title, description, order_index")
    .eq("version_id", versionId)
    .order("order_index");
  return (data ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    title: s.title,
    description: s.description,
    orderIndex: s.order_index,
  }));
}

/**
 * Las preguntas DE UNA VERSIÓN.
 *
 * El `versionId` es obligatorio a propósito: dejarlo opcional habría permitido
 * que una llamada olvidadiza devolviera las preguntas de todas las versiones
 * juntas el día que se publique la v2 — y eso no falla, calcula mal.
 */
export async function getVersionQuestions(versionId: string): Promise<DiagnosticQuestion[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("diagnostic_questions")
    .select(
      "id, code, section_id, question_text, help_text, standard_refs, weight, is_critical, order_index, recommended_action, diagnostic_sections(code)"
    )
    .eq("version_id", versionId)
    .eq("is_active", true)
    .order("order_index");

  return (data ?? []).map((q) => {
    const section = q.diagnostic_sections as unknown as { code: string } | null;
    return {
      id: q.id,
      code: q.code,
      sectionId: q.section_id,
      sectionCode: section?.code ?? "",
      questionText: q.question_text,
      helpText: q.help_text,
      standardRefs: (q.standard_refs as string[]) ?? [],
      weight: Number(q.weight),
      isCritical: q.is_critical,
      orderIndex: q.order_index,
      recommendedAction: q.recommended_action,
    };
  });
}

export async function getLatestDiagnostic(
  organizationId: string
): Promise<DiagnosticRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("diagnostics")
    .select(
      "id, diagnostic_version_id, status, maturity_percent, readiness_level, critical_gaps, section_scores, started_at, completed_at"
    )
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as DiagnosticRow | null) ?? null;
}

export async function getDiagnosticAnswers(
  diagnosticId: string
): Promise<Map<string, { answer: boolean; observations: string | null }>> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("diagnostic_answers")
    .select("question_id, answer, observations")
    .eq("diagnostic_id", diagnosticId);

  const map = new Map<string, { answer: boolean; observations: string | null }>();
  for (const row of data ?? []) {
    map.set(row.question_id, {
      answer: row.answer,
      observations: row.observations,
    });
  }
  return map;
}
