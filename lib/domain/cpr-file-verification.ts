/**
 * Trazaloop · T9F.5B · A06/A07/A14 · Reglas PURAS (testeables, sin E/S) de
 * verificación física y de tope por archivo para CPR y TrazaDocs.
 *
 * Este módulo NO amplía la lista de tipos permitidos: reutiliza las que ya
 * existen en el proyecto (`ALLOWED_FILE_DOCUMENT_TYPES` de TrazaDocs y el
 * validador de firma binaria de Textiles, T9E.2/T9E.3). Tampoco altera el
 * comportamiento de T9E: importa su helper y lo usa tal cual.
 *
 * Espejo EXACTO de la función SQL `cpr_upload_max_file_bytes` (0101 §6b.0).
 * Si una de las dos cambiara sin la otra, la prueba local T9F.5B falla.
 */
import { validateTextileEvidenceBinarySignature } from "@/lib/domain/textiles-evidence-signatures";

export type CprUploadResourceKind = "evidence" | "trazadoc_initial" | "trazadoc_replace";
export type CprPlanCode = "demo" | "full" | "extra";

/** Evidencia CPR: máximo técnico PROPIO, deliberadamente distinto del de
 *  TrazaDocs (T9F.5A §A14 exige no asumir que sean iguales). */
export const CPR_EVIDENCE_MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
/** TrazaDocs Demo: 10 MB (catálogo real del producto). */
export const TRAZADOC_MAX_FILE_BYTES_DEMO = 10 * 1024 * 1024; // 10 MB
/** TrazaDocs Full y Extra: 25 MB por archivo. Extra solo difiere en la CUOTA
 *  TOTAL del plan, nunca en el tope por archivo. */
export const TRAZADOC_MAX_FILE_BYTES_FULL = 25 * 1024 * 1024; // 25 MB

/**
 * Tope POR ARCHIVO según tipo de recurso y plan vigente. Devuelve null cuando
 * el modo no puede resolverse: el llamador debe FALLAR CERRADO, jamás caer a
 * un plan por defecto.
 */
export function maxCprUploadFileBytes(
  resourceType: CprUploadResourceKind,
  planCode: CprPlanCode | null
): number | null {
  if (resourceType === "evidence") return CPR_EVIDENCE_MAX_FILE_BYTES;
  if (planCode === "demo") return TRAZADOC_MAX_FILE_BYTES_DEMO;
  if (planCode === "full" || planCode === "extra") return TRAZADOC_MAX_FILE_BYTES_FULL;
  return null;
}

/** Mensaje de usuario para un archivo por encima del tope de su plan. */
export function cprFileTooLargeMessage(maxBytes: number): string {
  return `El archivo supera el tamaño máximo permitido (${Math.floor(maxBytes / (1024 * 1024))} MB).`;
}

export type CprObjectVerificationInput = {
  /** Tamaño reservado en el intent (declarado por el cliente en begin). */
  expectedSizeBytes: number;
  /** MIME reservado en el intent (declarado por el cliente en begin). */
  expectedMimeType: string;
  /** Tamaño FÍSICO leído por el servidor de Storage; null = no verificable. */
  realSizeBytes: number | null;
  /** Content-Type FÍSICO almacenado; null = no verificable. */
  realMimeType: string | null;
};

/**
 * A05/A06/A07 · Coherencia entre lo reservado y lo REALMENTE almacenado.
 * Devuelve un mensaje de error apto para el usuario, o null si el objeto es
 * consistente. Fail-closed: la ausencia de metadata es un error, nunca un
 * "supongamos que está bien".
 */
export function validateCprUploadedObject(input: CprObjectVerificationInput): string | null {
  // A05 · El objeto no existe, o su metadata no pudo consultarse.
  if (input.realSizeBytes === null) {
    return "El archivo subido no pudo verificarse en el almacenamiento. Intenta subirlo de nuevo.";
  }
  if (input.realSizeBytes <= 0) {
    return "El archivo subido está vacío o no pudo verificarse. Intenta subirlo de nuevo.";
  }
  // A06 · El tamaño FÍSICO manda. Igualdad estricta con lo reservado, igual
  // que el contrato de Textiles: un objeto mayor que su reserva no se
  // finaliza informando el tamaño pequeño.
  if (input.realSizeBytes !== input.expectedSizeBytes) {
    return "El tamaño del archivo subido no coincide con el reservado. Intenta subirlo de nuevo.";
  }
  // A07 · El Content-Type almacenado debe corresponder al declarado. No basta
  // por sí solo (lo fija el navegador), pero una discrepancia ya es motivo de
  // rechazo antes incluso de mirar los bytes.
  if (input.realMimeType === null) {
    return "El tipo del archivo subido no pudo verificarse. Intenta subirlo de nuevo.";
  }
  if (input.realMimeType !== input.expectedMimeType) {
    return "El tipo del archivo subido no corresponde al declarado. Intenta subirlo de nuevo.";
  }
  return null;
}

/** Firma OLE2 (Compound File Binary): .doc y .xls heredados, que TrazaDocs ya
 *  admitía antes de T9F.5B. Se comprueba su magia real para no aceptar
 *  cualquier binario bajo esos MIME. Limitación documentada: OLE2 no
 *  distingue Word de Excel — riesgo residual declarado en el informe. */
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const LEGACY_OLE2_MIME: Record<string, string> = {
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
};

function hasOle2Magic(bytes: Uint8Array): boolean {
  if (bytes.length < OLE2_MAGIC.length) return false;
  return OLE2_MAGIC.every((b, i) => bytes[i] === b);
}

/**
 * A07 · Verificación de FIRMA BINARIA para CPR/TrazaDocs.
 *
 * Reutiliza sin modificarlo el validador de Textiles (T9E.2/T9E.3) para los
 * tipos que este cubre (PDF, PNG, JPEG, WebP, DOCX con parser ZIP real, XLSX,
 * CSV con UTF-8 estricto) y añade únicamente la comprobación de la magia OLE2
 * para los formatos heredados .doc/.xls que TrazaDocs YA permitía — no se
 * incorpora ningún tipo nuevo a la lista.
 *
 * Cualquier tipo cuya firma no pueda asegurarse FALLA CERRADO.
 */
export function validateCprBinarySignature(input: {
  bytes: Uint8Array;
  fileName: string;
  declaredMimeType: string;
  storedContentType: string | null;
}): string | null {
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const legacyMime = LEGACY_OLE2_MIME[ext];
  if (legacyMime) {
    if (input.declaredMimeType !== legacyMime) {
      return "El tipo declarado no corresponde a la extensión del archivo.";
    }
    if (input.storedContentType !== null && input.storedContentType !== legacyMime) {
      return "El tipo almacenado no corresponde al archivo declarado. Sube el archivo de nuevo.";
    }
    if (!hasOle2Magic(input.bytes)) {
      return "El contenido del archivo no corresponde al tipo declarado. Verifica el archivo e inténtalo de nuevo.";
    }
    return null;
  }
  return validateTextileEvidenceBinarySignature(input);
}
