"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import {
  listLegalDocumentsForPlatform, getLegalDocumentForPlatform,
  createLegalDraft, updateLegalDraft, publishLegalDocument, discardLegalDraft,
  type LegalDocRow,
} from "@/lib/db/legal-platform";
import { LEGAL_DOCUMENT_TYPES, isLegalDocumentType } from "@/lib/domain/legal";

/**
 * Trazaloop · PE-02B2 · Las acciones de la consola de documentos legales.
 *
 * Publicar aquí tiene una consecuencia que conviene tener presente al leer este
 * archivo: **a todo el mundo se le vuelve a pedir la aceptación**. No porque
 * esta acción lo programe, sino porque la aceptación referencia el id del
 * documento y la versión nueva tiene otro. Es la razón de ser del tramo.
 */

export type LegalAdminState = { error: string | null; ok?: boolean; id?: string };

const NO_PERMISO =
  "Solo un superadministrador de plataforma administra los documentos legales.";

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opcional = (f: FormData, k: string) => {
  const v = texto(f, k);
  return v.length > 0 ? v : null;
};

function revalidar(id?: string) {
  revalidatePath("/platform/legal");
  if (id) revalidatePath(`/platform/legal/${id}`);
  // Las páginas públicas leen el documento activo: al publicar una versión
  // nueva tienen que dejar de servir la anterior.
  revalidatePath("/terms");
  revalidatePath("/privacy");
  revalidatePath("/legal");
}

export async function listLegalDocumentsAction(): Promise<{
  documents: LegalDocRow[]; canManage: boolean; unavailable: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const res = await listLegalDocumentsForPlatform();
  if (res.status === "unavailable") {
    return { documents: [], canManage: isSuperadmin, unavailable: true };
  }
  return { documents: res.data, canManage: isSuperadmin, unavailable: false };
}

export async function getLegalDocumentAction(id: string): Promise<{
  document: LegalDocRow | null; canManage: boolean; unavailable: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const res = await getLegalDocumentForPlatform(id);
  if (res.status === "unavailable") {
    return { document: null, canManage: isSuperadmin, unavailable: true };
  }
  return { document: res.data, canManage: isSuperadmin, unavailable: false };
}

/** Crear una versión NUEVA. Nace como borrador: nadie la ve y nadie la acepta. */
export async function createLegalDraftAction(
  _prev: LegalAdminState, formData: FormData
): Promise<LegalAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };

  const documentType = texto(formData, "document_type");
  if (!isLegalDocumentType(documentType)) {
    return { error: "Ese tipo de documento no existe." };
  }
  const version = texto(formData, "version");
  const title = texto(formData, "title");
  const content = String(formData.get("content") ?? "");
  if (version.length === 0) return { error: "Ponle un número o un nombre a la versión." };
  if (title.length < 3) return { error: "El documento necesita un título." };
  if (content.trim().length < 50) {
    return { error: "El documento necesita un texto. Este parece incompleto." };
  }

  const res = await createLegalDraft({
    documentType, version, title, content,
    changeNote: opcional(formData, "change_note"),
  });
  if (res.error) return { error: res.error };
  revalidar(res.id);
  return { error: null, ok: true, id: res.id };
}

export async function updateLegalDraftAction(
  _prev: LegalAdminState, formData: FormData
): Promise<LegalAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };

  const id = texto(formData, "id");
  const title = texto(formData, "title");
  const content = String(formData.get("content") ?? "");
  if (!id) return { error: "Falta el documento que se está editando." };
  if (title.length < 3) return { error: "El documento necesita un título." };
  if (content.trim().length < 50) {
    return { error: "El documento necesita un texto. Este parece incompleto." };
  }

  const res = await updateLegalDraft({
    id, title, content, changeNote: opcional(formData, "change_note"),
  });
  if (res.error) return { error: res.error };
  revalidar(id);
  return { error: null, ok: true };
}

/**
 * Publicar. Archiva la vigente, activa esta, y —consecuencia, no efecto
 * secundario— a todo el mundo se le volverá a pedir la aceptación.
 *
 * Se exige una confirmación explícita porque es la operación más difícil de
 * deshacer de toda la consola: no se puede «despublicar» un documento legal
 * volviendo al anterior, hay que publicar otra versión.
 */
export async function publishLegalDocumentAction(
  _prev: LegalAdminState, formData: FormData
): Promise<LegalAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };

  const id = texto(formData, "id");
  if (!id) return { error: "Falta el documento que se quiere publicar." };
  if (formData.get("confirm_publish") === null) {
    return {
      error: "Marca la confirmación: al publicar esta versión, la anterior se archiva y a todas las personas se les volverá a pedir que acepten.",
    };
  }

  const res = await publishLegalDocument(id);
  if (res.error) return { error: res.error };
  revalidar(id);
  return { error: null, ok: true };
}

export async function discardLegalDraftAction(
  _prev: LegalAdminState, formData: FormData
): Promise<LegalAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };
  const id = texto(formData, "id");
  if (!id) return { error: "Falta el borrador que se quiere descartar." };
  const res = await discardLegalDraft(id);
  if (res.error) return { error: res.error };
  revalidar();
  return { error: null, ok: true };
}

export async function legalDocumentTypesAction(): Promise<readonly string[]> {
  await requirePlatformStaff();
  return LEGAL_DOCUMENT_TYPES;
}
