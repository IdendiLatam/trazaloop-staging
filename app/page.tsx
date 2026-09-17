// Portal público (Sprint 10D, Parte 2; hero corregido en Sprint T1):
// accesible SIN login. Lee la sesión de forma NO bloqueante (igual que
// /accept-invite) — nunca redirige por falta de sesión, solo cambia el
// destino del botón "Entrar" a la plataforma.
//
// Sprint T1 (DL-16/DL-17): el hero comunica "Trazaloop" — la PLATAFORMA
// modular — y los módulos se presentan debajo.
//
// PE-02B3 · Carryover-01 de PE-01. Hasta hoy los cuatro módulos se pintaban en
// una rejilla de tarjetas IGUALES, y eso contradecía la jerarquía que PE-01
// congeló: Quality es el protagonista y los otros tres son especializados. Una
// persona que llegaba veía cuatro cosas del mismo tamaño y no sabía por dónde
// empezar — el mismo problema que PE-01B arregló en la puerta, y que aquí
// seguía intacto.
//
// Y los nombres, las frases y los estados salen del CATÁLOGO CANÓNICO, no de
// una lista escrita aquí (PEH-19): dos listas de módulos se desincronizan, y la
// que está en una página de marketing se desincroniza sin que nadie lo note.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { PublicHeader, PublicFooter } from "@/components/layout/public-shell";
import { heroModule, specializedModules, ENTRY_COPY } from "@/lib/modules/entry";
import { isTextilesModuleEnabled } from "@/lib/modules/textiles";
import { isPublicRegistrationEnabled } from "@/lib/auth/public-registration";

const COMING_SOON_MESSAGE = "Este módulo estará disponible próximamente.";

export default async function PublicLandingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const entryHref = user ? "/modules" : "/login";
  // Kill switch server-only: con el registro cerrado no se ofrece «Crear
  // cuenta Demo», porque llevaría a un formulario que el servidor va a
  // rechazar. La barrera real está en signUpAction, no aquí.
  const registrationOpen = isPublicRegistrationEnabled();

  // El protagonista y los tres especializados, en el orden congelado. Lo que se
  // pinta aquí es PRESENTACIÓN DE PRODUCTO: qué existe y en qué estado está para
  // Trazaloop, nunca qué tiene contratado quien mira — todavía no ha entrado.
  const hero = heroModule();
  const especializados = specializedModules();
  const disponible = (key: string, status: string) =>
    status === "functional" && (key !== "textiles" || isTextilesModuleEnabled());

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* COMMERCIAL-UX-01C · La cabecera y el pie salen del componente común.
          Antes esta página llevaba los suyos propios, y también la FAQ, y
          términos, y privacidad: cuatro sitios donde acordarse de añadir un
          enlace. «Planes y precios» aparece aquí porque está en UNA lista.

          El botón de registro sigue viniendo de esta página: depende de un
          interruptor de servidor que la cáscara no debe conocer. */}
      <PublicHeader
        currentPath="/"
        entryHref={entryHref}
        entryLabel={user ? "Entrar" : "Iniciar sesión"}
        action={registrationOpen ? (
          <Link
            href="/register"
            className="ml-2 rounded-md border border-loop px-4 py-2 text-sm font-semibold
                       text-loop hover:bg-loop hover:text-white focus-visible:outline
                       focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-loop"
          >
            Crear cuenta Demo
          </Link>
        ) : (
          <a
            href="mailto:contacto@idendi.org"
            className="ml-2 rounded-md border border-loop px-4 py-2 text-sm font-semibold
                       text-loop hover:bg-loop hover:text-white focus-visible:outline
                       focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-loop"
          >
            Solicitar acceso
          </a>
        )}
      />

      <main id="contenido" className="mx-auto w-full max-w-5xl flex-1 space-y-10 px-6 pb-20 pt-10">
        <section className="space-y-4">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-ink">
            Trazaloop
          </h1>
          <p className="max-w-2xl text-lg text-ink-soft">
            Plataforma modular para gestionar trazabilidad, documentación técnica, evidencias y
            preparación técnica de productos, procesos y cadenas de valor.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href={entryHref}
              className="rounded-md bg-loop px-5 py-2.5 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              Entrar
            </Link>
            {registrationOpen ? (
              <Link
                href="/register"
                className="rounded-md border border-hairline bg-surface px-5 py-2.5 text-sm font-medium hover:border-loop"
              >
                Crear cuenta Demo
              </Link>
            ) : (
              <a
                href="mailto:contacto@idendi.org"
                className="rounded-md border border-hairline bg-surface px-5 py-2.5 text-sm font-medium hover:border-loop"
              >
                Solicitar acceso
              </a>
            )}
          </div>
        </section>

        {/* EL PROTAGONISTA · ancho completo, título mayor, y su frase congelada. */}
        <section aria-labelledby="modulo-principal" className="space-y-4">
          <article className="rounded-lg border border-loop/30 bg-loop/5 p-6 sm:p-8">
            <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
              Disponible
            </span>
            <h2 id="modulo-principal" className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {hero.name}
            </h2>
            <p className="mt-2 max-w-2xl text-base text-ink-soft">
              {ENTRY_COPY[hero.key]}
            </p>
            <Link
              href={entryHref}
              className="mt-4 inline-flex rounded-md bg-loop px-5 py-2.5 text-sm font-semibold text-white hover:bg-loop-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
            >
              Entrar a {hero.name.replace(/^Trazaloop /, "")} →
            </Link>
          </article>
        </section>

        {/* LOS ESPECIALIZADOS · debajo, en rejilla, y en su orden estable. En
            una pantalla estrecha se apilan; el protagonista sigue siendo el
            primero porque va antes en el documento. */}
        <section aria-labelledby="modulos-especializados" className="space-y-3">
          <h2 id="modulos-especializados" className="eyebrow">Módulos especializados</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {especializados.map((mod) => {
              const activo = disponible(mod.key, mod.status);
              return (
                <div
                  key={mod.key}
                  className={`flex flex-col gap-2 rounded-lg border p-5 ${
                    activo ? "border-loop/30 bg-loop/5" : "border-hairline bg-paper opacity-70"
                  }`}
                >
                  <span
                    className={`inline-flex w-fit rounded-full border bg-surface px-2 py-0.5 text-[11px] font-medium ${
                      activo ? "border-loop/30 text-loop-deep" : "border-hairline text-ink-soft"
                    }`}
                  >
                    {activo ? "Disponible" : "Próximamente"}
                  </span>
                  <span className="text-base font-semibold text-ink">{mod.name}</span>
                  <span className="text-sm text-ink-soft">
                    {ENTRY_COPY[mod.key]}
                    {!activo ? ` ${COMING_SOON_MESSAGE}` : null}
                  </span>
                  {activo ? (
                    <Link
                      href={entryHref}
                      className="mt-1 text-sm font-medium text-loop hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
                    >
                      Entrar →
                    </Link>
                  ) : (
                    /* Inerte de verdad: ni enlace, ni botón deshabilitado —los
                       dos se anuncian como algo pulsable y frustran igual—. */
                    <span className="mt-1 text-sm text-ink-soft">Todavía no está disponible.</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <p className="max-w-2xl text-xs text-ink-soft">
          Una sola cuenta de Trazaloop da acceso a todos los módulos disponibles — nunca hay
          logins separados por módulo.
        </p>
      </main>

      <PublicFooter />
    </div>
  );
}
