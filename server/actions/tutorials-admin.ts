"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import {
  listTutorialsForConsole, getTutorialDetail, createPageTutorial,
  createPublicHomeTutorial,
  reserveTutorialUpload, finalizeTutorialUpload, publishTutorialVersion,
  unpublishTutorial, restoreTutorialVersion, signTutorialPreview,
  failTutorialVersion,
  TUTORIAL_FORBIDDEN_MESSAGE,
  type TutorialConsoleRow, type TutorialDetail, type TutorialListFilters,
} from "@/lib/db/tutorials-platform";
import { removeDiscardedTutorialObject } from "@/lib/db/tutorial-object-cleanup";
import { createServerClient } from "@/lib/supabase/server";
import {
  validateTutorialFileDeclaration, isTutorialMimeType,
  TUTORIAL_BAD_FORMAT_MESSAGE,
} from "@/lib/domain/tutorial-media";
import { TUTORIAL_CONSOLE_UNAVAILABLE } from "@/lib/domain/tutorial-admin";

/**
 * Trazaloop · PE-03B2 · Las acciones de la consola de tutoriales.
 *
 * `requirePlatformStaff()` abre la puerta y `isSuperadmin` decide quién escribe
 * — y la base lo vuelve a comprobar en cada función. Esconder un botón es
 * cortesía; la barrera es la base. Es el mismo reparto que PE-02B2 y PE-02B4.
 *
 * NINGUNA de estas acciones usa cliente administrativo, con una excepción
 * declarada: descartar una candidata retira su objeto, y el cubo no tiene
 * política de DELETE a propósito. Ver `lib/db/tutorial-object-cleanup.ts`.
 */

export type TutorialAdminState = { error: string | null; ok?: boolean; id?: string };

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opcional = (f: FormData, k: string) => {
  const v = texto(f, k);
  return v.length > 0 ? v : null;
};

function revalidar(id?: string) {
  revalidatePath("/platform/tutorials");
  if (id) revalidatePath(`/platform/tutorials/${id}`);
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function listTutorialsAction(filters: TutorialListFilters): Promise<{
  rows: TutorialConsoleRow[]; canManage: boolean; unavailable: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const res = await listTutorialsForConsole(filters);
  if (res.status === "unavailable") {
    return { rows: [], canManage: isSuperadmin, unavailable: true };
  }
  return { rows: res.data, canManage: isSuperadmin, unavailable: false };
}

export async function getTutorialDetailAction(tutorialId: string): Promise<{
  detail: TutorialDetail | null; canManage: boolean; unavailable: boolean;
}> {
  const { isSuperadmin } = await requirePlatformStaff();
  const res = await getTutorialDetail(tutorialId);
  if (res.status === "unavailable") {
    return { detail: null, canManage: isSuperadmin, unavailable: true };
  }
  return { detail: res.data, canManage: isSuperadmin, unavailable: false };
}

/**
 * La vista previa de una versión concreta, incluida una candidata.
 *
 * Soporte también puede: ver es su papel, y previsualizar es ver. Lo que no
 * puede es publicar.
 */
export async function previewTutorialVersionAction(
  versionId: string
): Promise<{ url: string | null; error: string | null }> {
  await requirePlatformStaff();
  const res = await signTutorialPreview(versionId);
  if (!res.ok) return { url: null, error: res.message };
  return { url: res.url, error: null };
}

// ---------------------------------------------------------------------------
// Identidad
// ---------------------------------------------------------------------------

/** Crear NO sube ni publica: nace la identidad, y la pantalla sigue sin vídeo. */
export async function createTutorialAction(
  _prev: TutorialAdminState, formData: FormData
): Promise<TutorialAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: TUTORIAL_FORBIDDEN_MESSAGE };

  const pageKey = texto(formData, "pageKey");
  const title = texto(formData, "title");
  if (title.length < 3) return { error: "El tutorial necesita un nombre." };

  const res = await createPageTutorial({ pageKey, title });
  if (!res.ok) return { error: res.message };
  revalidar(res.id);
  return { error: null, ok: true, id: res.id };
}

/**
 * COMMERCIAL-UX-01E · Crear el vídeo de la portada pública.
 *
 * Misma puerta que todo lo demás de esta consola —solo superadministración— y
 * mismo camino después: subir, verificar y publicar se hacen con las acciones
 * que ya existen. Aquí solo nace la identidad, igual que en las pantallas.
 */
export async function createPublicHomeTutorialAction(
  _prev: TutorialAdminState, formData: FormData
): Promise<TutorialAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: TUTORIAL_FORBIDDEN_MESSAGE };

  const title = texto(formData, "title");
  if (title.length < 3) return { error: "El vídeo necesita un nombre." };

  const res = await createPublicHomeTutorial({ title });
  if (!res.ok) return { error: res.message };
  revalidar(res.id);
  return { error: null, ok: true, id: res.id };
}

// ---------------------------------------------------------------------------
// Subida · los bytes NO pasan por aquí
// ---------------------------------------------------------------------------

export type ReservationResult =
  | { ok: true; versionId: string; objectPath: string; signedUrl: string; token: string;
      expiresAt: string }
  | { ok: false; message: string };

/**
 * Paso 1 · reserva la ruta y devuelve el destino firmado.
 *
 * Lo que vuelve al navegador es un token para **una ruta y un rato**. No es una
 * credencial de escritura sobre el cubo: no sirve para otra ruta ni para otro
 * momento.
 *
 * Y aquí está la frontera de autorización de todo el tramo. PE-03A comprobó que
 * una URL de subida firmada autoriza por sí misma, así que lo que impide subir
 * un tutorial no es la política del cubo: es que solo esta acción emite la ruta,
 * y solo la emite a un superadministrador.
 */
export async function reserveTutorialUploadAction(input: {
  tutorialId: string; filename: string; mime: string; sizeBytes: number;
}): Promise<ReservationResult> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { ok: false, message: TUTORIAL_FORBIDDEN_MESSAGE };

  const declarado = validateTutorialFileDeclaration(input);
  if (!declarado.ok) return { ok: false, message: declarado.message };

  const res = await reserveTutorialUpload(input);
  if (!res.ok) return { ok: false, message: res.message };
  return {
    ok: true,
    versionId: res.upload.versionId,
    objectPath: res.upload.objectPath,
    signedUrl: res.upload.signedUrl,
    token: res.upload.token,
    expiresAt: res.upload.expiresAt,
  };
}

/**
 * Paso 3 · el servidor lee el objeto REAL y lo compara con lo reservado.
 *
 * Es lo que convierte unos bytes en una versión. Storage vincula la ruta a una
 * reserva pero no inspecciona el contenido —0099—, así que sin este paso nadie
 * sabría qué se subió.
 */
export async function finalizeTutorialUploadAction(input: {
  versionId: string; objectPath: string; mime: string;
}): Promise<{ ok: boolean; message: string | null }> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { ok: false, message: TUTORIAL_FORBIDDEN_MESSAGE };
  if (!isTutorialMimeType(input.mime)) {
    return { ok: false, message: TUTORIAL_BAD_FORMAT_MESSAGE };
  }

  const res = await finalizeTutorialUpload({
    versionId: input.versionId, objectPath: input.objectPath, declaredMime: input.mime,
  });
  revalidar();
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true, message: null };
}

/** Si la subida se abandonó, la reserva se marca fallida en vez de quedar viva. */
export async function failTutorialUploadAction(
  versionId: string
): Promise<{ ok: boolean; message: string | null }> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { ok: false, message: TUTORIAL_FORBIDDEN_MESSAGE };
  const res = await failTutorialVersion(versionId);
  revalidar();
  return res.ok ? { ok: true, message: null } : { ok: false, message: res.message };
}

// ---------------------------------------------------------------------------
// Metadatos de la candidata · lo único editable
// ---------------------------------------------------------------------------

/**
 * Título, descripción y nota de cambio de una versión que aún no se publicó.
 *
 * Lo que identifica el archivo —ruta, resumen, tamaño, tipo— no se toca desde
 * aquí ni desde ninguna parte: el disparador de 0159 lo rechaza. Y en cuanto la
 * versión se publica, esto también deja de poder cambiarse.
 */
export async function saveCandidateMetadataAction(
  _prev: TutorialAdminState, formData: FormData
): Promise<TutorialAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: TUTORIAL_FORBIDDEN_MESSAGE };

  const versionId = texto(formData, "versionId");
  const tutorialId = texto(formData, "tutorialId");
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("platform_tutorial_versions")
    .update({
      title: opcional(formData, "title"),
      description: opcional(formData, "description"),
      change_note: opcional(formData, "changeNote"),
    })
    .eq("id", versionId).is("effective_from", null).select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "Esa versión ya está publicada: su texto no se cambia. Para corregirlo se publica una versión nueva." };
  }
  revalidar(tutorialId);
  return { error: null, ok: true };
}

// ---------------------------------------------------------------------------
// Publicar, retirar, reponer, descartar
// ---------------------------------------------------------------------------

export async function publishTutorialVersionAction(
  _prev: TutorialAdminState, formData: FormData
): Promise<TutorialAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: TUTORIAL_FORBIDDEN_MESSAGE };

  const res = await publishTutorialVersion({
    versionId: texto(formData, "versionId"),
    changeNote: opcional(formData, "changeNote"),
  });
  if (!res.ok) return { error: res.message };
  revalidar(texto(formData, "tutorialId"));
  return { error: null, ok: true };
}

/**
 * Volver a activar un tutorial retirado.
 *
 * Hace falta porque la identidad de un tutorial de pantalla es única POR
 * PANTALLA, y esa unicidad no distingue activo de retirado — ni debe: la
 * pantalla es la misma. Sin esta acción, retirar un tutorial dejaría su pantalla
 * sin forma de volver a tener uno, y eso convertiría una operación reversible en
 * un callejón sin salida.
 *
 * Lo encontró una prueba al intentar crear dos veces el tutorial de la misma
 * pantalla.
 *
 * Activar NO publica: el tutorial vuelve a estar disponible para subirle una
 * versión, y su historia sigue donde estaba.
 */
export async function reactivateTutorialAction(
  _prev: TutorialAdminState, formData: FormData
): Promise<TutorialAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: TUTORIAL_FORBIDDEN_MESSAGE };

  const tutorialId = texto(formData, "tutorialId");
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("platform_tutorials")
    .update({ status: "active" }).eq("id", tutorialId).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: TUTORIAL_FORBIDDEN_MESSAGE };
  revalidar(tutorialId);
  return { error: null, ok: true };
}

/** Retirar: deja de verse, y la historia queda entera. */
export async function unpublishTutorialAction(
  _prev: TutorialAdminState, formData: FormData
): Promise<TutorialAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: TUTORIAL_FORBIDDEN_MESSAGE };

  const tutorialId = texto(formData, "tutorialId");
  const res = await unpublishTutorial(tutorialId);
  if (!res.ok) return { error: res.message };
  revalidar(tutorialId);
  return { error: null, ok: true };
}

/**
 * Usar nuevamente el vídeo de una versión anterior.
 *
 * Crea una candidata, **no publica**. Y no reabre el periodo antiguo: la
 * historia dirá que ese vídeo se usó dos veces, en dos tramos distintos, que es
 * lo que pasó.
 */
export async function restoreTutorialVersionAction(
  _prev: TutorialAdminState, formData: FormData
): Promise<TutorialAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: TUTORIAL_FORBIDDEN_MESSAGE };

  const res = await restoreTutorialVersion({
    versionId: texto(formData, "versionId"),
    changeNote: opcional(formData, "changeNote"),
  });
  if (!res.ok) return { error: res.message };
  revalidar(texto(formData, "tutorialId"));
  return { error: null, ok: true, id: res.versionId };
}

/**
 * Descartar una candidata que nunca se publicó.
 *
 * Tres barreras, y ninguna sobra:
 *
 *   1 · esta acción exige superadministrador;
 *   2 · el `update`/`delete` va con la sesión, así que la RLS decide;
 *   3 · el disparador de 0159 rechaza borrar una versión con vigencia — de modo
 *       que ni siquiera un error aquí podría llevarse una publicada.
 *
 * Y el objeto solo se retira si NINGUNA otra versión lo referencia. Una versión
 * repuesta comparte objeto con la original: borrarlo a ciegas se llevaría el
 * vídeo de una versión publicada.
 */
export async function discardCandidateAction(
  _prev: TutorialAdminState, formData: FormData
): Promise<TutorialAdminState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) return { error: TUTORIAL_FORBIDDEN_MESSAGE };

  const versionId = texto(formData, "versionId");
  const tutorialId = texto(formData, "tutorialId");
  const supabase = await createServerClient();

  const { data: fila, error: eLeer } = await supabase
    .from("platform_tutorial_versions")
    .select("object_path, effective_from").eq("id", versionId).maybeSingle();
  if (eLeer) return { error: TUTORIAL_CONSOLE_UNAVAILABLE };
  if (!fila) return { error: "Esa versión no existe." };
  const v = fila as { object_path: string; effective_from: string | null };
  if (v.effective_from !== null) {
    return { error: "Esa versión se publicó alguna vez: forma parte de la historia y no se descarta." };
  }

  const { data, error } = await supabase.from("platform_tutorial_versions")
    .delete().eq("id", versionId).is("effective_from", null).select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: TUTORIAL_FORBIDDEN_MESSAGE };

  // El objeto, después de la fila. Si esto falla, queda un objeto sin dueño que
  // la limpieza de B5 recogerá; lo que NUNCA queda es una fila apuntando a un
  // objeto que ya no está.
  await removeDiscardedTutorialObject(v.object_path);

  revalidar(tutorialId);
  return { error: null, ok: true };
}
