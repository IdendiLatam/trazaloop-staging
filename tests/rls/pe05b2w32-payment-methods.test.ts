/**
 * Trazaloop · PE-05B2W3.2 · El medio de pago no es una suscripción del proveedor.
 *
 * La prueba real de renovación se paró contra un índice: la misma tarjeta
 * guardada no podía financiar dos intentos, porque su identificador vivía en
 * la columna que 0171 reservó para el objeto recurrente de la OTRA pasarela.
 * Son dos cosas distintas y aquí se separan sin tocar la que ya funcionaba.
 *
 * Y de paso muere la segunda verdad del calendario: la renovación vieja
 * calculaba fechas con `now()`; ahora salda la obligación canónica.
 *
 * Correr: npm run test:pe05b2w32-payment-methods
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";
const personas: string[] = [];
const W = "wompi";
const MP = "mercadopago";
const SQL173 = readFileSync(
  "supabase/migrations/0173_billing_payment_method_and_period_renewal.sql", "utf8");

async function persona(prefijo: string, papel?: "superadmin") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA W32" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "w32" });
  if (papel) {
    await admin.from("platform_staff").insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  return { id: data.user!.id, email, cli };
}

async function empresa(quien: Awaited<ReturnType<typeof persona>>, nombre: string) {
  const { data } = await quien.cli.rpc("create_organization",
    { p_name: nombre, p_tax_id: null, p_country: "CO" });
  const org = data as string;
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", quien.id);
  return org;
}

async function main() {
  const sa = await persona("w32-sa", "superadmin");
  const ana = await persona("w32-ana");
  const beto = await persona("w32-beto");
  const org = await empresa(ana, `QA W32 A ${sello}`);
  const otra = await empresa(beto, `QA W32 B ${sello}`);

  const { error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA PE-05B2W32 ${sello} · tasa sintetica, NO comercial` });
  assert(!efx, `tasa: ${efx?.message}`);

  console.log("\nPE-05B2W3.2 · El medio de pago, separado de la suscripción del proveedor\n");

  const intentoDe = async (
    quien: Awaited<ReturnType<typeof persona>>, orgId: string, prov: string) => {
    const { data: q, error: eq } = await quien.cli.rpc("billing_create_quote", {
      p_organization_id: orgId, p_plan_code: "full", p_billing_interval: "monthly" });
    assert(!eq, `presupuesto: ${eq?.message}`);
    const { data: i, error: ei } = await quien.cli.rpc("billing_open_checkout_intent", {
      p_quote_id: (q as { quote_id: string }).quote_id, p_provider: prov, p_environment: "test" });
    assert(!ei, `intento: ${ei?.message}`);
    return i as unknown as { intent_id: string; expected_total_amount: number };
  };
  const periodos = async (orgId: string) => {
    const { data } = await admin.from("billing_subscription_periods")
      .select("id, subscription_id, period_sequence, period_start, period_end, status")
      .eq("organization_id", orgId).order("period_sequence");
    return (data ?? []) as Record<string, unknown>[];
  };
  const registrar = async (orgId: string, ref: string, entorno = "test", prov = W) => {
    const { data, error } = await admin.rpc("billing_register_payment_method", {
      p_organization_id: orgId, p_provider: prov,
      p_provider_payment_method_id: ref, p_environment: entorno, p_created_by: null });
    assert(!error, `registrar: ${error?.message}`);
    return data as Record<string, unknown>;
  };
  const atar = async (intento: string, metodo: string) => {
    const { data, error } = await admin.rpc("billing_attach_intent_payment_method", {
      p_intent_id: intento, p_payment_method_id: metodo });
    assert(!error, `atar: ${error?.message}`);
    return data as Record<string, unknown>;
  };
  const intentoCrudo = async (orgId: string, periodo: string | null, estado = "created") => {
    const { data: base } = await admin.from("billing_checkout_intents")
      .select("quote_id").eq("organization_id", orgId).limit(1).single();
    return admin.from("billing_checkout_intents").insert({
      organization_id: orgId, quote_id: (base as { quote_id: string }).quote_id,
      provider: W, environment: "test", expected_total_amount: 190400,
      expected_currency: "COP", billing_interval: "monthly", plan_code: "full",
      period_id: periodo, status: estado }).select("id").single();
  };

  let sub = "";
  let metodo = "";
  const tarjeta = `371065-${sello}`;

  try {
    // =====================================================================
    console.log("A · Un solo medio de pago para todos los cobros");
    // =====================================================================

    await check("La contratación se ata al medio de pago y se salda", async () => {
      const r = await registrar(org, tarjeta);
      assert(r.status === "registered" && r.payment_method_id, JSON.stringify(r));
      metodo = r.payment_method_id as string;

      const i = await intentoDe(ana, org, W);
      const a = await atar(i.intent_id, metodo);
      assert(a.status === "attached", JSON.stringify(a));

      const { data, error } = await admin.rpc("billing_settle_provider_payment", {
        p_provider: W, p_external_reference: i.intent_id,
        p_provider_payment_id: `w32-ini-${sello}`, p_outcome: "approved",
        p_amount: i.expected_total_amount, p_currency: "COP",
        p_live_mode: false, p_failure_reason: null });
      assert(!error, `liquidar: ${error?.message}`);
      assert((data as Record<string, unknown>).outcome === "activated", JSON.stringify(data));

      const ps = await periodos(org);
      assert(ps.length === 1 && ps[0].status === "settled", JSON.stringify(ps));
      sub = ps[0].subscription_id as string;
    });

    await check("Registrarlo otra vez no duplica nada", async () => {
      const r = await registrar(org, tarjeta);
      assert(r.status === "already_registered" && r.payment_method_id === metodo,
        JSON.stringify(r));
      const { count } = await admin.from("billing_payment_methods")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert(count === 1, `hay ${count} medios de pago para una sola tarjeta`);
    });

    await check("C. Y el MISMO medio de pago financia intentos sucesivos", async () => {
      // Justo lo que el modelo anterior hacía imposible: la contratación ya
      // está atada, y ahora dos renovaciones más se atan a la misma tarjeta.
      const { data: p2 } = await admin.rpc("billing_open_next_period", { p_subscription_id: sub });
      const per2 = (p2 as Record<string, unknown>).period_id as string;

      const { data: uno, error: e1 } = await intentoCrudo(org, per2);
      assert(!e1, `primer intento de renovación: ${e1?.message}`);
      const a1 = await atar((uno as { id: string }).id, metodo);
      assert(a1.status === "attached", JSON.stringify(a1));

      // Ese intento termina mal; el siguiente es un reintento legítimo.
      await admin.from("billing_checkout_intents")
        .update({ status: "declined" }).eq("id", (uno as { id: string }).id);
      const { data: dos, error: e2 } = await intentoCrudo(org, per2);
      assert(!e2, `reintento: ${e2?.message}`);
      const a2 = await atar((dos as { id: string }).id, metodo);
      assert(a2.status === "attached", JSON.stringify(a2));

      const { count } = await admin.from("billing_checkout_intents")
        .select("id", { count: "exact", head: true }).eq("payment_method_id", metodo);
      assert((count ?? 0) >= 3,
        `la misma tarjeta solo financió ${count} intentos: el índice viejo sigue mandando`);
    });

    // =====================================================================
    console.log("\nB · Lo que NO se debilitó");
    // =====================================================================

    await check("B. La suscripción del proveedor sigue siendo única", async () => {
      const i1 = await intentoDe(ana, org, MP);
      const { error: e1 } = await admin.rpc("billing_attach_provider_subscription", {
        p_intent_id: i1.intent_id, p_provider_subscription_id: `pre-w32-${sello}`,
        p_init_point: null, p_provider_status: null, p_status: null,
        p_synced_amount: null, p_provider_version: null, p_next_payment_date: null });
      assert(!e1, `primera: ${e1?.message}`);

      const i2 = await intentoDe(ana, org, MP);
      const { error: e2 } = await admin.rpc("billing_attach_provider_subscription", {
        p_intent_id: i2.intent_id, p_provider_subscription_id: `pre-w32-${sello}`,
        p_init_point: null, p_provider_status: null, p_status: null,
        p_synced_amount: null, p_provider_version: null, p_next_payment_date: null });
      assert(e2, "dos intentos pudieron reclamar la MISMA suscripción del proveedor");
    });

    await check("Y el índice viejo no se tocó · sigue en la migración anterior", () => {
      assert(!/drop\s+index[^;]*bci_provider_subscription_uniq/i.test(SQL173),
        "0173 tira el índice que protege a la otra pasarela");
      assert(!/bci_provider_subscription_uniq/.test(
        SQL173.replace(/^--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")),
        "0173 toca el índice de la otra pasarela fuera de los comentarios");
      return Promise.resolve();
    });

    // =====================================================================
    console.log("\nC · De quién es una tarjeta");
    // =====================================================================

    await check("D. Conocer el identificador ajeno no da derecho a cobrar con él", async () => {
      const r = await registrar(otra, tarjeta);
      assert(r.status === "owned_by_another_organization" && r.payment_method_id === null,
        JSON.stringify(r));
      const { count } = await admin.from("billing_payment_methods")
        .select("id", { count: "exact", head: true }).eq("organization_id", otra);
      assert((count ?? 0) === 0, "se registró un medio de pago para la empresa equivocada");
    });

    await check("Y atarlo a un intento de otra empresa tampoco", async () => {
      const ajeno = await intentoDe(beto, otra, W);
      const a = await atar(ajeno.intent_id, metodo);
      assert(a.status === "organization_mismatch", JSON.stringify(a));
      const { data } = await admin.from("billing_checkout_intents")
        .select("payment_method_id").eq("id", ajeno.intent_id).single();
      assert((data as { payment_method_id: string | null }).payment_method_id === null,
        "el intento ajeno quedó atado igualmente");
    });

    await check("Ni un instrumento de pruebas a un cobro real", async () => {
      const vivo = await registrar(org, `live-${sello}`, "live");
      const i = await intentoDe(ana, org, W);   // el intento es de pruebas
      const a = await atar(i.intent_id, vivo.payment_method_id as string);
      assert(a.status === "environment_mismatch", JSON.stringify(a));
    });

    await check("Ni uno de otra pasarela", async () => {
      const otroProv = await registrar(org, `mp-${sello}`, "test", MP);
      const i = await intentoDe(ana, org, W);
      const a = await atar(i.intent_id, otroProv.payment_method_id as string);
      assert(a.status === "provider_mismatch", JSON.stringify(a));
    });

    // =====================================================================
    console.log("\nD · Un solo cobro en vuelo por obligación");
    // =====================================================================

    await check("E. Dos trabajadores a la vez NO mandan dos cargos del mismo mes", async () => {
      const ps = await periodos(org);
      const abierto = ps.find((p) => p.status === "open");
      assert(abierto, "no hay obligación abierta con la que probar");
      // Queda uno en vuelo del bloque A; otro más debe ser imposible.
      const { error } = await intentoCrudo(org, abierto!.id as string);
      assert(error, "se abrieron dos cobros en vuelo para la misma obligación");
    });

    await check("F. Pero tras un intento terminal, el reintento legítimo cabe", async () => {
      const ps = await periodos(org);
      const abierto = ps.find((p) => p.status === "open")!;
      const { data: vivos } = await admin.from("billing_checkout_intents")
        .select("id").eq("period_id", abierto.id as string)
        .in("status", ["created", "provider_created", "authorized"]);
      assert((vivos ?? []).length === 1, `hay ${(vivos ?? []).length} en vuelo`);
      await admin.from("billing_checkout_intents")
        .update({ status: "failed" }).eq("id", (vivos as { id: string }[])[0].id);
      const { error } = await intentoCrudo(org, abierto.id as string);
      assert(!error, `el reintento legítimo fue rechazado: ${error?.message}`);
    });

    // =====================================================================
    console.log("\nE · La renovación vieja ya no calcula fechas");
    // =====================================================================

    await check("H. Salda la obligación canónica, no `now() + un mes`", async () => {
      // Una contratación por la pasarela que gestiona su propia recurrencia.
      const bet = await persona("w32-cris");
      const orgMp = await empresa(bet, `QA W32 MP ${sello}`);
      const i = await intentoDe(bet, orgMp, MP);
      await admin.rpc("billing_attach_provider_subscription", {
        p_intent_id: i.intent_id, p_provider_subscription_id: `pre-mp-${sello}`,
        p_init_point: null, p_provider_status: null, p_status: null,
        p_synced_amount: null, p_provider_version: 1, p_next_payment_date: null });
      const { data: act } = await admin.rpc("billing_settle_provider_payment", {
        p_provider: MP, p_external_reference: i.intent_id,
        p_provider_payment_id: `mp-ini-${sello}`, p_outcome: "approved",
        p_amount: i.expected_total_amount, p_currency: "COP",
        p_live_mode: false, p_failure_reason: null });
      assert((act as Record<string, unknown>).outcome === "activated", JSON.stringify(act));

      const antes = await periodos(orgMp);
      assert(antes.length === 1, JSON.stringify(antes));
      const fin1 = antes[0].period_end as string;

      const { data: r, error } = await admin.rpc("billing_record_renewal_payment", {
        p_provider: MP, p_provider_subscription_id: `pre-mp-${sello}`,
        p_provider_payment_id: `mp-ren-${sello}`, p_outcome: "approved",
        p_amount: i.expected_total_amount, p_currency: "COP", p_live_mode: false });
      assert(!error, `renovar: ${error?.message}`);
      assert((r as Record<string, unknown>).outcome === "renewed", JSON.stringify(r));

      const luego = await periodos(orgMp);
      assert(luego.length === 2 && luego[1].status === "settled", JSON.stringify(luego));
      // LA PRUEBA DEL DEFECTO: el periodo nuevo empieza donde acabó el
      // anterior. Con `now()` empezaría hoy, y el mes cobrado duraría segundos.
      assert(luego[1].period_start === fin1,
        `el periodo 2 empieza en ${luego[1].period_start} y el 1 acabó en ${fin1}`);
      const { data: bounds } = await admin.rpc("billing_period_bounds", {
        p_anchor: antes[0].period_start as string, p_interval: "monthly", p_sequence: 2 });
      const b = bounds as { period_start: string; period_end: string };
      assert(new Date(luego[1].period_end as string).getTime()
             === new Date(b.period_end).getTime(),
        `fin ${luego[1].period_end} en vez de ${b.period_end}`);
      const { data: s } = await admin.from("billing_subscriptions")
        .select("current_period_start, current_period_end, renews_at")
        .eq("organization_id", orgMp).single();
      const sf = s as Record<string, string>;
      assert(sf.current_period_start === luego[1].period_start
             && sf.current_period_end === luego[1].period_end
             && sf.renews_at === luego[1].period_end,
        `la suscripción no quedó en el periodo saldado: ${JSON.stringify(sf)}`);
      // Y no calcula por su cuenta: el cuerpo de la función ya no suma meses.
      const cuerpo = SQL173.slice(SQL173.indexOf("function public.billing_record_renewal_payment"));
      assert(!/now\(\)\s*\+/.test(cuerpo), "la renovación volvió a sumarle un mes al reloj");

      // I. Y lo que ya protegía sigue protegiendo.
      const { data: rep } = await admin.rpc("billing_record_renewal_payment", {
        p_provider: MP, p_provider_subscription_id: `pre-mp-${sello}`,
        p_provider_payment_id: `mp-ren-${sello}`, p_outcome: "approved",
        p_amount: i.expected_total_amount, p_currency: "COP", p_live_mode: false });
      assert((rep as Record<string, unknown>).outcome === "already_settled", JSON.stringify(rep));
      assert((await periodos(orgMp)).length === 2, "el aviso repetido abrió otra obligación");

      const { data: mal } = await admin.rpc("billing_record_renewal_payment", {
        p_provider: MP, p_provider_subscription_id: `pre-mp-${sello}`,
        p_provider_payment_id: `mp-ren-mal-${sello}`, p_outcome: "approved",
        p_amount: 1, p_currency: "COP", p_live_mode: false });
      assert((mal as Record<string, unknown>).outcome === "reconciliation_mismatch",
        JSON.stringify(mal));

      // G. Un SEGUNDO cobro aprobado del mismo periodo no vuelve a avanzar.
      const per2 = luego[1].id as string;
      const { data: seg } = await admin.rpc("billing_settle_period_payment", {
        p_period_id: per2, p_provider: MP, p_provider_payment_id: `mp-doble-${sello}`,
        p_outcome: "approved", p_amount: i.expected_total_amount,
        p_currency: "COP", p_live_mode: false });
      assert((seg as Record<string, unknown>).outcome === "period_already_settled",
        JSON.stringify(seg));
      const { data: s2 } = await admin.from("billing_subscriptions")
        .select("current_period_end").eq("organization_id", orgMp).single();
      assert((s2 as { current_period_end: string }).current_period_end === sf.current_period_end,
        "el segundo cobro movió el derecho");
      assert((await periodos(orgMp)).length === 2, "el segundo cobro consumió el mes siguiente");

      await limpiar(orgMp);
    });

    // =====================================================================
    console.log("\nF · Qué se guarda, y quién lo ve");
    // =====================================================================

    await check("Del medio de pago no se guarda ni un dígito de la tarjeta", () => {
      const prohibidas = ["pan", "card_number", "cvv", "cvc", "security_code",
                          "expiration", "exp_month", "exp_year", "card_token", "acceptance"];
      const bloque = SQL173.slice(SQL173.indexOf("create table if not exists public.billing_payment_methods"),
                                  SQL173.indexOf("create unique index if not exists bpm_provider_reference_uniq"));
      for (const p of prohibidas) {
        assert(!new RegExp(`^\\s+[a-z_]*${p}`, "mi").test(bloque),
          `el medio de pago guarda «${p}»`);
      }
      return Promise.resolve();
    });

    await check("El administrador ve sus medios de pago · un ajeno no · nadie escribe", async () => {
      const { data: mios } = await ana.cli.from("billing_payment_methods").select("id");
      assert((mios ?? []).length > 0, "el administrador no ve sus propios medios de pago");
      const { data: suyos } = await beto.cli.from("billing_payment_methods").select("id");
      assert((suyos ?? []).length === 0, "un ajeno vio medios de pago de otra empresa");
      const { data: staff } = await sa.cli.from("billing_payment_methods").select("id");
      assert((staff ?? []).length > 0, "la plataforma no puede operar");
      const { error } = await ana.cli.from("billing_payment_methods").insert({
        organization_id: org, provider: W, provider_payment_method_id: "inventada",
        environment: "test" });
      assert(error, "un cliente pudo inventarse un medio de pago");
      for (const fn of ["billing_register_payment_method", "billing_attach_intent_payment_method"]) {
        const { error: e } = await ana.cli.rpc(fn, {});
        assert(e, `un cliente pudo llamar a ${fn}`);
      }
    });
  } finally {
    await limpiar(org);
    await limpiar(otra);
    // La lectura se acota EN LA BASE a las tasas activas en lugar de traerse la
    // tabla entera y filtrar aquí: PostgREST devuelve como mucho 1000 filas y
    // esta tabla ya las pasó, así que la tasa recién sembrada caía fuera de la
    // página y la limpieza no encontraba nada que retirar —ni lo decía—. Una
    // tasa ya retirada no es precio para nadie: solo estorban las activas.
    const { data: tasas } = await admin.from("commercial_fx_rates")
      .select("id, note").eq("status", "active");
    for (const t of ((tasas ?? []) as { id: string; note: string | null }[])
      .filter((x) => (x.note ?? "").includes(`QA PE-05B2W32 ${sello}`))) {
      await admin.from("commercial_fx_rates")
        .update({ status: "retired" }).eq("id", t.id);
    }
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.from("user_legal_acceptances").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B2W3.2 · medios de pago: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

/** El periodo y el cobro se apuntan mutuamente: hay que soltar el nudo antes. */
async function limpiar(orgId: string) {
  await admin.from("billing_subscription_periods")
    .update({ settled_payment_id: null }).eq("organization_id", orgId);
  await admin.from("billing_payments").update({ period_id: null }).eq("organization_id", orgId);
  await admin.from("billing_quotes").update({ subscription_id: null }).eq("organization_id", orgId);
  await admin.from("billing_checkout_intents")
    .update({ payment_method_id: null, period_id: null }).eq("organization_id", orgId);
  for (const t of ["billing_provider_events", "billing_payments",
                   "billing_subscription_periods", "billing_checkout_intents",
                   "billing_payment_methods", "billing_quotes", "billing_subscriptions",
                   "ai_credit_ledger", "organization_usage_minutes",
                   "organization_usage_leases", "commercial_assignment_events",
                   "organization_plan_assignments", "subscription_plan_history",
                   "organization_subscriptions", "organization_modules", "memberships"]) {
    const { error } = await admin.from(t).delete().eq("organization_id", orgId);
    if (error) console.error(`  (residuo) ${t}: ${error.message}`);
  }
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  if (error) console.error(`  (residuo) empresa: ${error.message}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
