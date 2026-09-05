/**
 * Trazaloop · PE-05B5F · El contrato del cobro automático, entero y en un sitio.
 *
 * Las suites de B5B a B5E prueban cada pieza ejecutándola contra la base. Esta
 * no repite ese trabajo: comprueba que el CONTRATO sigue escrito donde tiene
 * que estar, y falla el día que alguien lo cambie sin darse cuenta.
 *
 * Es la que se lee cuando alguien pregunta «¿qué garantiza este motor?».
 *
 * Correr: npm run test:pe05b5f-contract
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(--|\/\/).*$/gm, "");

const MIGRACIONES = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql")).sort()
  .map((f) => leer(`supabase/migrations/${f}`)).join("\n");
const SQL = sinComentarios(MIGRACIONES);
const ORQ = sinComentarios(leer("lib/billing/renewal/orchestrator.ts"));
const RUTA = sinComentarios(leer("app/api/billing/renewals/run/route.ts"));

/**
 * El cuerpo de la última DEFINICIÓN de una función: la que manda hoy.
 *
 * Buscar el nombre a secas no vale: aparece también en los `revoke`, los
 * `grant` y los `comment on`, que suelen ir DESPUÉS. Hay que anclar en
 * `create or replace`.
 */
function ultimaDefinicion(nombre: string): string {
  const i = SQL.lastIndexOf(`create or replace function public.${nombre}(`);
  assert(i > 0, `no existe una definición de ${nombre}`);
  const fin = SQL.indexOf("\n$$;", i);
  return SQL.slice(i, fin > 0 ? fin : SQL.length);
}

console.log("\nPE-05B5F · El contrato del cobro automático\n");

// ===========================================================================
console.log("A · El calendario");
// ===========================================================================

check("El periodo se calcula desde el ANCLA, nunca sumando al anterior", () => {
  const f = ultimaDefinicion("billing_period_bounds");
  assert(/p_sequence - 1/.test(f), "ya no calcula desde el ancla");
  assert(!/now\(\)/.test(f), "el calendario mira el reloj");
});

check("Los cuatro huecos son 0, 24, 72 y 144 horas · y la gracia 168", () => {
  const f = ultimaDefinicion("billing_renewal_slot_at");
  for (const h of ["144 hours", "72 hours", "24 hours"]) {
    assert(f.includes(h), `falta el hueco de ${h}`);
  }
  const g = ultimaDefinicion("billing_renewal_grace_end");
  assert(/168 hours/.test(g), "la gracia dejó de ser de 168 horas");
});

check("El vencimiento es el PRINCIPIO de la obligación que hay que pagar", () => {
  const f = ultimaDefinicion("billing_due_renewals");
  assert(/when u\.status = 'open' then u\.period_start else u\.period_end end as due_at/
    .test(f), "un mes impagado volvió a vencer al terminar");
  const l = ultimaDefinicion("billing_lapse_subscription");
  assert(/billing_renewal_grace_end\(v_ultimo\.period_start\)/.test(l),
    "la gracia se mide desde el final del mes impagado");
});

// ===========================================================================
console.log("\nB · Qué gasta un cobro");
// ===========================================================================

check("Solo cuenta lo que cruzó la frontera del envío", () => {
  const f = ultimaDefinicion("billing_due_renewals");
  const g = f.slice(f.indexOf("gastados as ("), f.indexOf("decidido as ("));
  assert(/provider_submitted_at is not null/.test(g),
    "vuelve a contar intentos creados como cobros");
  assert(/i\.provider_submitted_at\)\) as ultimo_hueco/.test(g),
    "el hueco se mide por cuándo se creó el intento, no por cuándo se envió");
});

check("Un intento que no salió se retoma · y no bloquea", () => {
  const f = ultimaDefinicion("billing_due_renewals");
  const v = f.slice(f.indexOf("en_vuelo as ("), f.indexOf("gastados as ("));
  assert(/provider_submitted_at is not null/.test(v),
    "un intento sin enviar vuelve a atascar el mes");
  assert(/aMedias/.test(sinComentarios(leer("lib/db/billing-renewal.ts"))),
    "el orquestador ya no retoma el intento a medias");
});

check("Como mucho cuatro cobros, y uno solo en vuelo", () => {
  const f = ultimaDefinicion("billing_due_renewals");
  assert(/coalesce\(g\.enviados, 0\) < 4/.test(f), "desapareció el tope de cuatro");
  assert(SQL.includes("bci_period_inflight_uniq"),
    "desapareció el índice de un solo cobro en vuelo");
});

check("Y el turno de enviar lo gana uno solo", () => {
  const f = ultimaDefinicion("billing_claim_renewal_attempt");
  assert(/where id = v_int\.id and provider_submitted_at is null/.test(f),
    "el turno ya no es una comparación-y-cambio: dos podrían enviar");
  assert(/claimProviderSubmission/.test(ORQ), "el orquestador no toma turno");
});

// ===========================================================================
console.log("\nC · Cuando no se sabe");
// ===========================================================================

check("La duda y el descuadre bloquean cobrar Y caducar", () => {
  const f = ultimaDefinicion("billing_has_unresolved_charge");
  assert(/provider_unknown/.test(f) && /integrity_mismatch/.test(f),
    "alguna de las dos dudas dejó de bloquear");
  const l = ultimaDefinicion("billing_lapse_subscription");
  assert(/billing_has_unresolved_charge/.test(l),
    "la caducidad ya no consulta si hay dinero en duda");
  const d = ultimaDefinicion("billing_due_renewals");
  const i = d.indexOf("'manual_review_required'");
  const j = d.indexOf("'lapse_due'");
  assert(i > 0 && j > i, "la caducidad manda sobre la duda: se cae con dinero en el aire");
});

check("Sin medio de pago no se cobra · pero se acaba cayendo", () => {
  const d = ultimaDefinicion("billing_due_renewals");
  const i = d.indexOf("'lapse_due'");
  const j = d.indexOf("'payment_method_unavailable'");
  assert(i > 0 && j > i,
    "no tener tarjeta se convirtió en un salvoconducto para no caducar");
});

// ===========================================================================
console.log("\nD · Quién activa el derecho");
// ===========================================================================

check("El POST al proveedor NO liquida nada", () => {
  for (const p of ["billing_settle_period_payment", "billing_settle_payment",
                   "commercial_apply_assignment", "organization_modules"]) {
    assert(!ORQ.includes(p), `el orquestador liquida o concede por su cuenta: ${p}`);
  }
  assert(/submitted/.test(ORQ), "el orquestador ya no distingue enviado de cobrado");
});

check("Una obligación se salda UNA vez", () => {
  const f = ultimaDefinicion("billing_settle_period_payment");
  assert(/for update/.test(f), "desapareció el candado sobre la obligación");
  assert(/period_already_settled/.test(f), "un segundo cobro vuelve a avanzar el derecho");
  assert(/manual_review/.test(f), "el dinero de más deja de anotarse");
});

check("Renovar NO consulta el tipo de cambio", () => {
  const f = ultimaDefinicion("billing_period_charge_total");
  assert(!/billing_resolve_fx/.test(f), "la renovación volvió a mirar el cambio");
  assert(/v_per\.period_start/.test(f),
    "el impuesto ya no se resuelve a la fecha de la obligación");
});

// ===========================================================================
console.log("\nE · Los tres finales, que no son el mismo");
// ===========================================================================

check("Caducar, cancelar y retirar tienen estado propio", () => {
  for (const e of ["'lapsed'", "'cancelled'", "'retired'"]) {
    assert(SQL.includes(e), `desapareció el estado ${e}`);
  }
  for (const f of ["billing_lapse_subscription", "billing_cancel_at_period_end",
                   "billing_retire_subscription"]) {
    assert(SQL.includes(`function public.${f}(`), `desapareció ${f}`);
  }
});

check("Ninguno concede Free: el suelo ya está debajo", () => {
  const f = ultimaDefinicion("commercial_end_paid_assignments");
  assert(/grant_kind = 'sold'/.test(f), "cierra concesiones que no debería");
  assert(!/insert into public\.organization_plan_assignments/.test(f),
    "concede un Free nuevo en vez de descubrir el permanente");
});

check("Y ningún camino de producto puede RETIRAR una suscripción", () => {
  const producto = ["server/actions/billing.ts", "server/actions/commercial-console.ts",
                    "app/(app)/(shell)/settings/billing/page.tsx",
                    "components/domain/billing/plan-decisions.tsx"];
  for (const f of producto) {
    assert(!leer(f).includes("billing_retire_subscription"),
      `${f} alcanza el retiro administrativo`);
  }
  const f = ultimaDefinicion("billing_retire_subscription");
  assert(/qa_fixture_retirement/.test(f) && /administrative_correction/.test(f),
    "el motivo del retiro dejó de estar acotado");
});

// ===========================================================================
console.log("\nF · La puerta, y lo que hoy está apagado");
// ===========================================================================

check("Cobrar de verdad sigue exigiendo cuatro llaves", () => {
  assert(/BILLING_RENEWAL_EXECUTION_ENABLED === "true"/.test(RUTA), "falta el interruptor");
  assert(/BILLING_RENEWAL_EXECUTE_SECRET/.test(RUTA), "falta el secreto de ejecución");
  assert(/listaBlanca\.length > 0/.test(RUTA), "falta la lista blanca");
  assert(/VERCEL_ENV === "production"/.test(RUTA), "no se cierra en Producción");
  assert(/dryRun: !ejecutar/.test(RUTA), "no cae en seco cuando no se ejecuta");
});

check("Y no hay ningún planificador configurado en el repositorio", () => {
  for (const f of ["vercel.json", "vercel.ts"]) {
    assert(!existsSync(f), `apareció ${f}: un cron ahí alcanza a Producción`);
  }
  assert(!existsSync(".github/workflows"), "apareció un disparador programado");
  assert(!/pg_cron|cron\.schedule/.test(SQL), "apareció pg_cron");
});

// ===========================================================================
console.log("\nG · Lo que ve cada quien");
// ===========================================================================

check("Al cliente no se le enseña vocabulario interno", () => {
  const pagina = leer("app/(app)/(shell)/settings/billing/page.tsx");
  assert(/describeBillingState/.test(pagina), "la pantalla no traduce el estado");
  assert(!/\{estado\.status\}/.test(pagina), "enseña el estado interno");
  const copia = sinComentarios(leer("lib/domain/billing-state.ts"));
  for (const p of [/past_due/, /provider_unknown/, /integrity_mismatch/, /failure_class/]) {
    const textos = copia.match(/title: "[^"]*"|detail: "[^"]*"/g) ?? [];
    for (const t of textos) assert(!p.test(t), `el cliente lee ${p}: ${t}`);
  }
});

check("Y a quien opera SÍ · con el código canónico detrás", () => {
  const ops = sinComentarios(leer("components/domain/platform/renewal-operations.tsx"));
  assert(/estado\.code/.test(ops), "quien investiga no puede ver el código canónico");
  assert(/estado\.label/.test(ops), "solo se enseña el código, sin frase legible");
  // Y ni un botón que mueva dinero.
  for (const p of ["retryNow", "reintentar", "forzar", "settle", "lapse("]) {
    assert(!ops.includes(p), `la consola de operación mueve dinero: ${p}`);
  }
});

console.log(`\nPE-05B5F · contrato: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
