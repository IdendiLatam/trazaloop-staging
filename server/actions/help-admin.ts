"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import {
  listHelpItems, getHelpItemDetail, createHelpItem, saveHelpDraft,
  publishHelpItem, unpublishHelpItem, restoreHelpRevision,
  type HelpItemSummary, type HelpItemDetail, type HelpListFilters,
} from "@/lib/db/help-platform";
import { isWellFormedPageKey, isKnownPageKey } from "@/lib/modules/page-keys";
import { HELP_NO_PERMISSION } from "@/lib/domain/contextual-help";

/**
 * Trazaloop · PE-02B4 · Las acciones de la consola de ayuda contextual.
 *
 * `requirePlatformStaff()` abre la puerta; `isSuperadmin` decide quién escribe;
 * y la base lo vuelve a comprobar. Esconder el botón es cortesía, la barrera es
 * la base.
 */

export type HelpAdminState = { error: string | null; ok?: boolean; id?: string };

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opcional = (f: FormData, k: string) => {
  const v = texto(f, k);
  return v.length > 0 ? v : null;
};

function revalidar(id?: string) {
  revalidatePath("/platform/help");
  if (id) revalidatePath(`/platform/help/${id}`);
}

export async function listHelpItemsAction(filters: HelpListFilters): Promise<{
  items: HelpItemSummary[]; canManage: boolean; unavailable: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const res = await listHelpItems(filters);
  if (res.status === "unavailable") {
    return { items: [], canManage: isSuperadmin, unavailable: true };
  }
  return { items: res.data, canManage: isSuperadmin, unavailable: false };
}

export async function getHelpItemDetailAction(itemId: string): Promise<{
  detail: HelpItemDetail | null; canManage: boolean; unavailable: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const res = await getHelpItemDetail(itemId);
  if (res.status === "unavailable") {
    return { detail: null, canManage: isSuperadmin, unavailable: true };
  }
  return { detail: res.data, canManage: isSuperadmin, unavailable: false };
}

/** Crear NO publica: nace un borrador y el botón «i» sigue sin aparecer. */
export async function createHelpItemAction(
  _prev: HelpAdminState, formData: FormData
): Promise<HelpAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: HELP_NO_PERMISSION };

  const pageKey = texto(formData, "page_key");
  const targetKind = texto(formData, "target_kind");
  const targetKey = texto(formData, "target_key").toLowerCase();
  const title = texto(formData, "title");
  const explanation = texto(formData, "explanation");

  if (!isWellFormedPageKey(pageKey)) {
    return { error: "La clave de pantalla no tiene la forma esperada: minúsculas separadas por puntos, empezando por un módulo." };
  }
  // Se avisa, no se impide: una pantalla nueva puede necesitar su ayuda antes
  // de que alguien la añada al registro. Lo que no puede es pasar inadvertido.
  if (!isKnownPageKey(pageKey)) {
    return { error: `«${pageKey}» no está en el registro de pantallas. Añádela a lib/modules/page-keys.ts para que la consola y los tutoriales la reconozcan.` };
  }
  if (targetKey.length < 2) return { error: "El elemento necesita un identificador." };
  if (title.length < 2) return { error: "La ayuda necesita un título." };
  if (explanation.length < 10) return { error: "La explicación necesita al menos diez caracteres." };

  const res = await createHelpItem({
    moduleKey: pageKey.split(".")[0], pageKey, targetKind,
    targetKey: targetKind === "page" ? "page" : targetKey,
    title, explanation,
  });
  if (res.error) return { error: res.error };
  revalidar(res.id);
  return { error: null, ok: true, id: res.id };
}

/** Guardar el borrador NO toca lo publicado: escribe en otra tabla. */
export async function saveHelpDraftAction(
  _prev: HelpAdminState, formData: FormData
): Promise<HelpAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: HELP_NO_PERMISSION };

  const helpItemId = texto(formData, "help_item_id");
  const title = texto(formData, "title");
  const explanation = texto(formData, "explanation");
  if (!helpItemId) return { error: "Falta la ayuda que se está editando." };
  if (title.length < 2) return { error: "La ayuda necesita un título." };
  if (explanation.length < 10) return { error: "La explicación necesita al menos diez caracteres." };

  const res = await saveHelpDraft({
    helpItemId, title, explanation,
    example: opcional(formData, "example"),
    technicalReference: opcional(formData, "technical_reference"),
    doNotInvent: opcional(formData, "do_not_invent"),
    normativeClass: texto(formData, "normative_class") || "safe",
    changeNote: opcional(formData, "change_note"),
  });
  if (res.error) return { error: res.error };
  revalidar(helpItemId);
  return { error: null, ok: true };
}

export async function publishHelpItemAction(
  _prev: HelpAdminState, formData: FormData
): Promise<HelpAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: HELP_NO_PERMISSION };
  const id = texto(formData, "help_item_id");
  if (!id) return { error: "Falta la ayuda que se quiere publicar." };
  const res = await publishHelpItem(id, opcional(formData, "change_note"));
  if (res.error) return { error: res.error };
  revalidar(id);
  return { error: null, ok: true };
}

export async function unpublishHelpItemAction(
  _prev: HelpAdminState, formData: FormData
): Promise<HelpAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: HELP_NO_PERMISSION };
  const id = texto(formData, "help_item_id");
  if (!id) return { error: "Falta la ayuda que se quiere retirar." };
  const res = await unpublishHelpItem(id);
  if (res.error) return { error: res.error };
  revalidar(id);
  return { error: null, ok: true };
}

export async function restoreHelpRevisionAction(
  _prev: HelpAdminState, formData: FormData
): Promise<HelpAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: HELP_NO_PERMISSION };
  const revisionId = texto(formData, "revision_id");
  if (!revisionId) return { error: "Falta la versión que se quiere recuperar." };
  const res = await restoreHelpRevision(revisionId);
  if (res.error) return { error: res.error };
  revalidar(texto(formData, "help_item_id"));
  return { error: null, ok: true };
}
