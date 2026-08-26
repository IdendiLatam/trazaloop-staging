import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { AnonymityMode, QuestionType } from "@/lib/domain/quality-customer-voice";

/**
 * Trazaloop · QUALITY-08 · La superficie PÚBLICA de una encuesta.
 *
 * Vive en su propio archivo por una razón que no es estética: todo lo que hay
 * aquí corre SIN SESIÓN. Mezclarlo con la capa autenticada haría que un día
 * alguien reutilizara una función de aquí desde dentro y no lo notara.
 *
 * LAS TRES REGLAS DE ESTA FRONTERA
 *
 * 1 · Solo existen DOS funciones, y las dos llaman a una RPC. No hay ninguna
 *     consulta a tabla: `anon` no tiene privilegios sobre ninguna del dominio,
 *     así que ni siquiera podría.
 *
 * 2 · El contexto lo resuelve el TOKEN. Nunca llega un `organization_id` desde
 *     el navegador; si llegara, no se usaría.
 *
 * 3 · Todo fallo dice lo mismo: «no disponible». Distinguir «no existe» de
 *     «caducado» de «campaña cerrada» le diría a quien prueba tokens si acertó
 *     con uno, y eso ya es información.
 */

export type PublicQuestion = {
  id: string;
  stable_key: string;
  label: string;
  help_text: string | null;
  question_type: QuestionType;
  is_required: boolean;
  allows_not_applicable: boolean;
  scale_min: number | null;
  scale_max: number | null;
  scale_step: number | null;
  scale_min_label: string | null;
  scale_max_label: string | null;
  options: { key: string; label: string }[] | null;
};

export type PublicSurvey = {
  organizationName: string;
  surveyName: string;
  surveyPurpose: string | null;
  campaignName: string;
  periodLabel: string | null;
  /** §24 · Quien responde lo sabe ANTES de enviar, no después. */
  anonymityMode: AnonymityMode;
  versionNumber: number;
  introText: string | null;
  closingText: string | null;
  questions: PublicQuestion[];
};

/** Resuelve el enlace. `null` para cualquier motivo: inventado, caducado,
 *  revocado, ya usado, campaña en borrador, campaña cerrada, versión sin
 *  publicar o fuera de la ventana. */
export async function resolvePublicSurvey(token: string): Promise<PublicSurvey | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_resolve_survey_token", {
    p_token: token,
  });
  if (error || !data) return null;

  const r = data as Record<string, unknown>;
  if (r.ok !== true) return null;

  const survey = (r.survey ?? {}) as Record<string, unknown>;
  const campaign = (r.campaign ?? {}) as Record<string, unknown>;
  const version = (r.version ?? {}) as Record<string, unknown>;

  return {
    organizationName: (r.organization_name as string | null) ?? "Empresa",
    surveyName: (survey.name as string | null) ?? "Encuesta",
    surveyPurpose: (survey.purpose as string | null) ?? null,
    campaignName: (campaign.name as string | null) ?? "",
    periodLabel: (campaign.period_label as string | null) ?? null,
    anonymityMode: (campaign.anonymity_mode as AnonymityMode) ?? "identified",
    versionNumber: Number(version.version_number ?? 1),
    introText: (version.intro_text as string | null) ?? null,
    closingText: (version.closing_text as string | null) ?? null,
    questions: ((r.questions as PublicQuestion[] | null) ?? []),
  };
}

export type PublicAnswerInput = {
  question_id: string;
  outcome: "answered" | "not_applicable" | "skipped";
  value_numeric?: number | null;
  value_text?: string | null;
  value_choices?: string[] | null;
};

export type SubmitOutcome =
  | { ok: true; answers: number; closingText: string | null }
  | { ok: false; reason: string };

/**
 * §68 · Envía la respuesta. El token se consume dentro de la RPC con un
 * `update` condicional, así que dos envíos simultáneos con el mismo enlace no
 * pueden ganar los dos: el segundo no encuentra ninguna invitación pendiente.
 *
 * §27 · El tamaño se acota antes de salir: no es un anti-bot de empresa, es no
 * dejar la puerta obviamente abierta.
 */
export async function submitPublicSurvey(
  token: string,
  answers: PublicAnswerInput[]
): Promise<SubmitOutcome> {
  if (answers.length > 200) {
    return { ok: false, reason: "Esa respuesta tiene demasiados campos." };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("quality_submit_survey_response", {
    p_token: token,
    p_answers: answers,
  });

  if (error) {
    // El mensaje de la base ya está escrito para una persona cuando dice qué
    // falta. Si dice `not_available`, se traduce: quien prueba tokens no
    // merece saber cuál de las razones acertó.
    const raw = error.message ?? "";
    if (raw.includes("not_available") || raw.length === 0) {
      return { ok: false, reason: "Este enlace ya no está disponible." };
    }
    return { ok: false, reason: raw };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    return { ok: false, reason: "Este enlace ya no está disponible." };
  }
  return {
    ok: true,
    answers: Number(r.answers ?? 0),
    closingText: (r.closing_text as string | null) ?? null,
  };
}
