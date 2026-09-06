/**
 * Trazaloop · PE-05B5C · El ciclo completo, y la puerta que lo dispara.
 *
 * Tres estados que 0174 no sabía nombrar y que terminan mal si nadie los
 * modela: quien no tiene con qué pagar, quien decide irse, y —el peor— aquel
 * de quien no sabemos si pagó.
 *
 * Ni una llamada real a una pasarela.
 *
 * Correr: npm run test:pe05b5c-lifecycle
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
const orgs: string[] = [];
const W = "wompi";
const RUTA = readFileSync("app/api/billing/renewals/run/route.ts", "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function persona(prefijo: string) {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B5C" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b5c" });
  return { id: data.user!.id, email, cli };
}

async function empresaConPlan(nombre: string) {
  const quien = await persona("b5c");
  const { data: orgId } = await quien.cli.rpc("create_organization",
    { p_name: `${nombre} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", quien.id);

  const { data: q } = await quien.cli.rpc("billing_create_quote", {
    p_organization_id: org, p_plan_code: "full", p_billing_interval: "monthly" });
  const { data: i } = await quien.cli.rpc("billing_open_checkout_intent", {
    p_quote_id: (q as { quote_id: string }).quote_id, p_provider: W,
    p_environment: "test" });
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
    p_provider_payment_id: `b5c-ini-${org.slice(0, 8)}`, p_outcome: "approved",
    p_amount: intento.expected_total_amount, p_currency: "COP",
    p_live_mode: false, p_failure_reason: null });

  // La prueba introductoria se cierra un milisegundo después de nacer: quien
  // renueva lleva meses dentro y hace mucho que la suya caducó.
  const { data: pruebas } = await admin.from("organization_plan_assignments")
    .select("id, starts_at").eq("organization_id", org).eq("grant_kind", "trial");
  for (const f of (pruebas ?? []) as { id: string; starts_at: string }[]) {
    const { error } = await admin.from("organization_plan_assignments")
      .update({ ends_at: new Date(new Date(f.starts_at).getTime() + 1).toISOString() })
      .eq("id", f.id);
    assert(!error, `cerrar la prueba: ${error?.message}`);
  }

  const { data: sub } = await admin.from("billing_subscriptions")
    .select("id").eq("organization_id", org).single();
  return { org, quien, subscriptionId: (sub as { id: string }).id, metodo };
}

/** Mueve el ancla y recalcula los límites con el calendario canónico. */
async function envejecer(subscriptionId: string, dias: number) {
  const { data: sub } = await admin.from("billing_subscriptions")
    .select("billing_interval").eq("id", subscriptionId).single();
  const intervalo = (sub as { billing_interval: string }).billing_interval;
  const { data: ps } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, period_start").eq("subscription_id", subscriptionId)
    .order("period_sequence");
  const filas = (ps ?? []) as { id: string; period_sequence: number; period_start: string }[];
  const ancla = new Date(new Date(filas[0].period_start).getTime()
    - dias * 86_400_000).toISOString();
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
}

const vencimientos = async () => {
  const { data, error } = await admin.rpc("billing_due_renewals",
    { p_now: new Date().toISOString(), p_limit: 200 });
  assert(!error, `vencimientos: ${error?.message}`);
  return (data ?? []) as Record<string, unknown>[];
};
const accionDe = (filas: Record<string, unknown>[], sub: string) =>
  filas.find((f) => f.subscription_id === sub)?.action as string | undefined;
// Sin `p_as_of`: el instante lo pone la base, que es de donde sale la verdad.
// Pasarle el reloj del anfitrion abria una ventana de milisegundos -- el reloj
// del contenedor va unas decimas por delante -- en la que un derecho recien
// cerrado todavia se leia vivo. Ademas es como lo llama el producto.
const plan = async (e: { org: string; quien: { cli: SupabaseClient } }) => {
  const { data } = await e.quien.cli.rpc("plan_effective_for_organization",
    { p_organization_id: e.org });
  return data as Record<string, unknown>;
};
const vivas = async (org: string) => {
  const { data } = await admin.from("organization_plan_assignments")
    .select("id, grant_kind, module_code, plan_revision_id")
    .eq("organization_id", org).is("ends_at", null);
  return (data ?? []) as Record<string, unknown>[];
};

async function main() {
  const { error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA PE-05B5C ${sello} · tasa sintetica, NO comercial` });
  assert(!efx, `tasa: ${efx?.message}`);

  console.log("\nPE-05B5C · El ciclo completo\n");

  const { runRenewalPass } = await import("../../lib/billing/renewal/orchestrator");
  const { fakeBillingProvider } = await import("../../lib/billing/providers/fake");
  const doble = () => fakeBillingProvider("approve", "approve");

  try {
    // =====================================================================
    console.log("A · Quien no tiene con qué pagar");
    // =====================================================================

    await check("J1. Dentro de la gracia: se ve, no se cobra, y sigue pagando", async () => {
      const e = await empresaConPlan("sin tarjeta gracia");
      await envejecer(e.subscriptionId, 33);   // vencido hace dos días
      await admin.from("billing_payment_methods")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", e.metodo);

      assert(accionDe(await vencimientos(), e.subscriptionId) === "payment_method_unavailable",
        `desapareció de la vida: ${accionDe(await vencimientos(), e.subscriptionId)}`);

      const r = await runRenewalPass({ provider: doble() });
      const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d?.failureClass === "payment_method_unavailable", JSON.stringify(d));
      assert(r.charged === 0 && r.retried === 0, "cobró sin tarjeta");
      assert((await plan(e)).plan_code === "full", "perdió el derecho estando en gracia");
    });

    await check("J2. Pasada la gracia SÍ caduca · sin tarjeta no es un salvoconducto",
      async () => {
      const e = await empresaConPlan("sin tarjeta caduca");
      await envejecer(e.subscriptionId, 31);
      await admin.rpc("billing_open_next_period", { p_subscription_id: e.subscriptionId });
      await admin.from("billing_payment_methods")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", e.metodo);
      await envejecer(e.subscriptionId, 71);   // el mes 2 lleva más de 7 días vencido

      assert(accionDe(await vencimientos(), e.subscriptionId) === "lapse_due",
        `dijo ${accionDe(await vencimientos(), e.subscriptionId)}`);
      const r = await runRenewalPass({ provider: doble() });
      assert(r.decisions.find((x) => x.subscriptionId === e.subscriptionId)?.outcome === "lapsed",
        "no cayó");
      const p = await plan(e);
      assert(p.plan_code === "free" && p.grant_kind === "base",
        `quedó en ${JSON.stringify(p)}`);
      // Y el suelo Free es el de siempre: ni uno nuevo, ni dos.
      const vs = await vivas(e.org);
      assert(vs.length > 0 && vs.every((a) => a.grant_kind === "base"),
        `asignaciones vivas raras: ${JSON.stringify(vs)}`);
    });

    // =====================================================================
    console.log("\nB · Aquel de quien no sabemos si pagó");
    // =====================================================================

    await check("I. Pasada la gracia NO caduca · va a revisión y conserva el derecho",
      async () => {
      const e = await empresaConPlan("en duda");
      await envejecer(e.subscriptionId, 31);
      // Un cobro que salió y no volvió.
      const r1 = await runRenewalPass({
        provider: fakeBillingProvider("approve", "lost_response") });
      assert(r1.decisions.find((x) => x.subscriptionId === e.subscriptionId)?.failureClass
        === "provider_unknown", "no se provocó la duda");

      await envejecer(e.subscriptionId, 71);   // muy pasada la gracia

      assert(accionDe(await vencimientos(), e.subscriptionId) === "manual_review_required",
        `dijo ${accionDe(await vencimientos(), e.subscriptionId)}`);

      const r2 = await runRenewalPass({ provider: doble() });
      const d = r2.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d?.outcome === "manual_review", JSON.stringify(d));

      // Ni se cobró, ni se saldó, ni se dejó caer, ni se bajó a Free.
      const { data: s } = await admin.from("billing_subscriptions")
        .select("status").eq("id", e.subscriptionId).single();
      assert((s as { status: string }).status === "past_due",
        `la suscripción quedó ${JSON.stringify(s)}`);
      assert((await plan(e)).plan_code === "full", "le quitó el servicio sin saber si pagó");
      const { count: pagos } = await admin.from("billing_payments")
        .select("id", { count: "exact", head: true }).eq("organization_id", e.org);
      assert((pagos ?? 0) === 1, "apareció un cobro de renovación que nadie confirmó");
    });

    await check("Y la caducidad canónica se NIEGA mientras dure la duda", async () => {
      const { data: subs } = await admin.from("billing_subscriptions")
        .select("id, organization_id").eq("status", "past_due");
      let probada = false;
      for (const s of (subs ?? []) as { id: string }[]) {
        const { data: duda } = await admin.rpc("billing_has_unresolved_charge",
          { p_subscription_id: s.id });
        if (duda !== true) continue;
        const { data } = await admin.rpc("billing_lapse_subscription",
          { p_subscription_id: s.id });
        const r = data as Record<string, unknown>;
        assert(r.status === "blocked" && r.reason === "UNRESOLVED_PROVIDER_CHARGE",
          JSON.stringify(r));
        probada = true;
      }
      assert(probada, "no había ninguna suscripción en duda con la que comprobarlo");
    });

    // =====================================================================
    console.log("\nC · Quien decide irse");
    // =====================================================================

    await check("K. Cancelar al vencimiento: sin mes nuevo, sin cobro, a Free", async () => {
      const e = await empresaConPlan("cancela");
      await admin.from("billing_subscriptions")
        .update({ cancel_at_period_end: true, cancelled_at: new Date().toISOString() })
        .eq("id", e.subscriptionId);

      // Antes de que su mes acabe no pasa nada: lo pagado se respeta entero.
      assert(!accionDe(await vencimientos(), e.subscriptionId),
        "se le acortó el mes que ya había pagado");

      await envejecer(e.subscriptionId, 31);
      assert(accionDe(await vencimientos(), e.subscriptionId) === "cancel_due",
        `dijo ${accionDe(await vencimientos(), e.subscriptionId)}`);

      const r = await runRenewalPass({ provider: doble() });
      assert(r.decisions.find((x) => x.subscriptionId === e.subscriptionId)?.outcome
        === "cancelled", "no se ejecutó la cancelación");

      const ps = await admin.from("billing_subscription_periods")
        .select("id").eq("subscription_id", e.subscriptionId);
      assert((ps.data ?? []).length === 1, "abrió un mes nuevo a quien se iba");
      const { count: pagos } = await admin.from("billing_payments")
        .select("id", { count: "exact", head: true }).eq("organization_id", e.org);
      assert((pagos ?? 0) === 1, "le cobró a quien se iba");

      const { data: s } = await admin.from("billing_subscriptions")
        .select("status").eq("id", e.subscriptionId).single();
      assert((s as { status: string }).status === "cancelled",
        `quedó ${JSON.stringify(s)}: irse no es caducar`);
      const p = await plan(e);
      assert(p.plan_code === "free" && p.grant_kind === "base", JSON.stringify(p));
      const { data: mods } = await admin.from("organization_modules")
        .select("module_code").eq("organization_id", e.org).eq("enabled", true);
      assert((mods ?? []).length > 0, "apagó módulos al cancelar");
      const { count: tarjetas } = await admin.from("billing_payment_methods")
        .select("id", { count: "exact", head: true }).eq("organization_id", e.org);
      assert((tarjetas ?? 0) === 1, "borró el medio de pago");
    });

    // =====================================================================
    console.log("\nD · Quien baja de plan");
    // =====================================================================

    await check("L. El cambio programado se aplica al vencer · sin pasar por Free",
      async () => {
      const e = await empresaConPlan("baja de plan");
      const { data: rev } = await admin.from("plan_revisions")
        .select("id, plan_code").eq("plan_code", "extra").eq("status", "published")
        .is("effective_to", null).single();
      const destino = rev as { id: string; plan_code: string };

      await envejecer(e.subscriptionId, 31);
      const { data: s0 } = await admin.from("billing_subscriptions")
        .select("current_period_end").eq("id", e.subscriptionId).single();
      const { error: eprog } = await admin.from("billing_subscriptions").update({
        scheduled_plan_revision_id: destino.id,
        scheduled_effective_at: (s0 as { current_period_end: string }).current_period_end,
        // El precio se congela AL PROGRAMAR, igual que al contratar.
        scheduled_base_charge_amount: 400000, scheduled_charge_currency: "COP",
        scheduled_fx_rate_micros: 4_000_000_000,
      }).eq("id", e.subscriptionId);
      assert(!eprog, `programar: ${eprog?.message}`);

      assert(accionDe(await vencimientos(), e.subscriptionId) === "downgrade_due",
        `dijo ${accionDe(await vencimientos(), e.subscriptionId)}`);

      const r = await runRenewalPass({ provider: doble() });
      assert(r.decisions.find((x) => x.subscriptionId === e.subscriptionId)?.outcome
        === "applied", "no se aplicó el cambio");

      const p = await plan(e);
      assert(p.plan_code === destino.plan_code, `quedó en ${JSON.stringify(p)}`);
      assert(p.grant_kind === "sold", "pasó por Free en medio");
      const { data: s } = await admin.from("billing_subscriptions")
        .select("plan_code, base_charge_amount, scheduled_plan_revision_id")
        .eq("id", e.subscriptionId).single();
      const f = s as Record<string, unknown>;
      assert(f.plan_code === destino.plan_code && Number(f.base_charge_amount) === 400000,
        `la suscripción no cobra el plan nuevo: ${JSON.stringify(f)}`);
      assert(f.scheduled_plan_revision_id === null, "el cambio programado sigue pendiente");

      // Un nivel comercial por módulo, sin duplicados.
      const vs = await vivas(e.org);
      const vendidas = vs.filter((a) => a.grant_kind === "sold");
      const porModulo = new Set(vendidas.map((a) => String(a.module_code)));
      assert(vendidas.length === porModulo.size,
        `hay niveles duplicados: ${JSON.stringify(vendidas)}`);
    });

    await check("Media transición programada no se puede ni escribir", async () => {
      const e = await empresaConPlan("media transición");
      const { data: rev } = await admin.from("plan_revisions")
        .select("id").eq("plan_code", "extra").eq("status", "published")
        .is("effective_to", null).single();
      const { error } = await admin.from("billing_subscriptions").update({
        scheduled_plan_revision_id: (rev as { id: string }).id,
        scheduled_effective_at: new Date().toISOString(),
      }).eq("id", e.subscriptionId);
      assert(error, "se pudo programar una bajada sin precio: se aplicaría sin saber qué cobrar");
    });

    // =====================================================================
    console.log("\nE · La precedencia, escrita y comprobada");
    // =====================================================================

    await check("C. La duda manda sobre la caducidad, y la caducidad sobre la tarjeta",
      async () => {
      // Los dos cruces ya quedaron demostrados arriba con casos completos;
      // aquí se fija que el orden está declarado y no heredado del `case`.
      const sql = readFileSync(
        "supabase/migrations/0175_billing_renewal_lifecycle.sql", "utf8");
      const cuerpo = sql.slice(sql.indexOf("create or replace function public.billing_due_renewals"));
      const orden = ["cancel_due", "downgrade_due", "manual_review_required",
                     "lapse_due", "payment_method_unavailable", "in_flight"];
      let anterior = -1;
      for (const a of orden) {
        const i = cuerpo.indexOf(`'${a}'`);
        assert(i > anterior, `«${a}» no está en su sitio dentro de la precedencia`);
        anterior = i;
      }
    });

    // =====================================================================
    console.log("\nF · Retirar sin mentir sobre por qué terminó");
    // =====================================================================

    await check("Una suscripción SANA se puede retirar · y no finge un impago",
      async () => {
      const e = await empresaConPlan("retiro");
      // Sana de verdad: su mes está pagado y todavía corriendo.
      const { data: antes } = await admin.rpc("billing_lapse_subscription",
        { p_subscription_id: e.subscriptionId });
      assert((antes as Record<string, unknown>).status === "not_due",
        "la caducidad aceptó una suscripción sin deuda");
      const { data: cancelar } = await admin.rpc("billing_cancel_at_period_end",
        { p_subscription_id: e.subscriptionId });
      assert((cancelar as Record<string, unknown>).status === "not_scheduled",
        "la cancelación aceptó algo que nadie anunció");

      const { data, error } = await admin.rpc("billing_retire_subscription", {
        p_subscription_id: e.subscriptionId, p_reason_code: "qa_fixture_retirement",
        p_reason: "Retiro del fixture sintético de la prueba de renovación." });
      assert(!error, `retirar: ${error?.message}`);
      const r = data as Record<string, unknown>;
      assert(r.status === "retired", JSON.stringify(r));

      const { data: s } = await admin.from("billing_subscriptions")
        .select("status, retired_at, retirement_reason_code, retirement_reason, cancelled_at")
        .eq("id", e.subscriptionId).single();
      const f = s as Record<string, unknown>;
      // Que no diga «cancelled» ni «lapsed» no se comprueba comparando contra
      // sí mismo —el compilador ya sabe que no lo es—: se comprueba en que la
      // huella de esas dos historias NO está escrita. Si esto fuera una
      // cancelación, `cancelled_at` tendría fecha.
      assert(f.status === "retired", JSON.stringify(f));
      assert(f.cancelled_at === null, "se marcó como si el cliente se hubiera ido");
      assert(f.retirement_reason_code === "qa_fixture_retirement" && f.retired_at,
        JSON.stringify(f));
    });

    await check("Sin motivo, o con uno inventado, no se retira nada", async () => {
      const e = await empresaConPlan("retiro sin motivo");
      for (const [codigo, motivo] of [
        ["se_me_antojo", "Un motivo suficientemente largo."],
        ["qa_fixture_retirement", "corto"],
      ] as Array<[string, string]>) {
        const { error } = await admin.rpc("billing_retire_subscription", {
          p_subscription_id: e.subscriptionId, p_reason_code: codigo, p_reason: motivo });
        assert(error, `se retiró con «${codigo}» / «${motivo}»`);
      }
      const { data: s } = await admin.from("billing_subscriptions")
        .select("status").eq("id", e.subscriptionId).single();
      assert((s as { status: string }).status === "active", "quedó tocada igualmente");
    });

    await check("La retirada no cobra, no abre meses, y no vuelve sola", async () => {
      const e = await empresaConPlan("retirada inerte");
      await envejecer(e.subscriptionId, 31);
      assert(accionDe(await vencimientos(), e.subscriptionId) === "renew",
        "no estaba vencida antes de retirarla");

      await admin.rpc("billing_retire_subscription", {
        p_subscription_id: e.subscriptionId, p_reason_code: "administrative_correction",
        p_reason: "Corrección administrativa comprobada por la prueba." });

      assert(!accionDe(await vencimientos(), e.subscriptionId),
        "una retirada volvió a la cola de cobro");
      const { data: abrir } = await admin.rpc("billing_open_next_period",
        { p_subscription_id: e.subscriptionId });
      const a = abrir as Record<string, unknown>;
      assert(a.status === "retired" && a.reason === "RETIRED_SUBSCRIPTION_DOES_NOT_RESUME",
        JSON.stringify(a));
      // Ni caducar ni cancelar la resucitan.
      for (const fn of ["billing_lapse_subscription", "billing_cancel_at_period_end"]) {
        const { data } = await admin.rpc(fn, { p_subscription_id: e.subscriptionId });
        assert((data as Record<string, unknown>).status !== "lapsed"
          && (data as Record<string, unknown>).status !== "cancelled",
          `${fn} movió una retirada`);
      }
      const r = await runRenewalPass({ provider: doble() });
      assert(!r.decisions.some((x) => x.subscriptionId === e.subscriptionId),
        "el planificador la volvió a mirar");
    });

    await check("Free vuelve solo · y la empresa puede contratar de nuevo", async () => {
      const e = await empresaConPlan("retiro y vuelta");
      assert((await plan(e)).plan_code === "full", "no estaba en Full antes");

      await admin.rpc("billing_retire_subscription", {
        p_subscription_id: e.subscriptionId, p_reason_code: "qa_fixture_retirement",
        p_reason: "Retiro para comprobar que Free vuelve por sí solo." });

      const p = await plan(e);
      assert(p.plan_code === "free" && p.grant_kind === "base",
        `quedó en ${JSON.stringify(p)}`);
      const vs = await vivas(e.org);
      assert(vs.length > 0 && vs.every((a) => a.grant_kind === "base"),
        `se concedió un Free nuevo: ${JSON.stringify(vs)}`);
      // Módulos, medio de pago e historial intactos.
      const { data: mods } = await admin.from("organization_modules")
        .select("module_code").eq("organization_id", e.org).eq("enabled", true);
      assert((mods ?? []).length > 0, "apagó módulos");
      const { count: tarjetas } = await admin.from("billing_payment_methods")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", e.org).eq("status", "active");
      assert((tarjetas ?? 0) === 1, "revocó el medio de pago");
      const { count: pagos } = await admin.from("billing_payments")
        .select("id", { count: "exact", head: true }).eq("organization_id", e.org);
      assert((pagos ?? 0) === 1, "tocó la historia de cobros");

      // Y la organización queda libre: puede volver a contratar. Antes esto se
      // comprobaba metiendo a mano una suscripción viva suelta; desde B6F eso
      // no cabe —una suscripción viva tiene su obligación— así que se comprueba
      // igual que lo hace el producto: contratando otra vez.
      const { data: q2 } = await e.quien.cli.rpc("billing_create_quote", {
        p_organization_id: e.org, p_plan_code: "full", p_billing_interval: "monthly" });
      const { data: i2 } = await e.quien.cli.rpc("billing_open_checkout_intent", {
        p_quote_id: (q2 as { quote_id: string }).quote_id, p_provider: W,
        p_environment: "test" });
      const int2 = i2 as unknown as { intent_id: string; expected_total_amount: number };
      const { error } = await admin.rpc("billing_settle_provider_payment", {
        p_provider: W, p_external_reference: int2.intent_id,
        p_provider_payment_id: `b5c-vuelta-${e.org.slice(0, 8)}`, p_outcome: "approved",
        p_amount: int2.expected_total_amount, p_currency: "COP",
        p_live_mode: false, p_failure_reason: null });
      assert(!error, `la retirada sigue bloqueando la empresa: ${error?.message}`);

      const { data: vivas2 } = await admin.from("billing_subscriptions")
        .select("id, status").eq("organization_id", e.org).eq("status", "active");
      assert((vivas2 ?? []).length === 1, `quedaron ${(vivas2 ?? []).length} vivas`);
      const { count: obligaciones } = await admin.from("billing_subscription_periods")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", ((vivas2 ?? [])[0] as { id: string }).id);
      assert((obligaciones ?? 0) === 1, "la suscripción nueva nació sin obligación");
    });

    await check("Ningún rol de producto puede retirar una suscripción", async () => {
      const ajeno = await persona("b5c-rol");
      const { error } = await ajeno.cli.rpc("billing_retire_subscription", {
        p_subscription_id: "00000000-0000-4000-8000-000000000000",
        p_reason_code: "administrative_correction", p_reason: "Intento desde el producto." });
      assert(error, "un usuario de producto pudo retirar una suscripción");
    });

    // =====================================================================
    console.log("\nF · La puerta");
    // =====================================================================

    await check("N. Falla cerrada, no dice que existe, y no la abre una sesión", async () => {
      const cuerpo = sinComentarios(RUTA);
      assert(/status: 404/.test(cuerpo), "responde algo distinto de 404 a quien no pasa");
      assert(!/401|403/.test(cuerpo), "revela que la puerta existe");
      assert(/secreto\.length < 16/.test(cuerpo),
        "no falla cerrada sin secreto configurado");
      assert(/timingSafeEqual/.test(cuerpo), "compara el secreto sin tiempo constante");
      // Ninguna sesión de usuario autoriza esto: no se mira la sesión siquiera.
      for (const p of ["createServerClient", "requireSession", "requireActiveOrg",
                       "checkPlatformStatus", "auth.getUser"]) {
        assert(!cuerpo.includes(p), `la puerta mira la sesión (${p}): es un trabajo de servidor`);
      }
      assert(/export async function GET/.test(cuerpo) && /GET\(\)[\s\S]{0,120}noExiste/.test(cuerpo),
        "un GET no está rechazado");
    });

    await check("E. Cobrar exige CUATRO cosas · y mirar no es una de ellas", async () => {
      const cuerpo = sinComentarios(RUTA);
      // B5C decía «esta puerta no puede cobrar nunca». B5D le añade un modo que
      // sí puede, así que la invariante ya no es «nunca»: es que no pueda sin
      // las cuatro llaves a la vez. Se comprueba que las cuatro están, y que la
      // de mirar no abre la de cobrar.
      assert(/BILLING_RENEWAL_EXECUTION_ENABLED === "true"/.test(cuerpo),
        "falta el interruptor de servidor");
      assert(/BILLING_RENEWAL_EXECUTE_SECRET/.test(cuerpo),
        "falta el secreto propio de ejecución");
      assert(/BILLING_RENEWAL_EXECUTION_ALLOWLIST/.test(cuerpo)
        && /listaBlanca\.length > 0/.test(cuerpo),
        "falta la lista blanca, o no se exige que tenga a alguien");
      assert(/VERCEL_ENV === "production"/.test(cuerpo), "no se cierra en Producción");

      // DOS CABECERAS DISTINTAS. Si fueran la misma, quien diagnostica podría
      // mover dinero.
      assert(/x-billing-runner-secret/.test(cuerpo) && /x-billing-execute-secret/.test(cuerpo),
        "mirar y cobrar comparten cabecera");
      const bloqueEjecutar = cuerpo.slice(cuerpo.indexOf("const ejecutar"),
                                          cuerpo.indexOf("const runId"));
      assert(!/x-billing-runner-secret/.test(bloqueEjecutar),
        "el secreto de mirar autoriza a cobrar");

      // Y el cuerpo de la petición no aparece en la decisión: pedir ejecutar no
      // autoriza a ejecutar.
      assert(!/cuerpo\.(mode|execute)/.test(bloqueEjecutar),
        "el navegador puede pedir el modo de ejecución");

      // Sin las cuatro, la pasada es en seco Y el proveedor real ni se
      // construye: no hay con qué cobrar aunque algo fallara.
      assert(/dryRun: !ejecutar/.test(cuerpo), "no cae en seco cuando no se ejecuta");
      assert(/ejecutar \? wompiFromEnv\(\) : fakeBillingProvider/.test(cuerpo),
        "el proveedor real se construye aunque no se vaya a ejecutar");
      assert(/onlySubscriptions: ejecutar \? listaBlanca : undefined/.test(cuerpo),
        "la lista blanca no limita la ejecución");

      // Ninguna sesión, y ningún dato de tarjeta.
      for (const p of ["createPaymentSource", "tokens/cards", "cvc", "card_holder"]) {
        assert(!cuerpo.includes(p), `la puerta toca datos de tarjeta (${p})`);
      }
    });

    await check("La lista blanca es la que decide a quién alcanza una ejecución",
      async () => {
      // El cierre no vive solo en la ruta: el orquestador filtra ANTES de mirar
      // nada, así que una lista blanca vacía o ajena no alcanza a nadie.
      const orq = sinComentarios(
        readFileSync("lib/billing/renewal/orchestrator.ts", "utf8"));
      assert(/permitidas\s*\?\s*todas\.filter/.test(orq),
        "el orquestador no filtra por lista blanca");

      const e = await empresaConPlan("fuera de lista");
      await envejecer(e.subscriptionId, 31);
      const r = await runRenewalPass({
        provider: doble(),
        onlySubscriptions: ["00000000-0000-4000-8000-000000000000"] });
      assert(!r.decisions.some((x) => x.subscriptionId === e.subscriptionId),
        "una suscripción fuera de la lista entró en la pasada");
      assert(r.dueFound === 0, `alcanzó a ${r.dueFound} que no estaban invitadas`);
    });

    await check("En seco no toca nada · ni cobra, ni cancela, ni deja caer", async () => {
      const e = await empresaConPlan("en seco");
      await envejecer(e.subscriptionId, 31);
      const antesPer = (await admin.from("billing_subscription_periods")
        .select("id").eq("subscription_id", e.subscriptionId)).data?.length ?? 0;

      const r = await runRenewalPass({ provider: doble(), dryRun: true });
      const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d?.outcome === "dry_run:renew", JSON.stringify(d));
      assert(d.attemptId === null && d.providerPaymentId === null, JSON.stringify(d));

      const luegoPer = (await admin.from("billing_subscription_periods")
        .select("id").eq("subscription_id", e.subscriptionId)).data?.length ?? 0;
      assert(luegoPer === antesPer, "la pasada en seco abrió un mes");
      const { count: ints } = await admin.from("billing_checkout_intents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", e.org).not("period_id", "is", null);
      assert((ints ?? 0) === 0, "la pasada en seco creó un intento de cobro");
    });
  } finally {
    for (const org of orgs) await limpiar(org);
    const { data: tasas } = await admin.from("commercial_fx_rates").select("id, note");
    for (const t of ((tasas ?? []) as { id: string; note: string | null }[])
      .filter((x) => (x.note ?? "").includes(`QA PE-05B5C ${sello}`))) {
      await admin.from("commercial_fx_rates")
        .update({ status: "retired" }).eq("id", t.id);
    }
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.from("user_legal_acceptances").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B5C · ciclo de vida: ${passed} en verde, ${failed} en rojo\n`);
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
