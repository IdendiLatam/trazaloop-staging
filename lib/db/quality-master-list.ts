import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { listQualityMasterList } from "@/lib/db/document-control";
import type { MasterListFilters, MasterListRow } from "@/lib/domain/document-master-list";

/**
 * Trazaloop Quality · QUALITY-02 · Carga de la Lista Maestra.
 *
 * Vive aparte porque la comparten TRES consumidores —la pantalla, el PDF y el
 * CSV— y las tres deben ver exactamente el mismo conjunto de documentos. Si
 * cada una lo resolviera por su cuenta, tarde o temprano el PDF diría algo
 * distinto de lo que se ve en pantalla, que es justo lo que un sistema de
 * control documental no puede permitirse.
 */

/** Documentos de OTROS módulos que algún proceso de Quality referencia. */
async function listLinkedDocumentIds(organizationId: string): Promise<string[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_process_documents")
    .select("document_id")
    .eq("organization_id", organizationId);
  if (error || !data) return [];
  return [...new Set((data as { document_id: string }[]).map((r) => r.document_id))];
}

export async function loadQualityMasterList(organizationId: string): Promise<MasterListRow[]> {
  const linked = await listLinkedDocumentIds(organizationId);
  return listQualityMasterList(organizationId, linked);
}

/** Lee los filtros de la URL. Un valor ausente o «all» no filtra. */
export function readMasterFilters(
  params: Record<string, string | string[] | undefined>
): MasterListFilters {
  const one = (key: string): string | null => {
    const v = params[key];
    const value = Array.isArray(v) ? v[0] : v;
    return value && value.length > 0 ? value : null;
  };
  return {
    lifecycle: one("lifecycle"),
    category: one("category"),
    owner: one("owner"),
    reviewer: one("reviewer"),
    approver: one("approver"),
    process: one("process"),
    review: one("review"),
    origin: one("origin"),
    search: one("search"),
  };
}

/** Opciones de los desplegables, derivadas de lo que la empresa tiene de verdad. */
export function masterListFacets(rows: MasterListRow[]) {
  const owners = new Set<string>();
  const processes = new Set<string>();
  const origins = new Set<string>();
  for (const r of rows) {
    const owner = r.ownerPositionName ?? r.ownerName;
    if (owner) owners.add(owner);
    for (const p of r.processNames.split(",").map((s) => s.trim()).filter(Boolean)) {
      processes.add(p);
    }
    origins.add(r.moduleKey);
  }
  const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "es"));
  return { owners: sorted(owners), processes: sorted(processes), origins: sorted(origins) };
}
