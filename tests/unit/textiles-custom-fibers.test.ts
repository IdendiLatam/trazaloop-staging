/**
 * Trazaloop · Sprint T9E (Textil) · Regresión del catálogo de fibras
 * (defecto 4.4): el catálogo base es global y está protegido de forma
 * absoluta; las fibras personalizadas son por organización, con RLS,
 * unicidad razonable y eliminación solo sin uso.
 *
 * Correr: npx tsx tests/unit/textiles-custom-fibers.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  TEXTILE_FIBER_FAMILIES,
  TEXTILE_FIBER_BASE_CATALOG_TITLE,
  TEXTILE_FIBER_BASE_CATALOG_EXPLANATION,
  canAdministerTextileCatalogs,
} from "../../lib/domain/textiles-catalogs";

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
const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const MIG = read("supabase/migrations/0093_textile_custom_fibers.sql");
const MIG_0073 = read("supabase/migrations/0073_textile_catalogs.sql");
const ADMIN = read("server/actions/textiles-catalogs-admin.ts");
const DB = read("lib/db/textiles-catalogs.ts");
const PAGE = read("app/(app)/(shell)/textiles/catalogs/fibers/page.tsx");

console.log("Trazaloop · T9E: migración 0093 (fibras personalizadas)\n");

check("1. 0093 es ADITIVA: no altera 0070–0092, no borra tablas ni datos", () => {
  assert(!/drop table|truncate|delete from/i.test(MIG), "0093 no debía destruir datos");
  assert(MIG.includes("add column organization_id"), "debía agregar organization_id nullable");
  assert(
    !MIG.includes("update public.textile_fiber_types"),
    "las 19 fibras sembradas quedan intactas (organization_id NULL)"
  );
  // 0073 permanece intacto con su regla de solo lectura original.
  assert(
    !/create policy textile_fiber_types_(insert|update|delete)/.test(MIG_0073),
    "0073 no debía tocarse retroactivamente"
  );
});

check("2. RLS: lectura base + propias; escritura SOLO personalizadas y SOLO admin/quality", () => {
  assert(
    MIG.includes("organization_id is null or public.is_org_member(organization_id)"),
    "select: base para todos los autenticados, propias por membresía"
  );
  for (const op of ["insert", "update", "delete"]) {
    const policy = MIG.includes(`textile_fiber_types_${op}_custom`);
    assert(policy, `debía existir la política ${op} de personalizadas`);
  }
  const writeBlocks = MIG.match(/organization_id is not null\s*\n\s*and public\.has_org_role\(organization_id, array\['admin', 'quality'\]\)/g) ?? [];
  assert(writeBlocks.length >= 4, "toda escritura exige organization_id NOT NULL + admin/quality");
});

check("3. Las fibras del catálogo base están protegidas también por trigger (defensa en profundidad)", () => {
  assert(MIG.includes("protect_global_textile_fiber_types"), "debía existir el trigger de protección");
  assert(
    MIG.includes("no pueden eliminarse") && MIG.includes("no pueden modificarse"),
    "el trigger debía bloquear update y delete de fibras base"
  );
  assert(
    MIG.includes("La organización de una fibra personalizada no puede cambiar"),
    "una personalizada jamás cambia de organización"
  );
  assert(!/protect_global_textile_fiber_types\(\)[\s\S]{0,120}security definer/.test(MIG), "el trigger protector NO es security definer (aplica también a service_role, patrón 0077)");
});

check("4. Uso cross-tenant cerrado en BD: materiales y composición validan la organización de la fibra", () => {
  assert(MIG.includes("validate_textile_fiber_org"), "debía existir la validación de organización de fibra");
  assert(
    MIG.includes("trg_validate_textile_material_fiber_org") &&
      MIG.includes("trg_validate_textile_composition_fiber_org"),
    "ambas tablas usuarias debían tener el trigger"
  );
  assert(/validate_textile_fiber_org[\s\S]{0,200}security definer[\s\S]{0,80}set search_path = public/.test(MIG), "la función es SECURITY DEFINER con search_path fijo");
  assert(MIG.includes("revoke execute on function public.validate_textile_fiber_org()"), "sin execute directo para clientes");
});

check("5. Unicidad razonable: nombre único por organización (case-insensitive), code único global", () => {
  assert(
    MIG.includes("textile_fiber_types_org_name_unique") && MIG.includes("lower(name)"),
    "debía existir la unicidad por organización"
  );
  assert(MIG.includes("where organization_id is not null"), "la unicidad aplica solo a personalizadas");
});

console.log("\nTrazaloop · T9E: acciones y consultas de fibras\n");

check("6. Las acciones de fibras personalizadas exigen rol admin/quality en SERVIDOR", () => {
  assert(ADMIN.includes("canAdministerTextileCatalogs"), "debía validarse el rol en la action");
  assert(canAdministerTextileCatalogs("admin") && canAdministerTextileCatalogs("quality"), "admin/quality administran");
  assert(!canAdministerTextileCatalogs("consultant"), "consultant no administra catálogos");
  assert(!canAdministerTextileCatalogs("viewer"), "otros roles tampoco");
});

check("7. Crear/editar previenen duplicados contra base Y personalizadas visibles", () => {
  assert(ADMIN.includes("fiberNameTaken"), "debía verificarse el nombre duplicado");
  assert(ADMIN.includes("Ya existe una fibra con ese nombre"), "mensaje claro de duplicado");
  assert(ADMIN.includes('"23505"'), "la unicidad de BD también se traduce a mensaje amigable");
});

check("8. La eliminación de una personalizada exige CERO uso (materiales y composición)", () => {
  assert(ADMIN.includes("getTextileFiberTypeUsage"), "debía contarse el uso antes de eliminar");
  assert(DB.includes("primary_fiber_type_id: fiberTypeId"), "el conteo cubre materiales");
  assert(DB.includes("fiber_type_id: fiberTypeId"), "el conteo cubre filas de composición");
  assert(ADMIN.includes("Desactívala en su lugar") || ADMIN.includes("desactívalo en su lugar"), "con uso se ofrece desactivar");
});

check("9. Toda mutación de fibras filtra por la organización del SERVIDOR (excluye a las base)", () => {
  const fiberMutations = ADMIN.slice(ADMIN.indexOf("createTextileCustomFiberAction"));
  const orgFilters = fiberMutations.match(/\.eq\("organization_id", g\.ok\.organizationId\)/g) ?? [];
  assert(orgFilters.length >= 3, "update/toggle/delete debían filtrar por organization_id del servidor");
  assert(
    fiberMutations.includes("organization_id: g.ok.organizationId"),
    "el insert fija organization_id del servidor (jamás del cliente)"
  );
  assert(!ADMIN.includes("input.organizationId"), "el cliente jamás envía organization_id");
});

check("10. La validación de fibra usable es org-aware (base o propia; jamás de otro tenant)", () => {
  assert(
    /textileFiberTypeIsActive\(\s*organizationId: string,\s*fiberTypeId: string\s*\)/.test(DB),
    "textileFiberTypeIsActive debía recibir la organización"
  );
  assert(
    DB.includes("organization_id.is.null,organization_id.eq."),
    "la consulta acepta solo fibras base o de la organización"
  );
});

console.log("\nTrazaloop · T9E: UI del catálogo de fibras\n");

check("11. La página explica la procedencia del catálogo base", () => {
  assert(PAGE.includes("TEXTILE_FIBER_BASE_CATALOG_TITLE"), "debía usarse el título central");
  assert(TEXTILE_FIBER_BASE_CATALOG_TITLE === "Catálogo base de Trazaloop", "título exacto pedido");
  assert(
    TEXTILE_FIBER_BASE_CATALOG_EXPLANATION.includes("catálogo base mantenido por Trazaloop") &&
      // T9G (glosario §6): la interfaz dice «empresas», nunca «organizaciones».
      TEXTILE_FIBER_BASE_CATALOG_EXPLANATION.includes("todas las empresas"),
    "la explicación debía cubrir origen y alcance"
  );
});

check("12. La página distingue base y personalizadas, y la gestión respeta el rol", () => {
  assert(PAGE.includes("Catálogo base"), "las fibras base llevan su distintivo");
  assert(PAGE.includes("canAdministerTextileCatalogs(org.roleCode)"), "el rol se calcula en servidor");
  assert(PAGE.includes("deleteTextileCustomFiberAction"), "las personalizadas sin uso pueden eliminarse");
  assert(PAGE.includes("setTextileCustomFiberActiveAction"), "la desactivación sigue disponible");
});

check("13. Las familias de fibra de la UI son exactamente las permitidas por el CHECK de 0073", () => {
  const expected = [
    "natural_cellulosic",
    "natural_protein",
    "synthetic",
    "regenerated_cellulosic",
    "inorganic",
    "other",
  ];
  assert(
    JSON.stringify([...TEXTILE_FIBER_FAMILIES]) === JSON.stringify(expected),
    "TEXTILE_FIBER_FAMILIES debía espejar el CHECK de BD"
  );
  for (const family of expected) {
    assert(MIG_0073.includes(`'${family}'`), `la familia ${family} debía existir en el CHECK de 0073`);
  }
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
