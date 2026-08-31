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

  // PE-02B5B (2026-08-31) · Las quince YA ESTÁN PUBLICADAS. La dirección lo
  // aprobó, y este bloque asertaba lo contrario, así que había que rehacerlo.
  //
  // Lo que se conserva es lo que este tramo escribió y sigue siendo su
  // responsabilidad: que las quince existan, que su contenido sea el revisado,
  // que la barrera de verificación siga funcionando, y que las salvedades no se
  // hayan perdido al publicar. Lo que ya no se puede afirmar es que no se lean.
  console.log("\nPE-02B5A · Las quince respuestas, con su contenido intacto\n");

  // =========================================================================
  console.log("A · Las quince respuestas de seguridad");
  // =========================================================================

  await check("A1. Están las quince, y ninguna se quedó a medias", async () => {
    const { data } = await sa.from("faq_entries")
      .select("slug, status").in("slug", SLUGS);
    assert(data && data.length === 15, `hay ${data?.length} de 15`);
    const estados = new Set((data as { status: string }[]).map((e) => e.status));
    // O las quince o ninguna. Media categoría publicada sería peor que ninguna:
    // el visitante vería un tema de seguridad que responde a la mitad.
    assert(estados.size === 1,
      `las quince no están en el mismo estado: ${[...estados].join(", ")}`);
  });

  await check("A2. Y al publicarlas no se perdió el respaldo de ninguna", async () => {
    // Lo que este tramo escribió fue la PROCEDENCIA de cada respuesta. Publicar
    // copia el borrador a una revisión, y ahí es donde se podría haber quedado
    // por el camino.
    const { data: ids } = await sa.from("faq_entries").select("id, slug").in("slug", SLUGS);
    const porId = new Map((ids ?? []).map((r) => {
      const x = r as { id: string; slug: string }; return [x.id, x.slug];
    }));
    const { data: revs } = await sa.from("faq_entry_revisions")
      .select("entry_id, source_basis, verification_status, verification_note")
      .in("entry_id", [...porId.keys()]).is("effective_to", null);
    for (const r of (revs ?? []) as Record<string, unknown>[]) {
      const slug = porId.get(String(r.entry_id));
      assert(String(r.source_basis ?? "").length > 20,
        `«${slug}» se publicó sin decir en qué se apoya`);
      if (r.verification_status === "verified_with_qualifier") {
        assert(String(r.verification_note ?? "").length >= 10,
          `«${slug}» se publicó con salvedad y sin salvedad escrita`);
      }
    }
  });

  await check("A3. Las que se declararon con sesión NO se leen sin ella", async () => {
    // La visibilidad la declaró este tramo, respuesta por respuesta. Publicar no
    // puede haberla cambiado, y una que hablara del uso diario asomando a un
    // visitante sería una fuga, no una mejora de alcance.
    const { data: entradas } = await sa.from("faq_entries")
      .select("slug, visibility").in("slug", SLUGS);
    const conSesionDeclaradas = (entradas ?? [])
      .filter((r) => (r as { visibility: string }).visibility === "authenticated")
      .map((r) => String((r as { slug: string }).slug));
    assert(conSesionDeclaradas.length === 5,
      `se declararon ${conSesionDeclaradas.length} con sesión y eran 5`);
    const { data: publica } = await anonimo.from("v_faq_public")
      .select("slug").in("slug", conSesionDeclaradas);
    assert(!publica || publica.length === 0,
      `${publica?.length} respuestas de sesión se leen sin sesión`);
  });

  await check("A4. Y ningún borrador se lee: lo que se ve es la revisión", async () => {
    // El borrador y la revisión viven en tablas distintas justamente para esto.
    // Editar un texto publicado no puede cambiar lo que se está leyendo.
    const { data: e } = await sa.from("faq_entries").select("id")
      .eq("slug", "seguridad_como_protege").single();
    const id = (e as { id: string }).id;
    const { data: borrador } = await sa.from("faq_entry_drafts")
      .select("answer_short").eq("entry_id", id).eq("language", "es").single();
    const { data: revision } = await sa.from("faq_entry_revisions")
      .select("answer_short").eq("entry_id", id).is("effective_to", null).single();
    const { data: leida } = await anonimo.from("v_faq_public")
      .select("answer_short").eq("slug", "seguridad_como_protege").single();
    assert(leida, "la respuesta bandera no se lee");
    assert((leida as { answer_short: string }).answer_short
      === (revision as { answer_short: string }).answer_short,
      "lo que se lee no viene de la revisión publicada");
    assert(borrador, "se perdió el borrador al publicar");
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

  await check("B1b. Y las dos que dependían del proveedor viajaron con su salvedad",
    async () => {
      // Se publicaron el 2026-08-31, después de las dos confirmaciones. Lo que
      // importa ahora es que la salvedad viajó a la revisión: es la mitad que
      // dice de dónde viene cada afirmación, y sin ella la respuesta afirmaría
      // más de lo que puede.
      for (const slug of ["seguridad_entrenamiento_modelos", "seguridad_retencion_proveedor"]) {
        const { data: e } = await sa.from("faq_entries").select("id").eq("slug", slug).single();
        const { data } = await sa.from("faq_entry_revisions")
          .select("verification_status, verification_note, external_source_url, external_source_checked_on")
          .eq("entry_id", (e as { id: string }).id).is("effective_to", null).single();
        const d = data as {
          verification_status: string; verification_note: string | null;
          external_source_url: string | null; external_source_checked_on: string | null };
        assert(d.verification_status === "verified_with_qualifier",
          `«${slug}» se publicó como «${d.verification_status}»`);
        assert((d.verification_note ?? "").length >= 10,
          `«${slug}» se publicó sin la salvedad escrita`);
        assert(d.external_source_url?.includes("openai.com"),
          `«${slug}» se publicó sin su fuente`);
        assert(d.external_source_checked_on === "2026-08-31",
          `«${slug}» se publicó sin la fecha de consulta`);
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

  await check("C1. La v1 se archivó SIN que su texto cambiara", async () => {
    // PE-02B5B publicó la sucesora el 2026-08-31. Lo que este tramo tiene que
    // seguir garantizando es que suceder no es reescribir: la v1 queda intacta,
    // porque hay 153 personas que aceptaron ESE texto y no otro.
    const { data } = await admin.from("legal_documents")
      .select("version, status, content, retired_at, superseded_by_id")
      .eq("document_type", "privacy").eq("version", "v1").single();
    const v1 = data as {
      status: string; content: string; retired_at: string | null;
      superseded_by_id: string | null };
    assert(v1.status === "archived", `la v1 está en «${v1.status}»`);
    assert(v1.content.includes("versión preliminar"), "el texto de la v1 cambió");
    assert(v1.content.length < 2000, "la v1 creció: alguien le escribió encima");
    assert(v1.retired_at, "la v1 se archivó sin fecha de retiro");
    assert(v1.superseded_by_id, "la v1 no apunta a la versión que la sucedió");
  });

  await check("C2. La sucesora está vigente y es el texto que se revisó", async () => {
    const { data } = await sa.from("legal_documents")
      .select("version, status, content, published_at, supersedes_id")
      .eq("document_type", "privacy").eq("status", "active").single();
    const d = data as {
      version: string; status: string; content: string;
      published_at: string | null; supersedes_id: string | null };
    assert(d.version === "v1.1", `la vigente es «${d.version}»`);
    assert(d.published_at, "la vigente no tiene fecha de publicación");
    assert(d.supersedes_id, "la vigente no dice a qué versión sucede");
    assert(d.content.length > 15000, `la vigente tiene ${d.content.length} caracteres`);
    // Y no se publicó el nombre de trabajo.
    assert(!d.version.includes("draft"), "se publicó el nombre de trabajo del borrador");
  });

  await check("C3. El visitante ve una sola política, y es la vigente", async () => {
    const { data } = await anonimo.from("legal_documents")
      .select("version").eq("document_type", "privacy");
    const versiones = (data ?? []).map((r) => String((r as { version: string }).version));
    assert(versiones.length === 1 && versiones[0] === "v1.1",
      `el visitante ve ${versiones.join(", ") || "(nada)"}`);
  });

  await check("C4. Y a quien acepte ahora se le pide la v1.1", async () => {
    const { data: requeridos } = await anonimo.from("legal_documents")
      .select("id, document_type, version").eq("status", "active")
      .in("document_type", ["terms", "privacy"]);
    assert(requeridos && requeridos.length === 2, "cambió el número de requeridos");

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
    const privacidad = (suyas ?? []).filter((r) =>
      (r as { document_type: string }).document_type === "privacy");
    assert(privacidad.length === 1, `aceptó ${privacidad.length} políticas de privacidad`);
    assert(String((privacidad[0] as { version: string }).version) === "v1.1",
      `aceptó «${(privacidad[0] as { version: string }).version}» y la vigente es la v1.1`);
    assert((suyas ?? []).length === 2, `se aceptaron ${suyas?.length} documentos de 2`);
  });

  await check("C5. Lo publicado ya NO se puede corregir en el sitio", async () => {
    // Mientras fue borrador, corregirlo era lo normal. Publicado, no: hay
    // aceptaciones que apuntan a este texto. El disparador de 0156 lo impide
    // incluso al cliente administrativo, que es lo que lo hace una garantía y no
    // una convención.
    const { data } = await admin.from("legal_documents")
      .select("id, content").eq("document_type", "privacy").eq("status", "active").single();
    const { id, content } = data as { id: string; content: string };
    const { error } = await admin.from("legal_documents")
      .update({ content: content + "\nañadido" }).eq("id", id);
    assert(error, "se pudo reescribir una política vigente");
    const { data: despues } = await admin.from("legal_documents")
      .select("content").eq("id", id).single();
    assert((despues as { content: string }).content === content,
      "el texto vigente cambió pese al rechazo");
  });

  console.log(`\nPE-02B5A · borradores: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
