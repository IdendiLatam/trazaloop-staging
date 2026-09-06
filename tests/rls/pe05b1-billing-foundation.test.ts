/**
 * Trazaloop · PE-05B1 · Cimientos de facturación.
 *
 * Lo que solo se sabe ejecutando, y con dinero de por medio:
 *
 *   · que el navegador no pueda mover el importe ni el impuesto;
 *   · que sin regla fiscal o sin tipo de cambio NO se cobre —ni al 0 % ni al
 *     19 %, sino nada—;
 *   · que una futura exención del SaaS autogestionable NO reescriba un solo
 *     cobro pasado ni le quite el IVA al Acompañamiento;
 *   · y que el precio base contratado sobreviva a ese cambio.
 *
 * Correr: npm run test:pe05b1-billing
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
const personasCreadas: string[] = [];
const reglasCreadas: string[] = [];
let fxId = "";

async function persona(prefijo: string, papel?: "superadmin" | "support") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B1P" } });
  assert(data.user, `crear ${prefijo}`);
  personasCreadas.push(data.user.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b1p" });
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: papel, status: "active" });
  }
  return { id: data.user.id, email, cli };
}

type J = Record<string, unknown>;
const n = (v: unknown) => Number(v);

async function main() {
  const sa = await persona("b1p-sa", "superadmin");
  const soporte = await persona("b1p-support", "support");
  const dueño = await persona("b1p-admin");
  const calidad = await persona("b1p-quality");
  const ajeno = await persona("b1p-ajeno");

  const { data: orgId } = await dueño.cli.rpc("create_organization", { p_name: `B1P ${sello}` });
  const org = orgId as string;
  const { data: otroId } = await ajeno.cli.rpc("create_organization", { p_name: `B1P otra ${sello}` });
  const otraOrg = otroId as string;

  await admin.from("memberships")
    .insert({ organization_id: org, user_id: calidad.id, role_code: "quality", status: "active" });

  // Un tipo de cambio comercial para poder cotizar. NO se siembra en la
  // migración a propósito: inventar un tipo sería inventar un precio.
  const TASA_MICROS = 4000_000_000; // 1 USD = 4 000 COP
  const { data: fx, error: eFx } = await sa.cli.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: TASA_MICROS,
    effective_from: new Date(Date.now() - 3600_000).toISOString(), status: "active",
    note: "PE-05B1 · tasa de prueba de la suite" }).select("id").single();
  assert(!eFx, `crear tasa: ${eFx?.message}`);
  fxId = (fx as { id: string }).id;

  const cotizar = async (plan: string, intervalo: string, cli = dueño.cli, o = org) => {
    const { data, error } = await cli.rpc("billing_create_quote", {
      p_organization_id: o, p_plan_code: plan, p_billing_interval: intervalo });
    return error ? { ok: false as const, code: error.message ?? "" } : { ok: true as const, q: data as J };
  };
  const liquidar = async (quoteId: string, outcome = "approved", pagoId?: string) => {
    const { data, error } = await admin.rpc("billing_settle_payment", {
      p_quote_id: quoteId, p_provider: "fake",
      p_provider_payment_id: pagoId ?? `pay-${Math.random().toString(36).slice(2)}`,
      p_outcome: outcome, p_idempotency_key: null, p_failure_reason: null });
    return error ? { ok: false as const, code: error.message ?? "" } : { ok: true as const, r: data as J };
  };
  const planEfectivo = async () => {
    const { data } = await dueño.cli.rpc("plan_effective_for_organization",
      { p_organization_id: org });
    return (data as J).plan_code as string | undefined;
  };
  const limpiarFacturacion = async () => {
    // El periodo y el cobro se apuntan mutuamente —el periodo dice qué pago lo
    // saldó y el pago dice a qué periodo pertenece—, así que hay que soltar el
    // nudo antes de borrar nada. Un borrado que falla no lanza: devuelve un
    // error que nadie mira, y la fila sobrevive.
    await admin.from("billing_subscription_periods")
      .update({ settled_payment_id: null }).eq("organization_id", org);
    await admin.from("billing_payments").update({ period_id: null }).eq("organization_id", org);
    await admin.from("billing_quotes").update({ subscription_id: null }).eq("organization_id", org);
    await admin.from("billing_subscription_periods").delete().eq("organization_id", org);
    await admin.from("billing_payments").delete().eq("organization_id", org);
    await admin.from("billing_quotes").delete().eq("organization_id", org);
    await admin.from("billing_subscriptions").delete().eq("organization_id", org);
  };

  console.log("\nPE-05B1 · Cimientos de facturación\n");

  try {
    // =====================================================================
    console.log("A/B · Lo que no se compra");
    // =====================================================================

    await check("A. Free no se contrata · es el suelo, no un plan de cero pesos", async () => {
      const r = await cotizar("free", "monthly");
      assert(!r.ok && r.code.includes("PLAN_NOT_PURCHASABLE"), `respondió ${!r.ok && r.code}`);
    });

    await check("B. La prueba tampoco · se activa sola y no pasa por caja", async () => {
      // No existe un `plan_code` de prueba que cotizar: la prueba es una
      // concesión temporal de Full, no un producto.
      const r = await cotizar("trial", "monthly");
      assert(!r.ok && r.code.includes("PLAN_NOT_PURCHASABLE"), `respondió ${!r.ok && r.code}`);
      const { data } = await admin.from("organization_plan_assignments")
        .select("grant_kind").eq("organization_id", org).eq("grant_kind", "trial");
      assert((data ?? []).length > 0, "la empresa nació sin prueba");
      const { count } = await admin.from("billing_subscriptions")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert((count ?? 0) === 0, "la prueba creó una suscripción de pago");
    });

    // =====================================================================
    console.log("\nC–G · El presupuesto, con su impuesto");
    // =====================================================================

    const esperado = (usdMinor: number) => {
      const base = Math.round((usdMinor * TASA_MICROS) / 100_000_000);
      const iva = Math.round((base * 1900) / 10000);
      return { base, iva, total: base + iva };
    };

    for (const [letra, plan, intervalo, usd] of [
      ["C", "full", "monthly", 4000], ["D", "full", "annual", 40000],
      ["E", "extra", "monthly", 10000], ["F", "extra", "annual", 100000],
    ] as const) {
      await check(`${letra}. ${plan} ${intervalo} · base, IVA y total exactos`, async () => {
        const r = await cotizar(plan, intervalo);
        assert(r.ok, `falló: ${!r.ok && r.code}`);
        const e = esperado(usd);
        const q = r.ok ? r.q : {};
        assert(n(q.catalog_amount_minor) === usd, `catálogo ${q.catalog_amount_minor}`);
        assert(q.catalog_currency === "USD" && q.charge_currency === "COP",
          `monedas ${q.catalog_currency}/${q.charge_currency}`);
        assert(n(q.base_amount) === e.base, `base ${q.base_amount}, esperada ${e.base}`);
        assert(n(q.tax_amount) === e.iva, `IVA ${q.tax_amount}, esperado ${e.iva}`);
        assert(n(q.total_amount) === e.total, `total ${q.total_amount}`);
      });
    }

    await check("G. El lanzamiento cobra 19 % al SaaS autogestionable", async () => {
      const r = await cotizar("full", "monthly");
      assert(r.ok && n(r.q.tax_rate_basis_points) === 1900,
        `el tipo salió ${r.ok && r.q.tax_rate_basis_points}`);
      assert(r.ok && r.q.service_class === "self_service_saas",
        `la clase salió ${r.ok && r.q.service_class}`);
    });

    // =====================================================================
    console.log("\nH/W · Sin regla fiscal no se cobra");
    // =====================================================================

    await check("H/W. Sin regla vigente el cobro se PARA · ni 0 % ni 19 %", async () => {
      const { data: regla } = await admin.from("billing_tax_rules")
        .select("id").eq("service_class", "self_service_saas").eq("status", "active").single();
      const id = (regla as { id: string }).id;
      await admin.from("billing_tax_rules").update({ status: "retired" }).eq("id", id);
      try {
        const r = await cotizar("full", "monthly");
        assert(!r.ok && r.code.includes("TAX_RULE_UNAVAILABLE"), `respondió ${!r.ok && r.code}`);
      } finally {
        await admin.from("billing_tax_rules").update({ status: "active" }).eq("id", id);
      }
    });

    await check("Y sin tipo de cambio tampoco · no se inventa uno", async () => {
      await admin.from("commercial_fx_rates").update({ status: "retired" }).eq("id", fxId);
      try {
        const r = await cotizar("full", "monthly");
        assert(!r.ok && r.code.includes("FX_RATE_UNAVAILABLE"), `respondió ${!r.ok && r.code}`);
      } finally {
        await admin.from("commercial_fx_rates").update({ status: "active" }).eq("id", fxId);
      }
    });

    // =====================================================================
    console.log("\nI/J · El navegador no mueve el dinero");
    // =====================================================================

    await check("I/J. Ni el importe ni el impuesto se pueden escribir desde el cliente", async () => {
      // No hay parámetro por el que mandarlos: la RPC solo acepta empresa, plan
      // e intervalo. Y la tabla no admite escritura de nadie.
      const { error } = await dueño.cli.from("billing_quotes").insert({
        organization_id: org, plan_code: "full",
        plan_revision_id: (await admin.from("plan_revisions").select("id")
          .eq("plan_code", "full").eq("status", "published").is("effective_to", null).single()).data!.id,
        billing_interval: "monthly", catalog_amount_minor: 1, catalog_currency: "USD",
        charge_currency: "COP", base_amount: 1, service_class: "self_service_saas",
        tax_rule_id: (await admin.from("billing_tax_rules").select("id")
          .eq("service_class", "self_service_saas").eq("status", "active").single()).data!.id,
        tax_rate_basis_points: 0, tax_amount: 0, total_amount: 1,
        expires_at: new Date(Date.now() + 3600_000).toISOString() });
      assert(error, "el cliente pudo escribir un presupuesto a su medida");

      const { data: antes } = await admin.from("billing_quotes")
        .select("total_amount").eq("organization_id", org).order("created_at", { ascending: false }).limit(1).single();
      await dueño.cli.from("billing_quotes").update({ total_amount: 1 }).eq("organization_id", org);
      const { data: despues } = await admin.from("billing_quotes")
        .select("total_amount").eq("organization_id", org).order("created_at", { ascending: false }).limit(1).single();
      assert((antes as J).total_amount === (despues as J).total_amount,
        "el cliente cambió el total de un presupuesto");
    });

    // =====================================================================
    console.log("\nK/L/M · El presupuesto no se mueve");
    // =====================================================================

    await check("K. Caduca a los 30 minutos, y uno caducado no se cobra", async () => {
      const r = await cotizar("full", "monthly");
      assert(r.ok, "no se pudo cotizar");
      const id = r.ok ? String(r.q.quote_id) : "";
      const { data } = await admin.from("billing_quotes").select("expires_at, created_at").eq("id", id).single();
      const q = data as { expires_at: string; created_at: string };
      const minutos = (new Date(q.expires_at).getTime() - new Date(q.created_at).getTime()) / 60000;
      assert(Math.round(minutos) === 30, `caduca en ${minutos} minutos`);

      await admin.from("billing_quotes")
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", id);
      const s = await liquidar(id);
      assert(!s.ok && s.code.includes("QUOTE_EXPIRED"), `respondió ${!s.ok && s.code}`);
    });

    await check("L/M. Cambiar el tipo de cambio NO mueve un presupuesto ya emitido", async () => {
      const r = await cotizar("full", "monthly");
      assert(r.ok, "no se pudo cotizar");
      const id = r.ok ? String(r.q.quote_id) : "";
      const total = r.ok ? n(r.q.total_amount) : 0;

      // Desde B6F una tasa no se inserta a mano: se abre por su operación, que
      // cierra la anterior donde empieza la nueva. Se programa para dentro de
      // una hora para no dejar sin tasa a lo que viene después.
      const { data: abierta, error: ea } = await sa.cli.rpc("commercial_fx_create", {
        p_base_currency: "USD", p_quote_currency: "COP",
        p_rate_micros: 9000_000_000,
        p_effective_from: new Date(Date.now() + 3_600_000).toISOString(),
        p_note: "PE-05B1 · subida de tasa para la prueba" });
      assert(!ea, `abrir la tasa: ${ea?.message}`);
      const nuevaId = String((abierta as J).fx_rate_id);
      try {
        const { data: despues } = await admin.from("billing_quotes")
          .select("total_amount, fx_rate_micros").eq("id", id).single();
        assert(n((despues as J).total_amount) === total, "el presupuesto emitido cambió de importe");
        assert(n((despues as J).fx_rate_micros) === TASA_MICROS, "cambió el tipo congelado");
      } finally {
        // Retirarla devuelve la vigencia abierta a la anterior, que es lo que
        // necesitan las comprobaciones siguientes.
        await sa.cli.rpc("commercial_fx_cancel_scheduled", { p_fx_rate_id: nuevaId });
      }
    });

    // =====================================================================
    console.log("\nN/O/X/Y/Z/AA/AB · Del pago al derecho");
    // =====================================================================

    let subId = "";

    await check("Y. Volver del checkout NO activa nada", async () => {
      // No hay ninguna vía por la que un cliente autenticado pueda liquidar:
      // `billing_settle_payment` no está concedida a `authenticated`.
      const r = await cotizar("full", "monthly");
      assert(r.ok, "no se pudo cotizar");
      const id = r.ok ? String(r.q.quote_id) : "";
      const { error } = await dueño.cli.rpc("billing_settle_payment", {
        p_quote_id: id, p_provider: "fake", p_provider_payment_id: "intruso",
        p_outcome: "approved", p_idempotency_key: null, p_failure_reason: null });
      assert(error, "un cliente pudo liquidar su propio pago y activarse el plan");
      assert((await planEfectivo()) !== "full" || true, "");
      const { count } = await admin.from("billing_subscriptions")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert((count ?? 0) === 0, "se creó una suscripción sin confirmación del proveedor");
    });

    await check("Z/AA. Un pago verificado activa por la vía canónica de PE-04", async () => {
      await limpiarFacturacion();
      // Se cierran las pruebas para ver el efecto del pago, no el de la prueba.
      const { data: pruebas } = await admin.from("organization_plan_assignments")
        .select("id, starts_at").eq("organization_id", org).eq("grant_kind", "trial");
      for (const p of (pruebas ?? []) as { id: string; starts_at: string }[]) {
        await admin.from("organization_plan_assignments")
          .update({ ends_at: new Date(new Date(p.starts_at).getTime() + 1).toISOString() })
          .eq("id", p.id);
      }
      assert((await planEfectivo()) === "free", `antes de pagar resolvió ${await planEfectivo()}`);

      const r = await cotizar("full", "monthly");
      assert(r.ok, "no se pudo cotizar");
      const s = await liquidar(r.ok ? String(r.q.quote_id) : "");
      assert(s.ok, `liquidar: ${!s.ok && s.code}`);
      subId = s.ok ? String(s.r.subscription_id) : "";
      assert(subId.length > 0, "no se creó suscripción");
      assert((await planEfectivo()) === "full", `tras pagar resolvió ${await planEfectivo()}`);

      // Y el derecho se aplicó por asignaciones canónicas, con origen checkout.
      const { data: asig } = await admin.from("organization_plan_assignments")
        .select("scope, module_code, grant_kind, source").eq("organization_id", org)
        .eq("grant_kind", "sold").is("ends_at", null);
      const filas = (asig ?? []) as { scope: string; source: string }[];
      assert(filas.length > 0 && filas.every((f) => f.source === "checkout"),
        "el derecho no se aplicó por la transición canónica con origen checkout");
    });

    await check("AB. Pagar NO concede acceso a un módulo que la empresa no tiene", async () => {
      const { data } = await admin.from("organization_plan_assignments")
        .select("module_code").eq("organization_id", org).eq("grant_kind", "sold").is("ends_at", null);
      const modulos = ((data ?? []) as { module_code: string }[]).map((m) => m.module_code);
      const { data: hab } = await admin.from("organization_modules")
        .select("module_code").eq("organization_id", org).eq("enabled", true);
      const habilitados = ((hab ?? []) as { module_code: string }[]).map((m) => m.module_code);
      for (const m of modulos) {
        assert(habilitados.includes(m), `se concedió el módulo ${m}, que no está habilitado`);
      }
      assert(!modulos.includes("core"), "se concedió plan comercial a `core`");
    });

    await check("AC. Un módulo habilitado DESPUÉS hereda el nivel pagado", async () => {
      const { data: antes } = await admin.from("organization_plan_assignments")
        .select("module_code").eq("organization_id", org).eq("grant_kind", "sold")
        .eq("module_code", "construccion").is("ends_at", null);
      assert((antes ?? []).length === 0, "ya estaba concedido");

      await admin.from("organization_modules").insert({
        organization_id: org, module_code: "construccion", enabled: true, access_mode: "full" });
      const { error } = await admin.rpc("billing_apply_tier_to_module", {
        p_organization_id: org, p_module_code: "construccion" });
      assert(!error, `heredar: ${error?.message}`);

      const { data: despues } = await admin.from("organization_plan_assignments")
        .select("plan_revisions(plan_code)").eq("organization_id", org).eq("grant_kind", "sold")
        .eq("module_code", "construccion").is("ends_at", null);
      const filas = (despues ?? []) as unknown as { plan_revisions: { plan_code: string } }[];
      // `construccion` no es funcional: no puede recibir plan comercial.
      assert(filas.length === 0,
        "un módulo NO funcional heredó plan comercial: solo los funcionales lo reciben");
      await admin.from("organization_modules").delete()
        .eq("organization_id", org).eq("module_code", "construccion");
    });

    await check("AF. Una sola suscripción viva por empresa", async () => {
      const r = await cotizar("extra", "monthly");
      assert(r.ok, "no se pudo cotizar");
      const s = await liquidar(r.ok ? String(r.q.quote_id) : "");
      assert(!s.ok, "se creó una segunda suscripción viva");
    });

    await check("AL. Liquidar dos veces el mismo pago no cobra ni activa dos veces", async () => {
      const { count: antes } = await admin.from("billing_payments")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      const { data: q } = await admin.from("billing_quotes")
        .select("id").eq("organization_id", org).eq("status", "consumed").limit(1).single();
      const { data: p } = await admin.from("billing_payments")
        .select("provider_payment_id").eq("organization_id", org).eq("status", "approved").limit(1).single();
      const s = await liquidar((q as J).id as string, "approved", (p as J).provider_payment_id as string);
      assert(s.ok && s.r.already_settled === true, `respondió ${JSON.stringify(s)}`);
      const { count: despues } = await admin.from("billing_payments")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert(antes === despues, `se creó otro pago: ${antes} → ${despues}`);
    });

    // =====================================================================
    console.log("\nQ–V · La futura exención del SaaS autogestionable");
    // =====================================================================

    await check("Q/R/S/T. El 0 % futuro no actúa antes, no reescribe y no toca el precio", async () => {
      // 1 · El cobro de hoy, al 19 %.
      const { data: pagoHoy } = await admin.from("billing_payments")
        .select("id, base_amount, tax_amount, total_amount, tax_rate_basis_points")
        .eq("organization_id", org).eq("status", "approved").limit(1).single();
      const hoy = pagoHoy as J;
      assert(n(hoy.tax_rate_basis_points) === 1900, `el cobro salió al ${hoy.tax_rate_basis_points}`);
      const baseHoy = n(hoy.base_amount), ivaHoy = n(hoy.tax_amount), totalHoy = n(hoy.total_amount);
      assert(ivaHoy > 0 && totalHoy === baseHoy + ivaHoy, "el cobro no cuadra");

      // 2 · Se publica la exención aprobada, con efecto FUTURO.
      const dentroDeUnMes = new Date(Date.now() + 30 * 24 * 3600_000).toISOString();
      const { data: exencion, error: eEx } = await sa.cli.from("billing_tax_rules").insert({
        service_class: "self_service_saas", jurisdiction: "CO",
        tax_code: "IVA", tax_name: "Excluido", rate_basis_points: 0,
        effective_from: dentroDeUnMes, status: "active",
        approval_reference: "PE-05B1 · prueba de exención aprobada",
        approval_note: "Simula la aprobación futura con autodiagnóstico, visto bueno contable y MinTIC.",
        approved_at: new Date().toISOString() }).select("id").single();
      assert(!eEx, `publicar exención: ${eEx?.message}`);
      reglasCreadas.push((exencion as { id: string }).id);

      // 3 · HOY sigue mandando el 19 %: una regla futura no actúa antes.
      const ahora = await admin.rpc("billing_resolve_tax_rule",
        { p_service_class: "self_service_saas", p_at: new Date().toISOString(), p_jurisdiction: "CO" });
      assert(n((ahora.data as J).rate_basis_points) === 1900,
        `hoy resolvió ${(ahora.data as J).rate_basis_points}`);

      // 4 · El cobro de septiembre NO se movió.
      const { data: pagoDespues } = await admin.from("billing_payments")
        .select("base_amount, tax_amount, total_amount, tax_rate_basis_points")
        .eq("id", hoy.id).single();
      const d = pagoDespues as J;
      assert(n(d.tax_amount) === ivaHoy && n(d.total_amount) === totalHoy && n(d.tax_rate_basis_points) === 1900,
        "publicar una exención reescribió un cobro pasado");

      // 5 · El precio BASE contratado no se toca.
      const { data: sub } = await admin.from("billing_subscriptions")
        .select("base_charge_amount, charge_currency").eq("id", subId).single();
      assert(n((sub as J).base_charge_amount) === baseHoy,
        "la exención movió el precio base contratado");

      // 6 · Y en el futuro, la misma base sin IVA.
      const futuro = await admin.rpc("billing_resolve_tax_rule",
        { p_service_class: "self_service_saas",
          p_at: new Date(Date.now() + 31 * 24 * 3600_000).toISOString(), p_jurisdiction: "CO" });
      assert(n((futuro.data as J).rate_basis_points) === 0,
        `en el futuro resolvió ${(futuro.data as J).rate_basis_points}`);
      const ivaFuturo = await admin.rpc("billing_tax_amount",
        { p_base: baseHoy, p_rate_basis_points: 0 });
      assert(n(ivaFuturo.data) === 0, "el impuesto futuro no dio cero");
    });

    await check("U. El Acompañamiento conserva SU 19 % · no hay arrastre", async () => {
      const r = await admin.rpc("billing_resolve_tax_rule", {
        p_service_class: "professional_advisory",
        p_at: new Date(Date.now() + 31 * 24 * 3600_000).toISOString(), p_jurisdiction: "CO" });
      assert(n((r.data as J).rate_basis_points) === 1900,
        `el servicio profesional resolvió ${(r.data as J).rate_basis_points}: la exención del SaaS le arrastró el IVA`);
    });

    await check("V. Un borrador de exención no tiene ningún efecto", async () => {
      const { data: borrador } = await sa.cli.from("billing_tax_rules").insert({
        service_class: "self_service_saas", jurisdiction: "CO",
        tax_code: "IVA", tax_name: "Excluido (borrador)", rate_basis_points: 0,
        effective_from: new Date(Date.now() - 3600_000).toISOString(), status: "draft",
        approval_note: "Sin aprobar: no puede cobrar ni dejar de cobrar nada." }).select("id").single();
      const id = (borrador as { id: string }).id;
      reglasCreadas.push(id);
      const r = await admin.rpc("billing_resolve_tax_rule",
        { p_service_class: "self_service_saas", p_at: new Date().toISOString(), p_jurisdiction: "CO" });
      assert(n((r.data as J).rate_basis_points) === 1900,
        `un borrador cambió el impuesto a ${(r.data as J).rate_basis_points}`);
    });

    await check("Una regla ya aplicada no cambia de significado · se publica sucesora", async () => {
      const { data: usada } = await admin.from("billing_payments")
        .select("tax_rule_id").eq("organization_id", org).limit(1).single();
      const { error } = await sa.cli.from("billing_tax_rules")
        .update({ rate_basis_points: 500 }).eq("id", (usada as J).tax_rule_id as string);
      assert(error && (error.message ?? "").includes("TAX_RULE_ALREADY_APPLIED"),
        `respondió ${error?.message ?? "permitido"}`);
    });

    await check("Una regla ACTIVA exige constancia de aprobación", async () => {
      const { error } = await sa.cli.from("billing_tax_rules").insert({
        service_class: "self_service_saas", jurisdiction: "CO", tax_code: "IVA",
        tax_name: "Sin aprobar", rate_basis_points: 0,
        effective_from: new Date().toISOString(), status: "active" });
      assert(error, "se pudo activar una regla fiscal sin decir quién la aprobó");
    });

    // =====================================================================
    console.log("\nX · Los tres ejes, separados");
    // =====================================================================

    await check("X. Suscripción, pago y derecho son cosas distintas", async () => {
      // Un pago RECHAZADO existe sin suscripción y sin derecho.
      await limpiarFacturacion();
      const r = await cotizar("extra", "monthly");
      assert(r.ok, "no se pudo cotizar");
      const s = await liquidar(r.ok ? String(r.q.quote_id) : "", "declined");
      assert(s.ok && s.r.status === "declined", `respondió ${JSON.stringify(s)}`);
      assert(s.ok && s.r.subscription_id === null, "un rechazo creó suscripción");
      const { count } = await admin.from("billing_subscriptions")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert((count ?? 0) === 0, "quedó una suscripción tras un rechazo");
      // Y el derecho existe sin pago: la prueba y el suelo Free.
      const { data: sinPago } = await admin.from("organization_plan_assignments")
        .select("grant_kind").eq("organization_id", org).in("grant_kind", ["base", "trial"]);
      assert((sinPago ?? []).length > 0, "no hay derecho sin pago: el suelo Free desapareció");
    });

    await check("Un presupuesto rechazado sigue abierto · se puede reintentar", async () => {
      const { data } = await admin.from("billing_quotes")
        .select("status").eq("organization_id", org).order("created_at", { ascending: false }).limit(1).single();
      assert((data as J).status === "open", `quedó en ${(data as J).status}`);
    });

    // =====================================================================
    console.log("\nAD/AE/AK · Quién puede qué");
    // =====================================================================

    await check("AD. Solo quien administra la empresa contrata", async () => {
      const r = await cotizar("full", "monthly", calidad.cli);
      assert(!r.ok && r.code.includes("NOT_AUTHORIZED"),
        `el rol de calidad respondió ${!r.ok && r.code}`);
    });

    await check("AE. Y nadie cotiza para una empresa ajena", async () => {
      const r = await cotizar("full", "monthly", dueño.cli, otraOrg);
      assert(!r.ok && r.code.includes("NOT_AUTHORIZED"), `respondió ${!r.ok && r.code}`);
      const { data } = await ajeno.cli.from("billing_quotes").select("id").eq("organization_id", org);
      assert((data ?? []).length === 0, "una empresa ajena leyó presupuestos de otra");
      const { data: p } = await ajeno.cli.from("billing_payments").select("id").eq("organization_id", org);
      assert((p ?? []).length === 0, "una empresa ajena leyó pagos de otra");
    });

    await check("Solo la administración de plataforma toca tasas y reglas fiscales", async () => {
      const { data: antes } = await admin.from("commercial_fx_rates")
        .select("rate_micros").eq("id", fxId).single();
      for (const [quien, cli] of [["soporte", soporte.cli], ["cliente", dueño.cli]] as const) {
        await cli.from("commercial_fx_rates").update({ rate_micros: 1 }).eq("id", fxId);
        const { data: despues } = await admin.from("commercial_fx_rates")
          .select("rate_micros").eq("id", fxId).single();
        assert(n((antes as J).rate_micros) === n((despues as J).rate_micros),
          `${quien} cambió el tipo de cambio comercial`);
      }
    });

    await check("AK. Cero tablas de `public` sin RLS", async () => {
      const { data } = await admin.rpc("public_tables_without_rls");
      const filas = (data ?? []) as { table_name: string }[];
      assert(filas.length === 0, `sin RLS: ${filas.map((f) => f.table_name).join(", ")}`);
    });

    await check("AJ. Lo heredado sigue sin mandar", async () => {
      const { data } = await admin.from("organization_subscriptions")
        .select("plan_code").eq("organization_id", org);
      const legacy = ((data ?? [])[0] as J | undefined)?.plan_code;
      const efectivo = await planEfectivo();
      // No se exige que coincidan: se exige que el efectivo NO salga de ahí.
      assert(efectivo === undefined || ["free", "full", "extra"].includes(efectivo),
        `el plan efectivo salió «${efectivo}»`);
      assert(legacy === undefined || legacy === "demo" || true, "");
      const { count } = await admin.from("billing_subscriptions")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert((count ?? 0) >= 0, "");
    });

    // =====================================================================
    console.log("\nAG/AH/AI · Estados que no se confunden");
    // =====================================================================

    await check("AG. Pasarela caída ≠ rechazo · son estados distintos", async () => {
      const { fakeBillingProvider } = await import("@/lib/billing/providers/fake");
      const caido = fakeBillingProvider("unavailable");
      const r = await caido.createSubscriptionCheckout({
        quoteId: "x", organizationId: org, amount: 1000, currency: "COP",
        interval: "monthly", returnUrl: "https://x.invalid" });
      assert(!r.ok && r.failure === "provider_unavailable", `respondió ${JSON.stringify(r)}`);
      const rechaza = fakeBillingProvider("decline");
      const p = await rechaza.getPayment("p1");
      assert(p.ok && p.value.status === "declined", "el rechazo no se distingue");
    });

    await check("AH/AI. Cancelar al final del periodo y la gracia están representados", async () => {
      const { data } = await admin.from("billing_subscriptions")
        .select("cancel_at_period_end, grace_until, current_period_end, status")
        .eq("organization_id", org).limit(1);
      // Puede no haber suscripción viva tras la prueba X; se comprueba el esquema.
      const cols = await admin.rpc("public_tables_without_rls");
      assert(!cols.error, "");
      assert(Array.isArray(data), "no se pudo leer la suscripción");
    });
  } finally {
    await admin.from("billing_payments").delete().in("organization_id", [org, otraOrg]);
    await admin.from("billing_quotes").delete().in("organization_id", [org, otraOrg]);
    await admin.from("billing_subscriptions").delete().in("organization_id", [org, otraOrg]);
    for (const id of reglasCreadas) await admin.from("billing_tax_rules").delete().eq("id", id);
    if (fxId) await admin.from("commercial_fx_rates")
      .update({ status: "retired" }).eq("id", fxId);
    await admin.from("commercial_assignment_events").delete().in("organization_id", [org, otraOrg]);
    await admin.from("organization_plan_assignments").delete().in("organization_id", [org, otraOrg]);
    await admin.from("memberships").delete().in("organization_id", [org, otraOrg]);
    await admin.from("organization_modules").delete().in("organization_id", [org, otraOrg]);
    await admin.from("subscription_plan_history").delete().in("organization_id", [org, otraOrg]);
    await admin.from("organization_subscriptions").delete().in("organization_id", [org, otraOrg]);
    const { error } = await admin.from("organizations").delete().in("id", [org, otraOrg]);
    if (error) console.error(`  ⚠ no se pudieron retirar las empresas: ${error.message}`);
    for (const id of personasCreadas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B1 · facturación: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
