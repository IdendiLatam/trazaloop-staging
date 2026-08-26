export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-07 · Reevaluaciones.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listSupplierOverview, todayIso } from "@/lib/db/quality-suppliers";
import { canManageSuppliers } from "@/lib/domain/quality-suppliers";
import { SupplierReevaluations } from "@/components/domain/quality/suppliers/reevaluations";
import { SupplierSubnav } from "@/components/domain/quality/suppliers/subnav";

export const metadata = { title: "Reevaluaciones" };

export default async function QualitySupplierReevaluationsPage() {
  const org = await requireQualityModule();
  const suppliers = await listSupplierOverview(org.organizationId, {});

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Reevaluaciones</h1>
        <p className="text-sm text-ink-soft">
          A quién toca volver a mirar y cuándo. Pasarse de la fecha no suspende a nadie.
        </p>
      </header>

      <SupplierSubnav current="reevaluations" />

      <SupplierReevaluations
        suppliers={suppliers.filter((s) => s.relationshipStatus !== "retired")}
        canManage={canManageSuppliers(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
