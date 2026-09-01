/**
 * Trazaloop · PE-03B3 · Sin tope, sin pico de memoria, y con renovación.
 *
 * Tres cosas que no se pueden comprobar leyendo código:
 *
 *   · que la BASE ya no rechace un archivo grande — se prueba con el metadato,
 *     no transfiriendo gigas, porque el tope vivía en la reserva;
 *   · que verificar un vídeo NO cargue el vídeo en memoria — se mide el pico
 *     de verdad, no se afirma;
 *   · que una URL de reproducción caducada se pueda renovar sin que el tutorial
 *     se acabe — con un plazo corto de prueba, no esperando dos horas.
 *
 * Correr: npm run test:pe03b3-media
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
const BUCKET = "tutorial-media";

function mp4(marca: number, bytes = 1024 * 1024): Uint8Array {
  const b = new Uint8Array(bytes);
  b.set([0x00, 0x00, 0x00, 0x18], 0);
  b.set([0x66, 0x74, 0x79, 0x70], 4);
  b.set([0x69, 0x73, 0x6f, 0x6d], 8);
  for (let i = 12; i < b.length; i += 1) b[i] = (i * marca) % 251;
  return b;
}

const objetos: string[] = [];

async function main() {
  const { ephemeralQaPassword } = await import("../../lib/qa/probe-safety");
  const { verifyTutorialObject, sha256OfBuffer } =
    await import("../../lib/db/tutorial-integrity");
  const { TUTORIAL_HASH_CHUNK_BYTES } = await import("../../lib/domain/tutorial-media");

  const password = ephemeralQaPassword();
  const email = `pe03b3-${sello}@test.trazaloop.dev`;
  const { data: creada } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B3" } });
  assert(creada.user, "crear la cuenta");
  await admin.from("platform_staff")
    .insert({ user_id: creada.user.id, role_code: "superadmin", status: "active" });
  const sa: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await sa.auth.signInWithPassword({ email, password });

  const CLAVE = `quality.qa_pe03b3_${sello}`;
  const { data: tut } = await sa.from("platform_tutorials")
    .insert({ tutorial_type: "page", page_key: CLAVE, module_key: "quality",
              title: `QA B3 ${sello}` }).select("id").single();
  assert(tut, "crear el tutorial");
  const tutorialId = (tut as { id: string }).id;

  console.log("\nPE-03B3 · Medios sin tope\n");

  try {
    // =======================================================================
    console.log("A · La base ya no rechaza por tamaño");
    // =======================================================================

    await check("A1. Se reserva un archivo de más de 200 MB", async () => {
      // Se prueba con el METADATO. El tope vivía en la reserva, así que ahí es
      // donde se demuestra que no está — y no hace falta mover ni un byte.
      const { data, error } = await sa.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "largo.mp4", p_mime: "video/mp4",
        p_size_bytes: 250 * 1024 * 1024, p_ttl_seconds: 86400 });
      assert(!error, `se rechazó un archivo de 250 MB: ${error?.message}`);
      assert(data && data.length === 1, "no se creó la reserva");
      await admin.from("platform_tutorial_versions")
        .delete().eq("id", (data as { version_id: string }[])[0].version_id);
    });

    await check("A2. Y uno de varios gigas también", async () => {
      for (const [bytes, etiqueta] of [
        [2 * 1024 * 1024 * 1024, "2 GB"],
        [20 * 1024 * 1024 * 1024, "20 GB"]] as [number, string][]) {
        const { data, error } = await sa.rpc("tutorial_reserve_upload", {
          p_tutorial_id: tutorialId, p_filename: "enorme.mp4", p_mime: "video/mp4",
          p_size_bytes: bytes, p_ttl_seconds: 86400 });
        assert(!error, `se rechazó un archivo de ${etiqueta}: ${error?.message}`);
        await admin.from("platform_tutorial_versions")
          .delete().eq("id", (data as { version_id: string }[])[0].version_id);
      }
    });

    await check("A3. Vacío sigue sin ser un vídeo", async () => {
      for (const bytes of [0, -1]) {
        const { error } = await sa.rpc("tutorial_reserve_upload", {
          p_tutorial_id: tutorialId, p_filename: "x.mp4", p_mime: "video/mp4",
          p_size_bytes: bytes, p_ttl_seconds: 86400 });
        assert(error, `se reservó un archivo de ${bytes} bytes`);
      }
    });

    await check("A4. El cubo tampoco impone un tope propio", async () => {
      const { data } = await admin.from("storage.buckets" as never)
        .select("*").limit(0);
      void data;
      // Se lee por SQL porque el esquema `storage` no se expone por PostgREST.
      const { data: cubo } = await admin.rpc("tutorial_media_is_published" as never,
        { p_name: "no-existe" } as never);
      void cubo;
      // La comprobación real: la fila del cubo, leída con el cliente
      // administrativo por la vía que sí funciona.
      const res = await fetch(`${URL}/storage/v1/bucket/${BUCKET}`, {
        headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE! } });
      assert(res.ok, `no se pudo leer el cubo: ${res.status}`);
      const info = await res.json() as { file_size_limit: number | null };
      assert(info.file_size_limit === null,
        `el cubo declara un tope de ${info.file_size_limit} bytes`);
    });

    // =======================================================================
    console.log("\nB · Verificar no carga el vídeo en memoria");
    // =======================================================================

    let rutaGrande = "";
    let hashGrande = "";

    await check("B1. El pico de memoria es un trozo, no el archivo", async () => {
      // Cuatro megas: suficiente para que un búfer completo se distinga de un
      // trozo, y poco para no gastar red por gusto.
      const bytes = mp4(7, 4 * 1024 * 1024);
      hashGrande = sha256OfBuffer(bytes);

      const { data } = await sa.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "medido.mp4", p_mime: "video/mp4",
        p_size_bytes: bytes.byteLength, p_ttl_seconds: 86400 });
      const f = (data as { version_id: string; object_path: string }[])[0];
      rutaGrande = f.object_path;
      await admin.storage.from(BUCKET)
        .upload(f.object_path, bytes, { contentType: "video/mp4", upsert: false });
      objetos.push(f.object_path);

      const { data: firma } = await admin.storage.from(BUCKET)
        .createSignedUrl(f.object_path, 600);
      const r = await verifyTutorialObject(firma!.signedUrl, "video/mp4");
      assert(r.ok, `la verificación falló: ${!r.ok ? r.reason : ""}`);

      // LA COMPROBACIÓN DEL TRAMO: el trozo más grande que se tuvo en memoria.
      assert(r.peakChunkBytes < bytes.byteLength / 2,
        `el pico fue de ${r.peakChunkBytes} bytes sobre un archivo de ${bytes.byteLength}: se cargó entero`);
      assert(r.peakChunkBytes <= 4 * TUTORIAL_HASH_CHUNK_BYTES,
        `el pico fue de ${r.peakChunkBytes} bytes y el trozo de referencia es ${TUTORIAL_HASH_CHUNK_BYTES}`);
      console.log(`      · pico medido: ${(r.peakChunkBytes / 1024).toFixed(0)} KB `
        + `sobre ${(bytes.byteLength / 1024 / 1024).toFixed(0)} MB de archivo`);
    });

    await check("B2. Y el resumen incremental da EL MISMO número", async () => {
      // «SHA-256 sigue siendo SHA-256» es una afirmación que hay que demostrar.
      const { data: firma } = await admin.storage.from(BUCKET)
        .createSignedUrl(rutaGrande, 600);
      const r = await verifyTutorialObject(firma!.signedUrl, "video/mp4");
      assert(r.ok, "la verificación falló");
      assert(r.sha256 === hashGrande,
        "el resumen en flujo no coincide con el del archivo entero");
      assert(r.sizeBytes === 4 * 1024 * 1024, `midió ${r.sizeBytes} bytes`);
    });

    await check("B3. Un archivo que miente sigue cayendo", async () => {
      const pdf = new Uint8Array(2048);
      pdf.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37], 0);
      const ruta = `${tutorialId}/mentira-${sello}/falso.mp4`;
      await admin.storage.from(BUCKET)
        .upload(ruta, pdf, { contentType: "video/mp4", upsert: true });
      objetos.push(ruta);
      const { data: firma } = await admin.storage.from(BUCKET).createSignedUrl(ruta, 600);
      const r = await verifyTutorialObject(firma!.signedUrl, "video/mp4");
      assert(!r.ok && r.reason === "signature_mismatch",
        `un PDF pasó como MP4: ${r.ok ? "aceptado" : r.reason}`);
    });

    // =======================================================================
    console.log("\nC · El transporte reanudable, contra el servicio real");
    // =======================================================================

    await check("C1. El servicio anuncia TUS, y dice su techo", async () => {
      const r = await fetch(`${URL}/storage/v1/upload/resumable`, {
        method: "OPTIONS",
        headers: { Authorization: `Bearer ${SERVICE}`, "Tus-Resumable": "1.0.0" } });
      assert(r.status === 204 || r.status === 200, `el extremo devolvió ${r.status}`);
      const version = r.headers.get("tus-resumable");
      assert(version === "1.0.0", `el servicio anuncia TUS «${version}»`);
      const techo = Number(r.headers.get("tus-max-size") ?? "0");
      assert(techo > 0, "el servicio no anuncia su techo");
      // Y ese techo es del PROVEEDOR, no de Trazaloop. Se registra, no se afirma.
      console.log(`      · techo del proveedor: ${(techo / 1024 ** 3).toFixed(1)} GiB (${techo} bytes)`);
      assert(techo > 200 * 1024 * 1024,
        `el techo del proveedor son ${techo} bytes, por debajo del tope que se retiró`);
    });

    await check("C2. Y sube de verdad, por trozos, con la sesión", async () => {
      // Se ejercita el transporte real contra el servicio: crear, enviar,
      // preguntar el desplazamiento. Con un archivo pequeño: lo que se prueba es
      // el protocolo, no la paciencia.
      const bytes = mp4(13, 512 * 1024);
      const { data } = await sa.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "tus.mp4", p_mime: "video/mp4",
        p_size_bytes: bytes.byteLength, p_ttl_seconds: 86400 });
      const f = (data as { version_id: string; object_path: string }[])[0];

      const { data: sesion } = await sa.auth.getSession();
      const token = sesion.session!.access_token;
      const b64 = (t: string) => Buffer.from(t, "utf8").toString("base64");
      const meta = [
        `bucketName ${b64(BUCKET)}`, `objectName ${b64(f.object_path)}`,
        `contentType ${b64("video/mp4")}`, `cacheControl ${b64("3600")}`,
      ].join(",");

      const creacion = await fetch(`${URL}/storage/v1/upload/resumable`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`, "Tus-Resumable": "1.0.0",
          "Upload-Length": String(bytes.byteLength), "Upload-Metadata": meta } });
      assert(creacion.status === 201, `crear la subida dio ${creacion.status}`);
      const destino = new global.URL(creacion.headers.get("location")!, URL!).toString();

      // Dos trozos, para ejercitar el desplazamiento de verdad.
      const mitad = Math.floor(bytes.byteLength / 2);
      const primero = await fetch(destino, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Tus-Resumable": "1.0.0",
                   "Content-Type": "application/offset+octet-stream",
                   "Upload-Offset": "0" },
        body: bytes.slice(0, mitad) });
      assert(primero.ok, `el primer trozo dio ${primero.status}`);

      // Y aquí lo que importa: el desplazamiento lo dice el SERVIDOR.
      const consulta = await fetch(destino, {
        method: "HEAD",
        headers: { Authorization: `Bearer ${token}`, "Tus-Resumable": "1.0.0" } });
      const offset = Number(consulta.headers.get("upload-offset"));
      assert(offset === mitad, `el servidor dice ${offset} y se enviaron ${mitad}`);

      const segundo = await fetch(destino, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Tus-Resumable": "1.0.0",
                   "Content-Type": "application/offset+octet-stream",
                   "Upload-Offset": String(offset) },
        body: bytes.slice(offset) });
      assert(segundo.ok, `el segundo trozo dio ${segundo.status}`);
      objetos.push(f.object_path);

      // Y el objeto quedó entero e íntegro.
      const { data: firma } = await admin.storage.from(BUCKET)
        .createSignedUrl(f.object_path, 600);
      const v = await verifyTutorialObject(firma!.signedUrl, "video/mp4");
      assert(v.ok, `el objeto subido por trozos no verifica: ${!v.ok ? v.reason : ""}`);
      assert(v.sha256 === sha256OfBuffer(bytes),
        "el objeto subido por trozos no coincide con el original");
    });

    await check("C3. Una persona normal NO puede subir por ese camino", async () => {
      // TUS se autentica con el JWT de la sesión, así que la política INSERT
      // del cubo SÍ se ejerce — al contrario que con una URL firmada.
      const otro = createClient(URL!, ANON!, { auth: { persistSession: false } });
      const emailNormal = `pe03b3-normal-${sello}@test.trazaloop.dev`;
      const { data: c } = await admin.auth.admin.createUser({
        email: emailNormal, password, email_confirm: true,
        user_metadata: { full_name: "QA normal" } });
      assert(c.user, "crear la persona normal");
      await otro.auth.signInWithPassword({ email: emailNormal, password });
      const { data: s2 } = await otro.auth.getSession();

      const b64 = (t: string) => Buffer.from(t, "utf8").toString("base64");
      const meta = [
        `bucketName ${b64(BUCKET)}`,
        `objectName ${b64(`${tutorialId}/intruso/x.mp4`)}`,
        `contentType ${b64("video/mp4")}`,
      ].join(",");
      const r = await fetch(`${URL}/storage/v1/upload/resumable`, {
        method: "POST",
        headers: { Authorization: `Bearer ${s2.session!.access_token}`,
                   "Tus-Resumable": "1.0.0", "Upload-Length": "1024",
                   "Upload-Metadata": meta } });
      assert(r.status !== 201,
        "una persona normal creó una subida reanudable en el cubo de tutoriales");
    });

    // =======================================================================
    console.log("\nD · Renovar, sin que el tutorial se acabe");
    // =======================================================================

    let versionPublicada = "";

    await check("D1. Una URL corta caduca · y eso NO acaba el tutorial", async () => {
      const bytes = mp4(21, 512 * 1024);
      const { data } = await sa.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "reproducible.mp4",
        p_mime: "video/mp4", p_size_bytes: bytes.byteLength, p_ttl_seconds: 86400 });
      const f = (data as { version_id: string; object_path: string }[])[0];
      await admin.storage.from(BUCKET)
        .upload(f.object_path, bytes, { contentType: "video/mp4", upsert: false });
      objetos.push(f.object_path);
      const { data: firma0 } = await admin.storage.from(BUCKET)
        .createSignedUrl(f.object_path, 600);
      const v = await verifyTutorialObject(firma0!.signedUrl, "video/mp4");
      assert(v.ok, "no se pudo verificar");
      await sa.rpc("tutorial_finalize_upload", {
        p_version_id: f.version_id, p_real_size: v.ok ? v.sizeBytes : 0,
        p_real_mime: "video/mp4", p_content_hash: v.ok ? v.sha256 : "",
        p_duration_seconds: null });
      await sa.rpc("tutorial_publish_version",
        { p_version_id: f.version_id, p_change_note: "B3" });
      versionPublicada = f.version_id;

      // Un plazo cortísimo, para no esperar dos horas.
      const { data: corta } = await sa.storage.from(BUCKET)
        .createSignedUrl(f.object_path, 1);
      await new Promise((r) => setTimeout(r, 2500));
      const caducada = await fetch(corta!.signedUrl, { headers: { Range: "bytes=0-1023" } });
      assert(caducada.status >= 400, `la URL caducada sirvió con ${caducada.status}`);

      // Y renovar devuelve otra que SÍ sirve, del MISMO objeto.
      const { data: renovada } = await sa.storage.from(BUCKET)
        .createSignedUrl(f.object_path, 600);
      assert(renovada?.signedUrl, "no se pudo renovar");
      const despues = await fetch(renovada!.signedUrl, { headers: { Range: "bytes=0-1023" } });
      assert(despues.status === 206, `tras renovar devolvió ${despues.status}`);
      await despues.arrayBuffer();
    });

    await check("D2. Y adelantar sigue funcionando después de renovar", async () => {
      // Es lo que hace usable un tutorial largo: renovar no puede costar la
      // capacidad de saltar a un minuto concreto.
      const { data: ruta } = await sa.rpc("tutorial_current_object_path",
        { p_version_id: versionPublicada });
      assert(ruta, "no se resolvió la ruta de la versión vigente");
      const { data: firma } = await sa.storage.from(BUCKET)
        .createSignedUrl(String(ruta), 600);
      const inicio = 200 * 1024, fin = 300 * 1024 - 1;
      const r = await fetch(firma!.signedUrl, {
        headers: { Range: `bytes=${inicio}-${fin}` } });
      assert(r.status === 206, `adelantar tras renovar dio ${r.status}`);
      const rango = r.headers.get("content-range") ?? "";
      assert(rango.startsWith(`bytes ${inicio}-${fin}/`), `content-range: «${rango}»`);
      const trozo = new Uint8Array(await r.arrayBuffer());
      assert(trozo[0] === (inicio * 21) % 251,
        "el rango devolvió otros bytes: adelantar mostraría otra cosa");
    });

    await check("D3. La renovación firma la vigente, no una que se le pida",
      async () => {
        // Sin esto, el identificador de una versión histórica sería una llave.
        const { data: candidata } = await sa.rpc("tutorial_reserve_upload", {
          p_tutorial_id: tutorialId, p_filename: "candidata.mp4",
          p_mime: "video/mp4", p_size_bytes: 1024, p_ttl_seconds: 86400 });
        const c = (candidata as { version_id: string }[])[0];
        const { data: ruta } = await sa.rpc("tutorial_current_object_path",
          { p_version_id: c.version_id });
        assert(ruta === null, "se resolvió la ruta de una candidata");
        await admin.from("platform_tutorial_versions").delete().eq("id", c.version_id);
      });
  } finally {
    for (const ruta of objetos) {
      const { data } = await admin.from("platform_tutorial_versions")
        .select("effective_from").eq("object_path", ruta);
      const publicado = (data ?? []).some(
        (v) => (v as { effective_from: string | null }).effective_from !== null);
      if (!publicado) await admin.storage.from(BUCKET).remove([ruta]);
    }
    await admin.from("platform_tutorial_versions")
      .delete().eq("tutorial_id", tutorialId).is("effective_from", null);
    await admin.from("platform_staff")
      .update({ status: "revoked" }).eq("user_id", creada.user!.id);
    await admin.from("platform_tutorials")
      .update({ status: "retired" }).eq("id", tutorialId);
  }

  console.log(`\nPE-03B3 · medios: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
