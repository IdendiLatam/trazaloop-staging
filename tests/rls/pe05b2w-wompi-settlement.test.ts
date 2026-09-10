/**
 * Trazaloop · PE-05B2W · Wompi liquida por el MISMO motor, contra base real.
 *
 * Lo que hay que demostrar no es que Wompi funcione —eso se probó llamándole—,
 * sino que **no trae un segundo motor comercial**: el mismo
 * `billing_settle_provider_payment` de B1/B2, la misma conciliación exacta, la
 * misma idempotencia y el mismo guardia de entorno, con `provider = 'wompi'`.
 *
 * Correr: npm run test:pe05b2w-settlement
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
const WOMPI = "wompi";

async function persona(prefijo: string, papel?: "superadmin") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA W" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "w" });
  if (papel) {
    await admin.from("platform_staff").insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  return { id: data.user!.id, email, cli };
}

async function main() {
  const sa = await persona("w-sa", "superadmin");
  const ana = await persona("w-ana");
  const { data: orgId } = await ana.cli.rpc("create_organization", { p_name: `QA W ${sello}` });
  const org = orgId as string;

  const { error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA PE-05B2W ${sello} · tasa sintetica, NO comercial` });
  assert(!efx, `sembrar tipo de cambio: ${efx?.message}`);

  await admin.rpc("commercial_provision_new_module",
    { p_organization_id: org, p_module_code: "quality" });
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", ana.id);

  const abrir = async () => {
    const { data: q, error: eq } = await ana.cli.rpc("billing_create_quote", {
      p_organization_id: org, p_plan_code: "full", p_billing_interval: "monthly" });
    assert(!eq, `presupuesto: ${eq?.message}`);
    const { data: i, error: ei } = await ana.cli.rpc("billing_open_checkout_intent", {
      p_quote_id: (q as { quote_id: string }).quote_id,
      p_provider: WOMPI, p_environment: "test" });
    assert(!ei, `intento: ${ei?.message}`);
    return i as unknown as { intent_id: string; expected_total_amount: number };
  };
  const liquidar = async (o: { ref: string | null; tx: string; importe: number | null;
                               salida?: string; live?: boolean | null }) => {
    const { data, error } = await admin.rpc("billing_settle_provider_payment", {
      p_provider: WOMPI, p_external_reference: o.ref, p_provider_payment_id: o.tx,
      p_outcome: o.salida ?? "approved", p_amount: o.importe, p_currency: "COP",
      p_live_mode: o.live === undefined ? false : o.live, p_failure_reason: null });
    assert(!error, `liquidar: ${error?.message}`);
    return data as Record<string, unknown>;
  };
  const vendidas = async () => {
    const { data } = await admin.from("organization_plan_assignments")
      .select("id").eq("organization_id", org).eq("grant_kind", "sold");
    return (data ?? []).length;
  };
  const subs = async () => {
    const { data } = await admin.from("billing_subscriptions").select("id").eq("organization_id", org);
    return (data ?? []).length;
  };
  const pagos = async () => {
    const { data } = await admin.from("billing_payments")
      .select("id, provider, provider_payment_id, status").eq("organization_id", org);
    return (data ?? []) as Record<string, unknown>[];
  };

  console.log("\nPE-05B2W · Wompi por el motor de siempre\n");

  try {
    await check("Un cobro de Wompi aprobado activa · por la primitiva de B1", async () => {
      const i = await abrir();
      const r = await liquidar({ ref: i.intent_id, tx: `wompi-tx-${sello}`,
                                 importe: i.expected_total_amount });
      assert(r.outcome === "activated", JSON.stringify(r));
      assert(await subs() === 1, "no se creó exactamente una suscripción");
      assert(await vendidas() >= 1, "no se concedió el plan");
      const p = (await pagos()).find((x) => x.provider_payment_id === `wompi-tx-${sello}`);
      assert(p && p.provider === WOMPI && p.status === "approved",
        `el cobro quedó como ${JSON.stringify(p)}`);
    });

    await check("El mismo evento veinte veces sigue siendo una sola activación", async () => {
      const aP = (await pagos()).length, aS = await subs(), aA = await vendidas();
      for (let n = 0; n < 20; n += 1) {
        const r = await liquidar({ ref: null, tx: `wompi-tx-${sello}`, importe: 1 });
        assert(r.outcome === "already_settled", `la ${n + 1}ª dijo ${r.outcome}`);
      }
      assert((await pagos()).length === aP, "se duplicó un cobro");
      assert(await subs() === aS, "se duplicó una suscripción");
      assert(await vendidas() === aA, "se duplicó la asignación vendida");
    });

    await check("Un importe equivocado NO activa, venga de donde venga", async () => {
      const i = await abrir();
      const r = await liquidar({ ref: i.intent_id, tx: `wompi-mal-${sello}`,
                                 importe: i.expected_total_amount - 1 });
      assert(r.outcome === "reconciliation_mismatch", JSON.stringify(r));
      assert(!(await pagos()).find((x) => x.provider_payment_id === `wompi-mal-${sello}`),
        "se registró un cobro con importe equivocado");
    });

    await check("Y un evento de producción sobre un intento de pruebas tampoco", async () => {
      const i = await abrir();
      const r = await liquidar({ ref: i.intent_id, tx: `wompi-live-${sello}`,
                                 importe: i.expected_total_amount, live: true });
      assert(r.outcome === "environment_mismatch", JSON.stringify(r));
    });

    await check("Los eventos de Wompi se anotan una vez y son privados", async () => {
      const anotar = async () => {
        const { data, error } = await admin.rpc("billing_record_provider_event", {
          p_provider: WOMPI, p_topic: "transaction.updated",
          p_resource_id: `wtx-${sello}`, p_signature_verified: true,
          p_signature_failure_reason: null, p_live_mode: false, p_environment: "test",
          p_provider_request_id: null,
          p_payload: { event: "transaction.updated", transaction_id: `wtx-${sello}` } });
        assert(!error, `anotar: ${error?.message}`);
        return data as Record<string, unknown>;
      };
      const a = await anotar();
      for (let n = 2; n <= 5; n += 1) {
        const r = await anotar();
        assert(r.event_id === a.event_id && r.attempt_count === n, JSON.stringify(r));
      }
      const { count } = await admin.from("billing_provider_events")
        .select("id", { count: "exact", head: true }).eq("resource_id", `wtx-${sello}`);
      assert(count === 1, `hay ${count} filas para el mismo recurso`);
      // Y nadie de fuera de la plataforma los ve. Por EFECTO, no por error.
      const { data: comoAna } = await ana.cli.from("billing_provider_events").select("id");
      assert((comoAna ?? []).length === 0, "el administrador vio eventos crudos");
      const { data: comoSa } = await sa.cli.from("billing_provider_events").select("id");
      assert((comoSa ?? []).length > 0, "la plataforma no puede operar");
    });

    // =====================================================================
    console.log("\nB · La renovación · lo que NO puede pasar");
    // =====================================================================

    /**
     * Toma la suscripción que ya dejó viva el bloque A y le anota su medio de
     * pago. NO contrata otra vez: una empresa solo puede tener una viva, y
     * volver a liquidar una contratación chocaría con el índice único —que es
     * justo la razón por la que la renovación necesita su propio camino—.
     */
    const contratar = async () => {
      const { data: viva } = await admin.from("billing_subscriptions")
        .select("id, base_charge_amount, current_period_end")
        .eq("organization_id", org).eq("status", "active").single();
      assert(viva, "el bloque anterior no dejó una suscripción viva");
      const v = viva as { id: string; base_charge_amount: number; current_period_end: string };
      const { data: intento } = await admin.from("billing_checkout_intents")
        .select("id").eq("billing_subscription_id", v.id).single();
      assert(intento, "la suscripción viva no tiene intento enlazado");
      await admin.rpc("billing_attach_provider_subscription", {
        p_intent_id: (intento as { id: string }).id,
        p_provider_subscription_id: `ps-${sello}`,
        p_init_point: null, p_provider_status: null, p_status: null,
        p_synced_amount: null, p_provider_version: null, p_next_payment_date: null });
      return v;
    };
    const renovar = async (o: { fuente?: string; tx: string; importe: number | null;
                                moneda?: string; live?: boolean | null }) => {
      const { data, error } = await admin.rpc("billing_record_renewal_payment", {
        p_provider: WOMPI, p_provider_subscription_id: o.fuente ?? `ps-${sello}`,
        p_provider_payment_id: o.tx, p_outcome: "approved",
        p_amount: o.importe, p_currency: o.moneda ?? "COP",
        p_live_mode: o.live === undefined ? false : o.live });
      assert(!error, `renovar: ${error?.message}`);
      return data as Record<string, unknown>;
    };
    const vivas = async () => {
      const { data } = await admin.from("billing_subscriptions")
        .select("id, status").eq("organization_id", org);
      return ((data ?? []) as { status: string }[])
        .filter((x) => ["active", "past_due", "pending", "cancel_at_period_end"]
          .includes(x.status)).length;
    };

    let sub: Awaited<ReturnType<typeof contratar>> | null = null;

    await check("Una renovación NO crea una segunda suscripción", async () => {
      sub = await contratar();
      assert(await vivas() === 1, "no quedó exactamente una viva tras contratar");
      const antesA = await vendidas();
      const total = sub.base_charge_amount + Math.round(sub.base_charge_amount * 0.19);
      const r = await renovar({ tx: `w-ren-${sello}`, importe: total });
      assert(r.outcome === "renewed", JSON.stringify(r));
      assert(await vivas() === 1, "la renovación creó otra suscripción viva");
      assert(await vendidas() === antesA, "la renovación duplicó la asignación vendida");
      const { data } = await admin.from("billing_subscriptions")
        .select("current_period_end").eq("id", sub.id).single();
      assert((data as { current_period_end: string }).current_period_end
        !== sub.current_period_end, "el periodo no avanzó");
    });

    await check("Y repetirla no avanza el periodo otra vez", async () => {
      const { data: antes } = await admin.from("billing_subscriptions")
        .select("current_period_end").eq("id", sub!.id).single();
      for (let n = 0; n < 5; n += 1) {
        const r = await renovar({ tx: `w-ren-${sello}`, importe: 1 });
        assert(r.outcome === "already_settled", `la ${n + 1}ª dijo ${r.outcome}`);
      }
      const { data: despues } = await admin.from("billing_subscriptions")
        .select("current_period_end").eq("id", sub!.id).single();
      assert((antes as { current_period_end: string }).current_period_end
        === (despues as { current_period_end: string }).current_period_end,
        "el periodo avanzó con una reentrega");
      assert(await vivas() === 1, "apareció otra suscripción viva");
    });

    await check("Importe o moneda equivocados NO renuevan", async () => {
      const total = sub!.base_charge_amount + Math.round(sub!.base_charge_amount * 0.19);
      const menos = await renovar({ tx: `w-mal-${sello}`, importe: total - 1 });
      assert(menos.outcome === "reconciliation_mismatch", JSON.stringify(menos));
      const otra = await renovar({ tx: `w-usd-${sello}`, importe: total, moneda: "USD" });
      assert(otra.outcome === "reconciliation_mismatch", JSON.stringify(otra));
      const p = await pagos();
      assert(!p.find((x) => x.provider_payment_id === `w-mal-${sello}`), "anotó el de menos");
      assert(!p.find((x) => x.provider_payment_id === `w-usd-${sello}`), "anotó el de otra moneda");
    });

    await check("Un destino desconocido o de otro entorno tampoco", async () => {
      const total = sub!.base_charge_amount + Math.round(sub!.base_charge_amount * 0.19);
      const ajeno = await renovar({ fuente: `ps-inexistente-${sello}`,
                                    tx: `w-nodest-${sello}`, importe: total });
      assert(ajeno.outcome === "reference_unknown", JSON.stringify(ajeno));
      const live = await renovar({ tx: `w-live-${sello}`, importe: total, live: true });
      assert(live.outcome === "environment_mismatch", JSON.stringify(live));
      assert(await vivas() === 1, "alguno de los rechazos creó una suscripción");
    });

    await check("Un cliente no alcanza ninguna función privilegiada", async () => {
      for (const fn of ["billing_settle_provider_payment", "billing_record_provider_event",
                        "billing_record_renewal_payment"]) {
        const { error } = await ana.cli.rpc(fn, {});
        assert(error, `un cliente pudo llamar a ${fn}`);
      }
    });
  } finally {
        await admin.from("billing_subscription_periods")
      .update({ settled_payment_id: null }).eq("organization_id", org);
    await admin.from("billing_payments").update({ period_id: null }).eq("organization_id", org);
    await admin.from("billing_quotes").update({ subscription_id: null }).eq("organization_id", org);
    for (const t of ["billing_provider_events", "billing_payments",
                     "billing_subscription_periods",
                     "billing_checkout_intents", "billing_quotes", "billing_subscriptions",
                     "ai_credit_ledger", "organization_usage_minutes",
                     "organization_usage_leases", "commercial_assignment_events",
                     "organization_plan_assignments", "subscription_plan_history",
                     "organization_subscriptions", "organization_modules", "memberships"]) {
      const { error } = await admin.from(t).delete().eq("organization_id", org);
      if (error) console.error(`  (residuo) ${t}: ${error.message}`);
    }
    await admin.from("billing_provider_events").delete().like("resource_id", `%${sello}`);
    const { error } = await admin.from("organizations").delete().eq("id", org);
    if (error) console.error(`  (residuo) empresa: ${error.message}`);
    // La lectura se acota EN LA BASE a las tasas activas en lugar de traerse la
    // tabla entera y filtrar aquí: PostgREST devuelve como mucho 1000 filas y
    // esta tabla ya las pasó, así que la tasa recién sembrada caía fuera de la
    // página y la limpieza no encontraba nada que retirar —ni lo decía—. Una
    // tasa ya retirada no es precio para nadie: solo estorban las activas.
    const { data: tasas } = await admin.from("commercial_fx_rates")
      .select("id, note").eq("status", "active");
    for (const t of ((tasas ?? []) as { id: string; note: string | null }[])
      .filter((x) => (x.note ?? "").includes(`QA PE-05B2W ${sello}`))) {
      const { error: e } = await admin.from("commercial_fx_rates")
        .update({ status: "retired" }).eq("id", t.id);
      if (e) console.error(`  (residuo) tasa ${t.id}: ${e.message}`);
    }
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.from("user_legal_acceptances").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B2W · liquidación: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
