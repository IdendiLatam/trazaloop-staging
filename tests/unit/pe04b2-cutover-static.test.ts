/**
 * Trazaloop · PE-04B2 · El cambio de autoridad, leído en el código.
 *
 * Las ausencias de este tramo son las que más importan, y las ausencias no se
 * demuestran ejecutando:
 *
 *   · que el plan comercial ya NO salga de `organization_subscriptions`;
 *   · que un fallo de lectura no se presente como un plan;
 *   · que las tablas legacy sigan enteras;
 *   · que nada de B3, B4 ni B5 se haya colado.
 *
 * Correr: npm run test:pe04b2-static
 */
import { readFileSync, existsSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const sinComentarios = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  .replace(/^\s*--.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const M62 = leer("supabase/migrations/0162_commercial_plan_foundation.sql");
const M63 = leer("supabase/migrations/0163_organization_commercial_migration.sql");
const SQL = sinComentarios(M63);
const PLANS_DB = leer("lib/db/plans.ts");
const PLANS_ACTIONS = leer("server/actions/plans.ts");
const TIPOS = leer("lib/plans/types.ts");
const TABLA = leer("components/domain/platform/organizations-table.tsx");
const PANEL = leer("app/(app)/platform/page.tsx");

console.log("\nPE-04B2 · El cambio de autoridad\n");

// ===========================================================================
console.log("A · 0162 no se toca");
// ===========================================================================

check("A1. 0163 no reescribe la migración de B1", () => {
  assert(M62.includes("PE-04B1"), "0162 cambió de identidad");
  assert(!/0162/.test(SQL.replace(/PE-04B1/g, "")),
    "0163 menciona 0162 en una sentencia");
});

check("A2. Y las revisiones de B1 no se editan · se suceden", () => {
  assert(!/update plan_revisions[\s\S]{0,200}monthly_price_minor/.test(SQL),
    "0163 edita el precio de una revisión existente");
  // Lo único que se les hace es CERRARLAS, que es lo que hace publicar.
  assert(/set effective_to = now\(\), status = 'retired'/.test(SQL),
    "0163 no cierra la revisión anterior al publicar la sucesora");
});

// ===========================================================================
console.log("\nB · El plan comercial ya no sale de la suscripción legacy");
// ===========================================================================

check("B1. `organization_effective_plan_code` lee el modelo canónico", () => {
  const i = SQL.indexOf("function public.organization_effective_plan_code");
  assert(i > -1, "0163 no redefine el resolutor del plan efectivo");
  const cuerpo = SQL.slice(i, SQL.indexOf("$$;", i));
  assert(/plan_effective_for_organization/.test(cuerpo),
    "el plan efectivo no consulta el resolutor canónico");
  assert(!/organization_subscriptions/.test(cuerpo),
    "el plan efectivo sigue leyendo la suscripción legacy: ahí vive el defecto");
  assert(!/'demo'/.test(cuerpo), "el plan efectivo puede devolver «demo»");
});

check("B2. Un fallo devuelve `null`, no un plan", () => {
  assert(/if \(error\) return null;/.test(PLANS_DB),
    "un error de lectura no devuelve null");
  assert(!/if \(error\) return "demo";/.test(PLANS_DB),
    "un fallo vuelve a presentarse como el plan Demo");
  assert(/Promise<CommercialTier \| null>/.test(PLANS_DB),
    "el tipo no admite «no se pudo determinar»");
});

check("B3. Y quien llama DENIEGA ante ese null", () => {
  // Lo que B2 estableció —un plan que no se puede determinar DENIEGA, y se
  // dice que fue un fallo de lectura— sigue en pie en los tres ejes, aunque
  // ninguno resuelva ya un `tier`: B3 pasó el almacenamiento al estado canónico
  // y B4 pasó conteos y funciones al catálogo canónico. Se comprueba el
  // invariante, no la forma que tenía en B2.
  const deniegan = (PLANS_ACTIONS.match(/status === "unavailable"/g) ?? []).length;
  assert(deniegan >= 2,
    `solo ${deniegan} comprobaciones deniegan ante un límite que no se pudo leer`);
  assert(/limit\.status === "not_configured"/.test(PLANS_ACTIONS),
    "un límite SIN CONFIGURAR debía denegar, no dejar pasar");
  assert(
    /!storage \|\| storage\.state === "QUOTA_UNAVAILABLE"/.test(PLANS_ACTIONS),
    "el camino de almacenamiento no deniega ante una capacidad indeterminada"
  );
  assert(/STORAGE_UNVERIFIABLE_MESSAGE/.test(PLANS_ACTIONS),
    "no hay un mensaje propio para «no se pudo comprobar la capacidad»");
  assert(/PLAN_UNVERIFIABLE_MESSAGE/.test(PLANS_ACTIONS),
    "no hay un mensaje propio para «no se pudo comprobar»");
  // Y el mensaje NO dice que el plan no lo permite: sería mentir.
  const i = PLANS_ACTIONS.indexOf("const PLAN_UNVERIFIABLE_MESSAGE");
  const texto = PLANS_ACTIONS.slice(i, i + 300);
  assert(/no se pudo comprobar/i.test(texto),
    "el mensaje de plan indeterminado no dice que fue un fallo de lectura");
});

check("B4. La consola no llama «plan actual» a la fila legacy", () => {
  assert(/LEGACY · no autoritativo/.test(TABLA),
    "el dato legacy no se rotula como no autoritativo");
  assert(!/Plan heredado \(hist[óo]rico \/ administrativo\)/.test(TABLA),
    "vuelve el rótulo suave: sugiere que sigue siendo un plan de la empresa");
  assert(/effectivePlanCode === null/.test(TABLA),
    "un plan indeterminado se pinta como un plan");
});

check("B5. Y la página no cae a «demo» cuando no hay plan", () => {
  const codigo = sinComentarios(PANEL);
  assert(!/effectivePlanByOrgId\[o\.organizationId\] \?\? "demo"/.test(codigo),
    "la página vuelve a pintar «demo» cuando falla la lectura");
  assert(/effectivePlanByOrgId\[o\.organizationId\] \?\? null/.test(codigo),
    "el plan indeterminado no viaja como null");
});

// ===========================================================================
console.log("\nC · Lo legacy sigue entero");
// ===========================================================================

check("C1. Ninguna tabla legacy se borra ni se altera", () => {
  for (const t of ["plan_definitions", "plan_limits", "organization_subscriptions",
    "subscription_plan_history", "organization_modules"]) {
    assert(!new RegExp(`drop table[^;]*${t}\\b`, "i").test(SQL), `0163 borra «${t}»`);
    assert(!new RegExp(`alter table (public\\.)?${t}\\b`, "i").test(SQL),
      `0163 altera «${t}»`);
  }
  assert(!/\bdrop column\b/i.test(SQL), "0163 elimina alguna columna");
});

check("C2. Y la migración NO reescribe la suscripción legacy", () => {
  // Reescribirla sería falsificar la evidencia de lo que se creyó.
  assert(!/update (public\.)?organization_subscriptions/i.test(SQL),
    "0163 reescribe la suscripción legacy");
  assert(!/delete from (public\.)?organization_subscriptions/i.test(SQL),
    "0163 borra la suscripción legacy");
});

check("C3. El puente hacia las tablas legacy se retiró, y consta por qué", () => {
  // B2 lo creó declarándolo temporal y diciendo en qué tramo se iría. B3 lo
  // sacó del camino de almacenamiento y B4 lo retiró del todo: los límites de
  // conteo y las funciones habilitadas también salen ya del catálogo canónico.
  assert(!/export function commercialTierToLegacyPlanCode/.test(TIPOS),
    "el puente sigue vivo");
  const i = TIPOS.indexOf("PUENTE");
  assert(i > -1, "se borró sin dejar constancia de que existió y por qué");
  const doc = TIPOS.slice(i, i + 900);
  assert(/PE-04B4/.test(doc), "no consta en qué tramo se retiró");
});

// ===========================================================================
console.log("\nD · La prueba no es un cuarto plan");
// ===========================================================================

check("D1. No se creó ningún plan nuevo", () => {
  assert(!/insert into public\.plans/.test(SQL), "0163 siembra un plan nuevo");
  assert(!/'full_trial'|'trial'\s*,\s*'active'/.test(SQL),
    "aparece un plan de prueba");
  assert(!/'advisor'|'asesor'/i.test(SQL), "aparece «advisor» como plan");
});

check("D2. La bolsa de la prueba vive en la POLÍTICA", () => {
  assert(/alter table public\.commercial_trial_policy[\s\S]{0,80}add column trial_ai_credits/
    .test(SQL), "la bolsa de la prueba no está en la política");
  assert(/set trial_ai_credits = 50/.test(SQL), "la bolsa no se siembra en 50");
});

check("D3. Y la duración sale de la política, no de un literal", () => {
  const i = SQL.indexOf("function public.provision_new_organization_modules");
  const cuerpo = SQL.slice(i, SQL.indexOf("$$;", i));
  assert(/v_pol\.trial_duration_hours/.test(cuerpo),
    "la provisión no lee la duración de la política");
  const j = SQL.indexOf("function public.commercial_provision_new_module");
  const prov = SQL.slice(j, SQL.indexOf("$$;", j));
  assert(/make_interval\(hours => v_pol\.trial_duration_hours\)/.test(prov),
    "la prueba no se concede con la duración de la política");
  assert(!/interval '48 hours'/.test(prov), "vuelven las 48 horas como literal");
});

check("D4. La prueba se da una vez, y se deriva de la historia", () => {
  const j = SQL.indexOf("function public.commercial_provision_new_module");
  const prov = SQL.slice(j, SQL.indexOf("$$;", j));
  assert(/grant_kind = 'trial'\s*\)\s*into v_ya/.test(prov.replace(/\n/g, " "))
    || /a\.grant_kind = 'trial'/.test(prov),
    "no se comprueba si ya hubo una prueba");
  // Sin tabla nueva de «pruebas consumidas»: se deduce de las asignaciones.
  assert(!/create table[^;]*trial_consumed|trial_history/i.test(SQL),
    "se creó una tabla para recordar las pruebas ya dadas");
});

// ===========================================================================
console.log("\nE · Nada de B3, B4 ni B5 se ha colado");
// ===========================================================================

check("E1. Los créditos NO se descuentan todavía", () => {
  assert(!/ai_weighted_credits_used|consume_ai_credits|decrement/i.test(SQL),
    "0163 descuenta créditos: eso es PE-04B4");
});

check("E2. Los minutos activos NO se miden todavía", () => {
  assert(!/active_minutes_used|session_start|idle|consultation_mode/i.test(SQL),
    "0163 mide tiempo activo: eso es PE-04B4");
});

check("E3. La cuota de organización NO se aplica todavía", () => {
  const i = SQL.indexOf("function public.organization_commercial_storage_bytes");
  assert(i > -1, "no existe la referencia canónica de almacenamiento");
  const cuerpo = SQL.slice(i, SQL.indexOf("$$;", i));
  assert(!/raise exception[^;]*QUOTA/i.test(cuerpo),
    "la referencia de cuota bloquea algo: aplicarla es PE-04B3");
  // Y no se toca el camino que hoy aplica la cuota.
  assert(!/function public\.begin_cpr_storage_upload/.test(SQL),
    "0163 toca la reserva de subida: eso es PE-04B3");
});

check("E4. El cupo de soporte se guarda y no se aplica", () => {
  assert(/functional_support_cases_monthly/.test(SQL),
    "no se guarda el cupo de acompañamiento");
  assert(!/support_tickets/.test(SQL), "0163 toca los tickets: eso es PE-04B5");
});

check("E5. Y nada de cobro", () => {
  for (const jerga of ["stripe", "checkout(", "invoice", "coupon", "vat", "tax"]) {
    assert(!new RegExp(jerga.replace("(", "\\("), "i").test(SQL),
      `0163 toca «${jerga}», que es de PE-05`);
  }
});

check("E6. El acceso al módulo NO cambia · el modo consulta es B4", () => {
  // Desbloquear una prueba vencida sin el medidor de tiempo dejaría a Free sin
  // ninguna frontera. Se documenta y se aplaza.
  assert(!/function public\.resolve_organization_module_access/.test(SQL),
    "0163 redefine el acceso al módulo: eso cambia el bloqueo de la prueba vencida");
  assert(/PE-04B4/.test(M63), "0163 no dice a qué tramo se aplaza el modo consulta");
});

// ===========================================================================
console.log("\nF · La migración es honesta");
// ===========================================================================

check("F1. Deriva del módulo, no de la suscripción", () => {
  const i = SQL.indexOf("function public.commercial_migrate_organizations");
  const cuerpo = SQL.slice(i, SQL.indexOf("$$;", i));
  assert(/organization_modules/.test(cuerpo),
    "la migración no lee los módulos, que son la autoridad real");
  assert(!/organization_subscriptions/.test(cuerpo),
    "la migración lee la suscripción legacy: es la fila que nadie mantiene");
});

check("F2. `core` no participa", () => {
  const i = SQL.indexOf("function public.commercial_migrate_organizations");
  const cuerpo = SQL.slice(i, SQL.indexOf("$$;", i));
  assert(/m\.is_functional/.test(cuerpo),
    "la migración no filtra por módulo funcional: `core` elevaría a todas las empresas");
});

check("F3. Y es idempotente por construcción", () => {
  const i = SQL.indexOf("function public.commercial_migrate_organizations");
  const cuerpo = SQL.slice(i, SQL.indexOf("$$;", i));
  const guardas = (cuerpo.match(/not exists \(/g) ?? []).length;
  assert(guardas >= 3, `solo ${guardas} guardas de existencia: reejecutar duplicaría`);
});

check("F4. Una prueba heredada conserva su caducidad", () => {
  const i = SQL.indexOf("function public.commercial_migrate_organizations");
  const cuerpo = SQL.slice(i, SQL.indexOf("$$;", i));
  assert(/coalesce\(v_rec\.access_expires_at/.test(cuerpo),
    "la prueba migrada no conserva la fecha que ya tenía");
  assert(!/now\(\) \+ make_interval\(hours => 48\)/.test(cuerpo),
    "la migración reinicia 48 horas: regalaría tiempo que nadie compró");
});

check("F5. Y el reconocimiento no deja nada sin clasificar", () => {
  const i = SQL.indexOf("create view public.v_commercial_migration_recognition");
  assert(i > -1, "no existe la vista de reconocimiento");
  const cuerpo = SQL.slice(i, SQL.indexOf(";", SQL.indexOf("from public.organizations", i)));
  for (const cat of ["extra", "full", "demo_active", "demo_expired", "disabled"]) {
    assert(cuerpo.includes(`'${cat}'`), `la clasificación no contempla «${cat}»`);
  }
});

console.log(`\nPE-04B2 · cambio de autoridad: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
