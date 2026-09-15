"use server";

import { cookies } from "next/headers";
import { INTAKE_COOKIE } from "@/lib/domain/public-intake-cookies";
import {
  savePublicSection, finalizePublicSubmission,
} from "@/lib/db/public-diagnostic-assessment";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01F · Guardar y cerrar, desde el público.
 *
 *
 * EL TESTIGO NO VIAJA EN LOS ARGUMENTOS
 *
 * Ninguna de estas dos acciones recibe el testigo, ni el identificador de la
 * participación, ni la campaña. Todo sale de la cookie HttpOnly, que el
 * navegador no puede leer ni fabricar desde JavaScript. Aceptar un
 * identificador como argumento habría convertido un dato opaco en una
 * credencial: bastaría con probar uuids.
 *
 *
 * Y EL RESULTADO TAMPOCO
 *
 * `completePublicDiagnosticAction` no admite argumento alguno — mírese la
 * firma. No hay dónde meter un porcentaje, un nivel ni un número de brechas.
 * El resultado se calcula en servidor a partir de las respuestas GUARDADAS y
 * se escribe con una primitiva que `anon` no puede ejecutar.
 */

export type SaveState = {
  error: string | null;
  answered: number | null;
  total: number | null;
};

export type CompleteState = {
  error: string | null;
  /** A dónde ir cuando se ha cerrado. `null` si no se cerró. */
  slug: string | null;
};

const SIN_TESTIGO =
  "Tu diagnóstico ya no está disponible en este navegador. Vuelve a entrar "
  + "desde el enlace de la convocatoria.";

const MOTIVO: Record<string, string> = {
  completed: "Este diagnóstico ya está cerrado y no admite cambios.",
  abandoned: "Este diagnóstico ya no está activo.",
  window: "La campaña finalizó y ya no admite respuestas.",
  campaign: "La campaña finalizó y ya no admite respuestas.",
  expired: "El plazo para continuar este diagnóstico terminó.",
  not_found: SIN_TESTIGO,
};

async function testigo(): Promise<string | null> {
  const galletas = await cookies();
  return galletas.get(INTAKE_COOKIE)?.value ?? null;
}

export async function savePublicSectionAction(
  sectionCode: string,
  answers: { questionId: string; answer: boolean; observations: string | null }[]
): Promise<SaveState> {
  const t = await testigo();
  if (!t) return { error: SIN_TESTIGO, answered: null, total: null };

  const r = await savePublicSection(t, sectionCode, answers);
  switch (r.status) {
    case "saved":
      return { error: null, answered: r.answered, total: r.total };
    case "locked":
      return {
        error: MOTIVO[r.reason] ?? "Este diagnóstico ya no admite cambios.",
        answered: null, total: null,
      };
    case "not_found":
      return { error: SIN_TESTIGO, answered: null, total: null };
    case "rate_limited":
      return {
        error: "Estás guardando muy seguido. Espera un momento y vuelve a intentarlo.",
        answered: null, total: null,
      };
    default:
      return {
        error: "No fue posible guardar tus respuestas. Vuelve a intentarlo.",
        answered: null, total: null,
      };
  }
}

export async function completePublicDiagnosticAction(): Promise<CompleteState> {
  const t = await testigo();
  if (!t) return { error: SIN_TESTIGO, slug: null };

  const r = await finalizePublicSubmission(t);
  switch (r.status) {
    // Cerrar dos veces no duplica ni cambia nada: la segunda llamada llega al
    // mismo sitio que la primera.
    case "completed":
    case "already_completed":
      return { error: null, slug: r.slug };
    case "incomplete":
      return {
        error: `Te faltan ${r.total - r.answered} pregunta(s) por responder.`,
        slug: null,
      };
    case "locked":
      return {
        error: MOTIVO[r.reason] ?? "Este diagnóstico ya no admite cambios.",
        slug: null,
      };
    case "not_found":
      return { error: SIN_TESTIGO, slug: null };
    case "rate_limited":
      return {
        error: "Demasiados intentos seguidos. Espera un momento.",
        slug: null,
      };
    default:
      return {
        error: "No fue posible cerrar tu diagnóstico. Vuelve a intentarlo.",
        slug: null,
      };
  }
}
