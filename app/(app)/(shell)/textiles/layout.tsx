// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (patrón Sprint 3.1).
//
// Trazaloop · Sprint T1 (Textil) · Layout del namespace /textiles.
//
// TODO el módulo Textil vive bajo este layout (DL-04): el guard
// requireTextilesModule se ejecuta aquí, así que cualquier página presente
// o futura de /textiles/... queda protegida por defecto (flag de entorno +
// habilitación por organización), además de las guardas del shell padre
// (sesión, aceptación legal, empresa activa).
//
// Sprint T9E: el módulo dejó de presentarse "en preparación" (T1–T9D lo
// hicieron funcional). La franja superior muestra la identidad del módulo
// desde el registro central — nunca branding de CPR — y la metadata del
// navegador usa el nombre del módulo.
export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { TEXTILES_SHELL_MODULE } from "@/lib/modules/registry";

export const metadata: Metadata = {
  title: {
    default: TEXTILES_SHELL_MODULE.name,
    template: `%s · ${TEXTILES_SHELL_MODULE.name}`,
  },
};

export default async function TextilesLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const org = await requireTextilesModule();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-3">
        <span className="inline-flex rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-[11px] font-medium text-loop-deep">
          Módulo
        </span>
        <span className="text-sm font-semibold">{TEXTILES_SHELL_MODULE.name}</span>
        <span className="text-xs text-ink-soft">· {org.organizationName}</span>
      </div>
      {children}
    </div>
  );
}
