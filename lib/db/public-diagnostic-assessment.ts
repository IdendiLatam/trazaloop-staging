import "server-only";

import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseScoringConfig } from "@/lib/diagnostic/scoring-config";
import { buildPublicResultSnapshot } from "@/lib/diagnostic/public-result";
import type { ScoringQuestion } from "@/lib/diagnostic/scoring";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01F · El diagnóstico público, contra la base.
 *
 *
 * DOS CAMINOS, Y LA DIFERENCIA IMPORTA
 *
 * Leer el instrumento y guardar una sección van por el cliente PÚBLICO: dos
 * funciones acotadas que `anon` puede ejecutar y que devuelven exactamente lo
 * que hace falta pintar. Si esto se llamara desde cualquier otro sitio,
 * obtendría lo mismo que obtiene el público.
 *
 * CERRAR la participación no. El resultado lo calcula `computeDiagnosticResult`
 * aquí, en TypeScript, así que llega a la base como un dato ya calculado: si la
 * función que lo escribe fuera ejecutable por `anon`, cualquiera podría
 * declararse «candidato a auditoría» con una llamada. Por eso la primitiva de
 * cierre solo se concede a `service_role` y solo se alcanza por el cliente
 * administrativo, que importa "server-only" y no existe en el navegador.
 *
 *
 * EL IDENTIFICADOR DE LA PARTICIPACIÓN NO ES UNA CREDENCIAL
 *
 * Ninguna de estas funciones acepta un `submissionId`. Todas parten del
 * TESTIGO, que viaja en una cookie HttpOnly y que el navegador no puede leer
 * ni fabricar. La base lo vuelve a resolver por su cuenta en cada llamada.
 */

type Json = Record<string, unknown>;

export type PublicQuestion = {
  id: string;
  code: string;
  text: string;
  help: string | null;
  refs: string[];
  order: number;
  /** `null` es «sin responder», y NO es lo mismo que «No». */
  answer: boolean | null;
  observations: string | null;
};

export type PublicSection = {
  code: string;
  title: string;
  description: string | null;
  order: number;
  total: number;
  answered: number;
  questions: PublicQuestion[];
};

export type PublicAssessment = {
  submissionStatus: "in_progress" | "completed" | "abandoned";
  slug: string;
  publicTitle: string;
  partnerName: string | null;
  writable: boolean;
  lockedReason: string | null;
  answerType: string;
  sections: PublicSection[];
  progress: {
    answered: number; total: number;
    sectionsComplete: number; sectionsTotal: number;
  };
  firstIncompleteSection: string | null;
};

/** Lo que ve quien tiene el testigo. `null` si el testigo no vale. */
export async function getPublicAssessment(
  token: string
): Promise<PublicAssessment | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("public_diagnostic_get_assessment", {
    p_token: token,
  });
  if (error || !data || typeof data !== "object") return null;
  const r = data as Json;
  if (r.status !== "found") return null;

  const progreso = (r.progress ?? {}) as Json;
  return {
    submissionStatus: r.submission_status as PublicAssessment["submissionStatus"],
    slug: String(r.slug ?? ""),
    publicTitle: String(r.public_title ?? ""),
    partnerName: (r.partner_name as string) ?? null,
    writable: r.writable === true,
    lockedReason: (r.locked_reason as string) ?? null,
    answerType: String(r.answer_type ?? "yes_no"),
    sections: ((r.sections as unknown[]) ?? []).map((s) => {
      const x = s as Json;
      return {
        code: String(x.code ?? ""),
        title: String(x.title ?? ""),
        description: (x.description as string) ?? null,
        order: Number(x.order ?? 0),
        total: Number(x.total ?? 0),
        answered: Number(x.answered ?? 0),
        questions: ((x.questions as unknown[]) ?? []).map((q) => {
          const y = q as Json;
          return {
            id: String(y.id ?? ""),
            code: String(y.code ?? ""),
            text: String(y.text ?? ""),
            help: (y.help as string) ?? null,
            refs: (y.refs as string[]) ?? [],
            order: Number(y.order ?? 0),
            answer: typeof y.answer === "boolean" ? y.answer : null,
            observations: (y.observations as string) ?? null,
          };
        }),
      };
    }),
    progress: {
      answered: Number(progreso.answered ?? 0),
      total: Number(progreso.total ?? 0),
      sectionsComplete: Number(progreso.sections_complete ?? 0),
      sectionsTotal: Number(progreso.sections_total ?? 0),
    },
    firstIncompleteSection: (r.first_incomplete_section as string) ?? null,
  };
}

export type SaveOutcome =
  | { status: "saved"; answered: number; total: number }
  | { status: "locked"; reason: string }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "invalid" }
  | { status: "error" };

/** Una sección entera en un viaje. Ver §5 del encargo. */
export async function savePublicSection(
  token: string,
  sectionCode: string,
  answers: { questionId: string; answer: boolean; observations: string | null }[]
): Promise<SaveOutcome> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("public_diagnostic_save_progress", {
    p_token: token,
    p_section_code: sectionCode,
    p_answers: answers.map((a) => ({
      question_id: a.questionId,
      answer: a.answer,
      observations: a.observations,
    })),
  });
  if (error || !data || typeof data !== "object") return { status: "error" };
  const r = data as Json;
  if (r.status === "saved") {
    return {
      status: "saved",
      answered: Number(r.answered ?? 0),
      total: Number(r.total ?? 0),
    };
  }
  if (r.status === "locked") {
    return { status: "locked", reason: String(r.reason ?? "locked") };
  }
  for (const s of ["not_found", "rate_limited", "invalid"] as const) {
    if (r.status === s) return { status: s };
  }
  return { status: "error" };
}

export type FinalizeOutcome =
  | { status: "completed"; slug: string }
  | { status: "already_completed"; slug: string }
  | { status: "incomplete"; answered: number; total: number }
  | { status: "locked"; reason: string }
  | { status: "not_found" }
  | { status: "rate_limited" }
  | { status: "error" };

/**
 * Cerrar la participación: leer, calcular en servidor y congelar.
 *
 * El orden es el que exige el encargo y no es negociable: se cargan las
 * respuestas GUARDADAS —no las que diga el navegador—, se carga la versión
 * inmutable con su perfil de puntuación, se puntúa con el motor único y solo
 * entonces se llama a la primitiva privilegiada.
 */
export async function finalizePublicSubmission(
  token: string
): Promise<FinalizeOutcome> {
  if (typeof token !== "string" || token.length !== 64) {
    return { status: "not_found" };
  }
  const hash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("public_diagnostic_submissions")
    .select("id, status, diagnostic_version_id, campaign_id")
    .eq("resume_token_hash", hash)
    .maybeSingle();
  if (!sub) return { status: "not_found" };

  const { data: version } = await admin
    .from("diagnostic_versions")
    .select("id, diagnostic_type, version_number, scoring_config")
    .eq("id", sub.diagnostic_version_id)
    .maybeSingle();
  if (!version) return { status: "error" };

  // FALLA CERRADO. Un perfil ilegible no se sustituye por el del código: eso
  // puntuaría con los umbrales de hoy un instrumento que congeló los suyos.
  const config = parseScoringConfig(version.scoring_config);
  if (!config) return { status: "error" };

  const { data: secciones } = await admin
    .from("diagnostic_sections")
    .select("code, title, order_index")
    .eq("version_id", version.id)
    .order("order_index");

  const { data: preguntas } = await admin
    .from("diagnostic_questions")
    .select(
      "id, code, weight, is_critical, question_text, recommended_action, order_index, diagnostic_sections(code)"
    )
    .eq("version_id", version.id)
    .eq("is_active", true)
    .order("order_index");
  if (!preguntas || preguntas.length === 0) return { status: "error" };

  const questions: ScoringQuestion[] = preguntas.map((q) => {
    const sec = q.diagnostic_sections as unknown as { code: string } | null;
    return {
      id: q.id,
      code: q.code,
      sectionCode: sec?.code ?? "",
      questionText: q.question_text,
      weight: Number(q.weight),
      isCritical: q.is_critical,
      recommendedAction: q.recommended_action,
    };
  });

  const { data: respuestas } = await admin
    .from("public_diagnostic_answers")
    .select("question_id, answer")
    .eq("submission_id", sub.id);
  const answers = new Map<string, boolean>();
  for (const a of respuestas ?? []) answers.set(a.question_id, a.answer);

  const snapshot = buildPublicResultSnapshot({
    questions,
    sections: (secciones ?? []).map((s) => ({
      code: s.code, title: s.title, orderIndex: s.order_index,
    })),
    answers,
    config,
    instrument: {
      type: version.diagnostic_type,
      versionNumber: version.version_number,
    },
  });

  // El número requerido sale de la versión, aquí y también dentro de la
  // primitiva: si alguien llamara saltándose esta comprobación, la base la
  // vuelve a hacer.
  if (!snapshot.complete) {
    return {
      status: "incomplete",
      answered: questions.length - snapshot.missing,
      total: questions.length,
    };
  }

  const { data, error } = await admin.rpc(
    "public_diagnostic_finalize_submission", {
      p_token: token,
      p_maturity: snapshot.maturityPercent,
      p_level: snapshot.readinessLevel,
      p_gaps: snapshot.criticalGaps,
      p_section_scores: snapshot.sectionScores,
      p_result_payload: snapshot.resultPayload,
    });
  if (error || !data || typeof data !== "object") return { status: "error" };
  const r = data as Json;
  if (r.status === "completed" || r.status === "already_completed") {
    return { status: r.status, slug: String(r.slug ?? "") };
  }
  if (r.status === "incomplete") {
    return {
      status: "incomplete",
      answered: Number(r.answered ?? 0),
      total: Number(r.total ?? 0),
    };
  }
  if (r.status === "locked") {
    return { status: "locked", reason: String(r.reason ?? "locked") };
  }
  for (const s of ["not_found", "rate_limited"] as const) {
    if (r.status === s) return { status: s };
  }
  return { status: "error" };
}

/**
 * PUBLIC-DIAGNOSTICS-01G · El resultado, tal como se congeló.
 *
 * Pasa por una función distinta de la del cuestionario, y a propósito: aquella
 * carga las seis secciones y las 52 preguntas para poder pintarlas, y en la
 * pantalla de resultado eso sería traer el instrumento entero para enseñar un
 * porcentaje —y dejar a mano todo lo necesario para recalcular—.
 *
 * Aquí no hay motor, ni versión, ni preguntas. Lo que devuelve la base es la
 * instantánea persistida, y esta capa se limita a nombrarla en castellano.
 */
export type PublicResult = {
  slug: string;
  publicTitle: string;
  partnerName: string | null;
  companyName: string;
  completedAt: string | null;
  allowRepeat: boolean;
  /** La instantánea, sin tocar. La valida `parsePublicSnapshot`. */
  snapshot: unknown;
};

export type ResultOutcome =
  | { status: "found"; result: PublicResult }
  | { status: "not_completed"; slug: string }
  | { status: "unavailable" }
  | { status: "not_found" };

export async function getPublicResult(token: string): Promise<ResultOutcome> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("public_diagnostic_get_result", {
    p_token: token,
  });
  if (error || !data || typeof data !== "object") return { status: "not_found" };
  const r = data as Json;
  if (r.status === "not_completed") {
    return { status: "not_completed", slug: String(r.slug ?? "") };
  }
  if (r.status !== "found") {
    return r.status === "unavailable" ? { status: "unavailable" } : { status: "not_found" };
  }
  return {
    status: "found",
    result: {
      slug: String(r.slug ?? ""),
      publicTitle: String(r.public_title ?? ""),
      partnerName: (r.partner_name as string) ?? null,
      companyName: String(r.company_name ?? ""),
      completedAt: (r.completed_at as string) ?? null,
      allowRepeat: r.allow_repeat === true,
      snapshot: r.result ?? null,
    },
  };
}
