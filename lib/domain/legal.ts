/**
 * Trazaloop · Sprint 10D · Lógica PURA de consentimiento legal (sin BD).
 * Espejo de legal_documents/user_legal_acceptances (0066).
 *
 * Sin imports de Supabase, de servidor ni de Next.
 */

export const LEGAL_DOCUMENT_TYPES = ["terms", "privacy", "data_processing"] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export const LEGAL_DOCUMENT_TYPE_LABEL: Record<LegalDocumentType, string> = {
  terms: "Términos de uso",
  privacy: "Política de privacidad",
  data_processing: "Tratamiento de datos",
};

export function isLegalDocumentType(v: string | null | undefined): v is LegalDocumentType {
  return !!v && (LEGAL_DOCUMENT_TYPES as readonly string[]).includes(v);
}

/**
 * Documentos que TODO usuario debe aceptar antes de entrar al espacio
 * empresarial o a la consola de plataforma (Parte 5/12). data_processing
 * existe como tipo soportado desde ya, pero no se exige todavía — se
 * puede activar en el futuro sin migrar nada, solo agregándolo aquí.
 */
export const REQUIRED_LEGAL_DOCUMENT_TYPES: readonly LegalDocumentType[] = ["terms", "privacy"];

export const LEGAL_ACCEPT_CHECKBOX_TEXT = "Acepto los términos de uso y la política de privacidad.";

/** Corrección (Bloqueante 2): mensaje de error para server actions
 *  críticas que revisan aceptación legal (assertMyLegalAcceptance,
 *  server/actions/legal.ts) — vive aquí y no en el archivo "use server"
 *  porque Next.js exige que un archivo con "use server" solo exporte
 *  funciones async; una constante de texto simple no puede vivir ahí. */
export const LEGAL_ACCEPTANCE_REQUIRED_MESSAGE =
  "Debes aceptar los términos de uso y la política de privacidad antes de continuar.";

export type ActiveLegalDocumentSummary = {
  id: string;
  documentType: LegalDocumentType;
  version: string;
};

export type LegalAcceptanceRecord = {
  legalDocumentId: string;
};

/**
 * ¿El usuario ya aceptó TODOS los documentos activos requeridos, en su
 * versión vigente? Compara por legal_document_id (no solo por tipo): si
 * se publica una versión nueva del mismo tipo, el documento activo tiene
 * un id distinto, así que una aceptación de la versión anterior deja de
 * contar — sin necesidad de lógica de "comparar versiones" aparte.
 */
export function hasAcceptedAllRequiredDocuments(
  activeDocuments: ActiveLegalDocumentSummary[],
  acceptances: LegalAcceptanceRecord[]
): boolean {
  const acceptedIds = new Set(acceptances.map((a) => a.legalDocumentId));
  const requiredActive = activeDocuments.filter((d) => REQUIRED_LEGAL_DOCUMENT_TYPES.includes(d.documentType));
  if (requiredActive.length === 0) return true; // sin documentos activos requeridos: nada que aceptar.
  return requiredActive.every((d) => acceptedIds.has(d.id));
}

/** Documentos activos requeridos que el usuario TODAVÍA no aceptó — para
 *  mostrarlos en /legal/accept. */
export function pendingRequiredDocuments(
  activeDocuments: ActiveLegalDocumentSummary[],
  acceptances: LegalAcceptanceRecord[]
): ActiveLegalDocumentSummary[] {
  const acceptedIds = new Set(acceptances.map((a) => a.legalDocumentId));
  return activeDocuments.filter(
    (d) => REQUIRED_LEGAL_DOCUMENT_TYPES.includes(d.documentType) && !acceptedIds.has(d.id)
  );
}
