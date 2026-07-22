/**
 * Trazaloop · Sprint T9C.1 (Textil) · Hardening UX de la creación del pasaporte:
 * la evaluación de circularidad debe corresponder a la referencia/SKU, y el
 * aviso de generación fallida no debe perderse — inspección de código.
 * Correr: npx tsx tests/passports/textiles-passports-ui-hardening.test.ts
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const createForm = read("components/textiles/passports/passport-create-form.tsx");
const newPage = read("app/(app)/(shell)/textiles/passports/new/page.tsx");
const detailPage = read("app/(app)/(shell)/textiles/passports/[id]/page.tsx");
const actionsSrc = read("server/actions/textiles-passport.ts");
const dbSrc = read("lib/db/textiles-passport.ts");

console.log("\nSprint T9C.1 · Hardening de circularidad y mensajes de creación\n");

check("1. El tipo de opción de evaluación incluye referenceId", () => {
  assert(/type AssessmentOpt = \{[^}]*referenceId/.test(createForm), "AssessmentOpt debe incluir referenceId para poder filtrar");
});

check("2. La UI filtra las evaluaciones por la referencia elegida (como los lotes)", () => {
  assert(/compatibleAssessments/.test(createForm), "falta el filtrado de evaluaciones compatibles");
  assert(/assessments\.filter\(\(a\) => a\.referenceId === referenceId\)/.test(createForm), "las evaluaciones deben filtrarse por referenceId");
  // El selector recorre las compatibles, no todas.
  assert(/compatibleAssessments\.map\(/.test(createForm), "el selector debe recorrer las evaluaciones compatibles");
  assert(!/\{assessments\.map\(/.test(createForm), "el selector no debe recorrer todas las evaluaciones sin filtrar");
});

check("3. El selector de evaluación se deshabilita sin referencia y muestra vacío", () => {
  // Bloque del selector de circularidad.
  const block = createForm.slice(createForm.indexOf('id="assessment"'));
  assert(/disabled=\{!referenceId\}/.test(block), "el selector de evaluación debe deshabilitarse sin referencia");
  assert(/No hay evaluaciones de circularidad para esta referencia/.test(createForm), "falta el mensaje de evaluaciones vacías");
});

check("4. Al cambiar la referencia se limpia la evaluación seleccionada", () => {
  // El onChange de la referencia debe resetear assessmentId (y outputLotId).
  const onChange = createForm.slice(createForm.indexOf('value={referenceId}'));
  assert(/setAssessmentId\(""\)/.test(onChange.slice(0, 400)), "al cambiar referencia debe limpiarse la evaluación");
  assert(/setOutputLotId\(""\)/.test(onChange.slice(0, 400)), "al cambiar referencia debe limpiarse el lote");
});

check("5. La página de creación pasa referenceId de cada evaluación al formulario", () => {
  assert(/referenceId: a\.referenceId/.test(newPage), "la página no pasa referenceId de las evaluaciones");
});

check("6. La server action valida que la evaluación corresponda a la referencia", () => {
  assert(/getReferenceForAssessment/.test(actionsSrc), "la action debe resolver la referencia de la evaluación");
  assert(/assessmentRef\.referenceId !== referenceId/.test(actionsSrc), "la action debe rechazar evaluaciones de otra referencia");
  assert(/no corresponde a la referencia elegida/.test(actionsSrc), "falta el mensaje de evaluación incompatible");
});

check("7. La validación de evaluación existe también para el lote (simetría) y ambas verifican organización", () => {
  assert(/lotRef\.referenceId !== referenceId/.test(actionsSrc), "debe conservarse la validación del lote");
  // Ambos helpers filtran por organización.
  assert(/getReferenceForAssessment/.test(dbSrc), "falta el helper de referencia de evaluación en DB");
  const helper = dbSrc.slice(dbSrc.indexOf("getReferenceForAssessment"));
  assert(/\.eq\("organization_id", orgId\)/.test(helper), "el helper de evaluación debe filtrar por organización");
});

check("8. El aviso de generación fallida no se pierde: se propaga al detalle", () => {
  // El form redirige al detalle con un aviso cuando el draft se creó pero la
  // generación falló, en vez de descartar el error.
  assert(/notice=generation_failed/.test(createForm), "el form debe propagar el aviso de generación fallida");
  assert(!/if \(res\.error && !res\.passportId\)/.test(createForm) || /!res\.passportId/.test(createForm), "el form debe distinguir fallo de creación de fallo de generación");
});

check("9. El detalle muestra el aviso de generación fallida (searchParams)", () => {
  assert(/searchParams/.test(detailPage), "el detalle debe leer searchParams");
  assert(/notice === "generation_failed"/.test(detailPage), "el detalle debe reconocer el aviso");
  assert(/generaci[oó]n autom[aá]tica del snapshot no se/.test(detailPage), "falta el texto del aviso en el detalle");
});

check("10. Hardening quirúrgico: sin nuevas migraciones, sin tocar el builder ni CPR", () => {
  const dir = path.join(root, "supabase/migrations");
  // T9C.1 fue hardening de UI/actions (sin migraciones propias). La numeración
  // ≤ 0091 corresponde a sprints previos; 0092+ pertenece a T9D en adelante.
  const t9c1Migrations = fs.readdirSync(dir).filter((f) => {
    const n = Number(f.slice(0, 4));
    return n === 91.5; // T9C.1 no reservó ningún slot de migración
  });
  assert(t9c1Migrations.length === 0, `T9C.1 no debía crear migraciones (hay: ${t9c1Migrations.join(", ")})`);
  // No se tocó CPR ni se introdujo alcance prohibido en los archivos cambiados.
  const changed = [createForm, newPage, detailPage, actionsSrc, dbSrc].join("\n");
  for (const banned of ["qr_code", "public_portal", "\\bpdf\\b", "carbon", "module_subscription", "textile_material_passports"]) {
    assert(!new RegExp(banned, "i").test(changed), `alcance prohibido en T9C.1: ${banned}`);
  }
});

check("11. Lenguaje prudente en los mensajes nuevos", () => {
  const changed = [createForm, detailPage, actionsSrc].join("\n");
  const scan = changed.split("\n").filter((l) => !/no equivale a/i.test(l)).join("\n").toLowerCase();
  for (const t of ["certificación garantizada", "cumple automáticamente", "pasaporte oficial", "producto certificado"]) {
    assert(!scan.includes(t), `lenguaje prohibido: ${t}`);
  }
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
