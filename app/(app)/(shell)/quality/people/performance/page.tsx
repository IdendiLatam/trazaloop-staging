export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06 · Desempeño.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listPeople, listPerformanceCycles, listPerformanceEvaluations, todayIso,
} from "@/lib/db/quality-people";
import { canManagePeople } from "@/lib/domain/quality-people";
import { PerformanceView } from "@/components/domain/quality/people/performance";

export const metadata = { title: "Desempeño" };

export default async function QualityPerformancePage() {
  const org = await requireQualityModule();
  const [cycles, evaluations, people] = await Promise.all([
    listPerformanceCycles(org.organizationId),
    listPerformanceEvaluations(org.organizationId),
    listPeople(org.organizationId, { status: "active" }),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Desempeño</h1>
        <p className="text-sm text-ink-soft">
          Ciclos anuales, población aplicable y evaluaciones. Es un dominio distinto de la
          competencia: se puede ser competente y estar rindiendo mal, y al revés.
        </p>
      </header>

      <PerformanceView
        cycles={cycles}
        evaluations={evaluations}
        people={people}
        canManage={canManagePeople(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
