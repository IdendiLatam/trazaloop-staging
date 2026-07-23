/**
 * Trazaloop · Sprint T6.1 (Textil) · Verificación del hardening del estado
 * de trazabilidad y su recálculo operativo (24 puntos del encargo §14).
 * Ejecutar: npx tsx tests/traceability/textiles-traceability-hardening.test.ts
 */

import fs from "node:fs";
import path from "node:path";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(error as Error).message}`);
  }
}

const root = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const MIGRATION = "supabase/migrations/0079_textile_traceability_status_hardening.sql";
const migrationSql = read(MIGRATION);
const actionsSrc = read("server/actions/textiles-traceability.ts");
const dbSrc = read("lib/db/textiles-traceability.ts");

console.log("\nSprint T6.1 · Hardening del estado de trazabilidad\n");

// ---------------------------------------------------------------------------
console.log("— Migración 0079: alcance (puntos 1–6) —");

check("1. Existe 0079 y su rango sigue intacto", () => {
  // Actualizado en T7.1: el pin "todo lo posterior a 0078" (incluso como
  // lista) volvió a romper con cada sprint legítimo (0080, 0081…). Se fija
  // SOLO el slot propio, como ya se hizo en las suites T2.1–T7.
  assert(fs.existsSync(path.join(root, MIGRATION)), "falta 0079");
  const dir = path.join(root, "supabase/migrations");
  const slot = fs.readdirSync(dir).filter((f) => Number(f.slice(0, 4)) === 79);
  assert(
    JSON.stringify(slot.sort()) === JSON.stringify(["0079_textile_traceability_status_hardening.sql"]),
    `el rango 0079 cambió (hay: ${slot.join(", ")})`
  );
});

check("2-5. Solo funciones y triggers: sin tablas, políticas, circularidad, pasaporte, TrazaDocs ni planes", () => {
  assert(!/create table|drop table|create policy|drop policy|create view|drop view/i.test(migrationSql), "0079 solo debía crear funciones y triggers");
  const lower = migrationSql.toLowerCase();
  for (const term of ["textile_circular", "circularity", "textile_passport", "passport", "textile_trazadoc", "qr_", "blockchain", "module_access", "module_subscription", "carbon"]) {
    assert(!lower.includes(term), `0079 menciona "${term}" (fuera de alcance)`);
  }
});

check("6. No toca CPR: todos los objetivos de triggers son tablas textiles", () => {
  const targets = [...migrationSql.matchAll(/(?:insert|update|delete) on public\.(\w+)/g)].map((m) => m[1]);
  assert(targets.length > 0 && targets.every((t) => t.startsWith("textile_")), `objetivos: ${[...new Set(targets)].join(", ")}`);
  const withoutTextile = migrationSql.replace(/textile_[a-z_]+/g, "");
  for (const cpr of ["production_orders", "input_batches", "output_batches", "batch_consumption", "batch_composition"]) {
    assert(!withoutTextile.includes(cpr), `0079 no debía tocar la tabla CPR ${cpr}`);
  }
});

// ---------------------------------------------------------------------------
console.log("\n— Protección del campo (puntos 7–11) —");

check("7-8. Trigger de protección con IS DISTINCT FROM y flag transaccional interno", () => {
  assert(migrationSql.includes("protect_textile_output_lot_traceability_status"), "falta el trigger de protección");
  assert(migrationSql.includes("before update on public.textile_output_lots"), "debía ser BEFORE UPDATE");
  assert(migrationSql.includes("new.traceability_status is distinct from old.traceability_status"), "debía comparar con IS DISTINCT FROM");
  assert(migrationSql.includes("current_setting('trazaloop.textile_traceability_recalculate', true)"), "debía usar el flag transaccional interno");
  assert(migrationSql.includes("El estado de trazabilidad de un lote producido no puede modificarse directamente"), "falta el mensaje del encargo");
});

check("9-10. Solo el refresco controlado escribe el campo (flag local a la transacción)", () => {
  assert(migrationSql.includes("calculate_textile_output_lot_traceability_status"), "falta la función de cálculo");
  assert(migrationSql.includes("refresh_textile_output_lot_traceability_status"), "falta la función de refresco");
  assert(migrationSql.includes("refresh_textile_order_output_lots_traceability"), "falta el refresco por orden");
  // El flag se fija LOCAL a la transacción (tercer argumento true) y solo
  // dentro del refresco.
  assert(migrationSql.includes("set_config('trazaloop.textile_traceability_recalculate', 'on', true)"), "el flag debía ser local a la transacción");
  const setters = (migrationSql.match(/set_config\('trazaloop\.textile_traceability_recalculate', 'on', true\)/g) ?? []).length;
  assert(setters === 1, `solo el refresco controlado debía activar el flag (hay ${setters})`);
  // La única escritura del campo vive en el refresco.
  const writes = (migrationSql.match(/set traceability_status/g) ?? []).length;
  assert(writes === 1, `solo debía existir 1 UPDATE del campo (hay ${writes})`);
  // Y el código TS jamás lo escribe.
  assert(!actionsSrc.includes("traceability_status:"), "las actions no debían escribir traceability_status");
  assert(!dbSrc.includes("traceability_status:") || !/update\([^)]*traceability_status/.test(dbSrc), "la capa db no debía escribir traceability_status");
});

check("11. Ni formularios ni actions aceptan traceability_status del cliente", () => {
  assert(!actionsSrc.includes("traceabilityStatus"), "los inputs de las actions no debían incluir traceabilityStatus");
  const outputInput = actionsSrc.split("export type TextileOutputLotInput")[1]?.split("};")[0] ?? "";
  assert(!outputInput.includes("traceability"), "TextileOutputLotInput no debía incluir el estado");
  const detailPage = read("app/(app)/(shell)/textiles/traceability/output-lots/[id]/page.tsx");
  assert(!/key: "traceability/.test(detailPage), "el formulario del lote no debía ofrecer el campo");
});

// ---------------------------------------------------------------------------
console.log("\n— Recálculo operativo (puntos 12–18) —");

check("12-16. Triggers AFTER en consumos, procesos, lotes de entrada, órdenes y lotes finales", () => {
  assert(migrationSql.includes("after insert or update or delete on public.textile_order_consumptions"), "consumos sin trigger de recálculo");
  assert(migrationSql.includes("t_textile_order_process_steps_recalc"), "procesos sin trigger de recálculo");
  assert(migrationSql.includes("after update on public.textile_input_lots"), "lotes de entrada sin trigger de recálculo");
  assert(migrationSql.includes("after update on public.textile_production_orders"), "órdenes sin trigger de recálculo");
  assert(migrationSql.includes("after insert or update on public.textile_output_lots"), "lotes finales sin trigger de recálculo");
  // En UPDATE de consumo con cambio de orden, recalculan ambas órdenes.
  assert(migrationSql.includes("old.order_id is distinct from new.order_id"), "el cambio de orden debía recalcular la anterior y la nueva");
  // Sin recursión: el AFTER de output_lots ignora el cambio de traceability_status.
  const outputTrg = migrationSql.split("trg_textile_output_lot_recalc")[1]?.split("$$;")[0] ?? "";
  assert(!outputTrg.includes("old.traceability_status"), "el trigger de lotes finales no debía reaccionar a traceability_status (recursión)");
  assert(outputTrg.includes("old.quantity_produced is distinct from new.quantity_produced"), "el trigger debía reaccionar a campos operativos");
});

check("17. Los vínculos de evidencias recalculan los casos directos documentados", () => {
  assert(migrationSql.includes("after insert or delete on public.textile_evidence_links"), "vínculos sin trigger de recálculo");
  const trg = migrationSql.split("trg_textile_evidence_link_recalc()")[1]?.split("$$;")[0] ?? "";
  for (const e of ["output_lot", "production_order", "order_consumption", "order_process_step", "input_lot", "reference", "fiber_composition"]) {
    assert(trg.includes(`'${e}'`), `el trigger de vínculos debía cubrir ${e}`);
  }
  assert(migrationSql.includes("NO afectan las brechas") && migrationSql.includes("el botón manual cubre casos"), "los casos sin recálculo automático debían documentarse");
});

check("18. Sobreconsumo POSTERIOR detectado (cambiar quantity_received recalcula)", () => {
  const trg = migrationSql.split("trg_textile_input_lot_recalc")[1]?.split("$$;")[0] ?? "";
  assert(trg.includes("old.quantity_received is distinct from new.quantity_received"), "el trigger debía reaccionar a quantity_received");
  assert(trg.includes("old.unit is distinct from new.unit") && trg.includes("old.supplier_id is distinct from new.supplier_id"), "el trigger debía reaccionar a unit y supplier_id");
  // Y el cálculo detecta el saldo negativo resultante.
  assert(/> il\.quantity_received/.test(migrationSql), "el cálculo debía comparar consumido contra recibido");
});

// ---------------------------------------------------------------------------
console.log("\n— Acción manual y seguridad (puntos 19–22) —");

check("19. Acción y botón de recálculo manual (nunca eligen el estado)", () => {
  assert(actionsSrc.includes("recalculateTextileOutputLotTraceabilityAction"), "falta la action de recálculo");
  assert(actionsSrc.includes('supabase.rpc("recalculate_textile_output_lot_traceability"'), "la action debía llamar la RPC controlada");
  assert(actionsSrc.includes("textileOutputLotBelongsToOrg(g.ok.organizationId, outputLotId)"), "la action debía verificar pertenencia");
  const button = read("components/domain/textiles/recalculate-traceability-button.tsx");
  assert(button.includes("Recalcular estado"), "falta el botón");
  assert(!button.includes("select") && !button.includes("traceability_status"), "el botón no debía permitir elegir el estado");
  const detailPage = read("app/(app)/(shell)/textiles/traceability/output-lots/[id]/page.tsx");
  assert(detailPage.includes("RecalculateTraceabilityButton"), "el detalle debía mostrar el botón");
  assert(detailPage.includes("No equivale a certificación ni validación"), "falta la nota prudente");
});

check("20. Toda función SECURITY DEFINER de 0079 fija search_path y revoca execute", () => {
  const definers = (migrationSql.match(/security definer/g) ?? []).length;
  const searchPaths = (migrationSql.match(/set search_path = public/g) ?? []).length;
  assert(definers >= 7, `esperaba ≥7 funciones security definer (hay ${definers})`);
  assert(searchPaths >= definers, "toda función debía fijar search_path = public");
  const revokes = (migrationSql.match(/revoke execute on function/g) ?? []).length;
  assert(revokes >= 8, `todas las funciones debían revocar execute (hay ${revokes})`);
  // La única concedida a authenticated es la RPC manual, que valida sesión,
  // membresía y módulo habilitado (con module_code).
  const grants = [...migrationSql.matchAll(/grant execute on function public\.(\w+)/g)].map((m) => m[1]);
  assert(
    JSON.stringify(grants) === JSON.stringify(["recalculate_textile_output_lot_traceability"]),
    `solo la RPC manual debía concederse (hay: ${grants.join(", ")})`
  );
  const rpc = migrationSql.split("recalculate_textile_output_lot_traceability(p_output_lot_id uuid)")[1]?.split("$$;")[0] ?? "";
  assert(rpc.includes("auth.uid() is null"), "la RPC debía validar sesión");
  assert(rpc.includes("is_org_member(v_org)"), "la RPC debía validar membresía");
  assert(rpc.includes("module_code = 'textiles' and enabled"), "la RPC debía validar el módulo con module_code");
});

check("21-22. Sin service_role y sin debilitar RLS", () => {
  for (const [name, src] of [["actions", actionsSrc], ["db", dbSrc]] as const) {
    assert(!src.includes("SUPABASE_SERVICE_ROLE") && !src.includes("serviceRole") && !src.includes("createAdminClient"), `${name} usa service_role`);
  }
  assert(!/create policy|alter policy|drop policy|disable row level security/i.test(migrationSql), "0079 no debía tocar políticas RLS");
});

// ---------------------------------------------------------------------------
console.log("\n— Lenguaje y coherencia (puntos 23–24) —");

check("23. Sin promesas de certificación en los textos nuevos", () => {
  const button = read("components/domain/textiles/recalculate-traceability-button.tsx");
  const lower = (migrationSql + actionsSrc + button).toLowerCase();
  for (const term of ["producto certificado", "cumple automáticamente", "certificación garantizada", "pasaporte oficial", "aprobado por norma"]) {
    assert(!lower.includes(term), `texto prohibido: "${term}"`);
  }
});

check("24. El estado vivo (dominio TS) y el persistido (SQL) usan las mismas brechas", () => {
  // Los 4 estados y las 5 brechas existen en ambos lados.
  for (const st of ["not_started", "needs_review", "complete", "incomplete"]) {
    assert(migrationSql.includes(`'${st}'`), `el SQL debía producir ${st}`);
  }
  for (const marker of ["quantity_received", "supplier_id is null", "lower(trim(", "recycled_claim_support", "organic_claim_support", "composition_support", "step_type = 'outsourced'"]) {
    assert(migrationSql.includes(marker), `el SQL debía evaluar la brecha con ${marker}`);
  }
  // T6.1: el evaluador vivo restringe las brechas de referencia a los
  // vínculos de referencia/fibras — igual que el SQL.
  assert(dbSrc.includes('e.entityType === "reference" || e.entityType === "fiber_composition"'), "el evaluador vivo debía filtrar los vínculos como el SQL");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron\n`);
if (failed > 0) process.exit(1);
