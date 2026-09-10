/**
 * Trazaloop · STABILIZATION-01 · De un error de la base a algo accionable.
 *
 * Vive aparte de la Server Action a propósito: aquí no hay Next, ni React, ni
 * sesión, así que se puede ejercitar con los códigos REALES que la base devolvió
 * en el descubrimiento, sin levantar medio producto para comprobar una frase.
 */
export const SOLO_ADMINISTRACION =
  "Solo la administración de plataforma puede cambiar condiciones comerciales.";

/**
 * De un error de la base a algo que se pueda leer y arreglar.
 *
 * ANTES: tres códigos reconocidos y TODO lo demás colapsado en «No fue posible
 * aplicar la transición comercial». Se demostraron dos condiciones alcanzables
 * que caían ahí —una fecha de fin que ya pasó, y una transición ya programada—
 * y en las dos la persona veía la misma frase, que no dice qué hacer.
 *
 * El genérico se queda SOLO para lo que de verdad no se conoce, y con el código
 * del proveedor delante para que quien lo reciba pueda buscarlo. Nunca el
 * mensaje crudo entero: puede traer detalles de la fila.
 */
const MENSAJES: ReadonlyArray<readonly [string, string]> = [
  ["ASSIGNMENT_PERIOD_INVALID",
   "La fecha de fin tiene que ser posterior al inicio. Elige un día futuro: "
   + "la transición empieza en el momento de aplicarla."],
  ["ASSIGNMENT_CONFLICTS_WITH_FUTURE",
   "Esta empresa ya tiene una transición comercial programada en ese alcance. "
   + "Ciérrala antes de abrir otra."],
  ["ASSIGNMENT_REASON_REQUIRED",
   "Escribe por qué se hace el cambio (al menos diez caracteres)."],
  ["ASSIGNMENT_SCOPE_INVALID", "El alcance de la asignación no es válido."],
  ["ASSIGNMENT_MODULE_REQUIRED",
   "Con alcance de módulo hay que decir a qué módulo se aplica."],
  ["MODULE_NOT_COMMERCIAL",
   "Ese módulo no es comercial: solo los módulos funcionales reciben plan."],
  ["MODULE_NOT_FOUND", "Ese módulo no existe en el catálogo."],
  ["PLAN_REVISION_NOT_PUBLISHED",
   "Solo se asignan revisiones publicadas: un borrador no se le vende a nadie."],
  ["PLAN_REVISION_NOT_FOUND", "Esa revisión de plan ya no existe."],
  ["NOT_AUTHORIZED", SOLO_ADMINISTRACION],
  ["AUTH_REQUIRED", SOLO_ADMINISTRACION],
];

export function mensajeDeTransicion(mensajeDelProveedor: string): string {
  for (const [codigo, texto] of MENSAJES) {
    if (mensajeDelProveedor.includes(codigo)) return texto;
  }
  return "No fue posible aplicar la transición comercial. "
    + "Comparte este código con el equipo técnico: "
    + (mensajeDelProveedor.slice(0, 80) || "sin detalle");
}
