/**
 * Trazaloop · Sprint T9F · Verificación ESTÁTICA de la provisión automática,
 * la seguridad de la RPC de superadmin, la eliminación de la escritura de
 * cliente en organization_modules, los guards canónicos y la ausencia de
 * service role en el cliente. Complementa —no sustituye— la suite RLS viva.
 *
 * Correr: npx tsx tests/unit/t9f-provisioning-and-guards.test.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
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

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const stripSql = (s: string) => s.replace(/--[^\n]*/g, "");
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const MIG = stripSql(read("supabase/migrations/0100_organization_module_access_modes_and_demo_trial.sql"));
const migLower = MIG.toLowerCase();

console.log("Trazaloop · T9F: provisión automática (0100)\n");

check("1. create_organization y create_platform_organization provisionan vía el helper", () => {
  assert((MIG.match(/perform provision_new_organization_modules\(v_org, v_user\)/g) ?? []).length >= 2,
    "ambas RPC de registro deben llamar provision_new_organization_modules");
});

check("2. La provisión siembra los módulos FUNCIONALES en Demo de 48 horas", () => {
  const fn = MIG.slice(MIG.indexOf("function public.provision_new_organization_modules"));
  const body = fn.slice(0, fn.indexOf("revoke all on function public.provision"));
  assert(/where m\.is_functional/.test(body), "debe sembrar solo módulos funcionales (m.is_functional)");
  assert(/now\(\) \+ interval '48 hours'/.test(body), "el vencimiento debe ser exactamente 48 horas");
  assert(/'demo'/.test(body) && /'auto_demo_trial'/.test(body), "debe usar access_mode demo y source auto_demo_trial");
  assert(/on conflict \(organization_id, module_code\) do nothing/.test(body), "debe ser idempotente (sin duplicados)");
  assert(/'core'[\s\S]{0,120}'full'[\s\S]{0,120}'infrastructure'/.test(body), "core debe sembrarse como infra full permanente");
  assert(/log_event\([\s\S]{0,120}'organization_module_demo_started'/.test(body), "debe auditar el inicio de Demo");
});

check("3. El helper de provisión es INTERNO (no ejecutable por authenticated)", () => {
  assert(/revoke all on function public\.provision_new_organization_modules\(uuid, uuid\)\s+from public, anon, authenticated/.test(migLower)
    || /revoke all on function public.provision_new_organization_modules\(uuid, uuid\)\s+from public, anon, authenticated/.test(MIG),
    "provision debe revocar public/anon/authenticated");
});

console.log("\nTrazaloop · T9F: RLS de organization_modules\n");

check("4. Se ELIMINA la escritura de cliente (org-admin) en organization_modules", () => {
  assert(/drop policy if exists organization_modules_insert on public\.organization_modules/.test(migLower), "debe eliminar la política insert de cliente");
  assert(/drop policy if exists organization_modules_update on public\.organization_modules/.test(migLower), "debe eliminar la política update de cliente");
  // No debe recrear ninguna política insert/update para authenticated.
  assert(!/create policy[^;]*organization_modules[^;]*for (insert|update)/.test(migLower), "0100 no debe recrear escritura de cliente");
});

check("5. Constraint de access_mode restringido a demo/full/extra", () => {
  assert(/access_mode in \('demo', 'full', 'extra'\)/.test(migLower), "el CHECK debe limitar access_mode a demo/full/extra");
});

console.log("\nTrazaloop · T9F: seguridad de la RPC de superadmin\n");

check("6. set_organization_module_access exige superadmin y módulo funcional en SQL", () => {
  const fn = MIG.slice(MIG.indexOf("function public.set_organization_module_access"));
  const body = fn.slice(0, fn.indexOf("revoke all on function public.set_organization_module_access"));
  assert(/is_platform_superadmin\(\)/.test(body), "debe re-verificar is_platform_superadmin()");
  assert(/m\.code = p_module_code and m\.is_functional/.test(body), "debe rechazar módulos no funcionales");
  assert(/p_target_state not in \('disabled', 'demo_permanent', 'full', 'extra'\)/.test(body), "debe validar el estado objetivo");
  assert(/security definer/.test(fn.slice(0, 400)) && /set search_path = public/.test(fn.slice(0, 400)), "definer + search_path seguro");
  assert(/log_event\([\s\S]{0,160}'organization_module_access_changed'/.test(body), "debe auditar el cambio con antes/después");
});

check("7. set_organization_module_access: revoke public/anon, grant authenticated (superadmin dentro)", () => {
  assert(/revoke all on function public\.set_organization_module_access\(uuid, text, text\)\s+from public, anon/.test(migLower), "debe revocar public/anon");
  assert(/grant execute on function public\.set_organization_module_access\(uuid, text, text\)\s+to authenticated/.test(migLower), "debe otorgar a authenticated (verifica superadmin dentro)");
});

check("8. resolve_organization_module_access: membresía + vencimiento por fecha (sin cron)", () => {
  const fn = MIG.slice(MIG.indexOf("function public.resolve_organization_module_access"));
  const body = fn.slice(0, fn.indexOf("revoke all on function public.resolve_organization_module_access"));
  assert(/is_org_member\(p_organization_id\) or is_platform_superadmin\(\)/.test(body), "debe exigir miembro o superadmin");
  assert(/access_expires_at <= now\(\)/.test(body), "el vencimiento se deriva por fecha con now()");
});

console.log("\nTrazaloop · T9F: guards canónicos y capa de aplicación\n");

check("9. Los guards CPR y Textiles consumen la regla canónica", () => {
  const cpr = read("lib/auth/require-cpr-module.ts");
  const tex = read("lib/auth/require-textiles-module.ts");
  assert(cpr.includes("resolveModuleAccessForOrg") && cpr.includes("CPR_MODULE_CODE"), "el guard CPR debe usar la regla canónica");
  assert(tex.includes("resolveModuleAccessForOrg") && tex.includes("TEXTILES_MODULE_CODE"), "el guard Textiles debe usar la regla canónica");
  assert(tex.includes("isTextilesModuleEnabled()"), "el guard Textiles debe conservar el kill switch (prioridad del flag)");
});

check("10. La Server Action de superadmin exige superadministrador", () => {
  const src = stripTs(read("server/actions/platform-modules.ts"));
  assert(src.includes("requirePlatformStaff()"), "debe exigir platform staff");
  assert(/if \(!isSuperadmin\)/.test(src), "debe exigir superadministrador");
  assert(src.includes("isFunctionalModuleCode(moduleCode)"), "debe validar módulo funcional en el servidor");
  assert(!/access_mode|enabled/.test(src.replace(/setOrganizationModuleAccess|module_code|target_state/g, "")), "no debe aceptar access_mode/enabled arbitrarios del cliente");
});

check("11. La empresa NO puede asignarse un plan: sin escritura directa ni RPC de cliente", () => {
  // Ninguna Server Action que no sea la de plataforma debe invocar la RPC.
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) { if (entry === "node_modules" || entry === ".next") continue; walk(p); }
      else if (/\.(ts|tsx)$/.test(entry)) {
        const src = readFileSync(p, "utf8");
        if (/set_organization_module_access/.test(src) && !p.endsWith("module-access.ts") && !p.endsWith("platform-modules.ts")) {
          offenders.push(p);
        }
      }
    }
  };
  for (const r of ["app", "components", "server", "lib"]) walk(join(process.cwd(), r));
  assert(offenders.length === 0, `la RPC de plan se invoca fuera de la capa de plataforma: ${offenders.join(", ")}`);
});

console.log("\nTrazaloop · T9F: sin service role en el cliente\n");

check("12. Ningún componente \"use client\" hace un import RUNTIME del cliente admin ni de la capa server-only", () => {
  // Un `import type { … }` se borra en compilación y jamás llega al bundle
  // (el build lo confirma). Solo un import de RUNTIME arrastraría service role
  // al cliente — eso es lo que se prohíbe.
  const offenders: string[] = [];
  const runtimeImport = /import\s+(?!type\b)[^;]*from\s+["'](?:@\/lib\/supabase\/admin|@\/lib\/db\/module-access)["']/;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) { if (entry === "node_modules" || entry === ".next") continue; walk(p); }
      else if (/\.(ts|tsx)$/.test(entry)) {
        const src = readFileSync(p, "utf8");
        const isClient = /^\s*["']use client["']/.test(src.trimStart());
        if (isClient && runtimeImport.test(src)) offenders.push(p);
      }
    }
  };
  for (const r of ["app", "components", "lib"]) walk(join(process.cwd(), r));
  assert(offenders.length === 0, `módulos cliente hacen import RUNTIME de capa server-only: ${offenders.join(", ")}`);
});

check("13. lib/db/module-access.ts es server-only y usa el cliente admin solo para superadmin", () => {
  const src = read("lib/db/module-access.ts");
  assert(/import "server-only"/.test(src), "debe ser server-only");
  assert(src.includes("createAdminClient()"), "usa el cliente admin para la lectura de plataforma");
  // La resolución del acceso del propio usuario usa la sesión (RLS), no admin.
  const resolveFn = src.slice(src.indexOf("export async function getOrganizationModuleAssignment"));
  const resolveBody = resolveFn.slice(0, resolveFn.indexOf("export async function", 10));
  assert(resolveBody.includes("createServerClient()") && !resolveBody.includes("createAdminClient"), "el acceso propio debe leerse bajo RLS de la sesión");
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
