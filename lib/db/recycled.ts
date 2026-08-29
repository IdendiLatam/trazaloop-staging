import "server-only";

import { createServerClient } from "@/lib/supabase/server";

export type DefensibilityLevel = "preliminary" | "with_warnings" | "defensible";

export const LEVEL_LABEL: Record<DefensibilityLevel, string> = {
  preliminary: "Preliminar",
  with_warnings: "Con advertencias",
  defensible: "Defendible",
};

export const EXCLUSION_LABEL: Record<string, string> = {
  same_process_or_never_counts:
    "Recuperado en el mismo proceso: suma a la masa total pero nunca cuenta como reciclado",
  postindustrial_not_reclassified:
    "Postindustrial sin reclasificación soportada",
  other_not_supported_in_methodology_v1:
    "Clasificación \u201cOtro\u201d no soportada en la metodología v1",
  non_recycled_material: "Material no reciclado (virgen, aditivo, pigmento, carga o masterbatch)",
  not_eligible_classification: "Clasificación no elegible según la metodología",
  invalid_reclassification_support: "Reclasificación sin soporte completo y validado",
  missing_origin_support: "Sin evidencia de soporte de origen",
  origin_support_not_valid: "El soporte de origen no está validado",

  // 0147 · El vocabulario del motor vigente. Son `phi_basis`, no razones de
  // exclusión: dicen POR QUÉ la fracción vale lo que vale, y cuando vale cero
  // o no se pudo determinar, eso es exactamente la explicación que la columna
  // «por qué no cuenta» necesita. Sin estas entradas la pantalla enseñaba el
  // identificador técnico en crudo.
  declared_fraction: "Cuenta con la fracción reciclada declarada en el lote de entrada",
  same_process_not_counted:
    "Recuperado en el mismo proceso: suma a la masa total pero nunca cuenta como reciclado",
  demonstrably_non_recycled:
    "Material no reciclado (virgen, aditivo, pigmento, carga o masterbatch)",
  classification_other_not_demonstrable:
    "Clasificación «otro»: no demuestra ni que cuenta ni que no",
  no_applicable_support:
    "Sin soporte aplicable en la fecha del lote: no se puede defender que sea reciclado",
  recycled_fraction_not_declared:
    "El lote de entrada no declara qué fracción suya es reciclada",
};

export const WARNING_LABEL: Record<string, string> = {
  mass_balance_out_of_tolerance:
    "Balance de masa fuera de tolerancia (consumo vs composición)",
  produced_vs_composition_out_of_tolerance:
    "Cantidad producida difiere de la composición más del 5%",
  declared_above_calculated: "El porcentaje declarado supera al calculado",
  components_excluded_for_missing_support:
    "Hay masa elegible excluida por falta de soporte",
  postindustrial_not_reclassified_present:
    "Hay material postindustrial sin reclasificar",
  related_evidence_not_valid:
    "Hay evidencia pendiente o rechazada asociada a materiales reciclados",
};

/**
 * Un componente del cálculo, en UNA sola forma.
 *
 * 0147 · Los snapshots antiguos escribían `mass_kg`, `counted` y
 * `exclusion_reason`; el motor vigente escribe `consumed_kg`, `phi` y
 * `phi_basis`. Las pantallas leían solo la primera forma, así que un cálculo
 * de la metodología vigente enseñaba la masa vacía y «no cuenta» en cada fila.
 * La normalización se hace AQUÍ, al leer, en vez de en cada pantalla: había
 * tres —ficha, dossier y PDF— y la cuarta habría vuelto a olvidarse.
 */
export type CalculationComponent = {
  material_id: string;
  material_name: string;
  mass_kg: number;
  /** La fracción reciclada aplicada. `null` = no se pudo determinar. */
  phi: number | null;
  input_batch_code: string | null;
  classification_code: string;
  effective_classification: string;
  is_same_process: boolean;
  counts_override: boolean | null;
  origin_support_evidence_id: string | null;
  origin_support_status: string | null;
  reclassification_evidence_id: string | null;
  reclassification_support_status: string | null;
  counted: boolean;
  exclusion_reason: string | null;
  warning_codes: string[];
};

export type Calculation = {
  id: string;
  output_batch_id: string;
  methodology_id: string;
  /**
   * PT-02A · `calculated` o `incomplete`. Las tres masas son NULL cuando es
   * incompleto, y eso NO es un hueco a rellenar con cero: es la respuesta.
   */
  result_state: "calculated" | "incomplete";
  incomplete_reasons: string[];
  methodology_version: number;
  total_mass_kg: number | null;
  recycled_mass_kg: number | null;
  recycled_percent: number | null;
  declared_percent: number | null;
  risk_flag: boolean;
  defensibility_level: DefensibilityLevel;
  warnings: string[];
  components: CalculationComponent[];
  calculated_at: string;
};

export type LatestBatchRecycled = {
  calculation_id: string;
  output_batch_id: string;
  output_batch_code: string;
  production_order_id: string | null;
  production_order_code: string | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  family_id: string | null;
  produced_date: string | null;
  // PT-02A · Nulables porque un cálculo `incomplete` NO tiene número. Estaban
  // como `number` y `num(null)` los convertía en 0: la lista enseñaba «0,00 %»
  // sobre un lote del que no se sabía nada, que es la peor lectura posible.
  recycled_mass_kg: number | null;
  total_mass_kg: number | null;
  recycled_percent: number | null;
  declared_percent: number | null;
  risk_flag: boolean;
  defensibility_level: DefensibilityLevel;
  calculated_at: string;
  result_state: "calculated" | "incomplete";
  incomplete_reasons: string[];
  methodology_version: number;
};

const num = (v: unknown): number => Number(v);

/** Las dos formas de componente, leídas como una. Ver CalculationComponent. */
function normalizeComponent(c: Record<string, unknown>): CalculationComponent {
  const phi = numOrNull(c.phi);
  const counted = "counted" in c ? Boolean(c.counted) : phi !== null && phi > 0;
  return {
    ...(c as unknown as CalculationComponent),
    mass_kg: num(c.mass_kg ?? c.consumed_kg),
    phi,
    input_batch_code: (c.input_batch_code as string | null) ?? null,
    counted,
    exclusion_reason:
      (c.exclusion_reason as string | null) ??
      (counted ? null : ((c.phi_basis as string | null) ?? null)),
    origin_support_status:
      (c.origin_support_status as string | null) ??
      (c.evidence_basis as string | null) ??
      null,
    is_same_process:
      Boolean(c.is_same_process) || c.phi_basis === "same_process_not_counted",
    warning_codes: (c.warning_codes as string[]) ?? [],
  };
}
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function mapCalculation(r: Record<string, unknown>): Calculation {
  return {
    id: r.id as string,
    output_batch_id: r.output_batch_id as string,
    methodology_id: r.methodology_id as string,
    result_state: (r.result_state as "calculated" | "incomplete") ?? "calculated",
    incomplete_reasons: (r.incomplete_reasons as string[]) ?? [],
    methodology_version: Number(r.methodology_version ?? 1),
    // numOrNull y no num: un cero y un «no se sabe» no pueden colapsar en el
    // mismo valor justo aquí, que es donde empieza a leerse el dato.
    total_mass_kg: numOrNull(r.total_mass_kg),
    recycled_mass_kg: numOrNull(r.recycled_mass_kg),
    recycled_percent: numOrNull(r.recycled_percent),
    declared_percent: numOrNull(r.declared_percent),
    risk_flag: Boolean(r.risk_flag),
    defensibility_level: r.defensibility_level as DefensibilityLevel,
    warnings: (r.warnings as string[]) ?? [],
    components: ((r.components as Record<string, unknown>[]) ?? []).map(normalizeComponent),
    calculated_at: r.calculated_at as string,
  };
}

export async function listLatestCalculations(
  orgId: string,
  limit?: number
): Promise<LatestBatchRecycled[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("v_latest_batch_recycled")
    .select("*")
    .eq("organization_id", orgId)
    .order("calculated_at", { ascending: false });
  if (limit) query = query.limit(limit);
  const { data } = await query;
  return (data ?? []).map((r) => ({
    ...r,
    recycled_mass_kg: numOrNull(r.recycled_mass_kg),
    total_mass_kg: numOrNull(r.total_mass_kg),
    recycled_percent: numOrNull(r.recycled_percent),
    declared_percent: numOrNull(r.declared_percent),
    result_state: (r.result_state as "calculated" | "incomplete") ?? "calculated",
    incomplete_reasons: (r.incomplete_reasons as string[]) ?? [],
    methodology_version: Number(r.methodology_version ?? 1),
  })) as LatestBatchRecycled[];
}

export async function listCalculationsForBatch(
  orgId: string,
  outputBatchId: string
): Promise<Calculation[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("recycled_content_calculations")
    .select("*")
    .eq("organization_id", orgId)
    .eq("output_batch_id", outputBatchId)
    .order("calculated_at", { ascending: false });
  return (data ?? []).map(mapCalculation);
}

export async function getCalculationDetail(
  orgId: string,
  calculationId: string
): Promise<Calculation | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("recycled_content_calculations")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", calculationId)
    .maybeSingle();
  return data ? mapCalculation(data) : null;
}

export type RecycledDashboard = {
  batchesWithCalculation: number;
  batchesWithoutCalculation: number;
  defensible: number;
  withWarnings: number;
  preliminary: number;
  lastCalculation: LatestBatchRecycled | null;
  latest: LatestBatchRecycled[];
};

export async function getRecycledDashboard(orgId: string): Promise<RecycledDashboard> {
  const supabase = await createServerClient();
  const [latest, batches] = await Promise.all([
    listLatestCalculations(orgId),
    supabase
      .from("output_batches")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
  ]);
  const totalBatches = batches.count ?? 0;
  return {
    batchesWithCalculation: latest.length,
    batchesWithoutCalculation: Math.max(totalBatches - latest.length, 0),
    defensible: latest.filter((l) => l.defensibility_level === "defensible").length,
    withWarnings: latest.filter((l) => l.defensibility_level === "with_warnings").length,
    preliminary: latest.filter((l) => l.defensibility_level === "preliminary").length,
    lastCalculation: latest[0] ?? null,
    latest: latest.slice(0, 10),
  };
}

export type AggregateRow = {
  recycled_mass_kg: number | null;
  total_mass_kg: number | null;
  recycled_percent: number | null;
  /** null = sin cálculos en el alcance (Sprint 4.1). */
  defensibility_level: DefensibilityLevel | null;
  /** Lotes producidos / lotes finales en el alcance del agregado (Sprint 4.1). */
  total_batches_count: number;
  calculated_batches_count: number;
  uncalculated_batches_count: number;
  has_uncalculated_batches: boolean;
  [key: string]: unknown;
};

async function readAggregate(view: string, orgId: string): Promise<AggregateRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase.from(view).select("*").eq("organization_id", orgId);
  return (data ?? []).map((r) => ({
    ...r,
    recycled_mass_kg: numOrNull(r.recycled_mass_kg),
    total_mass_kg: numOrNull(r.total_mass_kg),
    recycled_percent: numOrNull(r.recycled_percent),
    // v_recycled_by_order expone el total como output_batches_count;
    // las demás vistas como total_batches_count (Sprint 4.1).
    total_batches_count: Number(r.total_batches_count ?? r.output_batches_count ?? 0),
    calculated_batches_count: Number(r.calculated_batches_count ?? 0),
    uncalculated_batches_count: Number(r.uncalculated_batches_count ?? 0),
    has_uncalculated_batches: Boolean(r.has_uncalculated_batches),
  })) as AggregateRow[];
}

export const getRecycledByOrder = (orgId: string) => readAggregate("v_recycled_by_order", orgId);
export const getRecycledByProduct = (orgId: string) => readAggregate("v_recycled_by_product", orgId);
export const getRecycledByFamily = (orgId: string) => readAggregate("v_recycled_by_family", orgId);
export const getRecycledByPeriod = (orgId: string) => readAggregate("v_recycled_by_period", orgId);
