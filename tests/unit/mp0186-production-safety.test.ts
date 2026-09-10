import { readFileSync, readdirSync } from "node:fs";

/**
 * Trazaloop · 0186 · Que esta migración se pueda aplicar sobre Producción.
 *
 * POR QUÉ EXISTE ESTA SUITE
 *
 * Producción dejó de estar vacía el 7 de septiembre de 2026: tiene
 * organizaciones y personas reales. Desde ese día una migración ya no es
 * gratis, y «aditiva» dejó de ser una intención para pasar a ser algo que hay
 * que poder comprobar antes de aplicar nada.
 *
 * Se mira el SQL con los comentarios quitados. La lección es de PE-05: una
 * guarda que lee la prosa se dispara con un comentario que EXPLICA lo que no se
 * hace, y una guarda que miente es peor que ninguna.
 *
 * Correr: npm run test:mp0186-safety
 */

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const ARCHIVO = "0186_billing_provider_reconciliation.sql";
const RUTA = `supabase/migrations/${ARCHIVO}`;
const crudo = readFileSync(RUTA, "utf8");

/** El SQL sin comentarios de línea ni de bloque, en minúsculas. */
const sql = crudo
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").map((l) => l.replace(/--.*$/, "")).join("\n")
  .toLowerCase();

/**
 * LO QUE SE EJECUTA AL APLICAR LA MIGRACIÓN, que no es lo mismo que lo que hay
 * escrito en el fichero.
 *
 * Dentro de un `$$ … $$` no hay órdenes: hay el CUERPO de una función, que se
 * guarda como texto y se ejecuta más tarde, en tiempo de producto y con sus
 * propias comprobaciones. Un `insert` ahí dentro no toca ni una fila al migrar.
 *
 * La primera versión de esta suite no distinguía las dos cosas y acusaba a la
 * migración de borrar periodos, cuando lo que hace es guardar una función que
 * puede borrar el periodo que ella misma acaba de crear si el cobro no cuadra.
 * Confundirlas habría obligado a debilitar la guarda hasta dejarla inútil.
 */
const sqlAplicacion = sql.replace(/\$\$[\s\S]*?\$\$/g, " ");

console.log("\n0186 · seguridad de Producción\n");

// ===========================================================================
console.log("A · Está donde tiene que estar");
// ===========================================================================

check("1. Existe una sola 0186 y nada anterior la pisa", () => {
  // ANTES exigía que 0186 fuera la ÚLTIMA del repositorio. Eso es una
  // fotografía, y es exactamente la trampa en la que ya cayó PE-03B5: la
  // primera migración posterior —0187— la puso en rojo sin que nada de 0186
  // hubiera cambiado. Lo que sí sigue siendo promesa es que hay una y solo una,
  // que es la que esta suite audita, y que ninguna posterior la reescribe.
  const todas = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  assert(todas.filter((f) => f.startsWith("0186")).length === 1,
    "hay más de una migración 0186");
  assert(todas.includes(ARCHIVO), `desapareció ${ARCHIVO}`);
  const posteriores = todas.filter((f) => f.slice(0, 4) > "0186");
  const pisan = posteriores.filter((f) =>
    /billing_provider_cycles|billing_reconcile_provider_cycle|billing_provider_cycle_sequence/
      .test(readFileSync(`supabase/migrations/${f}`, "utf8")));
  assert(pisan.length === 0,
    `una migración posterior toca lo que 0186 protege: ${pisan.join(", ")}`);
});

check("2. Declara qué presupone y aborta si no se cumple", () => {
  assert(/raise exception '0186 presupone/.test(sql),
    "no aborta si se aplica fuera de orden");
  for (const previa of ["billing_subscription_periods", "billing_provider_capabilities",
                        "billing_provider_plans", "billing_checkout_intents"]) {
    assert(sql.includes(`to_regclass('public.${previa}')`),
      `no comprueba que exista ${previa}`);
  }
});

// ===========================================================================
console.log("\nB · No toca a nadie que ya esté dentro");
// ===========================================================================

const INTOCABLES = ["organizations", "memberships", "organization_plan_assignments",
                    "organization_modules", "profiles", "plans", "plan_revisions"];

check("3. No borra ni una fila de las tablas de inquilino", () => {
  for (const t of INTOCABLES) {
    assert(!new RegExp(`delete\\s+from\\s+(public\\.)?${t}\\b`).test(sql),
      `borra de ${t}`);
    assert(!new RegExp(`truncate\\s+(table\\s+)?(public\\.)?${t}\\b`).test(sql),
      `trunca ${t}`);
    assert(!new RegExp(`delete\\s+from\\s+(public\\.)?${t}\\b`).test(sqlAplicacion),
      `borra de ${t} al aplicar`);
  }
});

check("4. Ni las modifica", () => {
  for (const t of INTOCABLES) {
    assert(!new RegExp(`update\\s+(public\\.)?${t}\\s+set`).test(sql),
      `escribe en ${t}`);
  }
});

check("5. No toca el esquema de autenticación", () => {
  assert(!/\bauth\.users\b/.test(sql), "toca auth.users");
  assert(!/\balter\s+table\s+auth\./.test(sql), "altera una tabla de auth");
});

check("6. No reescribe historia financiera existente", () => {
  // Las tablas de dinero que ya tienen filas en Producción. Un UPDATE masivo
  // aquí sería reescribir lo que alguien ya pagó.
  for (const t of ["billing_payments", "billing_quotes", "billing_subscription_periods",
                   "billing_provider_plans", "billing_subscriptions"]) {
    assert(!new RegExp(`update\\s+(public\\.)?${t}\\s+set`).test(sqlAplicacion),
      `la migración escribe en ${t}`);
    assert(!new RegExp(`delete\\s+from\\s+(public\\.)?${t}\\b`).test(sqlAplicacion),
      `la migración borra de ${t}`);
  }
});

check("7. Y no crea registros de cobro para nadie", () => {
  // Ni una sola inserción al aplicar: 0186 crea forma, no hechos.
  assert(!/\binsert\s+into\b/.test(sqlAplicacion),
    "la migración inserta filas al aplicarse");
});

// ===========================================================================
console.log("\nC · Aditiva de verdad");
// ===========================================================================

check("8. No destruye nada del esquema", () => {
  for (const verbo of [/drop\s+table/, /drop\s+column/, /drop\s+schema/,
                       /alter\s+column[^\n]*drop\s+not\s+null/]) {
    assert(!verbo.test(sql), `contiene ${verbo}`);
  }
  // El único DROP admitido es el del disparador propio, justo antes de
  // recrearlo: hace la migración repetible sin tocar nada ajeno.
  const drops = sql.match(/drop\s+[a-z]+/g) ?? [];
  assert(drops.every((d) => d.startsWith("drop trigger")),
    `hay DROP que no son del disparador propio: ${drops.join(", ")}`);
});

check("9. Ninguna columna nueva es obligatoria ni trae valor por omisión", () => {
  const añadidas = crudo.match(/add\s+column\s+if\s+not\s+exists[^\n;]*/gi) ?? [];
  assert(añadidas.length >= 1, "no añade ninguna columna: ¿cambió el diseño?");
  for (const a of añadidas) {
    assert(!/not\s+null/i.test(a), `columna obligatoria sobre una tabla viva: ${a}`);
    assert(!/\bdefault\b/i.test(a), `columna con valor por omisión sobre una tabla viva: ${a}`);
  }
  assert(!/set\s+not\s+null/.test(sql), "impone NOT NULL sobre una columna existente");
});

check("10. Los índices únicos nuevos son PARCIALES donde hay nulos", () => {
  // Un único total sobre `provider_subscription_id` habría chocado con todas
  // las suscripciones que aún no lo tienen.
  const i = sql.indexOf("billing_subscriptions_provider_uniq");
  assert(i > 0, "no está el índice de identidad de la suscripción");
  const bloque = sql.slice(i, i + 300);
  assert(/where\s+provider_subscription_id\s+is\s+not\s+null/.test(bloque),
    "el índice de la suscripción no es parcial: rompería con las filas a nulo");
});

// ===========================================================================
console.log("\nD · Seguridad de lo nuevo");
// ===========================================================================

check("11. La tabla nueva le quita los privilegios a `service_role`", () => {
  // Postgres se los concede por omisión sobre cada tabla nueva. Es la lección
  // de 0184: la RLS no aplica a ese rol, los privilegios sí.
  assert(/revoke\s+all\s+on\s+public\.billing_provider_cycles\s+from[^\n;]*service_role/
    .test(sql), "no se le quitan los privilegios a service_role sobre los ciclos");
  assert(/alter\s+table\s+public\.billing_provider_cycles\s+enable\s+row\s+level\s+security/
    .test(sql), "la tabla nueva no tiene RLS activada");
});

check("12. La vista de observación es de solo lectura", () => {
  // Una vista simple sobre una tabla es AUTO-ACTUALIZABLE y hereda
  // insert/update/delete. Hay que quitárselos a mano.
  assert(/revoke\s+all\s+on\s+public\.v_billing_provider_cycles/.test(sql),
    "la vista no revoca sus privilegios heredados");
  assert(/grant\s+select\s+on\s+public\.v_billing_provider_cycles/.test(sql),
    "la vista no concede lectura explícita");
  assert(!/grant\s+(insert|update|delete|all)\s+on\s+public\.v_billing_provider_cycles/
    .test(sql), "la vista concede escritura");
});

check("13. La vista filtra por dentro · no se apoya en la RLS de quien llama", () => {
  const i = sql.indexOf("create or replace view public.v_billing_provider_cycles");
  assert(i > 0, "no está la vista");
  const bloque = sql.slice(i, sql.indexOf(";", i));
  assert(bloque.includes("is_platform_staff()"),
    "la vista no filtra por personal de plataforma dentro de su propio cuerpo");
});

check("14. Toda función nueva fija su `search_path`", () => {
  const funciones = crudo.split(/create\s+or\s+replace\s+function/i).slice(1);
  assert(funciones.length >= 3, `esperaba al menos 3 funciones y hay ${funciones.length}`);
  for (const f of funciones) {
    const cabecera = f.slice(0, f.search(/\bas\s+\$\$/));
    const nombre = (f.match(/public\.([a-z_0-9]+)/) ?? [])[1] ?? "(sin nombre)";
    assert(/set\s+search_path\s+to\s+'public'/i.test(cabecera),
      `${nombre} no fija search_path`);
  }
});

check("15. La primitiva de reconciliación solo la ejecuta `service_role`", () => {
  assert(/revoke\s+all\s+on\s+function\s+public\.billing_reconcile_provider_cycle[\s\S]{0,200}?from\s+public,\s*anon,\s*authenticated/
    .test(sql), "no se le quita la ejecución a anon/authenticated");
  assert(/grant\s+execute\s+on\s+function\s+public\.billing_reconcile_provider_cycle[\s\S]{0,200}?to\s+service_role/
    .test(sql), "no se le concede la ejecución a service_role");
});

// ===========================================================================
console.log("\nE · No cobra");
// ===========================================================================

check("16. La reconciliación no llama a nada que cobre ni que programe un cobro", () => {
  for (const prohibido of ["billing_open_next_period", "billing_claim_renewal_attempt",
                           "billing_register_payment_method", "billing_open_checkout_intent",
                           "billing_open_upgrade_intent", "billing_due_renewals"]) {
    assert(!sql.includes(prohibido),
      `0186 usa ${prohibido}: eso es cobrar o programar un cobro`);
  }
});

check("17. Y no escribe el nombre de ningún proveedor en el SQL", () => {
  // La política de quién lleva la recurrencia vive en el catálogo de 0184. Si
  // aquí apareciera «mercadopago», mañana habría dos verdades.
  for (const nombre of ["mercadopago", "wompi", "preapproval"]) {
    const cuerpo = sql.slice(sql.indexOf("create or replace function public.billing_reconcile_provider_cycle"));
    assert(!cuerpo.includes(nombre),
      `la primitiva nombra a «${nombre}»: la política es del catálogo, no del código`);
  }
});

console.log(`\n0186 · seguridad de Producción: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
