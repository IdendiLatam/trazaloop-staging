import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/lib/supabase/server";
import { TUTORIAL_PLAYBACK_TTL_SECONDS } from "@/lib/domain/tutorial-media";

/**
 * Trazaloop · PE-03B1 · El tutorial que ve una persona normal.
 *
 * Solo la versión VIGENTE, y por dos caminos que se refuerzan:
 *
 *   1 · `v_tutorial_current` no devuelve candidatas ni históricas. No es una
 *       comprobación que alguien pueda olvidar: es que la consulta no las mira.
 *   2 · la ruta del objeto NO sale de aquí hacia el navegador. Se firma en el
 *       servidor, tras resolver que esa versión es la vigente.
 *
 * La segunda importa más de lo que parece. PE-03A comprobó —y 0099 lo tenía
 * escrito— que una URL firmada autoriza el objeto POR SÍ MISMA. Si la ruta
 * viajara al cliente, la frontera dejaría de estar donde se autoriza y pasaría
 * a estar donde se adivina.
 *
 * SIN CLIENTE ADMINISTRATIVO. La vista ya exige sesión.
 */

type Db = SupabaseClient;

async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

export type CurrentTutorial = {
  tutorialId: string;
  versionId: string;
  versionNumber: number;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  mimeType: string | null;
  publishedAt: string | null;
};

/**
 * El tutorial vigente de una pantalla, o `null` si no hay.
 *
 * `null` significa **no hay tutorial publicado**, y la pantalla dirá que está
 * en actualización. No significa que la lectura fallara: eso es
 * `status: "unavailable"` en `getTutorialForPage`, y son cosas distintas.
 */
function mapCurrent(row: Record<string, unknown>): CurrentTutorial {
  return {
    tutorialId: String(row.tutorial_id),
    versionId: String(row.version_id),
    versionNumber: Number(row.version_number),
    title: String(row.title),
    description: (row.description as string | null) ?? null,
    durationSeconds: (row.duration_seconds as number | null) ?? null,
    mimeType: (row.mime_type as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
  };
}

export type TutorialLookup =
  | { status: "ok"; tutorial: CurrentTutorial | null }
  | { status: "unavailable" };

/**
 * El tutorial de una pantalla.
 *
 * Distingue las dos ausencias, que es la regla de siempre: **sin dato NO es
 * cero**. «No hay tutorial» y «no se pudo leer» se ven igual desde fuera y
 * significan cosas opuestas — la primera es normal, la segunda es una avería
 * que no se puede presentar como si la pantalla no tuviera tutorial.
 */
export async function getTutorialForPage(
  pageKey: string, client?: Db
): Promise<TutorialLookup> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("v_tutorial_current")
    .select("tutorial_id, version_id, version_number, title, description, duration_seconds, mime_type, published_at")
    .eq("tutorial_type", "page")
    .eq("page_key", pageKey)
    .maybeSingle();

  if (error) return { status: "unavailable" };
  return { status: "ok", tutorial: data ? mapCurrent(data as Record<string, unknown>) : null };
}

/** El vídeo de bienvenida vigente. B4 decidirá cuándo se muestra. */
export async function getWelcomeTutorial(client?: Db): Promise<TutorialLookup> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("v_tutorial_current")
    .select("tutorial_id, version_id, version_number, title, description, duration_seconds, mime_type, published_at")
    .eq("tutorial_type", "welcome")
    .maybeSingle();

  if (error) return { status: "unavailable" };
  return { status: "ok", tutorial: data ? mapCurrent(data as Record<string, unknown>) : null };
}

export type PlaybackResult =
  | { status: "ok"; url: string; expiresInSeconds: number }
  | { status: "not_published" }
  | { status: "unavailable" };

/**
 * Firma la reproducción de la versión vigente de un tutorial.
 *
 * **Vuelve a resolver cuál es la vigente**, en lugar de aceptar un `versionId`
 * de quien llama. Es la diferencia entre «firma esta versión» y «firma la que
 * toca»: lo primero convertiría el identificador de una versión histórica en
 * una llave.
 *
 * La ruta se lee de la tabla con el cliente de sesión — que para una persona
 * normal no la devuelve— así que el paso se hace en dos: la vista dice cuál es
 * la versión vigente, y la firma la emite el servidor. Ver `signCurrentPlayback`.
 */
export async function signTutorialPlayback(
  input: { tutorialType: "page" | "welcome"; pageKey?: string },
  client?: Db
): Promise<PlaybackResult> {
  const supabase = await db(client);

  const buscada = input.tutorialType === "page"
    ? await getTutorialForPage(input.pageKey ?? "", supabase)
    : await getWelcomeTutorial(supabase);

  if (buscada.status === "unavailable") return { status: "unavailable" };
  if (!buscada.tutorial) return { status: "not_published" };

  // La ruta la resuelve una función de la base que solo devuelve la de la
  // versión VIGENTE. Así el navegador nunca ve una ruta, y el servidor nunca
  // firma una que no toque.
  const { data: ruta, error: eRuta } = await supabase
    .rpc("tutorial_current_object_path", { p_version_id: buscada.tutorial.versionId });
  if (eRuta || !ruta) return { status: "unavailable" };

  const { data, error } = await supabase.storage
    .from("tutorial-media")
    .createSignedUrl(String(ruta), TUTORIAL_PLAYBACK_TTL_SECONDS);

  if (error || !data?.signedUrl) return { status: "unavailable" };
  return {
    status: "ok",
    url: data.signedUrl,
    expiresInSeconds: TUTORIAL_PLAYBACK_TTL_SECONDS,
  };
}
