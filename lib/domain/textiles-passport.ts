/**
 * Trazaloop · Sprint T9A (Textil) · Dominio base del pasaporte técnico
 * textil. En T9A solo se fijan las constantes/tipos compartidos y el
 * contrato del snapshot base; el builder completo desde fuentes es T9B.
 */

/** Versión de esquema embebida en todo snapshot (obligatoria). */
export const TEXTILE_PASSPORT_SCHEMA_VERSION = "textile_technical_passport_v1";

/** Versión de esquema de data_sources_json (T9A.2). */
export const TEXTILE_PASSPORT_SOURCES_SCHEMA_VERSION = "textile_technical_passport_sources_v1";

/** link_type específicos del pasaporte para vínculos de evidencia cuyo
 *  entity_type es 'technical_passport' (familia passport_*, T9A.2). Los
 *  genéricos general_support/other también se admiten. */
export const TEXTILE_PASSPORT_EVIDENCE_LINK_TYPES = [
  "passport_support",
  "passport_composition_support",
  "passport_traceability_support",
  "passport_circularity_support",
  "passport_claim_support",
  "passport_care_support",
  "passport_end_of_life_support",
  "passport_documentary_support",
] as const;
export type TextilePassportEvidenceLinkType = (typeof TEXTILE_PASSPORT_EVIDENCE_LINK_TYPES)[number];

/** Estados del pasaporte. Ciclo oficial:
 *  draft → generated → in_review → approved_internal → obsolete. */
export const TEXTILE_PASSPORT_STATUSES = [
  "draft",
  "generated",
  "in_review",
  "approved_internal",
  "obsolete",
] as const;
export type TextilePassportStatus = (typeof TEXTILE_PASSPORT_STATUSES)[number];

export const TEXTILE_PASSPORT_STATUS_LABEL: Record<TextilePassportStatus, string> = {
  draft: "Borrador",
  generated: "Generado",
  in_review: "En revisión",
  approved_internal: "Aprobado internamente",
  obsolete: "Obsoleto",
};

export function isTextilePassportStatus(value: string): value is TextilePassportStatus {
  return (TEXTILE_PASSPORT_STATUSES as readonly string[]).includes(value);
}

/** Advertencia obligatoria, presente en cada pasaporte generado. */
export const TEXTILE_PASSPORT_DISCLAIMER =
  "Este pasaporte técnico textil es una herramienta interna de preparación documental y " +
  "trazabilidad. No equivale a certificación, sello, declaración regulatoria oficial ni " +
  "pasaporte digital de producto oficial.";

/** Nota de alcance de la aprobación interna (nunca externa). */
export const TEXTILE_PASSPORT_INTERNAL_APPROVAL_NOTE =
  "Aprobado internamente describe la revisión interna de la empresa; no significa aprobado por una entidad externa.";

/** Las 14 secciones (orden de presentación). Estructura del snapshot; el
 *  contenido de cada sección lo llena T9B desde las fuentes (documento
 *  TEXTILES_PASSPORT_SECTION_MODEL.md). */
export const TEXTILE_PASSPORT_SECTION_KEYS = [
  "passport_identification",
  "product_identification",
  "fiber_composition",
  "materials",
  "components",
  "suppliers_processes",
  "evidences",
  "traceability",
  "circularity",
  "care_repair_eol",
  "claims",
  "trazadocs",
  "gaps_and_warnings",
  "executive_summary",
] as const;
export type TextilePassportSectionKey = (typeof TEXTILE_PASSPORT_SECTION_KEYS)[number];

/** Estados de completitud por sección (nunca "cumple/no cumple"). */
export const TEXTILE_PASSPORT_COMPLETENESS = [
  "documented",
  "partially_documented",
  "pending",
  "needs_review",
  "not_applicable",
] as const;
export type TextilePassportCompleteness = (typeof TEXTILE_PASSPORT_COMPLETENESS)[number];

/** Severidades de brecha (documento TEXTILES_PASSPORT_GAPS_AND_WARNINGS_MODEL.md). */
export const TEXTILE_PASSPORT_GAP_SEVERITIES = ["critical", "warning", "improvement", "info"] as const;
export type TextilePassportGapSeverity = (typeof TEXTILE_PASSPORT_GAP_SEVERITIES)[number];

/** Catálogo de gap_codes del pasaporte (documento
 *  TEXTILES_PASSPORT_GAPS_AND_WARNINGS_MODEL.md). La generación completa
 *  (T9B) emite un subconjunto; el resto queda para ampliaciones. */
export const TEXTILE_PASSPORT_GAP_CODES = [
  "PAS-COMP-001", "PAS-COMP-002", "PAS-COMP-003",
  "PAS-EVID-001", "PAS-EVID-002", "PAS-EVID-003",
  "PAS-CLAIM-001", "PAS-CLAIM-002",
  "PAS-TRACE-001", "PAS-TRACE-002", "PAS-TRACE-003", "PAS-TRACE-004", "PAS-TRACE-005",
  "PAS-CIRC-001", "PAS-CIRC-002", "PAS-CIRC-003",
  "PAS-SEP-001", "PAS-SEP-002", "PAS-SEP-003",
  "PAS-DOC-001", "PAS-DOC-002", "PAS-DOC-003", "PAS-DOC-004",
  "PAS-DATA-001", "PAS-DATA-002",
] as const;
export type TextilePassportGapCode = (typeof TEXTILE_PASSPORT_GAP_CODES)[number];

/** Prioridad de una recomendación estructurada (T9B.1). */
export const TEXTILE_PASSPORT_RECOMMENDATION_PRIORITIES = ["high", "medium", "low"] as const;
export type TextilePassportRecommendationPriority =
  (typeof TEXTILE_PASSPORT_RECOMMENDATION_PRIORITIES)[number];

/** Forma estable de una recomendación en recommendations_json (T9B.1).
 *  El builder del snapshot emite SIEMPRE objetos con esta forma —nunca
 *  strings sueltos—. */
export type TextilePassportRecommendation = {
  recommendation_code: string;
  section_key: TextilePassportSectionKey;
  message: string;
  priority: TextilePassportRecommendationPriority;
  related_gap_code: TextilePassportGapCode | null;
};

export type TextilePassportGap = {
  gap_code: string;
  severity: TextilePassportGapSeverity;
  section_key: TextilePassportSectionKey;
  message: string;
  source_entity_type?: string;
  source_entity_id?: string;
  recommendation?: string;
  blocking: boolean;
  generated_at?: string;
};

/** Forma mínima del snapshot base que produce la RPC de T9A. T9B extiende
 *  cada sección con su contenido real. */
export type TextilePassportBaseSnapshot = {
  schema_version: typeof TEXTILE_PASSPORT_SCHEMA_VERSION;
  generated_at: string;
  scope: "reference_only" | "reference_and_lot";
  passport: {
    reference_id: string;
    output_lot_id: string | null;
    circularity_assessment_id: string | null;
  };
  sections: Record<TextilePassportSectionKey, { completeness_status: TextilePassportCompleteness }>;
  disclaimer: string;
};

// ---------------------------------------------------------------------------
// T9C · Presentación (UI del pasaporte). Etiquetas, tonos y utilidades que
// consumen la UI y la vista de impresión. No alteran el snapshot.
// ---------------------------------------------------------------------------

/** Disclaimers de sección (texto visible obligatorio, espejo del snapshot). */
export const TEXTILE_PASSPORT_EVIDENCES_DISCLAIMER =
  "La aceptación interna de una evidencia no equivale a certificación externa ni validación por una autoridad.";
export const TEXTILE_PASSPORT_CIRCULARITY_DISCLAIMER =
  "La evaluación de circularidad es una herramienta técnica interna. No equivale a certificación, cumplimiento regulatorio ni pasaporte oficial.";

/** Etiquetas legibles de completitud (para badges; nunca "cumple/no cumple"). */
export const TEXTILE_PASSPORT_COMPLETENESS_LABEL: Record<TextilePassportCompleteness, string> = {
  documented: "Documentado",
  partially_documented: "Parcialmente documentado",
  pending: "Pendiente",
  needs_review: "Requiere revisión",
  not_applicable: "No aplica",
};

/** Tono visual (clases Tailwind del sistema) por completitud. */
export const TEXTILE_PASSPORT_COMPLETENESS_TONE: Record<TextilePassportCompleteness, string> = {
  documented: "border-loop/30 bg-loop/5 text-loop-deep",
  partially_documented: "border-amber/40 bg-amber/10 text-amber",
  pending: "border-hairline bg-paper text-ink-soft",
  needs_review: "border-amber/40 bg-amber/10 text-amber",
  not_applicable: "border-hairline bg-paper text-ink-soft",
};

/** Tono visual por estado del pasaporte. */
export const TEXTILE_PASSPORT_STATUS_TONE: Record<TextilePassportStatus, string> = {
  draft: "border-hairline bg-paper text-ink-soft",
  generated: "border-loop/30 bg-loop/5 text-loop-deep",
  in_review: "border-amber/40 bg-amber/10 text-amber",
  approved_internal: "border-loop/40 bg-loop/10 text-loop-deep",
  obsolete: "border-hairline bg-paper text-ink-soft",
};

/** Tono visual por severidad de brecha. */
export const TEXTILE_PASSPORT_SEVERITY_TONE: Record<TextilePassportGapSeverity, string> = {
  critical: "border-danger/30 bg-danger/5 text-danger",
  warning: "border-amber/40 bg-amber/10 text-amber",
  improvement: "border-loop/30 bg-loop/5 text-loop-deep",
  info: "border-hairline bg-paper text-ink-soft",
};
export const TEXTILE_PASSPORT_SEVERITY_LABEL: Record<TextilePassportGapSeverity, string> = {
  critical: "Crítica",
  warning: "Advertencia",
  improvement: "Mejora",
  info: "Informativa",
};
export const TEXTILE_PASSPORT_PRIORITY_LABEL: Record<TextilePassportRecommendationPriority, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};
export const TEXTILE_PASSPORT_PRIORITY_TONE: Record<TextilePassportRecommendationPriority, string> = {
  high: "border-danger/30 bg-danger/5 text-danger",
  medium: "border-amber/40 bg-amber/10 text-amber",
  low: "border-hairline bg-paper text-ink-soft",
};

/** Etiquetas legibles por component_scope de composición. */
export const TEXTILE_PASSPORT_SCOPE_LABEL: Record<string, string> = {
  whole_product: "Producto completo",
  main_fabric: "Tela principal",
  secondary_fabric: "Tela secundaria",
  lining: "Forro",
  thread: "Hilo",
  trim: "Avíos",
  other: "Otro",
};

/** Etiqueta de la fuerza de soporte de una evidencia (vista). */
export const TEXTILE_PASSPORT_SUPPORT_STRENGTH_LABEL: Record<string, string> = {
  strong: "Soporte interno fuerte",
  in_review: "Soporte en revisión",
  warning: "Vencida (advertencia)",
  none: "Sin soporte activo",
};

/**
 * Transiciones de estado permitidas desde la UI. Refleja el contrato de la
 * RPC change_textile_technical_passport_status: la BD es la autoridad; esto
 * solo decide qué botones ofrecer. consultant no aprueba internamente.
 */
export type TextilePassportTransition = {
  to: TextilePassportStatus;
  label: string;
  /** Roles que pueden ejecutarla (además de admin/quality). */
  allowConsultant: boolean;
};
export function allowedTextilePassportTransitions(
  status: TextilePassportStatus
): TextilePassportTransition[] {
  switch (status) {
    case "generated":
      return [
        { to: "in_review", label: "Enviar a revisión", allowConsultant: true },
        { to: "obsolete", label: "Marcar obsoleto", allowConsultant: false },
      ];
    case "in_review":
      return [
        { to: "approved_internal", label: "Aprobar internamente", allowConsultant: false },
        { to: "obsolete", label: "Marcar obsoleto", allowConsultant: false },
      ];
    case "approved_internal":
      return [{ to: "obsolete", label: "Marcar obsoleto", allowConsultant: false }];
    case "draft":
      return [{ to: "obsolete", label: "Marcar obsoleto", allowConsultant: false }];
    case "obsolete":
    default:
      return [];
  }
}

/** ¿El pasaporte puede (re)generar snapshot desde la UI en este estado? */
export function canGenerateTextilePassport(status: TextilePassportStatus): boolean {
  return status === "draft" || status === "generated";
}

// ---------------------------------------------------------------------------
// T9D · Enlaces privados compartibles (tokenizados, revocables, con expiración)
// ---------------------------------------------------------------------------

/** Estados de un enlace compartible. */
export const TEXTILE_SHARE_LINK_STATUSES = ["active", "revoked", "expired", "disabled"] as const;
export type TextileShareLinkStatus = (typeof TEXTILE_SHARE_LINK_STATUSES)[number];

export const TEXTILE_SHARE_LINK_STATUS_LABEL: Record<TextileShareLinkStatus, string> = {
  active: "Activo",
  revoked: "Revocado",
  expired: "Expirado",
  disabled: "Deshabilitado",
};
export const TEXTILE_SHARE_LINK_STATUS_TONE: Record<TextileShareLinkStatus, string> = {
  active: "border-loop/30 bg-loop/5 text-loop-deep",
  revoked: "border-danger/30 bg-danger/5 text-danger",
  expired: "border-amber/40 bg-amber/10 text-amber",
  disabled: "border-hairline bg-paper text-ink-soft",
};

/** Opciones de expiración ofrecidas al crear un enlace (default 30 días). */
export const TEXTILE_SHARE_LINK_EXPIRY_OPTIONS = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
  { value: "none", label: "Sin expiración" },
] as const;
export const TEXTILE_SHARE_LINK_DEFAULT_EXPIRY_DAYS = 30;

/** Aviso de seguridad del enlace (texto visible en la UI interna). */
export const TEXTILE_SHARE_LINK_SECURITY_NOTE =
  "Por seguridad, el enlace completo solo se muestra al crearlo. Si lo pierde, cree un enlace nuevo y revoque el anterior.";

/** Etiqueta de la vista compartida (nunca "portal oficial"). */
export const TEXTILE_SHARE_VIEW_LABEL = "Vista compartida privada";

/** Deriva el estado efectivo de un enlace para la UI (considera expiración). */
export function effectiveShareLinkStatus(
  status: TextileShareLinkStatus,
  expiresAt: string | null
): TextileShareLinkStatus {
  if (status === "active" && expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return "expired";
  }
  return status;
}
