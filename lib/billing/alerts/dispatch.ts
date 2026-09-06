import "server-only";
import {
  pendingAlerts, markAlertDelivery, type OperationsAlert,
} from "@/lib/db/billing-alerts";

/**
 * Trazaloop · PE-06C2 · Sacar el aviso de la base y ponerlo delante de alguien.
 *
 * UN SOLO CANAL, Y EL MÁS BARATO QUE SE PUEDE PROBAR
 *
 * El producto no tiene infraestructura de correo propia —solo la que Supabase
 * usa para invitar y recuperar contraseña—, y montar un proveedor de correo
 * entero para este aviso sería añadir una dependencia, una credencial y un
 * bloqueo nuevo justo cuando se trata de cerrar uno.
 *
 * Así que se entrega por HTTPS a un punto que configura quien opera: su relé de
 * correo, su bandeja, lo que use. Un solo canal, sin SDK de nadie, y probable de
 * punta a punta.
 *
 * SIN PUNTO CONFIGURADO NO SE PIERDE NADA
 *
 * El aviso ya está guardado y se ve en la consola. Lo que queda pendiente es
 * avisar, no saber.
 *
 * Y NADA DE ESTO TOCA DINERO. Si la entrega falla, la suscripción, el periodo y
 * el cobro se quedan donde estaban.
 */

const ENDPOINT = "BILLING_OPERATIONS_ALERT_ENDPOINT";
const RECIPIENT = "BILLING_OPERATIONS_ALERT_RECIPIENT";

export type DispatchResult = {
  pending: number;
  sent: number;
  failed: number;
  /** Sin punto configurado no se intenta nada, y se dice. */
  channelConfigured: boolean;
};

/** Lo que sale por el cable. Identificadores y clases; nada más. */
export function alertPayload(a: OperationsAlert, recipient: string | null) {
  return {
    source: "trazaloop.billing.operations",
    alert_id: a.id,
    alert_type: a.alertType,
    failure_class: a.failureClass,
    organization_id: a.organizationId,
    subscription_id: a.subscriptionId,
    attempt_id: a.intentId,
    kind: a.detail.kind ?? null,
    provider: a.detail.provider ?? null,
    provider_submitted_at: a.detail.provider_submitted_at ?? null,
    occurred_at: a.createdAt,
    recipient,
    // Adónde va quien lo reciba. Ruta, no acción: aquí no hay botón de cobrar.
    review_path: "/platform/plans",
    summary: "Un cobro quedó sin desenlace conocido. No se concedió nada y "
           + "nadie va a volver a cobrar solo: hace falta que una persona lo mire.",
  };
}

export async function dispatchPendingAlerts(limit = 25): Promise<DispatchResult> {
  const url = (process.env[ENDPOINT] ?? "").trim();
  const recipient = (process.env[RECIPIENT] ?? "").trim() || null;
  const cola = await pendingAlerts(limit);

  if (!url) {
    return { pending: cola.length, sent: 0, failed: 0, channelConfigured: false };
  }

  let sent = 0, failed = 0;
  for (const a of cola) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alertPayload(a, recipient)),
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) { await markAlertDelivery(a.id, true); sent += 1; }
      else { await markAlertDelivery(a.id, false, `HTTP ${r.status}`); failed += 1; }
    } catch (e) {
      // Que no se pueda avisar NO cambia nada del dinero. Se anota y se
      // reintentará; el hecho sigue guardado y visible.
      await markAlertDelivery(a.id, false,
        e instanceof Error ? e.message : "delivery_failed");
      failed += 1;
    }
  }
  return { pending: cola.length, sent, failed, channelConfigured: true };
}
