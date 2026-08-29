/**
 * Trazaloop · QUALITY-12.3B2 · La capa de aplicación, contra base REAL.
 *
 * Esta suite importa `lib/db/quality-interested-parties` y le pasa el cliente
 * de un usuario real. No reimplementa las consultas: reimplementarlas habría
 * probado una copia, y la copia siempre acaba siendo más amable que el
 * original.
 *
 * Lo que se demuestra aquí no se puede demostrar leyendo el código: que las
 * validaciones del dominio y los CHECK de la base dicen lo mismo, que las
 * listas paginan de verdad, que la búsqueda por nombre encuentra a través de
 * dos tablas, y que un fallo de PostgreSQL llega traducido a la pantalla.
 *
 * Correr: npm run test:quality123b2-domain-rls
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

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const password = "Trazaloop-Test-1234";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (o: number) => iso(new Date(Date.now() + o * 86_400_000));

async function nuevoUsuario(tag: string) {
  const email = `q123b2-${tag}-${stamp}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${tag}` } });
  assert(data.user, `usuario ${tag}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${tag}: ${error?.message}`);
  return { cli, id: data.user.id };
}

async function main() {
  const IP = await import("../../lib/db/quality-interested-parties");

  console.log("\nQUALITY-12.3B2 · Capa de aplicación · base real\n");

  const a = await nuevoUsuario("a");
  const { data: orgAId } = await a.cli.rpc("create_organization", { p_name: `Q123B2 A ${stamp}` });
  const orgA = orgAId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");

  const b = await nuevoUsuario("b");
  const { data: orgBId } = await b.cli.rpc("create_organization", { p_name: `Q123B2 B ${stamp}` });
  const orgB = orgBId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgB).eq("module_code", "quality");

  // =========================================================================
  await check("U. Los catálogos se siembran y se leen por la capa de aplicación", async () => {
    const sem = await IP.seedCategories(orgA, a.cli);
    assert(sem.ok && sem.data === 15, `la siembra debía dar 15, dio ${JSON.stringify(sem)}`);
    const cats = await IP.listCategories(orgA, {}, a.cli);
    assert(cats.length === 15, `esperaba 15 categorías, hay ${cats.length}`);
    // Ordenadas por `sort_order`: la lista tiene un orden pensado, no el que
    // devuelva el planificador.
    const orden = cats.map((c) => c.sortOrder);
    assert(orden.every((v, i) => i === 0 || orden[i - 1] <= v), "las categorías salieron desordenadas");
    const segunda = await IP.seedCategories(orgA, a.cli);
    assert(segunda.ok && segunda.data === 0, "la segunda siembra debía ser 0");
  });

  const cats = await IP.listCategories(orgA, {}, a.cli);
  const catCli = cats.find((c) => c.code === "customers")!;
  const catTrab = cats.find((c) => c.code === "workers")!;

  const { data: parte } = await a.cli.from("quality_external_parties")
    .insert({ organization_id: orgA, legal_name: `Distribuidora Andina SAS ${stamp}`,
              trade_name: `Andina ${stamp}` }).select("id").single();
  const grupo = await IP.createGroup(orgA, { code: "workers", name: "Personal de planta" }, a.cli);
  assert(grupo.ok, "no se pudo crear el colectivo");

  let analisis = "";
  await check("V. Un análisis de entidad externa nace vigente y con su etiqueta", async () => {
    const res = await IP.createAssessment(orgA, {
      categoryId: catCli.id, subjectKind: "external_party", subjectId: parte!.id,
      relevanceStatus: "relevant", priorityLabel: "high",
      priorityScore: 9, priorityMethodNote: "influencia 3 × impacto 3",
      summary: "Cliente principal del canal institucional.",
    }, a.cli);
    assert(res.ok, `crear análisis: ${res.ok ? "" : res.message}`);
    analisis = res.data;
    const fila = await IP.getAssessment(orgA, analisis, a.cli);
    assert(fila, "el análisis no se pudo releer");
    // La etiqueta sale del nombre COMERCIAL cuando lo hay: es como se conoce
    // a esa parte dentro de la empresa.
    assert(fila!.subjectLabel.startsWith("Andina"), `etiqueta inesperada: ${fila!.subjectLabel}`);
    assert(fila!.effectiveTo === null, "debía nacer vigente");
    assert(fila!.categoryName !== null, "la categoría debía venir resuelta");
  });

  await check("W. Declarar no pertinente SIN justificación se rechaza antes de la base", async () => {
    const res = await IP.createAssessment(orgA, {
      categoryId: catTrab.id, subjectKind: "group", subjectId: grupo.ok ? grupo.data : "",
      relevanceStatus: "not_relevant",
    }, a.cli);
    assert(!res.ok && res.code === "relevance_reason_required",
      `esperaba relevance_reason_required, dio ${JSON.stringify(res)}`);
  });

  await check("X. Una puntuación sin metodología no se acepta", async () => {
    const res = await IP.createAssessment(orgA, {
      categoryId: catTrab.id, subjectKind: "group", subjectId: grupo.ok ? grupo.data : "",
      relevanceStatus: "relevant", priorityScore: 7,
    }, a.cli);
    assert(!res.ok && res.code === "score_needs_method",
      `esperaba score_needs_method, dio ${JSON.stringify(res)}`);
  });

  await check("Y. Dos análisis vigentes de la misma parte: la base lo impide y llega traducido", async () => {
    const res = await IP.createAssessment(orgA, {
      categoryId: catCli.id, subjectKind: "external_party", subjectId: parte!.id,
      relevanceStatus: "relevant",
    }, a.cli);
    assert(!res.ok, "se pudo crear un segundo análisis vigente");
    assert(res.code === "duplicate_current",
      `esperaba duplicate_current, dio ${res.code}`);
    assert(!/duplicate key|constraint|violates/i.test(res.message),
      `el mensaje filtra SQL: ${res.message}`);
  });

  let necesidad = "", requisito = "";
  await check("Z. Necesidad, expectativa y requisito son entradas distintas", async () => {
    const n = await IP.createRequirement(orgA, {
      assessmentId: analisis, entryKind: "need",
      title: "Entregas en menos de 48 horas",
    }, a.cli);
    assert(n.ok, `necesidad: ${n.ok ? "" : n.message}`);
    necesidad = n.data;

    const malo = await IP.createRequirement(orgA, {
      assessmentId: analisis, entryKind: "requirement",
      title: "Sin tipo", requirementKind: null,
    }, a.cli);
    assert(!malo.ok && malo.code === "requirement_subtype_required",
      `un requisito sin tipo debía rechazarse, dio ${JSON.stringify(malo)}`);

    const mal2 = await IP.createRequirement(orgA, {
      assessmentId: analisis, entryKind: "expectation",
      title: "Con tipo de más", requirementKind: "legal",
    }, a.cli);
    assert(!mal2.ok && mal2.code === "requirement_subtype_not_allowed",
      `una expectativa con subtipo debía rechazarse, dio ${JSON.stringify(mal2)}`);

    const r = await IP.createRequirement(orgA, {
      assessmentId: analisis, entryKind: "requirement", requirementKind: "contractual",
      title: "SLA de entrega de 48 horas",
    }, a.cli);
    assert(r.ok, `requisito: ${r.ok ? "" : r.message}`);
    requisito = r.data;
  });

  await check("AA. Convertir crea una fila nueva y NO reetiqueta la de origen", async () => {
    const sinRazon = await IP.convertToRequirement(orgA, {
      originId: necesidad, requirementKind: "contractual", rationale: "  ",
    }, a.cli);
    assert(!sinRazon.ok && sinRazon.code === "conversion_reason_required",
      "convertir sin razón debía rechazarse");

    const res = await IP.convertToRequirement(orgA, {
      originId: necesidad, requirementKind: "contractual",
      rationale: "Quedó firmado en el contrato marco de agosto.",
    }, a.cli);
    assert(res.ok, `convertir: ${res.ok ? "" : res.message}`);

    const todos = await IP.listRequirements(orgA, analisis, {}, a.cli);
    const origen = todos.find((r) => r.id === necesidad);
    assert(origen, "la entrada de origen desapareció");
    assert(origen!.entryKind === "need", "la entrada de origen fue reetiquetada");
    const nuevo = todos.find((r) => r.id === res.data);
    assert(nuevo && nuevo.derivedFromId === necesidad,
      "el requisito nuevo no apunta a la necesidad de la que salió");

    // Y de un requisito no se deriva otro requisito.
    const otra = await IP.convertToRequirement(orgA, {
      originId: requisito, requirementKind: "legal", rationale: "cualquiera",
    }, a.cli);
    assert(!otra.ok && otra.code === "conversion_origin_invalid",
      `esperaba conversion_origin_invalid, dio ${JSON.stringify(otra)}`);
  });

  const { data: proceso } = await a.cli.from("quality_processes")
    .insert({ organization_id: orgA, code: `P-${stamp}`.slice(0, 20), name: "Despacho", category_code: "core" })
    .select("id").single();
  const { data: procesoB } = await b.cli.from("quality_processes")
    .insert({ organization_id: orgB, code: `PB-${stamp}`.slice(0, 20), name: "Ajeno", category_code: "core" })
    .select("id").single();

  let vinculoProceso = "";
  await check("AB. Requisito → proceso: se vincula, y no a un proceso de otra empresa", async () => {
    const res = await IP.attachRequirementToProcess(orgA, {
      requirementId: requisito, processId: proceso!.id, linkKind: "addressed_by",
    }, a.cli);
    assert(res.ok, `vincular: ${res.ok ? "" : res.message}`);
    vinculoProceso = res.data;

    const ajeno = await IP.attachRequirementToProcess(orgA, {
      requirementId: requisito, processId: procesoB!.id,
    }, a.cli);
    assert(!ajeno.ok, "se pudo vincular un proceso de otra empresa");

    const links = await IP.listRequirementProcesses(orgA, [requisito], {}, a.cli);
    assert(links.length === 1, `esperaba 1 vínculo, hay ${links.length}`);
    assert(links[0].processName === "Despacho", "el nombre del proceso no vino resuelto");
  });

  await check("AC. Desvincular CIERRA la vigencia; no borra", async () => {
    const res = await IP.detachRequirementFromProcess(orgA, vinculoProceso, null, a.cli);
    assert(res.ok, `desvincular: ${res.ok ? "" : res.message}`);
    const vigentes = await IP.listRequirementProcesses(orgA, [requisito], {}, a.cli);
    assert(vigentes.length === 0, "el vínculo cerrado seguía saliendo como vigente");
    const todos = await IP.listRequirementProcesses(orgA, [requisito], { includeEnded: true }, a.cli);
    assert(todos.length === 1, "el vínculo cerrado desapareció del histórico");
    assert(todos[0].effectiveTo !== null, "el vínculo cerrado no tiene fecha de cierre");
    // Cerrar dos veces no es cerrar más: la segunda no encuentra nada abierto.
    const otra = await IP.detachRequirementFromProcess(orgA, vinculoProceso, null, a.cli);
    assert(!otra.ok && otra.code === "historical_record_immutable",
      `cerrar lo ya cerrado debía rechazarse, dio ${JSON.stringify(otra)}`);
  });

  let estrategia = "";
  await check("AD. Una estrategia atiende requisitos de SU análisis y de ningún otro", async () => {
    const res = await IP.createStrategy(orgA, {
      assessmentId: analisis, title: "Plan de servicio al canal institucional",
      purpose: "Sostener el SLA de 48 horas",
      monitoringMethod: "indicator", reviewCadenceMonths: 6,
      nextReviewOn: dia(180), status: "active",
      requirementIds: [requisito],
    }, a.cli);
    assert(res.ok, `crear estrategia: ${res.ok ? "" : res.message}`);
    estrategia = res.data;

    const lista = await IP.listStrategies(orgA, analisis, {}, a.cli);
    assert(lista.length === 1, `esperaba 1 estrategia, hay ${lista.length}`);
    assert(lista[0].requirementIds.includes(requisito), "el requisito vinculado no aparece");
    assert(lista[0].reviewState === "up_to_date",
      `estado de revisión inesperado: ${lista[0].reviewState}`);

    // Un requisito de OTRO análisis: lo para el guardián de 0149.
    const otroAnalisis = await IP.createAssessment(orgA, {
      categoryId: catTrab.id, subjectKind: "group",
      subjectId: grupo.ok ? grupo.data : "", relevanceStatus: "relevant",
    }, a.cli);
    assert(otroAnalisis.ok, "no se pudo crear el segundo análisis");
    const otroReq = await IP.createRequirement(orgA, {
      assessmentId: otroAnalisis.data, entryKind: "requirement",
      requirementKind: "legal", title: "Dotación de seguridad",
    }, a.cli);
    assert(otroReq.ok, "no se pudo crear el requisito del otro análisis");
    const cruce = await IP.attachStrategyRequirement(orgA, {
      strategyId: estrategia, requirementId: otroReq.ok ? otroReq.data : "",
    }, a.cli);
    assert(!cruce.ok && cruce.code === "strategy_requirement_mismatch",
      `esperaba strategy_requirement_mismatch, dio ${JSON.stringify(cruce)}`);
  });

  await check("AE. La revisión que concluye «sin cambios» TAMBIÉN se registra", async () => {
    const res = await IP.recordReview(orgA, {
      strategyId: estrategia, verdict: "no_changes",
      note: "Revisada en comité; el SLA se sostiene.",
      nextReviewOn: dia(200),
    }, a.cli);
    assert(res.ok, `registrar revisión: ${res.ok ? "" : res.message}`);

    const revisiones = await IP.listReviews(orgA, { strategyId: estrategia }, a.cli);
    assert(revisiones.length === 1, `esperaba 1 revisión, hay ${revisiones.length}`);

    // Y la estrategia queda marcada como revisada: es la diferencia entre
    // «nadie la ha mirado» y «se miró y no había que cambiar nada».
    const [est] = await IP.listStrategies(orgA, analisis, {}, a.cli);
    assert(est.lastReviewedOn !== null, "la estrategia no quedó marcada como revisada");

    const sinDestino = await IP.recordReview(orgA, { verdict: "no_changes" }, a.cli);
    assert(!sinDestino.ok && sinDestino.code === "review_target_required",
      "una revisión sin destino debía rechazarse");
  });

  await check("AF. El listado pagina en SERVIDOR y cuenta el total real", async () => {
    // Doce partes más, para que haya más de una página de tamaño 5.
    for (let i = 0; i < 12; i += 1) {
      const { data: p } = await a.cli.from("quality_external_parties")
        .insert({ organization_id: orgA, legal_name: `Proveedor ${String(i).padStart(2, "0")} ${stamp}` })
        .select("id").single();
      await IP.createAssessment(orgA, {
        categoryId: catCli.id, subjectKind: "external_party", subjectId: p!.id,
        relevanceStatus: "relevant",
      }, a.cli);
    }
    const pag = await IP.searchAssessments(orgA, { page: "1", pageSize: 5 }, a.cli);
    assert(pag.rows.length === 5, `una página debía traer 5 filas, trajo ${pag.rows.length}`);
    assert(pag.total >= 14, `el total debía ser el del conjunto completo, dio ${pag.total}`);
    const pag3 = await IP.searchAssessments(orgA, { page: "3", pageSize: 5 }, a.cli);
    assert(pag3.rows.length > 0, "la tercera página vino vacía");
    const ids = new Set([...pag.rows, ...pag3.rows].map((r) => r.id));
    assert(ids.size === pag.rows.length + pag3.rows.length, "hay filas repetidas entre páginas");
  });

  await check("AG. La búsqueda encuentra por nombre a través de las dos tablas de sujetos", async () => {
    const porComercial = await IP.searchAssessments(orgA, { q: "Andina" }, a.cli);
    assert(porComercial.total >= 1, "no encontró por nombre comercial");
    assert(porComercial.rows.every((r) => /Andina/i.test(r.subjectLabel)),
      "la búsqueda devolvió filas que no casan");
    const porColectivo = await IP.searchAssessments(orgA, { q: "Personal de planta" }, a.cli);
    assert(porColectivo.total >= 1, "no encontró por nombre de colectivo");
    const nada = await IP.searchAssessments(orgA, { q: `inexistente-${stamp}` }, a.cli);
    assert(nada.total === 0 && nada.rows.length === 0,
      "una búsqueda sin resultados debía devolver cero, no la lista entera");
  });

  await check("AH. El resumen cuenta sin descargar la tabla", async () => {
    const r = await IP.getSummary(orgA, undefined, a.cli);
    assert(r.current >= 14, `análisis vigentes: ${r.current}`);
    assert(r.relevant >= 14, `pertinentes: ${r.relevant}`);
    assert(r.requirements >= 2, `requisitos: ${r.requirements}`);
    assert(r.strategiesActive === 1, `estrategias activas: ${r.strategiesActive}`);
    assert(r.strategiesOverdue === 0, `no debía haber vencidas, hay ${r.strategiesOverdue}`);
  });

  await check("AI. La empresa B no ve NADA de A, ni pasando identificadores conocidos", async () => {
    const pag = await IP.searchAssessments(orgA, {}, b.cli);
    assert(pag.total === 0 && pag.rows.length === 0, "B leyó los análisis de A");
    const detalle = await IP.getAssessment(orgA, analisis, b.cli);
    assert(detalle === null, "B leyó un análisis de A por su identificador");
    const reqs = await IP.listRequirements(orgA, analisis, {}, b.cli);
    assert(reqs.length === 0, "B leyó los requisitos de A");
    const esc = await IP.createRequirement(orgA, {
      assessmentId: analisis, entryKind: "need", title: "Escrito desde fuera",
    }, b.cli);
    assert(!esc.ok, "B pudo escribir en A");
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
