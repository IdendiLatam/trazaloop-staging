/**
 * Trazaloop · PE-05B2 · La conciliación y el derecho, contra la base real.
 *
 * El adaptador se puede comprobar sin red; esto no. Lo que solo se sabe
 * ejecutando:
 *
 *   · que un pago con el importe equivocado, PERFECTAMENTE firmado, no active
 *     nada —la firma demuestra el origen, no que el importe sea correcto—;
 *   · que un recurso válido de otra empresa no active esta;
 *   · que el mismo pago entregado veinte veces active una sola vez;
 *   · que una renovación NO cree una segunda suscripción ni una segunda
 *     asignación vendida;
 *   · que un aviso de producción sobre credenciales de prueba no haga nada;
 *   · y que nadie de fuera de la plataforma vea un evento crudo.
 *
 * Correr: npm run test:pe05b2-webhooks
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
const MP = "mercadopago";

async function persona(prefijo: string, papel?: "superadmin") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B2" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b2" });
  if (papel) {
    await admin.from("platform_staff").insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  return { id: data.user!.id, email, cli };
}

type Intento = {
  intent_id: string; organization_id: string; external_reference: string;
  expected_total_amount: number; expected_currency: string;
  billing_interval: string; plan_code: string;
  billing_email: string | null; billing_email_missing: boolean;
};

async function main() {
  const sa = await persona("b2-sa", "superadmin");
  const ana = await persona("b2-ana");
  const ajeno = await persona("b2-ajeno");

  const { data: orgId, error: eo } = await ana.cli.rpc("create_organization", { p_name: `QA B2 ${sello}` });
  assert(!eo, `crear empresa: ${eo?.message}`);
  const org = orgId as string;
  const { data: orgB } = await ajeno.cli.rpc("create_organization", { p_name: `QA B2B ${sello}` });
  const otra = orgB as string;

  // Hace falta un tipo de cambio para poder presupuestar: B1 no sembró ninguno
  // a propósito. Se pone uno sintético SOLO EN LOCAL y se retira al terminar.
  //
  // Y hay que decirlo claro: el esquema NO sabe distinguir una tasa de QA de
  // una comercial. Solo tiene `note`, que es texto libre, y `billing_resolve_fx`
  // no lo mira: cualquier tasa `active` vigente se convierte en precio. Por eso
  // esta siembra NO se repite en Staging. Ver PE_05B2_SANDBOX_TESTS.md.
  const { error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA PE-05B2 ${sello} · tasa sintetica, NO comercial`,
  });
  assert(!efx, `sembrar tipo de cambio de QA: ${efx?.message}`);

  const habilitar = async (o: string) => {
    const { error } = await admin.rpc("commercial_provision_new_module", {
      p_organization_id: o, p_module_code: "quality" });
    assert(!error, `provisión: ${error?.message}`);
  };
  await habilitar(org); await habilitar(otra);

  const hacerAdmin = async (o: string, uid: string) => {
    await admin.from("memberships").update({ role_code: "admin" })
      .eq("organization_id", o).eq("user_id", uid);
  };
  await hacerAdmin(org, ana.id); await hacerAdmin(otra, ajeno.id);

  const presupuesto = async (cli: SupabaseClient, o: string, plan = "full", intervalo = "monthly") => {
    const { data, error } = await cli.rpc("billing_create_quote", {
      p_organization_id: o, p_plan_code: plan, p_billing_interval: intervalo });
    assert(!error, `presupuesto: ${error?.message}`);
    return data as { quote_id: string; total_amount: number; charge_currency: string };
  };
  const abrir = async (cli: SupabaseClient, quoteId: string, entorno = "test"): Promise<Intento> => {
    const { data, error } = await cli.rpc("billing_open_checkout_intent", {
      p_quote_id: quoteId, p_provider: MP, p_environment: entorno });
    assert(!error, `abrir intento: ${error?.message}`);
    return data as unknown as Intento;
  };
  const liquidar = async (o: {
    ref: string | null; pago: string; salida?: string;
    importe: number | null; moneda?: string | null; live?: boolean | null;
  }) => {
    const { data, error } = await admin.rpc("billing_settle_provider_payment", {
      p_provider: MP, p_external_reference: o.ref, p_provider_payment_id: o.pago,
      p_outcome: o.salida ?? "approved", p_amount: o.importe,
      p_currency: o.moneda === undefined ? "COP" : o.moneda,
      p_live_mode: o.live === undefined ? false : o.live, p_failure_reason: null });
    assert(!error, `liquidar: ${error?.message}`);
    return data as Record<string, unknown>;
  };
  const asignaciones = async (o: string) => {
    const { data } = await admin.from("organization_plan_assignments")
      .select("id, grant_kind, scope, module_code, ends_at").eq("organization_id", o);
    return (data ?? []) as Record<string, unknown>[];
  };
  const suscripciones = async (o: string) => {
    const { data } = await admin.from("billing_subscriptions")
      .select("id, status, plan_code, base_charge_amount").eq("organization_id", o);
    return (data ?? []) as Record<string, unknown>[];
  };
  const pagos = async (o: string) => {
    const { data } = await admin.from("billing_payments")
      .select("id, status, total_amount, provider_payment_id, subscription_id")
      .eq("organization_id", o).order("created_at");
    return (data ?? []) as Record<string, unknown>[];
  };

  console.log("\nPE-05B2 · La pasarela contra la base real\n");

  let intento: Intento | null = null;

  try {
    // =====================================================================
    console.log("A · El intento · lo opaco y lo esperado");
    // =====================================================================

    await check("F/G. Abrir un intento congela lo esperado, y su id es la referencia", async () => {
      const q = await presupuesto(ana.cli, org);
      intento = await abrir(ana.cli, q.quote_id);
      assert(intento.external_reference === intento.intent_id,
        "la referencia externa no es el identificador del intento");
      assert(/^[0-9a-f-]{36}$/.test(intento.external_reference),
        `la referencia no es opaca: ${intento.external_reference}`);
      assert(intento.expected_total_amount === q.total_amount,
        `esperado ${intento.expected_total_amount} vs presupuesto ${q.total_amount}`);
      assert(intento.expected_currency === "COP", intento.expected_currency);
      assert(intento.expected_total_amount > 0, "importe vacío");
    });

    await check("Un presupuesto tiene UN intento vivo · reintentar no crea otro", async () => {
      const { data: q } = await ana.cli.rpc("billing_create_quote", {
        p_organization_id: org, p_plan_code: "full", p_billing_interval: "monthly" });
      const quoteId = (q as { quote_id: string }).quote_id;
      const a = await abrir(ana.cli, quoteId);
      const b = await abrir(ana.cli, quoteId);
      assert(a.intent_id === b.intent_id,
        "cada pulsación abriría un objeto recurrente nuevo en el proveedor");
    });

    await check("AS. El correo de facturación sale del contacto de la empresa", async () => {
      // Y si no lo hay, se DICE que falta en vez de usar el de un empleado.
      assert(intento!.billing_email_missing === true,
        "la empresa no tenía contacto y aun así salió un correo");
      const { error } = await admin.from("organizations")
        .update({ contact_email: `facturacion-${sello}@test.trazaloop.dev` }).eq("id", org);
      assert(!error, `poner contacto: ${error?.message}`);
      const { data: q } = await ana.cli.rpc("billing_create_quote", {
        p_organization_id: org, p_plan_code: "full", p_billing_interval: "monthly" });
      const nuevo = await abrir(ana.cli, (q as { quote_id: string }).quote_id);
      assert(nuevo.billing_email === `facturacion-${sello}@test.trazaloop.dev`,
        `salió «${nuevo.billing_email}»`);
      assert(nuevo.billing_email_missing === false, "dijo que faltaba habiéndolo");
    });

    await check("Contratar es del ADMINISTRADOR · un ajeno no abre nada", async () => {
      const q = await presupuesto(ana.cli, org);
      const { error } = await ajeno.cli.rpc("billing_open_checkout_intent", {
        p_quote_id: q.quote_id, p_provider: MP, p_environment: "test" });
      assert(error, "alguien de otra empresa abrió un intento sobre este presupuesto");
      assert((error!.message ?? "").includes("NOT_AUTHORIZED"), error!.message);
    });

    // =====================================================================
    console.log("\nB · La conciliación · una firma no hace correcto un importe");
    // =====================================================================

    await check("T/U. Con el importe exacto se activa · una sola vez", async () => {
      const q = await presupuesto(ana.cli, org);
      const i = await abrir(ana.cli, q.quote_id);
      const r = await liquidar({ ref: i.external_reference, pago: `mp-ok-${sello}`,
                                 importe: i.expected_total_amount });
      assert(r.outcome === "activated", `salió ${JSON.stringify(r)}`);
      const subs = await suscripciones(org);
      assert(subs.length === 1, `hay ${subs.length} suscripciones`);
      assert(subs[0].status === "active", `estado ${subs[0].status}`);
      // Y el derecho llegó a los módulos funcionales habilitados.
      const vendidas = (await asignaciones(org)).filter((a) => a.grant_kind === "sold");
      assert(vendidas.length >= 1, "no se concedió el plan a ningún módulo");
      assert(Number(r.modules_granted) >= 1, `módulos ${r.modules_granted}`);
    });

    await check("P. La MISMA notificación veinte veces sigue activando una sola vez", async () => {
      const antesP = (await pagos(org)).length;
      const antesS = (await suscripciones(org)).length;
      const antesA = (await asignaciones(org)).filter((a) => a.grant_kind === "sold").length;
      for (let n = 0; n < 20; n += 1) {
        const r = await liquidar({ ref: null, pago: `mp-ok-${sello}`, importe: 1 });
        assert(r.outcome === "already_settled", `la ${n + 1}ª dijo ${r.outcome}`);
      }
      assert((await pagos(org)).length === antesP, "se duplicó un cobro");
      assert((await suscripciones(org)).length === antesS, "se duplicó una suscripción");
      assert((await asignaciones(org)).filter((a) => a.grant_kind === "sold").length === antesA,
        "se duplicó la asignación vendida");
    });

    await check("Y el importe equivocado NO activa nada, por firmado que venga", async () => {
      const q = await presupuesto(ana.cli, org);
      const i = await abrir(ana.cli, q.quote_id);
      const r = await liquidar({ ref: i.external_reference, pago: `mp-poco-${sello}`,
                                 importe: i.expected_total_amount - 1 });
      assert(r.outcome === "reconciliation_mismatch", `salió ${JSON.stringify(r)}`);
      assert(r.reason === "amount", `la razón fue ${r.reason}`);
      // Ni pago, ni suscripción nueva.
      const p = (await pagos(org)).find((x) => x.provider_payment_id === `mp-poco-${sello}`);
      assert(!p, "se registró un cobro con importe equivocado");
      const { data: fila } = await admin.from("billing_checkout_intents")
        .select("status, failure_reason").eq("id", i.intent_id).single();
      assert((fila as { status: string }).status === "manual_review",
        `el intento quedó en ${(fila as { status: string }).status}`);
    });

    await check("Ni el importe de MÁS · pagar de más tampoco compra", async () => {
      const q = await presupuesto(ana.cli, org);
      const i = await abrir(ana.cli, q.quote_id);
      const r = await liquidar({ ref: i.external_reference, pago: `mp-mucho-${sello}`,
                                 importe: i.expected_total_amount + 1000 });
      assert(r.outcome === "reconciliation_mismatch", `salió ${JSON.stringify(r)}`);
    });

    await check("Ni en otra moneda", async () => {
      const q = await presupuesto(ana.cli, org);
      const i = await abrir(ana.cli, q.quote_id);
      const r = await liquidar({ ref: i.external_reference, pago: `mp-usd-${sello}`,
                                 importe: i.expected_total_amount, moneda: "USD" });
      assert(r.outcome === "reconciliation_mismatch" && r.reason === "currency",
        `salió ${JSON.stringify(r)}`);
    });

    // =====================================================================
    console.log("\nC · Referencias · de otra empresa, inventadas o ausentes");
    // =====================================================================

    await check("Y. Un recurso válido de OTRA empresa no activa esta", async () => {
      const qA = await presupuesto(ana.cli, org);
      const iA = await abrir(ana.cli, qA.quote_id);
      const qB = await presupuesto(ajeno.cli, otra);
      const iB = await abrir(ajeno.cli, qB.quote_id);
      const antes = (await suscripciones(org)).length;
      // Se liquida con la referencia de B y el importe de B: activa B, no A.
      const r = await liquidar({ ref: iB.external_reference, pago: `mp-cross-${sello}`,
                                 importe: iB.expected_total_amount });
      assert(r.outcome === "activated", `salió ${JSON.stringify(r)}`);
      assert(r.organization_id === otra, `activó a ${r.organization_id}`);
      assert((await suscripciones(org)).length === antes,
        "el pago de otra empresa creó una suscripción aquí");
      assert(iA.intent_id !== iB.intent_id, "los intentos se confundieron");
    });

    await check("Una referencia inventada o ausente no activa nada", async () => {
      const inventada = await liquidar({
        ref: "00000000-0000-0000-0000-000000000000", pago: `mp-fake-${sello}`, importe: 1000 });
      assert(inventada.outcome === "reference_unknown", JSON.stringify(inventada));
      const basura = await liquidar({ ref: "no-es-un-uuid", pago: `mp-junk-${sello}`, importe: 1000 });
      assert(basura.outcome === "reference_unknown", JSON.stringify(basura));
      const ausente = await liquidar({ ref: null, pago: `mp-null-${sello}`, importe: 1000 });
      assert(ausente.outcome === "reference_missing", JSON.stringify(ausente));
    });

    // =====================================================================
    console.log("\nD · Entorno · el guardia que impide cobrar de verdad en pruebas");
    // =====================================================================

    await check("Z. Un evento EN VIVO sobre un intento de pruebas no activa nada", async () => {
      const q = await presupuesto(ana.cli, org);
      const i = await abrir(ana.cli, q.quote_id, "test");
      const r = await liquidar({ ref: i.external_reference, pago: `mp-live-${sello}`,
                                 importe: i.expected_total_amount, live: true });
      assert(r.outcome === "environment_mismatch", `salió ${JSON.stringify(r)}`);
      const p = (await pagos(org)).find((x) => x.provider_payment_id === `mp-live-${sello}`);
      assert(!p, "se registró un cobro del entorno equivocado");
    });

    await check("Y sin dato de entorno tampoco · falla cerrado", async () => {
      const q = await presupuesto(ana.cli, org);
      const i = await abrir(ana.cli, q.quote_id, "test");
      const r = await liquidar({ ref: i.external_reference, pago: `mp-nolive-${sello}`,
                                 importe: i.expected_total_amount, live: null });
      assert(r.outcome === "environment_mismatch", `salió ${JSON.stringify(r)}`);
    });

    // =====================================================================
    console.log("\nE · Rechazo · historia sí, derecho no");
    // =====================================================================

    await check("V. Un pago rechazado deja historia y NO concede el plan", async () => {
      const { data: qb } = await ajeno.cli.rpc("billing_create_quote", {
        p_organization_id: otra, p_plan_code: "extra", p_billing_interval: "monthly" });
      const quoteId = (qb as { quote_id: string }).quote_id;
      const i = await abrir(ajeno.cli, quoteId);
      const antesExtra = (await suscripciones(otra)).filter((s) => s.plan_code === "extra").length;
      const r = await liquidar({ ref: i.external_reference, pago: `mp-nok-${sello}`,
                                 salida: "declined", importe: i.expected_total_amount });
      assert(r.outcome === "declined", `salió ${JSON.stringify(r)}`);
      const p = (await pagos(otra)).find((x) => x.provider_payment_id === `mp-nok-${sello}`);
      assert(p && p.status === "declined", `el cobro rechazado no quedó anotado: ${JSON.stringify(p)}`);
      assert(p!.subscription_id === null, "un rechazo creó una suscripción");
      assert((await suscripciones(otra)).filter((s) => s.plan_code === "extra").length === antesExtra,
        "un rechazo concedió Extra");
      // Y el presupuesto sigue abierto: se puede reintentar con otra tarjeta.
      const { data: q2 } = await admin.from("billing_quotes")
        .select("status").eq("id", quoteId).single();
      assert((q2 as { status: string }).status === "open",
        `el presupuesto quedó en ${(q2 as { status: string }).status}`);
    });

    // =====================================================================
    console.log("\nF · Renovación · una segunda vez no es una segunda compra");
    // =====================================================================

    await check("W. Una renovación aprobada NO duplica suscripción ni derecho", async () => {
      // Se ata el intento liquidado a un objeto recurrente del proveedor.
      const { data: vivo } = await admin.from("billing_checkout_intents")
        .select("id, billing_subscription_id").eq("organization_id", org)
        .eq("status", "settled").limit(1).single();
      const intentoVivo = vivo as { id: string; billing_subscription_id: string };
      assert(intentoVivo?.billing_subscription_id, "no hay intento liquidado con suscripción");
      const { error: eAt } = await admin.rpc("billing_attach_provider_subscription", {
        p_intent_id: intentoVivo.id, p_provider_subscription_id: `pre-${sello}`,
        p_init_point: "https://www.mercadopago.com/init/x", p_provider_status: "authorized",
        p_status: null, p_synced_amount: null, p_provider_version: 1, p_next_payment_date: null });
      assert(!eAt, `atar: ${eAt?.message}`);

      const antesS = (await suscripciones(org)).length;
      const antesA = (await asignaciones(org)).filter((a) => a.grant_kind === "sold").length;
      const { data: sub } = await admin.from("billing_subscriptions")
        .select("base_charge_amount, charge_currency").eq("id", intentoVivo.billing_subscription_id).single();
      const base = (sub as { base_charge_amount: number }).base_charge_amount;
      // El total del cobro nuevo lo calcula B1 con la regla vigente.
      const { data: regla } = await admin.rpc("billing_resolve_tax_rule", {
        p_service_class: "self_service_saas", p_at: new Date().toISOString(), p_jurisdiction: "CO" });
      const bps = (regla as { rate_basis_points: number }).rate_basis_points;
      const { data: imp } = await admin.rpc("billing_tax_amount",
        { p_base: base, p_rate_basis_points: bps });
      const total = base + Number(imp);

      const { data: r, error } = await admin.rpc("billing_record_renewal_payment", {
        p_provider: MP, p_provider_subscription_id: `pre-${sello}`,
        p_provider_payment_id: `mp-renew-${sello}`, p_outcome: "approved",
        p_amount: total, p_currency: "COP", p_live_mode: false });
      assert(!error, `renovar: ${error?.message}`);
      assert((r as Record<string, unknown>).outcome === "renewed", JSON.stringify(r));

      assert((await suscripciones(org)).length === antesS, "la renovación creó otra suscripción");
      assert((await asignaciones(org)).filter((a) => a.grant_kind === "sold").length === antesA,
        "la renovación concedió el plan otra vez");
      const p = (await pagos(org)).find((x) => x.provider_payment_id === `mp-renew-${sello}`);
      assert(p && p.status === "approved" && Number(p.total_amount) === total,
        `el cobro de renovación: ${JSON.stringify(p)}`);
      assert(p!.subscription_id === intentoVivo.billing_subscription_id,
        "el cobro no quedó atado a la suscripción viva");
    });

    await check("Y repetirla tampoco cobra dos veces", async () => {
      const antes = (await pagos(org)).length;
      const { data: r } = await admin.rpc("billing_record_renewal_payment", {
        p_provider: MP, p_provider_subscription_id: `pre-${sello}`,
        p_provider_payment_id: `mp-renew-${sello}`, p_outcome: "approved",
        p_amount: 1, p_currency: "COP", p_live_mode: false });
      assert((r as Record<string, unknown>).outcome === "already_settled", JSON.stringify(r));
      assert((await pagos(org)).length === antes, "se duplicó el cobro de renovación");
    });

    await check("Una renovación con importe equivocado no se anota como cobrada", async () => {
      const { data: r } = await admin.rpc("billing_record_renewal_payment", {
        p_provider: MP, p_provider_subscription_id: `pre-${sello}`,
        p_provider_payment_id: `mp-renew-mal-${sello}`, p_outcome: "approved",
        p_amount: 1, p_currency: "COP", p_live_mode: false });
      assert((r as Record<string, unknown>).outcome === "reconciliation_mismatch",
        JSON.stringify(r));
      const p = (await pagos(org)).find((x) => x.provider_payment_id === `mp-renew-mal-${sello}`);
      assert(!p, "se anotó un cobro de renovación con importe equivocado");
    });

    // =====================================================================
    console.log("\nG · Estados del proveedor · anotar sin degradar");
    // =====================================================================

    await check("U. Un estado desconocido va a revisión y no toca el derecho", async () => {
      const antes = (await asignaciones(org)).filter((a) => a.grant_kind === "sold").length;
      const { data: r } = await admin.rpc("billing_mark_provider_subscription_state", {
        p_provider: MP, p_provider_subscription_id: `pre-${sello}`,
        p_provider_status: "un_estado_que_no_existe", p_canonical_status: null,
        p_provider_version: 5 });
      assert((r as Record<string, unknown>).outcome === "recorded", JSON.stringify(r));
      assert((r as Record<string, unknown>).canonical === "manual_review", JSON.stringify(r));
      assert((await asignaciones(org)).filter((a) => a.grant_kind === "sold").length === antes,
        "un estado desconocido quitó el derecho");
      const { data: s } = await admin.from("billing_subscriptions")
        .select("status").eq("organization_id", org).eq("status", "active");
      assert((s ?? []).length === 1, "la suscripción canónica cambió de estado");
    });

    await check("Q. Una versión vieja del proveedor no pisa a una nueva", async () => {
      const { data: r } = await admin.rpc("billing_mark_provider_subscription_state", {
        p_provider: MP, p_provider_subscription_id: `pre-${sello}`,
        p_provider_status: "authorized", p_canonical_status: "pending", p_provider_version: 2 });
      assert((r as Record<string, unknown>).outcome === "stale_provider_version",
        `una noticia vieja se aplicó: ${JSON.stringify(r)}`);
      const { data: fila } = await admin.from("billing_checkout_intents")
        .select("provider_status, provider_version").eq("provider_subscription_id", `pre-${sello}`).single();
      const f = fila as { provider_status: string; provider_version: number };
      assert(f.provider_version === 5 && f.provider_status === "un_estado_que_no_existe",
        `quedó ${JSON.stringify(f)}`);
    });

    // =====================================================================
    console.log("\nH · El libro de notificaciones · privado y con contador");
    // =====================================================================

    await check("P. Reentregar una notificación incrementa el contador, no la tabla", async () => {
      const anotar = async (firmada: boolean) => {
        const { data, error } = await admin.rpc("billing_record_provider_event", {
          p_provider: MP, p_topic: "payment", p_resource_id: `res-${sello}`,
          p_signature_verified: firmada, p_signature_failure_reason: firmada ? null : "SignatureMismatch",
          p_live_mode: false, p_environment: "test", p_provider_request_id: `req-${sello}`,
          p_payload: { type: "payment", data_id: `res-${sello}` } });
        assert(!error, `anotar: ${error?.message}`);
        return data as Record<string, unknown>;
      };
      const a = await anotar(true);
      assert(a.is_first === true && a.attempt_count === 1, JSON.stringify(a));
      for (let n = 2; n <= 5; n += 1) {
        const r = await anotar(true);
        assert(r.attempt_count === n && r.is_first === false, `la ${n}ª: ${JSON.stringify(r)}`);
        assert(r.event_id === a.event_id, "se creó otra fila");
      }
      const { count } = await admin.from("billing_provider_events")
        .select("id", { count: "exact", head: true }).eq("resource_id", `res-${sello}`);
      assert(count === 1, `hay ${count} filas para el mismo recurso`);
    });

    await check("Lo NO firmado se anota sin cuerpo y en estado rechazado", async () => {
      const { data, error } = await admin.rpc("billing_record_provider_event", {
        p_provider: MP, p_topic: "payment", p_resource_id: `res-sinfirma-${sello}`,
        p_signature_verified: false, p_signature_failure_reason: "SignatureMismatch",
        p_live_mode: false, p_environment: "test", p_provider_request_id: null,
        p_payload: { type: "payment", secreto: "no-debería-guardarse" } });
      assert(!error, `anotar: ${error?.message}`);
      const { data: fila } = await admin.from("billing_provider_events")
        .select("processing_status, payload, signature_verified")
        .eq("id", (data as Record<string, string>).event_id).single();
      const f = fila as { processing_status: string; payload: unknown; signature_verified: boolean };
      assert(f.signature_verified === false, "quedó marcada como verificada");
      assert(f.processing_status === "rejected", `estado ${f.processing_status}`);
      assert(f.payload === null, `guardó el cuerpo: ${JSON.stringify(f.payload)}`);
    });

    await check("AA. Nadie de fuera de la plataforma ve un evento crudo", async () => {
      // Ni el dueño de la empresa: es dato financiero INTERNO. Se comprueba
      // por EFECTO —cuántas filas ve—, no esperando un error: RLS filtra, no
      // rechaza.
      const { data: comoAna } = await ana.cli.from("billing_provider_events").select("id");
      assert((comoAna ?? []).length === 0,
        `el administrador de una empresa vio ${(comoAna ?? []).length} eventos crudos`);
      const { data: comoAjeno } = await ajeno.cli.from("billing_provider_events").select("id");
      assert((comoAjeno ?? []).length === 0, "un ajeno vio eventos crudos");
      const { data: comoSa } = await sa.cli.from("billing_provider_events").select("id");
      assert((comoSa ?? []).length > 0, "el personal de plataforma no puede operar");
    });

    await check("Y nadie escribe el libro ni el intento a mano", async () => {
      const { error: e1 } = await ana.cli.from("billing_provider_events").insert({
        provider: MP, topic: "payment", resource_id: `mano-${sello}`, signature_verified: true });
      assert(e1, "se pudo insertar un evento a mano");
      const { error: e2 } = await ana.cli.from("billing_checkout_intents")
        .update({ expected_total_amount: 1 }).eq("id", intento!.intent_id);
      const { data: sigue } = await admin.from("billing_checkout_intents")
        .select("expected_total_amount").eq("id", intento!.intent_id).single();
      assert(e2 || (sigue as { expected_total_amount: number }).expected_total_amount
        === intento!.expected_total_amount,
        "el administrador pudo rebajarse el importe esperado");
      // Y las funciones privilegiadas no las alcanza un cliente.
      for (const fn of ["billing_settle_provider_payment", "billing_record_provider_event",
                        "billing_record_renewal_payment", "billing_mark_provider_subscription_state"]) {
        const { error } = await ana.cli.rpc(fn, {});
        assert(error, `un cliente pudo llamar a ${fn}`);
      }
    });

    await check("Un administrador SÍ ve su intento · y no el de otra empresa", async () => {
      const { data: mios } = await ana.cli.from("billing_checkout_intents")
        .select("id, organization_id");
      const filas = (mios ?? []) as { organization_id: string }[];
      assert(filas.length > 0, "el administrador no ve su propia contratación");
      assert(filas.every((f) => f.organization_id === org),
        "ve intentos de otra empresa");
    });
  } finally {
    for (const o of [org, otra]) {
      // El periodo y el cobro se apuntan mutuamente: hay que soltar el nudo
      // antes de borrar, y por CADA empresa. Un borrado que falla no lanza.
      await admin.from("billing_subscription_periods")
        .update({ settled_payment_id: null }).eq("organization_id", o);
      await admin.from("billing_payments").update({ period_id: null }).eq("organization_id", o);
      await admin.from("billing_quotes").update({ subscription_id: null }).eq("organization_id", o);
      await admin.from("billing_provider_events").delete().eq("organization_id", o);
      for (const t of ["billing_payments", "billing_subscription_periods",
                       "billing_checkout_intents", "billing_quotes",
                       "billing_subscriptions", "ai_credit_ledger",
                       "organization_usage_minutes", "organization_usage_leases",
                       "commercial_assignment_events", "organization_plan_assignments",
                       "subscription_plan_history", "organization_subscriptions",
                       "organization_modules", "memberships"]) {
        const { error } = await admin.from(t).delete().eq("organization_id", o);
        if (error) console.error(`  (residuo) ${t}: ${error.message}`);
      }
      const { error } = await admin.from("organizations").delete().eq("id", o);
      if (error) console.error(`  (residuo) empresa ${o}: ${error.message}`);
    }
    await admin.from("billing_provider_events").delete().like("resource_id", `%${sello}`);
    // El tipo de cambio sintético, AL FINAL: la suscripción lo referencia, así
    // que borrarlo antes es imposible. No puede quedarse como verdad comercial
    // de nadie, porque `billing_resolve_fx` no mira la nota y convertiría la
    // tasa inventada en precio para quien presupueste después.
    //
    // Se borra POR IDENTIFICADOR, no por patrón: el comodín de PostgREST no es
    // el de SQL, y un borrado que no encuentra nada no da error —deja la tasa
    // viva sin que nadie se entere—. Y después se COMPRUEBA que se fue.
    const { data: tasas } = await admin.from("commercial_fx_rates").select("id, note");
    const mias = ((tasas ?? []) as { id: string; note: string | null }[])
      .filter((t) => (t.note ?? "").includes(`QA PE-05B2 ${sello}`));
    for (const t of mias) {
      const { error } = await admin.from("commercial_fx_rates")
        .update({ status: "retired" }).eq("id", t.id);
      if (error) console.error(`  (residuo) tipo de cambio ${t.id}: ${error.message}`);
    }
    const { data: quedan } = await admin.from("commercial_fx_rates").select("id, note");
    const vivas = ((quedan ?? []) as { note: string | null }[])
      .filter((t) => (t.note ?? "").includes(`QA PE-05B2 ${sello}`)).length;
    if (vivas > 0) {
      console.error(`  (RESIDUO GRAVE) quedan ${vivas} tasas sintéticas: son precio para quien presupueste`);
    }
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.from("user_legal_acceptances").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B2 · pasarela y webhooks: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
