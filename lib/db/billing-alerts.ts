import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Trazaloop · PE-06C2 · Que alguien se entere de un cobro en duda.
 *
 * EL AVISO OBSERVA; NO DECIDE.
 *
 * Si la entrega falla, no se reintenta ningún cobro, no se salda nada, no se
 * consume un hueco de reintento y no caduca ninguna suscripción. El dinero se
 * queda exactamente donde estaba: lo único que queda pendiente es avisar.
 */

export type OperationsAlert = {
  id: string;
  alertType: string;
  failureClass: string | null;
  status: "pending" | "sent" | "failed" | "acknowledged";
  organizationId: string | null;
  organizationName: string | null;
  subscriptionId: string | null;
  intentId: string | null;
  detail: Record<string, unknown>;
  deliveryAttempts: number;
  lastError: string | null;
  createdAt: string;
};

/** Recorre la verdad financiera y levanta lo que falte. Idempotente. */
export async function scanUncertainCharges(): Promise<{ scanned: number; raised: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("billing_scan_uncertain_charges");
  if (error) return { scanned: 0, raised: 0 };
  const r = (data ?? {}) as Record<string, unknown>;
  return { scanned: Number(r.scanned ?? 0), raised: Number(r.raised ?? 0) };
}

/** Los que todavía no salieron. */
export async function pendingAlerts(limit = 50): Promise<OperationsAlert[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_operations_alerts")
    .select("id, alert_type, failure_class, status, organization_id, subscription_id,"
      + " intent_id, detail, delivery_attempts, last_error, created_at")
    .in("status", ["pending", "failed"])
    .order("created_at").limit(limit);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(fila);
}

/** Para la consola de plataforma: pasa por la vista, con su filtro dentro. */
export async function listOperationsAlerts(limit = 50): Promise<OperationsAlert[] | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("v_billing_operations_alerts")
    .select("id, alert_type, failure_class, status, organization_id, organization_name,"
      + " subscription_id, intent_id, detail, delivery_attempts, last_error, created_at")
    .order("created_at", { ascending: false }).limit(limit);
  if (error) return null;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(fila);
}

function fila(r: Record<string, unknown>): OperationsAlert {
  return {
    id: String(r.id),
    alertType: String(r.alert_type),
    failureClass: (r.failure_class as string | null) ?? null,
    status: r.status as OperationsAlert["status"],
    organizationId: (r.organization_id as string | null) ?? null,
    organizationName: (r.organization_name as string | null) ?? null,
    subscriptionId: (r.subscription_id as string | null) ?? null,
    intentId: (r.intent_id as string | null) ?? null,
    detail: (r.detail ?? {}) as Record<string, unknown>,
    deliveryAttempts: Number(r.delivery_attempts ?? 0),
    lastError: (r.last_error as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export async function markAlertDelivery(
  alertId: string, ok: boolean, error?: string | null
): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("billing_mark_alert_delivery", {
    p_alert_id: alertId, p_ok: ok, p_error: error ?? null });
  return String(((data ?? {}) as Record<string, unknown>).status ?? "unknown");
}
