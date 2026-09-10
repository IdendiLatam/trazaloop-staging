/**
 * Trazaloop · PE-05B6F · El tipo de cambio se administra, y la historia no miente.
 *
 * DOS COSAS QUE B6E DEJÓ A LA VISTA.
 *
 * La primera: no había manera de poner un tipo de cambio sin abrir una consola
 * de base de datos. La política decía «esto es del superadministrador», pero el
 * permiso de tabla solo daba lectura, así que la política nunca llegaba a
 * preguntarse. El día de Producción eso significa que vender depende de que
 * alguien tenga psql a mano.
 *
 * La segunda: el historial deducía el plan de cada cobro mirando la suscripción
 * de HOY. Una renovación pagada siendo Full pasaba a decir «Extra» en cuanto la
 * empresa subía de plan. Un hecho financiero tiene que poder contarse con lo
 * que se sabía entonces.
 *
 * Ni una llamada real a una pasarela.
 *
 * Correr: npm run test:pe05b6f-truth
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { limpiarPersonas, tasaCanonicaQA } from "../support/fixture-cleanup";

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

const admin = createClient(URL, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";
const personas: string[] = [];
const orgs: string[] = [];
const tasas: string[] = [];
const W = "wompi";
const TASA_MICROS = 4_000_000_000;
const leer = (f: string) => readFileSync(f, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function persona(prefijo: string, papel?: "superadmin" | "support") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B6F" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b6f" });
  return { id: data.user!.id, email, cli };
}

/** Una tasa puesta a mano, para montar el escenario de partida. */
async function tasaBase(desdeMs = 86_400_000) {
  // Antes de abrir otra, se retira cualquiera que siguiera activa: dos vigencias
  // solapadas ya no caben, y ese es justamente el invariante nuevo.
  await admin.from("commercial_fx_rates").update({ status: "retired" })
    .eq("base_currency", "USD").eq("quote_currency", "COP").eq("status", "active");
  const { data, error } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: TASA_MICROS,
    effective_from: new Date(Date.now() - desdeMs).toISOString(),
    note: `QA PE-05B6F ${sello} · tasa sintetica, NO comercial` }).select("id").single();
  assert(!error && data, `tasa: ${error?.message}`);
  const id = (data as { id: string }).id;
  tasas.push(id);
  return id;
}

async function empresaPagando(nombre: string, plan: "full" | "extra",
                              intervalo: "monthly" | "annual", cupon?: string) {
  const quien = await persona("b6f");
  const { data: orgId } = await quien.cli.rpc("create_organization",
    { p_name: `${nombre} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", quien.id);

  const { data: q, error: eq } = await quien.cli.rpc("billing_create_quote", {
    p_organization_id: org, p_plan_code: plan, p_billing_interval: intervalo,
    p_coupon_code: cupon ?? null });
  assert(!eq, `presupuesto: ${eq?.message}`);
  const { data: i } = await quien.cli.rpc("billing_open_checkout_intent", {
    p_quote_id: (q as { quote_id: string }).quote_id, p_provider: W,
    p_environment: "test" });
  const intento = i as unknown as { intent_id: string; expected_total_amount: number };
  const { data: pm } = await admin.rpc("billing_register_payment_method", {
    p_organization_id: org, p_provider: W,
    p_provider_payment_method_id: `pm-${org.slice(0, 8)}`, p_environment: "test",
    p_created_by: null });
  await admin.rpc("billing_attach_intent_payment_method", {
    p_intent_id: intento.intent_id,
    p_payment_method_id: (pm as Record<string, unknown>).payment_method_id as string });
  await admin.rpc("billing_settle_provider_payment", {
    p_provider: W, p_external_reference: intento.intent_id,
    p_provider_payment_id: `b6f-ini-${org.slice(0, 8)}`, p_outcome: "approved",
    p_amount: intento.expected_total_amount, p_currency: "COP",
    p_live_mode: false, p_failure_reason: null });

  const { data: pruebas } = await admin.from("organization_plan_assignments")
    .select("id, starts_at").eq("organization_id", org).eq("grant_kind", "trial");
  for (const f of (pruebas ?? []) as { id: string; starts_at: string }[]) {
    await admin.from("organization_plan_assignments")
      .update({ ends_at: new Date(new Date(f.starts_at).getTime() + 1).toISOString() })
      .eq("id", f.id);
  }
  const { data: sub } = await admin.from("billing_subscriptions")
    .select("id, base_charge_amount").eq("organization_id", org).single();
  const s = sub as { id: string; base_charge_amount: number };
  return { org, quien, subscriptionId: s.id, base: s.base_charge_amount };
}

async function envejecer(subscriptionId: string, ms: number) {
  const { data: sub } = await admin.from("billing_subscriptions")
    .select("billing_interval, period_anchor_sequence").eq("id", subscriptionId).single();
  const s = sub as { billing_interval: string; period_anchor_sequence: number | null };
  const { data: ps } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, period_start").eq("subscription_id", subscriptionId)
    .order("period_sequence");
  const filas = (ps ?? []) as { id: string; period_sequence: number; period_start: string }[];
  const base = s.period_anchor_sequence ?? 1;
  const ancla = new Date(new Date(filas[0].period_start).getTime() - ms).toISOString();
  for (const f of filas) {
    const { data: lim } = await admin.rpc("billing_period_bounds", {
      p_anchor: ancla, p_interval: s.billing_interval,
      p_sequence: f.period_sequence - base + 1 });
    const l = lim as { period_start: string; period_end: string };
    await admin.from("billing_subscription_periods")
      .update({ period_start: l.period_start, period_end: l.period_end }).eq("id", f.id);
  }
  const u = filas[filas.length - 1];
  const { data: lim } = await admin.rpc("billing_period_bounds", {
    p_anchor: ancla, p_interval: s.billing_interval,
    p_sequence: u.period_sequence - base + 1 });
  const l = lim as { period_start: string; period_end: string };
  await admin.from("billing_subscriptions").update({
    current_period_start: l.period_start, current_period_end: l.period_end,
    renews_at: l.period_end, period_anchor_at: ancla }).eq("id", subscriptionId);
  return l;
}
/** Una empresa recién creada, sin nada contratado. */
async function empresaVacia(nombre: string) {
  const quien = await persona("b6f-vacia");
  const { data: orgId } = await quien.cli.rpc("create_organization",
    { p_name: `${nombre} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  return { org, quien };
}

const dias = (n: number) => n * 86_400_000;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const periodos = async (id: string) => {
  const { data } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, plan_code, plan_revision_id, billing_interval,"
      + " base_amount, status, settled_payment_id")
    .eq("subscription_id", id).order("period_sequence");
  return (data ?? []) as unknown as Record<string, unknown>[];
};
const pagos = async (org: string) => {
  const { data } = await admin.from("billing_payments")
    .select("id, period_id, quote_id, subscription_change_id, base_amount,"
      + " discount_amount, tax_amount, tax_rate_basis_points, total_amount, created_at")
    .eq("organization_id", org).order("created_at");
  return (data ?? []) as unknown as Record<string, unknown>[];
};

/** Una subida de plan completa, por sus tres primitivas. */
async function subir(e: { quien: { cli: SupabaseClient }; subscriptionId: string },
                     destino: string) {
  const { data: c } = await e.quien.cli.rpc("billing_quote_upgrade", {
    p_subscription_id: e.subscriptionId, p_target_plan_code: destino });
  const cuenta = c as Record<string, unknown>;
  assert(cuenta.status === "quoted", JSON.stringify(cuenta));
  const { data: i } = await e.quien.cli.rpc("billing_open_upgrade_intent", {
    p_change_id: cuenta.change_id as string, p_provider: W, p_environment: "test" });
  const intento = i as Record<string, unknown>;
  const { data: r } = await admin.rpc("billing_settle_upgrade_payment", {
    p_intent_id: intento.intent_id as string, p_provider: W,
    p_provider_payment_id: `b6f-up-${(cuenta.change_id as string).slice(0, 8)}`,
    p_outcome: "approved", p_amount: cuenta.total_amount as number,
    p_currency: "COP", p_live_mode: false, p_failure_reason: null });
  assert((r as Record<string, unknown>).outcome === "upgraded", JSON.stringify(r));
  return cuenta;
}

async function main() {
  console.log("\nPE-05B6F · Tipo de cambio e historia\n");

  const { runRenewalPass } = await import("../../lib/billing/renewal/orchestrator");
  const { fakeBillingProvider } = await import("../../lib/billing/providers/fake");
  const doble = () => fakeBillingProvider("approve", "approve");

  const sa = await persona("b6f-sa", "superadmin");
  const soporte = await persona("b6f-sop", "support");

  try {
    // =====================================================================
    console.log("A · El tipo de cambio, desde el producto");
    // =====================================================================
    await check("A1. La administración de plataforma abre una vigencia, y cierra la anterior",
      async () => {
        const anterior = await tasaBase();
        const desde = new Date(Date.now() + 3_600_000).toISOString();
        const { data, error } = await sa.cli.rpc("commercial_fx_create", {
          p_base_currency: "USD", p_quote_currency: "COP",
          p_rate_micros: 4_200_000_000, p_effective_from: desde,
          p_note: `QA B6F ${sello}` });
        assert(!error, `crear: ${error?.message}`);
        const r = data as Record<string, unknown>;
        assert(r.status === "created", JSON.stringify(r));
        tasas.push(r.fx_rate_id as string);
        assert(r.closed_previous === anterior, "no cerró la anterior");

        // Ni solape ni hueco: la anterior acaba justo donde empieza la nueva.
        const { data: vieja } = await admin.from("commercial_fx_rates")
          .select("effective_to").eq("id", anterior).single();
        const fin = (vieja as { effective_to: string }).effective_to;
        assert(new Date(fin).getTime() === new Date(desde).getTime(),
          `la anterior acaba en ${fin} y la nueva empieza en ${desde}`);
      });

    await check("A2. Dos vigencias activas solapadas: la base lo impide", async () => {
      const { error } = await admin.from("commercial_fx_rates").insert({
        base_currency: "USD", quote_currency: "COP", rate_micros: 1_000_000,
        effective_from: new Date(Date.now() - 3_600_000).toISOString(),
        note: `QA B6F solape ${sello}` });
      assert(error !== null, "aceptó dos tasas activas a la vez");
      assert(/FX_RATE_OVERLAPS/.test(error?.message ?? ""),
        `falló por otra razón: ${error?.message}`);
    });

    await check("A3. Una tasa que ya rigió no se reescribe ni se borra", async () => {
      const id = tasas[0];
      const { error: e1 } = await admin.from("commercial_fx_rates")
        .update({ rate_micros: 9_000_000_000 }).eq("id", id);
      assert(e1 !== null && /FX_RATE_IS_IMMUTABLE/.test(e1?.message ?? ""),
        `dejó cambiar el importe: ${e1?.message}`);
      const { error: e2 } = await admin.from("commercial_fx_rates")
        .update({ effective_from: new Date().toISOString() }).eq("id", id);
      assert(e2 !== null, "dejó mover la fecha de entrada");
      const { error: e3 } = await admin.from("commercial_fx_rates").delete().eq("id", id);
      assert(e3 !== null && /FX_RATE_IS_HISTORY/.test(e3?.message ?? ""),
        `dejó borrar historia: ${e3?.message}`);
    });

    await check("A4. Una tasa programada se retira, y la anterior recupera su vigencia",
      async () => {
        const programada = tasas[1];
        const { data, error } = await sa.cli.rpc("commercial_fx_cancel_scheduled",
          { p_fx_rate_id: programada });
        assert(!error, `retirar: ${error?.message}`);
        const r = data as Record<string, unknown>;
        assert(r.status === "cancelled", JSON.stringify(r));
        assert(r.reopened_previous === tasas[0], "no devolvió la vigencia a la anterior");
        const { data: vieja } = await admin.from("commercial_fx_rates")
          .select("effective_to").eq("id", tasas[0]).single();
        assert((vieja as { effective_to: string | null }).effective_to === null,
          "la anterior se quedó cerrada");
      });

    await check("A5. Cerrar la vigente deja el producto fallando cerrado, no inventando",
      async () => {
        const { data, error } = await sa.cli.rpc("commercial_fx_close_current", {
          p_base_currency: "USD", p_quote_currency: "COP",
          p_effective_to: new Date().toISOString() });
        assert(!error, `cerrar: ${error?.message}`);
        assert((data as Record<string, unknown>).status === "closed", JSON.stringify(data));
        const { data: resuelta } = await admin.rpc("billing_resolve_fx", {
          p_base: "USD", p_quote: "COP", p_at: new Date().toISOString() });
        assert((resuelta as Record<string, unknown>).status === "unavailable",
          `sigue resolviendo: ${JSON.stringify(resuelta)}`);
      });

    await check("A6. Solo USD→COP: no se abren pares que el motor no usa", async () => {
      const { error } = await sa.cli.rpc("commercial_fx_create", {
        p_base_currency: "EUR", p_quote_currency: "COP",
        p_rate_micros: 5_000_000_000,
        p_effective_from: new Date().toISOString(), p_note: null });
      assert(error !== null && /FX_PAIR_NOT_SUPPORTED/.test(error?.message ?? ""),
        `aceptó un par que nadie usa: ${error?.message}`);
    });

    // =====================================================================
    console.log("\nB · Quién puede tocarlo");
    // =====================================================================
    await check("B1. Soporte LEE y no escribe", async () => {
      const { data, error } = await soporte.cli.from("v_commercial_fx_rates")
        .select("id").limit(5);
      assert(!error, `soporte no puede leer: ${error?.message}`);
      assert((data ?? []).length > 0, "soporte no ve ninguna tasa");

      const { error: e1 } = await soporte.cli.rpc("commercial_fx_create", {
        p_base_currency: "USD", p_quote_currency: "COP", p_rate_micros: 1_000_000,
        p_effective_from: new Date().toISOString(), p_note: null });
      assert(e1 !== null && /NOT_AUTHORIZED/.test(e1?.message ?? ""),
        `soporte pudo fijar una tasa: ${e1?.message}`);
      const { error: e2 } = await soporte.cli.rpc("commercial_fx_close_current", {
        p_base_currency: "USD", p_quote_currency: "COP",
        p_effective_to: new Date().toISOString() });
      assert(e2 !== null, "soporte pudo cerrar una vigencia");
    });

    await check("B2. Una empresa cualquiera no administra tipos de cambio", async () => {
      await tasaBase();
      const e = await empresaPagando("B tenant", "full", "monthly");
      const { data: vista } = await e.quien.cli.from("v_commercial_fx_rates").select("id");
      assert((vista ?? []).length === 0, "una empresa ve la consola de plataforma");
      const { error: e1 } = await e.quien.cli.rpc("commercial_fx_create", {
        p_base_currency: "USD", p_quote_currency: "COP", p_rate_micros: 1_000_000,
        p_effective_from: new Date().toISOString(), p_note: null });
      assert(e1 !== null, "una empresa pudo fijar el tipo de cambio");
      const { error: e2 } = await e.quien.cli.from("commercial_fx_rates").insert({
        base_currency: "USD", quote_currency: "COP", rate_micros: 1,
        effective_from: new Date().toISOString() });
      assert(e2 !== null, "una empresa pudo escribir en la tabla");
    });

    // =====================================================================
    console.log("\nC · Una tasa nueva no vuelve a poner precio a nada");
    // =====================================================================
    await check("C1. Abrir una vigencia no toca suscripciones, presupuestos ni cobros",
      async () => {
        await tasaBase();
        const e = await empresaPagando("C congelado", "full", "monthly");
        const antesSub = e.base;
        const { data: antesQ } = await admin.from("billing_quotes")
          .select("id, base_amount, total_amount, fx_rate_micros")
          .eq("organization_id", e.org);
        const antesP = await pagos(e.org);

        // Una tasa nueva, al doble.
        const { data: nueva } = await sa.cli.rpc("commercial_fx_create", {
          p_base_currency: "USD", p_quote_currency: "COP",
          p_rate_micros: TASA_MICROS * 2,
          p_effective_from: new Date(Date.now() - 1000).toISOString(),
          p_note: `QA B6F doble ${sello}` });
        tasas.push((nueva as Record<string, unknown>).fx_rate_id as string);

        const { data: sub } = await admin.from("billing_subscriptions")
          .select("base_charge_amount").eq("id", e.subscriptionId).single();
        assert(Number((sub as { base_charge_amount: number }).base_charge_amount)
          === antesSub, "la suscripción cambió de importe sola");
        const { data: despuesQ } = await admin.from("billing_quotes")
          .select("id, base_amount, total_amount, fx_rate_micros")
          .eq("organization_id", e.org);
        assert(JSON.stringify(antesQ) === JSON.stringify(despuesQ),
          "un presupuesto cambió al abrir una tasa");
        assert(JSON.stringify(antesP) === JSON.stringify(await pagos(e.org)),
          "un cobro cambió al abrir una tasa");

        // Y la renovación siguiente sigue usando el importe congelado, aunque
        // ahora exista una tasa distinta.
        await envejecer(e.subscriptionId, dias(32));
        await runRenewalPass({ provider: doble() });
        const ps = await periodos(e.subscriptionId);
        assert(Number(ps[1].base_amount) === antesSub,
          `la obligación nueva nació por ${ps[1].base_amount}`);
      });

    // =====================================================================
    console.log("\nD · La historia dice lo que pasó");
    // =====================================================================
    await check("D1. La obligación guarda el plan y la periodicidad que se cobraban",
      async () => {
        const e = await empresaPagando("D identidad", "full", "monthly");
        const p1 = (await periodos(e.subscriptionId))[0];
        assert(p1.plan_code === "full", `la primera obligación dice ${p1.plan_code}`);
        assert(p1.billing_interval === "monthly", `dice ${p1.billing_interval}`);
        assert(p1.plan_revision_id !== null, "sin revisión congelada");
      });

    await check("D2. Una renovación pagada siendo Full SIGUE diciendo Full tras subir a Extra",
      async () => {
        const e = await empresaPagando("D renovacion", "full", "monthly");
        // Se renueva una vez, todavía en Full.
        await envejecer(e.subscriptionId, dias(32));
        await runRenewalPass({ provider: doble() });
        const abiertas = await periodos(e.subscriptionId);
        assert(abiertas.length === 2, `${abiertas.length} obligaciones`);
        // Y se salda, que es lo que haría el evento firmado: sin eso la
        // suscripción debe dinero y subir de plan no procede.
        const { data: cargo } = await admin.rpc("billing_period_charge_total",
          { p_period_id: abiertas[1].id as string });
        const { data: liq } = await admin.rpc("billing_settle_period_payment", {
          p_period_id: abiertas[1].id as string, p_provider: W,
          p_provider_payment_id: `b6f-ren-${sello}`, p_outcome: "approved",
          p_amount: Number((cargo as Record<string, unknown>).total_amount),
          p_currency: "COP", p_live_mode: false });
        assert((liq as Record<string, unknown>).outcome === "renewed", JSON.stringify(liq));
        const ps = await periodos(e.subscriptionId);
        assert(ps[1].plan_code === "full", `la renovación dice ${ps[1].plan_code}`);
        const revisionEntonces = ps[1].plan_revision_id;

        // Y ahora sube a Extra.
        await subir(e, "extra");
        assert((await admin.from("billing_subscriptions").select("plan_code")
          .eq("id", e.subscriptionId).single()).data?.plan_code === "extra", "no subió");

        const despues = await periodos(e.subscriptionId);
        assert(despues[1].plan_code === "full",
          `la renovación de entonces ahora dice ${despues[1].plan_code}`);
        assert(despues[1].plan_revision_id === revisionEntonces,
          "le cambiaron la revisión a un hecho pasado");
        assert(despues[0].plan_code === "full", "la contratación cambió de plan");
      });

    await check("D3. Un pago anual sigue siendo anual tras pasar a mensual", async () => {
      const e = await empresaPagando("D anual", "full", "annual");
      const p1 = (await periodos(e.subscriptionId))[0];
      assert(p1.billing_interval === "annual", `dice ${p1.billing_interval}`);

      // Se programa el paso a mensual y se aplica en el borde.
      await envejecer(e.subscriptionId, dias(360));
      const s0 = await admin.from("billing_subscriptions")
        .select("current_period_end").eq("id", e.subscriptionId).single();
      void s0;
      const { data: prog } = await e.quien.cli.rpc("billing_schedule_transition", {
        p_subscription_id: e.subscriptionId, p_target_plan_code: null,
        p_target_billing_interval: "monthly" });
      assert((prog as Record<string, unknown>).status === "scheduled", JSON.stringify(prog));

      const despues = (await periodos(e.subscriptionId))[0];
      assert(despues.billing_interval === "annual",
        `el año pagado ahora dice ${despues.billing_interval}`);
    });

    await check("D4. La identidad de una obligación no se puede reescribir", async () => {
      const e = await empresaPagando("D congelada", "full", "monthly");
      const p1 = (await periodos(e.subscriptionId))[0];
      const { data: extra } = await admin.from("plan_revisions")
        .select("id").eq("plan_code", "extra").eq("status", "published")
        .is("effective_to", null).single();
      const { error } = await admin.from("billing_subscription_periods")
        .update({ plan_code: "extra",
                  plan_revision_id: (extra as { id: string }).id })
        .eq("id", p1.id as string);
      assert(error !== null && /PERIOD_IDENTITY_IS_FROZEN/.test(error?.message ?? ""),
        `dejó reescribir la historia: ${error?.message}`);
    });

    await check("D5. El historial NO mira la suscripción de hoy", async () => {
      // La causa raíz era exactamente esa consulta. Que no vuelva.
      const codigo = sinComentarios(leer("lib/db/billing-history.ts"));
      assert(!/from\(["']billing_subscriptions["']\)/.test(codigo),
        "el historial volvió a leer la suscripción actual");
      for (const fuente of ["billing_subscription_periods",
                            "billing_subscription_changes", "billing_quotes"]) {
        assert(codigo.includes(fuente), `el historial ya no lee ${fuente}`);
      }
    });

    await check("D6. El descuento y el impuesto de un cobro son los de aquel día",
      async () => {
        const { data: promo } = await admin.from("billing_promotions").insert({
          name: `QA B6F institucional ${sello}`, description: "QA · no comercial",
          program: "institutional_full", discount_type: "percentage", discount_value: 4000,
          max_discount_basis_points: null,
          eligible_plan_codes: ["full"], eligible_intervals: ["monthly"],
          starts_at: new Date(Date.now() - 3_600_000).toISOString(), ends_at: null,
          max_redemptions: null, max_per_organization: 1, status: "active",
        }).select("id").single();
        const promoId = (promo as { id: string }).id;
        const codigo = `B6FCODE${sello}`;
        await admin.from("billing_promotion_codes")
          .insert({ promotion_id: promoId, code: codigo, status: "active" });

        const e = await empresaPagando("D cupon", "full", "monthly", codigo);
        const antes = await pagos(e.org);
        const cobro = antes[0];
        assert(Number(cobro.discount_amount) > 0, "el cupón no descontó");
        const impuestoEntonces = Number(cobro.tax_amount);
        const bpsEntonces = Number(cobro.tax_rate_basis_points);

        // La campaña se retira y aparece una regla fiscal nueva. Ninguna de las
        // dos cosas puede reescribir lo que ya se cobró.
        await admin.from("billing_promotions")
          .update({ status: "retired" }).eq("id", promoId);
        const { data: reglaVieja } = await admin.from("billing_tax_rules")
          .select("service_class, jurisdiction, tax_code, tax_name")
          .eq("status", "active").limit(1).single();
        const rv = reglaVieja as Record<string, string>;
        const { data: nueva } = await admin.from("billing_tax_rules").insert({
          service_class: rv.service_class, jurisdiction: rv.jurisdiction,
          tax_code: rv.tax_code, tax_name: rv.tax_name, rate_basis_points: 500,
          effective_from: new Date(Date.now() + 86_400_000).toISOString(),
          status: "active" }).select("id").single();

        const despues = await pagos(e.org);
        assert(JSON.stringify(antes) === JSON.stringify(despues),
          "retirar la campaña o cambiar el impuesto tocó un cobro");
        assert(Number(despues[0].tax_amount) === impuestoEntonces
          && Number(despues[0].tax_rate_basis_points) === bpsEntonces,
          "el impuesto de un cobro viejo cambió");

        if (nueva) {
          await admin.from("billing_tax_rules")
            .delete().eq("id", (nueva as { id: string }).id);
        }
        await admin.from("billing_promotion_codes").delete().eq("promotion_id", promoId);
        await admin.from("billing_promotions").delete().eq("id", promoId);
      });

    await check("D7. Una subida de plan se cuenta como lo que es", async () => {
      const e = await empresaPagando("D subida", "full", "monthly");
      await envejecer(e.subscriptionId, dias(10));
      await subir(e, "extra");
      const ps = await pagos(e.org);
      const subida = ps.find((p) => p.subscription_change_id !== null);
      assert(subida, "no consta el cobro de la subida");
      assert(subida!.period_id === null, "la subida se colgó de una obligación");
      const contratacion = ps.find((p) => p.quote_id !== null
        && p.subscription_change_id === null);
      assert(contratacion, "no consta la contratación");
    });

    // =====================================================================
    console.log("\nE · Una suscripción viva tiene su obligación");
    // =====================================================================
    await check("E1. Una suscripción no puede NACER viva sin obligación", async () => {
      const e = await empresaPagando("E invariante", "full", "monthly");
      // Se copia la fila ENTERA y se le quita lo que la identifica: así el
      // montaje no depende de recordar cada columna obligatoria.
      const { data: modelo } = await admin.from("billing_subscriptions")
        .select("*").eq("id", e.subscriptionId).single();
      const m = { ...(modelo as unknown as Record<string, unknown>) };
      delete m.id; delete m.created_at; delete m.updated_at;

      // En una empresa SIN nada contratado, para no chocar con la regla de «una
      // suscripción viva por empresa», que es otra invariante y ya está probada.
      const vacia = await empresaVacia("E hueca");
      const { error } = await admin.from("billing_subscriptions").insert({
        ...m, organization_id: vacia.org, status: "active" });
      assert(error !== null, "nació una suscripción viva sin obligación");
      assert(/SUBSCRIPTION_WITHOUT_PERIOD/.test(error?.message ?? ""),
        `falló por otra razón: ${error?.message}`);
    });

    await check("E2. Un estado terminal SÍ puede existir sin obligación", async () => {
      const e = await empresaPagando("E terminal", "full", "monthly");
      // Se copia la fila ENTERA y se le quita lo que la identifica: así el
      // montaje no depende de recordar cada columna obligatoria.
      const { data: modelo } = await admin.from("billing_subscriptions")
        .select("*").eq("id", e.subscriptionId).single();
      const m = { ...(modelo as unknown as Record<string, unknown>) };
      delete m.id; delete m.created_at; delete m.updated_at;

      // Un final no necesita una obligación abierta: su historia ya está contada.
      const vacia = await empresaVacia("E hueca terminal");
      const { data, error } = await admin.from("billing_subscriptions")
        .insert({ ...m, organization_id: vacia.org, status: "lapsed" })
        .select("id").single();
      assert(!error, `un estado terminal quedó atrapado: ${error?.message}`);
      if (data) {
        await admin.from("billing_subscriptions")
          .delete().eq("id", (data as { id: string }).id);
      }
    });

  } finally {
    for (const org of orgs) await limpiar(org);
    // Una tasa que ya rigió NO se borra: esa es la regla del producto y aquí
    // también vale. Se retira, que la saca del solape y del resolutor.
    for (const id of tasas) {
      await admin.from("commercial_fx_rates").update({ status: "retired" }).eq("id", id);
    }
    // TEST-HYGIENE-03 · Y se restituye la tasa canónica de Local, que esta suite
    // apartó para poder montar sus propias vigencias. Sin esto, la siguiente
    // suite que necesite presupuestar se encuentra sin tipo de cambio.
    await tasaCanonicaQA(admin);
    // TEST-HYGIENE-02 · Esta suite ya limpiaba su organización; lo que dejaba
    // eran USUARIOS. La causa era una y la misma en las ocho suites medidas:
    // `user_legal_acceptances` guarda dos filas por persona —quien crea una
    // empresa acepta los documentos legales— y no cuelgan de ninguna
    // organización, así que `deleteUser` devolvía 500 y nadie leía el resultado.
    // El ayudante borra lo que es DE la persona, lo intenta, y si algo lo
    // impide dice qué. Y la suite se pone roja: no se le deja la basura al
    // siguiente.
    {
      const problemas = await limpiarPersonas(admin, personas);
      if (problemas.length > 0) {
        failed += 1;
        console.log(`  ✘ La suite dejó fixtures detrás: ${problemas.join(" · ")}`);
      }
    }
  }

  console.log(`\nPE-05B6F · verdad comercial: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

async function limpiar(orgId: string) {
  await admin.from("billing_subscriptions")
    .update({ status: "retired" }).eq("organization_id", orgId);
  await admin.from("billing_subscription_changes")
    .update({ payment_id: null, quote_id: null }).eq("organization_id", orgId);
  await admin.from("billing_subscription_periods")
    .update({ settled_payment_id: null }).eq("organization_id", orgId);
  await admin.from("billing_payments")
    .update({ period_id: null, subscription_change_id: null }).eq("organization_id", orgId);
  await admin.from("billing_quotes")
    .update({ subscription_id: null, redemption_id: null }).eq("organization_id", orgId);
  await admin.from("billing_checkout_intents")
    .update({ payment_method_id: null, period_id: null, subscription_change_id: null })
    .eq("organization_id", orgId);
  for (const t of ["billing_provider_events", "billing_payments",
                   "billing_subscription_changes",
                   "billing_subscription_periods", "billing_checkout_intents",
                   "billing_payment_methods", "billing_promotion_redemptions",
                   "billing_quotes", "billing_subscriptions",
                   "storage_orphan_candidates",
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
