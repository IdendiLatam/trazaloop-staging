import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-05B6C · Los cobros de una empresa, para la empresa.
 *
 * Todo sale de la INSTANTÁNEA guardada en cada cobro: importe, impuesto,
 * descuento y moneda de aquel día. No se pregunta al catálogo ni a la campaña,
 * porque las dos pueden haber cambiado y lo que se cobró no cambia con ellas.
 *
 * Y no sale nada del proveedor. Ni identificadores de transacción, ni medios de
 * pago, ni clases de fallo: eso es vocabulario de dentro.
 */

export type PaymentHistoryRow = {
  id: string;
  paidAt: string | null;
  createdAt: string;
  planCode: string | null;
  billingInterval: string | null;
  /** Qué fue este cobro. Un cambio de plan no es una renovación. */
  kind: "suscripcion" | "cambio_de_plan";
  /** Para un cambio de plan, de dónde a dónde. */
  changeSummary: string | null;
  status: "pagado" | "rechazado" | "no_completado" | "en_revision";
  baseAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
};

/** Los nombres comerciales, aquí también: el historial no habla en codigos. */
const ETIQUETA: Record<string, string> = { free: "Free", full: "Full", extra: "Extra" };

const LEGIBLE: Record<string, PaymentHistoryRow["status"]> = {
  approved: "pagado",
  declined: "rechazado",
  failed: "no_completado",
  manual_review: "en_revision",
};

export async function listPaymentHistory(
  organizationId: string, limit = 24
): Promise<PaymentHistoryRow[] | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("billing_payments")
    .select("id, created_at, paid_at, status, base_amount, discount_amount,"
      + " tax_amount, total_amount, currency, subscription_id,"
      + " subscription_change_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) return null;

  // El plan de cada cobro sale de su suscripción, que no cambia de plan sin una
  // transición comercial explícita.
  const { data: subs } = await supabase.from("billing_subscriptions")
    .select("id, plan_code, billing_interval").eq("organization_id", organizationId);
  const plan = new Map(((subs ?? []) as
    { id: string; plan_code: string; billing_interval: string }[])
    .map((s) => [s.id, s]));

  // Una subida de plan NO es una renovación, y llamarla igual esconde la única
  // línea del historial que el cliente no espera ver.
  const { data: cambios } = await supabase.from("billing_subscription_changes")
    .select("id, from_plan_code, to_plan_code").eq("organization_id", organizationId);
  const cambio = new Map(((cambios ?? []) as
    { id: string; from_plan_code: string; to_plan_code: string }[])
    .map((c) => [c.id, c]));

  type Fila = {
    id: string; created_at: string; paid_at: string | null; status: string;
    base_amount: number; discount_amount: number; tax_amount: number;
    total_amount: number; currency: string; subscription_id: string | null;
    subscription_change_id: string | null;
  };
  return ((data ?? []) as unknown as Fila[]).map((r) => {
    const s = r.subscription_id ? plan.get(r.subscription_id) : undefined;
    const c = r.subscription_change_id ? cambio.get(r.subscription_change_id) : undefined;
    return {
      id: r.id,
      kind: c ? ("cambio_de_plan" as const) : ("suscripcion" as const),
      changeSummary: c ? `${ETIQUETA[c.from_plan_code] ?? c.from_plan_code} a `
                       + `${ETIQUETA[c.to_plan_code] ?? c.to_plan_code}` : null,
      paidAt: r.paid_at,
      createdAt: r.created_at,
      planCode: s?.plan_code ?? null,
      billingInterval: s?.billing_interval ?? null,
      // Un estado que no sepamos traducir va a revisión, no a «pagado».
      status: LEGIBLE[r.status] ?? "en_revision",
      baseAmount: Number(r.base_amount),
      discountAmount: Number(r.discount_amount),
      taxAmount: Number(r.tax_amount),
      totalAmount: Number(r.total_amount),
      currency: r.currency,
    };
  });
}
