/**
 * Trazaloop · MP-SBX-02B · La identidad compartida del tipo de cambio de QA.
 *
 *
 * POR QUÉ EXISTE ESTE FICHERO
 *
 * Había DOS convenciones para la misma cosa, nacidas con dos años de distancia
 * y sin conocerse:
 *
 *   · `prepare`, de PE-05B2, sembraba su propia tasa y solo se la saltaba si ya
 *     había una vigente cuya nota contuviera `QA-SYNTHETIC-NOT-FOR-PRODUCTION`;
 *   · `tasaCanonicaQA`, de TEST-HYGIENE-03, abre UNA tasa permanente —nota
 *     «QA CANÓNICA…»— y da por hecho que es la única vigente, porque 0182 no
 *     deja que dos del mismo par rijan a la vez y esa fue justamente la lección.
 *
 * En Local nunca chocaron: `prepare` no lo ejecuta ninguna suite. En Staging sí,
 * en cuanto las suites convertidas dejaron allí la canónica: `prepare` no la
 * reconoció, intentó abrir la suya y 0182 lo paró con `FX_RATE_OVERLAPS`. La
 * regla hizo bien su trabajo; lo que estaba mal era tener dos convenciones.
 *
 * Aquí vive UNA sola, y la usan las dos partes. No es lógica comercial: es
 * identidad de fixture. Nada de esto decide un precio —eso lo hace
 * `billing_resolve_fx`, que no mira la nota— y por eso el criterio tiene que
 * ser conservador hasta la paranoia: ante la duda, no se adopta nada.
 */

/** La nota EXACTA de la tasa canónica. Sin sello ni azar: se reutiliza. */
export const QA_FX_CANONICAL_NOTE = "QA CANÓNICA · tasa sintética local, NO comercial";

/** Marca heredada de PE-05B2. Sigue valiendo: aquellas filas son de QA. */
export const QA_FX_LEGACY_MARKER = "QA-SYNTHETIC-NOT-FOR-PRODUCTION";

/** 1 USD = 4 000 COP. No es una tasa real ni actual. */
export const QA_FX_MICROS = 4_000_000_000;
export const QA_FX_BASE = "USD";
export const QA_FX_QUOTE = "COP";

/**
 * ¿Esta nota identifica un fixture de QA?
 *
 * Deliberadamente NO se acepta cualquier cosa que diga «QA» ni «test»: solo las
 * dos marcas que este proyecto emite. Una tasa comercial no lleva ninguna, y
 * confundirla con un fixture sería adoptar como sintético un precio real.
 */
export function isQaSyntheticFxNote(note: string | null | undefined): boolean {
  if (typeof note !== "string") return false;
  return note === QA_FX_CANONICAL_NOTE || note.includes(QA_FX_LEGACY_MARKER);
}

/** Lo que hace falta saber de una tasa para decidir. Nada más. */
export type QaFxRow = {
  id: string;
  note: string | null;
  status: string | null;
  effective_to: string | null;
  rate_micros: number | string | null;
};

export type QaFxDecision =
  /** Ya hay una tasa de QA válida: se reutiliza y NO se crea nada. */
  | { kind: "reuse"; id: string }
  /** No hay ninguna: se siembra la sintética, sujeta a 0182 como siempre. */
  | { kind: "seed" }
  /** Algo no cuadra. No se adopta, no se crea, no se toca: se para. */
  | { kind: "abort"; reason: string };

/**
 * Decide qué hacer con el tipo de cambio antes de presupuestar.
 *
 * Recibe las tasas del par que YA están vigentes —activas y sin fin— y no
 * escribe nada: es una función pura para poder probarla de verdad, caso por
 * caso, sin base de datos ni proveedor.
 *
 * FALLA CERRADO en los tres casos en los que adivinar sería peligroso:
 * una tasa comercial vigente, dos candidatas sintéticas a la vez, o una
 * sintética con una economía distinta de la que el arnés necesita.
 */
export function decideQaFxFixture(
  vigentes: QaFxRow[], esperadoMicros: number = QA_FX_MICROS
): QaFxDecision {
  const abiertas = vigentes.filter((t) => t.status === "active" && !t.effective_to);
  const sinteticas = abiertas.filter((t) => isQaSyntheticFxNote(t.note));
  const ajenas = abiertas.filter((t) => !isQaSyntheticFxNote(t.note));

  // Una tasa que no es nuestra rige de verdad: ni se adopta ni se le abre una
  // competidora encima. Que decida una persona.
  if (ajenas.length > 0) {
    return { kind: "abort", reason: "FX_COMMERCIAL_RATE_PRESENT" };
  }
  if (sinteticas.length > 1) {
    return { kind: "abort", reason: "FX_QA_RATE_AMBIGUOUS" };
  }
  if (sinteticas.length === 0) {
    return { kind: "seed" };
  }
  const mia = sinteticas[0];
  if (Number(mia.rate_micros) !== Number(esperadoMicros)) {
    return { kind: "abort", reason: "FX_QA_RATE_ECONOMY_MISMATCH" };
  }
  return { kind: "reuse", id: mia.id };
}
