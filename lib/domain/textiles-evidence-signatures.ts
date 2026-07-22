/**
 * Trazaloop · Sprint T9E.2/T9E.3/T9E.4 (Textil) · Verificación REAL del tipo de
 * archivo por FIRMA BINARIA / estructura, en servidor y PURA (testeable).
 *
 * El Content-Type que Storage almacena proviene del header del PUT del
 * navegador: NUNCA prueba el formato real. La finalización descarga los
 * bytes del objeto (≤ 20 MB, verificado antes) y exige que EXTENSIÓN,
 * MIME declarado, Content-Type almacenado y FIRMA detectada correspondan
 * al MISMO tipo permitido.
 *
 * T9E.3: DOCX/XLSX se validan con un PARSER ZIP REAL (fflate: lee el
 * directorio central sin descomprimir NINGUNA entrada) — las ENTRADAS
 * requeridas deben existir como archivos reales del contenedor; una cadena
 * incrustada como "word/document.xml" dentro de bytes arbitrarios ya no
 * cuenta. Límites anti ZIP-bomb aplicados (entradas, tamaños declarados,
 * ratio) sin inflar contenido; jamás se ejecutan macros ni contenido
 * activo.
 *
 * T9E.4: el CSV se valida con decodificación UTF-8 ESTRICTA
 * (`TextDecoder("utf-8", { fatal: true })`) en lugar de la heurística previa
 * que tomaba por imprimible cualquier byte >= 0x80. Se admite BOM UTF-8 y
 * solo tabulación/salto de línea/retorno de carro como controles.
 *
 * Limitación documentada (riesgo residual): la validación estructural no
 * sustituye un escaneo antimalware; un PDF/OOXML real puede contener
 * contenido hostil para el visor. UTF-8 válido tampoco equivale a archivo
 * seguro ni previene inyección en hojas de cálculo. Fuera de alcance.
 */
import { unzipSync } from "fflate";

export type TextileDetectedFileType =
  | "pdf"
  | "png"
  | "jpeg"
  | "webp"
  | "docx"
  | "xlsx"
  | "zip"
  | "csv-text"
  | "unknown";

export type TextileFileSignatureResult = {
  detectedType: TextileDetectedFileType;
  /** Motivo interno SEGURO (jamás se muestra tal cual al usuario final). */
  reason: string;
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// T9E.3 · Validación OOXML con PARSER ZIP REAL (fflate)
// ---------------------------------------------------------------------------

/** Límites anti ZIP-bomb: se aplican sobre la METADATA del directorio
 * central (fflate) SIN descomprimir ninguna entrada. */
export const OOXML_MAX_ENTRIES = 4096;
export const OOXML_MAX_ENTRY_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
export const OOXML_MAX_TOTAL_UNCOMPRESSED_BYTES = 400 * 1024 * 1024;
export const OOXML_MAX_COMPRESSION_RATIO = 250;

export type OoxmlKind = "docx" | "xlsx";

export type OoxmlValidationResult =
  | { valid: true; entries: number }
  | { valid: false; reason: string };

const OOXML_REQUIRED_ENTRY: Record<OoxmlKind, string> = {
  docx: "word/document.xml",
  xlsx: "xl/workbook.xml",
};

/** ¿Nombre de entrada ZIP peligroso? (traversal, absolutas, backslashes,
 * unidades de Windows, NUL). Las rutas se comparan como rutas ZIP tal cual
 * las declara el directorio central. */
function isUnsafeZipEntryName(name: string): boolean {
  return (
    name.length === 0 ||
    name.includes("..") ||
    name.startsWith("/") ||
    name.includes("\\") ||
    /^[A-Za-z]:/.test(name) ||
    name.includes("\0")
  );
}

/**
 * Valida un contenedor OOXML leyendo las ENTRADAS REALES del directorio
 * central (fflate `unzipSync` con filtro que jamás descomprime): un ZIP
 * inválido/truncado lanza y se rechaza; una cadena "word/document.xml"
 * incrustada dentro del CONTENIDO de otro archivo no crea ninguna entrada
 * y ya no cuenta. Las entradas requeridas deben ser ARCHIVOS reales (no
 * directorios vacíos). No se ejecutan macros ni contenido activo y esta
 * validación estructural NO equivale a un antivirus.
 */
export function validateOoxmlContainer(
  bytes: Uint8Array,
  kind: OoxmlKind
): OoxmlValidationResult {
  const files = new Map<string, number>();
  let entries = 0;
  let totalDeclared = 0;
  let unsafeReason: string | null = null;

  try {
    unzipSync(bytes, {
      filter: (info) => {
        entries++;
        if (entries > OOXML_MAX_ENTRIES) {
          unsafeReason = unsafeReason ?? "demasiadas entradas en el contenedor";
        }
        if (isUnsafeZipEntryName(info.name)) {
          unsafeReason = unsafeReason ?? "nombre de entrada anómalo en el contenedor";
        }
        const declared = info.originalSize ?? 0;
        if (declared > OOXML_MAX_ENTRY_UNCOMPRESSED_BYTES) {
          unsafeReason = unsafeReason ?? "entrada con tamaño declarado excesivo";
        }
        totalDeclared += declared;
        if (!info.name.endsWith("/")) {
          files.set(info.name, declared);
        }
        // JAMÁS descomprimir: solo metadata del directorio central.
        return false;
      },
    });
  } catch {
    return { valid: false, reason: "contenedor ZIP inválido o truncado" };
  }

  if (unsafeReason) return { valid: false, reason: unsafeReason };
  if (entries === 0) return { valid: false, reason: "contenedor ZIP sin entradas" };
  if (totalDeclared > OOXML_MAX_TOTAL_UNCOMPRESSED_BYTES) {
    return { valid: false, reason: "tamaño total declarado excesivo" };
  }
  if (bytes.length > 0 && totalDeclared / bytes.length > OOXML_MAX_COMPRESSION_RATIO) {
    return { valid: false, reason: "relación de compresión excesiva" };
  }

  const contentTypes = files.get("[Content_Types].xml");
  if (contentTypes === undefined || contentTypes <= 0) {
    return { valid: false, reason: "sin entrada real [Content_Types].xml" };
  }
  const required = OOXML_REQUIRED_ENTRY[kind];
  const main = files.get(required);
  if (main === undefined || main <= 0) {
    return { valid: false, reason: `sin entrada real ${required}` };
  }
  return { valid: true, entries };
}

/**
 * T9E.4 · ¿Contenido textual UTF-8 VÁLIDO? (CSV)
 *
 * Sustituye la heurística anterior, que contaba como "imprimible" CUALQUIER
 * byte >= 0x80 y por tanto aceptaba binario evidente. Ahora se decodifica el
 * contenido COMPLETO con `TextDecoder("utf-8", { fatal: true })`: cualquier
 * secuencia inválida, truncada, sobrelarga (overlong), byte de inicio ilegal
 * (FF, FE, C0, C1) o subrogado aislado hace fallar la decodificación.
 *
 * Reglas adicionales sobre el texto ya decodificado:
 *   · Se acepta un BOM UTF-8 inicial (EF BB BF), opcional.
 *   · Como controles solo se admiten tabulación, salto de línea y retorno de
 *     carro; NUL, el resto de controles C0, DEL y los controles C1 se rechazan.
 *   · Un contenido vacío o compuesto solo por espacios/controles se rechaza.
 *
 * LÍMITE HONESTO: esto distingue texto UTF-8 de binario evidente. NO
 * interpreta el CSV, no evalúa fórmulas, no transforma el archivo y NO
 * previene inyección en hojas de cálculo ni malware. UTF-8 válido no equivale
 * a archivo seguro.
 */
const CSV_ALLOWED_CONTROLS = new Set([0x09, 0x0a, 0x0d]);

function looksLikeUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;

  // BOM UTF-8 opcional al inicio.
  const body =
    bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;
  if (body.length === 0) return false;

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return false;
  }

  for (const char of text) {
    const cp = char.codePointAt(0)!;
    if (CSV_ALLOWED_CONTROLS.has(cp)) continue;
    // Controles C0 (incluye NUL) y DEL.
    if (cp < 0x20 || cp === 0x7f) return false;
    // Controles C1: válidos como Unicode, pero no son texto de un CSV.
    if (cp >= 0x80 && cp <= 0x9f) return false;
  }

  return text.trim().length > 0;
}

/**
 * Detección PURA por firma/estructura. No interpreta ni ejecuta contenido.
 */
export function detectTextileEvidenceFileType(bytes: Uint8Array): TextileFileSignatureResult {
  if (bytes.length === 0) {
    return { detectedType: "unknown", reason: "archivo vacío" };
  }

  // PDF: %PDF-
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { detectedType: "pdf", reason: "firma %PDF-" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { detectedType: "png", reason: "firma PNG" };
  }
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { detectedType: "jpeg", reason: "firma JPEG" };
  }
  // WebP: RIFF ???? WEBP
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { detectedType: "webp", reason: "cabecera RIFF/WEBP" };
  }
  // Contenedor ZIP: PK\x03\x04. T9E.3: docx/xlsx SOLO con entradas REALES
  // del directorio central (parser fflate, sin descomprimir) — una cadena
  // incrustada jamás cuenta; ZIP inválido/truncado se rechaza.
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const asDocx = validateOoxmlContainer(bytes, "docx");
    if (asDocx.valid) {
      return { detectedType: "docx", reason: "ZIP real con [Content_Types].xml y word/document.xml" };
    }
    const asXlsx = validateOoxmlContainer(bytes, "xlsx");
    if (asXlsx.valid) {
      return { detectedType: "xlsx", reason: "ZIP real con [Content_Types].xml y xl/workbook.xml" };
    }
    return { detectedType: "zip", reason: asDocx.reason };
  }
  // CSV: texto UTF-8 VÁLIDO (T9E.4, decodificación estricta). Nunca se
  // interpretan fórmulas ni contenido.
  if (looksLikeUtf8Text(bytes)) {
    return { detectedType: "csv-text", reason: "contenido textual UTF-8 válido" };
  }
  return { detectedType: "unknown", reason: "sin firma reconocida" };
}

/** Tipo canónico permitido por extensión (espejo del dominio de evidencias). */
const EXTENSION_TO_CANONICAL: Record<string, "pdf" | "png" | "jpeg" | "webp" | "docx" | "xlsx" | "csv"> = {
  pdf: "pdf",
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  webp: "webp",
  docx: "docx",
  xlsx: "xlsx",
  csv: "csv",
};

const CANONICAL_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

const CANONICAL_TO_DETECTED: Record<string, TextileDetectedFileType> = {
  pdf: "pdf",
  png: "png",
  jpeg: "jpeg",
  webp: "webp",
  docx: "docx",
  xlsx: "xlsx",
  csv: "csv-text",
};

/**
 * Regla completa de coherencia (T9E.2): extensión declarada ↔ MIME
 * declarado ↔ Content-Type almacenado ↔ FIRMA detectada deben corresponder
 * TODOS al mismo tipo permitido. Devuelve el primer error (mensaje apto
 * para el usuario) o null si el archivo es coherente.
 */
export function validateTextileEvidenceBinarySignature(input: {
  bytes: Uint8Array;
  fileName: string;
  declaredMimeType: string;
  storedContentType: string | null;
}): string | null {
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const canonical = EXTENSION_TO_CANONICAL[ext];
  if (!canonical) {
    return "Extensión de archivo no permitida (.pdf, .png, .jpg, .jpeg, .webp, .docx, .xlsx o .csv).";
  }
  const expectedMime = CANONICAL_TO_MIME[canonical];
  if (input.declaredMimeType !== expectedMime) {
    return "El tipo declarado no corresponde a la extensión del archivo.";
  }
  if (input.storedContentType !== null && input.storedContentType !== expectedMime) {
    return "El tipo almacenado no corresponde al archivo declarado. Sube el archivo de nuevo.";
  }
  const detection = detectTextileEvidenceFileType(input.bytes);
  if (detection.detectedType !== CANONICAL_TO_DETECTED[canonical]) {
    return "El contenido del archivo no corresponde al tipo declarado. Verifica el archivo e inténtalo de nuevo.";
  }
  return null;
}
