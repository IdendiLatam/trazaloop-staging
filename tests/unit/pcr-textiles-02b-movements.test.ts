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
  directionFor, physicalMaxKg, resolveCount, describeDelta,
  MOVEMENT_KIND_LABEL,
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
  assert(/Sin movimientos registrados/.test(sinMovimientos),
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
  assert(/Sin movimientos registrados/.test(page),
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


// ---------------------------------------------------------------------------
// PT-02B.1 · SEMÁNTICA INEQUÍVOCA
//
// Las letras son las del encargo. Lo que se demuestra contra la base real
// —guardas, concurrencia, agregados, aislamiento— vive en
// `test:pcr-textiles-02b-rls`; aquí van las reglas puras y el cableado.
// ---------------------------------------------------------------------------

const MIG148 = read("supabase/migrations/0148_inventory_movement_hardening.sql");
const SQL148 = MIG148.replace(/--.*$/gm, "").replace(/comment on [\s\S]*?';/gi, "");
const COMPONENTE = read("components/domain/traceability/output-movements.tsx");
const ACCION = read("server/actions/output-movements.ts");

check("A-C. La fórmula del saldo, en el dominio", () => {
  const base = { producedKg: 100, reprocessedKg: 0, dispatchedKg: 0, lostKg: 0,
                 internalUseKg: 0, adjustmentKg: 0 };
  // A · 100 producido, despacho 40 → 60
  assert(availableKg({ ...base, dispatchedKg: 40 }) === 60, "A: 100 − 40 = 60");
  // B · + uso interno 10 → 50
  assert(availableKg({ ...base, dispatchedKg: 40, internalUseKg: 10 }) === 50, "B: 100 − 40 − 10 = 50");
  // C · merma 5 → 95
  assert(availableKg({ ...base, lostKg: 5 }) === 95, "C: 100 − 5 = 95");
});

check("D. Un conteo de 97 sobre 100 da un ajuste de −3 y deja 97", () => {
  const r = resolveCount({ counted: 97, theoretical: 100, physicalMax: 100 });
  assert(r.ok, `debía resolverse: ${!r.ok ? r.error : ""}`);
  assert(r.ok && r.delta === -3 && r.direction === "out" && r.quantity === 3,
    "la diferencia y su sentido se derivan del conteo, no se preguntan");
  assert(availableKg({ producedKg: 100, reprocessedKg: 0, dispatchedKg: 0, lostKg: 0,
                       internalUseKg: 0, adjustmentKg: -3 }) === 97, "y el saldo queda en 97");
  assert(/Faltan 3 kg/.test(describeDelta(-3)), "y se dice en palabras antes de confirmar");
  assert(/Sobran 2 kg/.test(describeDelta(2)), "en los dos sentidos");
});

check("E. Un conteo por encima del máximo físico no se acepta", () => {
  // 100 producidos, 40 despachados: como mucho puede haber 60.
  const max = physicalMaxKg({ producedKg: 100, reprocessedKg: 0, dispatchedKg: 40,
                              lostKg: 0, internalUseKg: 0 });
  assert(max === 60, `el techo debía ser 60, dio ${max}`);
  const r = resolveCount({ counted: 70, theoretical: 60, physicalMax: max });
  assert(!r.ok, "70 kg no pueden aparecer en un lote del que quedan 60");
  assert(!r.ok && /físicamente posible/.test(r.error) && /Corrige primero/.test(r.error),
    "el mensaje debe decir qué hacer en su lugar");
  // Y el ajuste que DESHACE otro anterior sí se acepta.
  const bueno = resolveCount({ counted: 60, theoretical: 57, physicalMax: 60 });
  assert(bueno.ok && bueno.direction === "in" && bueno.quantity === 3,
    "un recuento puede subir hasta el techo, que es como se deshace un ajuste anterior");
  // Un conteo que coincide no genera movimiento: no hay nada que ajustar.
  const igual = resolveCount({ counted: 60, theoretical: 60, physicalMax: 60 });
  assert(!igual.ok && /no hay nada que ajustar/.test(igual.error), "un ajuste de cero no dice nada");
});

check("E2. El techo y la fórmula del dominio son los de la base", () => {
  const fn = SQL148.slice(SQL148.indexOf("function public.output_batch_physical_max_kg"));
  const cuerpo = fn.slice(0, fn.indexOf("$$;"));
  assert(/produced_quantity_kg/.test(cuerpo), "el techo parte de lo producido");
  assert(/output_batch_consumption/.test(cuerpo), "descuenta el reproceso");
  assert(/movement_kind <> 'adjustment'/.test(cuerpo),
    "y descuenta las salidas SIN contar los ajustes: si los contara, el techo se movería con ellos");
  // La base compara contra ese techo, no contra otra cosa.
  assert(/v_disp \+ new\.quantity > v_max/.test(SQL148),
    "el guardián debía comparar el saldo resultante contra el techo físico");
});

check("F-G. El reproceso y las salidas miran el MISMO saldo", () => {
  // Era la doble salida: dos caminos, cada uno con su fórmula.
  assert(/create or replace function public\.output_batch_available_kg/.test(SQL148),
    "debía existir una sola función de saldo");
  const guardaMov = SQL148.slice(SQL148.indexOf("function public.output_batch_movement_guard"));
  const guardaRep = SQL148.slice(SQL148.indexOf("function public.output_batch_consumption_total_balance_guard"));
  for (const [nombre, cuerpo] of [["movimientos", guardaMov.slice(0, guardaMov.indexOf("$$;"))],
                                  ["reproceso", guardaRep.slice(0, guardaRep.indexOf("$$;"))]] as const) {
    assert(/public\.output_batch_available_kg\(/.test(cuerpo),
      `el guardián de ${nombre} no usa el saldo consolidado`);
    assert(/for update/.test(cuerpo), `el guardián de ${nombre} no toma el candado`);
  }
  // Y el selector de lotes reprocesables deja de mirar la vista de 0105.
  const db = read("lib/db/traceability.ts");
  const selector = db.slice(db.indexOf("export async function listConsumableOutputs"));
  // Solo el CÓDIGO: el comentario nombra la vista antigua a propósito, para
  // explicar de qué se viene.
  const cuerpoSel = selector.slice(0, selector.indexOf("\n}"))
    .replace(/^\s*\/\/.*$/gm, "");
  assert(/from\("v_output_batch_stock"\)/.test(cuerpoSel),
    "el selector ofrecía lotes con el saldo de 0105, que ignora los movimientos");
  assert(!/from\("v_output_batch_inventory"\)/.test(cuerpoSel),
    "y ya no debe leer la vista antigua");
});

check("H. La concurrencia cruzada se serializa por el lote, no por la tabla", () => {
  // El candado es sobre la FILA del lote producido, y lo toman los dos
  // guardianes. Por eso un despacho y un reproceso simultáneos hacen cola:
  // si cada uno bloqueara su propia tabla, no se verían.
  for (const fn of ["output_batch_movement_guard", "output_batch_consumption_total_balance_guard"]) {
    const cuerpo = SQL148.slice(SQL148.indexOf(`function public.${fn}`));
    assert(/from public\.output_batches[\s\S]{0,220}for update/.test(cuerpo.slice(0, cuerpo.indexOf("$$;"))),
      `${fn} no bloquea la fila del lote`);
  }
});

check("I-J. Corregir y anular, sin borrar y sin sistema paralelo", () => {
  assert(/quantity > 0 or \(quantity = 0 and corrects_movement_id is not null\)/.test(SQL148),
    "el cero solo puede existir en una fila correctiva");
  assert(/drop constraint if exists output_batch_movements_quantity_positive/.test(SQL148),
    "había que retirar el CHECK anterior, no añadir otro encima");
  // La anulación NO es un mecanismo nuevo: es la misma RPC con cantidad cero.
  assert(/rpc\("correct_output_batch_movement"/.test(ACCION), "una sola RPC");
  assert((ACCION.match(/rpc\("correct_output_batch_movement"/g) ?? []).length === 1,
    "corregir y anular deben compartir el mismo camino");
  assert(/annulOutputMovementAction/.test(ACCION), "y la anulación debe tener su propia entrada");
  assert(/p_quantity is null or p_quantity < 0/.test(SQL148),
    "la RPC debía rechazar cantidades negativas ahora que el cero pasa");
  // Y sigue sin haber borrado.
  assert(!/delete\(\)/.test(ACCION), "no puede haber borrado en las acciones");
  assert(!/Eliminar/.test(COMPONENTE), "ni un botón de eliminar en la pantalla");
  assert(/Anular/.test(COMPONENTE) && /Corregir/.test(COMPONENTE),
    "sí «Corregir» y «Anular»");
});

check("K. El historial se conserva y se ve", () => {
  assert(/corregido\(s\) o anulado\(s\) — se conservan/.test(COMPONENTE),
    "los movimientos retirados se siguen enseñando");
  assert(/El movimiento original se conservará en el historial/.test(
    read("lib/domain/output-movements.ts")),
    "y al anular hay que decirlo ANTES de confirmar");
  assert(/v_old\.id/.test(SQL148) === false || /corrects_movement_id/.test(SQL148),
    "el linaje se conserva");
});

check("L. Un despacho que entra sigue siendo imposible, y lo dice", () => {
  assert(directionFor("dispatch") === "out", "un despacho resta");
  assert(directionFor("internal_use") === "out", "el uso interno resta");
  assert(directionFor("loss") === "out", "la merma resta");
  assert(directionFor("adjustment", 3) === "in" && directionFor("adjustment", -3) === "out",
    "solo el ajuste depende del recuento");
  assert(kindAllowsIncoming("adjustment") && !kindAllowsIncoming("dispatch"),
    "y solo el ajuste puede sumar");
  assert(/Solo un ajuste por recuento puede sumar/.test(SQL148),
    "el guardián debe dar un mensaje que se entienda sin conocer el esquema");
  // El CHECK de 0146 sigue detrás; 0148 no lo toca.
  assert(!/drop constraint if exists output_batch_movements_direction_kind/.test(SQL148),
    "el CHECK que lo prohíbe no debía retirarse");
});

check("M. El campo «Sentido» desaparece de la pantalla", () => {
  assert(!/name="direction"/.test(COMPONENTE), "el selector de sentido debía retirarse");
  assert(!/Resta del saldo/.test(COMPONENTE) && !/Suma al saldo/.test(COMPONENTE),
    "ni sus opciones");
  assert(!/formData\.get\("direction"\)/.test(ACCION),
    "el servidor tampoco debe aceptarlo del formulario: se deriva");
  assert(/directionFor\(/.test(ACCION), "el sentido se deriva del tipo y del recuento");
});

check("M2. El recuento pide lo contado, no la diferencia", () => {
  assert(/Cantidad contada físicamente/.test(COMPONENTE), "se pide lo que se encontró");
  assert(/name="counted_quantity"/.test(COMPONENTE), "y ese es el campo que viaja");
  assert(/Saldo teórico:/.test(COMPONENTE) && /Ajuste derivado:/.test(COMPONENTE),
    "las tres cifras se enseñan ANTES de confirmar");
  assert(/resolveCount\(/.test(COMPONENTE) && /resolveCount\(/.test(ACCION),
    "la pantalla y el servidor usan la MISMA función: dos números distintos no se creerían");
  // Y las dos cifras se guardan.
  assert(/counted_quantity: counted, theoretical_quantity_at_count: theoretical/.test(ACCION),
    "el hecho medido y el teórico congelado se persisten");
  assert(/counted_quantity numeric/.test(SQL148) && /theoretical_quantity_at_count numeric/.test(SQL148),
    "las columnas debían existir");
  assert(/counted_quantity - theoretical_quantity_at_count/.test(SQL148),
    "y un CHECK que obligue a que la diferencia cuadre con el trío");
});

check("M3. El saldo negativo es una anomalía visible, no «Agotado»", () => {
  assert(/Saldo inconsistente/.test(stockStatement(-5, 3)), "un negativo no es un agotado");
  assert(/Agotado/.test(stockStatement(0, 3)), "un cero con movimientos sí");
  assert(/Sin movimientos registrados/.test(stockStatement(100, 0)),
    "y sin movimientos no es una medición");
  assert(/is_inconsistent/.test(SQL148), "la vista debía marcar la anomalía");
  assert(!/greatest\([^)]*available[^)]*0\)/.test(SQL148), "y NO recortarla a cero");
  assert(/STOCK_INCONSISTENT_NOTE/.test(COMPONENTE) && /stock\.isInconsistent/.test(COMPONENTE),
    "la pantalla debe enseñar la anomalía, no solo calcularla");
});

check("N-O. El inventario por producto es derivado, agrupa por unidad y no crea tablas", () => {
  assert(/create or replace view public\.v_product_stock/.test(SQL148), "debía ser una vista");
  assert(!/create table/i.test(SQL148), "una tabla de existencias hay que mantenerla al día");
  assert(/'kg'::text\s+as unit_code/.test(SQL148), "la unidad viaja en el agregado");
  assert(/group by s\.organization_id, s\.product_id/.test(SQL148), "agrupado por empresa y producto");
  assert(/from public\.v_output_batch_stock/.test(SQL148),
    "sobre la vista de lotes: si sumara por su cuenta serían dos aritméticas");
  const sec = read("components/domain/traceability/product-stock-section.tsx");
  assert(/searchProductStock/.test(sec) && /listStockByProduct/.test(sec),
    "búsqueda y detalle paginados en servidor");
  assert(/Sin producto asociado/.test(sec),
    "los lotes sin producto se enseñan: si se cayeran, el total mentiría por defecto");
});

check("P. El saldo de materia prima no se rehace: se reutiliza", () => {
  const pag = read("app/(app)/(shell)/(cpr)/traceability/inventory/page.tsx");
  assert(/MaterialInventorySection/.test(pag), "se monta la sección que ya existía");
  const sec = read("components/domain/traceability/inventory-section.tsx");
  assert(/v_material_inventory/.test(read("lib/db/inventory.ts")), "sobre la vista de 0105");
  assert(/Saldo trazado =/.test(sec), "y sigue declarando de qué está hecho");
  assert(/No contempla mermas/.test(sec),
    "y lo que NO contempla, que es la mitad honesta de la frase");
  // Y hay UNA entrada de navegación, no dos pantallas.
  const reg = read("lib/modules/registry.ts");
  assert(/"Inventario", href: "\/traceability\/inventory"/.test(reg),
    "una pantalla que no está en el menú es una pantalla que nadie encuentra");
});

check("Q-S. 0148 no toca planes, ni módulos, ni Demo", () => {
  for (const t of ["organization_subscriptions", "module_plans", "plan_limits",
                   "organization_modules", "module_catalog"]) {
    assert(!new RegExp(`(alter|update|delete|insert)[^;]*\\b${t}\\b`, "i").test(SQL148),
      `0148 toca ${t}, y no debía`);
  }
  assert(!/\bdemo\b/i.test(SQL148), "0148 menciona el plan demo en código ejecutable");
  // El aislamiento de las dos vistas nuevas o recreadas.
  for (const m of SQL148.matchAll(/create\s+(or\s+replace\s+)?view\s+public\.(\w+)([\s\S]{0,260}?)\bas\b/gi)) {
    assert(/security_invoker\s*=\s*true/.test(m[3]),
      `la vista ${m[2]} no declara security_invoker`);
  }
});

check("T. Los movimientos no tocan el contenido reciclado", () => {
  // La independencia también se comprueba contra la base (caso T de
  // test:pcr-textiles-02a-rls). Aquí, que el motor no los lea siquiera.
  const motor = read("supabase/migrations/0144_recycled_content_v2.sql");
  const fn = motor.slice(motor.indexOf("function public.calculate_recycled_content_v2"));
  assert(!/output_batch_movements|v_output_batch_stock/.test(fn),
    "el cálculo no puede depender de lo que quede en el almacén");
  assert(!/recycled|contenido reciclado/i.test(SQL148.replace(/recycled_content_calculations/g, "")),
    "y 0148 no puede tocar nada del contenido reciclado");
});

check("U. La sección se llama «Movimientos del lote»", () => {
  assert(/Movimientos del lote/.test(COMPONENTE), "el nombre nuevo");
  assert(!/Salidas físicas del lote/.test(COMPONENTE),
    "«salidas» era falso para un ajuste que suma y para una anulación");
  assert(MOVEMENT_KIND_LABEL.adjustment === "Ajuste por recuento físico",
    "y el ajuste dice que es por recuento");
  // La composición desaparece de la pantalla del lote.
  const pag = read("app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx");
  const visible = pag.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert(!/Composición del lote/.test(visible), "la sección de composición debía desaparecer");
  assert(!/listComposition/.test(visible), "y su consulta");
});

check("V. La aritmética visible cuadra con la de la base", () => {
  for (const t of ["Producido", "Reproceso", "Despachos", "Uso interno", "Merma", "Ajustes", "Disponible"]) {
    assert(COMPONENTE.includes(t), `falta el término «${t}» en el resumen del lote`);
  }
  const pag = read("app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx");
  assert(/st\.adjustmentKg !== 0/.test(pag),
    "la línea del listado omitía los ajustes y la resta no salía");
});


// ---------------------------------------------------------------------------
// P6 · EL FORMULARIO NO PUEDE QUEDARSE A MEDIAS
//
// Defecto encontrado en la validación humana: tras registrar un recuento, el
// selector volvía a «Despacho / entrega» y la etiqueta seguía diciendo
// «Cantidad contada físicamente» con el 97 del movimiento anterior. React 19
// reinicia el DOM del formulario al terminar la acción y no toca el estado de
// React: media parte reiniciada, media parte no.
// ---------------------------------------------------------------------------

check("P6-A/B. Al registrar con ÉXITO, el formulario se reinicia entero", () => {
  // Un solo objeto de estado. La costura entre «el tipo vive en React» y «la
  // cantidad vive en el DOM» era por donde entraba la incoherencia.
  assert(/type FormularioMovimiento = \{[\s\S]{0,260}kind: MovementKind;[\s\S]{0,260}cantidad: string;[\s\S]{0,260}contado: string;/.test(COMPONENTE),
    "el tipo y los valores dependientes deben vivir en el MISMO estado");
  for (const c of ["kind", "cantidad", "contado", "fecha", "motivo", "referencia"]) {
    assert(new RegExp(`FORMULARIO_INICIAL[\\s\\S]{0,240}${c}:`).test(COMPONENTE),
      `el estado inicial debe incluir ${c}: si un campo se queda fuera, se queda con el valor anterior`);
  }
  assert(/kind: "dispatch"/.test(COMPONENTE), "y volver a «Despacho / entrega»");
  assert(/if \(regState\.success\) setForm\(FORMULARIO_INICIAL\);/.test(COMPONENTE),
    "el reinicio debe colgar del ÉXITO, no de que la acción haya terminado");
  // Y TODOS los campos son controlados: si alguno sigue leyendo del DOM, el
  // reinicio de React 19 lo tocará por su cuenta y volveremos al mismo sitio.
  for (const [nombre, valor] of [["quantity", "form.cantidad"], ["counted_quantity", "contado"],
                                 ["occurred_at", "form.fecha"], ["reason", "form.motivo"],
                                 ["reference", "form.referencia"]] as const) {
    const i = COMPONENTE.indexOf(`name="${nombre}"`);
    assert(i > 0, `falta el campo ${nombre}`);
    assert(COMPONENTE.slice(i, i + 260).includes(`value={${valor}}`),
      `el campo ${nombre} no está controlado: React 19 lo reiniciaría por su cuenta`);
  }
});

check("P6-C. Cambiar de tipo limpia lo que era del tipo anterior", () => {
  assert(/const cambiarTipo = \(nuevo: MovementKind\) =>[\s\S]{0,200}cantidad: "", contado: ""/.test(COMPONENTE),
    "cambiar de tipo debe vaciar cantidad y recuento");
  assert(/onChange=\{\(e\) => cambiarTipo\(/.test(COMPONENTE),
    "el selector debe pasar por cambiarTipo, no por un set directo");
  // La previsualización y el mensaje del techo cuelgan del recuento, así que
  // al vaciarlo desaparecen solos. Se comprueba que es así y no por una copia.
  assert(/kind === "adjustment" && contado\.trim\(\) !== ""/.test(COMPONENTE),
    "la previsualización debe derivarse del tipo y del recuento, no guardarse aparte");
  assert(/\{kind === "adjustment" \? \([\s\S]{0,400}Cantidad contada físicamente/.test(COMPONENTE),
    "la etiqueta del recuento solo puede existir en el ajuste");
  assert(/\) : \([\s\S]{0,300}Cantidad \(kg\)/.test(COMPONENTE),
    "y los demás tipos piden «Cantidad (kg)»");
});

check("P6-D. Un rechazo del servidor CONSERVA lo tecleado", () => {
  // El reinicio cuelga del éxito. Al fallar, `regState.success` es falso y el
  // estado no se toca: se conserva el tipo, el número y el resto.
  const bloque = COMPONENTE.slice(COMPONENTE.indexOf("if (ultimoRegistro !== regState)"));
  const cuerpo = bloque.slice(0, bloque.indexOf("\n  }"));
  assert(/regState\.success/.test(cuerpo), "el reinicio debe mirar el éxito");
  assert(!/regState\.error/.test(cuerpo), "y no reiniciar nada al fallar");
  // El ajuste se hace durante el render, no en un efecto: un efecto pintaría
  // primero el estado viejo y encima dispara renderizados en cascada.
  assert(!/useEffect/.test(COMPONENTE),
    "el reinicio no puede vivir en un efecto");
});

check("P6-E/F. Un recuento rechazado no escribe nada", () => {
  // El servidor resuelve el recuento ANTES de escribir: si `resolveCount` no
  // da un resultado, retorna con el error y no llega al insert.
  const reg = ACCION.slice(ACCION.indexOf("export async function registerOutputMovementAction"));
  const cuerpo = reg.slice(0, reg.indexOf("\n}"));
  const iResolve = cuerpo.indexOf("resolveCount(");
  const iInsert = cuerpo.indexOf('from("output_batch_movements").insert');
  assert(iResolve > 0 && iInsert > iResolve,
    "el recuento debe resolverse antes de escribir");
  assert(/if \(!r\.ok\) return \{ error: r\.error \};/.test(cuerpo),
    "un recuento imposible tiene que salir por return, no seguir hasta la base");
  // Y aunque llegara, la base lo rechaza: el techo físico está en el guardián.
  assert(/físicamente posible/.test(MIG148),
    "la barrera de verdad sigue siendo el disparador");
});

check("P6-G. Corregir y anular siguen intactos, y cierran su panel", () => {
  assert(/if \(corrState\.success\) setCorrigiendoId\(null\)/.test(COMPONENTE),
    "una corrección con éxito cierra su panel");
  assert(/if \(anulState\.success\) setAnulandoId\(null\)/.test(COMPONENTE),
    "y una anulación el suyo");
  // Lo que NO cambia: siguen siendo la misma RPC, sin borrado.
  assert((ACCION.match(/rpc\("correct_output_batch_movement"/g) ?? []).length === 1,
    "corregir y anular comparten camino");
  assert(/Anular/.test(COMPONENTE) && !/Eliminar/.test(COMPONENTE),
    "«Anular» sí, «Eliminar» no");
});

console.log(`\n  ${passed} comprobaciones correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
