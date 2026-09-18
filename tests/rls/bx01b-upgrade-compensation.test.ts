/**
 * Trazaloop · BILLING-EXTRA-01B · Las primitivas de compensación, contra la base.
 *
 * Lo que aquí se comprueba no es una decisión —eso es la saga, y se prueba
 * aparte— sino lo que la BASE garantiza pase lo que pase arriba: que un cobro
 * devuelto no pueda conceder Extra después, que pedir dos veces el mismo
 * reembolso no escriba dos, que una empresa con dinero sin devolver no pueda
 * abrir otra subida, y que nadie suelte un `submitted` con un cobro dentro.
 *
 * Todo con empresas reales creadas aquí y borradas al terminar. Ningún cobro
 * real: los desenlaces se simulan llamando a las mismas primitivas que llamaría
 * el proveedor.
 */
import { config as loadEnv } from "dotenv";
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
const W = "wompi";
const MP = "mercadopago";

type Fila = Record<string, unknown>;

async function persona(prefijo: string, papel?: "superadmin" | "support") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA BX01B" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "bx01b" });
  return { id: data.user!.id, cli, email };
}

/** Una empresa con Full mensual pagado y su periodo saldado. */
async function empresaConFull(nombre: string) {
  const quien = await persona("bx");
  const { data: orgId } = await quien.cli.rpc("create_organization",
    { p_name: `${nombre} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", quien.id);

  const { data: q, error: eq } = await quien.cli.rpc("billing_create_quote", {
    p_organization_id: org, p_plan_code: "full", p_billing_interval: "monthly",
    p_coupon_code: null });
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
  await admin.rpc("billing_attach_intent_payment_method", {
    p_intent_id: intento.intent_id,
    p_payment_method_id: (pm as Fila).payment_method_id as string });
  await admin.rpc("billing_settle_provider_payment", {
    p_provider: W, p_external_reference: intento.intent_id,
    p_provider_payment_id: `bx-ini-${org.slice(0, 8)}`, p_outcome: "approved",
    p_amount: intento.expected_total_amount, p_currency: "COP",
    p_live_mode: false, p_failure_reason: null });

  // La prueba que trae la contratación se cierra: aquí se mide lo contratado.
  const { data: pruebas } = await admin.from("organization_plan_assignments")
    .select("id, starts_at").eq("organization_id", org).eq("grant_kind", "trial");
  for (const f of (pruebas ?? []) as { id: string; starts_at: string }[]) {
    await admin.from("organization_plan_assignments")
      .update({ ends_at: new Date(new Date(f.starts_at).getTime() + 1).toISOString() })
      .eq("id", f.id);
  }

  const { data: sub } = await admin.from("billing_subscriptions")
    .select("id, base_charge_amount, current_period_end, renews_at")
    .eq("organization_id", org).single();
  const s = sub as Fila;
  return { org, quien, subscriptionId: String(s.id),
           base: Number(s.base_charge_amount),
           periodEnd: String(s.current_period_end ?? s.renews_at) };
}

/** Presupuestar la subida y abrir su intento con el proveedor que se diga. */
async function subidaAbierta(
  e: { quien: { cli: SupabaseClient }; subscriptionId: string }, proveedor = MP
) {
  const { data: c, error: ec } = await e.quien.cli.rpc("billing_quote_upgrade", {
    p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
  assert(!ec, `presupuestar: ${ec?.message}`);
  const cuenta = c as Fila;
  assert(cuenta.status === "quoted", `no se presupuestó: ${cuenta.status}`);
  const { data: i, error: ei } = await e.quien.cli.rpc("billing_open_upgrade_intent", {
    p_change_id: cuenta.change_id as string, p_provider: proveedor,
    p_environment: "test" });
  assert(!ei, `abrir: ${ei?.message}`);
  return { cuenta, intento: i as Fila,
           changeId: String(cuenta.change_id),
           total: Number(cuenta.total_amount) };
}

async function cambio(changeId: string): Promise<Fila> {
  const { data } = await admin.from("billing_subscription_changes")
    .select("*").eq("id", changeId).single();
  return data as Fila;
}

async function main() {
  console.log("\nBILLING-EXTRA-01B · compensación contra la base\n");
  await tasaCanonicaQA(admin);

  try {
    console.log("1 · EL CAMINO FELIZ POR MERCADO PAGO");

    await check("1A. Delta aprobado · Extra, el MISMO periodo y una sola vez", async () => {
      const e = await empresaConFull("A feliz");
      const s = await subidaAbierta(e);
      const { data: r } = await admin.rpc("billing_settle_upgrade_payment", {
        p_intent_id: s.intento.intent_id as string, p_provider: MP,
        p_provider_payment_id: `mp-ok-${s.changeId.slice(0, 8)}`,
        p_outcome: "approved", p_amount: s.total, p_currency: "COP",
        p_live_mode: false, p_failure_reason: null });
      assert((r as Fila).outcome === "upgraded", `salió ${(r as Fila).outcome}`);

      const { data: sub } = await admin.from("billing_subscriptions")
        .select("plan_code, current_period_end, renews_at").eq("id", e.subscriptionId).single();
      assert((sub as Fila).plan_code === "extra", "no quedó en Extra");
      const finAhora = String((sub as Fila).current_period_end ?? (sub as Fila).renews_at);
      assert(finAhora === e.periodEnd,
        `el calendario se movió: ${e.periodEnd} → ${finAhora}`);

      // UN pago, UNA liquidación, UNA transición de asignación.
      const { data: pagos } = await admin.from("billing_payments")
        .select("id").eq("subscription_change_id", s.changeId);
      assert((pagos ?? []).length === 1, `${(pagos ?? []).length} pagos`);
      // EL INVARIANTE, dicho bien.
      //
      // Junto a lo comprado sigue viva la concesión `base` de cada módulo: es
      // el suelo Free, y 0169 lo deja a propósito —«el suelo `base` y las
      // pruebas no se tocan»— porque es adonde vuelve la empresa cuando lo
      // pagado termina. Contarlo como un solape sería llamar defecto a la red.
      //
      // Lo que NO puede haber es dos concesiones PAGADAS vivas para el mismo
      // ámbito: eso sí serían dos derechos a la vez, y es justo lo que
      // `commercial_apply_assignment` cierra antes de abrir la nueva.
      const { data: asig } = await admin.from("organization_plan_assignments")
        .select("scope, module_code, plan_revision_id, grant_kind")
        .eq("organization_id", e.org).is("ends_at", null);
      const vivas = (asig ?? []) as Fila[];
      const pagadas = vivas.filter((a) => a.grant_kind === "sold"
                                       || a.grant_kind === "courtesy");
      const ambitos = pagadas.map((a) => `${a.scope}:${a.module_code ?? "-"}`);
      assert(new Set(ambitos).size === ambitos.length,
        `hay ámbitos con dos concesiones pagadas vivas: ${JSON.stringify(pagadas)}`);
      assert(pagadas.length > 0, "la subida no dejó ninguna concesión pagada");
      // Y todas apuntan a la MISMA revisión. Una mezcla querría decir que un
      // módulo se quedó en Full.
      assert(new Set(pagadas.map((a) => a.plan_revision_id)).size === 1,
        "quedaron concesiones pagadas de dos revisiones distintas");
    });

    await check("1B. Conciliar dos veces no concede dos veces", async () => {
      const e = await empresaConFull("B repetida");
      const s = await subidaAbierta(e);
      const pago = `mp-dup-${s.changeId.slice(0, 8)}`;
      const uno = await admin.rpc("billing_settle_upgrade_payment", {
        p_intent_id: s.intento.intent_id as string, p_provider: MP,
        p_provider_payment_id: pago, p_outcome: "approved",
        p_amount: s.total, p_currency: "COP", p_live_mode: false,
        p_failure_reason: null });
      const dos = await admin.rpc("billing_settle_upgrade_payment", {
        p_intent_id: s.intento.intent_id as string, p_provider: MP,
        p_provider_payment_id: pago, p_outcome: "approved",
        p_amount: s.total, p_currency: "COP", p_live_mode: false,
        p_failure_reason: null });
      assert((uno.data as Fila).outcome === "upgraded", "la primera no concedió");
      assert((dos.data as Fila).outcome === "already_settled",
        `la segunda salió ${(dos.data as Fila).outcome}`);
      const { data: pagos } = await admin.from("billing_payments")
        .select("id").eq("provider_payment_id", pago);
      assert((pagos ?? []).length === 1, `${(pagos ?? []).length} pagos para un cobro`);
    });

    console.log("\n2 · CUANDO HAY QUE DEVOLVER");

    await check("2A. Se anota el cobro, se abre la compensación y se devuelve", async () => {
      const e = await empresaConFull("C devolver");
      const s = await subidaAbierta(e);
      const pago = `mp-comp-${s.changeId.slice(0, 8)}`;

      const obs = await admin.rpc("billing_observe_upgrade_delta", {
        p_change_id: s.changeId, p_provider_payment_id: pago });
      assert(!obs.error, `anotar: ${obs.error?.message}`);
      assert((obs.data as Fila).status === "observed",
        `anotar: ${JSON.stringify(obs.data)}`);

      const abierta = await admin.rpc("billing_open_upgrade_compensation", {
        p_change_id: s.changeId, p_reason: "AUTHORIZATION_AMOUNT_NOT_APPLIED" });
      assert(!abierta.error, `abrir: ${abierta.error?.message}`);
      assert((abierta.data as Fila).status === "opened",
        `no se abrió: ${JSON.stringify(abierta.data)}`);
      const llave = String((abierta.data as Fila).refund_idempotency_key);
      assert(llave === `upgrefund:${s.changeId}:${pago}`,
        `la llave no se deriva: ${llave}`);

      const c1 = await cambio(s.changeId);
      assert(c1.status === "compensation_required", `quedó en ${c1.status}`);

      const dev = await admin.rpc("billing_record_upgrade_refund", {
        p_change_id: s.changeId, p_provider_refund_id: `ref-${s.changeId.slice(0, 8)}`,
        p_amount: s.total, p_currency: "COP" });
      assert((dev.data as Fila).status === "refunded", `devolver: ${(dev.data as Fila).status}`);

      const c2 = await cambio(s.changeId);
      assert(c2.status === "refunded", `quedó en ${c2.status}`);
      assert(c2.refund_provider_id !== null, "sin identificador del reembolso");

      // Y en el LIBRO: una fila devuelta, con su identidad.
      const { data: p } = await admin.from("billing_payments")
        .select("status, refunded_amount, provider_refund_id, total_amount")
        .eq("provider_payment_id", pago).single();
      const fila = p as Fila;
      assert(fila.status === "refunded", `el pago quedó ${fila.status}`);
      assert(Number(fila.refunded_amount) === Number(fila.total_amount),
        "no se devolvió el total");
      assert(fila.provider_refund_id !== null, "el libro no guarda el reembolso");

      // Y la empresa NO tiene Extra.
      const { data: sub } = await admin.from("billing_subscriptions")
        .select("plan_code").eq("id", e.subscriptionId).single();
      assert((sub as Fila).plan_code === "full", "se concedió Extra tras devolver");
    });

    await check("2B. Un cobro DEVUELTO no puede conceder Extra después", async () => {
      // Lo garantiza el índice único de 0169 por (proveedor, id de pago): la
      // fila del libro ya existe, así que la liquidación no puede escribir otra.
      const e = await empresaConFull("D devuelto");
      const s = await subidaAbierta(e);
      const pago = `mp-noextra-${s.changeId.slice(0, 8)}`;
      await admin.rpc("billing_observe_upgrade_delta",
        { p_change_id: s.changeId, p_provider_payment_id: pago });
      await admin.rpc("billing_open_upgrade_compensation",
        { p_change_id: s.changeId, p_reason: "RENEWAL_DURING_UPGRADE" });
      await admin.rpc("billing_record_upgrade_refund", {
        p_change_id: s.changeId, p_provider_refund_id: `ref2-${s.changeId.slice(0, 8)}`,
        p_amount: s.total, p_currency: "COP" });

      const { data: r } = await admin.rpc("billing_settle_upgrade_payment", {
        p_intent_id: s.intento.intent_id as string, p_provider: MP,
        p_provider_payment_id: pago, p_outcome: "approved",
        p_amount: s.total, p_currency: "COP", p_live_mode: false,
        p_failure_reason: null });
      assert((r as Fila).outcome === "already_settled",
        `la liquidación de un cobro devuelto salió ${(r as Fila).outcome}`);
      const { data: sub } = await admin.from("billing_subscriptions")
        .select("plan_code").eq("id", e.subscriptionId).single();
      assert((sub as Fila).plan_code === "full", "un cobro devuelto concedió Extra");
    });

    await check("2C. Pedir el reembolso dos veces no escribe dos", async () => {
      const e = await empresaConFull("E reintento");
      const s = await subidaAbierta(e);
      const pago = `mp-ret-${s.changeId.slice(0, 8)}`;
      await admin.rpc("billing_observe_upgrade_delta",
        { p_change_id: s.changeId, p_provider_payment_id: pago });
      await admin.rpc("billing_open_upgrade_compensation",
        { p_change_id: s.changeId, p_reason: "AUTHORIZATION_NOT_ACTIVE" });
      const ref = `ref3-${s.changeId.slice(0, 8)}`;
      const uno = await admin.rpc("billing_record_upgrade_refund", {
        p_change_id: s.changeId, p_provider_refund_id: ref,
        p_amount: s.total, p_currency: "COP" });
      const dos = await admin.rpc("billing_record_upgrade_refund", {
        p_change_id: s.changeId, p_provider_refund_id: ref,
        p_amount: s.total, p_currency: "COP" });
      assert((uno.data as Fila).status === "refunded", "la primera no devolvió");
      assert((dos.data as Fila).status === "already_refunded",
        `la segunda salió ${(dos.data as Fila).status}`);
      const { data: pagos } = await admin.from("billing_payments")
        .select("id").eq("provider_payment_id", pago);
      assert((pagos ?? []).length === 1, `${(pagos ?? []).length} filas en el libro`);
    });

    await check("2D. Un reembolso por otro importe NO cierra la compensación", async () => {
      const e = await empresaConFull("F importe");
      const s = await subidaAbierta(e);
      const pago = `mp-mis-${s.changeId.slice(0, 8)}`;
      await admin.rpc("billing_observe_upgrade_delta",
        { p_change_id: s.changeId, p_provider_payment_id: pago });
      await admin.rpc("billing_open_upgrade_compensation",
        { p_change_id: s.changeId, p_reason: "PAYMENT_RECONCILIATION_MISMATCH" });
      const { data: r } = await admin.rpc("billing_record_upgrade_refund", {
        p_change_id: s.changeId, p_provider_refund_id: `ref4-${s.changeId.slice(0, 8)}`,
        p_amount: s.total - 1, p_currency: "COP" });
      assert((r as Fila).status === "reconciliation_mismatch",
        `salió ${(r as Fila).status}`);
      const c = await cambio(s.changeId);
      assert(c.status === "compensation_required", `quedó en ${c.status}`);
    });

    await check("2E. Un reembolso que falla NO se disfraza de cancelado", async () => {
      const e = await empresaConFull("G fallo");
      const s = await subidaAbierta(e);
      const pago = `mp-fail-${s.changeId.slice(0, 8)}`;
      await admin.rpc("billing_observe_upgrade_delta",
        { p_change_id: s.changeId, p_provider_payment_id: pago });
      await admin.rpc("billing_open_upgrade_compensation",
        { p_change_id: s.changeId, p_reason: "ENVIRONMENT_MISMATCH" });
      await admin.rpc("billing_record_upgrade_refund_failure", {
        p_change_id: s.changeId, p_reason: "provider_unavailable:timeout" });
      const c = await cambio(s.changeId);
      assert(c.status === "compensation_required",
        `un reembolso fallido dejó el cambio en ${c.status}`);
      assert(String(c.refund_failure_reason).includes("timeout"),
        "no se anotó por qué falló");
    });

    await check("2F. Sin cobro observado no se abre ninguna compensación", async () => {
      // Decir que hay algo que devolver cuando no lo hay sería inventarse una
      // deuda nuestra.
      const e = await empresaConFull("H sin cobro");
      const s = await subidaAbierta(e);
      const { data: r } = await admin.rpc("billing_open_upgrade_compensation", {
        p_change_id: s.changeId, p_reason: "SIN_NADA" });
      assert((r as Fila).status === "no_delta_payment", `salió ${(r as Fila).status}`);
    });

    await check("2G. Dos cobros distintos para la misma subida: se para", async () => {
      const e = await empresaConFull("I dos cobros");
      const s = await subidaAbierta(e);
      // Con el identificador del cambio dentro: el índice único de cobros es
      // global, y un literal fijo choca con el de la pasada anterior.
      const uno = `mp-uno-${s.changeId.slice(0, 8)}`;
      await admin.rpc("billing_observe_upgrade_delta",
        { p_change_id: s.changeId, p_provider_payment_id: uno });
      const igual = await admin.rpc("billing_observe_upgrade_delta",
        { p_change_id: s.changeId, p_provider_payment_id: uno });
      assert((igual.data as Fila).status === "already_observed",
        `repetir salió ${(igual.data as Fila).status}`);
      const otro = await admin.rpc("billing_observe_upgrade_delta",
        { p_change_id: s.changeId,
          p_provider_payment_id: `mp-dos-${s.changeId.slice(0, 8)}` });
      assert((otro.data as Fila).status === "delta_payment_conflict",
        `un cobro distinto salió ${(otro.data as Fila).status}`);
    });

    console.log("\n3 · CON DINERO SIN DEVOLVER NO SE ABRE OTRA SUBIDA");

    await check("3A. Una compensación abierta bloquea presupuestar otra vez", async () => {
      const e = await empresaConFull("J bloqueo");
      const s = await subidaAbierta(e);
      await admin.rpc("billing_observe_upgrade_delta",
        { p_change_id: s.changeId, p_provider_payment_id: `mp-blo-${s.changeId.slice(0, 8)}` });
      await admin.rpc("billing_open_upgrade_compensation",
        { p_change_id: s.changeId, p_reason: "RENEWAL_DURING_UPGRADE" });
      const { data: otra } = await e.quien.cli.rpc("billing_quote_upgrade", {
        p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
      assert((otra as Fila).status === "upgrade_already_pending",
        `se pudo presupuestar otra: ${(otra as Fila).status}`);
    });

    await check("3B. Y una devuelta ya NO bloquea: se puede volver a intentar", async () => {
      const e = await empresaConFull("K desbloqueo");
      const s = await subidaAbierta(e);
      const pago = `mp-des-${s.changeId.slice(0, 8)}`;
      await admin.rpc("billing_observe_upgrade_delta",
        { p_change_id: s.changeId, p_provider_payment_id: pago });
      await admin.rpc("billing_open_upgrade_compensation",
        { p_change_id: s.changeId, p_reason: "RENEWAL_DURING_UPGRADE" });
      await admin.rpc("billing_record_upgrade_refund", {
        p_change_id: s.changeId, p_provider_refund_id: `ref5-${s.changeId.slice(0, 8)}`,
        p_amount: s.total, p_currency: "COP" });
      const { data: otra } = await e.quien.cli.rpc("billing_quote_upgrade", {
        p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
      assert((otra as Fila).status === "quoted",
        `no se pudo volver a presupuestar: ${(otra as Fila).status}`);
      // Y se retira, que además comprueba que lo recién presupuestado SÍ se
      // puede retirar —sólo `pending`— y no deja nada abierto detrás.
      const { data: ret } = await e.quien.cli.rpc("billing_cancel_upgrade",
        { p_change_id: (otra as Fila).change_id as string });
      assert((ret as Fila).status === "cancelled",
        `retirar la nueva: ${(ret as Fila).status}`);
    });

    await check("3C. Y el barrido sabe que hay una subida en el aire", async () => {
      const e = await empresaConFull("L en vuelo");
      const s = await subidaAbierta(e);
      const enVuelo = await admin.rpc("billing_upgrade_in_flight",
        { p_subscription_id: e.subscriptionId });
      assert(enVuelo.data === true, "con una subida abierta dijo que no la hay");
      await admin.rpc("billing_settle_upgrade_payment", {
        p_intent_id: s.intento.intent_id as string, p_provider: MP,
        p_provider_payment_id: `mp-vuelo-${s.changeId.slice(0, 8)}`,
        p_outcome: "approved", p_amount: s.total, p_currency: "COP",
        p_live_mode: false, p_failure_reason: null });
      const despues = await admin.rpc("billing_upgrade_in_flight",
        { p_subscription_id: e.subscriptionId });
      assert(despues.data === false, "con la subida cerrada dijo que sigue en vuelo");
    });

    console.log("\n4 · DESATASCAR UN `submitted` HUÉRFANO");

    await check("4A. Sin cobro · se suelta y la empresa puede volver a intentarlo", async () => {
      const e = await empresaConFull("M huerfano");
      const s = await subidaAbierta(e);
      const staff = await persona("bx-sa", "superadmin");
      const { data: r, error } = await staff.cli.rpc("billing_resolve_stuck_upgrade", {
        p_change_id: s.changeId, p_evidence: "no_payment",
        p_provider_payment_id: null, p_reason: "El proveedor no conoce el cobro." });
      assert(!error, `resolver: ${error?.message}`);
      assert((r as Fila).status === "released", `salió ${(r as Fila).status}`);
      const c = await cambio(s.changeId);
      assert(c.status === "cancelled", `quedó en ${c.status}`);
      assert(c.resolved_by !== null && c.resolution_evidence === "no_payment",
        "no quedó constancia de quién ni con qué prueba");
      const { data: otra } = await e.quien.cli.rpc("billing_quote_upgrade", {
        p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
      assert((otra as Fila).status === "quoted", "sigue bloqueada tras soltarla");
    });

    await check("4B. Con cobro aprobado · NO se suelta, se compensa", async () => {
      const e = await empresaConFull("N con cobro");
      const s = await subidaAbierta(e);
      const staff = await persona("bx-sa2", "superadmin");
      const pago = `mp-huerf-${s.changeId.slice(0, 8)}`;
      const { data: r } = await staff.cli.rpc("billing_resolve_stuck_upgrade", {
        p_change_id: s.changeId, p_evidence: "payment_approved",
        p_provider_payment_id: pago, p_reason: "Hay un cobro aprobado." });
      assert((r as Fila).status === "compensation_required", `salió ${(r as Fila).status}`);
      const c = await cambio(s.changeId);
      assert(c.status === "compensation_required", `quedó en ${c.status}`);
      assert(c.delta_provider_payment_id === pago, "no se anotó qué cobro hay que devolver");
      assert(c.refund_idempotency_key !== null, "sin llave no se puede reintentar");
    });

    await check("4C. Sin saber · se deja abierta, que es lo honesto", async () => {
      const e = await empresaConFull("O sin saber");
      const s = await subidaAbierta(e);
      const staff = await persona("bx-sa3", "superadmin");
      const { data: r } = await staff.cli.rpc("billing_resolve_stuck_upgrade", {
        p_change_id: s.changeId, p_evidence: "provider_unknown",
        p_provider_payment_id: null, p_reason: "No se pudo consultar." });
      assert((r as Fila).status === "still_uncertain", `salió ${(r as Fila).status}`);
      const c = await cambio(s.changeId);
      assert(c.status === "submitted",
        `que no se sepa soltó el cambio a ${c.status}`);
    });

    await check("4D. Y NO lo puede hacer quien administra su propia empresa", async () => {
      const e = await empresaConFull("P permisos");
      const s = await subidaAbierta(e);
      const { error } = await e.quien.cli.rpc("billing_resolve_stuck_upgrade", {
        p_change_id: s.changeId, p_evidence: "no_payment",
        p_provider_payment_id: null, p_reason: "yo mismo" });
      assert(error !== null, "una administradora de empresa desatascó una subida");
      const c = await cambio(s.changeId);
      assert(c.status === "submitted", `el cambio quedó en ${c.status}`);
    });

    await check("4E. Ni el personal de plataforma que no es superadministrador", async () => {
      const e = await empresaConFull("Q soporte");
      const s = await subidaAbierta(e);
      const soporte = await persona("bx-sup", "support");
      const { error } = await soporte.cli.rpc("billing_resolve_stuck_upgrade", {
        p_change_id: s.changeId, p_evidence: "no_payment",
        p_provider_payment_id: null, p_reason: "soporte" });
      assert(error !== null, "soporte desatascó una subida");
    });

    await check("4F. Repetir el desatasco converge, no rompe", async () => {
      const e = await empresaConFull("R repetir");
      const s = await subidaAbierta(e);
      const staff = await persona("bx-sa4", "superadmin");
      const uno = await staff.cli.rpc("billing_resolve_stuck_upgrade", {
        p_change_id: s.changeId, p_evidence: "payment_failed",
        p_provider_payment_id: null, p_reason: "rechazado" });
      const dos = await staff.cli.rpc("billing_resolve_stuck_upgrade", {
        p_change_id: s.changeId, p_evidence: "payment_failed",
        p_provider_payment_id: null, p_reason: "rechazado" });
      assert((uno.data as Fila).status === "released", `la primera salió ${(uno.data as Fila).status}`);
      assert((dos.data as Fila).status === "already_resolved",
        `la segunda salió ${(dos.data as Fila).status}`);
    });

    console.log("\n5 · LO QUE NO CAMBIA");

    await check("5A. Wompi sigue concediendo Extra igual", async () => {
      const e = await empresaConFull("S wompi");
      const s = await subidaAbierta(e, W);
      const { data: r } = await admin.rpc("billing_settle_upgrade_payment", {
        p_intent_id: s.intento.intent_id as string, p_provider: W,
        p_provider_payment_id: `w-up-${s.changeId.slice(0, 8)}`,
        p_outcome: "approved", p_amount: s.total, p_currency: "COP",
        p_live_mode: false, p_failure_reason: null });
      assert((r as Fila).outcome === "upgraded", `salió ${(r as Fila).outcome}`);
      const { data: sub } = await admin.from("billing_subscriptions")
        .select("plan_code, current_period_end, renews_at").eq("id", e.subscriptionId).single();
      assert((sub as Fila).plan_code === "extra", "Wompi dejó de conceder Extra");
      const fin = String((sub as Fila).current_period_end ?? (sub as Fila).renews_at);
      assert(fin === e.periodEnd, "Wompi movió el calendario");
    });

    await check("5B. Con la cancelación programada NO se puede subir", async () => {
      const e = await empresaConFull("T cancelada");
      await e.quien.cli.rpc("billing_request_cancellation",
        { p_subscription_id: e.subscriptionId, p_cancel: true });
      const { data: r } = await e.quien.cli.rpc("billing_quote_upgrade", {
        p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
      assert((r as Fila).status === "cancellation_scheduled",
        `salió ${(r as Fila).status}`);
    });

    await check("5C. Free, Ended y la prueba no pasan por la subida", async () => {
      // No tienen una suscripción activa con un periodo saldado, que es lo que
      // `billing_quote_upgrade` exige. Comprar Extra desde ahí es una COMPRA.
      const quien = await persona("bx-free");
      const { data: orgId } = await quien.cli.rpc("create_organization",
        { p_name: `U free ${sello}`, p_tax_id: null, p_country: "CO" });
      const org = orgId as string;
      orgs.push(org);
      await admin.from("memberships").update({ role_code: "admin" })
        .eq("organization_id", org).eq("user_id", quien.id);
      const { data: subs } = await admin.from("billing_subscriptions")
        .select("id").eq("organization_id", org);
      assert((subs ?? []).length === 0, "una empresa sin contratar ya tiene suscripción");
      // Y el checkout normal SÍ acepta Extra.
      const { data: q, error } = await quien.cli.rpc("billing_create_quote", {
        p_organization_id: org, p_plan_code: "extra",
        p_billing_interval: "monthly", p_coupon_code: null });
      assert(!error && (q as Fila).quote_id, `comprar Extra directo: ${error?.message}`);
    });

  } finally {
    for (const org of orgs) {
      // EL ORDEN IMPORTA. Los cambios los apuntan los pagos y los intentos, así
      // que borrarlos primero falla en silencio por clave ajena y deja
      // cuarenta filas vivas que hacen chocar al índice único de la siguiente
      // pasada. Se borra lo que apunta antes que lo apuntado.
      // `billing_subscription_changes.payment_id` apunta a los pagos y
      // `billing_payments.subscription_change_id` apunta a los cambios: el
      // ciclo se rompe soltando primero el puntero.
      await admin.from("billing_subscription_changes")
        .update({ payment_id: null }).eq("organization_id", org);
      await admin.from("billing_checkout_intents").delete().eq("organization_id", org);
      await admin.from("billing_payments").delete().eq("organization_id", org);
      await admin.from("billing_subscription_changes").delete().eq("organization_id", org);
      await admin.from("billing_subscription_periods").delete().eq("organization_id", org);
      await admin.from("billing_quotes").delete().eq("organization_id", org);
      await admin.from("billing_payment_methods").delete().eq("organization_id", org);
      await admin.from("billing_recurring_authorizations").delete().eq("organization_id", org);
      await admin.from("billing_subscriptions").delete().eq("organization_id", org);
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      await admin.from("memberships").delete().eq("organization_id", org);
      await admin.from("organizations").delete().eq("id", org);
    }
    await limpiarPersonas(admin, personas);
  }

  console.log(`\nBILLING-EXTRA-01B · base: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
