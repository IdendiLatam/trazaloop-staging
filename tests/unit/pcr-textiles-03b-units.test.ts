/**
 * Trazaloop · PT-03B · Unidades · dominio y cableado.
 *
 * El comportamiento transaccional —el candado, la carrera y el rechazo por
 * unidades— se demuestra contra la base real en `test:pcr-textiles-03b-rls`,
 * porque eso solo se ve con dos conexiones simultáneas. Aquí van las reglas
 * puras y la comprobación de que la interfaz está conectada a ellas.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MEASUREMENT_UNITS, MEASUREMENT_UNIT_OPTIONS, canonicalUnit,
  unitsAreComparable, unitIsComputable, formatQuantity, isMeasurementUnit,
} from "@/lib/domain/measurement-units";
import { UNIT_CODES } from "@/lib/domain/quality-indicators";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

console.log("\nPT-03B · Unidades de medida física\n");

check("A1. El catálogo cubre lo que Textiles usa de verdad", () => {
  // El formulario sugería «m, kg, units, rollos». Eso es el mínimo.
  for (const u of ["kg", "m", "unit", "roll"]) {
    assert((MEASUREMENT_UNITS as readonly string[]).includes(u), `falta ${u}`);
  }
  assert(MEASUREMENT_UNIT_OPTIONS.length === MEASUREMENT_UNITS.length,
    "toda unidad debe tener etiqueta");
});

check("A2. NO se reutilizó el catálogo de indicadores, y se explica por qué", () => {
  // Aquel tiene cop/usd/celsius —sin sentido en el selector de un rollo— y le
  // faltan m y roll. Reutilizarlo entero habría sido peor que tener dos.
  for (const ajeno of ["cop", "usd", "percent", "celsius", "days", "hours"]) {
    assert(!(MEASUREMENT_UNITS as readonly string[]).includes(ajeno),
      `${ajeno} no pinta nada en una unidad física`);
    assert((UNIT_CODES as readonly string[]).includes(ajeno),
      `la prueba asume que ${ajeno} sí está en el catálogo de indicadores`);
  }
  // Y donde coinciden, el código se escribe IGUAL.
  for (const comun of ["kg", "ton"]) {
    assert((UNIT_CODES as readonly string[]).includes(comun)
        && (MEASUREMENT_UNITS as readonly string[]).includes(comun),
      `${comun} debía escribirse igual en los dos`);
  }
  const src = read("lib/domain/measurement-units.ts");
  assert(/quality-indicators/.test(src), "la decisión debía quedar explicada en el módulo");
});

check("B1. Solo se normaliza lo inequívoco", () => {
  assert(canonicalUnit("Kilogramos") === "kg", "un alias claro se normaliza");
  assert(canonicalUnit("  KG  ") === "kg", "espacios y mayúsculas no cambian nada");
  assert(canonicalUnit("m²") === "m2", "el símbolo se reconoce");
  assert(canonicalUnit("rollos") === "roll", "«rollos» es inequívoco");
  // Un par podrían ser dos unidades o una. Elegir sería inventarse el dato.
  assert(canonicalUnit("pares") === null, "«pares» es ambiguo y no se normaliza");
  assert(canonicalUnit("docenas") === null, "«docenas» no está en el catálogo");
  assert(canonicalUnit("") === null && canonicalUnit(null) === null, "vacío no es una unidad");
});

check("B2. `other` es canónico pero NO computable", () => {
  assert(isMeasurementUnit("other"), "«other» es un código válido");
  assert(!unitIsComputable("other"), "pero no entra en aritmética");
  // Dos cantidades en «other» pueden ser rollos y docenas: compartir la
  // etiqueta de lo desconocido no las hace comparables.
  assert(!unitsAreComparable("other", "other"), "«other» con «other» sigue sin ser comparable");
  // Y `canonicalUnit` nunca lo devuelve: lo elige una persona, no un algoritmo.
  assert(canonicalUnit("other") === null, "«other» no se deduce de un texto");
});

check("B3. No hay conversión, y no la habrá", () => {
  assert(!unitsAreComparable("kg", "g"), "kg y g NO se convierten");
  assert(!unitsAreComparable("m", "cm"), "m y cm tampoco");
  assert(unitsAreComparable("kg", "kg"), "lo igual sí se compara");
  const src = read("lib/domain/measurement-units.ts");
  assert(!/\*\s*1000|\/\s*1000|factor/i.test(src),
    "apareció un factor de conversión: eso es el fallo con otra cara");
});

check("B4. Lo no normalizado se presenta como tal, no se disimula", () => {
  assert(formatQuantity(12.5, "kg") === "12.5 kg", "lo canónico lleva su sufijo");
  assert(/sin normalizar/.test(formatQuantity(12.5, "bobinas")),
    "una unidad desconocida debe verse marcada");
  assert(formatQuantity(3, null) === "3", "sin unidad, solo el número");
});

check("C1. Los cuatro campos de unidad son selectores, no texto libre", () => {
  const pantallas = [
    "app/(app)/(shell)/textiles/traceability/orders/page.tsx",
    "app/(app)/(shell)/textiles/traceability/input-lots/page.tsx",
    "app/(app)/(shell)/textiles/traceability/output-lots/[id]/page.tsx",
    "app/(app)/(shell)/textiles/traceability/orders/[id]/page.tsx",
  ];
  for (const f of pantallas) {
    const src = read(f);
    assert(!/key: "unit", label: "Unidad", type: "text"/.test(src),
      `${f} conserva un campo de unidad de texto libre`);
    assert(src.includes("MEASUREMENT_UNIT_OPTIONS"), `${f} no usa el catálogo`);
  }
});

check("C2. La ayuda que pedía «consistencia manual» desapareció", () => {
  // Era la confesión del fallo: el sistema pedía al usuario lo que él mismo
  // no comprobaba. Ahora lo comprueba.
  const src = read("app/(app)/(shell)/textiles/traceability/orders/page.tsx");
  assert(!/mantén consistencia manual/i.test(src),
    "seguía pidiendo consistencia manual en vez de exigirla");
});

check("C3. Toda escritura guarda el código canónico junto al texto", () => {
  const acc = read("server/actions/textiles-traceability.ts");
  const escrituras = (acc.match(/unit: cleanText\(input\.unit\)/g) ?? []).length
                   + (acc.match(/^\s+unit,$/gm) ?? []).length;
  const codigos = (acc.match(/unit_code: canonicalUnit\(/g) ?? []).length;
  assert(codigos >= escrituras,
    `${escrituras} escrituras de unidad y solo ${codigos} guardan el código canónico`);
});

check("D1. La guarda bloquea la fila y usa el errcode de PCR", () => {
  const mig = read("supabase/migrations/0143_textile_unit_codes_and_concurrency.sql");
  const fn = mig.slice(mig.indexOf("function public.guard_textile_lot_overconsumption"));
  assert(/for update/i.test(fn), "faltaba el candado: es la línea que crea la paridad con 0105");
  assert(/errcode = '23514'/.test(fn), "el rechazo debía llevar el mismo errcode que PCR");
});

check("D2. La desigualdad de unidades RECHAZA, ya no abre la puerta", () => {
  const mig = read("supabase/migrations/0143_textile_unit_codes_and_concurrency.sql");
  const fn = mig.slice(mig.indexOf("function public.guard_textile_lot_overconsumption"));
  // Antes: `if unidades coinciden then comprobar end if; return new;`
  // Ahora: si no coinciden, `raise`.
  assert(/v_lot_u <> v_new_u[\s\S]{0,200}raise exception/.test(fn),
    "la desigualdad de unidades debía provocar un rechazo");
  assert(/v_lot_u = 'other'[\s\S]{0,160}raise exception/.test(fn),
    "«other» no puede comprometer un saldo");
});

check("D3. El backfill solo toca lo inequívoco y conserva el original", () => {
  const mig = read("supabase/migrations/0143_textile_unit_codes_and_concurrency.sql");
  assert(/where unit_code is null/.test(mig), "el backfill debía ser idempotente");
  assert(!/set unit =|drop column .*\bunit\b(?!_code)/.test(mig),
    "el texto original que escribió la persona no se toca");
  assert(!/not null/i.test(mig.slice(mig.indexOf("add column if not exists unit_code"),
                                     mig.indexOf("comment on column"))),
    "unit_code NOT NULL rompería las filas que no se pueden normalizar");
});

check("D4. PT-H04: la regla es estructural, no una fecha de corte", () => {
  const mig = read("supabase/migrations/0143_textile_unit_codes_and_concurrency.sql");
  // Se busca el USO de una fecha de corte, no su mención: la migración dice
  // «No hay fecha de corte, ni legacy antes de X», y una búsqueda de la frase
  // no distingue la afirmación de su negación.
  const codigo = mig.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  assert(!/(created_at|updated_at)\s*[<>]=?\s*'?\d{4}-\d{2}-\d{2}/.test(codigo),
    "el código compara contra una fecha de corte: la regla debía ser estructural");
  assert(!/where[^;]*\b(legacy|migrated_before)\b/i.test(codigo),
    "el código separa filas por antigüedad en vez de por si son normalizables");
  // Y lo que SÍ debe haber: la condición estructural.
  assert(/where unit_code is null/.test(codigo),
    "la única condición del backfill debía ser «todavía no tiene código»");
  assert(/PT-H04/.test(mig), "la decisión debía quedar citada");
});

check("D5. La reversión está documentada", () => {
  const mig = read("supabase/migrations/0143_textile_unit_codes_and_concurrency.sql");
  assert(/REVERSI[ÓO]N/i.test(mig), "toda migración del sprint documenta su vuelta atrás");
  assert(/drop column if exists unit_code/.test(mig), "debía decir cómo se quitan las columnas");
});

console.log(`\n  ${passed} comprobaciones correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
