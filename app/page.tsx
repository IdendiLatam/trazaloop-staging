// Portal público (Sprint 10D, Parte 2): accesible SIN login. Lee la
// sesión de forma NO bloqueante (igual que /accept-invite) — nunca
// redirige por falta de sesión, solo cambia el destino del botón
// "Entrar" de Trazaloop CPR.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { Wordmark } from "@/components/layout/logo";

const COMING_SOON_MESSAGE = "Este módulo estará disponible próximamente.";

export default async function PublicLandingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const cprHref = user ? "/modules" : "/login";

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Wordmark />
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/login" className="text-ink-soft hover:text-loop hover:underline">
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-loop px-4 py-2 font-semibold text-white hover:bg-loop-deep"
          >
            Crear cuenta Demo
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 pb-20 pt-10">
        <section className="space-y-4">
          <span className="inline-flex rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-xs font-medium text-amber">
            Beta / lanzamiento controlado
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-ink">
            Trazaloop CPR
          </h1>
          <p className="max-w-2xl text-lg text-ink-soft">
            Plataforma para gestionar trazabilidad, documentación técnica, evidencias y cálculo de
            contenido reciclado en procesos asociados a NTC 6632 y UNE-EN 15343.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href={cprHref}
              className="rounded-md bg-loop px-5 py-2.5 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="rounded-md border border-hairline bg-surface px-5 py-2.5 text-sm font-medium hover:border-loop"
            >
              Crear cuenta Demo
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border border-loop/30 bg-loop/5 p-5">
            <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
              Disponible
            </span>
            <span className="text-lg font-semibold">Trazaloop CPR</span>
            <span className="text-sm text-ink-soft">
              Trazabilidad, contenido reciclado, evidencias, TrazaDocs, maestro documental y
              soporte técnico.
            </span>
            <Link href={cprHref} className="mt-2 text-sm font-medium text-loop hover:underline">
              Entrar →
            </Link>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-paper p-5 opacity-70">
            <span className="inline-flex w-fit rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft">
              Próximamente
            </span>
            <span className="text-lg font-semibold">Trazaloop Textil</span>
            <span className="text-sm text-ink-soft">{COMING_SOON_MESSAGE}</span>
            <button
              type="button"
              disabled
              className="mt-2 w-fit cursor-not-allowed rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-soft"
            >
              Próximamente
            </button>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-paper p-5 opacity-70">
            <span className="inline-flex w-fit rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft">
              Próximamente
            </span>
            <span className="text-lg font-semibold">Trazaloop Quality</span>
            <span className="text-sm text-ink-soft">Gestión de calidad e ISO 9001. {COMING_SOON_MESSAGE}</span>
            <button
              type="button"
              disabled
              className="mt-2 w-fit cursor-not-allowed rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-soft"
            >
              Próximamente
            </button>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-paper p-5 opacity-70">
            <span className="inline-flex w-fit rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft">
              Próximamente
            </span>
            <span className="text-lg font-semibold">Trazaloop Construcción</span>
            <span className="text-sm text-ink-soft">{COMING_SOON_MESSAGE}</span>
            <button
              type="button"
              disabled
              className="mt-2 w-fit cursor-not-allowed rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-soft"
            >
              Próximamente
            </button>
          </div>
        </section>

        <p className="max-w-2xl text-xs text-ink-soft">
          Una sola cuenta de Trazaloop da acceso a todos los módulos disponibles — nunca hay
          logins separados por módulo.
        </p>
      </main>

      <footer className="mx-auto max-w-5xl border-t border-hairline px-6 py-6 text-xs text-ink-soft">
        <p>
          <Link href="/legal" className="text-loop hover:underline">
            Acerca de Trazaloop
          </Link>
          {" · "}
          <Link href="/terms" className="text-loop hover:underline">
            Términos de uso
          </Link>
          {" · "}
          <Link href="/privacy" className="text-loop hover:underline">
            Política de privacidad
          </Link>
        </p>
      </footer>
    </div>
  );
}
