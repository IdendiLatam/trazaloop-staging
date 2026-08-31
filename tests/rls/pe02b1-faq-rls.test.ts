/**
 * Trazaloop · PE-02B1 · Quién puede leer la FAQ, contra base REAL.
 *
 * La matriz A–O del encargo. Lo que se comprueba aquí no lo puede comprobar
 * ninguna prueba de código fuente: que el rol anónimo no alcance un borrador,
 * que un administrador de empresa no pueda tocar el catálogo global, y que la
 * procedencia interna de una afirmación de seguridad no salga por ninguna de
 * las puertas públicas.
 *
 * Correr: npm run test:pe02b1-faq-rls
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

/** El visitante sin sesión: la clave pública y nada más. */
const anonimo: SupabaseClient = createClient(URL, ANON,
  { auth: { autoRefreshToken: false, persistSession: false } });

async function persona(tag: string) {
  const email = `pe02b1-${tag}-${sello}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA PE-02B1 ${tag}` } });
  assert(!error && data.user, `crear ${tag}: ${error?.message}`);
  const client = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  assert(!e, `login ${tag}: ${e?.message}`);
  return { id: data.user!.id, client: client as unknown as SupabaseClient };
}

/** Crea una entrada con su borrador. Escribe con el superadministrador, que es
 *  el camino real: la clave de servicio no vale porque `auth.uid()` sería nulo
 *  y la función de publicación no sabría quién publicó. */
async function crearEntrada(
  sa: SupabaseClient,
  slug: string,
  opts: {
    categoria: string; visibility: "public" | "authenticated";
    question: string; answerShort: string; answerLong?: string | null;
    verification?: string; note?: string | null; source?: string | null;
    scope?: "global" | "modules"; modules?: string[];
  }
) {
  const { data: cat } = await sa.from("faq_categories")
    .select("id").eq("code", opts.categoria).single();
  assert(cat, `categoría ${opts.categoria}`);
  const { data: entrada, error } = await sa.from("faq_entries").insert({
    slug, category_id: (cat as { id: string }).id, visibility: opts.visibility,
    scope: opts.scope ?? "global", module_keys: opts.modules ?? [],
  }).select("id").single();
  assert(!error && entrada, `crear entrada ${slug}: ${error?.message}`);
  const id = (entrada as { id: string }).id;
  const { error: eb } = await sa.from("faq_entry_drafts").insert({
    entry_id: id, language: "es",
    question: opts.question, answer_short: opts.answerShort,
    answer_long: opts.answerLong ?? null,
    verification_status: opts.verification ?? "verified",
    verification_note: opts.note ?? null,
    source_basis: opts.source ?? "PE-02A · auditoría",
  });
  assert(!eb, `crear borrador ${slug}: ${eb?.message}`);
  return id;
}

async function main() {
  console.log("\nPE-02B1 · La FAQ · quién lee qué\n");

  const sa = await persona("superadmin");
  await admin.from("platform_staff")
    .insert({ user_id: sa.id, role_code: "superadmin", status: "active" });

  const soporte = await persona("support");
  await admin.from("platform_staff")
    .insert({ user_id: soporte.id, role_code: "support", status: "active" });

  // Un administrador de EMPRESA: tiene su empresa y manda en ella, y eso no le
  // da ni una palabra sobre el catálogo global.
  const empresa = await persona("admin-empresa");
  const { data: orgId } = await empresa.client.rpc("create_organization",
    { p_name: `QA PE-02B1 ${sello}` });
  assert(orgId, "crear empresa");

  const miembro = await persona("miembro");

  // El material de prueba.
  const publicada = await crearEntrada(sa.client, `qa_publica_${sello}`, {
    categoria: "seguridad", visibility: "public",
    question: "¿Puede otra empresa ver mi información de prueba?",
    answerShort: "No. Esta es una respuesta de prueba de PE-02B1.",
    answerLong: "Detalle largo de prueba.",
    verification: "verified", source: "PE-02A §1 · medición del esquema",
  });
  const autenticada = await crearEntrada(sa.client, `qa_autenticada_${sello}`, {
    categoria: "cuenta_empresa", visibility: "authenticated",
    question: "¿Pregunta de prueba solo para quien tiene sesión?",
    answerShort: "Sí, esta respuesta exige sesión.",
    verification: "verified",
  });
  const borrador = await crearEntrada(sa.client, `qa_borrador_${sello}`, {
    categoria: "soporte", visibility: "public",
    question: "¿Pregunta de prueba que nunca se publicó?",
    answerShort: "SECRETO_DE_BORRADOR_" + sello,
    verification: "verified",
  });
  const retirada = await crearEntrada(sa.client, `qa_retirada_${sello}`, {
    categoria: "soporte", visibility: "public",
    question: "¿Pregunta de prueba que se retiró?",
    answerShort: "Esta respuesta se retiró.",
    verification: "verified",
  });

  for (const id of [publicada, autenticada, retirada]) {
    const { error } = await sa.client.rpc("faq_publish_entry",
      { p_entry_id: id, p_language: "es", p_change_note: "alta de prueba" });
    assert(!error, `publicar: ${error?.message}`);
  }
  // Y la retirada se retira: publicada primero, para que exista su historia.
  await sa.client.rpc("faq_unpublish_entry", { p_entry_id: retirada, p_language: "es" });

  // Una segunda revisión de la publicada, para que haya historia cerrada.
  await sa.client.from("faq_entry_drafts").update({
    answer_short: "No. Segunda redacción de prueba.",
  }).eq("entry_id", publicada).eq("language", "es");
  await sa.client.rpc("faq_publish_entry",
    { p_entry_id: publicada, p_language: "es", p_change_note: "segunda" });

  // ==========================================================================
  console.log("A–E · El visitante SIN sesión");
  // ==========================================================================

  await check("A. Lee la respuesta pública, publicada y vigente", async () => {
    const { data, error } = await anonimo.from("v_faq_public")
      .select("slug, question, answer_short, category_code")
      .eq("slug", `qa_publica_${sello}`);
    assert(!error, `la lectura pública falló: ${error?.message}`);
    assert(data && data.length === 1, `devolvió ${data?.length} filas`);
    const fila = data![0] as Record<string, unknown>;
    assert(String(fila.answer_short).includes("Segunda redacción"),
      `no llegó la vigente sino «${fila.answer_short}»`);
    assert(fila.category_code === "seguridad", "no llega la categoría");
  });

  await check("B. NO lee una respuesta que exige sesión", async () => {
    const { data } = await anonimo.from("v_faq_public")
      .select("slug").eq("slug", `qa_autenticada_${sello}`);
    assert(!data || data.length === 0, "el anónimo alcanzó una entrada autenticada");
    // Y tampoco por la puerta de quien tiene sesión.
    const { data: d2, error: e2 } = await anonimo.from("v_faq_authenticated").select("slug");
    assert(e2 || !d2 || d2.length === 0,
      "el anónimo leyó la vista de quien tiene sesión");
  });

  await check("C. NO lee un borrador · ni una palabra", async () => {
    const { data } = await anonimo.from("v_faq_public")
      .select("slug, answer_short").eq("slug", `qa_borrador_${sello}`);
    assert(!data || data.length === 0, "el anónimo alcanzó un borrador");
    // Y la tabla de borradores no existe para él.
    const { data: d2, error } = await anonimo.from("faq_entry_drafts").select("question");
    assert(error || !d2 || d2.length === 0,
      "el anónimo pudo consultar la tabla de borradores");
    // Ni siquiera buscando el texto exacto del borrador.
    const { data: d3 } = await anonimo.from("v_faq_public")
      .select("slug").ilike("answer_short", `%SECRETO_DE_BORRADOR_${sello}%`);
    assert(!d3 || d3.length === 0, "el texto del borrador se puede encontrar buscando");
  });

  await check("D. NO lee una respuesta retirada", async () => {
    const { data } = await anonimo.from("v_faq_public")
      .select("slug").eq("slug", `qa_retirada_${sello}`);
    assert(!data || data.length === 0, "el anónimo alcanzó una entrada retirada");
  });

  await check("E. NO lee la historia: ni revisiones cerradas ni sus tablas", async () => {
    const { data, error } = await anonimo.from("faq_entry_revisions").select("question");
    assert(error || !data || data.length === 0,
      "el anónimo pudo consultar las revisiones");
    for (const t of ["faq_entries", "faq_categories"]) {
      const { data: d, error: e } = await anonimo.from(t).select("id");
      assert(e || !d || d.length === 0, `el anónimo pudo consultar ${t}`);
    }
    // Por la vista pública solo llega UNA fila de la publicada: la vigente.
    const { data: pub } = await anonimo.from("v_faq_public")
      .select("slug").eq("slug", `qa_publica_${sello}`);
    assert(pub && pub.length === 1, `la vista pública devolvió ${pub?.length} versiones`);
  });

  await check("O. La procedencia interna NO sale por ninguna puerta pública",
    async () => {
      const { data } = await anonimo.from("v_faq_public").select("*")
        .eq("slug", `qa_publica_${sello}`).single();
      const columnas = Object.keys(data as Record<string, unknown>);
      for (const prohibida of ["source_basis", "verification_note", "verification_status",
        "verified_at", "change_note", "created_by", "external_source_url", "id",
        "entry_id", "revision_number", "effective_to"]) {
        assert(!columnas.includes(prohibida),
          `la vista pública expone «${prohibida}»`);
      }
      // Y la misma comprobación con sesión: tampoco ahí.
      const { data: aut } = await miembro.client.from("v_faq_authenticated").select("*")
        .eq("slug", `qa_publica_${sello}`).single();
      const cols2 = Object.keys(aut as Record<string, unknown>);
      for (const prohibida of ["source_basis", "verification_note", "change_note",
        "created_by", "verified_at"]) {
        assert(!cols2.includes(prohibida),
          `la vista con sesión expone «${prohibida}»`);
      }
    });

  // ==========================================================================
  console.log("\nF–G · Con sesión");
  // ==========================================================================

  await check("F. Un miembro lee lo público", async () => {
    const { data, error } = await miembro.client.from("v_faq_authenticated")
      .select("slug").eq("slug", `qa_publica_${sello}`);
    assert(!error, `falló: ${error?.message}`);
    assert(data && data.length === 1, "no llega la respuesta pública");
  });

  await check("G. Y también lo que exige sesión", async () => {
    const { data } = await miembro.client.from("v_faq_authenticated")
      .select("slug").eq("slug", `qa_autenticada_${sello}`);
    assert(data && data.length === 1, "no llega la respuesta autenticada");
  });

  await check("G2. Pero no la historia, ni los borradores, ni las tablas", async () => {
    for (const t of ["faq_entries", "faq_entry_revisions", "faq_entry_drafts",
      "faq_categories"]) {
      const { data, error } = await miembro.client.from(t).select("id");
      assert(error || !data || data.length === 0,
        `un miembro pudo consultar ${t} directamente`);
    }
    const { data: b } = await miembro.client.from("v_faq_authenticated")
      .select("slug").eq("slug", `qa_borrador_${sello}`);
    assert(!b || b.length === 0, "un miembro alcanzó un borrador");
  });

  // ==========================================================================
  console.log("\nH–J · Quién escribe");
  // ==========================================================================

  await check("H. Un administrador de EMPRESA no puede tocar la FAQ global",
    async () => {
      const { data: cat } = await sa.client.from("faq_categories")
        .select("id").eq("code", "soporte").single();
      const { error: eIns } = await empresa.client.from("faq_entries").insert({
        slug: `qa_intruso_${sello}`, category_id: (cat as { id: string }).id,
        visibility: "public",
      });
      assert(eIns, "un administrador de empresa creó una entrada de la FAQ global");

      const { error: eUpd, count } = await empresa.client.from("faq_entries")
        .update({ is_featured: true }, { count: "exact" }).eq("id", publicada);
      assert(eUpd || count === 0,
        "un administrador de empresa modificó una entrada global");

      const { error: ePub } = await empresa.client.rpc("faq_publish_entry",
        { p_entry_id: publicada, p_language: "es" });
      assert(ePub, "un administrador de empresa pudo publicar");

      const { error: eCat } = await empresa.client.from("faq_categories")
        .insert({ code: `qa_${sello}`, label: "Intrusa" });
      assert(eCat, "un administrador de empresa creó una categoría");
    });

  await check("I. El superadministrador sí administra", async () => {
    const { data, error } = await sa.client.from("faq_entries")
      .select("slug, status").eq("id", publicada).single();
    assert(!error && data, `el superadministrador no ve la entrada: ${error?.message}`);
    assert((data as { status: string }).status === "published", "la entrada no quedó publicada");

    const { error: eUpd } = await sa.client.from("faq_entries")
      .update({ is_featured: true }).eq("id", publicada);
    assert(!eUpd, `el superadministrador no pudo destacar: ${eUpd?.message}`);

    const { data: cats } = await sa.client.from("faq_categories").select("code");
    assert(cats && cats.length >= 10, `ve ${cats?.length} categorías de 10`);
  });

  await check("J. Soporte VE y no ESCRIBE", async () => {
    const { data, error } = await soporte.client.from("faq_entries")
      .select("slug").eq("id", borrador);
    assert(!error, `soporte no pudo leer: ${error?.message}`);
    assert(data && data.length === 1, "soporte no ve un borrador que debería revisar");

    const { data: rev } = await soporte.client.from("faq_entry_revisions")
      .select("revision_number").eq("entry_id", publicada);
    assert(rev && rev.length === 2, `soporte ve ${rev?.length} revisiones de 2`);

    const { error: eUpd, count } = await soporte.client.from("faq_entries")
      .update({ is_featured: true }, { count: "exact" }).eq("id", borrador);
    assert(eUpd || count === 0, "soporte modificó una entrada");

    const { error: ePub } = await soporte.client.rpc("faq_publish_entry",
      { p_entry_id: borrador, p_language: "es" });
    assert(ePub, "soporte pudo publicar");
  });

  // ==========================================================================
  console.log("\nN · Aplicabilidad de módulo ≠ derecho de acceso");
  // ==========================================================================

  await check("N. Una respuesta sobre un módulo no contratado SÍ se lee", async () => {
    // La empresa de prueba no tiene Textiles activo, y aun así tiene que poder
    // leer qué hace Textiles: la visibilidad es editorial (PEH-05).
    const textiles = await crearEntrada(sa.client, `qa_textiles_${sello}`, {
      categoria: "textiles", visibility: "public",
      question: "¿Qué hace Trazaloop Textiles, en una prueba?",
      answerShort: "Explica el módulo aunque no lo tengas contratado.",
      scope: "modules", modules: ["textiles"], verification: "verified",
    });
    await sa.client.rpc("faq_publish_entry", { p_entry_id: textiles, p_language: "es" });

    const { data: sinSesion } = await anonimo.from("v_faq_public")
      .select("slug, module_keys").eq("slug", `qa_textiles_${sello}`);
    assert(sinSesion && sinSesion.length === 1,
      "una respuesta sobre un módulo no se lee sin sesión");
    assert((sinSesion![0] as { module_keys: string[] }).module_keys[0] === "textiles",
      "no llega a qué módulo se refiere");

    const { data: conSesion } = await empresa.client.from("v_faq_authenticated")
      .select("slug").eq("slug", `qa_textiles_${sello}`);
    assert(conSesion && conSesion.length === 1,
      "la empresa sin Textiles no puede leer sobre Textiles");
  });

  await check("N2. La aplicabilidad usa las claves canónicas, y solo esas", async () => {
    const { data: cat } = await sa.client.from("faq_categories")
      .select("id").eq("code", "soporte").single();
    const { error } = await sa.client.from("faq_entries").insert({
      slug: `qa_modulo_falso_${sello}`, category_id: (cat as { id: string }).id,
      scope: "modules", module_keys: ["Quality"],
    });
    assert(error, "se aceptó una clave de módulo que no está en el catálogo");
    const { error: eForma } = await sa.client.from("faq_entries").insert({
      slug: `qa_forma_${sello}`, category_id: (cat as { id: string }).id,
      scope: "modules", module_keys: [],
    });
    assert(eForma, "se aceptó «de módulos» sin decir de cuáles");
    const { error: eGlobal } = await sa.client.from("faq_entries").insert({
      slug: `qa_global_${sello}`, category_id: (cat as { id: string }).id,
      scope: "global", module_keys: ["quality"],
    });
    assert(eGlobal, "se aceptó una entrada global con módulos");
  });

  // ==========================================================================
  console.log("\n§25 · La superficie pública, comprobada como superficie");
  // ==========================================================================

  await check("S1. Las vistas públicas no tienen camino de escritura", async () => {
    const { error } = await anonimo.from("v_faq_public").insert({ slug: "intruso" });
    assert(error, "se pudo escribir a través de la vista pública");
    const { error: e2 } = await miembro.client.from("v_faq_authenticated")
      .update({ answer_short: "x" }).eq("slug", `qa_publica_${sello}`);
    assert(e2, "se pudo escribir a través de la vista con sesión");
  });

  await check("S2. No hay parámetro con el que pedir un borrador", async () => {
    // La vista no acepta identificadores: lo que no está en su `where` no
    // existe para quien la consulta. Se intenta por los tres caminos que
    // tendría alguien que lo buscara.
    for (const filtro of [
      anonimo.from("v_faq_public").select("slug").eq("slug", `qa_borrador_${sello}`),
      anonimo.from("v_faq_public").select("slug").ilike("question", "%nunca se publicó%"),
      anonimo.from("v_faq_public").select("slug").neq("slug", "imposible"),
    ]) {
      const { data } = await filtro;
      const slugs = (data ?? []).map((r) => String((r as { slug: string }).slug));
      assert(!slugs.includes(`qa_borrador_${sello}`),
        "un borrador salió por la vista pública");
    }
  });

  await check("S3. Las categorías vacías no se ofrecen", async () => {
    const { data } = await anonimo.from("v_faq_public_categories").select("code");
    const codigos = (data ?? []).map((r) => String((r as { code: string }).code));
    assert(codigos.includes("seguridad"), "la categoría con respuestas no se ofrece");
    assert(!codigos.includes("intelligence"),
      "se ofrece una categoría sin ninguna respuesta pública");
  });

  console.log(`\nPE-02B1 · lecturas: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
