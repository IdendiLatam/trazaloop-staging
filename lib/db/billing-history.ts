import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-05B6C / B6F · Los cobros de una empresa, para la empresa.
 *
 * TODO SALE DE HECHOS CONGELADOS, Y ESA ES LA REGLA ENTERA
 *
 * Importe, descuento, impuesto y moneda vienen de la instantánea que guarda
 * cada cobro. El plan y la periodicidad vienen de la OBLIGACIÓN que ese cobro
 * saldó —que desde 0182 los lleva congelados— o del presupuesto que lo originó.
 *
 * Antes se deducían mirando la suscripción de HOY, y eso hacía que una
 * renovación pagada siendo Full pasara a decir «Extra» en cuanto la empresa
 * subía de plan. Un hecho financiero tiene que poder contarse con lo que se
 * sabía entonces; si no, no es historia, es una foto del presente disfrazada.
 *
 * Y no sale nada del proveedor. Ni identificadores de transacción, ni medios de
 * pago, ni clases de fallo: eso es vocabulario de dentro.
 */

export type PaymentHistoryRow = {
  id: string;
  paidAt: string | null;
  createdAt: string;
  /** Qué fue este cobro, en palabras. */
  concept: "suscripcion" | "renovacion" | "cambio_de_plan";
  /** El plan que se estaba cobrando ENTONCES. Nulo si no consta. */
  planCode: string | null;
  billingInterval: string | null;
  /** Para un cambio de plan, de dónde a dónde. */
  changeSummary: string | null;
  status: "pagado" | "rechazado" | "no_completado" | "en_revision";
  baseAmount: number;
  discountAmount: number;
  taxAmount: number;
  taxRateBasisPoints: number | null;
  totalAmount: number;
  currency: string;
};

const LEGIBLE: Record<string, PaymentHistoryRow["status"]> = {
  approved: "pagado",
  declined: "rechazado",
  failed: "no_completado",
  manual_review: "en_revision",
};

/** Los nombres comerciales; el historial no habla en códigos. */
const ETIQUETA: Record<string, string> = { free: "Free", full: "Full", extra: "Extra" };

export async function listPaymentHistory(
  organizationId: string, limit = 24
): Promise<PaymentHistoryRow[] | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("billing_payments")
    .select("id, created_at, paid_at, status, base_amount, discount_amount,"
      + " tax_amount, tax_rate_basis_points, total_amount, currency,"
      + " period_id, quote_id, subscription_change_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) return null;

  type Fila = {
    id: string; created_at: string; paid_at: string | null; status: string;
    base_amount: number; discount_amount: number; tax_amount: number;
    tax_rate_basis_points: number | null; total_amount: number; currency: string;
    period_id: string | null; quote_id: string | null;
    subscription_change_id: string | null;
  };
  const filas = (data ?? []) as unknown as Fila[];

  // LAS TRES FUENTES CONGELADAS. Se leen solo las que hacen falta.
  const idsPeriodo = filas.map((r) => r.period_id).filter((x): x is string => !!x);
  const idsCambio = filas.map((r) => r.subscription_change_id)
    .filter((x): x is string => !!x);
  const idsPresupuesto = filas.map((r) => r.quote_id).filter((x): x is string => !!x);

  type Periodo = { id: string; period_sequence: number; plan_code: string | null;
                   billing_interval: string | null };
  const periodos = new Map<string, Periodo>();
  if (idsPeriodo.length > 0) {
    const { data: ps } = await supabase.from("billing_subscription_periods")
      .select("id, period_sequence, plan_code, billing_interval").in("id", idsPeriodo);
    for (const p of ((ps ?? []) as unknown as Periodo[])) periodos.set(p.id, p);
  }

  type Cambio = { id: string; from_plan_code: string; to_plan_code: string;
                  billing_interval: string };
  const cambios = new Map<string, Cambio>();
  if (idsCambio.length > 0) {
    const { data: cs } = await supabase.from("billing_subscription_changes")
      .select("id, from_plan_code, to_plan_code, billing_interval").in("id", idsCambio);
    for (const c of ((cs ?? []) as unknown as Cambio[])) cambios.set(c.id, c);
  }

  type Presupuesto = { id: string; plan_code: string; billing_interval: string };
  const presupuestos = new Map<string, Presupuesto>();
  if (idsPresupuesto.length > 0) {
    const { data: qs } = await supabase.from("billing_quotes")
      .select("id, plan_code, billing_interval").in("id", idsPresupuesto);
    for (const q of ((qs ?? []) as unknown as Presupuesto[])) presupuestos.set(q.id, q);
  }

  return filas.map((r) => {
    const cambio = r.subscription_change_id
      ? cambios.get(r.subscription_change_id) : undefined;
    const periodo = r.period_id ? periodos.get(r.period_id) : undefined;
    const presupuesto = r.quote_id ? presupuestos.get(r.quote_id) : undefined;

    // Un cambio de plan no es una renovación, y la primera obligación no es una
    // renovación tampoco: es la contratación.
    const concept: PaymentHistoryRow["concept"] = cambio
      ? "cambio_de_plan"
      : periodo && periodo.period_sequence > 1 ? "renovacion" : "suscripcion";

    // El plan sale de la obligación que se saldó; si no consta ahí, del
    // presupuesto. Nunca de la suscripción de hoy.
    const planCode = cambio ? cambio.to_plan_code
      : (periodo?.plan_code ?? presupuesto?.plan_code ?? null);
    const billingInterval = cambio ? cambio.billing_interval
      : (periodo?.billing_interval ?? presupuesto?.billing_interval ?? null);

    return {
      id: r.id,
      paidAt: r.paid_at,
      createdAt: r.created_at,
      concept,
      planCode,
      billingInterval,
      changeSummary: cambio
        ? `${ETIQUETA[cambio.from_plan_code] ?? cambio.from_plan_code} a `
          + `${ETIQUETA[cambio.to_plan_code] ?? cambio.to_plan_code}`
        : null,
      // Un estado que no sepamos traducir va a revisión, no a «pagado».
      status: LEGIBLE[r.status] ?? "en_revision",
      baseAmount: Number(r.base_amount),
      discountAmount: Number(r.discount_amount),
      taxAmount: Number(r.tax_amount),
      taxRateBasisPoints: r.tax_rate_basis_points === null
        ? null : Number(r.tax_rate_basis_points),
      totalAmount: Number(r.total_amount),
      currency: r.currency,
    };
  });
}
