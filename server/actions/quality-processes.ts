"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import { getQualityPositionUsage } from "@/lib/db/quality-processes";
import {
  QUALITY_ASSIGNMENT_TYPES,
  QUALITY_DOCUMENT_RELATIONS,
  QUALITY_ERRORS,
  QUALITY_IO_DIRECTIONS,
  QUALITY_IO_KINDS,
  canManagePositions,
  canPublishQuality,
  isOneOf,
  validateIsoDate,
  validateLongText,
  validateOptionalUuid,
  validateQualityCode,
  validateQualityName,
  validateUuid,
} from "@/lib/domain/quality-processes";

/**
 * Trazaloop Quality · QUALITY-01 · Server actions de la fundación de Procesos.
 *
 * Toda mutación pasa por: (1) guarda del módulo (kill switch + empresa activa
 * + habilitación comercial); (2) modo solo lectura de plataforma; (3)
 * validación de dominio ANTES de tocar la BD; (4) organization_id SIEMPRE de
 * la empresa activa, JAMÁS del cliente.
 *
 * La comprobación de rol que se hace aquí es de experiencia de usuario: da un
 * mensaje claro en lugar de un error opaco. La barrera REAL es la RLS y los
 * triggers de la migración 0112, que vuelven a comprobarlo todo aunque esta
 * capa se saltara por completo.
 *
 * Las transiciones de estado (abrir revisión, publicar) NO se hacen con
 * UPDATEs sueltos: van por las RPC atómicas de 0112, que cierran la vigencia
 * anterior y abren la nueva en una sola transacción.
 */

export type QualityActionState = { error: string | null };

const OK: QualityActionState = { error: null };
const UNIQUE_VIOLATION = "23505";

const PATH_POSITIONS = "/quality/positions";
const PATH_PROCESSES = "/quality/processes";
const PATH_MAP = "/quality/map";

type PgErrorLike = { code?: string; message?: string } | null;

function isUniqueViolation(error: PgErrorLike): boolean {
  return Boolean(error && error.code === UNIQUE_VIOLATION);
}

/**
 * Traduce un fallo de BD a un mensaje seguro. Nunca se devuelve el mensaje
 * crudo de PostgreSQL: filtraría nombres de constraints y estructura interna.
 */
function safeError(error: PgErrorLike, fallback: string = QUALITY_ERRORS.generic): string {
  if (isUniqueViolation(error)) return QUALITY_ERRORS.duplicateName;
  return fallback;
}

type Gate = { organizationId: string; roleCode: string };

async function gate(): Promise<{ ok: Gate | null; error: string | null }> {
  const access = await requireQualityForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutateCheck = await checkQualityCanMutate();
  if (!mutateCheck.allowed) return { ok: null, error: mutateCheck.error };
  return {
    ok: { organizationId: access.org.organizationId, roleCode: access.org.roleCode },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Cargos (T-02)
// ---------------------------------------------------------------------------

export type QualityPositionInput = {
  name: string;
  code?: string;
  description?: string;
  orgUnit?: string;
};

export async function createQualityPosition(
  input: QualityPositionInput
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePositions(g.ok.roleCode)) {
    return { error: "Solo la administración o el área de calidad gestionan los cargos." };
  }

  const name = validateQualityName(input.name, "nombre del cargo");
  if (name.error) return { error: name.error };
  const code = validateQualityCode(input.code);
  if (code.error) return { error: code.error };
  const description = validateLongText(input.description, "descripción");
  if (description.error) return { error: description.error };
  const orgUnit = validateLongText(input.orgUnit, "área");
  if (orgUnit.error) return { error: orgUnit.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("quality_positions").insert({
    organization_id: g.ok.organizationId,
    name: name.value,
    code: code.value,
    description: description.value,
    org_unit: orgUnit.value,
  });
  if (error) return { error: safeError(error) };

  revalidatePath(PATH_POSITIONS);
  return OK;
}

export async function updateQualityPosition(
  positionId: string,
  input: QualityPositionInput & { isActive?: boolean }
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePositions(g.ok.roleCode)) {
    return { error: "Solo la administración o el área de calidad gestionan los cargos." };
  }

  const id = validateUuid(positionId, "cargo");
  if (id.error) return { error: id.error };
  const name = validateQualityName(input.name, "nombre del cargo");
  if (name.error) return { error: name.error };
  const code = validateQualityCode(input.code);
  if (code.error) return { error: code.error };
  const description = validateLongText(input.description, "descripción");
  if (description.error) return { error: description.error };
  const orgUnit = validateLongText(input.orgUnit, "área");
  if (orgUnit.error) return { error: orgUnit.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_positions")
    .update({
      name: name.value,
      code: code.value,
      description: description.value,
      org_unit: orgUnit.value,
      ...(typeof input.isActive === "boolean" ? { is_active: input.isActive } : {}),
    })
    .eq("id", id.value)
    .eq("organization_id", g.ok.organizationId);
  if (error) return { error: safeError(error) };

  revalidatePath(PATH_POSITIONS);
  return OK;
}

/**
 * Elimina el cargo si no ha dejado rastro; si ya se usa, lo DESACTIVA.
 *
 * Un cargo en uso no se borra: sus procesos y su historial de asignaciones son
 * la respuesta a "quién respondía por esto el 14 de marzo", y destruirlos sería
 * exactamente lo que T-02 quiere evitar. Pero un cargo recién creado por error
 * no debería quedarse para siempre en la lista.
 *
 * La decisión se toma leyendo el uso real, no adivinando: y aunque esa lectura
 * fallara, las FK ON DELETE RESTRICT de 0112 impedirían el borrado igualmente.
 * El resultado dice cuál de las dos cosas ocurrió, para poder contárselo a la
 * persona en lugar de dejarla suponiendo.
 */
export type PositionRemovalOutcome =
  | { error: null; outcome: "deleted" }
  | { error: null; outcome: "deactivated"; processes: number; assignments: number }
  | { error: string; outcome: null };

export async function removeQualityPosition(positionId: string): Promise<PositionRemovalOutcome> {
  const g = await gate();
  if (!g.ok) return { error: g.error ?? QUALITY_ERRORS.generic, outcome: null };
  if (!canManagePositions(g.ok.roleCode)) {
    return { error: "Solo la administración o el área de calidad gestionan los cargos.", outcome: null };
  }

  // Comparación explícita con null, no comprobación de veracidad: `string`
  // incluye la cadena vacía, así que `if (id.error)` no estrecha el tipo y
  // `id.value` seguiría siendo `string | null`.
  const id = validateUuid(positionId, "cargo");
  if (id.error !== null) return { error: id.error, outcome: null };

  const usage = await getQualityPositionUsage(g.ok.organizationId, id.value);
  const supabase = await createServerClient();

  if (usage.isDeletable) {
    const { error } = await supabase
      .from("quality_positions")
      .delete()
      .eq("id", id.value)
      .eq("organization_id", g.ok.organizationId);
    if (!error) {
      revalidatePath(PATH_POSITIONS);
      return { error: null, outcome: "deleted" };
    }
    // 23503 = violación de clave foránea. Significa que apareció una
    // referencia entre la lectura y el borrado: se desactiva, como si el uso
    // se hubiera detectado antes.
    if (error.code !== "23503") return { error: safeError(error), outcome: null };
  }

  const { error } = await supabase
    .from("quality_positions")
    .update({ is_active: false })
    .eq("id", id.value)
    .eq("organization_id", g.ok.organizationId);
  if (error) return { error: safeError(error), outcome: null };

  revalidatePath(PATH_POSITIONS);
  revalidatePath(PATH_PROCESSES);
  return {
    error: null,
    outcome: "deactivated",
    processes: usage.processes,
    assignments: usage.assignments,
  };
}

export type QualityAssignmentInput = {
  positionId: string;
  profileId: string;
  assignmentType: string;
  effectiveFrom?: string;
  notes?: string;
};

export async function assignPersonToQualityPosition(
  input: QualityAssignmentInput
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePositions(g.ok.roleCode)) {
    return { error: "Solo la administración o el área de calidad asignan cargos." };
  }

  const positionId = validateUuid(input.positionId, "cargo");
  if (positionId.error) return { error: positionId.error };
  const profileId = validateUuid(input.profileId, "persona");
  if (profileId.error) return { error: profileId.error };
  if (!isOneOf(QUALITY_ASSIGNMENT_TYPES, input.assignmentType)) {
    return { error: "El tipo de asignación no es válido." };
  }
  const from = validateIsoDate(input.effectiveFrom, "fecha de inicio");
  if (from.error) return { error: from.error };
  const notes = validateLongText(input.notes, "notas");
  if (notes.error) return { error: notes.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("quality_position_assignments").insert({
    organization_id: g.ok.organizationId,
    position_id: positionId.value,
    profile_id: profileId.value,
    assignment_type: input.assignmentType,
    ...(from.value ? { effective_from: from.value } : {}),
    notes: notes.value,
  });
  if (error) {
    // El índice parcial de 0112 impide un segundo titular vigente; el trigger
    // impide asignar a quien no es miembro activo. Ambos merecen su mensaje.
    if (isUniqueViolation(error)) return { error: QUALITY_ERRORS.holderAlreadyExists };
    if ((error.message ?? "").includes("miembro")) {
      return { error: QUALITY_ERRORS.memberRequired };
    }
    return { error: safeError(error) };
  }

  revalidatePath(PATH_POSITIONS);
  return OK;
}

/** Cierra la vigencia de una asignación (nunca se borra: es historia). */
export async function endQualityPositionAssignment(
  assignmentId: string,
  effectiveTo?: string
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManagePositions(g.ok.roleCode)) {
    return { error: "Solo la administración o el área de calidad gestionan los cargos." };
  }

  const id = validateUuid(assignmentId, "asignación");
  if (id.error) return { error: id.error };
  const to = validateIsoDate(effectiveTo, "fecha de fin");
  if (to.error) return { error: to.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_position_assignments")
    .update({ effective_to: to.value ?? new Date().toISOString().slice(0, 10) })
    .eq("id", id.value)
    .eq("organization_id", g.ok.organizationId)
    .is("effective_to", null);
  if (error) return { error: safeError(error) };

  revalidatePath(PATH_POSITIONS);
  return OK;
}

// ---------------------------------------------------------------------------
// Procesos
// ---------------------------------------------------------------------------

export type QualityProcessInput = {
  name: string;
  code?: string;
  categoryCode: string;
  ownerPositionId?: string;
};

export async function createQualityProcess(
  input: QualityProcessInput
): Promise<{ error: string | null; processId: string | null }> {
  const g = await gate();
  if (!g.ok) return { error: g.error, processId: null };

  const name = validateQualityName(input.name, "nombre del proceso");
  if (name.error) return { error: name.error, processId: null };
  const code = validateQualityCode(input.code);
  if (code.error) return { error: code.error, processId: null };
  const category = validateQualityName(input.categoryCode, "categoría");
  if (category.error) return { error: "Elige una categoría para el proceso.", processId: null };
  const owner = validateOptionalUuid(input.ownerPositionId, "cargo propietario");
  if (owner.error) return { error: owner.error, processId: null };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_processes")
    .insert({
      organization_id: g.ok.organizationId,
      name: name.value,
      code: code.value,
      category_code: category.value,
      owner_position_id: owner.value,
    })
    .select("id")
    .single();
  if (error || !data) return { error: safeError(error), processId: null };

  revalidatePath(PATH_PROCESSES);
  return { error: null, processId: data.id as string };
}

export async function updateQualityProcess(
  processId: string,
  input: QualityProcessInput
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const id = validateUuid(processId, "proceso");
  if (id.error) return { error: id.error };
  const name = validateQualityName(input.name, "nombre del proceso");
  if (name.error) return { error: name.error };
  const code = validateQualityCode(input.code);
  if (code.error) return { error: code.error };
  const owner = validateOptionalUuid(input.ownerPositionId, "cargo propietario");
  if (owner.error) return { error: owner.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_processes")
    .update({
      name: name.value,
      code: code.value,
      category_code: input.categoryCode,
      owner_position_id: owner.value,
    })
    .eq("id", id.value)
    .eq("organization_id", g.ok.organizationId);
  if (error) return { error: safeError(error) };

  revalidatePath(PATH_PROCESSES);
  revalidatePath(`${PATH_PROCESSES}/${id.value}`);
  return OK;
}

/**
 * Retira un proceso o lo devuelve al servicio. NUNCA se borra: sus revisiones
 * publicadas siguen siendo la respuesta a "qué regía el 14 de marzo", y un
 * DELETE se llevaría por delante esa historia. Retirar es un cambio de estado
 * administrativo, reversible.
 */
export async function setQualityProcessRetired(
  processId: string,
  retired: boolean
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canPublishQuality(g.ok.roleCode)) {
    return { error: "Solo la administración o el área de calidad retiran un proceso." };
  }

  const id = validateUuid(processId, "proceso");
  if (id.error) return { error: id.error };

  const supabase = await createServerClient();
  if (retired) {
    const { error } = await supabase
      .from("quality_processes")
      .update({ status: "retired" })
      .eq("id", id.value)
      .eq("organization_id", g.ok.organizationId);
    if (error) return { error: safeError(error) };
  } else {
    // Al reactivar, el estado depende de si llegó a publicarse alguna vez:
    // un proceso sin revisión publicada vuelve a borrador, no a activo.
    const { data } = await supabase
      .from("quality_processes")
      .select("current_revision")
      .eq("id", id.value)
      .eq("organization_id", g.ok.organizationId)
      .maybeSingle();
    if (!data) return { error: QUALITY_ERRORS.notFound };
    const { error } = await supabase
      .from("quality_processes")
      .update({ status: Number(data.current_revision ?? 0) > 0 ? "active" : "draft" })
      .eq("id", id.value)
      .eq("organization_id", g.ok.organizationId);
    if (error) return { error: safeError(error) };
  }

  revalidatePath(PATH_PROCESSES);
  revalidatePath(`${PATH_PROCESSES}/${id.value}`);
  return OK;
}

/**
 * Abre (o reutiliza) el borrador del proceso. Idempotente por diseño: pulsar
 * dos veces no crea dos borradores, la RPC devuelve el que ya estaba abierto.
 */
export async function openQualityProcessRevision(
  processId: string,
  changeNote?: string
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const id = validateUuid(processId, "proceso");
  if (id.error) return { error: id.error };
  const note = validateLongText(changeNote, "motivo del cambio");
  if (note.error) return { error: note.error };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_open_process_revision", {
    p_process_id: id.value,
    p_change_note: note.value,
  });
  if (error) return { error: safeError(error) };

  revalidatePath(`${PATH_PROCESSES}/${id.value}`);
  return OK;
}

export async function updateQualityRevisionContent(
  revisionId: string,
  input: { purpose?: string; scope?: string; changeNote?: string }
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const id = validateUuid(revisionId, "revisión");
  if (id.error) return { error: id.error };
  const purpose = validateLongText(input.purpose, "propósito");
  if (purpose.error) return { error: purpose.error };
  const scope = validateLongText(input.scope, "alcance");
  if (scope.error) return { error: scope.error };
  const note = validateLongText(input.changeNote, "motivo del cambio");
  if (note.error) return { error: note.error };

  const supabase = await createServerClient();
  // El filtro por status='draft' hace explícito que solo se edita el borrador;
  // el trigger de 0112 lo impone igualmente aunque este filtro faltara.
  const { data, error } = await supabase
    .from("quality_process_revisions")
    .update({ purpose: purpose.value, scope: scope.value, change_note: note.value })
    .eq("id", id.value)
    .eq("organization_id", g.ok.organizationId)
    .eq("status", "draft")
    .select("process_id")
    .maybeSingle();
  if (error) return { error: safeError(error) };
  if (!data) return { error: QUALITY_ERRORS.publishedImmutable };

  revalidatePath(`${PATH_PROCESSES}/${data.process_id as string}`);
  return OK;
}

export type QualityIoInput = {
  revisionId: string;
  processId: string;
  direction: string;
  name: string;
  description?: string;
  ioKind: string;
  sortOrder?: number;
};

export async function addQualityProcessIo(input: QualityIoInput): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const revisionId = validateUuid(input.revisionId, "revisión");
  if (revisionId.error) return { error: revisionId.error };
  const processId = validateUuid(input.processId, "proceso");
  if (processId.error) return { error: processId.error };
  if (!isOneOf(QUALITY_IO_DIRECTIONS, input.direction)) {
    return { error: "Indica si es una entrada o una salida." };
  }
  if (!isOneOf(QUALITY_IO_KINDS, input.ioKind)) {
    return { error: "El tipo de entrada/salida no es válido." };
  }
  const name = validateQualityName(input.name, "nombre");
  if (name.error) return { error: name.error };
  const description = validateLongText(input.description, "descripción");
  if (description.error) return { error: description.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("quality_process_io").insert({
    organization_id: g.ok.organizationId,
    revision_id: revisionId.value,
    process_id: processId.value,
    direction: input.direction,
    name: name.value,
    description: description.value,
    io_kind: input.ioKind,
    sort_order: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
  });
  if (error) return { error: safeError(error, QUALITY_ERRORS.publishedImmutable) };

  revalidatePath(`${PATH_PROCESSES}/${processId.value}`);
  return OK;
}

export async function deleteQualityProcessIo(
  ioId: string,
  processId: string
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const id = validateUuid(ioId, "entrada/salida");
  if (id.error) return { error: id.error };
  const pid = validateUuid(processId, "proceso");
  if (pid.error) return { error: pid.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_process_io")
    .delete()
    .eq("id", id.value)
    .eq("organization_id", g.ok.organizationId);
  if (error) return { error: safeError(error, QUALITY_ERRORS.publishedImmutable) };

  revalidatePath(`${PATH_PROCESSES}/${pid.value}`);
  return OK;
}

/**
 * Publica el borrador. Solo admin/quality. La RPC cierra la vigencia de la
 * revisión anterior, marca la nueva como publicada y actualiza el proceso, en
 * una única transacción: no existe un estado intermedio con dos vigentes.
 */
export async function publishQualityProcessRevision(
  revisionId: string,
  effectiveFrom?: string
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canPublishQuality(g.ok.roleCode)) return { error: QUALITY_ERRORS.needsPublisher };

  const id = validateUuid(revisionId, "revisión");
  if (id.error) return { error: id.error };
  const from = validateIsoDate(effectiveFrom, "fecha de entrada en vigor");
  if (from.error) return { error: from.error };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_publish_process_revision", {
    p_revision_id: id.value,
    p_effective_from: from.value,
  });
  if (error) return { error: safeError(error) };

  revalidatePath(PATH_PROCESSES);
  revalidatePath(PATH_MAP);
  return OK;
}

// ---------------------------------------------------------------------------
// Interacciones entre procesos (DA-06)
// ---------------------------------------------------------------------------

export type QualityInteractionInput = {
  sourceProcessId: string;
  targetProcessId: string;
  sourceOutputId?: string;
  targetInputId?: string;
  informationItem?: string;
  description?: string;
};

export async function relateQualityProcesses(
  input: QualityInteractionInput
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const source = validateUuid(input.sourceProcessId, "proceso origen");
  if (source.error) return { error: source.error };
  const target = validateUuid(input.targetProcessId, "proceso destino");
  if (target.error) return { error: target.error };
  if (source.value === target.value) {
    return { error: "Un proceso no puede relacionarse consigo mismo." };
  }
  const outputId = validateOptionalUuid(input.sourceOutputId, "salida");
  if (outputId.error) return { error: outputId.error };
  const inputId = validateOptionalUuid(input.targetInputId, "entrada");
  if (inputId.error) return { error: inputId.error };
  const item = validateQualityName(input.informationItem, "qué se intercambia");
  if (item.error) return { error: item.error };
  const description = validateLongText(input.description, "descripción");
  if (description.error) return { error: description.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("quality_process_interactions").insert({
    organization_id: g.ok.organizationId,
    source_process_id: source.value,
    target_process_id: target.value,
    source_output_id: outputId.value,
    target_input_id: inputId.value,
    information_item: item.value,
    description: description.value,
  });
  if (error) {
    if (isUniqueViolation(error)) {
      return { error: "Esa relación ya está registrada entre ambos procesos." };
    }
    return { error: safeError(error) };
  }

  revalidatePath(`${PATH_PROCESSES}/${source.value}`);
  revalidatePath(`${PATH_PROCESSES}/${target.value}`);
  return OK;
}

export async function deleteQualityInteraction(
  interactionId: string,
  processId: string
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const id = validateUuid(interactionId, "relación");
  if (id.error) return { error: id.error };
  const pid = validateUuid(processId, "proceso");
  if (pid.error) return { error: pid.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_process_interactions")
    .delete()
    .eq("id", id.value)
    .eq("organization_id", g.ok.organizationId);
  if (error) return { error: safeError(error) };

  revalidatePath(`${PATH_PROCESSES}/${pid.value}`);
  return OK;
}

// ---------------------------------------------------------------------------
// Documentos de TrazaDocs (T-03: se REFERENCIA, jamás se copia)
// ---------------------------------------------------------------------------

export async function linkTrazadocToQualityProcess(input: {
  processId: string;
  documentId: string;
  relationType: string;
  notes?: string;
}): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const processId = validateUuid(input.processId, "proceso");
  if (processId.error) return { error: processId.error };
  const documentId = validateUuid(input.documentId, "documento");
  if (documentId.error) return { error: documentId.error };
  if (!isOneOf(QUALITY_DOCUMENT_RELATIONS, input.relationType)) {
    return { error: "El tipo de relación con el documento no es válido." };
  }
  const notes = validateLongText(input.notes, "notas");
  if (notes.error) return { error: notes.error };

  const supabase = await createServerClient();
  const { error } = await supabase.from("quality_process_documents").insert({
    organization_id: g.ok.organizationId,
    process_id: processId.value,
    document_id: documentId.value,
    relation_type: input.relationType,
    notes: notes.value,
  });
  if (error) {
    if (isUniqueViolation(error)) {
      return { error: "Ese documento ya está asociado al proceso con esa relación." };
    }
    return { error: safeError(error, QUALITY_ERRORS.notFound) };
  }

  revalidatePath(`${PATH_PROCESSES}/${processId.value}`);
  return OK;
}

export async function unlinkTrazadocFromQualityProcess(
  linkId: string,
  processId: string
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const id = validateUuid(linkId, "asociación");
  if (id.error) return { error: id.error };
  const pid = validateUuid(processId, "proceso");
  if (pid.error) return { error: pid.error };

  const supabase = await createServerClient();
  // Se borra SOLO la relación: el documento de TrazaDocs queda intacto (T-03).
  const { error } = await supabase
    .from("quality_process_documents")
    .delete()
    .eq("id", id.value)
    .eq("organization_id", g.ok.organizationId);
  if (error) return { error: safeError(error) };

  revalidatePath(`${PATH_PROCESSES}/${pid.value}`);
  return OK;
}

// ---------------------------------------------------------------------------
// Mapa de procesos
// ---------------------------------------------------------------------------

export async function createQualityMap(input: {
  name: string;
  description?: string;
  isDefault?: boolean;
}): Promise<{ error: string | null; mapId: string | null }> {
  const g = await gate();
  if (!g.ok) return { error: g.error, mapId: null };

  const name = validateQualityName(input.name, "nombre del mapa");
  if (name.error) return { error: name.error, mapId: null };
  const description = validateLongText(input.description, "descripción");
  if (description.error) return { error: description.error, mapId: null };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_process_maps")
    .insert({
      organization_id: g.ok.organizationId,
      name: name.value,
      description: description.value,
      is_default: input.isDefault === true,
    })
    .select("id")
    .single();
  if (error || !data) return { error: safeError(error), mapId: null };

  revalidatePath(PATH_MAP);
  return { error: null, mapId: data.id as string };
}

export async function openQualityMapVersion(
  mapId: string,
  changeNote?: string
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const id = validateUuid(mapId, "mapa");
  if (id.error) return { error: id.error };
  const note = validateLongText(changeNote, "motivo del cambio");
  if (note.error) return { error: note.error };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_open_map_version", {
    p_map_id: id.value,
    p_change_note: note.value,
  });
  if (error) return { error: safeError(error) };

  revalidatePath(PATH_MAP);
  return OK;
}

export async function addProcessToQualityMap(input: {
  mapVersionId: string;
  processId: string;
  categoryCode: string;
  sortOrder?: number;
}): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const versionId = validateUuid(input.mapVersionId, "versión del mapa");
  if (versionId.error) return { error: versionId.error };
  const processId = validateUuid(input.processId, "proceso");
  if (processId.error) return { error: processId.error };
  const category = validateQualityName(input.categoryCode, "categoría");
  if (category.error) return { error: "Elige la categoría del bloque." };

  const supabase = await createServerClient();
  const { error } = await supabase.from("quality_process_map_nodes").insert({
    organization_id: g.ok.organizationId,
    map_version_id: versionId.value,
    process_id: processId.value,
    category_code: category.value,
    sort_order: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
  });
  if (error) {
    if (isUniqueViolation(error)) {
      return { error: "Ese proceso ya está en el mapa." };
    }
    return { error: safeError(error, QUALITY_ERRORS.publishedImmutable) };
  }

  revalidatePath(PATH_MAP);
  return OK;
}

export async function removeProcessFromQualityMap(nodeId: string): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  const id = validateUuid(nodeId, "bloque del mapa");
  if (id.error) return { error: id.error };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("quality_process_map_nodes")
    .delete()
    .eq("id", id.value)
    .eq("organization_id", g.ok.organizationId);
  if (error) return { error: safeError(error, QUALITY_ERRORS.publishedImmutable) };

  revalidatePath(PATH_MAP);
  return OK;
}

/**
 * Publica la versión del mapa. Solo admin/quality. La RPC rechaza un mapa sin
 * procesos y cierra la vigencia de la versión anterior en la misma transacción.
 */
export async function publishQualityMapVersion(
  versionId: string,
  effectiveFrom?: string
): Promise<QualityActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canPublishQuality(g.ok.roleCode)) return { error: QUALITY_ERRORS.needsPublisher };

  const id = validateUuid(versionId, "versión del mapa");
  if (id.error) return { error: id.error };
  const from = validateIsoDate(effectiveFrom, "fecha de entrada en vigor");
  if (from.error) return { error: from.error };

  const supabase = await createServerClient();
  const { error } = await supabase.rpc("quality_publish_map_version", {
    p_version_id: id.value,
    p_effective_from: from.value,
  });
  if (error) {
    if ((error.message ?? "").includes("vac")) {
      return { error: "Añade al menos un proceso al mapa antes de publicarlo." };
    }
    return { error: safeError(error) };
  }

  revalidatePath(PATH_MAP);
  return OK;
}
