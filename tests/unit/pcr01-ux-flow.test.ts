/**
 * Trazaloop · Sprint PCR-01 · Puntos 1, 2, 7, 9, 11 y 14 — verificación
 * ESTÁTICA del flujo UX: confirmaciones de creación/edición, guía tras crear
 * la orden, visualización de evidencias con URL firmada, trazabilidad
 * bidireccional y búsqueda+paginación en los listados. El recorrido con
 * navegador queda BLOCKED en la matriz hasta el entorno QA.
 *
 * Correr: npm run test:pcr01-ux-flow
 */
import fs from "node:fs";
import path from "node:path";
import {
  normalizePageQuery,
  pageRange,
  totalPages,
  clampPage,
  sanitizeSearchTerm,
  pageSummaryLabel,
  DEFAULT_PAGE_SIZE,
} from "../../lib/domain/pagination";

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

const TRACE_ACTIONS = readSource("../../server/actions/traceability.ts");
const CATALOG_ACTIONS = readSource("../../server/actions/catalog.ts");
const EVIDENCE_ACTIONS = readSource("../../server/actions/evidences.ts");
const EVIDENCES_DB = readSource("../../lib/db/evidences.ts");
// PCR-02 (Bloque A): el eje del flujo de la orden es su DETALLE.
const ORDER_DETAIL_PAGE = readSource(
  "../../app/(app)/(shell)/(cpr)/traceability/production-orders/[id]/page.tsx"
);
const EVIDENCES_PAGE = readSource("../../app/(app)/(shell)/(cpr)/evidences/page.tsx");

console.log("PCR-01 · Flujo UX (puntos 1, 2, 7, 9, 11 y 14)");

check("1. Dominio de paginación: normalización, rangos y resumen", () => {
  assert(DEFAULT_PAGE_SIZE === 20, "el tamaño de página por defecto debía ser 20");
  const q = normalizePageQuery({ q: "  PET  ", page: "3" });
  assert(q.q === "PET" && q.page === 3 && q.pageSize === 20, "normalización incorrecta");
  assert(normalizePageQuery({ page: "-2" }).page === 1, "páginas inválidas → 1");
  assert(normalizePageQuery({ page: "abc" }).page === 1, "páginas no numéricas → 1");
  const { from, to } = pageRange(3, 20);
  assert(from === 40 && to === 59, "rango de la página 3 incorrecto");
  assert(totalPages(0, 20) === 1 && totalPages(41, 20) === 3, "totalPages incorrecto");
  assert(clampPage(9, 41, 20) === 3, "clampPage debía acotar a la última página");
  assert(pageSummaryLabel(2, 20, 41) === "Mostrando 21–40 de 41", "resumen incorrecto");
});

check("2. El término de búsqueda se sanea para los filtros or/ilike", () => {
  assert(sanitizeSearchTerm("PET, (lote) 100%") === "PET lote 100\\%", "saneamiento incorrecto");
  assert(sanitizeSearchTerm("a_b") === "a\\_b", "los comodines del usuario se escapan");
});

check("3. Punto 14: crear orden → confirmación + sección de consumos (PCR-02: en el detalle)", () => {
  // PCR-02: el redirect apunta al DETALLE de la orden creada, aterrizando en
  // la misma sección de consumos y con los mismos textos pactados.
  assert(
    TRACE_ACTIONS.includes("created=1#consumos-"),
    "createProductionOrderAction debía redirigir a la sección de consumos de la orden creada"
  );
  assert(
    TRACE_ACTIONS.includes("/traceability/production-orders/${created.id}?created=1"),
    "el destino debía ser el detalle de la orden (PCR-02, Bloque A)"
  );
  assert(
    ORDER_DETAIL_PAGE.includes("Orden / corrida de producción creada correctamente."),
    "el detalle debía confirmar con el texto pactado"
  );
  assert(
    ORDER_DETAIL_PAGE.includes(
      "Ahora registre los lotes y cantidades realmente consumidos en esta producción."
    ),
    "el detalle debía guiar el siguiente paso con el texto pactado"
  );
  assert(
    ORDER_DETAIL_PAGE.includes("Materiales / lotes consumidos"),
    "la sección debía llamarse Materiales / lotes consumidos"
  );
  assert(
    TRACE_ACTIONS.includes('success: "Consumo registrado correctamente."'),
    "registrar un consumo debía confirmar inmediatamente"
  );
});

check("4. Punto 2: toda creación confirma y conserva el contexto", () => {
  assert(TRACE_ACTIONS.includes("?created=${created.id}#lote-${created.id}"), "lote de entrada");
  assert(TRACE_ACTIONS.includes("?batch=${created.id}&created=1#lote-${created.id}"), "lote producido");
  for (const entity of ["suppliers", "families", "products", "materials"]) {
    assert(
      CATALOG_ACTIONS.includes(`/catalog/${entity}?created=`),
      `la creación en catálogo (${entity}) debía confirmar con redirect`
    );
  }
});

check("5. Punto 7: toda edición confirma con 'Cambios guardados correctamente.'", () => {
  assert(TRACE_ACTIONS.includes("?updated=${id}#lote-${id}"), "ediciones de lotes");
  // PCR-02: la edición de la orden confirma EN su detalle.
  assert(
    TRACE_ACTIONS.includes("/traceability/production-orders/${id}?updated=1#registro-${id}"),
    "edición de orden (confirma en el detalle)"
  );
  assert(
    ORDER_DETAIL_PAGE.includes("Cambios guardados correctamente."),
    "el detalle debía mostrar la confirmación de edición"
  );
  for (const entity of ["suppliers", "families", "products", "materials"]) {
    assert(
      CATALOG_ACTIONS.includes(`/catalog/${entity}?updated=`),
      `la edición en catálogo (${entity}) debía confirmar con redirect`
    );
  }
  const pages = [
    "../../app/(app)/(shell)/(cpr)/catalog/suppliers/page.tsx",
    "../../app/(app)/(shell)/(cpr)/catalog/families/page.tsx",
    "../../app/(app)/(shell)/(cpr)/catalog/products/page.tsx",
    "../../app/(app)/(shell)/(cpr)/catalog/materials/page.tsx",
    "../../app/(app)/(shell)/(cpr)/traceability/input-batches/page.tsx",
  ];
  for (const rel of pages) {
    const src = readSource(rel);
    assert(src.includes("Cambios guardados correctamente."), `${rel} debía mostrar la confirmación de edición`);
    assert(src.includes("SuccessAlert"), `${rel} debía usar el patrón SuccessAlert`);
  }
});

check("6. Punto 1: 👁 Ver evidencia con URL firmada bajo demanda y multiempresa", () => {
  assert(
    EVIDENCE_ACTIONS.includes("export async function getEvidenceViewUrlAction"),
    "debía existir la server action de apertura"
  );
  assert(
    EVIDENCES_DB.includes('createSignedUrl(evidence.storage_path as string, EVIDENCE_SIGNED_URL_TTL_SECONDS)'),
    "la URL debía firmarse con TTL corto"
  );
  assert(
    EVIDENCES_DB.includes('.eq("organization_id", orgId)') &&
      EVIDENCES_DB.includes("La evidencia no existe o no pertenece a tu empresa."),
    "la firma debía verificar pertenencia a la empresa activa (además de RLS)"
  );
  const viewLink = readSource("../../components/domain/evidences/view-link.tsx");
  assert(viewLink.includes("👁"), "la acción visible debía incluir el ícono 👁");
  assert(EVIDENCES_PAGE.includes("ViewEvidenceButton"), "la página de evidencias debía ofrecer Ver");
});

check("7. Punto 11: Registro→Evidencia y Evidencia→Registro", () => {
  assert(
    EVIDENCES_DB.includes("listEvidencesForTargets") && EVIDENCES_DB.includes("listEvidenceUsage"),
    "la capa de datos debía cubrir ambas direcciones"
  );
  assert(
    EVIDENCES_DB.includes("origin_support_evidence_id") &&
      EVIDENCES_DB.includes("reclassification_evidence_id"),
    "los usos por FK directa de materiales debían contarse como 'Utilizada en'"
  );
  assert(EVIDENCES_PAGE.includes("Utilizada en ("), "la página debía mostrar 'Utilizada en (n)'");
  const targetPages = [
    "../../app/(app)/(shell)/(cpr)/traceability/input-batches/page.tsx",
    // PCR-02: las evidencias de la orden viven en su DETALLE (el eje).
    "../../app/(app)/(shell)/(cpr)/traceability/production-orders/[id]/page.tsx",
    "../../app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx",
    "../../app/(app)/(shell)/(cpr)/catalog/suppliers/page.tsx",
    "../../app/(app)/(shell)/(cpr)/catalog/families/page.tsx",
    "../../app/(app)/(shell)/(cpr)/catalog/products/page.tsx",
    "../../app/(app)/(shell)/(cpr)/catalog/materials/page.tsx",
  ];
  for (const rel of targetPages) {
    assert(readSource(rel).includes("LinkedEvidenceList"), `${rel} debía listar sus evidencias vinculadas`);
  }
});

check("8. Punto 9: búsqueda + paginación en TODOS los listados objetivo", () => {
  const pages: Array<[string, string]> = [
    ["../../app/(app)/(shell)/(cpr)/evidences/page.tsx", "searchEvidences"],
    ["../../app/(app)/(shell)/(cpr)/catalog/suppliers/page.tsx", "searchSuppliers"],
    ["../../app/(app)/(shell)/(cpr)/catalog/families/page.tsx", "searchFamilies"],
    ["../../app/(app)/(shell)/(cpr)/catalog/products/page.tsx", "searchProducts"],
    ["../../app/(app)/(shell)/(cpr)/catalog/materials/page.tsx", "searchMaterials"],
    ["../../app/(app)/(shell)/(cpr)/traceability/input-batches/page.tsx", "searchInputBatches"],
    ["../../app/(app)/(shell)/(cpr)/traceability/production-orders/page.tsx", "searchProductionOrders"],
    ["../../app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx", "searchOutputBatches"],
  ];
  for (const [rel, fn] of pages) {
    const src = readSource(rel);
    assert(src.includes(fn), `${rel} debía usar ${fn} (consulta paginada en servidor)`);
    assert(src.includes("ListSearchForm"), `${rel} debía ofrecer búsqueda`);
    assert(src.includes("ListPagination"), `${rel} debía paginar`);
  }
  const db = readSource("../../lib/db/traceability.ts");
  assert(db.includes(".range(from, to)"), "las consultas debían usar range() — jamás listas ilimitadas");
});

check("9. Con paginación, editar/expandir no depende de la página actual", () => {
  for (const rel of [
    "../../app/(app)/(shell)/(cpr)/traceability/input-batches/page.tsx",
    "../../app/(app)/(shell)/(cpr)/traceability/production-orders/page.tsx",
    "../../app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx",
  ]) {
    const src = readSource(rel);
    assert(
      /get(InputBatch|ProductionOrder|OutputBatch)\(org\.organizationId, params\.(edit|order|batch)\)/.test(src),
      `${rel} debía resolver el registro por id cuando no está en la página`
    );
  }
});

check("10. PCR-01.1 (blocker 3): el registro created/updated/focus se fija aunque quede fuera de la página", () => {
  // Sin cargar el listado completo: el registro se resuelve por id (getter)
  // y se antepone a la página SOLO si no está ya en ella (sin duplicar).
  const pages = [
    "../../app/(app)/(shell)/(cpr)/catalog/suppliers/page.tsx",
    "../../app/(app)/(shell)/(cpr)/catalog/families/page.tsx",
    "../../app/(app)/(shell)/(cpr)/catalog/products/page.tsx",
    "../../app/(app)/(shell)/(cpr)/catalog/materials/page.tsx",
    "../../app/(app)/(shell)/(cpr)/traceability/input-batches/page.tsx",
  ];
  for (const rel of pages) {
    const src = readSource(rel);
    assert(
      src.includes("params.created ?? params.updated ?? params.focus"),
      `${rel} debía aceptar created/updated/focus como registro enfocado`
    );
    assert(
      /focused(Record|Batch) && ![a-zA-Z]+\.some\(/.test(src),
      `${rel} debía fijar el registro sin duplicarlo cuando ya está en la página`
    );
  }
  // PCR-02: created/updated de órdenes aterrizan en el DETALLE (que muestra
  // SIEMPRE el registro); el listado conserva el fijado por focus.
  const orders = readSource("../../app/(app)/(shell)/(cpr)/traceability/production-orders/page.tsx");
  assert(
    orders.includes("params.focus") && orders.includes("focusedOrder"),
    "órdenes debía conservar el fijado por focus en el listado"
  );
  const outputs = readSource("../../app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx");
  assert(
    outputs.includes("params.updated ?? params.focus") && outputs.includes("pinnedBatch"),
    "lotes producidos debía fijar el lote updated/focus además del expandido"
  );
});

check("11. PCR-01.1 (blocker 4): «Ir al registro» navega al registro concreto, nunca al listado genérico", () => {
  const db = readSource("../../lib/db/evidences.ts");
  const hrefBlock = db.slice(db.indexOf("function targetHref"), db.indexOf("* Dónde se utiliza una evidencia"));
  for (const [type, expected] of [
    ["supplier", "/catalog/suppliers?focus=${targetId}#registro-${targetId}"],
    ["material", "/catalog/materials?focus=${targetId}#registro-${targetId}"],
    ["product", "/catalog/products?focus=${targetId}#registro-${targetId}"],
    ["product_family", "/catalog/families?focus=${targetId}#registro-${targetId}"],
    ["input_batch", "/traceability/input-batches?focus=${targetId}#lote-${targetId}"],
    // PCR-02: la orden tiene detalle propio — el registro concreto garantizado.
    ["production_order", "/traceability/production-orders/${targetId}#registro-${targetId}"],
    ["output_batch", "/traceability/output-batches?batch=${targetId}#lote-${targetId}"],
  ] as const) {
    assert(hrefBlock.includes(expected), `el destino de ${type} debía ser el registro concreto: ${expected}`);
  }
  // Candado contra la regresión: ningún case devuelve un listado sin id.
  assert(
    !/return "\/(catalog|traceability)\/[a-z-]+";/.test(hrefBlock),
    "ningún tipo con id debía volver a enlazar al listado genérico"
  );
});

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones del flujo UX pasaron.");
