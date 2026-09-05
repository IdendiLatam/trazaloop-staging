import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  WOMPI, WOMPI_EVENT_TRANSACTION_UPDATED, eventChecksumPayload,
  sanitizeEventEnvelope, mapTransactionStatus, settlementOutcome,
  classifyWompiKeys, eventEnvironmentMatches, parseAttemptReference,
  type WompiEvent,
} from "@/lib/billing/wompi/mapping";
import { wompiFromEnv } from "@/lib/billing/providers/wompi";
import {
  recordProviderEvent, closeProviderEvent, settleProviderPayment,
  classifyAttempt, settlePeriodPayment, closeAttempt,
} from "@/lib/db/billing-provider";
import { settleUpgradePayment } from "@/lib/db/billing-upgrade";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trazaloop · PE-05B2W · La puerta de Wompi.
 *
 * Misma arquitectura que la del otro proveedor, y a propósito: verificar,
 * anotar, releer el recurso, conciliar, y solo entonces liquidar. Lo que
 * cambia es la receta de la firma; lo que no cambia es que **nada activa un
 * plan salvo un pago aprobado comprobado en el servidor**.
 *
 * LA FIRMA DE WOMPI
 *
 * El evento enumera QUÉ campos firma en `signature.properties`. Se toman sus
 * valores en ese orden, se añade el sello de tiempo y el secreto de eventos, y
 * se compara el SHA-256 contra `signature.checksum` —también disponible en la
 * cabecera `X-Event-Checksum`—.
 *
 * Que el propio evento diga qué firma es lo que lo hace resistente: el importe
 * y el estado están entre lo firmado, así que alterarlos rompe la firma.
 *
 * TODAVÍA NO ESTÁ REGISTRADA EN WOMPI. Esta ruta existe y se comprueba con
 * eventos deterministas; darle la URL al proveedor es el paso siguiente.
 */

const OK = () => NextResponse.json({ received: true });

function log(evento: string, campos: Record<string, unknown>) {
  console.log(`[billing:wompi] ${evento}`, JSON.stringify(campos));
}

function comparaEnTiempoConstante(a: string, b: string): boolean {
  const x = Buffer.from(a.toLowerCase());
  const y = Buffer.from(b.toLowerCase());
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const inicio = Date.now();
  let evento: WompiEvent | null = null;
  try {
    evento = (await request.json()) as WompiEvent;
  } catch {
    evento = null;
  }

  const tx = (evento?.data?.transaction ?? {}) as Record<string, unknown>;
  const recurso = tx.id !== undefined && tx.id !== null ? String(tx.id) : "";
  if (!evento || !evento.event || !recurso) {
    log("evento_ilegible", { event: evento?.event ?? null });
    return NextResponse.json({ error: "unrecognised_event" }, { status: 400 });
  }

  // La configuración se clasifica igual que en el adaptador: si las llaves no
  // son coherentes, no se procesa nada. Falla cerrado.
  const clasificacion = classifyWompiKeys({
    publicKey: process.env.WOMPI_PUBLIC_KEY,
    privateKey: process.env.WOMPI_PRIVATE_KEY,
    eventsSecret: process.env.WOMPI_EVENTS_SECRET,
    integritySecret: process.env.WOMPI_INTEGRITY_SECRET,
  });

  const secreto = process.env.WOMPI_EVENTS_SECRET;
  const cadena = secreto ? eventChecksumPayload(evento, secreto) : null;
  const esperado = cadena ? createHash("sha256").update(cadena).digest("hex") : null;
  const recibido = evento.signature?.checksum
    ?? request.headers.get("x-event-checksum") ?? "";
  const verificado = Boolean(esperado && recibido
    && comparaEnTiempoConstante(esperado, recibido));

  const razon = !secreto ? "SecretNotConfigured"
    : !cadena ? "MalformedSignatureBlock"
    : !verificado ? "ChecksumMismatch" : null;

  const anotado = await recordProviderEvent({
    provider: WOMPI, topic: evento.event, resourceId: recurso,
    signatureVerified: verificado, signatureFailureReason: razon,
    // Wompi declara su entorno en el propio evento.
    liveMode: clasificacion.environment === "production",
    environment: clasificacion.environment === "sandbox" ? "test"
      : clasificacion.environment === "production" ? "live" : null,
    providerRequestId: request.headers.get("x-event-checksum"),
    payload: sanitizeEventEnvelope(evento),
  });

  if (!verificado) {
    log("firma_invalida", { event: evento.event, resource: recurso, reason: razon });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  if (!anotado) {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const cerrar = (estado: string, resultado: string, org?: string | null, clase?: string) =>
    closeProviderEvent({ eventId: anotado.eventId, processingStatus: estado,
                         outcome: resultado, errorClass: clase ?? null,
                         organizationId: org ?? null });

  // ENTORNO. Hacen falta LAS DOS EVIDENCIAS, y ninguna sustituye a la otra: la
  // firma ya demostró que el mensaje viene de quien tiene el secreto de este
  // entorno, y el campo `environment` —que el contrato de Wompi siempre
  // incluye, con `test` o `prod` como únicos valores— tiene que coincidir con
  // las llaves.
  //
  // Si falta, o trae cualquier otra cosa, se rechaza. Falla cerrado.
  if (!clasificacion.environment
      || !eventEnvironmentMatches(evento.environment, clasificacion.environment)) {
    await cerrar("rejected", "environment_mismatch", null, "ENVIRONMENT_MISMATCH");
    log("entorno_no_coincide", { event: evento.event,
                                 evento_entorno: evento.environment ?? null,
                                 llaves: clasificacion.environment });
    return OK();
  }

  if (evento.event !== WOMPI_EVENT_TRANSACTION_UPDATED) {
    await cerrar("ignored", "unknown_topic");
    return OK();
  }

  // EL AVISO NO ES EL EXTRACTO. Se relee la transacción en la API.
  const proveedor = wompiFromEnv();
  const leida = await proveedor.getTransaction(recurso);
  if (!leida.ok) {
    await cerrar(leida.failure === "provider_unavailable" ? "pending_resource" : "error",
                 "resource_unavailable", null, leida.failure);
    log("transaccion_no_disponible", { resource: recurso, failure: leida.failure,
                                       ms: Date.now() - inicio });
    return OK();
  }

  const canonico = mapTransactionStatus(leida.value.status);
  const salida = settlementOutcome(canonico);
  if (salida === null) {
    await cerrar(canonico === "manual_review" ? "manual_review" : "processed",
                 `payment_${canonico ?? "unknown"}`);
    return OK();
  }

  // A QUÉ COBRO PERTENECE ESTE DINERO.
  //
  // La referencia solo dice QUÉ INTENTO es. Lo que ese intento significa
  // —contratación o renovación de un periodo concreto— lo dice la base. Poner
  // la semántica en la cadena fue el error que permitió dos cobros para el
  // mismo mes.
  const intentoId = parseAttemptReference(leida.value.reference);
  if (!intentoId) {
    await cerrar("manual_review", "unparseable_reference", null, "NO_REFERENCE");
    log("referencia_ilegible", { resource: recurso });
    return OK();
  }
  const clase = await classifyAttempt(intentoId);
  if (!clase) {
    await cerrar("manual_review", "unknown_attempt", null, "UNKNOWN_ATTEMPT");
    log("intento_desconocido", { resource: recurso });
    return OK();
  }

  let r;
  if (clase.kind === "upgrade") {
    // La subida de plan salda SU ajuste y no toca el calendario: el periodo
    // seguía pagado antes y sigue pagado después. Lo único que cambia es el
    // nivel, y solo si este evento firmado dice que el dinero entró.
    r = await settleUpgradePayment({
      intentId: clase.intentId, provider: WOMPI,
      providerPaymentId: leida.value.transactionId, outcome: salida,
      amount: leida.value.amountCopMinor, currency: leida.value.currency,
      liveMode: clasificacion.environment === "production",
      failureReason: leida.value.statusMessage,
    });
  } else if (clase.kind === "initial") {
    r = await settleProviderPayment({
      provider: WOMPI, externalReference: clase.intentId,
      providerPaymentId: leida.value.transactionId, outcome: salida,
      amount: leida.value.amountCopMinor, currency: leida.value.currency,
      liveMode: clasificacion.environment === "production",
      failureReason: leida.value.statusMessage,
    });
  } else {
    // La renovación salda UNA obligación ya definida. El derecho se extiende al
    // periodo que ya estaba escrito: el pago no inventa fechas.
    r = await settlePeriodPayment({
      periodId: clase.periodId, provider: WOMPI,
      providerPaymentId: leida.value.transactionId, outcome: salida,
      amount: leida.value.amountCopMinor, currency: leida.value.currency,
      liveMode: clasificacion.environment === "production",
    });
    // Y el intento deja de decir que está en vuelo, porque ya no lo está. La
    // inicial cierra el suyo sola; esta se dirige al periodo, así que hay que
    // cerrarlo aquí o la regla de «un solo cobro en vuelo» miente.
    await closeAttempt(clase.intentId, r.outcome);
  }

  // `period_already_settled` NO es un proceso normal: es dinero de más sobre
  // una obligación ya saldada, y lo mira una persona.
  const estado = ["activated", "renewed", "upgraded", "already_settled",
                  "declined", "failed"]
    .includes(r.outcome) ? "processed" : "manual_review";
  await cerrar(estado, r.outcome, r.organizationId);
  log("pago_conciliado", { resource: recurso, kind: clase.kind, outcome: r.outcome,
                           ms: Date.now() - inicio });
  return OK();
}

/** Wompi espera 200 en la entrega; un GET solo dice que la puerta está viva. */
export async function GET() {
  return NextResponse.json({ ok: true });
}

// WOMPI_WEBHOOK_NOT_REGISTERED_YET · la URL todavía no se le ha dado a Wompi.
// Un fichero de ruta solo puede exportar sus manejadores, así que la marca
// vive en un comentario.
