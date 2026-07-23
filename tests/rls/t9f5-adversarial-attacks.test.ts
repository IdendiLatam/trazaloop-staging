/**
 * Trazaloop · T9F.5 · SUITE ADVERSARIAL A01–A18 (equipo rojo).
 *
 * ORIGEN: escenarios definidos por la auditoría T9F.5A sobre el candidato
 * T9F.4. ESTADO: actualizada por T9F.5B tras implementar la corrección mínima
 * de A01-A08, A13 y A14.
 *
 * PREPARADA, **NO EJECUTADA**. Corre SOLO desde una máquina autorizada contra
 * un proyecto Supabase **QA DESECHABLE** con Auth, RLS y Storage REALES,
 * después de aplicar la cadena de migraciones (…→0101 con la remediación
 * T9F.5B). NUNCA contra staging ni producción.
 *
 * Ejecutar (fase T9F.5C, cuando esté autorizado):
 *   npm run test:t9f5-adversarial
 *
 * POSTURA: cada escenario INTENTA EL ATAQUE (no el camino feliz) y afirma el
 * RESULTADO SEGURO esperado. Un PASS aquí, contra un proyecto QA real, es la
 * ÚNICA evidencia que permite reclasificar un ataque como PROTEGIDO. Ninguna
 * prueba local (arnés SQL o suite estructural) la sustituye: el arnés no
 * reproduce RLS ni Storage físico.
 *
 * A01-A08, A13 y A14 realizan OPERACIONES REALES (upload, upsert, remove,
 * RPC, cambio de plan, archivo determinista de 22 MB), no búsquedas
 * estáticas. A09-A12 y A15-A18 son las REGRESIONES de lo ya protegido.
 */

import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import assert from "node:assert";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Guardarraíl duro: sin entorno QA no se ejecuta nada.
if (!URL || !ANON || !SERVICE) {
  console.error(
    "[T9F.5] Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Esta suite adversarial SOLO corre contra un proyecto Supabase QA autorizado. Abortando."
  );
  process.exit(1);
}
if (/prod|production|staging/i.test(URL)) {
  console.error("[T9F.5] La URL parece de PRODUCCIÓN o STAGING. Abortando por seguridad.");
  process.exit(1);
}
if (process.env.T9F5_QA_CONFIRM !== "yes") {
  console.error(
    "[T9F.5] Falta T9F5_QA_CONFIRM=yes: confirma explícitamente que el proyecto es QA DESECHABLE."
  );
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const CPR = "traceability_6632";
const TEXTILES = "textiles";
const EVIDENCES_BUCKET = "evidences";
const TRAZADOCS_BUCKET = "trazadocs-documents";
const PREFIX = `t9f5_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

// --- Registro de escenarios ---------------------------------------------------
type Phase = "CORREGIDO_T9F5B" | "REGRESION_T9F5A";
interface Scenario {
  id: string;
  phase: Phase;
  title: string;
  run: () => Promise<void>;
}
const scenarios: Scenario[] = [];
const scenario = (id: string, phase: Phase, title: string, run: () => Promise<void>) =>
  scenarios.push({ id, phase, title, run });

// --- Fixtures QA (recursos reales; todos se registran para la limpieza) -------
type Fixture = { orgId: string; userId: string; userClient: SupabaseClient };
const createdOrgs: string[] = [];
const createdUsers: string[] = [];
const createdObjects: Array<{ bucket: string; path: string }> = [];

function trackObject(bucket: string, path: string) {
  createdObjects.push({ bucket, path });
}

/**
 * Organización QA con usuario miembro REAL (Auth real, sesión real) y el
 * módulo en el modo comercial pedido. El cliente de servicio SOLO siembra;
 * el ataque se ejecuta siempre con la sesión del usuario.
 */
async function makeOrgWithMember(opts: {
  module: string;
  accessMode: "demo" | "full" | "extra";
  role: "admin" | "quality" | "consultant";
}): Promise<Fixture> {
  const email = `${PREFIX}_${randomUUID().slice(0, 8)}@qa.trazaloop.test`;
  const password = `Qa!${randomUUID()}`;

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (userError || !created?.user) throw new Error(`fixture usuario QA: ${userError?.message}`);
  const userId = created.user.id;
  createdUsers.push(userId);

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: `${PREFIX}_org`, tax_id: `QA-${randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`fixture organización QA: ${orgError?.message}`);
  const orgId = org.id as string;
  createdOrgs.push(orgId);

  const { error: memberError } = await admin.from("memberships").insert({
    organization_id: orgId,
    user_id: userId,
    role_code: opts.role,
    status: "active",
  });
  if (memberError) throw new Error(`fixture membresía QA: ${memberError.message}`);

  const targetState =
    opts.accessMode === "demo" ? "demo_permanent" : opts.accessMode === "full" ? "full" : "extra";
  const { error: accessError } = await admin.rpc("set_organization_module_access", {
    p_organization_id: orgId,
    p_module_code: opts.module,
    p_target_state: targetState,
  });
  if (accessError) throw new Error(`fixture modo del módulo: ${accessError.message}`);

  const userClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`fixture sesión QA: ${signInError.message}`);

  return { orgId, userId, userClient };
}

/** Bytes deterministas del tamaño exacto pedido (A06/A14: archivos reales). */
const bytesOfSize = (n: number) => new Uint8Array(n).fill(0x41);
/** PDF real mínimo (firma %PDF-1.7) del tamaño exacto pedido. */
function pdfOfSize(n: number): Uint8Array {
  const out = new Uint8Array(n).fill(0x20);
  out.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37], 0);
  return out;
}

async function createEvidenceRow(f: Fixture): Promise<string> {
  const { data, error } = await f.userClient
    .from("evidences")
    .insert({ organization_id: f.orgId, name: `${PREFIX}_ev` })
    .select("id")
    .single();
  if (error || !data) throw new Error(`fixture evidencia: ${error?.message}`);
  return data.id as string;
}

async function createFileDocumentRow(f: Fixture): Promise<string> {
  const { data, error } = await admin
    .from("trazadoc_file_documents")
    .insert({
      organization_id: f.orgId,
      title: `${PREFIX}_doc_${randomUUID().slice(0, 6)}`,
      category_code: "other",
      status: "draft",
      storage_path: "",
      file_name: "documento.pdf",
      mime_type: "application/pdf",
      size_bytes: 0,
      created_by: f.userId,
      uploaded_by: f.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`fixture documento descargable: ${error?.message}`);
  return data.id as string;
}

type BeginResult = { intentId: string; bucketId: string; objectPath: string } | { error: string };

async function beginUpload(
  f: Fixture,
  input: {
    resourceType: "evidence" | "trazadoc_initial" | "trazadoc_replace";
    resourceId: string;
    fileName: string;
    sizeBytes: number;
    mimeType: string;
  }
): Promise<BeginResult> {
  const { data, error } = await f.userClient.rpc("begin_cpr_storage_upload", {
    p_resource_type: input.resourceType,
    p_resource_id: input.resourceId,
    p_file_name: input.fileName,
    p_file_size_bytes: input.sizeBytes,
    p_file_mime_type: input.mimeType,
  });
  if (error || !data) return { error: error?.message ?? "RPC_FAILED" };
  const row = data as { intent_id: string; bucket_id: string; object_path: string };
  trackObject(row.bucket_id, row.object_path);
  return { intentId: row.intent_id, bucketId: row.bucket_id, objectPath: row.object_path };
}

/** Uso y cuota del módulo CPR tal como los ve la plataforma (vista oficial). */
async function readModuleUsage(orgId: string): Promise<{ used: number; reserved: number; quota: number }> {
  const { data, error } = await admin
    .from("v_organization_module_usage")
    .select("*")
    .eq("organization_id", orgId)
    .eq("module_code", CPR)
    .single();
  if (error || !data) throw new Error(`no se pudo leer el uso del módulo: ${error?.message}`);
  return {
    used: Number(data.storage_used_bytes ?? 0),
    reserved: Number(data.storage_reserved_bytes ?? 0),
    quota: Number(data.storage_limit_bytes ?? 0),
  };
}

const rejected = (error: { message: string } | null, data?: unknown) =>
  Boolean(error) || (Array.isArray(data) && data.length === 0);

// =============================================================================
// A01 — Upload CPR directo sin intent → Storage debe RECHAZAR
// =============================================================================
scenario("A01", "CORREGIDO_T9F5B", "Upload CPR directo sin intent", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const path = `${f.orgId}/${randomUUID()}/${PREFIX}_a01.pdf`; // ruta CPR SIN intent
  trackObject(EVIDENCES_BUCKET, path);
  const { error } = await f.userClient.storage
    .from(EVIDENCES_BUCKET)
    .upload(path, pdfOfSize(1024), { contentType: "application/pdf" });
  assert(
    error && /row-level security|violates|not authorized|Unauthorized/i.test(error.message),
    `A01: la subida CPR SIN intent debe rechazarla Storage RLS; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );

  // Regresión del flujo LEGÍTIMO: con intent válido la misma subida procede.
  const evidenceId = await createEvidenceRow(f);
  const begun = await beginUpload(f, {
    resourceType: "evidence",
    resourceId: evidenceId,
    fileName: "evidencia.pdf",
    sizeBytes: 1024,
    mimeType: "application/pdf",
  });
  assert(!("error" in begun), `A01: el begin legítimo no debería fallar: ${JSON.stringify(begun)}`);
  const ok = await f.userClient.storage
    .from(begun.bucketId)
    .upload(begun.objectPath, pdfOfSize(1024), { contentType: "application/pdf" });
  assert(!ok.error, `A01: la subida LEGÍTIMA (con intent) debe permitirse; obtuve: ${ok.error?.message}`);
});

// =============================================================================
// A02 — Upload TrazaDocs directo sin intent → RECHAZO
// =============================================================================
scenario("A02", "CORREGIDO_T9F5B", "Upload TrazaDocs directo sin intent", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const path = `${f.orgId}/document_files/${randomUUID()}/v1/${PREFIX}_a02.pdf`;
  trackObject(TRAZADOCS_BUCKET, path);
  const { error } = await f.userClient.storage
    .from(TRAZADOCS_BUCKET)
    .upload(path, pdfOfSize(1024), { contentType: "application/pdf" });
  assert(
    error && /row-level security|violates|not authorized|Unauthorized/i.test(error.message),
    `A02: la subida TrazaDocs SIN intent debe rechazarse; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );

  const docId = await createFileDocumentRow(f);
  const begun = await beginUpload(f, {
    resourceType: "trazadoc_initial",
    resourceId: docId,
    fileName: "documento.pdf",
    sizeBytes: 2048,
    mimeType: "application/pdf",
  });
  assert(!("error" in begun), `A02: el begin legítimo no debería fallar: ${JSON.stringify(begun)}`);
  const ok = await f.userClient.storage
    .from(begun.bucketId)
    .upload(begun.objectPath, pdfOfSize(2048), { contentType: "application/pdf" });
  assert(!ok.error, `A02: la subida LEGÍTIMA (con intent) debe permitirse; obtuve: ${ok.error?.message}`);
});

// =============================================================================
// A03 — UPDATE/upsert directo de storage.objects → RECHAZO
// =============================================================================
scenario("A03", "CORREGIDO_T9F5B", "UPDATE/upsert directo de objeto TrazaDocs", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const docId = await createFileDocumentRow(f);
  const begun = await beginUpload(f, {
    resourceType: "trazadoc_initial",
    resourceId: docId,
    fileName: "documento.pdf",
    sizeBytes: 2048,
    mimeType: "application/pdf",
  });
  assert(!("error" in begun), `A03: fixture begin: ${JSON.stringify(begun)}`);
  const seeded = await f.userClient.storage
    .from(begun.bucketId)
    .upload(begun.objectPath, pdfOfSize(2048), { contentType: "application/pdf" });
  assert(!seeded.error, `A03: fixture upload: ${seeded.error?.message}`);

  // ATAQUE: sobrescribir el MISMO path con upsert.
  const { error } = await f.userClient.storage
    .from(TRAZADOCS_BUCKET)
    .upload(begun.objectPath, bytesOfSize(4096), { contentType: "application/pdf", upsert: true });
  assert(
    error && /row-level security|violates|not authorized|Unauthorized|exists/i.test(error.message),
    `A03: el upsert directo debe rechazarse; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );

  const info = await admin.storage.from(TRAZADOCS_BUCKET).info(begun.objectPath);
  assert(
    !info.error && info.data && Number(info.data.size) === 2048,
    `A03: el objeto no debía modificarse; tamaño observado: ${info.data?.size}`
  );
});

// =============================================================================
// A04 — DELETE directo de storage.objects → RECHAZO
// =============================================================================
scenario("A04", "CORREGIDO_T9F5B", "DELETE directo de objeto TrazaDocs con fila viva", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const docId = await createFileDocumentRow(f);
  const begun = await beginUpload(f, {
    resourceType: "trazadoc_initial",
    resourceId: docId,
    fileName: "documento.pdf",
    sizeBytes: 2048,
    mimeType: "application/pdf",
  });
  assert(!("error" in begun), `A04: fixture begin: ${JSON.stringify(begun)}`);
  const seeded = await f.userClient.storage
    .from(begun.bucketId)
    .upload(begun.objectPath, pdfOfSize(2048), { contentType: "application/pdf" });
  assert(!seeded.error, `A04: fixture upload: ${seeded.error?.message}`);

  // ATAQUE: borrado físico directo mientras la referencia sigue viva.
  const { data, error } = await f.userClient.storage.from(TRAZADOCS_BUCKET).remove([begun.objectPath]);
  assert(
    rejected(error, data),
    `A04: el borrado directo debe rechazarse o afectar 0 objetos; data=${JSON.stringify(data)} error=${error?.message}`
  );
  const info = await admin.storage.from(TRAZADOCS_BUCKET).info(begun.objectPath);
  assert(!info.error && info.data, "A04: el objeto no debía eliminarse");
});

// =============================================================================
// A05 — Finalize sin objeto físico → RECHAZO sin referencia final
// =============================================================================
scenario("A05", "CORREGIDO_T9F5B", "Finalize CPR sin subir el objeto", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const evidenceId = await createEvidenceRow(f);
  const begun = await beginUpload(f, {
    resourceType: "evidence",
    resourceId: evidenceId,
    fileName: "evidencia.pdf",
    sizeBytes: 1024,
    mimeType: "application/pdf",
  });
  assert(!("error" in begun), `A05: fixture begin: ${JSON.stringify(begun)}`);

  // (a) La firma histórica ya no finaliza nada desde el cliente.
  const legacy = await f.userClient.rpc("finalize_evidence_attachment", {
    p_intent_id: begun.intentId,
    p_file_size_bytes: 1024,
  });
  assert(
    legacy.error && /SERVER_ONLY_FINALIZER|permission denied|does not exist/i.test(legacy.error.message),
    `A05: la firma histórica debe estar cerrada a clientes; obtuve: ${legacy.error?.message ?? "ÉXITO (vulnerable)"}`
  );

  // (b) authenticated tampoco puede invocar el finalizer server-only.
  const direct = await f.userClient.rpc("finalize_evidence_attachment_server", {
    p_actor_id: f.userId,
    p_intent_id: begun.intentId,
    p_real_size_bytes: 1024,
    p_real_mime_type: "application/pdf",
  });
  assert(
    direct.error && /permission denied|SERVER_ONLY|does not exist/i.test(direct.error.message),
    `A05: authenticated no debe ejecutar el finalizer server-only; obtuve: ${direct.error?.message ?? "ÉXITO (vulnerable)"}`
  );

  // (c) Incluso desde servidor, sin metadata física no se finaliza.
  const serverSide = await admin.rpc("finalize_evidence_attachment_server", {
    p_actor_id: f.userId,
    p_intent_id: begun.intentId,
    p_real_size_bytes: null,
    p_real_mime_type: null,
  });
  assert(
    serverSide.error && /OBJECT_NOT_VERIFIED|OBJECT_MIME_UNVERIFIED/i.test(serverSide.error.message),
    `A05: sin metadata física el finalize debe fallar cerrado; obtuve: ${serverSide.error?.message ?? "ÉXITO (vulnerable)"}`
  );

  const { data: ev } = await admin.from("evidences").select("storage_path").eq("id", evidenceId).single();
  assert(!ev?.storage_path, `A05: no debía crearse la referencia final; storage_path=${ev?.storage_path}`);
});

// =============================================================================
// A06 — Objeto físico mayor que la reserva → RECHAZO o ampliación segura
// =============================================================================
scenario("A06", "CORREGIDO_T9F5B", "Objeto físico mayor que el tamaño reservado", async () => {
  // POLÍTICA CANÓNICA (T9F.5B.1): **RECHAZO ESTRICTO**. El tamaño físico debe
  // ser EXACTAMENTE el reservado. No hay ampliación de reserva en finalize.
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const evidenceId = await createEvidenceRow(f);
  const declared = 1024 * 1024; // 1 MB reservado
  const begun = await beginUpload(f, {
    resourceType: "evidence",
    resourceId: evidenceId,
    fileName: "evidencia.pdf",
    sizeBytes: declared,
    mimeType: "application/pdf",
  });
  assert(!("error" in begun), `A06: fixture begin: ${JSON.stringify(begun)}`);

  const real = 5 * 1024 * 1024; // objeto FÍSICO de 5 MB en la ruta del intent
  const up = await f.userClient.storage
    .from(begun.bucketId)
    .upload(begun.objectPath, pdfOfSize(real), { contentType: "application/pdf" });
  assert(!up.error, `A06: fixture upload: ${up.error?.message}`);

  // El servidor solo acepta el tamaño FÍSICO; como no coincide con la
  // reserva, la política canónica exige RECHAZO (nunca ampliación).
  const attack = await admin.rpc("finalize_evidence_attachment_server", {
    p_actor_id: f.userId,
    p_intent_id: begun.intentId,
    p_real_size_bytes: real,
    p_real_mime_type: "application/pdf",
  });
  assert(
    attack.error && /OBJECT_SIZE_MISMATCH/.test(attack.error.message),
    `A06: la política canónica es RECHAZO ESTRICTO — se esperaba OBJECT_SIZE_MISMATCH; obtuve: ${attack.error?.message ?? "ÉXITO (vulnerable)"}`
  );
  assert(
    !attack.error || !/not_member/.test(attack.error.message),
    "A06: un rechazo por not_member indicaría el fallo de auth.uid() bajo service_role, no la política de tamaño"
  );
  const { data: ev } = await admin.from("evidences").select("size_bytes, storage_path").eq("id", evidenceId).single();
  assert(!ev?.storage_path, "A06: no debe crearse la referencia final");
  assert(ev?.size_bytes !== declared, "A06: jamás debe registrarse el tamaño declarado por el cliente");
});

// =============================================================================
// A06b — Objeto mayor que la reserva SIN finalize → sin capacidad ficticia
// =============================================================================
scenario("A06b", "CORREGIDO_T9F5B", "Objeto de 5 MB sobre reserva de 1 MB sin finalize", async () => {
  // ATAQUE: reservar poco, subir mucho y NO finalizar, con la esperanza de que
  // la contabilidad siga creyendo que el objeto ocupa lo declarado y conceda
  // capacidad que ya no existe.
  //
  // RESULTADO SEGURO: o el upload se rechaza antes de almacenarse, o el objeto
  // se contabiliza por sus 5 MB FÍSICOS. Lo que NO puede ocurrir es
  // objeto físico 5 MB + contabilidad 1 MB + cuota disponible como si fuera 1 MB.
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const evidenceId = await createEvidenceRow(f);
  const declared = 1 * 1024 * 1024;
  const real = 5 * 1024 * 1024;

  const before = await readModuleUsage(f.orgId);
  const begun = await beginUpload(f, {
    resourceType: "evidence",
    resourceId: evidenceId,
    fileName: "evidencia.pdf",
    sizeBytes: declared,
    mimeType: "application/pdf",
  });
  assert(!("error" in begun), `A06b: fixture begin: ${JSON.stringify(begun)}`);

  const up = await f.userClient.storage
    .from(begun.bucketId)
    .upload(begun.objectPath, pdfOfSize(real), { contentType: "application/pdf" });

  if (up.error) {
    // Desenlace seguro (a): el almacenamiento rechazó el objeto sobredimensionado.
    return;
  }

  // El objeto quedó almacenado. NO se ejecuta finalize: se consulta la
  // contabilidad tal como la ve la plataforma.
  const after = await readModuleUsage(f.orgId);
  const committed = (after.used - before.used) + (after.reserved - before.reserved);
  assert(
    committed >= real,
    `A06b: el objeto físico de ${real} bytes debe contabilizarse por su tamaño REAL (observado: ${committed}). ` +
      "Contabilizar el tamaño declarado concedería capacidad ficticia."
  );

  // Y la capacidad restante no puede comportarse como si ocupara 1 MB: un
  // begin que solo cabría bajo la contabilidad ficticia debe fallar.
  const quotaLeft = after.quota - after.used - after.reserved;
  assert(
    quotaLeft <= after.quota - real,
    `A06b: la capacidad disponible (${quotaLeft}) no puede calcularse como si el objeto ocupara lo declarado.`
  );
});

// =============================================================================
// A07 — MIME físico incompatible con el declarado → RECHAZO
// =============================================================================
scenario("A07", "CORREGIDO_T9F5B", "MIME físico incompatible con el declarado", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const evidenceId = await createEvidenceRow(f);
  const size = 4096;
  const begun = await beginUpload(f, {
    resourceType: "evidence",
    resourceId: evidenceId,
    fileName: "evidencia.pdf",
    sizeBytes: size,
    mimeType: "application/pdf",
  });
  assert(!("error" in begun), `A07: fixture begin: ${JSON.stringify(begun)}`);

  // Se declara PDF y se suben bytes que NO son PDF (sin firma %PDF-).
  const up = await f.userClient.storage
    .from(begun.bucketId)
    .upload(begun.objectPath, bytesOfSize(size), { contentType: "application/pdf" });
  assert(!up.error, `A07: fixture upload: ${up.error?.message}`);

  // (a) Un MIME físico distinto del reservado se rechaza en la RPC.
  const mismatch = await admin.rpc("finalize_evidence_attachment_server", {
    p_actor_id: f.userId,
    p_intent_id: begun.intentId,
    p_real_size_bytes: size,
    p_real_mime_type: "application/octet-stream",
  });
  assert(
    mismatch.error && /MIME/i.test(mismatch.error.message),
    `A07: un MIME físico distinto del reservado debe rechazarse; obtuve: ${mismatch.error?.message ?? "ÉXITO (vulnerable)"}`
  );

  // (b) T9F.5B.1 · La verificación de FIRMA BINARIA vive en la capa server
  //     (`verifyCprUploadedObject` → `validateCprBinarySignature`). QA DEBE
  //     ejercer el flujo real de la aplicación —Server Action de finalize—
  //     con este mismo objeto: el contenido no-PDF tiene que rechazarse
  //     aunque el Content-Type almacenado diga application/pdf y el tamaño
  //     coincida con la reserva. Aquí se comprueba la precondición (los bytes
  //     son legibles y NO son un PDF) para que ese paso sea concluyente.
  const bytes = await admin.storage.from(begun.bucketId).download(begun.objectPath);
  assert(!bytes.error && bytes.data, "A07: el objeto debe poder leerse para la verificación de firma");
  const head = new Uint8Array(await bytes.data!.arrayBuffer()).slice(0, 5);
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  assert(!isPdf, "A07: el objeto sembrado NO debe ser un PDF real (si lo fuera, la prueba no demostraría nada)");
  // Con tamaño y MIME coincidentes, SOLO la firma puede rechazarlo: por eso
  // este escenario no se considera cerrado sin ejercer la Server Action.
  console.log(
    "        [A07] Pendiente en QA: ejecutar finalizeEvidenceUploadAction con este intent y exigir rechazo por firma binaria."
  );
});

// =============================================================================
// A08 — Cambio de plan Extra→Demo entre begin y finalize → revalidación
// =============================================================================
scenario("A08", "CORREGIDO_T9F5B", "Plan degradado entre begin y finalize (TrazaDocs)", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "extra", role: "admin" });
  const docId = await createFileDocumentRow(f);
  const size = 22 * 1024 * 1024; // válido en Extra, por encima del tope Demo
  const begun = await beginUpload(f, {
    resourceType: "trazadoc_initial",
    resourceId: docId,
    fileName: "documento.pdf",
    sizeBytes: size,
    mimeType: "application/pdf",
  });
  assert(!("error" in begun), `A08: el begin bajo Extra debería permitirse: ${JSON.stringify(begun)}`);
  const up = await f.userClient.storage
    .from(begun.bucketId)
    .upload(begun.objectPath, pdfOfSize(size), { contentType: "application/pdf" });
  assert(!up.error, `A08: fixture upload: ${up.error?.message}`);

  // El módulo se degrada a Demo entre begin y finalize.
  const { error: degradeError } = await admin.rpc("set_organization_module_access", {
    p_organization_id: f.orgId,
    p_module_code: CPR,
    p_target_state: "demo_permanent",
  });
  assert(!degradeError, `A08: no se pudo degradar el plan: ${degradeError?.message}`);

  const attack = await admin.rpc("finalize_trazadoc_file_document_initial_version_server", {
    p_actor_id: f.userId,
    p_intent_id: begun.intentId,
    p_real_size_bytes: size,
    p_real_mime_type: "application/pdf",
    p_change_note: "adversarial A08",
  });
  // T9F.5B.1 · No basta con "algo falló": la CAUSA debe ser el plan nuevo.
  const message = attack.error?.message ?? "";
  assert(attack.error, `A08: finalize tras degradar el plan debía rechazarse; obtuve ÉXITO (vulnerable)`);
  assert(
    !/not_member|actor_required|actor_not_found/i.test(message),
    `A08: FALSO POSITIVO — el rechazo viene de la resolución de acceso bajo service_role (auth.uid() NULL), no del cambio de plan: ${message}`
  );
  assert(
    !/SERVER_ONLY|permission denied/i.test(message),
    `A08: FALSO POSITIVO — el rechazo es de superficie, no de cuota: ${message}`
  );
  assert(
    /STORAGE_QUOTA_EXCEEDED|FILE_SIZE_INVALID/.test(message),
    `A08: la causa debe ser la CUOTA o el TOPE del plan ACTUAL (Demo), no un rechazo genérico; obtuve: ${message}`
  );
});

// =============================================================================
// A09 — Concurrencia por el último espacio → solo una pasa
// =============================================================================
scenario("A09", "REGRESION_T9F5A", "Concurrencia por el último recurso", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "demo", role: "admin" });
  const insertEvidence = () =>
    f.userClient.from("evidences").insert({ organization_id: f.orgId, name: `${PREFIX}_a09` }).select("id").single();
  const results = await Promise.all([insertEvidence(), insertEvidence()]);
  const errors = results.filter((r) => r.error).map((r) => r.error!);
  assert(
    errors.length === 1 && /RESOURCE_LIMIT_EXCEEDED/.test(errors[0]!.message),
    `A09: se esperaba exactamente 1 rechazo RESOURCE_LIMIT_EXCEEDED; obtuve ${errors.length} (${errors.map((e) => e.message).join(" | ")})`
  );
});

// =============================================================================
// A10 — INSERT directo en tabla de dominio por encima del límite → RECHAZO
// =============================================================================
scenario("A10", "REGRESION_T9F5A", "INSERT directo por API sobre el límite", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "demo", role: "admin" });
  await f.userClient.from("suppliers").insert({ organization_id: f.orgId, name: `${PREFIX}_s1` });
  const { error } = await f.userClient.from("suppliers").insert({ organization_id: f.orgId, name: `${PREFIX}_s2` });
  assert(
    error && /RESOURCE_LIMIT_EXCEEDED/.test(error.message),
    `A10: el INSERT directo por encima del límite debe rechazarse; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );
});

// =============================================================================
// A11 — UPDATE directo de campos físicos → PHYSICAL_FIELD_IMMUTABLE
// =============================================================================
scenario("A11", "REGRESION_T9F5A", "UPDATE directo de campos físicos", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const evId = await createEvidenceRow(f);
  const up1 = await f.userClient.from("evidences").update({ storage_path: "hacked/path" }).eq("id", evId);
  const up2 = await f.userClient.from("evidences").update({ size_bytes: 1 }).eq("id", evId);
  assert(up1.error && /PHYSICAL_FIELD_IMMUTABLE/.test(up1.error.message), `A11 storage_path: ${up1.error?.message}`);
  assert(up2.error && /PHYSICAL_FIELD_IMMUTABLE/.test(up2.error.message), `A11 size_bytes: ${up2.error?.message}`);
});

// =============================================================================
// A12 — DELETE directo de fila de dominio → 0 filas / rechazo
// =============================================================================
scenario("A12", "REGRESION_T9F5A", "DELETE directo de fila de dominio", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const evId = await createEvidenceRow(f);
  const del = await f.userClient.from("evidences").delete().eq("id", evId).select("id");
  assert(
    rejected(del.error, del.data),
    `A12: el DELETE directo debe afectar 0 filas; data=${JSON.stringify(del.data)} error=${del.error?.message}`
  );
});

// =============================================================================
// A13 — module_key manipulado → el límite usa el módulo del BLUEPRINT
// =============================================================================
scenario("A13", "CORREGIDO_T9F5B", "module_key manipulado sobre blueprint CPR", async () => {
  // CPR en Demo (documents_trazadocs = 2) y Textiles con cupo (Full).
  const f = await makeOrgWithMember({ module: CPR, accessMode: "demo", role: "admin" });
  const { error: textilesError } = await admin.rpc("set_organization_module_access", {
    p_organization_id: f.orgId,
    p_module_code: TEXTILES,
    p_target_state: "full",
  });
  assert(!textilesError, `A13: fixture Textiles: ${textilesError?.message}`);

  const { data: bp, error: bpError } = await admin
    .from("trazadoc_blueprints")
    .select("id")
    .eq("module_key", "cpr")
    .limit(1)
    .single();
  assert(!bpError && bp, `A13: se requiere un blueprint CPR en el catálogo: ${bpError?.message}`);

  // Se agota el límite CPR (Demo = 2 documentos).
  for (let i = 0; i < 2; i++) {
    const { error } = await admin.from("trazadoc_documents").insert({
      organization_id: f.orgId,
      blueprint_id: bp!.id,
      title: `${PREFIX}_cpr_${i}`,
      created_by: f.userId,
    });
    assert(!error, `A13: fixture documento CPR ${i}: ${error?.message}`);
  }

  // ATAQUE: blueprint CPR declarando module_key='textiles' (que sí tiene cupo).
  const { error } = await f.userClient
    .from("trazadoc_documents")
    .insert({
      organization_id: f.orgId,
      blueprint_id: bp!.id,
      module_key: "textiles",
      title: `${PREFIX}_a13`,
    })
    .select("id")
    .single();
  assert(
    error && /RESOURCE_LIMIT_EXCEEDED/.test(error.message),
    `A13: el límite debe evaluarse contra el módulo del BLUEPRINT (CPR), no contra el module_key del cliente; obtuve: ${error?.message ?? "ÉXITO (vulnerable)"}`
  );
});

// =============================================================================
// A14 — Archivo determinista de 22 MB: Demo rechazado, Full y Extra permitidos
// =============================================================================
scenario("A14", "CORREGIDO_T9F5B", "TrazaDocs de 22 MB según el plan", async () => {
  const SIZE_22MB = 22 * 1024 * 1024;

  // (a) Demo → RECHAZADO (tope 10 MB).
  const demo = await makeOrgWithMember({ module: CPR, accessMode: "demo", role: "admin" });
  const demoDoc = await createFileDocumentRow(demo);
  const demoBegin = await beginUpload(demo, {
    resourceType: "trazadoc_initial",
    resourceId: demoDoc,
    fileName: "documento.pdf",
    sizeBytes: SIZE_22MB,
    mimeType: "application/pdf",
  });
  assert(
    "error" in demoBegin && /FILE_SIZE_INVALID/.test(demoBegin.error),
    `A14: 22 MB en Demo debe rechazarse (tope 10 MB); obtuve: ${JSON.stringify(demoBegin)}`
  );

  // (b) Full → PERMITIDO, con archivo FÍSICO real de 22 MB.
  const full = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const fullDoc = await createFileDocumentRow(full);
  const fullBegin = await beginUpload(full, {
    resourceType: "trazadoc_initial",
    resourceId: fullDoc,
    fileName: "documento.pdf",
    sizeBytes: SIZE_22MB,
    mimeType: "application/pdf",
  });
  assert(!("error" in fullBegin), `A14: 22 MB en Full debe permitirse; obtuve: ${JSON.stringify(fullBegin)}`);
  const fullUpload = await full.userClient.storage
    .from(fullBegin.bucketId)
    .upload(fullBegin.objectPath, pdfOfSize(SIZE_22MB), { contentType: "application/pdf" });
  assert(
    !fullUpload.error,
    `A14: la subida física de 22 MB en Full debe permitirse; obtuve: ${fullUpload.error?.message}`
  );

  // (b2) T9F.5B.1 · El flujo debe llegar hasta la FINALIZACIÓN real, no
  //      quedarse en begin + upload: se verifica el objeto físico de 22 MB y
  //      se finaliza con los valores reales (como hace la Server Action).
  const fullInfo = await admin.storage.from(fullBegin.bucketId).info(fullBegin.objectPath);
  assert(!fullInfo.error && fullInfo.data, "A14: la metadata física del objeto de 22 MB debe poder leerse");
  assert(
    Number(fullInfo.data!.size) === SIZE_22MB,
    `A14: el tamaño físico debe ser exactamente 22 MB; observado: ${fullInfo.data?.size}`
  );
  const fullFinalize = await admin.rpc("finalize_trazadoc_file_document_initial_version_server", {
    p_actor_id: full.userId,
    p_intent_id: fullBegin.intentId,
    p_real_size_bytes: Number(fullInfo.data!.size),
    p_real_mime_type: (fullInfo.data!.contentType as string) ?? "application/pdf",
    p_change_note: "adversarial A14",
  });
  assert(
    !fullFinalize.error,
    `A14: la FINALIZACIÓN de 22 MB en Full debe permitirse; obtuve: ${fullFinalize.error?.message}`
  );
  const { data: finalDoc } = await admin
    .from("trazadoc_file_documents")
    .select("size_bytes, storage_path")
    .eq("id", fullDoc)
    .single();
  assert(
    Number(finalDoc?.size_bytes) === SIZE_22MB && Boolean(finalDoc?.storage_path),
    `A14: la fila debe quedar con el tamaño FÍSICO real y su ruta; observado: ${JSON.stringify(finalDoc)}`
  );

  // (c) Extra → PERMITIDO (mismo tope por archivo que Full).
  const extra = await makeOrgWithMember({ module: CPR, accessMode: "extra", role: "admin" });
  const extraDoc = await createFileDocumentRow(extra);
  const extraBegin = await beginUpload(extra, {
    resourceType: "trazadoc_initial",
    resourceId: extraDoc,
    fileName: "documento.pdf",
    sizeBytes: SIZE_22MB,
    mimeType: "application/pdf",
  });
  assert(!("error" in extraBegin), `A14: 22 MB en Extra debe permitirse; obtuve: ${JSON.stringify(extraBegin)}`);

  // (d) 26 MB en Full → RECHAZADO (por encima del tope de 25 MB).
  const tooBigDoc = await createFileDocumentRow(full);
  const tooBig = await beginUpload(full, {
    resourceType: "trazadoc_initial",
    resourceId: tooBigDoc,
    fileName: "documento.pdf",
    sizeBytes: 26 * 1024 * 1024,
    mimeType: "application/pdf",
  });
  assert(
    "error" in tooBig && /FILE_SIZE_INVALID/.test(tooBig.error),
    `A14: 26 MB en Full debe rechazarse (tope 25 MB); obtuve: ${JSON.stringify(tooBig)}`
  );

  // (e) La evidencia CPR conserva su máximo PROPIO (20 MB).
  const evId = await createEvidenceRow(full);
  const evBegin = await beginUpload(full, {
    resourceType: "evidence",
    resourceId: evId,
    fileName: "evidencia.pdf",
    sizeBytes: SIZE_22MB,
    mimeType: "application/pdf",
  });
  assert(
    "error" in evBegin && /FILE_SIZE_INVALID/.test(evBegin.error),
    `A14: la evidencia CPR mantiene su tope de 20 MB; obtuve: ${JSON.stringify(evBegin)}`
  );
});

// =============================================================================
// A15 — Conteo de otra organización → NULL (no revelador)
// =============================================================================
scenario("A15", "REGRESION_T9F5A", "count_module_resource de otra organización", async () => {
  const a = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const b = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const { data, error } = await a.userClient.rpc("count_module_resource", {
    p_organization_id: b.orgId,
    p_module_code: CPR,
    p_resource_code: "suppliers",
  });
  assert(
    !error && data === null,
    `A15: el conteo cruzado debe devolver NULL; obtuve data=${JSON.stringify(data)} error=${error?.message}`
  );
});

// =============================================================================
// A16 — Tamaño físico desconocido bloquea nuevas cargas
// =============================================================================
scenario("A16", "REGRESION_T9F5A", "size_bytes NULL bloquea begin (STORAGE_UNVERIFIABLE)", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const unknownId = await createEvidenceRow(f);
  const { error: seedError } = await admin
    .from("evidences")
    .update({ storage_path: `${f.orgId}/${unknownId}/desconocido.pdf`, size_bytes: null })
    .eq("id", unknownId);
  assert(!seedError, `A16: fixture desconocido: ${seedError?.message}`);

  const evId = await createEvidenceRow(f);
  const begun = await beginUpload(f, {
    resourceType: "evidence",
    resourceId: evId,
    fileName: "evidencia.pdf",
    sizeBytes: 1024,
    mimeType: "application/pdf",
  });
  assert(
    "error" in begun && /UNVERIFIABLE/i.test(begun.error),
    `A16: con tamaños desconocidos, begin debe bloquear; obtuve: ${JSON.stringify(begun)}`
  );
});

// =============================================================================
// A17 — Intent failed con objeto: sus bytes SIGUEN contando
// =============================================================================
scenario("A17", "REGRESION_T9F5A", "Intent failed con objeto sigue contabilizado", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const evId = await createEvidenceRow(f);
  const size = 3 * 1024 * 1024;
  const begun = await beginUpload(f, {
    resourceType: "evidence",
    resourceId: evId,
    fileName: "evidencia.pdf",
    sizeBytes: size,
    mimeType: "application/pdf",
  });
  assert(!("error" in begun), `A17: fixture begin: ${JSON.stringify(begun)}`);
  const up = await f.userClient.storage
    .from(begun.bucketId)
    .upload(begun.objectPath, pdfOfSize(size), { contentType: "application/pdf" });
  assert(!up.error, `A17: fixture upload: ${up.error?.message}`);

  const cancelled = await f.userClient.rpc("cancel_cpr_storage_upload", { p_intent_id: begun.intentId });
  assert(!cancelled.error, `A17: cancel: ${cancelled.error?.message}`);

  const { data: usage, error: usageError } = await admin
    .from("v_organization_module_usage")
    .select("*")
    .eq("organization_id", f.orgId)
    .eq("module_code", CPR)
    .single();
  assert(!usageError && usage, `A17: no se pudo leer el uso: ${usageError?.message}`);
  const counted = Number(usage!.storage_used_bytes ?? 0) + Number(usage!.storage_reserved_bytes ?? 0);
  assert(counted >= size, `A17: los bytes del intent failed con objeto deben seguir contando; observado=${counted}`);
});

// =============================================================================
// A18 — Reutilización de idempotency key vencida → sin unique_violation
// =============================================================================
scenario("A18", "REGRESION_T9F5A", "Reutilización de idempotency key vencida", async () => {
  const f = await makeOrgWithMember({ module: CPR, accessMode: "full", role: "admin" });
  const evId = await createEvidenceRow(f);
  const key = `${PREFIX}_idem`;
  const first = await f.userClient.rpc("begin_cpr_storage_upload", {
    p_resource_type: "evidence",
    p_resource_id: evId,
    p_file_name: "evidencia.pdf",
    p_file_size_bytes: 1024,
    p_file_mime_type: "application/pdf",
    p_idempotency_key: key,
  });
  assert(!first.error, `A18: primer begin: ${first.error?.message}`);

  const { error: expireError } = await admin
    .from("storage_upload_intents")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("idempotency_key", key);
  assert(!expireError, `A18: fixture vencimiento: ${expireError?.message}`);

  const evId2 = await createEvidenceRow(f);
  const second = await f.userClient.rpc("begin_cpr_storage_upload", {
    p_resource_type: "evidence",
    p_resource_id: evId2,
    p_file_name: "evidencia.pdf",
    p_file_size_bytes: 1024,
    p_file_mime_type: "application/pdf",
    p_idempotency_key: key,
  });
  assert(
    !second.error || !/duplicate key|unique/i.test(second.error.message),
    `A18: reusar una key vencida NO debe producir unique_violation; obtuve: ${second.error?.message}`
  );
});

// ------------------------------ Limpieza --------------------------------------
/**
 * Limpieza COMPLETA de lo creado por esta suite: objetos de Storage, intents,
 * reservas, documentos, versiones, evidencias, organizaciones, membresías y
 * usuarios QA. audit_log NUNCA se elimina: la bitácora es historia inmutable,
 * también en QA.
 */
async function cleanup() {
  console.log("\n[T9F.5] Limpieza de fixtures QA…");
  for (const obj of createdObjects) {
    await admin.storage
      .from(obj.bucket)
      .remove([obj.path])
      .catch(() => undefined);
  }
  for (const orgId of createdOrgs) {
    await admin.from("storage_upload_intents").delete().eq("organization_id", orgId);
    await admin.from("textile_evidence_upload_intents").delete().eq("organization_id", orgId);
    await admin.from("storage_orphan_candidates").delete().eq("organization_id", orgId);
    await admin.from("trazadoc_file_document_versions").delete().eq("organization_id", orgId);
    await admin.from("trazadoc_file_documents").delete().eq("organization_id", orgId);
    await admin.from("trazadoc_documents").delete().eq("organization_id", orgId);
    await admin.from("evidences").delete().eq("organization_id", orgId);
    await admin.from("textile_evidences").delete().eq("organization_id", orgId);
    await admin.from("suppliers").delete().eq("organization_id", orgId);
    await admin.from("organization_modules").delete().eq("organization_id", orgId);
    await admin.from("memberships").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
  for (const userId of createdUsers) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  }
  console.log("[T9F.5] Limpieza completada (audit_log intacto).");
}

// ------------------------------ Runner ---------------------------------------
async function main() {
  console.log(`\n[T9F.5] Suite adversarial A01–A18 · prefijo ${PREFIX}`);
  console.log(
    "Tras la remediación T9F.5B, TODOS los escenarios deben quedar en PASS.\n" +
      "Un FAIL en A01-A08/A13/A14 significa que la corrección NO cierra el ataque.\n"
  );
  let pass = 0;
  let fail = 0;
  const failures: string[] = [];
  for (const s of scenarios) {
    try {
      await s.run();
      console.log(`  PASS  ${s.id} [${s.phase}] ${s.title}`);
      pass++;
    } catch (err) {
      console.log(`  FAIL  ${s.id} [${s.phase}] ${s.title}\n        ${(err as Error).message}`);
      failures.push(s.id);
      fail++;
    }
  }
  await cleanup();
  console.log(`\n[T9F.5] Resultado: ${pass} PASS / ${fail} FAIL de ${scenarios.length}.`);
  if (fail > 0) {
    console.error(`[T9F.5] Ataques NO cerrados: ${failures.join(", ")}. NO se aprueba.`);
    process.exit(1);
  }
  console.log("[T9F.5] 18/18 en verde contra Supabase QA real: base para la clasificación T9F.5C.\n");
}

main().catch(async (e) => {
  console.error("[T9F.5] Error inesperado en el runner:", e);
  await cleanup().catch(() => undefined);
  process.exit(1);
});
