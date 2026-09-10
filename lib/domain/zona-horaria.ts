/**
 * Trazaloop · STABILIZATION-01 · Una fecha elegida a mano es un DÍA, no un
 * instante.
 *
 * EL DEFECTO
 *
 * El formulario de transición comercial usa `<input type="date">`, que entrega
 * `AAAA-MM-DD`. Ese texto se pasaba por `new Date(...)`, y el estándar manda
 * interpretarlo como **medianoche UTC**. Dos consecuencias, las dos malas:
 *
 *   · elegir HOY produce un instante ya pasado, y la base lo rechaza con
 *     `ASSIGNMENT_PERIOD_INVALID` —que además llegaba a la pantalla como un
 *     «no fue posible» sin explicación—;
 *   · elegir «15 de septiembre» en Colombia (UTC−5) programa el final para las
 *     19:00 del 14, hora local. La empresa pierde un día sin que nadie lo pida.
 *
 * LA INTENCIÓN DE NEGOCIO
 *
 * Quien elige una fecha en esa casilla quiere decir «hasta el final de ese
 * día», en la zona de la empresa. Eso es lo que se calcula aquí.
 *
 * Sin dependencias: `Intl` ya sabe el desfase de cualquier zona en cualquier
 * instante, incluidos los cambios de horario. Se resuelve en dos pasadas porque
 * el desfase depende del instante y el instante depende del desfase; la segunda
 * pasada corrige el salto cuando la fecha cae justo en un cambio de hora.
 */

/** Minutos que la zona va por delante de UTC en ese instante. */
function desfaseMinutos(zona: string, instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instante);
  const p: Record<string, string> = {};
  for (const x of partes) p[x.type] = x.value;
  // `hour` puede venir como "24" a medianoche en algunas plataformas.
  const hora = Number(p.hour) % 24;
  const comoUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    hora, Number(p.minute), Number(p.second));
  // Se compara al SEGUNDO: las partes que da `Intl` no traen milisegundos, y
  // restarlas contra un instante que sí los tiene metía esos milisegundos
  // dentro del desfase. Se notaba: el fin del día salía a las 05:00:00.997 en
  // vez de a las 04:59:59.999.
  const instanteEnSegundos = Math.floor(instante.getTime() / 1000) * 1000;
  return (comoUtc - instanteEnSegundos) / 60_000;
}

/** ¿Es un `AAAA-MM-DD` con partes válidas? */
export function esFechaSimple(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const prueba = new Date(Date.UTC(a, m - 1, d));
  return prueba.getUTCFullYear() === a
    && prueba.getUTCMonth() === m - 1
    && prueba.getUTCDate() === d;
}

/**
 * El último instante de ese día en esa zona, en ISO.
 * `2026-09-15` + `America/Bogota` → `2026-09-16T04:59:59.999Z`, que es
 * 23:59:59.999 del 15 en Bogotá.
 */
export function finDelDiaEnZona(fecha: string, zona: string): string | null {
  if (!esFechaSimple(fecha)) return null;
  const [a, m, d] = fecha.split("-").map(Number);
  const paredUtc = Date.UTC(a, m - 1, d, 23, 59, 59, 999);

  let instante = new Date(paredUtc);
  for (let vuelta = 0; vuelta < 2; vuelta += 1) {
    const desfase = desfaseMinutos(zona, instante);
    const candidato = new Date(paredUtc - desfase * 60_000);
    if (candidato.getTime() === instante.getTime()) break;
    instante = candidato;
  }
  return Number.isNaN(instante.getTime()) ? null : instante.toISOString();
}
