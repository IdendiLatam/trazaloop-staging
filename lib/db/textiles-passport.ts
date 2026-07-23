import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { TextilePassportStatus } from "@/lib/domain/textiles-passport";

/**
 * Trazaloop · Sprint T9A (Textil) · Capa de datos base del pasaporte
 * técnico textil. En T9A: lectura de pasaportes de la organización y las
 * dos RPCs controladas (generar snapshot base / transición de estado).
 * La generación completa desde fuentes y la creación de registros con
 * pre-chequeo son T9B. Todo bajo RLS con la sesión real; module_key no
 * aplica aquí (el pasaporte es propio del módulo Textil).
 */

export type PassportSummaryRow = {
  id: string;
  passportCode: string;
  passportVersion: number;
  referenceId: string;
  sku: string | null;
  productName: string | null;
  outputLotId: string | null;
  status: TextilePassportStatus;
  sourceHash: string | null;
  gapCount: number;
  warningCount: number;
  generatedAt: string | null;
  updatedAt: string;
};

function mapSummary(r: Record<string, unknown>): PassportSummaryRow {
  const ref = r.textile_references as unknown as
    | { sku: string; textile_products: { name: string } | null }
    | null;
  const gaps = Array.isArray(r.gaps_json) ? (r.gaps_json as unknown[]).length : 0;
  const warnings = Array.isArray(r.warnings_json) ? (r.warnings_json as unknown[]).length : 0;
  return {
    id: r.id as string,
    passportCode: r.passport_code as string,
    passportVersion: r.passport_version as number,
    referenceId: r.reference_id as string,
    sku: ref?.sku ?? null,
    productName: ref?.textile_products?.name ?? null,
    outputLotId: (r.output_lot_id as string | null) ?? null,
    status: r.status as TextilePassportStatus,
    sourceHash: (r.source_hash as string | null) ?? null,
    gapCount: gaps,
    warningCount: warnings,
    generatedAt: (r.generated_at as string | null) ?? null,
    updatedAt: r.updated_at as string,
  };
}

export async function listTechnicalPassports(orgId: string): Promise<PassportSummaryRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_technical_passports")
    .select(
      "id, passport_code, passport_version, reference_id, output_lot_id, status, source_hash, gaps_json, warnings_json, generated_at, updated_at, textile_references(sku, textile_products(name))"
    )
    .eq("organization_id", orgId)
    .order("passport_code", { ascending: true })
    .order("passport_version", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map(mapSummary);
}

export async function getTechnicalPassport(
  orgId: string,
  passportId: string
): Promise<Record<string, unknown> | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_technical_passports")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", passportId)
    .maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

/** RPC controlada: (re)genera el snapshot BASE y pasa a 'generated'. */
export async function generateTechnicalPassportBase(
  passportId: string
): Promise<{ sourceHash: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("generate_textile_technical_passport_base", {
    p_passport_id: passportId,
  });
  if (error) return { sourceHash: null, error: error.message };
  return { sourceHash: (data as string) ?? null, error: null };
}

/** RPC controlada: genera el snapshot COMPLETO desde las fuentes reales
 *  (T9B) y pasa a 'generated'. El snapshot se arma en servidor; el cliente
 *  no envía snapshot/gaps/hash. */
export async function generateTechnicalPassportFullSnapshot(
  passportId: string
): Promise<{ sourceHash: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("generate_textile_technical_passport_full_snapshot", {
    p_passport_id: passportId,
  });
  if (error) return { sourceHash: null, error: error.message };
  return { sourceHash: (data as string) ?? null, error: null };
}

/** RPC controlada: transición de estado con sellos atómicos. */
export async function changeTechnicalPassportStatus(
  passportId: string,
  toStatus: TextilePassportStatus
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("change_textile_technical_passport_status", {
    p_passport_id: passportId,
    p_to_status: toStatus,
  });
  return { error: error ? error.message : null };
}

/**
 * Crea un pasaporte en estado 'draft' (T9C). El INSERT es deliberadamente
 * mínimo: la BD GARANTIZA (trigger de 0084/0085 + RLS) que nazca como
 * borrador, sin snapshot ni sellos, y solo para roles autorizados. El
 * passport_code se genera aquí de forma legible y única por organización;
 * ante colisión rara se reintenta con un sufijo incremental.
 */
export async function createTechnicalPassportDraft(input: {
  organizationId: string;
  referenceId: string;
  outputLotId: string | null;
  circularityAssessmentId: string | null;
  notes: string | null;
  passportCode: string;
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_technical_passports")
    .insert({
      organization_id: input.organizationId,
      passport_code: input.passportCode,
      reference_id: input.referenceId,
      output_lot_id: input.outputLotId,
      circularity_assessment_id: input.circularityAssessmentId,
      notes: input.notes,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      return { id: null, error: "Ya existe un pasaporte con ese código." };
    }
    return { id: null, error: error.message };
  }
  return { id: (data?.id as string) ?? null, error: null };
}

/** Cuenta los pasaportes existentes de una referencia (para numerar el code). */
export async function countTechnicalPassportsForReference(
  orgId: string,
  referenceId: string
): Promise<number> {
  const supabase = await createServerClient();
  const { count } = await supabase
    .from("textile_technical_passports")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("reference_id", referenceId);
  return count ?? 0;
}

/** Resuelve la referencia (y SKU) de un lote producido, para validar que el
 *  lote elegido corresponde a la referencia del pasaporte. */
export async function getReferenceForOutputLot(
  orgId: string,
  outputLotId: string
): Promise<{ referenceId: string; sku: string } | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_textile_output_lot_traceability_summary")
    .select("reference_id, sku")
    .eq("organization_id", orgId)
    .eq("output_lot_id", outputLotId)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { referenceId: data.reference_id as string, sku: data.sku as string };
}

/** Resuelve la referencia de una evaluación de circularidad, para validar que
 *  la evaluación elegida corresponde a la referencia del pasaporte (T9C.1). */
export async function getReferenceForAssessment(
  orgId: string,
  assessmentId: string
): Promise<{ referenceId: string; status: string } | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_circularity_assessments")
    .select("reference_id, status")
    .eq("organization_id", orgId)
    .eq("id", assessmentId)
    .maybeSingle();
  if (!data) return null;
  return { referenceId: data.reference_id as string, status: data.status as string };
}

/** Lista lotes producidos con su referencia, para el selector de creación. */
export type PassportLotOption = { id: string; code: string; referenceId: string };
export async function listOutputLotsForPassport(orgId: string): Promise<PassportLotOption[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_textile_output_lot_traceability_summary")
    .select("output_lot_id, output_lot_code, reference_id")
    .eq("organization_id", orgId)
    .order("output_lot_code", { ascending: true });
  const byId = new Map<string, PassportLotOption>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const id = r.output_lot_id as string;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        code: r.output_lot_code as string,
        referenceId: r.reference_id as string,
      });
    }
  }
  return [...byId.values()];
}
