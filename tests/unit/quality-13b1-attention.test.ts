/**
 * Trazaloop · QUALITY-13B1 · El contrato de atención.
 *
 * B1 no construye la portada. Construye la forma que B3 y B4 van a rellenar, y
 * la pieza que decide si esa portada será fiable: **la identidad de un
 * problema**.
 *
 * Las dos preguntas que esta suite existe para responder:
 *
 *   · el MISMO problema visto por dos observadores, ¿converge?
 *   · dos problemas DISTINTOS del mismo sujeto, ¿siguen siendo dos?
 *
 * Si la primera falla, la portada duplica. Si falla la segunda, esconde.
 *
 * Correr: npm run test:quality13b1-attention
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  attentionKey, CURRENT, deepLink, dedupeAttention, OBSERVER_KINDS,
  type AttentionItem, type Observer,
} from "../../lib/domain/quality-integration";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const raiz = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

const RIESGO = "3f1c2a44-0000-4000-8000-000000000001";

function item(
  condicion: string, observer: Observer, extra: Partial<AttentionItem> = {}
): AttentionItem {
  return {
    domain: "risks", subjectKind: "quality_risk", subjectId: RIESGO,
    label: "Riesgo de desabastecimiento", reason: condicion, state: "active",
    severity: null, since: "2026-08-01",
    href: deepLink("quality_risk", RIESGO),
    observer, temporal: CURRENT,
    dedupeKey: attentionKey({
      domain: "risks", subjectKind: "quality_risk", subjectId: RIESGO, condition: condicion,
    }),
    ...extra,
  };
}

console.log("\nQUALITY-13B1 · Contrato de atención\n");

// ===========================================================================
// N · La identidad
// ===========================================================================

check("N. La clave se construye con dominio, sujeto y condición · NUNCA con el texto", () => {
  const k = attentionKey({
    domain: "risks", subjectKind: "quality_risk", subjectId: RIESGO,
    condition: "revisión vencida",
  });
  assert(k.includes("risks") && k.includes("quality_risk") && k.includes(RIESGO),
    `la clave no identifica el problema: ${k}`);
  // El mismo problema escrito de otra manera sigue siendo el mismo problema.
  assert(k === attentionKey({
    domain: "Risks", subjectKind: "quality_risk", subjectId: RIESGO,
    condition: "  Revisión Vencida  ",
  }), "la clave cambia por mayúsculas o espacios: sería frágil");
  // Y la etiqueta visible NO entra: se traduce, se reescribe y lleva fechas.
  assert(!k.includes("Riesgo de desabastecimiento"),
    "la clave incluye el texto que se enseña");
});

// ===========================================================================
// O · Convergencia
// ===========================================================================

check("O. El mismo problema visto por dos observadores converge", () => {
  // Es el caso real que QUALITY-13A encontró cinco veces: el estado del
  // dominio y el barrido heredado dicen lo mismo, y la portada lo enseñaría
  // dos veces.
  const porDominio = item("revisión vencida",
    { code: "risks", kind: "truth_source" });
  const porBarrido = item("revisión vencida",
    { code: "quality_scan_risk_reviews", kind: "legacy_sweep" });
  const porRegla = item("revisión vencida",
    { code: "risk_review_overdue", kind: "active_observer",
      supersedes: "quality_scan_risk_reviews" });

  assert(porDominio.dedupeKey === porBarrido.dedupeKey
    && porBarrido.dedupeKey === porRegla.dedupeKey,
    "tres observadores del mismo problema producen claves distintas");

  const { items, alsoSeenBy } = dedupeAttention([porDominio, porBarrido, porRegla]);
  assert(items.length === 1, `esperaba 1 problema, quedaron ${items.length}`);
  assert(items[0].observer.code === "risks", "no ganó el primero que llegó");
  const tambien = alsoSeenBy.get(items[0].dedupeKey) ?? [];
  assert(tambien.length === 2,
    "se pierde quién más vio el problema, y eso hace falta para relevar barridos");
});

// ===========================================================================
// P · Separación
// ===========================================================================

check("P. Dos problemas distintos del mismo sujeto siguen siendo dos", () => {
  const vencida = item("revisión vencida", { code: "risks", kind: "truth_source" });
  const sinTratar = item("sin tratamiento", { code: "risks", kind: "truth_source" });
  assert(vencida.dedupeKey !== sinTratar.dedupeKey,
    "dos condiciones distintas del mismo riesgo comparten clave: una desaparecería");
  const { items } = dedupeAttention([vencida, sinTratar]);
  assert(items.length === 2, `esperaba 2 problemas, quedaron ${items.length}`);
});

check("P2. El mismo problema en dos sujetos también son dos", () => {
  const otro = "3f1c2a44-0000-4000-8000-000000000002";
  const a = item("revisión vencida", { code: "risks", kind: "truth_source" });
  const b = item("revisión vencida", { code: "risks", kind: "truth_source" },
    { subjectId: otro,
      dedupeKey: attentionKey({
        domain: "risks", subjectKind: "quality_risk", subjectId: otro,
        condition: "revisión vencida" }) });
  const { items } = dedupeAttention([a, b]);
  assert(items.length === 2, "dos riesgos distintos con el mismo problema se fundieron");
});

// ===========================================================================
// Metadatos del observador
// ===========================================================================

check("Q1. El vocabulario de observadores distingue las cuatro cosas", () => {
  for (const k of ["truth_source", "active_observer", "superseded_observer", "legacy_sweep"]) {
    assert((OBSERVER_KINDS as readonly string[]).includes(k), `falta el tipo ${k}`);
  }
  // `supersedes` es lo que permitirá a B3 relevar sin borrar nada.
  const releva: Observer = {
    code: "indicator_measurement_due", kind: "active_observer",
    supersedes: "quality_scan_pending_measurements",
  };
  assert(releva.supersedes, "un observador no puede declarar a quién releva");
});

check("Q2. El inventario de mecanismos de 13A está en el documento, no inventado aquí", () => {
  const doc = leer("docs/quality/quality-13/QUALITY_13A_INTEGRATION_DISCOVERY.md");
  for (const mecanismo of ["quality_signals", "quality_risk_signals", "quality_supplier_signals",
                           "quality_customer_signals", "quality_knowledge_signals",
                           "quality_scan_pending_measurements", "work_scan_pending_actions"]) {
    assert(doc.includes(mecanismo), `el inventario no menciona ${mecanismo}`);
  }
  assert(/supersedes_observer/.test(doc), "el inventario no dice cómo se releva un barrido");
  assert(/ning[úu]n barrido se borra/i.test(doc),
    "el inventario no recoge la regla de compatibilidad de QI-27");
});

// ===========================================================================
// Lo que el contrato NO hace
// ===========================================================================

check("R1. No se inventa una gravedad global de Quality", () => {
  const dom = leer("lib/domain/quality-integration.ts");
  assert(!/quality_severity|globalSeverity|scoreDe|puntuacion/i.test(dom),
    "aparece una gravedad global: comparar problemas de siete dominios en una escala "
    + "inventada es comparar cosas que no se comparan");
  const sinGravedad = item("revisión vencida", { code: "risks", kind: "truth_source" });
  assert(sinGravedad.severity === null,
    "el contrato rellena una gravedad que el dominio no dio");
});

check("R2. Todo punto de atención lleva a su causa (QI-26)", () => {
  const it = item("revisión vencida", { code: "risks", kind: "truth_source" });
  assert(it.href.startsWith("/quality/risks/"), `el enlace no lleva al riesgo: ${it.href}`);
  assert(it.href.includes(RIESGO), "el enlace lleva al listado, no a la fila");
  const dom = leer("lib/domain/quality-integration.ts");
  assert(/href: string;/.test(dom.slice(dom.indexOf("export type AttentionItem"))),
    "el enlace no es obligatorio en el contrato");
});

check("R3. La atención declara su tiempo", () => {
  const it = item("revisión vencida", { code: "risks", kind: "truth_source" });
  assert(it.temporal.mode === "current", "no declara el momento que describe");
  const dom = leer("lib/domain/quality-integration.ts");
  const bloque = dom.slice(dom.indexOf("export type AttentionItem"));
  assert(/temporal: TemporalScope;/.test(bloque), "el tiempo no es obligatorio");
});

console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
