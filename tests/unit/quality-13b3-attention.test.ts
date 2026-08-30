/**
 * Trazaloop · QUALITY-13B3 · La convergencia, sin base y sin pantalla.
 *
 * Aquí se prueba lo único que decide si la futura portada sirve: que el mismo
 * problema visto por dos observadores se cuente UNA vez, y que dos problemas
 * distintos del mismo sujeto se cuenten DOS.
 *
 * Son funciones puras. Que lo sean es lo que permite probar la deduplicación
 * con cuatro observadores del mismo problema sin montar cuatro barridos.
 *
 * Correr: npm run test:quality13b3-attention
 */
import {
  CURRENT, attentionKey, asOf, type AttentionItem, type ObserverKind,
} from "../../lib/domain/quality-integration";
import {
  ATTENTION_STATES, byObserverPriority, converge, isActive, observerLabel,
  stateOfSignal, summarizeAttention, summaryIsComplete,
} from "../../lib/domain/quality-attention";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

/** Un punto de atención sobre un riesgo, visto por quien se diga. */
function punto(opts: {
  observer: string; kind: ObserverKind; condition: string;
  subjectId?: string; domain?: string; severity?: string | null; label?: string;
}): AttentionItem {
  const domain = opts.domain ?? "risks";
  const subjectId = opts.subjectId ?? "riesgo-1";
  return {
    domain, subjectKind: "quality_risk", subjectId,
    label: opts.label ?? "Retraso de despacho",
    reason: opts.condition, state: "open",
    severity: opts.severity === undefined ? "warning" : opts.severity,
    since: "2026-08-01",
    href: `/quality/risks/${subjectId}`,
    observer: { code: opts.observer, kind: opts.kind },
    temporal: CURRENT,
    dedupeKey: attentionKey({
      domain, subjectKind: "quality_risk", subjectId, condition: opts.condition }),
  };
}

console.log("\nQUALITY-13B3 · Convergencia de la atención\n");

// ===========================================================================
console.log("I · La identidad de un problema");
// ===========================================================================

check("I1. Dos observadores del MISMO problema se cuentan una vez", () => {
  const { items, alsoSeenBy } = converge([
    punto({ observer: "quality_scan_risk_reviews.risk_review_overdue",
            kind: "legacy_sweep", condition: "risk_review_overdue" }),
    punto({ observer: "regla_de_la_empresa", kind: "active_observer",
            condition: "risk_review_overdue" }),
  ]);
  assert(items.length === 1, `se enseñan ${items.length} líneas para un solo problema`);
  const otros = alsoSeenBy.get(items[0].dedupeKey) ?? [];
  assert(otros.includes("regla_de_la_empresa"),
    "se pierde quién más vio el problema, y B3 necesita esa lista para relevar");
});

check("I2. Cuatro observadores del mismo problema siguen siendo uno", () => {
  const { items, alsoSeenBy } = converge([
    punto({ observer: "a", kind: "truth_source", condition: "risk_review_overdue" }),
    punto({ observer: "b", kind: "active_observer", condition: "risk_review_overdue" }),
    punto({ observer: "c", kind: "legacy_sweep", condition: "risk_review_overdue" }),
    punto({ observer: "d", kind: "superseded_observer", condition: "risk_review_overdue" }),
  ]);
  assert(items.length === 1, `se enseñan ${items.length}`);
  assert((alsoSeenBy.get(items[0].dedupeKey) ?? []).length === 3,
    "no se conservan los tres observadores restantes");
});

check("I3. Dos condiciones distintas del MISMO sujeto NO se funden", () => {
  const { items } = converge([
    punto({ observer: "a", kind: "legacy_sweep", condition: "risk_review_overdue" }),
    punto({ observer: "b", kind: "legacy_sweep", condition: "treatment_overdue" }),
  ]);
  assert(items.length === 2, "se fundieron dos problemas distintos y se escondió trabajo real");
});

check("I4. El mismo problema en DOS sujetos son dos problemas", () => {
  const { items } = converge([
    punto({ observer: "a", kind: "legacy_sweep", condition: "risk_review_overdue",
            subjectId: "riesgo-1" }),
    punto({ observer: "a", kind: "legacy_sweep", condition: "risk_review_overdue",
            subjectId: "riesgo-2" }),
  ]);
  assert(items.length === 2, "dos riesgos distintos se contaron como uno");
});

check("I5. NUNCA se deduplica por el texto, ni por la gravedad, ni por la hora", () => {
  const { items } = converge([
    punto({ observer: "a", kind: "legacy_sweep", condition: "risk_review_overdue",
            label: "Revisión vencida", severity: "critical" }),
    punto({ observer: "b", kind: "active_observer", condition: "risk_review_overdue",
            label: "El riesgo no se ha revisado", severity: "info" }),
  ]);
  assert(items.length === 1,
    "dos textos distintos del mismo problema se contaron dos veces");
  // Y al revés: mismo texto, condición distinta → dos.
  const dos = converge([
    punto({ observer: "a", kind: "legacy_sweep", condition: "cond_a", label: "Igual" }),
    punto({ observer: "a", kind: "legacy_sweep", condition: "cond_b", label: "Igual" }),
  ]);
  assert(dos.items.length === 2, "el mismo texto fundió dos condiciones distintas");
});

check("I6. Gana el observador más cercano a la verdad", () => {
  const entrada = [
    punto({ observer: "barrido", kind: "legacy_sweep", condition: "c" }),
    punto({ observer: "dominio", kind: "truth_source", condition: "c" }),
    punto({ observer: "regla", kind: "active_observer", condition: "c" }),
  ].sort(byObserverPriority);
  const { items } = converge(entrada);
  assert(items[0].observer.code === "dominio",
    `queda visible «${items[0].observer.code}» en vez de la verdad del dominio`);
});

check("I7. Repetir la misma observación no añade nada", () => {
  const uno = punto({ observer: "a", kind: "legacy_sweep", condition: "c" });
  const { items } = converge([uno, uno, uno, uno]);
  assert(items.length === 1, `cuatro pasadas idénticas produjeron ${items.length} líneas`);
});

// ===========================================================================
console.log("\nJ · El estado, derivado y no guardado");
// ===========================================================================

check("J1. El vocabulario distingue las cinco situaciones", () => {
  assert(ATTENTION_STATES.length === 5, `hay ${ATTENTION_STATES.length} estados`);
  for (const e of ["active", "resolved", "suppressed", "not_visible", "unavailable"]) {
    assert((ATTENTION_STATES as readonly string[]).includes(e), `falta el estado ${e}`);
  }
});

check("J2. RECONOCER no es RESOLVER", () => {
  const reconocida = stateOfSignal({ status: "acknowledged", resolvedAt: null });
  assert(reconocida === "active",
    `una señal reconocida llegó como ${reconocida}: un clic reescribió la verdad`);
  assert(isActive(reconocida), "una señal reconocida deja de contar como pendiente");
  const resuelta = stateOfSignal({ status: "resolved", resolvedAt: "2026-08-30T00:00:00Z" });
  assert(resuelta === "resolved", "resolver no cierra");
});

check("J3. Silenciar se distingue de resolver", () => {
  const s = stateOfSignal({ status: "suppressed", resolvedAt: null });
  assert(s === "suppressed", `silenciada llegó como ${s}`);
  assert(!isActive(s), "una señal silenciada sigue contando como pendiente");
});

check("J4. Sin acceso y sin poder leer NO son «no hay»", () => {
  const desconocidos: readonly string[] = ["not_visible", "unavailable"];
  for (const e of desconocidos) {
    assert(!isActive(e as never), `${e} se cuenta como atención activa`);
    assert(e !== "resolved", `${e} se confunde con resuelto`);
    assert(!["active", "resolved"].includes(e),
      `${e} se confunde con saber que sí hay o que ya no hay`);
  }
});

// ===========================================================================
console.log("\nK · El resumen para B4");
// ===========================================================================

const CONJUNTO = converge([
  punto({ observer: "quality_scan_risk_reviews.risk_review_overdue",
          kind: "legacy_sweep", condition: "risk_review_overdue" }),
  // El mismo problema, otra vez, por otro observador: NO debe sumar.
  punto({ observer: "regla", kind: "active_observer", condition: "risk_review_overdue" }),
  punto({ observer: "quality_scan_audits.audit_overdue", kind: "legacy_sweep",
          condition: "audit_overdue", domain: "audits", subjectId: "aud-1" }),
  punto({ observer: "quality_scan_audits.audit_upcoming", kind: "legacy_sweep",
          condition: "audit_upcoming", domain: "audits", subjectId: "aud-2" }),
  punto({ observer: "quality_scan_people_signals.development_item_pending",
          kind: "legacy_sweep", condition: "development_item_pending",
          domain: "people", subjectId: "dev-1", severity: null }),
]).items;

check("K1. No se cuenta dos veces lo ya convergido", () => {
  const r = summarizeAttention(CONJUNTO);
  assert(r.total === 4, `el total es ${r.total} y hay cuatro problemas`);
  assert(r.byDomain.risks === 1, `riesgos suma ${r.byDomain.risks}`);
  assert(r.byDomain.audits === 2, `auditorías suma ${r.byDomain.audits}`);
});

check("K2. Se agrupa por la CONDICIÓN causal, no por el texto", () => {
  const r = summarizeAttention(CONJUNTO);
  assert(r.byCondition.risk_review_overdue === 1, "no agrupa por condición");
  assert(r.byCondition.audit_overdue === 1 && r.byCondition.audit_upcoming === 1,
    "dos condiciones de auditoría se mezclaron");
});

check("K3. «Vencido» y «por vencer» solo donde el observador lo permite", () => {
  const r = summarizeAttention(CONJUNTO);
  assert(r.overdue === 2, `cuenta ${r.overdue} vencidos y hay dos`);
  assert(r.dueSoon === 1, `cuenta ${r.dueSoon} por vencer y hay uno`);
  // La actividad de desarrollo no es ni una cosa ni la otra: no se fuerza.
  assert(r.overdue + r.dueSoon + r.timingUnknown < r.total,
    "todo se clasificó en el tiempo, incluso lo que no habla de fechas");
});

check("K4. Lo que el dominio no gradúa se dice, no se rellena", () => {
  const r = summarizeAttention(CONJUNTO);
  assert(r.withoutSeverity === 1, `${r.withoutSeverity} sin gravedad, y hay uno`);
  assert(!("none" in r.bySeverity), "se inventó una gravedad «ninguna»");
  assert(r.bySeverity.warning === 3, `warning suma ${r.bySeverity.warning}`);
});

check("K5. No hay puntuación global de ningún tipo", () => {
  const r = summarizeAttention(CONJUNTO) as unknown as Record<string, unknown>;
  for (const prohibido of ["score", "priority", "index", "grade", "health"]) {
    assert(!Object.keys(r).some((k) => k.toLowerCase().includes(prohibido)),
      `el resumen expone «${prohibido}»`);
  }
});

check("K6. Con una fuente caída, el resumen NO se puede afirmar", () => {
  assert(summaryIsComplete([{ status: "ok" }, { status: "ok" }]), "un resumen entero se niega");
  assert(!summaryIsComplete([{ status: "ok" }, { status: "unavailable" }]),
    "un resumen con una fuente caída se presenta como completo");
  assert(!summaryIsComplete([{ status: "not_visible" }]),
    "un resumen con un dominio denegado se presenta como completo");
});

check("K7. Un conjunto vacío resume cero, y eso es distinto de no saber", () => {
  const r = summarizeAttention([]);
  assert(r.total === 0 && r.overdue === 0, "un conjunto vacío no resume cero");
  assert(Object.keys(r.byDomain).length === 0, "inventa dominios donde no hay nada");
});

// ===========================================================================
console.log("\nL · Procedencia");
// ===========================================================================

check("L1. El observador se puede nombrar en lengua de persona", () => {
  const etiqueta = observerLabel("quality_scan_risk_reviews.risk_review_overdue");
  assert(etiqueta.length > 15 && !etiqueta.includes("_"),
    `la procedencia se enseña en jerga: «${etiqueta}»`);
  assert(observerLabel("no_existe") === "no_existe",
    "se inventa un nombre para un observador desconocido");
});

check("L2. Cada punto conserva su momento", () => {
  const historico = { ...punto({ observer: "a", kind: "legacy_sweep", condition: "c" }),
                      temporal: asOf("2024-01-01") };
  const { items } = converge([historico]);
  assert(items[0].temporal.mode === "as_of", "se pierde el momento del punto de atención");
});

check("L3. Y su enlace a la causa", () => {
  for (const it of CONJUNTO) {
    assert(it.href.startsWith("/quality/"), `enlace fuera de Quality: ${it.href}`);
    assert(it.href.includes(it.subjectId), "el enlace no lleva al sujeto que causa el problema");
  }
});

console.log(`\nQUALITY-13B3 · convergencia: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
