/**
 * Trazaloop · PE-03B2 · La consola, abriendo las páginas.
 *
 * Lo que solo se ve por HTTP: que la entrada esté en el menú de quien debe
 * verla, que la ficha diga lo que hay que decir, y —sobre todo— que una persona
 * normal no llegue a la consola aunque escriba la dirección a mano.
 *
 * Esconder un botón es cortesía. Que la ruta rechace es la barrera, y eso solo
 * se comprueba pidiéndola.
 *
 * Requisitos: `npm run build` previo y Supabase local en marcha.
 * Correr: npm run test:pe03b2-e2e
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { spawn, type ChildProcess } from "node:child_process";

loadEnv({ path: ".env.local" });

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

const PORT = Number(process.env.PE03B2_PORT ?? 3196);
const BASE = `http://localhost:${PORT}`;
const AUTH_COOKIE = `sb-${new global.URL(URL_SB).hostname.split(".")[0]}-auth-token`;

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL_SB, SERVICE,
  { auth: { autoRefreshToken: false, persistSession: false } });
const servers: ChildProcess[] = [];
function stopServers() {
  for (const p of servers) { try { p.kill("SIGTERM"); } catch { /* ya terminado */ } }
}
async function waitUp() {
  const limite = Date.now() + 120_000;
  while (Date.now() < limite) {
    try { const r = await fetch(`${BASE}/`, { redirect: "manual" }); if (r.status > 0) return; }
    catch { /* aún no */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("el servidor no arrancó");
}

function flat(html: string): string {
  return html.replace(/<script\b[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/").replace(/&middot;/g, "·").replace(/&nbsp;/g, " ")
    .replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
    .replace(/\s+/g, " ");
}
const has = (html: string, s: string) => flat(html).toLowerCase().includes(s.toLowerCase());
function links(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ href: m[1].replace(/&amp;/g, "&"), text: flat(m[2]).trim() }));
}

const sello = Date.now();
const password = "Trazaloop-Test-1234";
const BUCKET = "tutorial-media";
const objetos: string[] = [];

/**
 * PE-03B5 · LAS CUENTAS DE ESTA SUITE SE RETIRAN AL TERMINAR.
 *
 * El inventario de residuos del cierre encontró que estas suites creaban
 * superadministradores de plataforma y no los retiraban nunca. Contra la base
 * local es ruido acumulado; contra un entorno compartido es exactamente lo que
 * pasó en Staging con la sonda de PE-03B1.
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

async function sesion(prefijo: string, rol: "superadmin" | "support" | null) {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data: creada } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${prefijo}` } });
  assert(creada.user, `crear ${prefijo}`);
  const cli: SupabaseClient = createClient(URL_SB!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data } = await cli.auth.signInWithPassword({ email, password });
  assert(data.session, `sesión ${prefijo}`);
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b2" });
  if (rol) {
    await admin.from("platform_staff")
      .insert({ user_id: creada.user.id, role_code: rol, status: "active" });
  }
  const b64 = Buffer.from(JSON.stringify(data.session), "utf8").toString("base64url");
  personasCreadas.push(creada.user.id);
  return { id: creada.user.id, cli, cookie: `${AUTH_COOKIE}=base64-${b64}` };
}

function video(marca: number): Uint8Array {
  const b = new Uint8Array(48 * 1024);
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
    // Y se cierra la versión vigente, si la hubiera: cada pasada empieza sin
    // vídeo publicado. La historia se conserva —cerrar no borra—, que es
    // exactamente lo que el tramo promete.
    await admin.from("platform_tutorial_versions")
      .update({ effective_to: new Date().toISOString() })
      .eq("tutorial_id", t.id).not("effective_from", "is", null).is("effective_to", null);
    // El tutorial NO se borra si publicó algo, y eso es correcto: se reactiva.
    await admin.from("platform_tutorials")
      .update({ status: "active" }).eq("id", t.id);
  }
}

async function main() {
  console.log("\nPE-03B2 · La consola, por HTTP\n");
  console.log("  · levantando el build de producción…");
  servers.push(spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, QUALITY_MODULE_ENABLED: "true" }, stdio: "ignore",
  }));
  await waitUp();

  const sa = await sesion("pe03b2e-sa", "superadmin");
  const soporte = await sesion("pe03b2e-sop", "support");
  const normal = await sesion("pe03b2e-nor", null);

  const pedir = async (cookie: string, path: string) => {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"),
             body: r.status === 200 ? await r.text() : "" };
  };

  // Un tutorial con vídeo publicado, montado por el flujo real.
  const CLAVE = "quality.risks";
  // Ver la nota de `pe03b2-tutorial-admin`: retirar no libera la clave.
  await limpiarTutorialDePrueba(CLAVE);
  const { data: existente } = await admin.from("platform_tutorials")
    .select("id").eq("page_key", CLAVE).maybeSingle();
  let tutorialId: string;
  if (existente) {
    tutorialId = (existente as { id: string }).id;
    await admin.from("platform_tutorials")
      .update({ status: "active", title: `QA riesgos ${sello}` }).eq("id", tutorialId);
  } else {
    const { data: creado } = await sa.cli.from("platform_tutorials")
      .insert({ tutorial_type: "page", page_key: CLAVE, module_key: "quality",
                title: `QA riesgos ${sello}` }).select("id").single();
    assert(creado, "crear el tutorial de prueba");
    tutorialId = (creado as { id: string }).id;
  }

  const bytes = video(5);
  const { data: reserva } = await sa.cli.rpc("tutorial_reserve_upload", {
    p_tutorial_id: tutorialId, p_filename: "riesgos.mp4", p_mime: "video/mp4",
    p_size_bytes: bytes.byteLength, p_ttl_seconds: 3600 });
  const r = (reserva as { version_id: string; object_path: string }[])[0];
  const { data: firma } = await sa.cli.storage.from(BUCKET)
    .createSignedUploadUrl(r.object_path);
  await sa.cli.storage.from(BUCKET)
    .uploadToSignedUrl(r.object_path, firma!.token, bytes, { contentType: "video/mp4" });
  objetos.push(r.object_path);
  await sa.cli.rpc("tutorial_finalize_upload", {
    p_version_id: r.version_id, p_real_size: bytes.byteLength,
    p_real_mime: "video/mp4", p_content_hash: await sha256(bytes),
    p_duration_seconds: 95 });

  try {
    // =======================================================================
    console.log("A–C · Quién llega a la consola");
    // =======================================================================

    await check("A. El superadministrador la ve en el menú, y entra", async () => {
      const modulos = await pedir(sa.cookie, "/modules");
      assert(modulos.status === 200, `/modules dio ${modulos.status}`);
      const consola = await pedir(sa.cookie, "/platform/tutorials");
      assert(consola.status === 200, `la consola dio ${consola.status}`);
      assert(has(consola.body, "Tutoriales"), "la consola no se titula así");
      // Y está en el menú de la propia consola.
      assert(links(consola.body).some((l) => l.href === "/platform/tutorials"),
        "la consola no aparece en el menú de plataforma");
    });

    await check("B. Soporte entra y ve, pero no se le ofrece subir", async () => {
      const consola = await pedir(soporte.cookie, "/platform/tutorials");
      assert(consola.status === 200, `soporte recibió ${consola.status}`);
      assert(has(consola.body, "no subir ni publicar")
        || has(consola.body, "no subir"),
        "no se le explica a soporte qué no puede hacer");
      assert(!has(consola.body, "Crear tutorial"),
        "a soporte se le ofrece crear un tutorial");

      const ficha = await pedir(soporte.cookie, `/platform/tutorials/${tutorialId}`);
      assert(ficha.status === 200, `la ficha dio ${ficha.status} a soporte`);
      assert(!has(ficha.body, "Subir una versión nueva"),
        "a soporte se le ofrece subir");
      assert(!has(ficha.body, "Sí, publicar"), "a soporte se le ofrece publicar");
      // Pero sí puede previsualizar: ver es su papel.
      assert(has(ficha.body, "Ver la versión") || has(ficha.body, "Ver "),
        "soporte no puede previsualizar");
    });

    await check("C. Una persona normal NO llega, aunque escriba la dirección",
      async () => {
        // Lo que importa: la ruta rechaza. Esconder el menú es cortesía.
        for (const ruta of ["/platform/tutorials", `/platform/tutorials/${tutorialId}`]) {
          const r = await pedir(normal.cookie, ruta);
          assert(r.status === 307 || r.status === 302,
            `una persona normal recibió ${r.status} en ${ruta}`);
          assert(!(r.location ?? "").includes("/platform"),
            `se le redirigió dentro de la plataforma: ${r.location}`);
        }
        // Y ni siquiera ve la entrada en su menú.
        const modulos = await pedir(normal.cookie, "/quality");
        if (modulos.status === 200) {
          assert(!links(modulos.body).some((l) => l.href === "/platform/tutorials"),
            "una persona normal ve la entrada de tutoriales");
        }
      });

    // =======================================================================
    console.log("\nD–F · La lista y la ficha dicen lo que hay que decir");
    // =======================================================================

    await check("D. La lista distingue con vídeo, sin publicar y sin vídeo", async () => {
      const c = await pedir(sa.cookie, "/platform/tutorials");
      assert(has(c.body, "Sin publicar · hay una versión lista")
        || has(c.body, "Sin publicar"),
        "la lista no marca el tutorial con una versión sin publicar");
      assert(has(c.body, "Vídeo de bienvenida"),
        "la bienvenida no tiene su propio apartado");
      assert(has(c.body, "Tutoriales de pantalla"),
        "los tutoriales de pantalla no tienen su apartado");
      assert(has(c.body, "no es un fallo") || has(c.body, "no tenga vídeo no es"),
        "la lista presenta como fallo que falte un vídeo");
    });

    await check("E. Los filtros van por la URL · se resuelven en el servidor",
      async () => {
        const conVideo = await pedir(sa.cookie, "/platform/tutorials?cobertura=con_video");
        assert(conVideo.status === 200, `el filtro dio ${conVideo.status}`);
        // El tutorial de prueba todavía no tiene versión publicada.
        assert(!has(conVideo.body, `QA riesgos ${sello}`),
          "un tutorial sin vídeo aparece filtrando por «con vídeo»");
        const sinVideo = await pedir(sa.cookie, "/platform/tutorials?cobertura=sin_video");
        assert(has(sinVideo.body, `QA riesgos ${sello}`),
          "un tutorial sin vídeo no aparece filtrando por «sin vídeo»");
      });

    await check("F. La ficha dice que no hay vídeo, y qué lee la gente", async () => {
      const f = await pedir(sa.cookie, `/platform/tutorials/${tutorialId}`);
      assert(f.status === 200, `la ficha dio ${f.status}`);
      assert(has(f.body, "Sin vídeo publicado"), "no dice que no hay vídeo");
      assert(has(f.body, "Este tutorial está en actualización y estará disponible pronto"),
        "no dice qué lee la gente mientras tanto");
      assert(has(f.body, "Listas para revisar"),
        "no separa lo que está listo de lo publicado");
      assert(has(f.body, "Subir una versión nueva"), "no se puede subir desde la ficha");
      assert(has(f.body, "no publica"), "no advierte de que subir no publica");
    });

    // =======================================================================
    console.log("\nG–I · Publicar, y lo que cambia");
    // =======================================================================

    await check("G. Publicado, la ficha lo dice y el producto lo sirve", async () => {
      await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: r.version_id, p_change_note: "Primera." });

      const f = await pedir(sa.cookie, `/platform/tutorials/${tutorialId}`);
      assert(has(f.body, "Versión publicada"), "la ficha no muestra la versión publicada");
      assert(has(f.body, "Esto es lo que ve la gente ahora"),
        "no dice que esa es la que se ve");
      assert(has(f.body, "Retirar el vídeo"), "no se puede retirar");
      assert(!has(f.body, "Sin vídeo publicado"), "sigue diciendo que no hay vídeo");

      // Y una persona normal ya lo ve por la vía del producto.
      const { data } = await normal.cli.from("v_tutorial_current")
        .select("version_id").eq("page_key", CLAVE).single();
      assert(data, "el producto no sirve el tutorial publicado");
    });

    await check("H. La historia aparece, con periodo y autor", async () => {
      const f = await pedir(sa.cookie, `/platform/tutorials/${tutorialId}`);
      assert(has(f.body, "Historia"), "no hay historia");
      assert(has(f.body, "Publicada del") || has(f.body, "Publicada"),
        "la historia no dice el periodo");
      assert(has(f.body, "Nada de esto se borra"),
        "no se explica que la historia no se borra");
    });

    await check("I. «Usar nuevamente» aparece en las históricas, nunca en la vigente",
      async () => {
      // No se afirma que ANTES no haya ninguna: esta pantalla puede arrastrar
      // historia de pasadas anteriores, y debe. Lo que se afirma es la promesa
      // que no depende del pasado — la vigente nunca se ofrece para reponer,
      // porque reponer lo que ya se ve no significa nada.

      // Se publica una segunda: la primera pasa a histórica.
      const bytes2 = video(9);
      const { data: res2 } = await sa.cli.rpc("tutorial_reserve_upload", {
        p_tutorial_id: tutorialId, p_filename: "riesgos-2.mp4", p_mime: "video/mp4",
        p_size_bytes: bytes2.byteLength, p_ttl_seconds: 3600 });
      const r2 = (res2 as { version_id: string; object_path: string }[])[0];
      const { data: f2 } = await sa.cli.storage.from(BUCKET)
        .createSignedUploadUrl(r2.object_path);
      await sa.cli.storage.from(BUCKET)
        .uploadToSignedUrl(r2.object_path, f2!.token, bytes2, { contentType: "video/mp4" });
      objetos.push(r2.object_path);
      await sa.cli.rpc("tutorial_finalize_upload", {
        p_version_id: r2.version_id, p_real_size: bytes2.byteLength,
        p_real_mime: "video/mp4", p_content_hash: await sha256(bytes2),
        p_duration_seconds: null });
      await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: r2.version_id, p_change_note: "Segunda." });

      const despues = await pedir(sa.cookie, `/platform/tutorials/${tutorialId}`);
      assert(has(despues.body, "Usar nuevamente"),
        "no se ofrece reponer una versión histórica");

      // Y la vigente NO se ofrece. Se comprueba mirando su bloque, no la página
      // entera: en la página hay históricas que sí lo llevan.
      const html = despues.body;
      const bloqueVigente = html.slice(html.indexOf("Versión publicada"),
        html.indexOf("Historia") > 0 ? html.indexOf("Historia") : undefined);
      assert(!has(bloqueVigente, "Usar nuevamente"),
        "se ofrece reponer la versión que ya se está viendo");
      // Y a soporte no se le ofrece.
      const sop = await pedir(soporte.cookie, `/platform/tutorials/${tutorialId}`);
      assert(!has(sop.body, "Usar nuevamente"), "a soporte se le ofrece reponer");
    });

    await check("J. Una duración desconocida se muestra como «—», no como cero",
      async () => {
        const f = await pedir(sa.cookie, `/platform/tutorials/${tutorialId}`);
        assert(!has(f.body, "duración: 0:00"),
          "una duración desconocida se muestra como cero");
      });
  } finally {
    if (objetos.length > 0) await admin.storage.from(BUCKET).remove(objetos);
    await admin.from("platform_tutorial_versions")
      .delete().eq("tutorial_id", tutorialId).is("effective_from", null);
    // Se deja sin vídeo vigente para que la próxima pasada empiece igual. La
    // historia se conserva: es lo que promete el tramo.
    await admin.from("platform_tutorial_versions")
      .update({ effective_to: new Date().toISOString() })
      .eq("tutorial_id", tutorialId).not("effective_from", "is", null)
      .is("effective_to", null);
    await admin.from("platform_tutorials")
      .update({ status: "retired" }).eq("id", tutorialId);
    await retirarPersonasDeQa();
  }

  console.log(`\nPE-03B2 · consola (HTTP): ${passed} en verde, ${failed} en rojo\n`);
  stopServers();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); stopServers(); process.exit(1); });
