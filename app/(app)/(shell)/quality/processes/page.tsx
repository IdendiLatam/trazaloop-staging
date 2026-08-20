// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-01 · Listado y alta de procesos.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listQualityCategories,
  listQualityPositions,
  listQualityProcesses,
} from "@/lib/db/quality-processes";
import { QualityProcessList } from "@/components/domain/quality/process-list";

export const metadata = { title: "Procesos" };

export default async function QualityProcessesPage() {
  const org = await requireQualityModule();

  const [processes, positions, categories] = await Promise.all([
    listQualityProcesses(org.organizationId),
    listQualityPositions(org.organizationId),
    listQualityCategories(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Procesos</h1>
        <p className="text-sm text-ink-soft">
          Cada proceso tiene un cargo propietario y un contenido que se versiona. Se trabaja
          sobre un borrador —propósito, alcance, entradas, salidas y relaciones— y se publica
          cuando está listo.
        </p>
      </header>

      <QualityProcessList
        processes={processes}
        positions={positions.filter((p) => p.isActive)}
        categories={categories}
      />
    </div>
  );
}
