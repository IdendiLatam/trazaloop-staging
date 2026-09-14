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

/**
 * Trazaloop · PE-05B6E · Subir de plan hoy, pagando solo la diferencia.
 *
 * TRES PASOS, Y NINGUNO CONCEDE NADA POR SÍ SOLO
 *
 * Presupuestar dice cuánto. Confirmar cobra contra la tarjeta que la empresa ya
 * tiene guardada —aquí no entra ni un dígito de tarjeta—. Y conceder Extra lo
 * hace el evento firmado del proveedor, igual que en la contratación y en la
 * renovación. Si el pago no se confirma, la empresa se queda donde estaba: en
 * su plan actual, con su espacio actual, sin nada a medias.
 */
export type UpgradeQuoteState =
  | { error: null; quote: import("@/lib/db/billing-upgrade").UpgradeQuote }
  | { error: string; quote?: undefined };

/** Por qué no se puede subir ahora, en palabras de quien lo lee. */
const NO_SE_PUEDE: Record<string, string> = {
  already_on_plan: "Ya tienes ese plan.",
  not_upgradable: "Tu plan no está activo ahora mismo, así que no podemos cambiarlo todavía.",
  change_already_scheduled:
    "Ya tienes un cambio programado. Retíralo primero y vuelve a intentarlo.",
  cancellation_scheduled:
    "Tienes una cancelación programada. Retírala primero y vuelve a intentarlo.",
  upgrade_already_pending:
    "Ya hay un cambio a Extra en curso. Espera a que se confirme.",
  period_unpaid:
    "Tienes un cobro pendiente de tu periodo actual. Cuando se resuelva podrás cambiar de plan.",
  period_ended:
    "Tu periodo actual acaba de terminar. Vuelve a intentarlo en un momento.",
  period_not_started: "Tu periodo todavía no ha empezado.",
  anchor_missing: "No pudimos leer tu periodo de facturación. No se cambió nada.",
  no_positive_delta:
    "Para el tiempo que queda de tu periodo, ese plan no supone un importe adicional. "
    + "Escríbenos y lo revisamos contigo.",
  subscription_not_found: "No hay un plan de pago activo que cambiar.",
  fx_unavailable:
    "Todavía no podemos calcular el precio del plan nuevo en pesos. No se cambió nada.",
  not_authorized: "Solo quien administra la empresa puede cambiar el plan.",
  unavailable: "No pudimos preparar el cambio de plan. No se cambió nada.",
};

export async function quoteUpgradeAction(
  targetPlanCode: string
): Promise<UpgradeQuoteState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };
  const sub = await suscripcionDe(quien.organizationId);
  if (!sub) return { error: NO_SE_PUEDE.subscription_not_found };

  const { quoteUpgrade } = await import("@/lib/db/billing-upgrade");
  const r = await quoteUpgrade(sub, targetPlanCode);
  if (!r.ok) return { error: NO_SE_PUEDE[r.block] ?? NO_SE_PUEDE.unavailable };
  return { error: null, quote: r.quote };
}

export type UpgradeConfirmState = {
  error: string | null;
  /** El cobro salió; el desenlace lo trae el evento firmado. */
  submitted?: boolean;
  /** No sabemos si se cobró. Nadie vuelve a cobrar solo. */
  uncertain?: boolean;
};

/**
 * Confirmar cobra contra el medio de pago ya guardado. No se tokeniza nada, no
 * se pide la tarjeta otra vez y no se crea una fuente nueva.
 */
export async function confirmUpgradeAction(
  changeId: string
): Promise<UpgradeConfirmState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };

  const { openUpgradeIntent } = await import("@/lib/db/billing-upgrade");
  const { wompiFromEnv } = await import("@/lib/billing/providers/wompi");
  const proveedor = wompiFromEnv();
  if (proveedor.environment === null) {
    return { error: "El cobro no está disponible en este momento. No se cobró nada." };
  }
  const entorno = proveedor.environment === "production" ? "live" : "test";

  const abierto = await openUpgradeIntent(changeId, proveedor.name, entorno);
  if (!abierto.ok) {
    return { error: NO_SE_PUEDE[abierto.block] ?? NO_SE_PUEDE.unavailable };
  }

  const { chargeUpgrade } = await import("@/lib/billing/upgrade-charge");
  const cobro = await chargeUpgrade({
    organizationId: quien.organizationId, intentId: abierto.intentId,
    total: abierto.total, currency: abierto.currency, customerEmail: quien.email });

  if (cobro.kind === "unavailable") {
    return { error: cobro.reason === "NO_PAYMENT_METHOD"
      ? "No encontramos una tarjeta guardada para cobrar la diferencia. No se cobró nada."
      : "El cobro no está disponible en este momento. No se cobró nada." };
  }
  if (cobro.kind === "uncertain") {
    return { error: "No pudimos confirmar el pago del cambio a Extra. Tu plan actual "
                  + "sigue activo y no hemos modificado tu suscripción. Si el cobro "
                  + "llegó a hacerse, lo veremos y te lo aplicaremos.",
             uncertain: true };
  }
  if (cobro.kind === "declined") {
    return { error: "El banco no autorizó el cobro de la diferencia. Tu plan actual "
                  + "sigue activo y no hemos modificado tu suscripción." };
  }

  revalidatePath("/settings/billing");
  return { error: null, submitted: true };
}

/** Retirar una subida presupuestada que todavía no se ha cobrado. */
export async function cancelUpgradeAction(changeId: string): Promise<PlanChangeState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };
  const { cancelUpgrade } = await import("@/lib/db/billing-upgrade");
  const estado = await cancelUpgrade(changeId);
  if (estado !== "cancelled") {
    return { error: "No pudimos retirar el cambio. Vuelve a mirarlo en un momento." };
  }
  revalidatePath("/settings/billing");
  return { error: null, ok: true };
}

/**
 * Cambiar de periodicidad. Como bajar de plan: surte efecto cuando termina el
 * periodo que ya se pagó, y un año pagado nunca se corta por la mitad.
 */
export async function scheduleIntervalChangeAction(
  targetInterval: string
): Promise<PlanChangeState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };
  const sub = await suscripcionDe(quien.organizationId);
  if (!sub) return { error: "No hay un plan de pago activo que cambiar." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_schedule_transition", {
    p_subscription_id: sub, p_target_plan_code: null,
    p_target_billing_interval: targetInterval });
  if (error) {
    if ((error.message ?? "").includes("FX_RATE_UNAVAILABLE")) {
      return { error: "Todavía no podemos calcular el precio en pesos de esa "
                    + "periodicidad. No se cambió nada." };
    }
    return { error: "No pudimos programar el cambio de periodicidad. No se cambió nada." };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.status === "change_already_scheduled") {
    return { error: NO_SE_PUEDE.change_already_scheduled };
  }
  revalidatePath("/settings/billing");
  return { error: null, ok: true,
    detail: typeof r.effective_at === "string" ? r.effective_at : undefined };
}

// ---------------------------------------------------------------------------
// PROD-LAUNCH-01B · Pago único
// ---------------------------------------------------------------------------
//
// El carril del lanzamiento, mientras la recurrencia sigue bloqueada: Full
// mensual y anual como pago único renovable.
//
// LA DIFERENCIA CON EL CARRIL DE ARRIBA. Allí el navegador tokeniza y esta
// capa cobra. Aquí el navegador se VA a la pasarela y vuelve sin nada que
// valga como prueba. Por eso hay dos acciones y no una: `iniciar` manda a
// pagar, y `verificar` pregunta al proveedor si se pagó. La vuelta no activa
// nada por sí sola, y el aviso del proveedor tampoco hace falta.

export type OneTimeStartState = { error: string | null; initPoint?: string };

/**
 * Empieza el pago único de un plan y devuelve a dónde ir a pagar.
 *
 * El importe no viaja en la petición: lo pone la base a partir del
 * presupuesto que ella misma acaba de congelar.
 */
export async function startOneTimeCheckoutAction(
  planCode: string, billingInterval: string
): Promise<OneTimeStartState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };

  const presupuesto = await createBillingQuote(
    quien.organizationId, planCode, billingInterval);
  if (!presupuesto.ok) return { error: QUOTE_ERROR_MESSAGE[presupuesto.code] };

  const supabase = await createServerClient();
  const { openOneTimeCheckout, OPEN_ERROR_MESSAGE } =
    await import("@/lib/db/one-time-checkout");
  const r = await openOneTimeCheckout({
    purpose: "initial",
    targetId: presupuesto.quoteId,
    supabase,
    origin: await origenDePeticion(),
    planLabel: etiquetaDePlan(planCode, billingInterval),
    payerEmail: quien.email || null,
  });
  if (!r.ok) return { error: OPEN_ERROR_MESSAGE[r.code] };
  return { error: null, initPoint: r.initPoint };
}

/**
 * PROD-LAUNCH-01D.3A · Manda a pagar un presupuesto QUE YA SE ENSEÑÓ.
 *
 * Existe por una razón concreta: la pantalla de contratar muestra base, IVA y
 * total antes del botón. Si el botón volviera a presupuestar, el importe
 * cobrado y el importe leído serían dos cálculos distintos, y bastaría con que
 * el tipo de cambio se moviera entre la carga y el clic para cobrar algo que
 * nadie vio. Se cobra EXACTAMENTE el presupuesto que se enseñó.
 *
 * El identificador del presupuesto llega del navegador y eso NO es un agujero:
 * la base deriva la empresa DEL PROPIO presupuesto y después exige rol de
 * administración sobre ella, así que un identificador ajeno no autoriza nada.
 * Tampoco vale uno consumido ni caducado.
 *
 * Y pulsar dos veces no cobra dos veces: si ya hay un checkout abierto para
 * este mismo presupuesto, se devuelve ESE y su mismo punto de pago.
 */
export async function startOneTimeCheckoutForQuoteAction(
  quoteId: string
): Promise<OneTimeStartState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };

  const supabase = await createServerClient();
  const { data: cot, error: eCot } = await supabase
    .from("billing_quotes")
    .select("id, plan_code, billing_interval")
    .eq("id", quoteId)
    .maybeSingle();
  if (eCot || !cot) {
    return { error: "Ese presupuesto ya no está disponible. No se cobró nada." };
  }
  const c = cot as { id: string; plan_code: string; billing_interval: string };

  const { openOneTimeCheckout, OPEN_ERROR_MESSAGE } =
    await import("@/lib/db/one-time-checkout");
  const r = await openOneTimeCheckout({
    purpose: "initial",
    targetId: c.id,
    supabase,
    origin: await origenDePeticion(),
    planLabel: etiquetaDePlan(c.plan_code, c.billing_interval),
    payerEmail: quien.email || null,
  });
  if (!r.ok) return { error: OPEN_ERROR_MESSAGE[r.code] };
  return { error: null, initPoint: r.initPoint };
}

/**
 * Renueva: abre el periodo siguiente y manda a pagarlo.
 *
 * El periodo siguiente lo abre la base anclado a la ERA de la suscripción, no
 * a hoy. Renovar el día 5 un plan que vence el 12 sigue dando 12 → 12.
 */
export async function startRenewalCheckoutAction(): Promise<OneTimeStartState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { error: quien.error };

  const supabase = await createServerClient();
  const { data: sub } = await supabase
    .from("billing_subscriptions")
    .select("id, plan_code, billing_interval")
    .eq("organization_id", quien.organizationId)
    .in("status", ["active", "past_due", "cancel_at_period_end"])
    .maybeSingle();
  if (!sub) {
    return { error: "No hay un plan que renovar. Si quieres contratarlo de nuevo, elige el plan." };
  }
  const s = sub as { id: string; plan_code: string; billing_interval: string };

  const { data: apertura, error: eAbrir } = await supabase.rpc(
    "billing_open_next_period", { p_subscription_id: s.id });
  if (eAbrir || !apertura) {
    return { error: "No fue posible preparar la renovación. No se cobró nada." };
  }
  const a = apertura as Record<string, unknown>;
  const periodo = typeof a.period_id === "string" ? a.period_id : "";
  if (!periodo) {
    // Se dice QUÉ pasa, no «no se pudo». Una suscripción caducada no se
    // renueva: se vuelve a contratar, y son dos botones distintos.
    return { error: a.status === "lapsed"
      ? "Tu periodo terminó hace tiempo. Vuelve a contratar el plan para reactivarlo."
      : "No fue posible preparar la renovación. No se cobró nada." };
  }

  const { openOneTimeCheckout, OPEN_ERROR_MESSAGE } =
    await import("@/lib/db/one-time-checkout");
  const r = await openOneTimeCheckout({
    purpose: "renewal",
    targetId: periodo,
    supabase,
    origin: await origenDePeticion(),
    planLabel: etiquetaDePlan(s.plan_code, s.billing_interval),
    payerEmail: quien.email || null,
  });
  if (!r.ok) return { error: OPEN_ERROR_MESSAGE[r.code] };
  return { error: null, initPoint: r.initPoint };
}

export type OneTimeVerifyState =
  | { state: "activated" }
  | { state: "pending"; message: string }
  | { state: "error"; message: string };

/**
 * «Ya realicé el pago — Verificar».
 *
 * Es el botón que salva los tres casos en los que la vuelta no ocurre: la
 * ventana cerrada, el retorno perdido y el aviso que no llega. Pregunta al
 * proveedor y, si hay un pago que cuadre, activa.
 *
 * Se puede pulsar todas las veces que haga falta.
 */
export async function verifyOneTimeCheckoutAction(
  checkoutId: string
): Promise<OneTimeVerifyState> {
  const quien = await exigirAdministracion();
  if (!quien.ok) return { state: "error", message: quien.error };
  if (!/^[0-9a-f-]{36}$/i.test(checkoutId)) {
    return { state: "error", message: "No encontramos esta contratación." };
  }

  // El cobro tiene que ser DE ESTA EMPRESA. Sin esto, conocer un identificador
  // ajeno permitiría activar el plan de otra.
  const supabase = await createServerClient();
  const { data: mio } = await supabase
    .from("billing_one_time_checkouts")
    .select("id").eq("id", checkoutId)
    .eq("organization_id", quien.organizationId).maybeSingle();
  if (!mio) return { state: "error", message: "No encontramos esta contratación." };

  const { verifyOneTimeCheckout } = await import("@/lib/db/one-time-checkout");
  const r = await verifyOneTimeCheckout(checkoutId);
  if (!r.ok) return { state: "error", message: r.message };
  if (!r.settled) return { state: "pending", message: r.message };

  revalidatePath("/settings/billing");
  revalidatePath("/dashboard");
  return { state: "activated" };
}

/** El origen real de la petición, para construir la vuelta. */
async function origenDePeticion(): Promise<string> {
  const { headers } = await import("next/headers");
  const h = await headers();
  const declarado = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  if (declarado) return declarado.replace(/\/+$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

/** Lo que verá quien pague, en su recibo. Sin claves internas. */
function etiquetaDePlan(planCode: string, interval: string): string {
  const plan = planCode === "extra" ? "Extra" : "Full";
  const periodo = interval === "annual" ? "anual" : "mensual";
  return `Trazaloop ${plan} · ${periodo}`;
}
