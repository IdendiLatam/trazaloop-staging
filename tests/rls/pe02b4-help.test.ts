/**
 * Trazaloop · PE-02B4 · La ayuda contextual, contra base REAL.
 *
 * A–M del encargo, más lo que no se puede comprobar de otra forma: que abrir una
 * pantalla con once botones «i» cueste UNA consulta y no once.
 *
 * Correr: npm run test:pe02b4-help
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
  const email = `pe02b4-${tag}-${sello}@test.trazaloop.dev`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA B4 ${tag}` } });
  assert(!error && data.user, `crear ${tag}: ${error?.message}`);
  const client = createClient(URL!, ANON!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  assert(!e, `login ${tag}: ${e?.message}`);
  return { id: data.user!.id, client: client as unknown as SupabaseClient };
}

/** Cuenta consultas envolviendo `from()`. Es la única forma honesta de afirmar
 *  que una pantalla no hace N+1. */
function contador(cliente: SupabaseClient) {
  const llamadas: string[] = [];
  const proxy = new Proxy(cliente, {
    get(target, prop, receiver) {
      if (prop === "from") {
        const original = Reflect.get(target, prop, receiver) as SupabaseClient["from"];
        return (tabla: string) => {
          llamadas.push(tabla);
          return original.call(target, tabla);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as SupabaseClient;
  return { proxy, llamadas };
}

const PAGINA = "quality.context.interested_parties";

async function main() {
  const CARGA = await import("../../lib/db/contextual-help");
  const PLAT = await import("../../lib/db/help-platform");
  const { helpToHint, helpSectionsToRender } = await import("../../lib/domain/contextual-help");
  const { isKnownPageKey, isWellFormedPageKey, PAGE_KEYS } =
    await import("../../lib/modules/page-keys");

  const dato = <T,>(r: { status: "ok"; data: T } | { status: "unavailable" }, q: string): T => {
    assert(r.status === "ok", `no se pudo leer ${q}`);
    return r.data;
  };
  /** La carga de ayuda devuelve `help`, no `data`: son dos formas distintas
   *  porque una es un mapa de la pantalla y la otra una lista de la consola. */
  const ayuda = (r: Awaited<ReturnType<typeof CARGA.getPageHelp>>, q: string) => {
    assert(r.status === "ok", `no se pudo leer ${q}`);
    return r.help;
  };

  console.log("\nPE-02B4 · La ayuda contextual · base real\n");

  const sa = await persona("sa");
  await admin.from("platform_staff")
    .insert({ user_id: sa.id, role_code: "superadmin", status: "active" });
  const soporte = await persona("support");
  await admin.from("platform_staff")
    .insert({ user_id: soporte.id, role_code: "support", status: "active" });

  // Una empresa en DEMO: es el escenario de la comprobación I.
  const empresa = await persona("empresa-demo");
  const { data: orgId } = await empresa.client.rpc("create_organization",
    { p_name: `QA B4 ${sello}` });
  assert(orgId, "crear empresa");
  await admin.from("organization_modules")
    .update({ enabled: true, access_mode: "demo",
              access_expires_at: new Date(Date.now() + 86400000).toISOString() })
    .eq("organization_id", orgId as string).eq("module_code", "quality");

  // Las suites se ejecutan muchas veces sobre la misma base, y esta retira una
  // ayuda a propósito en la comprobación C. Si una ejecución anterior se cortó
  // entre el retiro y la vuelta, la siguiente empezaría con diez ayudas y no
  // once. Se repara antes de empezar: es barato y hace la suite repetible.
  {
    const semilla = dato(await PLAT.listHelpItems({ pageKey: PAGINA }, sa.client),
      "las ayudas sembradas");
    for (const i of semilla.filter((x) => x.status !== "published")) {
      await PLAT.publishHelpItem(i.id, "restablecida por la suite", "es", sa.client);
    }
  }

  // ==========================================================================
  console.log("A–C · Qué se lee");
  // ==========================================================================

  await check("A. La ayuda publicada llega, con sus tres partes", async () => {
    const r = ayuda(await CARGA.getPageHelp(PAGINA, "es", empresa.client), "la ayuda");
    assert(Object.keys(r).length >= 11, `llegaron ${Object.keys(r).length} ayudas de 11`);
    const overview = r["section:overview"];
    assert(overview, "no llegó la ayuda de la sección principal");
    assert(overview.title.length > 3, "sin título");
    assert(overview.explanation.includes("parte interesada"), "la explicación no es la esperada");
    assert(overview.example && overview.example.length > 10, "sin ejemplo");
    assert(overview.technicalReference?.includes("ISO 9001"), "sin respaldo normativo");
  });

  await check("A2. Y se pinta como Qué es / Ejemplo / Respaldo", async () => {
    const r = ayuda(await CARGA.getPageHelp(PAGINA, "es", empresa.client), "la ayuda");
    const partes = helpSectionsToRender(r["section:overview"]);
    assert(partes.length === 3, `se pintan ${partes.length} bloques`);
    assert(partes[0].label === "Qué es" && partes[1].label === "Ejemplo"
      && partes[2].label === "Respaldo", "los rótulos no son los acordados");

    // Con solo explicación, no se pinta un rótulo que sobra.
    const soloUna = helpSectionsToRender({
      title: "x", explanation: "Una explicación suelta y suficiente.",
      example: null, technicalReference: null });
    assert(soloUna.length === 1 && soloUna[0].label === null,
      "se pinta «Qué es» cuando es lo único que hay");
  });

  await check("B. Un borrador NO reemplaza lo publicado", async () => {
    const items = dato(await PLAT.listHelpItems({ pageKey: PAGINA }, sa.client), "la lista");
    const overview = items.find((i) => i.targetKey === "overview")!;
    const antes = ayuda(await CARGA.getPageHelp(PAGINA, "es", empresa.client), "la ayuda");

    await PLAT.saveHelpDraft({
      helpItemId: overview.id, title: "BORRADOR SIN PUBLICAR",
      explanation: "Texto de borrador que nadie debería leer todavía.",
      example: null, technicalReference: null, doNotInvent: null,
      normativeClass: "safe", changeNote: "prueba",
    }, sa.client);

    const luego = ayuda(await CARGA.getPageHelp(PAGINA, "es", empresa.client), "la ayuda");
    assert(luego["section:overview"].title === antes["section:overview"].title,
      "el borrador reemplazó lo publicado");
    assert(!luego["section:overview"].explanation.includes("borrador"),
      "se filtró el texto del borrador");
  });

  await check("C. Retirar hace que deje de llegar, sin borrar nada", async () => {
    const items = dato(await PLAT.listHelpItems({ pageKey: PAGINA }, sa.client), "la lista");
    const historia = items.find((i) => i.targetKey === "history")!;
    const r = await PLAT.unpublishHelpItem(historia.id, "es", sa.client);
    assert(!r.error, `retirar: ${r.error}`);

    const luego = ayuda(await CARGA.getPageHelp(PAGINA, "es", empresa.client), "la ayuda");
    assert(!luego["section:history"], "una ayuda retirada sigue llegando al producto");

    const detalle = dato(await PLAT.getHelpItemDetail(historia.id, "es", sa.client), "la ficha");
    assert(detalle!.history.length >= 1, "retirar borró la historia");

    // Y se vuelve a publicar sin problema.
    const otra = await PLAT.publishHelpItem(historia.id, "vuelve", "es", sa.client);
    assert(!otra.error, `republicar: ${otra.error}`);
    const final = ayuda(await CARGA.getPageHelp(PAGINA, "es", empresa.client), "la ayuda");
    assert(final["section:history"], "no volvió tras publicarla de nuevo");
  });

  // ==========================================================================
  console.log("\nD–E · Historia");
  // ==========================================================================

  await check("D. Una revisión publicada es inmutable · también con service_role",
    async () => {
      const { data } = await admin.from("help_item_revisions")
        .select("id").is("effective_to", null).limit(1).single();
      const id = (data as { id: string }).id;
      const { error } = await admin.from("help_item_revisions")
        .update({ explanation: "reescrita con la clave de servicio" }).eq("id", id);
      assert(error, "la clave de servicio reescribió una revisión de ayuda");
      const { error: eDel } = await admin.from("help_item_revisions").delete().eq("id", id);
      assert(eDel, "la clave de servicio borró una revisión de ayuda");
    });

  await check("E. Recuperar crea una revisión NUEVA, no reabre la vieja", async () => {
    const items = dato(await PLAT.listHelpItems({ pageKey: PAGINA }, sa.client), "la lista");
    const overview = items.find((i) => i.targetKey === "overview")!;

    // Se publica el borrador de la comprobación B, para que haya dos versiones.
    const pub = await PLAT.publishHelpItem(overview.id, "segunda", "es", sa.client);
    assert(!pub.error, `publicar: ${pub.error}`);
    const det = dato(await PLAT.getHelpItemDetail(overview.id, "es", sa.client), "la ficha");
    assert(det!.history.length >= 1, "no quedó historia");

    const primera = det!.history[det!.history.length - 1];
    const antes = det!.history.length;
    const r = await PLAT.restoreHelpRevision(primera.id, sa.client);
    assert(!r.error, `recuperar: ${r.error}`);

    const luego = dato(await PLAT.getHelpItemDetail(overview.id, "es", sa.client), "la ficha");
    assert(luego!.history.length === antes, "recuperar tocó la historia");
    assert(luego!.draft!.explanation === primera.explanation,
      "el borrador no recibió el texto antiguo");

    await PLAT.publishHelpItem(overview.id, "vuelve la primera", "es", sa.client);
    const final = dato(await PLAT.getHelpItemDetail(overview.id, "es", sa.client), "la ficha");
    assert(final!.current!.revisionNumber === luego!.current!.revisionNumber + 1,
      "publicar lo recuperado no creó una versión nueva");
    assert(final!.current!.explanation === primera.explanation,
      "la vigente no lleva el texto recuperado");
  });

  // ==========================================================================
  console.log("\nF–H · Quién administra");
  // ==========================================================================

  await check("F. Un administrador de empresa no ve ni toca la ayuda global",
    async () => {
      const lista = await PLAT.listHelpItems({}, empresa.client);
      assert(lista.status === "ok" && lista.data.length === 0,
        "una empresa ve el catálogo de ayuda de la plataforma");
      const crear = await PLAT.createHelpItem({
        moduleKey: "quality", pageKey: PAGINA, targetKind: "field",
        targetKey: `intruso_${sello}`, title: "Intruso",
        explanation: "No debería poder crearse desde una empresa.",
      }, empresa.client);
      assert(crear.error !== null, "una empresa creó una ayuda global");
    });

  await check("G. Soporte lee y NO escribe", async () => {
    const lista = await PLAT.listHelpItems({}, soporte.client);
    assert(lista.status === "ok" && lista.data.length >= 11,
      "soporte no ve el catálogo de ayuda");
    const crear = await PLAT.createHelpItem({
      moduleKey: "quality", pageKey: PAGINA, targetKind: "field",
      targetKey: `soporte_${sello}`, title: "Soporte",
      explanation: "Soporte no debería poder crear ayuda.",
    }, soporte.client);
    assert(crear.error !== null, "soporte creó una ayuda");
    const items = dato(await PLAT.listHelpItems({ pageKey: PAGINA }, sa.client), "la lista");
    const pub = await PLAT.publishHelpItem(items[0].id, null, "es", soporte.client);
    assert(pub.error !== null, "soporte publicó una ayuda");
  });

  await check("H. El superadministrador crea, edita y publica", async () => {
    const creada = await PLAT.createHelpItem({
      moduleKey: "quality", pageKey: "quality.processes", targetKind: "field",
      targetKey: `qa_${sello}`, title: "Ayuda de prueba",
      explanation: "Una explicación de prueba suficientemente larga.",
    }, sa.client);
    assert(!creada.error && creada.id, `crear: ${creada.error}`);

    const det = dato(await PLAT.getHelpItemDetail(creada.id!, "es", sa.client), "la ficha");
    assert(det!.item.status === "draft", `nació en «${det!.item.status}»`);
    assert(det!.current === null, "nació publicada");

    const pub = await PLAT.publishHelpItem(creada.id!, "alta", "es", sa.client);
    assert(!pub.error, `publicar: ${pub.error}`);
    const luego = ayuda(await CARGA.getPageHelp("quality.processes", "es", sa.client), "la ayuda");
    assert(luego[`field:qa_${sello}`], "lo publicado no llega al producto");
  });

  // ==========================================================================
  console.log("\nI–J · Planes");
  // ==========================================================================

  await check("I. En DEMO se ve la ayuda igual · decisión congelada", async () => {
    // La empresa está en prueba de Quality. La ayuda NO se filtra por plan: si
    // se puede ver la pantalla, se puede ver la explicación.
    const { data: modo } = await admin.from("organization_modules")
      .select("access_mode").eq("organization_id", orgId as string)
      .eq("module_code", "quality").single();
    assert((modo as { access_mode: string }).access_mode === "demo",
      "el escenario de control cambió");

    const r = ayuda(await CARGA.getPageHelp(PAGINA, "es", empresa.client), "la ayuda");
    assert(Object.keys(r).length >= 10,
      `en Demo llegan ${Object.keys(r).length} ayudas: se está filtrando por plan`);
    assert(r["section:overview"].explanation.length > 50,
      "en Demo llega un aviso en vez del texto");
    assert(!/Full y Extra|no están disponibles en la versión Demo/
      .test(r["section:overview"].explanation),
      "la ayuda contextual heredó la puerta comercial de la guía de TrazaDocs");
  });

  await check("J. Y el derecho al módulo lo sigue defendiendo la pantalla", async () => {
    // La ayuda no autoriza nada: es catálogo del producto. Quien no pueda entrar
    // a Quality no llega a la pantalla, y eso lo decide su guardián.
    const fuente = (await import("node:fs")).readFileSync("lib/db/contextual-help.ts", "utf8");
    assert(!/organization|access_mode|module_access/.test(fuente),
      "la carga de ayuda mira el acceso comercial, y no le corresponde");
    const guardia = (await import("node:fs"))
      .readFileSync("app/(app)/(shell)/quality/context/interested-parties/page.tsx", "utf8");
    assert(/requireQualityModule/.test(guardia),
      "la pantalla dejó de exigir el módulo");
  });

  // ==========================================================================
  console.log("\nK–M · Fallos y afirmaciones");
  // ==========================================================================

  await check("K. Una avería NO se lee como «no hay ayuda configurada»", async () => {
    const roto = new Proxy(empresa.client, {
      get(target, prop) {
        if (prop === "from") {
          return () => {
            const fin = { data: null, error: { message: "conexión interrumpida" } };
            const enc: Record<string, unknown> = {};
            const sigue = () => enc;
            Object.assign(enc, {
              select: sigue, eq: sigue, in: sigue,
              then: (r: (v: unknown) => unknown) => Promise.resolve(fin).then(r),
            });
            return enc;
          };
        }
        return Reflect.get(target, prop);
      },
    }) as unknown as SupabaseClient;

    const r = await CARGA.getPageHelp(PAGINA, "es", roto);
    assert(r.status === "unavailable", `una lectura rota llegó como «${r.status}»`);
    // Y la pantalla no se rompe: el hint se resuelve a nulo y el botón no se pinta.
    assert(helpToHint(null) === null, "una ayuda ausente produce un panel vacío");
  });

  await check("L. Sin cliente administrativo en ningún camino", async () => {
    const fs = await import("node:fs");
    for (const f of ["lib/db/contextual-help.ts", "lib/db/help-platform.ts",
      "server/actions/help-admin.ts"]) {
      const src = fs.readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      assert(!/createAdminClient|service_role/i.test(src),
        `${f} usa el cliente administrativo`);
    }
  });

  await check("M. El respaldo normativo es referencia, no cumplimiento", async () => {
    const r = ayuda(await CARGA.getPageHelp(PAGINA, "es", empresa.client), "la ayuda");
    for (const [clave, contenido] of Object.entries(r)) {
      const texto = `${contenido.explanation} ${contenido.example ?? ""} `
        + `${contenido.technicalReference ?? ""}`;
      assert(!/garantiza el cumplimiento|garantiza la conformidad|queda certificad|estás? certificad/i
        .test(texto), `«${clave}» afirma cumplimiento`);
    }
    // Y las que citan norma están clasificadas como referencia.
    const { data } = await sa.client.from("help_item_revisions")
      .select("normative_class, technical_reference").is("effective_to", null);
    for (const rev of (data ?? []) as Record<string, unknown>[]) {
      const ref = (rev.technical_reference as string | null) ?? "";
      if (/ISO \d/.test(ref)) {
        assert(rev.normative_class === "normative_reference",
          `una ayuda cita una norma y está clasificada «${rev.normative_class}»`);
      }
    }
  });

  // ==========================================================================
  console.log("\nN–S · Las claves");
  // ==========================================================================

  await check("N. Las claves de pantalla salen del registro", async () => {
    const { data } = await sa.client.from("help_items").select("page_key");
    const usadas = new Set((data ?? []).map((r) => String((r as { page_key: string }).page_key)));
    for (const k of usadas) {
      assert(isWellFormedPageKey(k), `«${k}» no tiene la forma de una clave de pantalla`);
      assert(isKnownPageKey(k), `«${k}» no está en el registro de pantallas`);
    }
    assert(PAGE_KEYS.length >= 5, `el registro solo tiene ${PAGE_KEYS.length} pantallas`);
  });

  await check("O. Una clave desconocida falla sin romper nada", async () => {
    const r = ayuda(await CARGA.getPageHelp("quality.pantalla_que_no_existe",
      "es", empresa.client), "la ayuda");
    assert(Object.keys(r).length === 0, "una pantalla inexistente devolvió ayudas");
    // Y una mal formada se rechaza antes de llegar a la base.
    assert(!isWellFormedPageKey("QualityProcesses"), "se admite una clave mal formada");
    assert(!isWellFormedPageKey("otromodulo.pantalla"),
      "se admite una clave de un módulo que no existe");
  });

  await check("P. La identidad no depende de la URL", async () => {
    // La ruta es informativa. Se comprueba que la tabla no la guarda.
    const { data } = await sa.client.from("help_items").select("*").limit(1).single();
    const columnas = Object.keys(data as Record<string, unknown>);
    for (const prohibida of ["route", "url", "path", "href"]) {
      assert(!columnas.includes(prohibida),
        `la identidad de la ayuda guarda «${prohibida}»`);
    }
  });

  await check("Q. No hay dos ayudas para el mismo elemento", async () => {
    const items = dato(await PLAT.listHelpItems({}, sa.client), "la lista");
    const vistas = new Set<string>();
    for (const i of items) {
      const k = `${i.pageKey}|${i.targetKind}|${i.targetKey}`;
      assert(!vistas.has(k), `hay dos ayudas para ${k}`);
      vistas.add(k);
    }
    // Y la base lo impide.
    const uno = items[0];
    const { error } = await sa.client.from("help_items").insert({
      module_key: uno.moduleKey, page_key: uno.pageKey,
      target_kind: uno.targetKind, target_key: uno.targetKey,
    });
    assert(error, "se pudo crear una segunda ayuda para el mismo elemento");
  });

  await check("R. Las claves de módulo son las canónicas", async () => {
    const { COMMERCIAL_MODULES } = await import("../../lib/modules/catalog");
    const canonicas = new Set([...COMMERCIAL_MODULES.map((m) => m.key), "platform"]);
    const { data } = await sa.client.from("help_items").select("module_key, page_key");
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      assert(canonicas.has(String(r.module_key)),
        `«${r.module_key}» no es una clave canónica de módulo`);
      assert(String(r.page_key).split(".")[0] === String(r.module_key),
        "la clave de pantalla y el módulo no coinciden");
    }
  });

  await check("S. PE-03 podrá reutilizar estas claves sin un segundo registro",
    async () => {
      const fs = await import("node:fs");
      const registro = fs.readFileSync("lib/modules/page-keys.ts", "utf8");
      assert(/PE-03/.test(registro), "el registro no declara que es también de los tutoriales");
      // Y el registro NO vive dentro de la ayuda: es del producto.
      assert(!registro.includes("help_items"),
        "el registro de pantallas depende de las tablas de la ayuda");
      const archivos = fs.readdirSync("lib/modules");
      assert(archivos.includes("page-keys.ts"), "el registro no está donde debería");
    });

  // ==========================================================================
  console.log("\nT · Que no crezca con los botones");
  // ==========================================================================

  await check("T. Una pantalla con once «i» cuesta UNA consulta", async () => {
    const { proxy, llamadas } = contador(empresa.client);
    const r = ayuda(await CARGA.getPageHelp(PAGINA, "es", proxy), "la ayuda");
    assert(Object.keys(r).length >= 10,
      `la pantalla tiene ${Object.keys(r).length} ayudas`);
    assert(llamadas.length === 1,
      `${Object.keys(r).length} ayudas costaron ${llamadas.length} consultas`);
    assert(llamadas[0] === "v_help_effective",
      `se consultó ${llamadas[0]} en vez de la vista`);
  });

  await check("T2. Y una con dos también cuesta una", async () => {
    const { proxy, llamadas } = contador(empresa.client);
    await CARGA.getPageHelp("quality.processes", "es", proxy);
    assert(llamadas.length === 1, `costó ${llamadas.length} consultas`);
  });

  await check("T3. Varias pantallas de una vez, también una", async () => {
    const { proxy, llamadas } = contador(empresa.client);
    const r = await CARGA.getHelpForPages([PAGINA, "quality.processes"], "es", proxy);
    assert(r.status === "ok", "no se pudo leer");
    assert(llamadas.length === 1, `dos pantallas costaron ${llamadas.length} consultas`);
    assert(Object.keys(r.byPage ?? {}).length === 2, "no se separan por pantalla");
  });

  // ==========================================================================
  console.log("\nU · Lo que no sale");
  // ==========================================================================

  await check("U. El producto no recibe gobierno editorial", async () => {
    const { data } = await empresa.client.from("v_help_effective").select("*").limit(1).single();
    const columnas = Object.keys(data as Record<string, unknown>);
    for (const prohibida of ["do_not_invent", "normative_class", "created_by",
      "change_note", "revision_number", "effective_to", "content_hash"]) {
      assert(!columnas.includes(prohibida), `la vista del producto expone «${prohibida}»`);
    }
  });

  await check("U2. Y el anónimo no la alcanza", async () => {
    const { data, error } = await anonimo.from("v_help_effective").select("title");
    assert(error || !data || data.length === 0,
      "el visitante sin sesión lee la ayuda del producto");
    for (const t of ["help_items", "help_item_revisions", "help_item_drafts"]) {
      const { data: d, error: e } = await anonimo.from(t).select("id");
      assert(e || !d || d.length === 0, `el anónimo pudo consultar ${t}`);
    }
  });

  await check("U3. Un miembro sin plataforma no alcanza las tablas", async () => {
    for (const t of ["help_items", "help_item_revisions", "help_item_drafts"]) {
      const { data, error } = await empresa.client.from(t).select("id");
      assert(error || !data || data.length === 0,
        `un miembro pudo consultar ${t} directamente`);
    }
    // Pero sí la vista, que es su puerta.
    const { data } = await empresa.client.from("v_help_effective").select("title").limit(1);
    assert(data && data.length === 1, "un miembro no puede leer la ayuda del producto");
  });

  console.log(`\nPE-02B4 · ayuda: ${passed} en verde, ${failed} en rojo\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
