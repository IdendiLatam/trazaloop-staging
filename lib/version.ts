/**
 * Trazaloop · Sprint 5E · Versión visible de la app.
 * Fuente única: package.json (0.5.x = fase piloto).
 */
import pkg from "../package.json";

export const APP_VERSION = pkg.version as string;
export const APP_VERSION_LABEL = `Trazaloop v${APP_VERSION} · pilot`;
