export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-07 · Plantillas de evaluación de proveedores.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listSupplierRequirements, listSupplierTemplates, todayIso,
} from "@/lib/db/quality-suppliers";
import { canManageSuppliers } from "@/lib/domain/quality-suppliers";
import { SupplierTemplates } from "@/components/domain/quality/suppliers/templates";
import { SupplierSubnav } from "@/components/domain/quality/suppliers/subnav";

export const metadata = { title: "Plantillas de evaluación" };

export default async function QualitySupplierTemplatesPage() {
  const org = await requireQualityModule();
  const [templates, requirements] = await Promise.all([
    listSupplierTemplates(org.organizationId),
    listSupplierRequirements(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Plantillas de evaluación</h1>
        <p className="text-sm text-ink-soft">
          Con qué criterios y con qué pesos se evalúa a un proveedor. Cada cambio es una
          versión nueva, para que lo evaluado antes siga significando lo mismo.
        </p>
      </header>

      <SupplierSubnav current="evaluations" />

      <SupplierTemplates
        templates={templates}
        requirements={requirements.filter((r) => r.isActive)}
        canManage={canManageSuppliers(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
