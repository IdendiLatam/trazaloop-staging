// Ruta protegida: depende de cookies/sesión/Supabase → nunca se prerenderiza
// en build (patrón Sprint 3.1).
//
// Trazaloop Quality · QUALITY-01 · Layout del namespace /quality.
//
// TODO el módulo Quality vive bajo este layout: el guard requireQualityModule
// se ejecuta aquí, así que cualquier página presente o futura de /quality/...
// queda protegida por defecto (kill switch QUALITY_MODULE_ENABLED +
// habilitación por empresa), además de las guardas del shell padre (sesión,
// aceptación legal, empresa activa).
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { QUALITY_SHELL_MODULE } from "@/lib/modules/registry";

export const metadata: Metadata = {
  title: {
    default: QUALITY_SHELL_MODULE.name,
    template: `%s · ${QUALITY_SHELL_MODULE.name}`,
  },
};

export default async function QualityLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const org = await requireQualityModule();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-3">
        <span className="inline-flex rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-[11px] font-medium text-loop-deep">
          Módulo
        </span>
        <span className="text-sm font-semibold">{QUALITY_SHELL_MODULE.name}</span>
        <span className="text-xs text-ink-soft">· {org.organizationName}</span>
      </div>
      {children}
    </div>
  );
}
