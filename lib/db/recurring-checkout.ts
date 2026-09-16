import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { mercadoPagoFromEnv } from "@/lib/billing/providers/mercadopago";
import { applicationMatches } from "@/lib/billing/mercadopago/identity";
import { providerAmountToMinor } from "@/lib/billing/mercadopago/mapping";
import { resolveRecurringLane } from "@/lib/billing/recurring/policy";
import {
  reconcileRecurringSubscription,
  type RecurringReconcileDeps, type RecurringReconcileResult,
  type ObservedRecurringPayment,
} from "@/lib/billing/recurring/reconcile";
import type { RecurringExpectation } from "@/lib/billing/recurring/verification";

/**
 * Trazaloop · MP-REC-01B · El camino de producto de la recurrencia.
 *
 * ES EL CAMINO REAL, NO UNA RUTA DE PRUEBAS
 *
 * El disparador de QA existía para poder preguntarle cosas al proveedor. Esto
 * es otra cosa: lo que ejecuta una empresa cuando contrata. Por eso pasa por
 * las mismas puertas que el carril manual —sesión real, administración de la
 * empresa, presupuesto canónico— y no por una lista de acciones.
 *
 * NADA DEL NAVEGADOR DECIDE DINERO
 *
 * Quien llama aporta UNA cosa: qué presupuesto quiere contratar. El importe, la
 * moneda, el impuesto, el cambio, el plan y el intervalo salen del presupuesto
 * que ya los congeló, y los vuelve a leer la base. No hay ningún parámetro por
 * el que una pantalla pueda influir en lo que se cobra.
 *
 * EL ORDEN, Y POR QUÉ ESE
 *
 *   1. ¿Está abierto el carril? Antes de tocar la base y antes de la red.
 *   2. Intento canónico. Ahí se comprueba quién pide, y se reutiliza si ya
 *      existía: es la primera defensa contra el doble clic.
 *   3. Suscripción PENDIENTE y autorización a la espera. Si ya estaban, se
 *      devuelven; si ya hay preapproval atada, se devuelve su enlace y NO se
 *      crea una segunda.
 *   4. La preapproval en el proveedor.
 *   5. ¿Es de NUESTRA aplicación? Si no, se deshace en el proveedor.
 *   6. Atar. Y solo entonces existe un enlace que dar.
 */

export type OpenRecurringResult =
  | { ok: true; authorizationId: string; subscriptionId: string;
      providerSubscriptionId: string; initPoint: string; reused: boolean }
  | { ok: false; code: OpenRecurringError; detail?: string };

export type OpenRecurringError =
  | "RECURRING_NOT_AVAILABLE"
  | "PROVIDER_NOT_CONFIGURED"
  | "INTENT_NOT_OPENED"
  | "RECURRING_NOT_OPENED"
  | "PROVIDER_REFUSED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_APPLICATION_MISMATCH"
  | "ATTACH_FAILED";

/** Lo que ve quien contrata. Nunca un código, y nunca el nombre de la pasarela. */
export const OPEN_RECURRING_MESSAGE: Record<OpenRecurringError, string> = {
  RECURRING_NOT_AVAILABLE:
    "Esta opción todavía no está disponible.",
  PROVIDER_NOT_CONFIGURED:
    "El pago en línea no está disponible ahora mismo. No se cobró nada.",
  INTENT_NOT_OPENED:
    "No fue posible preparar la contratación. No se cobró nada.",
  RECURRING_NOT_OPENED:
    "No fue posible preparar la contratación. No se cobró nada.",
  PROVIDER_REFUSED:
    "La pasarela no aceptó preparar la contratación. No se cobró nada.",
  PROVIDER_UNAVAILABLE:
    "No pudimos contactar con la pasarela. No se cobró nada; inténtalo de nuevo.",
  PROVIDER_APPLICATION_MISMATCH:
    "No fue posible preparar la contratación. No se cobró nada.",
  ATTACH_FAILED:
    "La contratación quedó a medias. No se cobró nada; inténtalo de nuevo.",
};

type AperturaRecurrente = {
  outcome: "opened" | "reused";
  subscription_id: string;
  authorization_id: string;
  provider_subscription_id: string | null;
  init_point: string | null;
  expected_total_amount: number;
  expected_currency: string;
};

/**
 * Abre una recurrencia y devuelve a dónde va el comprador a autorizarla.
 *
 * `supabase` es el cliente CON SESIÓN: la base comprueba que quien contrata
 * administra esa empresa. El cliente administrativo solo aparece para atar lo
 * que devolvió el proveedor, que no es una decisión de quien compra.
 */
export async function openRecurringCheckout(input: {
  quoteId: string;
  supabase: SupabaseClient;
  origin: string;
  planLabel: string;
  payerEmail?: string | null;
}): Promise<OpenRecurringResult> {
  // --- 1 · El carril ---------------------------------------------------------
  const carril = resolveRecurringLane();
  if (!carril.open) return { ok: false, code: "RECURRING_NOT_AVAILABLE",
                             detail: carril.reason };

  const proveedor = mercadoPagoFromEnv();
  if (!proveedor.live || !proveedor.identity.ok) {
    return { ok: false, code: "PROVIDER_NOT_CONFIGURED" };
  }
  // El carril solo vive en pruebas mientras no esté aprobado, y eso ya lo dijo
  // la política. Aquí se vuelve a afirmar porque es lo que se va a ESCRIBIR.
  if (proveedor.identity.value.environment !== "test") {
    return { ok: false, code: "RECURRING_NOT_AVAILABLE",
             detail: "RECURRING_PROVIDER_ENVIRONMENT_NOT_TEST" };
  }

  // --- 2 · El intento canónico ----------------------------------------------
  const intento = await input.supabase.rpc("billing_open_checkout_intent", {
    p_quote_id: input.quoteId, p_provider: "mercadopago", p_environment: "test" });
  if (intento.error || !intento.data) {
    return { ok: false, code: "INTENT_NOT_OPENED", detail: intento.error?.message };
  }
  const d = intento.data as { intent_id: string; billing_email: string | null;
                              billing_email_missing: boolean };
  const intentId = String(d.intent_id);

  // EL PAGADOR SALE DE LA EMPRESA, no del navegador. Mercado Pago exige un
  // correo para crear la preapproval, y el que vale es el de facturación que la
  // empresa ya declaró. Sin él no se contrata: inventarlo pondría la
  // suscripción a nombre de una dirección que nadie vigila.
  const correoPagador = (input.payerEmail ?? d.billing_email ?? "").trim();
  if (correoPagador === "") {
    return { ok: false, code: "INTENT_NOT_OPENED", detail: "BILLING_EMAIL_MISSING" };
  }

  // --- 3 · Suscripción pendiente y autorización a la espera ------------------
  const abierta = await input.supabase.rpc("billing_open_recurring_authorization", {
    p_intent_id: intentId });
  if (abierta.error || !abierta.data) {
    return { ok: false, code: "RECURRING_NOT_OPENED", detail: abierta.error?.message };
  }
  const a = abierta.data as AperturaRecurrente;

  // Ya había preapproval atada: se devuelve SU enlace. Crear una segunda
  // dejaría viva la primera, y el comprador podría autorizar la que nadie está
  // mirando —y entonces el proveedor cobraría por un objeto que no conciliamos—.
  if (a.init_point && a.provider_subscription_id
      && !a.provider_subscription_id.startsWith("pending:")) {
    return { ok: true, authorizationId: a.authorization_id,
             subscriptionId: a.subscription_id,
             providerSubscriptionId: a.provider_subscription_id,
             initPoint: a.init_point, reused: true };
  }

  // --- 4 · La preapproval ----------------------------------------------------
  //
  // El importe es el del intento, que lo trajo del presupuesto. `recurrenceFor`
  // traduce el intervalo dentro del adaptador: un anual es UN intervalo de doce
  // meses, nunca doce cobros mensuales.
  const vuelta = `${input.origin.replace(/\/$/, "")}`
    + `/settings/billing/recurring/return?a=${a.authorization_id}`;
  const creada = await proveedor.createSubscription({
    externalReference: intentId,
    payerEmail: correoPagador,
    reason: input.planLabel,
    amountMinor: a.expected_total_amount,
    currency: a.expected_currency,
    interval: "monthly",
    returnUrl: vuelta,
  });
  if (!creada.ok) {
    return { ok: false,
             code: creada.failure === "provider_unavailable"
               ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REFUSED" };
  }

  const admin = createAdminClient();

  // --- 5 · ¿Es de nuestra aplicación? ---------------------------------------
  //
  // Si no lo es, el objeto ya existe en el proveedor y podría cobrar bajo otra
  // aplicación de la que jamás recibiríamos un aviso. Eso ya pasó una vez. Se
  // DESHACE, y si no se puede deshacer se dice cuál quedó suelto.
  if (!applicationMatches(creada.value.applicationId,
                          proveedor.identity.value.expectedApplicationId)) {
    const deshecho = await proveedor.cancelSubscription(
      creada.value.providerSubscriptionId, false);
    return { ok: false, code: "PROVIDER_APPLICATION_MISMATCH",
             detail: deshecho.ok ? undefined
               : `orphan:${creada.value.providerSubscriptionId}` };
  }
  if (!creada.value.initPoint) {
    return { ok: false, code: "PROVIDER_REFUSED", detail: "SIN_PUNTO_DE_AUTORIZACION" };
  }

  // --- 6 · Atar --------------------------------------------------------------
  const atada = await admin.rpc("billing_attach_recurring_preapproval", {
    p_authorization_id: a.authorization_id,
    p_provider_subscription_id: creada.value.providerSubscriptionId,
    p_init_point: creada.value.initPoint,
    p_provider_status: creada.value.providerStatus,
    p_observed_collector_id: creada.value.collectorId === null
      ? null : String(creada.value.collectorId),
  });
  if (atada.error) {
    // El recurso del proveedor EXISTE y no se pudo atar. No se esconde: la
    // autorización se queda con su hueco `pending:…`, que es la señal de
    // huérfano, y el índice parcial impide que se abra otra mientras tanto.
    return { ok: false, code: "ATTACH_FAILED",
             detail: `orphan:${creada.value.providerSubscriptionId}` };
  }

  return { ok: true, authorizationId: a.authorization_id,
           subscriptionId: a.subscription_id,
           providerSubscriptionId: creada.value.providerSubscriptionId,
           initPoint: creada.value.initPoint, reused: false };
}

// ---------------------------------------------------------------------------
// EL RETORNO
// ---------------------------------------------------------------------------

export type RecurringReturnState =
  | { ok: false; code: "NOT_FOUND" | "NOT_AUTHORIZED" | "RECURRING_NOT_AVAILABLE"
              | "PROVIDER_UNAVAILABLE" | "IDENTITY_MISMATCH"; detail?: string }
  | { ok: true; state: "awaiting_authorization" | "authorization_received" | "active";
      settledNow: number; providerStatus: string | null };

/**
 * ¿Qué ha pasado con esta recurrencia?
 *
 * DEL NAVEGADOR SOLO SE ACEPTA UN PUNTERO
 *
 * Lo único que llega de la vuelta es el identificador de NUESTRA autorización.
 * Ni el estado, ni el importe, ni el identificador del proveedor: todo eso se
 * relee del proveedor, y lo que diga la barra de direcciones no cambia nada.
 * Un enlace manipulado apunta a una autorización de otra empresa —y ahí falla
 * la puerta— o a la suya, y entonces devuelve exactamente lo mismo que si no
 * lo hubiera tocado.
 *
 * Y `authorized` NO es «plan activo». Mientras no haya un cobro aprobado, la
 * respuesta es «recibimos tu autorización», que es verdad, y no «ya tienes
 * Full», que no lo es hasta que el proveedor cobre.
 */
export async function readRecurringReturn(input: {
  authorizationId: string;
  supabase: SupabaseClient;
}): Promise<RecurringReturnState> {
  const carril = resolveRecurringLane();
  if (!carril.open) return { ok: false, code: "RECURRING_NOT_AVAILABLE" };

  // La lectura va con la SESIÓN: la RLS de 0204 decide si esta persona puede
  // ver esta autorización. Una de otra empresa sencillamente no aparece.
  const { data, error } = await input.supabase
    .from("billing_recurring_authorizations")
    .select("id, subscription_id, organization_id, provider, provider_subscription_id, "
          + "environment, status, provider_status")
    .eq("id", input.authorizationId).maybeSingle();
  if (error) return { ok: false, code: "NOT_AUTHORIZED", detail: error.message };
  if (!data) return { ok: false, code: "NOT_FOUND" };

  const fila = data as unknown as {
    id: string; subscription_id: string; provider_subscription_id: string;
    environment: string; status: string; provider_status: string | null };
  if (fila.provider_subscription_id.startsWith("pending:")) {
    return { ok: true, state: "awaiting_authorization", settledNow: 0,
             providerStatus: null };
  }

  const r = await reconcileRecurringAuthorization(fila.id);
  if (!r.ok) {
    return { ok: false,
             code: r.blocked === "PROVIDER_UNREACHABLE"
               ? "PROVIDER_UNAVAILABLE" : "IDENTITY_MISMATCH",
             detail: r.blocked ?? undefined };
  }
  return {
    ok: true,
    state: r.settledNow > 0 ? "active"
         : r.authorized ? "authorization_received" : "awaiting_authorization",
    settledNow: r.settledNow, providerStatus: r.providerStatus,
  };
}

/**
 * Concilia UNA autorización contra el proveedor, con las dependencias reales.
 *
 * Esta función es el único sitio donde se construyen esas dependencias. El
 * retorno del navegador, el aviso del proveedor y el barrido programado llaman
 * aquí, y por eso los tres se comportan igual: releen, comprueban y saldan lo
 * que no estaba saldado. Ninguno concede nada por su cuenta.
 */
export async function reconcileRecurringAuthorization(
  authorizationId: string
): Promise<RecurringReconcileResult> {
  const admin = createAdminClient();
  const proveedor = mercadoPagoFromEnv();

  const { data } = await admin.from("billing_recurring_authorizations")
    .select("id, subscription_id, provider_subscription_id, environment")
    .eq("id", authorizationId).maybeSingle();
  const fila = data as { id: string; subscription_id: string;
                         provider_subscription_id: string; environment: string } | null;
  if (!fila || !proveedor.identity.ok) {
    return { ok: false, blocked: "CREDENTIAL_OWNER_MISMATCH", providerStatus: null,
             canonicalStatus: null, authorized: false, settledNow: 0,
             alreadyReconciled: 0, rejected: [], alreadySeen: 0, outcomes: [] };
  }

  // La correlación y el importe salen del INTENTO, que los congeló del
  // presupuesto. No del navegador y no de la autorización.
  const { data: intento } = await admin.from("billing_checkout_intents")
    .select("id, expected_total_amount, expected_currency")
    .eq("billing_subscription_id", fila.subscription_id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const i = intento as { id: string; expected_total_amount: number;
                         expected_currency: string } | null;
  if (!i) {
    return { ok: false, blocked: "SUBSCRIPTION_REFERENCE_MISMATCH", providerStatus: null,
             canonicalStatus: null, authorized: false, settledNow: 0,
             alreadyReconciled: 0, rejected: [], alreadySeen: 0, outcomes: [] };
  }

  const { data: vistos } = await admin.from("billing_provider_cycles")
    .select("provider_invoice_id").eq("provider_subscription_id",
                                      fila.provider_subscription_id);
  const yaVistos = ((vistos ?? []) as Array<{ provider_invoice_id: string }>)
    .map((v) => v.provider_invoice_id);

  const expectation: RecurringExpectation = {
    subscriptionId: fila.subscription_id,
    providerSubscriptionId: fila.provider_subscription_id,
    externalReference: i.id,
    expectedAmountMinor: i.expected_total_amount,
    expectedCurrency: i.expected_currency,
    configuredEnvironment: proveedor.identity.value.environment,
    authorizationEnvironment: fila.environment === "live" ? "live" : "test",
    expectedOwnerId: proveedor.identity.value.expectedOwnerId,
    credentialOwnerMatches: (await proveedor.resolveEnvironment()).ownerMatchesExpected,
    alreadySeenProviderPaymentIds: yaVistos,
  };

  const deps: RecurringReconcileDeps = {
    readSubscription: async (id) => {
      const r = await proveedor.getSubscriptionDetail(id);
      if (!r.ok) return r;
      return { ok: true, value: {
        providerStatus: r.value.providerStatus,
        externalReference: r.value.externalReference,
        collectorId: r.value.collectorId,
        applicationId: r.value.applicationId,
        nextPaymentDate: r.value.nextPaymentDate,
      } };
    },
    listPayments: async (ref) => {
      const r = await proveedor.searchPaymentsByReference(ref);
      if (!r.ok) return r;
      // EL IMPORTE SE NORMALIZA AQUÍ, no en la decisión. El proveedor habla en
      // sus unidades y el dominio en unidades mínimas; mezclarlas es cómo un
      // importe correcto parece un desajuste de cien veces.
      return { ok: true, value: r.value.payments.map((p) => ({
        providerPaymentId: p.providerPaymentId,
        canonicalStatus: p.canonicalStatus,
        amountMinor: providerAmountToMinor(p.amount, p.currency),
        currency: p.currency,
        externalReference: p.externalReference,
        liveMode: p.liveMode,
        collectorId: p.collectorId,
        // La fecha ECONÓMICA del ciclo: cuándo se aprobó, no cuándo lo leímos.
        cycleAt: p.dateApproved,
      })) };
    },
    settleCycle: async (c) => {
      const { data: r, error } = await admin.rpc("billing_reconcile_provider_cycle", {
        p_provider: "mercadopago",
        p_provider_subscription_id: c.providerSubscriptionId,
        p_provider_invoice_id: c.providerPaymentId,
        p_provider_cycle_at: c.cycleAt,
        p_provider_payment_id: c.providerPaymentId,
        p_outcome: "approved",
        p_amount: c.amountMinor,
        p_currency: c.currency,
        p_live_mode: c.liveMode,
      });
      if (error) return { outcome: `rpc_error:${error.message}` };
      return (r ?? { outcome: "unknown" }) as { outcome: string };
    },
    recordObservation: async (o) => {
      await admin.rpc("billing_observe_recurring_authorization", {
        p_authorization_id: authorizationId,
        p_provider_status: o.providerStatus,
        p_authorized: o.authorized,
        p_observed_collector_id: o.observedCollectorId === null
          ? null : String(o.observedCollectorId),
      });
    },
    now: () => new Date(),
  };

  return reconcileRecurringSubscription(expectation, deps);
}

export type { ObservedRecurringPayment };
