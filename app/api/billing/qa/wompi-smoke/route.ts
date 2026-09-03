import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPlatformStatus } from "@/lib/db/platform";
import { wompiFromEnv } from "@/lib/billing/providers/wompi";
import { WOMPI_SANDBOX_URL } from "@/lib/billing/wompi/mapping";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trazaloop · PE-05B2W · Disparador TEMPORAL de la prueba de Wompi.
 *
 * Se retira antes de cerrar PE-05B2W. Mismos cuatro candados que el de la otra
 * pasarela: nunca en Producción, solo superadministrador o el secreto de
 * automatización del proyecto, solo entorno de PRUEBAS, y ningún importe llega
 * del navegador.
 *
 * SOBRE LA TOKENIZACIÓN, QUE ES LO DELICADO
 *
 * En el producto, el número de tarjeta va del NAVEGADOR a Wompi con la llave
 * pública, y el servidor de Trazaloop no lo ve nunca. Aquí no hay navegador,
 * así que esta prueba automatizada tokeniza desde el servidor con la tarjeta
 * de prueba PÚBLICA de la documentación de Wompi.
 *
 * Eso es una desviación consciente y acotada:
 *   · vive SOLO en este fichero, que es provisional y se retira;
 *   · el número llega en la petición y no se guarda, ni se registra, ni se
 *     devuelve;
 *   · una prueba comprueba que NINGÚN fichero de producto —`lib`, `server`,
 *     `components`— toca campos de tarjeta.
 *
 * El camino de producto sigue siendo navegador → Wompi. Este no lo sustituye.
 */

const ACCIONES = ["preflight", "contracts", "prepare", "tokenize_test_card",
                  "create_payment_source", "charge", "get_transaction"] as const;
type Accion = (typeof ACCIONES)[number];

const no = (motivo: string, code = 403) =>
  NextResponse.json({ ok: false, error: motivo }, { status: code });

function automationSecretMatches(presentado: string | null, esperado: string | undefined) {
  if (!presentado || !esperado) return false;
  const a = Buffer.from(presentado); const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const entornoVercel = process.env.VERCEL_ENV ?? "local";
  if (entornoVercel === "production") return no("QA_TRIGGER_FORBIDDEN_IN_PRODUCTION");

  const { isStaff, isSuperadmin } = await checkPlatformStatus();
  const porAutomatizacion = automationSecretMatches(
    request.headers.get("x-vercel-protection-bypass"),
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
  if (!porAutomatizacion && (!isStaff || !isSuperadmin)) {
    return no("NOT_PLATFORM_SUPERADMIN");
  }

  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = (await request.json()) as Record<string, unknown>; } catch { cuerpo = {}; }
  const accion = String(cuerpo.action ?? "") as Accion;
  if (!(ACCIONES as readonly string[]).includes(accion)) {
    return no(`ACTION_UNKNOWN:${accion}`, 400);
  }

  const proveedor = wompiFromEnv();

  if (accion === "preflight") {
    return NextResponse.json({
      ok: true,
      vercel_environment: entornoVercel,
      // Solo el veredicto y qué falta. Nunca una llave ni un trozo de llave.
      wompi_environment: proveedor.environment,
      configuration_problems: proveedor.configurationProblems,
      capabilities: proveedor.capabilities,
      identity: porAutomatizacion ? "automation" : "superadmin",
    });
  }

  // Candado 3 · SOLO sandbox. Falla cerrado ante mezcla o ante producción.
  if (proveedor.environment === null) {
    return no(`WOMPI_NOT_CONFIGURED:${proveedor.configurationProblems.join(",")}`, 424);
  }
  if (proveedor.environment !== "sandbox") {
    return no("WOMPI_CREDENTIALS_ARE_NOT_SANDBOX", 424);
  }

  const admin = createAdminClient();

  if (accion === "contracts") {
    const r = await proveedor.getAcceptanceContracts();
    if (!r.ok) return NextResponse.json({ ok: false, failure: r.failure,
      message: r.message, detail: (r as { detail?: string | null }).detail ?? null });
    // Los enlaces sí: son los contratos que una persona debe poder leer. Los
    // tokens no salen de aquí.
    return NextResponse.json({ ok: true,
      acceptance_permalink: r.value.acceptancePermalink,
      personal_auth_permalink: r.value.personalAuthPermalink,
      acceptance_token_present: Boolean(r.value.acceptanceToken),
      personal_auth_token_present: Boolean(r.value.personalAuthToken) });
  }

  // -------------------------------------------------------------------------
  // prepare · empresa de QA, tasa sintética y presupuesto de B1
  // -------------------------------------------------------------------------
  if (accion === "prepare") {
    const plan = cuerpo.plan === "extra" ? "extra" : "full";
    const intervalo = cuerpo.interval === "annual" ? "annual" : "monthly";

    const { data: tasas } = await admin.from("commercial_fx_rates")
      .select("id, note, status, effective_to")
      .eq("base_currency", "USD").eq("quote_currency", "COP");
    const vigente = ((tasas ?? []) as Record<string, unknown>[])
      .some((t) => String(t.note ?? "").includes("QA-SYNTHETIC-NOT-FOR-PRODUCTION")
        && t.status === "active" && !t.effective_to);
    if (!vigente) {
      const { error } = await admin.from("commercial_fx_rates").insert({
        base_currency: "USD", quote_currency: "COP", rate_micros: 4_000_000_000,
        effective_from: new Date(Date.now() - 3_600_000).toISOString(),
        note: "QA-SYNTHETIC-NOT-FOR-PRODUCTION · PE-05B2W · 4000 COP/USD no es una "
            + "tasa real ni actual: existe solo para poder presupuestar en el sandbox.",
      });
      if (error) return no(`FX_SEED_FAILED:${error.message}`, 500);
    }

    const { data: existentes } = await admin.from("organizations")
      .select("id, created_by").ilike("name", "QA-PE05B2-MERCADOPAGO%");
    const fila = (existentes ?? [])[0] as { id: string; created_by: string | null } | undefined;
    if (!fila?.id || !fila.created_by) {
      return no("QA_ORGANIZATION_MISSING", 424);
    }

    // Se reutiliza la empresa de QA que ya existe: no hace falta otra, y una
    // segunda sería contaminación sin uso.
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!anon) return no("ANON_KEY_UNAVAILABLE", 500);
    const clave = `QA-${crypto.randomUUID()}`;
    const { error: ePass } = await admin.auth.admin.updateUserById(fila.created_by,
      { password: clave });
    if (ePass) return no(`QA_USER_PASSWORD_FAILED:${ePass.message}`, 500);
    const { data: persona } = await admin.auth.admin.getUserById(fila.created_by);
    const correo = persona?.user?.email;
    if (!correo) return no("QA_USER_EMAIL_MISSING", 500);

    const comoAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, anon,
      { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: eLogin } = await comoAdmin.auth.signInWithPassword(
      { email: correo, password: clave });
    if (eLogin) return no(`QA_SIGNIN_FAILED:${eLogin.message}`, 500);

    const { data: q, error: eq } = await comoAdmin.rpc("billing_create_quote", {
      p_organization_id: fila.id, p_plan_code: plan, p_billing_interval: intervalo });
    if (eq) return no(`QUOTE_FAILED:${eq.message}`, 500);
    const quote = q as Record<string, unknown>;
    const { data: i, error: ei } = await comoAdmin.rpc("billing_open_checkout_intent", {
      p_quote_id: quote.quote_id, p_provider: "wompi", p_environment: "test" });
    if (ei) return no(`INTENT_FAILED:${ei.message}`, 500);
    return NextResponse.json({ ok: true, organization_id: fila.id, quote, intent: i });
  }

  // -------------------------------------------------------------------------
  // tokenize_test_card · SOLO aquí, y solo con la tarjeta pública de prueba
  // -------------------------------------------------------------------------
  if (accion === "tokenize_test_card") {
    const pan = String(cuerpo.pan ?? "");
    // Solo se aceptan las DOS tarjetas publicadas por Wompi para su sandbox.
    // Cualquier otra cosa se rechaza: así este camino no puede usarse nunca
    // con una tarjeta de una persona, ni por error ni a propósito.
    const PERMITIDAS = new Set(["4242424242424242", "4111111111111111"]);
    if (!PERMITIDAS.has(pan.replace(/\s+/g, ""))) {
      return no("ONLY_PUBLISHED_SANDBOX_TEST_CARDS_ALLOWED", 400);
    }
    try {
      const r = await fetch(`${WOMPI_SANDBOX_URL}/tokens/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json",
                   Authorization: `Bearer ${process.env.WOMPI_PUBLIC_KEY}` },
        body: JSON.stringify({
          number: pan.replace(/\s+/g, ""),
          cvc: String(cuerpo.cvc ?? "123"),
          exp_month: String(cuerpo.exp_month ?? "12"),
          exp_year: String(cuerpo.exp_year ?? "30"),
          card_holder: "QA TRAZALOOP",
        }),
      });
      const j = (await r.json()) as Record<string, unknown>;
      const d = (j.data ?? {}) as Record<string, unknown>;
      // Del resultado NO sale nada de la tarjeta salvo la marca y el estado.
      return NextResponse.json({ ok: r.ok, http: r.status,
        token_present: Boolean(d.id), token: d.id ?? null,
        status: d.status ?? null, brand: d.brand ?? null,
        error: r.ok ? null : JSON.stringify(j).slice(0, 400) });
    } catch (e) {
      return NextResponse.json({ ok: false,
        message: e instanceof Error ? e.name : "UnknownError" });
    }
  }

  if (accion === "create_payment_source") {
    const contratos = await proveedor.getAcceptanceContracts();
    if (!contratos.ok) return NextResponse.json({ ok: false, stage: "contracts",
      failure: contratos.failure, message: contratos.message });
    const r = await proveedor.createPaymentSource({
      cardToken: String(cuerpo.card_token ?? ""),
      customerEmail: String(cuerpo.customer_email ?? "qa-wompi@test.trazaloop.dev"),
      acceptanceToken: contratos.value.acceptanceToken,
      personalAuthToken: contratos.value.personalAuthToken,
    });
    return NextResponse.json(r.ok ? { ok: true, payment_source: r.value }
      : { ok: false, failure: r.failure, message: r.message,
          detail: (r as { detail?: string | null }).detail ?? null });
  }

  // -------------------------------------------------------------------------
  // charge · el importe sale del INTENTO, nunca del navegador
  // -------------------------------------------------------------------------
  if (accion === "charge") {
    const intentId = String(cuerpo.intent_id ?? "");
    const fuente = Number(cuerpo.payment_source_id ?? 0);
    if (!intentId || !fuente) return no("IDS_REQUIRED", 400);
    const { data: intento } = await admin.from("billing_checkout_intents")
      .select("id, expected_total_amount, expected_currency, environment")
      .eq("id", intentId).single();
    if (!intento) return no("INTENT_NOT_FOUND", 404);
    const i = intento as Record<string, unknown>;
    if (i.environment !== "test") return no("INTENT_IS_NOT_TEST", 424);

    // Referencia única por INTENTO DE COBRO. Wompi no ofrece clave de
    // idempotencia, así que la unicidad la pone Trazaloop: una referencia por
    // intento, y el intento se identifica antes de llamar.
    const sufijo = String(cuerpo.attempt ?? "1").replace(/[^a-zA-Z0-9]/g, "");
    const referencia = `${intentId}-${sufijo}`;
    const r = await proveedor.chargePaymentSource({
      paymentSourceId: fuente,
      amountCopMinor: Number(i.expected_total_amount),
      currency: String(i.expected_currency),
      reference: referencia,
      customerEmail: String(cuerpo.customer_email ?? "qa-wompi@test.trazaloop.dev"),
      recurrent: cuerpo.recurrent !== false,
    });
    return NextResponse.json(r.ok
      ? { ok: true, reference: referencia, expected_cop: Number(i.expected_total_amount),
          transaction: r.value }
      : { ok: false, reference: referencia, failure: r.failure, message: r.message,
          detail: (r as { detail?: string | null }).detail ?? null });
  }

  if (accion === "get_transaction") {
    const r = await proveedor.getTransaction(String(cuerpo.transaction_id ?? ""));
    return NextResponse.json(r.ok ? { ok: true, transaction: r.value }
      : { ok: false, failure: r.failure, message: r.message,
          detail: (r as { detail?: string | null }).detail ?? null });
  }

  return no("ACTION_UNHANDLED", 400);
}
