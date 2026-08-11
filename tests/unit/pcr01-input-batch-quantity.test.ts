/**
 * Trazaloop · Sprint PCR-01 · Punto 10 — cantidad OBLIGATORIA en lotes de
 * entrada nuevos. Ejercita la validación PURA (lib/domain) con el mensaje
 * exacto, y verifica estáticamente el trigger de BD (0103), el formulario y
 * la importación CSV. La inserción real contra BD queda BLOCKED en la matriz.
 *
 * Correr: npm run test:pcr01-input-batch-quantity
 */
import fs from "node:fs";
import path from "node:path";
import {
  validateInputBatchValues,
  INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE,
} from "../../lib/domain/traceability-validation";

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

const BASE = {
  batch_code: "LOTE-001",
  supplier_id: "s-1",
  material_id: "m-1",
  received_date: "2026-07-01",
};

console.log("PCR-01 · Cantidad obligatoria del lote de entrada (punto 10)");

check("1. Mensaje exacto pactado con el cliente", () => {
  assert(
    INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE ===
      "La cantidad del lote es obligatoria y debe ser mayor que 0 kg.",
    "el mensaje canónico no coincide con el pactado"
  );
});

check("2. Cantidad vacía → rechazada con el mensaje exacto", () => {
  const error = validateInputBatchValues({ ...BASE, quantity_kg: "" });
  assert(error === INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE, `mensaje inesperado: ${error}`);
});

check("3. Cantidad 0 → rechazada", () => {
  assert(
    validateInputBatchValues({ ...BASE, quantity_kg: "0" }) ===
      INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE,
    "0 kg debía rechazarse"
  );
});

check("4. Cantidad negativa → rechazada", () => {
  assert(
    validateInputBatchValues({ ...BASE, quantity_kg: "-3.5" }) ===
      INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE,
    "los negativos debían rechazarse"
  );
});

check("5. Cantidad no numérica → rechazada", () => {
  assert(
    validateInputBatchValues({ ...BASE, quantity_kg: "diez" }) ===
      INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE,
    "texto no numérico debía rechazarse"
  );
});

check("6. Cantidad decimal válida → aceptada", () => {
  assert(
    validateInputBatchValues({ ...BASE, quantity_kg: "1250.75" }) === null,
    "una cantidad válida no debía dar error"
  );
});

check("7. Los demás obligatorios se conservan (sin regresión)", () => {
  assert(
    validateInputBatchValues({ ...BASE, batch_code: "", quantity_kg: "10" }) ===
      "El código del lote es obligatorio.",
    "el código seguía siendo obligatorio"
  );
  assert(
    validateInputBatchValues({ ...BASE, supplier_id: null, quantity_kg: "10" }) ===
      "El proveedor es obligatorio.",
    "el proveedor seguía siendo obligatorio"
  );
});

check("8. La server action usa la validación pura compartida", () => {
  const actions = readSource("../../server/actions/traceability.ts");
  assert(
    actions.includes("validateInputBatchValues"),
    "server/actions/traceability.ts debía importar la validación de lib/domain"
  );
  assert(
    actions.includes("quantity_kg: Number(v.quantity_kg)"),
    "la cantidad debía persistirse siempre como número (nunca NULL en filas nuevas)"
  );
});

check("9. El formulario marca la cantidad como obligatoria", () => {
  const form = readSource("../../components/domain/traceability/forms.tsx");
  assert(form.includes('label="Cantidad (kg)"'), "la etiqueta ya no debía decir (opcional)");
  assert(!form.includes("Cantidad kg (opcional)"), "no debía quedar la etiqueta opcional");
  const quantityField = form.slice(form.indexOf('label="Cantidad (kg)"'), form.indexOf('label="Cantidad (kg)"') + 400);
  assert(quantityField.includes("required"), "el campo debía llevar required nativo");
});

check("10. Trigger de BD en INSERT y UPDATE con la semántica PCR-01.1 (0103)", () => {
  // PCR-01.1 (blocker 2): INSERT exige cantidad válida; en UPDATE, si la
  // cantidad CAMBIA (IS DISTINCT FROM), el nuevo valor debe ser válido —
  // un lote no puede degradarse a NULL/0/negativo tras crearse. Un lote
  // legacy con NULL sigue siendo editable en otros campos (la cantidad no
  // cambia → pasa) y corregible a un valor válido. Los escenarios contra
  // PostgreSQL real quedan BLOCKED en la matriz (§D).
  const migration = readSource(
    "../../supabase/migrations/0103_pcr01_effective_plan_and_input_batch_quantity.sql"
  );
  assert(
    migration.includes("La cantidad del lote es obligatoria y debe ser mayor que 0 kg."),
    "el trigger debía usar el mensaje exacto"
  );
  assert(
    migration.includes("before insert or update on public.input_batches"),
    "el trigger debía cubrir INSERT y UPDATE (blocker 2: la cantidad no puede degradarse)"
  );
  const fn = migration.slice(
    migration.indexOf("create or replace function public.input_batches_require_quantity"),
    migration.indexOf("comment on function public.input_batches_require_quantity")
  );
  assert(
    /tg_op = 'INSERT'/.test(fn) && /new\.quantity_kg is null or new\.quantity_kg <= 0/.test(fn),
    "INSERT: NULL/0/negativo debían rechazarse"
  );
  assert(
    /tg_op = 'UPDATE'/.test(fn) &&
      fn.includes("new.quantity_kg is distinct from old.quantity_kg"),
    "UPDATE: solo se valida cuando la cantidad CAMBIA (IS DISTINCT FROM) — válido→NULL/0/negativo rechazado; legacy NULL→NULL editando otro campo permitido; NULL→válido permitido"
  );
  assert(
    !/alter table public\.input_batches[\s\S]{0,200}not null/i.test(migration),
    "no debía agregarse NOT NULL a la columna (protegería mal los datos legacy)"
  );
});

check("11. La importación CSV también exige la cantidad (ambos motores)", () => {
  const validators = readSource("../../lib/imports/validators.ts");
  const templates = readSource("../../lib/imports/templates.ts");
  assert(
    validators.includes("INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE"),
    "el validador lib/imports debía usar el mensaje canónico"
  );
  assert(
    templates.includes('{ key: "quantity_kg", required: true'),
    "la plantilla lib/imports debía marcar quantity_kg como obligatoria"
  );
});

check("12. El importador REAL de /traceability/input-batches exige la cantidad (PCR-01.1, blocker 1)", () => {
  // La página usa ImportWizard → server/actions/import.ts (NO lib/imports):
  // este candado falla si alguien vuelve a permitir cantidad vacía en el
  // flujo realmente consumido por la aplicación.
  const page = readSource("../../app/(app)/(shell)/(cpr)/traceability/input-batches/page.tsx");
  assert(page.includes("ImportWizard"), "la página debía seguir usando ImportWizard");
  const wizard = readSource("../../components/domain/import/import-wizard.tsx");
  assert(
    wizard.includes("@/server/actions/import") || wizard.includes("server/actions/import"),
    "ImportWizard debía consumir server/actions/import.ts (el importador real)"
  );
  const importer = readSource("../../server/actions/import.ts");
  assert(
    importer.includes("INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE"),
    "server/actions/import.ts debía usar el mensaje canónico de lib/domain"
  );
  const block = importer.slice(
    importer.indexOf('if (entity === "input_batches")'),
    importer.indexOf("return errors;")
  );
  assert(
    /quantity === ""\s*\|\|\s*Number\.isNaN\(n\)\s*\|\|\s*n <= 0/.test(block),
    "vacío, no numérico, 0 y negativo debían rechazarse en el importador real"
  );
  assert(
    !/if \(quantity !== ""\) \{/.test(block),
    "no debía quedar la validación condicional que dejaba pasar cantidad vacía"
  );
  // La revalidación previa al commit reutiliza validateRows: mismo criterio.
  assert(
    importer.split("validateRows(entity, rows, org.organizationId)").length - 1 >= 2,
    "validateImportAction y commitImportAction debían compartir validateRows (validación + revalidación pre-commit)"
  );
  assert(
    importer.includes("quantity_kg: Number(row.quantity_kg)"),
    "el commit no debía volver a mapear cantidad vacía a NULL"
  );
  assert(
    wizard.includes("quantity_kg es") && wizard.includes("obligatoria y debe ser mayor que 0"),
    "la ayuda del ImportWizard debía declarar la cantidad obligatoria"
  );
});

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones de cantidad obligatoria pasaron.");
