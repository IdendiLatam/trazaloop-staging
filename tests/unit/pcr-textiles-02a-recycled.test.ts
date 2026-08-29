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
import { explainReason, explainReasons } from "@/lib/domain/recycled-incomplete";
import {
  calculationState,
  formatRecycledPercent,
  operativeMissing,
  operativeStatus,
  structuralBlockers,
  CALCULATION_STATE_LABEL,
  DEFENSIBILITY_LABEL,
} from "@/lib/domain/recycled-readiness";
import { operativeNextStep, resolveNextStep } from "@/lib/domain/guided-flow";
import { normalizeVisibleTexts } from "@/lib/domain/nomenclature";

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


// ---------------------------------------------------------------------------
// H · §0.A · Cómo se le cuenta a una persona que no se puede calcular
// ---------------------------------------------------------------------------

check("H1. El incompleto se presenta como falta de datos, no como avería", () => {
  const pag = read("app/(app)/(shell)/(cpr)/recycled-content/output-batches/[id]/page.tsx");
  assert(pag.includes("INCOMPLETE_TITLE"), "debía haber un titular propio para el incompleto");
  assert(pag.includes("explainReasons"), "y los motivos traducidos");
  assert(/result_state === "incomplete"/.test(pag), "la pantalla debía distinguir el estado");
  assert(!/Error al calcular|falló el cálculo/i.test(pag),
    "un incompleto no es un fallo técnico y no se presenta como tal");
  const dom = read("lib/domain/recycled-incomplete.ts");
  assert(/No es un error del sistema/.test(dom), "el copy debía decirlo explícitamente");
});

check("H2. NUNCA sale un cero donde no se sabe", () => {
  const pag = read("app/(app)/(shell)/(cpr)/recycled-content/output-batches/[id]/page.tsx");
  // Las cifras solo se pintan en la rama 'calculated'. Y en el histórico y en
  // el flujo guiado, un porcentaje nulo se dice con palabras.
  const guiado = read("app/(app)/(shell)/(cpr)/guided-flow/output-batches/[id]/page.tsx");
  assert(/recycled_percent === null[\s\S]{0,80}sin calcular/.test(guiado),
    "el flujo guiado debía decir «sin calcular», no 0,00 %");
  assert(/c\.recycled_percent === null[\s\S]{0,60}incompleto/.test(pag),
    "el histórico debía distinguir un incompleto de un cero");
  // Y el tipo lo impone: si alguien vuelve a poner `num()`, el compilador
  // deja de avisar y esto se pierde.
  const db = read("lib/db/recycled.ts");
  assert(/recycled_percent: numOrNull/.test(db),
    "el porcentaje debía leerse como nulable: num() colapsaría «no sé» en cero");
});

check("H3. Se identifican los lotes y campos que faltan", () => {
  const r = explainReasons(["fraction_unknown:LE-001", "fraction_unknown:LE-002", "no_applicable_support:LE-003"]);
  const fraccion = r.find((x) => x.code === "fraction_unknown")!;
  assert(fraccion.batchCodes.length === 2, "debía agrupar los dos lotes bajo un solo consejo");
  assert(fraccion.batchCodes.includes("LE-001") && fraccion.batchCodes.includes("LE-002"),
    "y nombrarlos: «falta información» sin decir dónde deja a la persona buscándola");
  assert(r.length === 2, "dos motivos distintos, no cuatro párrafos");
  const soporte = r.find((x) => x.code === "no_applicable_support")!;
  assert(soporte.batchCodes[0] === "LE-003", "cada motivo con su lote");
});

check("H4. Un motivo desconocido se enseña tal cual", () => {
  const r = explainReason("motivo_que_nadie_ha_visto:LE-9");
  assert(r.what.includes("motivo_que_nadie_ha_visto"),
    "inventarle una explicación escondería que apareció uno nuevo");
});

check("H5. El único camino de cálculo es el vigente", () => {
  const boton = read("components/domain/recycled/calculate-button.tsx");
  assert(boton.includes("calculateRecycledContentV2Action"), "debía existir el camino vigente");
  assert(!boton.includes("calculateRecycledContentAction"),
    "el botón de la metodología anterior debía desaparecer del componente");
  assert(!/composici[óo]n/i.test(boton.replace(/^ *\*.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")),
    "el botón no puede volver a nombrar la composición fuera de los comentarios");
});

check("H6. La palabra «v2» desapareció de la experiencia normal", () => {
  // 0147 · Con una sola metodología, «metodología v2» en pantalla solo servía
  // para hacer preguntarse cuál era la otra. La versión sigue estando donde un
  // auditor la necesita: dentro del dossier técnico.
  const pag = read("app/(app)/(shell)/(cpr)/recycled-content/output-batches/[id]/page.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const t of ["Metodología v", "metodología v", "metodología v1", "metodología v2"]) {
    assert(!pag.includes(t), `la ficha sigue nombrando la metodología en pantalla: «${t}»`);
  }
  const dossier = read("components/domain/audit-support/dossier-body.tsx");
  assert(/methodology_code\} · v\{d\.methodology_version\}/.test(dossier),
    "el dossier técnico SÍ debe seguir identificando código y versión");
});


// ---------------------------------------------------------------------------
// I · P4 · LA METODOLOGÍA ANTERIOR SALE DE LA EXPERIENCIA OPERATIVA
//
// Doce comprobaciones, A a L, sobre la decisión de producto: el cálculo
// vigente es el único operativo; el anterior queda como histórico interno,
// íntegro y reproducible, pero sin formularios, sin botones y sin poder
// declarar incompleto a un lote que calcula perfectamente.
// ---------------------------------------------------------------------------

const FICHA = "app/(app)/(shell)/(cpr)/recycled-content/output-batches/[id]/page.tsx";
const LISTA_TRAZA = "app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx";
const LISTA_CALC = "app/(app)/(shell)/(cpr)/recycled-content/output-batches/page.tsx";
const GUIADO = "app/(app)/(shell)/(cpr)/guided-flow/output-batches/[id]/page.tsx";

check("A. La ausencia de composición ya no es una carencia", () => {
  assert(operativeMissing(["composición del lote"]).length === 0,
    "la composición no puede seguir contando como algo que falta");
  assert(operativeStatus("incomplete", ["composición del lote"]) === "complete",
    "un lote al que solo le falta la composición está completo");
  // Y lo que SÍ falta sigue faltando.
  assert(operativeStatus("incomplete", ["consumos de la orden"]) === "incomplete",
    "sin consumos el lote sigue incompleto");
  assert(operativeMissing(["composición del lote", "consumos de la orden"]).length === 1,
    "solo se descuenta la composición, no la lista entera");
});

check("B. El reparto se hace sobre texto YA normalizado, y se comprueba", () => {
  // Modo de fallo heredado de P4: la vista emite la nomenclatura histórica y
  // el dominio compara contra la vigente. Sin normalizar, «orden de
  // producción» no coincide con nada y el lote se declara completo SIN
  // estarlo — un falso verde.
  const normalizado = normalizeVisibleTexts(["orden de producción"]);
  assert(normalizado[0] === "orden / corrida de producción",
    `el helper debía traducir la denominación histórica, dio «${normalizado[0]}»`);
  assert(operativeStatus("incomplete", normalizado) === "incomplete",
    "sin orden el lote NO está completo");
  assert(/operativeStatus\(comp\.traceability_status, normalizeVisibleTexts\(/.test(read(LISTA_TRAZA)),
    "el punto de uso pasa la lista sin normalizar");
});

check("C. Calculabilidad y defendibilidad son dos preguntas distintas", () => {
  assert(calculationState(null) === "no_calculation", "sin fila no hay cálculo");
  assert(calculationState({ result_state: "incomplete" }) === "incomplete",
    "un incompleto no es un calculado");
  assert(calculationState({ result_state: "calculated" }) === "calculated", "y un calculado sí");
  // El vocabulario no se solapa: ninguna etiqueta de estado de cálculo puede
  // decir «trazabilidad», que es lo que confundía las dos preguntas.
  for (const t of [...Object.values(CALCULATION_STATE_LABEL), ...Object.values(DEFENSIBILITY_LABEL)]) {
    assert(!/trazabilidad/i.test(t), `la etiqueta «${t}» vuelve a mezclar los dos conceptos`);
  }
  assert(DEFENSIBILITY_LABEL.preliminary === "Sustento incompleto",
    "un cálculo poco sustentado no es un cálculo que no existe");
});

check("D. Un porcentaje que no existe nunca se escribe como cero", () => {
  assert(formatRecycledPercent(null) === "sin resultado", "null no es 0");
  assert(formatRecycledPercent(undefined) === "sin resultado", "ni undefined");
  assert(formatRecycledPercent(0) === "0.00%", "un cero real sí es un cero");
  assert(formatRecycledPercent(60.5) === "60.50%", "y un número, su número");
  // Y el tipo lo impone en la lectura, que es donde se perdía.
  const db = read("lib/db/recycled.ts");
  const vista = db.slice(db.indexOf("listLatestCalculations"));
  assert(/recycled_percent: numOrNull/.test(vista),
    "la vista del último cálculo colapsaba «no sé» en cero con num()");
});

/** El código sin comentarios: lo único que llega a ejecutarse. Los comentarios
 *  de este sprint nombran la composición a propósito, para explicar por qué ya
 *  no se pide, y confundirlos con la interfaz haría fallar por lo contrario de
 *  lo que se quiere comprobar. */
const soloCodigo = (f: string) =>
  read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

check("E. El formulario de composición no existe en runtime", () => {
  const forms = soloCodigo("components/domain/traceability/forms.tsx");
  assert(!/export function CompositionForm/.test(forms), "el componente debía retirarse");
  for (const t of ["Agregar a la composición", "Material recuperado en el mismo proceso"]) {
    assert(!forms.includes(t), `el texto «${t}» sigue en el paquete de formularios`);
  }
  const pag = read(LISTA_TRAZA);
  assert(!/<CompositionForm/.test(pag), "la pantalla seguía montando el formulario");
  assert(!/deleteBatchCompositionAction/.test(pag), "ni el botón de eliminar filas");
});

check("F. Las tres escrituras de composición están cerradas en el servidor", () => {
  const acc = read("server/actions/traceability.ts");
  assert(/const ALLOW_COMPOSITION_WRITES = false/.test(acc), "debía existir el cierre");
  for (const name of ["addBatchCompositionAction", "updateBatchCompositionAction",
                      "deleteBatchCompositionAction"]) {
    const cuerpo = acc.slice(acc.indexOf(`export async function ${name}(`));
    const guardia = cuerpo.indexOf("ALLOW_COMPOSITION_WRITES");
    const sesion = cuerpo.indexOf("requireActiveOrg");
    assert(guardia > 0, `${name} no está cerrada`);
    assert(guardia < sesion,
      `${name} niega DESPUÉS de trabajar: la puerta debe ir antes de tocar sesión y base`);
  }
  // Y no se borró nada: el histórico tiene que seguir leyéndose.
  assert(/from\("batch_composition"\)/.test(read("lib/db/traceability.ts")),
    "la lectura del histórico debía conservarse");
});

check("G. Queda un solo camino de cálculo, y es el canónico", () => {
  // PT-02A cerró la acción de la metodología anterior con una bandera. 0147 la
  // retiró entera, junto con la función de la base a la que llamaba: ninguna
  // empresa real la usó y Production nunca recibió la convivencia, así que
  // conservarla habría sido pagar compatibilidad con nadie.
  const acc = read("server/actions/recycled.ts");
  assert(!/export async function calculateRecycledContentAction/.test(acc),
    "la acción del motor retirado seguía exportada");
  assert(acc.includes("calculateRecycledContentV2Action"), "el camino vigente debe seguir");
  // Y las cinco migraciones del sprint anterior no la habían tocado: el
  // retiro es una decisión de 0147, fechada y sola.
  for (const f of ["0142_evidence_catalog_and_historical_truth.sql",
                   "0143_textile_unit_codes_and_concurrency.sql",
                   "0144_recycled_content_v2.sql",
                   "0145_textile_material_inventory.sql",
                   "0146_output_batch_movements.sql"]) {
    const sql = read(`supabase/migrations/${f}`).replace(/--.*$/gm, "");
    assert(!/drop function[^;]*calculate_recycled_content\s*\(/.test(sql),
      `${f} borra la función del motor anterior: eso lo decide 0147`);
  }
});

check("H. La importación masiva ya no es una puerta trasera", () => {
  const tipos = read("lib/imports/types.ts");
  const orden = tipos.slice(tipos.indexOf("export const IMPORT_ORDER"));
  assert(!/"batch_composition"/.test(orden.slice(0, orden.indexOf("];"))),
    "la composición seguía ofrecida en el importador");
  // Pero el tipo y la etiqueta se conservan: hay trabajos ya ejecutados que
  // los llevan y deben poder leerse.
  assert(/batch_composition: "Composición de lotes producidos"/.test(tipos),
    "borrar la etiqueta dejaría ilegibles los trabajos históricos");
});

check("I. El flujo guiado deja de tener un paso de composición", () => {
  const pag = read(GUIADO);
  assert(!/title="Composición"/.test(pag), "el paso debía desaparecer de la secuencia");
  assert(!/actionLabel="Agregar composición"/.test(pag), "ni su llamada a la acción");
  assert(!/r\.has_composition \? "completo"/.test(pag),
    "el estado del paso seguía colgando de la composición");
  // Y la numeración se cerró: sin huecos y sin repetidos.
  const nums = [...pag.matchAll(/^\s+number=\{(\d)\}$/gm)].map((m) => Number(m[1]));
  assert(nums.length > 0, "debía haber pasos numerados");
  assert(nums.join(",") === nums.map((_, k) => k + 1).join(","),
    `la numeración quedó rota: ${nums.join(",")}`);
  // El histórico sí se sigue viendo, cuando existe.
  assert(/composition\.length > 0/.test(pag), "la composición registrada debía seguir consultándose");
});

check("J. La cadena operativa salta la composición sin tocar el espejo de la vista", () => {
  const hechos = {
    hasProductionOrder: true, hasConsumption: true, hasComposition: false,
    anySupportMissing: false, anySupportPending: false, hasCalculation: false,
    latestDefensibilityLevel: null, latestRiskFlag: false,
  } as const;
  // El espejo de la vista SQL NO se toca: sigue diciendo lo que la vista dice.
  assert(resolveNextStep(hechos).code === "add_composition",
    "el espejo de v_output_batch_readiness debía quedar intacto");
  // Y la cadena operativa diverge a propósito.
  assert(operativeNextStep(hechos).code === "calculate",
    "sin composición, lo que toca es calcular");
  assert(operativeNextStep(hechos).readiness === "ready_to_calculate",
    "y el lote está listo, no «faltan datos»");
  // Lo que de verdad bloquea sigue bloqueando.
  assert(operativeNextStep({ ...hechos, hasConsumption: false }).code === "add_consumption",
    "sin consumos no se calcula");
  // La traducción ocurre en el único punto de entrada de las filas.
  const acc = read("server/actions/guided-flow.ts");
  assert(/operativeStepFromRow\(r\)/.test(acc),
    "las filas de readiness debían traducirse al entrar");
  assert(!/actionLabel: "Registrar composición"/.test(acc),
    "el panel seguía recomendando registrar composición");
  assert(/action_code !== "add_composition"/.test(read("lib/db/implementation.ts")),
    "el tablero de implantación seguía recomendándola");
});

check("K. Solo se anuncian los impedimentos que se pueden afirmar sin calcular", () => {
  assert(structuralBlockers({ hasOrder: true, hasConsumption: true, outputBatchesInOrder: 1 })
    .length === 0, "un lote normal no tiene impedimentos estructurales");
  assert(structuralBlockers({ hasOrder: false, hasConsumption: false, outputBatchesInOrder: 1 })
    .length === 1, "sin orden, un solo impedimento: el de la orden");
  assert(structuralBlockers({ hasOrder: true, hasConsumption: true, outputBatchesInOrder: 3 })
    .some((b) => /varios lotes/.test(b)), "la orden con varias salidas debía nombrarse");
  // Y NO se replican aquí las reglas del motor: una segunda implementación de
  // φ o de la evidencia acabaría discrepando de la primera.
  const dom = read("lib/domain/recycled-readiness.ts");
  const fn = dom.slice(dom.indexOf("export function structuralBlockers"));
  assert(!/recycled_fraction|evidence|defensibility/i.test(fn.slice(0, fn.indexOf("\n}"))),
    "los impedimentos estructurales no pueden reimplementar el motor");
});

check("L. Ninguna pantalla operativa vuelve a exigir composición", () => {
  for (const f of [FICHA, LISTA_TRAZA, LISTA_CALC, GUIADO,
                   "app/(app)/(shell)/(cpr)/guided-flow/page.tsx"]) {
    const visible = soloCodigo(f);
    for (const t of ["Registrar composición", "Agregar composición", "Completar composición",
                     "Editar composición", "Agregar componente",
                     "es la base del cálculo de contenido reciclado",
                     "La composición es necesaria para calcular"]) {
      assert(!visible.includes(t), `${f} sigue pidiendo composición: «${t}»`);
    }
  }
  // Y la vista de completitud de la metodología anterior deja de consultarse
  // en las pantallas de cálculo: era la fuente del falso «incompleto».
  for (const f of [FICHA, LISTA_CALC]) {
    assert(!/getCompleteness/.test(soloCodigo(f)),
      `${f} sigue leyendo la completitud de la metodología anterior`);
  }
});

check("M. La vista de completitud de la metodología anterior NO se tocó", () => {
  // El arreglo es de presentación. Modificar 0104 reescribiría la semántica de
  // cálculos ya emitidos.
  for (const f of ["0142_evidence_catalog_and_historical_truth.sql",
                   "0143_textile_unit_codes_and_concurrency.sql",
                   "0144_recycled_content_v2.sql",
                   "0145_textile_material_inventory.sql",
                   "0146_output_batch_movements.sql"]) {
    const sql = read(`supabase/migrations/${f}`);
    assert(!/v_output_batch_completeness/.test(sql.replace(/--.*$/gm, "")),
      `${f} modifica la vista de completitud`);
  }
  // Y no apareció una migración nueva para esto: la decisión es de producto.
  assert(!existsSync(join(ROOT, "supabase/migrations/0147_remove_v1_from_active_ux.sql")),
    "el cambio debía ser solo de código");
});


// ---------------------------------------------------------------------------
// 0147 · UNA SOLA METODOLOGÍA
//
// La invariante ya NO es «la función antigua ejecuta la metodología antigua».
// Es más simple y más fuerte: EXISTE EXACTAMENTE UN CAMINO OPERATIVO DE
// CÁLCULO. Doce comprobaciones, A a L.
// ---------------------------------------------------------------------------

const MIG147 = read("supabase/migrations/0147_recycled_content_methodology_consolidation.sql");
/** El SQL sin comentarios: lo único que llega a ejecutarse. Los comentarios de
 *  0147 nombran a propósito lo que retira —incluida la receta de reversión— y
 *  confundirlos con el código haría fallar por lo contrario de lo que se busca. */
const SQL147 = MIG147
  .replace(/--.*$/gm, "")
  // Y sin los `comment on … is '…'`: son texto para quien lea el esquema, no
  // lógica. Uno de ellos dice literalmente «nunca por is_active», y tomarlo por
  // código haría fallar la comprobación por decir lo correcto.
  .replace(/comment on [\s\S]*?';/gi, "");

check("0147-A. Solo la metodología canónica puede crear un cálculo nuevo", () => {
  // El motor apunta al puntero canónico…
  assert(/v_meth := public\.recycled_content_canonical_methodology\(\)/.test(MIG147),
    "el motor debía resolver por la función canónica");
  // …y rechaza que le pidan otra por argumento, que era la puerta abierta.
  assert(/p_methodology_id is not null and p_methodology_id <> v_meth\.id[\s\S]{0,200}raise exception/.test(MIG147),
    "el argumento de metodología seguía permitiendo elegir algoritmo");
  // …y la base lo garantiza aunque alguien inserte la fila a mano.
  assert(/create trigger t_recycled_calc_canonical_methodology[\s\S]{0,160}before insert/.test(MIG147),
    "faltaba el guardián en la tabla de cálculos");
  assert(/new\.methodology_id <> \(public\.recycled_content_canonical_methodology\(\)\)\.id/.test(MIG147),
    "el guardián no compara contra la canónica");
});

check("0147-B. No existe ruta de ejecución de la metodología retirada", () => {
  assert(/drop function if exists public\.calculate_recycled_content\(uuid, uuid\)/.test(MIG147),
    "el segundo motor debía retirarse de la base");
  assert(!/cascade/i.test(MIG147.slice(MIG147.indexOf("drop function if exists public.calculate_recycled_content"),
                                       MIG147.indexOf("drop function if exists public.calculate_recycled_content") + 200)),
    "un drop con cascade arrastraría dependientes sin decirlo");
  // Y nada en el código la invoca.
  for (const f of ["server/actions/recycled.ts", "scripts/seed-demo.ts"]) {
    assert(!/rpc\("calculate_recycled_content"/.test(read(f)),
      `${f} sigue llamando al motor retirado`);
  }
  assert(!/export async function calculateRecycledContentAction/.test(read("server/actions/recycled.ts")),
    "la acción de servidor del motor retirado debía desaparecer, no quedar como muñón");
});

check("0147-C. No hay escritura nueva de composición por ninguna ruta", () => {
  for (const p of ["batch_composition_insert", "batch_composition_update", "batch_composition_delete"]) {
    assert(new RegExp(`drop policy if exists ${p} on public\\.batch_composition`).test(MIG147),
      `seguía existiendo la política ${p}`);
  }
  assert(/revoke insert, update, delete on public\.batch_composition from anon, authenticated/.test(MIG147),
    "las políticas sin los privilegios dejan la puerta a medio cerrar");
  // La tabla y las filas se conservan: seis vistas las leen.
  assert(!/drop table[^;]*batch_composition/i.test(MIG147), "la tabla no debía borrarse");
  assert(!/delete from public\.batch_composition/i.test(MIG147), "las filas históricas no debían borrarse");
});

check("0147-D. φ = 0,60 sobre 100 kg da 60 %", () => {
  // La aritmética vive en la base y se demuestra en test:pcr-textiles-02a-rls
  // (caso D, contra datos reales). Aquí se comprueba que la FÓRMULA congelada
  // en la metodología sigue siendo la que dice ser.
  const mig144 = read("supabase/migrations/0144_recycled_content_v2.sql");
  assert(/'formula', 'sum\(consumed_i \* phi_i\) \/ sum\(consumed_i\) \* 100'/.test(mig144),
    "la fórmula canónica cambió");
  assert(/'denominator', 'consumption'/.test(mig144), "el denominador debía ser el consumo");
  assert(!MIG147.includes("'formula'"), "0147 no debía tocar la fórmula: solo consolida");
});

check("0147-E. Una fracción desconocida da CÁLCULO INCOMPLETO, no un cero", () => {
  const mig144 = read("supabase/migrations/0144_recycled_content_v2.sql");
  assert(/recycled_fraction is null[\s\S]{0,200}fraction_unknown/.test(mig144),
    "sin fracción declarada el resultado debe ser incompleto");
  assert(/'phi_requires_declared_fraction', true/.test(mig144),
    "la regla debía seguir congelada en la metodología");
  // Y la base lo impide aunque el código se equivocara.
  assert(/recycled_calc_state_consistent/.test(mig144), "faltaba el CHECK que lo garantiza");
});

check("0147-F. Un resultado nulo se escribe con palabras, nunca como 0 %", () => {
  assert(formatRecycledPercent(null) === "sin resultado", "null no es cero");
  assert(formatRecycledPercent(0) === "0.00%", "pero un cero real sí es un cero");
  const db = read("lib/db/recycled.ts");
  assert(/recycled_percent: numOrNull/.test(db.slice(db.indexOf("listLatestCalculations"))),
    "la lectura volvía a colapsar «no sé» en cero");
});

check("0147-G. La ausencia de composición es IRRELEVANTE para el cálculo", () => {
  const mig144 = read("supabase/migrations/0144_recycled_content_v2.sql");
  const fn = mig144.slice(mig144.indexOf("function public.calculate_recycled_content_v2"));
  assert(!/from public\.batch_composition/.test(fn), "el motor volvió a leer la composición");
  // Y no puede reaparecer como carencia operativa.
  assert(operativeMissing(["composición del lote"]).length === 0,
    "la composición volvía a contar como algo que falta");
  assert(operativeStatus("incomplete", ["composición del lote"]) === "complete",
    "un lote al que solo le falta la composición está completo");
  // Ni como brecha de soporte técnico.
  assert(/array_remove\(coalesce\(b\.missing_items, '\{\}'\), 'composición del lote'\)/.test(MIG147),
    "la brecha «trazabilidad incompleta» seguía contando la composición");
});

check("0147-H. La evidencia y la defendibilidad siguen funcionando", () => {
  // El motor no se toca: 0147 solo cambia cómo se elige la metodología.
  const mig144 = read("supabase/migrations/0144_recycled_content_v2.sql");
  for (const regla of ["'recycled_requires_origin_support', true", "no_applicable_support",
                       "input_batch_confirmed_link", "material_support_no_snapshot"]) {
    assert(mig144.includes(regla), `la regla de evidencia ${regla} desapareció`);
  }
  // Y las tres pantallas de soporte técnico entienden el vocabulario vigente,
  // que es lo que estaba roto: sin esto salían en blanco.
  assert(/comp\.value ->> 'consumed_kg'/.test(MIG147),
    "la vista de componentes no leía la masa de los snapshots vigentes");
  assert(/'no_applicable_support', 'recycled_fraction_not_declared'/.test(MIG147),
    "las brechas no conocían el vocabulario vigente");
  assert(/v_output_batch_materials/.test(MIG147),
    "la matriz de evidencias seguía buscando los materiales en la composición");
  const labels = read("lib/db/recycled.ts");
  for (const code of ["declared_fraction", "same_process_not_counted", "demonstrably_non_recycled",
                      "no_applicable_support", "recycled_fraction_not_declared"]) {
    assert(labels.includes(`${code}:`), `falta la traducción de ${code}`);
  }
});

check("0147-I. Una v3 futura NO cambia el algoritmo en silencio", () => {
  // ESTA ES LA LECCIÓN DEL SPRINT. La función retirada resolvía su metodología
  // con `is_active`; cuando 0144 activó la 2, pasó a ejecutar su propio código
  // estampando reglas ajenas. El puntero es ahora explícito.
  const fn = MIG147.slice(MIG147.indexOf("function public.recycled_content_canonical_methodology"));
  const cuerpo = fn.slice(0, fn.indexOf("$$;")).replace(/--.*$/gm, "");
  assert(/where code = 'RC-6632-15343' and version = 2/.test(cuerpo),
    "la canónica debía resolverse por código y versión explícitos");
  assert(!/is_active/.test(cuerpo), "la canónica volvía a resolverse por is_active");
  assert(!/order by version|max\(version\)/i.test(cuerpo),
    "la canónica volvía a resolverse por «la última»");
  // Y el motor tampoco tiene otra vía: ninguna de las tres formas de dejarse
  // llevar aparece en el SQL ejecutable de la migración.
  assert(!/\bis_active\b/.test(SQL147), "0147 volvía a resolver algo por is_active");
});

check("0147-J. El aislamiento entre empresas no se relaja", () => {
  // Las cuatro vistas que 0147 crea o recrea llevan `security_invoker`. Sin
  // él se ejecutan como su propietario, que tiene bypassrls: es exactamente
  // la fuga que costó tres vistas en 0143/0144/0145.
  for (const m of SQL147.matchAll(/create\s+(or\s+replace\s+)?view\s+public\.(\w+)([\s\S]{0,260}?)\bas\b/gi)) {
    assert(/security_invoker\s*=\s*true/.test(m[3]),
      `la vista ${m[2]} no declara security_invoker`);
  }
  // Y ninguna política de lectura se ensancha.
  assert(!/create policy[^;]*batch_composition/i.test(SQL147),
    "0147 no debía crear políticas nuevas sobre la composición");
  assert(!/grant select on public\.batch_composition to anon/i.test(SQL147),
    "0147 no debía abrir la composición a anónimos");
});

check("0147-K. El plan Full conserva lo que tenía; nada se le quita", () => {
  // 0147 no toca planes, límites ni módulos. Se comprueba en negativo, que es
  // como se comprueba que algo NO se movió.
  for (const t of ["organization_subscriptions", "module_plans", "plan_limits",
                   "organization_modules", "module_catalog"]) {
    assert(!new RegExp(`(alter|update|delete|insert)[^;]*\\b${t}\\b`, "i").test(SQL147),
      `0147 toca ${t}, y no debía`);
  }
});

check("0147-L. Demo queda exactamente como estaba", () => {
  assert(!/\bdemo\b/i.test(SQL147), "0147 menciona el plan demo en código ejecutable");
  // Y el guion de demostración se rehizo sobre consumos, sin composición.
  const seed = read("scripts/seed-demo.ts");
  assert(!/batch_composition/.test(seed), "el seed de demostración seguía tecleando composición");
  assert(/recycled_fraction: 100/.test(seed), "el seed debía declarar la fracción del lote");
  assert(/calculate_recycled_content_v2/.test(seed), "el seed debía usar el motor único");
});

console.log(`\n  ${passed} comprobaciones correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
