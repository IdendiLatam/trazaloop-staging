// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
//
// BLOQUEANTE 1 (corrección post Sprint 8.4): esta consola vive a
// propósito FUERA de app/(app)/(shell) — ese shell exige empresa activa
// (getActiveOrganization + redirect a /select-org si no hay), y un
// superadministrador de plataforma administra LA PLATAFORMA, no una
// empresa específica: puede no tener ninguna empresa y aun así debe poder
// entrar aquí. Este layout exige SOLO sesión + platform_staff activo
// (requirePlatformStaff) — nunca getActiveOrganization(), nunca redirige
// a /select-org por falta de organización activa.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { requireLegalAcceptance } from "@/lib/auth/require-legal-acceptance";
import { signOutAction } from "@/server/actions/auth";
import { Wordmark } from "@/components/layout/logo";

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { isSuperadmin } = await requirePlatformStaff();
  // Sprint 10D (Parte 5): platform_staff TAMBIÉN debe aceptar términos/
  // política antes de entrar a la consola — sin excepción por rol.
  await requireLegalAcceptance();

  return (
    <div className="grid min-h-screen lg:grid-cols-[220px_1fr]">
      <aside className="no-print hidden flex-col gap-8 bg-loop-deep p-5 lg:flex">
        <Wordmark inverted />
        <nav aria-label="Navegación de plataforma" className="space-y-1">
          <Link
            href="/platform"
            className="block rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            Plataforma
          </Link>
          {isSuperadmin ? (
            <Link
              href="/platform/organizations/new"
              className="block rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Nueva empresa
            </Link>
          ) : null}
          <Link
            href="/platform/trazadocs"
            className="block rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            Estructuras TrazaDocs
          </Link>
          <Link
            href="/select-org"
            className="block rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            Seleccionar empresa
          </Link>
          <Link
            href="/settings/profile"
            className="block rounded-md px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            Mi perfil
          </Link>
        </nav>
        <div className="mt-auto space-y-3">
          <p className="text-xs text-emerald-100/60">Consola interna de plataforma</p>
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
        <header className="no-print flex items-center justify-between border-b border-hairline bg-surface px-6 py-3">
          <span className="rounded-full border border-loop/30 bg-loop/5 px-3 py-1.5 text-sm font-semibold text-loop-deep">
            Consola de plataforma
          </span>
          <Link href="/select-org" className="text-sm text-ink-soft hover:text-loop hover:underline">
            Ir a mi empresa
          </Link>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
