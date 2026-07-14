import Link from "next/link";

/**
 * Navegación. Sprint 5A habilita Soporte técnico (dossiers imprimibles,
 * matriz de evidencias y brechas).
 */
const ITEMS: { label: string; href: string | null }[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Flujo guiado", href: "/guided-flow" },
  { label: "Diagnóstico", href: "/diagnostic" },
  { label: "Catálogos", href: "/catalog" },
  { label: "Evidencias", href: "/evidences" },
  { label: "Trazabilidad", href: "/traceability" },
  { label: "Contenido reciclado", href: "/recycled-content" },
  { label: "Soporte técnico", href: "/audit-support" },
  { label: "Implementación", href: "/implementation" },
  { label: "Importaciones", href: "/imports" },
  { label: "Equipo", href: "/team" },
];

export function AppNav() {
  return (
    <nav aria-label="Navegación principal" className="space-y-1">
      {ITEMS.map((item) =>
        item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            {item.label}
          </Link>
        ) : (
          <span
            key={item.label}
            className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-emerald-100/50"
            title="Disponible en un sprint posterior"
          >
            {item.label}
            <span className="text-[10px] uppercase tracking-wider">pronto</span>
          </span>
        )
      )}
    </nav>
  );
}
