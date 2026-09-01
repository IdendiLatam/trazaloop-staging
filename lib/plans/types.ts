/**
 * Trazaloop · Sprint 10A · Tipos puros de planes, límites y cuotas.
 * Sin imports de Supabase, de servidor ni de Next — misma capa que
 * lib/domain/*. Los planes pertenecen a la ORGANIZACIÓN, nunca a un rol
 * de usuario: nunca se mezclan con TeamRoleCode ni con PlatformRoleCode.
 */

/**
 * PE-04B2 · `free` entra, y `demo` se queda por lo que todavía referencia.
 *
 * El plan comercial VIGENTE de una empresa ya solo puede ser `free`, `full` o
 * `extra`: lo dice `organization_effective_plan_code`, que desde 0163 lee el
 * modelo canónico. `demo` sobrevive aquí porque las tablas legacy
 * —`plan_definitions`, `plan_limits`, `organization_subscriptions`— lo siguen
 * usando, y esas tablas no se borran: son evidencia histórica y la fuente de
 * los límites de conteo hasta PE-04B3.
 *
 * Para lo comercial, el tipo estrecho es `CommercialTier`.
 */
export const PLAN_CODES = ["demo", "free", "full", "extra"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** Los tres planes canónicos. Lo que una empresa puede tener HOY. */
export const COMMERCIAL_TIERS = ["free", "full", "extra"] as const;
export type CommercialTier = (typeof COMMERCIAL_TIERS)[number];

export function isCommercialTier(v: string | null | undefined): v is CommercialTier {
  return !!v && (COMMERCIAL_TIERS as readonly string[]).includes(v);
}

/**
 * PE-04B2 · PUENTE TEMPORAL hacia las tablas de límites legacy.
 *
 * `plan_limits` y `plan_definitions` siguen siendo la fuente de los límites de
 * conteo y de la cuota de subida hasta **PE-04B3**, y en ellas el plan más bajo
 * se llama `demo`. El plan comercial canónico lo llama `free`.
 *
 * La traducción es EXACTA, no aproximada: los límites de Free se copiaron de
 * los de `demo` byte a byte en 0162, y hay una prueba que lo comprueba
 * comparando las dos tablas.
 *
 * **Se retira en PE-04B3**, cuando la cuota y los conteos pasen a leerse de
 * `plan_revision_limits` y las tablas legacy dejen de consultarse.
 */
export function commercialTierToLegacyPlanCode(tier: CommercialTier): PlanCode {
  return tier === "free" ? "demo" : tier;
}

export const PLAN_LABEL: Record<PlanCode, string> = {
  demo: "Demo",
  free: "Free",
  full: "Full",
  extra: "Extra",
};

export const PLAN_STATUSES = ["active", "suspended", "cancelled"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  active: "Activo",
  suspended: "Suspendido",
  cancelled: "Cancelado",
};

export function isPlanCode(v: string | null | undefined): v is PlanCode {
  return !!v && (PLAN_CODES as readonly string[]).includes(v);
}

export function isPlanStatus(v: string | null | undefined): v is PlanStatus {
  return !!v && (PLAN_STATUSES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Recursos medibles por plan (Parte 2). Los 3 "_enabled" son interruptores
// (0/1), no conteos — se leen con isPlanFeatureEnabled (lib/plans/limits.ts).
// ---------------------------------------------------------------------------
export const COUNTABLE_RESOURCE_CODES = [
  "documents_trazadocs",
  "suppliers",
  "materials",
  "products",
  "evidences",
  "production_orders",
  "input_batches",
  "output_batches",
  "team_members",
] as const;
export type CountableResourceCode = (typeof COUNTABLE_RESOURCE_CODES)[number];

export const FEATURE_RESOURCE_CODES = [
  "roles_enabled",
  "diagnostic_recommendations_enabled",
  "imports_enabled",
] as const;
export type FeatureResourceCode = (typeof FEATURE_RESOURCE_CODES)[number];

export const RESOURCE_CODES = [...COUNTABLE_RESOURCE_CODES, ...FEATURE_RESOURCE_CODES, "storage_bytes"] as const;
export type ResourceCode = (typeof RESOURCE_CODES)[number];

export const RESOURCE_LABEL: Record<ResourceCode, string> = {
  documents_trazadocs: "Documentos TrazaDocs",
  suppliers: "Proveedores",
  materials: "Materiales",
  products: "Productos",
  evidences: "Evidencias",
  production_orders: "Órdenes / corridas de producción",
  input_batches: "Lotes de entrada",
  output_batches: "Lotes producidos",
  team_members: "Miembros del equipo",
  roles_enabled: "Roles e invitaciones de equipo",
  diagnostic_recommendations_enabled: "Recomendaciones avanzadas de diagnóstico",
  imports_enabled: "Importaciones",
  storage_bytes: "Almacenamiento",
};

export function isResourceCode(v: string | null | undefined): v is ResourceCode {
  return !!v && (RESOURCE_CODES as readonly string[]).includes(v);
}

/** Un límite de plan, ya resuelto (plan_limits, 0050). */
export type PlanLimit = {
  resourceCode: ResourceCode;
  limitValue: number | null;
  isUnlimited: boolean;
};

/** Fila de organization_subscriptions (0050), tal como la usa la app. */
export type OrganizationSubscription = {
  organizationId: string;
  planCode: PlanCode;
  status: PlanStatus;
  assignedBy: string | null;
  assignedAt: string;
  validUntil: string | null;
  notes: string | null;
};

export type SubscriptionPlanHistoryEntry = {
  id: string;
  fromPlanCode: PlanCode | null;
  toPlanCode: PlanCode;
  changedByName: string | null;
  changeReason: string | null;
  createdAt: string;
};
