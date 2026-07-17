// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
//
// Portal de módulos (Sprint 10A, Parte 14): una sola identidad y sesión
// de Trazaloop para todos los módulos — nunca logins separados por
// módulo. Solo Trazaloop CPR está disponible; los demás son tarjetas
// deshabilitadas ("Próximamente"), sin ninguna funcionalidad interna
// creada para ellos.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { requireLegalAcceptance } from "@/lib/auth/require-legal-acceptance";
import { getPostAuthDestinationAction } from "@/server/actions/team";
import { moduleEntryDestinationPath } from "@/lib/domain/team";
import { Wordmark } from "@/components/layout/logo";

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
    key: "textil",
    name: "Trazaloop Textil",
    tagline: "Próximamente.",
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
          m.available ? (
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
        Este módulo estará disponible próximamente para las tarjetas marcadas como tal — ninguna
        funcionalidad interna se ha construido todavía para ellas.
      </p>
    </div>
  );
}
