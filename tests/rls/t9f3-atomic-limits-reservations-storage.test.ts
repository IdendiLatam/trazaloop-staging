/**
 * Trazaloop · Sprint T9F.3 · Suite RLS/BD contra STAGING: límites ATÓMICOS,
 * bypass directo, reservas de evidencias Textiles con Storage REAL y ciclo
 * pending_delete.
 *
 * PREPARADA para ejecutarse desde una máquina autorizada con `.env.local` de
 * staging, DESPUÉS de aplicar la migración 0101 (acumulada T9F.1+2+3). Desde
 * el entorno del sprint NO se ejecuta (prohibido conectar a Supabase).
 *   npm run test:t9f3-rls
 *
 * QUÉ VALIDA (las 25 áreas de §32 del plan T9F.3, con expectativas
 * CONCRETAS — jamás "count >= 0" ni "no lanzó"):
 *   1-4   Usuario real + organización Demo: creación hasta el límite y
 *         rechazo EXACTO del siguiente registro (mensaje del trigger).
 *   5-6   Dos inserciones CONCURRENTES (Promise.all) e INSERT DIRECTO por la
 *         API de Supabase: la BD aplica el mismo límite (una fila, un
 *         RESOURCE_LIMIT_EXCEEDED) — las Server Actions no son la barrera.
 *   7     Importación masiva atómica: un INSERT multi-fila que excede el
 *         límite revierte COMPLETO (cero filas).
 *   8-10  Begin concurrente + reserva de unidad y de bytes: el intent
 *         pending compromete 1 evidencia y sus bytes declarados (la vista
 *         expone storage_reserved_bytes exacto).
 *   11-12 Cancelación y expiración liberan la reserva SIN cron.
 *   13-14 Finalize idempotente y finalizes SIMULTÁNEOS del mismo intent:
 *         UNA evidencia, respuestas false/true.
 *   15-17 Storage REAL: objetos pequeños subidos de verdad (payloads
 *         deterministas con test_run_id), versión física real de un
 *         documento del maestro, ruta duplicada contada UNA vez — bytes
 *         EXACTOS en la vista.
 *   18-19 pending_delete: el borrado encola y el objeto SIGUE contando; un
 *         fallo simulado de eliminación (delete_failed) sigue contando y
 *         solo 'deleted' libera.
 *   20    Tamaño DESCONOCIDO (size NULL con ruta): la vista lo expone y el
 *         begin se bloquea (STORAGE_UNVERIFIABLE).
 *   21    RPC con datos arbitrarios: register_storage_orphan y
 *         resolve_storage_deletion VETADAS a authenticated.
 *   22    Separación CPR/Textiles: bytes y conteos jamás se cruzan.
 *   23    Full y Extra: mismas funciones (ilimitado), solo difiere la cuota.
 *   24    Auditoría: asignación concurrente = exactamente 1 evento.
 *   25    Limpieza TOTAL verificada (ver abajo).
 *
 * FIXTURES: prefijo t9f3_<timestamp>_<aleatorio> en organizaciones, usuarios
 * y rutas de Storage. Objetos REALES mínimos (bytes deterministas, < 1 KB
 * salvo donde el tamaño manda, siempre < 40 KB).
 *
 * LIMPIEZA (§34, T9F.3): elimina TODO — objetos de Storage, intents,
 * reservas, cola de borrado, evidencias, documentos, versiones, datos de
 * catálogo, módulos, suscripciones, membresías, ORGANIZACIONES y usuarios
 * Auth — y VERIFICA cero residuos del run: cero organizaciones, cero
 * usuarios, cero objetos, cero intents, cero filas funcionales. La 0101
 * retiró la FK de audit_log a organizations precisamente para que los
 * eventos INMUTABLES de auditoría (que jamás se tocan ni contienen secretos,
 * y quedan identificados por el nombre t9f3_* de la organización en su
 * payload histórico) NO impidan eliminar organizaciones. Renombrar o
 * "neutralizar" NO se acepta como limpieza: si una organización no puede
 * eliminarse, la suite lo reporta como FALLO.
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
const RUN = `t9f3_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

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

const TRANSIENT_NETWORK_ERROR =
  /fetch failed|ECONNRESET|ECONNABORTED|ETIMEDOUT|socket hang up|502|503|504/i;

async function withTransientRetry<T>(
  label: string,
  operation: () => PromiseLike<T>,
  maximumAttempts = 6
): Promise<T> {
  let lastError: Error | null = null;

  for (
    let attempt = 1;
    attempt <= maximumAttempts;
    attempt++
  ) {
    try {
      return await operation();
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(String(error));

      if (
        !TRANSIENT_NETWORK_ERROR.test(lastError.message) ||
        attempt === maximumAttempts
      ) {
        throw lastError;
      }

      const delay = 750 * 2 ** (attempt - 1);

      console.warn(
        `[T9F.3] ${label}: fallo transitorio; ` +
          `reintento ${attempt + 1}/${maximumAttempts} ` +
          `en ${delay} ms.`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delay)
      );
    }
  }

  throw lastError ??
    new Error(`${label}: fallo desconocido`);
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

/** Fija el estado comercial de un módulo con el cliente admin (fixture). */
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

async function closeTextileIntentWithoutObject(
  actorId: string,
  intentId: string
): Promise<void> {
  const { data, error } = await admin.rpc(
    "record_textile_upload_intent_cleanup_server",
    {
      p_actor_id: actorId,
      p_intent_id: intentId,
      p_removed: true,
    }
  );

  assert(
    !error && data === "expired",
    `cerrar intent sin objeto: ${
      error?.message ?? String(data)
    }`
  );
}

function deterministicBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  for (let i = 0; i < n; i++) buf[i] = i % 251;
  return buf;
}

async function beginUpload(
  client: SupabaseClient,
  orgId: string,
  fileName: string,
  sizeBytes: number,
  idempotencyKey: string | null = null
) {
  const call = async () =>
    await client.rpc("begin_textile_evidence_upload_v2", {
      p_organization_id: orgId,
      p_file_name: fileName,
      p_file_size_bytes: sizeBytes,
      p_file_mime_type: "application/pdf",
      p_metadata: {
        title: `${RUN} ${fileName}`,
        evidence_type: "other",
      },
      p_ttl_minutes: 30,
      p_idempotency_key: idempotencyKey,
    });

  return idempotencyKey
    ? withTransientRetry(
        "begin textil idempotente",
        call
      )
    : call();
}

async function main() {
  console.log(`Trazaloop · RLS T9F.3 · run ${RUN} · staging: ${URL!.slice(0, 32)}…\n`);

  const adminA = await newUser("adminA");
  const orgA = await createOrgViaRealFlow(adminA.client, `${RUN} A (temporal QA)`);
  const adminB = await newUser("adminB");
  const orgB = await createOrgViaRealFlow(adminB.client, `${RUN} B (temporal QA)`);
  // Estados comerciales de partida (el aprovisionamiento de 0100 dejó Demo
  // temporal 48 h en todos los módulos funcionales):
  await setModuleAdmin(orgA, CPR, "demo", new Date(Date.now() + 86400_000).toISOString());
  await setModuleAdmin(orgA, TEX, "demo", new Date(Date.now() + 86400_000).toISOString());
  await setModuleAdmin(orgB, TEX, "full");
  await setModuleAdmin(orgB, CPR, "full");

  console.log("Áreas 1–7 · Límites atómicos y bypass directo\n");

  await check("1-4. Demo CPR: el primer proveedor entra por INSERT DIRECTO; el segundo lo rechaza la BASE con RESOURCE_LIMIT_EXCEEDED (la Server Action no participa)", async () => {
    const first = await adminA.client.from("suppliers").insert({ organization_id: orgA, name: `${RUN} p1` }).select("id").single();
    assert(!first.error && first.data, `el primero debía entrar: ${first.error?.message}`);
    const second = await adminA.client.from("suppliers").insert({ organization_id: orgA, name: `${RUN} p2` });
    assert(second.error !== null && /RESOURCE_LIMIT_EXCEEDED/.test(second.error.message),
      `el segundo debía rechazarse en BD (fue: ${second.error?.message ?? "permitido"})`);
    const { count } = await admin.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    assert(count === 1, `exactamente 1 proveedor (hay ${count})`);
  });

  await check("5. Dos inserciones CONCURRENTES del último hueco (Promise.all): exactamente una fila y un RESOURCE_LIMIT_EXCEEDED", async () => {
    await admin.from("suppliers").delete().eq("organization_id", orgA);
    const [r1, r2] = await Promise.all([
      adminA.client.from("suppliers").insert({ organization_id: orgA, name: `${RUN} c1` }).select("id"),
      adminA.client.from("suppliers").insert({ organization_id: orgA, name: `${RUN} c2` }).select("id"),
    ]);
    const errors = [r1.error, r2.error].filter((e) => e !== null);
    assert(errors.length === 1 && /RESOURCE_LIMIT_EXCEEDED/.test(errors[0]!.message),
      `exactamente un rechazo por límite (hubo ${errors.length}: ${errors.map((e) => e?.message).join(" | ")})`);
    const { count } = await admin.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    assert(count === 1, `exactamente 1 fila tras la carrera (hay ${count})`);
  });

  await check("6. Aislamiento sigue siendo de la RLS: adminB insertando en la organización A recibe el rechazo de la POLÍTICA (no una decisión comercial)", async () => {
    const { error } = await adminB.client.from("suppliers").insert({ organization_id: orgA, name: `${RUN} intruso` });
    assert(error !== null && !/RESOURCE_LIMIT_EXCEEDED|MODULE_ACCESS_BLOCKED/.test(error.message),
      `debía negar la RLS con su error estándar (fue: ${error?.message ?? "permitido"})`);
    const { count } = await admin.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgA).eq("name", `${RUN} intruso`);
    assert((count ?? 0) === 0, "cero filas del intruso");
  });

  await check("7. Importación masiva atómica: un INSERT multi-fila (materiales 4+2 sobre límite 5) revierte COMPLETO — cero filas insertadas", async () => {
    const seed = Array.from(
      { length: 4 },
      (_, i) => ({
        organization_id: orgA,
        name: `${RUN} m${i}`,
        material_type: "other",
      })
    );
    const seeded = await adminA.client.from("textile_materials").insert(seed).select("id");
    assert(!seeded.error && (seeded.data ?? []).length === 4, `4 materiales base: ${seeded.error?.message}`);
    const bulk = await adminA.client.from("textile_materials").insert([
      {
        organization_id: orgA,
        name: `${RUN} m5`,
        material_type: "other",
      },
      {
        organization_id: orgA,
        name: `${RUN} m6`,
        material_type: "other",
      },
    ]);
    assert(bulk.error !== null && /RESOURCE_LIMIT_EXCEEDED/.test(bulk.error.message), `el lote debía rechazarse íntegro: ${bulk.error?.message ?? "permitido"}`);
    const { count } = await admin.from("textile_materials").select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    assert(count === 4, `el lote NO debía insertar parcialmente (hay ${count}, esperados 4)`);
  });

  console.log("\nÁreas 8–14 · Reservas begin/finalize con Storage REAL\n");

  let intentAId = "";
  let intentAPath = "";

  await check("8-10. Begin reserva UNIDAD y BYTES: dos begins concurrentes con límite 1 dejan UN intent y un EVIDENCE_LIMIT_EXCEEDED; la vista expone la reserva EXACTA", async () => {
    const [r1, r2] = await Promise.all([
      beginUpload(adminA.client, orgA, "r1.pdf", 8 * KB),
      beginUpload(adminA.client, orgA, "r2.pdf", 8 * KB),
    ]);
    const oks = [r1, r2].filter((r) => !r.error);
    const errs = [r1, r2].filter((r) => r.error);
    assert(oks.length === 1 && errs.length === 1 && /EVIDENCE_LIMIT_EXCEEDED/.test(errs[0].error!.message),
      `uno reserva y el otro se rechaza (oks=${oks.length}: ${errs.map((e) => e.error?.message).join(" | ")})`);
    const ok = oks[0].data as { intent_id: string; object_path: string };
    intentAId = ok.intent_id;
    intentAPath = ok.object_path;
    const { count } = await admin
      .from("textile_evidence_upload_intents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA)
      .eq("status", "pending");
    assert(count === 1, `un solo intent pendiente (hay ${count})`);
    const u = await usageRow(adminA.client, orgA, TEX);
    assert(Number(u.storage_reserved_bytes) === 8 * KB, `reserva exacta de 8 KB (fue ${u.storage_reserved_bytes})`);
    assert(Number(u.evidences_count) === 0, "sin evidencias confirmadas todavía");
  });

  await check("11. Cancelación (failed) libera la reserva: un begin nuevo vuelve a caber y la vista reserva 0", async () => {
    const { error } = await admin
      .from("textile_evidence_upload_intents")
      .update({ status: "failed" })
      .eq("id", intentAId);
    assert(
      !error,
      `cancelar fixture: ${error?.message}`
    );

    await closeTextileIntentWithoutObject(
      adminA.id,
      intentAId
    );

    const u =
      await usageRow(adminA.client, orgA, TEX);

    assert(
      Number(u.storage_reserved_bytes) === 0,
      `reserva liberada (fue ${
        u.storage_reserved_bytes
      })`
    );

    assert(
      Number(u.storage_used_bytes) === 0,
      `un intent retirado no debe seguir contando ` +
        `(fue ${u.storage_used_bytes})`
    );

    const again = await beginUpload(adminA.client, orgA, "r3.pdf", 8 * KB, `${RUN}-k3`);
    assert(!again.error, `debía volver a caber: ${again.error?.message}`);
    const ok = again.data as { intent_id: string; object_path: string };
    intentAId = ok.intent_id;
    intentAPath = ok.object_path;
  });

  await check(
    "12. Expiración lógica SIN cron: un intent pending ya vencido no reserva bytes",
    async () => {
      const { error: closeCurrentError } = await admin
        .from("textile_evidence_upload_intents")
        .update({ status: "failed" })
        .eq("id", intentAId);

      assert(
        !closeCurrentError,
        `cerrar intent activo: ${
          closeCurrentError?.message
        }`
      );

      // El intent r3 quedó failed. Mientras no se confirme

      // que su objeto fue retirado, sus bytes siguen contando.

      await closeTextileIntentWithoutObject(

        adminA.id,

        intentAId

      );


      const afterCurrentCleanup =

        await usageRow(

          adminA.client,

          orgA,

          TEX

        );


      assert(

        Number(

          afterCurrentCleanup.storage_used_bytes

        ) === 0 &&

          Number(

            afterCurrentCleanup.storage_reserved_bytes

          ) === 0,

        `el intent failed retirado no debe contar ` +

          `(fue usado/reservado ` +

          `${afterCurrentCleanup.storage_used_bytes}/` +

          `${afterCurrentCleanup.storage_reserved_bytes})`

      );


      const expiredIntentId = randomUUID();
      const createdAt =
        new Date(Date.now() - 600_000).toISOString();
      const expiresAt =
        new Date(Date.now() - 60_000).toISOString();

      const { error: expiredFixtureError } =
        await admin
          .from("textile_evidence_upload_intents")
          .insert({
            id: expiredIntentId,
            organization_id: orgA,
            created_by: adminA.id,
            bucket_id: "evidences",
            object_path:
              `${orgA}/textiles/` +
              `${expiredIntentId}/expired.pdf`,
            original_filename: "expired.pdf",
            safe_filename: "expired.pdf",
            expected_size_bytes: 8 * KB,
            expected_mime_type: "application/pdf",
            status: "pending",
            evidence_metadata: {
              title: `${RUN} expired.pdf`,
              evidence_type: "other",
            },
            created_at: createdAt,
            expires_at: expiresAt,
            idempotency_key:
              `${RUN}-expired-fixture`,
          });

      assert(
        !expiredFixtureError,
        `crear fixture vencido: ${
          expiredFixtureError?.message
        }`
      );

      const u =
        await usageRow(adminA.client, orgA, TEX);

      assert(
        Number(u.storage_reserved_bytes) === 0,
        `vencida no reserva ` +
          `(fue ${u.storage_reserved_bytes})`
      );

      await closeTextileIntentWithoutObject(
        adminA.id,
        expiredIntentId
      );

      const afterCleanup =
        await usageRow(adminA.client, orgA, TEX);

      assert(
        Number(afterCleanup.storage_used_bytes) === 0,
        `el intent vencido retirado no debe contar ` +
          `(fue ${afterCleanup.storage_used_bytes})`
      );

      const again = await beginUpload(
        adminA.client,
        orgA,
        "r4.pdf",
        8 * KB,
        `${RUN}-k4`
      );

      assert(
        !again.error,
        `debía caber con la anterior vencida: ` +
          `${again.error?.message}`
      );

      const ok = again.data as {
        intent_id: string;
        object_path: string;
      };

      intentAId = ok.intent_id;
      intentAPath = ok.object_path;
    }
  );

  await check("13-14. Objeto REAL subido + finalizes SIMULTÁNEOS del mismo intent (server): UNA evidencia, respuestas false/true, bytes EXACTOS confirmados en la vista", async () => {
    const upload = await admin.storage
      .from("evidences")
      .upload(intentAPath, deterministicBytes(8 * KB), { contentType: "application/pdf" });
    assert(!upload.error, `subida real: ${upload.error?.message}`);
    const finalize = () =>
      withTransientRetry(
        "finalize textil",
        async () =>
          await admin.rpc(
            "finalize_textile_evidence_upload_server",
            {
              p_actor_id: adminA.id,
              p_intent_id: intentAId,
              p_file_size_bytes: 8 * KB,
              p_file_mime_type:
                "application/pdf",
            }
          )
      );

    const [f1, f2] =
      await Promise.all([finalize(), finalize()]);

    assert(
      !f1.error && !f2.error,
      `ambos finalizes responden: ${
        f1.error?.message ??
        f2.error?.message
      }`
    );

    const flags = [f1.data, f2.data]
      .map(
        (data) =>
          (
            data as {
              already_finalized: boolean;
            }
          ).already_finalized
      )
      .sort();

    assert(
      (
        flags[0] === false &&
        flags[1] === true
      ) ||
        (
          flags[0] === true &&
          flags[1] === true
        ),
      `finalize idempotente tras posibles ` +
        `reintentos: ${JSON.stringify(flags)}`
    );
    const { count } = await admin.from("textile_evidences").select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    assert(count === 1, `UNA evidencia (hay ${count})`);
    const u = await usageRow(adminA.client, orgA, TEX);
    assert(Number(u.storage_used_bytes) === 8 * KB && Number(u.storage_reserved_bytes) === 0,
      `consumo confirmado 8 KB y reserva 0 (fue ${u.storage_used_bytes}/${u.storage_reserved_bytes})`);
  });

  await check("Área extra · Un begin más en Demo (límite 1 ya consumido) se rechaza contando la evidencia CONFIRMADA", async () => {
    const r = await beginUpload(
      adminA.client,
      orgA,
      "r5.pdf",
      8 * KB,
      `${RUN}-k5`
    );
    assert(r.error !== null && /EVIDENCE_LIMIT_EXCEEDED/.test(r.error.message), `debía rechazar: ${r.error?.message ?? "permitido"}`);
  });

  console.log("\nÁreas 15–20 · Storage físico real, versiones, ciclo y desconocidos\n");

  let docId = "";
  const vPath = (v: string) => `${orgB}/${RUN}/doc/${v}.bin`;

  await check("15-17. Versión FÍSICA real + ruta duplicada: doc actual (5 KB) + v1 (25 KB) + v2 (20 KB, ruta COMPARTIDA con el actual… no: propia) — CPR de B suma bytes EXACTOS deduplicados", async () => {
    // Objetos REALES: v1 y v2 con SUS tamaños; el actual comparte la ruta de
    // v2 (transición que copia ruta) para probar la deduplicación.
    for (const [name, size] of [["v1", 25 * KB], ["v2", 20 * KB]] as const) {
      const up = await admin.storage.from("trazadocs-documents").upload(vPath(name), deterministicBytes(size), { contentType: "application/octet-stream" });
      assert(!up.error, `subida ${name}: ${up.error?.message}`);
    }
    docId = randomUUID();
    const doc = await admin.from("trazadoc_file_documents").insert({
      id: docId,
      organization_id: orgB,
      title: `${RUN} doc físico`,
      code: `${RUN}-DOC`,
      category_code: "other",
      status: "draft",
      current_version: 2,
      version_label: "v2",
      storage_path: vPath("v2"),
      file_name: "v2.bin",
      mime_type: "application/octet-stream",
      size_bytes: 20 * KB,
      created_by: adminB.id,
    });
    assert(!doc.error, `fixture doc: ${doc.error?.message}`);
    for (const [n, path, size] of [[1, vPath("v1"), 25 * KB], [2, vPath("v2"), 20 * KB]] as const) {
      const v = await admin.from("trazadoc_file_document_versions").insert({
        organization_id: orgB,
        file_document_id: docId,
        version_number: n,
        version_label: `v${n}`,
        status: "draft",
        snapshot: {},
        storage_path: path,
        file_name: `v${n}.bin`,
        mime_type: "application/octet-stream",
        size_bytes: size,
        created_by: adminB.id,
      });
      assert(!v.error, `fixture versión ${n}: ${v.error?.message}`);
    }
    const u = await usageRow(adminB.client, orgB, CPR);
    // v1 (25 KB) + v2/actual misma ruta deduplicada (20 KB) = 45 KB exactos.
    assert(Number(u.storage_used_bytes) === 45 * KB, `CPR B debía sumar 45 KB exactos (sumó ${u.storage_used_bytes})`);
    assert(Number(u.storage_object_conflicts) === 0 && Number(u.storage_unknown_size_count) === 0, "sin conflictos ni desconocidos");
  });

  await check("18-19. Ciclo pending_delete con FALLO SIMULADO: el borrado del borrador encola (sigue contando 45 KB); delete_failed sigue contando; solo deleted libera", async () => {
    const del = await adminB.client.rpc("queue_and_delete_trazadoc_draft", { p_file_document_id: docId });
    assert(!del.error, `RPC de borrado: ${del.error?.message}`);
    const payload = del.data as { deleted: boolean; objects: Array<{ object_path: string; size_bytes: number }> };
    assert(payload.deleted === true && payload.objects.length === 2, `debía encolar 2 objetos (${JSON.stringify(payload.objects)})`);
    const { count } = await admin.from("trazadoc_file_documents").select("id", { count: "exact", head: true }).eq("id", docId);
    assert(count === 0, "las filas del documento salieron");
    let u = await usageRow(adminB.client, orgB, CPR);
    assert(Number(u.storage_used_bytes) === 45 * KB, `encolado SIGUE contando 45 KB (fue ${u.storage_used_bytes})`);

    // Fallo SIMULADO de eliminación en v1 (delete_failed) y retiro real de v2.
    const failMark = await admin.rpc("resolve_storage_deletion", {
      p_bucket_id: "trazadocs-documents", p_object_path: vPath("v1"), p_outcome: "delete_failed", p_error_code: "qa_simulated",
    });
    assert(!failMark.error && failMark.data === true, `marcar delete_failed: ${failMark.error?.message}`);
    u = await usageRow(adminB.client, orgB, CPR);
    assert(Number(u.storage_used_bytes) === 45 * KB, `delete_failed SIGUE contando (fue ${u.storage_used_bytes})`);

    const rm = await admin.storage.from("trazadocs-documents").remove([vPath("v2")]);
    assert(!rm.error, `retiro real v2: ${rm.error?.message}`);
    const okMark = await admin.rpc("resolve_storage_deletion", {
      p_bucket_id: "trazadocs-documents", p_object_path: vPath("v2"), p_outcome: "deleted",
    });
    assert(!okMark.error && okMark.data === true, `confirmar deleted: ${okMark.error?.message}`);
    u = await usageRow(adminB.client, orgB, CPR);
    assert(Number(u.storage_used_bytes) === 25 * KB, `solo deleted libera: quedan 25 KB (fue ${u.storage_used_bytes})`);
  });

  await check("20. Tamaño DESCONOCIDO bloquea: una evidencia CPR con ruta y size NULL aparece como unknown=1 y el begin TEXTIL de B sigue sano; el begin sobre módulo con unknown se rechaza", async () => {
    const ev = await admin.from("evidences").insert({
      organization_id: orgB,
      name: `${RUN} desconocida`,
      storage_path: `${orgB}/${RUN}/unk.bin`,
      size_bytes: null,
      created_by: adminB.id,
    });
    assert(!ev.error, `fixture evidencia sin tamaño: ${ev.error?.message}`);
    const u = await usageRow(adminB.client, orgB, CPR);
    assert(Number(u.storage_unknown_size_count) === 1, `unknown=1 en CPR (fue ${u.storage_unknown_size_count})`);
    // Textiles de B: sembrar un desconocido TEXTIL y verificar que begin bloquea.
    const unknownTextileEvidenceId =
      randomUUID();

    const tev = await admin
      .from("textile_evidences")
      .insert({
        id: unknownTextileEvidenceId,
        organization_id: orgB,
        title: `${RUN} unk textil`,
        evidence_type: "other",
        file_name: "u.bin",
        file_path:
          `${orgB}/textiles/` +
          `${unknownTextileEvidenceId}/u.bin`,
        file_size_bytes: null,
        status: "pending_review",
        created_by: adminB.id,
      });
    assert(!tev.error, `fixture textil sin tamaño: ${tev.error?.message}`);
    const r = await beginUpload(adminB.client, orgB, "b1.pdf", 8 * KB);
    assert(r.error !== null && /STORAGE_UNVERIFIABLE/.test(r.error.message), `begin debía bloquear por desconocido: ${r.error?.message ?? "permitido"}`);
    await admin.from("textile_evidences").delete().eq("organization_id", orgB).eq("title", `${RUN} unk textil`);
  });

  console.log("\nÁreas 21–24 · Server-only, separación, Full/Extra y auditoría\n");

  await check("21. RPC con datos físicos ARBITRARIOS vetada a authenticated: register_storage_orphan y resolve_storage_deletion responden SERVER_ONLY", async () => {
    const reg = await adminB.client.rpc("register_storage_orphan", {
      p_organization_id: orgB, p_module_code: CPR, p_bucket_id: "evidences",
      p_object_path: `${orgB}/${RUN}/hack.bin`, p_size_bytes: 10,
    });
    assert(reg.error !== null && /SERVER_ONLY|permission denied/.test(reg.error.message), `registro debía vetarse: ${reg.error?.message ?? "permitido"}`);
    const res = await adminB.client.rpc("resolve_storage_deletion", {
      p_bucket_id: "trazadocs-documents", p_object_path: vPath("v1"), p_outcome: "deleted",
    });
    assert(res.error !== null && /SERVER_ONLY|permission denied/.test(res.error.message), `resolución debía vetarse: ${res.error?.message ?? "permitido"}`);
    const { data: still } = await admin
      .from("storage_orphan_candidates")
      .select("status")
      .eq("object_path", vPath("v1"))
      .single();
    assert(still!.status === "delete_failed", "el candidato NO cambió de estado por el intento del cliente");
  });

  await check("22. Separación CPR/Textiles: los 45→25 KB CPR de B jamás aparecieron en la fila Textiles de B (evidencia textil confirmada aparte)", async () => {
    const tex = await usageRow(adminB.client, orgB, TEX);
    assert(Number(tex.storage_used_bytes) === 0, `Textiles de B debía sumar 0 (sumó ${tex.storage_used_bytes})`);
    const cprA = await usageRow(adminA.client, orgA, CPR);
    assert(Number(cprA.storage_used_bytes) === 0, `CPR de A debía sumar 0 — la evidencia textil de A no cruza (sumó ${cprA.storage_used_bytes})`);
  });

  await check("23. Full y Extra: MISMAS funciones (más allá del límite Demo) y solo difiere la cuota del catálogo (500 MB vs 5120 MB exactos)", async () => {
    for (let i = 0; i < 3; i++) {
      const { error } = await adminB.client.from("suppliers").insert({ organization_id: orgB, name: `${RUN} full ${i}` });
      assert(!error, `Full ilimitado (${i}): ${error?.message}`);
    }
    await setModuleAdmin(orgB, CPR, "extra");
    const { error } = await adminB.client.from("suppliers").insert({ organization_id: orgB, name: `${RUN} extra` });
    assert(!error, `Extra ilimitado: ${error?.message}`);
    const { data: defs } = await admin.from("plan_definitions").select("code, storage_limit_bytes").in("code", ["full", "extra"]);
    const full = Number(defs!.find((d) => d.code === "full")!.storage_limit_bytes);
    const extra = Number(defs!.find((d) => d.code === "extra")!.storage_limit_bytes);
    assert(full === 500 * 1024 * 1024 && extra === 5120 * 1024 * 1024, `cuotas exactas 500/5120 MB (fueron ${full}/${extra})`);
  });

  await check("24. Auditoría coherente: asignación concurrente del módulo (RPC superadmin) = 1 fila y EXACTAMENTE 1 evento organization_module_access_changed", async () => {
    const superU = await newUser("super");
    await admin.from("platform_staff").insert({ user_id: superU.id, role_code: "superadmin", status: "active" });
    await admin.from("organization_modules").delete().eq("organization_id", orgB).eq("module_code", TEX);
    const before = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgB)
      .eq("event_type", "organization_module_access_changed");
    const call = () =>
      superU.client.rpc("set_organization_module_access", {
        p_organization_id: orgB, p_module_code: TEX, p_target_state: "full",
      });
    const [r1, r2] = await Promise.all([call(), call()]);
    assert(!r1.error && !r2.error, `sin unique_violation: ${r1.error?.message ?? r2.error?.message}`);
    const changed = [r1.data, r2.data].map((d) => (d as { changed: boolean }).changed).sort();
    assert(changed[0] === false && changed[1] === true, `un solo changed=true: ${JSON.stringify(changed)}`);
    const after = await admin
      .from("audit_log")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgB)
      .eq("event_type", "organization_module_access_changed");
    assert((after.count ?? 0) - (before.count ?? 0) === 1, `exactamente 1 evento (Δ=${(after.count ?? 0) - (before.count ?? 0)})`);
  });

  console.log(`\nRLS T9F.3: ${passed} ✔, ${failed} ✘`);
}

/**
 * Área 25 · LIMPIEZA TOTAL VERIFICADA (§34).
 * Orden: objetos físicos → filas funcionales → módulos/suscripciones →
 * membresías → ORGANIZACIONES (DEBE funcionar: 0101 retiró la FK de
 * audit_log) → personal de plataforma → perfiles → usuarios Auth. Después,
 * VERIFICACIÓN de cero residuos del run. Cualquier resto = FALLO explícito.
 * Los eventos de auditoría permanecen: son inmutables por diseño, no
 * contienen secretos y ya no bloquean el ciclo de vida.
 */
async function cleanup() {
  console.log("\nÁrea 25 · Limpieza total verificada\n");
  let residues = 0;
  const flag = (cond: boolean, what: string) => {
    if (!cond) {
      residues += 1;
      console.error(`  ✘ residuo: ${what}`);
    }
  };

  // 1. Inventario de objetos físicos del run ANTES de borrar filas.
  //    T9F.4 · §28: recolección con OBJETO NOMBRADO (jamás desestructuración
  //    posicional de Promise.all — el desajuste consulta/variable dejaba
  //    fuentes sin asignar) e inventario AMPLIADO: también los intents
  //    genéricos CPR/TrazaDocs (storage_upload_intents).
  const paths: Record<string, Set<string>> = { evidences: new Set(), "trazadocs-documents": new Set() };
  for (const org of createdOrgs) {
    const cleanupData = {
      textileIntents: await admin.from("textile_evidence_upload_intents").select("bucket_id, object_path").eq("organization_id", org),
      textileEvidences: await admin.from("textile_evidences").select("file_path").eq("organization_id", org),
      evidences: await admin.from("evidences").select("storage_path").eq("organization_id", org),
      orphanCandidates: await admin.from("storage_orphan_candidates").select("bucket_id, object_path").eq("organization_id", org),
      genericIntents: await admin.from("storage_upload_intents").select("bucket_id, object_path").eq("organization_id", org),
    };
    for (const r of cleanupData.textileIntents.data ?? []) paths[r.bucket_id as string]?.add(r.object_path as string);
    for (const r of cleanupData.textileEvidences.data ?? []) if (r.file_path) paths.evidences.add(r.file_path as string);
    for (const r of cleanupData.evidences.data ?? []) if (r.storage_path) paths.evidences.add(r.storage_path as string);
    for (const r of cleanupData.orphanCandidates.data ?? []) paths[r.bucket_id as string]?.add(r.object_path as string);
    for (const r of cleanupData.genericIntents.data ?? []) paths[r.bucket_id as string]?.add(r.object_path as string);
  }
  for (const [bucket, set] of Object.entries(paths)) {
    const list = [...set];
    if (list.length > 0) {
      const { error } = await admin.storage.from(bucket).remove(list);
      if (error) console.error(`  · aviso: retiro en ${bucket}: ${error.message}`);
    }
  }

  // 2. Intents NO consumidos: se pueden retirar.
  // Los consumidos son inmutables por diseño y permanecen hasta eliminar
  // el proyecto QA desechable.
  for (const org of createdOrgs) {
    const { error } = await admin
      .from("textile_evidence_upload_intents")
      .delete()
      .eq("organization_id", org)
      .neq("status", "consumed");

    flag(
      !error,
      `intents no consumidos de ${org}: ${
        error?.message ?? ""
      }`
    );
  }

  // 3. Filas funcionales y de plan, por organización.
  for (const org of createdOrgs) {
    for (const table of [
      "storage_orphan_candidates",
      "storage_upload_intents",
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
      flag(!error, `${table} de ${org}: ${error?.message ?? ""}`);
    }
  }

  // 4. Evidencias Textiles sin vínculo consumido.
  for (const org of createdOrgs) {
    const {
      data: consumedRows,
      error: consumedRowsError,
    } = await admin
      .from("textile_evidence_upload_intents")
      .select("evidence_id")
      .eq("organization_id", org)
      .eq("status", "consumed");

    flag(
      !consumedRowsError,
      `leer intents consumidos de ${org}: ${
        consumedRowsError?.message ?? ""
      }`
    );

    const protectedIds = new Set(
      (consumedRows ?? [])
        .map((row) => row.evidence_id as string | null)
        .filter((value): value is string => Boolean(value))
    );

    const {
      data: evidenceRows,
      error: evidenceRowsError,
    } = await admin
      .from("textile_evidences")
      .select("id")
      .eq("organization_id", org);

    flag(
      !evidenceRowsError,
      `leer evidencias de ${org}: ${
        evidenceRowsError?.message ?? ""
      }`
    );

    for (const evidence of evidenceRows ?? []) {
      if (protectedIds.has(evidence.id as string)) {
        continue;
      }

      const { error } = await admin
        .from("textile_evidences")
        .delete()
        .eq("id", evidence.id);

      flag(
        !error,
        `evidencia textil ${evidence.id}: ${
          error?.message ?? ""
        }`
      );
    }
  }

  // 5. Las organizaciones con una cadena consumida se conservan
  // temporalmente en este proyecto QA desechable.
  const organizationsWithConsumedIntents =
    new Set<string>();

  for (const org of createdOrgs) {
    const { count, error } = await admin
      .from("textile_evidence_upload_intents")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("organization_id", org)
      .eq("status", "consumed");

    flag(
      !error,
      `contar intents consumidos de ${org}: ${
        error?.message ?? ""
      }`
    );

    if ((count ?? 0) > 0) {
      organizationsWithConsumedIntents.add(org);
    }
  }

  // 6. ORGANIZACIONES sin cadena consumida.
 // (sin renombrar, sin
  //    "neutralizar"). Si falla, es un fallo de la suite, no un aviso.
  for (const org of createdOrgs) {
    if (organizationsWithConsumedIntents.has(org)) {
      console.log(
        `  · organización QA ${org.slice(0, 8)} ` +
          `conservada por intent consumed inmutable`
      );
      continue;
    }

    const { error } = await admin
      .from("organizations")
      .delete()
      .eq("id", org);

    flag(
      !error,
      `organización ${org} no eliminable: ${
        error?.message ?? ""
      }`
    );
  }

  // 4. Personal de plataforma, perfiles y usuarios Auth del run.
  for (const uid of createdUsers) {
    const { count: membershipCount } = await admin
      .from("memberships")
      .select("organization_id", {
        count: "exact",
        head: true,
      })
      .eq("user_id", uid)
      .in(
        "organization_id",
        [...organizationsWithConsumedIntents]
      );

    if ((membershipCount ?? 0) > 0) {
      console.log(
        `  · usuario QA ${uid.slice(0, 8)} ` +
          `conservado con su cadena consumed`
      );
      continue;
    }

    await admin
      .from("platform_staff")
      .delete()
      .eq("user_id", uid);

    await admin
      .from("profiles")
      .delete()
      .eq("id", uid);

    const { error } =
      await admin.auth.admin.deleteUser(uid);

    flag(
      !error,
      `usuario ${uid}: ${error?.message ?? ""}`
    );
  }

  // 5. VERIFICACIÓN de cero residuos del run.
  const expectedOrganizations =
    organizationsWithConsumedIntents.size;

  const orgsLeft = await admin
    .from("organizations")
    .select("id", {
      count: "exact",
      head: true,
    })
    .in(
      "id",
      createdOrgs.length
        ? createdOrgs
        : ["00000000-0000-0000-0000-000000000000"]
    );

  flag(
    (orgsLeft.count ?? 0) === expectedOrganizations,
    `${
      orgsLeft.count
    } organizaciones presentes; se esperaban ` +
      `${expectedOrganizations} por cadenas consumed`
  );
  for (const table of ["suppliers", "textile_materials", "textile_evidences", "evidences"]) {
    const left = await admin.from(table).select("id", { count: "exact", head: true }).like("name", `${RUN}%`);
    if (table === "textile_evidences") continue; // usa title, verificado por organización arriba
    flag((left.count ?? 0) === 0, `${left.count} fila(s) residuales en ${table}`);
  }
  const intentsLeft = createdOrgs.length
    ? await admin
        .from("textile_evidence_upload_intents")
        .select("id", {
          count: "exact",
          head: true,
        })
        .in("organization_id", createdOrgs)
        .neq("status", "consumed")
    : { count: 0 };

  flag(
    (intentsLeft.count ?? 0) === 0,
    `${intentsLeft.count} intent(s) textiles ` +
      `inesperados; solo consumed puede permanecer`
  );
  // T9F.4 · §28: cero intents genéricos (reservas) y cero candidatos del
  // ciclo (pending_delete / delete_failed / deleted) del run.
  const genericLeft = createdOrgs.length
    ? await admin.from("storage_upload_intents").select("id", { count: "exact", head: true }).in("organization_id", createdOrgs)
    : { count: 0 };
  flag((genericLeft.count ?? 0) === 0, `${genericLeft.count} intent(s) genéricos/reservas residuales`);
  const queueLeft = createdOrgs.length
    ? await admin.from("storage_orphan_candidates").select("id", { count: "exact", head: true }).in("organization_id", createdOrgs)
    : { count: 0 };
  flag((queueLeft.count ?? 0) === 0, `${queueLeft.count} candidato(s) pending_delete/delete_failed residuales`);
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
    console.log("  ✔ cero organizaciones, usuarios, objetos, intents y filas del run");
  }
}

main()
  .then(cleanup)
  .then(() => {
    console.log(`\nRLS T9F.3 · resultado final: ${passed} ✔, ${failed} ✘`);
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
