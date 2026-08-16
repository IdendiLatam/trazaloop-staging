/**
 * PCR-03.3 · Lectura de expedientes + insumos para generarlos. Consultas
 * acotadas por organización y paginadas. La detección de «cambios
 * posteriores» es una HEURÍSTICA barata y honesta: existe un ejercicio
 * completado más reciente que el usado, o el lote/orden cambió después de
 * la generación (updated_at > generated_at). No reescribe nada.
 */
import { createServerClient } from "@/lib/supabase/server";

export type DossierListRow = {
  id: string;
  dossier_code: string;
  version: number;
  status: string;
  batch_code: string;
  product_label: string | null;
  generated_at: string;
  gaps_count: number;
  warnings_count: number;
  has_exercise: boolean;
};

const PAGE_SIZE = 20;

export async function listAuditDossiers(
  orgId: string,
  opts: { q?: string; status?: string; page?: string } = {}
): Promise<{ rows: DossierListRow[]; total: number; page: number; pageSize: number }> {
  const pageN = Math.max(1, Math.floor(Number(opts.page ?? "1")) || 1);
  const supabase = await createServerClient();
  let request = supabase
    .from("audit_dossiers")
    .select(
      "id, dossier_code, version, status, generated_at, gaps_count, warnings_count, exercise_id, output_batches!audit_dossiers_output_batch_fk(batch_code, products(code, name))",
      { count: "exact" }
    )
    .eq("organization_id", orgId);
  if (opts.status && ["generated", "archived"].includes(opts.status)) {
    request = request.eq("status", opts.status);
  }
  const term = (opts.q ?? "").trim().replace(/[%_]/g, "");
  if (term) request = request.ilike("dossier_code", `%${term}%`);
  const from = (pageN - 1) * PAGE_SIZE;
  const { data, count } = await request
    .order("generated_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  return {
    rows: (data ?? []).map((r) => {
      const ob = r.output_batches as unknown as {
        batch_code?: string;
        products?: { code?: string; name?: string } | null;
      } | null;
      return {
        id: r.id as string,
        dossier_code: r.dossier_code as string,
        version: Number(r.version ?? 1),
        status: r.status as string,
        batch_code: ob?.batch_code ?? "—",
        product_label: ob?.products?.code ? `${ob.products.code} · ${ob.products.name}` : null,
        generated_at: r.generated_at as string,
        gaps_count: Number(r.gaps_count ?? 0),
        warnings_count: Number(r.warnings_count ?? 0),
        has_exercise: Boolean(r.exercise_id),
      };
    }),
    total: count ?? 0,
    page: pageN,
    pageSize: PAGE_SIZE,
  };
}

export async function getAuditDossier(orgId: string, id: string) {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("audit_dossiers")
    .select(
      "id, dossier_code, version, status, generated_at, snapshot, schema_version, source_hash, gaps_count, warnings_count, output_batch_id, exercise_id"
    )
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

/** Heurística de «Existen cambios posteriores a esta versión» (7.3). */
export async function detectChangesAfterDossier(
  orgId: string,
  dossier: { generated_at: string; output_batch_id: string; exercise_id: string | null }
): Promise<boolean> {
  const supabase = await createServerClient();
  const generatedAt = dossier.generated_at;
  const { data: batch } = await supabase
    .from("output_batches")
    .select("updated_at, production_order_id")
    .eq("organization_id", orgId)
    .eq("id", dossier.output_batch_id)
    .maybeSingle();
  if (batch?.updated_at && batch.updated_at > generatedAt) return true;
  if (batch?.production_order_id) {
    const { data: order } = await supabase
      .from("production_orders")
      .select("updated_at")
      .eq("organization_id", orgId)
      .eq("id", batch.production_order_id)
      .maybeSingle();
    if (order?.updated_at && order.updated_at > generatedAt) return true;
  }
  const { count } = await supabase
    .from("traceability_exercises")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("output_batch_id", dossier.output_batch_id)
    .eq("status", "completed")
    .gt("completed_at", generatedAt);
  return (count ?? 0) > 0;
}

/** Insumos para GENERAR: lote + su ejercicio completado más reciente. */
export async function loadDossierInputs(orgId: string, outputBatchId: string) {
  const supabase = await createServerClient();
  const { data: batch } = await supabase
    .from("output_batches")
    .select("id, batch_code, produced_quantity_kg, products(code, name)")
    .eq("organization_id", orgId)
    .eq("id", outputBatchId)
    .maybeSingle();
  if (!batch) return null;
  const { data: exercise } = await supabase
    .from("traceability_exercises")
    .select("id, started_at, completed_at, result, source_hash, snapshot")
    .eq("organization_id", orgId)
    .eq("output_batch_id", outputBatchId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const p = batch.products as unknown as { code?: string; name?: string } | null;
  return {
    batch: {
      id: batch.id as string,
      batch_code: batch.batch_code as string,
      product_label: p?.code ? `${p.code} · ${p.name}` : null,
      produced_quantity_kg:
        batch.produced_quantity_kg === null ? null : Number(batch.produced_quantity_kg),
    },
    exercise: exercise ?? null,
    // (rev. 03.1–03.3.1, hallazgo 9) La versión NO se precalcula aquí: la
    // asigna atómicamente la RPC generate_audit_dossier bajo candado.
  };
}
