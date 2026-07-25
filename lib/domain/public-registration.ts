/**
 * Trazaloop · v1.0.0 · Interpretación PURA del kill switch de registro
 * público.
 *
 * FUENTE ÚNICA de la regla: ningún otro archivo vuelve a interpretar la
 * variable `PUBLIC_REGISTRATION_ENABLED`. Quien necesite el valor efectivo
 * usa `lib/auth/public-registration.ts` (server-only), que delega aquí.
 *
 * Este módulo es PURO a propósito (sin `process.env`, sin BD, sin sesión):
 * así puede probarse por importación directa desde tests/, igual que
 * `lib/modules/textiles.ts` con el kill switch de Textiles.
 *
 * FAIL-CLOSED: solo "true" o "1" habilitan el registro. Cualquier otro
 * valor —incluidos ausencia, cadena vacía, "false", "0", "TRUE", "yes"—
 * lo dejan DESHABILITADO. Nunca al revés.
 */

/** Nombre oficial de la variable. Server-only: JAMÁS lleva prefijo
 *  NEXT_PUBLIC_, porque el navegador no debe conocerla ni decidir con
 *  ella. */
export const PUBLIC_REGISTRATION_FLAG_ENV = "PUBLIC_REGISTRATION_ENABLED";

/**
 * Interpretación pura del flag. Idéntico criterio que
 * `isTextilesFlagEnabled` — una sola convención de kill switch en todo el
 * producto.
 */
export function isPublicRegistrationFlagEnabled(
  raw: string | null | undefined
): boolean {
  return raw === "true" || raw === "1";
}

/**
 * Valores admitidos para el precheck de entorno. Se aceptan las cuatro
 * formas para no obligar al operador a recordar cuál es cuál, pero solo
 * "true" y "1" habilitan (ver arriba).
 */
export const PUBLIC_REGISTRATION_VALID_VALUES: readonly string[] = [
  "true",
  "false",
  "1",
  "0",
];

/** ¿El valor configurado es uno de los admitidos? Un valor fuera de esta
 *  lista casi siempre es un error de configuración: se comporta como
 *  deshabilitado, pero conviene avisarlo. */
export function isPublicRegistrationValueValid(
  raw: string | null | undefined
): boolean {
  return typeof raw === "string" && PUBLIC_REGISTRATION_VALID_VALUES.includes(raw);
}

/**
 * Extrae el token de invitación de un destino `next` de la forma
 * `/accept-invite?token=…`.
 *
 * PURA y SIN autoridad: sirve solo para LOCALIZAR el token. El hecho de
 * que aparezca un token en la URL no autoriza nada — la autorización la
 * da la verificación en servidor contra la base de datos (invitación
 * existente, vigente, pendiente y con el correo coincidente). Ver
 * `lib/auth/public-registration.ts`.
 */
export function extractInvitationToken(
  next: string | null | undefined
): string | null {
  if (!next) return null;
  if (!next.startsWith("/accept-invite")) return null;
  // Protocol-relative (`//host`) nunca es una ruta interna.
  if (next.startsWith("//")) return null;

  const q = next.indexOf("?");
  if (q === -1) return null;

  const token = new URLSearchParams(next.slice(q + 1)).get("token");
  if (!token) return null;

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}
