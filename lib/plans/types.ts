/**
 * Trazaloop · Sprint 10A · Tipos puros de planes, límites y cuotas.
 * Sin imports de Supabase, de servidor ni de Next — misma capa que
 * lib/domain/*. Los planes pertenecen a la ORGANIZACIÓN, nunca a un rol
 * de usuario: nunca se mezclan con TeamRoleCode ni con PlatformRoleCode.
 */

export const PLAN_CODES = ["demo", "full", "extra"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const PLAN_LABEL: Record<PlanCode, string> = {
  demo: "Demo",
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
