/**
 * Trazaloop · QUALITY-12.2E · Cómo se llama esto de cara a quien lo usa.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * Porque el nombre visible estaba escrito a mano en una treintena de sitios
 * —navegación, botones, títulos, errores, exportaciones— y cambiarlo obligaba
 * a encontrarlos todos. La próxima vez que el producto se llame de otra manera
 * debería bastar con tocar aquí.
 *
 * No es un sistema de marca: son ocho constantes y dos funciones. Un framework
 * de branding para un producto con un nombre sería peor que el problema.
 *
 * LA SEPARACIÓN QUE SOSTIENE EL SPRINT
 *
 *     IDENTIDAD VISIBLE    Trazaloop Intelligence     ← esto se renombra
 *     ESPACIO TÉCNICO      quality_ai_*               ← esto NO se toca
 *
 * La segunda mitad importa tanto como la primera. Las tablas, las funciones,
 * las variables de entorno, los `use_case` guardados y los nombres de plantilla
 * se quedan como están. Cambiarlos obligaría a migrar datos históricos para no
 * ganar nada: un `use_case = 'copilot.ask'` de hace tres meses sigue siendo esa
 * consulta, y reescribirlo sería falsificar el registro para que combine con
 * una etiqueta.
 *
 * De ahí que este archivo tenga `useCaseLabel()`: la traducción vive en la
 * presentación, no en la base.
 *
 * Y NO es `server-only`: lo usan tanto las pantallas como el servidor.
 */

/** El nombre completo. Se usa cuando hay sitio y cuando hace falta contexto. */
export const INTELLIGENCE_PRODUCT_NAME = "Trazaloop Intelligence";

/**
 * El nombre corto. Para navegación, botones y cualquier sitio estrecho.
 *
 * No es «IA» ni «AI»: eso describe la tecnología, no el producto, y dentro de
 * un año habrá que explicarlo igual. «Intelligence» a secas se entiende en la
 * barra lateral y no rompe el móvil.
 */
export const INTELLIGENCE_SHORT_NAME = "Intelligence";

/**
 * Las tres acciones.
 *
 * Se llaman distinto porque hacen cosas distintas, y la diferencia entre las
 * dos últimas es la que más cuesta transmitir:
 *
 *   MEJORAR   mira tu texto y lo escribe mejor.
 *   REVISAR   compara tu texto con lo que Trazaloop tiene registrado.
 */
export const INTELLIGENCE_ACTIONS = {
  ask: `Preguntar a ${INTELLIGENCE_SHORT_NAME}`,
  improve: `Mejorar con ${INTELLIGENCE_SHORT_NAME}`,
  review: `Revisar con ${INTELLIGENCE_SHORT_NAME}`,
} as const;

export const INTELLIGENCE_SETTINGS_TITLE = `Ajustes de ${INTELLIGENCE_SHORT_NAME}`;
export const INTELLIGENCE_SUGGESTIONS_TITLE = `Propuestas de ${INTELLIGENCE_SHORT_NAME}`;
export const INTELLIGENCE_HISTORY_TITLE = `Consultas de ${INTELLIGENCE_SHORT_NAME}`;

/**
 * Lo que se enseña cuando no hay proveedor configurado.
 *
 * Habla del producto, no de la instalación: quien lee esto no tiene por qué
 * saber que existe una variable de entorno, y enseñarle su nombre no le ayuda
 * a hacer nada. Quien sí puede arreglarlo lo sabe por otro camino.
 */
export const INTELLIGENCE_NOT_AVAILABLE =
  `${INTELLIGENCE_SHORT_NAME} no está disponible en este entorno.`;

/**
 * Los `use_case` guardados, traducidos para la pantalla.
 *
 * A la izquierda lo que hay en la base y seguirá habiendo. A la derecha lo que
 * lee una persona. Un run de `copilot.ask` de antes del renombrado se sigue
 * viendo bien sin haber tocado una sola fila.
 */
const USE_CASE_LABEL: Record<string, string> = {
  "copilot.ask": `Pregunta a ${INTELLIGENCE_SHORT_NAME}`,
  "copilot.explain_signal": "Explicación de una señal",
  "copilot.root_cause": "Hipótesis de causa raíz",
  "copilot.risk_candidates": "Riesgos candidatos",
  "copilot.review_summary": "Resumen para la revisión por la dirección",
  "copilot.audit_prep": "Preparación de auditoría",
  "copilot.customer_themes": "Temas de la voz del cliente",
  "customer_themes": "Temas de la voz del cliente",
  "root_cause": "Hipótesis de causa raíz",
  "ask": `Pregunta a ${INTELLIGENCE_SHORT_NAME}`,
  "document.quick_edit": "Mejora de redacción",
  "document.contextual_review": "Revisión contextual",
};

/** Cómo se llama un caso de uso en pantalla. Si no se conoce, se devuelve tal
 *  cual: inventarle un nombre bonito a un identificador desconocido esconde
 *  que apareció uno nuevo. */
export function useCaseLabel(useCase: string): string {
  return USE_CASE_LABEL[useCase] ?? useCase;
}

/** Los identificadores que la presentación sabe traducir. Existe para que una
 *  prueba pueda comprobar que no se ha renombrado ninguno en la base. */
export const KNOWN_USE_CASES = Object.keys(USE_CASE_LABEL);
