/**
 * Trazaloop · Sprint T9E.3 (Textil) · Validación OOXML con PARSER ZIP REAL:
 * DOCX/XLSX solo se aceptan si el directorio central del ZIP contiene las
 * ENTRADAS requeridas como archivos reales — cadenas incrustadas, ZIP
 * truncados, traversal y bombas declaradas se rechazan. Los fixtures son
 * ZIP VÁLIDOS construidos con fflate (jamás concatenaciones sintéticas).
 *
 * Correr: npx tsx tests/evidences/textiles-evidence-ooxml-structure.test.ts
 */
import { zipSync, strToU8 } from "fflate";
import {
  validateOoxmlContainer,
  detectTextileEvidenceFileType,
  validateTextileEvidenceBinarySignature,
  OOXML_MAX_ENTRIES,
} from "../../lib/domain/textiles-evidence-signatures";

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

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MINIMAL_DOCX = zipSync({
  "[Content_Types].xml": strToU8("<Types/>"),
  "_rels/.rels": strToU8("<Relationships/>"),
  "word/document.xml": strToU8("<w:document/>"),
});
const MINIMAL_XLSX = zipSync({
  "[Content_Types].xml": strToU8("<Types/>"),
  "_rels/.rels": strToU8("<Relationships/>"),
  "xl/workbook.xml": strToU8("<workbook/>"),
});

console.log("Trazaloop · T9E.3: casos DOCX\n");

check("1. DOCX mínimo válido → aceptado", () => {
  const res = validateOoxmlContainer(MINIMAL_DOCX, "docx");
  assert(res.valid, `rechazado: ${!res.valid ? res.reason : ""}`);
  assert(detectTextileEvidenceFileType(MINIMAL_DOCX).detectedType === "docx", "detección incorrecta");
  assert(
    validateTextileEvidenceBinarySignature({
      bytes: MINIMAL_DOCX,
      fileName: "informe.docx",
      declaredMimeType: DOCX_MIME,
      storedContentType: DOCX_MIME,
    }) === null,
    "la matriz completa debía aceptarlo"
  );
});

check("2. Bytes PK con cadenas incrustadas que NO son ZIP → rechazados", () => {
  const fake = new Uint8Array([
    0x50, 0x4b, 0x03, 0x04,
    ...strToU8("...[Content_Types].xml...word/document.xml..."),
  ]);
  const res = validateOoxmlContainer(fake, "docx");
  assert(!res.valid, "un PK falso con cadenas fue aceptado");
  assert(detectTextileEvidenceFileType(fake).detectedType === "zip", "no debía detectarse como docx");
});

check("3. ZIP truncado → rechazado", () => {
  const truncated = MINIMAL_DOCX.slice(0, MINIMAL_DOCX.length - 10);
  const res = validateOoxmlContainer(truncated, "docx");
  assert(!res.valid && res.reason.includes("inválido o truncado"), "el ZIP truncado fue aceptado");
});

check("4. ZIP válido SIN [Content_Types].xml → rechazado", () => {
  const zip = zipSync({ "word/document.xml": strToU8("<w:document/>") });
  const res = validateOoxmlContainer(zip, "docx");
  assert(!res.valid && res.reason.includes("[Content_Types].xml"), "sin content-types fue aceptado");
});

check("5. ZIP válido SIN word/document.xml → rechazado", () => {
  const zip = zipSync({ "[Content_Types].xml": strToU8("<Types/>") });
  const res = validateOoxmlContainer(zip, "docx");
  assert(!res.valid && res.reason.includes("word/document.xml"), "sin document.xml fue aceptado");
});

check("6. ZIP válido con la CADENA 'word/document.xml' dentro de otro archivo → rechazado", () => {
  const zip = zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "nota.txt": strToU8("este archivo menciona word/document.xml pero no lo contiene"),
  });
  const res = validateOoxmlContainer(zip, "docx");
  assert(!res.valid, "la cadena incrustada en el CONTENIDO contó como entrada");
});

check("7. ZIP con traversal en nombres de entrada → rechazado", () => {
  const zip = zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8("<w:document/>"),
    "../../evil.txt": strToU8("x"),
  });
  const res = validateOoxmlContainer(zip, "docx");
  assert(!res.valid && res.reason.includes("anómalo"), "el traversal fue aceptado");
});

check("8. ZIP con demasiadas entradas → rechazado (límite anti ZIP-bomb)", () => {
  const entries: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8("<w:document/>"),
  };
  for (let i = 0; i < OOXML_MAX_ENTRIES + 5; i++) {
    entries[`bomb/e${i}.txt`] = strToU8("x");
  }
  const res = validateOoxmlContainer(zipSync(entries), "docx");
  assert(!res.valid && res.reason.includes("demasiadas entradas"), "el exceso de entradas fue aceptado");
});

console.log("\nTrazaloop · T9E.3: casos XLSX\n");

check("9. XLSX mínimo válido → aceptado", () => {
  const res = validateOoxmlContainer(MINIMAL_XLSX, "xlsx");
  assert(res.valid, `rechazado: ${!res.valid ? res.reason : ""}`);
  assert(
    validateTextileEvidenceBinarySignature({
      bytes: MINIMAL_XLSX,
      fileName: "hoja.xlsx",
      declaredMimeType: XLSX_MIME,
      storedContentType: XLSX_MIME,
    }) === null,
    "la matriz completa debía aceptarlo"
  );
});

check("10. ZIP válido SIN xl/workbook.xml → rechazado", () => {
  const zip = zipSync({ "[Content_Types].xml": strToU8("<Types/>"), "xl/styles.xml": strToU8("<s/>") });
  const res = validateOoxmlContainer(zip, "xlsx");
  assert(!res.valid && res.reason.includes("xl/workbook.xml"), "sin workbook fue aceptado");
});

check("11. ZIP falso con cadenas incrustadas presentado como XLSX → rechazado", () => {
  const fake = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...strToU8("xl/workbook.xml [Content_Types].xml")]);
  assert(!validateOoxmlContainer(fake, "xlsx").valid, "el falso XLSX fue aceptado");
});

check("12. ZIP truncado presentado como XLSX → rechazado", () => {
  const truncated = MINIMAL_XLSX.slice(0, MINIMAL_XLSX.length - 7);
  assert(!validateOoxmlContainer(truncated, "xlsx").valid, "el truncado fue aceptado");
});

check("13. Estructura DOCX presentada como XLSX → rechazada (y detectada como docx)", () => {
  assert(!validateOoxmlContainer(MINIMAL_DOCX, "xlsx").valid, "un docx pasó como xlsx");
  assert(
    validateTextileEvidenceBinarySignature({
      bytes: MINIMAL_DOCX,
      fileName: "hoja.xlsx",
      declaredMimeType: XLSX_MIME,
      storedContentType: XLSX_MIME,
    }) !== null,
    "la matriz aceptó un docx renombrado a xlsx"
  );
});

check("14. Estructura XLSX presentada como DOCX → rechazada", () => {
  assert(!validateOoxmlContainer(MINIMAL_XLSX, "docx").valid, "un xlsx pasó como docx");
  assert(
    validateTextileEvidenceBinarySignature({
      bytes: MINIMAL_XLSX,
      fileName: "informe.docx",
      declaredMimeType: DOCX_MIME,
      storedContentType: DOCX_MIME,
    }) !== null,
    "la matriz aceptó un xlsx renombrado a docx"
  );
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
