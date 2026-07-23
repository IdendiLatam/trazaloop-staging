"use client";

import { usePathname } from "next/navigation";
import { resolveShellModuleForPath } from "@/lib/modules/registry";

/**
 * Trazaloop · Sprint T9E · Identidad del módulo activo en el encabezado
 * del shell. La metadata vive en lib/modules/registry.ts: CPR muestra sus
 * normas (NTC 6632 · UNE-EN 15343) y Trazaloop Textiles muestra su propio
 * nombre — el branding de un módulo jamás se filtra dentro de otro.
 */
export function ModuleHeaderBadge() {
  const pathname = usePathname() ?? "";
  const activeModule = resolveShellModuleForPath(pathname);
  return <span className="eyebrow hidden sm:block">{activeModule.headerBadge}</span>;
}
