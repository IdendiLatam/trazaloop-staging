/**
 * Trazaloop · PE-05B2W4 · Cómo se escriben el plan, el dinero y las fechas.
 *
 * Vive fuera de las pantallas para que las dos —el estado y la contratación—
 * digan lo mismo. Nada de esto decide nada: solo lo escribe.
 */

/** «full» es una clave; lo que lee una persona es «Full». */
export function planLabel(code: string | null): string {
  if (!code) return "";
  return code.charAt(0).toUpperCase() + code.slice(1);
}

/**
 * El catálogo está en dólares y el cobro en pesos, así que la moneda se dice
 * SIEMPRE con su código. Un «$ 190.400» a secas es ambiguo justo donde peor
 * sienta serlo.
 */
export function money(minorUnits: number, currency: string): string {
  const enteros = currency === "COP";
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency, currencyDisplay: "code",
    maximumFractionDigits: enteros ? 0 : 2,
  }).format(enteros ? minorUnits : minorUnits / 100);
}

/** «4 de octubre de 2026», no «4/10/2026»: nadie duda de cuál es el mes. */
export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO",
    { day: "numeric", month: "long", year: "numeric" });
}

/** La hora sin el punto de la abreviatura pegado al de la frase. */
export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO",
    { hour: "numeric", minute: "2-digit" });
}

/**
 * Espacio, en la unidad que una persona usa para hablar de archivos.
 *
 * Se cuenta en potencias de 1024 —que es como lo cuenta el límite del plan— y
 * se dice «MB» y «GB», que es como lo dice todo el mundo. Decir «MiB» sería
 * más exacto y menos legible, y aquí importa que se entienda.
 */
export function storageSize(bytes: number): string {
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  if (bytes >= GB) {
    const v = bytes / GB;
    return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)} GB`;
  }
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}
