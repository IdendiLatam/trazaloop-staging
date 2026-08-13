/**
 * Trazaloop · Sprint PCR-02 · Bloques A, B, C y G — la Orden / corrida como
 * eje del proceso. Verificación ESTÁTICA del detalle nuevo, del registro de
 * salidas DESDE la orden (asociación automática + permanencia en contexto),
 * de la cardinalidad 1→N visible y de la decisión del Bloque G (el listado
 * de lotes producidos queda como consulta; la creación vive en la orden).
 * Recorridos con navegador/BD quedan BLOCKED en la matriz.
 *
 * Correr: npm run test:pcr02-order-hub
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
const repoRoot = path.join(__dirname, "../..");

const DETAIL_PATH =
  "app/(app)/(shell)/(cpr)/traceability/production-orders/[id]/page.tsx";
const DETAIL = readSource(`../../${DETAIL_PATH}`);
const LIST = readSource(
  "../../app/(app)/(shell)/(cpr)/traceability/production-orders/page.tsx"
);
const OUTPUTS_PAGE = readSource(
  "../../app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx"
);
const ACTIONS = readSource("../../server/actions/traceability.ts");
const FORMS = readSource("../../components/domain/traceability/forms.tsx");

console.log("PCR-02 · La Orden / corrida como eje (Bloques A/B/C/G)");

check("1. Existe el DETALLE de la orden con sus secciones de eje", () => {
  assert(fs.existsSync(path.join(repoRoot, DETAIL_PATH)), "la ruta [id] debía existir");
  for (const section of [
    "Identificación y proceso",
    "Materiales / lotes consumidos",
    "Lotes producidos / salidas de la orden",
  ]) {
    assert(DETAIL.includes(section), `faltaba la sección: ${section}`);
  }
  assert(
    DETAIL.includes("LinkEvidenceInline") && DETAIL.includes("LinkedEvidenceList"),
    "las evidencias de la orden viven en el detalle"
  );
  assert(DETAIL.includes("notFound()"), "id inexistente o de otra empresa → 404");
});

check("2. Bloque B: la salida se registra DESDE la orden con asociación automática", () => {
  assert(
    DETAIL.includes("Registrar lote producido") && DETAIL.includes("fixedOrder"),
    "el detalle incluye el formulario contextualizado"
  );
  assert(
    FORMS.includes('name="production_order_id" value={fixedOrder.id}') &&
      FORMS.includes('name="return_to" value="order"'),
    "la orden viaja oculta: no se vuelve a preguntar"
  );
  assert(
    FORMS.includes("la asociación es automática"),
    "el formulario declara la asociación automática"
  );
  assert(
    ACTIONS.includes("production-orders/${v.production_order_id}?output_created=${created.id}#salida-"),
    "tras crear, el usuario PERMANECE en la orden viendo la salida creada"
  );
  assert(
    DETAIL.includes("Lote producido registrado correctamente."),
    "confirmación en el contexto de la orden"
  );
});

check("3. Bloque C: una orden puede tener N salidas y el detalle las lista", () => {
  assert(
    DETAIL.includes("listOrderOutputs"),
    "el detalle carga TODAS las salidas de la orden"
  );
  assert(
    DETAIL.includes('{outputs.length} {outputs.length === 1 ? "salida" : "salidas"}'),
    "el contador refleja la cardinalidad 1→N"
  );
  assert(
    LIST.includes("listOutputsForOrders") && LIST.includes("lotes producidos"),
    "el listado muestra cuántos lotes produjo cada orden"
  );
});

check("4. Bloque A: el listado es la puerta al detalle (eje), con compatibilidad", () => {
  assert(
    LIST.includes("Abrir orden") &&
      LIST.includes("`/traceability/production-orders/${o.id}`"),
    "cada orden enlaza a su detalle"
  );
  assert(
    LIST.includes("redirect(`/traceability/production-orders/${params.order}") ,
    "los enlaces históricos ?order= redirigen al detalle (PCR-01.1 conservado)"
  );
});

check("5. Bloque G: decisión documentada — creación desde la orden, listado como consulta", () => {
  assert(
    OUTPUTS_PAGE.includes("Los lotes producidos se registran desde su"),
    "el listado guía hacia la orden en lugar del formulario general"
  );
  assert(
    !OUTPUTS_PAGE.includes('"Nuevo lote producido / lote final"'),
    "el formulario GENERAL de creación se retiró del listado"
  );
  assert(
    OUTPUTS_PAGE.includes("Editar: {editing.batch_code}") &&
      OUTPUTS_PAGE.includes("OutputBatchForm"),
    "la EDICIÓN del lote se conserva en el listado"
  );
  assert(
    OUTPUTS_PAGE.includes("Composición") && OUTPUTS_PAGE.includes("CompositionForm"),
    "la composición se conserva en el listado"
  );
  assert(
    OUTPUTS_PAGE.includes("Consumido después en:") && OUTPUTS_PAGE.includes("Genealogía"),
    "el listado muestra el uso posterior y enlaza la genealogía"
  );
  assert(
    OUTPUTS_PAGE.includes("production-orders/${b.production_order_id}"),
    "cada lote enlaza a su orden productora (el eje)"
  );
});

check("6. Flujo PCR-01 punto 14 CONSERVADO en el nuevo eje", () => {
  assert(
    ACTIONS.includes("/traceability/production-orders/${created.id}?created=1#consumos-"),
    "crear orden aterriza en la sección de consumos del detalle"
  );
  for (const text of [
    "Orden / corrida de producción creada correctamente.",
    "Ahora registre los lotes y cantidades realmente consumidos en esta producción.",
  ]) {
    assert(DETAIL.includes(text), `texto pactado conservado: ${text}`);
  }
});

check("7. Nomenclatura pactada en las superficies nuevas", () => {
  for (const [src, name] of [
    [DETAIL, "detalle"],
    [LIST, "listado"],
  ] as const) {
    assert(/[Oó]rden(es)? \/ corrida/i.test(src), `${name}: denominación de la orden`);
  }
  assert(
    DETAIL.includes("Lotes producidos / salidas de la orden"),
    "denominación de las salidas"
  );
});

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones del eje de la orden pasaron.");
