/**
 * Trazaloop · PE-05B6D · Cuándo empieza a valer un cambio de plan.
 *
 * La regla congelada es una sola y no tiene excepciones: el cambio entra en
 * vigor AL FINAL DEL PERIODO YA PAGADO. Ni antes, ni el día 1 del mes que
 * viene, ni «a los 30 días». Sin prorrateo, sin abono por el tiempo no usado y
 * sin cobro incremental a mitad de periodo.
 *
 * Lo que aquí se comprueba es justo lo que en el sandbox no se puede: el año.
 * Un cambio pedido en junio sobre un plan anual pagado hasta enero NO adelanta
 * nada, y esa es exactamente la clase de error que un atajo de calendario
 * —`now() + 1 month`— comete sin que nadie lo note hasta que un cliente pierde
 * siete meses que ya había pagado.
 *
 * Ni una llamada real a una pasarela.
 *
 * Correr: npm run test:pe05b6d-transitions
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

const admin = createClient(URL, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";
const personas: string[] = [];
const orgs: string[] = [];
const W = "wompi";

/** Precios del catálogo, en centavos de USD, y la tasa sintética de la prueba.
 *  Se escriben aquí para que el número esperado se vea, pero se COMPRUEBAN
 *  contra el catálogo antes de usarlos: si el comercial cambia, la prueba lo
 *  dice en vez de mentir. */
const TASA_MICROS = 4_000_000_000;                 // 4000 COP por USD
const COP = (usdMinor: number) => Math.round(usdMinor * (TASA_MICROS / 1_000_000) / 100);

async function persona(prefijo: string) {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B6D" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b6d" });
  return { id: data.user!.id, email, cli };
}

/** Una empresa que ya pagó su primer periodo, del plan e intervalo que se pida.
 *  Todo por el camino del producto: presupuesto, intento, medio de pago y
 *  liquidación. Nada de escribir la suscripción a mano. */
async function empresaPagando(nombre: string, plan: "full" | "extra",
                              intervalo: "monthly" | "annual") {
  const quien = await persona("b6d");
  const { data: orgId } = await quien.cli.rpc("create_organization",
    { p_name: `${nombre} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", quien.id);

  const { data: q, error: eq } = await quien.cli.rpc("billing_create_quote", {
    p_organization_id: org, p_plan_code: plan, p_billing_interval: intervalo });
  assert(!eq, `presupuesto: ${eq?.message}`);
  const { data: i, error: ei } = await quien.cli.rpc("billing_open_checkout_intent", {
    p_quote_id: (q as { quote_id: string }).quote_id, p_provider: W,
    p_environment: "test" });
  assert(!ei, `intento: ${ei?.message}`);
  const intento = i as unknown as { intent_id: string; expected_total_amount: number };

  const { data: pm } = await admin.rpc("billing_register_payment_method", {
    p_organization_id: org, p_provider: W,
    p_provider_payment_method_id: `pm-${org.slice(0, 8)}`, p_environment: "test",
    p_created_by: null });
  const metodo = (pm as Record<string, unknown>).payment_method_id as string;
  await admin.rpc("billing_attach_intent_payment_method", {
    p_intent_id: intento.intent_id, p_payment_method_id: metodo });
  await admin.rpc("billing_settle_provider_payment", {
    p_provider: W, p_external_reference: intento.intent_id,
    p_provider_payment_id: `b6d-ini-${org.slice(0, 8)}`, p_outcome: "approved",
    p_amount: intento.expected_total_amount, p_currency: "COP",
    p_live_mode: false, p_failure_reason: null });

  // La prueba introductoria se cierra un milisegundo después de nacer: quien
  // paga un plan no está a la vez de prueba.
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
  return { org, quien, subscriptionId: s.id, base: s.base_charge_amount, metodo };
}

/** Mueve el ANCLA y recalcula los límites con el calendario canónico, en
 *  milisegundos. No se restan días fila a fila: eso rompería la invariante de
 *  que el periodo N es «ancla + (N−1) × intervalo» en un solo salto. */
async function envejecer(subscriptionId: string, ms: number) {
  const { data: sub } = await admin.from("billing_subscriptions")
    .select("billing_interval").eq("id", subscriptionId).single();
  const intervalo = (sub as { billing_interval: string }).billing_interval;
  const { data: ps } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, period_start").eq("subscription_id", subscriptionId)
    .order("period_sequence");
  const filas = (ps ?? []) as { id: string; period_sequence: number; period_start: string }[];
  const ancla = new Date(new Date(filas[0].period_start).getTime() - ms).toISOString();
  for (const f of filas) {
    const { data: lim } = await admin.rpc("billing_period_bounds", {
      p_anchor: ancla, p_interval: intervalo, p_sequence: f.period_sequence });
    const l = lim as { period_start: string; period_end: string };
    await admin.from("billing_subscription_periods")
      .update({ period_start: l.period_start, period_end: l.period_end }).eq("id", f.id);
  }
  const ultimo = filas[filas.length - 1];
  const { data: lim } = await admin.rpc("billing_period_bounds", {
    p_anchor: ancla, p_interval: intervalo, p_sequence: ultimo.period_sequence });
  const l = lim as { period_start: string; period_end: string };
  await admin.from("billing_subscriptions").update({
    current_period_start: l.period_start, current_period_end: l.period_end,
    renews_at: l.period_end }).eq("id", subscriptionId);
  return l;
}

const dias = (n: number) => n * 86_400_000;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Deja el final del periodo pagado EXACTAMENTE a `msRestantes` de ahora.
 *
 * No basta con restar el hueco al ancla de una vez: los meses no miden lo
 * mismo, así que mover el ancla treinta días atrás puede caer en un mes de
 * treinta y uno y dejar el borde un día más lejos. Se acerca iterando contra
 * el calendario canónico, que es quien manda. */
async function envejecerHasta(subscriptionId: string, msRestantes: number) {
  let lim = { period_start: "", period_end: "" };
  for (let vuelta = 0; vuelta < 6; vuelta += 1) {
    const s = await suscripcion(subscriptionId);
    const falta = new Date(String(s.current_period_end)).getTime()
      - (Date.now() + msRestantes);
    if (Math.abs(falta) < 400) return s;
    lim = await envejecer(subscriptionId, falta);
  }
  const s = await suscripcion(subscriptionId);
  const error = new Date(String(s.current_period_end)).getTime()
    - (Date.now() + msRestantes);
  assert(Math.abs(error) < 2_000,
    `el montaje no llegó al borde: se quedó a ${Math.round(error / 1000)} s`);
  return s;
}

async function suscripcion(id: string) {
  const { data } = await admin.from("billing_subscriptions")
    .select("id, status, plan_code, billing_interval, base_charge_amount,"
      + " charge_currency, current_period_start, current_period_end,"
      + " scheduled_plan_revision_id, scheduled_effective_at,"
      + " scheduled_base_charge_amount, scheduled_charge_currency")
    .eq("id", id).single();
  return data as unknown as Record<string, unknown>;
}

const vencimientos = async () => {
  const { data, error } = await admin.rpc("billing_due_renewals",
    { p_now: new Date().toISOString(), p_limit: 200 });
  assert(!error, `vencimientos: ${error?.message}`);
  return (data ?? []) as Record<string, unknown>[];
};
const accionDe = (filas: Record<string, unknown>[], sub: string) =>
  filas.find((f) => f.subscription_id === sub)?.action as string | undefined;

const planVigente = async (e: { org: string; quien: { cli: SupabaseClient } }) => {
  const { data } = await e.quien.cli.rpc("plan_effective_for_organization",
    { p_organization_id: e.org });
  return data as Record<string, unknown>;
};

/** Cuántos cobros y cuántas obligaciones existen. Un cambio programado no debe
 *  crear ninguno de los dos: si aparece uno, hay prorrateo escondido. */
async function contabilidad(org: string) {
  const { data: pagos } = await admin.from("billing_payments")
    .select("id").eq("organization_id", org);
  const { data: periodos } = await admin.from("billing_subscription_periods")
    .select("id").eq("organization_id", org);
  const { data: intentos } = await admin.from("billing_checkout_intents")
    .select("id").eq("organization_id", org);
  return { pagos: (pagos ?? []).length, periodos: (periodos ?? []).length,
           intentos: (intentos ?? []).length };
}

async function main() {
  const { data: rev } = await admin.from("plan_revisions")
    .select("plan_code, currency, monthly_price_minor, annual_price_minor")
    .is("effective_to", null).eq("status", "published");
  const cat = Object.fromEntries(((rev ?? []) as Record<string, unknown>[])
    .map((r) => [String(r.plan_code), r]));
  const precio = (plan: string, intervalo: "monthly" | "annual") =>
    COP(Number(cat[plan][intervalo === "monthly" ? "monthly_price_minor" : "annual_price_minor"]));

  const { data: fx, error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: TASA_MICROS,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA PE-05B6D ${sello} · tasa sintetica, NO comercial` }).select("id").single();
  assert(!efx, `tasa: ${efx?.message}`);
  const fxId = (fx as { id: string }).id;
  // Toda tasa que abra esta suite, para poder retirarlas todas al terminar.
  const tasasQA: string[] = [fxId];

  console.log("\nPE-05B6D · Cuándo empieza a valer un cambio de plan\n");

  const { runRenewalPass } = await import("../../lib/billing/renewal/orchestrator");
  const { fakeBillingProvider } = await import("../../lib/billing/providers/fake");
  const doble = () => fakeBillingProvider("approve", "approve");

  try {
    // =====================================================================
    console.log("A · Mensual: Full → Extra entra en el borde del mes pagado");
    // =====================================================================
    await check("A1. Se programa para el final del periodo PAGADO, no para dentro de 30 días",
      async () => {
        const e = await empresaPagando("A mensual", "full", "monthly");
        const antes = await suscripcion(e.subscriptionId);
        const { data, error } = await e.quien.cli.rpc("billing_schedule_plan_change",
          { p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
        assert(!error, `programar: ${error?.message}`);
        const r = data as Record<string, unknown>;
        assert(r.status === "scheduled", JSON.stringify(r));
        assert(r.effective_at === antes.current_period_end,
          `entra en vigor el ${r.effective_at} y el periodo pagado acaba el ${antes.current_period_end}`);
        assert(r.base_charge_amount === precio("extra", "monthly"),
          `base congelada ${r.base_charge_amount}, catálogo ${precio("extra", "monthly")}`);
      });

    await check("A2. Hasta ese día sigue mandando Full, y no se cobra nada", async () => {
      const e = await empresaPagando("A vigencia", "full", "monthly");
      const antes = await contabilidad(e.org);
      await e.quien.cli.rpc("billing_schedule_plan_change",
        { p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });

      const s = await suscripcion(e.subscriptionId);
      assert(s.plan_code === "full", `ya cambió el plan: ${s.plan_code}`);
      assert(s.base_charge_amount === precio("full", "monthly"),
        `ya cambió el importe: ${s.base_charge_amount}`);
      const p = await planVigente(e);
      assert(p.plan_code === "full", `el plan vigente ya es ${p.plan_code}`);
      assert(accionDe(await vencimientos(), e.subscriptionId) === undefined,
        "un cambio programado adelantó el vencimiento");

      const despues = await contabilidad(e.org);
      assert(JSON.stringify(antes) === JSON.stringify(despues),
        `programar movió la contabilidad: ${JSON.stringify(antes)} → ${JSON.stringify(despues)}`);
    });

    await check("A3. En el borde entra Extra, con SU importe y sin cobro de más",
      async () => {
        const e = await empresaPagando("A borde", "full", "monthly");
        // El borde se pone a tres segundos y se ESPERA a que llegue. Envejecer
        // después de programar sería trampa: movería el borde por debajo de una
        // fecha ya congelada, y entonces la prueba mediría un montaje imposible.
        await envejecerHasta(e.subscriptionId, 3_000);
        const { data } = await e.quien.cli.rpc("billing_schedule_plan_change",
          { p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
        assert((data as Record<string, unknown>).status === "scheduled",
          JSON.stringify(data));
        assert(accionDe(await vencimientos(), e.subscriptionId) === undefined,
          "vencía antes de llegar al borde");

        await esperar(3_500);
        assert(accionDe(await vencimientos(), e.subscriptionId) === "downgrade_due",
          `en el borde toca aplicar el cambio, no ${accionDe(await vencimientos(), e.subscriptionId)}`);
        // ACOTADA A SU PROPIA SUSCRIPCIÓN, y no por comodidad.
        //
        // `r1.charged` es un contador GLOBAL de la pasada, y la pasada procesa
        // todo lo que esté vencido en la base. `mp0184` envejece sus fixtures
        // cuarenta días a propósito y deja tres suscripciones vencidas detrás,
        // así que ejecutar esta suite después de aquélla hacía que `charged`
        // contara cobros de empresas que no tienen nada que ver con este caso.
        // La prueba salía roja diciendo «aplicar el cambio cobró algo» cuando el
        // cambio no había cobrado nada: había cobrado el vecino.
        //
        // Se demostró en dos series de diez con el mismo arnés, una con 0186 y
        // otra sin él: las veinte en rojo, mismo aserto. No era 0186 y no era el
        // reloj — era que esta afirmación se medía sobre la base entera.
        //
        // `runRenewalPass` ya sabe acotarse; no hace falta tocar nada de
        // producto. Y de paso esta pasada deja de cobrar a terceros.
        const r1 = await runRenewalPass({ provider: doble(),
                                          onlySubscriptions: [e.subscriptionId] });
        // Y que la acotación SIGUE puesta se comprueba aquí: si alguien la
        // quita, esto se pone rojo antes de que el contador vuelva a mentir.
        assert(r1.dueFound === 1,
          `la pasada miró ${r1.dueFound} suscripciones y solo le tocaba la suya`);
        assert(r1.decisions.every((x) => x.subscriptionId === e.subscriptionId),
          "la pasada decidió sobre suscripciones ajenas");
        assert(r1.charged === 0, "aplicar el cambio cobró algo");

        const s = await suscripcion(e.subscriptionId);
        assert(s.plan_code === "extra", `no entró: ${s.plan_code}`);
        assert(s.base_charge_amount === precio("extra", "monthly"),
          `importe tras el cambio: ${s.base_charge_amount}`);
        assert(s.scheduled_effective_at === null, "quedó un cambio programado colgando");
      });

    // =====================================================================
    console.log("\nB · Anual: pedirlo en junio no adelanta enero");
    // =====================================================================
    await check("B1. Full anual → Extra anual a mitad de año: entra al cerrar el AÑO",
      async () => {
        const e = await empresaPagando("B anual", "full", "annual");
        // Medio año dentro del periodo anual pagado.
        const lim = await envejecer(e.subscriptionId, dias(180));
        const { data } = await e.quien.cli.rpc("billing_schedule_plan_change",
          { p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
        const r = data as Record<string, unknown>;
        assert(r.effective_at === lim.period_end,
          `entra el ${r.effective_at} y el año pagado acaba el ${lim.period_end}`);
        const faltan = (new Date(lim.period_end).getTime() - Date.now()) / 86_400_000;
        assert(faltan > 150, `el año pagado se quedó en ${Math.round(faltan)} días`);
        assert(r.base_charge_amount === precio("extra", "annual"),
          `congeló ${r.base_charge_amount} y el anual de Extra es ${precio("extra", "annual")}`);
      });

    await check("B2. Y en junio no hay ni vencimiento, ni cobro, ni plan nuevo", async () => {
      const e = await empresaPagando("B junio", "full", "annual");
      await envejecer(e.subscriptionId, dias(180));
      const antes = await contabilidad(e.org);
      await e.quien.cli.rpc("billing_schedule_plan_change",
        { p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });

      assert(accionDe(await vencimientos(), e.subscriptionId) === undefined,
        "el año pagado venció medio año antes");
      const r = await runRenewalPass({ provider: doble() });
      const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d === undefined, `la pasada lo tocó: ${JSON.stringify(d)}`);
      assert(JSON.stringify(antes) === JSON.stringify(await contabilidad(e.org)),
        "apareció un cobro o una obligación a mitad de año");
      assert((await planVigente(e)).plan_code === "full", "cambió el plan a mitad de año");
    });

    // =====================================================================
    console.log("\nC · Anual, en el otro sentido");
    // =====================================================================
    await check("C1. Extra anual → Full anual: también solo al cerrar el año", async () => {
      const e = await empresaPagando("C anual", "extra", "annual");
      const lim = await envejecer(e.subscriptionId, dias(200));
      const { data } = await e.quien.cli.rpc("billing_schedule_plan_change",
        { p_subscription_id: e.subscriptionId, p_target_plan_code: "full" });
      const r = data as Record<string, unknown>;
      assert(r.effective_at === lim.period_end, `entra el ${r.effective_at}`);
      assert(r.base_charge_amount === precio("full", "annual"),
        `congeló ${r.base_charge_amount}`);
      // Bajar de plan no devuelve nada de lo ya pagado.
      const { data: pagos } = await admin.from("billing_payments")
        .select("id, status, total_amount").eq("organization_id", e.org);
      assert((pagos ?? []).every((p) => (p as { total_amount: number }).total_amount > 0),
        "apareció un abono al bajar de plan");
      assert((await planVigente(e)).plan_code === "extra", "Extra dejó de valer antes de tiempo");
    });

    await check("C2. Extra mensual → Full mensual: en el borde del mes, sin abono",
      async () => {
        const e = await empresaPagando("C mensual", "extra", "monthly");
        const s0 = await suscripcion(e.subscriptionId);
        const { data } = await e.quien.cli.rpc("billing_schedule_plan_change",
          { p_subscription_id: e.subscriptionId, p_target_plan_code: "full" });
        const r = data as Record<string, unknown>;
        assert(r.effective_at === s0.current_period_end,
          `entra el ${r.effective_at} y el mes pagado acaba el ${s0.current_period_end}`);
        assert(r.base_charge_amount === precio("full", "monthly"),
          `congeló ${r.base_charge_amount}`);
        // Bajar hoy no baja nada hoy.
        const s1 = await suscripcion(e.subscriptionId);
        assert(s1.plan_code === "extra" && s1.base_charge_amount === precio("extra", "monthly"),
          "le bajaron el plan el mismo día que lo pidió");
        const { data: pagos } = await admin.from("billing_payments")
          .select("total_amount").eq("organization_id", e.org);
        assert(((pagos ?? []) as { total_amount: number }[])
          .every((x) => x.total_amount > 0), "apareció un abono al bajar de plan");
      });

    // =====================================================================
    console.log("\nD · Irse a mitad de año");
    // =====================================================================
    await check("D1. La baja anual respeta el año pagado y no devuelve dinero", async () => {
      const e = await empresaPagando("D baja", "full", "annual");
      const lim = await envejecer(e.subscriptionId, dias(120));
      const antes = await contabilidad(e.org);
      const { data, error } = await e.quien.cli.rpc("billing_request_cancellation",
        { p_subscription_id: e.subscriptionId, p_cancel: true });
      assert(!error, `baja: ${error?.message}`);
      const r = data as Record<string, unknown>;
      assert(r.cancel_at_period_end === true, JSON.stringify(r));
      assert(r.effective_at === lim.period_end,
        `se va el ${r.effective_at} y su año acaba el ${lim.period_end}`);

      // La baja se APUNTA; no cambia el estado hoy, porque hoy sigue teniendo
      // el servicio que pagó. El estado cambiará el día del borde.
      const { data: fila } = await admin.from("billing_subscriptions")
        .select("status, cancel_at_period_end").eq("id", e.subscriptionId).single();
      const f = fila as { status: string; cancel_at_period_end: boolean };
      assert(f.cancel_at_period_end === true, "no quedó apuntada la baja");
      assert(f.status === "active", `le cortaron el plan hoy: ${f.status}`);
      assert((await planVigente(e)).plan_code === "full",
        "le cortaron el servicio que ya había pagado");
      assert(accionDe(await vencimientos(), e.subscriptionId) === undefined,
        "la baja adelantó el vencimiento");
      assert(JSON.stringify(antes) === JSON.stringify(await contabilidad(e.org)),
        "la baja movió la contabilidad");
    });

    await check("D2. La baja mensual respeta el mes pagado y no cae a Free hoy",
      async () => {
        const e = await empresaPagando("D mensual", "full", "monthly");
        const s0 = await suscripcion(e.subscriptionId);
        const { data } = await e.quien.cli.rpc("billing_request_cancellation",
          { p_subscription_id: e.subscriptionId, p_cancel: true });
        assert((data as Record<string, unknown>).effective_at === s0.current_period_end,
          `se va el ${(data as Record<string, unknown>).effective_at}`);
        assert((await planVigente(e)).plan_code === "full",
          "cayó a Free el mismo día de pedir la baja");

        // Y se puede deshacer mientras no llegue el día.
        const { data: atras } = await e.quien.cli.rpc("billing_request_cancellation",
          { p_subscription_id: e.subscriptionId, p_cancel: false });
        assert((atras as Record<string, unknown>).cancel_at_period_end === false,
          JSON.stringify(atras));
        const { data: fila } = await admin.from("billing_subscriptions")
          .select("cancel_at_period_end").eq("id", e.subscriptionId).single();
        assert((fila as { cancel_at_period_end: boolean }).cancel_at_period_end === false,
          "no se pudo retirar la baja");
      });

    // =====================================================================
    console.log("\nE y F · Cambiar de intervalo: hoy no se puede, y no se finge");
    // =====================================================================
    await check("E1. Sobre una anual, el cambio de plan sigue siendo ANUAL", async () => {
      const e = await empresaPagando("E anual", "full", "annual");
      const lim = await envejecer(e.subscriptionId, dias(90));
      const { data } = await e.quien.cli.rpc("billing_schedule_plan_change",
        { p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
      const r = data as Record<string, unknown>;
      // Ni el intervalo cambia, ni el precio se toma del mensual, ni el año
      // pagado se corta para empezar a facturar por meses.
      assert(r.base_charge_amount === precio("extra", "annual"),
        `tomó el precio de otro intervalo: ${r.base_charge_amount}`);
      assert(r.base_charge_amount !== precio("extra", "monthly"), "cobraría como mensual");
      const s = await suscripcion(e.subscriptionId);
      assert(s.billing_interval === "annual", `le cambió el intervalo a ${s.billing_interval}`);
      assert(r.effective_at === lim.period_end, "el año pagado se cortó");
    });

    await check("F1. Sobre una mensual, sigue siendo MENSUAL", async () => {
      const e = await empresaPagando("F mensual", "full", "monthly");
      const { data } = await e.quien.cli.rpc("billing_schedule_plan_change",
        { p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
      const r = data as Record<string, unknown>;
      assert(r.base_charge_amount === precio("extra", "monthly"),
        `tomó el precio de otro intervalo: ${r.base_charge_amount}`);
      const s = await suscripcion(e.subscriptionId);
      assert(s.billing_interval === "monthly", `le cambió el intervalo a ${s.billing_interval}`);
    });

    await check("F2. Cambiar de intervalo YA existe, y tampoco corta un año pagado",
      async () => {
        // Esta comprobación decía, hasta B6E, que la operación no existía: la
        // única puerta no tenía ese picaporte. Ahora lo tiene, así que lo que se
        // afirma es la MISMA invariante bajo la implementación nueva: cambiar de
        // periodicidad sigue esperando al borde del periodo pagado, y un año
        // pendiente se respeta entero aunque el destino sea mensual.
        const e = await empresaPagando("F intervalo", "full", "annual");
        const lim = await envejecer(e.subscriptionId, dias(60));
        const { data, error } = await e.quien.cli.rpc("billing_schedule_transition", {
          p_subscription_id: e.subscriptionId, p_target_plan_code: null,
          p_target_billing_interval: "monthly" });
        assert(!error, `programar la periodicidad: ${error?.message}`);
        const r = data as Record<string, unknown>;
        assert(r.status === "scheduled", JSON.stringify(r));
        assert(r.effective_at === lim.period_end,
          `entra el ${r.effective_at} y el año acaba el ${lim.period_end}`);
        const faltan = (new Date(lim.period_end).getTime() - Date.now()) / 86_400_000;
        assert(faltan > 290, `le cortaron el año: quedan ${Math.round(faltan)} días`);
        // Y hoy no cambia nada.
        const s = await suscripcion(e.subscriptionId);
        assert(s.billing_interval === "annual", `ya es ${s.billing_interval}`);
      });

    // =====================================================================
    console.log("\nG y H · El borde es el borde");
    // =====================================================================
    await check("G1. Pedido un día después de comprar el año: sigue entrando en enero",
      async () => {
        const e = await empresaPagando("G recién", "full", "annual");
        const lim = await envejecer(e.subscriptionId, dias(1));
        const { data } = await e.quien.cli.rpc("billing_schedule_plan_change",
          { p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
        const r = data as Record<string, unknown>;
        assert(r.effective_at === lim.period_end,
          `entra el ${r.effective_at} y el año acaba el ${lim.period_end}`);
        const faltan = (new Date(lim.period_end).getTime() - Date.now()) / 86_400_000;
        assert(faltan > 360, `se comió el año: quedan ${Math.round(faltan)} días`);
      });

    await check("H1. Pedido un minuto antes del borde: entra en el borde, ni un segundo antes",
      async () => {
        const e = await empresaPagando("H minuto", "full", "monthly");
        const s0 = await envejecerHasta(e.subscriptionId, 60_000);
        const borde = String(s0.current_period_end);

        const { data } = await e.quien.cli.rpc("billing_schedule_plan_change",
          { p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
        const r = data as Record<string, unknown>;
        assert(r.effective_at === borde,
          `entra el ${r.effective_at} y el borde es ${borde}`);

        // Un minuto antes no vence, y la pasada no lo adelanta.
        assert(accionDe(await vencimientos(), e.subscriptionId) === undefined,
          "venció un minuto antes de tiempo");
        await runRenewalPass({ provider: doble() });
        const s = await suscripcion(e.subscriptionId);
        assert(s.plan_code === "full", "Extra entró antes del borde");
        assert(s.base_charge_amount === precio("full", "monthly"),
          `le cambiaron el importe antes del borde: ${s.base_charge_amount}`);
        assert(s.scheduled_effective_at === borde, "se le movió la fecha congelada");
      });

    // =====================================================================
    console.log("\nI · El importe nuevo se sostiene solo, sin tasa vigente");
    // =====================================================================
    await check("I1. Aplicado el cambio, el cobro siguiente sale del importe congelado",
      async () => {
        const e = await empresaPagando("I sin tasa", "full", "monthly");
        await envejecerHasta(e.subscriptionId, 3_000);
        await e.quien.cli.rpc("billing_schedule_plan_change",
          { p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
        await esperar(3_500);
        await runRenewalPass({ provider: doble() });   // aplica el cambio
        assert((await suscripcion(e.subscriptionId)).plan_code === "extra",
          "el cambio no llegó a aplicarse");

        // Se cierra la tasa POR VIGENCIA: lo ya congelado no depende de ella.
        await admin.from("commercial_fx_rates")
          .update({ effective_to: new Date().toISOString(), status: "retired" })
          .eq("id", fxId);
        try {
          const { data: sinTasa } = await admin.rpc("billing_resolve_fx",
            { p_base: "USD", p_quote: "COP", p_at: new Date().toISOString() });
          assert((sinTasa as Record<string, unknown>).status === "unavailable",
            `todavía hay tasa: ${JSON.stringify(sinTasa)}`);

          const r = await runRenewalPass({ provider: doble() });
          const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
          assert(d?.action === "renew", `no renovó: ${JSON.stringify(d)}`);

          // El cobro se mira por SU obligación, no por la fecha: dos filas
          // creadas en el mismo instante no se ordenan solas.
          const { data: per } = await admin.from("billing_subscription_periods")
            .select("id, period_sequence, base_amount, settled_payment_id")
            .eq("subscription_id", e.subscriptionId)
            .order("period_sequence", { ascending: false }).limit(1);
          const ultimo = (per ?? [])[0] as { id: string; base_amount: number };
          assert(ultimo.base_amount === precio("extra", "monthly"),
            `la obligación nueva nació por ${ultimo.base_amount}`);

          // Lo que se comprueba es el importe que SALIÓ hacia la pasarela. La
          // liquidación no la hace el cobro: la hace el evento firmado, y aquí
          // no hay pasarela que lo mande.
          const { data: intento } = await admin.from("billing_checkout_intents")
            .select("expected_total_amount").eq("period_id", ultimo.id).single();
          const esperado = precio("extra", "monthly")
            + Math.round(precio("extra", "monthly") * 0.19);
          assert((intento as { expected_total_amount: number })
            .expected_total_amount === esperado,
            `pidió cobrar ${(intento as { expected_total_amount: number })
              .expected_total_amount} y el Extra con IVA es ${esperado}`);
        } finally {
          // Y vuelve a haber tasa, pase lo que pase. NO se reabre la cerrada:
          // desde B6F una vigencia que ya terminó no se resucita —bajo ella se
          // pusieron precios—. Se abre otra, que es lo que haría el producto.
          const { data: otra } = await admin.from("commercial_fx_rates").insert({
            base_currency: "USD", quote_currency: "COP", rate_micros: TASA_MICROS,
            effective_from: new Date().toISOString(),
            note: `QA PE-05B6D ${sello} · tasa sintetica de relevo, NO comercial`,
          }).select("id").single();
          if (otra) tasasQA.push((otra as { id: string }).id);
        }
      });

    // =====================================================================
    console.log("\nJ · El descuento no se hereda al cambiar de plan");
    // =====================================================================
    await check("J1. Un Full con cupón que pasa a Extra paga el Extra limpio", async () => {
      // La campaña se monta con la llave de servicio, como en pe05b6b: crear
      // campañas por su primitiva es de la administración de plataforma y ya
      // está probado allí. Aquí lo que se mide es el cambio de plan.
      const { data: promo, error: ep } = await admin.from("billing_promotions").insert({
        name: `QA B6D institucional ${sello}`,
        description: "QA PE-05B6D · no comercial",
        program: "institutional_full",
        discount_type: "percentage", discount_value: 4000,
        max_discount_basis_points: null,
        eligible_plan_codes: ["full"], eligible_intervals: ["monthly"],
        starts_at: new Date(Date.now() - 3_600_000).toISOString(), ends_at: null,
        max_redemptions: null, max_per_organization: 1, status: "active",
      }).select("id").single();
      assert(!ep && promo, `campaña: ${ep?.message}`);
      const promoId = (promo as { id: string }).id;
      const codigo = `B6DCODE${sello}`;
      const { error: ec } = await admin.from("billing_promotion_codes")
        .insert({ promotion_id: promoId, code: codigo, status: "active" });
      assert(!ec, `código: ${ec?.message}`);

      const quien = await persona("b6d-cupon");
      const { data: orgId } = await quien.cli.rpc("create_organization",
        { p_name: `J cupon ${sello}`, p_tax_id: null, p_country: "CO" });
      const org = orgId as string;
      orgs.push(org);
      await admin.from("memberships").update({ role_code: "admin" })
        .eq("organization_id", org).eq("user_id", quien.id);

      const { data: q, error: eq } = await quien.cli.rpc("billing_create_quote", {
        p_organization_id: org, p_plan_code: "full", p_billing_interval: "monthly",
        p_coupon_code: codigo });
      assert(!eq, `presupuesto con cupón: ${eq?.message}`);
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
        p_provider_payment_id: `b6d-cup-${org.slice(0, 8)}`, p_outcome: "approved",
        p_amount: intento.expected_total_amount, p_currency: "COP",
        p_live_mode: false, p_failure_reason: null });

      const { data: sub } = await admin.from("billing_subscriptions")
        .select("id, base_charge_amount").eq("organization_id", org).single();
      const s = sub as { id: string; base_charge_amount: number };
      assert(s.base_charge_amount < precio("full", "monthly"),
        `el cupón no descontó nada: ${s.base_charge_amount}`);

      const { data: cambio } = await quien.cli.rpc("billing_schedule_plan_change",
        { p_subscription_id: s.id, p_target_plan_code: "extra" });
      const r = cambio as Record<string, unknown>;
      assert(r.base_charge_amount === precio("extra", "monthly"),
        `el descuento de Full se coló en Extra: ${r.base_charge_amount}`
        + ` (Extra limpio: ${precio("extra", "monthly")})`);
      await admin.from("billing_promotion_codes").delete().eq("promotion_id", promoId);
      await admin.from("billing_promotions").delete().eq("id", promoId);
    });

    // =====================================================================
    console.log("\nK · Lo que se le dice a quien paga, antes de confirmar");
    // =====================================================================
    await check("K1. La confirmación dice la fecha, y que no hay prorrateo ni abono",
      async () => {
        const ui = readFileSync("components/domain/billing/plan-decisions.tsx", "utf8");
        assert(/entrará en vigor el /.test(ui), "no dice cuándo entra en vigor");
        assert(/mantienes\s+"?\s*\+?\s*"?tu plan actual/.test(ui.replace(/\s+/g, " "))
          || /mantienes tu plan actual/.test(ui.replace(/\s+/g, " ").replace(/" \+ "/g, "")),
          "no dice que hasta esa fecha mantiene su plan");
        const plano = ui.replace(/\s+/g, " ").replace(/" \+ "/g, "");
        assert(/no se prorratea el periodo en curso/.test(plano),
          "no dice que no se prorratea");
        assert(/ni se genera abono por el tiempo restante/.test(plano),
          "no dice que no hay abono");
        assert(/no se devuelve la parte del periodo que no llegues a usar/.test(plano),
          "la cancelación no dice que no se devuelve lo no usado");
      });

  } finally {
    for (const org of orgs) await limpiar(org);
    for (const t of tasasQA) {
      await admin.from("commercial_fx_rates")
        .update({ status: "retired" }).eq("id", t);
    }
    for (const id of personas) await admin.auth.admin.deleteUser(id);
  }

  console.log(`\nPE-05B6D · transiciones de plan: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

async function limpiar(orgId: string) {
  await admin.from("billing_subscription_periods")
    .update({ settled_payment_id: null }).eq("organization_id", orgId);
  await admin.from("billing_payments").update({ period_id: null }).eq("organization_id", orgId);
  await admin.from("billing_quotes")
    .update({ subscription_id: null, redemption_id: null }).eq("organization_id", orgId);
  await admin.from("billing_checkout_intents")
    .update({ payment_method_id: null, period_id: null }).eq("organization_id", orgId);
  await admin.from("billing_subscriptions")
    .update({ scheduled_plan_revision_id: null, scheduled_effective_at: null,
              scheduled_base_charge_amount: null, scheduled_charge_currency: null,
              scheduled_fx_rate_id: null, scheduled_fx_rate_micros: null })
    .eq("organization_id", orgId);
  for (const t of ["billing_provider_events", "billing_payments",
                   "billing_subscription_periods", "billing_checkout_intents",
                   "billing_payment_methods", "billing_promotion_redemptions",
                   "billing_quotes", "billing_subscriptions",
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
