import "server-only";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop Quality · QUALITY-01 · Lecturas de la fundación de Procesos.
 *
 * Todo corre bajo RLS con la sesión REAL del usuario; nada usa service_role.
 * El filtro por organization_id que se escribe aquí es defensa en profundidad:
 * la RLS de la migración 0112 ya lo impone, pero un `select` explícito deja el
 * alcance visible en el código y evita depender solo de la política.
 *
 * Mapeo manual a camelCase (el repo no genera tipos de Supabase).
 */

/**
 * Deja constancia en el registro del servidor de una consulta que falló.
 *
 * Estas funciones devuelven listas vacías ante un error para que una pantalla
 * nunca reviente por un fallo de lectura. El precio es que un error de
 * programación —una columna mal escrita, un embed inválido— se vuelve
 * indistinguible de "no hay datos". QUALITY-01.1 pagó ese precio: el selector
 * de categorías salía en blanco y nada en ninguna parte decía por qué.
 *
 * No cambia el comportamiento de la interfaz; solo hace que el motivo exista.
 */
function reportQueryFailure(where: string, error: { message?: string; code?: string } | null): void {
  console.error(
    `[quality] consulta fallida en ${where}: ${error?.code ?? "sin código"} · ${error?.message ?? "sin mensaje"}`
  );
}

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

export type QualityCategoryRow = {
  code: string;
  name: string;
  description: string | null;
  displayOrder: number;
  /** NULL = catálogo base de Trazaloop; UUID = categoría propia de la empresa. */
  organizationId: string | null;
};

/**
 * Categorías visibles para la sesión: las cuatro base de Trazaloop
 * (`organization_id is null`, sembradas por 0112) más las propias de la
 * empresa. La RLS de 0112 se encarga de ocultar las de otras empresas.
 *
 * Como las base son GLOBALES, toda empresa las ve desde el primer día sin
 * necesidad de aprovisionar nada: vale igual para las que ya existen, para las
 * nuevas y para una que contrate únicamente Quality.
 */
export async function listQualityCategories(): Promise<QualityCategoryRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_process_categories")
    .select("code, name, description, sort_order, organization_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data) {
    // Un error aquí devolvía silenciosamente una lista vacía, y el selector de
    // categorías aparecía en blanco sin que nada lo delatara: exactamente el
    // defecto que reportó la prueba humana (se pedía `display_order`, una
    // columna que no existe). Devolver [] sigue siendo lo correcto para no
    // romper la pantalla, pero el motivo tiene que quedar registrado.
    reportQueryFailure("listQualityCategories", error);
    return [];
  }
  return data.map((r) => ({
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    displayOrder: Number(r.sort_order ?? 0),
    organizationId: (r.organization_id as string | null) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Cargos y asignaciones (T-02)
// ---------------------------------------------------------------------------

export type QualityPositionRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  orgUnit: string | null;
  isActive: boolean;
  /** Titular vigente resuelto por la vista v_quality_position_current_holder. */
  holderProfileId: string | null;
  holderName: string | null;
  holderEmail: string | null;
  holderSince: string | null;
};

export async function listQualityPositions(organizationId: string): Promise<QualityPositionRow[]> {
  const supabase = await createServerClient();

  const [positions, holders] = await Promise.all([
    supabase
      .from("quality_positions")
      .select("id, code, name, description, org_unit, is_active")
      .eq("organization_id", organizationId)
      .order("name", { ascending: true }),
    supabase
      .from("v_quality_position_current_holder")
      .select("position_id, profile_id, holder_name, holder_email, effective_from")
      .eq("organization_id", organizationId),
  ]);

  if (positions.error || !positions.data) {
    reportQueryFailure("listQualityPositions", positions.error);
    return [];
  }
  if (holders.error) reportQueryFailure("listQualityPositions/holders", holders.error);

  const holderByPosition = new Map<string, Record<string, unknown>>();
  for (const h of holders.data ?? []) {
    holderByPosition.set(h.position_id as string, h as Record<string, unknown>);
  }

  return positions.data.map((r) => {
    const h = holderByPosition.get(r.id as string);
    return {
      id: r.id as string,
      code: (r.code as string | null) ?? null,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      orgUnit: (r.org_unit as string | null) ?? null,
      isActive: Boolean(r.is_active),
      holderProfileId: (h?.profile_id as string | null) ?? null,
      holderName: (h?.holder_name as string | null) ?? null,
      holderEmail: (h?.holder_email as string | null) ?? null,
      holderSince: (h?.effective_from as string | null) ?? null,
    };
  });
}

export type QualityAssignmentRow = {
  id: string;
  positionId: string;
  profileId: string;
  personName: string | null;
  personEmail: string | null;
  assignmentType: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
};

export async function listQualityPositionAssignments(
  organizationId: string,
  positionId: string
): Promise<QualityAssignmentRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_position_assignments")
    .select(
      // profile_id y created_by apuntan ambos a profiles: el hint de constraint
      // desambigua cuál de los dos se está incrustando.
      "id, position_id, profile_id, assignment_type, effective_from, effective_to, notes, profiles!quality_position_assignments_profile_id_fkey(full_name, email)"
    )
    .eq("organization_id", organizationId)
    .eq("position_id", positionId)
    .order("effective_from", { ascending: false });
  if (error || !data) {
    reportQueryFailure("listQualityPositionAssignments", error);
    return [];
  }
  return data.map((r) => {
    const p = (r.profiles ?? null) as { full_name?: string | null; email?: string | null } | null;
    return {
      id: r.id as string,
      positionId: r.position_id as string,
      profileId: r.profile_id as string,
      personName: p?.full_name ?? null,
      personEmail: p?.email ?? null,
      assignmentType: r.assignment_type as string,
      effectiveFrom: r.effective_from as string,
      effectiveTo: (r.effective_to as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
    };
  });
}

/**
 * ¿Qué hay colgando de este cargo? Se usa para decidir, ANTES de intentar el
 * borrado, si un cargo puede eliminarse o solo desactivarse — y sobre todo
 * para poder explicárselo a la persona en lugar de devolverle un error de
 * clave foránea. La barrera real siguen siendo las FK ON DELETE RESTRICT.
 */
export type QualityPositionUsage = {
  processes: number;
  assignments: number;
  /** true si el cargo no ha dejado rastro y puede borrarse sin perder nada. */
  isDeletable: boolean;
};

export async function getQualityPositionUsage(
  organizationId: string,
  positionId: string
): Promise<QualityPositionUsage> {
  const supabase = await createServerClient();
  const [processes, assignments] = await Promise.all([
    supabase.from("quality_processes").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("owner_position_id", positionId),
    supabase.from("quality_position_assignments").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("position_id", positionId),
  ]);
  if (processes.error) reportQueryFailure("getQualityPositionUsage/processes", processes.error);
  if (assignments.error) reportQueryFailure("getQualityPositionUsage/assignments", assignments.error);

  // Ante una lectura fallida se asume que SÍ hay uso: equivocarse hacia
  // "desactivar" conserva los datos; equivocarse hacia "borrar" los destruye.
  const p = processes.error ? 1 : processes.count ?? 0;
  const a = assignments.error ? 1 : assignments.count ?? 0;
  return { processes: p, assignments: a, isDeletable: p === 0 && a === 0 };
}

export async function getQualityPosition(
  organizationId: string,
  positionId: string
): Promise<QualityPositionRow | null> {
  const all = await listQualityPositions(organizationId);
  return all.find((p) => p.id === positionId) ?? null;
}

/** Miembros activos de la empresa, para el desplegable de asignación. */
export type OrgMemberOption = { profileId: string; name: string; email: string | null };

export async function listOrganizationMembersForQuality(
  organizationId: string
): Promise<OrgMemberOption[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, profiles(full_name, email)")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (error || !data) {
    reportQueryFailure("listOrganizationMembersForQuality", error);
    return [];
  }
  return data
    .map((r) => {
      const p = (r.profiles ?? null) as { full_name?: string | null; email?: string | null } | null;
      return {
        profileId: r.user_id as string,
        name: p?.full_name ?? p?.email ?? "Sin nombre",
        email: p?.email ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

// ---------------------------------------------------------------------------
// Procesos
// ---------------------------------------------------------------------------

export type QualityProcessRow = {
  id: string;
  code: string | null;
  name: string;
  categoryCode: string;
  status: string;
  currentRevision: number;
  ownerPositionId: string | null;
  ownerPositionName: string | null;
};

export async function listQualityProcesses(organizationId: string): Promise<QualityProcessRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_processes")
    .select(
      "id, code, name, category_code, status, current_revision, owner_position_id, quality_positions!quality_processes_owner_position_fk(name)"
    )
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });
  if (error || !data) {
    reportQueryFailure("listQualityProcesses", error);
    return [];
  }
  return data.map((r) => {
    const owner = (r.quality_positions ?? null) as { name?: string | null } | null;
    return {
      id: r.id as string,
      code: (r.code as string | null) ?? null,
      name: r.name as string,
      categoryCode: r.category_code as string,
      status: r.status as string,
      currentRevision: Number(r.current_revision ?? 0),
      ownerPositionId: (r.owner_position_id as string | null) ?? null,
      ownerPositionName: owner?.name ?? null,
    };
  });
}

export type QualityRevisionRow = {
  id: string;
  processId: string;
  revisionNumber: number;
  status: string;
  purpose: string | null;
  scope: string | null;
  changeNote: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
};

export type QualityIoRow = {
  id: string;
  revisionId: string;
  direction: string;
  name: string;
  description: string | null;
  ioKind: string;
  sortOrder: number;
};

export type QualityInteractionRow = {
  id: string;
  sourceProcessId: string;
  sourceProcessName: string;
  targetProcessId: string;
  targetProcessName: string;
  informationItem: string | null;
  description: string | null;
};

export type QualityProcessDocumentRow = {
  id: string;
  documentId: string;
  documentTitle: string;
  documentCode: string | null;
  documentStatus: string;
  relationType: string;
};

export type QualityProcessDetail = {
  process: QualityProcessRow;
  /** Todas las revisiones, de la más reciente a la más antigua. */
  revisions: QualityRevisionRow[];
  /** La revisión publicada vigente (versión oficial consultable). */
  currentRevision: QualityRevisionRow | null;
  /** El borrador abierto, si existe: lo único editable. */
  draftRevision: QualityRevisionRow | null;
  /** Entradas/salidas de la revisión que se está mostrando. */
  io: QualityIoRow[];
  interactions: QualityInteractionRow[];
  documents: QualityProcessDocumentRow[];
};

function mapRevision(r: Record<string, unknown>): QualityRevisionRow {
  return {
    id: r.id as string,
    processId: r.process_id as string,
    revisionNumber: Number(r.revision_number ?? 0),
    status: r.status as string,
    purpose: (r.purpose as string | null) ?? null,
    scope: (r.scope as string | null) ?? null,
    changeNote: (r.change_note as string | null) ?? null,
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? null,
  };
}

/**
 * Detalle completo de un proceso. `revisionId` permite consultar una revisión
 * concreta (p. ej. la versión oficial de una fecha pasada); sin él se muestra
 * el borrador abierto si lo hay, y si no, la versión publicada vigente.
 */
export async function getQualityProcessDetail(
  organizationId: string,
  processId: string,
  revisionId?: string
): Promise<QualityProcessDetail | null> {
  const supabase = await createServerClient();

  const [processRes, revisionsRes, interactionsRes, documentsRes] = await Promise.all([
    supabase
      .from("quality_processes")
      .select(
        "id, code, name, category_code, status, current_revision, owner_position_id, quality_positions!quality_processes_owner_position_fk(name)"
      )
      .eq("organization_id", organizationId)
      .eq("id", processId)
      .maybeSingle(),
    supabase
      .from("quality_process_revisions")
      .select(
        "id, process_id, revision_number, status, purpose, scope, change_note, effective_from, effective_to, published_at"
      )
      .eq("organization_id", organizationId)
      .eq("process_id", processId)
      .order("revision_number", { ascending: false }),
    supabase
      .from("quality_process_interactions")
      .select(
        "id, source_process_id, target_process_id, information_item, description, source:quality_processes!quality_process_interactions_source_fk(name), target:quality_processes!quality_process_interactions_target_fk(name)"
      )
      .eq("organization_id", organizationId)
      .or(`source_process_id.eq.${processId},target_process_id.eq.${processId}`)
      .order("sort_order", { ascending: true }),
    supabase
      .from("quality_process_documents")
      .select(
        "id, document_id, relation_type, trazadoc_documents!quality_process_documents_document_fk(title, code, status)"
      )
      .eq("organization_id", organizationId)
      .eq("process_id", processId),
  ]);

  if (processRes.error || !processRes.data) return null;
  const p = processRes.data;
  const owner = (p.quality_positions ?? null) as { name?: string | null } | null;

  const revisions = (revisionsRes.data ?? []).map((r) => mapRevision(r as Record<string, unknown>));
  const currentRevision =
    revisions.find((r) => r.status === "published" && r.effectiveTo === null) ?? null;
  const draftRevision = revisions.find((r) => r.status === "draft") ?? null;

  const shown = revisionId
    ? revisions.find((r) => r.id === revisionId) ?? null
    : draftRevision ?? currentRevision;

  let io: QualityIoRow[] = [];
  if (shown) {
    const { data } = await supabase
      .from("quality_process_io")
      .select("id, revision_id, direction, name, description, io_kind, sort_order")
      .eq("organization_id", organizationId)
      .eq("revision_id", shown.id)
      .order("direction", { ascending: true })
      .order("sort_order", { ascending: true });
    io = (data ?? []).map((r) => ({
      id: r.id as string,
      revisionId: r.revision_id as string,
      direction: r.direction as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      ioKind: r.io_kind as string,
      sortOrder: Number(r.sort_order ?? 0),
    }));
  }

  const interactions: QualityInteractionRow[] = (interactionsRes.data ?? []).map((r) => {
    const src = (r.source ?? null) as { name?: string | null } | null;
    const tgt = (r.target ?? null) as { name?: string | null } | null;
    return {
      id: r.id as string,
      sourceProcessId: r.source_process_id as string,
      sourceProcessName: src?.name ?? "—",
      targetProcessId: r.target_process_id as string,
      targetProcessName: tgt?.name ?? "—",
      informationItem: (r.information_item as string | null) ?? null,
      description: (r.description as string | null) ?? null,
    };
  });

  const documents: QualityProcessDocumentRow[] = (documentsRes.data ?? []).map((r) => {
    const d = (r.trazadoc_documents ?? null) as {
      title?: string | null;
      code?: string | null;
      status?: string | null;
    } | null;
    return {
      id: r.id as string,
      documentId: r.document_id as string,
      documentTitle: d?.title ?? "Documento",
      documentCode: d?.code ?? null,
      documentStatus: d?.status ?? "draft",
      relationType: r.relation_type as string,
    };
  });

  return {
    process: {
      id: p.id as string,
      code: (p.code as string | null) ?? null,
      name: p.name as string,
      categoryCode: p.category_code as string,
      status: p.status as string,
      currentRevision: Number(p.current_revision ?? 0),
      ownerPositionId: (p.owner_position_id as string | null) ?? null,
      ownerPositionName: owner?.name ?? null,
    },
    revisions,
    currentRevision,
    draftRevision,
    io,
    interactions,
    documents,
  };
}

/** Salidas de un proceso y entradas de otro, para construir una interacción. */
export async function listIoForInteraction(
  organizationId: string,
  processId: string,
  direction: "input" | "output"
): Promise<QualityIoRow[]> {
  const supabase = await createServerClient();
  const { data: rev } = await supabase
    .from("quality_process_revisions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("process_id", processId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!rev) return [];
  const { data } = await supabase
    .from("quality_process_io")
    .select("id, revision_id, direction, name, description, io_kind, sort_order")
    .eq("organization_id", organizationId)
    .eq("revision_id", rev.id as string)
    .eq("direction", direction)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    revisionId: r.revision_id as string,
    direction: r.direction as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    ioKind: r.io_kind as string,
    sortOrder: Number(r.sort_order ?? 0),
  }));
}

/** Documentos de TrazaDocs de la empresa, para asociarlos a un proceso. */
export type TrazadocOption = {
  id: string;
  title: string;
  code: string | null;
  status: string;
};

export async function listTrazadocsForQuality(organizationId: string): Promise<TrazadocOption[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_documents")
    .select("id, title, code, status")
    .eq("organization_id", organizationId)
    .neq("status", "obsolete")
    .order("title", { ascending: true });
  if (error || !data) {
    reportQueryFailure("listTrazadocsForQuality", error);
    return [];
  }
  return data.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    code: (r.code as string | null) ?? null,
    status: r.status as string,
  }));
}

/**
 * Lectura INVERSA: qué procesos de Quality referencian un documento de
 * TrazaDocs. Es la otra mitad de T-03 — si desde el proceso se ve el documento
 * pero desde el documento no se ve nada, quien mantiene TrazaDocs no tiene forma
 * de saber a qué procesos afecta antes de marcarlo obsoleto.
 *
 * Devuelve lista vacía si el módulo Quality no está habilitado para la empresa:
 * la comprobación la hace quien llama, y aquí la RLS filtra igualmente.
 */
export type ProcessUsingDocument = {
  processId: string;
  processName: string;
  processCode: string | null;
  processStatus: string;
  relationType: string;
};

export async function listQualityProcessesUsingDocument(
  organizationId: string,
  documentId: string
): Promise<ProcessUsingDocument[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_process_documents")
    .select(
      "relation_type, process_id, quality_processes!quality_process_documents_process_fk(name, code, status)"
    )
    .eq("organization_id", organizationId)
    .eq("document_id", documentId);
  if (error || !data) {
    reportQueryFailure("listQualityProcessesUsingDocument", error);
    return [];
  }
  return data
    .map((r) => {
      const p = (r.quality_processes ?? null) as {
        name?: string | null;
        code?: string | null;
        status?: string | null;
      } | null;
      return {
        processId: r.process_id as string,
        processName: p?.name ?? "—",
        processCode: p?.code ?? null,
        processStatus: p?.status ?? "draft",
        relationType: r.relation_type as string,
      };
    })
    .sort((a, b) => a.processName.localeCompare(b.processName, "es"));
}

// ---------------------------------------------------------------------------
// Mapa de procesos
// ---------------------------------------------------------------------------

export type QualityMapRow = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  currentVersion: number;
};

export async function listQualityMaps(organizationId: string): Promise<QualityMapRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("quality_process_maps")
    .select("id, name, description, is_default, current_version")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error || !data) {
    reportQueryFailure("listQualityMaps", error);
    return [];
  }
  return data.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    isDefault: Boolean(r.is_default),
    currentVersion: Number(r.current_version ?? 0),
  }));
}

export type QualityMapVersionRow = {
  id: string;
  mapId: string;
  versionNumber: number;
  status: string;
  changeNote: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
};

export type QualityMapNodeRow = {
  id: string;
  processId: string;
  processName: string;
  processCode: string | null;
  processStatus: string;
  ownerPositionName: string | null;
  categoryCode: string;
  sortOrder: number;
};

export type QualityMapDetail = {
  map: QualityMapRow;
  versions: QualityMapVersionRow[];
  /** Versión publicada vigente: la que se consulta como oficial. */
  publishedVersion: QualityMapVersionRow | null;
  draftVersion: QualityMapVersionRow | null;
  /** Versión que se está mostrando (y si es editable). */
  shownVersion: QualityMapVersionRow | null;
  nodes: QualityMapNodeRow[];
};

function mapVersion(r: Record<string, unknown>): QualityMapVersionRow {
  return {
    id: r.id as string,
    mapId: r.map_id as string,
    versionNumber: Number(r.version_number ?? 0),
    status: r.status as string,
    changeNote: (r.change_note as string | null) ?? null,
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    publishedAt: (r.published_at as string | null) ?? null,
  };
}

export async function getQualityMapDetail(
  organizationId: string,
  mapId: string,
  versionId?: string
): Promise<QualityMapDetail | null> {
  const supabase = await createServerClient();

  const [mapRes, versionsRes] = await Promise.all([
    supabase
      .from("quality_process_maps")
      .select("id, name, description, is_default, current_version")
      .eq("organization_id", organizationId)
      .eq("id", mapId)
      .maybeSingle(),
    supabase
      .from("quality_process_map_versions")
      .select("id, map_id, version_number, status, change_note, effective_from, effective_to, published_at")
      .eq("organization_id", organizationId)
      .eq("map_id", mapId)
      .order("version_number", { ascending: false }),
  ]);

  if (mapRes.error || !mapRes.data) return null;
  const m = mapRes.data;

  const versions = (versionsRes.data ?? []).map((r) => mapVersion(r as Record<string, unknown>));
  const publishedVersion =
    versions.find((v) => v.status === "published" && v.effectiveTo === null) ?? null;
  const draftVersion = versions.find((v) => v.status === "draft") ?? null;
  const shownVersion = versionId
    ? versions.find((v) => v.id === versionId) ?? null
    : draftVersion ?? publishedVersion;

  let nodes: QualityMapNodeRow[] = [];
  if (shownVersion) {
    const { data } = await supabase
      .from("quality_process_map_nodes")
      .select(
        "id, process_id, category_code, sort_order, quality_processes!quality_process_map_nodes_process_fk(name, code, status, owner_position_id, quality_positions!quality_processes_owner_position_fk(name))"
      )
      .eq("organization_id", organizationId)
      .eq("map_version_id", shownVersion.id)
      .order("sort_order", { ascending: true });
    nodes = (data ?? []).map((r) => {
      const proc = (r.quality_processes ?? null) as {
        name?: string | null;
        code?: string | null;
        status?: string | null;
        quality_positions?: { name?: string | null } | null;
      } | null;
      return {
        id: r.id as string,
        processId: r.process_id as string,
        processName: proc?.name ?? "—",
        processCode: proc?.code ?? null,
        processStatus: proc?.status ?? "draft",
        ownerPositionName: proc?.quality_positions?.name ?? null,
        categoryCode: r.category_code as string,
        sortOrder: Number(r.sort_order ?? 0),
      };
    });
  }

  return { map: { id: m.id as string, name: m.name as string,
                  description: (m.description as string | null) ?? null,
                  isDefault: Boolean(m.is_default),
                  currentVersion: Number(m.current_version ?? 0) },
           versions, publishedVersion, draftVersion, shownVersion, nodes };
}

/** El mapa por defecto de la empresa (el que abre /quality/map). */
export async function getDefaultQualityMapId(organizationId: string): Promise<string | null> {
  const maps = await listQualityMaps(organizationId);
  return maps[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Resumen para el inicio del módulo
// ---------------------------------------------------------------------------

export type QualitySummary = {
  positions: number;
  processes: number;
  publishedProcesses: number;
  maps: number;
  hasPublishedMap: boolean;
  /** Documentos PROPIOS de Quality (module_key = 'quality'). */
  documents: number;
};

export async function getQualitySummary(organizationId: string): Promise<QualitySummary> {
  const supabase = await createServerClient();
  const [positions, processes, published, maps, publishedMaps, documents] = await Promise.all([
    supabase.from("quality_positions").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("is_active", true),
    supabase.from("quality_processes").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase.from("quality_processes").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("status", "active"),
    supabase.from("quality_process_maps").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase.from("quality_process_map_versions").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("status", "published").is("effective_to", null),
    supabase.from("trazadoc_documents").select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId).eq("module_key", "quality"),
  ]);
  return {
    positions: positions.count ?? 0,
    processes: processes.count ?? 0,
    publishedProcesses: published.count ?? 0,
    maps: maps.count ?? 0,
    hasPublishedMap: (publishedMaps.count ?? 0) > 0,
    documents: documents.count ?? 0,
  };
}
