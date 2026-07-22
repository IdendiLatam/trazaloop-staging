/**
 * Trazaloop · Sprint T9F · Prueba REAL contra STAGING del acceso comercial
 * por módulo: provisión Demo 48 h en el registro, regla canónica (vencimiento
 * por fecha, sin cron), gestión de superadmin (demo permanente / full / extra
 * / deshabilitado), seguridad (solo superadmin), idempotencia, auditoría y
 * conservación de datos.
 *
 * Credenciales aleatorias SOLO en memoria; jamás se imprimen. Limpia todo lo
 * eliminable (residuos protegidos por diseño quedan documentados).
 *
 * Correr: npx tsx tests/rls/t9f-module-access-plans.test.ts
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
function isPermissionDenied(error: { code?: string; message: string } | null): boolean {
  return error !== null && (error.code === "42501" || /permission denied|superadministrador/i.test(error.message));
}

const createdUsers: string[] = [];
const createdOrgs: string[] = [];

async function newUser(label: string) {
  const email = `t9f-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.trazaloop.dev`;
  const password = `Qa1-${randomUUID()}${randomUUID().slice(0, 8)}`;
  let user: { id: string } | null = null;
  for (let i = 1; i <= 3 && !user; i++) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `QA T9F ${label}` } });
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
    .select("enabled, access_mode, access_started_at, access_expires_at, assignment_source, updated_by")
    .eq("organization_id", orgId)
    .eq("module_code", code)
    .maybeSingle();
  return data;
}

async function main() {
  console.log("\nTrazaloop · T9F: acceso comercial por módulo (staging)\n");

  const superU = await newUser("super");
  await admin.from("platform_staff").insert({ user_id: superU.id, role_code: "superadmin", status: "active" });
  const adminA = await newUser("adminA");
  const userA = await newUser("userA");
  const adminB = await newUser("adminB");
  const anon = createClient(URL!, ANON!, { auth: { autoRefreshToken: false, persistSession: false } });

  const orgA = await createOrgViaRealFlow(adminA.client, `QA T9F A ${Date.now()} (temporal)`);
  const orgB = await createOrgViaRealFlow(adminB.client, `QA T9F B ${Date.now()} (temporal)`);
  await admin.from("memberships").insert({ organization_id: orgA, user_id: userA.id, role_code: "consultant", status: "active" });
  console.log("Datos temporales creados (2 organizaciones, superadmin + 3 usuarios).\n");

  console.log("── Registro: Demo 48 h automático ───────────────────────────\n");

  await check("1. Empresa nueva recibe CPR (traceability_6632) en Demo, enabled, 48 h", async () => {
    const r = await moduleRow(orgA, "traceability_6632");
    assert(r && r.enabled === true && r.access_mode === "demo", "CPR debía quedar en Demo habilitado");
    assert(r!.assignment_source === "auto_demo_trial", "source debía ser auto_demo_trial");
    assert(r!.access_expires_at !== null, "Demo temporal debía tener vencimiento");
  });

  await check("2. Empresa nueva recibe Textiles en Demo, enabled, 48 h", async () => {
    const r = await moduleRow(orgA, "textiles");
    assert(r && r.enabled === true && r.access_mode === "demo" && r.access_expires_at !== null, "Textiles debía quedar en Demo temporal");
  });

  await check("3. El vencimiento es EXACTAMENTE started_at + 48 h (hora del servidor)", async () => {
    const r = await moduleRow(orgA, "traceability_6632");
    const started = new Date(r!.access_started_at as string).getTime();
    const expires = new Date(r!.access_expires_at as string).getTime();
    const hours = (expires - started) / 3600000;
    assert(Math.abs(hours - 48) < 0.001, `esperaba 48 h exactas, fueron ${hours}`);
  });

  await check("4. Quality y Construcción NO se asignan al registrarse", async () => {
    assert((await moduleRow(orgA, "quality")) === null, "Quality no debía asignarse");
    assert((await moduleRow(orgA, "construccion")) === null, "Construcción no debía asignarse");
  });

  await check("5. Registro deja auditoría del inicio de Demo (organization_module_demo_started)", async () => {
    const { data } = await admin.from("audit_log").select("event_type, payload").eq("organization_id", orgA).eq("event_type", "organization_module_demo_started");
    assert((data ?? []).length >= 2, "debía haber un evento de inicio de Demo por cada módulo funcional");
  });

  await check("6. Reintentar la provisión NO duplica asignaciones (idempotente)", async () => {
    const before = (await admin.from("organization_modules").select("id", { count: "exact", head: true }).eq("organization_id", orgA)).count;
    await admin.rpc("provision_new_organization_modules", { p_org: orgA, p_actor: adminA.id });
    const after = (await admin.from("organization_modules").select("id", { count: "exact", head: true }).eq("organization_id", orgA)).count;
    assert(before === after, `la provisión duplicó filas: ${before} → ${after}`);
  });

  console.log("\n── Regla canónica (vencimiento por fecha, sin cron) ─────────\n");

  await check("7. Demo activo → acceso permitido (resolve RPC como Admin A)", async () => {
    const { data, error } = await adminA.client.rpc("resolve_organization_module_access", { p_organization_id: orgA, p_module_code: "traceability_6632" });
    assert(!error && (data as { allowed: boolean }).allowed === true, `Admin A debía tener acceso: ${error?.message}`);
  });

  await check("8. Demo VENCIDO bloquea acceso SIN cron (fixture: expires en el pasado)", async () => {
    // Fixture controlado con service_role (no debilita el guard: la regla real
    // sigue comparando por fecha). Un intento demo con vencimiento pasado.
    await admin.from("organization_modules")
      .update({ access_mode: "demo", enabled: true, access_expires_at: new Date(Date.now() - 3600_000).toISOString() })
      .eq("organization_id", orgA).eq("module_code", "textiles");
    const { data } = await adminA.client.rpc("resolve_organization_module_access", { p_organization_id: orgA, p_module_code: "textiles" });
    const res = data as { allowed: boolean; reason: string };
    assert(res.allowed === false && res.reason === "demo_expired", "un Demo vencido debía bloquear el acceso de inmediato");
  });

  await check("9. Los datos permanecen tras el vencimiento (la fila del módulo sigue)", async () => {
    const r = await moduleRow(orgA, "textiles");
    assert(r !== null, "la asignación no debía borrarse al vencer");
  });

  console.log("\n── Seguridad: solo el superadministrador cambia el plan ─────\n");

  const trySet = (client: SupabaseClient, org: string, code: string, target: string) =>
    client.rpc("set_organization_module_access", { p_organization_id: org, p_module_code: code, p_target_state: target });

  await check("10. Admin de empresa NO puede cambiar su plan", async () => {
    const { error } = await trySet(adminA.client, orgA, "textiles", "full");
    assert(isPermissionDenied(error), `Admin A no debía poder cambiar el plan: ${error?.message ?? "ÉXITO"}`);
  });
  await check("11. Usuario normal NO puede cambiar el plan", async () => {
    const { error } = await trySet(userA.client, orgA, "textiles", "full");
    assert(isPermissionDenied(error), `Usuario A no debía poder: ${error?.message ?? "ÉXITO"}`);
  });
  await check("12. Admin de OTRA empresa NO puede cambiar el plan de A", async () => {
    const { error } = await trySet(adminB.client, orgA, "textiles", "full");
    assert(isPermissionDenied(error), `Admin B no debía poder: ${error?.message ?? "ÉXITO"}`);
  });
  await check("13. anon NO puede cambiar el plan", async () => {
    const { error } = await trySet(anon, orgA, "textiles", "full");
    assert(error !== null, `anon no debía poder: ${error?.message ?? "ÉXITO"}`);
  });

  console.log("\n── Gestión del superadministrador ───────────────────────────\n");

  await check("14. Superadmin: Textiles → Demo permanente (expires null)", async () => {
    const { error } = await trySet(superU.client, orgA, "textiles", "demo_permanent");
    assert(!error, `demo_permanent falló: ${error?.message}`);
    const r = await moduleRow(orgA, "textiles");
    assert(r!.enabled === true && r!.access_mode === "demo" && r!.access_expires_at === null, "Textiles debía quedar Demo permanente");
    assert(r!.assignment_source === "superadmin" && r!.updated_by === superU.id, "debía registrar actor superadmin");
  });

  await check("15. Superadmin: CPR → Full (expires null)", async () => {
    const { error } = await trySet(superU.client, orgA, "traceability_6632", "full");
    assert(!error, `full falló: ${error?.message}`);
    const r = await moduleRow(orgA, "traceability_6632");
    assert(r!.enabled === true && r!.access_mode === "full" && r!.access_expires_at === null, "CPR debía quedar Full");
  });

  await check("16. Superadmin: Textiles → Extra; Full y Extra permiten acceso completo", async () => {
    const { error } = await trySet(superU.client, orgA, "textiles", "extra");
    assert(!error, `extra falló: ${error?.message}`);
    const rExtra = await adminA.client.rpc("resolve_organization_module_access", { p_organization_id: orgA, p_module_code: "textiles" });
    const rFull = await adminA.client.rpc("resolve_organization_module_access", { p_organization_id: orgA, p_module_code: "traceability_6632" });
    assert((rExtra.data as { allowed: boolean }).allowed && (rFull.data as { allowed: boolean }).allowed, "Full y Extra deben permitir acceso");
  });

  await check("17. Cuotas resueltas según plan (plan_definitions: full 500 MB, extra 5 GB)", async () => {
    const { data } = await admin.from("plan_definitions").select("code, storage_limit_bytes").in("code", ["demo", "full", "extra"]);
    const byCode = new Map((data ?? []).map((d) => [d.code, Number(d.storage_limit_bytes)]));
    assert(byCode.get("demo") === 52428800 && byCode.get("full") === 524288000 && byCode.get("extra") === 5368709120, "cuotas de plan inesperadas");
    assert((byCode.get("extra") ?? 0) > (byCode.get("full") ?? 0), "Extra debe superar a Full en almacenamiento");
  });

  await check("18. Idempotencia: aplicar Full dos veces no crea duplicados ni cambia el resultado", async () => {
    await trySet(superU.client, orgA, "traceability_6632", "full");
    await trySet(superU.client, orgA, "traceability_6632", "full");
    const { count } = await admin.from("organization_modules").select("id", { count: "exact", head: true }).eq("organization_id", orgA).eq("module_code", "traceability_6632");
    assert(count === 1, `duplicados de asignación: ${count}`);
  });

  await check("19. Deshabilitar y REACTIVAR conserva y recupera el acceso a los datos", async () => {
    await trySet(superU.client, orgA, "textiles", "disabled");
    const disabled = await adminA.client.rpc("resolve_organization_module_access", { p_organization_id: orgA, p_module_code: "textiles" });
    assert((disabled.data as { allowed: boolean }).allowed === false, "deshabilitado debía bloquear");
    assert((await moduleRow(orgA, "textiles")) !== null, "deshabilitar no debía borrar la fila");
    await trySet(superU.client, orgA, "textiles", "demo_permanent");
    const reactivated = await adminA.client.rpc("resolve_organization_module_access", { p_organization_id: orgA, p_module_code: "textiles" });
    assert((reactivated.data as { allowed: boolean }).allowed === true, "reactivar debía recuperar el acceso");
  });

  await check("20. Auditoría del cambio contiene actor y transición antes→después", async () => {
    const { data } = await admin.from("audit_log").select("actor_id, payload").eq("organization_id", orgA).eq("event_type", "organization_module_access_changed").order("changed_at", { ascending: false }).limit(1);
    const row = (data ?? [])[0] as { actor_id: string; payload: { before?: unknown; after?: unknown } } | undefined;
    assert(row && row.actor_id === superU.id, "el evento debía registrar al superadmin como actor");
    assert(row!.payload.before !== undefined && row!.payload.after !== undefined, "el evento debía registrar antes/después");
  });

  console.log("\n── Módulos no funcionales rechazados ────────────────────────\n");

  await check("21. Superadmin NO puede habilitar Quality", async () => {
    const { error } = await trySet(superU.client, orgA, "quality", "full");
    assert(error !== null && /no está disponible|no funcional|disponible para asignación/i.test(error.message), `Quality debía rechazarse: ${error?.message ?? "ÉXITO"}`);
    assert((await moduleRow(orgA, "quality")) === null, "no debía crear asignación para Quality");
  });

  await check("22. Superadmin NO puede habilitar Construcción", async () => {
    const { error } = await trySet(superU.client, orgA, "construccion", "full");
    assert(error !== null, `Construcción debía rechazarse: ${error?.message ?? "ÉXITO"}`);
    assert((await moduleRow(orgA, "construccion")) === null, "no debía crear asignación para Construcción");
  });

  await check("23. Un intento arbitrario de access_mode (RPC 0100 solo mapea estados de UI)", async () => {
    // La RPC solo acepta target_state de UI; un valor arbitrario se rechaza.
    const { error } = await trySet(superU.client, orgA, "textiles", "premium");
    assert(error !== null, "un estado objetivo inventado debía rechazarse");
  });

  await check("24. La empresa B no se ve afectada por los cambios en A (aislamiento)", async () => {
    const r = await moduleRow(orgB, "traceability_6632");
    assert(r && r.access_mode === "demo" && r.assignment_source === "auto_demo_trial", "B debía conservar su Demo original");
  });

  console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
}

async function cleanup() {
  console.log("\nLimpieza de datos temporales…");
  try {
    for (const org of createdOrgs) {
      for (const t of ["organization_modules", "textile_evidences", "evidences", "memberships", "organization_subscriptions", "subscription_plan_history"]) {
        await admin.from(t).delete().eq("organization_id", org);
      }
      await admin.from("organizations").delete().eq("id", org);
    }
    for (const id of createdUsers) {
      await admin.from("platform_staff").delete().eq("user_id", id);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) {
        await admin.auth.admin.updateUserById(id, { password: `Qa1-${randomUUID()}`, ban_duration: "87600h" });
        await admin.auth.admin.deleteUser(id, true);
      }
    }
    console.log(`Limpieza: ${createdOrgs.length} organización(es), ${createdUsers.length} usuario(s). (audit_log es append-only: sus filas quedan como residuo protegido.)`);
  } catch (err) {
    console.error("Limpieza parcial:", (err as Error).message);
  }
}

main().then(cleanup).then(() => {
  if (failed > 0) process.exit(1);
  console.log("Todo verde.");
}).catch(async (err) => {
  console.error("Fallo:", (err as Error).message);
  await cleanup();
  process.exit(1);
});
