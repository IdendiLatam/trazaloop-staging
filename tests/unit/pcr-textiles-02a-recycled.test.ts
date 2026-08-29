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
import { splitMissing, v2ReadinessLabel } from "@/lib/domain/recycled-readiness";
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

check("H5. v2 NO vuelve a pedir la composición", () => {
  const boton = read("components/domain/recycled/calculate-button.tsx");
  assert(boton.includes("calculateRecycledContentV2Action"), "debía existir el camino a v2");
  // El botón de v2 se pinta también cuando v1 está deshabilitado por falta de
  // composición: pedirla otra vez es lo que PT-F10 vino a quitar.
  assert(/if \(disabled\)[\s\S]{0,400}\{botonV2\}/.test(boton),
    "el botón de v2 debía seguir disponible sin composición");
  assert(/No pide composición/.test(boton), "y decirlo");
});

check("H6. v1 sigue visible como histórico", () => {
  const pag = read("app/(app)/(shell)/(cpr)/recycled-content/output-batches/[id]/page.tsx");
  assert(/metodología v\{c\.methodology_version\}/.test(pag),
    "el histórico debía distinguir con qué metodología se calculó cada fila");
  const acc = read("server/actions/recycled.ts");
  assert(acc.includes("calculateRecycledContentAction"), "v1 debía seguir siendo invocable");
  assert(acc.includes("calculateRecycledContentV2Action"), "y v2 también");
});


// ---------------------------------------------------------------------------
// I · P4 · la composición de v1 no puede presentarse como requisito de v2
// ---------------------------------------------------------------------------

check("I1. La composición cae del lado de v1, no del de v2", () => {
  const r = splitMissing(["composición del lote"]);
  assert(r.ready, "sin composición, v2 SÍ puede calcular");
  assert(r.v1Only.includes("composición del lote"), "y la composición es cosa de v1");
  assert(r.missing.length === 0, "no puede figurar como carencia de v2");
});

check("I2. Lo que sí bloquea a v2 sigue bloqueando", () => {
  const sinConsumos = splitMissing(["consumos de la orden"]);
  assert(!sinConsumos.ready, "sin consumos no hay denominador");
  assert(sinConsumos.missing.includes("consumos de la orden"), "y debe decirse");
  // La denominación vigente, que es la que el dominio compara. La histórica
  // la traduce el helper central antes de llegar aquí (ver I4b).
  const sinOrden = splitMissing(["orden / corrida de producción"]);
  assert(!sinOrden.ready, "sin orden no hay de dónde colgar los consumos");
});

check("I3. El proveedor NO bloquea a v2: no entra en la fórmula", () => {
  // v1 lo usaba para graduar la defendibilidad. v2 no lo lee en ningún término.
  const r = splitMissing(["información de proveedor"]);
  assert(r.ready, "la falta de proveedor no puede impedir el cálculo v2");
});

check("I4. Un elemento desconocido cae del lado conservador", () => {
  // Si mañana la vista emite algo nuevo, mejor que v2 se declare no lista a
  // que se ignore en silencio.
  const r = splitMissing(["algo que nadie ha visto"]);
  assert(r.ready, "no está entre los requisitos de v2, así que no lo bloquea");
  assert(r.v1Only.length === 0, "y tampoco se presenta como cosa de v1");
});

check("I4b. El reparto se hace sobre texto YA normalizado, y se comprueba", () => {
  // Modo de fallo introducido al arreglar P4: la vista de la base emite la
  // nomenclatura histórica y el dominio compara contra la vigente. Si alguien
  // pasa la lista en crudo, «orden de producción» no coincide con ningún
  // requisito y v2 se declara lista SIN estarlo — un falso verde.
  const crudo = ["orden de producción"];
  const normalizado = normalizeVisibleTexts(crudo);
  assert(normalizado[0] === "orden / corrida de producción",
    `el helper debía traducir la denominación histórica, dio «${normalizado[0]}»`);
  assert(!splitMissing(normalizado).ready,
    "sin orden, v2 NO puede calcular");
  // Y los dos puntos de uso lo hacen así.
  for (const f of ["app/(app)/(shell)/(cpr)/recycled-content/output-batches/[id]/page.tsx",
                   "app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx"]) {
    assert(/splitMissing\(normalizeVisibleTexts\(/.test(read(f)),
      `${f} pasa la lista sin normalizar: v2 se declararía lista sin estarlo`);
  }
});

check("I5. La ficha de contenido reciclado separa los dos conceptos", () => {
  const pag = read("app/(app)/(shell)/(cpr)/recycled-content/output-batches/[id]/page.tsx");
  assert(pag.includes("splitMissing"), "debía repartir lo que falta entre v1 y v2");
  assert(/metodolog[ií]a v1/.test(pag), "el distintivo de completitud debía decir que es de v1");
  assert(pag.includes("v2ReadinessLabel"), "y debía enseñar el estado propio de v2");
  assert(/Composici[óo]n · metodolog[ií]a v1/.test(pag),
    "la sección de composición debía identificarse como de v1");
  assert(/Consumos de la orden · metodolog[ií]a v2/.test(pag),
    "y los consumos como la fuente de v2");
});

check("I6. La lista de lotes ya no mezcla las dos carencias", () => {
  const pag = read("app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx");
  assert(pag.includes("splitMissing"), "debía repartir lo que falta");
  assert(/Solo para la metodolog[ií]a v1/.test(pag),
    "lo que solo necesita v1 debía decirse aparte y sin alarma");
  // Y el «Falta: …» en rojo ya no puede llevar la lista entera.
  assert(!/Falta: \{normalizeVisibleTexts\(comp\.missing_items\)/.test(pag),
    "el aviso rojo seguía pintando todos los elementos juntos");
});

check("I7. El cálculo v2 se ofrece aunque falte composición", () => {
  const boton = read("components/domain/recycled/calculate-button.tsx");
  const rama = boton.slice(boton.indexOf("if (disabled)"), boton.indexOf("if (disabled)") + 500);
  assert(rama.includes("botonV2"),
    "cuando v1 no puede por falta de composición, v2 debe seguir ofreciéndose");
  const pag = read("app/(app)/(shell)/(cpr)/recycled-content/output-batches/[id]/page.tsx");
  assert(/La metodolog[ií]a v1 necesita composici[óo]n registrada/.test(pag),
    "y el motivo debe atribuir la exigencia a v1, no al lote");
});

check("I8. El producto NO es requisito de v2, y queda escrito", () => {
  const dom = read("lib/domain/recycled-readiness.ts");
  assert(/PRODUCT_NOT_REQUIRED_FOR_V2/.test(dom), "debía dejarse dicho");
  assert(/declared_recycled_percent/.test(dom), "y por qué: solo alimenta un aviso");
  const mig = read("supabase/migrations/0144_recycled_content_v2.sql");
  const fn = mig.slice(mig.indexOf("function public.calculate_recycled_content_v2"));
  // El producto solo se lee para el porcentaje declarado, nunca para la masa.
  assert(!/products[\s\S]{0,200}mass|product_id[\s\S]{0,80}numerador/i.test(fn),
    "el producto no puede participar en el cálculo");
});

check("I9. La vista de completitud de v1 NO se tocó", () => {
  // PT-H03 · v1 conserva su semántica. El arreglo es de presentación.
  for (const f of ["0142_evidence_catalog_and_historical_truth.sql",
                   "0143_textile_unit_codes_and_concurrency.sql",
                   "0144_recycled_content_v2.sql",
                   "0145_textile_material_inventory.sql",
                   "0146_output_batch_movements.sql"]) {
    const sql = read(`supabase/migrations/${f}`);
    assert(!/v_output_batch_completeness/.test(sql.replace(/--.*$/gm, "")),
      `${f} modifica la vista de completitud de v1`);
  }
});

console.log(`\n  ${passed} comprobaciones correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
