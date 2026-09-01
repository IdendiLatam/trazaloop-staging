import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-03B4 · Las preferencias de una persona, leídas y escritas.
 *
 * Todo pasa por la sesión de quien pregunta, así que la RLS de 0161 se ejerce
 * en cada llamada: nadie lee ni escribe la preferencia de otra persona porque
 * no hay ninguna consulta capaz de pedirla.
 */

type Db = SupabaseClient;
async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

/** Las preferencias que hoy existen. El mismo vocabulario cerrado que la base. */
export const USER_PREFERENCE_KEYS = ["welcome_video_suppressed"] as const;
export type UserPreferenceKey = (typeof USER_PREFERENCE_KEYS)[number];

/**
 * ¿Esta persona dijo esto?
 *
 * Devuelve `null` cuando no se pudo leer — **sin dato NO es cero**. Quien
 * llama tiene que decidir qué hacer con la duda, y en el caso de la bienvenida
 * la decisión está escrita: ante la duda, no se muestra. Enseñar el vídeo a
 * alguien que pidió no volver a verlo es peor que no enseñárselo a alguien que
 * lo habría visto.
 */
export async function hasUserPreference(
  key: UserPreferenceKey, client?: Db
): Promise<boolean | null> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("user_preferences")
    .select("preference_key")
    .eq("preference_key", key)
    .maybeSingle();

  if (error) return null;
  return data !== null;
}

/**
 * Guarda una preferencia de quien llama.
 *
 * Por la función canónica: `auth.uid()` lo pone el servidor. Esta capa no
 * acepta —ni podría pasar— un identificador de persona.
 */
export async function setUserPreference(
  key: UserPreferenceKey, value?: string | null, client?: Db
): Promise<boolean> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("set_user_preference", {
    p_key: key,
    p_value: value ?? null,
  });
  return !error;
}
