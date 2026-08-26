export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-07 · Proveedores.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listAdoptableSuppliers, listSupplierCategories, listSupplierOverview,
} from "@/lib/db/quality-suppliers";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canManageSuppliers } from "@/lib/domain/quality-suppliers";
import { SupplierDirectory } from "@/components/domain/quality/suppliers/directory";
import { SupplierSubnav } from "@/components/domain/quality/suppliers/subnav";

export const metadata = { title: "Proveedores" };

export default async function QualitySuppliersPage() {
  const org = await requireQualityModule();
  const [suppliers, adoptable, categories, positions] = await Promise.all([
    listSupplierOverview(org.organizationId, {}),
    listAdoptableSuppliers(org.organizationId),
    listSupplierCategories(org.organizationId),
    listQualityPositions(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Proveedores</h1>
        <p className="text-sm text-ink-soft">
          Quién nos suministra, para qué está aprobado, cuánto pesa depender de él y
          cuándo toca volver a mirarlo. No es un módulo de compras: aquí no hay pedidos,
          ni precios, ni facturas.
        </p>
      </header>

      <SupplierSubnav current="suppliers" />

      <SupplierDirectory
        suppliers={suppliers}
        adoptable={adoptable}
        categories={categories}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManageSuppliers(org.roleCode)}
      />
    </div>
  );
}
