import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveRecurringLane } from "@/lib/billing/recurring/policy";
import {
  decideRunnerAction, emptySummary, countInto,
  type RunnerCandidate,
} from "@/lib/billing/recurring/runner-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trazaloop · MP-REC-01C.3 · El barrido que reconoce cobros sin que nadie mire.
 *
 *
 * POR QUÉ HACE FALTA
 *
 * Una recurrencia cobra cuando le toca. Nadie está navegando, no hay vuelta del
 * navegador, y en el sandbox del proveedor tampoco hay webhook. Si el dinero
 * solo se reconociera cuando alguien vuelve a la pantalla, una empresa podría
 * pagar en octubre y no tener plan hasta que a alguien se le ocurriera entrar.
 *
 * El primer cobro real ya demostró que esto no es teórico: la vuelta falló con
 * un 404 y el pago se recuperó por conciliación de servidor. Esto es esa misma
 * conciliación, ejecutándose sola.
 *
 *
 * EL MISMO PATRÓN QUE EL BARRIDO DE RENOVACIONES, A PROPÓSITO
 *
 * El repositorio ya resolvió una vez «cómo se dispara un trabajo de servidor
 * sin inventar infraestructura»: un endpoint con secreto propio, que responde
 * 404 a quien no lo trae —para no confirmarle siquiera que existe— y que se
 * niega en Producción. Se copia esa decisión entera en vez de crear un segundo
 * marco de autenticación.
 *
 * Una sesión de usuario NO abre esta puerta, por muy superadministrador que
 * sea: pedir que se ejecute un trabajo de servidor y estar autorizado a
 * ejecutarlo son cosas distintas.
 *
 *
 * DOS RESPONSABILIDADES, SEPARADAS
 *
 *   A · CONCILIAR con el proveedor, solo donde el proveedor todavía puede
 *       cobrar. Una preapproval cancelada no se consulta, diga lo que diga su
 *       `next_payment_date` —que el proveedor conserva aunque esté muerta—.
 *
 *   B · PONER AL DÍA el estado canónico. Es limpieza, y NO gobierna el acceso:
 *       el derecho sale de la fecha del último periodo pagado. Si este barrido
 *       no corre en un mes, nadie tiene acceso de más ni de menos.
 *
 *
 * NO HAY CRON EN PRODUCCIÓN
 *
 * Ni lo habrá mientras la recurrencia siga apagada allí. En Staging se dispara
 * a mano o desde un planificador externo que presente el secreto.
 */

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
  // --- Candado 1 · el secreto del barrido ----------------------------------
  const secreto = process.env.BILLING_RECURRING_RUNNER_SECRET
    ?? process.env.BILLING_RENEWAL_RUNNER_SECRET;
  if (!secreto || secreto.length < 16) return noExiste();
  if (!secretoCoincide(request.headers.get("x-billing-runner-secret"), secreto)) {
    return noExiste();
  }

  // --- Candado 2 · jamás en Producción -------------------------------------
  if (process.env.VERCEL_ENV === "production") return noExiste();

  // --- Candado 3 · el carril tiene que estar abierto ------------------------
  //
  // La misma política que decide si se puede contratar decide si se puede
  // conciliar. No hay una segunda forma de encender esto.
  const carril = resolveRecurringLane();
  if (!carril.open) {
    return NextResponse.json({ ok: false, error: carril.reason }, { status: 404 });
  }

  let cuerpo: { limit?: number } = {};
  try { cuerpo = (await request.json()) as typeof cuerpo; } catch { cuerpo = {}; }
  const limite = Number.isInteger(cuerpo.limit) && (cuerpo.limit as number) > 0
    ? Math.min(cuerpo.limit as number, 200) : 50;

  const admin = createAdminClient();
  const ahora = new Date();
  const resumen = emptySummary();

  // A QUIÉN SE MIRA. Acotado y por el carril, no un recorrido de todas las
  // empresas: un barrido que lee todo es un barrido que nadie se atreve a
  // ejecutar cuando hay volumen.
  const { data: filas, error } = await admin
    .from("billing_subscriptions")
    .select("id, status, renewal_mode")
    .eq("renewal_mode", "provider")
    .in("status", ["pending", "active", "past_due", "cancel_at_period_end"])
    .order("updated_at", { ascending: true })
    .limit(limite);
  if (error) {
    return NextResponse.json({ ok: false, error: "SCAN_FAILED" }, { status: 500 });
  }

  const { reconcileRecurringAuthorization } =
    await import("@/lib/db/recurring-checkout");

  for (const f of (filas ?? []) as Array<{ id: string; status: string;
                                           renewal_mode: string }>) {
    resumen.scanned += 1;
    try {
      const { data: aut } = await admin.from("billing_recurring_authorizations")
        .select("id, status, provider_subscription_id")
        .eq("subscription_id", f.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const a = aut as { id: string; status: string;
                         provider_subscription_id: string } | null;

      const { data: per } = await admin.from("billing_subscription_periods")
        .select("period_end").eq("subscription_id", f.id).eq("status", "settled")
        .order("period_end", { ascending: false }).limit(1).maybeSingle();

      const candidata: RunnerCandidate = {
        subscriptionId: f.id,
        subscriptionStatus: f.status,
        renewalMode: f.renewal_mode,
        authorizationStatus: a?.status ?? null,
        hasProviderObject: Boolean(a
          && !a.provider_subscription_id.startsWith("pending:")),
        paidThrough: (per as { period_end: string } | null)?.period_end ?? null,
      };
      const veredicto = decideRunnerAction(candidata, ahora);

      // --- A · el proveedor -------------------------------------------------
      if (veredicto.action === "reconcile" && a) {
        const r = await reconcileRecurringAuthorization(a.id);
        if (!r.ok) { resumen.failed += 1; }
        else if (r.settledNow > 0) { resumen.reconciled += 1; }
        else { resumen.alreadyCurrent += 1; }
      } else {
        countInto(resumen.skipped, veredicto.action);
      }

      // --- B · el estado canónico -------------------------------------------
      //
      // Va SIEMPRE, incluso cuando no se concilia: una cancelada vencida
      // necesita ponerse al día justamente porque ya no se le pregunta a nadie.
      if (veredicto.lifecycleRefresh !== "none") {
        const { data: ref } = await admin.rpc(
          "billing_refresh_recurring_lifecycle", { p_subscription_id: f.id });
        countInto(resumen.lifecycle,
          String((ref as { outcome?: string })?.outcome ?? "unknown"));
      }
    } catch {
      // Una suscripción que falla no puede llevarse por delante la pasada.
      resumen.failed += 1;
    }
  }

  // Recuentos, nunca identificadores. Quien lee esto quiere saber si la pasada
  // hizo su trabajo, no de quién era cada fila.
  console.log("[billing:recurring-runner]", JSON.stringify(resumen));
  return NextResponse.json({ ok: true, ...resumen });
}
