/**
 * Trazaloop · Sprint PCR-02 · Bloques C, D, E y §16 — consumo interno de
 * lotes producidos. Verificación ESTÁTICA de la migración 0104 real (tabla,
 * FK compuestas, RLS, triggers, anti-autoconsumo, vista de completitud) y
 * del código que la consume (acciones con validación multiempresa y de
 * estado; UI que distingue los dos orígenes). La ejecución contra PostgreSQL
 * queda BLOCKED en la matriz.
 *
 * Correr: npm run test:pcr02-internal-consumption
 */
import fs from "node:fs";
import path from "node:path";

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
function readSource(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

const MIGRATION = readSource(
  "../../supabase/migrations/0104_pcr02_internal_consumption_and_completeness.sql"
);
const MODEL_0025 = readSource("../../supabase/migrations/0025_traceability.sql");
const VIEWS_0026 = readSource("../../supabase/migrations/0026_traceability_views.sql");
const ACTIONS = readSource("../../server/actions/traceability.ts");
const DB = readSource("../../lib/db/traceability.ts");
const DETAIL = readSource(
  "../../app/(app)/(shell)/(cpr)/traceability/production-orders/[id]/page.tsx"
);

console.log("PCR-02 · Consumo interno de lotes producidos (Bloques C/D/E)");

check("1. La tabla output_batch_consumption existe con la forma pactada", () => {
  assert(
    MIGRATION.includes("create table public.output_batch_consumption"),
    "debía crearse la tabla"
  );
  for (const col of ["production_order_id uuid not null", "output_batch_id     uuid not null", "mass_kg             numeric(14,4) not null"]) {
    assert(MIGRATION.includes(col), `faltaba la columna: ${col}`);
  }
  assert(
    MIGRATION.includes("unique (production_order_id, output_batch_id)"),
    "un lote producido se registra UNA vez por orden consumidora"
  );
  assert(
    MIGRATION.includes("check (mass_kg > 0)"),
    "la masa consumida debe ser > 0"
  );
});

check("2. Multiempresa estructural: FK COMPUESTAS + unique(org,id) (regla 0024)", () => {
  assert(
    MIGRATION.includes("foreign key (organization_id, production_order_id)") &&
      MIGRATION.includes("references public.production_orders (organization_id, id)"),
    "FK compuesta hacia la orden consumidora"
  );
  assert(
    MIGRATION.includes("foreign key (organization_id, output_batch_id)") &&
      MIGRATION.includes("references public.output_batches (organization_id, id)"),
    "FK compuesta hacia el lote producido (cross-tenant imposible)"
  );
  assert(
    MIGRATION.includes("unique (organization_id, id)"),
    "unique(organization_id, id) obligatorio"
  );
  assert(
    MIGRATION.includes("on delete cascade") && MIGRATION.includes("on delete restrict"),
    "cascade al borrar la orden consumidora; restrict al borrar el lote (mismo criterio que batch_consumption)"
  );
});

check("3. Triggers estándar 0024 + auditoría", () => {
  for (const t of ["set_updated_at", "prevent_organization_id_change", "force_created_by", "audit_row_change"]) {
    assert(MIGRATION.includes(`execute function public.${t}()`), `faltaba el trigger ${t}`);
  }
});

check("4. Anti-autoconsumo: trigger en INSERT y UPDATE con mensaje en español", () => {
  assert(
    MIGRATION.includes("create or replace function public.output_batch_consumption_no_self"),
    "debía existir la función anti-autoconsumo"
  );
  assert(
    MIGRATION.includes("Una orden no puede consumir un lote producido por ella misma."),
    "mensaje pactado"
  );
  assert(
    MIGRATION.includes("before insert or update on public.output_batch_consumption"),
    "el trigger cubre INSERT y UPDATE"
  );
  assert(
    ACTIONS.includes("Una orden no puede consumir un lote producido por ella misma."),
    "la server action valida el autoconsumo ANTES de llegar al trigger (mejor error para el usuario)"
  );
});

check("5. RLS idéntica a batch_consumption (select miembro; escritura por rol)", () => {
  assert(MIGRATION.includes("alter table public.output_batch_consumption enable row level security"), "RLS habilitada");
  for (const p of [
    "output_batch_consumption_select",
    "output_batch_consumption_insert",
    "output_batch_consumption_update",
    "output_batch_consumption_delete",
  ]) {
    assert(MIGRATION.includes(`create policy ${p}`), `faltaba la política ${p}`);
  }
  assert(
    MIGRATION.includes("array['admin','quality','consultant']") &&
      MIGRATION.includes("array['admin','quality']"),
    "mismos roles que el resto de trazabilidad (0025)"
  );
});

check("6. Bloque C: NINGUNA restricción nueva de cardinalidad orden→salidas", () => {
  // 0025 no tiene unique sobre production_order_id en output_batches (1→N ya
  // soportado) y 0104 no debe introducirlo.
  const outputTable = MODEL_0025.slice(
    MODEL_0025.indexOf("create table public.output_batches"),
    MODEL_0025.indexOf("create index output_batches_org_idx")
  );
  assert(
    !/unique\s*\(\s*production_order_id\s*\)/.test(outputTable),
    "0025 nunca limitó a 1 salida por orden"
  );
  assert(
    !/alter table public\.output_batches/i.test(MIGRATION),
    "0104 no debía tocar output_batches (la cardinalidad 1→N ya existe)"
  );
});

check("7. Completitud: la vista agrega consumo EXTERNO + INTERNO con las mismas columnas", () => {
  assert(
    MIGRATION.includes("create or replace view public.v_output_batch_completeness"),
    "0104 reemplaza la vista"
  );
  assert(
    MIGRATION.includes("union all") &&
      MIGRATION.includes("from public.output_batch_consumption oc"),
    "el agregado de consumos une ambos orígenes"
  );
  // Compatibilidad §24: misma lista de columnas de salida que 0026 (nombres).
  const cols = [
    "organization_id",
    "output_batch_id",
    "output_batch_code",
    "production_order_id",
    "production_order_code",
    "product_id",
    "product_code",
    "product_name",
    "has_order",
    "has_consumption",
    "has_composition",
    "has_supplier_info",
    "has_material_info",
    "consumed_mass_kg",
    "composition_mass_kg",
    "produced_quantity_kg",
    "mass_balance_warning",
    "missing_items",
    "traceability_status",
  ];
  for (const c of cols) {
    assert(VIEWS_0026.includes(c), `columna ${c} debía existir en 0026`);
    assert(MIGRATION.includes(c), `columna ${c} debía conservarse en 0104`);
  }
  assert(
    MIGRATION.includes("'consumos de la orden'"),
    "missing_items refleja que el consumo puede ser externo o interno"
  );
  assert(
    MIGRATION.includes("security_invoker = true"),
    "la vista sigue siendo security_invoker (RLS de las bases aplica)"
  );
});

check("8. Acciones: validación multiempresa + estado + duplicado, y borrado acotado", () => {
  const add = ACTIONS.slice(
    ACTIONS.indexOf("export async function addOutputConsumptionAction"),
    ACTIONS.indexOf("export async function deleteOutputConsumptionAction")
  );
  assert(add.includes("requireActiveOrg"), "sesión de empresa activa");
  assert(add.includes("checkCprCanMutate"), "control de acceso comercial del módulo");
  assert(
    add.includes("assertOrderAcceptsMutations") &&
      add.includes('assertSameOrg("output_batches"'),
    "orden abierta de la empresa + lote de la empresa"
  );
  assert(add.includes('error.code === "23505"'), "duplicado con mensaje propio");
  assert(
    add.includes('success: "Consumo registrado correctamente."'),
    "confirmación inmediata (punto 14 conservado)"
  );
  const del = ACTIONS.slice(ACTIONS.indexOf("export async function deleteOutputConsumptionAction"));
  const delBody = del.slice(0, del.indexOf("\nexport "));
  assert(
    delBody.includes('.eq("organization_id", org.organizationId)'),
    "el borrado va acotado a la empresa activa"
  );
  // PCR-02.1 (hallazgo 1.B): el borrado interno además valida el ESTADO de
  // la orden antes de tocar la fila (candado endurecido, no relajado).
  assert(
    delBody.includes("assertOrderAcceptsMutations"),
    "el borrado interno valida el estado de la orden (PCR-02.1)"
  );
});

check("9. Bloque E: la UI distingue los DOS orígenes en una sola trazabilidad", () => {
  assert(
    DETAIL.includes("Lotes de entrada (externos)") &&
      DETAIL.includes("Lotes producidos internos"),
    "el detalle separa (y etiqueta) ambos orígenes"
  );
  assert(
    DETAIL.includes("Lote de entrada") && DETAIL.includes("Lote producido interno"),
    "cada consumo lleva su chip de origen"
  );
  assert(
    DETAIL.includes("OutputConsumptionForm") && DETAIL.includes("ConsumptionForm"),
    "ambos formularios conviven en la misma sección de consumos"
  );
  assert(
    DETAIL.includes("output_total_consumed_kg > c.produced_quantity_kg"),
    "advertencia de sobre-consumo del lote producido (advertir, no bloquear)"
  );
  assert(
    DB.includes("listInternalConsumption") && DB.includes("listConsumableOutputs"),
    "capa de datos dedicada, acotada a la organización"
  );
  assert(
    DB.includes('.neq("production_order_id", consumingOrderId)'),
    "el selector excluye los lotes producidos por la propia orden"
  );
});

check("10. El lote intermedio CONSERVA su identidad (no se duplica como entrada)", () => {
  assert(
    !ACTIONS.includes('from("input_batches").insert') ||
      !ACTIONS.slice(ACTIONS.indexOf("addOutputConsumptionAction")).includes('from("input_batches").insert'),
    "el consumo interno jamás crea un input_batch espejo"
  );
  assert(
    MIGRATION.includes("references public.output_batches"),
    "la relación apunta al MISMO lote producido"
  );
  assert(
    DB.includes("listForwardUsesForOutputs"),
    "el lote muestra dónde fue consumido después (identidad única, usos visibles)"
  );
});

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones de consumo interno pasaron.");
