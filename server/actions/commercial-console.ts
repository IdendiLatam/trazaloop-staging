"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { createServerClient } from "@/lib/supabase/server";
import { finDelDiaEnZona } from "@/lib/domain/zona-horaria";
import { mensajeDeTransicion, SOLO_ADMINISTRACION } from "@/lib/domain/transicion-comercial";
import {
  parseUsdToMinor, USD_PARSE_MESSAGE,
} from "@/lib/domain/commercial-catalog";
import {
  listRenewalOperations, type RenewalOperationRow,
} from "@/lib/db/billing-operations";
import {
  listCommercialEvents,
  listOrganizationAssignments,
  listPlanRevisions,
  listRevisionLimits,
  type AssignmentRow,
  type CommercialEventRow,
  type PlanLimitRow,
  type PlanRevisionRow,
} from "@/lib/db/commercial-console";

/**
 * Trazaloop · PE-04B5 · La consola comercial de plataforma.
 *
 * QUIÉN PUEDE QUÉ
 *
 * Soporte LEE: necesita saber qué tiene contratada una empresa para atenderla.
 * Solo la administración de plataforma ESCRIBE: cambiar condiciones comerciales
 * o mover a una empresa de plan no es una tarea de atención al cliente, y la
 * base lo vuelve a comprobar por su cuenta —esto no es la barrera, es la
 * pantalla—.
 */
export type CommercialActionState = { error: string | null; success?: boolean };
const ok: CommercialActionState = { error: null, success: true };

async function exigirSuperadmin(): Promise<string | null> {
  const { isSuperadmin } = await requirePlatformStaff();
  return isSuperadmin ? null : SOLO_ADMINISTRACION;
}

export type PlanCatalogView = {
  revisions: PlanRevisionRow[];
  limitsByRevision: Record<string, PlanLimitRow[]>;
  canManage: boolean;
};

export async function getPlanCatalogAction(): Promise<PlanCatalogView> {
  const { isSuperadmin } = await requirePlatformStaff();
  const revisions = await listPlanRevisions();
  const limitsByRevision: Record<string, PlanLimitRow[]> = {};
  for (const r of revisions) {
    limitsByRevision[r.id] = await listRevisionLimits(r.id);
  }
  return { revisions, limitsByRevision, canManage: isSuperadmin };
}

export type OrganizationCommercialView = {
  assignments: AssignmentRow[];
  events: CommercialEventRow[];
  canManage: boolean;
};

export async function getOrganizationCommercialViewAction(
  organizationId: string
): Promise<OrganizationCommercialView> {
  const { isSuperadmin } = await requirePlatformStaff();
  const [assignments, events] = await Promise.all([
    listOrganizationAssignments(organizationId),
    listCommercialEvents(organizationId),
  ]);
  return { assignments, events, canManage: isSuperadmin };
}

/**
 * Crea una revisión SUCESORA en borrador copiando la vigente. Nunca se edita
 * una publicada: lo que ya se le ofreció a alguien es historia, y reescribirla
 * cambiaría lo que esa empresa contrató.
 */
export async function createDraftRevisionAction(
  _prev: CommercialActionState,
  formData: FormData
): Promise<CommercialActionState> {
  const denegado = await exigirSuperadmin();
  if (denegado) return { error: denegado };

  const planCode = String(formData.get("plan_code") ?? "");
  if (!["free", "full", "extra"].includes(planCode)) return { error: "Plan no válido." };

  const supabase = await createServerClient();
  const { data: vigente } = await supabase
    .from("plan_revisions")
    .select("*")
    .eq("plan_code", planCode)
    .eq("status", "published")
    .is("effective_to", null)
    .maybeSingle();
  if (!vigente) return { error: "Ese plan no tiene una revisión vigente que copiar." };

  const { data: ultima } = await supabase
    .from("plan_revisions")
    .select("revision_number")
    .eq("plan_code", planCode)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const siguiente = Number((ultima as { revision_number?: number } | null)?.revision_number ?? 0) + 1;

  const v = vigente as Record<string, unknown>;
  const { data: creada, error } = await supabase
    .from("plan_revisions")
    .insert({
      plan_code: planCode,
      revision_number: siguiente,
      status: "draft",
      display_name: v.display_name,
      description: v.description,
      public_conditions: v.public_conditions,
      price_state: v.price_state,
      currency: v.currency,
      monthly_price_minor: v.monthly_price_minor,
      annual_price_minor: v.annual_price_minor,
      internal_notes: String(formData.get("internal_notes") ?? "").trim() || null,
    })
    .select("id")
    .single();
  if (error || !creada) return { error: "No fue posible crear el borrador." };

  // Se copian los límites vigentes: un borrador que naciera vacío haría que
  // publicar por error dejara media docena de recursos «sin configurar», y sin
  // configurar NIEGA.
  const limites = await listRevisionLimits(String(v.id));
  if (limites.length > 0) {
    const { error: eLim } = await supabase.from("plan_revision_limits").insert(
      limites.map((l) => ({
        plan_revision_id: (creada as { id: string }).id,
        resource_code: l.resourceCode,
        limit_state: l.limitState,
        limit_value: l.limitValue,
      }))
    );
    if (eLim) return { error: "El borrador se creó, pero no fue posible copiar sus límites." };
  }

  revalidatePath("/platform/plans");
  return ok;
}

/** Editar SOLO borradores. La base lo vuelve a impedir con un disparador. */
export async function updateDraftRevisionAction(
  _prev: CommercialActionState,
  formData: FormData
): Promise<CommercialActionState> {
  const denegado = await exigirSuperadmin();
  if (denegado) return { error: denegado };

  const revisionId = String(formData.get("revision_id") ?? "");
  if (!revisionId) return { error: "Falta la revisión." };

  const supabase = await createServerClient();
  const campos: Record<string, unknown> = {};
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (displayName) campos.display_name = displayName;
  const conditions = String(formData.get("public_conditions") ?? "").trim();
  if (conditions) campos.public_conditions = conditions;
  // Quien administra escribe «40», no «4000». La traducción a centavos se hace
  // AQUÍ: el importe de un plan es una decisión comercial y el servidor tiene
  // que poder rehacer la cuenta sin fiarse de lo que le llegue del navegador.
  const mensual = String(formData.get("monthly_price_usd") ?? "");
  const anual = String(formData.get("annual_price_usd") ?? "");
  if (mensual.trim() !== "") {
    const r = parseUsdToMinor(mensual);
    if (!r.ok) return { error: `Precio mensual: ${USD_PARSE_MESSAGE[r.reason]}` };
    campos.monthly_price_minor = r.minor;
  }
  if (anual.trim() !== "") {
    const r = parseUsdToMinor(anual);
    if (!r.ok) return { error: `Precio anual: ${USD_PARSE_MESSAGE[r.reason]}` };
    campos.annual_price_minor = r.minor;
  }

  if (Object.keys(campos).length === 0) return { error: "No hay nada que cambiar." };

  // Los dos precios se guardan JUNTOS o no se guarda ninguno: dejar uno
  // cambiado y el otro no sería una tarifa a medias que nadie decidió.

  const { error } = await supabase
    .from("plan_revisions")
    .update(campos)
    .eq("id", revisionId)
    .eq("status", "draft");
  if (error) return { error: "No fue posible editar el borrador. Una revisión publicada no se edita." };

  revalidatePath("/platform/plans");
  return ok;
}

/** Cambiar un límite de un BORRADOR. */
export async function updateDraftLimitAction(
  _prev: CommercialActionState,
  formData: FormData
): Promise<CommercialActionState> {
  const denegado = await exigirSuperadmin();
  if (denegado) return { error: denegado };

  const revisionId = String(formData.get("revision_id") ?? "");
  const resourceCode = String(formData.get("resource_code") ?? "");
  const limitState = String(formData.get("limit_state") ?? "");
  const raw = String(formData.get("limit_value") ?? "").trim();
  if (!revisionId || !resourceCode) return { error: "Falta la revisión o el recurso." };
  if (!["finite", "unlimited", "not_configured"].includes(limitState)) {
    return { error: "Estado de límite no válido." };
  }
  const limitValue = limitState === "finite" ? Number(raw) : null;
  if (limitState === "finite" && (!Number.isFinite(limitValue) || (limitValue ?? -1) < 0)) {
    return { error: "Un límite finito necesita un número." };
  }

  const supabase = await createServerClient();
  const { data: rev } = await supabase
    .from("plan_revisions").select("status").eq("id", revisionId).maybeSingle();
  if ((rev as { status?: string } | null)?.status !== "draft") {
    return { error: "Solo se editan borradores. Una revisión publicada es historia." };
  }

  const { error } = await supabase.from("plan_revision_limits").upsert(
    { plan_revision_id: revisionId, resource_code: resourceCode, limit_state: limitState, limit_value: limitValue },
    { onConflict: "plan_revision_id,resource_code" }
  );
  if (error) return { error: "No fue posible guardar el límite." };

  revalidatePath("/platform/plans");
  return ok;
}

/**
 * Publicar. Exige confirmación explícita porque publicar condiciones
 * comerciales cambia lo que se le ofrece a todo el mundo a partir de ese
 * instante.
 *
 * Lo que NO hace, y es la regla histórica que sostiene todo el modelo:
 * publicar una revisión nueva NO reescribe a las empresas que ya están
 * asignadas a la anterior. Su asignación sigue apuntando a SU revisión. Mover a
 * una empresa es una transición comercial explícita, con motivo.
 */
export async function publishRevisionAction(
  _prev: CommercialActionState,
  formData: FormData
): Promise<CommercialActionState> {
  const denegado = await exigirSuperadmin();
  if (denegado) return { error: denegado };

  const revisionId = String(formData.get("revision_id") ?? "");
  if (!revisionId) return { error: "Falta la revisión." };
  if (formData.get("confirm") !== "publicar") {
    return { error: "Escribe «publicar» para confirmar: esto cambia lo que se ofrece desde ya." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("plan_publish_revision", {
    p_revision_id: revisionId,
    p_effective_from: new Date().toISOString(),
  });
  if (error) return { error: "No fue posible publicar la revisión." };

  revalidatePath("/platform/plans");
  return ok;
}

/** Transición comercial manual de una empresa. */
export async function assignPlanAction(
  _prev: CommercialActionState,
  formData: FormData
): Promise<CommercialActionState> {
  const denegado = await exigirSuperadmin();
  if (denegado) return { error: denegado };

  const organizationId = String(formData.get("organization_id") ?? "");
  const revisionId = String(formData.get("plan_revision_id") ?? "");
  const scope = String(formData.get("scope") ?? "organization");
  const moduleCode = String(formData.get("module_code") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim();
  const endsAt = String(formData.get("ends_at") ?? "").trim() || null;

  if (!organizationId || !revisionId) return { error: "Falta la empresa o la revisión." };
  if (reason.length < 10) return { error: "Escribe por qué se hace el cambio (al menos diez caracteres)." };
  if (formData.get("confirm") !== "cambiar") {
    return { error: "Escribe «cambiar» para confirmar la transición comercial." };
  }

  const supabase = await createServerClient();

  // LA FECHA ELEGIDA ES UN DÍA, NO UN INSTANTE.
  //
  // `<input type="date">` entrega `AAAA-MM-DD` y `new Date(...)` lo lee como
  // medianoche UTC. En Colombia eso convertía «hasta el 15 de septiembre» en
  // «hasta las 19:00 del 14», y elegir HOY producía un instante ya pasado que
  // la base rechazaba con `ASSIGNMENT_PERIOD_INVALID`. La intención es el FINAL
  // de ese día en la zona de la empresa, y así se calcula.
  let finISO: string | null = null;
  if (endsAt) {
    const { data: zonaCruda } = await supabase.rpc("organization_business_timezone", {
      p_organization_id: organizationId,
    });
    const zona = typeof zonaCruda === "string" && zonaCruda ? zonaCruda : "UTC";
    finISO = finDelDiaEnZona(endsAt, zona);
    if (finISO === null) return { error: "La fecha de fin no es una fecha válida." };
  }

  const { error } = await supabase.rpc("commercial_assign_plan", {
    p_organization_id: organizationId,
    p_plan_revision_id: revisionId,
    p_scope: scope,
    p_module_code: scope === "module" ? moduleCode : null,
    // PE-04B6 · `null` = «ahora», y ese «ahora» lo pone la BASE.
    //
    // Mandar `new Date()` desde el servidor de la aplicación ataba la
    // transición al reloj de ese proceso: si iba unos milisegundos por delante
    // del de Postgres, la asignación nueva quedaba en el futuro, la anterior se
    // cerraba en ese mismo instante futuro… y durante ese rato el plan efectivo
    // seguía siendo el viejo. Una transición que tarda en aplicarse por una
    // diferencia de relojes es una transición que a veces no se aplica.
    p_starts_at: null,
    p_ends_at: finISO,
    p_reason: reason,
  });
  if (error) return { error: mensajeDeTransicion(error.message ?? "") };

  revalidatePath("/platform/plans");
  revalidatePath(`/platform/organizations/${organizationId}`);
  return ok;
}

/**
 * Trazaloop · PE-05B5F · El estado de las renovaciones, para quien opera.
 *
 * Solo lectura. Aquí no hay ningún botón que mueva dinero, y no por olvido:
 * reintentar un cobro a mano es una operación financiera con su propia
 * autoridad, y no se cuela dentro de una pantalla de consulta.
 */
export async function getRenewalOperationsAction(): Promise<{
  rows: RenewalOperationRow[] | null;
  alerts: import("@/lib/db/billing-alerts").OperationsAlert[] | null;
}> {
  await requirePlatformStaff();
  const { listOperationsAlerts } = await import("@/lib/db/billing-alerts");
  const [rows, alerts] = await Promise.all([
    listRenewalOperations(), listOperationsAlerts(),
  ]);
  return { rows, alerts };
}

// ---------------------------------------------------------------------------
// PROD-LAUNCH-01B · Registrar un pago hecho fuera de Trazaloop
// ---------------------------------------------------------------------------
//
// El carril de la transferencia, el PSE y el efectivo, mientras el cobro en
// línea no está disponible para todo el mundo.
//
// LO QUE ESTO NO ES: un botón que ponga «plan = full». Un derecho sin pago ni
// periodo es un regalo que nadie podrá reconciliar después, y a los tres meses
// nadie sabe quién pagó qué. Esta acción produce EXACTAMENTE la misma verdad
// canónica que el pago en línea —pago, suscripción, periodo liquidado y
// derecho—; lo único distinto es que el proveedor se llama `manual` y que
// lleva firma: quién lo registró, con qué evidencia y por qué.
//
// La base vuelve a comprobarlo todo. Esto no es la barrera, es la pantalla.

/** Los mensajes de la base, traducidos a lo que se lee en la consola. */
const MANUAL_MESSAGE: Record<string, string> = {
  NOT_AUTHORIZED: SOLO_ADMINISTRACION,
  MANUAL_REFERENCE_REQUIRED:
    "Escribe el número de la transferencia, factura o recibo.",
  MANUAL_REASON_REQUIRED:
    "Escribe por qué se registra este pago (al menos diez caracteres).",
  MANUAL_PAID_AT_REQUIRED: "Falta la fecha en la que se pagó.",
  MANUAL_PAID_AT_IN_FUTURE:
    "La fecha de pago está en el futuro. Un pago que aún no ocurrió no se registra.",
  FX_RATE_UNAVAILABLE:
    "No hay tasa de cambio vigente, así que no se puede calcular el precio. "
    + "Cárgala en el catálogo antes de registrar el pago.",
  PLAN_PRICE_NOT_CONFIGURED:
    "Ese plan no tiene precio publicado para esa periodicidad.",
  RENEWAL_PERIOD_UNAVAILABLE:
    "No se pudo abrir el periodo siguiente de esta empresa. Revisa su suscripción.",
  SETTLEMENT_REFUSED:
    "El asentamiento no se completó y no se registró ningún pago.",
};

function mensajeManual(bruto: string): string {
  for (const [clave, texto] of Object.entries(MANUAL_MESSAGE)) {
    if (bruto.includes(clave)) return texto;
  }
  return "No fue posible registrar el pago. No se cambió nada.";
}

export type ManualPaymentState = CommercialActionState & {
  /** Para que la consola pueda enlazar lo que acaba de crear. */
  paymentId?: string;
  alreadyRecorded?: boolean;
};

/**
 * Registra un pago externo y activa el plan por la puerta canónica.
 *
 * Idempotente por la REFERENCIA: registrar dos veces el mismo comprobante no
 * cobra dos meses. Eso importa más de lo que parece — quien registra a mano
 * suele hacerlo desde una lista, y una lista se repasa dos veces.
 */
export async function recordManualPaymentAction(
  _prev: ManualPaymentState,
  formData: FormData
): Promise<ManualPaymentState> {
  const denegado = await exigirSuperadmin();
  if (denegado) return { error: denegado };

  const organizationId = String(formData.get("organization_id") ?? "");
  const planCode = String(formData.get("plan_code") ?? "");
  const interval = String(formData.get("billing_interval") ?? "");
  const reference = String(formData.get("reference") ?? "").trim();
  const paidAt = String(formData.get("paid_at") ?? "").trim();
  const evidence = String(formData.get("evidence") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!organizationId) return { error: "Falta la empresa." };
  if (planCode !== "full" && planCode !== "extra") {
    return { error: "Elige un plan de pago: Full o Extra." };
  }
  if (interval !== "monthly" && interval !== "annual") {
    return { error: "Elige la periodicidad: mensual o anual." };
  }
  if (reference.length < 3) {
    return { error: MANUAL_MESSAGE.MANUAL_REFERENCE_REQUIRED };
  }
  if (reason.length < 10) return { error: MANUAL_MESSAGE.MANUAL_REASON_REQUIRED };
  if (!paidAt) return { error: MANUAL_MESSAGE.MANUAL_PAID_AT_REQUIRED };
  // Confirmación escrita, igual que en la transición comercial: registrar un
  // cobro es una escritura financiera y no se hace por un clic despistado.
  if (formData.get("confirm") !== "registrar") {
    return { error: "Escribe «registrar» para confirmar el pago." };
  }

  // LA FECHA ELEGIDA ES UN DÍA, NO UN INSTANTE. Se cierra al final de ese día
  // en la zona de la empresa, como en `assignPlanAction`: interpretarla como
  // medianoche UTC convertía «pagó hoy» en un instante futuro en Colombia.
  const supabase = await createServerClient();
  const { data: zonaCruda } = await supabase.rpc("organization_business_timezone", {
    p_organization_id: organizationId,
  });
  const zona = typeof zonaCruda === "string" && zonaCruda ? zonaCruda : "UTC";
  const pagadoISO = finDelDiaEnZona(paidAt, zona);
  if (pagadoISO === null) return { error: "La fecha de pago no es una fecha válida." };
  // Y si ese final de día todavía no ha llegado, se usa AHORA: la base rechaza
  // un pago del futuro, y con razón.
  const ahora = new Date().toISOString();
  const pagado = pagadoISO > ahora ? ahora : pagadoISO;

  const { data, error } = await supabase.rpc("billing_record_manual_payment", {
    p_organization_id: organizationId,
    p_plan_code: planCode,
    p_billing_interval: interval,
    p_reference: reference,
    p_paid_at: pagado,
    p_evidence: evidence,
    p_reason: reason,
  });
  if (error) return { error: mensajeManual(error.message ?? "") };

  const r = (data ?? {}) as Record<string, unknown>;
  revalidatePath(`/platform/organizations/${organizationId}`);
  revalidatePath("/platform/plans");
  return {
    error: null,
    success: true,
    paymentId: typeof r.payment_id === "string" ? r.payment_id : undefined,
    alreadyRecorded: r.outcome === "already_recorded",
  };
}
