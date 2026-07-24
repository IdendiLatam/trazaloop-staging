/**
 * Trazaloop · Versión visible de la app.
 * Fuente única: package.json (v1.0.0 = primera versión oficial).
 *
 * La etiqueta visible es DISCRETA y se muestra solo en pies de página
 * (shell autenticado, /legal y el riel de autenticación) — nunca como
 * mensaje promocional ni como aviso de versión no oficial.
 */
import pkg from "../package.json";

export const APP_VERSION = pkg.version as string;

/** major.minor derivado de la versión canónica (1.0.0 → "1.0"). */
export const APP_VERSION_SHORT = APP_VERSION.split(".").slice(0, 2).join(".");

export const APP_VERSION_LABEL = `Trazaloop v${APP_VERSION_SHORT}`;
