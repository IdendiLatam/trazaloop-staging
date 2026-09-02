/**
 * Trazaloop · PE-04B5 · Cómo se lee un plan en castellano.
 *
 * La consola comercial la usa una persona que decide precios, no quien escribió
 * el esquema. `ai_weighted_credits_monthly` no es una condición comercial: es
 * una clave. Aquí viven las etiquetas y el formato; el detalle técnico queda
 * secundario, no oculto.
 */
export const RESOURCE_LABEL: Record<string, string> = {
  storage_bytes: "Almacenamiento",
  ai_weighted_credits_monthly: "Créditos de Intelligence",
  ai_runs_per_month: "Ejecuciones de Intelligence (heredado)",
  active_minutes_daily: "Uso diario de la plataforma",
  active_minutes_monthly: "Uso mensual de la plataforma",
  functional_support_cases_monthly: "Orientación funcional",
  functional_support_enabled: "Orientación funcional disponible",
  technical_report_enabled: "Informe técnico",
  team_members: "Personas del equipo",
  roles_enabled: "Roles y permisos",
  documents_trazadocs: "Documentos de TrazaDocs",
  evidences: "Evidencias",
  suppliers: "Proveedores",
  materials: "Materiales",
  products: "Productos",
  production_orders: "Órdenes de producción",
  input_batches: "Lotes de entrada",
  output_batches: "Lotes producidos",
  imports_enabled: "Importaciones",
  diagnostic_recommendations_enabled: "Recomendaciones del diagnóstico",
  daily_metered_operations: "Operaciones medidas al día",
};

/** El orden en que una persona quiere leerlo: primero lo que se vende. */
export const RESOURCE_ORDER: readonly string[] = [
  "storage_bytes",
  "ai_weighted_credits_monthly",
  "active_minutes_daily",
  "active_minutes_monthly",
  "functional_support_cases_monthly",
  "team_members",
  "roles_enabled",
  "imports_enabled",
];

export function resourceLabel(code: string): string {
  return RESOURCE_LABEL[code] ?? code;
}

export function formatLimit(
  code: string,
  state: "finite" | "unlimited" | "not_configured",
  value: number | null
): string {
  if (state === "unlimited") return "Sin límite";
  // Sin configurar NO es cero ni «sin límite»: es que nadie lo ha decidido, y
  // quien lo lea debe saber que ahí falta una decisión.
  if (state === "not_configured" || value === null) return "Sin configurar";

  if (code === "storage_bytes") {
    const mib = value / (1024 * 1024);
    return mib >= 1024 ? `${(mib / 1024).toFixed(mib % 1024 === 0 ? 0 : 1)} GiB` : `${Math.round(mib)} MiB`;
  }
  if (code === "active_minutes_daily") return `${value} min al día`;
  if (code === "active_minutes_monthly") return `${value} min al mes`;
  if (code === "ai_weighted_credits_monthly") return `${value} créditos al mes`;
  if (code === "functional_support_cases_monthly") {
    return value === 0 ? "No incluida" : `${value} ${value === 1 ? "caso" : "casos"} al mes`;
  }
  if (code.endsWith("_enabled")) return value > 0 ? "Sí" : "No";
  return String(value);
}

/** Los precios se guardan en unidades menores y ANTES de impuestos. */
export function formatPrice(minor: number | null, currency: string | null): string {
  if (minor === null) return "Sin configurar";
  const valor = (minor / 100).toLocaleString("es-CO", { minimumFractionDigits: 0 });
  return `${currency ?? "USD"} ${valor}`;
}

export const PRICE_TAX_NOTE = "Los precios son ANTES DE IMPUESTOS · IVA aplicable según el país.";

export const PLAN_DISPLAY_ORDER: readonly string[] = ["free", "full", "extra"];

export type RevisionChange = { label: string; before: string; after: string };

/**
 * Qué cambia entre dos revisiones, en palabras. Publicar condiciones
 * comerciales es consecuente: confirmar sobre un JSON no es confirmar, es
 * pulsar «sí» sobre algo que nadie leyó.
 */
export function describeRevisionChanges(
  antes: { monthly: number | null; annual: number | null; currency: string | null; limits: Map<string, { state: "finite" | "unlimited" | "not_configured"; value: number | null }> } | null,
  despues: { monthly: number | null; annual: number | null; currency: string | null; limits: Map<string, { state: "finite" | "unlimited" | "not_configured"; value: number | null }> }
): RevisionChange[] {
  const cambios: RevisionChange[] = [];
  const precioAntes = antes ? formatPrice(antes.monthly, antes.currency) : "—";
  const precioDespues = formatPrice(despues.monthly, despues.currency);
  if (precioAntes !== precioDespues) {
    cambios.push({ label: "Precio mensual", before: precioAntes, after: precioDespues });
  }
  const anualAntes = antes ? formatPrice(antes.annual, antes.currency) : "—";
  const anualDespues = formatPrice(despues.annual, despues.currency);
  if (anualAntes !== anualDespues) {
    cambios.push({ label: "Precio anual", before: anualAntes, after: anualDespues });
  }
  const claves = new Set([...(antes?.limits.keys() ?? []), ...despues.limits.keys()]);
  for (const code of RESOURCE_ORDER.filter((c) => claves.has(c)).concat(
    [...claves].filter((c) => !RESOURCE_ORDER.includes(c)).sort()
  )) {
    const a = antes?.limits.get(code);
    const d = despues.limits.get(code);
    const sa = a ? formatLimit(code, a.state, a.value) : "—";
    const sd = d ? formatLimit(code, d.state, d.value) : "—";
    if (sa !== sd) cambios.push({ label: resourceLabel(code), before: sa, after: sd });
  }
  return cambios;
}
