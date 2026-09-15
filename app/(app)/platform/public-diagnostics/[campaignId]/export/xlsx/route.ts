import { NextResponse } from "next/server";
import { checkPlatformStatus } from "@/lib/db/platform";
import { requireSession } from "@/lib/auth/require-session";
import { loadExportDataset } from "@/lib/db/public-diagnostic-admin";
import { workbookSheets, exportFilename } from "@/lib/domain/public-diagnostic-export";
import { buildXlsx } from "@/lib/xlsx";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01H · La campaña en Excel.
 *
 * Cuatro hojas —resumen, participantes, respuestas y dimensiones— y un `.xlsx`
 * de verdad, no un CSV con otra extensión: quien lo abra va a filtrar y
 * pivotar, y un CSV renombrado le pide a Excel que adivine separadores y
 * codificaciones cada vez.
 *
 * Misma puerta que el CSV, y por el mismo motivo: esto se alcanza escribiendo
 * la dirección.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  await requireSession();
  const { isSuperadmin } = await checkPlatformStatus();
  if (!isSuperadmin) {
    return NextResponse.json(
      { error: "Esta exportación es de la administración de plataforma." },
      { status: 403 });
  }

  const { campaignId } = await params;
  let datos;
  try {
    datos = await loadExportDataset(campaignId);
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer la campaña completa. No se genera un archivo parcial." },
      { status: 503 });
  }
  if (!datos) {
    return NextResponse.json({ error: "Campaña no encontrada." }, { status: 404 });
  }

  const libro = buildXlsx(workbookSheets(datos));
  return new NextResponse(new Uint8Array(libro), {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition":
        `attachment; filename="${exportFilename(datos.campaign.slug, "xlsx")}"`,
      "cache-control": "no-store",
    },
  });
}
