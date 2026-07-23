"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTextilesForAction } from "@/lib/auth/require-textiles-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkTextilesResourceLimit, checkTextilesCanMutate } from "@/server/actions/module-plans";
import {
  getBlueprintSections,
  insertDocument,
  insertDocumentSections,
  insertInitialVersion,
  updateSectionContentForDocument,
  changeDocumentStatus,
} from "@/lib/db/trazadocs";
import {
  getTextileTrazadocBlueprint,
  getTextileTrazadocDetail,
  findTextileTrazadocByBlueprint,
  findTextileTrazadocByTitle,
} from "@/lib/db/textiles-trazadocs";
import {
  buildSectionsFromBlueprint,
  buildInitialVersionSnapshot,
  normalizeDocumentTitle,
  resolveCategoryFromDocumentType,
  canCreateDocument,
  canEditDocument,
  canSubmitForReview,
  canApproveDocument,
  canMarkObsolete,
  canCreateDraftVersionFromApproved,
  isDocumentStatus,
  DUPLICATE_TITLE_MESSAGE,
  DUPLICATE_BLUEPRINT_MESSAGE,
  type DocumentStatus,
} from "@/lib/domain/trazadocs";

/**
 * Trazaloop · Sprint T8 (Textil) · Server actions de TrazaDocs Textil.
 *
 * REUTILIZA el motor TrazaDocs (mismos helpers de datos, misma RPC de
 * transición/versionado change_trazadoc_document_status, mismos roles del
 * dominio) con DOS diferencias deliberadas frente a las actions CPR:
 *  1. La guarda es la del módulo Textil (flag + organización activa +
 *     organization_modules.module_code = 'textiles').
 *  2. module_key = 'textiles' queda fijado EN SERVIDOR: el documento lo
 *     hereda de su estructura base vía trigger de 0082 y el cliente jamás
 *     lo envía. Toda mutación verifica primero (getTextileTrazadocDetail)
 *     que el documento sea Textil Y de la organización activa — un
 *     documento CPR nunca puede tocarse desde estas rutas.
 */

export type TextileTrazadocsActionState = {
  error: string | null;
  success?: boolean;
  documentId?: string;
};
const okState: TextileTrazadocsActionState = { error: null, success: true };

type GateOk = { organizationId: string; roleCode: string };

async function gate(): Promise<{ ok: GateOk | null; error: string | null }> {
  const access = await requireTextilesForAction();
  if (access.org === null) return { ok: null, error: access.error };
  return {
    ok: { organizationId: access.org.organizationId, roleCode: access.org.roleCode },
    error: null,
  };
}

function revalidateTextileTrazadocs(documentId?: string) {
  revalidatePath("/textiles/trazadocs");
  revalidatePath("/textiles");
  if (documentId) revalidatePath(`/textiles/trazadocs/${documentId}`);
}

// ---------------------------------------------------------------------------
// Crear documento desde estructura base textil
// ---------------------------------------------------------------------------

export async function createTextileTrazadocFromTemplateAction(
  _prev: TextileTrazadocsActionState,
  formData: FormData
): Promise<TextileTrazadocsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const { user } = await requireSession();

  if (!canCreateDocument(g.ok.roleCode as never)) {
    return { error: "Tu rol no permite crear documentos en TrazaDocs Textil." };
  }
  const mutateCheck = await checkTextilesCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  // Mismo límite de plan que TrazaDocs CPR: los documentos vivos cuentan
  // juntos, sin planes por módulo.
  const limitCheck = await checkTextilesResourceLimit("documents_trazadocs");
  if (!limitCheck.allowed) return { error: limitCheck.error };

  const blueprintId = String(formData.get("blueprint_id") ?? "");
  // La estructura debe ser TEXTIL (module fijo en servidor).
  const blueprint = await getTextileTrazadocBlueprint(blueprintId);
  if (!blueprint) {
    return { error: "La estructura base textil no existe o ya no está disponible." };
  }

  const existingFromBlueprint = await findTextileTrazadocByBlueprint(g.ok.organizationId, blueprint.id);
  if (existingFromBlueprint) {
    return { error: DUPLICATE_BLUEPRINT_MESSAGE, documentId: existingFromBlueprint.id };
  }
  const existingByTitle = await findTextileTrazadocByTitle(
    g.ok.organizationId,
    normalizeDocumentTitle(blueprint.name)
  );
  if (existingByTitle) {
    return { error: DUPLICATE_TITLE_MESSAGE, documentId: existingByTitle.id };
  }

  // Payload de confianza (patrón CPR): organization_id/created_by del
  // servidor; module_key lo hereda de la estructura vía trigger 0082.
  const { id: documentId, error: docError } = await insertDocument(g.ok.organizationId, {
    source_type: "suggested",
    blueprint_id: blueprint.id,
    title: blueprint.name.trim(),
    code: null,
    description: null,
    owner_id: user.id,
    category_code: resolveCategoryFromDocumentType(blueprint.documentType),
  });
  if (docError || !documentId) return { error: docError ?? "No fue posible crear el documento." };

  const blueprintSections = await getBlueprintSections(blueprint.id);
  const draftSections = buildSectionsFromBlueprint(blueprintSections);
  const { error: sectionsError } = await insertDocumentSections(g.ok.organizationId, documentId, draftSections);
  if (sectionsError) return { error: sectionsError };

  const initialSnapshot = buildInitialVersionSnapshot(
    { title: blueprint.name.trim(), code: null, description: null },
    draftSections.map((s) => ({
      sectionKey: s.sectionKey,
      title: s.title,
      content: s.content,
      sortOrder: s.sortOrder,
      isRequired: s.isRequired,
    }))
  );
  const { error: versionError } = await insertInitialVersion(g.ok.organizationId, documentId, initialSnapshot, user.id);
  if (versionError) return { error: versionError };

  revalidateTextileTrazadocs();
  redirect(`/textiles/trazadocs/${documentId}`);
}

// ---------------------------------------------------------------------------
// Editar secciones (borrador / en revisión, según rol)
// ---------------------------------------------------------------------------

export async function updateTextileTrazadocSectionsAction(
  _prev: TextileTrazadocsActionState,
  formData: FormData
): Promise<TextileTrazadocsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const mutateCheck = await checkTextilesCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const documentId = String(formData.get("document_id") ?? "");
  const doc = await getTextileTrazadocDetail(g.ok.organizationId, documentId);
  if (!doc) return { error: "El documento textil no existe o no pertenece a tu empresa." };
  if (!canEditDocument(g.ok.roleCode as never, doc.status as DocumentStatus)) {
    return { error: "Tu rol no permite editar este documento en su estado actual." };
  }

  const updates: { sectionId: string; content: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("section:")) {
      updates.push({ sectionId: key.slice("section:".length), content: String(value) });
    }
  }
  for (const u of updates) {
    // T8.1: amarre completo sección→documento→módulo — un sectionId
    // manipulado de OTRO documento (textil o CPR) de la misma
    // organización ya no puede editarse desde esta ruta.
    const { error } = await updateSectionContentForDocument({
      organizationId: g.ok.organizationId,
      documentId,
      sectionId: u.sectionId,
      moduleKey: "textiles",
      content: u.content,
    });
    if (error) return { error };
  }
  revalidateTextileTrazadocs(documentId);
  return { ...okState, documentId };
}

// ---------------------------------------------------------------------------
// Transiciones (misma RPC del motor: estado + versión atómicos)
// ---------------------------------------------------------------------------

async function textileTransition(
  g: GateOk,
  documentId: string,
  toStatus: DocumentStatus,
  note: string | null
): Promise<TextileTrazadocsActionState> {
  const mutateCheck = await checkTextilesCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };
  // El documento debe ser TEXTIL y de la organización activa — jamás un
  // documento CPR desde rutas textiles.
  const doc = await getTextileTrazadocDetail(g.organizationId, documentId);
  if (!doc) return { error: "El documento textil no existe o no pertenece a tu empresa." };

  const { newVersion, error } = await changeDocumentStatus(documentId, toStatus, note);
  if (error || newVersion == null) {
    return { error: error ?? "No fue posible cambiar el estado del documento." };
  }
  revalidateTextileTrazadocs(documentId);
  return { ...okState, documentId };
}

export async function submitTextileTrazadocForReviewAction(
  _prev: TextileTrazadocsActionState,
  formData: FormData
): Promise<TextileTrazadocsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canSubmitForReview(g.ok.roleCode as never, "draft")) {
    return { error: "Tu rol no permite enviar este documento a revisión." };
  }
  const documentId = String(formData.get("document_id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return textileTransition(g.ok, documentId, "in_review", note);
}

export async function approveTextileTrazadocAction(
  _prev: TextileTrazadocsActionState,
  formData: FormData
): Promise<TextileTrazadocsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  // Aprobación INTERNA (admin/calidad); nunca equivale a aprobación por
  // una entidad externa.
  if (!canApproveDocument(g.ok.roleCode as never)) {
    return { error: "Tu rol no permite aprobar documentos (aprueban administración o calidad)." };
  }
  const documentId = String(formData.get("document_id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return textileTransition(g.ok, documentId, "approved", note);
}

export async function obsoleteTextileTrazadocAction(
  _prev: TextileTrazadocsActionState,
  formData: FormData
): Promise<TextileTrazadocsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canMarkObsolete(g.ok.roleCode as never)) {
    return { error: "Tu rol no permite marcar este documento como obsoleto." };
  }
  const documentId = String(formData.get("document_id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return textileTransition(g.ok, documentId, "obsolete", note);
}

export async function createNewTextileTrazadocVersionAction(
  _prev: TextileTrazadocsActionState,
  formData: FormData
): Promise<TextileTrazadocsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canCreateDraftVersionFromApproved(g.ok.roleCode as never)) {
    return { error: "Solo administración o calidad pueden crear una nueva versión en borrador de un documento aprobado." };
  }
  const documentId = String(formData.get("document_id") ?? "");
  const note =
    String(formData.get("note") ?? "").trim() ||
    "Nueva versión en borrador creada a partir de documento aprobado.";
  return textileTransition(g.ok, documentId, "draft", note);
}

export async function saveTextileTrazadocVersionAction(
  _prev: TextileTrazadocsActionState,
  formData: FormData
): Promise<TextileTrazadocsActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const documentId = String(formData.get("document_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isDocumentStatus(status)) return { error: "Estado no válido." };
  if (!canEditDocument(g.ok.roleCode as never, status)) {
    return { error: "Tu rol no permite guardar una nueva versión de este documento." };
  }
  const note = String(formData.get("note") ?? "").trim() || "Cambios guardados.";
  return textileTransition(g.ok, documentId, status, note);
}
