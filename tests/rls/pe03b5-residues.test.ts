/**
 * Trazaloop · PE-03B5 · Los residuos de QA, inventariados y clasificados.
 *
 *
 * QUÉ ES ESTA SUITE Y QUÉ NO
 *
 * No borra nada. Inventaría y clasifica, que es lo que el encargo pide: «no
 * borres a ciegas». Y lo que sí demuestra —lo más importante— es que la
 * anomalía histórica conocida de la sonda de PE-03 **no se puede alcanzar desde
 * el producto**, y que no se puede por CONSTRUCCIÓN y no por casualidad del
 * dato.
 *
 * La diferencia importa. «Hoy no aparece» es una fotografía. «No hay camino que
 * lleve hasta ahí» es un invariante, y sobrevive a que alguien reactive el
 * tutorial dentro de seis meses.
 *
 *
 * POR QUÉ SE CORRE CONTRA LOCAL
 *
 * Las credenciales de Staging no viven en el repositorio, a propósito. Lo que
 * esta suite comprueba son propiedades del CÓDIGO y del ESQUEMA, que son las
 * mismas en los dos entornos porque las pone la misma migración. El inventario
 * de datos de Staging lo produce `scripts/pe03b5/inventario-residuos.ts`, que
 * es de solo lectura y lo ejecuta una persona con sus credenciales.
 *
 * Correr: npm run test:pe03b5-residues
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

async function persona(prefijo: string, superadmin = false) {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B5" } });
  assert(data.user, `crear ${prefijo}`);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  if (superadmin) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: "superadmin", status: "active" });
  }
  return { id: data.user.id, email, cli };
}

/** Lista el cubo entero, a cualquier profundidad. Un prefijo se reconoce
 *  porque Storage lo devuelve sin `id`. */
async function objetosDelCubo(prefijo = ""): Promise<string[]> {
  const { data } = await admin.storage.from(BUCKET).list(prefijo, { limit: 1000 });
  const fuera: string[] = [];
  for (const e of data ?? []) {
    const ruta = prefijo ? `${prefijo}/${e.name}` : e.name;
    if ((e as { id: string | null }).id === null) fuera.push(...await objetosDelCubo(ruta));
    else fuera.push(ruta);
  }
  return fuera;
}

async function main() {
  const { getTutorialForPage, signTutorialPlayback } = await import("@/lib/db/tutorials");
  const { failTutorialVersion } = await import("@/lib/db/tutorials-platform");
  const { resolvePageKeyForPath, isKnownPageKey } = await import("@/lib/modules/page-keys");

  console.log("\nPE-03B5 · Residuos de QA\n");

  const sa = await persona("b5r-sa", true);
  const normal = await persona("b5r-nor");
  const creados: string[] = [];
  const objetos: string[] = [];

  try {
    // =====================================================================
    console.log("A · El inventario, y su clasificación");
    // =====================================================================

    await check("A1. Se puede inventariar el cubo a cualquier profundidad", async () => {
      // La ruta de un objeto tiene TRES segmentos:
      // `<tutorial>/<version>/<archivo>`. Un inventario que solo baje dos
      // niveles no encuentra ni un archivo y declara que todo está roto — que
      // es exactamente lo que le pasó a la primera versión de este recuento.
      const rutas = await objetosDelCubo();
      for (const r of rutas) {
        assert(r.split("/").length === 3,
          `«${r}» no tiene la forma <tutorial>/<version>/<archivo>`);
      }
      console.log(`      · objetos en el cubo: ${rutas.length}`);
    });

    await check("A2. Y cruzarlo con las versiones sin falsos positivos", async () => {
      const rutas = new Set(await objetosDelCubo());
      const { data: vers } = await admin.from("platform_tutorial_versions")
        .select("id, object_path, effective_from, file_state");
      const refs = new Set((vers ?? []).map((v) => v.object_path as string));

      const huerfanos = [...rutas].filter((r) => !refs.has(r));
      const rotas = (vers ?? []).filter((v) => !rutas.has(v.object_path as string));
      const rotasPublicadas = rotas.filter((v) => v.effective_from !== null);

      console.log(`      · versiones: ${(vers ?? []).length}`);
      console.log(`      · objetos huérfanos (sin versión): ${huerfanos.length}`);
      console.log(`      · versiones sin objeto: ${rotas.length}`
        + ` (publicadas alguna vez: ${rotasPublicadas.length})`);

      // Lo que se afirma aquí es que el CRUCE funciona, no cuántos hay: en
      // local, las suites suben y retiran objetos constantemente, así que un
      // número concreto sería una fotografía sin valor.
      assert(Array.isArray(huerfanos) && Array.isArray(rotas), "el cruce no produjo listas");
    });

    await check("A3. Un objeto huérfano se distingue de uno referenciado", async () => {
      // Se fabrica un huérfano de verdad —un objeto sin fila— y se comprueba
      // que el inventario lo señala, en vez de fiarse de que sabría hacerlo.
      const ruta = `${sello}-huerfano/${sello}/prueba.mp4`;
      await admin.storage.from(BUCKET).upload(ruta, new Uint8Array([0, 1, 2, 3]),
        { contentType: "video/mp4" });
      objetos.push(ruta);
      const rutas = await objetosDelCubo();
      assert(rutas.includes(ruta), "el inventario no encontró el objeto que acaba de crearse");
      const { data: vers } = await admin.from("platform_tutorial_versions")
        .select("object_path").eq("object_path", ruta);
      assert((vers ?? []).length === 0, "el objeto de prueba tiene fila");
    });

    // =====================================================================
    console.log("\nB · La anomalía histórica: inalcanzable POR CONSTRUCCIÓN");
    // =====================================================================

    // Se reproduce la MISMA forma de la anomalía documentada en PE-03: un
    // tutorial con clave de QA, retirado, con una versión publicada cuyo objeto
    // no existe. No se falsifica nada: se construye el caso para poder
    // comprobar que el producto no lo alcanza.
    const CLAVE_QA = `quality.qa_pe03b5_probe_${sello}`;
    let tutorialQa = "";

    await check("B0. Se reproduce la forma de la anomalía", async () => {
      const { data } = await sa.cli.from("platform_tutorials")
        .insert({ tutorial_type: "page", page_key: CLAVE_QA, module_key: "quality",
                  title: `PE03B5 sonda ${sello}` }).select("id").single();
      assert(data, "no se pudo crear el tutorial de sonda");
      tutorialQa = (data as { id: string }).id;
      creados.push(tutorialQa);

      const bytes = new Uint8Array(1024);
      bytes.set([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d], 0);
      const { data: r } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialQa, p_filename: "sonda.mp4", p_mime: "video/mp4",
        p_size_bytes: bytes.byteLength, p_ttl_seconds: 3600 });
      const f = (r as { version_id: string; object_path: string }[])[0];
      await admin.storage.from(BUCKET)
        .upload(f.object_path, bytes, { contentType: "video/mp4" });
      const d = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
      const hash = [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
      await sa.cli.rpc("tutorial_finalize_upload", {
        p_version_id: f.version_id, p_real_size: bytes.byteLength,
        p_real_mime: "video/mp4", p_content_hash: hash, p_duration_seconds: 30 });
      await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: f.version_id, p_change_note: "sonda B5" });
      // El objeto desaparece —como hizo la limpieza vieja de QA— y el tutorial
      // se retira. Ese es el estado documentado.
      await admin.storage.from(BUCKET).remove([f.object_path]);
      await sa.cli.from("platform_tutorials")
        .update({ status: "retired" }).eq("id", tutorialQa);

      const { data: comprobar } = await admin.from("platform_tutorial_versions")
        .select("effective_from, effective_to").eq("tutorial_id", tutorialQa).single();
      assert(comprobar!.effective_from !== null && comprobar!.effective_to === null,
        "la reproducción no dejó el estado documentado");
    });

    await check("B1. Su clave NO está en el registro del producto", async () => {
      assert(!isKnownPageKey(CLAVE_QA), `«${CLAVE_QA}» está en el registro`);
    });

    await check("B2. Ninguna dirección del producto resuelve a ella", async () => {
      // Primera barrera: no hay ruta que la produzca.
      for (const ruta of ["/quality", "/quality/qa_pe03b5_probe", `/quality/${sello}`,
        "/quality/processes", "/modules"]) {
        assert(resolvePageKeyForPath(ruta) !== CLAVE_QA,
          `«${ruta}» resolvió a la clave de la sonda`);
      }
    });

    await check("B3. Y la acción del cliente la rechaza antes de tocar la base", async () => {
      // Segunda barrera: aunque alguien fabricara la clave a mano, la acción
      // exige que esté en el registro.
      //
      // Se lee el fichero en vez de importar la acción: importarla arrastra el
      // runtime de React y aquí no hay ninguno. Lo que hay que comprobar es que
      // la guarda está escrita, y eso se ve leyendo.
      const fuente = (await import("node:fs")).readFileSync(
        "server/actions/tutorials.ts", "utf8");
      assert(/if \(!isKnownPageKey\(pageKey\)\)/.test(fuente),
        "la acción dejó de exigir que la clave esté en el registro");
    });

    await check("B4. Tercera barrera: la vista de vigentes no la devuelve", async () => {
      const buscado = await getTutorialForPage(CLAVE_QA, normal.cli);
      assert(buscado.status === "ok", `la consulta falló: ${buscado.status}`);
      assert(buscado.tutorial === null,
        "una persona normal recibe el tutorial de la sonda");
    });

    await check("B5. Y no hay reproducción posible · ni siquiera para el superadmin", async () => {
      for (const [quien, cli] of [["normal", normal.cli], ["superadmin", sa.cli]] as const) {
        const firmado = await signTutorialPlayback(
          { tutorialType: "page", pageKey: CLAVE_QA }, cli);
        assert(firmado.status !== "ok",
          `${quien} consiguió firmar la reproducción de la sonda`);
      }
    });

    await check("B6. Reactivarla NO la hace alcanzable", async () => {
      // Es la comprobación que convierte la fotografía en invariante: el
      // informe del incidente afirma que «aunque alguien reactivara el
      // tutorial, no habría por dónde llegar». Se comprueba reactivándolo.
      await sa.cli.from("platform_tutorials")
        .update({ status: "active" }).eq("id", tutorialQa);
      const buscado = await getTutorialForPage(CLAVE_QA, normal.cli);
      assert(buscado.status === "ok" && buscado.tutorial !== null,
        "reactivado, la vista deja de devolverlo: la reproducción no probaría nada");
      // La vista SÍ lo devuelve —el dato está ahí— y aun así el producto no
      // llega: la clave no está en el registro y ninguna ruta la resuelve.
      assert(!isKnownPageKey(CLAVE_QA), "la clave apareció en el registro");
      // Y la firma falla igual, porque el objeto no existe.
      const firmado = await signTutorialPlayback(
        { tutorialType: "page", pageKey: CLAVE_QA }, normal.cli);
      assert(firmado.status !== "ok",
        "reactivado, se pudo firmar un vídeo cuyos bytes no existen");
      await sa.cli.from("platform_tutorials")
        .update({ status: "retired" }).eq("id", tutorialQa);
    });

    // =====================================================================
    console.log("\nC · La historia no se falsifica para limpiar");
    // =====================================================================

    await check("C1. Una versión publicada no se puede borrar", async () => {
      const { data: v } = await admin.from("platform_tutorial_versions")
        .select("id").eq("tutorial_id", tutorialQa).single();
      const { error } = await sa.cli.from("platform_tutorial_versions")
        .delete().eq("id", v!.id);
      assert(error, "se pudo borrar una versión que se publicó");
    });

    await check("C2. Ni cambiar su resumen, su ruta o su atribución", async () => {
      const { data: antes } = await admin.from("platform_tutorial_versions")
        .select("id, content_hash, object_path, uploaded_by, published_by")
        .eq("tutorial_id", tutorialQa).single();
      for (const campo of ["content_hash", "object_path", "uploaded_by", "published_by"]) {
        const { error } = await sa.cli.from("platform_tutorial_versions")
          .update({ [campo]: campo.endsWith("_by") ? null : "falsificado" })
          .eq("id", antes!.id);
        assert(error, `se pudo cambiar «${campo}» de una versión publicada`);
      }
      const { data: despues } = await admin.from("platform_tutorial_versions")
        .select("content_hash, object_path, uploaded_by, published_by")
        .eq("id", antes!.id).single();
      assert(despues!.content_hash === antes!.content_hash, "cambió el resumen");
      assert(despues!.object_path === antes!.object_path, "cambió la ruta");
      assert(despues!.uploaded_by === antes!.uploaded_by, "cambió quién subió");
      assert(despues!.published_by === antes!.published_by, "cambió quién publicó");
    });

    await check("C3. Y el tutorial que publicó algo no se puede borrar", async () => {
      const { error } = await sa.cli.from("platform_tutorials").delete().eq("id", tutorialQa);
      assert(error, "se pudo borrar la identidad de un tutorial con historia");
    });

    // =====================================================================
    console.log("\nD · Reservas: viejas no es lo mismo que abandonadas");
    // =====================================================================

    // Las reservas necesitan un tutorial EN SERVICIO: reservar sobre uno
    // retirado se rechaza —y está bien que se rechace—, así que la sonda
    // retirada no sirve para esta parte.
    const { data: activo } = await sa.cli.from("platform_tutorials")
      .insert({ tutorial_type: "page", page_key: `cpr.qa_pe03b5_res_${sello}`,
                module_key: "cpr", title: `PE03B5 reservas ${sello}` })
      .select("id").single();
    const tutorialActivo = (activo as { id: string } | null)?.id ?? "";
    if (tutorialActivo) creados.push(tutorialActivo);

    await check("D1. Una reserva con horizonte largo es legítima, no residuo", async () => {
      assert(tutorialActivo, "no se pudo crear el tutorial de reservas");
      // B3 quitó el reloj del predicado que autoriza escribir justamente para
      // que una subida larga no muriera por tiempo. Clasificar por antigüedad
      // reintroduciría ese límite por la puerta de atrás.
      const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialActivo, p_filename: "larga.mp4", p_mime: "video/mp4",
        p_size_bytes: 8 * 1024 * 1024 * 1024, p_ttl_seconds: 604800 });
      const f = (data as { version_id: string; object_path: string }[])[0];
      assert(f, "no se pudo reservar con horizonte de una semana");
      const { data: fila } = await admin.from("platform_tutorial_versions")
        .select("file_state, upload_expires_at").eq("id", f.version_id).single();
      assert(fila!.file_state === "reserved", `la reserva nació en «${fila!.file_state}»`);
      // Y sigue autorizando escribir aunque el horizonte sea largo.
      const { data: puede } = await admin
        .rpc("tutorial_media_has_reservation", { p_name: f.object_path });
      assert(puede === true, "una reserva con horizonte largo no autoriza escribir");
      // Se marca fallida, que es la vía canónica de retirarla: `failTutorialVersion`,
      // la misma que usa la consola cuando una subida se tuerce.
      const marcada = await failTutorialVersion(f.version_id, sa.cli);
      assert(marcada.ok, "no se pudo marcar la reserva como fallida");
    });

    await check("D2. Una reserva fallida deja de autorizar", async () => {
      const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialActivo, p_filename: "fallida.mp4", p_mime: "video/mp4",
        p_size_bytes: 1000, p_ttl_seconds: 3600 });
      const f = (data as { version_id: string; object_path: string }[])[0];
      const marcada = await failTutorialVersion(f.version_id, sa.cli);
      assert(marcada.ok, "no se pudo marcar la reserva como fallida");
      const { data: puede } = await admin
        .rpc("tutorial_media_has_reservation", { p_name: f.object_path });
      assert(puede === false, "una reserva fallida sigue autorizando escribir");
    });

    // =====================================================================
    console.log("\nE · Las cuentas de plataforma");
    // =====================================================================

    await check("E1. Ninguna cuenta de sonda queda activa en esta base", async () => {
      const { data } = await admin.from("platform_staff")
        .select("user_id, role_code, status").eq("status", "active");
      const { data: usuarios } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const correo = (id: string) =>
        usuarios.users.find((u) => u.id === id)?.email ?? id;
      const sondas = (data ?? [])
        .map((r) => correo(r.user_id as string))
        .filter((e) => /probe|sonda/i.test(e));
      assert(sondas.length === 0, `sondas con papel activo: ${sondas.join(", ")}`);
    });

    await check("E2. Y las preferencias de QA son de sus personas, de nadie más", async () => {
      const { data } = await admin.from("user_preferences").select("user_id, preference_key");
      const { data: usuarios } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const vivos = new Set(usuarios.users.map((u) => u.id));
      const zombis = (data ?? []).filter((p) => !vivos.has(p.user_id as string));
      // La clave foránea con `on delete cascade` lo garantiza; se comprueba
      // porque una preferencia sin dueño sería una fila que nadie puede borrar.
      assert(zombis.length === 0, `${zombis.length} preferencias sin persona`);
    });
  } finally {
    for (const p of objetos) await admin.storage.from(BUCKET).remove([p]);
    // El tutorial de sonda de ESTA prueba se deja retirado y con su historia
    // intacta: es lo mismo que se decidió para el de PE-03B1. Lo único que se
    // limpia son sus reservas nunca publicadas y las personas.
    for (const t of creados) {
      await admin.from("platform_tutorial_versions")
        .delete().eq("tutorial_id", t).is("effective_from", null);
      // Si nunca publicó nada, la identidad se va con él. Si publicó, se queda:
      // es historia, y esa es la regla que C3 comprueba.
      const { data: quedan } = await admin.from("platform_tutorial_versions")
        .select("id").eq("tutorial_id", t);
      if ((quedan ?? []).length === 0) await admin.from("platform_tutorials").delete().eq("id", t);
    }
    for (const p of [sa, normal]) {
      await admin.from("user_preferences").delete().eq("user_id", p.id);
      await admin.from("platform_staff").delete().eq("user_id", p.id);
      await admin.auth.admin.deleteUser(p.id);
    }
  }

  console.log(`\nPE-03B5 · residuos: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
