/**
 * Trazaloop · PE-05B6C · La consola de campañas, y lo que el cliente ve.
 *
 * Lo que de verdad se comprueba aquí es que una campaña PUBLICADA no se
 * reescribe. 0179 dejaba los estados sin nadie que los vigilara, y un `update`
 * bastaba para que el cupón de Full acabara descontando Extra —justo lo que
 * PAY-49 existe para impedir—.
 *
 * Correr: npm run test:pe05b6c-admin
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
const promos: string[] = [];
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function persona(prefijo: string, papel?: "superadmin" | "support") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B6C" } });
  assert(!error && data.user, `crear ${prefijo}: ${error?.message}`);
  personas.push(data.user!.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b6c" });
  if (papel) {
    await admin.from("platform_staff").insert({ user_id: data.user!.id, role_code: papel, status: "active" });
  }
  return { id: data.user!.id, email, cli };
}

async function empresa(nombre: string) {
  const quien = await persona("b6c");
  const { data, error } = await quien.cli.rpc("create_organization",
    { p_name: `${nombre} ${sello}`, p_tax_id: null, p_country: "CO" });
  assert(!error && data, `crear empresa: ${error?.message}`);
  const org = data as string;
  orgs.push(org);
  await admin.from("memberships").update({ role_code: "admin" })
    .eq("organization_id", org).eq("user_id", quien.id);
  return { org, quien };
}

async function main() {
  const { error: efx } = await admin.from("commercial_fx_rates").insert({
    base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
    effective_from: new Date(Date.now() - 86_400_000).toISOString(),
    note: `QA PE-05B6C ${sello} · tasa sintetica, NO comercial` });
  assert(!efx, `tasa: ${efx?.message}`);

  console.log("\nPE-05B6C · Consola de campañas e historial\n");
  const sa = await persona("b6c-sa", "superadmin");
  const soporte = await persona("b6c-soporte", "support");

  try {
    // =====================================================================
    console.log("A · El ciclo entero, sin abrir la base");
    // =====================================================================

    let campanaId = "";
    let codigoId = "";

    await check("Crear borrador, darle código, publicar · todo por la consola", async () => {
      const { data: c, error: ec } = await sa.cli.rpc("billing_create_promotion", {
        p_name: `Convenio QA ${sello}`, p_description: "Prueba de consola",
        p_program: "institutional_full", p_discount_basis_points: 3000,
        p_eligible_plan_codes: ["full"], p_eligible_intervals: ["monthly", "annual"],
        p_max_discount_basis_points: null,
        p_starts_at: new Date(Date.now() - 3600_000).toISOString(),
        p_ends_at: null, p_max_redemptions: null, p_max_per_organization: 1 });
      assert(!ec, `crear: ${ec?.message}`);
      campanaId = String((c as Record<string, unknown>).promotion_id);
      promos.push(campanaId);

      // El institucional trae su techo puesto aunque nadie lo escriba.
      const { data: fila } = await admin.from("billing_promotions")
        .select("status, program, max_discount_basis_points").eq("id", campanaId).single();
      const f = fila as Record<string, unknown>;
      assert(f.status === "draft", `nació ${f.status}`);
      assert(Number(f.max_discount_basis_points) === 4000,
        `techo ${f.max_discount_basis_points}: el institucional no lo trajo puesto`);

      // Sin código no se publica: nadie podría canjearla.
      const { data: sinCodigo } = await sa.cli.rpc("billing_publish_promotion",
        { p_promotion_id: campanaId });
      assert((sinCodigo as Record<string, unknown>).status === "no_active_code",
        JSON.stringify(sinCodigo));

      const { data: cod, error: ecod } = await sa.cli.rpc("billing_create_promotion_code",
        { p_promotion_id: campanaId, p_code: `qa-consola-${sello}` });
      assert(!ecod, `código: ${ecod?.message}`);
      const cd = cod as Record<string, unknown>;
      assert(cd.status === "created", JSON.stringify(cd));
      // Normalizado en mayúsculas: «qa» y «QA » son el mismo.
      assert(String(cd.code) === `QA-CONSOLA-${sello}`.toUpperCase(), String(cd.code));
      codigoId = String(cd.code_id);

      const { data: pub } = await sa.cli.rpc("billing_publish_promotion",
        { p_promotion_id: campanaId });
      assert((pub as Record<string, unknown>).status === "published", JSON.stringify(pub));
    });

    await check("Y un código repetido no se cuela", async () => {
      const { data } = await sa.cli.rpc("billing_create_promotion_code",
        { p_promotion_id: campanaId, p_code: `QA-CONSOLA-${sello}` });
      assert((data as Record<string, unknown>).status === "code_taken", JSON.stringify(data));
    });

    // =====================================================================
    console.log("\nB · Publicada NO se reescribe");
    // =====================================================================

    await check("Ni el porcentaje, ni los planes, ni el estado hacia atrás", async () => {
      for (const [que, campos] of [
        ["el porcentaje", { discount_value: 500 }],
        ["los planes elegibles", { eligible_plan_codes: ["full", "extra"] }],
        ["la periodicidad", { eligible_intervals: ["monthly"] }],
        ["el programa", { program: "general" }],
        ["el tope de canjes", { max_redemptions: 999 }],
        ["el estado, hacia atrás", { status: "draft" }],
      ] as Array<[string, Record<string, unknown>]>) {
        const { error } = await admin.from("billing_promotions")
          .update(campos).eq("id", campanaId);
        assert(error, `se pudo cambiar ${que} de una campaña publicada`);
      }
      // Y sigue diciendo lo mismo que decía.
      const { data } = await admin.from("billing_promotions")
        .select("discount_value, eligible_plan_codes, status").eq("id", campanaId).single();
      const f = data as Record<string, unknown>;
      assert(Number(f.discount_value) === 3000
        && (f.eligible_plan_codes as string[]).join() === "full"
        && f.status === "active", JSON.stringify(f));
    });

    await check("La vigencia solo se acorta · una campaña cerrada no se reabre", async () => {
      const { data: c } = await sa.cli.rpc("billing_create_promotion", {
        p_name: `Con fin ${sello}`, p_description: null, p_program: "general",
        p_discount_basis_points: 1000, p_eligible_plan_codes: ["extra"],
        p_eligible_intervals: ["monthly"], p_max_discount_basis_points: null,
        p_starts_at: new Date(Date.now() - 3600_000).toISOString(),
        p_ends_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        p_max_redemptions: null, p_max_per_organization: 1 });
      const id = String((c as Record<string, unknown>).promotion_id);
      promos.push(id);
      await sa.cli.rpc("billing_create_promotion_code",
        { p_promotion_id: id, p_code: `CONFIN-${sello}` });
      await sa.cli.rpc("billing_publish_promotion", { p_promotion_id: id });

      const { error: alargar } = await admin.from("billing_promotions")
        .update({ ends_at: new Date(Date.now() + 90 * 86_400_000).toISOString() }).eq("id", id);
      assert(alargar, "se alargó la vigencia de una campaña publicada");
      const { error: abrir } = await admin.from("billing_promotions")
        .update({ ends_at: null }).eq("id", id);
      assert(abrir, "se le quitó el fin a una campaña publicada");
      const { error: acortar } = await admin.from("billing_promotions")
        .update({ ends_at: new Date(Date.now() + 2 * 86_400_000).toISOString() }).eq("id", id);
      assert(!acortar, `no se pudo acortar: ${acortar}`);
    });

    await check("En BORRADOR sí se corrige · todavía no ha cobrado a nadie", async () => {
      const { data: c } = await sa.cli.rpc("billing_create_promotion", {
        p_name: `Borrador ${sello}`, p_description: null, p_program: "general",
        p_discount_basis_points: 1500, p_eligible_plan_codes: ["full"],
        p_eligible_intervals: ["monthly"], p_max_discount_basis_points: null,
        p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_max_redemptions: null, p_max_per_organization: 1 });
      const id = String((c as Record<string, unknown>).promotion_id);
      promos.push(id);
      const { error } = await admin.from("billing_promotions")
        .update({ discount_value: 2500 }).eq("id", id);
      assert(!error, `no se pudo corregir un borrador: ${error}`);
    });

    await check("Un «institucional» no puede pasar del 40 % ni incluir Extra", async () => {
      const { error: e1 } = await sa.cli.rpc("billing_create_promotion", {
        p_name: `Pasada ${sello}`, p_description: null, p_program: "institutional_full",
        p_discount_basis_points: 5000, p_eligible_plan_codes: ["full"],
        p_eligible_intervals: ["monthly"], p_max_discount_basis_points: null,
        p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_max_redemptions: null, p_max_per_organization: 1 });
      assert(e1, "se creó un institucional por encima del 40 %");
      const { error: e2 } = await sa.cli.rpc("billing_create_promotion", {
        p_name: `Con Extra ${sello}`, p_description: null, p_program: "institutional_full",
        p_discount_basis_points: 3000, p_eligible_plan_codes: ["full", "extra"],
        p_eligible_intervals: ["monthly"], p_max_discount_basis_points: null,
        p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_max_redemptions: null, p_max_per_organization: 1 });
      assert(e2, "un institucional incluyó Extra");
      // Y el 40 % NO es obligatorio: 25 % institucional es perfectamente válido.
      const { data, error: e3 } = await sa.cli.rpc("billing_create_promotion", {
        p_name: `Institucional 25 ${sello}`, p_description: null,
        p_program: "institutional_full", p_discount_basis_points: 2500,
        p_eligible_plan_codes: ["full"], p_eligible_intervals: ["monthly"],
        p_max_discount_basis_points: null, p_starts_at: new Date().toISOString(),
        p_ends_at: null, p_max_redemptions: null, p_max_per_organization: 1 });
      assert(!e3, `un institucional al 25 % fue rechazado: ${e3?.message}`);
      promos.push(String((data as Record<string, unknown>).promotion_id));
    });

    // =====================================================================
    console.log("\nC · Retirar cierra la puerta, no reescribe");
    // =====================================================================

    await check("Retirar bloquea canjes nuevos y deja intacto lo cobrado", async () => {
      const e = await empresa("B6C retiro");
      const { data: q } = await e.quien.cli.rpc("billing_create_quote", {
        p_organization_id: e.org, p_plan_code: "full", p_billing_interval: "monthly",
        p_coupon_code: `QA-CONSOLA-${sello}` });
      const quote = q as Record<string, unknown>;
      assert(Number(quote.discount_basis_points) === 3000, JSON.stringify(quote));
      const baseConDescuento = Number(quote.base_amount);

      const { data: ret } = await sa.cli.rpc("billing_retire_promotion",
        { p_promotion_id: campanaId });
      assert((ret as Record<string, unknown>).status === "retired", JSON.stringify(ret));

      // Los códigos de esa campaña se retiran con ella.
      const { data: cod } = await admin.from("billing_promotion_codes")
        .select("status").eq("id", codigoId).single();
      assert((cod as { status: string }).status === "retired", JSON.stringify(cod));

      // Un canje nuevo ya no entra…
      const e2 = await empresa("B6C tarde");
      const { error } = await e2.quien.cli.rpc("billing_create_quote", {
        p_organization_id: e2.org, p_plan_code: "full", p_billing_interval: "monthly",
        p_coupon_code: `QA-CONSOLA-${sello}` });
      assert(error, "se canjeó un cupón de una campaña retirada");

      // …y el de antes sigue diciendo lo mismo.
      const { data: q2 } = await admin.from("billing_quotes")
        .select("base_amount, discount_amount").eq("id", quote.quote_id as string).single();
      assert(Number((q2 as Record<string, unknown>).base_amount) === baseConDescuento,
        "retirar la campaña movió un presupuesto anterior");
    });

    // =====================================================================
    console.log("\nD · Quién puede qué");
    // =====================================================================

    await check("Soporte LEE · superadministración administra · el cliente ni ve", async () => {
      const { data: ve } = await soporte.cli.from("billing_promotions").select("id");
      assert((ve ?? []).length > 0, "soporte no puede mirar las campañas");
      const { error: crea } = await soporte.cli.rpc("billing_create_promotion", {
        p_name: `Soporte ${sello}`, p_description: null, p_program: "general",
        p_discount_basis_points: 1000, p_eligible_plan_codes: ["full"],
        p_eligible_intervals: ["monthly"], p_max_discount_basis_points: null,
        p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_max_redemptions: null, p_max_per_organization: 1 });
      assert(crea, "soporte creó una campaña");
      const { error: pub } = await soporte.cli.rpc("billing_publish_promotion",
        { p_promotion_id: promos[promos.length - 1] });
      assert(pub, "soporte publicó una campaña");
      const { error: ret } = await soporte.cli.rpc("billing_retire_promotion",
        { p_promotion_id: promos[0] });
      assert(ret, "soporte retiró una campaña");

      const e = await empresa("B6C cliente");
      const { data: nada } = await e.quien.cli.from("billing_promotions").select("id");
      assert((nada ?? []).length === 0, "un cliente vio las campañas");
      const { error: suya } = await e.quien.cli.rpc("billing_create_promotion", {
        p_name: `Mía ${sello}`, p_description: null, p_program: "general",
        p_discount_basis_points: 9000, p_eligible_plan_codes: ["full"],
        p_eligible_intervals: ["monthly"], p_max_discount_basis_points: null,
        p_starts_at: new Date().toISOString(), p_ends_at: null,
        p_max_redemptions: null, p_max_per_organization: 1 });
      assert(suya, "un cliente creó una campaña");
    });

    // =====================================================================
    console.log("\nE · El historial del cliente");
    // =====================================================================

    await check("Ve sus cobros, con su descuento, y no el de otra empresa", async () => {
      const { listPaymentHistory } = await import("../../lib/db/billing-history");
      void listPaymentHistory;

      // Una empresa que contrata de verdad, con cupón.
      const { data: c } = await sa.cli.rpc("billing_create_promotion", {
        p_name: `Historial ${sello}`, p_description: null, p_program: "general",
        p_discount_basis_points: 2000, p_eligible_plan_codes: ["full"],
        p_eligible_intervals: ["monthly"], p_max_discount_basis_points: null,
        p_starts_at: new Date(Date.now() - 3600_000).toISOString(), p_ends_at: null,
        p_max_redemptions: null, p_max_per_organization: 1 });
      const promoId = String((c as Record<string, unknown>).promotion_id);
      promos.push(promoId);
      await sa.cli.rpc("billing_create_promotion_code",
        { p_promotion_id: promoId, p_code: `HIST-${sello}` });
      await sa.cli.rpc("billing_publish_promotion", { p_promotion_id: promoId });

      const e = await empresa("B6C historial");
      const { data: q } = await e.quien.cli.rpc("billing_create_quote", {
        p_organization_id: e.org, p_plan_code: "full", p_billing_interval: "monthly",
        p_coupon_code: `HIST-${sello}` });
      const quote = q as Record<string, unknown>;
      const { data: i } = await e.quien.cli.rpc("billing_open_checkout_intent", {
        p_quote_id: quote.quote_id as string, p_provider: "wompi", p_environment: "test" });
      const intento = i as unknown as { intent_id: string; expected_total_amount: number };
      await admin.rpc("billing_settle_provider_payment", {
        p_provider: "wompi", p_external_reference: intento.intent_id,
        p_provider_payment_id: `b6c-${sello}`, p_outcome: "approved",
        p_amount: intento.expected_total_amount, p_currency: "COP",
        p_live_mode: false, p_failure_reason: null });

      // El cobro guarda su instantánea: descuento incluido.
      const { data: cobros } = await e.quien.cli.from("billing_payments")
        .select("status, base_amount, discount_amount, tax_amount, total_amount, currency");
      const lista = (cobros ?? []) as Record<string, unknown>[];
      assert(lista.length === 1, `ve ${lista.length} cobros`);
      assert(Number(lista[0].discount_amount) === 32_000,
        `el descuento guardado es ${lista[0].discount_amount}`);
      assert(Number(lista[0].total_amount)
        === Number(lista[0].base_amount) + Number(lista[0].tax_amount), JSON.stringify(lista[0]));

      // Y una empresa ajena no ve nada de eso.
      const otra = await empresa("B6C ajena");
      const { data: ajenos } = await otra.quien.cli.from("billing_payments").select("id");
      assert((ajenos ?? []).length === 0, "un ajeno vio los cobros de otra empresa");
    });

    await check("Al cliente no se le enseña vocabulario del proveedor", async () => {
      const lib = sinComentarios(readFileSync("lib/db/billing-history.ts", "utf8"));
      for (const p of ["provider_payment_id", "payment_method", "failure_class",
                       "provider_unknown", "idempotency_key"]) {
        assert(!lib.includes(p), `el historial expone «${p}»`);
      }
      const pagina = readFileSync("app/(app)/(shell)/settings/billing/page.tsx", "utf8");
      assert(/ESTADO_COBRO/.test(pagina), "la pantalla enseña el estado crudo del cobro");
      // Y NO se llama factura a un comprobante. La aclaración —que NIEGA serlo—
      // es justamente lo que hay que tener, así que se quita antes de mirar: si
      // no, la prueba castigaría la frase correcta.
      assert(/No es una factura electrónica/.test(pagina),
        "la pantalla no aclara que esto no es una factura");
      const texto = sinComentarios(pagina)
        .replace(/No es una factura electrónica\.?/g, "");
      // «Facturación» es la palabra normal para el área; lo prohibido es
      // llamar FACTURA a un documento que no lo es.
      for (const p of [/\b[Ff]acturas?\b/, /\bDIAN\b/, /facturación electrónica/i]) {
        assert(!p.test(texto),
          `la pantalla llama factura a un comprobante: ${p}`);
      }
    });

    // =====================================================================
    console.log("\nF · La consola, por dentro");
    // =====================================================================

    await check("Todo el ciclo cabe en la pantalla · y nadie escribe tablas a mano", async () => {
      const ui = sinComentarios(
        readFileSync("components/domain/platform/promotions-console.tsx", "utf8"));
      for (const accion of ["createPromotionAction", "publishPromotionAction",
                            "retirePromotionAction", "createPromotionCodeAction",
                            "retirePromotionCodeAction"]) {
        assert(ui.includes(accion), `la consola no puede ${accion}`);
      }
      // Ni una escritura directa a las tablas desde la capa de servidor.
      const acciones = sinComentarios(
        readFileSync("server/actions/promotions-console.ts", "utf8"));
      for (const t of ['from("billing_promotions").insert', 'from("billing_promotions").update',
                       'from("billing_promotion_codes").insert']) {
        assert(!acciones.includes(t), `la consola escribe la tabla a mano: ${t}`);
      }
      // Y publicar avisa de que es irreversible.
      assert(/sus condiciones quedan fijas/.test(ui),
        "publicar no avisa de que las condiciones quedan fijas");
      assert(/Lo ya canjeado no se toca/.test(ui),
        "retirar no explica qué pasa con lo ya canjeado");
      // El estado, en palabras y no solo en color.
      assert(/Borrador/.test(ui) && /Publicada/.test(ui) && /Retirada/.test(ui),
        "los estados no se dicen con palabras");
    });
  } finally {
    for (const org of orgs) await limpiar(org);
    for (const id of promos) {
      await admin.from("billing_promotion_redemptions").delete().eq("promotion_id", id);
      await admin.from("billing_promotion_codes").delete().eq("promotion_id", id);
      await admin.from("billing_promotions").delete().eq("id", id);
    }
    const { data: tasas } = await admin.from("commercial_fx_rates").select("id, note");
    for (const t of ((tasas ?? []) as { id: string; note: string | null }[])
      .filter((x) => (x.note ?? "").includes(`QA PE-05B6C ${sello}`))) {
      await admin.from("commercial_fx_rates")
        .update({ status: "retired" }).eq("id", t.id);
    }
    for (const id of personas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.from("user_legal_acceptances").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-05B6C · consola: ${passed} en verde, ${failed} en rojo\n`);
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
