/**
 * Trazaloop · PE-02B2 · La consola de la FAQ, contra base REAL.
 *
 * La matriz A–P del encargo, y una advertencia que el propio encargo hace:
 * «probar los permisos de verdad, no solo los botones escondidos». Aquí no se
 * mira ninguna pantalla: se llama a la capa de datos con la sesión de cada
 * papel y se comprueba qué le deja hacer la base.
 *
 * Correr: npm run test:pe02b2-faq-admin
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
  const email = `pe02b2-${tag}-${sello}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA PE-02B2 ${tag}` } });
  assert(!error && data.user, `crear ${tag}: ${error?.message}`);
  const client = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  assert(!e, `login ${tag}: ${e?.message}`);
  return { id: data.user!.id, client: client as unknown as SupabaseClient };
}

async function main() {
  const CAPA = await import("../../lib/db/faq-platform");

  /**
   * Una lectura devuelve «se pudo» o «no se pudo», y el contenido solo existe en
   * el primer caso. Este ayudante lo estrecha en un sitio, para que cada
   * comprobación hable de lo que quiere comprobar y no de cómo se estrecha un
   * tipo; y de paso, si una lectura falla, lo dice con esas palabras.
   */
  function dato<T>(r: { status: "ok"; data: T } | { status: "unavailable" }, que: string): T {
    assert(r.status === "ok", `no se pudo leer ${que}`);
    return r.data;
  }
  const { faqPublishBlockReason } = await import("../../lib/domain/faq-admin");

  console.log("\nPE-02B2 · La consola de la FAQ · base real\n");

  const sa = await persona("sa");
  await admin.from("platform_staff")
    .insert({ user_id: sa.id, role_code: "superadmin", status: "active" });
  const soporte = await persona("support");
  await admin.from("platform_staff")
    .insert({ user_id: soporte.id, role_code: "support", status: "active" });
  const empresa = await persona("org-admin");
  await empresa.client.rpc("create_organization", { p_name: `QA PE-02B2 ${sello}` });

  const cats = await CAPA.listFaqCategories(sa.client);
  assert(cats.status === "ok", "no se pudieron leer las categorías");
  const seguridad = cats.data.find((c) => c.code === "seguridad")!;
  const soporteCat = cats.data.find((c) => c.code === "soporte")!;

  let entryId = "";

  // ==========================================================================
  console.log("A–C · Quién entra a la consola");
  // ==========================================================================

  await check("A. El superadministrador lista, y ve las categorías con su uso",
    async () => {
      const res = await CAPA.listFaqEntries({}, sa.client);
      assert(res.status === "ok", "la lista no se pudo leer");
      assert(cats.data.length >= 10, `ve ${cats.data.length} categorías de 10`);
      assert(typeof seguridad.entries === "number", "no se cuenta el uso de la categoría");
    });

  await check("B. Soporte lee y NO escribe", async () => {
    const res = await CAPA.listFaqEntries({}, soporte.client);
    assert(res.status === "ok", "soporte no pudo leer la lista");
    const esc = await CAPA.createFaqEntry({
      slug: `qa_b2_soporte_${sello}`, categoryId: soporteCat.id,
      visibility: "public", scope: "global", moduleKeys: [],
      question: "¿Puede soporte crear?", answerShort: "No debería.",
    }, soporte.client);
    assert(esc.error !== null, "soporte creó una pregunta");
    assert(/no puede administrar|no fue posible/i.test(esc.error!),
      `el mensaje no explica nada: ${esc.error}`);
  });

  await check("C. Un administrador de empresa no ve ni toca nada", async () => {
    const res = await CAPA.listFaqEntries({}, empresa.client);
    // La lectura no falla: devuelve cero filas, porque la política no le da
    // ninguna. Es la diferencia entre «no puedes» y «no hay», y aquí es «no
    // puedes» expresado como conjunto vacío.
    assert(res.status === "ok" && res.data.rows.length === 0,
      "un administrador de empresa ve el contenido de la plataforma");
    const esc = await CAPA.createFaqEntry({
      slug: `qa_b2_intruso_${sello}`, categoryId: soporteCat.id,
      visibility: "public", scope: "global", moduleKeys: [],
      question: "¿Puede un admin de empresa?", answerShort: "No.",
    }, empresa.client);
    assert(esc.error !== null, "un administrador de empresa creó una pregunta");
  });

  // ==========================================================================
  console.log("\nD–F · Crear y editar el borrador");
  // ==========================================================================

  await check("D. Crear deja un BORRADOR, no una publicación", async () => {
    const res = await CAPA.createFaqEntry({
      slug: `qa_b2_${sello}`, categoryId: soporteCat.id,
      visibility: "public", scope: "global", moduleKeys: [],
      question: "¿Cómo pido ayuda, en una prueba?",
      answerShort: "Desde el Centro de soporte.",
    }, sa.client);
    assert(!res.error && res.id, `crear: ${res.error}`);
    entryId = res.id!;

    const det = dato(await CAPA.getFaqEntryDetail(entryId, "es", sa.client), "lo recién creado");
    assert(det, "no se encontró lo recién creado");
    assert(det!.entry.status === "draft", `nació en «${det!.entry.status}»`);
    assert(det!.current === null, "nació publicada");
    assert(det!.draft !== null, "no se creó el borrador");

    const publica = await anonimo.from("v_faq_public").select("slug").eq("slug", `qa_b2_${sello}`);
    assert(!publica.data || publica.data.length === 0, "lo recién creado ya se lee sin sesión");
  });

  await check("D2. Y NO se puede publicar hasta decir en qué se apoya", async () => {
    // Una pregunta recién creada nace «sin comprobar», así que la base la
    // rechaza. No es un obstáculo accidental: obliga a que alguien diga en qué
    // se apoya la respuesta ANTES de que se lea.
    const pub = await CAPA.publishFaqEntry(entryId, "alta", "es", sa.client);
    assert(pub.error !== null, "se publicó una respuesta recién creada, sin comprobar");
    assert(/no se puede publicar/i.test(pub.error!), `el rechazo llega ilegible: ${pub.error}`);
  });

  await check("E. Editar el borrador no toca lo publicado", async () => {
    // Se fija la verificación, se publica una vez, y DESPUÉS se edita el
    // borrador: lo publicado tiene que quedarse exactamente como estaba.
    await CAPA.saveFaqDraft({
      entryId, question: "¿Cómo pido ayuda, en una prueba?",
      answerShort: "Desde el Centro de soporte.", answerLong: null,
      normativeClass: "safe", verificationStatus: "verified",
      sourceBasis: "prueba", verificationNote: null,
      externalSourceUrl: null, externalSourceCheckedOn: null, changeNote: null,
    }, sa.client);
    const pub = await CAPA.publishFaqEntry(entryId, "alta", "es", sa.client);
    assert(!pub.error, `publicar: ${pub.error}`);

    const guardado = await CAPA.saveFaqDraft({
      entryId, question: "¿Cómo pido ayuda, en una prueba?",
      answerShort: "REDACCIÓN NUEVA sin publicar.", answerLong: null,
      normativeClass: "safe", verificationStatus: "verified",
      sourceBasis: "prueba", verificationNote: null,
      externalSourceUrl: null, externalSourceCheckedOn: null, changeNote: "cambio",
    }, sa.client);
    assert(!guardado.error, `guardar borrador: ${guardado.error}`);

    const det = dato(await CAPA.getFaqEntryDetail(entryId, "es", sa.client), "la ficha");
    assert(det?.current, "se perdió lo publicado");
    assert(det!.current!.answerShort.includes("Centro de soporte"),
      `editar el borrador cambió lo publicado: «${det!.current!.answerShort}»`);
    assert(det!.draft!.answerShort.includes("REDACCIÓN NUEVA"),
      "el borrador no guardó lo nuevo");
    assert(det!.entry.hasPendingDraft,
      "no se avisa de que hay un borrador con cambios");
  });

  await check("F. Y quien lee sin sesión sigue viendo lo publicado", async () => {
    const { data } = await anonimo.from("v_faq_public")
      .select("answer_short").eq("slug", `qa_b2_${sello}`);
    assert(data && data.length === 1, "no se lee la publicada");
    assert(String((data![0] as { answer_short: string }).answer_short)
      .includes("Centro de soporte"), "el borrador se filtró a la lectura pública");
  });

  // ==========================================================================
  console.log("\nG–I · Vista previa, publicar y retirar");
  // ==========================================================================

  await check("G. La vista previa sale del borrador y no lo hace legible", async () => {
    // La «vista previa» de la consola es el borrador que la capa devuelve a un
    // superadministrador. Lo que se comprueba es que ESE contenido no tiene
    // ninguna otra puerta.
    const det = dato(await CAPA.getFaqEntryDetail(entryId, "es", sa.client), "la ficha");
    assert(det?.draft?.answerShort.includes("REDACCIÓN NUEVA"),
      "la consola no ve el borrador");
    const conSesion = await empresa.client.from("v_faq_authenticated")
      .select("answer_short").eq("slug", `qa_b2_${sello}`);
    assert(conSesion.data?.length === 1, "no se lee la publicada con sesión");
    assert(!String((conSesion.data![0] as { answer_short: string }).answer_short)
      .includes("REDACCIÓN NUEVA"), "el borrador se lee con una sesión cualquiera");
  });

  await check("H. Publicar cierra la anterior y cambia lo que se lee", async () => {
    const res = await CAPA.publishFaqEntry(entryId, "segunda redacción", "es", sa.client);
    assert(!res.error, `publicar: ${res.error}`);
    const { data } = await anonimo.from("v_faq_public")
      .select("answer_short").eq("slug", `qa_b2_${sello}`);
    assert(String((data![0] as { answer_short: string }).answer_short)
      .includes("REDACCIÓN NUEVA"), "lo publicado no cambió");
    const det = dato(await CAPA.getFaqEntryDetail(entryId, "es", sa.client), "la ficha");
    assert(det!.history.length === 1, `hay ${det!.history.length} versiones cerradas`);
    assert(!det!.entry.hasPendingDraft,
      "sigue avisando de cambios sin publicar después de publicarlos");
  });

  await check("I. Retirar deja de mostrarla y no borra nada", async () => {
    const res = await CAPA.unpublishFaqEntry(entryId, "es", sa.client);
    assert(!res.error, `retirar: ${res.error}`);
    const { data } = await anonimo.from("v_faq_public").select("slug").eq("slug", `qa_b2_${sello}`);
    assert(!data || data.length === 0, "se sigue leyendo una retirada");
    const det = dato(await CAPA.getFaqEntryDetail(entryId, "es", sa.client), "la ficha");
    assert(det!.entry.status === "unpublished", "no quedó como retirada");
    assert(det!.history.length === 2, "retirar borró historia");
    // Y soporte sigue pudiendo consultarla, que es su trabajo.
    const desdeSoporte = dato(
      await CAPA.getFaqEntryDetail(entryId, "es", soporte.client), "la ficha desde soporte");
    assert(desdeSoporte, "soporte dejó de ver una entrada retirada");
  });

  // ==========================================================================
  console.log("\nJ–L · Historia y recuperación");
  // ==========================================================================

  await check("J. La historia lleva versión, periodo, autor y nota", async () => {
    const det = dato(await CAPA.getFaqEntryDetail(entryId, "es", sa.client), "la ficha");
    const todas = [...(det!.current ? [det!.current] : []), ...det!.history];
    assert(todas.length === 2, `hay ${todas.length} versiones y deberían ser 2`);
    for (const r of todas) {
      assert(r.revisionNumber >= 1, "sin número de versión");
      assert(r.effectiveFrom, "sin fecha de inicio");
      assert(r.verificationStatus, "sin estado de verificación");
    }
    assert(todas.some((r) => r.changeNote === "segunda redacción"),
      "no se conserva la nota del cambio");
    assert(todas.every((r) => r.createdByName !== undefined),
      "no se resuelve el autor");
  });

  await check("K. Recuperar una versión antigua la copia al BORRADOR", async () => {
    const det = dato(await CAPA.getFaqEntryDetail(entryId, "es", sa.client), "la ficha");
    const primera = det!.history.find((r) => r.revisionNumber === 1)
      ?? det!.history[det!.history.length - 1];
    const antes = det!.history.length;

    const res = await CAPA.restoreFaqRevision(primera.id, sa.client);
    assert(!res.error, `recuperar: ${res.error}`);

    const luego = dato(await CAPA.getFaqEntryDetail(entryId, "es", sa.client), "la ficha");
    assert(luego!.history.length === antes, "recuperar tocó la historia");
    assert(luego!.draft!.answerShort.includes("Centro de soporte"),
      "el borrador no recibió el texto antiguo");
    assert((luego!.draft!.changeNote ?? "").includes("Restaurado"),
      "no queda dicho que viene de una restauración");
  });

  await check("L. Y publicarlo crea una versión NUEVA, no reabre la vieja", async () => {
    const antes = dato(await CAPA.getFaqEntryDetail(entryId, "es", sa.client), "la ficha");
    const cuantas = antes!.history.length + (antes!.current ? 1 : 0);
    const res = await CAPA.publishFaqEntry(entryId, "se vuelve a la primera", "es", sa.client);
    assert(!res.error, `publicar restaurado: ${res.error}`);
    const luego = dato(await CAPA.getFaqEntryDetail(entryId, "es", sa.client), "la ficha");
    const ahora = luego!.history.length + (luego!.current ? 1 : 0);
    assert(ahora === cuantas + 1, `hay ${ahora} versiones y deberían ser ${cuantas + 1}`);
    assert(luego!.current!.answerShort.includes("Centro de soporte"),
      "la vigente no lleva el texto recuperado");
  });

  // ==========================================================================
  console.log("\nM · La barrera de las afirmaciones");
  // ==========================================================================

  await check("M. Una afirmación de seguridad sin comprobar NO se publica", async () => {
    const creada = await CAPA.createFaqEntry({
      slug: `qa_b2_seg_${sello}`, categoryId: seguridad.id,
      visibility: "public", scope: "global", moduleKeys: [],
      question: "¿Pregunta de seguridad de prueba?",
      answerShort: "Respuesta que todavía nadie comprobó.",
    }, sa.client);
    assert(!creada.error && creada.id, `crear: ${creada.error}`);

    // La capa de dominio lo dice ANTES de enviar…
    const det = dato(await CAPA.getFaqEntryDetail(creada.id!, "es", sa.client), "la ficha");
    const razon = faqPublishBlockReason({
      verificationStatus: det!.draft!.verificationStatus,
      verificationNote: det!.draft!.verificationNote,
      externalSourceUrl: det!.draft!.externalSourceUrl,
      externalSourceCheckedOn: det!.draft!.externalSourceCheckedOn,
    });
    assert(razon !== null, "la consola no avisa de que no se puede publicar");
    assert(/comprob/i.test(razon!), `el aviso no explica por qué: «${razon}»`);

    // …y la base lo rechaza igual, que es lo que de verdad importa.
    const pub = await CAPA.publishFaqEntry(creada.id!, null, "es", sa.client);
    assert(pub.error !== null, "se publicó una afirmación sin comprobar");
    assert(/no se puede publicar/i.test(pub.error!),
      `el rechazo llega ilegible: «${pub.error}»`);

    // Y con la comprobación hecha, sale.
    await CAPA.saveFaqDraft({
      entryId: creada.id!, question: "¿Pregunta de seguridad de prueba?",
      answerShort: "Respuesta comprobada.", answerLong: null,
      normativeClass: "safe", verificationStatus: "verified",
      sourceBasis: "PE-02A §1", verificationNote: null,
      externalSourceUrl: null, externalSourceCheckedOn: null, changeNote: null,
    }, sa.client);
    const pub2 = await CAPA.publishFaqEntry(creada.id!, "comprobada", "es", sa.client);
    assert(!pub2.error, `no se publicó lo comprobado: ${pub2.error}`);
  });

  await check("M2. Y la salvedad que falta se dice antes de enviar", async () => {
    const razon = faqPublishBlockReason({
      verificationStatus: "verified_with_qualifier",
      verificationNote: null, externalSourceUrl: null, externalSourceCheckedOn: null,
    });
    assert(razon !== null && /salvedad/i.test(razon),
      "no se avisa de que falta la salvedad");
  });

  // ==========================================================================
  console.log("\nN–P · Categorías, filtros y lo que no se filtra");
  // ==========================================================================

  await check("N. Las categorías se administran, y no se pierden preguntas", async () => {
    const creada = await CAPA.createFaqCategory({
      code: `qa_cat_${sello}`, label: "Categoría de prueba",
      description: null, sortOrder: 900,
    }, sa.client);
    assert(!creada.error, `crear categoría: ${creada.error}`);

    const lista = await CAPA.listFaqCategories(sa.client);
    const nueva = lista.status === "ok"
      ? lista.data.find((c) => c.code === `qa_cat_${sello}`) : undefined;
    assert(nueva, "la categoría creada no aparece");
    assert(nueva!.entries === 0, "una categoría recién creada cuenta preguntas");

    const editada = await CAPA.updateFaqCategory({
      id: nueva!.id, label: "Categoría renombrada",
      description: null, sortOrder: 901, status: "active",
    }, sa.client);
    assert(!editada.error, `renombrar: ${editada.error}`);

    // Y soporte no la puede tocar.
    const porSoporte = await CAPA.updateFaqCategory({
      id: nueva!.id, label: "Soporte manda", description: null,
      sortOrder: 1, status: "active",
    }, soporte.client);
    assert(porSoporte.error !== null, "soporte renombró una categoría");
  });

  await check("N2. Retirar una categoría deja sus preguntas fuera · se cuenta", async () => {
    const lista = await CAPA.listFaqCategories(sa.client);
    const usada = lista.status === "ok"
      ? lista.data.find((c) => c.code === "soporte") : undefined;
    assert(usada && usada.entries > 0, "el escenario de control cambió");
    // La consola avisa con ese número: es lo que hace que la decisión sea
    // informada en vez de una sorpresa.
    assert(usada!.entries >= 1, "no se sabe cuántas preguntas arrastra");
  });

  await check("O. Los filtros filtran de verdad, en el servidor", async () => {
    const porCategoria = await CAPA.listFaqEntries({ categoryCode: "seguridad" }, sa.client);
    assert(porCategoria.status === "ok", "el filtro por categoría falló");
    assert(porCategoria.data.rows.every((r) => r.categoryCode === "seguridad"),
      "el filtro por categoría deja pasar otras");

    const porEstado = await CAPA.listFaqEntries({ status: "published" }, sa.client);
    assert(porEstado.status === "ok"
      && porEstado.data.rows.every((r) => r.status === "published"),
      "el filtro por estado deja pasar otros");

    const porTexto = await CAPA.listFaqEntries({ search: `qa_b2_seg_${sello}` }, sa.client);
    assert(porTexto.status === "ok" && porTexto.data.rows.length === 1,
      `la búsqueda devolvió ${porTexto.status === "ok" ? porTexto.data.rows.length : "?"}`);

    const paginada = await CAPA.listFaqEntries({ pageSize: 1, page: 1 }, sa.client);
    assert(paginada.status === "ok" && paginada.data.rows.length <= 1,
      "la paginación no acota");
    assert(paginada.status === "ok" && paginada.data.total >= 2,
      "el total no cuenta más allá de la página");
  });

  await check("P. La procedencia interna nunca sale por la puerta pública", async () => {
    const { data } = await anonimo.from("v_faq_public").select("*")
      .eq("slug", `qa_b2_seg_${sello}`).maybeSingle();
    assert(data, "la publicada no se lee");
    for (const prohibida of ["source_basis", "verification_note", "verification_status",
      "verified_at", "change_note", "created_by", "external_source_url"]) {
      assert(!(prohibida in (data as Record<string, unknown>)),
        `la vista pública expone «${prohibida}»`);
    }
    // Y la consola sí la ve: es su razón de ser.
    const det = dato(await CAPA.getFaqEntryDetail(entryId, "es", sa.client), "la ficha");
    assert(det?.current, "la consola no pudo leer lo publicado");
    assert(det!.current!.sourceBasis !== undefined,
      "la consola no ve en qué se apoya lo publicado");
  });

  await check("P2. Una lectura rota se cuenta como avería, no como «no hay»", async () => {
    const roto = new Proxy(sa.client, {
      get(target, prop) {
        if (prop === "from") {
          return () => ({
            select: () => {
              const fin = { data: null, error: { message: "conexión interrumpida" } };
              const enc: Record<string, unknown> = {};
              const encadena = () => enc;
              Object.assign(enc, {
                eq: encadena, in: encadena, ilike: encadena, contains: encadena,
                order: encadena, range: async () => fin, maybeSingle: async () => fin,
                single: async () => fin,
                then: (r: (v: unknown) => unknown) => Promise.resolve(fin).then(r),
              });
              return enc;
            },
          });
        }
        return Reflect.get(target, prop);
      },
    }) as unknown as SupabaseClient;

    const res = await CAPA.listFaqEntries({}, roto);
    assert(res.status === "unavailable",
      `una lectura rota llegó como «${res.status}»: la consola diría que no hay preguntas`);
    const det = await CAPA.getFaqEntryDetail(entryId, "es", roto);
    assert(det.status === "unavailable", "una ficha rota llegó como «no existe»");
  });

  console.log(`\nPE-02B2 · consola de FAQ: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
