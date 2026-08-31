/**
 * Trazaloop · PE-03B1 · Qué es un vídeo de tutorial aceptable.
 *
 * Puro: no toca la base ni el almacenamiento. Aquí viven los tres límites que
 * el producto decidió y la única comprobación que no se puede delegar en lo que
 * diga el navegador.
 *
 * POR QUÉ TRES COMPROBACIONES Y NO UNA
 *
 * La extensión la escribe quien nombra el archivo. El tipo declarado lo escribe
 * el navegador. Las dos se pueden poner a mano en treinta segundos. Los
 * primeros bytes del archivo los escribe el programa que lo produjo, y esos son
 * los que dicen si el navegador podrá reproducirlo.
 *
 * Se comprueban las tres porque cada una miente por su lado, y porque un `.mov`
 * renombrado a `.mp4` es un tutorial que alguien no puede ver y nadie sabría
 * hasta que lo intentara.
 */

/** Decisión humana congelada en PE-03B1. */
export const TUTORIAL_MAX_FILE_BYTES = 200 * 1024 * 1024;

/**
 * Los dos únicos formatos que un navegador reproduce sin ayuda.
 *
 * No es una limitación de Storage —acepta cualquier cosa—: es que el catálogo
 * de formatos que se admiten tiene que ser el de los que se pueden ver.
 */
export const TUTORIAL_MIME_TYPES = ["video/mp4", "video/webm"] as const;
export type TutorialMimeType = (typeof TUTORIAL_MIME_TYPES)[number];

export function isTutorialMimeType(value: string): value is TutorialMimeType {
  return (TUTORIAL_MIME_TYPES as readonly string[]).includes(value);
}

/** La extensión que corresponde a cada tipo. */
export function extensionForTutorialMime(mime: TutorialMimeType): ".mp4" | ".webm" {
  return mime === "video/mp4" ? ".mp4" : ".webm";
}

export const TUTORIAL_TOO_LARGE_MESSAGE =
  "El vídeo supera el tamaño máximo permitido (200 MB).";
export const TUTORIAL_BAD_FORMAT_MESSAGE =
  "Solo se admiten vídeos en formato MP4 o WebM.";
export const TUTORIAL_EMPTY_MESSAGE = "El archivo parece vacío.";
export const TUTORIAL_SIGNATURE_MESSAGE =
  "El archivo no parece un vídeo MP4 ni WebM, aunque su nombre lo diga.";

/** Lo que se muestra en una pantalla que aún no tiene tutorial. */
export const TUTORIAL_UNAVAILABLE_MESSAGE =
  "Este tutorial está en actualización y estará disponible pronto";

export type TutorialFileRejection =
  | { ok: true; mime: TutorialMimeType }
  | { ok: false; message: string };

/**
 * Comprueba nombre, tipo declarado y tamaño. **No** mira los bytes: eso es
 * `detectTutorialSignature`, que se hace aparte porque necesita leerlos.
 */
export function validateTutorialFileDeclaration(input: {
  filename: string;
  mime: string;
  sizeBytes: number;
}): TutorialFileRejection {
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, message: TUTORIAL_EMPTY_MESSAGE };
  }
  if (input.sizeBytes > TUTORIAL_MAX_FILE_BYTES) {
    return { ok: false, message: TUTORIAL_TOO_LARGE_MESSAGE };
  }
  if (!isTutorialMimeType(input.mime)) {
    return { ok: false, message: TUTORIAL_BAD_FORMAT_MESSAGE };
  }
  const nombre = input.filename.trim().toLowerCase();
  const esperada = extensionForTutorialMime(input.mime);
  if (!nombre.endsWith(esperada)) {
    return { ok: false, message: TUTORIAL_BAD_FORMAT_MESSAGE };
  }
  return { ok: true, mime: input.mime };
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

/** Cuántos bytes hacen falta para decidir. Se lee un prefijo, no el archivo. */
export const TUTORIAL_SIGNATURE_PREFIX_BYTES = 4096;

export type TutorialDetectedType = "mp4" | "webm" | "unknown";

/**
 * Mira los primeros bytes y dice qué es de verdad.
 *
 * **Lee un prefijo, no el archivo.** Cargar 200 MB en memoria para mirar doce
 * bytes convertiría cada subida en un pico de memoria del servidor, y con dos
 * a la vez se nota.
 *
 * MP4 · un contenedor ISO-BMFF empieza por un átomo `ftyp` en el byte 4. El
 * tamaño que lo precede varía, así que se busca la marca donde está, no el
 * archivo entero.
 *
 * WebM · es Matroska, y empieza por la cabecera EBML `1A 45 DF A3`.
 *
 * Deliberadamente conservador: lo que no reconoce lo llama `unknown` en vez de
 * adivinar. Rechazar un vídeo bueno es un incordio; aceptar uno que no se
 * reproduce es un tutorial roto en producción.
 */
export function detectTutorialSignature(prefix: Uint8Array): TutorialDetectedType {
  // WebM / Matroska: cabecera EBML.
  if (startsWith(prefix, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";

  // MP4 / ISO-BMFF: «ftyp» en el desplazamiento 4.
  if (startsWith(prefix, [0x66, 0x74, 0x79, 0x70], 4)) return "mp4";

  return "unknown";
}

/** ¿Los bytes corresponden al tipo declarado? */
export function signatureMatchesMime(
  detected: TutorialDetectedType, mime: TutorialMimeType
): boolean {
  if (mime === "video/mp4") return detected === "mp4";
  return detected === "webm";
}

/**
 * El nombre con el que el archivo se guarda en el cubo.
 *
 * Es **cosmético**: sirve para que quien mire el cubo entienda qué hay. Jamás
 * autoriza nada, porque quien decide dónde se escribe son los dos primeros
 * segmentos de la ruta, y esos los pone la base al reservar.
 *
 * Se reproduce aquí la misma limpieza que hace `tutorial_reserve_upload` para
 * poder comprobar en una prueba que las dos coinciden.
 */
export function safeTutorialFilename(filename: string, mime: TutorialMimeType): string {
  let seguro = (filename || "video").trim().toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "");
  if (seguro === "") seguro = "video";
  seguro = seguro.slice(0, 80);
  const esperada = extensionForTutorialMime(mime);
  if (!seguro.endsWith(esperada)) seguro += esperada;
  return seguro;
}

/**
 * La ruta de una versión.
 *
 * `{tutorial_id}/{version_id}/{nombre}`. Que el id de la versión esté DENTRO de
 * la ruta es lo que hace imposible sobrescribir una versión publicada: dos
 * versiones no pueden compartir ruta por accidente.
 */
export function tutorialObjectPath(
  tutorialId: string, versionId: string, safeFilename: string
): string {
  return `${tutorialId}/${versionId}/${safeFilename}`;
}

/**
 * El plazo de la URL de reproducción.
 *
 * PE-03A midió que la caducidad es ABSOLUTA y se aplica de verdad, y que el
 * navegador conserva la misma URL toda la sesión del `<video>`. Así que el
 * plazo tiene que cubrir la sesión entera, no la duración del vídeo: quien lo
 * deja abierto y vuelve, al adelantar pide otro rango con la misma URL.
 *
 * Dos horas cubren eso de sobra y siguen siendo un enlace que muere el mismo
 * día. Firmar cuesta unos 18 ms, así que se firma al abrir el reproductor y no
 * al pintar la página: una pantalla con el botón no gasta nada.
 */
export const TUTORIAL_PLAYBACK_TTL_SECONDS = 2 * 60 * 60;

/** El plazo de la reserva de subida. */
export const TUTORIAL_UPLOAD_TTL_SECONDS = 15 * 60;
