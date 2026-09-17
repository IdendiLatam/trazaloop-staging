import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { mercadoPagoFromEnv } from "@/lib/billing/providers/mercadopago";
import { applicationMatches } from "@/lib/billing/mercadopago/identity";
import { providerAmountToMinor } from "@/lib/billing/mercadopago/mapping";
import { resolveRecurringLane } from "@/lib/billing/recurring/policy";
import { resolveRecurringPayer } from "@/lib/billing/recurring/payer";
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

/**
 * Registro de servidor. Lleva la CLASE del fallo y el diagnóstico ya saneado
 * por el adaptador; jamás una credencial, una cabecera ni un dato de tarjeta.
 */
function log_recurrente(evento: string, campos: Record<string, unknown>) {
  console.log(`[billing:recurring] ${evento}`, JSON.stringify(campos));
}

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
  const d = intento.data as { intent_id: string };
  const intentId = String(d.intent_id);

  // EL PAGADOR NO SALE DE LA SESIÓN, Y ESTO SE APRENDIÓ PAGÁNDOLO.
  //
  // El primer clic humano real mandó el correo del administrador que estaba
  // contratando y Mercado Pago lo rechazó. En el sandbox el pagador es una
  // IDENTIDAD del proveedor, no una dirección cualquiera. Lo decide
  // `resolveRecurringPayer`, que ni siquiera admite un correo por parámetro:
  // no se puede pasar por error algo que la firma no acepta.
  const pagador = resolveRecurringPayer(proveedor.identity.value.environment);
  if (!pagador.ok) {
    return { ok: false, code: "RECURRING_NOT_AVAILABLE", detail: pagador.reason };
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
    payerEmail: pagador.email,
    reason: input.planLabel,
    amountMinor: a.expected_total_amount,
    currency: a.expected_currency,
    interval: "monthly",
    returnUrl: vuelta,
  });
  // EL CLIENTE ADMINISTRATIVO, antes del rechazo: hace falta para poder CERRAR
  // el intento, y cerrarlo es parte de responder bien a un fallo.
  const admin = createAdminClient();

  if (!creada.ok) {
    // EL DIAGNÓSTICO NO SE TIRA. Antes esta rama devolvía solo un código, y por
    // eso el primer rechazo real de la pasarela se perdió: se vio una vez en
    // una pantalla y no quedó en ninguna parte. `detail` lo produce el
    // adaptador ya saneado —nombre, http, mensaje y causas, recortado, sin
    // nada que lleve arroba— así que se puede registrar y persistir.
    const diagnostico = (creada as { detail?: string | null }).detail ?? null;
    log_recurrente("preapproval_rechazada", {
      authorization_id: a.authorization_id,
      failure: creada.failure,
      diagnostic: diagnostico,
    });

    // LOS DOS FINALES QUE NO SON EL MISMO.
    //
    // `provider_unavailable` es un timeout o un 5xx: la petición SALIÓ y no
    // sabemos si creó la preapproval. Dar eso por fallido y dejar reintentar
    // es cómo se acaba con dos suscripciones cobrando. Se marca INCIERTO, que
    // deja la autorización viva y bloquea el segundo intento.
    //
    // Cualquier otro rechazo es la pasarela diciendo que no a la petición: no
    // hay recurso, y el intento se CIERRA para no dejar ocupado el carril
    // manual por una contratación que nunca existió.
    const incierto = creada.failure === "provider_unavailable";
    await admin.rpc("billing_close_recurring_attempt", {
      p_authorization_id: a.authorization_id,
      p_outcome: incierto ? "uncertain" : "refused",
      p_failure: creada.failure,
      p_diagnostic: diagnostico,
    });

    return { ok: false,
             code: incierto ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REFUSED",
             detail: diagnostico ?? undefined };
  }

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
  // Y SE ATA TAMBIÉN EL INTENTO, con la primitiva de 0171.
  //
  // No es redundante: `billing_reconcile_provider_cycle` resuelve la
  // suscripción DESDE EL INTENTO, por su `provider_subscription_id`. Sin esta
  // llamada el primer cobro real devolvió `subscription_unknown` — el dinero
  // estaba, la suscripción estaba, y no había puente entre los dos.
  await admin.rpc("billing_attach_provider_subscription", {
    p_intent_id: intentId,
    p_provider_subscription_id: creada.value.providerSubscriptionId,
    p_init_point: creada.value.initPoint,
    p_provider_status: creada.value.providerStatus,
    p_status: "provider_created",
    p_synced_amount: creada.value.amount,
    p_provider_version: creada.value.version,
    p_next_payment_date: creada.value.nextPaymentDate,
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

  // Se pregunta al proveedor ANTES de decidir qué intento mirar: la referencia
  // es suya, no nuestra. Si no responde, no se concluye nada.
  const cabeza = await proveedor.getSubscriptionDetail(fila.provider_subscription_id);
  if (!cabeza.ok) {
    return { ok: false, blocked: "PROVIDER_UNREACHABLE", providerStatus: null,
             canonicalStatus: null, authorized: false, settledNow: 0,
             alreadyReconciled: 0, rejected: [], alreadySeen: 0, outcomes: [] };
  }
  const subRef = cabeza.value.externalReference;

  // LA CORRELACIÓN SE RESUELVE POR LA REFERENCIA QUE DICE EL PROVEEDOR.
  //
  // Antes esto buscaba «el intento más reciente de esta suscripción», y el
  // primer cobro real lo desmintió: una empresa puede haber presupuestado
  // varias veces —cada visita a la pantalla de contratación crea un
  // presupuesto, y cada presupuesto su intento— así que «el más reciente» no
  // tiene por qué ser aquel con el que se creó ESTA preapproval. El resultado
  // fue un `SUBSCRIPTION_REFERENCE_MISMATCH` sobre un cobro perfectamente
  // legítimo.
  //
  // El orden correcto es el inverso: se lee la referencia que el proveedor
  // guarda en la preapproval, se busca ESE intento, y se comprueba que
  // pertenece a esta misma suscripción. Así la referencia no se adivina, se
  // verifica; y un objeto de otra contratación se cae por la comprobación de
  // pertenencia en vez de colarse por ser el más nuevo.
  const refProveedor = (subRef ?? "").trim();
  const { data: intento } = refProveedor === "" ? { data: null } : await admin
    .from("billing_checkout_intents")
    .select("id, expected_total_amount, expected_currency, billing_subscription_id")
    .eq("id", refProveedor).maybeSingle();
  const i = intento as { id: string; expected_total_amount: number;
                         expected_currency: string;
                         billing_subscription_id: string | null } | null;
  if (!i || i.billing_subscription_id !== fila.subscription_id) {
    return { ok: false, blocked: "SUBSCRIPTION_REFERENCE_MISMATCH", providerStatus: null,
             canonicalStatus: null, authorized: false, settledNow: 0,
             alreadyReconciled: 0, rejected: [], alreadySeen: 0, outcomes: [] };
  }

  // EL PUENTE, RESTAURADO SI FALTA.
  //
  // La conciliación es el camino que repara la verdad, así que también repara
  // esto: si el intento no lleva el objeto del proveedor —porque el atado
  // falló, o porque la contratación es anterior a que se atara— se ata ahora,
  // con la MISMA primitiva gobernada y con el identificador que acaba de decir
  // el proveedor. Es idempotente: volver a atar el mismo objeto no hace nada.
  await admin.rpc("billing_attach_provider_subscription", {
    p_intent_id: i.id,
    p_provider_subscription_id: fila.provider_subscription_id,
    p_init_point: null,
    p_provider_status: cabeza.value.providerStatus,
    p_status: "provider_created",
  });

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
    // El ancla de periodos: el PRIMER cobro reconocido. La primitiva se niega
    // sola si ya hay ancla o ya hay periodos, así que llamarla es seguro.
    setAnchor: async (anchorAt) => {
      await admin.rpc("billing_set_recurring_anchor", {
        p_subscription_id: fila.subscription_id,
        p_anchor_at: anchorAt,
      });
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

// ---------------------------------------------------------------------------
// LA CANCELACIÓN
// ---------------------------------------------------------------------------

export type CancelRecurringResult =
  | { ok: true; outcome: "cancelled"; canonicalStatus: "cancel_at_period_end" | "ended";
      paidThrough: string | null; accessPreserved: boolean }
  | { ok: false; code: CancelRecurringError; detail?: string;
      paidThrough?: string | null };

export type CancelRecurringError =
  | "RECURRING_NOT_AVAILABLE"
  | "NOT_FOUND"
  | "NOT_AUTHORIZED"
  | "NOT_A_PROVIDER_RECURRENCE"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REFUSED"
  | "IDENTITY_MISMATCH";

/** Lo que ve quien cancela. Nunca un código, nunca la respuesta del proveedor. */
export const CANCEL_RECURRING_MESSAGE: Record<CancelRecurringError, string> = {
  RECURRING_NOT_AVAILABLE:
    "Esta opción todavía no está disponible.",
  NOT_FOUND:
    "No encontramos esta contratación.",
  NOT_AUTHORIZED:
    "No encontramos esta contratación.",
  NOT_A_PROVIDER_RECURRENCE:
    "Esta contratación no tiene cobros programados que detener.",
  PROVIDER_UNAVAILABLE:
    "No pudimos contactar con la pasarela. Tu plan sigue activo y no se canceló nada; inténtalo de nuevo en unos minutos.",
  PROVIDER_REFUSED:
    "La pasarela no pudo detener los cobros. Tu plan sigue activo; inténtalo de nuevo.",
  IDENTITY_MISMATCH:
    "No pudimos verificar esta contratación. Tu plan sigue activo y no se canceló nada.",
};

/**
 * Detiene los cobros futuros de una recurrencia.
 *
 * EL ORDEN, Y POR QUÉ ESE
 *
 *   1. Se relee al proveedor ANTES de tocar nada. Cancelar a ciegas sobre un
 *      objeto que ya cambió es cómo se acaba cancelando otra cosa.
 *   2. Se comprueba que ese objeto es NUESTRO —referencia y cobrador— con las
 *      mismas reglas que la conciliación.
 *   3. Se cancela.
 *   4. Se RELEE otra vez. Lo que se persiste es lo que el proveedor dice
 *      después, no lo que devolvió la llamada: una respuesta optimista que no
 *      se confirma es exactamente cómo se registra una cancelación que no
 *      ocurrió.
 *
 * Y ante la duda no se mueve nada: un tiempo agotado no cancela, no retira
 * acceso y no miente. Se anota y se puede reintentar.
 */
export async function cancelRecurringSubscription(input: {
  authorizationId: string;
  supabase: SupabaseClient;
}): Promise<CancelRecurringResult> {
  const carril = resolveRecurringLane();
  if (!carril.open) return { ok: false, code: "RECURRING_NOT_AVAILABLE" };

  // QUIÉN PUEDE. La RLS de 0204 decide: una autorización de otra empresa
  // sencillamente no aparece. Del navegador solo llega este puntero.
  const { data, error } = await input.supabase
    .from("billing_recurring_authorizations")
    .select("id, subscription_id, provider, provider_subscription_id, environment, status")
    .eq("id", input.authorizationId).maybeSingle();
  if (error) return { ok: false, code: "NOT_AUTHORIZED", detail: error.message };
  if (!data) return { ok: false, code: "NOT_FOUND" };
  const fila = data as unknown as {
    id: string; subscription_id: string; provider: string;
    provider_subscription_id: string; environment: string; status: string };

  if (fila.provider_subscription_id.startsWith("pending:")) {
    return { ok: false, code: "NOT_A_PROVIDER_RECURRENCE" };
  }

  const admin = createAdminClient();
  const proveedor = mercadoPagoFromEnv();
  if (!proveedor.identity.ok) return { ok: false, code: "IDENTITY_MISMATCH" };

  const { data: sub } = await admin.from("billing_subscriptions")
    .select("id, renewal_mode").eq("id", fila.subscription_id).maybeSingle();
  if (!sub || (sub as { renewal_mode: string }).renewal_mode !== "provider") {
    return { ok: false, code: "NOT_A_PROVIDER_RECURRENCE" };
  }

  // --- 1 · Releer ANTES ------------------------------------------------------
  const antes = await proveedor.getSubscriptionDetail(fila.provider_subscription_id);
  if (!antes.ok) {
    await admin.rpc("billing_cancel_recurring", {
      p_authorization_id: fila.id, p_outcome: "uncertain",
      p_failure: antes.failure,
      p_diagnostic: (antes as { detail?: string | null }).detail ?? null });
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }

  // --- 2 · ¿Es nuestro? ------------------------------------------------------
  if (antes.value.collectorId !== null
      && proveedor.identity.value.expectedOwnerId !== null
      && antes.value.collectorId !== proveedor.identity.value.expectedOwnerId) {
    return { ok: false, code: "IDENTITY_MISMATCH" };
  }

  // YA ESTABA CANCELADA. No es un error: es un doble clic, o una cancelación
  // hecha desde el panel del proveedor. Se asienta igual, sin volver a pedirla.
  const yaCancelada = ["cancelled", "canceled", "finished", "expired"]
    .includes((antes.value.providerStatus ?? "").trim().toLowerCase());

  // --- 3 · Cancelar ----------------------------------------------------------
  if (!yaCancelada) {
    const r = await proveedor.cancelSubscription(fila.provider_subscription_id, false);
    if (!r.ok) {
      const incierto = r.failure === "provider_unavailable";
      await admin.rpc("billing_cancel_recurring", {
        p_authorization_id: fila.id,
        p_outcome: incierto ? "uncertain" : "refused",
        p_failure: r.failure,
        p_diagnostic: (r as { detail?: string | null }).detail ?? null });
      return { ok: false,
               code: incierto ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REFUSED" };
    }
  }

  // --- 4 · Releer DESPUÉS ----------------------------------------------------
  //
  // Lo que se persiste sale de aquí. Si no se puede releer, NO se afirma que se
  // canceló: se deja en duda, que es la verdad.
  const despues = await proveedor.getSubscriptionDetail(fila.provider_subscription_id);
  if (!despues.ok) {
    await admin.rpc("billing_cancel_recurring", {
      p_authorization_id: fila.id, p_outcome: "uncertain",
      p_failure: despues.failure,
      p_diagnostic: (despues as { detail?: string | null }).detail ?? null });
    return { ok: false, code: "PROVIDER_UNAVAILABLE" };
  }
  const estadoFinal = (despues.value.providerStatus ?? "").trim().toLowerCase();
  if (!["cancelled", "canceled", "finished", "expired"].includes(estadoFinal)) {
    await admin.rpc("billing_cancel_recurring", {
      p_authorization_id: fila.id, p_outcome: "uncertain",
      p_provider_status: despues.value.providerStatus,
      p_failure: "provider_state_not_cancelled" });
    return { ok: false, code: "PROVIDER_REFUSED" };
  }

  const { data: asentado, error: eCancel } = await admin.rpc("billing_cancel_recurring", {
    p_authorization_id: fila.id, p_outcome: "cancelled",
    p_provider_status: despues.value.providerStatus });
  if (eCancel) return { ok: false, code: "PROVIDER_REFUSED", detail: eCancel.message };

  const a = (asentado ?? {}) as { canonical_status?: string; paid_through?: string | null;
                                  access_preserved?: boolean };
  return { ok: true, outcome: "cancelled",
           canonicalStatus: a.canonical_status === "ended" ? "ended" : "cancel_at_period_end",
           paidThrough: a.paid_through ?? null,
           accessPreserved: Boolean(a.access_preserved) };
}

/** ¿Tiene esta empresa una recurrencia viva? Decide la coexistencia. */
export async function findLiveRecurring(organizationId: string): Promise<{
  authorizationId: string; subscriptionId: string; status: string;
  paidThrough: string | null } | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_recurring_authorizations")
    .select("id, subscription_id, status")
    .eq("organization_id", organizationId)
    .in("status", ["awaiting_authorization", "authorized", "uncertain"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const a = data as unknown as { id: string; subscription_id: string; status: string };
  const { data: per } = await admin.from("billing_subscription_periods")
    .select("period_end").eq("subscription_id", a.subscription_id)
    .eq("status", "settled").order("period_end", { ascending: false }).limit(1).maybeSingle();
  return { authorizationId: a.id, subscriptionId: a.subscription_id, status: a.status,
           paidThrough: (per as { period_end: string } | null)?.period_end ?? null };
}
