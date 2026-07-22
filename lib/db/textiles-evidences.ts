import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCanonicalTextileObjectPath } from "@/lib/domain/textiles-evidences";

/**
 * Trazaloop · Sprint T5 (Textil) · Consultas de evidencias textiles.
 * Todo bajo RLS con la sesión real; nada usa service_role. La apertura de
 * archivos usa SIGNED URLs de corta vida (bucket privado `evidences`).
 */

const EVIDENCES_BUCKET = "evidences";
const SIGNED_URL_TTL_SECONDS = 60 * 10;

export type TextileEvidenceRow = {
  id: string;
  title: string;
  evidenceType: string;
  description: string | null;
  documentDate: string | null;
  issuer: string | null;
  referenceCode: string | null;
  fileName: string | null;
  filePath: string;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  status: string;
  reviewNotes: string | null;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
  reviewedAt: string | null;
  createdAt: string;
  linkCount: number;
};

function mapEvidence(r: Record<string, unknown>, linkCount: number): TextileEvidenceRow {
  return {
    id: r.id as string,
    title: r.title as string,
    evidenceType: r.evidence_type as string,
    description: (r.description as string | null) ?? null,
    documentDate: (r.document_date as string | null) ?? null,
    issuer: (r.issuer as string | null) ?? null,
    referenceCode: (r.reference_code as string | null) ?? null,
    fileName: (r.file_name as string | null) ?? null,
    filePath: r.file_path as string,
    fileMimeType: (r.file_mime_type as string | null) ?? null,
    fileSizeBytes: r.file_size_bytes === null ? null : Number(r.file_size_bytes),
    status: r.status as string,
    reviewNotes: (r.review_notes as string | null) ?? null,
    validFrom: (r.valid_from as string | null) ?? null,
    validUntil: (r.valid_until as string | null) ?? null,
    isActive: Boolean(r.is_active),
    reviewedAt: (r.reviewed_at as string | null) ?? null,
    createdAt: r.created_at as string,
    linkCount,
  };
}

const EVIDENCE_COLUMNS =
  "id, title, evidence_type, description, document_date, issuer, reference_code, file_name, file_path, file_mime_type, file_size_bytes, status, review_notes, valid_from, valid_until, is_active, reviewed_at, created_at";

export async function listTextileEvidences(
  organizationId: string,
  filters?: { evidenceType?: string; status?: string }
): Promise<TextileEvidenceRow[]> {
  const supabase = await createServerClient();
  let query = supabase
    .from("textile_evidences")
    .select(EVIDENCE_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (filters?.evidenceType) query = query.eq("evidence_type", filters.evidenceType);
  if (filters?.status) query = query.eq("status", filters.status);

  const [{ data, error }, { data: links }] = await Promise.all([
    query,
    supabase
      .from("textile_evidence_links")
      .select("evidence_id")
      .eq("organization_id", organizationId),
  ]);
  if (error || !data) return [];
  const counts = new Map<string, number>();
  for (const l of links ?? []) {
    const id = l.evidence_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return data.map((r) => mapEvidence(r as Record<string, unknown>, counts.get(r.id as string) ?? 0));
}

export async function getTextileEvidence(
  organizationId: string,
  evidenceId: string
): Promise<TextileEvidenceRow | null> {
  const supabase = await createServerClient();
  const [{ data, error }, { count }] = await Promise.all([
    supabase
      .from("textile_evidences")
      .select(EVIDENCE_COLUMNS)
      .eq("organization_id", organizationId)
      .eq("id", evidenceId)
      .maybeSingle(),
    supabase
      .from("textile_evidence_links")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("evidence_id", evidenceId),
  ]);
  if (error || !data) return null;
  return mapEvidence(data as Record<string, unknown>, count ?? 0);
}

/** Signed URL de corta vida para abrir el archivo (RLS de storage aplica). */
export async function getTextileEvidenceSignedUrl(filePath: string): Promise<string | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage
    .from(EVIDENCES_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

export type TextileEvidenceLinkRow = {
  id: string;
  evidenceId: string;
  entityType: string;
  entityId: string;
  linkType: string;
  notes: string | null;
  entityLabel: string | null;
};

/** Resolución de nombres de entidades por tipo (para mostrar vínculos). */
async function resolveEntityLabels(
  organizationId: string,
  pairs: Array<{ entityType: string; entityId: string }>
): Promise<Map<string, string>> {
  const supabase = await createServerClient();
  const byType = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (!byType.has(p.entityType)) byType.set(p.entityType, new Set());
    byType.get(p.entityType)!.add(p.entityId);
  }
  const labels = new Map<string, string>();
  const simple: Array<[string, string, string]> = [
    ["supplier", "textile_suppliers", "name"],
    ["material", "textile_materials", "name"],
    ["component", "textile_components", "name"],
    ["process", "textile_processes", "name"],
    ["outsourced_process", "textile_outsourced_processes", "name"],
    ["collection", "textile_collections", "name"],
    ["product", "textile_products", "name"],
    ["reference", "textile_references", "sku"],
    // T6: entidades de trazabilidad
    ["production_order", "textile_production_orders", "order_code"],
    ["input_lot", "textile_input_lots", "lot_code"],
    ["order_process_step", "textile_order_process_steps", "name"],
    ["output_lot", "textile_output_lots", "output_lot_code"],
    ["circularity_assessment", "textile_circularity_assessments", "assessment_code"],
  ];
  await Promise.all(
    simple.map(async ([type, table, column]) => {
      const ids = [...(byType.get(type) ?? [])];
      if (ids.length === 0) return;
      const { data } = await supabase
        .from(table)
        .select(`id, ${column}`)
        .eq("organization_id", organizationId)
        .in("id", ids);
      for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        labels.set(`${type}:${r.id as string}`, String(r[column] ?? ""));
      }
    })
  );
  const fiberIds = [...(byType.get("fiber_composition") ?? [])];
  if (fiberIds.length > 0) {
    const { data } = await supabase
      .from("textile_reference_fiber_composition")
      .select("id, percentage, textile_fiber_types(name), textile_references(sku)")
      .eq("organization_id", organizationId)
      .in("id", fiberIds);
    for (const r of data ?? []) {
      const fiber = r.textile_fiber_types as unknown as { name: string } | null;
      const ref = r.textile_references as unknown as { sku: string } | null;
      labels.set(
        `fiber_composition:${r.id as string}`,
        `${fiber?.name ?? "Fibra"} ${Number(r.percentage)} % · ${ref?.sku ?? ""}`.trim()
      );
    }
  }
  return labels;
}

export async function listTextileEvidenceLinks(
  organizationId: string,
  evidenceId: string
): Promise<TextileEvidenceLinkRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("textile_evidence_links")
    .select("id, evidence_id, entity_type, entity_id, link_type, notes")
    .eq("organization_id", organizationId)
    .eq("evidence_id", evidenceId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  const labels = await resolveEntityLabels(
    organizationId,
    data.map((r) => ({ entityType: r.entity_type as string, entityId: r.entity_id as string }))
  );
  return data.map((r) => ({
    id: r.id as string,
    evidenceId: r.evidence_id as string,
    entityType: r.entity_type as string,
    entityId: r.entity_id as string,
    linkType: r.link_type as string,
    notes: (r.notes as string | null) ?? null,
    entityLabel: labels.get(`${r.entity_type as string}:${r.entity_id as string}`) ?? null,
  }));
}

export type EntityEvidenceRow = {
  linkId: string;
  linkType: string;
  entityType: string;
  entityId: string;
  evidence: {
    id: string;
    title: string;
    evidenceType: string;
    status: string;
    validUntil: string | null;
  };
};

/** Evidencias que tocan una lista de (entity_type, entity_id) de la empresa. */
export async function listEntityTextileEvidences(
  organizationId: string,
  targets: Array<{ entityType: string; entityId: string }>
): Promise<EntityEvidenceRow[]> {
  if (targets.length === 0) return [];
  const supabase = await createServerClient();
  const types = [...new Set(targets.map((t) => t.entityType))];
  const ids = [...new Set(targets.map((t) => t.entityId))];
  const { data, error } = await supabase
    .from("textile_evidence_links")
    .select("id, entity_type, entity_id, link_type, textile_evidences(id, title, evidence_type, status, valid_until)")
    .eq("organization_id", organizationId)
    .in("entity_type", types)
    .in("entity_id", ids);
  if (error || !data) return [];
  const wanted = new Set(targets.map((t) => `${t.entityType}:${t.entityId}`));
  const rows: EntityEvidenceRow[] = [];
  for (const r of data) {
    const key = `${r.entity_type as string}:${r.entity_id as string}`;
    if (!wanted.has(key)) continue;
    const ev = r.textile_evidences as unknown as {
      id: string; title: string; evidence_type: string; status: string; valid_until: string | null;
    } | null;
    if (!ev) continue;
    rows.push({
      linkId: r.id as string,
      linkType: r.link_type as string,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      evidence: {
        id: ev.id,
        title: ev.title,
        evidenceType: ev.evidence_type,
        status: ev.status,
        validUntil: ev.valid_until ?? null,
      },
    });
  }
  return rows;
}

export async function textileEvidenceBelongsToOrg(
  organizationId: string,
  evidenceId: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_evidences")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", evidenceId)
    .maybeSingle();
  return Boolean(data);
}

/** ¿La entidad destino pertenece a la empresa? (el trigger SQL re-verifica) */
export async function textileEntityBelongsToOrg(
  organizationId: string,
  entityType: string,
  entityId: string
): Promise<boolean> {
  const tableByType: Record<string, string> = {
    supplier: "textile_suppliers",
    material: "textile_materials",
    component: "textile_components",
    process: "textile_processes",
    outsourced_process: "textile_outsourced_processes",
    collection: "textile_collections",
    product: "textile_products",
    reference: "textile_references",
    fiber_composition: "textile_reference_fiber_composition",
    reference_material: "textile_reference_materials",
    reference_component: "textile_reference_components",
    // T6: entidades de trazabilidad
    production_order: "textile_production_orders",
    input_lot: "textile_input_lots",
    order_consumption: "textile_order_consumptions",
    order_process_step: "textile_order_process_steps",
    output_lot: "textile_output_lots",
    circularity_assessment: "textile_circularity_assessments",
  };
  const table = tableByType[entityType];
  if (!table) return false;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from(table)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .maybeSingle();
  return Boolean(data);
}

export type LinkableEntityOption = { id: string; label: string };

/** Opciones de entidades vinculables por tipo (para el selector del detalle). */
export async function listLinkableEntities(
  organizationId: string
): Promise<Record<string, LinkableEntityOption[]>> {
  const supabase = await createServerClient();
  const result: Record<string, LinkableEntityOption[]> = {};
  const simple: Array<[string, string, string]> = [
    ["supplier", "textile_suppliers", "name"],
    ["material", "textile_materials", "name"],
    ["component", "textile_components", "name"],
    ["process", "textile_processes", "name"],
    ["outsourced_process", "textile_outsourced_processes", "name"],
    ["collection", "textile_collections", "name"],
    ["product", "textile_products", "name"],
    ["reference", "textile_references", "sku"],
    // T6: selector de entidades de trazabilidad (order_consumption es
    // vinculable por BD/acciones pero sin selector propio, como
    // reference_material — documentado).
    ["production_order", "textile_production_orders", "order_code"],
    ["input_lot", "textile_input_lots", "lot_code"],
    ["order_process_step", "textile_order_process_steps", "name"],
    ["output_lot", "textile_output_lots", "output_lot_code"],
    ["circularity_assessment", "textile_circularity_assessments", "assessment_code"],
  ];
  await Promise.all(
    simple.map(async ([type, table, column]) => {
      const { data } = await supabase
        .from(table)
        .select(`id, ${column}`)
        .eq("organization_id", organizationId)
        .order(column, { ascending: true });
      result[type] = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        label: String(r[column] ?? ""),
      }));
    })
  );
  const { data: fibers } = await supabase
    .from("textile_reference_fiber_composition")
    .select("id, percentage, textile_fiber_types(name), textile_references(sku)")
    .eq("organization_id", organizationId);
  result["fiber_composition"] = (fibers ?? []).map((r) => {
    const fiber = r.textile_fiber_types as unknown as { name: string } | null;
    const ref = r.textile_references as unknown as { sku: string } | null;
    return {
      id: r.id as string,
      label: `${ref?.sku ?? "SKU"} · ${fiber?.name ?? "Fibra"} ${Number(r.percentage)} %`,
    };
  });
  return result;
}

// ---------------------------------------------------------------------------
// T9E.1/T9E.2 · Intentos de carga DIRECTA (tabla 0094 + hardening 0097).
// Desde T9E.2 los clientes NO tienen INSERT/UPDATE/DELETE directos sobre la
// tabla: toda transición pasa por RPCs SECURITY DEFINER que re-validan rol
// y CREADOR. Todo con la SESIÓN DEL USUARIO; jamás service_role. El token
// firmado de carga NUNCA se persiste.
// ---------------------------------------------------------------------------

export type TextileEvidenceUploadIntentRow = {
  id: string;
  organizationId: string;
  createdBy: string;
  bucketId: string;
  objectPath: string;
  originalFilename: string;
  safeFilename: string;
  expectedSizeBytes: number;
  expectedMimeType: string;
  status: string;
  expiresAt: string;
  consumedAt: string | null;
  evidenceId: string | null;
  cleanupAttempts: number;
};

const INTENT_COLUMNS =
  "id, organization_id, created_by, bucket_id, object_path, original_filename, safe_filename, expected_size_bytes, expected_mime_type, status, expires_at, consumed_at, evidence_id, cleanup_attempts";

function mapIntent(r: Record<string, unknown>): TextileEvidenceUploadIntentRow {
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    createdBy: r.created_by as string,
    bucketId: r.bucket_id as string,
    objectPath: r.object_path as string,
    originalFilename: r.original_filename as string,
    safeFilename: r.safe_filename as string,
    expectedSizeBytes: Number(r.expected_size_bytes),
    expectedMimeType: r.expected_mime_type as string,
    status: r.status as string,
    expiresAt: r.expires_at as string,
    consumedAt: (r.consumed_at as string | null) ?? null,
    evidenceId: (r.evidence_id as string | null) ?? null,
    cleanupAttempts: Number(r.cleanup_attempts ?? 0),
  };
}

/** Metadata funcional canónica del intento (claves del dominio, snake_case). */
export type TextileEvidenceIntentMetadata = {
  title: string;
  evidence_type: string;
  description: string | null;
  document_date: string | null;
  issuer: string | null;
  reference_code: string | null;
  valid_from: string | null;
  valid_until: string | null;
};

/**
 * T9E.2 · INICIO por RPC (0097): valida rol/archivo/metadata en BD y
 * construye la ruta EXACTA en servidor. Devuelve el código de error interno
 * de la RPC (p. ej. METADATA_TITLE_INVALID) para traducirlo a mensaje.
 */
export async function beginTextileEvidenceUploadRpc(input: {
  organizationId: string;
  fileName: string;
  fileSizeBytes: number;
  fileMimeType: string;
  metadata: TextileEvidenceIntentMetadata;
  ttlMinutes: number;
}): Promise<
  | { intentId: string; objectPath: string; errorCode: null }
  | { intentId: null; objectPath: null; errorCode: string }
> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("begin_textile_evidence_upload", {
    p_organization_id: input.organizationId,
    p_file_name: input.fileName,
    p_file_size_bytes: input.fileSizeBytes,
    p_file_mime_type: input.fileMimeType,
    p_metadata: input.metadata,
    p_ttl_minutes: input.ttlMinutes,
  });
  if (error || !data) {
    return { intentId: null, objectPath: null, errorCode: error?.message ?? "RPC_FAILED" };
  }
  const row = data as { intent_id?: string; object_path?: string };
  if (!row.intent_id || !row.object_path) {
    return { intentId: null, objectPath: null, errorCode: "RPC_FAILED" };
  }
  return { intentId: row.intent_id, objectPath: row.object_path, errorCode: null };
}

/**
 * T9E.2 · FINALIZACIÓN ATÓMICA por RPC (0097): insert de la evidencia +
 * consumo del intento en UNA transacción (FOR UPDATE), idempotente. El
 * tamaño y el MIME provienen del objeto REAL verificado por el servidor.
 */
export async function finalizeTextileEvidenceUploadRpc(
  actorId: string,
  intentId: string,
  realSizeBytes: number,
  realMimeType: string
): Promise<
  | { evidenceId: string; alreadyFinalized: boolean; errorCode: null }
  | { evidenceId: null; alreadyFinalized: false; errorCode: string }
> {
  // T9E.3 · SERVER-ONLY: la RPC de finalización ya no es ejecutable por
  // authenticated (0098) — solo el cliente administrativo de servidor la
  // invoca, DESPUÉS de que la Server Action verificó objeto REAL + firma
  // binaria. El actor va explícito (auth.uid() es NULL bajo service_role)
  // y la RPC re-valida membresía, rol, creador, estado y expiración.
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("finalize_textile_evidence_upload_server", {
    p_actor_id: actorId,
    p_intent_id: intentId,
    p_file_size_bytes: realSizeBytes,
    p_file_mime_type: realMimeType,
  });
  if (error || !data) {
    return { evidenceId: null, alreadyFinalized: false, errorCode: error?.message ?? "RPC_FAILED" };
  }
  const row = data as { evidence_id?: string; already_finalized?: boolean };
  if (!row.evidence_id) {
    return { evidenceId: null, alreadyFinalized: false, errorCode: "RPC_FAILED" };
  }
  return {
    evidenceId: row.evidence_id,
    alreadyFinalized: Boolean(row.already_finalized),
    errorCode: null,
  };
}

/** T9E.2 · Marca de fallo controlada (solo el creador, solo desde pending). */
export async function markTextileEvidenceUploadFailedRpc(intentId: string): Promise<void> {
  const supabase = await createServerClient();
  await supabase.rpc("mark_textile_evidence_upload_failed", { p_intent_id: intentId });
}

/**
 * T9E.2 · Cierre de limpieza RECUPERABLE: solo transiciona a 'expired'
 * cuando el llamador CONFIRMÓ el retiro del objeto; con removed=false
 * registra el fallo (contador + fecha) y el intento sigue siendo candidato.
 * Jamás toca consumidos; jamás cierra rutas ligadas a evidencias reales.
 */
export async function recordTextileUploadIntentCleanupRpc(
  actorId: string,
  intentId: string,
  removed: boolean
): Promise<string> {
  // T9E.3 · SERVER-ONLY: `removed` refleja el resultado REAL de
  // storage.remove() inspeccionado por el SERVIDOR — el navegador jamás
  // puede afirmarlo (la RPC de 0097 quedó sellada en 0098).
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("record_textile_upload_intent_cleanup_server", {
    p_actor_id: actorId,
    p_intent_id: intentId,
    p_removed: removed,
  });
  if (error || typeof data !== "string") return "rpc_failed";
  return data;
}

export async function getTextileEvidenceUploadIntent(
  organizationId: string,
  intentId: string
): Promise<TextileEvidenceUploadIntentRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_evidence_upload_intents")
    .select(INTENT_COLUMNS)
    .eq("id", intentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ? mapIntent(data as Record<string, unknown>) : null;
}

/** Intentos pendientes ya vencidos DEL PROPIO USUARIO (la RLS de 0097
 * limita el SELECT al creador): candidatos de limpieza oportunista acotada.
 * El barrido de toda la organización corresponde al script administrativo. */
export async function listExpiredPendingTextileUploadIntents(
  organizationId: string,
  limit: number
): Promise<TextileEvidenceUploadIntentRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_evidence_upload_intents")
    .select(INTENT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .limit(limit);
  return (data ?? []).map((r) => mapIntent(r as Record<string, unknown>));
}

/** T9E.3 · Intentos YA expirados recientes DEL PROPIO USUARIO (ventana de
 * gracia del token de subida): candidatos a re-barrido por si una subida
 * tardía re-creó el objeto en su ruta. */
export async function listRecentlyExpiredTextileUploadIntents(
  organizationId: string,
  withinHours: number,
  limit: number
): Promise<TextileEvidenceUploadIntentRow[]> {
  const supabase = await createServerClient();
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("textile_evidence_upload_intents")
    .select(INTENT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("status", "expired")
    .gte("last_cleanup_attempt_at", since)
    .order("last_cleanup_attempt_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => mapIntent(r as Record<string, unknown>));
}

/** T9E.2 · ¿La ruta pertenece a una evidencia REAL de la organización?
 * (barrera previa a cualquier retiro de objeto: jamás borrar el archivo de
 * una evidencia registrada). */
export async function textileEvidenceExistsForPath(
  organizationId: string,
  objectPath: string
): Promise<boolean> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("textile_evidences")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("file_path", objectPath)
    .limit(1);
  return Boolean(data && data.length > 0);
}

/** Metadata REAL del objeto subido (tamaño y Content-Type según Storage).
 * OJO (T9E.2): el Content-Type almacenado proviene del header del PUT del
 * navegador — NUNCA es prueba del formato real; la finalización exige
 * además la FIRMA BINARIA (detectTextileEvidenceFileType). */
export async function getTextileEvidenceObjectInfo(
  objectPath: string
): Promise<{ sizeBytes: number | null; mimeType: string | null } | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage.from(EVIDENCES_BUCKET).info(objectPath);
  if (error || !data) return null;
  return {
    sizeBytes: typeof data.size === "number" ? data.size : null,
    mimeType: (data.contentType as string | undefined) ?? null,
  };
}

/** T9E.2 · Bytes REALES del objeto (≤ 20 MB, verificado antes) para la
 * verificación de firma binaria en servidor. Con la sesión del usuario
 * (política select de storage); jamás el archivo viaja por Server Action. */
export async function downloadTextileEvidenceObjectBytes(
  objectPath: string
): Promise<Uint8Array | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage.from(EVIDENCES_BUCKET).download(objectPath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * T9E.4 · Retiro FÍSICO de un objeto provisional textil, SERVER-ONLY.
 *
 * Desde 0099 el bucket `evidences` no tiene ninguna política DELETE para
 * `authenticated`: ningún cliente puede borrar objetos textiles. La retirada
 * legítima ocurre exclusivamente aquí, con el cliente ADMINISTRATIVO
 * (`import "server-only"`), y SOLO tras comprobar en la base que el objeto no
 * pertenece a una evidencia real.
 *
 * La RUTA NO SE RECIBE: se lee del propio intento (`object_path`), de modo que
 * jamás puede ser una ruta arbitraria enviada por el cliente. Además se valida
 * su forma canónica ({org}/textiles/{intent}/{archivo}, sin traversal).
 *
 * Devuelve true SOLO si Storage confirmó el retiro — la limpieza nunca se da
 * por cerrada sin esa confirmación, de modo que un fallo deja el intento como
 * candidato recuperable (T9E.2).
 */
export async function removeTextileEvidenceObject(intentId: string): Promise<boolean> {
  const admin = createAdminClient();

  // (1) La ruta CANÓNICA sale de la base, nunca del llamador.
  const { data: intentRow } = await admin
    .from("textile_evidence_upload_intents")
    .select("id, organization_id, object_path, bucket_id, status, evidence_id")
    .eq("id", intentId)
    .maybeSingle();
  if (!intentRow) return false;

  const objectPath = String(intentRow.object_path ?? "");
  if (intentRow.bucket_id !== EVIDENCES_BUCKET) return false;
  if (
    !isCanonicalTextileObjectPath(
      objectPath,
      String(intentRow.organization_id),
      String(intentRow.id)
    )
  ) {
    return false;
  }

  // (2) Jamás se retira el objeto de una evidencia: ni intento consumido, ni
  //     intento ya ligado, ni ruta registrada como archivo de una evidencia.
  if (intentRow.status === "consumed") return false;
  if (intentRow.evidence_id !== null) return false;
  const { data: linked } = await admin
    .from("textile_evidences")
    .select("id")
    .eq("file_path", objectPath)
    .limit(1);
  if (linked && linked.length > 0) return false;

  // (3) Retiro real y resultado REAL (no se asume éxito).
  const { error } = await admin.storage.from(EVIDENCES_BUCKET).remove([objectPath]);
  return !error;
}

/**
 * Signed UPLOAD URL para la ruta EXACTA del intento, emitida con la sesión
 * del usuario (la política insert de storage decide; jamás service_role).
 * El token viaja UNA vez al cliente y no se almacena.
 */
export async function createTextileEvidenceSignedUploadUrl(
  objectPath: string
): Promise<{ signedUrl: string; token: string } | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage
    .from(EVIDENCES_BUCKET)
    .createSignedUploadUrl(objectPath);
  if (error || !data) return null;
  return { signedUrl: data.signedUrl, token: data.token };
}
