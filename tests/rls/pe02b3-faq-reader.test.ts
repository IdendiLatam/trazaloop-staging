/**
 * Trazaloop · PE-02B3 · Lo que lee quien consulta la FAQ, contra base REAL.
 *
 * Dos preguntas, y la segunda es la que importa:
 *
 *   · ¿llega lo publicado a quien corresponde?
 *   · ¿NO llega lo que no corresponde — ni por la lista, ni por la búsqueda, ni
 *     por el contador de una categoría, ni por las destacadas, ni pidiendo su
 *     identificador a mano?
 *
 * Correr: npm run test:pe02b3-faq-reader
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
const anonimo: SupabaseClient = createClient(URL, ANON,
  { auth: { autoRefreshToken: false, persistSession: false } });

async function persona(tag: string) {
  const email = `pe02b3-${tag}-${sello}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA B3 ${tag}` } });
  assert(!error && data.user, `crear ${tag}: ${error?.message}`);
  const client = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  assert(!e, `login ${tag}: ${e?.message}`);
  return { id: data.user!.id, client: client as unknown as SupabaseClient };
}

async function main() {
  const LEER = await import("../../lib/db/faq-public");
  const { faqListOutcome, moduleDisplayNames } = await import("../../lib/domain/faq-reader");
  const { COMMERCIAL_MODULES } = await import("../../lib/modules/catalog");

  const dato = <T,>(r: { status: "ok"; data: T } | { status: "unavailable" }, que: string): T => {
    assert(r.status === "ok", `no se pudo leer ${que}`);
    return r.data;
  };

  console.log("\nPE-02B3 · La FAQ que se lee · base real\n");

  const sa = await persona("sa");
  await admin.from("platform_staff")
    .insert({ user_id: sa.id, role_code: "superadmin", status: "active" });
  const miembro = await persona("miembro");
  // Una empresa SIN Textiles: es el escenario de la comprobación L.
  const { data: orgId } = await miembro.client.rpc("create_organization",
    { p_name: `QA B3 ${sello}` });
  assert(orgId, "crear empresa");
  await admin.from("organization_modules").update({ enabled: false })
    .eq("organization_id", orgId as string);

  // Material de prueba propio, además del sembrado por 0157.
  const { data: cat } = await sa.client.from("faq_categories")
    .select("id").eq("code", "soporte").single();
  const catId = (cat as { id: string }).id;

  async function crear(slug: string, visibility: "public" | "authenticated",
                       question: string, answer: string, publicar = true) {
    const { data, error } = await sa.client.from("faq_entries")
      .insert({ slug, category_id: catId, visibility }).select("id").single();
    assert(!error && data, `crear ${slug}: ${error?.message}`);
    const id = (data as { id: string }).id;
    await sa.client.from("faq_entry_drafts").insert({
      entry_id: id, language: "es", question, answer_short: answer,
      verification_status: "verified", source_basis: "prueba",
    });
    if (publicar) {
      const { error: e } = await sa.client.rpc("faq_publish_entry",
        { p_entry_id: id, p_language: "es", p_change_note: "alta" });
      assert(!e, `publicar ${slug}: ${e?.message}`);
    }
    return id;
  }

  const publica = await crear(`b3_publica_${sello}`, "public",
    "¿Pregunta pública de prueba con murciélago?", "Respuesta pública de prueba.");
  const conSesion = await crear(`b3_sesion_${sello}`, "authenticated",
    "¿Pregunta con sesión de prueba con murciélago?", "SOLO_CON_SESION_" + sello);
  await crear(`b3_borrador_${sello}`, "public",
    "¿Pregunta en borrador con murciélago?", "TEXTO_DE_BORRADOR_" + sello, false);
  const retirada = await crear(`b3_retirada_${sello}`, "public",
    "¿Pregunta retirada con murciélago?", "TEXTO_RETIRADO_" + sello);
  await sa.client.rpc("faq_unpublish_entry", { p_entry_id: retirada, p_language: "es" });

  // Una segunda revisión, para que exista historia cerrada.
  await sa.client.from("faq_entry_drafts")
    .update({ answer_short: "Respuesta pública de prueba, segunda." })
    .eq("entry_id", publica).eq("language", "es");
  await sa.client.rpc("faq_publish_entry",
    { p_entry_id: publica, p_language: "es", p_change_note: "segunda" });

  // ==========================================================================
  console.log("A–F · Qué se ve y qué no");
  // ==========================================================================

  await check("A. Sin sesión se lee lo público, publicado y vigente", async () => {
    const r = dato(await LEER.searchFaq({ audience: "public",
      search: "murciélago" }, anonimo), "la búsqueda pública");
    const slugs = r.rows.map((x) => x.slug);
    assert(slugs.includes(`b3_publica_${sello}`), "no llega la pública");
    assert(r.rows.find((x) => x.slug === `b3_publica_${sello}`)!.answerShort
      .includes("segunda"), "llega una versión que no es la vigente");
  });

  await check("B. Con sesión se lee además lo que la exige", async () => {
    const r = dato(await LEER.searchFaq({ audience: "authenticated",
      search: "murciélago" }, miembro.client), "la búsqueda con sesión");
    const slugs = r.rows.map((x) => x.slug);
    assert(slugs.includes(`b3_publica_${sello}`), "no llega la pública");
    assert(slugs.includes(`b3_sesion_${sello}`), "no llega la de sesión");
  });

  await check("C. Sin sesión NO se lee lo que exige sesión · por cinco caminos",
    async () => {
      // 1 · el listado
      const lista = dato(await LEER.searchFaq({ audience: "public" }, anonimo), "la lista");
      assert(!lista.rows.some((x) => x.slug === `b3_sesion_${sello}`),
        "la lista pública devolvió una entrada de sesión");

      // 2 · la búsqueda por su texto exacto
      const busca = dato(await LEER.searchFaq({ audience: "public",
        search: `SOLO_CON_SESION_${sello}` }, anonimo), "la búsqueda");
      assert(busca.rows.length === 0, "buscando su texto aparece una entrada de sesión");

      // 3 · pidiendo su identificador a mano
      const directa = dato(await LEER.getFaqAnswerBySlug("public",
        `b3_sesion_${sello}`, anonimo), "la búsqueda directa");
      assert(directa === null, "pidiendo el identificador se obtuvo una entrada de sesión");

      // 4 · el contador de su categoría
      const cats = dato(await LEER.listFaqCategoriesForReaders("public", anonimo),
        "las categorías");
      const catsSesion = dato(await LEER.listFaqCategoriesForReaders("authenticated",
        miembro.client), "las categorías con sesión");
      const soportePub = cats.find((c) => c.code === "soporte");
      const soporteSes = catsSesion.find((c) => c.code === "soporte");
      assert(soportePub && soporteSes, "falta la categoría de control");
      assert(soporteSes!.entries > soportePub!.entries,
        `el contador público (${soportePub!.entries}) no oculta las de sesión (${soporteSes!.entries})`);

      // 5 · las destacadas
      await sa.client.from("faq_entries").update({ is_featured: true }).eq("id", conSesion);
      const dest = dato(await LEER.listFeaturedFaq("public", 50, anonimo), "las destacadas");
      assert(!dest.some((x) => x.slug === `b3_sesion_${sello}`),
        "una destacada de sesión se coló en las destacadas públicas");
      await sa.client.from("faq_entries").update({ is_featured: false }).eq("id", conSesion);
    });

  await check("D. Un borrador no se lee por ninguna puerta", async () => {
    for (const [quien, cli, aud] of [
      ["sin sesión", anonimo, "public"], ["con sesión", miembro.client, "authenticated"],
    ] as const) {
      const busca = dato(await LEER.searchFaq({ audience: aud,
        search: `TEXTO_DE_BORRADOR_${sello}` }, cli), "la búsqueda");
      assert(busca.rows.length === 0, `${quien}: se encontró un borrador buscando su texto`);
      const directa = dato(await LEER.getFaqAnswerBySlug(aud,
        `b3_borrador_${sello}`, cli), "la búsqueda directa");
      assert(directa === null, `${quien}: se leyó un borrador por su identificador`);
    }
  });

  await check("E. Una retirada tampoco", async () => {
    const busca = dato(await LEER.searchFaq({ audience: "authenticated",
      search: `TEXTO_RETIRADO_${sello}` }, miembro.client), "la búsqueda");
    assert(busca.rows.length === 0, "se encontró una retirada");
    const directa = dato(await LEER.getFaqAnswerBySlug("authenticated",
      `b3_retirada_${sello}`, miembro.client), "la búsqueda directa");
    assert(directa === null, "se leyó una retirada por su identificador");
  });

  await check("F. Ni una revisión cerrada", async () => {
    const r = dato(await LEER.searchFaq({ audience: "public",
      search: "murciélago" }, anonimo), "la búsqueda");
    const suyas = r.rows.filter((x) => x.slug === `b3_publica_${sello}`);
    assert(suyas.length === 1, `la vigente aparece ${suyas.length} veces`);
    assert(!suyas[0].answerShort.endsWith("prueba."),
      "llegó la primera redacción, que ya está cerrada");
  });

  // ==========================================================================
  console.log("\nG–K · Cómo se navega");
  // ==========================================================================

  await check("G. Las destacadas salen del dato, no del código", async () => {
    const antes = dato(await LEER.listFeaturedFaq("public", 50, anonimo), "destacadas");
    assert(!antes.some((x) => x.slug === `b3_publica_${sello}`),
      "el escenario de control cambió");
    await sa.client.from("faq_entries").update({ is_featured: true }).eq("id", publica);
    const luego = dato(await LEER.listFeaturedFaq("public", 50, anonimo), "destacadas");
    assert(luego.some((x) => x.slug === `b3_publica_${sello}`),
      "destacar en la consola no cambió lo que se destaca");
    await sa.client.from("faq_entries").update({ is_featured: false }).eq("id", publica);
  });

  await check("H. Las categorías salen de la base, con su cuenta y su orden", async () => {
    const cats = dato(await LEER.listFaqCategoriesForReaders("public", anonimo), "categorías");
    assert(cats.length > 0, "no hay ninguna categoría");
    assert(cats.every((c) => c.entries > 0),
      "se ofrece una categoría vacía: un menú que lleva a una pantalla vacía");
    const codigos = cats.map((c) => c.code);
    assert(codigos.includes("primeros_pasos"), "falta la categoría inicial");
    // Que «Seguridad y privacidad» no se ofrezca es una promesa de la SIEMBRA,
    // no del catálogo: otra suite puede crear una entrada de prueba ahí y eso no
    // sería un fallo de este tramo. Se comprueba en P, acotado a lo sembrado.
    // Y el orden es el de la base, no alfabético.
    assert(codigos[0] === "primeros_pasos",
      `el orden no es el del catálogo: empieza por ${codigos[0]}`);
  });

  await check("I. La búsqueda entiende español", async () => {
    // Raíz común: «contraseña» encuentra «Perdí mi contraseña».
    const r1 = dato(await LEER.searchFaq({ audience: "public",
      search: "contraseña" }, anonimo), "la búsqueda");
    assert(r1.rows.some((x) => x.slug === "perdi_contrasena"),
      "buscar «contraseña» no encuentra la pregunta de la contraseña");
    // Plural y singular caen en la misma raíz.
    const r2 = dato(await LEER.searchFaq({ audience: "public",
      search: "certificaciones" }, anonimo), "la búsqueda");
    assert(r2.rows.some((x) => x.slug === "quality_certifica"),
      "el análisis en español no reduce plural a singular");
    // Y busca también en la respuesta, no solo en la pregunta.
    const r3 = dato(await LEER.searchFaq({ audience: "public",
      search: "organismo certificador" }, anonimo), "la búsqueda");
    assert(r3.rows.length > 0, "no se busca dentro de la respuesta");
  });

  await check("J. El filtro por tema filtra", async () => {
    const r = dato(await LEER.searchFaq({ audience: "public",
      categoryCode: "primeros_pasos" }, anonimo), "la búsqueda");
    assert(r.rows.length > 0, "el tema no devuelve nada");
    assert(r.rows.every((x) => x.categoryCode === "primeros_pasos"),
      "el filtro por tema deja pasar otros");
  });

  await check("K. Y el filtro por módulo, también", async () => {
    const r = dato(await LEER.searchFaq({ audience: "public",
      moduleKey: "quality" }, anonimo), "la búsqueda");
    assert(r.rows.length > 0, "el filtro por módulo no devuelve nada");
    assert(r.rows.every((x) => x.moduleKeys.includes("quality")),
      "el filtro por módulo deja pasar otras");
    // Y los nombres que se enseñan salen del catálogo, no de la base.
    const nombres = moduleDisplayNames(r.rows[0].moduleKeys,
      COMMERCIAL_MODULES.map((m) => ({ key: m.key, name: m.name })));
    assert(nombres[0]?.startsWith("Trazaloop"),
      `se enseñaría la clave interna: ${r.rows[0].moduleKeys[0]}`);
  });

  // ==========================================================================
  console.log("\nL–O · Lo que no se confunde");
  // ==========================================================================

  await check("L. No tener un módulo NO oculta la documentación de ese módulo",
    async () => {
      // La empresa de esta persona tiene TODOS los módulos apagados.
      const { data: mods } = await admin.from("organization_modules")
        .select("enabled").eq("organization_id", orgId as string);
      assert((mods ?? []).every((m) => (m as { enabled: boolean }).enabled === false),
        "el escenario de control cambió: la empresa tiene módulos activos");

      const r = dato(await LEER.searchFaq({ audience: "authenticated",
        moduleKey: "textiles" }, miembro.client), "la búsqueda");
      assert(r.rows.length > 0,
        "una empresa sin Textiles no puede leer la documentación de Textiles");
      const directa = dato(await LEER.getFaqAnswerBySlug("authenticated",
        "pasaporte_textil", miembro.client), "la respuesta");
      assert(directa !== null, "no se puede abrir una respuesta sobre un módulo no contratado");
    });

  await check("M. El enlace directo funciona, y es estable", async () => {
    const r = dato(await LEER.getFaqAnswerBySlug("public",
      "que_es_trazaloop", anonimo), "la respuesta");
    assert(r, "no se abre por su identificador");
    assert(r!.question.includes("Trazaloop"), "no llega la pregunta");
    // El identificador no se deriva del texto: cambiarlo no lo mueve.
    const antes = r!.slug;
    await sa.client.from("faq_entry_drafts")
      .update({ question: "¿Qué es Trazaloop, exactamente?" })
      .eq("entry_id", (await sa.client.from("faq_entries").select("id")
        .eq("slug", "que_es_trazaloop").single()).data!.id).eq("language", "es");
    const luego = dato(await LEER.getFaqAnswerBySlug("public",
      "que_es_trazaloop", anonimo), "la respuesta");
    assert(luego?.slug === antes,
      "reformular la pregunta movió su identificador y rompería un marcador");
  });

  await check("N. Una avería NO es «no hay resultados»", async () => {
    const roto = new Proxy(anonimo, {
      get(target, prop) {
        if (prop === "from") {
          return () => {
            const fin = { data: null, error: { message: "conexión interrumpida" }, count: null };
            const enc: Record<string, unknown> = {};
            const sigue = () => enc;
            Object.assign(enc, {
              select: sigue, eq: sigue, neq: sigue, contains: sigue, textSearch: sigue,
              order: sigue, limit: async () => fin, range: async () => fin,
              maybeSingle: async () => fin,
              then: (r: (v: unknown) => unknown) => Promise.resolve(fin).then(r),
            });
            return enc;
          };
        }
        return Reflect.get(target, prop);
      },
    }) as unknown as SupabaseClient;

    const r = await LEER.searchFaq({ audience: "public", search: "lo que sea" }, roto);
    assert(r.status === "unavailable", `una lectura rota llegó como «${r.status}»`);
    const c = await LEER.listFaqCategoriesForReaders("public", roto);
    assert(c.status === "unavailable", "las categorías rotas llegaron como lista vacía");
    const a = await LEER.getFaqAnswerBySlug("public", "que_es_trazaloop", roto);
    assert(a.status === "unavailable", "una respuesta rota llegó como «no existe»");

    // Y la pantalla lo cuenta distinto de un vacío.
    assert(faqListOutcome({ unavailable: true, total: 0, hasSearch: true,
      hasCategory: false, anyPublishedAtAll: true }) === "unavailable",
      "una avería se contaría como «sin resultados»");
    assert(faqListOutcome({ unavailable: false, total: 0, hasSearch: true,
      hasCategory: false, anyPublishedAtAll: true }) === "no_search_results",
      "una búsqueda sin resultados no se distingue");
    assert(faqListOutcome({ unavailable: false, total: 0, hasSearch: false,
      hasCategory: false, anyPublishedAtAll: false }) === "nothing_published",
      "«todavía no hay nada publicado» no se distingue");
  });

  await check("O. No se filtra ni una columna de gobierno editorial", async () => {
    const { data } = await anonimo.from("v_faq_public").select("*")
      .eq("slug", `b3_publica_${sello}`).single();
    const columnas = Object.keys(data as Record<string, unknown>);
    for (const prohibida of ["verification_status", "source_basis", "verification_note",
      "verified_at", "change_note", "created_by", "external_source_url",
      "content_hash", "revision_number", "effective_to"]) {
      assert(!columnas.includes(prohibida), `la vista pública expone «${prohibida}»`);
    }
    // Y la capa del producto tampoco los pide.
    const fuente = (await import("node:fs")).readFileSync("lib/db/faq-public.ts", "utf8");
    for (const prohibida of ["source_basis", "verification_note", "verification_status"]) {
      assert(!fuente.includes(prohibida), `la capa del producto pide «${prohibida}»`);
    }
  });

  // ==========================================================================
  console.log("\nP · El contenido sembrado");
  // ==========================================================================

  await check("P. Se sembró contenido útil, y NADA bloqueado", async () => {
    const todas = dato(await LEER.searchFaq({ audience: "authenticated",
      pageSize: 200 }, miembro.client), "todas");
    const sembradas = todas.rows.filter((x) => !/^(qa_|b3_)/.test(x.slug));
    assert(sembradas.length >= 20, `solo hay ${sembradas.length} respuestas sembradas`);

    // Nada de seguridad, nada de entrenamiento de modelos, nada de precios.
    assert(!sembradas.some((x) => x.categoryCode === "seguridad"),
      "la siembra publicó una respuesta de seguridad, y esa categoría es de B5");
    for (const s of sembradas) {
      const texto = `${s.question} ${s.answerShort} ${s.answerLong ?? ""}`.toLowerCase();
      assert(!/entrenar model|entrenamiento de model/.test(texto),
        `se publicó la respuesta del entrenamiento de modelos: ${s.slug}`);
      assert(!/(us\$|usd|€|\d+\s?(mb|gb)\b)/i.test(texto),
        `una respuesta escribe una cifra comercial: ${s.slug}`);
      // Frases enteras, no fragmentos: «no emite certificaciones» contiene
      // «te certifica» dentro de «emite», y es justo lo contrario de una
      // promesa de certificación.
      assert(!/garantiza el cumplimiento|garantiza la conformidad|estás? certificad|queda certificad|trazaloop te certifica/i
        .test(texto), `una respuesta afirma cumplimiento: ${s.slug}`);
    }
  });

  await check("P2. Y la siembra pasó por la barrera, no por debajo", async () => {
    // Si la siembra hubiera insertado revisiones a mano, esto no fallaría.
    const { data: entrada } = await sa.client.from("faq_entries")
      .select("id").eq("slug", "que_es_trazaloop").single();
    const id = (entrada as { id: string }).id;
    await sa.client.from("faq_entry_drafts")
      .update({ verification_status: "not_verified" })
      .eq("entry_id", id).eq("language", "es");
    const { error } = await sa.client.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es" });
    assert(error, "la barrera de verificación dejó de aplicarse tras la siembra");
    await sa.client.from("faq_entry_drafts")
      .update({ verification_status: "verified" })
      .eq("entry_id", id).eq("language", "es");
  });

  console.log(`\nPE-02B3 · lectura: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
