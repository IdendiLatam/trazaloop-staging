import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RenewalFailureClass } from "@/lib/billing/provider";

/**
 * Trazaloop · PE-05B5B · El libro, para el cobro que se hace solo.
 *
 * Transporta y nada más. Cada decisión —qué vence, cuánto cuesta, si se puede
 * saldar, si hay que dejar caer— vive en una función de la base, porque es la
 * única capa donde dos procesos simultáneos ven lo mismo.
 */

export type DueAction =
  | "renew"
  | "retry"
  | "lapse_due"
  | "cancel_due"
  | "downgrade_due"
  | "manual_review_required"
  | "payment_method_unavailable";

export type DueRenewal = {
  action: DueAction;
  subscriptionId: string;
  organizationId: string;
  /** Nulo cuando toca ABRIR el periodo siguiente: todavía no existe. */
  periodId: string | null;
  periodSequence: number;
  dueAt: string;
  graceEnd: string;
  attemptNumber: number;
  slot: number;
  paymentMethodId: string | null;
};

export async function listDueRenewals(input: {
  now?: string; limit?: number;
} = {}): Promise<DueRenewal[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_due_renewals", {
    p_now: input.now ?? new Date().toISOString(),
    p_limit: input.limit ?? 100,
  });
  if (error) throw new Error(`DUE_QUERY_FAILED:${error.message}`);
  type Fila = {
    action: DueAction; subscription_id: string; organization_id: string;
    period_id: string | null; period_sequence: number; due_at: string;
    grace_end: string; attempt_number: number; slot: number;
    payment_method_id: string | null;
  };
  return ((data ?? []) as unknown as Fila[]).map((r) => ({
    action: r.action, subscriptionId: r.subscription_id,
    organizationId: r.organization_id, periodId: r.period_id,
    periodSequence: r.period_sequence, dueAt: r.due_at, graceEnd: r.grace_end,
    attemptNumber: r.attempt_number, slot: r.slot,
    paymentMethodId: r.payment_method_id,
  }));
}

export type OpenPeriodResult = {
  status: string;
  periodId?: string;
  periodSequence?: number;
  reason?: string;
};

export async function openNextPeriod(subscriptionId: string): Promise<OpenPeriodResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_open_next_period",
    { p_subscription_id: subscriptionId });
  if (error) throw new Error(`OPEN_PERIOD_FAILED:${error.message}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return { status: String(r.status), periodId: r.period_id as string | undefined,
           periodSequence: r.period_sequence as number | undefined,
           reason: r.reason as string | undefined };
}

export type PeriodCharge = {
  status: string;
  baseAmount?: number;
  chargeCurrency?: string;
  taxAmount?: number;
  totalAmount?: number;
  reason?: string;
};

/** Lo que cuesta la obligación. NO se calcula aquí: se pregunta. */
export async function readPeriodCharge(periodId: string): Promise<PeriodCharge> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_period_charge_total",
    { p_period_id: periodId });
  if (error) throw new Error(`CHARGE_TOTAL_FAILED:${error.message}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    status: String(r.status),
    baseAmount: r.base_amount === undefined ? undefined : Number(r.base_amount),
    chargeCurrency: r.charge_currency as string | undefined,
    taxAmount: r.tax_amount === undefined ? undefined : Number(r.tax_amount),
    totalAmount: r.total_amount === undefined ? undefined : Number(r.total_amount),
    reason: r.reason as string | undefined,
  };
}

export type RenewalAttempt = {
  intentId: string;
  expectedTotalAmount: number;
  expectedCurrency: string;
  providerPaymentMethodId: string;
  customerEmail: string;
};

/**
 * Abre el intento de cobro de una obligación.
 *
 * Devuelve `null` si el índice de 0173 lo impide, que es exactamente lo que
 * tiene que pasar cuando otro trabajador se adelantó o cuando hay un cobro sin
 * resolver: no se manda un segundo cargo por el mismo mes.
 */
export async function openRenewalAttempt(input: {
  organizationId: string; subscriptionId: string; periodId: string;
  paymentMethodId: string;
}): Promise<RenewalAttempt | null> {
  const admin = createAdminClient();

  const { data: sub } = await admin.from("billing_subscriptions")
    .select("plan_code, billing_interval, provider, charge_currency")
    .eq("id", input.subscriptionId).single();
  if (!sub) return null;
  const s = sub as { plan_code: string; billing_interval: string; provider: string };

  const cargo = await readPeriodCharge(input.periodId);
  if (cargo.status !== "found") return null;

  // El presupuesto de origen: una renovación no abre uno nuevo, hereda el de la
  // contratación para que la historia siga atada a lo que se contrató.
  const { data: origen } = await admin.from("billing_checkout_intents")
    .select("quote_id, environment").eq("billing_subscription_id", input.subscriptionId)
    .order("created_at").limit(1).single();
  if (!origen) return null;
  const o = origen as { quote_id: string; environment: string };

  const { data: pm } = await admin.from("billing_payment_methods")
    .select("provider_payment_method_id, provider, environment, status, organization_id")
    .eq("id", input.paymentMethodId).single();
  if (!pm) return null;
  const m = pm as {
    provider_payment_method_id: string; provider: string; environment: string;
    status: string; organization_id: string;
  };
  // Las cuatro identidades, otra vez, aquí. Que la selección ya lo mirara no
  // es motivo para no volver a comprobarlo antes de mover dinero.
  if (m.organization_id !== input.organizationId || m.provider !== s.provider
      || m.environment !== o.environment || m.status !== "active") {
    return null;
  }

  const { data: intento, error } = await admin.from("billing_checkout_intents")
    .insert({
      organization_id: input.organizationId, quote_id: o.quote_id,
      provider: s.provider, environment: o.environment,
      expected_total_amount: cargo.totalAmount, expected_currency: cargo.chargeCurrency,
      billing_interval: s.billing_interval, plan_code: s.plan_code,
      period_id: input.periodId, billing_subscription_id: input.subscriptionId,
      payment_method_id: input.paymentMethodId, status: "created",
    }).select("id").single();
  // Un choque con el índice de «un solo cobro en vuelo» no es un error del
  // programa: es la regla funcionando.
  if (error || !intento) return null;

  const { data: correo } = await admin.rpc("billing_renewal_customer_email",
    { p_organization_id: input.organizationId });

  return {
    intentId: (intento as { id: string }).id,
    expectedTotalAmount: Number(cargo.totalAmount),
    expectedCurrency: String(cargo.chargeCurrency),
    providerPaymentMethodId: m.provider_payment_method_id,
    customerEmail: typeof correo === "string" && correo.length > 0
      ? correo : "facturacion@trazaloop.com",
  };
}

/** La frontera del envío. Se escribe ANTES de la llamada, nunca después. */
export async function markProviderSubmitted(intentId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("billing_checkout_intents")
    .update({ status: "provider_created", provider_submitted_at: new Date().toISOString() })
    .eq("id", intentId);
}

export async function markRenewalFailure(input: {
  intentId: string; failureClass: RenewalFailureClass; reason?: string | null;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_mark_renewal_failure", {
    p_intent_id: input.intentId, p_failure_class: input.failureClass,
    p_failure_reason: input.reason ?? null,
  });
  if (error) throw new Error(`MARK_FAILURE_FAILED:${error.message}`);
  return String((data as Record<string, unknown>).status);
}

export async function lapseSubscription(subscriptionId: string): Promise<string> {
  return llamarTransicion("billing_lapse_subscription", subscriptionId);
}

/** La cancelación se ejecuta cuando el mes pagado termina, no cuando se pidió. */
export async function cancelAtPeriodEnd(subscriptionId: string): Promise<string> {
  return llamarTransicion("billing_cancel_at_period_end", subscriptionId);
}

/** El cambio de plan programado, con el importe que se congeló al programarlo. */
export async function applyScheduledChange(subscriptionId: string): Promise<string> {
  return llamarTransicion("billing_apply_scheduled_change", subscriptionId);
}

async function llamarTransicion(fn: string, subscriptionId: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(fn, { p_subscription_id: subscriptionId });
  if (error) throw new Error(`${fn.toUpperCase()}_FAILED:${error.message}`);
  return String((data as Record<string, unknown>).status);
}

/**
 * La historia de las pasadas. OBSERVACIÓN, no autoridad: si esta tabla se
 * perdiera entera, no se perdería ni un peso de verdad financiera. Por eso se
 * abre y se cierra fuera de cualquier transacción de dinero, y por eso un fallo
 * al escribirla no puede tumbar una pasada.
 */
export async function openRenewalRun(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("billing_renewal_runs")
      .insert({ status: "running" }).select("id").single();
    return (data as { id: string } | null)?.id ?? null;
  } catch { return null; }
}

export async function closeRenewalRun(input: {
  runId: string | null;
  status: "success" | "partial" | "failed";
  counts: Record<string, number>;
  decisions: unknown[];
}): Promise<void> {
  if (!input.runId) return;
  try {
    const admin = createAdminClient();
    await admin.from("billing_renewal_runs").update({
      finished_at: new Date().toISOString(),
      status: input.status,
      due_found: input.counts.dueFound ?? 0,
      charged: input.counts.charged ?? 0,
      retried: input.counts.retried ?? 0,
      lapsed: input.counts.lapsed ?? 0,
      skipped: input.counts.skipped ?? 0,
      failures: input.counts.failures ?? 0,
      decisions: input.decisions,
    }).eq("id", input.runId);
  } catch { /* la observación no manda sobre el trabajo */ }
}
