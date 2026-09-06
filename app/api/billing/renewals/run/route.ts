import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runRenewalPass } from "@/lib/billing/renewal/orchestrator";
import { fakeBillingProvider } from "@/lib/billing/providers/fake";
import { wompiFromEnv } from "@/lib/billing/providers/wompi";
import { openRenewalRun, closeRenewalRun } from "@/lib/db/billing-renewal";
import { scanUncertainCharges } from "@/lib/db/billing-alerts";
import { dispatchPendingAlerts } from "@/lib/billing/alerts/dispatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trazaloop · PE-05B5C · La puerta del cobro programado.
 *
 * MISMO PATRÓN QUE EL BARRIDO DE QUALITY-11, A PROPÓSITO
 *
 * El repositorio ya resolvió una vez «cómo se dispara un trabajo de servidor
 * sin inventar infraestructura»: un endpoint con secreto propio, que cualquier
 * planificador externo puede llamar. Se copia esa decisión entera —incluido
 * responder 404 a quien no trae el secreto, para no confirmarle siquiera que
 * la puerta existe— en vez de crear un segundo marco de autenticación.
 *
 * EN SECO POR DEFECTO, Y SIEMPRE QUE FALTE UNA SOLA COSA
 *
 * Mirar necesita un secreto. COBRAR necesita cuatro cosas a la vez, y si falta
 * cualquiera se mira y no se cobra:
 *
 *   1. su propio secreto, distinto del de mirar;
 *   2. un interruptor de servidor encendido a propósito;
 *   3. una lista blanca de suscripciones, también de servidor;
 *   4. no estar en Producción.
 *
 * El secreto de mirar NO abre la puerta de cobrar, y por eso son dos cabeceras
 * distintas: si fueran la misma, cualquiera que pudiera diagnosticar podría
 * mover dinero.
 *
 * NO HAY CRON
 *
 * Configurar `crons` en `vercel.json` tocaría configuración compartida con
 * Producción, y este tramo no la toca. La cadencia prevista es HORARIA, y la
 * verdad financiera no depende de ella: los vencimientos salen del calendario
 * comercial y los huecos de reintento, del vencimiento.
 */

/** Sin pistas: quien no trae el secreto no merece un mensaje distinto de quien
 *  se equivoca de URL. */
function noExiste() {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

function secretoCoincide(presentado: string | null, esperado: string | undefined) {
  if (!presentado || !esperado) return false;
  const a = Buffer.from(presentado);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secreto = process.env.BILLING_RENEWAL_RUNNER_SECRET;
  // Falla cerrada: sin secreto configurado —o con uno corto— la puerta no
  // existe. Una sesión de usuario, por muy superadministrador que sea, no
  // autoriza un trabajo de servidor: son cosas distintas.
  if (!secreto || secreto.length < 16) return noExiste();
  if (!secretoCoincide(request.headers.get("x-billing-runner-secret"), secreto)) {
    return noExiste();
  }

  // Nunca desde Producción, y menos apuntando a otro sitio. Este tramo no la
  // toca ni por accidente.
  if (process.env.VERCEL_ENV === "production") return noExiste();

  let cuerpo: { limit?: number } = {};
  try { cuerpo = (await request.json()) as typeof cuerpo; } catch { cuerpo = {}; }
  const limite = Number.isInteger(cuerpo.limit) && (cuerpo.limit as number) > 0
    ? Math.min(cuerpo.limit as number, 200) : 100;

  // LAS CUATRO COSAS. El cuerpo de la petición no aparece: pedir ejecutar no
  // autoriza a ejecutar.
  const secretoEjecucion = process.env.BILLING_RENEWAL_EXECUTE_SECRET;
  const listaBlanca = (process.env.BILLING_RENEWAL_EXECUTION_ALLOWLIST ?? "")
    .split(",").map((x) => x.trim()).filter((x) => x.length > 0);
  const ejecutar =
    process.env.BILLING_RENEWAL_EXECUTION_ENABLED === "true"
    && !!secretoEjecucion && secretoEjecucion.length >= 16
    && secretoCoincide(request.headers.get("x-billing-execute-secret"), secretoEjecucion)
    && listaBlanca.length > 0;

  const runId = await openRenewalRun();
  const r = await runRenewalPass({
    // Cuando no se ejecuta, ni siquiera se construye el proveedor real: lo que
    // recibe la pasada es el doble, que no abre una conexión en su vida.
    provider: ejecutar ? wompiFromEnv() : fakeBillingProvider("approve", "approve"),
    dryRun: !ejecutar,
    onlySubscriptions: ejecutar ? listaBlanca : undefined,
    limit: limite,
  });

  const porAccion = {
    renew: r.decisions.filter((d) => d.action === "renew").length,
    retry: r.decisions.filter((d) => d.action === "retry").length,
    lapse_due: r.decisions.filter((d) => d.action === "lapse_due").length,
    cancel_due: r.decisions.filter((d) => d.action === "cancel_due").length,
    downgrade_due: r.decisions.filter((d) => d.action === "downgrade_due").length,
    manual_review_required: r.manualReview,
    payment_method_unavailable: r.paymentMethodUnavailable,
  };

  // Queda escrito qué se miró y qué se decidió. Identificadores y clases: ni un
  // importe, ni un dato del proveedor, ni nada que no se pueda enseñar.
  await closeRenewalRun({
    runId, status: r.failures > 0 ? "partial" : "success",
    counts: { dueFound: r.dueFound, charged: r.charged, retried: r.retried,
              lapsed: r.lapsed, skipped: r.skipped, failures: r.failures },
    decisions: r.decisions.map((d) => ({
      // Lo que quedó escrito tiene que ser lo que PASÓ. Antes esta línea decía
      // siempre «dry_run», y por tanto una pasada que movió dinero de verdad se
      // archivaba como si solo hubiera mirado: el registro contaba otra
      // historia que los hechos.
      mode: ejecutar ? "execute" : "dry_run",
      action: d.action, subscription_id: d.subscriptionId,
      organization_id: d.organizationId, period_id: d.periodId,
      attempt_number: d.attemptNumber, slot: d.slot, outcome: d.outcome,
      failure_class: d.failureClass })),
  });

  // Y ANTES DE CONTESTAR, SE MIRA SI ALGO QUEDÓ EN DUDA.
  //
  // Se hace aquí porque esta ruta ya es la puerta de operación y ya tiene su
  // secreto: inventar un segundo endpoint sería una segunda puerta que cuidar.
  // El barrido lee la verdad que ya existe y no decide nada; la entrega, si
  // falla, tampoco. Corre también en seco: enterarse no es cobrar.
  const barrido = await scanUncertainCharges();
  const avisos = await dispatchPendingAlerts();

  // Solo recuentos y decisiones. Ni un identificador de proveedor, ni un
  // importe, ni nada que no se pueda enseñar.
  return NextResponse.json({
    ok: true,
    mode: ejecutar ? "execute" : "dry_run",
    environment: process.env.VERCEL_ENV ?? "local",
    provider_calls: ejecutar
      ? r.decisions.filter((d) => d.providerPaymentId || d.failureClass).length : 0,
    run_id: runId,
    alerts: { scanned: barrido.scanned, raised: barrido.raised,
              pending: avisos.pending, sent: avisos.sent, failed: avisos.failed,
              channel_configured: avisos.channelConfigured },
    due_found: r.dueFound,
    by_action: porAccion,
    errors: r.failures,
    decisions: r.decisions.map((d) => ({
      action: d.action, subscription_id: d.subscriptionId,
      organization_id: d.organizationId, period_id: d.periodId,
      attempt_number: d.attemptNumber, slot: d.slot, outcome: d.outcome,
    })),
  });
}

/** Un GET no dispara trabajos. Ni siquiera dice que esto existe. */
export async function GET() {
  return noExiste();
}
