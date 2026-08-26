export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-09 · El programa de auditorías.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listPrograms } from "@/lib/db/quality-audits";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canManageAudits } from "@/lib/domain/quality-audits";
import { ProgramsScreen } from "@/components/domain/quality/audits/programs";

export const metadata = { title: "Programa de auditorías" };

export default async function ProgramsPage() {
  const org = await requireQualityModule();
  const [programs, positions] = await Promise.all([
    listPrograms(org.organizationId),
    listQualityPositions(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Programa de auditorías</h1>
        <p className="text-sm text-ink-soft">
          El plan del periodo: qué se auditará, cuándo y por qué. Un programa no es una
          auditoría.
        </p>
      </header>

      <ProgramsScreen
        programs={programs}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, label: p.name }))}
        canManage={canManageAudits(org.roleCode)}
      />
    </div>
  );
}
