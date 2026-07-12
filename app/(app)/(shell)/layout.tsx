// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { isStagingEnvironment } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { getActiveOrganization } from "@/lib/db/organizations";
import { signOutAction } from "@/server/actions/auth";
import { AppNav } from "@/components/layout/nav";
import { Wordmark, LoopMark } from "@/components/layout/logo";
import Link from "next/link";

/**
 * Shell autenticado: exige sesión y EMPRESA ACTIVA VALIDADA en servidor.
 * Sin empresa activa válida → /select-org. La empresa activa se muestra de
 * forma muy visible (barra superior) para el caso consultor multiempresa.
 */
export default async function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireSession();
  const activeOrg = await getActiveOrganization();

  if (!activeOrg) {
    redirect("/select-org");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
      <aside className="no-print hidden flex-col gap-8 bg-loop-deep p-5 lg:flex">
        <Wordmark inverted />
        <AppNav />
        <div className="mt-auto">
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
        <header className="no-print flex items-center justify-between border-b border-hairline bg-surface px-6 py-3">
          {isStagingEnvironment() ? (
            <span className="rounded-full border border-amber/40 bg-amber/10 px-2.5 py-0.5 text-xs font-medium text-amber">
              Ambiente staging
            </span>
          ) : null}
          <div className="flex items-center gap-3 lg:hidden">
            <LoopMark className="h-5 w-5 text-loop" />
          </div>
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
          <span className="eyebrow hidden sm:block">
            NTC 6632 · UNE-EN 15343
          </span>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
