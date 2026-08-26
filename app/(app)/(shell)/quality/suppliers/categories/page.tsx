export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-07 · Categorías y requisitos.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listRequirementAssignments, listScopeOptions, listSupplierCategories,
  listSupplierRequirements, todayIso,
} from "@/lib/db/quality-suppliers";
import { canManageSuppliers } from "@/lib/domain/quality-suppliers";
import { SupplierCatalog } from "@/components/domain/quality/suppliers/catalog";
import { SupplierSubnav } from "@/components/domain/quality/suppliers/subnav";

export const metadata = { title: "Categorías de proveedor" };

export default async function QualitySupplierCategoriesPage() {
  const org = await requireQualityModule();
  const [categories, requirements, assignments, scopes] = await Promise.all([
    listSupplierCategories(org.organizationId),
    listSupplierRequirements(org.organizationId),
    listRequirementAssignments(org.organizationId),
    listScopeOptions(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Categorías y requisitos</h1>
        <p className="text-sm text-ink-soft">
          Qué familias de suministro existen y qué se le exige a cada una.
        </p>
      </header>

      <SupplierSubnav current="categories" />

      <SupplierCatalog
        categories={categories}
        requirements={requirements.filter((r) => r.isActive)}
        assignments={assignments}
        scopes={scopes}
        canManage={canManageSuppliers(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
