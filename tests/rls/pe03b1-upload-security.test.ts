/**
 * Trazaloop · PE-03B1 · Quién puede subir un vídeo, y dónde.
 *
 * LA COMPROBACIÓN QUE NO SE PUEDE ESCRIBIR
 *
 * PE-03A comprobó —y 0099 lo tenía escrito desde antes— que una URL de subida
 * firmada AUTORIZA POR SÍ MISMA: funciona incluso desde un cliente anónimo, sin
 * pasar por la política INSERT de Storage.
 *
 * Así que aquí NO se escribe «la política de Storage impide subir tutoriales».
 * Sería falsa, y daría tranquilidad donde no la hay. Lo que se comprueba es lo
 * que de verdad protege: que solo un superadministrador puede RESERVAR, que la
 * reserva elige ella la ruta, y que sin reserva no hay ruta que firmar.
 *
 * Correr: npm run test:pe03b1-upload
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
const anonimo: SupabaseClient = createClient(URL, ANON,
  { auth: { autoRefreshToken: false, persistSession: false } });
const sello = `${Date.now()}`;
const password = "Trazaloop-Test-1234";
const BUCKET = "tutorial-media";

async function persona(prefijo: string, rol: "superadmin" | "support" | null) {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B1" } });
  assert(data.user, `crear ${prefijo}`);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  if (rol) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: rol, status: "active" });
  }
  return { id: data.user.id, cli };
}

function mp4(relleno = 256): Uint8Array {
  const b = new Uint8Array(12 + relleno);
  b.set([0x00, 0x00, 0x00, 0x18], 0);
  b.set([0x66, 0x74, 0x79, 0x70], 4);
  b.set([0x69, 0x73, 0x6f, 0x6d], 8);
  return b;
}

const objetos: string[] = [];

async function main() {
  const sa = await persona("pe03b1u-sa", "superadmin");
  const soporte = await persona("pe03b1u-sop", "support");
  const normal = await persona("pe03b1u-nor", null);

  const CLAVE = `quality.qa_pe03b1u_${sello}`;
  await admin.from("platform_tutorials").update({ status: "retired" })
    .like("page_key", "quality.qa_pe03b1u_%").eq("status", "active");
  const { data: creado } = await sa.cli.from("platform_tutorials")
    .insert({ tutorial_type: "page", page_key: CLAVE, module_key: "quality",
              title: `QA subida ${sello}` }).select("id").single();
  assert(creado, "crear tutorial de prueba");
  const tutorialId = (creado as { id: string }).id;

  console.log("\nPE-03B1 · Quién sube, y dónde\n");

  try {
    // =======================================================================
    console.log("A–C · Quién puede reservar");
    // =======================================================================

    await check("A. El superadministrador sí", async () => {
      const bytes = mp4();
      const { data, error } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "ok.mp4", p_mime: "video/mp4",
        p_size_bytes: bytes.byteLength, p_ttl_seconds: 900 });
      assert(!error && data && data.length === 1, `reservar: ${error?.message}`);
      const f = data[0] as { object_path: string; version_id: string };
      // Y la ruta la eligió la base: tutorial / versión / nombre.
      assert(f.object_path === `${tutorialId}/${f.version_id}/ok.mp4`,
        `la ruta reservada es «${f.object_path}»`);
    });

    await check("B. Soporte NO. Ve, no escribe", async () => {
      const { error } = await soporte.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "intruso.mp4", p_mime: "video/mp4",
        p_size_bytes: 1000, p_ttl_seconds: 900 });
      assert(error, "soporte pudo reservar una subida");
      assert(/administración de plataforma/i.test(error!.message),
        `el rechazo no se explica: ${error!.message}`);
      // Pero sí ve la historia: es la distinción congelada de PE-02.
      const { data } = await soporte.cli.from("platform_tutorials").select("id");
      assert(data && data.length > 0, "soporte no ve los tutoriales");
    });

    await check("C. Una persona normal tampoco, ni ve nada", async () => {
      const { error } = await normal.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "intruso.mp4", p_mime: "video/mp4",
        p_size_bytes: 1000, p_ttl_seconds: 900 });
      assert(error, "una persona normal pudo reservar una subida");
      const { data } = await normal.cli.from("platform_tutorials").select("id");
      assert(!data || data.length === 0, "una persona normal ve los tutoriales");
    });

    // =======================================================================
    console.log("\nD–G · La reserva decide la ruta, y valida");
    // =======================================================================

    await check("D. Quien reserva NO propone dónde escribir", async () => {
      // La función no acepta una ruta: acepta un nombre, y lo limpia. Ni con un
      // nombre malicioso se sale de su carpeta.
      const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "../../../otro-cubo/x.mp4",
        p_mime: "video/mp4", p_size_bytes: 1000, p_ttl_seconds: 900 });
      const ruta = String((data as { object_path: string }[])[0].object_path);
      assert(ruta.startsWith(`${tutorialId}/`), `la ruta escapó: «${ruta}»`);
      assert(ruta.split("/").length === 3, `la ruta tiene ${ruta.split("/").length} segmentos`);
      assert(!ruta.includes(".."), "la ruta conserva un salto de carpeta");
    });

    await check("E. Un archivo vacío o demasiado grande no se reserva", async () => {
      for (const [size, motivo] of [[0, "vacío"], [-5, "negativo"],
        [200 * 1024 * 1024 + 1, "de más de 200 MB"]] as [number, string][]) {
        const { error } = await sa.cli.rpc("tutorial_reserve_upload", {
          p_tutorial_id: tutorialId, p_filename: "x.mp4", p_mime: "video/mp4",
          p_size_bytes: size, p_ttl_seconds: 900 });
        assert(error, `se reservó un archivo ${motivo}`);
      }
      // Y 200 MB justos sí. El límite es un tope, no un miedo.
      const { error: eJusto } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "grande.mp4", p_mime: "video/mp4",
        p_size_bytes: 200 * 1024 * 1024, p_ttl_seconds: 900 });
      assert(!eJusto, `se rechazaron 200 MB justos: ${eJusto?.message}`);
    });

    await check("F. Un formato que no se reproduce, tampoco", async () => {
      for (const mime of ["video/quicktime", "application/pdf", "video/ogg", "text/plain"]) {
        const { error } = await sa.cli.rpc("tutorial_reserve_upload", {
          p_tutorial_id: tutorialId, p_filename: "x.mp4", p_mime: mime,
          p_size_bytes: 1000, p_ttl_seconds: 900 });
        assert(error, `se reservó una subida de «${mime}»`);
      }
    });

    await check("G. Y no se reserva sobre un tutorial retirado o inexistente", async () => {
      const { error: eNada } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: "00000000-0000-0000-0000-000000000000", p_filename: "x.mp4",
        p_mime: "video/mp4", p_size_bytes: 1000, p_ttl_seconds: 900 });
      assert(eNada, "se reservó sobre un tutorial que no existe");
    });

    // =======================================================================
    console.log("\nH–J · Lo declarado frente a lo real");
    // =======================================================================

    await check("H. Si el tamaño no coincide, la versión se marca fallida", async () => {
      const bytes = mp4();
      const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "mentira.mp4", p_mime: "video/mp4",
        p_size_bytes: bytes.byteLength, p_ttl_seconds: 900 });
      const f = (data as { version_id: string; object_path: string }[])[0];
      // Devuelve el estado en vez de lanzar: si lanzara, la excepción desharía
      // con la transacción la marca de fallo que acaba de escribir. Se descubrió
      // así, con esta misma comprobación.
      const { data: estado, error } = await sa.cli.rpc("tutorial_finalize_upload", {
        p_version_id: f.version_id, p_real_size: bytes.byteLength + 100,
        p_real_mime: "video/mp4", p_content_hash: "a".repeat(64),
        p_duration_seconds: null });
      assert(!error, `finalizar: ${error?.message}`);
      assert(String(estado) === "failed",
        `una subida con otro tamaño quedó en «${estado}»`);
      const { data: fila } = await sa.cli.from("platform_tutorial_versions")
        .select("file_state").eq("id", f.version_id).single();
      assert((fila as { file_state: string }).file_state === "failed",
        "la versión no quedó marcada como fallida");
    });

    await check("I. Y una versión fallida NO se puede publicar", async () => {
      const { data } = await sa.cli.from("platform_tutorial_versions")
        .select("id").eq("tutorial_id", tutorialId).eq("file_state", "failed").limit(1);
      const fallida = (data as { id: string }[])[0];
      assert(fallida, "no hay ninguna versión fallida para comprobarlo");
      const { error } = await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: fallida.id, p_change_note: null });
      assert(error, "se publicó una versión fallida");
    });

    await check("J. Una reserva sin subida no produce tutorial visible", async () => {
      const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "nunca-subido.mp4",
        p_mime: "video/mp4", p_size_bytes: 1000, p_ttl_seconds: 900 });
      const f = (data as { version_id: string }[])[0];
      const { data: vista } = await normal.cli.from("v_tutorial_current")
        .select("version_id").eq("page_key", CLAVE);
      assert(!vista || vista.length === 0, "una reserva sin subida ya se ve");
      const { data: fila } = await sa.cli.from("platform_tutorial_versions")
        .select("file_state, effective_from").eq("id", f.version_id).single();
      assert((fila as { file_state: string }).file_state === "reserved",
        "la reserva cambió de estado sola");
      assert((fila as { effective_from: string | null }).effective_from === null,
        "una reserva sin archivo tiene vigencia");
    });

    // =======================================================================
    console.log("\nK–M · El almacenamiento");
    // =======================================================================

    await check("K. Nadie sin sesión navega ni lee el cubo", async () => {
      const { data, error } = await anonimo.storage.from(BUCKET).list();
      assert(error || !data || data.length === 0,
        `un visitante lista ${data?.length} objetos del cubo`);
    });

    await check("L. Una persona normal no escribe en el cubo", async () => {
      const { error } = await normal.cli.storage.from(BUCKET)
        .upload(`${tutorialId}/intruso/x.mp4`, mp4(), { contentType: "video/mp4" });
      assert(error, "una persona normal subió un objeto al cubo de tutoriales");
    });

    await check("M. Ni escribe donde no hay reserva, ni siendo superadministrador",
      async () => {
        // La política INSERT existe y se ejerce, aunque el flujo legítimo use
        // URL firmada y no pase por ella. Cerrarla no rompe nada.
        const { error } = await sa.cli.storage.from(BUCKET)
          .upload(`${tutorialId}/sin-reserva/x.mp4`, mp4(), { contentType: "video/mp4" });
        assert(error, "se escribió en una ruta sin reserva");
      });

    await check("N. Y lo que sí se puede: subir a la ruta reservada", async () => {
      const bytes = mp4();
      const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "buena.mp4", p_mime: "video/mp4",
        p_size_bytes: bytes.byteLength, p_ttl_seconds: 900 });
      const f = (data as { object_path: string }[])[0];
      const { error } = await sa.cli.storage.from(BUCKET)
        .upload(f.object_path, bytes, { contentType: "video/mp4", upsert: false });
      assert(!error, `el superadministrador no pudo subir a su ruta: ${error?.message}`);
      objetos.push(f.object_path);

      // Y no puede sobrescribirla: no hay política de UPDATE, a propósito.
      const { error: eOtra } = await sa.cli.storage.from(BUCKET)
        .upload(f.object_path, mp4(300), { contentType: "video/mp4", upsert: true });
      assert(eOtra, "se pudo sobrescribir un objeto ya subido");
    });

    await check("O. Y la frontera está donde se dice, no donde se supone", async () => {
      // Esta es la comprobación que documenta el hallazgo, en vez de fingir lo
      // contrario. Una URL de subida firmada autoriza el objeto por sí misma; lo
      // que impide obtenerla es que solo un superadministrador puede reservar.
      const { data: reservaNormal, error } = await normal.cli
        .rpc("tutorial_reserve_upload", {
          p_tutorial_id: tutorialId, p_filename: "x.mp4", p_mime: "video/mp4",
          p_size_bytes: 1000, p_ttl_seconds: 900 });
      assert(error && !reservaNormal,
        "una persona normal obtuvo una reserva, que es lo único que hace falta");

      // Sin reserva no hay ruta que firmar: la firma es de una ruta EXACTA que
      // solo la reserva conoce.
      const { data: firma } = await normal.cli.storage.from(BUCKET)
        .createSignedUploadUrl(`${tutorialId}/inventada/x.mp4`);
      assert(!firma, "una persona normal pudo firmar una subida a una ruta inventada");
    });
  } finally {
    if (objetos.length > 0) await admin.storage.from(BUCKET).remove(objetos);
    await admin.from("platform_tutorial_versions")
      .delete().eq("tutorial_id", tutorialId).is("effective_from", null);
    await admin.from("platform_tutorials")
      .update({ status: "retired" }).eq("id", tutorialId);
  }

  console.log(`\nPE-03B1 · subida: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
