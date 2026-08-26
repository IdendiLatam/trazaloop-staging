export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06 · Catálogo de competencias.

import Link from "next/link";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listCompetencies, listCompetencyLevels } from "@/lib/db/quality-people";
import { canManageStructure } from "@/lib/domain/quality-people";
import { CompetenciesView } from "@/components/domain/quality/people/competencies";

export const metadata = { title: "Competencias" };

export default async function QualityCompetenciesPage() {
  const org = await requireQualityModule();
  const [competencies, levels] = await Promise.all([
    listCompetencies(org.organizationId),
    listCompetencyLevels(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Competencias</h1>
        <p className="text-sm text-ink-soft">
          Una competencia se define una vez y la exigen los cargos que la necesiten. Aquí
          está el catálogo y la escala de niveles de tu empresa.{" "}
          <Link href="/quality/people/competencies/matrix" className="font-medium text-loop hover:underline">
            Ver la matriz
          </Link>
          .
        </p>
      </header>

      <CompetenciesView
        competencies={competencies}
        levels={levels}
        canManage={canManageStructure(org.roleCode)}
      />
    </div>
  );
}
