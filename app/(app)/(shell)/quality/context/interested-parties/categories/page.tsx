export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-12.3B3A · Categorías de partes interesadas.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listCategories } from "@/lib/db/quality-interested-parties";
import { canManageInterestedParties } from "@/lib/domain/quality-interested-parties";
import { InterestedPartiesSubnav } from "@/components/domain/quality/interested-parties/subnav";
import { CategoriesManager } from "@/components/domain/quality/interested-parties/categories-manager";

export const metadata = { title: "Categorías de partes interesadas" };

export default async function InterestedPartiesCategoriesPage() {
  const org = await requireQualityModule();
  const categories = await listCategories(org.organizationId, { includeInactive: true });

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
        <p className="text-sm text-ink-soft">
          Cómo clasifica tu empresa a sus partes interesadas. Las iniciales son una propuesta,
          no una obligación: puedes renombrarlas, desactivarlas y añadir las tuyas.
        </p>
      </header>

      <InterestedPartiesSubnav current="categories" />

      <CategoriesManager
        categories={categories}
        canManage={canManageInterestedParties(org.roleCode)}
      />
    </div>
  );
}
