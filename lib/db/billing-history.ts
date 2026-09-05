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
  status: "pagado" | "rechazado" | "no_completado" | "en_revision";
  baseAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
};

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
      + " tax_amount, total_amount, currency, subscription_id")
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

  type Fila = {
    id: string; created_at: string; paid_at: string | null; status: string;
    base_amount: number; discount_amount: number; tax_amount: number;
    total_amount: number; currency: string; subscription_id: string | null;
  };
  return ((data ?? []) as unknown as Fila[]).map((r) => {
    const s = r.subscription_id ? plan.get(r.subscription_id) : undefined;
    return {
      id: r.id,
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
