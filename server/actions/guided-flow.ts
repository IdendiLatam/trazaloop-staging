"use server";

import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import type { ReadinessLevel, NextStepCode } from "@/lib/domain/guided-flow";
import {
  listOutputBatches,
  listComposition,
  listConsumption,
  getCompleteness,
} from "@/lib/db/traceability";
import { listCalculationsForBatch } from "@/lib/db/recycled";
import { listEvidenceMatrix, listSupportGaps } from "@/lib/db/audit-support";

export type ReadinessRow = {
  output_batch_id: string;
  output_batch_code: string;
  produced_date: string | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  family_id: string | null;
  family_name: string | null;
  production_order_id: string | null;
  production_order_code: string | null;
  traceability_status: string | null;
  has_product: boolean;
  has_production_order: boolean;
  has_consumption: boolean;
  has_composition: boolean;
  has_valid_origin_evidence: boolean;
  has_required_reclassification_evidence: boolean;
  has_pending_required_evidence: boolean;
  has_missing_required_evidence: boolean;
  has_support_gaps: boolean;
  has_calculation: boolean;
  latest_calculation_id: string | null;
  latest_recycled_percent: number | null;
  latest_defensibility_level: "preliminary" | "with_warnings" | "defensible" | null;
  latest_risk_flag: boolean | null;
  latest_calculated_at: string | null;
  has_dossier: boolean;
  next_step_code: NextStepCode;
  next_step_label: string;
  next_step_href: string;
  readiness_level: ReadinessLevel;
};

export type GuidedDashboard = {
  suppliersCount: number;
  materialsCount: number;
  productsCount: number;
  evidencesCount: number;
  pendingEvidencesCount: number;
  inputBatchesCount: number;
  productionOrdersCount: number;
  outputBatchesCount: number;
  readyToCalculate: number;
  withoutComposition: number;
  withoutConsumption: number;
  withPendingEvidence: number;
  calculatedCount: number;
  defensibleCount: number;
  warningCount: number;
  preliminaryCount: number;
  criticalGapsCount: number;
};

async function countRows(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  table: string,
  orgId: string,
  extra?: { column: string; value: string }
): Promise<number> {
  let query = supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (extra) query = query.eq(extra.column, extra.value);
  const { count } = await query;
  return count ?? 0;
}

export async function getGuidedFlowDashboardAction(): Promise<GuidedDashboard> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const [row, suppliers, materials, products, evidences, pendingEvidences] =
    await Promise.all([
      supabase
        .from("v_guided_flow_dashboard")
        .select("*")
        .eq("organization_id", org.organizationId)
        .maybeSingle(),
      countRows(supabase, "suppliers", org.organizationId),
      countRows(supabase, "materials", org.organizationId),
      countRows(supabase, "products", org.organizationId),
      countRows(supabase, "evidences", org.organizationId),
      countRows(supabase, "evidences", org.organizationId, {
        column: "status",
        value: "pending",
      }),
    ]);
  const d = row.data ?? {};
  const n = (v: unknown) => Number(v ?? 0);
  return {
    suppliersCount: suppliers,
    materialsCount: materials,
    productsCount: products,
    evidencesCount: evidences,
    pendingEvidencesCount: pendingEvidences,
    inputBatchesCount: n(d.input_batches_count),
    productionOrdersCount: n(d.production_orders_count),
    outputBatchesCount: n(d.output_batches_count),
    readyToCalculate: n(d.output_batches_ready_to_calculate),
    withoutComposition: n(d.output_batches_without_composition),
    withoutConsumption: n(d.output_batches_without_consumption),
    withPendingEvidence: n(d.output_batches_with_pending_evidence),
    calculatedCount: n(d.calculated_batches_count),
    defensibleCount: n(d.defensible_calculations_count),
    warningCount: n(d.warning_calculations_count),
    preliminaryCount: n(d.preliminary_calculations_count),
    criticalGapsCount: n(d.critical_gaps_count),
  };
}

export async function listOutputBatchReadinessAction(filters?: {
  readiness?: ReadinessLevel;
}): Promise<ReadinessRow[]> {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  let query = supabase
    .from("v_output_batch_readiness")
    .select("*")
    .eq("organization_id", org.organizationId)
    .order("output_batch_code");
  if (filters?.readiness) query = query.eq("readiness_level", filters.readiness);
  const { data } = await query;
  return ((data ?? []) as ReadinessRow[]).map((r) => ({
    ...r,
    latest_recycled_percent:
      r.latest_recycled_percent === null ? null : Number(r.latest_recycled_percent),
  }));
}

/** Detalle completo para el stepper de un lote: readiness + trazabilidad +
 *  composición + evidencias + brechas + historial de cálculos. */
export async function getOutputBatchGuidedDetailAction(outputBatchId: string) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const { data: readiness } = await supabase
    .from("v_output_batch_readiness")
    .select("*")
    .eq("organization_id", org.organizationId)
    .eq("output_batch_id", outputBatchId)
    .maybeSingle();
  if (!readiness) {
    return { data: null, error: "El lote producido / lote final no pertenece a tu empresa activa." };
  }
  const r = readiness as ReadinessRow;
  const [batches, completeness, composition, consumption, evidences, gaps, history] =
    await Promise.all([
      listOutputBatches(org.organizationId),
      getCompleteness(org.organizationId),
      listComposition(org.organizationId, outputBatchId),
      r.production_order_id
        ? listConsumption(org.organizationId, r.production_order_id)
        : Promise.resolve([]),
      listEvidenceMatrix(org.organizationId, outputBatchId),
      listSupportGaps(org.organizationId, outputBatchId),
      listCalculationsForBatch(org.organizationId, outputBatchId),
    ]);
  return {
    error: null,
    data: {
      readiness: {
        ...r,
        latest_recycled_percent:
          r.latest_recycled_percent === null ? null : Number(r.latest_recycled_percent),
      },
      batch: batches.find((b) => b.id === outputBatchId) ?? null,
      completeness: completeness.find((c) => c.output_batch_id === outputBatchId) ?? null,
      composition,
      consumption,
      evidences,
      gaps,
      history,
    },
  };
}

export type NextBestAction = {
  description: string;
  entityLabel: string;
  actionLabel: string;
  href: string;
};

/** De 1 a 5 acciones ordenadas por prioridad (spec §6.4):
 *  1) composición sin cálculo, 2) cálculo con riesgo, 3) evidencias
 *  pendientes requeridas, 4) sin composición, 5) órdenes sin consumo,
 *  6) catálogos incompletos. */
export async function getNextBestActionsAction(): Promise<NextBestAction[]> {
  const [rows, dashboard] = await Promise.all([
    listOutputBatchReadinessAction(),
    getGuidedFlowDashboardAction(),
  ]);
  const actions: NextBestAction[] = [];
  const push = (a: NextBestAction) => {
    if (actions.length < 5) actions.push(a);
  };

  for (const r of rows.filter((x) => x.readiness_level === "ready_to_calculate")) {
    push({
      description: `El lote ${r.output_batch_code} tiene composición registrada pero aún no tiene cálculo.`,
      entityLabel: r.output_batch_code,
      actionLabel: "Calcular contenido reciclado",
      href: `/guided-flow/output-batches/${r.output_batch_id}`,
    });
  }
  for (const r of rows.filter((x) => x.has_calculation && x.latest_risk_flag)) {
    push({
      description: `El lote ${r.output_batch_code} tiene un cálculo con riesgo: el declarado supera al calculado.`,
      entityLabel: r.output_batch_code,
      actionLabel: "Revisar brechas",
      href: `/audit-support/output-batches/${r.output_batch_id}/evidence-matrix`,
    });
  }
  for (const r of rows.filter((x) => x.has_pending_required_evidence)) {
    push({
      description: `El lote ${r.output_batch_code} tiene evidencias requeridas pendientes de validar.`,
      entityLabel: r.output_batch_code,
      actionLabel: "Validar evidencia",
      href: "/evidences",
    });
  }
  for (const r of rows.filter((x) => x.has_production_order && !x.has_composition)) {
    push({
      description: `El lote ${r.output_batch_code} aún no tiene composición registrada.`,
      entityLabel: r.output_batch_code,
      actionLabel: "Registrar composición",
      href: `/guided-flow/output-batches/${r.output_batch_id}`,
    });
  }
  if (dashboard.withoutConsumption > 0) {
    push({
      description: `Hay ${dashboard.withoutConsumption} lote(s) de salida cuya orden no tiene consumos registrados.`,
      entityLabel: "Órdenes / corridas de producción",
      actionLabel: "Agregar consumo",
      href: "/traceability/production-orders",
    });
  }
  if (dashboard.suppliersCount === 0 || dashboard.materialsCount === 0) {
    push({
      description:
        "Los catálogos básicos están incompletos: se necesitan proveedores y materiales para registrar lotes de entrada.",
      entityLabel: "Catálogos",
      actionLabel: "Crear catálogos básicos",
      href: "/catalog",
    });
  }
  return actions;
}
