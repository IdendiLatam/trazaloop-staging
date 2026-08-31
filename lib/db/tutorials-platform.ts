import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/lib/supabase/server";
import { isKnownPageKey, getPageKey } from "@/lib/modules/page-keys";
import {
  TUTORIAL_UPLOAD_TTL_SECONDS,
  TUTORIAL_SIGNATURE_PREFIX_BYTES,
  detectTutorialSignature,
  signatureMatchesMime,
  validateTutorialFileDeclaration,
  TUTORIAL_SIGNATURE_MESSAGE,
  type TutorialMimeType,
} from "@/lib/domain/tutorial-media";

/**
 * Trazaloop · PE-03B1 · Administrar tutoriales.
 *
 * La capa que usa el superadministrador. B2 le pondrá pantalla; aquí está lo
 * que la pantalla llamará.
 *
 * DÓNDE ESTÁ LA FRONTERA DE SEGURIDAD, DICHO SIN ADORNOS
 *
 * PE-03A comprobó —y 0099 lo tenía escrito— que una URL de subida firmada
 * autoriza el objeto POR SÍ MISMA: funciona incluso desde un cliente anónimo, y
 * por tanto no pasa por la política INSERT de Storage.
 *
 * Así que la barrera **no** es la política del cubo. Es esta secuencia:
 *
 *   1 · `tutorial_reserve_upload` exige `is_platform_superadmin()` y elige ELLA
 *       la ruta, con el id de la versión dentro. Quien llama no propone dónde
 *       escribir.
 *   2 · solo entonces se firma esa ruta exacta, y el token queda atado a ella.
 *   3 · al finalizar, el servidor lee el objeto REAL y compara con lo declarado.
 *
 * Escribirlo así importa: una prueba que afirmara «la política de Storage
 * impide subir tutoriales» sería falsa, y daría tranquilidad donde no la hay.
 */

type Db = SupabaseClient;

async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

/** El mismo guardián que en PE-02: una escritura que la RLS no autoriza vuelve
 *  sin error y con cero filas, así que hay que mirar las filas. */
function filaAfectada<T>(data: T[] | null): T | null {
  return data && data.length > 0 ? data[0] : null;
}

export const TUTORIAL_FORBIDDEN_MESSAGE =
  "Tu cuenta no puede administrar los tutoriales de la plataforma.";
export const TUTORIAL_UNKNOWN_PAGE_MESSAGE =
  "Esa pantalla no está en el registro de claves. Añádela primero en lib/modules/page-keys.ts.";

export type TutorialSummary = {
  id: string;
  tutorialType: "page" | "welcome";
  pageKey: string | null;
  moduleKey: string | null;
  title: string;
  status: string;
};

/**
 * Crea la identidad de un tutorial de pantalla.
 *
 * **Rechaza una clave que no esté en el registro.** La base solo comprueba la
 * forma —no puede leer un fichero de TypeScript—, así que la pertenencia al
 * registro se comprueba aquí. Es la frontera que impide que un tutorial cuelgue
 * de una pantalla que no existe.
 */
export async function createPageTutorial(
  input: { pageKey: string; title: string }, client?: Db
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  if (!isKnownPageKey(input.pageKey)) {
    return { ok: false, message: TUTORIAL_UNKNOWN_PAGE_MESSAGE };
  }
  const entrada = getPageKey(input.pageKey);
  if (!entrada) return { ok: false, message: TUTORIAL_UNKNOWN_PAGE_MESSAGE };

  const supabase = await db(client);
  const { data, error } = await supabase
    .from("platform_tutorials")
    .insert({
      tutorial_type: "page",
      page_key: input.pageKey,
      module_key: entrada.module,
      title: input.title,
    })
    .select("id");

  if (error) return { ok: false, message: error.message };
  const fila = filaAfectada(data as { id: string }[] | null);
  if (!fila) return { ok: false, message: TUTORIAL_FORBIDDEN_MESSAGE };
  return { ok: true, id: fila.id };
}

/** Lo que la consola listará. Una consulta, no una por tutorial. */
export async function listTutorials(client?: Db): Promise<TutorialSummary[]> {
  const supabase = await db(client);
  const { data } = await supabase
    .from("platform_tutorials")
    .select("id, tutorial_type, page_key, module_key, title, status")
    .order("tutorial_type")
    .order("page_key", { nullsFirst: true });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    tutorialType: r.tutorial_type as "page" | "welcome",
    pageKey: (r.page_key as string | null) ?? null,
    moduleKey: (r.module_key as string | null) ?? null,
    title: String(r.title),
    status: String(r.status),
  }));
}

export type ReservedUpload = {
  versionId: string;
  objectPath: string;
  expiresAt: string;
  signedUrl: string;
  token: string;
};

/**
 * Reserva la ruta y emite el destino firmado.
 *
 * Los bytes irán del navegador a Storage sin atravesar Next.js. No es una
 * preferencia: `next.config.ts` dejó las Server Actions en 1 MB cuando T9E.1
 * cambió el transporte, y hay pruebas que fallan si alguien lo reintroduce.
 */
export async function reserveTutorialUpload(
  input: { tutorialId: string; filename: string; mime: string; sizeBytes: number },
  client?: Db
): Promise<{ ok: true; upload: ReservedUpload } | { ok: false; message: string }> {
  const declarado = validateTutorialFileDeclaration({
    filename: input.filename, mime: input.mime, sizeBytes: input.sizeBytes,
  });
  if (!declarado.ok) return { ok: false, message: declarado.message };

  const supabase = await db(client);
  const { data, error } = await supabase.rpc("tutorial_reserve_upload", {
    p_tutorial_id: input.tutorialId,
    p_filename: input.filename,
    p_mime: input.mime,
    p_size_bytes: input.sizeBytes,
    p_ttl_seconds: TUTORIAL_UPLOAD_TTL_SECONDS,
  });
  if (error) return { ok: false, message: error.message };

  const fila = filaAfectada(data as Record<string, unknown>[] | null);
  if (!fila) return { ok: false, message: TUTORIAL_FORBIDDEN_MESSAGE };

  const objectPath = String(fila.object_path);
  const { data: firmada, error: eFirma } = await supabase.storage
    .from("tutorial-media")
    .createSignedUploadUrl(objectPath);
  if (eFirma || !firmada) {
    return { ok: false, message: "No fue posible preparar la subida. Intenta de nuevo." };
  }

  return {
    ok: true,
    upload: {
      versionId: String(fila.version_id),
      objectPath,
      expiresAt: String(fila.expires_at),
      signedUrl: firmada.signedUrl,
      token: firmada.token,
    },
  };
}

/**
 * Lee el objeto REAL y lo compara con lo declarado.
 *
 * Aquí es donde una subida se convierte en una versión, o no. Storage vincula
 * la ruta a una reserva pero **no inspecciona el contenido** —lo dejó escrito
 * 0099—, así que este paso es el único que sabe qué se subió de verdad.
 *
 * La firma binaria se comprueba sobre un **prefijo**. Cargar 200 MB en memoria
 * para mirar doce bytes convertiría cada subida en un pico de memoria del
 * servidor, y con dos a la vez se nota.
 *
 * El resumen SHA-256 sí exige leer el archivo entero: es lo que significa un
 * resumen. Se hace en flujo, y con `crypto.subtle` sobre el búfer que Storage
 * devuelve — que para 200 MB es el techo de esta implementación y se dice en la
 * documentación en vez de descubrirse en producción.
 */
export async function finalizeTutorialUpload(
  input: { versionId: string; objectPath: string; declaredMime: TutorialMimeType },
  client?: Db
): Promise<{ ok: true; versionId: string } | { ok: false; message: string }> {
  const supabase = await db(client);

  // 1 · El prefijo, para la firma binaria. Un rango, no el archivo.
  const { data: prefijo, error: ePrefijo } = await supabase.storage
    .from("tutorial-media")
    .download(input.objectPath, {
      // @ts-expect-error el SDK acepta cabeceras de rango por opciones no tipadas
      headers: { Range: `bytes=0-${TUTORIAL_SIGNATURE_PREFIX_BYTES - 1}` },
    });
  if (ePrefijo || !prefijo) {
    await marcarFallida(supabase, input.versionId);
    return { ok: false, message: "No se pudo leer el archivo subido." };
  }
  const cabecera = new Uint8Array(await prefijo.arrayBuffer());
  const detectado = detectTutorialSignature(cabecera);
  if (!signatureMatchesMime(detectado, input.declaredMime)) {
    await marcarFallida(supabase, input.versionId);
    return { ok: false, message: TUTORIAL_SIGNATURE_MESSAGE };
  }

  // 2 · El archivo entero, para el tamaño real y el resumen.
  const { data: completo, error: eCompleto } = await supabase.storage
    .from("tutorial-media").download(input.objectPath);
  if (eCompleto || !completo) {
    await marcarFallida(supabase, input.versionId);
    return { ok: false, message: "No se pudo leer el archivo subido." };
  }
  const bytes = new Uint8Array(await completo.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  // El tipo REAL es el que Storage guardó, no el que dijo el navegador.
  const realMime = (completo as Blob).type || input.declaredMime;

  // La función devuelve el ESTADO, no lanza. Un archivo que no cuadra con lo
  // reservado es un resultado —de un cliente roto o de uno hostil—, no una
  // excepción del sistema: la primera versión lanzaba, y la excepción deshacía
  // con la transacción la marca de fallo que acababa de escribir.
  const { data: estado, error } = await supabase.rpc("tutorial_finalize_upload", {
    p_version_id: input.versionId,
    p_real_size: bytes.byteLength,
    p_real_mime: realMime,
    p_content_hash: hash,
    p_duration_seconds: null,
  });
  if (error) return { ok: false, message: error.message };
  if (String(estado) !== "verified") {
    return {
      ok: false,
      message: "El archivo subido no coincide con lo reservado. Vuelve a intentarlo.",
    };
  }
  return { ok: true, versionId: input.versionId };
}

async function marcarFallida(supabase: Db, versionId: string): Promise<void> {
  await supabase.from("platform_tutorial_versions")
    .update({ file_state: "failed" }).eq("id", versionId);
}

/** Publicar: cierra la vigente, abre esta, y las enlaza. */
export async function publishTutorialVersion(
  input: { versionId: string; changeNote?: string | null }, client?: Db
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("tutorial_publish_version", {
    p_version_id: input.versionId,
    p_change_note: input.changeNote ?? null,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Retirar: deja de verse. No borra nada. */
export async function unpublishTutorial(
  tutorialId: string, client?: Db
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("tutorial_unpublish", { p_tutorial_id: tutorialId });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/**
 * Reponer una versión anterior.
 *
 * Crea una versión NUEVA que apunta al mismo objeto. **No reabre el periodo
 * antiguo**: eso diría que un vídeo estuvo vigente con un hueco imposible en
 * medio. Devuelve la candidata; publicarla es un paso aparte y deliberado.
 */
export async function restoreTutorialVersion(
  input: { versionId: string; changeNote?: string | null }, client?: Db
): Promise<{ ok: true; versionId: string } | { ok: false; message: string }> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("tutorial_restore_version", {
    p_version_id: input.versionId,
    p_change_note: input.changeNote ?? null,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, versionId: String(data) };
}

export type TutorialVersionRow = {
  id: string;
  versionNumber: number;
  fileState: string;
  objectPath: string;
  realSizeBytes: number | null;
  contentHash: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  restoredFromVersionId: string | null;
  changeNote: string | null;
};

/** La historia de un tutorial. Consulta aparte: la pantalla del producto no la pide. */
export async function listTutorialVersions(
  tutorialId: string, client?: Db
): Promise<TutorialVersionRow[]> {
  const supabase = await db(client);
  const { data } = await supabase
    .from("platform_tutorial_versions")
    .select("id, version_number, file_state, object_path, real_size_bytes, content_hash, effective_from, effective_to, restored_from_version_id, change_note")
    .eq("tutorial_id", tutorialId)
    .order("version_number", { ascending: false });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    versionNumber: Number(r.version_number),
    fileState: String(r.file_state),
    objectPath: String(r.object_path),
    realSizeBytes: (r.real_size_bytes as number | null) ?? null,
    contentHash: (r.content_hash as string | null) ?? null,
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    restoredFromVersionId: (r.restored_from_version_id as string | null) ?? null,
    changeNote: (r.change_note as string | null) ?? null,
  }));
}
