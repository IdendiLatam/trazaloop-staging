export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06 · Estructura de la empresa y organigrama.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { getOrgChart, listOrgUnits, todayIso } from "@/lib/db/quality-people";
import { canManageStructure } from "@/lib/domain/quality-people";
import { OrgStructureView } from "@/components/domain/quality/people/structure";

export const metadata = { title: "Estructura de la empresa" };

export default async function QualityStructurePage() {
  const org = await requireQualityModule();
  const [units, chart] = await Promise.all([
    listOrgUnits(org.organizationId),
    getOrgChart(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Estructura de la empresa</h1>
        <p className="text-sm text-ink-soft">
          El organigrama se genera a partir de las unidades, los cargos, su jerarquía y las
          asignaciones vigentes. No hay ninguna imagen que mantener: cambiar un cargo
          cambia el organigrama.
        </p>
      </header>

      <OrgStructureView
        units={units}
        chart={chart}
        canManage={canManageStructure(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
