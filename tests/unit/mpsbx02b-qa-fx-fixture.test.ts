/**
 * Trazaloop · MP-SBX-02B · Qué tasa adopta el arnés de QA, y cuál no.
 *
 *
 * DE DÓNDE SALE ESTA SUITE
 *
 * `prepare`, el arnés de checkout de Mercado Pago, sembraba su propia tasa
 * sintética y solo se la saltaba si ya había una vigente con SU marca. En
 * Staging se encontró la tasa canónica de TEST-HYGIENE-03 —igual de sintética,
 * misma economía, otra nota—, no la reconoció, intentó abrir una segunda y 0182
 * lo paró con `FX_RATE_OVERLAPS`.
 *
 * La regla de 0182 hizo lo correcto. Lo que estaba mal era tener dos
 * convenciones para la misma cosa. Ahora hay una, y la decisión es una función
 * pura para poder probar caso por caso lo que de verdad importa: que no adopte
 * lo que no debe.
 *
 * LO QUE ESTA SUITE DEFIENDE, Y POR QUÉ CADA CASO
 *
 * Adoptar una tasa por error no es un fallo de pruebas: `billing_resolve_fx` no
 * mira la nota, así que cualquier tasa vigente se convierte en precio. Tratar
 * una tasa comercial como fixture sería presupuestar con ella; abrir una
 * segunda encima sería dejar el precio a merced de un orden de lectura.
 *
 * Correr: npm run test:mpsbx02b-fx
 */
import { readFileSync } from "node:fs";
import {
  decideQaFxFixture, isQaSyntheticFxNote,
  QA_FX_CANONICAL_NOTE, QA_FX_LEGACY_MARKER, QA_FX_MICROS,
  type QaFxRow,
} from "../../lib/billing/qa/fx-fixture";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

/** Una fila vigente: activa y sin fin. Es lo único que puede regir. */
const vigente = (id: string, note: string | null, micros = QA_FX_MICROS): QaFxRow =>
  ({ id, note, status: "active", effective_to: null, rate_micros: micros });

console.log("\nMP-SBX-02B · El tipo de cambio que adopta el arnés de QA\n");

// ===========================================================================
console.log("A · Con la canónica vigente, se REUTILIZA y no se crea nada");
// ===========================================================================

check("A1. La canónica de TEST-HYGIENE-03 se reconoce y se reutiliza", () => {
  const d = decideQaFxFixture([vigente("c4f9", QA_FX_CANONICAL_NOTE)]);
  assert(d.kind === "reuse", `decidió ${d.kind}${d.kind === "abort" ? ": " + d.reason : ""}`);
  assert(d.id === "c4f9", "reutiliza una fila distinta de la que hay");
});

check("A2. Y la marca heredada de PE-05B2 también · no se rompe lo anterior", () => {
  const d = decideQaFxFixture([vigente("ab12", `${QA_FX_LEGACY_MARKER} · PE-05B2 · 4000 COP/USD`)]);
  assert(d.kind === "reuse", `decidió ${d.kind}`);
});

check("A3. Las retiradas y las cerradas NO cuentan como vigentes", () => {
  const retirada: QaFxRow = { id: "r1", note: QA_FX_CANONICAL_NOTE, status: "retired",
    effective_to: null, rate_micros: QA_FX_MICROS };
  const cerrada: QaFxRow = { id: "c1", note: QA_FX_CANONICAL_NOTE, status: "active",
    effective_to: "2026-01-01T00:00:00Z", rate_micros: QA_FX_MICROS };
  const d = decideQaFxFixture([retirada, cerrada]);
  assert(d.kind === "seed", `con solo historia hay que sembrar, y decidió ${d.kind}`);
});

// ===========================================================================
console.log("\nB · Una tasa comercial NO se adopta como fixture");
// ===========================================================================

check("B1. Con una tasa comercial vigente se PARA · no se adopta ni se crea", () => {
  const d = decideQaFxFixture([vigente("com1", "Tasa comercial de septiembre")]);
  assert(d.kind === "abort", `decidió ${d.kind} sobre una tasa que no es nuestra`);
  assert(d.reason === "FX_COMMERCIAL_RATE_PRESENT", `motivo: ${d.reason}`);
});

check("B2. Y tampoco con la nota vacía o ausente", () => {
  for (const nota of [null, "", "   "]) {
    const d = decideQaFxFixture([vigente("x", nota)]);
    assert(d.kind === "abort" && d.reason === "FX_COMMERCIAL_RATE_PRESENT",
      `una nota ${JSON.stringify(nota)} no puede pasar por fixture: ${JSON.stringify(d)}`);
  }
});

check("B3. Decir «QA» no basta · solo valen las DOS marcas que emite el proyecto", () => {
  for (const nota of ["QA", "qa test rate", "prueba", "TEST rate USD/COP",
                      "QA CANONICA sin acentos", "sintética"]) {
    assert(!isQaSyntheticFxNote(nota), `«${nota}» se aceptó como fixture de QA`);
  }
  assert(isQaSyntheticFxNote(QA_FX_CANONICAL_NOTE), "la canónica dejó de reconocerse");
  assert(isQaSyntheticFxNote(`${QA_FX_LEGACY_MARKER} · lo que sea`),
    "la marca heredada dejó de reconocerse");
});

// ===========================================================================
console.log("\nC · Ante la ambigüedad, falla cerrado");
// ===========================================================================

check("C1. Dos candidatas sintéticas a la vez: no se elige, se para", () => {
  const d = decideQaFxFixture([
    vigente("uno", QA_FX_CANONICAL_NOTE),
    vigente("dos", `${QA_FX_LEGACY_MARKER} · otra`),
  ]);
  assert(d.kind === "abort", `decidió ${d.kind} entre dos candidatas`);
  assert(d.reason === "FX_QA_RATE_AMBIGUOUS", `motivo: ${d.reason}`);
});

check("C2. Una sintética con OTRA economía tampoco se adopta", () => {
  const d = decideQaFxFixture([vigente("eco", QA_FX_CANONICAL_NOTE, 3_800_000_000)]);
  assert(d.kind === "abort", `decidió ${d.kind} con una economía distinta`);
  assert(d.reason === "FX_QA_RATE_ECONOMY_MISMATCH", `motivo: ${d.reason}`);
});

check("C3. Y una comercial junto a la canónica se para por la comercial", () => {
  const d = decideQaFxFixture([
    vigente("com", "Tasa comercial"), vigente("qa", QA_FX_CANONICAL_NOTE),
  ]);
  assert(d.kind === "abort" && d.reason === "FX_COMMERCIAL_RATE_PRESENT",
    `la presencia de una tasa ajena manda: ${JSON.stringify(d)}`);
});

// ===========================================================================
console.log("\nD · Sin ninguna, se siembra como siempre");
// ===========================================================================

check("D1. Sin tasas vigentes se siembra", () => {
  assert(decideQaFxFixture([]).kind === "seed", "no decidió sembrar con la tabla vacía");
});

check("D2. La economía esperada es la compartida · 4 000 COP por USD", () => {
  assert(QA_FX_MICROS === 4_000_000_000, `la constante cambió a ${QA_FX_MICROS}`);
});

// ===========================================================================
console.log("\nE · El arnés usa esta decisión · no una copia suya");
// ===========================================================================

check("E1. `prepare` llama a `decideQaFxFixture` y no reimplementa el criterio", () => {
  // Y `retire_qa_fx` sigue mirando SOLO la marca heredada, a propósito: cierra
  // la vigencia además de retirar, y a la canónica eso la mataría para siempre.
  const ruta = readFileSync("app/api/billing/qa/mercadopago-smoke/route.ts", "utf8");
  assert(ruta.includes("decideQaFxFixture("), "la ruta QA ya no usa la decisión compartida");
  assert(!ruta.includes(`"${QA_FX_LEGACY_MARKER}`),
    "la ruta volvió a llevar la marca escrita a mano en vez de la constante compartida");
  assert(/decision\.kind === "abort"/.test(ruta),
    "la ruta no corta cuando la decisión dice que hay que parar");
});

console.log(`\nMP-SBX-02B · tasa de QA: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
