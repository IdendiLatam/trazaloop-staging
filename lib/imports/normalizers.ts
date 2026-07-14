/**
 * Trazaloop · Sprint 7 · Normalizadores PUROS de valores de importación.
 * Sin dependencias externas; testeables sin BD.
 */

export type NumberResult = { ok: true; value: number } | { ok: false; error: string };

/** Texto vacío o solo espacios → null (campo "no informado"). */
export function normalizeText(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  return v === "" ? null : v;
}

/** Número genérico: acepta punto o coma decimal; vacío = null (campo opcional). */
export function normalizeOptionalNumber(raw: string | undefined): NumberResult & { isEmpty?: boolean } {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: true, value: NaN, isEmpty: true };
  const normalized = v.replace(",", ".");
  const n = Number(normalized);
  if (Number.isNaN(n)) return { ok: false, error: `"${raw}" no es un número válido.` };
  return { ok: true, value: n };
}

/** Masa en kg: obligatoria y > 0. */
export function normalizeMassKg(raw: string | undefined): NumberResult {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: false, error: "La masa (kg) es obligatoria." };
  const r = normalizeOptionalNumber(v);
  if (!r.ok) return r;
  if (r.value <= 0) return { ok: false, error: "La masa (kg) debe ser mayor que 0." };
  return { ok: true, value: r.value };
}

/** Masa opcional en kg: si viene informada, debe ser > 0. */
export function normalizeOptionalPositiveNumber(
  raw: string | undefined,
  label: string
): { ok: true; value: number | null } | { ok: false; error: string } {
  const r = normalizeOptionalNumber(raw);
  if (!r.ok) return { ok: false, error: r.error };
  if (r.isEmpty) return { ok: true, value: null };
  if (r.value <= 0) return { ok: false, error: `${label} debe ser mayor que 0.` };
  return { ok: true, value: r.value };
}

/** Porcentaje opcional 0–100. */
export function normalizePercent(
  raw: string | undefined
): { ok: true; value: number | null } | { ok: false; error: string } {
  const r = normalizeOptionalNumber(raw);
  if (!r.ok) return { ok: false, error: r.error };
  if (r.isEmpty) return { ok: true, value: null };
  if (r.value < 0 || r.value > 100) {
    return { ok: false, error: "El porcentaje debe estar entre 0 y 100." };
  }
  return { ok: true, value: r.value };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha obligatoria AAAA-MM-DD. */
export function normalizeRequiredDate(
  raw: string | undefined,
  label = "La fecha"
): { ok: true; value: string } | { ok: false; error: string } {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: false, error: `${label} es obligatoria.` };
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
    return { ok: false, error: `${label} debe ser una fecha válida en formato AAAA-MM-DD.` };
  }
  return { ok: true, value: v };
}

/** Fecha opcional AAAA-MM-DD. */
export function normalizeOptionalDate(
  raw: string | undefined,
  label = "La fecha"
): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: true, value: null };
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) {
    return { ok: false, error: `${label} debe ser una fecha válida en formato AAAA-MM-DD.` };
  }
  return { ok: true, value: v };
}

const TRUE_VALUES = new Set(["true", "1", "si", "sí", "yes", "verdadero"]);
const FALSE_VALUES = new Set(["false", "0", "no", "falso"]);

/** Booleano opcional (por defecto false si no viene informado). */
export function normalizeOptionalBoolean(
  raw: string | undefined,
  label: string
): { ok: true; value: boolean } | { ok: false; error: string } {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "") return { ok: true, value: false };
  if (TRUE_VALUES.has(v)) return { ok: true, value: true };
  if (FALSE_VALUES.has(v)) return { ok: true, value: false };
  return { ok: false, error: `${label} debe ser true/false, sí/no o 1/0.` };
}
