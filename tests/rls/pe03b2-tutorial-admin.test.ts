/**
 * Trazaloop · PE-03B2 · La consola de tutoriales, contra la base real.
 *
 * Recorre P1…P8 del encargo por el flujo COMPLETO —reserva, subida por URL
 * firmada, verificación, vista previa, publicación, versión nueva, reposición—
 * y comprueba quién puede hacer cada cosa.
 *
 * No simula la subida: usa `uploadToSignedUrl`, que es el transporte real y el
 * único que ejercita la frontera de autorización de PE-03B1.
 *
 * Correr: npm run test:pe03b2-admin
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

async function persona(prefijo: string, rol: "superadmin" | "support" | null) {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${prefijo}` } });
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

function video(marca: number, webm = false): Uint8Array {
  const b = new Uint8Array(64 * 1024);
  if (webm) b.set([0x1a, 0x45, 0xdf, 0xa3], 0);
  else {
    b.set([0x00, 0x00, 0x00, 0x18], 0);
    b.set([0x66, 0x74, 0x79, 0x70], 4);
    b.set([0x69, 0x73, 0x6f, 0x6d], 8);
  }
  for (let i = 12; i < b.length; i += 1) b[i] = (i * marca) % 251;
  return b;
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const objetos: string[] = [];


/**
 * Deja la pantalla libre para poder crear su tutorial otra vez.
 *
 * Borra las versiones que nunca se publicaron —el disparador de 0159 lo
 * permite— y luego el tutorial. Si alguna versión llegó a publicarse NO se
 * puede borrar, y así debe ser: entonces se retira, y la prueba que necesite
 * crear usará otra pantalla.
 */
async function limpiarTutorialDePrueba(clave: string): Promise<void> {
  const { data } = await admin.from("platform_tutorials")
    .select("id").eq("page_key", clave);
  for (const t of (data ?? []) as { id: string }[]) {
    // Las candidatas de una pasada anterior se van con su objeto.
    const { data: sinPublicar } = await admin.from("platform_tutorial_versions")
      .select("object_path").eq("tutorial_id", t.id).is("effective_from", null);
    for (const v of (sinPublicar ?? []) as { object_path: string }[]) {
      await admin.storage.from(BUCKET).remove([v.object_path]);
    }
    await admin.from("platform_tutorial_versions")
      .delete().eq("tutorial_id", t.id).is("effective_from", null);
    // El tutorial NO se borra si publicó algo, y eso es correcto: se reactiva.
    await admin.from("platform_tutorials")
      .update({ status: "active" }).eq("id", t.id);
  }
}

async function main() {
  const sa = await persona("pe03b2-sa", "superadmin");
  const soporte = await persona("pe03b2-sop", "support");
  const normal = await persona("pe03b2-nor", null);

  const {
    listTutorialsForConsole, getTutorialDetail, createPageTutorial,
    reserveTutorialUpload, finalizeTutorialUpload, publishTutorialVersion,
    restoreTutorialVersion, unpublishTutorial, signTutorialPreview,
  } = await import("../../lib/db/tutorials-platform");

  const CLAVE = "quality.processes";
  // Autorreparación. La identidad de un tutorial es única POR PANTALLA y esa
  // unicidad NO distingue activo de retirado —la pantalla es la misma—, así que
  // retirar no libera la clave. Una pasada anterior deja el tutorial ahí, y lo
  // que hace una persona en esa situación es reutilizarlo, no crear otro.
  //
  // Lo descubrió esta prueba: la primera versión creaba a ciegas y la segunda
  // pasada fallaba. El hallazgo se convirtió en una acción del producto —volver
  // a activar—, porque sin ella retirar sería un callejón sin salida.
  await limpiarTutorialDePrueba(CLAVE);

  console.log("\nPE-03B2 · La consola de tutoriales\n");

  let tutorialId = "";
  let v1 = "";
  let v2 = "";
  let ruta1 = "";
  let hash1 = "";

  try {
    // =======================================================================
    console.log("P1–P2 · Llegar y crear");
    // =======================================================================

    await check("P1. La lista se arma en TRES consultas, no una por fila", async () => {
      // Se cuenta de verdad, envolviendo `from`. Sin esto, una N+1 aparece el
      // día que alguien mueve una consulta dentro del bucle y nadie lo nota
      // hasta que la pantalla va lenta con cuarenta tutoriales.
      let consultas = 0;
      const espia = new Proxy(sa.cli, {
        get(target, prop, receiver) {
          if (prop === "from") {
            return (...args: unknown[]) => {
              consultas += 1;
              return (target.from as (...a: unknown[]) => unknown)(...args);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      }) as SupabaseClient;

      const res = await listTutorialsForConsole({}, espia);
      assert(res.status === "ok", "no se pudo listar");
      assert(consultas <= 2, `la lista hizo ${consultas} consultas a tablas`);
    });

    await check("P2. Crear un tutorial desde el registro, o reutilizar el que hay",
      async () => {
        // Una pantalla tiene UN tutorial, y esa unicidad no distingue activo de
        // retirado. Si una pasada anterior publicó algo, su tutorial ya no se
        // puede borrar —y eso es la promesa del tramo—, así que lo que hace una
        // persona es reutilizarlo. La prueba hace lo mismo.
        const { data: existente } = await admin.from("platform_tutorials")
          .select("id").eq("page_key", CLAVE).maybeSingle();

        if (existente) {
          tutorialId = (existente as { id: string }).id;
          await admin.from("platform_tutorials")
            .update({ status: "active" }).eq("id", tutorialId);
          // Y crear otro para la misma pantalla tiene que fallar.
          const dup = await createPageTutorial(
            { pageKey: CLAVE, title: "Duplicado" }, sa.cli);
          assert(!dup.ok, "se creó un segundo tutorial para la misma pantalla");
        } else {
          const res = await createPageTutorial(
            { pageKey: CLAVE, title: `QA procesos ${sello}` }, sa.cli);
          assert(res.ok, `crear: ${!res.ok ? res.message : ""}`);
          tutorialId = (res as { ok: true; id: string }).id;
        }

        const det = await getTutorialDetail(tutorialId, sa.cli);
        assert(det.status === "ok" && det.data, "no se lee el tutorial");
        assert(det.data!.tutorial.moduleKey === "quality",
          "el módulo no se dedujo de la clave");
        assert(det.data!.tutorial.pageKey === CLAVE, "la clave de pantalla no es la esperada");
      });

    await check("P2b. Una clave que NO está en el registro se rechaza", async () => {
      for (const inventada of ["quality.no_existe", "inventada.pantalla", "cualquier_cosa"]) {
        const res = await createPageTutorial(
          { pageKey: inventada, title: "Intruso" }, sa.cli);
        assert(!res.ok, `se creó un tutorial para «${inventada}»`);
        assert(/registro de claves/i.test((res as { message: string }).message),
          "el rechazo no explica dónde está el registro");
      }
    });

    // =======================================================================
    console.log("\nP3–P4 · Subir y revisar");
    // =======================================================================

    await check("P3. Subir por la URL firmada, y verificar", async () => {
      const bytes = video(3);
      const res = await reserveTutorialUpload({
        tutorialId, filename: "procesos.mp4", mime: "video/mp4",
        sizeBytes: bytes.byteLength }, sa.cli);
      assert(res.ok, `reservar: ${!res.ok ? res.message : ""}`);
      const r = (res as { ok: true; upload: { versionId: string; objectPath: string; token: string } }).upload;
      v1 = r.versionId; ruta1 = r.objectPath; hash1 = await sha256(bytes);

      // El transporte REAL. `uploadToSignedUrl` es el que usa el navegador.
      const { error } = await sa.cli.storage.from(BUCKET)
        .uploadToSignedUrl(r.objectPath, r.token, bytes, { contentType: "video/mp4" });
      assert(!error, `subir: ${error?.message}`);
      objetos.push(r.objectPath);

      const fin = await finalizeTutorialUpload({
        versionId: v1, objectPath: r.objectPath, declaredMime: "video/mp4" }, sa.cli);
      assert(fin.ok, `finalizar: ${!fin.ok ? fin.message : ""}`);
    });

    await check("P3b. Subir NO publica · la lista lo dice así", async () => {
      const res = await listTutorialsForConsole({}, sa.cli);
      assert(res.status === "ok", "no se pudo listar");
      const fila = res.data.find((r) => r.id === tutorialId);
      assert(fila, "el tutorial no aparece en la lista");
      assert(fila!.current === null, "la lista dice que hay versión publicada");
      assert(fila!.candidate?.versionId === v1, "la candidata no se ve en la lista");
      // No se afirma que el contador sea cero: si esta pantalla ya tuvo
      // tutoriales en pasadas anteriores, su historia sigue ahí —y debe—. Lo
      // que se afirma es que la candidata NO se cuenta como publicada.
      const det = await getTutorialDetail(tutorialId, sa.cli);
      const publicadas = det.status === "ok"
        ? det.data!.versions.filter((v) => v.effectiveFrom !== null).length : -1;
      assert(fila!.publishedCount === publicadas,
        `la lista dice ${fila!.publishedCount} publicaciones y la ficha ${publicadas}`);
      assert(det.status === "ok" && det.data, "no se lee la ficha");
      const candidata = det.status === "ok"
        ? det.data!.versions.find((v) => v.id === v1) : undefined;
      assert(candidata && candidata.effectiveFrom === null,
        "la candidata figura como publicada");
    });

    await check("P4. La vista previa de una candidata funciona para plataforma",
      async () => {
        const res = await signTutorialPreview(v1, sa.cli);
        assert(res.ok, `firmar vista previa: ${!res.ok ? res.message : ""}`);
        const url = (res as { ok: true; url: string }).url;
        const r = await fetch(url, { headers: { Range: "bytes=0-1023" } });
        assert(r.status === 206, `la vista previa devolvió ${r.status}`);
        await r.arrayBuffer();
      });

    await check("P4b. Y soporte también puede previsualizar · ver es su papel",
      async () => {
        const res = await signTutorialPreview(v1, soporte.cli);
        assert(res.ok, `soporte no pudo previsualizar: ${!res.ok ? res.message : ""}`);
      });

    await check("P4c. Una persona normal NO ve la candidata por ningún camino",
      async () => {
        const prev = await signTutorialPreview(v1, normal.cli);
        assert(!prev.ok, "una persona normal firmó la vista previa de una candidata");
        const { data } = await normal.cli.from("v_tutorial_current")
          .select("version_id").eq("page_key", CLAVE);
        assert(!data || data.length === 0, "una candidata se ve en el producto");
      });

    // =======================================================================
    console.log("\nP5–P6 · Publicar, y publicar otra");
    // =======================================================================

    await check("P5. Publicar la candidata", async () => {
      const res = await publishTutorialVersion(
        { versionId: v1, changeNote: "Primera versión." }, sa.cli);
      assert(res.ok, `publicar: ${!res.ok ? res.message : ""}`);
      const { data } = await normal.cli.from("v_tutorial_current")
        .select("version_id, version_number").eq("page_key", CLAVE).single();
      assert(data, "la versión publicada no se lee en el producto");
      assert((data as { version_id: string }).version_id === v1, "se publicó otra versión");
    });

    await check("P6. Una versión nueva sucede a la anterior, sin llevársela",
      async () => {
        const bytes = video(11, true); // WebM, para probar el otro formato.
        const res = await reserveTutorialUpload({
          tutorialId, filename: "procesos-v2.webm", mime: "video/webm",
          sizeBytes: bytes.byteLength }, sa.cli);
        assert(res.ok, `reservar v2: ${!res.ok ? res.message : ""}`);
        const r = (res as { ok: true; upload: { versionId: string; objectPath: string; token: string } }).upload;
        v2 = r.versionId;
        await sa.cli.storage.from(BUCKET)
          .uploadToSignedUrl(r.objectPath, r.token, bytes, { contentType: "video/webm" });
        objetos.push(r.objectPath);
        const fin = await finalizeTutorialUpload({
          versionId: v2, objectPath: r.objectPath, declaredMime: "video/webm" }, sa.cli);
        assert(fin.ok, `finalizar v2: ${!fin.ok ? fin.message : ""}`);
        await publishTutorialVersion({ versionId: v2, changeNote: "Segunda." }, sa.cli);

        // Los BYTES de la primera siguen ahí. Contar filas no lo demostraría.
        const { data: descargada } = await admin.storage.from(BUCKET).download(ruta1);
        assert(descargada, "el objeto de la v1 desapareció");
        const reales = new Uint8Array(await descargada!.arrayBuffer());
        assert(await sha256(reales) === hash1,
          "los bytes de la versión anterior cambiaron al publicar la nueva");

        const det = await getTutorialDetail(tutorialId, sa.cli);
        const vs = det.status === "ok" ? det.data!.versions : [];
        const vieja = vs.find((v) => v.id === v1);
        assert(vieja?.effectiveTo, "la v1 no se cerró");
        const nueva = vs.find((v) => v.id === v2);
        assert(nueva?.effectiveFrom && !nueva.effectiveTo, "la v2 no quedó vigente");
      });

    await check("P6b. La ficha muestra la historia completa y ordenada", async () => {
      const det = await getTutorialDetail(tutorialId, sa.cli);
      assert(det.status === "ok" && det.data, "no se lee la ficha");
      const vs = det.data!.versions;
      assert(vs.length >= 2, `la ficha tiene ${vs.length} versiones`);
      assert(vs[0].versionNumber > vs[1].versionNumber, "la historia no va de nueva a vieja");
      // Y trae quién subió y quién publicó: la mitad de la historia es quién.
      assert(vs.some((v) => v.uploadedByName), "la historia no dice quién subió");
      assert(vs.some((v) => v.publishedByName), "la historia no dice quién publicó");
    });

    // =======================================================================
    console.log("\nP7 · Usar nuevamente un vídeo anterior");
    // =======================================================================

    await check("P7. Reponer crea una versión NUEVA y no reabre la vieja", async () => {
      const det0 = await getTutorialDetail(tutorialId, sa.cli);
      const antes = det0.status === "ok"
        ? det0.data!.versions.find((v) => v.id === v1) : null;
      const cerradoAntes = antes?.effectiveTo;

      const res = await restoreTutorialVersion({ versionId: v1, changeNote: null }, sa.cli);
      assert(res.ok, `reponer: ${!res.ok ? res.message : ""}`);
      const v3 = (res as { ok: true; versionId: string }).versionId;

      const det = await getTutorialDetail(tutorialId, sa.cli);
      const vs = det.status === "ok" ? det.data!.versions : [];
      const repuesta = vs.find((v) => v.id === v3);
      assert(repuesta, "la versión repuesta no aparece");
      assert(repuesta!.restoredFromVersionId === v1, "no dice de cuál viene");
      assert(repuesta!.contentHash === hash1, "no lleva el mismo vídeo");
      assert(repuesta!.effectiveFrom === null, "reponer publicó sola la versión");

      const vieja = vs.find((v) => v.id === v1);
      assert(vieja?.effectiveTo === cerradoAntes,
        "REPONER REABRIÓ el periodo de la versión antigua");
    });

    await check("P7b. Retirar deja el tutorial sin vídeo, y la historia entera",
      async () => {
        const res = await unpublishTutorial(tutorialId, sa.cli);
        assert(res.ok, `retirar: ${!res.ok ? res.message : ""}`);
        const { data } = await normal.cli.from("v_tutorial_current")
          .select("version_id").eq("page_key", CLAVE);
        assert(!data || data.length === 0, "el tutorial retirado se sigue viendo");
        const det = await getTutorialDetail(tutorialId, sa.cli);
        assert(det.status === "ok" && det.data!.versions.length >= 3,
          "retirar se llevó versiones");
      });

    // =======================================================================
    console.log("\nP8 · Quién puede qué");
    // =======================================================================

    await check("P8. Soporte VE la lista y la historia, y no escribe nada", async () => {
      const lista = await listTutorialsForConsole({}, soporte.cli);
      assert(lista.status === "ok" && lista.data.length > 0, "soporte no ve la lista");
      const det = await getTutorialDetail(tutorialId, soporte.cli);
      assert(det.status === "ok" && det.data, "soporte no ve la ficha");

      const crear = await createPageTutorial(
        { pageKey: "quality.risks", title: "Soporte" }, soporte.cli);
      assert(!crear.ok, "soporte creó un tutorial");
      const reservar = await reserveTutorialUpload({
        tutorialId, filename: "x.mp4", mime: "video/mp4", sizeBytes: 1000 }, soporte.cli);
      assert(!reservar.ok, "soporte reservó una subida");
      const publicar = await publishTutorialVersion({ versionId: v1 }, soporte.cli);
      assert(!publicar.ok, "soporte publicó una versión");
      const retirar = await unpublishTutorial(tutorialId, soporte.cli);
      assert(!retirar.ok, "soporte retiró un tutorial");
      const reponer = await restoreTutorialVersion({ versionId: v1 }, soporte.cli);
      assert(!reponer.ok, "soporte repuso una versión");
    });

    await check("P8b. Una persona normal no ve ni la lista", async () => {
      const lista = await listTutorialsForConsole({}, normal.cli);
      assert(lista.status === "ok" && lista.data.length === 0,
        `una persona normal ve ${lista.status === "ok" ? lista.data.length : "?"} tutoriales`);
      const det = await getTutorialDetail(tutorialId, normal.cli);
      assert(det.status === "ok" && det.data === null,
        "una persona normal lee la ficha de un tutorial");
      const crear = await createPageTutorial(
        { pageKey: "quality.risks", title: "Intruso" }, normal.cli);
      assert(!crear.ok, "una persona normal creó un tutorial");
    });

    // =======================================================================
    console.log("\nFiltros y cobertura");
    // =======================================================================

    await check("F1. Los filtros se resuelven en el servidor", async () => {
      const porModulo = await listTutorialsForConsole({ moduleKey: "quality" }, sa.cli);
      assert(porModulo.status === "ok", "falló el filtro por módulo");
      assert(porModulo.data.every((r) => r.moduleKey === "quality" || r.moduleKey === null),
        "el filtro por módulo devuelve otros módulos");

      const porTipo = await listTutorialsForConsole({ tutorialType: "welcome" }, sa.cli);
      assert(porTipo.status === "ok", "falló el filtro por tipo");
      assert(porTipo.data.every((r) => r.tutorialType === "welcome"),
        "el filtro por tipo devuelve tutoriales de pantalla");

      const buscado = await listTutorialsForConsole({ search: "qa procesos" }, sa.cli);
      assert(buscado.status === "ok", "falló la búsqueda");
      assert(buscado.data.some((r) => r.id === tutorialId), "la búsqueda no encuentra el tutorial");
    });

    await check("F2. Y el de cobertura distingue las tres situaciones", async () => {
      const sinVideo = await listTutorialsForConsole({ coverage: "sin_video" }, sa.cli);
      assert(sinVideo.status === "ok", "falló el filtro de cobertura");
      assert(sinVideo.data.every((r) => r.current === null),
        "«sin vídeo» devuelve tutoriales con vídeo");
      assert(sinVideo.data.some((r) => r.id === tutorialId),
        "el tutorial sin versión vigente no aparece como sin vídeo");

      const conCandidata = await listTutorialsForConsole({ coverage: "con_candidata" }, sa.cli);
      assert(conCandidata.status === "ok" && conCandidata.data.every((r) => r.candidate),
        "«con candidata» devuelve tutoriales sin candidata");
    });

    await check("F3. La bienvenida se administra igual, y sigue siendo una", async () => {
      const res = await listTutorialsForConsole({ tutorialType: "welcome" }, sa.cli);
      assert(res.status === "ok", "no se pudo listar la bienvenida");
      assert(res.data.length === 1, `hay ${res.data.length} bienvenidas`);
      assert(res.data[0].pageKey === null, "la bienvenida tiene clave de pantalla");
      // Y se le puede reservar una subida por el mismo camino.
      const reserva = await reserveTutorialUpload({
        tutorialId: res.data[0].id, filename: "bienvenida.mp4",
        mime: "video/mp4", sizeBytes: 5000 }, sa.cli);
      assert(reserva.ok, `no se puede subir a la bienvenida: ${!reserva.ok ? reserva.message : ""}`);
    });
  } finally {
    if (objetos.length > 0) await admin.storage.from(BUCKET).remove(objetos);
    if (tutorialId) {
      await admin.from("platform_tutorial_versions")
        .delete().eq("tutorial_id", tutorialId).is("effective_from", null);
      await admin.from("platform_tutorials")
        .update({ status: "retired" }).eq("id", tutorialId);
    }
    // Las reservas de la bienvenida, que no llegaron a nada.
    const { data: w } = await admin.from("platform_tutorials")
      .select("id").eq("tutorial_type", "welcome").single();
    if (w) {
      await admin.from("platform_tutorial_versions")
        .delete().eq("tutorial_id", (w as { id: string }).id).is("effective_from", null);
    }
  }

  console.log(`\nPE-03B2 · consola: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
