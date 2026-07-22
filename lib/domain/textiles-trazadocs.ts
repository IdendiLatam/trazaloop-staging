/**
 * Trazaloop · Sprint T8 (Textil) · Dominio de TrazaDocs Textil. Reutiliza
 * el dominio TrazaDocs (estados, roles, versionado) y aporta solo lo
 * propio del módulo: categorías de agrupación, vínculos sugeridos con los
 * módulos textiles y el aviso de preparación documental.
 */

export const TEXTILE_TRAZADOCS_DISCLAIMER =
  "Estos documentos son herramientas internas de preparación documental. No equivalen " +
  "por sí solos a certificación, sello ni cumplimiento regulatorio automático.";

/** Categorías del listado (encargo T8 §13), en orden de presentación. */
export const TEXTILE_TRAZADOCS_CATEGORIES = [
  "Sistema documental textil",
  "Productos, composición y materiales",
  "Proveedores y evidencias",
  "Trazabilidad operativa",
  "Declaraciones ambientales",
  "Circularidad, diseño y fin de vida",
  "Gestión de no conformidades y capacitación",
  "Matriz de preparación documental",
] as const;
export type TextileTrazadocsCategory = (typeof TEXTILE_TRAZADOCS_CATEGORIES)[number];

const CATEGORY_BY_CODE: Record<string, TextileTrazadocsCategory> = {
  "TXT-MAN-001": "Sistema documental textil",
  "TXT-PRO-011": "Sistema documental textil",
  "TXT-PRO-002": "Productos, composición y materiales",
  "TXT-PRO-003": "Proveedores y evidencias",
  "TXT-PRO-004": "Proveedores y evidencias",
  "TXT-PRO-005": "Trazabilidad operativa",
  "TXT-PRO-006": "Declaraciones ambientales",
  "TXT-PRO-007": "Circularidad, diseño y fin de vida",
  "TXT-PRO-008": "Circularidad, diseño y fin de vida",
  "TXT-PRO-009": "Gestión de no conformidades y capacitación",
  "TXT-PRO-010": "Gestión de no conformidades y capacitación",
  "TXT-MAT-012": "Matriz de preparación documental",
};

export function textileTrazadocCategoryFor(code: string | null): TextileTrazadocsCategory {
  return (code && CATEGORY_BY_CODE[code]) || "Sistema documental textil";
}

/** Vínculos sugeridos hacia los módulos Textil, por estructura base. */
export const TEXTILE_TRAZADOCS_MODULE_LINKS: Record<string, Array<{ href: string; label: string }>> = {
  "TXT-MAN-001": [
    { href: "/textiles", label: "Módulo Textil" },
    { href: "/textiles/traceability", label: "Trazabilidad" },
    { href: "/textiles/circularity", label: "Circularidad" },
  ],
  "TXT-PRO-002": [
    { href: "/textiles/products", label: "Productos y referencias" },
    { href: "/textiles/catalogs", label: "Catálogos" },
  ],
  "TXT-PRO-003": [
    { href: "/textiles/catalogs", label: "Proveedores y procesos" },
    { href: "/textiles/evidences", label: "Evidencias" },
  ],
  "TXT-PRO-004": [
    { href: "/textiles/evidences", label: "Evidencias" },
    { href: "/textiles/traceability", label: "Trazabilidad" },
    { href: "/textiles/circularity", label: "Circularidad" },
  ],
  "TXT-PRO-005": [
    { href: "/textiles/traceability", label: "Trazabilidad" },
    { href: "/textiles/evidences", label: "Evidencias" },
  ],
  "TXT-PRO-006": [
    { href: "/textiles/evidences", label: "Evidencias" },
    { href: "/textiles/products", label: "Productos y referencias" },
  ],
  "TXT-PRO-007": [
    { href: "/textiles/circularity", label: "Circularidad" },
    { href: "/textiles/evidences", label: "Evidencias" },
  ],
  "TXT-PRO-008": [
    { href: "/textiles/catalogs", label: "Componentes" },
    { href: "/textiles/circularity", label: "Circularidad" },
  ],
  "TXT-PRO-009": [{ href: "/textiles/traceability", label: "Trazabilidad" }],
  "TXT-PRO-010": [{ href: "/textiles", label: "Módulo Textil" }],
  "TXT-PRO-011": [{ href: "/textiles/trazadocs", label: "TrazaDocs Textil" }],
  "TXT-MAT-012": [
    { href: "/textiles/evidences", label: "Evidencias" },
    { href: "/textiles/circularity", label: "Circularidad" },
    { href: "/textiles/traceability", label: "Trazabilidad" },
  ],
};
