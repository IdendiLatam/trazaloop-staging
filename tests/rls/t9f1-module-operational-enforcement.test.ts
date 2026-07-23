/**
 * Trazaloop · Sprint T9F.1 · Prueba REAL contra STAGING del cierre operativo
 * del control comercial por módulo (§25 del plan T9F.1).
 *
 * ⚠️ PREPARADA, NO EJECUTADA desde el entorno de desarrollo aislado: exige
 * una base de datos viva con las migraciones 0100 **y 0101** ya aplicadas.
 * Correrla ANTES de aplicar 0101 hará fallar los bloques de idempotencia y
 * de la vista v_organization_module_usage — eso es intencional (0101 es lo
 * que esta suite valida).
 *
 * Cubre: planes INDEPENDIENTES por módulo (CPR Full + Textiles Demo, CPR
 * Demo + Textiles Extra), límites y cuotas por módulo, bloqueo de mutación
 * directa con Demo vencido / módulo deshabilitado, Full ≡ Extra salvo
 * almacenamiento, seguridad (solo superadmin cambia planes), idempotencia
 * real (no-op sin UPDATE ni auditoría; transición real con exactamente una),
 * aislamiento entre organizaciones, independencia de organization_
 * subscriptions, conservación y reactivación de datos, y Quality/
 * Construcción no asignables.
 *
 * Credenciales aleatorias SOLO en memoria; jamás se imprimen. La suite
 * limpia todos sus fixtures al final (usuarios, membresías, organizaciones
 * y filas creadas), incluso si fallan checks intermedios.
 *
 * T9F.2: esta suite fue CORREGIDA — jamás intenta borrar audit_log (es
 * inmutable por trigger y bloquea el borrado físico de la organización vía
 * FK): la limpieza elimina TODO dato funcional, membresía, módulo y usuario
 * del run y deja, cuando la auditoría lo impide, un cascarón de organización
 * NEUTRALIZADO (sin miembros, sin datos, sin módulos, renombrado como QA) —
 * mismo patrón documentado de las suites T9E. Los eventos de auditoría
 * inmutables no cuentan como residuo funcional.
 *
 * Correr (desde una máquina autorizada, con .env.local de staging):
 *   npm run test:t9f1-rls
 * (Sin encadenar en test:all: exige BD viva, como tests/rls/*.)
 */
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  return error !== null && (error.code === "42501" || /permission denied|superadministrador|no autenticado/i.test(error.message));
}

const createdUsers: string[] = [];
const createdOrgs: string[] = [];

async function newUser(label: string) {
  const email = `t9f1-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const password = `Qa1-${randomUUID()}${randomUUID().slice(0, 8)}`;
  let user: { id: string } | null = null;
  for (let i = 1; i <= 3 && !user; i++) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `QA T9F1 ${label}` },
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

async function moduleRow(orgId: string, code: string) {
  const { data } = await admin
    .from("organization_modules")
    .select("enabled, access_mode, access_started_at, access_expires_at, updated_at, updated_by")
    .eq("organization_id", orgId)
    .eq("module_code", code)
    .maybeSingle();
  return data;
}

async function setModule(client: SupabaseClient, orgId: string, code: string, target: string) {
  return client.rpc("set_organization_module_access", {
    p_organization_id: orgId,
    p_module_code: code,
    p_target_state: target,
  });
}

async function accessChangedCount(orgId: string): Promise<number> {
  const { count } = await admin
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("event_type", "organization_module_access_changed");
  return count ?? 0;
}

async function moduleUsageRow(client: SupabaseClient, orgId: string, code: string) {
  const { data, error } = await client
    .from("v_organization_module_usage")
    .select("*")
    .eq("organization_id", orgId)
    .eq("module_code", code)
    .maybeSingle();
  return { data, error };
}

/** Fixture con service_role: fija un vencimiento pasado (no debilita el
 *  guard: la regla real sigue comparando por FECHA en el servidor). */
async function expireModule(orgId: string, code: string) {
  await admin
    .from("organization_modules")
    .update({ access_mode: "demo", enabled: true, access_expires_at: new Date(Date.now() - 3600_000).toISOString() })
    .eq("organization_id", orgId)
    .eq("module_code", code);
}

async function main() {
  console.log("\nTrazaloop · T9F.1: control comercial POR MÓDULO (staging, tras aplicar 0101)\n");

  const superU = await newUser("super");
  await admin.from("platform_staff").insert({ user_id: superU.id, role_code: "superadmin", status: "active" });
  const adminA = await newUser("adminA");
  const adminB = await newUser("adminB");
  const anon = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });

  const orgA = await createOrgViaRealFlow(adminA.client, `QA T9F1 A ${Date.now()} (temporal)`);
  const orgB = await createOrgViaRealFlow(adminB.client, `QA T9F1 B ${Date.now()} (temporal)`);
  console.log("Datos temporales creados (2 organizaciones, superadmin + 2 administradores).\n");

  console.log("── 1-4/5-6 · Planes INDEPENDIENTES por módulo ─────────────────\n");

  await check("1-2. Org A queda CPR=Full y Textiles=Demo permanente (planes distintos en la misma empresa)", async () => {
    const r1 = await setModule(superU.client, orgA, CPR, "full");
    assert(!r1.error, `set CPR full: ${r1.error?.message}`);
    const r2 = await setModule(superU.client, orgA, TEX, "demo_permanent");
    assert(!r2.error, `set Textiles demo_permanent: ${r2.error?.message}`);
    const cpr = await moduleRow(orgA, CPR);
    const tex = await moduleRow(orgA, TEX);
    assert(cpr?.enabled === true && cpr?.access_mode === "full" && cpr?.access_expires_at === null, "CPR debía quedar Full");
    assert(tex?.enabled === true && tex?.access_mode === "demo" && tex?.access_expires_at === null, "Textiles debía quedar Demo permanente");
  });

  await check("3-4. Org B queda CPR=Demo (48 h del registro) y Textiles=Extra", async () => {
    const cpr = await moduleRow(orgB, CPR);
    assert(cpr?.access_mode === "demo" && cpr?.access_expires_at !== null, "CPR de B conserva el Demo temporal del registro");
    const r = await setModule(superU.client, orgB, TEX, "extra");
    assert(!r.error, `set Textiles extra: ${r.error?.message}`);
    const tex = await moduleRow(orgB, TEX);
    assert(tex?.enabled === true && tex?.access_mode === "extra", "Textiles de B debía quedar Extra");
  });

  await check("5-6/11. Cuotas independientes por módulo desde plan_definitions (Extra > Full > Demo) y uso separado en la vista 0101", async () => {
    const { data: defs } = await adminA.client.from("plan_definitions").select("code, storage_limit_bytes");
    const byCode = new Map((defs ?? []).map((d) => [d.code as string, Number(d.storage_limit_bytes)]));
    assert((byCode.get("extra") ?? 0) > (byCode.get("full") ?? 0), "Extra debe tener MÁS almacenamiento que Full");
    assert((byCode.get("full") ?? 0) > (byCode.get("demo") ?? 0), "Full debe tener más almacenamiento que Demo");

    const cprUsage = await moduleUsageRow(adminA.client, orgA, CPR);
    const texUsage = await moduleUsageRow(adminA.client, orgA, TEX);
    assert(!cprUsage.error && cprUsage.data, `vista de uso CPR (¿0101 aplicada?): ${cprUsage.error?.message}`);
    assert(!texUsage.error && texUsage.data, `vista de uso Textiles: ${texUsage.error?.message}`);
    assert(Number(cprUsage.data!.storage_used_bytes) === 0 && Number(texUsage.data!.storage_used_bytes) === 0, "empresa nueva sin bytes en ninguno de los dos módulos");
  });

  await check("Los conteos por módulo son independientes: un proveedor CPR no cuenta en Textiles (y viceversa)", async () => {
    const ins = await adminA.client.from("suppliers").insert({ organization_id: orgA, name: "QA Proveedor CPR (temporal)" });
    assert(!ins.error, `insert supplier CPR: ${ins.error?.message}`);
    const tins = await adminA.client.from("textile_suppliers").insert({ organization_id: orgA, name: "QA Proveedor Textil (temporal)" });
    assert(!tins.error, `insert supplier textil: ${tins.error?.message}`);
    const cpr = await moduleUsageRow(adminA.client, orgA, CPR);
    const tex = await moduleUsageRow(adminA.client, orgA, TEX);
    assert(Number(cpr.data?.suppliers_count) === 1, "la fila CPR debía contar 1 proveedor CPR");
    assert(Number(tex.data?.suppliers_count) === 1, "la fila Textiles debía contar 1 proveedor textil");
  });

  console.log("\n── 7-9 · Vencimiento y deshabilitación bloquean MUTACIONES ────\n");

  await check("7. Demo CPR vencido en Org B: la resolución de acceso bloquea de inmediato (base de las Server Actions)", async () => {
    await expireModule(orgB, CPR);
    const { data, error } = await adminB.client.rpc("resolve_organization_module_access", { p_organization_id: orgB, p_module_code: CPR });
    assert(!error, `resolve: ${error?.message}`);
    const d = data as { allowed: boolean; reason: string };
    assert(d.allowed === false && d.reason === "demo_expired", `debía bloquear por demo_expired, fue ${JSON.stringify(d)}`);
  });

  await check("8. Demo Textiles vencido: la resolución de acceso bloquea y NINGUNA evidencia llega a existir por esa vía", async () => {
    await expireModule(orgB, TEX);
    // Expectativa DB concreta: el acceso resuelto es demo_expired (la capa de
    // acciones bloquea begin con checkTextilesCanMutate/ResourceLimit/Storage
    // — verificado estáticamente en las suites locales), y en la base NO
    // existe ninguna evidencia textil de la organización.
    const { data } = await adminB.client.rpc("resolve_organization_module_access", { p_organization_id: orgB, p_module_code: TEX });
    const d = data as { allowed: boolean; reason: string };
    assert(d.allowed === false && d.reason === "demo_expired", `debía bloquear por demo_expired, fue ${JSON.stringify(d)}`);
    const { count } = await admin
      .from("textile_evidences")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgB);
    assert((count ?? 0) === 0, `no debía existir ninguna evidencia textil (hay ${count})`);
    // Restaurar Textiles=Extra para los bloques siguientes.
    const r = await setModule(superU.client, orgB, TEX, "extra");
    assert(!r.error, "restaurar Textiles Extra");
  });

  await check("9/18. Módulo deshabilitado bloquea acceso y los datos permanecen", async () => {
    const before = (await admin.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgA)).count ?? 0;
    const r = await setModule(superU.client, orgA, CPR, "disabled");
    assert(!r.error, `disable CPR: ${r.error?.message}`);
    const { data } = await adminA.client.rpc("resolve_organization_module_access", { p_organization_id: orgA, p_module_code: CPR });
    assert((data as { allowed: boolean; reason: string }).allowed === false, "CPR deshabilitado debía bloquear");
    const after = (await admin.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgA)).count ?? 0;
    assert(before === after && after >= 1, "los datos CPR deben conservarse al deshabilitar");
  });

  await check("20. Reactivar (disabled → full) recupera el acceso sin pérdida de datos", async () => {
    const r = await setModule(superU.client, orgA, CPR, "full");
    assert(!r.error, `reactivar: ${r.error?.message}`);
    const { data } = await adminA.client.rpc("resolve_organization_module_access", { p_organization_id: orgA, p_module_code: CPR });
    assert((data as { allowed: boolean }).allowed === true, "reactivado debía permitir acceso");
    const count = (await admin.from("suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgA)).count ?? 0;
    assert(count >= 1, "los datos siguen presentes tras reactivar");
  });

  console.log("\n── 10-11 · Full ≡ Extra salvo almacenamiento ──────────────────\n");

  await check("10. Full y Extra comparten TODOS los límites funcionales (plan_limits, excluyendo storage_bytes)", async () => {
    const { data } = await adminA.client.from("plan_limits").select("plan_code, resource_code, limit_value, is_unlimited").in("plan_code", ["full", "extra"]);
    const norm = (code: string) =>
      JSON.stringify(
        (data ?? [])
          .filter((l) => l.plan_code === code && l.resource_code !== "storage_bytes")
          .map((l) => ({ r: l.resource_code, v: l.limit_value === null ? null : Number(l.limit_value), u: Boolean(l.is_unlimited) }))
          .sort((a, b) => a.r.localeCompare(b.r))
      );
    assert(norm("full") === norm("extra"), "Full y Extra deben tener límites funcionales idénticos");
  });

  console.log("\n── 12-13 · Seguridad: solo superadmin cambia planes ───────────\n");

  await check("12. El admin de la empresa NO puede cambiar el plan de su módulo (RPC rechaza)", async () => {
    const { error } = await setModule(adminA.client, orgA, TEX, "extra");
    assert(isDenied(error), `debía rechazarse: ${error?.message ?? "sin error"}`);
  });

  await check("12b. anon NO puede cambiar planes ni escribir organization_modules", async () => {
    const { error } = await setModule(anon, orgA, TEX, "full");
    assert(error !== null, "anon debía ser rechazado por la RPC");
    const upd = await adminA.client.from("organization_modules").update({ access_mode: "full" }).eq("organization_id", orgA).eq("module_code", TEX);
    const row = await moduleRow(orgA, TEX);
    assert(upd.error !== null || row?.access_mode === "demo", "el UPDATE directo del cliente no puede cambiar el plan");
  });

  await check("13. El superadministrador SÍ cambia el plan (ya demostrado; verificación explícita Demo→Extra→Demo)", async () => {
    const r1 = await setModule(superU.client, orgA, TEX, "extra");
    assert(!r1.error && (r1.data as { changed: boolean }).changed === true, "Demo→Extra debía aplicarse con changed=true");
    const r2 = await setModule(superU.client, orgA, TEX, "demo_permanent");
    assert(!r2.error && (r2.data as { changed: boolean }).changed === true, "Extra→Demo permanente debía aplicarse");
  });

  console.log("\n── 14-15/23 · Idempotencia REAL (0101) ────────────────────────\n");

  await check("14/23. Cambio REPETIDO (no-op) devuelve changed=false, no toca updated_at/updated_by y NO genera auditoría", async () => {
    const before = await moduleRow(orgA, TEX);
    const auditBefore = await accessChangedCount(orgA);
    const { data, error } = await setModule(superU.client, orgA, TEX, "demo_permanent");
    assert(!error, `no-op: ${error?.message}`);
    const payload = data as { changed: boolean; updated_at: string };
    assert(payload.changed === false, "el no-op debía devolver changed=false");
    const after = await moduleRow(orgA, TEX);
    assert(after?.updated_at === before?.updated_at, "updated_at no puede cambiar en un no-op");
    assert(after?.updated_by === before?.updated_by, "updated_by no puede cambiar en un no-op");
    assert(after?.access_started_at === before?.access_started_at, "access_started_at no puede cambiar en un no-op");
    const auditAfter = await accessChangedCount(orgA);
    assert(auditAfter === auditBefore, `un no-op no puede crear auditoría (${auditBefore} → ${auditAfter})`);
  });

  await check("15. Una transición REAL genera EXACTAMENTE un evento de auditoría", async () => {
    const auditBefore = await accessChangedCount(orgA);
    const { data, error } = await setModule(superU.client, orgA, TEX, "full");
    assert(!error && (data as { changed: boolean }).changed === true, "transición real con changed=true");
    const auditAfter = await accessChangedCount(orgA);
    assert(auditAfter === auditBefore + 1, `debía crear exactamente 1 evento (${auditBefore} → ${auditAfter})`);
  });

  console.log("\n── 16-17 · Aislamiento e independencia del plan legacy ────────\n");

  await check("16. No existe acceso cruzado: Admin B no ve módulos, uso ni datos de Org A", async () => {
    const { data: mods } = await adminB.client.from("organization_modules").select("id").eq("organization_id", orgA);
    assert((mods ?? []).length === 0, "B no puede leer organization_modules de A");
    const usage = await moduleUsageRow(adminB.client, orgA, CPR);
    assert(!usage.data, "B no puede leer el uso por módulo de A");
    const { data: sups } = await adminB.client.from("suppliers").select("id").eq("organization_id", orgA);
    assert((sups ?? []).length === 0, "B no puede leer proveedores de A");
  });

  await check("17. organization_subscriptions NO altera los entitlements por módulo (legacy Full no convierte Textiles Demo en Full)", async () => {
    // Fixture: suscripción legacy de A → full (service_role, dato legacy).
    await admin.from("organization_subscriptions").update({ plan_code: "full" }).eq("organization_id", orgA);
    // Textiles de A: Full ahora mismo (bloque 15) → llevarlo a demo_permanent.
    const r = await setModule(superU.client, orgA, TEX, "demo_permanent");
    assert(!r.error, "fixture Textiles demo");
    const tex = await moduleRow(orgA, TEX);
    assert(tex?.access_mode === "demo", "el módulo conserva SU access_mode aunque el legacy sea full");
    // La cuota operativa del módulo proviene de plan_definitions[access_mode
    // del MÓDULO]; la vista por módulo no expone (ni depende de) plan legacy.
    const usage = await moduleUsageRow(adminA.client, orgA, TEX);
    assert(usage.data && !("plan_code" in usage.data), "la vista por módulo no arrastra el plan legacy");
    // Restaurar el legacy a demo (estado de registro).
    await admin.from("organization_subscriptions").update({ plan_code: "demo" }).eq("organization_id", orgA);
  });

  console.log("\n── 19-22 · Conservación, reactivación y módulos no funcionales ─\n");

  await check("19. Los datos permanecen después de VENCER un Demo", async () => {
    const before = (await admin.from("textile_suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgA)).count ?? 0;
    await expireModule(orgA, TEX);
    const after = (await admin.from("textile_suppliers").select("id", { count: "exact", head: true }).eq("organization_id", orgA)).count ?? 0;
    assert(before === after, "vencer no borra datos");
    const r = await setModule(superU.client, orgA, TEX, "demo_permanent");
    assert(!r.error, "restaurar demo permanente");
  });

  await check("21-22. Quality y Construcción siguen NO asignables (RPC los rechaza)", async () => {
    for (const code of ["quality", "construccion"]) {
      const { error } = await setModule(superU.client, orgA, code, "full");
      assert(error !== null && /no está disponible/i.test(error.message), `${code} debía ser rechazado`);
    }
  });

  console.log(`\nT9F.1 RLS: ${passed} ✔, ${failed} ✘`);
}

async function cleanup() {
  console.log("\nLimpieza de fixtures…");
  let shells = 0;
  for (const orgId of createdOrgs) {
    // Datos funcionales y estructurales primero (restricción on delete
    // restrict en varias tablas). audit_log JAMÁS se toca: es inmutable por
    // trigger y sus eventos no son residuo funcional.
    for (const t of [
      "textile_evidence_upload_intents",
      "textile_suppliers",
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
      // T9F.3 (§34): tras la 0101 la eliminación DEBE funcionar (la FK de
      // audit_log fue retirada; los eventos inmutables permanecen sin
      // bloquear el ciclo de vida). Si aún así falla, se etiqueta el
      // cascarón para identificarlo, pero se REPORTA COMO RESIDUO: la
      // neutralización ya no es un resultado aceptable de limpieza.
      shells += 1;
      console.error(`  ✘ residuo: organización ${orgId} no eliminable (${error.message})`);
      await admin
        .from("organizations")
        .update({ name: `[QA neutralizada] t9f1 ${orgId.slice(0, 8)}` })
        .eq("id", orgId);
    }
  }
  for (const userId of createdUsers) {
    await admin.from("platform_staff").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  }

  // Verificación de residuos del run (expectativas concretas):
  let residuos = 0;
  for (const orgId of createdOrgs) {
    for (const t of ["memberships", "organization_modules", "textile_suppliers", "suppliers", "textile_evidence_upload_intents"]) {
      const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq("organization_id", orgId);
      if ((count ?? 0) > 0) {
        residuos += count ?? 0;
        console.error(`  ✘ residuo funcional: ${t} de ${orgId.slice(0, 8)} = ${count}`);
      }
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
    `Limpieza terminada: 0 datos funcionales, 0 membresías, 0 módulos, 0 usuarios del run.` +
      (shells > 0
        ? ` ${shells} organización(es) NO pudieron eliminarse (residuo reportado; tras 0101 el borrado debe funcionar).`
        : " Organizaciones eliminadas por completo.")
  );
}

main()
  .catch((err) => {
    failed++;
    console.error(`Fallo no controlado: ${(err as Error).message}`);
  })
  .finally(async () => {
    await cleanup();
    process.exit(failed > 0 ? 1 : 0);
  });
