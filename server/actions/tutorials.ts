"use server";

import { requireSession } from "@/lib/auth/require-session";
import { getTutorialForPage, signTutorialPlayback } from "@/lib/db/tutorials";
import { isKnownPageKey } from "@/lib/modules/page-keys";
import {
  TUTORIAL_UNAVAILABLE_MESSAGE, TUTORIAL_PLAYBACK_TTL_SECONDS,
} from "@/lib/domain/tutorial-media";

/**
 * Trazaloop · PE-03B3 · Lo que pide el botón «Ver video tutorial».
 *
 * Dos acciones y ninguna más. La pantalla no consulta la base directamente:
 * pregunta por una clave de pantalla y recibe, o un vídeo firmado, o el motivo
 * por el que no lo hay.
 *
 * NO SE CONSULTA NINGÚN PLAN. La decisión congelada dice que si se puede ver la
 * pantalla se puede ver su tutorial, y la forma de garantizar que nadie se
 * olvida de comprobar el plan es que no se comprueba.
 */

export type TutorialForPage =
  | { status: "ready"; title: string; description: string | null;
      url: string; expiresInSeconds: number }
  | { status: "no_video"; message: string }
  | { status: "unavailable"; message: string };

const NO_DISPONIBLE =
  "No se pudo preparar el vídeo ahora mismo. Vuelve a intentarlo en un momento.";

/**
 * El tutorial de una pantalla, listo para reproducir.
 *
 * Se firma **al pedirlo**, no al pintar la pantalla: firmar cuesta unos
 * milisegundos y una pantalla que nadie va a abrir no debería gastarlos.
 *
 * Distingue las dos ausencias, que es la regla de siempre: «no hay vídeo» es
 * normal y se dice con la copia congelada; «no se pudo preparar» es una avería
 * y no puede presentarse como si la pantalla no tuviera tutorial.
 */
export async function getTutorialForPageAction(
  pageKey: string
): Promise<TutorialForPage> {
  await requireSession();

  // Una clave que no está en el registro no es un error del sistema: es una
  // pantalla que no admite tutorial. Se responde como tal.
  if (!isKnownPageKey(pageKey)) {
    return { status: "no_video", message: TUTORIAL_UNAVAILABLE_MESSAGE };
  }

  const encontrado = await getTutorialForPage(pageKey);
  if (encontrado.status === "unavailable") {
    return { status: "unavailable", message: NO_DISPONIBLE };
  }
  if (!encontrado.tutorial) {
    return { status: "no_video", message: TUTORIAL_UNAVAILABLE_MESSAGE };
  }

  const firmado = await signTutorialPlayback({ tutorialType: "page", pageKey });
  if (firmado.status === "not_published") {
    return { status: "no_video", message: TUTORIAL_UNAVAILABLE_MESSAGE };
  }
  if (firmado.status === "unavailable") {
    return { status: "unavailable", message: NO_DISPONIBLE };
  }

  return {
    status: "ready",
    title: encontrado.tutorial.title,
    description: encontrado.tutorial.description,
    url: firmado.url,
    expiresInSeconds: firmado.expiresInSeconds,
  };
}

/**
 * Renueva la autorización de reproducción sin cambiar de vídeo.
 *
 * Es la mitad que le faltaba al plazo de dos horas. Sin ella, ese plazo sería un
 * máximo escondido de duración de tutorial — y este producto ya no le pone
 * máximo a la duración.
 *
 * Devuelve una URL nueva **del mismo objeto inmutable**: el reproductor la
 * sustituye y vuelve al segundo en el que estaba. No se sube el plazo a un
 * número enorme, que sería dejar el enlace vivo un día para no tener que
 * renovarlo.
 */
export async function renewTutorialPlaybackAction(
  pageKey: string
): Promise<{ url: string | null; expiresInSeconds: number }> {
  await requireSession();
  if (!isKnownPageKey(pageKey)) return { url: null, expiresInSeconds: 0 };

  const firmado = await signTutorialPlayback({ tutorialType: "page", pageKey });
  if (firmado.status !== "ok") return { url: null, expiresInSeconds: 0 };
  return { url: firmado.url, expiresInSeconds: TUTORIAL_PLAYBACK_TTL_SECONDS };
}
