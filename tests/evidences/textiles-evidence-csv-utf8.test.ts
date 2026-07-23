/**
 * Trazaloop · Sprint T9E.4 (Textil) · CSV con decodificación UTF-8 ESTRICTA.
 *
 * La heurística anterior tomaba por "imprimible" cualquier byte >= 0x80 y
 * aceptaba binario evidente. Ahora se decodifica con
 * `TextDecoder("utf-8", { fatal: true })`; se admite BOM UTF-8 y solo
 * tabulación / salto de línea / retorno de carro como controles.
 *
 * Las pruebas invocan los helpers REALES de producción
 * (`detectTextileEvidenceFileType` y la matriz completa
 * `validateTextileEvidenceBinarySignature`), no una copia.
 *
 * NOTA HONESTA: validar UTF-8 distingue texto de binario. NO previene
 * inyección de fórmulas en hojas de cálculo ni malware.
 *
 * Correr: npx tsx tests/evidences/textiles-evidence-csv-utf8.test.ts
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

const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};
const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

/** ¿Lo acepta la matriz COMPLETA como .csv legítimo? (null = aceptado) */
const asCsv = (bytes: Uint8Array) =>
  validateTextileEvidenceBinarySignature({
    bytes,
    fileName: "datos.csv",
    declaredMimeType: "text/csv",
    storedContentType: "text/csv",
  });

const aceptado = (bytes: Uint8Array, motivo: string) => {
  assert(detectTextileEvidenceFileType(bytes).detectedType === "csv-text", `detección: ${motivo}`);
  assert(asCsv(bytes) === null, `matriz completa: ${motivo}`);
};
const rechazado = (bytes: Uint8Array, motivo: string) => {
  assert(detectTextileEvidenceFileType(bytes).detectedType !== "csv-text", `detección: ${motivo}`);
  assert(asCsv(bytes) !== null, `matriz completa: ${motivo}`);
};

console.log("Trazaloop · T9E.4: CSV UTF-8 válido → ACEPTADO\n");

check("1. CSV ASCII simple", () => {
  aceptado(enc("nombre,cantidad\nTela,10\n"), "ASCII");
});

check("2. CSV UTF-8 con tildes", () => {
  aceptado(enc("descripción,país\nAlgodón,Colombia\n"), "tildes");
});

check("3. CSV con ñ", () => {
  aceptado(enc("año,muestra\n2026,Ñandú\n"), "eñe");
});

check("4. CSV con BOM UTF-8 (EF BB BF)", () => {
  aceptado(cat(BOM, enc("a,b\n1,2\n")), "BOM");
});

check("5. CSV con tabulaciones", () => {
  aceptado(enc("a\tb\n1\t2\n"), "tabulaciones");
});

check("6. CSV con CRLF", () => {
  aceptado(enc("a,b\r\n1,2\r\n"), "CRLF");
});

check("7. CSV con caracteres Unicode válidos (símbolos, CJK, emoji)", () => {
  aceptado(enc("símbolo,valor\n✓,€\n漢字,10\n🧵,1\n"), "unicode");
});

console.log("\nTrazaloop · T9E.4: contenido NO textual → RECHAZADO\n");

check("8. Bytes FF FF FF", () => {
  rechazado(new Uint8Array([0xff, 0xff, 0xff]), "FF FF FF");
  rechazado(cat(enc("a,b\n"), new Uint8Array([0xfe])), "FE aislado");
});

check("9. Secuencia UTF-8 truncada", () => {
  rechazado(cat(enc("a,b\n"), new Uint8Array([0xc3])), "C3 sin continuación");
  rechazado(cat(enc("a,b\n"), new Uint8Array([0xe2, 0x9c])), "E2 9C truncado");
});

check("10. Overlong encoding (C0 80 / C1 BF)", () => {
  rechazado(cat(enc("a,b\n"), new Uint8Array([0xc0, 0x80])), "overlong C0 80");
  rechazado(cat(enc("a,b\n"), new Uint8Array([0xc1, 0xbf])), "overlong C1 BF");
});

check("11. NUL dentro del contenido", () => {
  rechazado(cat(enc("a,b\n1,"), new Uint8Array([0x00]), enc("\n")), "NUL");
});

check("12. Controles binarios no permitidos (0x01, 0x02, DEL, C1)", () => {
  rechazado(cat(enc("a,b\n"), new Uint8Array([0x01])), "0x01");
  rechazado(cat(enc("a,b\n"), new Uint8Array([0x02])), "0x02");
  rechazado(cat(enc("a,b\n"), new Uint8Array([0x7f])), "DEL");
  rechazado(cat(enc("a,b\n"), new Uint8Array([0xc2, 0x85])), "C1 U+0085");
});

check("13. Binario sin NUL pero con UTF-8 inválido", () => {
  rechazado(new Uint8Array([0x80, 0x81, 0x82, 0x83, 0xf5, 0xf6, 0xf7]), "continuaciones sueltas");
});

check("14. Archivo vacío", () => {
  rechazado(new Uint8Array(0), "vacío");
  rechazado(BOM, "solo BOM");
});

check("15. Solo espacios y controles textuales", () => {
  rechazado(enc("   \n\t  \r\n"), "solo espacios");
});

check("16. PDF renombrado como CSV", () => {
  const pdf = enc("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
  assert(detectTextileEvidenceFileType(pdf).detectedType === "pdf", "debía detectarse como PDF");
  assert(asCsv(pdf) !== null, "un PDF renombrado a .csv fue aceptado");
});

check("17. ZIP/DOCX renombrado como CSV", () => {
  const zip = zipSync({ "cualquier.txt": strToU8("hola") });
  assert(detectTextileEvidenceFileType(zip).detectedType === "zip", "debía detectarse como ZIP");
  assert(asCsv(zip) !== null, "un ZIP renombrado a .csv fue aceptado");
  const docx = zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": strToU8("<w:document/>"),
  });
  assert(asCsv(docx) !== null, "un DOCX renombrado a .csv fue aceptado");
});

check("18. Regresión: la regla débil 'byte >= 0x80 es texto' ya no aplica", () => {
  // Bytes altos que la heurística anterior contaba como imprimibles.
  const altos = new Uint8Array(64).fill(0xa0);
  rechazado(altos, "relleno 0xA0");
});

if (failed > 0) {
  console.error(`\nResultado: ${passed} pasaron, ${failed} fallaron.`);
  process.exit(1);
}
console.log(`\nResultado: ${passed} pasaron, 0 fallaron. Todo verde.`);
