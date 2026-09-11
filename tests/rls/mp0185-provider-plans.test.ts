import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { limpiarFixtures, describirResiduo, tasaCanonicaQA } from "../support/fixture-cleanup";
import { readFileSync } from "node:fs";

loadEnv({ path: ".env.local", quiet: true });

/**
 * Trazaloop · 0185 · Los planes que existen en el proveedor.
 *
 * QUÉ SE PROTEGE
 *
 * Esta tabla no guarda precios: guarda cómo se llama en Mercado Pago una oferta
 * de Trazaloop, y con qué importe se creó allí. Dos cosas pueden salir mal y las
 * dos cuestan dinero de otro: que alguien reescriba una proyección ya usada
 * —cambiando en silencio lo que paga quien la contrató— y que un checkout mande
 * a alguien a un plan cuyas condiciones ya no son las del presupuesto.
 *
 * Nota de método: la tabla NO se puede leer desde ningún rol de ejecución, así
 * que las comprobaciones miran por la vista de plataforma con una sesión real.
 * Eso también ejercita la vista, que es como se observará de verdad.
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !SERVICE || !ANON) {
  console.log("faltan credenciales locales en .env.local");
  process.exit(1);
}

const admin: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });

let passed = 0;
let failed = 0;
const sello = Date.now();
const personas: string[] = [];
const orgs: string[] = [];
const proyecciones: string[] = [];
let staffCli: SupabaseClient;

async function check(nombre: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✔ ${nombre}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✘ ${nombre}: ${e instanceof Error ? e.message : e}`);
  }
}

function assert(cond: boolean, mensaje: string) {
  if (!cond) throw new Error(mensaje);
}

async function persona(etiqueta: string, desPlataforma = false) {
  const email = `mp0185-${etiqueta}-${sello}@test.trazaloop.dev`;
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password: "Trazaloop-Test-1234", email_confirm: true });
  assert(!error && Boolean(u.user), `crear ${etiqueta}: ${error?.message}`);
  const uid = (u.user as { id: string }).id;
  personas.push(uid);
  if (desPlataforma) {
    await admin.from("platform_staff")
      .insert({ user_id: uid, role_code: "superadmin", status: "active" });
  }
  const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password: "Trazaloop-Test-1234" });
  return { uid, cli };
}

/** Registrar una proyección por el camino gobernado. Devuelve id o el error. */
async function registrar(o: {
  provider?: string; environment?: string; revision: string;
  interval: string; providerPlanId: string; currency?: string; amount: number;
}) {
  const r = await admin.rpc("billing_register_provider_plan", {
    p_provider: o.provider ?? "mercadopago",
    p_environment: o.environment ?? "test",
    p_plan_revision_id: o.revision,
    p_billing_interval: o.interval,
    p_provider_plan_id: o.providerPlanId,
    p_charge_currency: o.currency ?? "COP",
    p_charge_amount: o.amount,
    p_created_by: null,
  });
  if (!r.error && typeof r.data === "string") proyecciones.push(r.data);
  return r;
}

/**
 * TEST-HYGIENE-05A · La lectura va ACOTADA, y esto no es una precaución
 * teórica: la traía sin acotar y se rompió sola.
 *
 * `billing_provider_plans` es de solo-añadir —0185 no deja borrar— así que cada
 * ejecución suma filas y la tabla solo crece. Al pasar de MIL, PostgREST empezó
 * a devolver una página truncada y, sin `order by`, las proyecciones recién
 * registradas —las últimas— caían fuera. Seis comprobaciones se pusieron rojas
 * de golpe diciendo cosas absurdas: «quedaron 0 vigentes», «no se encuentra la
 * proyección». Es exactamente lo que le pasó a `commercial_fx_rates` en
 * TEST-HYGIENE-03, en otra tabla y con otro nombre.
 *
 * Se acota de dos maneras a la vez: por revisión EN LA BASE cuando la
 * comprobación mira una sola, y siempre por las más recientes primero. Lo que
 * cada prueba busca es lo que acaba de registrar.
 */
async function verProyecciones(revision?: string) {
  // Una sola expresión encadenada, con el filtro dentro: partirla en dos
  // esconde el acotado de quien lo audita —y de la guarda que lo vigila—.
  // `.match({})` no filtra nada, que es justo lo que hace falta cuando la
  // comprobación mira todas las revisiones.
  const { data } = await staffCli.from("v_billing_provider_plans")
    .select("id, provider, environment, plan_revision_id, billing_interval, provider_plan_id, charge_amount, status, effective_to, suscripciones_vinculadas")
    .match(revision ? { plan_revision_id: revision } : {})
    .order("created_at", { ascending: false })
    .limit(300);
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function main() {
  console.log("\n0185 · los planes que existen en el proveedor\n");

  const staff = await persona("staff", true);
  staffCli = staff.cli;

  const { data: revFull } = await admin.from("plan_revisions")
    .select("id").eq("plan_code", "full").eq("status", "published")
    .is("effective_to", null).single();
  const { data: revExtra } = await admin.from("plan_revisions")
    .select("id").eq("plan_code", "extra").eq("status", "published")
    .is("effective_to", null).single();
  const FULL = (revFull as { id: string }).id;
  const EXTRA = (revExtra as { id: string }).id;

  // ---- Modelo -----------------------------------------------------------
  await check("1. Mensual y anual son proyecciones DISTINTAS", async () => {
    const m = await registrar({ revision: FULL, interval: "monthly",
      providerPlanId: `plan-m-${sello}`, amount: 190400 });
    assert(!m.error, `mensual: ${m.error?.message}`);
    const a = await registrar({ revision: FULL, interval: "annual",
      providerPlanId: `plan-a-${sello}`, amount: 2047200 });
    assert(!a.error, `anual: ${a.error?.message}`);
    // Acotado a ESTA revisión: las proyecciones no se borran nunca, así que las
    // de ejecuciones anteriores siguen en la tabla y contarlas todas mezclaría
    // ofertas distintas.
    const filas = (await verProyecciones(FULL));
    const vivas = filas.filter((f) => f.status === "active" && !f.effective_to);
    assert(vivas.some((f) => f.billing_interval === "monthly")
      && vivas.some((f) => f.billing_interval === "annual"),
      "las dos tienen que convivir: son objetos distintos en el proveedor");
  });

  await check("2. Sandbox y live no se cruzan", async () => {
    const r = await registrar({ environment: "live", revision: FULL,
      interval: "monthly", providerPlanId: `plan-live-${sello}`, amount: 190400 });
    assert(!r.error, `live: ${r.error?.message}`);
    const filas = (await verProyecciones(FULL));
    const vivas = filas.filter((f) => f.status === "active" && !f.effective_to
      && f.billing_interval === "monthly");
    assert(vivas.filter((f) => f.environment === "test").length === 1
      && vivas.filter((f) => f.environment === "live").length === 1,
      "cada entorno tiene la suya, y abrir una no cierra la del otro");
  });

  await check("3. Solo UNA vigente por combinación · registrar cierra la anterior", async () => {
    const antes = (await verProyecciones(FULL)).find((f) => f.status === "active"
      && !f.effective_to && f.environment === "test" && f.billing_interval === "monthly"
      && f.plan_revision_id === FULL);
    const r = await registrar({ revision: FULL, interval: "monthly",
      providerPlanId: `plan-m2-${sello}`, amount: 200000 });
    assert(!r.error, `segunda: ${r.error?.message}`);
    const filas = (await verProyecciones(FULL));
    const vivas = filas.filter((f) => f.status === "active" && !f.effective_to
      && f.environment === "test" && f.billing_interval === "monthly");
    assert(vivas.length === 1, `quedaron ${vivas.length} vigentes`);
    assert(vivas[0].provider_plan_id === `plan-m2-${sello}`, "no quedó vigente la nueva");
    const vieja = filas.find((f) => f.id === antes?.id);
    assert(vieja?.status === "retired" && Boolean(vieja?.effective_to),
      "la anterior tiene que quedar retirada y con su vigencia cerrada");
  });

  await check("4. Las históricas siguen ahí", async () => {
    const filas = await verProyecciones();
    assert(filas.some((f) => f.provider_plan_id === `plan-m-${sello}`
      && f.status === "retired"),
      "una proyección retirada no desaparece: sostiene a quien nació con ella");
  });

  await check("5. El identificador externo no se duplica en el mismo entorno", async () => {
    const r = await registrar({ revision: EXTRA, interval: "monthly",
      providerPlanId: `plan-m2-${sello}`, amount: 476000 });
    assert(Boolean(r.error), "aceptó dos veces el mismo identificador del proveedor");
  });

  await check("5 bis. Pero el MISMO texto sí puede existir en el otro entorno", async () => {
    // No se asume que un identificador de sandbox no pueda repetirse en
    // producción: son espacios distintos y el proveedor no promete lo contrario.
    const r = await registrar({ environment: "live", revision: EXTRA,
      interval: "monthly", providerPlanId: `plan-m2-${sello}`, amount: 476000 });
    assert(!r.error, `debería permitirse en otro entorno: ${r.error?.message}`);
  });

  // ---- Seguridad --------------------------------------------------------
  await check("6. Un inquilino no puede leer ni escribir", async () => {
    const cliente = await persona("inquilino");
    // GUARDA-FX: lectura global deliberada · aquí se exige que NO devuelva nada
    const { data: leido } = await cliente.cli.from("billing_provider_plans").select("id");
    assert((leido ?? []).length === 0, "un inquilino vio la tabla");
    // GUARDA-FX: lectura global deliberada · el asunto es justo que salga vacía
    const { data: vista } = await cliente.cli.from("v_billing_provider_plans").select("id");
    assert((vista ?? []).length === 0, "un inquilino vio la vista");
    const { error } = await cliente.cli.rpc("billing_register_provider_plan", {
      p_provider: "mercadopago", p_environment: "test", p_plan_revision_id: FULL,
      p_billing_interval: "monthly", p_provider_plan_id: `pirata-${sello}`,
      p_charge_currency: "COP", p_charge_amount: 1, p_created_by: null });
    assert(Boolean(error), "un inquilino pudo registrar una proyección");
  });

  await check("7. `service_role` no puede tocar la tabla directamente", async () => {
    // Lo que lo detiene son los privilegios, no la RLS: a este rol no se le
    // aplica. Se comprueba ejecutándolo, que es la lección de 0184.
    const { error: eSel } = await admin.from("billing_provider_plans").select("id").limit(1);
    assert(Boolean(eSel), "service_role pudo LEER la tabla");
    const { error: eIns } = await admin.from("billing_provider_plans").insert({
      provider: "mercadopago", environment: "test", plan_revision_id: FULL,
      billing_interval: "monthly", provider_plan_id: `directo-${sello}`,
      charge_currency: "COP", charge_amount: 1 });
    assert(Boolean(eIns), "service_role pudo INSERTAR directamente");
    const { error: eDel } = await admin.from("billing_provider_plans").delete()
      .eq("provider", "mercadopago");
    assert(Boolean(eDel), "service_role pudo BORRAR directamente");
  });

  // ---- El camino gobernado valida ---------------------------------------
  await check("8. El camino gobernado rechaza lo que no cuadra", async () => {
    const wompi = await registrar({ provider: "wompi", revision: FULL,
      interval: "monthly", providerPlanId: `w-${sello}`, amount: 190400 });
    assert(Boolean(wompi.error), "aceptó una proyección para un proveedor merchant");
    const fantasma = await registrar({ provider: `fantasma-${sello}`, revision: FULL,
      interval: "monthly", providerPlanId: `f-${sello}`, amount: 190400 });
    assert(Boolean(fantasma.error), "aceptó un proveedor sin capacidad declarada");
    const entorno = await registrar({ environment: "produccion", revision: FULL,
      interval: "monthly", providerPlanId: `e-${sello}`, amount: 190400 });
    assert(Boolean(entorno.error), "aceptó un entorno inventado");
    const intervalo = await registrar({ revision: FULL, interval: "semanal",
      providerPlanId: `i-${sello}`, amount: 190400 });
    assert(Boolean(intervalo.error), "aceptó un intervalo inventado");
    const importe = await registrar({ revision: FULL, interval: "annual",
      providerPlanId: `z-${sello}`, amount: 0 });
    assert(Boolean(importe.error), "aceptó importe cero");
  });

  // ---- Resolución -------------------------------------------------------
  await check("9. Resuelve exactamente la proyección esperada", async () => {
    const e = await conPresupuesto("resuelve", "full", "monthly");
    // La proyección vigente tiene que valer lo mismo que el presupuesto.
    await registrar({ revision: FULL, interval: "monthly",
      providerPlanId: `plan-ok-${sello}`, amount: e.total });
    const { data, error } = await admin.rpc("billing_resolve_provider_plan",
      { p_quote_id: e.quoteId, p_environment: "test" });
    assert(!error, `resolver: ${error?.message}`);
    const fila = (data as Array<Record<string, unknown>>)[0];
    assert(fila.provider_plan_id === `plan-ok-${sello}`,
      `resolvió ${fila.provider_plan_id}`);
    assert(fila.provider === "mercadopago", "resolvió otro proveedor");
  });

  await check("10. Falla cerrado si el importe no coincide", async () => {
    const e = await conPresupuesto("importe", "full", "monthly");
    await registrar({ revision: FULL, interval: "monthly",
      providerPlanId: `plan-caro-${sello}`, amount: e.total + 1 });
    const { error } = await admin.rpc("billing_resolve_provider_plan",
      { p_quote_id: e.quoteId, p_environment: "test" });
    assert(Boolean(error) && (error?.message ?? "").includes("AMOUNT_MISMATCH"),
      `esperaba desajuste de importe, dio: ${error?.message}`);
  });

  await check("11. Falla cerrado si no hay proyección para esa oferta", async () => {
    const e = await conPresupuesto("sinplan", "extra", "annual");
    const { error } = await admin.rpc("billing_resolve_provider_plan",
      { p_quote_id: e.quoteId, p_environment: "test" });
    assert(Boolean(error) && (error?.message ?? "").includes("NOT_AVAILABLE"),
      `esperaba ausencia de plan, dio: ${error?.message}`);
  });

  await check("12. Falla cerrado con un entorno que no existe", async () => {
    const e = await conPresupuesto("entorno", "full", "monthly");
    const { error } = await admin.rpc("billing_resolve_provider_plan",
      { p_quote_id: e.quoteId, p_environment: "sandbox" });
    assert(Boolean(error) && (error?.message ?? "").includes("ENVIRONMENT_INVALID"),
      `dio: ${error?.message}`);
  });

  await check("13. El intervalo lo manda el presupuesto, no quien llama", async () => {
    // Un presupuesto anual no puede resolver contra la proyección mensual, ni
    // aunque esa sea la única vigente.
    const e = await conPresupuesto("intervalo", "full", "annual");
    const { error } = await admin.rpc("billing_resolve_provider_plan",
      { p_quote_id: e.quoteId, p_environment: "test" });
    assert(Boolean(error), "un presupuesto anual resolvió contra otra cosa");
  });

  // ---- Vínculo histórico ------------------------------------------------
  await check("14. La suscripción congela CON QUÉ proyección nació", async () => {
    const filas = await verProyecciones();
    const viva = filas.find((f) => f.provider_plan_id === `plan-ok-${sello}`);
    assert(Boolean(viva), "no se encuentra la proyección");
    const e = await conPresupuesto("vinculo", "full", "monthly");
    const subId = await suscripcionDesde(e, "mercadopago");
    const { error } = await admin.from("billing_subscriptions")
      .update({ billing_provider_plan_id: viva!.id }).eq("id", subId);
    assert(!error, `vincular: ${error?.message}`);

    // Y retirarla para nuevas ventas NO desvincula a quien ya la tenía.
    await admin.rpc("billing_retire_provider_plan", { p_id: viva!.id });
    const { data: s } = await admin.from("billing_subscriptions")
      .select("billing_provider_plan_id").eq("id", subId).single();
    assert((s as { billing_provider_plan_id: string }).billing_provider_plan_id === viva!.id,
      "la suscripción perdió su vínculo histórico al retirar el plan");
  });

  await check("15. La identidad económica es inmutable DESDE QUE LA FILA EXISTE", async () => {
    // La regla anterior ataba la inmutabilidad a que hubiera una suscripción
    // vinculada, y era insuficiente: entre resolver la proyección y que la
    // persona autorice en el proveedor hay una ventana en la que YA hay alguien
    // mirando una pantalla de pago salida de esa fila, sin que exista todavía
    // ninguna suscripción. Cambiarle el importe ahí es cobrarle otra cosa.
    //
    // LÍMITE: desde un cliente PostgREST no se puede intentar la mutación
    // —ningún rol de ejecución tiene DML, que es la primera defensa—. El trigger
    // solo lo puede violar el dueño, y se verificó ejecutándolo como tal sobre
    // una fila SIN suscripciones:
    //
    //   charge_amount · provider_plan_id · charge_currency · billing_interval
    //   plan_revision_id · environment · effective_from
    //     → BILLING_PROVIDER_PLAN_ECONOMIC_IDENTITY_IS_FROZEN  (los siete)
    //   delete            → BILLING_PROVIDER_PLAN_IS_NOT_DELETABLE
    //   retirar por la primitiva → permitido, vigencia cerrada
    //
    // Aquí se fija la FORMA de la regla, que es lo comprobable desde fuera.
    const sqlPlan = readFileSync("supabase/migrations/0185_billing_provider_plans.sql", "utf8");
    const i = sqlPlan.indexOf("function public.billing_provider_plan_is_append_only");
    const bloque = sqlPlan.slice(i, sqlPlan.indexOf("$$;", i));
    assert(bloque.includes("BILLING_PROVIDER_PLAN_ECONOMIC_IDENTITY_IS_FROZEN"),
      "debe existir la defensa de identidad económica");
    assert(bloque.includes("BILLING_PROVIDER_PLAN_IS_NOT_DELETABLE"),
      "una proyección no se borra");
    // Ya NO puede depender de que exista una suscripción.
    assert(!/billing_subscriptions/.test(bloque),
      "la inmutabilidad no puede condicionarse a que haya suscripción vinculada");
    // Y se comprueba por DIFERENCIA, no enumerando lo prohibido: así una columna
    // añadida mañana nace protegida en vez de nacer olvidada.
    assert(/to_jsonb\(new\) - 'status' - 'effective_to'/.test(bloque),
      "la comparación debe ser por diferencia sobre la fila entera");
    for (const campo of ["provider", "environment", "plan_revision_id",
                         "billing_interval", "provider_plan_id",
                         "charge_currency", "charge_amount"]) {
      assert(!new RegExp(`new\\.${campo} is distinct from`).test(bloque),
        `${campo} no debe enumerarse: la regla es por diferencia`);
    }
  });

  await check("15 bis. `register` inserta, no corrige una fila existente", async () => {
    const sqlPlan = readFileSync("supabase/migrations/0185_billing_provider_plans.sql", "utf8");
    const i = sqlPlan.indexOf("function public.billing_register_provider_plan");
    const bloque = sqlPlan.slice(i, sqlPlan.indexOf("$$;", i));
    assert(!/on conflict/i.test(bloque) && !/do update/i.test(bloque),
      "registrar no puede ser un UPSERT: corregiría condiciones en el sitio");
    // Lo único que toca de la fila anterior es su ciclo de vida.
    const iUpd = bloque.indexOf("update public.billing_provider_plans");
    const upd = bloque.slice(iUpd, bloque.indexOf(";", iUpd));
    assert(/set status = 'retired', effective_to = now\(\)/.test(upd),
      "al abrir una proyección solo se cierra la anterior, no se reescribe");

    // Y `retire` tampoco toca identidad.
    const j = sqlPlan.indexOf("function public.billing_retire_provider_plan");
    const retire = sqlPlan.slice(j, sqlPlan.indexOf("$$;", j));
    for (const campo of ["charge_amount", "provider_plan_id", "charge_currency",
                         "billing_interval", "plan_revision_id"]) {
      assert(!retire.includes(campo), `retirar no puede tocar ${campo}`);
    }
  });

  await check("15 ter. Retirar no rompe el vínculo histórico de la suscripción", async () => {
    const filas = await verProyecciones();
    const usada = filas.find((f) => Number(f.suscripciones_vinculadas) > 0);
    assert(Boolean(usada), "no hay proyección vinculada que comprobar");
    assert(usada!.status === "retired" || Boolean(usada!.effective_to),
      "esta comprobación espera la proyección ya retirada por la prueba 14");
    // La FK sigue resolviendo: la fila histórica no se fue a ninguna parte.
    const { data } = await admin.from("billing_subscriptions")
      .select("id, billing_provider_plan_id")
      .eq("billing_provider_plan_id", usada!.id as string);
    assert(((data ?? []) as unknown[]).length === 1,
      "la suscripción perdió su vínculo con la proyección retirada");
  });

  // ---- Wompi y 0184 -----------------------------------------------------
  await check("16. Wompi no necesita proyección · y su motor sigue igual", async () => {
    const filas = await verProyecciones();
    assert(!filas.some((f) => f.provider === "wompi"),
      "Wompi no debe tener proyecciones");
    const { data } = await admin.rpc("billing_renewal_owner", { p_provider: "wompi" });
    assert(data === "merchant", "0184 dejó de clasificar a Wompi como merchant");
  });

  await check("17. El resolutor no escribe el nombre del proveedor a mano", async () => {
    const sql = readFileSync("supabase/migrations/0185_billing_provider_plans.sql", "utf8");
    const i = sql.indexOf("function public.billing_resolve_provider_plan");
    const bloque = sql.slice(i, sql.indexOf("$$;", i));
    assert(bloque.includes("renewal_owner = 'provider'"),
      "el proveedor debe salir del catálogo de 0184, no de un literal");
    assert(!/=\s*'mercadopago'/.test(bloque),
      "no puede comparar contra 'mercadopago' escrito a mano");
  });

  // ---- Seguridad de Producción -----------------------------------------
  await check("18. 0185 no toca datos de nadie", async () => {
    const sql = readFileSync("supabase/migrations/0185_billing_provider_plans.sql", "utf8")
      .toLowerCase();
    for (const t of ["organizations", "memberships", "organization_plan_assignments",
                     "organization_modules", "auth.users", "profiles"]) {
      for (const verbo of ["delete from public." + t, "truncate public." + t,
                           "update public." + t, "delete from " + t]) {
        assert(!sql.includes(verbo), `la migración no puede contener «${verbo}»`);
      }
    }
    assert(!sql.includes("drop table"), "ninguna tabla se elimina");
    assert(!/alter table public\.billing_subscriptions[\s\S]{0,200}not null/.test(sql),
      "la columna nueva debe nacer NULLABLE: hay filas y usuarios reales");
    assert(!/add column if not exists billing_provider_plan_id[^;]*default/.test(sql),
      "sin valor por omisión: no se reescribe ninguna fila existente");
  });

  await check("19. La columna nueva es nullable y no cambió ninguna suscripción", async () => {
    const { data } = await admin.from("billing_subscriptions")
      .select("id, billing_provider_plan_id, plan_code, status").limit(200);
    const filas = (data ?? []) as Array<Record<string, unknown>>;
    const conPlan = filas.filter((f) => f.billing_provider_plan_id);
    assert(conPlan.length <= 1,
      `solo la suscripción de esta prueba debe estar vinculada, hay ${conPlan.length}`);
  });

  await check("20. El catálogo de 0184 y los adaptadores siguen coherentes", async () => {
    const { data } = await admin.from("billing_provider_capabilities")
      .select("provider, renewal_owner");
    const catalogo = new Map(((data ?? []) as Array<{ provider: string; renewal_owner: string }>)
      .map((f) => [f.provider, f.renewal_owner]));
    for (const [fichero, provider] of [
      ["lib/billing/providers/wompi.ts", "wompi"],
      ["lib/billing/providers/mercadopago.ts", "mercadopago"]] as const) {
      const m = readFileSync(fichero, "utf8").match(/recurrenceOwner:\s*"(merchant|provider)"/);
      assert(catalogo.get(provider) === m?.[1],
        `${provider}: adaptador ${m?.[1]} · catálogo ${catalogo.get(provider)}`);
    }
  });

  // El resumen va DESPUÉS de limpiar: la limpieza tiene su propia comprobación
  // y contarla antes daría un número que no incluye si la suite se llevó lo
  // suyo, que es justo lo que este tramo vino a arreglar.
  await limpiar();
  console.log(`\n0185 · planes del proveedor: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------

async function conPresupuesto(etiqueta: string, plan: string, interval: string) {
  const p = await persona(`q-${etiqueta}`);
  const { data: orgId } = await p.cli.rpc("create_organization",
    { p_name: `MP0185 ${etiqueta} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", p.uid);
  const { data: q, error } = await p.cli.rpc("billing_create_quote", {
    p_organization_id: org, p_plan_code: plan, p_billing_interval: interval });
  assert(!error, `presupuestar: ${error?.message}`);
  const quote = q as { quote_id: string; total_amount: number };
  return { org, cli: p.cli, quoteId: quote.quote_id, total: Number(quote.total_amount) };
}

async function suscripcionDesde(e: { org: string; cli: SupabaseClient; quoteId: string },
                                provider: string) {
  const { data: i } = await e.cli.rpc("billing_open_checkout_intent", {
    p_quote_id: e.quoteId, p_provider: provider, p_environment: "test" });
  const intento = i as unknown as { intent_id: string; expected_total_amount: number };
  const { data: pm } = await admin.rpc("billing_register_payment_method", {
    p_organization_id: e.org, p_provider: provider,
    p_provider_payment_method_id: `pm-0185-${sello}`, p_environment: "test",
    p_created_by: null });
  await admin.rpc("billing_attach_intent_payment_method", {
    p_intent_id: intento.intent_id,
    p_payment_method_id: (pm as Record<string, unknown>).payment_method_id as string });
  await admin.rpc("billing_settle_provider_payment", {
    p_provider: provider, p_external_reference: intento.intent_id,
    p_provider_payment_id: `pay-0185-${sello}`, p_outcome: "approved",
    p_amount: intento.expected_total_amount, p_currency: "COP",
    p_live_mode: false, p_failure_reason: null });
  const { data: sub } = await admin.from("billing_subscriptions")
    .select("id").eq("organization_id", e.org).single();
  return (sub as { id: string }).id;
}

async function limpiar() {
  // TEST-HYGIENE-01 · La lista de borrados a mano tenía mejor orden que la de
  // `mp0184`, y aun así fallaba: borraba las suscripciones ANTES que los
  // presupuestos, y `billing_quotes.subscription_id` las referencia con
  // RESTRICT. Nadie miraba el resultado, así que el fallo era invisible y esta
  // suite dejaba +6 organizaciones y +6 usuarios en cada ejecución.
  //
  // Ahora limpia por el GRAFO de claves ajenas y COMPRUEBA lo que sobrevive.
  const pg = new PgClient({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  // TEST-HYGIENE-05A · Y las proyecciones que registró esta vuelta. `0185` no
  // deja borrarlas —son historia del proveedor— así que se RETIRAN por la
  // primitiva gobernada. Lo que no puede quedar es una VIGENTE: chocaría con el
  // índice único de vigencia y una proyección de QA se presentaría como oferta.
  const residuo = await limpiarFixtures(pg, admin, {
    orgs, personas, planesProveedor: proyecciones,
  });
  await pg.end();

  await check("24. La suite no deja un solo fixture detrás", async () => {
    assert(residuo.organizaciones === 0 && residuo.personas === 0
      && residuo.fxActivas === 0 && Object.keys(residuo.porTabla).length === 0
      && residuo.problemas.length === 0,
      `quedaron: ${describirResiduo(residuo)}`);
    // Por IDENTIFICADOR propio: las proyecciones de otras suites no son asunto
    // de ésta, y un barrido por nota o por nombre acusaría a quien no debe.
    assert(residuo.planesActivos === 0,
      `quedaron ${residuo.planesActivos} proyecciones de esta vuelta VIGENTES`);
  });
}

async function sembrarFx() {
  // TEST-HYGIENE-03 · Antes abría su propia tasa y, para poder abrirla, retiraba
  // a ciegas cualquier otra `QA 0185 %` que hubiera quedado viva. Dos parches
  // sobre el mismo agujero: 0182 no deja borrar tasas y solo deja regir una por
  // par, así que cada vuelta dejaba una fila muerta más. Se reutiliza la
  // canónica de Local y no hace falta ni sembrar ni barrer.
  await tasaCanonicaQA(admin);
}

void sembrarFx().then(main);
