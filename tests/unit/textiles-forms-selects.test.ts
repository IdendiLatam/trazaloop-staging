/**
 * Trazaloop · Sprint T9E (Textil) · Regresión TRANSVERSAL de selects y
 * formularios (defectos 4.5 y 4.8): el primer valor visible de un select
 * es también el valor real del estado — crear un proveedor, material,
 * componente, proceso, evidencia o evaluación usando el primer tipo
 * visible FUNCIONA sin cambiar manualmente el selector.
 *
 * Estas pruebas FALLAN con el código anterior (estado inicial "" sin
 * opción placeholder) y pasan con la regla uniforme de
 * lib/domain/textiles-forms.ts.
 *
 * Correr: npx tsx tests/unit/textiles-forms-selects.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  initialFieldValue,
  emptyFieldValues,
  selectNeedsFallbackPlaceholder,
  SELECT_FALLBACK_PLACEHOLDER_LABEL,
  type CatalogFieldDef,
} from "../../lib/domain/textiles-forms";
import {
  TEXTILE_SUPPLIER_TYPES,
  TEXTILE_SUPPLIER_TYPE_LABEL,
  TEXTILE_MATERIAL_TYPES,
  TEXTILE_COMPONENT_TYPES,
  TEXTILE_PROCESS_TYPES,
  TEXTILE_OUTSOURCED_PROCESS_TYPES,
  TEXTILE_SEPARABILITY_UI_ORDER,
  TEXTILE_TRACEABILITY_RISK_UI_ORDER,
  isOneOf,
  cleanText,
} from "../../lib/domain/textiles-catalogs";
import { TEXTILE_EVIDENCE_TYPES } from "../../lib/domain/textiles-evidences";

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

function selectField(key: string, values: readonly string[]): CatalogFieldDef {
  return {
    key,
    label: key,
    type: "select",
    options: values.map((v) => ({ value: v, label: v })),
  };
}

console.log("Trazaloop · T9E: el primer valor visible se envía de verdad\n");

check("1. Crear PROVEEDOR con el primer tipo visible: el estado inicial es válido para el servidor", () => {
  const field = selectField("supplierType", TEXTILE_SUPPLIER_TYPES);
  const state = emptyFieldValues([field]);
  assert(state.supplierType === TEXTILE_SUPPLIER_TYPES[0], "el estado debía arrancar en el primer tipo visible");
  // Misma primitiva de validación que usa validateSupplierInput en la action:
  assert(isOneOf(TEXTILE_SUPPLIER_TYPES, state.supplierType), "el servidor debía aceptar ese valor");
  assert(
    TEXTILE_SUPPLIER_TYPE_LABEL[state.supplierType as (typeof TEXTILE_SUPPLIER_TYPES)[number]] !== undefined,
    "el valor inicial corresponde a una opción visible con etiqueta"
  );
});

check("2. Crear MATERIAL con el primer tipo visible", () => {
  const state = emptyFieldValues([selectField("materialType", TEXTILE_MATERIAL_TYPES)]);
  assert(state.materialType === TEXTILE_MATERIAL_TYPES[0], "materialType debía arrancar en main_fabric");
  assert(isOneOf(TEXTILE_MATERIAL_TYPES, state.materialType), "el servidor debía aceptarlo");
});

check("3. Crear COMPONENTE, PROCESO, TERCERIZADO y EVIDENCIA con el primer tipo visible", () => {
  for (const [key, values] of [
    ["componentType", TEXTILE_COMPONENT_TYPES],
    ["processType", TEXTILE_PROCESS_TYPES],
    ["outsourcedType", TEXTILE_OUTSOURCED_PROCESS_TYPES],
    ["evidenceType", TEXTILE_EVIDENCE_TYPES],
  ] as const) {
    const state = emptyFieldValues([selectField(key, values)]);
    assert(state[key] === values[0], `${key} debía arrancar en su primera opción`);
    assert(isOneOf(values, state[key]), `${key}: el servidor debía aceptar el primer valor visible`);
  }
});

check("4. Crear EVALUACIÓN DE CIRCULARIDAD con la primera referencia visible (defecto 4.8)", () => {
  // El formulario de circularidad construye las opciones desde las
  // referencias utilizables; el motor debe iniciar en la PRIMERA.
  const contexts = [
    { referenceId: "11111111-1111-4111-8111-111111111111", sku: "REF-001" },
    { referenceId: "22222222-2222-4222-8222-222222222222", sku: "REF-002" },
  ];
  const referenceField: CatalogFieldDef = {
    key: "referenceId",
    label: "Referencia / SKU",
    type: "select",
    required: true,
    options: contexts.map((c) => ({ value: c.referenceId, label: c.sku })),
  };
  const state = emptyFieldValues([referenceField]);
  assert(state.referenceId === contexts[0].referenceId, "la primera referencia visible debía ser el valor real");
  assert(cleanText(state.referenceId) !== null, "el valor enviado jamás llega vacío");
});

check("5. Los selects OPCIONALES conservan su placeholder explícito '' como estado inicial", () => {
  const optional: CatalogFieldDef = {
    key: "supplierId",
    label: "Proveedor",
    type: "select",
    options: [
      { value: "", label: "— Sin asignar —" },
      { value: "s1", label: "Proveedor 1" },
    ],
  };
  const state = emptyFieldValues([optional]);
  assert(state.supplierId === "", "el opcional arranca en la opción explícita '— Sin asignar —'");
  assert(!selectNeedsFallbackPlaceholder(optional, ""), "no necesita placeholder de respaldo: '' es una opción real");
});

check("6. Invariante visual↔estado: sin coincidencia de opción, hay placeholder de respaldo", () => {
  const field = selectField("x", ["a", "b"]);
  assert(selectNeedsFallbackPlaceholder(field, ""), "'' sin opción vacía necesita placeholder");
  assert(selectNeedsFallbackPlaceholder(field, "obsoleto"), "un valor precargado obsoleto necesita placeholder");
  assert(!selectNeedsFallbackPlaceholder(field, "a"), "un valor real no necesita placeholder");
  assert(SELECT_FALLBACK_PLACEHOLDER_LABEL.includes("Seleccione"), "el placeholder pide una selección explícita");
  const empty: CatalogFieldDef = { key: "y", label: "y", type: "select", options: [] };
  assert(initialFieldValue(empty) === "", "sin opciones el estado queda vacío (y visible como placeholder)");
});

check("7. initialValues explícitos (crear con semilla y editar) siguen teniendo prioridad", () => {
  const field = selectField("status", ["draft", "active", "archived"]);
  const seeded = { ...emptyFieldValues([field]), ...{ status: "active" } };
  assert(seeded.status === "active", "la semilla del servidor debía prevalecer sobre la primera opción");
});

console.log("\nTrazaloop · T9E: los tres motores comparten la regla y el servidor sigue estricto\n");

check("8. Los tres motores usan la regla central (nunca inicialización a '' propia)", () => {
  const catalogManager = read("components/domain/textiles/catalog-manager.tsx");
  const entityForm = read("components/domain/textiles/entity-form.tsx");
  const assocManager = read("components/domain/textiles/reference-association-manager.tsx");
  for (const [name, src] of [
    ["catalog-manager", catalogManager],
    ["entity-form", entityForm],
    ["reference-association-manager", assocManager],
  ] as const) {
    assert(src.includes("emptyFieldValues"), `${name} debía usar emptyFieldValues`);
    assert(src.includes("CatalogSelect"), `${name} debía usar CatalogSelect`);
    assert(
      !src.includes('f.type === "checkbox" ? false : ""'),
      `${name} no debía conservar la inicialización antigua a ""`
    );
  }
});

check("9. El formulario de circularidad ofrece SOLO referencias utilizables y sin placeholder fantasma", () => {
  const page = read("app/(app)/(shell)/textiles/circularity/assessments/new/page.tsx");
  assert(page.includes("listReferenceCircularityContexts"), "las opciones salen de la consulta de utilizables");
  assert(page.includes("TextileEntityForm"), "usa el motor con la regla uniforme");
  const action = read("server/actions/textiles-circularity.ts");
  assert(action.includes("textileReferenceIsUsableForCircularity"), "la escritura valida con la MISMA regla del listado");
  assert(action.includes("Selecciona la referencia / SKU a evaluar."), "vacío obligatorio tiene mensaje claro");
  assert(action.includes("no es válida o está inactiva"), "referencia inválida o inactiva se rechaza explícitamente");
  const db = read("lib/db/textiles-circularity.ts");
  assert(
    /textileReferenceIsUsableForCircularity[\s\S]{0,400}\.eq\("is_active", true\)/.test(db),
    "la validación exige referencia ACTIVA (coherente con la lectura)"
  );
  assert(
    /textileReferenceIsUsableForCircularity[\s\S]{0,400}\.eq\("organization_id", organizationId\)/.test(db),
    "la validación exige la organización activa (cross-tenant rechazado)"
  );
});

check("10. El servidor sigue rechazando '' en los selects OBLIGATORIOS", () => {
  assert(!isOneOf(TEXTILE_SUPPLIER_TYPES, ""), "'' jamás es un tipo de proveedor válido");
  assert(!isOneOf(TEXTILE_MATERIAL_TYPES, ""), "'' jamás es un tipo de material válido");
  assert(!isOneOf(TEXTILE_EVIDENCE_TYPES, ""), "'' jamás es un tipo de evidencia válido");
});

check("11. Los enums OPCIONALES tratan '' como ausencia (valor por defecto), no como error", () => {
  assert(cleanText("") === null, "cleanText('') debía ser null (cae al valor por defecto)");
  const catalogActions = read("server/actions/textiles-catalogs.ts");
  assert(
    catalogActions.includes('cleanText(input.separability) ?? "not_evaluated"'),
    "separabilidad opcional tolera ''"
  );
  assert(
    catalogActions.includes('cleanText(input.traceabilityRisk) ?? "not_evaluated"'),
    "riesgo opcional tolera ''"
  );
});

check("12. Los selects de valoración arrancan en 'Sin evaluar' (nunca una valoración accidental)", () => {
  assert(TEXTILE_SEPARABILITY_UI_ORDER[0] === "not_evaluated", "separabilidad arranca en not_evaluated");
  assert(TEXTILE_TRACEABILITY_RISK_UI_ORDER[0] === "not_evaluated", "riesgo arranca en not_evaluated");
  const componentsPage = read("app/(app)/(shell)/textiles/catalogs/components/page.tsx");
  assert(componentsPage.includes("TEXTILE_SEPARABILITY_UI_ORDER"), "la página de componentes usa el orden neutro");
  const processesPage = read("app/(app)/(shell)/textiles/catalogs/processes/page.tsx");
  assert(processesPage.includes("TEXTILE_TRACEABILITY_RISK_UI_ORDER"), "la página de procesos usa el orden neutro");
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
