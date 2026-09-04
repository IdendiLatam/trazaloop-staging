import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { wompiFromEnv } from "@/lib/billing/providers/wompi";
import { buildAttemptReference } from "@/lib/billing/wompi/mapping";

/**
 * Trazaloop · PE-05B2W4 · La contratación de verdad, del lado del servidor.
 *
 * LA FRONTERA, QUE ES LO ÚNICO QUE IMPORTA AQUÍ
 *
 * El número de la tarjeta, el código de seguridad y la caducidad viajan del
 * NAVEGADOR a Wompi y no pasan por Trazaloop. Este fichero recibe lo que Wompi
 * devolvió —un testigo de un solo uso— y nada más. No hay ni un campo de
 * tarjeta en ninguna firma de este módulo, y una prueba se pone roja si
 * aparece.
 *
 * Y EL RESULTADO DEL NAVEGADOR NO ES EL DERECHO
 *
 * Este módulo cobra, pero no activa nada. Quien activa es el webhook firmado,
 * que relee la transacción en el proveedor antes de tocar el libro. Lo que ve
 * quien compra mientras tanto es el estado CANÓNICO leído de la base.
 */

/** Lo único que puede bajar al navegador: la llave pública y los contratos. */
export type WompiPublicConfig = {
  publicKey: string;
  /** Base de la API del entorno clasificado. El navegador no la adivina. */
  apiBaseUrl: string;
  environment: "test" | "live";
  acceptanceToken: string;
  acceptancePermalink: string | null;
  personalAuthToken: string;
  personalAuthPermalink: string | null;
};

export type CheckoutConfigResult =
  | { ok: true; config: WompiPublicConfig }
  | { ok: false; code: "PROVIDER_NOT_CONFIGURED" | "ACCEPTANCE_UNAVAILABLE" };

/**
 * La llave pública de Wompi es pública a propósito: sin ella el navegador no
 * puede tokenizar, y con ella no puede cobrar. Baja desde el servidor y no
 * desde una variable `NEXT_PUBLIC_`, para que el reparto siga siendo una
 * decisión del servidor y no un valor incrustado en el paquete del cliente.
 */
export async function getWompiPublicConfig(): Promise<CheckoutConfigResult> {
  const proveedor = wompiFromEnv();
  if (proveedor.environment === null || !proveedor.publicKey) {
    return { ok: false, code: "PROVIDER_NOT_CONFIGURED" };
  }
  const contratos = await proveedor.getAcceptanceContracts();
  if (!contratos.ok) return { ok: false, code: "ACCEPTANCE_UNAVAILABLE" };
  return {
    ok: true,
    config: {
      publicKey: proveedor.publicKey,
      apiBaseUrl: proveedor.apiBaseUrl ?? "",
      environment: proveedor.environment === "sandbox" ? "test" : "live",
      acceptanceToken: contratos.value.acceptanceToken,
      acceptancePermalink: contratos.value.acceptancePermalink,
      personalAuthToken: contratos.value.personalAuthToken,
      personalAuthPermalink: contratos.value.personalAuthPermalink,
    },
  };
}

/**
 * ¿Hay ya una contratación viva para esto?
 *
 * Recargar la página no puede volver a pedir la tarjeta ni abrir un cobro
 * nuevo. Si el intento ya salió hacia el proveedor, lo que toca es enseñar en
 * qué quedó; si todavía no salió, se reutiliza el mismo. La memoria del
 * navegador no es la verdad: la verdad está aquí.
 */
export type LiveCheckout = {
  intentId: string;
  status: string;
  /** `true` = ya salió hacia el proveedor: no se vuelve a pedir la tarjeta. */
  alreadySubmitted: boolean;
};

export async function findLiveCheckout(input: {
  organizationId: string; planCode: string; billingInterval: string;
}): Promise<LiveCheckout | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_checkout_intents")
    .select("id, status, plan_code, billing_interval, created_at")
    .eq("organization_id", input.organizationId)
    .eq("provider", "wompi")
    .eq("plan_code", input.planCode)
    .eq("billing_interval", input.billingInterval)
    .in("status", ["created", "provider_created", "authorized"])
    .order("created_at", { ascending: false }).limit(1);
  const fila = ((data ?? []) as { id: string; status: string }[])[0];
  if (!fila) return null;
  return { intentId: fila.id, status: fila.status,
           alreadySubmitted: fila.status !== "created" };
}

export type SubmitResult =
  | { ok: true; reference: string; providerStatus: string }
  | { ok: false; code: SubmitErrorCode; detail?: string | null };

export type SubmitErrorCode =
  | "PROVIDER_NOT_CONFIGURED"
  | "INTENT_NOT_FOUND"
  | "INTENT_NOT_OPEN"
  | "ENVIRONMENT_MISMATCH"
  | "ACCEPTANCE_REQUIRED"
  | "CARD_REJECTED"
  | "PAYMENT_METHOD_REFUSED"
  | "ALREADY_SUBMITTED"
  | "PROVIDER_UNAVAILABLE";

/**
 * Del testigo de un solo uso al cobro.
 *
 * El testigo NO se guarda. Se cambia por un medio de pago del proveedor —que
 * sí es duradero y sí es seguro guardar— y a partir de ahí deja de existir
 * para Trazaloop.
 *
 * El importe no llega de fuera: sale de lo que el intento congeló cuando se
 * abrió. Un navegador que mande otro no consigue nada porque nadie lo lee.
 */
export async function submitCardToken(input: {
  intentId: string;
  organizationId: string;
  cardToken: string;
  acceptanceToken: string;
  personalAuthToken: string;
  customerEmail: string;
}): Promise<SubmitResult> {
  const proveedor = wompiFromEnv();
  if (proveedor.environment === null) return { ok: false, code: "PROVIDER_NOT_CONFIGURED" };
  if (!input.acceptanceToken || !input.personalAuthToken) {
    return { ok: false, code: "ACCEPTANCE_REQUIRED" };
  }

  const admin = createAdminClient();
  const { data: fila } = await admin.from("billing_checkout_intents")
    .select("id, organization_id, status, environment, expected_total_amount, expected_currency")
    .eq("id", input.intentId).single();
  if (!fila) return { ok: false, code: "INTENT_NOT_FOUND" };
  const intento = fila as {
    organization_id: string; status: string; environment: string;
    expected_total_amount: number; expected_currency: string;
  };
  // La empresa del intento tiene que ser la que pide. Conocer un identificador
  // ajeno no abre nada.
  if (intento.organization_id !== input.organizationId) {
    return { ok: false, code: "INTENT_NOT_FOUND" };
  }
  const entorno = proveedor.environment === "sandbox" ? "test" : "live";
  if (intento.environment !== entorno) return { ok: false, code: "ENVIRONMENT_MISMATCH" };
  // Un intento que ya salió hacia el proveedor no vuelve a salir. Y si dos
  // peticiones cruzaran esta puerta a la vez, el proveedor rechaza la segunda:
  // la referencia identifica el intento y Wompi no acepta repetirla.
  if (intento.status !== "created") return { ok: false, code: "ALREADY_SUBMITTED" };

  const fuente = await proveedor.createPaymentSource({
    cardToken: input.cardToken,
    customerEmail: input.customerEmail,
    acceptanceToken: input.acceptanceToken,
    personalAuthToken: input.personalAuthToken,
  });
  if (!fuente.ok) {
    return { ok: false,
      code: fuente.failure === "invalid_request" ? "CARD_REJECTED" : "PROVIDER_UNAVAILABLE",
      detail: (fuente as { message?: string }).message ?? null };
  }
  if (!fuente.value.usable) return { ok: false, code: "PAYMENT_METHOD_REFUSED" };

  // El medio de pago se registra como lo que es: un instrumento reutilizable
  // de esta empresa. El testigo de la tarjeta ya no hace falta y no se guarda.
  const { data: reg } = await admin.rpc("billing_register_payment_method", {
    p_organization_id: input.organizationId, p_provider: "wompi",
    p_provider_payment_method_id: String(fuente.value.paymentSourceId),
    p_environment: entorno, p_created_by: null });
  const r = (reg ?? {}) as Record<string, unknown>;
  if (!r.payment_method_id) return { ok: false, code: "PAYMENT_METHOD_REFUSED",
    detail: String(r.status ?? "") };

  const { data: atado } = await admin.rpc("billing_attach_intent_payment_method", {
    p_intent_id: input.intentId, p_payment_method_id: String(r.payment_method_id) });
  if ((atado as Record<string, unknown> | null)?.status !== "attached") {
    return { ok: false, code: "PAYMENT_METHOD_REFUSED",
      detail: String((atado as Record<string, unknown> | null)?.status ?? "") };
  }

  // Se anota que el intento ya salió, ANTES de cobrar: si algo se cae por el
  // camino, el estado dice que hubo un envío y hay que reconciliarlo, no
  // repetirlo.
  await admin.rpc("billing_attach_provider_subscription", {
    p_intent_id: input.intentId, p_provider_subscription_id: null,
    p_init_point: null, p_provider_status: null, p_status: "provider_created",
    p_synced_amount: null, p_provider_version: null, p_next_payment_date: null });

  const referencia = buildAttemptReference(input.intentId);
  const cobro = await proveedor.chargePaymentSource({
    paymentSourceId: fuente.value.paymentSourceId,
    amountCopMinor: Number(intento.expected_total_amount),
    currency: String(intento.expected_currency),
    reference: referencia,
    customerEmail: input.customerEmail,
    // Wompi registra la tarjeta para cobros futuros del comercio en este
    // primer cargo. Sin esto, la renovación —que la programa Trazaloop— no
    // tendría con qué cobrar.
    recurrent: true,
  });
  if (!cobro.ok) {
    return { ok: false,
      code: cobro.failure === "invalid_request" ? "CARD_REJECTED" : "PROVIDER_UNAVAILABLE",
      detail: (cobro as { message?: string }).message ?? null };
  }
  return { ok: true, reference: referencia,
           providerStatus: cobro.value.status ?? "PENDING" };
}

/** Lo que de verdad ha pasado, leído del libro y no de lo que diga nadie. */
export type CheckoutStatus = {
  intentStatus: string;
  paymentStatus: string | null;
  subscriptionStatus: string | null;
  planCode: string | null;
  currentPeriodEnd: string | null;
  settled: boolean;
};

export async function readCheckoutStatus(
  intentId: string, organizationId: string
): Promise<CheckoutStatus | null> {
  const admin = createAdminClient();
  const { data: fila } = await admin.from("billing_checkout_intents")
    .select("id, organization_id, status, quote_id, billing_subscription_id")
    .eq("id", intentId).single();
  if (!fila) return null;
  const i = fila as {
    organization_id: string; status: string; quote_id: string;
    billing_subscription_id: string | null;
  };
  if (i.organization_id !== organizationId) return null;

  const { data: pago } = await admin.from("billing_payments")
    .select("status").eq("quote_id", i.quote_id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  type Susc = { status: string; plan_code: string; current_period_end: string };
  let suscripcion: Susc | null = null;
  if (i.billing_subscription_id) {
    const { data } = await admin.from("billing_subscriptions")
      .select("status, plan_code, current_period_end")
      .eq("id", i.billing_subscription_id).single();
    suscripcion = (data as unknown as Susc | null) ?? null;
  }

  return {
    intentStatus: i.status,
    paymentStatus: (pago as { status: string } | null)?.status ?? null,
    subscriptionStatus: suscripcion?.status ?? null,
    planCode: suscripcion?.plan_code ?? null,
    currentPeriodEnd: suscripcion?.current_period_end ?? null,
    // El derecho está puesto cuando lo puso el webhook, no cuando el navegador
    // vio una pantalla verde.
    settled: i.status === "settled" && suscripcion?.status === "active",
  };
}
