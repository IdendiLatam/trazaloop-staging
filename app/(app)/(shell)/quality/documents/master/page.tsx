// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-02 · Lista Maestra de documentos.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  loadQualityMasterList,
  masterListFacets,
  readMasterFilters,
} from "@/lib/db/quality-master-list";
import { filterMasterList } from "@/lib/domain/document-master-list";
import { QualityMasterListView } from "@/components/domain/quality/master-list-view";

export const metadata = { title: "Lista Maestra" };

export default async function QualityMasterListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const org = await requireQualityModule();
  const params = await searchParams;
  const filters = readMasterFilters(params);

  const all = await loadQualityMasterList(org.organizationId);
  const rows = filterMasterList(all, filters);
  const facets = masterListFacets(all);

  return (
    <QualityMasterListView
      rows={rows}
      filters={filters}
      owners={facets.owners}
      processes={facets.processes}
      origins={facets.origins}
      totalBeforeFilters={all.length}
    />
  );
}
