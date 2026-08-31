/**
 * Trazaloop · PE-02B4 · La ayuda por HTTP · U–AA.
 *
 * Lo que solo se ve aquí: que «Ayuda» esté de verdad en la barra superior de
 * cada pantalla autenticada, que lleve a la FAQ, y que el botón «i» de una
 * pantalla real pinte el texto ADMINISTRADO —el de la base— y no el escrito en
 * el código.
 *
 * Requisitos: `npm run build` previo y Supabase local en marcha.
 * Correr: npm run test:pe02b4-e2e
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

loadEnv({ path: ".env.local" });

const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_SECRET = process.env.ACTIVE_ORG_COOKIE_SECRET ?? null;
if (!URL_SB || !ANON || !SERVICE) { console.error("Faltan variables."); process.exit(1); }

const PORT = Number(process.env.PE02B4_PORT ?? 3194);
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
    .replace(/\s+/g, " ");
}
const has = (html: string, s: string) => flat(html).toLowerCase().includes(s.toLowerCase());
function links(html: string): { href: string; text: string }[] {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ href: m[1].replace(/&amp;/g, "&"), text: flat(m[2]).trim() }));
}
/** ¿Hay un enlace que se lea «Ayuda» y lleve a la ayuda? */
function tieneAyuda(html: string): boolean {
  return links(html).some((l) => l.href === "/faq" && /^ayuda$/i.test(l.text));
}

async function main() {
  console.log("\nPE-02B4 · La ayuda por HTTP · U…AA\n");
  console.log("  · levantando el build de producción…");
  servers.push(spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, QUALITY_MODULE_ENABLED: "true" }, stdio: "ignore",
  }));
  await waitUp();

  const sello = Date.now();
  const password = "Trazaloop-Test-1234";
  const email = `pe02b4-e2e-${sello}@test.trazaloop.dev`;
  const { data: creado } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B4" } });
  assert(creado.user, "crear persona");
  const cli: SupabaseClient = createClient(URL_SB!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: sesion } = await cli.auth.signInWithPassword({ email, password });
  assert(sesion.session, "iniciar sesión");
  await cli.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "b4" });
  const { data: orgId } = await cli.rpc("create_organization", { p_name: `QA B4 ${sello}` });

  // Todos los módulos activos: hace falta para recorrer los tres shells.
  await admin.from("organization_modules")
    .update({ enabled: true, access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgId as string);

  const b64 = Buffer.from(JSON.stringify(sesion.session), "utf8").toString("base64url");
  const firma = ORG_SECRET
    ? `.${createHmac("sha256", ORG_SECRET).update(String(orgId)).digest("base64url")}` : "";
  const cookie = `${AUTH_COOKIE}=base64-${b64}; tz-active-org=${orgId}${firma}`;
  const get = async (path: string) => {
    const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
    return { status: r.status, location: r.headers.get("location"),
             body: r.status === 200 ? await r.text() : "" };
  };
  const anon = async (path: string) => {
    const r = await fetch(`${BASE}${path}`, { redirect: "manual" });
    return { status: r.status, body: r.status === 200 ? await r.text() : "" };
  };

  // =========================================================================
  console.log("U–X · «Ayuda» en la barra superior");
  // =========================================================================

  await check("U. La puerta de módulos la tiene", async () => {
    const r = await get("/modules");
    assert(r.status === 200, `/modules dio ${r.status} → ${r.location ?? "—"}`);
    assert(tieneAyuda(r.body), "la puerta no tiene una entrada «Ayuda» que lleve a /faq");
  });

  await check("V. Quality la tiene", async () => {
    const r = await get("/quality");
    assert(r.status === 200, `/quality dio ${r.status} → ${r.location ?? "—"}`);
    assert(tieneAyuda(r.body), "el shell de Quality no tiene «Ayuda»");
  });

  await check("W. PCR la tiene", async () => {
    const r = await get("/dashboard");
    assert(r.status === 200, `/dashboard dio ${r.status} → ${r.location ?? "—"}`);
    assert(tieneAyuda(r.body), "el shell de PCR no tiene «Ayuda»");
  });

  await check("X. Textiles la tiene", async () => {
    const r = await get("/textiles");
    assert(r.status === 200, `/textiles dio ${r.status} → ${r.location ?? "—"}`);
    assert(tieneAyuda(r.body), "el shell de Textiles no tiene «Ayuda»");
  });

  await check("X2. Y las pantallas transversales, también", async () => {
    for (const ruta of ["/settings/profile", "/team", "/support", "/select-org"]) {
      const r = await get(ruta);
      assert(r.status === 200 || r.status === 307, `${ruta} dio ${r.status}`);
      if (r.status === 200) {
        assert(tieneAyuda(r.body), `${ruta} no tiene «Ayuda»`);
      }
    }
  });

  // =========================================================================
  console.log("\nY–AA · A dónde lleva, y dónde no está");
  // =========================================================================

  await check("Y. Lleva a la FAQ, y la FAQ abre", async () => {
    // Desde PE-02B6 hay DOS entradas «Ayuda» en la misma pantalla: la de la
    // barra superior, que va a `/faq` a secas, y la del menú lateral, que
    // arrastra el módulo —`/faq?m=quality`— para no devolver a nadie al shell
    // de CPR. Las dos son correctas, así que se comprueban las dos en vez de
    // quedarse con la primera que aparezca en el HTML.
    const r = await get("/quality");
    const entradas = links(r.body).filter((l) => /^ayuda$/i.test(l.text));
    assert(entradas.length >= 1, "no hay ninguna entrada «Ayuda»");
    for (const enlace of entradas) {
      assert(/^\/faq(\?|$)/.test(enlace.href),
        `una entrada «Ayuda» lleva a ${enlace.href}`);
      const faq = await get(enlace.href);
      assert(faq.status === 200, `${enlace.href} dio ${faq.status}`);
      assert(has(faq.body, "¿En qué podemos ayudarte?"),
        `${enlace.href} no llegó a la FAQ`);
    }
    assert(entradas.some((l) => l.href === "/faq"),
      "ninguna entrada «Ayuda» lleva a la FAQ sin arrastrar el módulo");
  });

  await check("Y2. Y se llama «Ayuda», no «FAQ»", async () => {
    const r = await get("/quality");
    const enlace = links(r.body).find((l) => l.href === "/faq");
    assert(enlace, "no hay enlace a la ayuda");
    assert(/^ayuda$/i.test(enlace!.text),
      `la entrada global se llama «${enlace!.text}»: va a crecer con el tutorial y el soporte`);
  });

  await check("Z. En pantalla estrecha sigue estando", async () => {
    // No se esconde tras el menú plegable: el enlace está en la barra, sin
    // clases que lo oculten por tamaño.
    const r = await get("/quality");
    const i = r.body.indexOf('href="/faq"');
    const contexto = r.body.slice(Math.max(0, i - 300), i + 100);
    assert(!/hidden [a-z]{2}:(flex|block|inline)/.test(contexto),
      "la ayuda se esconde en pantallas estrechas");
  });

  await check("AA. El login y el registro no cambiaron", async () => {
    for (const ruta of ["/login", "/register"]) {
      const r = await anon(ruta);
      if (r.status !== 200) continue;
      assert(!tieneAyuda(r.body), `${ruta} ganó una entrada de ayuda del shell`);
    }
    // Y la portada pública conserva la suya, que es de B3 y se llama igual.
    const portada = await anon("/");
    assert(portada.status === 200, `la portada dio ${portada.status}`);
    assert(links(portada.body).some((l) => l.href === "/faq"),
      "la portada perdió su enlace a la ayuda");
  });

  // =========================================================================
  console.log("\nAB · El botón «i», con contenido administrado");
  // =========================================================================

  await check("AB. La pantalla pinta el texto de la BASE, no el del código", async () => {
    const r = await get("/quality/context/interested-parties");
    assert(r.status === 200, `la pantalla dio ${r.status} → ${r.location ?? "—"}`);
    // Se mira el cuerpo CRUDO y no el texto visible: el nombre accesible del
    // botón es un atributo, y el panel solo se pinta al pulsarlo —su contenido
    // viaja en la carga útil de la página—. Buscarlo en el texto plano diría
    // que no está cuando sí está.
    assert(r.body.includes('aria-label="Más información"'), "no hay ningún botón «i»");

    const { data: item } = await admin.from("help_items").select("id")
      .eq("page_key", "quality.context.interested_parties")
      .eq("target_key", "overview").single();
    const id = (item as { id: string }).id;
    const { data: rev } = await admin.from("help_item_revisions")
      .select("title, explanation, example, technical_reference, normative_class")
      .eq("help_item_id", id).is("effective_to", null).single();
    const original = rev as Record<string, unknown>;

    const publicar = async (explicacion: string, nota: string) => {
      await admin.from("help_item_drafts").upsert({
        help_item_id: id, language: "es",
        title: String(original.title), explanation: explicacion,
        example: original.example, technical_reference: original.technical_reference,
        normative_class: original.normative_class,
      }, { onConflict: "help_item_id,language" });
      const { error } = await admin.rpc("help_publish_item_internal",
        { p_item_id: id, p_language: "es", p_change_note: nota, p_actor: null });
      assert(!error, `publicar «${nota}»: ${error?.message}`);
    };

    // Se cambia el texto administrado y la pantalla lo refleja: si estuviera
    // leyendo la constante del código, no cambiaría nada.
    //
    // El `finally` no es decoración: sin él, una comprobación que falle a mitad
    // dejaría la base con el texto de prueba publicado, y la siguiente ejecución
    // fallaría por una razón que no es la suya.
    try {
      await publicar(`MARCA_ADMINISTRADA_${sello} · texto que solo existe en la base.`,
        "prueba");
      const luego = await get("/quality/context/interested-parties");
      assert(luego.body.includes(`MARCA_ADMINISTRADA_${sello}`),
        "la pantalla sigue leyendo el texto escrito en el código");
    } finally {
      await publicar(String(original.explanation), "se deshace la prueba");
    }

    const final = await get("/quality/context/interested-parties");
    assert(final.body.includes("parte interesada es quien puede afectar"),
      "no se restableció el texto original");
  });

  await check("AB2. Con sus tres partes, y sin jerga interna", async () => {
    const r = await get("/quality/context/interested-parties");
    for (const rotulo of ["QUÉ ES", "EJEMPLO", "RESPALDO"]) {
      assert(r.body.includes(rotulo), `no se ve el rótulo «${rotulo}»`);
    }
    for (const jerga of ["page_key", "target_kind", "normative_class", "help_item",
      "do_not_invent", "revision_number"]) {
      assert(!r.body.includes(jerga), `la pantalla filtra «${jerga}»`);
    }
  });

  await check("AB3. El respaldo es referencia, no cumplimiento", async () => {
    const r = await get("/quality/context/interested-parties");
    assert(r.body.includes("ISO 9001:2015"), "no se ve la referencia normativa");
    for (const p of ["garantiza el cumplimiento", "quedas certificad", "estás certificad"]) {
      assert(!r.body.toLowerCase().includes(p), `la ayuda afirma cumplimiento: «${p}»`);
    }
  });

  await check("AB4. La consola de ayuda no se ofrece a una empresa", async () => {
    const dentro = await get("/quality");
    assert(!links(dentro.body).some((l) => l.href.startsWith("/platform")),
      "a una empresa se le ofrece la consola de plataforma");
    const consola = await get("/platform/help");
    assert(consola.status !== 200 || !has(consola.body, "Nueva ayuda"),
      "una empresa entró a administrar la ayuda");
  });

  stopServers();
  console.log(`\nPE-02B4 · ayuda (HTTP): ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); stopServers(); process.exit(1); });
