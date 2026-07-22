/**
 * Trazaloop · Sprint T3 (Textil) · Tests de los catálogos textiles:
 * validación PURA de dominio + invariantes de la migración 0073, RLS y
 * rutas (patrón de tests de fuente del proyecto, sin BD).
 *
 * Correr: npx tsx tests/unit/textiles-catalogs.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  TEXTILE_SUPPLIER_TYPES,
  TEXTILE_MATERIAL_TYPES,
  TEXTILE_COMPONENT_TYPES,
  TEXTILE_SEPARABILITY_VALUES,
  TEXTILE_PROCESS_TYPES,
  TEXTILE_OUTSOURCED_PROCESS_TYPES,
  TEXTILE_TRACEABILITY_RISK_VALUES,
  validateCatalogName,
  cleanText,
  isOneOf,
  isValidEmail,
} from "../../lib/domain/textiles-catalogs";

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
function readSource(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf8");
}

const MIG = readSource("../../supabase/migrations/0073_textile_catalogs.sql");
const ACTIONS = readSource("../../server/actions/textiles-catalogs.ts");

console.log("Trazaloop · Textil T3: dominio puro\n");

check("1. Nombre obligatorio: vacío, espacios o no-string se rechazan; el válido se recorta", () => {
  assert(validateCatalogName("").error !== null, "vacío debía fallar");
  assert(validateCatalogName("   ").error !== null, "solo espacios debía fallar");
  assert(validateCatalogName(undefined).error !== null, "undefined debía fallar");
  assert(validateCatalogName("x".repeat(201)).error !== null, "más de 200 debía fallar");
  const ok = validateCatalogName("  Telas del Sur  ");
  assert(ok.error === null && ok.name === "Telas del Sur", "debía recortar y aceptar");
});

check("2. cleanText normaliza: recorta y devuelve null para vacíos", () => {
  assert(cleanText("  hola  ") === "hola", "debía recortar");
  assert(cleanText("   ") === null && cleanText("") === null && cleanText(undefined) === null, "vacíos → null");
});

check("3. Correos: formato básico válido/ inválido", () => {
  assert(isValidEmail("a@b.co") && isValidEmail("compras@telas-sur.com.co"), "válidos debían pasar");
  for (const bad of ["a@b", "a b@c.co", "@x.co", "a@", "correo"]) {
    assert(!isValidEmail(bad), `${bad} debía fallar`);
  }
});

check("4. Enums del dominio espejan los CHECK de 0073 (misma lista exacta)", () => {
  const pairs: [readonly string[], string][] = [
    [TEXTILE_SUPPLIER_TYPES, "textile_suppliers_type_check"],
    [TEXTILE_MATERIAL_TYPES, "textile_materials_type_check"],
    [TEXTILE_COMPONENT_TYPES, "textile_components_type_check"],
    [TEXTILE_SEPARABILITY_VALUES, "textile_components_separability_check"],
    [TEXTILE_PROCESS_TYPES, "textile_processes_type_check"],
    [TEXTILE_OUTSOURCED_PROCESS_TYPES, "textile_outsourced_type_check"],
    [TEXTILE_TRACEABILITY_RISK_VALUES, "textile_processes_risk_check"],
  ];
  for (const [values, constraintName] of pairs) {
    assert(MIG.includes(constraintName), `debía existir ${constraintName}`);
    for (const v of values) {
      assert(MIG.includes(`'${v}'`), `el valor ${v} debía estar en la migración`);
    }
  }
  assert(isOneOf(TEXTILE_SUPPLIER_TYPES, "mixed") && !isOneOf(TEXTILE_SUPPLIER_TYPES, "otro"), "isOneOf debía validar la lista");
});

console.log("\nTrazaloop · Textil T3: migración 0073\n");

check("5. 0073 crea SOLO las 6 tablas de catálogos (nada de productos/lotes/pasaporte)", () => {
  const created = [...MIG.matchAll(/create table public\.([a-z_]+)/g)].map((m) => m[1]).sort();
  assert(
    JSON.stringify(created) ===
      JSON.stringify([
        "textile_components",
        "textile_fiber_types",
        "textile_materials",
        "textile_outsourced_processes",
        "textile_processes",
        "textile_suppliers",
      ]),
    `tablas creadas inesperadas: ${created.join(", ")}`
  );
  for (const banned of [
    "textile_products", "textile_references", "textile_collections",
    "textile_product_compositions", "textile_process_orders",
    "textile_input_batches", "textile_output_batches",
    "textile_material_passports", "textile_circularity",
    "textile_evidence", "textile_claim", "organization_module_access",
  ]) {
    assert(!MIG.includes(banned), `0073 no debía mencionar ${banned}`);
  }
  assert(!/drop\s|alter table public\.(?!textile_)/.test(MIG), "0073 no debía alterar/borrar objetos existentes");
});

check("6. Las 5 tablas por empresa siguen el patrón 0020/0024 completo", () => {
  const orgTables = [
    "textile_suppliers", "textile_materials", "textile_components",
    "textile_processes", "textile_outsourced_processes",
  ];
  for (const t of orgTables) {
    assert(MIG.includes(`organization_id uuid not null references public.organizations`) , "org FK requerida");
    assert(new RegExp(`constraint ${t.replace("_processes", "").replace("textile_outsourced", "textile_outsourced")}[a-z_]*_org_id_uniq unique \\(organization_id, id\\)`).test(MIG) || MIG.includes(`unique (organization_id, id)`), `${t} debía tener unique(organization_id,id)`);
    for (const trig of ["_updated", "_force_created_by", "_org_immutable"]) {
      const base = t === "textile_outsourced_processes" ? "textile_outsourced" : t;
      assert(MIG.includes(`t_${base}${trig}`), `${t} debía tener trigger ${trig}`);
    }
  }
  const auditTriggers = (MIG.match(/after insert or update or delete on public\.textile/g) ?? []).length;
  assert(auditTriggers === 5, `las 5 tablas por empresa debían tener auditoría (hay ${auditTriggers})`);
  const orgImmutable = (MIG.match(/execute function public\.prevent_organization_id_change/g) ?? []).length;
  assert(orgImmutable === 5, `las 5 debían tener organization_id inmutable (hay ${orgImmutable})`);
});

check("7. RLS plantilla CPR: select/insert/update miembros; delete solo admin/quality; fibras solo lectura", () => {
  assert((MIG.match(/is_org_member\(organization_id\)/g) ?? []).length >= 20, "las políticas de miembros debían estar completas");
  assert((MIG.match(/has_org_role\(organization_id, array\['admin','quality'\]\)/g) ?? []).length === 5, "delete debía ser solo admin/quality en las 5 tablas");
  assert(MIG.includes("textile_fiber_types_select"), "fibras debía tener política de lectura");
  assert(!/create policy textile_fiber_types_(insert|update|delete)/.test(MIG), "fibras no debía tener escritura de clientes");
  const enables = (MIG.match(/enable row level security/g) ?? []).length;
  assert(enables === 6, `las 6 tablas debían habilitar RLS (hay ${enables})`);
});

check("8. Enlaces a proveedor con FK COMPUESTA (imposible cross-tenant)", () => {
  const composite = (MIG.match(/foreign key \(organization_id, supplier_id\)\s*\n\s*references public\.textile_suppliers \(organization_id, id\)/g) ?? []).length;
  assert(composite === 3, `materiales, componentes y tercerizados debían usar FK compuesta a proveedores (hay ${composite})`);
});

check("9. Seed de fibras: 19 tipos, idempotente y con lenguaje declarativo", () => {
  const seeds = (MIG.match(/^  \('[a-z_]+',/gm) ?? []).length;
  assert(seeds === 19, `debían sembrarse 19 fibras (hay ${seeds})`);
  assert(MIG.includes("on conflict (code) do nothing"), "el seed debía ser idempotente");
  for (const code of ["cotton", "recycled_polyester", "elastane", "lyocell", "other"]) {
    assert(MIG.includes(`('${code}'`), `debía existir la fibra ${code}`);
  }
  assert(MIG.includes("(declarado)") || MIG.includes("(declarada)"), "las variantes recicladas/orgánicas debían marcarse como declaradas");
});

console.log("\nTrazaloop · Textil T3: actions y rutas\n");

check("10. Todas las mutaciones pasan por la triple guarda + solo lectura de plataforma", () => {
  assert(ACTIONS.includes("requireTextilesForAction"), "las actions debían usar la guarda compartida del módulo");
  assert(ACTIONS.includes("checkOrganizationCanMutate"), "debían respetar el modo solo lectura");
  // 5 create + 5 update + 1 setActive compartido (los 5 toggles delegan en él).
  const gateCalls = (ACTIONS.match(/await gate\(\)/g) ?? []).length;
  assert(gateCalls === 11, `cada mutación debía abrir con gate() (hay ${gateCalls})`);
  assert(!ACTIONS.includes("createAdminClient") && !ACTIONS.includes("SUPABASE_SERVICE_ROLE"), "sin cliente admin/service_role");
});

check("11. Los inserts fijan organization_id de la empresa activa y los updates filtran por ella", () => {
  const inserts = (ACTIONS.match(/organization_id: g\.ok\.organizationId/g) ?? []).length;
  assert(inserts === 5, `los 5 create debían fijar organization_id del servidor (hay ${inserts})`);
  // 5 update + 1 setActive compartido: todo update filtra por organización.
  const updates = (ACTIONS.match(/\.eq\("organization_id", g\.ok\.organizationId\)/g) ?? []).length;
  assert(updates === 6, `updates y toggles debían filtrar por organization_id (hay ${updates})`);
});

check("12. Relaciones validadas: proveedor de la MISMA empresa y fibra activa", () => {
  assert(ACTIONS.includes("textileSupplierBelongsToOrg"), "debía validarse la pertenencia del proveedor");
  assert(ACTIONS.includes("textileFiberTypeIsActive"), "debía validarse la fibra activa");
});

check("13. Duplicados con mensaje amigable (unique 23505) y sin registros vacíos", () => {
  assert(ACTIONS.includes('"23505"'), "debía detectarse la violación de unicidad");
  assert(ACTIONS.includes("Ya existe"), "debía devolver mensaje amigable de duplicado");
  assert(ACTIONS.includes("validateCatalogName"), "el nombre debía validarse antes de la BD");
});

check("14. Las 7 rutas de catálogos viven bajo el namespace protegido y usan el guard", () => {
  const pages = [
    "../../app/(app)/(shell)/textiles/catalogs/page.tsx",
    "../../app/(app)/(shell)/textiles/catalogs/suppliers/page.tsx",
    "../../app/(app)/(shell)/textiles/catalogs/fibers/page.tsx",
    "../../app/(app)/(shell)/textiles/catalogs/materials/page.tsx",
    "../../app/(app)/(shell)/textiles/catalogs/components/page.tsx",
    "../../app/(app)/(shell)/textiles/catalogs/processes/page.tsx",
    "../../app/(app)/(shell)/textiles/catalogs/outsourced-processes/page.tsx",
  ];
  for (const p of pages) {
    const src = readSource(p);
    assert(src.includes("requireTextilesModule"), `${p} debía usar el guard`);
    assert(src.includes("force-dynamic"), `${p} debía ser force-dynamic`);
  }
});

check("15. El shell /textiles enlaza los catálogos y la landing pública NO los expone", () => {
  const shell = readSource("../../app/(app)/(shell)/textiles/page.tsx");
  assert(shell.includes("/textiles/catalogs") && shell.includes("Catálogos textiles"), "el shell debía enlazar catálogos");
  const landing = readSource("../../app/page.tsx");
  assert(!landing.includes("/textiles"), "la landing pública no debía enlazar rutas del módulo privado");
});

check("16. La página de catálogos muestra el aviso de no certificación", () => {
  const page = readSource("../../app/(app)/(shell)/textiles/catalogs/page.tsx");
  assert(page.includes("TEXTILE_CATALOGS_DISCLAIMER"), "debía mostrarse el aviso");
  const domain = readSource("../../lib/domain/textiles-catalogs.ts");
  assert(domain.includes("No equivalen") && domain.includes("certificación"), "el aviso debía negar equivalencia con certificación");
});

if (failures > 0) {
  console.error(`\n${failures} fallo(s).`);
  process.exit(1);
}
console.log("\nTodo verde.");
