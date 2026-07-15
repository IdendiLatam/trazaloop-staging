import Link from "next/link";
import type { PlatformBlueprintRow } from "@/lib/db/trazadocs-platform";
import { DOCUMENT_TYPE_LABEL } from "@/lib/domain/trazadocs";
import { EmptyState } from "@/components/ui/empty-state";

const STATUS_LABEL: Record<string, string> = { active: "Activa", inactive: "Inactiva" };
const STATUS_TONE: Record<string, string> = {
  active: "border-loop/30 bg-loop/5 text-loop-deep",
  inactive: "border-hairline bg-paper text-ink-soft",
};

/** Estructuras sugeridas globales (Parte 6). Solo lectura aquí; la edición
 *  vive en /platform/trazadocs/[id]. */
export function PlatformBlueprintList({ blueprints }: { blueprints: PlatformBlueprintRow[] }) {
  if (blueprints.length === 0) {
    return <EmptyState title="Todavía no hay estructuras sugeridas." description="Crea la primera abajo." />;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-soft">
            <th className="px-3 py-2 font-medium">Nombre</th>
            <th className="px-3 py-2 font-medium">Código</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Secciones</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {blueprints.map((bp) => (
            <tr key={bp.blueprintId} className="border-b border-hairline last:border-0">
              <td className="px-3 py-2 font-medium">{bp.name}</td>
              <td className="code px-3 py-2 text-xs">{bp.code}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">{DOCUMENT_TYPE_LABEL[bp.documentType]}</td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[bp.status]}`}
                >
                  {STATUS_LABEL[bp.status]}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-ink-soft">
                {bp.sectionsCount} ({bp.requiredSectionsCount} oblig.)
              </td>
              <td className="px-3 py-2 text-right text-xs">
                <Link href={`/platform/trazadocs/${bp.blueprintId}`} className="text-loop hover:underline">
                  Administrar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
