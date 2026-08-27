/**
 * Trazaloop · Sprint PCR-02.3 — Historical Lock + reapertura explícita.
 *
 * Bypass corregido: closed → reopen (UPDATE de estado) → DELETE. La
 * protección PCR-02.2 dependía del estado PRESENTE; ahora existe un candado
 * histórico persistente (production_orders.history_locked_at) irreversible.
 *
 * Los comportamientos de BD corren DE VERDAD en `npm run test:pcr02-3-db`
 * (tests/db/pcr02_3_assertions.sql, S9.1–S9.11 sobre la 0104 real, con RLS
 * bajo rol authenticated, auditoría y backfill incluidos). Esta suite
 * ejecuta la matriz PURA del candado y fija candados estructurales sobre el
 * código real (§45 del brief: nada se declara cerrado solo por un string).
 *
 * Correr: npm run test:pcr02-3
 */
import fs from "node:fs";
import path from "node:path";
import {
  orderDeletionBlockedMessage,
  orderMutationBlockedMessage,
  orderReopenAllowed,
  isReopenedHistoricalOrder,
  ORDER_HISTORY_MESSAGE,
} from "../../lib/domain/production-alerts";

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
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  assert(start !== -1, `no se encontró ${name}`);
  const next = src.indexOf("\nexport ", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

const ACTIONS = read("server/actions/traceability.ts");
const MIGRATION = read("supabase/migrations/0104_pcr02_internal_consumption_and_completeness.sql");
const DETAIL = read("app/(app)/(shell)/(cpr)/traceability/production-orders/[id]/page.tsx");
const LIST = read("app/(app)/(shell)/(cpr)/traceability/production-orders/page.tsx");
const DB = read("lib/db/traceability.ts");
const HARNESS3 = read("tests/db/pcr02_3_assertions.sql");
const PRELUDE = read("tests/db/harness-prelude.sql");
const RUNNER = read("tests/db/run-local-pg.sh");
const LOCK = "history_locked_at";

console.log("\nPCR-02.3 · Candado histórico — política ejecutada\n");

check("A.1 matriz PURA del candado (H1–H4): estado presente + condición histórica", () => {
  const someLock = "2026-08-13T10:00:00Z";
  // Nunca finalizadas: comportamiento histórico conservado.
  assert(orderDeletionBlockedMessage("draft", null) === null, "draft sin candado es eliminable");
  assert(orderDeletionBlockedMessage("in_progress", null) === null, "in_progress sin candado es eliminable");
  // Finalizadas: bloqueadas por estado.
  assert(orderDeletionBlockedMessage("closed", someLock) === ORDER_HISTORY_MESSAGE, "closed bloqueada");
  assert(orderDeletionBlockedMessage("cancelled", someLock) === ORDER_HISTORY_MESSAGE, "cancelled bloqueada");
  // REABIERTAS (el bypass): estado abierto + candado ⇒ bloqueadas.
  assert(
    orderDeletionBlockedMessage("in_progress", someLock) === ORDER_HISTORY_MESSAGE,
    "reabierta (in_progress + candado) bloqueada — el bypass queda cerrado"
  );
  assert(
    orderDeletionBlockedMessage("draft", someLock) === ORDER_HISTORY_MESSAGE,
    "cualquier estado con candado queda bloqueado (fail-closed)"
  );
  // Reapertura: solo estados finalizados.
  assert(orderReopenAllowed("closed") && orderReopenAllowed("cancelled"), "closed/cancelled se reabren");
  assert(!orderReopenAllowed("draft") && !orderReopenAllowed("in_progress"), "abiertas no se «reabren»");
  // Indicación de reabierta: candado + estado operativo abierto.
  assert(isReopenedHistoricalOrder("in_progress", someLock), "reabierta detectada");
  assert(!isReopenedHistoricalOrder("closed", someLock), "cerrada no es «reabierta»");
  assert(!isReopenedHistoricalOrder("in_progress", null), "sin candado no hay condición histórica");
  // Coherencia: el candado nunca RELAJA la política de mutación por estado.
  for (const st of ["draft", "in_progress", "closed", "cancelled"]) {
    if (orderMutationBlockedMessage(st)) {
      assert(orderDeletionBlockedMessage(st, null) !== null, `finalizada ${st} debe seguir no-eliminable`);
    }
  }
});

check("A.2 delete action: candado cargado y evaluado antes del delete; 23514 → mensaje semántico", () => {
  const body = fnBody(ACTIONS, "deleteProductionOrderAction");
  assert(body.includes('select("id, status, history_locked_at")'), "el select trae el candado");
  const guard = body.indexOf("orderDeletionBlockedMessage(");
  const del = body.indexOf(".delete()");
  assert(guard !== -1 && del !== -1 && guard < del, "la guarda (con candado) corre ANTES del delete");
  assert(
    body.includes("order.history_locked_at as string | null"),
    "la guarda recibe el candado real de la orden"
  );
  assert(body.includes("ORDER_HISTORY_MESSAGE"), "la barrera §2d en BD se traduce al mensaje semántico");
});

check("A.3 reapertura EXPLÍCITA: acción dedicada que valida transición y jamás toca el candado", () => {
  const body = fnBody(ACTIONS, "reopenProductionOrderAction");
  assert(body.includes("orderReopenAllowed(order.status"), "solo closed/cancelled se reabren");
  assert(body.includes('update({ status: "in_progress" })'), "la reapertura fija estado En proceso");
  assert(!body.includes(`${LOCK}:`), "la acción no escribe el candado (además la BD lo ignora)");
  assert(
    body.includes("Sigue formando parte del historial de trazabilidad y no puede eliminarse."),
    "el resultado explica la condición histórica"
  );
});

check("A.4 edición genérica vetada sobre finalizadas: la reapertura no es un select de estado", () => {
  const body = fnBody(ACTIONS, "updateProductionOrderAction");
  assert(body.includes('select("process_variables, status")'), "resuelve el estado actual");
  assert(body.includes("orderReopenAllowed(current.status"), "detecta órdenes finalizadas");
  assert(body.includes("usa «Reabrir orden»"), "redirige a la acción explícita");
});

check("A.5 UI: Reabrir en finalizadas, Editar solo abiertas, Eliminar por candado, aviso de reabierta", () => {
  assert(DETAIL.includes('label="Reabrir orden"'), "detalle: acción explícita de reapertura");
  assert(
    DETAIL.includes("{!orderDeletionBlockedMessage(order.status, order.history_locked_at) ? ("),
    "detalle: Eliminar condicionado por estado + candado"
  );
  assert(
    DETAIL.includes("Orden histórica reabierta"),
    "detalle: indicación discreta para la orden reabierta (§32)"
  );
  assert(DETAIL.includes("modo consulta / auditoría"), "detalle: consulta/auditoría conservada");
  assert(LIST.includes('label="Reabrir"'), "listado: reapertura explícita");
  assert(
    LIST.includes("{!orderDeletionBlockedMessage(o.status, o.history_locked_at) ? ("),
    "listado: Eliminar condicionado por estado + candado"
  );
  assert(
    DB.includes("history_locked_at, sites(name)"),
    "la capa de datos expone el candado en listado y detalle"
  );
});

console.log("\nPCR-02.3 · 0104 — candado en la base de datos\n");

check("B.1 §2c: columna del sistema con semántica documentada + activación BEFORE INSERT OR UPDATE", () => {
  assert(
    MIGRATION.includes("add column if not exists history_locked_at timestamptz"),
    "columna nullable (hot-compat §53)"
  );
  assert(
    MIGRATION.includes("PRIMERA entrada de la orden") || MIGRATION.includes("PRIMERA entrada al historial"),
    "semántica: primera entrada, no último cierre (§36)"
  );
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("create or replace function public.production_orders_history_lock"),
    MIGRATION.indexOf("drop trigger if exists t_production_orders_history_lock")
  );
  assert(fn.includes("security invoker"), "SECURITY INVOKER");
  assert(fn.includes("new.history_locked_at := old.history_locked_at"), "inmutable una vez asignado");
  assert(fn.includes("new.history_locked_at := null"), "un INSERT jamás lo fabrica");
  assert(
    fn.includes("new.status in ('closed', 'cancelled')"),
    "se activa al entrar en los estados finales reales"
  );
  assert(
    MIGRATION.includes("before insert or update on public.production_orders"),
    "el trigger cubre INSERT y UPDATE (SQL/API directa incluida)"
  );
});

check("B.2 §2c: backfill con evidencia inequívoca, ANTES del trigger (orden documentado)", () => {
  const colAt = MIGRATION.indexOf("add column if not exists history_locked_at");
  const backfillStatus = MIGRATION.indexOf("and status in ('closed', 'cancelled');");
  const backfillAudit = MIGRATION.indexOf("from public.audit_log al");
  const lockTrigger = MIGRATION.indexOf("create trigger t_production_orders_history_lock");
  assert(colAt !== -1 && backfillStatus !== -1 && backfillAudit !== -1 && lockTrigger !== -1, "bloques presentes");
  assert(
    colAt < backfillStatus && backfillStatus < backfillAudit && backfillAudit < lockTrigger,
    "orden columna → backfill → trigger (la columna del sistema descartaría el backfill si fuera al revés)"
  );
  assert(
    MIGRATION.includes("al.diff -> 'new' ->> 'status' in ('closed', 'cancelled')"),
    "el backfill 2/2 usa la evidencia del audit_log real (diff old/new)"
  );
  assert(
    MIGRATION.includes("activación técnica del candado") && MIGRATION.includes("se inventa nada"),
    "documenta que now() no es la fecha real de cierre y que sin evidencia no se marca nada (§9/§10)"
  );
});

check("B.3 §2d: el DELETE bloquea por estado O por candado, con el mensaje semántico único (§31)", () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("create or replace function public.production_orders_protect_history"),
    MIGRATION.indexOf("drop trigger if exists t_production_orders_protect_history")
  );
  assert(fn.includes("old.status in ('closed', 'cancelled')"), "condición por estado conservada");
  assert(fn.includes("or old.history_locked_at is not null"), "condición por candado añadida");
  assert(fn.includes(ORDER_HISTORY_MESSAGE), "mensaje semántico (closed, cancelled y reabiertas)");
  assert(fn.includes("Reabrir permite corregir") || MIGRATION.includes("reabrir permite corregir") || MIGRATION.includes("Reabrir permite corregir"), "el principio queda documentado");
});

check("B.4 comportamiento real ejecutado en PostgreSQL: S9.1–S9.11 (incluye RLS, auditoría y backfill)", () => {
  for (const probe of ["S9.1", "S9.2", "S9.3", "S9.4", "S9.5", "S9.6", "S9.7", "S9.8", "S9.9", "S9.10", "S9.11"]) {
    assert(HARNESS3.includes(probe), `la suite PostgreSQL debía cubrir ${probe}`);
  }
  assert(
    HARNESS3.includes("set local role authenticated"),
    "el bypass S9.9 corre con el rol autenticado real (§24/§48)"
  );
  assert(
    HARNESS3.includes("delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c1'"),
    "el caso central §46 ejecuta el DELETE real de la orden reabierta"
  );
  assert(PRELUDE.includes("diff jsonb"), "el arnés emula el esquema REAL del audit_log (0005)");
  assert(RUNNER.includes("pcr02_3_assertions.sql"), "el runner ejecuta la suite PCR-02.3");
});

console.log("\nPCR-02.3 · Conservación y reglas del sprint\n");

check("C.1 PCR-02.1/PCR-02.2 intactos: fail-closed, reasignación, autoconsumo y guardas", () => {
  for (const probe of [
    "cycle_edges",
    "truncated_branches",
    "output_batches_protect_reassignment",
    "output_batch_consumption_no_self",
    "PCR02_1_ORDER_WITHOUT_CONSUMPTION_CTE",
  ]) {
    assert(MIGRATION.includes(probe), `la 0104 conserva ${probe}`);
  }
  for (const fn of [
    "deleteBatchConsumptionAction",
    "deleteOutputConsumptionAction",
    "addBatchConsumptionAction",
    "addOutputConsumptionAction",
    "createOutputBatchAction",
    "deleteOutputBatchAction",
  ]) {
    assert(fnBody(ACTIONS, fn).includes("assertOrderAcceptsMutations"), `${fn} conserva su guarda`);
  }
});

check("C.2 migraciones: 0001–0103 intactas, la 0104 única; posteriores solo las autorizadas hasta el hotfix pgcrypto 0110", () => {
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
  assert(
    dir.filter((f) => /^01(0[5-9]|[1-9][0-9])/.test(f) && !knownLater.has(f)).length === 0,
    "no debe existir 0106+ ni 0105 desconocida"
  );
  assert(dir.some((f) => f.startsWith("0104_pcr02_")), "la 0104 sigue presente");
});

check("C.3 scripts registrados, versionado intacto y nada remoto (§56/§57)", () => {
  const pkg = JSON.parse(read("package.json"));
  assert(
    /^1\.0\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pkg.version),
    "package.json permanece dentro de la línea comercial v1.0.x (§56)"
  );
  assert(pkg.scripts["test:pcr02-3"] && pkg.scripts["test:pcr02-3-db"], "scripts PCR-02.3 registrados");
  assert(
    pkg.scripts["test:pcr02-1"] && pkg.scripts["test:pcr02-2"],
    "las suites previas se conservan"
  );
  for (const banned of ["supabase link", "db push", "vercel", "git push"]) {
    assert(!RUNNER.includes(banned), `el runner no debe contener ${banned}`);
  }
});

console.log(failures === 0 ? "\nPCR-02.3: todos los checks pasaron.\n" : `\nPCR-02.3: ${failures} fallos.\n`);
if (failures > 0) process.exit(1);
