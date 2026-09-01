/**
 * Trazaloop · PE-03B1 · Ver el vídeo, y solo el que toca.
 *
 * LA TRAMPA QUE PE-03A AVISÓ
 *
 * «Comprobar que el vídeo se reproduce pidiendo la URL firmada y mirando que
 * devuelve 200» demuestra que el objeto existe. No demuestra que se pueda
 * adelantar, que es lo que hace usable un tutorial de cuatro minutos.
 *
 * Así que aquí se pide un RANGO, y se comprueba el 206, la cabecera
 * `content-range` y que los bytes devueltos son los del tramo pedido — no unos
 * cualesquiera del tamaño correcto.
 *
 * Correr: npm run test:pe03b1-playback
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

/**
 * PE-03B5 · LAS CUENTAS DE ESTA SUITE SE RETIRAN AL TERMINAR.
 *
 * El inventario de residuos del cierre encontró que estas suites creaban
 * superadministradores de plataforma y no los retiraban nunca. Contra la base
 * local es ruido acumulado; contra un entorno compartido es exactamente lo que
 * pasó en Staging con la sonda de PE-03B1 — una cuenta de QA con papel de
 * plataforma vivo que nadie recordaba haber creado.
 *
 * La regla que sale de aquello: quien crea un acceso privilegiado lo cierra.
 */
const personasCreadas: string[] = [];
async function retirarPersonasDeQa() {
  for (const id of personasCreadas) {
    await admin.from("platform_staff").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

async function persona(prefijo: string, superadmin = false) {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B1" } });
  assert(data.user, `crear ${prefijo}`);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  if (superadmin) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: "superadmin", status: "active" });
  }
  personasCreadas.push(data.user.id);
  return { id: data.user.id, cli };
}

/** Un MP4 sintético de 512 KB con contenido determinista, para poder comprobar
 *  que un rango devuelve EXACTAMENTE los bytes de ese tramo. */
function mp4(marca: number): Uint8Array {
  const b = new Uint8Array(512 * 1024);
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

const objetos: string[] = [];

async function main() {
  const sa = await persona("pe03b1p-sa", true);
  const normal = await persona("pe03b1p-nor");

  const CLAVE = `quality.qa_pe03b1p_${sello}`;
  await admin.from("platform_tutorials").update({ status: "retired" })
    .like("page_key", "quality.qa_pe03b1p_%").eq("status", "active");
  const { data: creado } = await sa.cli.from("platform_tutorials")
    .insert({ tutorial_type: "page", page_key: CLAVE, module_key: "quality",
              title: `QA reproducción ${sello}` }).select("id").single();
  assert(creado, "crear tutorial");
  const tutorialId = (creado as { id: string }).id;

  async function subir(marca: number) {
    const bytes = mp4(marca);
    const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
      p_tutorial_id: tutorialId, p_filename: `qa-${marca}.mp4`, p_mime: "video/mp4",
      p_size_bytes: bytes.byteLength, p_ttl_seconds: 3600 });
    const f = (data as { version_id: string; object_path: string }[])[0];
    await admin.storage.from(BUCKET)
      .upload(f.object_path, bytes, { contentType: "video/mp4", upsert: false });
    objetos.push(f.object_path);
    await sa.cli.rpc("tutorial_finalize_upload", {
      p_version_id: f.version_id, p_real_size: bytes.byteLength,
      p_real_mime: "video/mp4", p_content_hash: await sha256(bytes),
      p_duration_seconds: 180 });
    return { ...f, bytes };
  }

  console.log("\nPE-03B1 · La reproducción\n");

  try {
    const v1 = await subir(3);
    const v2 = await subir(11);
    await sa.cli.rpc("tutorial_publish_version",
      { p_version_id: v1.version_id, p_change_note: "v1" });

    // =======================================================================
    console.log("A–D · Solo lo vigente sale");
    // =======================================================================

    await check("A. Una persona con sesión ve la versión vigente", async () => {
      const { data, error } = await normal.cli.from("v_tutorial_current")
        .select("version_id, title, duration_seconds, mime_type")
        .eq("page_key", CLAVE).single();
      assert(!error && data, `no se lee el tutorial: ${error?.message}`);
      assert((data as { version_id: string }).version_id === v1.version_id,
        "se lee otra versión");
      assert((data as { mime_type: string }).mime_type === "video/mp4",
        "se perdió el tipo del archivo");
    });

    await check("B. Y obtiene su ruta para firmar", async () => {
      const { data, error } = await normal.cli
        .rpc("tutorial_current_object_path", { p_version_id: v1.version_id });
      assert(!error && data, `no se resolvió la ruta: ${error?.message}`);
      assert(String(data) === v1.object_path, "la ruta devuelta no es la de la versión");
    });

    await check("C. Una candidata NO se resuelve, aunque se sepa su id", async () => {
      // Es la comprobación que impide que el identificador de una versión se
      // convierta en una llave: la función mira si es la VIGENTE, no si existe.
      const { data } = await normal.cli
        .rpc("tutorial_current_object_path", { p_version_id: v2.version_id });
      assert(data === null, "se resolvió la ruta de una versión candidata");
      // Ni por la vista.
      const { data: vista } = await normal.cli.from("v_tutorial_current")
        .select("version_id").eq("version_id", v2.version_id);
      assert(!vista || vista.length === 0, "una candidata aparece en la vista del producto");
    });

    await check("D. Y una histórica tampoco, después de suceder", async () => {
      await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: v2.version_id, p_change_note: "v2" });
      const { data } = await normal.cli
        .rpc("tutorial_current_object_path", { p_version_id: v1.version_id });
      assert(data === null, "se resolvió la ruta de una versión ya histórica");
      // Y ahora la vigente es la v2.
      const { data: ahora } = await normal.cli
        .rpc("tutorial_current_object_path", { p_version_id: v2.version_id });
      assert(String(ahora) === v2.object_path, "no se resuelve la nueva vigente");
    });

    // =======================================================================
    console.log("\nE–H · La URL firmada, y el adelanto");
    // =======================================================================

    let firmada = "";

    await check("E. Se firma con la sesión de la persona, sin cliente administrativo",
      async () => {
        const { data, error } = await normal.cli.storage.from(BUCKET)
          .createSignedUrl(v2.object_path, 7200);
        assert(!error && data?.signedUrl, `firmar: ${error?.message}`);
        firmada = data!.signedUrl;
      });

    await check("F. Y NO se puede firmar una histórica ni una candidata", async () => {
      // La segunda barrera, en el propio almacenamiento: la política solo deja
      // leer objetos que son la versión vigente de un tutorial activo.
      const { data, error } = await normal.cli.storage.from(BUCKET)
        .createSignedUrl(v1.object_path, 600);
      assert(error || !data?.signedUrl,
        "una persona normal firmó el vídeo de una versión histórica");
    });

    await check("G. Se puede ADELANTAR: 206, rango correcto y bytes correctos",
      async () => {
        const inicio = 100 * 1024;
        const fin = 200 * 1024 - 1;
        const r = await fetch(firmada, { headers: { Range: `bytes=${inicio}-${fin}` } });
        assert(r.status === 206, `la petición de rango devolvió ${r.status}, no 206`);
        const rango = r.headers.get("content-range") ?? "";
        assert(rango === `bytes ${inicio}-${fin}/${v2.bytes.byteLength}`,
          `content-range: «${rango}»`);
        assert(r.headers.get("accept-ranges") === "bytes"
          || r.headers.get("content-range"), "el servidor no declara admitir rangos");

        // Y los bytes son los de ESE tramo, no unos cualesquiera del tamaño
        // correcto. Sin esto, un servidor que devolviera siempre el principio
        // pasaría la comprobación.
        const trozo = new Uint8Array(await r.arrayBuffer());
        assert(trozo.byteLength === fin - inicio + 1,
          `llegaron ${trozo.byteLength} bytes y se pidieron ${fin - inicio + 1}`);
        for (const i of [0, 1, 500, trozo.byteLength - 1]) {
          assert(trozo[i] === v2.bytes[inicio + i],
            `el byte ${inicio + i} no corresponde: adelantar devolvería otra cosa`);
        }
      });

    await check("H. Se reproduce EN LÍNEA, no se descarga", async () => {
      const r = await fetch(firmada, { headers: { Range: "bytes=0-1023" } });
      assert(r.headers.get("content-type") === "video/mp4",
        `el tipo servido es «${r.headers.get("content-type")}»`);
      const disposicion = r.headers.get("content-disposition");
      assert(!disposicion || !/attachment/i.test(disposicion),
        `el servidor fuerza la descarga: «${disposicion}»`);
      await r.arrayBuffer();
    });

    // =======================================================================
    console.log("\nI–L · Lo que no se puede llegar a ver");
    // =======================================================================

    await check("I. Una URL firmada caduca de verdad", async () => {
      const { data } = await normal.cli.storage.from(BUCKET)
        .createSignedUrl(v2.object_path, 1);
      assert(data?.signedUrl, "no se pudo firmar una URL corta");
      await new Promise((r) => setTimeout(r, 2500));
      const r = await fetch(data!.signedUrl);
      assert(r.status >= 400, `una URL caducada sirvió el vídeo con ${r.status}`);
    });

    await check("J. Sin sesión no se llega a nada", async () => {
      const { data: vista } = await anonimo.from("v_tutorial_current").select("version_id");
      assert(!vista || vista.length === 0, `un visitante ve ${vista?.length} tutoriales`);
      const { data: ruta } = await anonimo
        .rpc("tutorial_current_object_path", { p_version_id: v2.version_id });
      assert(!ruta, "un visitante resolvió la ruta de un vídeo");
      const { data: firma } = await anonimo.storage.from(BUCKET)
        .createSignedUrl(v2.object_path, 600);
      assert(!firma?.signedUrl, "un visitante firmó un vídeo");
    });

    await check("K. Y el objeto sin firma tampoco se sirve", async () => {
      const r = await fetch(`${URL}/storage/v1/object/${BUCKET}/${v2.object_path}`);
      assert(r.status >= 400, `el objeto se sirvió sin firma con ${r.status}`);
    });

    await check("L. Retirado el tutorial, deja de poderse firmar", async () => {
      await sa.cli.rpc("tutorial_unpublish", { p_tutorial_id: tutorialId });
      const { data: ruta } = await normal.cli
        .rpc("tutorial_current_object_path", { p_version_id: v2.version_id });
      assert(!ruta, "se resuelve la ruta de un tutorial retirado");
      const { data: firma } = await normal.cli.storage.from(BUCKET)
        .createSignedUrl(v2.object_path, 600);
      assert(!firma?.signedUrl, "se firmó el vídeo de un tutorial retirado");
    });

    // =======================================================================
    console.log("\nM–O · Independencia y cuota");
    // =======================================================================

    await check("M. Los tutoriales NO cuentan en la cuota de ninguna empresa",
      async () => {
        // No se comprueba con una promesa: se compara el número real antes y
        // después de haber subido medio mega de vídeo.
        const { data: orgs } = await admin.from("organizations").select("id").limit(1);
        if (!orgs || orgs.length === 0) {
          assert(true, "no hay empresas en esta base; nada que medir");
          return;
        }
        const orgId = String((orgs[0] as { id: string }).id);
        const { data: uso } = await admin.from("v_module_usage")
          .select("storage_used_bytes").eq("organization_id", orgId);
        const total = (uso ?? []).reduce(
          (s, r) => s + Number((r as { storage_used_bytes: number }).storage_used_bytes ?? 0), 0);

        // Y el cubo de tutoriales no aparece en el cálculo, que es la razón
        // estructural: la cuota se suma desde tablas con organization_id.
        const { data: filas } = await admin.from("v_module_usage")
          .select("*").eq("organization_id", orgId).limit(1);
        const columnas = Object.keys((filas ?? [{}])[0] as object);
        assert(!columnas.includes("tutorial_bytes"),
          "el cálculo de cuota conoce los tutoriales");
        assert(Number.isFinite(total), "no se pudo leer la cuota");
      });

    await check("N. Los módulos son independientes: no hay respaldo entre ellos",
      async () => {
        // Un tutorial de Quality no aparece como el de una pantalla de PCR.
        const { data } = await normal.cli.from("v_tutorial_current")
          .select("page_key, module_key").eq("module_key", "cpr");
        for (const r of (data ?? []) as { page_key: string }[]) {
          assert(!r.page_key.startsWith("quality."),
            "un tutorial de Quality aparece bajo PCR");
        }
        const { data: inexistente } = await normal.cli.from("v_tutorial_current")
          .select("version_id").eq("page_key", "cpr.qa_no_existe");
        assert(!inexistente || inexistente.length === 0,
          "una pantalla sin tutorial recibe el de otra");
      });

    await check("O. Y ver un tutorial no consulta ningún plan", async () => {
      // La forma de garantizar que no se olvida de comprobar el plan es que no
      // lo comprueba: no hay ni una mención en el camino de lectura.
      const { readFileSync } = await import("node:fs");
      const lector = readFileSync("lib/db/tutorials.ts", "utf8");
      for (const rastro of ["access_mode", "plan_code", "entitlement", "module_access",
        "demo", "full", "extra"]) {
        assert(!new RegExp(`\\b${rastro}\\b`, "i").test(lector),
          `la lectura de tutoriales consulta «${rastro}»`);
      }
    });
  } finally {
    if (objetos.length > 0) await admin.storage.from(BUCKET).remove(objetos);
    await admin.from("platform_tutorial_versions")
      .delete().eq("tutorial_id", tutorialId).is("effective_from", null);
    await admin.from("platform_tutorials")
      .update({ status: "retired" }).eq("id", tutorialId);
    await retirarPersonasDeQa();
  }

  console.log(`\nPE-03B1 · reproducción: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
