/**
 * Trazaloop · PE-04B4 · Cómo se cuenta el uso a quien lo paga.
 *
 * Funciones puras: la misma aritmética y las mismas palabras para el cliente y
 * para la consola de plataforma. Si cada pantalla hiciera su cuenta, acabarían
 * diciendo cosas distintas del mismo mes, que es exactamente el defecto que
 * PE-04B2 tuvo que arreglar con los planes.
 *
 * Lo que NUNCA se le enseña al cliente como métrica: tokens, coste del
 * proveedor y el peso interno de cada operación. Son economía nuestra, no
 * unidades de su plan.
 */

export type UsageBadge = "ok" | "warning" | "exhausted" | "unknown";

/** Cuándo el saldo pasa a merecer un aviso: al 80 % consumido. */
export const USAGE_WARNING_RATIO = 0.8;

export function usageBadge(used: number | null, limit: number | null): UsageBadge {
  if (used === null || limit === null) return "unknown";
  if (limit <= 0) return "unknown";
  if (used >= limit) return "exhausted";
  return used / limit >= USAGE_WARNING_RATIO ? "warning" : "ok";
}

/** «X de Y», o «sin límite» — nunca «0 de 0», que se lee como agotado. */
export function formatAllowance(used: number | null, limit: number | null): string {
  if (limit === null) return "sin límite";
  if (used === null) return `— de ${limit}`;
  return `${used} de ${limit}`;
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "sin límite";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** El primer día del mes siguiente al que se está contando: cuándo vuelve el saldo. */
export function nextResetDate(periodMonth: string | null): string | null {
  if (!periodMonth) return null;
  const d = new Date(`${periodMonth}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export type ConsultationCopy = { title: string; body: string } | null;

/**
 * Lo que se dice en modo consulta. Ni «no tienes permiso» —lo tiene— ni «se
 * acabó tu plan» —lo sigue teniendo—: se agotó el tiempo incluido, y se dice
 * qué SÍ se puede hacer mientras tanto, que es la parte que evita el pánico.
 */
export function consultationCopy(state: string | null): ConsultationCopy {
  if (state === "CONSULTATION_DAILY_LIMIT") {
    return {
      title: "Modo consulta · se agotó el tiempo de hoy",
      body:
        "Tu empresa usó los 30 minutos diarios incluidos en el plan Free. Puedes seguir "
        + "consultando, descargando y borrando tu información; el cupo vuelve mañana.",
    };
  }
  if (state === "CONSULTATION_MONTHLY_LIMIT") {
    return {
      title: "Modo consulta · se agotó el tiempo del mes",
      body:
        "Tu empresa usó los 300 minutos mensuales incluidos en el plan Free. Puedes seguir "
        + "consultando, descargando y borrando tu información; el cupo vuelve el mes que viene.",
    };
  }
  if (state === "ENTITLEMENT_UNAVAILABLE") {
    return {
      title: "No se pudo comprobar tu plan",
      body:
        "No pudimos leer ahora mismo lo que tu empresa tiene contratado. Vuelve a intentarlo "
        + "en un momento; no se ha guardado nada a medias.",
    };
  }
  return null;
}
