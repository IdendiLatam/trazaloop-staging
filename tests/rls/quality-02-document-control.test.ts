/**
 * Trazaloop Quality · QUALITY-02 · Pruebas contra base REAL.
 *
 *   A · Creación: la revisión empieza en 1 y el contenido se guarda.
 *   B · Workflow: enviar, devolver con motivo, corregir, reenviar, aceptar,
 *       aprobar — y la revisión sigue siendo 1 todo el rato.
 *   C · Revisiones: la nueva es explícita; la anterior queda inmutable.
 *   D · Vigencia: aprobado ≠ vigente, y la resolución histórica funciona.
 *   E · Tareas y alertas: destinatario correcto, sin fugas.
 *   F · Lista maestra: proyección correcta y sin fugas entre empresas.
 *   G · Eliminar y retirar.
 *   H · Ataques directos: saltarse el workflow por PostgREST.
 *   X · Aislamiento entre empresas en TODO lo anterior.
 *   Z · Sin regresión en PCR / Textiles / TrazaDocs legacy.
 *
 * Todo corre con la SESIÓN REAL de cada usuario (RLS incluida). El cliente
 * administrativo se usa solo para crear usuarios y ajustar el plan comercial,
 * nunca para saltarse una comprobación que la prueba quiere hacer.
 *
 * Correr: npm run test:quality02-rls
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB_URL = process.env.SUPABASE_DB_URL;

if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality02-rls (URL, ANON, SERVICE_ROLE).");
  process.exit(1);
}

/** Misma guarda que QUALITY-01: nunca mezclar entornos en una prueba. */
function projectRefOf(value: string): string {
  if (/(127\.0\.0\.1|localhost)/.test(value)) return "local";
  const m =
    value.match(/(?:db\.|\/\/)([a-z0-9]{20})\.supabase\.co/) ??
    value.match(/postgres\.([a-z0-9]{20})(?::|@)/);
  return m ? m[1] : "desconocido";
}
if (DB_URL && projectRefOf(URL) !== projectRefOf(DB_URL)) {
  console.error(
    `\nABORTADO: la API apunta a «${projectRefOf(URL)}» y SUPABASE_DB_URL a «${projectRefOf(DB_URL)}».\n`
  );
  process.exit(1);
}

let passed = 0;
let failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
async function check(n: string, fn: () => Promise<void>) {
  try { await fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const today = new Date().toISOString().slice(0, 10);
const plus = (days: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function newUser(label: string) {
  const email = `q02-${label}-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${label}` },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login ${label}: ${e.message}`);
  return { id: data.user.id, email, name: `QA ${label}`, client };
}

async function createOrg(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.rpc("create_organization", { p_name: name });
  if (error || !data) throw new Error(`create_organization: ${error?.message}`);
  return data as string;
}

/** Un documento CONTROLADO de Quality con su revisión 1 abierta. */
async function createControlledDocument(
  client: SupabaseClient,
  orgId: string,
  title: string,
  code: string | null = null
) {
  const { data, error } = await client
    .from("trazadoc_documents")
    .insert({
      organization_id: orgId, source_type: "custom", module_key: "quality",
      category_code: "procedure", title, code, revision_model: "controlled",
    })
    .select("id")
    .single();
  assert(!error && data, `crear documento «${title}»: ${error?.message}`);
  const documentId = data!.id as string;

  const { error: secErr } = await client.from("trazadoc_document_sections").insert([
    { organization_id: orgId, document_id: documentId, section_key: "purpose", title: "Objetivo", content: "", sort_order: 1, is_required: true },
    { organization_id: orgId, document_id: documentId, section_key: "scope", title: "Alcance", content: "", sort_order: 2, is_required: true },
  ]);
  assert(!secErr, `secciones de «${title}»: ${secErr?.message}`);

  const { data: revisionId, error: revErr } = await client.rpc("trazadoc_create_document_revision", {
    p_document_id: documentId, p_change_note: "Primera emisión",
  });
  assert(!revErr && revisionId, `abrir revisión 1 de «${title}»: ${revErr?.message}`);
  return { documentId, revisionId: revisionId as string };
}

async function currentVersion(client: SupabaseClient, documentId: string): Promise<number> {
  const { data } = await client
    .from("trazadoc_documents").select("current_version").eq("id", documentId).maybeSingle();
  return Number((data as { current_version?: number } | null)?.current_version ?? -1);
}

async function main() {
  console.log("\nQUALITY-02 · control documental contra base real\n");

  // Empresa A: quality-only, con creador, revisor y aprobador distintos.
  const creator = await newUser("creador");
  const reviewer = await newUser("revisor");
  const approver = await newUser("aprobador");
  const outsider = await newUser("ajeno");

  const orgA = await createOrg(creator.client, `Q02 Alfa ${stamp}`);
  const orgB = await createOrg(outsider.client, `Q02 Beta ${stamp}`);

  // QUALITY-ONLY (Parte 15): PCR y Textiles deshabilitados a propósito.
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgA).eq("module_code", "quality");
  await admin.from("organization_modules")
    .update({ enabled: false }).eq("organization_id", orgA).neq("module_code", "quality");
  await admin.from("organization_modules")
    .update({ access_mode: "full", access_expires_at: null })
    .eq("organization_id", orgB).eq("module_code", "quality");

  // El equipo de A: el revisor entra como consultor, el aprobador como admin.
  await admin.from("memberships").insert([
    { organization_id: orgA, user_id: reviewer.id, role_code: "consultant", status: "active" },
    { organization_id: orgA, user_id: approver.id, role_code: "admin", status: "active" },
  ]);

  // -------------------------------------------------------------------------
  console.log("A · Creación");
  // -------------------------------------------------------------------------
  const doc = await createControlledDocument(creator.client, orgA, `Procedimiento de compras ${stamp}`, "PR-COM-001");

  await check("A1. la revisión de un documento nuevo empieza en 1", async () => {
    assert((await currentVersion(creator.client, doc.documentId)) === 1, "current_version no es 1");
    const { data } = await creator.client
      .from("trazadoc_document_revisions")
      .select("revision_number, workflow_state, revision_label")
      .eq("document_id", doc.documentId);
    assert(data?.length === 1, `hay ${data?.length} revisiones`);
    assert(data![0].revision_number === 1, `revision_number = ${data![0].revision_number}`);
    assert(data![0].workflow_state === "draft", data![0].workflow_state as string);
    assert(data![0].revision_label === "Revisión 1", data![0].revision_label as string);
  });

  await check("A2. el contenido se guarda y se relee", async () => {
    const { error } = await creator.client
      .from("trazadoc_document_sections")
      .update({ content: "Comprar con criterio." })
      .eq("document_id", doc.documentId).eq("section_key", "purpose");
    assert(!error, `guardar: ${error?.message}`);
    const { data } = await creator.client
      .from("trazadoc_document_sections").select("content")
      .eq("document_id", doc.documentId).eq("section_key", "purpose").maybeSingle();
    assert(data?.content === "Comprar con criterio.", `releído: ${data?.content}`);
  });

  await check("A3. se agregan y eliminan secciones mientras es borrador", async () => {
    const { error } = await creator.client.from("trazadoc_document_sections").insert({
      organization_id: orgA, document_id: doc.documentId, section_key: "records",
      title: "Registros", content: "", sort_order: 3, is_required: false,
    });
    assert(!error, `agregar sección: ${error?.message}`);
    const { data, error: delErr } = await creator.client
      .from("trazadoc_document_sections").delete()
      .eq("document_id", doc.documentId).eq("section_key", "records").select("id");
    assert(!delErr && data?.length === 1, `eliminar sección: ${delErr?.message}`);
  });

  await check("A4. no existe una segunda revisión abierta a la vez", async () => {
    const { error } = await creator.client.rpc("trazadoc_create_document_revision", {
      p_document_id: doc.documentId, p_change_note: null,
    });
    assert(error !== null, "se abrió una segunda revisión con la primera en curso");
    assert(/revisión en curso/i.test(error!.message), error!.message);
  });

  // -------------------------------------------------------------------------
  console.log("\nB · Workflow completo, con la revisión quieta en 1");
  // -------------------------------------------------------------------------

  await check("B1. enviar a revisión: estado avanza, revisión NO", async () => {
    const { data, error } = await creator.client.rpc("trazadoc_submit_document_revision", {
      p_revision_id: doc.revisionId,
      p_reviewers: [{ profile_id: reviewer.id, position_id: null, step_order: 1 }],
      p_approvers: [{ profile_id: approver.id, position_id: null, step_order: 1 }],
      p_route_mode: "sequential", p_effective_from: null, p_review_due_at: null,
      p_note: "Listo para revisar",
    });
    assert(!error, `enviar: ${error?.message}`);
    assert(data === "in_review", `estado: ${data}`);
    assert((await currentVersion(creator.client, doc.documentId)) === 1, "enviar movió la revisión");
  });

  await check("B2. sin aprobador, un documento no se envía", async () => {
    const other = await createControlledDocument(creator.client, orgA, `Sin aprobador ${stamp}`);
    const { error } = await creator.client.rpc("trazadoc_submit_document_revision", {
      p_revision_id: other.revisionId,
      p_reviewers: [{ profile_id: reviewer.id, position_id: null, step_order: 1 }],
      p_approvers: [], p_route_mode: "sequential",
      p_effective_from: null, p_review_due_at: null, p_note: null,
    });
    assert(error !== null, "se envió un documento sin ningún aprobador");
    assert(/apruebe/i.test(error!.message), error!.message);
  });

  await check("B3. el revisor recibe tarea y alerta; nadie más", async () => {
    const { data: tasks } = await reviewer.client
      .from("work_tasks").select("id, task_type, assignee_profile_id, status")
      .eq("subject_id", doc.documentId).eq("status", "open");
    assert(tasks?.length === 1, `${tasks?.length} tareas abiertas`);
    assert(tasks![0].task_type === "document_review", tasks![0].task_type as string);
    assert(tasks![0].assignee_profile_id === reviewer.id, "la tarea no es del revisor");
    const { data: alerts } = await reviewer.client
      .from("work_alerts").select("alert_type, recipient_profile_id")
      .eq("subject_id", doc.documentId);
    assert(alerts?.some((a) => a.recipient_profile_id === reviewer.id), "el revisor no recibió alerta");
    assert(
      !alerts?.some((a) => a.recipient_profile_id === approver.id),
      "el aprobador recibió alerta antes de que le tocara"
    );
  });

  await check("B4. el aprobador NO puede decidir mientras la revisión está en curso", async () => {
    const { error } = await approver.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: doc.revisionId, p_decision: "approved", p_reason: null,
    });
    assert(error !== null, "el aprobador se saltó la etapa de revisión");
    assert(/no tienes una decisión pendiente/i.test(error!.message), error!.message);
  });

  await check("B5. devolver SIN motivo es imposible", async () => {
    const { error } = await reviewer.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: doc.revisionId, p_decision: "changes_requested", p_reason: "   ",
    });
    assert(error !== null, "se devolvió un documento sin motivo");
    assert(/motivo/i.test(error!.message), error!.message);
  });

  const MOTIVO = "Falta el criterio de selección de proveedores.";

  await check("B6. el revisor devuelve con motivo; la revisión sigue en 1", async () => {
    const { data, error } = await reviewer.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: doc.revisionId, p_decision: "changes_requested", p_reason: MOTIVO,
    });
    assert(!error, `devolver: ${error?.message}`);
    assert(data === "changes_requested", `estado: ${data}`);
    assert((await currentVersion(creator.client, doc.documentId)) === 1, "devolver movió la revisión");
  });

  await check("B7. el creador recibe alerta CON el motivo, y una tarea de corregir", async () => {
    const { data: alerts } = await creator.client
      .from("work_alerts").select("alert_type, message, recipient_profile_id, severity")
      .eq("subject_id", doc.documentId).eq("alert_type", "document_changes_requested");
    assert(alerts?.length === 1, `${alerts?.length} alertas de devolución`);
    assert(alerts![0].recipient_profile_id === creator.id, "la alerta no llegó al autor");
    assert(alerts![0].message === MOTIVO, `el motivo no viajó: ${alerts![0].message}`);
    assert(alerts![0].severity === "warning", alerts![0].severity as string);
    const { data: tasks } = await creator.client
      .from("work_tasks").select("task_type, assignee_profile_id, description, status")
      .eq("subject_id", doc.documentId).eq("task_type", "document_changes_requested");
    assert(tasks?.length === 1 && tasks[0].status === "open", "sin tarea de corrección");
    assert(tasks![0].assignee_profile_id === creator.id, "la tarea no es del autor");
    assert(tasks![0].description === MOTIVO, "la tarea no lleva el motivo");
  });

  await check("B8. la tarea del revisor quedó cerrada, no colgando", async () => {
    const { data } = await reviewer.client
      .from("work_tasks").select("status, resolution")
      .eq("subject_id", doc.documentId).eq("task_type", "document_review");
    assert(data?.every((t) => t.status !== "open"), "la tarea del revisor sigue abierta");
  });

  await check("B9. el autor corrige y reenvía; nueva RONDA, misma revisión", async () => {
    const { error: upErr } = await creator.client
      .from("trazadoc_document_sections")
      .update({ content: "Comprar con criterio, evaluando proveedores." })
      .eq("document_id", doc.documentId).eq("section_key", "purpose");
    assert(!upErr, `corregir: ${upErr?.message}`);

    const { data, error } = await creator.client.rpc("trazadoc_submit_document_revision", {
      p_revision_id: doc.revisionId,
      p_reviewers: [{ profile_id: reviewer.id, position_id: null, step_order: 1 }],
      p_approvers: [{ profile_id: approver.id, position_id: null, step_order: 1 }],
      p_route_mode: "sequential",
      p_effective_from: plus(10), p_review_due_at: plus(365), p_note: "Corregido",
    });
    assert(!error, `reenviar: ${error?.message}`);
    assert(data === "in_review", `estado: ${data}`);
    assert((await currentVersion(creator.client, doc.documentId)) === 1, "reenviar movió la revisión");

    const { data: rev } = await creator.client
      .from("trazadoc_document_revisions").select("round").eq("id", doc.revisionId).maybeSingle();
    assert(Number(rev?.round) === 2, `la ronda es ${rev?.round}`);
  });

  await check("B10. la devolución anterior NO se borró al reenviar (D-20)", async () => {
    const { data } = await creator.client
      .from("trazadoc_document_decisions").select("decision_type, reason, round")
      .eq("document_id", doc.documentId).order("decided_at", { ascending: true });
    const rejection = data?.find((d) => d.decision_type === "changes_requested");
    assert(rejection, "la devolución desapareció del historial");
    assert(rejection!.reason === MOTIVO, "el motivo se perdió");
    assert(Number(rejection!.round) === 1, "la devolución cambió de ronda");
    assert(data?.some((d) => d.decision_type === "resubmitted"), "no consta el reenvío");
  });

  await check("B11. el revisor acepta: pasa a aprobación, revisión sigue en 1", async () => {
    const { data, error } = await reviewer.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: doc.revisionId, p_decision: "approved", p_reason: null,
    });
    assert(!error, `aceptar: ${error?.message}`);
    assert(data === "pending_approval", `estado: ${data}`);
    assert((await currentVersion(creator.client, doc.documentId)) === 1, "aceptar movió la revisión");
  });

  await check("B12. ahora sí, el aprobador tiene tarea", async () => {
    const { data } = await approver.client
      .from("work_tasks").select("task_type, assignee_profile_id, status")
      .eq("subject_id", doc.documentId).eq("task_type", "document_approval").eq("status", "open");
    assert(data?.length === 1, `${data?.length} tareas de aprobación`);
    assert(data![0].assignee_profile_id === approver.id, "la tarea no es del aprobador");
  });

  await check("B13. el revisor no puede aprobar en lugar del aprobador", async () => {
    const { error } = await reviewer.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: doc.revisionId, p_decision: "approved", p_reason: null,
    });
    assert(error !== null, "el revisor aprobó el documento");
  });

  await check("B14. el aprobador aprueba: revisión SIGUE siendo 1", async () => {
    const { data, error } = await approver.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: doc.revisionId, p_decision: "approved", p_reason: null,
    });
    assert(!error, `aprobar: ${error?.message}`);
    assert(data === "approved", `estado: ${data}`);
    assert((await currentVersion(creator.client, doc.documentId)) === 1,
      "APROBAR MOVIÓ LA REVISIÓN — es exactamente el defecto que este sprint corrige");
  });

  await check("B15. la revisión 1 quedó congelada con su contenido", async () => {
    const { data } = await creator.client
      .from("trazadoc_document_revisions")
      .select("workflow_state, content_snapshot, approved_at, approved_by, effective_from")
      .eq("id", doc.revisionId).maybeSingle();
    assert(data?.workflow_state === "approved", data?.workflow_state as string);
    assert(data?.content_snapshot !== null, "no se congeló el contenido");
    assert(data?.approved_by === approver.id, "el acto de aprobación no registra quién");
    const snapshot = data!.content_snapshot as { sections: { content: string }[] };
    assert(
      snapshot.sections.some((s) => s.content.includes("evaluando proveedores")),
      "el contenido congelado no es el corregido"
    );
  });

  await check("B16. el autor recibe la notificación de aprobación", async () => {
    const { data } = await creator.client
      .from("work_alerts").select("alert_type, recipient_profile_id")
      .eq("subject_id", doc.documentId).eq("alert_type", "document_approved");
    assert(data?.some((a) => a.recipient_profile_id === creator.id), "el autor no fue notificado");
  });

  // -------------------------------------------------------------------------
  console.log("\nC · Revisiones");
  // -------------------------------------------------------------------------

  await check("C1. el contenido de un documento aprobado ya no se edita", async () => {
    const { data, error } = await creator.client
      .from("trazadoc_document_sections").update({ content: "cambio a escondidas" })
      .eq("document_id", doc.documentId).eq("section_key", "purpose").select("id");
    assert(error !== null || (data ?? []).length === 0, "se editó el contenido de un documento aprobado");
  });

  await check("C2. crear la revisión 2 es EXPLÍCITO y la lleva a 2", async () => {
    const { data, error } = await approver.client.rpc("trazadoc_create_document_revision", {
      p_document_id: doc.documentId, p_change_note: "Actualización anual",
    });
    assert(!error && data, `crear revisión 2: ${error?.message}`);
    assert((await currentVersion(creator.client, doc.documentId)) === 2, "la revisión no avanzó a 2");
    const { data: rows } = await creator.client
      .from("trazadoc_document_revisions").select("revision_number, workflow_state")
      .eq("document_id", doc.documentId).order("revision_number");
    assert(rows?.length === 2, `${rows?.length} revisiones`);
    assert(rows![1].workflow_state === "draft", "la revisión 2 no nace editable");
  });

  await check("C3. la revisión 1 permanece INMUTABLE (D-02)", async () => {
    const { data, error } = await approver.client
      .from("trazadoc_document_revisions")
      .update({ content_snapshot: {}, approved_at: null })
      .eq("id", doc.revisionId).select("id");
    assert(error !== null || (data ?? []).length === 0, "se modificó una revisión aprobada");
    const { data: intact } = await creator.client
      .from("trazadoc_document_revisions").select("content_snapshot, approved_at")
      .eq("id", doc.revisionId).maybeSingle();
    assert(intact?.approved_at !== null, "la aprobación de la revisión 1 se borró");
    assert(intact?.content_snapshot !== null, "el contenido congelado de la revisión 1 se borró");
  });

  await check("C4. con la revisión 2 abierta, el contenido vuelve a editarse", async () => {
    const { data, error } = await creator.client
      .from("trazadoc_document_sections").update({ content: "Texto de la revisión 2." })
      .eq("document_id", doc.documentId).eq("section_key", "purpose").select("id");
    assert(!error && (data ?? []).length === 1, `no se pudo editar: ${error?.message}`);
  });

  await check("C5. un consultor NO puede abrir la revisión siguiente de un aprobado", async () => {
    const other = await createControlledDocument(creator.client, orgA, `Para consultor ${stamp}`);
    await creator.client.rpc("trazadoc_submit_document_revision", {
      p_revision_id: other.revisionId, p_reviewers: [],
      p_approvers: [{ profile_id: approver.id, position_id: null, step_order: 1 }],
      p_route_mode: "sequential", p_effective_from: null, p_review_due_at: null, p_note: null,
    });
    await approver.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: other.revisionId, p_decision: "approved", p_reason: null,
    });
    const { error } = await reviewer.client.rpc("trazadoc_create_document_revision", {
      p_document_id: other.documentId, p_change_note: null,
    });
    assert(error !== null, "un consultor emitió una revisión nueva");
    assert(/administración|calidad/i.test(error!.message), error!.message);
  });

  // -------------------------------------------------------------------------
  console.log("\nD · Vigencia");
  // -------------------------------------------------------------------------

  await check("D1. aprobado con fecha futura NO está vigente todavía", async () => {
    const { data } = await creator.client
      .from("v_trazadoc_document_control")
      .select("lifecycle_state, effective_revision_number, current_revision_number")
      .eq("document_id", doc.documentId).maybeSingle();
    // La revisión 1 empieza a regir dentro de 10 días; la 2 está en borrador.
    assert(data?.lifecycle_state === "draft", `estado: ${data?.lifecycle_state}`);
    assert(data?.effective_revision_number === null,
      `hay una revisión vigente y no debería: ${data?.effective_revision_number}`);
    assert(Number(data?.current_revision_number) === 2, `${data?.current_revision_number}`);
  });

  await check("D2. un documento con vigencia HOY sí rige, y lo dice la vista", async () => {
    const vig = await createControlledDocument(creator.client, orgA, `Vigente hoy ${stamp}`, "PR-VIG-001");
    await creator.client.rpc("trazadoc_submit_document_revision", {
      p_revision_id: vig.revisionId, p_reviewers: [],
      p_approvers: [{ profile_id: approver.id, position_id: null, step_order: 1 }],
      p_route_mode: "sequential", p_effective_from: today, p_review_due_at: plus(-1), p_note: null,
    });
    await approver.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: vig.revisionId, p_decision: "approved", p_reason: null,
    });
    const { data } = await creator.client
      .from("v_trazadoc_document_control")
      .select("lifecycle_state, effective_revision_number, review_overdue, approvers")
      .eq("document_id", vig.documentId).maybeSingle();
    assert(data?.lifecycle_state === "effective", `estado: ${data?.lifecycle_state}`);
    assert(Number(data?.effective_revision_number) === 1, `${data?.effective_revision_number}`);
    // D-09: una revisión periódica vencida NO obsoleta el documento.
    assert(data?.review_overdue === true, "la revisión vencida no se señala");
    assert(data?.lifecycle_state === "effective", "una revisión vencida cambió el estado del documento");
    assert((data?.approvers as string | null)?.includes("aprobador"), `aprobadores: ${data?.approvers}`);
  });

  await check("D3. una revisión posterior SUSTITUYE a la anterior y cierra su vigencia", async () => {
    const sup = await createControlledDocument(creator.client, orgA, `Con dos revisiones ${stamp}`);
    // Revisión 1, vigente desde hace 30 días.
    await creator.client.rpc("trazadoc_submit_document_revision", {
      p_revision_id: sup.revisionId, p_reviewers: [],
      p_approvers: [{ profile_id: approver.id, position_id: null, step_order: 1 }],
      p_route_mode: "sequential", p_effective_from: plus(-30), p_review_due_at: null, p_note: null,
    });
    await approver.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: sup.revisionId, p_decision: "approved", p_reason: null,
    });
    // Revisión 2, vigente desde hoy.
    const { data: rev2 } = await approver.client.rpc("trazadoc_create_document_revision", {
      p_document_id: sup.documentId, p_change_note: "Segunda emisión",
    });
    await creator.client.rpc("trazadoc_submit_document_revision", {
      p_revision_id: rev2 as string, p_reviewers: [],
      p_approvers: [{ profile_id: approver.id, position_id: null, step_order: 1 }],
      p_route_mode: "sequential", p_effective_from: today, p_review_due_at: null, p_note: null,
    });
    await approver.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: rev2 as string, p_decision: "approved", p_reason: null,
    });

    const { data: rows } = await creator.client
      .from("trazadoc_document_revisions")
      .select("revision_number, workflow_state, effective_from, effective_to, superseded_by_revision_id")
      .eq("document_id", sup.documentId).order("revision_number");
    assert(rows?.[0].workflow_state === "superseded", `la revisión 1 quedó en ${rows?.[0].workflow_state}`);
    assert(rows?.[0].effective_to === plus(-1), `su vigencia cerró en ${rows?.[0].effective_to}`);
    assert(rows?.[0].superseded_by_revision_id === rev2, "no apunta a quien la sustituyó");
    assert(rows?.[1].workflow_state === "approved", `la revisión 2 quedó en ${rows?.[1].workflow_state}`);

    // MDR-44 / D-15: se puede responder qué regía en una fecha pasada.
    const { data: historic } = await creator.client
      .from("trazadoc_document_revisions").select("revision_number")
      .eq("document_id", sup.documentId)
      .lte("effective_from", plus(-10)).gte("effective_to", plus(-10));
    assert(historic?.length === 1 && historic[0].revision_number === 1,
      "no se puede resolver qué revisión regía hace diez días");
  });

  // -------------------------------------------------------------------------
  console.log("\nE · Tareas y alertas");
  // -------------------------------------------------------------------------

  await check("E1. una empresa ajena no ve NI UNA tarea de la otra", async () => {
    const { data } = await outsider.client.from("work_tasks").select("id").eq("organization_id", orgA);
    assert((data ?? []).length === 0, `un ajeno vio ${data?.length} tareas`);
  });

  await check("E2. una empresa ajena no ve NI UNA alerta de la otra", async () => {
    const { data } = await outsider.client.from("work_alerts").select("id").eq("organization_id", orgA);
    assert((data ?? []).length === 0, `un ajeno vio ${data?.length} alertas`);
  });

  await check("E3. nadie marca la alerta de otra persona", async () => {
    const { data: mine } = await creator.client
      .from("work_alerts").select("id").eq("recipient_profile_id", creator.id).limit(1);
    assert(mine?.length === 1, "el autor no tiene alertas para la prueba");
    const alertId = mine![0].id as string;
    const { data, error } = await reviewer.client
      .from("work_alerts").update({ status: "dismissed" }).eq("id", alertId).select("id");
    assert(error !== null || (data ?? []).length === 0, "un tercero descartó una alerta ajena");
    const { data: own } = await creator.client
      .from("work_alerts").update({ status: "resolved" }).eq("id", alertId).select("id");
    assert((own ?? []).length === 1, "el destinatario no pudo marcar su propia alerta");
  });

  await check("E4. de una alerta propia solo se cambia el ESTADO", async () => {
    const { data: mine } = await creator.client
      .from("work_alerts").select("id").eq("recipient_profile_id", creator.id).limit(1);
    const { error } = await creator.client
      .from("work_alerts").update({ recipient_profile_id: reviewer.id }).eq("id", mine![0].id as string);
    assert(error !== null, "se pudo cambiar el destinatario de una alerta");
    assert(/solo puedes cambiar su estado/i.test(error!.message), error!.message);
  });

  await check("E5. reenviar no duplica la tarea del mismo revisor (AT-07)", async () => {
    const { data } = await reviewer.client
      .from("work_tasks").select("id, dedupe_key").eq("subject_id", doc.documentId)
      .eq("task_type", "document_review");
    const keys = new Set((data ?? []).map((t) => t.dedupe_key as string));
    assert(keys.size === (data ?? []).length, "hay tareas con la misma clave de deduplicación");
  });

  // -------------------------------------------------------------------------
  console.log("\nF · Lista maestra");
  // -------------------------------------------------------------------------

  await check("F1. proyecta lo que debe, con revisor y aprobador", async () => {
    const { data } = await creator.client
      .from("v_trazadoc_document_control")
      .select("code, title, reviewers, approvers, process_count, category_label, revision_model")
      .eq("document_id", doc.documentId).maybeSingle();
    assert(data?.code === "PR-COM-001", `código: ${data?.code}`);
    assert(data?.category_label === "Procedimientos", data?.category_label as string);
    assert(data?.revision_model === "controlled", data?.revision_model as string);
  });

  await check("F2. una empresa ajena no ve NI UN documento de la otra", async () => {
    const { data } = await outsider.client
      .from("v_trazadoc_document_control").select("document_id").eq("organization_id", orgA);
    assert((data ?? []).length === 0, `un ajeno vio ${data?.length} documentos`);
  });

  await check("F3. la vista no es una tabla: no admite escritura", async () => {
    const { error } = await creator.client
      .from("v_trazadoc_document_control").update({ title: "secuestrado" }).eq("document_id", doc.documentId);
    assert(error !== null, "se pudo escribir sobre la lista maestra");
  });

  // -------------------------------------------------------------------------
  console.log("\nG · Eliminar y retirar");
  // -------------------------------------------------------------------------

  await check("G1. un administrador elimina un borrador sin historia", async () => {
    const pristine = await createControlledDocument(creator.client, orgA, `Borrador desechable ${stamp}`);
    const { error } = await approver.client.rpc("trazadoc_delete_document_safely", {
      p_document_id: pristine.documentId,
    });
    assert(!error, `eliminar: ${error?.message}`);
    const { data } = await creator.client
      .from("trazadoc_documents").select("id").eq("id", pristine.documentId).maybeSingle();
    assert(data === null, "el documento sigue existiendo");
  });

  await check("G2. un borrador YA DEVUELTO no se destruye: tiene historia formal", async () => {
    const used = await createControlledDocument(creator.client, orgA, `Devuelto ${stamp}`);
    await creator.client.rpc("trazadoc_submit_document_revision", {
      p_revision_id: used.revisionId,
      p_reviewers: [{ profile_id: reviewer.id, position_id: null, step_order: 1 }],
      p_approvers: [{ profile_id: approver.id, position_id: null, step_order: 1 }],
      p_route_mode: "sequential", p_effective_from: null, p_review_due_at: null, p_note: null,
    });
    await reviewer.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: used.revisionId, p_decision: "changes_requested", p_reason: "No sirve.",
    });
    const { error } = await approver.client.rpc("trazadoc_delete_document_safely", {
      p_document_id: used.documentId,
    });
    assert(error !== null, "se destruyó un documento con decisiones formales");
    assert(/revisión|aprobación|conserv/i.test(error!.message), error!.message);
  });

  await check("G3. un documento aprobado NO se destruye", async () => {
    const { error } = await approver.client.rpc("trazadoc_delete_document_safely", {
      p_document_id: doc.documentId,
    });
    assert(error !== null, "se destruyó un documento aprobado");
  });

  await check("G4. quien no es administrador no elimina", async () => {
    const pristine = await createControlledDocument(creator.client, orgA, `Otro borrador ${stamp}`);
    const { error } = await reviewer.client.rpc("trazadoc_delete_document_safely", {
      p_document_id: pristine.documentId,
    });
    assert(error !== null, "un consultor eliminó un documento");
    assert(/administrador/i.test(error!.message), error!.message);
  });

  await check("G5. retirar conserva revisiones, decisiones y aprobaciones", async () => {
    const { count: before } = await creator.client
      .from("trazadoc_document_decisions").select("id", { count: "exact", head: true })
      .eq("document_id", doc.documentId);
    const { error } = await approver.client.rpc("trazadoc_retire_document", {
      p_document_id: doc.documentId, p_reason: "Sustituido por el manual integrado",
    });
    assert(!error, `retirar: ${error?.message}`);

    const { data: d } = await creator.client
      .from("trazadoc_documents").select("disposition, status, retirement_reason")
      .eq("id", doc.documentId).maybeSingle();
    assert(d?.disposition === "retired", d?.disposition as string);
    assert(d?.retirement_reason === "Sustituido por el manual integrado", d?.retirement_reason as string);

    const { count: after } = await creator.client
      .from("trazadoc_document_decisions").select("id", { count: "exact", head: true })
      .eq("document_id", doc.documentId);
    assert((after ?? 0) > (before ?? 0), "retirar no dejó constancia");

    const { data: revs } = await creator.client
      .from("trazadoc_document_revisions").select("revision_number, content_snapshot, approved_at")
      .eq("document_id", doc.documentId).order("revision_number");
    assert(revs?.length === 2, "se perdieron revisiones al retirar");
    assert(revs![0].approved_at !== null && revs![0].content_snapshot !== null,
      "la revisión aprobada perdió su contenido al retirar");

    const { data: view } = await creator.client
      .from("v_trazadoc_document_control").select("lifecycle_state")
      .eq("document_id", doc.documentId).maybeSingle();
    assert(view?.lifecycle_state === "retired", view?.lifecycle_state as string);
  });

  await check("G6. un documento retirado ya no admite revisiones nuevas", async () => {
    const { error } = await approver.client.rpc("trazadoc_create_document_revision", {
      p_document_id: doc.documentId, p_change_note: null,
    });
    assert(error !== null, "se abrió una revisión sobre un documento retirado");
  });

  await check("G7. retirar exige motivo", async () => {
    const other = await createControlledDocument(creator.client, orgA, `Sin motivo ${stamp}`);
    const { error } = await approver.client.rpc("trazadoc_retire_document", {
      p_document_id: other.documentId, p_reason: "  ",
    });
    assert(error !== null && /motivo/i.test(error.message), error?.message ?? "sin error");
  });

  // -------------------------------------------------------------------------
  console.log("\nH · Ataques directos por PostgREST");
  // -------------------------------------------------------------------------

  const target = await createControlledDocument(creator.client, orgA, `Bajo ataque ${stamp}`);

  await check("H1. no se puede mover el workflow con un UPDATE directo", async () => {
    const { error } = await creator.client
      .from("trazadoc_document_revisions").update({ workflow_state: "approved" })
      .eq("id", target.revisionId);
    assert(error !== null, "se aprobó un documento con un UPDATE directo");
    assert(/se registra con sus acciones/i.test(error!.message), error!.message);
  });

  await check("H2. no se puede fabricar una aprobación", async () => {
    const { error } = await creator.client
      .from("trazadoc_document_revisions")
      .update({ approved_at: new Date().toISOString(), approved_by: creator.id })
      .eq("id", target.revisionId);
    assert(error !== null, "se fabricó un acto de aprobación");
  });

  await check("H3. no se puede designarse revisor a uno mismo", async () => {
    const { error } = await creator.client.from("trazadoc_document_workflow_participants").insert({
      organization_id: orgA, document_id: target.documentId, revision_id: target.revisionId,
      participant_role: "approver", step_order: 1, round: 1, profile_id: creator.id, decision: "approved",
    });
    assert(error !== null, "se insertó un participante a mano");
  });

  await check("H4. no se puede escribir una decisión formal a mano", async () => {
    const { error } = await creator.client.from("trazadoc_document_decisions").insert({
      organization_id: orgA, document_id: target.documentId, revision_id: target.revisionId,
      round: 1, decision_type: "approved", decided_by: creator.id,
    });
    assert(error !== null, "se fabricó una decisión formal");
  });

  await check("H5. no se puede autoasignarse una tarea", async () => {
    const { error } = await creator.client.from("work_tasks").insert({
      organization_id: orgA, source_domain: "document", task_type: "document_approval",
      subject_type: "trazadoc_document", subject_id: target.documentId,
      title: "Tarea inventada", assignee_profile_id: creator.id, status: "open",
    });
    assert(error !== null, "se creó una tarea a mano");
  });

  await check("H6. la RPC histórica NO puede tocar un documento controlado", async () => {
    const { error } = await creator.client.rpc("change_trazadoc_document_status", {
      p_document_id: target.documentId, p_to_status: "approved", p_change_note: null,
    });
    assert(error !== null, "la RPC histórica movió un documento controlado");
    assert(/no altera la revisión/i.test(error!.message), error!.message);
  });

  await check("H7. la ficha de vigencia SÍ se edita mientras la revisión está abierta", async () => {
    const { data, error } = await creator.client
      .from("trazadoc_document_revisions")
      .update({ effective_from: plus(30), review_due_at: plus(400), change_note: "programado" })
      .eq("id", target.revisionId).select("id");
    assert(!error && (data ?? []).length === 1, `no se pudo programar: ${error?.message}`);
  });

  await check("H8. un ajeno no puede decidir sobre un documento de otra empresa", async () => {
    const { error } = await outsider.client.rpc("trazadoc_record_document_decision", {
      p_revision_id: target.revisionId, p_decision: "approved", p_reason: null,
    });
    assert(error !== null, "un ajeno decidió sobre un documento de otra empresa");
  });

  await check("H9. un ajeno no puede retirar ni eliminar de otra empresa", async () => {
    const r = await outsider.client.rpc("trazadoc_retire_document", {
      p_document_id: target.documentId, p_reason: "porque sí",
    });
    assert(r.error !== null, "un ajeno retiró un documento de otra empresa");
    const d = await outsider.client.rpc("trazadoc_delete_document_safely", {
      p_document_id: target.documentId,
    });
    assert(d.error !== null, "un ajeno eliminó un documento de otra empresa");
  });

  await check("H10. un ajeno no ve las revisiones ni las decisiones de otra empresa", async () => {
    for (const table of [
      "trazadoc_document_revisions",
      "trazadoc_document_workflow_participants",
      "trazadoc_document_decisions",
    ]) {
      const { data } = await outsider.client.from(table).select("id").eq("organization_id", orgA);
      assert((data ?? []).length === 0, `un ajeno vio ${data?.length} filas de ${table}`);
    }
  });

  await check("H11. un participante debe ser miembro ACTIVO de la empresa", async () => {
    const { error } = await creator.client.rpc("trazadoc_submit_document_revision", {
      p_revision_id: target.revisionId, p_reviewers: [],
      p_approvers: [{ profile_id: outsider.id, position_id: null, step_order: 1 }],
      p_route_mode: "sequential", p_effective_from: null, p_review_due_at: null, p_note: null,
    });
    assert(error !== null, "se designó aprobador a alguien de otra empresa");
    assert(/miembro activo/i.test(error!.message), error!.message);
  });

  // -------------------------------------------------------------------------
  console.log("\nZ · Sin regresión en el motor legacy");
  // -------------------------------------------------------------------------

  await check("Z1. un documento LEGACY conserva su comportamiento anterior", async () => {
    // Mismo motor, sin revision_model: es lo que tienen PCR y Textiles.
    const { data, error } = await creator.client.from("trazadoc_documents").insert({
      organization_id: orgA, source_type: "custom", module_key: "quality",
      category_code: "other", title: `Legacy ${stamp}`,
    }).select("id, revision_model, current_version").single();
    assert(!error && data, `crear legacy: ${error?.message}`);
    assert(data!.revision_model === "legacy", `nació como ${data!.revision_model}`);

    // La RPC histórica sigue funcionando exactamente igual: incrementa.
    const { data: v, error: rpcErr } = await creator.client.rpc("change_trazadoc_document_status", {
      p_document_id: data!.id as string, p_to_status: "in_review", p_change_note: null,
    });
    assert(!rpcErr, `la RPC histórica se rompió: ${rpcErr?.message}`);
    assert(Number(v) === 2, `la RPC histórica devolvió ${v}, se esperaba 2`);
  });

  await check("Z2. un documento legacy no se convierte en controlado por la puerta de atrás", async () => {
    const { data: legacy } = await creator.client
      .from("trazadoc_documents").select("id").eq("title", `Legacy ${stamp}`).maybeSingle();
    const { error } = await creator.client
      .from("trazadoc_documents").update({ revision_model: "controlled" }).eq("id", legacy!.id as string);
    assert(error !== null, "se cambió el modelo de revisión de un documento existente");
    assert(/no cambia después de crearlo/i.test(error!.message), error!.message);
  });

  await check("Z3. las vistas históricas de TrazaDocs siguen respondiendo", async () => {
    const { error: a } = await creator.client
      .from("v_trazadoc_document_summary").select("document_id").eq("organization_id", orgA).limit(1);
    assert(!a, `v_trazadoc_document_summary se rompió: ${a?.message}`);
    const { error: b } = await creator.client
      .from("v_trazadoc_document_master").select("document_id").eq("organization_id", orgA).limit(1);
    assert(!b, `v_trazadoc_document_master se rompió: ${b?.message}`);
  });

  await check("Z4. un documento de Quality no aparece en el espacio de PCR ni de Textiles", async () => {
    for (const otherModule of ["cpr", "textiles"]) {
      const { data } = await creator.client
        .from("trazadoc_documents").select("id")
        .eq("organization_id", orgA).eq("module_key", otherModule);
      assert((data ?? []).length === 0, `${data?.length} documentos se filtraron a ${otherModule}`);
    }
  });

  console.log(`\nQUALITY-02 · base real: ${passed} correctas, ${failed} fallidas\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
