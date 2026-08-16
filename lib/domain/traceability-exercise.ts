/**
 * PCR-03.2 · Dominio PURO del ejercicio de trazabilidad pre-auditoría.
 *
 * Recibe datos YA COLECTADOS (grafo de genealogía PCR-02, saldos PCR-02.5,
 * evidencias gobernadas PCR-03.1, requisitos de cliente y cálculo PCR) y
 * ensambla el snapshot con sus observaciones clasificadas. NO consulta la
 * base: la reconstrucción multinivel reutiliza traceBackward (ciclos y
 * profundidad acotada resueltos en PCR-02), y este módulo se prueba con
 * llamadas reales en la suite unitaria.
 *
 * Lenguaje prudente obligatorio: resultado interno complete /
 * complete_with_warnings / incomplete — jamás "cumple / no cumple",
 * "aprobado" ni "certificado". La ausencia de un dato OPCIONAL no es una
 * brecha: se clasifica como información o advertencia.
 */
import { createHash } from "node:crypto";
import {
  traceBackward,
  GENEALOGY_MAX_DEPTH,
  type GenealogyGraph,
  type BackwardStage,
} from "@/lib/domain/genealogy";
import { isEvidenceCurrent } from "@/lib/domain/evidence-governance";

export const EXERCISE_SCHEMA_VERSION = "pcr_traceability_exercise_v1" as const;

export const EXERCISE_RESULTS = ["complete", "complete_with_warnings", "incomplete"] as const;
export type ExerciseResult = (typeof EXERCISE_RESULTS)[number];

export const EXERCISE_RESULT_LABEL: Record<ExerciseResult, string> = {
  complete: "Completo",
  complete_with_warnings: "Completo con advertencias",
  incomplete: "Incompleto",
};

export const EXERCISE_STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  completed: "Finalizado",
  archived: "Archivado",
};

export const EXERCISE_DISCLAIMER =
  "Este resultado corresponde a un ejercicio interno de preparación y no constituye una auditoría, certificación ni dictamen de conformidad.";

export type FindingLevel = "info" | "warning" | "gap";

export const FINDING_LEVEL_LABEL: Record<FindingLevel, string> = {
  info: "Información",
  warning: "Advertencia",
  gap: "Brecha documental",
};

export type ExerciseFinding = {
  level: FindingLevel;
  area:
    | "identidad"
    | "cantidades"
    | "trazabilidad_externa"
    | "trazabilidad_interna"
    | "evidencias"
    | "cliente"
    | "calidad"
    | "pcr";
  message: string;
  /** Recomendación práctica para cerrar la observación antes de la auditoría. */
  recommendation?: string;
};

/** Evidencia YA gobernada (PCR-03.1) vinculada a una entidad de la cadena. */
export type LinkedEvidenceInput = {
  target_type: string;
  target_id: string;
  target_label: string;
  name: string;
  evidence_type: string | null;
  status: string;
  medium: string;
  archived_at: string | null;
  physical_reference: string | null;
  link_role: string | null;
  /** (rev. 03.1–03.3.3, hallazgo 5) Metadata completa para la matriz del
   * expediente; opcional porque la fuente de verdad es el builder SQL y
   * este tipo también sirve a los fixtures de las pruebas del contrato.
   * JAMÁS transporta signed URLs: solo has_digital_file como indicador. */
  evidence_id?: string | null;
  evidence_date?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reviewed_by_email?: string | null;
  review_comment?: string | null;
  responsible?: string | null;
  physical_location?: string | null;
  physical_custodian?: string | null;
  has_digital_file?: boolean;
};

export type BalanceInput = {
  input_batches: Array<{ id: string; batch_code: string; received_kg: number; consumed_kg: number; available_kg: number }>;
  output_batches: Array<{ id: string; batch_code: string; produced_kg: number; consumed_internally_kg: number; available_kg: number }>;
};

export type RequirementInput = {
  code: string;
  customer_name: string;
  title: string;
  active: boolean;
  target_label: string;
};

export type CalculationInput = {
  recycled_percent: number;
  calculated_at: string;
  level: string;
  warnings: string[];
  /** (rev. 03.1–03.3.4) Componentes explicados del motor PCR (0028): el
   * builder SQL los expone para que el expediente pueda localizar el MISMO
   * soporte que usó calculate_recycled_content. Opcional: los fixtures del
   * contrato no los requieren. */
  components?: unknown[];
} | null;

export type ExerciseCollectedData = {
  organization_name: string;
  target: {
    output_batch_id: string;
    batch_code: string;
    product_label: string | null;
    produced_quantity_kg: number | null;
  };
  graph: GenealogyGraph;
  balances: BalanceInput;
  evidences: LinkedEvidenceInput[];
  requirements: RequirementInput[];
  calculation: CalculationInput;
};

export type ExerciseSnapshot = {
  schema_version: typeof EXERCISE_SCHEMA_VERSION;
  disclaimer: typeof EXERCISE_DISCLAIMER;
  target: ExerciseCollectedData["target"] & { organization_name: string };
  chain: Array<{
    depth: number;
    output_batch: string;
    order: string | null;
    order_status: string | null;
    external_inputs: Array<{ batch_code: string; material: string | null; supplier: string | null; mass_kg: number }>;
    internal_inputs: Array<{ batch_code: string; mass_kg: number }>;
    truncated: boolean;
  }>;
  balances: BalanceInput;
  evidences: Array<LinkedEvidenceInput & { review_label: string; current: boolean }>;
  requirements: RequirementInput[];
  calculation: CalculationInput;
  findings: ExerciseFinding[];
  counts: {
    orders: number;
    external_batches: number;
    internal_batches: number;
    suppliers: number;
    evidences: number;
    gaps: number;
    warnings: number;
  };
  result: ExerciseResult;
};

/** JSON canónico (claves ordenadas) para un hash determinista. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function computeSnapshotHash(snapshot: unknown): string {
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

const REVIEW_LABEL: Record<string, string> = {
  pending: "Pendiente de revisión",
  valid: "Aceptada internamente",
  rejected: "Rechazada",
  expired: "Vencida",
};

/** Ensambla el ejercicio completo a partir de los datos colectados. */
export function buildExerciseSnapshot(data: ExerciseCollectedData): ExerciseSnapshot {
  const findings: ExerciseFinding[] = [];
  const add = (f: ExerciseFinding) => findings.push(f);

  // ── Reconstrucción multinivel (reutiliza PCR-02: ciclos + profundidad) ──
  const stages: BackwardStage[] = traceBackward(data.graph, data.target.output_batch_id, GENEALOGY_MAX_DEPTH);

  const chain = stages.map((s) => ({
    depth: s.depth,
    output_batch: s.output.batch_code,
    order: s.order?.order_code ?? null,
    order_status: s.order?.status ?? null,
    external_inputs: s.externalInputs.map((e) => ({
      batch_code: e.input.batch_code,
      material: e.input.material_name,
      supplier: e.input.supplier_name,
      mass_kg: e.mass_kg,
    })),
    internal_inputs: s.internalInputs.map((i) => ({
      batch_code: i.output.batch_code,
      mass_kg: i.mass_kg,
    })),
    truncated: s.truncated,
  }));

  // ── Identidad (6.3) ──
  add({ level: "info", area: "identidad", message: `Lote objetivo ${data.target.batch_code} identificado en Trazaloop.` });
  if (data.target.product_label) {
    add({ level: "info", area: "identidad", message: `Producto asociado: ${data.target.product_label}.` });
  } else {
    add({
      level: "warning",
      area: "identidad",
      message: "El lote no tiene producto asociado (dato opcional).",
      recommendation: "Asocia el producto comercial en Trazabilidad → Lotes producidos para un expediente más completo.",
    });
  }
  const rootOrder = chain[0]?.order ?? null;
  if (rootOrder) {
    add({ level: "info", area: "identidad", message: `Orden / corrida productora: ${rootOrder}.` });
  }

  // ── Cantidades (6.3) ──
  if (data.target.produced_quantity_kg && data.target.produced_quantity_kg > 0) {
    add({ level: "info", area: "cantidades", message: `Cantidad producida registrada: ${data.target.produced_quantity_kg} kg.` });
  } else {
    add({
      level: "gap",
      area: "cantidades",
      message: "El lote no tiene cantidad producida válida.",
      recommendation: "Registra la cantidad real con la empresa (obligatoria desde PCR-02.5).",
    });
  }
  const totalExternal = chain.reduce((n, s) => n + s.external_inputs.length, 0);
  const totalInternal = chain.reduce((n, s) => n + s.internal_inputs.length, 0);
  if (totalExternal + totalInternal === 0) {
    add({
      level: "gap",
      area: "cantidades",
      message: "La orden productora no tiene consumos registrados: la trazabilidad hacia atrás no puede demostrarse.",
      recommendation: "Registra los consumos de lotes de entrada (o internos) de la orden / corrida.",
    });
  } else {
    add({ level: "info", area: "cantidades", message: `Consumos registrados: ${totalExternal} externo(s) y ${totalInternal} interno(s) en la cadena.` });
  }
  for (const b of data.balances.input_batches) {
    if (b.available_kg < 0) {
      add({
        level: "gap",
        area: "cantidades",
        message: `El lote de entrada ${b.batch_code} presenta consumo por encima de lo recibido (saldo ${b.available_kg} kg).`,
        recommendation: "Corrige las cantidades reales con la empresa; las guardas PCR-02.5 impiden nuevos sobreconsumos.",
      });
    }
  }
  for (const b of data.balances.output_batches) {
    if (b.available_kg < 0) {
      add({
        level: "gap",
        area: "cantidades",
        message: `El lote producido ${b.batch_code} presenta consumo interno por encima de lo producido.`,
        recommendation: "Corrige las cantidades reales con la empresa.",
      });
    }
  }

  // ── Trazabilidad externa (6.3) ──
  const materials = new Set<string>();
  const suppliers = new Set<string>();
  for (const s of chain) {
    for (const e of s.external_inputs) {
      if (e.material) materials.add(e.material);
      if (e.supplier) suppliers.add(e.supplier);
      if (!e.material) {
        add({
          level: "warning",
          area: "trazabilidad_externa",
          message: `El lote de entrada ${e.batch_code} no tiene material identificado.`,
          recommendation: "Asigna el material en Catálogos para poder defender el origen.",
        });
      }
      if (!e.supplier) {
        add({
          level: "warning",
          area: "trazabilidad_externa",
          message: `El lote de entrada ${e.batch_code} no tiene proveedor identificado.`,
        });
      }
    }
  }
  if (totalExternal > 0) {
    add({
      level: "info",
      area: "trazabilidad_externa",
      message: `${totalExternal} lote(s) de entrada, ${materials.size} material(es) y ${suppliers.size} proveedor(es) identificados en la cadena.`,
    });
  }

  // ── Trazabilidad interna (6.3): multinivel, ciclos y profundidad ──
  if (totalInternal > 0) {
    add({
      level: "info",
      area: "trazabilidad_interna",
      message: `La cadena incluye ${totalInternal} consumo(s) de lotes producidos por órdenes anteriores (genealogía multinivel, profundidad máxima ${GENEALOGY_MAX_DEPTH}).`,
    });
  }
  if (chain.some((s) => s.truncated)) {
    add({
      level: "warning",
      area: "trazabilidad_interna",
      message: `La reconstrucción alcanzó la profundidad máxima (${GENEALOGY_MAX_DEPTH} niveles): pueden existir eslabones anteriores no mostrados.`,
      recommendation: "Ejecuta un ejercicio sobre el lote intermedio más profundo para continuar la cadena.",
    });
  }

  // ── Evidencias (6.3): estados gobernados PCR-03.1 ──
  const evidences = data.evidences.map((e) => ({
    ...e,
    review_label: e.archived_at
      ? `${REVIEW_LABEL[e.status] ?? e.status} · Archivada`
      : (REVIEW_LABEL[e.status] ?? e.status),
    current: isEvidenceCurrent(e.status, e.archived_at),
  }));
  const currentCount = evidences.filter((e) => e.current).length;
  const pendingCount = evidences.filter((e) => e.status === "pending" && !e.archived_at).length;
  const rejectedCount = evidences.filter((e) => e.status === "rejected").length;
  const physicalCount = evidences.filter((e) => e.medium !== "digital").length;
  add({
    level: "info",
    area: "evidencias",
    message: `${evidences.length} evidencia(s) vinculada(s) a la cadena: ${currentCount} aceptada(s) internamente y vigente(s), ${pendingCount} pendiente(s), ${rejectedCount} rechazada(s), ${physicalCount} con soporte físico declarado.`,
  });
  if (pendingCount > 0) {
    add({
      level: "warning",
      area: "evidencias",
      message: `${pendingCount} evidencia(s) siguen pendientes de revisión interna.`,
      recommendation: "Revisa y acepta internamente (o rechaza con motivo) antes de la auditoría.",
    });
  }
  if (rejectedCount > 0) {
    add({
      level: "warning",
      area: "evidencias",
      message: `${rejectedCount} evidencia(s) rechazada(s): no cuentan como soporte vigente.`,
      recommendation: "Sustituye el soporte rechazado por evidencia aceptable.",
    });
  }
  // Brecha documental: un MATERIAL de la cadena sin ninguna evidencia
  // vigente que lo soporte (directa o vía su lote/proveedor).
  const materialIds = new Map<string, string>();
  for (const [, input] of data.graph.inputs) {
    if (input.material_name) materialIds.set(input.material_name, input.id);
  }
  for (const [name, inputId] of materialIds) {
    const covered = evidences.some(
      (e) => e.current && e.target_type === "material" && e.target_label.includes(name)
    );
    const viaBatch = evidences.some(
      (e) => e.current && e.target_type === "input_batch" && e.target_id === inputId
    );
    if (!covered && !viaBatch) {
      add({
        level: "gap",
        area: "evidencias",
        message: `El material ${name} no tiene evidencia vigente de soporte vinculada.`,
        recommendation: "Vincula y acepta internamente la evidencia de origen del material (Evidencias → Asociar).",
      });
    }
  }

  // ── Cliente (6.3): la ausencia es información, no brecha ──
  if (data.requirements.length > 0) {
    add({
      level: "info",
      area: "cliente",
      message: `${data.requirements.length} acuerdo(s)/requisito(s) de cliente aplicables a la cadena.`,
    });
    for (const r of data.requirements.filter((x) => !x.active)) {
      add({ level: "info", area: "cliente", message: `El requisito ${r.code} (${r.customer_name}) está inactivo.` });
    }
  } else {
    add({ level: "info", area: "cliente", message: "Sin acuerdos/requisitos de cliente registrados para esta cadena (dato opcional)." });
  }

  // ── Calidad (6.3): solo lo que exista ──
  const qualityEvidences = evidences.filter((e) =>
    ["quality_control", "non_conformity", "customer_claim"].includes(e.evidence_type ?? "")
  );
  if (qualityEvidences.length > 0) {
    add({
      level: "info",
      area: "calidad",
      message: `${qualityEvidences.length} evidencia(s) de calidad / no conformidad / reclamación vinculadas.`,
    });
  } else {
    add({ level: "info", area: "calidad", message: "Sin registros de calidad, NC o reclamaciones vinculados (dato opcional)." });
  }

  // ── PCR (6.3): sin tocar la metodología, solo visibilidad ──
  if (data.calculation) {
    add({
      level: "info",
      area: "pcr",
      message: `Cálculo PCR disponible: ${data.calculation.recycled_percent}% (según la metodología vigente).`,
    });
    for (const w of data.calculation.warnings) {
      add({ level: "warning", area: "pcr", message: `Advertencia del cálculo: ${w}` });
    }
  } else {
    add({
      level: "warning",
      area: "pcr",
      message: "El lote no tiene cálculo de contenido reciclado disponible.",
      recommendation: "Ejecuta el cálculo en Contenido reciclado si el lote lo requiere.",
    });
  }

  // ── Resultado interno prudente (6.4) ──
  const gaps = findings.filter((f) => f.level === "gap").length;
  const warnings = findings.filter((f) => f.level === "warning").length;
  const result: ExerciseResult =
    gaps > 0 ? "incomplete" : warnings > 0 ? "complete_with_warnings" : "complete";

  const orders = new Set(chain.map((s) => s.order).filter(Boolean)).size;
  const externalBatches = new Set(chain.flatMap((s) => s.external_inputs.map((e) => e.batch_code))).size;
  const internalBatches = new Set(chain.flatMap((s) => s.internal_inputs.map((i) => i.batch_code))).size;

  return {
    schema_version: EXERCISE_SCHEMA_VERSION,
    disclaimer: EXERCISE_DISCLAIMER,
    target: { ...data.target, organization_name: data.organization_name },
    chain,
    balances: data.balances,
    evidences,
    requirements: data.requirements,
    calculation: data.calculation,
    findings,
    counts: {
      orders,
      external_batches: externalBatches,
      internal_batches: internalBatches,
      suppliers: suppliers.size,
      evidences: evidences.length,
      gaps,
      warnings,
    },
    result,
  };
}
