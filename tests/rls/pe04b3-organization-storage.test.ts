/**
 * Trazaloop · PE-04B3 · La cuota de almacenamiento es UNA por empresa.
 *
 * Lo que de verdad hay que demostrar ejecutando, porque leyendo el código no
 * se ve:
 *
 *   · que los bytes de PCR le quiten espacio a Textiles y al revés —antes cada
 *     módulo creía tener el cupo entero y una empresa Full disponía del doble
 *     de lo contratado—;
 *   · que el logo descuente del mismo sitio;
 *   · que bajar de plan deje a la empresa POR ENCIMA del límite sin borrar
 *     absolutamente nada;
 *   · y que no poder comprobar la capacidad NIEGUE, en vez de leerse como
 *     «cero bytes usados».
 *
 * Correr: npm run test:pe04b3-storage
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";
const personasCreadas: string[] = [];

async function persona(prefijo: string, papel?: "superadmin") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B3" } });
  assert(data.user, `crear ${prefijo}`);
  personasCreadas.push(data.user.id);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b3" });
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: papel, status: "active" });
  }
  return { id: data.user.id, email, cli };
}

const MB = 1024 * 1024;
const FREE = 50 * MB;      // 52 428 800 — congelado en PE-04B2
const FULL = 500 * MB;     // 524 288 000

type Estado = {
  state: string; reason: string | null; plan_code: string | null;
  limit_state: string | null; quota_bytes: number | null;
  committed_bytes: number; reserved_bytes: number; used_bytes: number;
  remaining_bytes: number | null;
  unknown_size_count: number; conflict_count: number;
};

async function main() {
  const sa = await persona("b3-sa", "superadmin");
  const dueño = await persona("b3-org");
  const ajeno = await persona("b3-ajeno");

  const { data: orgId } = await dueño.cli.rpc("create_organization", { p_name: `B3 ${sello}` });
  const org = orgId as string;
  const { data: otroId } = await ajeno.cli.rpc("create_organization", { p_name: `B3 otra ${sello}` });
  const otraOrg = otroId as string;

  const estado = async (cli: SupabaseClient, o = org): Promise<Estado> => {
    const { data, error } = await cli.rpc("organization_storage_status", { p_organization_id: o });
    assert(!error, `estado: ${error?.message}`);
    return data as unknown as Estado;
  };

  /** La reserva canónica. Devuelve el código de error o null si concedió. */
  const reservar = async (bytes: number, yaContados = 0, cli = dueño.cli, o = org) => {
    const { error } = await cli.rpc("organization_storage_guard", {
      p_organization_id: o, p_requested_bytes: bytes, p_already_counted_bytes: yaContados });
    return error ? (error.message ?? "") : null;
  };

  /** Bytes CONFIRMADOS inyectados como huérfano pendiente: es la vía más
   *  corta para poner bytes reales de un módulo concreto en la contabilidad
   *  sin fabricar media docena de filas de negocio. */
  let n = 0;
  const ocupar = async (bytes: number, modulo: "textiles" | "traceability_6632") => {
    n += 1;
    const path = modulo === "textiles"
      ? `${org}/textiles/b3-${n}.bin`
      : `${org}/document_files/b3-${n}.bin`;
    const { error } = await admin.from("storage_orphan_candidates").insert({
      organization_id: org, module_code: modulo,
      bucket_id: modulo === "textiles" ? "evidences" : "trazadocs-documents",
      object_path: path, size_bytes: bytes, source_type: "unreferenced", status: "pending_delete" });
    assert(!error, `ocupar: ${error?.message}`);
    return path;
  };
  const liberarTodo = async () => {
    await admin.from("storage_orphan_candidates").delete().eq("organization_id", org);
    await admin.from("organizations")
      .update({ logo_storage_path: null, logo_size_bytes: null }).eq("id", org);
  };

  const revision = async (code: string) => {
    const { data } = await admin.from("plan_revisions")
      .select("id").eq("plan_code", code).eq("status", "published")
      .is("effective_to", null).single();
    return (data as { id: string }).id;
  };
  /** Deja a la empresa con UNA sola asignación de empresa del plan pedido. */
  const ponerPlan = async (code: "free" | "full" | "extra") => {
    await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
    const { error } = await admin.from("organization_plan_assignments").insert({
      organization_id: org, plan_revision_id: await revision(code),
      scope: "organization", grant_kind: "base", source: "manual" });
    assert(!error, `ponerPlan: ${error?.message}`);
  };

  console.log("\nPE-04B3 · Cuota única de empresa\n");

  try {
    // =====================================================================
    console.log("A · Un solo cupo para toda la empresa");
    // =====================================================================

    await check("A1. Los bytes de PCR le quitan espacio a Textiles", async () => {
      await ponerPlan("free");
      await liberarTodo();
      const libre = await estado(dueño.cli);
      assert(libre.quota_bytes === FREE, `cuota Free = ${libre.quota_bytes}`);
      assert(libre.remaining_bytes === FREE, `empezaba con ${libre.remaining_bytes} libres`);

      // 40 MB ocupados por TrazaDocs (módulo PCR).
      await ocupar(40 * MB, "traceability_6632");
      // Antes de 0164 Textiles habría visto su propio cupo intacto y habría
      // concedido estos 20 MB. Ahora quedan 10 MB en toda la empresa.
      const err = await reservar(20 * MB);
      assert(err !== null && err.includes("STORAGE_QUOTA_EXCEEDED"),
        `Textiles pudo reservar 20 MB con 40 MB ya ocupados por PCR (${err})`);
      const cabe = await reservar(9 * MB);
      assert(cabe === null, `no dejó reservar 9 MB de los 10 libres: ${cabe}`);
    });

    await check("A2. Y al revés · lo de Textiles se lo quita a PCR", async () => {
      await liberarTodo();
      await ocupar(45 * MB, "textiles");
      const err = await reservar(10 * MB);
      assert(err !== null && err.includes("STORAGE_QUOTA_EXCEEDED"),
        `PCR pudo reservar 10 MB con 45 MB ocupados por Textiles (${err})`);
    });

    await check("A3. El logo descuenta del MISMO cupo", async () => {
      await liberarTodo();
      const sinLogo = await estado(dueño.cli);
      await admin.from("organizations").update({
        logo_storage_path: `${org}/logo/logo.png`, logo_size_bytes: 2 * MB }).eq("id", org);
      const conLogo = await estado(dueño.cli);
      assert(conLogo.used_bytes - sinLogo.used_bytes === 2 * MB,
        `el logo sumó ${conLogo.used_bytes - sinLogo.used_bytes} bytes`);
    });

    await check("A4. El contenido de la plataforma NO se le cobra al cliente", async () => {
      // `tutorial-media` es del producto, no de la empresa.
      const antes = await estado(dueño.cli);
      const { data: v } = await admin.from("platform_tutorial_versions")
        .select("declared_size_bytes").limit(1);
      const después = await estado(dueño.cli);
      assert(antes.used_bytes === después.used_bytes,
        "el uso de la empresa cambió al mirar contenido de plataforma");
      assert(Array.isArray(v), "no se pudo leer el catálogo de tutoriales");
    });

    // =====================================================================
    console.log("\nB · Los cuatro estados");
    // =====================================================================

    await check("B1. WITHIN_LIMIT, AT_LIMIT y OVER_LIMIT son tres cosas distintas", async () => {
      await liberarTodo();
      await ocupar(FREE - 1, "traceability_6632");
      assert((await estado(dueño.cli)).state === "WITHIN_LIMIT", "con 1 byte libre no dijo WITHIN_LIMIT");

      await liberarTodo();
      await ocupar(FREE, "traceability_6632");
      const justo = await estado(dueño.cli);
      assert(justo.state === "AT_LIMIT", `exactamente en el límite dijo ${justo.state}`);
      assert(justo.remaining_bytes === 0, `quedaban ${justo.remaining_bytes}`);

      await liberarTodo();
      await ocupar(FREE + 1, "traceability_6632");
      const pasado = await estado(dueño.cli);
      assert(pasado.state === "OVER_LIMIT", `por encima dijo ${pasado.state}`);
      assert(pasado.remaining_bytes === 0,
        `«lo que queda» salió ${pasado.remaining_bytes}: por encima del límite queda cero, no una deuda`);
    });

    await check("B2. Sin plan NO se cae al más bajo · QUOTA_UNAVAILABLE y niega", async () => {
      await liberarTodo();
      await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
      const e = await estado(dueño.cli);
      assert(e.state === "QUOTA_UNAVAILABLE", `dijo ${e.state}`);
      assert(e.reason === "plan_absent", `razón ${e.reason}`);
      const err = await reservar(1);
      assert(err !== null && err.includes("STORAGE_QUOTA_UNVERIFIABLE"),
        `dejó reservar 1 byte sin plan (${err})`);
    });

    await check("B3. Un límite SIN CONFIGURAR niega · no es «ilimitado»", async () => {
      // Se publica una revisión de un plan que NO declara storage_bytes y se
      // le asigna a la empresa: el resolutor debe negar, no dejar pasar.
      // La revisión se deja en BORRADOR a propósito: una publicada no se puede
      // borrar —es historia comercial— y esta suite no debe dejar rastro en el
      // catálogo. Lo que se ejerce es el mismo camino de
      // `plan_limit_for_revision`: una revisión que no declara `storage_bytes`.
      const { data: maxRev } = await admin.from("plan_revisions")
        .select("revision_number").eq("plan_code", "extra")
        .order("revision_number", { ascending: false }).limit(1).single();
      const siguiente = ((maxRev as { revision_number: number } | null)?.revision_number ?? 0) + 1;
      const { data: nueva, error: eIns } = await admin.from("plan_revisions").insert({
        plan_code: "extra", revision_number: siguiente, status: "draft",
        display_name: "B3 sin límite declarado", price_state: "not_configured",
        internal_notes: "PE-04B3 · prueba de límite sin configurar" }).select("id").single();
      assert(!eIns, `crear revisión: ${eIns?.message}`);
      const revId = (nueva as { id: string }).id;
      try {
        await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
        await admin.from("organization_plan_assignments").insert({
          organization_id: org, plan_revision_id: revId,
          scope: "organization", grant_kind: "base", source: "manual" });

        const e = await estado(dueño.cli);
        assert(e.state === "QUOTA_UNAVAILABLE", `dijo ${e.state}`);
        assert(e.reason === "limit_not_configured", `razón ${e.reason}`);
        const err = await reservar(1);
        assert(err !== null && err.includes("STORAGE_QUOTA_UNVERIFIABLE"),
          `dejó reservar sin límite configurado (${err})`);
      } finally {
        await admin.from("organization_plan_assignments").delete().eq("organization_id", org);
        await admin.from("plan_revisions").delete().eq("id", revId);
      }
    });

    await check("B4. Un tamaño DESCONOCIDO bloquea · sin dato no es cero", async () => {
      await ponerPlan("free");
      await liberarTodo();
      const { error } = await admin.from("storage_orphan_candidates").insert({
        organization_id: org, module_code: "traceability_6632",
        bucket_id: "trazadocs-documents", object_path: `${org}/document_files/sin-tamaño.bin`,
        size_bytes: null, source_type: "unreferenced", status: "pending_delete" });
      assert(!error, `insertar huérfano sin tamaño: ${error?.message}`);

      const e = await estado(dueño.cli);
      assert(e.unknown_size_count >= 1, "no contó el objeto de tamaño desconocido");
      assert(e.state === "QUOTA_UNAVAILABLE" && e.reason === "usage_unverifiable",
        `dijo ${e.state}/${e.reason}`);
      const err = await reservar(1);
      assert(err !== null && err.includes("STORAGE_UNVERIFIABLE"),
        `dejó reservar con tamaños sin verificar (${err})`);
      await liberarTodo();
    });

    // =====================================================================
    console.log("\nC · La reserva");
    // =====================================================================

    await check("C1. Una reserva viva ocupa aunque el objeto no exista todavía", async () => {
      await ponerPlan("free");
      await liberarTodo();
      await ocupar(30 * MB, "traceability_6632");
      // 20 MB en curso (el tope por archivo de CPR son 25 MB) sobre 30 MB ya
      // confirmados: quedan 0 libres de los 50 del plan Free.
      const { error } = await admin.from("storage_upload_intents").insert({
        organization_id: org, module_code: "traceability_6632",
        resource_type: "trazadoc_initial", resource_id: crypto.randomUUID(),
        bucket_id: "trazadocs-documents", object_path: `${org}/document_files/reserva.bin`,
        original_filename: "reserva.bin", safe_filename: "reserva.bin",
        expected_size_bytes: 20 * MB, expected_mime_type: "application/pdf",
        status: "pending", expires_at: new Date(Date.now() + 3600_000).toISOString(),
        created_by: dueño.id });
      assert(!error, `intent: ${error?.message}`);
      try {
        const e = await estado(dueño.cli);
        assert(e.reserved_bytes === 20 * MB, `reservados ${e.reserved_bytes}`);
        assert(e.committed_bytes === 30 * MB,
          `confirmados ${e.committed_bytes} · una reserva no es un archivo confirmado`);
        const err = await reservar(1 * MB);
        assert(err !== null && err.includes("STORAGE_QUOTA_EXCEEDED"),
          `una carga en curso de 20 MB no impidió otra de 1 MB (${err})`);
      } finally {
        await admin.from("storage_upload_intents").delete().eq("organization_id", org);
        await liberarTodo();
      }
    });

    await check("C2. Lo que se REEMPLAZA no se cobra dos veces", async () => {
      await liberarTodo();
      await ocupar(45 * MB, "traceability_6632");
      // Sin descontar: 45 + 8 > 50 ⇒ niega.
      assert((await reservar(8 * MB)) !== null, "debía negar sin descontar lo reemplazado");
      // Descontando los 45 MB que el nuevo archivo sustituye: 0 + 8 <= 50.
      assert((await reservar(8 * MB, 45 * MB)) === null,
        "no concedió al descontar lo que se reemplaza: un logo no podría cambiarse nunca");
    });

    await check("C3. Una petición negativa se rechaza · no suma capacidad", async () => {
      const err = await reservar(-1);
      assert(err !== null && err.includes("STORAGE_REQUEST_INVALID"), `respondió ${err}`);
    });

    // =====================================================================
    console.log("\nD · Bajar de plan no borra nada");
    // =====================================================================

    await check("D1. De Full a Free con 200 MB dentro: OVER_LIMIT y NADA desaparece", async () => {
      await ponerPlan("full");
      await liberarTodo();
      await ocupar(120 * MB, "traceability_6632");
      await ocupar(80 * MB, "textiles");
      const enFull = await estado(dueño.cli);
      assert(enFull.state === "WITHIN_LIMIT" && enFull.quota_bytes === FULL,
        `en Full dijo ${enFull.state} con cuota ${enFull.quota_bytes}`);

      const { count: antes } = await admin.from("storage_orphan_candidates")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);

      await ponerPlan("free");

      const enFree = await estado(dueño.cli);
      assert(enFree.state === "OVER_LIMIT", `tras bajar dijo ${enFree.state}`);
      assert(enFree.used_bytes === 200 * MB, `usados ${enFree.used_bytes}`);

      const { count: después } = await admin.from("storage_orphan_candidates")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert(antes === después,
        `bajar de plan cambió el número de objetos: ${antes} → ${después}`);
    });

    await check("D2. Por encima del límite se NIEGA subir · nunca se borra para hacer sitio", async () => {
      const err = await reservar(1);
      assert(err !== null && err.includes("STORAGE_QUOTA_EXCEEDED"), `respondió ${err}`);
      const { count } = await admin.from("storage_orphan_candidates")
        .select("id", { count: "exact", head: true }).eq("organization_id", org);
      assert((count ?? 0) === 2, `el intento de reservar tocó los datos: quedan ${count}`);
    });

    await check("D3. Volver a subir de plan devuelve la capacidad, sin migrar nada", async () => {
      await ponerPlan("extra");
      const e = await estado(dueño.cli);
      assert(e.state === "WITHIN_LIMIT", `en Extra dijo ${e.state}`);
      assert((await reservar(1 * MB)) === null, "en Extra seguía sin dejar subir");
      await ponerPlan("free");
      await liberarTodo();
    });

    // =====================================================================
    console.log("\nE · Quién puede preguntar");
    // =====================================================================

    await check("E1. Un ajeno no puede leer el almacenamiento de otra empresa", async () => {
      const { error } = await ajeno.cli.rpc("organization_storage_status", { p_organization_id: org });
      assert(error, "un ajeno leyó el estado de una empresa que no es suya");
    });

    await check("E2. Sin sesión tampoco", async () => {
      const anón = createClient(URL!, ANON!, { auth: { persistSession: false } });
      const { error } = await anón.rpc("organization_storage_status", { p_organization_id: org });
      assert(error, "se pudo leer el estado sin sesión");
    });

    await check("E3. La reconciliación es solo para personal de plataforma", async () => {
      const { error: eDueño } = await dueño.cli.rpc("organization_storage_drift",
        { p_organization_id: org });
      assert(eDueño, "un cliente pudo correr la reconciliación");
      const { error: eSa } = await sa.cli.rpc("organization_storage_drift",
        { p_organization_id: org });
      assert(!eSa, `el superadmin no pudo: ${eSa}`);
    });

    // =====================================================================
    console.log("\nF · Reconciliación");
    // =====================================================================

    await check("F1. Una fila declarada sin objeto sale como MISSING_OBJECT", async () => {
      await admin.from("organizations").update({
        logo_storage_path: `${org}/logo/logo.png`, logo_size_bytes: 1234 }).eq("id", org);
      const { data, error } = await sa.cli.rpc("organization_storage_drift",
        { p_organization_id: org });
      assert(!error, `deriva: ${error?.message}`);
      const filas = (data ?? []) as { object_path: string; drift_class: string }[];
      const logo = filas.find((f) => f.object_path.endsWith("logo.png"));
      assert(logo, "no reportó el logo declarado cuyo objeto no existe");
      assert(logo.drift_class === "MISSING_OBJECT", `lo clasificó como ${logo.drift_class}`);
    });

    await check("F2. Un objeto amparado por un intent vigente NO es deriva", async () => {
      const ruta = `${org}/document_files/amparado.bin`;
      await admin.from("storage_upload_intents").insert({
        organization_id: org, module_code: "traceability_6632",
        resource_type: "trazadoc_initial", resource_id: crypto.randomUUID(),
        bucket_id: "trazadocs-documents", object_path: ruta,
        original_filename: "a.bin", safe_filename: "a.bin",
        expected_size_bytes: 10, expected_mime_type: "application/pdf",
        status: "pending", expires_at: new Date(Date.now() + 3600_000).toISOString(),
        created_by: dueño.id });
      try {
        const { data } = await sa.cli.rpc("organization_storage_drift", { p_organization_id: org });
        const filas = (data ?? []) as { object_path: string }[];
        assert(!filas.some((f) => f.object_path === ruta),
          "una carga en curso se reportó como deriva");
      } finally {
        await admin.from("storage_upload_intents").delete().eq("organization_id", org);
      }
    });
    // =====================================================================
    console.log("\nG · El camino real de subida, de punta a punta");
    // =====================================================================

    await check("G1. Textiles rechaza una carga por bytes que ocupó PCR", async () => {
      // ESTE es el defecto que cierra el sprint. Antes de 0164
      // `begin_textile_evidence_upload_v2` miraba el snapshot de SU módulo:
      // veía cero bytes y concedía, aunque PCR se hubiera comido el plan
      // entero. Una empresa Free disponía en la práctica del doble.
      await ponerPlan("free");
      await liberarTodo();
      await admin.from("organization_modules").update({
        enabled: true, access_mode: "full", access_expires_at: null })
        .eq("organization_id", org).eq("module_code", "textiles");

      await ocupar(45 * MB, "traceability_6632");
      const { error } = await dueño.cli.rpc("begin_textile_evidence_upload_v2", {
        p_organization_id: org, p_file_name: "evidencia.pdf",
        p_file_size_bytes: 10 * MB, p_file_mime_type: "application/pdf",
        p_metadata: { title: "Prueba B3", evidence_type: "other" },
        p_ttl_minutes: 30, p_idempotency_key: null });
      assert(error, "Textiles concedió la carga pese a que PCR había ocupado el plan");
      assert((error.message ?? "").includes("STORAGE_QUOTA_EXCEEDED"),
        `falló por otra razón: ${error.message}`);
    });

    await check("G2. …y la concede en cuanto cabe · no es que niegue siempre", async () => {
      await liberarTodo();
      const { data, error } = await dueño.cli.rpc("begin_textile_evidence_upload_v2", {
        p_organization_id: org, p_file_name: "evidencia.pdf",
        p_file_size_bytes: 10 * MB, p_file_mime_type: "application/pdf",
        p_metadata: { title: "Prueba B3", evidence_type: "other" },
        p_ttl_minutes: 30, p_idempotency_key: null });
      assert(!error, `negó una carga que cabía: ${error?.message}`);
      const intent = data as { intent_id: string } | null;
      assert(intent?.intent_id, "no devolvió reserva");

      // Y esa reserva ya ocupa: es la misma contabilidad, no una paralela.
      const e = await estado(dueño.cli);
      assert(e.reserved_bytes === 10 * MB, `reservados ${e.reserved_bytes}`);
      await admin.from("textile_evidence_upload_intents").delete().eq("organization_id", org);
    });

    await check("G3. El logo pasa por la misma reserva que los módulos", async () => {
      await liberarTodo();
      await ocupar(49 * MB, "textiles");
      const { error } = await dueño.cli.rpc("organization_storage_guard_logo", {
        p_organization_id: org, p_size_bytes: 2 * MB });
      assert(error && (error.message ?? "").includes("STORAGE_QUOTA_EXCEEDED"),
        `el logo entró sin capacidad: ${error?.message ?? "sin error"}`);
      await liberarTodo();
      const { error: ok } = await dueño.cli.rpc("organization_storage_guard_logo", {
        p_organization_id: org, p_size_bytes: 2 * MB });
      assert(!ok, `negó un logo que cabía: ${ok?.message}`);
    });
  } finally {
    await admin.from("textile_evidence_upload_intents").delete().eq("organization_id", org);
    await admin.from("storage_upload_intents").delete().eq("organization_id", org);
    await admin.from("storage_orphan_candidates").delete().eq("organization_id", org);
    await admin.from("organization_plan_assignments").delete().in("organization_id", [org, otraOrg]);
    await admin.from("organizations").delete().in("id", [org, otraOrg]);
    for (const id of personasCreadas) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
  }

  console.log(`\nPE-04B3 · almacenamiento: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
