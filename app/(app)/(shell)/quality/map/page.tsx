// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-01 · Mapa de procesos.
//
// Un mapa es una vista versionada: se arma en borrador y se publica. La
// versión publicada es la oficial y deja de ser editable. ?version= permite
// consultar una versión anterior tal como se publicó.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getDefaultQualityMapId,
  getQualityMapDetail,
  listQualityCategories,
  listQualityMaps,
  listQualityProcesses,
} from "@/lib/db/quality-processes";
import { canPublishQuality } from "@/lib/domain/quality-processes";
import { QualityMapView } from "@/components/domain/quality/map-view";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

export const metadata = { title: "Mapa de procesos" };

export default async function QualityMapPage({
  searchParams,
}: {
  searchParams: Promise<{ map?: string; version?: string }>;
}) {
  const org = await requireQualityModule();
  const { map: mapParam, version } = await searchParams;

  const [maps, categories, processes] = await Promise.all([
    listQualityMaps(org.organizationId),
    listQualityCategories(),
    listQualityProcesses(org.organizationId),
  ]);

  const mapId = mapParam ?? (await getDefaultQualityMapId(org.organizationId));
  const detail = mapId ? await getQualityMapDetail(org.organizationId, mapId, version) : null;
  // §76 · Sin mapa no se ofrece la descarga: un botón que devuelve 404 parece
  // un fallo del programa, no una empresa que todavía no ha dibujado su mapa.
  const hasMap = detail !== null;

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Mapa de procesos</h1>
        <ExportPdfButton
          exportKey="quality.map.detail"
          disabled={!hasMap}
          disabledReason="todavía no hay mapa"
        />
        <p className="text-sm text-ink-soft">
          Los procesos organizados por categoría y el flujo real entre ellos. Cada bloque es un
          proceso del sistema, no una figura suelta, y cada flecha sale de una relación ya
          registrada —qué salida alimenta qué entrada—, no de un trazo hecho a mano.
        </p>
      </header>

      <QualityMapView
        maps={maps}
        detail={detail}
        categories={categories}
        processes={processes}
        canPublish={canPublishQuality(org.roleCode)}
      />
    </div>
  );
}
