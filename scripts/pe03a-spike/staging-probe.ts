/**
 * Trazaloop · PE-03B1 · La sonda contra Staging, por el flujo REAL.
 *
 * PE-03A midió el comportamiento de Storage contra el stack local y dejó
 * escrito su límite: Supabase alojado sirve detrás de una red de distribución y
 * podría añadir cabeceras de caché que en local no aparecen. Esto lo comprueba.
 *
 * Y no simula el flujo: RESERVA por la función canónica, sube por la URL
 * FIRMADA que emite esa reserva, finaliza, publica y pide un rango. Es el
 * camino que hace la consola, con un vídeo sintético diminuto.
 *
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA SONDA HIZO MAL LA PRIMERA VEZ
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Se corrigen dos fallos reales, encontrados después de ejecutarla contra
 * Staging. Se dejan escritos porque los dos vuelven solos si nadie los recuerda.
 *
 * 1 · BORRÓ EL OBJETO DE UNA VERSIÓN PUBLICADA.
 *
 *     Su `finally` hacía `remove([ruta])` sin preguntar nada. Para cuando se
 *     ejecutaba, la sonda ya había publicado esa versión — y borró sus bytes.
 *     En Staging quedó una versión publicada cuyo archivo no existe.
 *
 *     El fallo no fue olvidar una comprobación: fue **confiar en el flujo local
 *     en lugar de en la base**. La sonda «sabía» lo que había hecho, pero lo que
 *     decide es lo que la base dice AHORA. Ahora se consulta antes de borrar, y
 *     ante cualquier duda no se borra.
 *
 * 2 · USÓ UNA CONTRASEÑA ESCRITA EN EL REPOSITORIO.
 *
 *     Aceptable para las suites, que corren contra la base local y se replaya
 *     entera. Contra Staging no: cuando la limpieza falló, quedó una cuenta viva
 *     en un entorno compartido cuya contraseña podía leer cualquiera con acceso
 *     al código. Ahora se genera al arrancar, vive en memoria y no se imprime.
 *
 * SOLO CONTRA STAGING, y se comprueba antes de escribir nada.
 *
 * Correr: npx tsx scripts/pe03a-spike/staging-probe.ts   (con variables de Staging)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ephemeralQaPassword, decideObjectCleanup, checkPlatformResidue,
  CLEANUP_REASON_TEXT, type ObjectReference, type StaffRow,
} from "../../lib/qa/probe-safety";

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

/**
 * Le pregunta a la BASE qué se sabe de un objeto, no al flujo.
 *
 * Es la corrección del fallo 1. Devuelve `null` si no se puede consultar, y esa
 * respuesta también significa «no borres».
 */
export async function lookupObjectReference(
  client: SupabaseClient, objectPath: string
): Promise<ObjectReference | null> {
  const { data, error } = await client
    .from("platform_tutorial_versions")
    .select("id, effective_from")
    .eq("object_path", objectPath);
  if (error || !data) return null;
  return {
    everPublished: data.some((v) => (v as { effective_from: string | null }).effective_from !== null),
    referencingVersions: data.length,
  };
}

/** Retira un objeto SOLO si la base dice que se puede. Informa siempre. */
async function limpiarObjeto(objectPath: string): Promise<void> {
  const ref = await lookupObjectReference(admin, objectPath);
  const decision = decideObjectCleanup(ref);
  console.log(`    objeto: ${CLEANUP_REASON_TEXT[decision.reason]}`);
  if (!decision.remove) return;
  const { error } = await admin.storage.from(BUCKET).remove([objectPath]);
  if (error) console.log(`    (no se pudo retirar: ${error.message})`);
}

/** Las cuentas QA que esta ejecución creó, para poder retirarlas al final. */
const cuentasCreadas: string[] = [];

async function crearCuentaQa(
  prefijo: string, sello: number, password: string, superadmin: boolean
): Promise<{ id: string; cli: SupabaseClient }> {
  const email = `${prefijo}-${sello}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA sonda" } });
  if (error || !data.user) throw new Error(`crear ${prefijo}: ${error?.message}`);
  cuentasCreadas.push(data.user.id);
  if (superadmin) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: "superadmin", status: "active" });
  }
  const cli = createClient(URL!, ANON!, { auth: { persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  return { id: data.user.id, cli };
}

/**
 * Retira las cuentas QA, en el orden que respeta la historia.
 *
 * Una cuenta que quedó atribuida a una versión publicada NO se puede borrar, y
 * eso está bien: su identidad es el ancla de esa atribución. En ese caso se le
 * revoca el privilegio y se deshabilita, que es lo que de verdad importa.
 */
async function limpiarCuentas(): Promise<void> {
  for (const id of cuentasCreadas) {
    // Primero el privilegio, siempre. Aunque todo lo demás falle.
    await admin.from("platform_staff")
      .update({ status: "revoked" }).eq("user_id", id).eq("status", "active");

    const { data: atribuciones } = await admin.from("platform_tutorial_versions")
      .select("id").or(`uploaded_by.eq.${id},published_by.eq.${id}`).limit(1);

    if (atribuciones && atribuciones.length > 0) {
      // Ancla histórica: se deshabilita, no se borra.
      await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
      console.log(`    cuenta ${id.slice(0, 8)}…: conservada como ancla histórica, deshabilitada`);
    } else {
      const { error } = await admin.auth.admin.deleteUser(id);
      console.log(`    cuenta ${id.slice(0, 8)}…: ${error ? `no se pudo borrar (${error.message})` : "eliminada"}`);
    }
  }
}

/** Y la comprobación final: que no quede un privilegio que no estaba antes. */
async function comprobarResiduoDePrivilegios(): Promise<boolean> {
  const { data, error } = await admin.from("platform_staff")
    .select("user_id, role_code, status")
    .eq("role_code", "superadmin").eq("status", "active");
  if (error) {
    console.log("    ⚠ no se pudo comprobar el residuo de privilegios");
    return false;
  }
  const ids = (data ?? []).map((r) => String((r as { user_id: string }).user_id));
  const { data: perfiles } = ids.length > 0
    ? await admin.from("profiles").select("id, email").in("id", ids)
    : { data: [] as { id: string; email: string | null }[] };
  const correoDe = new Map(
    (perfiles ?? []).map((p) => {
      const x = p as { id: string; email: string | null };
      return [x.id, x.email];
    })
  );
  const filas: StaffRow[] = (data ?? []).map((r) => {
    const x = r as { user_id: string; role_code: string; status: string };
    return { email: correoDe.get(x.user_id) ?? null, roleCode: x.role_code, status: x.status };
  });
  const informe = checkPlatformResidue(filas);
  if (informe.ok) {
    console.log("    ✔ sin privilegios residuales · superadmins activos:",
      filas.map((f) => f.email).join(", "));
    return true;
  }
  for (const u of informe.unexpected) {
    console.log(`    ✘ SOBRA un superadministrador activo: ${u.email ?? "(sin correo)"}`);
  }
  for (const m of informe.missing) {
    console.log(`    ✘ FALTA el superadministrador esperado: ${m}`);
  }
  return false;
}

async function main() {
  const sello = Date.now();
  // Efímera, en memoria, y jamás impresa. Ver `ephemeralQaPassword`.
  const password = ephemeralQaPassword();

  const sa = await crearCuentaQa("pe03b1-probe", sello, password, true);
  const lector = await crearCuentaQa("pe03b1-probe-lector", sello, password, false);

  const CLAVE = `quality.qa_pe03b1_probe_${sello}`;
  const { data: tut } = await sa.cli.from("platform_tutorials")
    .insert({ tutorial_type: "page", page_key: CLAVE, module_key: "quality",
              title: `PE03 QA sonda ${sello}` }).select("id").single();
  const tutorialId = (tut as { id: string }).id;
  let ruta = "";

  try {
    const bytes = mp4();
    console.log(`\nPE-03B1 · sonda contra Staging · ${(bytes.length / 1024).toFixed(0)} KB\n`);

    // ── 1 · Reservar por la función canónica
    const { data: reserva, error: eRes } = await sa.cli.rpc("tutorial_reserve_upload", {
      p_tutorial_id: tutorialId, p_filename: "sonda.mp4", p_mime: "video/mp4",
      p_size_bytes: bytes.byteLength, p_ttl_seconds: 900 });
    if (eRes) throw new Error(`reservar: ${eRes.message}`);
    const r = (reserva as { version_id: string; object_path: string }[])[0];
    ruta = r.object_path;
    console.log("1 · reserva ✔ · ruta =", ruta.replace(tutorialId, "<tutorial>"));

    // ── 2 · Subir por la URL FIRMADA, que es el transporte real
    const { data: firmaSubida, error: eFirma } = await sa.cli.storage.from(BUCKET)
      .createSignedUploadUrl(ruta);
    if (eFirma || !firmaSubida) throw new Error(`firmar subida: ${eFirma?.message}`);
    const { error: eSubir } = await sa.cli.storage.from(BUCKET)
      .uploadToSignedUrl(ruta, firmaSubida.token, bytes, { contentType: "video/mp4" });
    if (eSubir) throw new Error(`subir: ${eSubir.message}`);
    console.log("2 · subida por URL firmada ✔ · los bytes no pasaron por Next.js");

    // ── 3 · Finalizar: el servidor lee el objeto real
    const { data: estado, error: eFin } = await sa.cli.rpc("tutorial_finalize_upload", {
      p_version_id: r.version_id, p_real_size: bytes.byteLength,
      p_real_mime: "video/mp4", p_content_hash: await sha256(bytes),
      p_duration_seconds: 12 });
    if (eFin) throw new Error(`finalizar: ${eFin.message}`);
    console.log("3 · finalizada ✔ · estado =", estado);

    // ── 4 · Antes de publicar, una persona normal no llega
    const { data: antes } = await lector.cli.rpc("tutorial_current_object_path",
      { p_version_id: r.version_id });
    console.log("4 · candidata invisible para una persona normal:",
      antes === null ? "✔" : "✘ SE RESOLVIÓ");

    // ── 5 · Publicar
    const { error: ePub } = await sa.cli.rpc("tutorial_publish_version",
      { p_version_id: r.version_id, p_change_note: "Sonda de PE-03B1." });
    if (ePub) throw new Error(`publicar: ${ePub.message}`);
    console.log("5 · publicada ✔");

    // ── 6 · Firmar la reproducción CON LA SESIÓN de una persona normal
    const { data: firma, error: eF } = await lector.cli.storage.from(BUCKET)
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
    const { data: corta } = await lector.cli.storage.from(BUCKET).createSignedUrl(ruta, 1);
    await new Promise((x) => setTimeout(x, 2500));
    const caducada = await fetch(corta!.signedUrl);
    console.log("\n9 · URL caducada:", caducada.status,
      caducada.status >= 400 ? "· rechazada ✔" : "· SIGUE SIRVIENDO ✘");

    // ── 10 · Sin firma
    const desnuda = await fetch(`${URL}/storage/v1/object/${BUCKET}/${ruta}`);
    console.log("10 · sin firma:", desnuda.status, desnuda.status >= 400 ? "· denegado ✔" : "✘");
  } finally {
    console.log("\n── limpieza ──");

    // 1 · El contenido, por la primitiva canónica. `tutorial_unpublish` CIERRA
    //     el periodo de la versión vigente; poner `status = 'retired'` a mano no
    //     lo hace, y eso es lo que dejó una versión publicada con periodo
    //     abierto la primera vez.
    // Con la SESIÓN del superadministrador, no con el cliente administrativo:
    // `tutorial_unpublish` exige `is_platform_superadmin()`, y `auth.uid()` es
    // nulo para `service_role`. Por eso esto va antes de revocar las cuentas.
    const { error: eRetirar } = await sa.cli.rpc("tutorial_unpublish",
      { p_tutorial_id: tutorialId });
    console.log(eRetirar
      ? `    tutorial: no había versión publicada que retirar`
      : `    tutorial: versión vigente cerrada por la primitiva canónica`);
    await admin.from("platform_tutorials")
      .update({ status: "retired" }).eq("id", tutorialId);

    // 2 · El objeto, solo si la BASE dice que nunca se publicó.
    if (ruta) await limpiarObjeto(ruta);

    // 3 · Las cuentas, respetando las atribuciones históricas.
    await limpiarCuentas();

    // 4 · Y la comprobación que la primera versión no tenía.
    const limpio = await comprobarResiduoDePrivilegios();
    if (!limpio) {
      console.error("\n⚠ La sonda dejó residuo de privilegios. Revísalo antes de seguir.");
      process.exitCode = 1;
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
