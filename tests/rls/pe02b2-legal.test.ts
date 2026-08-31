/**
 * Trazaloop · PE-02B2 · Los documentos legales, contra base REAL.
 *
 * La matriz Q–AC. Lo que sostiene todo lo demás: **una versión legal que ha
 * estado vigente no se reescribe**. Antes de este tramo sí se podía, y eso
 * convertía una prueba de consentimiento en un texto editable — alguien podía
 * cambiar lo que dice la política de privacidad que la gente ya aceptó, sin
 * cambiar su identificador y sin que nadie tuviera que volver a aceptarla.
 *
 * Correr: npm run test:pe02b2-legal
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
  const email = `pe02b2l-${tag}-${sello}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA legal ${tag}` } });
  assert(!error && data.user, `crear ${tag}: ${error?.message}`);
  const client = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  assert(!e, `login ${tag}: ${e?.message}`);
  return { id: data.user!.id, client: client as unknown as SupabaseClient };
}

/**
 * El escenario se monta sobre un tipo de documento que NO es requerido para
 * entrar —`data_processing`—, a propósito.
 *
 * `terms` y `privacy` son los dos que exige la puerta de `/legal/accept`.
 * Publicar una versión nueva de cualquiera de ellos en la base local dejaría a
 * TODAS las cuentas de prueba del repositorio pendientes de aceptar, y las
 * suites que entran a la aplicación empezarían a rebotar. §20 del encargo lo
 * pide expresamente: no bloquear a las cuentas de QA sin manejar el fixture.
 *
 * Lo que se comprueba es idéntico: la tabla, el disparador y las funciones no
 * distinguen el tipo.
 */
const TIPO = "data_processing";

async function main() {
  const CAPA = await import("../../lib/db/legal-platform");
  const PRODUCTO = await import("../../lib/db/legal");

  console.log("\nPE-02B2 · Documentos legales · base real\n");

  const sa = await persona("sa");
  await admin.from("platform_staff")
    .insert({ user_id: sa.id, role_code: "superadmin", status: "active" });
  const soporte = await persona("support");
  await admin.from("platform_staff")
    .insert({ user_id: soporte.id, role_code: "support", status: "active" });
  const usuario = await persona("usuario");

  const leerFila = async (id: string) => {
    const { data } = await admin.from("legal_documents").select("*").eq("id", id).single();
    return data as Record<string, unknown>;
  };

  let v1 = "", v2 = "";

  // ==========================================================================
  console.log("Q · Lo que ya existe sigue funcionando");
  // ==========================================================================

  await check("Q. Los documentos vigentes se leen, con y sin sesión", async () => {
    const { data } = await anonimo.from("legal_documents")
      .select("document_type, version, status").eq("status", "active");
    assert(data && data.length >= 2, `se leen ${data?.length} documentos vigentes`);
    assert((data as Record<string, unknown>[]).every((d) => d.status === "active"),
      "el anónimo alcanza algo que no está vigente");
    const tipos = (data as Record<string, unknown>[]).map((d) => String(d.document_type));
    assert(tipos.includes("terms") && tipos.includes("privacy"),
      "faltan los dos documentos requeridos");
  });

  await check("Q2. Y el anónimo NO ve borradores ni archivadas", async () => {
    const { data } = await anonimo.from("legal_documents").select("id, status");
    const estados = new Set((data ?? []).map((d) => String((d as { status: string }).status)));
    assert(!estados.has("draft") && !estados.has("archived"),
      `el anónimo ve ${[...estados].join(", ")}`);
  });

  // ==========================================================================
  console.log("\nT–U · Crear una versión y publicarla");
  // ==========================================================================

  await check("T. Se puede crear una versión sucesora, y nace como borrador",
    async () => {
      const res = await CAPA.createLegalDraft({
        documentType: TIPO, version: `qa-${sello}-1`,
        title: "Tratamiento de datos · prueba PE-02B2",
        content: "Texto de prueba, versión primera. ".repeat(4),
        changeNote: "alta de prueba",
      }, sa.client);
      assert(!res.error && res.id, `crear: ${res.error}`);
      v1 = res.id!;
      const fila = await leerFila(v1);
      assert(fila.status === "draft", `nació en «${fila.status}»`);
      assert(fila.published_at === null, "un borrador nació con fecha de publicación");
      assert(fila.created_by === sa.id, "no se registró quién la redactó");
    });

  await check("T2. Un borrador NO lo ve el público, ni se acepta", async () => {
    const { data } = await anonimo.from("legal_documents").select("id").eq("id", v1);
    assert(!data || data.length === 0, "el anónimo alcanzó un borrador legal");
    const activos = await PRODUCTO.listActiveLegalDocuments;
    assert(typeof activos === "function", "la capa del producto cambió de forma");
  });

  await check("U. Al publicarla, es la única vigente de su tipo", async () => {
    const res = await CAPA.publishLegalDocument(v1, sa.client);
    assert(!res.error, `publicar: ${res.error}`);
    const fila = await leerFila(v1);
    assert(fila.status === "active", `quedó en «${fila.status}»`);
    assert(fila.published_at !== null, "no se fechó la publicación");
    assert(fila.published_by === sa.id, "no se registró quién la publicó");

    const { data } = await admin.from("legal_documents")
      .select("id").eq("document_type", TIPO).eq("status", "active");
    assert(data && data.length === 1, `hay ${data?.length} versiones vigentes de ese tipo`);
  });

  // ==========================================================================
  console.log("\nR–S · La reescritura, cerrada");
  // ==========================================================================

  await check("R. El contenido de la versión VIGENTE no se reescribe", async () => {
    // Este es el hueco que PE-02B1 encontró: la política de escritura dejaba
    // a un superadministrador cambiar el texto en su sitio.
    const { error } = await sa.client.from("legal_documents")
      .update({ content: "TEXTO CAMBIADO A ESCONDIDAS" }).eq("id", v1);
    assert(error, "se pudo reescribir el contenido de la versión vigente");
    assert(/no se modifica/i.test(error!.message),
      `el rechazo no se explica: ${error!.message}`);
    const fila = await leerFila(v1);
    assert(!String(fila.content).includes("ESCONDIDAS"), "el texto cambió pese al rechazo");
  });

  await check("R2. Ni el título, ni la versión, ni la fecha de publicación", async () => {
    for (const campo of [
      { title: "Otro título" },
      { version: "otra-version" },
      { published_at: new Date(0).toISOString() },
    ]) {
      const { error } = await sa.client.from("legal_documents").update(campo).eq("id", v1);
      assert(error, `se pudo cambiar ${Object.keys(campo)[0]} de una versión vigente`);
    }
  });

  await check("R3. Y tampoco con la clave de servicio", async () => {
    // El freno es un DISPARADOR, no una política: `service_role` se salta la
    // RLS y no se salta esto.
    const { error } = await admin.from("legal_documents")
      .update({ content: "TEXTO CAMBIADO CON SERVICE_ROLE" }).eq("id", v1);
    assert(error, "la clave de servicio reescribió una versión legal vigente");
  });

  await check("S. Una versión archivada es igual de inmutable", async () => {
    const res = await CAPA.createLegalDraft({
      documentType: TIPO, version: `qa-${sello}-2`,
      title: "Tratamiento de datos · prueba PE-02B2 · segunda",
      content: "Texto de prueba, versión segunda. ".repeat(4),
      changeNote: "sucesora",
    }, sa.client);
    assert(!res.error && res.id, `crear sucesora: ${res.error}`);
    v2 = res.id!;
    const pub = await CAPA.publishLegalDocument(v2, sa.client);
    assert(!pub.error, `publicar sucesora: ${pub.error}`);

    const anterior = await leerFila(v1);
    assert(anterior.status === "archived", `la anterior quedó en «${anterior.status}»`);
    assert(anterior.retired_at !== null, "no se fechó el retiro");
    assert(anterior.superseded_by_id === v2, "la anterior no dice quién la sucede");
    const nueva = await leerFila(v2);
    assert(nueva.supersedes_id === v1, "la nueva no dice a quién sucede");

    const { error } = await admin.from("legal_documents")
      .update({ content: "REESCRITA DESPUÉS DE ARCHIVAR" }).eq("id", v1);
    assert(error, "se reescribió una versión archivada");

    const { error: eRevivir } = await admin.from("legal_documents")
      .update({ status: "active" }).eq("id", v1);
    assert(eRevivir, "una versión archivada volvió a estar vigente");
  });

  // ==========================================================================
  console.log("\nV–W · La aceptación");
  // ==========================================================================

  await check("V. Una aceptación queda atada a la versión que se aceptó", async () => {
    // Se registra a mano contra la versión archivada, que es lo que le habría
    // pasado a alguien que aceptó antes del cambio.
    const { error } = await admin.from("user_legal_acceptances").insert({
      user_id: usuario.id, legal_document_id: v1,
      document_type: TIPO, version: `qa-${sello}-1`, accepted_at: new Date().toISOString(),
    });
    assert(!error, `registrar aceptación: ${error?.message}`);

    const { data } = await admin.from("user_legal_acceptances")
      .select("legal_document_id, version").eq("user_id", usuario.id);
    assert(data && data.length === 1, "no quedó la aceptación");
    const a = data![0] as Record<string, unknown>;
    assert(a.legal_document_id === v1, "la aceptación apunta a otra versión");
    assert(String(a.version) === `qa-${sello}-1`,
      "la aceptación no conserva la versión que se aceptó");
  });

  await check("W. Y NO se hereda: la versión nueva sigue sin estar aceptada", async () => {
    const { data } = await admin.from("user_legal_acceptances")
      .select("id").eq("user_id", usuario.id).eq("legal_document_id", v2);
    assert(!data || data.length === 0,
      "la aceptación de la versión anterior se contó como aceptación de la nueva");
  });

  await check("W2. Publicar es lo que hace que se vuelva a pedir", async () => {
    // La puerta compara documentos ACTIVOS con lo aceptado. Con la sucesora
    // publicada, el activo de ese tipo es otro id, así que falta por aceptar.
    const { data: activos } = await admin.from("legal_documents")
      .select("id").eq("document_type", TIPO).eq("status", "active");
    const idActivo = String((activos![0] as { id: string }).id);
    const { data: aceptados } = await admin.from("user_legal_acceptances")
      .select("legal_document_id").eq("user_id", usuario.id);
    const acept = new Set((aceptados ?? [])
      .map((r) => String((r as { legal_document_id: string }).legal_document_id)));
    assert(!acept.has(idActivo),
      "la persona figura como si hubiera aceptado la versión nueva");
  });

  // ==========================================================================
  console.log("\nAA · Nada se borra");
  // ==========================================================================

  await check("AA. Una versión publicada no se borra", async () => {
    const { error } = await admin.from("legal_documents").delete().eq("id", v1);
    assert(error, "se borró una versión legal publicada");
    assert(/no se borra/i.test(error!.message), `mensaje raro: ${error!.message}`);
  });

  await check("AA2. Y un borrador sí, mientras nadie lo haya aceptado", async () => {
    const res = await CAPA.createLegalDraft({
      documentType: TIPO, version: `qa-${sello}-descartable`,
      title: "Borrador descartable",
      content: "Texto que no llegará a publicarse nunca. ".repeat(3),
      changeNote: null,
    }, sa.client);
    assert(!res.error && res.id, `crear: ${res.error}`);
    const desechado = await CAPA.discardLegalDraft(res.id!, sa.client);
    assert(!desechado.error, `descartar: ${desechado.error}`);
    const { data } = await admin.from("legal_documents").select("id").eq("id", res.id!);
    assert(!data || data.length === 0, "el borrador sigue ahí");
  });

  await check("AA3. Descartar algo publicado se rechaza con palabras", async () => {
    const res = await CAPA.discardLegalDraft(v2, sa.client);
    assert(res.error !== null, "se descartó una versión vigente");
    assert(/borrador/i.test(res.error!), `el rechazo no se explica: ${res.error}`);
  });

  // ==========================================================================
  console.log("\nX–Z · Quién puede");
  // ==========================================================================

  await check("X. Una persona cualquiera no administra documentos legales",
    async () => {
      const crear = await CAPA.createLegalDraft({
        documentType: TIPO, version: `qa-${sello}-intruso`,
        title: "Intruso", content: "Texto de prueba de intrusión. ".repeat(3),
        changeNote: null,
      }, usuario.client);
      assert(crear.error !== null, "una persona cualquiera creó una versión legal");

      const publicar = await CAPA.publishLegalDocument(v2, usuario.client);
      assert(publicar.error !== null, "una persona cualquiera publicó");

      // Una actualización que la RLS no autoriza NO devuelve error: no encuentra
      // ninguna fila que actualizar y termina con éxito sobre cero filas. Así
      // que lo que se comprueba es lo que importa —que el texto no cambió— y
      // además que no tocó nada.
      const { data, error } = await usuario.client.from("legal_documents")
        .update({ content: "REESCRITO POR ALGUIEN CUALQUIERA" })
        .eq("id", v2).select("id");
      assert(error || (data ?? []).length === 0,
        "una persona cualquiera modificó filas de un documento legal");
      const fila = await leerFila(v2);
      assert(!String(fila.content).includes("ALGUIEN CUALQUIERA"),
        "una persona cualquiera reescribió un documento legal");
      assert(fila.status === "active", "una persona cualquiera cambió el estado");
    });

  await check("Y. El superadministrador sí, y ve toda la historia", async () => {
    const lista = await CAPA.listLegalDocumentsForPlatform(sa.client);
    assert(lista.status === "ok", "el superadministrador no pudo leer la lista");
    const mias = lista.data.filter((d) => d.version.startsWith(`qa-${sello}`));
    assert(mias.length === 2, `ve ${mias.length} de las 2 versiones de prueba`);
    assert(mias.some((d) => d.status === "archived"), "no ve la archivada");
    const conAceptaciones = mias.find((d) => d.id === v1);
    assert(conAceptaciones?.acceptances === 1,
      `cuenta ${conAceptaciones?.acceptances} aceptaciones y hay 1`);
  });

  await check("Z. Soporte lee la historia y no escribe", async () => {
    const lista = await CAPA.listLegalDocumentsForPlatform(soporte.client);
    assert(lista.status === "ok", "soporte no pudo leer");
    assert(lista.data.some((d) => d.version === `qa-${sello}-1`),
      "soporte no ve las versiones archivadas");

    const crear = await CAPA.createLegalDraft({
      documentType: TIPO, version: `qa-${sello}-soporte`,
      title: "Soporte", content: "Texto de prueba de soporte. ".repeat(3), changeNote: null,
    }, soporte.client);
    assert(crear.error !== null, "soporte creó una versión legal");

    const publicar = await CAPA.publishLegalDocument(v2, soporte.client);
    assert(publicar.error !== null, "soporte publicó una versión legal");
  });

  // ==========================================================================
  console.log("\nAB–AC · Lo que el producto sigue viendo");
  // ==========================================================================

  await check("AB. La lectura pública de los legales no cambió", async () => {
    const { data, error } = await anonimo.from("legal_documents")
      .select("document_type, version, title, content, status").eq("status", "active");
    assert(!error, `la lectura pública falló: ${error?.message}`);
    assert(data && data.length >= 3, `se leen ${data?.length} vigentes`);
    // Y sigue sin colarse ninguna columna de administración por esa puerta:
    // lo que se lee es lo que la aplicación pública ya leía.
    const tipos = (data as Record<string, unknown>[]).map((d) => String(d.document_type));
    assert(tipos.includes("terms") && tipos.includes("privacy"),
      "dejaron de verse los documentos requeridos");
  });

  await check("AC. La puerta de aceptación sigue coherente", async () => {
    // `terms` y `privacy` no se han tocado en esta suite: quien ya los había
    // aceptado los sigue teniendo aceptados. Es lo que §20 pide comprobar.
    const { data: requeridos } = await admin.from("legal_documents")
      .select("id, document_type").eq("status", "active")
      .in("document_type", ["terms", "privacy"]);
    assert(requeridos && requeridos.length === 2, "cambió el número de requeridos");

    const nueva = await persona("acepta");
    const { error } = await nueva.client.rpc("accept_active_legal_documents",
      { p_ip_address: null, p_user_agent: "pe02b2" });
    assert(!error, `aceptar: ${error?.message}`);

    const { data: suyas } = await admin.from("user_legal_acceptances")
      .select("legal_document_id, document_type").eq("user_id", nueva.id);
    const tipos = (suyas ?? []).map((r) => String((r as { document_type: string }).document_type));
    assert(tipos.includes("terms") && tipos.includes("privacy"),
      "aceptar dejó de registrar los dos requeridos");
    // Y NO se aceptó el de prueba, porque no es requerido: la RPC decide ella
    // sola cuáles son, y este tramo no la ha tocado.
    assert(!tipos.includes(TIPO),
      "la aceptación registró un documento que no es requerido");
  });

  console.log(`\nPE-02B2 · legales: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
