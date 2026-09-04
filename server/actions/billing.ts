"use server";

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
