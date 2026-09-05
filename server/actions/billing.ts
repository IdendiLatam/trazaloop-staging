"use server";

import { revalidatePath } from "next/cache";

import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { requireSession } from "@/lib/auth/require-session";
import { createServerClient } from "@/lib/supabase/server";
import { createBillingQuote, QUOTE_ERROR_MESSAGE } from "@/lib/db/billing";
import {
  submitCardToken, readCheckoutStatus,
  type CheckoutStatus, type SubmitErrorCode,
} from "@/lib/db/billing-checkout";

/**
 * Trazaloop · PE-05B2W4 · Contratar un plan de pago.
 *
 * NINGUNA de estas acciones acepta un campo de tarjeta. El navegador tokeniza
 * contra Wompi y aquí llega, como mucho, el testigo que Wompi devolvió. Una
 * prueba se pone roja si alguna vez aparece un `number`, un `cvc` o una
 * caducidad en la entrada de este fichero.
 *
 * Y ninguna concede nada. Cobrar y activar son cosas distintas: activa el
 * webhook firmado, después de releer la transacción en el proveedor.
 */

/** Contratar es del administrador de la empresa activa. Nadie más. */
async function exigirAdministracion(): Promise<
  { ok: true; organizationId: string; email: string } | { ok: false; error: string }> {
  const sesion = await requireSession();
  const org = await requireActiveOrg();
  if (org.roleCode !== "admin") {
    return { ok: false,
      error: "Solo quien administra la empresa puede contratar un plan." };
  }
  return { ok: true, organizationId: org.organizationId,
           email: sesion.user.email ?? "" };
}

export type StartCheckoutState = {
  error: string | null;
  intentId?: string;
};

/**
 * Presupuesto primero, intento después. Los dos los resuelve la base con la
 * sesión de quien pide, así que la autorización se comprueba en SQL y no
 * solo aquí.
 */
export async function startCheckoutAction(
  planCode: string, billingInterval: string
): Promise<StartCheckoutState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };

  const presupuesto = await createBillingQuote(
    quien.organizationId, planCode, billingInterval);
  if (!presupuesto.ok) return { error: QUOTE_ERROR_MESSAGE[presupuesto.code] };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_open_checkout_intent", {
    p_quote_id: presupuesto.quoteId, p_provider: "wompi",
    // El entorno lo decide el servidor por sus credenciales, no la pantalla.
    p_environment: process.env.VERCEL_ENV === "production" ? "live" : "test",
  });
  if (error || !data) {
    return { error: "No fue posible preparar el pago. No se cobró nada." };
  }
  const r = data as Record<string, unknown>;
  return { error: null, intentId: String(r.intent_id) };
}

const MENSAJE: Record<SubmitErrorCode, string> = {
  PROVIDER_NOT_CONFIGURED:
    "El pago con tarjeta no está disponible ahora mismo. No se cobró nada.",
  INTENT_NOT_FOUND: "No encontramos esta contratación. No se cobró nada.",
  INTENT_NOT_OPEN: "Esta contratación ya no está abierta. No se cobró nada.",
  ENVIRONMENT_MISMATCH:
    "El pago con tarjeta no está disponible ahora mismo. No se cobró nada.",
  ACCEPTANCE_REQUIRED:
    "Hay que aceptar los dos documentos antes de pagar.",
  CARD_REJECTED:
    "La tarjeta fue rechazada. No se cobró nada: revisa los datos o prueba con otra.",
  PAYMENT_METHOD_REFUSED:
    "No pudimos guardar la tarjeta para los cobros siguientes. No se cobró nada.",
  ALREADY_SUBMITTED:
    "Este pago ya se envió. Espera el resultado antes de volver a intentarlo.",
  PROVIDER_UNAVAILABLE:
    "No pudimos contactar con la pasarela de pago. No se cobró nada; inténtalo de nuevo.",
};

export type SubmitCardState = { error: string | null; submitted?: boolean };

/**
 * Lo que llega del navegador: el intento y el testigo que devolvió Wompi.
 * Nada más. El importe sale de lo que el intento congeló.
 */
export async function submitCardTokenAction(input: {
  intentId: string;
  cardToken: string;
  acceptanceToken: string;
  personalAuthToken: string;
}): Promise<SubmitCardState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };

  const r = await submitCardToken({
    intentId: input.intentId,
    organizationId: quien.organizationId,
    cardToken: input.cardToken,
    acceptanceToken: input.acceptanceToken,
    personalAuthToken: input.personalAuthToken,
    customerEmail: quien.email,
  });
  if (!r.ok) return { error: MENSAJE[r.code] };
  // Se devuelve que SALIÓ, no que se cobró. Lo segundo lo dirá el libro.
  return { error: null, submitted: true };
}

export type CheckoutStatusState =
  | { ok: true; status: CheckoutStatus }
  | { ok: false; error: string };

/** El estado CANÓNICO. Lo que diga el navegador o el proveedor no es el libro. */
export async function readCheckoutStatusAction(
  intentId: string
): Promise<CheckoutStatusState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { ok: false, error: quien.error };
  const estado = await readCheckoutStatus(intentId, quien.organizationId);
  if (!estado) return { ok: false, error: "No encontramos esta contratación." };
  return { ok: true, status: estado };
}

/**
 * Trazaloop · PE-05B5F · Las dos decisiones que puede tomar quien paga.
 *
 * Ninguna corta nada hoy. Las dos surten efecto al terminar el periodo que ya
 * está pagado, y las dos las ejecuta el motor cuando llega esa fecha: aquí solo
 * se PIDEN. Quién puede pedirlas se comprueba en SQL además de aquí, que es
 * donde tiene que estar.
 *
 * Y ninguna es el retiro administrativo: eso es una decisión de plataforma,
 * excepcional, y ningún camino de producto la alcanza.
 */
export type PlanChangeState = { error: string | null; ok?: boolean; detail?: string };

async function suscripcionDe(organizationId: string): Promise<string | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("billing_subscriptions")
    .select("id").eq("organization_id", organizationId)
    .in("status", ["active", "past_due"]).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Pedir la cancelación, o retirarla mientras no haya llegado la fecha. */
export async function requestCancellationAction(cancel: boolean): Promise<PlanChangeState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };
  const sub = await suscripcionDe(quien.organizationId);
  if (!sub) return { error: "No hay un plan de pago activo que cancelar." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_request_cancellation",
    { p_subscription_id: sub, p_cancel: cancel });
  if (error) return { error: "No pudimos registrar tu decisión. Inténtalo de nuevo." };
  const r = (data ?? {}) as Record<string, unknown>;
  revalidatePath("/settings/billing");
  return { error: null, ok: true,
    detail: typeof r.effective_at === "string" ? r.effective_at : undefined };
}

/** Programar un cambio de plan para el final del periodo pagado. */
export async function schedulePlanChangeAction(
  targetPlanCode: string
): Promise<PlanChangeState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };
  const sub = await suscripcionDe(quien.organizationId);
  if (!sub) return { error: "No hay un plan de pago activo que cambiar." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_schedule_plan_change",
    { p_subscription_id: sub, p_target_plan_code: targetPlanCode });
  if (error) {
    // Cambiar de plan fija un precio nuevo, y eso necesita tipo de cambio. Se
    // dice qué falta, no «error».
    if ((error.message ?? "").includes("FX_RATE_UNAVAILABLE")) {
      return { error: "Todavía no podemos calcular el precio del plan nuevo en pesos. "
                    + "No se cambió nada; inténtalo de nuevo en un momento." };
    }
    if ((error.message ?? "").includes("PLAN_PRICE_NOT_CONFIGURED")) {
      return { error: "Ese plan todavía no tiene precio publicado. No se cambió nada." };
    }
    return { error: "No pudimos programar el cambio de plan. No se cambió nada." };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  revalidatePath("/settings/billing");
  return { error: null, ok: true,
    detail: typeof r.effective_at === "string" ? r.effective_at : undefined };
}

/** Y arrepentirse del cambio programado, mientras no haya llegado su día. */
export async function cancelScheduledChangeAction(): Promise<PlanChangeState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };
  const sub = await suscripcionDe(quien.organizationId);
  if (!sub) return { error: "No hay un plan de pago activo." };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("billing_cancel_scheduled_change",
    { p_subscription_id: sub });
  if (error) return { error: "No pudimos retirar el cambio programado." };
  revalidatePath("/settings/billing");
  return { error: null, ok: true };
}
