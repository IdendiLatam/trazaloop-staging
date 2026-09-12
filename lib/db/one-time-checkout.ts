import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  oneTimeGatewayFor, defaultOneTimeProviderCode,
} from "@/lib/billing/providers/one-time-registry";
import {
  decideOneTimeSettlement, REFUSAL_MESSAGE,
  type OneTimeRefusal,
} from "@/lib/billing/one-time/verification";

/**
 * Trazaloop · PROD-LAUNCH-01B · El pago único, del lado del servidor.
 *
 *
 * LAS DOS OPERACIONES, Y LA REGLA QUE LAS SEPARA
 *
 * ABRIR un cobro y ACTIVAR un plan son cosas distintas y no ocurren en la
 * misma petición. Abrir crea la preferencia y devuelve a dónde ir a pagar.
 * Activar ocurre después, cuando alguien —el que vuelve, el que pulsa «ya
 * pagué», o el aviso del proveedor— pide que se compruebe.
 *
 * Que estén separadas es lo que hace que la vuelta del navegador no active
 * nada. Quien vuelve no trae un pago: trae una petición de que MIREMOS si hay
 * pago. Y mirar es preguntarle al proveedor, no leer la URL.
 *
 *
 * IDEMPOTENTE POR CONSTRUCCIÓN, EN TRES CAPAS
 *
 *   · abrir reutiliza el cobro abierto del mismo destino;
 *   · el índice único por (proveedor, pago) impide que un pago asiente dos;
 *   · y `billing_settle_one_time_checkout` devuelve `already_settled` en vez
 *     de fallar cuando ya está hecho.
 *
 * Por eso el botón «ya pagué» se puede pulsar siete veces seguidas.
 */

type Purpose = "initial" | "renewal";

export type OpenCheckoutResult =
  | { ok: true; checkoutId: string; initPoint: string; reused: boolean }
  | { ok: false; code: OpenCheckoutError; detail?: string };

export type OpenCheckoutError =
  | "PROVIDER_NOT_CONFIGURED"
  | "CHECKOUT_NOT_OPENED"
  | "PROVIDER_REFUSED"
  | "PROVIDER_UNAVAILABLE";

/** El texto que ve quien está comprando. Nunca un código. */
export const OPEN_ERROR_MESSAGE: Record<OpenCheckoutError, string> = {
  PROVIDER_NOT_CONFIGURED:
    "El pago en línea no está disponible ahora mismo. No se cobró nada.",
  CHECKOUT_NOT_OPENED:
    "No fue posible preparar el pago. No se cobró nada; inténtalo de nuevo.",
  PROVIDER_REFUSED:
    "La pasarela no aceptó preparar el pago. No se cobró nada.",
  PROVIDER_UNAVAILABLE:
    "No pudimos contactar con la pasarela de pago. No se cobró nada; inténtalo de nuevo.",
};

/**
 * Abre el cobro y devuelve a dónde ir a pagar.
 *
 * `target` es el presupuesto (primera compra) o el periodo (renovación). El
 * importe NO se pasa: lo pone la base a partir de ese destino, que ya lo
 * congeló. Es lo que impide que una pantalla influya en lo que se cobra.
 */
export async function openOneTimeCheckout(input: {
  purpose: Purpose;
  targetId: string;
  /** El cliente CON SESIÓN: la base comprueba quién pide el cobro. */
  supabase: SupabaseClient;
  origin: string;
  planLabel: string;
  payerEmail?: string | null;
}): Promise<OpenCheckoutResult> {
  const pasarela = oneTimeGatewayFor(defaultOneTimeProviderCode());
  if (!pasarela || pasarela.environment === null) {
    return { ok: false, code: "PROVIDER_NOT_CONFIGURED" };
  }

  const abierto = await input.supabase.rpc("billing_open_one_time_checkout", {
    p_purpose: input.purpose,
    p_target_id: input.targetId,
    p_provider: pasarela.code,
    p_environment: pasarela.environment,
  });
  if (abierto.error || !abierto.data) {
    return { ok: false, code: "CHECKOUT_NOT_OPENED", detail: abierto.error?.message };
  }
  const c = abierto.data as {
    checkout_id: string; init_point: string | null; reused: boolean;
    expected_total_amount: number; expected_currency: string;
  };

  // Si ya había preferencia, se reutiliza. Crear una segunda dejaría viva la
  // primera, y el cliente podría pagar la que nadie está mirando.
  if (c.reused && c.init_point) {
    return { ok: true, checkoutId: c.checkout_id, initPoint: c.init_point, reused: true };
  }

  const vuelta = `${input.origin}/settings/billing/checkout/return?c=${c.checkout_id}`;
  const preferencia = await pasarela.createCheckout({
    externalReference: c.checkout_id,
    title: input.planLabel,
    amountMinor: c.expected_total_amount,
    currency: c.expected_currency,
    payerEmail: input.payerEmail ?? null,
    successUrl: vuelta,
    failureUrl: vuelta,
    pendingUrl: vuelta,
  });
  if (!preferencia.ok) {
    return {
      ok: false,
      code: preferencia.failure === "provider_unavailable"
        ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REFUSED",
    };
  }
  if (!preferencia.value.initPoint) {
    return { ok: false, code: "PROVIDER_REFUSED", detail: "SIN_PUNTO_DE_PAGO" };
  }

  // La preferencia se ata con el cliente ADMINISTRATIVO: la primitiva es de
  // servicio a propósito, porque atar una preferencia no es una decisión de
  // quien compra.
  const admin = createAdminClient();
  const { error } = await admin.rpc("billing_attach_one_time_preference", {
    p_checkout_id: c.checkout_id,
    p_preference_id: preferencia.value.preferenceId,
    p_init_point: preferencia.value.initPoint,
  });
  if (error) return { ok: false, code: "CHECKOUT_NOT_OPENED", detail: error.message };

  return {
    ok: true, checkoutId: c.checkout_id,
    initPoint: preferencia.value.initPoint, reused: false,
  };
}

export type VerifyResult =
  | { ok: true; settled: true; alreadySettled: boolean }
  | { ok: true; settled: false; reason: OneTimeRefusal; message: string }
  | { ok: false; code: "CHECKOUT_NOT_FOUND" | "PROVIDER_NOT_CONFIGURED"
        | "PROVIDER_UNAVAILABLE" | "SETTLEMENT_FAILED"; message: string; detail?: string };

const ERROR_MESSAGE = {
  CHECKOUT_NOT_FOUND: "No encontramos esta contratación.",
  PROVIDER_NOT_CONFIGURED:
    "El pago en línea no está disponible ahora mismo. Si ya pagaste, escríbenos y lo activamos.",
  PROVIDER_UNAVAILABLE:
    "No pudimos consultar tu pago ahora mismo. Vuelve a comprobar en unos segundos.",
  SETTLEMENT_FAILED:
    "Tu pago está confirmado pero no pudimos activar el plan. Escríbenos: no hace falta que pagues otra vez.",
} as const;

/**
 * ¿Hay un pago que active este cobro? Se le pregunta al PROVEEDOR.
 *
 * Esta es la única puerta de activación, y la usan los tres caminos: la
 * pantalla de vuelta, el botón «ya pagué» y el aviso del proveedor. Ninguno de
 * los tres aporta el pago: los tres piden que se mire.
 *
 * Se puede llamar tantas veces como haga falta.
 */
export async function verifyOneTimeCheckout(checkoutId: string): Promise<VerifyResult> {
  const admin = createAdminClient();

  const { data: fila, error: eLeer } = await admin
    .from("billing_one_time_checkouts")
    .select("id, provider, environment, status, expected_total_amount, expected_currency")
    .eq("id", checkoutId)
    .maybeSingle();
  if (eLeer || !fila) {
    return { ok: false, code: "CHECKOUT_NOT_FOUND", message: ERROR_MESSAGE.CHECKOUT_NOT_FOUND };
  }
  const c = fila as {
    id: string; provider: string; environment: "test" | "live"; status: string;
    expected_total_amount: number; expected_currency: string;
  };

  // Ya activado: se responde que sí sin volver a molestar al proveedor.
  if (c.status === "settled") return { ok: true, settled: true, alreadySettled: true };

  const pasarela = oneTimeGatewayFor(c.provider);
  if (!pasarela) {
    return { ok: false, code: "PROVIDER_NOT_CONFIGURED",
             message: ERROR_MESSAGE.PROVIDER_NOT_CONFIGURED };
  }

  const pagos = await pasarela.paymentsFor(c.id);
  if (!pagos.ok) {
    return { ok: false, code: "PROVIDER_UNAVAILABLE",
             message: ERROR_MESSAGE.PROVIDER_UNAVAILABLE };
  }

  const veredicto = decideOneTimeSettlement({
    checkoutId: c.id,
    expectedTotalMinor: c.expected_total_amount,
    expectedCurrency: c.expected_currency,
    environment: c.environment,
  }, pagos.value);

  if (!veredicto.settle) {
    return { ok: true, settled: false, reason: veredicto.reason,
             message: REFUSAL_MESSAGE[veredicto.reason] };
  }

  const { data, error } = await admin.rpc("billing_settle_one_time_checkout", {
    p_checkout_id: c.id,
    p_provider_payment_id: veredicto.providerPaymentId,
    p_payment_status: "approved",
    p_external_reference: c.id,
    p_amount: veredicto.amountMinor,
    p_currency: veredicto.currency,
  });
  if (error) {
    // El dinero está cobrado y el plan no se activó. Se dice tal cual: pedirle
    // a alguien que vuelva a pagar sería cobrarle dos veces por un fallo
    // nuestro.
    return { ok: false, code: "SETTLEMENT_FAILED",
             message: ERROR_MESSAGE.SETTLEMENT_FAILED, detail: error.message };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return { ok: true, settled: true, alreadySettled: r.outcome === "already_settled" };
}
