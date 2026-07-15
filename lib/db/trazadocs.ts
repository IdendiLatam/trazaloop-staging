import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type {
  DocumentStatus,
  SourceType,
  BlueprintStatus,
  DocumentType,
  TrustedDocumentInsert,
  BlueprintSectionFacts,
} from "@/lib/domain/trazadocs";

/**
 * Trazaloop · Sprint 9 · Capa de datos de TrazaDocs (lado empresa).
 * Nada aquí usa service_role: todo corre con la sesión real, sujeta a las
 * RLS de 0043. Las transiciones de estado pasan SIEMPRE por la RPC
 * change_trazadoc_document_status (0046) — nunca por un UPDATE directo de
 * varias tablas desde el cliente.
 */

// ---------------------------------------------------------------------------
// Documentos.
// ---------------------------------------------------------------------------
export type DocumentSummaryRow = {
  organizationId: string;
  documentId: string;
  title: string;
  code: string | null;
  sourceType: SourceType;
  status: DocumentStatus;
  currentVersion: number;
  ownerName: string | null;
  createdByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  sectionsCount: number;
  filledSectionsCount: number;
  requiredSectionsCount: number;
  filledRequiredSectionsCount: number;
  updatedAt: string;
};

function mapSummaryRow(r: Record<string, unknown>): DocumentSummaryRow {
  return {
    organizationId: r.organization_id as string,
    documentId: r.document_id as string,
    title: r.title as string,
    code: (r.code as string | null) ?? null,
    sourceType: r.source_type as SourceType,
    status: r.status as DocumentStatus,
    currentVersion: Number(r.current_version ?? 1),
    ownerName: (r.owner_name as string | null) ?? null,
    createdByName: (r.created_by_name as string | null) ?? null,
    approvedByName: (r.approved_by_name as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    sectionsCount: Number(r.sections_count ?? 0),
    filledSectionsCount: Number(r.filled_sections_count ?? 0),
    requiredSectionsCount: Number(r.required_sections_count ?? 0),
    filledRequiredSectionsCount: Number(r.filled_required_sections_count ?? 0),
    updatedAt: r.updated_at as string,
  };
}

export async function listDocuments(orgId: string): Promise<DocumentSummaryRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_trazadoc_document_summary")
    .select("*")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapSummaryRow);
}

export type DocumentSectionRow = {
  id: string;
  blueprintSectionId: string | null;
  sectionKey: string;
  title: string;
  content: string;
  sortOrder: number;
  isRequired: boolean;
};

export type DocumentDetail = {
  id: string;
  organizationId: string;
  blueprintId: string | null;
  sourceType: SourceType;
  code: string | null;
  title: string;
  description: string | null;
  status: DocumentStatus;
  ownerId: string | null;
  currentVersion: number;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  obsoleteAt: string | null;
  createdAt: string;
  updatedAt: string;
  sections: DocumentSectionRow[];
};

export async function getDocument(orgId: string, documentId: string): Promise<DocumentDetail | null> {
  const supabase = await createServerClient();
  const [{ data: doc }, { data: sections }] = await Promise.all([
    supabase
      .from("trazadoc_documents")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", documentId)
      .maybeSingle(),
    supabase
      .from("trazadoc_document_sections")
      .select("id, blueprint_section_id, section_key, title, content, sort_order, is_required")
      .eq("organization_id", orgId)
      .eq("document_id", documentId)
      .order("sort_order", { ascending: true }),
  ]);
  if (!doc) return null;
  return {
    id: doc.id as string,
    organizationId: doc.organization_id as string,
    blueprintId: (doc.blueprint_id as string | null) ?? null,
    sourceType: doc.source_type as SourceType,
    code: (doc.code as string | null) ?? null,
    title: doc.title as string,
    description: (doc.description as string | null) ?? null,
    status: doc.status as DocumentStatus,
    ownerId: (doc.owner_id as string | null) ?? null,
    currentVersion: Number(doc.current_version ?? 1),
    createdBy: (doc.created_by as string | null) ?? null,
    approvedBy: (doc.approved_by as string | null) ?? null,
    approvedAt: (doc.approved_at as string | null) ?? null,
    obsoleteAt: (doc.obsolete_at as string | null) ?? null,
    createdAt: doc.created_at as string,
    updatedAt: doc.updated_at as string,
    sections: ((sections ?? []) as unknown as Record<string, unknown>[]).map((s) => ({
      id: s.id as string,
      blueprintSectionId: (s.blueprint_section_id as string | null) ?? null,
      sectionKey: s.section_key as string,
      title: s.title as string,
      content: (s.content as string) ?? "",
      sortOrder: Number(s.sort_order ?? 0),
      isRequired: Boolean(s.is_required),
    })),
  };
}

// ---------------------------------------------------------------------------
// Blueprints (lado empresa: solo lectura de estructuras ACTIVAS).
// ---------------------------------------------------------------------------
export type BlueprintSummaryRow = {
  blueprintId: string;
  code: string;
  name: string;
  description: string | null;
  documentType: DocumentType;
  status: BlueprintStatus;
  sectionsCount: number;
  requiredSectionsCount: number;
};

export async function listAvailableBlueprints(): Promise<BlueprintSummaryRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_trazadoc_blueprint_summary")
    .select("*")
    .eq("status", "active")
    .order("name", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    blueprintId: r.blueprint_id as string,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    documentType: r.document_type as DocumentType,
    status: r.status as BlueprintStatus,
    sectionsCount: Number(r.sections_count ?? 0),
    requiredSectionsCount: Number(r.required_sections_count ?? 0),
  }));
}

export async function getBlueprintSections(blueprintId: string): Promise<BlueprintSectionFacts[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("trazadoc_blueprint_sections")
    .select("id, section_key, title, hint, sort_order, is_required")
    .eq("blueprint_id", blueprintId)
    .eq("status", "active")
    .order("sort_order", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    sectionKey: r.section_key as string,
    title: r.title as string,
    hint: (r.hint as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    isRequired: Boolean(r.is_required),
  }));
}

export async function getBlueprintByIdForCompany(
  blueprintId: string
): Promise<{ id: string; name: string } | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("trazadoc_blueprints")
    .select("id, name")
    .eq("id", blueprintId)
    .eq("status", "active")
    .maybeSingle();
  return data ? { id: data.id as string, name: data.name as string } : null;
}

// ---------------------------------------------------------------------------
// Creación de documentos.
// ---------------------------------------------------------------------------
export async function insertDocument(
  orgId: string,
  payload: TrustedDocumentInsert
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_documents")
    .insert({ organization_id: orgId, ...payload })
    .select("id")
    .single();
  if (error || !data) return { id: null, error: "No fue posible crear el documento." };
  return { id: data.id as string, error: null };
}

export async function insertDocumentSections(
  orgId: string,
  documentId: string,
  sections: {
    blueprintSectionId: string | null;
    sectionKey: string;
    title: string;
    content: string;
    sortOrder: number;
    isRequired: boolean;
  }[]
): Promise<{ error: string | null }> {
  if (sections.length === 0) return { error: null };
  const supabase = await createServerClient();
  const { error } = await supabase.from("trazadoc_document_sections").insert(
    sections.map((s) => ({
      organization_id: orgId,
      document_id: documentId,
      blueprint_section_id: s.blueprintSectionId,
      section_key: s.sectionKey,
      title: s.title,
      content: s.content,
      sort_order: s.sortOrder,
      is_required: s.isRequired,
    }))
  );
  if (error) return { error: "No fue posible crear las secciones del documento." };
  return { error: null };
}

/**
 * Sprint 9.1 · Bloqueante 1: versión inicial real "v1 — Borrador inicial"
 * al crear un documento (antes quedaba current_version = 1 en la fila del
 * documento, pero SIN una fila real en trazadoc_document_versions). Un
 * INSERT normal (no la RPC): version_number=1 con status='draft' ya está
 * permitido para los 3 roles por la RLS existente
 * (trazadoc_document_versions_insert, 0043) — no hace falta una RPC
 * nueva. Idempotente: si ya existe v1 (unique(document_id,version_number)),
 * el conflicto se trata como éxito silencioso, nunca como error.
 */
export async function insertInitialVersion(
  orgId: string,
  documentId: string,
  snapshot: { document: { title: string; code: string | null; description: string | null }; sections: unknown[] },
  userId: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.from("trazadoc_document_versions").insert({
    organization_id: orgId,
    document_id: documentId,
    version_number: 1,
    status: "draft",
    snapshot,
    change_note: "Borrador inicial",
    created_by: userId,
  });
  if (error) {
    const duplicate = (error as { code?: string }).code === "23505";
    if (duplicate) return { error: null }; // v1 ya existía: no duplicar, no es un error.
    return { error: "No fue posible registrar la versión inicial del documento." };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Edición.
// ---------------------------------------------------------------------------
export async function updateDocumentMetadata(
  orgId: string,
  documentId: string,
  input: { title: string; code: string | null; description: string | null; ownerId: string | null }
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_documents")
    .update({ title: input.title, code: input.code, description: input.description, owner_id: input.ownerId })
    .eq("organization_id", orgId)
    .eq("id", documentId)
    .select("id");
  if (error) return { error: "No fue posible guardar los datos del documento." };
  if ((data ?? []).length === 0) return { error: "Tu rol no permite editar este documento en su estado actual." };
  return { error: null };
}

export async function updateSectionContent(
  orgId: string,
  sectionId: string,
  content: string
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_document_sections")
    .update({ content })
    .eq("organization_id", orgId)
    .eq("id", sectionId)
    .select("id");
  if (error) return { error: "No fue posible guardar la sección." };
  if ((data ?? []).length === 0) {
    return { error: "Tu rol no permite editar esta sección en el estado actual del documento." };
  }
  return { error: null };
}

export async function insertCustomSection(
  orgId: string,
  documentId: string,
  section: { sectionKey: string; title: string; content: string; sortOrder: number; isRequired: boolean }
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.from("trazadoc_document_sections").insert({
    organization_id: orgId,
    document_id: documentId,
    blueprint_section_id: null,
    section_key: section.sectionKey,
    title: section.title,
    content: section.content,
    sort_order: section.sortOrder,
    is_required: section.isRequired,
  });
  if (error) {
    const duplicate = (error as { code?: string }).code === "23505";
    return {
      error: duplicate
        ? "Ya existe una sección con ese nombre en este documento."
        : "No fue posible agregar la sección.",
    };
  }
  return { error: null };
}

export async function deleteSection(orgId: string, sectionId: string): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_document_sections")
    .delete()
    .eq("organization_id", orgId)
    .eq("id", sectionId)
    .select("id");
  if (error) return { error: "No fue posible eliminar la sección." };
  if ((data ?? []).length === 0) return { error: "Solo se pueden eliminar secciones de un documento en borrador." };
  return { error: null };
}

export async function reorderSections(
  orgId: string,
  sections: { id: string; sortOrder: number }[]
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  for (const s of sections) {
    const { error } = await supabase
      .from("trazadoc_document_sections")
      .update({ sort_order: s.sortOrder })
      .eq("organization_id", orgId)
      .eq("id", s.id);
    if (error) return { error: "No fue posible reordenar las secciones." };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Transición de estado (RPC atómica, 0046).
// ---------------------------------------------------------------------------
export async function changeDocumentStatus(
  documentId: string,
  toStatus: DocumentStatus,
  changeNote: string | null
): Promise<{ newVersion: number | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("change_trazadoc_document_status", {
    p_document_id: documentId,
    p_to_status: toStatus,
    p_change_note: changeNote,
  });
  if (error || data == null) {
    return { newVersion: null, error: error?.message ?? "No fue posible cambiar el estado del documento." };
  }
  return { newVersion: Number(data), error: null };
}

// ---------------------------------------------------------------------------
// Versiones.
// ---------------------------------------------------------------------------
export type DocumentVersionRow = {
  id: string;
  versionNumber: number;
  status: DocumentStatus;
  changeNote: string | null;
  createdByName: string | null;
  createdAt: string;
};

export async function listDocumentVersions(orgId: string, documentId: string): Promise<DocumentVersionRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("trazadoc_document_versions")
    .select(
      "id, version_number, status, change_note, created_at, author:profiles!trazadoc_document_versions_created_by_fkey(full_name)"
    )
    .eq("organization_id", orgId)
    .eq("document_id", documentId)
    .order("version_number", { ascending: false });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const author = (r.author ?? null) as { full_name: string | null } | null;
    return {
      id: r.id as string,
      versionNumber: Number(r.version_number),
      status: r.status as DocumentStatus,
      changeNote: (r.change_note as string | null) ?? null,
      createdByName: author?.full_name ?? null,
      createdAt: r.created_at as string,
    };
  });
}

export type DocumentVersionDetail = DocumentVersionRow & {
  snapshot: {
    document: { title: string; code: string | null; description: string | null };
    sections: { section_key: string; title: string; content: string; sort_order: number; is_required: boolean }[];
  };
};

export async function getDocumentVersion(orgId: string, versionId: string): Promise<DocumentVersionDetail | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("trazadoc_document_versions")
    .select(
      "id, version_number, status, change_note, created_at, snapshot, author:profiles!trazadoc_document_versions_created_by_fkey(full_name)"
    )
    .eq("organization_id", orgId)
    .eq("id", versionId)
    .maybeSingle();
  if (!data) return null;
  const author = (data.author ?? null) as unknown as { full_name: string | null } | null;
  return {
    id: data.id as string,
    versionNumber: Number(data.version_number),
    status: data.status as DocumentStatus,
    changeNote: (data.change_note as string | null) ?? null,
    createdByName: author?.full_name ?? null,
    createdAt: data.created_at as string,
    snapshot: data.snapshot as DocumentVersionDetail["snapshot"],
  };
}
