/**
 * Trazaloop · PT-02B / PT-02B.1 · Dominio PURO de los movimientos del lote.
 *
 * Cuatro clases de movimiento y ni una más de las que hacen falta para
 * responder «cuánto de este lote sigue físicamente disponible». Esto no es un
 * ERP de ventas: no hay pedidos, ni clientes, ni facturas, ni almacenes.
 *
 *
 * LO QUE CAMBIÓ EN PT-02B.1, Y POR QUÉ
 *
 * El sentido dejó de preguntarse. Despachar, usar internamente y perder RESTAN
 * siempre —lo dice el CHECK `output_batch_movements_direction_kind` desde
 * 0146—, así que ofrecer un selector de «suma o resta» era pedirle a la
 * persona un dato que el dominio ya conoce. Se deriva.
 *
 * Y el ajuste dejó de pedir la diferencia. Pedía «cuánto ajustar», lo que
 * obligaba a restar de cabeza el saldo teórico —con decimales— y tiraba el
 * dato medido. Ahora se pide LO QUE SE CONTÓ, y la diferencia se calcula.
 */

export const MOVEMENT_KINDS = ["dispatch", "internal_use", "loss", "adjustment"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const MOVEMENT_KIND_LABEL: Record<MovementKind, string> = {
  dispatch: "Despacho / entrega",
  internal_use: "Uso interno",
  loss: "Merma / descarte",
  adjustment: "Ajuste por recuento físico",
};

export const MOVEMENT_KIND_HELP: Record<MovementKind, string> = {
  dispatch: "Salió de la empresa: entrega, despacho o venta.",
  internal_use: "Se usó dentro para algo que no es reproceso de producción.",
  loss: "Se perdió: merma, daño o descarte. Exige motivo.",
  adjustment:
    "Se contó físicamente el lote. Escribe lo que encontraste: la diferencia con el saldo se calcula sola.",
};

/**
 * El sentido de un movimiento, DERIVADO.
 *
 * Los tres primeros restan siempre. El ajuste depende del recuento: si se
 * encontró más de lo que decía el sistema, suma; si menos, resta. En ningún
 * caso lo elige la persona.
 */
export function directionFor(kind: MovementKind, delta?: number): "in" | "out" {
  if (kind !== "adjustment") return "out";
  return (delta ?? 0) >= 0 ? "in" : "out";
}

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

// ===========================================================================
// EL SALDO
// ===========================================================================

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
 * Cuánto puede haber COMO MUCHO en la estantería de este lote.
 *
 * Es el saldo SIN los ajustes: lo producido menos lo que se fue por un camino
 * demostrable —reproceso, despacho, merma, uso interno—. Un recuento por
 * encima de esto no es material que aparece: es una fuente de verdad mal
 * registrada, y taparla con un ajuste sería peor que dejarla.
 *
 * Espejo exacto de `output_batch_physical_max_kg` en la base.
 */
export function physicalMaxKg(input: {
  producedKg: number;
  reprocessedKg: number;
  dispatchedKg: number;
  lostKg: number;
  internalUseKg: number;
}): number {
  const v =
    input.producedKg - input.reprocessedKg - input.dispatchedKg -
    input.lostKg - input.internalUseKg;
  return Number(v.toFixed(4));
}

// ===========================================================================
// EL RECUENTO
// ===========================================================================

export type CountOutcome =
  | { ok: true; delta: number; direction: "in" | "out"; quantity: number }
  | { ok: false; error: string };

/**
 * Qué sale de contar físicamente un lote.
 *
 * El usuario aporta UN número —lo que encontró— y de ahí sale todo lo demás.
 * Tres respuestas posibles, y las tres importan:
 *
 *   · cuadra          no hay nada que ajustar, y decirlo es mejor que
 *                     registrar un movimiento de cero que no mueve nada;
 *   · imposible       el conteo supera el techo físico: hay un hecho anterior
 *                     mal registrado y el ajuste no es la herramienta;
 *   · ajuste          la diferencia, con su sentido derivado.
 */
export function resolveCount(input: {
  counted: number;
  theoretical: number;
  physicalMax: number;
}): CountOutcome {
  if (!Number.isFinite(input.counted) || input.counted < 0) {
    return { ok: false, error: "La cantidad contada debe ser un número mayor o igual que cero." };
  }
  if (input.counted > input.physicalMax) {
    return { ok: false, error: countExceedsPhysicalMax(input.physicalMax) };
  }
  const delta = Number((input.counted - input.theoretical).toFixed(4));
  if (delta === 0) {
    return {
      ok: false,
      error: "El conteo coincide con el saldo del sistema: no hay nada que ajustar.",
    };
  }
  return { ok: true, delta, direction: delta > 0 ? "in" : "out", quantity: Math.abs(delta) };
}

export function countExceedsPhysicalMax(physicalMax: number): string {
  return (
    `El conteo supera la cantidad físicamente posible para este lote: ${Number(physicalMax.toFixed(4))} kg. ` +
    "Corrige primero la cantidad producida o el movimiento que corresponda."
  );
}

/** Cómo se lee una diferencia de recuento antes de confirmarla. */
export function describeDelta(delta: number): string {
  const n = Number(delta.toFixed(4));
  if (n === 0) return "Sin diferencia";
  return n > 0 ? `Sobran ${n} kg respecto al sistema` : `Faltan ${Math.abs(n)} kg respecto al sistema`;
}

// ===========================================================================
// CÓMO SE DICE EL SALDO
// ===========================================================================

/**
 * Cómo se dice el saldo de un lote.
 *
 * Tres estados, no dos. «Quedan 100 kg» y «nadie ha registrado ninguna salida»
 * no son lo mismo aunque el número coincida — presentar el segundo como el
 * primero es lo que hacía la pantalla anterior con un lote vendido entero.
 *
 * Y un saldo NEGATIVO no es «agotado»: es una anomalía. Después de PT-02B.1 no
 * debería poder nacer de ninguna operación válida, así que si aparece hay que
 * verlo, no redondearlo a la etiqueta más cómoda.
 */
export function stockStatement(availableKgValue: number, movementsCount: number): string {
  const n = Number(availableKgValue.toFixed(4));
  if (n < 0) return `Saldo inconsistente: ${n} kg`;
  if (movementsCount === 0) {
    return `Sin movimientos registrados — quedan ${n} kg según lo producido`;
  }
  return n > 0 ? `Disponible: ${n} kg` : "Agotado";
}

export const MOVEMENT_DELETE_MESSAGE =
  "Un movimiento registrado no se elimina: forma parte del historial del lote. Registra una corrección, que conserva el original.";
export const MOVEMENT_REASON_REQUIRED =
  "Una merma o un ajuste tienen que decir por qué.";
export const MOVEMENT_CORRECTION_REASON_REQUIRED =
  "Una corrección sin motivo no explica nada.";
export const MOVEMENT_ANNUL_NOTE =
  "El movimiento original se conservará en el historial del lote.";
export const STOCK_INCONSISTENT_NOTE =
  "El saldo de este lote es negativo, y eso no debería poder ocurrir. Revisa los movimientos y la cantidad producida.";
