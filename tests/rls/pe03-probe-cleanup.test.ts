/**
 * Trazaloop · PE-03 · La limpieza de una sonda no se lleva historia por delante.
 *
 * Esta suite existe por un fallo real. La sonda de PE-03B1 se ejecutó contra
 * Staging, publicó una versión, y su `finally` borró el objeto de esa versión
 * publicada. Quedó una versión que dice estar publicada y cuyo archivo no
 * existe.
 *
 * El fallo no fue olvidar una comprobación. Fue **confiar en el flujo local en
 * lugar de en la base**: la sonda «sabía» que no había publicado, porque su
 * variable local era de antes de publicar.
 *
 * Así que aquí se reproduce el caso exacto, y se comprueba **el objeto real y su
 * resumen**, no que exista una fila. Una fila sobrevive casi siempre; lo que se
 * perdió fueron los bytes.
 *
 * Correr: npm run test:pe03-probe-cleanup
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  decideObjectCleanup, checkPlatformResidue, ephemeralQaPassword,
  type ObjectReference,
} from "../../lib/qa/probe-safety";

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

function mp4(marca: number): Uint8Array {
  const b = new Uint8Array(32 * 1024);
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

/** El resumen del objeto que hay AHORA en el cubo, o null si no está. */
async function hashDelObjetoReal(objectPath: string): Promise<string | null> {
  const { data, error } = await admin.storage.from(BUCKET).download(objectPath);
  if (error || !data) return null;
  return sha256(new Uint8Array(await data.arrayBuffer()));
}

/** Lo que hace la sonda corregida: preguntarle a la base. */
async function referenciaDelObjeto(objectPath: string): Promise<ObjectReference | null> {
  const { data, error } = await admin.from("platform_tutorial_versions")
    .select("id, effective_from").eq("object_path", objectPath);
  if (error || !data) return null;
  return {
    everPublished: data.some((v) => (v as { effective_from: string | null }).effective_from !== null),
    referencingVersions: data.length,
  };
}

/**
 * LA LIMPIEZA ANTIGUA, tal como estaba escrita. Se conserva para demostrar que
 * la prueba la detecta: sin ella, «arreglado» sería una afirmación sin respaldo.
 */
async function limpiezaAntigua(objectPath: string): Promise<void> {
  await admin.storage.from(BUCKET).remove([objectPath]);
}

/** La limpieza corregida: consulta la base y decide. */
async function limpiezaCorregida(objectPath: string): Promise<string> {
  const decision = decideObjectCleanup(await referenciaDelObjeto(objectPath));
  if (decision.remove) await admin.storage.from(BUCKET).remove([objectPath]);
  return decision.reason;
}

async function main() {
  const password = ephemeralQaPassword();
  const email = `pe03-cleanup-${sello}@test.trazaloop.dev`;
  const { data: creada } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA limpieza" } });
  assert(creada.user, "crear la cuenta de prueba");
  await admin.from("platform_staff")
    .insert({ user_id: creada.user.id, role_code: "superadmin", status: "active" });
  const sa: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await sa.auth.signInWithPassword({ email, password });

  const CLAVE = `quality.qa_pe03_cleanup_${sello}`;
  const { data: tut } = await sa.from("platform_tutorials")
    .insert({ tutorial_type: "page", page_key: CLAVE, module_key: "quality",
              title: `QA limpieza ${sello}` }).select("id").single();
  assert(tut, "crear el tutorial de prueba");
  const tutorialId = (tut as { id: string }).id;

  async function subir(marca: number) {
    const bytes = mp4(marca);
    const { data } = await sa.rpc("tutorial_reserve_upload", {
      p_tutorial_id: tutorialId, p_filename: `qa-${marca}.mp4`, p_mime: "video/mp4",
      p_size_bytes: bytes.byteLength, p_ttl_seconds: 3600 });
    const f = (data as { version_id: string; object_path: string }[])[0];
    await admin.storage.from(BUCKET)
      .upload(f.object_path, bytes, { contentType: "video/mp4", upsert: false });
    const hash = await sha256(bytes);
    await sa.rpc("tutorial_finalize_upload", {
      p_version_id: f.version_id, p_real_size: bytes.byteLength,
      p_real_mime: "video/mp4", p_content_hash: hash, p_duration_seconds: null });
    return { ...f, bytes, hash };
  }

  console.log("\nPE-03 · La limpieza de una sonda\n");

  const rutasPendientes: string[] = [];

  try {
    // =======================================================================
    console.log("A · Lo publicado SOBREVIVE a la limpieza");
    // =======================================================================

    const publicada = await subir(3);
    await sa.rpc("tutorial_publish_version",
      { p_version_id: publicada.version_id, p_change_note: "Publicada." });

    await check("A1. La limpieza ANTIGUA se llevaba el objeto · el fallo real",
      async () => {
        // Se reproduce para demostrar que la prueba lo detecta. Si esto no
        // fallara, «arreglado» no significaría nada.
        await limpiezaAntigua(publicada.object_path);
        const despues = await hashDelObjetoReal(publicada.object_path);
        assert(despues === null,
          "la limpieza antigua NO borró el objeto: la prueba no reproduce el fallo");

        // Y la fila sigue ahí diciendo que está publicada. Por eso contar filas
        // no habría detectado nada.
        const { data } = await admin.from("platform_tutorial_versions")
          .select("effective_from, content_hash").eq("id", publicada.version_id).single();
        assert((data as { effective_from: string }).effective_from,
          "la versión dejó de estar publicada");
        assert((data as { content_hash: string }).content_hash === publicada.hash,
          "el resumen guardado cambió");
      });

    await check("A2. La limpieza CORREGIDA lo conserva · y se comprueban los bytes",
      async () => {
        // Se restituye el objeto para poder probar la corrección sobre el mismo
        // caso. Es lo único que se restituye: la fila nunca se tocó.
        await admin.storage.from(BUCKET).upload(
          publicada.object_path, publicada.bytes,
          { contentType: "video/mp4", upsert: true });

        const motivo = await limpiezaCorregida(publicada.object_path);
        assert(motivo === "was_published",
          `la limpieza decidió «${motivo}» sobre una versión publicada`);

        // Y la comprobación que importa: el objeto sigue, y es EL MISMO.
        const hashReal = await hashDelObjetoReal(publicada.object_path);
        assert(hashReal !== null,
          "LA LIMPIEZA BORRÓ EL OBJETO DE UNA VERSIÓN PUBLICADA");
        assert(hashReal === publicada.hash,
          "el objeto sigue, pero sus bytes no son los mismos");
      });
    rutasPendientes.push(publicada.object_path);

    await check("A3. Ni siquiera si quien limpia cree que no publicó", async () => {
      // El fallo original en una línea: una variable local que se quedó vieja.
      // La decisión no la toma esa variable; la toma la base.
      const creenciaLocal = { publicado: false };
      assert(!creenciaLocal.publicado, "preparación de la comprobación");
      const motivo = await limpiezaCorregida(publicada.object_path);
      assert(motivo === "was_published",
        "la limpieza hizo caso a la creencia local en vez de a la base");
      assert(await hashDelObjetoReal(publicada.object_path) === publicada.hash,
        "el objeto desapareció pese a estar publicado");
    });

    // =======================================================================
    console.log("\nB · Lo que NUNCA se publicó sí se puede retirar");
    // =======================================================================

    const candidata = await subir(11);

    await check("B1. La limpieza la retira, y dice por qué", async () => {
      assert(await hashDelObjetoReal(candidata.object_path) === candidata.hash,
        "la candidata no llegó a subirse");
      const motivo = await limpiezaCorregida(candidata.object_path);
      assert(motivo === "never_published", `la limpieza decidió «${motivo}»`);
      assert(await hashDelObjetoReal(candidata.object_path) === null,
        "el objeto de una candidata que nunca se publicó sigue ahí");
    });

    await check("B2. Y no queda ni candidata visible ni objeto huérfano", async () => {
      // La fila se puede borrar porque nunca tuvo vigencia: lo permite el
      // disparador de 0159.
      const { error } = await admin.from("platform_tutorial_versions")
        .delete().eq("id", candidata.version_id).is("effective_from", null);
      assert(!error, `borrar la candidata: ${error?.message}`);

      const { data: quedan } = await admin.from("platform_tutorial_versions")
        .select("id").eq("object_path", candidata.object_path);
      assert(!quedan || quedan.length === 0, "quedó una fila apuntando al objeto");

      const { data: lista } = await admin.storage.from(BUCKET)
        .list(`${tutorialId}/${candidata.version_id}`);
      assert(!lista || lista.length === 0,
        `quedaron ${lista?.length} objetos huérfanos en el cubo`);
    });

    // =======================================================================
    console.log("\nC · Un objeto compartido no se toca");
    // =======================================================================

    await check("C1. Reponer comparte objeto · y por eso no se borra", async () => {
      // Una versión repuesta apunta al mismo objeto que la original. Si la
      // limpieza mirara solo «esta versión no está publicada», se llevaría el
      // vídeo de una que sí lo está.
      const { data: nueva, error } = await sa.rpc("tutorial_restore_version",
        { p_version_id: publicada.version_id, p_change_note: null });
      assert(!error && nueva, `reponer: ${error?.message}`);

      const ref = await referenciaDelObjeto(publicada.object_path);
      assert(ref && ref.referencingVersions === 2,
        `el objeto lo referencian ${ref?.referencingVersions} versiones y deberían ser 2`);
      const motivo = await limpiezaCorregida(publicada.object_path);
      assert(motivo === "was_published" || motivo === "still_referenced",
        `la limpieza decidió «${motivo}» sobre un objeto compartido`);
      assert(await hashDelObjetoReal(publicada.object_path) === publicada.hash,
        "se borró un objeto que otra versión referencia");
    });

    await check("C2. Y si no se puede consultar la base, NO se borra", async () => {
      // Ante la duda, un objeto de más ocupa unos megas; uno de menos rompe una
      // versión publicada.
      const decision = decideObjectCleanup(null);
      assert(!decision.remove, "sin poder consultar la base, la limpieza borra igual");
      assert(decision.reason === "unknown_state", `decidió «${decision.reason}»`);
    });

    // =======================================================================
    console.log("\nD · Que no quede un privilegio suelto");
    // =======================================================================

    await check("D1. La guarda compara IDENTIDADES, no cuenta", async () => {
      // Contar deja pasar el caso en que el superadministrador que hay es el
      // equivocado — que es exactamente lo que pasó.
      const soloElEsperado = checkPlatformResidue(
        [{ email: "qa-a@trazaloop-staging.local", roleCode: "superadmin", status: "active" }]);
      assert(soloElEsperado.ok, "la guarda rechaza el estado correcto");

      const conIntruso = checkPlatformResidue([
        { email: "qa-a@trazaloop-staging.local", roleCode: "superadmin", status: "active" },
        { email: "sonda@test.trazaloop.dev", roleCode: "superadmin", status: "active" },
      ]);
      assert(!conIntruso.ok, "la guarda no detecta un superadministrador de más");
      assert(conIntruso.unexpected.length === 1
        && conIntruso.unexpected[0].email === "sonda@test.trazaloop.dev",
        "la guarda no dice CUÁL sobra");

      // Y el caso que un conteo nunca ve: uno solo, pero el equivocado.
      const elEquivocado = checkPlatformResidue(
        [{ email: "sonda@test.trazaloop.dev", roleCode: "superadmin", status: "active" }]);
      assert(!elEquivocado.ok,
        "con un solo superadministrador la guarda lo da por bueno, sea quien sea");
      assert(elEquivocado.missing.includes("qa-a@trazaloop-staging.local"),
        "la guarda no avisa de que falta el esperado");
    });

    await check("D2. Una limpieza demasiado entusiasta también se detecta", async () => {
      const vacio = checkPlatformResidue([]);
      assert(!vacio.ok, "quedarse sin ningún superadministrador se da por bueno");
      assert(vacio.missing.length === 1, "no se dice cuál falta");
    });

    await check("D3. Y la contraseña de QA no es una constante del repositorio",
      async () => {
        const a = ephemeralQaPassword();
        const b = ephemeralQaPassword();
        assert(a !== b, "dos llamadas devuelven la misma contraseña");
        assert(a.length >= 40, `la contraseña tiene ${a.length} caracteres`);
        const { readFileSync } = await import("node:fs");
        const sonda = readFileSync("scripts/pe03a-spike/staging-probe.ts", "utf8");
        assert(!/Trazaloop-Test-1234/.test(sonda),
          "la sonda de Staging sigue usando la contraseña estática del repositorio");
        assert(/ephemeralQaPassword\(\)/.test(sonda),
          "la sonda no usa una contraseña efímera");
        // Y no la imprime.
        assert(!/console\.log\([^)]*password/i.test(sonda),
          "la sonda imprime la contraseña");
      });

    await check("D4. La sonda corregida consulta la base antes de borrar", async () => {
      const { readFileSync } = await import("node:fs");
      const sonda = readFileSync("scripts/pe03a-spike/staging-probe.ts", "utf8");
      const sinComentarios = sonda
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // Ningún `remove` suelto: todos pasan por la decisión.
      const removes = [...sinComentarios.matchAll(/\.remove\(/g)];
      assert(removes.length === 1,
        `hay ${removes.length} llamadas a remove; deberían pasar todas por la decisión`);
      assert(/decideObjectCleanup/.test(sinComentarios),
        "la sonda no consulta la decisión de limpieza");
      assert(/checkPlatformResidue/.test(sinComentarios),
        "la sonda no comprueba el residuo de privilegios al terminar");
      // Y retira el contenido por la primitiva canónica, no a mano.
      assert(/tutorial_unpublish/.test(sinComentarios),
        "la sonda retira el tutorial sin cerrar el periodo de su versión");
    });
  } finally {
    // La suite se limpia a sí misma con su propia regla.
    for (const ruta of rutasPendientes) {
      const ref = await referenciaDelObjeto(ruta);
      if (decideObjectCleanup(ref).remove) {
        await admin.storage.from(BUCKET).remove([ruta]);
      }
    }
    await admin.from("platform_tutorial_versions")
      .delete().eq("tutorial_id", tutorialId).is("effective_from", null);
    await admin.from("platform_staff")
      .update({ status: "revoked" }).eq("user_id", creada.user!.id);
    await admin.from("platform_tutorials")
      .update({ status: "retired" }).eq("id", tutorialId);
  }

  console.log(`\nPE-03 · limpieza de sonda: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
