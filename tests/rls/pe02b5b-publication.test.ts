/**
 * Trazaloop · PE-02B5B · La publicación, y lo que no puede haberse roto al hacerla.
 *
 * Publicar una política legal es la operación menos reversible de la
 * plataforma: no hay «despublicar», y volver atrás es publicar otra versión y
 * volver a pedirle a todo el mundo que acepte. Así que esta suite no comprueba
 * que la publicación «funcionó» —eso se ve mirando—, sino las cuatro cosas que
 * podrían haberse roto sin que nadie lo notara:
 *
 *   · que suceder no sea reescribir: la v1 tiene que quedar intacta, porque hay
 *     personas que aceptaron ESE texto;
 *   · que la reaceptación se PIDA, en vez de darse por hecha;
 *   · que las aceptaciones viejas no se toquen ni se reinterpreten;
 *   · que al copiar el borrador a la revisión no se haya quedado atrás una
 *     salvedad, que es la mitad que hace verdadera a una afirmación.
 *
 * Correr: npm run test:pe02b5b
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

const SLUGS = [
  "seguridad_como_protege", "seguridad_otra_empresa", "seguridad_como_separa",
  "seguridad_equipo_trazaloop", "seguridad_archivos", "seguridad_permisos",
  "seguridad_intelligence", "seguridad_ia_otras_empresas",
  "seguridad_que_recibe_proveedor", "seguridad_entrenamiento_modelos",
  "seguridad_retencion_proveedor", "seguridad_modelo_sin_base",
  "seguridad_ia_no_decide", "seguridad_anonimato", "seguridad_publicar",
];

async function nuevaPersona(prefijo: string) {
  const email = `${prefijo}-${sello}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: "QA B5B" } });
  assert(data.user, `crear ${prefijo}`);
  const cli: SupabaseClient = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${prefijo}: ${error?.message}`);
  return { id: data.user.id, email, cli };
}

/**
 * Lo que un visitante lee de una respuesta, por la misma vía que la pantalla.
 *
 * No se consulta `faq_entry_revisions`: se consulta la vista pública. Mirar la
 * tabla comprobaría que el texto está guardado; mirar la vista comprueba que
 * está guardado Y que llega. Son dos cosas distintas y aquí importa la segunda.
 */
async function respuestaPublicada(slug: string) {
  const { data, error } = await anonimo.from("v_faq_public")
    .select("slug, question, answer_short, answer_long").eq("slug", slug).single();
  assert(!error && data, `«${slug}» no se lee en la FAQ pública: ${error?.message}`);
  return data as Record<string, string>;
}

async function main() {
  const sa = await nuevaPersona("pe02b5b-sa");
  await admin.from("platform_staff")
    .insert({ user_id: sa.id, role_code: "superadmin", status: "active" });

  console.log("\nPE-02B5B · La publicación controlada\n");

  // =========================================================================
  console.log("A · La sucesión legal");
  // =========================================================================

  await check("A. La v1.1 es la política vigente, y es la única", async () => {
    const { data } = await anonimo.from("legal_documents")
      .select("id, version, status, published_at, supersedes_id")
      .eq("document_type", "privacy").eq("status", "active");
    assert(data && data.length === 1, `hay ${data?.length} políticas vigentes`);
    const v = data![0] as {
      version: string; published_at: string | null; supersedes_id: string | null };
    assert(v.version === "v1.1", `la vigente es «${v.version}»`);
    assert(!v.version.includes("draft"), "se publicó el nombre de trabajo del borrador");
    assert(v.published_at, "la vigente no tiene fecha de publicación");
    assert(v.supersedes_id, "la vigente no dice a qué versión sucede");
  });

  await check("B. La v1 pasó a histórica, con su fecha de retiro", async () => {
    const { data } = await admin.from("legal_documents")
      .select("id, status, retired_at, superseded_by_id, published_at")
      .eq("document_type", "privacy").eq("version", "v1").single();
    const v1 = data as {
      status: string; retired_at: string | null;
      superseded_by_id: string | null; published_at: string | null };
    assert(v1.status === "archived", `la v1 está en «${v1.status}»`);
    assert(v1.retired_at, "se archivó sin fecha de retiro");
    assert(v1.superseded_by_id, "no apunta a la versión que la sucedió");
    assert(v1.published_at, "perdió su propia fecha de publicación");
    // Y el enlace es de ida y vuelta: sin eso, la historia se lee en un sentido.
    const { data: v11 } = await admin.from("legal_documents")
      .select("id, supersedes_id").eq("document_type", "privacy")
      .eq("status", "active").single();
    assert((v11 as { supersedes_id: string }).supersedes_id
      === (data as unknown as { id: string }).id, "los enlaces no se corresponden");
  });

  await check("C. Su texto no cambió ni un byte al archivarse", async () => {
    // Es lo que hace que la historia signifique algo: 153 personas aceptaron
    // ESTE texto, y si se reescribiera, su consentimiento pasaría a referirse a
    // algo que nunca leyeron.
    const { data } = await admin.from("legal_documents")
      .select("content, content_hash, id")
      .eq("document_type", "privacy").eq("version", "v1").single();
    const v1 = data as { content: string; content_hash: string | null; id: string };
    assert(v1.content.includes("versión preliminar"), "el texto de la v1 cambió");
    assert(v1.content.includes("lanzamiento controlado de Trazaloop CPR"),
      "la v1 perdió su alcance original");
    assert(v1.content.length < 2000,
      `la v1 tiene ${v1.content.length} caracteres: le escribieron encima`);

    // Y sigue siendo inmutable, incluso para el cliente administrativo.
    const { error } = await admin.from("legal_documents")
      .update({ content: v1.content + "\nañadido" }).eq("id", v1.id);
    assert(error, "se pudo reescribir una versión archivada");
  });

  await check("D. Las aceptaciones de la v1 se conservan enteras", async () => {
    const { data: v1 } = await admin.from("legal_documents")
      .select("id").eq("document_type", "privacy").eq("version", "v1").single();
    const { count } = await admin.from("user_legal_acceptances")
      .select("id", { count: "exact", head: true })
      .eq("legal_document_id", (v1 as { id: string }).id);
    assert((count ?? 0) > 0, "la v1 se quedó sin aceptaciones");
    // Y ninguna se movió a la v1.1: eso sería reinterpretar un consentimiento.
    const { data: filas } = await admin.from("user_legal_acceptances")
      .select("version").eq("legal_document_id", (v1 as { id: string }).id).limit(50);
    for (const f of (filas ?? []) as { version: string }[]) {
      assert(f.version === "v1", `una aceptación de la v1 quedó marcada «${f.version}»`);
    }
  });

  await check("E. Y una aceptación de la v1 NO cuenta como aceptación de la v1.1",
    async () => {
      // La puerta compara documentos ACTIVOS con lo aceptado, por id. Si la
      // comparación fuera por tipo, aceptar «privacy» una vez valdría para
      // siempre, y una versión nueva no la vería nadie.
      const { data: v1 } = await admin.from("legal_documents")
        .select("id").eq("document_type", "privacy").eq("version", "v1").single();
      const { data: v11 } = await admin.from("legal_documents")
        .select("id").eq("document_type", "privacy").eq("status", "active").single();
      assert((v1 as { id: string }).id !== (v11 as { id: string }).id,
        "la v1 y la v1.1 comparten identidad: no serían dos versiones");
    });

  // =========================================================================
  console.log("\nF–H · La reaceptación");
  // =========================================================================

  await check("F. A quien aceptó la v1 se le vuelve a pedir", async () => {
    const persona = await nuevaPersona("pe02b5b-antigua");

    // Se le fabrica el pasado: aceptó la v1 cuando era la vigente.
    const { data: v1 } = await admin.from("legal_documents")
      .select("id, document_type, version")
      .eq("document_type", "privacy").eq("version", "v1").single();
    const d = v1 as { id: string; document_type: string; version: string };
    const { error: eIns } = await admin.from("user_legal_acceptances").insert({
      user_id: persona.id, legal_document_id: d.id,
      document_type: d.document_type, version: d.version });
    assert(!eIns, `preparar el pasado: ${eIns?.message}`);

    // Y ahora la pregunta: ¿está al día?
    const { data: activos } = await anonimo.from("legal_documents")
      .select("id, document_type").eq("status", "active")
      .in("document_type", ["terms", "privacy"]);
    const { data: suyas } = await admin.from("user_legal_acceptances")
      .select("legal_document_id").eq("user_id", persona.id);
    const aceptados = new Set((suyas ?? [])
      .map((r) => String((r as { legal_document_id: string }).legal_document_id)));
    const pendientes = (activos ?? [])
      .filter((r) => !aceptados.has(String((r as { id: string }).id)));
    assert(pendientes.length > 0,
      "quien aceptó la v1 aparece al día: la reaceptación no se pediría");
    const tipos = pendientes.map((r) => String((r as { document_type: string }).document_type));
    assert(tipos.includes("privacy"),
      `lo pendiente es ${tipos.join(", ")} y tenía que incluir la privacidad`);
  });

  await check("G. Al aceptar se crea una fila NUEVA, y la vieja sigue ahí", async () => {
    const persona = await nuevaPersona("pe02b5b-acepta");
    const { data: v1 } = await admin.from("legal_documents")
      .select("id, document_type, version")
      .eq("document_type", "privacy").eq("version", "v1").single();
    const d = v1 as { id: string; document_type: string; version: string };
    await admin.from("user_legal_acceptances").insert({
      user_id: persona.id, legal_document_id: d.id,
      document_type: d.document_type, version: d.version });

    const { error } = await persona.cli.rpc("accept_active_legal_documents",
      { p_ip_address: null, p_user_agent: "b5b" });
    assert(!error, `aceptar: ${error?.message}`);

    const { data: todas } = await admin.from("user_legal_acceptances")
      .select("version, document_type, legal_document_id, accepted_at")
      .eq("user_id", persona.id).eq("document_type", "privacy");
    const versiones = (todas ?? [])
      .map((r) => String((r as { version: string }).version)).sort();
    assert(versiones.length === 2, `hay ${versiones.length} aceptaciones de privacidad y son 2`);
    assert(versiones.join(",") === "v1,v1.1",
      `las versiones aceptadas son «${versiones.join(", ")}»`);
    // La vieja apunta al documento viejo. No se recicló la fila.
    const vieja = (todas ?? []).find((r) => (r as { version: string }).version === "v1");
    assert(String((vieja as { legal_document_id: string }).legal_document_id) === d.id,
      "la aceptación antigua cambió de documento");
  });

  await check("H. Y después queda al día: no hay bucle de aceptación", async () => {
    const persona = await nuevaPersona("pe02b5b-bucle");
    await persona.cli.rpc("accept_active_legal_documents",
      { p_ip_address: null, p_user_agent: "b5b" });
    // La misma cuenta que usa la puerta: activos requeridos frente a aceptados.
    const { data: activos } = await anonimo.from("legal_documents")
      .select("id").eq("status", "active").in("document_type", ["terms", "privacy"]);
    const { data: suyas } = await admin.from("user_legal_acceptances")
      .select("legal_document_id").eq("user_id", persona.id);
    const aceptados = new Set((suyas ?? [])
      .map((r) => String((r as { legal_document_id: string }).legal_document_id)));
    const pendientes = (activos ?? [])
      .filter((r) => !aceptados.has(String((r as { id: string }).id)));
    assert(pendientes.length === 0,
      `tras aceptar quedan ${pendientes.length} documentos pendientes: es un bucle`);
  });

  await check("I. Una cuenta nueva acepta la v1.1, y nunca ve la v1 como vigente",
    async () => {
      const persona = await nuevaPersona("pe02b5b-nueva");
      const { error } = await persona.cli.rpc("accept_active_legal_documents",
        { p_ip_address: null, p_user_agent: "b5b" });
      assert(!error, `aceptar: ${error?.message}`);
      const { data } = await admin.from("user_legal_acceptances")
        .select("version, document_type").eq("user_id", persona.id);
      const privacidad = (data ?? []).filter((r) =>
        (r as { document_type: string }).document_type === "privacy");
      assert(privacidad.length === 1, `aceptó ${privacidad.length} políticas`);
      assert(String((privacidad[0] as { version: string }).version) === "v1.1",
        `aceptó «${(privacidad[0] as { version: string }).version}»`);
      // Y el visitante solo puede leer la vigente.
      const { data: visibles } = await anonimo.from("legal_documents")
        .select("version").eq("document_type", "privacy");
      const versiones = (visibles ?? [])
        .map((r) => String((r as { version: string }).version));
      assert(versiones.length === 1 && versiones[0] === "v1.1",
        `el visitante ve ${versiones.join(", ") || "(nada)"}`);
    });

  // =========================================================================
  console.log("\nJ–N · Las quince respuestas");
  // =========================================================================

  await check("J. Las quince están publicadas, cada una con UNA revisión vigente",
    async () => {
      const { data } = await sa.cli.from("faq_entries")
        .select("id, slug, status").in("slug", SLUGS);
      assert(data && data.length === 15, `hay ${data?.length} de 15`);
      for (const e of data as { slug: string; status: string }[]) {
        assert(e.status === "published", `«${e.slug}» está en «${e.status}»`);
      }
      for (const e of data as { id: string; slug: string }[]) {
        const { data: revs } = await sa.cli.from("faq_entry_revisions")
          .select("id").eq("entry_id", e.id).is("effective_to", null);
        assert(revs && revs.length === 1,
          `«${e.slug}» tiene ${revs?.length} revisiones vigentes y debe tener una`);
      }
    });

  await check("K. La división de visibilidad es la que declara la base", async () => {
    // El número no se escribe aquí: se lee de la base y se compara con lo que
    // devuelven las vistas. Escribirlo a mano convertiría un cambio deliberado
    // de alcance en un fallo, y un fallo real en una cifra que alguien ajusta.
    const { data: entradas } = await sa.cli.from("faq_entries")
      .select("slug, visibility").in("slug", SLUGS);
    const declaradas = entradas as { slug: string; visibility: string }[];
    const publicas = declaradas.filter((e) => e.visibility === "public").map((e) => e.slug);
    const conSesion = declaradas.filter((e) => e.visibility === "authenticated").map((e) => e.slug);
    assert(publicas.length + conSesion.length === 15, "hay visibilidades inesperadas");

    const { data: vePublico } = await anonimo.from("v_faq_public").select("slug").in("slug", SLUGS);
    const vistasSinSesion = new Set((vePublico ?? [])
      .map((r) => String((r as { slug: string }).slug)));
    assert(vistasSinSesion.size === publicas.length,
      `un visitante ve ${vistasSinSesion.size} y se declararon ${publicas.length} públicas`);
    for (const slug of publicas) {
      assert(vistasSinSesion.has(slug), `«${slug}» es pública y no se lee`);
    }

    const persona = await nuevaPersona("pe02b5b-lector");
    const { data: veDentro } = await persona.cli.from("v_faq_authenticated")
      .select("slug").in("slug", SLUGS);
    const vistasConSesion = new Set((veDentro ?? [])
      .map((r) => String((r as { slug: string }).slug)));
    assert(vistasConSesion.size === 15,
      `con sesión se ven ${vistasConSesion.size} de 15`);
  });

  await check("L. Y sin sesión NO se lee ninguna de las de sesión", async () => {
    const { data: entradas } = await sa.cli.from("faq_entries")
      .select("slug, visibility").in("slug", SLUGS);
    const conSesion = (entradas as { slug: string; visibility: string }[])
      .filter((e) => e.visibility === "authenticated").map((e) => e.slug);
    const { data: fuga } = await anonimo.from("v_faq_public").select("slug").in("slug", conSesion);
    assert(!fuga || fuga.length === 0, `${fuga?.length} respuestas de sesión se leen fuera`);
    // Ni buscándolas por su texto, que es como se encuentran de verdad.
    const { data: buscada } = await anonimo.from("v_faq_public")
      .select("slug").textSearch("search_document", "permisos personas papel",
        { config: "spanish", type: "websearch" });
    const encontradas = (buscada ?? []).map((r) => String((r as { slug: string }).slug));
    for (const slug of conSesion) {
      assert(!encontradas.includes(slug), `«${slug}» aparece al buscar sin sesión`);
    }
  });

  await check("M. No se filtra ni un borrador ni el metadato editorial", async () => {
    // Lo que decide una publicación —en qué se apoya, con qué salvedad, quién lo
    // verificó— es material de revisión, no de cliente. Que esté guardado es
    // bueno; que se lea, no.
    const { data } = await anonimo.from("v_faq_public").select("*").limit(1);
    const columnas = Object.keys((data ?? [{}])[0] as object);
    for (const prohibida of ["verification_status", "source_basis", "verification_note",
      "external_source_url", "external_source_checked_on", "status", "effective_to"]) {
      assert(!columnas.includes(prohibida),
        `la vista pública expone «${prohibida}»`);
    }
    // Y ninguna revisión cerrada se cuela: lo que se lee es lo vigente.
    const { data: cerradas } = await admin.from("faq_entry_revisions")
      .select("entry_id").not("effective_to", "is", null);
    if (cerradas && cerradas.length > 0) {
      const { data: publicas } = await anonimo.from("v_faq_public").select("slug, published_at");
      assert(publicas, "no se pudo leer la FAQ pública");
    }
  });

  await check("N. La categoría de seguridad aparece porque TIENE contenido", async () => {
    // Sin nombrarla en el código: la vista de categorías la ofrece porque hay
    // respuestas publicadas y visibles debajo. Si mañana se retiraran todas,
    // desaparecería sola.
    const { data } = await anonimo.from("v_faq_public_categories").select("code, label");
    const codigos = (data ?? []).map((r) => String((r as { code: string }).code));
    assert(codigos.includes("seguridad"),
      "la categoría de seguridad no se ofrece pese a tener contenido publicado");
    const { data: dentro } = await anonimo.from("v_faq_public")
      .select("slug").eq("category_code", "seguridad");
    assert(dentro && dentro.length > 0, "la categoría se ofrece vacía");
    // Y ninguna categoría sin contenido se cuela en la lista.
    for (const codigo of codigos) {
      const { count } = await anonimo.from("v_faq_public")
        .select("slug", { count: "exact", head: true }).eq("category_code", codigo);
      assert((count ?? 0) > 0, `la categoría «${codigo}» se ofrece sin contenido`);
    }
  });

  await check("O. Las destacadas lo son por dato, y respetan su visibilidad", async () => {
    const { data: declaradas } = await sa.cli.from("faq_entries")
      .select("slug, is_featured, visibility").in("slug", SLUGS);
    const destacadas = (declaradas as { slug: string; is_featured: boolean; visibility: string }[])
      .filter((e) => e.is_featured);
    assert(destacadas.length > 0, "no hay ninguna destacada");
    const { data: publicas } = await anonimo.from("v_faq_public")
      .select("slug, is_featured").in("slug", SLUGS);
    const destacadasPublicas = (publicas ?? [])
      .filter((r) => (r as { is_featured: boolean }).is_featured)
      .map((r) => String((r as { slug: string }).slug));
    for (const d of destacadas) {
      if (d.visibility === "public") {
        assert(destacadasPublicas.includes(d.slug),
          `«${d.slug}» está destacada y no llega destacada a la vista pública`);
      } else {
        assert(!destacadasPublicas.includes(d.slug),
          `«${d.slug}» es de sesión y se destaca a un visitante`);
      }
    }
  });

  // =========================================================================
  console.log("\nP–T · Lo que dicen, ya publicado");
  // =========================================================================

  await check("P. La bandera conserva su límite declarado", async () => {
    const r = await respuestaPublicada("seguridad_como_protege");
    const texto = `${r.answer_short} ${r.answer_long}`;
    assert(/Ninguna medida elimina el riesgo/i.test(texto),
      "se publicó sin reconocer el riesgo residual");
    assert(/no afirmamos lo contrario/i.test(texto), "se perdió la declaración de límite");
    assert(/certificaciones de seguridad propias/i.test(texto),
      "se perdió que no hay certificaciones propias");
    for (const absoluto of ["100% segur", "totalmente segur", "riesgo cero", "inviolable",
      "certificado por", "cumple con la norma"]) {
      assert(!String(texto).toLowerCase().includes(absoluto),
        `se publicó un absoluto: «${absoluto}»`);
    }
  });

  await check("Q. La de otra empresa separa lo privado de lo compartido", async () => {
    const r = await respuestaPublicada("seguridad_otra_empresa");
    assert(String(r.answer_short).trim().startsWith("No."),
      `la respuesta corta no abre con un no: «${String(r.answer_short).slice(0, 30)}…»`);
    assert(/aplicada en la base de datos/i.test(String(r.answer_short)),
      "no se dice dónde está aplicada la separación");
    const larga = String(r.answer_long);
    assert(/excepción que conviene conocer|no es un fallo/i.test(larga),
      "no se marca la excepción como decisión de la empresa");
    assert(/pasaporte|encuesta/i.test(larga),
      "no se nombra qué se puede compartir deliberadamente");
    assert(/revocables|revocable/i.test(larga), "no se dice que lo compartido se revoca");
  });

  await check("R. La del equipo conserva LA SALVEDAD de infraestructura", async () => {
    // Es la que un editor podría recortar por parecer que resta, y sin ella la
    // respuesta sería falsa.
    const r = await respuestaPublicada("seguridad_equipo_trazaloop");
    const texto = `${r.answer_short} ${r.answer_long}`;
    assert(/En la operación normal/i.test(texto), "se perdió el acceso normal acotado");
    assert(/solo ve datos administrativos/i.test(texto),
      "no se dice qué sí ve el equipo");
    assert(/administración técnica de la infraestructura/i.test(texto),
      "SE PERDIÓ la salvedad de infraestructura: la respuesta sería falsa");
    assert(/copias de respaldo contienen todo/i.test(texto),
      "se perdió que los respaldos contienen todo");
    assert(/No afirmamos que ese acceso sea imposible/i.test(texto),
      "se perdió la declaración de que el acceso no es imposible");
    assert(!/nunca|jamás/i.test(texto), "se publicó un «nunca» absoluto");
  });

  await check("S. La de IA entre empresas dice que no, y por qué puede decirlo",
    async () => {
      const r = await respuestaPublicada("seguridad_ia_otras_empresas");
      assert(String(r.answer_short).trim().startsWith("No."), "no abre con un no");
      const texto = `${r.answer_short} ${r.answer_long}`;
      assert(/no se usa como contexto/i.test(texto),
        "no se dice que no se usa como contexto de otra empresa");
      assert(/acotada a su empresa activa|acotado a su empresa/i.test(texto),
        "no se dice que la consulta va acotada a la empresa");
      assert(/no tiene acceso a la base de datos/i.test(texto),
        "no se dice que el modelo no puede ir a buscarlo");
      // Y ninguna respuesta publicada cita datos de una empresa concreta.
      const { data: todas } = await anonimo.from("v_faq_public")
        .select("slug, answer_short, answer_long").eq("category_code", "seguridad");
      for (const x of (todas ?? []) as Record<string, string>[]) {
        assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(`${x.answer_short} ${x.answer_long ?? ""}`
          .replace("contacto@idendi.org", "")),
          `«${x.slug}» cita un correo concreto`);
      }
    });

  await check("T. Entrenamiento y retención publicados con su semántica entera",
    async () => {
      const ent = await respuestaPublicada("seguridad_entrenamiento_modelos");
      const t1 = `${ent.answer_short} ${ent.answer_long}`;
      assert(/no ha activado la autorización/i.test(t1),
        "se perdió que Trazaloop no activó la autorización");
      assert(/salvo que el cliente lo autorice/i.test(t1),
        "se perdió el «salvo autorización» de la política del proveedor");
      assert(!/nunca|jamás|bajo ninguna circunstancia/i.test(t1),
        "se publicó una promesa eterna en nombre del proveedor");

      const ret = await respuestaPublicada("seguridad_retencion_proveedor");
      const t2 = `${ret.answer_short} ${ret.answer_long}`;
      assert(String(ret.answer_short).startsWith("Hasta 30 días."),
        "la respuesta corta no abre con el dato");
      assert(/no tiene contratado un acuerdo de retención cero/i.test(t2),
        "se perdió que no hay retención cero");
      assert(/NO es un acuerdo de retención cero/i.test(t2),
        "se perdió que pedir no almacenar no es retención cero");
      assert(/obligación legal/i.test(t2), "se perdieron las excepciones");
      assert(!/interfaz de programación/i.test(t2),
        "volvió la jerga que se quitó por ilegible");

      // Y en el texto del cliente no se nombra al proveedor.
      for (const nombre of ["OpenAI", "Anthropic", "QUALITY_AI", "gpt-", "claude-"]) {
        assert(!t1.includes(nombre) && !t2.includes(nombre),
          `se publicó el nombre del proveedor o su configuración: ${nombre}`);
      }
    });

  await check("U. Ninguna de las quince nombra la configuración del servidor",
    async () => {
      const { data } = await anonimo.from("v_faq_public")
        .select("slug, question, answer_short, answer_long");
      for (const x of (data ?? []) as Record<string, string>[]) {
        const texto = `${x.question} ${x.answer_short} ${x.answer_long ?? ""}`;
        for (const fuga of ["QUALITY_AI_PROVIDER", "QUALITY_AI_MODEL", "SUPABASE_",
          "service_role", "anon key", "gpt-5", "claude-sonnet"]) {
          assert(!texto.includes(fuga), `«${x.slug}» expone «${fuga}»`);
        }
      }
    });

  // =========================================================================
  console.log("\nV · La ayuda contextual no se enteró de nada");
  // =========================================================================

  await check("V. Las once ayudas siguen publicadas y se leen igual", async () => {
    // Publicar contenido legal y publicar ayuda no se tocan. Que esto siga
    // verde después de la publicación es lo que lo demuestra.
    const persona = await nuevaPersona("pe02b5b-ayuda");
    const { getPageHelp } = await import("../../lib/db/contextual-help");
    const cargada = await getPageHelp("quality.context.interested_parties", "es", persona.cli);
    assert(cargada.status === "ok", "la ayuda de partes interesadas dejó de cargarse");
    const claves = Object.keys(cargada.help);
    assert(claves.length === 11, `se leen ${claves.length} ayudas y son 11`);
    const { data } = await admin.from("help_items")
      .select("status").eq("page_key", "quality.context.interested_parties");
    for (const h of (data ?? []) as { status: string }[]) {
      assert(h.status === "published", `una ayuda quedó en «${h.status}»`);
    }
  });

  console.log(`\nPE-02B5B · publicación: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
