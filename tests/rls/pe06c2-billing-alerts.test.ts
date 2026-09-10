/**
 * Trazaloop · PE-06C2 · Que alguien se entere de un cobro en duda.
 *
 * LO QUE ESTA SUITE PROTEGE
 *
 * El dominio ya sabe callarse cuando no sabe: si la petición cruzó la frontera
 * del proveedor y no hubo respuesta, no se concede nada y nadie vuelve a cobrar
 * solo. Eso está probado desde B5E.
 *
 * Lo que aquí se comprueba es lo otro: que ese silencio LLEGA a una persona, una
 * sola vez, y que si el aviso no se puede entregar el dinero se queda
 * exactamente donde estaba. Un aviso que moviera dinero sería peor que no tener
 * aviso.
 *
 * Correr: npm run test:pe06c2-alerts
 */
import { config as loadEnv } from "dotenv";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { limpiarPersonas } from "../support/fixture-cleanup";

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
const avisos: string[] = [];
const W = "wompi";
const TASA_MICROS = 4_000_000_000;

async function persona(prefijo: string, papel?: "superadmin" | "support") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA C2" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "c2" });
  return { id: data.user!.id, email, cli };
}

/** Una empresa con su plan pagado y su tarjeta, por el camino del producto. */
async function empresaPagando(nombre: string) {
  const quien = await persona("c2");
  const { data: orgId } = await quien.cli.rpc("create_organization",
    { p_name: `${nombre} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", quien.id);
  const { data: q } = await quien.cli.rpc("billing_create_quote", {
    p_organization_id: org, p_plan_code: "full", p_billing_interval: "monthly",
    p_coupon_code: null });
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
    p_provider_payment_id: `c2-ini-${org.slice(0, 8)}`, p_outcome: "approved",
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
    .select("id, plan_code, base_charge_amount").eq("organization_id", org).single();
  const s = sub as { id: string; plan_code: string; base_charge_amount: number };
  return { org, quien, subscriptionId: s.id, plan: s.plan_code, base: s.base_charge_amount };
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
}
const dias = (n: number) => n * 86_400_000;

const alertasDe = async (org: string) => {
  const { data } = await admin.from("billing_operations_alerts")
    .select("id, alert_type, failure_class, status, intent_id, dedupe_key,"
      + " delivery_attempts, last_error")
    .eq("organization_id", org).order("created_at");
  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  for (const f of filas) avisos.push(String(f.id));
  return filas;
};

const estadoFinanciero = async (subscriptionId: string, org: string) => {
  const { data: s } = await admin.from("billing_subscriptions")
    .select("plan_code, status, base_charge_amount, current_period_end")
    .eq("id", subscriptionId).single();
  const { data: p } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, status, settled_payment_id")
    .eq("subscription_id", subscriptionId).order("period_sequence");
  const { data: y } = await admin.from("billing_payments")
    .select("id, status, total_amount").eq("organization_id", org).order("created_at");
  const { data: a } = await admin.from("organization_plan_assignments")
    .select("id, grant_kind, plan_revision_id").eq("organization_id", org)
    .is("ends_at", null).order("id");
  return JSON.stringify({ s, p, y, a });
};

/** Un receptor de avisos, para probar la entrega de verdad. */
function receptor(): Promise<{ url: string; recibidos: unknown[]; cerrar: () => void;
                               fallar: (v: boolean) => void }> {
  const recibidos: unknown[] = [];
  let romper = false;
  return new Promise((resolve) => {
    const srv: Server = createServer((req, res) => {
      let cuerpo = "";
      req.on("data", (c) => { cuerpo += c; });
      req.on("end", () => {
        if (romper) { res.writeHead(500); res.end("no"); return; }
        try { recibidos.push(JSON.parse(cuerpo)); } catch { recibidos.push(cuerpo); }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      });
    });
    srv.listen(0, "127.0.0.1", () => {
      const dir = srv.address();
      const puerto = typeof dir === "object" && dir ? dir.port : 0;
      resolve({ url: `http://127.0.0.1:${puerto}/avisos`, recibidos,
                cerrar: () => srv.close(), fallar: (v: boolean) => { romper = v; } });
    });
  });
}

async function main() {
  // Una tasa sintetica que quedo viva por una ejecucion interrumpida bloquearia
  // esta: 0182 prohibe dos activas a la vez. Se retira -- nunca se borra, que la
  // historia financiera no se borra ni siendo de QA -- y solo las etiquetadas.
  await admin.from("commercial_fx_rates").update({ status: "retired" })
    .eq("status", "active").like("note", "QA PE-06C2 %");

  const { data: fx, error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: TASA_MICROS,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA PE-06C2 ${sello} · tasa sintetica, NO comercial` }).select("id").single();
  assert(!efx, `tasa: ${efx?.message}`);
  const fxId = (fx as { id: string }).id;

  console.log("\nPE-06C2 · Avisos de cobro en duda\n");

  const { runRenewalPass } = await import("../../lib/billing/renewal/orchestrator");
  const { fakeBillingProvider } = await import("../../lib/billing/providers/fake");
  const { scanUncertainCharges } = await import("../../lib/db/billing-alerts");
  const { dispatchPendingAlerts, alertPayload } = await import(
    "../../lib/billing/alerts/dispatch");

  const oyente = await receptor();

  try {
    // =====================================================================
    console.log("A · Un cobro sin desenlace avisa, y avisa una vez");
    // =====================================================================
    let orgA = "", subA = "";

    await check("A1. Sin respuesta del proveedor: nada se concede y queda la duda",
      async () => {
        const e = await empresaPagando("A en duda");
        orgA = e.org; subA = e.subscriptionId;
        await envejecer(e.subscriptionId, dias(32));

        const r = await runRenewalPass({
          provider: fakeBillingProvider("approve", "lost_response") });
        const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
        assert(d?.failureClass === "provider_unknown",
          `la clase de fallo fue ${JSON.stringify(d)}`);

        // El derecho NO se movió.
        const { data: s } = await admin.from("billing_subscriptions")
          .select("plan_code, base_charge_amount").eq("id", e.subscriptionId).single();
        assert((s as { plan_code: string }).plan_code === e.plan, "cambió de plan");
      });

    await check("A2. El barrido levanta UN aviso, y dice qué pasó", async () => {
      const r = await scanUncertainCharges();
      assert(r.scanned > 0, `no vio ningún intento: ${JSON.stringify(r)}`);
      const a = await alertasDe(orgA);
      assert(a.length === 1, `levantó ${a.length} avisos`);
      assert(a[0].alert_type === "renewal_provider_unknown",
        `tipo ${a[0].alert_type}`);
      assert(a[0].failure_class === "provider_unknown", `clase ${a[0].failure_class}`);
      assert(a[0].status === "pending", `estado ${a[0].status}`);
    });

    await check("A3. Repetir el barrido NO llena el buzón", async () => {
      const antes = (await alertasDe(orgA)).length;
      await scanUncertainCharges();
      await scanUncertainCharges();
      const despues = (await alertasDe(orgA)).length;
      assert(antes === despues, `pasó de ${antes} a ${despues} avisos`);
    });

    // =====================================================================
    console.log("\nB · La entrega");
    // =====================================================================
    await check("B1. Con un punto configurado, el aviso sale y se marca", async () => {
      process.env.BILLING_OPERATIONS_ALERT_ENDPOINT = oyente.url;
      process.env.BILLING_OPERATIONS_ALERT_RECIPIENT = "operacion@test.trazaloop.dev";
      const r = await dispatchPendingAlerts();
      assert(r.channelConfigured, "no reconoció el canal");
      assert(r.sent >= 1, `envió ${r.sent}`);
      const a = await alertasDe(orgA);
      assert(a[0].status === "sent", `quedó en ${a[0].status}`);
      assert(oyente.recibidos.length >= 1, "el receptor no recibió nada");
    });

    await check("B2. Lo que sale por el cable no lleva nada que no se pueda enseñar",
      async () => {
        const cuerpo = JSON.stringify(oyente.recibidos[0]);
        for (const veneno of ["number", "cvc", "cvv", "pan", "card",
                              "private_key", "events_secret", "integrity",
                              "runner", "service_role", "eyJ"]) {
          assert(!cuerpo.toLowerCase().includes(veneno.toLowerCase()),
            `el aviso lleva «${veneno}»: ${cuerpo.slice(0, 160)}`);
        }
        const d = oyente.recibidos[0] as Record<string, unknown>;
        assert(d.alert_id && d.failure_class && d.attempt_id, "le falta lo esencial");
        assert(d.recipient === "operacion@test.trazaloop.dev",
          "el destinatario no salió de la configuración");
        assert(String(d.review_path).startsWith("/platform"), "no dice adónde ir");
      });

    await check("B3. Sin punto configurado no se pierde el aviso: queda pendiente",
      async () => {
        delete process.env.BILLING_OPERATIONS_ALERT_ENDPOINT;
        const e = await empresaPagando("B sin canal");
        await envejecer(e.subscriptionId, dias(32));
        await runRenewalPass({
          provider: fakeBillingProvider("approve", "lost_response") });
        await scanUncertainCharges();
        const r = await dispatchPendingAlerts();
        assert(!r.channelConfigured, "dijo que había canal");
        assert(r.sent === 0, "envió algo sin canal");
        const a = await alertasDe(e.org);
        assert(a.length === 1 && a[0].status === "pending",
          `el aviso quedó en ${JSON.stringify(a)}`);
      });

    await check("B4. Si la entrega FALLA, el dinero no se mueve", async () => {
      const e = await empresaPagando("B entrega rota");
      await envejecer(e.subscriptionId, dias(32));
      await runRenewalPass({
        provider: fakeBillingProvider("approve", "lost_response") });
      await scanUncertainCharges();
      const antes = await estadoFinanciero(e.subscriptionId, e.org);

      process.env.BILLING_OPERATIONS_ALERT_ENDPOINT = oyente.url;
      oyente.fallar(true);
      const r = await dispatchPendingAlerts();
      oyente.fallar(false);
      assert(r.failed >= 1, `no falló la entrega: ${JSON.stringify(r)}`);

      const a = (await alertasDe(e.org))[0];
      assert(a.status === "failed", `estado ${a.status}`);
      assert(Number(a.delivery_attempts) >= 1, "no contó el intento");
      assert(a.last_error, "no anotó por qué falló");
      assert(await estadoFinanciero(e.subscriptionId, e.org) === antes,
        "la entrega fallida movió algo del dinero");
    });

    await check("B4b. Y si el punto ni siquiera responde, tampoco se mueve nada",
      async () => {
        // La otra forma de fallar: no es que conteste mal, es que no contesta.
        // Recorre la rama de excepción, que la anterior no toca.
        const e = await empresaPagando("B sin nadie al otro lado");
        await envejecer(e.subscriptionId, dias(32));
        await runRenewalPass({
          provider: fakeBillingProvider("approve", "lost_response") });
        await scanUncertainCharges();
        const antes = await estadoFinanciero(e.subscriptionId, e.org);

        process.env.BILLING_OPERATIONS_ALERT_ENDPOINT = "http://127.0.0.1:1/avisos";
        const r = await dispatchPendingAlerts();
        process.env.BILLING_OPERATIONS_ALERT_ENDPOINT = oyente.url;
        assert(r.failed >= 1, `no falló: ${JSON.stringify(r)}`);

        const a = (await alertasDe(e.org))[0];
        assert(a.status === "failed", `estado ${a.status}`);
        assert(a.last_error, "no anotó por qué falló");
        assert(await estadoFinanciero(e.subscriptionId, e.org) === antes,
          "no poder conectar movió algo del dinero");
      });

    await check("B5. Y un hecho NUEVO sí genera un aviso nuevo", async () => {
      const e = await empresaPagando("B segundo hecho");
      await envejecer(e.subscriptionId, dias(32));
      await runRenewalPass({
        provider: fakeBillingProvider("approve", "lost_response") });
      await scanUncertainCharges();
      const suyos = await alertasDe(e.org);
      assert(suyos.length === 1, `${suyos.length} avisos para una empresa nueva`);
      const { count } = await admin.from("billing_operations_alerts")
        .select("id", { count: "exact", head: true });
      assert((count ?? 0) >= 4, `en total hay ${count} avisos`);
    });

    // =====================================================================
    console.log("\nC · La otra incertidumbre, y la de las subidas");
    // =====================================================================
    await check("C1. Un descuadre de integridad también avisa", async () => {
      const e = await empresaPagando("C integridad");
      await envejecer(e.subscriptionId, dias(32));
      await runRenewalPass({
        provider: fakeBillingProvider("approve", "integrity_mismatch") });
      await scanUncertainCharges();
      const a = await alertasDe(e.org);
      assert(a.length === 1, `${a.length} avisos`);
      assert(a[0].alert_type === "renewal_integrity_mismatch", `tipo ${a[0].alert_type}`);
    });

    await check("C2. Una SUBIDA en duda también, aunque no tenga periodo", async () => {
      const e = await empresaPagando("C subida");
      await envejecer(e.subscriptionId, dias(10));
      const { data: c } = await e.quien.cli.rpc("billing_quote_upgrade", {
        p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
      const cuenta = c as Record<string, unknown>;
      assert(cuenta.status === "quoted", JSON.stringify(cuenta));
      const { data: i } = await e.quien.cli.rpc("billing_open_upgrade_intent", {
        p_change_id: cuenta.change_id as string, p_provider: W, p_environment: "test" });
      const intento = i as Record<string, unknown>;
      await admin.rpc("billing_mark_upgrade_uncertain", {
        p_intent_id: intento.intent_id as string, p_reason: "PROVIDER_UNKNOWN" });

      await scanUncertainCharges();
      const a = await alertasDe(e.org);
      assert(a.length === 1, `${a.length} avisos`);
      assert(a[0].alert_type === "upgrade_provider_unknown", `tipo ${a[0].alert_type}`);
      // Y el plan NO subió.
      const { data: s } = await admin.from("billing_subscriptions")
        .select("plan_code").eq("id", e.subscriptionId).single();
      assert((s as { plan_code: string }).plan_code === "full", "concedió Extra sin cobrar");
    });

    await check("C3. Un rechazo normal NO avisa: eso es ciclo de vida, no incertidumbre",
      async () => {
        const e = await empresaPagando("C rechazo");
        await envejecer(e.subscriptionId, dias(32));
        await runRenewalPass({
          provider: fakeBillingProvider("approve", "retryable_decline") });
        await scanUncertainCharges();
        const a = await alertasDe(e.org);
        assert(a.length === 0, `levantó ${a.length} avisos por un rechazo reintentable`);
      });

    // =====================================================================
    console.log("\nD · Quién lo ve");
    // =====================================================================
    await check("D1. Plataforma los ve; una empresa cualquiera, no", async () => {
      const sa = await persona("c2-sa", "superadmin");
      const { data: comoPlataforma, error } = await sa.cli
        .from("v_billing_operations_alerts").select("id, alert_type, status");
      assert(!error, `plataforma no puede leer: ${error?.message}`);
      assert((comoPlataforma ?? []).length > 0, "plataforma no ve ninguno");

      const ajeno = await persona("c2-ajeno");
      const { data: comoEmpresa } = await ajeno.cli
        .from("v_billing_operations_alerts").select("id");
      assert((comoEmpresa ?? []).length === 0, "una empresa ve los avisos de plataforma");
      const { error: eEscribe } = await ajeno.cli
        .from("billing_operations_alerts").insert({
          alert_type: "renewal_provider_unknown", dedupe_key: `intruso-${sello}` });
      assert(eEscribe !== null, "una empresa pudo escribir un aviso");
    });

    await check("D2. El aviso apunta a la consola, y no trae botón de cobrar", async () => {
      const a = await alertasDe(orgA);
      const p = alertPayload({
        id: String(a[0].id), alertType: String(a[0].alert_type),
        failureClass: (a[0].failure_class as string) ?? null,
        status: "pending", organizationId: orgA, organizationName: null,
        subscriptionId: subA, intentId: (a[0].intent_id as string) ?? null,
        detail: {}, deliveryAttempts: 0, lastError: null,
        createdAt: new Date().toISOString(),
      }, "operacion@test.trazaloop.dev");
      assert(p.review_path === "/platform/plans", p.review_path);
      // Lo que no puede llevar es una ACCIÓN: un campo que permita disparar un
      // cobro desde el aviso. Que la frase explique que «nadie va a volver a
      // cobrar solo» es justo lo contrario, y buscar la palabra suelta
      // confundía una cosa con la otra.
      for (const campo of ["retry_url", "charge_url", "action", "action_url",
                           "retry", "charge", "settle_url"]) {
        assert(!(campo in (p as unknown as Record<string, unknown>)),
          `el aviso trae un campo de acción: «${campo}»`);
      }
      const rutas = Object.entries(p as unknown as Record<string, unknown>)
        .filter(([, v]) => typeof v === "string" && /^https?:|^\//.test(String(v)));
      assert(rutas.every(([, v]) => String(v).startsWith("/platform")),
        `el aviso lleva un enlace que no es de consulta: ${JSON.stringify(rutas)}`);
      const codigo = readFileSync("components/domain/platform/renewal-operations.tsx", "utf8");
      assert(codigo.includes("necesitan que alguien los mire")
        || codigo.includes("necesita que alguien lo mire"),
        "la consola no enseña los avisos");
    });

  } finally {
    oyente.cerrar();
    delete process.env.BILLING_OPERATIONS_ALERT_ENDPOINT;
    delete process.env.BILLING_OPERATIONS_ALERT_RECIPIENT;
    for (const id of [...new Set(avisos)]) {
      await admin.from("billing_operations_alerts").delete().eq("id", id);
    }
    for (const org of orgs) {
      await admin.from("billing_operations_alerts").delete().eq("organization_id", org);
      await limpiar(org);
    }
    await admin.from("commercial_fx_rates").update({ status: "retired" }).eq("id", fxId);
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

  console.log(`\nPE-06C2 · avisos: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}



async function limpiar(orgId: string) {
  await admin.from("billing_subscriptions").update({ status: "retired" })
    .eq("organization_id", orgId);
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
  for (const t of ["billing_operations_alerts", "billing_provider_events",
                   "billing_payments", "billing_subscription_changes",
                   "billing_subscription_periods", "billing_checkout_intents",
                   "billing_payment_methods", "billing_promotion_redemptions",
                   "billing_quotes", "billing_subscriptions", "storage_orphan_candidates",
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
