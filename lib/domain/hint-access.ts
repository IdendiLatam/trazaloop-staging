/**
 * Trazaloop · Acceso COMERCIAL al contenido de los tips/hints administrables
 * (el sistema del botón "i" de TrazaDocs CPR y TrazaDocs Textiles, cuyos
 * textos administra el superadministrador en /platform/trazadocs).
 *
 * Regla comercial (una sola interpretación, POR MÓDULO):
 * - Demo   → NUNCA se entrega el contenido administrado: se devuelve un
 *            mensaje fijo, sin enlaces, videos ni fragmentos del texto real.
 * - Full   → contenido administrado, exactamente como hoy.
 * - Extra  → contenido administrado, exactamente como hoy.
 * - Backoffice del superadministrador → contenido administrado siempre
 *            (consulta, edición y vista previa no se ven afectadas).
 *
 * El modo comercial NO se reinterpreta aquí: `ModuleAccessMode` proviene de
 * la regla canónica (lib/modules/access.ts) y se resuelve en servidor
 * (lib/db/hint-access.ts) antes de construir la respuesta del cliente.
 *
 * Lógica PURA (sin React, sin BD, sin sesión): la usan el servidor, las
 * pruebas y —vía props ya autorizadas— la interfaz.
 *
 * ALCANCE: solo el sistema administrable de hints. Los mensajes de
 * validación, errores de formulario, tooltips descriptivos, atributos
 * `title`, ayudas de accesibilidad, avisos legales y mensajes de límites de
 * uso NO pasan por aquí y no se sustituyen jamás.
 */
import type { ModuleAccessMode } from "@/lib/modules/access";
import { hasHintContent } from "@/lib/domain/hint-links";

/** Título breve del aviso mostrado en Demo. */
export const DEMO_HINT_TITLE = "Recurso disponible en Full y Extra";

/** Mensaje FIJO de Demo. Texto exacto acordado con el equipo comercial: no
 *  se almacena en BD, no se traduce y no lleva enlaces ni botones de pago. */
export const DEMO_HINT_MESSAGE =
  "Los tutoriales, guías paso a paso y videos no están disponibles en la versión Demo. Accede a estos recursos en los planes Full y Extra.";

/**
 * Hint YA AUTORIZADO para un espectador concreto. Es lo único que viaja al
 * navegador: cuando `restricted` es true, `text` es el mensaje fijo y el
 * contenido administrado no forma parte del objeto.
 */
export type ResolvedHint =
  | { restricted: false; title: null; text: string }
  | { restricted: true; title: string; text: string };

/**
 * Quién mira el hint.
 * - `platform`: backoffice del superadministrador (consulta/edición/vista
 *   previa del contenido real).
 * - `organization`: usuario empresarial; `accessMode` es el modo comercial
 *   DEL MÓDULO al que pertenece el hint (nunca un plan org-global).
 *   `null` (sin acceso resoluble) se trata como Demo: fail-closed.
 */
export type HintViewer =
  | { audience: "platform" }
  | { audience: "organization"; accessMode: ModuleAccessMode | null };

/** Espectador empresarial para un módulo con el modo ya resuelto. */
export function organizationHintViewer(accessMode: ModuleAccessMode | null): HintViewer {
  return { audience: "organization", accessMode };
}

/** Espectador de backoffice: siempre ve el contenido real. */
export const PLATFORM_HINT_VIEWER: HintViewer = { audience: "platform" };

/** ¿Este espectador puede recibir el contenido administrado del hint? */
export function canViewAdministeredHint(viewer: HintViewer): boolean {
  if (viewer.audience === "platform") return true;
  return viewer.accessMode === "full" || viewer.accessMode === "extra";
}

/** El aviso fijo de Demo, siempre idéntico. */
export function demoHint(): ResolvedHint {
  return { restricted: true, title: DEMO_HINT_TITLE, text: DEMO_HINT_MESSAGE };
}

/**
 * Autoriza UN hint para UN espectador.
 *
 * - Sin contenido administrado → `null`: el botón "i" no se muestra (mismo
 *   comportamiento que hoy en todos los modos; Demo no inventa botones
 *   donde el superadministrador no escribió nada).
 * - Espectador autorizado (Full, Extra o backoffice) → contenido tal cual.
 * - Cualquier otro caso (Demo o modo no resoluble) → mensaje fijo, sin una
 *   sola palabra ni URL del contenido real.
 */
export function resolveHintForViewer(
  hint: string | null | undefined,
  viewer: HintViewer
): ResolvedHint | null {
  if (!hasHintContent(hint)) return null;
  if (canViewAdministeredHint(viewer)) {
    return { restricted: false, title: null, text: (hint as string).trim() };
  }
  return demoHint();
}

/**
 * Autoriza un conjunto de hints (secciones de una estructura) para un mismo
 * espectador, devolviendo el mapa `id → hint autorizado` que consume la
 * interfaz. Las secciones sin hint quedan fuera del mapa.
 */
export function resolveHintMapForViewer(
  sections: readonly { id: string; hint: string | null }[],
  viewer: HintViewer
): Record<string, ResolvedHint> {
  const map: Record<string, ResolvedHint> = {};
  for (const section of sections) {
    const resolved = resolveHintForViewer(section.hint, viewer);
    if (resolved !== null) map[section.id] = resolved;
  }
  return map;
}
