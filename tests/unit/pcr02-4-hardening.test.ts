/**
 * Trazaloop · Sprint PCR-02.4 — Closed Order Structural Guard.
 *
 * Invariante nueva: MIENTRAS una orden esté closed/cancelled su estructura
 * de trazabilidad (consumos externos e internos, salidas y composición) no
 * puede crearse, modificarse ni eliminarse — ni por server action ni por
 * API directa de Supabase. Para corregirla hay que reabrirla explícitamente;
 * el candado histórico (PCR-02.3) permanece.
 *
 * Los comportamientos de BD corren DE VERDAD en `npm run test:pcr02-4-db`
 * (tests/db/pcr02_4_assertions.sql, S10.1–S10.9 sobre la 0104 real: matrices
 * §38–§41, reapertura §44, recierre §45, bypass RLS §42 bajo rol
 * authenticated y no-rotura de cascadas §54). Esta suite fija candados
 * ESTRUCTURALES sobre el código real para que ninguna regresión silenciosa
 * retire la guarda (§60: nada se declara cerrado solo por un string suelto).
 *
 * Correr: npm run test:pcr02-4
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
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  assert(start !== -1, `no se encontró ${name}`);
  const next = src.indexOf("export async function", start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}
function section(src: string, marker: string): string {
  const start = src.indexOf(marker);
  assert(start !== -1, `no se encontró la sección ${marker}`);
  return src.slice(start);
}

const MIG = read("supabase/migrations/0104_pcr02_internal_consumption_and_completeness.sql");
const ACTIONS = read("server/actions/traceability.ts");
const RUNNER = read("tests/db/run-local-pg.sh");
const DB_SUITE = read("tests/db/pcr02_4_assertions.sql");
const PAGE = read("app/(app)/(shell)/(cpr)/traceability/output-batches/page.tsx");
const DB_LIB = read("lib/db/traceability.ts");
const MSG = "La orden está cerrada o cancelada. Reábrela antes de modificar su trazabilidad.";

console.log("\nPCR-02.4 · §2e — guarda de dominio en la 0104");
check("assert_production_order_is_mutable existe, SECURITY INVOKER y con search_path fijo", () => {
  const fn = section(MIG, "create or replace function public.assert_production_order_is_mutable");
  const head = fn.slice(0, fn.indexOf("$$;"));
  assert(head.includes("security invoker"), "debe ser SECURITY INVOKER (§15)");
  assert(head.includes("set search_path = public"), "search_path fijo (§15)");
  assert(head.includes("po.organization_id = p_organization_id"), "acotada por organización (sin oracle cross-tenant)");
  assert(head.includes("po.status in ('closed', 'cancelled')"), "estados congelantes reales");
  assert(head.includes(MSG), "mensaje funcional uniforme (§16)");
  assert(head.includes("errcode = '23514'"), "errcode de check violation");
});
check("la guarda es ejecutable por authenticated (los triggers INVOKER corren como el rol que escribe)", () => {
  assert(
    MIG.includes("grant execute on function public.assert_production_order_is_mutable(uuid, uuid) to authenticated;"),
    "sin el grant, la RLS autorizada rompería con permission denied en lugar del mensaje de dominio"
  );
});
check("mensaje uniforme: aparece una única redacción para todas las tablas", () => {
  const occurrences = MIG.split(MSG).length - 1;
  assert(occurrences >= 3, `el mensaje pactado debe usarse en la guarda y en el reopen-only (hay ${occurrences})`);
  assert(!MIG.includes("Reábrala antes"), "una sola redacción (Reábrela), sin variantes");
});

console.log("\nPCR-02.4 · §2e — triggers de congelación por tabla");
check("consumption_structural_guard cubre OLD y NEW y protege AMBAS tablas de consumo", () => {
  const fn = section(MIG, "create or replace function public.consumption_structural_guard");
  const body = fn.slice(0, fn.indexOf("$$;"));
  assert(body.includes("old.production_order_id, old.organization_id"), "UPDATE/DELETE validan la orden del OLD");
  assert(body.includes("new.production_order_id, new.organization_id"), "INSERT/UPDATE validan la orden del NEW (mover consumo)");
  for (const t of ["t_batch_consumption_structural_guard", "t_output_batch_consumption_structural_guard"]) {
    assert(MIG.includes(`create trigger ${t}`), `falta ${t}`);
    const trg = section(MIG, `create trigger ${t}`);
    assert(trg.slice(0, 220).includes("before insert or update or delete"), `${t} debe cubrir I/U/D en BEFORE`);
  }
});
check("output_batches_structural_guard: I/D siempre; UPDATE solo si cambian campos ESTRUCTURALES", () => {
  const fn = section(MIG, "create or replace function public.output_batches_structural_guard");
  const body = fn.slice(0, fn.indexOf("$$;"));
  for (const col of ["production_order_id", "product_id", "produced_quantity_kg", "batch_code"]) {
    assert(body.includes(`new.${col} is distinct from old.${col}`), `columna estructural ${col} vigilada (§10/§47)`);
  }
  assert(MIG.includes("create trigger t_output_batches_structural_guard"), "trigger del lote");
  assert(
    MIG.includes("produced_date, characteristics, intended_application,") &&
      MIG.includes("storage_location, notes"),
    "la política DESCRIPTIVA queda documentada en la propia migración"
  );
});
check("batch_composition_structural_guard resuelve la orden productora vía el lote (OLD y NEW)", () => {
  const fn = section(MIG, "create or replace function public.batch_composition_structural_guard");
  const body = fn.slice(0, fn.indexOf("$$;"));
  assert(body.includes("old.output_batch_id") && body.includes("new.output_batch_id"), "cubre mover la composición de lote (§22)");
  assert(body.includes("ob.organization_id = old.organization_id"), "resolución acotada al tenant de la fila");
  assert(body.includes("if v_order is not null then"), "si el lote ya no existe (cascada legítima) no bloquea");
  assert(MIG.includes("create trigger t_batch_composition_structural_guard"), "trigger de composición");
});
check("production_orders: solo la transición PURA de reapertura sobre cerradas (§26–§28)", () => {
  const fn = section(MIG, "create or replace function public.production_orders_reopen_only_guard");
  const body = fn.slice(0, fn.indexOf("$$;"));
  assert(body.includes("old.status in ('closed', 'cancelled')"), "solo aplica a estados congelantes");
  for (const excl of ["'status'", "'updated_at'", "'history_locked_at'"]) {
    assert(body.includes(`- ${excl}`), `la comparación excluye el campo del sistema ${excl}`);
  }
  assert(body.includes("new.status <> 'in_progress'"), "la única transición de salida es la reapertura");
  assert(MIG.includes("create trigger t_production_orders_reopen_only_guard"), "trigger reopen-only");
});
check("conservación §2a–§2d: no_self, reasignación, candado histórico y delete histórico siguen en la 0104", () => {
  for (const t of [
    "t_output_batch_consumption_no_self",
    "t_output_batches_protect_reassignment",
    "t_production_orders_history_lock",
    "t_production_orders_protect_history",
  ]) {
    assert(MIG.includes(t), `falta ${t}`);
  }
  assert(MIG.includes("cycle_edges") && MIG.includes("truncated_branches"), "completitud PCR-02.2 intacta");
});

console.log("\nPCR-02.4 · server actions (S1–S12)");
check("S2 · updateBatchConsumptionAction exige orden mutable (hallazgo 1)", () => {
  const body = fnBody(ACTIONS, "updateBatchConsumptionAction");
  assert(body.includes("assertOrderAcceptsMutations"), "guarda de estado presente");
  // PCR-02.5 amplió el select con input_batch_id y mass_kg (tope de saldo
  // al editar, §12); la resolución de la orden ANTES de escribir se conserva.
  assert(
    body.includes('select("id, production_order_id, input_batch_id, mass_kg")'),
    "resuelve la orden del consumo (y su lote/masa para el saldo) antes de escribir"
  );
});
check("S1/S3–S9 · los ocho mutadores PCR-02.1 conservan su guarda", () => {
  for (const name of [
    "addBatchConsumptionAction",
    "deleteBatchConsumptionAction",
    "addOutputConsumptionAction",
    "deleteOutputConsumptionAction",
    "createOutputBatchAction",
    "deleteOutputBatchAction",
  ]) {
    assert(fnBody(ACTIONS, name).includes("assertOrderAcceptsMutations"), `${name} sin guarda`);
  }
});
check("S9 + política §10 · updateOutputBatchAction: campos estructurales exigen orden mutable", () => {
  const body = fnBody(ACTIONS, "updateOutputBatchAction");
  assert(body.includes("structuralChange"), "distingue cambio estructural de descriptivo");
  for (const frag of ["production_order_id !== v.production_order_id", "product_id !== v.product_id", "quantityChanged", "batch_code !== v.batch_code"]) {
    assert(body.includes(frag), `campo estructural sin vigilar: ${frag}`);
  }
  assert(body.includes("t_audit_output_batches"), "la política descriptiva queda documentada junto al código");
  assert((body.match(/assertOrderAcceptsMutations/g) ?? []).length >= 3, "estructural + reasignación (origen y destino)");
});
check("S10–S12 · composición: las tres acciones resuelven la orden productora (hallazgo §11)", () => {
  for (const name of ["addBatchCompositionAction", "updateBatchCompositionAction", "deleteBatchCompositionAction"]) {
    assert(fnBody(ACTIONS, name).includes("assertOutputBatchOrderAcceptsMutations"), `${name} sin guarda de orden productora`);
  }
  const helper = ACTIONS.slice(ACTIONS.indexOf("async function assertOutputBatchOrderAcceptsMutations"));
  assert(helper.includes("production_order_id") && helper.includes("assertOrderAcceptsMutations"), "el helper delega en la guarda central (sin duplicar state logic, §7)");
});
check("la reapertura sigue siendo una transición pura desde la UI (§28–§29)", () => {
  const body = fnBody(ACTIONS.includes("reopenProductionOrderAction") ? ACTIONS : read("server/actions/production.ts"), "reopenProductionOrderAction");
  assert(body.includes('status: "in_progress"'), "reabre a in_progress");
  assert(!body.includes("order_code:"), "no reescribe datos productivos en la misma sentencia");
});

console.log("\nPCR-02.4 · UI /traceability/output-batches (§12/§49/§50)");
check("el listado y el detalle del lote exponen el estado de la orden productora", () => {
  assert((DB_LIB.match(/production_orders\(order_code, status\)/g) ?? []).length >= 2, "ambos selects (listado y OUTPUT_BATCH_SELECT) piden status");
  assert(DB_LIB.includes("production_order_status"), "OutputBatch expone production_order_status");
});
check("con la orden productora cerrada la página congela Eliminar lote, alta y borrado de composición", () => {
  assert(PAGE.includes("orderMutationBlockedMessage(b.production_order_status)"), "condición de congelación en la página");
  const frozenNote = "la composición se consulta en";
  assert(PAGE.includes(frozenNote), "aviso de modo auditoría con invitación a reabrir");
  const deleteBatch = PAGE.indexOf("deleteOutputBatchAction");
  assert(deleteBatch !== -1 && PAGE.lastIndexOf("orderMutationBlockedMessage", deleteBatch) !== -1, "Eliminar lote condicionado");
  const deleteComp = PAGE.indexOf("deleteBatchCompositionAction", PAGE.indexOf("Composición del lote"));
  assert(deleteComp !== -1, "botón de composición localizado");
  const guardBefore = PAGE.lastIndexOf("orderMutationBlockedMessage", deleteComp);
  assert(guardBefore !== -1 && deleteComp - guardBefore < 400, "Eliminar composición condicionado por la congelación");
  assert(PAGE.includes("Genealogía"), "consulta y genealogía permanecen (§12)");
});
check("mensaje de dominio: cerrada Y cancelada bloquean; abiertas no", () => {
  assert(orderMutationBlockedMessage("closed") !== null, "closed bloquea");
  assert(orderMutationBlockedMessage("cancelled") !== null, "cancelled bloquea");
  assert(orderMutationBlockedMessage("in_progress") === null, "in_progress permite");
  assert(orderMutationBlockedMessage("draft") === null, "draft permite");
});

console.log("\nPCR-02.4 · arnés PostgreSQL y migraciones");
check("el runner encadena la suite 7/7 y la suite S10 cubre matrices, RLS, reapertura y recierre", () => {
  assert(RUNNER.includes("pcr02_4_assertions.sql"), "runner sin la suite PCR-02.4");
  for (const s of ["S10.1", "S10.2", "S10.3", "S10.4", "S10.5", "S10.6", "S10.7", "S10.8", "S10.9"]) {
    assert(DB_SUITE.includes(`✔ ${s}`), `falta el escenario ${s}`);
  }
  assert(DB_SUITE.includes("set local role authenticated"), "el bypass §42 se prueba bajo rol authenticated");
  assert(DB_SUITE.includes(MSG), "la suite verifica el mensaje pactado literal");
  assert(DB_SUITE.includes("history_locked_at"), "verifica que el candado histórico permanece");
});
check("fixtures con ciclo de vida realista: se construye ABIERTA y se cierra después", () => {
  const s5 = read("tests/db/pcr02_1_assertions.sql");
  assert(s5.includes("'OC-1', current_date, 'in_progress'"), "OC-1 nace abierta");
  assert(s5.includes("update production_orders set status = 'closed'\n where id = 'cccccccc-4444-0000-0000-000000000001'"), "OC-1 se cierra tras construirse");
  const s7 = read("tests/db/pcr02_2_assertions.sql");
  assert(s7.includes("'OP-CLOSED-C', current_date, 'in_progress'"), "S7.A5 nace abierta");
  assert(s7.includes("'OP-CLOSED-2', current_date, 'in_progress'"), "S7.A6 nace abierta");
});
check("secuencia de migraciones: 0001–0103 intactas de nombre, 0104 única, sin 0105+", () => {
  const dir = fs.readdirSync(path.join(__dirname, "..", "..", "supabase", "migrations")).sort();
  // La frontera de PCR-02.4 fue la 0104; el único sprint posterior
  // autorizado es PCR-02.5 (0105), verificado por su propia suite.
  const later = dir.filter((f) => Number(f.slice(0, 4)) > 104);
  // Posteriores AUTORIZADAS: 0105 (PCR-02.5) y el bloque PCR-03 reservado
  // por su brief (0106/0107/0108). Cualquier otra sigue vetada.
  const allowedLater = new Set([
    "0105_pcr025_inventory_and_quantity_guards.sql",
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
  ]);
  const intruders = later.filter((f) => !allowedLater.has(f));
  assert(intruders.length === 0, `tras la 0104 solo 0105 y el bloque PCR-03: ${intruders.join(", ")}`);
  assert(dir.filter((f) => f.startsWith("0104")).length === 1, "una única 0104");
});
check("higiene del sprint: scripts registrados, sin comandos remotos, sin version bump", () => {
  const pkg = JSON.parse(read("package.json"));
  assert(
    /^1\.0\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pkg.version),
    "package.json permanece dentro de la línea comercial v1.0.x (§64)"
  );
  assert(pkg.scripts["test:pcr02-4"] && pkg.scripts["test:pcr02-4-db"], "scripts PCR-02.4 registrados");
  assert(String(pkg.scripts["test:all"]).includes("test:pcr02-4"), "test:all incluye la suite");
  for (const banned of ["supabase link", "db push", "vercel", "git push"]) {
    assert(!RUNNER.includes(banned), `el runner no debe contener ${banned}`);
  }
});

console.log(failures === 0 ? "\nPCR-02.4: todos los checks pasaron.\n" : `\nPCR-02.4: ${failures} fallos.\n`);
if (failures > 0) process.exit(1);
