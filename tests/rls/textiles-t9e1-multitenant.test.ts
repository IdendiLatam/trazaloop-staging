/**
 * Trazaloop · Sprint T9E.1 (Textil) · Prueba REAL de RLS y aislamiento
 * multi-tenant contra la base de datos de .env.local (STAGING — jamás
 * producción): fibras personalizadas (0093), intentos de carga directa
 * (0094), objetos privados de Storage, expiración de signed URLs, anon
 * bloqueado y RPC pública del pasaporte.
 *
 * Crea datos temporales con identificadores aleatorios y los LIMPIA al
 * final (best-effort documentado). Credenciales generadas en memoria y
 * NUNCA impresas. Requiere: NEXT_PUBLIC_SUPABASE_URL,
 * NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Correr: npx tsx tests/rls/textiles-t9e1-multitenant.test.ts
 * (Sin encadenar en test:all: exige BD viva, como tests/rls/isolation.)
 */
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables de Supabase en .env.local");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

type QaUser = { id: string; email: string; client: SupabaseClient };
const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const createdObjects: string[] = [];

async function newUser(label: string): Promise<QaUser> {
  const email = `t9e1-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  // Credencial ALEATORIA solo en memoria — jamás se imprime ni persiste.
  // (≤72 caracteres: límite de bcrypt/GoTrue.)
  const password = `Qa1-${randomUUID()}${randomUUID().slice(0, 8)}`;
  // El endpoint admin puede fallar transitoriamente: reintento con backoff.
  let user: { id: string } | null = null;
  for (let attempt = 1; attempt <= 3 && !user; attempt++) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `QA T9E.1 ${label}` },
    });
    if (!error && data.user) user = data.user;
    else if (attempt === 3) throw new Error(`createUser ${label}: ${error?.message || "sin detalle"}`);
    else await new Promise((r) => setTimeout(r, 1200 * attempt));
  }
  const data = { user: user! };
  createdUsers.push(data.user.id);
  const client = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn ${label}: ${signInErr.message}`);
  return { id: data.user.id, email, client };
}

async function createOrg(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.rpc("create_organization", { p_name: name });
  if (error || !data) throw new Error(`create_organization: ${error?.message}`);
  createdOrgs.push(data as string);
  return data as string;
}

async function addMember(orgId: string, userId: string, role: string) {
  const { error } = await admin
    .from("memberships")
    .insert({ organization_id: orgId, user_id: userId, role_code: role, status: "active" });
  if (error) throw new Error(`membership ${role}: ${error.message}`);
}

async function enableTextiles(orgId: string) {
  const { error } = await admin
    .from("organization_modules")
    .upsert(
      { organization_id: orgId, module_code: "textiles", enabled: true },
      { onConflict: "organization_id,module_code" }
    );
  if (error) throw new Error(`enable textiles: ${error.message}`);
}

async function main() {
  console.log("\nTrazaloop · T9E.1: RLS y multi-tenant REAL (staging)\n");

  const adminA = await newUser("adminA");
  const qualityA = await newUser("qualityA");
  const consultantA = await newUser("consultantA");
  const adminB = await newUser("adminB");

  const orgA = await createOrg(adminA.client, `QA T9E1 A ${Date.now()} (temporal)`);
  const orgB = await createOrg(adminB.client, `QA T9E1 B ${Date.now()} (temporal)`);
  await addMember(orgA, qualityA.id, "quality");
  await addMember(orgA, consultantA.id, "consultant");
  await enableTextiles(orgA);
  await enableTextiles(orgB);
  console.log("Datos temporales creados (2 organizaciones, 4 usuarios).\n");

  let fiberId = "";
  let supplierAId = "";

  await check("1. Admin A crea una fibra personalizada de A", async () => {
    const { data, error } = await adminA.client
      .from("textile_fiber_types")
      .insert({
        organization_id: orgA,
        code: `custom_${randomUUID()}`,
        name: `Fibra QA A ${Date.now()}`,
        fiber_family: "other",
        display_order: 1000,
        created_by: adminA.id,
      })
      .select("id")
      .single();
    assert(!error && data, `insert falló: ${error?.message}`);
    fiberId = data!.id as string;
  });

  await check("2. B NO puede leer la fibra personalizada de A", async () => {
    const { data } = await adminB.client
      .from("textile_fiber_types")
      .select("id")
      .eq("id", fiberId);
    assert((data ?? []).length === 0, "B pudo leer la fibra de A");
  });

  await check("3. B NO puede modificar la fibra de A", async () => {
    const { data } = await adminB.client
      .from("textile_fiber_types")
      .update({ name: "hackeada" })
      .eq("id", fiberId)
      .select("id");
    assert((data ?? []).length === 0, "B modificó la fibra de A");
  });

  await check("4. B NO puede eliminar la fibra de A", async () => {
    const { data } = await adminB.client
      .from("textile_fiber_types")
      .delete()
      .eq("id", fiberId)
      .select("id");
    assert((data ?? []).length === 0, "B eliminó la fibra de A");
    const { data: still } = await admin
      .from("textile_fiber_types")
      .select("id")
      .eq("id", fiberId);
    assert((still ?? []).length === 1, "la fibra desapareció");
  });

  await check("5. B NO puede usar la fibra de A en sus materiales (trigger 0093)", async () => {
    const { error } = await adminB.client.from("textile_materials").insert({
      organization_id: orgB,
      name: `Material B ${Date.now()}`,
      material_type: "main_fabric",
      primary_fiber_type_id: fiberId,
    });
    assert(error !== null, "B usó la fibra personalizada de A");
  });

  await check("6. A SÍ puede usar su fibra personalizada en materiales", async () => {
    const { error } = await adminA.client.from("textile_materials").insert({
      organization_id: orgA,
      name: `Material A ${Date.now()}`,
      material_type: "main_fabric",
      primary_fiber_type_id: fiberId,
    });
    assert(error === null, `A no pudo usar su fibra: ${error?.message}`);
  });

  await check("7. Consultant (sin permiso de catálogo) NO puede crear fibras", async () => {
    const { error } = await consultantA.client.from("textile_fiber_types").insert({
      organization_id: orgA,
      code: `custom_${randomUUID()}`,
      name: `Fibra consultor ${Date.now()}`,
      fiber_family: "other",
    });
    assert(error !== null, "consultant creó una fibra personalizada");
  });

  await check("8. Consultant NO puede eliminar registros de catálogo (delete admin/quality)", async () => {
    const { data: sup, error: supErr } = await adminA.client
      .from("textile_suppliers")
      .insert({ organization_id: orgA, name: `Proveedor QA A ${Date.now()}` })
      .select("id")
      .single();
    assert(!supErr && sup, `no se pudo crear proveedor: ${supErr?.message}`);
    supplierAId = sup!.id as string;
    const { data: del } = await consultantA.client
      .from("textile_suppliers")
      .delete()
      .eq("id", supplierAId)
      .select("id");
    assert((del ?? []).length === 0, "consultant eliminó un proveedor");
  });

  // --- Intentos de carga directa (0094) ---
  let intentAId = "";

  await check("9. INSERT directo de intentos bloqueado (T9E.2) — tampoco PARA otra organización", async () => {
    const forgedId = randomUUID();
    const { error } = await adminA.client.from("textile_evidence_upload_intents").insert({
      id: forgedId,
      organization_id: orgB,
      created_by: adminA.id,
      object_path: `${orgB}/textiles/${forgedId}/x.pdf`,
      original_filename: "x.pdf",
      safe_filename: "x.pdf",
      expected_size_bytes: 100,
      expected_mime_type: "application/pdf",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    assert(error !== null, "A creó un intento para la organización B");
  });

  await check("9b. La ruta de un intento no puede apuntar a OTRA organización (CHECK 0094)", async () => {
    const forgedId = randomUUID();
    const { error } = await adminA.client.from("textile_evidence_upload_intents").insert({
      id: forgedId,
      organization_id: orgA,
      created_by: adminA.id,
      object_path: `${orgB}/textiles/${forgedId}/x.pdf`,
      original_filename: "x.pdf",
      safe_filename: "x.pdf",
      expected_size_bytes: 100,
      expected_mime_type: "application/pdf",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    assert(error !== null, "la ruta cruzada pasó el CHECK");
  });

  await check("10. B NO puede finalizar (consumir) el intento de A (T9E.2: creado vía RPC begin)", async () => {
    // T9E.2 cerró el INSERT directo: el intento nace por la RPC de 0097.
    const { data, error } = await adminA.client.rpc("begin_textile_evidence_upload", {
      p_organization_id: orgA,
      p_file_name: "prueba.pdf",
      p_file_size_bytes: 8,
      p_file_mime_type: "application/pdf",
      p_metadata: { title: "Prueba multitenant", evidence_type: "other" },
      p_ttl_minutes: 30,
    });
    assert(error === null && data, `A no pudo iniciar su intento: ${error?.message}`);
    intentAId = (data as { intent_id: string }).intent_id;
    const { data: upd } = await adminB.client
      .from("textile_evidence_upload_intents")
      .update({ status: "consumed", consumed_at: new Date().toISOString() })
      .eq("id", intentAId)
      .eq("status", "pending")
      .select("id");
    assert((upd ?? []).length === 0, "B consumió el intento de A por UPDATE directo");
    // T9E.3 (0098): la RPC de finalización quedó SELLADA para authenticated —
    // hoy B recibe "permission denied" antes siquiera de evaluar la propiedad.
    const { error: finErr } = await adminB.client.rpc("finalize_textile_evidence_upload", {
      p_intent_id: intentAId,
      p_file_size_bytes: 8,
      p_file_mime_type: "application/pdf",
    });
    assert(finErr !== null, "B finalizó el intento de A vía RPC");
  });

  await check("10b. NADIE consume por UPDATE directo (T9E.2): ni siquiera el creador; sin doble consumo", async () => {
    // El consumo directo quedó cerrado para clientes: solo la RPC atómica
    // (la idempotencia y el no-doble-consumo reales se prueban en
    // tests/rls/textiles-t9e2-integrity.test.ts, checks 6-9).
    const { data: own, error: ownErr } = await adminA.client
      .from("textile_evidence_upload_intents")
      .update({ status: "consumed", consumed_at: new Date().toISOString() })
      .eq("id", intentAId)
      .select("id");
    assert(ownErr !== null || (own ?? []).length === 0, "el creador pudo consumir por UPDATE directo");
    const { data: still } = await adminA.client
      .from("textile_evidence_upload_intents")
      .select("status")
      .eq("id", intentAId)
      .single();
    assert(still?.status === "pending", "el intento cambió de estado sin RPC");
  });

  // --- Storage privado ---
  // T9E.4 (0099): una ruta textil solo admite carga contra la ruta EXACTA de un
  // intento propio y vigente, así que el objeto se crea por el mecanismo
  // LEGÍTIMO (intento + URL firmada), no con un UUID inventado.
  let objectPath = "";

  await check("11. A sube un objeto privado; B NO puede leerlo ni firmarlo", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const { data: begun, error: beginErr } = await adminA.client.rpc("begin_textile_evidence_upload", {
      p_organization_id: orgA,
      p_file_name: "privado.pdf",
      p_file_size_bytes: bytes.length,
      p_file_mime_type: "application/pdf",
      p_metadata: { title: "Objeto privado multitenant", evidence_type: "other" },
      p_ttl_minutes: 30,
    });
    assert(beginErr === null && begun, `A no pudo iniciar el intento: ${beginErr?.message}`);
    objectPath = (begun as { object_path: string }).object_path;
    createdObjects.push(objectPath);
    const { data: signedUpload, error: signErr0 } = await adminA.client.storage
      .from("evidences")
      .createSignedUploadUrl(objectPath);
    assert(signErr0 === null && signedUpload, `A no pudo emitir la URL firmada: ${signErr0?.message}`);
    const { error: upErr } = await adminA.client.storage
      .from("evidences")
      .uploadToSignedUrl(objectPath, signedUpload!.token, bytes, { contentType: "application/pdf" });
    assert(upErr === null, `A no pudo subir: ${upErr?.message}`);
    const { data: dl, error: dlErr } = await adminB.client.storage
      .from("evidences")
      .download(objectPath);
    assert(dlErr !== null && !dl, "B descargó el objeto privado de A");
    const { data: signed, error: signErr } = await adminB.client.storage
      .from("evidences")
      .createSignedUrl(objectPath, 60);
    assert(signErr !== null || !signed, "B firmó una URL del objeto de A");
  });

  await check("12. Una signed URL de descarga EXPIRA", async () => {
    const { data, error } = await adminA.client.storage
      .from("evidences")
      .createSignedUrl(objectPath, 1);
    assert(error === null && data?.signedUrl, `A no pudo firmar: ${error?.message}`);
    await new Promise((r) => setTimeout(r, 2500));
    const res = await fetch(data!.signedUrl);
    assert(res.status >= 400, `la URL firmada siguió viva (status ${res.status})`);
  });

  await check("13. anon NO puede subir ni listar en el bucket privado", async () => {
    const anon = createClient(URL!, ANON!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: upErr } = await anon.storage
      .from("evidences")
      .upload(`${orgA}/textiles/${randomUUID()}/anon.pdf`, new Uint8Array([1]), {
        contentType: "application/pdf",
      });
    assert(upErr !== null, "anon subió al bucket privado");
    const { data: listed, error: listErr } = await anon.storage
      .from("evidences")
      .list(`${orgA}/textiles`, { limit: 5 });
    assert(listErr !== null || (listed ?? []).length === 0, "anon listó el bucket privado");
  });

  await check("14. anon NO lee la tabla de enlaces del pasaporte; la RPC pública responde genérico", async () => {
    const anon = createClient(URL!, ANON!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: rows, error: selErr } = await anon
      .from("textile_technical_passport_share_links")
      .select("id")
      .limit(1);
    assert(selErr !== null || (rows ?? []).length === 0, "anon leyó la tabla de enlaces");
    const { data: rpc, error: rpcErr } = await anon.rpc("resolve_textile_passport_share", {
      p_token: randomUUID(),
    });
    assert(rpcErr === null, `la RPC pública falló: ${rpcErr?.message}`);
    const payload = rpc as { ok?: boolean; reason?: string };
    assert(payload?.ok === false && payload?.reason === "not_available", "la RPC no respondió genérico");
  });

  await check("15. anon NO lee los intentos de carga (deny-by-default 0094)", async () => {
    const anon = createClient(URL!, ANON!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon
      .from("textile_evidence_upload_intents")
      .select("id")
      .limit(1);
    assert(error !== null || (data ?? []).length === 0, "anon leyó los intentos");
  });

  console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
}

async function cleanup() {
  console.log("\nLimpieza de datos temporales…");
  let removed = 0;
  try {
    if (createdObjects.length > 0) {
      await admin.storage.from("evidences").remove(createdObjects);
      removed += createdObjects.length;
    }
    for (const org of createdOrgs) {
      // Objetos residuales bajo el prefijo de cada organización temporal.
      const { data: dirs } = await admin.storage.from("evidences").list(`${org}/textiles`, { limit: 50 });
      for (const d of dirs ?? []) {
        const { data: files } = await admin.storage
          .from("evidences")
          .list(`${org}/textiles/${d.name}`, { limit: 50 });
        const paths = (files ?? []).map((f) => `${org}/textiles/${d.name}/${f.name}`);
        if (paths.length > 0) {
          await admin.storage.from("evidences").remove(paths);
          removed += paths.length;
        }
      }
      for (const table of [
        "textile_evidence_upload_intents", // los consumidos no se borran (guard): se toleran
        "textile_materials",
        "textile_suppliers",
        "textile_fiber_types",
        "organization_modules",
        "memberships",
        "organization_subscriptions",
      ]) {
        await admin.from(table).delete().eq("organization_id", org);
      }
      // La fila organizations queda como cascarón si audit_log (append-only
      // por diseño, 0005) la referencia — mismo residuo documentado que T9E.1.
      await admin.from("organizations").delete().eq("id", org);
    }
    for (const userId of createdUsers) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        // FK de auditoría: rotar + banear + soft-delete (sesiones revocadas).
        await admin.auth.admin.updateUserById(userId, {
          password: `${randomUUID()}-${randomUUID()}`,
          ban_duration: "87600h",
        });
        await admin.auth.admin.deleteUser(userId, true);
      }
    }
    console.log(
      `Limpieza: ${removed} objeto(s) de Storage retirados; usuarios temporales eliminados/rotados: ${createdUsers.length}; organizaciones tratadas: ${createdOrgs.length}.`
    );
  } catch (err) {
    console.error("Limpieza parcial:", (err as Error).message);
  }
}

main()
  .then(cleanup)
  .then(() => {
    if (failed > 0) process.exit(1);
    console.log("Todo verde.");
  })
  .catch(async (err) => {
    console.error("Fallo:", (err as Error).message);
    await cleanup();
    process.exit(1);
  });
