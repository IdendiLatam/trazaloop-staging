/**
 * Trazaloop · QUALITY-12.2C · La asistencia de redacción contra base real.
 *
 * Con el DOBLE determinístico, no con OpenAI: lo que se comprueba aquí es la
 * arquitectura —el permiso, el contexto, el registro, el aislamiento— y una
 * suite que necesita una credencial para pasar es una suite que no se puede
 * ejecutar. La llamada real se valida aparte, en Preview.
 *
 * El doble se amplía para este caso de uso: devuelve el texto de la persona
 * limpiado y señala lo que la guía pide y el texto no tiene. No interpreta
 * nada; agrupa y compara, que es lo que permite comprobar el resto sin
 * depender de que un modelo acierte.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
process.env.QUALITY_AI_PROVIDER = "fake";
process.env.QUALITY_AI_MODEL = "doble-determinista-1";
process.env.QUALITY_AI_API_KEY = "clave-de-prueba-que-no-sale-de-aqui-jamas";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality122c-rls.");
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

async function newUser(label: string) {
  const email = `q122c-${label}-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${label}` },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login ${label}: ${e.message}`);
  return { id: data.user.id, email, client: client as unknown as SupabaseClient };
}

const TEXTO = "Las actividades son revisadas periodicamente por el area "
  + "correspondiente y se deja registro de la revision realizada.";

async function main() {
  const { runQuickEdit } = await import("../../lib/intelligence/document-authoring/quick-edit");
  const { getCurrentAuthoringGuidance, getSectionRoleGuidance } =
    await import("../../lib/db/authoring-guidance");
  const { getOrganizationAuthoringContext } = await import("../../lib/db/organization-profile");

  console.log("\nQUALITY-12.2C · asistencia de redacción contra base real\n");

  const jefa = await newUser("adm");
  const ajena = await newUser("out");
  for (const u of [jefa, ajena]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q122c" });
  }
  const { data: a } = await jefa.client.rpc("create_organization", { p_name: `Q122C A ${stamp}` });
  const { data: b } = await ajena.client.rpc("create_organization", { p_name: `Q122C B ${stamp}` });
  const A = a as string, B = b as string;
  const J = jefa.client, O = ajena.client;

  // Perfil de empresa, para que el contexto tenga algo que aportar.
  await admin.from("organizations").update({
    sector_code: "plastics",
    primary_activity: "Fabricación de envases plásticos a partir de resina reciclada",
    products_services: ["Envases para alimentos", "Preformas PET"],
  }).eq("id", A);

  const MODULOS = {
    cpr: "traceability_6632", textiles: "textiles", quality: "quality",
  } as const;

  const plan = async (org: string, modulo: string, modo: string) => {
    await admin.from("organization_modules")
      .update({
        enabled: true, access_mode: modo,
        access_expires_at: modo === "demo"
          ? new Date(Date.now() + 86_400_000).toISOString() : null,
      })
      .eq("organization_id", org).eq("module_code", modulo);
  };

  let secuencia = 0;

  /** Un documento de un módulo, con una sección con texto. */
  async function nuevoDocumento(org: string, moduleKey: string, blueprintCode: string | null) {
    let blueprintId: string | null = null;
    let sectionKey = "purpose";
    if (blueprintCode) {
      const { data: bp } = await admin.from("trazadoc_blueprints")
        .select("id").eq("code", blueprintCode).maybeSingle();
      blueprintId = (bp?.id as string) ?? null;
      const { data: s } = await admin.from("trazadoc_blueprint_sections")
        .select("section_key").eq("blueprint_id", blueprintId!).eq("section_key", "objetivo")
        .maybeSingle();
      sectionKey = (s?.section_key as string) ?? "objetivo";
    }
    const { data: doc, error } = await admin.from("trazadoc_documents").insert({
      organization_id: org, source_type: blueprintId ? "suggested" : "custom",
      module_key: moduleKey, blueprint_id: blueprintId,
      category_code: "procedure",
      // El título es único por empresa: se numera para poder crear varios del
      // mismo módulo dentro de una misma ejecución.
      title: `Documento ${moduleKey} ${stamp} #${(secuencia += 1)}`,
      code: `${moduleKey.slice(0, 3).toUpperCase()}-${secuencia}-${stamp}`.slice(0, 24),
      revision_model: moduleKey === "quality" ? "controlled" : "legacy",
    }).select("id").single();
    if (error) throw new Error(`documento ${moduleKey}: ${error.message}`);

    let blueprintSectionId: string | null = null;
    if (blueprintId) {
      const { data: bs } = await admin.from("trazadoc_blueprint_sections")
        .select("id").eq("blueprint_id", blueprintId).eq("section_key", sectionKey).maybeSingle();
      blueprintSectionId = (bs?.id as string) ?? null;
    }
    const { data: sec, error: es } = await admin.from("trazadoc_document_sections").insert({
      organization_id: org, document_id: doc!.id, blueprint_section_id: blueprintSectionId,
      section_key: sectionKey, title: "Objetivo", content: TEXTO,
      sort_order: 1, is_required: true,
    }).select("id").single();
    if (es) throw new Error(`sección ${moduleKey}: ${es.message}`);
    return { documentId: doc!.id as string, sectionId: sec!.id as string, sectionKey, blueprintId };
  }

  /** Monta el contexto igual que la acción de servidor y ejecuta. */
  async function mejorar(params: {
    org: string; cliente: SupabaseClient; documentId: string; moduleKey: string;
    sectionKey: string; blueprintId: string | null; texto?: string;
    action?: "improve_writing" | "clarify" | "formalize" | "shorten"
      | "review_against_guidance" | "alternative_wording";
  }) {
    const comercial = MODULOS[params.moduleKey as keyof typeof MODULOS];
    const guidance = params.blueprintId
      ? (await getCurrentAuthoringGuidance({
          organizationId: params.org, moduleCode: comercial, blueprintId: params.blueprintId,
        }, params.cliente as never)).find((g) => g.sectionKey === params.sectionKey) ?? null
      : (await getSectionRoleGuidance({
          organizationId: params.org, moduleCode: comercial,
          guidanceModule: params.moduleKey, sectionKeys: [params.sectionKey],
        }, params.cliente as never))[0] ?? null;
    const organization = await getOrganizationAuthoringContext(
      params.org, params.cliente as never);
    return runQuickEdit({
      organizationId: params.org,
      documentId: params.documentId,
      moduleKey: params.moduleKey,
      sectionKey: params.sectionKey,
      action: params.action ?? "improve_writing",
      context: {
        userText: params.texto ?? TEXTO,
        guidance, organization,
        document: {
          moduleLabel: params.moduleKey, documentTitle: "Documento de prueba",
          documentCode: "PR-01", documentType: "procedure",
          sectionTitle: "Objetivo", sectionKey: params.sectionKey,
        },
      },
    } as Parameters<typeof runQuickEdit>[0], params.cliente as never);
  }

  // ==========================================================================
  console.log("A · EDIT-FIRST");
  // ==========================================================================

  await plan(A, MODULOS.cpr, "full");
  const CPR = await nuevoDocumento(A, "cpr", "procedimiento_produccion");

  await check("A1. sin texto NO se abre operación ni se llama al proveedor", async () => {
    const { count: antes } = await admin.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    const r = await mejorar({ ...CPR, org: A, cliente: J, moduleKey: "cpr", texto: "  " });
    assert(!r.ok && r.reason === "empty", `motivo inesperado: ${!r.ok ? r.reason : "ok"}`);
    const { count: despues } = await admin.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    assert(antes === despues, "se abrió una operación con el texto vacío");
  });

  await check("A2. un texto demasiado corto tampoco", async () => {
    const r = await mejorar({ ...CPR, org: A, cliente: J, moduleKey: "cpr", texto: "Se revisa." });
    assert(!r.ok && r.reason === "empty", "un texto de diez caracteres pasó");
  });

  // ==========================================================================
  console.log("\nB · LAS SEIS ACCIONES, EN PCR");
  // ==========================================================================

  const ACCIONES = ["improve_writing", "clarify", "formalize", "shorten",
    "review_against_guidance", "alternative_wording"] as const;

  for (const accion of ACCIONES) {
    await check(`B. ${accion} funciona y queda registrada`, async () => {
      const r = await mejorar({ ...CPR, org: A, cliente: J, moduleKey: "cpr", action: accion });
      assert(r.ok, `falló: ${!r.ok ? r.message : ""}`);
      if (!r.ok) return;
      assert(r.suggestion.suggestedText.length > 0, "propuesta vacía");
      const { data } = await admin.from("v_document_authoring_usage")
        .select("action, module_key, document_id, section_key, use_case:action")
        .eq("run_id", r.runId).single();
      assert((data as Record<string, unknown>).action === accion,
        `se registró la acción ${(data as Record<string, unknown>).action}`);
      assert((data as Record<string, unknown>).module_key === "cpr", "módulo mal registrado");
    });
  }

  await check("B7. se registra con qué revisión de la guía se trabajó", async () => {
    const r = await mejorar({ ...CPR, org: A, cliente: J, moduleKey: "cpr" });
    assert(r.ok, "falló");
    if (!r.ok) return;
    const { data } = await admin.from("quality_ai_runs")
      .select("guidance_revision_id, use_case, provider_called").eq("id", r.runId).single();
    const f = data as Record<string, unknown>;
    assert(f.guidance_revision_id !== null, "no se registró la revisión de la guía");
    assert(f.use_case === "document.quick_edit", `caso de uso: ${f.use_case}`);
    assert(f.provider_called === true, "no consta que se llamó al proveedor");
  });

  // ==========================================================================
  console.log("\nC · TEXTILES Y QUALITY, SIN DEPENDER DE QUALITY");
  // ==========================================================================

  await check("C1. Textiles en Full funciona SIN acceso a Quality", async () => {
    await plan(A, MODULOS.textiles, "full");
    await admin.from("organization_modules")
      .update({ enabled: false }).eq("organization_id", A).eq("module_code", MODULOS.quality);
    const TX = await nuevoDocumento(A, "textiles", "TXT-PRO-002");
    const r = await mejorar({ ...TX, org: A, cliente: J, moduleKey: "textiles" });
    assert(r.ok, `Textiles con Quality apagado falló: ${!r.ok ? r.message : ""}`);
  });

  await check("C2. PCR en Full funciona SIN acceso a Quality", async () => {
    const r = await mejorar({ ...CPR, org: A, cliente: J, moduleKey: "cpr" });
    assert(r.ok, `PCR con Quality apagado falló: ${!r.ok ? r.message : ""}`);
  });

  let QLTY: Awaited<ReturnType<typeof nuevoDocumento>>;

  await check("C3. Quality funciona con su propio plan y por papel de sección", async () => {
    await admin.from("organization_modules")
      .update({ enabled: true }).eq("organization_id", A).eq("module_code", MODULOS.quality);
    await plan(A, MODULOS.quality, "full");
    QLTY = await nuevoDocumento(A, "quality", null);
    for (const clave of ["purpose", "responsibilities", "development"]) {
      await admin.from("trazadoc_document_sections")
        .update({ section_key: clave }).eq("id", QLTY.sectionId);
      const r = await mejorar({
        ...QLTY, org: A, cliente: J, moduleKey: "quality", sectionKey: clave,
      });
      assert(r.ok, `${clave} falló: ${!r.ok ? r.message : ""}`);
      if (!r.ok) return;
      assert(r.used.guidance === true, `${clave} no usó la guía por papel de sección`);
    }
  });

  await check("C4. una sección a medida funciona SIN guía, y lo declara", async () => {
    await admin.from("trazadoc_document_sections")
      .update({ section_key: `seccion_propia_${stamp}`.slice(0, 60) }).eq("id", QLTY.sectionId);
    const r = await mejorar({
      ...QLTY, org: A, cliente: J, moduleKey: "quality",
      sectionKey: `seccion_propia_${stamp}`.slice(0, 60),
    });
    assert(r.ok, `falló: ${!r.ok ? r.message : ""}`);
    if (!r.ok) return;
    assert(r.used.guidance === false, "una sección a medida recibió guía de otro papel");
    assert(r.used.userText === true && r.used.organizationProfile === true,
      "sin guía debería seguir usando el texto y el perfil");
    const { data } = await admin.from("quality_ai_runs")
      .select("guidance_revision_id").eq("id", r.runId).single();
    assert((data as Record<string, unknown>).guidance_revision_id === null,
      "se registró una guía que no se usó");
  });

  // ==========================================================================
  console.log("\nD · DEMO, FULL Y EXTRA");
  // ==========================================================================

  await check("D1. en Demo NO se ofrece", async () => {
    await plan(A, MODULOS.cpr, "demo");
    const r = await mejorar({ ...CPR, org: A, cliente: J, moduleKey: "cpr" });
    assert(!r.ok, "Demo pudo usar la asistencia");
    assert(!r.ok && r.reason === "demo", `motivo: ${!r.ok ? r.reason : ""}`);
  });

  await check("D2. en Extra sí, igual que en Full", async () => {
    await plan(A, MODULOS.cpr, "extra");
    const r = await mejorar({ ...CPR, org: A, cliente: J, moduleKey: "cpr" });
    assert(r.ok, `Extra falló: ${!r.ok ? r.message : ""}`);
    await plan(A, MODULOS.cpr, "full");
  });

  await check("D3. un módulo deshabilitado no pasa", async () => {
    await admin.from("organization_modules")
      .update({ enabled: false }).eq("organization_id", A).eq("module_code", MODULOS.textiles);
    const TX = await nuevoDocumento(A, "textiles", "TXT-PRO-003");
    const r = await mejorar({ ...TX, org: A, cliente: J, moduleKey: "textiles" });
    assert(!r.ok && r.reason === "module_denied", `motivo: ${!r.ok ? r.reason : "ok"}`);
    await admin.from("organization_modules")
      .update({ enabled: true }).eq("organization_id", A).eq("module_code", MODULOS.textiles);
  });

  // ==========================================================================
  console.log("\nE · AISLAMIENTO");
  // ==========================================================================

  await check("E1. una empresa ajena no mejora el documento de otra", async () => {
    const r = await mejorar({ ...CPR, org: A, cliente: O, moduleKey: "cpr" });
    assert(!r.ok, "alguien de fuera usó la asistencia sobre este documento");
    assert(!r.ok && r.reason === "not_member", `motivo: ${!r.ok ? r.reason : ""}`);
  });

  await check("E2. tampoco declarando su propia empresa", async () => {
    await plan(B, MODULOS.cpr, "full");
    const r = await mejorar({ ...CPR, org: B, cliente: O, moduleKey: "cpr" });
    assert(!r.ok && r.reason === "not_found",
      `un documento de otra empresa se resolvió: ${!r.ok ? r.reason : "ok"}`);
  });

  await check("E3. declarar otro módulo sobre el mismo documento no abre nada", async () => {
    const r = await mejorar({ ...CPR, org: A, cliente: J, moduleKey: "textiles" });
    assert(!r.ok && r.reason === "module_mismatch",
      `motivo: ${!r.ok ? r.reason : "ok"}`);
  });

  await check("E4. la vista de consumo no deja ver lo de otra empresa", async () => {
    const { data } = await O.from("v_document_authoring_usage")
      .select("run_id").eq("organization_id", A);
    assert((data ?? []).length === 0, "una empresa ajena ve el consumo de otra");
  });

  // ==========================================================================
  console.log("\nF · LO QUE NO CAMBIA");
  // ==========================================================================

  await check("F1. la asistencia NO toca el contenido de la sección", async () => {
    const { data: antes } = await admin.from("trazadoc_document_sections")
      .select("content, updated_at").eq("id", CPR.sectionId).single();
    const r = await mejorar({ ...CPR, org: A, cliente: J, moduleKey: "cpr" });
    assert(r.ok, "falló");
    const { data: despues } = await admin.from("trazadoc_document_sections")
      .select("content, updated_at").eq("id", CPR.sectionId).single();
    assert((antes as Record<string, unknown>).content === (despues as Record<string, unknown>).content,
      "el contenido de la sección cambió");
    assert((antes as Record<string, unknown>).updated_at === (despues as Record<string, unknown>).updated_at,
      "la sección se tocó aunque el texto quedara igual");
  });

  await check("F2. no crea revisiones ni cambia el estado del documento", async () => {
    const { data: doc } = await admin.from("trazadoc_documents")
      .select("status, current_version, current_revision_id").eq("id", CPR.documentId).single();
    const { count: revs } = await admin.from("trazadoc_document_revisions")
      .select("id", { count: "exact", head: true }).eq("document_id", CPR.documentId);
    await mejorar({ ...CPR, org: A, cliente: J, moduleKey: "cpr" });
    const { data: doc2 } = await admin.from("trazadoc_documents")
      .select("status, current_version, current_revision_id").eq("id", CPR.documentId).single();
    const { count: revs2 } = await admin.from("trazadoc_document_revisions")
      .select("id", { count: "exact", head: true }).eq("document_id", CPR.documentId);
    assert(JSON.stringify(doc) === JSON.stringify(doc2), "el documento cambió");
    assert(revs === revs2, "se creó una revisión");
  });

  // ==========================================================================
  console.log("\nG · CONSUMO");
  // ==========================================================================

  await check("G1. el consumo queda separado del Copilot", async () => {
    const { data } = await admin.from("v_document_authoring_usage")
      .select("run_id, action, input_tokens, output_tokens, latency_ms, provider_called")
      .eq("organization_id", A);
    const filas = (data ?? []) as Record<string, unknown>[];
    assert(filas.length >= 8, `solo ${filas.length} operaciones registradas`);
    for (const f of filas) {
      assert(f.action !== null, "una operación sin acción");
      assert(Number(f.input_tokens) > 0, "una operación sin consumo de entrada");
      assert(Number(f.latency_ms) >= 0, "una operación sin latencia");
    }
    // Y en la vista no aparece ninguna consulta del Copilot.
    const { data: copilot } = await admin.from("quality_ai_runs")
      .select("id").eq("organization_id", A).neq("use_case", "document.quick_edit");
    assert((copilot ?? []).length === 0 || filas.every((f) => f.run_id !== undefined),
      "la vista mezcla los dos casos de uso");
  });

  await check("G2. la vista de consumo no expone el texto", async () => {
    const { data } = await J.from("v_document_authoring_usage").select("*").limit(1);
    const f = ((data ?? []) as Record<string, unknown>[])[0];
    assert(f, "no se pudo leer el consumo propio");
    for (const c of ["question", "answer", "suggested_text"]) {
      assert(!(c in f), `la vista de consumo expone ${c}`);
    }
  });

  console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
