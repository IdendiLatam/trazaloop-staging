/**
 * Trazaloop · PT-02B · Dominio PURO de los movimientos de producto terminado.
 *
 * Cuatro clases de movimiento y ni una más de las que hacen falta para
 * responder «cuánto de este lote sigue físicamente disponible». Esto no es un
 * ERP de ventas: no hay pedidos, ni clientes, ni facturas, ni almacenes.
 */

export const MOVEMENT_KINDS = ["dispatch", "internal_use", "loss", "adjustment"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const MOVEMENT_KIND_LABEL: Record<MovementKind, string> = {
  dispatch: "Despacho / entrega",
  internal_use: "Uso interno",
  loss: "Merma o descarte",
  adjustment: "Ajuste por recuento",
};

export const MOVEMENT_KIND_HELP: Record<MovementKind, string> = {
  dispatch: "Salió de la empresa: entrega, despacho o venta.",
  internal_use: "Se usó dentro para algo que no es reproceso de producción.",
  loss: "Se perdió: merma, daño o descarte. Exige motivo.",
  adjustment: "Corrige el saldo tras un recuento físico. Exige motivo y sentido.",
};

/** Solo un ajuste puede SUMAR. Un despacho que entra sería un despacho al revés. */
export function kindAllowsIncoming(kind: string): boolean {
  return kind === "adjustment";
}

/** Perder o ajustar exige explicarse; despachar no: el hecho se explica solo. */
export function reasonIsRequired(kind: string): boolean {
  return kind === "loss" || kind === "adjustment";
}

export function isMovementKind(v: string | null | undefined): v is MovementKind {
  return !!v && (MOVEMENT_KINDS as readonly string[]).includes(v);
}

export const MOVEMENT_KIND_OPTIONS: ReadonlyArray<{ value: MovementKind; label: string }> =
  MOVEMENT_KINDS.map((value) => ({ value, label: MOVEMENT_KIND_LABEL[value] }));

/**
 * El saldo, calculado igual que en la base.
 *
 * Existe para que la pantalla pueda anticipar el resultado y para que las
 * pruebas comprueben la fórmula sin base. La barrera es el disparador, no
 * esto.
 */
export function availableKg(input: {
  producedKg: number;
  reprocessedKg: number;
  dispatchedKg: number;
  lostKg: number;
  internalUseKg: number;
  adjustmentKg: number;
}): number {
  const v =
    input.producedKg - input.reprocessedKg - input.dispatchedKg -
    input.lostKg - input.internalUseKg + input.adjustmentKg;
  return Number(v.toFixed(4));
}

/**
 * Cómo se dice el saldo de un lote.
 *
 * La distinción que esta función existe para no perder: «quedan 100 kg» y
 * «nadie ha registrado ninguna salida» no son lo mismo, aunque el número
 * coincida. Presentar el segundo como el primero es exactamente lo que hacía
 * la pantalla anterior con un lote vendido entero.
 */
export function stockStatement(availableKgValue: number, movementsCount: number): string {
  const n = Number(availableKgValue.toFixed(4));
  if (movementsCount === 0) {
    return `Sin salidas registradas — quedan ${n} kg según lo producido`;
  }
  return n > 0 ? `Disponible: ${n} kg` : "Agotado";
}

export const MOVEMENT_DELETE_MESSAGE =
  "Un movimiento registrado no se elimina: forma parte del historial del lote. Registra una corrección, que conserva el original.";
export const MOVEMENT_REASON_REQUIRED =
  "Una merma o un ajuste tienen que decir por qué.";
export const MOVEMENT_CORRECTION_REASON_REQUIRED =
  "Una corrección sin motivo no explica nada.";
