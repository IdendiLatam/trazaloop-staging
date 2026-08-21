import { NextResponse } from "next/server";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { loadQualityMasterList, readMasterFilters } from "@/lib/db/quality-master-list";
import {
  filterMasterList,
  masterListHeaders,
  masterListToRows,
} from "@/lib/domain/document-master-list";
import { toCsv } from "@/lib/csv";

/**
 * Trazaloop Quality · QUALITY-02 · CSV de la Lista Maestra.
 *
 * El encargo pide preservar la exportación de datos que ya existía en el
 * maestro documental de PCR; aquí es la misma idea sobre la lista de Quality,
 * con exactamente las mismas columnas y los mismos filtros que el PDF y la
 * pantalla (una sola definición de columnas, en el dominio).
 *
 * BOM UTF-8 al principio: sin él, Excel en Windows abre «Revisión» como
 * «RevisiÃ³n», y el archivo deja de servir para lo único que se usa.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requireQualityForAction();
  if (access.org === null) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }

  const url = new URL(request.url);
  const filters = readMasterFilters(Object.fromEntries(url.searchParams.entries()));
  const rows = filterMasterList(await loadQualityMasterList(access.org.organizationId), filters);

  const csv = toCsv([masterListHeaders(), ...masterListToRows(rows)]);
  const body = `﻿${csv}`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="lista-maestra-documentos.csv"',
      "cache-control": "no-store",
    },
  });
}
