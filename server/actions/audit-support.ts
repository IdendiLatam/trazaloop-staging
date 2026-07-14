"use server";

import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import {
  getDossier,
  listComponentRows,
  listEvidenceMatrix,
  listSupportGaps,
  type DossierRow,
  type ComponentRow,
  type EvidenceMatrixRow,
  type SupportGapRow,
} from "@/lib/db/audit-support";
import { listCalculationsForBatch, getRecycledDashboard } from "@/lib/db/recycled";
import { toCsv } from "@/lib/csv";

export type DossierBundle = {
  dossier: DossierRow;
  components: ComponentRow[];
  evidences: EvidenceMatrixRow[];
  gaps: SupportGapRow[];
  history: {
    id: string;
    recycled_percent: number;
    defensibility_level: string;
    risk_flag: boolean;
    calculated_at: string;
  }[];
};

/** El cálculo debe pertenecer a la empresa activa; organization_id jamás
 *  viaja desde el cliente. */
async function buildDossierBundle(
  calculationId: string
): Promise<{ data: DossierBundle | null; error: string | null }> {
  const org = await requireActiveOrg();
  const dossier = await getDossier(org.organizationId, calculationId);
  if (!dossier) {
    return { data: null, error: "El cálculo no existe o no pertenece a tu empresa activa." };
  }
  const [components, evidences, gaps, history] = await Promise.all([
    listComponentRows(org.organizationId, calculationId),
    listEvidenceMatrix(org.organizationId, dossier.output_batch_id),
    listSupportGaps(org.organizationId, dossier.output_batch_id),
    listCalculationsForBatch(org.organizationId, dossier.output_batch_id),
  ]);
  return {
    data: {
      dossier,
      components,
      evidences,
      gaps,
      history: history.map((h) => ({
        id: h.id,
        recycled_percent: h.recycled_percent,
        defensibility_level: h.defensibility_level,
        risk_flag: h.risk_flag,
        calculated_at: h.calculated_at,
      })),
    },
    error: null,
  };
}

export async function getCalculationDossierAction(calculationId: string) {
  return buildDossierBundle(calculationId);
}

/** Misma información que el dossier normal, con marca de generación para la
 *  vista imprimible (no persiste nada; no genera PDF en servidor). */
export async function getPrintableCalculationDossierAction(calculationId: string) {
  const result = await buildDossierBundle(calculationId);
  return { ...result, generatedAt: new Date().toISOString() };
}

export async function getOutputBatchEvidenceMatrixAction(
  outputBatchId: string,
  calculationId?: string
) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const { data: batch } = await supabase
    .from("output_batches")
    .select("id")
    .eq("id", outputBatchId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!batch) {
    return { data: null, error: "El lote producido / lote final no pertenece a tu empresa activa." };
  }
  let rows = await listEvidenceMatrix(org.organizationId, outputBatchId);
  if (calculationId) rows = rows.filter((r) => r.calculation_id === calculationId);
  return { data: rows, error: null };
}

export async function getOutputBatchSupportGapsAction(
  outputBatchId: string,
  calculationId?: string
) {
  const org = await requireActiveOrg();
  let rows = await listSupportGaps(org.organizationId, outputBatchId);
  if (calculationId) {
    rows = rows.filter((r) => r.calculation_id === calculationId || r.calculation_id === null);
  }
  return { data: rows, error: null };
}

export async function getAuditSupportDashboardAction() {
  const org = await requireActiveOrg();
  const [recycled, gaps] = await Promise.all([
    getRecycledDashboard(org.organizationId),
    listSupportGaps(org.organizationId),
  ]);
  const criticalBatches = new Set(
    gaps.filter((g) => g.gap_severity === "critical").map((g) => g.output_batch_id)
  );
  const pendingEvidenceBatches = new Set(
    gaps
      .filter((g) => g.gap_code === "origin_support_not_valid" || g.gap_code === "missing_origin_support")
      .map((g) => g.output_batch_id)
  );
  return {
    defensible: recycled.defensible,
    withWarnings: recycled.withWarnings,
    preliminary: recycled.preliminary,
    batchesWithCriticalGaps: criticalBatches.size,
    batchesWithPendingEvidence: pendingEvidenceBatches.size,
    latest: recycled.latest,
    recentGaps: gaps.slice(0, 12),
  };
}

/** Objeto estructurado listo para descargar como .json desde el cliente.
 *  Solo datos de la empresa activa (el dossier ya lo garantiza). */
export async function exportCalculationDossierJsonAction(calculationId: string) {
  const { data, error } = await buildDossierBundle(calculationId);
  if (error || !data) return { data: null, error };
  const d = data.dossier;
  return {
    error: null,
    data: {
      filename: `dossier-${d.output_batch_code}-${calculationId.slice(0, 8)}.json`,
      payload: {
        generated_at: new Date().toISOString(),
        note: "Consolidado técnico basado en el snapshot del cálculo; no constituye por sí mismo una certificación.",
        calculation: {
          calculation_id: d.calculation_id,
          output_batch_code: d.output_batch_code,
          production_order_code: d.production_order_code,
          product_code: d.product_code,
          product_name: d.product_name,
          family_name: d.family_name,
          produced_date: d.produced_date,
          calculated_at: d.calculated_at,
          calculated_by_name: d.calculated_by_name,
        },
        result: {
          total_mass_kg: d.total_mass_kg,
          recycled_mass_kg: d.recycled_mass_kg,
          recycled_percent: d.recycled_percent,
          declared_percent: d.declared_percent,
          risk_flag: d.risk_flag,
          defensibility_level: d.defensibility_level,
          warnings: d.warnings,
        },
        methodology: {
          code: d.methodology_code,
          version: d.methodology_version,
          name: d.methodology_name,
          rules_snapshot: d.methodology_rules_snapshot,
        },
        components: data.components,
        evidences: data.evidences,
        gaps: data.gaps,
        history: data.history,
      },
    },
  };
}

/** CSV de la matriz de evidencias. toCsv escapa comillas, comas y saltos de
 *  línea. Solo columnas necesarias: nada sensible innecesario. */
export async function exportEvidenceMatrixCsvAction(
  outputBatchId: string,
  calculationId?: string
) {
  const { data: rows, error } = await getOutputBatchEvidenceMatrixAction(
    outputBatchId,
    calculationId
  );
  if (error || !rows) return { data: null, error };
  const header = [
    "evidence_code",
    "evidence_title",
    "evidence_type",
    "evidence_status",
    "linked_entity_type",
    "linked_entity_label",
    "support_role",
    "is_required_for_defensibility",
    "is_valid_for_defensibility",
  ];
  const csv = toCsv([
    header,
    ...rows.map((r) => [
      r.evidence_code ?? "",
      r.evidence_title ?? "",
      r.evidence_type ?? "",
      r.evidence_status ?? "",
      r.linked_entity_type ?? "",
      r.linked_entity_label ?? "",
      r.support_role ?? "",
      String(r.is_required_for_defensibility),
      String(r.is_valid_for_defensibility),
    ]),
  ]);
  const code = rows[0]?.output_batch_code ?? outputBatchId.slice(0, 8);
  return { error: null, data: { filename: `matriz-evidencias-${code}.csv`, csv } };
}
