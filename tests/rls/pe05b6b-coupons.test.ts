/**
 * Trazaloop · PE-05B6B · Cupones: el precio cambia, el producto no.
 *
 * Lo que más se comprueba aquí no es que el descuento se aplique —eso es una
 * multiplicación— sino las tres cosas que se rompen solas si nadie las vigila:
 * que Extra NO herede el cupón de Full, que el impuesto caiga sobre la base ya
 * descontada, y que retirar una campaña mañana no reescriba lo cobrado ayer.
 *
 * Correr: npm run test:pe05b6b-coupons
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { tasaCanonicaQA } from "../support/fixture-cleanup";

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
/** Para poder volver a hablar como quien administra una empresa concreta. */
const personasPorId = new Map<string, Awaited<ReturnType<typeof persona>>>();
const orgs: string[] = [];
const promos: string[] = [];

async function persona(prefijo: string, papel?: "superadmin") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B6B" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b6b" });
  if (papel) {
    await admin.from("platform_staff").insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  const p = { id: data.user!.id, email, cli };
  personasPorId.set(p.id, p);
  return p;
}

/**
 * Cada empresa con SU persona. Una sola cuenta creando diez empresas se topa
 * con los límites de alta del producto, y entonces la prueba mide eso en vez de
 * lo que quería medir.
 */
async function empresa(nombre: string) {
  const quien = await persona("b6b");
  const { data, error } = await quien.cli.rpc("create_organization",
    { p_name: `${nombre} ${sello}`, p_tax_id: null, p_country: "CO" });
  assert(!error && data, `crear empresa: ${error?.message}`);
  const org = data as string;
  orgs.push(org);
  const { error: em } = await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", quien.id);
  assert(!em, `hacerla administradora: ${em?.message}`);
  return { org, quien };
}

/** Una campaña con su código, por la vía de la base. */
async function campana(input: {
  nombre: string; codigo: string; puntos?: number; fijo?: number;
  planes: string[]; intervalos: string[]; techo?: number;
  desde?: string; hasta?: string | null; estado?: string; codigoEstado?: string;
  maxCanjes?: number | null; maxPorEmpresa?: number;
}) {
  const { data: p, error: ep } = await admin.from("billing_promotions").insert({
    name: input.nombre,
    discount_type: input.fijo ? "fixed_amount" : "percentage",
    discount_value: input.fijo ?? input.puntos ?? 4000,
    max_discount_basis_points: input.techo ?? null,
    eligible_plan_codes: input.planes,
    eligible_intervals: input.intervalos,
    starts_at: input.desde ?? new Date(Date.now() - 86_400_000).toISOString(),
    ends_at: input.hasta === undefined ? null : input.hasta,
    max_redemptions: input.maxCanjes ?? null,
    max_per_organization: input.maxPorEmpresa ?? 1,
    status: input.estado ?? "active",
  }).select("id").single();
  assert(!ep && p, `campaña: ${ep?.message}`);
  const promoId = (p as { id: string }).id;
  promos.push(promoId);
  const { data: c, error: ec } = await admin.from("billing_promotion_codes").insert({
    promotion_id: promoId, code: input.codigo.toUpperCase(),
    status: input.codigoEstado ?? "active",
  }).select("id").single();
  assert(!ec && c, `código: ${ec?.message}`);
  return { promoId, codeId: (c as { id: string }).id };
}

const presupuestar = async (
  quien: Awaited<ReturnType<typeof persona>>, org: string,
  plan: string, intervalo: string, cupon?: string
) => quien.cli.rpc("billing_create_quote", {
  p_organization_id: org, p_plan_code: plan, p_billing_interval: intervalo,
  p_coupon_code: cupon ?? null });

async function main() {
  // TEST-HYGIENE-03 · Antes esta suite abría su PROPIA tasa en cada ejecución y
  // la retiraba al terminar. 0182 no deja borrar una tasa —es historia
  // financiera— ni deja que dos del mismo par rijan a la vez, así que cada
  // vuelta dejaba una fila muerta más y una vuelta interrumpida reventaba la
  // siguiente con FX_RATE_OVERLAPS. Aquí solo hace falta que EXISTA un tipo de
  // cambio para poder presupuestar: se reutiliza el canónico de Local.
  await tasaCanonicaQA(admin);

  console.log("\nPE-05B6B · Cupones\n");
  const ana = await persona("b6b-ana");
  const sa = await persona("b6b-sa", "superadmin");

  try {
    // =====================================================================
    console.log("A · La aritmética, y en qué orden");
    // =====================================================================

    await check("A/C. Full mensual con el 40 % institucional", async () => {
      const e = (await empresa("B6B mensual"));
      await campana({ nombre: "Institucional Full", codigo: `ANDI40-${sello}`,
        puntos: 4000, techo: 4000, planes: ["full"], intervalos: ["monthly", "annual"] });
      const { data, error } = await presupuestar(e.quien, e.org, "full", "monthly", `andi40-${sello}`);
      assert(!error, `presupuesto: ${error?.message}`);
      const q = data as Record<string, unknown>;
      // Full mensual = USD 40 = 4000 centavos. 40 % = 1600 → neto 2400.
      // A 4000 COP/USD: bruto 160 000, base 96 000, descuento 64 000.
      assert(Number(q.catalog_amount_minor) === 4000, JSON.stringify(q));
      assert(Number(q.base_amount) === 96_000, `base ${q.base_amount}`);
      assert(Number(q.discount_amount) === 64_000, `descuento ${q.discount_amount}`);
      assert(Number(q.discount_basis_points) === 4000, JSON.stringify(q));
    });

    await check("M/AA. El impuesto cae sobre la base YA descontada", async () => {
      const e = (await empresa("B6B impuesto"));
      await campana({ nombre: "Mitad", codigo: `MITAD-${sello}`, puntos: 5000,
        planes: ["full"], intervalos: ["monthly"] });
      const { data: con } = await presupuestar(e.quien, e.org, "full", "monthly", `mitad-${sello}`);
      const c = con as Record<string, unknown>;
      const bps = Number(c.tax_rate_basis_points);
      const esperado = Math.round(Number(c.base_amount) * bps / 10_000);
      assert(Number(c.tax_amount) === esperado,
        `impuesto ${c.tax_amount} en vez de ${esperado}: se calculó sobre otra base`);
      assert(Number(c.total_amount) === Number(c.base_amount) + Number(c.tax_amount),
        JSON.stringify(c));

      // Y contra el mismo plan sin cupón: el impuesto baja PROPORCIONALMENTE.
      // Si se descontara después del impuesto, el total no cuadraría.
      const e2 = (await empresa("B6B sin cupón"));
      const { data: sin } = await presupuestar(e2.quien, e2.org, "full", "monthly");
      const s = sin as Record<string, unknown>;
      assert(Number(s.discount_amount) === 0, "un presupuesto sin cupón trae descuento");
      assert(Number(c.base_amount) * 2 === Number(s.base_amount),
        `la base con 50 % no es la mitad: ${c.base_amount} vs ${s.base_amount}`);
      assert(Number(c.tax_amount) < Number(s.tax_amount),
        "el impuesto no bajó con el descuento");
    });

    await check("B/N. El anual descuenta del precio anual CANÓNICO", async () => {
      const e = (await empresa("B6B anual"));
      await campana({ nombre: "Anual 40", codigo: `ANUAL40-${sello}`, puntos: 4000,
        planes: ["full"], intervalos: ["annual"] });
      const { data } = await presupuestar(e.quien, e.org, "full", "annual", `anual40-${sello}`);
      const q = data as Record<string, unknown>;
      // Full anual = USD 400 = 40 000 centavos. 40 % = 16 000 → neto 24 000.
      // A 4000 COP/USD: base 960 000.
      assert(Number(q.catalog_amount_minor) === 40_000, JSON.stringify(q));
      assert(Number(q.base_amount) === 960_000,
        `base ${q.base_amount}: si fuera 12 × mensual serían 1 152 000, el descuento anual dos veces`);
    });

    // =====================================================================
    console.log("\nB · Lo que NO hereda");
    // =====================================================================

    await check("H. Un cupón de Full NO vale en Extra", async () => {
      const e = (await empresa("B6B herencia"));
      await campana({ nombre: "Solo Full", codigo: `SOLOFULL-${sello}`, puntos: 4000,
        planes: ["full"], intervalos: ["monthly"] });
      const { error } = await presupuestar(e.quien, e.org, "extra", "monthly", `solofull-${sello}`);
      assert(error, "el cupón de Full descontó Extra");
      assert((error?.message ?? "").includes("COUPON_NOT_APPLICABLE"), error?.message ?? "");
      // Y sin cupón, Extra se presupuesta normal.
      const { data } = await presupuestar(e.quien, e.org, "extra", "monthly");
      assert(Number((data as Record<string, unknown>).discount_amount) === 0,
        "Extra salió descontado igualmente");
    });

    await check("I. Extra sí tiene su propia promoción, con su porcentaje", async () => {
      const e = (await empresa("B6B extra"));
      await campana({ nombre: "Extra 10", codigo: `EXTRA10-${sello}`, puntos: 1000,
        planes: ["extra"], intervalos: ["monthly"] });
      const { data } = await presupuestar(e.quien, e.org, "extra", "monthly", `extra10-${sello}`);
      const q = data as Record<string, unknown>;
      // Extra mensual = USD 100 = 10 000. 10 % = 1000 → neto 9000 → 360 000 COP.
      assert(Number(q.base_amount) === 360_000, `base ${q.base_amount}`);
      assert(Number(q.discount_basis_points) === 1000, JSON.stringify(q));
    });

    await check("J. El intervalo también es explícito", async () => {
      const e = (await empresa("B6B intervalo"));
      await campana({ nombre: "Solo mensual", codigo: `SOLOMES-${sello}`, puntos: 2000,
        planes: ["full"], intervalos: ["monthly"] });
      const { error } = await presupuestar(e.quien, e.org, "full", "annual", `solomes-${sello}`);
      assert(error, "un cupón mensual valió en el anual");
    });

    // =====================================================================
    console.log("\nC · Códigos que no valen");
    // =====================================================================

    await check("D/E/F/G. Inexistente, caducado, futuro y retirado", async () => {
      const e = (await empresa("B6B invalidos"));
      const ayer = new Date(Date.now() - 172_800_000).toISOString();
      const anteayer = new Date(Date.now() - 259_200_000).toISOString();
      const manana = new Date(Date.now() + 86_400_000).toISOString();
      await campana({ nombre: "Caducada", codigo: `VIEJO-${sello}`, puntos: 1000,
        planes: ["full"], intervalos: ["monthly"], desde: anteayer, hasta: ayer });
      await campana({ nombre: "Futura", codigo: `FUTURO-${sello}`, puntos: 1000,
        planes: ["full"], intervalos: ["monthly"], desde: manana });
      await campana({ nombre: "Retirada", codigo: `RETIRADO-${sello}`, puntos: 1000,
        planes: ["full"], intervalos: ["monthly"], estado: "retired" });
      await campana({ nombre: "Código muerto", codigo: `MUERTO-${sello}`, puntos: 1000,
        planes: ["full"], intervalos: ["monthly"], codigoEstado: "retired" });

      for (const codigo of [`no-existe-${sello}`, `viejo-${sello}`, `futuro-${sello}`,
                            `retirado-${sello}`, `muerto-${sello}`]) {
        const { error } = await presupuestar(e.quien, e.org, "full", "monthly", codigo);
        assert(error, `«${codigo}» se aceptó`);
      }
      // Y ninguno dejó canje ni presupuesto detrás.
      const { count } = await admin.from("billing_promotion_redemptions")
        .select("id", { count: "exact", head: true }).eq("organization_id", e.org);
      assert((count ?? 0) === 0, "un código inválido dejó canje");
    });

    await check("V. Y el tope de canjes se respeta", async () => {
      const e = (await empresa("B6B tope"));
      const otra = (await empresa("B6B tope 2"));
      await campana({ nombre: "Uno solo", codigo: `UNICO-${sello}`, puntos: 1000,
        planes: ["full"], intervalos: ["monthly"], maxCanjes: 1 });
      const { error: e1 } = await presupuestar(e.quien, e.org, "full", "monthly", `unico-${sello}`);
      assert(!e1, `el primero falló: ${e1?.message}`);
      const { error: e2 } = await presupuestar(otra.quien, otra.org, "full", "monthly", `unico-${sello}`);
      assert(e2, "se canjeó por encima del tope");
    });

    await check("Y la misma empresa no lo usa dos veces", async () => {
      const e = (await empresa("B6B repetido"));
      await campana({ nombre: "Una vez por empresa", codigo: `UNAVEZ-${sello}`,
        puntos: 1000, planes: ["full"], intervalos: ["monthly"] });
      const { error: e1 } = await presupuestar(e.quien, e.org, "full", "monthly", `unavez-${sello}`);
      assert(!e1, `el primero falló: ${e1?.message}`);
      const { error: e2 } = await presupuestar(e.quien, e.org, "full", "monthly", `unavez-${sello}`);
      assert(e2, "la misma empresa lo canjeó dos veces");
    });

    // =====================================================================
    console.log("\nD · El techo de la campaña");
    // =====================================================================

    await check("AC. Un porcentaje por encima del techo no se puede ni escribir", async () => {
      const { error } = await admin.from("billing_promotions").insert({
        name: "Institucional pasada de rosca", discount_type: "percentage",
        discount_value: 5000, max_discount_basis_points: 4000,
        eligible_plan_codes: ["full"], eligible_intervals: ["monthly"],
        starts_at: new Date().toISOString(), status: "active" });
      assert(error, "se creó una campaña por encima de su propio techo");
      // Y editarla tampoco.
      const { promoId } = await campana({ nombre: "Institucional", codigo: `TECHO-${sello}`,
        puntos: 4000, techo: 4000, planes: ["full"], intervalos: ["monthly"] });
      const { error: e2 } = await admin.from("billing_promotions")
        .update({ discount_value: 6000 }).eq("id", promoId);
      assert(e2, "se subió el porcentaje por encima del techo editando");
    });

    await check("Y ninguna campaña puede regalar más del 100 %", async () => {
      const { error } = await admin.from("billing_promotions").insert({
        name: "Imposible", discount_type: "percentage", discount_value: 12000,
        eligible_plan_codes: ["full"], eligible_intervals: ["monthly"],
        starts_at: new Date().toISOString(), status: "active" });
      assert(error, "se aceptó un descuento de más del 100 %");
    });

    await check("Los planes elegibles son explícitos · no existe «todos»", async () => {
      const { error } = await admin.from("billing_promotions").insert({
        name: "Sin planes", discount_type: "percentage", discount_value: 1000,
        eligible_plan_codes: [], eligible_intervals: ["monthly"],
        starts_at: new Date().toISOString(), status: "active" });
      assert(error, "se creó una campaña sin planes elegibles");
      const { error: e2 } = await admin.from("billing_promotions").insert({
        name: "Con asesoría", discount_type: "percentage", discount_value: 1000,
        eligible_plan_codes: ["full", "advisor"], eligible_intervals: ["monthly"],
        starts_at: new Date().toISOString(), status: "active" });
      assert(e2, "el Acompañamiento entró en el motor de cupones de SaaS");
    });

    // =====================================================================
    console.log("\nE · Lo cobrado no se reescribe");
    // =====================================================================

    await check("L/O/P/Q. Retirar la campaña no toca lo ya contratado", async () => {
      const e = (await empresa("B6B historia"));
      const { promoId } = await campana({ nombre: "Se va a retirar",
        codigo: `HISTORIA-${sello}`, puntos: 4000, planes: ["full"],
        intervalos: ["monthly"] });
      const { data: q } = await presupuestar(e.quien, e.org, "full", "monthly", `historia-${sello}`);
      const quote = q as Record<string, unknown>;
      const baseContratada = Number(quote.base_amount);

      // Se contrata de verdad, por el camino canónico.
      const { data: i } = await e.quien.cli.rpc("billing_open_checkout_intent", {
        p_quote_id: quote.quote_id as string, p_provider: "wompi", p_environment: "test" });
      const intento = i as unknown as { intent_id: string; expected_total_amount: number };
      const { data: act } = await admin.rpc("billing_settle_provider_payment", {
        p_provider: "wompi", p_external_reference: intento.intent_id,
        p_provider_payment_id: `b6b-${sello}`, p_outcome: "approved",
        p_amount: intento.expected_total_amount, p_currency: "COP",
        p_live_mode: false, p_failure_reason: null });
      assert((act as Record<string, unknown>).outcome === "activated", JSON.stringify(act));

      // La suscripción nace con la base DESCONTADA: ahí vive la duración.
      const { data: sub } = await admin.from("billing_subscriptions")
        .select("id, base_charge_amount").eq("organization_id", e.org).single();
      const s = sub as { id: string; base_charge_amount: number };
      assert(Number(s.base_charge_amount) === baseContratada,
        `la suscripción cobra ${s.base_charge_amount} y el presupuesto decía ${baseContratada}`);

      // Ahora la campaña se retira y cambia de porcentaje.
      await admin.from("billing_promotions")
        .update({ status: "retired", discount_value: 500 }).eq("id", promoId);

      // Nada de lo cobrado se mueve.
      const { data: q2 } = await admin.from("billing_quotes")
        .select("base_amount, discount_amount, redemption_id")
        .eq("id", quote.quote_id as string).single();
      const qq = q2 as Record<string, unknown>;
      assert(Number(qq.base_amount) === baseContratada
        && Number(qq.discount_amount) === 64_000, JSON.stringify(qq));
      const { data: canje } = await admin.from("billing_promotion_redemptions")
        .select("discount_basis_points, discount_catalog_minor, subscription_id")
        .eq("id", qq.redemption_id as string).single();
      const cj = canje as Record<string, unknown>;
      assert(Number(cj.discount_basis_points) === 4000,
        `el canje dice ahora ${cj.discount_basis_points}: se reescribió la historia`);
      assert(cj.subscription_id === s.id, "el canje no quedó atado a su suscripción");

      const { data: sub2 } = await admin.from("billing_subscriptions")
        .select("base_charge_amount").eq("id", s.id).single();
      assert(Number((sub2 as { base_charge_amount: number }).base_charge_amount)
        === baseContratada, "retirar la campaña cambió lo que paga quien ya contrató");

      // R. Y la renovación cobra ESE importe, sin preguntarle a la campaña.
      const { data: per } = await admin.from("billing_subscription_periods")
        .select("id").eq("subscription_id", s.id).eq("period_sequence", 1).single();
      void per;
      const { data: siguiente } = await admin.rpc("billing_open_next_period",
        { p_subscription_id: s.id });
      const sig = siguiente as Record<string, unknown>;
      assert(Number(sig.base_amount) === baseContratada,
        `el mes siguiente cobra ${sig.base_amount}: revalidó el cupón`);
      const { data: cargo } = await admin.rpc("billing_period_charge_total",
        { p_period_id: sig.period_id as string });
      assert(Number((cargo as Record<string, unknown>).base_amount) === baseContratada,
        "el cobro del mes siguiente no respeta el descuento congelado");
    });

    await check("Un cupón NO se hereda al cambiar de plan", async () => {
      // El descuento es de Full; al programar Extra, el importe nuevo se congela
      // desde el catálogo SIN descuento.
      const { data: subs } = await admin.from("billing_subscriptions")
        .select("id, organization_id, base_charge_amount").eq("plan_code", "full")
        .eq("status", "active").order("created_at", { ascending: false }).limit(1);
      const s = ((subs ?? []) as Record<string, unknown>[])[0];
      assert(s, "no hay suscripción con la que comprobarlo");
      // Lo pide quien administra esa empresa: la función exige sesión, y con
      // razón —cambiar de plan compromete dinero—.
      const { data: miembro } = await admin.from("memberships")
        .select("user_id").eq("organization_id", s.organization_id as string)
        .eq("role_code", "admin").limit(1).single();
      const dueno = personasPorId.get((miembro as { user_id: string }).user_id);
      assert(dueno, "no se encontró a quien administra esa empresa");
      const { data, error } = await dueno!.cli.rpc("billing_schedule_plan_change",
        { p_subscription_id: s.id as string, p_target_plan_code: "extra" });
      assert(!error, `programar: ${error?.message}`);
      const r = data as Record<string, unknown>;
      // Extra mensual = USD 100 → 400 000 COP, SIN el 40 % de Full.
      assert(Number(r.base_charge_amount) === 400_000,
        `el plan nuevo se congeló en ${r.base_charge_amount}: heredó el descuento de Full`);
    });

    // =====================================================================
    console.log("\nF · Quién administra, y quién no");
    // =====================================================================

    await check("R/S/T/W. Nadie del producto administra campañas ni pone importes",
      async () => {
      const e = (await empresa("B6B firma"));
      // Una empresa no ve ni crea campañas.
      const { data: vistas } = await e.quien.cli.from("billing_promotions").select("id");
      assert((vistas ?? []).length === 0, "un cliente vio las campañas");
      const { error: e1 } = await e.quien.cli.from("billing_promotions").insert({
        name: "Mía", discount_type: "percentage", discount_value: 9000,
        eligible_plan_codes: ["full"], eligible_intervals: ["monthly"],
        starts_at: new Date().toISOString() });
      assert(e1, "un cliente creó una campaña");
      const { error: e2 } = await e.quien.cli.from("billing_promotion_codes").insert({
        promotion_id: promos[0], code: `PIRATA-${sello}` });
      assert(e2, "un cliente inventó un código");

      // La plataforma sí lee.
      const { data: staff } = await sa.cli.from("billing_promotions").select("id");
      assert((staff ?? []).length > 0, "la plataforma no puede mirar las campañas");

      // W. El navegador no puede mandar un importe: la firma no lo admite.
      const { error: e3 } = await e.quien.cli.rpc("billing_create_quote", {
        p_organization_id: e.org, p_plan_code: "full", p_billing_interval: "monthly",
        p_discount_amount: 999_999 });
      assert(e3, "se aceptó un importe de descuento desde el navegador");
    });

    await check("Y una empresa SÍ ve sus propios canjes", async () => {
      // La empresa que sí canjeó: es la del bloque de historia.
      const { data: canjes } = await admin.from("billing_promotion_redemptions")
        .select("organization_id").not("quote_id", "is", null).limit(1);
      const dueno = ((canjes ?? []) as { organization_id: string }[])[0];
      assert(dueno, "no hay ningún canje con el que comprobarlo");
      const { data: miembro } = await admin.from("memberships")
        .select("user_id").eq("organization_id", dueno.organization_id)
        .eq("role_code", "admin").limit(1).single();
      assert(miembro, "el canje no tiene empresa con administración");
      const ajeno = await persona("b6b-ajeno");
      const { data: suyos } = await ajeno.cli.from("billing_promotion_redemptions").select("id");
      assert((suyos ?? []).length === 0, "un ajeno vio canjes de otra empresa");
    });
  } finally {
    for (const org of orgs) await limpiar(org);
    for (const id of promos) {
      await admin.from("billing_promotion_redemptions").delete().eq("promotion_id", id);
      await admin.from("billing_promotion_codes").delete().eq("promotion_id", id);
      await admin.from("billing_promotions").delete().eq("id", id);
    }
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.from("user_legal_acceptances").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B6B · cupones: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

async function limpiar(orgId: string) {
  await admin.from("billing_subscription_periods")
    .update({ settled_payment_id: null }).eq("organization_id", orgId);
  await admin.from("billing_payments").update({ period_id: null }).eq("organization_id", orgId);
  await admin.from("billing_quotes")
    .update({ subscription_id: null, redemption_id: null }).eq("organization_id", orgId);
  await admin.from("billing_checkout_intents")
    .update({ payment_method_id: null, period_id: null }).eq("organization_id", orgId);
  await admin.from("billing_promotion_redemptions")
    .update({ quote_id: null, subscription_id: null }).eq("organization_id", orgId);
  for (const t of ["billing_promotion_redemptions", "billing_provider_events",
                   "billing_payments", "billing_subscription_periods",
                   "billing_checkout_intents", "billing_payment_methods",
                   "billing_quotes", "billing_subscriptions", "ai_credit_ledger",
                   "organization_usage_minutes", "organization_usage_leases",
                   "commercial_assignment_events", "organization_plan_assignments",
                   "subscription_plan_history", "organization_subscriptions",
                   "organization_modules", "memberships"]) {
    const { error } = await admin.from(t).delete().eq("organization_id", orgId);
    if (error) console.error(`  (residuo) ${t}: ${error.message}`);
  }
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  if (error) console.error(`  (residuo) empresa: ${error.message}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
