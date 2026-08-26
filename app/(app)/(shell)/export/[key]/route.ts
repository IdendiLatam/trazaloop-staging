import { NextResponse } from "next/server";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { requireSession } from "@/lib/auth/require-session";
import { resolveModuleAccessForOrg } from "@/lib/db/module-access";
import {
  CPR_MODULE_CODE, QUALITY_MODULE_CODE, TEXTILES_MODULE_CODE,
} from "@/lib/modules/catalog";
import { findExportDefinition } from "@/lib/export/registry";
import { renderPrintDocument } from "@/lib/export/render";
import { buildFilename, pdfHeaders } from "@/lib/export/filename";
import { validateFilters } from "@/lib/export/filters";
import type { ExportModule } from "@/lib/export/registry-types";

/**
 * Trazaloop · EXPORT-01 · El ÚNICO endpoint de descarga.
 *
 * Un endpoint para toda la plataforma en vez de ochenta rutas escritas a mano.
 * Eso solo es seguro si el navegador no puede decidir nada más que QUÉ
 * exportación quiere, de una lista cerrada.
 *
 * LO QUE EL CLIENTE PUEDE MANDAR
 *
 *   · una CLAVE del registro                   → si no está, 404
 *   · un identificador de entidad              → se comprueba contra la empresa
 *   · filtros DECLARADOS por esa exportación   → los demás se descartan
 *
 * LO QUE NO PUEDE MANDAR (§17)
 *
 *   · una tabla, una consulta, SQL
 *   · HTML
 *   · una URL de logo ni de nada
 *   · un `organization_id`
 *
 * La empresa sale de la SESIÓN, nunca de la petición. Manipular la URL no
 * cambia de empresa: no cambia de nada.
 *
 * EL GUARD VA EXPLÍCITO AQUÍ. Los layouts de Next no envuelven a los route
 * handlers, así que la protección que aplica a las páginas no alcanza a este
 * archivo. Sin estas comprobaciones, este sería el agujero más grande de la
 * plataforma: un PDF de cualquier cosa de cualquier empresa.
 */
export const dynamic = "force-dynamic";

/** Qué entitlement exige cada módulo. `core` no exige ninguno. */
const MODULE_CODE: Record<ExportModule, string | null> = {
  quality: QUALITY_MODULE_CODE,
  trazadocs: CPR_MODULE_CODE,
  cpr: CPR_MODULE_CODE,
  textiles: TEXTILES_MODULE_CODE,
  core: null,
};

/**
 * Rol mínimo. La RLS vuelve a comprobarlo todo al leer los datos: esto es la
 * primera puerta, no la única (§49). Un PDF nunca concede permisos nuevos.
 */
function roleAllows(permission: string, role: string): boolean {
  if (permission === "governor") return role === "admin" || role === "quality";
  return role === "admin" || role === "quality" || role === "consultant";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  const definition = findExportDefinition(key);
  // Una clave inventada responde igual que una entidad inexistente: no se
  // confirma ni se niega qué exportaciones existen (§72).
  if (!definition) {
    return NextResponse.json({ error: "No se encontró lo que pediste." }, { status: 404 });
  }

  const org = await requireActiveOrg();
  const { user } = await requireSession();

  // ENTITLEMENT ≠ AUTORIZACIÓN (§51). Conocer el identificador de un lote de
  // PCR no da acceso a PCR si la empresa no tiene ese módulo.
  const moduleCode = MODULE_CODE[definition.module];
  if (moduleCode) {
    const access = await resolveModuleAccessForOrg(org.organizationId, moduleCode);
    if (!access.allowed) {
      return NextResponse.json(
        { error: "Este módulo no está disponible para tu empresa." },
        { status: 403 }
      );
    }
  }

  if (!roleAllows(definition.permission, org.roleCode)) {
    return NextResponse.json(
      { error: "Tu rol no permite descargar este registro." },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  // Solo los filtros que ESTA exportación declara. Lo demás se descarta sin
  // avisar: un parámetro desconocido no es un error del usuario, es ruido.
  const filters = validateFilters(definition, Object.fromEntries(url.searchParams.entries()));

  let result;
  try {
    result = await definition.load({
      organizationId: org.organizationId,
      roleCode: org.roleCode,
      userId: user.id,
      id,
      filters,
      generatedAt: new Date().toISOString(),
      generatedByName: null,
    });
  } catch {
    // Un fallo al cargar no puede filtrar el motivo: «no existe» y «no es de tu
    // empresa» tienen que responderse igual.
    return NextResponse.json({ error: "No fue posible generar el documento." }, { status: 500 });
  }

  if (!result) {
    return NextResponse.json({ error: "No se encontró lo que pediste." }, { status: 404 });
  }

  // EXPORT-01.2 (§6) · El nombre documental lo pone el REGISTRO, no el
  // adaptador. Aquí es donde se une: el adaptador entregó un borrador sin
  // nombre —su tipo se lo impide— y esta línea lo completa. Un adaptador no
  // puede inventarse el encabezado ni olvidarlo.
  const bytes = result.buffer
    ?? (result.document
      ? renderPrintDocument({ ...result.document, documentName: definition.documentName })
      : null);
  if (!bytes) {
    return NextResponse.json({ error: "No fue posible generar el documento." }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: pdfHeaders(buildFilename(result.filenameParts), bytes.length),
  });
}
