/**
 * Trazaloop · QUALITY-08 · Voz del cliente, contra base real.
 *
 * Los catorce escenarios del encargo (§76…§89). Lo que se comprueba aquí no es
 * un CRUD: son las afirmaciones que SOLO se demuestran ejecutándolas.
 *
 *   · publicar la v2 no toca una sola respuesta de la v1;
 *   · dos campañas del mismo instrumento no se pisan;
 *   · el NPS de 10, 9, 8 y 6 es 25 —y no un promedio—;
 *   · cero respuestas no produce cero satisfacción;
 *   · «no aplica» sale del cálculo en vez de contar como cero;
 *   · en una campaña anónima NO hay forma de saber quién respondió — ni por
 *     columna, ni por join, ni por RPC, ni por auditoría;
 *   · un enlace de un solo uso no se puede reutilizar;
 *   · registrar una queja deja el recuento de no conformidades EXACTAMENTE
 *     igual, y abrir el caso tampoco lo mueve;
 *   · una satisfacción que cae produce una señal y cero riesgos;
 *   · una serie con escalas distintas se parte;
 *   · la ficha del cliente no atribuye lo anónimo;
 *   · una encuesta con respuestas no se borra;
 *   · y la puerta pública falla cerrada ante todo.
 *
 * Todo corre con la sesión REAL de cada usuario, y la parte pública con el
 * cliente ANÓNIMO. El cliente administrativo solo crea cuentas y membresías.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality08-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
/** El cliente PÚBLICO: sin sesión, exactamente como el de quien responde. */
const publico = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(label: string, name: string) {
  const email = `q08-${label}-${stamp}@test.trazaloop.dev`;
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
const AYER = day(-1);
const EN_UN_MES = day(30);

/** Crea una encuesta con sus preguntas y la publica. */
async function newSurvey(
  c: SupabaseClient, org: string, name: string,
  preguntas: {
    key: string; label: string; type: string; required?: boolean;
    na?: boolean; min?: number | null; max?: number | null;
    options?: { key: string; label: string }[] | null;
  }[],
  desde: string
) {
  const { data: s, error: es } = await c.from("quality_surveys")
    .insert({ organization_id: org, name }).select("id").single();
  assert(!es && s, `encuesta «${name}»: ${es?.message}`);
  const { data: v, error: ev } = await c.from("quality_survey_versions")
    .insert({ organization_id: org, survey_id: s!.id, version_number: 1,
              intro_text: "Cuéntanos cómo lo hicimos." })
    .select("id").single();
  assert(!ev && v, `versión de «${name}»: ${ev?.message}`);
  await addQuestions(c, org, v!.id as string, preguntas);
  const { error: ep } = await c.rpc("quality_publish_survey_version", {
    p_version_id: v!.id, p_effective_from: desde, p_change_note: "Versión inicial",
  });
  assert(!ep, `publicar «${name}»: ${ep?.message}`);
  return { surveyId: s!.id as string, versionId: v!.id as string };
}

async function addQuestions(
  c: SupabaseClient, org: string, versionId: string,
  preguntas: {
    key: string; label: string; type: string; required?: boolean;
    na?: boolean; min?: number | null; max?: number | null;
    options?: { key: string; label: string }[] | null;
  }[]
) {
  let orden = 1;
  for (const q of preguntas) {
    const { error } = await c.from("quality_survey_questions").insert({
      organization_id: org, version_id: versionId, stable_key: q.key,
      label: q.label, question_type: q.type,
      is_required: q.required ?? false, allows_not_applicable: q.na ?? false,
      scale_min: q.min ?? null, scale_max: q.max ?? null,
      options: q.options ?? null, position_order: orden++,
    });
    assert(!error, `pregunta ${q.key}: ${error?.message}`);
  }
}

async function newCampaign(
  c: SupabaseClient, org: string,
  input: { surveyId: string; versionId: string; name: string; anonymity: string;
           period?: string; population?: number | null; closesOn?: string | null }
) {
  const { data, error } = await c.from("quality_survey_campaigns").insert({
    organization_id: org, survey_id: input.surveyId, version_id: input.versionId,
    name: input.name, anonymity_mode: input.anonymity,
    period_label: input.period ?? null, period_start: HACE_UN_ANIO, period_end: HOY,
    population_size: input.population ?? null,
    closes_on: input.closesOn ?? EN_UN_MES,
  }).select("id").single();
  assert(!error && data, `campaña «${input.name}»: ${error?.message}`);
  const { error: eo } = await c.rpc("quality_open_survey_campaign", { p_campaign_id: data!.id });
  assert(!eo, `abrir «${input.name}»: ${eo?.message}`);
  return data!.id as string;
}

async function issue(c: SupabaseClient, campaignId: string, customerId: string | null) {
  const { data, error } = await c.rpc("quality_issue_survey_invitation", {
    p_campaign_id: campaignId, p_customer_id: customerId,
    p_contact_id: null, p_email: null, p_expires_at: null,
  });
  assert(!error && data, `emitir enlace: ${error?.message}`);
  return (data as Record<string, unknown>).token as string;
}

async function questionsOf(c: SupabaseClient, org: string, versionId: string) {
  const { data } = await c.from("quality_survey_questions")
    .select("id, stable_key").eq("organization_id", org).eq("version_id", versionId)
    .order("position_order");
  return (data ?? []) as { id: string; stable_key: string }[];
}

async function main() {
  console.log("\nQUALITY-08 · base real\n");

  const owner = await newUser("adm", "Directora");
  const quality = await newUser("cal", "Coordinadora de Calidad");
  const consultant = await newUser("con", "Consultor externo");
  const outsider = await newUser("out", "Ajena");
  for (const u of [owner, quality, consultant, outsider]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q08" });
  }
  const { data: a } = await owner.client.rpc("create_organization", { p_name: `Q08 A ${stamp}` });
  const { data: b } = await outsider.client.rpc("create_organization", { p_name: `Q08 B ${stamp}` });
  const A = a as string, B = b as string;

  await admin.from("memberships").insert([
    { organization_id: A, user_id: quality.id, role_code: "quality", status: "active" },
    { organization_id: A, user_id: consultant.id, role_code: "consultant", status: "active" },
  ]);

  const Q = quality.client;    // administra y cierra
  const C = consultant.client; // acompaña, NO cierra el periodo
  const O = outsider.client;   // otra empresa

  // ==========================================================================
  console.log("A · Escenario 0 · el cliente es un PAPEL de la empresa externa (VC-03)");
  // ==========================================================================

  let ACME_PARTY = "", ACME_CUSTOMER = "";

  await check("A1. una empresa externa recibe el papel de cliente", async () => {
    const { data: party, error: ep } = await Q.from("quality_external_parties").insert({
      organization_id: A, legal_name: `ACME ${stamp}`, tax_id: `NIT-${stamp}`,
    }).select("id").single();
    assert(!ep && party, `empresa externa: ${ep?.message}`);
    ACME_PARTY = party!.id as string;

    const { error: er } = await Q.from("quality_external_party_roles").insert({
      organization_id: A, party_id: ACME_PARTY, role_code: "customer",
    });
    assert(!er, `papel de cliente: ${er?.message}`);

    const { data: profile, error: epr } = await Q.from("quality_customer_profiles").insert({
      organization_id: A, party_id: ACME_PARTY, segment: "Institucional",
    }).select("id").single();
    assert(!epr && profile, `perfil de cliente: ${epr?.message}`);
    ACME_CUSTOMER = profile!.id as string;
  });

  await check("A2. la MISMA empresa puede ser además proveedor, con una sola identidad", async () => {
    const { error: er } = await Q.from("quality_external_party_roles").insert({
      organization_id: A, party_id: ACME_PARTY, role_code: "supplier",
    });
    assert(!er, `papel de proveedor: ${er?.message}`);
    const { error: es } = await Q.from("quality_supplier_profiles").insert({
      organization_id: A, party_id: ACME_PARTY, relationship_status: "active",
    });
    assert(!es, `perfil de proveedor: ${es?.message}`);

    const { data: parties } = await Q.from("quality_external_parties")
      .select("id").eq("organization_id", A).eq("tax_id", `NIT-${stamp}`);
    assert((parties ?? []).length === 1,
      `hay ${(parties ?? []).length} identidades para la misma empresa`);

    const { data: overview } = await Q.from("v_quality_customer_overview")
      .select("is_also_supplier").eq("organization_id", A).eq("profile_id", ACME_CUSTOMER).single();
    assert(overview?.is_also_supplier === true,
      "la ficha del cliente no sabe que la misma empresa es también proveedor");
  });

  await check("A3. un segundo perfil de cliente para la misma empresa se rechaza", async () => {
    const { error } = await Q.from("quality_customer_profiles").insert({
      organization_id: A, party_id: ACME_PARTY,
    });
    assert(error, "se pudo duplicar la relación de cliente sobre la misma empresa");
  });

  // ==========================================================================
  console.log("\nB · Escenario 1 · la encuesta se versiona (§76)");
  // ==========================================================================

  const { surveyId: ENCUESTA, versionId: V1 } = await newSurvey(Q, A, `Satisfacción ${stamp}`, [
    { key: "sat.global", label: "¿Cómo calificas nuestro servicio?", type: "scale", min: 1, max: 5, required: true },
    { key: "entrega.puntualidad", label: "¿Llegó a tiempo?", type: "yes_no" },
    { key: "soporte.calidad", label: "¿Cómo fue el soporte?", type: "scale", min: 1, max: 5, na: true },
  ], HACE_UN_ANIO);

  const CAMP_V1 = await newCampaign(Q, A, {
    surveyId: ENCUESTA, versionId: V1, name: `Clientes 2027-Q1 ${stamp}`,
    anonymity: "identified", period: "2027-Q1", population: 4,
  });

  await check("B1. una respuesta identificada entra por el enlace público", async () => {
    const token = await issue(Q, CAMP_V1, ACME_CUSTOMER);
    const qs = await questionsOf(Q, A, V1);
    const { data, error } = await publico.rpc("quality_submit_survey_response", {
      p_token: token,
      p_answers: [
        { question_id: qs[0].id, outcome: "answered", value_numeric: 5 },
        { question_id: qs[1].id, outcome: "answered", value_numeric: 1 },
        { question_id: qs[2].id, outcome: "not_applicable" },
      ],
    });
    assert(!error, `enviar: ${error?.message}`);
    assert((data as Record<string, unknown>)?.ok === true, "el envío no se aceptó");

    const { data: r } = await Q.from("quality_survey_responses")
      .select("id, customer_id, status").eq("organization_id", A).eq("campaign_id", CAMP_V1);
    assert((r ?? []).length === 1, "la respuesta no quedó registrada");
    assert(r![0].status === "submitted", "la respuesta quedó sin enviar");
    assert(r![0].customer_id === ACME_CUSTOMER,
      "una campaña IDENTIFICADA perdió el cliente de quien respondió");
  });

  let V2 = "";

  await check("B2. publicar la v2 no toca ni una respuesta de la v1", async () => {
    const { data: v, error: ev } = await Q.from("quality_survey_versions").insert({
      organization_id: A, survey_id: ENCUESTA, version_number: 2,
      change_note: "Se cambia la escala a 0–10 para poder calcular NPS",
    }).select("id").single();
    assert(!ev && v, `versión 2: ${ev?.message}`);
    V2 = v!.id as string;

    await addQuestions(Q, A, V2, [
      { key: "sat.global", label: "¿Nos recomendarías?", type: "scale", min: 0, max: 10, required: true },
      { key: "comentario", label: "¿Algo más que quieras contarnos?", type: "long_text" },
    ]);
    const { error: ep } = await Q.rpc("quality_publish_survey_version", {
      p_version_id: V2, p_effective_from: HOY, p_change_note: "Escala 0–10",
    });
    assert(!ep, `publicar v2: ${ep?.message}`);

    const { data: qs1 } = await Q.from("quality_survey_questions")
      .select("id, scale_max").eq("organization_id", A).eq("version_id", V1);
    assert((qs1 ?? []).length === 3, "las preguntas de la v1 cambiaron");
    assert((qs1 ?? []).every((q) => q.scale_max === null || Number(q.scale_max) === 5),
      "la escala de la v1 se movió al publicar la v2");

    const { data: r } = await Q.from("quality_survey_responses")
      .select("version_id").eq("organization_id", A).eq("campaign_id", CAMP_V1).single();
    assert(r?.version_id === V1, "la respuesta de la v1 apunta ahora a la v2");
  });

  await check("B3. la v1 queda SUSTITUIDA, no borrada, y con fin de vigencia", async () => {
    const { data } = await Q.from("quality_survey_versions")
      .select("status, effective_to").eq("organization_id", A).eq("id", V1).single();
    assert(data?.status === "superseded", `la v1 quedó en «${data?.status}»`);
    assert(data?.effective_to !== null, "la v1 no tiene fin de vigencia");
  });

  await check("B4. una versión publicada no se puede editar", async () => {
    const { error } = await Q.from("quality_survey_questions").insert({
      organization_id: A, version_id: V1, stable_key: "colada", label: "Colada",
      question_type: "text", position_order: 9,
    });
    assert(error, "se pudo añadir una pregunta a una versión publicada");
  });

  await check("B5. y la verdad histórica responde con la versión de cada fecha", async () => {
    const { data: antes } = await Q.rpc("quality_survey_version_on", {
      p_organization_id: A, p_survey_id: ENCUESTA, p_on: AYER,
    });
    assert((antes ?? []).length === 1 && antes[0].version_id === V1,
      "ayer no regía la v1");
    const { data: hoy } = await Q.rpc("quality_survey_version_on", {
      p_organization_id: A, p_survey_id: ENCUESTA, p_on: HOY,
    });
    assert((hoy ?? []).length === 1 && hoy[0].version_id === V2, "hoy no rige la v2");
  });

  // ==========================================================================
  console.log("\nC · Escenario 2 · dos campañas del mismo instrumento (§77)");
  // ==========================================================================

  let CAMP_Q2 = "";

  await check("C1. una segunda campaña usa la misma versión sin tocar la primera", async () => {
    CAMP_Q2 = await newCampaign(Q, A, {
      surveyId: ENCUESTA, versionId: V2, name: `Clientes 2027-Q2 ${stamp}`,
      anonymity: "identified", period: "2027-Q2", population: 4,
    });
    const { data } = await Q.from("v_quality_campaign_summary")
      .select("campaign_id, responses_count").eq("organization_id", A)
      .in("campaign_id", [CAMP_V1, CAMP_Q2]);
    const q1 = (data ?? []).find((x) => x.campaign_id === CAMP_V1);
    const q2 = (data ?? []).find((x) => x.campaign_id === CAMP_Q2);
    assert(Number(q1?.responses_count) === 1, "la campaña anterior perdió su respuesta");
    assert(Number(q2?.responses_count) === 0, "la campaña nueva nació con respuestas");
  });

  await check("C2. cerrar una campaña no reabre ni cierra la otra", async () => {
    const { error } = await Q.rpc("quality_close_survey_campaign", {
      p_campaign_id: CAMP_V1, p_note: "Cierre del trimestre.",
    });
    assert(!error, `cerrar: ${error?.message}`);
    const { data } = await Q.from("quality_survey_campaigns")
      .select("id, status").eq("organization_id", A).in("id", [CAMP_V1, CAMP_Q2]);
    assert((data ?? []).find((x) => x.id === CAMP_V1)?.status === "closed",
      "la campaña no quedó cerrada");
    assert((data ?? []).find((x) => x.id === CAMP_Q2)?.status === "open",
      "cerrar una campaña cerró la otra");
  });

  await check("C3. los enlaces sin usar de una campaña cerrada dejan de servir", async () => {
    const { data } = await Q.from("quality_survey_invitations")
      .select("status").eq("organization_id", A).eq("campaign_id", CAMP_V1);
    assert((data ?? []).every((i) => i.status !== "pending"),
      "quedó un enlace vivo en una campaña cerrada");
  });

  await check("C4. reabrir exige un motivo y queda registrado", async () => {
    const { error: sinMotivo } = await Q.rpc("quality_reopen_survey_campaign", {
      p_campaign_id: CAMP_V1, p_reason: "   ",
    });
    assert(sinMotivo, "se pudo reabrir sin explicar por qué");

    const { error } = await Q.rpc("quality_reopen_survey_campaign", {
      p_campaign_id: CAMP_V1, p_reason: "Faltaba responder un cliente clave.",
    });
    assert(!error, `reabrir: ${error?.message}`);
    const { data } = await Q.from("quality_survey_campaigns")
      .select("status, reopen_count, reopen_reason").eq("id", CAMP_V1).single();
    assert(data?.status === "open", "la campaña no se reabrió");
    assert(Number(data?.reopen_count) === 1, "no quedó constancia de la reapertura");
    assert((data?.reopen_reason ?? "").length > 5, "el motivo no se guardó");

    await Q.rpc("quality_close_survey_campaign", { p_campaign_id: CAMP_V1, p_note: null });
  });

  // ==========================================================================
  console.log("\nD · Escenario 3 · NPS (§78)");
  // ==========================================================================

  await check("D1. §14 · no se puede declarar un NPS con una escala que no es 0–10", async () => {
    const { error } = await Q.from("quality_customer_metric_definitions").insert({
      organization_id: A, name: `NPS falso ${stamp}`, method: "nps",
      question_stable_key: "sat.global", expects_scale_min: 1, expects_scale_max: 5,
    });
    assert(error, "se declaró un NPS sobre una escala 1–5");
  });

  await check("D2. 10, 9, 8 y 6 dan un NPS de 25", async () => {
    const { error: ed } = await Q.from("quality_customer_metric_definitions").insert({
      organization_id: A, name: `NPS ${stamp}`, code: `NPS-${stamp}`, method: "nps",
      question_stable_key: "sat.global", expects_scale_min: 0, expects_scale_max: 10,
      unit: "score",
    });
    assert(!ed, `métrica NPS: ${ed?.message}`);

    const qs = await questionsOf(Q, A, V2);
    const nps = qs.find((q) => q.stable_key === "sat.global")!;
    for (const valor of [10, 9, 8, 6]) {
      const token = await issue(Q, CAMP_Q2, ACME_CUSTOMER);
      const { error } = await publico.rpc("quality_submit_survey_response", {
        p_token: token,
        p_answers: [{ question_id: nps.id, outcome: "answered", value_numeric: valor }],
      });
      assert(!error, `enviar ${valor}: ${error?.message}`);
    }

    await Q.rpc("quality_close_survey_campaign", { p_campaign_id: CAMP_Q2, p_note: null });
    const { error: ec } = await Q.rpc("quality_compute_campaign_metrics", {
      p_campaign_id: CAMP_Q2,
    });
    assert(!ec, `calcular: ${ec?.message}`);

    const { data } = await Q.from("v_quality_metric_series")
      .select("value, sample_size, method").eq("organization_id", A)
      .eq("campaign_id", CAMP_Q2).eq("method", "nps").single();
    assert(Number(data?.sample_size) === 4, `se contaron ${data?.sample_size} respuestas`);
    assert(Number(data?.value) === 25,
      `el NPS dio ${data?.value} en vez de 25 (2 promotores, 1 pasivo, 1 detractor)`);
  });

  await check("D3. calcular métricas NO decide nada", async () => {
    const { data: casos } = await Q.from("work_cases").select("id").eq("organization_id", A);
    assert((casos ?? []).length === 0, "calcular métricas abrió un caso");
    const { data: riesgos } = await Q.from("quality_risks").select("id").eq("organization_id", A);
    assert((riesgos ?? []).length === 0, "calcular métricas creó un riesgo");
  });

  await check("D4. un resultado calculado no se puede reescribir", async () => {
    const { data: r } = await Q.from("quality_customer_metric_results")
      .select("id, value").eq("organization_id", A).eq("campaign_id", CAMP_Q2).limit(1).single();
    const { error } = await Q.from("quality_customer_metric_results")
      .update({ value: 100 }).eq("id", r!.id);
    const { data: despues } = await Q.from("quality_customer_metric_results")
      .select("value").eq("id", r!.id).single();
    assert(error || Number(despues?.value) === Number(r!.value),
      "se reescribió un resultado calculado");
  });

  // ==========================================================================
  console.log("\nE · Escenarios 4 y 5 · cero respuestas y «no aplica» (§79, §80)");
  // ==========================================================================

  await check("E1. §79 · una campaña sin respuestas NO produce cero satisfacción", async () => {
    const vacia = await newCampaign(Q, A, {
      surveyId: ENCUESTA, versionId: V2, name: `Sin respuestas ${stamp}`,
      anonymity: "identified", period: "2027-Q3", population: 10,
    });
    await Q.rpc("quality_close_survey_campaign", { p_campaign_id: vacia, p_note: null });
    await Q.rpc("quality_compute_campaign_metrics", { p_campaign_id: vacia });

    const { data } = await Q.from("v_quality_metric_series")
      .select("value, sample_size").eq("organization_id", A)
      .eq("campaign_id", vacia).eq("method", "nps").single();
    assert(Number(data?.sample_size) === 0, "se contaron respuestas donde no hubo ninguna");
    assert(data?.value === null, `sin respuestas el resultado fue ${data?.value} en vez de nulo`);

    const { data: resumen } = await Q.from("v_quality_campaign_summary")
      .select("responses_count, response_rate").eq("campaign_id", vacia).single();
    assert(Number(resumen?.responses_count) === 0, "el recuento no es cero");
    assert(Number(resumen?.response_rate) === 0,
      "con población declarada la tasa de respuesta de cero respuestas debe ser 0 %");
  });

  await check("E2. §38 · sin población declarada NO hay tasa de respuesta", async () => {
    const abierta = await newCampaign(Q, A, {
      surveyId: ENCUESTA, versionId: V2, name: `Abierta ${stamp}`,
      anonymity: "identified", period: "2027-Q4", population: null,
    });
    const { data } = await Q.from("v_quality_campaign_summary")
      .select("responses_count, response_rate, response_rate_basis")
      .eq("campaign_id", abierta).single();
    assert(Number(data?.responses_count) === 0, "el recuento no es cero");
    assert(data?.response_rate === null,
      `se fabricó una tasa de ${data?.response_rate} sin denominador`);
    assert(data?.response_rate_basis === null, "se declaró una base que no existe");
  });

  await check("E3. §80 · «no aplica» NO admite valor y no entra en el cálculo", async () => {
    // La campaña de la v1 tenía una pregunta con «no aplica» permitido, y la
    // respuesta de B1 la usó. Su promedio no puede haberse hundido.
    const { data: resp } = await Q.from("quality_survey_responses")
      .select("id").eq("organization_id", A).eq("campaign_id", CAMP_V1).single();
    const qs = await questionsOf(Q, A, V1);
    const soporte = qs.find((q) => q.stable_key === "soporte.calidad")!;

    const { data: ans } = await Q.from("quality_survey_answers")
      .select("outcome, value_numeric").eq("organization_id", A)
      .eq("response_id", resp!.id).eq("question_id", soporte.id).single();
    assert(ans?.outcome === "not_applicable", `el desenlace fue «${ans?.outcome}»`);
    assert(ans?.value_numeric === null, "un «no aplica» se guardó con un valor");

    // Y la base rechaza escribirlo con puntos, venga por donde venga.
    const { error } = await Q.from("quality_survey_answers").insert({
      organization_id: A, response_id: resp!.id, question_id: soporte.id,
      outcome: "not_applicable", value_numeric: 0,
    });
    assert(error, "se pudo guardar un «no aplica» con un cero pegado");
  });

  // ==========================================================================
  console.log("\nF · Escenario 6 · ANONIMATO REAL (§81, §100)");
  // ==========================================================================

  let CAMP_ANON = "";
  let INVITACION_ANON = "";

  await check("F1. se emite un enlace de una campaña anónima y se responde", async () => {
    CAMP_ANON = await newCampaign(Q, A, {
      surveyId: ENCUESTA, versionId: V2, name: `Anónima ${stamp}`,
      anonymity: "anonymous", period: "2027-anon", population: 5,
    });
    const qs = await questionsOf(Q, A, V2);
    const nps = qs.find((q) => q.stable_key === "sat.global")!;
    const comentario = qs.find((q) => q.stable_key === "comentario")!;

    // Tres respuestas: por encima del umbral de reidentificación.
    for (const valor of [9, 7, 3]) {
      const token = await issue(Q, CAMP_ANON, ACME_CUSTOMER);
      const { data, error } = await publico.rpc("quality_submit_survey_response", {
        p_token: token,
        p_answers: [
          { question_id: nps.id, outcome: "answered", value_numeric: valor },
          { question_id: comentario.id, outcome: "answered",
            value_text: `Comentario libre ${valor}` },
        ],
      });
      assert(!error, `enviar ${valor}: ${error?.message}`);
      assert((data as Record<string, unknown>)?.ok === true, "el envío no se aceptó");
    }

    const { data: inv } = await Q.from("quality_survey_invitations")
      .select("id, customer_id, status").eq("organization_id", A)
      .eq("campaign_id", CAMP_ANON).limit(1).single();
    INVITACION_ANON = inv!.id as string;
    assert(inv?.customer_id === ACME_CUSTOMER,
      "la invitación perdió a quién se invitó: sin eso no se puede saber a cuántos se preguntó");
    assert(inv?.status === "used", "la invitación no se marcó como usada");
  });

  await check("F2. NINGUNA respuesta anónima lleva identidad, en NINGUNA columna", async () => {
    const { data } = await Q.from("quality_survey_responses")
      .select("*").eq("organization_id", A).eq("campaign_id", CAMP_ANON);
    assert((data ?? []).length === 3, `hay ${(data ?? []).length} respuestas, se esperaban 3`);
    for (const r of data ?? []) {
      for (const campo of ["customer_id", "contact_id", "respondent_name",
                           "respondent_email", "invitation_id"]) {
        assert((r as Record<string, unknown>)[campo] === null,
          `una respuesta anónima guarda ${campo}`);
      }
      assert(r.respondent_kind === "anonymous",
        `una respuesta anónima consta como «${r.respondent_kind}»`);
      // Y no existe ninguna columna de autor.
      assert(!("created_by" in (r as Record<string, unknown>)),
        "la respuesta tiene columna de autor");
    }
  });

  await check("F3. NADIE puede ponerle identidad a una respuesta anónima", async () => {
    const { data: r } = await Q.from("quality_survey_responses")
      .select("id").eq("organization_id", A).eq("campaign_id", CAMP_ANON).limit(1).single();
    assert(r, "no se encontró ninguna respuesta anónima");

    // La sesión con el rol más alto del dominio. Y no hay otra puerta: la clave
    // de servicio tampoco tiene privilegios sobre esta tabla —se revocaron a
    // propósito— así que este es el camino más permisivo que existe.
    const { error } = await Q.from("quality_survey_responses")
      .update({ customer_id: ACME_CUSTOMER }).eq("id", r!.id);
    assert(error, "se pudo atribuir una respuesta anónima a un cliente");

    const { data: despues } = await Q.from("quality_survey_responses")
      .select("customer_id").eq("id", r!.id).single();
    assert(despues?.customer_id === null, "la respuesta anónima quedó con cliente");

    const conServicio = await admin.from("quality_survey_responses")
      .update({ customer_id: ACME_CUSTOMER }).eq("id", r!.id);
    assert(conServicio.error, "la clave de servicio pudo escribir en las respuestas");
  });

  await check("F4. no hay ninguna fila que una la invitación con la respuesta", async () => {
    const { data: inv } = await Q.from("quality_survey_invitations")
      .select("id, organization_id, campaign_id, token_prefix, customer_id, contact_id, sent_to_email, sent_at, status, expires_at, used_at, revoked_at, revoked_by, created_by, created_at, updated_at")
      .eq("id", INVITACION_ANON).single();
    const claves = Object.keys(inv ?? {});
    assert(!claves.includes("response_id"),
      "la invitación apunta a la respuesta: un join reconstruiría quién dijo qué");
    // El único dato temporal común es `used_at` — y correlacionarlo es una
    // inferencia, no una consulta.
    const { data: resp } = await Q.from("quality_survey_responses")
      .select("*").eq("organization_id", A).eq("campaign_id", CAMP_ANON).limit(1).single();
    // Las dos tablas comparten nombres de columna —`customer_id`,
    // `contact_id`— pero en una respuesta anónima están VACÍOS, así que un
    // `join` por ellos no devuelve nada. Lo que se comprueba es eso: que no
    // exista ningún par de valores que las una.
    const comunes = Object.keys(resp ?? {}).filter((k) => claves.includes(k)
      && !["id", "organization_id", "campaign_id", "created_at", "status"].includes(k));
    for (const k of comunes) {
      assert((resp as Record<string, unknown>)[k] === null,
        `la respuesta anónima trae «${k}», que también está en la invitación: un join las uniría`);
    }
    const { data: cruce } = await Q.from("quality_survey_responses")
      .select("id").eq("organization_id", A).eq("campaign_id", CAMP_ANON)
      .not("customer_id", "is", null);
    assert((cruce ?? []).length === 0,
      "alguna respuesta anónima lleva cliente: el cruce con las invitaciones sería inmediato");
  });

  await check("F5. §100 · no hay auditoría de fila que delate al autor", async () => {
    const { data: rs } = await Q.from("quality_survey_responses")
      .select("id").eq("organization_id", A).eq("campaign_id", CAMP_ANON);
    assert((rs ?? []).length === 3, "no se encontraron las respuestas anónimas");

    // Se pregunta con la sesión de la DIRECCIÓN: si el rastro existiera, quien
    // administra la empresa podría leerlo, y eso es exactamente lo que la
    // promesa de anonimato excluye.
    for (const r of rs ?? []) {
      const { data: audit } = await owner.client.from("audit_log")
        .select("id, actor_id").eq("organization_id", A).eq("row_id", r.id);
      assert((audit ?? []).length === 0,
        `hay ${(audit ?? []).length} filas de auditoría de una respuesta anónima`);
    }

    // Y tampoco por la tabla de sus valores.
    const { data: ans } = await Q.from("quality_survey_answers")
      .select("id").eq("organization_id", A)
      .in("response_id", (rs ?? []).map((r) => r.id));
    for (const a of ans ?? []) {
      const { data: audit } = await owner.client.from("audit_log")
        .select("id").eq("organization_id", A).eq("row_id", a.id);
      assert((audit ?? []).length === 0, "hay auditoría de las answers anónimas");
    }
  });

  await check("F6. el resultado agregado SÍ se puede leer", async () => {
    await Q.rpc("quality_close_survey_campaign", { p_campaign_id: CAMP_ANON, p_note: null });
    await Q.rpc("quality_compute_campaign_metrics", { p_campaign_id: CAMP_ANON });
    const { data } = await Q.from("v_quality_metric_series")
      .select("value, sample_size").eq("organization_id", A)
      .eq("campaign_id", CAMP_ANON).eq("method", "nps").single();
    assert(Number(data?.sample_size) === 3, `se contaron ${data?.sample_size} respuestas`);
    // 1 promotor (9), 1 pasivo (7), 1 detractor (3) → 33,33 − 33,33 = 0.
    assert(Number(data?.value) === 0, `el NPS anónimo dio ${data?.value} en vez de 0`);
  });

  await check("F7. §87 · la ficha del cliente NO cuenta las respuestas anónimas", async () => {
    const { data } = await Q.from("v_quality_customer_overview")
      .select("identified_response_count").eq("organization_id", A)
      .eq("profile_id", ACME_CUSTOMER).single();
    // Solo la de B1 y las cuatro del NPS identificado: cinco. Las tres anónimas
    // NO se cuentan, aunque el cliente estuviera invitado.
    assert(Number(data?.identified_response_count) === 5,
      `la ficha cuenta ${data?.identified_response_count} respuestas: las anónimas se colaron`);
  });

  await check("F8. un comentario anónimo no se puede convertir en queja CON cliente", async () => {
    const { data: r } = await Q.from("quality_survey_responses")
      .select("id").eq("organization_id", A).eq("campaign_id", CAMP_ANON).limit(1).single();
    const { error } = await Q.from("quality_customer_feedback").insert({
      organization_id: A, response_id: r!.id, customer_id: ACME_CUSTOMER,
      feedback_kind: "complaint", title: "Se queja de la entrega",
      received_on: HOY,
    });
    assert(error, "se pudo atribuir a un cliente un comentario de campaña anónima");

    // Sin cliente sí se puede: lo que se prohíbe es la atribución, no el registro.
    const { error: ok } = await Q.from("quality_customer_feedback").insert({
      organization_id: A, response_id: r!.id,
      feedback_kind: "comment", title: "Comentario recogido de la encuesta anónima",
      received_on: HOY,
    });
    assert(!ok, `no se pudo registrar el comentario sin cliente: ${ok?.message}`);
  });

  // ==========================================================================
  console.log("\nG · Escenarios 7, 8 y 14 · la puerta pública (§82, §83, §89)");
  // ==========================================================================

  await check("G1. §82 · en campaña identificada la respuesta SÍ conserva al cliente", async () => {
    const { data } = await Q.from("quality_survey_responses")
      .select("customer_id, respondent_kind").eq("organization_id", A)
      .eq("campaign_id", CAMP_V1).single();
    assert(data?.customer_id === ACME_CUSTOMER, "la respuesta identificada perdió el cliente");
    assert(data?.respondent_kind !== "anonymous",
      "una respuesta identificada consta como anónima");
  });

  await check("G2. §83 · un enlace de un solo uso no se reutiliza", async () => {
    const abierta = await newCampaign(Q, A, {
      surveyId: ENCUESTA, versionId: V2, name: `Replay ${stamp}`,
      anonymity: "identified", population: 1,
    });
    const token = await issue(Q, abierta, ACME_CUSTOMER);
    const qs = await questionsOf(Q, A, V2);
    const nps = qs.find((q) => q.stable_key === "sat.global")!;
    const cuerpo = [{ question_id: nps.id, outcome: "answered", value_numeric: 8 }];

    const primero = await publico.rpc("quality_submit_survey_response", {
      p_token: token, p_answers: cuerpo,
    });
    assert(!primero.error && (primero.data as Record<string, unknown>)?.ok === true,
      "el primer envío falló");

    const segundo = await publico.rpc("quality_submit_survey_response", {
      p_token: token, p_answers: cuerpo,
    });
    const ok = (segundo.data as Record<string, unknown>)?.ok;
    assert(segundo.error || ok !== true, "el mismo enlace sirvió dos veces");

    const { data: r } = await Q.from("quality_survey_responses")
      .select("id").eq("organization_id", A).eq("campaign_id", abierta);
    assert((r ?? []).length === 1, `el enlace produjo ${(r ?? []).length} respuestas`);
  });

  await check("G3. §89 · un token inventado se rechaza, sin decir por qué", async () => {
    const { data } = await publico.rpc("quality_resolve_survey_token", {
      p_token: "0".repeat(64),
    });
    const r = (data ?? {}) as Record<string, unknown>;
    assert(r.ok === false, "un token inventado resolvió algo");
    assert(r.reason === "not_available", `el motivo fue «${r.reason}»`);
  });

  await check("G4. §89 · una campaña en BORRADOR no se puede responder", async () => {
    const { data: c } = await Q.from("quality_survey_campaigns").insert({
      organization_id: A, survey_id: ENCUESTA, version_id: V2,
      name: `Borrador ${stamp}`, anonymity_mode: "identified",
    }).select("id").single();
    const token = await issue(Q, c!.id as string, null);
    const { data } = await publico.rpc("quality_resolve_survey_token", { p_token: token });
    assert((data as Record<string, unknown>)?.ok === false,
      "se pudo abrir una encuesta de una campaña en borrador");
  });

  await check("G5. §89 · una campaña CERRADA tampoco", async () => {
    const cerrada = await newCampaign(Q, A, {
      surveyId: ENCUESTA, versionId: V2, name: `Cerrada ${stamp}`,
      anonymity: "identified",
    });
    const token = await issue(Q, cerrada, null);
    await Q.rpc("quality_close_survey_campaign", { p_campaign_id: cerrada, p_note: null });

    const { data } = await publico.rpc("quality_resolve_survey_token", { p_token: token });
    assert((data as Record<string, unknown>)?.ok === false,
      "se pudo abrir la encuesta de una campaña cerrada");
    const { data: envio } = await publico.rpc("quality_submit_survey_response", {
      p_token: token, p_answers: [],
    });
    assert((envio as Record<string, unknown>)?.ok !== true,
      "se pudo enviar a una campaña cerrada");
  });

  await check("G6. §67 · un enlace caducado se rechaza por el reloj del SERVIDOR", async () => {
    const abierta = await newCampaign(Q, A, {
      surveyId: ENCUESTA, versionId: V2, name: `Caducado ${stamp}`, anonymity: "identified",
    });
    const { data: inv } = await Q.rpc("quality_issue_survey_invitation", {
      p_campaign_id: abierta, p_customer_id: null, p_contact_id: null,
      p_email: null, p_expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const token = (inv as Record<string, unknown>).token as string;
    const { data } = await publico.rpc("quality_resolve_survey_token", { p_token: token });
    assert((data as Record<string, unknown>)?.ok === false, "un enlace caducado abrió la encuesta");
  });

  await check("G7. un enlace revocado deja de servir en el momento", async () => {
    const abierta = await newCampaign(Q, A, {
      surveyId: ENCUESTA, versionId: V2, name: `Revocado ${stamp}`, anonymity: "identified",
    });
    const token = await issue(Q, abierta, null);
    const { data: inv } = await Q.from("quality_survey_invitations")
      .select("id").eq("organization_id", A).eq("campaign_id", abierta).single();
    await Q.from("quality_survey_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", inv!.id);

    const { data } = await publico.rpc("quality_resolve_survey_token", { p_token: token });
    assert((data as Record<string, unknown>)?.ok === false, "un enlace revocado abrió la encuesta");
  });

  await check("G8. §66 · el hash del token NO sale de la base", async () => {
    const { error } = await Q.from("quality_survey_invitations")
      .select("token_hash").eq("organization_id", A).limit(1);
    assert(error, "la sesión pudo leer el hash del token");
  });

  await check("G9. `anon` no puede leer NADA de las tablas del dominio", async () => {
    for (const t of ["quality_survey_responses", "quality_survey_answers",
                     "quality_survey_invitations", "quality_customer_profiles",
                     "quality_customer_feedback", "quality_survey_campaigns"]) {
      const { data, error } = await publico.from(t).select("id").limit(1);
      assert(error || (data ?? []).length === 0,
        `anon leyó ${(data ?? []).length} filas de ${t}`);
    }
  });

  // ==========================================================================
  console.log("\nH · Escenario 9 · QUEJA ≠ NO CONFORMIDAD (§84)");
  // ==========================================================================

  let QUEJA = "";
  let NC_ANTES = 0, CASOS_ANTES = 0;

  await check("H1. registrar una queja NO mueve el recuento de no conformidades", async () => {
    const { data: ncA } = await Q.from("work_cases")
      .select("id").eq("organization_id", A).eq("classification", "nonconformity");
    const { data: csA } = await Q.from("work_cases").select("id").eq("organization_id", A);
    NC_ANTES = (ncA ?? []).length;
    CASOS_ANTES = (csA ?? []).length;

    const { data, error } = await Q.from("quality_customer_feedback").insert({
      organization_id: A, customer_id: ACME_CUSTOMER, feedback_kind: "complaint",
      severity: "high", received_on: HOY, channel: "Teléfono",
      title: `Entrega incompleta ${stamp}`,
      description: "Llamó para decir que faltaron dos referencias del pedido.",
    }).select("id").single();
    assert(!error && data, `queja: ${error?.message}`);
    QUEJA = data!.id as string;

    const { data: ncD } = await Q.from("work_cases")
      .select("id").eq("organization_id", A).eq("classification", "nonconformity");
    const { data: csD } = await Q.from("work_cases").select("id").eq("organization_id", A);
    assert((ncD ?? []).length === NC_ANTES,
      `el recuento de no conformidades pasó de ${NC_ANTES} a ${(ncD ?? []).length}`);
    assert((csD ?? []).length === CASOS_ANTES,
      `registrar una queja abrió ${(csD ?? []).length - CASOS_ANTES} caso(s)`);
  });

  await check("H2. abrir el caso es una decisión, y el caso nace SIN clasificar", async () => {
    const { data, error } = await Q.rpc("quality_open_case_from_customer_feedback", {
      p_feedback_id: QUEJA, p_title: null, p_description: null,
    });
    assert(!error && data, `escalar: ${error?.message}`);

    const { data: caso } = await Q.from("work_cases")
      .select("id, code, case_type, classification, origin_kind")
      .eq("id", data as string).single();
    assert(caso, "el caso no se creó");
    assert(caso!.case_type === "complaint", `el caso nació como «${caso!.case_type}»`);
    assert(caso!.origin_kind === "customer", "el caso no dice que vino de un cliente");
    assert(caso!.classification === "pending",
      `el caso nació clasificado como «${caso!.classification}»: eso lo decide una persona`);

    const { data: csD } = await Q.from("work_cases").select("id").eq("organization_id", A);
    assert((csD ?? []).length === CASOS_ANTES + 1, "el número de casos no subió en uno");
  });

  await check("H3. y el recuento de NC SIGUE igual hasta que alguien clasifique", async () => {
    const { data: ncD } = await Q.from("work_cases")
      .select("id").eq("organization_id", A).eq("classification", "nonconformity");
    assert((ncD ?? []).length === NC_ANTES,
      `abrir el caso subió las no conformidades a ${(ncD ?? []).length}`);
  });

  await check("H4. el caso lleva las referencias, sin copiar nada", async () => {
    const { data: fb } = await Q.from("quality_customer_feedback")
      .select("case_id, status").eq("id", QUEJA).single();
    assert(fb?.case_id !== null, "la queja no quedó enlazada a su caso");
    assert(fb?.status === "under_review", "la queja no pasó a revisión");

    const { data: refs } = await Q.from("work_references")
      .select("ref_kind").eq("organization_id", A)
      .eq("owner_kind", "case").eq("owner_id", fb!.case_id);
    const kinds = (refs ?? []).map((r) => r.ref_kind);
    assert(kinds.includes("quality_customer_feedback"),
      "el caso no referencia la manifestación que lo originó");
    assert(kinds.includes("quality_customer_profile"),
      "el caso no referencia al cliente que se quejó");
  });

  await check("H5. una felicitación no abre un caso de tipo queja", async () => {
    const { data: fb } = await Q.from("quality_customer_feedback").insert({
      organization_id: A, customer_id: ACME_CUSTOMER, feedback_kind: "compliment",
      received_on: HOY, title: `Felicitación ${stamp}`,
    }).select("id").single();
    const { data: caso } = await Q.rpc("quality_open_case_from_customer_feedback", {
      p_feedback_id: fb!.id, p_title: null, p_description: null,
    });
    const { data: c } = await Q.from("work_cases")
      .select("case_type").eq("id", caso as string).single();
    assert(c?.case_type === "issue",
      `una felicitación abrió un caso de tipo «${c?.case_type}»`);
  });

  // ==========================================================================
  console.log("\nI · Escenarios 10 y 11 · señales y tendencia (§85, §86)");
  // ==========================================================================

  await check("I1. §85 · el barrido produce señales y CERO no conformidades", async () => {
    // Una queja vieja sin revisar: el disparador del aviso.
    const { data: vieja } = await Q.from("quality_customer_feedback").insert({
      organization_id: A, customer_id: ACME_CUSTOMER, feedback_kind: "claim",
      received_on: day(-20), title: `Reclamo antiguo ${stamp}`, severity: "high",
    }).select("id").single();

    const { data: ncA } = await Q.from("work_cases")
      .select("id").eq("organization_id", A).eq("classification", "nonconformity");
    const { data: rgA } = await Q.from("quality_risks").select("id").eq("organization_id", A);
    const { data: acA } = await Q.from("work_actions").select("id").eq("organization_id", A);

    const { error } = await Q.rpc("quality_scan_customer_voice", { p_organization_id: A });
    assert(!error, `barrido: ${error?.message}`);

    const { data: senales } = await Q.from("quality_customer_signals")
      .select("id, signal_kind").eq("organization_id", A).eq("status", "open");
    assert((senales ?? []).length > 0, "el barrido no produjo ninguna señal");
    assert((senales ?? []).some((s) => s.signal_kind === "complaint_unreviewed"),
      "una queja de hace veinte días sin revisar no produjo señal");

    const { data: ncD } = await Q.from("work_cases")
      .select("id").eq("organization_id", A).eq("classification", "nonconformity");
    const { data: rgD } = await Q.from("quality_risks").select("id").eq("organization_id", A);
    const { data: acD } = await Q.from("work_actions").select("id").eq("organization_id", A);
    assert((ncD ?? []).length === (ncA ?? []).length, "el barrido clasificó una no conformidad");
    assert((rgD ?? []).length === (rgA ?? []).length, "el barrido creó un riesgo");
    assert((acD ?? []).length === (acA ?? []).length, "el barrido creó una acción");
    void vieja;
  });

  await check("I2. el barrido es idempotente: dos pasadas no duplican nada", async () => {
    const contar = async () => {
      const { data: al } = await Q.from("work_alerts")
        .select("id").eq("organization_id", A).eq("source_domain", "customer");
      const { data: tk } = await Q.from("work_tasks")
        .select("id").eq("organization_id", A).eq("source_domain", "customer");
      const { data: sg } = await Q.from("quality_customer_signals")
        .select("id").eq("organization_id", A);
      return [(al ?? []).length, (tk ?? []).length, (sg ?? []).length] as const;
    };
    const antes = await contar();
    await Q.rpc("quality_scan_customer_voice", { p_organization_id: A });
    const despues = await contar();
    assert(antes[0] === despues[0], `los avisos pasaron de ${antes[0]} a ${despues[0]}`);
    assert(antes[1] === despues[1], `las tareas pasaron de ${antes[1]} a ${despues[1]}`);
    assert(antes[2] === despues[2], `las señales pasaron de ${antes[2]} a ${despues[2]}`);
  });

  await check("I3. la señal se cierra sola cuando alguien atiende la queja", async () => {
    const { data: s } = await Q.from("quality_customer_signals")
      .select("id, feedback_id").eq("organization_id", A)
      .eq("signal_kind", "complaint_unreviewed").eq("status", "open").limit(1).single();
    assert(s?.feedback_id, "la señal no dice de qué queja habla");

    await Q.from("quality_customer_feedback")
      .update({ status: "under_review" }).eq("id", s!.feedback_id);
    await Q.rpc("quality_scan_customer_voice", { p_organization_id: A });

    const { data: despues } = await Q.from("quality_customer_signals")
      .select("status").eq("id", s!.id).single();
    assert(despues?.status === "resolved",
      `la señal quedó en «${despues?.status}» después de atender la queja`);
  });

  await check("I4. §86 · la serie SE PARTE cuando cambia la escala", async () => {
    // La métrica CSAT sobre la MISMA clave estable, medida con la v1 (1–5) y
    // con la v2 (0–10): dos claves de comparabilidad distintas.
    await Q.from("quality_customer_metric_definitions").insert({
      organization_id: A, name: `Satisfacción media ${stamp}`, method: "average",
      question_stable_key: "sat.global", unit: "score",
    });
    await Q.rpc("quality_compute_campaign_metrics", { p_campaign_id: CAMP_V1 });
    await Q.rpc("quality_compute_campaign_metrics", { p_campaign_id: CAMP_Q2 });

    const { data } = await Q.from("v_quality_metric_series")
      .select("comparability_key, breaks_comparability, campaign_id, value")
      .eq("organization_id", A).eq("method", "average")
      .order("period_start", { ascending: true });
    const puntos = (data ?? []).filter((p) => p.value !== null);
    assert(puntos.length >= 2, `solo hay ${puntos.length} medición(es) comparables`);
    const claves = new Set(puntos.map((p) => p.comparability_key));
    assert(claves.size >= 2,
      "medir con escalas 1–5 y 0–10 produjo la misma clave de comparabilidad");
    assert(puntos.some((p) => p.breaks_comparability === true),
      "la serie no marca ningún corte pese a haber cambiado la escala");
  });

  // ==========================================================================
  console.log("\nJ · Escenario 13 · ciclo de vida (§88)");
  // ==========================================================================

  await check("J1. una encuesta CON respuestas no se elimina", async () => {
    const { data, error } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "survey", p_id: ENCUESTA,
    });
    assert(!error && data, `dictamen: ${error?.message}`);
    const v = data as Record<string, unknown>;
    assert(v.can_hard_delete === false, "una encuesta con respuestas se declara desechable");
    assert(Array.isArray(v.blocking) && (v.blocking as unknown[]).length > 0,
      "el dictamen no dice qué lo impide");

    const { error: eb } = await Q.from("quality_surveys").delete().eq("id", ENCUESTA);
    const { data: sigue } = await Q.from("quality_surveys")
      .select("id").eq("id", ENCUESTA).maybeSingle();
    assert(eb || sigue, "se borró una encuesta con respuestas");
  });

  await check("J2. retirarla conserva todo", async () => {
    const { error } = await Q.from("quality_surveys")
      .update({ is_active: false, retired_at: new Date().toISOString() }).eq("id", ENCUESTA);
    assert(!error, `retirar: ${error?.message}`);
    const { data: vs } = await Q.from("quality_survey_versions")
      .select("id").eq("organization_id", A).eq("survey_id", ENCUESTA);
    assert((vs ?? []).length >= 2, "retirar borró las versiones");
    const { data: rs } = await Q.from("quality_survey_responses")
      .select("id").eq("organization_id", A);
    assert((rs ?? []).length > 0, "retirar borró las respuestas");
  });

  await check("J3. un cliente con historia tampoco se elimina", async () => {
    const { data } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "customer", p_id: ACME_CUSTOMER,
    });
    assert((data as Record<string, unknown>)?.can_hard_delete === false,
      "un cliente con quejas y respuestas se declara desechable");
    const { error } = await Q.from("quality_customer_profiles").delete().eq("id", ACME_CUSTOMER);
    const { data: sigue } = await Q.from("quality_customer_profiles")
      .select("id").eq("id", ACME_CUSTOMER).maybeSingle();
    assert(error || sigue, "se borró un cliente con historia");
  });

  await check("J4. una campaña con respuestas tampoco", async () => {
    const { error } = await Q.from("quality_survey_campaigns").delete().eq("id", CAMP_V1);
    const { data: sigue } = await Q.from("quality_survey_campaigns")
      .select("id").eq("id", CAMP_V1).maybeSingle();
    assert(error || sigue, "se borró una campaña con respuestas");
  });

  await check("J5. una respuesta enviada no se puede editar ni borrar", async () => {
    const { data: r } = await Q.from("quality_survey_responses")
      .select("id, status").eq("organization_id", A).eq("status", "submitted").limit(1).single();
    const { error: eu } = await Q.from("quality_survey_responses")
      .update({ status: "draft" }).eq("id", r!.id);
    assert(eu, "se pudo devolver a borrador una respuesta enviada");
    const { error: ed } = await Q.from("quality_survey_responses").delete().eq("id", r!.id);
    assert(ed, "se pudo borrar una respuesta enviada");
  });

  await check("J6. una encuesta en borrador SIN uso sí se elimina", async () => {
    const { data: s } = await Q.from("quality_surveys").insert({
      organization_id: A, name: `Efímera ${stamp}`,
    }).select("id").single();
    const { data } = await Q.rpc("quality_deletion_eligibility", {
      p_entity: "survey", p_id: s!.id,
    });
    assert((data as Record<string, unknown>)?.can_hard_delete === true,
      "una encuesta recién creada no se puede eliminar");
    const { error } = await Q.from("quality_surveys").delete().eq("id", s!.id);
    assert(!error, `eliminar: ${error?.message}`);
  });

  // ==========================================================================
  console.log("\nK · Cierre anual y permisos (VC-05, VC-06, §62)");
  // ==========================================================================

  let PERIODO = "";

  await check("K1. el consultor administra el dominio pero NO cierra el periodo", async () => {
    const { data: r, error: ec } = await C.from("quality_customer_feedback").insert({
      organization_id: A, feedback_kind: "suggestion", received_on: HOY,
      title: `Sugerencia del consultor ${stamp}`,
    }).select("id").single();
    assert(!ec && r, `el consultor no pudo registrar una sugerencia: ${ec?.message}`);

    const { data: p } = await Q.from("quality_customer_voice_reviews").insert({
      organization_id: A, period_label: `2027 ${stamp}`,
      period_start: HACE_UN_ANIO, period_end: HOY,
      methodology_note: "Encuesta trimestral, escala 0–10 desde el segundo semestre.",
    }).select("id").single();
    PERIODO = p!.id as string;

    const { error } = await C.rpc("quality_close_customer_voice_review", {
      p_review_id: PERIODO, p_verdict: "adequate", p_conclusions: "Todo bien.",
    });
    assert(error, "un consultor externo cerró el periodo de satisfacción de su cliente");
  });

  await check("K2. VC-06 · cerrar exige veredicto sobre la metodología y conclusiones", async () => {
    const { error: sinConclusiones } = await Q.rpc("quality_close_customer_voice_review", {
      p_review_id: PERIODO, p_verdict: "adequate", p_conclusions: "   ",
    });
    assert(sinConclusiones, "se pudo cerrar sin conclusiones");

    const { data, error } = await Q.rpc("quality_close_customer_voice_review", {
      p_review_id: PERIODO, p_verdict: "changed",
      p_conclusions: "Se cambió la escala a 0–10 a mitad de año; la serie se corta ahí.",
    });
    assert(!error, `cerrar: ${error?.message}`);
    const snap = (data ?? {}) as Record<string, unknown>;
    assert(Number(snap.complaints) >= 1, "el retrato no contó las quejas del periodo");
    assert(Number(snap.responses) >= 1, "el retrato no contó las respuestas del periodo");
  });

  await check("K3. un periodo cerrado es final", async () => {
    const { error } = await Q.from("quality_customer_voice_reviews")
      .update({ conclusions: "Otra cosa" }).eq("id", PERIODO);
    const { data } = await Q.from("quality_customer_voice_reviews")
      .select("conclusions").eq("id", PERIODO).single();
    assert(error || /se corta ahí/.test(String(data?.conclusions)),
      "se reescribieron las conclusiones de un periodo cerrado");
  });

  await check("K4. el cierre dejó una decisión formal en el motor transversal", async () => {
    const { data } = await Q.from("work_decisions")
      .select("decision_kind").eq("organization_id", A)
      .eq("subject_kind", "customer_voice_review").eq("subject_id", PERIODO);
    assert((data ?? []).length === 1, "el cierre no quedó como decisión formal");
  });

  // ==========================================================================
  console.log("\nL · Escenario 12 · lo de otra empresa no existe (§63, §99)");
  // ==========================================================================

  await check("L1. otra empresa no ve clientes, encuestas ni campañas", async () => {
    for (const t of ["quality_customer_profiles", "quality_surveys", "quality_survey_versions",
                     "quality_survey_questions", "quality_survey_campaigns",
                     "quality_survey_invitations", "quality_survey_responses",
                     "quality_survey_answers", "quality_customer_feedback",
                     "quality_customer_signals", "quality_customer_metric_definitions",
                     "quality_customer_metric_results", "quality_customer_voice_reviews",
                     "quality_customer_topics"]) {
      const { data } = await O.from(t).select("id").eq("organization_id", A);
      assert((data ?? []).length === 0, `${t} entregó ${(data ?? []).length} filas ajenas`);
    }
  });

  await check("L2. las vistas tampoco filtran de más", async () => {
    for (const v of ["v_quality_customer_overview", "v_quality_campaign_summary",
                     "v_quality_metric_series"]) {
      const { data } = await O.from(v).select("organization_id").eq("organization_id", A);
      assert((data ?? []).length === 0, `${v} entregó filas de otra empresa`);
    }
  });

  await check("L3. las RPC no son un túnel bajo RLS (§64)", async () => {
    const { data: version } = await O.rpc("quality_survey_version_on", {
      p_organization_id: A, p_survey_id: ENCUESTA, p_on: HOY,
    });
    assert((version ?? []).length === 0, "una empresa ajena leyó qué versión regía en otra");

    const { data: estructura } = await O.rpc("quality_survey_version_structure", {
      p_organization_id: A, p_version_id: V1,
    });
    assert(estructura === null, "una empresa ajena leyó la estructura de una encuesta ajena");

    const { error: barrido } = await O.rpc("quality_scan_customer_voice", {
      p_organization_id: A,
    });
    assert(barrido, "una empresa ajena pudo lanzar el barrido de otra");

    const { data: dictamen } = await O.rpc("quality_deletion_eligibility", {
      p_entity: "customer", p_id: ACME_CUSTOMER,
    });
    assert((dictamen as Record<string, unknown>)?.reason_code === "not_found",
      "el dictamen contó lo que hay dentro de un cliente ajeno");
  });

  await check("L4. escribir en la empresa ajena tampoco funciona", async () => {
    const { error: e1 } = await O.from("quality_customer_feedback").insert({
      organization_id: A, feedback_kind: "complaint", received_on: HOY, title: "Inyectada",
    });
    assert(e1, "una empresa ajena escribió una queja en otra");

    const { error: e2 } = await O.from("quality_surveys").insert({
      organization_id: A, name: "Inyectada",
    });
    assert(e2, "una empresa ajena creó una encuesta en otra");

    const { error: e3 } = await O.rpc("quality_issue_survey_invitation", {
      p_campaign_id: CAMP_Q2, p_customer_id: null, p_contact_id: null,
      p_email: null, p_expires_at: null,
    });
    assert(e3, "una empresa ajena emitió un enlace de una campaña de otra");

    const { error: e4 } = await O.rpc("quality_close_customer_voice_review", {
      p_review_id: PERIODO, p_verdict: "adequate", p_conclusions: "Inyectado.",
    });
    assert(e4, "una empresa ajena cerró el periodo de otra");
  });

  await check("L5. la sesión NO puede fabricar una respuesta ni un resultado", async () => {
    const { error: e1 } = await Q.from("quality_survey_responses").insert({
      organization_id: A, campaign_id: CAMP_Q2, version_id: V2,
      status: "submitted", submitted_at: new Date().toISOString(),
      respondent_kind: "customer", customer_id: ACME_CUSTOMER,
    });
    assert(e1, "la sesión pudo insertar una respuesta directamente");

    const { data: def } = await Q.from("quality_customer_metric_definitions")
      .select("id").eq("organization_id", A).limit(1).single();
    const { error: e2 } = await Q.from("quality_customer_metric_results").insert({
      organization_id: A, campaign_id: CAMP_Q2, definition_id: def!.id,
      value: 100, method_snapshot: {}, comparability_key: "inventada",
    });
    assert(e2, "la sesión pudo inventar un resultado de métrica");
  });

  // --------------------------------------------------------------------------
  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("\nLa suite se detuvo:", e instanceof Error ? e.message : e, "\n");
  process.exit(1);
});
