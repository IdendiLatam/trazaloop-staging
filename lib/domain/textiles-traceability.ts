/**
 * Trazaloop · Sprint T6 (Textil) · Dominio PURO de trazabilidad: órdenes/
 * corridas, lotes de entrada, consumos, procesos y lotes producidos/
 * finales. Sin BD ni sesión; testeable en
 * tests/traceability/textiles-traceability.test.ts. Los enums espejan los
 * CHECK de la migración 0078.
 *
 * LENGUAJE: la trazabilidad registrada es TÉCNICA e interna — describe qué
 * se produjo, con qué insumos y con qué soporte documental; jamás
 * cumplimiento ni certificación.
 */

export const TEXTILE_ORDER_STATUSES = [
  "draft", "in_progress", "completed", "cancelled", "archived",
] as const;
export type TextileOrderStatus = (typeof TEXTILE_ORDER_STATUSES)[number];
export const TEXTILE_ORDER_STATUS_LABEL: Record<TextileOrderStatus, string> = {
  draft: "Borrador",
  in_progress: "En proceso",
  completed: "Terminada",
  cancelled: "Cancelada",
  archived: "Archivada",
};

export const TEXTILE_LOT_TYPES = ["material", "component"] as const;
export type TextileLotType = (typeof TEXTILE_LOT_TYPES)[number];
export const TEXTILE_LOT_TYPE_LABEL: Record<TextileLotType, string> = {
  material: "Material / insumo",
  component: "Avío / componente",
};

export const TEXTILE_INPUT_LOT_STATUSES = [
  "available", "partially_consumed", "consumed", "blocked", "archived",
] as const;
export type TextileInputLotStatus = (typeof TEXTILE_INPUT_LOT_STATUSES)[number];
export const TEXTILE_INPUT_LOT_STATUS_LABEL: Record<TextileInputLotStatus, string> = {
  available: "Disponible",
  partially_consumed: "Parcialmente consumido",
  consumed: "Consumido",
  blocked: "Bloqueado",
  archived: "Archivado",
};

export const TEXTILE_CONSUMPTION_ROLES = [
  "main_fabric", "secondary_fabric", "lining", "thread", "interlining",
  "label", "trim", "packaging", "other",
] as const;
export type TextileConsumptionRole = (typeof TEXTILE_CONSUMPTION_ROLES)[number];
export const TEXTILE_CONSUMPTION_ROLE_LABEL: Record<TextileConsumptionRole, string> = {
  main_fabric: "Tela principal",
  secondary_fabric: "Tela secundaria",
  lining: "Forro",
  thread: "Hilo",
  interlining: "Entretela",
  label: "Etiqueta / marquilla",
  trim: "Avío",
  packaging: "Empaque",
  other: "Otro",
};

export const TEXTILE_STEP_TYPES = ["internal", "outsourced"] as const;
export type TextileStepType = (typeof TEXTILE_STEP_TYPES)[number];
export const TEXTILE_STEP_TYPE_LABEL: Record<TextileStepType, string> = {
  internal: "Proceso interno",
  outsourced: "Proceso tercerizado",
};

export const TEXTILE_STEP_STATUSES = [
  "pending", "in_progress", "completed", "skipped", "blocked",
] as const;
export type TextileStepStatus = (typeof TEXTILE_STEP_STATUSES)[number];
export const TEXTILE_STEP_STATUS_LABEL: Record<TextileStepStatus, string> = {
  pending: "Pendiente",
  in_progress: "En proceso",
  completed: "Completado",
  skipped: "Omitido",
  blocked: "Bloqueado",
};

export const TEXTILE_OUTPUT_LOT_STATUSES = [
  "draft", "produced", "under_review", "released", "blocked", "archived",
] as const;
export type TextileOutputLotStatus = (typeof TEXTILE_OUTPUT_LOT_STATUSES)[number];
export const TEXTILE_OUTPUT_LOT_STATUS_LABEL: Record<TextileOutputLotStatus, string> = {
  draft: "Borrador",
  produced: "Producido",
  under_review: "En revisión interna",
  released: "Liberado internamente",
  blocked: "Bloqueado",
  archived: "Archivado",
};

export const TEXTILE_TRACEABILITY_STATUSES = [
  "not_started", "incomplete", "complete", "needs_review",
] as const;
export type TextileTraceabilityStatus = (typeof TEXTILE_TRACEABILITY_STATUSES)[number];
export const TEXTILE_TRACEABILITY_STATUS_LABEL: Record<TextileTraceabilityStatus, string> = {
  not_started: "No iniciada",
  incomplete: "Incompleta",
  complete: "Completa",
  needs_review: "Requiere revisión",
};

export const TEXTILE_TRACEABILITY_DISCLAIMER =
  "La trazabilidad registrada no equivale por sí sola a certificación ni validación " +
  "externa. Es información técnica interna que prepara soporte documental y revisión.";

/** Cantidad de formulario: número > 0 (hasta 2 decimales). */
export function parseQuantity(raw: unknown):
  | { value: number; error: null }
  | { value: null; error: string } {
  const text = typeof raw === "string" ? raw.trim().replace(",", ".") : String(raw ?? "");
  if (text.length === 0) return { value: null, error: "La cantidad es obligatoria." };
  const num = Number(text);
  if (!Number.isFinite(num)) return { value: null, error: "La cantidad debe ser un número." };
  const rounded = Math.round(num * 100) / 100;
  if (rounded <= 0) return { value: null, error: "La cantidad debe ser mayor que 0." };
  return { value: rounded, error: null };
}

// ---------------------------------------------------------------------------
// Balance de lote de entrada (sin conversión de unidades)
// ---------------------------------------------------------------------------

export type LotBalanceInput = {
  quantityReceived: number | null;
  unit: string | null;
  consumptions: Array<{ quantity: number; unit: string }>;
};

export type LotBalance = {
  consumed: number;
  remaining: number | null;
  otherUnitCount: number;
  /** Estado derivado SOLO entre available/partially_consumed/consumed;
   * blocked/archived los administra la empresa y nunca se pisan. */
  derivedStatus: "available" | "partially_consumed" | "consumed";
};

const norm = (u: string | null) => (u ?? "").trim().toLowerCase();

export function computeInputLotBalance(input: LotBalanceInput): LotBalance {
  const lotUnit = norm(input.unit);
  let consumed = 0;
  let otherUnitCount = 0;
  for (const c of input.consumptions) {
    if (lotUnit && norm(c.unit) === lotUnit) consumed += c.quantity;
    else otherUnitCount += 1;
  }
  consumed = Math.round(consumed * 100) / 100;
  const remaining =
    input.quantityReceived === null ? null : Math.round((input.quantityReceived - consumed) * 100) / 100;
  let derivedStatus: LotBalance["derivedStatus"] = "available";
  if (consumed > 0) {
    derivedStatus = remaining !== null && remaining <= 0 ? "consumed" : "partially_consumed";
  }
  return { consumed, remaining, otherUnitCount, derivedStatus };
}

// ---------------------------------------------------------------------------
// Estado de trazabilidad y brechas simples (encargo T6 §9)
// ---------------------------------------------------------------------------

export type TraceabilityGap = { code: string; message: string };

export type TraceabilityInput = {
  hasOrder: boolean;
  hasReference: boolean;
  consumptionCount: number;
  processStepCount: number;
  hasOutputLot: boolean;
  /** Lotes consumidos con sobreconsumo detectado en su unidad. */
  overconsumedLotCodes: string[];
  /** Lotes consumidos sin proveedor registrado. */
  lotsWithoutSupplier: string[];
  /** Consumos cuya unidad no coincide con la del lote (no comparables). */
  unitMismatchedConsumptions: number;
  /** Brechas de evidencia de la referencia (reciclado/orgánico/composición, T5). */
  referenceEvidenceGapCount: number;
  /** Pasos tercerizados sin evidencia de ejecución vinculada. */
  outsourcedStepsWithoutSupport: string[];
};

export type TraceabilityEvaluation = {
  status: TextileTraceabilityStatus;
  gaps: TraceabilityGap[];
};

/**
 * Estado de completitud de trazabilidad de un lote producido/final:
 *  · not_started — sin orden válida, o con orden pero sin consumos NI
 *    procesos registrados;
 *  · needs_review — hay datos pero con brechas: sobreconsumo, lote sin
 *    proveedor, unidades no comparables, declaraciones sin soporte (T5) o
 *    tercerizados sin soporte de ejecución;
 *  · complete — orden + referencia + al menos un consumo + lote final,
 *    sin ninguna brecha;
 *  · incomplete — el resto (hay avances pero faltan piezas).
 * Nunca bloquea: describe y lista brechas.
 */
export function computeTraceabilityStatus(input: TraceabilityInput): TraceabilityEvaluation {
  const gaps: TraceabilityGap[] = [];

  for (const code of input.overconsumedLotCodes) {
    gaps.push({
      code: "overconsumption",
      message: `Brecha: el lote ${code} registra consumos por encima de la cantidad recibida.`,
    });
  }
  for (const code of input.lotsWithoutSupplier) {
    gaps.push({
      code: "lot_without_supplier",
      message: `Brecha: el lote ${code} no tiene proveedor registrado.`,
    });
  }
  if (input.unitMismatchedConsumptions > 0) {
    gaps.push({
      code: "unit_mismatch",
      message: `Brecha: ${input.unitMismatchedConsumptions} consumo(s) usan una unidad distinta a la del lote (no comparables, sin conversión automática).`,
    });
  }
  if (input.referenceEvidenceGapCount > 0) {
    gaps.push({
      code: "reference_evidence_gaps",
      message: `Brecha: la referencia tiene ${input.referenceEvidenceGapCount} brecha(s) de evidencia (composición o declaraciones sin soporte).`,
    });
  }
  for (const name of input.outsourcedStepsWithoutSupport) {
    gaps.push({
      code: "outsourced_without_support",
      message: `Brecha: el proceso tercerizado "${name}" no tiene soporte documental vinculado.`,
    });
  }

  if (!input.hasOrder || (input.consumptionCount === 0 && input.processStepCount === 0)) {
    return { status: "not_started", gaps };
  }
  if (gaps.length > 0) {
    return { status: "needs_review", gaps };
  }
  if (input.hasReference && input.consumptionCount > 0 && input.hasOutputLot) {
    return { status: "complete", gaps };
  }
  return { status: "incomplete", gaps };
}
