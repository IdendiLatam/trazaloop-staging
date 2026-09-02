/**
 * Trazaloop · PE-05B2 · La traducción del proveedor, sin red y sin secretos.
 *
 * Aquí vive TODO lo que se puede decidir con la cabeza fría: qué significa
 * cada estado de Mercado Pago en vocabulario de Trazaloop, qué recurrencia
 * corresponde a cada intervalo, y qué se le deja pasar a un evento.
 *
 * Está aparte del adaptador a propósito. El adaptador necesita un token y una
 * conexión; esto no necesita nada, así que se puede comprobar entero sin
 * credenciales y sin que el sandbox de un tercero esté de pie. La parte que
 * más fácil se equivoca es justamente esta.
 *
 * NINGUNA función de este fichero decide activar un plan.
 */
import type {
  BillingPaymentState, BillingSubscriptionState, BillingFailure,
} from "@/lib/billing/provider";

export const MERCADOPAGO = "mercadopago" as const;

/** Los temas que Mercado Pago envía y que a Trazaloop le importan. */
export const MP_TOPICS = [
  "payment",
  "subscription_preapproval",
  "subscription_authorized_payment",
  "subscription_preapproval_plan",
] as const;
export type MpTopic = (typeof MP_TOPICS)[number];

/**
 * Los temas que MUEVEN dinero o derecho. `subscription_preapproval_plan` se
 * reconoce y se ignora: Trazaloop no crea planes en el proveedor, así que si
 * llega uno es de otra integración y no tiene nada que hacer aquí.
 */
export const MP_ACTIONABLE_TOPICS: readonly string[] = [
  "payment",
  "subscription_preapproval",
  "subscription_authorized_payment",
];

export function isKnownTopic(topic: string | null | undefined): topic is MpTopic {
  return typeof topic === "string" && (MP_TOPICS as readonly string[]).includes(topic);
}

// ---------------------------------------------------------------------------
// Entorno · de dónde sale, y por qué no de una variable suelta
// ---------------------------------------------------------------------------
/**
 * Del PREFIJO DEL TOKEN, no de un interruptor aparte. Un interruptor puede
 * quedarse en «test» con un token de producción dentro, y entonces el guardia
 * que debía proteger la caja dice que todo va bien. El token es el que cobra,
 * así que el token es el que manda.
 */
export type MpEnvironment = "test" | "live";

export function environmentFromAccessToken(token: string | undefined | null): MpEnvironment | null {
  if (!token || token.trim() === "") return null;
  return token.startsWith("TEST-") ? "test" : "live";
}

/**
 * Un evento en vivo sobre una configuración de pruebas —o al revés— no se
 * procesa. Y sin dato de `live_mode` tampoco: sin dato no es «da igual».
 */
export function environmentMatches(
  liveMode: boolean | null | undefined,
  environment: MpEnvironment
): boolean {
  if (liveMode === null || liveMode === undefined) return false;
  return liveMode ? environment === "live" : environment === "test";
}

// ---------------------------------------------------------------------------
// Recurrencia · mensual y anual
// ---------------------------------------------------------------------------
export type MpRecurrence = { frequency: number; frequency_type: "months" };

/**
 * ANUAL SON DOCE MESES DE INTERVALO, NO DOCE COBROS MENSUALES.
 *
 * Simular el año con doce cargos mensuales cambiaría el producto: el cliente
 * que compra un año paga una vez, y con doce cargos podría dejar de pagar en
 * el tercero llevándose lo que contrató. Está prohibido explícitamente, y no
 * hay ninguna rama en este código que lo haga.
 *
 * Que el contrato de la API acepte `frequency: 12` está comprobado en el SDK
 * oficial y en la referencia; que el servidor de Mercado Pago lo ACEPTE para
 * Colombia no está demostrado sin una llamada real. Ver
 * PE_05B2_MERCADOPAGO_DISCOVERY.md.
 */
export function recurrenceFor(interval: "monthly" | "annual"): MpRecurrence {
  return interval === "monthly"
    ? { frequency: 1, frequency_type: "months" }
    : { frequency: 12, frequency_type: "months" };
}

// ---------------------------------------------------------------------------
// Estados de la suscripción del proveedor
// ---------------------------------------------------------------------------
/**
 * `authorized` NO es `active`.
 *
 * La documentación de Mercado Pago dice que el primer cargo real ocurre
 * alrededor de una hora después de autorizar, y que antes hay una validación
 * de tarjeta que se devuelve. Traducir `authorized` a `active` daría el plan
 * de pago a quien todavía no ha pagado nada, por un malentendido de
 * calendario. El derecho lo concede un PAGO aprobado, nunca una autorización.
 */
const SUSCRIPCION: Record<string, BillingSubscriptionState> = {
  pending: "pending",
  authorized: "pending",
  paused: "past_due",
  cancelled: "ended",
  canceled: "ended",
  finished: "ended",
  expired: "ended",
};

/** `null` = no sabemos traducirlo. Quien llame debe mandarlo a revisión. */
export function mapSubscriptionStatus(providerStatus: string | null | undefined):
  BillingSubscriptionState | null {
  if (!providerStatus) return null;
  return SUSCRIPCION[providerStatus.trim().toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Estados del pago
// ---------------------------------------------------------------------------
/**
 * `in_process` y `in_mediation` NO son rechazos.
 *
 * Un pago en revisión antifraude acaba a menudo aprobado. Tratarlo como
 * rechazo dejaría al cliente sin plan habiendo pagado, y además le diría que
 * su tarjeta falló cuando no falló.
 */
const PAGO: Record<string, BillingPaymentState> = {
  approved: "approved",
  authorized: "pending",
  pending: "pending",
  in_process: "pending",
  in_mediation: "manual_review",
  rejected: "declined",
  cancelled: "failed",
  canceled: "failed",
  refunded: "refunded",
  charged_back: "manual_review",
};

export function mapPaymentStatus(providerStatus: string | null | undefined):
  BillingPaymentState | null {
  if (!providerStatus) return null;
  return PAGO[providerStatus.trim().toLowerCase()] ?? null;
}

/**
 * Lo que se le pasa a la liquidación. Solo tres salidas tienen efecto
 * financiero; el resto NO se liquida todavía, que es distinto de fallar.
 */
export function settlementOutcome(state: BillingPaymentState | null):
  "approved" | "declined" | "failed" | null {
  if (state === "approved") return "approved";
  if (state === "declined") return "declined";
  if (state === "failed") return "failed";
  return null;
}

// ---------------------------------------------------------------------------
// Fallos del proveedor · lo que NO es un rechazo del cliente
// ---------------------------------------------------------------------------
/**
 * Que la pasarela no conteste no es que la tarjeta fuera rechazada, y
 * confundirlos acaba en un cliente que pagó y al que se le baja el plan. Se
 * traducen por CLASE DE ERROR del SDK y por código HTTP, no por el texto del
 * mensaje.
 */
export function classifyProviderError(err: unknown): BillingFailure {
  const nombre = (err as { name?: string } | null)?.name ?? "";
  const status = (err as { status?: number; statusCode?: number } | null);
  const codigo = status?.status ?? status?.statusCode ?? 0;

  if (nombre === "MPConnectionError" || nombre === "MPServerError"
      || nombre === "MPRateLimitError" || nombre === "MPResourceLockedError"
      || nombre === "MPDependencyError" || nombre === "AbortError"
      || nombre === "TimeoutError") {
    return "provider_unavailable";
  }
  if (codigo === 429 || codigo >= 500) return "provider_unavailable";
  if (nombre === "MPAuthenticationError" || nombre === "MPForbiddenError") {
    // Credenciales mal puestas es un problema NUESTRO de configuración, no un
    // rechazo del cliente: no puede acabar bajándole el plan a nadie.
    return "provider_unavailable";
  }
  if (nombre === "MPPaymentError") return "declined";
  return "invalid_request";
}

// ---------------------------------------------------------------------------
// Dinero
// ---------------------------------------------------------------------------
/**
 * El peso colombiano no tiene decimales: la unidad mínima ES el peso, así que
 * el entero de Trazaloop y el `transaction_amount` de Mercado Pago son el
 * mismo número. Para cualquier otra moneda esta equivalencia NO vale, y por
 * eso se rechaza en vez de dividir entre cien a ojo.
 */
export function minorToProviderAmount(minor: number, currency: string): number {
  if (currency.toUpperCase() !== "COP") {
    throw new Error(`CURRENCY_NOT_SUPPORTED:${currency}`);
  }
  if (!Number.isInteger(minor)) {
    throw new Error(`AMOUNT_NOT_INTEGER:${minor}`);
  }
  return minor;
}

/** Y la vuelta. Sin coma flotante: se exige que venga entero. */
export function providerAmountToMinor(amount: number | null | undefined, currency: string | null | undefined):
  number | null {
  if (amount === null || amount === undefined) return null;
  if (!currency || currency.toUpperCase() !== "COP") return null;
  if (!Number.isInteger(amount)) return null;
  return amount;
}

/** Exacta. No hay tolerancia: los dos lados son enteros de punta a punta. */
export function amountsReconcile(
  expectedMinor: number, expectedCurrency: string,
  received: number | null | undefined, receivedCurrency: string | null | undefined
): boolean {
  const m = providerAmountToMinor(received, receivedCurrency);
  if (m === null) return false;
  if ((receivedCurrency ?? "").toUpperCase() !== expectedCurrency.toUpperCase()) return false;
  return m === expectedMinor;
}

// ---------------------------------------------------------------------------
// Privacidad del sobre
// ---------------------------------------------------------------------------
const CAMPOS_PROHIBIDOS = [
  "card", "token", "card_token_id", "security_code", "cvv", "number",
  "authorization", "access_token", "secret", "payer", "email", "identification",
  "first_name", "last_name", "phone", "address",
];

/**
 * Del cuerpo que llega solo se guarda el SOBRE: quién lo manda, de qué tipo
 * es y a qué recurso apunta. Nada de tarjeta, token, cabeceras ni datos del
 * pagador. La verdad financiera se relee de la API del proveedor de todas
 * formas, así que guardar el cuerpo entero añadiría riesgo sin añadir verdad.
 */
export function sanitizeEnvelope(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const data = (b.data && typeof b.data === "object" ? b.data : {}) as Record<string, unknown>;
  const sobre: Record<string, unknown> = {
    id: typeof b.id === "string" || typeof b.id === "number" ? b.id : null,
    type: typeof b.type === "string" ? b.type : null,
    action: typeof b.action === "string" ? b.action : null,
    api_version: typeof b.api_version === "string" ? b.api_version : null,
    live_mode: typeof b.live_mode === "boolean" ? b.live_mode : null,
    date_created: typeof b.date_created === "string" ? b.date_created : null,
    user_id: typeof b.user_id === "string" || typeof b.user_id === "number" ? b.user_id : null,
    data_id: typeof data.id === "string" || typeof data.id === "number" ? data.id : null,
  };
  for (const k of Object.keys(sobre)) if (sobre[k] === null) delete sobre[k];
  return sobre;
}

/** Un guardia con dientes: se comprueba en las pruebas contra cuerpos reales. */
export function envelopeIsClean(sobre: Record<string, unknown>): boolean {
  const texto = JSON.stringify(sobre).toLowerCase();
  return !CAMPOS_PROHIBIDOS.some((c) => texto.includes(`"${c}"`));
}

// ---------------------------------------------------------------------------
// El recurso que trae la notificación
// ---------------------------------------------------------------------------
export type MpNotification = {
  topic: MpTopic;
  resourceId: string;
  liveMode: boolean | null;
  envelope: Record<string, unknown>;
};

/**
 * Mercado Pago manda el tema y el identificador por dos vías distintas según
 * la antigüedad de la notificación: en el cuerpo (`type`/`data.id`) y en la
 * cadena de consulta (`topic`/`id`). Se aceptan las dos y se normaliza, porque
 * rechazar una entrega legítima por su forma es perder un cobro.
 */
export function readNotification(body: unknown, query: URLSearchParams): MpNotification | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data = (b.data && typeof b.data === "object" ? b.data : {}) as Record<string, unknown>;

  const tema = (typeof b.type === "string" && b.type)
    || (typeof b.topic === "string" && b.topic)
    || query.get("type") || query.get("topic") || "";
  if (!isKnownTopic(tema)) return null;

  const bruto = (data.id !== undefined && data.id !== null ? String(data.id) : "")
    || query.get("data.id") || query.get("id") || "";
  if (!bruto) return null;

  return {
    topic: tema,
    // La documentación pide minúsculas cuando el identificador trae letras.
    resourceId: bruto.toLowerCase(),
    liveMode: typeof b.live_mode === "boolean" ? b.live_mode : null,
    envelope: sanitizeEnvelope(b),
  };
}
