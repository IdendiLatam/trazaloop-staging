import "server-only";
import { createHash } from "node:crypto";
import {
  MercadoPagoConfig, PreApproval, Payment, Preference, PaymentRefund,
} from "mercadopago";
import type {
  BillingProvider, ProviderCheckout, ProviderPayment, ProviderResult,
  BillingSubscriptionState,
} from "@/lib/billing/provider";
import {
  MERCADOPAGO, recurrenceFor, mapPaymentStatus, mapSubscriptionStatus,
  classifyProviderError, minorToProviderAmount,
  classifyOwnerEnvironment, type MpEnvironment,
} from "@/lib/billing/mercadopago/mapping";
import {
  resolveMercadoPagoIdentity, ownerMatches, type MpIdentityResolution,
} from "@/lib/billing/mercadopago/identity";

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
  siteId: string | null; countryId: string | null;
  ownerId: number | null; isTestUser: boolean; reachable: boolean;
}>();

export type MercadoPagoAdapter = BillingProvider & {
  /**
   * MP-ENV-01 · El entorno DECLARADO, o `null` si la configuración no es
   * válida. Ya no se deduce del prefijo del token ni de las etiquetas del
   * titular: se declara, y sin declaración no se opera.
   */
  readonly environment: MpEnvironment | null;
  /** La identidad esperada, o el motivo por el que la configuración no vale. */
  readonly identity: MpIdentityResolution;
  /**
   * Quién es el titular del token, según el proveedor.
   *
   * `environment` sale de la CONFIGURACIÓN, no de aquí. Lo que esta llamada
   * aporta es la identidad observada —`ownerId`, `siteId`— para contrastarla
   * con la esperada, y `isTestUser` como DIAGNÓSTICO: una credencial de prueba
   * de aplicación pertenece a una cuenta productiva y no lleva esa etiqueta.
   */
  resolveEnvironment(): Promise<{
    environment: MpEnvironment | null; siteId: string | null; countryId: string | null;
    ownerId: number | null; isTestUser: boolean; reachable: boolean;
    ownerMatchesExpected: boolean;
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
    applicationId: number | null; collectorId: number | null;
  }>>;
  getSubscriptionDetail(id: string): Promise<ProviderResult<{
    providerSubscriptionId: string; providerStatus: string | null;
    canonicalStatus: BillingSubscriptionState | null;
    amount: number | null; currency: string | null;
    frequency: number | null; frequencyType: string | null;
    version: number | null; nextPaymentDate: string | null;
    externalReference: string | null;
    applicationId: number | null; collectorId: number | null;
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
   * BILLING-EXTRA-01B · Devolver un pago ENTERO.
   *
   * Existe por una sola razón: cuando la diferencia de una subida se cobra y
   * después no se puede dejar la autorización cobrando el importe nuevo, la
   * empresa ha pagado algo que no va a recibir. Devolverlo no es cortesía, es
   * lo único honesto.
   *
   * La llave de idempotencia NO es opcional y NO se genera aquí: viene derivada
   * del cambio, para que reintentar pida EL MISMO reembolso y no un segundo.
   */
  refundPayment(providerPaymentId: string, idempotencyKey: string):
    Promise<ProviderResult<{ refundId: string; amount: number | null;
                             currency: string | null; status: string | null }>>;
  /**
   * Los reembolsos que el proveedor YA tiene sobre un pago.
   *
   * Preguntar antes de pedir es más barato que deshacer después: si una
   * petición salió y su respuesta se perdió, el reembolso puede existir allí
   * sin constar aquí.
   */
  listRefunds(providerPaymentId: string): Promise<ProviderResult<{
    refunds: Array<{ refundId: string; amount: number | null;
                     currency: string | null; status: string | null }>;
  }>>;
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
  /**
   * UN SOLO PAGO, no una suscripción.
   *
   * Es el carril del lanzamiento: Full mensual o anual como pago único
   * renovable, mientras la recurrencia del proveedor sigue bloqueada. Devuelve
   * la preferencia y su punto de entrada; NO activa nada. Lo que active el
   * plan será la lectura posterior del pago, nunca la vuelta del navegador.
   */
  createOneTimeCheckout(input: {
    externalReference: string;
    title: string;
    /**
     * BILLING-EXTRA-01C.3 · Qué se está comprando, en palabras.
     *
     * La medición de calidad de Mercado Pago lo pide, y tiene razón: el título
     * cabe en una línea y la descripción es lo que alguien lee cuando no
     * recuerda qué fue ese cargo. Se DERIVA de metadata real —plan, periodicidad
     * o el cambio concreto—; nunca lleva precios, ni identificadores nuestros,
     * ni nada sensible.
     */
    description?: string | null;
    amountMinor: number;
    currency: string;
    payerEmail?: string | null;
    successUrl: string;
    failureUrl: string;
    pendingUrl: string;
    notificationUrl?: string | null;
    expiresAt?: string | null;
  }): Promise<ProviderResult<{
    preferenceId: string; initPoint: string | null;
    externalReference: string | null;
  }>>;
  /**
   * Los pagos de UNA referencia externa.
   *
   * Sirve para el botón «ya pagué»: quien cierra la ventana antes de volver no
   * deja ningún identificador de pago, así que hay que preguntar por lo único
   * que sí controlamos —la referencia que mandamos—. Sin referencia NO se
   * pregunta: el filtro vacío devuelve 400 y ese 400 se lee como «no hay
   * pagos», que es la respuesta más cara posible.
   */
  searchPaymentsByReference(externalReference: string): Promise<ProviderResult<{
    total: number;
    payments: Array<{
      providerPaymentId: string; providerStatus: string | null;
      canonicalStatus: ReturnType<typeof mapPaymentStatus>;
      statusDetail: string | null;
      amount: number | null; currency: string | null;
      externalReference: string | null; liveMode: boolean | null;
      dateApproved: string | null;
      /** Quién cobró. Es la identidad del pago, distinta de la del token. */
      collectorId: number | null;
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
  /**
   * LA FACTURA DE UN CICLO de una suscripción recurrente.
   *
   * Es un recurso DISTINTO del pago, y esa distinción es la que hace falta para
   * reconciliar: el pago es el intento de cobro, la factura es la obligación
   * que el proveedor generó para ese mes. Un mes puede tener un cobro fallido y
   * luego uno bueno; sin la identidad de la factura, el segundo abriría un mes
   * que no existe.
   *
   * El aviso `subscription_authorized_payment` trae en su `resourceId` el
   * identificador de ESTE recurso, no el de un pago — llevarlo a
   * `getPaymentDetail` es preguntar por un pago con la clave de otra cosa.
   *
   * `debitDate` es la FECHA ECONÓMICA del ciclo: la que ordena la historia.
   * No la hora del webhook, que solo dice cuándo se enteró Trazaloop.
   */
  getAuthorizedPaymentDetail(id: string): Promise<ProviderResult<{
    providerInvoiceId: string;
    preapprovalId: string | null;
    providerStatus: string | null;
    debitDate: string | null;
    amount: number | null; currency: string | null;
    providerPaymentId: string | null;
    paymentStatus: string | null;
    canonicalStatus: ReturnType<typeof mapPaymentStatus>;
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


/**
 * BILLING-EXTRA-01C.1 · La llave de idempotencia, con la forma que el proveedor
 * admite.
 *
 * Mercado Pago pide un UUID en `X-Idempotency-Key`. La llave del dominio no lo
 * es —lleva el cambio y el cobro dentro, a propósito, para que se pueda leer—,
 * así que se deriva una por resumen: mismos hechos, mismo UUID, y reintentar
 * sigue pidiendo el mismo reembolso en vez de uno nuevo.
 *
 * Generar uno al azar habría sido más corto y habría roto justo la garantía
 * por la que existe esta llave.
 */
/**
 * BILLING-EXTRA-01C.3 · La URL de avisos, si alguien la declaró.
 *
 * Devuelve el fragmento listo para mezclar, o `null`. No se inventa desde el
 * host de la petición: en Preview eso mandaría a Mercado Pago la dirección de un
 * despliegue efímero, y como la preferencia prevalece sobre el panel, los avisos
 * productivos dejarían de llegar donde tienen que llegar.
 */
function notificacionConfigurada(): { notification_url: string } | null {
  const u = process.env.MERCADOPAGO_NOTIFICATION_URL;
  if (typeof u !== "string" || u.trim() === "") return null;
  // HTTPS o nada. Un aviso por http es un aviso que cualquiera puede leer.
  if (!u.startsWith("https://")) return null;
  return { notification_url: u.trim() };
}


function uuidDesde(semilla: string): string {
  const h = createHash("sha256").update(semilla).digest("hex");
  // Versión 4 y variante RFC 4122, para que tenga la forma que se espera.
  const v = `4${h.slice(13, 16)}`;
  const var_ = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)
    + h.slice(17, 20);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${v}-${var_}-${h.slice(20, 32)}`;
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

export function mercadoPagoProvider(
  accessToken: string | undefined,
  identity: MpIdentityResolution = { ok: false, reason: "MP_ENVIRONMENT_NOT_CONFIGURED" }
): MercadoPagoAdapter {
  // MP-ENV-01 · El entorno sale de la configuración declarada. No del prefijo
  // del token —`APP_USR-…` aparece en las dos clases de credencial— ni de las
  // etiquetas del titular, que describen a una persona y no a un entorno.
  const environment = identity.ok ? identity.value.environment : null;
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
      // Identificadores de la aplicación y del vendedor: no son datos de
      // ninguna persona y sirven para comprobar que el objeto se creó bajo el
      // vendedor que esperábamos.
      applicationId: num(r.application_id),
      collectorId: num(r.collector_id),
    };
  };

  return {
    name: MERCADOPAGO,
    live: configurado,
    // Mercado Pago guarda la suscripción y cobra por su cuenta.
    capabilities: {
      recurrenceOwner: "provider",
      supportsStoredPaymentSource: false,
      supportsRecurringCharge: false,
      supportsProviderSubscription: true,
    },
    environment,
    identity,

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

    async refundPayment(providerPaymentId, idempotencyKey) {
      if (!cliente) return sinCredencial();
      if (!providerPaymentId || !idempotencyKey) {
        return { ok: false, failure: "invalid_request",
                 message: "REFUND_IDENTITY_REQUIRED" };
      }
      // LA LLAVE VIAJA COMO UUID, PORQUE ES LO QUE EL PROVEEDOR ADMITE.
      //
      // La documentación pide un UUID en `X-Idempotency-Key`, y la primera
      // ejecución real contra Sandbox devolvió `invalid_request` con la llave
      // del dominio —`upgrefund:<cambio>:<pago>`— tal cual.
      //
      // No se genera una al azar: se DERIVA de la del dominio por resumen, así
      // que sigue siendo la misma para los mismos hechos y reintentar sigue
      // pidiendo EL MISMO reembolso. Lo único que cambia es la forma con la que
      // cruza la frontera.
      const uuidIdempotente = uuidDesde(idempotencyKey);
      try {
        // TOTAL, nunca parcial. La compensación de una subida devuelve el cobro
        // entero: un parcial dejaría a alguien pagando una parte de algo que no
        // recibió, y nadie sabría cuál.
        const r = await new PaymentRefund(cliente).total({
          payment_id: providerPaymentId,
          requestOptions: { idempotencyKey: uuidIdempotente },
        }) as unknown as Record<string, unknown>;
        const id = str(r.id) ?? (num(r.id) !== null ? String(num(r.id)) : null);
        if (!id) {
          // Sin identificador no se puede afirmar que se devolvió. Se marca
          // con la clase que NO se reintenta sola: la petición salió y el
          // reembolso puede existir allí. Quien llame vuelve a PREGUNTAR.
          return { ok: false, failure: "provider_unavailable",
                   failureClass: "provider_unknown",
                   message: "REFUND_WITHOUT_ID" };
        }
        return { ok: true, value: {
          refundId: id, amount: num(r.amount),
          currency: str(r.currency_id), status: str(r.status) } };
      } catch (e) {
        return fallo(e);
      }
    },

    async listRefunds(providerPaymentId) {
      if (!cliente) return sinCredencial();
      if (!providerPaymentId) {
        return { ok: false, failure: "invalid_request", message: "PAYMENT_ID_REQUIRED" };
      }
      try {
        const r = await new PaymentRefund(cliente).list({
          payment_id: providerPaymentId,
        }) as unknown as Record<string, unknown>[];
        return { ok: true, value: { refunds: (r ?? []).map((x) => ({
          refundId: str(x.id) ?? (num(x.id) !== null ? String(num(x.id)) : ""),
          amount: num(x.amount), currency: str(x.currency_id),
          status: str(x.status),
        })).filter((x) => x.refundId !== "") } };
      } catch (e) {
        return fallo(e);
      }
    },

    async resolveEnvironment() {
      const esperado = identity.ok ? identity.value.expectedOwnerId : null;
      const vacio = {
        environment, siteId: null, countryId: null, ownerId: null,
        isTestUser: false, reachable: false, ownerMatchesExpected: false,
      };
      const recordada = accessToken ? identidadRecordada.get(accessToken) : undefined;
      if (recordada) {
        return { environment, ...recordada,
          ownerMatchesExpected: esperado !== null && ownerMatches(recordada.ownerId, esperado) };
      }
      if (!accessToken) return vacio;
      try {
        const r = await fetch("https://api.mercadopago.com/users/me", {
          headers: { Authorization: `Bearer ${accessToken}` } });
        if (!r.ok) return vacio;
        const j = (await r.json()) as Record<string, unknown>;
        const observada = {
          siteId: str(j.site_id), countryId: str(j.country_id),
          ownerId: num(j.id),
          // DIAGNÓSTICO, no autoridad: una credencial de prueba de aplicación
          // pertenece a una cuenta productiva y no trae esta etiqueta.
          isTestUser: classifyOwnerEnvironment(j) === "test",
          reachable: true,
        };
        identidadRecordada.set(accessToken, observada);
        return { environment, ...observada,
          ownerMatchesExpected: esperado !== null && ownerMatches(observada.ownerId, esperado) };
      } catch {
        // No poder preguntar NO es «es de pruebas», y tampoco «es el titular».
        return vacio;
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

    async createOneTimeCheckout(input) {
      if (!cliente) return sinCredencial();
      let importe: number;
      try {
        importe = minorToProviderAmount(input.amountMinor, input.currency);
      } catch (e) {
        return { ok: false, failure: "invalid_request",
                 message: e instanceof Error ? e.message : "AMOUNT_INVALID" };
      }
      if (!input.externalReference) {
        return { ok: false, failure: "invalid_request", message: "EXTERNAL_REFERENCE_REQUIRED" };
      }
      try {
        const r = await new Preference(cliente).create({
          body: {
            items: [{
              id: input.externalReference,
              title: input.title,
              ...(input.description ? { description: input.description } : {}),
              quantity: 1,
              unit_price: importe,
              currency_id: input.currency.toUpperCase(),
            }],
            external_reference: input.externalReference,
            back_urls: {
              success: input.successUrl,
              failure: input.failureUrl,
              pending: input.pendingUrl,
            },
            // SIN `auto_return`. La vuelta automática ahorra un clic y a cambio
            // hace creer que la vuelta es la confirmación. Aquí la vuelta solo
            // lleva a una pantalla que PREGUNTA al proveedor.
            //
            // `binary_mode` evita el limbo de «pendiente»: un plan medio
            // activado no existe, y explicárselo a alguien que ya pagó es peor
            // que pedirle que use otro medio.
            binary_mode: true,
            // BILLING-EXTRA-01C.3 · El aviso, SOLO desde configuración.
            //
            // Mercado Pago documenta que una `notification_url` puesta en la
            // preferencia PREVALECE sobre la del panel. Derivarla del host que
            // atiende la petición mandaría la URL de un Preview en un cobro
            // productivo y silenciaría los avisos de verdad. Así que sale de una
            // variable declarada, y si no la hay no se manda nada: manda el
            // panel, que es lo que gobierna hoy en Producción.
            //
            // Nada de esto es requisito para que las cuentas cuadren: la
            // conciliación pregunta al proveedor y no espera que la avisen.
            ...(notificacionConfigurada() ?? {}),
            ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
            ...(input.expiresAt
              ? { expires: true, expiration_date_to: input.expiresAt }
              : {}),
          },
          requestOptions: { idempotencyKey: input.externalReference },
        }) as unknown as Record<string, unknown>;
        const id = str(r.id);
        if (!id) {
          return { ok: false, failure: "provider_unavailable",
                   message: "PREFERENCE_WITHOUT_ID" };
        }
        return { ok: true, value: {
          preferenceId: id,
          initPoint: str(r.init_point) ?? str(r.sandbox_init_point),
          externalReference: str(r.external_reference),
        } };
      } catch (e) {
        return fallo(e);
      }
    },
    async searchPaymentsByReference(externalReference) {
      if (!cliente) return sinCredencial();
      if (!externalReference) {
        return { ok: false, failure: "invalid_request", message: "EXTERNAL_REFERENCE_REQUIRED" };
      }
      try {
        const r = await new Payment(cliente).search({
          options: { external_reference: externalReference, sort: "date_created", criteria: "desc" },
        }) as unknown as Record<string, unknown>;
        const filas = Array.isArray(r.results) ? (r.results as Record<string, unknown>[]) : [];
        return { ok: true, value: {
          total: filas.length,
          payments: filas.map((p) => ({
            providerPaymentId: String(p.id ?? ""),
            providerStatus: str(p.status),
            canonicalStatus: mapPaymentStatus(str(p.status)),
            statusDetail: str(p.status_detail),
            amount: num(p.transaction_amount),
            currency: str(p.currency_id),
            externalReference: str(p.external_reference),
            liveMode: typeof p.live_mode === "boolean" ? p.live_mode : null,
            dateApproved: str(p.date_approved),
            collectorId: num(p.collector_id),
          })),
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

    async getAuthorizedPaymentDetail(id) {
      if (!cliente) return sinCredencial();
      try {
        // El SDK no expone una clase para este recurso, así que se pide en
        // crudo. Misma credencial, mismo tiempo máximo, y NADA del token en el
        // registro ni en el resultado.
        const r0 = await fetch(
          `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(id)}`,
          { headers: { Authorization: `Bearer ${accessToken as string}` },
            signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) });
        const r = (await r0.json()) as Record<string, unknown>;
        if (!r0.ok) {
          return fallo({ name: "MercadoPagoError", status: r0.status,
                         message: str(r.message) ?? "authorized_payment_unavailable" });
        }
        const pago = (r.payment ?? {}) as Record<string, unknown>;
        const estadoPago = str(pago.status) ?? str(r.status);
        return { ok: true, value: {
          providerInvoiceId: String(r.id ?? id),
          preapprovalId: str(r.preapproval_id),
          providerStatus: str(r.status),
          debitDate: str(r.debit_date),
          amount: num(r.transaction_amount),
          currency: str(r.currency_id),
          providerPaymentId: pago.id === undefined || pago.id === null
            ? null : String(pago.id),
          paymentStatus: estadoPago,
          canonicalStatus: mapPaymentStatus(estadoPago),
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
        // EL `reason` NO SE INVENTA: SE RELEE.
        //
        // Esto mandaba `{ status: "cancelled" }` a secas, y MP-SBX-01C dejó
        // anotado que esa forma volvía con `400 · Invalid value for
        // preapproval_plan_id` —un campo que no se envía— porque sin `reason`
        // el validador toma la rama de las suscripciones CON plan asociado.
        //
        // Se lee el de la suscripción y se devuelve tal cual: mandar otro la
        // renombraría por el camino. Si no se puede leer, se cancela igual con
        // la forma mínima: no poder leer el nombre no puede impedir parar un
        // cobro.
        let motivo: string | null = null;
        try {
          const previa = (await new PreApproval(cliente).get(
            { id: providerSubscriptionId })) as unknown as Record<string, unknown>;
          motivo = str(previa.reason);
        } catch { motivo = null; }

        const r = await new PreApproval(cliente).update({
          id: providerSubscriptionId,
          body: motivo === null
            ? { status: "cancelled" }
            : { reason: motivo, status: "cancelled" },
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
  return mercadoPagoProvider(process.env.MERCADOPAGO_ACCESS_TOKEN,
    resolveMercadoPagoIdentity({
      MERCADOPAGO_ENVIRONMENT: process.env.MERCADOPAGO_ENVIRONMENT,
      MERCADOPAGO_EXPECTED_APPLICATION_ID: process.env.MERCADOPAGO_EXPECTED_APPLICATION_ID,
      MERCADOPAGO_EXPECTED_OWNER_ID: process.env.MERCADOPAGO_EXPECTED_OWNER_ID,
    }));
}
