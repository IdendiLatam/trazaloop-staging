/**
 * PCR-02.5 · Dominio PURO del inventario operativo.
 *
 * El inventario NO es una tabla: se deriva siempre de los movimientos reales
 * (0105: vistas v_input_batch_inventory / v_output_batch_inventory /
 * v_material_inventory con security_invoker, sobre la RLS de las tablas
 * base). Estas funciones concentran las reglas presentacionales y de
 * dominio para que UI y tests trabajen sobre una única fuente.
 *
 * Estados (§18 del brief): sin umbral «Bajo» inventado — solo existen
 * «Disponible» y «Agotado», derivados del saldo.
 */

/** Saldo externo: recibido − consumido (nunca se materializa en tablas). */
export function availableKg(receivedKg: number, consumedKg: number): number {
  return Number((receivedKg - consumedKg).toFixed(4));
}

/** Máximo permitido al EDITAR un consumo existente (§12): la masa de la
 *  propia fila se reutiliza — el tope es recibido − consumo de OTRAS filas,
 *  jamás recibido − otras − propia. */
export function maxAllowedForEdit(receivedKg: number, othersConsumedKg: number): number {
  return Number((receivedKg - othersConsumedKg).toFixed(4));
}

export type InventoryState = "available" | "exhausted";

export function inventoryState(availableKgValue: number): InventoryState {
  return availableKgValue > 0 ? "available" : "exhausted";
}

export const INVENTORY_STATE_LABEL: Record<InventoryState, string> = {
  available: "Disponible",
  exhausted: "Agotado",
};

/** kg legibles: sin ceros de relleno (30 → «30 kg», 12.5 → «12.5 kg»),
 *  espejo del trim_scale usado por los mensajes de la BD (0105). */
export function formatKg(value: number): string {
  const n = Number(value.toFixed(4));
  return `${n} kg`;
}

/** Etiqueta de opción de selector con saldo informativo (§10/§17): los
 *  agotados no se ofrecen para NUEVO consumo; los disponibles muestran su
 *  saldo para que el usuario conozca el tope antes de escribir la masa. */
export function selectorLabelWithBalance(baseLabel: string, availableKgValue: number): string {
  return `${baseLabel} · Disponible: ${formatKg(availableKgValue)}`;
}

/** PCR-02.5.1 (hallazgo 2) · Paginación PURA del inventario: pageSize fijo
 *  y acotado (20) — parámetros propios (`inv_q`, `inv_page`, `inv_lot_page`)
 *  que no colisionan con la paginación principal de la lista de lotes. */
export const INVENTORY_PAGE_SIZE = 20;

export type InventoryPage<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** Normaliza el número de página de la URL: >= 1, entero, tolerante a basura. */
export function normalizeInventoryPage(raw: string | undefined): number {
  const n = Number(raw ?? "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
