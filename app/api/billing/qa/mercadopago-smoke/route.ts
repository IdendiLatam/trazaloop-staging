import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPlatformStatus } from "@/lib/db/platform";
import { mercadoPagoFromEnv } from "@/lib/billing/providers/mercadopago";
import { environmentFromAccessToken, recurrenceFor } from "@/lib/billing/mercadopago/mapping";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trazaloop · PE-05B2 · Disparador TEMPORAL de la prueba de sandbox.
 *
 * POR QUÉ EXISTE
 *
 * El token de Mercado Pago vive en el entorno de Preview de Vercel, no en
 * ninguna consola local, y así debe seguir: bajárselo para poder probar cómodo
 * sería sacar una credencial de donde está protegida. Así que la prueba se
 * ejecuta DONDE ESTÁ EL TOKEN, del lado del servidor.
 *
 * ES PROVISIONAL. Se retira antes de cerrar PE-05B2. No es una pantalla, no es
 * una función de producto y no la ve ningún cliente. Una prueba comprueba que
 * está declarado como temporal y que no la alcanza ninguna pantalla.
 *
 * LOS CUATRO CANDADOS, EN ORDEN
 *
 *   1. Nunca en Producción. Se comprueba el entorno de Vercel y se rechaza.
 *   2. Solo superadministrador de plataforma, con su sesión real.
 *   3. Solo con credenciales de PRUEBA. Un token de producción la deja muerta
 *      antes de tocar la red.
 *   4. Ningún importe llega del navegador. Nunca. Las acciones son un catálogo
 *      cerrado de nombres, y el dinero sale siempre de B1.
 *
 * Y no devuelve el token, ni parte de él, ni su longitud.
 */

/** Se retira en el cierre de PE-05B2. Ver PE_05B2_SANDBOX_TESTS.md. */
export const QA_TRIGGER_IS_TEMPORARY = true;

const ACCIONES = ["preflight", "prepare", "create_monthly", "create_annual",
                  "get", "update_amount", "cancel"] as const;
type Accion = (typeof ACCIONES)[number];

const no = (motivo: string, code = 403) =>
  NextResponse.json({ ok: false, error: motivo }, { status: code });

export async function POST(request: Request) {
  // --- Candado 1 · jamás en Producción ------------------------------------
  const entornoVercel = process.env.VERCEL_ENV ?? "local";
  if (entornoVercel === "production") {
    return no("QA_TRIGGER_FORBIDDEN_IN_PRODUCTION");
  }

  // --- Candado 2 · superadministrador de plataforma, con su sesión ---------
  const { isStaff, isSuperadmin } = await checkPlatformStatus();
  if (!isStaff || !isSuperadmin) return no("NOT_PLATFORM_SUPERADMIN");

  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = (await request.json()) as Record<string, unknown>; } catch { cuerpo = {}; }
  const accion = String(cuerpo.action ?? "") as Accion;
  if (!(ACCIONES as readonly string[]).includes(accion)) {
    return no(`ACTION_UNKNOWN:${accion}`, 400);
  }

  // --- Candado 3 · solo credenciales de PRUEBA ----------------------------
  const entornoMp = environmentFromAccessToken(process.env.MERCADOPAGO_ACCESS_TOKEN);
  const compradorConfigurado = Boolean(
    process.env.MERCADOPAGO_TEST_BUYER_EMAIL
    && process.env.MERCADOPAGO_TEST_BUYER_EMAIL.trim() !== ""
  );

  if (accion === "preflight") {
    // No toca la red ni la base. Solo dice qué hay puesto, sin decir su valor.
    return NextResponse.json({
      ok: true,
      vercel_environment: entornoVercel,
      access_token_present: entornoMp !== null,
      access_token_environment: entornoMp,          // «test» | «live» | null
      test_buyer_email_configured: compradorConfigurado,
      webhook_secret_present: Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET),
      is_superadmin: isSuperadmin,
    });
  }

  if (entornoMp === null) return no("MERCADOPAGO_ACCESS_TOKEN_NOT_AVAILABLE", 424);
  if (entornoMp !== "test") return no("MERCADOPAGO_CREDENTIAL_IS_NOT_TEST", 424);
  if (!compradorConfigurado) return no("MERCADOPAGO_TEST_BUYER_EMAIL_REQUIRED", 424);

  const comprador = (process.env.MERCADOPAGO_TEST_BUYER_EMAIL as string).trim();
  const proveedor = mercadoPagoFromEnv();
  const admin = createAdminClient();
  const supabase = await createServerClient();
  const sitio = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trazaloop.com";
  const volver = `${sitio.replace(/\/$/, "")}/billing/return`;

  // -------------------------------------------------------------------------
  // prepare · la empresa sintética, su tasa de QA y el presupuesto
  // -------------------------------------------------------------------------
  if (accion === "prepare") {
    const plan = cuerpo.plan === "extra" ? "extra" : "full";
    const intervalo = cuerpo.interval === "annual" ? "annual" : "monthly";

    // La tasa sintética. Se marca de forma que no se pueda confundir con una
    // verdad comercial, y se deja constancia de que 4 000 no es una tasa real.
    const { data: tasas } = await admin.from("commercial_fx_rates")
      .select("id, note").eq("base_currency", "USD").eq("quote_currency", "COP");
    const yaHay = ((tasas ?? []) as { note: string | null }[])
      .some((t) => (t.note ?? "").includes("QA-SYNTHETIC-NOT-FOR-PRODUCTION"));
    if (!yaHay) {
      const { error } = await admin.from("commercial_fx_rates").insert({
        base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
        effective_from: new Date(Date.now() - 3_600_000).toISOString(),
        note: "QA-SYNTHETIC-NOT-FOR-PRODUCTION · PE-05B2 · 4000 COP/USD no es una "
            + "tasa real ni actual: existe solo para poder presupuestar en el sandbox.",
      });
      if (error) return no(`FX_SEED_FAILED:${error.message}`, 500);
    }

    // La empresa sintética. Se reutiliza si ya existe.
    const { data: existentes } = await admin.from("organizations")
      .select("id, name, contact_email").ilike("name", "QA-PE05B2-MERCADOPAGO%");
    const org = ((existentes ?? [])[0] as { id: string } | undefined)?.id ?? null;
    if (!org) return no("QA_ORGANIZATION_MISSING:crea la empresa antes con `seed`", 424);

    // El contacto de facturación es la identidad de PRUEBA, no la de nadie real.
    await admin.from("organizations").update({ contact_email: comprador }).eq("id", org);

    const { data: q, error: eq } = await supabase.rpc("billing_create_quote", {
      p_organization_id: org, p_plan_code: plan, p_billing_interval: intervalo });
    if (eq) return no(`QUOTE_FAILED:${eq.message}`, 500);
    const quote = q as Record<string, unknown>;

    const { data: i, error: ei } = await supabase.rpc("billing_open_checkout_intent", {
      p_quote_id: quote.quote_id, p_provider: "mercadopago", p_environment: "test" });
    if (ei) return no(`INTENT_FAILED:${ei.message}`, 500);

    return NextResponse.json({ ok: true, organization_id: org, quote, intent: i });
  }

  // -------------------------------------------------------------------------
  // create_monthly / create_annual · la llamada real
  // -------------------------------------------------------------------------
  if (accion === "create_monthly" || accion === "create_annual") {
    const intentId = String(cuerpo.intent_id ?? "");
    if (!intentId) return no("INTENT_ID_REQUIRED", 400);
    const { data: fila, error } = await admin.from("billing_checkout_intents")
      .select("id, organization_id, expected_total_amount, expected_currency, billing_interval, plan_code, environment")
      .eq("id", intentId).single();
    if (error || !fila) return no("INTENT_NOT_FOUND", 404);
    const intento = fila as Record<string, unknown>;
    if (intento.environment !== "test") return no("INTENT_IS_NOT_TEST", 424);

    // EL IMPORTE SALE DEL INTENTO, que lo congeló del presupuesto de B1.
    // No hay ninguna vía por la que el navegador pueda influir en él.
    const intervalo = accion === "create_annual" ? "annual" : "monthly";
    const r = await proveedor.createSubscription({
      externalReference: String(intento.id),
      payerEmail: comprador,
      reason: `Trazaloop ${String(intento.plan_code).toUpperCase()} ${intervalo} (QA sandbox)`,
      amountMinor: Number(intento.expected_total_amount),
      currency: String(intento.expected_currency),
      interval: intervalo,
      returnUrl: volver,
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, failure: r.failure, message: r.message,
        requested: { ...recurrenceFor(intervalo),
                     transaction_amount: Number(intento.expected_total_amount),
                     currency_id: String(intento.expected_currency) } }, { status: 200 });
    }
    await admin.rpc("billing_attach_provider_subscription", {
      p_intent_id: intentId,
      p_provider_subscription_id: r.value.providerSubscriptionId,
      p_init_point: r.value.initPoint, p_provider_status: r.value.providerStatus,
      p_status: "provider_created", p_synced_amount: r.value.amount,
      p_provider_version: r.value.version, p_next_payment_date: r.value.nextPaymentDate });
    return NextResponse.json({ ok: true, subscription: r.value });
  }

  if (accion === "get") {
    const id = String(cuerpo.provider_subscription_id ?? "");
    if (!id) return no("PROVIDER_SUBSCRIPTION_ID_REQUIRED", 400);
    const r = await proveedor.getSubscriptionDetail(id);
    return NextResponse.json(r.ok ? { ok: true, subscription: r.value }
                                  : { ok: false, failure: r.failure, message: r.message });
  }

  // -------------------------------------------------------------------------
  // update_amount · el importe nuevo se DERIVA, no llega
  // -------------------------------------------------------------------------
  if (accion === "update_amount") {
    const id = String(cuerpo.provider_subscription_id ?? "");
    const intentId = String(cuerpo.intent_id ?? "");
    if (!id || !intentId) return no("IDS_REQUIRED", 400);
    const { data: fila } = await admin.from("billing_checkout_intents")
      .select("quote_id, expected_currency").eq("id", intentId).single();
    if (!fila) return no("INTENT_NOT_FOUND", 404);
    const { data: q } = await admin.from("billing_quotes")
      .select("base_amount, total_amount").eq("id", (fila as Record<string, string>).quote_id).single();
    if (!q) return no("QUOTE_NOT_FOUND", 404);
    // El importe de prueba es la BASE SIN IMPUESTO del mismo presupuesto: es
    // exactamente la forma que tendría una exención futura, así que la prueba
    // de capacidad responde a la pregunta que de verdad importa. Y sale del
    // servidor: el navegador no manda ninguna cifra.
    const nuevo = Number((q as Record<string, number>).base_amount);
    const r = await proveedor.updateRecurringAmount(
      id, nuevo, String((fila as Record<string, string>).expected_currency));
    return NextResponse.json(r.ok
      ? { ok: true, before: Number((q as Record<string, number>).total_amount),
          requested: nuevo, after: r.value }
      : { ok: false, failure: r.failure, message: r.message, requested: nuevo });
  }

  if (accion === "cancel") {
    const id = String(cuerpo.provider_subscription_id ?? "");
    if (!id) return no("PROVIDER_SUBSCRIPTION_ID_REQUIRED", 400);
    const r = await proveedor.cancelSubscription(id, false);
    return NextResponse.json(r.ok ? { ok: true, status: r.value.status }
                                  : { ok: false, failure: r.failure, message: r.message });
  }

  return no("ACTION_UNHANDLED", 400);
}
