/**
 * Trazaloop · QUALITY-12.2D · El vocabulario de la revisión contextual.
 *
 * Este archivo NO es `server-only` a propósito: la pantalla necesita las
 * etiquetas y el servidor necesita la lista cerrada, y la lección de 12.2C fue
 * que poner las dos cosas en un módulo de servidor rompe el panel entero
 * —silenciosamente, porque el error aparece al importar, no al pulsar—.
 *
 * LO QUE ESTA TAXONOMÍA SE NIEGA A TENER
 *
 * `nonconformity`. Y no es una omisión: es la decisión más importante del
 * sprint.
 *
 * Una no conformidad es un REGISTRO del sistema de gestión. La declara una
 * persona con autoridad, tiene código, dueño, causa, tratamiento, cierre y
 * evidencia; se audita; se cuenta en la revisión por la dirección. Un hallazgo
 * de esta pantalla no es nada de eso: es una observación que alguien puede
 * mirar y descartar sin dejar rastro.
 *
 * Si el vocabulario se pareciera —«no conformidad menor», «hallazgo mayor»—,
 * la confusión llegaría sola: alguien exportaría la lista, la llevaría a una
 * auditoría y presentaría como diagnóstico del sistema lo que un modelo
 * dedujo de un párrafo. Por eso ni los tipos ni las severidades usan una sola
 * palabra del vocabulario de auditoría.
 *
 * Lo mismo con la conformidad en el otro sentido: `consistent` dice que el
 * texto y el registro COINCIDEN. No dice que esté bien, ni que cumpla una
 * norma, ni que se pueda certificar.
 */

/** Los siete tipos. Lista cerrada; el esquema del proveedor la impone. */
export const REVIEW_FINDING_TYPES = [
  "consistent",
  "missing_information",
  "possible_conflict",
  "confirmed_conflict",
  "unverifiable_claim",
  "ambiguous_reference",
  "guidance_gap",
] as const;
export type ReviewFindingType = (typeof REVIEW_FINDING_TYPES)[number];

/**
 * Los tipos que el MODELO puede escribir.
 *
 * `confirmed_conflict` no está, y esa ausencia es una garantía, no un descuido.
 * «Confirmado» significa que el código comparó dos valores y no coincidieron:
 * el nombre del cargo que la persona escribió contra el cargo registrado, la
 * frecuencia escrita contra la frecuencia registrada. Eso lo hace una función
 * determinista y se puede repetir mañana con el mismo resultado.
 *
 * Un modelo que pudiera escribir esa palabra la escribiría cuando estuviera
 * convencido, que no es lo mismo que cuando fuera cierto. Así que la escribe
 * el código: el modelo dice `possible_conflict` y la orquestación lo asciende
 * si —y solo si— su propia comparación coincide.
 */
export const MODEL_FINDING_TYPES = REVIEW_FINDING_TYPES
  .filter((t) => t !== "confirmed_conflict");

export const REVIEW_FINDING_LABEL: Record<ReviewFindingType, string> = {
  consistent: "Coincide con lo registrado",
  missing_information: "Falta un dato que la guía pide",
  possible_conflict: "Podría no coincidir",
  confirmed_conflict: "No coincide con lo registrado",
  unverifiable_claim: "Afirmación que Trazaloop no puede respaldar",
  ambiguous_reference: "Referencia ambigua",
  guidance_gap: "La guía pide algo que el texto no aborda",
};

/**
 * Tres severidades, y ninguna es de auditoría.
 *
 * Son EDITORIALES: dicen cuánta atención merece leer esto, no cuánta gravedad
 * tiene para el sistema de gestión. Esa segunda escala existe en Trazaloop y
 * la fijan personas, en otro sitio y con otro procedimiento.
 */
export const REVIEW_SEVERITIES = ["info", "attention", "conflict"] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export const REVIEW_SEVERITY_LABEL: Record<ReviewSeverity, string> = {
  info: "Para tu información",
  attention: "Merece una mirada",
  conflict: "Discrepancia",
};

/** Los doce tipos de contexto de QUALITY-12.2B. Idénticos a los de la base. */
export const RELATED_CONTEXT_TYPES = [
  "organization_profile", "process", "position", "document", "risk", "control",
  "indicator", "objective", "supplier", "customer_feedback", "evidence", "case",
] as const;
export type RelatedContextType = (typeof RELATED_CONTEXT_TYPES)[number];

export const RELATED_CONTEXT_LABEL: Record<RelatedContextType, string> = {
  organization_profile: "Perfil de la empresa",
  process: "Procesos",
  position: "Cargos",
  document: "Otros documentos",
  risk: "Riesgos",
  control: "Controles",
  indicator: "Indicadores",
  objective: "Objetivos",
  supplier: "Proveedores",
  customer_feedback: "Voz del cliente",
  evidence: "Evidencias",
  case: "Casos y acciones",
};

/**
 * Cuáles de los doce se saben resolver HOY con un alcance determinista.
 *
 * Los otros cinco no tienen en el modelo actual ningún camino estructural que
 * los ate a un documento. Se podrían buscar por parecido de nombre; eso es
 * exactamente lo que §7 prohíbe, y con razón: convertiría cualquier palabra
 * del párrafo en una entidad y la revisión empezaría a hablar de proveedores
 * que nadie mencionó.
 *
 * Objetivos, proveedores, voz del cliente y casos estaban previstos aquí desde
 * el principio, y hoy ninguna guía los declara.
 *
 * EVIDENCIAS ES OTRA COSA, Y CONVIENE DEJARLO ESCRITO
 *
 * Diecisiete guías —las secciones «Registros» y «Evidencias» de Textiles y el
 * papel `records` de Quality— SÍ declaran `evidence` como pertinente. Y tiene
 * todo el sentido: la sección que enumera los registros que deja una actividad
 * debería poder contrastarse con las evidencias de esa actividad.
 *
 * Solo que esa relación no existe. Se buscó una por una: `evidence_links`
 * apunta a proveedores, materiales, productos, lotes y órdenes —y su disparador
 * de validación RECHAZA explícitamente `document`, aunque el enum lo tenga—;
 * `textile_evidence_links` apunta a entidades textiles; y ninguna clave ajena
 * de la base lleva de una evidencia a un `trazadoc_document`.
 *
 * Se podría haber inventado el enlace. Habría sido un cambio de dominio hecho
 * de pasada, dentro de un sprint de IA, para que una prueba enseñara algo. Así
 * que la revisión dice que no puede mirar ahí, y queda anotado para quien
 * decida si esa relación debe existir.
 */
export const ROUTABLE_CONTEXT_TYPES: readonly RelatedContextType[] = [
  "organization_profile", "process", "position", "document",
  "risk", "control", "indicator",
];

export const UNSCOPED_CONTEXT_TYPES: readonly RelatedContextType[] =
  RELATED_CONTEXT_TYPES.filter((t) => !ROUTABLE_CONTEXT_TYPES.includes(t));

export function isRoutable(t: string): t is RelatedContextType {
  return (ROUTABLE_CONTEXT_TYPES as readonly string[]).includes(t);
}
