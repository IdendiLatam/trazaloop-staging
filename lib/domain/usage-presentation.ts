/**
 * Trazaloop · COMMERCIAL-UX-01F · Cómo se enseña lo que una empresa consume.
 *
 *
 * LA DISTINCIÓN QUE ESTE MÓDULO EXISTE PARA SOSTENER
 *
 * «Ilimitado» y «cero» se parecen mucho en una estructura de datos y no se
 * parecen en nada para quien mira. Un plan sin reloj devuelve `metered:false`
 * con los límites en `null`, y pintarlo sin pensar da cosas como «0 / ∞», «0
 * min» o una barra vacía — que le dice a alguien que paga que no tiene nada,
 * justo cuando lo que tiene es todo.
 *
 * Por eso lo que sale de aquí es un MODO, no un número. Quien pinta recibe
 * «ilimitado» o «medido con estas cifras», y no tiene que decidir qué
 * significa la ausencia. Decidir eso es política, y la política no vive en un
 * componente.
 *
 *
 * Y LO QUE NO SE PUEDE LEER NO SE INVENTA
 *
 * Si una lectura falla, el modo es `desconocido` y la sección no se pinta. Un
 * contador que dice «0 de 500 MB» porque no pudo leer el consumo es peor que
 * no enseñar nada: parece un dato y es una avería.
 *
 * Lógica PURA: sin React, sin base de datos, sin sesión.
 */
import { formatStorage, formatAiCredits } from "@/lib/plans/commercial-presentation";

/** Un consumo con tope, listo para una barra. */
export type MeteredUsage = {
  mode: "metered";
  used: number;
  limit: number;
  /** 0–100, acotado: por encima del cupo no se pinta una barra de 340 %. */
  percent: number;
  /** Ya escrito: «120 MB de 500 MB». */
  label: string;
  /** ¿Se pasó del cupo? Cambia el tono, no el número. */
  overLimit: boolean;
};

export type UsagePresentation =
  | MeteredUsage
  | { mode: "unlimited"; label: string }
  | { mode: "unknown" };

/** El porcentaje que se pinta. Acotado arriba para que la barra tenga sentido. */
function porcentaje(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

/**
 * Almacenamiento.
 *
 * `limit === null` con un uso conocido significa sin tope, no «cero».
 */
export function presentStorage(
  usedBytes: number | null, limitBytes: number | null
): UsagePresentation {
  if (usedBytes === null) return { mode: "unknown" };
  if (limitBytes === null) {
    const u = formatStorage(usedBytes);
    return { mode: "unlimited", label: u === null ? "Sin límite" : `${u} · sin límite` };
  }
  const usado = formatStorage(usedBytes);
  const tope = formatStorage(limitBytes);
  if (usado === null || tope === null) return { mode: "unknown" };
  return {
    mode: "metered",
    used: usedBytes, limit: limitBytes,
    percent: porcentaje(usedBytes, limitBytes),
    label: `${usado} de ${tope}`,
    overLimit: usedBytes > limitBytes,
  };
}

/**
 * Créditos de Intelligence.
 *
 * La bolsa MENSUAL y la de la PRUEBA son dos cosas distintas y no se suman
 * aquí: el motor ya las cuenta por separado y confundirlas fue exactamente el
 * defecto que corrigió 0170. Se presentan por separado, con `presentTrialAi`.
 */
export function presentAiCredits(
  used: number | null, limit: number | null,
  limitState: "finite" | "unlimited" | "not_configured" | null
): UsagePresentation {
  if (limitState === "unlimited") {
    return { mode: "unlimited", label: "Sin límite mensual" };
  }
  if (used === null || limit === null || limitState !== "finite") {
    return { mode: "unknown" };
  }
  const restante = Math.max(0, limit - used);
  return {
    mode: "metered",
    used, limit,
    percent: porcentaje(used, limit),
    label: `${used.toLocaleString("es-CO")} de ${formatAiCredits(limit) ?? limit}`
      + ` · quedan ${restante.toLocaleString("es-CO")}`,
    overLimit: used > limit,
  };
}

/** La bolsa de la prueba, aparte y dicha como lo que es. */
export function presentTrialAi(
  total: number | null, used: number | null
): UsagePresentation {
  if (total === null || used === null) return { mode: "unknown" };
  return {
    mode: "metered",
    used, limit: total,
    percent: porcentaje(used, total),
    label: `${used.toLocaleString("es-CO")} de ${total.toLocaleString("es-CO")}`
      + " créditos de la prueba",
    overLimit: used > total,
  };
}

/**
 * Tiempo de uso.
 *
 * Aquí está la trampa concreta: `metered:false` significa que el plan NO tiene
 * reloj, y sus límites vienen en `null`. Pintarlo como un contador daría «0
 * min» a quien tiene uso ilimitado.
 *
 * Dentro de una prueba se dice además que es durante la prueba: quien la está
 * usando necesita saber que ese «ilimitado» tiene fecha.
 */
export function presentTime(input: {
  metered: boolean;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  dailyUsed: number | null;
  monthlyUsed: number | null;
  isTrial: boolean;
} | null): UsagePresentation {
  if (input === null) return { mode: "unknown" };
  if (!input.metered) {
    return { mode: "unlimited",
             label: input.isTrial ? "Uso ilimitado durante la prueba" : "Uso ilimitado" };
  }
  // Medido: manda el tope que antes se agota, que casi siempre es el diario.
  const partes: string[] = [];
  if (input.dailyLimit !== null && input.dailyUsed !== null) {
    partes.push(`${input.dailyUsed} de ${input.dailyLimit} min hoy`);
  }
  if (input.monthlyLimit !== null && input.monthlyUsed !== null) {
    partes.push(`${input.monthlyUsed} de ${input.monthlyLimit} min este mes`);
  }
  if (partes.length === 0) return { mode: "unknown" };

  const usa = input.dailyLimit !== null && input.dailyUsed !== null;
  const used = usa ? input.dailyUsed! : input.monthlyUsed!;
  const limit = usa ? input.dailyLimit! : input.monthlyLimit!;
  return {
    mode: "metered",
    used, limit,
    percent: porcentaje(used, limit),
    label: partes.join(" · "),
    overLimit: used >= limit,
  };
}
