/**
 * Trazaloop · Sprint T9E.2 + T9E.3 (Textil) · Prueba REAL de INTEGRIDAD del
 * flujo directo contra STAGING (jamás producción): con 0098 aplicada, la
 * finalización y el cierre de limpieza son EXCLUSIVAMENTE server-only.
 *
 *   · ATAQUES: invocar las funciones selladas de 0097 con JWT de usuario
 *     (creador, mismo-org, otra org y anon) debe dar "permission denied"
 *     SIN crear evidencias ni tocar el intento — si alguien re-otorga el
 *     grant a authenticated, esta suite FALLA;
 *   · las variantes *_server exigen ACTOR explícito y lo revalidan en
 *     PostgreSQL (membresía, rol, created_by) aunque las invoque el
 *     service_role;
 *   · atomicidad, idempotencia, transiciones controladas y limpieza
 *     recuperable se CONSERVAN tal como en 0097;
 *   · EXPERIMENTO §10 (T9E.3): reutilización del token firmado tras un
 *     retiro + defensa contra subidas tardías (re-barrido) + imposibilidad
 *     de finalizar un intento no-pending.
 *
 * Crea datos temporales con identificadores aleatorios y los LIMPIA al
 * final. Credenciales aleatorias SOLO en memoria; jamás se imprimen.
 * Requiere las variables de Supabase de .env.local.
 *
 * Correr: npx tsx tests/rls/textiles-t9e2-integrity.test.ts
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

/** ¿El error es el "permission denied" del sellado 0098? (42501). */
function isPermissionDenied(error: { code?: string; message: string } | null): boolean {
  return error !== null && (error.code === "42501" || /permission denied/i.test(error.message));
}

const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const createdObjects: string[] = [];

async function newUser(label: string) {
  const email = `t9e2-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const password = `Qa1-${randomUUID()}${randomUUID().slice(0, 8)}`;
  let user: { id: string } | null = null;
  for (let attempt = 1; attempt <= 3 && !user; attempt++) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `QA T9E.2 ${label}` },
    });
    if (!error && data.user) user = data.user;
    else if (attempt === 3) throw new Error(`createUser ${label}: ${error?.message || "sin detalle"}`);
    else await new Promise((r) => setTimeout(r, 1200 * attempt));
  }
  createdUsers.push(user!.id);
  const client = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(`signIn ${label}: ${signInErr.message}`);
  return { id: user!.id, client };
}

const PDF_BYTES = new Uint8Array([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0x45, 0x4f, 0x46,
]);
const METADATA = {
  title: "Evidencia integridad T9E2",
  evidence_type: "other",
  description: null,
  document_date: null,
  issuer: null,
  reference_code: null,
  valid_from: null,
  valid_until: null,
};

async function beginIntent(client: SupabaseClient, orgId: string) {
  const { data, error } = await client.rpc("begin_textile_evidence_upload", {
    p_organization_id: orgId,
    p_file_name: "integridad.pdf",
    p_file_size_bytes: PDF_BYTES.length,
    p_file_mime_type: "application/pdf",
    p_metadata: METADATA,
    p_ttl_minutes: 30,
  });
  if (error || !data) throw new Error(`begin RPC: ${error?.message}`);
  const row = data as { intent_id: string; object_path: string };
  createdObjects.push(row.object_path);
  return row;
}

/** Estado del intento + nº de evidencias ligadas (para probar CERO efectos). */
async function intentSnapshot(intentId: string) {
  const { data: row } = await admin
    .from("textile_evidence_upload_intents")
    .select("status, evidence_id, cleanup_attempts")
    .eq("id", intentId)
    .single();
  const { count } = await admin
    .from("textile_evidences")
    .select("id", { count: "exact", head: true })
    .eq("id", intentId);
  return { status: row?.status, evidenceId: row?.evidence_id, attempts: Number(row?.cleanup_attempts ?? 0), evidences: count ?? 0 };
}

async function main() {
  console.log("\nTrazaloop · T9E.2/T9E.3: integridad REAL server-only (staging)\n");

  const a1 = await newUser("a1admin");
  const a2 = await newUser("a2quality");
  const b = await newUser("badmin");

  const { data: orgAData, error: orgAErr } = await a1.client.rpc("create_organization", {
    p_name: `QA T9E2 A ${Date.now()} (temporal)`,
  });
  if (orgAErr || !orgAData) throw new Error(`orgA: ${orgAErr?.message}`);
  const orgA = orgAData as string;
  createdOrgs.push(orgA);
  const { data: orgBData, error: orgBErr } = await b.client.rpc("create_organization", {
    p_name: `QA T9E2 B ${Date.now()} (temporal)`,
  });
  if (orgBErr || !orgBData) throw new Error(`orgB: ${orgBErr?.message}`);
  const orgB = orgBData as string;
  createdOrgs.push(orgB);

  await admin.from("memberships").insert({
    organization_id: orgA,
    user_id: a2.id,
    role_code: "quality",
    status: "active",
  });
  for (const org of [orgA, orgB]) {
    await admin
      .from("organization_modules")
      .upsert(
        { organization_id: org, module_code: "textiles", enabled: true, access_mode: "extra", access_expires_at: null },
        { onConflict: "organization_id,module_code" }
      );
  }
  const anon = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  console.log("Datos temporales creados (2 organizaciones, 3 usuarios).\n");

  // ------------------------------------------------------------------
  // Transiciones directas cerradas (0097) + sellado de RPC (0098)
  // ------------------------------------------------------------------
  let intent!: { intent_id: string; object_path: string };

  await check("1. La RPC begin funciona para un usuario autorizado y la ruta cumple el patrón EXACTO", async () => {
    intent = await beginIntent(a1.client, orgA);
    const pattern = new RegExp(`^${orgA}/textiles/${intent.intent_id}/integridad\\.pdf$`);
    assert(pattern.test(intent.object_path), `ruta fuera de patrón: forma=${intent.object_path.split("/").length} segmentos`);
  });

  await check("2. INSERT directo a la tabla está bloqueado (incluso con datos válidos)", async () => {
    const forged = randomUUID();
    const { error } = await a1.client.from("textile_evidence_upload_intents").insert({
      id: forged,
      organization_id: orgA,
      created_by: a1.id,
      object_path: `${orgA}/textiles/${forged}/x.pdf`,
      original_filename: "x.pdf",
      safe_filename: "x.pdf",
      expected_size_bytes: 10,
      expected_mime_type: "application/pdf",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    assert(error !== null, "el INSERT directo debía estar bloqueado (RLS 0097)");
  });

  await check("3. UPDATE y DELETE directos están bloqueados (también para el propio creador)", async () => {
    const { data: upd } = await a1.client
      .from("textile_evidence_upload_intents")
      .update({ status: "failed" })
      .eq("id", intent.intent_id)
      .select("id");
    assert((upd ?? []).length === 0, "el creador pudo hacer UPDATE directo");
    const { data: del } = await a1.client
      .from("textile_evidence_upload_intents")
      .delete()
      .eq("id", intent.intent_id)
      .select("id");
    assert((del ?? []).length === 0, "el creador pudo hacer DELETE directo");
  });

  await check("4. ATAQUE B1 · finalize DIRECTO sin objeto en Storage → permission denied para creador, mismo-org, otra org y anon; CERO evidencias", async () => {
    for (const [label, client] of [
      ["creador", a1.client],
      ["mismo-org", a2.client],
      ["otra-org", b.client],
      ["anon", anon],
    ] as const) {
      const { error } = await client.rpc("finalize_textile_evidence_upload", {
        p_intent_id: intent.intent_id,
        p_file_size_bytes: PDF_BYTES.length,
        p_file_mime_type: "application/pdf",
      });
      assert(
        isPermissionDenied(error),
        `${label}: la RPC sellada debía dar permission denied (0098); dio: ${error?.message ?? "ÉXITO"}`
      );
    }
    const snap = await intentSnapshot(intent.intent_id);
    assert(snap.status === "pending" && snap.evidenceId === null, "el intento cambió pese al sellado");
    assert(snap.evidences === 0, "se creó una evidencia pese al sellado");
  });

  await check("5. ATAQUE B2 · cleanup DIRECTO con p_removed=true afirmado por el navegador → permission denied; intento intacto", async () => {
    for (const [label, client] of [
      ["creador", a1.client],
      ["mismo-org", a2.client],
      ["otra-org", b.client],
      ["anon", anon],
    ] as const) {
      const { error } = await client.rpc("record_textile_upload_intent_cleanup", {
        p_intent_id: intent.intent_id,
        p_removed: true,
      });
      assert(
        isPermissionDenied(error),
        `${label}: la RPC sellada debía dar permission denied (0098); dio: ${error?.message ?? "ÉXITO"}`
      );
    }
    const snap = await intentSnapshot(intent.intent_id);
    assert(snap.status === "pending" && snap.attempts === 0, "el intento cambió pese al sellado");
  });

  await check("6. Lecturas por creador: A2 (misma org, rol autorizado) NO ve el intento de A1 ni lo marca fallido", async () => {
    const { data: rows } = await a2.client
      .from("textile_evidence_upload_intents")
      .select("id")
      .eq("id", intent.intent_id);
    assert((rows ?? []).length === 0, "A2 pudo LEER el intento de A1");
    const { data: fail } = await a2.client.rpc("mark_textile_evidence_upload_failed", {
      p_intent_id: intent.intent_id,
    });
    assert(fail !== true, "A2 pudo marcar failed el intento de A1");
  });

  // ------------------------------------------------------------------
  // Variantes *_server: actor explícito revalidado en PostgreSQL
  // ------------------------------------------------------------------
  await check("7. *_server con actor INCORRECTO → rechazado aunque invoque service_role (mismo-org, otra org, inexistente, null)", async () => {
    const cases: Array<[string, string | null, string]> = [
      ["mismo-org no creador", a2.id, "INTENT_NOT_OWNED"],
      ["otra organización", b.id, "ROLE_NOT_ALLOWED"],
      ["usuario inexistente", randomUUID(), "ACTOR_NOT_FOUND"],
      ["actor null", null, "ACTOR_REQUIRED"],
    ];
    for (const [label, actor, code] of cases) {
      const { error } = await admin.rpc("finalize_textile_evidence_upload_server", {
        p_actor_id: actor,
        p_intent_id: intent.intent_id,
        p_file_size_bytes: PDF_BYTES.length,
        p_file_mime_type: "application/pdf",
      });
      assert(error !== null && error.message.includes(code), `${label}: esperaba ${code}, dio: ${error?.message ?? "ÉXITO"}`);
    }
    const snap = await intentSnapshot(intent.intent_id);
    assert(snap.status === "pending" && snap.evidences === 0, "los actores incorrectos dejaron efectos");
  });

  // ------------------------------------------------------------------
  // Atomicidad e idempotencia (ahora por la vía server-only legítima)
  // ------------------------------------------------------------------
  await check("8. Tamaño verificado distinto → rechazo Y el intento sigue pending SIN evidencia (rollback atómico)", async () => {
    const { error } = await admin.rpc("finalize_textile_evidence_upload_server", {
      p_actor_id: a1.id,
      p_intent_id: intent.intent_id,
      p_file_size_bytes: PDF_BYTES.length + 999,
      p_file_mime_type: "application/pdf",
    });
    assert(error !== null && error.message.includes("OBJECT_SIZE_MISMATCH"), "el tamaño divergente debía rechazarse");
    const snap = await intentSnapshot(intent.intent_id);
    assert(snap.status === "pending" && snap.evidenceId === null, "el intento cambió pese al rechazo");
    assert(snap.evidences === 0, "quedó una evidencia pese al rechazo");
  });

  await check("9. Flujo LEGÍTIMO server-only: evidencia + consumo + vínculo en UNA transacción, con el ACTOR real como created_by", async () => {
    const { error: upErr } = await a1.client.storage
      .from("evidences")
      .upload(intent.object_path, PDF_BYTES, { contentType: "application/pdf" });
    assert(upErr === null, `subida falló: ${upErr?.message}`);
    const { data, error } = await admin.rpc("finalize_textile_evidence_upload_server", {
      p_actor_id: a1.id,
      p_intent_id: intent.intent_id,
      p_file_size_bytes: PDF_BYTES.length,
      p_file_mime_type: "application/pdf",
    });
    assert(error === null, `finalize falló: ${error?.message}`);
    const res = data as { evidence_id: string; already_finalized: boolean };
    assert(res.evidence_id === intent.intent_id && res.already_finalized === false, "resultado inesperado");
    const { data: row } = await a1.client
      .from("textile_evidence_upload_intents")
      .select("status, evidence_id, consumed_at")
      .eq("id", intent.intent_id)
      .single();
    assert(
      row?.status === "consumed" && row?.evidence_id === intent.intent_id && row?.consumed_at !== null,
      "el intento no quedó consumido y ligado"
    );
    const { data: ev } = await admin
      .from("textile_evidences")
      .select("id, title, file_path, created_by")
      .eq("id", intent.intent_id)
      .single();
    assert(ev?.title === METADATA.title, "la evidencia no usó la metadata CANÓNICA del intento");
    assert(ev?.file_path === intent.object_path, "la evidencia no quedó ligada a la ruta del intento");
    assert(ev?.created_by === a1.id, "created_by no es el ACTOR real pasado por el servidor");
  });

  await check("10. Doble finalize server-only: idempotente — mismo evidence_id, UNA sola evidencia", async () => {
    const { data, error } = await admin.rpc("finalize_textile_evidence_upload_server", {
      p_actor_id: a1.id,
      p_intent_id: intent.intent_id,
      p_file_size_bytes: PDF_BYTES.length,
      p_file_mime_type: "application/pdf",
    });
    assert(error === null, `segundo finalize falló: ${error?.message}`);
    const res = data as { evidence_id: string; already_finalized: boolean };
    assert(res.evidence_id === intent.intent_id && res.already_finalized === true, "no fue idempotente");
    const { count } = await admin
      .from("textile_evidences")
      .select("id", { count: "exact", head: true })
      .eq("id", intent.intent_id);
    assert(count === 1, `evidencias duplicadas: ${count}`);
  });

  await check("11. Un intento consumed es INMUTABLE e imborrable, incluso para service_role", async () => {
    const { error: updErr } = await admin
      .from("textile_evidence_upload_intents")
      .update({ status: "pending", consumed_at: null })
      .eq("id", intent.intent_id);
    assert(updErr !== null, "un consumido pudo revertirse");
    const { error: delErr } = await admin
      .from("textile_evidence_upload_intents")
      .delete()
      .eq("id", intent.intent_id);
    assert(delErr !== null, "un consumido pudo eliminarse");
  });

  await check("12. Un intento VIGENTE no entra al ciclo de limpieza ('still_active') y conserva su estado", async () => {
    const short = await beginIntent(a1.client, orgA);
    const { data: res, error: cleanErr } = await admin.rpc("record_textile_upload_intent_cleanup_server", {
      p_actor_id: a1.id,
      p_intent_id: short.intent_id,
      p_removed: true,
    });
    assert(cleanErr === null && res === "still_active", "un intento vigente no debía poder cerrarse");
    const { data: still } = await a1.client
      .from("textile_evidence_upload_intents")
      .select("status")
      .eq("id", short.intent_id)
      .single();
    assert(still?.status === "pending", "el intento vigente cambió de estado");
  });

  await check("13. Limpieza RECUPERABLE server-only: removed=false NO cierra (contador++), removed=true cierra en 'expired'", async () => {
    const f = await beginIntent(a1.client, orgA);
    const { data: markData, error: markErr } = await a1.client.rpc("mark_textile_evidence_upload_failed", {
      p_intent_id: f.intent_id,
    });
    assert(markErr === null && markData === true, `mark failed falló: ${markErr?.message}`);

    const { data: r1 } = await admin.rpc("record_textile_upload_intent_cleanup_server", {
      p_actor_id: a1.id,
      p_intent_id: f.intent_id,
      p_removed: false,
    });
    assert(r1 === "failed", "removed=false debía conservar el estado (recuperable)");
    const { data: after1 } = await a1.client
      .from("textile_evidence_upload_intents")
      .select("status, cleanup_attempts, last_cleanup_attempt_at")
      .eq("id", f.intent_id)
      .single();
    assert(
      after1?.status === "failed" && Number(after1?.cleanup_attempts) === 1 && after1?.last_cleanup_attempt_at !== null,
      "el fallo de limpieza no quedó registrado como recuperable"
    );

    const { data: r2 } = await admin.rpc("record_textile_upload_intent_cleanup_server", {
      p_actor_id: a1.id,
      p_intent_id: f.intent_id,
      p_removed: true,
    });
    assert(r2 === "expired", "removed=true debía cerrar el intento");
    const { data: after2 } = await a1.client
      .from("textile_evidence_upload_intents")
      .select("status")
      .eq("id", f.intent_id)
      .single();
    assert(after2?.status === "expired", "el intento no quedó cerrado");
  });

  await check("14. La limpieza JAMÁS cierra un intento consumed (objeto de evidencia intocable)", async () => {
    const { data: res } = await admin.rpc("record_textile_upload_intent_cleanup_server", {
      p_actor_id: a1.id,
      p_intent_id: intent.intent_id,
      p_removed: true,
    });
    assert(res === "consumed_untouchable", "un consumido pudo entrar al ciclo de limpieza");
    const { data: obj, error: dlErr } = await a1.client.storage
      .from("evidences")
      .download(intent.object_path);
    assert(dlErr === null && obj !== null, "el objeto de la evidencia desapareció");
  });

  await check("15. Metadata inválida en begin → rechazada ANTES de emitir autorización de subida", async () => {
    const { error } = await a1.client.rpc("begin_textile_evidence_upload", {
      p_organization_id: orgA,
      p_file_name: "sin-titulo.pdf",
      p_file_size_bytes: 100,
      p_file_mime_type: "application/pdf",
      p_metadata: { ...METADATA, title: "   " },
      p_ttl_minutes: 30,
    });
    assert(error !== null && error.message.includes("METADATA_TITLE_INVALID"), "begin aceptó metadata inválida");
    const { error: e2 } = await a1.client.rpc("begin_textile_evidence_upload", {
      p_organization_id: orgA,
      p_file_name: "fechas.pdf",
      p_file_size_bytes: 100,
      p_file_mime_type: "application/pdf",
      p_metadata: { ...METADATA, valid_from: "2026-12-31", valid_until: "2026-01-01" },
      p_ttl_minutes: 30,
    });
    assert(e2 !== null && e2.message.includes("METADATA_VALIDITY_INVALID"), "begin aceptó vigencia invertida");
  });

  await check("16. A no puede iniciar un intento PARA la organización B (rol re-verificado en la RPC)", async () => {
    const { error } = await a1.client.rpc("begin_textile_evidence_upload", {
      p_organization_id: orgB,
      p_file_name: "cruzado.pdf",
      p_file_size_bytes: 100,
      p_file_mime_type: "application/pdf",
      p_metadata: METADATA,
      p_ttl_minutes: 30,
    });
    assert(error !== null && error.message.includes("ROLE_NOT_ALLOWED"), "A inició un intento para B");
  });

  // ------------------------------------------------------------------
  // EXPERIMENTO §10 (T9E.3): token firmado tras retiro + subida tardía
  // ------------------------------------------------------------------
  await check("17. EXPERIMENTO: reutilización del token firmado tras el retiro; defensa por re-barrido; jamás finalizable", async () => {
    const exp = await beginIntent(a1.client, orgA);
    const { data: signed, error: signErr } = await a1.client.storage
      .from("evidences")
      .createSignedUploadUrl(exp.object_path);
    assert(signErr === null && signed?.token, `no se emitió URL firmada: ${signErr?.message}`);

    const up1 = await a1.client.storage
      .from("evidences")
      .uploadToSignedUrl(exp.object_path, signed!.token, PDF_BYTES, { contentType: "application/pdf" });
    assert(up1.error === null, `primera subida falló: ${up1.error?.message}`);

    const { error: rm1 } = await admin.storage.from("evidences").remove([exp.object_path]);
    assert(rm1 === null, `retiro inicial falló: ${rm1?.message}`);

    const up2 = await a1.client.storage
      .from("evidences")
      .uploadToSignedUrl(exp.object_path, signed!.token, PDF_BYTES, { contentType: "application/pdf" });
    const reusable = up2.error === null;
    console.log(
      reusable
        ? "    · OBSERVADO: el token firmado SE REUTILIZÓ tras el retiro (NO es de un solo uso) → la defensa por re-barrido es NECESARIA"
        : "    · OBSERVADO: el token no se pudo reutilizar en este entorno; la defensa por re-barrido queda como red de seguridad"
    );

    // Cierre del ciclo como lo hace el SERVIDOR: retiro confirmado + RPC.
    const { data: markData } = await a1.client.rpc("mark_textile_evidence_upload_failed", {
      p_intent_id: exp.intent_id,
    });
    assert(markData === true, "no se pudo marcar failed el intento del experimento");
    await admin.storage.from("evidences").remove([exp.object_path]);
    const { data: closed, error: closeErr } = await admin.rpc("record_textile_upload_intent_cleanup_server", {
      p_actor_id: a1.id,
      p_intent_id: exp.intent_id,
      p_removed: true,
    });
    assert(closeErr === null && closed === "expired", `el cierre falló: ${closeErr?.message ?? closed}`);

    // SUBIDA TARDÍA tras el cierre (mismo token) → el re-barrido la retira.
    const up3 = await a1.client.storage
      .from("evidences")
      .uploadToSignedUrl(exp.object_path, signed!.token, PDF_BYTES, { contentType: "application/pdf" });
    if (up3.error === null) {
      const { data: info } = await admin.storage.from("evidences").info(exp.object_path);
      assert(info !== null, "el objeto tardío debía ser visible para el re-barrido");
      const { error: rmLate } = await admin.storage.from("evidences").remove([exp.object_path]);
      assert(rmLate === null, "el re-barrido no pudo retirar el objeto tardío");
      console.log("    · DEFENSA: el objeto tardío fue retirado por el re-barrido (ventana de gracia)");
    } else {
      console.log("    · La subida tardía no prosperó en este entorno; se asserta igual la no-finalización");
    }

    // Pase lo que pase con el objeto: el intento expirado JAMÁS se finaliza.
    const { error: finErr } = await admin.rpc("finalize_textile_evidence_upload_server", {
      p_actor_id: a1.id,
      p_intent_id: exp.intent_id,
      p_file_size_bytes: PDF_BYTES.length,
      p_file_mime_type: "application/pdf",
    });
    assert(
      finErr !== null && finErr.message.includes("INTENT_NOT_PENDING"),
      `un intento expirado pudo finalizarse: ${finErr?.message ?? "ÉXITO"}`
    );
    const snap = await intentSnapshot(exp.intent_id);
    assert(snap.status === "expired" && snap.evidences === 0, "el experimento dejó efectos indebidos");
  });

  console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
}

async function cleanup() {
  console.log("\nLimpieza de datos temporales…");
  try {
    if (createdObjects.length > 0) {
      await admin.storage.from("evidences").remove(createdObjects);
    }
    for (const org of createdOrgs) {
      for (const table of [
        "textile_evidences",
        "organization_modules",
        "memberships",
        "organization_subscriptions",
      ]) {
        await admin.from(table).delete().eq("organization_id", org);
      }
      // Los intentos consumed y la fila organizations quedan como residuo
      // PROTEGIDO POR DISEÑO (guard 0097 / audit_log append-only) — cascarón
      // sin miembros, sin módulos, sin objetos.
      await admin
        .from("textile_evidence_upload_intents")
        .delete()
        .eq("organization_id", org)
        .neq("status", "consumed");
      await admin.from("organizations").delete().eq("id", org);
    }
    for (const userId of createdUsers) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        await admin.auth.admin.updateUserById(userId, {
          password: `Qa1-${randomUUID()}`,
          ban_duration: "87600h",
        });
        await admin.auth.admin.deleteUser(userId, true);
      }
    }
    console.log(
      `Limpieza: ${createdObjects.length} objeto(s) tratados; usuarios eliminados/rotados: ${createdUsers.length}; organizaciones tratadas: ${createdOrgs.length}.`
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
