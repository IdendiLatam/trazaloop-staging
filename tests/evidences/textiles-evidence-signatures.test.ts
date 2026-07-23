/**
 * Trazaloop · Sprint T9E.2 (Textil) · Verificación REAL del tipo de archivo
 * por FIRMA BINARIA (lógica PURA): un `.pdf` con bytes PNG se rechaza aunque
 * el MIME declarado y el Content-Type almacenado digan application/pdf.
 *
 * Correr: npx tsx tests/evidences/textiles-evidence-signatures.test.ts
 */
import { zipSync, strToU8 } from "fflate";
import {
  detectTextileEvidenceFileType,
  validateTextileEvidenceBinarySignature,
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

// --- Constructores de bytes sintéticos --------------------------------------
const ascii = (s: string) => new TextEncoder().encode(s);
const concat = (...parts: Uint8Array[]) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

const PDF_REAL = concat(ascii("%PDF-1.4\n"), ascii("1 0 obj\n<<>>\nendobj\n%%EOF"));
const PNG_REAL = concat(
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  new Uint8Array([0x00, 0x00, 0x00, 0x0d]),
  ascii("IHDR"),
  new Uint8Array(16)
);
const JPEG_REAL = concat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), ascii("JFIF"), new Uint8Array(16));
const WEBP_REAL = concat(
  ascii("RIFF"),
  new Uint8Array([0x24, 0x00, 0x00, 0x00]),
  ascii("WEBP"),
  ascii("VP8 "),
  new Uint8Array(16)
);
const ZIP_HEADER = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
// T9E.3: los OOXML de prueba son ZIP REALES (fflate) — las concatenaciones
// sintéticas de T9E.2 ahora se RECHAZAN a propósito (parser real).
const DOCX_REAL = zipSync({
  "[Content_Types].xml": strToU8("<Types/>"),
  "_rels/.rels": strToU8("<Relationships/>"),
  "word/document.xml": strToU8("<w:document/>"),
});
const XLSX_REAL = zipSync({
  "[Content_Types].xml": strToU8("<Types/>"),
  "_rels/.rels": strToU8("<Relationships/>"),
  "xl/workbook.xml": strToU8("<workbook/>"),
});
const ZIP_PLAIN = zipSync({ "cualquier-cosa.txt": strToU8("contenido") });
const DOCX_FAKE_STRINGS = concat(ZIP_HEADER, ascii("....[Content_Types].xml....word/document.xml...."), new Uint8Array(8));
const CSV_REAL = ascii("columna_a,columna_b,columna_c\n1,2,3\n4,5,6\n");
const BINARY_JUNK = new Uint8Array([0x00, 0x01, 0x02, 0xfe, 0xff, 0x00, 0x10, 0x00, 0x99, 0x00]);

console.log("Trazaloop · T9E.2: detección PURA por firma\n");

check("1. Formatos REALES → detectados correctamente", () => {
  assert(detectTextileEvidenceFileType(PDF_REAL).detectedType === "pdf", "PDF real");
  assert(detectTextileEvidenceFileType(PNG_REAL).detectedType === "png", "PNG real");
  assert(detectTextileEvidenceFileType(JPEG_REAL).detectedType === "jpeg", "JPEG real");
  assert(detectTextileEvidenceFileType(WEBP_REAL).detectedType === "webp", "WebP real");
  assert(detectTextileEvidenceFileType(DOCX_REAL).detectedType === "docx", "DOCX estructural");
  assert(detectTextileEvidenceFileType(XLSX_REAL).detectedType === "xlsx", "XLSX estructural");
  assert(detectTextileEvidenceFileType(CSV_REAL).detectedType === "csv-text", "CSV textual");
});

check("2. ZIP sin estructura OOXML → 'zip' genérico (jamás docx/xlsx)", () => {
  assert(detectTextileEvidenceFileType(ZIP_PLAIN).detectedType === "zip", "ZIP plano no es OOXML");
  // T9E.3: bytes PK con CADENAS incrustadas ya no engañan al parser real.
  assert(
    detectTextileEvidenceFileType(DOCX_FAKE_STRINGS).detectedType === "zip",
    "las cadenas incrustadas jamás cuentan como entradas"
  );
});

check("3. Binario arbitrario y vacío → unknown", () => {
  assert(detectTextileEvidenceFileType(BINARY_JUNK).detectedType === "unknown", "basura binaria");
  assert(detectTextileEvidenceFileType(new Uint8Array(0)).detectedType === "unknown", "vacío");
});

console.log("\nTrazaloop · T9E.2: la matriz completa (extensión ↔ MIME ↔ firma)\n");

const okCase = (bytes: Uint8Array, name: string, mime: string) =>
  validateTextileEvidenceBinarySignature({
    bytes,
    fileName: name,
    declaredMimeType: mime,
    storedContentType: mime,
  });

check("4. CASO OBLIGATORIO: documento.pdf + MIME application/pdf + CONTENIDO PNG → rechazado", () => {
  const res = okCase(PNG_REAL, "documento.pdf", "application/pdf");
  assert(res !== null, "el PDF falso debía rechazarse");
  assert(res!.includes("contenido"), "el mensaje debía hablar del contenido");
});

check("5. .png con bytes PDF → rechazado", () => {
  assert(okCase(PDF_REAL, "imagen.png", "image/png") !== null, "PNG falso aceptado");
});

check("6. .jpg con contenido arbitrario → rechazado", () => {
  assert(okCase(BINARY_JUNK, "foto.jpg", "image/jpeg") !== null, "JPEG falso aceptado");
});

check("7. DOCX que solo es ZIP sin word/ → rechazado; XLSX sin xl/ → rechazado", () => {
  assert(
    okCase(ZIP_PLAIN, "doc.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document") !== null,
    "ZIP renombrado a docx aceptado"
  );
  const docxSinWord = zipSync({ "[Content_Types].xml": strToU8("<Types/>") });
  assert(
    okCase(docxSinWord, "doc.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document") !== null,
    "docx sin word/ aceptado"
  );
  assert(
    okCase(docxSinWord, "hoja.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") !== null,
    "xlsx sin xl/ aceptado"
  );
});

check("8. CSV con contenido binario → rechazado", () => {
  assert(okCase(BINARY_JUNK, "datos.csv", "text/csv") !== null, "CSV binario aceptado");
  const csvConNul = concat(ascii("a,b\n1,"), new Uint8Array([0x00]), ascii("\n"));
  assert(okCase(csvConNul, "datos.csv", "text/csv") !== null, "CSV con NUL aceptado");
});

check("9. Formatos REALES → aceptados por la matriz completa", () => {
  assert(okCase(PDF_REAL, "informe.pdf", "application/pdf") === null, "PDF real rechazado");
  assert(okCase(PNG_REAL, "foto.png", "image/png") === null, "PNG real rechazado");
  assert(okCase(JPEG_REAL, "foto.jpg", "image/jpeg") === null, "JPEG (.jpg) real rechazado");
  assert(okCase(JPEG_REAL, "foto.jpeg", "image/jpeg") === null, "JPEG (.jpeg) real rechazado");
  assert(okCase(WEBP_REAL, "foto.webp", "image/webp") === null, "WebP real rechazado");
  assert(
    okCase(DOCX_REAL, "doc.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document") === null,
    "DOCX estructural rechazado"
  );
  assert(
    okCase(XLSX_REAL, "hoja.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") === null,
    "XLSX estructural rechazado"
  );
  assert(okCase(CSV_REAL, "datos.csv", "text/csv") === null, "CSV textual rechazado");
});

check("10. MIME declarado que no corresponde a la extensión → rechazado", () => {
  assert(okCase(PDF_REAL, "informe.pdf", "image/png") !== null, "mime cruzado aceptado");
});

check("11. Content-Type ALMACENADO divergente → rechazado (no es prueba, pero debe ser coherente)", () => {
  const res = validateTextileEvidenceBinarySignature({
    bytes: PDF_REAL,
    fileName: "informe.pdf",
    declaredMimeType: "application/pdf",
    storedContentType: "application/zip",
  });
  assert(res !== null, "content-type almacenado divergente aceptado");
});

check("12. Un CSV cuyo contenido tiene firma PDF → rechazado (prioridad de firmas)", () => {
  assert(okCase(PDF_REAL, "datos.csv", "text/csv") !== null, "PDF renombrado a csv aceptado");
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
