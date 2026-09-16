/**
 * Trazaloop · MP-REC-01 · La conciliación de una recurrencia, en un solo sitio.
 *
 * POR QUÉ ESTA FUNCIÓN ES LA FUENTE DE VERDAD Y EL WEBHOOK NO
 *
 * Mercado Pago confirmó que la aplicación automática de las cuentas de prueba
 * tiene `notifications_callback_url = null`: en sandbox NO HAY webhook, y no se
 * puede configurar desde la cuenta principal. Si la recurrencia dependiera del
 * aviso, no se podría probar.
 *
 * Pero el motivo de fondo es mejor que esa circunstancia. Los cobros futuros de
 * una suscripción ocurren cuando nadie está mirando: ni el cliente navegando,
 * ni nosotros desplegando. Un modelo en el que el derecho se concede porque
 * llegó un aviso tiene dos fallos conocidos —el aviso que no llega, y el aviso
 * que llega y no es nuestro— y los dos terminan igual: alguien pagó y no tiene
 * plan, o alguien tiene plan y no pagó.
 *
 * Así que el reparto es:
 *
 *     webhook        = SEÑAL. «Ve a mirar, puede que haya algo».
 *     conciliación   = VERDAD. Relee al proveedor y decide.
 *
 * Esta función es la segunda. El retorno del navegador, el aviso del proveedor
 * y el barrido programado llaman todos AQUÍ, y ninguno de los tres concede nada
 * por su cuenta.
 *
 * TODO ENTRA POR PARÁMETRO
 *
 * Las dependencias se inyectan —leer al proveedor, listar sus cobros, saldar un
 * ciclo, anotar la observación— por una razón práctica: los casos que hay que
 * comprobar son justo los que cuesta dinero o tiempo provocar en el sandbox.
 * Un segundo ciclo, un cobro rechazado, un cobrador que no es el nuestro. Con
 * dependencias inyectadas, los tres se ejercitan en milisegundos y sin red.
 *
 * NO DUPLICA LA LIQUIDACIÓN FINANCIERA
 *
 * El periodo, el pago canónico y la proyección de módulos los sigue haciendo
 * `billing_reconcile_provider_cycle` (0186), que ya es idempotente por el
 * índice único del ciclo externo. Aquí NO se calcula ninguna fecha de periodo:
 * la obligación de una recurrencia la fija el proveedor, y su sitio en la
 * historia sale de la fecha económica del cobro, no del orden en que lleguen
 * los avisos.
 */
import type { ProviderResult } from "@/lib/billing/provider";
import {
  decideRecurringSettlements,
  type ObservedPayment, type RecurringExpectation,
  type RecurringRejection, type RecurringRefusal,
} from "@/lib/billing/recurring/verification";
import { mapSubscriptionStatus } from "@/lib/billing/mercadopago/mapping";

/**
 * El cobro observado, más su FECHA ECONÓMICA. La fecha no está en el tipo del
 * pago único porque allí no hacía falta: un cobro único no ordena nada. Aquí sí:
 * es lo que da su sitio al ciclo en la historia.
 */
export type ObservedRecurringPayment = ObservedPayment & {
  cycleAt: string | null;
};

/** La suscripción del proveedor, releída. */
export type ObservedProviderSubscription = {
  providerStatus: string | null;
  externalReference: string | null;
  collectorId: number | null;
  applicationId: number | null;
  nextPaymentDate: string | null;
};

/** Lo que devuelve la primitiva de la base, reducido a lo que aquí importa. */
export type CycleOutcome = { outcome: string; period_id?: string | null;
                             payment_id?: string | null };

/**
 * Las respuestas de la base que significan «este ciclo ya estaba reconocido».
 * Son tres porque hay tres sitios donde se puede detectar: el ciclo externo
 * (`already_reconciled`, de 0186), el periodo (`period_already_settled`) y el
 * pago (`already_settled`). Las tres son idempotencia funcionando.
 */
const YA_ESTABA = new Set(["already_reconciled", "period_already_settled",
                           "already_settled"]);

export type RecurringReconcileDeps = {
  /** Relee la preapproval en el proveedor. */
  readSubscription(providerSubscriptionId: string):
    Promise<ProviderResult<ObservedProviderSubscription>>;
  /** Descubre los cobros de esa contratación por su referencia opaca. */
  listPayments(externalReference: string):
    Promise<ProviderResult<readonly ObservedRecurringPayment[]>>;
  /** Salda UN ciclo externo. Envuelve `billing_reconcile_provider_cycle`. */
  settleCycle(input: {
    providerSubscriptionId: string;
    providerPaymentId: string;
    cycleAt: string;
    amountMinor: number;
    currency: string;
    liveMode: boolean;
  }): Promise<CycleOutcome>;
  /** Anota lo observado en la autorización. Nunca concede nada. */
  recordObservation(input: {
    subscriptionId: string;
    providerStatus: string | null;
    authorized: boolean;
    observedCollectorId: number | null;
    reconciledAt: string;
  }): Promise<void>;
  /** El reloj, inyectado para que las pruebas no dependan de la hora. */
  now(): Date;
};

export type RecurringReconcileResult = {
  ok: boolean;
  /** Por qué no se pudo ni empezar. */
  blocked: RecurringRefusal | "PROVIDER_UNREACHABLE"
           | "SUBSCRIPTION_REFERENCE_MISMATCH" | "COLLECTOR_MISMATCH" | null;
  /** La palabra cruda del proveedor y su traducción. */
  providerStatus: string | null;
  canonicalStatus: string | null;
  /** ¿El comprador ya autorizó? Autorizado NO es pagado. */
  authorized: boolean;
  /** Ciclos reconocidos AHORA. Cero es un resultado normal, no un fallo. */
  settledNow: number;
  /** Ciclos que la base ya tenía. La prueba de que repetir no hace nada. */
  alreadyReconciled: number;
  /** Cobros nuevos descartados, con su motivo. */
  rejected: RecurringRejection[];
  /** Cobros que esta conciliación no volvió a mirar. */
  alreadySeen: number;
  /** Lo que devolvió la base por cada ciclo, para poder auditar. */
  outcomes: string[];
};

/**
 * Reconcilia una recurrencia contra el proveedor.
 *
 * El orden no es casual:
 *
 *   1. Releer la suscripción. Si el proveedor no responde no se concluye NADA:
 *      «no pude mirar» y «no hay nada» son noticias distintas, y confundirlas
 *      es cómo se retira un plan que estaba pagado.
 *   2. Comprobar que ese objeto es NUESTRO —referencia y cobrador— antes de
 *      mirar un solo cobro.
 *   3. Anotar lo observado. Pase lo que pase después, queda constancia de que
 *      se miró y de qué se vio.
 *   4. Descubrir cobros, decidir cuáles son legítimos, y saldar los nuevos.
 */
export async function reconcileRecurringSubscription(
  expectation: RecurringExpectation,
  deps: RecurringReconcileDeps
): Promise<RecurringReconcileResult> {
  const vacio = (blocked: RecurringReconcileResult["blocked"],
                 extra: Partial<RecurringReconcileResult> = {}):
    RecurringReconcileResult => ({
      ok: false, blocked, providerStatus: null, canonicalStatus: null,
      authorized: false, settledNow: 0, alreadyReconciled: 0,
      rejected: [], alreadySeen: 0, outcomes: [], ...extra,
    });

  // --- 1 · Releer al proveedor ---------------------------------------------
  const sub = await deps.readSubscription(expectation.providerSubscriptionId);
  if (!sub.ok) return vacio("PROVIDER_UNREACHABLE");

  const providerStatus = sub.value.providerStatus;
  const canonicalStatus = mapSubscriptionStatus(providerStatus);
  // `authorized` del proveedor significa que el comprador dio su permiso. NO
  // significa que haya pagado: el primer cargo real llega después, y por eso
  // `mapping.ts` lo traduce a `pending` y no a `active`.
  const authorized = (providerStatus ?? "").trim().toLowerCase() === "authorized";

  // --- 2 · ¿Este objeto es nuestro? ----------------------------------------
  //
  // Va antes de mirar cobros y antes de anotar nada. Si la referencia no es la
  // nuestra, lo que haya dentro no nos incumbe.
  if ((sub.value.externalReference ?? "") !== expectation.externalReference) {
    return vacio("SUBSCRIPTION_REFERENCE_MISMATCH",
      { providerStatus, canonicalStatus });
  }
  if (sub.value.collectorId !== null && expectation.expectedOwnerId !== null
      && sub.value.collectorId !== expectation.expectedOwnerId) {
    return vacio("COLLECTOR_MISMATCH", { providerStatus, canonicalStatus });
  }

  // --- 3 · Dejar constancia de que se miró ---------------------------------
  const ahora = deps.now().toISOString();
  await deps.recordObservation({
    subscriptionId: expectation.subscriptionId,
    providerStatus, authorized,
    observedCollectorId: sub.value.collectorId,
    reconciledAt: ahora,
  });

  // --- 4 · Los cobros ------------------------------------------------------
  const pagos = await deps.listPayments(expectation.externalReference);
  if (!pagos.ok) {
    return vacio("PROVIDER_UNREACHABLE", { providerStatus, canonicalStatus, authorized });
  }

  const veredicto = decideRecurringSettlements(pagos.value, expectation);
  if (veredicto.blocked !== null) {
    return vacio(veredicto.blocked, {
      providerStatus, canonicalStatus, authorized,
      rejected: veredicto.rejected, alreadySeen: veredicto.alreadySeen });
  }

  const porFecha = new Map<string, string>();
  for (const p of pagos.value) {
    if (p.providerPaymentId) porFecha.set(p.providerPaymentId, p.cycleAt ?? "");
  }

  let settledNow = 0;
  let alreadyReconciled = 0;
  const outcomes: string[] = [];
  const rejected = [...veredicto.rejected];

  for (const s of veredicto.settle) {
    const cycleAt = porFecha.get(s.providerPaymentId) ?? "";
    // Sin fecha económica la base no puede situar el ciclo, y lo dice ella
    // misma con `cycle_date_missing`. Se corta antes para no gastar una
    // transacción en una llamada que ya se sabe que no puede concluir.
    if (cycleAt === "") {
      rejected.push({ providerPaymentId: s.providerPaymentId,
                      reason: "PAYMENT_NOT_APPROVED", observed: "(sin fecha de ciclo)" });
      continue;
    }
    const r = await deps.settleCycle({
      providerSubscriptionId: expectation.providerSubscriptionId,
      providerPaymentId: s.providerPaymentId,
      cycleAt, amountMinor: s.amountMinor, currency: s.currency,
      liveMode: s.liveMode,
    });
    outcomes.push(r.outcome);
    // EL VOCABULARIO ES EL DE LA BASE, no uno inventado aquí.
    //
    // `renewed` es lo que devuelve `billing_settle_period_payment` cuando de
    // verdad saldó el periodo. Las tres formas de «ya estaba» son respuestas
    // CORRECTAS a repetir, no errores: son exactamente lo que hace que
    // conciliar dos veces el mismo cobro no tenga ningún efecto adicional.
    //
    // Cualquier otra cosa —`reconciliation_mismatch`, `tax_unresolved`,
    // `environment_mismatch`…— no se cuenta como saldada ni como repetida. Se
    // queda en `outcomes` para que se pueda auditar, y el recuento no miente.
    if (r.outcome === "renewed") settledNow += 1;
    else if (YA_ESTABA.has(r.outcome)) alreadyReconciled += 1;
  }

  return {
    ok: true, blocked: null, providerStatus, canonicalStatus, authorized,
    settledNow, alreadyReconciled, rejected,
    alreadySeen: veredicto.alreadySeen, outcomes,
  };
}
