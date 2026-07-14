import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import {
  type FeedbackModule,
  type FeedbackCategory,
  type FeedbackSeverity,
  type FeedbackStatus,
} from "@/lib/domain/implementation";

/**
 * Trazaloop · Sprint 6 · Implementación con empresa (capa de datos).
 *
 * Los enums, guards, labels y validaciones puras viven en
 * lib/domain/implementation.ts (sin "server-only", testeable sin BD).
 * Este archivo SOLO agrega lo que necesita el cliente de Supabase con
 * sesión: lectura de las vistas 0034 y CRUD de implementation_feedback (0033).
 *
 * Capa de apoyo para probar Trazaloop con empresas y datos reales: NO crea
 * caso piloto, NO crea datos demo, NO cambia la metodología de cálculo ni el
 * motor normativo. Todo lo de aquí LEE datos existentes (o el feedback que
 * el propio equipo registra) y resume/recomienda.
 */
export * from "@/lib/domain/implementation";

// ---------------------------------------------------------------------------
// Dashboard (v_implementation_dashboard)
// ---------------------------------------------------------------------------
export type ImplementationDashboard = {
  suppliersCount: number;
  materialsCount: number;
  recycledMaterialsCount: number;
  materialsWithoutOriginSupportCount: number;
  evidencesCount: number;
  validEvidencesCount: number;
  pendingEvidencesCount: number;
  inputBatchesCount: number;
  productionOrdersCount: number;
  outputBatchesCount: number;
  outputBatchesWithCompositionCount: number;
  calculatedOutputBatchesCount: number;
  defensibleCalculationsCount: number;
  warningCalculationsCount: number;
  preliminaryCalculationsCount: number;
  criticalGapsCount: number;
  openFeedbackCount: number;
  criticalFeedbackCount: number;
};

const EMPTY_DASHBOARD: ImplementationDashboard = {
  suppliersCount: 0,
  materialsCount: 0,
  recycledMaterialsCount: 0,
  materialsWithoutOriginSupportCount: 0,
  evidencesCount: 0,
  validEvidencesCount: 0,
  pendingEvidencesCount: 0,
  inputBatchesCount: 0,
  productionOrdersCount: 0,
  outputBatchesCount: 0,
  outputBatchesWithCompositionCount: 0,
  calculatedOutputBatchesCount: 0,
  defensibleCalculationsCount: 0,
  warningCalculationsCount: 0,
  preliminaryCalculationsCount: 0,
  criticalGapsCount: 0,
  openFeedbackCount: 0,
  criticalFeedbackCount: 0,
};

export async function getImplementationDashboard(
  orgId: string
): Promise<ImplementationDashboard> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_implementation_dashboard")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data) return EMPTY_DASHBOARD;
  const n = (v: unknown) => Number(v ?? 0);
  return {
    suppliersCount: n(data.suppliers_count),
    materialsCount: n(data.materials_count),
    recycledMaterialsCount: n(data.recycled_materials_count),
    materialsWithoutOriginSupportCount: n(data.materials_without_origin_support_count),
    evidencesCount: n(data.evidences_count),
    validEvidencesCount: n(data.valid_evidences_count),
    pendingEvidencesCount: n(data.pending_evidences_count),
    inputBatchesCount: n(data.input_batches_count),
    productionOrdersCount: n(data.production_orders_count),
    outputBatchesCount: n(data.output_batches_count),
    outputBatchesWithCompositionCount: n(data.output_batches_with_composition_count),
    calculatedOutputBatchesCount: n(data.calculated_output_batches_count),
    defensibleCalculationsCount: n(data.defensible_calculations_count),
    warningCalculationsCount: n(data.warning_calculations_count),
    preliminaryCalculationsCount: n(data.preliminary_calculations_count),
    criticalGapsCount: n(data.critical_gaps_count),
    openFeedbackCount: n(data.open_feedback_count),
    criticalFeedbackCount: n(data.critical_feedback_count),
  };
}

// ---------------------------------------------------------------------------
// Siguiente(s) acción(es) recomendada(s) (v_implementation_next_actions)
// ---------------------------------------------------------------------------
export type NextActionCode =
  | "create_supplier"
  | "create_material"
  | "add_origin_evidence"
  | "validate_evidence"
  | "create_input_batch"
  | "create_production_order"
  | "add_consumption"
  | "add_composition"
  | "calculate_recycled_content"
  | "review_gaps"
  | "open_dossier"
  | "record_feedback";

export type NextAction = {
  organizationId: string;
  priority: number;
  actionCode: NextActionCode;
  actionLabel: string;
  actionDescription: string;
  href: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
};

export async function listImplementationNextActions(orgId: string): Promise<NextAction[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_implementation_next_actions")
    .select("*")
    .eq("organization_id", orgId)
    .order("priority", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    organizationId: r.organization_id as string,
    priority: Number(r.priority),
    actionCode: r.action_code as NextActionCode,
    actionLabel: r.action_label as string,
    actionDescription: r.action_description as string,
    href: r.href as string,
    relatedEntityType: (r.related_entity_type as string | null) ?? null,
    relatedEntityId: (r.related_entity_id as string | null) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// implementation_feedback
// ---------------------------------------------------------------------------
export type FeedbackRow = {
  id: string;
  organizationId: string;
  module: FeedbackModule;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  status: FeedbackStatus;
  title: string;
  description: string;
  stepsToReproduce: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdBy: string | null;
  createdByName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeedbackFilters = {
  module?: FeedbackModule;
  category?: FeedbackCategory;
  severity?: FeedbackSeverity;
  status?: FeedbackStatus;
};

type ProfileRef = { full_name: string | null } | null;

function mapFeedbackRow(r: Record<string, unknown>): FeedbackRow {
  const creator = (r.creator ?? null) as ProfileRef;
  const assignee = (r.assignee ?? null) as ProfileRef;
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    module: r.module as FeedbackModule,
    category: r.category as FeedbackCategory,
    severity: r.severity as FeedbackSeverity,
    status: r.status as FeedbackStatus,
    title: r.title as string,
    description: r.description as string,
    stepsToReproduce: (r.steps_to_reproduce as string | null) ?? null,
    expectedResult: (r.expected_result as string | null) ?? null,
    actualResult: (r.actual_result as string | null) ?? null,
    relatedEntityType: (r.related_entity_type as string | null) ?? null,
    relatedEntityId: (r.related_entity_id as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdByName: creator?.full_name ?? null,
    assignedTo: (r.assigned_to as string | null) ?? null,
    assignedToName: assignee?.full_name ?? null,
    resolvedAt: (r.resolved_at as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

const FEEDBACK_SELECT =
  "*, creator:profiles!implementation_feedback_created_by_fkey(full_name), " +
  "assignee:profiles!implementation_feedback_assigned_to_fkey(full_name)";

export async function listImplementationFeedback(
  orgId: string,
  filters?: FeedbackFilters,
  limit?: number
): Promise<FeedbackRow[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("implementation_feedback")
    .select(FEEDBACK_SELECT)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (filters?.module) query = query.eq("module", filters.module);
  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.severity) query = query.eq("severity", filters.severity);
  if (filters?.status) query = query.eq("status", filters.status);
  if (limit) query = query.limit(limit);
  const { data } = await query;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapFeedbackRow);
}

export async function getImplementationFeedback(
  orgId: string,
  id: string
): Promise<FeedbackRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("implementation_feedback")
    .select(FEEDBACK_SELECT)
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ? mapFeedbackRow(data as unknown as Record<string, unknown>) : null;
}
