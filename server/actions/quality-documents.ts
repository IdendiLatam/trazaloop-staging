"use server";

import { revalidatePath } from "next/cache";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  insertDocument,
  insertDocumentSections,
  updateDocumentMetadata,
  updateSectionContentForDocument,
  insertCustomSection,
  deleteSection,
  reorderSections,
} from "@/lib/db/trazadocs";
import { QUALITY_DOC_MODULE } from "@/lib/db/quality-documents";
import {
  getDocumentControlDetail,
  createDocumentRevision,
  submitDocumentRevision,
  recordDocumentDecision,
  retireDocument,
  deleteDocumentSafely,
  updateRevisionSchedule,
  markAlert,
} from "@/lib/db/document-control";
import { isQualityDocumentCategory } from "@/lib/domain/quality-documents";
import {
  canCreateDocument,
  slugifySectionKey,
  validateCustomSectionInput,
} from "@/lib/domain/trazadocs";
import {
  buildParticipantsPayload,
  canAttemptHardDelete,
  canCreateNextRevision,
  canDecideNow,
  canEditRevisionContent,
  canRetireDocument,
  canSubmitRevision,
  hardDeleteBlockReason,
  isRouteMode,
  validateSubmitInput,
  type ParticipantInput,
} from "@/lib/domain/document-control";
import { isAlertStatus } from "@/lib/domain/work-inbox";

/**
 * Trazaloop Quality · QUALITY-02 · Server actions del control documental.
 *
 * Mismo motor TrazaDocs que PCR y Textiles; misma guarda de módulo; los mismos
 * tres roles de empresa. Lo que cambia respecto de QUALITY-01.1 es el modelo:
 * un documento de Quality nace CONTROLADO (identidad + revisión + workflow) y
 * ya no usa la RPC histórica de transición de estado, que confundía revisión
 * con instantánea.
 *
 * Estas acciones NUNCA son la barrera de seguridad: cada una comprueba lo que
 * puede para dar un mensaje claro, y después la base vuelve a comprobarlo todo
 * por su cuenta (RLS + triggers + RPC SECURITY DEFINER de 0116). Ocultar un
 * botón no protege nada.
 */

export type QualityDocumentActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
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
  revalidatePath(`${PATH_DOCS}/master`);
  revalidatePath("/quality");
  revalidatePath("/quality/tasks");
  if (documentId) revalidatePath(`${PATH_DOCS}/${documentId}`);
}

/** Secciones de partida de un documento de Quality creado desde cero. */
const DEFAULT_SECTIONS = [
  { key: "purpose", title: "Objetivo" },
  { key: "scope", title: "Alcance" },
  { key: "responsibilities", title: "Responsabilidades" },
  { key: "development", title: "Desarrollo" },
  { key: "records", title: "Registros" },
] as const;

/** Carga el documento con su control, o el motivo por el que no procede. */
async function loadControlled(organizationId: string, documentId: string) {
  const detail = await getDocumentControlDetail(organizationId, documentId, QUALITY_DOC_MODULE);
  if (!detail) return { detail: null, error: "El documento no existe o no pertenece a Quality." };
  return { detail, error: null };
}

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
  const ownerPositionId = String(formData.get("owner_position_id") ?? "").trim() || null;

  const { id, error } = await insertDocument(g.ok.organizationId, {
    source_type: "custom",
    blueprint_id: null,
    title,
    code,
    description,
    owner_id: user.id,
    category_code: category,
    // Fijados en SERVIDOR. El cliente no los envía y, aunque los enviara, no
    // llegan hasta aquí: este objeto se construye entero en el servidor.
    module_key: QUALITY_DOC_MODULE,
    revision_model: "controlled",
    owner_position_id: ownerPositionId,
  });
  if (error || !id) return { error: error ?? "No fue posible crear el documento." };

  await insertDocumentSections(
    g.ok.organizationId,
    id,
    DEFAULT_SECTIONS.map((s, i) => ({
      blueprintSectionId: null,
      sectionKey: s.key,
      title: s.title,
      content: "",
      sortOrder: i + 1,
      isRequired: i < 2,
    }))
  );

  // La Revisión 1 se abre AQUÍ, en el momento de crear el documento. Es lo que
  // hace que un documento nuevo empiece —siempre— en la revisión 1, y no en un
  // número heredado de un contador de instantáneas.
  const revision = await createDocumentRevision(id, "Primera emisión");
  if (revision.error) return { error: revision.error };

  revalidateDocs(id);
  return { error: null, success: true, documentId: id };
}

// ---------------------------------------------------------------------------
// Editar identidad y contenido
// ---------------------------------------------------------------------------

export async function updateQualityDocumentMetadataAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const { detail, error: loadError } = await loadControlled(g.ok.organizationId, documentId);
  if (!detail) return { error: loadError };
  if (!canEditRevisionContent(g.ok.roleCode as never, detail.lifecycle)) {
    return { error: "Este documento no se puede editar en su estado actual." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (title.length === 0) return { error: "Escribe un título para el documento." };

  const rawCategory = String(formData.get("category_code") ?? detail.categoryCode);
  const ownerPositionId = String(formData.get("owner_position_id") ?? "").trim() || null;

  const { error } = await updateDocumentMetadata(
    g.ok.organizationId,
    documentId,
    {
      title,
      code: String(formData.get("code") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      ownerId: detail.ownerId ?? null,
      categoryCode: isQualityDocumentCategory(rawCategory) ? rawCategory : undefined,
      ownerPositionId,
    },
    QUALITY_DOC_MODULE
  );
  if (error) return { error };

  revalidateDocs(documentId);
  return { error: null, success: true, message: "Datos del documento guardados." };
}

export async function updateQualityDocumentSectionAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const { detail, error: loadError } = await loadControlled(g.ok.organizationId, documentId);
  if (!detail) return { error: loadError };
  if (!canEditRevisionContent(g.ok.roleCode as never, detail.lifecycle)) {
    return { error: "El contenido no se edita mientras el documento está en revisión, aprobado o retirado." };
  }

  // Todas las secciones se envían juntas; basta con que una falle para no dar
  // por buena la operación entera.
  for (const section of detail.sections) {
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
  return { error: null, success: true, message: "Contenido guardado." };
}

export async function addQualityDocumentSectionAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const { detail, error: loadError } = await loadControlled(g.ok.organizationId, documentId);
  if (!detail) return { error: loadError };
  if (!canEditRevisionContent(g.ok.roleCode as never, detail.lifecycle)) {
    return { error: "Solo se agregan secciones mientras el documento está en borrador." };
  }

  const title = String(formData.get("section_title") ?? "").trim();
  const validation = validateCustomSectionInput({ title });
  if (validation.error) return { error: validation.error };

  const isRequired = String(formData.get("section_required") ?? "") === "on";
  const base = slugifySectionKey(title);
  const used = new Set(detail.sections.map((s) => s.sectionKey));
  let key = base;
  let suffix = 2;
  while (used.has(key)) { key = `${base}_${suffix}`; suffix += 1; }

  const nextOrder = detail.sections.reduce((max, s) => Math.max(max, s.sortOrder), 0) + 1;
  const { error } = await insertCustomSection(g.ok.organizationId, documentId, {
    sectionKey: key,
    title,
    content: "",
    sortOrder: nextOrder,
    isRequired,
  });
  if (error) return { error };

  revalidateDocs(documentId);
  return { error: null, success: true, message: `Sección «${title}» agregada.` };
}

export async function deleteQualityDocumentSectionAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const sectionId = String(formData.get("section_id") ?? "");
  const { detail, error: loadError } = await loadControlled(g.ok.organizationId, documentId);
  if (!detail) return { error: loadError };
  if (!canEditRevisionContent(g.ok.roleCode as never, detail.lifecycle)) {
    return { error: "Solo se eliminan secciones mientras el documento está en borrador." };
  }
  if (detail.sections.length <= 1) {
    return { error: "Un documento necesita al menos una sección." };
  }

  const { error } = await deleteSection(g.ok.organizationId, documentId, sectionId);
  if (error) return { error };

  revalidateDocs(documentId);
  return { error: null, success: true, message: "Sección eliminada." };
}

export async function moveQualityDocumentSectionAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const sectionId = String(formData.get("section_id") ?? "");
  const direction = String(formData.get("direction") ?? "up") === "down" ? 1 : -1;

  const { detail, error: loadError } = await loadControlled(g.ok.organizationId, documentId);
  if (!detail) return { error: loadError };
  if (!canEditRevisionContent(g.ok.roleCode as never, detail.lifecycle)) {
    return { error: "Solo se reordenan secciones mientras el documento está en borrador." };
  }

  const ordered = [...detail.sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((s) => s.id === sectionId);
  if (index < 0) return { error: "La sección no pertenece a este documento." };
  const target = index + direction;
  if (target < 0 || target >= ordered.length) return { error: null, success: true };

  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  const { error } = await reorderSections(
    g.ok.organizationId,
    documentId,
    ordered.map((s, i) => ({ id: s.id, sortOrder: i + 1 }))
  );
  if (error) return { error };

  revalidateDocs(documentId);
  return { error: null, success: true };
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/** Lee del formulario los responsables de un rol: `reviewer[]` / `approver[]`.
 *  Cada valor es `position:<id>` o `profile:<id>`; el ORDEN del formulario es
 *  el orden de la ruta secuencial. */
function readParticipants(formData: FormData, field: string): ParticipantInput[] {
  return formData
    .getAll(field)
    .map((raw) => String(raw).trim())
    .filter((raw) => raw.length > 0)
    .map((raw, index) => {
      const [kind, id] = raw.split(":");
      return kind === "position"
        ? { positionId: id, profileId: null, stepOrder: index + 1 }
        : { positionId: null, profileId: id, stepOrder: index + 1 };
    });
}

export async function submitQualityDocumentAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const { detail, error: loadError } = await loadControlled(g.ok.organizationId, documentId);
  if (!detail) return { error: loadError };
  if (!detail.currentRevision) return { error: "Este documento no tiene una revisión abierta." };
  if (!canSubmitRevision(g.ok.roleCode as never, detail.lifecycle)) {
    return { error: "Este documento no puede enviarse en su estado actual." };
  }

  const reviewers = buildParticipantsPayload(readParticipants(formData, "reviewer"));
  const approvers = buildParticipantsPayload(readParticipants(formData, "approver"));
  const rawRoute = String(formData.get("route_mode") ?? "sequential");
  const routeMode = isRouteMode(rawRoute) ? rawRoute : "sequential";
  const effectiveFrom = String(formData.get("effective_from") ?? "").trim() || null;
  const reviewDueAt = String(formData.get("review_due_at") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  const validation = validateSubmitInput({ reviewers, approvers, effectiveFrom, reviewDueAt });
  if (validation.error) return { error: validation.error };

  const { state, error } = await submitDocumentRevision({
    revisionId: detail.currentRevision.id,
    reviewers,
    approvers,
    routeMode,
    effectiveFrom,
    reviewDueAt,
    note,
  });
  if (error) return { error };

  revalidateDocs(documentId);
  return {
    error: null,
    success: true,
    message:
      state === "pending_approval"
        ? "Documento enviado a aprobación."
        : "Documento enviado a revisión.",
  };
}

export async function decideQualityDocumentAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const { user } = await requireSession();

  const documentId = String(formData.get("document_id") ?? "");
  const rawDecision = String(formData.get("decision") ?? "");
  if (rawDecision !== "approved" && rawDecision !== "changes_requested") {
    return { error: "Decisión no válida." };
  }
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (rawDecision === "changes_requested" && reason === null) {
    return { error: "Escribe el motivo por el que devuelves el documento." };
  }

  const { detail, error: loadError } = await loadControlled(g.ok.organizationId, documentId);
  if (!detail) return { error: loadError };
  if (!detail.currentRevision) return { error: "Este documento no tiene una revisión en curso." };

  if (
    !canDecideNow({
      userId: user.id,
      lifecycle: detail.lifecycle,
      routeMode: detail.currentRevision.routeMode,
      round: detail.currentRevision.round,
      participants: detail.participants.map((p) => ({
        profileId: p.profileId,
        participantRole: p.participantRole,
        stepOrder: p.stepOrder,
        round: p.round,
        decision: p.decision,
      })),
    })
  ) {
    return { error: "No tienes una decisión pendiente sobre este documento en este momento." };
  }

  const { state, error } = await recordDocumentDecision({
    revisionId: detail.currentRevision.id,
    decision: rawDecision,
    reason,
  });
  if (error) return { error };

  revalidateDocs(documentId);
  const message =
    rawDecision === "changes_requested"
      ? "Documento devuelto a su autor con tus observaciones."
      : state === "approved"
        ? "Documento aprobado."
        : state === "pending_approval"
          ? "Revisión aceptada. El documento pasó a aprobación."
          : "Tu decisión quedó registrada.";
  return { error: null, success: true, message };
}

export async function createQualityDocumentRevisionAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const { detail, error: loadError } = await loadControlled(g.ok.organizationId, documentId);
  if (!detail) return { error: loadError };
  if (!canCreateNextRevision(g.ok.roleCode as never, detail.lifecycle)) {
    return {
      error:
        "Solo se abre una revisión nueva sobre un documento ya aprobado, y solo pueden hacerlo la administración o el área de calidad.",
    };
  }

  const note = String(formData.get("change_note") ?? "").trim() || null;
  const { error } = await createDocumentRevision(documentId, note);
  if (error) return { error };

  revalidateDocs(documentId);
  const next = (detail.currentRevision?.revisionNumber ?? 1) + 1;
  return {
    error: null,
    success: true,
    message: `Revisión ${next} abierta. La revisión anterior queda como histórico y no cambia.`,
  };
}

export async function updateQualityRevisionScheduleAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const { detail, error: loadError } = await loadControlled(g.ok.organizationId, documentId);
  if (!detail) return { error: loadError };
  if (!detail.currentRevision) return { error: "Este documento no tiene una revisión abierta." };
  if (!canEditRevisionContent(g.ok.roleCode as never, detail.lifecycle)) {
    return { error: "La programación solo se cambia mientras la revisión está abierta." };
  }

  const effectiveFrom = String(formData.get("effective_from") ?? "").trim() || null;
  const reviewDueAt = String(formData.get("review_due_at") ?? "").trim() || null;
  if (effectiveFrom && reviewDueAt && reviewDueAt < effectiveFrom) {
    return { error: "La próxima revisión no puede programarse antes de que el documento entre en vigencia." };
  }

  const { error } = await updateRevisionSchedule({
    organizationId: g.ok.organizationId,
    revisionId: detail.currentRevision.id,
    effectiveFrom,
    reviewDueAt,
    changeNote: String(formData.get("change_note") ?? "").trim() || null,
  });
  if (error) return { error };

  revalidateDocs(documentId);
  return { error: null, success: true, message: "Programación guardada." };
}

// ---------------------------------------------------------------------------
// Retirar y eliminar
// ---------------------------------------------------------------------------

export async function retireQualityDocumentAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length === 0) return { error: "Escribe el motivo del retiro." };
  if (!canRetireDocument(g.ok.roleCode as never)) {
    return { error: "Solo la administración o el área de calidad pueden retirar un documento." };
  }

  const { detail, error: loadError } = await loadControlled(g.ok.organizationId, documentId);
  if (!detail) return { error: loadError };

  const { error } = await retireDocument(documentId, reason);
  if (error) return { error };

  revalidateDocs(documentId);
  return {
    error: null,
    success: true,
    message: "Documento retirado. Su historial completo se conserva para consulta.",
  };
}

export async function deleteQualityDocumentAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const documentId = String(formData.get("document_id") ?? "");
  if (!canAttemptHardDelete(g.ok.roleCode as never)) {
    return { error: "Solo un administrador puede eliminar un documento." };
  }

  const { detail, error: loadError } = await loadControlled(g.ok.organizationId, documentId);
  if (!detail) return { error: loadError };

  // El mismo diagnóstico que hace la base, para poder EXPLICARLO antes de
  // intentarlo. Si esta capa y la base discreparan, manda la base.
  const blocked = hardDeleteBlockReason({
    lifecycle: detail.lifecycle,
    disposition: detail.disposition,
    everApproved: detail.revisions.some((r) => r.approvedAt !== null),
    hasFormalHistory: detail.decisions.some((d) => d.decisionType !== "revision_created"),
    revisionCount: detail.revisions.length,
    linkedProcessCount: 0,
  });
  if (blocked) return { error: blocked };

  const { error } = await deleteDocumentSafely(documentId);
  if (error) return { error };

  revalidateDocs();
  return { error: null, success: true, message: "Documento eliminado." };
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export async function markQualityAlertAction(
  _prev: QualityDocumentActionState,
  formData: FormData
): Promise<QualityDocumentActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const alertId = String(formData.get("alert_id") ?? "");
  const rawStatus = String(formData.get("status") ?? "seen");
  if (!isAlertStatus(rawStatus)) return { error: "Estado de alerta no válido." };

  const { error } = await markAlert(g.ok.organizationId, alertId, rawStatus);
  if (error) return { error };

  revalidatePath("/quality/tasks");
  revalidatePath("/quality");
  return { error: null, success: true };
}
