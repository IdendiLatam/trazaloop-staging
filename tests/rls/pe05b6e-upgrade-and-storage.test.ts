/**
 * Trazaloop · PE-05B6E · Subir hoy, bajar sin perder nada.
 *
 * DOS INVARIANTES, Y LAS DOS SON DE PRODUCTO ANTES QUE DE CÓDIGO.
 *
 * La primera: subir de plan a mitad de periodo cobra solo la DIFERENCIA del
 * tiempo que queda, y NO mueve la fecha de renovación. Si la moviera, quien
 * compró un año en enero y sube en junio pagaría dos veces los mismos meses.
 *
 * La segunda: bajar de plan no borra nada. Una empresa con 3 GB guardados que
 * pasa a un plan de 500 MB queda por encima de su cupo —y eso hay que decirlo—,
 * pero sigue pudiendo consultar, descargar y borrar. Obligarla a borrar
 * evidencias para poder bajar de plan convertiría el precio en un secuestro.
 *
 * Ni una llamada real a una pasarela.
 *
 * Correr: npm run test:pe05b6e-upgrade
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

const admin = createClient(URL, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";
const personas: string[] = [];
const orgs: string[] = [];
const W = "wompi";
const TASA_MICROS = 4_000_000_000;
const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;

async function persona(prefijo: string, papel?: "superadmin" | "support") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B6E" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b6e" });
  return { id: data.user!.id, email, cli };
}

/** Una empresa que ya pagó su primer periodo, por el camino del producto. */
async function empresaPagando(nombre: string, plan: "full" | "extra",
                              intervalo: "monthly" | "annual", cupon?: string) {
  const quien = await persona("b6e");
  const { data: orgId } = await quien.cli.rpc("create_organization",
    { p_name: `${nombre} ${sello}`, p_tax_id: null, p_country: "CO" });
  const org = orgId as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", quien.id);

  const { data: q, error: eq } = await quien.cli.rpc("billing_create_quote", {
    p_organization_id: org, p_plan_code: plan, p_billing_interval: intervalo,
    p_coupon_code: cupon ?? null });
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
    p_provider_payment_id: `b6e-ini-${org.slice(0, 8)}`, p_outcome: "approved",
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
    .select("id, base_charge_amount").eq("organization_id", org).single();
  const s = sub as { id: string; base_charge_amount: number };
  return { org, quien, subscriptionId: s.id, base: s.base_charge_amount, metodo };
}

/** Mueve el ancla en milisegundos y recalcula con el calendario canónico. */
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
  const ultimo = filas[filas.length - 1];
  const { data: lim } = await admin.rpc("billing_period_bounds", {
    p_anchor: ancla, p_interval: s.billing_interval,
    p_sequence: ultimo.period_sequence - base + 1 });
  const l = lim as { period_start: string; period_end: string };
  await admin.from("billing_subscriptions").update({
    current_period_start: l.period_start, current_period_end: l.period_end,
    renews_at: l.period_end, period_anchor_at: ancla }).eq("id", subscriptionId);
  return l;
}

const dias = (n: number) => n * 86_400_000;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Deja el final del periodo pagado a `msRestantes` de ahora. Iterando, porque
 *  los meses no miden lo mismo y mover el ancla treinta días atrás puede caer
 *  en uno de treinta y uno. */
async function envejecerHasta(subscriptionId: string, msRestantes: number) {
  for (let v = 0; v < 6; v += 1) {
    const s = await suscripcion(subscriptionId);
    const falta = new Date(String(s.current_period_end)).getTime()
      - (Date.now() + msRestantes);
    if (Math.abs(falta) < 400) return s;
    await envejecer(subscriptionId, falta);
  }
  const s = await suscripcion(subscriptionId);
  const err = new Date(String(s.current_period_end)).getTime() - (Date.now() + msRestantes);
  assert(Math.abs(err) < 2_000, `el montaje se quedó a ${Math.round(err / 1000)} s`);
  return s;
}

const suscripcion = async (id: string) => {
  const { data } = await admin.from("billing_subscriptions")
    .select("id, status, plan_code, billing_interval, base_charge_amount, charge_currency,"
      + " current_period_start, current_period_end, period_anchor_at,"
      + " period_anchor_sequence, scheduled_plan_revision_id, scheduled_effective_at,"
      + " scheduled_base_charge_amount, scheduled_billing_interval")
    .eq("id", id).single();
  return data as unknown as Record<string, unknown>;
};

const periodos = async (id: string) => {
  const { data } = await admin.from("billing_subscription_periods")
    .select("id, period_sequence, period_start, period_end, base_amount, status,"
      + " settled_payment_id")
    .eq("subscription_id", id).order("period_sequence");
  return (data ?? []) as unknown as Record<string, unknown>[];
};

/** Presupuesta, envía y concilia una subida. Los tres pasos, por su camino. */
async function subir(e: { quien: { cli: SupabaseClient }; subscriptionId: string },
                     destino: string,
                     desenlace: "approved" | "declined" | "failed" = "approved",
                     opciones: { pagoId?: string; importe?: number } = {}) {
  const { data: c, error: ec } = await e.quien.cli.rpc("billing_quote_upgrade", {
    p_subscription_id: e.subscriptionId, p_target_plan_code: destino });
  assert(!ec, `presupuestar la subida: ${ec?.message}`);
  const cuenta = c as Record<string, unknown>;
  if (cuenta.status !== "quoted") return { cuenta, intento: null, resultado: null };

  const { data: i, error: ei } = await e.quien.cli.rpc("billing_open_upgrade_intent", {
    p_change_id: cuenta.change_id as string, p_provider: W, p_environment: "test" });
  assert(!ei, `abrir el intento: ${ei?.message}`);
  const intento = i as Record<string, unknown>;

  const { data: r, error: er } = await admin.rpc("billing_settle_upgrade_payment", {
    p_intent_id: intento.intent_id as string, p_provider: W,
    p_provider_payment_id: opciones.pagoId
      ?? `b6e-up-${(cuenta.change_id as string).slice(0, 8)}`,
    p_outcome: desenlace,
    p_amount: opciones.importe ?? (cuenta.total_amount as number),
    p_currency: "COP", p_live_mode: false, p_failure_reason: null });
  assert(!er, `conciliar: ${er?.message}`);
  return { cuenta, intento, resultado: r as Record<string, unknown> };
}

/** Uso de almacenamiento sintético, por la contabilidad REAL. */
async function ocupar(org: string, bytes: number, etiqueta: string) {
  const { error } = await admin.from("storage_orphan_candidates").insert({
    organization_id: org, module_code: "textiles", bucket_id: "evidences",
    object_path: `${org}/textiles/qa-b6e/${etiqueta}`, size_bytes: bytes,
    source_type: "unreferenced", status: "pending_delete" });
  assert(!error, `ocupar: ${error?.message}`);
}
const liberar = async (org: string, etiqueta: string) => {
  // Igual que borrar: la contabilidad deja de contarlo.
  const { error } = await admin.from("storage_orphan_candidates")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("organization_id", org).eq("object_path", `${org}/textiles/qa-b6e/${etiqueta}`);
  assert(!error, `liberar: ${error?.message}`);
};

const estadoAlmacenamiento = async (
  e: { org: string; quien: { cli: SupabaseClient } }
) => {
  const { data } = await e.quien.cli.rpc("organization_storage_status",
    { p_organization_id: e.org });
  return (data ?? {}) as Record<string, unknown>;
};

const planVigente = async (e: { org: string; quien: { cli: SupabaseClient } }) => {
  const { data } = await e.quien.cli.rpc("plan_effective_for_organization",
    { p_organization_id: e.org, p_as_of: new Date().toISOString() });
  return (data ?? {}) as Record<string, unknown>;
};

const vivas = async (org: string) => {
  const { data } = await admin.from("organization_plan_assignments")
    .select("id, grant_kind, module_code, plan_revision_id")
    .eq("organization_id", org).is("ends_at", null);
  return (data ?? []) as Record<string, unknown>[];
};

async function main() {
  const { data: rev } = await admin.from("plan_revisions")
    .select("id, plan_code, currency, monthly_price_minor, annual_price_minor")
    .is("effective_to", null).eq("status", "published");
  const cat = Object.fromEntries(((rev ?? []) as Record<string, unknown>[])
    .map((r) => [String(r.plan_code), r]));
  const COP = (usdMinor: number) =>
    Math.round(usdMinor * (TASA_MICROS / 1_000_000) / 100);
  const precio = (plan: string, intervalo: "monthly" | "annual") =>
    COP(Number(cat[plan][intervalo === "monthly" ? "monthly_price_minor" : "annual_price_minor"]));

  const { data: fx, error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: TASA_MICROS,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA PE-05B6E ${sello} · tasa sintetica, NO comercial` }).select("id").single();
  assert(!efx, `tasa: ${efx?.message}`);
  const fxId = (fx as { id: string }).id;

  console.log("\nPE-05B6E · Subir hoy, bajar sin perder nada\n");

  const { runRenewalPass } = await import("../../lib/billing/renewal/orchestrator");
  const { fakeBillingProvider } = await import("../../lib/billing/providers/fake");
  const doble = () => fakeBillingProvider("approve", "approve");

  try {
    // =====================================================================
    console.log("A y D · Mensual: Extra hoy, y el día de cobro donde estaba");
    // =====================================================================
    await check("A1. La subida cobra solo la diferencia del tiempo que queda",
      async () => {
        const e = await empresaPagando("A mensual", "full", "monthly");
        await envejecer(e.subscriptionId, dias(10));   // diez dias consumidos
        const antes = await suscripcion(e.subscriptionId);

        const { cuenta, resultado } = await subir(e, "extra");
        assert(cuenta.status === "quoted", JSON.stringify(cuenta));
        assert(resultado?.outcome === "upgraded", JSON.stringify(resultado));

        // La cuenta, rehecha aquí a mano contra los mismos instantes.
        const total = Number(cuenta.period_seconds);
        const resto = Number(cuenta.remaining_seconds);
        const pActual = Math.round(precio("full", "monthly") * resto / total);
        const pDestino = Math.round(precio("extra", "monthly") * resto / total);
        assert(Number(cuenta.prorated_current_base) === pActual,
          `reconocio ${cuenta.prorated_current_base} y son ${pActual}`);
        assert(Number(cuenta.prorated_target_base) === pDestino,
          `pidio ${cuenta.prorated_target_base} y son ${pDestino}`);
        assert(Number(cuenta.delta_base) === pDestino - pActual, "la diferencia no cuadra");
        assert(Number(cuenta.total_amount)
          === Number(cuenta.delta_base) + Number(cuenta.tax_amount), "el total no cuadra");
        // Y NO es el precio entero del destino.
        assert(Number(cuenta.delta_base) < precio("extra", "monthly"),
          "cobro el plan nuevo entero");

        const s = await suscripcion(e.subscriptionId);
        assert(s.plan_code === "extra", `no subio: ${s.plan_code}`);
        assert(s.current_period_end === antes.current_period_end,
          "le movieron la fecha de renovacion");
        assert(s.period_anchor_at === antes.period_anchor_at, "le movieron el ancla");
        assert((await planVigente(e)).plan_code === "extra", "el plan vigente no subio");
      });

    await check("D1. El periodo pagado sigue siendo UNO, y con su importe de entonces",
      async () => {
        const e = await empresaPagando("D mensual", "full", "monthly");
        await envejecer(e.subscriptionId, dias(5));
        await subir(e, "extra");
        const p = await periodos(e.subscriptionId);
        assert(p.length === 1, `aparecieron ${p.length} periodos`);
        assert(Number(p[0].base_amount) === precio("full", "monthly"),
          `reescribieron el periodo pagado: ${p[0].base_amount}`);
        assert(p[0].status === "settled", "el periodo pagado dejo de estarlo");
      });

    // =====================================================================
    console.log("\nB y C · Anual: Extra en junio, aniversario en enero");
    // =====================================================================
    await check("B1. Sube a mitad de año y el aniversario NO se mueve", async () => {
      const e = await empresaPagando("B anual", "full", "annual");
      const lim = await envejecer(e.subscriptionId, dias(180));
      const { cuenta, resultado } = await subir(e, "extra");
      assert(resultado?.outcome === "upgraded", JSON.stringify(resultado));

      const s = await suscripcion(e.subscriptionId);
      assert(s.plan_code === "extra", "no subio");
      assert(s.current_period_end === lim.period_end,
        `el aniversario se movio a ${s.current_period_end}`);
      // Y el importe recurrente pasa a ser el ANUAL entero de Extra.
      assert(Number(s.base_charge_amount) === precio("extra", "annual"),
        `renovaria por ${s.base_charge_amount}`);
      // La diferencia cobrada es de medio año, no de un año.
      assert(Number(cuenta.delta_base) < precio("extra", "annual") * 0.7,
        `cobro ${cuenta.delta_base}, casi el anual entero`);
    });

    await check("C1. No nace un periodo nuevo el día de la subida", async () => {
      const e = await empresaPagando("C anual", "full", "annual");
      const lim = await envejecer(e.subscriptionId, dias(200));
      await subir(e, "extra");
      const p = await periodos(e.subscriptionId);
      assert(p.length === 1, `aparecieron ${p.length} periodos`);
      assert(p[0].period_end === lim.period_end, "el periodo pagado cambio de fin");
    });

    // =====================================================================
    console.log("\nE y F · La aritmética");
    // =====================================================================
    await check("F1. El prorrateo redondea a la mitad hacia arriba, y en enteros",
      async () => {
        const casos: [number, number, number, number][] = [
          [1, 1, 2, 1],          // 0,5 → 1
          [1, 1, 3, 0],          // 0,333 → 0
          [3, 2, 3, 2],          // 2 exacto
          [100, 0, 100, 0],      // sin tiempo restante, nada
          [960000, 1, 2, 480000],
        ];
        for (const [base, resto, total, esperado] of casos) {
          const { data } = await admin.rpc("billing_prorate", {
            p_base: base, p_remaining_seconds: resto, p_period_seconds: total });
          assert(Number(data) === esperado,
            `prorate(${base},${resto},${total}) dio ${data} y son ${esperado}`);
        }
        const { data: cero } = await admin.rpc("billing_prorate", {
          p_base: 100, p_remaining_seconds: 1, p_period_seconds: 0 });
        assert(cero === null, `un periodo de duracion cero devolvio ${cero}`);
      });

    await check("E1. Casi al final del periodo, la diferencia es pequeña pero positiva",
      async () => {
        const e = await empresaPagando("E casi", "full", "monthly");
        // A dos horas del borde: queda muy poco por reconocer y muy poco que cobrar.
        await envejecerHasta(e.subscriptionId, 2 * 3_600_000);
        const { cuenta } = await subir(e, "extra");
        assert(cuenta.status === "quoted", JSON.stringify(cuenta));
        assert(Number(cuenta.delta_base) > 0, "no cobro nada");
        assert(Number(cuenta.delta_base) < precio("extra", "monthly") / 100,
          `cobro ${cuenta.delta_base} por dos horas`);
      });

    // =====================================================================
    console.log("\nG y H · El descuento que ya tenía, y el que no hereda");
    // =====================================================================
    await check("G1/H1. El valor reconocido sale de SU base con descuento, y Extra va limpio",
      async () => {
        const { data: promo, error: ep } = await admin.from("billing_promotions").insert({
          name: `QA B6E institucional ${sello}`, description: "QA PE-05B6E · no comercial",
          program: "institutional_full", discount_type: "percentage", discount_value: 4000,
          max_discount_basis_points: null,
          eligible_plan_codes: ["full"], eligible_intervals: ["monthly"],
          starts_at: new Date(Date.now() - 3_600_000).toISOString(), ends_at: null,
          max_redemptions: null, max_per_organization: 1, status: "active",
        }).select("id").single();
        assert(!ep && promo, `campaña: ${ep?.message}`);
        const promoId = (promo as { id: string }).id;
        const codigo = `B6ECODE${sello}`;
        await admin.from("billing_promotion_codes")
          .insert({ promotion_id: promoId, code: codigo, status: "active" });

        const e = await empresaPagando("G cupon", "full", "monthly", codigo);
        assert(e.base < precio("full", "monthly"), `el cupon no descontó: ${e.base}`);
        await envejecer(e.subscriptionId, dias(10));

        const { cuenta } = await subir(e, "extra");
        const total = Number(cuenta.period_seconds);
        const resto = Number(cuenta.remaining_seconds);
        // Se le reconoce lo que PAGÓ —con descuento—, no el catálogo.
        assert(Number(cuenta.current_full_base) === e.base,
          `reconocio ${cuenta.current_full_base} y su base es ${e.base}`);
        assert(Number(cuenta.prorated_current_base)
          === Math.round(e.base * resto / total), "no prorrateo su base real");
        // Y Extra va al precio limpio: el cupon de Full no se hereda.
        assert(Number(cuenta.target_full_base) === precio("extra", "monthly"),
          `Extra heredó descuento: ${cuenta.target_full_base}`);
        // Como su Full costaba menos, la diferencia es MAYOR. Es lo correcto.
        assert(Number(cuenta.delta_base)
          > Math.round((precio("extra", "monthly") - precio("full", "monthly"))
                       * resto / total),
          "el descuento de Full acabó abaratando Extra");

        await admin.from("billing_promotion_codes").delete().eq("promotion_id", promoId);
        await admin.from("billing_promotions").delete().eq("id", promoId);
      });

    // =====================================================================
    console.log("\nI, J y K · Cuando el dinero no entra");
    // =====================================================================
    await check("I1. Un cobro rechazado deja a la empresa donde estaba", async () => {
      const e = await empresaPagando("I rechazo", "full", "monthly");
      await envejecer(e.subscriptionId, dias(10));
      const { resultado } = await subir(e, "extra", "declined");
      assert(resultado?.outcome === "declined", JSON.stringify(resultado));

      const s = await suscripcion(e.subscriptionId);
      assert(s.plan_code === "full", `subio sin pagar: ${s.plan_code}`);
      assert(Number(s.base_charge_amount) === precio("full", "monthly"),
        "le cambiaron el importe sin cobrar");
      assert((await planVigente(e)).plan_code === "full", "el derecho subio sin pagar");
      const { data: pagos } = await admin.from("billing_payments")
        .select("id").eq("organization_id", e.org);
      assert((pagos ?? []).length === 1, "aparecio un cobro de la subida rechazada");
    });

    await check("J1. Sin desenlace no se concede Extra y no se puede cobrar otra vez",
      async () => {
        const e = await empresaPagando("J en duda", "full", "monthly");
        await envejecer(e.subscriptionId, dias(10));
        const { data: c } = await e.quien.cli.rpc("billing_quote_upgrade", {
          p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
        const cuenta = c as Record<string, unknown>;
        const { data: i } = await e.quien.cli.rpc("billing_open_upgrade_intent", {
          p_change_id: cuenta.change_id as string, p_provider: W, p_environment: "test" });
        const intento = i as Record<string, unknown>;

        const { data: marca } = await admin.rpc("billing_mark_upgrade_uncertain", {
          p_intent_id: intento.intent_id as string, p_reason: "PROVIDER_UNKNOWN" });
        assert((marca as Record<string, unknown>).status === "pending_review",
          JSON.stringify(marca));

        assert((await suscripcion(e.subscriptionId)).plan_code === "full",
          "concedio Extra sin saber si se cobro");
        // Y no se puede abrir una segunda subida en paralelo.
        const { data: otra } = await e.quien.cli.rpc("billing_quote_upgrade", {
          p_subscription_id: e.subscriptionId, p_target_plan_code: "extra" });
        assert((otra as Record<string, unknown>).status === "upgrade_already_pending",
          JSON.stringify(otra));
      });

    await check("K1. El mismo evento dos veces no sube dos veces ni cobra dos veces",
      async () => {
        const e = await empresaPagando("K reentrega", "full", "monthly");
        await envejecer(e.subscriptionId, dias(10));
        const { cuenta, intento, resultado } = await subir(e, "extra");
        assert(resultado?.outcome === "upgraded", JSON.stringify(resultado));

        const { data: otra } = await admin.rpc("billing_settle_upgrade_payment", {
          p_intent_id: (intento as Record<string, unknown>).intent_id as string,
          p_provider: W,
          p_provider_payment_id: `b6e-up-${(cuenta.change_id as string).slice(0, 8)}`,
          p_outcome: "approved", p_amount: cuenta.total_amount as number,
          p_currency: "COP", p_live_mode: false, p_failure_reason: null });
        assert((otra as Record<string, unknown>).outcome === "already_settled",
          JSON.stringify(otra));

        const { data: pagos } = await admin.from("billing_payments")
          .select("id").eq("organization_id", e.org)
          .not("subscription_change_id", "is", null);
        assert((pagos ?? []).length === 1, `${(pagos ?? []).length} cobros de la subida`);
        const propias = (await vivas(e.org)).filter((a) => a.grant_kind === "sold");
        const revisiones = new Set(propias.map((a) => a.plan_revision_id));
        assert(revisiones.size === 1, "quedaron dos niveles vendidos a la vez");
      });

    await check("K2. Un importe distinto del prometido no concede nada", async () => {
      const e = await empresaPagando("K importe", "full", "monthly");
      await envejecer(e.subscriptionId, dias(10));
      const { resultado } = await subir(e, "extra", "approved",
        { importe: 1, pagoId: `b6e-mal-${sello}` });
      assert(resultado?.outcome === "reconciliation_mismatch", JSON.stringify(resultado));
      assert((await suscripcion(e.subscriptionId)).plan_code === "full",
        "subio con un importe que no era el suyo");
    });

    // =====================================================================
    console.log("\nL · Y la renovación siguiente, por el precio entero");
    // =====================================================================
    await check("L1. Tras subir, el cobro siguiente es el Extra COMPLETO", async () => {
      const e = await empresaPagando("L renovacion", "full", "monthly");
      await envejecer(e.subscriptionId, dias(10));
      await subir(e, "extra");
      // Se llega al borde del periodo pagado.
      await envejecer(e.subscriptionId, dias(25));

      const r = await runRenewalPass({ provider: doble() });
      const d = r.decisions.find((x) => x.subscriptionId === e.subscriptionId);
      assert(d?.action === "renew", `no renovó: ${JSON.stringify(d)}`);
      const p = await periodos(e.subscriptionId);
      assert(p.length === 2, `${p.length} periodos`);
      assert(Number(p[1].base_amount) === precio("extra", "monthly"),
        `la obligacion nueva nacio por ${p[1].base_amount}`);
      const { data: intento } = await admin.from("billing_checkout_intents")
        .select("expected_total_amount").eq("period_id", p[1].id as string).single();
      const esperado = precio("extra", "monthly")
        + Math.round(precio("extra", "monthly") * 0.19);
      assert((intento as { expected_total_amount: number }).expected_total_amount
        === esperado, `pidio cobrar ${(intento as { expected_total_amount: number })
          .expected_total_amount} y son ${esperado}`);
    });

    // =====================================================================
    console.log("\nM · El espacio, en cuanto el pago se confirma");
    // =====================================================================
    await check("M1. 500 MB → 5 GB al confirmarse, y lo que ya había sigue ahí",
      async () => {
        const e = await empresaPagando("M espacio", "full", "monthly");
        await envejecer(e.subscriptionId, dias(10));
        await ocupar(e.org, 400 * MB, "antes");

        const antes = await estadoAlmacenamiento(e);
        assert(Number(antes.quota_bytes) === 524_288_000, `cupo Full ${antes.quota_bytes}`);
        assert(antes.state === "WITHIN_LIMIT", `estado ${antes.state}`);

        await subir(e, "extra");
        const despues = await estadoAlmacenamiento(e);
        assert(Number(despues.quota_bytes) === 5 * GB, `cupo Extra ${despues.quota_bytes}`);
        assert(Number(despues.used_bytes) === Number(antes.used_bytes),
          "el uso cambio al subir de plan");
        // Y ahora cabe un archivo que antes no cabria.
        const { error } = await e.quien.cli.rpc("organization_storage_guard", {
          p_organization_id: e.org, p_requested_bytes: 300 * MB,
          p_already_counted_bytes: 0 });
        assert(!error, `no deja subir con Extra: ${error?.message}`);
      });

    await check("M2. La cuota de inteligencia sube sin borrar lo ya consumido",
      async () => {
        const e = await empresaPagando("M ia", "full", "monthly");
        await envejecer(e.subscriptionId, dias(10));
        const { data: antes } = await e.quien.cli.rpc("ai_monthly_allowance",
          { p_organization_id: e.org, p_as_of: new Date().toISOString() });
        assert(Number((antes as Record<string, unknown>).limit_value) === 500,
          `techo Full ${JSON.stringify(antes)}`);

        await admin.from("ai_credit_ledger").insert({
          organization_id: e.org, weighted_credits: 300, operation_code: "qa_b6e",
          status: "committed" });
        const consumido = async () => {
          const { data } = await admin.from("ai_credit_ledger")
            .select("weighted_credits").eq("organization_id", e.org);
          return ((data ?? []) as { weighted_credits: number }[])
            .reduce((s, x) => s + Number(x.weighted_credits), 0);
        };
        const gastadoAntes = await consumido();

        await subir(e, "extra");
        const { data: despues } = await e.quien.cli.rpc("ai_monthly_allowance",
          { p_organization_id: e.org, p_as_of: new Date().toISOString() });
        assert(Number((despues as Record<string, unknown>).limit_value) === 2000,
          `techo Extra ${JSON.stringify(despues)}`);
        assert(await consumido() === gastadoAntes,
          "subir de plan borro el consumo del mes");
      });

    // =====================================================================
    console.log("\nN a Q · Bajar con 3 GB guardados");
    // =====================================================================
    await check("N1. Extra con 3 GB baja a Full: por encima del cupo y sin perder nada",
      async () => {
        const e = await empresaPagando("N bajada", "extra", "monthly");
        await ocupar(e.org, 3 * GB, "grande");
        await envejecerHasta(e.subscriptionId, 3_000);
        const antes = await estadoAlmacenamiento(e);
        assert(antes.state === "WITHIN_LIMIT", `con Extra deberia caber: ${antes.state}`);

        // Bajar NO se rechaza por ocupar mas de lo que cabra despues.
        const { data: prog, error: ep } = await e.quien.cli.rpc(
          "billing_schedule_plan_change",
          { p_subscription_id: e.subscriptionId, p_target_plan_code: "full" });
        assert(!ep, `no dejo bajar: ${ep?.message}`);
        assert((prog as Record<string, unknown>).status === "scheduled",
          JSON.stringify(prog));

        // Antes del borde sigue siendo Extra, con su cupo.
        assert((await estadoAlmacenamiento(e)).state === "WITHIN_LIMIT",
          "le quitaron el espacio antes de tiempo");

        // Y en el borde entra Full.
        await esperar(3_500);
        await runRenewalPass({ provider: doble() });
        assert((await suscripcion(e.subscriptionId)).plan_code === "full", "no bajo");

        const despues = await estadoAlmacenamiento(e);
        assert(despues.state === "OVER_LIMIT", `estado ${despues.state}`);
        assert(Number(despues.used_bytes) === Number(antes.used_bytes),
          "le borraron datos al bajar de plan");
        assert(Number(despues.remaining_bytes) === 0, "espacio restante negativo");
        // Los datos siguen contados, es decir: siguen ahi.
        const { data: quedan } = await admin.from("storage_orphan_candidates")
          .select("id, size_bytes, status").eq("organization_id", e.org);
        assert((quedan ?? []).length === 1
          && (quedan as { status: string }[])[0].status !== "deleted",
          "algo borro los datos");
      });

    await check("O1/P1/Q1. Por encima del cupo: se consulta y se borra, no se sube",
      async () => {
        const e = await empresaPagando("O sobrepasada", "extra", "monthly");
        await ocupar(e.org, 3 * GB, "grande");
        await envejecerHasta(e.subscriptionId, 3_000);
        await e.quien.cli.rpc("billing_schedule_plan_change",
          { p_subscription_id: e.subscriptionId, p_target_plan_code: "full" });
        await esperar(3_500);
        await runRenewalPass({ provider: doble() });
        assert((await estadoAlmacenamiento(e)).state === "OVER_LIMIT", "no quedo por encima");

        // LEER: el estado se consulta sin problema.
        const st = await estadoAlmacenamiento(e);
        assert(Number(st.used_bytes) === 3 * GB, "no se puede ni mirar lo que ocupa");

        // SUBIR: bloqueado, incluso un archivo minusculo.
        const { error: eSube } = await e.quien.cli.rpc("organization_storage_guard", {
          p_organization_id: e.org, p_requested_bytes: 20 * MB,
          p_already_counted_bytes: 0 });
        assert(eSube !== null, "dejo crecer estando por encima del cupo");
        assert(/STORAGE_QUOTA_EXCEEDED/.test(eSube?.message ?? ""),
          `fallo por otra razon: ${eSube?.message}`);

        // BORRAR: permitido, y no pasa por el guardia.
        await liberar(e.org, "grande");
        const tras = await estadoAlmacenamiento(e);
        assert(Number(tras.used_bytes) === 0, `siguen contando ${tras.used_bytes}`);
        assert(tras.state === "WITHIN_LIMIT", `estado ${tras.state}`);

        // Y VOLVER A SUBIR: sin que nadie desbloquee nada a mano.
        const { error: eOtra } = await e.quien.cli.rpc("organization_storage_guard", {
          p_organization_id: e.org, p_requested_bytes: 20 * MB,
          p_already_counted_bytes: 0 });
        assert(!eOtra, `sigue bloqueado tras liberar: ${eOtra?.message}`);
      });

    await check("Q2. Reemplazar por algo más pequeño se permite aun por encima del cupo",
      async () => {
        const e = await empresaPagando("Q reemplazo", "extra", "monthly");
        await ocupar(e.org, 3 * GB, "grande");
        await envejecerHasta(e.subscriptionId, 3_000);
        await e.quien.cli.rpc("billing_schedule_plan_change",
          { p_subscription_id: e.subscriptionId, p_target_plan_code: "full" });
        await esperar(3_500);
        await runRenewalPass({ provider: doble() });

        // Sustituir 1 GB por 100 MB NO hace crecer nada, y el guardia lo ve.
        const { error } = await e.quien.cli.rpc("organization_storage_guard", {
          p_organization_id: e.org, p_requested_bytes: 100 * MB,
          p_already_counted_bytes: 3 * GB });
        assert(!error, `no dejo reemplazar por algo mas pequeño: ${error?.message}`);
      });

    // =====================================================================
    console.log("\nT, U y V · Cambiar de periodicidad");
    // =====================================================================
    await check("T1. Mensual → anual entra en el borde del mes, y re-ancla allí",
      async () => {
        const e = await empresaPagando("T mensual", "full", "monthly");
        // El borde se pone a tres segundos y se ESPERA: programar y despues
        // mover el periodo dejaria la fecha congelada apuntando al vacio.
        const s0 = await envejecerHasta(e.subscriptionId, 3_000);
        const { data, error } = await e.quien.cli.rpc("billing_schedule_transition", {
          p_subscription_id: e.subscriptionId, p_target_plan_code: null,
          p_target_billing_interval: "annual" });
        assert(!error, `programar: ${error?.message}`);
        const r = data as Record<string, unknown>;
        assert(r.status === "scheduled", JSON.stringify(r));
        assert(r.effective_at === s0.current_period_end, `entra el ${r.effective_at}`);
        assert(Number(r.base_charge_amount) === precio("full", "annual"),
          `congelo ${r.base_charge_amount} y el anual son ${precio("full", "annual")}`);
        // Nunca reconstruido como doce mensuales.
        assert(Number(r.base_charge_amount) !== precio("full", "monthly") * 12,
          "calculo el anual como doce mensuales");

        await esperar(3_500);
        // La primera pasada APLICA el cambio; abrir la obligación siguiente es
        // otra decisión y ocurre en la siguiente.
        await runRenewalPass({ provider: doble() });
        const s = await suscripcion(e.subscriptionId);
        assert(s.billing_interval === "annual", `sigue en ${s.billing_interval}`);
        assert(s.period_anchor_at === s0.current_period_end,
          `re-ancló en ${s.period_anchor_at} y el borde era ${s0.current_period_end}`);

        // Y el periodo nuevo dura UN AÑO desde el borde, no un mes ni tres años.
        await runRenewalPass({ provider: doble() });
        const p = await periodos(e.subscriptionId);
        assert(p.length === 2, `${p.length} periodos`);
        const ini = new Date(String(p[1].period_start)).getTime();
        const fin = new Date(String(p[1].period_end)).getTime();
        const meses = (fin - ini) / 86_400_000 / 30.4;
        assert(meses > 11.5 && meses < 12.5, `el periodo nuevo dura ${meses.toFixed(1)} meses`);
        assert(String(p[1].period_start) === String(p[0].period_end),
          "quedo un hueco entre el mes pagado y el año nuevo");
      });

    await check("U1. Anual → mensual NO corta el año pagado", async () => {
      const e = await empresaPagando("U anual", "full", "annual");
      const lim = await envejecer(e.subscriptionId, dias(120));
      const { data } = await e.quien.cli.rpc("billing_schedule_transition", {
        p_subscription_id: e.subscriptionId, p_target_plan_code: null,
        p_target_billing_interval: "monthly" });
      const r = data as Record<string, unknown>;
      assert(r.effective_at === lim.period_end, `entra el ${r.effective_at}`);
      const faltan = (new Date(lim.period_end).getTime() - Date.now()) / 86_400_000;
      assert(faltan > 230, `le cortaron el año: quedan ${Math.round(faltan)} dias`);
      assert(Number(r.base_charge_amount) === precio("full", "monthly"),
        `congelo ${r.base_charge_amount}`);
      // Hasta entonces sigue siendo anual.
      assert((await suscripcion(e.subscriptionId)).billing_interval === "annual",
        "le cambiaron la periodicidad hoy");
    });

    await check("V1. Cambiar de periodicidad no cobra nada hoy ni genera abono",
      async () => {
        const e = await empresaPagando("V sin prorrateo", "full", "monthly");
        const { data: antes } = await admin.from("billing_payments")
          .select("id").eq("organization_id", e.org);
        await e.quien.cli.rpc("billing_schedule_transition", {
          p_subscription_id: e.subscriptionId, p_target_plan_code: null,
          p_target_billing_interval: "annual" });
        const { data: despues } = await admin.from("billing_payments")
          .select("id, total_amount").eq("organization_id", e.org);
        assert((despues ?? []).length === (antes ?? []).length,
          "programar la periodicidad movio dinero");
        assert(((despues ?? []) as { total_amount: number }[])
          .every((p) => p.total_amount > 0), "aparecio un abono");
      });

    await check("V2. Una sola transición pendiente por suscripción", async () => {
      const e = await empresaPagando("V una sola", "extra", "monthly");
      await e.quien.cli.rpc("billing_schedule_transition", {
        p_subscription_id: e.subscriptionId, p_target_plan_code: "full",
        p_target_billing_interval: null });
      const { data: segunda } = await e.quien.cli.rpc("billing_schedule_transition", {
        p_subscription_id: e.subscriptionId, p_target_plan_code: null,
        p_target_billing_interval: "annual" });
      assert((segunda as Record<string, unknown>).status === "change_already_scheduled",
        JSON.stringify(segunda));

      // Y se puede retirar, incluida la periodicidad.
      const { data: fuera } = await e.quien.cli.rpc("billing_cancel_scheduled_change",
        { p_subscription_id: e.subscriptionId });
      assert((fuera as Record<string, unknown>).status === "cleared", JSON.stringify(fuera));
      const s = await suscripcion(e.subscriptionId);
      assert(s.scheduled_plan_revision_id === null
        && s.scheduled_billing_interval === null, "quedo media transicion colgando");
    });

    // =====================================================================
    console.log("\nW, X, Y y Z · Lo que no debe cambiar");
    // =====================================================================
    await check("W1. La cancelación sigue diciendo lo mismo, con su palabra", async () => {
      const e = await empresaPagando("W baja", "full", "monthly");
      const s0 = await suscripcion(e.subscriptionId);
      const { data } = await e.quien.cli.rpc("billing_request_cancellation",
        { p_subscription_id: e.subscriptionId, p_cancel: true });
      const r = data as Record<string, unknown>;
      assert(r.status === "cancellation_scheduled", JSON.stringify(r));
      assert(r.cancel_at_period_end === true, JSON.stringify(r));
      assert(r.effective_at === s0.current_period_end, `se va el ${r.effective_at}`);
      assert((await planVigente(e)).plan_code === "full", "le cortaron el plan hoy");

      const { data: atras } = await e.quien.cli.rpc("billing_request_cancellation",
        { p_subscription_id: e.subscriptionId, p_cancel: false });
      assert((atras as Record<string, unknown>).status === "cancellation_withdrawn",
        JSON.stringify(atras));
    });

    await check("X1. Pagar la subida no enciende ningún módulo", async () => {
      const e = await empresaPagando("X modulos", "full", "monthly");
      await envejecer(e.subscriptionId, dias(10));
      const modulos = async () => {
        const { data } = await admin.from("organization_modules")
          .select("module_code, enabled, access_mode").eq("organization_id", e.org)
          .order("module_code");
        return JSON.stringify(data);
      };
      const antes = await modulos();
      await subir(e, "extra");
      assert(await modulos() === antes, "pagar encendio o cambio un modulo");
    });

    await check("Y1. La subida de una empresa no la ve ni la toca otra", async () => {
      const a = await empresaPagando("Y una", "full", "monthly");
      const b = await empresaPagando("Y otra", "full", "monthly");
      await envejecer(a.subscriptionId, dias(10));
      const { data: c } = await a.quien.cli.rpc("billing_quote_upgrade", {
        p_subscription_id: a.subscriptionId, p_target_plan_code: "extra" });
      const cambio = (c as Record<string, unknown>).change_id as string;

      // Ni la lee…
      const { data: leida } = await b.quien.cli.from("billing_subscription_changes")
        .select("id").eq("id", cambio);
      assert((leida ?? []).length === 0, "la empresa vecina ve la subida ajena");
      // …ni la presupuesta…
      const { error: e1 } = await b.quien.cli.rpc("billing_quote_upgrade", {
        p_subscription_id: a.subscriptionId, p_target_plan_code: "extra" });
      assert(e1 !== null, "presupuesto una subida ajena");
      // …ni la cobra.
      const { error: e2 } = await b.quien.cli.rpc("billing_open_upgrade_intent", {
        p_change_id: cambio, p_provider: W, p_environment: "test" });
      assert(e2 !== null, "abrio el cobro de una subida ajena");
    });

    await check("Z1. Plataforma la ve; una empresa cualquiera, no", async () => {
      const e = await empresaPagando("Z visibilidad", "full", "monthly");
      await envejecer(e.subscriptionId, dias(10));
      await subir(e, "extra");

      const sa = await persona("b6e-sa", "superadmin");
      const { data: comoPlataforma, error: esa } = await sa.cli
        .from("v_billing_subscription_changes")
        .select("id, status, delta_base, total_amount, organization_id")
        .eq("organization_id", e.org);
      assert(!esa, `plataforma no puede leer: ${esa?.message}`);
      assert((comoPlataforma ?? []).length === 1,
        `plataforma ve ${(comoPlataforma ?? []).length}`);

      const { data: comoEmpresa } = await e.quien.cli
        .from("v_billing_subscription_changes").select("id");
      assert((comoEmpresa ?? []).length === 0,
        "una empresa ve la vista de plataforma");

      // Y ni ahí aparece nada de la tarjeta.
      const texto = JSON.stringify(comoPlataforma);
      assert(!/card|pan|cvv|cvc|number/i.test(texto), `dato sensible en la vista: ${texto}`);
    });

  } finally {
    for (const org of orgs) await limpiar(org);
    await admin.from("commercial_fx_rates")
      .update({ status: "retired" }).eq("id", fxId);
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B6E · subida y almacenamiento: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

async function limpiar(orgId: string) {
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
  for (const t of ["billing_provider_events", "billing_payments",
                   "billing_subscription_changes",
                   "billing_subscription_periods", "billing_checkout_intents",
                   "billing_payment_methods", "billing_promotion_redemptions",
                   "billing_quotes", "billing_subscriptions",
                   "storage_orphan_candidates",
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
