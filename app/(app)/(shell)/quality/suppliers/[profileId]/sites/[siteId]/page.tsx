export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-07 · Una sede del proveedor.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { getSupplierFile } from "@/lib/db/quality-suppliers";
import { SupplierSiteView } from "@/components/domain/quality/suppliers/site-view";

export const metadata = { title: "Sede del proveedor" };

export default async function QualitySupplierSitePage(
  { params }: { params: Promise<{ profileId: string; siteId: string }> }
) {
  const { profileId, siteId } = await params;
  const org = await requireQualityModule();

  const file = await getSupplierFile(org.organizationId, profileId);
  if (!file) notFound();
  if (!file.sites.some((s) => s.id === siteId)) notFound();

  return (
    <div className="max-w-5xl">
      <SupplierSiteView file={file} siteId={siteId} />
    </div>
  );
}
