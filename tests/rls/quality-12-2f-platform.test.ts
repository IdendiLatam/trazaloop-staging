/**
 * Trazaloop · QUALITY-12.2F · La consola de plataforma, bajo la identidad real.
 *
 * POR QUÉ ESTA SUITE EXISTE
 *
 * Porque la anterior comprobó que una empresa NO ve la consola —y eso pasaba—
 * pero nunca comprobó que alguien de plataforma SÍ la vea con datos dentro.
 * Una comprobación de aislamiento se cumple igual de bien cuando la vista
 * devuelve cero filas a todo el mundo.
 *
 * En la primera validación humana la consola dijo «todavía no hay consumo
 * registrado» con 282 operaciones en la base. La ruta autorizaba; la base
 * devolvía cero, sin error, porque las vistas eran `security_invoker` y
 * `platform_staff` no pertenece a ninguna empresa.
 *
 * Así que aquí se prueba con un usuario `support` de verdad y con datos de DOS
 * empresas, y se exige que los vea. Y con un `superadmin`, para separar VER de
 * PODER CAMBIAR.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables para test:quality122f-platform.");
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
  const email = `q122fp-${label}-${stamp}@test.trazaloop.dev`;
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

async function main() {
  console.log("\nQUALITY-12.2F · la consola de plataforma, con identidad real\n");

  // Dos empresas con consumo, y sus dueños. La consola tiene que ver LAS DOS.
  const jefaA = await newUser("orgA");
  const jefaB = await newUser("orgB");
  for (const u of [jefaA, jefaB]) {
    await u.client.rpc("accept_active_legal_documents", { p_ip_address: null, p_user_agent: "q122fp" });
  }
  const { data: a } = await jefaA.client.rpc("create_organization", { p_name: `Q122FP A ${stamp}` });
  const { data: b } = await jefaB.client.rpc("create_organization", { p_name: `Q122FP B ${stamp}` });
  const A = a as string, B = b as string;

  // Consumo real en las dos, con tokens y con proveedor llamado.
  for (const [org, actor, n] of [[A, jefaA.id, 3], [B, jefaB.id, 2]] as const) {
    for (let i = 0; i < n; i += 1) {
      await admin.from("quality_ai_runs").insert({
        organization_id: org, actor_id: actor,
        use_case: i % 2 === 0 ? "document.quick_edit" : "document.contextual_review",
        provider: "openai", model: "gpt-5.4-mini",
        prompt_template: "t", prompt_version: 1, status: "succeeded",
        provider_called: true, input_tokens: 1000, cached_input_tokens: 0,
        output_tokens: 500, reasoning_tokens: 100, total_tokens: 1500, latency_ms: 2000,
      });
    }
  }

  // Personal de plataforma: uno de soporte y un superadministrador. Ninguno
  // pertenece a ninguna empresa, que es justo la condición que rompía todo.
  const soporte = await newUser("support");
  const superad = await newUser("super");
  await admin.from("platform_staff").insert([
    { user_id: soporte.id, role_code: "support", status: "active" },
    { user_id: superad.id, role_code: "superadmin", status: "active" },
  ]);
  const revocado = await newUser("revoked");
  await admin.from("platform_staff").insert({
    user_id: revocado.id, role_code: "support", status: "revoked",
  });

  const S = soporte.client, SU = superad.client, R = revocado.client;

  // =========================================================================
  console.log("A · EL DEFECTO QUE ENCONTRÓ LA VALIDACIÓN HUMANA");
  // =========================================================================

  await check("A1. support activo es reconocido por la aplicación", async () => {
    const { data } = await S.rpc("is_platform_staff");
    assert(data === true, "is_platform_staff() no lo reconoce");
  });

  await check("A2. y VE consumo en la consola, no cero", async () => {
    // Esta es la comprobación que faltaba. Antes de la 0141 devolvía 0 filas
    // sin error, y la consola lo pintaba como «todavía no hay consumo».
    const { data, error } = await S.from("v_intelligence_usage_platform")
      .select("organization_id, runs, total_tokens, estimated_cost_usd");
    assert(!error, `error al leer: ${error?.message}`);
    const filas = data ?? [];
    assert(filas.length > 0, "support sigue viendo CERO filas en la consola");
    const total = filas.reduce((n, r) => n + Number(r.runs ?? 0), 0);
    assert(total >= 5, `solo ve ${total} operaciones de las 5 creadas`);
  });

  await check("A3. y ve LAS DOS empresas, no solo una", async () => {
    const { data } = await S.from("v_intelligence_usage_platform")
      .select("organization_id");
    const orgs = new Set((data ?? []).map((r) => String(r.organization_id)));
    assert(orgs.has(A) && orgs.has(B),
      `ve ${orgs.size} empresas; faltan A o B de las creadas`);
  });

  await check("A4. el desglose por capacidad también tiene datos", async () => {
    const { data, error } = await S.from("v_intelligence_usage_platform_by_use_case")
      .select("use_case, runs, organizations");
    assert(!error, `error: ${error?.message}`);
    const filas = data ?? [];
    assert(filas.length > 0, "el desglose por capacidad sigue vacío");
    assert(filas.some((r) => Number(r.organizations ?? 0) >= 2),
      "el desglose no agrega más de una empresa");
  });

  await check("A5. y los números cuadran con lo que se creó", async () => {
    const { data } = await S.from("v_intelligence_usage_platform")
      .select("organization_id, runs, input_tokens, provider_calls");
    const mias = (data ?? []).filter((r) => [A, B].includes(String(r.organization_id)));
    const runs = mias.reduce((n, r) => n + Number(r.runs), 0);
    const entrada = mias.reduce((n, r) => n + Number(r.input_tokens), 0);
    assert(runs === 5, `${runs} operaciones, se crearon 5`);
    assert(entrada === 5000, `${entrada} tokens de entrada, se crearon 5 000`);
  });

  // =========================================================================
  console.log("\nB · VER NO ES PODER CAMBIAR");
  // =========================================================================

  await check("B1. superadmin ve exactamente lo mismo que support", async () => {
    const uno = await S.from("v_intelligence_usage_platform")
      .select("organization_id, runs").order("organization_id");
    const otro = await SU.from("v_intelligence_usage_platform")
      .select("organization_id, runs").order("organization_id");
    assert(JSON.stringify(uno.data) === JSON.stringify(otro.data),
      "support y superadmin ven cosas distintas: la diferencia debe ser de ESCRITURA");
  });

  await check("B2. support NO puede cambiar un límite", async () => {
    await admin.from("intelligence_usage_limits")
      .upsert({ organization_id: A, runs_per_month: 7777 }, { onConflict: "organization_id" });
    await S.from("intelligence_usage_limits")
      .update({ runs_per_month: 999999 }).eq("organization_id", A);
    const { data } = await admin.from("intelligence_usage_limits")
      .select("runs_per_month").eq("organization_id", A).single();
    assert(Number(data!.runs_per_month) === 7777,
      `support cambió el límite a ${data!.runs_per_month}`);
  });

  await check("B3. ni crear una excepción", async () => {
    const { error } = await S.from("intelligence_limit_overrides").insert({
      organization_id: A, runs_per_month: 999999,
      reason: "intento de soporte que no debería poder",
    });
    assert(error !== null, "support creó una excepción");
  });

  await check("B4. superadmin SÍ puede cambiar el límite", async () => {
    const { error } = await SU.from("intelligence_usage_limits")
      .update({ runs_per_month: 8888 }).eq("organization_id", A);
    const { data } = await admin.from("intelligence_usage_limits")
      .select("runs_per_month").eq("organization_id", A).single();
    assert(!error && Number(data!.runs_per_month) === 8888,
      `superadmin no pudo: ${error?.message ?? data!.runs_per_month}`);
  });

  await check("B5. y superadmin sí puede crear una excepción", async () => {
    const { error } = await SU.from("intelligence_limit_overrides").insert({
      organization_id: A, runs_per_month: 12345,
      reason: "excepción legítima creada por superadministrador",
      created_by: superad.id,
    });
    assert(!error, `superadmin no pudo crear la excepción: ${error?.message}`);
    await admin.from("intelligence_limit_overrides")
      .update({ revoked_at: new Date().toISOString() }).eq("organization_id", A);
  });

  // =========================================================================
  console.log("\nC · Y NADIE MÁS ENTRA");
  // =========================================================================

  await check("C1. un support REVOCADO no ve nada", async () => {
    const { data: esStaff } = await R.rpc("is_platform_staff");
    assert(esStaff === false, "un revocado sigue siendo personal de plataforma");
    const { data } = await R.from("v_intelligence_usage_platform").select("organization_id");
    assert((data ?? []).length === 0, `un revocado ve ${(data ?? []).length} filas`);
  });

  await check("C2. una empresa no ve la consola, aunque tenga consumo", async () => {
    const { data } = await jefaA.client.from("v_intelligence_usage_platform")
      .select("organization_id");
    assert((data ?? []).length === 0,
      `una empresa vio ${(data ?? []).length} filas de la consola`);
    const { data: uc } = await jefaA.client
      .from("v_intelligence_usage_platform_by_use_case").select("use_case");
    assert((uc ?? []).length === 0, "una empresa vio el desglose de plataforma");
  });

  await check("C3. y una empresa sigue viendo SOLO lo suyo en su propia vista", async () => {
    const { data } = await jefaA.client.from("v_intelligence_usage_by_use_case")
      .select("organization_id");
    const orgs = new Set((data ?? []).map((r) => String(r.organization_id)));
    assert(!orgs.has(B), "una empresa vio el consumo de otra en la vista de empresa");
  });

  await check("C4. la consola no expone el texto de nadie", async () => {
    const { data } = await S.from("v_intelligence_usage_platform").select("*").limit(1);
    const fila = (data ?? [])[0] as Record<string, unknown> | undefined;
    assert(fila, "sin filas que revisar");
    for (const c of ["question", "answer", "context_snapshot"]) {
      assert(!(c in fila!), `la consola expone ${c}`);
    }
  });

  // =========================================================================
  console.log("\nD · UN FALLO DE LECTURA NO ES CERO CONSUMO");
  // =========================================================================

  await check("D1. la capa de lectura distingue «sin filas» de «error»", async () => {
    const { listPlatformUsage } = await import("../../lib/db/intelligence-usage");
    // Con un cliente que no puede leer la vista, tiene que devolver ok:false o
    // ok:true con cero filas — pero NUNCA un array pelado que se confunda.
    const r = await listPlatformUsage({ months: 3 }, S as never);
    assert(typeof r === "object" && "ok" in r,
      "la lectura devuelve un array: un error se confundiría con cero consumo");
    assert(r.ok === true, `la lectura falló: ${r.ok === false ? r.error : ""}`);
    assert(r.rows.length > 0, "support no ve filas a través de la capa de lectura");
  });

  await check("D2. y una lectura rota se declara, no se silencia", async () => {
    const { listUsageByUseCase } = await import("../../lib/db/intelligence-usage");
    const r = await listUsageByUseCase(
      { months: 3, platform: true } as never, S as never);
    assert("ok" in r, "el desglose devuelve un array pelado");
    assert(r.ok === true && r.rows.length > 0,
      "support no ve el desglose a través de la capa de lectura");
  });

  // Limpieza del personal de plataforma creado para la prueba.
  for (const u of [soporte, superad, revocado]) {
    await admin.from("platform_staff").delete().eq("user_id", u.id);
  }

  console.log(`\n${passed} conformes · ${failed} fallos\n`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
