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

const BYTES_PER_MB = 1048576;

/**
 * RH-01.1 · Presentación del almacenamiento contra la cuota del plan
 * EFECTIVO. La vista v_organization_plan_usage calcula storage_limit_mb /
 * storage_percent_used contra la cuota LEGACY: mostrarlo tal cual producía el
 * célebre «0 MB / 50 MB» en empresas Full/Extra. El uso (bytes) sí es real y
 * se conserva; solo se recalcula el denominador.
 */
export function buildEffectiveStorageUsage(
  usedBytes: number,
  limitBytes: number
): { usedMb: number; limitMb: number; percentUsed: number } {
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const usedMb = round2(usedBytes / BYTES_PER_MB);
  const limitMb = round2(limitBytes / BYTES_PER_MB);
  const percentUsed = limitBytes > 0 ? Math.round((1000 * usedBytes) / limitBytes) / 10 : 0;
  return { usedMb, limitMb, percentUsed };
}
