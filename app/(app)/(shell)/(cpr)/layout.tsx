// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import { requireCprModule } from "@/lib/auth/require-cpr-module";

/**
 * Trazaloop · Sprint T9F.1 · FRONTERA ESTRUCTURAL del módulo Trazaloop CPR.
 *
 * T9F protegió CPR "por página": solo las páginas de primer nivel llamaban
 * requireCprModule() y cualquier subruta (catálogos internos, TrazaDocs,
 * trazabilidad, importaciones, impresión…) quedaba sin guard. T9F.1 agrupa
 * TODAS las rutas CPR bajo el route group `(cpr)` y este layout aplica la
 * REGLA CANÓNICA (lib/modules/access.ts vía requireCprModule) una sola vez:
 * toda ruta actual o futura creada bajo `(cpr)` queda protegida por defecto.
 *
 * El guard: autentica, resuelve la empresa activa validada en servidor,
 * valida membresía, consulta el acceso comercial CPR (asignación habilitada
 * con access_mode vigente: full/extra, demo permanente o demo no vencido —
 * vencimiento derivado por FECHA del servidor, sin cron ni reloj del
 * navegador) y, ante un bloqueo (Demo vencido, deshabilitado, sin asignación),
 * redirige a /modules, donde el selector comunica el motivo en español
 * ("Prueba finalizada" / "Módulo deshabilitado"). Nunca 404 ni error SQL.
 *
 * Esta frontera NO sustituye la protección de las Server Actions: toda
 * mutación CPR ejecuta además requireCprForAction()/checkCpr* en servidor
 * (server/actions/module-plans.ts). Ambos niveles son obligatorios.
 *
 * Una prueba estructural (tests/unit/t9f1-module-operational-enforcement)
 * verifica que los únicos segmentos del shell FUERA de `(cpr)` sean los
 * explícitamente no-CPR (textiles, settings, support, team).
 */
export default async function CprLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireCprModule();
  return <>{children}</>;
}
