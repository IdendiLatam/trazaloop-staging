/**
 * Trazaloop · QUALITY-12.2C · Las acciones de la asistencia de redacción.
 *
 * Vive en el dominio y no junto a la política porque la pantalla las necesita
 * —para pintar el selector— y la política es `server-only`: el texto de las
 * instrucciones no tiene por qué viajar al navegador, y la lista de acciones
 * sí. Mezclarlas habría hecho lo primero inevitable.
 */

export const QUICK_EDIT_ACTIONS = [
  "improve_writing",
  "clarify",
  "formalize",
  "shorten",
  "review_against_guidance",
  "alternative_wording",
] as const;

export type QuickEditAction = (typeof QUICK_EDIT_ACTIONS)[number];

export const QUICK_EDIT_LABEL: Record<QuickEditAction, string> = {
  improve_writing: "Mejorar redacción",
  clarify: "Hacer más claro",
  formalize: "Hacer más técnico",
  shorten: "Sintetizar",
  review_against_guidance: "Revisar con la guía de esta sección",
  alternative_wording: "Proponer otra versión",
};
