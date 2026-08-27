/**
 * Trazaloop · QUALITY-12.2D · Lo que cuesta revisar, medido antes de gastarlo.
 *
 * Dos presupuestos, no uno.
 *
 * El de TOKENS es el conocido. El de CONSULTAS es nuevo y hace falta: el
 * Copilot no se pasaba de precio por escribir mucho, sino por leer diecinueve
 * dominios cada vez. Una capacidad puede tener el prompt más corto del mundo y
 * seguir siendo insostenible si para armarlo hace veinte viajes a la base.
 *
 * Los topes vienen del encargo. Si una comprobación falla, lo que hay que
 * mirar es qué engordó, no qué número subir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  breakdown, tokens, fixtureText, REVIEW_BUDGET_TARGETS, COPILOT_REFERENCE,
} from "../../lib/intelligence/document-review/budget";
import { REVIEW_POLICY } from "../../lib/intelligence/document-review/policy";
import { REVIEW_SCHEMA } from "../../lib/intelligence/document-review/schema";
import { CONTEXT_CAPS, MAX_TOTAL_FACTS } from "../../lib/intelligence/document-review/facts";
import { MAX_CONTEXT_TYPES, MAX_QUERIES, routeTypes } from "../../lib/intelligence/document-review/routing";
import { ROUTABLE_CONTEXT_TYPES } from "../../lib/domain/document-review";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const ESQUEMA = JSON.stringify(REVIEW_SCHEMA);

/**
 * La guía de «Responsabilidades» de Quality, COPIADA TAL CUAL de la base.
 *
 * No es una aproximación escrita para la ocasión. Un presupuesto medido contra
 * un texto inventado más corto que el real no mide nada, y uno medido contra
 * un texto más largo asusta sin motivo. Esto es lo que de verdad viaja.
 */
const GUIA = "Para qué existe la sección: Dejar claro quién hace qué dentro de lo "
  + "que el documento describe.\n"
  + "Guía: Nombra los cargos —no las personas— y di qué le corresponde a cada uno: "
  + "quién ejecuta, quién revisa, quién decide. Si un cargo no existe en la "
  + "organización, primero se crea.\n"
  + "No se puede afirmar sin registro: No inventar responsables, cargos ni "
  + "atribuciones. Si no está definido quién lo hace, se dice que falta definirlo.";

const METADATOS = "Módulo: Trazaloop Quality\n"
  + "Documento: PR-COM-01 · Procedimiento de compras\n"
  + "Sección: Responsabilidades";

/** Hechos con la pinta que tienen los de verdad: una frase por registro. */
function hechos(n: number): string {
  // Copiadas de lo que producen los adaptadores, no inventadas para la
  // ocasión: un presupuesto medido contra frases más cortas que las reales no
  // mide nada.
  const plantillas = [
    "Responsable registrado de este documento: cargo «Coordinador de Compras» (Administración).",
    "Proceso «Gestión de compras» (PR-02), active. Propósito: asegurar que los materiales que entran cumplen lo acordado.",
    "Control «Verificación de recepción» (CTR-04): detective, manual, frecuencia «anual».",
    "Indicador «Cumplimiento de proveedores» (IND-07), de este proceso.",
    "Riesgo identificado sobre este proceso: «Recepción de material fuera de especificación» (RSK-03).",
    "Otro documento del mismo proceso: «Instructivo de recepción» (IN-11), lo apoya, rev. 2 vigente, approved.",
  ];
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) out.push(`[${i + 1}] ${plantillas[i % plantillas.length]}`);
  return out.join("\n");
}

const COMPROBADO = "· Comprobado por Trazaloop: el texto nombra el cargo «Coordinador "
  + "de Calidad», pero el cargo registrado para esto es «Coordinador de Compras». Son "
  + "dos cargos distintos, los dos existen, y no coinciden. [2, 1]";

console.log("\nQUALITY-12.2D · presupuesto de tokens y de consultas\n");

// ===========================================================================
console.log("A · EL COSTE FIJO");
// ===========================================================================

const FIJO = tokens(REVIEW_POLICY) + tokens(ESQUEMA);

check("A1. política y esquema, medidos", () => {
  console.log(`      política ${tokens(REVIEW_POLICY)} · esquema ${tokens(ESQUEMA)} `
    + `· FIJO ${FIJO}`);
  assert(FIJO > 0, "no se pudo medir");
});

check("A2. el coste fijo no llega al del Copilot", () => {
  assert(FIJO < COPILOT_REFERENCE.fixedOverhead,
    `${FIJO} no es menos que los ${COPILOT_REFERENCE.fixedOverhead} del Copilot`);
  const reduccion = Math.round((1 - FIJO / COPILOT_REFERENCE.fixedOverhead) * 100);
  console.log(`      ${reduccion} % menos que el Copilot`);
  assert(reduccion >= 40, `solo un ${reduccion} % menos: la separación no compensa`);
});

check("A3. no se reutiliza la política del Copilot", () => {
  const copilot = read("lib/ai/prompts.ts");
  assert(!REVIEW_POLICY.includes(copilot.slice(0, 200)), "es la misma política");
  assert(tokens(REVIEW_POLICY) < 846,
    `la política ocupa ${tokens(REVIEW_POLICY)}, más que los 846 del Copilot`);
});

// ===========================================================================
console.log("\nB · UNA REVISIÓN NORMAL");
// ===========================================================================

check("B1. texto corto y tres tipos de contexto cabe en el tope normal", () => {
  const b = breakdown({
    policy: REVIEW_POLICY, schema: ESQUEMA,
    userText: fixtureText(40), guidance: GUIA, documentMetadata: METADATOS,
    facts: hechos(6), observations: COMPROBADO, limits: "",
  });
  console.log(`      fijo ${b.fixedOverhead} + texto ${b.userText} = ${b.total} `
    + `(tope ${REVIEW_BUDGET_TARGETS.normal})`);
  assert(b.total <= REVIEW_BUDGET_TARGETS.normal,
    `${b.total} pasa del tope normal de ${REVIEW_BUDGET_TARGETS.normal}`);
});

check("B2. con un texto de sección de verdad —100 palabras— sigue cabiendo", () => {
  const b = breakdown({
    policy: REVIEW_POLICY, schema: ESQUEMA,
    userText: fixtureText(100), guidance: GUIA, documentMetadata: METADATOS,
    facts: hechos(6), observations: COMPROBADO, limits: "",
  });
  console.log(`      ${b.total} (tope ${REVIEW_BUDGET_TARGETS.normal})`);
  assert(b.total <= REVIEW_BUDGET_TARGETS.normal,
    `${b.total} pasa del tope normal`);
});

// ===========================================================================
console.log("\nC · EL CASO COMPLEJO");
// ===========================================================================

check("C1. cuatro tipos, el cupo de hechos lleno y un texto largo", () => {
  const b = breakdown({
    policy: REVIEW_POLICY, schema: ESQUEMA,
    userText: fixtureText(250), guidance: GUIA, documentMetadata: METADATOS,
    facts: hechos(MAX_TOTAL_FACTS), observations: COMPROBADO,
    limits: "· «Objetivos»: la guía lo señala como pertinente, pero Trazaloop no "
      + "tiene hoy una relación que ate ese tipo de registro a un documento.",
  });
  console.log(`      fijo ${b.fixedOverhead} + texto ${b.userText} = ${b.total} `
    + `(tope ${REVIEW_BUDGET_TARGETS.complex})`);
  assert(b.total <= REVIEW_BUDGET_TARGETS.complex,
    `${b.total} pasa del tope complejo de ${REVIEW_BUDGET_TARGETS.complex}`);
});

check("C2. incluso el peor caso queda por debajo del Copilot", () => {
  const b = breakdown({
    policy: REVIEW_POLICY, schema: ESQUEMA,
    userText: fixtureText(250), guidance: GUIA, documentMetadata: METADATOS,
    facts: hechos(MAX_TOTAL_FACTS), observations: COMPROBADO, limits: "",
  });
  assert(b.total < COPILOT_REFERENCE.inputLow,
    `el peor caso (${b.total}) cuesta más que la consulta más barata del `
    + `Copilot (${COPILOT_REFERENCE.inputLow})`);
  console.log(`      peor caso ${b.total} vs Copilot ${COPILOT_REFERENCE.inputLow}–`
    + `${COPILOT_REFERENCE.inputHigh}`);
});

check("C3. el cupo de hechos existe y no es enorme", () => {
  assert(MAX_TOTAL_FACTS <= 30, `${MAX_TOTAL_FACTS} hechos ya no es una revisión`);
  for (const [t, cap] of Object.entries(CONTEXT_CAPS)) {
    assert(cap >= 1 && cap <= 8, `el tope de ${t} es ${cap}`);
  }
});

// ===========================================================================
console.log("\nD · EL PRESUPUESTO DE CONSULTAS");
// ===========================================================================

check("D1. el enrutado nunca pide más de seis tipos", () => {
  const todos = routeTypes([...ROUTABLE_CONTEXT_TYPES, "objective", "supplier"]);
  assert(todos.requested.length <= MAX_CONTEXT_TYPES,
    `pidió ${todos.requested.length} tipos`);
  assert(todos.dropped.length > 0, "no se declaró lo que quedó fuera");
});

check("D2. los tipos sin alcance no consumen ni una consulta", () => {
  const r = routeTypes(["objective", "supplier", "case", "customer_feedback", "evidence"]);
  assert(r.requested.length === 0, "se enrutó un tipo sin alcance");
  assert(r.unscoped.length === 5, "no se declararon los cinco");
});

check("D3. una guía vacía no enruta nada", () => {
  assert(routeTypes([]).requested.length === 0, "una guía sin tipos enrutó algo");
  assert(routeTypes(null).requested.length === 0, "una guía nula enrutó algo");
  assert(routeTypes(["inventado"]).requested.length === 0, "un tipo inventado pasó");
});

check("D4. el tope duro de consultas es muy inferior a los 19 del Copilot", () => {
  assert(MAX_QUERIES <= 12, `${MAX_QUERIES} consultas ya es un barrido`);
  assert(MAX_QUERIES < 19, "el tope no mejora al Copilot");
});

check("D5. los casos reales de hoy caben de sobra", () => {
  // Los dos peores que existen en los datos, medidos contra el coste de cada
  // adaptador: alcance 1, catálogo 1 por tipo con nombres, y lo de cada uno.
  const COSTE: Record<string, number> = {
    process: 2, position: 2, control: 1, indicator: 1, risk: 1,
    document: 2, organization_profile: 0,
  };
  const casos: [string, string[]][] = [
    ["Quality · responsabilidades", ["position", "process"]],
    ["Quality · desarrollo", ["process", "control", "indicator", "risk"]],
    ["PCR · responsables", ["position", "process"]],
    ["Textiles · alcance", ["organization_profile", "process"]],
    // `evidence` no cuesta nada: no tiene alcance y se declara como límite.
    ["Textiles · registros", ["document", "evidence"]],
  ];
  for (const [nombre, tipos] of casos) {
    const catalogos = tipos.filter((t) => t === "position" || t === "process").length;
    const total = 1 + catalogos + tipos.reduce((a, t) => a + (COSTE[t] ?? 0), 0);
    console.log(`      ${nombre}: ${total} consultas`);
    assert(total <= MAX_QUERIES, `${nombre} costaría ${total} consultas`);
    assert(total <= 8, `${nombre} costaría ${total}, que ya no es «pequeño»`);
  }
});

// ===========================================================================
console.log("\nE · LA COMPARACIÓN CON LO ANTERIOR");
// ===========================================================================

check("E1. revisar cuesta más que redactar, y eso es esperable", () => {
  const quickEdit = read("lib/intelligence/document-authoring/policy.ts");
  const politicaQE = /const POLITICA = `([\s\S]*?)`;/.exec(quickEdit)?.[1] ?? "";
  assert(politicaQE.length > 0, "no se pudo leer la política de 12.2C");
  assert(tokens(REVIEW_POLICY) > tokens(politicaQE),
    "la política de revisión no es mayor que la de redacción, lo cual sorprende");
  console.log(`      12.2C ${tokens(politicaQE)} · 12.2D ${tokens(REVIEW_POLICY)}`);
});

check("E2. pero no tanto como para acercarse al Copilot", () => {
  assert(FIJO < COPILOT_REFERENCE.fixedOverhead * 0.7,
    `el fijo (${FIJO}) está demasiado cerca del Copilot`);
});

console.log(`\n${passed} conformes · ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
