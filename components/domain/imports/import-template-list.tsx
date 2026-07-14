import type { ImportTemplateInfo } from "@/server/actions/imports";

/** Lista de plantillas descargables (Parte 1, sección 1 y Parte 3). Los
 *  archivos son estáticos en /public/templates/imports (solo encabezados,
 *  sin filas demo ni ficticias) y se enlazan directo: no hace falta pasar
 *  por un server action para descargar un archivo sin datos personales. */
export function ImportTemplateList({ templates }: { templates: ImportTemplateInfo[] }) {
  return (
    <div className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
      {templates.map((t, i) => (
        <div key={t.entity} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className="code text-xs text-ink-soft">{i + 1}.</span>
              {t.label}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Columnas: {t.columns.map((c) => (c.required ? c.key : `${c.key} (opcional)`)).join(", ")}
            </p>
          </div>
          <a
            href={`/templates/imports/${t.filename}`}
            download
            className="shrink-0 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Descargar plantilla
          </a>
        </div>
      ))}
    </div>
  );
}
