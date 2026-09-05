import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-05B1 · La facturación, del lado del servidor.
 *
 * El importe no se calcula aquí. Se PIDE a la base, que es la única autoridad:
 * plan, revisión, tipo de cambio, clase de servicio, regla fiscal, impuesto y
 * total salen de `billing_create_quote`. Esta capa transporta.
 */
export type QuoteResult =
  | {
      ok: true;
      quoteId: string;
      planCode: string;
      billingInterval: "monthly" | "annual";
      catalogAmountMinor: number;
      catalogCurrency: string;
      /** Lo que el cupón descontó, si lo hubo. Nunca llega del navegador. */
      couponCode: string | null;
      promotionName: string | null;
      discountBasisPoints: number | null;
      discountAmount: number;
      chargeCurrency: string;
      fxRateMicros: number;
      baseAmount: number;
      serviceClass: string;
      taxRateBasisPoints: number;
      taxAmount: number;
      totalAmount: number;
      expiresAt: string;
    }
  | { ok: false; code: QuoteErrorCode };

export type QuoteErrorCode =
  | "COUPON_NOT_APPLICABLE"
  | "NOT_AUTHORIZED"
  | "PLAN_NOT_PURCHASABLE"
  | "PLAN_PRICE_NOT_CONFIGURED"
  | "FX_RATE_UNAVAILABLE"
  | "TAX_RULE_UNAVAILABLE"
  | "BILLING_INTERVAL_INVALID"
  | "SYSTEM_ERROR";

export const QUOTE_ERROR_MESSAGE: Record<QuoteErrorCode, string> = {
  // Se dice que no vale, y NO por qué: la regla interna de una campaña no es
  // asunto de quien teclea el código, y contarla enseña a buscarle la vuelta.
  COUPON_NOT_APPLICABLE:
    "Ese código no se puede aplicar a este plan. No se cobró nada.",
  NOT_AUTHORIZED:
    "Solo quien administra la empresa puede contratar un plan.",
  PLAN_NOT_PURCHASABLE:
    "Ese plan no se contrata: Free es el plan de entrada y la prueba se activa sola.",
  PLAN_PRICE_NOT_CONFIGURED:
    "Ese plan todavía no tiene precio publicado. No se cobró nada.",
  // No se dice «error» a secas: se dice qué falta y que no se cobró.
  FX_RATE_UNAVAILABLE:
    "Todavía no podemos mostrarte el importe exacto en pesos. No se cobró nada; "
    + "inténtalo de nuevo en un momento o escríbenos.",
  TAX_RULE_UNAVAILABLE:
    "No pudimos determinar los impuestos aplicables. No se cobró nada; "
    + "inténtalo de nuevo en un momento o escríbenos.",
  BILLING_INTERVAL_INVALID: "Elige facturación mensual o anual.",
  SYSTEM_ERROR: "No fue posible preparar el pago. No se cobró nada.",
};

function clasificar(message: string): QuoteErrorCode {
  for (const c of ["COUPON_NOT_APPLICABLE", "PLAN_NOT_PURCHASABLE",
    "PLAN_PRICE_NOT_CONFIGURED", "FX_RATE_UNAVAILABLE", "TAX_RULE_UNAVAILABLE",
    "BILLING_INTERVAL_INVALID", "NOT_AUTHORIZED"] as const) {
    if (message.includes(c)) return c;
  }
  return "SYSTEM_ERROR";
}

const n = (v: unknown): number => (typeof v === "number" ? v : Number(v));

/**
 * El navegador manda INTENCIONES —qué plan y cada cuánto—. Todo lo demás lo
 * resuelve el servidor. Un `amount` que llegue del cliente no se valida: no se
 * mira.
 */
export async function createBillingQuote(
  organizationId: string,
  planCode: string,
  billingInterval: string,
  couponCode?: string | null
): Promise<QuoteResult> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_create_quote", {
    p_organization_id: organizationId,
    p_plan_code: planCode,
    p_billing_interval: billingInterval,
    // Un CÓDIGO. Nunca un porcentaje y nunca un importe: el descuento lo
    // calcula la base, que es la única que puede comprobar si aplica.
    p_coupon_code: couponCode ?? null,
  });
  if (error) return { ok: false, code: clasificar(error.message ?? "") };
  const r = (data ?? {}) as Record<string, unknown>;
  if (typeof r.quote_id !== "string") return { ok: false, code: "SYSTEM_ERROR" };
  return {
    ok: true,
    quoteId: r.quote_id,
    planCode: String(r.plan_code),
    billingInterval: r.billing_interval === "annual" ? "annual" : "monthly",
    catalogAmountMinor: n(r.catalog_amount_minor),
    catalogCurrency: String(r.catalog_currency),
    couponCode: typeof r.coupon_code === "string" ? r.coupon_code : null,
    promotionName: typeof r.promotion_name === "string" ? r.promotion_name : null,
    discountBasisPoints: r.discount_basis_points === null
      || r.discount_basis_points === undefined ? null : n(r.discount_basis_points),
    discountAmount: n(r.discount_amount ?? 0),
    chargeCurrency: String(r.charge_currency),
    fxRateMicros: n(r.fx_rate_micros),
    baseAmount: n(r.base_amount),
    serviceClass: String(r.service_class),
    taxRateBasisPoints: n(r.tax_rate_basis_points),
    taxAmount: n(r.tax_amount),
    totalAmount: n(r.total_amount),
    expiresAt: String(r.expires_at),
  };
}

export type OrganizationBillingState = {
  hasSubscription: boolean;
  subscriptionId: string | null;
  planCode: string | null;
  billingInterval: "monthly" | "annual" | null;
  status: string | null;
  baseChargeAmount: number | null;
  chargeCurrency: string | null;
  currentPeriodEnd: string | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  graceUntil: string | null;
  lastPaymentStatus: string | null;
  lastPaymentAt: string | null;
  /** Hay dinero en duda: ni se afirma que falló, ni que se cobró. */
  manualReview: boolean;
  /** No hay medio de pago utilizable para el próximo cobro. */
  paymentMethodMissing: boolean;
  downgradeScheduled: boolean;
};

/** `null` = no se pudo leer. Distinto de «no tiene suscripción». */
export async function getOrganizationBillingState(
  organizationId: string
): Promise<OrganizationBillingState | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("organization_billing_state", {
    p_organization_id: organizationId,
  });
  if (error || !data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  const num = (v: unknown) => (v === null || v === undefined ? null : n(v));
  const str = (v: unknown) => (typeof v === "string" ? v : null);

  // Dos cosas que la pantalla necesita para hablar sin mentir: si hay dinero en
  // duda —y entonces no se dice ni que falló ni que se cobró— y si falta con
  // qué cobrar. Se preguntan al dominio; no se deducen del estado.
  const subId = str(r.subscription_id);
  let enDuda = false;
  if (subId) {
    const { data: duda } = await supabase.rpc("billing_has_unresolved_charge",
      { p_subscription_id: subId });
    enDuda = duda === true;
  }
  const { count: tarjetas } = await supabase.from("billing_payment_methods")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId).eq("status", "active");

  return {
    hasSubscription: r.has_subscription === true,
    subscriptionId: str(r.subscription_id),
    planCode: str(r.plan_code),
    billingInterval: (str(r.billing_interval) as "monthly" | "annual" | null) ?? null,
    status: str(r.status),
    baseChargeAmount: num(r.base_charge_amount),
    chargeCurrency: str(r.charge_currency),
    currentPeriodEnd: str(r.current_period_end),
    renewsAt: str(r.renews_at),
    cancelAtPeriodEnd: r.cancel_at_period_end === true,
    graceUntil: str(r.grace_until),
    manualReview: enDuda,
    paymentMethodMissing: (tarjetas ?? 0) === 0,
    downgradeScheduled: r.scheduled_plan_revision_id !== null
      && r.scheduled_plan_revision_id !== undefined,
    lastPaymentStatus: str(r.last_payment_status),
    lastPaymentAt: str(r.last_payment_at),
  };
}
