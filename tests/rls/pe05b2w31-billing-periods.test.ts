/**
 * Trazaloop · PE-05B2W3.1 · El periodo que hay que pagar.
 *
 * Dos defectos reales lo motivan, y los dos pasaban por debajo de las pruebas
 * porque «el periodo avanzaba»:
 *
 *   · la renovación anclaba el ciclo nuevo en la FECHA DEL PAGO, así que quien
 *     pagaba el día 5 de un ciclo que acababa el 4 del mes siguiente compraba
 *     UN DÍA;
 *   · nada ataba una renovación a un periodo, así que dos cobros distintos para
 *     el mismo mes pasaban los dos.
 *
 * Correr: npm run test:pe05b2w31-periods
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
const W = "wompi";
const dia = (t: string | null | undefined) => (t ?? "").slice(0, 10);

async function persona(prefijo: string, papel?: "superadmin") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA W31" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "w31" });
  if (papel) {
    await admin.from("platform_staff").insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  return { id: data.user!.id, email, cli };
}

const limites = async (ancla: string, intervalo: string, sec: number) => {
  const { data, error } = await admin.rpc("billing_period_bounds", {
    p_anchor: ancla, p_interval: intervalo, p_sequence: sec });
  assert(!error, `límites: ${error?.message}`);
  return data as { period_start: string; period_end: string; sequence: number };
};

async function main() {
  const sa = await persona("w31-sa", "superadmin");
  const ana = await persona("w31-ana");
  const { data: orgId } = await ana.cli.rpc("create_organization",
    { p_name: `QA W31 ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", ana.id);

  const { error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA PE-05B2W31 ${sello} · tasa sintetica, NO comercial` });
  assert(!efx, `tasa: ${efx?.message}`);

  console.log("\nPE-05B2W3.1 · El periodo que hay que pagar\n");

  let sub = "";
  try {
    // =====================================================================
    console.log("A · El calendario · desde el ancla, nunca sumando");
    // =====================================================================

    await check("O. 31 de enero conserva el día 31 · sin deriva", async () => {
      const a = "2026-01-31T10:00:00Z";
      const esperado = ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"];
      for (let n = 1; n <= 5; n += 1) {
        const l = await limites(a, "monthly", n);
        assert(dia(l.period_end) === esperado[n - 1],
          `sec ${n}: ${dia(l.period_end)} en vez de ${esperado[n - 1]}`);
      }
      // Sumar mes a mes daría 28 para siempre a partir de febrero: eso es la
      // deriva que este cálculo existe para evitar. El periodo 3 EMPIEZA el 31
      // de marzo, no el 28.
      const tres = await limites(a, "monthly", 3);
      assert(dia(tres.period_start) === "2026-03-31",
        `volvió la deriva: el periodo 3 empieza el ${dia(tres.period_start)}`);
    });

    await check("31 de agosto, igual", async () => {
      const a = "2026-08-31T10:00:00Z";
      const esperado = ["2026-09-30", "2026-10-31", "2026-11-30", "2026-12-31"];
      for (let n = 1; n <= 4; n += 1) {
        const l = await limites(a, "monthly", n);
        assert(dia(l.period_end) === esperado[n - 1],
          `sec ${n}: ${dia(l.period_end)}`);
      }
    });

    await check("P. 29 de febrero bisiesto · caída determinista", async () => {
      const a = "2024-02-29T10:00:00Z";
      const uno = await limites(a, "annual", 1);
      assert(dia(uno.period_end) === "2025-02-28", `${dia(uno.period_end)}`);
      const dos = await limites(a, "annual", 2);
      assert(dia(dos.period_start) === "2025-02-28" && dia(dos.period_end) === "2026-02-28",
        `${dia(dos.period_start)} → ${dia(dos.period_end)}`);
    });

    await check("Y un periodo sin secuencia válida no se calcula", async () => {
      for (const n of [0, -1]) {
        const { error } = await admin.rpc("billing_period_bounds", {
          p_anchor: "2026-01-31T10:00:00Z", p_interval: "monthly", p_sequence: n });
        assert(error, `calculó la secuencia ${n}`);
      }
      const { error } = await admin.rpc("billing_period_bounds", {
        p_anchor: "2026-01-31T10:00:00Z", p_interval: "semanal", p_sequence: 1 });
      assert(error, "aceptó un intervalo que no existe");
    });

    // =====================================================================
    console.log("\nB · La contratación abre el periodo 1");
    // =====================================================================

    const abrirIntento = async () => {
      const { data: q, error: eq } = await ana.cli.rpc("billing_create_quote", {
        p_organization_id: org, p_plan_code: "full", p_billing_interval: "monthly" });
      assert(!eq, `presupuesto: ${eq?.message}`);
      const { data: i, error: ei } = await ana.cli.rpc("billing_open_checkout_intent", {
        p_quote_id: (q as { quote_id: string }).quote_id, p_provider: W, p_environment: "test" });
      assert(!ei, `intento: ${ei?.message}`);
      return i as unknown as { intent_id: string; expected_total_amount: number };
    };
    const periodos = async () => {
      const { data } = await admin.from("billing_subscription_periods")
        .select("id, period_sequence, period_start, period_end, status")
        .eq("organization_id", org).order("period_sequence");
      return (data ?? []) as Record<string, unknown>[];
    };
    const suscripcion = async () => {
      const { data } = await admin.from("billing_subscriptions")
        .select("id, status, current_period_start, current_period_end, renews_at")
        .eq("organization_id", org).single();
      return data as Record<string, unknown>;
    };
    const vivas = async () => {
      const { data } = await admin.from("billing_subscriptions")
        .select("status").eq("organization_id", org);
      return ((data ?? []) as { status: string }[]).filter((x) =>
        ["active", "past_due", "pending", "cancel_at_period_end"].includes(x.status)).length;
    };

    await check("La contratación deja periodo 1 SALDADO y su ancla", async () => {
      const i = await abrirIntento();
      const { data, error } = await admin.rpc("billing_settle_provider_payment", {
        p_provider: W, p_external_reference: i.intent_id,
        p_provider_payment_id: `w31-ini-${sello}`, p_outcome: "approved",
        p_amount: i.expected_total_amount, p_currency: "COP",
        p_live_mode: false, p_failure_reason: null });
      assert(!error, `liquidar: ${error?.message}`);
      assert((data as Record<string, unknown>).outcome === "activated", JSON.stringify(data));
      const ps = await periodos();
      assert(ps.length === 1 && ps[0].period_sequence === 1 && ps[0].status === "settled",
        JSON.stringify(ps));
      const s = await suscripcion();
      assert(s.current_period_start === ps[0].period_start
        && s.current_period_end === ps[0].period_end,
        "la suscripción y su periodo no dicen lo mismo");
      sub = String(s.id);
    });

    // =====================================================================
    console.log("\nC · Renovar por adelantado NO acorta el derecho");
    // =====================================================================

    await check("L. El periodo siguiente empieza donde acababa el anterior", async () => {
      // Este es EL defecto: antes el ciclo nuevo empezaba HOY, así que renovar
      // el primer día compraba un día.
      const antes = await periodos();
      const finAnterior = String(antes[0].period_end);
      const { data, error } = await admin.rpc("billing_open_next_period",
        { p_subscription_id: sub });
      assert(!error, `abrir: ${error?.message}`);
      const p = data as Record<string, unknown>;
      assert(p.status === "open" && p.period_sequence === 2, JSON.stringify(p));
      assert(String(p.period_start) === finAnterior,
        `empezó en ${p.period_start} en vez de ${finAnterior}: el pago anticipado acorta`);
      const l = await limites(String(antes[0].period_start), "monthly", 2);
      assert(String(p.period_end) === l.period_end,
        `el fin no sale del calendario canónico: ${p.period_end}`);
    });

    await check("Q. Y abrirlo dos veces devuelve el MISMO, no dos", async () => {
      const a = await admin.rpc("billing_open_next_period", { p_subscription_id: sub });
      const b = await admin.rpc("billing_open_next_period", { p_subscription_id: sub });
      const pa = a.data as Record<string, unknown>;
      const pb = b.data as Record<string, unknown>;
      assert(pa.period_id === pb.period_id, "se abrieron dos obligaciones");
      assert(pa.reused === true && pb.reused === true, "no se reconocieron como la misma");
      assert((await periodos()).length === 2, `hay ${(await periodos()).length} periodos`);
    });

    await check("Y dos a la vez tampoco · el candado está en la BASE", async () => {
      // Se intenta insertar el mismo periodo a mano: el índice único lo impide,
      // que es lo que protege de dos procesos despertando juntos.
      const ps = await periodos();
      const p2 = ps.find((x) => x.period_sequence === 2)!;
      const { error } = await admin.from("billing_subscription_periods").insert({
        subscription_id: sub, organization_id: org, period_sequence: 2,
        period_start: p2.period_start, period_end: p2.period_end,
        base_amount: 160000, charge_currency: "COP" });
      assert(error, "se pudo crear una segunda obligación para el mismo mes");
    });

    // =====================================================================
    console.log("\nD · Saldar el periodo · una vez");
    // =====================================================================

    await check("R. Un pago aprobado salda SU periodo y avanza el derecho un mes", async () => {
      const ps = await periodos();
      const p2 = ps.find((x) => x.period_sequence === 2)!;
      const { data: regla } = await admin.rpc("billing_resolve_tax_rule", {
        p_service_class: "self_service_saas", p_at: new Date().toISOString(),
        p_jurisdiction: "CO" });
      const { data: imp } = await admin.rpc("billing_tax_amount", {
        p_base: 160000, p_rate_basis_points: (regla as { rate_basis_points: number }).rate_basis_points });
      const total = 160000 + Number(imp);
      const { data, error } = await admin.rpc("billing_settle_period_payment", {
        p_period_id: p2.id, p_provider: W, p_provider_payment_id: `w31-ren-${sello}`,
        p_outcome: "approved", p_amount: total, p_currency: "COP", p_live_mode: false });
      assert(!error, `saldar: ${error?.message}`);
      const r = data as Record<string, unknown>;
      assert(r.outcome === "renewed", JSON.stringify(r));
      const s = await suscripcion();
      assert(s.current_period_start === p2.period_start
        && s.current_period_end === p2.period_end
        && s.renews_at === p2.period_end,
        `la suscripción no se movió al periodo definido: ${JSON.stringify(s)}`);
      // Y el mes de verdad: un ciclo entero, no unos minutos.
      const d1 = new Date(String(ps[0].period_end)).getTime();
      const d2 = new Date(String(p2.period_end)).getTime();
      const dias = Math.round((d2 - d1) / 86_400_000);
      assert(dias >= 28 && dias <= 31, `el derecho avanzó ${dias} días`);
      assert(await vivas() === 1, "apareció otra suscripción viva");
    });

    await check("S. Un SEGUNDO pago aprobado del mismo periodo NO vuelve a avanzar", async () => {
      const antes = await suscripcion();
      const ps = await periodos();
      const p2 = ps.find((x) => x.period_sequence === 2)!;
      const { data: regla } = await admin.rpc("billing_resolve_tax_rule", {
        p_service_class: "self_service_saas", p_at: new Date().toISOString(),
        p_jurisdiction: "CO" });
      const { data: imp } = await admin.rpc("billing_tax_amount", {
        p_base: 160000, p_rate_basis_points: (regla as { rate_basis_points: number }).rate_basis_points });
      const { data } = await admin.rpc("billing_settle_period_payment", {
        p_period_id: p2.id, p_provider: W, p_provider_payment_id: `w31-otro-${sello}`,
        p_outcome: "approved", p_amount: 160000 + Number(imp), p_currency: "COP",
        p_live_mode: false });
      const r = data as Record<string, unknown>;
      assert(r.outcome === "period_already_settled", JSON.stringify(r));
      const despues = await suscripcion();
      assert(antes.current_period_end === despues.current_period_end,
        "el segundo pago volvió a avanzar el derecho");
      // Pero el dinero NO desaparece: queda anotado y marcado para revisión.
      const { data: pago } = await admin.from("billing_payments")
        .select("status, total_amount, period_id")
        .eq("provider_payment_id", `w31-otro-${sello}`).single();
      assert(pago, "el cobro de más se perdió del libro");
      assert((pago as { status: string }).status === "manual_review",
        `quedó como ${(pago as { status: string }).status}`);
      assert(await vivas() === 1, "apareció otra suscripción viva");
    });

    await check("Y el MISMO pago repetido tampoco hace nada", async () => {
      const antes = await suscripcion();
      const ps = await periodos();
      const p2 = ps.find((x) => x.period_sequence === 2)!;
      for (let n = 0; n < 5; n += 1) {
        const { data } = await admin.rpc("billing_settle_period_payment", {
          p_period_id: p2.id, p_provider: W, p_provider_payment_id: `w31-ren-${sello}`,
          p_outcome: "approved", p_amount: 1, p_currency: "COP", p_live_mode: false });
        assert((data as Record<string, unknown>).outcome === "already_settled",
          `la ${n + 1}ª dijo ${(data as Record<string, unknown>).outcome}`);
      }
      const despues = await suscripcion();
      assert(antes.current_period_end === despues.current_period_end, "el periodo se movió");
      assert((await periodos()).length === 2, "aparecieron periodos de más");
    });

    await check("Importe, moneda y entorno equivocados no saldan nada", async () => {
      const { data: p3 } = await admin.rpc("billing_open_next_period", { p_subscription_id: sub });
      const per = (p3 as Record<string, unknown>).period_id as string;
      const casos: Array<[string, Record<string, unknown>]> = [
        ["importe de menos", { p_amount: 1, p_currency: "COP", p_live_mode: false }],
        ["otra moneda", { p_amount: 190400, p_currency: "USD", p_live_mode: false }],
        ["sin entorno", { p_amount: 190400, p_currency: "COP", p_live_mode: null }],
      ];
      for (const [nombre, extra] of casos) {
        const { data } = await admin.rpc("billing_settle_period_payment", {
          p_period_id: per, p_provider: W,
          p_provider_payment_id: `w31-mal-${nombre.replace(/\s/g, "")}-${sello}`,
          p_outcome: "approved", ...extra });
        const o = (data as Record<string, unknown>).outcome;
        assert(o === "reconciliation_mismatch" || o === "environment_mismatch",
          `«${nombre}» dijo ${o}`);
      }
      const { data: sigue } = await admin.from("billing_subscription_periods")
        .select("status").eq("id", per).single();
      assert((sigue as { status: string }).status === "open",
        "un rechazo saldó el periodo");
    });

    // =====================================================================
    console.log("\nE · Quién ve esto");
    // =====================================================================

    await check("El administrador ve sus periodos · un ajeno no · nadie escribe", async () => {
      const { data: mios } = await ana.cli.from("billing_subscription_periods").select("id");
      assert((mios ?? []).length > 0, "el administrador no ve sus propios periodos");
      const ajeno = await persona("w31-ajeno");
      const { data: suyos } = await ajeno.cli.from("billing_subscription_periods").select("id");
      assert((suyos ?? []).length === 0, "un ajeno vio periodos de otra empresa");
      const { data: staff } = await sa.cli.from("billing_subscription_periods").select("id");
      assert((staff ?? []).length > 0, "la plataforma no puede operar");
      const { error } = await ana.cli.from("billing_subscription_periods").insert({
        subscription_id: sub, organization_id: org, period_sequence: 99,
        period_start: "2030-01-01T00:00:00Z", period_end: "2030-02-01T00:00:00Z",
        base_amount: 1, charge_currency: "COP" });
      assert(error, "un cliente pudo inventarse una obligación");
      for (const fn of ["billing_open_next_period", "billing_settle_period_payment"]) {
        const { error: e } = await ana.cli.rpc(fn, {});
        assert(e, `un cliente pudo llamar a ${fn}`);
      }
    });
  } finally {
    // Las dos tablas se apuntan mutuamente —el periodo dice qué pago lo saldó y
    // el pago dice a qué periodo pertenece—, así que hay que soltar el nudo
    // antes de borrar. Ninguna de las dos puede irse primero.
    await admin.from("billing_subscription_periods")
      .update({ settled_payment_id: null }).eq("organization_id", org);
    await admin.from("billing_payments")
      .update({ period_id: null }).eq("organization_id", org);
    await admin.from("billing_quotes")
      .update({ subscription_id: null }).eq("organization_id", org);
    for (const t of ["billing_provider_events", "billing_payments",
                     "billing_subscription_periods", "billing_checkout_intents",
                     "billing_quotes", "billing_subscriptions", "ai_credit_ledger",
                     "organization_usage_minutes", "organization_usage_leases",
                     "commercial_assignment_events", "organization_plan_assignments",
                     "subscription_plan_history", "organization_subscriptions",
                     "organization_modules", "memberships"]) {
      const { error } = await admin.from(t).delete().eq("organization_id", org);
      if (error) console.error(`  (residuo) ${t}: ${error.message}`);
    }
    const { error } = await admin.from("organizations").delete().eq("id", org);
    if (error) console.error(`  (residuo) empresa: ${error.message}`);
    const { data: tasas } = await admin.from("commercial_fx_rates").select("id, note");
    for (const t of ((tasas ?? []) as { id: string; note: string | null }[])
      .filter((x) => (x.note ?? "").includes(`QA PE-05B2W31 ${sello}`))) {
      await admin.from("commercial_fx_rates").delete().eq("id", t.id);
    }
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.from("user_legal_acceptances").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B2W3.1 · periodos: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
