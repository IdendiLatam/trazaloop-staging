/**
 * Trazaloop · Sprint 7 · Parseo y validación de encabezado PUROS.
 * Reutiliza el parser CSV existente (lib/csv.ts, Sprint 2) en vez de
 * duplicarlo; aquí se agrega lo específico de la carga masiva: encabezados
 * prohibidos, columnas obligatorias, filas vacías y tamaño/codificación.
 */
import { parseCsv } from "@/lib/csv";
import { requiredHeader } from "./templates";
import type { ImportEntityType, HeaderValidation } from "./types";

/** Columnas que un CSV de carga NUNCA puede traer: organization_id no viaja
 *  jamás desde el cliente (Parte 7, regla 1 y 2 del Sprint 7). Se incluyen
 *  variantes de escritura razonables. */
const FORBIDDEN_HEADERS = new Set([
  "organization_id",
  "organization id",
  "org_id",
  "organizationid",
]);

export function normalizeHeaderCell(h: string): string {
  return h.trim().toLowerCase();
}

/** Valida el encabezado de un CSV para una entidad: rechaza columnas
 *  prohibidas, exige SOLO las columnas marcadas required: true en la
 *  plantilla (Sprint 7.1). Las columnas opcionales pueden estar ausentes
 *  del todo — se tratan como valor vacío/null fila por fila (ver
 *  validators.ts, que ya acepta `undefined` en todo campo opcional).
 *  Columnas de más (conocidas u opcionales no incluidas) no rompen nada:
 *  se ignoran si no se reconocen, o se leen si coinciden con una opcional. */
export function validateHeader(entity: ImportEntityType, header: string[]): HeaderValidation {
  const normalized = header.map(normalizeHeaderCell);

  const forbidden = normalized.filter((h) => FORBIDDEN_HEADERS.has(h));
  if (forbidden.length > 0) {
    return {
      ok: false,
      error:
        `El archivo trae una columna no permitida (${forbidden.join(", ")}). ` +
        "La organización siempre es la empresa activa de tu sesión; nunca se acepta desde el archivo.",
      normalizedHeader: normalized,
    };
  }

  const required = requiredHeader(entity);
  const missing = required.filter((c) => !normalized.includes(c));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Faltan columnas obligatorias en el encabezado: ${missing.join(", ")}.`,
      normalizedHeader: normalized,
    };
  }

  return { ok: true, error: null, normalizedHeader: normalized };
}

export type ParsedCsv = {
  header: string[];
  /** Filas ya mapeadas a objetos {columna: valor}, en el mismo orden del
   *  archivo. parseCsv ya descarta filas totalmente vacías. */
  rows: Record<string, string>[];
  error: string | null;
};

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB (Parte 9: tamaño máximo).
const MAX_ROWS = 5000;

/** true si el texto tiene caracteres de reemplazo (U+FFFD), señal de bytes
 *  no válidos en UTF-8 que el decodificador reemplazó al leer el archivo. */
export function hasInvalidUtf8(text: string): boolean {
  return text.includes("\uFFFD");
}

/** Parseo completo: valida tamaño, codificación, encabezado y arma las
 *  filas como objetos. No valida REGLAS de negocio (eso es validators.ts,
 *  que además necesita datos de referencia de la empresa activa). */
export function parseImportCsv(entity: ImportEntityType, csvText: string): ParsedCsv {
  const empty: ParsedCsv = { header: [], rows: [], error: null };

  if (new TextEncoder().encode(csvText).length > MAX_FILE_BYTES) {
    return { ...empty, error: `El archivo supera el tamaño máximo permitido (${MAX_FILE_BYTES / (1024 * 1024)} MB).` };
  }
  if (hasInvalidUtf8(csvText)) {
    return { ...empty, error: "El archivo no está codificado en UTF-8 válido. Guarda el CSV con codificación UTF-8." };
  }

  const parsed = parseCsv(csvText);
  if (parsed.length === 0) {
    return { ...empty, error: "El archivo está vacío." };
  }
  if (parsed.length < 2) {
    return {
      ...empty,
      error: "El archivo no tiene filas de datos. Descarga la plantilla y complétala con datos reales.",
    };
  }

  const headerValidation = validateHeader(entity, parsed[0]);
  if (!headerValidation.ok) {
    return { ...empty, error: headerValidation.error };
  }

  const dataRows = parsed.slice(1);
  if (dataRows.length > MAX_ROWS) {
    return { ...empty, error: `El archivo supera el máximo de ${MAX_ROWS} filas por carga. Divídelo en varios archivos.` };
  }

  const header = headerValidation.normalizedHeader;
  const rows: Record<string, string>[] = dataRows.map((cells) => {
    const row: Record<string, string> = {};
    header.forEach((col, idx) => {
      row[col] = (cells[idx] ?? "").trim();
    });
    return row;
  });

  return { header, rows, error: null };
}
