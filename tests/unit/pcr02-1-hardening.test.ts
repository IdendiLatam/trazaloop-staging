/**
 * Trazaloop · Sprint PCR-02.1 — hardening del modelo de producción.
 *
 * Cobertura §41 del brief (los 16 puntos, mapeados en cada check):
 * los comportamientos de BASE DE DATOS (trigger, RLS, constraints, vistas)
 * se ejecutan DE VERDAD contra PostgreSQL local con `npm run test:pcr02-1-db`
 * (tests/db/run-local-pg.sh, 33 aserciones); esta suite ejecuta la lógica
 * PURA de estados y fija CANDADOS estructurales sobre el código real de las
 * server actions, la UI y la migración, de modo que las guardas no puedan
 * eliminarse sin romper el verde.
 *
 * Correr: npm run test:pcr02-1
 */
import fs from "node:fs";
import path from "node:path";
import { orderMutationBlockedMessage } from "../../lib/domain/production-alerts";

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
function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, "..", "..", rel), "utf8");
}
/** Cuerpo de una función exportada de un módulo TS (hasta la siguiente export). */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  assert(start !== -1, `no se encontró ${name}`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

const ACTIONS = read("server/actions/traceability.ts");
const MIGRATION = read("supabase/migrations/0104_pcr02_internal_consumption_and_completeness.sql");
const DETAIL = read("app/(app)/(shell)/(cpr)/traceability/production-orders/[id]/page.tsx");
const GENEALOGY = read("app/(app)/(shell)/(cpr)/traceability/genealogy/page.tsx");
const OUTPUTS_PAGE = read("app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx");
const DB = read("lib/db/traceability.ts");
const HARNESS = read("tests/db/pcr02_1_assertions.sql");

console.log("\nPCR-02.1 · Hallazgo 1 — órdenes cerradas/canceladas inmutables\n");

check("1.1 matriz de estados: abierta permite, cerrada/cancelada bloquean (lógica ejecutada)", () => {
  // §25 · La MISMA función que usan todas las guardas de server actions.
  for (const open of ["draft", "in_progress"]) {
    assert(orderMutationBlockedMessage(open) === null, `${open} debía permitir mutaciones`);
  }
  const closed = orderMutationBlockedMessage("closed");
  assert(closed !== null && closed.includes("cerrada"), "closed debía bloquear con mensaje en español");
  const cancelled = orderMutationBlockedMessage("cancelled");
  assert(
    cancelled !== null && cancelled.includes("cancelada"),
    "cancelled debía bloquear con mensaje en español"
  );
});

check("1.2 CLOSED_EXTERNAL_DELETE_BLOCKED · deleteBatchConsumptionAction valida la orden ANTES de borrar", () => {
  const body = fnBody(ACTIONS, "deleteBatchConsumptionAction");
  const guard = body.indexOf("assertOrderAcceptsMutations");
  const del = body.indexOf(".delete()");
  assert(guard !== -1, "faltaba la guarda de estado de la orden");
  assert(del !== -1 && guard < del, "la guarda debe ejecutarse ANTES del delete");
  assert(body.includes('select("id, production_order_id")'), "debe resolver la orden del consumo");
});

check("1.3 CLOSED_INTERNAL_DELETE_BLOCKED · deleteOutputConsumptionAction con la misma guarda", () => {
  const body = fnBody(ACTIONS, "deleteOutputConsumptionAction");
  const guard = body.indexOf("assertOrderAcceptsMutations");
  const del = body.indexOf(".delete()");
  assert(guard !== -1 && del !== -1 && guard < del, "guarda de estado ANTES del delete interno");
  assert(
    body.includes("Promise<TraceActionState>"),
    "la acción devuelve estado (el usuario ve el motivo del rechazo)"
  );
});

check("1.4 CLOSED_OUTPUT_CREATE_BLOCKED · crear consumo (2 orígenes) y salida siguen guardados (PCR-02 conservado)", () => {
  for (const fn of ["addBatchConsumptionAction", "addOutputConsumptionAction", "createOutputBatchAction"]) {
    assert(
      fnBody(ACTIONS, fn).includes("assertOrderAcceptsMutations"),
      `${fn} debía conservar la guarda de PCR-02`
    );
  }
});

check("1.5 CLOSED_OUTPUT_REASSIGN_BLOCKED · updateOutputBatchAction: consumidores + ambas órdenes", () => {
  const body = fnBody(ACTIONS, "updateOutputBatchAction");
  assert(
    body.includes("current.production_order_id !== v.production_order_id"),
    "la reasignación debe detectarse comparando contra el lote actual"
  );
  assert(
    body.includes('from("output_batch_consumption")') && body.includes("count"),
    "debe comprobar si el lote ya fue consumido por otras órdenes"
  );
  assert(
    body.includes("ya fue consumido por otra orden: su orden productora no puede cambiarse"),
    "mensaje pactado de bloqueo de reasignación"
  );
  const from = body.indexOf("fromCheck");
  const to = body.indexOf("toCheck");
  assert(from !== -1 && to !== -1, "debe validar la orden ACTUAL y la orden DESTINO");
});

check("1.6 §50 · deleteOutputBatchAction: consumido → mensaje amable; orden productora validada; 23503 capturado", () => {
  const body = fnBody(ACTIONS, "deleteOutputBatchAction");
  assert(body.includes('from("output_batch_consumption")'), "pre-chequeo de consumidores");
  assert(body.includes("no puede eliminarse"), "mensaje amable, nunca SQL crudo");
  assert(body.includes("assertOrderAcceptsMutations"), "estado de la orden productora validado");
  assert(body.includes('"23503"'), "ON DELETE RESTRICT traducido a mensaje claro");
});

check("1.7 CANCELLED_MUTATIONS_BLOCKED · la matriz cubre cancelada con la misma guarda compartida", () => {
  // Todas las guardas usan orderMutationBlockedMessage (1.1 ya ejecutó
  // closed y cancelled); candado: assertOrderAcceptsMutations la referencia.
  const guard = ACTIONS.slice(
    ACTIONS.indexOf("async function assertOrderAcceptsMutations"),
    ACTIONS.indexOf("async function assertOrderAcceptsMutations") + 900
  );
  assert(guard.includes("orderMutationBlockedMessage"), "la guarda usa la matriz de estados real");
});

check("1.8 UI del detalle: sin botones de eliminar ni formularios cuando la orden no acepta mutaciones", () => {
  // Hallazgo 1.C: los DOS botones de eliminar (externo e interno) quedan
  // dentro de {!mutationBlocked}; nota de modo consulta/auditoría presente.
  const deletes = DETAIL.split("!mutationBlocked ? (");
  assert(deletes.length >= 5, "las mutaciones del detalle deben condicionarse a !mutationBlocked");
  assert(
    DETAIL.includes("modo consulta / auditoría"),
    "la orden cerrada debe declararse en modo consulta / auditoría"
  );
  assert(
    !DETAIL.includes("<form action={deleteOutputConsumptionAction}>"),
    "el borrado interno ya no usa un form sin estado"
  );
});

console.log("\nPCR-02.1 · Hallazgo 2 — implementación reconoce ambos orígenes\n");

check("2.1 INTERNAL_ONLY / EXTERNAL_ONLY / NO_CONSUMPTION (casos §11 1–4, ejecutados en PostgreSQL)", () => {
  // Conductual real: tests/db S6.1–S6.4 sobre la vista REAL; aquí candado de
  // que la suite ejecutable existe y cubre los cuatro casos + regresión.
  for (const probe of ["S6.1", "S6.2", "S6.3", "S6.4", "S6.5"]) {
    assert(HARNESS.includes(probe), `la suite PostgreSQL debía cubrir ${probe}`);
  }
  assert(
    HARNESS.includes("action_code = 'add_consumption'"),
    "los casos consultan la vista real por add_consumption"
  );
});

check("2.2 la CTE corregida exige ausencia de AMBOS orígenes (0104 §4b)", () => {
  const cte = MIGRATION.slice(
    MIGRATION.indexOf(">>> PCR02_1_ORDER_WITHOUT_CONSUMPTION_CTE"),
    MIGRATION.indexOf("<<< PCR02_1_ORDER_WITHOUT_CONSUMPTION_CTE")
  );
  assert(cte.includes("not exists") , "la CTE usa not exists");
  assert(cte.includes("batch_consumption"), "considera el consumo externo");
  assert(cte.includes("output_batch_consumption"), "considera el consumo interno");
  assert(
    MIGRATION.includes("create or replace view public.v_implementation_next_actions"),
    "0104 redefine la vista vigente (0065) completa"
  );
  // Contrato intacto: mismas columnas y la fila 7 conserva código y texto.
  for (const col of ["priority", "action_code", "action_label", "action_description", "href"]) {
    assert(MIGRATION.includes(col), `columna ${col} conservada`);
  }
  assert(MIGRATION.includes("'add_consumption'"), "action_code de la regla 7 intacto");
});

console.log("\nPCR-02.1 · Hallazgo 3 — trigger acotado por empresa, sin oráculo\n");

check("3.1 SECURITY_DEFINER_IS_ORG_SCOPED · invoker + organization_id + mensaje único", () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("create or replace function public.output_batch_consumption_no_self"),
    MIGRATION.indexOf("comment on function public.output_batch_consumption_no_self")
  );
  assert(fn.includes("security invoker"), "la función ya no es SECURITY DEFINER");
  assert(!fn.includes("security definer"), "sin definer residual");
  assert(
    fn.includes("and organization_id = new.organization_id"),
    "la consulta del lote queda acotada por empresa"
  );
  assert(fn.includes("set search_path = public"), "search_path fijado");
  const neutral = "El lote producido no existe o no pertenece a tu empresa.";
  assert(fn.includes(neutral), "mensaje neutro pactado");
  assert(
    !fn.includes("new.output_batch_id）") && !fn.includes("no existe',"),
    "sin mensaje diferenciado que filtre existencia cross-tenant"
  );
});

check("3.2 SELF/CROSS_TENANT (ejecutados en PostgreSQL): la suite db cubre §14 completo", () => {
  for (const probe of ["S2.1", "S2.2", "S2.3", "S2.4", "S4.5"]) {
    assert(HARNESS.includes(probe), `la suite PostgreSQL debía cubrir ${probe}`);
  }
  assert(
    HARNESS.includes("msg_cross <> msg_missing"),
    "la suite compara los mensajes cross-tenant e inexistente (sin oráculo)"
  );
});

check("3.3 §2b · trigger de reasignación presente y probado en PostgreSQL", () => {
  assert(
    MIGRATION.includes("output_batches_protect_reassignment"),
    "0104 protege production_order_id de lotes consumidos también en BD"
  );
  assert(
    MIGRATION.includes("before update on public.output_batches"),
    "el trigger corre en BEFORE UPDATE de output_batches"
  );
  assert(HARNESS.includes("S3.1"), "la suite PostgreSQL prueba la reasignación bloqueada");
});

console.log("\nPCR-02.1 · Hallazgo 4 — selectores acotados con búsqueda\n");

check("4.1 SELECTORS_ARE_BOUNDED_OR_SEARCHED · buscadores con límite 20 y filtro de empresa", () => {
  assert(DB.includes("SELECTOR_OPTIONS_LIMIT = 20"), "límite razonable definido");
  for (const fn of ["listConsumableOutputs", "searchInputBatchOptions", "searchEvidenceOptions"]) {
    const body = DB.slice(DB.indexOf(`export async function ${fn}`));
    const scoped = body.slice(0, body.indexOf("return {"));
    assert(scoped.includes('.eq("organization_id", orgId)'), `${fn}: filtro por empresa`);
    assert(scoped.includes(".limit(limit)"), `${fn}: resultados limitados`);
    assert(scoped.includes("ilike"), `${fn}: búsqueda por término server-side`);
  }
});

check("4.2 detalle de orden: sin universos completos; búsqueda por sección con aviso de recorte", () => {
  assert(!DETAIL.includes("listInputBatches("), "el detalle ya no carga todos los lotes de entrada");
  assert(
    !DETAIL.includes('from("evidences")'),
    "el detalle ya no carga todas las evidencias para el selector"
  );
  for (const param of ["in_q", "int_q", "ev_q"]) {
    assert(DETAIL.includes(param), `parámetro de búsqueda ${param} presente`);
  }
  assert(DETAIL.includes("afina la búsqueda"), "aviso de resultados recortados");
});

check("4.3 genealogía: búsqueda paginada PCR-01.1 + resolución por id (sin listas completas)", () => {
  assert(!GENEALOGY.includes("listOutputBatches("), "genealogía sin listOutputBatches completo");
  assert(!GENEALOGY.includes("listInputBatches("), "genealogía sin listInputBatches completo");
  for (const probe of ["searchOutputBatches", "searchInputBatches", "getOutputBatch", "getInputBatch"]) {
    assert(GENEALOGY.includes(probe), `genealogía usa ${probe}`);
  }
  assert(
    GENEALOGY.includes("outputSearch.total") && GENEALOGY.includes("inputSearch.total"),
    "muestra el total y sugiere afinar cuando hay recorte"
  );
});

check("4.4 lote consumido en edición: orden productora fija en el formulario (§49)", () => {
  assert(OUTPUTS_PAGE.includes("editingLockOrder"), "la página calcula el bloqueo de orden");
  assert(
    read("components/domain/traceability/forms.tsx").includes("lockOrder"),
    "OutputBatchForm soporta lockOrder"
  );
});

console.log("\nPCR-02.1 · Hallazgo 5 — completitud sin falsos positivos\n");

check("5.1 INTERNAL_CHAIN_COMPLETENESS_VALID / INCOMPLETE_UPSTREAM (casos §22 A–F en PostgreSQL)", () => {
  for (const probe of ["S5.A", "S5.B", "S5.C", "S5.D", "S5.D2", "S5.E", "S5.F", "S5.G"]) {
    assert(HARNESS.includes(probe), `la suite PostgreSQL debía cubrir ${probe}`);
  }
});

check("5.2 la vista hereda aguas arriba con recursión ACOTADA y a prueba de ciclos (0104 §4)", () => {
  const viewStart = MIGRATION.indexOf("create or replace view public.v_output_batch_completeness");
  const view = MIGRATION.slice(
    viewStart,
    MIGRATION.indexOf("v_implementation_next_actions", viewStart)
  );
  assert(view.includes("with recursive order_upstream"), "cierre recursivo definido");
  assert(view.includes("ou.depth < 10"), "profundidad acotada");
  assert(view.includes("any (ou.path)"), "camino acumulado anti-ciclos");
  assert(view.includes("chain_supplier_ok") && view.includes("chain_material_ok"), "herencia de proveedor/material");
  assert(view.includes("chain_has_consumption"), "una orden intermedia sin consumos corta la cadena");
  assert(
    !view.includes("true as has_supplier") && !view.includes("true  as has_supplier"),
    "sin booleanos constantes del PCR-02 original (causa del falso positivo)"
  );
  // Contrato intacto (compat §47): columnas y etiquetas conservadas.
  for (const col of [
    "has_order", "has_consumption", "has_composition", "has_supplier_info",
    "has_material_info", "consumed_mass_kg", "composition_mass_kg",
    "mass_balance_warning", "missing_items", "traceability_status",
  ]) {
    assert(view.includes(col), `columna ${col} conservada`);
  }
  for (const label of ["'consumos de la orden'", "'información de proveedor'", "'información de material'"]) {
    assert(view.includes(label), `etiqueta ${label} conservada`);
  }
});

console.log("\nPCR-02.1 · Hallazgo 6 — regresión y no-remoto\n");

check("6.1 PCR01_REGRESSION · candados PCR-01.1 intactos (kg obligatorio, evidencias, foco)", () => {
  const importAction = read("server/actions/import.ts");
  assert(
    importAction.includes("INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE"),
    "importación con kg obligatorio (PCR-01.1) intacta"
  );
  assert(DETAIL.includes("LinkedEvidenceList"), "evidencias vinculadas siguen en el detalle");
  assert(ACTIONS.includes("?created=1#consumos-"), "redirect de creación con foco intacto");
});

check("6.2 TEXTILES_REGRESSION · migraciones 0001–0103 intactas; posteriores solo las autorizadas hasta el hotfix pgcrypto 0110", () => {
  const dir = fs.readdirSync(path.join(__dirname, "..", "..", "supabase", "migrations"));
  // PCR-02.5: sprint posterior autorizado, con su propia suite de candados.
  const knownLater = new Set([
    "0105_pcr025_inventory_and_quantity_guards.sql",
    // Bloque PCR-03 (reserva declarada del brief: gobernanza de evidencias,
    // ejercicio de trazabilidad y expediente de preparación de auditoría).
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
  ]);
  const after = dir.filter((f) => /^01(0[5-9]|[1-9][0-9])/.test(f) && !knownLater.has(f));
  assert(after.length === 0, `no debe existir 0106+ ni 0105 desconocida: ${after.join(", ")}`);
  assert(dir.some((f) => f.startsWith("0104_pcr02_")), "la 0104 sigue siendo la única nueva");
});

check("6.3 la suite PostgreSQL es local y desechable (sin comandos remotos)", () => {
  const runner = read("tests/db/run-local-pg.sh");
  for (const banned of ["supabase link", "db push", "vercel", "git push"]) {
    assert(!runner.includes(banned), `el runner no debe contener ${banned}`);
  }
  assert(runner.includes("trazaloop_pcr02_1"), "base de datos local desechable");
});

console.log(failures === 0 ? "\nPCR-02.1: todos los checks pasaron.\n" : `\nPCR-02.1: ${failures} fallos.\n`);
if (failures > 0) process.exit(1);
