/**
 * Trazaloop · Sprint 10D · Lógica PURA del onboarding inicial (sin BD).
 * Espejo de v_organization_onboarding_status (0067).
 *
 * Sin imports de Supabase, de servidor ni de Next.
 */

export const ONBOARDING_STEP_STATUSES = ["pending", "in_progress", "completed"] as const;
export type OnboardingStepStatus = (typeof ONBOARDING_STEP_STATUSES)[number];

export const ONBOARDING_STEP_STATUS_LABEL: Record<OnboardingStepStatus, string> = {
  pending: "Pendiente",
  in_progress: "En progreso",
  completed: "Completado",
};

/** Los 7 pasos calculables desde datos reales (Parte 7, pasos 1-7) —
 *  nunca se marcan completos por defecto ni con datos inventados. */
export type OnboardingStepKey =
  | "company_profile"
  | "diagnostic"
  | "product"
  | "supplier"
  | "material"
  | "evidence"
  | "trazadoc";

export type OnboardingStepDefinition = {
  key: OnboardingStepKey;
  order: number;
  title: string;
  description: string;
  href: string;
};

export const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
  {
    key: "company_profile",
    order: 1,
    title: "Completar datos de empresa",
    description: "Registra la razón social y el NIT de tu empresa.",
    href: "/settings/company",
  },
  {
    key: "diagnostic",
    order: 2,
    title: "Tomar diagnóstico inicial",
    description: "Responde el diagnóstico de preparación técnica de la empresa.",
    href: "/diagnostic",
  },
  {
    key: "product",
    order: 3,
    title: "Crear producto objetivo",
    description: "Registra el producto objetivo que quieres evaluar.",
    href: "/catalog/products",
  },
  {
    key: "supplier",
    order: 4,
    title: "Registrar proveedor",
    description: "Registra el primer proveedor real de materiales.",
    href: "/catalog/suppliers",
  },
  {
    key: "material",
    order: 5,
    title: "Registrar materiales",
    description: "Registra los materiales con su clasificación.",
    href: "/catalog/materials",
  },
  {
    key: "evidence",
    order: 6,
    title: "Cargar una evidencia",
    description: "Sube el soporte documental de origen de un material.",
    href: "/evidences",
  },
  {
    key: "trazadoc",
    order: 7,
    title: "Crear primer documento en TrazaDocs",
    description: "Crea un documento vivo o agrega un archivo descargable al Maestro de documentos.",
    href: "/trazadocs/master",
  },
];

/** Paso 8 — puramente de navegación (Parte 7): no hay ningún dato de
 *  negocio que indique si alguien "revisó" una pantalla, así que nunca
 *  se marca completo automáticamente ni se cuenta en el progreso
 *  numérico — evita inventar un mecanismo de seguimiento para algo que
 *  no es inferible de los datos reales. */
export const REVIEW_PLAN_LIMITS_STEP = {
  order: 8,
  title: "Revisar límites del plan Demo",
  description: "Consulta cuánto llevas de tu cuota de plan antes de seguir cargando datos.",
  href: "/dashboard#plan",
};

export type OnboardingStatusFacts = {
  companyProfileStarted: boolean;
  companyProfileCompleted: boolean;
  diagnosticStarted: boolean;
  diagnosticCompleted: boolean;
  hasProduct: boolean;
  hasSupplier: boolean;
  hasMaterial: boolean;
  hasEvidence: boolean;
  hasTrazadoc: boolean;
  /** Corrección (Bloqueante 3): documento vivo TrazaDocs O documento
   *  descargable del Maestro de documentos (Sprint 10B) — el paso de
   *  onboarding se completa con cualquiera de los dos, no solo con un
   *  documento vivo. hasTrazadoc se conserva aparte por su valor
   *  informativo propio, pero el paso ya NO lo usa directamente. */
  hasDocumentMasterItem: boolean;
};

/** Resuelve el estado de UN paso a partir de los hechos reales —
 *  binario para todos salvo el diagnóstico, que sí tiene un estado
 *  "en progreso" real en los datos (diagnostics.status='in_progress'). */
export function resolveOnboardingStepStatus(key: OnboardingStepKey, facts: OnboardingStatusFacts): OnboardingStepStatus {
  switch (key) {
    case "company_profile":
      if (facts.companyProfileCompleted) return "completed";
      return facts.companyProfileStarted ? "in_progress" : "pending";
    case "diagnostic":
      if (facts.diagnosticCompleted) return "completed";
      return facts.diagnosticStarted ? "in_progress" : "pending";
    case "product":
      return facts.hasProduct ? "completed" : "pending";
    case "supplier":
      return facts.hasSupplier ? "completed" : "pending";
    case "material":
      return facts.hasMaterial ? "completed" : "pending";
    case "evidence":
      return facts.hasEvidence ? "completed" : "pending";
    case "trazadoc":
      // Corrección (Bloqueante 3): documento vivo O descargable, nunca
      // solo documento vivo — mismo criterio que el Maestro de documentos.
      return facts.hasDocumentMasterItem ? "completed" : "pending";
  }
}

export type ResolvedOnboardingStep = OnboardingStepDefinition & { status: OnboardingStepStatus };

export function resolveOnboardingChecklist(facts: OnboardingStatusFacts): ResolvedOnboardingStep[] {
  return ONBOARDING_STEPS.map((step) => ({ ...step, status: resolveOnboardingStepStatus(step.key, facts) }));
}

/** Redondeo de progreso — misma fórmula exacta que
 *  v_organization_onboarding_status (0067), aquí en TypeScript para
 *  poder testear sin BD. */
export function computeOnboardingProgressPercent(completedSteps: number, totalSteps: number): number {
  if (totalSteps <= 0) return 0;
  return Math.round((100 * completedSteps) / totalSteps);
}
