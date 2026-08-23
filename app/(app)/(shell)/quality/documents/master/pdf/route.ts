import { NextResponse } from "next/server";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { getCompanySettings } from "@/lib/db/settings";
import {
  loadQualityMasterList,
  readMasterFilters,
} from "@/lib/db/quality-master-list";
import {
  MASTER_COLUMNS,
  describeFilters,
  filterMasterList,
  masterListHeaders,
  masterListToRows,
} from "@/lib/domain/document-master-list";
import { renderMasterListPdf } from "@/lib/pdf/quality-documents";
import { loadCompanyLogoForPdf } from "@/lib/db/company-logo";

/**
 * Trazaloop Quality · QUALITY-02 · PDF de la Lista Maestra.
 *
 * Toma los MISMOS filtros que la pantalla —llegan por la URL— y los declara en
 * el encabezado del archivo. Una lista maestra impresa sin decir qué filtro se
 * aplicó es una lista que engaña: parece completa y no lo es.
 *
 * El guard es explícito: los layouts de Next no envuelven route handlers.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireQualityForAction();
  if (access.org === null) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const url = new URL(request.url);
  const filters = readMasterFilters(Object.fromEntries(url.searchParams.entries()));

  const [all, company, logo] = await Promise.all([
    loadQualityMasterList(access.org.organizationId),
    getCompanySettings(access.org.organizationId),
    // El logo se resuelve en SERVIDOR desde la empresa ya autorizada; si no
    // hay o no se puede incrustar, `null` y el PDF sale igual (§14).
    loadCompanyLogoForPdf(access.org.organizationId),
  ]);
  const rows = filterMasterList(all, filters);

  const pdf = renderMasterListPdf({
    organizationName: access.org.organizationName,
    logo: logo?.image ?? null,
    companyLegalName: company?.legalName ?? null,
    companyTaxId: company?.taxId ?? null,
    filtersCaption: describeFilters(filters),
    headers: masterListHeaders(),
    weights: MASTER_COLUMNS.map((c) => c.width),
    rows: masterListToRows(rows),
    totalCount: rows.length,
    generatedAt: new Date().toISOString(),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="lista-maestra-documentos.pdf"',
      "content-length": String(pdf.length),
      "cache-control": "no-store",
    },
  });
}
