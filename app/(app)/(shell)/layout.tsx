// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { APP_VERSION_LABEL } from "@/lib/version";
import { isStagingEnvironment } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { requireLegalAcceptance } from "@/lib/auth/require-legal-acceptance";
import { getActiveOrganization } from "@/lib/db/organizations";
import { checkPlatformStatus } from "@/lib/db/platform";
import { getDemoTrialSummary } from "@/lib/db/module-access";
import { DemoTrialBanner } from "@/components/domain/modules/demo-trial-banner";
import { signOutAction } from "@/server/actions/auth";
import { AppNav } from "@/components/layout/nav";
import { ModuleHeaderBadge } from "@/components/layout/module-badge";
import { Wordmark, LoopMark } from "@/components/layout/logo";
import Link from "next/link";

/**
 * Shell autenticado: exige sesión y EMPRESA ACTIVA VALIDADA en servidor.
 * Sin empresa activa válida → /select-org. La empresa activa se muestra de
 * forma muy visible (barra superior) para el caso consultor multiempresa.
 *
 * Sprint T9E: la navegación lateral y el badge del encabezado son
 * CONTEXTUALES AL MÓDULO (lib/modules/registry.ts): dentro de /textiles se
 * muestra el menú y la identidad de Trazaloop Textiles; en el resto, los de
 * Trazaloop CPR. En móvil, el menú contextual se abre desde el encabezado.
 */
export default async function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireSession();
  await requireLegalAcceptance();
  const [activeOrg, platformStatus] = await Promise.all([
    getActiveOrganization(),
    checkPlatformStatus(),
  ]);

  if (!activeOrg) {
    redirect("/select-org");
  }

  // T9F: aviso del Demo temporal (48 h) — compartido en todo el shell.
  const demoTrials = await getDemoTrialSummary(activeOrg.organizationId);

  return (
    <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
      <aside className="no-print hidden flex-col gap-8 bg-loop-deep p-5 lg:flex">
        <Wordmark inverted />
        <AppNav showPlatform={platformStatus.isStaff} />
        <div className="mt-auto space-y-3">
          <div className="text-xs text-emerald-100/60">
            <p>{APP_VERSION_LABEL}</p>
            <Link href="/legal" className="hover:text-white hover:underline">
              Acerca de Trazaloop
            </Link>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-sm text-emerald-100/70 hover:text-white hover:underline"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        {/* Barra superior: empresa activa siempre visible */}
        <header className="no-print relative flex items-center justify-between border-b border-hairline bg-surface px-6 py-3">
          {isStagingEnvironment() ? (
            <span className="rounded-full border border-amber/40 bg-amber/10 px-2.5 py-0.5 text-xs font-medium text-amber">
              Ambiente staging
            </span>
          ) : null}
          <details className="group lg:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <LoopMark className="h-5 w-5 text-loop" />
              <span className="text-sm font-medium text-ink-soft">Menú</span>
            </summary>
            <div className="absolute left-0 top-full z-20 max-h-[80vh] w-72 overflow-y-auto rounded-b-lg bg-loop-deep p-4 shadow-lg">
              <AppNav showPlatform={platformStatus.isStaff} />
            </div>
          </details>
          <Link
            href="/select-org"
            title="Cambiar de empresa"
            className="inline-flex items-center gap-2 rounded-full border border-loop/30 bg-loop/5 px-3 py-1.5 text-sm font-semibold text-loop-deep hover:border-loop"
          >
            <span
              className="h-2 w-2 rounded-full bg-loop"
              aria-hidden="true"
            />
            {activeOrg.organizationName}
            <span className="text-xs font-normal text-ink-soft">cambiar</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/settings/company"
              className="text-sm text-ink-soft hover:text-loop hover:underline"
            >
              Configuración
            </Link>
            <ModuleHeaderBadge />
          </div>
        </header>

        <main className="flex-1 space-y-4 p-6">
          <DemoTrialBanner trials={demoTrials.activeTrials} hasExpired={demoTrials.hasExpired} />
          {children}
        </main>
      </div>
    </div>
  );
}
