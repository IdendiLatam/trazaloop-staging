import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { PlanCode, PlanLimit, PlanStatus, ResourceCode, SubscriptionPlanHistoryEntry } from "@/lib/plans/types";
import type { OrganizationPlanUsage } from "@/lib/plans/usage";

/**
 * Trazaloop · Sprint 10A · Capa de datos de planes. Nada aquí usa
 * service_role: todo corre con la sesión real, sujeta a las RLS de 0050.
 * Los cambios de plan pasan SIEMPRE por la RPC change_organization_plan
 * (0053) — nunca por un UPDATE directo desde el cliente.
 */

function mapUsageRow(r: Record<string, unknown>): OrganizationPlanUsage {
  return {
    organizationId: r.organization_id as string,
    planCode: r.plan_code as PlanCode,
    planStatus: r.plan_status as PlanStatus,
    storageLimitBytes: Number(r.storage_limit_bytes ?? 0),
    storageUsedBytes: Number(r.storage_used_bytes ?? 0),
    storageUsedMb: Number(r.storage_used_mb ?? 0),
    storageLimitMb: Number(r.storage_limit_mb ?? 0),
    storagePercentUsed: Number(r.storage_percent_used ?? 0),
    documentsTrazadocsCount: Number(r.documents_trazadocs_count ?? 0),
    suppliersCount: Number(r.suppliers_count ?? 0),
    materialsCount: Number(r.materials_count ?? 0),
    productsCount: Number(r.products_count ?? 0),
    evidencesCount: Number(r.evidences_count ?? 0),
    productionOrdersCount: Number(r.production_orders_count ?? 0),
    inputBatchesCount: Number(r.input_batches_count ?? 0),
    outputBatchesCount: Number(r.output_batches_count ?? 0),
    teamMembersCount: Number(r.team_members_count ?? 0),
    diagnosticTaken: Boolean(r.diagnostic_taken),
    importsCount: Number(r.imports_count ?? 0),
    ticketsCount: Number(r.tickets_count ?? 0),
    updatedAt: r.updated_at as string,
  };
}

export async function getOrganizationUsage(orgId: string): Promise<OrganizationPlanUsage | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_organization_plan_usage")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  return data ? mapUsageRow(data as unknown as Record<string, unknown>) : null;
}

/** Todas las empresas con uso — para la consola de plataforma (Parte 13).
 *  La propia vista (0052) ya filtra por is_platform_staff() vs.
 *  is_org_member(): un superadmin ve todas, un usuario normal solo la suya. */
export async function listAllOrganizationUsage(): Promise<OrganizationPlanUsage[]> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("v_organization_plan_usage").select("*");
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapUsageRow);
}

export async function getPlanLimits(planCode: PlanCode): Promise<PlanLimit[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("plan_limits")
    .select("resource_code, limit_value, is_unlimited")
    .eq("plan_code", planCode);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    resourceCode: r.resource_code as ResourceCode,
    limitValue: r.limit_value == null ? null : Number(r.limit_value),
    isUnlimited: Boolean(r.is_unlimited),
  }));
}

export type PlanDefinitionRow = {
  code: PlanCode;
  name: string;
  description: string | null;
  storageLimitBytes: number;
};

export async function listPlanDefinitions(): Promise<PlanDefinitionRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("plan_definitions")
    .select("code, name, description, storage_limit_bytes")
    .eq("status", "active")
    .order("storage_limit_bytes", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    code: r.code as PlanCode,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    storageLimitBytes: Number(r.storage_limit_bytes ?? 0),
  }));
}

export async function listPlanHistory(orgId: string): Promise<SubscriptionPlanHistoryEntry[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("subscription_plan_history")
    .select("id, from_plan_code, to_plan_code, change_reason, created_at, author:profiles!subscription_plan_history_changed_by_fkey(full_name)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const author = (r.author ?? null) as { full_name: string | null } | null;
    return {
      id: r.id as string,
      fromPlanCode: (r.from_plan_code as PlanCode | null) ?? null,
      toPlanCode: r.to_plan_code as PlanCode,
      changedByName: author?.full_name ?? null,
      changeReason: (r.change_reason as string | null) ?? null,
      createdAt: r.created_at as string,
    };
  });
}

export async function changeOrganizationPlan(
  organizationId: string,
  toPlanCode: PlanCode,
  toStatus: PlanStatus,
  reason: string | null
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("change_organization_plan", {
    p_organization_id: organizationId,
    p_to_plan_code: toPlanCode,
    p_to_status: toStatus,
    p_reason: reason,
  });
  if (error) return { error: error.message || "No fue posible cambiar el plan de la empresa." };
  return { error: null };
}
