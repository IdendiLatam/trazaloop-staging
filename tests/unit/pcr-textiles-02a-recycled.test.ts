/**
 * Trazaloop · PT-02A · v2 y saldo de materia prima · dominio y cableado.
 *
 * El comportamiento —los doce casos, la inmutabilidad, los incompletos— se
 * demuestra contra la base real en `test:pcr-textiles-02a-rls`. Aquí van las
 * decisiones congeladas que tienen que seguir escritas donde se pueden leer,
 * y la comprobación de que las pantallas están conectadas.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const MIG = read("supabase/migrations/0144_recycled_content_v2.sql");
const INV = read("supabase/migrations/0145_textile_material_inventory.sql");

console.log("\nPT-02A · Contenido reciclado v2 y saldo de materia prima\n");

// ---------------------------------------------------------------------------
// A · PT-H03 · v1 no se toca
// ---------------------------------------------------------------------------

check("A1. 0144 no reescribe `calculate_recycled_content`", () => {
  assert(!/function public\.calculate_recycled_content\s*\(/.test(MIG),
    "v1 debía quedar intacta: es lo que hace reproducibles los cálculos ya emitidos");
  assert(/function public\.calculate_recycled_content_v2/.test(MIG), "v2 debía crearse aparte");
});

check("A2. La metodología v1 sigue existiendo, solo deja de ser la activa", () => {
  assert(/update public\.calculation_methodologies[\s\S]{0,120}set is_active = false[\s\S]{0,120}version = 1/.test(MIG),
    "v1 debía pasar a inactiva");
  assert(!/delete from public\.calculation_methodologies/.test(MIG),
    "borrar la metodología v1 haría irreproducibles todos sus cálculos");
});

check("A3. Ningún cálculo existente se modifica", () => {
  assert(!/update public\.recycled_content_calculations/i.test(MIG),
    "PT-H01: el pasado no se reescribe");
  assert(!/delete from public\.recycled_content_calculations/i.test(MIG), "ni se borra");
});

// ---------------------------------------------------------------------------
// B · PT-H02 · φ demostrable
// ---------------------------------------------------------------------------

check("B1. La fracción vive en el LOTE, no en el material", () => {
  assert(/alter table public\.input_batches[\s\S]{0,200}recycled_fraction/.test(MIG),
    "la fracción debía añadirse al lote de entrada");
  assert(!/alter table public\.materials[\s\S]{0,200}recycled_fraction/.test(MIG),
    "en el material sería una sola fracción para entregas distintas");
});

check("B2. Una fracción sin procedencia no se admite", () => {
  assert(/recycled_fraction is null[\s\S]{0,140}recycled_fraction_basis/.test(MIG),
    "declarar un número sin decir en qué se apoya no es defendible");
});

check("B3. La etiqueta binaria NO implica 100 %", () => {
  assert(/phi_requires_declared_fraction.*true/.test(MIG),
    "la regla debía quedar congelada en la metodología v2");
  assert(/recycled_fraction is null[\s\S]{0,200}fraction_unknown/.test(MIG),
    "sin fracción declarada el resultado debe ser incompleto");
});

check("B4. Los ceros son de REGLA, nunca de desconocimiento", () => {
  // Cada φ = 0 tiene que poder nombrarse. «No lo sé» no es uno de ellos.
  for (const motivo of ["same_process_not_counted", "demonstrably_non_recycled",
                        "postindustrial_not_reclassified", "not_eligible_classification"]) {
    assert(MIG.includes(motivo), `falta el motivo ${motivo}`);
  }
  // Y «other» NO resuelve a cero.
  assert(/v_efectiva = 'other'[\s\S]{0,300}classification_other/.test(MIG),
    "«other» no demuestra nada y no puede contarse como cero");
});

// ---------------------------------------------------------------------------
// C · PT-F11 · la garantía es del CHECK, no del código
// ---------------------------------------------------------------------------

check("C1. Un incompleto no puede llevar número, y lo impide la base", () => {
  assert(/recycled_calc_state_consistent/.test(MIG), "debía existir el CHECK");
  assert(/result_state = 'incomplete'[\s\S]{0,160}recycled_percent is null/.test(MIG),
    "el CHECK debía prohibir el porcentaje en un incompleto");
  assert(/cardinality\(incomplete_reasons\) > 0/.test(MIG),
    "un incompleto sin motivos no explica nada");
});

check("C2. Y un calculado no puede venir sin número", () => {
  assert(/result_state = 'calculated'[\s\S]{0,200}recycled_percent is not null/.test(MIG),
    "el CHECK debía exigir el porcentaje en un calculado");
  assert(/cardinality\(incomplete_reasons\) = 0/.test(MIG),
    "un calculado con motivos de incompletitud sería contradictorio");
});

check("C3. Las filas anteriores entran como 'calculated', que es lo que son", () => {
  assert(/result_state text not null default 'calculated'/.test(MIG),
    "el defecto debía ser 'calculated' para no reinterpretar el pasado");
});

// ---------------------------------------------------------------------------
// D · PT-H05 · el reparto que no se inventa
// ---------------------------------------------------------------------------

check("D1. La determinación de PT-H05 está escrita, con sus tres hechos", () => {
  assert(/PT-H05/.test(MIG), "la decisión debía citarse");
  assert(/CASO B/.test(MIG), "el veredicto debía quedar dicho");
  // Los tres hechos de esquema en que se apoya.
  assert(/batch_consumption. apunta a \(production_order_id, input_batch_id\)/.test(MIG)
      || /production_order_id, input_batch_id/.test(MIG),
    "debía citarse que el consumo no apunta a un lote de salida");
  assert(/v_traceability_backward/.test(MIG),
    "debía citarse que la trazabilidad ya asume homogeneidad sin exigirla");
});

check("D2. No hay prorrateo por ninguna parte", () => {
  // Se busca el MECANISMO, no la palabra: la migración dice tres veces «no se
  // prorratea», y una búsqueda del término no distingue la afirmación de su
  // negación. Un prorrateo real sería dividir por la suma de lo producido.
  const fn = MIG.slice(MIG.indexOf("function public.calculate_recycled_content_v2"));
  assert(!/produced_quantity_kg\s*\/|\/\s*sum\([^)]*produced/.test(fn),
    "el código reparte por cantidad producida: PT-H05 lo prohíbe");
  assert(!/\balpha\b|v_alpha/.test(fn), "apareció un factor de reparto");
  assert(/multiple_output_batches_without_allocation/.test(MIG),
    "una orden con varias salidas debe declararse incompleta");
  assert(/output_batch_allocation.*none/.test(MIG),
    "la regla debía quedar congelada en la metodología");
});

check("D3. El dato que faltaría queda nombrado", () => {
  assert(/atribuci[óo]n de cada consumo a cada lote de salida/i.test(MIG),
    "un incompleto tiene que decir qué haría falta para dejar de serlo");
});

// ---------------------------------------------------------------------------
// E · PT-F10 · no se vuelve a pedir la composición
// ---------------------------------------------------------------------------

check("E1. El denominador sale de los consumos, no de la composición", () => {
  assert(/'denominator', 'consumption'/.test(MIG), "la regla debía congelarse");
  const fn = MIG.slice(MIG.indexOf("function public.calculate_recycled_content_v2"));
  assert(/from public\.batch_consumption/.test(fn), "v2 debía leer los consumos");
  assert(!/from public\.batch_composition/.test(fn),
    "v2 no puede volver a pedir la composición: eso es exactamente PT-F10");
});

check("E2. El reproceso interno entra al denominador", () => {
  const fn = MIG.slice(MIG.indexOf("function public.calculate_recycled_content_v2"));
  assert(/output_batch_consumption/.test(fn),
    "la masa reconsumida es masa que entró en la orden");
});

// ---------------------------------------------------------------------------
// F · El saldo de materia prima
// ---------------------------------------------------------------------------

check("F1. PCR conserva lo que ya funcionaba y declara su alcance", () => {
  const sec = read("components/domain/traceability/inventory-section.tsx");
  assert(/No contempla mermas, devoluciones a proveedor ni ajustes/.test(sec),
    "el alcance debía decirse en pantalla (PT-F12)");
  assert(/kilogramos/.test(sec), "la unidad debía hacerse visible");
  // Y NO se rehizo: la consulta sigue siendo la de 0105.
  const db = read("lib/db/inventory.ts");
  assert(/v_material_inventory/.test(db), "la vista de 0105 debía conservarse");
  assert(/INVENTORY_PAGE_SIZE/.test(db), "y su paginación");
});

check("F2. Textiles agrupa por (material, UNIDAD)", () => {
  assert(/group by organization_id, item_id, item_type, item_name, unit_code/.test(INV),
    "sumar 300 kg con 40 m daría 340 de nada");
  assert(/no se suman unidades distintas|sumar 300 kg/i.test(INV) || /unidad/i.test(INV),
    "la razón debía quedar escrita");
});

check("F3. El saldo negativo se muestra, no se recorta", () => {
  assert(!/greatest\([^)]*,\s*0\)/.test(INV), "recortar a cero esconde la anomalía");
  assert(/lots_negative/.test(INV), "debía contarse aparte para que se vea");
  const pag = read("app/(app)/(shell)/textiles/traceability/inventory/page.tsx");
  assert(/Saldo negativo/.test(pag), "y decirse en pantalla");
});

check("F4. Lo no comparable se cuenta y se dice", () => {
  assert(/unmatched_consumptions/.test(INV),
    "un saldo que se calla lo que no pudo restar es un saldo que miente");
  const pag = read("app/(app)/(shell)/textiles/traceability/inventory/page.tsx");
  assert(/no son comparables/.test(pag), "la pantalla debía explicarlo");
});

check("F5. Sin tabla mutable de stock", () => {
  assert(!/create table[^;]*(stock|inventory)/i.test(INV),
    "el saldo se deriva; una tabla de existencias hay que mantenerla al día");
  assert(/create or replace view/.test(INV), "debía ser una vista");
});

check("F6. La pantalla existe, pagina, busca en servidor y está en el menú", () => {
  const f = "app/(app)/(shell)/textiles/traceability/inventory/page.tsx";
  assert(existsSync(join(ROOT, f)), "la pantalla debía existir");
  const pag = read(f);
  assert(pag.includes("searchTextileMaterialInventory"), "debía pedir UNA página");
  assert(pag.includes("ListPagination") && pag.includes("ListSearchForm"), "con sus controles");
  const reg = read("lib/modules/registry.ts");
  assert(reg.includes("/textiles/traceability/inventory"),
    "una pantalla que no está en el menú es una pantalla que nadie encuentra");
});

check("F7. La pantalla declara lo que NO es", () => {
  const pag = read("app/(app)/(shell)/textiles/traceability/inventory/page.tsx");
  assert(/No contempla mermas/.test(pag), "el alcance debía decirse");
  assert(/no convierte/i.test(pag), "y que no se suman unidades distintas");
  assert(!/^\s*<h1[^>]*>Inventario/m.test(pag),
    "llamarlo «inventario» a secas sería afirmar más de lo que se sabe");
});

check("G1. Las dos migraciones documentan su reversión", () => {
  for (const [n, m] of [["0144", MIG], ["0145", INV]] as const) {
    assert(/REVERSI[ÓO]N/i.test(m), `${n} debía documentar su vuelta atrás`);
  }
});

console.log(`\n  ${passed} comprobaciones correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
