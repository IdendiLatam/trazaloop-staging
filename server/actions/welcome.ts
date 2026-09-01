"use server";

import { requireSession } from "@/lib/auth/require-session";
import { getWelcomeTutorial, signTutorialPlayback } from "@/lib/db/tutorials";
import {
  hasUserPreference, setUserPreference,
} from "@/lib/db/user-preferences";
import { TUTORIAL_PLAYBACK_TTL_SECONDS } from "@/lib/domain/tutorial-media";

/**
 * Trazaloop · PE-03B4 · La bienvenida, y lo que una persona decide sobre ella.
 *
 * Tres acciones. Ninguna consulta un plan, igual que las de PE-03B3: la
 * bienvenida no se vende.
 */

export type WelcomeForUser =
  | { status: "ready"; title: string; description: string | null;
      url: string; expiresInSeconds: number }
  | { status: "none" };

/**
 * El vídeo de bienvenida, si a esta persona le toca verlo.
 *
 * UNA SOLA AUSENCIA, Y ES DELIBERADO
 *
 * PE-03B3 distingue tres estados en el tutorial de pantalla porque allí hay un
 * botón que alguien pulsó: una avería tiene que decirse, o la persona cree que
 * esa pantalla no tiene vídeo y no vuelve a intentarlo.
 *
 * Aquí nadie pulsó nada. Si el vídeo no está —porque no hay ninguno publicado,
 * porque la persona pidió no volver a verlo, o porque algo falló— la respuesta
 * es la misma: no se abre nada y se sigue trabajando. La decisión congelada lo
 * dice sin rodeos: la bienvenida es acompañamiento, no una puerta.
 *
 * Y por eso «no se pudo leer la preferencia» se trata como «no mostrar». Entre
 * enseñarle el vídeo a quien pidió no volver a verlo y no enseñárselo a quien
 * lo habría visto, la segunda equivocación es la barata.
 */
export async function getWelcomeForUserAction(): Promise<WelcomeForUser> {
  await requireSession();

  // Primero la preferencia: si dijo que no, no hay ni que mirar si hay vídeo.
  const suprimida = await hasUserPreference("welcome_video_suppressed");
  if (suprimida !== false) return { status: "none" };

  const encontrado = await getWelcomeTutorial();
  if (encontrado.status !== "ok" || !encontrado.tutorial) return { status: "none" };

  const firmado = await signTutorialPlayback({ tutorialType: "welcome" });
  if (firmado.status !== "ok") return { status: "none" };

  return {
    status: "ready",
    title: encontrado.tutorial.title,
    description: encontrado.tutorial.description,
    url: firmado.url,
    expiresInSeconds: firmado.expiresInSeconds,
  };
}

/**
 * «No volver a mostrar».
 *
 * Se guarda una vez y no se deshace: publicar una versión nueva del vídeo no lo
 * reinicia, y no hay reinicio masivo desde ninguna consola. 0161 lo sostiene
 * por RLS —no hay política de DELETE—, no solo por no haber escrito la pantalla.
 */
export async function suppressWelcomeVideoAction(): Promise<{ ok: boolean }> {
  await requireSession();
  const guardada = await setUserPreference("welcome_video_suppressed");
  return { ok: guardada };
}

/**
 * Renovar la autorización mientras el vídeo corre.
 *
 * El mismo motor de PE-03B3, sin una segunda implementación: firma otra vez la
 * versión VIGENTE del mismo vídeo inmutable. Un vídeo de bienvenida largo no se
 * corta a las dos horas, porque Trazaloop no le pone duración máxima.
 */
export async function renewWelcomePlaybackAction(): Promise<{
  url: string | null; expiresInSeconds: number;
}> {
  await requireSession();
  const firmado = await signTutorialPlayback({ tutorialType: "welcome" });
  if (firmado.status !== "ok") return { url: null, expiresInSeconds: 0 };
  return { url: firmado.url, expiresInSeconds: TUTORIAL_PLAYBACK_TTL_SECONDS };
}
