/**
 * Trazaloop · Sprint 10A · Resumen de uso por organización (espejo de
 * v_organization_plan_usage, 0052) y su presentación (Parte 9/13).
 */
import type { PlanCode, PlanStatus, ResourceCode } from "./types";
import { resolveUsageSeverity, type UsageSeverity } from "./limits";

export type OrganizationPlanUsage = {
  organizationId: string;
  planCode: PlanCode;
  planStatus: PlanStatus;
  storageLimitBytes: number;
  storageUsedBytes: number;
  storageUsedMb: number;
  storageLimitMb: number;
  storagePercentUsed: number;
  documentsTrazadocsCount: number;
  suppliersCount: number;
  materialsCount: number;
  productsCount: number;
  evidencesCount: number;
  productionOrdersCount: number;
  inputBatchesCount: number;
  outputBatchesCount: number;
  teamMembersCount: number;
  diagnosticTaken: boolean;
  importsCount: number;
  ticketsCount: number;
  updatedAt: string;
};

export type ResourceUsageRow = {
  resourceCode: ResourceCode;
  label: string;
  used: number;
  limit: number | null;
  isUnlimited: boolean;
  percent: number | null;
  severity: UsageSeverity | null;
};

/** ¿Hay al menos un recurso "estimado"/parcial en el conteo de
 *  almacenamiento? (Parte 6: archivos previos al sprint sin size_bytes
 *  guardado cuentan como 0, así que el total puede ser una subestimación). */
export function storageUsageIsEstimated(hasUntrackedFiles: boolean): boolean {
  return hasUntrackedFiles;
}

export function resolveStorageSeverity(usage: OrganizationPlanUsage): UsageSeverity {
  return resolveUsageSeverity(usage.storagePercentUsed);
}
