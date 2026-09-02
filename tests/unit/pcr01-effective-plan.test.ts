/**
 * Trazaloop · Sprint PCR-01 · Punto 16 — corrección del bug Demo→Full en
 * invitaciones. Pruebas ESTÁTICAS (sin BD): verifican que la migración 0103
 * existe con la semántica pactada, que accept_team_invitation ya no resuelve
 * el plan comercial desde la copia obsoleta de organization_subscriptions y
 * que los helpers server de recursos transversales usan el plan EFECTIVO por
 * módulos. Las pruebas con BD real quedan en la matriz como BLOCKED hasta el
 * entorno QA (ver PCR-01-TEST-MATRIX.md).
 *
 * Correr: npm run test:pcr01-effective-plan
 */
import fs from "node:fs";
import path from "node:path";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function readSource(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

const MIGRATION = readSource(
  "../../supabase/migrations/0103_pcr01_effective_plan_and_input_batch_quantity.sql"
);
const PLANS_ACTIONS = readSource("../../server/actions/plans.ts");
const PLANS_DB = readSource("../../lib/db/plans.ts");
const TEAM_ACTIONS = readSource("../../server/actions/team.ts");

console.log("PCR-01 · Plan efectivo y corrección Demo→Full (punto 16)");

check("1. La migración 0103 define organization_effective_plan_code", () => {
  assert(
    MIGRATION.includes("create or replace function public.organization_effective_plan_code"),
    "0103 debía crear organization_effective_plan_code"
  );
  assert(
    MIGRATION.includes("security definer"),
    "la función debía ser security definer (se invoca desde la RPC de aceptación)"
  );
  assert(
    /revoke execute on function public\.organization_effective_plan_code\(uuid\) from public, anon, authenticated/.test(
      MIGRATION
    ),
    "la función interna no debía ser ejecutable por clientes"
  );
});

check("2. El plan efectivo prioriza extra > full > demo entre módulos vigentes", () => {
  assert(
    MIGRATION.includes("when 'extra' then 3 when 'full' then 2 else 1"),
    "debía existir el ranking extra>full>demo"
  );
  assert(MIGRATION.includes("m.is_functional"), "debía limitarse a módulos funcionales");
  assert(MIGRATION.includes("om.enabled"), "debía exigir enabled = true");
  assert(
    MIGRATION.includes("om.access_expires_at > now()"),
    "un Demo vencido no debía aportar plan"
  );
});

check("3. Fallback legacy con piso 'demo' (empresas sin provisión T9F)", () => {
  assert(
    MIGRATION.includes("from organization_subscriptions") &&
      MIGRATION.includes("return 'demo';"),
    "sin filas de módulos debía caer al plan legacy con piso demo"
  );
});

check("4. No se crean planes nuevos: el resultado es demo|full|extra", () => {
  assert(
    MIGRATION.includes("'demo', 'full', 'extra'"),
    "los únicos códigos válidos debían ser demo/full/extra (Full≡Extra salvo almacenamiento — invariante intacta)"
  );
});

check("5. accept_team_invitation usa el plan efectivo (causa raíz corregida)", () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("create or replace function public.accept_team_invitation")
  );
  assert(
    fn.includes("v_plan_code := organization_effective_plan_code(v_inv.organization_id);"),
    "la RPC debía resolver el plan comercial con organization_effective_plan_code"
  );
  assert(
    !/select coalesce\(plan_code, 'demo'\)[\s\S]*into v_plan_code/.test(fn),
    "la RPC no debía volver a leer plan_code de organization_subscriptions"
  );
});

check("6. La RPC conserva el estado administrativo y sus mensajes exactos", () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("create or replace function public.accept_team_invitation")
  );
  for (const msg of [
    "La cuenta de esta empresa está suspendida. Contacta al equipo de Trazaloop.",
    "La cuenta de esta empresa no está activa. Contacta al equipo de Trazaloop.",
    "Las invitaciones y roles están disponibles en los planes Full y Extra.",
    "Esta invitación fue enviada a otro correo electrónico",
  ]) {
    assert(fn.includes(msg), `la RPC debía conservar el mensaje: ${msg}`);
  }
  assert(
    fn.includes("from organization_subscriptions") && fn.includes("coalesce(status, 'active')"),
    "el estado suspended/cancelled debía seguir leyéndose de organization_subscriptions"
  );
});

check("7. get_organization_effective_plan exige membresía o staff", () => {
  assert(
    MIGRATION.includes("create or replace function public.get_organization_effective_plan"),
    "0103 debía crear la RPC de lectura"
  );
  assert(
    MIGRATION.includes("is_org_member(p_organization_id) or is_platform_staff()"),
    "la RPC debía autorizar por membresía o staff de plataforma"
  );
  assert(
    /grant execute on function public\.get_organization_effective_plan\(uuid\) to authenticated/.test(
      MIGRATION
    ),
    "la RPC debía ser ejecutable por authenticated"
  );
});

check("8. lib/db/plans.ts lee el plan efectivo vía la RPC y es fail-closed", () => {
  assert(
    PLANS_DB.includes("getOrganizationEffectivePlanCode") &&
      PLANS_DB.includes('rpc("get_organization_effective_plan"'),
    "debía existir getOrganizationEffectivePlanCode sobre la RPC"
  );
  // PE-04B2 · La promesa era «un fallo NUNCA amplía permisos», y sigue en pie.
  // Lo que cambió es cómo se cumple: antes devolvía `"demo"`, que fallaba
  // cerrado y a la vez MENTÍA sobre la identidad del plan — no distinguía «es
  // el plan más bajo» de «no pude saberlo», y es la mitad del defecto que hacía
  // que un cliente Full leyera «Plan Demo».
  //
  // Ahora devuelve `null`, que quien llama trata como «no disponible»: deniega
  // igual, y no se puede enseñar como si fuera un plan.
  assert(
    PLANS_DB.includes("if (error) return null;"),
    "ante error de lectura debía responder null (ni un plan, ni ampliar permisos)"
  );
  assert(
    !PLANS_DB.includes('if (error) return "demo";'),
    "un fallo de lectura vuelve a presentarse como el plan Demo"
  );
  // Y quien llama tiene que DENEGAR ante lo indeterminado, no dejar pasar.
  //
  // PE-04B4 · Ya no se resuelve un `tier` en `plans.ts`: los límites de conteo
  // y las funciones habilitadas se leen del catálogo canónico
  // (`organization_plan_limit`, 0166), igual que la cuota de almacenamiento se
  // lee del suyo desde 0164. La promesa NO cambió —lo indeterminado deniega— y
  // se comprueba sobre la forma nueva.
  assert(
    PLANS_ACTIONS.includes('limit.status === "unavailable"'),
    "un límite que no se pudo leer deja pasar la operación"
  );
  assert(
    PLANS_ACTIONS.includes('limit.status === "not_configured"'),
    "un límite SIN CONFIGURAR deja pasar la operación · no es «ilimitado», es que nadie lo decidió"
  );
});

check("9. checkFeatureEnabled/checkResourceLimit usan el plan efectivo", () => {
  // PCR-01 corrigió que estos dos leyeran el plan de `organization_subscriptions`
  // en vez del efectivo por módulos. PE-04B4 va un paso más: los leen del
  // catálogo comercial canónico, que es plan efectivo Y sin traducción a
  // `demo`. Lo que PCR-01 protegía sigue protegido.
  const usos = PLANS_ACTIONS.split("getOrganizationPlanLimit(").length - 1;
  assert(usos >= 2, `los dos helpers debían resolver el límite con el catálogo canónico, hay ${usos} usos`);
  assert(PLANS_ACTIONS.includes("getOrganizationPlanLimit,"), "falta la importación del resolutor canónico");
  assert(
    !/getPlanLimits\(usage\.planCode\)/.test(PLANS_ACTIONS),
    "el interruptor de funciones no debía seguir atado al plan legacy"
  );
  assert(
    !PLANS_ACTIONS.includes("commercialTierToLegacyPlanCode("),
    "seguía traduciendo el plan canónico a su código legacy para preguntar"
  );
});

check("10. La cadena de crear invitación pasa por los helpers corregidos", () => {
  assert(
    TEAM_ACTIONS.includes('checkFeatureEnabled("roles_enabled")') &&
      TEAM_ACTIONS.includes('checkResourceLimit("team_members")'),
    "createTeamInvitationAction debía seguir validando en servidor (control intacto, fuente corregida)"
  );
});

check("11. La migración es aditiva: sin drops destructivos ni cambios de RLS", () => {
  assert(!/drop\s+table/i.test(MIGRATION), "0103 no debía eliminar tablas");
  assert(!/alter\s+table[^;]*disable\s+row\s+level\s+security/i.test(MIGRATION), "0103 no debía desactivar RLS");
  assert(!/truncate/i.test(MIGRATION), "0103 no debía truncar datos");
  assert(
    !/delete\s+from\s+(?!.*--)/i.test(MIGRATION.replace(/--[^\n]*/g, "")),
    "0103 no debía borrar filas"
  );
});

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones del plan efectivo pasaron.");
