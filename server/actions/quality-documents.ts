"use server";

import { revalidatePath } from "next/cache";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  insertDocument,
  insertDocumentSections,
  insertInitialVersion,
  updateSectionContentForDocument,
  changeDocumentStatus,
  updateDocumentMetadata,
} from "@/lib/db/trazadocs";
import { getQualityDocument, QUALITY_DOC_MODULE } from "@/lib/db/quality-documents";
import { isQualityDocumentCategory } from "@/lib/domain/quality-documents";
import {
  buildInitialVersionSnapshot,
  canCreateDocument,
  canEditDocument,
  canSubmitForReview,
  canApproveDocument,
  canMarkObsolete,
  isDocumentStatus,
  type DocumentStatus,
} from "@/lib/domain/trazadocs";

/**
 * Trazaloop Quality · QUALITY-01.1 · Server actions del espacio documental.
 *
 * Mismo motor que TrazaDocs de CPR y de Textiles; mismas RPC de transición y
 * versionado; mismos roles del dominio. Tres diferencias deliberadas:
 *
 *  1. La guarda es la del módulo Quality (kill switch + empresa activa +
 *     habilitación comercial). Una empresa que solo tenga Quality opera aquí
 *     sin necesitar CPR ni Textiles — ese era el objetivo.
 *  2. `module_key = 'quality'` se fija EN SERVIDOR y jamás llega del cliente.
 *  3. Toda mutación comprueba primero, con getQualityDocument, que el
 *     documento sea de Quality Y de la empresa activa: un documento de PCR
 *     nunca puede tocarse desde estas rutas, ni siquiera conociendo su id.
 */

export type QualityDocumentActionState = {
  error: string | null;
  success?: boolean;
  documentId?: string;
};

const PATH_DOCS = "/quality/documents";

type GateOk = { organizationId: string; roleCode: string };

async function gate(): Promise<{ ok: GateOk | null; error: string | null }> {
  const access = await requireQualityForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutateCheck = await checkQualityCanMutate();
  if (!mutateCheck.allowed) return { ok: null, error: mutateCheck.error };
  return {
    ok: { organizationId: access.org.organizationId, roleCode: access.org.roleCode },
    error: null,
  };
}

function revalidateDocs(documentId?: string) {
  revalidatePath(PATH_DOCS);
  revalidatePath("/quality");
  if (documentId) revalidatePath(`${PATH_DOCS}/${documentId}`);
}

/** Secciones de partida de un documento de Quality creado desde cero. */
const DEFAULT_SECTIONS = [
  { key: "purpose", title: "Objetivo", hint: "Para qué existe este documento." },
  { key: "scope", title: "Alcance", hint: "A qué aplica y qué queda fuera." },
  { key: "responsibilities", title: "Responsabilidades", hint: "Qué cargo responde por cada parte." },
  { key: "development", title: "Desarrollo", hint: "El contenido propiamente dicho." },
  { key: "records", title: "Registros", hint: "Qué evidencia queda de su aplicación." },
] as const;

// ---------------------------------------------------------------------------
// Crear
// ---------------------------------------------------------------------------

export async function createQualityDocumentAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const { user } = await requireSession();

  if (!canCreateDocument(g.ok.roleCode as never)) {
    return { error: "Tu rol no permite crear documentos en Quality." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (title.length === 0) return { error: "Escribe un título para el documento." };
  if (title.length > 200) return { error: "El título no puede superar 200 caracteres." };

  const code = String(formData.get("code") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const rawCategory = String(formData.get("category_code") ?? "procedure");
  const category = isQualityDocumentCategory(rawCategory) ? rawCategory : "other";

  const { id, error } = await insertDocument(g.ok.organizationId, {
    source_type: "custom",
    blueprint_id: null,
    title,
    code,
    description,
    owner_id: user.id,
    category_code: category,
    // Fijado en SERVIDOR. El cliente no envía el módulo y, aunque lo enviara,
    // no llega hasta aquí: este objeto se construye entero en el servidor.
    module_key: QUALITY_DOC_MODULE,
  });
  if (error || !id) return { error: error ?? "No fue posible crear el documento." };

  const sections = DEFAULT_SECTIONS.map((s, i) => ({
    blueprintSectionId: null,
    sectionKey: s.key,
    title: s.title,
    content: "",
    sortOrder: i + 1,
    isRequired: i < 2,
  }));
  await insertDocumentSections(g.ok.organizationId, id, sections);
  await insertInitialVersion(
    g.ok.organizationId,
    id,
    buildInitialVersionSnapshot({ title, code, description }, sections),
    user.id
  );

  revalidateDocs(id);
  return { error: null, success: true, documentId: id };
}

// ---------------------------------------------------------------------------
// Editar
// ---------------------------------------------------------------------------

export async function updateQualityDocumentSectionAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const doc = await getQualityDocument(g.ok.organizationId, documentId);
  if (!doc) return { error: "El documento no existe o no pertenece a Quality." };
  if (!canEditDocument(g.ok.roleCode as never, doc.status as DocumentStatus)) {
    return { error: "Este documento no se puede editar en su estado actual." };
  }

  // Todas las secciones se envían juntas: se guardan una a una, y basta con
  // que una falle para no dar por buena la operación entera.
  for (const section of doc.sections) {
    // El editor reutilizado nombra sus campos `section:<id>`.
    const raw = formData.get(`section:${section.id}`);
    if (raw === null) continue;
    const { error } = await updateSectionContentForDocument({
      organizationId: g.ok.organizationId,
      documentId,
      sectionId: section.id,
      moduleKey: QUALITY_DOC_MODULE,
      content: String(raw),
    });
    if (error) return { error };
  }

  revalidateDocs(documentId);
  return { error: null, success: true };
}

export async function updateQualityDocumentMetadataAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const doc = await getQualityDocument(g.ok.organizationId, documentId);
  if (!doc) return { error: "El documento no existe o no pertenece a Quality." };
  if (!canEditDocument(g.ok.roleCode as never, doc.status as DocumentStatus)) {
    return { error: "Este documento no se puede editar en su estado actual." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (title.length === 0) return { error: "Escribe un título para el documento." };

  const { error } = await updateDocumentMetadata(
    g.ok.organizationId,
    documentId,
    {
      title,
      code: String(formData.get("code") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      // El propietario no se cambia desde esta pantalla: se conserva el que
      // tiene el documento.
      ownerId: doc.ownerId ?? null,
    },
    QUALITY_DOC_MODULE
  );
  if (error) return { error };

  revalidateDocs(documentId);
  return { error: null, success: true };
}

// ---------------------------------------------------------------------------
// Estados — misma RPC de transición y versionado que el resto de TrazaDocs
// ---------------------------------------------------------------------------

async function changeStatus(
  formData: FormData,
  toStatus: DocumentStatus,
  allowed: (roleCode: string, status: DocumentStatus) => boolean,
  denial: string
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const doc = await getQualityDocument(g.ok.organizationId, documentId);
  if (!doc) return { error: "El documento no existe o no pertenece a Quality." };
  if (!isDocumentStatus(doc.status)) return { error: "El documento tiene un estado no válido." };
  if (!allowed(g.ok.roleCode, doc.status)) return { error: denial };

  const note = String(formData.get("change_note") ?? "").trim() || null;
  const { error } = await changeDocumentStatus(documentId, toStatus, note);
  if (error) return { error: "No fue posible cambiar el estado del documento." };

  revalidateDocs(documentId);
  return { error: null, success: true };
}

export async function submitQualityDocumentForReviewAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  return changeStatus(
    formData,
    "in_review",
    (role, status) => canSubmitForReview(role as never, status),
    "Este documento no puede enviarse a revisión en su estado actual."
  );
}

export async function approveQualityDocumentAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  return changeStatus(
    formData,
    "approved",
    (role) => canApproveDocument(role as never),
    "Solo la administración o el área de calidad pueden aprobar un documento."
  );
}

export async function obsoleteQualityDocumentAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  return changeStatus(
    formData,
    "obsolete",
    (role) => canMarkObsolete(role as never),
    "Tu rol no permite marcar un documento como obsoleto."
  );
}
