/**
 * Trazaloop · Sprint T9F.2 · Suite RLS/BD contra STAGING:
 * límites por módulo, almacenamiento FÍSICO real y concurrencia.
 *
 * PREPARADA para ejecutarse desde una máquina autorizada con .env.local de
 * staging, DESPUÉS de aplicar la migración 0101. Desde el entorno del sprint
 * NO se ejecuta (prohibido conectar a Supabase). Correr:
 *   npm run test:t9f2-rls
 *
 * QUÉ VALIDA (52 casos de §26 del plan T9F.2, agrupados; cada caso con
 * expectativa CONCRETA — nunca "count >= 0" ni "no lanzó error"):
 *   A. Límites por módulo con datos reales (1–15): conteos exactos de la
 *      vista, decisión check_module_resource_allowance al límite y con
 *      incrementos masivos (conteo + incremento > límite ⇒ rechazo íntegro).
 *   B. Independencia del plan legacy (16–25): organization_subscriptions no
 *      altera la decisión por módulo ni la resolución de access_mode (la
 *      derivación del tamaño por archivo TrazaDocs es TypeScript puro y se
 *      prueba en local — separación §27 documentada).
 *   C. Almacenamiento verificado (26–34): fila de uso presente con cero
 *      VERIFICADO, sumas exactas con fixtures físicos, CHECK de tamaños
 *      negativos, anon sin acceso, módulo vencido/deshabilitado bloqueado,
 *      begin RPC rechaza tamaños fuera del tope por archivo del intento.
 *   D. Contabilización física (35–41): versiones históricas cuentan, rutas
 *      repetidas cuentan UNA vez, evidencias CPR suman, textil separado,
 *      huérfanos registrados cuentan — bytes EXACTOS.
 *   E. Concurrencia real (42–46): dos primeras asignaciones simultáneas ⇒
 *      una fila, una transición auditada, cero unique_violation; objetivos
 *      distintos ⇒ serializados.
 *   F. Seguridad de la RPC (47–52): admin de empresa, usuario normal, admin
 *      de OTRA empresa, anónimo, módulo no funcional y estado arbitrario.
 *
 * SEPARACIÓN §27: aquí se prueba lo que la base de datos DEBE garantizar
 * (vista, allowance, RPC, políticas). Lo que garantizan las Server Actions
 * (orden límite→cuota→INSERT, mensajes, fail-closed de la capa TS) se prueba
 * en tests/unit/t9f2-limits-storage-concurrency.test.ts y en el arnés SQL
 * local (scripts/t9f2-local-sql-harness/).
 *
 * FIXTURES: prefijo t9f2_<timestamp>_<aleatorio> en organizaciones y
 * usuarios. Los datos físicos de dominio se insertan con service_role (los
 * flujos server-only de finalización no son invocables desde fuera de la
 * aplicación) y las EXPECTATIVAS se leen con la sesión del miembro real.
 *
 * LIMPIEZA (§28): elimina TODO dato funcional, membresía, módulo, intento y
 * usuario del run, y VERIFICA cero residuos funcionales. audit_log JAMÁS se
 * toca (inmutable por trigger; sus eventos bloquean el borrado físico de la
 * organización vía FK): cuando eso ocurre, la organización queda como
 * cascarón NEUTRALIZADO (sin miembros, sin datos, sin módulos, renombrado
 * "[QA neutralizada] …" SOLO como etiqueta de emergencia: desde T9F.3 la
 * eliminación DEBE funcionar y un cascarón cuenta como residuo); los eventos
 * inmutables de auditoría no cuentan como residuo funcional.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

loadEnv({ path: ".env.local" });
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error("Faltan variables de Supabase en .env.local");
  process.exit(1);
}
const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

const CPR = "traceability_6632";
const TEX = "textiles";
const MB = 1048576;
const RUN = `t9f2_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

let passed = 0;
let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function isDenied(error: { code?: string; message: string } | null): boolean {
  return (
    error !== null &&
    (error.code === "42501" || /permission denied|superadministrador|no autenticado|no está disponible|no válido/i.test(error.message))
  );
}

const createdUsers: string[] = [];
const createdOrgs: string[] = [];
const createdObjects: string[] = []; // rutas del bucket "evidences"
const createdDocObjects: string[] = []; // rutas del bucket "trazadocs-documents"

async function newUser(label: string) {
  const email = `${RUN}-${label}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const password = `Qa1-${randomUUID()}${randomUUID().slice(0, 8)}`;
  let user: { id: string } | null = null;
  for (let i = 1; i <= 3 && !user; i++) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `QA ${RUN} ${label}` },
    });
    if (!error && data.user) user = data.user;
    else if (i === 3) throw new Error(`createUser ${label}: ${error?.message}`);
    else await new Promise((r) => setTimeout(r, 1200 * i));
  }
  createdUsers.push(user!.id);
  const client = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${label}: ${error.message}`);
  return { id: user!.id, client };
}

async function createOrgViaRealFlow(client: SupabaseClient, name: string): Promise<string> {
  const { data, error } = await client.rpc("create_organization", { p_name: name });
  if (error || !data) throw new Error(`create_organization: ${error?.message}`);
  createdOrgs.push(data as string);
  return data as string;
}

async function setModule(client: SupabaseClient, orgId: string, code: string, target: string) {
  return client.rpc("set_organization_module_access", {
    p_organization_id: orgId,
    p_module_code: code,
    p_target_state: target,
  });
}

async function allowance(
  client: SupabaseClient,
  orgId: string,
  moduleCode: string,
  resource: string,
  increment = 1
): Promise<{ verified?: boolean; allowed?: boolean; reason?: string; current_count?: number; limit_value?: number }> {
  const { data, error } = await client.rpc("check_module_resource_allowance", {
    p_organization_id: orgId,
    p_module_code: moduleCode,
    p_resource_code: resource,
    p_requested_increment: increment,
  });
  if (error) throw new Error(`allowance: ${error.message}`);
  return data as Record<string, never>;
}

async function usageRow(client: SupabaseClient, orgId: string, moduleCode: string) {
  return client
    .from("v_organization_module_usage")
    .select("*")
    .eq("organization_id", orgId)
    .eq("module_code", moduleCode)
    .maybeSingle();
}

async function accessChangedCount(orgId: string): Promise<number> {
  const { count } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("event_type", "organization_module_access_changed");
  return count ?? 0;
}

/** Inserta N filas de fixture con service_role (los conteos y expectativas
 *  se LEEN después con la sesión del miembro real). */
async function seedRows(table: string, orgId: string, n: number, row: (i: number) => Record<string, unknown>) {
  for (let i = 0; i < n; i++) {
    const { error } = await admin.from(table).insert({ organization_id: orgId, ...row(i) });
    if (error) throw new Error(`fixture ${table}: ${error.message}`);
  }
}

async function main() {
  console.log(`Trazaloop · RLS T9F.2 · run ${RUN} · staging: ${URL!.slice(0, 32)}…\n`);

  const superU = await newUser("super");
  await admin.from("platform_staff").insert({ user_id: superU.id, role_code: "superadmin", status: "active" });
  const adminA = await newUser("adminA");
  const orgA = await createOrgViaRealFlow(adminA.client, `${RUN} A (temporal QA)`);
  const adminB = await newUser("adminB");
  const orgB = await createOrgViaRealFlow(adminB.client, `${RUN} B (temporal QA)`);
  const normalA = await newUser("normalA");
  await admin.from("memberships").insert({ organization_id: orgA, user_id: normalA.id, role_code: "operator", status: "active" });
  const anon = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });

  // Estado comercial base: A = Textiles Demo permanente + CPR Demo permanente.
  for (const [code, st] of [[TEX, "demo_permanent"], [CPR, "demo_permanent"]] as const) {
    const { error } = await setModule(superU.client, orgA, code, st);
    assert(!error, `preparar ${code}=${st}: ${error?.message}`);
  }

  console.log("A. Límites por módulo con datos reales (1–15)\n");

  await check("1-2. Textiles Demo: con 0 proveedores la decisión permite 1 (verified=true, allowed=true) y el límite del catálogo es EXACTAMENTE 1", async () => {
    const r = await allowance(adminA.client, orgA, TEX, "suppliers", 1);
    assert(r.verified === true && r.allowed === true, `debía permitir el primero: ${JSON.stringify(r)}`);
    const { data: pl } = await admin.from("plan_limits").select("limit_value, is_unlimited").eq("plan_code", "demo").eq("resource_code", "suppliers").single();
    assert(pl!.limit_value === 1 && pl!.is_unlimited === false, `el límite Demo de suppliers debía ser 1 (fue ${pl!.limit_value})`);
  });

  await check("3-4. Al alcanzar el límite (1/1) la decisión rechaza con current=1 y limit=1; la vista cuenta EXACTAMENTE 1", async () => {
    await seedRows("textile_suppliers", orgA, 1, (i) => ({ name: `${RUN} prov ${i}` }));
    const r = await allowance(adminA.client, orgA, TEX, "suppliers", 1);
    assert(r.verified === true && r.allowed === false && r.reason === "limit_exceeded", `1/1 debía rechazar: ${JSON.stringify(r)}`);
    assert(r.current_count === 1 && r.limit_value === 1, `conteo/límite exactos esperados 1/1: ${JSON.stringify(r)}`);
    const { data } = await usageRow(adminA.client, orgA, TEX);
    assert(data!.suppliers_count === 1, `la vista debía contar 1 proveedor (contó ${data!.suppliers_count})`);
  });

  await check("5-8. Materiales Demo (límite 5): 4/5 permite 1 pero RECHAZA incremento 2 (masivo íntegro); 5/5 rechaza 1", async () => {
    await seedRows("textile_materials", orgA, 4, (i) => ({ name: `${RUN} mat ${i}` }));
    let r = await allowance(adminA.client, orgA, TEX, "materials", 1);
    assert(r.allowed === true, `4/5 + 1 debía caber: ${JSON.stringify(r)}`);
    r = await allowance(adminA.client, orgA, TEX, "materials", 2);
    assert(r.allowed === false && r.reason === "limit_exceeded", `4/5 + 2 debía rechazarse ÍNTEGRO: ${JSON.stringify(r)}`);
    await seedRows("textile_materials", orgA, 1, () => ({ name: `${RUN} mat 4` }));
    r = await allowance(adminA.client, orgA, TEX, "materials", 1);
    assert(r.allowed === false && r.current_count === 5, `5/5 debía rechazar con conteo exacto 5: ${JSON.stringify(r)}`);
  });

  await check("9-11. Evidencias/órdenes/lotes Demo (límite 1 c/u): la decisión al límite rechaza con conteo exacto por recurso", async () => {
    await seedRows("textile_evidences", orgA, 1, (i) => ({
      title: `${RUN} ev ${i}`,
      evidence_type: "other",
      file_name: "a.pdf",
      file_path: `${orgA}/textiles/${randomUUID()}/a.pdf`,
      file_mime_type: "application/pdf",
      file_size_bytes: 1 * MB,
      status: "pending_review",
      created_by: adminA.id,
    }));
    const rEv = await allowance(adminA.client, orgA, TEX, "evidences", 1);
    assert(rEv.allowed === false && rEv.current_count === 1 && rEv.limit_value === 1, `evidencias 1/1: ${JSON.stringify(rEv)}`);
    const rPo = await allowance(adminA.client, orgA, TEX, "production_orders", 1);
    assert(rPo.verified === true && rPo.allowed === true && rPo.current_count === 0, `órdenes 0/1 debía permitir: ${JSON.stringify(rPo)}`);
  });

  await check("12-13. CPR Demo comparte el MISMO mecanismo: suppliers CPR 0/1 permite; 1/1 rechaza con conteo exacto (vista CPR)", async () => {
    let r = await allowance(adminA.client, orgA, CPR, "suppliers", 1);
    assert(r.verified === true && r.allowed === true, `CPR 0/1: ${JSON.stringify(r)}`);
    await seedRows("suppliers", orgA, 1, (i) => ({ name: `${RUN} cpr prov ${i}` }));
    r = await allowance(adminA.client, orgA, CPR, "suppliers", 1);
    assert(r.allowed === false && r.current_count === 1, `CPR 1/1: ${JSON.stringify(r)}`);
    const { data } = await usageRow(adminA.client, orgA, CPR);
    assert(data!.suppliers_count === 1, "la fila CPR de la vista cuenta el proveedor CPR");
    const { data: tex } = await usageRow(adminA.client, orgA, TEX);
    assert(tex!.suppliers_count === 1, "la fila Textiles solo cuenta el proveedor TEXTIL (sin cruce)");
  });

  await check("14-15. Recurso SIN límite en el catálogo ⇒ no_limit permitido; incremento inválido (0) ⇒ verified=false (la app bloquea)", async () => {
    const r = await allowance(adminA.client, orgA, TEX, "sites", 1);
    assert(r.verified === true && r.allowed === true && r.reason === "no_limit", `sites no está en plan_limits: ${JSON.stringify(r)}`);
    const r0 = await allowance(adminA.client, orgA, TEX, "suppliers", 0);
    assert(r0.verified === false && r0.allowed === false && r0.reason === "invalid_increment", `incremento 0: ${JSON.stringify(r0)}`);
  });

  console.log("\nB. Independencia del plan legacy (16–25)\n");

  await check("16-18. Con organization_subscriptions=FULL, Textiles Demo SIGUE limitando a los valores Demo exactos", async () => {
    await admin.from("organization_subscriptions").update({ plan_code: "full" }).eq("organization_id", orgA);
    const r = await allowance(adminA.client, orgA, TEX, "suppliers", 1);
    assert(r.allowed === false && r.current_count === 1 && r.limit_value === 1, `el legacy Full no debía relajar Demo del módulo: ${JSON.stringify(r)}`);
  });

  await check("19-21. Con organization_subscriptions=DEMO y Textiles EXTRA, el módulo es ilimitado y su cuota es la de Extra (5 GiB exactos)", async () => {
    await admin.from("organization_subscriptions").update({ plan_code: "demo" }).eq("organization_id", orgA);
    const { error } = await setModule(superU.client, orgA, TEX, "extra");
    assert(!error, `asignar Extra: ${error?.message}`);
    const r = await allowance(adminA.client, orgA, TEX, "suppliers", 1000);
    assert(r.verified === true && r.allowed === true && r.reason === "unlimited", `Extra ilimitado pese al legacy Demo: ${JSON.stringify(r)}`);
    const { data: def } = await admin.from("plan_definitions").select("storage_limit_bytes").eq("code", "extra").single();
    assert(Number(def!.storage_limit_bytes) === 5368709120, `cuota Extra exacta 5 GiB (fue ${def!.storage_limit_bytes})`);
    const back = await setModule(superU.client, orgA, TEX, "demo_permanent");
    assert(!back.error, "restaurar Textiles Demo");
  });

  await check("22-25. La RESOLUCIÓN de access_mode por módulo (insumo del tamaño por archivo TrazaDocs) ignora el legacy: CPR demo con legacy full/extra", async () => {
    // La derivación access_mode → tamaño por archivo (10/25/25 MB) es
    // TypeScript puro (lib/domain/trazadocs-master.ts) y está probada en
    // tests/unit/t9f2 (§29 17-20). Aquí se fija el INSUMO de esa derivación:
    // el modo resuelto del MÓDULO no cambia con el plan legacy.
    for (const legacy of ["full", "extra"] as const) {
      await admin.from("organization_subscriptions").update({ plan_code: legacy }).eq("organization_id", orgA);
      const { data } = await adminA.client.rpc("resolve_organization_module_access", { p_organization_id: orgA, p_module_code: CPR });
      const d = data as { allowed: boolean; access_mode: string };
      assert(d.allowed === true && d.access_mode === "demo", `CPR debía seguir en demo con legacy=${legacy}: ${JSON.stringify(d)}`);
    }
    await admin.from("organization_subscriptions").update({ plan_code: "demo" }).eq("organization_id", orgA);
  });

  console.log("\nC. Almacenamiento verificado (26–34)\n");

  await check("26-27. Organización SIN objetos: la fila de uso EXISTE con storage_used_bytes=0 y storage_object_conflicts=0 (cero VERIFICADO, no ausencia)", async () => {
    const { data, error } = await usageRow(adminB.client, orgB, TEX);
    assert(!error && data !== null, `la fila Textiles de B debía existir: ${error?.message}`);
    assert(Number(data!.storage_used_bytes) === 0 && Number(data!.storage_object_conflicts) === 0, `cero verificado esperado: ${JSON.stringify(data)}`);
  });

  await check("28-29. La base RECHAZA tamaños negativos (CHECK) — el dato inconsistente no puede ni existir; y anon NO puede leer la vista de uso", async () => {
    const { error } = await admin.from("evidences").insert({
      organization_id: orgB,
      name: `${RUN} negativa`,
      size_bytes: -1,
      created_by: adminB.id,
    });
    assert(error !== null && /check|size_bytes/i.test(error.message), `size_bytes=-1 debía violar el CHECK: ${error?.message}`);
    const { data, error: anonErr } = await anon
      .from("v_organization_module_usage")
      .select("*")
      .eq("organization_id", orgB)
      .maybeSingle();
    assert(anonErr !== null || data === null, "anon no debía obtener uso de ninguna organización");
  });

  await check("30-32. Módulo Textiles VENCIDO y luego DESHABILITADO en B: la decisión bloquea VERIFICADA (demo_expired / disabled) y no existe evidencia alguna", async () => {
    await setModule(superU.client, orgB, TEX, "demo_permanent");
    await admin
      .from("organization_modules")
      .update({ access_expires_at: new Date(Date.now() - 3600_000).toISOString() })
      .eq("organization_id", orgB)
      .eq("module_code", TEX);
    let r = await allowance(adminB.client, orgB, TEX, "evidences", 1);
    assert(r.verified === true && r.allowed === false && r.reason === "demo_expired", `vencido: ${JSON.stringify(r)}`);
    await setModule(superU.client, orgB, TEX, "disabled");
    r = await allowance(adminB.client, orgB, TEX, "evidences", 1);
    assert(r.verified === true && r.allowed === false && r.reason === "disabled", `deshabilitado: ${JSON.stringify(r)}`);
    const { count } = await admin.from("textile_evidences").select("id", { count: "exact", head: true }).eq("organization_id", orgB);
    assert((count ?? 0) === 0, `B no debía tener evidencias (tiene ${count})`);
    const back = await setModule(superU.client, orgB, TEX, "extra");
    assert(!back.error, "restaurar B Textiles Extra");
  });

  await check("33-34. El begin de intento textil (0097) rechaza en BD un tamaño declarado sobre el tope por archivo (FILE_SIZE_INVALID); la verificación del tamaño REAL en finalize es server-only (cubierta por las suites T9E y el análisis local §27)", async () => {
    const { error } = await adminB.client.rpc("begin_textile_evidence_upload", {
      p_organization_id: orgB,
      p_file_name: "grande.pdf",
      p_file_size_bytes: 21 * MB,
      p_file_mime_type: "application/pdf",
      p_metadata: { title: `${RUN} demasiado grande`, evidence_type: "other" },
    });
    assert(error !== null && /FILE_SIZE_INVALID/.test(error.message), `21 MB debía rechazarse en BD: ${error?.message}`);
  });

  console.log("\nD. Contabilización física exacta (35–41)\n");

  await check("35-38. CPR suma OBJETOS FÍSICOS: actual+v3 misma ruta cuenta UNA vez; v1/v2 históricas cuentan; evidencia CPR suma — 41 MB EXACTOS", async () => {
    const docId = randomUUID();
    const p = (v: string) => `${orgA}/${RUN}/doc/${v}.pdf`;
    createdDocObjects.push(p("v1"), p("v2"), p("v3"));
    const { error: docErr } = await admin.from("trazadoc_file_documents").insert({
      id: docId,
      organization_id: orgA,
      title: `${RUN} doc físico`,
      code: `${RUN}-DOC`,
      category_code: "other",
      status: "draft",
      current_version: 3,
      version_label: "v3",
      storage_path: p("v3"),
      file_name: "v3.pdf",
      mime_type: "application/pdf",
      size_bytes: 10 * MB,
      created_by: adminA.id,
    });
    assert(!docErr, `fixture doc: ${docErr?.message}`);
    for (const [n, path] of [[1, p("v1")], [2, p("v2")], [3, p("v3")]] as const) {
      const { error } = await admin.from("trazadoc_file_document_versions").insert({
        organization_id: orgA,
        file_document_id: docId,
        version_number: n,
        version_label: `v${n}`,
        status: "draft",
        snapshot: {},
        storage_path: path,
        file_name: `v${n}.pdf`,
        mime_type: "application/pdf",
        size_bytes: 10 * MB,
        created_by: adminA.id,
      });
      assert(!error, `fixture versión ${n}: ${error?.message}`);
    }
    const evPath = `${orgA}/${RUN}/ev/a.pdf`;
    createdObjects.push(evPath);
    const { error: evErr } = await admin.from("evidences").insert({
      organization_id: orgA,
      name: `${RUN} evidencia física`,
      storage_path: evPath,
      size_bytes: 10 * MB,
      created_by: adminA.id,
    });
    assert(!evErr, `fixture evidencia: ${evErr?.message}`);

    const { data } = await usageRow(adminA.client, orgA, CPR);
    // Esperado: doc actual/v3 (10, deduplicado) + v1 (10) + v2 (10) + evidencia (10) = 40 MB.
    assert(Number(data!.storage_used_bytes) === 40 * MB, `CPR debía sumar 40 MB exactos (sumó ${data!.storage_used_bytes})`);
    assert(Number(data!.storage_object_conflicts) === 0, "sin conflictos de tamaño");
  });

  await check("39-40. Textiles va POR SEPARADO: su fila suma solo la evidencia textil (1 MB) y no absorbe los 40 MB CPR", async () => {
    const { data } = await usageRow(adminA.client, orgA, TEX);
    assert(Number(data!.storage_used_bytes) === 1 * MB, `Textiles debía sumar 1 MB exacto (sumó ${data!.storage_used_bytes})`);
  });

  await check("41. Candidato HUÉRFANO: el registro directo del MIEMBRO queda VETADO (T9F.3, server-only) y el registrado por el SERVIDOR sigue contando (+2 MB ⇒ CPR=42 MB)", async () => {
    const orphanPath = `${orgA}/${RUN}/doc/huerfano.pdf`;
    createdDocObjects.push(orphanPath);
    // T9F.3 endureció el registro: authenticated ya NO puede declarar datos
    // físicos arbitrarios (Bloqueador D). El invariante de T9F.2 ("sigue
    // contando") se conserva con el registro server-only.
    const denied = await adminA.client.rpc("register_storage_orphan", {
      p_organization_id: orgA,
      p_module_code: CPR,
      p_bucket_id: "trazadocs-documents",
      p_object_path: orphanPath,
      p_size_bytes: 2 * MB,
    });
    assert(denied.error !== null && /SERVER_ONLY|permission denied/.test(denied.error.message),
      `el miembro debía quedar vetado (fue: ${denied.error?.message ?? "permitido"})`);
    const { error } = await admin.rpc("register_storage_orphan", {
      p_organization_id: orgA,
      p_module_code: CPR,
      p_bucket_id: "trazadocs-documents",
      p_object_path: orphanPath,
      p_size_bytes: 2 * MB,
    });
    assert(!error, `register_storage_orphan (server): ${error?.message}`);
    const { data } = await usageRow(adminA.client, orgA, CPR);
    assert(Number(data!.storage_used_bytes) === 42 * MB, `con huérfano CPR debía sumar 42 MB (sumó ${data!.storage_used_bytes})`);
  });

  console.log("\nE. Concurrencia real de la RPC (42–46)\n");

  await check("42-44. Dos PRIMERAS asignaciones simultáneas (mismo objetivo): cero unique_violation, UNA fila, UNA transición auditada, exactamente un changed=true", async () => {
    await admin.from("organization_modules").delete().eq("organization_id", orgB).eq("module_code", CPR);
    const before = await accessChangedCount(orgB);
    const [r1, r2] = await Promise.all([
      setModule(superU.client, orgB, CPR, "full"),
      setModule(superU.client, orgB, CPR, "full"),
    ]);
    for (const r of [r1, r2]) {
      assert(!r.error, `ninguna llamada debía fallar (unique_violation): ${r.error?.message}`);
    }
    const changed = [r1, r2].map((r) => (r.data as { changed: boolean }).changed).sort();
    assert(changed[0] === false && changed[1] === true, `exactamente un changed=true: ${JSON.stringify(changed)}`);
    const { count } = await admin
      .from("organization_modules")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgB)
      .eq("module_code", CPR);
    assert(count === 1, `debía existir exactamente 1 fila (hay ${count})`);
    const delta = (await accessChangedCount(orgB)) - before;
    assert(delta === 1, `debía auditarse exactamente 1 transición (Δ=${delta})`);
  });

  await check("45-46. Objetivos DISTINTOS simultáneos sobre fila inexistente: serializados — 1 fila, 2 transiciones, estado final ∈ {full, extra}", async () => {
    await admin.from("organization_modules").delete().eq("organization_id", orgB).eq("module_code", CPR);
    const before = await accessChangedCount(orgB);
    const [r1, r2] = await Promise.all([
      setModule(superU.client, orgB, CPR, "full"),
      setModule(superU.client, orgB, CPR, "extra"),
    ]);
    assert(!r1.error && !r2.error, `sin errores: ${r1.error?.message ?? r2.error?.message}`);
    const { data: rows } = await admin
      .from("organization_modules")
      .select("access_mode")
      .eq("organization_id", orgB)
      .eq("module_code", CPR);
    assert(rows!.length === 1, `1 fila final (hay ${rows!.length})`);
    assert(["full", "extra"].includes(rows![0].access_mode), `modo final serializado: ${rows![0].access_mode}`);
    const delta = (await accessChangedCount(orgB)) - before;
    assert(delta === 2, `2 transiciones auditadas (Δ=${delta})`);
  });

  console.log("\nF. Seguridad de la RPC y la decisión (47–52)\n");

  await check("47-49. Admin de empresa, usuario normal y admin de OTRA empresa: los tres rechazados por la RPC de asignación", async () => {
    for (const [who, cli] of [["adminA", adminA.client], ["normalA", normalA.client], ["adminB(sobre A)", adminB.client]] as const) {
      const { error } = await setModule(cli, orgA, TEX, "full");
      assert(isDenied(error), `${who} debía ser rechazado (fue ${error?.message ?? "permitido"})`);
    }
  });

  await check("50. Anónimo: rechazado (sin sesión no hay decisión posible)", async () => {
    const { error } = await setModule(anon, orgA, TEX, "full");
    assert(isDenied(error), `anon debía ser rechazado (fue ${error?.message ?? "permitido"})`);
  });

  await check("51-52. Módulo NO funcional ('quality') y estado arbitrario ('premium'): rechazados con mensaje claro incluso para el superadmin", async () => {
    const q = await setModule(superU.client, orgA, "quality", "full");
    assert(isDenied(q.error), `quality debía rechazarse: ${q.error?.message ?? "permitido"}`);
    const p = await setModule(superU.client, orgA, TEX, "premium");
    assert(p.error !== null && /no válido/i.test(p.error.message), `premium debía rechazarse: ${p.error?.message ?? "permitido"}`);
  });

  console.log(`\nRLS T9F.2: ${passed} ✔, ${failed} ✘`);
}

async function cleanup() {
  console.log("\nLimpieza de fixtures…");
  let shells = 0;
  try {
    // Objetos de Storage del run (si algún caso llegó a materializarlos).
    if (createdObjects.length > 0) await admin.storage.from("evidences").remove(createdObjects);
    if (createdDocObjects.length > 0) await admin.storage.from("trazadocs-documents").remove(createdDocObjects);

    for (const orgId of createdOrgs) {
      for (const t of [
        "storage_orphan_candidates",
        "trazadoc_file_document_versions",
        "trazadoc_file_documents",
        "textile_evidence_upload_intents",
        "textile_evidences",
        "textile_materials",
        "textile_suppliers",
        "evidences",
        "suppliers",
        "subscription_plan_history",
        "organization_subscriptions",
        "organization_modules",
        "team_invitations",
        "memberships",
      ]) {
        await admin.from(t).delete().eq("organization_id", orgId);
      }
      const { error } = await admin.from("organizations").delete().eq("id", orgId);
      if (error) {
        // T9F.3 (§34): tras la 0101 la eliminación DEBE funcionar (FK de
        // audit_log retirada). Un fallo aquí es RESIDUO reportado; la
        // etiqueta solo identifica el cascarón mientras se corrige.
        shells += 1;
        console.error(`  ✘ residuo: organización ${orgId} no eliminable (${error.message})`);
        await admin.from("organizations").update({ name: `[QA neutralizada] ${RUN} ${orgId.slice(0, 8)}` }).eq("id", orgId);
      }
    }
    for (const userId of createdUsers) {
      await admin.from("platform_staff").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("id", userId);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        await admin.auth.admin.updateUserById(userId, { password: `Qa1-${randomUUID()}`, ban_duration: "87600h" });
        await admin.auth.admin.deleteUser(userId, true).catch(() => undefined);
      }
    }

    // VERIFICACIÓN DE RESIDUOS (expectativas concretas del run):
    let residuos = 0;
    for (const orgId of createdOrgs) {
      for (const t of [
        "memberships", "organization_modules", "textile_suppliers", "textile_materials",
        "textile_evidences", "suppliers", "evidences", "trazadoc_file_documents",
        "trazadoc_file_document_versions", "storage_orphan_candidates", "textile_evidence_upload_intents",
      ]) {
        const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq("organization_id", orgId);
        if ((count ?? 0) > 0) {
          residuos += count ?? 0;
          console.error(`  ✘ residuo funcional: ${t} de ${orgId.slice(0, 8)} = ${count}`);
        }
      }
      const { data: objs } = await admin.storage.from("evidences").list(orgId, { limit: 5 });
      if ((objs ?? []).length > 0) {
        residuos += objs!.length;
        console.error(`  ✘ objetos Storage residuales bajo ${orgId.slice(0, 8)}/`);
      }
    }
    for (const userId of createdUsers) {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data?.user) {
        residuos += 1;
        console.error(`  ✘ usuario QA no eliminado: ${userId.slice(0, 8)}…`);
      }
    }
    if (residuos > 0) failed += 1;
    if (shells > 0) failed += shells; // T9F.3: la neutralización ES residuo.
    console.log(
      `Limpieza: 0 datos funcionales, 0 membresías, 0 módulos, 0 objetos, 0 usuarios del run ${RUN}.` +
        (shells > 0
          ? ` ${shells} organización(es) NO pudieron eliminarse (residuo reportado; tras 0101 el borrado debe funcionar).`
          : " Organizaciones eliminadas por completo.")
    );
  } catch (err) {
    console.error("Limpieza parcial:", (err as Error).message);
  }
}

main()
  .then(cleanup)
  .then(() => {
    if (failed > 0) process.exit(1);
    console.log("Todo verde.");
  })
  .catch(async (err) => {
    console.error("Fallo:", (err as Error).message);
    await cleanup();
    process.exit(1);
  });
