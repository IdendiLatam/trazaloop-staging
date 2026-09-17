/**
 * Trazaloop · COMMERCIAL-UX-01C · Cómo se ESCRIBE un plan para quien lo compra.
 *
 *
 * POR QUÉ ESTO EXISTE HABIENDO YA UN `formatLimit`
 *
 * `lib/domain/commercial-catalog.ts` formatea el catálogo para la CONSOLA DE
 * PLATAFORMA: quien la lee decide precios y necesita ver, en grande, que un
 * límite está «Sin configurar», porque eso es una decisión pendiente suya.
 *
 * Aquí la audiencia es otra: alguien que está valorando si contrata. A esa
 * persona no se le enseña un hueco del catálogo interno —no es asunto suyo y no
 * puede hacer nada con esa información—; se omite la fila. Y las unidades se
 * escriben como las escribe la gente: «500 MB», no «500 MiB».
 *
 * Son dos audiencias con reglas distintas, cada una escrita UNA vez. Lo que no
 * puede pasar —y es lo que este módulo evita— es que /planes, la ficha de
 * facturación y el checkout acaben con tres formateadores propios que digan lo
 * mismo de tres maneras.
 *
 *
 * LO QUE ESTO NO ES
 *
 * No es autoridad. Ninguna función de aquí sabe cuánto cuesta un plan ni
 * cuántos minutos incluye: reciben los valores ya leídos de
 * `plan_revisions` y `plan_revision_limits` y solo deciden cómo se escriben.
 * Si algún día apareciera aquí un número de negocio, sería una segunda verdad.
 *
 * Lógica PURA: sin React, sin base de datos, sin sesión.
 */

/** Cómo se limita —o no— el tiempo de uso de un plan. */
export type TimeUsage =
  /** Quien paga no tiene reloj. Es la política cerrada en 01B.2. */
  | { mode: "unlimited" }
  /** Free: el tiempo es lo que separa probar de operar gratis. */
  | { mode: "metered"; dailyMinutes: number | null; monthlyMinutes: number | null }
  /**
   * La autoridad no lo dice. NO es «ilimitado» ni «cero»: es que falta una
   * decisión, y de cara a un cliente eso no se rellena con una suposición.
   */
  | { mode: "undeclared" };

/** El estado de un límite, tal y como lo guarda `plan_revision_limits`. */
export type LimitState = "finite" | "unlimited" | "not_configured";

export const UNLIMITED_USAGE_LABEL = "Uso ilimitado";
export const UNLIMITED_LABEL = "Sin límite";

/**
 * Un precio en unidades menores, escrito como se lee.
 *
 * `null` no es «gratis»: es que no hay precio publicado. Devolver «USD 0»
 * ante un precio ausente sería inventarse una oferta.
 */
export function formatUsdPrice(
  minor: number | null,
  currency: string | null = "USD"
): string | null {
  if (minor === null) return null;
  const unidades = minor / 100;
  const texto = unidades.toLocaleString("es-CO", {
    minimumFractionDigits: Number.isInteger(unidades) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${currency ?? "USD"} ${texto}`;
}

/** «USD 40 al mes». La periodicidad va junto al número, no suelta por la página. */
export function formatMonthlyPrice(
  minor: number | null, currency: string | null = "USD"
): string | null {
  const p = formatUsdPrice(minor, currency);
  return p === null ? null : `${p} al mes`;
}

export function formatAnnualPrice(
  minor: number | null, currency: string | null = "USD"
): string | null {
  const p = formatUsdPrice(minor, currency);
  return p === null ? null : `${p} al año`;
}

/**
 * Bytes, en la unidad que usa quien compra.
 *
 * Se usan múltiplos de 1024 —los mismos con los que el producto mide— pero se
 * escriben MB y GB, que es como se llaman fuera de una consola. Escribir «MiB»
 * en una página de precios es correcto y no lo entiende nadie.
 */
export function formatStorage(bytes: number | null): string | null {
  if (bytes === null) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

/** Créditos de Intelligence al mes. */
export function formatAiCredits(creditos: number | null): string | null {
  if (creditos === null) return null;
  return `${creditos.toLocaleString("es-CO")} créditos al mes`;
}

/**
 * El tiempo de uso, en una frase.
 *
 * Aquí se ve por qué el read model no puede devolver «minutos» a secas: Full y
 * Extra no tienen minutos que enseñar, y un componente que preguntara
 * «¿cuántos?» tendría que decidir él qué hacer con la ausencia. Decidir eso es
 * política, y la política no vive en un componente.
 */
export function formatTimeUsage(uso: TimeUsage): string | null {
  if (uso.mode === "unlimited") return UNLIMITED_USAGE_LABEL;
  if (uso.mode === "undeclared") return null;
  const partes: string[] = [];
  if (uso.dailyMinutes !== null) partes.push(`${uso.dailyMinutes} min/día`);
  if (uso.monthlyMinutes !== null) partes.push(`${uso.monthlyMinutes} min/mes`);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/**
 * Deduce el uso de tiempo a partir de los DOS límites de la autoridad.
 *
 * Es la misma lectura que hace `organization_time_status`: solo cuando los dos
 * son ilimitados no hay reloj. Se replica el criterio, NO el valor — si mañana
 * la autoridad cambia, esto cambia con ella sin tocar una línea.
 */
export function resolveTimeUsage(
  diario: { state: LimitState; value: number | null } | null,
  mensual: { state: LimitState; value: number | null } | null
): TimeUsage {
  if (diario === null || mensual === null) return { mode: "undeclared" };
  if (diario.state === "not_configured" || mensual.state === "not_configured") {
    return { mode: "undeclared" };
  }
  if (diario.state === "unlimited" && mensual.state === "unlimited") {
    return { mode: "unlimited" };
  }
  return {
    mode: "metered",
    dailyMinutes: diario.state === "finite" ? diario.value : null,
    monthlyMinutes: mensual.state === "finite" ? mensual.value : null,
  };
}

/**
 * Un límite cualquiera, para las filas de una tabla comparativa.
 *
 * Devuelve `null` cuando no hay nada honesto que decir, y quien lo llame decide
 * si oculta la fila o la deja vacía. No se inventa un «0» ni un «—».
 */
export function formatLimitForCustomer(
  resourceCode: string, state: LimitState, value: number | null
): string | null {
  if (state === "not_configured") return null;
  if (state === "unlimited") return UNLIMITED_LABEL;
  if (value === null) return null;

  if (resourceCode === "storage_bytes") return formatStorage(value);
  if (resourceCode === "ai_weighted_credits_monthly") return formatAiCredits(value);
  if (resourceCode === "active_minutes_daily") return `${value} min/día`;
  if (resourceCode === "active_minutes_monthly") return `${value} min/mes`;
  // Los `*_enabled` son banderas: 0 significa que no está incluido.
  if (resourceCode.endsWith("_enabled")) return value > 0 ? "Incluido" : "No incluido";
  return value.toLocaleString("es-CO");
}
