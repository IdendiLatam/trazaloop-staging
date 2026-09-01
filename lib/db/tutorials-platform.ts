import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/lib/supabase/server";
import { isKnownPageKey, getPageKey } from "@/lib/modules/page-keys";
import {
  TUTORIAL_UPLOAD_HORIZON_SECONDS,
  validateTutorialFileDeclaration,
  TUTORIAL_SIGNATURE_MESSAGE,
  type TutorialMimeType,
} from "@/lib/domain/tutorial-media";
import { verifyTutorialObject } from "@/lib/db/tutorial-integrity";

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
    p_ttl_seconds: TUTORIAL_UPLOAD_HORIZON_SECONDS,
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
 * Desde PE-03B3 se hace **en flujo**: el resumen se calcula trozo a trozo y el
 * pico de memoria es un trozo, no el vídeo. Sin eso, retirar el tope de tamaño
 * habría convertido cada finalización en un pico de memoria del tamaño del
 * archivo — y ahora un archivo puede ser cualquier cosa.
 *
 * Tamaño real, resumen y firma binaria salen de **una sola pasada**: leer dos
 * veces duplicaría el tráfico contra el almacenamiento.
 */
export async function finalizeTutorialUpload(
  input: { versionId: string; objectPath: string; declaredMime: TutorialMimeType },
  client?: Db
): Promise<{ ok: true; versionId: string } | { ok: false; message: string }> {
  const supabase = await db(client);

  // Se firma una lectura y se verifica EN FLUJO. Ver `tutorial-integrity.ts`:
  // el pico de memoria es un trozo, no el vídeo. PE-03B1 cargaba el archivo
  // entero, que con un tope de 200 MB era caro y desde PE-03B3 —sin tope— sería
  // insostenible.
  const { data: firma, error: eFirma } = await supabase.storage
    .from("tutorial-media").createSignedUrl(input.objectPath, 60 * 30);
  if (eFirma || !firma?.signedUrl) {
    await marcarFallida(supabase, input.versionId);
    return { ok: false, message: "No se pudo leer el archivo subido." };
  }

  const verificado = await verifyTutorialObject(firma.signedUrl, input.declaredMime);
  if (!verificado.ok) {
    await marcarFallida(supabase, input.versionId);
    if (verificado.reason === "signature_mismatch") {
      return { ok: false, message: TUTORIAL_SIGNATURE_MESSAGE };
    }
    if (verificado.reason === "empty") {
      return { ok: false, message: "El archivo subido está vacío." };
    }
    return { ok: false, message: "No se pudo leer el archivo subido." };
  }

  // La función devuelve el ESTADO, no lanza. Un archivo que no cuadra con lo
  // reservado es un resultado —de un cliente roto o de uno hostil—, no una
  // excepción del sistema: la primera versión lanzaba, y la excepción deshacía
  // con la transacción la marca de fallo que acababa de escribir.
  const { data: estado, error } = await supabase.rpc("tutorial_finalize_upload", {
    p_version_id: input.versionId,
    p_real_size: verificado.sizeBytes,
    p_real_mime: input.declaredMime,
    p_content_hash: verificado.sha256,
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

// ===========================================================================
// LO QUE NECESITA LA CONSOLA · PE-03B2
// ===========================================================================

export type TutorialConsoleRow = {
  id: string;
  tutorialType: "page" | "welcome";
  pageKey: string | null;
  moduleKey: string | null;
  title: string;
  status: string;
  /** La versión que se está viendo, si hay alguna. */
  current: { versionId: string; versionNumber: number; publishedAt: string | null } | null;
  /** La última candidata verificada y sin publicar. */
  candidate: { versionId: string; versionNumber: number; fileState: string } | null;
  /** Cuántas versiones llegaron a publicarse alguna vez. */
  publishedCount: number;
  /** Subidas que no cuadraron. Se muestran aparte para poder reintentarlas. */
  failedCount: number;
};

export type TutorialListFilters = {
  search?: string | null;
  moduleKey?: string | null;
  tutorialType?: string | null;
  /** `con_video`, `sin_video`, `con_candidata` */
  coverage?: string | null;
};

export type ConsoleRead<T> = { status: "ok"; data: T } | { status: "unavailable" };

/**
 * La lista de la consola, en TRES consultas.
 *
 * No una por fila. Con veinte tutoriales y una consulta por cada uno para saber
 * su versión vigente, la pantalla haría veintiuna; con cuarenta, cuarenta y una,
 * y nadie se daría cuenta hasta que fuera lenta. Es la misma decisión que tomó
 * `listHelpItems` en PE-02B4.
 */
export async function listTutorialsForConsole(
  filters: TutorialListFilters = {}, client?: Db
): Promise<ConsoleRead<TutorialConsoleRow[]>> {
  const supabase = await db(client);

  let q = supabase.from("platform_tutorials")
    .select("id, tutorial_type, page_key, module_key, title, status");
  if (filters.moduleKey) q = q.eq("module_key", filters.moduleKey);
  if (filters.tutorialType) q = q.eq("tutorial_type", filters.tutorialType);
  const texto = (filters.search ?? "").trim().toLowerCase();
  if (texto.length > 0) {
    q = q.or(`page_key.ilike.%${texto}%,title.ilike.%${texto}%`);
  }
  const { data, error } = await q.order("tutorial_type").order("page_key");
  if (error) return { status: "unavailable" };

  const filas = (data ?? []) as Record<string, unknown>[];
  if (filas.length === 0) return { status: "ok", data: [] };
  const ids = filas.map((r) => String(r.id));

  const { data: versiones, error: eV } = await supabase
    .from("platform_tutorial_versions")
    .select("id, tutorial_id, version_number, file_state, effective_from, effective_to, published_at")
    .in("tutorial_id", ids);
  if (eV) return { status: "unavailable" };

  const porTutorial = new Map<string, Record<string, unknown>[]>();
  for (const v of (versiones ?? []) as Record<string, unknown>[]) {
    const k = String(v.tutorial_id);
    porTutorial.set(k, [...(porTutorial.get(k) ?? []), v]);
  }

  const salida: TutorialConsoleRow[] = filas.map((t) => {
    const vs = porTutorial.get(String(t.id)) ?? [];
    const vigente = vs.find((v) => v.effective_from !== null && v.effective_to === null);
    const candidatas = vs
      .filter((v) => v.effective_from === null && v.file_state === "verified")
      .sort((a, b) => Number(b.version_number) - Number(a.version_number));
    return {
      id: String(t.id),
      tutorialType: t.tutorial_type as "page" | "welcome",
      pageKey: (t.page_key as string | null) ?? null,
      moduleKey: (t.module_key as string | null) ?? null,
      title: String(t.title),
      status: String(t.status),
      current: vigente
        ? {
            versionId: String(vigente.id),
            versionNumber: Number(vigente.version_number),
            publishedAt: (vigente.published_at as string | null) ?? null,
          }
        : null,
      candidate: candidatas[0]
        ? {
            versionId: String(candidatas[0].id),
            versionNumber: Number(candidatas[0].version_number),
            fileState: String(candidatas[0].file_state),
          }
        : null,
      publishedCount: vs.filter((v) => v.effective_from !== null).length,
      failedCount: vs.filter((v) => v.file_state === "failed").length,
    };
  });

  // El filtro de cobertura se resuelve aquí porque depende de las versiones,
  // que ya están cargadas. Volver a la base para esto sería una consulta más
  // por el mismo dato.
  const cobertura = filters.coverage ?? null;
  if (cobertura === "con_video") return { status: "ok", data: salida.filter((r) => r.current) };
  if (cobertura === "sin_video") return { status: "ok", data: salida.filter((r) => !r.current) };
  if (cobertura === "con_candidata") {
    return { status: "ok", data: salida.filter((r) => r.candidate) };
  }
  return { status: "ok", data: salida };
}

export type TutorialVersionDetail = TutorialVersionRow & {
  originalFilename: string;
  declaredMime: string;
  realMime: string | null;
  durationSeconds: number | null;
  title: string | null;
  description: string | null;
  publishedAt: string | null;
  uploadExpiresAt: string;
  uploadedByName: string | null;
  publishedByName: string | null;
};

export type TutorialDetail = {
  tutorial: TutorialSummary;
  versions: TutorialVersionDetail[];
};

/** La ficha: el tutorial y TODAS sus versiones. Dos consultas. */
export async function getTutorialDetail(
  tutorialId: string, client?: Db
): Promise<ConsoleRead<TutorialDetail | null>> {
  const supabase = await db(client);
  const { data: t, error: eT } = await supabase.from("platform_tutorials")
    .select("id, tutorial_type, page_key, module_key, title, status")
    .eq("id", tutorialId).maybeSingle();
  if (eT) return { status: "unavailable" };
  if (!t) return { status: "ok", data: null };

  const { data: vs, error: eV } = await supabase.from("platform_tutorial_versions")
    .select("id, version_number, file_state, object_path, original_filename, declared_mime, real_mime, real_size_bytes, content_hash, duration_seconds, title, description, change_note, effective_from, effective_to, published_at, upload_expires_at, restored_from_version_id, uploaded_by:profiles!platform_tutorial_versions_uploaded_by_fkey(full_name), published_by:profiles!platform_tutorial_versions_published_by_fkey(full_name)")
    .eq("tutorial_id", tutorialId)
    .order("version_number", { ascending: false });
  if (eV) return { status: "unavailable" };

  const fila = t as Record<string, unknown>;
  return {
    status: "ok",
    data: {
      tutorial: {
        id: String(fila.id),
        tutorialType: fila.tutorial_type as "page" | "welcome",
        pageKey: (fila.page_key as string | null) ?? null,
        moduleKey: (fila.module_key as string | null) ?? null,
        title: String(fila.title),
        status: String(fila.status),
      },
      versions: ((vs ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        versionNumber: Number(r.version_number),
        fileState: String(r.file_state),
        objectPath: String(r.object_path),
        originalFilename: String(r.original_filename),
        declaredMime: String(r.declared_mime),
        realMime: (r.real_mime as string | null) ?? null,
        realSizeBytes: (r.real_size_bytes as number | null) ?? null,
        contentHash: (r.content_hash as string | null) ?? null,
        durationSeconds: (r.duration_seconds as number | null) ?? null,
        title: (r.title as string | null) ?? null,
        description: (r.description as string | null) ?? null,
        changeNote: (r.change_note as string | null) ?? null,
        effectiveFrom: (r.effective_from as string | null) ?? null,
        effectiveTo: (r.effective_to as string | null) ?? null,
        publishedAt: (r.published_at as string | null) ?? null,
        uploadExpiresAt: String(r.upload_expires_at),
        restoredFromVersionId: (r.restored_from_version_id as string | null) ?? null,
        uploadedByName: (r.uploaded_by as { full_name?: string } | null)?.full_name ?? null,
        publishedByName: (r.published_by as { full_name?: string } | null)?.full_name ?? null,
      })),
    },
  };
}

/**
 * Firma la vista previa de CUALQUIER versión, para personal de plataforma.
 *
 * Es deliberadamente distinta de `signTutorialPlayback`: esa resuelve cuál es la
 * vigente y se niega a firmar otra cosa. Esta firma la que se le pida —incluida
 * una candidata que nadie más puede ver— y por eso su única barrera es quién
 * llama.
 *
 * No hay cliente administrativo: la política `tutorial_media_staff_select` del
 * cubo deja leer estos objetos a personal de plataforma, así que la firma la
 * emite su propia sesión. Si mañana alguien dejara de ser personal, dejaría de
 * poder firmar sin tocar este código.
 */
export async function signTutorialPreview(
  versionId: string, client?: Db
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("platform_tutorial_versions")
    .select("object_path, file_state").eq("id", versionId).maybeSingle();
  if (error) return { ok: false, message: "No se pudo consultar esa versión." };
  if (!data) return { ok: false, message: "Esa versión no existe o no puedes verla." };
  const v = data as { object_path: string; file_state: string };
  if (v.file_state === "reserved") {
    return { ok: false, message: "Esa versión todavía no tiene archivo subido." };
  }

  const { data: firma, error: eF } = await supabase.storage
    .from("tutorial-media").createSignedUrl(v.object_path, 60 * 30);
  if (eF || !firma?.signedUrl) {
    return { ok: false, message: "No fue posible preparar la vista previa." };
  }
  return { ok: true, url: firma.signedUrl };
}

/** Marca una reserva como fallida: la subida no llegó, o se abandonó. */
export async function failTutorialVersion(
  versionId: string, client?: Db
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("platform_tutorial_versions")
    .update({ file_state: "failed" }).eq("id", versionId)
    .is("effective_from", null).select("id");
  if (error) return { ok: false, message: error.message };
  if (!data || data.length === 0) return { ok: false, message: TUTORIAL_FORBIDDEN_MESSAGE };
  return { ok: true };
}
