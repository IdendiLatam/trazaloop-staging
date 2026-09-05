/**
 * Trazaloop · PE-05B5E · El lado que falla: huecos, gracia y dudas.
 *
 * Cuatro defectos que solo se notan cuando algo sale mal, que es cuando peor se
 * notan las cosas: un mes impagado que vencía al terminar en vez de al empezar,
 * un intento que nunca salió gastando uno de los cuatro cobros del cliente, ese
 * mismo intento dejando el mes atascado para siempre, y un descuadre de importe
 * que no bloqueaba nada.
 *
 * Ni una llamada real a una pasarela.
 *
 * Correr: npm run test:pe05b5e-failures
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
    email, password, email_confirm: true, user_metadata: { full_name: "QA B5E" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b5e" });
  return { id: data.user!.id, email, cli };
}

async function empresaConPlan(nombre: string) {
  const quien = await persona("b5e");
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
    p_provider_payment_id: `b5e-ini-${org.slice(0, 8)}`, p_outcome: "approved",
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

const periodosDe = async (sub: string) => {
  const { data } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, period_start, period_end, status")
    .eq("subscription_id", sub).order("period_sequence");
  return (data ?? []) as Record<string, unknown>[];
};
const vencimientos = async () => {
  const { data, error } = await admin.rpc("billing_due_renewals",
    { p_now: new Date().toISOString(), p_limit: 200 });
  assert(!error, `vencimientos: ${error?.message}`);
  return (data ?? []) as Record<string, unknown>[];
};
const plan = async (e: { org: string; quien: { cli: SupabaseClient } }) => {
  const { data } = await e.quien.cli.rpc("plan_effective_for_organization",
    { p_organization_id: e.org, p_as_of: new Date().toISOString() });
  return data as Record<string, unknown>;
};

async function main() {
  const { error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA PE-05B5E ${sello} · tasa sintetica, NO comercial` });
  assert(!efx, `tasa: ${efx?.message}`);

  console.log("\nPE-05B5E · El lado que falla\n");

  const { runRenewalPass } = await import("../../lib/billing/renewal/orchestrator");
  const { fakeBillingProvider } = await import("../../lib/billing/providers/fake");
  const doble = (c: Parameters<typeof fakeBillingProvider>[1] = "approve") =>
    fakeBillingProvider("approve", c);

  /**
   * Deja la suscripción con su mes 2 abierto y sin pagar, empezado hace `dias`.
   *
   * `envejecer` mueve el ancla RELATIVO a donde esté, así que se llama dos
   * veces: la primera para que el mes 1 termine y nazca el 2, la segunda para
   * empujar ese mes 2 hacia atrás los días que interesen. Sumar los dos números
   * en una sola llamada retrocedería el doble.
   */
  async function conMesImpagado(nombre: string, diasDesdeElVencimiento: number) {
    const e = await empresaConPlan(nombre);
    await envejecer(e.subscriptionId, 31);
    await admin.rpc("billing_open_next_period", { p_subscription_id: e.subscriptionId });
    await envejecer(e.subscriptionId, diasDesdeElVencimiento);
    return e;
  }
  const intentosDe = async (sub: string) => {
    const { data } = await admin.from("billing_checkout_intents")
      .select("id, status, period_id, failure_class, provider_submitted_at, created_at")
      .eq("billing_subscription_id", sub).not("period_id", "is", null)
      .order("created_at");
    return (data ?? []) as Record<string, unknown>[];
  };

  try {
    // =====================================================================
    console.log("A · Cuándo vence un mes que no se ha pagado");
    // =====================================================================

    await check("El mes impagado vence cuando EMPIEZA, no cuando acaba", async () => {
      // Diez días dentro de un mes sin pagar, con la gracia de 7 agotada.
      const e = await conMesImpagado("vencimiento", 10);
      const f = (await vencimientos()).find((x) => x.subscription_id === e.subscriptionId);
      assert(f, "una empresa con diez días de impago era INVISIBLE para el motor");
      const ps = await periodosDe(e.subscriptionId);
      assert(String(f.due_at) === String(ps[1].period_start),
        `vence en ${f.due_at} y el mes empieza en ${ps[1].period_start}`);
      assert(f.action === "lapse_due",
        `con la gracia agotada dice ${f.action}: le regala el mes entero`);
    });

    await check("Y dentro de la gracia todavía se reintenta", async () => {
      const e = await conMesImpagado("en gracia", 3);
      const f = (await vencimientos()).find((x) => x.subscription_id === e.subscriptionId);
      assert(f?.action === "retry", `dijo ${f?.action}`);
      assert((await plan(e)).plan_code === "full", "perdió el derecho dentro de la gracia");
    });

    // =====================================================================
    console.log("\nB · Qué gasta uno de los cuatro cobros");
    // =====================================================================

    await check("X. Un intento que NUNCA salió no gasta hueco · y se retoma", async () => {
      const e = await conMesImpagado("no salió", 1);
      const r1 = await runRenewalPass({ provider: doble("unavailable_before_send") });
      const d1 = r1.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d1?.failureClass === "provider_unavailable", JSON.stringify(d1));

      const ints = await intentosDe(e.subscriptionId);
      assert(ints.length === 1, `creó ${ints.length} intentos`);
      assert(ints[0].provider_submitted_at === null,
        "quedó marcado como enviado sin haber salido");

      // No gastó hueco: sigue vencida, y el hueco vigente es el mismo.
      const f = (await vencimientos()).find((x) => x.subscription_id === e.subscriptionId);
      assert(f?.action === "retry", `quedó atascada: ${f?.action}`);

      // Y la pasada siguiente RETOMA el mismo intento, no crea otro.
      const r2 = await runRenewalPass({ provider: doble("approve") });
      const d2 = r2.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d2?.outcome === "submitted", JSON.stringify(d2));
      assert(d2.attemptId === ints[0].id,
        "creó un intento nuevo en vez de retomar el que se quedó a medias");
      assert((await intentosDe(e.subscriptionId)).length === 1,
        "el mes acabó con dos intentos");
    });

    await check("Y. Un intento que SÍ salió gasta su hueco", async () => {
      const e = await conMesImpagado("sí salió", 1);
      await runRenewalPass({ provider: doble("retryable_decline") });
      const ints = await intentosDe(e.subscriptionId);
      assert(ints[0].provider_submitted_at, "no anotó la frontera del envío");
      assert(ints[0].failure_class === "retryable_decline", JSON.stringify(ints[0]));

      // B · entre el hueco 1 y el 2 no se cobra.
      const r = await runRenewalPass({ provider: doble("approve") });
      assert(!r.decisions.some((x) => x.subscriptionId === e.subscriptionId
        && x.outcome === "submitted"),
        "cobró otra vez sin esperar al hueco siguiente");
      assert((await intentosDe(e.subscriptionId)).length === 1, "mandó dos cargos");
    });

    await check("C. En el hueco siguiente sí · y acertar salda EL MISMO mes", async () => {
      const e = await conMesImpagado("acierta", 2);   // ya pasó el hueco de 24 h
      await runRenewalPass({ provider: doble("retryable_decline") });
      const ps = await periodosDe(e.subscriptionId);
      const per = ps[1];

      // El webhook —el camino canónico— salda esa obligación.
      const { data: cargo } = await admin.rpc("billing_period_charge_total",
        { p_period_id: per.id as string });
      const total = Number((cargo as Record<string, unknown>).total_amount);
      const { data: res } = await admin.rpc("billing_settle_period_payment", {
        p_period_id: per.id as string, p_provider: W,
        p_provider_payment_id: `b5e-gracia-${sello}`, p_outcome: "approved",
        p_amount: total, p_currency: "COP", p_live_mode: false });
      assert((res as Record<string, unknown>).outcome === "renewed", JSON.stringify(res));

      // P · el calendario NO se mueve a la fecha del pago.
      const luego = await periodosDe(e.subscriptionId);
      assert(luego[1].period_start === per.period_start
        && luego[1].period_end === per.period_end,
        "pagar tarde movió las fechas del mes");
      const { data: s } = await admin.from("billing_subscriptions")
        .select("status, grace_until, current_period_end").eq("id", e.subscriptionId).single();
      const f = s as Record<string, string | null>;
      assert(f.status === "active" && f.grace_until === null, JSON.stringify(f));
      assert(f.current_period_end === per.period_end, "el derecho no llegó al mes pagado");
    });

    // =====================================================================
    console.log("\nC · Rechazos");
    // =====================================================================

    await check("G/H. Un rechazo DURO no se reintenta · pero la gracia corre", async () => {
      const e = await conMesImpagado("duro", 1);
      await runRenewalPass({ provider: doble("hard_decline") });
      const ints = await intentosDe(e.subscriptionId);
      assert(ints[0].failure_class === "hard_decline", JSON.stringify(ints[0]));

      // Aunque queden huecos, no se vuelve a intentar.
      const e2 = await vencimientos();
      const f = e2.find((x) => x.subscription_id === e.subscriptionId);
      assert(!f || f.action !== "retry",
        `sigue reintentando un rechazo duro: ${f?.action}`);
      const r = await runRenewalPass({ provider: doble("approve") });
      assert(!r.decisions.some((x) => x.subscriptionId === e.subscriptionId
        && x.outcome === "submitted"), "reintentó un rechazo duro");

      // Pero el derecho sigue, porque la gracia es comercial y no técnica.
      assert((await plan(e)).plan_code === "full",
        "le quitó el servicio antes de que acabara la gracia");
    });

    await check("F. Y al acabarse la gracia, cae", async () => {
      const e = await conMesImpagado("duro y caído", 1);
      await runRenewalPass({ provider: doble("hard_decline") });
      await envejecer(e.subscriptionId, 8);   // el mes impagado cumple 9 días
      const f = (await vencimientos()).find((x) => x.subscription_id === e.subscriptionId);
      assert(f?.action === "lapse_due", `dijo ${f?.action}`);
      const r = await runRenewalPass({ provider: doble("approve") });
      assert(r.decisions.find((x) => x.subscriptionId === e.subscriptionId)?.outcome
        === "lapsed", "no cayó al agotarse la gracia");
      const p = await plan(e);
      assert(p.plan_code === "free" && p.grant_kind === "base", JSON.stringify(p));
    });

    await check("D/E. Cuatro cobros como mucho · no hay un quinto", async () => {
      const e = await conMesImpagado("cuatro", 6);   // hueco 3 vigente (144 h)
      // Cinco pasadas seguidas dentro de la MISMA ventana. Un rechazo no
      // devuelve «submitted» —devuelve su clase—, así que lo que se cuenta es
      // lo único que importa de verdad: cuántos cargos cruzaron la frontera.
      for (let n = 0; n < 5; n += 1) {
        await runRenewalPass({ provider: doble("retryable_decline") });
      }
      const enviados = (await intentosDe(e.subscriptionId))
        .filter((i) => i.provider_submitted_at).length;
      assert(enviados === 1,
        `salieron ${enviados} cargos en la misma ventana: los huecos no se respetan`);
      assert(enviados <= 4, "hay un quinto cobro");
    });

    // =====================================================================
    console.log("\nD · Cuando no se sabe");
    // =====================================================================

    await check("K/L. La duda bloquea el hueco siguiente Y la caducidad", async () => {
      const e = await conMesImpagado("duda", 1);
      await runRenewalPass({ provider: doble("lost_response") });
      const ints = await intentosDe(e.subscriptionId);
      assert(ints[0].failure_class === "provider_unknown"
        && ints[0].provider_submitted_at, JSON.stringify(ints[0]));

      // K · ni ahora ni en el hueco siguiente.
      await runRenewalPass({ provider: doble("approve") });
      await envejecer(e.subscriptionId, 3);
      await runRenewalPass({ provider: doble("approve") });
      assert((await intentosDe(e.subscriptionId)).length === 1, "mandó un segundo cargo");

      // L · ni pasada la gracia.
      await envejecer(e.subscriptionId, 9);
      const f = (await vencimientos()).find((x) => x.subscription_id === e.subscriptionId);
      assert(f?.action === "manual_review_required", `dijo ${f?.action}`);
      const { data: caer } = await admin.rpc("billing_lapse_subscription",
        { p_subscription_id: e.subscriptionId });
      assert((caer as Record<string, unknown>).reason === "UNRESOLVED_PROVIDER_CHARGE",
        JSON.stringify(caer));
      assert((await plan(e)).plan_code === "full",
        "le quitó el servicio a alguien de quien no sabemos si pagó");
    });

    await check("M. Un descuadre bloquea igual · no se liquida, ni se reintenta, ni cae",
      async () => {
      const e = await conMesImpagado("descuadre", 1);
      await runRenewalPass({ provider: doble("integrity_mismatch") });
      const ints = await intentosDe(e.subscriptionId);
      assert(ints[0].failure_class === "integrity_mismatch"
        && ints[0].status === "manual_review", JSON.stringify(ints[0]));

      const { data: duda } = await admin.rpc("billing_has_unresolved_charge",
        { p_subscription_id: e.subscriptionId });
      assert(duda === true, "un descuadre no cuenta como dinero en duda");

      await envejecer(e.subscriptionId, 9);
      const f = (await vencimientos()).find((x) => x.subscription_id === e.subscriptionId);
      assert(f?.action === "manual_review_required", `dijo ${f?.action}`);
      await runRenewalPass({ provider: doble("approve") });
      assert((await intentosDe(e.subscriptionId)).length === 1,
        "mandó otro cargo con un descuadre sin resolver");
      const ps = await periodosDe(e.subscriptionId);
      assert(ps[1].status === "open", "liquidó con un descuadre abierto");
    });

    // =====================================================================
    console.log("\nE · Lo que una persona puede ver");
    // =====================================================================

    await check("La vista de operación enseña lo necesario y ni un dato de tarjeta",
      async () => {
      const sa = await persona("b5e-sa");
      await admin.from("platform_staff")
        .insert({ user_id: sa.id, role_code: "superadmin", status: "active" });
      const { data, error } = await sa.cli.from("v_billing_renewal_operations")
        .select("*").limit(5);
      assert(!error, `la plataforma no puede mirar: ${error?.message}`);
      const filas = (data ?? []) as Record<string, unknown>[];
      assert(filas.length > 0, "no ve ninguna suscripción viva");
      for (const campo of ["due_at", "grace_end", "failure_class",
                           "manual_review_required", "provider_submitted_at",
                           "period_status", "attempt_status"]) {
        assert(campo in filas[0], `a la vista le falta «${campo}»`);
      }
      for (const prohibido of ["pan", "cvc", "cvv", "card", "token", "secret"]) {
        for (const k of Object.keys(filas[0])) {
          assert(!k.toLowerCase().includes(prohibido),
            `la vista expone «${k}»`);
        }
      }
      // Y una empresa cualquiera NO ve el estado de las demás.
      const ajeno = await persona("b5e-ajeno");
      const { data: suyas } = await ajeno.cli.from("v_billing_renewal_operations")
        .select("subscription_id");
      assert((suyas ?? []).length === 0, "un cliente vio el barrido de todas");
    });

    // =====================================================================
    console.log("\nF · Lo que sigue excluido");
    // =====================================================================

    await check("S/T/U/V. Retirada, cancelada, caducada, Free y prueba no se cobran",
      async () => {
      const retirada = await empresaConPlan("retirada");
      await admin.rpc("billing_retire_subscription", {
        p_subscription_id: retirada.subscriptionId,
        p_reason_code: "qa_fixture_retirement",
        p_reason: "Retiro comprobado por la prueba de endurecimiento." });
      await envejecer(retirada.subscriptionId, 31);
      assert(!(await vencimientos()).find((x) => x.subscription_id === retirada.subscriptionId),
        "una retirada volvió a la cola");

      const v = await vencimientos();
      for (const f of v) {
        const { data: s } = await admin.from("billing_subscriptions")
          .select("status, plan_code").eq("id", f.subscription_id as string).single();
        const ss = s as { status: string; plan_code: string };
        assert(["active", "past_due"].includes(ss.status),
          `entró una suscripción ${ss.status}`);
        assert(["full", "extra"].includes(ss.plan_code),
          `entró un plan que no se cobra: ${ss.plan_code}`);
      }
    });

    await check("W. Dos trabajadores a la vez siguen sin poder duplicar un cargo",
      async () => {
      const e = await conMesImpagado("dos obreros", 1);
      const [a, b] = await Promise.all([
        runRenewalPass({ provider: doble("approve") }),
        runRenewalPass({ provider: doble("approve") }),
      ]);
      const enviados = [...a.decisions, ...b.decisions]
        .filter((x) => x.subscriptionId === e.subscriptionId && x.outcome === "submitted");
      assert(enviados.length === 1, `salieron ${enviados.length} cargos a la vez`);
      assert((await intentosDe(e.subscriptionId))
        .filter((i) => i.provider_submitted_at).length === 1, "se enviaron dos");
    });

    await check("R. Un fallo que llega tarde no deshace una liquidación", async () => {
      const e = await conMesImpagado("tarde", 1);
      const r = await runRenewalPass({ provider: doble("approve") });
      const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      const ps = await periodosDe(e.subscriptionId);
      const { data: cargo } = await admin.rpc("billing_period_charge_total",
        { p_period_id: ps[1].id as string });
      await admin.rpc("billing_settle_period_payment", {
        p_period_id: ps[1].id as string, p_provider: W,
        p_provider_payment_id: `b5e-ok-${sello}`, p_outcome: "approved",
        p_amount: Number((cargo as Record<string, unknown>).total_amount),
        p_currency: "COP", p_live_mode: false });

      const { data: tarde } = await admin.rpc("billing_mark_renewal_failure", {
        p_intent_id: d!.attemptId, p_failure_class: "hard_decline",
        p_failure_reason: "Llegó tarde." });
      void tarde;
      const luego = await periodosDe(e.subscriptionId);
      assert(luego[1].status === "settled", "un fallo tardío deshizo la liquidación");
      const { data: s } = await admin.from("billing_subscriptions")
        .select("status").eq("id", e.subscriptionId).single();
      assert((s as { status: string }).status === "active", JSON.stringify(s));
    });
    await check("Z. A quien paga no se le enseña vocabulario nuestro ni del proveedor",
      async () => {
      const { describeBillingState } = await import("../../lib/domain/billing-state");
      const casos = [
        { manualReview: true, status: "past_due" },
        { manualReview: false, status: "past_due" },
        { manualReview: false, status: "lapsed" },
        { manualReview: false, status: "active" },
      ];
      const PROHIBIDAS = [/past_due/i, /provider_unknown/i, /failure_class/i,
                          /integrity/i, /wompi/i, /lapsed/i, /retired/i,
                          /transaction/i, /\bslot\b/i];
      for (const c of casos) {
        const r = describeBillingState({
          status: c.status, hasSubscription: true, graceUntil: null,
          cancelScheduled: false, downgradeScheduled: false,
          manualReview: c.manualReview, paymentMethodMissing: false });
        for (const p of PROHIBIDAS) {
          assert(!p.test(r.title) && !p.test(r.detail),
            `«${c.status}» le enseña ${p} al cliente: ${r.title} / ${r.detail}`);
        }
        // Y el servicio nunca se le da por perdido mientras se resuelve.
        assert(r.serviceContinues, `«${c.status}» dice que el servicio paró`);
      }

      // La duda MANDA: mientras la haya no se afirma que el pago falló.
      const duda = describeBillingState({
        status: "past_due", hasSubscription: true, graceUntil: null,
        cancelScheduled: false, downgradeScheduled: false,
        manualReview: true, paymentMethodMissing: true });
      assert(duda.state === "verifying", `dijo ${duda.state}`);
      assert(/verificando/i.test(duda.title), duda.title);
      for (const p of [/rechaz/i, /no se pudo cobrar/i, /impago/i, /realizado/i]) {
        assert(!p.test(duda.title) && !p.test(duda.detail),
          `afirma algo que no sabe: ${duda.title} / ${duda.detail}`);
      }

      // Y la pantalla usa esa traducción, no el estado crudo.
      const pagina = readFileSync(
        "app/(app)/(shell)/settings/billing/page.tsx", "utf8");
      assert(/describeBillingState/.test(pagina), "la pantalla no traduce el estado");
      assert(!/\{estado\.status\}/.test(pagina),
        "la pantalla sigue enseñando el estado interno");
    });

  } finally {
    for (const org of orgs) await limpiar(org);
    const { data: tasas } = await admin.from("commercial_fx_rates").select("id, note");
    for (const t of ((tasas ?? []) as { id: string; note: string | null }[])
      .filter((x) => (x.note ?? "").includes(`QA PE-05B5E ${sello}`))) {
      await admin.from("commercial_fx_rates").delete().eq("id", t.id);
    }
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.from("user_legal_acceptances").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B5E · fallos: ${passed} en verde, ${failed} en rojo\n`);
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
