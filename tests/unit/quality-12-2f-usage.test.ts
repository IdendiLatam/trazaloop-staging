/**
 * Trazaloop · QUALITY-12.2F · La capa de consumo, leyendo el código.
 *
 * Lo que se comprueba aquí, antes de que nadie ejecute nada:
 *
 *   · que NO se ha creado un segundo registro de tokens;
 *   · que el derecho se comprueba antes que el presupuesto;
 *   · que Full y Extra reciben exactamente lo mismo;
 *   · que ninguna vista de consumo lee la pregunta ni la respuesta;
 *   · que el dinero no llega a la pantalla de una empresa.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SCENARIOS, USD } from "../../lib/domain/intelligence-cost";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const strip = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  .replace(/^\s*--.*$/gm, "");
const flat = (s: string) => s.replace(/\s+/g, " ");

const MIG = read("supabase/migrations/0140_intelligence_usage_and_cost.sql");
const DB = read("lib/db/intelligence-usage.ts");
const COSTE = read("lib/domain/intelligence-cost.ts");
const TARJETA = read("components/domain/settings/intelligence-usage-card.tsx");
const CONSOLA = read("app/(app)/platform/intelligence/page.tsx");

console.log("\nQUALITY-12.2F · consumo, límites y coste\n");

// ===========================================================================
console.log("A · UNA SOLA VERDAD, NO DOS");
// ===========================================================================

check("A1. no se crea un segundo registro de tokens", () => {
  // `quality_ai_runs` ya guarda la verdad del proveedor desde 0132. Un segundo
  // libro solo puede desincronizarse, y el día que discrepen habrá que decidir
  // cuál miente.
  const tablas = [...MIG.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  for (const t of tablas) {
    assert(!/usage_ledger|token_ledger|_usage_events|_token_log/.test(t),
      `${t} parece un segundo registro de consumo`);
  }
  assert(!/input_tokens\s+integer/.test(
    MIG.split("create table if not exists public.intelligence_usage_limits")[0]
       .split("create table if not exists public.intelligence_model_pricing")[1] ?? ""),
    "la tabla de tarifas guarda tokens");
});

check("A2. las vistas DERIVAN de los runs, no de contadores mutables", () => {
  const vistas = [...MIG.matchAll(/create or replace view public\.(v_intelligence\w+)[\s\S]*?;/g)];
  assert(vistas.length >= 4, `solo ${vistas.length} vistas de consumo`);
  for (const [sql, nombre] of vistas.map((m) => [m[0], m[1]] as const)) {
    assert(/from public\.quality_ai_runs/.test(sql),
      `${nombre} no sale de quality_ai_runs`);
  }
});

check("A3. y por tanto no hay contadores que reconciliar", () => {
  assert(!/update .*set .*runs_count|counter\s*=\s*counter/i.test(strip(MIG)),
    "hay un contador mutable que puede desincronizarse");
});

// ===========================================================================
console.log("\nB · EL DERECHO, ANTES QUE EL PRESUPUESTO");
// ===========================================================================

check("B1. Demo se deniega antes de mirar el presupuesto", () => {
  for (const fn of ["document_authoring_start_run", "document_review_start_run"]) {
    const cuerpo = new RegExp(
      `create or replace function public\\.${fn}[\\s\\S]*?\\$\\$;`).exec(MIG)?.[0] ?? "";
    assert(cuerpo.length > 0, `no se encontró ${fn}`);
    const demo = cuerpo.indexOf("'demo'");
    const guard = cuerpo.indexOf("intelligence_usage_guard");
    assert(demo > 0 && guard > demo,
      `en ${fn} el presupuesto se mira antes que el plan`);
  }
});

check("B2. tener presupuesto NO da acceso", () => {
  // §19 · Una empresa en Demo con cero consumo sigue sin acceso. El
  // presupuesto solo puede quitar, nunca dar.
  const guard = /create or replace function public\.intelligence_usage_guard[\s\S]*?\$\$;/
    .exec(MIG)?.[0] ?? "";
  assert(!/resolve_organization_module_access|access_mode/.test(guard),
    "el guardián evalúa el plan: eso lo hace la puerta, no el presupuesto");
});

// ===========================================================================
console.log("\nC · FULL Y EXTRA, IGUALES");
// ===========================================================================

check("C1. los límites no dependen del plan", () => {
  const limites = /create table if not exists public\.intelligence_usage_limits[\s\S]*?\);/
    .exec(MIG)?.[0] ?? "";
  assert(!/full|extra|plan|subscription/i.test(strip(limites)),
    "la tabla de límites conoce el plan comercial");
  const efectivos = /create or replace function public\.intelligence_effective_limits[\s\S]*?\$\$;/
    .exec(MIG)?.[0] ?? "";
  assert(!/full|extra/i.test(efectivos),
    "los límites efectivos se derivan del plan");
});

check("C2. no se ha inventado un plan de IA", () => {
  // Se buscan MECANISMOS, no palabras: la migración explica en su texto que
  // esto NO son créditos, y una comprobación que mire la palabra suelta
  // castigaría justo la frase que aclara la decisión.
  const identificadores = [...strip(MIG).matchAll(/create table if not exists public\.(\w+)/g)]
    .map((m) => m[1])
    .concat([...strip(MIG).matchAll(/^\s{2}(\w+)\s+(integer|text|numeric|boolean)/gm)]
      .map((m) => m[1]));
  for (const id of identificadores) {
    assert(!/credit|plan_code|tier|package/i.test(id),
      `hay un mecanismo comercial nuevo: ${id}`);
  }
  for (const visible of [/AI Plan/i, /Intelligence Plus/i, /Premium AI/i,
                         /paquete de tokens/i, /compra .*créditos/i]) {
    assert(!visible.test(strip(TARJETA)), `la pantalla ofrece ${visible}`);
  }
});

// ===========================================================================
console.log("\nD · LOS LÍMITES NO SE MIDEN EN DINERO");
// ===========================================================================

check("D1. el guardián decide con operaciones, no con dólares", () => {
  const guard = /create or replace function public\.intelligence_usage_guard[\s\S]*?\$\$;/
    .exec(MIG)?.[0] ?? "";
  assert(!/usd|cost|precio|price/i.test(strip(guard)),
    "la autorización depende del dinero: una subida de tarifa apagaría Intelligence");
  for (const v of ["runs_per_minute", "runs_per_hour", "runs_per_month", "max_concurrent"]) {
    assert(guard.includes(v), `el guardián no comprueba ${v}`);
  }
});

check("D2. tres ventanas separadas, cada una para algo distinto", () => {
  const guard = /create or replace function public\.intelligence_usage_guard[\s\S]*?\$\$;/
    .exec(MIG)?.[0] ?? "";
  for (const r of ["rate_limited_minute", "rate_limited_hour", "too_many_concurrent",
                   "monthly_cap"]) {
    assert(guard.includes(r), `falta el motivo ${r}`);
  }
});

check("D3. la concurrencia se resuelve sin bloqueos permanentes", () => {
  const guard = /create or replace function public\.intelligence_usage_guard[\s\S]*?\$\$;/
    .exec(MIG)?.[0] ?? "";
  assert(/pg_advisory_xact_lock/.test(guard),
    "no se serializa por empresa: cincuenta peticiones leerían el mismo recuento");
  // Por transacción: se suelta solo aunque el proceso muera.
  assert(!/pg_advisory_lock\(/.test(guard),
    "usa un bloqueo de sesión, que puede quedarse colgado");
  assert(/status = 'running'[\s\S]{0,120}interval '10 minutes'/.test(guard),
    "las operaciones en vuelo no caducan: un proceso muerto bloquearía la empresa");
});

check("D4. el mes se calcula en UTC, no en la zona del navegador", () => {
  assert(/date_trunc\('month', now\(\) at time zone 'UTC'\)/.test(MIG),
    "la ventana mensual no fija zona horaria");
  assert(!/timezone\(.*browser|client_tz/i.test(MIG), "depende del cliente");
});

// ===========================================================================
console.log("\nE · LA TARIFA Y LA VERDAD HISTÓRICA");
// ===========================================================================

check("E1. la tarifa está versionada en el tiempo", () => {
  assert(/effective_from\s+timestamptz not null/.test(MIG), "la tarifa no tiene vigencia");
  assert(/effective_to\s+timestamptz/.test(MIG), "la tarifa no se puede cerrar");
  assert(/intelligence_pricing_vigente_uniq/.test(MIG),
    "puede haber dos tarifas vigentes a la vez");
});

check("E2. una tarifa vigente no se puede reescribir", () => {
  assert(/Una tarifa no se edita/.test(MIG), "no hay barrera de inmutabilidad");
  assert(/t_intelligence_pricing_immutable/.test(MIG), "la barrera no está conectada");
});

check("E3. el coste se calcula con la tarifa DE SU MOMENTO", () => {
  const fn = /create or replace function public\.intelligence_run_cost_usd[\s\S]*?\$\$;/
    .exec(MIG)?.[0] ?? "";
  assert(/effective_from <= p_at/.test(fn) && /effective_to is null or pr\.effective_to > p_at/.test(fn),
    "el coste usa la tarifa de hoy para un run de ayer");
});

check("E4. sin tarifa devuelve nulo, no cero", () => {
  // Cero diría «no costó nada»; la verdad es «no lo sabemos».
  assert(/Devuelve null si no hay tarifa/.test(MIG),
    "no está documentado el caso sin tarifa");
});

check("E5. el dinero no se guarda en coma flotante", () => {
  assert(/numeric\(14, 6\)/.test(MIG), "las tarifas no usan numeric");
  assert(!/float|double precision|real\b/.test(
    /create table if not exists public\.intelligence_model_pricing[\s\S]*?\);/.exec(MIG)?.[0] ?? ""),
    "hay coma flotante en la tabla de tarifas");
  assert(/Microdollars/.test(COSTE), "el lado de TypeScript no declara su unidad");
  assert(USD === 1_000_000, "la unidad de microdólares cambió");
});

// ===========================================================================
console.log("\nF · PRIVACIDAD");
// ===========================================================================

check("F1. ninguna vista de consumo lee la pregunta ni la respuesta", () => {
  const vistas = [...MIG.matchAll(/create or replace view public\.v_intelligence\w+[\s\S]*?;/g)]
    .map((m) => m[0]);
  assert(vistas.length >= 4, "no se encontraron las vistas");
  for (const v of vistas) {
    for (const col of ["r.question", "r.answer", "question,", "answer,"]) {
      assert(!v.includes(col), `una vista de consumo expone ${col}`);
    }
  }
});

check("F2. la capa de lectura tampoco los pide", () => {
  assert(!/\bquestion\b|\banswer\b/.test(strip(DB)),
    "la capa de lectura pide el contenido para calcular consumo");
});

check("F3. y la consola de plataforma no enseña texto de nadie", () => {
  assert(!/question|answer|userText|prompt/i.test(strip(CONSOLA).replace(/prompt/gi, "")),
    "la consola enseña contenido");
});

// ===========================================================================
console.log("\nG · LO QUE VE UNA EMPRESA");
// ===========================================================================

check("G1. su pantalla NO enseña dinero", () => {
  // Una empresa compra Trazaloop, no tokens de un proveedor.
  // Se busca DINERO, no el símbolo `$`, que en JSX aparece en cada
  // interpolación de plantilla.
  for (const señal of [/\bUSD\b/, /formatUsd/, /costMicros/, /toUsd/,
                       /\$\d/, /coste/i, /precio/i, /dólar/i]) {
    assert(!señal.test(strip(TARJETA)), `la tarjeta de la empresa enseña dinero: ${señal}`);
  }
});

check("G2. ni tokens crudos", () => {
  assert(!/token/i.test(strip(TARJETA)), "la tarjeta enseña tokens");
  assert(/operaciones/.test(TARJETA), "la tarjeta no cuenta en operaciones");
});

check("G3. dice que el límite es técnico, no comercial", () => {
  assert(/límite técnico de seguridad/.test(TARJETA),
    "la tarjeta presenta el tope como una cuota comercial");
});

check("G4. y la barra es accesible", () => {
  assert(/role="progressbar"/.test(TARJETA), "la barra no se anuncia");
  assert(/aria-valuenow/.test(TARJETA) && /aria-label/.test(TARJETA),
    "la barra no tiene valor ni nombre accesible");
});

// ===========================================================================
console.log("\nH · LA CONSOLA DE PLATAFORMA");
// ===========================================================================

check("H1. separa OBSERVADO de PREVISIÓN", () => {
  assert(/Observado · por empresa/.test(CONSOLA), "falta el bloque observado");
  assert(/Previsión · lo que costaría, no lo que costó/.test(CONSOLA),
    "la previsión no se distingue del consumo");
  assert(/No es\s*\n?\s*consumo real/.test(flat(CONSOLA).replace(/\s+/g, " "))
    || /No es consumo real/.test(flat(CONSOLA)),
    "la previsión no advierte de que no es consumo");
});

check("H2. sirve para lo que existe: detectar al que consume de más", () => {
  assert(/media \* 5/.test(CONSOLA), "no se marca la empresa anómala");
});

check("H3. distingue empresas de personas simultáneas", () => {
  assert(/no personas usándolo a la vez/.test(flat(CONSOLA)),
    "la tabla de flota se puede leer como usuarios concurrentes");
});

check("H4. exige personal de plataforma", () => {
  assert(/requirePlatformStaff/.test(CONSOLA), "la consola no está protegida");
  const vista = /create or replace view public\.v_intelligence_usage_platform[\s\S]*?;/
    .exec(MIG)?.[0] ?? "";
  assert(/where is_platform_staff\(\)/.test(vista),
    "la vista de plataforma no filtra por rol: security_invoker no basta aquí");
});

// ===========================================================================
console.log("\nI · EXCEPCIONES Y AUDITORÍA");
// ===========================================================================

check("I1. una excepción exige motivo", () => {
  assert(/reason\s+text not null check \(length\(btrim\(reason\)\) >= 10\)/.test(MIG),
    "se puede crear una excepción sin explicar por qué");
});

check("I2. y deja rastro de quién y cuándo", () => {
  const t = /create table if not exists public\.intelligence_limit_overrides[\s\S]*?\);/
    .exec(MIG)?.[0] ?? "";
  for (const c of ["created_by", "created_at", "effective_from", "expires_at",
                   "revoked_at", "revoked_by"]) {
    assert(t.includes(c), `la excepción no registra ${c}`);
  }
});

check("I3. verla y cambiarla son cosas distintas", () => {
  // §40 · Si un administrador pudiera subirse su propio techo, no sería un techo.
  assert(/create policy intelligence_limits_select[\s\S]*?is_org_member/.test(MIG),
    "una empresa no puede ver sus propios límites");
  assert(/create policy intelligence_limits_write[\s\S]*?is_platform_superadmin/.test(MIG),
    "cualquiera puede cambiar los límites");
  assert(/create policy intelligence_override_write[\s\S]*?is_platform_superadmin/.test(MIG),
    "cualquiera puede crearse una excepción");
});

// ===========================================================================
console.log("\nJ · LOS AVISOS REUSAN EL BUS QUE YA EXISTE");
// ===========================================================================

check("J1. se emite en work_events, no en un bus nuevo", () => {
  assert(/insert into work_events/.test(MIG), "no se usa el bus existente");
  assert(!/create table if not exists public\.\w*alert|_notifications/.test(MIG),
    "se creó un segundo sistema de avisos");
  assert(/'ai'/.test(MIG), "el evento no se marca como del dominio de IA");
});

check("J2. un aviso por empresa y mes, no uno por operación", () => {
  assert(/dedupe_key/.test(MIG), "no hay deduplicación de avisos");
  assert(/on conflict do nothing/.test(MIG), "el mismo aviso se repetiría");
});

check("J3. un aviso que falla no tumba la operación", () => {
  const fn = /create or replace function public\.intelligence_emit_usage_event[\s\S]*?\$\$;/
    .exec(MIG)?.[0] ?? "";
  assert(/exception[\s\S]*?when others then null/.test(fn),
    "si el aviso falla, se cae la operación que lo provocó");
});

// ===========================================================================
console.log("\nK · LOS NÚMEROS ESTÁN JUSTIFICADOS");
// ===========================================================================

check("K1. los topes por defecto se explican, no se eligen a ojo", () => {
  assert(/350 secciones|350 secciones documentales/.test(MIG),
    "el techo mensual no se deriva de un escenario real");
  assert(/runs_per_month\s+integer not null default 10000/.test(MIG),
    "el techo mensual cambió sin actualizar su justificación");
  // Y la lección que costó descubrirlos queda escrita.
  assert(/un límite por organización no se\s*\n--\s*calibra pensando en una persona/.test(MIG),
    "no consta por qué los primeros números estaban mal");
});

check("K2. el techo deja pasar una implantación completa", () => {
  const intensivo = SCENARIOS.intensive;
  const ops = intensivo.sections * (intensivo.quickEditsPerSection
    + intensivo.contextualReviewsPerSection) + intensivo.asksPerMonth;
  assert(ops < 10000, `el escenario intensivo son ${ops} operaciones y el techo es 10 000`);
  assert(10000 > ops * 5, "el techo no deja margen sobre el escenario más intenso");
});

check("K3. el catálogo de casos de uso cita dónde se midió cada cifra", () => {
  const filas = [...MIG.matchAll(/'(document\.\w+|ask|copilot\.ask)',\s*'[^']+',\s*'(\w+)'/g)];
  assert(filas.length >= 4, `solo ${filas.length} casos de uso en el catálogo`);
  assert(/QUALITY-12\.2C · 4 llamadas reales/.test(MIG), "Quick Edit no cita su medición");
  assert(/QUALITY-12\.2D · 3 llamadas reales/.test(MIG), "la revisión no cita su medición");
});

check("K4. y las clases de coste son internas, no producto", () => {
  assert(/Las clases .*son\s*\n?-- INTERNAS|clases `light`\/`standard`\/`heavy` son\s*\n-- INTERNAS/
    .test(MIG) || /son\s+INTERNAS/.test(flat(MIG)),
    "no consta que las clases no sean visibles al cliente");
  assert(!/light|standard|heavy/i.test(strip(TARJETA)),
    "la pantalla de la empresa enseña la clase de coste");
});

// ===========================================================================
console.log("\nL · LA MIGRACIÓN");
// ===========================================================================

check("L1. es la 0140 y no toca ninguna anterior", () => {
  const m = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  assert(m[m.length - 1] === "0140_intelligence_usage_and_cost.sql",
    `la última es ${m[m.length - 1]}`);
  assert(m[m.length - 2] === "0139_document_contextual_review.sql",
    "algo se coló entre la 0139 y la 0140");
  for (const f of ["0138_document_authoring_runs.sql", "0139_document_contextual_review.sql"]) {
    assert(!/intelligence_usage_guard/.test(read(`supabase/migrations/${f}`)),
      `${f} fue editada con contenido de 12.2F`);
  }
});

check("L2. las funciones nuevas fijan search_path y revocan anon", () => {
  const fns = [...MIG.matchAll(/create or replace function public\.(\w+)[\s\S]*?\$\$;/g)];
  for (const [sql, nombre] of fns.map((m) => [m[0], m[1]] as const)) {
    if (/language sql/.test(sql) && !/security definer/.test(sql)) continue;
    assert(/set search_path = public/.test(sql), `${nombre} no fija search_path`);
  }
  for (const n of ["intelligence_usage_guard", "intelligence_usage_status",
                   "intelligence_emit_usage_event"]) {
    assert(new RegExp(`revoke all on function public\\.${n}`).test(MIG),
      `${n} no revoca permisos`);
  }
});

check("L3. todas las tablas nuevas tienen RLS", () => {
  const tablas = [...MIG.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  for (const t of tablas) {
    assert(new RegExp(`alter table public\\.${t} enable row level security`).test(MIG),
      `${t} no tiene RLS`);
  }
});

check("L4. y todas las vistas heredan la RLS de quien pregunta", () => {
  const vistas = [...MIG.matchAll(/create or replace view public\.(\w+)\s*\nwith \(([^)]*)\)/g)];
  assert(vistas.length >= 4, "no se encontraron las vistas");
  for (const [, nombre, opciones] of vistas) {
    assert(/security_invoker = true/.test(opciones), `${nombre} no tiene security_invoker`);
  }
});

console.log(`\n${passed} conformes · ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
