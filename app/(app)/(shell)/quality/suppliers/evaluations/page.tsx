export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-07 · Evaluaciones de proveedores.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listScopeOptions, listSupplierEvaluations, listSupplierTemplates,
} from "@/lib/db/quality-suppliers";
import { canManageSuppliers } from "@/lib/domain/quality-suppliers";
import { SupplierEvaluations } from "@/components/domain/quality/suppliers/evaluations";
import { SupplierSubnav } from "@/components/domain/quality/suppliers/subnav";

export const metadata = { title: "Evaluaciones de proveedores" };

export default async function QualitySupplierEvaluationsPage() {
  const org = await requireQualityModule();
  const [evaluations, scopes, templates] = await Promise.all([
    listSupplierEvaluations(org.organizationId, {}),
    listScopeOptions(org.organizationId),
    listSupplierTemplates(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Evaluaciones</h1>
        <p className="text-sm text-ink-soft">
          Selección, evaluación periódica y reevaluación: el mismo acto en momentos
          distintos. Ninguna de las tres aprueba por sí sola.
        </p>
      </header>

      <SupplierSubnav current="evaluations" />

      <SupplierEvaluations
        evaluations={evaluations}
        scopes={scopes}
        templates={templates.filter((t) => t.isActive)}
        canManage={canManageSuppliers(org.roleCode)}
      />
    </div>
  );
}
