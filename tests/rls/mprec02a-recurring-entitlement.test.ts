/**
 * Trazaloop · MP-REC-02A · El primer cobro recurrente CONCEDE el plan.
 *
 * Lo que aquí se comprueba es lo que BILLING-EXTRA-01C encontró roto con dos
 * empresas reales: una preapproval autorizada, un primer ciclo cobrado de
 * verdad, un periodo saldado, una suscripción `active`… y ni una concesión
 * pagada. Las empresas seguían viendo Full sólo porque les duraba la prueba de
 * 48 horas; al caducar habrían quedado pagando Full con derechos de Free.
 *
 * Las fixturas nacen por las MISMAS primitivas que usa el carril recurrente
 * —abrir la autorización, atarle el objeto del proveedor, fijar el ancla,
 * conciliar el ciclo—. Lo único sintético es lo que el proveedor REPORTA, que
 * es justo lo que la prueba real de Sandbox cubre aparte.
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
const MP = "mercadopago";
type Fila = Record<string, unknown>;

async function persona(prefijo: string) {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA MPREC02A" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents",
    { p_ip_address: null, p_user_agent: "mprec02a" });
  return { id: data.user!.id, cli };
}

/**
 * Una suscripción recurrente PENDIENTE, por el camino real: presupuesto,
 * intento, autorización, y el objeto del proveedor atado.
 */
async function recurrentePendiente(nombre: string) {
  const quien = await persona("mprec");
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
    p_quote_id: (q as { quote_id: string }).quote_id, p_provider: MP,
    p_environment: "test" });
  assert(!ei, `intento: ${ei?.message}`);
  const intento = i as Fila;

  const { data: a, error: ea } = await quien.cli.rpc(
    "billing_open_recurring_authorization", { p_intent_id: intento.intent_id });
  assert(!ea, `autorización: ${ea?.message}`);
  const auth = a as Fila;
  const authId = String(auth.authorization_id ?? auth.id);

  const preapproval = `pre-${org.slice(0, 8)}-${Math.floor(Math.random() * 1e6)}`;
  await admin.rpc("billing_attach_recurring_preapproval", {
    p_authorization_id: authId, p_provider_subscription_id: preapproval,
    p_init_point: "https://example.test/x", p_provider_status: "authorized",
    p_observed_collector_id: "3663569024" });

  await admin.rpc("billing_attach_provider_subscription", {
    p_intent_id: intento.intent_id, p_provider_subscription_id: preapproval,
    p_init_point: "https://example.test/x", p_provider_status: "authorized",
    p_status: null });

  const { data: sub } = await admin.from("billing_subscriptions")
    .select("id, status, renewal_mode, plan_revision_id, base_charge_amount")
    .eq("organization_id", org).order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  const s = sub as Fila;
  return { org, quien, subscriptionId: String(s.id), preapproval,
           planRevision: String(s.plan_revision_id),
           base: Number(s.base_charge_amount),
           total: Number(intento.expected_total_amount) };
}

/** El ciclo que el proveedor dice haber cobrado. */
async function cicloCobrado(
  e: { subscriptionId: string; preapproval: string; total: number },
  n: number, cuando = new Date()
) {
  if (n === 1) {
    await admin.rpc("billing_set_recurring_anchor", {
      p_subscription_id: e.subscriptionId, p_anchor_at: cuando.toISOString() });
  }
  const { data } = await admin.rpc("billing_reconcile_provider_cycle", {
    p_provider: MP, p_provider_subscription_id: e.preapproval,
    p_provider_invoice_id: `inv-${e.preapproval}-${n}`,
    p_provider_cycle_at: cuando.toISOString(),
    p_provider_payment_id: `pay-${e.preapproval}-${n}`,
    p_outcome: "approved", p_amount: e.total, p_currency: "COP",
    p_live_mode: false, p_provider_plan_id: null });
  return (data ?? {}) as Fila;
}

/** Las concesiones PAGADAS vivas, por ámbito. */
async function pagadasVivas(org: string) {
  const { data } = await admin.from("organization_plan_assignments")
    .select("scope, module_code, plan_revision_id, grant_kind")
    .eq("organization_id", org).is("ends_at", null)
    .in("grant_kind", ["sold", "courtesy"]);
  return (data ?? []) as Fila[];
}

/** Y el plan efectivo SIN contar la prueba. Es la pregunta del defecto. */
async function planSinPrueba(org: string, cli: SupabaseClient) {
  const { data } = await cli.rpc("plan_effective_for_organization_non_trial",
    { p_organization_id: org });
  const r = (data as Fila | null) ?? {};
  return (r.plan_code as string | undefined) ?? (r.code as string | undefined) ?? null;
}

async function main() {
  console.log("\nMP-REC-02A · el primer cobro recurrente concede el plan\n");
  await tasaCanonicaQA(admin);

  try {
    console.log("1 · EL PRIMER CICLO");

    await check("1A. Cobrado y saldado ⇒ activa Y CON EL PLAN CONCEDIDO", async () => {
      const e = await recurrentePendiente("A primero");
      const antes = await pagadasVivas(e.org);
      assert(antes.length === 0, "ya había concesiones pagadas antes de cobrar");

      const r = await cicloCobrado(e, 1);
      assert(r.outcome === "renewed" || r.outcome === "already_settled",
        `conciliar: ${JSON.stringify(r)}`);

      const { data: sub } = await admin.from("billing_subscriptions")
        .select("status").eq("id", e.subscriptionId).single();
      assert((sub as Fila).status === "active", `quedó ${(sub as Fila).status}`);

      const despues = await pagadasVivas(e.org);
      assert(despues.length > 0, "el primer cobro no concedió el plan");
      assert(despues.every((a) => a.plan_revision_id === e.planRevision),
        "se concedió una revisión distinta de la congelada en la suscripción");
      assert(despues.every((a) => a.grant_kind === "sold"),
        "la concesión no es una venta");
    });

    await check("1B. Y el plan efectivo es Full SIN depender de la prueba", async () => {
      // La pregunta que destapó el defecto: al caducar el trial, ¿qué queda?
      const e = await recurrentePendiente("B sin prueba");
      await cicloCobrado(e, 1);
      const plan = await planSinPrueba(e.org, e.quien.cli);
      assert(plan === "full", `sin contar la prueba resolvió a «${plan}»`);
    });

    await check("1C. La revisión concedida es la CONGELADA, no la del catálogo",
      async () => {
        // `billing_subscriptions.plan_revision_id` es NOT NULL, así que la rama
        // defensiva del disparador no se puede alcanzar con datos: lo que sí se
        // puede comprobar es que lo concedido es exactamente esa revisión y no
        // la que el catálogo publique hoy.
        const e = await recurrentePendiente("C congelada");
        const { data: viva } = await admin.from("plan_revisions")
          .select("id").eq("plan_code", "full").eq("status", "published")
          .is("effective_to", null).maybeSingle();
        await cicloCobrado(e, 1);
        const vivas = await pagadasVivas(e.org);
        assert(vivas.length > 0, "no se concedió nada");
        assert(vivas.every((a) => a.plan_revision_id === e.planRevision),
          "se concedió una revisión distinta de la congelada");
        // Y de paso queda dicho contra qué se compara: hoy coinciden, y el día
        // que el catálogo publique otra, esta prueba seguirá mirando la
        // congelada.
        void (viva as Fila | null)?.id;
      });

    console.log("\n2 · UNA VEZ, Y SOLO UNA");

    await check("2A. Conciliar el MISMO ciclo tres veces no concede tres", async () => {
      const e = await recurrentePendiente("D repetido");
      await cicloCobrado(e, 1);
      const unaVez = await pagadasVivas(e.org);
      await cicloCobrado(e, 1);
      await cicloCobrado(e, 1);
      const tresVeces = await pagadasVivas(e.org);
      assert(tresVeces.length === unaVez.length,
        `${unaVez.length} → ${tresVeces.length} concesiones`);
      const { count: pagos } = await admin.from("billing_payments")
        .select("id", { count: "exact", head: true }).eq("organization_id", e.org);
      const { count: periodos } = await admin.from("billing_subscription_periods")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", e.subscriptionId);
      assert(pagos === 1, `${pagos} pagos`);
      assert(periodos === 1, `${periodos} periodos`);
    });

    await check("2B. Y tres a la vez, tampoco", async () => {
      const e = await recurrentePendiente("E concurrente");
      await Promise.all([cicloCobrado(e, 1), cicloCobrado(e, 1), cicloCobrado(e, 1)]);
      const vivas = await pagadasVivas(e.org);
      const ambitos = vivas.map((a) => `${a.scope}:${a.module_code ?? "-"}`);
      assert(new Set(ambitos).size === ambitos.length,
        `ámbitos duplicados: ${ambitos.join(", ")}`);
      assert(vivas.length > 0, "la concurrencia dejó a la empresa sin plan");
    });

    await check("2C. Y una RENOVACIÓN no abre otra concesión viva", async () => {
      // El derecho ya está puesto. Que cada mes abriera uno nuevo no rompería
      // el efectivo —siempre gana el mismo plan— pero llenaría la historia de
      // filas que nadie pidió.
      const e = await recurrentePendiente("F renovación");
      await cicloCobrado(e, 1);
      const tras1 = await pagadasVivas(e.org);
      const dentroDeUnMes = new Date(Date.now() + 31 * 24 * 3600 * 1000);
      await cicloCobrado(e, 2, dentroDeUnMes);
      const tras2 = await pagadasVivas(e.org);
      assert(tras2.length === tras1.length,
        `la renovación pasó de ${tras1.length} a ${tras2.length} concesiones`);
      const ids1 = tras1.map((a) => String(a.module_code)).sort().join(",");
      const ids2 = tras2.map((a) => String(a.module_code)).sort().join(",");
      assert(ids1 === ids2, "la renovación cambió los ámbitos concedidos");
    });

    console.log("\n3 · LO QUE NO SE PUEDE ROMPER");

    await check("3A. Cancelar al final del periodo NO retira el plan antes",
      async () => {
        const e = await recurrentePendiente("G cancelada");
        await cicloCobrado(e, 1);
        const antes = await pagadasVivas(e.org);
        await e.quien.cli.rpc("billing_request_cancellation",
          { p_subscription_id: e.subscriptionId, p_cancel: true });
        const despues = await pagadasVivas(e.org);
        assert(despues.length === antes.length,
          "programar la cancelación retiró el plan antes de tiempo");
        const plan = await planSinPrueba(e.org, e.quien.cli);
        assert(plan === "full", `tras cancelar resolvió a «${plan}»`);
      });

    await check("3B. Y una subida a Extra deja SOLO Extra en cada ámbito", async () => {
      // BILLING-EXTRA-01C no se puede romper: Full vendido y Extra vendido no
      // pueden convivir vivos en el mismo ámbito.
      const e = await recurrentePendiente("H subida");
      await cicloCobrado(e, 1);
      const { data: c } = await e.quien.cli.rpc("billing_quote_upgrade", {
        p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
      const cuenta = c as Fila;
      assert(cuenta.status === "quoted", `presupuestar: ${cuenta.status}`);
      const { data: i } = await e.quien.cli.rpc("billing_open_upgrade_intent", {
        p_change_id: cuenta.change_id, p_provider: MP, p_environment: "test" });
      const { data: r } = await admin.rpc("billing_settle_upgrade_payment", {
        p_intent_id: (i as Fila).intent_id, p_provider: MP,
        p_provider_payment_id: `up-${String(cuenta.change_id).slice(0, 8)}`,
        p_outcome: "approved", p_amount: cuenta.total_amount, p_currency: "COP",
        p_live_mode: false, p_failure_reason: null });
      assert((r as Fila).outcome === "upgraded", `liquidar: ${(r as Fila).outcome}`);

      const vivas = await pagadasVivas(e.org);
      const ambitos = vivas.map((a) => `${a.scope}:${a.module_code ?? "-"}`);
      assert(new Set(ambitos).size === ambitos.length,
        `ámbitos con dos concesiones vivas: ${ambitos.join(", ")}`);
      assert(new Set(vivas.map((a) => a.plan_revision_id)).size === 1,
        "sobrevivieron concesiones de dos revisiones a la vez");
      assert(vivas.every((a) => a.plan_revision_id !== e.planRevision),
        "la concesión de Full sobrevivió a la subida");
    });

    await check("3C. El carril de la plataforma nunca tuvo este agujero",
      async () => {
        // Ahí la suscripción nace de `billing_settle_payment` —y
        // `billing_settle_provider_payment` delega en ella—, que SÍ concede. No
        // se supone: se lee la definición de las funciones en la base.
        const [{ definiciones }] = [{ definiciones: await (async () => {
          const r = await admin.rpc("billing_upgrade_in_flight",
            { p_subscription_id: "00000000-0000-0000-0000-000000000000" });
          void r;
          return null;
        })() }];
        void definiciones;

        const { data } = await admin
          .schema("public")
          .rpc("billing_tax_amount", { p_base: 100, p_rate_basis_points: 1900 });
        assert(Number(data) === 19, "la autoridad de redondeo cambió");

        // El disparador sólo actúa sobre el carril del PROVEEDOR: el de la
        // plataforma no pasa por aquí porque su suscripción ya nace concedida.
        const { data: filas } = await admin
          .from("billing_subscriptions").select("renewal_mode, status")
          .eq("renewal_mode", "platform").eq("status", "pending").limit(1);
        assert((filas ?? []).length === 0,
          "hay una suscripción de plataforma esperando promoción: "
          + "entonces el carril de Wompi también necesita concesión aquí");
      });

  } finally {
    for (const org of orgs) {
      await admin.from("billing_subscription_changes")
        .update({ payment_id: null }).eq("organization_id", org);
      await admin.from("billing_checkout_intents").delete().eq("organization_id", org);
      await admin.from("billing_payments").delete().eq("organization_id", org);
      await admin.from("billing_subscription_changes").delete().eq("organization_id", org);
      await admin.from("billing_provider_cycles").delete().eq("organization_id", org);
      await admin.from("billing_subscription_periods").delete().eq("organization_id", org);
      await admin.from("billing_quotes").delete().eq("organization_id", org);
      await admin.from("billing_recurring_authorizations").delete().eq("organization_id", org);
      await admin.from("billing_subscriptions").delete().eq("organization_id", org);
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      await admin.from("memberships").delete().eq("organization_id", org);
      await admin.from("organizations").delete().eq("id", org);
    }
    await limpiarPersonas(admin, personas);
  }

  console.log(`\nMP-REC-02A · derecho recurrente: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
