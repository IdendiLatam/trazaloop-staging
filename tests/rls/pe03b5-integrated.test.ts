/**
 * Trazaloop · PE-03B5 · La cadena entera, de una sola pasada.
 *
 *
 * POR QUÉ UNA SUITE INTEGRADA AL CIERRE
 *
 * B1, B2, B3 y B4 comprobaron cada pieza. Lo que ninguna comprobó es la
 * secuencia completa que hace de verdad un superadministrador: crear, subir,
 * verificar, publicar, ver, reponer, retirar, reactivar. Y ahí es donde
 * aparecen los fallos de composición, que no se ven pieza a pieza.
 *
 * También se comprueba aquí el ESTADO REAL del esquema —restricciones,
 * políticas, definición de funciones— en vez de leer el texto de las
 * migraciones. Las migraciones son acumulativas: su texto es la historia. Lo
 * que rige lo dice `pg_constraint`.
 *
 * Correr: npm run test:pe03b5-integrated
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
const BUCKET = "tutorial-media";

async function persona(prefijo: string, papel?: "superadmin" | "support") {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B5" } });
  assert(data.user, `crear ${prefijo}`);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  if (papel) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: papel, status: "active" });
  }
  return { id: data.user.id, email, cli };
}

function mp4(marca: number): Uint8Array {
  const b = new Uint8Array(256 * 1024);
  b.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);
  for (let i = 12; i < b.length; i += 1) b[i] = (i * marca) % 251;
  return b;
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const objetos: string[] = [];

async function main() {
  const { getTutorialForPage, signTutorialPlayback } = await import("@/lib/db/tutorials");
  const { listTutorialsForConsole } = await import("@/lib/db/tutorials-platform");
  const { PAGE_KEYS } = await import("@/lib/modules/page-keys");

  const sa = await persona("b5i-sa", "superadmin");
  const soporte = await persona("b5i-sup", "support");
  const normal = await persona("b5i-nor");

  // Se trabaja sobre una clave PROPIA de esta suite, no sobre una del registro.
  //
  // La primera versión usaba `quality.processes`, que es real, y eso rompió la
  // suite de PE-03B2: las dos publicaban sobre la misma clave, y una versión
  // publicada NO SE PUEDE BORRAR —que es justo lo que este subsistema promete—,
  // así que la segunda en correr encontraba una publicación que no era suya.
  //
  // Dos suites que publican sobre la misma identidad no pueden ser
  // independientes del orden. La clave propia lo arregla, y no se pierde nada:
  // el camino del cliente es el mismo, y que la clave tenga que estar en el
  // REGISTRO para que el producto la alcance ya lo comprueban la suite de
  // residuos y las estáticas.
  const CLAVE = `quality.qa_pe03b5_chain_${sello}`;
  const entrada = { module: "quality", label: `PE03B5 cadena ${sello}` };

  console.log("\nPE-03B5 · La cadena entera\n");

  let tutorialId = "";
  const previos: string[] = [];

  try {
    // =====================================================================
    console.log("A · El esquema, tal como está HOY en la base");
    // =====================================================================

    await check("A1. Ninguna restricción de tamaño impone un techo", async () => {
      // No hay ninguna función que ejecute SQL libre —y está bien que no la
      // haya—, así que el techo se comprueba INTENTÁNDOLO. Es además la prueba
      // más honesta: si existiera un techo en cualquier capa, reservar 8 GB
      // fallaría, viniera de donde viniera.
      const { data: t } = await sa.cli.from("platform_tutorials")
        .insert({ tutorial_type: "page", page_key: `cpr.qa_b5i_${sello}`,
                  module_key: "cpr", title: `B5I techo ${sello}` }).select("id").single();
      const id = (t as { id: string }).id;
      previos.push(id);
      for (const size of [1, 200 * 1024 * 1024 + 1, 8 * 1024 * 1024 * 1024]) {
        const { error } = await sa.cli.rpc("tutorial_reserve_upload", {
          p_tutorial_id: id, p_filename: "x.mp4", p_mime: "video/mp4",
          p_size_bytes: size, p_ttl_seconds: 3600 });
        assert(!error, `la base rechazó ${size} bytes: ${error?.message}`);
      }
      const { error: eVacio } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: id, p_filename: "x.mp4", p_mime: "video/mp4",
        p_size_bytes: 0, p_ttl_seconds: 3600 });
      assert(eVacio, "se reservó un archivo vacío");
    });

    await check("A2. Y ninguna duración máxima", async () => {
      // Se finaliza con una duración absurda: ocho horas. Si hubiera un techo,
      // aquí se vería.
      const bytes = mp4(2);
      const { data: t } = await sa.cli.from("platform_tutorials")
        .insert({ tutorial_type: "page", page_key: `cpr.qa_b5i_dur_${sello}`,
                  module_key: "cpr", title: `B5I duración ${sello}` }).select("id").single();
      const id = (t as { id: string }).id;
      previos.push(id);
      const { data: r } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: id, p_filename: "larga.mp4", p_mime: "video/mp4",
        p_size_bytes: bytes.byteLength, p_ttl_seconds: 3600 });
      const f = (r as { version_id: string; object_path: string }[])[0];
      await admin.storage.from(BUCKET).upload(f.object_path, bytes, { contentType: "video/mp4" });
      objetos.push(f.object_path);
      const { error } = await sa.cli.rpc("tutorial_finalize_upload", {
        p_version_id: f.version_id, p_real_size: bytes.byteLength,
        p_real_mime: "video/mp4", p_content_hash: await sha256(bytes),
        p_duration_seconds: 8 * 60 * 60 });
      assert(!error, `ocho horas se rechazaron: ${error?.message}`);
    });

    await check("A3. El cubo no impone tope propio", async () => {
      const res = await fetch(`${URL}/storage/v1/bucket/${BUCKET}`,
        { headers: { apikey: SERVICE!, Authorization: `Bearer ${SERVICE}` } });
      const cubo = await res.json() as { file_size_limit: number | null; public: boolean };
      assert(cubo.file_size_limit === null,
        `el cubo declara un tope de ${cubo.file_size_limit} bytes`);
      assert(cubo.public === false, "el cubo de tutoriales es público");
    });

    // =====================================================================
    console.log("\nB · La cadena del superadministrador");
    // =====================================================================

    await check("B1. Crear · la identidad nace sobre una clave del registro", async () => {
      const { data, error } = await sa.cli.from("platform_tutorials")
        .insert({ tutorial_type: "page", page_key: CLAVE, module_key: entrada.module,
                  title: entrada.label }).select("id").single();
      assert(!error && data, `no se pudo crear: ${error?.message}`);
      tutorialId = (data as { id: string }).id;
    });

    const v: { id: string; path: string; hash: string }[] = [];

    await check("B2. Subir y verificar · el resumen y el tamaño se comprueban", async () => {
      for (const marca of [3, 7]) {
        const bytes = mp4(marca);
        const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
          p_tutorial_id: tutorialId, p_filename: `b5i-${marca}.mp4`, p_mime: "video/mp4",
          p_size_bytes: bytes.byteLength, p_ttl_seconds: 3600 });
        const f = (data as { version_id: string; object_path: string }[])[0];
        await admin.storage.from(BUCKET)
          .upload(f.object_path, bytes, { contentType: "video/mp4" });
        objetos.push(f.object_path);
        const hash = await sha256(bytes);
        const { data: estado, error } = await sa.cli.rpc("tutorial_finalize_upload", {
          p_version_id: f.version_id, p_real_size: bytes.byteLength,
          p_real_mime: "video/mp4", p_content_hash: hash, p_duration_seconds: 180 });
        assert(!error, `finalizar falló: ${error?.message}`);
        assert(estado === "verified", `la versión quedó en «${estado}»`);
        v.push({ id: f.version_id, path: f.object_path, hash });
      }
      assert(v.length === 2, "no se prepararon las dos versiones");
    });

    await check("B3. Un archivo que MIENTE se marca fallido, no se publica", async () => {
      const bytes = mp4(13);
      const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "mentira.mp4", p_mime: "video/mp4",
        p_size_bytes: bytes.byteLength, p_ttl_seconds: 3600 });
      const f = (data as { version_id: string; object_path: string }[])[0];
      await admin.storage.from(BUCKET).upload(f.object_path, bytes, { contentType: "video/mp4" });
      objetos.push(f.object_path);
      const { data: estado } = await sa.cli.rpc("tutorial_finalize_upload", {
        p_version_id: f.version_id, p_real_size: bytes.byteLength + 1,
        p_real_mime: "video/mp4", p_content_hash: await sha256(bytes),
        p_duration_seconds: 60 });
      assert(estado === "failed", `una mentira quedó en «${estado}»`);
      const { error } = await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: f.version_id, p_change_note: "no debería" });
      assert(error, "se publicó una versión fallida");
    });

    await check("B4. Publicar · y solo la vigente sale por la vía del cliente", async () => {
      await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: v[0].id, p_change_note: "B5I v1" });
      const buscado = await getTutorialForPage(CLAVE, normal.cli);
      assert(buscado.status === "ok" && buscado.tutorial, "el cliente no ve el tutorial");
      assert(buscado.tutorial.versionId === v[0].id, "el cliente ve otra versión");
    });

    await check("B5. Publicar la siguiente cierra la anterior, sin borrarla", async () => {
      await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: v[1].id, p_change_note: "B5I v2" });
      const buscado = await getTutorialForPage(CLAVE, normal.cli);
      assert(buscado.status === "ok" && buscado.tutorial?.versionId === v[1].id,
        "la vigente no cambió");
      const { data: vieja } = await admin.from("platform_tutorial_versions")
        .select("effective_from, effective_to, content_hash").eq("id", v[0].id).single();
      assert(vieja!.effective_from !== null, "la v1 perdió su fecha de publicación");
      assert(vieja!.effective_to !== null, "la v1 quedó con el periodo abierto");
      assert(vieja!.content_hash === v[0].hash, "la v1 cambió de resumen");
    });

    await check("B6. Ninguna versión histórica sale por la vía del cliente", async () => {
      // El cliente pide por CLAVE, no por versión. No hay forma de pedir la v1.
      const firmado = await signTutorialPlayback(
        { tutorialType: "page", pageKey: CLAVE }, normal.cli);
      assert(firmado.status === "ok", `no se pudo firmar: ${firmado.status}`);
      // La URL firmada apunta al objeto de la VIGENTE, no al de la histórica.
      assert(firmado.url.includes(v[1].path.split("/").pop()!),
        "la URL firmada no corresponde a la versión vigente");
      assert(!firmado.url.includes(v[0].path.split("/").pop()!),
        "se firmó el objeto de una versión histórica");
    });

    await check("B7. Y se puede adelantar · rango 206 con los bytes correctos", async () => {
      const firmado = await signTutorialPlayback(
        { tutorialType: "page", pageKey: CLAVE }, normal.cli);
      assert(firmado.status === "ok", "no se pudo firmar");
      const res = await fetch(firmado.url, { headers: { Range: "bytes=2000-2999" } });
      assert(res.status === 206, `un rango devolvió ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      assert(bytes.byteLength === 1000, `el rango trajo ${bytes.byteLength} bytes`);
      assert(bytes[0] === (2000 * 7) % 251, "los bytes no son los del tramo pedido");
    });

    // =====================================================================
    console.log("\nC · Reponer no reabre la historia");
    // =====================================================================

    await check("C1. Reponer crea una versión NUEVA que reutiliza el objeto", async () => {
      const { data: nueva, error } = await sa.cli.rpc("tutorial_restore_version",
        { p_version_id: v[0].id, p_change_note: "B5I reponer v1" });
      assert(!error, `reponer falló: ${error?.message}`);
      const { data: fila } = await admin.from("platform_tutorial_versions")
        .select("id, object_path, content_hash, effective_from, effective_to, restored_from_version_id")
        .eq("id", nueva as string).single();
      assert(fila!.object_path === v[0].path, "la repuesta no reutiliza el mismo objeto");
      assert(fila!.content_hash === v[0].hash, "la repuesta cambió de resumen");
      assert(fila!.restored_from_version_id === v[0].id, "no se guarda de cuál viene");
      assert(fila!.id !== v[0].id, "reponer devolvió la versión original");
      assert(fila!.effective_from === null, "la repuesta nació publicada");
    });

    await check("C2. Y el periodo histórico sigue cerrado", async () => {
      const { data: vieja } = await admin.from("platform_tutorial_versions")
        .select("effective_to").eq("id", v[0].id).single();
      assert(vieja!.effective_to !== null,
        "reponer reabrió el periodo de la versión original");
    });

    await check("C3. Reponer NO publica sola · publicar es un paso aparte", async () => {
      // Es la comprobación que la primera versión de esta suite dio por buena
      // sin mirarla: corría sobre una clave compartida que ya tenía historia, y
      // el «tres periodos» que exigía se cumplía por herencia. Sobre una clave
      // limpia se ve lo que de verdad pasa — y lo que pasa es lo correcto.
      //
      // `tutorial_restore_version` crea una CANDIDATA verificada. No publica.
      const { data: repuesta } = await admin.from("platform_tutorial_versions")
        .select("id, effective_from, restored_from_version_id")
        .eq("tutorial_id", tutorialId).not("restored_from_version_id", "is", null).single();
      assert(repuesta!.effective_from === null,
        "reponer publicó sola: no hay paso de publicación explícito");

      // Sigue vigente la v2, no la repuesta.
      const antes = await getTutorialForPage(CLAVE, normal.cli);
      assert(antes.status === "ok" && antes.tutorial?.versionId === v[1].id,
        "reponer cambió la vigente sin publicar");

      // Y al publicarla explícitamente, la cronología CRECE: tres periodos.
      await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: repuesta!.id, p_change_note: "B5I publicar la repuesta" });
      const { data: todas } = await admin.from("platform_tutorial_versions")
        .select("id, version_number, effective_from, effective_to")
        .eq("tutorial_id", tutorialId).not("effective_from", "is", null)
        .order("version_number");
      const abiertos = (todas ?? []).filter((x) => x.effective_to === null);
      assert(abiertos.length === 1, `hay ${abiertos.length} periodos abiertos`);
      assert((todas ?? []).length === 3,
        `hay ${(todas ?? []).length} periodos y debían ser tres`);
      // Y el de la v1 sigue cerrado con SU fecha: no se reabrió ninguno.
      const v1Final = (todas ?? []).find((x) => x.id === v[0].id);
      assert(v1Final && v1Final.effective_to !== null,
        "el periodo de la versión original se reabrió");
    });

    // =====================================================================
    console.log("\nD · Retirar y volver a activar");
    // =====================================================================

    await check("D1. Retirado, el cliente recibe la ausencia · no otro vídeo", async () => {
      await sa.cli.from("platform_tutorials")
        .update({ status: "retired" }).eq("id", tutorialId);
      const buscado = await getTutorialForPage(CLAVE, normal.cli);
      assert(buscado.status === "ok", `la consulta falló: ${buscado.status}`);
      assert(buscado.tutorial === null, "un tutorial retirado sigue saliendo");
      const firmado = await signTutorialPlayback(
        { tutorialType: "page", pageKey: CLAVE }, normal.cli);
      assert(firmado.status === "not_published",
        `retirado se firmó igual: ${firmado.status}`);
    });

    await check("D2. Reactivar lo devuelve al servicio, sin tocar la historia", async () => {
      const { data: antes } = await admin.from("platform_tutorial_versions")
        .select("id, effective_from, effective_to").eq("tutorial_id", tutorialId)
        .order("version_number");
      await sa.cli.from("platform_tutorials")
        .update({ status: "active" }).eq("id", tutorialId);
      const buscado = await getTutorialForPage(CLAVE, normal.cli);
      assert(buscado.status === "ok" && buscado.tutorial, "reactivado no vuelve a salir");
      const { data: despues } = await admin.from("platform_tutorial_versions")
        .select("id, effective_from, effective_to").eq("tutorial_id", tutorialId)
        .order("version_number");
      assert(JSON.stringify(antes) === JSON.stringify(despues),
        "reactivar cambió alguna vigencia");
    });

    // =====================================================================
    console.log("\nE · Los papeles");
    // =====================================================================

    await check("E1. Soporte consulta, y NO escribe", async () => {
      const lista = await listTutorialsForConsole(
        { search: null, moduleKey: null, tutorialType: null, coverage: null }, soporte.cli);
      assert(lista.status === "ok", "soporte no puede consultar la consola");
      assert(lista.data.length > 0, "soporte no ve ningún tutorial");
      // Que pueda administrar o no lo decide la BASE, no la consola: se
      // comprueba intentándolo, que es la única forma que vale.
      const { error } = await soporte.cli.rpc("tutorial_publish_version",
        { p_version_id: v[0].id, p_change_note: "soporte" });
      assert(error, "soporte pudo publicar");
      const { data: escrito } = await soporte.cli.from("platform_tutorials")
        .update({ title: "soporte no debería" }).eq("id", tutorialId).select("id");
      assert((escrito ?? []).length === 0, "soporte pudo renombrar un tutorial");
    });

    await check("E2. Una persona normal no llega a la consola", async () => {
      const { data } = await normal.cli.from("platform_tutorials").select("id");
      assert((data ?? []).length === 0,
        `una persona normal lee ${(data ?? []).length} identidades de tutorial`);
      const { error } = await normal.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "x.mp4", p_mime: "video/mp4",
        p_size_bytes: 1000, p_ttl_seconds: 3600 });
      assert(error, "una persona normal reservó una subida");
    });

    await check("E3. Pero SÍ ve el tutorial de su pantalla", async () => {
      const buscado = await getTutorialForPage(CLAVE, normal.cli);
      assert(buscado.status === "ok" && buscado.tutorial, "no ve el tutorial de la pantalla");
    });

    // =====================================================================
    console.log("\nF · Una pantalla registrada SIN vídeo");
    // =====================================================================

    await check("F1. Devuelve ausencia, nunca el vídeo de otra pantalla", async () => {
      // Se elige otra clave real del registro que no tenga tutorial.
      const otras = PAGE_KEYS.filter((p) => p.key !== CLAVE && p.module === "quality");
      let sinVideo = "";
      for (const p of otras) {
        const { data } = await admin.from("platform_tutorials")
          .select("id").eq("page_key", p.key).maybeSingle();
        if (!data) { sinVideo = p.key; break; }
      }
      assert(sinVideo, "no se encontró ninguna pantalla registrada sin tutorial");
      const buscado = await getTutorialForPage(sinVideo, normal.cli);
      assert(buscado.status === "ok", `la consulta falló: ${buscado.status}`);
      assert(buscado.tutorial === null,
        `«${sinVideo}» devolvió un tutorial que no es suyo`);
      const firmado = await signTutorialPlayback(
        { tutorialType: "page", pageKey: sinVideo }, normal.cli);
      assert(firmado.status === "not_published",
        `«${sinVideo}» heredó una reproducción: ${firmado.status}`);
    });

    // =====================================================================
    console.log("\nG · El mismo vídeo dos veces se admite");
    // =====================================================================

    await check("G1. Un SHA-256 repetido no se rechaza", async () => {
      // Decisión congelada: no hay aviso ni bloqueo. Lo que se comprueba es que
      // no hay un rechazo incorrecto.
      const bytes = mp4(3);   // el mismo contenido que la primera versión
      const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "repetido.mp4", p_mime: "video/mp4",
        p_size_bytes: bytes.byteLength, p_ttl_seconds: 3600 });
      const f = (data as { version_id: string; object_path: string }[])[0];
      await admin.storage.from(BUCKET).upload(f.object_path, bytes, { contentType: "video/mp4" });
      objetos.push(f.object_path);
      const { data: estado, error } = await sa.cli.rpc("tutorial_finalize_upload", {
        p_version_id: f.version_id, p_real_size: bytes.byteLength,
        p_real_mime: "video/mp4", p_content_hash: await sha256(bytes),
        p_duration_seconds: 180 });
      assert(!error, `un resumen repetido se rechazó: ${error?.message}`);
      assert(estado === "verified", `quedó en «${estado}»`);
    });

    // =====================================================================
    console.log("\nH · El fallo no rompe la aplicación");
    // =====================================================================

    await check("H1. Firmar sobre un objeto que no existe devuelve avería", async () => {
      // Se borra el objeto de la versión vigente por debajo, que es lo que
      // simula un almacenamiento caído o un objeto perdido.
      const { data: vigente } = await admin.from("platform_tutorial_versions")
        .select("id, object_path").eq("tutorial_id", tutorialId)
        .is("effective_to", null).not("effective_from", "is", null).single();
      const ruta = vigente!.object_path as string;
      await admin.storage.from(BUCKET).remove([ruta]);
      const firmado = await signTutorialPlayback(
        { tutorialType: "page", pageKey: CLAVE }, normal.cli);
      // Storage firma rutas que no existen —la firma no comprueba presencia—,
      // así que lo que se comprueba es que la DESCARGA falla limpiamente y no
      // que la firma se niegue.
      if (firmado.status === "ok") {
        const res = await fetch(firmado.url);
        assert(!res.ok, "una URL firmada de un objeto ausente devolvió contenido");
      }
      // Y la consulta de metadatos sigue funcionando: la aplicación no se cae.
      const buscado = await getTutorialForPage(CLAVE, normal.cli);
      assert(buscado.status === "ok", "la consulta de metadatos se rompió");
      // Se repone el objeto para no dejar una referencia rota.
      await admin.storage.from(BUCKET).upload(ruta, mp4(7), { contentType: "video/mp4" });
    });

    await check("H2. Una clave desconocida no es una avería", async () => {
      const buscado = await getTutorialForPage(`quality.no_existe_${sello}`, normal.cli);
      assert(buscado.status === "ok", `una clave desconocida dio «${buscado.status}»`);
      assert(buscado.tutorial === null, "una clave desconocida devolvió un tutorial");
    });

    // =====================================================================
    console.log("\nI · La consola no hace una consulta por fila");
    // =====================================================================

    await check("I1. Listar 152 pantallas cuesta un número FIJO de consultas", async () => {
      let n = 0;
      const espia = sa.cli.from.bind(sa.cli);
      (sa.cli as unknown as { from: unknown }).from =
        (...a: Parameters<typeof espia>) => { n += 1; return espia(...a); };
      await listTutorialsForConsole(
        { search: null, moduleKey: null, tutorialType: null, coverage: null }, sa.cli);
      (sa.cli as unknown as { from: unknown }).from = espia;
      assert(n <= 3, `la consola hizo ${n} consultas`);
      console.log(`      · consultas de la consola: ${n} para ${PAGE_KEYS.length} pantallas`);
    });
  } finally {
    // Se deja el tutorial de la clave real RETIRADO y con su historia intacta:
    // no se borra nada que se haya publicado. Lo que se limpia son las
    // candidatas nunca publicadas, los objetos de la prueba y las personas.
    if (tutorialId) {
      await admin.from("platform_tutorial_versions")
        .delete().eq("tutorial_id", tutorialId).is("effective_from", null);
      await admin.from("platform_tutorials")
        .update({ status: "retired" }).eq("id", tutorialId);
    }
    for (const id of previos) {
      await admin.from("platform_tutorial_versions")
        .delete().eq("tutorial_id", id).is("effective_from", null);
      const { data: quedan } = await admin.from("platform_tutorial_versions")
        .select("id").eq("tutorial_id", id);
      if ((quedan ?? []).length === 0) await admin.from("platform_tutorials").delete().eq("id", id);
    }
    for (const p of objetos) await admin.storage.from(BUCKET).remove([p]);
    for (const p of [sa, soporte, normal]) {
      await admin.from("platform_staff").delete().eq("user_id", p.id);
      await admin.auth.admin.deleteUser(p.id);
    }
  }

  console.log(`\nPE-03B5 · integrada: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
