import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Trazaloop · PE-05B2 · La frontera del proveedor, del lado del servidor.
 *
 * DOS CLIENTES, Y NO ES CAPRICHO
 *
 * · Abrir un intento lo hace el ADMINISTRADOR de la empresa con su sesión:
 *   así RLS comprueba que el presupuesto es suyo y queda constancia de quién
 *   contrató.
 *
 * · Procesar un webhook no tiene sesión que valga —el que llama es una
 *   máquina— y necesita escribir en tablas que ningún cliente puede tocar. Ese
 *   camino usa `service_role`, y SOLO ese. No se convierte toda la
 *   facturación a `service_role` por comodidad: cada función privilegiada de
 *   este fichero está aquí porque el proveedor no tiene sesión, y por ninguna
 *   otra razón.
 *
 * Las funciones privilegiadas son exactamente cinco, todas concedidas solo a
 * `service_role` en 0171:
 *   1. anotar la notificación recibida
 *   2. cerrarla con su resultado
 *   3. anotar lo que devolvió el proveedor sobre la suscripción
 *   4. conciliar y liquidar un pago
 *   5. anotar un cobro de renovación
 */

export type OpenIntentResult =
  | {
      ok: true;
      intentId: string;
      organizationId: string;
      externalReference: string;
      expectedTotalAmount: number;
      expectedCurrency: string;
      billingInterval: "monthly" | "annual";
      planCode: string;
      billingEmail: string | null;
      billingEmailMissing: boolean;
    }
  | { ok: false; code: string };

/** Abrir un intento. Con la sesión de quien contrata, nunca con `service_role`. */
export async function openCheckoutIntent(
  quoteId: string, provider: string, environment: "test" | "live"
): Promise<OpenIntentResult> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_open_checkout_intent", {
    p_quote_id: quoteId, p_provider: provider, p_environment: environment,
  });
  if (error) {
    const m = error.message ?? "";
    for (const c of ["NOT_AUTHORIZED", "QUOTE_NOT_FOUND", "QUOTE_NOT_OPEN",
                     "QUOTE_EXPIRED", "ENVIRONMENT_INVALID", "AUTH_REQUIRED"]) {
      if (m.includes(c)) return { ok: false, code: c };
    }
    return { ok: false, code: "SYSTEM_ERROR" };
  }
  const r = data as Record<string, unknown>;
  return {
    ok: true,
    intentId: String(r.intent_id),
    organizationId: String(r.organization_id),
    externalReference: String(r.external_reference),
    expectedTotalAmount: Number(r.expected_total_amount),
    expectedCurrency: String(r.expected_currency),
    billingInterval: r.billing_interval as "monthly" | "annual",
    planCode: String(r.plan_code),
    billingEmail: typeof r.billing_email === "string" ? r.billing_email : null,
    billingEmailMissing: r.billing_email_missing === true,
  };
}

// ---------------------------------------------------------------------------
// Camino privilegiado · solo lo llama la ruta del webhook
// ---------------------------------------------------------------------------

export async function recordProviderEvent(input: {
  provider: string; topic: string; resourceId: string;
  signatureVerified: boolean; signatureFailureReason?: string | null;
  liveMode?: boolean | null; environment?: string | null;
  providerRequestId?: string | null; payload?: Record<string, unknown> | null;
}): Promise<{ eventId: string; attemptCount: number; isFirst: boolean } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_record_provider_event", {
    p_provider: input.provider, p_topic: input.topic, p_resource_id: input.resourceId,
    p_signature_verified: input.signatureVerified,
    p_signature_failure_reason: input.signatureFailureReason ?? null,
    p_live_mode: input.liveMode ?? null,
    p_environment: input.environment ?? null,
    p_provider_request_id: input.providerRequestId ?? null,
    p_payload: input.payload ?? null,
  });
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return { eventId: String(r.event_id), attemptCount: Number(r.attempt_count),
           isFirst: r.is_first === true };
}

export async function closeProviderEvent(input: {
  eventId: string; processingStatus: string; outcome?: string | null;
  errorClass?: string | null; organizationId?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc("billing_close_provider_event", {
    p_event_id: input.eventId, p_processing_status: input.processingStatus,
    p_outcome: input.outcome ?? null, p_error_class: input.errorClass ?? null,
    p_organization_id: input.organizationId ?? null,
  });
}

export async function attachProviderSubscription(input: {
  intentId: string; providerSubscriptionId: string | null; initPoint: string | null;
  providerStatus: string | null; status: string | null;
  syncedAmount?: number | null; providerVersion?: number | null;
  nextPaymentDate?: string | null;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_attach_provider_subscription", {
    p_intent_id: input.intentId,
    p_provider_subscription_id: input.providerSubscriptionId,
    p_init_point: input.initPoint,
    p_provider_status: input.providerStatus,
    p_status: input.status,
    p_synced_amount: input.syncedAmount ?? null,
    p_provider_version: input.providerVersion ?? null,
    p_next_payment_date: input.nextPaymentDate ?? null,
  });
  if (error || !data) return false;
  return (data as Record<string, unknown>).applied === true;
}

export type SettleOutcome = {
  outcome: string;
  organizationId?: string | null;
  paymentId?: string | null;
  subscriptionId?: string | null;
  intentId?: string | null;
};

export async function settleProviderPayment(input: {
  provider: string; externalReference: string | null; providerPaymentId: string;
  outcome: "approved" | "declined" | "failed";
  amount: number | null; currency: string | null;
  liveMode: boolean | null; failureReason?: string | null;
}): Promise<SettleOutcome> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_settle_provider_payment", {
    p_provider: input.provider, p_external_reference: input.externalReference,
    p_provider_payment_id: input.providerPaymentId, p_outcome: input.outcome,
    p_amount: input.amount, p_currency: input.currency,
    p_live_mode: input.liveMode, p_failure_reason: input.failureReason ?? null,
  });
  if (error || !data) return { outcome: "error" };
  const r = data as Record<string, unknown>;
  return {
    outcome: String(r.outcome),
    organizationId: (r.organization_id as string) ?? null,
    paymentId: (r.payment_id as string) ?? null,
    subscriptionId: (r.subscription_id as string) ?? null,
    intentId: (r.intent_id as string) ?? null,
  };
}

export async function recordRenewalPayment(input: {
  provider: string; providerSubscriptionId: string; providerPaymentId: string;
  outcome: "approved" | "declined" | "failed";
  amount: number | null; currency: string | null; liveMode: boolean | null;
}): Promise<SettleOutcome> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_record_renewal_payment", {
    p_provider: input.provider,
    p_provider_subscription_id: input.providerSubscriptionId,
    p_provider_payment_id: input.providerPaymentId,
    p_outcome: input.outcome, p_amount: input.amount,
    p_currency: input.currency, p_live_mode: input.liveMode,
  });
  if (error || !data) return { outcome: "error" };
  const r = data as Record<string, unknown>;
  return {
    outcome: String(r.outcome),
    organizationId: (r.organization_id as string) ?? null,
    paymentId: (r.payment_id as string) ?? null,
    subscriptionId: (r.subscription_id as string) ?? null,
  };
}

/**
 * Reconciliar un CICLO que el proveedor ya cobró.
 *
 * No cobra nada. Recibe un hecho ya releído del proveedor —su factura, su
 * fecha económica y su pago— y deja aquí, exactamente una vez, el periodo, el
 * pago y el derecho. Si el mismo hecho vuelve, devuelve `already_reconciled` y
 * no toca nada.
 *
 * Ni una palabra sobre `external_reference`: una suscripción nacida del
 * checkout de un plan no la tiene, y la lectura del proveedor lo confirmó.
 * Todo lo que hace falta cuelga del identificador de la suscripción.
 */
export async function reconcileProviderCycle(input: {
  provider: string;
  providerSubscriptionId: string;
  providerInvoiceId: string;
  providerCycleAt: string | null;
  providerPaymentId: string | null;
  outcome: "approved" | "declined" | "failed";
  amount: number | null; currency: string | null; liveMode: boolean | null;
  providerPlanId?: string | null;
}): Promise<SettleOutcome & { periodId?: string | null; cycleId?: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_reconcile_provider_cycle", {
    p_provider: input.provider,
    p_provider_subscription_id: input.providerSubscriptionId,
    p_provider_invoice_id: input.providerInvoiceId,
    p_provider_cycle_at: input.providerCycleAt,
    p_provider_payment_id: input.providerPaymentId,
    p_outcome: input.outcome,
    p_amount: input.amount,
    p_currency: input.currency,
    p_live_mode: input.liveMode,
    p_provider_plan_id: input.providerPlanId ?? null,
  });
  if (error || !data) return { outcome: "error" };
  const r = data as Record<string, unknown>;
  return {
    outcome: String(r.outcome),
    organizationId: (r.organization_id as string) ?? null,
    paymentId: (r.payment_id as string) ?? null,
    subscriptionId: (r.subscription_id as string) ?? null,
    periodId: (r.period_id as string) ?? null,
    cycleId: (r.cycle_id as string) ?? null,
  };
}

/**
 * De una suscripción viva al identificador del proveedor con el que se le
 * cobra. Es una LECTURA: no decide nada, solo traduce.
 *
 * Con un proveedor que lleva su propia suscripción, ese identificador es la
 * suscripción del proveedor. Con uno que solo guarda un medio de pago, es ese
 * medio. El intento lo guarda en el mismo sitio en los dos casos, así que el
 * dominio no necesita saber cuál de las dos cosas es.
 */
export async function resolveRenewalTarget(subscriptionId: string): Promise<{
  providerSubscriptionId: string; organizationId: string;
} | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("billing_checkout_intents")
    .select("provider_subscription_id, organization_id")
    .eq("billing_subscription_id", subscriptionId)
    .not("provider_subscription_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const fila = (data ?? [])[0] as
    { provider_subscription_id: string; organization_id: string } | undefined;
  if (!fila?.provider_subscription_id) return null;
  return { providerSubscriptionId: fila.provider_subscription_id,
           organizationId: fila.organization_id };
}

/** ¿Esta suscripción sigue viva? Lo que decide el enrutado es el ESTADO. */
export async function subscriptionIsLive(subscriptionId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_subscriptions")
    .select("status").eq("id", subscriptionId).single();
  const estado = (data as { status?: string } | null)?.status;
  return estado === "active" || estado === "past_due"
    || estado === "pending" || estado === "cancel_at_period_end";
}

/**
 * QUÉ ES ESTE COBRO, según la base y no según la referencia.
 *
 * Un intento sin periodo es una CONTRATACIÓN; con periodo, la renovación de esa
 * obligación concreta. La cadena que viajó al proveedor solo dijo qué intento
 * era; el significado vive aquí.
 */
export async function classifyAttempt(attemptId: string): Promise<
  | { kind: "initial"; intentId: string; organizationId: string }
  | { kind: "renewal"; intentId: string; periodId: string; organizationId: string }
  | { kind: "upgrade"; intentId: string; changeId: string; organizationId: string }
  | null
> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("billing_checkout_intents")
    .select("id, period_id, subscription_change_id, organization_id")
    .eq("id", attemptId).single();
  if (error || !data) return null;
  const d = data as { id: string; period_id: string | null;
                      subscription_change_id: string | null; organization_id: string };
  // La SUBIDA se mira primero: no tiene periodo propio —se paga sobre uno que ya
  // está saldado— y si se dejara caer en la rama de contratación acabaría
  // creando una segunda suscripción para la misma empresa.
  if (d.subscription_change_id) {
    return { kind: "upgrade", intentId: d.id, changeId: d.subscription_change_id,
             organizationId: d.organization_id };
  }
  return d.period_id
    ? { kind: "renewal", intentId: d.id, periodId: d.period_id,
        organizationId: d.organization_id }
    : { kind: "initial", intentId: d.id, organizationId: d.organization_id };
}

/**
 * Cierra el intento de cobro cuando su cargo ya tiene desenlace.
 *
 * La contratación inicial cerraba su intento sola —lo hace la primitiva que la
 * salda—, pero la renovación se dirige al PERIODO y no al intento, así que el
 * intento se quedaba dicho «en vuelo» cuando ya no lo estaba. La regla de un
 * solo cobro en vuelo por obligación depende de que ese estado sea verdad.
 */
export async function closeAttempt(
  intentId: string,
  outcome: string,
): Promise<string | null> {
  const estado = ({
    renewed: "settled",
    declined: "declined",
    failed: "failed",
    // Dinero de más sobre una obligación ya saldada: lo mira una persona.
    period_already_settled: "manual_review",
  } as Record<string, string>)[outcome];
  // Una reentrega —`already_settled`— no toca nada: el intento lo cerró la
  // primera entrega y volver a escribirlo sería inventar un segundo desenlace.
  if (!estado) return null;

  const admin = createAdminClient();
  await admin.rpc("billing_attach_provider_subscription", {
    p_intent_id: intentId, p_provider_subscription_id: null,
    p_init_point: null, p_provider_status: null, p_status: estado,
    p_synced_amount: null, p_provider_version: null, p_next_payment_date: null });
  return estado;
}

/** Salda la obligación de un periodo. Una vez, y el dinero de más no se pierde. */
export async function settlePeriodPayment(input: {
  periodId: string; provider: string; providerPaymentId: string;
  outcome: "approved" | "declined" | "failed";
  amount: number | null; currency: string | null; liveMode: boolean | null;
}): Promise<SettleOutcome & { periodSequence?: number | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_settle_period_payment", {
    p_period_id: input.periodId, p_provider: input.provider,
    p_provider_payment_id: input.providerPaymentId, p_outcome: input.outcome,
    p_amount: input.amount, p_currency: input.currency, p_live_mode: input.liveMode,
  });
  if (error || !data) return { outcome: "error" };
  const r = data as Record<string, unknown>;
  return {
    outcome: String(r.outcome),
    organizationId: (r.organization_id as string) ?? null,
    paymentId: (r.payment_id as string) ?? null,
    subscriptionId: (r.subscription_id as string) ?? null,
    periodSequence: (r.period_sequence as number) ?? null,
  };
}

export async function markProviderSubscriptionState(input: {
  provider: string; providerSubscriptionId: string;
  providerStatus: string | null; canonicalStatus: string | null;
  providerVersion?: number | null;
}): Promise<SettleOutcome> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_mark_provider_subscription_state", {
    p_provider: input.provider,
    p_provider_subscription_id: input.providerSubscriptionId,
    p_provider_status: input.providerStatus,
    p_canonical_status: input.canonicalStatus,
    p_provider_version: input.providerVersion ?? null,
  });
  if (error || !data) return { outcome: "error" };
  const r = data as Record<string, unknown>;
  return { outcome: String(r.outcome),
           organizationId: (r.organization_id as string) ?? null,
           intentId: (r.intent_id as string) ?? null };
}
