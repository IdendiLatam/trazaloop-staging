/**
 * PCR-03.2 · Colector de datos del ejercicio + lectura de ejercicios.
 *
 * El colector REUTILIZA la infraestructura existente (nada se duplica):
 *   · genealogía PCR-02: collectGraphForOutput (acotada, ciclos resueltos);
 *   · saldos PCR-02.5: vistas v_input_batch_inventory / v_output_batch_…;
 *   · evidencias PCR-03.1: listEvidencesForTargets (una consulta por tipo);
 *   · requisitos de cliente: listRequirementsForTargets;
 *   · cálculo PCR: listCalculationsForBatch (metodología intacta).
 * Todo acotado por organización; el snapshot JAMÁS contiene signed URLs.
 */
import { createServerClient } from "@/lib/supabase/server";
import { collectGraphForOutput } from "@/lib/db/genealogy";
import { listEvidencesForTargets, type EvidenceTargetType } from "@/lib/db/evidences";
import { listRequirementsForTargets } from "@/lib/db/customer-requirements";
import { listCalculationsForBatch, WARNING_LABEL } from "@/lib/db/recycled";
import type {
  ExerciseCollectedData,
  LinkedEvidenceInput,
  ExerciseResult,
} from "@/lib/domain/traceability-exercise";

export async function collectExerciseData(
  orgId: string,
  organizationName: string,
  outputBatchId: string
): Promise<ExerciseCollectedData | null> {
  const supabase = await createServerClient();
  const { data: target } = await supabase
    .from("output_batches")
    .select("id, batch_code, produced_quantity_kg, product_id, products(code, name)")
    .eq("organization_id", orgId)
    .eq("id", outputBatchId)
    .maybeSingle();
  if (!target) return null;

  const graph = await collectGraphForOutput(orgId, outputBatchId);

  const inputIds = [...graph.inputs.keys()];
  const outputIds = [...graph.outputs.keys()];
  const orderIds = [...graph.orders.keys()];
  // Saldos reales desde las vistas 0105 (derivados, jamás calculados en JS).
  const [{ data: inputBalances }, { data: outputBalances }] = await Promise.all([
    inputIds.length
      ? supabase
          .from("v_input_batch_inventory")
          .select("input_batch_id, batch_code, received_kg, consumed_kg, available_kg")
          .eq("organization_id", orgId)
          .in("input_batch_id", inputIds)
      : Promise.resolve({ data: [] as never[] }),
    outputIds.length
      ? supabase
          .from("v_output_batch_inventory")
          .select("output_batch_id, batch_code, produced_kg, consumed_internally_kg, available_kg")
          .eq("organization_id", orgId)
          .in("output_batch_id", outputIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  // Evidencias de TODA la cadena: una consulta por tipo de destino.
  // Los ids de material/proveedor se resuelven desde los lotes de entrada.
  const { data: inputRows } = inputIds.length
    ? await supabase
        .from("input_batches")
        .select("id, material_id, supplier_id")
        .eq("organization_id", orgId)
        .in("id", inputIds)
    : { data: [] as Array<{ id: string; material_id: string | null; supplier_id: string | null }> };
  const materialIds = [...new Set((inputRows ?? []).map((r) => r.material_id).filter((v): v is string => Boolean(v)))];
  const supplierIds = [...new Set((inputRows ?? []).map((r) => r.supplier_id).filter((v): v is string => Boolean(v)))];

  const labelByTarget = new Map<string, string>();
  for (const [id, i] of graph.inputs) labelByTarget.set(`input_batch:${id}`, `Lote de entrada ${i.batch_code}`);
  for (const [id, o] of graph.outputs) labelByTarget.set(`output_batch:${id}`, `Lote producido ${o.batch_code}`);
  for (const [id, o] of graph.orders) labelByTarget.set(`production_order:${id}`, `Orden ${o.order_code}`);
  if (materialIds.length) {
    const { data } = await supabase.from("materials").select("id, name").eq("organization_id", orgId).in("id", materialIds);
    for (const m of data ?? []) labelByTarget.set(`material:${m.id}`, `Material ${m.name}`);
  }
  if (supplierIds.length) {
    const { data } = await supabase.from("suppliers").select("id, name").eq("organization_id", orgId).in("id", supplierIds);
    for (const sRow of data ?? []) labelByTarget.set(`supplier:${sRow.id}`, `Proveedor ${sRow.name}`);
  }

  const evidenceTargets: Array<[EvidenceTargetType, string[]]> = [
    ["output_batch", outputIds],
    ["production_order", orderIds],
    ["input_batch", inputIds],
    ["material", materialIds],
    ["supplier", supplierIds],
  ];
  const evidences: LinkedEvidenceInput[] = [];
  for (const [type, ids] of evidenceTargets) {
    if (ids.length === 0) continue;
    const byTarget = await listEvidencesForTargets(orgId, type, ids);
    for (const [targetId, list] of Object.entries(byTarget)) {
      for (const e of list) {
        evidences.push({
          target_type: type,
          target_id: targetId,
          target_label: labelByTarget.get(`${type}:${targetId}`) ?? type,
          name: e.name,
          evidence_type: e.evidence_type,
          status: e.status,
          // (rev. 03.1–03.3.1, hallazgo 2) El contrato LinkedEvidence
          // transporta la gobernanza de forma explícita: sin casts.
          medium: e.medium,
          archived_at: e.archived_at,
          physical_reference: e.physical_reference,
          link_role: e.link_role,
        });
      }
    }
  }

  const requirements = await listRequirementsForTargets(orgId, [
    ...outputIds.map((id) => ({ target_type: "output_batch" as const, target_id: id })),
    ...orderIds.map((id) => ({ target_type: "production_order" as const, target_id: id })),
    ...(target.product_id
      ? [{ target_type: "product" as const, target_id: target.product_id as string }]
      : []),
  ]);

  const calcs = await listCalculationsForBatch(orgId, outputBatchId);
  const latest = calcs[0] ?? null;

  const p = target.products as unknown as { code?: string; name?: string } | null;
  return {
    organization_name: organizationName,
    target: {
      output_batch_id: target.id as string,
      batch_code: target.batch_code as string,
      product_label: p?.code ? `${p.code} · ${p.name}` : null,
      produced_quantity_kg: target.produced_quantity_kg === null ? null : Number(target.produced_quantity_kg),
    },
    graph,
    balances: {
      input_batches: (inputBalances ?? []).map((b) => ({
        id: b.input_batch_id as string,
        batch_code: b.batch_code as string,
        received_kg: Number(b.received_kg ?? 0),
        consumed_kg: Number(b.consumed_kg ?? 0),
        available_kg: Number(b.available_kg ?? 0),
      })),
      output_batches: (outputBalances ?? []).map((b) => ({
        id: b.output_batch_id as string,
        batch_code: b.batch_code as string,
        produced_kg: Number(b.produced_kg ?? 0),
        consumed_internally_kg: Number(b.consumed_internally_kg ?? 0),
        available_kg: Number(b.available_kg ?? 0),
      })),
    },
    evidences,
    requirements: requirements.map((r) => ({
      code: r.code,
      customer_name: r.customer_name,
      title: r.title,
      active: r.active,
      target_label:
        r.target_type === "output_batch"
          ? "Lote de la cadena"
          : r.target_type === "product"
            ? "Producto del lote"
            : "Orden de la cadena",
    })),
    calculation: latest
      ? {
          recycled_percent: Number(latest.recycled_percent ?? 0),
          calculated_at: latest.calculated_at,
          level: latest.defensibility_level,
          warnings: (latest.warnings ?? []).map((w) => WARNING_LABEL[w] ?? w),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Lectura de ejercicios (lista paginada + detalle)
// ---------------------------------------------------------------------------
export type ExerciseListRow = {
  id: string;
  batch_code: string;
  status: string;
  result: ExerciseResult | null;
  started_at: string;
  completed_at: string | null;
  gaps_count: number;
  warnings_count: number;
  started_by_email: string | null;
};

const PAGE_SIZE = 20;

export async function listTraceabilityExercises(
  orgId: string,
  opts: { q?: string; status?: string; page?: string } = {}
): Promise<{ rows: ExerciseListRow[]; total: number; page: number; pageSize: number }> {
  const pageN = Math.max(1, Math.floor(Number(opts.page ?? "1")) || 1);
  const supabase = await createServerClient();
  // (rev. 03.1–03.3.1, hallazgo 8) La búsqueda por código de lote se ejecuta
  // EN SERVIDOR antes de contar y paginar: el join !inner permite filtrar por
  // la columna embebida y el total refleja el resultado filtrado. Nunca se
  // filtra en JavaScript sobre la página actual.
  let request = supabase
    .from("traceability_exercises")
    .select(
      "id, status, result, started_at, completed_at, gaps_count, warnings_count, output_batches!traceability_exercises_output_batch_fk!inner(batch_code), started_by:profiles!traceability_exercises_started_by_fkey(email)",
      { count: "exact" }
    )
    .eq("organization_id", orgId);
  if (opts.status && ["draft", "completed", "archived"].includes(opts.status)) {
    request = request.eq("status", opts.status);
  }
  const term = (opts.q ?? "").trim().replace(/[%_]/g, "");
  if (term) {
    request = request.ilike("output_batches.batch_code", `%${term}%`);
  }
  const from = (pageN - 1) * PAGE_SIZE;
  const { data, count } = await request.order("started_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    batch_code:
      ((r.output_batches as unknown as { batch_code?: string } | null)?.batch_code as string) ?? "—",
    status: r.status as string,
    result: (r.result as ExerciseResult | null) ?? null,
    started_at: r.started_at as string,
    completed_at: (r.completed_at as string | null) ?? null,
    gaps_count: Number(r.gaps_count ?? 0),
    warnings_count: Number(r.warnings_count ?? 0),
    started_by_email:
      ((r.started_by as unknown as { email?: string } | null)?.email as string) ?? null,
  }));
  return { rows, total: count ?? 0, page: pageN, pageSize: PAGE_SIZE };
}

export async function getTraceabilityExercise(orgId: string, id: string) {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("traceability_exercises")
    .select("id, status, result, snapshot, schema_version, source_hash, started_at, completed_at, gaps_count, warnings_count, notes, output_batch_id")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/** Selector ACOTADO de lotes producidos para iniciar el ejercicio: búsqueda
 *  por código, máx. 20 opciones (patrón de selectores PCR-02.1). */
export async function searchOutputBatchesForExercise(
  orgId: string,
  q: string | undefined
): Promise<Array<{ id: string; batch_code: string; produced_quantity_kg: number | null }>> {
  const supabase = await createServerClient();
  let request = supabase
    .from("output_batches")
    .select("id, batch_code, produced_quantity_kg")
    .eq("organization_id", orgId);
  const term = (q ?? "").trim().replace(/[%_]/g, "");
  if (term) request = request.ilike("batch_code", `%${term}%`);
  const { data } = await request.order("created_at", { ascending: false }).limit(20);
  return (data ?? []).map((b) => ({
    id: b.id as string,
    batch_code: b.batch_code as string,
    produced_quantity_kg: b.produced_quantity_kg === null ? null : Number(b.produced_quantity_kg),
  }));
}
