"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { createServerClient } from "@/lib/supabase/server";
import { listFxRates, type FxRateRow } from "@/lib/db/commercial-fx";

/**
 * Trazaloop · PE-05B6F · Administrar el tipo de cambio comercial.
 *
 * Todo pasa por las primitivas de 0182, que exigen superadministración EN SQL.
 * Esta capa comprueba también, pero no es donde vive la seguridad.
 *
 * Y la tasa NO se escribe a mano en la tabla: abrir una cierra la anterior en
 * el mismo instante, y eso es una operación, no dos escrituras.
 */
export type FxView = { rates: FxRateRow[] | null; canManage: boolean };

export async function getFxRatesAction(): Promise<FxView> {
  const { isSuperadmin } = await requirePlatformStaff();
  return { rates: await listFxRates(), canManage: isSuperadmin };
}

export type FxActionState = { error: string | null; ok?: boolean };

const MENSAJE: Record<string, string> = {
  not_after_current: "La tasa nueva tiene que empezar DESPUÉS de la que rige. "
                   + "No se cambió nada.",
  fx_rate_not_found: "Esa tasa ya no existe.",
  already_effective: "Esa tasa ya está rigiendo: no se retira, se le pone fin "
                   + "abriendo la siguiente.",
  already_retired: "Esa tasa ya estaba retirada.",
  no_current_rate: "Ahora mismo no hay ninguna tasa rigiendo.",
  close_before_start: "No se puede cerrar una vigencia antes de que empiece.",
};

function traducir(mensaje: string): string {
  if (/NOT_AUTHORIZED/.test(mensaje)) {
    return "Fijar el tipo de cambio es de la administración de plataforma.";
  }
  if (/FX_RATE_OVERLAPS/.test(mensaje)) {
    return "Esa vigencia se solaparía con otra activa. Cierra la anterior primero.";
  }
  if (/FX_PAIR_NOT_SUPPORTED/.test(mensaje)) {
    return "Hoy el cobro solo se hace en pesos sobre catálogo en dólares.";
  }
  if (/FX_RATE_INVALID/.test(mensaje)) return "La tasa tiene que ser mayor que cero.";
  if (/FX_RATE_IS_IMMUTABLE|FX_RATE_IS_HISTORY/.test(mensaje)) {
    return "Esa tasa ya rigió o ya puso precios: es historia y no se reescribe.";
  }
  return "No pudimos guardar el tipo de cambio. No se cambió nada.";
}

/**
 * Abre una vigencia nueva. La tasa llega en micros —enteros— porque el importe
 * final se calcula en la base con aritmética entera, y un decimal de navegador
 * no puede ser la autoridad de un precio.
 */
export async function createFxRateAction(input: {
  rateMicros: number; effectiveFrom: string; note?: string | null;
}): Promise<FxActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) {
    return { error: "Fijar el tipo de cambio es de la administración de plataforma." };
  }
  if (!Number.isInteger(input.rateMicros) || input.rateMicros <= 0) {
    return { error: "La tasa tiene que ser un número mayor que cero." };
  }
  if (!input.effectiveFrom) {
    return { error: "Falta desde cuándo rige." };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("commercial_fx_create", {
    p_base_currency: "USD", p_quote_currency: "COP",
    p_rate_micros: input.rateMicros, p_effective_from: input.effectiveFrom,
    p_note: input.note ?? null });
  if (error) return { error: traducir(error.message ?? "") };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.status !== "created") {
    return { error: MENSAJE[String(r.status)] ?? "No se pudo abrir la vigencia." };
  }
  revalidatePath("/platform/plans");
  return { error: null, ok: true };
}

/** Retirar una tasa PROGRAMADA que todavía no rige. */
export async function cancelScheduledFxRateAction(
  fxRateId: string
): Promise<FxActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) {
    return { error: "Fijar el tipo de cambio es de la administración de plataforma." };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("commercial_fx_cancel_scheduled",
    { p_fx_rate_id: fxRateId });
  if (error) return { error: traducir(error.message ?? "") };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.status !== "cancelled") {
    return { error: MENSAJE[String(r.status)] ?? "No se pudo retirar." };
  }
  revalidatePath("/platform/plans");
  return { error: null, ok: true };
}

/**
 * Cerrar la vigente. Se dice lo que implica: a partir de ese instante no se
 * pueden fijar precios nuevos. Renovar sigue funcionando.
 */
export async function closeCurrentFxRateAction(): Promise<FxActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) {
    return { error: "Fijar el tipo de cambio es de la administración de plataforma." };
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("commercial_fx_close_current", {
    p_base_currency: "USD", p_quote_currency: "COP",
    p_effective_to: new Date().toISOString() });
  if (error) return { error: traducir(error.message ?? "") };
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.status !== "closed") {
    return { error: MENSAJE[String(r.status)] ?? "No se pudo cerrar la vigencia." };
  }
  revalidatePath("/platform/plans");
  return { error: null, ok: true };
}
