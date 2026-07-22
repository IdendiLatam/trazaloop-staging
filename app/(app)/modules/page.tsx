// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
//
// Portal de módulos. Sprint T9F: cada tarjeta muestra el ESTADO COMERCIAL
// REAL resuelto por la regla canónica (lib/modules/access.ts):
// Demo temporal (con vencimiento), Demo permanente, Full, Extra, Prueba
// finalizada, Módulo deshabilitado, Temporalmente no disponible (kill switch)
// o Próximamente (no funcional). Jamás "Próximamente" cuando el motivo real
// es un Demo vencido, una asignación deshabilitada, la falta de asignación o
// un flag global apagado. La barrera real sigue siendo el guard de servidor
// de cada módulo (nunca esta UI).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { requireLegalAcceptance } from "@/lib/auth/require-legal-acceptance";
import { getPostAuthDestinationAction } from "@/server/actions/team";
import { moduleEntryDestinationPath } from "@/lib/domain/team";
import { Wordmark } from "@/components/layout/logo";
import { getActiveOrganization } from "@/lib/db/organizations";
import { getActiveOrgModuleStatuses, getDemoTrialSummary, type OrgModuleStatus } from "@/lib/db/module-access";
import { DemoTrialBanner } from "@/components/domain/modules/demo-trial-banner";
import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";
import { TEXTILES_HOME_PATH } from "@/lib/modules/textiles";
import type { DerivedModuleState } from "@/lib/modules/access";
import { formatRemainingTrial } from "@/lib/modules/access";
import { DERIVED_STATE_LABEL, DERIVED_STATE_HINT, isEnterableState } from "@/lib/modules/messages";

function formatExpiry(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ModuleCard({
  name,
  tagline,
  state,
  expiresAt,
  href,
}: {
  name: string;
  tagline: string;
  state: DerivedModuleState;
  expiresAt: string | null;
  href: string | null;
}) {
  const enterable = isEnterableState(state) && href !== null;
  const now = new Date();
  const remaining = state === "demo_active" && expiresAt ? formatRemainingTrial(expiresAt, now) : null;

  const badgeTone = enterable
    ? "border-loop/30 bg-surface text-loop-deep"
    : state === "demo_expired" || state === "disabled"
      ? "border-amber/40 bg-amber/10 text-amber"
      : "border-hairline bg-surface text-ink-soft";

  const body = (
    <>
      <span className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeTone}`}>
        {DERIVED_STATE_LABEL[state]}
      </span>
      <span className="text-lg font-semibold">{name}</span>
      {state === "demo_active" && expiresAt ? (
        <span className="text-sm text-ink-soft">
          Vence el {formatExpiry(expiresAt)}.{remaining ? ` Queda ${remaining}.` : ""}
        </span>
      ) : (
        <span className="text-sm text-ink-soft">{tagline}</span>
      )}
      <span className="text-xs text-ink-soft">{DERIVED_STATE_HINT[state]}</span>
      {enterable ? <span className="mt-2 text-sm font-medium text-loop">Entrar →</span> : null}
    </>
  );

  if (enterable) {
    return (
      <Link
        href={href}
        className="flex flex-col gap-2 rounded-lg border border-loop/30 bg-loop/5 p-5 transition-colors hover:border-loop"
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-paper p-5 opacity-90">
      {body}
    </div>
  );
}

export default async function ModulesPortalPage() {
  await requireSession();
  await requireLegalAcceptance("/modules");

  // Destino de CPR: dashboard si ya hay empresa activa, select-org si hay
  // varias o ninguna, accept-invite si hay invitación pendiente. Nunca /modules.
  const destination = await getPostAuthDestinationAction();
  const cprHref = moduleEntryDestinationPath(destination);

  const activeOrg = await getActiveOrganization();
  const statuses: OrgModuleStatus[] = activeOrg
    ? await getActiveOrgModuleStatuses(activeOrg.organizationId)
    : [];
  const stateByKey = new Map(statuses.map((s) => [s.key, s]));
  const demoTrials = activeOrg
    ? await getDemoTrialSummary(activeOrg.organizationId)
    : { activeTrials: [], hasExpired: false };

  const homeHrefByKey: Record<string, string | null> = {
    cpr: cprHref,
    textiles: TEXTILES_HOME_PATH,
    quality: null,
    construccion: null,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <header className="space-y-2">
        <Wordmark />
        <p className="eyebrow">Módulos</p>
        <h1 className="text-2xl font-semibold tracking-tight">Elige un módulo</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Una sola cuenta de Trazaloop da acceso a todos los módulos disponibles — la sesión se
          comparte entre ellos.
        </p>
        {!activeOrg && (
          <p className="text-sm text-amber">
            Selecciona primero tu empresa para ver el estado de tus módulos.{" "}
            <Link href="/select-org" className="font-medium underline">
              Seleccionar empresa
            </Link>
          </p>
        )}
      </header>

      <DemoTrialBanner trials={demoTrials.activeTrials} hasExpired={demoTrials.hasExpired} />

      <div className="grid gap-4 sm:grid-cols-2">
        {COMMERCIAL_MODULES.map((mod) => {
          const status = stateByKey.get(mod.key);
          // Sin empresa activa: los funcionales piden empresa; los no
          // funcionales se muestran como Próximamente.
          const state: DerivedModuleState = status
            ? status.access.derivedState
            : mod.status === "functional"
              ? "not_assigned"
              : "coming_soon";
          const expiresAt = status?.access.expiresAt ?? null;
          const href = isEnterableState(state) ? homeHrefByKey[mod.key] ?? null : null;
          return (
            <ModuleCard
              key={mod.key}
              name={mod.name}
              tagline={mod.description}
              state={state}
              expiresAt={expiresAt}
              href={href}
            />
          );
        })}
      </div>

      <p className="text-xs text-ink-soft">
        El estado de cada módulo se resuelve con la hora del servidor. Los módulos marcados como
        &quot;Próximamente&quot; aún no tienen funcionalidad interna construida.
      </p>
    </div>
  );
}
