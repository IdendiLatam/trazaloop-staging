"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { requireSession } from "@/lib/auth/require-session";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { checkResourceLimit, checkOrganizationCanMutate } from "@/server/actions/plans";
import { findFileDocumentByNormalizedTitle } from "@/lib/db/trazadocs-master";
import { DUPLICATE_MASTER_TITLE_MESSAGE } from "@/lib/domain/trazadocs-master";
import {
  listDocuments,
  getDocument,
  listAvailableBlueprints,
  getBlueprintSections,
  getBlueprintByIdForCompany,
  insertDocument,
  insertDocumentSections,
  insertInitialVersion,
  findDocumentByNormalizedTitle,
  findDocumentByBlueprint,
  deleteDocument,
  updateDocumentMetadata,
  updateSectionContentForDocument,
  getDocumentFacts,
  insertCustomSection,
  deleteSection,
  reorderSections,
  changeDocumentStatus,
  listDocumentVersions,
  getDocumentVersion,
  type DocumentSummaryRow,
  type DocumentDetail,
  type BlueprintSummaryRow,
  type DocumentVersionRow,
  type DocumentVersionDetail,
} from "@/lib/db/trazadocs";
import {
  listAllBlueprintsForPlatform,
  getPlatformBlueprintDetail,
  insertBlueprint,
  updateBlueprint,
  updateBlueprintStatus,
  insertBlueprintSection,
  updateBlueprintSection,
  updateBlueprintSectionStatus,
  reorderBlueprintSections,
  type PlatformBlueprintRow,
  type PlatformBlueprintDetail,
} from "@/lib/db/trazadocs-platform";
import {
  canCreateDocument,
  canEditDocument,
  canSubmitForReview,
  canApproveDocument,
  canMarkObsolete,
  canReactivateDocument,
  canCreateDraftVersionFromApproved,
  canDeleteSection,
  canDeleteDraftDocument,
  canEditBlueprint,
  buildSectionsFromBlueprint,
  buildInitialVersionSnapshot,
  buildDocumentEditPath,
  buildCustomDocumentInsertPayload,
  buildSuggestedDocumentInsertPayload,
  validateCustomDocumentInput,
  validateCustomSectionInput,
  normalizeDocumentTitle,
  DUPLICATE_TITLE_MESSAGE,
  DUPLICATE_BLUEPRINT_MESSAGE,
  slugifySectionKey,
  isDocumentStatus,
  isBlueprintStatus,
  resolveTrazadocsChecklistStatus,
  type DocumentStatus,
  type DocumentType,
} from "@/lib/domain/trazadocs";

/**
 * Trazaloop · Sprint 9 · Server actions de TrazaDocs.
 *
 * organization_id SIEMPRE sale de requireActiveOrg() (nunca del cliente).
 * Las transiciones de estado pasan por change_trazadoc_document_status
 * (0046), nunca por varias escrituras sueltas. Sin service_role. Los
 * blueprints/hints solo los toca requirePlatformStaff() + superadmin.
 */

export type TrazadocsActionState = { error: string | null; success?: boolean; documentId?: string };
const okState: TrazadocsActionState = { error: null, success: true };

function revalidateTrazadocs(documentId?: string) {
  revalidatePath("/trazadocs");
  revalidatePath("/implementation");
  if (documentId) revalidatePath(`/trazadocs/${documentId}`);
}

// ---------------------------------------------------------------------------
// Lecturas — empresa.
// ---------------------------------------------------------------------------
export async function listTrazadocsAction(): Promise<DocumentSummaryRow[]> {
  const org = await requireActiveOrg();
  return listDocuments(org.organizationId);
}

/** Resumen para la tarjeta "Documentos técnicos mínimos creados" en
 *  /implementation (Parte 21) — tarjeta aparte, no toca el checklist de
 *  17 pasos del Sprint 6. Nunca bloquea el cálculo: es solo informativa. */
export async function getTrazadocsChecklistOverviewAction(): Promise<{
  status: ReturnType<typeof resolveTrazadocsChecklistStatus>;
  totalDocuments: number;
  approvedCount: number;
}> {
  const org = await requireActiveOrg();
  const docs = await listDocuments(org.organizationId);
  const approvedCount = docs.filter((d) => d.status === "approved").length;
  const draftOrInReviewCount = docs.filter((d) => d.status === "draft" || d.status === "in_review").length;
  const approvedOrInReviewCount = docs.filter((d) => d.status === "approved" || d.status === "in_review").length;
  return {
    status: resolveTrazadocsChecklistStatus({
      totalDocuments: docs.length,
      draftOrInReviewCount,
      approvedOrInReviewCount,
    }),
    totalDocuments: docs.length,
    approvedCount,
  };
}

export async function getTrazadocDocumentAction(
  documentId: string
): Promise<{
  data: DocumentDetail | null;
  canEdit: boolean;
  canApprove: boolean;
  canMarkObsolete: boolean;
  canReactivate: boolean;
  canCreateDraftVersion: boolean;
}> {
  const org = await requireActiveOrg();
  const data = await getDocument(org.organizationId, documentId);
  const status = data?.status ?? "draft";
  return {
    data,
    canEdit: canEditDocument(org.roleCode, status),
    canApprove: canApproveDocument(org.roleCode) && (status === "draft" || status === "in_review"),
    canMarkObsolete: canMarkObsolete(org.roleCode) && status !== "obsolete",
    canReactivate: canReactivateDocument(org.roleCode) && status === "obsolete",
    canCreateDraftVersion: canCreateDraftVersionFromApproved(org.roleCode) && status === "approved",
  };
}

export async function listTrazadocBlueprintsAction(): Promise<BlueprintSummaryRow[]> {
  await requireActiveOrg();
  return listAvailableBlueprints();
}

// ---------------------------------------------------------------------------
// Crear documento.
// ---------------------------------------------------------------------------
export async function createDocumentFromBlueprintAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();

  if (!canCreateDocument(org.roleCode)) {
    return { error: "Tu rol no permite crear documentos en TrazaDocs." };
  }

  // Sprint 10A (Parte 8): límite de plan — Demo permite 2 documentos
  // TrazaDocs por empresa.
  const limitCheck = await checkResourceLimit("documents_trazadocs");
  if (!limitCheck.allowed) return { error: limitCheck.error };

  const blueprintId = String(formData.get("blueprint_id") ?? "");
  const blueprint = await getBlueprintByIdForCompany(blueprintId);
  if (!blueprint) {
    return { error: "La estructura sugerida no existe o ya no está disponible." };
  }

  // Sprint 9.2 (Parte 3, regla 4): si ya existe un documento de esta
  // estructura en la empresa (sin importar su estado), no se crea otro —
  // se ofrece abrir el existente.
  const existingFromBlueprint = await findDocumentByBlueprint(org.organizationId, blueprint.id);
  if (existingFromBlueprint) {
    return { error: DUPLICATE_BLUEPRINT_MESSAGE, documentId: existingFromBlueprint.id };
  }

  const payload = buildSuggestedDocumentInsertPayload(blueprint.id, blueprint.name, user.id, blueprint.documentType);

  // Regla 1-3: título duplicado (normalizado) dentro de la misma empresa.
  // El nombre del documento sugerido es el nombre del blueprint — chequeo
  // preventivo con mensaje claro; el índice único (0048) es el respaldo
  // real ante una condición de carrera.
  const existingByTitle = await findDocumentByNormalizedTitle(org.organizationId, normalizeDocumentTitle(payload.title));
  if (existingByTitle) {
    return { error: DUPLICATE_TITLE_MESSAGE, documentId: existingByTitle.id };
  }
  // Sprint 10B (Parte 18): anti-duplicado CRUZADO — también contra
  // documentos descargables del Maestro de documentos, mismo mensaje.
  const existingFileByTitle = await findFileDocumentByNormalizedTitle(org.organizationId, normalizeDocumentTitle(payload.title));
  if (existingFileByTitle) {
    return { error: DUPLICATE_MASTER_TITLE_MESSAGE };
  }

  const { id: documentId, error: docError } = await insertDocument(org.organizationId, payload);
  if (docError || !documentId) return { error: docError ?? "No fue posible crear el documento." };

  const blueprintSections = await getBlueprintSections(blueprint.id);
  const draftSections = buildSectionsFromBlueprint(blueprintSections);
  const { error: sectionsError } = await insertDocumentSections(org.organizationId, documentId, draftSections);
  if (sectionsError) return { error: sectionsError };

  // Bloqueante 1 (Sprint 9.1): "v1 — Borrador inicial" real, no solo
  // current_version = 1 en la fila del documento.
  const initialSnapshot = buildInitialVersionSnapshot(
    { title: payload.title, code: payload.code, description: payload.description },
    draftSections.map((s) => ({
      sectionKey: s.sectionKey,
      title: s.title,
      content: s.content,
      sortOrder: s.sortOrder,
      isRequired: s.isRequired,
    }))
  );
  const { error: versionError } = await insertInitialVersion(org.organizationId, documentId, initialSnapshot, user.id);
  if (versionError) return { error: versionError };

  revalidateTrazadocs();
  // Sprint 9.2 (Parte 2): llevar directo a la edición, con un aviso claro
  // — nunca dejar al usuario en una pantalla donde parezca que no pasó
  // nada.
  redirect(buildDocumentEditPath(documentId));
}

export async function createCustomDocumentAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();

  if (!canCreateDocument(org.roleCode)) {
    return { error: "Tu rol no permite crear documentos en TrazaDocs." };
  }

  // Sprint 10A (Parte 8): límite de plan — Demo permite 2 documentos
  // TrazaDocs por empresa (sugeridos + libres cuentan juntos).
  const limitCheck = await checkResourceLimit("documents_trazadocs");
  if (!limitCheck.allowed) return { error: limitCheck.error };

  const input = {
    title: String(formData.get("title") ?? ""),
    code: String(formData.get("code") ?? ""),
    description: String(formData.get("description") ?? ""),
  };
  const validation = validateCustomDocumentInput(input);
  if (validation.error) return { error: validation.error };

  // Sprint 9.2 (Parte 3, reglas 1-3): título duplicado (trim +
  // minúsculas) dentro de la misma empresa. Chequeo preventivo con
  // mensaje claro; el índice único (0048) es el respaldo real ante una
  // condición de carrera.
  const existingByTitle = await findDocumentByNormalizedTitle(org.organizationId, normalizeDocumentTitle(input.title));
  if (existingByTitle) {
    return { error: DUPLICATE_TITLE_MESSAGE, documentId: existingByTitle.id };
  }
  const existingFileByTitle = await findFileDocumentByNormalizedTitle(org.organizationId, normalizeDocumentTitle(input.title));
  if (existingFileByTitle) {
    return { error: DUPLICATE_MASTER_TITLE_MESSAGE };
  }

  const payload = buildCustomDocumentInsertPayload({ ...input, ownerId: user.id });
  const { id: documentId, error } = await insertDocument(org.organizationId, payload);
  if (error || !documentId) return { error: error ?? "No fue posible crear el documento." };

  // Bloqueante 1 (Sprint 9.1): v1 real también para documentos libres —
  // sin secciones todavía (se agregan después), pero la versión inicial
  // existe igual, con un arreglo de secciones vacío.
  const initialSnapshot = buildInitialVersionSnapshot(
    { title: payload.title, code: payload.code, description: payload.description },
    []
  );
  const { error: versionError } = await insertInitialVersion(org.organizationId, documentId, initialSnapshot, user.id);
  if (versionError) return { error: versionError };

  revalidateTrazadocs();
  // Sprint 9.2 (Parte 2): llevar directo a la edición, con un aviso claro.
  redirect(buildDocumentEditPath(documentId));
}

// ---------------------------------------------------------------------------
// Editar documento y secciones.
// ---------------------------------------------------------------------------
export async function updateDocumentMetadataAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const documentId = String(formData.get("document_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "El nombre del documento no puede estar vacío." };

  const { error } = await updateDocumentMetadata(org.organizationId, documentId, {
    title,
    code: String(formData.get("code") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    ownerId: String(formData.get("owner_id") ?? "").trim() || null,
  });
  if (error) return { error };

  revalidateTrazadocs(documentId);
  return { ...okState, documentId };
}

/** Guarda el contenido de TODAS las secciones enviadas en el formulario a
 *  la vez (editor de secciones, Parte 18). Cada campo se llama
 *  `section:<id>`. */
export async function updateDocumentSectionsAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const documentId = String(formData.get("document_id") ?? "");

  // T8.1 (regla obligatoria): documento de la organización, del módulo
  // CPR, en estado editable y con rol autorizado — ANTES de tocar
  // cualquier sección; el helper re-amarra sección→documento→módulo.
  const doc = await getDocumentFacts(org.organizationId, documentId, "cpr");
  if (!doc) return { error: "El documento no existe o no pertenece a tu organización." };
  if (!canEditDocument(org.roleCode, doc.status)) {
    return { error: "Tu rol no permite editar este documento en su estado actual." };
  }

  const updates: { sectionId: string; content: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("section:")) {
      updates.push({ sectionId: key.slice("section:".length), content: String(value) });
    }
  }

  for (const u of updates) {
    const { error } = await updateSectionContentForDocument({
      organizationId: org.organizationId,
      documentId,
      sectionId: u.sectionId,
      moduleKey: "cpr",
      content: u.content,
    });
    if (error) return { error };
  }

  revalidateTrazadocs(documentId);
  return { ...okState, documentId };
}

export async function addCustomSectionAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const documentId = String(formData.get("document_id") ?? "");
  const title = String(formData.get("title") ?? "");
  const sortOrder = Number(formData.get("sort_order") ?? "0");

  // T8.1: solo se agregan secciones a un documento CPR editable de la
  // organización (nunca a un documento Textil desde este flujo).
  const doc = await getDocumentFacts(org.organizationId, documentId, "cpr");
  if (!doc) return { error: "El documento no existe o no pertenece a tu organización." };
  if (!canEditDocument(org.roleCode, doc.status)) {
    return { error: "Tu rol no permite editar este documento en su estado actual." };
  }

  const validation = validateCustomSectionInput({ title });
  if (validation.error) return { error: validation.error };

  const { error } = await insertCustomSection(org.organizationId, documentId, {
    sectionKey: slugifySectionKey(title),
    title: title.trim(),
    content: "",
    sortOrder,
    isRequired: false,
  });
  if (error) return { error };

  revalidateTrazadocs(documentId);
  return { ...okState, documentId };
}

export async function deleteDocumentSectionAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  if (!canDeleteSection(org.roleCode)) {
    return { error: "Tu rol no permite eliminar secciones." };
  }
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const documentId = String(formData.get("document_id") ?? "");
  const sectionId = String(formData.get("section_id") ?? "");
  // T8.1: la sección debe pertenecer a un documento CPR de la
  // organización; la RLS re-exige padre en borrador.
  const doc = await getDocumentFacts(org.organizationId, documentId, "cpr");
  if (!doc) return { error: "El documento no existe o no pertenece a tu organización." };
  const { error } = await deleteSection(org.organizationId, documentId, sectionId);
  if (error) return { error };

  revalidateTrazadocs(documentId);
  return { ...okState, documentId };
}

/**
 * Sprint 9.2 (Parte 4): eliminar un documento en BORRADOR — hard delete
 * real, las secciones/versiones/historial se van por cascade (0043).
 * Admin/quality: cualquier borrador de la empresa. Consultant: solo el
 * que él mismo creó. Nunca approved/obsolete (ni la RLS de 0048 ni esta
 * validación lo permiten).
 */
export async function deleteDraftTrazadocDocumentAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  const { user } = await requireSession();
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const documentId = String(formData.get("document_id") ?? "");

  const doc = await getDocument(org.organizationId, documentId);
  if (!doc) return { error: "El documento no existe o no pertenece a tu empresa." };

  if (!canDeleteDraftDocument(org.roleCode, doc.status, doc.createdBy, user.id)) {
    return {
      error:
        doc.status !== "draft"
          ? "Solo se pueden eliminar documentos en borrador."
          : "Solo puedes eliminar un borrador que tú mismo creaste, o ser administrador/supervisor.",
    };
  }

  const { error } = await deleteDocument(org.organizationId, documentId);
  if (error) return { error };

  revalidatePath("/trazadocs");
  revalidatePath("/implementation");
  return okState;
}

/** Sprint 9.2 (Parte 3): validación previa de disponibilidad de título,
 *  reutilizable desde formularios de creación/edición. */
export async function validateTrazadocTitleAvailabilityAction(
  title: string,
  excludeDocumentId?: string
): Promise<{ available: boolean; existingDocumentId: string | null }> {
  const org = await requireActiveOrg();
  const existing = await findDocumentByNormalizedTitle(
    org.organizationId,
    normalizeDocumentTitle(title),
    excludeDocumentId
  );
  return { available: !existing, existingDocumentId: existing?.id ?? null };
}

/** Reordenar de forma sencilla: mover una sección un puesto arriba o abajo
 *  (Parte 18: "reordenar secciones, si es sencillo"). */
export async function moveSectionAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  const documentId = String(formData.get("document_id") ?? "");
  const sectionId = String(formData.get("section_id") ?? "");
  const currentOrder = Number(formData.get("current_order") ?? "0");
  const targetOrder = Number(formData.get("target_order") ?? "0");
  const targetSectionId = String(formData.get("target_section_id") ?? "");

  // T8.1: reordenar exige documento CPR editable; ambas secciones deben
  // pertenecerle (el helper las amarra por document_id).
  const doc = await getDocumentFacts(org.organizationId, documentId, "cpr");
  if (!doc) return { error: "El documento no existe o no pertenece a tu organización." };
  if (!canEditDocument(org.roleCode, doc.status)) {
    return { error: "Tu rol no permite editar este documento en su estado actual." };
  }

  const { error } = await reorderSections(org.organizationId, documentId, [
    { id: sectionId, sortOrder: targetOrder },
    { id: targetSectionId, sortOrder: currentOrder },
  ]);
  if (error) return { error };

  revalidateTrazadocs(documentId);
  return { ...okState, documentId };
}

// ---------------------------------------------------------------------------
// Transiciones de estado — todas pasan por la RPC atómica (0046).
// ---------------------------------------------------------------------------
async function transition(
  documentId: string,
  toStatus: DocumentStatus,
  note: string | null
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();

  // Sprint 10A (Bloqueante 3): las 6 acciones de transición de estado
  // (enviar a revisión, aprobar, marcar obsoleto, reactivar, crear
  // versión en borrador desde aprobado, guardar nueva versión) comparten
  // este único helper — un solo chequeo cubre todas, nunca duplicado.
  const mutateCheck = await checkOrganizationCanMutate();
  if (!mutateCheck.allowed) return { error: mutateCheck.error };

  // T8.1: separación por módulo también en transiciones — el documento
  // debe ser CPR y de la organización activa (las rutas textiles hacen el
  // chequeo espejo con 'textiles' desde T8).
  const doc = await getDocumentFacts(org.organizationId, documentId, "cpr");
  if (!doc) return { error: "El documento no existe o no pertenece a tu organización." };

  const { newVersion, error } = await changeDocumentStatus(documentId, toStatus, note);
  if (error || newVersion == null) {
    return { error: error ?? "No fue posible cambiar el estado del documento." };
  }
  revalidateTrazadocs(documentId);
  return { error: null, success: true, documentId };
}

export async function submitDocumentForReviewAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  if (!canSubmitForReview(org.roleCode, "draft")) {
    return { error: "Tu rol no permite enviar este documento a revisión." };
  }
  const documentId = String(formData.get("document_id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return transition(documentId, "in_review", note);
}

export async function approveDocumentAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  if (!canApproveDocument(org.roleCode)) {
    return { error: "Tu rol no permite aprobar documentos." };
  }
  const documentId = String(formData.get("document_id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return transition(documentId, "approved", note);
}

export async function markDocumentObsoleteAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  if (!canMarkObsolete(org.roleCode)) {
    return { error: "Tu rol no permite marcar este documento como obsoleto." };
  }
  const documentId = String(formData.get("document_id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  return transition(documentId, "obsolete", note);
}

export async function reactivateDocumentAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  if (!canReactivateDocument(org.roleCode)) {
    return { error: "Solo un administrador puede reactivar un documento obsoleto." };
  }
  const documentId = String(formData.get("document_id") ?? "");
  const note = String(formData.get("note") ?? "").trim() || "Reactivado desde obsoleto.";
  return transition(documentId, "draft", note);
}

/** Bloqueante 3 (Sprint 9.1): único camino para volver a tocar un
 *  documento aprobado — crea una versión nueva EN BORRADOR a partir del
 *  aprobado (nunca se edita el aprobado directamente). Solo admin/quality;
 *  la RPC (0047) lo vuelve a exigir y además bloquea a consultant por
 *  completo para cualquier documento que YA estaba aprobado. */
export async function createDraftVersionFromApprovedAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  if (!canCreateDraftVersionFromApproved(org.roleCode)) {
    return { error: "Solo un administrador o supervisor puede crear una nueva versión en borrador de un documento aprobado." };
  }
  const documentId = String(formData.get("document_id") ?? "");
  const note =
    String(formData.get("note") ?? "").trim() ||
    "Nueva versión en borrador creada a partir de documento aprobado.";
  return transition(documentId, "draft", note);
}

/** "Guardar nueva versión" explícito sin cambiar de estado (Parte 10:
 *  "guardar cambios importantes" además de las transiciones). */
export async function createDocumentVersionAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const org = await requireActiveOrg();
  const documentId = String(formData.get("document_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isDocumentStatus(status)) return { error: "Estado no válido." };
  if (!canEditDocument(org.roleCode, status)) {
    return { error: "Tu rol no permite guardar una nueva versión de este documento." };
  }
  const note = String(formData.get("note") ?? "").trim() || "Cambios guardados.";
  return transition(documentId, status, note);
}

// ---------------------------------------------------------------------------
// Versiones.
// ---------------------------------------------------------------------------
export async function listDocumentVersionsAction(documentId: string): Promise<DocumentVersionRow[]> {
  const org = await requireActiveOrg();
  return listDocumentVersions(org.organizationId, documentId);
}

export async function getDocumentVersionAction(versionId: string): Promise<DocumentVersionDetail | null> {
  const org = await requireActiveOrg();
  return getDocumentVersion(org.organizationId, versionId);
}

// ===========================================================================
// Superadmin — administración de blueprints y hints (/platform/trazadocs).
// ===========================================================================
export async function listPlatformTrazadocBlueprintsAction(): Promise<{
  data: PlatformBlueprintRow[];
  canManage: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const data = await listAllBlueprintsForPlatform();
  return { data, canManage: canEditBlueprint(isSuperadmin ? "superadmin" : null) };
}

export async function getPlatformTrazadocBlueprintDetailAction(
  blueprintId: string
): Promise<{ data: PlatformBlueprintDetail | null; canManage: boolean }> {
  const { isSuperadmin } = await requirePlatformStaff();
  const data = await getPlatformBlueprintDetail(blueprintId);
  return { data, canManage: canEditBlueprint(isSuperadmin ? "superadmin" : null) };
}

function requireBlueprintManage(isSuperadmin: boolean): TrazadocsActionState | null {
  if (!canEditBlueprint(isSuperadmin ? "superadmin" : null)) {
    return { error: "Solo un superadministrador de plataforma puede editar estructuras de TrazaDocs." };
  }
  return null;
}

export async function createTrazadocBlueprintAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  const guard = requireBlueprintManage(isSuperadmin);
  if (guard) return guard;

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const documentType = String(formData.get("document_type") ?? "procedure");
  if (!code || !name) return { error: "Código y nombre son obligatorios." };

  const { id, error } = await insertBlueprint({
    code,
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    documentType: documentType as DocumentType,
  });
  if (error || !id) return { error: error ?? "No fue posible crear la estructura." };

  revalidatePath("/platform/trazadocs");
  return { error: null, success: true, documentId: id };
}

export async function updateTrazadocBlueprintAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  const guard = requireBlueprintManage(isSuperadmin);
  if (guard) return guard;

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "El nombre no puede estar vacío." };

  const { error } = await updateBlueprint(id, {
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    documentType: String(formData.get("document_type") ?? "procedure") as DocumentType,
  });
  if (error) return { error };

  revalidatePath("/platform/trazadocs");
  revalidatePath(`/platform/trazadocs/${id}`);
  return { ...okState, documentId: id };
}

export async function updateTrazadocBlueprintStatusAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  const guard = requireBlueprintManage(isSuperadmin);
  if (guard) return guard;

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!isBlueprintStatus(status)) return { error: "Estado no válido." };

  const { error } = await updateBlueprintStatus(id, status);
  if (error) return { error };

  revalidatePath("/platform/trazadocs");
  return { ...okState, documentId: id };
}

export async function createTrazadocBlueprintSectionAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  const guard = requireBlueprintManage(isSuperadmin);
  if (guard) return guard;

  const blueprintId = String(formData.get("blueprint_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "El título de la sección no puede estar vacío." };
  const sortOrder = Number(formData.get("sort_order") ?? "0");

  const { error } = await insertBlueprintSection(blueprintId, {
    sectionKey: slugifySectionKey(title),
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    hint: String(formData.get("hint") ?? "").trim() || null,
    sortOrder,
    isRequired: formData.get("is_required") === "on",
  });
  if (error) return { error };

  revalidatePath(`/platform/trazadocs/${blueprintId}`);
  return { ...okState, documentId: blueprintId };
}

export async function updateTrazadocBlueprintSectionAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  const guard = requireBlueprintManage(isSuperadmin);
  if (guard) return guard;

  const id = String(formData.get("id") ?? "");
  const blueprintId = String(formData.get("blueprint_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "El título de la sección no puede estar vacío." };

  const { error } = await updateBlueprintSection(id, {
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    hint: String(formData.get("hint") ?? "").trim() || null,
    isRequired: formData.get("is_required") === "on",
  });
  if (error) return { error };

  revalidatePath(`/platform/trazadocs/${blueprintId}`);
  return { ...okState, documentId: blueprintId };
}

export async function updateTrazadocBlueprintSectionStatusAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  const guard = requireBlueprintManage(isSuperadmin);
  if (guard) return guard;

  const id = String(formData.get("id") ?? "");
  const blueprintId = String(formData.get("blueprint_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "active" && status !== "inactive") return { error: "Estado no válido." };

  const { error } = await updateBlueprintSectionStatus(id, status);
  if (error) return { error };

  revalidatePath(`/platform/trazadocs/${blueprintId}`);
  return { ...okState, documentId: blueprintId };
}

export async function reorderTrazadocBlueprintSectionsAction(
  _prev: TrazadocsActionState,
  formData: FormData
): Promise<TrazadocsActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  const guard = requireBlueprintManage(isSuperadmin);
  if (guard) return guard;

  const blueprintId = String(formData.get("blueprint_id") ?? "");
  const sectionId = String(formData.get("section_id") ?? "");
  const currentOrder = Number(formData.get("current_order") ?? "0");
  const targetOrder = Number(formData.get("target_order") ?? "0");
  const targetSectionId = String(formData.get("target_section_id") ?? "");

  const { error } = await reorderBlueprintSections([
    { id: sectionId, sortOrder: targetOrder },
    { id: targetSectionId, sortOrder: currentOrder },
  ]);
  if (error) return { error };

  revalidatePath(`/platform/trazadocs/${blueprintId}`);
  return { ...okState, documentId: blueprintId };
}
