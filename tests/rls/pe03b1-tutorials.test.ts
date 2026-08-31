/**
 * Trazaloop · PE-03B1 · El motor de tutoriales, contra la base real.
 *
 * Dos de estas comprobaciones son las que PE-03A avisó que saldrían verdes sin
 * demostrar nada, y aquí están escritas para que no:
 *
 *   · «la versión anterior se conserva» NO se comprueba contando filas. Las
 *     filas se conservan casi siempre; lo que se puede perder son los bytes. Se
 *     compara el resumen del objeto.
 *   · «reponer no reabre el periodo» NO se comprueba viendo que hay una versión
 *     nueva. Se comprueba que el `effective_to` de la vieja no se movió.
 *
 * Correr: npm run test:pe03b1-tutorials
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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
const BUCKET = "tutorial-media";

async function persona(prefijo: string, superadmin = false) {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B1" } });
  assert(data.user, `crear ${prefijo}`);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${prefijo}: ${error?.message}`);
  if (superadmin) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: "superadmin", status: "active" });
  }
  return { id: data.user.id, cli };
}

/** Un MP4 mínimo con relleno determinista, para que dos tengan resumen distinto. */
function mp4(marca: number, relleno = 512): Uint8Array {
  const b = new Uint8Array(12 + relleno);
  b.set([0x00, 0x00, 0x00, 0x18], 0);
  b.set([0x66, 0x74, 0x79, 0x70], 4);
  b.set([0x69, 0x73, 0x6f, 0x6d], 8);
  for (let i = 12; i < b.length; i += 1) b[i] = (i * marca) % 251;
  return b;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const objetosCreados: string[] = [];

/** Sube una versión entera: reserva, sube, finaliza. Devuelve la versión. */
async function subirVersion(
  sa: SupabaseClient, tutorialId: string, marca: number
): Promise<{ versionId: string; objectPath: string; hash: string; bytes: Uint8Array }> {
  const bytes = mp4(marca);
  const { data, error } = await sa.rpc("tutorial_reserve_upload", {
    p_tutorial_id: tutorialId, p_filename: `qa-${marca}.mp4`,
    p_mime: "video/mp4", p_size_bytes: bytes.byteLength, p_ttl_seconds: 900,
  });
  assert(!error && data && data.length === 1, `reservar: ${error?.message}`);
  const fila = data[0] as { version_id: string; object_path: string };

  const { error: eSub } = await admin.storage.from(BUCKET)
    .upload(fila.object_path, bytes, { contentType: "video/mp4", upsert: false });
  assert(!eSub, `subir: ${eSub?.message}`);
  objetosCreados.push(fila.object_path);

  const hash = await sha256(bytes);
  const { error: eFin } = await sa.rpc("tutorial_finalize_upload", {
    p_version_id: fila.version_id, p_real_size: bytes.byteLength,
    p_real_mime: "video/mp4", p_content_hash: hash, p_duration_seconds: 42,
  });
  assert(!eFin, `finalizar: ${eFin?.message}`);
  return { versionId: fila.version_id, objectPath: fila.object_path, hash, bytes };
}

async function main() {
  const sa = await persona("pe03b1-sa", true);
  const normal = await persona("pe03b1-normal");

  console.log("\nPE-03B1 · El motor de tutoriales\n");

  // La clave lleva el sello del momento, y no es una pantalla real.
  //
  // Dos razones. Una: usar `quality.processes` chocaría el día que alguien cree
  // el tutorial de verdad de esa pantalla. Dos: una versión publicada NO se
  // puede borrar —y así debe ser—, así que un tutorial de prueba que publica
  // algo no se puede retirar del todo. Con una clave propia por ejecución, cada
  // pasada es independiente y ninguna estorba a la siguiente.
  const CLAVE_QA = `quality.qa_pe03b1_${sello}`;

  // Autorreparación: si una pasada anterior se cayó a medias, sus tutoriales
  // quedan activos. Se retiran antes de empezar. (La lección de PE-02B4: una
  // suite que ensucia la base al fallar deja de ser repetible.)
  await admin.from("platform_tutorials").update({ status: "retired" })
    .like("page_key", "quality.qa_pe03b1_%").eq("status", "active");

  const { data: creado, error: eCrear } = await sa.cli.from("platform_tutorials")
    .insert({ tutorial_type: "page", page_key: CLAVE_QA,
              module_key: "quality", title: `QA procesos ${sello}` })
    .select("id").single();
  assert(!eCrear && creado, `crear tutorial: ${eCrear?.message}`);
  const tutorialId = (creado as { id: string }).id;

  try {
    // =======================================================================
    console.log("A–D · La identidad");
    // =======================================================================

    await check("A. La identidad es estable, y no la forma el título", async () => {
      const { error } = await sa.cli.from("platform_tutorials")
        .update({ title: "Otro título" }).eq("id", tutorialId);
      assert(!error, `renombrar: ${error?.message}`);
      const { data } = await sa.cli.from("platform_tutorials")
        .select("id, page_key").eq("id", tutorialId).single();
      assert((data as { id: string }).id === tutorialId, "cambió la identidad");
      assert((data as { page_key: string }).page_key === CLAVE_QA,
        "cambió la clave de pantalla");
    });

    await check("B. Un tutorial por clave de pantalla, no varios", async () => {
      const { error } = await sa.cli.from("platform_tutorials")
        .insert({ tutorial_type: "page", page_key: CLAVE_QA,
                  module_key: "quality", title: "Duplicado" });
      assert(error, "se pudo crear un segundo tutorial para la misma pantalla");
    });

    await check("C. Una clave mal formada se rechaza en la base", async () => {
      for (const mala of ["/quality/processes", "Quality.Processes", "procesos",
        "quality..processes", "quality processes"]) {
        const { error } = await sa.cli.from("platform_tutorials")
          .insert({ tutorial_type: "page", page_key: mala,
                    module_key: "quality", title: "Mala" });
        assert(error, `se aceptó la clave «${mala}»`);
      }
      // Y el módulo tiene que ser el primer segmento de la clave.
      const { error: eCruce } = await sa.cli.from("platform_tutorials")
        .insert({ tutorial_type: "page", page_key: "quality.otra",
                  module_key: "cpr", title: "Cruzada" });
      assert(eCruce, "se aceptó una clave de Quality con módulo de PCR");
    });

    await check("D. La bienvenida existe, es única y no cuelga de una pantalla",
      async () => {
        const { data } = await sa.cli.from("platform_tutorials")
          .select("id, page_key, module_key").eq("tutorial_type", "welcome");
        assert(data && data.length === 1, `hay ${data?.length} bienvenidas y debe haber una`);
        const w = data![0] as { page_key: string | null; module_key: string | null };
        assert(w.page_key === null && w.module_key === null,
          "la bienvenida cuelga de una pantalla inventada");
        const { error } = await sa.cli.from("platform_tutorials")
          .insert({ tutorial_type: "welcome", title: "Otra bienvenida" });
        assert(error, "se pudo crear una segunda bienvenida");
      });

    // =======================================================================
    console.log("\nE–I · Versiones y publicación");
    // =======================================================================

    const v1 = await subirVersion(sa.cli, tutorialId, 3);

    await check("E. Subir NO publica", async () => {
      const { data } = await sa.cli.from("platform_tutorial_versions")
        .select("file_state, effective_from, published_at").eq("id", v1.versionId).single();
      const v = data as { file_state: string; effective_from: string | null; published_at: string | null };
      assert(v.file_state === "verified", `el archivo está en «${v.file_state}»`);
      assert(v.effective_from === null, "subir dejó la versión vigente");
      assert(v.published_at === null, "subir puso fecha de publicación");
      // Y no se ve por la vista del producto.
      const { data: vista } = await normal.cli.from("v_tutorial_current")
        .select("version_id").eq("page_key", CLAVE_QA);
      assert(!vista || vista.length === 0, "una versión sin publicar ya se ve");
    });

    await check("F. Solo se publica lo verificado", async () => {
      const bytes = mp4(9);
      const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "sin-subir.mp4",
        p_mime: "video/mp4", p_size_bytes: bytes.byteLength, p_ttl_seconds: 900 });
      const reservada = (data as { version_id: string }[])[0];
      const { error } = await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: reservada.version_id, p_change_note: null });
      assert(error, "se publicó una versión cuyo archivo no está verificado");
      assert(/no está verificado/i.test(error!.message),
        `el rechazo no se explica: ${error!.message}`);
    });

    await check("G. Publicada, se ve; y una sola vigente", async () => {
      const { error } = await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: v1.versionId, p_change_note: "Primera versión." });
      assert(!error, `publicar: ${error?.message}`);
      const { data } = await normal.cli.from("v_tutorial_current")
        .select("version_id, version_number, duration_seconds, mime_type")
        .eq("page_key", CLAVE_QA).single();
      assert(data, "la versión publicada no se lee");
      assert((data as { version_id: string }).version_id === v1.versionId,
        "se lee otra versión");
      assert((data as { duration_seconds: number }).duration_seconds === 42,
        "se perdió la duración");
    });

    let v2: Awaited<ReturnType<typeof subirVersion>>;

    await check("H. Una versión nueva NO se lleva por delante los bytes de la vieja",
      async () => {
        // Aquí está la trampa que PE-03A avisó: contar filas no demuestra nada.
        // Lo que se puede perder son los bytes, así que se comparan los bytes.
        v2 = await subirVersion(sa.cli, tutorialId, 7);
        assert(v2.hash !== v1.hash, "las dos versiones de prueba salieron idénticas");
        await sa.cli.rpc("tutorial_publish_version",
          { p_version_id: v2.versionId, p_change_note: "Segunda versión." });

        const { data: descargada, error } = await admin.storage.from(BUCKET)
          .download(v1.objectPath);
        assert(!error && descargada, `el objeto de la v1 desapareció: ${error?.message}`);
        const reales = new Uint8Array(await descargada!.arrayBuffer());
        assert(await sha256(reales) === v1.hash,
          "los bytes de la versión anterior CAMBIARON al publicar la nueva");

        // Y su fila conserva el resumen que se calculó entonces.
        const { data: fila } = await sa.cli.from("platform_tutorial_versions")
          .select("content_hash, object_path").eq("id", v1.versionId).single();
        assert((fila as { content_hash: string }).content_hash === v1.hash,
          "el resumen guardado de la v1 cambió");
        assert((fila as { object_path: string }).object_path === v1.objectPath,
          "la ruta de la v1 cambió");
      });

    await check("I. La vieja quedó cerrada, y solo hay una vigente", async () => {
      const { data } = await sa.cli.from("platform_tutorial_versions")
        .select("id, version_number, effective_from, effective_to, superseded_by_version_id")
        .eq("tutorial_id", tutorialId).not("effective_from", "is", null)
        .order("version_number");
      const filas = data as Record<string, unknown>[];
      const vigentes = filas.filter((f) => f.effective_to === null);
      assert(vigentes.length === 1, `hay ${vigentes.length} versiones vigentes`);
      assert(String(vigentes[0].id) === v2.versionId, "la vigente no es la última publicada");
      const vieja = filas.find((f) => String(f.id) === v1.versionId);
      assert(vieja?.effective_to, "la v1 no se cerró al publicar la v2");
      assert(String(vieja?.superseded_by_version_id) === v2.versionId,
        "la v1 no apunta a la que la sucedió");
    });

    // =======================================================================
    console.log("\nJ–L · Reponer, sin falsear la cronología");
    // =======================================================================

    await check("J. Reponer crea una versión NUEVA, no reabre la vieja", async () => {
      // La segunda trampa: ver que hay una versión nueva no demuestra nada. Lo
      // que hay que comprobar es que el periodo antiguo NO se movió.
      const { data: antes } = await sa.cli.from("platform_tutorial_versions")
        .select("effective_from, effective_to").eq("id", v1.versionId).single();
      const cerradoAntes = (antes as { effective_to: string }).effective_to;
      const abiertoAntes = (antes as { effective_from: string }).effective_from;

      const { data: nueva, error } = await sa.cli.rpc("tutorial_restore_version",
        { p_version_id: v1.versionId, p_change_note: null });
      assert(!error && nueva, `reponer: ${error?.message}`);
      const v3 = String(nueva);

      const { data: despues } = await sa.cli.from("platform_tutorial_versions")
        .select("effective_from, effective_to").eq("id", v1.versionId).single();
      assert((despues as { effective_to: string }).effective_to === cerradoAntes,
        "REPONER REABRIÓ el periodo de la versión antigua");
      assert((despues as { effective_from: string }).effective_from === abiertoAntes,
        "reponer movió el inicio de vigencia de la versión antigua");

      const { data: fila } = await sa.cli.from("platform_tutorial_versions")
        .select("restored_from_version_id, content_hash, object_path, version_number, effective_from")
        .eq("id", v3).single();
      const f = fila as Record<string, unknown>;
      assert(String(f.restored_from_version_id) === v1.versionId,
        "la versión repuesta no dice de cuál viene");
      assert(String(f.content_hash) === v1.hash, "la repuesta no lleva el mismo vídeo");
      assert(String(f.object_path) === v1.objectPath,
        "la repuesta apunta a otro objeto: se duplicaron los bytes");
      // El número no se escribe a mano: la reserva de la comprobación F también
      // consumió uno, y fijar un 3 aquí convertiría eso en un fallo.
      const { data: maxima } = await sa.cli.from("platform_tutorial_versions")
        .select("version_number").eq("tutorial_id", tutorialId)
        .order("version_number", { ascending: false }).limit(1).single();
      assert(Number(f.version_number) === Number((maxima as { version_number: number }).version_number),
        "la versión repuesta no es la última: se reutilizó un número");
      assert(f.effective_from === null, "reponer publicó sola la versión repuesta");
    });

    await check("K. Y la historia se lee como lo que pasó", async () => {
      const { data } = await sa.cli.from("platform_tutorial_versions")
        .select("version_number, effective_from, effective_to, restored_from_version_id, content_hash")
        .eq("tutorial_id", tutorialId).not("effective_from", "is", null)
        .order("version_number");
      const publicadas = data as Record<string, unknown>[];
      assert(publicadas.length === 2, `hay ${publicadas.length} versiones publicadas`);
      // v1 cerrada, v2 abierta. Sin huecos ni solapes.
      assert(publicadas[0].effective_to !== null, "la primera sigue abierta");
      assert(publicadas[1].effective_to === null, "la segunda no es la vigente");
      assert(String(publicadas[0].effective_to) <= String(publicadas[1].effective_from),
        "los periodos se solapan");
    });

    await check("L. Una versión publicada no se borra ni se reescribe", async () => {
      // Ni siquiera con el cliente administrativo: es un disparador, no una
      // política, y por eso `service_role` tampoco pasa.
      const { error: eBorrar } = await admin.from("platform_tutorial_versions")
        .delete().eq("id", v1.versionId);
      assert(eBorrar, "se pudo borrar una versión publicada");

      const { error: eRuta } = await admin.from("platform_tutorial_versions")
        .update({ object_path: `${tutorialId}/otro/x.mp4` }).eq("id", v1.versionId);
      assert(eRuta, "se pudo cambiar la ruta de una versión publicada");

      const { error: eHash } = await admin.from("platform_tutorial_versions")
        .update({ content_hash: "0".repeat(64) }).eq("id", v1.versionId);
      assert(eHash, "se pudo cambiar el resumen de una versión publicada");

      const { error: eReabrir } = await admin.from("platform_tutorial_versions")
        .update({ effective_to: null }).eq("id", v1.versionId);
      assert(eReabrir, "se pudo REABRIR el periodo de una versión histórica");
    });

    // =======================================================================
    console.log("\nM–O · Retirar, y lo que ve una persona normal");
    // =======================================================================

    await check("M. Retirar deja de mostrar, y no borra nada", async () => {
      const { error } = await sa.cli.rpc("tutorial_unpublish", { p_tutorial_id: tutorialId });
      assert(!error, `retirar: ${error?.message}`);
      const { data: vista } = await normal.cli.from("v_tutorial_current")
        .select("version_id").eq("page_key", CLAVE_QA);
      assert(!vista || vista.length === 0, "el tutorial retirado se sigue viendo");
      const { count } = await sa.cli.from("platform_tutorial_versions")
        .select("id", { count: "exact", head: true }).eq("tutorial_id", tutorialId);
      assert((count ?? 0) >= 3, `retirar se llevó versiones: quedan ${count}`);
    });

    await check("N. Una persona normal no lee las tablas de plataforma", async () => {
      const { data: t } = await normal.cli.from("platform_tutorials").select("id");
      assert(!t || t.length === 0, `una persona normal lee ${t?.length} tutoriales`);
      const { data: v } = await normal.cli.from("platform_tutorial_versions").select("id");
      assert(!v || v.length === 0, `una persona normal lee ${v?.length} versiones`);
    });

    await check("O. Ni puede crear ni publicar nada", async () => {
      const { data, error } = await normal.cli.from("platform_tutorials")
        .insert({ tutorial_type: "page", page_key: "quality.risks",
                  module_key: "quality", title: "Intruso" }).select("id");
      // La RLS puede devolver error o cero filas; las dos son negativas.
      assert(error || !data || data.length === 0,
        "una persona normal creó un tutorial de plataforma");
      const { error: ePub } = await normal.cli.rpc("tutorial_publish_version",
        { p_version_id: v1.versionId, p_change_note: null });
      assert(ePub, "una persona normal pudo publicar");
    });
  } finally {
    // Se retira lo subido. Una suite que sube archivos y no limpia deja el cubo
    // creciendo en cada ejecución.
    if (objetosCreados.length > 0) {
      await admin.storage.from(BUCKET).remove(objetosCreados);
    }
    await admin.from("platform_tutorial_versions").delete().eq("tutorial_id", tutorialId)
      .is("effective_from", null);
    // Las publicadas no se pueden borrar —y así debe ser—, así que el tutorial
    // de prueba se retira en vez de eliminarse.
    // Se retira, no se borra: una versión publicada no se puede eliminar, y eso
    // es exactamente lo que este tramo promete. Retirado no se ve en ninguna
    // parte, porque la vista del producto exige `status = 'active'`.
    await admin.from("platform_tutorials")
      .update({ status: "retired" }).eq("id", tutorialId);
  }

  console.log(`\nPE-03B1 · tutoriales: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
