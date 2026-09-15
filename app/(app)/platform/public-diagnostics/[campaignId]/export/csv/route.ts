import { NextResponse } from "next/server";
import { checkPlatformStatus } from "@/lib/db/platform";
import { requireSession } from "@/lib/auth/require-session";
import { loadExportDataset } from "@/lib/db/public-diagnostic-admin";
import { csvTable, exportFilename } from "@/lib/domain/public-diagnostic-export";
import { toCsv } from "@/lib/csv";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01H · La campaña en CSV.
 *
 *
 * LA AUTORIZACIÓN SE COMPRUEBA AQUÍ, NO EN EL BOTÓN
 *
 * Un manejador de ruta no pasa por el layout de la consola: se alcanza
 * escribiendo la dirección. Así que comprueba sesión y superadministración por
 * su cuenta, y responde 403 en JSON — no redirige, porque quien pide esto
 * espera un fichero y una redirección a la portada se descargaría como un
 * `.csv` lleno de HTML.
 *
 * Y por debajo sigue la RLS de 0196: si esta comprobación se cayera, la
 * consulta devolvería cero filas en vez de la campaña entera.
 *
 *
 * BOM AL PRINCIPIO
 *
 * Sin él, Excel en Windows abre «Recicladora» como «RecicladoraÂ». Es el mismo
 * criterio que la exportación de la lista maestra, y por la misma razón: el
 * fichero se abre en Excel, no en un editor.
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
    // `readAllStrict` lanza cuando no pudo confirmar que leyó todo. Se prefiere
    // no entregar fichero antes que entregar uno corto que parece completo.
    return NextResponse.json(
      { error: "No se pudo leer la campaña completa. No se genera un archivo parcial." },
      { status: 503 });
  }
  if (!datos) {
    return NextResponse.json({ error: "Campaña no encontrada." }, { status: 404 });
  }

  const csv = toCsv(csvTable(datos));
  return new NextResponse(`﻿${csv}`, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        `attachment; filename="${exportFilename(datos.campaign.slug, "csv")}"`,
      "cache-control": "no-store",
    },
  });
}
