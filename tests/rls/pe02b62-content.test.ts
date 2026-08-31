/**
 * Trazaloop · PE-02B6.2 · Lo corregido, y que es lo que se publicó.
 *
 * Este tramo tocó el texto de un documento legal, y PE-02B5B lo publicó. Así
 * que estas comprobaciones ya no vigilan que nada se publique: vigilan que lo
 * VIGENTE sea el texto corregido y no el que llevaba el andamiaje dentro.
 *
 * La diferencia importa. Publicar la versión equivocada de un documento legal
 * no se retira: se corrige con otra versión, y con otra reaceptación.
 *
 * Correr: npm run test:pe02b62-content
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

const SLUGS_SEGURIDAD = [
  "seguridad_como_protege", "seguridad_otra_empresa", "seguridad_como_separa",
  "seguridad_equipo_trazaloop", "seguridad_archivos", "seguridad_permisos",
  "seguridad_intelligence", "seguridad_ia_otras_empresas",
  "seguridad_que_recibe_proveedor", "seguridad_entrenamiento_modelos",
  "seguridad_retencion_proveedor", "seguridad_modelo_sin_base",
  "seguridad_ia_no_decide", "seguridad_anonimato", "seguridad_publicar",
];

async function main() {
  const email = `pe02b62-${sello}@test.trazaloop.dev`;
  const { data: creado } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B6.2" } });
  assert(creado.user, "crear persona");
  const sa: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: eLogin } = await sa.auth.signInWithPassword({ email, password });
  assert(!eLogin, `login: ${eLogin?.message}`);
  await admin.from("platform_staff")
    .insert({ user_id: creado.user.id, role_code: "superadmin", status: "active" });

  // PE-02B5B renombró el borrador de trabajo `v1.1-draft` a su versión real
  // `v1.1` al publicarlo. Se busca por versión comercial, no por nombre de
  // trabajo, que era temporal por definición.
  const { data: borradorFila } = await sa.from("legal_documents")
    .select("id, status, content, published_at, version, title")
    .eq("document_type", "privacy").eq("version", "v1.1").single();
  assert(borradorFila, "no existe la sucesora");
  const BORRADOR = borradorFila as {
    status: string; content: string; published_at: string | null;
    version: string; title: string };

  const draft = async (slug: string) => {
    const { data: e } = await sa.from("faq_entries").select("id").eq("slug", slug).single();
    const { data } = await sa.from("faq_entry_drafts").select("*")
      .eq("entry_id", (e as { id: string }).id).eq("language", "es").single();
    return data as Record<string, unknown>;
  };

  console.log("\nPE-02B6.2 · Lo corregido, y lo que no se publicó\n");

  // =========================================================================
  console.log("A · El andamiaje de redacción salió del texto");
  // =========================================================================

  await check("A1. Ya no hay un cartel de BORRADOR dentro del documento", async () => {
    // El estado se dice con el metadato del producto —la consola lo pinta—, no
    // dentro del texto que firmaría un cliente.
    assert(!/Este documento es un BORRADOR/i.test(BORRADOR.content),
      "el cartel de borrador sigue dentro del contenido");
    assert(!/BORRADOR SUCESOR/i.test(BORRADOR.content),
      "el estado editorial sigue escrito en el texto");
    // Y el estado lo dice el metadato, que es donde toca: hoy, «vigente».
    assert(BORRADOR.status === "active", `la fila está en «${BORRADOR.status}»`);
  });

  await check("A2. Ni una ruta del repositorio dentro del texto", async () => {
    for (const rastro of ["docs/platform-experience", "PE_02B", "PE-02B5A", ".md`",
      "docs/legal", "supabase/migrations"]) {
      assert(!BORRADOR.content.includes(rastro),
        `el documento nombra el repositorio: «${rastro}»`);
    }
  });

  await check("A3. Ni una instrucción editorial pendiente", async () => {
    for (const rastro of ["Pendiente de confirmación", "PENDIENTE DE CONFIRMACIÓN",
      "TODO", "FIXME", "por confirmar", "HUMAN_CONFIRMATION"]) {
      assert(!BORRADOR.content.includes(rastro),
        `queda una nota interna en el documento: «${rastro}»`);
    }
  });

  await check("A4. Y el título no se pinta dos veces", async () => {
    // La página ya pone el título; tenerlo otra vez como primer encabezado del
    // cuerpo lo enseñaba repetido.
    assert(!BORRADOR.content.startsWith(`# ${BORRADOR.title}`),
      "el cuerpo repite el título del documento");
  });

  // =========================================================================
  console.log("\nB · Lo que sí dice, y con qué fecha");
  // =========================================================================

  await check("B1. Las dos confirmaciones siguen escritas", async () => {
    assert(/No se ha activado/.test(BORRADOR.content),
      "se perdió la confirmación del entrenamiento");
    assert(/No se tiene contratado/.test(BORRADOR.content),
      "se perdió la confirmación de la retención");
    assert(/no equivale/.test(BORRADOR.content),
      "se perdió la distinción entre no almacenar y retención cero");
  });

  await check("B2. La vigencia dice 1.1, y ya no fecha el documento en la 1.0",
    async () => {
      const vigencia = BORRADOR.content.slice(BORRADOR.content.indexOf("## 21."));
      assert(vigencia.length > 50, "no se encontró el artículo de vigencia");
      assert(/Versión comercial:\*\* 1\.1/.test(vigencia),
        "la vigencia no declara la versión 1.1");
      assert(!/Versión comercial:\*\* 1\.0/.test(vigencia),
        "la vigencia sigue diciendo que es la versión 1.0");
      assert(!/Fecha de aprobación:\*\* 27 de julio/.test(vigencia),
        "la vigencia sigue fechada el 27 de julio");
    });

  await check("B3. Y no se inventa una fecha de entrada en vigor", async () => {
    // La fecha la pone la plataforma al publicar. Escribirla a mano en el texto
    // sería fijar hoy algo que se decide después, y las dos podrían no coincidir.
    assert(/de su publicación en la plataforma/i.test(BORRADOR.content),
      "la fecha de entrada en vigor no se deriva de la publicación");
    assert(BORRADOR.published_at, "la vigente no tiene fecha de publicación");
    // No puede haber ninguna fecha futura escrita como si fuera la de vigor.
    for (const inventada of ["1 de septiembre de 2026", "1 de octubre de 2026",
      "2026-09-", "2026-10-"]) {
      assert(!BORRADOR.content.includes(inventada),
        `el documento fija una fecha inventada: «${inventada}»`);
    }
    // La única fecha de 2026 que puede quedar es la de la versión que sucede
    // y la de consulta de la documentación del proveedor.
    assert(/aprobada el 27 de julio de 2026/.test(BORRADOR.content),
      "se perdió la referencia a la versión que sucede");
  });

  // =========================================================================
  console.log("\nC · Los encargados, solo los que tratan algo");
  // =========================================================================

  await check("C1. Resend salió: no hay integración que lo respalde", async () => {
    assert(!/Resend/i.test(BORRADOR.content),
      "el documento sigue declarando un encargado sin integración");
  });

  await check("C2. Y los que quedan son los que de verdad intervienen", async () => {
    const encargados = BORRADOR.content.slice(
      BORRADOR.content.indexOf("## 11."), BORRADOR.content.indexOf("## 12."));
    assert(/Supabase/.test(encargados), "falta Supabase");
    assert(/Vercel/.test(encargados), "falta Vercel");
    assert(/inteligencia artificial/i.test(encargados), "falta el proveedor de IA");
    // Y ninguno inventado.
    for (const inventado of ["Sentry", "Stripe", "Google Analytics", "PostHog",
      "Datadog", "Mixpanel", "SendGrid", "Mailgun", "Twilio"]) {
      assert(!encargados.includes(inventado), `se declara un encargado inventado: ${inventado}`);
    }
  });

  await check("C3. La IA se declara condicional, no como tratamiento permanente",
    async () => {
      // Producción no tiene proveedor configurado. Decir que la información va a
      // un proveedor de IA «siempre» describiría algo que allí no ocurre.
      const encargados = BORRADOR.content.slice(
        BORRADOR.content.indexOf("## 11."), BORRADOR.content.indexOf("## 12."));
      assert(/Solo\*\* cuando la empresa tiene habilitado/.test(encargados),
        "no se acota cuándo interviene el proveedor de IA");
      assert(/no se envía nada a ese proveedor/i.test(encargados),
        "no se dice qué pasa donde la función no está habilitada");
      assert(/apagada por defecto/i.test(BORRADOR.content),
        "se perdió que Intelligence está apagada por defecto");
    });

  await check("C4. Y no se nombra al proveedor en el texto del cliente", async () => {
    // Nombrarlo obligaría a una versión nueva cada vez que cambiara, y una
    // versión nueva obliga a todo el mundo a aceptar otra vez.
    for (const nombre of ["OpenAI", "Anthropic", "GPT", "Claude"]) {
      assert(!BORRADOR.content.includes(nombre),
        `el documento nombra al proveedor de IA: ${nombre}`);
    }
    assert(/contratado por la Corporación/.test(BORRADOR.content),
      "no se identifica al proveedor por su relación con la Corporación");
  });

  // =========================================================================
  console.log("\nD · La respuesta de retención, más legible y con lo mismo dentro");
  // =========================================================================

  await check("D1. Conserva las cinco cosas que tiene que decir", async () => {
    const d = await draft("seguridad_retencion_proveedor");
    const texto = `${d.answer_short} ${d.answer_long}`;
    assert(/30 días/i.test(texto), "ya no dice el plazo");
    assert(/no tiene contratado un acuerdo de retención cero/i.test(texto),
      "ya no dice que no hay retención cero");
    assert(/NO es un acuerdo de retención cero/i.test(texto),
      "ya no distingue no almacenar de retención cero");
    assert(/obligación legal/i.test(texto), "ya no nombra la excepción legal");
    assert(/máximo/i.test(texto), "ya no dice que es un máximo");
  });

  await check("D2. Y se lee mejor: abre con el dato y suelta la jerga", async () => {
    const d = await draft("seguridad_retencion_proveedor");
    const corta = String(d.answer_short);
    assert(corta.startsWith("Hasta 30 días."),
      `la respuesta corta no abre con el dato: «${corta.slice(0, 40)}…»`);
    assert(corta.length < 342,
      `la respuesta corta no se acortó: ${corta.length} caracteres`);
    const texto = `${corta} ${d.answer_long}`;
    assert(!texto.includes("interfaz de programación"),
      "sigue usando «interfaz de programación», que nadie reconoce");
    // La primera frase tiene que ser corta de verdad.
    const primera = corta.split(".")[0];
    assert(primera.split(" ").length <= 6,
      `la primera frase tiene ${primera.split(" ").length} palabras`);
  });

  await check("D3. La salvedad sigue escrita: sin ella la base la rechazaría", async () => {
    const d = await draft("seguridad_retencion_proveedor");
    assert(d.verification_status === "verified_with_qualifier",
      `está en «${d.verification_status}»`);
    assert(String(d.verification_note ?? "").length >= 10, "perdió la salvedad");
    assert(/no tiene retención cero/i.test(String(d.verification_note)),
      "la salvedad ya no recoge la confirmación");
  });

  await check("D4. Y la procedencia nombra al proveedor verificado", async () => {
    // Aquí sí: es metadato interno, no texto de cliente. Quien revise tiene que
    // poder saber de quién es la política que se citó.
    for (const slug of ["seguridad_entrenamiento_modelos", "seguridad_retencion_proveedor"]) {
      const d = await draft(slug);
      assert(/OpenAI/.test(String(d.source_basis)),
        `«${slug}» no dice de qué proveedor es la documentación citada`);
      assert(String(d.external_source_url ?? "").includes("openai.com"),
        `«${slug}» perdió la fuente`);
      assert(d.external_source_checked_on === "2026-08-31",
        `«${slug}» perdió la fecha de consulta`);
    }
  });

  // =========================================================================
  console.log("\nE · La respuesta bandera no se tocó, y sigue sin absolutos");
  // =========================================================================

  await check("E1. Sigue reconociendo el riesgo residual", async () => {
    const d = await draft("seguridad_como_protege");
    const texto = `${d.answer_short} ${d.answer_long}`;
    assert(/Ninguna medida elimina el riesgo/i.test(texto),
      "se perdió el reconocimiento del riesgo residual");
    assert(/no afirmamos lo contrario/i.test(texto), "se perdió la declaración de límite");
    assert(/certificaciones de seguridad propias|no tenemos certificaciones/i.test(texto),
      "se perdió que no hay certificaciones propias");
  });

  await check("E2. Y ninguna de las quince promete lo imposible", async () => {
    const prohibidos = ["100% segur", "totalmente segur", "riesgo cero",
      "inviolable", "imposible de vulnerar", "certificado por"];
    for (const slug of SLUGS_SEGURIDAD) {
      const d = await draft(slug);
      const texto = `${d.answer_short} ${d.answer_long ?? ""}`.toLowerCase();
      for (const p of prohibidos) {
        assert(!texto.includes(p), `«${slug}» promete «${p}»`);
      }
      // «nunca» solo vale si va negando algo nuestro, no prometiendo del tercero.
      assert(!/nunca (entrenará|accederá|podrá acceder)/i.test(texto),
        `«${slug}» promete un «nunca» en nombre de un tercero`);
    }
  });

  // =========================================================================
  console.log("\nF · Y lo corregido es lo que se publicó");
  // =========================================================================
  //
  // Este bloque comprobaba, hasta PE-02B5B, que nada estuviera publicado. Se
  // publicó el 2026-08-31 por decisión de la dirección, así que ahora comprueba
  // lo que de verdad importa: que lo vigente sea el texto CORREGIDO y no el que
  // llevaba el andamiaje dentro. Publicar la versión equivocada de un documento
  // legal es un error que no se retira: se corrige con otra versión, y con otra
  // reaceptación.

  await check("F1. Lo vigente es la v1.1, y es el texto sin andamiaje", async () => {
    const { data } = await anonimo.from("legal_documents")
      .select("version, content, status")
      .eq("document_type", "privacy").eq("status", "active");
    assert(data && data.length === 1, `hay ${data?.length} políticas vigentes`);
    const activa = data![0] as { version: string; content: string };
    assert(activa.version === "v1.1", `la vigente es «${activa.version}»`);
    // Las cuatro correcciones de este tramo, ahora sobre lo PUBLICADO.
    assert(!/Este documento es un BORRADOR|BORRADOR SUCESOR/i.test(activa.content),
      "se publicó el cartel de borrador");
    assert(!/docs\/platform-experience|PE_02B|PE-02B5A/.test(activa.content),
      "se publicó una ruta del repositorio");
    assert(!/Pendiente de confirmación/.test(activa.content),
      "se publicó una nota editorial pendiente");
    assert(!/Resend/i.test(activa.content),
      "se publicó un encargado sin integración");
  });

  await check("F2. Con la vigencia coherente y sin fecha inventada", async () => {
    const { data } = await anonimo.from("legal_documents")
      .select("content, published_at")
      .eq("document_type", "privacy").eq("status", "active").single();
    const d = data as { content: string; published_at: string };
    const vigencia = d.content.slice(d.content.indexOf("## 21."));
    assert(/Versión comercial:\*\* 1\.1/.test(vigencia), "la vigencia no declara la 1.1");
    assert(!/Versión comercial:\*\* 1\.0/.test(vigencia), "la vigencia dice que es la 1.0");
    assert(/de su publicación en la plataforma/i.test(d.content),
      "la fecha de vigor no se deriva de la publicación");
    // Y la que vale es la que la plataforma escribió al publicar.
    assert(d.published_at, "la vigente no tiene fecha de publicación");
    for (const inventada of ["2026-09-", "2026-10-", "1 de septiembre de 2026"]) {
      assert(!d.content.includes(inventada), `se publicó una fecha inventada: ${inventada}`);
    }
  });

  await check("F3. La v1 se archivó intacta, con sus aceptaciones", async () => {
    const { data } = await admin.from("legal_documents")
      .select("status, content, retired_at, id")
      .eq("document_type", "privacy").eq("version", "v1").single();
    const v1 = data as { status: string; content: string; retired_at: string | null; id: string };
    assert(v1.status === "archived", `la v1 está en «${v1.status}»`);
    assert(v1.content.includes("versión preliminar"), "el texto de la v1 cambió");
    assert(v1.content.length < 2000, "la v1 creció: alguien le escribió encima");
    assert(v1.retired_at, "se archivó sin fecha de retiro");
    const { count } = await admin.from("user_legal_acceptances")
      .select("id", { count: "exact", head: true }).eq("legal_document_id", v1.id);
    assert((count ?? 0) > 0, "la v1 se quedó sin sus aceptaciones");
  });

  await check("F4. Las quince están publicadas y se leen según su visibilidad",
    async () => {
      const { data } = await sa.from("faq_entries").select("slug, status, visibility")
        .in("slug", SLUGS_SEGURIDAD);
      assert(data && data.length === 15, `hay ${data?.length} de 15`);
      const filas = data as { slug: string; status: string; visibility: string }[];
      for (const e of filas) {
        assert(e.status === "published", `«${e.slug}» está en «${e.status}»`);
      }
      const publicas = filas.filter((e) => e.visibility === "public").map((e) => e.slug);
      const conSesion = filas.filter((e) => e.visibility === "authenticated").map((e) => e.slug);
      const { data: leePublico } = await anonimo.from("v_faq_public")
        .select("slug").in("slug", SLUGS_SEGURIDAD);
      const vistas = new Set((leePublico ?? [])
        .map((r) => String((r as { slug: string }).slug)));
      assert(vistas.size === publicas.length,
        `un visitante ve ${vistas.size} y se declararon ${publicas.length} públicas`);
      for (const slug of conSesion) {
        assert(!vistas.has(slug), `«${slug}» se declaró con sesión y la ve un visitante`);
      }
    });

  await check("F5. Y la reaceptación se pide de verdad", async () => {
    const email2 = `pe02b62-acepta-${sello}@test.trazaloop.dev`;
    const { data: c2 } = await admin.auth.admin.createUser({
      email: email2, password, email_confirm: true,
      user_metadata: { full_name: "QA acepta" } });
    const cli: SupabaseClient = createClient(URL!, ANON!,
      { auth: { autoRefreshToken: false, persistSession: false } });
    await cli.auth.signInWithPassword({ email: email2, password });
    const { error } = await cli.rpc("accept_active_legal_documents",
      { p_ip_address: null, p_user_agent: "b62" });
    assert(!error, `aceptar: ${error?.message}`);
    const { data: suyas } = await admin.from("user_legal_acceptances")
      .select("version, document_type").eq("user_id", c2.user!.id);
    const privacidad = (suyas ?? []).filter((r) =>
      (r as { document_type: string }).document_type === "privacy");
    assert(privacidad.length === 1 &&
      String((privacidad[0] as { version: string }).version) === "v1.1",
      "no se aceptó la política vigente");
  });

  console.log(`\nPE-02B6.2 · contenido: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
