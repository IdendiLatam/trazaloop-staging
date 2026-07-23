import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { CPR_MODULE_CODE, TEXTILES_MODULE_CODE } from "@/lib/modules/catalog";
import {
  interpretModuleUsageRow,
  type ModuleUsageFailureReason,
  type ModuleUsageResult,
  type OrganizationModuleUsage,
} from "@/lib/db/module-usage-shared";

export {
  interpretModuleUsageRow,
  type ModuleUsageFailureReason,
  type ModuleUsageResult,
  type OrganizationModuleUsage,
} from "@/lib/db/module-usage-shared";


/**
 * Trazaloop · T9F.1/T9F.2 · Uso REAL por MÓDULO (conteos + almacenamiento),
 * con resultado TIPADO y FAIL-CLOSED.
 *
 * Lee v_organization_module_usage (migración 0101, corregida en T9F.2): una
 * fila por (organización, módulo funcional) con los conteos de recursos y los
 * bytes de almacenamiento ATRIBUIDOS al módulo, contando OBJETOS FÍSICOS
 * deduplicados por (bucket, ruta):
 *
 *  · CPR (traceability_6632): evidences (bucket "evidences") +
 *    trazadoc_file_documents + trazadoc_file_document_versions (bucket
 *    "trazadocs-documents", el archivo actual y TODAS las versiones
 *    históricas que conservan objeto) + candidatos huérfanos registrados
 *    (storage_orphan_candidates). Un mismo objeto referenciado por la fila
 *    actual y por una o varias versiones se cuenta UNA sola vez.
 *  · Textiles: textile_evidences.file_path (bucket "evidences", prefijo
 *    {org}/textiles/…) + candidatos huérfanos del módulo. Las evidencias
 *    archivadas conservan fila y objeto: siguen contando.
 *  · GLOBAL (no atribuido): organizations.logo_size_bytes.
 *
 * T9F.2 · Bloqueador 3 (fail-closed): esta capa YA NO devuelve null ni 0
 * ante errores. Devuelve un resultado discriminado: {ok:true, usage} solo
 * cuando la consulta fue EXITOSA y los valores son válidos (finitos, >= 0);
 * en cualquier otro caso {ok:false, reason} y los llamadores BLOQUEAN la
 * operación (cargas y límites). Solo un resultado verificado puede reportar
 * uso igual a cero.
 *
 * storageObjectConflicts: número de objetos físicos del módulo con tamaños
 * CONTRADICTORIOS entre referencias (misma bucket+ruta, size distinto). El
 * uso reportado toma el MÁXIMO por objeto (conservador: nunca subestima),
 * pero mientras existan conflictos las AUTORIZACIONES de carga fallan
 * cerradas (dato inconsistente) — decisión documentada en el informe T9F.2.
 */

/** Uso VERIFICADO del módulo para la organización indicada (fail-closed).
 *  Server-only, bajo la sesión real (la vista embebe la guarda
 *  is_org_member(...) or is_platform_staff(), patrón 0052). */
export async function fetchOrganizationModuleUsage(
  organizationId: string,
  moduleCode: string
): Promise<ModuleUsageResult> {
  if (moduleCode !== CPR_MODULE_CODE && moduleCode !== TEXTILES_MODULE_CODE) {
    return { ok: false, reason: "source_unavailable" };
  }
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("v_organization_module_usage")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("module_code", moduleCode)
      .maybeSingle();
    if (error) {
      // 42P01 = la vista no existe (0101 sin aplicar): fuente no disponible.
      const code = (error as { code?: string }).code;
      return { ok: false, reason: code === "42P01" ? "source_unavailable" : "query_failed" };
    }
    // Para un miembro (o staff) la vista SIEMPRE tiene una fila por módulo
    // funcional; su ausencia sin error es una fuente no disponible, jamás
    // "uso cero".
    return interpretModuleUsageRow(data as Record<string, unknown> | null);
  } catch {
    return { ok: false, reason: "query_failed" };
  }
}

/** Uso de TODOS los módulos funcionales (una consulta), para pantallas de
 *  plataforma. Fail-closed: ante error devuelve ok:false y la interfaz
 *  muestra "—" (nunca un 0 inventado). */
export async function fetchAllOrganizationModuleUsage(
  organizationId: string
): Promise<{ ok: true; usages: OrganizationModuleUsage[] } | { ok: false; reason: ModuleUsageFailureReason }> {
  try {
    const supabase = await createServerClient();
    const { data, error } = await supabase
      .from("v_organization_module_usage")
      .select("*")
      .eq("organization_id", organizationId);
    if (error) {
      const code = (error as { code?: string }).code;
      return { ok: false, reason: code === "42P01" ? "source_unavailable" : "query_failed" };
    }
    const usages: OrganizationModuleUsage[] = [];
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const r = interpretModuleUsageRow(row);
      if (!r.ok) return { ok: false, reason: r.reason };
      usages.push(r.usage);
    }
    return { ok: true, usages };
  } catch {
    return { ok: false, reason: "query_failed" };
  }
}
