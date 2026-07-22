// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
//
// Portal de módulos (Sprint 10A, Parte 14; Textil privado en Sprint T1;
// disponibilidad real en Sprint T9E): una sola identidad y sesión de
// Trazaloop para todos los módulos — nunca logins separados por módulo.
//
// Trazaloop Textiles (module_key "textiles", DL-01) resuelve su tarjeta en
// DOS niveles y sin depender de CPR:
//   1. flag global TEXTILES_MODULE_ENABLED (servidor);
//   2. fila habilitada (organization_id, 'textiles') en organization_modules.
// Flag apagado → "Próximamente". Flag encendido sin organización activa →
// se pide seleccionar empresa. Flag encendido con organización sin
// habilitación → tarjeta bloqueada con explicación. Ambos niveles en verde
// → tarjeta ACTIVA y navegable hacia /textiles. La barrera real sigue
// siendo el guard de servidor de /textiles (nunca esta UI).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { requireLegalAcceptance } from "@/lib/auth/require-legal-acceptance";
import { getPostAuthDestinationAction } from "@/server/actions/team";
import { moduleEntryDestinationPath } from "@/lib/domain/team";
import { Wordmark } from "@/components/layout/logo";
import { getActiveOrganization, getOrganizationModules } from "@/lib/db/organizations";
import {
  TEXTILES_MODULE_KEY,
  TEXTILES_HOME_PATH,
  isTextilesModuleEnabled,
  organizationHasTextiles,
  type TextilesAvailability,
} from "@/lib/modules/textiles";

type ModuleCard = {
  key: string;
  name: string;
  tagline: string;
  available: boolean;
};

const MODULES: ModuleCard[] = [
  {
    key: "cpr",
    name: "Trazaloop CPR",
    tagline: "Trazabilidad, contenido reciclado y soporte técnico para NTC 6632 / UNE-EN 15343.",
    available: true,
  },
  {
    key: "textiles",
    name: "Trazaloop Textiles",
    tagline:
      "Trazabilidad de productos de confección, composición de fibras, evidencias, circularidad y pasaporte técnico textil.",
    available: false,
  },
  {
    key: "quality",
    name: "Trazaloop Quality",
    tagline: "Gestión de calidad e ISO 9001. Próximamente.",
    available: false,
  },
  {
    key: "construccion",
    name: "Trazaloop Construcción",
    tagline: "Próximamente.",
    available: false,
  },
];

function TextilesCard({
  card,
  availability,
}: {
  card: ModuleCard;
  availability: TextilesAvailability;
}) {
  if (availability === "available") {
    return (
      <Link
        href={TEXTILES_HOME_PATH}
        className="flex flex-col gap-2 rounded-lg border border-loop/30 bg-loop/5 p-5 transition-colors hover:border-loop"
      >
        <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
          Disponible para tu organización
        </span>
        <span className="text-lg font-semibold">{card.name}</span>
        <span className="text-sm text-ink-soft">{card.tagline}</span>
        <span className="mt-2 text-sm font-medium text-loop">Entrar →</span>
      </Link>
    );
  }

  if (availability === "no_active_org") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-paper p-5">
        <span className="inline-flex w-fit rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[11px] font-medium text-amber">
          Requiere empresa activa
        </span>
        <span className="text-lg font-semibold">{card.name}</span>
        <span className="text-sm text-ink-soft">
          Selecciona primero tu empresa para verificar si tiene habilitado este módulo.
        </span>
        <Link href="/select-org" className="mt-2 text-sm font-medium text-loop hover:underline">
          Seleccionar empresa →
        </Link>
      </div>
    );
  }

  if (availability === "org_not_enabled") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-paper p-5">
        <span className="inline-flex w-fit rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft">
          No habilitado para tu organización
        </span>
        <span className="text-lg font-semibold">{card.name}</span>
        <span className="text-sm text-ink-soft">{card.tagline}</span>
        <span className="text-xs text-ink-soft">
          Tu organización aún no tiene habilitado este módulo. Si te interesa activarlo,
          contacta a Trazaloop desde el Centro de soporte.
        </span>
      </div>
    );
  }

  // flag_disabled → módulo no disponible globalmente ("Próximamente").
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-hairline bg-paper p-5 opacity-70">
      <span className="inline-flex w-fit rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft">
        Próximamente
      </span>
      <span className="text-lg font-semibold">{card.name}</span>
      <span className="text-sm text-ink-soft">{card.tagline} Próximamente.</span>
      <button
        type="button"
        disabled
        className="mt-2 w-fit cursor-not-allowed rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-soft"
        title="Este módulo estará disponible próximamente."
      >
        Próximamente
      </button>
    </div>
  );
}

export default async function ModulesPortalPage() {
  await requireSession();
  await requireLegalAcceptance("/modules");
  // Sprint 10A (Bloqueante 5): la tarjeta "Trazaloop CPR" resuelve el
  // MISMO destino que ya calculaba el login antes de que existiera este
  // portal — dashboard si ya hay empresa activa, select-org si hay
  // varias o ninguna, accept-invite si hay una invitación pendiente
  // (edge case: alguien vuelve a /modules más tarde con una invitación
  // nueva). Nunca manda de vuelta a /modules.
  const destination = await getPostAuthDestinationAction();
  const cprHref = moduleEntryDestinationPath(destination);

  // Sprint T9E: disponibilidad en dos niveles con los MISMOS helpers que
  // usa el guard de /textiles (espejo exacto de resolveTextilesAvailability,
  // la regla pura canónica de lib/modules/textiles.ts): flag de entorno
  // (servidor) + fila habilitada en organization_modules (bajo RLS).
  const activeOrg = isTextilesModuleEnabled() ? await getActiveOrganization() : null;
  const orgModules = activeOrg ? await getOrganizationModules(activeOrg.organizationId) : [];
  const textilesAvailability: TextilesAvailability = !isTextilesModuleEnabled()
    ? "flag_disabled"
    : activeOrg === null
      ? "no_active_org"
      : organizationHasTextiles(orgModules)
        ? "available"
        : "org_not_enabled";

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
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {MODULES.map((m) =>
          m.key === TEXTILES_MODULE_KEY ? (
            <TextilesCard key={m.key} card={m} availability={textilesAvailability} />
          ) : m.available ? (
            <Link
              key={m.key}
              href={cprHref}
              className="flex flex-col gap-2 rounded-lg border border-loop/30 bg-loop/5 p-5 transition-colors hover:border-loop"
            >
              <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
                Disponible
              </span>
              <span className="text-lg font-semibold">{m.name}</span>
              <span className="text-sm text-ink-soft">{m.tagline}</span>
              <span className="mt-2 text-sm font-medium text-loop">Entrar →</span>
            </Link>
          ) : (
            <div
              key={m.key}
              className="flex flex-col gap-2 rounded-lg border border-hairline bg-paper p-5 opacity-70"
            >
              <span className="inline-flex w-fit rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                Próximamente
              </span>
              <span className="text-lg font-semibold">{m.name}</span>
              <span className="text-sm text-ink-soft">{m.tagline}</span>
              <button
                type="button"
                disabled
                className="mt-2 w-fit cursor-not-allowed rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-soft"
                title="Este módulo estará disponible próximamente."
              >
                Próximamente
              </button>
            </div>
          )
        )}
      </div>

      <p className="text-xs text-ink-soft">
        Los módulos marcados como &quot;Próximamente&quot; aún no tienen funcionalidad interna
        construida.
      </p>
    </div>
  );
}
