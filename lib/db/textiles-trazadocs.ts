import "server-only";

import {
  listDocuments,
  listAvailableBlueprints,
  getDocument,
  getBlueprintByIdForCompany,
  getBlueprintSections,
  findDocumentByBlueprint,
  findDocumentByNormalizedTitle,
  listDocumentVersions,
  type DocumentSummaryRow,
  type BlueprintSummaryRow,
  type DocumentDetail,
  type DocumentVersionRow,
} from "@/lib/db/trazadocs";
import type { BlueprintSectionFacts } from "@/lib/domain/trazadocs";

/**
 * Trazaloop · Sprint T8 (Textil) · Capa de datos de TrazaDocs Textil.
 * REUTILIZA el motor TrazaDocs (0043–0048) con module_key = 'textiles'
 * FIJADO EN SERVIDOR — jamás llega del cliente. Ningún documento CPR es
 * visible desde estas funciones ni viceversa (encargo T8 §9).
 */

const MODULE = "textiles" as const;

export async function listTextileTrazadocsTemplates(): Promise<BlueprintSummaryRow[]> {
  return listAvailableBlueprints(MODULE);
}

export async function listTextileTrazadocsDocuments(orgId: string): Promise<DocumentSummaryRow[]> {
  return listDocuments(orgId, MODULE);
}

export async function getTextileTrazadocDetail(
  orgId: string,
  documentId: string
): Promise<DocumentDetail | null> {
  return getDocument(orgId, documentId, MODULE);
}

export async function getTextileTrazadocBlueprint(blueprintId: string) {
  return getBlueprintByIdForCompany(blueprintId, MODULE);
}

/** Tips por sección: los hints de la estructura base (motor existente). */
export async function listTextileTrazadocHints(blueprintId: string): Promise<BlueprintSectionFacts[]> {
  return getBlueprintSections(blueprintId);
}

export async function findTextileTrazadocByBlueprint(orgId: string, blueprintId: string) {
  return findDocumentByBlueprint(orgId, blueprintId);
}

export async function findTextileTrazadocByTitle(orgId: string, normalizedTitle: string) {
  return findDocumentByNormalizedTitle(orgId, normalizedTitle, undefined, MODULE);
}

export async function listTextileTrazadocVersions(
  orgId: string,
  documentId: string
): Promise<DocumentVersionRow[]> {
  return listDocumentVersions(orgId, documentId);
}
