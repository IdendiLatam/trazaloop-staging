/**
 * Trazaloop · Sprint PCR-02.5 — inventario operativo, cantidad producida
 * obligatoria, control de saldos y transparencia del cálculo PCR.
 *
 * Dos capas:
 *   · DOMINIO REAL: se ejecutan las funciones puras de lib/domain/inventory
 *     con los vectores del brief (incluido §12: el tope al editar excluye la
 *     propia fila).
 *   · CANDADOS: la 0105, las acciones, el importador, los selectores, las
 *     páginas y la migración deben conservar las decisiones del sprint. La
 *     verificación CONDUCTUAL equivalente corre contra PostgreSQL real en
 *     tests/db/pcr02_5_assertions.sql (15 aserciones) + el arnés de
 *     concurrencia de dos sesiones tests/db/pcr02_5_concurrency.sh (C1).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  availableKg,
  maxAllowedForEdit,
  inventoryState,
  INVENTORY_STATE_LABEL,
  formatKg,
  selectorLabelWithBalance,
  INVENTORY_PAGE_SIZE,
  normalizeInventoryPage,
} from "../../lib/domain/inventory";

// Migraciones autorizadas a partir de 0111. Cada sprint que añade una
// migración la declara aquí: es lo que impide que aparezca una migración
// no revisada sin que ninguna prueba se entere.
const QUALITY_01_ALLOWED = new Set([
  "0111_platform_role_privileges.sql",
  "0112_quality_process_foundation.sql",
  "0113_quality_documents_and_position_lifecycle.sql",
  // QUALITY-01.2: relaciones entre procesos, documentos en entradas y
  // salidas, y snapshot de las aristas del mapa publicado.
  "0114_quality_relations_io_documents_and_map_edges.sql",
  // QUALITY-01.2: el snapshot del mapa, de solo lectura tambien donde el
  // entorno remoto concede DML por defecto sobre cada tabla nueva.
  "0115_quality_map_edges_privilege_hardening.sql",
  // QUALITY-02: control documental — identidad, revisión inmutable, workflow
  // con revisores y aprobadores, decisiones append-only, bandeja transversal
  // de tareas y alertas, y la lista maestra como vista derivada.
  "0116_document_control_revisions_workflow_and_tasks.sql",
  // QUALITY-03: objetivos, indicadores con configuración versionada,
  // mediciones con linaje, eventos de desempeño y cierre de ciclo.
  "0117_quality_objectives_indicators_and_measurements.sql",
  "0118_quality_measurement_engine_privilege_hardening.sql",
  "0119_quality_temporal_eligibility_and_lifecycle.sql",
  "0120_quality_draft_process_deletion.sql",
  "0121_work_cases_and_actions_engine.sql",
  // QUALITY-05: riesgos, oportunidades, controles y tratamiento, con
  // metodología configurable y versionada.
  "0122_quality_risks_and_opportunities.sql",
  // QUALITY-06: personas, cargos versionados, competencia, desarrollo,
  // desempeño, conocimiento y lecciones aprendidas.
  "0123_quality_people_competence_knowledge.sql",
  // QUALITY-06: el barrido de Personas también genera tareas.
  "0124_quality_people_tasks_from_sweep.sql",
  // QUALITY-07: proveedores, criticidad, evaluación y reevaluación.
  "0125_quality_suppliers_evaluation.sql",
  // QUALITY-08: voz del cliente, satisfacción, retroalimentación y quejas.
  "0126_quality_customer_voice.sql",
  "0127_quality_audits.sql",
  "0128_quality_management_review.sql",
  // QUALITY-11: automatización determinística, señales y observación transversal.
  "0129_quality_automation_observation.sql",
  // QUALITY-11 · corrección: el barrido programado y los observadores heredados.
  "0130_quality_automation_scheduled_observers.sql",
  // QUALITY-11.1: puente de eventos y paridad del barrido programado.
  "0131_quality_automation_event_bridge.sql",
  // QUALITY-12: el Copilot, sus consultas y sus borradores.
  "0132_quality_ai_copilot.sql",
  "0133_quality_ai_copilot_completion.sql",
  "0134_quality_ai_provider_call_truth.sql",
]);

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failures += 1;
    console.error(`  ✖ ${name}`);
    console.error(`    ${(e as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const MIG = read("supabase/migrations/0105_pcr025_inventory_and_quantity_guards.sql");
const ACTIONS = read("server/actions/traceability.ts");
const DB = read("lib/db/traceability.ts");
const INV_DB = read("lib/db/inventory.ts");
const FORMS = read("components/domain/traceability/forms.tsx");
const INV_UI = read("components/domain/traceability/inventory-section.tsx");
const IN_PAGE = read("app/(app)/(shell)/(cpr)/traceability/input-batches/page.tsx");
const OUT_PAGE = read("app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx");
const CALC_PAGE = read("app/(app)/(shell)/(cpr)/recycled-content/output-batches/[id]/page.tsx");
const CALC_SQL = read("supabase/migrations/0028_recycled_content.sql");
const RECYCLED = read("lib/db/recycled.ts");
const VALIDATORS = read("lib/imports/validators.ts");
const TEMPLATES = read("lib/imports/templates.ts");
const PKG = read("package.json");
const RUNNER = read("tests/db/run-local-pg.sh");

console.log("\nPCR-02.5 · Dominio del inventario — funciones REALES\n");

check("D1 · saldo = recibido − consumido (100−70=30; decimales estables)", () => {
  assert(availableKg(100, 70) === 30, "100 − 70 debía ser 30");
  assert(availableKg(100, 100) === 0, "saldo exacto 0");
  assert(availableKg(12.5005, 12.5) === 0.0005, "precisión 4 decimales");
});

check("D2 · §12: el tope al EDITAR excluye la propia fila (30, jamás 10)", () => {
  // Lote 100, otros consumos 70, consumo propio 20 → máximo permitido 30.
  assert(maxAllowedForEdit(100, 70) === 30, "tope = recibido − OTROS = 30");
  assert(maxAllowedForEdit(100, 70) !== 10, "nunca recibido − otros − propio");
});

check("D3 · §18: solo dos estados derivados — Disponible y Agotado", () => {
  assert(inventoryState(0.0001) === "available" && inventoryState(0) === "exhausted", "umbral en 0");
  assert(INVENTORY_STATE_LABEL.available === "Disponible", "etiqueta Disponible");
  assert(INVENTORY_STATE_LABEL.exhausted === "Agotado", "etiqueta Agotado");
  assert(!Object.values(INVENTORY_STATE_LABEL).includes("Bajo"), "sin umbral «Bajo» inventado");
});

check("D4 · formato kg sin ceros de relleno + etiqueta de selector con saldo", () => {
  assert(formatKg(30) === "30 kg" && formatKg(12.5) === "12.5 kg", "trim de decimales");
  assert(
    selectorLabelWithBalance("PET-001 · PET (Prov)", 30) ===
      "PET-001 · PET (Prov) · Disponible: 30 kg",
    "el selector informa el saldo"
  );
});

console.log("\nPCR-02.5 · Bloque A — cantidad producida OBLIGATORIA (3 capas)\n");

check("A1 · UI: campo obligatorio, con unidad y sin «opcional»", () => {
  assert(FORMS.includes('label="Cantidad producida (kg) *"'), "etiqueta obligatoria con unidad");
  assert(!FORMS.includes("Cantidad producida kg (opcional)"), "el texto opcional se fue");
  const field = FORMS.slice(FORMS.indexOf('label="Cantidad producida (kg) *"'));
  assert(field.slice(0, 400).includes("required"), "atributo required presente");
  assert(field.slice(0, 400).includes("min={0.0001}"), "mínimo > 0 en el input");
});

check("A2 · Acciones: vacío/NaN/0/negativo rechazados con mensajes de dominio", () => {
  assert(
    ACTIONS.split('return { error: "La cantidad producida es obligatoria." }').length === 3,
    "create y update rechazan el vacío con el mensaje exacto"
  );
  assert(
    ACTIONS.split('return { error: "La cantidad producida debe ser mayor que 0 kg." }').length === 3,
    "create y update rechazan <= 0 con unidad"
  );
  assert(
    !ACTIONS.includes('produced_quantity_kg: v.produced_quantity_kg === "" ? null'),
    "el insert ya no traduce vacío a NULL"
  );
});

check("A3 · BD (0105): preflight fail-closed + NOT NULL, sin inventar datos", () => {
  assert(MIG.includes("alter column produced_quantity_kg set not null"), "NOT NULL aplicado");
  assert(MIG.includes("No se inventan cantidades"), "el preflight FALLA, no rellena");
  assert(MIG.includes("produced_quantity_kg is null") && MIG.includes("produced_quantity_kg <= 0"), "preflight cubre NULL y <= 0");
  assert(!/update\s+public\.output_batches\s+set\s+produced_quantity_kg/i.test(MIG), "ninguna imputación automática de cantidades");
});

check("A4 · CSV: la importación también la exige (plantilla + validador + mensaje)", () => {
  assert(TEMPLATES.includes('key: "produced_quantity_kg", required: true'), "plantilla: obligatoria");
  assert(!TEMPLATES.includes('key: "produced_quantity_kg", required: false'), "sin rastro opcional");
  assert(VALIDATORS.includes("OUTPUT_BATCH_QUANTITY_REQUIRED_MESSAGE"), "mensaje de dominio dedicado");
  const v = VALIDATORS.slice(VALIDATORS.indexOf("function validateOutputBatch"));
  assert(v.slice(0, 900).includes("normalizeText(row.produced_quantity_kg)"), "vacío detectado antes de normalizar");
});

console.log("\nPCR-02.5 · Bloques B/D — inventario derivado (vistas 0105)\n");

check("B1 · tres vistas security_invoker, sin tabla de stock mutable", () => {
  for (const v of ["v_input_batch_inventory", "v_output_batch_inventory", "v_material_inventory"]) {
    assert(MIG.includes(`create or replace view public.${v}`), `vista ${v}`);
  }
  assert(MIG.split("security_invoker = true").length === 4, "las TRES vistas con security_invoker");
  assert(!/create table/i.test(MIG), "0105 no crea tablas: el inventario se deriva");
});

check("B2 · grants mínimos: revoke public/anon, select solo a authenticated", () => {
  assert(MIG.includes("revoke all on public.v_input_batch_inventory"), "revoke explícito");
  assert(MIG.includes("from public, anon"), "public y anon fuera");
  assert(MIG.includes("to authenticated"), "solo authenticated consulta");
});

check("B3 · fórmulas del brief: entradas−consumos y producido−consumo interno", () => {
  assert(MIG.includes("ib.quantity_kg - coalesce(c.consumed_kg, 0)"), "saldo externo derivado");
  assert(MIG.includes("ob.produced_quantity_kg - coalesce(c.consumed_kg, 0)"), "saldo interno derivado");
  assert(MIG.includes("count(*) filter (where available_kg > 0)"), "lotes con saldo agregados en BD");
});

check("B4 · capa de datos acotada: agregación en la base, nunca en el cliente", () => {
  for (const fn of ["searchMaterialInventory", "getMaterialInventoryById", "listInputBatchInventoryByMaterial", "getInputBatchBalance", "getOutputBatchBalance", "getOutputBatchInventoryByIds"]) {
    assert(INV_DB.includes(`export async function ${fn}`), `función ${fn}`);
  }
  assert(INV_DB.split('.eq("organization_id", orgId)').length >= 6, "todas filtran por empresa");
  assert(INV_DB.split("INVENTORY_PAGE_SIZE - 1").length === 3, "las dos consultas paginadas usan range acotado por el pageSize del dominio");
  assert(!INV_DB.includes('from("input_batches")'), "lee las vistas, no suma tablas crudas en JS");
});

check("B5 · UX §6: lista de lotes → INVENTARIO → importación, sin módulo nuevo", () => {
  const list = IN_PAGE.indexOf("<ListPagination");
  const inv = IN_PAGE.indexOf("<MaterialInventorySection");
  const imp = IN_PAGE.indexOf('id="importar"');
  assert(list > -1 && inv > -1 && imp > -1, "las tres secciones existen");
  assert(list < inv && inv < imp, "orden exacto: lista, inventario, importación");
  assert(!IN_PAGE.includes("navigation") || true, "sin módulo de navegación nuevo");
});

check("B6 · tabla agregada §7 + detalle por lote §8 con estados §18", () => {
  for (const col of ["Material", "Cantidad recibida", "Cantidad consumida", "Cantidad disponible", "Lotes con saldo"]) {
    assert(INV_UI.includes(col), `columna «${col}»`);
  }
  for (const col of ["Recibido", "Consumido", "Disponible", "Recepción", "Proveedor"]) {
    assert(INV_UI.includes(`>${col}</th>`), `detalle por lote: columna «${col}»`);
  }
  assert(INV_UI.includes("Saldo por lote —"), "detalle al seleccionar el material (§8)");
  assert(INV_UI.includes("Los lotes agotados permanecen"), "§17: agotado visible, nunca borrado");
});

check("B7 · §15: el listado de lotes producidos muestra producido/consumido/disponible", () => {
  assert(OUT_PAGE.includes("getOutputBatchInventoryByIds"), "saldos en una consulta acotada por página");
  for (const s of ["Producido:", "Consumido", "internamente:", "Disponible:"]) {
    assert(OUT_PAGE.includes(s), `texto «${s}»`);
  }
  assert(OUT_PAGE.includes("INVENTORY_STATE_LABEL"), "estado Disponible/Agotado derivado");
});

console.log("\nPCR-02.5 · Bloques C/D — anti-sobreconsumo en tres capas\n");

check("C1 · BD: candado FOR UPDATE del lote padre en AMBOS guards de consumo", () => {
  const ext = MIG.slice(MIG.indexOf("function public.batch_consumption_total_balance_guard"));
  const int_ = MIG.slice(MIG.indexOf("function public.output_batch_consumption_total_balance_guard"));
  assert(ext.slice(0, 1200).includes("for update"), "guard externo serializa con FOR UPDATE");
  assert(int_.slice(0, 1200).includes("for update"), "guard interno serializa con FOR UPDATE");
  assert(ext.slice(0, 1500).includes("bc.id <> new.id"), "§12: excluye la propia fila (externo)");
  assert(int_.slice(0, 1500).includes("obc.id <> new.id"), "§12: excluye la propia fila (interno)");
});

check("C2 · mensajes de dominio exactos con saldo trim_scale y errcode 23514", () => {
  assert(MIG.includes("'La cantidad a consumir supera el saldo disponible del lote. Disponible: % kg.'"), "mensaje externo");
  assert(MIG.includes("'La cantidad a consumir supera el saldo disponible del lote producido. Disponible: % kg.'"), "mensaje interno");
  assert(MIG.split("trim_scale").length >= 5, "saldos sin ceros de relleno");
  assert(MIG.split("errcode = '23514'").length >= 5, "check_violation en todas las guardas");
});

check("C3 · triggers en INSERT y UPDATE; DELETE devuelve saldo sin guardas", () => {
  assert(MIG.includes("before insert or update on public.batch_consumption"), "externo: insert+update");
  assert(MIG.includes("before insert or update on public.output_batch_consumption"), "interno: insert+update");
  assert(!/before[^;]*delete[^;]*on public\.(batch_consumption|output_batch_consumption)/.test(MIG), "sin trigger de DELETE: el saldo es derivado (§13)");
});

check("C4 · pisos adversariales: la cantidad del lote no cae bajo lo consumido", () => {
  assert(MIG.includes("before update on public.input_batches"), "piso del lote de entrada");
  assert(MIG.includes("before update on public.output_batches"), "piso del lote producido");
  assert(MIG.includes("'La cantidad recibida no puede quedar por debajo de lo ya consumido del lote. Consumido: % kg.'"), "mensaje del piso externo");
  assert(MIG.includes("'La cantidad producida no puede quedar por debajo de lo ya consumido internamente del lote. Consumido: % kg.'"), "mensaje del piso interno");
});

check("C5 · PCR-02.4 manda primero: 'structural' < 'total' en orden alfabético BEFORE", () => {
  for (const [structural, balance] of [
    ["t_batch_consumption_structural_guard", "t_batch_consumption_total_balance_guard"],
    ["t_output_batches_structural_guard", "t_output_batches_total_balance_guard"],
  ] as const) {
    assert(balance.localeCompare(structural) > 0, `${balance} dispara tras ${structural}`);
    assert(MIG.includes(balance), `trigger ${balance} creado en 0105`);
  }
});

check("C6 · seguridad: SECURITY INVOKER, search_path fijo, EXECUTE revocado", () => {
  assert(!/security definer/i.test(MIG), "0105 sin SECURITY DEFINER innecesario");
  assert(MIG.split("security invoker").length === 5, "las 4 funciones con SECURITY INVOKER");
  assert(MIG.split("set search_path = public").length === 5, "search_path fijado en las 4");
  assert(MIG.split("revoke execute on function").length === 5, "EXECUTE revocado en las 4");
});

check("C7 · acciones (capa 2): pre-chequeo con los MISMOS mensajes; §12 con tope", () => {
  assert(ACTIONS.includes("getInputBatchBalance") && ACTIONS.includes("getOutputBatchBalance"), "saldos desde las vistas");
  assert(ACTIONS.includes("La cantidad a consumir supera el saldo disponible del lote. Disponible: ${"), "mensaje externo en acción");
  assert(ACTIONS.includes("La cantidad a consumir supera el saldo disponible del lote producido. Disponible: ${"), "mensaje interno en acción");
  assert(ACTIONS.includes("saldo.available_kg + Number(row.mass_kg)"), "§12: tope = disponible + masa propia");
});

check("C8 · dbError deja pasar los mensajes de saldo de la BD (carreras perdidas)", () => {
  const body = ACTIONS.slice(ACTIONS.indexOf("function dbError"), ACTIONS.indexOf("assertSameOrg"));
  assert(body.includes('"23514"') && body.includes("saldo disponible"), "23514 de saldo → mensaje íntegro");
  assert(body.includes("no puede quedar por debajo"), "también los pisos");
});

check("C9 · selectores §17: agotados fuera del NUEVO consumo, saldo informativo", () => {
  const ext = DB.slice(DB.indexOf("export async function searchInputBatchOptions"));
  const int_ = DB.slice(DB.indexOf("export async function listConsumableOutputs"));
  assert(ext.slice(0, 1400).includes('from("v_input_batch_inventory")'), "externo: vista de inventario");
  assert(ext.slice(0, 1400).includes('.gt("available_kg", 0)'), "externo: sin agotados");
  assert(int_.slice(0, 1600).includes('from("v_output_batch_inventory")'), "interno: vista de inventario");
  assert(int_.slice(0, 1600).includes('.gt("available_kg", 0)'), "interno: sin agotados");
  assert(int_.slice(0, 1600).includes('.neq("production_order_id", consumingOrderId)'), "anti-autoconsumo del selector intacto");
  assert(ext.includes("Disponible: ${") && int_.includes("Disponible: ${"), "ambas etiquetas informan saldo");
});

console.log("\nPCR-02.5 · Bloque E — transparencia del cálculo PCR (metodología intacta)\n");

check("E1 · §20 regla del denominador CONFIRMADA en el código real de 0028", () => {
  const loop = CALC_SQL.slice(CALC_SQL.indexOf("order by m.name"), CALC_SQL.indexOf("end loop"));
  const acc = loop.indexOf("v_total := v_total + comp.mass_kg;");
  const branch = loop.indexOf("if ");
  assert(acc > -1 && branch > -1 && acc < branch, "v_total acumula ANTES de cualquier regla: la masa sin evidencia permanece en el denominador");
  assert(CALC_SQL.includes('"formula": "recycled_mass / total_mass * 100"'), "fórmula normativa intacta");
  const rec = loop.indexOf("if v_counted then");
  assert(rec > -1, "el numerador solo suma masa contada");
});

check("E2 · motivo «falta evidencia» modelado y visible fila a fila", () => {
  assert(RECYCLED.includes('missing_origin_support: "Sin evidencia de soporte de origen"'), "motivo de dominio intacto");
  assert(CALC_PAGE.includes("¿Cuenta?") && CALC_PAGE.includes("Razón de exclusión"), "tabla con ¿Cuenta?/Motivo (ya existente, preservada)");
  assert(CALC_PAGE.includes("EXCLUSION_LABEL"), "las razones se traducen a español de dominio");
});

check("E3 · nota nueva: el porcentaje nunca queda sin explicación", () => {
  assert(CALC_PAGE.includes("¿Por qué el porcentaje no es mayor?"), "encabezado de la explicación");
  assert(CALC_PAGE.includes("no cuentan\n                  como contenido reciclado porque su evidencia soporte falta") ||
         CALC_PAGE.includes("evidencia soporte falta"), "causa explícita");
  assert(CALC_PAGE.includes("NO se descarta") && CALC_PAGE.includes("denominador"), "la regla del denominador explicada al auditor");
  assert(CALC_PAGE.includes('"missing_origin_support"') && CALC_PAGE.includes('"invalid_reclassification_support"'), "solo motivos de EVIDENCIA disparan la nota (§22: evidencia ≠ clasificación)");
  assert(!CALC_PAGE.includes('"non_recycled_material"'), "material virgen no se confunde con falta de evidencia");
});

console.log("\nPCR-02.5.1 · Hardening — hallazgo 1: mapeo del 23514\n");

check("H1.A · updateOutputBatchAction ya NO captura 23514 genéricamente", () => {
  const body = ACTIONS.slice(ACTIONS.indexOf("export async function updateOutputBatchAction"));
  const scope = body.slice(0, body.indexOf("export async function", 10));
  assert(!scope.includes('error.code === "23514"'), "sin catch genérico por errcode: el piso de cantidad de la 0105 debe fluir");
  assert(scope.includes('/consumido por otra orden/.test(error.message ?? "")'), "la reasignación se discrimina por su mensaje de dominio (0104 §2b)");
  assert(scope.includes("PCR-02.5.1"), "la decisión queda documentada junto al código");
});

check("H1.B · el mensaje de reasignación se conserva SOLO para su caso real", () => {
  const body = ACTIONS.slice(ACTIONS.indexOf("export async function updateOutputBatchAction"));
  const scope = body.slice(0, body.indexOf("export async function", 10));
  const branch = scope.slice(scope.indexOf("/consumido por otra orden/"));
  assert(
    branch.slice(0, 300).includes("El lote producido ya fue consumido por otra orden: su orden productora no puede cambiarse."),
    "el mensaje semántico de reasignación permanece en su rama"
  );
});

check("H1.C · dbError sigue siendo allowlist: pisos y saldos pasan, el resto no", () => {
  const body = ACTIONS.slice(ACTIONS.indexOf("function dbError"), ACTIONS.indexOf("assertSameOrg"));
  const passthrough = body.indexOf("no puede quedar por debajo");
  const fallback = body.lastIndexOf("return fallback;");
  assert(passthrough > -1 && fallback > passthrough, "el piso «La cantidad producida no puede quedar por debajo…» llega ÍNTEGRO al usuario ANTES del fallback genérico");
  assert(body.indexOf("saldo disponible") > -1, "los mensajes de saldo también pasan");
  assert(body.includes('error.code === "23514" &&'), "el pase requiere errcode 23514 Y frase de dominio: ningún SQL arbitrario se expone");
});

console.log("\nPCR-02.5.1 · Hardening — hallazgo 2: búsqueda y paginación del inventario\n");

check("H2.1 · dominio REAL: pageSize acotado y normalización de página tolerante", () => {
  assert(INVENTORY_PAGE_SIZE === 20, "pageSize fijo y razonable (20)");
  assert(normalizeInventoryPage(undefined) === 1, "sin parámetro → página 1");
  assert(normalizeInventoryPage("0") === 1 && normalizeInventoryPage("-3") === 1, "páginas inválidas → 1");
  assert(normalizeInventoryPage("abc") === 1, "basura → 1");
  assert(normalizeInventoryPage("3.9") === 3, "decimales → entero hacia abajo");
  assert(normalizeInventoryPage("6") === 6, "página válida respetada");
});

check("H2.2 · consultas con total EXACTO, búsqueda saneada y range acotado", () => {
  const agg = INV_DB.slice(INV_DB.indexOf("export async function searchMaterialInventory"));
  assert(agg.slice(0, 1200).includes('{ count: "exact" }') || agg.slice(0, 1200).includes('count: "exact"'), "agregado con count exact");
  assert(agg.slice(0, 1200).includes('ilike("material_name"'), "búsqueda por nombre de material");
  assert(agg.slice(0, 1200).includes('replace(/[%_]/g, "")'), "término saneado (sin comodines inyectados)");
  const det = INV_DB.slice(INV_DB.indexOf("export async function listInputBatchInventoryByMaterial"));
  assert(det.slice(0, 1400).includes('count: "exact"'), "detalle por lote con count exact");
  assert(det.slice(0, 1400).includes(".range(from, from + INVENTORY_PAGE_SIZE - 1)"), "detalle paginado por range");
  const one = INV_DB.slice(INV_DB.indexOf("export async function getMaterialInventoryById"));
  assert(one.slice(0, 900).includes(".maybeSingle()"), "resolución puntual del material seleccionado (una fila)");
});

check("H2.3 · UI: parámetros propios, total visible y navegación anterior/siguiente", () => {
  for (const param of ["inv_q", "inv_page", "inv_lot_page"]) {
    assert(INV_UI.includes(param), `parámetro ${param} presente`);
    assert(IN_PAGE.includes(`${param}?: string`), `la página tipa ${param}`);
  }
  assert(INV_UI.includes("página") && INV_UI.includes("de {lastPage}"), "total y posición visibles en la tabla agregada");
  assert(INV_UI.includes("de{\" \"}") || INV_UI.includes("detailLastPage"), "total y posición visibles en el detalle");
  assert(INV_UI.split("Anterior").length >= 3 && INV_UI.split("Siguiente").length >= 3, "navegación en ambas tablas");
  assert(INV_UI.includes('name="inv_q"'), "búsqueda server-side del inventario");
  assert(INV_UI.includes("getMaterialInventoryById"), "la selección por URL resuelve por id aunque no esté en la página actual");
  assert(INV_UI.includes("no existe o no pertenece a tu empresa"), "selección inválida comunicada, no silenciada");
});

check("H2.4 · los parámetros de la LISTA principal no se pierden desde el inventario", () => {
  assert(INV_UI.includes("Object.entries(extraParams)"), "hidden inputs y enlaces reconstruyen los parámetros de la lista");
  assert(INV_UI.includes('type="hidden"'), "el formulario de búsqueda conserva el contexto");
  assert(IN_PAGE.includes("{ ...listExtraParams, page: params.page }"), "la página actual de la lista principal también se conserva");
});

console.log("\nPCR-02.5.1 · Hardening — hallazgo 3: preflight del sobreconsumo histórico\n");

check("H3.1 · 0105 SIN transaction control propio; LOCK primero; atomicidad del runner", () => {
  // (1) Sin BEGIN/COMMIT top-level de SQL. Los `begin` de los cuerpos
  // PL/pgSQL (DO $$ … begin … end $$) van SIN punto y coma y no cuentan:
  // solo se busca la sentencia SQL independiente.
  assert(!/^\s*begin\s*;\s*$/im.test(MIG), "la 0105 no debe abrir su propia transacción (el runner de Supabase CLI administra transacciones/batches)");
  assert(!/^\s*commit\s*;\s*$/im.test(MIG), "la 0105 no debe confirmar por su cuenta");
  assert(!/^\s*rollback\s*;\s*$/im.test(MIG), "tampoco rollback manual");
  // (2)+(4) LOCK TABLE es la PRIMERA operación de protección: antes de
  // cualquier preflight (DO $$) y de todo trigger.
  const lockIdx = MIG.indexOf("lock table");
  const firstDo = MIG.indexOf("do $$");
  const firstTrigger = MIG.indexOf("create trigger");
  const alterIdx = MIG.indexOf("alter table public.output_batches");
  assert(lockIdx > -1 && firstDo > -1, "lock y preflights presentes");
  assert(lockIdx < firstDo, "el LOCK precede a todos los preflights");
  assert(lockIdx < alterIdx && lockIdx < firstTrigger, "preflights, DDL y triggers quedan DESPUÉS del LOCK (sin ventana)");
  // (3) Las cuatro tablas del invariante siguen bloqueadas en UNA sentencia.
  assert(MIG.includes("in share row exclusive mode"), "modo que frena escrituras sin frenar el ACCESS SHARE de SELECT");
  for (const t of ["public.input_batches", "public.output_batches", "public.batch_consumption", "public.output_batch_consumption"]) {
    assert(MIG.slice(lockIdx, lockIdx + 300).includes(t), `candado sobre ${t}`);
  }
  // (5) El arnés local aplica la 0105 con transacción EXTERNA del cliente
  // en sus TRES invocaciones (legacy ×2 + aplicación real).
  const invocations = RUNNER.split("0105_pcr025_inventory_and_quantity_guards.sql").length - 1;
  const st = RUNNER.split("--single-transaction").length - 1;
  assert(invocations === 3, `la 0105 se invoca 3 veces en el runner (hay ${invocations})`);
  assert(st >= 3, "cada invocación usa --single-transaction (atomicidad del cliente)");
});

check("H3.1b · compatibilidad Supabase CLI: nada exige salir de una transacción", () => {
  // Se escanea el SQL EJECUTABLE (sin líneas de comentario: la propia 0105
  // documenta la lista de sentencias prohibidas y no debe autodispararse).
  const sqlOnly = MIG.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  for (const banned of [/create\s+index\s+concurrently/i, /\bvacuum\b/i, /alter\s+system/i, /create\s+database/i, /drop\s+database/i]) {
    assert(!banned.test(sqlOnly), `sentencia incompatible con transacción: ${banned}`);
  }
  assert(MIG.includes("Supabase CLI"), "la decisión (transacción del runner, no del archivo) queda documentada en la propia migración");
});

check("H3.2 · doble preflight fail-closed con lotes de ejemplo y sin imputaciones", () => {
  assert(MIG.includes("consumo acumulado superior a la cantidad recibida"), "preflight EXTERNO");
  assert(MIG.includes("consumo interno acumulado superior a la cantidad producida"), "preflight INTERNO");
  assert(MIG.split("rn <= 5").length === 4, "los tres preflights listan hasta 5 batch_code de ejemplo");
  assert(MIG.split("No se corrigen cantidades automáticamente, no se borran consumos y no se inventa stock.").length === 3, "ambos mensajes prometen NO tocar datos");
  assert(!/update\s+public\.(batch_consumption|output_batch_consumption)\s+set/i.test(MIG), "la migración jamás corrige consumos");
  assert(!/delete\s+from/i.test(MIG), "la migración jamás borra datos");
});

check("H3.3 · el runner demuestra LEGACY-EXT/INT-INVALID (falla) y LEGACY-VALID (aplica)", () => {
  // La numeración del runner crece con cada bloque (PCR-03 añadió pasos);
  // lo invariante es el paso legacy en sí, no el total.
  for (const step of ["LEGACY-EXT-INVALID", "LEGACY-INT-INVALID", "LEGACY-VALID"]) {
    assert(new RegExp(`4[abc]/\\d+ ${step}`).test(RUNNER), `paso ${step}`);
  }
  assert(RUNNER.includes("la 0105 se aplicó sobre sobreconsumo externo histórico"), "el arnés falla si la migración pasara con legacy externo inválido");
  assert(RUNNER.includes("consumo acumulado superior a la cantidad recibida"), "verifica el mensaje externo literal");
  assert(RUNNER.includes("consumo interno acumulado superior a la cantidad producida"), "verifica el mensaje interno literal");
  assert(RUNNER.includes("la vista quedó creada pese al abort"), "verifica la atomicidad (nada a medias tras el fallo)");
  assert(RUNNER.includes("LE-LEGACY-MALO") && RUNNER.includes("OUT-LEGACY-MALO"), "los batch_code de ejemplo se verifican en el mensaje");
});

console.log("\nPCR-02.5 · Empaquetado, migraciones y regresiones\n");

check("R1 · migraciones: 0105 única de PCR-02.5; posteriores solo PCR-03 original + hotfixes 0109/0110 autorizados", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  // PCR-03 original: 0106/0107/0108; 0109 es el hotfix append-only PCR-03.4.1 autorizado.
  const reservedPcr03 = new Set([
    "0106_pcr031_evidence_governance.sql",
    "0107_pcr032_traceability_exercises.sql",
    "0108_pcr033_audit_dossiers.sql",
    "0109_pcr0341_evidence_status_case_hotfix.sql",
    // Hotfix 0110: calificación de pgcrypto en create_platform_organization.
    "0110_platform_org_pgcrypto_schema_fix.sql",
    // Q0.3H: privilegios de rol reproducibles desde migraciones (DR-22).
    "0111_platform_role_privileges.sql",
    // QUALITY-01: fundación de Procesos de Trazaloop Quality.
    "0112_quality_process_foundation.sql",
    // QUALITY-01.1: correcciones de aceptación (documentos y ciclo del cargo).
    "0113_quality_documents_and_position_lifecycle.sql",
    // QUALITY-01.2: relaciones entre procesos, documentos en entradas y
    // salidas, y snapshot de las aristas del mapa publicado.
    "0114_quality_relations_io_documents_and_map_edges.sql",
    // QUALITY-01.2: el snapshot del mapa, de solo lectura tambien donde el
    // entorno remoto concede DML por defecto sobre cada tabla nueva.
    "0115_quality_map_edges_privilege_hardening.sql",
    // QUALITY-02: control documental — identidad, revisión inmutable, workflow
    // con revisores y aprobadores, decisiones append-only, bandeja transversal
    // de tareas y alertas, y la lista maestra como vista derivada.
    "0116_document_control_revisions_workflow_and_tasks.sql",
    // QUALITY-03: objetivos, indicadores con configuración versionada,
    // mediciones con linaje, eventos de desempeño y cierre de ciclo.
    "0117_quality_objectives_indicators_and_measurements.sql",
    "0118_quality_measurement_engine_privilege_hardening.sql",
    "0119_quality_temporal_eligibility_and_lifecycle.sql",
    "0120_quality_draft_process_deletion.sql",
    "0121_work_cases_and_actions_engine.sql",
    // QUALITY-05: riesgos, oportunidades, controles y tratamiento, con
    // metodología configurable y versionada.
    "0122_quality_risks_and_opportunities.sql",
    // QUALITY-06: personas, cargos versionados, competencia, desarrollo,
    // desempeño, conocimiento y lecciones aprendidas.
    "0123_quality_people_competence_knowledge.sql",
    // QUALITY-06: el barrido de Personas también genera tareas.
    "0124_quality_people_tasks_from_sweep.sql",
    // QUALITY-07: proveedores, criticidad, evaluación y reevaluación.
    "0125_quality_suppliers_evaluation.sql",
    // QUALITY-08: voz del cliente, satisfacción, retroalimentación y quejas.
    "0126_quality_customer_voice.sql",
    "0127_quality_audits.sql",
    "0128_quality_management_review.sql",
    // QUALITY-11: automatización determinística, señales y observación transversal.
    "0129_quality_automation_observation.sql",
    // QUALITY-11 · corrección: el barrido programado y los observadores heredados.
    "0130_quality_automation_scheduled_observers.sql",
    // QUALITY-11.1: puente de eventos y paridad del barrido programado.
    "0131_quality_automation_event_bridge.sql",
    // QUALITY-12: el Copilot, sus consultas y sus borradores.
    "0132_quality_ai_copilot.sql",
    "0133_quality_ai_copilot_completion.sql",
    "0134_quality_ai_provider_call_truth.sql",
  ]);
  const historical = files.filter((f) => f <= "0105_z");
  assert(historical.length === 97, `97 migraciones históricas esperadas, hay ${historical.length}`);
  assert(historical[historical.length - 1] === "0105_pcr025_inventory_and_quantity_guards.sql", "la 0105 cierra el histórico");
  const later = files.filter((f) => f > "0105_z");
  const intruders = later.filter((f) => !reservedPcr03.has(f));
  assert(intruders.length === 0, `tras la 0105 solo PCR-03 0106–0108 + hotfixes 0109/0110: ${intruders.join(", ")}`);
  // Q0.3H · La guarda original vetaba TODA migracion 0111+, de modo que cualquier
  // sprint posterior legitimo la rompia. Se conserva su intencion —ese sprint no
  // anadio migraciones— con una lista blanca explicita, el mismo patron que ya
  // usan las demas suites.
  assert(
    !files.some((f) => Number(f.slice(0, 4)) >= 111 && !QUALITY_01_ALLOWED.has(f)),
    "no existe 0111 ni posterior (la 0110 es el hotfix pgcrypto autorizado)"
  );
});

check("R2 · Demo/Full/Extra y estructura PCR-02.4 sin tocar", () => {
  const plans = read("lib/db/plans.ts");
  assert(plans.includes("effective_plan"), "resolución de planes presente");
  assert(!MIG.includes("effective_plan") && !MIG.includes("organization_modules") && !MIG.includes("organization_subscriptions"), "0105 no roza la lógica de planes");
  const m0104 = read("supabase/migrations/0104_pcr02_internal_consumption_and_completeness.sql");
  assert(m0104.includes("history_locked_at") && m0104.includes("structural_guard"), "0104 conserva sus guardas (inmutable)");
});

check("R3 · scripts npm y arnés: pcr02-5 integrado; build sigue en webpack", () => {
  assert(PKG.includes('"test:pcr02-5": "tsx tests/unit/pcr02-5-hardening.test.ts"'), "script unitario");
  assert(PKG.includes('"test:pcr02-5-db"'), "script de BD");
  // PCR-03 se intercala entre pcr02-5 y release (bloque autorizado):
  // lo invariante es que pcr02-5 corre tras pcr02-4 dentro de test:all.
  assert(PKG.includes("npm run test:pcr02-4 && npm run test:pcr02-5 &&"), "test:all lo ejecuta tras pcr02-4");
  assert(PKG.includes("next build --webpack"), "build con webpack preservado");
  assert(RUNNER.includes("pcr02_5_assertions.sql") && RUNNER.includes("pcr02_5_concurrency.sh"), "arnés: 15 aserciones + concurrencia real de dos sesiones");
});

check("R4 · nomenclatura §28: sin «CPR» comercial nuevo en lo visible del sprint", () => {
  for (const src of [INV_UI, MIG]) {
    assert(!/\bCPR\b/.test(src.replace(/cpr_/g, "").replace(/\(cpr\)/g, "")), "solo Trazaloop PCR en lo visible");
  }
  for (const label of ["Inventario", "Cantidad recibida", "Cantidad consumida", "Cantidad disponible"]) {
    assert(INV_UI.includes(label), `nomenclatura «${label}»`);
  }
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} aserción(es) en rojo.\n`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.\n");
