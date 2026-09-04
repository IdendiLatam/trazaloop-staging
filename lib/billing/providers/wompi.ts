import "server-only";
import { createHash } from "node:crypto";
import type {
  BillingProvider, ProviderResult, ProviderPayment, RenewalFailureClass,
} from "@/lib/billing/provider";
import {
  WOMPI, classifyWompiKeys, copToWompiCents, wompiCentsToCop,
  mapTransactionStatus, paymentSourceIsUsable, classifyProviderError,
  integritySignaturePayload, type WompiEnvironment,
} from "@/lib/billing/wompi/mapping";

/**
 * Trazaloop · PE-05B2W · El adaptador de Wompi.
 *
 * Único fichero del producto que sabe qué es una «fuente de pago». Fuera de
 * aquí el dominio habla el contrato de B1.
 *
 * LA DIFERENCIA CON EL OTRO PROVEEDOR, Y ES GRANDE
 *
 * Wompi NO programa la recurrencia. Guarda un medio de pago y espera a que se
 * le pida cada cobro. Por eso su capacidad declara `recurrenceOwner:
 * "merchant"`, y por eso el cobro anual deja de ser una incógnita: es la misma
 * transacción doce meses después.
 *
 * LO QUE ESTE ADAPTADOR NO HACE
 *
 * · No recibe datos de tarjeta. El número se tokeniza contra Wompi y aquí solo
 *   entra un token que ya no es una tarjeta.
 * · No decide activar nada. Devuelve lo que el proveedor dice.
 * · No calcula importes, impuestos ni tipo de cambio: llegan hechos de B1.
 * · No programa nada. El calendario es del dominio, y todavía no existe.
 */

const TIEMPO_MAXIMO_MS = 15_000;

type Fallo = { ok: false; failure: ReturnType<typeof classifyProviderError>;
               message: string; detail: string | null };

export type WompiAdapter = BillingProvider & {
  readonly environment: WompiEnvironment | null;
  readonly configurationProblems: string[];
  /**
   * La llave PÚBLICA y la base de la API del entorno ya clasificado.
   *
   * Las dos son públicas a propósito: sin ellas el navegador no puede
   * tokenizar, y con ellas no puede cobrar. Se exponen aquí —y no como
   * variable `NEXT_PUBLIC_`— para que quien las reparta siga siendo el
   * servidor, y para que la base no la adivine el cliente.
   */
  readonly publicKey: string | null;
  readonly apiBaseUrl: string | null;

  /** Los dos contratos que la persona tiene que aceptar, con sus enlaces. */
  getAcceptanceContracts(): Promise<ProviderResult<{
    acceptanceToken: string; acceptancePermalink: string | null;
    personalAuthToken: string; personalAuthPermalink: string | null;
  }>>;

  createPaymentSource(input: {
    cardToken: string; customerEmail: string;
    acceptanceToken: string; personalAuthToken: string;
  }): Promise<ProviderResult<{
    paymentSourceId: number; status: string | null; usable: boolean;
    type: string | null;
  }>>;

  /**
   * Un cobro contra el medio guardado. `recurrent` activa el uso de credencial
   * en archivo, que es lo que corresponde a una suscripción de importe fijo.
   */
  chargePaymentSource(input: {
    paymentSourceId: number; amountCopMinor: number; currency: string;
    reference: string; customerEmail: string; recurrent: boolean;
    installments?: number;
  }): Promise<ProviderResult<{
    transactionId: string; status: string | null;
    canonicalStatus: ReturnType<typeof mapTransactionStatus>;
    amountCopMinor: number | null; currency: string | null;
    reference: string | null; paymentSourceId: number | null;
    statusMessage: string | null;
  }>>;

  getTransaction(id: string): Promise<ProviderResult<{
    transactionId: string; status: string | null;
    canonicalStatus: ReturnType<typeof mapTransactionStatus>;
    amountCopMinor: number | null; currency: string | null;
    reference: string | null; paymentSourceId: number | null;
    statusMessage: string | null; finalizedAt: string | null;
  }>>;
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function wompiProvider(llaves: {
  publicKey?: string; privateKey?: string;
  eventsSecret?: string; integritySecret?: string;
}): WompiAdapter {
  const clasificacion = classifyWompiKeys(llaves);
  const base = clasificacion.baseUrl;
  const configurado = clasificacion.environment !== null;

  const sinConfigurar = <T>(): ProviderResult<T> => ({
    ok: false, failure: "provider_unavailable",
    message: `WOMPI_NOT_CONFIGURED:${clasificacion.problems.join(",") || "unknown"}`,
  });

  /**
   * El detalle del error del proveedor, saneado: sin nada con arroba, por si
   * alguna vez devuelve el correo de quien paga.
   */
  const detalle = (status: number, cuerpo: unknown): string | null => {
    const partes = [`http=${status}`];
    const c = cuerpo as Record<string, unknown> | null;
    const err = (c?.error ?? null) as Record<string, unknown> | null;
    if (err) {
      if (typeof err.type === "string") partes.push(err.type);
      if (err.reason) partes.push(String(err.reason).slice(0, 200));
      if (err.messages) partes.push(JSON.stringify(err.messages).slice(0, 400));
    } else if (c) {
      partes.push(JSON.stringify(c).slice(0, 400));
    }
    const salida = partes.filter((x) => !x.includes("@")).join(" | ").slice(0, 700);
    return salida === "" ? null : salida;
  };

  const fallo = (status: number, cuerpo: unknown): Fallo => {
    const clase = classifyProviderError({ status });
    return { ok: false, failure: clase, message: clase, detail: detalle(status, cuerpo) };
  };

  const pedir = async (ruta: string, opciones: {
    method?: string; body?: unknown; key: string;
  }): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> => {
    const r = await fetch(`${base}${ruta}`, {
      method: opciones.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opciones.key}`,
      },
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    let body: Record<string, unknown> = {};
    try { body = (await r.json()) as Record<string, unknown>; } catch { body = {}; }
    return { ok: r.ok, status: r.status, body };
  };

  const leerTransaccion = (d: Record<string, unknown>) => ({
    transactionId: String(d.id ?? ""),
    status: str(d.status),
    canonicalStatus: mapTransactionStatus(str(d.status)),
    amountCopMinor: wompiCentsToCop(num(d.amount_in_cents)),
    currency: str(d.currency),
    reference: str(d.reference),
    paymentSourceId: num(d.payment_source_id),
    statusMessage: str(d.status_message),
  });

  return {
    name: WOMPI,
    live: configurado,
    // Wompi guarda el medio de pago; el calendario es del comercio.
    capabilities: {
      recurrenceOwner: "merchant",
      supportsStoredPaymentSource: true,
      supportsRecurringCharge: true,
      supportsProviderSubscription: false,
    },
    environment: clasificacion.environment,
    configurationProblems: clasificacion.problems,
    publicKey: llaves.publicKey ?? null,
    apiBaseUrl: base,

    async getAcceptanceContracts() {
      if (!configurado || !llaves.publicKey) return sinConfigurar();
      try {
        const r = await pedir(`/merchants/${llaves.publicKey}`, { key: llaves.publicKey });
        if (!r.ok) return fallo(r.status, r.body);
        const d = (r.body.data ?? {}) as Record<string, unknown>;
        const pe = (d.presigned_acceptance ?? {}) as Record<string, unknown>;
        const pp = (d.presigned_personal_data_auth ?? {}) as Record<string, unknown>;
        const aceptacion = str(pe.acceptance_token);
        const personal = str(pp.acceptance_token);
        if (!aceptacion || !personal) {
          return { ok: false, failure: "invalid_request",
                   message: "ACCEPTANCE_TOKENS_MISSING" };
        }
        return { ok: true, value: {
          acceptanceToken: aceptacion, acceptancePermalink: str(pe.permalink),
          personalAuthToken: personal, personalAuthPermalink: str(pp.permalink),
        } };
      } catch (e) { return { ...fallo(0, null), failure: classifyProviderError(e) }; }
    },

    async createPaymentSource(input) {
      if (!configurado || !llaves.privateKey) return sinConfigurar();
      try {
        const r = await pedir("/payment_sources", {
          method: "POST", key: llaves.privateKey,
          body: {
            type: "CARD",
            token: input.cardToken,
            customer_email: input.customerEmail,
            acceptance_token: input.acceptanceToken,
            accept_personal_auth: input.personalAuthToken,
          },
        });
        if (!r.ok) return fallo(r.status, r.body);
        const d = (r.body.data ?? {}) as Record<string, unknown>;
        const estado = str(d.status);
        return { ok: true, value: {
          paymentSourceId: Number(d.id), status: estado,
          usable: paymentSourceIsUsable(estado), type: str(d.type),
        } };
      } catch (e) { return { ...fallo(0, null), failure: classifyProviderError(e) }; }
    },

    async chargePaymentSource(input) {
      if (!configurado || !llaves.privateKey || !llaves.integritySecret) {
        return sinConfigurar();
      }
      let centavos: number;
      try {
        centavos = copToWompiCents(input.amountCopMinor);
      } catch (e) {
        return { ok: false, failure: "invalid_request",
                 message: e instanceof Error ? e.message : "AMOUNT_INVALID" };
      }
      // La firma de integridad se calcula AQUÍ, en el servidor: el secreto no
      // puede pasar por el navegador.
      const firma = createHash("sha256").update(integritySignaturePayload(
        input.reference, centavos, input.currency, llaves.integritySecret)).digest("hex");
      try {
        const r = await pedir("/transactions", {
          method: "POST", key: llaves.privateKey,
          body: {
            amount_in_cents: centavos,
            currency: input.currency,
            customer_email: input.customerEmail,
            reference: input.reference,
            payment_source_id: input.paymentSourceId,
            payment_method: { installments: input.installments ?? 1 },
            recurrent: input.recurrent,
            signature: firma,
          },
        });
        if (!r.ok) return fallo(r.status, r.body);
        const d = (r.body.data ?? {}) as Record<string, unknown>;
        return { ok: true, value: leerTransaccion(d) };
      } catch (e) { return { ...fallo(0, null), failure: classifyProviderError(e) }; }
    },

    /**
     * El cobro recurrente, en vocabulario del dominio.
     *
     * Traduce y clasifica, que es todo lo que un adaptador debe hacer. La
     * clasificación importa más que el mensaje: si la petición SALIÓ y no hubo
     * respuesta, se dice `provider_unknown` y nadie vuelve a cobrar solo.
     */
    async chargeStoredPaymentMethod(input): Promise<ProviderResult<ProviderPayment>> {
      if (!configurado) {
        return { ok: false, failure: "provider_unavailable",
                 message: `WOMPI_NOT_CONFIGURED:${clasificacion.problems.join(",") || "unknown"}`,
                 failureClass: "provider_unavailable" };
      }
      const fuente = Number(input.providerPaymentMethodId);
      if (!Number.isInteger(fuente) || fuente <= 0) {
        return { ok: false, failure: "invalid_request",
                 message: "PAYMENT_METHOD_REFERENCE_INVALID",
                 failureClass: "payment_method_unavailable" };
      }
      const r = await this.chargePaymentSource({
        paymentSourceId: fuente,
        amountCopMinor: input.amountMinor,
        currency: input.currency,
        reference: input.reference,
        customerEmail: input.customerEmail,
        // El comercio programa el cobro: sin esto, la tarjeta guardada no
        // valdría para los meses siguientes.
        recurrent: true,
      });
      if (r.ok) {
        return { ok: true, value: {
          providerPaymentId: r.value.transactionId,
          // Un estado que no sepamos traducir NO es «aprobado»: se queda
          // pendiente y lo resolverá la conciliación.
          status: r.value.canonicalStatus ?? "pending",
          amount: r.value.amountCopMinor,
          currency: r.value.currency,
        } };
      }
      // La petición cruzó la frontera: puede haberse cobrado. Nunca se
      // reintenta sola una de estas.
      const clase: RenewalFailureClass =
        r.failure === "declined" ? "retryable_decline"
        : r.failure === "invalid_request" ? "integrity_mismatch"
        : "provider_unknown";
      return { ok: false, failure: r.failure, message: r.message, failureClass: clase };
    },

    async getTransaction(id) {
      if (!configurado || !llaves.publicKey) return sinConfigurar();
      try {
        const r = await pedir(`/transactions/${encodeURIComponent(id)}`,
                              { key: llaves.publicKey });
        if (!r.ok) return fallo(r.status, r.body);
        const d = (r.body.data ?? {}) as Record<string, unknown>;
        return { ok: true, value: { ...leerTransaccion(d),
                                    finalizedAt: str(d.finalized_at) } };
      } catch (e) { return { ...fallo(0, null), failure: classifyProviderError(e) }; }
    },

    // --- El contrato de B1 -------------------------------------------------

    async createSubscriptionCheckout() {
      // Wompi no tiene objeto de suscripción. Fingir uno sería mentirle al
      // dominio sobre quién lleva el calendario.
      return { ok: false, failure: "invalid_request",
               message: "WOMPI_HAS_NO_PROVIDER_SUBSCRIPTION" };
    },

    async getPayment(providerPaymentId) {
      const r = await this.getTransaction(providerPaymentId);
      if (!r.ok) return r;
      return { ok: true, value: {
        providerPaymentId: r.value.transactionId,
        status: r.value.canonicalStatus ?? "manual_review",
        amount: r.value.amountCopMinor, currency: r.value.currency,
      } };
    },

    async getSubscription() {
      return { ok: false, failure: "invalid_request",
               message: "WOMPI_HAS_NO_PROVIDER_SUBSCRIPTION" };
    },

    async cancelSubscription() {
      // Cancelar es dejar de cobrar, y de eso se encarga el calendario del
      // dominio. No hay nada que cancelar en el proveedor.
      return { ok: false, failure: "invalid_request",
               message: "WOMPI_CANCELLATION_IS_A_MERCHANT_DECISION" };
    },

    async verifyWebhook() {
      return { ok: false, failure: "invalid_request",
               message: "USE_ROUTE_SIGNATURE_VERIFICATION" };
    },
  };
}

export function wompiFromEnv(): WompiAdapter {
  return wompiProvider({
    publicKey: process.env.WOMPI_PUBLIC_KEY,
    privateKey: process.env.WOMPI_PRIVATE_KEY,
    eventsSecret: process.env.WOMPI_EVENTS_SECRET,
    integritySecret: process.env.WOMPI_INTEGRITY_SECRET,
  });
}
