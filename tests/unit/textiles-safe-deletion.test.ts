/**
 * Trazaloop · Sprint T9E (Textil) · Regresión de eliminación segura
 * (defecto 4.6): hard delete SOLO para registros propios, con rol
 * autorizado y CERO relaciones; con uso → motivo claro + desactivar.
 * La trazabilidad histórica jamás se destruye.
 *
 * Correr: npx tsx tests/unit/textiles-safe-deletion.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { canAdministerTextileCatalogs } from "../../lib/domain/textiles-catalogs";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const ADMIN = read("server/actions/textiles-catalogs-admin.ts");
const DB = read("lib/db/textiles-catalogs.ts");
const MANAGER = read("components/domain/textiles/catalog-manager.tsx");
const DIALOG = read("components/ui/confirm-dialog.tsx");

console.log("Trazaloop · T9E: política de eliminación en servidor\n");

check("1. Existen las 5 acciones de eliminación de catálogo + fibra personalizada", () => {
  for (const action of [
    "deleteTextileSupplierAction",
    "deleteTextileMaterialAction",
    "deleteTextileComponentAction",
    "deleteTextileProcessAction",
    "deleteTextileOutsourcedProcessAction",
    "deleteTextileCustomFiberAction",
  ]) {
    assert(ADMIN.includes(`export async function ${action}`), `falta ${action}`);
  }
});

check("2. Rol insuficiente → rechazado en SERVIDOR (no solo escondiendo el botón)", () => {
  assert(ADMIN.includes("canAdministerTextileCatalogs(g.ok.roleCode)"), "la action valida el rol");
  assert(ADMIN.includes("requiere rol administrador o calidad"), "mensaje claro de rol");
  assert(canAdministerTextileCatalogs("admin"), "admin puede");
  assert(canAdministerTextileCatalogs("quality"), "quality puede");
  assert(!canAdministerTextileCatalogs("consultant"), "consultant no puede");
});

check("3. Relaciones verificadas ANTES de borrar, con motivo y alternativa de desactivar", () => {
  assert(/const usage = await usageFor\(g\.ok\.organizationId, recordId\);\s*\n\s*if \(usage\.length > 0\)/.test(ADMIN), "el conteo de uso corre antes del delete");
  assert(ADMIN.includes("está en uso por"), "el motivo lista los usos");
  assert(ADMIN.includes("desactívalo en su lugar") || ADMIN.includes("Desactívalo en su lugar"), "se ofrece desactivar");
});

check("4. El delete filtra por organización del SERVIDOR y respalda con FK (23503)", () => {
  const deleteBlock = ADMIN.slice(ADMIN.indexOf("async function deleteCatalogRecord"));
  assert(deleteBlock.includes('.eq("organization_id", g.ok.organizationId)'), "cross-tenant imposible");
  assert(ADMIN.includes('"23503"'), "la violación de FK se traduce a mensaje seguro");
  // T9G (glosario §6): el mensaje visible dice «empresa»; la barrera (filtro
  // organization_id del SERVIDOR + FK) permanece idéntica.
  assert(ADMIN.includes("no existe o no pertenece a tu empresa"), "0 filas → mensaje sin filtrar existencia ajena");
});

check("5. Cobertura de relaciones por entidad (proveedor, material, componente, procesos)", () => {
  // Proveedor: materiales, componentes, tercerizados, lotes, pasos, evidencias.
  for (const table of [
    "textile_materials",
    "textile_components",
    "textile_outsourced_processes",
    "textile_input_lots",
    "textile_order_process_steps",
    "textile_evidence_links",
  ]) {
    assert(
      DB.slice(DB.indexOf("getTextileSupplierUsage")).includes(`"${table}"`),
      `el uso de proveedor debía contar ${table}`
    );
  }
  assert(DB.includes('countRows("textile_reference_materials"'), "material: referencias");
  assert(DB.includes("source_material_id: materialId"), "material: composición como fuente");
  assert(DB.includes('countRows("textile_reference_components"'), "componente: referencias");
  assert(DB.includes("outsourced_process_id: outsourcedProcessId"), "tercerizado: pasos de orden");
});

check("6. Ante un error de conteo se ASUME uso (jamás borrar sin verificación)", () => {
  assert(
    /if \(error\) \{[\s\S]{0,220}return 1;/.test(DB.slice(DB.indexOf("async function countRows"))),
    "countRows debía devolver >0 ante error"
  );
});

check("7. Sin eliminación destructiva de historia: lotes, órdenes, evaluaciones, pasaportes, evidencias", () => {
  for (const forbidden of [
    "textile_production_orders",
    "textile_input_lots",
    "textile_output_lots",
    "textile_circularity_assessments",
    "textile_technical_passports",
    "textile_evidences",
  ]) {
    assert(
      !new RegExp(`\\.from\\("${forbidden}"\\)\\s*\\n?\\s*\\.delete\\(`).test(ADMIN),
      `las acciones T9E no deben borrar ${forbidden}`
    );
  }
});

check("8. La BD conserva sus barreras: RLS delete admin/quality y protecciones de estado", () => {
  const mig73 = read("supabase/migrations/0073_textile_catalogs.sql");
  assert(
    (mig73.match(/for delete[\s\S]{0,120}has_org_role\(organization_id, array\['admin','quality'\]\)/g) ?? []).length === 5,
    "0073: delete de catálogos restringido a admin/quality"
  );
  const mig84 = read("supabase/migrations/0084_textile_technical_passports.sql");
  assert(
    /for delete[\s\S]{0,200}status = 'draft'/.test(mig84),
    "0084: los pasaportes solo se borran en borrador (generados/aprobados se conservan)"
  );
  const mig75 = read("supabase/migrations/0075_textile_evidences.sql");
  assert(
    /for delete[\s\S]{0,220}status <> 'accepted'/.test(mig75),
    "0075: las evidencias aceptadas jamás se borran"
  );
});

console.log("\nTrazaloop · T9E: UX de eliminación\n");

check("9. Diálogo de confirmación reutilizable y accesible (sin window.confirm)", () => {
  assert(!MANAGER.includes("window.confirm"), "el gestor no usa window.confirm");
  assert(MANAGER.includes("ConfirmDialog"), "usa el diálogo reutilizable");
  assert(DIALOG.includes('role="dialog"') && DIALOG.includes("aria-modal"), "el diálogo es accesible");
  assert(DIALOG.includes("Escape"), "cierra con Escape");
  assert(MANAGER.includes("Eliminar definitivamente"), "la confirmación explica que es permanente");
  assert(MANAGER.includes("no se puede deshacer"), "se explica el impacto");
});

check("10. El botón Eliminar solo aparece para roles autorizados (calculado en servidor)", () => {
  assert(MANAGER.includes("canDelete && deleteAction"), "el botón está condicionado");
  for (const slug of ["suppliers", "materials", "components", "processes", "outsourced-processes"]) {
    const page = read(`app/(app)/(shell)/textiles/catalogs/${slug}/page.tsx`);
    assert(
      page.includes("canDelete={canAdministerTextileCatalogs(org.roleCode)}"),
      `${slug}: canDelete se calcula con el rol del servidor`
    );
    assert(page.includes("deleteAction={deleteTextile"), `${slug}: pasa su acción de eliminación`);
  }
});

check("11. La desactivación sigue disponible en todos los catálogos", () => {
  assert(MANAGER.includes('row.isActive ? "Desactivar" : "Activar"'), "el toggle de activo se conserva");
  const actions = read("server/actions/textiles-catalogs.ts");
  assert(actions.includes("setTextileSupplierActiveAction"), "desactivar proveedor sigue existiendo");
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
