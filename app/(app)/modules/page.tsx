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
import { PageTutorialAction } from "@/components/domain/tutorials/page-tutorial-action";
import { WelcomeVideo } from "@/components/domain/tutorials/welcome-video";
import { getActiveOrganization } from "@/lib/db/organizations";
import { getAiCreditStatus, getOrganizationTimeStatus } from "@/lib/db/organization-usage";
import { UsageSummaryCard } from "@/components/domain/usage/usage-summary-card";
import { getActiveOrgModuleStatuses, getDemoTrialSummary } from "@/lib/db/module-access";
import { DemoTrialBanner } from "@/components/domain/modules/demo-trial-banner";
import {
  HeroModuleCard, SpecializedModuleCard, type ModuleEntryModel,
} from "@/components/domain/modules/module-entry";
import { resolveModuleEntryHref, type CommercialModule, type CommercialModuleKey }
  from "@/lib/modules/catalog";
import type { DerivedModuleState } from "@/lib/modules/access";
import { ACTIVATE_FULL_HREF, ACTIVATE_FULL_LABEL, isReadableState } from "@/lib/modules/messages";
import {
  ENTRY_COPY, FREE_RETAINED_BODY, FREE_RETAINED_TITLE,
  MODULE_ACCESS_FOOTNOTE, NO_ACTIVE_MODULES_BODY,
  NO_ACTIVE_MODULES_TITLE, PLATFORM_TAGLINE,
  RESOLUTION_FAILED_BODY, RESOLUTION_FAILED_TITLE, enterLabel, heroModule,
  overviewOf, specializedModules,
} from "@/lib/modules/entry";

export const metadata = { title: "Módulos · Trazaloop" };

export default async function ModulesPortalPage() {
  const { user } = await requireSession();
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
        // PROD-LAUNCH-01C.4 · Se entra a lo que se puede LEER. Preguntar por
        // `isEnterableState` aquí dejaba sin enlace justo a los módulos donde
        // la empresa tiene su trabajo guardado.
        isEnterable: isReadableState(state),
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

  // PE-04B4 · El consumo, en la PUERTA. Es la primera pantalla después de
  // entrar y la que responde «qué tengo»: el sitio natural para «cuánto me
  // queda». Y está FUERA del shell, así que mirar lo que se ha consumido no
  // consume tiempo — cobrar por consultar el propio cupo sería absurdo.
  const consumo = activeOrg
    ? await Promise.all([
        getOrganizationTimeStatus(activeOrg.organizationId),
        getAiCreditStatus(activeOrg.organizationId),
      ])
    : [null, null];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* PE-03B4 · La bienvenida, y SOLO aquí.
          Esta es la primera pantalla normal después de entrar, y las puertas
          obligatorias ya quedaron atrás: `requireLegalAcceptance` está arriba, y
          se exige además empresa activa para no tapar el selector con un vídeo.

          Montarlo en cada pantalla de cada módulo lo habría hecho reaparecer al
          navegar, que es la forma de convertir un saludo en una molestia.

          Si no hay vídeo publicado, si la persona pidió no volver a verlo o si
          algo falla, el componente no pinta nada. La bienvenida acompaña; no es
          una puerta que haya que cruzar. */}
      {activeOrg ? <WelcomeVideo userId={user.id} /> : null}
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Wordmark />
          <div className="flex flex-wrap items-center gap-3">
            {/* PE-02B4 · La ayuda, también en la puerta: es la primera pantalla
                que se ve al entrar, y es donde más se pregunta «¿y esto?». */}
            {/* PE-03B3 · La puerta está FUERA del shell —tiene su propia
                cabecera—, así que el botón de la barra no llega aquí. Se pone a
                mano en esta pantalla y solo en esta: es la que se ve siempre, y
                es una, no ciento cuarenta y siete. */}
            <PageTutorialAction />
            {/* PROD-LAUNCH-01C.4 · Facturación, aquí.
                01B.9 la puso en el grupo transversal de la barra lateral, y esa
                barra vive DENTRO del shell — al que no se llega sin entrar a un
                módulo. Justo la empresa que necesita comprar, la que se quedó
                sin ninguno, era la única que no podía llegar. El acceso a
                facturación depende de ser miembro autorizado, no de tener un
                módulo, así que se pinta sin condición. */}
            {activeOrg ? (
              <Link
                href="/settings/billing"
                className="text-sm font-medium text-ink-soft hover:text-loop hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
              >
                Plan y facturación
              </Link>
            ) : null}
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

      {activeOrg ? <UsageSummaryCard time={consumo[0]} ai={consumo[1]} /> : null}

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
        /* PROD-LAUNCH-01C.4 · Dos situaciones que se veían iguales y no lo son.
           Si queda algo que consultar, lo primero que hay que decir es eso —es
           lo que quiere saber quien acaba de quedarse sin prueba— y ofrecer la
           salida. «Esta empresa no tiene módulos activos» solo se queda para
           quien de verdad no tiene nada. */
        <section
          aria-labelledby="sin-modulos"
          className="rounded-lg border border-hairline bg-surface p-4"
        >
          <h2 id="sin-modulos" className="text-sm font-semibold">
            {resumen.hasReadable ? FREE_RETAINED_TITLE : NO_ACTIVE_MODULES_TITLE}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {resumen.hasReadable ? FREE_RETAINED_BODY : NO_ACTIVE_MODULES_BODY}
          </p>
          {resumen.hasReadable ? (
            <Link
              href={ACTIVATE_FULL_HREF}
              className="mt-3 inline-flex w-fit items-center rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {ACTIVATE_FULL_LABEL}
            </Link>
          ) : null}
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
