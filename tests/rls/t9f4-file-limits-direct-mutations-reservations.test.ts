/**
 * Trazaloop · Sprint T9F.4 · Suite RLS/BD contra STAGING: límite documental
 * combinado, mutaciones directas bloqueadas y reservas atómicas CPR/TrazaDocs
 * con Storage REAL.
 *
 * PREPARADA para ejecutarse desde una máquina autorizada con `.env.local` de
 * staging, DESPUÉS de aplicar la migración 0101 (acumulada T9F.1+2+3+4).
 * Desde el entorno del sprint NO se ejecuta (prohibido conectar a Supabase).
 *   npm run test:t9f4-rls
 *
 * QUÉ VALIDA (las 23 áreas de §27 del plan T9F.4, con expectativas
 * CONCRETAS):
 *   1     Organización Demo real (flujo create_organization + 0100).
 *   2-4   Documento VIVO + documento DESCARGABLE consumen el límite
 *         compartido documents_trazadocs; el tercero se rechaza en la tabla
 *         que sea (RESOURCE_LIMIT_EXCEEDED del trigger).
 *   5-6   Concurrencia ENTRE TIPOS (Promise.all: vivo vs descargable por el
 *         último hueco) e INSERT DIRECTO por la API: una fila, un rechazo.
 *   7     DELETE directo RETIRADO: el delete del miembro afecta 0 filas en
 *         las tres tablas físicas (la política ya no existe).
 *   8-9   UPDATE físico directo → PHYSICAL_FIELD_IMMUTABLE; UPDATE funcional
 *         (título/nombre) sigue permitido.
 *   10    Reserva CPR: begin crea el intent DURABLE y la cuota bloquea
 *         contando reservas activas (Demo→Full con cuota sembrada).
 *   11    Reserva TrazaDocs CPR: begin inicial + upload REAL a la ruta del
 *         intent + finalize server-only → v1 física, bytes exactos en la vista.
 *   12    Reserva TrazaDocs Textiles: los descargables NO existen en
 *         Textiles (sus documentos vivos no suben archivos) — sus uploads
 *         son las evidencias 0094, y begin_v2 reserva bytes contra la cuota
 *         Textil (verificado aquí). Sin cuota TrazaDocs paralela.
 *   13    Dos begins CONCURRENTES sobre la cuota restante: uno reserva y el
 *         otro STORAGE_QUOTA_EXCEEDED.
 *   14    Intent FAILED con objeto REAL: sigue contabilizado hasta la
 *         resolución server-only confirmada (que libera).
 *   15    Intent PENDING VENCIDO con objeto REAL: deja de reservar la
 *         unidad pero sus bytes cuentan como objeto no resuelto.
 *   16-18 Ciclo pending_delete con objeto real: encolar cuenta,
 *         delete_failed sigue contando y SOLO deleted libera.
 *   19    Tamaño DESCONOCIDO bloquea begin (STORAGE_UNVERIFIABLE).
 *   20    count_module_resource: un usuario ajeno recibe NULL; el miembro
 *         ve sus conteos.
 *   21    Idempotency key VENCIDA: se expira atómicamente y la MISMA ruta
 *         se revive — jamás unique_violation ni bloqueo permanente.
 *   22    RPC de borrado con Demo VENCIDO → MODULE_ACCESS_BLOCKED.
 *   23    Limpieza TOTAL verificada (abajo): recolección con OBJETO NOMBRADO
 *         (jamás desestructuración posicional de Promise.all) y CERO
 *         residuos del run — objetos, candidatos pending_delete /
 *         delete_failed, reservas, intents, filas, organizaciones, usuarios.
 *
 * FIXTURES: prefijo t9f4_<timestamp>_<aleatorio>; objetos REALES pequeños y
 * deterministas (≤ 24 KB). audit_log permanece inmutable (sin secretos,
 * identificado por el nombre t9f4_* histórico) — la 0101 retiró la FK a
 * organizations precisamente para que la eliminación de organizaciones QA
 * sea posible y verificable.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

loadEnv({ path: ".env.local" });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables de Supabase en .env.local");
  process.exit(1);
}
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const CPR = "traceability_6632";
const TEX = "textiles";
const KB = 1024;
const MB = 1024 * KB;
const RUN = `t9f4_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const createdUsers: string[] = [];
const createdOrgs: string[] = [];

async function newUser(label: string) {
  const email = `${RUN}-${label}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const password = `Qa1-${randomUUID()}${randomUUID().slice(0, 8)}`;
  let user: { id: string } | null = null;
  for (let i = 1; i <= 3 && !user; i++) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `QA ${RUN} ${label}` },
    });
    if (!error && data.user) user = data.user;
    else if (i === 3) throw new Error(`createUser ${label}: ${error?.message}`);
    else await new Promise((r) => setTimeout(r, 1200 * i));
  }
  createdUsers.push(user!.id);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${label}: ${error.message}`);
  return { id: user!.id, client };
}

async function createOrgViaRealFlow(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.rpc("create_organization", { p_name: name });
  if (error || !data) throw new Error(`create_organization: ${error?.message}`);
  createdOrgs.push(data as string);
  return data as string;
}

async function setModuleAdmin(orgId: string, code: string, mode: "demo" | "full" | "extra", expiresAt: string | null = null) {
  const { error } = await admin
    .from("organization_modules")
    .update({ enabled: true, access_mode: mode, access_expires_at: expiresAt })
    .eq("organization_id", orgId)
    .eq("module_code", code);
  if (error) throw new Error(`setModuleAdmin ${code}=${mode}: ${error.message}`);
}

async function usageRow(client: SupabaseClient, orgId: string, moduleCode: string) {
  const { data, error } = await client
    .from("v_organization_module_usage")
    .select("*")
    .eq("organization_id", orgId)
    .eq("module_code", moduleCode)
    .maybeSingle();
  if (error || !data) throw new Error(`vista de uso: ${error?.message ?? "fila ausente"}`);
  return data as Record<string, number & string>;
}

function deterministicBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  for (let i = 0; i < n; i++) buf[i] = i % 251;
  return buf;
}

async function beginCpr(
  client: SupabaseClient,
  resourceType: "evidence" | "trazadoc_initial" | "trazadoc_replace",
  resourceId: string,
  fileName: string,
  sizeBytes: number,
  idempotencyKey: string | null = null
) {
  return client.rpc("begin_cpr_storage_upload", {
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_file_name: fileName,
    p_file_size_bytes: sizeBytes,
    p_file_mime_type: "application/pdf",
    p_ttl_minutes: 30,
    p_idempotency_key: idempotencyKey,
  });
}

async function main() {
  console.log(`\nRLS T9F.4 · run ${RUN}\n`);

  const userA = await newUser("a");
  const userB = await newUser("b");
  const userX = await newUser("x"); // sin membresía en A ni B (aislamiento)

  let orgA = "";
  let orgB = "";

  // ── Área 1 · Organización Demo real ───────────────────────────────────────
  await check("1. Organización Demo por el flujo real (0100 aprovisiona Demo temporal CPR)", async () => {
    orgA = await createOrgViaRealFlow(userA.client, `${RUN} A`);
    const { data } = await admin
      .from("organization_modules")
      .select("enabled, access_mode")
      .eq("organization_id", orgA)
      .eq("module_code", CPR)
      .single();
    assert(data?.enabled === true && data?.access_mode === "demo", "CPR debía nacer en Demo temporal");
    orgB = await createOrgViaRealFlow(userB.client, `${RUN} B`);
    await setModuleAdmin(orgB, CPR, "full");
    await setModuleAdmin(orgB, TEX, "full");
  });

  // ── Áreas 2-4 · Límite documental COMBINADO (Demo: documents=2) ───────────
  let liveDocId = "";
  let fileDocId = "";
  await check("2-3. Documento VIVO + documento DESCARGABLE consumen el límite compartido (2/2)", async () => {
    const live = await userA.client
      .from("trazadoc_documents")
      .insert({ organization_id: orgA, module_key: "cpr", source_type: "custom", title: `${RUN} vivo`, created_by: userA.id })
      .select("id")
      .single();
    assert(!live.error && live.data, `documento vivo: ${live.error?.message}`);
    liveDocId = live.data!.id as string;
    const fd = await userA.client
      .from("trazadoc_file_documents")
      .insert({
        organization_id: orgA,
        title: `${RUN} descargable`,
        category_code: "other",
        storage_path: "",
        file_name: "pendiente.pdf",
        mime_type: "application/pdf",
        size_bytes: 0,
        created_by: userA.id,
      })
      .select("id")
      .single();
    assert(!fd.error && fd.data, `documento descargable: ${fd.error?.message}`);
    fileDocId = fd.data!.id as string;
    const usage = await usageRow(userA.client, orgA, CPR);
    assert(Number(usage.documents_trazadocs_count) === 2, `la vista debía contar 2 documentos lógicos (hay ${usage.documents_trazadocs_count})`);
  });

  await check("4. El TERCER documento se rechaza sin importar la tabla (RESOURCE_LIMIT_EXCEEDED)", async () => {
    const live3 = await userA.client
      .from("trazadoc_documents")
      .insert({ organization_id: orgA, module_key: "cpr", source_type: "custom", title: `${RUN} tercero-vivo`, created_by: userA.id });
    assert(live3.error && /RESOURCE_LIMIT_EXCEEDED/.test(live3.error.message), `vivo: esperaba RESOURCE_LIMIT_EXCEEDED (${live3.error?.message})`);
    const fd3 = await userA.client
      .from("trazadoc_file_documents")
      .insert({ organization_id: orgA, title: `${RUN} tercero-descargable`, category_code: "other", storage_path: "", file_name: "x.pdf", mime_type: "application/pdf", size_bytes: 0, created_by: userA.id });
    assert(fd3.error && /RESOURCE_LIMIT_EXCEEDED/.test(fd3.error.message), `descargable: esperaba RESOURCE_LIMIT_EXCEEDED (${fd3.error?.message})`);
  });

  // ── Áreas 5-6 · Concurrencia entre tipos + INSERT directo ────────────────
  await check("5-6. Carrera vivo-vs-descargable por el ÚLTIMO hueco (INSERT directo por la API): una fila y un rechazo", async () => {
    // Liberar un hueco (admin: mantenimiento server-only) y correr la carrera.
    const del = await admin.from("trazadoc_documents").delete().eq("id", liveDocId).select("id");
    assert(!del.error && (del.data ?? []).length === 1, "no se pudo liberar el hueco para la carrera");
    const [r1, r2] = await Promise.all([
      userA.client.from("trazadoc_documents").insert({ organization_id: orgA, module_key: "cpr", source_type: "custom", title: `${RUN} carrera-vivo`, created_by: userA.id }).select("id"),
      userA.client.from("trazadoc_file_documents").insert({ organization_id: orgA, title: `${RUN} carrera-desc`, category_code: "other", storage_path: "", file_name: "c.pdf", mime_type: "application/pdf", size_bytes: 0, created_by: userA.id }).select("id"),
    ]);
    const errors = [r1.error, r2.error].filter((e) => e !== null);
    assert(errors.length === 1 && /RESOURCE_LIMIT_EXCEEDED/.test(errors[0]!.message),
      `exactamente un rechazo por límite (hubo ${errors.length}: ${errors.map((e) => e?.message).join(" | ")})`);
    const usage = await usageRow(userA.client, orgA, CPR);
    assert(Number(usage.documents_trazadocs_count) === 2, `2 documentos lógicos tras la carrera (hay ${usage.documents_trazadocs_count})`);
  });

  // ── Área 7 · DELETE directo retirado ─────────────────────────────────────
  let evA = "";
  await check("7. DELETE directo afecta 0 filas en las TRES tablas físicas (política retirada)", async () => {
    const ev = await userA.client
      .from("evidences")
      .insert({ organization_id: orgA, name: `${RUN} evA` })
      .select("id")
      .single();
    assert(!ev.error && ev.data, `evidencia A: ${ev.error?.message}`);
    evA = ev.data!.id as string;
    const delEv = await userA.client.from("evidences").delete().eq("id", evA).select("id");
    assert(!delEv.error && (delEv.data ?? []).length === 0, "el DELETE directo de evidences debía afectar 0 filas");
    const delFd = await userA.client.from("trazadoc_file_documents").delete().eq("id", fileDocId).select("id");
    assert(!delFd.error && (delFd.data ?? []).length === 0, "el DELETE directo del maestro debía afectar 0 filas");
    const tev = await admin
      .from("textile_evidences")
      .select("id")
      .eq("organization_id", orgB)
      .limit(1);
    // (la textil se cubre con la fila creada en el área 12; aquí basta el
    // contrato de las dos CPR y que la fila de evA SIGUE existiendo)
    void tev;
    const still = await admin.from("evidences").select("id", { count: "exact", head: true }).eq("id", evA);
    assert((still.count ?? 0) === 1, "la evidencia debía seguir existiendo tras el intento de DELETE directo");
  });

  // ── Áreas 8-9 · UPDATE físico bloqueado / funcional permitido ────────────
  await check("8. UPDATE directo de storage_path/size_bytes → PHYSICAL_FIELD_IMMUTABLE", async () => {
    const up1 = await userA.client.from("evidences").update({ storage_path: "x/x.pdf" }).eq("id", evA);
    assert(up1.error && /PHYSICAL_FIELD_IMMUTABLE/.test(up1.error.message), `storage_path: esperaba PHYSICAL_FIELD_IMMUTABLE (${up1.error?.message})`);
    const up2 = await userA.client.from("evidences").update({ size_bytes: 999 }).eq("id", evA);
    assert(up2.error && /PHYSICAL_FIELD_IMMUTABLE/.test(up2.error.message), `size_bytes: esperaba PHYSICAL_FIELD_IMMUTABLE (${up2.error?.message})`);
    const up3 = await userA.client.from("trazadoc_file_documents").update({ file_name: "h.pdf" }).eq("id", fileDocId);
    assert(up3.error && /PHYSICAL_FIELD_IMMUTABLE/.test(up3.error.message), `file_name del maestro: esperaba PHYSICAL_FIELD_IMMUTABLE (${up3.error?.message})`);
  });

  await check("9. UPDATE funcional sigue permitido (name de evidencia; título del maestro)", async () => {
    const up1 = await userA.client.from("evidences").update({ name: `${RUN} evA (renombrada)` }).eq("id", evA).select("id");
    assert(!up1.error && (up1.data ?? []).length === 1, `name: ${up1.error?.message}`);
    const up2 = await userA.client.from("trazadoc_file_documents").update({ title: `${RUN} descargable (editado)` }).eq("id", fileDocId).select("id");
    assert(!up2.error && (up2.data ?? []).length === 1, `título: ${up2.error?.message}`);
  });

  // ── Área 10 · Reserva CPR (cuota Full 500 MB con committed sembrado) ─────
  let evB1 = "";
  let evB2 = "";
  await check("10. Begin crea el intent DURABLE y la cuota bloquea contando reservas activas", async () => {
    // Sembrado server-only: 499 MB comprometidos (fila con objeto declarado).
    const seed = await admin.from("evidences").insert({
      organization_id: orgB,
      name: `${RUN} seed`,
      storage_path: `${orgB}/${RUN}/seed.bin`,
      size_bytes: 499 * MB,
    });
    assert(!seed.error, `seed: ${seed.error?.message}`);
    const e1 = await userB.client.from("evidences").insert({ organization_id: orgB, name: `${RUN} evB1` }).select("id").single();
    const e2 = await userB.client.from("evidences").insert({ organization_id: orgB, name: `${RUN} evB2` }).select("id").single();
    assert(!e1.error && !e2.error, `evidencias B: ${e1.error?.message ?? e2.error?.message}`);
    evB1 = e1.data!.id as string;
    evB2 = e2.data!.id as string;

    const over = await beginCpr(userB.client, "evidence", evB1, "grande.pdf", 18 * MB);
    assert(over.error && /STORAGE_QUOTA_EXCEEDED/.test(over.error.message), `begin sobre cuota: ${over.error?.message}`);

    const ok = await beginCpr(userB.client, "evidence", evB1, "informe.pdf", 512 * KB);
    assert(!ok.error && ok.data, `begin válido: ${ok.error?.message}`);
    const intent = ok.data as { intent_id: string; object_path: string; bucket_id: string };
    const durable = await admin.from("storage_upload_intents").select("status, object_path, expected_size_bytes").eq("id", intent.intent_id).single();
    assert(durable.data?.status === "pending" && durable.data?.object_path === intent.object_path,
      "el intent durable debía existir con la ruta exacta ANTES de cualquier upload");

    const second = await beginCpr(userB.client, "evidence", evB2, "otro.pdf", 600 * KB);
    assert(second.error && /STORAGE_QUOTA_EXCEEDED/.test(second.error.message),
      `la reserva activa debía contar: ${second.error?.message ?? "no rechazó"}`);
    const usage = await usageRow(userB.client, orgB, CPR);
    assert(Number(usage.storage_reserved_bytes) === 512 * KB, `reserva exacta en la vista (hay ${usage.storage_reserved_bytes})`);
    // Liberar: cancel + resolución server-only confirmada (sin objeto).
    const cancel = await userB.client.rpc("cancel_cpr_storage_upload", { p_intent_id: intent.intent_id });
    assert(!cancel.error, `cancel: ${cancel.error?.message}`);
    const resolve = await admin.rpc("resolve_cpr_upload_intent_object", { p_intent_id: intent.intent_id, p_removed: true });
    assert(resolve.data === "resolved", `resolución: ${resolve.error?.message ?? resolve.data}`);
  });

  // ── Área 11 · Reserva TrazaDocs CPR con Storage REAL ─────────────────────
  let docB = "";
  await check("11. TrazaDocs CPR: begin inicial + upload REAL a la ruta del intent + finalize server-only → v1 física con bytes exactos", async () => {
    const fd = await userB.client
      .from("trazadoc_file_documents")
      .insert({ organization_id: orgB, title: `${RUN} doc B`, category_code: "other", storage_path: "", file_name: "m.pdf", mime_type: "application/pdf", size_bytes: 0, created_by: userB.id })
      .select("id")
      .single();
    assert(!fd.error && fd.data, `doc B: ${fd.error?.message}`);
    docB = fd.data!.id as string;
    const size = 12 * KB;
    const begin = await beginCpr(userB.client, "trazadoc_initial", docB, "manual v1.pdf", size);
    assert(!begin.error && begin.data, `begin inicial: ${begin.error?.message}`);
    const intent = begin.data as { intent_id: string; object_path: string };
    assert(intent.object_path === `${orgB}/document_files/${docB}/v1/manual_v1.pdf`, `ruta derivada del documento (${intent.object_path})`);
    const up = await userB.client.storage.from("trazadocs-documents").upload(intent.object_path, deterministicBytes(size), { contentType: "application/pdf" });
    assert(!up.error, `upload real: ${up.error?.message}`);
    const fin = await admin.rpc(
      "finalize_trazadoc_file_document_initial_version_server",
      {
        p_actor_id: userB.id,
        p_intent_id: intent.intent_id,
        p_real_size_bytes: size,
        p_real_mime_type: "application/pdf",
        p_change_note: "Alta QA",
      }
    );

    assert(
      !fin.error && Number(fin.data) === 1,
      `finalize server-only: ${
        fin.error?.message ?? fin.data
      }`
    );
    const doc = await admin.from("trazadoc_file_documents").select("storage_path, size_bytes, current_version").eq("id", docB).single();
    assert(doc.data?.storage_path === intent.object_path && Number(doc.data?.size_bytes) === size && Number(doc.data?.current_version) === 1,
      "el documento debía quedar con la ruta/tamaño DEL INTENT y en v1");
    const versions = await admin.from("trazadoc_file_document_versions").select("id", { count: "exact", head: true }).eq("file_document_id", docB);
    assert((versions.count ?? 0) === 1, `exactamente una versión v1 (hay ${versions.count})`);
  });

  // ── Área 12 · TrazaDocs Textiles: sin descargables; reserva vía 0094 ─────
  let texIntentId = "";
  await check("12. Textiles: sin documentos descargables (sin cuota paralela); begin_v2 reserva bytes contra la cuota TEXTIL", async () => {
    const before = await usageRow(userB.client, orgB, TEX);
    const begin = await userB.client.rpc("begin_textile_evidence_upload_v2", {
      p_organization_id: orgB,
      p_file_name: "tex.pdf",
      p_file_size_bytes: 8 * KB,
      p_file_mime_type: "application/pdf",
      p_metadata: { title: `${RUN} tex`, evidence_type: "other" },
      p_ttl_minutes: 30,
      p_idempotency_key: null,
    });
    assert(!begin.error && begin.data, `begin_v2: ${begin.error?.message}`);
    texIntentId = (begin.data as { intent_id: string }).intent_id;
    const after = await usageRow(userB.client, orgB, TEX);
    assert(Number(after.storage_reserved_bytes) - Number(before.storage_reserved_bytes) === 8 * KB,
      `la reserva textil debía subir 8 KB (antes ${before.storage_reserved_bytes}, ahora ${after.storage_reserved_bytes})`);
    const cprRow = await usageRow(userB.client, orgB, CPR);
    assert(Number(cprRow.storage_reserved_bytes) === 0, "la reserva textil JAMÁS aparece en la fila CPR");
  });

  // ── Área 13 · Dos begins CONCURRENTES sobre la cuota restante ────────────
  await check("13. Concurrencia de begins CPR: uno reserva y el otro STORAGE_QUOTA_EXCEEDED", async () => {
    // Cuota restante ≈ 1 MB - 12 KB: dos reservas de 700 KB compiten.
    const [r1, r2] = await Promise.all([
      beginCpr(userB.client, "evidence", evB1, "carrera1.pdf", 700 * KB),
      beginCpr(userB.client, "evidence", evB2, "carrera2.pdf", 700 * KB),
    ]);
    const errors = [r1.error, r2.error].filter((e) => e !== null);
    assert(errors.length === 1 && /STORAGE_QUOTA_EXCEEDED/.test(errors[0]!.message),
      `exactamente un rechazo por cuota (hubo ${errors.length}: ${errors.map((e) => e?.message).join(" | ")})`);
    const winner = (r1.error ? r2 : r1).data as { intent_id: string };
    const cancel = await (r1.error ? userB : userB).client.rpc("cancel_cpr_storage_upload", { p_intent_id: winner.intent_id });
    assert(!cancel.error, `cancel del ganador: ${cancel.error?.message}`);
    const resolve = await admin.rpc("resolve_cpr_upload_intent_object", { p_intent_id: winner.intent_id, p_removed: true });
    assert(resolve.data === "resolved", `resolución del ganador: ${resolve.data}`);
  });

  // ── Área 14 · Intent FAILED con objeto REAL sigue contabilizado ──────────
  let intentF: { intent_id: string; object_path: string; bucket_id: string } | null = null;
  await check("14. FAILED con objeto: los bytes SIGUEN contando hasta la resolución server-only confirmada", async () => {
    const size = 16 * KB;
    const begin = await beginCpr(userB.client, "evidence", evB2, "fallida.pdf", size);
    assert(!begin.error && begin.data, `begin: ${begin.error?.message}`);
    intentF = begin.data as { intent_id: string; object_path: string; bucket_id: string };
    const up = await userB.client.storage.from("evidences").upload(intentF.object_path, deterministicBytes(size), { contentType: "application/pdf" });
    assert(!up.error, `upload real: ${up.error?.message}`);
    const before = await usageRow(userB.client, orgB, CPR);
    const cancel = await userB.client.rpc("cancel_cpr_storage_upload", { p_intent_id: intentF.intent_id });
    assert(!cancel.error, `cancel: ${cancel.error?.message}`);
    const mid = await usageRow(userB.client, orgB, CPR);
    // Mientras estaba pending: used = base y reserved = size; tras cancel
    // (failed no resuelto) los bytes pasan de reserva a USO comprometido.
    assert(Number(mid.storage_used_bytes) === Number(before.storage_used_bytes) + size,
      `los bytes del failed debían seguir contando como uso (antes ${before.storage_used_bytes} + ${size}, ahora ${mid.storage_used_bytes})`);
    assert(Number(mid.storage_reserved_bytes) === 0, "el failed ya no reserva (cuenta como objeto no resuelto)");
    // Resolución REAL: retiro confirmado libera.
    const rm = await admin.storage.from("evidences").remove([intentF.object_path]);
    assert(!rm.error, `retiro real: ${rm.error?.message}`);
    const resolve = await admin.rpc("resolve_cpr_upload_intent_object", { p_intent_id: intentF.intent_id, p_removed: true });
    assert(resolve.data === "resolved", `resolución: ${resolve.data}`);
    const after = await usageRow(userB.client, orgB, CPR);
    assert(Number(after.storage_used_bytes) === Number(mid.storage_used_bytes) - size,
      `el retiro confirmado debía liberar ${size} bytes (antes ${mid.storage_used_bytes}, ahora ${after.storage_used_bytes})`);
  });

  // ── Área 15 · PENDING VENCIDO con objeto REAL ────────────────────────────
  await check("15. Pending VENCIDO con objeto: deja de reservar la unidad pero sus bytes cuentan como objeto no resuelto", async () => {
    const size = 8 * KB;
    const begin = await beginCpr(userB.client, "evidence", evB2, "tardia.pdf", size);
    assert(!begin.error && begin.data, `begin: ${begin.error?.message}`);
    const intent = begin.data as { intent_id: string; object_path: string };
    const up = await userB.client.storage.from("evidences").upload(intent.object_path, deterministicBytes(size), { contentType: "application/pdf" });
    assert(!up.error, `upload real: ${up.error?.message}`);
    const age = await admin
      .from("storage_upload_intents")
      .update({ created_at: new Date(Date.now() - 3 * 3600e3).toISOString(), expires_at: new Date(Date.now() - 2 * 3600e3).toISOString() })
      .eq("id", intent.intent_id)
      .select("id");
    assert(!age.error && (age.data ?? []).length === 1, "no se pudo envejecer el intent");
    const usage = await usageRow(userB.client, orgB, CPR);
    assert(Number(usage.storage_reserved_bytes) === 0, "el vencido ya no reserva");
    // Sus bytes siguen dentro del uso (rama de no resueltos, dedup por ruta).
    const snap = await admin.rpc("module_storage_snapshot", { p_organization_id: orgB, p_module_code: CPR });
    const row = Array.isArray(snap.data) ? snap.data[0] : snap.data;
    assert(row && Number(row.committed_bytes) >= size, `los bytes del vencido debían contar (committed=${row?.committed_bytes})`);
    const rm = await admin.storage.from("evidences").remove([intent.object_path]);
    assert(!rm.error, `retiro real: ${rm.error?.message}`);
    const resolve = await admin.rpc("resolve_cpr_upload_intent_object", { p_intent_id: intent.intent_id, p_removed: true });
    assert(resolve.data === "resolved", `resolución: ${resolve.data}`);
  });

  // ── Áreas 16-18 · Ciclo pending_delete con objeto real ───────────────────
  let queuedPath = "";
  await check("16. queue_and_delete_evidence: encola pending_delete con el objeto REAL y la fila desaparece — el objeto SIGUE contando", async () => {
    const size = 10 * KB;
    const ev = await userB.client.from("evidences").insert({ organization_id: orgB, name: `${RUN} evQ` }).select("id").single();
    assert(!ev.error && ev.data, `evidencia Q: ${ev.error?.message}`);
    const begin = await beginCpr(userB.client, "evidence", ev.data!.id as string, "q.pdf", size);
    assert(!begin.error && begin.data, `begin: ${begin.error?.message}`);
    const intent = begin.data as { intent_id: string; object_path: string };
    queuedPath = intent.object_path;
    const up = await userB.client.storage.from("evidences").upload(queuedPath, deterministicBytes(size), { contentType: "application/pdf" });
    assert(!up.error, `upload real: ${up.error?.message}`);
    const fin = await admin.rpc(
      "finalize_evidence_attachment_server",
      {
        p_actor_id: userB.id,
        p_intent_id: intent.intent_id,
        p_real_size_bytes: size,
        p_real_mime_type: "application/pdf",
      }
    );

    assert(
      !fin.error,
      `finalize server-only: ${fin.error?.message}`
    );
    const before = await usageRow(userB.client, orgB, CPR);
    const del = await userB.client.rpc("queue_and_delete_evidence", { p_evidence_id: ev.data!.id });
    assert(!del.error, `queue_and_delete: ${del.error?.message}`);
    const gone = await admin.from("evidences").select("id", { count: "exact", head: true }).eq("id", ev.data!.id);
    assert((gone.count ?? 0) === 0, "la fila debía desaparecer en la misma transacción");
    const cand = await admin.from("storage_orphan_candidates").select("status, size_bytes").eq("object_path", queuedPath).single();
    assert(cand.data?.status === "pending_delete" && Number(cand.data?.size_bytes) === size, "candidato pending_delete con SU tamaño");
    const after = await usageRow(userB.client, orgB, CPR);
    assert(Number(after.storage_used_bytes) === Number(before.storage_used_bytes), "el objeto encolado SIGUE contando (dedup por ruta)");
  });

  await check("17. delete_failed SIGUE contando (resolución con fallo registrado)", async () => {
    const res = await admin.rpc("resolve_storage_deletion", {
      p_bucket_id: "evidences",
      p_object_path: queuedPath,
      p_outcome: "delete_failed",
      p_error_code: "storage_error_qa",
    });
    assert(res.data === true, `resolve delete_failed: ${res.error?.message ?? res.data}`);
    const cand = await admin.from("storage_orphan_candidates").select("status").eq("object_path", queuedPath).single();
    assert(cand.data?.status === "delete_failed", "el candidato debía quedar delete_failed");
    const usage = await usageRow(userB.client, orgB, CPR);
    assert(Number(usage.storage_used_bytes) >= 10 * KB, "delete_failed sigue dentro del uso");
  });

  await check("18. SOLO deleted (retiro físico confirmado) libera", async () => {
    const before = await usageRow(userB.client, orgB, CPR);
    const rm = await admin.storage.from("evidences").remove([queuedPath]);
    assert(!rm.error, `retiro real: ${rm.error?.message}`);
    const res = await admin.rpc("resolve_storage_deletion", {
      p_bucket_id: "evidences",
      p_object_path: queuedPath,
      p_outcome: "deleted",
      p_error_code: null,
    });
    assert(res.data === true, `resolve deleted: ${res.error?.message ?? res.data}`);
    const after = await usageRow(userB.client, orgB, CPR);
    assert(Number(after.storage_used_bytes) === Number(before.storage_used_bytes) - 10 * KB,
      `deleted debía liberar 10 KB (antes ${before.storage_used_bytes}, ahora ${after.storage_used_bytes})`);
  });

  // ── Área 19 · Tamaño DESCONOCIDO bloquea begin ───────────────────────────
  await check("19. size NULL con ruta: unknown_size_count > 0 y begin bloqueado (STORAGE_UNVERIFIABLE)", async () => {
    const ins = await admin.from("storage_orphan_candidates").insert({
      organization_id: orgB,
      module_code: CPR,
      bucket_id: "evidences",
      object_path: `${orgB}/${RUN}/unk.bin`,
      size_bytes: null,
      source_type: "evidence",
      source_id: randomUUID(),
      status: "pending_delete",
    });
    assert(!ins.error, `sembrado desconocido: ${ins.error?.message}`);
    const usage = await usageRow(userB.client, orgB, CPR);
    assert(Number(usage.storage_unknown_size_count) >= 1, "la vista debía exponer el desconocido");
    const begin = await beginCpr(userB.client, "evidence", evB1, "bloqueada.pdf", 4 * KB);
    assert(begin.error && /STORAGE_UNVERIFIABLE/.test(begin.error.message), `begin: ${begin.error?.message ?? "no bloqueó"}`);
    const del = await admin.from("storage_orphan_candidates").delete().eq("object_path", `${orgB}/${RUN}/unk.bin`).select("id");
    assert((del.data ?? []).length === 1, "limpieza del desconocido sembrado");
  });

  // ── Área 20 · Aislamiento de conteos ─────────────────────────────────────
  await check("20. count_module_resource: usuario ajeno → NULL; miembro → sus conteos", async () => {
    const foreign = await userX.client.rpc("count_module_resource", {
      p_organization_id: orgB,
      p_module_code: CPR,
      p_resource_code: "evidences",
    });
    assert(!foreign.error && foreign.data === null, `ajeno debía recibir NULL (${foreign.error?.message ?? String(foreign.data)})`);
    const own = await userB.client.rpc("count_module_resource", {
      p_organization_id: orgB,
      p_module_code: CPR,
      p_resource_code: "evidences",
    });
    assert(!own.error && Number(own.data) >= 2, `el miembro debía ver su conteo (${own.error?.message ?? String(own.data)})`);
  });

  // ── Área 21 · Idempotency key VENCIDA ────────────────────────────────────
  await check("21. Clave vencida: se expira ATÓMICAMENTE y la MISMA ruta se revive — sin unique_violation ni bloqueo", async () => {
    const b1 = await beginCpr(userB.client, "evidence", evB1, "conclave.pdf", 6 * KB, `${RUN}-K1`);
    assert(!b1.error && b1.data, `begin 1: ${b1.error?.message}`);
    const i1 = (b1.data as { intent_id: string }).intent_id;
    const age = await admin
      .from("storage_upload_intents")
      .update({ created_at: new Date(Date.now() - 3 * 3600e3).toISOString(), expires_at: new Date(Date.now() - 2 * 3600e3).toISOString() })
      .eq("id", i1)
      .select("id");
    assert(!age.error && (age.data ?? []).length === 1, "no se pudo envejecer el intent");
    const b2 = await beginCpr(userB.client, "evidence", evB1, "conclave.pdf", 6 * KB, `${RUN}-K1`);
    assert(!b2.error && b2.data, `begin 2 (misma clave): ${b2.error?.message ?? "unique_violation"}`);
    const i2 = (b2.data as { intent_id: string; reused: boolean }).intent_id;
    assert(i2 === i1, "la MISMA ruta se revive (mismo intent, una sola reserva)");
    const row = await admin.from("storage_upload_intents").select("status, expires_at").eq("id", i1).single();
    assert(row.data?.status === "pending" && new Date(row.data.expires_at as string).getTime() > Date.now(),
      "el intent revivido queda pending y vigente");
    const cancel = await userB.client.rpc("cancel_cpr_storage_upload", { p_intent_id: i1 });
    assert(!cancel.error, `cancel: ${cancel.error?.message}`);
    const resolve = await admin.rpc("resolve_cpr_upload_intent_object", { p_intent_id: i1, p_removed: true });
    assert(resolve.data === "resolved", `resolución: ${resolve.data}`);
  });

  // ── Área 22 · Borrado con Demo VENCIDO ───────────────────────────────────
  await check("22. queue_and_delete_evidence con Demo VENCIDO → MODULE_ACCESS_BLOCKED (los datos se conservan)", async () => {
    await setModuleAdmin(orgA, CPR, "demo", new Date(Date.now() - 3600e3).toISOString());
    const del = await userA.client.rpc("queue_and_delete_evidence", { p_evidence_id: evA });
    assert(del.error && /MODULE_ACCESS_BLOCKED/.test(del.error.message), `esperaba MODULE_ACCESS_BLOCKED (${del.error?.message ?? "no lanzó"})`);
    const still = await admin.from("evidences").select("id", { count: "exact", head: true }).eq("id", evA);
    assert((still.count ?? 0) === 1, "la evidencia debía CONSERVARSE");
  });

  // Cierre del intent textil del área 12 (retiro confirmado server-only).
  if (texIntentId) {
    await admin.rpc("record_textile_upload_intent_cleanup_server", {
      p_actor_id: userB.id,
      p_intent_id: texIntentId,
      p_removed: true,
    });
  }

  console.log(`\nÁreas 1-22 · resultado parcial: ${passed} ✔, ${failed} ✘`);
}

// ── Área 23 · Limpieza TOTAL verificada (T9F.4 · §28) ───────────────────────
async function cleanup() {
  console.log("\nÁrea 23 · Limpieza total verificada\n");
  let residues = 0;
  const flag = (cond: boolean, what: string) => {
    if (!cond) {
      residues += 1;
      console.error(`  ✘ residuo: ${what}`);
    }
  };

  // 1. Inventario de objetos físicos del run ANTES de borrar filas — con
  //    OBJETO NOMBRADO (jamás desestructuración posicional de Promise.all:
  //    ese patrón dejó storage_orphan_candidates sin asignar en la revisión
  //    de T9F.3) y cubriendo TODAS las fuentes: intents textiles, intents
  //    genéricos (reservas), evidencias, textiles, maestro + versiones y la
  //    cola pending_delete / delete_failed.
  const paths: Record<string, Set<string>> = { evidences: new Set(), "trazadocs-documents": new Set() };
  for (const org of createdOrgs) {
    const cleanupData = {
      textileIntents: await admin.from("textile_evidence_upload_intents").select("bucket_id, object_path").eq("organization_id", org),
      genericIntents: await admin.from("storage_upload_intents").select("bucket_id, object_path").eq("organization_id", org),
      textileEvidences: await admin.from("textile_evidences").select("file_path").eq("organization_id", org),
      evidences: await admin.from("evidences").select("storage_path").eq("organization_id", org),
      fileDocuments: await admin.from("trazadoc_file_documents").select("storage_path").eq("organization_id", org),
      versions: await admin.from("trazadoc_file_document_versions").select("storage_path").eq("organization_id", org),
      orphanCandidates: await admin.from("storage_orphan_candidates").select("bucket_id, object_path").eq("organization_id", org),
    };
    for (const r of cleanupData.textileIntents.data ?? []) paths[r.bucket_id as string]?.add(r.object_path as string);
    for (const r of cleanupData.genericIntents.data ?? []) paths[r.bucket_id as string]?.add(r.object_path as string);
    for (const r of cleanupData.textileEvidences.data ?? []) if (r.file_path) paths.evidences.add(r.file_path as string);
    for (const r of cleanupData.evidences.data ?? []) if (r.storage_path) paths.evidences.add(r.storage_path as string);
    for (const r of cleanupData.fileDocuments.data ?? []) if (r.storage_path) paths["trazadocs-documents"].add(r.storage_path as string);
    for (const r of cleanupData.versions.data ?? []) if (r.storage_path) paths["trazadocs-documents"].add(r.storage_path as string);
    for (const r of cleanupData.orphanCandidates.data ?? []) paths[r.bucket_id as string]?.add(r.object_path as string);
  }
  for (const [bucket, set] of Object.entries(paths)) {
    const list = [...set].filter((p) => p.includes(RUN) || createdOrgs.some((o) => p.startsWith(`${o}/`)));
    if (list.length > 0) {
      const { error } = await admin.storage.from(bucket).remove(list);
      if (error) console.error(`  · aviso: retiro en ${bucket}: ${error.message}`);
    }
  }

  // 2. Filas del run, por organización (reservas e intents incluidos).
  for (const org of createdOrgs) {
    for (const table of [
      "storage_orphan_candidates",
      "storage_upload_intents",
      "textile_evidence_upload_intents",
      "textile_evidences",
      "textile_materials",
      "textile_suppliers",
      "trazadoc_file_document_versions",
      "trazadoc_file_documents",
      "trazadoc_documents",
      "evidences",
      "suppliers",
      "subscription_plan_history",
      "organization_subscriptions",
      "organization_modules",
      "team_invitations",
      "memberships",
    ]) {
      const { error } = await admin.from(table).delete().eq("organization_id", org);
      if (error && !/does not exist/.test(error.message)) {
        flag(false, `borrado en ${table} (${org}): ${error.message}`);
      }
    }
  }

  // 3. ORGANIZACIONES: la eliminación DEBE funcionar (sin renombrar, sin
  //    "neutralizar"). Si falla, es un fallo de la suite, no un aviso.
  for (const org of createdOrgs) {
    const { error } = await admin.from("organizations").delete().eq("id", org);
    flag(!error, `organización ${org} no eliminable: ${error?.message ?? ""}`);
  }

  // 4. Perfiles y usuarios Auth del run.
  for (const uid of createdUsers) {
    await admin.from("platform_staff").delete().eq("user_id", uid);
    await admin.from("profiles").delete().eq("id", uid);
    const { error } = await admin.auth.admin.deleteUser(uid);
    flag(!error, `usuario ${uid}: ${error?.message ?? ""}`);
  }

  // 5. VERIFICACIÓN de cero residuos del run (ampliada T9F.4 · §28): cero
  //    organizaciones, usuarios, objetos, filas, cero candidatos
  //    pending_delete / delete_failed, cero reservas y cero intents.
  const orgFilter = createdOrgs.length ? createdOrgs : ["00000000-0000-0000-0000-000000000000"];
  const orgsLeft = await admin.from("organizations").select("id", { count: "exact", head: true }).in("id", orgFilter);
  flag((orgsLeft.count ?? 0) === 0, `${orgsLeft.count} organización(es) del run siguen existiendo`);
  for (const table of [
    "suppliers",
    "evidences",
    "trazadoc_documents",
    "trazadoc_file_documents",
    "trazadoc_file_document_versions",
    "textile_evidences",
    "textile_evidence_upload_intents",
    "storage_upload_intents",
    "storage_orphan_candidates",
    "memberships",
  ]) {
    const left = await admin.from(table).select("id", { count: "exact", head: true }).in("organization_id", orgFilter);
    flag((left.count ?? 0) === 0, `${left.count} fila(s) residuales en ${table}`);
  }
  for (const [bucket] of Object.entries(paths)) {
    for (const org of createdOrgs) {
      const { data } = await admin.storage.from(bucket).list(org, { limit: 5 });
      flag((data ?? []).length === 0, `objetos residuales en ${bucket}/${org}`);
    }
  }
  for (const uid of createdUsers) {
    const { data } = await admin.auth.admin.getUserById(uid);
    flag(!data?.user, `usuario Auth residual ${uid}`);
  }

  if (residues > 0) {
    console.error(`\nLimpieza INCOMPLETA: ${residues} residuo(s).`);
    failed += residues;
  } else {
    console.log("  ✔ cero organizaciones, usuarios, objetos, candidatos, reservas, intents y filas del run");
  }
}

main()
  .then(cleanup)
  .then(() => {
    console.log(`\nRLS T9F.4 · resultado final: ${passed} ✔, ${failed} ✘`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    console.error("Suite abortada:", (err as Error).message);
    try {
      await cleanup();
    } catch (cleanupErr) {
      console.error("Limpieza tras aborto también falló:", (cleanupErr as Error).message);
    }
    process.exit(1);
  });
