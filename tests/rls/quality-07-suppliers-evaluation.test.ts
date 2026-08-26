/**
 * Trazaloop · QUALITY-07 · Proveedores, criticidad y evaluación, contra base real.
 *
 * Los doce escenarios del encargo (§67…§78). Lo que se comprueba aquí no es un
 * CRUD: son las afirmaciones del dominio que SOLO se demuestran ejecutándolas.
 *
 *   · incorporar el mismo ACME desde PCR y desde Textiles produce UNA empresa;
 *   · un proveedor aprobado para una categoría NO queda aprobado para otra;
 *   · un 92 no aprueba a nadie: la decisión es un acto humano aparte;
 *   · «no aplica» sale del cálculo en vez de contar como cero;
 *   · publicar una plantilla nueva no reescribe lo evaluado con la anterior;
 *   · una reevaluación vencida avisa una vez y no suspende;
 *   · un certificado caducado no retira ninguna aprobación;
 *   · un incidente no es una no conformidad hasta que alguien lo decide;
 *   · suspender un alcance no toca los demás;
 *   · retirar conserva, y borrar solo es posible sin historia;
 *   · el consultor externo acompaña pero no homologa;
 *   · y lo de otra empresa no existe, ni con el UUID en la mano.
 *
 * Todo corre con la sesión REAL de cada usuario. El cliente administrativo solo
 * crea cuentas y membresías: con `service_role` se saltaría RLS y no se
 * probaría nada.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality07-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(label: string, name: string) {
  const email = `q07-${label}-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login ${label}: ${e.message}`);
  return { id: data.user.id, name, email, client };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (offset: number) => iso(new Date(Date.now() + offset * 86_400_000));

const HOY = day(0);
const HACE_UN_ANIO = day(-380);
const HACE_MEDIO_ANIO = day(-190);
const AYER = day(-1);

/** El alta de un proveedor «a mano»: identidad + papel + perfil. Se hace con la
 *  sesión de quien administra, no con el cliente administrativo. */
async function newSupplier(
  c: SupabaseClient, org: string, legalName: string, taxId: string | null
) {
  const { data: party, error: ep } = await c.from("quality_external_parties")
    .insert({ organization_id: org, legal_name: legalName, tax_id: taxId })
    .select("id").single();
  assert(!ep && party, `empresa externa «${legalName}»: ${ep?.message}`);
  const { error: er } = await c.from("quality_external_party_roles")
    .insert({ organization_id: org, party_id: party!.id, role_code: "supplier" });
  assert(!er, `papel de proveedor: ${er?.message}`);
  const { data: profile, error: epr } = await c.from("quality_supplier_profiles")
    .insert({ organization_id: org, party_id: party!.id, relationship_status: "active" })
    .select("id").single();
  assert(!epr && profile, `perfil de proveedor: ${epr?.message}`);
  return { partyId: party!.id as string, profileId: profile!.id as string };
}

async function newCategory(c: SupabaseClient, org: string, name: string) {
  const { data, error } = await c.from("quality_supplier_categories")
    .insert({ organization_id: org, name }).select("id").single();
  assert(!error && data, `categoría «${name}»: ${error?.message}`);
  return data!.id as string;
}

async function newScope(
  c: SupabaseClient, org: string, profileId: string,
  siteId: string | null, categoryId: string | null
) {
  const { data, error } = await c.from("quality_supplier_scopes")
    .insert({ organization_id: org, profile_id: profileId, site_id: siteId, category_id: categoryId })
    .select("id").single();
  assert(!error && data, `alcance: ${error?.message}`);
  return data!.id as string;
}

/** Una plantilla publicada con los criterios que se le pasen. */
async function newTemplate(
  c: SupabaseClient, org: string, name: string,
  criterios: { code: string; label: string; weight: number; maxPoints: number }[],
  desde: string
) {
  const { data: t, error: et } = await c.from("quality_supplier_evaluation_templates")
    .insert({ organization_id: org, name }).select("id").single();
  assert(!et && t, `plantilla «${name}»: ${et?.message}`);
  const { data: v, error: ev } = await c.from("quality_supplier_template_versions")
    .insert({
      organization_id: org, template_id: t!.id, version_number: 1,
      scoring_rule: "weighted_average",
      bands: [{ min: 80, max: 100, label: "Excelente" },
              { min: 60, max: 79.999, label: "Aceptable" },
              { min: 0, max: 59.999, label: "Deficiente" }],
    })
    .select("id").single();
  assert(!ev && v, `versión de «${name}»: ${ev?.message}`);
  let orden = 1;
  for (const cr of criterios) {
    const { error: ec } = await c.from("quality_supplier_evaluation_criteria").insert({
      organization_id: org, version_id: v!.id, code: cr.code, label: cr.label,
      weight: cr.weight, max_points: cr.maxPoints, evaluation_method: "observation",
      position_order: orden++,
    });
    assert(!ec, `criterio ${cr.code}: ${ec?.message}`);
  }
  const { error: epub } = await c.rpc("quality_publish_supplier_template_version", {
    p_version_id: v!.id, p_effective_from: desde, p_change_note: "Versión inicial",
  });
  assert(!epub, `publicar «${name}»: ${epub?.message}`);
  return { templateId: t!.id as string, versionId: v!.id as string };
}

async function criteriaOf(c: SupabaseClient, org: string, versionId: string) {
  const { data } = await c.from("quality_supplier_evaluation_criteria")
    .select("id, code").eq("organization_id", org).eq("version_id", versionId)
    .order("position_order");
  return (data ?? []) as { id: string; code: string }[];
}

async function main() {
  console.log("\nQUALITY-07 · base real\n");

  const owner = await newUser("adm", "Directora");
  const quality = await newUser("cal", "Coordinadora de Calidad");
  const consultant = await newUser("con", "Consultor externo");
  const outsider = await newUser("out", "Ajena");
  for (const u of [owner, quality, consultant, outsider]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q07" });
  }
  const { data: a } = await owner.client.rpc("create_organization", { p_name: `Q07 A ${stamp}` });
  const { data: b } = await outsider.client.rpc("create_organization", { p_name: `Q07 B ${stamp}` });
  const A = a as string, B = b as string;

  await admin.from("memberships").insert([
    { organization_id: A, user_id: quality.id, role_code: "quality", status: "active" },
    { organization_id: A, user_id: consultant.id, role_code: "consultant", status: "active" },
  ]);

  const Q = quality.client;    // administra y decide
  const C = consultant.client; // acompaña, NO homologa
  const O = outsider.client;   // otra empresa

  // ==========================================================================
  console.log("A · Escenario 1 · el mismo ACME desde dos módulos es UNA empresa (§67)");
  // ==========================================================================

  const { data: cprSup, error: ecpr } = await Q.from("suppliers")
    .insert({ organization_id: A, name: `ACME ${stamp}`, tax_id: `NIT-${stamp}` })
    .select("id").single();
  assert(!ecpr && cprSup, `proveedor de PCR: ${ecpr?.message}`);
  const { data: texSup, error: etex } = await Q.from("textile_suppliers")
    .insert({ organization_id: A, name: `ACME ${stamp}`, tax_id: `NIT-${stamp}` })
    .select("id").single();
  assert(!etex && texSup, `proveedor textil: ${etex?.message}`);

  let ACME_PROFILE = "";

  await check("A1. incorporar desde PCR crea la identidad y el proveedor de Quality", async () => {
    const { data, error } = await Q.rpc("quality_adopt_supplier", {
      p_source_module: "cpr", p_source_id: cprSup!.id,
    });
    assert(!error && data, `incorporar desde PCR: ${error?.message}`);
    ACME_PROFILE = data as string;
  });

  await check("A2. incorporar el MISMO ACME desde Textiles NO crea una segunda empresa", async () => {
    const { data, error } = await Q.rpc("quality_adopt_supplier", {
      p_source_module: "textiles", p_source_id: texSup!.id,
    });
    assert(!error, `incorporar desde Textiles: ${error?.message}`);
    assert(data === ACME_PROFILE,
      "se creó un segundo proveedor de Quality para la misma empresa");
    const { data: parties } = await Q.from("quality_external_parties")
      .select("id").eq("organization_id", A).eq("tax_id", `NIT-${stamp}`);
    assert((parties ?? []).length === 1,
      `hay ${(parties ?? []).length} identidades para el mismo NIT`);
  });

  await check("A3. incorporar dos veces es inocuo y no rompe PCR ni Textiles", async () => {
    const { error } = await Q.rpc("quality_adopt_supplier", {
      p_source_module: "cpr", p_source_id: cprSup!.id,
    });
    assert(!error, `segunda incorporación: ${error?.message}`);
    const { data: cpr } = await Q.from("suppliers")
      .select("id, name, external_party_id").eq("id", cprSup!.id).single();
    assert(cpr && cpr.name === `ACME ${stamp}`, "el proveedor de PCR cambió de nombre");
    assert(cpr!.external_party_id !== null, "el puente no quedó puesto");
    const { data: tex } = await Q.from("textile_suppliers")
      .select("external_party_id").eq("id", texSup!.id).single();
    assert(tex?.external_party_id === cpr!.external_party_id,
      "los dos módulos apuntan a identidades distintas");
  });

  // ==========================================================================
  console.log("\nB · Escenario 2 · aprobado ¿para qué? (§68)");
  // ==========================================================================

  const MATERIA = await newCategory(Q, A, `Materia prima ${stamp}`);
  const CALIBRACION = await newCategory(Q, A, `Calibración ${stamp}`);
  const SCOPE_MATERIA = await newScope(Q, A, ACME_PROFILE, null, MATERIA);
  const SCOPE_CALIB = await newScope(Q, A, ACME_PROFILE, null, CALIBRACION);

  await check("B1. la decisión se toma sobre un ALCANCE y deja constancia de su fundamento", async () => {
    const { error } = await Q.rpc("quality_decide_supplier_approval", {
      p_scope_id: SCOPE_MATERIA, p_decision: "approved",
      p_rationale: "Evaluación de selección conforme y visita a planta.",
      p_effective_from: HACE_MEDIO_ANIO,
    });
    assert(!error, `decidir: ${error?.message}`);
  });

  await check("B2. aprobar materia prima NO aprueba calibración", async () => {
    const { data } = await Q.from("v_quality_supplier_scope_status")
      .select("scope_id, is_approved_now").eq("organization_id", A)
      .in("scope_id", [SCOPE_MATERIA, SCOPE_CALIB]);
    const materia = (data ?? []).find((x) => x.scope_id === SCOPE_MATERIA);
    const calib = (data ?? []).find((x) => x.scope_id === SCOPE_CALIB);
    assert(materia?.is_approved_now === true, "el alcance aprobado no consta como aprobado");
    assert(calib?.is_approved_now !== true,
      "aprobar una categoría aprobó otra: es exactamente la afirmación que no se puede hacer");
  });

  await check("B3. la lista de proveedores aprobados solo trae el alcance aprobado", async () => {
    const { data } = await Q.from("v_quality_approved_supplier_list")
      .select("scope_id").eq("organization_id", A);
    const ids = (data ?? []).map((x) => x.scope_id);
    assert(ids.includes(SCOPE_MATERIA), "el alcance aprobado no aparece en la lista");
    assert(!ids.includes(SCOPE_CALIB), "un alcance sin decidir aparece como aprobado");
  });

  await check("B4. una decisión sin fundamento se rechaza", async () => {
    const { error } = await Q.rpc("quality_decide_supplier_approval", {
      p_scope_id: SCOPE_CALIB, p_decision: "approved", p_rationale: "   ",
    });
    assert(error, "se aceptó una aprobación sin decir en qué se basa");
  });

  await check("B5. una aprobación condicionada sin condiciones se rechaza", async () => {
    const { error } = await Q.rpc("quality_decide_supplier_approval", {
      p_scope_id: SCOPE_CALIB, p_decision: "conditionally_approved",
      p_rationale: "Cumple lo esencial pero falta el certificado.",
    });
    assert(error, "se aceptó una condicionada sin decir cuáles son las condiciones");
  });

  // ==========================================================================
  console.log("\nC · Escenario 3 · un 92 no aprueba a nadie (§69)");
  // ==========================================================================

  const { versionId: PLANTILLA_V1 } = await newTemplate(Q, A, `Evaluación estándar ${stamp}`, [
    { code: "C1", label: "Cumplimiento de entregas", weight: 2, maxPoints: 100 },
    { code: "C2", label: "Calidad del suministro", weight: 2, maxPoints: 100 },
    { code: "C3", label: "Certificación vigente", weight: 1, maxPoints: 100 },
  ], HACE_UN_ANIO);

  let EVAL_1 = "";

  await check("C1. se abre una evaluación sobre el alcance", async () => {
    const { data, error } = await Q.from("quality_supplier_evaluations").insert({
      organization_id: A, scope_id: SCOPE_MATERIA, version_id: PLANTILLA_V1,
      evaluation_kind: "periodic", period_label: "2026-S1",
    }).select("id").single();
    assert(!error && data, `abrir evaluación: ${error?.message}`);
    EVAL_1 = data!.id as string;
  });

  await check("C2. «no aplica» NO admite puntos: lo rechaza la base", async () => {
    const criterios = await criteriaOf(Q, A, PLANTILLA_V1);
    const { error } = await Q.from("quality_supplier_evaluation_results").insert({
      organization_id: A, evaluation_id: EVAL_1, criterion_id: criterios[2].id,
      outcome: "not_applicable", points: 0,
    });
    assert(error, "se guardaron puntos en un criterio que no aplica");
  });

  await check("C3. «no aplica» sale del cálculo en vez de contar como cero", async () => {
    const criterios = await criteriaOf(Q, A, PLANTILLA_V1);
    for (const [i, r] of [
      { outcome: "scored", points: 92 },
      { outcome: "scored", points: 92 },
      { outcome: "not_applicable", points: null },
    ].entries()) {
      const { error } = await Q.from("quality_supplier_evaluation_results").insert({
        organization_id: A, evaluation_id: EVAL_1, criterion_id: criterios[i].id,
        outcome: r.outcome, points: r.points,
      });
      assert(!error, `resultado ${criterios[i].code}: ${error?.message}`);
    }
    const { data, error } = await Q.rpc("quality_close_supplier_evaluation", {
      p_evaluation_id: EVAL_1, p_summary: "Buen semestre.", p_evaluated_on: HACE_MEDIO_ANIO,
    });
    assert(!error, `cerrar: ${error?.message}`);
    const out = data as Record<string, unknown>;
    assert(Number(out.score) === 92,
      `el «no aplica» movió el resultado a ${out.score} en vez de dejarlo en 92`);
    assert(Number(out.not_applicable) === 1, "no se contó el criterio que no aplica");
    assert(out.decides_nothing === true,
      "cerrar una evaluación no declara que no decide nada");
  });

  await check("C4. cerrar NO aprueba: la decisión del alcance no cambia sola", async () => {
    const { data } = await Q.from("quality_supplier_approval_decisions")
      .select("id, evaluation_id").eq("organization_id", A).eq("scope_id", SCOPE_MATERIA);
    assert((data ?? []).length === 1,
      "cerrar la evaluación produjo una decisión de aprobación por su cuenta");
    assert((data ?? [])[0].evaluation_id === null,
      "la decisión anterior se ató sola a la evaluación nueva");
  });

  await check("C5. una evaluación cerrada no se puede reabrir por la puerta de atrás", async () => {
    const { error } = await Q.from("quality_supplier_evaluations")
      .update({ score: 100 }).eq("id", EVAL_1);
    assert(error, "se pudo reescribir la puntuación de una evaluación cerrada");
    const { data } = await Q.from("quality_supplier_evaluations")
      .select("score, status").eq("id", EVAL_1).single();
    assert(Number(data?.score) === 92, "la puntuación cerrada cambió");
  });

  await check("C6. tampoco cambiando un criterio suyo", async () => {
    const criterios = await criteriaOf(Q, A, PLANTILLA_V1);
    const { error } = await Q.from("quality_supplier_evaluation_results")
      .update({ points: 10 })
      .eq("evaluation_id", EVAL_1).eq("criterion_id", criterios[0].id);
    assert(error, "se cambió un criterio de una evaluación ya cerrada");
  });

  // ==========================================================================
  console.log("\nD · Escenario 4 · la plantilla se versiona (§70)");
  // ==========================================================================

  await check("D1. publicar una versión nueva no toca lo evaluado con la anterior", async () => {
    const { data: t } = await Q.from("quality_supplier_evaluation_templates")
      .select("id").eq("organization_id", A).limit(1).single();
    const { data: v2, error: ev } = await Q.from("quality_supplier_template_versions")
      .insert({
        organization_id: A, template_id: t!.id, version_number: 2,
        scoring_rule: "weighted_average",
        bands: [{ min: 0, max: 100, label: "Único" }],
        change_note: "Se añade un criterio de sostenibilidad",
      }).select("id").single();
    assert(!ev && v2, `versión 2: ${ev?.message}`);
    await Q.from("quality_supplier_evaluation_criteria").insert({
      organization_id: A, version_id: v2!.id, code: "C4", label: "Sostenibilidad",
      weight: 3, max_points: 100, evaluation_method: "observation", position_order: 1,
    });
    const { error: ep } = await Q.rpc("quality_publish_supplier_template_version", {
      p_version_id: v2!.id, p_effective_from: HOY, p_change_note: "Nueva versión",
    });
    assert(!ep, `publicar v2: ${ep?.message}`);

    const { data: vieja } = await Q.from("quality_supplier_evaluations")
      .select("version_id, score").eq("id", EVAL_1).single();
    assert(vieja?.version_id === PLANTILLA_V1,
      "la evaluación pasada apunta ahora a la versión nueva");
    assert(Number(vieja?.score) === 92, "la puntuación pasada cambió al publicar otra versión");

    const { data: criterios } = await Q.from("quality_supplier_evaluation_criteria")
      .select("id").eq("organization_id", A).eq("version_id", PLANTILLA_V1);
    assert((criterios ?? []).length === 3,
      "los criterios de la versión con la que se evaluó cambiaron");
  });

  await check("D2. la versión anterior queda SUSTITUIDA, no borrada", async () => {
    const { data } = await Q.from("quality_supplier_template_versions")
      .select("version_number, status, effective_to").eq("organization_id", A)
      .eq("id", PLANTILLA_V1).single();
    assert(data?.status === "superseded", `la v1 quedó en «${data?.status}»`);
    assert(data?.effective_to !== null, "la v1 no tiene fin de vigencia");
  });

  // ==========================================================================
  console.log("\nE · Escenario 5 · criticidad no es desempeño (§71)");
  // ==========================================================================

  let SCOPE_CRITICO = "";

  await check("E1. la criticidad se clasifica con la metodología versionada", async () => {
    const { data: m, error: em } = await Q.from("quality_risk_methodologies").insert({
      organization_id: A, code: `CRIT-${stamp}`, name: "Criticidad de proveedores",
      applies_to: "supplier_criticality", approach: "qualitative",
    }).select("id").single();
    assert(!em && m, `metodología: ${em?.message}`);
    const { data: v, error: ev } = await Q.from("quality_risk_methodology_versions").insert({
      organization_id: A, methodology_id: m!.id, version_number: 1, aggregation: "sum",
    }).select("id").single();
    assert(!ev && v, `versión: ${ev?.message}`);

    const { data: dim, error: ed } = await Q.from("quality_risk_scales").insert({
      organization_id: A, version_id: v!.id, code: "IMP", label: "Impacto si falla",
      scale_kind: "dimension", position: 1, weight: 1,
    }).select("id").single();
    assert(!ed && dim, `dimensión: ${ed?.message}`);
    const niveles = [
      { value: 1, label: "Bajo", position: 1 },
      { value: 3, label: "Alto", position: 2 },
    ];
    const ids: string[] = [];
    for (const n of niveles) {
      const { data: l, error: el } = await Q.from("quality_risk_scale_levels").insert({
        organization_id: A, scale_id: dim!.id, value: n.value, label: n.label,
        position: n.position,
      }).select("id").single();
      assert(!el && l, `nivel ${n.label}: ${el?.message}`);
      ids.push(l!.id as string);
    }
    const { data: res, error: er } = await Q.from("quality_risk_scales").insert({
      organization_id: A, version_id: v!.id, code: "RES", label: "Criticidad",
      scale_kind: "result", position: 2, weight: 1,
    }).select("id").single();
    assert(!er && res, `escala de resultado: ${er?.message}`);
    for (const n of [
      { value: 1, label: "No crítico", min: 0, max: 2, review: 24, position: 1 },
      { value: 2, label: "Crítico", min: 3, max: 99, review: 6, position: 2 },
    ]) {
      const { error: el } = await Q.from("quality_risk_scale_levels").insert({
        organization_id: A, scale_id: res!.id, value: n.value, label: n.label,
        min_score: n.min, max_score: n.max, review_months: n.review, position: n.position,
      });
      assert(!el, `banda ${n.label}: ${el?.message}`);
    }
    const { error: ep } = await Q.rpc("quality_publish_methodology_version", {
      p_version_id: v!.id, p_effective_from: HACE_UN_ANIO, p_change_note: "Inicial",
    });
    assert(!ep, `publicar metodología: ${ep?.message}`);

    SCOPE_CRITICO = SCOPE_MATERIA;
    const { error: ea } = await Q.rpc("quality_assess_supplier_criticality", {
      p_scope_id: SCOPE_CRITICO, p_version_id: v!.id, p_level_ids: [ids[1]],
      p_rationale: "Único proveedor homologado del insumo principal.",
      p_assessed_on: HACE_MEDIO_ANIO,
    });
    assert(!ea, `clasificar: ${ea?.message}`);
  });

  await check("E2. la criticidad no depende de cómo lo ha hecho", async () => {
    const { data } = await Q.from("quality_supplier_criticality_assessments")
      .select("level_label, score, review_months").eq("organization_id", A)
      .eq("scope_id", SCOPE_CRITICO).single();
    assert(data?.level_label === "Crítico",
      `el alcance quedó como «${data?.level_label}» pese a la dimensión alta`);
    assert(Number(data?.review_months) === 6,
      "el nivel crítico no acortó la cadencia de revisión (GP-20)");
  });

  await check("E3. clasificar NO cambia la aprobación", async () => {
    const { data } = await Q.from("quality_supplier_approval_decisions")
      .select("id").eq("organization_id", A).eq("scope_id", SCOPE_CRITICO);
    assert((data ?? []).length === 1, "clasificar la criticidad produjo una decisión");
  });

  await check("E4. una clasificación no se edita: se sustituye clasificando otra vez", async () => {
    const { data: antes } = await Q.from("quality_supplier_criticality_assessments")
      .select("id, level_label").eq("organization_id", A).eq("scope_id", SCOPE_CRITICO).single();
    const { error } = await Q.from("quality_supplier_criticality_assessments")
      .update({ level_label: "No crítico" }).eq("id", antes!.id);
    const { data: despues } = await Q.from("quality_supplier_criticality_assessments")
      .select("level_label").eq("id", antes!.id).single();
    assert(error || despues?.level_label === "Crítico",
      "se reescribió una clasificación en el sitio");
  });

  // ==========================================================================
  console.log("\nF · Escenario 6 · la verdad histórica (§72)");
  // ==========================================================================

  await check("F1. qué estaba aprobado ANTES de decidir: nada, y no es «no aprobado»", async () => {
    const { data, error } = await Q.rpc("quality_supplier_approval_on", {
      p_organization_id: A, p_scope_id: SCOPE_MATERIA, p_on: HACE_UN_ANIO,
    });
    assert(!error, `leer aprobación: ${error?.message}`);
    assert((data ?? []).length === 0,
      "antes de la primera decisión ya había una aprobación");
  });

  await check("F2. qué estaba aprobado DESPUÉS de decidir", async () => {
    const { data } = await Q.rpc("quality_supplier_approval_on", {
      p_organization_id: A, p_scope_id: SCOPE_MATERIA, p_on: HOY,
    });
    assert((data ?? []).length === 1, "hoy no hay decisión vigente");
    assert(data[0].decision === "approved", `hoy consta «${data[0].decision}»`);
    assert(data[0].was_valid === true, "la decisión vigente no consta como válida");
  });

  await check("F3. la criticidad de una fecha es la que regía entonces", async () => {
    const { data: antes } = await Q.rpc("quality_supplier_criticality_on", {
      p_organization_id: A, p_scope_id: SCOPE_CRITICO, p_on: HACE_UN_ANIO,
    });
    assert((antes ?? []).length === 0, "había criticidad antes de clasificar");
    const { data: hoy } = await Q.rpc("quality_supplier_criticality_on", {
      p_organization_id: A, p_scope_id: SCOPE_CRITICO, p_on: HOY,
    });
    assert((hoy ?? []).length === 1 && hoy[0].level_label === "Crítico",
      "hoy no consta la clasificación");
  });

  await check("F4. subir hoy el listón NO vuelve incumplida una evaluación de ayer", async () => {
    const { data: req, error: er } = await Q.from("quality_supplier_requirements").insert({
      organization_id: A, title: `Certificado ISO ${stamp}`,
      requirement_kind: "certification", enforcement: "required",
    }).select("id").single();
    assert(!er && req, `requisito: ${er?.message}`);
    const { error: ea } = await Q.from("quality_supplier_requirement_assignments").insert({
      organization_id: A, requirement_id: req!.id, category_id: MATERIA,
      effective_from: HOY,
    });
    assert(!ea, `asignar requisito: ${ea?.message}`);

    const { data: entonces } = await Q.rpc("quality_supplier_requirements_on", {
      p_organization_id: A, p_scope_id: SCOPE_MATERIA, p_on: HACE_MEDIO_ANIO,
    });
    assert((entonces ?? []).length === 0,
      "el requisito de hoy aparece como exigible hace medio año");
    const { data: ahora } = await Q.rpc("quality_supplier_requirements_on", {
      p_organization_id: A, p_scope_id: SCOPE_MATERIA, p_on: HOY,
    });
    assert((ahora ?? []).length === 1, "el requisito de hoy no se exige hoy");
    assert(ahora[0].source === "category", "el requisito no consta como heredado de la categoría");
  });

  // ==========================================================================
  console.log("\nG · Escenario 7 · vencer no es suspender (§73, §74)");
  // ==========================================================================

  await check("G1. una reevaluación vencida avisa UNA vez, no dos", async () => {
    await Q.from("quality_supplier_profiles")
      .update({ next_review_on: AYER }).eq("id", ACME_PROFILE);
    const { error: e1 } = await Q.rpc("quality_scan_supplier_reviews", { p_organization_id: A });
    assert(!e1, `primer barrido: ${e1?.message}`);
    const { error: e2 } = await Q.rpc("quality_scan_supplier_reviews", { p_organization_id: A });
    assert(!e2, `segundo barrido: ${e2?.message}`);

    const { data: alertas } = await Q.from("work_alerts")
      .select("id").eq("organization_id", A).eq("alert_type", "supplier_reevaluation_overdue");
    assert((alertas ?? []).length === 1,
      `el barrido produjo ${(alertas ?? []).length} avisos de la misma revisión`);
    const { data: tareas } = await Q.from("work_tasks")
      .select("id").eq("organization_id", A).eq("task_type", "supplier_reevaluation_due");
    assert((tareas ?? []).length === 1,
      `el barrido produjo ${(tareas ?? []).length} tareas de la misma revisión`);
  });

  await check("G2. la revisión vencida NO cambió ninguna aprobación", async () => {
    const { data } = await Q.from("v_quality_supplier_scope_status")
      .select("is_approved_now").eq("organization_id", A).eq("scope_id", SCOPE_MATERIA).single();
    assert(data?.is_approved_now === true,
      "pasarse de la fecha de revisión suspendió al proveedor");
  });

  await check("G3. un certificado caducado se marca vencido y NO retira la aprobación", async () => {
    const { data: doc, error: ed } = await Q.from("quality_supplier_documents").insert({
      organization_id: A, profile_id: ACME_PROFILE, document_kind: "certification",
      title: `ISO 9001 ${stamp}`, expires_on: AYER, status: "valid",
    }).select("id").single();
    assert(!ed && doc, `documento: ${ed?.message}`);

    const { error } = await Q.rpc("quality_scan_supplier_reviews", { p_organization_id: A });
    assert(!error, `barrido: ${error?.message}`);

    const { data: despues } = await Q.from("quality_supplier_documents")
      .select("status").eq("id", doc!.id).single();
    assert(despues?.status === "expired", `el documento quedó en «${despues?.status}»`);

    const { data: alcance } = await Q.from("v_quality_supplier_scope_status")
      .select("is_approved_now, decision").eq("organization_id", A)
      .eq("scope_id", SCOPE_MATERIA).single();
    assert(alcance?.is_approved_now === true,
      "un certificado caducado retiró la aprobación del proveedor");
    assert(alcance?.decision === "approved", "la decisión cambió sola");
  });

  await check("G4. una aprobación con fecha pasada deja de contar como vigente", async () => {
    const { error } = await Q.rpc("quality_decide_supplier_approval", {
      p_scope_id: SCOPE_CALIB, p_decision: "approved",
      p_rationale: "Aprobación temporal mientras se completa la evaluación.",
      p_valid_until: AYER, p_effective_from: HACE_MEDIO_ANIO,
    });
    assert(!error, `decidir con caducidad: ${error?.message}`);
    const { data } = await Q.from("v_quality_supplier_scope_status")
      .select("is_approved_now, approval_expired").eq("organization_id", A)
      .eq("scope_id", SCOPE_CALIB).single();
    assert(data?.approval_expired === true, "la aprobación caducada no consta como caducada");
    assert(data?.is_approved_now === false,
      "una aprobación con fecha pasada sigue contando como vigente");
  });

  // ==========================================================================
  console.log("\nH · Escenario 8 · el incidente no es una no conformidad (§75)");
  // ==========================================================================

  let INCIDENTE = "";

  await check("H1. registrar un incidente no abre ninguna no conformidad", async () => {
    const { data, error } = await Q.from("quality_supplier_incidents").insert({
      organization_id: A, profile_id: ACME_PROFILE, incident_kind: "delivery",
      severity: "moderate", occurred_on: AYER,
      title: `Entrega incompleta ${stamp}`,
    }).select("id").single();
    assert(!error && data, `incidente: ${error?.message}`);
    INCIDENTE = data!.id as string;

    const { data: casos } = await Q.from("work_cases").select("id").eq("organization_id", A);
    assert((casos ?? []).length === 0, "registrar un incidente abrió un caso por su cuenta");
  });

  await check("H2. escalarlo abre un caso SIN clasificar, con la referencia al proveedor", async () => {
    const { data, error } = await Q.rpc("quality_open_case_from_supplier_incident", {
      p_incident_id: INCIDENTE,
    });
    assert(!error && data, `escalar: ${error?.message}`);
    const { data: caso } = await Q.from("work_cases")
      .select("id, case_type, status").eq("id", data as string).single();
    assert(caso, "el caso no se creó");
    assert(caso!.case_type !== "nonconformity",
      "el caso nació clasificado como no conformidad: eso lo decide una persona");
    const { data: refs } = await Q.from("work_references")
      .select("ref_kind, ref_id").eq("organization_id", A)
      .eq("owner_kind", "case").eq("owner_id", caso!.id);
    const kinds = (refs ?? []).map((r) => r.ref_kind);
    assert(kinds.includes("quality_supplier_profile"),
      "el caso no guarda la referencia al proveedor");
    assert(kinds.includes("quality_supplier_incident"),
      "el caso no guarda la referencia al incidente que lo originó");
  });

  // ==========================================================================
  console.log("\nI · Escenario 9 · suspender un alcance no toca los demás (§76)");
  // ==========================================================================

  await check("I1. la suspensión afecta SOLO al alcance suspendido", async () => {
    const { error } = await Q.rpc("quality_decide_supplier_approval", {
      p_scope_id: SCOPE_CALIB, p_decision: "suspended",
      p_rationale: "Incidente reiterado en el servicio de calibración.",
    });
    assert(!error, `suspender: ${error?.message}`);
    const { data } = await Q.from("v_quality_supplier_scope_status")
      .select("scope_id, decision, is_approved_now").eq("organization_id", A)
      .in("scope_id", [SCOPE_MATERIA, SCOPE_CALIB]);
    const calib = (data ?? []).find((x) => x.scope_id === SCOPE_CALIB);
    const materia = (data ?? []).find((x) => x.scope_id === SCOPE_MATERIA);
    assert(calib?.decision === "suspended", "el alcance no quedó suspendido");
    assert(materia?.is_approved_now === true,
      "suspender un alcance suspendió al proveedor entero");
  });

  await check("I2. la decisión anterior se conserva como SUSTITUIDA", async () => {
    const { data } = await Q.from("quality_supplier_approval_decisions")
      .select("id, decision, superseded_by").eq("organization_id", A).eq("scope_id", SCOPE_CALIB)
      .order("effective_from", { ascending: true });
    assert((data ?? []).length === 2, `hay ${(data ?? []).length} decisiones, se esperaban 2`);
    assert(data![0].superseded_by !== null, "la decisión anterior no quedó marcada como sustituida");
    assert(data![1].superseded_by === null, "la decisión vigente aparece como sustituida");
  });

  await check("I3. una decisión formal no se edita", async () => {
    const { data: d } = await Q.from("quality_supplier_approval_decisions")
      .select("id, rationale").eq("organization_id", A).eq("scope_id", SCOPE_CALIB)
      .order("effective_from", { ascending: false }).limit(1).single();
    const { error } = await Q.from("quality_supplier_approval_decisions")
      .update({ rationale: "Otra cosa" }).eq("id", d!.id);
    const { data: despues } = await Q.from("quality_supplier_approval_decisions")
      .select("rationale").eq("id", d!.id).single();
    assert(error || despues?.rationale === d!.rationale,
      "se reescribió el fundamento de una decisión formal");
  });

  // ==========================================================================
  console.log("\nJ · Escenario 10 · el consultor acompaña, no homologa (§77)");
  // ==========================================================================

  await check("J1. el consultor SÍ puede registrar y evaluar", async () => {
    const { data, error } = await C.from("quality_supplier_incidents").insert({
      organization_id: A, profile_id: ACME_PROFILE, incident_kind: "quality",
      severity: "minor", occurred_on: AYER, title: `Observación ${stamp}`,
    }).select("id").single();
    assert(!error && data, `el consultor no pudo registrar un incidente: ${error?.message}`);
  });

  await check("J2. el consultor NO puede decidir la aprobación", async () => {
    const { error } = await C.rpc("quality_decide_supplier_approval", {
      p_scope_id: SCOPE_CALIB, p_decision: "reinstated",
      p_rationale: "El consultor considera que ya está resuelto.",
    });
    assert(error, "un consultor externo homologó un proveedor de su cliente");
  });

  await check("J3. tampoco por la puerta de atrás, escribiendo en la tabla", async () => {
    const { error } = await C.from("quality_supplier_approval_decisions").insert({
      organization_id: A, scope_id: SCOPE_CALIB, decision: "approved",
      rationale: "Insertado directamente.", effective_from: HOY,
    });
    assert(error, "se pudo insertar una decisión de aprobación saltándose la RPC");
  });

  // ==========================================================================
  console.log("\nK · Escenario 11 · retirar conserva; borrar solo sin historia (§78)");
  // ==========================================================================

  await check("K1. un proveedor CON historia no se puede eliminar", async () => {
    // La puerta pública es la misma que para todo lo demás: una sola RPC de
    // ciclo de vida. La función del dominio está revocada a `authenticated`
    // justamente para que no haya dos caminos con dos respuestas.
    const { data, error } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "supplier", p_id: ACME_PROFILE,
    });
    assert(!error && data, `dictamen: ${error?.message}`);
    const v = data as Record<string, unknown>;
    assert(v.can_hard_delete === false, "un proveedor con evaluaciones se declara desechable");
    assert(Array.isArray(v.blocking) && (v.blocking as unknown[]).length > 0,
      "el dictamen no dice qué lo impide");
  });

  await check("K2. y la base lo impide de verdad, no solo el dictamen", async () => {
    const { error } = await Q.from("quality_supplier_profiles").delete().eq("id", ACME_PROFILE);
    const { data } = await Q.from("quality_supplier_profiles")
      .select("id").eq("id", ACME_PROFILE).maybeSingle();
    assert(error || data, "se borró un proveedor con historia");
  });

  await check("K3. retirar conserva sus evaluaciones y sus decisiones", async () => {
    const { error } = await Q.from("quality_supplier_profiles")
      .update({ relationship_status: "retired" }).eq("id", ACME_PROFILE);
    assert(!error, `retirar: ${error?.message}`);
    const { data: evs } = await Q.from("quality_supplier_evaluations")
      .select("id").eq("organization_id", A).eq("scope_id", SCOPE_MATERIA);
    assert((evs ?? []).length >= 1, "retirar borró las evaluaciones");
    const { data: dec } = await Q.from("quality_supplier_approval_decisions")
      .select("id").eq("organization_id", A);
    assert((dec ?? []).length >= 3, "retirar borró las decisiones");
  });

  await check("K4. retirar en Quality NO borra el proveedor de PCR ni de Textiles", async () => {
    const { data: cpr } = await Q.from("suppliers").select("id").eq("id", cprSup!.id).maybeSingle();
    const { data: tex } = await Q.from("textile_suppliers")
      .select("id").eq("id", texSup!.id).maybeSingle();
    assert(cpr, "retirar en Quality borró el proveedor de PCR");
    assert(tex, "retirar en Quality borró el proveedor textil");
  });

  await check("K5. un proveedor SIN historia sí se puede eliminar", async () => {
    const { profileId } = await newSupplier(Q, A, `Efímero ${stamp}`, null);
    const { data } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "supplier", p_id: profileId,
    });
    assert((data as Record<string, unknown>).can_hard_delete === true,
      "un proveedor recién creado no se puede eliminar");
    const { error } = await Q.from("quality_supplier_profiles").delete().eq("id", profileId);
    assert(!error, `eliminar: ${error?.message}`);
  });

  // ==========================================================================
  console.log("\nL · Escenario 12 · lo de otra empresa no existe (§50, §83)");
  // ==========================================================================

  await check("L1. otra empresa no ve ni un proveedor, aunque tenga el UUID", async () => {
    const { data } = await O.from("quality_supplier_profiles").select("id").eq("id", ACME_PROFILE);
    assert((data ?? []).length === 0, "una empresa ajena leyó un proveedor");
    const { data: partes } = await O.from("quality_external_parties")
      .select("id").eq("organization_id", A);
    assert((partes ?? []).length === 0, "una empresa ajena leyó las identidades externas");
  });

  await check("L2. las vistas tampoco filtran de más", async () => {
    for (const v of ["v_quality_supplier_overview", "v_quality_supplier_scope_status",
                     "v_quality_approved_supplier_list"]) {
      const { data } = await O.from(v).select("organization_id").eq("organization_id", A);
      assert((data ?? []).length === 0, `${v} entregó filas de otra empresa`);
    }
  });

  await check("L3. las funciones históricas NO son un túnel bajo RLS (§54)", async () => {
    for (const [fn, args] of [
      ["quality_supplier_approval_on", { p_organization_id: A, p_scope_id: SCOPE_MATERIA, p_on: HOY }],
      ["quality_supplier_criticality_on", { p_organization_id: A, p_scope_id: SCOPE_CRITICO, p_on: HOY }],
      ["quality_supplier_requirements_on", { p_organization_id: A, p_scope_id: SCOPE_MATERIA, p_on: HOY }],
    ] as const) {
      const { data, error } = await O.rpc(fn, args as Record<string, unknown>);
      assert(error || (data ?? []).length === 0,
        `${fn} entregó datos de otra empresa a quien no es miembro`);
    }
  });

  await check("L4. el barrido de otra empresa se rechaza", async () => {
    const { error } = await O.rpc("quality_scan_supplier_reviews", { p_organization_id: A });
    assert(error, "una empresa ajena pudo lanzar el barrido de otra");
  });

  await check("L5. el dictamen de eliminación tampoco filtra", async () => {
    const { data, error } = await O.rpc("quality_deletion_eligibility", {
      p_entity: "supplier", p_id: ACME_PROFILE,
    });
    const v = (data ?? {}) as Record<string, unknown>;
    assert(error || v.reason_code === "not_found",
      "el dictamen contó lo que hay dentro de un proveedor ajeno");
  });

  await check("L6. escribir en la empresa ajena tampoco funciona", async () => {
    const { error } = await O.from("quality_supplier_incidents").insert({
      organization_id: A, profile_id: ACME_PROFILE, incident_kind: "other",
      severity: "minor", occurred_on: HOY, title: "Inyectado",
    });
    assert(error, "una empresa ajena escribió un incidente en otra");
  });

  await check("L7. adoptar un proveedor ajeno se rechaza", async () => {
    const { error } = await O.rpc("quality_adopt_supplier", {
      p_source_module: "cpr", p_source_id: cprSup!.id,
    });
    assert(error, "una empresa ajena incorporó el proveedor de otra");
  });

  // --------------------------------------------------------------------------
  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nLa suite se detuvo:", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
