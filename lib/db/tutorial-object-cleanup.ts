import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Trazaloop · PE-03B2 · Retirar el objeto de una candidata descartada.
 *
 * LA ÚNICA VEZ QUE APARECE EL CLIENTE ADMINISTRATIVO, Y POR QUÉ
 *
 * El cubo de tutoriales NO tiene política de DELETE, a propósito: si la
 * tuviera, un objeto referenciado por una versión publicada podría borrarse
 * desde el cliente y dejar una referencia rota. 0099 ya documentó ese fallo
 * exacto en `evidences` y por eso quitó la política.
 *
 * Así que la retirada física es server-only, por el mismo camino que ya usa
 * `lib/db/storage-deletion.ts` para CPR y TrazaDocs. Es la excepción declarada
 * de §27: la administración normal de tutoriales no usa cliente administrativo
 * —listar, subir, verificar, publicar, reponer y previsualizar van todos con la
 * sesión de la persona—, y este módulo es lo único que no puede.
 *
 *
 * LO QUE NO HACE, Y ES LO IMPORTANTE
 *
 * No decide si se puede borrar. Eso lo decide la base: el disparador de 0159
 * rechaza borrar una versión con vigencia, así que quien llame aquí ya tuvo que
 * conseguir que la fila desapareciera. Y aun así se vuelve a comprobar que
 * ninguna otra versión referencia el objeto antes de tocarlo.
 *
 * Esa segunda comprobación no es paranoia: una versión REPUESTA comparte objeto
 * con la original. Borrar el objeto de una candidata repuesta se llevaría por
 * delante el vídeo de una versión publicada.
 */

/**
 * Retira el objeto de una versión descartada, si nadie más lo referencia.
 *
 * Devuelve qué pasó en vez de lanzar: que un objeto no se pueda retirar porque
 * otra versión lo usa no es un error, es la respuesta correcta.
 */
export async function removeDiscardedTutorialObject(
  objectPath: string
): Promise<{ removed: boolean; reason: "removed" | "still_referenced" | "failed" }> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("platform_tutorial_versions")
    .select("id").eq("object_path", objectPath).limit(1);
  if (error) return { removed: false, reason: "failed" };

  // Alguien más lo usa —tal vez una versión repuesta, tal vez la publicada de
  // la que se repuso—. No se toca.
  if (data && data.length > 0) return { removed: false, reason: "still_referenced" };

  const { error: eDel } = await admin.storage.from("tutorial-media").remove([objectPath]);
  if (eDel) return { removed: false, reason: "failed" };
  return { removed: true, reason: "removed" };
}
