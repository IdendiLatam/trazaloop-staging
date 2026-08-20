"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  SISTEMA_GROUP,
  PLATFORM_GROUP,
  SHELL_MODULE_PARAM,
  moduleAwareHref,
  resolveShellModuleForPath,
  isShellNavLinkActive,
  type ModuleNavLink,
  type ModuleNavGroup,
  type ShellModuleKey,
} from "@/lib/modules/registry";

/**
 * Navegación del shell autenticado. Sprint 9.2 introdujo los grupos
 * plegables; Sprint T9E la vuelve CONTEXTUAL AL MÓDULO: la definición de
 * menús vive en lib/modules/registry.ts (un solo registro por módulo) y
 * este componente resuelve el módulo activo por la ruta actual — dentro de
 * /textiles se muestra la navegación Textil, en el resto la de CPR. Los
 * grupos transversales (Sistema, Plataforma) son comunes a los módulos.
 *
 * "Plataforma" NUNCA aparece de forma estática — se agrega en tiempo de
 * render solo si `showPlatform` es true (is_platform_staff() del usuario
 * actual), calculado en el layout del shell. No es un rol de empresa: no
 * depende de memberships ni de la organización activa.
 */

// Compatibilidad: estos grupos históricos se re-exportan desde el registro
// central (tests/unit/platform.test.ts y cualquier consumidor existente).
export {
  NAV_TOP_LEVEL,
  TRAZABILIDAD_GROUP,
  TRAZADOCS_GROUP,
  SISTEMA_GROUP,
  PLATFORM_GROUP,
} from "@/lib/modules/registry";

function NavItem({
  item,
  active,
  moduleKey,
}: {
  item: ModuleNavLink;
  active: boolean;
  moduleKey: ShellModuleKey;
}) {
  return (
    <Link
      // Los enlaces transversales llevan el módulo desde el que se navega, para
      // que ir a "Equipo" desde Quality no devuelva a la persona al shell de
      // CPR. Los enlaces propios del módulo se dejan intactos.
      href={moduleAwareHref(item.href, moduleKey)}
      aria-current={active ? "page" : undefined}
      className={`block rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-white/15 text-white" : "text-white hover:bg-white/10"
      }`}
    >
      {item.label}
    </Link>
  );
}

function NavGroupSection({
  group,
  pathname,
  moduleKey,
}: {
  group: ModuleNavGroup;
  pathname: string;
  moduleKey: ShellModuleKey;
}) {
  return (
    <details open className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-100/70 hover:bg-white/5">
        {group.title}
        <span className="text-emerald-100/40 transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="mt-0.5 space-y-0.5">
        {group.items.map((item) => (
          <NavItem
            key={item.label}
            item={item}
            active={isShellNavLinkActive(item, pathname)}
            moduleKey={moduleKey}
          />
        ))}
      </div>
    </details>
  );
}

export function AppNav({ showPlatform = false }: { showPlatform?: boolean } = {}) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const activeModule = resolveShellModuleForPath(pathname, searchParams?.get(SHELL_MODULE_PARAM));

  return (
    <nav aria-label="Navegación principal" className="space-y-3">
      <div className="space-y-1">
        <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-100/50">
          {activeModule.name}
        </p>
        <div className="space-y-0.5">
          {activeModule.topLevel.map((item) => (
            <NavItem
              key={item.label}
              item={item}
              active={isShellNavLinkActive(item, pathname)}
              moduleKey={activeModule.key}
            />
          ))}
        </div>
      </div>
      {activeModule.groups.map((group) => (
        <NavGroupSection
          key={group.title}
          group={group}
          pathname={pathname}
          moduleKey={activeModule.key}
        />
      ))}
      <NavGroupSection group={SISTEMA_GROUP} pathname={pathname} moduleKey={activeModule.key} />
      {showPlatform ? (
        <NavGroupSection group={PLATFORM_GROUP} pathname={pathname} moduleKey={activeModule.key} />
      ) : null}
      {/* Volver al inicio del módulo activo: desde una pantalla transversal es
          la salida natural, y sin ella la única vuelta era el selector. */}
      {activeModule.key !== "cpr" &&
      resolveShellModuleForPath(pathname).key === "cpr" ? (
        <Link
          href={activeModule.homePath}
          className="block rounded-md px-3 py-2 text-xs font-medium text-emerald-100/70 hover:bg-white/10 hover:text-white"
        >
          ← Volver a {activeModule.name}
        </Link>
      ) : null}
      <Link
        href="/modules"
        className="block rounded-md px-3 py-2 text-xs font-medium text-emerald-100/70 hover:bg-white/10 hover:text-white"
      >
        ⇄ Cambiar de módulo
      </Link>
    </nav>
  );
}
