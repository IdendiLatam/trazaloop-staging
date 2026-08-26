export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-09 · Listado de auditorías.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listAudits, listPrograms, todayIso } from "@/lib/db/quality-audits";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canManageAudits } from "@/lib/domain/quality-audits";
import { AuditsScreen } from "@/components/domain/quality/audits/audits";

export const metadata = { title: "Auditorías" };

export default async function AuditsListPage() {
  const org = await requireQualityModule();
  const [audits, programs, positions] = await Promise.all([
    listAudits(org.organizationId),
    listPrograms(org.organizationId),
    listQualityPositions(org.organizationId),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Auditorías</h1>
        <p className="text-sm text-ink-soft">
          Cada auditoría con su alcance, su equipo, su ejecución y sus hallazgos.
        </p>
      </header>

      <AuditsScreen
        audits={audits}
        programs={programs}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, label: p.name }))}
        canManage={canManageAudits(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
