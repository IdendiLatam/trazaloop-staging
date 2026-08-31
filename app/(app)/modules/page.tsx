// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

// Trazaloop · PE-01B · LA PUERTA DE TRAZALOOP.
//
// QUÉ ERA Y QUÉ ES
//
// Era «Elige un módulo»: cuatro tarjetas iguales en una rejilla de dos, ordenadas
// por estado para que la única entrable no cayera bajo el pliegue. Con cuatro
// módulos del mismo tamaño no se podía saber cuál es el producto principal.
//
// Ahora Quality ocupa arriba y entero, y PCR, Textiles y Construcción van debajo
// en una fila secundaria. La jerarquía la da el TAMAÑO, no un adorno: no hace
// falta un distintivo que diga «principal» si se ve.
//
// Y la jerarquía es del PRODUCTO, no del contrato: Quality sigue arriba aunque
// la empresa no lo tenga. Que se pueda entrar o no lo dice su estado.
//
// LO QUE ESTA PANTALLA NO HACE (PE-01)
//
// No vende, no cobra, no explica planes, no enseña vídeos y no responde
// preguntas. Eso es PE-02…PE-05, y hasta que existan no hay ni un botón que lo
// insinúe: un enlace a una página que no existe es peor que ningún enlace.

import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { requireLegalAcceptance } from "@/lib/auth/require-legal-acceptance";
import { getPostAuthDestinationAction } from "@/server/actions/team";
import { moduleEntryDestinationPath } from "@/lib/domain/team";
import { Wordmark } from "@/components/layout/logo";
import { getActiveOrganization } from "@/lib/db/organizations";
import { getActiveOrgModuleStatuses, getDemoTrialSummary } from "@/lib/db/module-access";
import { DemoTrialBanner } from "@/components/domain/modules/demo-trial-banner";
import {
  HeroModuleCard, SpecializedModuleCard, type ModuleEntryModel,
} from "@/components/domain/modules/module-entry";
import { resolveModuleEntryHref, type CommercialModule, type CommercialModuleKey }
  from "@/lib/modules/catalog";
import type { DerivedModuleState } from "@/lib/modules/access";
import { isEnterableState } from "@/lib/modules/messages";
import {
  ENTRY_COPY, MODULE_ACCESS_FOOTNOTE, NO_ACTIVE_MODULES_BODY,
  NO_ACTIVE_MODULES_TITLE, PLATFORM_TAGLINE,
  RESOLUTION_FAILED_BODY, RESOLUTION_FAILED_TITLE, enterLabel, heroModule,
  overviewOf, specializedModules,
} from "@/lib/modules/entry";

export const metadata = { title: "Módulos · Trazaloop" };

export default async function ModulesPortalPage() {
  await requireSession();
  await requireLegalAcceptance("/modules");

  const activeOrg = await getActiveOrganization();

  // La entrada a PCR es la única que no se conoce de antemano: depende de si
  // hay empresa activa, varias, o una invitación pendiente.
  const destination = await getPostAuthDestinationAction();
  const runtimeHrefByKey: Partial<Record<CommercialModuleKey, string>> = {
    cpr: moduleEntryDestinationPath(destination),
  };

  const statuses = activeOrg
    ? await getActiveOrgModuleStatuses(activeOrg.organizationId)
    : [];
  const stateByKey = new Map(statuses.map((s) => [s.key, s]));

  const modelo = (mod: CommercialModule): ModuleEntryModel => {
    const status = stateByKey.get(mod.key);
    // Sin empresa activa no se puede afirmar nada del acceso: los funcionales
    // se presentan sin resolver y los futuros como lo que son.
    const state: DerivedModuleState = status
      ? status.access.derivedState
      : mod.status === "functional"
        ? "unavailable"
        : "coming_soon";
    return {
      key: mod.key,
      name: mod.name,
      copy: ENTRY_COPY[mod.key],
      state,
      expiresAt: status?.access.expiresAt ?? null,
      href: resolveModuleEntryHref({
        mod,
        isEnterable: isEnterableState(state),
        runtimeHref: runtimeHrefByKey[mod.key],
      }),
      enterLabel: enterLabel(mod),
    };
  };

  const hero = modelo(heroModule());
  const especializados = specializedModules().map(modelo);
  const resumen = overviewOf([hero, ...especializados].map((m) => m.state));

  const demoTrials = activeOrg
    ? await getDemoTrialSummary(activeOrg.organizationId)
    : { activeTrials: [], expiredModules: [], hasEnterableModule: false, notice: "none" as const };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Wordmark />
          <div className="flex flex-wrap items-center gap-3">
            {/* PE-02B4 · La ayuda, también en la puerta: es la primera pantalla
                que se ve al entrar, y es donde más se pregunta «¿y esto?». */}
            <Link
              href="/faq"
              className="text-sm font-medium text-ink-soft hover:text-loop hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
            >
              Ayuda
            </Link>
          {activeOrg ? (
            <Link
              href="/select-org"
              className="inline-flex items-center gap-2 rounded-full border border-loop/30 bg-loop/5 px-3 py-1.5 text-sm font-semibold text-loop-deep hover:border-loop"
            >
              <span className="h-2 w-2 rounded-full bg-loop" aria-hidden="true" />
              {activeOrg.organizationName}
              <span className="text-xs font-normal text-ink-soft">cambiar empresa</span>
            </Link>
          ) : null}
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Trazaloop</h1>
        <p className="max-w-2xl text-sm text-ink-soft">{PLATFORM_TAGLINE}</p>
        {!activeOrg ? (
          <p className="text-sm text-amber">
            Selecciona primero tu empresa para ver el estado de tus módulos.{" "}
            <Link href="/select-org" className="font-medium underline">
              Seleccionar empresa
            </Link>
          </p>
        ) : null}
      </header>

      {/* Que NO se pudiera comprobar nada y que NO haya nada activo son dos
          cosas distintas, y confundirlas es el defecto PE-D1 en grande: decirle
          a alguien que no tiene módulos cuando lo que pasó es que no se pudo
          preguntar. */}
      {activeOrg && resumen.allUnavailable ? (
        <section
          aria-labelledby="sin-resolver"
          role="status"
          className="rounded-lg border border-amber/40 bg-amber/10 p-4"
        >
          <h2 id="sin-resolver" className="text-sm font-semibold text-amber">
            {RESOLUTION_FAILED_TITLE}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{RESOLUTION_FAILED_BODY}</p>
        </section>
      ) : activeOrg && !resumen.hasEnterable ? (
        <section
          aria-labelledby="sin-modulos"
          className="rounded-lg border border-hairline bg-surface p-4"
        >
          <h2 id="sin-modulos" className="text-sm font-semibold">
            {NO_ACTIVE_MODULES_TITLE}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{NO_ACTIVE_MODULES_BODY}</p>
        </section>
      ) : null}

      {/* En el propio selector el aviso no ofrece enlace al selector. */}
      <DemoTrialBanner
        trials={demoTrials.activeTrials}
        expiredModules={demoTrials.expiredModules}
        notice={demoTrials.notice}
        showModulesLink={false}
      />

      <HeroModuleCard model={hero} />

      <section aria-labelledby="especializados" className="space-y-3">
        <h2 id="especializados" className="text-sm font-semibold text-ink-soft">
          Módulos especializados
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {especializados.map((m) => (
            <SpecializedModuleCard key={m.key} model={m} />
          ))}
        </div>
      </section>

      <p className="text-xs text-ink-soft">
        {MODULE_ACCESS_FOOTNOTE}{" "}
        {/* PE-02B6 · «Ayuda», igual que en la barra superior: dentro de
            Trazaloop la entrada global se llama siempre así. */}
        <Link href="/faq" className="text-loop hover:underline">
          Ayuda
        </Link>
      </p>
    </div>
  );
}
