/**
 * Trazaloop · PE-03B1 · La sonda contra Staging, por el flujo REAL.
 *
 * PE-03A midió el comportamiento de Storage contra el stack local y dejó
 * escrito su límite: Supabase alojado sirve detrás de una red de distribución y
 * podría añadir cabeceras de caché que en local no aparecen. Esto lo comprueba.
 *
 * Y no simula el flujo: RESERVA por la función canónica, sube por la URL
 * FIRMADA que emite esa reserva, finaliza, publica y pide un rango. Es el
 * camino que hará la consola de B2, con un vídeo sintético diminuto.
 *
 * Limpia siempre: el tutorial de prueba se retira y su objeto se borra. Lo que
 * NO se puede borrar es la versión publicada, y eso es exactamente lo que este
 * tramo promete — se documenta en lugar de forzarlo.
 *
 * Correr: npx tsx scripts/pe03a-spike/staging-probe.ts   (con variables de Staging)
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.STAGING_SUPABASE_URL;
const SERVICE = process.env.STAGING_SERVICE_ROLE_KEY;
const ANON = process.env.STAGING_ANON_KEY;
if (!URL || !SERVICE || !ANON) {
  console.error("Faltan STAGING_SUPABASE_URL, STAGING_SERVICE_ROLE_KEY y STAGING_ANON_KEY.");
  process.exit(1);
}
if (/127\.0\.0\.1|localhost/.test(URL)) {
  console.error("Esta sonda es para Staging. Para local está storage-spike.ts.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const BUCKET = "tutorial-media";

function mp4(): Uint8Array {
  const b = new Uint8Array(256 * 1024);
  b.set([0x00, 0x00, 0x00, 0x18], 0);
  b.set([0x66, 0x74, 0x79, 0x70], 4);
  b.set([0x69, 0x73, 0x6f, 0x6d], 8);
  for (let i = 12; i < b.length; i += 1) b[i] = (i * 7) % 251;
  return b;
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function main() {
  const sello = Date.now();
  const password = "Trazaloop-Test-1234";
  const email = `pe03b1-probe-${sello}@test.trazaloop.dev`;
  const { data: creada } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA sonda" } });
  if (!creada.user) { console.error("no se pudo crear la cuenta de sonda"); process.exit(1); }
  await admin.from("platform_staff")
    .insert({ user_id: creada.user.id, role_code: "superadmin", status: "active" });

  const sa = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await sa.auth.signInWithPassword({ email, password });
  const lector = createClient(URL!, ANON!, { auth: { persistSession: false } });
  const emailLector = `pe03b1-probe-lector-${sello}@test.trazaloop.dev`;
  const { data: cl } = await admin.auth.admin.createUser({
    email: emailLector, password, email_confirm: true,
    user_metadata: { full_name: "QA lector" } });
  await lector.auth.signInWithPassword({ email: emailLector, password });

  const CLAVE = `quality.qa_pe03b1_probe_${sello}`;
  const { data: tut } = await sa.from("platform_tutorials")
    .insert({ tutorial_type: "page", page_key: CLAVE, module_key: "quality",
              title: `PE03 QA sonda ${sello}` }).select("id").single();
  const tutorialId = (tut as { id: string }).id;
  let ruta = "";

  try {
    const bytes = mp4();
    console.log(`\nPE-03B1 · sonda contra Staging · ${(bytes.length / 1024).toFixed(0)} KB\n`);

    // ── 1 · Reservar por la función canónica
    const { data: reserva, error: eRes } = await sa.rpc("tutorial_reserve_upload", {
      p_tutorial_id: tutorialId, p_filename: "sonda.mp4", p_mime: "video/mp4",
      p_size_bytes: bytes.byteLength, p_ttl_seconds: 900 });
    if (eRes) throw new Error(`reservar: ${eRes.message}`);
    const r = (reserva as { version_id: string; object_path: string }[])[0];
    ruta = r.object_path;
    console.log("1 · reserva ✔ · ruta =", ruta.replace(tutorialId, "<tutorial>"));

    // ── 2 · Subir por la URL FIRMADA, que es el transporte real
    const { data: firmaSubida, error: eFirma } = await sa.storage.from(BUCKET)
      .createSignedUploadUrl(ruta);
    if (eFirma || !firmaSubida) throw new Error(`firmar subida: ${eFirma?.message}`);
    const { error: eSubir } = await sa.storage.from(BUCKET)
      .uploadToSignedUrl(ruta, firmaSubida.token, bytes, { contentType: "video/mp4" });
    if (eSubir) throw new Error(`subir: ${eSubir.message}`);
    console.log("2 · subida por URL firmada ✔ · los bytes no pasaron por Next.js");

    // ── 3 · Finalizar: el servidor lee el objeto real
    const { data: estado, error: eFin } = await sa.rpc("tutorial_finalize_upload", {
      p_version_id: r.version_id, p_real_size: bytes.byteLength,
      p_real_mime: "video/mp4", p_content_hash: await sha256(bytes),
      p_duration_seconds: 12 });
    if (eFin) throw new Error(`finalizar: ${eFin.message}`);
    console.log("3 · finalizada ✔ · estado =", estado);

    // ── 4 · Antes de publicar, una persona normal no llega
    const { data: antes } = await lector.rpc("tutorial_current_object_path",
      { p_version_id: r.version_id });
    console.log("4 · candidata invisible para una persona normal:",
      antes === null ? "✔" : "✘ SE RESOLVIÓ");

    // ── 5 · Publicar
    const { error: ePub } = await sa.rpc("tutorial_publish_version",
      { p_version_id: r.version_id, p_change_note: "Sonda de PE-03B1." });
    if (ePub) throw new Error(`publicar: ${ePub.message}`);
    console.log("5 · publicada ✔");

    // ── 6 · Firmar la reproducción CON LA SESIÓN de una persona normal
    const { data: firma, error: eF } = await lector.storage.from(BUCKET)
      .createSignedUrl(ruta, 7200);
    if (eF || !firma) throw new Error(`firmar reproducción: ${eF?.message}`);
    console.log("6 · reproducción firmada por una persona normal ✔");

    // ── 7 · Cabeceras y rango: lo que decide si se puede adelantar
    const completo = await fetch(firma.signedUrl, { headers: { Range: "bytes=0-1023" } });
    console.log("\n7 · cabeceras del alojado");
    for (const h of ["content-type", "accept-ranges", "content-range",
      "content-disposition", "cache-control", "age", "x-cache"]) {
      console.log(`    ${h}: ${completo.headers.get(h) ?? "(ausente)"}`);
    }
    await completo.arrayBuffer();

    const inicio = 100 * 1024, fin = 150 * 1024 - 1;
    const rango = await fetch(firma.signedUrl, { headers: { Range: `bytes=${inicio}-${fin}` } });
    const trozo = new Uint8Array(await rango.arrayBuffer());
    console.log("\n8 · adelantar");
    console.log("    estado:", rango.status, rango.status === 206 ? "· 206 ✔" : "· NO parcial ✘");
    console.log("    content-range:", rango.headers.get("content-range") ?? "(ausente)");
    console.log("    bytes correctos:",
      trozo[0] === bytes[inicio] && trozo[trozo.length - 1] === bytes[fin] ? "✔" : "✘");

    // ── 9 · Caducidad
    const { data: corta } = await lector.storage.from(BUCKET).createSignedUrl(ruta, 1);
    await new Promise((x) => setTimeout(x, 2500));
    const caducada = await fetch(corta!.signedUrl);
    console.log("\n9 · URL caducada:", caducada.status,
      caducada.status >= 400 ? "· rechazada ✔" : "· SIGUE SIRVIENDO ✘");

    // ── 10 · Sin firma
    const desnuda = await fetch(`${URL}/storage/v1/object/${BUCKET}/${ruta}`);
    console.log("10 · sin firma:", desnuda.status, desnuda.status >= 400 ? "· denegado ✔" : "✘");
  } finally {
    // El tutorial se retira; su versión publicada NO se puede borrar, y así debe
    // ser. El objeto sí se retira, que es lo que ocupa.
    await admin.from("platform_tutorials")
      .update({ status: "retired" }).eq("id", tutorialId);
    if (ruta) await admin.storage.from(BUCKET).remove([ruta]);
    console.log("\ntutorial de sonda retirado y objeto borrado.");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
