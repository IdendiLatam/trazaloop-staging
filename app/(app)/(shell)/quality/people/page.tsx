// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06 · Personas.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listAssignments, listPeople, todayIso } from "@/lib/db/quality-people";
import { listOrganizationMembersForQuality } from "@/lib/db/quality-processes";
import { canManagePeople } from "@/lib/domain/quality-people";
import { PeopleDirectory } from "@/components/domain/quality/people/directory";

export const metadata = { title: "Personas" };

export default async function QualityPeoplePage() {
  const org = await requireQualityModule();
  const [people, assignments, members] = await Promise.all([
    listPeople(org.organizationId),
    listAssignments(org.organizationId),
    listOrganizationMembersForQuality(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Personas</h1>
        <p className="text-sm text-ink-soft">
          Quién trabaja en la organización, qué cargos ha ocupado, qué competencia ha
          demostrado y qué conocimiento sostiene. Solo lo que el sistema de gestión
          necesita: esto no es un sistema de nómina ni un expediente laboral.
        </p>
      </header>

      <PeopleDirectory
        people={people}
        assignments={assignments}
        members={members.map((m) => ({ profileId: m.profileId, name: m.name, email: m.email }))}
        canManage={canManagePeople(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
