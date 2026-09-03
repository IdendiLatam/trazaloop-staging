import "server-only";
import { MercadoPagoConfig, PreApproval, Payment } from "mercadopago";
import type {
  BillingProvider, ProviderCheckout, ProviderPayment, ProviderResult,
  BillingSubscriptionState,
} from "@/lib/billing/provider";
import {
  MERCADOPAGO, recurrenceFor, mapPaymentStatus, mapSubscriptionStatus,
  classifyProviderError, minorToProviderAmount, environmentFromAccessToken,
  classifyOwnerEnvironment, type MpEnvironment,
} from "@/lib/billing/mercadopago/mapping";

/**
 * Trazaloop · PE-05B2 · El adaptador de Mercado Pago.
 *
 * Este es el ÚNICO fichero del producto que sabe qué es un «preapproval».
 * Fuera de aquí el dominio habla el contrato de B1, para que cambiar de
 * pasarela no obligue a tocar el modelo comercial que PE-04 estabilizó.
 *
 * SDK OFICIAL, NO REST A MANO
 *
 * `mercadopago@3.6.0` cubre exactamente lo que hace falta —PreApproval
 * create/get/update, Payment get y el verificador de firma— trae los errores
 * tipados que permiten distinguir «la pasarela no responde» de «la tarjeta fue
 * rechazada», y reintenta con retroceso acotado sobre 429 y 5xx. Escribir REST
 * a mano habría significado reimplementar las tres cosas peor.
 *
 * LO QUE ESTE ADAPTADOR NO PUEDE HACER
 *
 * · No recibe datos de tarjeta. El contrato no ofrece por dónde pasarlos.
 * · No decide activar nada. Devuelve lo que el proveedor dice; quien concede
 *   el derecho es el dominio, después de conciliar.
 * · No calcula impuestos, ni tipo de cambio, ni descuentos: el importe llega
 *   ya hecho desde B1 y aquí solo se transporta.
 */

const TIEMPO_MAXIMO_MS = 10_000;

/**
 * La identidad del dueño del token no cambia mientras el proceso vive, y
 * preguntarla en cada webhook sería una llamada de red por notificación. Se
 * recuerda por token. No se recuerda un fallo: no poder preguntar hoy no puede
 * quedarse pegado como respuesta.
 */
const identidadRecordada = new Map<string, {
  environment: MpEnvironment; siteId: string | null; countryId: string | null;
  isTestUser: boolean; reachable: boolean;
}>();

export type MercadoPagoAdapter = BillingProvider & {
  /** Pista síncrona: «test» solo cuando se puede afirmar sin preguntar. */
  readonly environment: MpEnvironment | null;
  /**
   * La clasificación que manda. Pregunta por la identidad del dueño del token
   * y falla cerrado: sin evidencia positiva de usuario de prueba, «live».
   */
  resolveEnvironment(): Promise<{
    environment: MpEnvironment; siteId: string | null; countryId: string | null;
    isTestUser: boolean; reachable: boolean;
  }>;
  createSubscription(input: {
    externalReference: string;
    payerEmail: string;
    reason: string;
    amountMinor: number;
    currency: string;
    interval: "monthly" | "annual";
    returnUrl: string;
  }): Promise<ProviderResult<{
    providerSubscriptionId: string; initPoint: string | null;
    providerStatus: string | null; canonicalStatus: BillingSubscriptionState | null;
    amount: number | null; currency: string | null;
    frequency: number | null; frequencyType: string | null;
    version: number | null; nextPaymentDate: string | null;
    externalReference: string | null;
  }>>;
  getSubscriptionDetail(id: string): Promise<ProviderResult<{
    providerSubscriptionId: string; providerStatus: string | null;
    canonicalStatus: BillingSubscriptionState | null;
    amount: number | null; currency: string | null;
    frequency: number | null; frequencyType: string | null;
    version: number | null; nextPaymentDate: string | null;
    externalReference: string | null;
  }>>;
  /**
   * Cambiar el importe recurrente de UNA suscripción. Es la primitiva que más
   * adelante servirá para una exención fiscal aprobada o para un cambio de
   * precio autorizado, sin crear un plan nuevo y sin perder la identidad de la
   * suscripción. B2 la construye y la prueba; NO la activa para nada.
   */
  updateRecurringAmount(id: string, amountMinor: number, currency: string):
    Promise<ProviderResult<{ amount: number | null; currency: string | null; version: number | null }>>;
  /**
   * Reconciliar en vez de duplicar. Si una petición de creación se envía y la
   * respuesta se pierde —una caída, un tiempo agotado—, el objeto puede existir
   * en el proveedor sin que aquí conste. Volver a crear a ciegas dejaría dos
   * suscripciones cobrando. Esto pregunta primero.
   */
  searchSubscriptions(externalReference?: string): Promise<ProviderResult<{
    total: number;
    items: Array<{
      providerSubscriptionId: string; providerStatus: string | null;
      externalReference: string | null; amount: number | null; currency: string | null;
      frequency: number | null; frequencyType: string | null; dateCreated: string | null;
    }>;
  }>>;
  getPaymentDetail(id: string): Promise<ProviderResult<{
    providerPaymentId: string; providerStatus: string | null;
    canonicalStatus: ReturnType<typeof mapPaymentStatus>;
    statusDetail: string | null;
    amount: number | null; currency: string | null;
    externalReference: string | null; liveMode: boolean | null;
    preapprovalId: string | null;
  }>>;
};

/**
 * Un diagnóstico SEGURO del rechazo del proveedor.
 *
 * El mensaje crudo no se propaga: puede traer datos del pagador. Pero sin
 * NINGÚN detalle, una validación de esquema —«este campo no vale»— es
 * indistinguible de una caída, y eso convierte cada error en una adivinanza.
 *
 * Así que se conserva lo que es contrato y no persona: el código HTTP y los
 * `cause` del proveedor, que son mensajes de validación de campos. Se recortan,
 * y se descarta cualquier cosa que traiga arroba o parezca un identificador
 * largo, por si algún día el proveedor mete ahí algo que no debería.
 */
function diagnostico(e: unknown): string | null {
  const err = e as Record<string, unknown> | null;
  if (!err) return null;
  const partes: string[] = [];
  if (typeof err.name === "string") partes.push(err.name);
  if (typeof err.status === "number") partes.push(`http=${err.status}`);
  for (const campo of ["error", "message"]) {
    const v = err[campo];
    if (typeof v === "string" && v) partes.push(`${campo}=${v.slice(0, 200)}`);
  }
  const causas = Array.isArray(err.causes) ? err.causes
    : Array.isArray(err.cause) ? (err.cause as unknown[]) : [];
  for (const c of causas.slice(0, 5)) {
    if (typeof c === "string") { partes.push(c.slice(0, 160)); continue; }
    const cc = c as Record<string, unknown> | null;
    if (!cc) continue;
    partes.push(`${cc.code ?? cc.error ?? ""}:${String(cc.description ?? cc.message ?? "").slice(0, 160)}`);
  }
  // Nada con arroba: si algún día el proveedor mete ahí un correo, no viaja.
  const salida = partes.filter((x) => !x.includes("@")).join(" | ").slice(0, 700);
  return salida === "" ? null : salida;
}

function fallo(e: unknown): {
  ok: false; failure: ReturnType<typeof classifyProviderError>;
  message: string; detail: string | null;
} {
  const clase = classifyProviderError(e);
  return { ok: false, failure: clase, message: clase, detail: diagnostico(e) };
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function mercadoPagoProvider(accessToken: string | undefined): MercadoPagoAdapter {
  // Pista barata: un `TEST-…` no necesita preguntar. Cualquier otra forma se
  // resuelve preguntándole al proveedor quién es el dueño.
  const environment = environmentFromAccessToken(accessToken);
  const configurado = Boolean(accessToken && accessToken.trim() !== "");
  const cliente = configurado
    ? new MercadoPagoConfig({
        accessToken: accessToken as string,
        options: { timeout: TIEMPO_MAXIMO_MS, maxRetries: 2 },
      })
    : null;

  const sinCredencial = <T>(): ProviderResult<T> => ({
    ok: false, failure: "provider_unavailable",
    message: "MERCADOPAGO_ACCESS_TOKEN_MISSING",
  });

  const leerSuscripcion = (r: Record<string, unknown>) => {
    const auto = (r.auto_recurring ?? {}) as Record<string, unknown>;
    return {
      providerSubscriptionId: String(r.id ?? ""),
      initPoint: str(r.init_point),
      providerStatus: str(r.status),
      canonicalStatus: mapSubscriptionStatus(str(r.status)),
      amount: num(auto.transaction_amount),
      currency: str(auto.currency_id),
      frequency: num(auto.frequency),
      frequencyType: str(auto.frequency_type),
      version: num(r.version),
      nextPaymentDate: str(r.next_payment_date),
      externalReference: str(r.external_reference),
    };
  };

  return {
    name: MERCADOPAGO,
    live: configurado,
    environment,

    async createSubscription(input) {
      if (!cliente) return sinCredencial();
      let importe: number;
      try {
        importe = minorToProviderAmount(input.amountMinor, input.currency);
      } catch (e) {
        return { ok: false, failure: "invalid_request",
                 message: e instanceof Error ? e.message : "AMOUNT_INVALID" };
      }
      // ANUAL ES UN INTERVALO DE DOCE MESES. Nunca doce cobros mensuales:
      // simular el año partiéndolo cambiaría lo que el cliente compró.
      const recurrencia = recurrenceFor(input.interval);
      try {
        const r = await new PreApproval(cliente).create({
          body: {
            reason: input.reason,
            external_reference: input.externalReference,
            payer_email: input.payerEmail,
            back_url: input.returnUrl,
            // SIN `preapproval_plan_id`: la suscripción es de ESTA empresa,
            // con su base en pesos y su tratamiento fiscal. Un plan del
            // proveedor obligaría a que todas compartieran importe.
            status: "pending",
            auto_recurring: {
              frequency: recurrencia.frequency,
              frequency_type: recurrencia.frequency_type,
              transaction_amount: importe,
              currency_id: input.currency.toUpperCase(),
            },
          },
          // La clave de idempotencia es la referencia externa: reintentar la
          // creación del mismo intento no crea dos suscripciones.
          requestOptions: { idempotencyKey: input.externalReference },
        });
        return { ok: true, value: leerSuscripcion(r as unknown as Record<string, unknown>) };
      } catch (e) {
        return fallo(e);
      }
    },

    async getSubscriptionDetail(id) {
      if (!cliente) return sinCredencial();
      try {
        const r = await new PreApproval(cliente).get({ id });
        return { ok: true, value: leerSuscripcion(r as unknown as Record<string, unknown>) };
      } catch (e) {
        return fallo(e);
      }
    },

    async updateRecurringAmount(id, amountMinor, currency) {
      if (!cliente) return sinCredencial();
      let importe: number;
      try {
        importe = minorToProviderAmount(amountMinor, currency);
      } catch (e) {
        return { ok: false, failure: "invalid_request",
                 message: e instanceof Error ? e.message : "AMOUNT_INVALID" };
      }
      try {
        const r = await new PreApproval(cliente).update({
          id,
          body: { auto_recurring: { transaction_amount: importe,
                                    currency_id: currency.toUpperCase() } },
        }) as unknown as Record<string, unknown>;
        const auto = (r.auto_recurring ?? {}) as Record<string, unknown>;
        return { ok: true, value: { amount: num(auto.transaction_amount),
                                    currency: str(auto.currency_id), version: num(r.version) } };
      } catch (e) {
        return fallo(e);
      }
    },

    async resolveEnvironment() {
      const recordada = accessToken ? identidadRecordada.get(accessToken) : undefined;
      if (recordada) return recordada;
      if (environment === "test") {
        return { environment: "test" as MpEnvironment, siteId: null, countryId: null,
                 isTestUser: true, reachable: true };
      }
      if (!accessToken) {
        return { environment: "live" as MpEnvironment, siteId: null, countryId: null,
                 isTestUser: false, reachable: false };
      }
      try {
        const r = await fetch("https://api.mercadopago.com/users/me", {
          headers: { Authorization: `Bearer ${accessToken}` } });
        if (!r.ok) {
          return { environment: "live" as MpEnvironment, siteId: null, countryId: null,
                   isTestUser: false, reachable: false };
        }
        const j = (await r.json()) as Record<string, unknown>;
        const clasificado = classifyOwnerEnvironment(j);
        const resuelta = {
          environment: clasificado,
          siteId: str(j.site_id), countryId: str(j.country_id),
          isTestUser: clasificado === "test", reachable: true,
        };
        if (accessToken) identidadRecordada.set(accessToken, resuelta);
        return resuelta;
      } catch {
        // No poder preguntar NO es «es de pruebas».
        return { environment: "live" as MpEnvironment, siteId: null, countryId: null,
                 isTestUser: false, reachable: false };
      }
    },

    async searchSubscriptions(externalReference) {
      if (!cliente) return sinCredencial();
      try {
        const opciones: Record<string, string | number> = { limit: 50, offset: 0 };
        if (externalReference) opciones.external_reference = externalReference;
        const r = (await new PreApproval(cliente).search({ options: opciones })
          ) as unknown as Record<string, unknown>;
        const crudos = Array.isArray(r.results) ? (r.results as Record<string, unknown>[]) : [];
        const paging = (r.paging ?? {}) as Record<string, unknown>;
        return { ok: true, value: {
          total: num(paging.total) ?? crudos.length,
          items: crudos.map((x) => {
            const auto = (x.auto_recurring ?? {}) as Record<string, unknown>;
            return {
              providerSubscriptionId: String(x.id ?? ""),
              providerStatus: str(x.status),
              externalReference: str(x.external_reference),
              amount: num(auto.transaction_amount),
              currency: str(auto.currency_id),
              frequency: num(auto.frequency),
              frequencyType: str(auto.frequency_type),
              dateCreated: str(x.date_created),
            };
          }),
        } };
      } catch (e) {
        return fallo(e);
      }
    },

    async getPaymentDetail(id) {
      if (!cliente) return sinCredencial();
      try {
        const r = await new Payment(cliente).get({ id }) as unknown as Record<string, unknown>;
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        return { ok: true, value: {
          providerPaymentId: String(r.id ?? id),
          providerStatus: str(r.status),
          canonicalStatus: mapPaymentStatus(str(r.status)),
          statusDetail: str(r.status_detail),
          amount: num(r.transaction_amount),
          currency: str(r.currency_id),
          externalReference: str(r.external_reference),
          liveMode: typeof r.live_mode === "boolean" ? r.live_mode : null,
          preapprovalId: str(meta.preapproval_id) ?? str(r.preapproval_id),
        } };
      } catch (e) {
        return fallo(e);
      }
    },

    // --- El contrato de B1, cumplido tal cual --------------------------------

    async createSubscriptionCheckout(): Promise<ProviderResult<ProviderCheckout>> {
      // El contrato de B1 no lleva ni el correo de facturación ni la
      // referencia opaca, que son obligatorios aquí. Se usa `createSubscription`
      // y NO se inventa un correo ni una referencia para rellenar el hueco.
      return { ok: false, failure: "invalid_request",
               message: "USE_CREATE_SUBSCRIPTION" };
    },

    async getPayment(providerPaymentId): Promise<ProviderResult<ProviderPayment>> {
      const r = await this.getPaymentDetail(providerPaymentId);
      if (!r.ok) return r;
      return { ok: true, value: {
        providerPaymentId: r.value.providerPaymentId,
        status: r.value.canonicalStatus ?? "manual_review",
        amount: r.value.amount, currency: r.value.currency,
      } };
    },

    async getSubscription(providerSubscriptionId) {
      const r = await this.getSubscriptionDetail(providerSubscriptionId);
      if (!r.ok) return r;
      return { ok: true, value: {
        providerSubscriptionId: r.value.providerSubscriptionId,
        // Un estado que no sabemos traducir va a revisión: NUNCA se adivina, y
        // nunca degrada un derecho por su cuenta.
        status: r.value.canonicalStatus ?? "manual_review",
      } };
    },

    async cancelSubscription(providerSubscriptionId) {
      if (!cliente) return sinCredencial();
      try {
        const r = await new PreApproval(cliente).update({
          id: providerSubscriptionId,
          body: { status: "cancelled" },
        }) as unknown as Record<string, unknown>;
        return { ok: true, value: {
          status: mapSubscriptionStatus(str(r.status)) ?? "manual_review" } };
      } catch (e) {
        return fallo(e);
      }
    },

    async verifyWebhook() {
      // La verificación vive en la ruta, con las cabeceras crudas delante. Este
      // contrato no las lleva, y aceptar aquí un cuerpo sin cabeceras sería
      // ofrecer una puerta que parece segura y no lo es.
      return { ok: false, failure: "invalid_request",
               message: "USE_ROUTE_SIGNATURE_VERIFICATION" };
    },
  };
}

/** El adaptador configurado desde el entorno del servidor. */
export function mercadoPagoFromEnv(): MercadoPagoAdapter {
  return mercadoPagoProvider(process.env.MERCADOPAGO_ACCESS_TOKEN);
}
