// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { IMPORT_TEMPLATES, type ImportEntity } from "@/lib/import-templates";

/** Descarga de plantilla CSV por entidad (solo encabezados + fila de ejemplo). */
export async function GET(request: NextRequest) {
  const entity = request.nextUrl.searchParams.get("entity") as ImportEntity | null;

  if (!entity || !IMPORT_TEMPLATES[entity]) {
    return NextResponse.json({ error: "Entidad no soportada" }, { status: 400 });
  }

  const header = IMPORT_TEMPLATES[entity];
  const example: Record<ImportEntity, string[]> = {
    suppliers: ["Recuperadora Ejemplo S.A.S.", "900123456", "correo@ejemplo.com"],
    product_families: ["Película flexible", "Familia de películas para empaque"],
    products: ["PEL-001", "Película calibre 3", "Película flexible", "30"],
    materials: ["PET posconsumo molido", "postconsumer_valid"],
    input_batches: [
      "LE-2026-001",
      "Recuperadora Ejemplo S.A.S.",
      "PET posconsumo molido",
      "postconsumer",
      "Centro de acopio norte",
      "2026-07-01",
      "1250.5",
      "Bodega 2",
      "Lote de prueba",
    ],
  };

  const csv = toCsv([header, example[entity]]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="plantilla_${entity}.csv"`,
    },
  });
}
