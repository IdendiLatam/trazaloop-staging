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
