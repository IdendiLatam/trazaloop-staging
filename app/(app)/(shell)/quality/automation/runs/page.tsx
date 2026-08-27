export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-11 · Las ejecuciones del motor.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { getRun, listRuns } from "@/lib/db/quality-automation";
import { RunsScreen } from "@/components/domain/quality/automation/runs";

export const metadata = { title: "Ejecuciones de la automatización" };

export default async function AutomationRunsPage() {
  const org = await requireQualityModule();
  const runs = await listRuns(org.organizationId, 30);
  const detail = runs.length > 0 ? await getRun(org.organizationId, runs[0].id) : null;

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality · Automatización</p>
        <h1 className="text-2xl font-semibold tracking-tight">Ejecuciones</h1>
        <p className="text-sm text-ink-soft">
          Qué evaluó el motor y qué creó en cada pasada. Lo que informa es lo NUEVO de
          esa pasada, no cuántas señales existen.
        </p>
      </header>

      <RunsScreen runs={runs} detail={detail} />
    </div>
  );
}
