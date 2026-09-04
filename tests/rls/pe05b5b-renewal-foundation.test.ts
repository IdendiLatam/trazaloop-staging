/**
 * Trazaloop · PE-05B5B · Los cimientos del cobro que se hace solo.
 *
 * Ni una llamada real a una pasarela: el orquestador habla con el doble
 * determinista, que sabe fingir los seis desenlaces que importan —incluido el
 * peor: la petición salió y no hubo respuesta—.
 *
 * Lo que se demuestra aquí, sobre todo, son los dos defectos que el
 * descubrimiento encontró y que habrían tumbado el planificador el primer día:
 * una suscripción AL DÍA declarada caducada al vencer, y una caducidad real que
 * no se detectaba nunca.
 *
 * Correr: npm run test:pe05b5b-renewal
 */
import { config as loadEnv } from "dotenv";
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
const orgs: string[] = [];
const W = "wompi";
const HORA = 3_600_000;

async function persona(prefijo: string) {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B5B" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b5b" });
  return { id: data.user!.id, email, cli };
}

/**
 * Una empresa con su plan contratado y su tarjeta guardada, montada por el
 * camino REAL: presupuesto, intento, liquidación. Nada a mano salvo el reloj.
 */
async function empresaConPlan(nombre: string, intervalo: "monthly" | "annual" = "monthly") {
  const quien = await persona("b5b");
  const { data: orgId } = await quien.cli.rpc("create_organization",
    { p_name: `${nombre} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", quien.id);

  const { data: q } = await quien.cli.rpc("billing_create_quote", {
    p_organization_id: org, p_plan_code: "full", p_billing_interval: intervalo });
  const quoteId = (q as { quote_id: string }).quote_id;
  const { data: i } = await quien.cli.rpc("billing_open_checkout_intent", {
    p_quote_id: quoteId, p_provider: W, p_environment: "test" });
  const intento = i as unknown as { intent_id: string; expected_total_amount: number };

  const { data: pm } = await admin.rpc("billing_register_payment_method", {
    p_organization_id: org, p_provider: W,
    p_provider_payment_method_id: `pm-${org.slice(0, 8)}`, p_environment: "test",
    p_created_by: null });
  const metodo = (pm as Record<string, unknown>).payment_method_id as string;
  await admin.rpc("billing_attach_intent_payment_method", {
    p_intent_id: intento.intent_id, p_payment_method_id: metodo });

  const { data: act } = await admin.rpc("billing_settle_provider_payment", {
    p_provider: W, p_external_reference: intento.intent_id,
    p_provider_payment_id: `b5b-ini-${org.slice(0, 8)}`, p_outcome: "approved",
    p_amount: intento.expected_total_amount, p_currency: "COP",
    p_live_mode: false, p_failure_reason: null });
  assert((act as Record<string, unknown>).outcome === "activated", JSON.stringify(act));

  // La prueba introductoria se cierra: quien renueva lleva meses dentro y hace
  // mucho que la suya caducó. Dejarla viva haría que el plan efectivo siguiera
  // siendo Full por la prueba y la comprobación de la caída no diría nada.
  // Cada una se cierra un MILISEGUNDO después de su propio comienzo: la base
  // exige que el fin sea posterior al principio, y la empresa acaba de nacer.
  // Un segundo era demasiado: la comprobación entera corre en menos de eso y
  // la prueba seguía viva cuando se leía el plan.
  const { data: pruebas } = await admin.from("organization_plan_assignments")
    .select("id, starts_at").eq("organization_id", org).eq("grant_kind", "trial");
  const filas = (pruebas ?? []) as { id: string; starts_at: string }[];
  assert(filas.length > 0, "la empresa nació sin prueba introductoria");
  for (const f of filas) {
    const { error } = await admin.from("organization_plan_assignments")
      .update({ ends_at: new Date(new Date(f.starts_at).getTime() + 1).toISOString() })
      .eq("id", f.id);
    assert(!error, `cerrar la prueba: ${error?.message}`);
  }

  const { data: sub } = await admin.from("billing_subscriptions")
    .select("id").eq("organization_id", org).single();
  return { org, quien, subscriptionId: (sub as { id: string }).id, metodo };
}

/**
 * Mueve el calendario hacia atrás para que «hoy» caiga donde interesa.
 *
 * Se mueve EL ANCLA y se recalculan los límites con `billing_period_bounds`,
 * no restando días a cada fila: restar 31 días a un mes que tenía 30 rompería
 * la relación que todo el dominio da por cierta —que el periodo N sale del
 * ancla— y la prueba estaría midiendo un estado imposible.
 */
async function envejecer(subscriptionId: string, dias: number) {
  const { data: sub } = await admin.from("billing_subscriptions")
    .select("billing_interval").eq("id", subscriptionId).single();
  const intervalo = (sub as { billing_interval: string }).billing_interval;

  const { data: ps } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, period_start").eq("subscription_id", subscriptionId)
    .order("period_sequence");
  const filas = (ps ?? []) as { id: string; period_sequence: number; period_start: string }[];
  const ancla = new Date(new Date(filas[0].period_start).getTime()
    - dias * 24 * HORA).toISOString();

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
    renews_at: l.period_end,
  }).eq("id", subscriptionId);
}

const vencimientos = async (limite = 50) => {
  const { data, error } = await admin.rpc("billing_due_renewals",
    { p_now: new Date().toISOString(), p_limit: limite });
  assert(!error, `vencimientos: ${error?.message}`);
  return (data ?? []) as Record<string, unknown>[];
};
const mio = (filas: Record<string, unknown>[], sub: string) =>
  filas.find((f) => f.subscription_id === sub);
const periodos = async (sub: string) => {
  const { data } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, period_start, period_end, status")
    .eq("subscription_id", sub).order("period_sequence");
  return (data ?? []) as Record<string, unknown>[];
};
const intentos = async (sub: string) => {
  const { data } = await admin.from("billing_checkout_intents")
    .select("id, status, period_id, failure_class, provider_submitted_at, created_at")
    .eq("billing_subscription_id", sub).order("created_at");
  return (data ?? []) as Record<string, unknown>[];
};

async function main() {
  // Sin tasa vigente no hay presupuesto, y sin presupuesto no hay nada que
  // renovar. Es sintética y se retira al terminar.
  const { error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA PE-05B5B ${sello} · tasa sintetica, NO comercial` });
  assert(!efx, `tasa: ${efx?.message}`);

  console.log("\nPE-05B5B · Los cimientos del cobro automático\n");

  // Importar dentro de main: el orquestador es `server-only`.
  const { runRenewalPass } = await import("../../lib/billing/renewal/orchestrator");
  const { fakeBillingProvider } = await import("../../lib/billing/providers/fake");

  try {
    // =====================================================================
    console.log("A · Los dos defectos que encontró el descubrimiento");
    // =====================================================================

    await check("AA. Una suscripción AL DÍA que vence NO se declara caducada", async () => {
      const e = await empresaConPlan("AA al día");
      await envejecer(e.subscriptionId, 31);   // el mes ya venció
      const { data } = await admin.rpc("billing_open_next_period",
        { p_subscription_id: e.subscriptionId });
      const r = data as Record<string, unknown>;
      assert(r.status === "open", `dijo ${r.status}/${r.reason}: es el defecto AA`);
      assert(r.period_sequence === 2, JSON.stringify(r));
      // Y el mes nuevo empieza donde acabó el anterior, no hoy.
      const ps = await periodos(e.subscriptionId);
      assert(ps[1].period_start === ps[0].period_end,
        `${ps[1].period_start} ≠ ${ps[0].period_end}`);
    });

    await check("AB. Una deuda con la gracia agotada SÍ se declara caducada", async () => {
      const e = await empresaConPlan("AB caducada");
      await envejecer(e.subscriptionId, 31);
      await admin.rpc("billing_open_next_period", { p_subscription_id: e.subscriptionId });
      // El periodo 2 nace sin pagar. Se envejece hasta pasar SU gracia, que
      // acaba siete días después de que él termine.
      await envejecer(e.subscriptionId, 71);
      const { data } = await admin.rpc("billing_open_next_period",
        { p_subscription_id: e.subscriptionId });
      const r = data as Record<string, unknown>;
      assert(r.status === "lapse_due" && r.reason === "GRACE_EXPIRED",
        `dijo ${r.status}: la caducidad real no se detecta`);
    });

    // =====================================================================
    console.log("\nB · Qué vence, y qué no");
    // =====================================================================

    await check("A/B. Mensual y anual vencidas aparecen · y antes de su hora, no", async () => {
      const m = await empresaConPlan("mensual");
      const a = await empresaConPlan("anual", "annual");
      assert(!mio(await vencimientos(), m.subscriptionId), "apareció antes de vencer");
      await envejecer(m.subscriptionId, 31);
      await envejecer(a.subscriptionId, 366);
      const v = await vencimientos();
      const fm = mio(v, m.subscriptionId);
      const fa = mio(v, a.subscriptionId);
      assert(fm?.action === "renew" && fm.period_id === null, JSON.stringify(fm));
      assert(fa?.action === "renew", JSON.stringify(fa));
      assert(fm.payment_method_id, "no resolvió el medio de pago");
    });

    await check("R/S/T/U/V. Cancelada, Free, prueba y asesoría no se cobran", async () => {
      const e = await empresaConPlan("cancelada");
      await envejecer(e.subscriptionId, 31);
      assert(mio(await vencimientos(), e.subscriptionId), "no venció cuando debía");
      await admin.from("billing_subscriptions")
        .update({ cancel_at_period_end: true }).eq("id", e.subscriptionId);
      // Desde 0175 no desaparece: sale con su propia acción, que es lo
      // correcto —irse también es un final que hay que ejecutar—. Lo que sigue
      // siendo cierto, y es la invariante de verdad, es que NO se le cobra.
      const cancelada = mio(await vencimientos(), e.subscriptionId);
      assert(cancelada?.action === "cancel_due",
        `una cancelada salió como ${cancelada?.action}`);
      // Free y prueba no tienen suscripción de cobro: no existen como fila,
      // así que no pueden aparecer. Se comprueba que solo hay planes de pago.
      const v = await vencimientos(200);
      for (const f of v) {
        const { data: s } = await admin.from("billing_subscriptions")
          .select("plan_code").eq("id", f.subscription_id as string).single();
        assert(["full", "extra"].includes((s as { plan_code: string }).plan_code),
          `venció un plan que no se cobra: ${JSON.stringify(s)}`);
      }
    });

    await check("L. Sin medio de pago activo no se cobra", async () => {
      const e = await empresaConPlan("sin tarjeta");
      await envejecer(e.subscriptionId, 31);
      await admin.from("billing_payment_methods")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", e.metodo);
      // Tampoco desaparece desde 0175 —desaparecer era el defecto: nunca
      // caducaba—. La invariante es que no se le cobra y que no se resuelve
      // ningún medio de pago.
      const sinTarjeta = mio(await vencimientos(), e.subscriptionId);
      assert(sinTarjeta?.action === "payment_method_unavailable",
        `sin tarjeta salió como ${sinTarjeta?.action}`);
      assert(sinTarjeta.payment_method_id === null, "resolvió una tarjeta revocada");
    });

    // =====================================================================
    console.log("\nC · Los cuatro huecos, anclados al vencimiento");
    // =====================================================================

    await check("Los huecos salen del vencimiento y no del reloj del proceso", async () => {
      const base = "2026-01-31T10:00:00Z";
      const casos: Array<[string, number]> = [
        ["2026-01-31T09:59:59Z", -1], ["2026-01-31T10:00:00Z", 0],
        ["2026-02-01T09:59:59Z", 0], ["2026-02-01T10:00:00Z", 1],
        ["2026-02-03T10:00:00Z", 2], ["2026-02-06T10:00:00Z", 3],
        ["2026-03-01T10:00:00Z", 3],
      ];
      for (const [cuando, esperado] of casos) {
        const { data } = await admin.rpc("billing_renewal_slot_at",
          { p_due_at: base, p_at: cuando });
        assert(data === esperado, `${cuando} cayó en el hueco ${data}, no en ${esperado}`);
      }
      const { data: g } = await admin.rpc("billing_renewal_grace_end", { p_due_at: base });
      assert(String(g).startsWith("2026-02-07T10:00:00"), `la gracia acaba en ${g}`);
    });

    await check("Una pasada que llega tarde consume UN hueco, no los perdidos", async () => {
      const e = await empresaConPlan("tarde");
      // Vence y además pasan más de 72 horas sin que nadie ejecute nada.
      await envejecer(e.subscriptionId, 34);
      const uno = mio(await vencimientos(), e.subscriptionId);
      assert(uno?.slot === 2, `el hueco vigente es ${uno?.slot}, no el 2`);

      const r = await runRenewalPass({ provider: fakeBillingProvider("approve", "retryable_decline") });
      const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d?.attemptId, `no se creó intento: ${JSON.stringify(d)}`);
      assert((await intentos(e.subscriptionId)).filter((i) => i.period_id).length === 1,
        "encadenó los huecos que se había perdido");

      // Y la pasada siguiente, inmediata, NO vuelve a cobrar: el hueco 2 ya
      // está gastado y el 3 todavía no ha llegado.
      const r2 = await runRenewalPass({ provider: fakeBillingProvider("approve", "approve") });
      assert(!r2.decisions.some((x) => x.subscriptionId === e.subscriptionId
        && x.outcome === "submitted"),
        "cobró dos veces seguidas sin esperar al hueco siguiente");
    });

    // =====================================================================
    console.log("\nD · Una pasada normal");
    // =====================================================================

    await check("A. Cobra una vez, abre el mes y NO activa nada por su cuenta", async () => {
      const e = await empresaConPlan("normal");
      await envejecer(e.subscriptionId, 31);
      const r = await runRenewalPass({ provider: fakeBillingProvider("approve", "approve") });
      const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d?.outcome === "submitted", JSON.stringify(d));
      assert(d.providerPaymentId, "no volvió con identificador del proveedor");

      const ps = await periodos(e.subscriptionId);
      assert(ps.length === 2 && ps[1].status === "open",
        `el POST del proveedor saldó el periodo: ${JSON.stringify(ps)}`);
      const ints = await intentos(e.subscriptionId);
      const renov = ints.filter((i) => i.period_id);
      assert(renov.length === 1 && renov[0].status === "provider_created",
        JSON.stringify(renov));
      assert(renov[0].provider_submitted_at, "no se anotó la frontera del envío");
    });

    await check("C. Ejecutarla dos veces no manda dos cargos", async () => {
      const e = await empresaConPlan("dos pasadas");
      await envejecer(e.subscriptionId, 31);
      await runRenewalPass({ provider: fakeBillingProvider("approve", "approve") });
      const r2 = await runRenewalPass({ provider: fakeBillingProvider("approve", "approve") });
      const d = r2.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(!d || d.outcome !== "submitted", `la segunda pasada cobró: ${JSON.stringify(d)}`);
      assert((await intentos(e.subscriptionId)).filter((i) => i.period_id).length === 1,
        "hay dos intentos para el mismo mes");
    });

    await check("D. Dos trabajadores a la vez tampoco", async () => {
      const e = await empresaConPlan("dos obreros");
      await envejecer(e.subscriptionId, 31);
      const [a, b] = await Promise.all([
        runRenewalPass({ provider: fakeBillingProvider("approve", "approve") }),
        runRenewalPass({ provider: fakeBillingProvider("approve", "approve") }),
      ]);
      const enviados = [...a.decisions, ...b.decisions]
        .filter((x) => x.subscriptionId === e.subscriptionId && x.outcome === "submitted");
      assert(enviados.length === 1, `salieron ${enviados.length} cargos a la vez`);
      assert((await periodos(e.subscriptionId)).length === 2, "se abrieron dos meses");
    });

    // =====================================================================
    console.log("\nE · Cuando algo sale mal");
    // =====================================================================

    await check("F/I. La respuesta se pierde: NO se vuelve a cobrar solo", async () => {
      const e = await empresaConPlan("respuesta perdida");
      await envejecer(e.subscriptionId, 31);
      const r = await runRenewalPass({
        provider: fakeBillingProvider("approve", "lost_response") });
      const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d?.failureClass === "provider_unknown", JSON.stringify(d));

      const ints = (await intentos(e.subscriptionId)).filter((i) => i.period_id);
      assert(ints.length === 1 && ints[0].failure_class === "provider_unknown",
        JSON.stringify(ints));
      // EN VUELO a propósito: es lo que impide un segundo cargo.
      assert(ints[0].status === "provider_created",
        `quedó en ${ints[0].status}: el índice ya no bloquea`);

      // Ni ahora, ni en el hueco siguiente.
      await runRenewalPass({ provider: fakeBillingProvider("approve", "approve") });
      await envejecer(e.subscriptionId, 33);
      await runRenewalPass({ provider: fakeBillingProvider("approve", "approve") });
      assert((await intentos(e.subscriptionId)).filter((i) => i.period_id).length === 1,
        "se mandó un segundo cargo sin saber si el primero cobró");
    });

    await check("J/K. Rechazo: se anota con CLASE y la deuda entra en gracia", async () => {
      const e = await empresaConPlan("rechazo");
      await envejecer(e.subscriptionId, 31);
      const r = await runRenewalPass({
        provider: fakeBillingProvider("approve", "hard_decline") });
      const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d?.failureClass === "hard_decline", JSON.stringify(d));
      const { data: s } = await admin.from("billing_subscriptions")
        .select("status, grace_until").eq("id", e.subscriptionId).single();
      const f = s as { status: string; grace_until: string | null };
      assert(f.status === "past_due", `la suscripción quedó ${f.status}`);
      assert(f.grace_until, "no se anotó hasta cuándo hay gracia");
      // Y la gracia sale del VENCIMIENTO, no del reloj de quien anotó el fallo.
      const ps = await periodos(e.subscriptionId);
      const esperado = new Date(new Date(String(ps[1].period_end)).getTime()
        + 168 * HORA).toISOString();
      assert(new Date(f.grace_until!).getTime() === new Date(esperado).getTime(),
        `gracia ${f.grace_until} en vez de ${esperado}`);
    });

    await check("M. Un cobro que entra en gracia salda EL MISMO mes", async () => {
      const e = await empresaConPlan("acierta en gracia");
      await envejecer(e.subscriptionId, 31);
      await runRenewalPass({ provider: fakeBillingProvider("approve", "retryable_decline") });
      const ps = await periodos(e.subscriptionId);
      const per = ps[1];

      // El webhook —el camino canónico— salda esa obligación.
      const { data: cargo } = await admin.rpc("billing_period_charge_total",
        { p_period_id: per.id as string });
      const total = Number((cargo as Record<string, unknown>).total_amount);
      const { data: res } = await admin.rpc("billing_settle_period_payment", {
        p_period_id: per.id as string, p_provider: W,
        p_provider_payment_id: `b5b-gracia-${sello}`, p_outcome: "approved",
        p_amount: total, p_currency: "COP", p_live_mode: false });
      assert((res as Record<string, unknown>).outcome === "renewed", JSON.stringify(res));

      const luego = await periodos(e.subscriptionId);
      assert(luego.length === 2 && luego[1].status === "settled", JSON.stringify(luego));
      assert(luego[1].period_start === per.period_start
        && luego[1].period_end === per.period_end,
        "pagar tarde movió las fechas del mes");
      const { data: s } = await admin.from("billing_subscriptions")
        .select("status, grace_until, current_period_end").eq("id", e.subscriptionId).single();
      const f = s as Record<string, string | null>;
      assert(f.status === "active" && f.grace_until === null, JSON.stringify(f));
      assert(f.current_period_end === per.period_end, "el derecho no llegó al mes pagado");
    });

    await check("N/O. Agotados los intentos y la gracia, cae a Free sin borrar nada",
      async () => {
      const e = await empresaConPlan("caída");
      await envejecer(e.subscriptionId, 31);
      await runRenewalPass({ provider: fakeBillingProvider("approve", "retryable_decline") });

      const { data: antes } = await e.quien.cli.rpc("plan_effective_for_organization",
        { p_organization_id: e.org, p_as_of: new Date().toISOString() });
      assert((antes as Record<string, unknown>).plan_code === "full",
        JSON.stringify(antes));

      // Pasan los 7 días de gracia del mes impagado.
      await envejecer(e.subscriptionId, 71);
      const v = mio(await vencimientos(), e.subscriptionId);
      assert(v?.action === "lapse_due", `la acción es ${v?.action}`);

      const r = await runRenewalPass({ provider: fakeBillingProvider("approve", "approve") });
      const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d?.outcome === "lapsed", JSON.stringify(d));

      const { data: luego } = await e.quien.cli.rpc("plan_effective_for_organization",
        { p_organization_id: e.org, p_as_of: new Date().toISOString() });
      assert((luego as Record<string, unknown>).plan_code === "free",
        `quedó en ${JSON.stringify(luego)}`);
      assert((luego as Record<string, unknown>).grant_kind === "base",
        `se concedió un Free nuevo en vez de descubrir el permanente: ${JSON.stringify(luego)}`);

      // Nada se borró: módulos, deuda, tarjeta y suscripción siguen.
      const { data: mods } = await admin.from("organization_modules")
        .select("module_code, enabled").eq("organization_id", e.org).eq("enabled", true);
      assert((mods ?? []).length > 0, "se apagaron módulos al caducar");
      const ps = await periodos(e.subscriptionId);
      assert(ps[1].status === "open", "desapareció la deuda");
      const { count: tarjetas } = await admin.from("billing_payment_methods")
        .select("id", { count: "exact", head: true }).eq("organization_id", e.org);
      assert((tarjetas ?? 0) === 1, "se borró el medio de pago");
      const { data: s } = await admin.from("billing_subscriptions")
        .select("status").eq("id", e.subscriptionId).single();
      assert((s as { status: string }).status === "lapsed", JSON.stringify(s));
    });

    await check("Una suscripción caducada no genera más meses ni vuelve sola", async () => {
      const { data: caducadas } = await admin.from("billing_subscriptions")
        .select("id").eq("status", "lapsed").limit(1);
      const sub = ((caducadas ?? []) as { id: string }[])[0];
      assert(sub, "no hay ninguna caducada con la que comprobarlo");
      const { data } = await admin.rpc("billing_open_next_period",
        { p_subscription_id: sub.id });
      const r = data as Record<string, unknown>;
      assert(r.status === "lapsed" && r.reason === "REACTIVATION_REQUIRES_NEW_PURCHASE",
        JSON.stringify(r));
      assert(!mio(await vencimientos(200), sub.id), "una caducada volvió a la cola de cobro");
    });

    // =====================================================================
    console.log("\nF · El dinero");
    // =====================================================================

    await check("G. Base congelada, sin volver a mirar el tipo de cambio", async () => {
      const e = await empresaConPlan("importe");
      await envejecer(e.subscriptionId, 31);
      await admin.rpc("billing_open_next_period", { p_subscription_id: e.subscriptionId });
      const ps = await periodos(e.subscriptionId);
      const { data: cargo } = await admin.rpc("billing_period_charge_total",
        { p_period_id: ps[1].id as string });
      const c = cargo as Record<string, unknown>;
      const { data: s } = await admin.from("billing_subscriptions")
        .select("base_charge_amount, charge_currency").eq("id", e.subscriptionId).single();
      const f = s as { base_charge_amount: number; charge_currency: string };
      assert(Number(c.base_amount) === f.base_charge_amount, JSON.stringify(c));
      assert(c.charge_currency === f.charge_currency, JSON.stringify(c));
      assert(Number(c.total_amount) === Number(c.base_amount) + Number(c.tax_amount),
        JSON.stringify(c));
    });

    await check("El impuesto sale de la fecha de la OBLIGACIÓN, no de la del cobro",
      async () => {
      const e = await empresaConPlan("impuesto");
      await envejecer(e.subscriptionId, 31);
      await admin.rpc("billing_open_next_period", { p_subscription_id: e.subscriptionId });
      const ps = await periodos(e.subscriptionId);
      const { data: cargo } = await admin.rpc("billing_period_charge_total",
        { p_period_id: ps[1].id as string });
      const c = cargo as Record<string, unknown>;
      // La función lo dice explícitamente: resolvió a la fecha del periodo.
      assert(c.tax_resolved_at === ps[1].period_start,
        `resolvió a ${c.tax_resolved_at} y el mes empieza en ${ps[1].period_start}`);
      const { data: regla } = await admin.rpc("billing_resolve_tax_rule", {
        p_service_class: "self_service_saas", p_at: ps[1].period_start as string,
        p_jurisdiction: "CO" });
      assert(c.tax_rule_id === (regla as Record<string, unknown>).tax_rule_id,
        "usó una regla fiscal distinta de la vigente en la fecha del mes");
    });

    await check("X/Y/Z. Importe, moneda y un segundo aprobado no cuelan", async () => {
      const e = await empresaConPlan("conciliación");
      await envejecer(e.subscriptionId, 31);
      await admin.rpc("billing_open_next_period", { p_subscription_id: e.subscriptionId });
      const ps = await periodos(e.subscriptionId);
      const per = ps[1].id as string;
      const { data: cargo } = await admin.rpc("billing_period_charge_total",
        { p_period_id: per });
      const total = Number((cargo as Record<string, unknown>).total_amount);

      for (const [nombre, extra] of [
        ["importe", { p_amount: 1, p_currency: "COP", p_live_mode: false }],
        ["moneda", { p_amount: total, p_currency: "USD", p_live_mode: false }],
        ["entorno", { p_amount: total, p_currency: "COP", p_live_mode: null }],
      ] as Array<[string, Record<string, unknown>]>) {
        const { data } = await admin.rpc("billing_settle_period_payment", {
          p_period_id: per, p_provider: W,
          p_provider_payment_id: `b5b-mal-${nombre}-${sello}`, p_outcome: "approved",
          ...extra });
        const o = (data as Record<string, unknown>).outcome;
        assert(o === "reconciliation_mismatch" || o === "environment_mismatch",
          `«${nombre}» dijo ${o}`);
      }

      const { data: bien } = await admin.rpc("billing_settle_period_payment", {
        p_period_id: per, p_provider: W, p_provider_payment_id: `b5b-ok-${sello}`,
        p_outcome: "approved", p_amount: total, p_currency: "COP", p_live_mode: false });
      assert((bien as Record<string, unknown>).outcome === "renewed", JSON.stringify(bien));

      const { data: otra } = await admin.rpc("billing_settle_period_payment", {
        p_period_id: per, p_provider: W, p_provider_payment_id: `b5b-doble-${sello}`,
        p_outcome: "approved", p_amount: total, p_currency: "COP", p_live_mode: false });
      assert((otra as Record<string, unknown>).outcome === "period_already_settled",
        JSON.stringify(otra));
      assert((await periodos(e.subscriptionId)).length === 2,
        "un segundo cobro consumió el mes siguiente");
    });

    // =====================================================================
    console.log("\nG · El calendario, otra vez");
    // =====================================================================

    await check("P/Q. 31 de enero y bisiesto siguen siendo deterministas", async () => {
      const enero = ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"];
      for (let n = 1; n <= 4; n += 1) {
        const { data } = await admin.rpc("billing_period_bounds", {
          p_anchor: "2026-01-31T10:00:00Z", p_interval: "monthly", p_sequence: n });
        assert(String((data as Record<string, unknown>).period_end).slice(0, 10) === enero[n - 1],
          `sec ${n}: ${JSON.stringify(data)}`);
      }
      const { data: b } = await admin.rpc("billing_period_bounds", {
        p_anchor: "2024-02-29T10:00:00Z", p_interval: "annual", p_sequence: 1 });
      assert(String((b as Record<string, unknown>).period_end).slice(0, 10) === "2025-02-28",
        JSON.stringify(b));
    });

    // =====================================================================
    console.log("\nH · Quién ve las pasadas");
    // =====================================================================

    await check("Las pasadas son de la plataforma · nadie escribe · sin secretos", async () => {
      const ajeno = await persona("b5b-ajeno");
      const { data: suyas } = await ajeno.cli.from("billing_renewal_runs").select("id");
      assert((suyas ?? []).length === 0, "un cliente vio el barrido de facturación");
      const { error } = await ajeno.cli.from("billing_renewal_runs")
        .insert({ status: "running" });
      assert(error, "un cliente pudo inventarse una pasada");
      for (const fn of ["billing_due_renewals", "billing_lapse_subscription",
                        "billing_mark_renewal_failure", "billing_period_charge_total"]) {
        const { error: e } = await ajeno.cli.rpc(fn, {});
        assert(e, `un cliente pudo llamar a ${fn}`);
      }
    });
  } finally {
    for (const org of orgs) await limpiar(org);
    const { data: tasas } = await admin.from("commercial_fx_rates").select("id, note");
    for (const t of ((tasas ?? []) as { id: string; note: string | null }[])
      .filter((x) => (x.note ?? "").includes(`QA PE-05B5B ${sello}`))) {
      await admin.from("commercial_fx_rates").delete().eq("id", t.id);
    }
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.from("user_legal_acceptances").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B5B · cimientos: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

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
