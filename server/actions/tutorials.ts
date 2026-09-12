"use server";

import { requireSession } from "@/lib/auth/require-session";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getTutorialForPage, signTutorialPlayback } from "@/lib/db/tutorials";
import { resolveTutorialViewer } from "@/lib/db/tutorial-viewer";
import { resolveTutorialAccess } from "@/lib/domain/tutorial-access";
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
 * PROD-LAUNCH-01B.1 · AQUÍ, Y SOLO AQUÍ, SE MIRA EL PLAN.
 *
 * La decisión anterior era que ver una pantalla bastaba para ver su tutorial,
 * y que la forma de no olvidarse de comprobar el plan era no comprobarlo. El
 * lanzamiento comercial la cambia: los tutoriales guiados de los módulos son
 * de Full. El del Dashboard sigue estando en todos los planes.
 *
 * Lo que NO cambia es el porqué de aquella regla. El lector
 * —`lib/db/tutorials.ts`— sigue sin saber qué es un plan, y la puerta está en
 * un solo sitio: estas acciones. Si mañana aparece otra vía de entrega, lo que
 * hay que llamar es esto.
 *
 * Y LA PUERTA ESTÁ ANTES DE FIRMAR. No se prepara la URL y luego se decide si
 * enseñarla: una URL firmada emitida «por si acaso» es contenido entregado,
 * escribir la dirección a mano bastaría. Se decide primero.
 */

export type TutorialForPage =
  | { status: "ready"; title: string; description: string | null;
      url: string; expiresInSeconds: number }
  | { status: "no_video"; message: string }
  | { status: "unavailable"; message: string }
  /** El tutorial existe y esta empresa no lo tiene incluido. Se ofrece Full. */
  | { status: "plan_required"; title: string; body: string;
      ctaLabel: string; dismissLabel: string };

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

  const permiso = await autorizar(pageKey);
  if (permiso !== null) return permiso;

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
  // La renovación entrega una URL nueva: es entrega de contenido, y pasa por
  // la misma puerta. Sin esto, quien abriera el diálogo con Full y bajara a
  // Free seguiría renovando su enlace indefinidamente.
  if ((await autorizar(pageKey)) !== null) return { url: null, expiresInSeconds: 0 };

  const firmado = await signTutorialPlayback({ tutorialType: "page", pageKey });
  if (firmado.status !== "ok") return { url: null, expiresInSeconds: 0 };
  return { url: firmado.url, expiresInSeconds: TUTORIAL_PLAYBACK_TTL_SECONDS };
}

/**
 * La puerta. Devuelve `null` si se puede entregar, o la respuesta que hay que
 * dar si no.
 *
 * Falla CERRADA en los dos sentidos: sin empresa activa no se entrega, y con
 * un plan que no se pudo leer tampoco —pero eso último se dice como avería, no
 * como oferta, porque venderle Full a quien ya lo paga es peor que no
 * responder.
 */
async function autorizar(pageKey: string): Promise<TutorialForPage | null> {
  let org: Awaited<ReturnType<typeof requireActiveOrg>>;
  try {
    org = await requireActiveOrg();
  } catch {
    return { status: "unavailable", message: NO_DISPONIBLE };
  }

  // No se pasa `isPlatformStaff`: quien navega el shell de una empresa está
  // actuando COMO esa empresa, y la consola de plataforma tiene su propia vía
  // de previsualización que no pasa por aquí.
  const quien = await resolveTutorialViewer({ organizationId: org.organizationId });
  if (!quien.ok) return { status: "unavailable", message: NO_DISPONIBLE };

  const acceso = resolveTutorialAccess(quien.viewer, pageKey);
  if (acceso.allowed) return null;
  if (acceso.reason === "unavailable") {
    return { status: "unavailable", message: NO_DISPONIBLE };
  }
  return {
    status: "plan_required",
    title: acceso.title,
    body: acceso.body,
    ctaLabel: acceso.ctaLabel,
    dismissLabel: acceso.dismissLabel,
  };
}
