/**
 * PCR-03.1 · Dominio PURO de la gobernanza de evidencias.
 *
 * La evidencia deja de ser "archivo asociado": tiene estado de revisión
 * interna, medio de conservación (digital/físico/híbrido) y tipología.
 * Nomenclatura interna PRESERVADA (enum evidence_status de 0002:
 * pending/valid/rejected/expired — 'valid' ES la aceptación interna);
 * "Archivada" se deriva de archived_at, ortogonal al estado.
 *
 * Lenguaje prudente obligatorio: Trazaloop no certifica ni dictamina —
 * "Aceptada internamente", nunca "aprobada/cumple".
 */

export const EVIDENCE_MEDIA = ["digital", "physical", "hybrid"] as const;
export type EvidenceMedium = (typeof EVIDENCE_MEDIA)[number];

export const EVIDENCE_MEDIUM_LABEL: Record<EvidenceMedium, string> = {
  digital: "Archivo digital",
  physical: "Registro físico declarado",
  hybrid: "Digital + físico",
};

/** Estado de revisión visible (5.1). 'valid' = aceptación INTERNA. */
export const EVIDENCE_REVIEW_LABEL: Record<string, string> = {
  pending: "Pendiente de revisión",
  valid: "Aceptada internamente",
  rejected: "Rechazada",
  expired: "Vencida",
};

export const EVIDENCE_ARCHIVED_LABEL = "Archivada";

/** Tipologías (5.3) — AMPLIACIÓN ADITIVA sobre evidence_type (texto libre
 *  en 0019): valores namespaced nuevos + etiquetas; los valores históricos
 *  se muestran tal cual. Nada se migra ni se rompe. */
export const EVIDENCE_CATEGORIES = [
  "origin_supplier",
  "traceability",
  "quality_control",
  "non_conformity",
  "customer_claim",
  "customer_requirement",
  "recycled_content_support",
  "other_support",
] as const;
export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

export const EVIDENCE_CATEGORY_LABEL: Record<EvidenceCategory, string> = {
  origin_supplier: "Origen / proveedor",
  traceability: "Trazabilidad",
  quality_control: "Control de calidad",
  non_conformity: "No conformidad",
  customer_claim: "Reclamación / queja de cliente",
  customer_requirement: "Acuerdo o requisito de cliente",
  recycled_content_support: "Declaración / soporte de contenido reciclado",
  other_support: "Otro soporte técnico o documental",
};

export function evidenceCategoryLabel(value: string | null): string {
  if (!value) return "Sin tipo";
  return EVIDENCE_CATEGORY_LABEL[value as EvidenceCategory] ?? value;
}

// ===========================================================================
// PT-01 · LA FUENTE ÚNICA DEL TIPO DE EVIDENCIA
// ---------------------------------------------------------------------------
// Antes de este sprint, `evidences.evidence_type` se alimentaba desde dos
// sitios con dos vocabularios: el formulario digital tenía un campo de TEXTO
// LIBRE con ejemplos en prosa castellana, y el de evidencia física un
// desplegable cerrado sobre EVIDENCE_CATEGORIES. El filtro de la lista usaba
// el desplegable.
//
// La consecuencia era silenciosa y completa: toda evidencia creada por el
// camino normal quedaba INVISIBLE al filtro por tipo, salvo que la persona
// hubiera escrito a mano exactamente `origin_supplier`.
//
// La lista canónica es la de arriba y no se amplía: este sprint unifica de
// dónde sale, no qué contiene. Ampliar el vocabulario sería absorber alcance
// nuevo mientras se arregla un fallo.
// ===========================================================================

/** Opciones del selector. UN solo sitio para los tres formularios y el filtro. */
export const EVIDENCE_TYPE_OPTIONS: ReadonlyArray<{ value: EvidenceCategory; label: string }> =
  EVIDENCE_CATEGORIES.map((value) => ({ value, label: EVIDENCE_CATEGORY_LABEL[value] }));

/**
 * Traducciones INEQUÍVOCAS de lo que se escribió a mano antes del catálogo.
 *
 * Solo entra aquí lo que no admite otra lectura. `record` —el único valor que
 * existe hoy en la base local— NO está: podría ser un registro de recepción,
 * un registro de control o un registro de producción, y elegir uno sería
 * inventarse el dato de otra persona.
 *
 * Esto NO se usa para reescribir filas. Se usa para AGRUPAR al presentar y
 * para sugerir al editar. La columna conserva lo que la persona escribió.
 */
const LEGACY_TYPE_ALIASES: Record<string, EvidenceCategory> = {
  "declaracion de proveedor": "origin_supplier",
  "declaración de proveedor": "origin_supplier",
  "ficha del material": "origin_supplier",
  "ficha tecnica": "origin_supplier",
  "ficha técnica": "origin_supplier",
  "soporte de origen": "origin_supplier",
  "registro de recepcion": "traceability",
  "registro de recepción": "traceability",
  "trazabilidad": "traceability",
  "control de calidad": "quality_control",
  "no conformidad": "non_conformity",
  "contenido reciclado": "recycled_content_support",
};

export function isKnownEvidenceType(value: string | null | undefined): value is EvidenceCategory {
  return !!value && (EVIDENCE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * El código canónico equivalente a un valor guardado, o `null` si no lo hay.
 *
 * Devolver `null` es una respuesta, no un fallo: significa «esto se escribió
 * antes del catálogo y no sé traducirlo». Quien lo llame debe enseñar el valor
 * real, jamás sustituirlo por «Otro».
 */
export function canonicalEvidenceType(value: string | null | undefined): EvidenceCategory | null {
  if (!value) return null;
  if (isKnownEvidenceType(value)) return value;
  return LEGACY_TYPE_ALIASES[value.trim().toLowerCase()] ?? null;
}

/** Cómo se agrupa en la lista lo que el catálogo no reconoce. */
export const UNCATALOGUED_EVIDENCE_TYPE_LABEL = "Tipo no catalogado";

/**
 * Etiqueta de presentación de un tipo guardado.
 *
 * Un valor legacy sale TAL CUAL, con su marca. Inventarle un nombre bonito
 * escondería que existe, y lo que no se ve no se normaliza nunca.
 */
export function evidenceTypeDisplay(
  value: string | null
): { label: string; uncatalogued: boolean } {
  if (!value) return { label: "Sin tipo", uncatalogued: false };
  if (isKnownEvidenceType(value)) {
    return { label: EVIDENCE_CATEGORY_LABEL[value], uncatalogued: false };
  }
  return { label: value, uncatalogued: true };
}

// ===========================================================================
// PT-01 · VIGENCIA: EL PRESENTE Y LA HISTORIA SON DOS PREGUNTAS DISTINTAS
// ---------------------------------------------------------------------------
// El catálogo enseña el ESTADO ACTUAL (PT-F01). El cálculo pregunta otra
// cosa: si la evidencia amparaba una operación en la fecha en que esa
// operación ocurrió (PT-F02). Una evidencia hoy obsoleta puede seguir siendo
// perfectamente válida para un lote recibido cuando estaba vigente.
//
// SEMÁNTICA ÚNICA, y aquí se declara para que la base, la interfaz y las
// pruebas usen la misma: `valid_until` es INCLUSIVO. Una evidencia con
// valid_until = 2026-06-30 ampara una operación del 2026-06-30.
//
// `valid_until IS NULL` significa «sin vencimiento declarado», que es el caso
// mayoritario y NO es lo mismo que «vencida».
// ===========================================================================

/** ¿La vigencia terminó A DÍA DE HOY? Solo para el catálogo (PT-F01). */
export function isEvidenceExpiredNow(validUntil: string | null, today: string): boolean {
  if (!validUntil) return false;
  return validUntil < today;
}

/**
 * ¿La evidencia era aplicable en `referenceDate`? (PT-F02/F03)
 *
 * Jamás compara contra el día de hoy: esa comparación es la que hacía que el
 * paso del calendario cambiara un cálculo, y PT-F04 la prohíbe.
 */
export function isEvidenceApplicableAt(
  input: { validFrom?: string | null; validUntil: string | null },
  referenceDate: string
): boolean {
  if (input.validFrom && input.validFrom > referenceDate) return false;
  if (input.validUntil && input.validUntil < referenceDate) return false;
  return true;
}

/** Etiqueta del catálogo: estado ACTUAL de la vigencia (PT-F01). */
export function evidenceValidityLabel(validUntil: string | null, today: string): string {
  if (!validUntil) return "Sin vencimiento declarado";
  return isEvidenceExpiredNow(validUntil, today)
    ? `Obsoleta desde ${validUntil}`
    : `Vigente hasta ${validUntil}`;
}

/**
 * Los destinos que `validate_evidence_link_org()` sabe resolver de verdad.
 *
 * El enum `evidence_target_type` declara ONCE valores; el disparador resuelve
 * NUEVE. `document` y `requirement` caen en su `else` y provocan una
 * excepción. Reescribir el tipo para quitarlos no compensa; dejar constancia
 * de la diferencia, sí — QUALITY-12.2D perdió tiempo con un adaptador que
 * enlazaba evidencias a documentos y devolvía siempre cero filas.
 */
export const SUPPORTED_EVIDENCE_TARGETS = [
  "site", "supplier", "material", "product", "product_family",
  "input_batch", "production_order", "output_batch", "customer_requirement",
] as const;
export type SupportedEvidenceTarget = (typeof SUPPORTED_EVIDENCE_TARGETS)[number];

/** Declarados en el enum pero NO soportados en escritura. */
export const UNSUPPORTED_EVIDENCE_TARGETS = ["document", "requirement"] as const;

/** ¿Cuenta como soporte VIGENTE por defecto? (5.1)
 *  · rechazada → jamás; · archivada → no, salvo consulta histórica;
 *  · vencida → no vigente; · pendiente → existe pero sin aceptación interna. */
export function isEvidenceCurrent(status: string, archivedAt: string | null): boolean {
  return status === "valid" && !archivedAt;
}

export function evidenceEffectiveLabel(status: string, archivedAt: string | null): string {
  const base = EVIDENCE_REVIEW_LABEL[status] ?? status;
  return archivedAt ? `${base} · ${EVIDENCE_ARCHIVED_LABEL}` : base;
}

/** Mensajes de dominio (espejo de la guarda 0106). */
export const EVIDENCE_REJECT_COMMENT_REQUIRED = "El motivo de rechazo es obligatorio.";
export const EVIDENCE_REVIEW_ROLE_MESSAGE =
  "Solo administrador o calidad pueden revisar una evidencia (aceptarla internamente o rechazarla).";
export const EVIDENCE_ARCHIVE_ROLE_MESSAGE =
  "Solo administrador o calidad pueden archivar o desarchivar una evidencia.";

/** Regla 5.2: el soporte físico jamás finge archivo. */
export function physicalMayHaveFile(): false {
  return false;
}
