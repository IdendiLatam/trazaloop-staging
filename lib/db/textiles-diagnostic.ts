import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type {
  TextileAnswerValue,
  TextileMaturityLevel,
  TextileScoringQuestion,
  TextileScoringSection,
} from "@/lib/domain/textiles-diagnostic";

/**
 * Trazaloop · Sprint T2 (Textil) · Consultas del diagnóstico textil.
 *
 * Todo corre con la sesión real bajo RLS (0071): catálogos globales de
 * lectura autenticada; instancias y respuestas solo de la propia empresa.
 * Nada aquí usa service_role.
 */

export type TextileDiagnosticSection = TextileScoringSection & {
  id: string;
  description: string | null;
  orderIndex: number;
};

export type TextileDiagnosticQuestion = TextileScoringQuestion & {
  sectionId: string;
  helpText: string | null;
  standardRefs: string[];
  orderIndex: number;
};

export type TextileDiagnosticRow = {
  id: string;
  status: "in_progress" | "completed";
  maturityPercent: number | null;
  maturityLevel: TextileMaturityLevel | null;
  criticalGaps: number;
  dimensionScores: Record<string, { percent: number | null; cappedByCritical: boolean; applicableCount: number; totalCount: number }>;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
};

export async function getTextileDiagnosticSections(): Promise<TextileDiagnosticSection[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_diagnostic_sections")
    .select("id, code, title, description, order_index, weight")
    .order("order_index", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id as string,
    code: r.code as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    orderIndex: r.order_index as number,
    weight: Number(r.weight),
  }));
}

export async function getActiveTextileQuestions(): Promise<TextileDiagnosticQuestion[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_diagnostic_questions")
    .select(
      "id, section_id, code, question_text, help_text, standard_refs, weight, is_critical, allows_na, is_context, order_index, recommended_action, textile_diagnostic_sections(code)"
    )
    .eq("is_active", true)
    .order("order_index", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => {
    const section = r.textile_diagnostic_sections as unknown as { code: string } | null;
    return {
      id: r.id as string,
      sectionId: r.section_id as string,
      sectionCode: section?.code ?? "",
      code: r.code as string,
      questionText: r.question_text as string,
      helpText: (r.help_text as string | null) ?? null,
      standardRefs: (r.standard_refs as string[]) ?? [],
      weight: Number(r.weight),
      isCritical: Boolean(r.is_critical),
      allowsNa: Boolean(r.allows_na),
      isContext: Boolean(r.is_context),
      orderIndex: r.order_index as number,
      recommendedAction: (r.recommended_action as string | null) ?? null,
    };
  });
}

function toDiagnosticRow(r: Record<string, unknown>): TextileDiagnosticRow {
  return {
    id: r.id as string,
    status: r.status as "in_progress" | "completed",
    maturityPercent: r.maturity_percent === null ? null : Number(r.maturity_percent),
    maturityLevel: (r.maturity_level as TextileMaturityLevel | null) ?? null,
    criticalGaps: (r.critical_gaps as number) ?? 0,
    dimensionScores:
      (r.dimension_scores as TextileDiagnosticRow["dimensionScores"]) ?? {},
    startedAt: r.started_at as string,
    completedAt: (r.completed_at as string | null) ?? null,
    updatedAt: r.updated_at as string,
  };
}

/** Último diagnóstico textil de la empresa (en progreso o completado). */
export async function getLatestTextileDiagnostic(
  organizationId: string
): Promise<TextileDiagnosticRow | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_diagnostics")
    .select(
      "id, status, maturity_percent, maturity_level, critical_gaps, dimension_scores, started_at, completed_at, updated_at"
    )
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toDiagnosticRow(data);
}

/** Último diagnóstico textil COMPLETADO (para resultados históricos). */
export async function getLatestCompletedTextileDiagnostic(
  organizationId: string
): Promise<TextileDiagnosticRow | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_diagnostics")
    .select(
      "id, status, maturity_percent, maturity_level, critical_gaps, dimension_scores, started_at, completed_at, updated_at"
    )
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return toDiagnosticRow(data);
}

export type TextileStoredAnswer = {
  answer: TextileAnswerValue;
  observations: string | null;
};

export async function getTextileDiagnosticAnswers(
  diagnosticId: string
): Promise<Map<string, TextileStoredAnswer>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_diagnostic_answers")
    .select("question_id, answer, observations")
    .eq("diagnostic_id", diagnosticId);
  const map = new Map<string, TextileStoredAnswer>();
  if (error || !data) return map;
  for (const r of data) {
    map.set(r.question_id as string, {
      answer: r.answer as TextileAnswerValue,
      observations: (r.observations as string | null) ?? null,
    });
  }
  return map;
}
