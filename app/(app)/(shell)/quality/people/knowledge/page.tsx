export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06 · Conocimiento.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getKnowledgeContinuity, listKnowledgeItems, listPeople, todayIso,
} from "@/lib/db/quality-people";
import { listRisks } from "@/lib/db/risks";
import { canManageStructure } from "@/lib/domain/quality-people";
import { KnowledgeView } from "@/components/domain/quality/people/knowledge";

export const metadata = { title: "Conocimiento" };

export default async function QualityKnowledgePage() {
  const org = await requireQualityModule();
  const [items, continuity, people, risks] = await Promise.all([
    listKnowledgeItems(org.organizationId),
    getKnowledgeContinuity(org.organizationId),
    listPeople(org.organizationId, { status: "active" }),
    listRisks(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Conocimiento</h1>
        <p className="text-sm text-ink-soft">
          Qué sabe la organización, quién lo sostiene y qué pasaría si esa persona no
          estuviera. El conocimiento es de la empresa: las personas lo sostienen.
        </p>
      </header>

      <KnowledgeView
        items={items}
        continuity={continuity}
        people={people}
        risks={risks.map((r) => ({ id: r.riskId, code: r.code, title: r.title }))}
        canManage={canManageStructure(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
