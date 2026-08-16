/**
 * PCR-03.3 · Dominio PURO del expediente interno de preparación para
 * auditoría. Ensambla las secciones A–K del brief a partir del snapshot del
 * EJERCICIO completado (fuente principal, 7.1) más los metadatos de
 * generación. No consulta la base, no genera signed URLs y no toca la
 * metodología PCR: solo consolida y hace legible lo ya registrado.
 */
import type { ExerciseSnapshot } from "@/lib/domain/traceability-exercise";
import { computeSnapshotHash } from "@/lib/domain/traceability-exercise";

export const DOSSIER_SCHEMA_VERSION = "pcr_audit_dossier_v1" as const;

export const DOSSIER_STATUS_LABEL: Record<string, string> = {
  generated: "Generado",
  archived: "Archivado",
};

export const DOSSIER_DISCLAIMER =
  "Este expediente consolida información registrada en Trazaloop para apoyar la preparación interna de la empresa. No constituye una certificación, auditoría externa, declaración de conformidad ni aprobación de un organismo evaluador.";

/** Código legible EXP-PCR-AAAA-NNNN (7.3). */
export function buildDossierCode(year: number, sequence: number): string {
  return `EXP-PCR-${year}-${String(sequence).padStart(4, "0")}`;
}

export type DossierSnapshot = {
  schema_version: typeof DOSSIER_SCHEMA_VERSION;
  /** A · Portada / identificación */
  cover: {
    organization_name: string;
    batch_code: string;
    product_label: string | null;
    dossier_code: string;
    version: number;
    generated_at: string;
    generated_by_email: string | null;
  };
  /** B · Resumen */
  summary: {
    exercise_result: string | null;
    produced_quantity_kg: number | null;
    orders: number;
    external_batches: number;
    internal_batches: number;
    suppliers: number;
    evidences: number;
    gaps: number;
    warnings: number;
  };
  /** C · Genealogía (cadena completa hacia atrás) */
  genealogy: ExerciseSnapshot["chain"];
  /** D · Balance de cantidades */
  balances: ExerciseSnapshot["balances"];
  /** E · Cálculo PCR (metodología intacta, solo visibilidad) */
  calculation: ExerciseSnapshot["calculation"];
  /** F · Matriz de evidencias — SIN signed URLs (7.2.F) */
  evidences: ExerciseSnapshot["evidences"];
  /** G · Cliente */
  requirements: ExerciseSnapshot["requirements"];
  /** H · Calidad (solo si existen evidencias asociadas) */
  quality_evidences: ExerciseSnapshot["evidences"];
  /** I · Ejercicio pre-auditoría */
  exercise: {
    exercise_id: string | null;
    started_at: string | null;
    completed_at: string | null;
    duration_seconds: number | null;
    result: string | null;
    source_hash: string | null;
  };
  /** J · Brechas y advertencias consolidadas (severidad + fuente + recomendación) */
  findings: Array<{
    severity: "gap" | "warning" | "info";
    source: string;
    message: string;
    recommendation: string | null;
  }>;
  /** K · Disclaimer obligatorio */
  disclaimer: typeof DOSSIER_DISCLAIMER;
};

export function buildDossierSnapshot(input: {
  organizationName: string;
  batchCode: string;
  productLabel: string | null;
  producedQuantityKg: number | null;
  dossierCode: string;
  version: number;
  generatedAt: string;
  generatedByEmail: string | null;
  exercise: {
    id: string;
    started_at: string | null;
    completed_at: string | null;
    result: string | null;
    source_hash: string | null;
    snapshot: ExerciseSnapshot;
  } | null;
}): DossierSnapshot {
  const ex = input.exercise?.snapshot ?? null;
  const started = input.exercise?.started_at ? new Date(input.exercise.started_at).getTime() : null;
  const completed = input.exercise?.completed_at
    ? new Date(input.exercise.completed_at).getTime()
    : null;
  return {
    schema_version: DOSSIER_SCHEMA_VERSION,
    cover: {
      organization_name: input.organizationName,
      batch_code: input.batchCode,
      product_label: input.productLabel,
      dossier_code: input.dossierCode,
      version: input.version,
      generated_at: input.generatedAt,
      generated_by_email: input.generatedByEmail,
    },
    summary: {
      exercise_result: ex?.result ?? null,
      produced_quantity_kg: input.producedQuantityKg,
      orders: ex?.counts.orders ?? 0,
      external_batches: ex?.counts.external_batches ?? 0,
      internal_batches: ex?.counts.internal_batches ?? 0,
      suppliers: ex?.counts.suppliers ?? 0,
      evidences: ex?.counts.evidences ?? 0,
      gaps: ex?.counts.gaps ?? 0,
      warnings: ex?.counts.warnings ?? 0,
    },
    genealogy: ex?.chain ?? [],
    balances: ex?.balances ?? { input_batches: [], output_batches: [] },
    calculation: ex?.calculation ?? null,
    evidences: ex?.evidences ?? [],
    requirements: ex?.requirements ?? [],
    quality_evidences: (ex?.evidences ?? []).filter((e) =>
      ["quality_control", "non_conformity", "customer_claim"].includes(e.evidence_type ?? "")
    ),
    exercise: {
      exercise_id: input.exercise?.id ?? null,
      started_at: input.exercise?.started_at ?? null,
      completed_at: input.exercise?.completed_at ?? null,
      duration_seconds:
        started !== null && completed !== null
          ? Math.max(1, Math.round((completed - started) / 1000))
          : null,
      result: input.exercise?.result ?? null,
      source_hash: input.exercise?.source_hash ?? null,
    },
    findings: (ex?.findings ?? []).map((f) => ({
      severity: f.level,
      source: f.area,
      message: f.message,
      recommendation: f.recommendation ?? null,
    })),
    disclaimer: DOSSIER_DISCLAIMER,
  };
}

export function computeDossierHash(snapshot: DossierSnapshot): string {
  return computeSnapshotHash(snapshot);
}
