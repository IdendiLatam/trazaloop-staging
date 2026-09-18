import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mercadoPagoFromEnv } from "@/lib/billing/providers/mercadopago";
import { providerAmountToMinor } from "@/lib/billing/mercadopago/mapping";
import { buildUpgradeReference } from "@/lib/billing/upgrade-reference";
import {
  decideUpgradeStep, recurringTotalFor,
  type ObservedDeltaPayment, type UpgradeSagaFacts,
} from "@/lib/billing/upgrade/saga";

/**
 * Trazaloop · BILLING-EXTRA-01B · La subida de plan por Mercado Pago.
 *
 *
 * QUÉ ES ESTE FICHERO
 *
 * El equivalente de `lib/billing/upgrade-charge.ts` para Mercado Pago, y su
 * conciliador. Lo impuro: leer la base, preguntarle al proveedor, escribir. La
 * DECISIÓN no está aquí —vive en `lib/billing/upgrade/saga.ts`, pura y
 * comprobable—, y eso es a propósito: los casos que de verdad importan son los
 * que ocurren entre dos llamadas de red, y esos no se prueban si la decisión
 * está mezclada con las llamadas.
 *
 *
 * QUÉ NO SE DUPLICA
 *
 * Ni una primitiva de 0181. `billing_quote_upgrade` presupuesta,
 * `billing_open_upgrade_intent` abre y `billing_settle_upgrade_payment` sigue
 * siendo el ÚNICO camino de un pago verificado a Extra. Aquí sólo se construye
 * lo que faltaba alrededor del proveedor.
 *
 *
 * UNA SOLA LÓGICA, TRES DISPARADORES
 *
 * `reconcileMercadoPagoUpgrade` la puede llamar la vuelta del navegador, el
 * aviso del proveedor o un barrido. Ninguno es requisito: la vuelta del
 * navegador no es la confirmación de nada y el aviso puede no llegar. Lo que sí
 * es requisito es que los tres pregunten lo mismo.
 */

const MP = "mercadopago";

type Fila = Record<string, unknown>;
const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export type UpgradeCheckoutResult =
  | { ok: true; intentId: string; initPoint: string; total: number; currency: string }
  | { ok: false; code: string; detail?: string };

/**
 * Abrir el cobro de la diferencia en Mercado Pago.
 *
 * Reutiliza `billing_open_upgrade_intent` —que congela el importe esperado y
 * pone el cambio en «enviada»— y la preferencia de pago único que ya existe. La
 * referencia es `upg_<intento>`: identifica inequívocamente ESTA subida, y la
 * lectura sólo acepta ese prefijo, así que una renovación no puede entrar por
 * esta puerta.
 */
export async function startMercadoPagoUpgradeCheckout(input: {
  changeId: string;
  origin: string;
  payerEmail: string | null;
}): Promise<UpgradeCheckoutResult> {
  const proveedor = mercadoPagoFromEnv();
  if (!proveedor.identity.ok) {
    return { ok: false, code: "PROVIDER_NOT_CONFIGURED" };
  }
  const entorno = proveedor.identity.value.environment;

  const admin = createAdminClient();
  const abierto = await admin.rpc("billing_open_upgrade_intent", {
    p_change_id: input.changeId, p_provider: MP, p_environment: entorno,
  });
  if (abierto.error || !abierto.data) {
    return { ok: false, code: "INTENT_NOT_OPENED", detail: abierto.error?.message };
  }
  const a = abierto.data as Fila;
  if (str(a.status) !== "opened") {
    return { ok: false, code: String(a.status ?? "unknown") };
  }
  const intentId = String(a.intent_id);
  const total = Number(a.expected_total_amount);
  const moneda = String(a.expected_currency);

  // La vuelta lleva a una pantalla que PREGUNTA, no que confirma. Y la
  // referencia es la misma que la idempotencia de la preferencia: pedirla dos
  // veces devuelve la misma, nunca dos cobros distintos para lo mismo.
  const referencia = buildUpgradeReference(intentId);
  // La vuelta lleva el CAMBIO, no el intento: es lo que el conciliador
  // necesita y lo que la pantalla puede comprobar que es de esta empresa.
  const vuelta =
    `${input.origin}/settings/billing/checkout/return?u=${input.changeId}`;
  const preferencia = await proveedor.createOneTimeCheckout({
    externalReference: referencia,
    title: "Diferencia por subir a Extra",
    amountMinor: total,
    currency: moneda,
    payerEmail: input.payerEmail,
    successUrl: vuelta, failureUrl: vuelta, pendingUrl: vuelta,
  });
  if (!preferencia.ok || !preferencia.value.initPoint) {
    return { ok: false, code: preferencia.ok ? "PROVIDER_REFUSED"
                                             : preferencia.failure.toUpperCase() };
  }

  // Se anota dónde se mandó a esta empresa. No es imprescindible para que la
  // conciliación funcione —la referencia lo identifica todo— pero sin esto,
  // quien opera no puede ver a qué pantalla fue alguien.
  await admin.rpc("billing_attach_provider_subscription", {
    p_intent_id: intentId,
    p_provider_subscription_id: null,
    p_init_point: preferencia.value.initPoint,
    p_provider_status: null,
    p_status: null,
  });

  return { ok: true, intentId, initPoint: preferencia.value.initPoint,
           total, currency: moneda };
}

export type UpgradeReconcileOutcome =
  | "upgraded" | "waiting" | "abandoned" | "refunded"
  | "compensation_required" | "not_applicable" | "blocked";

export type UpgradeReconcileResult = {
  outcome: UpgradeReconcileOutcome;
  reason: string;
  changeId: string;
  /** Lo que se decidió, para poder auditar una pasada sin adivinar. */
  steps: string[];
};

/**
 * Llevar una subida de Mercado Pago hasta donde pueda llegar.
 *
 * No recibe importes, ni identificadores del proveedor, ni nada de fuera: sólo
 * el cambio. Todo lo demás se deriva aquí.
 */
export async function reconcileMercadoPagoUpgrade(
  changeId: string
): Promise<UpgradeReconcileResult> {
  const admin = createAdminClient();
  const pasos: string[] = [];
  const fin = (outcome: UpgradeReconcileOutcome, reason: string)
    : UpgradeReconcileResult => ({ outcome, reason, changeId, steps: pasos });

  const { data: cambioRaw } = await admin.from("billing_subscription_changes")
    .select("*").eq("id", changeId).maybeSingle();
  const cambio = cambioRaw as Fila | null;
  if (!cambio) return fin("not_applicable", "CHANGE_NOT_FOUND");

  const { data: intentoRaw } = await admin.from("billing_checkout_intents")
    .select("id, provider, environment, expected_total_amount, expected_currency")
    .eq("subscription_change_id", changeId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const intento = intentoRaw as Fila | null;
  if (!intento) return fin("not_applicable", "INTENT_NOT_FOUND");
  if (str(intento.provider) !== MP) return fin("not_applicable", "NOT_MERCADOPAGO");

  const proveedor = mercadoPagoFromEnv();
  if (!proveedor.identity.ok) return fin("blocked", "PROVIDER_NOT_CONFIGURED");
  const entorno = proveedor.identity.value.environment;

  const { data: subRaw } = await admin.from("billing_subscriptions")
    .select("id, renewal_mode, charge_currency")
    .eq("id", String(cambio.subscription_id)).maybeSingle();
  const sub = subRaw as Fila | null;
  if (!sub) return fin("blocked", "SUBSCRIPTION_NOT_FOUND");
  const modo = str(sub.renewal_mode);

  // ── el cobro de la diferencia, tal y como lo ve el proveedor ──────────────
  const referencia = buildUpgradeReference(String(intento.id));
  let delta: ObservedDeltaPayment | null = null;
  const pagos = await proveedor.searchPaymentsByReference(referencia);
  if (!pagos.ok) {
    // Sin poder preguntar NO se decide nada. Volver más tarde no cuesta nada;
    // decidir a ciegas sí.
    return fin("waiting", `PROVIDER_UNREACHABLE:${pagos.failure}`);
  }
  // Si hubiera más de uno aprobado, se para. Dos cobros para la misma subida es
  // exactamente el caso que nadie debe resolver por su cuenta.
  const aprobados = pagos.value.payments.filter((p) => p.canonicalStatus === "approved");
  if (aprobados.length > 1) return fin("blocked", "MULTIPLE_APPROVED_DELTA_PAYMENTS");
  const elegido = aprobados[0] ?? pagos.value.payments[0] ?? null;
  if (elegido) {
    delta = {
      providerPaymentId: elegido.providerPaymentId,
      canonicalStatus: elegido.canonicalStatus,
      amountMinor: providerAmountToMinor(elegido.amount, elegido.currency),
      currency: elegido.currency ?? String(intento.expected_currency),
      liveMode: elegido.liveMode,
    };
  }

  // ── la autorización recurrente y los ciclos de la ventana ─────────────────
  let autorizacion: UpgradeSagaFacts["authorization"] = null;
  let ciclosDentro = 0;
  if (modo === "provider") {
    const { data: authRaw } = await admin.from("billing_recurring_authorizations")
      .select("provider_subscription_id, status, environment")
      .eq("subscription_id", String(sub.id))
      .in("status", ["authorized", "uncertain", "awaiting_authorization"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const auth = authRaw as Fila | null;
    const preapproval = auth ? str(auth.provider_subscription_id) : null;

    let importe: number | null = null;
    let monedaAuth: string | null = null;
    if (preapproval) {
      const detalle = await proveedor.getSubscriptionDetail(preapproval);
      if (!detalle.ok) return fin("waiting", `AUTHORIZATION_UNREADABLE:${detalle.failure}`);
      importe = detalle.value.amount === null
        ? null : providerAmountToMinor(detalle.value.amount, detalle.value.currency);
      monedaAuth = detalle.value.currency;

      // LA CARRERA. Se le pregunta al proveedor por los cobros de ESA
      // suscripción y se cuentan los aprobados dentro de la ventana de la
      // subida. No se mira nuestro registro de ciclos: justamente el peligro es
      // un cobro que ocurrió y que aquí todavía no consta.
      const ref = detalle.value.externalReference;
      if (ref) {
        const ciclos = await proveedor.searchPaymentsByReference(ref);
        if (!ciclos.ok) return fin("waiting", `CYCLES_UNREADABLE:${ciclos.failure}`);
        const desde = Date.parse(String(cambio.effective_at));
        ciclosDentro = ciclos.value.payments.filter((p) =>
          p.canonicalStatus === "approved"
          && p.providerPaymentId !== delta?.providerPaymentId
          && p.dateApproved !== null
          && Date.parse(p.dateApproved) > desde).length;
      }
    }
    autorizacion = {
      providerSubscriptionId: preapproval,
      status: auth ? str(auth.status) : null,
      observedAmountMinor: importe,
      observedCurrency: monedaAuth,
    };
  }

  // ── el importe recurrente que Extra debe dejar puesto ─────────────────────
  //
  // Se DERIVA de la fila del cambio, y el impuesto se lo pregunta a la única
  // autoridad de redondeo que tiene el dominio. Reimplementar aquí ese redondeo
  // sería una segunda aritmética fiscal.
  const base = Number(cambio.target_full_base);
  const { data: impuestoRaw } = await admin.rpc("billing_tax_amount", {
    p_base: base, p_rate_basis_points: Number(cambio.tax_rate_basis_points),
  });
  const impuesto = num(impuestoRaw);
  if (impuesto === null) return fin("blocked", "TAX_UNRESOLVED");
  const objetivo = recurringTotalFor(base, impuesto);

  // ── decidir, hacer, y volver a decidir ────────────────────────────────────
  let estado = String(cambio.status);
  let intentadoElCambio = false;

  for (let vuelta = 0; vuelta < 3; vuelta += 1) {
    const paso = decideUpgradeStep({
      changeStatus: estado,
      expectedTotalAmount: Number(intento.expected_total_amount),
      expectedCurrency: String(intento.expected_currency),
      effectiveAt: String(cambio.effective_at),
      periodEnd: String(cambio.period_end),
      now: new Date().toISOString(),
      renewalMode: modo,
      configuredEnvironment: entorno,
      deltaPayment: delta,
      providerCyclesInsideWindow: ciclosDentro,
      authorization: autorizacion,
      targetRecurringAmountMinor: objetivo,
      authorizationUpdateAttempted: intentadoElCambio,
    });
    pasos.push(paso.kind + (("reason" in paso) ? `:${paso.reason}` : ""));

    if (paso.kind === "done") return fin("not_applicable", paso.reason);
    if (paso.kind === "wait") return fin("waiting", paso.reason);

    if (paso.kind === "abandon") {
      await admin.rpc("billing_settle_upgrade_payment", {
        p_intent_id: String(intento.id), p_provider: MP,
        p_provider_payment_id: delta?.providerPaymentId ?? null,
        p_outcome: "declined", p_amount: null, p_currency: null,
        p_live_mode: entorno === "live", p_failure_reason: paso.reason,
      });
      return fin("abandoned", paso.reason);
    }

    if (paso.kind === "update_authorization") {
      // Se anota el cobro ANTES de tocar nada fuera. Si lo de después falla,
      // esta anotación es lo único que permite saber qué hay que devolver.
      if (delta) {
        await admin.rpc("billing_observe_upgrade_delta", {
          p_change_id: changeId, p_provider_payment_id: delta.providerPaymentId,
        });
      }
      const id = autorizacion?.providerSubscriptionId;
      if (!id) { intentadoElCambio = true; continue; }
      const puesto = await proveedor.updateRecurringAmount(
        id, paso.amountMinor, paso.currency);
      intentadoElCambio = true;
      // NO se confía en el 200. Se vuelve a preguntar, siempre, salga como
      // salga: una petición que falló puede haberse aplicado igual.
      const detalle = await proveedor.getSubscriptionDetail(id);
      if (detalle.ok) {
        autorizacion = {
          ...autorizacion!,
          observedAmountMinor: detalle.value.amount === null
            ? null : providerAmountToMinor(detalle.value.amount, detalle.value.currency),
          observedCurrency: detalle.value.currency,
        };
      } else if (!puesto.ok) {
        // Ni se pudo poner ni se puede comprobar. No se concede nada.
        autorizacion = { ...autorizacion!, observedAmountMinor: null };
      }
      continue;
    }

    if (paso.kind === "settle") {
      if (!delta) return fin("waiting", "NO_PAYMENT_OBSERVED");
      await admin.rpc("billing_observe_upgrade_delta", {
        p_change_id: changeId, p_provider_payment_id: delta.providerPaymentId,
      });
      const { data: r } = await admin.rpc("billing_settle_upgrade_payment", {
        p_intent_id: String(intento.id), p_provider: MP,
        p_provider_payment_id: delta.providerPaymentId,
        p_outcome: "approved", p_amount: delta.amountMinor, p_currency: delta.currency,
        p_live_mode: entorno === "live", p_failure_reason: null,
      });
      const salida = str((r as Fila | null)?.outcome) ?? "unknown";
      if (salida === "upgraded" || salida === "already_settled") {
        return fin("upgraded", salida);
      }
      // La liquidación se negó después de que el dinero entrara. Hay que
      // devolverlo: no hay ningún otro final honesto.
      estado = "submitted";
      const abierta = await abrirCompensacion(changeId, `SETTLE_${salida.toUpperCase()}`);
      if (!abierta) return fin("blocked", `SETTLE_REFUSED:${salida}`);
      estado = "compensation_required";
      continue;
    }

    // paso.kind === "compensate"
    if (estado !== "compensation_required") {
      if (delta) {
        await admin.rpc("billing_observe_upgrade_delta", {
          p_change_id: changeId, p_provider_payment_id: delta.providerPaymentId,
        });
      }
      if (!await abrirCompensacion(changeId, paso.reason)) {
        return fin("blocked", `COMPENSATION_NOT_OPENED:${paso.reason}`);
      }
      estado = "compensation_required";
    }
    return await devolver(changeId, pasos);
  }

  return fin("blocked", "STEP_LIMIT");
}

/** Abrir la compensación en la base. Devuelve si quedó abierta. */
async function abrirCompensacion(changeId: string, motivo: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("billing_open_upgrade_compensation", {
    p_change_id: changeId, p_reason: motivo,
  });
  const s = str((data as Fila | null)?.status);
  return s === "opened" || s === "already_open";
}

/**
 * Devolver el dinero.
 *
 * PRIMERO se pregunta si ya está devuelto. Una petición que salió y cuya
 * respuesta se perdió deja un reembolso existiendo allí sin constar aquí, y
 * pedir otro sería devolver dos veces. Después se pide, con la llave derivada
 * del cambio, que es lo que hace que reintentar sea seguro.
 */
async function devolver(
  changeId: string, pasos: string[]
): Promise<UpgradeReconcileResult> {
  const admin = createAdminClient();
  const proveedor = mercadoPagoFromEnv();

  const { data: cRaw } = await admin.from("billing_subscription_changes")
    .select("delta_provider_payment_id, refund_idempotency_key, total_amount, charge_currency")
    .eq("id", changeId).maybeSingle();
  const c = cRaw as Fila | null;
  const pagoId = c ? str(c.delta_provider_payment_id) : null;
  const llave = c ? str(c.refund_idempotency_key) : null;
  if (!pagoId || !llave) {
    return { outcome: "compensation_required", reason: "NO_DELTA_PAYMENT",
             changeId, steps: pasos };
  }

  const anteriores = await proveedor.listRefunds(pagoId);
  if (anteriores.ok && anteriores.value.refunds.length > 0) {
    const ya = anteriores.value.refunds[0];
    pasos.push("refund:already_at_provider");
    return await anotar(changeId, ya.refundId, providerAmountToMinor(ya.amount, ya.currency),
                        ya.currency ?? String(c?.charge_currency ?? ""), pasos);
  }

  const hecho = await proveedor.refundPayment(pagoId, llave);
  if (!hecho.ok) {
    await admin.rpc("billing_record_upgrade_refund_failure", {
      p_change_id: changeId,
      p_reason: `${hecho.failure}:${hecho.message}`.slice(0, 200),
    });
    pasos.push(`refund:failed:${hecho.failure}`);
    return { outcome: "compensation_required", reason: `REFUND_FAILED:${hecho.failure}`,
             changeId, steps: pasos };
  }
  pasos.push("refund:done");
  return await anotar(changeId, hecho.value.refundId,
                      providerAmountToMinor(hecho.value.amount, hecho.value.currency),
                      hecho.value.currency ?? String(c?.charge_currency ?? ""), pasos);
}

async function anotar(
  changeId: string, refundId: string, amount: number | null, currency: string,
  pasos: string[]
): Promise<UpgradeReconcileResult> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("billing_record_upgrade_refund", {
    p_change_id: changeId, p_provider_refund_id: refundId,
    p_amount: amount, p_currency: currency,
  });
  const s = str((data as Fila | null)?.status) ?? "unknown";
  if (s === "refunded" || s === "already_refunded") {
    return { outcome: "refunded", reason: s, changeId, steps: pasos };
  }
  return { outcome: "compensation_required", reason: `REFUND_NOT_RECORDED:${s}`,
           changeId, steps: pasos };
}
