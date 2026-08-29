/**
 * Trazaloop · QUALITY-12.3B2 · La historia, contra base REAL.
 *
 * Todo lo de aquí responde a una sola pregunta: ¿qué decíamos entonces?
 *
 * Es la pregunta que hace una auditoría, y la que un sistema con vigencias mal
 * puestas contesta con la verdad de hoy y cara de certeza. Se prueban las tres
 * formas de fallarla:
 *
 *   · reescribir el pasado (que aquí es imposible por disparador);
 *   · devolver la foto de hoy cuando se pregunta por marzo;
 *   · devolver mil filas de mil doscientas y llamarlo el conjunto completo.
 *
 * Correr: npm run test:quality123b2-history
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
  const email = `q123b2h-${tag}-${stamp}@test.trazaloop.dev`;
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

  console.log("\nQUALITY-12.3B2 · Historia y vigencias · base real\n");

  const a = await nuevoUsuario("a");
  const { data: orgAId } = await a.cli.rpc("create_organization", { p_name: `Q123B2H A ${stamp}` });
  const orgA = orgAId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");

  await IP.seedCategories(orgA, a.cli);
  const cats = await IP.listCategories(orgA, {}, a.cli);
  const catCli = cats.find((c) => c.code === "customers")!;

  const { data: parte } = await a.cli.from("quality_external_parties")
    .insert({ organization_id: orgA, legal_name: `Cliente Histórico ${stamp}`,
              trade_name: `Histórica ${stamp}` }).select("id").single();

  // La línea de tiempo: hace 90 días la parte era pertinente y de prioridad
  // alta; hace 30 dejó de serlo. Preguntar por el día 60 tiene que devolver la
  // primera lectura, no la de hoy.
  const v1 = await IP.createAssessment(orgA, {
    categoryId: catCli.id, subjectKind: "external_party", subjectId: parte!.id,
    assessedOn: dia(-90), effectiveFrom: dia(-90),
    relevanceStatus: "relevant", priorityLabel: "high",
    summary: "Primera lectura: cliente estratégico.",
  }, a.cli);
  assert(v1.ok, `v1: ${v1.ok ? "" : v1.message}`);

  const req1 = await IP.createRequirement(orgA, {
    assessmentId: v1.data, entryKind: "requirement", requirementKind: "contractual",
    title: "Entrega en 48 horas",
  }, a.cli);
  assert(req1.ok, "no se pudo crear el requisito de la primera lectura");
  await a.cli.from("quality_stakeholder_requirements")
    .update({ effective_from: dia(-90) }).eq("id", req1.data);

  const v2 = await IP.supersedeAssessment(orgA, {
    assessmentId: v1.data, relevanceStatus: "not_relevant",
    relevanceRationale: "Cerró su operación en el país.",
    summary: "Segunda lectura: sin operación.",
    effectiveFrom: dia(-30),
  }, a.cli);
  assert(v2.ok, `v2: ${v2.ok ? "" : v2.message}`);

  // =========================================================================
  await check("AV. El análisis anterior se conserva ENTERO y con su vigencia cerrada", async () => {
    const viejo = await IP.getAssessment(orgA, v1.data, a.cli);
    assert(viejo, "el análisis anterior desapareció");
    assert(viejo!.relevanceStatus === "relevant", "le cambiaron la pertinencia al pasado");
    assert(viejo!.summary?.includes("Primera lectura"), "le reescribieron el resumen");
    assert(viejo!.effectiveTo === dia(-30), `cierre inesperado: ${viejo!.effectiveTo}`);
    const nuevo = await IP.getAssessment(orgA, v2.data, a.cli);
    assert(nuevo!.supersedesId === v1.data, "el sucesor no apunta a su predecesor");
    assert(nuevo!.effectiveTo === null, "el sucesor no está vigente");
  });

  await check("AW. Un análisis ya sucedido NO se puede reescribir", async () => {
    const { data, error } = await a.cli.from("quality_stakeholder_assessments")
      .update({ summary: "Reescrito a posteriori" }).eq("id", v1.data).select("id");
    const bloqueado = Boolean(error) || (data ?? []).length === 0;
    assert(bloqueado, "se pudo reescribir un análisis histórico");
    const sigue = await IP.getAssessment(orgA, v1.data, a.cli);
    assert(sigue!.summary?.includes("Primera lectura"), "el histórico cambió");
  });

  await check("AX. Un análisis no se borra", async () => {
    const { data } = await a.cli.from("quality_stakeholder_assessments")
      .delete().eq("id", v1.data).select("id");
    assert((data ?? []).length === 0, "se pudo borrar un análisis");
  });

  await check("AY. as_of devuelve lo que regía ESE día, en todas las capas", async () => {
    const enMarzo = await IP.searchAssessments(orgA, { asOf: dia(-60) }, a.cli);
    const fila = enMarzo.rows.find((r) => r.subjectLabel.startsWith("Histórica"));
    assert(fila, "la parte no aparecía como vigente hace 60 días");
    assert(fila!.id === v1.data, "as_of devolvió el análisis equivocado");
    assert(fila!.relevanceStatus === "relevant", "as_of devolvió la pertinencia de hoy");

    const hoy = await IP.searchAssessments(orgA, {}, a.cli);
    const ahora = hoy.rows.find((r) => r.subjectLabel.startsWith("Histórica"));
    assert(ahora!.id === v2.data, "hoy debía verse la segunda lectura");
    assert(ahora!.relevanceStatus === "not_relevant", "hoy debía verse no pertinente");

    // Y el detalle completo, no solo la cabecera: preguntar por marzo y
    // recibir el análisis de marzo con los requisitos de hoy es peor que no
    // responder.
    const detalle = await IP.getStakeholderDetail(
      orgA, { kind: "external_party", id: parte!.id }, { asOf: dia(-60) }, a.cli);
    assert(detalle.assessment?.id === v1.data, "el detalle histórico trajo el análisis de hoy");
    assert(detalle.requirements.some((r) => r.id === req1.data),
      "el detalle histórico no trajo los requisitos que regían entonces");
    assert(detalle.history.length === 2, `la historia debía tener 2 lecturas, tiene ${detalle.history.length}`);
  });

  await check("AZ. El día del relevo hay UN vigente, ni dos ni ninguno", async () => {
    const elDia = await IP.searchAssessments(orgA, { asOf: dia(-30) }, a.cli);
    const cuantos = elDia.rows.filter((r) => r.subjectLabel.startsWith("Histórica"));
    assert(cuantos.length === 1, `el día del relevo había ${cuantos.length} vigentes`);
    assert(cuantos[0].id === v2.data, "el día del relevo debía regir ya el sucesor");
    const vispera = await IP.searchAssessments(orgA, { asOf: dia(-31) }, a.cli);
    const antes = vispera.rows.filter((r) => r.subjectLabel.startsWith("Histórica"));
    assert(antes.length === 1 && antes[0].id === v1.data,
      "la víspera debía regir todavía la primera lectura");
  });

  await check("BA. Antes de la primera lectura no había nada, y se dice así", async () => {
    const antes = await IP.getStakeholderDetail(
      orgA, { kind: "external_party", id: parte!.id }, { asOf: dia(-120) }, a.cli);
    assert(antes.assessment === null, "apareció un análisis vigente antes de existir");
    assert(antes.requirements.length === 0, "aparecieron requisitos de la nada");
    // Pero la historia SÍ se ve: no saber qué regía entonces no es no tener
    // historia.
    assert(antes.history.length === 2, "se perdió la historia al preguntar por antes");
  });

  await check("BB. Una revisión no se edita ni se borra: es un acta", async () => {
    const rev = await IP.recordReview(orgA, {
      assessmentId: v2.data, verdict: "no_changes", note: "Comité de agosto.",
    }, a.cli);
    assert(rev.ok, `registrar: ${rev.ok ? "" : rev.message}`);
    const { data: upd } = await a.cli.from("quality_stakeholder_reviews")
      .update({ note: "Cambiado a posteriori" }).eq("id", rev.data).select("id");
    assert((upd ?? []).length === 0, "se pudo editar una revisión");
    const { data: del } = await a.cli.from("quality_stakeholder_reviews")
      .delete().eq("id", rev.data).select("id");
    assert((del ?? []).length === 0, "se pudo borrar una revisión");
  });

  await check("BC. Más de 1 000 filas se leen TODAS o se avisa; nunca se cortan en silencio", async () => {
    // `supabase/config.toml` fija max_rows = 1000. Una lectura sin `range()`
    // devolvería mil de mil doscientas SIN error, y en pantalla no se
    // distingue de un conjunto completo.
    const TOTAL = 1_100;
    const lote: Record<string, unknown>[] = [];
    for (let i = 0; i < TOTAL; i += 1) {
      lote.push({
        organization_id: orgA, assessment_id: v2.data, entry_kind: "expectation",
        title: `Expectativa ${String(i).padStart(4, "0")}`,
      });
    }
    for (let i = 0; i < lote.length; i += 500) {
      const { error } = await a.cli.from("quality_stakeholder_requirements")
        .insert(lote.slice(i, i + 500));
      assert(!error, `carga masiva: ${error?.message}`);
    }
    const todas = await IP.listRequirements(orgA, v2.data, { entryKind: "expectation" }, a.cli);
    assert(todas.length === TOTAL,
      `esperaba ${TOTAL} filas y llegaron ${todas.length}: la lectura se cortó en silencio`);
    // Y las etiquetas no se repiten: un recorrido sin orden estable repite y
    // omite filas sin que el número lo delate.
    const distintas = new Set(todas.map((r) => r.title));
    assert(distintas.size === TOTAL, `hay filas repetidas: ${TOTAL - distintas.size}`);
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
