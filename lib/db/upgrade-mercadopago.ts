import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mercadoPagoFromEnv } from "@/lib/billing/providers/mercadopago";
import { providerAmountToMinor } from "@/lib/billing/mercadopago/mapping";
import { buildUpgradeReference } from "@/lib/billing/upgrade-reference";
import {
  decideUpgradeStep, recurringTotalFor, classifySettlementOutcome,
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

/** Lo único que hace falta de un cliente de Supabase: poder llamar una RPC. */
type SupabaseLike = {
  rpc: (fn: string, args: Record<string, unknown>) =>
    PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
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
  /**
   * La sesión de quien sube de plan.
   *
   * `billing_open_upgrade_intent` comprueba `auth.uid()` y el papel de
   * administrador: abrir el cobro de una subida es un acto de alguien, no de un
   * servicio. La primera versión de esto llamaba con el cliente administrativo
   * y la base contestaba `AUTH_REQUIRED` — lo encontró la primera ejecución
   * real contra Sandbox, que es justo para lo que servía.
   */
  supabase: SupabaseLike;
}): Promise<UpgradeCheckoutResult> {
  const proveedor = mercadoPagoFromEnv();
  if (!proveedor.identity.ok) {
    return { ok: false, code: "PROVIDER_NOT_CONFIGURED" };
  }
  const entorno = proveedor.identity.value.environment;

  const admin = createAdminClient();
  const abierto = await input.supabase.rpc("billing_open_upgrade_intent", {
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
  // Se DERIVA de la fila del cambio: `target_full_base` es la base del periodo
  // COMPLETO del plan DESTINO —en Full→Extra, la de Extra— y el impuesto se lo
  // pregunta a la única autoridad de redondeo que tiene el dominio.
  // Reimplementar aquí ese redondeo sería una segunda aritmética fiscal.
  const base = Number(cambio.target_full_base);
  const { data: impuestoRaw } = await admin.rpc("billing_tax_amount", {
    p_base: base, p_rate_basis_points: Number(cambio.tax_rate_basis_points),
  });
  const impuesto = num(impuestoRaw);
  if (impuesto === null) return fin("blocked", "TAX_UNRESOLVED");
  const objetivo = recurringTotalFor(base, impuesto);

  // ── y a qué importe habría que volver si esto no sale ─────────────────────
  //
  // Lo responde la base: lo observado antes de tocar nada, o la reconstrucción
  // desde lo congelado en la propia transición. Nunca el catálogo de hoy.
  const { data: destinoRaw } = await admin.rpc("billing_upgrade_restore_target",
    { p_change_id: changeId });
  const destino = (destinoRaw ?? {}) as Fila;
  const restaurarA = num(destino.amount);

  /** Leer la autorización y DEJAR ANOTADO lo que dijo. */
  const releerAutorizacion = async (id: string) => {
    const d = await proveedor.getSubscriptionDetail(id);
    const importe = d.ok && d.value.amount !== null
      ? providerAmountToMinor(d.value.amount, d.value.currency) : null;
    const moneda = d.ok ? d.value.currency : null;
    await admin.rpc("billing_note_upgrade_recurring_observed", {
      p_change_id: changeId, p_amount: importe, p_currency: moneda });
    autorizacion = { ...(autorizacion ?? {
      providerSubscriptionId: id, status: null,
      observedAmountMinor: null, observedCurrency: null }),
      observedAmountMinor: importe, observedCurrency: moneda };
    return d.ok;
  };

  /** Releer la fila: la autoridad interna manda sobre cualquier respuesta. */
  const releerCambio = async () => {
    const { data } = await admin.from("billing_subscription_changes")
      .select("status, provider_recurring_amount_before, provider_recurring_restored_at")
      .eq("id", changeId).maybeSingle();
    return (data ?? {}) as Fila;
  };

  // ── decidir, hacer, y volver a decidir ────────────────────────────────────
  let fila = await releerCambio();
  let estado = String(fila.status ?? cambio.status);
  let anteriorRecurrente = num(fila.provider_recurring_amount_before);
  let restaurada = fila.provider_recurring_restored_at !== null
                && fila.provider_recurring_restored_at !== undefined;
  let intentadoElCambio = false;
  let intentadaLaReversion = false;

  for (let vuelta = 0; vuelta < 6; vuelta += 1) {
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
      providerRecurringAmountBefore: anteriorRecurrente,
      providerRestored: restaurada,
      restoreTargetAmount: restaurarA,
      authorizationRestoreAttempted: intentadaLaReversion,
    });
    pasos.push(paso.kind + (("reason" in paso) ? `:${paso.reason}` : ""));

    if (paso.kind === "done") return fin("not_applicable", paso.reason);
    if (paso.kind === "wait") return fin("waiting", paso.reason);
    if (paso.kind === "hold") return fin("compensation_required", paso.reason);

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

      // Y se anota A DÓNDE VOLVER, también antes. Después del cambio, lo que se
      // lea ya podría ser lo que pusimos nosotros.
      const actual = autorizacion?.observedAmountMinor ?? null;
      if (actual !== null) {
        const { data: n } = await admin.rpc("billing_note_upgrade_recurring_before", {
          p_change_id: changeId, p_amount: actual,
          p_currency: autorizacion?.observedCurrency
            ?? String(intento.expected_currency) });
        anteriorRecurrente = num((n as Fila | null)?.amount) ?? actual;
      }

      await proveedor.updateRecurringAmount(id, paso.amountMinor, paso.currency);
      intentadoElCambio = true;
      // NO se confía en la respuesta. Se vuelve a preguntar SIEMPRE: una
      // petición que falló puede haberse aplicado igual.
      await releerAutorizacion(id);
      continue;
    }

    if (paso.kind === "restore_authorization") {
      const id = autorizacion?.providerSubscriptionId;
      if (!id) return fin("compensation_required", "RESTORE_WITHOUT_AUTHORIZATION");
      await proveedor.updateRecurringAmount(
        id, paso.amountMinor, paso.currency);
      intentadaLaReversion = true;
      // Igual que arriba, y por lo mismo: el 200 no prueba nada y el error
      // tampoco. Manda lo que el proveedor diga después.
      await releerAutorizacion(id);
      const f2 = await releerCambio();
      restaurada = f2.provider_recurring_restored_at !== null
                && f2.provider_recurring_restored_at !== undefined;
      continue;
    }

    if (paso.kind === "settle") {
      if (!delta) return fin("waiting", "NO_PAYMENT_OBSERVED");
      await admin.rpc("billing_observe_upgrade_delta", {
        p_change_id: changeId, p_provider_payment_id: delta.providerPaymentId,
      });
      const { data: r, error } = await admin.rpc("billing_settle_upgrade_payment", {
        p_intent_id: String(intento.id), p_provider: MP,
        p_provider_payment_id: delta.providerPaymentId,
        p_outcome: "approved", p_amount: delta.amountMinor, p_currency: delta.currency,
        p_live_mode: entorno === "live", p_failure_reason: null,
      });
      const salida = error ? null : (str((r as Fila | null)?.outcome) ?? null);
      const veredicto = classifySettlementOutcome(salida);
      pasos.push(`settle:${salida ?? "no_response"}:${veredicto}`);

      if (veredicto === "settled") return fin("upgraded", salida ?? "settled");

      // LA AUTORIDAD INTERNA MANDA SOBRE LA RESPUESTA. Una respuesta que no
      // llegó no significa que no se aplicara, y compensar una subida que sí se
      // aplicó sería quitarle a alguien un plan que pagó.
      fila = await releerCambio();
      if (String(fila.status) === "settled") {
        return fin("upgraded", "SETTLED_CONFIRMED_BY_STATE");
      }
      if (veredicto === "retry") {
        // Se queda donde está, bloqueando el barrido, y se vuelve a intentar.
        // No se compensa por un tiempo de espera.
        return fin("waiting", `SETTLE_RETRYABLE:${salida ?? "no_response"}`);
      }
      // Definitivo: el dinero entró y esta subida no puede aplicarse nunca.
      estado = "submitted";
      if (!await abrirCompensacion(changeId, `SETTLE_${(salida ?? "unknown").toUpperCase()}`)) {
        return fin("blocked", `SETTLE_REFUSED:${salida}`);
      }
      estado = "compensation_required";
      continue;
    }

    if (paso.kind === "compensate") {
      if (delta) {
        await admin.rpc("billing_observe_upgrade_delta", {
          p_change_id: changeId, p_provider_payment_id: delta.providerPaymentId,
        });
      }
      if (!await abrirCompensacion(changeId, paso.reason)) {
        return fin("blocked", `COMPENSATION_NOT_OPENED:${paso.reason}`);
      }
      estado = "compensation_required";
      fila = await releerCambio();
      anteriorRecurrente = num(fila.provider_recurring_amount_before);
      restaurada = fila.provider_recurring_restored_at !== null
                && fila.provider_recurring_restored_at !== undefined;
      continue;
    }

    // paso.kind === "refund"
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
