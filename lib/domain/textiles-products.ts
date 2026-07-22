/**
 * Trazaloop · Sprint T4 (Textil) · Dominio PURO de productos, referencias
 * y composición estructurada. Sin BD ni sesión; testeable en
 * tests/products/textiles-products.test.ts. Los enums espejan los CHECK de
 * la migración 0074.
 *
 * LENGUAJE: el estado de composición describe COMPLETITUD de la
 * información registrada (¿suman ~100 % las fibras?), jamás cumplimiento,
 * certificación ni pasaporte oficial. Las declaraciones de reciclado u
 * orgánico son preliminares (ISO 14021 como referencia conceptual); las
 * evidencias llegan en T5.
 */

export const TEXTILE_COLLECTION_STATUSES = ["draft", "active", "archived"] as const;
export type TextileCollectionStatus = (typeof TEXTILE_COLLECTION_STATUSES)[number];
export const TEXTILE_COLLECTION_STATUS_LABEL: Record<TextileCollectionStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  archived: "Archivada",
};

export const TEXTILE_PRODUCT_CATEGORIES = [
  "shirt", "pants", "jacket", "dress", "t_shirt", "uniform", "workwear",
  "underwear", "home_textile", "accessory", "other",
] as const;
export type TextileProductCategory = (typeof TEXTILE_PRODUCT_CATEGORIES)[number];
export const TEXTILE_PRODUCT_CATEGORY_LABEL: Record<TextileProductCategory, string> = {
  shirt: "Camisa",
  pants: "Pantalón",
  jacket: "Chaqueta",
  dress: "Vestido",
  t_shirt: "Camiseta",
  uniform: "Uniforme",
  workwear: "Ropa de trabajo",
  underwear: "Ropa interior",
  home_textile: "Textil hogar",
  accessory: "Accesorio",
  other: "Otro",
};

export const TEXTILE_PRODUCT_STATUSES = ["draft", "active", "inactive", "obsolete"] as const;
export type TextileProductStatus = (typeof TEXTILE_PRODUCT_STATUSES)[number];
export const TEXTILE_PRODUCT_STATUS_LABEL: Record<TextileProductStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  inactive: "Inactivo",
  obsolete: "Obsoleto",
};

export const TEXTILE_COMPOSITION_STATUSES = [
  "not_started", "incomplete", "complete", "needs_review",
] as const;
export type TextileCompositionStatus = (typeof TEXTILE_COMPOSITION_STATUSES)[number];
export const TEXTILE_COMPOSITION_STATUS_LABEL: Record<TextileCompositionStatus, string> = {
  not_started: "No iniciada",
  incomplete: "Incompleta",
  complete: "Completa",
  needs_review: "Requiere revisión",
};

export const TEXTILE_FIBER_SCOPES = [
  "whole_product", "main_fabric", "secondary_fabric", "lining", "thread", "trim", "other",
] as const;
export type TextileFiberScope = (typeof TEXTILE_FIBER_SCOPES)[number];
export const TEXTILE_FIBER_SCOPE_LABEL: Record<TextileFiberScope, string> = {
  whole_product: "Producto completo",
  main_fabric: "Tela principal",
  secondary_fabric: "Tela secundaria",
  lining: "Forro",
  thread: "Hilo",
  trim: "Avío",
  other: "Otro",
};

export const TEXTILE_REFERENCE_MATERIAL_ROLES = [
  "main_fabric", "secondary_fabric", "lining", "thread", "interlining",
  "label", "packaging", "other",
] as const;
export type TextileReferenceMaterialRole = (typeof TEXTILE_REFERENCE_MATERIAL_ROLES)[number];
export const TEXTILE_REFERENCE_MATERIAL_ROLE_LABEL: Record<TextileReferenceMaterialRole, string> = {
  main_fabric: "Tela principal",
  secondary_fabric: "Tela secundaria",
  lining: "Forro",
  thread: "Hilo",
  interlining: "Entretela",
  label: "Etiqueta / marquilla",
  packaging: "Empaque",
  other: "Otro",
};

export const TEXTILE_REFERENCE_COMPONENT_ROLES = [
  "functional", "decorative", "identification", "packaging", "closure",
  "reinforcement", "other",
] as const;
export type TextileReferenceComponentRole = (typeof TEXTILE_REFERENCE_COMPONENT_ROLES)[number];
export const TEXTILE_REFERENCE_COMPONENT_ROLE_LABEL: Record<TextileReferenceComponentRole, string> = {
  functional: "Funcional",
  decorative: "Decorativo",
  identification: "Identificación",
  packaging: "Empaque",
  closure: "Cierre",
  reinforcement: "Refuerzo",
  other: "Otro",
};

export const TEXTILE_PRODUCTS_DISCLAIMER =
  "La información registrada de productos, referencias y composición es declarativa e " +
  "interna. No equivale a certificación ni validación externa, no acredita cumplimiento " +
  "normativo y no constituye un pasaporte digital oficial; las evidencias se gestionan " +
  "en una etapa posterior.";

/** Tolerancia de la suma de composición: 100 ± 0.5. */
export const COMPOSITION_COMPLETE_MIN = 99.5;
export const COMPOSITION_COMPLETE_MAX = 100.5;

export type FiberCompositionEntry = {
  scope: string;
  percentage: number;
};

export type ScopeTotal = {
  scope: string;
  total: number;
  status: TextileCompositionStatus;
};

export type CompositionEvaluation = {
  status: TextileCompositionStatus;
  scopeTotals: ScopeTotal[];
  warnings: string[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function statusForTotal(total: number): TextileCompositionStatus {
  if (total <= 0) return "not_started";
  if (total > COMPOSITION_COMPLETE_MAX) return "needs_review";
  if (total >= COMPOSITION_COMPLETE_MIN) return "complete";
  return "incomplete";
}

/**
 * Evalúa el estado de completitud de la composición de fibras.
 *
 * Regla base (encargo T4): la suma de porcentajes debe rondar 100 % — con
 * 100 ± 0.5 se considera "complete"; parcial es "incomplete"; por encima
 * de 100.5 es "needs_review"; sin filas es "not_started".
 *
 * La suma se evalúa POR ALCANCE (component_scope): mezclar "producto
 * completo" al 100 % con "forro" al 100 % no debe dar 200 %. El estado
 * global es el peor caso: needs_review si algún alcance excede; complete
 * solo si TODOS los alcances con datos están dentro del rango; incomplete
 * en el resto. Nunca bloquea el guardado — solo describe y advierte.
 */
export function computeReferenceComposition(
  entries: FiberCompositionEntry[]
): CompositionEvaluation {
  if (entries.length === 0) {
    return { status: "not_started", scopeTotals: [], warnings: [] };
  }

  const byScope = new Map<string, number>();
  for (const e of entries) {
    byScope.set(e.scope, (byScope.get(e.scope) ?? 0) + e.percentage);
  }

  const scopeTotals: ScopeTotal[] = [...byScope.entries()].map(([scope, sum]) => {
    const total = round2(sum);
    return { scope, total, status: statusForTotal(total) };
  });

  const warnings: string[] = [];
  for (const st of scopeTotals) {
    const label = TEXTILE_FIBER_SCOPE_LABEL[st.scope as TextileFiberScope] ?? st.scope;
    if (st.status === "needs_review") {
      warnings.push(`La suma de "${label}" es ${st.total} % (supera 100 %): revisa los porcentajes.`);
    } else if (st.status === "incomplete") {
      warnings.push(`La suma de "${label}" es ${st.total} % (menor a 100 %): la composición está incompleta.`);
    }
  }

  let status: TextileCompositionStatus;
  if (scopeTotals.some((s) => s.status === "needs_review")) {
    status = "needs_review";
  } else if (scopeTotals.every((s) => s.status === "complete")) {
    status = "complete";
  } else {
    status = "incomplete";
  }

  return { status, scopeTotals, warnings };
}

/** Resumen informativo de asociaciones (no bloqueante). */
export function summarizeReferenceAssociations(input: {
  materialRoles: string[];
  componentCount: number;
}): { hasMainMaterial: boolean; notes: string[] } {
  const hasMainMaterial = input.materialRoles.includes("main_fabric");
  const notes: string[] = [];
  if (!hasMainMaterial) {
    notes.push("Aún no hay un material con rol de tela principal asociado.");
  }
  if (input.componentCount === 0) {
    notes.push("Sin avíos/componentes registrados (opcional en esta etapa).");
  }
  return { hasMainMaterial, notes };
}

/** Porcentaje de formulario: número > 0 y <= 100 (hasta 2 decimales). */
export function parsePercentage(raw: unknown):
  | { value: number; error: null }
  | { value: null; error: string } {
  const text = typeof raw === "string" ? raw.trim().replace(",", ".") : String(raw ?? "");
  if (text.length === 0) return { value: null, error: "El porcentaje es obligatorio." };
  const num = Number(text);
  if (!Number.isFinite(num)) return { value: null, error: "El porcentaje debe ser un número." };
  const rounded = round2(num);
  if (rounded <= 0 || rounded > 100) {
    return { value: null, error: "El porcentaje debe ser mayor que 0 y hasta 100." };
  }
  return { value: rounded, error: null };
}
