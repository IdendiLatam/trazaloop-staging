// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireCprModule } from "@/lib/auth/require-cpr-module";
import { getImportTemplatesAction, listImportJobsAction } from "@/server/actions/imports";
import { ImportTemplateList } from "@/components/domain/imports/import-template-list";
import { ImportHistory } from "@/components/domain/imports/import-history";
import { ImportWizard } from "@/components/domain/imports/import-wizard";

export default async function ImportsPage() {
  const org = await requireCprModule();
  const [templates, jobs] = await Promise.all([getImportTemplatesAction(), listImportJobsAction()]);
  const canImport = org.roleCode === "admin" || org.roleCode === "quality" || org.roleCode === "consultant";

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Importaciones</p>
        <h1 className="text-2xl font-semibold tracking-tight">Importaciones de datos reales</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Carga datos de empresa desde archivos CSV, valida errores antes de importar y completa
          el flujo de trazabilidad.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/implementation"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a Implementación
          </Link>
          <Link
            href="/catalog"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a Catálogos
          </Link>
          <Link
            href="/evidences"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a Evidencias
          </Link>
          <Link
            href="/traceability"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a Trazabilidad
          </Link>
          <Link
            href="/recycled-content"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a Contenido reciclado
          </Link>
        </div>
      </header>

      {/* 1. Plantillas disponibles */}
      <section className="space-y-3">
        <h2 className="eyebrow">Plantillas disponibles</h2>
        <p className="text-sm text-ink-soft">
          Descarga la plantilla de la entidad que vas a cargar. Las plantillas solo traen
          encabezados: complétalas con datos reales, nunca con filas de ejemplo.
        </p>
        <ImportTemplateList templates={templates} />
      </section>

      {/* 2, 3 y 4. Subir CSV, vista previa/validación y confirmar */}
      <section className="space-y-3">
        <h2 className="eyebrow">Subir y validar archivo</h2>
        {canImport ? (
          <ImportWizard />
        ) : (
          <p className="rounded-md border border-hairline bg-surface px-4 py-3 text-sm text-ink-soft">
            Tu rol no permite importar datos en esta empresa. Pide a un administrador o
            responsable de calidad que lo haga, o que te asigne el rol de consultor.
          </p>
        )}
      </section>

      {/* 5. Historial de importaciones (incluye errores/advertencias recientes
          por job — el detalle fila a fila está en /imports/[id]). */}
      <section className="space-y-3">
        <h2 className="eyebrow">Historial de importaciones</h2>
        <ImportHistory jobs={jobs} />
      </section>
    </div>
  );
}
