// ---------------------------------------------------------------------------
// Enums de la tabla implementation_feedback (0033) — la MISMA lista vive en
// el CHECK de la migración. Viven aquí (no en lib/db/implementation.ts, que
// es server-only) para que la validación se pueda probar sin Next.js ni BD.
// ---------------------------------------------------------------------------
export const FEEDBACK_MODULES = [
  "auth",
  "organization",
  "catalog",
  "evidences",
  "traceability",
  "recycled_content",
  "audit_support",
  "guided_flow",
  "implementation",
  "other",
] as const;
export type FeedbackModule = (typeof FEEDBACK_MODULES)[number];

export const FEEDBACK_CATEGORIES = [
  "bug",
  "ux",
  "data_gap",
  "question",
  "improvement",
  "training",
  "other",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

export const FEEDBACK_STATUSES = ["open", "in_review", "resolved", "closed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_RELATED_ENTITY_TYPES = [
  "supplier",
  "material",
  "evidence",
  "input_batch",
  "production_order",
  "output_batch",
  "calculation",
  "dossier",
  "other",
] as const;
export type FeedbackRelatedEntityType = (typeof FEEDBACK_RELATED_ENTITY_TYPES)[number];

export const MODULE_LABEL: Record<FeedbackModule, string> = {
  auth: "Autenticación y usuarios",
  organization: "Empresa",
  catalog: "Catálogos",
  evidences: "Evidencias",
  traceability: "Trazabilidad",
  recycled_content: "Contenido reciclado",
  audit_support: "Soporte técnico",
  guided_flow: "Flujo guiado",
  implementation: "Implementación",
  other: "Otro",
};

export const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  bug: "Error",
  ux: "Experiencia de uso",
  data_gap: "Falta de datos",
  question: "Duda",
  improvement: "Mejora",
  training: "Capacitación",
  other: "Otro",
};

export const SEVERITY_LABEL: Record<FeedbackSeverity, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  critical: "Crítica",
};

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "Abierto",
  in_review: "En revisión",
  resolved: "Resuelto",
  closed: "Cerrado",
};

export const RELATED_ENTITY_LABEL: Record<FeedbackRelatedEntityType, string> = {
  supplier: "Proveedor",
  material: "Material",
  evidence: "Evidencia",
  input_batch: "Lote de entrada",
  production_order: "Orden / corrida de producción",
  output_batch: "Lote producido / lote final",
  calculation: "Cálculo",
  dossier: "Dossier técnico",
  other: "Otro",
};

export function isFeedbackModuleGuard(v: string | undefined): v is FeedbackModule {
  return !!v && (FEEDBACK_MODULES as readonly string[]).includes(v);
}
export function isFeedbackCategoryGuard(v: string | undefined): v is FeedbackCategory {
  return !!v && (FEEDBACK_CATEGORIES as readonly string[]).includes(v);
}
export function isFeedbackSeverityGuard(v: string | undefined): v is FeedbackSeverity {
  return !!v && (FEEDBACK_SEVERITIES as readonly string[]).includes(v);
}
export function isFeedbackStatusGuard(v: string | undefined): v is FeedbackStatus {
  return !!v && (FEEDBACK_STATUSES as readonly string[]).includes(v);
}
export function isFeedbackRelatedEntityTypeGuard(
  v: string | undefined
): v is FeedbackRelatedEntityType {
  return !!v && (FEEDBACK_RELATED_ENTITY_TYPES as readonly string[]).includes(v);
}

/** Tablas org-scoped contra las que SÍ se puede validar pertenencia del
 *  related_entity_id a la empresa activa (Parte 4 del Sprint 6). 'calculation'
 *  apunta a recycled_content_calculations; 'dossier' y 'other' no tienen
 *  tabla propia que validar (el dossier es una vista sobre el cálculo) y no
 *  deben romper la operación: solo se guardan tal cual. */
export const VALIDATABLE_RELATED_ENTITY_TABLE: Partial<
  Record<FeedbackRelatedEntityType, string>
> = {
  supplier: "suppliers",
  material: "materials",
  evidence: "evidences",
  input_batch: "input_batches",
  production_order: "production_orders",
  output_batch: "output_batches",
  calculation: "recycled_content_calculations",
};

// ---------------------------------------------------------------------------
// Validación PURA de feedback (Parte 4 y Parte 10 del Sprint 6). Sin BD: solo
// enums y campos obligatorios. La validación de que related_entity_id
// pertenece a la empresa activa SÍ necesita BD y vive en
// server/actions/implementation.ts, que reutiliza estos guards.
// ---------------------------------------------------------------------------
export type FeedbackDraftInput = {
  module: string;
  category: string;
  severity: string;
  title: string;
  description: string;
};

export type FeedbackValidation = { error: string | null };

export function validateFeedbackDraft(input: FeedbackDraftInput): FeedbackValidation {
  if (!isFeedbackModuleGuard(input.module)) return { error: "Selecciona un módulo válido." };
  if (!isFeedbackCategoryGuard(input.category)) {
    return { error: "Selecciona una categoría válida." };
  }
  if (!isFeedbackSeverityGuard(input.severity)) {
    return { error: "Selecciona una severidad válida." };
  }
  if (!input.title.trim()) return { error: "El título es obligatorio." };
  if (!input.description.trim()) return { error: "La descripción es obligatoria." };
  return { error: null };
}

export type TrustedFeedbackInsertPayload = {
  organization_id: string;
  module: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  steps_to_reproduce: string | null;
  expected_result: string | null;
  actual_result: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
};

/**
 * Arma el payload de inserción/edición. `organizationId` SIEMPRE viene del
 * parámetro explícito — la empresa activa validada en servidor
 * (requireActiveOrg) — y NUNCA de `input`. El tipo de `input` ni siquiera
 * declara un campo `organization_id`; aunque el llamador intente colar uno
 * (por ejemplo manipulando el FormData del cliente), esta función no lo lee
 * en ningún punto, así que un intento de cruce de empresa no tiene forma de
 * llegar a la fila insertada por esta vía.
 */
export function buildFeedbackInsertPayload(
  organizationId: string,
  input: FeedbackDraftInput & {
    stepsToReproduce?: string | null;
    expectedResult?: string | null;
    actualResult?: string | null;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
  }
): TrustedFeedbackInsertPayload {
  return {
    organization_id: organizationId,
    module: input.module,
    category: input.category,
    severity: input.severity,
    title: input.title.trim(),
    description: input.description.trim(),
    steps_to_reproduce: input.stepsToReproduce ?? null,
    expected_result: input.expectedResult ?? null,
    actual_result: input.actualResult ?? null,
    related_entity_type: input.relatedEntityType ?? null,
    related_entity_id: input.relatedEntityId ?? null,
  };
}

/**
 * Trazaloop · Sprint 6 · Lógica PURA de "Implementación con empresa".
 *
 * Igual que lib/domain/guided-flow.ts (Sprint 5B): esta función es la
 * ESPECIFICACIÓN de "cuál es la siguiente acción recomendada". La vista SQL
 * v_implementation_next_actions (0034) implementa la MISMA cadena de
 * prioridad para poder listar todas las acciones vigentes; esta función
 * pura decide cuál es la de MAYOR prioridad, y es la que se prueba sin base
 * de datos con `npm run test:implementation`.
 *
 * Sin imports de Supabase ni de servidor. NO cambia la metodología de
 * cálculo de contenido reciclado: solo lee señales ya existentes.
 */

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

export type NextActionFacts = {
  suppliersCount: number;
  materialsCount: number;
  /** Materiales elegibles como reciclado sin evidencia de origen válida. */
  materialsWithoutOriginSupportCount: number;
  pendingEvidencesCount: number;
  inputBatchesCount: number;
  productionOrdersCount: number;
  /** Hay al menos una orden / corrida sin consumos registrados. */
  hasOrderWithoutConsumption: boolean;
  /** Hay al menos un lote producido / lote final sin composición. */
  hasOutputBatchWithoutComposition: boolean;
  /** Hay al menos un lote con composición y sin cálculo todavía. */
  hasReadyToCalculate: boolean;
  criticalGapsCount: number;
  defensibleCalculationsCount: number;
};

/**
 * Cadena de decisión (misma que v_implementation_next_actions, priority 1-12):
 * proveedores → materiales → soporte de origen → evidencia pendiente →
 * lotes de entrada → órdenes/corridas → consumos → composición → cálculo →
 * brechas críticas → dossier defendible → (si todo avanzó) crear ticket de soporte.
 */
export function resolveNextAction(f: NextActionFacts): NextActionCode {
  if (f.suppliersCount === 0) return "create_supplier";
  if (f.materialsCount === 0) return "create_material";
  if (f.materialsWithoutOriginSupportCount > 0) return "add_origin_evidence";
  if (f.pendingEvidencesCount > 0) return "validate_evidence";
  if (f.inputBatchesCount === 0) return "create_input_batch";
  if (f.productionOrdersCount === 0) return "create_production_order";
  if (f.hasOrderWithoutConsumption) return "add_consumption";
  if (f.hasOutputBatchWithoutComposition) return "add_composition";
  if (f.hasReadyToCalculate) return "calculate_recycled_content";
  if (f.criticalGapsCount > 0) return "review_gaps";
  if (f.defensibleCalculationsCount > 0) return "open_dossier";
  return "record_feedback";
}

export const NEXT_ACTION_LABEL: Record<NextActionCode, string> = {
  create_supplier: "Crear proveedor real",
  create_material: "Crear material real",
  add_origin_evidence: "Cargar evidencia de origen",
  validate_evidence: "Validar evidencia pendiente",
  create_input_batch: "Registrar lote de entrada",
  create_production_order: "Crear orden / corrida de producción",
  add_consumption: "Registrar consumo",
  add_composition: "Registrar composición",
  calculate_recycled_content: "Calcular contenido reciclado",
  review_gaps: "Revisar brechas",
  open_dossier: "Ver dossier técnico",
  record_feedback: "Crear ticket de soporte",
};

export const NEXT_ACTION_HREF: Record<NextActionCode, string> = {
  create_supplier: "/catalog/suppliers",
  create_material: "/catalog/materials",
  add_origin_evidence: "/evidences",
  validate_evidence: "/evidences",
  create_input_batch: "/traceability/input-batches",
  create_production_order: "/traceability/production-orders",
  add_consumption: "/traceability/production-orders",
  add_composition: "/traceability/output-batches",
  calculate_recycled_content: "/recycled-content/output-batches",
  review_gaps: "/audit-support",
  open_dossier: "/audit-support",
  record_feedback: "/support/new",
};

// ---------------------------------------------------------------------------
// Checklist de implementación real (17 ítems, Parte 5 §2 del Sprint 6).
// ---------------------------------------------------------------------------
export type ChecklistStatus = "pendiente" | "en progreso" | "completo" | "con advertencias";

export type ChecklistItem = {
  id: number;
  title: string;
  description: string;
  status: ChecklistStatus;
  actionLabel: string;
  actionHref: string;
};

export type ChecklistFacts = {
  hasOrganization: boolean;
  suppliersCount: number;
  materialsCount: number;
  recycledMaterialsCount: number;
  materialsWithoutOriginSupportCount: number;
  evidencesCount: number;
  validEvidencesCount: number;
  pendingEvidencesCount: number;
  inputBatchesCount: number;
  productionOrdersCount: number;
  hasOrderWithoutConsumption: boolean;
  outputBatchesCount: number;
  outputBatchesWithCompositionCount: number;
  hasReadyToCalculate: boolean;
  calculatedOutputBatchesCount: number;
  criticalGapsCount: number;
  defensibleCalculationsCount: number;
  /** Se ha visitado o hay señales de progreso en el flujo guiado. */
  guidedFlowTouched: boolean;
  feedbackCount: number;
};

/** Pura y testable: dado el estado real de una empresa, arma el checklist
 *  de los 17 pasos de implementación con estado, explicación breve y
 *  acceso directo a la pantalla correspondiente. Nunca crea datos. */
export function resolveChecklist(f: ChecklistFacts): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      id: 1,
      title: "Crear empresa",
      description: "La empresa ya existe y tiene al menos una membresía activa.",
      status: f.hasOrganization ? "completo" : "pendiente",
      actionLabel: "Cambiar de empresa",
      actionHref: "/select-org",
    },
    {
      id: 2,
      title: "Crear proveedores reales",
      description: "Registra los proveedores reales de material de la empresa.",
      status: f.suppliersCount > 0 ? "completo" : "pendiente",
      actionLabel: "Ir a proveedores",
      actionHref: "/catalog/suppliers",
    },
    {
      id: 3,
      title: "Crear materiales reales",
      description: "Registra los materiales reales con su clasificación normativa.",
      status: f.materialsCount > 0 ? "completo" : "pendiente",
      actionLabel: "Ir a materiales",
      actionHref: "/catalog/materials",
    },
    {
      id: 4,
      title: "Cargar evidencias de origen",
      description: "Sube la evidencia real que respalda el origen del material.",
      status: f.evidencesCount > 0 ? "completo" : "pendiente",
      actionLabel: "Ir a evidencias",
      actionHref: "/evidences",
    },
    {
      id: 5,
      title: "Validar evidencias",
      description: "Admin o calidad revisan y validan cada evidencia cargada.",
      status:
        f.evidencesCount === 0
          ? "pendiente"
          : f.pendingEvidencesCount > 0
            ? "con advertencias"
            : "completo",
      actionLabel: "Validar evidencias",
      actionHref: "/evidences",
    },
    {
      id: 6,
      title: "Asociar evidencias como soporte de origen del material",
      description:
        "Cada material reciclado necesita una evidencia de origen válida asociada.",
      status:
        f.recycledMaterialsCount === 0
          ? "pendiente"
          : f.materialsWithoutOriginSupportCount > 0
            ? "con advertencias"
            : "completo",
      actionLabel: "Asociar soporte de origen",
      actionHref: "/evidences",
    },
    {
      id: 7,
      title: "Registrar lotes de entrada",
      description: "Registra los lotes de entrada reales recibidos de proveedores.",
      status: f.inputBatchesCount > 0 ? "completo" : "pendiente",
      actionLabel: "Ir a lotes de entrada",
      actionHref: "/traceability/input-batches",
    },
    {
      id: 8,
      title: "Crear orden / corrida de producción",
      description: "Registra la orden / corrida real donde se consumen los materiales.",
      status: f.productionOrdersCount > 0 ? "completo" : "pendiente",
      actionLabel: "Ir a órdenes / corridas",
      actionHref: "/traceability/production-orders",
    },
    {
      id: 9,
      title: "Registrar consumos",
      description: "Asocia a la orden / corrida los lotes de entrada realmente consumidos.",
      status:
        f.productionOrdersCount === 0
          ? "pendiente"
          : f.hasOrderWithoutConsumption
            ? "con advertencias"
            : "completo",
      actionLabel: "Registrar consumo",
      actionHref: "/traceability/production-orders",
    },
    {
      id: 10,
      title: "Crear lote producido / lote final",
      description: "Registra el lote producido / lote final resultante de la orden.",
      status: f.outputBatchesCount > 0 ? "completo" : "pendiente",
      actionLabel: "Ir a lotes producidos / lotes finales",
      actionHref: "/traceability/output-batches",
    },
    {
      id: 11,
      title: "Registrar composición",
      description: "Registra los materiales y masas que componen el lote producido / lote final.",
      status:
        f.outputBatchesCount === 0
          ? "pendiente"
          : f.outputBatchesWithCompositionCount < f.outputBatchesCount
            ? "con advertencias"
            : "completo",
      actionLabel: "Registrar composición",
      actionHref: "/traceability/output-batches",
    },
    {
      id: 12,
      title: "Calcular contenido reciclado",
      description: "Calcula el contenido reciclado del lote con la metodología vigente.",
      status:
        f.calculatedOutputBatchesCount > 0
          ? "completo"
          : f.hasReadyToCalculate
            ? "en progreso"
            : "pendiente",
      actionLabel: "Calcular contenido reciclado",
      actionHref: "/recycled-content/output-batches",
    },
    {
      id: 13,
      title: "Revisar brechas",
      description: "Revisa las brechas de soporte y trazabilidad antes de dar el cálculo por bueno.",
      status:
        f.calculatedOutputBatchesCount === 0
          ? "pendiente"
          : f.criticalGapsCount > 0
            ? "con advertencias"
            : "completo",
      actionLabel: "Revisar brechas",
      actionHref: "/audit-support",
    },
    {
      id: 14,
      title: "Ver dossier técnico",
      description: "Revisa el dossier técnico del cálculo como respaldo de la revisión técnica.",
      status:
        f.defensibleCalculationsCount > 0
          ? "completo"
          : f.calculatedOutputBatchesCount > 0
            ? "en progreso"
            : "pendiente",
      actionLabel: "Ir a soporte técnico",
      actionHref: "/audit-support",
    },
    {
      id: 15,
      title: "Revisar flujo guiado",
      description: "Usa el flujo guiado para confirmar que no falta ningún paso del recorrido.",
      status: f.guidedFlowTouched ? "completo" : "en progreso",
      actionLabel: "Ir al flujo guiado",
      actionHref: "/guided-flow",
    },
    {
      id: 16,
      title: "Exportar JSON/CSV si aplica",
      description: "Exporta el dossier en JSON o la matriz de evidencias en CSV cuando lo necesites.",
      status: f.defensibleCalculationsCount > 0 ? "completo" : "pendiente",
      actionLabel: "Ir a soporte técnico",
      actionHref: "/audit-support",
    },
    {
      id: 17,
      title: "Crear ticket de soporte",
      description: "Registra errores, dudas, hallazgos o mejoras encontradas durante la prueba real.",
      status: f.feedbackCount > 0 ? "completo" : "pendiente",
      actionLabel: "Ir al Centro de soporte",
      actionHref: "/support/new",
    },
  ];
  return items;
}
