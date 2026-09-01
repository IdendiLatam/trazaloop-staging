/**
 * Trazaloop · PE-03B4 · La bienvenida, contra la base real.
 *
 * Lo estático vigila ausencias. Esto ejerce el flujo completo con el motor de
 * verdad: publicar el vídeo de bienvenida, comprobar que sale; guardar «no
 * volver a mostrar», comprobar que deja de salir; PUBLICAR OTRA VERSIÓN y
 * comprobar que sigue sin salir.
 *
 * Esa última es la que importa. Es fácil escribir una supresión que se guarde
 * contra la versión vigente sin darse cuenta, y el fallo no aparece hasta que
 * alguien publica la v2 — meses después, y a todo el mundo a la vez.
 *
 * Se usan las capas inyectables (`lib/db/tutorials`, `lib/db/user-preferences`)
 * con el cliente de cada persona, así que la RLS se ejerce igual que en el
 * producto. La acción de servidor no se puede llamar desde aquí porque lee las
 * cookies de Next; lo que se prueba es todo lo que hay debajo de ella.
 *
 * Correr: npm run test:pe03b4-welcome-flow
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
    email, password, email_confirm: true, user_metadata: { full_name: "QA B4" } });
  assert(data.user, `crear ${prefijo}`);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  await cli.auth.signInWithPassword({ email, password });
  if (superadmin) {
    await admin.from("platform_staff")
      .insert({ user_id: data.user.id, role_code: "superadmin", status: "active" });
  }
  return { id: data.user.id, cli };
}

function mp4(marca: number): Uint8Array {
  const b = new Uint8Array(256 * 1024);
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
  const { getWelcomeTutorial, signTutorialPlayback } = await import("@/lib/db/tutorials");
  const { hasUserPreference, setUserPreference } = await import("@/lib/db/user-preferences");

  const sa = await persona("b4w-sa", true);
  const ana = await persona("b4w-ana");
  const beto = await persona("b4w-beto");

  console.log("\nPE-03B4 · La bienvenida, de punta a punta\n");

  // La identidad de bienvenida es ÚNICA y ya existe desde 0159. No se crea
  // otra: eso es lo que comprueba la primera.
  const { data: identidades } = await admin.from("platform_tutorials")
    .select("id, page_key, module_key, status").eq("tutorial_type", "welcome");
  const bienvenida = (identidades ?? [])[0] as
    { id: string; page_key: string | null; module_key: string | null; status: string };

  // Qué había publicado antes, para dejarlo como estaba.
  const { data: previas } = await admin.from("platform_tutorial_versions")
    .select("id, effective_to").eq("tutorial_id", bienvenida?.id ?? "")
    .is("effective_to", null).not("published_at", "is", null);

  async function subir(marca: number) {
    const bytes = mp4(marca);
    const { data } = await sa.cli.rpc("tutorial_reserve_upload", {
      p_tutorial_id: bienvenida.id, p_filename: `bienvenida-${marca}.mp4`,
      p_mime: "video/mp4", p_size_bytes: bytes.byteLength, p_ttl_seconds: 3600 });
    const f = (data as { version_id: string; object_path: string }[])[0];
    await admin.storage.from(BUCKET)
      .upload(f.object_path, bytes, { contentType: "video/mp4", upsert: false });
    objetos.push(f.object_path);
    await sa.cli.rpc("tutorial_finalize_upload", {
      p_version_id: f.version_id, p_real_size: bytes.byteLength,
      p_real_mime: "video/mp4", p_content_hash: await sha256(bytes),
      p_duration_seconds: 240 });
    return f;
  }

  try {
    // =====================================================================
    console.log("A · La identidad de bienvenida, la de siempre");
    // =====================================================================

    await check("A1. Hay UNA sola, y no cuelga de ninguna pantalla", async () => {
      assert((identidades ?? []).length === 1,
        `hay ${(identidades ?? []).length} identidades de bienvenida`);
      assert(bienvenida.page_key === null, "la bienvenida cuelga de una pantalla");
      assert(bienvenida.module_key === null, "la bienvenida cuelga de un módulo");
    });

    await check("A2. Y B4 no creó ninguna segunda", async () => {
      const { error } = await sa.cli.from("platform_tutorials")
        .insert({ tutorial_type: "welcome", page_key: null, module_key: null,
                  title: `Segunda bienvenida ${sello}` });
      assert(error, "se pudo crear una segunda identidad de bienvenida");
    });

    // =====================================================================
    console.log("\nB · Con vídeo publicado, se ve");
    // =====================================================================

    const v1 = await subir(5);
    await sa.cli.rpc("tutorial_publish_version",
      { p_version_id: v1.version_id, p_change_note: "QA B4 v1" });

    await check("B1. Ana, sin haber dicho nada, recibe el vídeo", async () => {
      const suprimida = await hasUserPreference("welcome_video_suppressed", ana.cli);
      assert(suprimida === false, `la preferencia de Ana dice «${suprimida}»`);
      const encontrado = await getWelcomeTutorial(ana.cli);
      assert(encontrado.status === "ok" && encontrado.tutorial,
        "Ana no ve ningún vídeo de bienvenida");
      const firmado = await signTutorialPlayback({ tutorialType: "welcome" }, ana.cli);
      assert(firmado.status === "ok", `no se pudo firmar: ${firmado.status}`);
      const res = await fetch(firmado.url);
      assert(res.ok, `la URL firmada devolvió ${res.status}`);
    });

    await check("B2. Y se puede adelantar · un rango devuelve 206", async () => {
      const firmado = await signTutorialPlayback({ tutorialType: "welcome" }, ana.cli);
      assert(firmado.status === "ok", "no se pudo firmar");
      const res = await fetch(firmado.url, { headers: { Range: "bytes=1000-1999" } });
      assert(res.status === 206, `un rango devolvió ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      assert(bytes.byteLength === 1000, `el rango trajo ${bytes.byteLength} bytes`);
      assert(bytes[0] === (1000 * 5) % 251, "los bytes no son los del tramo pedido");
    });

    // =====================================================================
    console.log("\nC · «No volver a mostrar» es para siempre");
    // =====================================================================

    await check("C1. Ana lo dice, y deja de recibirlo", async () => {
      const ok = await setUserPreference("welcome_video_suppressed", null, ana.cli);
      assert(ok, "no se pudo guardar la preferencia");
      const suprimida = await hasUserPreference("welcome_video_suppressed", ana.cli);
      assert(suprimida === true, `la preferencia de Ana dice «${suprimida}»`);
    });

    await check("C2. Beto NO se ve afectado · la preferencia es de la persona", async () => {
      const suprimida = await hasUserPreference("welcome_video_suppressed", beto.cli);
      assert(suprimida === false, `la preferencia de Beto dice «${suprimida}»`);
      const encontrado = await getWelcomeTutorial(beto.cli);
      assert(encontrado.status === "ok" && encontrado.tutorial, "Beto dejó de ver el vídeo");
    });

    await check("C3. Y PUBLICAR OTRA VERSIÓN no se lo devuelve a Ana", async () => {
      const v2 = await subir(9);
      await sa.cli.rpc("tutorial_publish_version",
        { p_version_id: v2.version_id, p_change_note: "QA B4 v2" });

      // La vigente cambió de verdad: si no, esta prueba no probaría nada.
      const encontrado = await getWelcomeTutorial(beto.cli);
      assert(encontrado.status === "ok" && encontrado.tutorial, "no hay vigente después de v2");
      assert(encontrado.tutorial.versionId === v2.version_id,
        "publicar la v2 no cambió la versión vigente");

      // Y Ana sigue habiendo dicho que no.
      const suprimida = await hasUserPreference("welcome_video_suppressed", ana.cli);
      assert(suprimida === true, "la v2 reinició la preferencia de Ana");
    });

    await check("C4. Ni nadie puede reiniciársela desde fuera", async () => {
      const { data } = await sa.cli.from("user_preferences")
        .delete().eq("user_id", ana.id).select("user_id");
      assert((data ?? []).length === 0,
        "el superadministrador reinició la preferencia de Ana");
    });

    // =====================================================================
    console.log("\nD · Sin vídeo publicado, no hay bienvenida");
    // =====================================================================

    await check("D1. Retirada la publicación, Beto no recibe nada", async () => {
      // `tutorial_unpublish` recibe el TUTORIAL, no la versión: retira la que
      // esté vigente. Es la vía canónica, y por eso se usa esta y no un update.
      const { error } = await sa.cli.rpc("tutorial_unpublish",
        { p_tutorial_id: bienvenida.id });
      assert(!error, `no se pudo retirar: ${error?.message}`);
      const encontrado = await getWelcomeTutorial(beto.cli);
      assert(encontrado.status === "ok", `la consulta falló: ${encontrado.status}`);
      assert(encontrado.tutorial === null, "sigue habiendo un vídeo vigente");
      const firmado = await signTutorialPlayback({ tutorialType: "welcome" }, beto.cli);
      assert(firmado.status === "not_published",
        `sin vídeo publicado se firmó igual: ${firmado.status}`);
    });

    await check("D2. Y eso no es una avería · las dos ausencias se distinguen", async () => {
      // «No hay vídeo» devuelve `not_published`, no `unavailable`. La diferencia
      // es la que decide si la interfaz calla o avisa.
      const firmado = await signTutorialPlayback({ tutorialType: "welcome" }, beto.cli);
      assert(firmado.status !== "unavailable",
        "no tener vídeo se presenta como una avería");
    });
  } finally {
    // Se deja como estaba: se retira lo que publicó la prueba y se vuelve a
    // publicar lo que hubiera antes.
    const { data: mias } = await admin.from("platform_tutorial_versions")
      .select("id").eq("tutorial_id", bienvenida?.id ?? "")
      .like("original_filename", "bienvenida-%");
    for (const v of mias ?? []) {
      const id = (v as { id: string }).id;
      await admin.from("platform_tutorial_versions").update({ effective_to: new Date().toISOString() })
        .eq("id", id).is("effective_to", null);
    }
    for (const p of objetos) await admin.storage.from(BUCKET).remove([p]);
    for (const v of previas ?? []) {
      await admin.from("platform_tutorial_versions")
        .update({ effective_to: null }).eq("id", (v as { id: string }).id);
    }
    for (const p of [sa, ana, beto]) {
      await admin.from("user_preferences").delete().eq("user_id", p.id);
      await admin.from("platform_staff").delete().eq("user_id", p.id);
      await admin.auth.admin.deleteUser(p.id);
    }
  }

  console.log(`\nPE-03B4 · bienvenida (base): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
