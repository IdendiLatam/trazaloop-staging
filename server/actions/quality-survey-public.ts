"use server";

import { submitPublicSurvey, type PublicAnswerInput } from "@/lib/db/quality-survey-public";

/**
 * Trazaloop · QUALITY-08 · La acción del formulario público.
 *
 * NO pasa por `requireQualityForAction` ni por ningún guard de sesión, y es
 * deliberado: quien responde una encuesta de satisfacción no tiene cuenta de
 * Trazaloop. Lo que la sustituye es más estricto que un guard:
 *
 *   · el TOKEN resuelve el contexto — nunca llega una empresa desde el
 *     navegador, y si llegara no se usaría;
 *   · la RPC comprueba estado de campaña, versión publicada, ventana de fechas
 *     y consumo del enlace, todo en el servidor;
 *   · el cliente es ANÓNIMO: no hay privilegios sobre ninguna tabla del
 *     dominio, así que ni siquiera un error de programación podría leer nada.
 */

export type PublicSubmitState = {
  error: string | null;
  success?: boolean;
  closingText?: string | null;
};

export async function submitPublicSurveyAction(
  _prev: PublicSubmitState,
  formData: FormData
): Promise<PublicSubmitState> {
  const token = formData.get("token");
  const payload = formData.get("answers");
  if (typeof token !== "string" || token.length < 32) {
    return { error: "Este enlace no está disponible." };
  }
  if (typeof payload !== "string" || payload.length === 0) {
    return { error: "No se recibió ninguna respuesta." };
  }
  // §27 · El tamaño se acota aquí y otra vez en la base. Dos puertas para el
  // mismo abuso, porque la de fuera es la que se puede olvidar.
  if (payload.length > 200_000) {
    return { error: "La respuesta es demasiado larga." };
  }

  let answers: PublicAnswerInput[];
  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) throw new Error("forma inesperada");
    answers = parsed as PublicAnswerInput[];
  } catch {
    return { error: "No se pudo leer la respuesta." };
  }

  const outcome = await submitPublicSurvey(token, answers);
  if (!outcome.ok) return { error: outcome.reason };
  return { error: null, success: true, closingText: outcome.closingText };
}
