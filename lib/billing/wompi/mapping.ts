/**
 * Trazaloop · PE-05B2W · La traducción de Wompi, sin red y sin secretos.
 *
 * Igual que con la otra pasarela: todo lo que se puede decidir con la cabeza
 * fría vive aquí, aparte del adaptador, para poder comprobarlo entero sin
 * credenciales y sin que el sandbox de un tercero esté de pie.
 *
 * Ninguna función de este fichero decide activar un plan.
 */
import type {
  BillingPaymentState, BillingSubscriptionState, BillingFailure,
} from "@/lib/billing/provider";

export const WOMPI = "wompi" as const;

export const WOMPI_SANDBOX_URL = "https://sandbox.wompi.co/v1";
export const WOMPI_PRODUCTION_URL = "https://production.wompi.co/v1";

// ---------------------------------------------------------------------------
// Entorno · aquí SÍ lo dice la llave
// ---------------------------------------------------------------------------
/**
 * Lo que Mercado Pago no permitía, Wompi sí: sus llaves llevan el entorno en
 * el prefijo y cada entorno tiene su propia URL. Aun así la regla se mantiene
 * igual de estricta —evidencia positiva o nada—, porque la lección no era
 * «usa el prefijo cuando puedas»: era que un guardia que adivina no es un
 * guardia.
 *
 * Y se exige que las CUATRO llaves coincidan. Una sola de producción entre
 * llaves de prueba significaría que alguien mezcló entornos, y eso es
 * exactamente cuando se cobra de verdad sin querer.
 */
export type WompiEnvironment = "sandbox" | "production";

export type WompiKeySet = {
  publicKey?: string; privateKey?: string;
  eventsSecret?: string; integritySecret?: string;
};

export type WompiClassification = {
  environment: WompiEnvironment | null;
  /** Qué falta o qué no cuadra. Nunca un valor. */
  problems: string[];
  baseUrl: string | null;
};

const PREFIJOS: Record<keyof WompiKeySet, { sandbox: string; production: string }> = {
  publicKey: { sandbox: "pub_test_", production: "pub_prod_" },
  privateKey: { sandbox: "prv_test_", production: "prv_prod_" },
  eventsSecret: { sandbox: "test_events_", production: "prod_events_" },
  integritySecret: { sandbox: "test_integrity_", production: "prod_integrity_" },
};

export function classifyWompiKeys(llaves: WompiKeySet): WompiClassification {
  const problems: string[] = [];
  const vistos = new Set<WompiEnvironment>();

  for (const nombre of Object.keys(PREFIJOS) as (keyof WompiKeySet)[]) {
    const valor = llaves[nombre];
    if (!valor || valor.trim() === "") { problems.push(`${nombre}:missing`); continue; }
    const p = PREFIJOS[nombre];
    if (valor.startsWith(p.sandbox)) vistos.add("sandbox");
    else if (valor.startsWith(p.production)) vistos.add("production");
    else problems.push(`${nombre}:unknown_prefix`);
  }

  if (problems.length > 0) return { environment: null, problems, baseUrl: null };
  if (vistos.size !== 1) {
    // Mezclar entornos es peor que no tener llaves: parece configurado.
    return { environment: null, problems: ["mixed_environments"], baseUrl: null };
  }
  const entorno = [...vistos][0];
  return {
    environment: entorno, problems: [],
    baseUrl: entorno === "sandbox" ? WOMPI_SANDBOX_URL : WOMPI_PRODUCTION_URL,
  };
}

// ---------------------------------------------------------------------------
// Dinero · Wompi cuenta CENTAVOS, y el peso no tiene decimales
// ---------------------------------------------------------------------------
/**
 * LA TRAMPA DE ESTE PROVEEDOR.
 *
 * La unidad mínima del peso colombiano es el peso: B1 guarda 190400 y eso son
 * ciento noventa mil cuatrocientos pesos. Wompi pide `amount_in_cents`, y en
 * su documentación `10000` son cien pesos. O sea que su unidad es la centésima
 * de peso, que no circula.
 *
 * Mandar 190400 en vez de 19040000 cobraría CIEN VECES MENOS. Por eso la
 * conversión está aquí, aislada, con su prueba y su vuelta.
 */
export function copToWompiCents(copMinor: number): number {
  if (!Number.isInteger(copMinor)) throw new Error(`AMOUNT_NOT_INTEGER:${copMinor}`);
  if (copMinor <= 0) throw new Error(`AMOUNT_NOT_POSITIVE:${copMinor}`);
  return copMinor * 100;
}

export function wompiCentsToCop(cents: number | null | undefined): number | null {
  if (cents === null || cents === undefined || !Number.isInteger(cents)) return null;
  if (cents % 100 !== 0) return null;   // no representa un número entero de pesos
  return cents / 100;
}

/** Exacta. Los dos lados son enteros de punta a punta. */
export function amountsReconcile(
  expectedCopMinor: number, expectedCurrency: string,
  cents: number | null | undefined, currency: string | null | undefined
): boolean {
  if ((currency ?? "").toUpperCase() !== expectedCurrency.toUpperCase()) return false;
  const cop = wompiCentsToCop(cents);
  return cop !== null && cop === expectedCopMinor;
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------
const TRANSACCION: Record<string, BillingPaymentState> = {
  PENDING: "pending",
  APPROVED: "approved",
  DECLINED: "declined",
  VOIDED: "failed",
  ERROR: "failed",
};

/** `null` = no se sabe traducir. Quien llame manda a revisión. */
export function mapTransactionStatus(estado: string | null | undefined):
  BillingPaymentState | null {
  if (!estado) return null;
  return TRANSACCION[estado.trim().toUpperCase()] ?? null;
}

export function settlementOutcome(estado: BillingPaymentState | null):
  "approved" | "declined" | "failed" | null {
  if (estado === "approved") return "approved";
  if (estado === "declined") return "declined";
  if (estado === "failed") return "failed";
  return null;
}

/**
 * La fuente de pago guardada. `AVAILABLE` es la única que sirve para cobrar;
 * cualquier otra cosa NO se interpreta como disponible.
 */
export function paymentSourceIsUsable(estado: string | null | undefined): boolean {
  return (estado ?? "").trim().toUpperCase() === "AVAILABLE";
}

/**
 * Wompi no tiene objeto de suscripción: la recurrencia la lleva el comercio.
 * Se declara para que quede escrito, no para inventar un estado.
 */
export function subscriptionStateFromMerchantSchedule(
  vivo: boolean
): BillingSubscriptionState {
  return vivo ? "active" : "ended";
}

export function classifyProviderError(err: unknown): BillingFailure {
  const e = err as { name?: string; status?: number } | null;
  const nombre = e?.name ?? "";
  const codigo = e?.status ?? 0;
  if (nombre === "AbortError" || nombre === "TimeoutError") return "provider_unavailable";
  if (codigo === 429 || codigo >= 500) return "provider_unavailable";
  // 401/403 es configuración NUESTRA, no un rechazo del cliente: no puede
  // acabar bajándole el plan a nadie.
  if (codigo === 401 || codigo === 403) return "provider_unavailable";
  if (codigo === 422 || codigo === 400) return "invalid_request";
  return "invalid_request";
}

// ---------------------------------------------------------------------------
// Firma de integridad · la de las transacciones
// ---------------------------------------------------------------------------
/**
 * `SHA256(referencia + importe_en_centavos + moneda + secreto_de_integridad)`,
 * en hexadecimal, tal y como documenta Wompi. Se calcula SIEMPRE en servidor:
 * el secreto no puede pasar por el navegador.
 *
 * La función recibe el secreto como parámetro y no lo lee del entorno, para
 * que se pueda comprobar con un valor de prueba sin tocar configuración.
 */
export function integritySignaturePayload(
  reference: string, amountInCents: number, currency: string,
  integritySecret: string, expirationTime?: string | null
): string {
  return expirationTime
    ? `${reference}${amountInCents}${currency}${expirationTime}${integritySecret}`
    : `${reference}${amountInCents}${currency}${integritySecret}`;
}

// ---------------------------------------------------------------------------
// Eventos · la firma del webhook
// ---------------------------------------------------------------------------
export type WompiEvent = {
  event: string;
  data: Record<string, unknown>;
  environment?: string;
  timestamp?: number;
  sent_at?: string;
  signature?: { properties?: string[]; checksum?: string };
};

/** Lee una ruta con puntos —«transaction.id»— dentro del cuerpo del evento. */
export function readPath(objeto: unknown, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((acc, parte) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[parte];
    return undefined;
  }, objeto);
}

/**
 * El manifiesto del evento: los valores de las propiedades que el propio
 * evento enumera, en su orden, más el sello de tiempo y el secreto.
 *
 * Que el evento diga QUÉ campos firma es lo que hace esto resistente: si
 * alguien altera el importe, el importe está entre lo firmado.
 */
export function eventChecksumPayload(evento: WompiEvent, eventsSecret: string): string | null {
  const props = evento.signature?.properties;
  if (!Array.isArray(props) || props.length === 0) return null;
  if (evento.timestamp === undefined || evento.timestamp === null) return null;
  const partes: string[] = [];
  for (const p of props) {
    const v = readPath(evento.data, p);
    if (v === undefined || v === null) return null;   // falta un campo firmado
    partes.push(String(v));
  }
  return `${partes.join("")}${evento.timestamp}${eventsSecret}`;
}

export const WOMPI_EVENT_TRANSACTION_UPDATED = "transaction.updated";

/**
 * LA REFERENCIA DE COBRO · y por qué no es solo el intento.
 *
 * Wompi exige que `reference` sea única POR TRANSACCIÓN, y con este proveedor
 * un mismo intento puede cobrarse más de una vez —es el modelo: el calendario
 * lo lleva el comercio—. Así que la referencia es
 *
 *     <uuid del intento>-<número de intento de cobro>
 *
 * Del lado de Trazaloop la autoridad sigue siendo el INTENTO, que es lo que
 * `billing_settle_provider_payment` espera. Esta función devuelve esa parte.
 *
 * Se hace aquí, en la frontera del proveedor, porque el formato es NUESTRO: no
 * hay que enseñarle a la base un formato de referencia de una pasarela.
 */
export function intentIdFromReference(referencia: string | null | undefined): string | null {
  if (!referencia) return null;
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:-.+)?$/i
    .exec(referencia.trim());
  return m ? m[1].toLowerCase() : null;
}

/**
 * QUÉ ENTORNO ES · y hacen falta LAS DOS COSAS.
 *
 * El contrato de eventos de Wompi es explícito: todo evento lleva
 * `environment`, y sus dos únicos valores son `"test"` en Sandbox y `"prod"`
 * en Producción.
 *
 * Así que se exigen dos evidencias independientes y NINGUNA sustituye a la
 * otra:
 *
 *   · la FIRMA, que demuestra que el mensaje viene de quien tiene el secreto
 *     de ESE entorno —Wompi obliga a una URL y un secreto por entorno—;
 *   · el CAMPO, que declara el entorno y tiene que coincidir con las llaves.
 *
 * Falta el campo, o trae cualquier otra cosa —`sandbox`, `production`, vacío,
 * nulo—: se rechaza. No se admiten alias: el contrato dice dos valores y son
 * esos dos. Falla cerrado.
 */
export function eventEnvironmentMatches(
  declarado: string | null | undefined, llaves: WompiEnvironment
): boolean {
  if (typeof declarado !== "string") return false;
  // Sin normalizar de más: el contrato es literal.
  if (declarado === "test") return llaves === "sandbox";
  if (declarado === "prod") return llaves === "production";
  return false;
}


/** Del cuerpo del evento solo se guarda el sobre. Nunca tarjeta ni pagador. */
export function sanitizeEventEnvelope(evento: WompiEvent): Record<string, unknown> {
  const tx = (evento.data?.transaction ?? {}) as Record<string, unknown>;
  const sobre: Record<string, unknown> = {
    event: evento.event ?? null,
    environment: evento.environment ?? null,
    timestamp: evento.timestamp ?? null,
    sent_at: evento.sent_at ?? null,
    transaction_id: tx.id ?? null,
    transaction_status: tx.status ?? null,
    reference: tx.reference ?? null,
    amount_in_cents: tx.amount_in_cents ?? null,
    currency: tx.currency ?? null,
  };
  for (const k of Object.keys(sobre)) if (sobre[k] === null) delete sobre[k];
  return sobre;
}

const PROHIBIDOS = ["number", "cvc", "card_holder", "exp_month", "exp_year",
                    "customer_email", "customer_data", "phone", "legal_id"];

export function envelopeIsClean(sobre: Record<string, unknown>): boolean {
  const texto = JSON.stringify(sobre).toLowerCase();
  return !PROHIBIDOS.some((c) => texto.includes(`"${c}"`));
}
