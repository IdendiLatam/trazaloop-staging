/**
 * Trazaloop · PT-03B · Unidades de medida FÍSICA.
 *
 * EL PROBLEMA
 *
 * En Textiles la unidad es una columna `text` libre, en cuatro tablas, y el
 * propio formulario lo admitía: «Sin conversión automática: mantén
 * consistencia manual». Con eso, `guard_textile_lot_overconsumption` compara
 * consumo contra recibido SOLO si las dos cadenas coinciden tras normalizar
 * espacios y mayúsculas. Un consumo en «kilogramos» contra un lote en «kg» no
 * se valida, no se resta y no se avisa más que en un contador aparte.
 *
 *
 * POR QUÉ NO SE REUTILIZA `UNIT_CODES` DE LOS INDICADORES
 *
 * Existe ya un vocabulario canónico en `lib/domain/quality-indicators.ts`, con
 * la postura correcta —«presentación y semántica, jamás transformación del
 * valor»— y se reutiliza ESA POSTURA y, donde coinciden, esos mismos códigos.
 *
 * Pero no la lista. Aquella tiene `cop`, `usd`, `percent` y `celsius`, que en
 * el selector de un rollo de tela no significan nada, y le faltan `m` y
 * `roll`. Reutilizarla entera para no tener dos listas habría puesto «Pesos
 * (COP)» entre las unidades de un lote: peor que tener dos.
 *
 *
 * LO QUE ESTE MÓDULO NO HACE, Y NO VA A HACER
 *
 * NO CONVIERTE. Ni kg↔g, ni m↔cm, ni nada. Dos cantidades en unidades
 * distintas son NO COMPARABLES y esa es la respuesta completa: un motor de
 * conversiones sería un sistema entero, y el sprint pide lo contrario.
 *
 * La aritmética silenciosa es justo el fallo que se está cerrando. Convertir
 * «por comodidad» lo reintroduciría con otra cara.
 */

/**
 * Los códigos. Estables, en inglés, y ya no se renombran: quedan escritos en
 * filas de la base.
 *
 * Cubren lo que Textiles usa de verdad —el propio formulario sugería «m, kg,
 * units, rollos»— y nada más. Añadir unidades que nadie usa llena el
 * desplegable de ruido y no mejora ningún dato.
 */
export const MEASUREMENT_UNITS = [
  "kg", "g", "ton", "m", "cm", "m2", "unit", "roll", "other",
] as const;
export type MeasurementUnit = (typeof MEASUREMENT_UNITS)[number];

export const MEASUREMENT_UNIT_LABEL: Record<MeasurementUnit, string> = {
  kg: "Kilogramos (kg)",
  g: "Gramos (g)",
  ton: "Toneladas (t)",
  m: "Metros (m)",
  cm: "Centímetros (cm)",
  m2: "Metros cuadrados (m²)",
  unit: "Unidades",
  roll: "Rollos",
  other: "Otra unidad (no participa en cálculos)",
};

/** El sufijo que se pega al número al presentarlo. */
export const MEASUREMENT_UNIT_SUFFIX: Record<MeasurementUnit, string> = {
  kg: " kg", g: " g", ton: " t", m: " m", cm: " cm", m2: " m²",
  unit: " unidades", roll: " rollos", other: "",
};

export function isMeasurementUnit(v: string | null | undefined): v is MeasurementUnit {
  return !!v && (MEASUREMENT_UNITS as readonly string[]).includes(v);
}

export const MEASUREMENT_UNIT_OPTIONS: ReadonlyArray<{ value: MeasurementUnit; label: string }> =
  MEASUREMENT_UNITS.map((value) => ({ value, label: MEASUREMENT_UNIT_LABEL[value] }));

/**
 * Alias INEQUÍVOCOS de lo que la gente escribió antes del catálogo.
 *
 * Aquí solo entra lo que no admite otra lectura. `unidades` → `unit` es
 * seguro; `pares` no está, porque un par podrían ser dos unidades o una, y
 * elegir sería inventarse el dato de otra persona. Lo dudoso se queda sin
 * normalizar y se ve como tal.
 *
 * Esto NO reescribe filas por su cuenta: lo usa el backfill de 0143 y la
 * sugerencia al editar.
 */
const ALIAS: Record<string, MeasurementUnit> = {
  "kg": "kg", "kgs": "kg", "kilo": "kg", "kilos": "kg",
  "kilogramo": "kg", "kilogramos": "kg", "kilogram": "kg", "kilograms": "kg",
  "g": "g", "gr": "g", "gramo": "g", "gramos": "g", "gram": "g", "grams": "g",
  "t": "ton", "ton": "ton", "tons": "ton", "tonelada": "ton", "toneladas": "ton",
  "m": "m", "mt": "m", "mts": "m", "metro": "m", "metros": "m", "meter": "m", "meters": "m",
  "cm": "cm", "centimetro": "cm", "centimetros": "cm", "centímetro": "cm", "centímetros": "cm",
  "m2": "m2", "m²": "m2", "metro cuadrado": "m2", "metros cuadrados": "m2",
  "u": "unit", "un": "unit", "und": "unit", "uds": "unit",
  "unit": "unit", "units": "unit", "unidad": "unit", "unidades": "unit", "pieza": "unit",
  "piezas": "unit", "pcs": "unit",
  "rollo": "roll", "rollos": "roll", "roll": "roll", "rolls": "roll",
};

/**
 * El código canónico de un texto libre, o `null` si no lo hay.
 *
 * `null` es una RESPUESTA, no un fallo: significa «esto no se puede
 * normalizar sin adivinar». Quien lo reciba debe conservar el texto original
 * y decirlo, jamás sustituirlo por un código plausible.
 */
export function canonicalUnit(raw: string | null | undefined): MeasurementUnit | null {
  if (!raw) return null;
  const limpio = raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
  if (isMeasurementUnit(limpio) && limpio !== "other") return limpio;
  return ALIAS[limpio] ?? null;
}

/**
 * ¿Estas dos cantidades se pueden sumar o comparar?
 *
 * Reglas, y las tres dicen lo mismo desde ángulos distintos:
 *
 *   · dos códigos iguales y conocidos → sí;
 *   · cualquiera sin normalizar (`null`) → NO;
 *   · `other` → NO, aunque coincidan.
 *
 * `other` no participa a propósito. Es un código canónico que significa
 * «ninguno de estos», así que dos cantidades en `other` pueden ser rollos y
 * docenas. Tratarlas como comparables por compartir la etiqueta de lo
 * desconocido sería exactamente el fallo que se está cerrando.
 */
export function unitsAreComparable(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (!isMeasurementUnit(a) || !isMeasurementUnit(b)) return false;
  if (a === "other" || b === "other") return false;
  return a === b;
}

/** ¿Este código puede participar en aritmética? (ni `null` ni `other`) */
export function unitIsComputable(u: string | null | undefined): u is MeasurementUnit {
  return isMeasurementUnit(u) && u !== "other";
}

export function formatQuantity(value: number, unit: string | null): string {
  const n = Number(value.toFixed(4));
  if (isMeasurementUnit(unit)) return `${n}${MEASUREMENT_UNIT_SUFFIX[unit]}`;
  // Sin normalizar: se enseña el número y se dice que la unidad no lo está.
  return unit ? `${n} ${unit} (sin normalizar)` : `${n}`;
}

/** Lo que se le dice a alguien cuya fila no tiene unidad canónica. */
export const UNIT_NOT_NORMALIZED_MESSAGE =
  "La unidad de este registro no está normalizada. Edítalo y elige una unidad del catálogo para que pueda entrar en saldos y cálculos.";

/** Lo que se le dice cuando dos unidades no se pueden mezclar. */
export function unitMismatchMessage(a: string | null, b: string | null): string {
  return `No se pueden combinar cantidades en «${a ?? "sin unidad"}» y «${b ?? "sin unidad"}»: Trazaloop no convierte unidades. Registra ambas en la misma unidad.`;
}
