/**
 * Trazaloop · Sprint PCR-02.2 — micro-hardening final.
 *
 * Hallazgo A (inmutabilidad de órdenes cerradas/canceladas ante DELETE) y
 * hallazgo B (completitud fail-closed ante ciclos y límite de profundidad).
 *
 * Los comportamientos de BD corren DE VERDAD en `npm run test:pcr02-2-db`
 * (tests/db/pcr02_2_assertions.sql: S7.A1–A7 + S8.B1–B10 + regresiones
 * R1/R2, sobre la 0104 real). Esta suite ejecuta la matriz PURA de la
 * política de eliminación y fija candados estructurales sobre el código
 * real (§42: nada se declara cerrado solo por existir un string — cada
 * candado apunta al comportamiento dentro del cuerpo real, y el
 * comportamiento en sí está cubierto por la suite PostgreSQL).
 *
 * Correr: npm run test:pcr02-2
 */
import fs from "node:fs";
import path from "node:path";
import {
  orderDeletionBlockedMessage,
  orderMutationBlockedMessage,
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
const HARNESS2 = read("tests/db/pcr02_2_assertions.sql");
const RUNNER = read("tests/db/run-local-pg.sh");

// PCR-02.3: mensaje unificado del candado histórico (vale también para
// órdenes reabiertas); el comportamiento PCR-02.2 (delete bloqueado) sigue
// intacto y ahora se expresa con este texto semántico.
const HISTORY_MESSAGE =
  "Esta orden ya forma parte del historial de trazabilidad y no puede eliminarse.";

console.log("\nPCR-02.2 · Hallazgo A — el historial no se elimina\n");

check("A.1 política de eliminación EJECUTADA con los 4 estados reales (§6)", () => {
  assert(orderDeletionBlockedMessage("draft") === null, "draft debe seguir siendo eliminable");
  assert(
    orderDeletionBlockedMessage("in_progress") === null,
    "in_progress conserva el comportamiento histórico"
  );
  assert(orderDeletionBlockedMessage("closed") === HISTORY_MESSAGE, "closed → mensaje de historial");
  assert(
    orderDeletionBlockedMessage("cancelled") === HISTORY_MESSAGE,
    "cancelled → mismo mensaje de historial"
  );
  // Coherencia con la matriz de mutaciones PCR-02.1: los estados que
  // bloquean eliminar son exactamente los que bloquean mutar.
  for (const st of ["draft", "in_progress", "closed", "cancelled"]) {
    assert(
      (orderDeletionBlockedMessage(st) !== null) === (orderMutationBlockedMessage(st) !== null),
      `política incoherente para ${st}`
    );
  }
});

check("A.2 server action: guarda de estado ANTES del delete + 23514 traducido (§7)", () => {
  const body = fnBody(ACTIONS, "deleteProductionOrderAction");
  const guard = body.indexOf("orderDeletionBlockedMessage");
  const del = body.indexOf(".delete()");
  assert(guard !== -1, "la acción usa la política de eliminación");
  assert(del !== -1 && guard < del, "la guarda corre ANTES del delete");
  assert(
    body.includes('select("id, status, history_locked_at")'),
    "resuelve estado real + candado histórico (PCR-02.3)"
  );
  assert(body.includes('"23514"'), "la barrera §2c en BD se traduce a mensaje claro");
  assert(body.includes('"23503"'), "el RESTRICT de salidas conserva su mensaje (sin ampliar permisos)");
});

check("A.3 UI: sin «Eliminar» sobre historial en detalle y listado; consulta/auditoría intacta (§8)", () => {
  const header = DETAIL.slice(DETAIL.indexOf("deleteProductionOrderAction", 100));
  assert(
    DETAIL.includes("{!orderDeletionBlockedMessage(order.status, order.history_locked_at) ? ("),
    "el Eliminar del detalle queda condicionado al estado Y al candado (PCR-02.3)"
  );
  assert(header.length > 0, "sanidad");
  assert(
    LIST.includes("{!orderDeletionBlockedMessage(o.status, o.history_locked_at) ? ("),
    "el Eliminar del listado queda condicionado al estado Y al candado (PCR-02.3)"
  );
  // La consulta/auditoría permanece: navegación y secciones del detalle.
  for (const probe of ["modo consulta / auditoría", "Materiales / lotes consumidos", "LinkedEvidenceList"]) {
    assert(DETAIL.includes(probe), `el detalle conserva ${probe}`);
  }
  // PCR-02.3: Editar SOLO en órdenes abiertas; la reapertura ya no pasa por
  // la edición genérica sino por la acción explícita «Reabrir orden».
  assert(DETAIL.includes("?edit=${order.id}"), "Editar existe para órdenes abiertas");
  assert(DETAIL.includes('label="Reabrir orden"'), "la reapertura es explícita en el detalle");
});

check("A.4 0104 §2c: trigger BEFORE DELETE, INVOKER, estados reales, mensaje único, revoke (§10/§38)", () => {
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("create or replace function public.production_orders_protect_history"),
    MIGRATION.indexOf("drop trigger if exists t_production_orders_protect_history")
  );
  assert(fn.includes("security invoker"), "SECURITY INVOKER (sin privilegios elevados)");
  assert(fn.includes("set search_path = public"), "search_path fijado");
  assert(fn.includes("old.status in ('closed', 'cancelled')"), "estados reales de 0025, sin estados nuevos");
  assert(fn.includes(HISTORY_MESSAGE), "mensaje funcional en español");
  assert(
    fn.includes("revoke execute on function public.production_orders_protect_history()"),
    "revoke de ejecución directa"
  );
  assert(
    MIGRATION.includes("before delete on public.production_orders"),
    "BEFORE DELETE: aborta antes de que arranque cualquier cascada"
  );
  // El motivo estructural queda documentado en la propia migración.
  assert(
    MIGRATION.includes("ON DELETE CASCADE") && MIGRATION.includes("historial"),
    "la migración documenta la relación con las cascadas"
  );
});

check("A.5 comportamiento real ejecutado en PostgreSQL: A1–A7 + no-cascada §14", () => {
  for (const probe of ["S7.A1", "S7.A2", "S7.A3", "S7.A4", "S7.A5", "S7.A6", "S7.A7"]) {
    assert(HARNESS2.includes(probe), `la suite PostgreSQL debía cubrir ${probe}`);
  }
  assert(
    HARNESS2.includes("el consumo histórico se perdió (cascada)"),
    "el test de no-cascada comprueba la supervivencia del consumo"
  );
  assert(
    HARNESS2.includes("set local role authenticated"),
    "el bypass A7 corre con el rol autenticado real (RLS + trigger juntos, §37)"
  );
  assert(RUNNER.includes("pcr02_2_assertions.sql"), "el runner ejecuta la suite PCR-02.2");
});

console.log("\nPCR-02.2 · Hallazgo B — completitud fail-closed\n");

check("B.1 0104 §4: ciclos REGISTRADOS (no solo omitidos) y truncamiento detectado (§21/§22)", () => {
  const viewStart = MIGRATION.indexOf("create or replace view public.v_output_batch_completeness");
  const view = MIGRATION.slice(viewStart, MIGRATION.indexOf("v_implementation_next_actions", viewStart));
  assert(view.includes("cycle_edges"), "CTE de ramas cíclicas presente");
  assert(
    view.includes("where ob.production_order_id = any (ou.path)"),
    "el ciclo se detecta contra el camino acumulado"
  );
  assert(view.includes("truncated_branches"), "CTE de truncamiento por profundidad presente");
  assert(view.includes("ou.depth = 10"), "el truncamiento se evalúa EN el límite");
  // Fail-closed: ambos invalidan proveedor Y material.
  const supplier = view.slice(view.indexOf("as chain_supplier_ok") - 600, view.indexOf("as chain_supplier_ok"));
  const material = view.slice(view.indexOf("as chain_material_ok") - 600, view.indexOf("as chain_material_ok"));
  for (const [name, seg] of [["chain_supplier_ok", supplier], ["chain_material_ok", material]] as const) {
    assert(seg.includes("cycle_edges"), `${name} exige ausencia de ciclos`);
    assert(seg.includes("truncated_branches"), `${name} exige recorrido no truncado`);
  }
  // La protección operacional de la recursión NO se debilitó (§20/§30).
  assert(view.includes("ou.depth < 10"), "el límite de profundidad de la recursión se conserva");
  assert(view.includes("with recursive order_upstream"), "el cierre recursivo se conserva");
  // Semántica documentada: los cuatro desenlaces (§24).
  for (const probe of ["RAÍZ VÁLIDA", "DEAD END", "CICLO", "LÍMITE DE PROFUNDIDAD", "FAIL-CLOSED"]) {
    assert(MIGRATION.includes(probe), `la migración documenta ${probe}`);
  }
});

check("B.2 contrato público intacto: mismas columnas y etiquetas; señales internas al CTE (§23)", () => {
  const viewStart = MIGRATION.indexOf("create or replace view public.v_output_batch_completeness");
  const view = MIGRATION.slice(viewStart, MIGRATION.indexOf("v_implementation_next_actions", viewStart));
  for (const col of [
    "has_order", "has_consumption", "has_composition", "has_supplier_info",
    "has_material_info", "consumed_mass_kg", "composition_mass_kg",
    "mass_balance_warning", "missing_items", "traceability_status",
  ]) {
    assert(view.includes(col), `columna pública ${col} conservada`);
  }
  // Las señales nuevas NO se exponen como columnas públicas.
  const publicSelect = view.slice(view.lastIndexOf("select\n  ob.organization_id"));
  assert(
    !publicSelect.includes("cycle") && !publicSelect.includes("truncated"),
    "cycle/truncated permanecen internas al CTE"
  );
});

check("B.3 comportamiento real ejecutado en PostgreSQL: B1–B10 + regresiones R1/R2 (§27/§28/§29)", () => {
  for (const probe of ["S8.B1", "S8.B2+B9", "S8.B3+B10", "S8.B4+B5", "S8.B6", "S8.B7", "S8.B8", "S8.R1", "S8.R2"]) {
    assert(HARNESS2.includes(probe), `la suite PostgreSQL debía cubrir ${probe}`);
  }
  // PURE_INTERNAL_CYCLE_MUST_NOT_BE_COMPLETE y DEPTH_LIMIT_MUST_FAIL_CLOSED:
  // ambas comprueban traceability_status, no solo que la consulta termina.
  assert(
    HARNESS2.includes("ciclo interno puro esperaba incomplete"),
    "el test del ciclo verifica el estatus semántico"
  );
  assert(
    HARNESS2.includes("raíz fuera del límite esperaba incomplete (fail-closed)"),
    "el test de profundidad verifica el estatus semántico"
  );
});

console.log("\nPCR-02.2 · Conservación PCR-02.1 y reglas del sprint\n");

check("C.1 PCR-02.1 intacto: guardas, triggers y selectores no se debilitaron (§31–35)", () => {
  const noSelf = MIGRATION.slice(
    MIGRATION.indexOf("create or replace function public.output_batch_consumption_no_self"),
    MIGRATION.indexOf("comment on function public.output_batch_consumption_no_self")
  );
  assert(
    noSelf.includes("security invoker") && noSelf.includes("and organization_id = new.organization_id"),
    "trigger anti-autoconsumo conserva invoker + filtro de empresa"
  );
  assert(
    MIGRATION.includes("output_batches_protect_reassignment"),
    "la protección de reasignación se conserva"
  );
  for (const fn of [
    "deleteBatchConsumptionAction",
    "deleteOutputConsumptionAction",
    "addBatchConsumptionAction",
    "addOutputConsumptionAction",
    "createOutputBatchAction",
    "deleteOutputBatchAction",
  ]) {
    assert(
      fnBody(ACTIONS, fn).includes("assertOrderAcceptsMutations"),
      `${fn} conserva su guarda PCR-02.1`
    );
  }
  assert(
    MIGRATION.includes("PCR02_1_ORDER_WITHOUT_CONSUMPTION_CTE"),
    "la vista de implementación (ambos orígenes) se conserva"
  );
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
  ]);
  assert(
    dir.filter((f) => /^01(0[5-9]|[1-9][0-9])/.test(f) && !knownLater.has(f)).length === 0,
    "no debe existir 0106+ ni 0105 desconocida"
  );
  assert(dir.some((f) => f.startsWith("0104_pcr02_")), "la 0104 sigue presente");
});

check("C.3 sin comandos remotos en el arnés; package.json versionado intacto (§50/§57)", () => {
  for (const banned of ["supabase link", "db push", "vercel", "git push"]) {
    assert(!RUNNER.includes(banned), `el runner no debe contener ${banned}`);
  }
  const pkg = JSON.parse(read("package.json"));
  assert(
    /^1\.0\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pkg.version),
    "package.json permanece dentro de la línea comercial v1.0.x (§50)"
  );
  assert(pkg.scripts["test:pcr02-1"] && pkg.scripts["test:pcr02-1-db"], "scripts PCR-02.1 conservados (§44)");
  assert(pkg.scripts["test:pcr02-2"] && pkg.scripts["test:pcr02-2-db"], "scripts PCR-02.2 registrados (§44)");
});

console.log(failures === 0 ? "\nPCR-02.2: todos los checks pasaron.\n" : `\nPCR-02.2: ${failures} fallos.\n`);
if (failures > 0) process.exit(1);
