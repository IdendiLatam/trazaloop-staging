import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { mercadoPagoFromEnv } from "@/lib/billing/providers/mercadopago";
import { buildUpgradeReference } from "@/lib/billing/upgrade-reference";

/**
 * Trazaloop · BILLING-EXTRA-01B · Sacar a una empresa de una subida atascada.
 *
 *
 * EL AGUJERO QUE CIERRA
 *
 * `billing_open_upgrade_intent` pone el cambio en «enviada». Desde ahí,
 * `billing_cancel_upgrade` contesta «no se puede retirar» y
 * `billing_quote_upgrade` contesta «ya hay una subida pendiente». Si el
 * proveedor enmudece, la empresa se queda sin poder volver a subir de plan
 * nunca, y hasta hoy la única salida era una escritura directa con
 * `service_role`. Eso no es un mecanismo de producto: es no tener ninguno.
 *
 *
 * EL ORDEN IMPORTA MÁS QUE LA FUNCIÓN
 *
 * Primero se PREGUNTA al proveedor, y sólo después se decide. Un desatasco que
 * suelta el cambio sin mirar si hubo cobro es peor que el atasco: el atasco
 * molesta, borrar un cobro real cuesta dinero a alguien.
 *
 * Por eso la decisión final vive en la base —`billing_resolve_stuck_upgrade`—,
 * que se NIEGA a liberar cuando la prueba dice que hay un pago aprobado. Este
 * fichero sólo recoge la prueba. Si mañana alguien llamara a la función de la
 * base con una prueba inventada, seguiría sin poder soltar un cobro.
 */

export type StuckEvidence =
  /** El proveedor no conoce ningún pago con esa referencia. */
  | "no_payment"
  /** Lo hay, y no entró: rechazado o cancelado. */
  | "payment_failed"
  /** Lo hay y entró. Esto NO se libera: se compensa. */
  | "payment_approved"
  /** No se pudo preguntar. Que no se sepa no es una razón para soltar. */
  | "provider_unknown";

export type StuckUpgradeEvidence = {
  evidence: StuckEvidence;
  providerPaymentId: string | null;
  /** Qué se miró, para que quien lo autorice vea lo mismo que se decidió. */
  detail: string;
};

/**
 * Preguntarle al proveedor qué pasó con el cobro de esta subida.
 *
 * No escribe nada. Sólo mira.
 */
export async function gatherStuckUpgradeEvidence(
  changeId: string
): Promise<StuckUpgradeEvidence> {
  const admin = createAdminClient();
  const { data: intentoRaw } = await admin.from("billing_checkout_intents")
    .select("id, provider").eq("subscription_change_id", changeId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const intento = intentoRaw as { id: string; provider: string } | null;
  if (!intento) {
    // Sin intento no llegó a salir nada al proveedor. Nadie pudo pagar.
    return { evidence: "no_payment", providerPaymentId: null,
             detail: "Sin intento de cobro: la subida nunca salió al proveedor." };
  }
  if (intento.provider !== "mercadopago") {
    // El carril de Wompi tiene su propio desenlace por evento firmado. Aquí no
    // se adivina por él.
    return { evidence: "provider_unknown", providerPaymentId: null,
             detail: `Intento del proveedor «${intento.provider}»: no se consulta desde aquí.` };
  }

  const proveedor = mercadoPagoFromEnv();
  if (!proveedor.identity.ok) {
    return { evidence: "provider_unknown", providerPaymentId: null,
             detail: "Mercado Pago no está configurado en este despliegue." };
  }
  const r = await proveedor.searchPaymentsByReference(
    buildUpgradeReference(intento.id));
  if (!r.ok) {
    return { evidence: "provider_unknown", providerPaymentId: null,
             detail: `No se pudo consultar al proveedor: ${r.failure}.` };
  }
  const pagos = r.value.payments;
  if (pagos.length === 0) {
    return { evidence: "no_payment", providerPaymentId: null,
             detail: "El proveedor no conoce ningún cobro con esta referencia." };
  }
  const aprobado = pagos.find((p) => p.canonicalStatus === "approved");
  if (aprobado) {
    return { evidence: "payment_approved",
             providerPaymentId: aprobado.providerPaymentId,
             detail: "Hay un cobro aprobado: esto no se libera, se devuelve." };
  }
  // Vocabulario CANÓNICO del dominio, no el del proveedor: `declined` y
  // `failed`. Y `refunded`, que es dinero que entró y ya salió.
  const muertos = pagos.every((p) => p.canonicalStatus === "declined"
                                  || p.canonicalStatus === "failed"
                                  || p.canonicalStatus === "refunded");
  if (muertos) {
    return { evidence: "payment_failed", providerPaymentId: null,
             detail: `${pagos.length} cobro(s) y ninguno entró.` };
  }
  // Ni aprobado ni descartado: en curso. Soltar ahora sería soltar sobre algo
  // que todavía puede convertirse en dinero.
  return { evidence: "provider_unknown", providerPaymentId: null,
           detail: "Hay un cobro en curso: todavía puede entrar." };
}

export type StuckResolution = {
  ok: boolean;
  status: string;
  evidence: StuckEvidence;
  detail: string;
};

/**
 * Recoger la prueba y resolver.
 *
 * La llamada a la base va con la SESIÓN de quien lo pide, no con el cliente
 * administrativo: así `is_platform_superadmin()` y `auth.uid()` significan algo
 * y la auditoría guarda a una persona, no a un servicio.
 */
export async function resolveStuckUpgrade(changeId: string): Promise<StuckResolution> {
  const prueba = await gatherStuckUpgradeEvidence(changeId);
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_resolve_stuck_upgrade", {
    p_change_id: changeId,
    p_evidence: prueba.evidence,
    p_provider_payment_id: prueba.providerPaymentId,
    p_reason: prueba.detail.slice(0, 200),
  });
  if (error) {
    return { ok: false, status: error.message, evidence: prueba.evidence,
             detail: prueba.detail };
  }
  let estado = String((data as Record<string, unknown> | null)?.status ?? "unknown");

  // BILLING-EXTRA-01B.1 · Y A PARTIR DE AQUÍ, LA MISMA SAGA.
  //
  // Un `submitted` con cobro aprobado y la autorización ya cambiada a Extra no
  // se arregla devolviendo el dinero: hay que devolver también el importe
  // recurrente. Esa secuencia ya existe y está probada; escribirla otra vez
  // aquí sería un segundo algoritmo de compensación, y dos algoritmos que
  // mueven dinero acaban divergiendo.
  //
  // Así que esta herramienta hace lo único que la saga no puede hacer sola
  // —decidir, con una persona detrás, que un cobro aprobado se compensa— y
  // luego le cede el turno.
  if (estado === "compensation_required") {
    const { reconcileUpgrade } = await import("@/lib/db/upgrade-reconcile");
    const r = await reconcileUpgrade(changeId);
    estado = r.outcome === "refunded" ? "refunded" : estado;
    return {
      ok: r.outcome === "refunded" || r.outcome === "compensation_required",
      status: `${estado}:${r.reason}`, evidence: prueba.evidence,
      detail: prueba.detail,
    };
  }

  return {
    // `still_uncertain` NO es un éxito: es que sigue sin saberse.
    ok: estado === "released" || estado === "already_resolved",
    status: estado, evidence: prueba.evidence, detail: prueba.detail,
  };
}

/**
 * Trazaloop · BILLING-EXTRA-01C.3 · COMPLETAR UNA SUBIDA YA PAGADA.
 *
 *
 * POR QUÉ ESTO NO ES «CAMBIAR EL PLAN A MANO»
 *
 * Alguien de plataforma no toca `plan_code`. Lo que hace es DECIDIR que un
 * cobro observado es legítimo y que la subida debe seguir adelante; a partir de
 * ahí manda exactamente la misma lógica que habría mandado sola: la saga
 * canónica, con todas sus comprobaciones —importe congelado, moneda, identidad
 * del vendedor, entorno, periodo vigente, autorización coherente— y la misma
 * liquidación de 0181, que sigue siendo el único camino de un pago a Extra.
 *
 * La decisión de una persona no es un salvoconducto: si el importe no cuadra o
 * la autorización recurrente no está donde tiene que estar, esto NO completa
 * nada por mucho que se pulse.
 *
 *
 * POR QUÉ HACÍA FALTA
 *
 * Porque devolver el dinero automáticamente resultó ser la política equivocada.
 * Quien pagó una subida quiere la subida, no su dinero de vuelta; y en Sandbox
 * el proveedor ni siquiera admite devoluciones. Desde 01C.3 el camino
 * automático, cuando no puede completar, PARA y avisa — y esto es lo que
 * permite terminar después, cuando el mundo vuelva a ser coherente.
 */
export type CompleteUpgradeResult = {
  ok: boolean;
  outcome: string;
  reason: string;
  evidence: StuckEvidence;
  detail: string;
};

export async function completePaidUpgrade(
  changeId: string
): Promise<CompleteUpgradeResult> {
  // 1 · La prueba, primero. Completar una subida sin mirar si hay un cobro
  //     aprobado sería conceder Extra gratis.
  const prueba = await gatherStuckUpgradeEvidence(changeId);
  if (prueba.evidence !== "payment_approved") {
    return { ok: false, outcome: "no_approved_payment", evidence: prueba.evidence,
             reason: "NO_APPROVED_PAYMENT", detail: prueba.detail };
  }

  // 2 · Y a partir de aquí, la saga canónica. No hay un segundo camino a Extra.
  const { reconcileUpgrade } = await import("@/lib/db/upgrade-reconcile");
  const r = await reconcileUpgrade(changeId, "complete");
  return {
    ok: r.outcome === "upgraded",
    outcome: r.outcome, reason: r.reason,
    evidence: prueba.evidence, detail: prueba.detail,
  };
}

/** Lo que una subida atascada le enseña a quien opera. Sin secretos. */
export type PendingUpgradeRow = {
  changeId: string;
  organizationId: string;
  organizationName: string;
  status: string;
  fromPlanCode: string;
  toPlanCode: string;
  totalAmount: number;
  currency: string;
  renewalMode: string | null;
  hasObservedPayment: boolean;
  compensationReason: string | null;
  providerRecurringExpected: number | null;
  providerRecurringObserved: number | null;
  createdAt: string;
};

/**
 * Las subidas que necesitan que alguien mire.
 *
 * Son las que tienen dinero observado y no han terminado. Una en `pending` o
 * `submitted` sin cobro todavía no necesita a nadie: está esperando a que
 * alguien pague, y eso no es una incidencia.
 */
export async function listUpgradesNeedingAction(): Promise<PendingUpgradeRow[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_subscription_changes")
    .select("id, organization_id, status, from_plan_code, to_plan_code, "
      + "total_amount, charge_currency, delta_provider_payment_id, "
      + "compensation_reason, provider_recurring_amount_before, "
      + "provider_recurring_amount_observed, subscription_id, created_at")
    .in("status", ["compensation_required", "failed", "submitted"])
    .not("delta_provider_payment_id", "is", null)
    .order("created_at", { ascending: false }).limit(50);
  const filas = (data ?? []) as unknown as Array<Record<string, unknown>>;
  if (filas.length === 0) return [];

  const orgIds = [...new Set(filas.map((f) => String(f.organization_id)))];
  const { data: orgs } = await admin.from("organizations")
    .select("id, name").in("id", orgIds);
  const nombre = new Map(((orgs ?? []) as Array<{ id: string; name: string }>)
    .map((o) => [o.id, o.name]));
  const subIds = [...new Set(filas.map((f) => String(f.subscription_id)))];
  const { data: subs } = await admin.from("billing_subscriptions")
    .select("id, renewal_mode").in("id", subIds);
  const modo = new Map(((subs ?? []) as Array<{ id: string; renewal_mode: string }>)
    .map((x) => [x.id, x.renewal_mode]));

  return filas.map((f) => ({
    changeId: String(f.id),
    organizationId: String(f.organization_id),
    organizationName: nombre.get(String(f.organization_id)) ?? "—",
    status: String(f.status),
    fromPlanCode: String(f.from_plan_code),
    toPlanCode: String(f.to_plan_code),
    totalAmount: Number(f.total_amount),
    currency: String(f.charge_currency),
    renewalMode: modo.get(String(f.subscription_id)) ?? null,
    hasObservedPayment: f.delta_provider_payment_id !== null,
    compensationReason: f.compensation_reason === null
      ? null : String(f.compensation_reason),
    providerRecurringExpected: f.provider_recurring_amount_before === null
      ? null : Number(f.provider_recurring_amount_before),
    providerRecurringObserved: f.provider_recurring_amount_observed === null
      ? null : Number(f.provider_recurring_amount_observed),
    createdAt: String(f.created_at),
  }));
}
