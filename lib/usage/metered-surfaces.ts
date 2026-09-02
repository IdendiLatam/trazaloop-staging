/**
 * Trazaloop · PE-04B4 · Qué superficies cuentan tiempo comercial.
 *
 * LA FRONTERA NO ES UNA LISTA DE RUTAS, ES EL SHELL.
 *
 * Se pensó en clasificar las 150 rutas una a una, como el registro de claves de
 * pantalla de PE-03. Habría sido una lista que se queda vieja en cuanto alguien
 * añade una pantalla. La arquitectura ya dice lo que hace falta: dentro de
 * `app/(app)/(shell)` está el producto de trabajo de la empresa —Calidad, PCR,
 * Textiles, TrazaDocs, equipo, datos de empresa, exportaciones—, y fuera están
 * la puerta, el perfil, la consola de plataforma, la ayuda y lo legal.
 *
 * Así que el reloj vive en el shell y solo hace falta declarar las EXCEPCIONES:
 * lo que está dentro del shell y aun así no debe cobrarse.
 */

/** Prefijos DENTRO del shell que NO se cobran, con el motivo. */
export const UNMETERED_SHELL_PREFIXES: readonly { prefix: string; reason: string }[] = [
  {
    prefix: "/support",
    reason:
      "Escribir a soporte no es trabajo del sistema de gestión: es pedir ayuda. "
      + "Cobrar el tiempo de pedir ayuda —y peor aún, bloquearlo en modo consulta— "
      + "dejaría sin salida justo a quien necesita una.",
  },
];

/** Fuera del shell y por tanto nunca medido; se enumera para poder explicarlo. */
export const UNMETERED_OUTSIDE_SHELL: readonly { prefix: string; reason: string }[] = [
  { prefix: "/login", reason: "Autenticarse no es usar el producto." },
  { prefix: "/register", reason: "Idem." },
  { prefix: "/forgot-password", reason: "Recuperación de acceso: esencial, jamás medida." },
  { prefix: "/reset-password", reason: "Idem." },
  { prefix: "/accept-invite", reason: "Entrar a una empresa no es trabajar en ella." },
  { prefix: "/select-org", reason: "Elegir empresa es navegación previa al trabajo." },
  { prefix: "/modules", reason: "La puerta: dice qué tiene contratado la empresa. Cobrar por leer lo que se ha contratado sería absurdo." },
  { prefix: "/settings/profile", reason: "Datos y seguridad de la propia persona: operación esencial de cuenta." },
  { prefix: "/platform", reason: "Consola de plataforma: no es uso de cliente." },
  { prefix: "/faq", reason: "Autoservicio. Nunca se cobra ni se bloquea." },
  { prefix: "/legal", reason: "Términos y privacidad. Nunca se cobra ni se bloquea." },
  { prefix: "/help", reason: "Ayuda contextual. Nunca se cobra ni se bloquea." },
];

/**
 * ¿Esta ruta DEL SHELL cuenta tiempo? Se llama solo desde dentro del shell, que
 * es lo que ya responde «esto es superficie funcional».
 */
export function isMeteredShellPath(pathname: string): boolean {
  return !UNMETERED_SHELL_PREFIXES.some(
    (e) => pathname === e.prefix || pathname.startsWith(`${e.prefix}/`)
  );
}

/** La cadencia del latido y la vida de la concesión, espejo de la base (0165).
 *  Si divergen, manda la base: el cliente solo dice «sigo abierto». */
export const HEARTBEAT_SECONDS = 30;
export const LEASE_SECONDS = 90;
