import Link from "next/link";

/**
 * Navegación. Sprint 9.2 (Parte 1): el menú lateral ya tenía demasiadas
 * opciones sueltas — se reorganiza en grupos plegables (elemento nativo
 * <details>, sin JS de cliente) para que siga siendo fácil de escanear.
 * Ninguna ruta cambia, solo su agrupación visual.
 *
 * "Plataforma" NUNCA aparece de forma estática — se agrega en tiempo de
 * render solo si `showPlatform` es true (is_platform_staff() del usuario
 * actual), calculado en el layout del shell. No es un rol de empresa: no
 * depende de memberships ni de la organización activa. La administración
 * global de estructuras/hints de TrazaDocs vive SOLO en este grupo
 * Plataforma — nunca mezclada como opción empresarial del grupo TrazaDocs.
 */
type NavLink = { label: string; href: string };
type NavGroup = { title: string; items: NavLink[] };

export const NAV_TOP_LEVEL: NavLink[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Flujo guiado", href: "/guided-flow" },
];

export const TRAZABILIDAD_GROUP: NavGroup = {
  title: "Trazabilidad",
  items: [
    { label: "Diagnóstico", href: "/diagnostic" },
    { label: "Catálogos", href: "/catalog" },
    { label: "Evidencias", href: "/evidences" },
    { label: "Trazabilidad", href: "/traceability" },
    { label: "Contenido reciclado", href: "/recycled-content" },
    { label: "Soporte técnico", href: "/audit-support" },
    { label: "Implementación", href: "/implementation" },
    { label: "Importaciones", href: "/imports" },
  ],
};

export const TRAZADOCS_GROUP: NavGroup = {
  title: "TrazaDocs",
  items: [
    { label: "Documentos", href: "/trazadocs" },
    { label: "Nuevo documento", href: "/trazadocs/new" },
  ],
};

export const SISTEMA_GROUP: NavGroup = {
  title: "Sistema",
  items: [
    { label: "Equipo", href: "/team" },
    { label: "Datos de empresa", href: "/settings/company" },
    { label: "Mi perfil", href: "/settings/profile" },
  ],
};

export const PLATFORM_GROUP: NavGroup = {
  title: "Plataforma",
  items: [
    { label: "Administración de plataforma", href: "/platform" },
    { label: "Nueva empresa", href: "/platform/organizations/new" },
    { label: "Estructuras TrazaDocs", href: "/platform/trazadocs" },
  ],
};

function NavItem({ item }: { item: NavLink }) {
  return (
    <Link
      href={item.href}
      className="block rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
    >
      {item.label}
    </Link>
  );
}

function NavGroupSection({ group }: { group: NavGroup }) {
  return (
    <details open className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-100/70 hover:bg-white/5">
        {group.title}
        <span className="text-emerald-100/40 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="mt-0.5 space-y-0.5">
        {group.items.map((item) => (
          <NavItem key={item.label} item={item} />
        ))}
      </div>
    </details>
  );
}

export function AppNav({ showPlatform = false }: { showPlatform?: boolean } = {}) {
  return (
    <nav aria-label="Navegación principal" className="space-y-3">
      <div className="space-y-0.5">
        {NAV_TOP_LEVEL.map((item) => (
          <NavItem key={item.label} item={item} />
        ))}
      </div>
      <NavGroupSection group={TRAZABILIDAD_GROUP} />
      <NavGroupSection group={TRAZADOCS_GROUP} />
      <NavGroupSection group={SISTEMA_GROUP} />
      {showPlatform ? <NavGroupSection group={PLATFORM_GROUP} /> : null}
    </nav>
  );
}
