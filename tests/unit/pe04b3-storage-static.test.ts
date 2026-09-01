/**
 * Trazaloop · PE-04B3 · Lo que se puede comprobar leyendo.
 *
 * La suite que importa es la que ejecuta (tests/rls/pe04b3-organization-storage).
 * Esta cubre lo que un cambio futuro podría deshacer en silencio: que la cuota
 * siga saliendo de un solo sitio, que la migración no borre datos de cliente,
 * y que el puente free→demo no vuelva al camino de almacenamiento.
 *
 * Correr: npm run test:pe04b3-static
 */
import { readFileSync } from "node:fs";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (p: string) => readFileSync(p, "utf8");

const M64 = leer("supabase/migrations/0164_canonical_organization_storage_quota.sql");
const PLANS = leer("server/actions/plans.ts");
const MODULE_PLANS = leer("server/actions/module-plans.ts");
const STORAGE = leer("lib/db/organization-storage.ts");
const SETTINGS_DB = leer("lib/db/settings.ts");

const FUNCIONES = [
  "organization_storage_usage",
  "organization_storage_quota",
  "organization_storage_status",
  "organization_storage_guard",
  "organization_storage_guard_logo",
  "organization_storage_drift",
];

console.log("\nPE-04B3 · Estático\n");

// ---------------------------------------------------------------------------
console.log("A · La migración");
// ---------------------------------------------------------------------------

check("A1. 0164 define las seis funciones canónicas", () => {
  for (const f of FUNCIONES) {
    assert(M64.includes(`create or replace function public.${f}(`), `falta ${f}`);
  }
});

check("A2. Todas son security definer con search_path fijado", () => {
  // Sin `set search_path`, una función security definer se puede secuestrar
  // con un esquema en el camino de búsqueda del llamante.
  for (const f of FUNCIONES) {
    const i = M64.indexOf(`create or replace function public.${f}(`);
    const cabecera = M64.slice(i, i + 900);
    assert(/security definer/i.test(cabecera), `${f} no es security definer`);
    assert(/set search_path to 'public'/i.test(cabecera), `${f} no fija search_path`);
  }
});

check("A3. Ninguna queda expuesta a anon", () => {
  for (const f of FUNCIONES) {
    assert(M64.includes(`revoke all on function public.${f}(`), `${f} sin revoke`);
    assert(M64.includes(`grant execute on function public.${f}(`), `${f} sin grant explícito`);
  }
});

check("A4. La migración NO borra datos de cliente", () => {
  // «Bajar de plan jamás borra los datos del cliente» tiene que ser cierto
  // también de la propia migración: una bajada solo cambia la cuota.
  const cuerpo = M64.toLowerCase();
  for (const prohibido of ["drop table", "truncate", "delete from evidences",
    "delete from trazadoc", "delete from textile_evidences", "delete from organizations"]) {
    assert(!cuerpo.includes(prohibido), `0164 contiene «${prohibido}»`);
  }
});

check("A5. La reserva toma UN lock por empresa, no por módulo", () => {
  assert(M64.includes("hashtextextended('organization_storage:' || p_organization_id::text, 0)"),
    "no se ve el lock por empresa");
  const i = M64.indexOf("create or replace function public.organization_storage_guard(");
  const cuerpo = M64.slice(i, M64.indexOf("$$;", i));
  assert(!cuerpo.includes("module_storage:"),
    "la reserva canónica volvió a mirar el ámbito del módulo");
});

check("A6. Los dos caminos de subida llaman a la reserva canónica", () => {
  const cpr = M64.slice(M64.indexOf("create or replace function public.begin_cpr_storage_upload("));
  const cprCuerpo = cpr.slice(0, cpr.indexOf("$function$;"));
  assert(cprCuerpo.includes("organization_storage_guard("), "CPR no llama a la reserva canónica");

  const tex = M64.slice(M64.indexOf("create or replace function public.begin_textile_evidence_upload_v2("));
  const texCuerpo = tex.slice(0, tex.indexOf("$function$;"));
  assert(texCuerpo.includes("organization_storage_guard("), "Textiles no llama a la reserva canónica");
});

check("A7. Y ninguno de los dos sigue leyendo la cuota legacy por módulo", () => {
  const desde = M64.indexOf("create or replace function public.begin_cpr_storage_upload(");
  const cola = M64.slice(desde);
  assert(!/storage_limit_bytes[\s\S]{0,80}from plan_definitions/.test(cola),
    "sigue leyendo storage_limit_bytes de plan_definitions");
  assert(!cola.includes("module_storage_snapshot("),
    "sigue decidiendo la cuota con el snapshot por módulo");
});

check("A8. Pero conservan los locks y el límite de UNIDADES del módulo", () => {
  // La capacidad pasó a ser de empresa; el número de evidencias sigue siendo
  // del módulo. Son dos límites distintos y solo uno cambió.
  const tex = M64.slice(M64.indexOf("create or replace function public.begin_textile_evidence_upload_v2("));
  assert(tex.includes("module_resource:"), "se perdió el lock de recurso del módulo");
  assert(tex.includes("EVIDENCE_LIMIT_EXCEEDED"), "se perdió el límite de evidencias del módulo");
  assert(tex.includes("MODULE_ACCESS_BLOCKED"), "se perdió la barrera de acceso al módulo");
});

check("A9. El uso canónico incluye lo que la vista legacy ignoraba", () => {
  const i = M64.indexOf("create or replace function public.organization_storage_usage(");
  const cuerpo = M64.slice(i, M64.indexOf("$$;", i));
  for (const familia of [
    "trazadoc_file_document_versions",   // no estaba en v_organization_plan_usage
    "storage_orphan_candidates",          // tampoco
    "textile_evidence_upload_intents",    // reservas vivas: tampoco
    "storage_upload_intents",
    "organization-assets",                // el logo, que no estaba en el snapshot por módulo
  ]) {
    assert(cuerpo.includes(familia), `el uso canónico no mira ${familia}`);
  }
  assert(!cuerpo.includes("tutorial-media"),
    "el contenido de plataforma NO se le cobra al cliente");
});

check("A10. Los tamaños desconocidos NO se leen como cero", () => {
  const i = M64.indexOf("create or replace function public.organization_storage_usage(");
  const cuerpo = M64.slice(i, M64.indexOf("$$;", i));
  assert(cuerpo.includes("size_unknown") && cuerpo.includes("size_conflict"),
    "no se distinguen tamaños desconocidos ni contradictorios");
  assert(M64.includes("'usage_unverifiable'"),
    "un uso no verificable no produce un estado propio");
});

// ---------------------------------------------------------------------------
console.log("\nB · El puente free→demo sale del almacenamiento");
// ---------------------------------------------------------------------------

check("B1. checkStorageAvailable ya no traduce a un plan legacy", () => {
  const cuerpo = PLANS.slice(
    PLANS.indexOf("export async function checkStorageAvailable"),
    PLANS.indexOf("function resourceCurrentCount")
  );
  assert(!cuerpo.includes("commercialTierToLegacyPlanCode("), "sigue usando el puente");
  assert(!cuerpo.includes("listPlanDefinitions("), "sigue leyendo la cuota legacy");
  assert(cuerpo.includes("getOrganizationStorageStatus("), "no usa el estado canónico");
});

check("B2. La cuota por módulo también sale del estado canónico", () => {
  const cuerpo = MODULE_PLANS.slice(
    MODULE_PLANS.indexOf("export async function getModuleStorageUsage"),
    MODULE_PLANS.indexOf("export async function getModuleAccessModeForAction")
  );
  assert(cuerpo.includes("getOrganizationStorageStatus(ok.organizationId)"),
    "la preflight del módulo seguiría discrepando de lo que exige la base");
  assert(!cuerpo.includes("storageLimitBytes"),
    "sigue derivando el límite de plan_definitions");
});

check("B3. Nadie deriva ya la cuota de almacenamiento de plan_definitions", () => {
  for (const [ruta, src] of [["server/actions/plans.ts", PLANS],
                             ["server/actions/module-plans.ts", MODULE_PLANS]] as const) {
    assert(!/storageLimitBytes/.test(src), `${ruta} sigue leyendo storageLimitBytes`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nC · El lado TypeScript");
// ---------------------------------------------------------------------------

check("C1. Los cuatro estados están declarados y son exactamente cuatro", () => {
  assert(/WITHIN_LIMIT[\s\S]{0,120}AT_LIMIT[\s\S]{0,120}OVER_LIMIT[\s\S]{0,120}QUOTA_UNAVAILABLE/
    .test(STORAGE), "faltan estados");
  const lista = STORAGE.slice(STORAGE.indexOf("export const STORAGE_STATES"),
    STORAGE.indexOf("] as const;", STORAGE.indexOf("export const STORAGE_STATES")));
  assert((lista.match(/"/g) ?? []).length === 8, "la lista de estados no tiene exactamente cuatro");
});

check("C2. Un fallo de lectura devuelve null, no un estado optimista", () => {
  const cuerpo = STORAGE.slice(STORAGE.indexOf("export async function getOrganizationStorageStatus"));
  assert(cuerpo.includes("if (error || !data") && cuerpo.includes("return null"),
    "un fallo de lectura no se distingue de una lectura buena");
  assert(!/return\s*{\s*state:\s*"WITHIN_LIMIT"/.test(cuerpo),
    "se inventa un estado permisivo ante el fallo");
});

check("C3. El logo retira los restos de extensiones anteriores", () => {
  // La ruta del logo lleva la extensión: sin esto, un PNG sustituido por un
  // WEBP dejaba bytes en el bucket que ninguna fila referenciaba.
  const cuerpo = SETTINGS_DB.slice(SETTINGS_DB.indexOf("export async function uploadCompanyLogo"));
  assert(cuerpo.includes(".list(`${orgId}/logo`)"), "no mira qué había antes en el prefijo");
  assert(cuerpo.includes(".remove(sobrantes)"), "no retira los restos");
});

console.log(`\nPE-04B3 · estático: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
