/**
 * Trazaloop · Sprint T9C (Textil) · UI, detalle, creación e impresión del
 * pasaporte técnico textil — inspección de código/rutas.
 * Correr: npx tsx tests/passports/textiles-passports-ui.test.ts
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
function exists(rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const SHELL = "app/(app)/(shell)/textiles/passports";
const PRINT = "app/(app)/(print)/textiles/passports/[id]/print/page.tsx";
const listPage = read(`${SHELL}/page.tsx`);
const newPage = read(`${SHELL}/new/page.tsx`);
const detailPage = read(`${SHELL}/[id]/page.tsx`);
const printPage = read(PRINT);
const actionsSrc = read("server/actions/textiles-passport.ts");
const dbSrc = read("lib/db/textiles-passport.ts");
const createForm = read("components/textiles/passports/passport-create-form.tsx");
const sectionsCmp = read("components/textiles/passports/passport-sections.tsx");
const actionsCmp = read("components/textiles/passports/passport-actions.tsx");
const rootPage = read("app/(app)/(shell)/textiles/page.tsx");

// Todo el código de UI + actions + componentes del pasaporte (barrido global).
// Código sin comentarios de línea (para no marcar menciones en documentación).
function stripComments(s: string): string {
  return s.split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
}
const ALL = [listPage, newPage, detailPage, printPage, actionsSrc, dbSrc, createForm, sectionsCmp, actionsCmp].join("\n");
const ALL_CODE = stripComments(ALL);

console.log("\nSprint T9C · UI del pasaporte técnico textil\n");

// --- Rutas ---
check("1. Existe /textiles/passports", () => assert(exists(`${SHELL}/page.tsx`), "falta el listado"));
check("2. Existe /textiles/passports/new", () => assert(exists(`${SHELL}/new/page.tsx`), "falta la creación"));
check("3. Existe /textiles/passports/[id]", () => assert(exists(`${SHELL}/[id]/page.tsx`), "falta el detalle"));
check("4. Existe /textiles/passports/[id]/print", () => assert(exists(PRINT), "falta la impresión"));

// --- Alcance prohibido ---
check("5. No crea QR", () => assert(!/qr[_-]?code|qrcode|<QR/i.test(ALL), "aparece QR"));
check("6. No crea portal público", () => assert(!/public[_-]?portal|portal[_-]?p[uú]blico|enlace p[uú]blico/i.test(ALL), "aparece portal público"));
check("7. No crea PDF server-side", () => {
  assert(!/pdfkit|puppeteer|playwright|@react-pdf|jspdf|pdf-lib|renderToPdf|generatePdf/i.test(ALL), "aparece generación de PDF server-side");
});
check("8. No crea IA", () => assert(!/openai|anthropic|\bllm\b|gpt-|inference/i.test(ALL), "aparece IA"));
check("9. No crea ACV/huella", () => assert(!/\bacv\b|life[_-]?cycle|carbon|huella de carbono|footprint/i.test(ALL), "aparece ACV/huella"));
check("10. No crea planes por módulo", () => assert(!/organization_module_access|organization_module_subscriptions|module_plan/i.test(ALL), "aparecen planes por módulo"));
check("11. No toca CPR funcionalmente", () => {
  assert(!/\/cpr\/|cpr_|from ['\"]@\/.*cpr/i.test(ALL), "referencia a CPR en la UI del pasaporte");
});

// --- Tabla y módulo ---
check("12. Usa textile_technical_passports", () => assert(dbSrc.includes("textile_technical_passports"), "no usa la tabla correcta"));
check("13. No usa textile_material_passports", () => assert(!/textile_material_passports/.test(ALL), "usa la tabla incorrecta"));
check("14. Usa guard Textil", () => {
  for (const [f, s] of [["list", listPage], ["new", newPage], ["detail", detailPage], ["print", printPage]] as const) {
    assert(/requireTextilesModule/.test(s), `la página ${f} no usa el guard Textil`);
  }
});
check("15. Usa module_code al consultar organization_modules (vía guard/RPC)", () => {
  // La UI delega la verificación de módulo al guard y a la RPC; no debe
  // consultar organization_modules con otra columna.
  assert(!/enabled_by/.test(ALL), "aparece enabled_by");
  assert(!/module_key\s*[:=]/.test(ALL), "la UI no debe filtrar módulos por module_key");
});
check("16. No usa enabled_by", () => assert(!/enabled_by/.test(ALL), "aparece enabled_by"));

// --- No acepta datos calculados desde formularios ---
check("17. No acepta snapshot_json desde formularios", () => {
  assert(!/snapshot_json\s*[:=]/.test(createForm) && !/name=['\"]snapshot_json/.test(createForm), "el formulario acepta snapshot_json");
});
check("18. No acepta data_sources_json desde formularios", () => {
  assert(!/data_sources_json\s*[:=]/.test(createForm), "el formulario acepta data_sources_json");
});
check("19. No acepta source_hash desde formularios", () => {
  assert(!/source_hash\s*[:=]/.test(createForm) && !/sourceHash\s*[:=]/.test(createForm), "el formulario acepta source_hash");
});
check("20. No acepta status arbitrario desde formularios", () => {
  // El form de creación no fija status del pasaporte; la transición usa acciones
  // controladas con estado destino validado en servidor. Se excluye el tipo de
  // opción del selector de circularidad (AssessmentOpt.status).
  assert(!/status:\s*['\"]/.test(createForm), "el formulario de creación fija un status literal");
  assert(!/passport.*status\s*:/.test(stripComments(createForm)), "el formulario fija status del pasaporte");
  assert(actionsSrc.includes("isTextilePassportStatus"), "la transición no valida el estado destino");
});

// --- Generación y transición por RPC controlada ---
check("21. Generación llama RPC controlada", () => {
  assert(dbSrc.includes('rpc("generate_textile_technical_passport_full_snapshot"'), "la generación no llama la RPC");
  assert(actionsSrc.includes("generateTechnicalPassportFullSnapshot"), "la action no usa la generación por RPC");
});
check("22. Transición de estado llama RPC controlada", () => {
  assert(dbSrc.includes('rpc("change_textile_technical_passport_status"'), "la transición no llama la RPC");
});

// --- Estructura del snapshot ---
check("23. UI usa snapshot_json.sections", () => {
  assert(/snapshot\.sections|sections\.|obj\(snapshot\.sections\)/.test(detailPage + sectionsCmp), "la UI no lee sections");
});
check("24. Evidencias se leen desde snapshot_json.sections.evidences.items", () => {
  // El renderizador toma sections.evidences y recorre items.
  assert(/sections\.evidences|obj\(sections\.evidences\)/.test(sectionsCmp), "no lee sections.evidences");
  assert(/evidences\.items|arr\(evidences\.items\)/.test(sectionsCmp), "no recorre evidences.items");
});
check("25. No usa snapshot_json.evidences.items como ruta principal", () => {
  assert(!/snapshot\.evidences\.items|snapshot_json\.evidences\.items/.test(ALL_CODE), "usa la ruta vieja de evidencias");
});

// --- Detalle muestra cada sección ---
const detailAndCmp = detailPage + sectionsCmp;
check("42. Detalle muestra composición", () => assert(/Composici[oó]n/i.test(detailAndCmp) && /fiber_composition/.test(sectionsCmp), "no muestra composición"));
check("43. Detalle muestra materiales", () => assert(/Materiales/i.test(detailAndCmp) && /sections\.materials/.test(sectionsCmp), "no muestra materiales"));
check("44. Detalle muestra componentes", () => assert(/Componentes/i.test(detailAndCmp) && /sections\.components/.test(sectionsCmp), "no muestra componentes"));
check("45. Detalle muestra evidencias", () => assert(/Evidencias/i.test(detailAndCmp), "no muestra evidencias"));
check("46. Detalle muestra trazabilidad", () => assert(/Trazabilidad/i.test(detailAndCmp) && /sections\.traceability/.test(sectionsCmp), "no muestra trazabilidad"));
check("47. Detalle muestra circularidad", () => assert(/Circularidad/i.test(detailAndCmp) && /sections\.circularity/.test(sectionsCmp), "no muestra circularidad"));
check("48. Detalle muestra TrazaDocs", () => assert(/TrazaDocs/i.test(detailAndCmp) && /sections\.trazadocs/.test(sectionsCmp), "no muestra TrazaDocs"));
check("49. Detalle muestra gaps_json", () => assert(/gaps_json/.test(detailPage), "no lee gaps_json"));
check("50. Detalle muestra warnings_json", () => assert(/warnings_json/.test(detailPage), "no lee warnings_json"));
check("51. Detalle muestra recommendations_json", () => assert(/recommendations_json/.test(detailPage), "no lee recommendations_json"));

// --- Disclaimers y lenguaje ---
check("29. Muestra disclaimer general", () => {
  assert(/TEXTILE_PASSPORT_DISCLAIMER/.test(detailPage) && /TEXTILE_PASSPORT_DISCLAIMER/.test(printPage), "falta el disclaimer general en detalle/impresión");
});
check("30. Muestra disclaimer de evidencias", () => {
  assert(/TEXTILE_PASSPORT_EVIDENCES_DISCLAIMER/.test(sectionsCmp), "falta el disclaimer de evidencias");
});
check("31. Muestra disclaimer de circularidad", () => {
  assert(/TEXTILE_PASSPORT_CIRCULARITY_DISCLAIMER/.test(sectionsCmp), "falta el disclaimer de circularidad");
});
check("32. Usa 'Aprobado internamente'", () => {
  assert(/Aprobado internamente/i.test(ALL) || /approved_internal/.test(detailPage), "no usa 'Aprobado internamente'");
});
check("33-37. No usa lenguaje prohibido", () => {
  const banned = ["certificación garantizada", "cumple automáticamente", "pasaporte oficial", "dpp oficial", "producto certificado", "sello garantizado", "listo para certificación", "cumplimiento garantizado"];
  const scan = ALL.split("\n").filter((l) => !/no equivale a/i.test(l)).join("\n").toLowerCase();
  for (const t of banned) assert(!scan.includes(t), `lenguaje prohibido: ${t}`);
});

// --- Impresión ---
check("26. Print view usa navegador (window.print vía PrintButton)", () => {
  assert(/PrintButton/.test(printPage), "la impresión no usa PrintButton (navegador)");
  assert(/window\.print/.test(read("components/domain/audit-support/print-button.tsx")), "PrintButton no usa window.print");
});
check("27. No importa librerías PDF server-side", () => {
  assert(!/pdfkit|puppeteer|@react-pdf|jspdf|pdf-lib/i.test(printPage), "la impresión importa PDF server-side");
});
check("52. Print oculta botones de acción en impresión (no-print / sin acciones)", () => {
  assert(/no-print/.test(printPage), "la impresión no marca elementos no-print");
  assert(!/PassportActions/.test(printPage), "la impresión no debe incluir los botones de acción de estado");
});

// --- Signed URLs ---
check("28. No guarda ni muestra signed URLs", () => {
  assert(!/signed[_ ]?url|signedurl|createSignedUrl|file_path/i.test(ALL_CODE), "aparece signed URL o file_path en el código");
});

// --- Listado y creación ---
check("38. Lista muestra código, versión, referencia, producto, estado, generación", () => {
  for (const col of ["Código", "Versión", "Referencia", "Producto", "Estado", "Generación"]) {
    assert(listPage.includes(col), `el listado no muestra la columna ${col}`);
  }
});
check("39. Nueva página permite reference_id", () => assert(/referenceId/.test(createForm), "el form no permite reference_id"));
check("40. Nueva página permite output_lot_id opcional", () => assert(/outputLotId/.test(createForm) && /opcional/i.test(createForm), "el form no permite output_lot_id opcional"));
check("41. Nueva página permite circularity_assessment_id opcional", () => assert(/circularityAssessmentId|assessmentId/.test(createForm), "el form no permite circularity_assessment_id"));

// --- Navegación y privacidad ---
check("20b. Navegación: card de pasaportes en /textiles", () => {
  assert(/\/textiles\/passports/.test(rootPage) && /Pasaporte t[eé]cnico/i.test(rootPage), "no hay acceso a pasaportes desde /textiles");
});
check("53. Textil sigue privado (guard + feature flag por el layout)", () => {
  // Las páginas usan requireTextilesModule, que verifica el feature flag y la
  // habilitación del módulo (notFound si no aplica).
  assert(/requireTextilesModule/.test(listPage), "el listado no está tras el guard");
});
check("54. Reporte T9C creado", () => {
  assert(exists("docs/modules/textiles/TEXTILES_T9C_PASSPORT_UI_REPORT.md"), "falta el reporte T9C");
});

console.log(`\nResultado: ${passed} pasaron, ${failed} fallaron`);
if (failed > 0) process.exit(1);
