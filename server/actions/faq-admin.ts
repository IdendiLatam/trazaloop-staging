"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import {
  listFaqCategories, listFaqEntries, getFaqEntryDetail,
  createFaqEntry, saveFaqDraft, updateFaqEntryMeta,
  publishFaqEntry, unpublishFaqEntry, restoreFaqRevision,
  createFaqCategory, updateFaqCategory,
  type FaqCategoryRow, type FaqEntrySummary, type FaqEntryDetail,
  type FaqListFilters, type FaqEntryVisibility, type FaqVerificationStatus,
} from "@/lib/db/faq-platform";
import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";
import { FAQ_UNAVAILABLE_MESSAGE } from "@/lib/domain/faq-admin";

/**
 * Trazaloop · PE-02B2 · Las acciones de la consola de preguntas frecuentes.
 *
 * `requirePlatformStaff()` abre la puerta; `isSuperadmin` decide quién escribe.
 * Las dos cosas se vuelven a comprobar EN LA BASE: las políticas de 0155 y la
 * función de publicación no se fían de que la pantalla haya escondido un botón.
 *
 * Esa duplicación es deliberada. Esconder el botón es cortesía; la barrera es
 * la base.
 */

export type FaqAdminState = { error: string | null; ok?: boolean; id?: string };

const NO_PERMISO = "Solo un superadministrador de plataforma administra el contenido de la plataforma.";
/** §29 · Una lectura que falla NO se cuenta como «no hay contenido». El texto
 *  vive en el dominio: un módulo "use server" solo exporta funciones. */
const NO_SE_PUDO_LEER = FAQ_UNAVAILABLE_MESSAGE;

function revalidar(id?: string) {
  revalidatePath("/platform/faq");
  if (id) revalidatePath(`/platform/faq/${id}`);
}

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opcional = (f: FormData, k: string) => {
  const v = texto(f, k);
  return v.length > 0 ? v : null;
};

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export async function listFaqCategoriesAction(): Promise<{
  categories: FaqCategoryRow[]; canManage: boolean; unavailable: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const res = await listFaqCategories();
  if (res.status === "unavailable") {
    return { categories: [], canManage: isSuperadmin, unavailable: true };
  }
  return { categories: res.data, canManage: isSuperadmin, unavailable: false };
}

export async function listFaqEntriesAction(filters: FaqListFilters): Promise<{
  rows: FaqEntrySummary[]; total: number; canManage: boolean; unavailable: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const res = await listFaqEntries(filters);
  if (res.status === "unavailable") {
    return { rows: [], total: 0, canManage: isSuperadmin, unavailable: true };
  }
  return { ...res.data, canManage: isSuperadmin, unavailable: false };
}

export async function getFaqEntryDetailAction(entryId: string): Promise<{
  detail: FaqEntryDetail | null; canManage: boolean; unavailable: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const res = await getFaqEntryDetail(entryId);
  if (res.status === "unavailable") {
    return { detail: null, canManage: isSuperadmin, unavailable: true };
  }
  return { detail: res.data, canManage: isSuperadmin, unavailable: false };
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

/** Crear NO publica. Nace un borrador y nadie de fuera lo ve. */
export async function createFaqEntryAction(
  _prev: FaqAdminState, formData: FormData
): Promise<FaqAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };

  const slug = texto(formData, "slug").toLowerCase();
  const question = texto(formData, "question");
  const answerShort = texto(formData, "answer_short");
  const categoryId = texto(formData, "category_id");

  if (slug.length < 3) return { error: "El identificador necesita al menos tres caracteres." };
  if (!categoryId) return { error: "Elige una categoría." };
  if (question.length < 5) return { error: "La pregunta necesita al menos cinco caracteres." };
  if (answerShort.length < 5) return { error: "La respuesta breve necesita al menos cinco caracteres." };

  const scope = texto(formData, "scope") === "modules" ? "modules" : "global";
  const moduleKeys = scope === "modules" ? formData.getAll("module_keys").map(String) : [];
  if (scope === "modules" && moduleKeys.length === 0) {
    return { error: "Si la pregunta es de módulos concretos, marca al menos uno." };
  }

  const res = await createFaqEntry({
    slug, categoryId, question, answerShort, scope, moduleKeys,
    visibility: (texto(formData, "visibility") === "public" ? "public" : "authenticated"),
  });
  if (res.error) return { error: res.error };
  revalidar(res.id);
  return { error: null, ok: true, id: res.id };
}

/**
 * Guardar el borrador. NUNCA toca lo publicado: escribe en la tabla de
 * borradores, que es otra. Es la garantía de §5, y no depende de que esta
 * función se acuerde.
 */
export async function saveFaqDraftAction(
  _prev: FaqAdminState, formData: FormData
): Promise<FaqAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };

  const entryId = texto(formData, "entry_id");
  const question = texto(formData, "question");
  const answerShort = texto(formData, "answer_short");
  if (!entryId) return { error: "Falta la pregunta que se está editando." };
  if (question.length < 5) return { error: "La pregunta necesita al menos cinco caracteres." };
  if (answerShort.length < 5) return { error: "La respuesta breve necesita al menos cinco caracteres." };

  const verificationStatus = texto(formData, "verification_status") as FaqVerificationStatus;
  const verificationNote = opcional(formData, "verification_note");
  // Se avisa ANTES de enviar cuando se puede — pero la barrera de verdad está
  // en la base, y esta comprobación no la sustituye (§7).
  if (verificationStatus === "verified_with_qualifier"
      && (verificationNote ?? "").length < 10) {
    return { error: "Una respuesta verificada con salvedad tiene que decir cuál es la salvedad." };
  }
  const externalUrl = opcional(formData, "external_source_url");
  const externalOn = opcional(formData, "external_source_checked_on");
  if (externalUrl && !externalOn) {
    return { error: "Si citas una política externa, anota la fecha en que la comprobaste." };
  }

  const res = await saveFaqDraft({
    entryId, question, answerShort,
    answerLong: opcional(formData, "answer_long"),
    normativeClass: texto(formData, "normative_class") || "safe",
    verificationStatus: verificationStatus || "not_verified",
    sourceBasis: opcional(formData, "source_basis"),
    verificationNote,
    externalSourceUrl: externalUrl,
    externalSourceCheckedOn: externalOn,
    changeNote: opcional(formData, "change_note"),
  });
  if (res.error) return { error: res.error };
  revalidar(entryId);
  return { error: null, ok: true };
}

export async function updateFaqEntryMetaAction(
  _prev: FaqAdminState, formData: FormData
): Promise<FaqAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };

  const entryId = texto(formData, "entry_id");
  const categoryId = texto(formData, "category_id");
  if (!entryId || !categoryId) return { error: "Faltan datos para guardar." };

  const scope = texto(formData, "scope") === "modules" ? "modules" : "global";
  const moduleKeys = scope === "modules" ? formData.getAll("module_keys").map(String) : [];
  if (scope === "modules" && moduleKeys.length === 0) {
    return { error: "Si la pregunta es de módulos concretos, marca al menos uno." };
  }
  const orden = Number(texto(formData, "sort_order") || "100");
  if (!Number.isFinite(orden)) return { error: "El orden tiene que ser un número." };

  const res = await updateFaqEntryMeta({
    entryId, categoryId, scope, moduleKeys, sortOrder: orden,
    visibility: (texto(formData, "visibility") === "public"
      ? "public" : "authenticated") as FaqEntryVisibility,
    isFeatured: formData.get("is_featured") !== null,
  });
  if (res.error) return { error: res.error };
  revalidar(entryId);
  return { error: null, ok: true };
}

export async function publishFaqEntryAction(
  _prev: FaqAdminState, formData: FormData
): Promise<FaqAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };
  const entryId = texto(formData, "entry_id");
  if (!entryId) return { error: "Falta la pregunta que se quiere publicar." };
  const res = await publishFaqEntry(entryId, opcional(formData, "change_note"));
  if (res.error) return { error: res.error };
  revalidar(entryId);
  return { error: null, ok: true };
}

export async function unpublishFaqEntryAction(
  _prev: FaqAdminState, formData: FormData
): Promise<FaqAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };
  const entryId = texto(formData, "entry_id");
  if (!entryId) return { error: "Falta la pregunta que se quiere retirar." };
  const res = await unpublishFaqEntry(entryId);
  if (res.error) return { error: res.error };
  revalidar(entryId);
  return { error: null, ok: true };
}

/** Restaurar copia al BORRADOR. Publicar sigue siendo un paso aparte. */
export async function restoreFaqRevisionAction(
  _prev: FaqAdminState, formData: FormData
): Promise<FaqAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };
  const revisionId = texto(formData, "revision_id");
  if (!revisionId) return { error: "Falta la versión que se quiere recuperar." };
  const res = await restoreFaqRevision(revisionId);
  if (res.error) return { error: res.error };
  revalidar(texto(formData, "entry_id"));
  return { error: null, ok: true };
}

export async function createFaqCategoryAction(
  _prev: FaqAdminState, formData: FormData
): Promise<FaqAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };
  const code = texto(formData, "code").toLowerCase();
  const label = texto(formData, "label");
  if (code.length < 2) return { error: "El identificador necesita al menos dos caracteres." };
  if (label.length < 2) return { error: "La categoría necesita un nombre." };
  const res = await createFaqCategory({
    code, label, description: opcional(formData, "description"),
    sortOrder: Number(texto(formData, "sort_order") || "100"),
  });
  if (res.error) return { error: res.error };
  revalidatePath("/platform/faq/categorias");
  revalidar();
  return { error: null, ok: true };
}

export async function updateFaqCategoryAction(
  _prev: FaqAdminState, formData: FormData
): Promise<FaqAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: NO_PERMISO };
  const id = texto(formData, "id");
  const label = texto(formData, "label");
  if (!id || label.length < 2) return { error: "Faltan datos para guardar la categoría." };

  // Retirar una categoría que sostiene preguntas dejaría esas preguntas fuera
  // de la vista pública sin que nadie hubiera tocado ninguna de ellas. Se avisa
  // en vez de hacerlo en silencio.
  const status = texto(formData, "status") === "inactive" ? "inactive" : "active";
  if (status === "inactive") {
    const cats = await listFaqCategories();
    if (cats.status === "unavailable") return { error: NO_SE_PUDO_LEER };
    const esta = cats.data.find((c) => c.id === id);
    if (esta && esta.entries > 0 && formData.get("confirm_inactive") === null) {
      return {
        error: `Esa categoría tiene ${esta.entries} pregunta(s). Si la desactivas dejarán de verse, aunque estén publicadas. Marca la confirmación si es lo que quieres.`,
      };
    }
  }

  const res = await updateFaqCategory({
    id, label, description: opcional(formData, "description"),
    sortOrder: Number(texto(formData, "sort_order") || "100"), status,
  });
  if (res.error) return { error: res.error };
  revalidatePath("/platform/faq/categorias");
  revalidar();
  return { error: null, ok: true };
}

/** Las claves canónicas, para los formularios. Una sola fuente (PEH-08). */
export async function faqModuleOptionsAction(): Promise<{ key: string; name: string }[]> {
  await requirePlatformStaff();
  return COMMERCIAL_MODULES.map((m) => ({ key: m.key, name: m.name }));
}
