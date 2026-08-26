export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06 · Matriz de competencias.

import Link from "next/link";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { getCompetenceMatrix, todayIso } from "@/lib/db/quality-people";
import { CompetenceMatrixView } from "@/components/domain/quality/people/competencies";

export const metadata = { title: "Matriz de competencias" };

export default async function QualityCompetenceMatrixPage() {
  const org = await requireQualityModule();
  const matrix = await getCompetenceMatrix(org.organizationId);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-2">
        <Link
          href="/quality/people/competencies"
          className="text-xs font-medium text-loop hover:underline"
        >
          ← Competencias
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Matriz de competencias</h1>
        <p className="text-sm text-ink-soft">
          Qué exige cada cargo y qué ha demostrado quien lo ocupa. Sirve para planificar
          desarrollo, no para puntuar personas.
        </p>
      </header>

      <CompetenceMatrixView matrix={matrix} today={todayIso()} />
    </div>
  );
}
