import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-04B5 · Los módulos que SÍ pueden recibir un plan comercial.
 *
 * `core` y los internos quedan fuera a propósito: si `core` pudiera recibir un
 * plan, toda empresa resolvería a ese plan y el nivel comercial dejaría de
 * significar nada. Es el hallazgo de PE-04B1, y aquí se aplica también a lo que
 * la pantalla llega a ofrecer.
 */
export async function listFunctionalModules(): Promise<{ code: string; name: string }[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("modules")
    .select("code, name, is_functional")
    .eq("is_functional", true)
    .order("code");
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map((m) => ({
    code: String(m.code),
    name: String(m.name ?? m.code),
  }));
}
