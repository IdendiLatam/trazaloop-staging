import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import {
  listDocuments,
  getDocument,
  type DocumentSummaryRow,
  type DocumentDetail,
} from "@/lib/db/trazadocs";

/**
 * Trazaloop Quality · QUALITY-01.1 · Espacio documental propio de Quality.
 *
 * REUTILIZA el motor TrazaDocs (0043–0048, transversal desde 0082) con
 * `module_key = 'quality'` FIJADO EN SERVIDOR. No hay una tabla
 * `quality_documents`: eso duplicaría `trazadoc_documents` sin ninguna
 * necesidad, y sería un segundo motor documental que mantener.
 *
 * La consecuencia práctica de apoyarse en el motor es la que pedía la decisión
 * de producto: una empresa que contrate ÚNICAMENTE Quality tiene documentación
 * completa —creación, secciones, estados, versionado— sin necesitar PCR ni
 * Textiles, porque nada de eso vive en el módulo CPR.
 *
 * Todo corre bajo RLS con la sesión real. Nada usa service_role.
 */

export const QUALITY_DOC_MODULE = "quality" as const;

/** Documentos PROPIOS de Quality (module_key = 'quality'). */
export async function listQualityDocuments(organizationId: string): Promise<DocumentSummaryRow[]> {
  return listDocuments(organizationId, QUALITY_DOC_MODULE);
}

/** Detalle de un documento propio de Quality. Nunca devuelve uno de otro módulo. */
export async function getQualityDocument(
  organizationId: string,
  documentId: string
): Promise<DocumentDetail | null> {
  return getDocument(organizationId, documentId, QUALITY_DOC_MODULE);
}

// ---------------------------------------------------------------------------
// Documentos VINCULADOS: nacieron en otro módulo y Quality los referencia
// ---------------------------------------------------------------------------

/**
 * Un documento vinculado NO es de Quality: pertenece a PCR, a Textiles o a
 * TrazaDocs transversal, y Quality solo lo referencia desde un proceso
 * (`quality_process_documents`, T-03). Distinguirlos importa: el usuario debe
 * saber que editar ese documento afecta también al módulo donde nació.
 */
export type LinkedDocumentRow = {
  documentId: string;
  title: string;
  code: string | null;
  status: string;
  /** Módulo de ORIGEN: 'cpr' | 'textiles' | 'quality'. */
  moduleKey: string;
  /** Procesos de Quality que lo referencian. */
  processes: { id: string; name: string; relationType: string }[];
};

export async function listDocumentsLinkedToQuality(
  organizationId: string
): Promise<LinkedDocumentRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_process_documents")
    .select(
      "document_id, relation_type, process_id, " +
        "trazadoc_documents!quality_process_documents_document_fk(title, code, status, module_key), " +
        "quality_processes!quality_process_documents_process_fk(name)"
    )
    .eq("organization_id", organizationId);
  if (error || !data) {
    console.error(
      `[quality] consulta fallida en listDocumentsLinkedToQuality: ${error?.code ?? "sin código"} · ${error?.message ?? "sin mensaje"}`
    );
    return [];
  }

  const byDocument = new Map<string, LinkedDocumentRow>();
  // El tipo inferido por PostgREST para un select con dos embeds es una unión
  // que incluye su forma de error; se normaliza a registro plano y el mapeo de
  // cada campo sigue siendo explícito.
  for (const r of data as unknown as Record<string, unknown>[]) {
    const doc = (r.trazadoc_documents ?? null) as {
      title?: string | null;
      code?: string | null;
      status?: string | null;
      module_key?: string | null;
    } | null;
    const proc = (r.quality_processes ?? null) as { name?: string | null } | null;
    const id = r.document_id as string;
    const existing = byDocument.get(id);
    const processEntry = {
      id: r.process_id as string,
      name: proc?.name ?? "—",
      relationType: r.relation_type as string,
    };
    if (existing) {
      existing.processes.push(processEntry);
      continue;
    }
    byDocument.set(id, {
      documentId: id,
      title: doc?.title ?? "Documento",
      code: doc?.code ?? null,
      status: doc?.status ?? "draft",
      moduleKey: doc?.module_key ?? "cpr",
      processes: [processEntry],
    });
  }

  return [...byDocument.values()].sort((a, b) => a.title.localeCompare(b.title, "es"));
}

/**
 * Documentos de la empresa que Quality PUEDE vincular: cualquiera de la misma
 * organización que el usuario tenga permiso de ver, venga del módulo que
 * venga. La RLS de 0043 ya limita la visibilidad a la empresa; aquí solo se
 * excluyen los obsoletos, que no tiene sentido asociar a un proceso vivo.
 */
export type LinkableDocumentRow = {
  id: string;
  title: string;
  code: string | null;
  status: string;
  moduleKey: string;
};

export async function listDocumentsLinkableFromQuality(
  organizationId: string
): Promise<LinkableDocumentRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_documents")
    .select("id, title, code, status, module_key")
    .eq("organization_id", organizationId)
    .neq("status", "obsolete")
    .order("title", { ascending: true });
  if (error || !data) {
    console.error(
      `[quality] consulta fallida en listDocumentsLinkableFromQuality: ${error?.code ?? "sin código"} · ${error?.message ?? "sin mensaje"}`
    );
    return [];
  }
  return data.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    code: (r.code as string | null) ?? null,
    status: r.status as string,
    moduleKey: (r.module_key as string | null) ?? "cpr",
  }));
}
