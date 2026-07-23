/**
 * Trazaloop · Sprint T9E · Registro CENTRAL de módulos del shell.
 *
 * Un solo lugar define, por módulo: identidad visible (nombre y badge del
 * encabezado), ruta de inicio, prefijos de ruta y navegación funcional.
 * El shell autenticado y el sidebar consumen este registro — nunca
 * condiciones dispersas por pathname ni textos duplicados por componente.
 *
 * Lógica PURA (sin BD, sin sesión, sin process.env): usable desde Server
 * Components, Client Components y tests/unit (patrón del proyecto). La
 * disponibilidad real (flag + organization_modules) se resuelve aparte en
 * lib/modules/textiles.ts + lib/auth/require-textiles-module.ts.
 */

export type ModuleNavLink = {
  label: string;
  href: string;
  /** true → solo se marca activa con coincidencia exacta (p. ej. el inicio del módulo). */
  exact?: boolean;
};

export type ModuleNavGroup = { title: string; items: ModuleNavLink[] };

export type ShellModuleKey = "cpr" | "textiles";

export type ShellModuleDefinition = {
  key: ShellModuleKey;
  /** Nombre comercial del módulo (tarjetas, sidebar, títulos). */
  name: string;
  /** Identidad visible en el encabezado del shell. CPR muestra sus normas;
   * Textiles muestra su propio nombre — jamás normas de otro módulo. */
  headerBadge: string;
  /** Ruta de inicio del módulo dentro del shell. */
  homePath: string;
  /** Prefijos de ruta que pertenecen al módulo (módulo activo por ruta). */
  pathPrefixes: string[];
  /** Navegación de nivel superior (sin grupo). */
  topLevel: ModuleNavLink[];
  /** Grupos funcionales propios del módulo. */
  groups: ModuleNavGroup[];
};

// ---------------------------------------------------------------------------
// Grupos transversales (idénticos a los históricos de components/layout/nav)
// ---------------------------------------------------------------------------

export const SISTEMA_GROUP: ModuleNavGroup = {
  title: "Sistema",
  items: [
    { label: "Equipo", href: "/team" },
    { label: "Datos de empresa", href: "/settings/company" },
    { label: "Mi perfil", href: "/settings/profile" },
    { label: "Centro de soporte", href: "/support" },
    { label: "Onboarding", href: "/onboarding" },
  ],
};

export const PLATFORM_GROUP: ModuleNavGroup = {
  title: "Plataforma",
  items: [
    { label: "Administración de plataforma", href: "/platform" },
    { label: "Nueva empresa", href: "/platform/organizations/new" },
    { label: "Estructuras TrazaDocs", href: "/platform/trazadocs" },
    { label: "Tickets de soporte", href: "/platform/support" },
  ],
};

// ---------------------------------------------------------------------------
// Trazaloop CPR (NTC 6632 / UNE-EN 15343)
// ---------------------------------------------------------------------------

export const NAV_TOP_LEVEL: ModuleNavLink[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Flujo guiado", href: "/guided-flow" },
];

export const TRAZABILIDAD_GROUP: ModuleNavGroup = {
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

export const TRAZADOCS_GROUP: ModuleNavGroup = {
  title: "TrazaDocs",
  items: [
    { label: "Documentos", href: "/trazadocs" },
    { label: "Nuevo documento", href: "/trazadocs/new" },
    { label: "Maestro de documentos", href: "/trazadocs/master" },
  ],
};

export const CPR_SHELL_MODULE: ShellModuleDefinition = {
  key: "cpr",
  name: "Trazaloop CPR",
  headerBadge: "NTC 6632 · UNE-EN 15343",
  homePath: "/dashboard",
  // CPR es el módulo por defecto del shell: cualquier ruta no reclamada por
  // otro módulo se atiende con su navegación (dashboard, catálogos CPR,
  // TrazaDocs empresarial, etc.).
  pathPrefixes: [
    "/dashboard",
    "/guided-flow",
    "/diagnostic",
    "/catalog",
    "/evidences",
    "/traceability",
    "/recycled-content",
    "/audit-support",
    "/implementation",
    "/imports",
    "/trazadocs",
  ],
  topLevel: NAV_TOP_LEVEL,
  groups: [TRAZABILIDAD_GROUP, TRAZADOCS_GROUP],
};

// ---------------------------------------------------------------------------
// Trazaloop Textiles (module_code "textiles", DL-01)
// ---------------------------------------------------------------------------

export const TEXTILES_GESTION_GROUP: ModuleNavGroup = {
  title: "Gestión textil",
  items: [
    { label: "Diagnóstico", href: "/textiles/diagnostic" },
    { label: "Catálogos", href: "/textiles/catalogs" },
    { label: "Productos y referencias", href: "/textiles/products" },
    { label: "Evidencias", href: "/textiles/evidences" },
    { label: "Trazabilidad", href: "/textiles/traceability" },
    { label: "Circularidad", href: "/textiles/circularity" },
  ],
};

export const TEXTILES_DOCUMENTACION_GROUP: ModuleNavGroup = {
  title: "Documentación textil",
  items: [
    { label: "TrazaDocs Textil", href: "/textiles/trazadocs" },
    { label: "Pasaportes técnicos", href: "/textiles/passports" },
  ],
};

export const TEXTILES_SHELL_MODULE: ShellModuleDefinition = {
  key: "textiles",
  name: "Trazaloop Textiles",
  headerBadge: "Trazaloop Textiles",
  homePath: "/textiles",
  pathPrefixes: ["/textiles"],
  topLevel: [{ label: "Inicio Textiles", href: "/textiles", exact: true }],
  groups: [TEXTILES_GESTION_GROUP, TEXTILES_DOCUMENTACION_GROUP],
};

// ---------------------------------------------------------------------------
// Resolución del módulo activo
// ---------------------------------------------------------------------------

/** Registro completo. CPR va último a propósito: es el módulo por defecto. */
export const SHELL_MODULES: readonly ShellModuleDefinition[] = [
  TEXTILES_SHELL_MODULE,
  CPR_SHELL_MODULE,
];

/**
 * Módulo activo según la ruta actual. Coincidencia por prefijo estricta
 * ("/textiles" o "/textiles/..."), nunca por subcadena: "/textiles-x"
 * jamás activa Textiles. Sin coincidencia → CPR (módulo por defecto).
 */
export function resolveShellModuleForPath(
  pathname: string | null | undefined
): ShellModuleDefinition {
  const p = pathname ?? "";
  for (const mod of SHELL_MODULES) {
    if (mod.key === CPR_SHELL_MODULE.key) continue;
    if (mod.pathPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) {
      return mod;
    }
  }
  return CPR_SHELL_MODULE;
}

/** ¿El enlace corresponde a la ruta actual? (marca de opción activa) */
export function isShellNavLinkActive(
  link: ModuleNavLink,
  pathname: string | null | undefined
): boolean {
  const p = pathname ?? "";
  if (link.exact) return p === link.href;
  return p === link.href || p.startsWith(`${link.href}/`);
}
