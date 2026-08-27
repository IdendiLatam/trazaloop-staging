/**
 * Trazaloop · QUALITY-12.1 · Cómo se lee del formulario lo que decide el alcance.
 *
 * POR QUÉ ESTO VIVE APARTE
 *
 * La segunda prueba humana encontró que el servidor llevaba desde QUALITY-12
 * leyendo `temporal_mode`, `as_of`, `period_start` y `period_end`, y que la
 * pantalla NO PINTABA NINGUNO DE LOS CUATRO. Todas las consultas llegaban como
 * «ahora» sin que nadie lo hubiera pedido, y una pregunta histórica se
 * respondía con el documento de hoy.
 *
 * Ninguna prueba lo vio porque todas montaban el alcance a mano y llamaban al
 * constructor de contexto. La costura que faltaba es ésta: la traducción de un
 * formulario a los parámetros de una consulta.
 *
 * Está en el dominio y no en la acción de servidor por una razón práctica: la
 * acción arrastra medio Next.js consigo y no se puede cargar en una prueba.
 * Aquí no hay ni una importación: se prueba con un `FormData` igual al que
 * envía el navegador, y los nombres de los campos quedan fijados en un sitio.
 */

import { USE_CASES } from "./quality-ai";

/** Los nombres de los campos, en un único lugar. La pantalla los pinta y el
 *  servidor los lee: si divergen, vuelve el defecto. */
export const AI_FORM_FIELDS = {
  useCase: "use_case",
  temporalMode: "temporal_mode",
  asOf: "as_of",
  periodStart: "period_start",
  periodEnd: "period_end",
  question: "question",
} as const;

export type AiTemporalInput = {
  mode: "current" | "as_of" | "period";
  asOf?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
};

function texto(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}
function opcional(form: FormData, name: string): string | null {
  const v = texto(form, name);
  return v.length > 0 ? v : null;
}

/**
 * §29 · El caso de uso NO lo escribe nadie: se elige de una lista cerrada,
 * porque de él dependen la política, las instrucciones y qué fuentes se
 * consultan. Cualquier cosa que no esté en la lista cae en la pregunta abierta.
 */
export function readUseCase(form: FormData): string {
  const v = texto(form, AI_FORM_FIELDS.useCase);
  return (USE_CASES as readonly string[]).includes(v) ? v : "ask";
}

/**
 * §21/§22 · Sobre qué momento se pregunta.
 *
 * Una fecha que falta NO se inventa: se responde sobre hoy. Inventar un día
 * concreto sería peor que no tener ninguno, porque la respuesta hablaría con
 * seguridad de un pasado que nadie pidió.
 */
export function readTemporal(form: FormData): AiTemporalInput {
  const modo = texto(form, AI_FORM_FIELDS.temporalMode);

  if (modo === "as_of") {
    const fecha = opcional(form, AI_FORM_FIELDS.asOf);
    return fecha ? { mode: "as_of", asOf: fecha } : { mode: "current" };
  }

  if (modo === "period") {
    const inicio = opcional(form, AI_FORM_FIELDS.periodStart);
    const fin = opcional(form, AI_FORM_FIELDS.periodEnd);
    if (!inicio && !fin) return { mode: "current" };
    return { mode: "period", periodStart: inicio, periodEnd: fin };
  }

  return { mode: "current" };
}
