// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import { requireCprModule } from "@/lib/auth/require-cpr-module";

/**
 * Trazaloop · Sprint T9F.1 · Frontera estructural CPR para las vistas
 * IMPRIMIBLES (dossier de soporte de auditoría, TrazaDocs CPR y maestro
 * documental). Antes solo exigían requireActiveOrg: una empresa con Demo CPR
 * vencido o con CPR deshabilitado podía seguir abriendo las vistas de
 * impresión del módulo. Con este layout, toda ruta de impresión CPR (actual
 * o futura bajo `(cpr)`) aplica la regla canónica de acceso comercial.
 * Bloqueo → redirect a /modules (mensaje en español, sin 404 ni SQL).
 */
export default async function CprPrintLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireCprModule();
  return <>{children}</>;
}
