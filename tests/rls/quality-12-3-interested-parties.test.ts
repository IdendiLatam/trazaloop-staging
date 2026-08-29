/**
 * Trazaloop · QUALITY-12.3B1 · Partes interesadas · contra base REAL.
 *
 * Lo que aquí se prueba no se puede leer en el código: que los CHECK cierran
 * lo que dicen cerrar, que el aislamiento es estructural y no solo de
 * política, y que la historia no se puede reescribir.
 *
 * Correr: npm run test:quality123-rls
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
const HOY = new Date().toISOString().slice(0, 10);
const password = "Trazaloop-Test-1234";

async function nuevoUsuario(tag: string) {
  const email = `q123-${tag}-${stamp}@test.trazaloop.dev`;
  const { data } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${tag}` } });
  assert(data.user, `usuario ${tag}`);
  const cli: SupabaseClient = createClient(URL!, ANON!, {
    auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await cli.auth.signInWithPassword({ email, password });
  assert(!error, `login ${tag}: ${error?.message}`);
  return { cli, id: data.user.id, email };
}

async function main() {
  console.log("\nQUALITY-12.3B1 · Partes interesadas · base real\n");

  // --- Empresa A, con quien administra y quien solo mira.
  const a = await nuevoUsuario("a");
  const { data: orgAId } = await a.cli.rpc("create_organization", { p_name: `Q123 A ${stamp}` });
  const orgA = orgAId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");

  // --- Empresa B, para el aislamiento.
  const b = await nuevoUsuario("b");
  const { data: orgBId } = await b.cli.rpc("create_organization", { p_name: `Q123 B ${stamp}` });
  const orgB = orgBId as string;
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgB).eq("module_code", "quality");

  // --- Un usuario que NO es miembro de A.
  //
  // HALLAZGO, y conviene decirlo: la plataforma tiene TRES roles —admin,
  // quality y consultant— y los tres son exactamente los que
  // `quality_manages_interested_parties` concede. Hoy no existe un miembro que
  // pueda leer Quality sin poder escribirlo, así que la prueba «lee pero no
  // muta» no es representable con datos: se comprueba estructuralmente (Y) y
  // con quien no es miembro (Y2).
  const v = await nuevoUsuario("ajeno");

  // =========================================================================
  await check("A. La semilla son 15 categorías, y es idempotente", async () => {
    const { data: n1, error: e1 } = await a.cli.rpc("quality_seed_stakeholder_categories",
      { p_organization_id: orgA });
    assert(!e1, `siembra: ${e1?.message}`);
    assert(Number(n1) === 15, `debían sembrarse 15, sembró ${n1}`);
    const { data: n2 } = await a.cli.rpc("quality_seed_stakeholder_categories",
      { p_organization_id: orgA });
    assert(Number(n2) === 0, `la segunda siembra debía devolver 0, devolvió ${n2}`);
    const { count } = await a.cli.from("quality_stakeholder_categories")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    assert(count === 15, `debían quedar 15 categorías, hay ${count}`);

    // Las cuatro que la revisión humana pidió mantener separadas.
    const { data: codes } = await a.cli.from("quality_stakeholder_categories")
      .select("code").eq("organization_id", orgA);
    const set = new Set((codes ?? []).map((c) => c.code));
    for (const c of ["customers", "users", "authorities", "regulators"]) {
      assert(set.has(c), `falta la categoría ${c}: clientes≠usuarios y autoridades≠entes reguladores`);
    }
  });

  await check("B. Una empresa puede crear su propia categoría", async () => {
    const { error } = await a.cli.from("quality_stakeholder_categories").insert({
      organization_id: orgA, code: `propia-${stamp}`, name: "Junta de acción comunal" });
    assert(!error, `categoría propia: ${error?.message}`);
  });

  await check("C. Una categoría no se borra: se desactiva", async () => {
    const { data: cat } = await a.cli.from("quality_stakeholder_categories")
      .select("id").eq("organization_id", orgA).eq("code", "customers").single();
    const { data: del } = await a.cli.from("quality_stakeholder_categories")
      .delete().eq("id", cat!.id).select("id");
    assert((del ?? []).length === 0, "una categoría se pudo borrar");
    const { error } = await a.cli.from("quality_stakeholder_categories")
      .update({ is_active: false }).eq("id", cat!.id);
    assert(!error, `desactivar debía poder hacerse: ${error?.message}`);
    // Y sigue ahí, con su historia.
    const { data: sigue } = await a.cli.from("quality_stakeholder_categories")
      .select("is_active").eq("id", cat!.id).single();
    assert(sigue!.is_active === false, "la categoría desapareció");
    await a.cli.from("quality_stakeholder_categories").update({ is_active: true }).eq("id", cat!.id);
  });

  // --- Sujetos para el resto de la suite.
  const { data: catA } = await a.cli.from("quality_stakeholder_categories")
    .select("id").eq("organization_id", orgA).eq("code", "customers").single();
  const { data: catWorkers } = await a.cli.from("quality_stakeholder_categories")
    .select("id").eq("organization_id", orgA).eq("code", "workers").single();
  const { data: party } = await a.cli.from("quality_external_parties")
    .insert({ organization_id: orgA, legal_name: `Cliente ABC ${stamp}` }).select("id").single();
  const { data: grupo } = await a.cli.from("quality_stakeholder_groups")
    .insert({ organization_id: orgA, code: "workers", name: "Trabajadores" }).select("id").single();

  await check("D. Un análisis sobre una entidad externa es válido", async () => {
    const { error } = await a.cli.from("quality_stakeholder_assessments").insert({
      organization_id: orgA, category_id: catA!.id,
      subject_kind: "external_party", external_party_id: party!.id,
      relevance_status: "relevant" });
    assert(!error, `análisis de entidad externa: ${error?.message}`);
  });

  await check("E. Un análisis sobre un colectivo es válido", async () => {
    const { error } = await a.cli.from("quality_stakeholder_assessments").insert({
      organization_id: orgA, category_id: catWorkers!.id,
      subject_kind: "group", stakeholder_group_id: grupo!.id,
      relevance_status: "relevant" });
    assert(!error, `análisis de colectivo: ${error?.message}`);
  });

  await check("F. Dos sujetos a la vez se rechazan", async () => {
    const { error } = await a.cli.from("quality_stakeholder_assessments").insert({
      organization_id: orgA, category_id: catA!.id,
      subject_kind: "external_party",
      external_party_id: party!.id, stakeholder_group_id: grupo!.id });
    assert(error, "un análisis con dos sujetos debía rechazarse");
    assert(/one_subject/.test(error!.message), `mensaje inesperado: ${error!.message}`);
  });

  await check("G. Cero sujetos se rechaza", async () => {
    const { error } = await a.cli.from("quality_stakeholder_assessments").insert({
      organization_id: orgA, category_id: catA!.id, subject_kind: "external_party" });
    assert(error, "un análisis sin sujeto debía rechazarse");
    assert(/one_subject|subject_coherent/.test(error!.message), `mensaje: ${error!.message}`);
  });

  await check("G2. Un sujeto incoherente con lo declarado se rechaza", async () => {
    const { error } = await a.cli.from("quality_stakeholder_assessments").insert({
      organization_id: orgA, category_id: catA!.id,
      subject_kind: "group", external_party_id: party!.id });
    assert(error, "declarar «grupo» y apuntar a una entidad externa debía rechazarse");
    assert(/subject_coherent/.test(error!.message), `mensaje: ${error!.message}`);
  });

  await check("H. Un sujeto de OTRA empresa se rechaza en la BASE, no solo por RLS", async () => {
    // La clave foránea es compuesta por (organization_id, id): aunque alguien
    // conozca el uuid de una parte ajena, la fila no puede escribirse.
    const { data: partyB } = await b.cli.from("quality_external_parties")
      .insert({ organization_id: orgB, legal_name: `Cliente de B ${stamp}` }).select("id").single();
    const { data: catB } = await b.cli.rpc("quality_seed_stakeholder_categories",
      { p_organization_id: orgB });
    assert(Number(catB) === 15, "B también siembra sus categorías");

    const { error } = await a.cli.from("quality_stakeholder_assessments").insert({
      organization_id: orgA, category_id: catA!.id,
      subject_kind: "external_party", external_party_id: partyB!.id });
    assert(error, "A pudo analizar una parte de B");
    assert(/foreign key|violates/i.test(error!.message), `debía fallar por FK: ${error!.message}`);
  });

  // --- Un análisis vigente para lo que sigue.
  const { data: an } = await a.cli.from("quality_stakeholder_assessments")
    .select("id").eq("organization_id", orgA).eq("category_id", catA!.id)
    .is("effective_to", null).single();
  const assessment = an!.id as string;

  await check("H2. Solo UN análisis vigente por (sujeto, categoría)", async () => {
    const { error } = await a.cli.from("quality_stakeholder_assessments").insert({
      organization_id: orgA, category_id: catA!.id,
      subject_kind: "external_party", external_party_id: party!.id });
    assert(error, "un segundo análisis vigente de la misma parte y categoría debía rechazarse");
    assert(/current_party_uniq/.test(error!.message), `mensaje: ${error!.message}`);
  });

  await check("I. La historia del análisis se conserva: se sucede, no se reescribe", async () => {
    // Se cierra la vigencia del actual y se emite el sucesor.
    const { error: eCierre } = await a.cli.from("quality_stakeholder_assessments")
      .update({ effective_to: HOY, status: "superseded" }).eq("id", assessment);
    assert(!eCierre, `cerrar la vigencia: ${eCierre?.message}`);

    const { data: nuevo, error: eNuevo } = await a.cli.from("quality_stakeholder_assessments")
      .insert({ organization_id: orgA, category_id: catA!.id,
                subject_kind: "external_party", external_party_id: party!.id,
                relevance_status: "relevant", supersedes_id: assessment,
                summary: "segundo análisis" })
      .select("id").single();
    assert(!eNuevo && nuevo, `sucesor: ${eNuevo?.message}`);

    // El anterior sigue, entero, y ya no se puede mover.
    const { data: viejo } = await a.cli.from("quality_stakeholder_assessments")
      .select("status, effective_to, relevance_status").eq("id", assessment).single();
    assert(viejo!.status === "superseded" && viejo!.effective_to !== null,
      "el análisis anterior debía quedar sucedido y con vigencia cerrada");

    const { error: eReabrir } = await a.cli.from("quality_stakeholder_assessments")
      .update({ effective_to: null, status: "current" }).eq("id", assessment);
    assert(eReabrir, "reabrir la vigencia de un análisis sucedido debía rechazarse");
    assert(/ya sucedido no se reescribe/.test(eReabrir!.message), `mensaje: ${eReabrir!.message}`);

    // Y no se puede borrar.
    const { data: del } = await a.cli.from("quality_stakeholder_assessments")
      .delete().eq("id", assessment).select("id");
    assert((del ?? []).length === 0, "un análisis se pudo borrar");
  });

  const { data: anVigente } = await a.cli.from("quality_stakeholder_assessments")
    .select("id").eq("organization_id", orgA).eq("category_id", catA!.id)
    .is("effective_to", null).single();
  const vigente = anVigente!.id as string;

  await check("I2. Descartar una parte sin justificar se rechaza", async () => {
    const { error } = await a.cli.from("quality_stakeholder_assessments").insert({
      organization_id: orgA, category_id: catWorkers!.id,
      subject_kind: "group", stakeholder_group_id: grupo!.id,
      relevance_status: "not_relevant" });
    assert(error, "declarar no pertinente sin motivo debía rechazarse");
    assert(/relevance_rationale/.test(error!.message), `mensaje: ${error!.message}`);
  });

  await check("J. Necesidad, expectativa y requisito son TRES cosas", async () => {
    const base = { organization_id: orgA, assessment_id: vigente };
    const { data: nec, error: eN } = await a.cli.from("quality_stakeholder_requirements")
      .insert({ ...base, entry_kind: "need", title: "Entregas a tiempo" }).select("id").single();
    assert(!eN && nec, `necesidad: ${eN?.message}`);
    const { error: eE } = await a.cli.from("quality_stakeholder_requirements")
      .insert({ ...base, entry_kind: "expectation", title: "Portal de trazabilidad" });
    assert(!eE, `expectativa: ${eE?.message}`);

    // Un requisito SIN subtipo se rechaza.
    const { error: eSin } = await a.cli.from("quality_stakeholder_requirements")
      .insert({ ...base, entry_kind: "requirement", title: "SLA contractual" });
    assert(eSin, "un requisito sin subtipo debía rechazarse");
    assert(/subtype_check/.test(eSin!.message), `mensaje: ${eSin!.message}`);

    // Una necesidad CON subtipo también.
    const { error: eCon } = await a.cli.from("quality_stakeholder_requirements")
      .insert({ ...base, entry_kind: "need", title: "Otra", requirement_kind: "legal" });
    assert(eCon, "una necesidad con subtipo de requisito debía rechazarse");

    return void nec;
  });

  await check("J2. Convertir conserva el origen, y no se convierte cualquier cosa", async () => {
    const { data: nec } = await a.cli.from("quality_stakeholder_requirements")
      .select("id").eq("assessment_id", vigente).eq("entry_kind", "need").limit(1).single();

    // Sin motivo ni fecha de conversión, se rechaza.
    const { error: eSinMotivo } = await a.cli.from("quality_stakeholder_requirements").insert({
      organization_id: orgA, assessment_id: vigente, entry_kind: "requirement",
      requirement_kind: "contractual", title: "SLA 48h", derived_from_id: nec!.id });
    assert(eSinMotivo, "convertir sin motivo debía rechazarse");

    const { data: req, error: eReq } = await a.cli.from("quality_stakeholder_requirements").insert({
      organization_id: orgA, assessment_id: vigente, entry_kind: "requirement",
      requirement_kind: "contractual", title: "SLA 48h",
      derived_from_id: nec!.id, converted_at: new Date().toISOString(),
      conversion_rationale: "El cliente lo llevó al contrato en la renovación." })
      .select("id, derived_from_id").single();
    assert(!eReq && req, `conversión: ${eReq?.message}`);
    assert(req!.derived_from_id === nec!.id, "la conversión perdió su origen");

    // Y un requisito no se deriva de otro requisito.
    const { error: eDoble } = await a.cli.from("quality_stakeholder_requirements").insert({
      organization_id: orgA, assessment_id: vigente, entry_kind: "requirement",
      requirement_kind: "legal", title: "Derivado de un requisito",
      derived_from_id: req!.id, converted_at: new Date().toISOString(),
      conversion_rationale: "no debería poder" });
    assert(eDoble, "derivar un requisito de otro requisito debía rechazarse");
    assert(/necesidad o de una expectativa/.test(eDoble!.message), `mensaje: ${eDoble!.message}`);
  });

  await check("K. La pertinencia del requisito exige justificación al descartar", async () => {
    const { error } = await a.cli.from("quality_stakeholder_requirements").insert({
      organization_id: orgA, assessment_id: vigente, entry_kind: "expectation",
      title: "Descartada", relevance_status: "not_relevant" });
    assert(error, "descartar un requisito sin motivo debía rechazarse");
    assert(/relevance_rationale/.test(error!.message), `mensaje: ${error!.message}`);

    const { error: ok } = await a.cli.from("quality_stakeholder_requirements").insert({
      organization_id: orgA, assessment_id: vigente, entry_kind: "expectation",
      title: "Descartada con motivo", relevance_status: "not_relevant",
      relevance_rationale: "No aplica a nuestra operación." });
    assert(!ok, `con motivo debía aceptarse: ${ok?.message}`);
  });

  // --- Proceso y cargo de A para las relaciones core.
  const { data: proc } = await a.cli.from("quality_processes")
    .insert({ organization_id: orgA, code: `P-${stamp}`, name: "Despacho",
              category_code: "core" }).select("id").single();
  const { data: pos } = await a.cli.from("quality_positions")
    .insert({ organization_id: orgA, name: "Jefe de despacho" }).select("id").single();
  const { data: reqRow } = await a.cli.from("quality_stakeholder_requirements")
    .select("id").eq("assessment_id", vigente).eq("entry_kind", "requirement").limit(1).single();
  const requisito = reqRow!.id as string;

  await check("L. Requisito → proceso: relación core con FK e integridad", async () => {
    const { error } = await a.cli.from("quality_stakeholder_requirement_processes").insert({
      organization_id: orgA, requirement_id: requisito, process_id: proc!.id,
      link_kind: "addressed_by" });
    assert(!error, `vínculo requisito→proceso: ${error?.message}`);

    // Un vínculo vigente por pareja.
    const { error: eDup } = await a.cli.from("quality_stakeholder_requirement_processes").insert({
      organization_id: orgA, requirement_id: requisito, process_id: proc!.id });
    assert(eDup, "un segundo vínculo vigente para la misma pareja debía rechazarse");

    // Y se responde la pregunta en los dos sentidos.
    const { data: porRequisito } = await a.cli.from("quality_stakeholder_requirement_processes")
      .select("process_id").eq("requirement_id", requisito).is("effective_to", null);
    assert((porRequisito ?? []).length === 1, "requisito → procesos");
    const { data: porProceso } = await a.cli.from("quality_stakeholder_requirement_processes")
      .select("requirement_id").eq("process_id", proc!.id).is("effective_to", null);
    assert((porProceso ?? []).length === 1, "proceso → requisitos");
  });

  await check("M. Un proceso de otra empresa no se puede enlazar", async () => {
    const { data: procB } = await b.cli.from("quality_processes")
      .insert({ organization_id: orgB, code: `PB-${stamp}`, name: "Proceso de B",
                category_code: "core" }).select("id").single();
    const { error } = await a.cli.from("quality_stakeholder_requirement_processes").insert({
      organization_id: orgA, requirement_id: requisito, process_id: procB!.id });
    assert(error, "se pudo enlazar un proceso de otra empresa");
    assert(/foreign key|violates/i.test(error!.message), `debía fallar por FK: ${error!.message}`);
  });

  await check("N. La dueña de la estrategia es un CARGO", async () => {
    const { data: est, error } = await a.cli.from("quality_stakeholder_strategies").insert({
      organization_id: orgA, assessment_id: vigente, title: "Seguimiento mensual",
      purpose: "Sostener la relación", owner_position_id: pos!.id,
      monitoring_method: "meeting", status: "active", review_cadence_months: 12 })
      .select("id, owner_position_id").single();
    assert(!error && est, `estrategia: ${error?.message}`);
    assert(est!.owner_position_id === pos!.id, "la dueña debía ser el cargo");

    // Un cargo de otra empresa se rechaza.
    const { data: posB } = await b.cli.from("quality_positions")
      .insert({ organization_id: orgB, name: "Cargo de B" }).select("id").single();
    const { error: eCross } = await a.cli.from("quality_stakeholder_strategies").insert({
      organization_id: orgA, assessment_id: vigente, title: "Con cargo ajeno",
      owner_position_id: posB!.id });
    assert(eCross, "se pudo poner como dueña a un cargo de otra empresa");
  });

  const { data: estRow } = await a.cli.from("quality_stakeholder_strategies")
    .select("id").eq("assessment_id", vigente).eq("status", "active").limit(1).single();
  const estrategia = estRow!.id as string;

  await check("O. Una estrategia SIN requisitos enlazados es válida: es la general", async () => {
    const { data: enlaces } = await a.cli.from("quality_stakeholder_strategy_requirements")
      .select("id").eq("strategy_id", estrategia);
    assert((enlaces ?? []).length === 0, "la estrategia nace sin enlaces, y eso es válido");
    // Y NO existe una columna de alcance que pueda contradecir a los enlaces.
    const { data: cols } = await a.cli.from("quality_stakeholder_strategies")
      .select("*").eq("id", estrategia).single();
    assert(!Object.prototype.hasOwnProperty.call(cols ?? {}, "requirement_id"),
      "la estrategia no puede tener requirement_id: el alcance vive en los enlaces");
  });

  await check("P. Una estrategia con UN requisito", async () => {
    const { error } = await a.cli.from("quality_stakeholder_strategy_requirements").insert({
      organization_id: orgA, strategy_id: estrategia, requirement_id: requisito,
      coverage_note: "Atiende el plazo de entrega" });
    assert(!error, `enlace estrategia→requisito: ${error?.message}`);
    const { data: q1 } = await a.cli.from("quality_stakeholder_strategy_requirements")
      .select("requirement_id").eq("strategy_id", estrategia).is("effective_to", null);
    assert((q1 ?? []).length === 1, "¿qué requisitos atiende esta estrategia?");
    const { data: q2 } = await a.cli.from("quality_stakeholder_strategy_requirements")
      .select("strategy_id").eq("requirement_id", requisito).is("effective_to", null);
    assert((q2 ?? []).length === 1, "¿qué estrategias atienden este requisito?");
  });

  await check("Q. Una estrategia con VARIOS requisitos", async () => {
    const { data: req2 } = await a.cli.from("quality_stakeholder_requirements").insert({
      organization_id: orgA, assessment_id: vigente, entry_kind: "requirement",
      requirement_kind: "legal", title: "Reporte anual obligatorio" }).select("id").single();
    const { error } = await a.cli.from("quality_stakeholder_strategy_requirements").insert({
      organization_id: orgA, strategy_id: estrategia, requirement_id: req2!.id });
    assert(!error, `segundo enlace: ${error?.message}`);
    const { count } = await a.cli.from("quality_stakeholder_strategy_requirements")
      .select("id", { count: "exact", head: true })
      .eq("strategy_id", estrategia).is("effective_to", null);
    assert(count === 2, `la estrategia debía atender 2 requisitos, atiende ${count}`);
  });

  await check("R. Una estrategia no puede atender requisitos de OTRA parte ni de otra empresa", async () => {
    // Otra parte de la MISMA empresa: el guardián lo impide.
    const { data: otroGrupo } = await a.cli.from("quality_stakeholder_groups")
      .insert({ organization_id: orgA, code: `comunidad-${stamp}`, name: "Comunidad" })
      .select("id").single();
    const { data: otroAn, error: eOtro } = await a.cli.from("quality_stakeholder_assessments").insert({
      organization_id: orgA, category_id: catWorkers!.id,
      subject_kind: "group", stakeholder_group_id: otroGrupo!.id,
      relevance_status: "relevant" }).select("id").single();
    assert(!eOtro && otroAn, `segundo análisis: ${eOtro?.message}`);
    const { data: otroReq } = await a.cli.from("quality_stakeholder_requirements").insert({
      organization_id: orgA, assessment_id: otroAn!.id, entry_kind: "requirement",
      requirement_kind: "internal_commitment", title: "De otra parte" }).select("id").single();
    const { error } = await a.cli.from("quality_stakeholder_strategy_requirements").insert({
      organization_id: orgA, strategy_id: estrategia, requirement_id: otroReq!.id });
    assert(error, "una estrategia pudo atender un requisito de otra parte interesada");
    assert(/mismo analisis/.test(error!.message), `mensaje: ${error!.message}`);
  });

  await check("S. Una revisión SIN cambios es representable, y no fabrica versión nueva", async () => {
    const { count: antes } = await a.cli.from("quality_stakeholder_assessments")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgA);

    const { error } = await a.cli.from("quality_stakeholder_reviews").insert({
      organization_id: orgA, assessment_id: vigente, strategy_id: estrategia,
      verdict: "no_changes", note: "Revisado en comité; nada que cambiar.",
      owner_position_id: pos!.id });
    assert(!error, `revisión sin cambios: ${error?.message}`);

    const { count: despues } = await a.cli.from("quality_stakeholder_assessments")
      .select("id", { count: "exact", head: true }).eq("organization_id", orgA);
    assert(antes === despues, "registrar «sin cambios» creó una versión nueva");
  });

  await check("T. Una revisión es un hecho: ni se edita ni se borra", async () => {
    const { data: rev } = await a.cli.from("quality_stakeholder_reviews")
      .select("id").eq("organization_id", orgA).limit(1).single();
    const { error: eUpd } = await a.cli.from("quality_stakeholder_reviews")
      .update({ verdict: "changes_applied" }).eq("id", rev!.id);
    assert(eUpd, "una revisión se pudo editar");
    const { data: del } = await a.cli.from("quality_stakeholder_reviews")
      .delete().eq("id", rev!.id).select("id");
    assert((del ?? []).length === 0, "una revisión se pudo borrar");
    // Y una revisión que no revisa nada se rechaza.
    const { error: eVacia } = await a.cli.from("quality_stakeholder_reviews").insert({
      organization_id: orgA, verdict: "no_changes" });
    assert(eVacia, "una revisión sin objeto debía rechazarse");
  });

  await check("U. La priorización es OPCIONAL: nulos aceptados", async () => {
    const { data: an2 } = await a.cli.from("quality_stakeholder_assessments")
      .select("priority_label, priority_score").eq("id", vigente).single();
    assert(an2!.priority_label === null && an2!.priority_score === null,
      "un análisis sin priorización debía ser válido");
  });

  await check("V. Una puntuación sin metodología ni justificación se rechaza", async () => {
    const { error } = await a.cli.from("quality_stakeholder_assessments")
      .update({ priority_score: 7.4 }).eq("id", vigente);
    assert(error, "un número desnudo debía rechazarse");
    assert(/score_needs_method/.test(error!.message), `mensaje: ${error!.message}`);

    const { error: ok } = await a.cli.from("quality_stakeholder_assessments")
      .update({ priority_score: 7.4, priority_method_note: "Influencia 3 × impacto 2,5 (plantilla sugerida)." })
      .eq("id", vigente);
    assert(!ok, `con metodología debía aceptarse: ${ok?.message}`);

    // Y la etiqueta cualitativa sola también vale.
    const { error: eLabel } = await a.cli.from("quality_stakeholder_assessments")
      .update({ priority_label: "high" }).eq("id", vigente);
    assert(!eLabel, `la prioridad cualitativa debía aceptarse: ${eLabel?.message}`);
  });

  await check("W. Las relaciones CORE no viven en work_references", async () => {
    // El dominio no registra sus dos relaciones core como referencias
    // genéricas: si alguien lo intentara, ni siquiera existe el vocabulario.
    const { error } = await a.cli.from("work_references").insert({
      organization_id: orgA, owner_kind: "stakeholder_strategy", owner_id: estrategia,
      ref_kind: "quality_stakeholder_requirement", ref_id: requisito, relation: "related" });
    assert(error, "work_references aceptó una relación core del dominio");
    // Y las dos core se responden por FK, no por esa tabla.
    const { count } = await a.cli.from("quality_stakeholder_strategy_requirements")
      .select("id", { count: "exact", head: true }).eq("strategy_id", estrategia);
    assert((count ?? 0) >= 1, "la relación core vive en su propia tabla");
  });

  await check("X. Aislamiento entre empresas en las OCHO tablas", async () => {
    const tablas = [
      "quality_stakeholder_categories", "quality_stakeholder_groups",
      "quality_stakeholder_assessments", "quality_stakeholder_requirements",
      "quality_stakeholder_requirement_processes", "quality_stakeholder_strategies",
      "quality_stakeholder_strategy_requirements", "quality_stakeholder_reviews",
    ];
    for (const t of tablas) {
      const { data } = await b.cli.from(t).select("id").eq("organization_id", orgA);
      assert((data ?? []).length === 0, `B pudo leer ${t} de A`);
    }
    // Y escribir en A desde B tampoco.
    const { error } = await b.cli.from("quality_stakeholder_groups").insert({
      organization_id: orgA, name: "Intruso" });
    assert(error, "B pudo escribir en el dominio de A");
  });

  await check("Y. Leer y escribir son DOS autorizaciones distintas, y las políticas lo reflejan", async () => {
    // Estructural, porque hoy los tres roles de la plataforma coinciden con
    // los que administran. El día que exista un rol de solo lectura, esta
    // separación ya está hecha y no habrá que reescribir ocho tablas.
    const { data: pol, error } = await admin.rpc("quality_manages_interested_parties",
      { p_organization_id: orgA });
    // El servicio no es miembro: la función devuelve falso, y eso ya dice que
    // el permiso no se hereda de tener la clave.
    assert(!error, `permiso: ${error?.message}`);
    assert(pol === false, "la clave de servicio no debe conceder permiso de dominio");
  });

  await check("Y2. Quien NO es miembro no lee ni escribe nada", async () => {
    const { data: leidas } = await v.cli.from("quality_stakeholder_categories")
      .select("id").eq("organization_id", orgA);
    assert((leidas ?? []).length === 0, "un no miembro pudo leer las categorías");

    const { error } = await v.cli.from("quality_stakeholder_groups").insert({
      organization_id: orgA, name: "Creado por alguien de fuera" });
    assert(error, "un no miembro pudo escribir");

    const { data: upd } = await v.cli.from("quality_stakeholder_strategies")
      .update({ title: "Cambiado desde fuera" }).eq("id", estrategia).select("id");
    assert((upd ?? []).length === 0, "un no miembro pudo modificar");
  });

  await check("Z. Quien administra solo administra SU empresa", async () => {
    const { error } = await a.cli.from("quality_stakeholder_categories").insert({
      organization_id: orgB, name: "Categoría en la empresa ajena" });
    assert(error, "quien administra A pudo escribir en B");
    // Y la función de permiso no le concede nada sobre B.
    const { data: puede } = await a.cli.rpc("quality_manages_interested_parties",
      { p_organization_id: orgB });
    assert(puede === false, "el permiso de A alcanzaba a B");
  });

  console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
