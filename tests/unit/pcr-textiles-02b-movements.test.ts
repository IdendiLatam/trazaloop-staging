/**
 * Trazaloop · PT-02B · Movimientos de producto terminado · dominio y cableado.
 *
 * El comportamiento —la guarda, la concurrencia, la corrección, el borrado
 * bloqueado— se demuestra contra la base real en `test:pcr-textiles-02b-rls`.
 * Aquí van las reglas puras y la comprobación de que la pantalla dice la
 * verdad sobre lo que sabe y lo que no.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MOVEMENT_KINDS, MOVEMENT_KIND_OPTIONS, kindAllowsIncoming, reasonIsRequired,
  availableKg, stockStatement, isMovementKind,
} from "@/lib/domain/output-movements";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}

const MIG = read("supabase/migrations/0146_output_batch_movements.sql");

console.log("\nPT-02B · Movimientos de producto terminado\n");

check("A1. Cuatro clases de movimiento, y ni una más", () => {
  assert(MOVEMENT_KINDS.length === 4, `se esperaban 4, hay ${MOVEMENT_KINDS.length}`);
  for (const k of ["dispatch", "internal_use", "loss", "adjustment"]) {
    assert(isMovementKind(k), `falta ${k}`);
  }
  assert(MOVEMENT_KIND_OPTIONS.length === 4, "toda clase debe tener etiqueta");
});

check("A2. NO se modeló un ERP de ventas", () => {
  // Ni pedidos, ni clientes, ni facturas, ni almacenes. La pregunta que esto
  // responde es una sola: cuánto de este lote sigue disponible.
  for (const ajeno of ["sales_order", "invoice", "customer_id", "warehouse", "shipment", "price"]) {
    assert(!new RegExp(`\\b${ajeno}\\b`).test(MIG), `apareció ${ajeno}: eso es otro producto`);
  }
  assert(/quality_external_parties/.test(MIG),
    "debía quedar dicho dónde iría un cliente el día que haga falta");
});

check("A3. Solo un ajuste puede sumar", () => {
  assert(kindAllowsIncoming("adjustment"), "un ajuste por recuento puede sumar");
  for (const k of ["dispatch", "internal_use", "loss"]) {
    assert(!kindAllowsIncoming(k), `un ${k} que entra sería un ${k} al revés`);
  }
  assert(/direction = 'out' or movement_kind = 'adjustment'/.test(MIG),
    "la base debía imponer lo mismo");
});

check("A4. La cantidad es siempre positiva: el signo lo lleva el sentido", () => {
  assert(/quantity > 0/.test(MIG), "una cantidad negativa se teclea mal sin que nada chirríe");
  assert(/direction[\s\S]{0,80}'in', 'out'/.test(MIG), "el sentido va aparte");
});

check("A5. Perder o ajustar exige explicarse; despachar no", () => {
  assert(reasonIsRequired("loss") && reasonIsRequired("adjustment"), "merma y ajuste piden motivo");
  assert(!reasonIsRequired("dispatch"), "un despacho se explica solo");
  assert(/movement_kind not in \('loss', 'adjustment'\)[\s\S]{0,120}reason/.test(MIG),
    "la base debía imponer lo mismo");
});

check("B1. La fórmula del saldo", () => {
  assert(availableKg({ producedKg: 200, reprocessedKg: 20, dispatchedKg: 50,
                       lostKg: 5, internalUseKg: 10, adjustmentKg: 3 }) === 118,
    "200 − 20 − 50 − 5 − 10 + 3 = 118");
  assert(availableKg({ producedKg: 100, reprocessedKg: 0, dispatchedKg: 0,
                       lostKg: 0, internalUseKg: 0, adjustmentKg: 0 }) === 100, "sin salidas, todo");
});

check("B2. «Quedan 100» y «nadie registró salidas» no son lo mismo", () => {
  // Es la distinción entera de PT-F13. El número coincide; el significado no.
  const sinMovimientos = stockStatement(100, 0);
  const conMovimientos = stockStatement(100, 3);
  assert(/Sin salidas registradas/.test(sinMovimientos),
    "sin movimientos es una ausencia de datos, no una medición");
  assert(/Disponible: 100/.test(conMovimientos), "con movimientos sí se puede afirmar");
  assert(sinMovimientos !== conMovimientos, "las dos frases no pueden ser la misma");
  assert(stockStatement(0, 2) === "Agotado", "sin saldo y con movimientos: agotado");
});

check("C1. Corregir INSERTA; el original se conserva", () => {
  assert(/corrects_movement_id/.test(MIG) && /superseded_by_movement_id/.test(MIG),
    "el linaje de corrección debía existir");
  assert(/correction_reason/.test(MIG), "y su motivo");
  assert(/is_current/.test(MIG), "y la marca de vigencia");
  const fn = MIG.slice(MIG.indexOf("function public.correct_output_batch_movement"));
  assert(/insert into public\.output_batch_movements/.test(fn), "corregir debía INSERTAR");
  assert(!/update public\.output_batch_movements\s+set quantity/.test(fn),
    "corregir no puede reescribir la cantidad del original");
});

check("C2. Es el patrón de quality_measurements, no uno nuevo", () => {
  const qm = read("supabase/migrations/0117_quality_objectives_indicators_and_measurements.sql");
  for (const pieza of ["corrects_", "superseded_by_", "correction_reason", "is_current"]) {
    assert(qm.includes(pieza), `la prueba asume que ${pieza} ya existía en 0117`);
    assert(MIG.includes(pieza), `0146 debía reutilizar ${pieza}`);
  }
});

check("C3. Insertar la corrección y retirar el original van juntos", () => {
  // Por separado, si fallara el segundo quedarían dos vigentes y el saldo
  // restaría dos veces.
  const fn = MIG.slice(MIG.indexOf("function public.correct_output_batch_movement"));
  assert(/set is_current = false/.test(fn), "el original debía retirarse");
  assert(/superseded_by_movement_id = v_new\.id/.test(fn), "y apuntar a su corrección");
  // Y el orden importa: retirar ANTES de insertar, o la corrección a la baja
  // chocaría contra su propio original.
  assert(fn.indexOf("set is_current = false") < fn.indexOf("insert into public.output_batch_movements"),
    "el original debe retirarse ANTES de insertar la corrección");
});

check("D1. Nada se borra, y hay dos capas", () => {
  assert(/output_batch_movements_no_delete/.test(MIG), "el disparador debía existir");
  assert(!/for delete to authenticated/.test(MIG), "no debía haber política de DELETE");
  // Las dos capas son a propósito: una política se relaja de un `alter`.
  assert(/dos capas para\s*\n?-- lo mismo a proposito/.test(MIG) || /dos capas/.test(MIG),
    "la razón de tener las dos debía quedar escrita");
});

check("D2. La guarda bloquea la fila, como 0105 y 0143", () => {
  const fn = MIG.slice(MIG.indexOf("function public.output_batch_movement_guard"));
  assert(/for update/i.test(fn), "sin candado, dos despachos simultáneos pasarían los dos");
  assert(/errcode = '23514'/.test(fn), "mismo errcode que el resto de guardas de saldo");
  assert(/no convierte unidades/i.test(fn), "otra unidad se rechaza");
});

check("D3. Un movimiento no vigente no ocupa saldo", () => {
  // Sin esto la corrección se rechazaba a sí misma: el último UPDATE del
  // original volvía a disparar la guarda y contaba su propia corrección.
  const fn = MIG.slice(MIG.indexOf("function public.output_batch_movement_guard"));
  assert(/if not new\.is_current then[\s\S]{0,60}return new;/.test(fn),
    "un movimiento retirado no puede comprometer saldo");
  assert(/se rechazaba a si misma|se rechazaba a sí misma/i.test(fn),
    "la razón debía quedar escrita: se descubrió arreglándolo");
});

check("E1. El saldo se DERIVA: no hay tabla de existencias", () => {
  assert(/create or replace view public\.v_output_batch_stock/.test(MIG), "debía ser una vista");
  assert(!/create table[^;]*\b(stock|existencias|inventory)\b/i.test(MIG),
    "una tabla de stock hay que mantenerla al día, que es peor que el problema");
});

check("E2. La lectura anterior no se destruye, deja de llamarse disponible", () => {
  assert(!/drop view[^;]*v_output_batch_inventory/.test(MIG),
    "v_output_batch_inventory sigue midiendo lo que siempre midió");
  const page = read("app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx");
  assert(page.includes("getOutputBatchStockByIds"), "la pantalla debía leer el saldo real");
  assert(/Sin salidas registradas/.test(page),
    "y decir cuándo el número no es una medición");
});

check("E3. La pantalla no ofrece borrar", () => {
  const comp = read("components/domain/traceability/output-movements.tsx");
  assert(!/Eliminar|Borrar/.test(comp),
    "ofrecer borrar sería mentir sobre lo que la persona puede hacer");
  assert(/Corregir/.test(comp), "corregir sí");
  assert(/conserva el original/.test(comp), "y debía explicarse que conserva el original");
});

check("F1. La migración documenta su reversión y lo que se perdería", () => {
  assert(/REVERSI[ÓO]N/i.test(MIG), "toda migración del sprint documenta su vuelta atrás");
  assert(/nace vacia|nace vacía/.test(MIG),
    "debía decirse que revertir DESPUÉS de registrar movimientos sí pierde datos");
});

console.log(`\n  ${passed} comprobaciones correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
