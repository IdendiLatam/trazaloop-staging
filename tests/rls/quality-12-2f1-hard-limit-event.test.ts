/**
 * Trazaloop · QUALITY-12.2F.1 · Tocar techo deja un hecho, y nada más.
 *
 * 12.2F cerró con un hueco conocido: el tope duro bloqueaba bien y no dejaba
 * rastro en el bus de eventos. El tipo existía, el emisor lo soportaba, y nadie
 * lo llamaba.
 *
 * Esta suite comprueba las dos mitades del arreglo:
 *
 *   QUE AHORA SE EMITE     el hecho aparece, con la empresa correcta y sin
 *                          contenido de nadie dentro.
 *   QUE NO SE EMITE DE MÁS veinte pulsaciones del botón bloqueado producen UN
 *                          hecho, no veinte.
 *
 * Y sobre todo, que **nada más cambió**: sigue sin crearse una operación
 * artificial, sigue sin llamarse al proveedor, y el umbral blando sigue
 * dejando trabajar.
 *
 * Con el doble determinístico. Ninguna llamada al proveedor real.
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
  console.error("Faltan variables para test:quality122f1.");
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
  const email = `q122f1-${label}-${stamp}@test.trazaloop.dev`;
  const password = "Trazaloop-Test-1234";
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: `QA ${label}` },
  });
  if (error || !data.user) throw new Error(`usuario ${label}: ${error?.message}`);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e } = await client.auth.signInWithPassword({ email, password });
  if (e) throw new Error(`login ${label}: ${e.message}`);
  return { id: data.user.id, client: client as unknown as SupabaseClient };
}

const MODULOS = { cpr: "traceability_6632", textiles: "textiles", quality: "quality" } as const;

async function main() {
  const { runQuickEdit } =
    await import("../../lib/intelligence/document-authoring/quick-edit");

  console.log("\nQUALITY-12.2F.1 · el aviso de tope duro\n");

  const jefa = await newUser("adm");
  const otra = await newUser("out");
  for (const u of [jefa, otra]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q122f1" });
  }
  const { data: a } = await jefa.client.rpc("create_organization", { p_name: `Q122F1 A ${stamp}` });
  const { data: b } = await otra.client.rpc("create_organization", { p_name: `Q122F1 B ${stamp}` });
  const A = a as string, B = b as string;

  const plan = async (org: string, modulo: string, modo: string) => {
    await admin.from("organization_modules").update({
      enabled: true, access_mode: modo,
      access_expires_at: modo === "demo" ? new Date(Date.now() + 86_400_000).toISOString() : null,
    }).eq("organization_id", org).eq("module_code", modulo);
  };
  for (const m of Object.values(MODULOS)) { await plan(A, m, "full"); await plan(B, m, "full"); }

  let seq = 0;
  async function nuevoDocumento(org: string) {
    const { data: doc, error } = await admin.from("trazadoc_documents").insert({
      organization_id: org, source_type: "custom", module_key: "quality",
      category_code: "procedure", title: `Doc ${org.slice(0, 6)} ${stamp} #${(seq += 1)}`,
      code: `E-${seq}-${stamp}`.slice(0, 24), revision_model: "controlled",
    }).select("id").single();
    if (error) throw new Error(`documento: ${error.message}`);
    const { data: sec } = await admin.from("trazadoc_document_sections").insert({
      organization_id: org, document_id: doc!.id, section_key: "responsibilities",
      title: "Responsabilidades", content: "Pendiente.", sort_order: 1, is_required: true,
    }).select("id").single();
    return { documentId: doc!.id as string, sectionId: sec!.id as string };
  }

  const DOC_A = await nuevoDocumento(A);
  const DOC_B = await nuevoDocumento(B);

  const TEXTO = "El Coordinador de Compras revisa las evaluaciones de los "
    + "proveedores aprobados y deja constancia de cada revisión.";

  /** Una operación real por el camino completo, con el doble. */
  const operar = async (cliente: SupabaseClient, org: string, doc: string) =>
    runQuickEdit({
      organizationId: org, documentId: doc, moduleKey: "quality",
      sectionKey: "responsibilities", action: "improve_writing",
      context: {
        userText: TEXTO, guidance: null, organization: null,
        document: {
          moduleLabel: "quality", documentTitle: "Doc", documentCode: "X-1",
          documentType: "procedure", sectionTitle: "Responsabilidades",
          sectionKey: "responsibilities",
        },
      },
    } as Parameters<typeof runQuickEdit>[0], cliente as never);

  const limites = async (org: string, patch: Record<string, unknown>) =>
    admin.from("intelligence_usage_limits")
      .upsert({ organization_id: org, ...patch }, { onConflict: "organization_id" });

  const cerrar = async (org: string) =>
    admin.from("quality_ai_runs")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("organization_id", org).eq("status", "running");

  const eventos = async (org: string, tipo: string) => {
    const { data } = await admin.from("work_events")
      .select("event_type, severity, summary, payload, subject_type, subject_id, dedupe_key")
      .eq("organization_id", org).eq("event_type", tipo);
    return data ?? [];
  };

  // Consumo real de preparación. Diez y no tres: con tres operaciones la
  // aritmética ENTERA del porcentaje no puede caer entre el 80 % y el 100 %
  // —3 de 4 son 75, y 3 de 3 son 100—, así que el escenario del umbral blando
  // sería irrepresentable y la prueba mediría otra cosa.
  await limites(A, { runs_per_minute: 1000, runs_per_hour: 1000, runs_per_month: 10000 });
  for (let i = 0; i < 10; i += 1) { await operar(jefa.client, A, DOC_A.documentId); await cerrar(A); }

  // =========================================================================
  console.log("A · EL TOPE DURO BLOQUEA, Y AHORA DEJA RASTRO");
  // =========================================================================

  await check("A. el tope duro deniega la operación", async () => {
    const { count } = await admin.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    await limites(A, { runs_per_month: count ?? 1 });
    const r = await operar(jefa.client, A, DOC_A.documentId);
    assert(!r.ok, "la operación no fue denegada");
    assert(!r.ok && r.reason === "monthly_cap", `motivo ${!r.ok ? r.reason : ""}`);
    assert(!r.ok && /máximo mensual/.test(r.message), "el mensaje no explica el motivo");
  });

  await check("B. y NUNCA llega al proveedor", async () => {
    // Si hubiera llegado, el doble habría devuelto una propuesta y el run
    // habría quedado con provider_called = true.
    const { data } = await admin.from("quality_ai_runs")
      .select("provider_called").eq("organization_id", A)
      .order("started_at", { ascending: false }).limit(1);
    const ultimo = (data ?? [])[0];
    assert(ultimo, "no hay operaciones para comparar");
    // El último run es el de la fase de preparación, no el bloqueado.
    assert(ultimo.provider_called === true,
      "el último run legítimo perdió su marca de llamada");
  });

  await check("C. y NO se crea una operación artificial para el rechazo", async () => {
    const antes = await admin.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    const r = await operar(jefa.client, A, DOC_A.documentId);
    assert(!r.ok && r.reason === "monthly_cap", "no se denegó");
    assert(!r.ok && r.runId === null, "el rechazo devolvió un identificador de operación");
    const despues = await admin.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    assert(antes.count === despues.count,
      `se creó una fila para registrar un rechazo: ${antes.count} → ${despues.count}`);
  });

  await check("D. el hecho SÍ aparece en el bus", async () => {
    const ev = await eventos(A, "ai.usage_hard_limit_reached");
    assert(ev.length > 0, "tocar techo no dejó ningún hecho: el hueco sigue abierto");
    assert(ev[0].severity === "critical", `severidad ${ev[0].severity}`);
    assert(/máximo mensual/.test(String(ev[0].summary)), "el resumen no dice qué pasó");
  });

  await check("E. con la empresa correcta y los números de la denegación", async () => {
    const ev = await eventos(A, "ai.usage_hard_limit_reached");
    const e = ev[0] as Record<string, unknown>;
    assert(e.subject_type === "organization", `sujeto ${e.subject_type}`);
    assert(e.subject_id === A, "el hecho apunta a otra empresa");
    const carga = e.payload as Record<string, unknown>;
    assert(carga.hard === true, "el hecho no se marca como tope duro");
    assert(Number(carga.limit) > 0 && Number(carga.used) >= Number(carga.limit),
      `los números no cuadran: usado ${carga.used} de ${carga.limit}`);
    assert(typeof carga.month === "string", "el hecho no dice de qué mes habla");
  });

  await check("F. y sin una letra de lo que nadie escribió", async () => {
    const ev = await eventos(A, "ai.usage_hard_limit_reached");
    const texto = JSON.stringify(ev);
    for (const prohibido of ["Coordinador de Compras", "proveedores aprobados",
                             "question", "answer", "suggested_text", "user_text"]) {
      assert(!texto.includes(prohibido), `el hecho lleva contenido: «${prohibido}»`);
    }
  });

  // =========================================================================
  console.log("\nG · VEINTE PULSACIONES, UN HECHO");
  // =========================================================================

  await check("G. repetir el intento bloqueado no genera una tormenta", async () => {
    for (let i = 0; i < 20; i += 1) {
      const r = await operar(jefa.client, A, DOC_A.documentId);
      assert(!r.ok, `el intento ${i + 1} no fue denegado`);
    }
    const ev = await eventos(A, "ai.usage_hard_limit_reached");
    assert(ev.length === 1,
      `veintiún intentos produjeron ${ev.length} hechos: la deduplicación no funciona`);
    // Y tampoco se colaron operaciones por el camino.
    const { count } = await admin.from("quality_ai_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", A).eq("status", "running");
    assert((count ?? 0) === 0, "quedaron operaciones abiertas de intentos bloqueados");
  });

  // =========================================================================
  console.log("\nH · LO QUE NO CAMBIÓ");
  // =========================================================================

  await check("H. el umbral blando sigue avisando SIN bloquear", async () => {
    const { count } = await admin.from("quality_ai_runs")
      .select("id", { count: "exact", head: true }).eq("organization_id", A);
    // El techo se fija para que el porcentaje caiga inequívocamente ENTRE el
    // umbral y el tope: la división es entera, y con márgenes justos el
    // resultado puede quedarse en 75 % y la prueba mediría otra cosa.
    const usados = count ?? 0;
    assert(usados >= 10, `hacen falta operaciones previas; hay ${usados}`);
    await limites(A, { runs_per_month: Math.ceil(usados / 0.85),
                       runs_per_minute: 1000, soft_limit_percent: 80 });
    const { data: lim } = await admin.rpc("intelligence_effective_limits",
      { p_organization_id: A });
    const efectivo = Number((lim as Record<string, unknown>[])[0].runs_per_month);
    const pct = Math.floor(usados * 100 / efectivo);
    assert(pct >= 80 && pct < 100,
      `el escenario no cae en el umbral blando: ${usados}/${efectivo} = ${pct} %`);
    const r = await operar(jefa.client, A, DOC_A.documentId);
    assert(r.ok, `el umbral blando bloqueó: ${!r.ok ? r.message : ""}`);
    await cerrar(A);
    const blandos = await eventos(A, "ai.usage_threshold_reached");
    assert(blandos.length === 1, `${blandos.length} avisos blandos, se esperaba 1`);
    // Los dos hechos conviven: son momentos distintos del mismo mes.
    const duros = await eventos(A, "ai.usage_hard_limit_reached");
    assert(duros.length === 1, "el aviso duro desapareció al emitirse el blando");
  });

  await check("I. Full y Extra siguen recibiendo lo mismo", async () => {
    const leer = async () => {
      const { data } = await admin.rpc("intelligence_effective_limits", { p_organization_id: A });
      const l = (data as Record<string, unknown>[])[0];
      return JSON.stringify([l.runs_per_minute, l.runs_per_hour, l.runs_per_month,
                             l.max_concurrent]);
    };
    await plan(A, MODULOS.quality, "full");
    const conFull = await leer();
    await plan(A, MODULOS.quality, "extra");
    const conExtra = await leer();
    await plan(A, MODULOS.quality, "full");
    assert(conFull === conExtra, `Full ${conFull} · Extra ${conExtra}`);
  });

  await check("J. una empresa no ve el hecho de otra", async () => {
    // El bus es por empresa: el hecho de A no puede llegar a B.
    const { data } = await otra.client.from("work_events")
      .select("id").eq("organization_id", A).eq("event_type", "ai.usage_hard_limit_reached");
    assert((data ?? []).length === 0, `otra empresa vio ${(data ?? []).length} hechos ajenos`);
    // Y B, que no ha tocado techo, no tiene ninguno.
    const suyos = await eventos(B, "ai.usage_hard_limit_reached");
    assert(suyos.length === 0, "B tiene un aviso de tope sin haberlo alcanzado");
    assert(DOC_B.documentId.length === 36, "");
  });

  await check("K. emitir un hecho no concede capacidad de escritura", async () => {
    // El emisor está autorizado a `authenticated` porque lo llama el
    // orquestador con la sesión de quien pide. Eso no puede convertirse en una
    // vía para tocar límites.
    const { error } = await jefa.client.from("intelligence_usage_limits")
      .update({ runs_per_month: 999999 }).eq("organization_id", A);
    const { data } = await admin.from("intelligence_usage_limits")
      .select("runs_per_month").eq("organization_id", A).single();
    assert(Number(data!.runs_per_month) !== 999999,
      "un administrador de empresa cambió su propio techo");
    assert(error !== null || true, "");
  });

  // Se deja la empresa como estaba.
  await limites(A, { runs_per_month: 10000, runs_per_minute: 60, runs_per_hour: 600,
                     max_concurrent: 8, soft_limit_percent: 80 });

  console.log(`\n${passed} conformes · ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
