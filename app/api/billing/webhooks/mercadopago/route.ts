import { NextResponse } from "next/server";
import {
  MERCADOPAGO, readNotification, isKnownTopic, environmentFromAccessToken,
  environmentMatches, mapPaymentStatus, settlementOutcome,
} from "@/lib/billing/mercadopago/mapping";
import { verifyMercadoPagoSignature } from "@/lib/billing/mercadopago/signature";
import { mercadoPagoFromEnv } from "@/lib/billing/providers/mercadopago";
import {
  recordProviderEvent, closeProviderEvent, settleProviderPayment,
  recordRenewalPayment, markProviderSubscriptionState,
} from "@/lib/db/billing-provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trazaloop · PE-05B2 · La puerta del proveedor de pagos.
 *
 * ES UNA PUERTA DE MÁQUINA. No hay sesión de Trazaloop detrás y no puede
 * haberla: el que llama es Mercado Pago. Su seguridad es la FIRMA, y nada más.
 *
 * EL ORDEN, Y POR QUÉ ES ESE
 *
 *   1. Verificar la firma. Si no cuadra: se anota el intento —sin cuerpo— y se
 *      responde 401. Cero efecto de negocio.
 *   2. Comprobar el entorno. Un aviso de producción sobre credenciales de
 *      prueba no se procesa aunque venga firmado.
 *   3. Anotar la notificación. Repetida, incrementa un contador; no crea otra.
 *   4. RELEER EL RECURSO EN LA API DEL PROVEEDOR. El cuerpo del webhook es un
 *      aviso, no un extracto bancario: puede llegar viejo y puede llegar
 *      manipulado en los campos que no entran en la firma. El importe y el
 *      estado con los que se decide salen de la lectura, no del cuerpo.
 *   5. Conciliar contra lo que el servidor esperaba, y solo entonces liquidar.
 *
 * LO QUE NUNCA PASA AQUÍ
 *
 * · Ninguna rama activa un plan por lo que diga el cuerpo del webhook.
 * · Ninguna rama degrada un derecho. Cancelar o marcar moroso es ciclo de
 *   vida, y eso es B5.
 * · No se registra ni un token, ni una cabecera de autorización, ni el cuerpo
 *   completo.
 *
 * Se responde 200 en cuanto la notificación queda anotada y resuelta, para que
 * el proveedor no reintente por un problema nuestro; y 401 solo cuando la
 * firma no cuadra, que es la única respuesta que le dice algo útil.
 */

const OK = () => NextResponse.json({ received: true });

function log(evento: string, campos: Record<string, unknown>) {
  // Tipo de operación, identificadores y clase de error. Nunca el token, ni el
  // secreto, ni la cabecera de autorización, ni el cuerpo del proveedor.
  console.log(`[billing:mercadopago] ${evento}`, JSON.stringify(campos));
}

export async function POST(request: Request) {
  const inicio = Date.now();
  const url = new URL(request.url);
  const query = url.searchParams;

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const aviso = readNotification(body, query);
  const xSignature = request.headers.get("x-signature");
  const xRequestId = request.headers.get("x-request-id");

  // Un cuerpo que no dice ni de qué es ni a qué apunta no se puede ni anotar:
  // no hay recurso al que asociarlo. Se rechaza sin dejar rastro que llenar.
  if (!aviso) {
    log("notificacion_ilegible", { topic: query.get("topic") ?? query.get("type") });
    return NextResponse.json({ error: "unrecognised_notification" }, { status: 400 });
  }

  const firma = verifyMercadoPagoSignature({
    xSignature, xRequestId,
    dataId: aviso.resourceId,
    secret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
  });

  const entorno = environmentFromAccessToken(process.env.MERCADOPAGO_ACCESS_TOKEN);

  const anotado = await recordProviderEvent({
    provider: MERCADOPAGO, topic: aviso.topic, resourceId: aviso.resourceId,
    signatureVerified: firma.verified,
    signatureFailureReason: firma.verified ? null : firma.reason,
    liveMode: aviso.liveMode, environment: entorno,
    providerRequestId: xRequestId,
    payload: aviso.envelope,
  });

  if (!firma.verified) {
    log("firma_invalida", { topic: aviso.topic, resource: aviso.resourceId,
                            reason: firma.reason, requestId: xRequestId });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }
  if (!anotado) {
    log("no_se_pudo_anotar", { topic: aviso.topic, resource: aviso.resourceId });
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }

  const cerrar = (estado: string, resultado: string, org?: string | null, clase?: string) =>
    closeProviderEvent({ eventId: anotado.eventId, processingStatus: estado,
                         outcome: resultado, errorClass: clase ?? null,
                         organizationId: org ?? null });

  // ENTORNO. Falla cerrado: sin credenciales configuradas tampoco se procesa.
  if (!entorno || !environmentMatches(aviso.liveMode, entorno)) {
    await cerrar("rejected", "environment_mismatch", null, "ENVIRONMENT_MISMATCH");
    log("entorno_no_coincide", { topic: aviso.topic, resource: aviso.resourceId,
                                 liveMode: aviso.liveMode, environment: entorno });
    return OK();
  }

  if (!isKnownTopic(aviso.topic)) {
    await cerrar("ignored", "unknown_topic");
    return OK();
  }

  const proveedor = mercadoPagoFromEnv();

  try {
    if (aviso.topic === "subscription_preapproval") {
      // Un cambio en el objeto recurrente. Se relee, se traduce y se ANOTA.
      // No concede ni quita derecho: `authorized` no es un pago.
      const r = await proveedor.getSubscriptionDetail(aviso.resourceId);
      if (!r.ok) {
        await cerrar(r.failure === "provider_unavailable" ? "pending_resource" : "error",
                     "resource_unavailable", null, r.failure);
        log("recurso_no_disponible", { topic: aviso.topic, resource: aviso.resourceId,
                                       failure: r.failure, ms: Date.now() - inicio });
        return OK();
      }
      const marca = await markProviderSubscriptionState({
        provider: MERCADOPAGO, providerSubscriptionId: r.value.providerSubscriptionId,
        providerStatus: r.value.providerStatus,
        canonicalStatus: r.value.canonicalStatus,
        providerVersion: r.value.version,
      });
      await cerrar(r.value.canonicalStatus === null ? "manual_review" : "processed",
                   marca.outcome, marca.organizationId);
      log("suscripcion_anotada", { resource: aviso.resourceId,
                                   providerStatus: r.value.providerStatus,
                                   outcome: marca.outcome, ms: Date.now() - inicio });
      return OK();
    }

    // `payment` y `subscription_authorized_payment` traen un pago. Se relee.
    const p = await proveedor.getPaymentDetail(aviso.resourceId);
    if (!p.ok) {
      await cerrar(p.failure === "provider_unavailable" ? "pending_resource" : "error",
                   "resource_unavailable", null, p.failure);
      log("pago_no_disponible", { topic: aviso.topic, resource: aviso.resourceId,
                                  failure: p.failure, ms: Date.now() - inicio });
      return OK();
    }

    const canonico = mapPaymentStatus(p.value.providerStatus);
    const salida = settlementOutcome(canonico);
    if (salida === null) {
      // Pendiente o en revisión: todavía no es una noticia financiera. Se
      // anota y se espera al aviso siguiente.
      await cerrar(canonico === "manual_review" ? "manual_review" : "processed",
                   `payment_${canonico ?? "unknown"}`);
      return OK();
    }

    // El pago inicial trae la referencia externa del intento; una renovación,
    // no: llega colgada de la suscripción. Son dos caminos y NO se mezclan,
    // porque uno crea la suscripción y el otro no puede crear una segunda.
    if (p.value.externalReference) {
      const r = await settleProviderPayment({
        provider: MERCADOPAGO, externalReference: p.value.externalReference,
        providerPaymentId: p.value.providerPaymentId, outcome: salida,
        amount: p.value.amount, currency: p.value.currency,
        liveMode: p.value.liveMode, failureReason: p.value.statusDetail,
      });
      const estado = r.outcome === "activated" || r.outcome === "already_settled"
        || r.outcome === "declined" || r.outcome === "failed"
        ? "processed" : "manual_review";
      await cerrar(estado, r.outcome, r.organizationId);
      log("pago_conciliado", { resource: aviso.resourceId, outcome: r.outcome,
                               ms: Date.now() - inicio });
      return OK();
    }

    if (p.value.preapprovalId) {
      const r = await recordRenewalPayment({
        provider: MERCADOPAGO, providerSubscriptionId: p.value.preapprovalId,
        providerPaymentId: p.value.providerPaymentId, outcome: salida,
        amount: p.value.amount, currency: p.value.currency, liveMode: p.value.liveMode,
      });
      const estado = r.outcome === "renewed" || r.outcome === "already_settled"
        || r.outcome === "declined" || r.outcome === "failed"
        ? "processed" : "manual_review";
      await cerrar(estado, r.outcome, r.organizationId);
      log("renovacion_conciliada", { resource: aviso.resourceId, outcome: r.outcome,
                                     ms: Date.now() - inicio });
      return OK();
    }

    // Un pago auténtico que no se puede atar a nada nuestro. No se adivina.
    await cerrar("manual_review", "unlinked_payment", null, "NO_REFERENCE");
    log("pago_sin_referencia", { resource: aviso.resourceId, ms: Date.now() - inicio });
    return OK();
  } catch (e) {
    await cerrar("error", "handler_error", null,
                 e instanceof Error ? e.name : "UnknownError");
    log("fallo_del_manejador", { resource: aviso.resourceId,
                                 error: e instanceof Error ? e.name : "UnknownError",
                                 ms: Date.now() - inicio });
    return OK();
  }
}

/**
 * Mercado Pago comprueba la URL con un GET al configurarla. Se responde que
 * está viva y NADA más: ni estado, ni configuración, ni si hay secreto puesto.
 */
export async function GET() {
  return NextResponse.json({ ok: true });
}
