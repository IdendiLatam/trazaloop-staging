/**
 * Trazaloop · PE-02B5A · Que nada de esto esté publicado todavía.
 *
 * Este tramo prepara contenido y NO lo activa. La prueba más importante de la
 * suite es la más aburrida: comprobar que la política de privacidad vigente
 * sigue siendo la de siempre y que a nadie se le va a volver a pedir aceptar.
 *
 * Correr: npm run test:pe02b5a-drafts
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

/** Las quince que este tramo redactó. */
const SLUGS = [
  "seguridad_como_protege", "seguridad_otra_empresa", "seguridad_como_separa",
  "seguridad_equipo_trazaloop", "seguridad_archivos", "seguridad_permisos",
  "seguridad_intelligence", "seguridad_ia_otras_empresas",
  "seguridad_que_recibe_proveedor", "seguridad_entrenamiento_modelos",
  "seguridad_retencion_proveedor", "seguridad_modelo_sin_base",
  "seguridad_ia_no_decide", "seguridad_anonimato", "seguridad_publicar",
];

async function main() {
  const email = `pe02b5a-${sello}@test.trazaloop.dev`;
  const { data: creado } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B5A" } });
  assert(creado.user, "crear persona");
  const sa: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eLogin } = await sa.auth.signInWithPassword({ email, password });
  assert(!eLogin, `login: ${eLogin?.message}`);
  await admin.from("platform_staff")
    .insert({ user_id: creado.user.id, role_code: "superadmin", status: "active" });

  console.log("\nPE-02B5A · Los borradores, sin publicar\n");

  // =========================================================================
  console.log("A · Las quince respuestas de seguridad");
  // =========================================================================

  await check("A1. Están las quince, y todas en borrador", async () => {
    const { data } = await sa.from("faq_entries")
      .select("slug, status").in("slug", SLUGS);
    assert(data && data.length === 15, `hay ${data?.length} de 15`);
    for (const e of data as { slug: string; status: string }[]) {
      assert(e.status === "draft", `«${e.slug}» está en «${e.status}» y debería ser borrador`);
    }
  });

  await check("A2. Ninguna tiene revisión publicada", async () => {
    const { data: ids } = await sa.from("faq_entries").select("id").in("slug", SLUGS);
    const lista = (ids ?? []).map((r) => String((r as { id: string }).id));
    const { data: revs } = await sa.from("faq_entry_revisions")
      .select("id").in("entry_id", lista);
    assert(!revs || revs.length === 0,
      `hay ${revs?.length} revisiones publicadas y no debería haber ninguna`);
  });

  await check("A3. Y NINGUNA se lee en la FAQ · ni sin sesión ni con ella", async () => {
    const { data: publica } = await anonimo.from("v_faq_public").select("slug").in("slug", SLUGS);
    assert(!publica || publica.length === 0,
      `${publica?.length} respuestas de seguridad son públicas`);
    const { data: conSesion } = await sa.from("v_faq_authenticated").select("slug").in("slug", SLUGS);
    assert(!conSesion || conSesion.length === 0,
      `${conSesion?.length} respuestas de seguridad se leen con sesión`);
    // Ni buscando su texto.
    const { data: buscada } = await anonimo.from("v_faq_public")
      .select("slug").textSearch("search_document", "salvedad infraestructura",
        { config: "spanish", type: "websearch" });
    assert(!buscada || !buscada.some((r) => SLUGS.includes(String((r as { slug: string }).slug))),
      "una respuesta de seguridad aparece al buscar su contenido");
  });

  await check("A4. La categoría de seguridad sigue sin ofrecerse a un visitante",
    async () => {
      const { data } = await anonimo.from("v_faq_public_categories").select("code");
      const codigos = (data ?? []).map((r) => String((r as { code: string }).code));
      // Puede haber residuo de otras suites; lo que se comprueba es que NINGUNA
      // de las quince lo haya provocado.
      const { data: mias } = await anonimo.from("v_faq_public")
        .select("slug").eq("category_code", "seguridad");
      const deEsteTramo = (mias ?? [])
        .filter((r) => SLUGS.includes(String((r as { slug: string }).slug)));
      assert(deEsteTramo.length === 0,
        "una respuesta de este tramo hizo aparecer la categoría de seguridad");
      assert(Array.isArray(codigos), "no se pudieron leer las categorías");
    });

  // =========================================================================
  console.log("\nB · La barrera hace su trabajo");
  // =========================================================================

  await check("B1. La barrera rechaza lo que depende de una confirmación externa",
    async () => {
      // ESTA COMPROBACIÓN SE HACÍA SOBRE LAS DOS RESPUESTAS REALES, Y ESTABA MAL.
      //
      // Intentaba publicarlas esperando el rechazo. Mientras dependieron de una
      // confirmación humana, funcionó. El 2026-08-31 llegó la confirmación, la
      // barrera dejó de bloquearlas… y el intento PUBLICÓ una respuesta de
      // seguridad en la base. Una comprobación pensada para vigilar que nada se
      // publicara fue lo único que publicó algo.
      //
      // La lección es del tipo de las que se repiten: una prueba que provoca el
      // efecto que vigila solo es segura mientras su suposición aguante. Así que
      // la barrera se comprueba ahora sobre una entrada de usar y tirar, y las
      // dos reales se miran sin tocarlas.
      const { data: cat } = await sa.from("faq_categories").select("id")
        .eq("code", "seguridad").single();
      assert(cat, "no existe la categoría de seguridad");
      const slugDesechable = `qa_barrera_${sello}`;
      const { data: creada, error: eCrea } = await sa.from("faq_entries")
        .insert({ slug: slugDesechable, category_id: (cat as { id: string }).id,
                  visibility: "authenticated", sort_order: 9999, status: "draft" })
        .select("id").single();
      assert(!eCrea && creada, `crear la desechable: ${eCrea?.message}`);
      const idDesechable = (creada as { id: string }).id;
      try {
        for (const estado of ["external_policy_verification_required", "not_verified",
          "must_not_claim"]) {
          const { error: eBorrador } = await sa.from("faq_entry_drafts").upsert({
            entry_id: idDesechable, language: "es",
            question: "¿Pregunta de prueba de la barrera?",
            answer_short: "Respuesta de prueba.",
            normative_class: "safe",
            verification_status: estado,
            source_basis: "Prueba de la barrera de publicación de PE-02B5A.",
          }, { onConflict: "entry_id,language" });
          assert(!eBorrador, `preparar el borrador en «${estado}»: ${eBorrador?.message}`);
          const { error } = await sa.rpc("faq_publish_entry",
            { p_entry_id: idDesechable, p_language: "es", p_change_note: "intento" });
          assert(error, `la barrera dejó publicar algo en «${estado}»`);
          assert(/no se puede publicar/i.test(error!.message),
            `el rechazo de «${estado}» no se explica: ${error!.message}`);
        }
      } finally {
        // Nunca llegó a publicarse, así que no hay revisión que respetar.
        await sa.from("faq_entry_drafts").delete().eq("entry_id", idDesechable);
        await sa.from("faq_entries").delete().eq("id", idDesechable);
      }
    });

  await check("B1b. Y las dos que dependían del proveedor ya están resueltas",
    async () => {
      // Sin publicarlas. Lo que se comprueba es que la confirmación del
      // 2026-08-31 quedó escrita y con salvedad, no que la barrera las deje pasar.
      for (const slug of ["seguridad_entrenamiento_modelos", "seguridad_retencion_proveedor"]) {
        const { data: e } = await sa.from("faq_entries").select("id, status")
          .eq("slug", slug).single();
        assert((e as { status: string }).status === "draft",
          `«${slug}» ya no es un borrador`);
        const { data } = await sa.from("faq_entry_drafts")
          .select("verification_status, verification_note")
          .eq("entry_id", (e as { id: string }).id).eq("language", "es").single();
        const d = data as { verification_status: string; verification_note: string | null };
        assert(d.verification_status === "verified_with_qualifier",
          `«${slug}» está en «${d.verification_status}» y la confirmación humana exige salvedad`);
        assert((d.verification_note ?? "").length >= 10,
          `«${slug}» está con salvedad y no la tiene escrita: la base la rechazaría`);
      }
    });

  await check("B2. La del equipo de Trazaloop exige su salvedad", async () => {
    const { data } = await sa.from("faq_entry_drafts")
      .select("verification_status, verification_note")
      .eq("entry_id", (await sa.from("faq_entries").select("id")
        .eq("slug", "seguridad_equipo_trazaloop").single()).data!.id)
      .eq("language", "es").single();
    const d = data as { verification_status: string; verification_note: string | null };
    assert(d.verification_status === "verified_with_qualifier",
      `está marcada «${d.verification_status}» y necesita salvedad`);
    assert((d.verification_note ?? "").length >= 10, "no tiene la salvedad escrita");
    assert(/infraestructura/i.test(d.verification_note ?? ""),
      "la salvedad no menciona el acceso de infraestructura");
  });

  await check("B3. Y las verificadas sí podrían publicarse cuando se decida", async () => {
    // No se publica: se comprueba que la barrera no las bloquearía.
    const { data } = await sa.from("faq_entry_drafts")
      .select("verification_status, source_basis, entry_id")
      .in("entry_id", ((await sa.from("faq_entries").select("id").in("slug", SLUGS)).data ?? [])
        .map((r) => String((r as { id: string }).id)));
    const filas = (data ?? []) as { verification_status: string; source_basis: string | null }[];
    const bloqueantes = ["not_verified", "must_not_claim"];
    for (const f of filas) {
      assert(!bloqueantes.includes(f.verification_status),
        `una respuesta quedó en «${f.verification_status}», que no se puede publicar nunca`);
      assert((f.source_basis ?? "").length > 20,
        "una respuesta de seguridad no dice en qué se apoya");
    }
    const verificadas = filas.filter((f) => f.verification_status === "verified");
    assert(verificadas.length >= 10, `solo ${verificadas.length} están verificadas`);
  });

  await check("B4. Las dos externas llevan su fuente y su fecha", async () => {
    for (const slug of ["seguridad_entrenamiento_modelos", "seguridad_retencion_proveedor"]) {
      const { data: e } = await sa.from("faq_entries").select("id").eq("slug", slug).single();
      const { data } = await sa.from("faq_entry_drafts")
        .select("external_source_url, external_source_checked_on")
        .eq("entry_id", (e as { id: string }).id).eq("language", "es").single();
      const d = data as { external_source_url: string | null; external_source_checked_on: string | null };
      assert(d.external_source_url?.includes("openai.com"),
        `«${slug}» no cita la fuente oficial del proveedor`);
      assert(d.external_source_checked_on === "2026-08-31",
        `«${slug}» no dice cuándo se comprobó: ${d.external_source_checked_on}`);
    }
  });

  // =========================================================================
  console.log("\nC · La política de privacidad");
  // =========================================================================

  await check("C1. La vigente NO cambió", async () => {
    const { data } = await anonimo.from("legal_documents")
      .select("id, version, content, status").eq("document_type", "privacy")
      .eq("status", "active");
    assert(data && data.length === 1, `hay ${data?.length} políticas vigentes`);
    const activa = data![0] as { version: string; content: string };
    assert(activa.version === "v1", `la vigente es «${activa.version}»`);
    assert(activa.content.includes("versión preliminar"),
      "el texto de la vigente cambió");
  });

  await check("C2. La sucesora existe y es un BORRADOR", async () => {
    const { data } = await sa.from("legal_documents")
      .select("version, status, content, published_at")
      .eq("document_type", "privacy").eq("version", "v1.1-draft").single();
    const d = data as { status: string; content: string; published_at: string | null };
    assert(d.status === "draft", `la sucesora está en «${d.status}»`);
    assert(d.published_at === null, "la sucesora tiene fecha de publicación");
    assert(d.content.length > 15000, `la sucesora tiene ${d.content.length} caracteres`);
  });

  await check("C3. Y el visitante NO la ve", async () => {
    const { data } = await anonimo.from("legal_documents")
      .select("version").eq("document_type", "privacy");
    const versiones = (data ?? []).map((r) => String((r as { version: string }).version));
    assert(!versiones.includes("v1.1-draft"), "el borrador legal es público");
    assert(versiones.length === 1 && versiones[0] === "v1",
      `el visitante ve ${versiones.join(", ")}`);
  });

  await check("C4. A nadie se le va a volver a pedir aceptar", async () => {
    // La puerta compara los documentos ACTIVOS requeridos con lo aceptado. Si la
    // sucesora estuviera activa, todo el mundo tendría que aceptar de nuevo.
    const { data: requeridos } = await anonimo.from("legal_documents")
      .select("id, document_type, version").eq("status", "active")
      .in("document_type", ["terms", "privacy"]);
    assert(requeridos && requeridos.length === 2, "cambió el número de requeridos");

    // Una persona que acepta AHORA queda al día, y sigue al día después.
    const email2 = `pe02b5a-acepta-${sello}@test.trazaloop.dev`;
    const { data: c2 } = await admin.auth.admin.createUser({
      email: email2, password, email_confirm: true, user_metadata: { full_name: "QA acepta" } });
    const cli: SupabaseClient = createClient(URL!, ANON!,
      { auth: { autoRefreshToken: false, persistSession: false } });
    await cli.auth.signInWithPassword({ email: email2, password });
    const { error } = await cli.rpc("accept_active_legal_documents",
      { p_ip_address: null, p_user_agent: "b5a" });
    assert(!error, `aceptar: ${error?.message}`);

    const { data: suyas } = await admin.from("user_legal_acceptances")
      .select("version, document_type").eq("user_id", c2.user!.id);
    const aceptadas = (suyas ?? []).map((r) => String((r as { version: string }).version));
    assert(aceptadas.every((v) => v === "v1"),
      `se aceptó una versión inesperada: ${aceptadas.join(", ")}`);
    assert(aceptadas.length === 2, `se aceptaron ${aceptadas.length} documentos de 2`);
  });

  await check("C5. El borrador legal se puede corregir · sigue siendo borrador", async () => {
    const { data } = await sa.from("legal_documents")
      .select("id, content").eq("version", "v1.1-draft").single();
    const id = (data as { id: string }).id;
    const original = (data as { content: string }).content;
    const { error } = await admin.from("legal_documents")
      .update({ content: original + "\n" }).eq("id", id);
    assert(!error, `no se pudo corregir el borrador: ${error?.message}`);
    await admin.from("legal_documents").update({ content: original }).eq("id", id);
  });

  console.log(`\nPE-02B5A · borradores: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
