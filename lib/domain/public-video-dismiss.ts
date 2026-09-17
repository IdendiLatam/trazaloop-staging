/**
 * Trazaloop · COMMERCIAL-UX-01E · Cómo se recuerda que alguien no quiere ver un
 * vídeo.
 *
 *
 * LA IDENTIDAD ES LO ÚNICO QUE IMPORTA AQUÍ
 *
 * La clave se compone con el tutorial Y la versión. Las dos, y por un motivo
 * concreto:
 *
 *   · solo el tutorial → publicar la v2 no volvería a enseñarse, porque la
 *     decisión sobre la v1 la habría sepultado;
 *
 *   · solo la versión → cambiar de tutorial podría reutilizar un identificador
 *     que alguien ya descartó, y el vídeo nuevo nacería invisible.
 *
 * Con las dos, un contenido distinto es una clave distinta, y una clave que
 * nadie ha escrito significa «todavía no me han dicho que no».
 *
 *
 * LO QUE LA CLAVE NO LLEVA
 *
 * Ni correo, ni identificador de persona, ni empresa. Solo los dos
 * identificadores del contenido, que ya son públicos: salen de la vista que
 * cualquiera puede leer sin sesión.
 *
 * Importa porque esto vive en el navegador de alguien que quizá no es cliente.
 * Una clave de `localStorage` sobrevive a la sesión, se ve entera desde las
 * herramientas del navegador y viaja con el perfil. Meter ahí una identidad
 * sería dejar un rastro de quién visitó la portada, a cambio de nada.
 *
 *
 * Y NO ES `welcome_video_suppressed`
 *
 * Ese es el interruptor del vídeo de bienvenida de DENTRO del producto, y
 * significa «nunca más, aunque se publique otra cosa». Reutilizarlo aquí
 * mezclaría dos decisiones distintas: quien apagó el saludo interno no ha dicho
 * nada sobre la portada pública, y al revés.
 *
 * Lógica PURA: sin React, sin navegador, sin base de datos.
 */

/** Lo que identifica al vídeo. Nada más hace falta para recordarlo. */
export type PublicHomeVideoIdentity = {
  tutorialId: string;
  versionId: string;
  title: string;
  description: string | null;
};

/** El prefijo, con el producto delante para no chocar con nada del dominio. */
export const PUBLIC_VIDEO_DISMISS_PREFIX = "trazaloop:public-home-video-dismissed";

/**
 * La clave con la que se recuerda un «no volver a mostrar».
 *
 * Determinista y sin sorpresas: el mismo contenido da siempre la misma clave, y
 * contenido distinto da otra.
 */
export function publicVideoDismissKey(
  video: Pick<PublicHomeVideoIdentity, "tutorialId" | "versionId">
): string {
  return `${PUBLIC_VIDEO_DISMISS_PREFIX}:${video.tutorialId}:${video.versionId}`;
}
