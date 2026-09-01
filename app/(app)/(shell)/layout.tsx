// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { APP_VERSION_LABEL } from "@/lib/version";
import { environmentBadgeLabel } from "@/lib/env";
import { requireSession } from "@/lib/auth/require-session";
import { requireLegalAcceptance } from "@/lib/auth/require-legal-acceptance";
import { getActiveOrganization } from "@/lib/db/organizations";
import { checkPlatformStatus } from "@/lib/db/platform";
import { signOutAction } from "@/server/actions/auth";
import { AppNav } from "@/components/layout/nav";
import { ModuleHeaderBadge, ModuleAwareSettingsLink, ModuleSwitcher } from "@/components/layout/module-badge";
import { Wordmark, LoopMark } from "@/components/layout/logo";
import { PageTutorialAction } from "@/components/domain/tutorials/page-tutorial-action";
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

  // PE-01B · §14 · El aviso de pruebas SALE del shell compartido.
  //
  // Vivía aquí, así que se leía en todas las pantallas de todos los módulos:
  // alguien trabajando en Quality con acceso completo leía una y otra vez que
  // «algunas pruebas de módulos han finalizado», hablando de una prueba de PCR
  // que no le afectaba. El contenido era correcto —habla de módulos, no de la
  // cuenta— y el sitio no.
  //
  // Ahora vive en la puerta (`/modules`), donde la pregunta «qué tengo» es la
  // pregunta de la pantalla. Dentro de un módulo, el estado de ESE módulo lo
  // comunica su propio guard.

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

      {/*
        min-w-0 · Una celda de rejilla mide por defecto `min-width: auto`, así
        que un hijo ancho —una tabla de dieciséis columnas, por ejemplo— empuja
        la columna `1fr` más allá del ancho de la ventana y arrastra consigo la
        barra superior y el menú. Con min-w-0 la columna respeta su pista y el
        contenido ancho se desplaza DENTRO de su propio contenedor, que es lo
        que ya pedían los envoltorios `overflow-x-auto` de las tablas.
        QUALITY-02 lo encontró con la Lista Maestra; corrige a todo el shell.
      */}
      <div className="flex min-h-screen min-w-0 flex-col">
        {/* Barra superior: empresa activa siempre visible */}
        <header className="no-print relative flex items-center justify-between border-b border-hairline bg-surface px-6 py-3">
          {/* Distintivo de ambiente: null en Production (nunca se muestra),
              «Ambiente staging» en Preview y «Entorno local» en desarrollo.
              Decidido por VERCEL_TARGET_ENV / VERCEL_ENV, jamás por el
              nombre del dominio (lib/env.ts). */}
          {environmentBadgeLabel() ? (
            <span className="rounded-full border border-amber/40 bg-amber/10 px-2.5 py-0.5 text-xs font-medium text-amber">
              {environmentBadgeLabel()}
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
            <span className="text-xs font-normal text-ink-soft">cambiar empresa</span>
          </Link>
          <div className="flex items-center gap-3">
            {/* PE-02B4 · La ayuda, SIEMPRE visible.
                La revisión humana de B3 encontró que al entrar desaparecía: la
                FAQ estaba en la portada pública y en el menú lateral, pero la
                barra superior —donde se mira cuando uno se atasca— no la tenía.
                Va aquí, en todas las pantallas del shell, y se llama «Ayuda» y
                no «FAQ» porque PE-03 sumará el tutorial de la pantalla y el
                soporte al mismo sitio. */}
            {/* PE-03B3 · El tutorial de ESTA pantalla, junto a la ayuda general.
                Aquí y no en las 147 cabeceras de página: no existe ninguna
                compartida, así que ponerlo ahí sería tocar 147 ficheros y que la
                148 naciera sin él. Este sitio ya estaba reservado por escrito
                desde PE-02B4.

                Solo aparece en pantallas registradas: en las demás el
                componente no pinta nada. Y no pregunta por el vídeo hasta que
                alguien lo pulsa. */}
            <PageTutorialAction />
            <Link
              href="/faq"
              className="text-sm font-medium text-ink-soft hover:text-loop hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
            >
              Ayuda
            </Link>
            <ModuleSwitcher />
            <ModuleAwareSettingsLink />
            <ModuleHeaderBadge />
          </div>
        </header>

        <main className="flex-1 space-y-4 p-6">{children}</main>
      </div>
    </div>
  );
}
