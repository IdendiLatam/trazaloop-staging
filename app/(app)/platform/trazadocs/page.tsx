// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Vive bajo app/(app)/platform (fuera
// del shell de empresa): exige platform_staff activo, nunca organización
// activa (mismo criterio que el resto de /platform desde la corrección
// post Sprint 8.4).
export const dynamic = "force-dynamic";

import { listPlatformTrazadocBlueprintsAction } from "@/server/actions/trazadocs";
import { PlatformBlueprintList } from "@/components/domain/trazadocs/platform-blueprint-list";
import { CreateBlueprintForm } from "@/components/domain/trazadocs/create-blueprint-form";

export default async function PlatformTrazaDocsPage() {
  const { data: blueprints, canManage } = await listPlatformTrazadocBlueprintsAction();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Plataforma</p>
        <h1 className="text-2xl font-semibold tracking-tight">Estructuras TrazaDocs</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Administra las estructuras sugeridas y sus tips de ayuda para todas las empresas.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="eyebrow">Estructuras sugeridas</h2>
        <PlatformBlueprintList blueprints={blueprints} />
      </section>

      {canManage ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Nueva estructura</h2>
          <div className="rounded-lg border border-hairline bg-surface p-5">
            <CreateBlueprintForm />
          </div>
        </section>
      ) : null}
    </div>
  );
}
