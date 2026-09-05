import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runRenewalPass } from "@/lib/billing/renewal/orchestrator";
import { fakeBillingProvider } from "@/lib/billing/providers/fake";
import { openRenewalRun, closeRenewalRun } from "@/lib/db/billing-renewal";

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
 * EN ESTE TRAMO SOLO MIRA
 *
 * Y no por disciplina: por construcción. La pasada se llama SIEMPRE con
 * `dryRun: true`, y el proveedor que se le pasa es el DOBLE, que no abre una
 * conexión de red en su vida. Aunque alguien lograra saltarse lo primero, no
 * habría con qué cobrar. Ejecutar de verdad es de B5D, y exigirá cambiar este
 * fichero a la vista de todos.
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

  const runId = await openRenewalRun();
  const r = await runRenewalPass({
    // El doble, y en seco. Dos cierres para lo mismo, porque lo que hay al otro
    // lado es el dinero de alguien.
    provider: fakeBillingProvider("approve", "approve"),
    dryRun: true,
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
      mode: "dry_run", action: d.action, subscription_id: d.subscriptionId,
      organization_id: d.organizationId, period_id: d.periodId,
      attempt_number: d.attemptNumber, slot: d.slot, outcome: d.outcome,
      failure_class: d.failureClass })),
  });

  // Solo recuentos y decisiones. Ni un identificador de proveedor, ni un
  // importe, ni nada que no se pueda enseñar.
  return NextResponse.json({
    ok: true,
    mode: "dry_run",
    environment: process.env.VERCEL_ENV ?? "local",
    provider_calls: 0,
    run_id: runId,
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
