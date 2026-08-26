export const dynamic = "force-dynamic";

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listMethodologies } from "@/lib/db/risks";
import { canGovernMethodology } from "@/lib/domain/risks";
import { QualityMethodologyView } from "@/components/domain/quality/methodology-view";

export const metadata = { title: "Metodología de valoración" };

export default async function QualityMethodologyPage() {
  const org = await requireQualityModule();
  const methodologies = await listMethodologies(org.organizationId);

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality · Riesgos y oportunidades</p>
        <h1 className="text-2xl font-semibold tracking-tight">Metodología de valoración</h1>
        <p className="text-sm text-ink-soft">
          Las escalas, la regla de combinación y las bandas de nivel las define la empresa, no el
          programa. Cada versión publicada queda congelada, de modo que una evaluación antigua
          siempre se puede volver a explicar con los criterios que regían cuando se hizo.
        </p>
      </header>

      <QualityMethodologyView
        methodologies={methodologies}
        canGovern={canGovernMethodology(org.roleCode)}
      />
    </div>
  );
}
