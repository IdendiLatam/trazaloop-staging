/**
 * Trazaloop · QUALITY-12.1 · Las fuentes que faltaban y los temas persistidos.
 *
 * QUÉ SE COMPRUEBA AQUÍ
 *
 * Lo que no se puede comprobar leyendo código: que los siete adaptadores nuevos
 * traen filas de verdad y las citan; que una pregunta sobre una fecha antigua
 * lee el TEXTO DEL DOCUMENTO DE ENTONCES y no el de hoy; que un tema de
 * clientes queda guardado con su periodo, su procedencia y un recuento que sale
 * de la evidencia real; y que por esa evidencia no se vuelve a ninguna persona.
 *
 * El proveedor es el doble determinístico. La llamada real a OpenAI se valida
 * aparte, en Preview, con credencial: una suite que necesita una clave para
 * pasar es una suite que no se puede ejecutar.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
process.env.QUALITY_AI_PROVIDER = "fake";
process.env.QUALITY_AI_MODEL = "doble-determinista-1";
delete process.env.QUALITY_AI_API_KEY;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality121-rls.");
  process.exit(1);
}

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const publico = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function newUser(label: string, name: string) {
  const email = `q121-${label}-${stamp}@test.trazaloop.dev`;
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
const day = (o: number) => iso(new Date(Date.now() + o * 86_400_000));
const HOY = day(0);
const HACE_MUCHO = day(-400);
const HACE_POCO = day(-10);
const ANIO = Number(HOY.slice(0, 4));

type Cliente = SupabaseClient;

async function main() {
  const { runCopilot, renderContext } = await import("../../lib/ai/copilot");
  // Del dominio, no de la acción: la acción arrastra Next.js y no carga aquí.
  // Es exactamente la misma función que usa el servidor.
  const { readTemporal, readUseCase } = await import("../../lib/domain/quality-ai-request");
  const { buildContext } = await import("../../lib/ai/context/builder");
  await import("../../lib/ai/context/adapters");
  const { PROMPT_ASK, PROMPT_CUSTOMER_THEMES } = await import("../../lib/ai/prompts");
  const { resolveProvider, providerIsLive } = await import("../../lib/ai/provider");

  console.log("\nQUALITY-12.1 · base real\n");

  const jefa = await newUser("adm", "Directora");
  const cal = await newUser("cal", "Coordinadora de Calidad");
  const ajena = await newUser("out", "Ajena");
  for (const u of [jefa, cal, ajena]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q121" });
  }
  const { data: a } = await jefa.client.rpc("create_organization", { p_name: `Q121 A ${stamp}` });
  const { data: b } = await ajena.client.rpc("create_organization", { p_name: `Q121 B ${stamp}` });
  const A = a as string, B = b as string;
  await admin.from("memberships").insert([
    { organization_id: A, user_id: cal.id, role_code: "quality", status: "active" },
  ]);
  const J = jefa.client as unknown as Cliente;
  const Q = cal.client as unknown as Cliente;
  const O = ajena.client as unknown as Cliente;

  await Q.from("quality_ai_settings").insert({
    organization_id: A, is_enabled: true, allow_people: false,
    allow_customer: true, allow_drafts: true,
    monthly_run_limit: 500, daily_user_limit: 400,
  });

  const preguntar = async (
    cliente: Cliente, org: string, question: string, extra: Record<string, unknown> = {}
  ) => runCopilot({
    organizationId: org, useCase: "ask", feature: "general", prompt: PROMPT_ASK,
    question, temporal: { mode: "current" },
    allow: { people: false, customer: true },
    ...extra,
  } as Parameters<typeof runCopilot>[0], cliente as never);

  // ==========================================================================
  console.log("A · LAS SIETE FUENTES QUE FALTABAN (§22)");
  // ==========================================================================

  let CARGO = "", DOCUMENTO = "", CAMPANA = "";

  await check("A0. se siembra una empresa con las siete cosas", async () => {
    const { data: cargo } = await Q.from("quality_positions")
      .insert({ organization_id: A, name: `Dirección ${stamp}` }).select("id").single();
    CARGO = cargo!.id as string;

    // --- Objetivo
    const { error: eo } = await Q.from("quality_objectives").insert({
      organization_id: A, code: `OBJ-${stamp}`.slice(0, 24),
      name: "Cumplir los plazos comprometidos", admin_state: "active",
      period_start: `${ANIO}-01-01`, period_end: `${ANIO}-12-31`,
      owner_position_id: CARGO,
    });
    assert(!eo, `objetivo: ${eo?.message}`);

    // --- Caso y acción
    const { data: caso, error: ec } = await Q.from("work_cases").insert({
      organization_id: A, code: `CASO-${stamp}`.slice(0, 24),
      title: "Entregas fuera de plazo", case_type: "issue", origin_kind: "process",
      detected_on: HACE_POCO, classification: "nonconformity", status: "open",
      requirement_text: "Entregar dentro del plazo pactado.",
      nonconformity_text: "Tres entregas superaron el plazo.",
    }).select("id").single();
    assert(!ec, `caso: ${ec?.message}`);
    const { data: code } = await Q.rpc("work_next_action_code", { p_organization_id: A });
    const { error: ea } = await Q.from("work_actions").insert({
      organization_id: A, code, action_kind: "corrective",
      title: "Revisar la programación de expediciones",
      due_on: day(15), original_due_on: day(15), owner_position_id: CARGO,
      requires_effectiveness: true, effectiveness_criteria: "Cero retrasos en 3 meses",
      effectiveness_result: "pending",
    });
    assert(!ea, `acción: ${ea?.message}`);
    await Q.from("work_references").insert({
      organization_id: A, owner_kind: "action", owner_id: caso!.id,
      ref_kind: "work_case", ref_id: caso!.id, relation: "origin",
    });

    // --- Control
    const { data: cc } = await Q.rpc("quality_next_ro_code", {
      p_organization_id: A, p_kind: "control",
    });
    const { error: ectl } = await Q.from("quality_controls").insert({
      organization_id: A, code: cc, title: "Revisión diaria de la hoja de ruta",
      status: "active", owner_position_id: CARGO,
    });
    assert(!ectl, `control: ${ectl?.message}`);

    // --- Conocimiento crítico
    const { error: ek } = await Q.from("quality_knowledge_items").insert({
      organization_id: A, title: "Programación de expediciones",
      knowledge_kind: "tacit", criticality: "critical",
      documentation_status: "undocumented",
    });
    assert(!ek, `conocimiento: ${ek?.message}`);

    // --- Queja de cliente
    const { error: ef } = await Q.from("quality_customer_feedback").insert({
      organization_id: A, feedback_kind: "complaint", severity: "high",
      received_on: HACE_POCO, channel: "Teléfono",
      title: `Entrega incompleta ${stamp}`,
      description: "Faltaron dos referencias del pedido.",
    });
    assert(!ef, `queja: ${ef?.message}`);

    // --- Regla de automatización
    const { data: regla, error: er } = await Q.from("quality_automation_rules").insert({
      organization_id: A, code: `AUT-${stamp}`.slice(0, 24),
      name: "Acciones vencidas sin cerrar", category: "actions",
      source_code: "action", owner_position_id: CARGO, status: "active",
    }).select("id").single();
    assert(!er, `regla: ${er?.message}`);
    const { data: ver, error: ev } = await Q.from("quality_automation_rule_versions").insert({
      organization_id: A, rule_id: regla!.id, version_number: 1,
      trigger_kind: "schedule", schedule_frequency: "daily",
      conditions: [{ field: "due_on", operator: "days_after", value: 0 }],
      outputs: [{ kind: "CREATE_SIGNAL" }],
      severity: "warning", signal_title: "Acción vencida",
    }).select("id").single();
    assert(!ev, `versión: ${ev?.message}`);
    const { error: ep } = await Q.rpc("quality_automation_publish_version", {
      p_version_id: ver!.id, p_effective_from: HACE_MUCHO, p_change_note: "Inicial",
    });
    assert(!ep, `publicar regla: ${ep?.message}`);
  });

  await check("A1. las siete fuentes nuevas llegan al contexto y se citan", async () => {
    const r = await preguntar(Q, A, "¿Cómo está el sistema de gestión ahora mismo?");
    assert(r.ok, `falló: ${!r.ok ? r.message : ""}`);
    if (!r.ok) return;
    for (const fuente of ["objective", "action", "control", "knowledge_item",
                          "customer_feedback", "automation_rule"]) {
      assert(r.context.sources.includes(fuente), `la fuente ${fuente} no llegó`);
    }
    // Cada referencia apunta a algo con enlace: una cita sin sitio adonde ir no
    // es una cita, es una afirmación con adorno.
    for (const ref of r.references) {
      assert(typeof ref.label === "string" && ref.label.length > 0, "una fuente sin etiqueta");
      assert(ref.deepLink === null || ref.deepLink.startsWith("/"),
        `enlace raro: ${ref.deepLink}`);
    }
  });

  // ==========================================================================
  console.log("\nB · DOCUMENTOS: LA REVISIÓN DE ENTONCES (§24, §25)");
  // ==========================================================================

  await check("B0. un documento con DOS revisiones aprobadas y textos distintos", async () => {
    const { data: doc, error: ed } = await Q.from("trazadoc_documents").insert({
      organization_id: A, source_type: "custom", module_key: "quality",
      category_code: "procedure", title: `Procedimiento de expedición ${stamp}`,
      code: `PR-${stamp}`.slice(0, 24), revision_model: "controlled",
    }).select("id").single();
    assert(!ed, `documento: ${ed?.message}`);
    DOCUMENTO = doc!.id as string;

    await Q.from("trazadoc_document_sections").insert([
      { organization_id: A, document_id: DOCUMENTO, section_key: "purpose",
        title: "Objetivo", content: "El plazo de expedición es de CINCO días.",
        sort_order: 1, is_required: true },
    ]);

    const { data: rev1, error: e1 } = await Q.rpc("trazadoc_create_document_revision", {
      p_document_id: DOCUMENTO, p_change_note: "Primera emisión",
    });
    assert(!e1, `revisión 1: ${e1?.message}`);
    await Q.rpc("trazadoc_submit_document_revision", {
      p_revision_id: rev1, p_reviewers: [],
      p_approvers: [{ profile_id: jefa.id, position_id: null, step_order: 1 }],
      p_route_mode: "sequential", p_effective_from: HACE_MUCHO,
      p_review_due_at: null, p_note: null,
    });
    const { error: ea1 } = await J.rpc("trazadoc_record_document_decision", {
      p_revision_id: rev1, p_decision: "approved", p_reason: null,
    });
    assert(!ea1, `aprobar 1: ${ea1?.message}`);

    // La revisión 2 cambia el plazo. Es lo que hace que la pregunta histórica
    // pueda equivocarse: si el adaptador lee el documento «de ahora», dirá tres.
    // El orden importa: el contenido vivo solo se puede tocar con una revisión
    // ABIERTA, así que primero se abre la 2 y después se escribe.
    const { data: rev2, error: e2 } = await Q.rpc("trazadoc_create_document_revision", {
      p_document_id: DOCUMENTO, p_change_note: "Se acorta el plazo",
    });
    assert(!e2, `revisión 2: ${e2?.message}`);
    const { data: tocadas, error: eSec } = await Q.from("trazadoc_document_sections")
      .update({ content: "El plazo de expedición es de TRES días." })
      .eq("document_id", DOCUMENTO).eq("section_key", "purpose").select("id");
    assert(!eSec && (tocadas ?? []).length === 1,
      `cambiar el contenido: ${eSec?.message ?? "no se actualizó ninguna sección"}`);
    await Q.rpc("trazadoc_submit_document_revision", {
      p_revision_id: rev2, p_reviewers: [],
      p_approvers: [{ profile_id: jefa.id, position_id: null, step_order: 1 }],
      p_route_mode: "sequential", p_effective_from: HACE_POCO,
      p_review_due_at: null, p_note: null,
    });
    const { error: ea2 } = await J.rpc("trazadoc_record_document_decision", {
      p_revision_id: rev2, p_decision: "approved", p_reason: null,
    });
    assert(!ea2, `aprobar 2: ${ea2?.message}`);
  });

  // Lo que se mira aquí es EL CONTEXTO, no la respuesta: el texto del documento
  // viaja como material para el modelo, y lo que hay que comprobar es que el
  // material que sale de Trazaloop es el correcto. Qué haga después el modelo
  // con él es otra cosa, y el doble determinístico no lee prosa a propósito.
  const contextoDe = async (temporal: Record<string, unknown>) => {
    const pack = await buildContext({
      organizationId: A, useCase: "ask",
      question: "¿Cuál es el plazo de expedición?",
      temporal, pinned: { type: "trazadoc_document", id: DOCUMENTO },
      allow: { people: false, customer: true },
    } as Parameters<typeof buildContext>[0], Q as never);
    return { pack, texto: renderContext(pack) };
  };

  await check("B1. hoy se lee la revisión vigente hoy: TRES días", async () => {
    const { texto } = await contextoDe({ mode: "current" });
    assert(/TRES días/.test(texto), "no trajo el texto vigente");
    assert(!/CINCO días/.test(texto), "trajo también el texto antiguo");
  });

  await check("B2. una pregunta de hace un año lee CINCO días, no tres (§24)", async () => {
    const { pack, texto } = await contextoDe({ mode: "as_of", asOf: day(-200) });
    assert(/CINCO días/.test(texto), "no leyó la revisión de entonces");
    assert(!/TRES días/.test(texto), "coló el texto de hoy en una pregunta histórica");
    assert(pack.refs.some((x) => /revisión/i.test(x.label)),
      "la cita no dice de qué revisión habla");
    assert(pack.refs.some((x) => x.asOf === day(-200)),
      "la cita no dice a qué fecha mira");
  });

  await check("B2b. el texto del documento va como MATERIAL, no como hecho (§26)", async () => {
    const { pack } = await contextoDe({ mode: "current" });
    assert(pack.notes.some((n) => /TRES días/.test(n.body)),
      "el contenido del documento no llegó como nota");
    assert(!pack.facts.some((f) => /TRES días/.test(f.statement)),
      "el contenido del documento se coló como hecho calculado");
    for (const n of pack.notes) {
      assert(n.refs.length > 0, `una nota sin fuente: ${n.title}`);
    }
  });

  // ---------------------------------------------------------------------------
  // QUALITY-12.1 · Regresión de la prueba humana
  // ---------------------------------------------------------------------------
  // El defecto que motivó estas dos pruebas NO fue de recuperación: la prueba
  // humana se hizo en otra empresa, vacía, y «sin evidencia» era la respuesta
  // correcta. Pero las pruebas anteriores tenían un punto ciego real: todas
  // pasaban el documento FIJADO (`pinned`), que es el camino fácil. Una
  // pregunta abierta —sin fijar nada, como la escribe una persona— no estaba
  // cubierta, y es justo la que se probó a mano.
  //
  // Estas dos la cubren: pregunta abierta, sin fijar, con la sesión real.
  // ---------------------------------------------------------------------------

  const abierta = async (temporal: Record<string, unknown>) => {
    const pack = await buildContext({
      organizationId: A, useCase: "ask",
      question: "¿Cuál es el plazo de expedición comprometido?",
      temporal, pinned: null, allow: { people: false, customer: true },
    } as Parameters<typeof buildContext>[0], Q as never);
    return { pack, texto: renderContext(pack) };
  };

  await check("B4. pregunta ABIERTA, sin fijar nada: hay contexto y trae hoy", async () => {
    const { pack, texto } = await abierta({ mode: "current" });
    assert(pack.refs.length > 0, "una pregunta abierta no recuperó ninguna fuente");
    assert(pack.sourcesUsed.includes("document_revision"),
      `el documento no entró · fuentes: ${pack.sourcesUsed.join(", ")}`);
    assert(/TRES días/.test(texto), "no trajo la revisión vigente");
    assert(!/CINCO días/.test(texto), "trajo también la revisión antigua");
  });

  await check("B5. pregunta ABIERTA a fecha pasada: trae la revisión de entonces", async () => {
    const { pack, texto } = await abierta({ mode: "as_of", asOf: day(-200) });
    assert(pack.refs.length > 0, "una pregunta abierta histórica no recuperó nada");
    assert(/CINCO días/.test(texto), "no trajo la revisión de entonces");
    assert(!/TRES días/.test(texto), "coló la revisión de hoy en una pregunta histórica");
    assert(pack.refs.some((r) => r.sourceCode === "document_revision"
      && r.asOf === day(-200) && r.revisionLabel !== null),
      "la cita no dice a qué fecha y a qué revisión mira");
  });

  await check("B6. las fuentes se leen a la vez, y el paquete no cambia por ello", async () => {
    // Dos construcciones seguidas de la misma pregunta tienen que dar
    // EXACTAMENTE las mismas citas, con los mismos números. La lectura en
    // paralelo no puede introducir azar en la numeración: un hecho que cita
    // «[11]» tiene que seguir citando lo mismo mañana.
    const a1 = await abierta({ mode: "current" });
    const a2 = await abierta({ mode: "current" });
    const huella = (p: { refs: { ordinal: number; label: string }[] }) =>
      p.refs.map((r) => `${r.ordinal}:${r.label}`).join("|");
    assert(huella(a1.pack) === huella(a2.pack),
      "dos construcciones iguales dieron numeraciones distintas");
    assert(a1.pack.sourcesUsed.length >= 6,
      `se esperaban varias fuentes, llegaron ${a1.pack.sourcesUsed.length}`);
  });

  // ---------------------------------------------------------------------------
  // La cadena completa: FORMULARIO → servidor → contexto → respuesta
  // ---------------------------------------------------------------------------
  // B4 y B5 comprobaban el constructor de contexto con el alcance ya montado a
  // mano. Eso dejaba fuera precisamente la capa que falló en la prueba humana:
  // la pantalla no pintaba los campos del alcance, así que el servidor recibía
  // siempre «ahora» y una pregunta histórica respondía con el documento de hoy.
  //
  // Estas dos parten de un FormData idéntico al que envía el navegador —los
  // mismos nombres de campo que pinta el formulario— y lo pasan por las mismas
  // funciones que usa la acción de servidor.
  // ---------------------------------------------------------------------------

  const desdeFormulario = async (campos: Record<string, string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(campos)) form.set(k, v);
    const temporal = readTemporal(form);
    const useCase = readUseCase(form);
    const r = await runCopilot({
      organizationId: A, useCase, feature: useCase === "customer_themes" ? "customer" : "general",
      prompt: useCase === "customer_themes" ? PROMPT_CUSTOMER_THEMES : PROMPT_ASK,
      question: String(form.get("question")),
      temporal, pinned: null, allow: { people: false, customer: true },
    } as Parameters<typeof runCopilot>[0], Q as never);
    return { temporal, useCase, r };
  };

  await check("B7. formulario «Ahora» → el servidor pregunta por hoy", async () => {
    const { temporal, r } = await desdeFormulario({
      use_case: "ask", temporal_mode: "current",
      question: "¿Cuál es el plazo de expedición comprometido?",
    });
    assert(temporal.mode === "current", `el alcance llegó como ${temporal.mode}`);
    assert(r.ok, `falló: ${!r.ok ? r.message : ""}`);
    if (!r.ok) return;
    const doc = r.references.find((x) => /PR-|Procedimiento/.test(x.label));
    assert(doc && /Revisión 2/.test(doc.label),
      `citó ${doc?.label ?? "ninguna revisión"}`);
  });

  await check("B8. formulario «A fecha» → el servidor pregunta por ENTONCES", async () => {
    // Éste es el defecto, tal cual: el usuario elige la fecha en la pantalla y
    // lo que tiene que llegar al servidor es esa fecha, no «ahora».
    const { temporal, r } = await desdeFormulario({
      use_case: "ask", temporal_mode: "as_of", as_of: day(-180),
      question: "¿Cuál era el plazo de expedición comprometido entonces?",
    });
    assert(temporal.mode === "as_of", `el alcance llegó como ${temporal.mode}`);
    assert(temporal.asOf === day(-180), `la fecha llegó como ${temporal.asOf}`);
    assert(r.ok, `falló: ${!r.ok ? r.message : ""}`);
    if (!r.ok) return;

    const doc = r.references.find((x) => /Procedimiento/.test(x.label));
    assert(doc && /Revisión 1/.test(doc.label),
      `citó «${doc?.label}» cuando debía citar la Revisión 1`);
    assert(doc && doc.deepLink !== null, "la cita histórica no lleva a ningún sitio");

    // Y en la base tiene que quedar constancia del alcance histórico: si el run
    // dice «current», el defecto ha vuelto aunque la respuesta acierte.
    const { data } = await Q.from("quality_ai_runs")
      .select("temporal_mode, as_of").eq("organization_id", A).eq("id", r.runId).single();
    const f = data as Record<string, unknown>;
    assert(f.temporal_mode === "as_of", `la consulta quedó registrada como ${f.temporal_mode}`);
    assert(f.as_of === day(-180), `la consulta registró as_of=${f.as_of}`);
  });

  await check("B3. la cita del documento dice a qué fecha y a qué revisión mira", async () => {
    const r = await runCopilot({
      organizationId: A, useCase: "ask", feature: "general", prompt: PROMPT_ASK,
      question: "¿Cuál era el plazo de expedición entonces?",
      temporal: { mode: "as_of", asOf: day(-200) },
      pinned: { type: "trazadoc_document", id: DOCUMENTO },
      allow: { people: false, customer: true },
    } as Parameters<typeof runCopilot>[0], Q as never);
    assert(r.ok, `falló: ${!r.ok ? r.message : ""}`);
    const runId = await ultimaEjecucion(Q, A);
    const { data } = await Q.from("quality_ai_run_references")
      .select("source_code, as_of, revision_label, deep_link")
      .eq("organization_id", A).eq("run_id", runId).eq("source_code", "document_revision");
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.length > 0, "no se guardó ninguna referencia del documento");
    for (const f of filas) {
      assert(f.as_of !== null, "una cita histórica sin fecha");
      assert(f.revision_label !== null, "una cita de documento sin revisión");
    }
  });

  // ==========================================================================
  console.log("\nC · LOS TEMAS DE CLIENTES (GAP-03 de QUALITY-12)");
  // ==========================================================================

  await check("C0. una campaña anónima con comentarios", async () => {
    const { data: enc } = await Q.from("quality_surveys").insert({
      organization_id: A, name: `Satisfacción ${stamp}`, purpose: "satisfaction",
    }).select("id").single();
    const { data: ver } = await Q.from("quality_survey_versions").insert({
      organization_id: A, survey_id: enc!.id, version_number: 1, intro_text: "Cuéntanos.",
    }).select("id").single();
    await Q.from("quality_survey_questions").insert({
      organization_id: A, version_id: ver!.id, stable_key: "comentario",
      label: "¿Qué podríamos mejorar?", question_type: "text", position_order: 1,
    });
    await Q.rpc("quality_publish_survey_version", {
      p_version_id: ver!.id, p_effective_from: HACE_MUCHO, p_change_note: "Inicial",
    });
    const { data: camp } = await Q.from("quality_survey_campaigns").insert({
      organization_id: A, survey_id: enc!.id, version_id: ver!.id,
      name: `Clientes ${stamp}`, anonymity_mode: "anonymous",
      period_label: `${ANIO}-Q1`, period_start: HACE_MUCHO, period_end: HOY,
      population_size: 10, closes_on: day(30),
    }).select("id").single();
    CAMPANA = camp!.id as string;
    await Q.rpc("quality_open_survey_campaign", { p_campaign_id: CAMPANA });

    const { data: preg } = await Q.from("quality_survey_questions")
      .select("id").eq("version_id", ver!.id).single();
    for (const t of ["La entrega llegó tarde otra vez",
                     "Retraso en la entrega del pedido",
                     "El empaque venía dañado"]) {
      const { data: token } = await Q.rpc("quality_issue_survey_invitation", {
        p_campaign_id: CAMPANA, p_customer_id: null, p_contact_id: null,
        p_email: null, p_expires_at: null,
      });
      const { error } = await publico.rpc("quality_submit_survey_response", {
        p_token: (token as Record<string, unknown>)?.token ?? token,
        p_answers: [{ question_id: preg!.id, outcome: "answered", value_text: t }],
      });
      assert(!error, `respuesta: ${error?.message}`);
    }
  });

  const temas = async (desde: string, hasta: string) => runCopilot({
    organizationId: A, useCase: "customer_themes", feature: "customer",
    prompt: PROMPT_CUSTOMER_THEMES,
    question: "¿Qué temas plantean los clientes?",
    temporal: { mode: "period", periodStart: desde, periodEnd: hasta },
    allow: { people: false, customer: true },
  } as Parameters<typeof runCopilot>[0], Q as never);

  let TEMA = "";

  await check("C1. los temas quedan guardados con periodo y procedencia", async () => {
    const r = await temas(HACE_MUCHO, HOY);
    assert(r.ok, `falló: ${!r.ok ? r.message : ""}`);
    if (!r.ok) return;
    assert(r.themesRecorded > 0, "no se guardó ningún tema");

    const { data } = await Q.from("v_quality_ai_customer_theme_series")
      .select("*").eq("organization_id", A);
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.length > 0, "la serie está vacía");
    TEMA = String(filas[0].theme_id);
    for (const t of filas) {
      assert(t.period_start === HACE_MUCHO && t.period_end === HOY,
        `el periodo no es el de la pregunta: ${t.period_start} — ${t.period_end}`);
      assert(t.provider === "fake", `procedencia sin proveedor: ${t.provider}`);
      assert(String(t.model).length > 0, "procedencia sin modelo");
      assert(t.prompt_template === "copilot.customer_themes",
        `procedencia con la plantilla equivocada: ${t.prompt_template}`);
      assert(t.status === "proposed", "un tema nació ya confirmado");
    }
  });

  await check("C1b. formulario «Temas de clientes» → ese uso, y con su periodo", async () => {
    const { useCase, temporal, r } = await desdeFormulario({
      use_case: "customer_themes", temporal_mode: "period",
      period_start: day(-180), period_end: day(0),
      question: "¿Qué temas plantean los clientes?",
    });
    assert(useCase === "customer_themes", `el uso llegó como ${useCase}`);
    assert(temporal.mode === "period", `el alcance llegó como ${temporal.mode}`);
    assert(r.ok, `falló: ${!r.ok ? r.message : ""}`);
    if (!r.ok) return;

    const { data } = await Q.from("quality_ai_runs")
      .select("use_case, prompt_template, temporal_mode, period_start, period_end")
      .eq("organization_id", A).eq("id", r.runId).single();
    const f = data as Record<string, unknown>;
    assert(f.use_case === "customer_themes",
      `la consulta quedó registrada como uso ${f.use_case}`);
    assert(f.prompt_template === "copilot.customer_themes",
      `se usaron las instrucciones ${f.prompt_template}`);
    assert(f.period_start === day(-180) && f.period_end === day(0),
      `el periodo quedó ${f.period_start}…${f.period_end}`);
    // Y con ese uso —y solo con ése— los temas se persisten.
    assert(r.themesRecorded > 0, "no se guardó ningún tema con el uso correcto");
  });

  await check("C2. el recuento sale de la evidencia REAL, no de lo que diga nadie", async () => {
    const { data: tema } = await Q.from("quality_ai_customer_themes")
      .select("id, evidence_count").eq("id", TEMA).single();
    const { count } = await Q.from("quality_ai_customer_theme_evidence")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", A).eq("theme_id", TEMA);
    assert(Number(tema!.evidence_count) === (count ?? 0),
      `el tema dice ${tema!.evidence_count} y su evidencia son ${count}`);
    assert((count ?? 0) > 0, "un tema sin ninguna evidencia");
  });

  await check("C3. la evidencia es de ESA consulta y no lleva identidad", async () => {
    const { data: tema } = await Q.from("quality_ai_customer_themes")
      .select("run_id").eq("id", TEMA).single();
    const { data: ev } = await Q.from("quality_ai_customer_theme_evidence")
      .select("reference_id").eq("organization_id", A).eq("theme_id", TEMA);
    const ids = (ev ?? []).map((x) => (x as Record<string, unknown>).reference_id);
    const { data: refs } = await Q.from("quality_ai_run_references")
      .select("run_id, entity_type, entity_id, label").in("id", ids as string[]);
    const filas = (refs ?? []) as Record<string, unknown>[];
    assert(filas.length === ids.length, "una evidencia apunta fuera de las referencias");
    for (const f of filas) {
      assert(f.run_id === tema!.run_id, "una evidencia es de otra consulta");
      assert(f.entity_type === "quality_survey_campaign",
        `la evidencia apunta a ${f.entity_type}`);
    }
    // Y por ahí no se llega a ninguna respuesta ni a ninguna invitación.
    const { data: resp } = await admin.from("quality_survey_responses")
      .select("id").eq("organization_id", A);
    const { data: inv } = await admin.from("quality_survey_invitations")
      .select("id").eq("organization_id", A);
    const todo = JSON.stringify(filas);
    for (const x of [...(resp ?? []), ...(inv ?? [])]) {
      assert(!todo.includes(String((x as Record<string, unknown>).id)),
        "la evidencia identifica una respuesta o una invitación");
    }
  });

  await check("C4. una evidencia de otra consulta NO cuenta", async () => {
    // Se fabrica el intento: una referencia real, pero de OTRA ejecución.
    const otra = await preguntar(Q, A, "¿Qué requiere atención?");
    assert(otra.ok, "no se pudo abrir la segunda consulta");
    const { data: ajenas } = await Q.from("quality_ai_run_references")
      .select("id").eq("organization_id", A)
      .eq("run_id", otra.ok ? otra.runId : "").limit(2);
    const ids = (ajenas ?? []).map((x) => String((x as Record<string, unknown>).id));
    assert(ids.length > 0, "no hay referencias con las que probar");

    const { data: tema } = await Q.from("quality_ai_customer_themes")
      .select("run_id").eq("id", TEMA).single();
    const { data: nuevo, error } = await Q.rpc("quality_ai_record_customer_theme", {
      p_run_id: tema!.run_id, p_theme_key: `intruso-${stamp}`.slice(0, 60),
      p_label: "Tema con evidencia prestada", p_summary: null,
      p_sentiment: "negative", p_period_start: HACE_MUCHO, p_period_end: HOY,
      p_reference_ids: ids,
    });
    assert(!error, `escribir el tema: ${error?.message}`);
    const { data: comprobar } = await Q.from("quality_ai_customer_themes")
      .select("evidence_count").eq("id", nuevo as string).single();
    assert(Number(comprobar!.evidence_count) === 0,
      `contó ${comprobar!.evidence_count} evidencias que no eran suyas`);
  });

  await check("C4b. un caso interno NO cuenta como respaldo de un tema", async () => {
    // Lo vio la tercera prueba humana: el modelo agrupó «retraso de entrega»
    // citando tres comentarios anónimos y UN CASO. El caso habla del mismo
    // asunto y es legítimo leerlo, pero no es voz del cliente: si contara, el
    // tema diría que lo sostienen cuatro clientes cuando fueron tres.
    const { data: tema } = await Q.from("quality_ai_customer_themes")
      .select("run_id").eq("id", TEMA).single();
    const { data: refs } = await Q.from("quality_ai_run_references")
      .select("id, source_code").eq("organization_id", A)
      .eq("run_id", tema!.run_id as string);
    const filas = (refs ?? []) as Record<string, unknown>[];
    const comentarios = filas.filter((r) => r.source_code === "customer_comment");
    const internas = filas.filter(
      (r) => r.source_code !== "customer_comment" && r.source_code !== "customer_feedback");
    assert(comentarios.length > 0 && internas.length > 0,
      "la consulta no trae las dos clases de fuente con las que probar");

    const { data: nuevo, error } = await Q.rpc("quality_ai_record_customer_theme", {
      p_run_id: tema!.run_id, p_theme_key: `mezcla-${stamp}`.slice(0, 60),
      p_label: "Tema apoyado en clientes y en un caso interno", p_summary: null,
      p_sentiment: "negative", p_period_start: HACE_MUCHO, p_period_end: HOY,
      p_reference_ids: [...comentarios.map((r) => String(r.id)),
                        ...internas.map((r) => String(r.id))],
    });
    assert(!error, `escribir el tema: ${error?.message}`);

    const { data: guardado } = await Q.from("quality_ai_customer_themes")
      .select("evidence_count").eq("id", nuevo as string).single();
    assert(Number(guardado!.evidence_count) === comentarios.length,
      `contó ${guardado!.evidence_count} respaldos y solo ${comentarios.length} `
      + `son de clientes`);

    const { data: ev } = await Q.from("quality_ai_customer_theme_evidence")
      .select("reference_id").eq("organization_id", A).eq("theme_id", nuevo as string);
    const ids = new Set((ev ?? []).map((x) => String((x as Record<string, unknown>).reference_id)));
    for (const r of internas) {
      assert(!ids.has(String(r.id)),
        `una fuente ${r.source_code} quedó como evidencia de un tema de clientes`);
    }
  });

  await check("C5. la serie compara con el periodo anterior del mismo tema", async () => {
    // Un segundo periodo, con la misma campaña detrás: lo que interesa no es el
    // dato, es que la serie sepa emparejarlos por tema.
    const r = await temas(HACE_POCO, HOY);
    assert(r.ok && r.themesRecorded > 0, "no se guardó la segunda lectura");
    const { data } = await Q.from("v_quality_ai_customer_theme_series")
      .select("theme_key, period_start, previous_period_end, previous_evidence_count")
      .eq("organization_id", A).order("period_start", { ascending: true });
    const filas = (data ?? []) as Record<string, unknown>[];
    const conAnterior = filas.filter((f) => f.previous_period_end !== null);
    assert(conAnterior.length > 0, "ninguna lectura tiene periodo anterior");
    for (const f of conAnterior) {
      assert(f.previous_evidence_count !== null,
        "hay periodo anterior pero no su respaldo");
    }
  });

  await check("C6. confirmarlo lo firma una persona; descartarlo también", async () => {
    const { error } = await Q.rpc("quality_ai_resolve_customer_theme", {
      p_theme_id: TEMA, p_status: "confirmed", p_note: "Coincide con las quejas.",
    });
    assert(!error, `confirmar: ${error?.message}`);
    const { data } = await Q.from("quality_ai_customer_themes")
      .select("status, reviewed_by, reviewed_at, decision_note").eq("id", TEMA).single();
    assert(data!.status === "confirmed", "no quedó confirmado");
    assert(data!.reviewed_by === cal.id, "no consta quién lo confirmó");
    assert(data!.decision_note !== null, "se perdió el motivo");

    const { error: e2 } = await Q.rpc("quality_ai_resolve_customer_theme", {
      p_theme_id: TEMA, p_status: "discarded", p_note: null,
    });
    assert(e2 !== null, "se resolvió dos veces el mismo tema");
  });

  await check("C7. un tema no se borra, ni se escribe a mano", async () => {
    const { error: eDel } = await Q.from("quality_ai_customer_themes").delete().eq("id", TEMA);
    assert(eDel !== null, "se borró un tema");

    const { data: tema } = await Q.from("quality_ai_customer_themes")
      .select("run_id").eq("id", TEMA).single();
    const { error: eIns } = await Q.from("quality_ai_customer_themes").insert({
      organization_id: A, run_id: tema!.run_id, period_start: HOY, period_end: HOY,
      theme_key: "a mano", label: "A mano",
    });
    assert(eIns !== null, "se insertó un tema a mano, saltándose la RPC");

    const { error: eUpd } = await Q.from("quality_ai_customer_themes")
      .update({ evidence_count: 999 }).eq("id", TEMA);
    assert(eUpd !== null, "se pudo inflar el respaldo de un tema a mano");
  });

  await check("C8. la empresa ajena no ve ni un tema", async () => {
    const { count } = await O.from("quality_ai_customer_themes")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    assert((count ?? 0) === 0, "una empresa ajena lee los temas");
    const { count: c2 } = await O.from("v_quality_ai_customer_theme_series")
      .select("theme_key", { count: "exact", head: true }).eq("organization_id", A);
    assert((c2 ?? 0) === 0, "una empresa ajena lee la serie");
    const { data: anon } = await publico.from("quality_ai_customer_themes").select("id");
    assert((anon ?? []).length === 0, "el anónimo alcanza los temas");
  });

  await check("C9. sin permiso de voz del cliente no se escriben temas", async () => {
    await Q.from("quality_ai_settings").update({ allow_customer: false })
      .eq("organization_id", A);
    const { data: tema } = await Q.from("quality_ai_customer_themes")
      .select("run_id").eq("id", TEMA).single();
    const { error } = await Q.rpc("quality_ai_record_customer_theme", {
      p_run_id: tema!.run_id, p_theme_key: `apagado-${stamp}`.slice(0, 60),
      p_label: "No debería existir", p_summary: null, p_sentiment: "neutral",
      p_period_start: HOY, p_period_end: HOY, p_reference_ids: [],
    });
    assert(error !== null, "se escribió un tema con la voz del cliente apagada");
    await Q.from("quality_ai_settings").update({ allow_customer: true })
      .eq("organization_id", A);
  });

  // ==========================================================================
  console.log("\nD · EL CONSUMO Y EL PROVEEDOR");
  // ==========================================================================

  await check("D1. el detalle de consumo existe y no se rellena con ceros falsos (§12)", async () => {
    const runId = await ultimaEjecucion(Q, A);
    const { data } = await Q.from("v_quality_ai_run_overview")
      .select("input_tokens, output_tokens, cached_input_tokens, reasoning_tokens, total_tokens")
      .eq("organization_id", A).eq("run_id", runId).single();
    const f = data as Record<string, unknown>;
    assert(f.input_tokens !== null, "no se guardó la entrada");
    // El doble no informa caché ni razonamiento: tienen que quedar VACÍOS, no a
    // cero. Un cero diría «el proveedor razonó gratis», que es distinto.
    assert(f.cached_input_tokens === null, "se inventó un valor de caché");
    assert(f.reasoning_tokens === null, "se inventó un valor de razonamiento");
    assert(f.total_tokens === null, "se inventó un total");
  });

  await check("D1b. una consulta sin contexto dice que NO se llamó al modelo", async () => {
    // La empresa ajena no tiene nada de Calidad: su contexto sale vacío y el
    // Copilot responde sin preguntar a nadie. Lo que no puede pasar es que
    // quede registrada como si el proveedor hubiera contestado.
    await O.from("quality_ai_settings").insert({
      organization_id: B, is_enabled: true, allow_people: false,
      allow_customer: true, allow_drafts: false,
      monthly_run_limit: 50, daily_user_limit: 50,
    });
    const r = await preguntar(O, B, "¿Qué requiere atención esta semana?");
    assert(r.ok, `falló: ${!r.ok ? r.message : ""}`);
    if (!r.ok) return;
    assert(r.references.length === 0, "la empresa vacía trajo fuentes");
    assert(r.providerCalled === false, "dice haber llamado al proveedor sin contexto");

    const { data } = await O.from("v_quality_ai_run_overview")
      .select("provider_called, input_tokens, output_tokens, evidence_level")
      .eq("organization_id", B).eq("run_id", r.runId).single();
    const f = data as Record<string, unknown>;
    assert(f.provider_called === false, "la consulta quedó marcada como llamada");
    assert(Number(f.input_tokens) === 0 && Number(f.output_tokens) === 0,
      "una consulta sin llamada registró consumo");
    assert(f.evidence_level === "missing", "no dijo que no había evidencia");
  });

  await check("D1c. una consulta CON contexto sí queda marcada como llamada", async () => {
    const r = await preguntar(Q, A, "¿Qué requiere atención esta semana?");
    assert(r.ok && r.references.length > 0, "no hubo contexto con el que probar");
    assert(r.ok && r.providerCalled === true, "no marcó la llamada");
    const runId = await ultimaEjecucion(Q, A);
    const { data } = await Q.from("v_quality_ai_run_overview")
      .select("provider_called").eq("organization_id", A).eq("run_id", runId).single();
    assert((data as Record<string, unknown>).provider_called === true,
      "la consulta con llamada quedó marcada como sin llamada");
  });

  await check("D2. un proveedor desconocido NO acaba llamando a OpenAI (§61)", async () => {
    const previo = process.env.QUALITY_AI_PROVIDER;
    process.env.QUALITY_AI_PROVIDER = "garbage";
    process.env.QUALITY_AI_API_KEY = "sk-esto-no-se-debe-usar-nunca-jamas";
    try {
      const { provider, live } = resolveProvider();
      assert(provider.name === "fake", `eligió ${provider.name}`);
      assert(live === false, "se declaró en vivo con un proveedor inexistente");
      assert(providerIsLive() === false, "dice estar en vivo y no lo está");
    } finally {
      process.env.QUALITY_AI_PROVIDER = previo;
      delete process.env.QUALITY_AI_API_KEY;
    }
  });

  await check("D3. openai sin credencial no llama, y la pantalla lo dice (§62)", async () => {
    const previo = process.env.QUALITY_AI_PROVIDER;
    process.env.QUALITY_AI_PROVIDER = "openai";
    delete process.env.QUALITY_AI_API_KEY;
    try {
      const { provider, live } = resolveProvider();
      assert(provider.name === "fake", `eligió ${provider.name} sin credencial`);
      assert(live === false, "dice estar en vivo sin credencial");
      assert(providerIsLive() === false, "la pantalla diría que hay IA y no la hay");
    } finally {
      process.env.QUALITY_AI_PROVIDER = previo;
    }
  });

  await check("D4. con credencial, el elegido es openai (y aquí no se le llama)", async () => {
    const previo = process.env.QUALITY_AI_PROVIDER;
    process.env.QUALITY_AI_PROVIDER = "openai";
    process.env.QUALITY_AI_API_KEY = "sk-prueba-de-seleccion-no-se-llama-nunca";
    try {
      const { provider, live } = resolveProvider();
      assert(provider.name === "openai", `eligió ${provider.name}`);
      assert(live === true, "no se declaró en vivo teniendo credencial");
    } finally {
      process.env.QUALITY_AI_PROVIDER = previo;
      delete process.env.QUALITY_AI_API_KEY;
    }
  });

  await check("D5. una credencial vacía o de relleno no cuenta como credencial", async () => {
    const previo = process.env.QUALITY_AI_PROVIDER;
    process.env.QUALITY_AI_PROVIDER = "openai";
    for (const relleno of ["", "   ", "PENDIENTE", "sk-corta"]) {
      process.env.QUALITY_AI_API_KEY = relleno;
      assert(providerIsLive() === false, `«${relleno}» pasó por credencial`);
      assert(resolveProvider().provider.name === "fake",
        `«${relleno}» eligió un proveedor real`);
    }
    process.env.QUALITY_AI_PROVIDER = previo;
    delete process.env.QUALITY_AI_API_KEY;
  });

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

async function ultimaEjecucion(c: Cliente, org: string): Promise<string> {
  const { data } = await c.from("quality_ai_runs")
    .select("id").eq("organization_id", org).eq("status", "succeeded")
    .order("started_at", { ascending: false }).limit(1).single();
  return String((data as Record<string, unknown>).id);
}

void main();
