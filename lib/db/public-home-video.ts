import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TUTORIAL_PLAYBACK_TTL_SECONDS } from "@/lib/domain/tutorial-media";

/**
 * Trazaloop · COMMERCIAL-UX-01E · El vídeo de la portada, para quien no tiene
 * sesión.
 *
 *
 * DOS COSAS DISTINTAS, DOS CAMINOS
 *
 *   IDENTIDAD → `v_public_home_video`, legible sin sesión (0215).
 *               Qué vídeo hay, qué versión, cómo se titula, cuánto dura.
 *               Es barato y va en el render de la portada.
 *
 *   MEDIO     → una URL temporal que firma el SERVIDOR, solo cuando el modal
 *               va a verse de verdad.
 *
 * No son dos formas de hacer lo mismo: son dos cosas distintas, y separarlas es
 * justamente lo que evita descargar un vídeo a quien ya dijo que no quiere
 * verlo. La portada pregunta «¿hay vídeo?» y solo pide los bytes si, además,
 * quien mira no lo ha descartado.
 *
 *
 * POR QUÉ LA FIRMA NO ACEPTA PARÁMETROS
 *
 * `signPublicHomeVideo()` no recibe nada. Ni el tutorial, ni la versión, ni la
 * ruta. Resuelve ella misma cuál es el vídeo de la portada llamando a una
 * función de la base que TAMPOCO acepta parámetros.
 *
 * Es la defensa más fuerte contra «fírmame este otro»: no existe el argumento.
 * Una firma que aceptara un identificador tendría que comprobar que ese
 * identificador es el que toca —y esa comprobación se puede olvidar, o
 * escribirse mal, o dejar de cubrir un caso—. Aquí no hay nada que comprobar
 * porque no hay nada que elegir.
 *
 *
 * EL CLIENTE ADMINISTRATIVO NO SALE DE AQUÍ
 *
 * La firma la emite `createAdminClient`, que es `server-only` y nunca llega al
 * navegador. La alternativa —abrirle el bucket a `anon`— habría convertido todo
 * el almacén de tutoriales en público para poder enseñar un vídeo. El bucket
 * `tutorial-media` sigue privado y sin una sola política nueva.
 */

type Db = SupabaseClient;

/** Lo que se puede saber del vídeo sin sesión. Ni una ruta, ni una huella. */
export type PublicHomeVideo = {
  tutorialId: string;
  versionId: string;
  versionNumber: number;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  mimeType: string | null;
  hasPoster: boolean;
};

/**
 * ¿Hay vídeo de portada publicado?
 *
 * `null` significa que no hay ninguno, o que no se pudo leer. Las dos cosas se
 * resuelven igual arriba —la portada se pinta entera y sin modal— y por eso no
 * se distinguen: un vídeo de bienvenida no es motivo para romper una portada.
 */
export async function readPublicHomeVideo(
  client?: Db
): Promise<PublicHomeVideo | null> {
  try {
    const supabase = client ?? (await createServerClient());
    const { data, error } = await supabase
      .from("v_public_home_video")
      .select("tutorial_id, version_id, version_number, title, description,"
        + " duration_seconds, mime_type, has_poster")
      .maybeSingle();
    if (error || !data) return null;
    const r = data as unknown as {
      tutorial_id: string; version_id: string; version_number: number;
      title: string; description: string | null;
      duration_seconds: number | null; mime_type: string | null;
      has_poster: boolean;
    };
    return {
      tutorialId: String(r.tutorial_id),
      versionId: String(r.version_id),
      versionNumber: Number(r.version_number),
      title: String(r.title),
      description: r.description === null ? null : String(r.description),
      durationSeconds: r.duration_seconds === null ? null : Number(r.duration_seconds),
      mimeType: r.mime_type === null ? null : String(r.mime_type),
      hasPoster: Boolean(r.has_poster),
    };
  } catch {
    return null;
  }
}

export type PublicPlayback =
  | { status: "ok"; url: string; expiresInSeconds: number }
  | { status: "not_published" }
  | { status: "unavailable" };

/**
 * Una URL temporal para el vídeo de la portada. Sin parámetros, a propósito.
 *
 * El orden importa: primero se resuelve en la BASE cuál es el vídeo —con su
 * emplazamiento, su estado de publicación y su versión vigente comprobados
 * allí— y solo después se firma. Firmar antes y comprobar después sería haber
 * entregado ya el acceso.
 */
export async function signPublicHomeVideo(): Promise<PublicPlayback> {
  try {
    const admin = createAdminClient();

    const { data: ruta, error: eRuta } = await admin
      .rpc("public_home_video_object_path");
    if (eRuta) return { status: "unavailable" };
    if (!ruta) return { status: "not_published" };

    const { data, error } = await admin.storage
      .from("tutorial-media")
      .createSignedUrl(String(ruta), TUTORIAL_PLAYBACK_TTL_SECONDS);
    if (error || !data?.signedUrl) return { status: "unavailable" };

    return {
      status: "ok",
      url: data.signedUrl,
      expiresInSeconds: TUTORIAL_PLAYBACK_TTL_SECONDS,
    };
  } catch {
    return { status: "unavailable" };
  }
}
