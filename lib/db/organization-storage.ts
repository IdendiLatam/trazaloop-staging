import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-04B3 · Lectura del almacenamiento de la EMPRESA.
 *
 * Un solo estado, salido de una sola función de base (0164). Antes había dos
 * contabilidades que no coincidían —`v_organization_plan_usage`, sin versiones
 * de TrazaDocs ni reservas ni huérfanos, y `module_storage_snapshot`, completa
 * pero por módulo— y la cuota se aplicaba por módulo mientras el negocio había
 * congelado una sola cuota por empresa.
 */
export const STORAGE_STATES = [
  "WITHIN_LIMIT",
  "AT_LIMIT",
  "OVER_LIMIT",
  "QUOTA_UNAVAILABLE",
] as const;
export type StorageState = (typeof STORAGE_STATES)[number];

export const STORAGE_UNAVAILABLE_REASONS = [
  "plan_absent",
  "plan_unreadable",
  "limit_not_configured",
  "usage_unverifiable",
] as const;
export type StorageUnavailableReason = (typeof STORAGE_UNAVAILABLE_REASONS)[number];

export type OrganizationStorageStatus = {
  state: StorageState;
  reason: StorageUnavailableReason | null;
  planCode: string | null;
  limitState: "finite" | "unlimited" | "not_configured" | null;
  quotaBytes: number | null;
  committedBytes: number;
  reservedBytes: number;
  usedBytes: number;
  remainingBytes: number | null;
  unknownSizeCount: number;
  conflictCount: number;
};

function num(v: unknown, fallback: number): number {
  return typeof v === "number" ? v : typeof v === "string" ? Number(v) : fallback;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = num(v, Number.NaN);
  return Number.isFinite(n) ? n : null;
}

/**
 * Devuelve `null` cuando NO SE PUDO LEER. Un fallo de lectura no es «cero
 * bytes usados» ni «dentro del límite»: quien llama debe negar y decir que no
 * se pudo comprobar. Es la misma regla que rompió el defecto Full→Demo.
 */
export async function getOrganizationStorageStatus(
  orgId: string
): Promise<OrganizationStorageStatus | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("organization_storage_status", {
    p_organization_id: orgId,
  });
  if (error || !data || typeof data !== "object") return null;

  const row = data as Record<string, unknown>;
  const state = row.state as StorageState;
  if (!(STORAGE_STATES as readonly string[]).includes(state)) return null;

  return {
    state,
    reason: (row.reason as StorageUnavailableReason | null) ?? null,
    planCode: (row.plan_code as string | null) ?? null,
    limitState: (row.limit_state as OrganizationStorageStatus["limitState"]) ?? null,
    quotaBytes: numOrNull(row.quota_bytes),
    committedBytes: num(row.committed_bytes, 0),
    reservedBytes: num(row.reserved_bytes, 0),
    usedBytes: num(row.used_bytes, 0),
    remainingBytes: numOrNull(row.remaining_bytes),
    unknownSizeCount: num(row.unknown_size_count, 0),
    conflictCount: num(row.conflict_count, 0),
  };
}

export type StorageGuardOutcome =
  | { allowed: true }
  | { allowed: false; code: "QUOTA_EXCEEDED" | "UNVERIFIABLE" };

/**
 * Reserva atómica del LOGO contra la cuota única de la empresa (0164). No es
 * una comprobación previa optimista contra una vista incompleta: toma el mismo
 * lock por empresa que PCR y Textiles y descuenta lo que el logo reemplaza.
 */
export async function guardLogoStorage(
  orgId: string,
  sizeBytes: number
): Promise<StorageGuardOutcome> {
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("organization_storage_guard_logo", {
    p_organization_id: orgId,
    p_size_bytes: sizeBytes,
  });
  if (!error) return { allowed: true };
  const message = error.message ?? "";
  if (message.includes("STORAGE_QUOTA_EXCEEDED")) {
    return { allowed: false, code: "QUOTA_EXCEEDED" };
  }
  return { allowed: false, code: "UNVERIFIABLE" };
}
