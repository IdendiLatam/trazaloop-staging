/**
 * Trazaloop · PROD-LAUNCH-01B · Qué tutorial guiado puede ver cada plan.
 *
 *
 * LA REGLA, ENTERA Y EN UNA FRASE
 *
 * El tutorial del Dashboard está en todos los planes. Cualquier otro tutorial
 * guiado pertenece a Full.
 *
 * Se escribe así de corta a propósito. La alternativa —una lista de claves
 * permitidas por plan, o un límite `guided_tutorials_enabled` por revisión—
 * obligaría a tocar el catálogo comercial cada vez que nace una pantalla, y
 * una pantalla nueva sin fila en esa lista se quedaría muda sin que nadie se
 * entere. Aquí una pantalla nueva cae del lado de Full por construcción, que
 * es el lado correcto: se descubre, se ofrece y no se regala.
 *
 *
 * POR QUÉ NO SE ESCONDE EL TUTORIAL QUE NO SE PUEDE VER
 *
 * Ocultarlo en la navegación ahorra una negativa y cuesta una venta: quien no
 * sabe que existe no lo echa de menos. Se muestra, se puede pulsar, y al
 * pulsarlo aparece la oferta. La negativa es la oferta.
 *
 *
 * «ACTIVAR» Y «REACTIVAR» NO SON LA MISMA FRASE
 *
 * A quien nunca tuvo Full se le ofrece activarlo. A quien lo tuvo y se le
 * venció se le ofrece reactivarlo, porque decirle «activa Full» a alguien que
 * ya lo pagó una vez suena a que su historia no consta en ninguna parte. Sí
 * consta, y el texto lo demuestra.
 *
 *
 * NO SABER NO ES NO TENER
 *
 * Si el plan efectivo no se pudo resolver, esto NO responde «eres Free». Un
 * corte de lectura no convierte a un cliente de Full en alguien a quien se le
 * vende Full. Devuelve `unavailable`, y la pantalla dice que no pudo
 * comprobarlo. Es la misma distinción que `getTutorialForPage` hace entre «no
 * hay tutorial» y «no se pudo leer».
 *
 * Lógica PURA: sin React, sin BD, sin sesión. La usan el servidor, las
 * pruebas y —vía props ya autorizadas— la interfaz.
 */

/** La ÚNICA pantalla cuyo tutorial guiado está en todos los planes. */
export const FREE_TUTORIAL_PAGE_KEY = "cpr.dashboard";

/**
 * El plan efectivo de quien mira, tal y como lo resuelve el modelo canónico.
 * `unknown` es la ausencia de respuesta, no un plan.
 */
export type TutorialViewerPlan = "free" | "full" | "extra" | "unknown";

/** Qué botón se ofrece: depende de si esta empresa tuvo Full alguna vez. */
export type TutorialUpsellCta = "activate" | "reactivate";

export type TutorialAccess =
  | { allowed: true }
  | {
      allowed: false;
      reason: "plan_required";
      title: string;
      body: string;
      cta: TutorialUpsellCta;
      ctaLabel: string;
      dismissLabel: string;
    }
  | { allowed: false; reason: "unavailable" };

/** Texto acordado. No se traduce, no sale de la BD y no lleva enlaces. */
export const TUTORIAL_UPSELL_TITLE = "Este tutorial está disponible en Full";
export const TUTORIAL_UPSELL_BODY =
  "Los tutoriales guiados de los módulos de Trazaloop están incluidos en el plan Full.";
export const TUTORIAL_UPSELL_ACTIVATE = "Activar Full";
export const TUTORIAL_UPSELL_REACTIVATE = "Reactivar Full";
export const TUTORIAL_UPSELL_DISMISS = "Cerrar";

export type TutorialViewer = {
  /** El plan efectivo. `unknown` si no se pudo resolver. */
  plan: TutorialViewerPlan;
  /**
   * ¿Esta empresa tuvo Full alguna vez? Solo cambia la etiqueta del botón.
   * Nunca concede acceso: un Full vencido es Free hasta que se reactive.
   */
  hadFullBefore?: boolean;
  /**
   * Backoffice del superadministrador. Ve todo, siempre: administrar el
   * contenido y comprarlo no son la misma relación con el producto.
   */
  isPlatformStaff?: boolean;
};

/**
 * ¿Puede esta persona ver el tutorial de esta pantalla?
 *
 * `pageKey` vacío se trata como cualquier otra pantalla que no es el
 * Dashboard: no se adivina a favor de quien pregunta.
 */
export function resolveTutorialAccess(
  viewer: TutorialViewer,
  pageKey: string
): TutorialAccess {
  if (viewer.isPlatformStaff === true) return { allowed: true };
  if (viewer.plan === "unknown") return { allowed: false, reason: "unavailable" };
  if (viewer.plan === "full" || viewer.plan === "extra") return { allowed: true };

  // Free. Solo el Dashboard.
  if (pageKey === FREE_TUTORIAL_PAGE_KEY) return { allowed: true };

  const reactiva = viewer.hadFullBefore === true;
  return {
    allowed: false,
    reason: "plan_required",
    title: TUTORIAL_UPSELL_TITLE,
    body: TUTORIAL_UPSELL_BODY,
    cta: reactiva ? "reactivate" : "activate",
    ctaLabel: reactiva ? TUTORIAL_UPSELL_REACTIVATE : TUTORIAL_UPSELL_ACTIVATE,
    dismissLabel: TUTORIAL_UPSELL_DISMISS,
  };
}

/**
 * ¿Se muestra el tutorial en la navegación?
 *
 * SIEMPRE que exista. Se separa de `resolveTutorialAccess` para que quede
 * escrito que son dos preguntas distintas y que la respuesta a esta no
 * depende del plan. Si alguien alguna vez quiere esconderlo, tendrá que
 * cambiar esta función y explicar por qué.
 */
export function tutorialIsDiscoverable(tutorialExists: boolean): boolean {
  return tutorialExists;
}
