"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  moduleAwareHref,
  resolveShellModuleForPath,
  SHELL_MODULE_PARAM,
} from "@/lib/modules/registry";

/**
 * Trazaloop · Sprint T9E · Identidad del módulo activo en el encabezado
 * del shell. La metadata vive en lib/modules/registry.ts: CPR muestra sus
 * normas (NTC 6632 · UNE-EN 15343) y Trazaloop Textiles muestra su propio
 * nombre — el branding de un módulo jamás se filtra dentro de otro.
 */
export function ModuleHeaderBadge() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  // En una pantalla transversal (equipo, configuración, soporte) el módulo se
  // conserva: de lo contrario el encabezado anunciaba PCR mientras la persona
  // creía seguir en Quality.
  const activeModule = resolveShellModuleForPath(pathname, searchParams?.get(SHELL_MODULE_PARAM));
  return <span className="eyebrow hidden sm:block">{activeModule.headerBadge}</span>;
}

/**
 * Enlace del encabezado a Configuración que conserva el módulo activo. Es
 * transversal, igual que los del grupo Sistema, y por el mismo motivo no debe
 * devolver a la persona al shell de CPR.
 */
export function ModuleAwareSettingsLink() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const activeModule = resolveShellModuleForPath(pathname, searchParams?.get(SHELL_MODULE_PARAM));
  return (
    <Link
      href={moduleAwareHref("/settings/company", activeModule.key)}
      className="text-sm text-ink-soft hover:text-loop hover:underline"
    >
      Configuración
    </Link>
  );
}
