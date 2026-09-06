"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { createServerClient } from "@/lib/supabase/server";
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

const SOLO_ADMINISTRACION =
  "Solo la administración de plataforma puede cambiar condiciones comerciales.";

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
    p_ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    p_reason: reason,
  });
  if (error) {
    const m = error.message ?? "";
    if (m.includes("MODULE_NOT_COMMERCIAL")) {
      return { error: "Ese módulo no es comercial: solo los módulos funcionales reciben plan." };
    }
    if (m.includes("PLAN_REVISION_NOT_PUBLISHED")) {
      return { error: "Solo se asignan revisiones publicadas: un borrador no se le vende a nadie." };
    }
    if (m.includes("NOT_AUTHORIZED")) return { error: SOLO_ADMINISTRACION };
    return { error: "No fue posible aplicar la transición comercial." };
  }

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
