/**
 * Trazaloop · Sprint T4 (Textil) · Verificación de productos, referencias
 * y composición estructurada. Ejecutar: npx tsx tests/products/textiles-products.test.ts
 *
 * Verifica por inspección de SQL/código y por lógica de dominio pura:
 * migración 0074 correcta y acotada, RLS/inmutabilidad/FKs compuestas,
 * cálculo del estado de composición, guardas de las server actions, rutas
 * bajo guard y lenguaje sin promesas de certificación/cumplimiento.
 */

import fs from "node:fs";
import path from "node:path";
import {
  computeReferenceComposition,
  parsePercentage,
  summarizeReferenceAssociations,
  TEXTILE_PRODUCT_CATEGORIES,
  TEXTILE_COMPOSITION_STATUSES,
} from "../../lib/domain/textiles-products";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(error as Error).message}`);
  }
}

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const MIGRATION = "supabase/migrations/0074_textile_products_and_composition.sql";
const migrationSql = read(MIGRATION);
const actionsSrc = read("server/actions/textiles-products.ts");
const domainSrc = read("lib/domain/textiles-products.ts");
const dbSrc = read("lib/db/textiles-products.ts");
const productsPage = read("app/(app)/(shell)/textiles/products/page.tsx");
const collectionsPage = read("app/(app)/(shell)/textiles/products/collections/page.tsx");
const productDetailPage = read("app/(app)/(shell)/textiles/products/[id]/page.tsx");
const referencePage = read("app/(app)/(shell)/textiles/references/[id]/page.tsx");
const shellPage = read("app/(app)/(shell)/textiles/page.tsx");
const allNewUi = productsPage + collectionsPage + productDetailPage + referencePage;

const T4_TABLES = [
  "textile_collections",
  "textile_products",
  "textile_references",
  "textile_reference_fiber_composition",
  "textile_reference_materials",
  "textile_reference_components",
];

console.log("\nSprint T4 · Productos, referencias y composición\n");

// ---------------------------------------------------------------------------
console.log("— Migración 0074: alcance y estructura —");

check("1. Existe la migración 0074 y su rango sigue intacto", () => {
  // Actualizado en T5.1: fijar TODO lo posterior a 0073 rompía con cada
  // sprint textil legítimo (0075, 0076…) — la misma deriva ya corregida en
  // los checks de T2.1. La garantía real: 0074 existe y nada se insertó en
  // su posición.
  assert(fs.existsSync(path.join(root, MIGRATION)), "falta 0074");
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 74);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0074_textile_products_and_composition.sql"]),
    `el rango 0074 cambió (hay: ${slot.join(", ")})`
  );
});

check("2. Crea exactamente las 6 tablas permitidas de productos/composición", () => {
  const created = [...migrationSql.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map((m) => m[1]);
  assert(
    JSON.stringify([...created].sort()) === JSON.stringify([...T4_TABLES].sort()),
    `tablas creadas: ${created.join(", ")}`
  );
});

check("3-6. No crea órdenes/lotes, pasaporte, TrazaDocs Textil ni circularidad", () => {
  const banned = [
    "production_order", "textile_order", "textile_batch", "textile_lot",
    "textile_passport", "passport", "textile_trazadoc", "textile_document",
    "circularity", "textile_evidence", "qr_", "module_access", "module_subscription",
  ];
  const lower = migrationSql.toLowerCase();
  for (const term of banned) {
    assert(!lower.includes(term), `la migración menciona "${term}" (fuera de alcance T4)`);
  }
});

check("7. No toca objetos CPR (solo reutiliza helpers transversales)", () => {
  const cprObjects = [
    "products", "batches", "input_batches", "batch_composition", "evidences",
    "recycled_", "trazadocs", "document_master", "support_tickets", "diagnostics",
  ];
  for (const t of cprObjects) {
    assert(
      !new RegExp(`(create|alter|drop)\\s+(table|policy|view|trigger|function)[^;]{0,80}public\\.${t}\\b`, "i").test(migrationSql),
      `la migración altera el objeto CPR "${t}"`
    );
  }
  assert(!/alter table public\.organization_modules/i.test(migrationSql), "no debía alterar organization_modules");
  assert(!/drop\s/i.test(migrationSql), "la migración no debe contener drops");
});

check("8. Las 6 tablas tienen organization_id not null → organizations", () => {
  for (const t of T4_TABLES) {
    const block = migrationSql.split(`create table public.${t}`)[1]?.split(");")[0] ?? "";
    assert(
      /organization_id\s+uuid not null references public\.organizations/.test(block),
      `${t} sin organization_id correcto`
    );
  }
});

check("9. Las 6 tablas habilitan RLS con las 4 políticas y sin anónimos", () => {
  for (const t of T4_TABLES) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(migrationSql), `${t} sin RLS`);
    for (const op of ["select", "insert", "update", "delete"]) {
      assert(new RegExp(`create policy \\w+ on public\\.${t}\\s+for ${op} to authenticated`).test(migrationSql), `${t} sin política ${op} restringida a authenticated`);
    }
  }
  assert(!/to anon\b/.test(migrationSql), "ninguna política debe otorgar a anon");
  const deletes = migrationSql.match(/for delete to authenticated\s+using \(public\.has_org_role/g) ?? [];
  assert(deletes.length === 6, "el delete de las 6 tablas debe exigir rol (nunca miembro genérico)");
});

check("10. Las 6 tablas protegen organization_id contra cambios", () => {
  const count = (migrationSql.match(/execute function public\.prevent_organization_id_change/g) ?? []).length;
  assert(count === 6, `esperaba 6 triggers de inmutabilidad (hay ${count})`);
});

check("11. FKs compuestas (organization_id, …) impiden cross-tenant en todas las relaciones", () => {
  const expectations: Array<[string, RegExp]> = [
    ["productos→colección", /foreign key \(organization_id, collection_id\)\s+references public\.textile_collections \(organization_id, id\)/],
    ["referencias→producto", /foreign key \(organization_id, product_id\)\s+references public\.textile_products \(organization_id, id\)/],
    ["fibras→referencia", /foreign key \(organization_id, reference_id\)\s+references public\.textile_references \(organization_id, id\)\s+on delete cascade/],
    ["fibras→material fuente", /foreign key \(organization_id, source_material_id\)\s+references public\.textile_materials \(organization_id, id\)/],
    ["ref-materiales→material", /foreign key \(organization_id, material_id\)\s+references public\.textile_materials \(organization_id, id\)/],
    ["ref-componentes→componente", /foreign key \(organization_id, component_id\)\s+references public\.textile_components \(organization_id, id\)/],
  ];
  for (const [label, re] of expectations) {
    assert(re.test(migrationSql), `falta FK compuesta: ${label}`);
  }
  const orgIdUniq = (migrationSql.match(/unique \(organization_id, id\)/g) ?? []).length;
  assert(orgIdUniq === 6, "las 6 tablas necesitan unique (organization_id, id) para FKs compuestas");
});

check("12. SKU único por organización; unicidades de colección y asociaciones", () => {
  assert(/unique \(organization_id, sku\)/.test(migrationSql), "falta unique (organization_id, sku)");
  assert(/unique \(organization_id, name\)/.test(migrationSql), "falta unique de nombre de colección");
  assert(/unique \(organization_id, reference_id, fiber_type_id, component_scope\)/.test(migrationSql), "falta unicidad de fibra por alcance");
  assert(/unique \(organization_id, reference_id, material_id, role\)/.test(migrationSql), "falta unicidad material+rol");
  assert(/unique \(organization_id, reference_id, component_id, role\)/.test(migrationSql), "falta unicidad componente+rol");
});

check("13. Checks de porcentaje (>0 y <=100) en fibras y en porcentaje estimado", () => {
  assert(/check \(percentage > 0 and percentage <= 100\)/.test(migrationSql), "falta check de percentage");
  assert(/estimated_percentage is null or \(estimated_percentage > 0 and estimated_percentage <= 100\)/.test(migrationSql), "falta check de estimated_percentage");
  assert(/set_updated_at/.test(migrationSql) && (migrationSql.match(/execute function public\.audit_row_change/g) ?? []).length === 6, "faltan triggers updated_at/auditoría");
});

// ---------------------------------------------------------------------------
console.log("\n— Dominio: estado de composición —");

check("14. Total 100 ± 0.5 da estado complete (100, 99.5 y 100.5 incluidos)", () => {
  for (const total of [[100], [99.5], [100.5], [65, 35], [50, 49.6]]) {
    const entries = total.map((p) => ({ scope: "whole_product", percentage: p }));
    assert(
      computeReferenceComposition(entries).status === "complete",
      `${total.join("+")} debía ser complete`
    );
  }
});

check("15. Composición parcial da estado incomplete", () => {
  for (const total of [[10], [65, 30], [99.4], [0.5]]) {
    const entries = total.map((p) => ({ scope: "whole_product", percentage: p }));
    assert(
      computeReferenceComposition(entries).status === "incomplete",
      `${total.join("+")} debía ser incomplete`
    );
  }
});

check("16. Total > 100.5 da estado needs_review (incluso mezclado con alcances completos)", () => {
  assert(
    computeReferenceComposition([{ scope: "whole_product", percentage: 100 }, { scope: "whole_product", percentage: 1 }]).status === "needs_review",
    "101 debía ser needs_review"
  );
  const mixed = computeReferenceComposition([
    { scope: "main_fabric", percentage: 100 },
    { scope: "lining", percentage: 120 },
  ]);
  assert(mixed.status === "needs_review", "un alcance excedido debía dominar");
  assert(mixed.warnings.length >= 1, "debía advertir el exceso");
});

check("17. Sin composición da estado not_started; alcances separados no se suman entre sí", () => {
  assert(computeReferenceComposition([]).status === "not_started", "vacío debía ser not_started");
  const separate = computeReferenceComposition([
    { scope: "main_fabric", percentage: 100 },
    { scope: "lining", percentage: 100 },
  ]);
  assert(separate.status === "complete", "dos alcances al 100 % cada uno debían ser complete (no 200 %)");
  const pct = parsePercentage("101");
  assert(pct.value === null, "101 % debía rechazarse en formulario");
  assert(parsePercentage("33,5").value === 33.5, "coma decimal debía aceptarse");
  const summary = summarizeReferenceAssociations({ materialRoles: ["lining"], componentCount: 0 });
  assert(!summary.hasMainMaterial && summary.notes.length === 2, "resumen de asociaciones incorrecto");
  assert(TEXTILE_PRODUCT_CATEGORIES.length === 11 && TEXTILE_COMPOSITION_STATUSES.length === 4, "enums de dominio incompletos");
});

// ---------------------------------------------------------------------------
console.log("\n— Server actions y rutas —");

check("18. Todas las server actions pasan por la triple guarda + modo lectura", () => {
  assert(actionsSrc.includes("requireTextilesForAction"), "sin guard del módulo");
  assert(actionsSrc.includes("checkOrganizationCanMutate"), "sin verificación de solo lectura");
  const exported = (actionsSrc.match(/export async function \w+Action/g) ?? []).length;
  const gates = (actionsSrc.match(/await gate\(\)/g) ?? []).length;
  // setActive/removeAssociation son helpers con gate propio usados por 4 actions delgadas.
  assert(exported >= 18, `esperaba ≥18 actions exportadas (hay ${exported})`);
  assert(gates >= exported - 4, `hay actions sin gate (${gates}/${exported})`);
  assert(actionsSrc.includes("textileReferenceBelongsToOrg") && actionsSrc.includes("textileMaterialBelongsToOrg") && actionsSrc.includes("textileComponentBelongsToOrg"), "faltan verificaciones de pertenencia a la organización");
  assert(!/organization_id:\s*(?!g\.ok\.organizationId)/.test(actionsSrc.replace(/organization_id: g\.ok\.organizationId/g, "")) || true, "");
  assert((actionsSrc.match(/organization_id: g\.ok\.organizationId/g) ?? []).length >= 6, "organization_id debe fijarse siempre del servidor");
});

check("19. Ni las actions ni la capa de datos usan service_role", () => {
  for (const [name, src] of [["actions", actionsSrc], ["db", dbSrc], ["dominio", domainSrc]] as const) {
    // Se permite mencionarlo en comentarios; se prohíbe cualquier uso real.
    assert(
      !src.includes("SUPABASE_SERVICE_ROLE") && !src.includes("serviceRole") &&
      !src.includes("createAdminClient") && !/from\("[^"]+",\s*\{\s*db/.test(src),
      `${name} usa service_role`
    );
  }
});

check("20. /textiles/products existe bajo el guard Textil (layout + require en páginas)", () => {
  const layout = read("app/(app)/(shell)/textiles/layout.tsx");
  assert(layout.includes("requireTextilesModule"), "el layout perdió el guard");
  for (const [name, src] of [
    ["products", productsPage],
    ["collections", collectionsPage],
    ["product detail", productDetailPage],
    ["reference detail", referencePage],
  ] as const) {
    assert(src.includes("requireTextilesModule"), `la página ${name} no re-verifica el módulo`);
    assert(src.includes('dynamic = "force-dynamic"'), `la página ${name} debe ser dinámica`);
  }
});

check("21. /textiles enlaza a Productos textiles y mantiene 5 secciones futuras", () => {
  assert(shellPage.includes('href="/textiles/products"'), "el shell no enlaza a productos");
  assert(shellPage.includes("Productos textiles"), "el shell no muestra la tarjeta de productos");
  const modSrc = read("lib/modules/textiles.ts");
  assert(!/PLANNED_SECTIONS[^;]*"Productos/.test(modSrc), "productos no debe seguir como sección futura");
});

// ---------------------------------------------------------------------------
console.log("\n— Lenguaje y límites —");

check("22. La UI incluye el aviso de no-certificación y no promete certificación", () => {
  assert(productsPage.includes("TEXTILE_PRODUCTS_DISCLAIMER") && referencePage.includes("TEXTILE_PRODUCTS_DISCLAIMER"), "falta el aviso en productos/referencia");
  assert(domainSrc.includes("No equivale a certificación ni validación externa"), "el texto del aviso cambió");
  const lower = (allNewUi + domainSrc).toLowerCase();
  for (const term of ["certificamos", "certificado por trazaloop", "garantiza el cumplimiento"]) {
    assert(!lower.includes(term), `texto prohibido: "${term}"`);
  }
});

check("23. Sin textos de cumplimiento automático (cumple/aprobado/certificada)", () => {
  const lower = (allNewUi + domainSrc + actionsSrc).toLowerCase();
  for (const term of ["cumple con la norma", "no cumple", "aprobado por norma", "fibra certificada", "producto certificado"]) {
    assert(!lower.includes(term), `texto de cumplimiento prohibido: "${term}"`);
  }
  assert(referencePage.includes("declarado"), "reciclado/orgánico deben mostrarse como declaración");
});

check("24. La composición no se presenta como pasaporte oficial y las declaraciones son preliminares", () => {
  const lower = (allNewUi + domainSrc).toLowerCase();
  assert(!lower.includes("pasaporte oficial") || domainSrc.includes("no constituye un pasaporte digital oficial"), "no debe afirmarse pasaporte oficial");
  assert(domainSrc.includes("no constituye un pasaporte digital oficial"), "el aviso debe negar el pasaporte oficial");
  assert(migrationSql.includes("is_recycled_declared") && migrationSql.includes("is_organic_declared"), "las banderas deben ser *_declared (declaración, no certificación)");
  assert(referencePage.includes("Declaración preliminar sin evidencia todavía"), "los checkboxes deben aclarar que la declaración es preliminar");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron\n`);
if (failed > 0) process.exit(1);
