/**
 * Trazaloop · Sprint PCR-01 (punto 13) · Variables de proceso SIN JSON manual.
 *
 * Lógica PURA (sin BD, sin servidor, sin React): parseo defensivo del JSONB
 * legado de production_orders.process_variables y serialización al formato
 * canónico. Testeable directamente (tests/unit/pcr01-process-variables.test.ts).
 *
 * FORMATO CANÓNICO (lo que escribe el editor humano):
 *   [{ "name": "Temperatura", "value": 185, "unit": "°C" }, ...]
 *   · value se guarda como number cuando el texto es numérico; si no, string.
 *   · unit es opcional (null cuando vacía).
 *
 * COMPATIBILIDAD (lo que puede venir de la BD):
 *   · null / undefined            → sin variables.
 *   · [] o [{name,value,unit}]    → formato canónico (o compatible).
 *   · {"temperatura_c": 210, ...} → objeto plano legacy: cada par clave→valor
 *     primitivo se convierte en una fila SIN pérdida de información.
 *   · Cualquier otra estructura (anidada, arrays de escalares, escalares
 *     sueltos, JSON malformado guardado como texto) → NO se destruye: se
 *     conserva tal cual como "legado no editable" y solo se reemplaza si el
 *     usuario decide editarlo. Nunca se muestra JSON crudo como editor.
 */

export type ProcessVariableRow = {
  name: string;
  value: string; // en el editor siempre es texto; se numeriza al serializar
  unit: string;
};

export type ParsedProcessVariables = {
  rows: ProcessVariableRow[];
  /** JSON legado que no pudo representarse como filas SIN pérdida. Se
   *  conserva íntegro y solo se sobrescribe si el usuario edita. */
  unparsedRaw: string | null;
};

const isPrimitive = (v: unknown): v is string | number | boolean =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean";

function rowFromCanonical(item: Record<string, unknown>): ProcessVariableRow | null {
  const name = item.name ?? item.variable;
  const value = item.value ?? item.valor;
  const unit = item.unit ?? item.unidad;
  if (typeof name !== "string" || name.trim() === "") return null;
  if (value === undefined || value === null || !isPrimitive(value)) return null;
  if (unit !== undefined && unit !== null && typeof unit !== "string") return null;
  return { name: name.trim(), value: String(value), unit: typeof unit === "string" ? unit.trim() : "" };
}

/** Parseo DEFENSIVO del valor tal como llega de la BD (unknown). */
export function parseProcessVariables(value: unknown): ParsedProcessVariables {
  if (value === null || value === undefined) return { rows: [], unparsedRaw: null };

  // JSONB llega ya deserializado; pero si alguna vez llegara como texto,
  // se intenta interpretar sin romper.
  let data: unknown = value;
  if (typeof value === "string") {
    const raw = value.trim();
    if (raw === "") return { rows: [], unparsedRaw: null };
    try {
      data = JSON.parse(raw);
    } catch {
      return { rows: [], unparsedRaw: safeStringify(value) };
    }
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return { rows: [], unparsedRaw: null };
    const rows: ProcessVariableRow[] = [];
    for (const item of data) {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        return { rows: [], unparsedRaw: safeStringify(data) };
      }
      const row = rowFromCanonical(item as Record<string, unknown>);
      if (!row) return { rows: [], unparsedRaw: safeStringify(data) };
      rows.push(row);
    }
    return { rows, unparsedRaw: null };
  }

  if (typeof data === "object" && data !== null) {
    // Objeto plano legacy {clave: primitivo} → filas sin pérdida.
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return { rows: [], unparsedRaw: null };
    if (entries.every(([, v]) => isPrimitive(v))) {
      return {
        rows: entries.map(([k, v]) => ({ name: k, value: String(v), unit: "" })),
        unparsedRaw: null,
      };
    }
    return { rows: [], unparsedRaw: safeStringify(data) };
  }

  // Escalar suelto (número/booleano): estructura inesperada — se conserva.
  return { rows: [], unparsedRaw: safeStringify(data) };
}

/** Validación de las filas del editor. Devuelve un mensaje en español o null. */
export function validateProcessVariableRows(rows: ProcessVariableRow[]): string | null {
  for (const row of rows) {
    const name = row.name?.trim() ?? "";
    const value = row.value?.trim() ?? "";
    if (name === "" && value === "") continue; // fila vacía: se ignora
    if (name === "") return "Cada variable de proceso necesita un nombre.";
    if (value === "") return `La variable "${name}" necesita un valor.`;
    if (name.length > 120) return "El nombre de una variable no puede superar 120 caracteres.";
    if (value.length > 120) return "El valor de una variable no puede superar 120 caracteres.";
    if ((row.unit ?? "").length > 40) return "La unidad de una variable no puede superar 40 caracteres.";
  }
  return null;
}

/** Serializa filas del editor al formato canónico para JSONB (o null si no hay). */
export function serializeProcessVariableRows(
  rows: ProcessVariableRow[]
): Array<{ name: string; value: string | number; unit: string | null }> | null {
  const cleaned = rows
    .map((r) => ({ name: (r.name ?? "").trim(), value: (r.value ?? "").trim(), unit: (r.unit ?? "").trim() }))
    .filter((r) => r.name !== "" || r.value !== "");
  if (cleaned.length === 0) return null;
  return cleaned.map((r) => {
    const asNumber = Number(r.value);
    const numeric = r.value !== "" && !Number.isNaN(asNumber) && /^-?\d+(\.\d+)?$/.test(r.value);
    return {
      name: r.name,
      value: numeric ? asNumber : r.value,
      unit: r.unit === "" ? null : r.unit,
    };
  });
}

/** Resumen legible para mostrar en detalle (nunca JSON crudo). */
export function formatProcessVariablesSummary(value: unknown): string | null {
  const parsed = parseProcessVariables(value);
  if (parsed.rows.length === 0) {
    return parsed.unparsedRaw ? "Variables registradas en formato heredado" : null;
  }
  return parsed.rows
    .map((r) => `${r.name}: ${r.value}${r.unit ? ` ${r.unit}` : ""}`)
    .join(" · ");
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return "";
  }
}
