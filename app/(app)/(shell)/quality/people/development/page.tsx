export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06 · Desarrollo.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listCompetencies, listDevelopmentNeeds, listDevelopmentPlans, listLearningActivities,
  listPeople, todayIso,
} from "@/lib/db/quality-people";
import { canManagePeople } from "@/lib/domain/quality-people";
import { DevelopmentView } from "@/components/domain/quality/people/development";

export const metadata = { title: "Desarrollo" };

export default async function QualityDevelopmentPage() {
  const org = await requireQualityModule();
  const [needs, plans, activities, people, competencies] = await Promise.all([
    listDevelopmentNeeds(org.organizationId),
    listDevelopmentPlans(org.organizationId),
    listLearningActivities(org.organizationId),
    listPeople(org.organizationId, { status: "active" }),
    listCompetencies(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Desarrollo</h1>
        <p className="text-sm text-ink-soft">
          Necesidades, plan anual, actividades y eficacia. Se llama desarrollo y no
          capacitación porque la formación es una de las formas de desarrollar a alguien,
          no la única.
        </p>
      </header>

      <DevelopmentView
        needs={needs}
        plans={plans}
        activities={activities}
        people={people}
        competencies={competencies.filter((c) => c.isActive)}
        canManage={canManagePeople(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
