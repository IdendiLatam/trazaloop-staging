import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Trazaloop · PE-05B6E · Subir de plan hoy.
 *
 * NADA DE ESTO CALCULA DINERO. Lo calcula `billing_quote_upgrade` en la base,
 * que es quien tiene el importe congelado del plan actual, el catálogo del
 * destino, la tasa vigente y la regla fiscal. Esta capa transporta y traduce
 * códigos a algo que una persona pueda leer.
 */

export type UpgradeQuote = {
  changeId: string;
  fromPlanCode: string;
  toPlanCode: string;
  billingInterval: "monthly" | "annual";
  /** El día en que renueva, y que NO se mueve por subir de plan. */
  renewsAt: string;
  remainingSeconds: number;
  periodSeconds: number;
  currentFullBase: number;
  targetFullBase: number;
  proratedCurrentBase: number;
  proratedTargetBase: number;
  deltaBase: number;
  taxRateBasisPoints: number;
  taxAmount: number;
  totalAmount: number;
  chargeCurrency: string;
};

/** Por qué no se puede subir ahora mismo. Cada uno tiene su frase. */
export type UpgradeBlock =
  | "already_on_plan"
  | "not_upgradable"
  | "change_already_scheduled"
  | "cancellation_scheduled"
  | "upgrade_already_pending"
  | "period_unpaid"
  | "period_ended"
  | "period_not_started"
  | "anchor_missing"
  | "no_positive_delta"
  | "subscription_not_found"
  | "fx_unavailable"
  | "not_authorized"
  | "unavailable";

export type UpgradeQuoteResult =
  | { ok: true; quote: UpgradeQuote }
  | { ok: false; block: UpgradeBlock };

function traducirError(mensaje: string): UpgradeBlock {
  if (/FX_RATE_UNAVAILABLE/.test(mensaje)) return "fx_unavailable";
  if (/NOT_AUTHORIZED/.test(mensaje)) return "not_authorized";
  return "unavailable";
}

export async function quoteUpgrade(
  subscriptionId: string, targetPlanCode: string
): Promise<UpgradeQuoteResult> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_quote_upgrade", {
    p_subscription_id: subscriptionId, p_target_plan_code: targetPlanCode });
  if (error) return { ok: false, block: traducirError(error.message) };

  const r = (data ?? {}) as Record<string, unknown>;
  if (r.status !== "quoted") {
    return { ok: false, block: (String(r.status ?? "unavailable") as UpgradeBlock) };
  }
  return { ok: true, quote: {
    changeId: String(r.change_id),
    fromPlanCode: String(r.from_plan_code),
    toPlanCode: String(r.to_plan_code),
    billingInterval: r.billing_interval as "monthly" | "annual",
    renewsAt: String(r.renews_at),
    remainingSeconds: Number(r.remaining_seconds),
    periodSeconds: Number(r.period_seconds),
    currentFullBase: Number(r.current_full_base),
    targetFullBase: Number(r.target_full_base),
    proratedCurrentBase: Number(r.prorated_current_base),
    proratedTargetBase: Number(r.prorated_target_base),
    deltaBase: Number(r.delta_base),
    taxRateBasisPoints: Number(r.tax_rate_basis_points),
    taxAmount: Number(r.tax_amount),
    totalAmount: Number(r.total_amount),
    chargeCurrency: String(r.charge_currency),
  } };
}

/** Abre el intento de cobro. Desde aquí la subida ya está enviada. */
export async function openUpgradeIntent(
  changeId: string, provider: string, environment: "test" | "live"
): Promise<{ ok: true; intentId: string; total: number; currency: string }
         | { ok: false; block: string }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_open_upgrade_intent", {
    p_change_id: changeId, p_provider: provider, p_environment: environment });
  if (error) return { ok: false, block: traducirError(error.message) };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.status !== "opened") return { ok: false, block: String(r.status ?? "unavailable") };
  return { ok: true, intentId: String(r.intent_id),
           total: Number(r.expected_total_amount),
           currency: String(r.expected_currency) };
}

export async function cancelUpgrade(changeId: string): Promise<string> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_cancel_upgrade",
    { p_change_id: changeId });
  if (error) return "unavailable";
  return String(((data ?? {}) as Record<string, unknown>).status ?? "unavailable");
}

/** El medio de pago guardado de la empresa. Sin él no hay subida inmediata. */
export async function activePaymentMethod(
  organizationId: string, provider: string, environment: "test" | "live"
): Promise<{ id: string; providerPaymentMethodId: string } | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_payment_methods")
    .select("id, provider_payment_method_id")
    .eq("organization_id", organizationId).eq("provider", provider)
    .eq("environment", environment).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1);
  const fila = ((data ?? [])[0]) as
    { id: string; provider_payment_method_id: string } | undefined;
  return fila ? { id: fila.id, providerPaymentMethodId: fila.provider_payment_method_id }
              : null;
}

/** La conciliación de una subida. Solo la llama el webhook. */
export async function settleUpgradePayment(input: {
  intentId: string; provider: string; providerPaymentId: string | null;
  outcome: "approved" | "declined" | "failed";
  amount: number | null; currency: string | null;
  liveMode: boolean | null; failureReason?: string | null;
}): Promise<{ outcome: string; organizationId: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_settle_upgrade_payment", {
    p_intent_id: input.intentId, p_provider: input.provider,
    p_provider_payment_id: input.providerPaymentId, p_outcome: input.outcome,
    p_amount: input.amount, p_currency: input.currency,
    p_live_mode: input.liveMode, p_failure_reason: input.failureReason ?? null });
  if (error) return { outcome: "settlement_failed", organizationId: null };
  const r = (data ?? {}) as Record<string, unknown>;
  return { outcome: String(r.outcome ?? "unknown"),
           organizationId: (r.organization_id as string | null) ?? null };
}

/** Salió sin respuesta. Ni se concede, ni se declara fallida, ni se reintenta. */
export async function markUpgradeUncertain(
  intentId: string, reason: string
): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("billing_mark_upgrade_uncertain",
    { p_intent_id: intentId, p_reason: reason });
  return String(((data ?? {}) as Record<string, unknown>).status ?? "unknown");
}

/** El estado de una subida, para contárselo a quien la pidió. */
export async function readUpgrade(changeId: string): Promise<
  { status: string; toPlanCode: string; totalAmount: number;
    chargeCurrency: string } | null
> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("billing_subscription_changes")
    .select("status, to_plan_code, total_amount, charge_currency")
    .eq("id", changeId).single();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return { status: String(r.status), toPlanCode: String(r.to_plan_code),
           totalAmount: Number(r.total_amount),
           chargeCurrency: String(r.charge_currency) };
}

/** La subida que está esperando desenlace, si la hay. */
export async function pendingUpgrade(organizationId: string): Promise<
  { changeId: string; status: string; toPlanCode: string;
    totalAmount: number; chargeCurrency: string } | null
> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("billing_subscription_changes")
    .select("id, status, to_plan_code, total_amount, charge_currency")
    .eq("organization_id", organizationId)
    .in("status", ["pending", "submitted"])
    .order("created_at", { ascending: false }).limit(1);
  const r = ((data ?? [])[0]) as Record<string, unknown> | undefined;
  return r ? { changeId: String(r.id), status: String(r.status),
               toPlanCode: String(r.to_plan_code),
               totalAmount: Number(r.total_amount),
               chargeCurrency: String(r.charge_currency) } : null;
}
