// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { IMPORT_TEMPLATES, type ImportEntity } from "@/lib/import-templates";

/**
 * Descarga de plantilla CSV por entidad — SOLO encabezados (Sprint 7.1.1:
 * se retira la fila de ejemplo con datos ficticios de empresa que traía
 * desde el Sprint 2, para no promover datos demo en ningún importador de
 * la app; mismo criterio que las plantillas de /imports desde el Sprint 7).
 * Sigue sirviendo las 5 entidades del importador de catálogos existente
 * (/catalog/import), sin tocar su lógica de validación/commit.
 */
export async function GET(request: NextRequest) {
  const entity = request.nextUrl.searchParams.get("entity") as ImportEntity | null;

  if (!entity || !IMPORT_TEMPLATES[entity]) {
    return NextResponse.json({ error: "Entidad no soportada" }, { status: 400 });
  }

  const header = IMPORT_TEMPLATES[entity];
  const csv = toCsv([header]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="plantilla_${entity}.csv"`,
    },
  });
}
