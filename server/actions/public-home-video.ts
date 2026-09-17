"use server";

import { signPublicHomeVideo } from "@/lib/db/public-home-video";

/**
 * Trazaloop · COMMERCIAL-UX-01E · Pedir el vídeo de la portada.
 *
 *
 * LA ACCIÓN MÁS ESTRECHA QUE SE PUEDE ESCRIBIR
 *
 * No recibe nada. Ni el tutorial, ni la versión, ni la ruta, ni un token. No
 * hay dónde pedirle otra cosa, así que no puede entregarla.
 *
 * Es deliberado y es la diferencia con `renewWelcomePlaybackAction`, que exige
 * sesión: ésta la puede llamar cualquiera, porque lo que devuelve es
 * exactamente lo que la portada pública enseña a cualquiera. Si aceptara un
 * identificador, aceptar sin comprobar sería una fuga y comprobar sería una
 * comprobación que alguien puede olvidar el día que la toque.
 *
 *
 * NO EXIGE SESIÓN, Y ESO ES EL ENCARGO
 *
 * Quien abre la portada todavía no es cliente. Pedirle que entre para ver un
 * vídeo de presentación es pedirle que se comprometa antes de saber con qué.
 *
 *
 * POR QUÉ NO VA EN EL RENDER DE LA PORTADA
 *
 * Porque entonces se firmaría —y el navegador empezaría a descargar— también
 * para quien ya dijo «no volver a mostrar». La portada solo pregunta si HAY
 * vídeo; los bytes se piden cuando el modal va a abrirse de verdad.
 */
export async function requestPublicHomeVideoAction(): Promise<
  { url: string; expiresInSeconds: number } | { url: null }
> {
  const r = await signPublicHomeVideo();
  return r.status === "ok"
    ? { url: r.url, expiresInSeconds: r.expiresInSeconds }
    : { url: null };
}
