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

/**
 * Claves de los módulos que tienen shell propio, como DATO y no solo como
 * tipo. QUALITY-01.2: tenerlas en tiempo de ejecución permite que una prueba
 * exija que el registro y el catálogo comercial no se separen, en vez de
 * confiar en que alguien se acuerde de tocar los dos.
 */
export const SHELL_MODULE_KEYS = ["cpr", "textiles", "quality"] as const;

export type ShellModuleKey = (typeof SHELL_MODULE_KEYS)[number];

export type ShellModuleDefinition = {
  key: ShellModuleKey;
  /** Nombre comercial del módulo (tarjetas, sidebar, títulos). */
  name: string;
  /** Identidad visible en el encabezado del shell. CPR muestra sus normas;
   * Textiles muestra su propio nombre — jamás normas de otro módulo. */
  headerBadge: string;
  /** Ruta de inicio del módulo dentro del shell. */
  homePath: string;
  /**
   * Ruta de un DOCUMENTO de TrazaDocs que pertenece a este módulo.
   *
   * TrazaDocs es un motor transversal: el mismo documento puede haber nacido
   * en PCR, en Textiles o en Quality, y cada módulo lo muestra en su propia
   * pantalla. Antes de QUALITY-01.2 la ficha de un proceso enlazaba SIEMPRE a
   * `/trazadocs/<id>` —la ruta de PCR—, así que una empresa que solo tuviera
   * Quality pulsaba el documento que acababa de asociar y se topaba con el
   * guard de otro módulo. La ruta pertenece a la identidad del módulo; vive
   * aquí para que enlazar un documento no obligue a saber de qué módulo es.
   */
  documentPath: (documentId: string) => string;
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

/**
 * Grupo TRANSVERSAL: pantallas que no pertenecen a ningún módulo y que
 * cualquier empresa puede usar, tenga contratado lo que tenga.
 *
 * QUALITY-01.1 sacó "Onboarding" de aquí. Vive bajo el grupo de rutas (cpr) y
 * está protegido por `requireCprModule()`, así que para una empresa que solo
 * tuviera Quality era un enlace que devolvía al selector de módulos. No era
 * transversal: era de CPR colocado en un menú transversal.
 */
export const SISTEMA_GROUP: ModuleNavGroup = {
  title: "Sistema",
  items: [
    { label: "Equipo", href: "/team" },
    { label: "Datos de empresa", href: "/settings/company" },
    { label: "Mi perfil", href: "/settings/profile" },
    { label: "Centro de soporte", href: "/support" },
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
  // Onboarding es de CPR (vive bajo (cpr) y lo protege requireCprModule):
  // pertenece a su navegación, no al grupo transversal Sistema.
  { label: "Onboarding", href: "/onboarding" },
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

/**
 * RH-01.5 · Preparación de auditoría (PCR-03: ejercicios de trazabilidad y
 * expedientes). Las rutas ya existían bajo el route group (cpr) y se
 * enlazaban solo desde /traceability; aquí quedan integradas al registro
 * central para que el shell las reconozca como parte del módulo PCR y sean
 * descubribles desde el menú. No es un módulo comercial nuevo ni una
 * capacidad nueva: los guards de acceso son los mismos del módulo PCR.
 */
export const AUDIT_PREP_GROUP: ModuleNavGroup = {
  title: "Preparación de auditoría",
  items: [
    { label: "Ejercicios de trazabilidad", href: "/audit-prep/exercises" },
    { label: "Expedientes", href: "/audit-prep/dossiers" },
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
  name: "Trazaloop PCR",
  headerBadge: "NTC 6632 · UNE-EN 15343",
  homePath: "/dashboard",
  documentPath: (id) => `/trazadocs/${id}`,
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
    // RH-01.5: preparación de auditoría (PCR-03) pertenece al módulo PCR.
    "/audit-prep",
    "/implementation",
    "/imports",
    "/trazadocs",
  ],
  topLevel: NAV_TOP_LEVEL,
  groups: [TRAZABILIDAD_GROUP, AUDIT_PREP_GROUP, TRAZADOCS_GROUP],
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
  documentPath: (id) => `/textiles/trazadocs/${id}`,
  pathPrefixes: ["/textiles"],
  topLevel: [{ label: "Inicio Textiles", href: "/textiles", exact: true }],
  groups: [TEXTILES_GESTION_GROUP, TEXTILES_DOCUMENTACION_GROUP],
};

// ---------------------------------------------------------------------------
// Trazaloop Quality (module_code "quality") · QUALITY-01
// ---------------------------------------------------------------------------

export const QUALITY_SGC_GROUP: ModuleNavGroup = {
  title: "Sistema de gestión",
  items: [
    { label: "Cargos", href: "/quality/positions" },
    { label: "Procesos", href: "/quality/processes" },
    { label: "Mapa de procesos", href: "/quality/map" },
  ],
};

/**
 * Desempeño. Grupo propio, no un apéndice del sistema de gestión: objetivos e
 * indicadores son la pata que responde «¿esto funciona?», y meterlos junto a
 * los procesos los convertiría en una pantalla más de configuración.
 *
 * QUALITY-03 · Objetivo e Indicador son entradas SEPARADAS a propósito. Un
 * indicador puede existir sin objetivo (mide un proceso, o la empresa), y un
 * objetivo se mide con varios indicadores: esconder los indicadores dentro de
 * los objetivos haría invisible la mitad de los casos.
 */
export const QUALITY_DESEMPENO_GROUP: ModuleNavGroup = {
  title: "Desempeño",
  items: [
    { label: "Objetivos", href: "/quality/objectives" },
    { label: "Indicadores", href: "/quality/indicators" },
  ],
};

/**
 * Documentos de Quality. Grupo propio, no un enlace suelto: el espacio
 * documental es una de las dos patas del módulo, no un accesorio de Procesos.
 *
 * QUALITY-02 · La Lista Maestra entra aquí como destino de primer nivel. Es el
 * documento que una auditoría pide primero, y esconderla dentro de la lista de
 * documentos la convertía en una función que había que descubrir.
 */
export const QUALITY_DOCUMENTOS_GROUP: ModuleNavGroup = {
  title: "Documentación",
  items: [
    { label: "Documentos", href: "/quality/documents", exact: true },
    { label: "Lista Maestra", href: "/quality/documents/master" },
  ],
};

export const QUALITY_SHELL_MODULE: ShellModuleDefinition = {
  key: "quality",
  name: "Trazaloop Quality",
  headerBadge: "Trazaloop Quality",
  homePath: "/quality",
  documentPath: (id) => `/quality/documents/${id}`,
  pathPrefixes: ["/quality"],
  topLevel: [
    { label: "Inicio Quality", href: "/quality", exact: true },
    // QUALITY-02 · La bandeja va en el nivel superior a propósito: es lo
    // primero que abre quien entra a trabajar, no una sección de consulta.
    { label: "Mis tareas", href: "/quality/tasks" },
  ],
  groups: [QUALITY_SGC_GROUP, QUALITY_DESEMPENO_GROUP, QUALITY_DOCUMENTOS_GROUP],
};

// ---------------------------------------------------------------------------
// Resolución del módulo activo
// ---------------------------------------------------------------------------

/** Registro completo. CPR va último a propósito: es el módulo por defecto. */
export const SHELL_MODULES: readonly ShellModuleDefinition[] = [
  TEXTILES_SHELL_MODULE,
  QUALITY_SHELL_MODULE,
  CPR_SHELL_MODULE,
];

/**
 * Nombre del parámetro que transporta el módulo activo a través de las rutas
 * TRANSVERSALES (equipo, configuración, soporte), que no pertenecen a ningún
 * módulo.
 *
 * Sin él, salir de Quality a "Equipo" dejaba al usuario dentro del shell de
 * CPR —menú, identidad y todo— porque `/team` no lo reclama nadie y CPR es el
 * módulo por defecto. La persona entraba a Quality y acababa en PCR sin haber
 * pedido cambiar de módulo. Es un parámetro de PRESENTACIÓN: no concede acceso
 * a nada, y la ruta siempre manda sobre él.
 */
export const SHELL_MODULE_PARAM = "m";

export function isShellModuleKey(value: string | null | undefined): value is ShellModuleKey {
  return SHELL_MODULES.some((m) => m.key === value);
}

/**
 * Módulo activo del shell.
 *
 * 1. Si la ruta pertenece a un módulo, gana la RUTA. Coincidencia por prefijo
 *    estricta ("/textiles" o "/textiles/..."), nunca por subcadena. Esto es lo
 *    que impide que `?m=quality` secuestre una pantalla de otro módulo.
 * 2. Las rutas propias de CPR también ganan sobre el parámetro. CPR es el
 *    módulo por defecto, pero eso no significa que sus pantallas sean
 *    transversales: `/dashboard?m=quality` es una pantalla de PCR y debe
 *    mostrarse como tal.
 * 3. Si la ruta es transversal y se recuerda un módulo, se conserva ese.
 * 4. Si no, CPR.
 */
function claimsPath(mod: ShellModuleDefinition, p: string): boolean {
  return mod.pathPrefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export function resolveShellModuleForPath(
  pathname: string | null | undefined,
  moduleParam?: string | null
): ShellModuleDefinition {
  const p = pathname ?? "";
  for (const mod of SHELL_MODULES) {
    if (mod.key === CPR_SHELL_MODULE.key) continue;
    if (claimsPath(mod, p)) return mod;
  }
  if (claimsPath(CPR_SHELL_MODULE, p)) return CPR_SHELL_MODULE;
  if (isShellModuleKey(moduleParam)) {
    return SHELL_MODULES.find((m) => m.key === moduleParam) ?? CPR_SHELL_MODULE;
  }
  return CPR_SHELL_MODULE;
}

/**
 * Decora un enlace TRANSVERSAL con el módulo desde el que se navega, para que
 * el shell no cambie de identidad al pulsarlo.
 *
 * CPR no necesita marca: es el destino por defecto, así que sus URLs quedan
 * limpias y el comportamiento anterior se conserva intacto. Un enlace que ya
 * pertenece a un módulo tampoco se toca — su propia ruta ya lo dice.
 */
export function moduleAwareHref(href: string, moduleKey: ShellModuleKey): string {
  if (moduleKey === CPR_SHELL_MODULE.key) return href;
  if (resolveShellModuleForPath(href).key !== CPR_SHELL_MODULE.key) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${SHELL_MODULE_PARAM}=${moduleKey}`;
}

/** Definición del módulo por su clave, o `null` si la clave no es de ningún
 *  módulo con shell. */
export function getShellModule(key: string | null | undefined): ShellModuleDefinition | null {
  return SHELL_MODULES.find((m) => m.key === key) ?? null;
}

/**
 * Nombre comercial de un módulo a partir de su clave. Sustituye a los mapas
 * `{ cpr: "PCR", textiles: "Textiles", quality: "Quality" }` que cada pantalla
 * mantenía por su cuenta: tres copias del mismo dato que un módulo nuevo
 * obligaba a perseguir una por una.
 *
 * Si la clave no se reconoce se devuelve tal cual, para que una pantalla nunca
 * quede en blanco por un valor inesperado.
 */
export function shellModuleName(key: string | null | undefined): string {
  return getShellModule(key)?.name ?? (key ?? "—");
}

/**
 * Ruta del documento de TrazaDocs `documentId` en el módulo del que es dueño.
 * Devuelve `null` cuando el módulo no se reconoce: es preferible no ofrecer
 * enlace a ofrecer uno que lleva al guard de otro módulo.
 */
export function trazadocDocumentHref(
  moduleKey: string | null | undefined,
  documentId: string
): string | null {
  return getShellModule(moduleKey)?.documentPath(documentId) ?? null;
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
