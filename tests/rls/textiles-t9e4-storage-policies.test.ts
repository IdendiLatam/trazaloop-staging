/**
 * Trazaloop · Sprint T9E.4 (Textil) · Prueba REAL de las políticas de Storage
 * contra STAGING (jamás producción), con la migración 0099 aplicada:
 *
 *   · INSERT textil SOLO contra la ruta EXACTA de un intento propio, pending
 *     y vigente — cualquier renombrado, subdirectorio, intent_id ajeno,
 *     traversal, otro usuario u otra organización se rechaza;
 *   · UPDATE / upsert de objetos textiles: prohibido para authenticated;
 *   · DELETE directo de objetos textiles: prohibido para TODOS (creador, otro
 *     admin de la organización, otra organización, anon), incluidos los
 *     objetos de evidencias YA finalizadas;
 *   · la eliminación física legítima es server-only y se niega a tocar
 *     objetos ligados a evidencias o intentos consumidos;
 *   · el flujo CPR (rutas {org}/{evidence_id}/{archivo}) sigue funcionando.
 *
 * Credenciales aleatorias SOLO en memoria; jamás se imprimen. Limpia todo.
 *
 * Correr: npx tsx tests/rls/textiles-t9e4-storage-policies.test.ts
 * (Sin encadenar en test:all: exige BD viva, como tests/rls/*.)
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
const BUCKET = "evidences";

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

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x45, 0x4f, 0x46]);
const META = {
  title: "Evidencia storage T9E4",
  evidence_type: "other",
  description: null,
  document_date: null,
  issuer: null,
  reference_code: null,
  valid_from: null,
  valid_until: null,
};

const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const createdObjects: string[] = [];

async function newUser(label: string) {
  const email = `t9e4-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const password = `Qa1-${randomUUID()}${randomUUID().slice(0, 8)}`;
  let user: { id: string } | null = null;
  for (let attempt = 1; attempt <= 3 && !user; attempt++) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: `QA T9E.4 ${label}` },
    });
    if (!error && data.user) user = data.user;
    else if (attempt === 3) throw new Error(`createUser ${label}: ${error?.message || "sin detalle"}`);
    else await new Promise((r) => setTimeout(r, 1200 * attempt));
  }
  createdUsers.push(user!.id);
  const client = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${label}: ${error.message}`);
  return { id: user!.id, client };
}

async function beginIntent(client: SupabaseClient, orgId: string, fileName = "prueba.pdf") {
  const { data, error } = await client.rpc("begin_textile_evidence_upload", {
    p_organization_id: orgId, p_file_name: fileName, p_file_size_bytes: PDF.length,
    p_file_mime_type: "application/pdf", p_metadata: META, p_ttl_minutes: 30,
  });
  if (error || !data) throw new Error(`begin: ${error?.message}`);
  const row = data as { intent_id: string; object_path: string };
  createdObjects.push(row.object_path);
  return row;
}

/** Sube por el mecanismo LEGÍTIMO (URL firmada emitida para la ruta exacta). */
async function uploadLegit(client: SupabaseClient, objectPath: string) {
  const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(objectPath);
  if (error || !data) return { error: error ?? new Error("sin URL firmada") };
  return client.storage
    .from(BUCKET)
    .uploadToSignedUrl(objectPath, data.token, PDF, { contentType: "application/pdf" });
}

const objectExists = async (path: string) =>
  (await admin.storage.from(BUCKET).info(path)).data !== null;

async function main() {
  console.log("\nTrazaloop · T9E.4: políticas REALES de Storage (staging, 0099)\n");

  const a1 = await newUser("a1");
  const a2 = await newUser("a2");
  const a3 = await newUser("a3");
  const b = await newUser("b");

  const { data: orgAData, error: eA } = await a1.client.rpc("create_organization", {
    p_name: `QA T9E4 A ${Date.now()} (temporal)`,
  });
  if (eA || !orgAData) throw new Error(`orgA: ${eA?.message}`);
  const orgA = orgAData as string;
  createdOrgs.push(orgA);
  const { data: orgBData, error: eB } = await b.client.rpc("create_organization", {
    p_name: `QA T9E4 B ${Date.now()} (temporal)`,
  });
  if (eB || !orgBData) throw new Error(`orgB: ${eB?.message}`);
  const orgB = orgBData as string;
  createdOrgs.push(orgB);

  await admin.from("memberships").insert({
    organization_id: orgA, user_id: a2.id, role_code: "admin", status: "active",
  });
  for (const org of [orgA, orgB]) {
    await admin.from("organization_modules").upsert(
      { organization_id: org, module_code: "textiles", enabled: true },
      { onConflict: "organization_id,module_code" }
    );
  }
  const anon = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log("Datos temporales creados (2 organizaciones, 4 usuarios).\n");

  console.log("── INSERT textil ────────────────────────────────────────────\n");

  await check("1. A1 sube a una ruta Textiles SIN intento → RECHAZADO", async () => {
    const ruta = `${orgA}/textiles/${randomUUID()}/inventado.pdf`;
    const { error } = await a1.client.storage.from(BUCKET).upload(ruta, PDF, { contentType: "application/pdf" });
    if (!error) createdObjects.push(ruta);
    assert(error !== null, "se permitió subir sin intento (bypass S1 reabierto)");
    assert(!(await objectExists(ruta)), "quedó un objeto pese al rechazo");
  });

  let intent!: { intent_id: string; object_path: string };
  await check("2. A1 crea intento válido y sube a la ruta EXACTA → PERMITIDO", async () => {
    intent = await beginIntent(a1.client, orgA);
    const { error } = await uploadLegit(a1.client, intent.object_path);
    assert(!error, `el flujo legítimo falló: ${error?.message}`);
    assert(await objectExists(intent.object_path), "el objeto no quedó almacenado");
  });

  await check("3. A1 cambia el NOMBRE del archivo → RECHAZADO", async () => {
    const ruta = intent.object_path.replace(/[^/]+$/, "renombrado.pdf");
    const { error } = await a1.client.storage.from(BUCKET).upload(ruta, PDF, { contentType: "application/pdf" });
    if (!error) createdObjects.push(ruta);
    assert(error !== null, "un nombre distinto al del intento fue aceptado");
  });

  await check("4. A1 cambia el intent_id → RECHAZADO", async () => {
    const ruta = `${orgA}/textiles/${randomUUID()}/prueba.pdf`;
    const { error } = await a1.client.storage.from(BUCKET).upload(ruta, PDF, { contentType: "application/pdf" });
    if (!error) createdObjects.push(ruta);
    assert(error !== null, "un intent_id ajeno fue aceptado");
  });

  await check("5. A1 añade un subdirectorio extra → RECHAZADO", async () => {
    const ruta = intent.object_path.replace(/([^/]+)$/, "extra/$1");
    const { error } = await a1.client.storage.from(BUCKET).upload(ruta, PDF, { contentType: "application/pdf" });
    if (!error) createdObjects.push(ruta);
    assert(error !== null, "un subdirectorio extra fue aceptado");
  });

  let intentA2!: { intent_id: string; object_path: string };
  await check("6. A1 intenta cargar en el intento de A2 → RECHAZADO", async () => {
    intentA2 = await beginIntent(a2.client, orgA, "de-a2.pdf");
    const { error } = await a1.client.storage.from(BUCKET).upload(intentA2.object_path, PDF, { contentType: "application/pdf" });
    assert(error !== null, "A1 cargó en el intento de A2 (created_by no se respetó)");
  });

  await check("7. A2 intenta cargar en el intento de A1 → RECHAZADO", async () => {
    const otro = await beginIntent(a1.client, orgA, "solo-a1.pdf");
    const { error } = await a2.client.storage.from(BUCKET).upload(otro.object_path, PDF, { contentType: "application/pdf" });
    assert(error !== null, "A2 cargó en el intento de A1 (mismo-org no basta)");
  });

  await check("8. B (otra organización) intenta cargar en el intento de A → RECHAZADO", async () => {
    const { error } = await b.client.storage.from(BUCKET).upload(intentA2.object_path, PDF, { contentType: "application/pdf" });
    assert(error !== null, "B cargó en una ruta de la organización A");
  });

  await check("9. anon intenta cargar en una ruta Textiles → RECHAZADO", async () => {
    const { error } = await anon.storage.from(BUCKET).upload(intentA2.object_path, PDF, { contentType: "application/pdf" });
    assert(error !== null, "anon pudo cargar");
  });

  await check("10. A3 (sin membresía en A) intenta cargar → RECHAZADO", async () => {
    const { error } = await a3.client.storage.from(BUCKET).upload(intentA2.object_path, PDF, { contentType: "application/pdf" });
    assert(error !== null, "un usuario sin membresía pudo cargar");
  });

  await check("11. Intento VENCIDO → carga directa RECHAZADA", async () => {
    // El guard de 0097 hace INMUTABLES los datos declarados del intento: ni
    // siquiera service_role puede mover `expires_at` ("Los datos declarados de
    // un intento de carga son inmutables"). Para obtener un intento realmente
    // vencido se inserta uno con fechas ya pasadas (el CHECK exige solo
    // expires_at > created_at), que es la única vía válida.
    const idVenc = randomUUID();
    const objectPath = `${orgA}/textiles/${idVenc}/vencido.pdf`;
    const { error: insErr } = await admin.from("textile_evidence_upload_intents").insert({
      id: idVenc,
      organization_id: orgA,
      created_by: a1.id,
      bucket_id: BUCKET,
      object_path: objectPath,
      original_filename: "vencido.pdf",
      safe_filename: "vencido.pdf",
      expected_size_bytes: PDF.length,
      expected_mime_type: "application/pdf",
      status: "pending",
      created_at: new Date(Date.now() - 7_200_000).toISOString(),
      expires_at: new Date(Date.now() - 3_600_000).toISOString(),
    });
    assert(!insErr, `no se pudo preparar el intento vencido: ${insErr?.message}`);
    createdObjects.push(objectPath);
    const { error } = await a1.client.storage.from(BUCKET).upload(objectPath, PDF, { contentType: "application/pdf" });
    assert(error !== null, "un intento vencido permitió la carga (expires_at > now() no se aplicó)");
    assert(!(await objectExists(objectPath)), "quedó un objeto pese al rechazo");
  });

  await check("12. Intento FAILED → RECHAZADO", async () => {
    const f = await beginIntent(a1.client, orgA, "fallido.pdf");
    const { data: marked } = await a1.client.rpc("mark_textile_evidence_upload_failed", { p_intent_id: f.intent_id });
    assert(marked === true, "no se pudo marcar failed");
    const { error } = await a1.client.storage.from(BUCKET).upload(f.object_path, PDF, { contentType: "application/pdf" });
    assert(error !== null, "un intento failed permitió la carga");
  });

  await check("13. Intento EXPIRED → RECHAZADO", async () => {
    const e = await beginIntent(a1.client, orgA, "expirado.pdf");
    await admin.from("textile_evidence_upload_intents")
      .update({ status: "expired", last_cleanup_attempt_at: new Date().toISOString() })
      .eq("id", e.intent_id);
    const { error } = await a1.client.storage.from(BUCKET).upload(e.object_path, PDF, { contentType: "application/pdf" });
    assert(error !== null, "un intento expired permitió la carga");
  });

  console.log("\n── UPDATE / upsert ──────────────────────────────────────────\n");

  await check("14. upsert / overwrite sobre un objeto existente → RECHAZADO", async () => {
    const up = await a1.client.storage.from(BUCKET).upload(intent.object_path, PDF, {
      contentType: "application/pdf", upsert: true,
    });
    assert(up.error !== null, "se permitió sobrescribir por upsert");
  });

  await check("15. UPDATE directo de la fila del objeto → RECHAZADO", async () => {
    const { data } = await a1.client.storage.from(BUCKET).list(`${orgA}/textiles/${intent.intent_id}`);
    assert((data ?? []).length > 0, "el objeto debía ser visible para su organización");
    const plain = await a1.client.storage.from(BUCKET).upload(intent.object_path, PDF, { contentType: "application/pdf" });
    assert(plain.error !== null, "una segunda carga sobre la misma ruta fue aceptada");
  });

  console.log("\n── DELETE (prohibido para TODOS los clientes) ───────────────\n");

  await check("16. Evidencia FINALIZADA: DELETE directo por el CREADOR → RECHAZADO", async () => {
    const { error: finErr } = await admin.rpc("finalize_textile_evidence_upload_server", {
      p_actor_id: a1.id, p_intent_id: intent.intent_id,
      p_file_size_bytes: PDF.length, p_file_mime_type: "application/pdf",
    });
    assert(!finErr, `no se pudo finalizar: ${finErr?.message}`);
    await a1.client.storage.from(BUCKET).remove([intent.object_path]);
    assert(await objectExists(intent.object_path), "*** el creador BORRÓ el objeto de una evidencia finalizada ***");
    const { data: ev } = await admin.from("textile_evidences").select("file_path").eq("id", intent.intent_id).single();
    assert(ev?.file_path === intent.object_path, "la evidencia dejó de apuntar a su objeto");
  });

  await check("17. DELETE directo por OTRO admin de la misma organización → RECHAZADO", async () => {
    await a2.client.storage.from(BUCKET).remove([intent.object_path]);
    assert(await objectExists(intent.object_path), "*** otro admin de la organización BORRÓ el objeto ***");
  });

  await check("18. DELETE directo por admin de OTRA organización → RECHAZADO", async () => {
    await b.client.storage.from(BUCKET).remove([intent.object_path]);
    assert(await objectExists(intent.object_path), "otra organización borró el objeto");
  });

  await check("19. DELETE directo por anon → RECHAZADO", async () => {
    await anon.storage.from(BUCKET).remove([intent.object_path]);
    assert(await objectExists(intent.object_path), "anon borró el objeto");
  });

  await check("20. DELETE directo de un objeto PENDING (no finalizado) → RECHAZADO", async () => {
    const p = await beginIntent(a1.client, orgA, "pendiente.pdf");
    const { error } = await uploadLegit(a1.client, p.object_path);
    assert(!error, `carga legítima falló: ${error?.message}`);
    await a1.client.storage.from(BUCKET).remove([p.object_path]);
    assert(await objectExists(p.object_path), "el creador borró directamente un objeto pending");
  });

  console.log("\n── Eliminación SERVER-ONLY (cliente administrativo) ─────────\n");

  await check("21. Retirada server-only de un objeto pending seguro → PERMITIDA", async () => {
    const p = await beginIntent(a1.client, orgA, "limpiable.pdf");
    const { error } = await uploadLegit(a1.client, p.object_path);
    assert(!error, `carga legítima falló: ${error?.message}`);
    assert(await objectExists(p.object_path), "el objeto debía existir");
    const { error: rmErr } = await admin.storage.from(BUCKET).remove([p.object_path]);
    assert(!rmErr, `el retiro administrativo falló: ${rmErr?.message}`);
    assert(!(await objectExists(p.object_path)), "el objeto seguía existiendo tras el retiro");
    const { data: closed } = await admin.rpc("record_textile_upload_intent_cleanup_server", {
      p_actor_id: a1.id, p_intent_id: p.intent_id, p_removed: true,
    });
    assert(closed === "still_active" || closed === "expired", `cierre inesperado: ${closed}`);
  });

  await check("22. Un objeto de evidencia CONSUMIDA nunca se retira (barrera de aplicación)", async () => {
    const { data: res } = await admin.rpc("record_textile_upload_intent_cleanup_server", {
      p_actor_id: a1.id, p_intent_id: intent.intent_id, p_removed: true,
    });
    assert(res === "consumed_untouchable", `un consumido entró al ciclo de limpieza: ${res}`);
    assert(await objectExists(intent.object_path), "el objeto de la evidencia desapareció");
  });

  console.log("\n── Regresión CPR ────────────────────────────────────────────\n");

  await check("23. CPR: INSERT en {org}/{evidence_id}/archivo y descarga → SIGUEN FUNCIONANDO", async () => {
    const { data: ev, error: evErr } = await a1.client.from("evidences").insert({
      organization_id: orgA, name: "Evidencia CPR regresión T9E4",
      evidence_type: "other", evidence_date: "2026-07-21",
    }).select("id").single();
    assert(!evErr && ev, `no se pudo crear la evidencia CPR: ${evErr?.message}`);
    const cprPath = `${orgA}/${ev!.id}/regresion-cpr.pdf`;
    const up = await a1.client.storage.from(BUCKET).upload(cprPath, PDF, { contentType: "application/pdf" });
    assert(!up.error, `*** 0099 ROMPIÓ la carga CPR: ${up.error?.message} ***`);
    createdObjects.push(cprPath);
    const dl = await a1.client.storage.from(BUCKET).createSignedUrl(cprPath, 60);
    assert(!dl.error && dl.data?.signedUrl, `*** 0099 rompió la descarga CPR: ${dl.error?.message} ***`);
    // CPR jamás ha tenido DELETE de cliente: debe seguir sin tenerlo.
    await a1.client.storage.from(BUCKET).remove([cprPath]);
    assert(await objectExists(cprPath), "CPR no debía poder borrar desde el cliente");
    await admin.from("evidences").delete().eq("id", ev!.id);
  });

  console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
}

async function cleanup() {
  console.log("\nLimpieza de datos temporales…");
  try {
    // Retirar TODO el prefijo de cada organización (incluye objetos no previstos).
    for (const org of createdOrgs) {
      const purge = async (prefix: string) => {
        const { data: list } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
        for (const entry of list ?? []) {
          const full = `${prefix}/${entry.name}`;
          if (entry.id === null) await purge(full);
          else await admin.storage.from(BUCKET).remove([full]);
        }
      };
      await purge(org);
    }
    for (const org of createdOrgs) {
      for (const table of ["textile_evidences", "evidences", "organization_modules", "memberships", "organization_subscriptions"]) {
        await admin.from(table).delete().eq("organization_id", org);
      }
      await admin.from("textile_evidence_upload_intents").delete().eq("organization_id", org).neq("status", "consumed");
      await admin.from("organizations").delete().eq("id", org);
    }
    for (const userId of createdUsers) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        await admin.auth.admin.updateUserById(userId, {
          password: `Qa1-${randomUUID()}`, ban_duration: "87600h",
        });
        await admin.auth.admin.deleteUser(userId, true);
      }
    }
    console.log(
      `Limpieza: prefijos de ${createdOrgs.length} organización(es) purgados; usuarios eliminados/rotados: ${createdUsers.length}.`
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
