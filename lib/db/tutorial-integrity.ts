import "server-only";

import { createHash } from "node:crypto";

import {
  TUTORIAL_SIGNATURE_PREFIX_BYTES, TUTORIAL_HASH_CHUNK_BYTES,
  detectTutorialSignature, signatureMatchesMime,
  type TutorialMimeType, type TutorialDetectedType,
} from "@/lib/domain/tutorial-media";

/**
 * Trazaloop · PE-03B3 · Verificar un vídeo sin cargarlo en memoria.
 *
 * LO QUE HABÍA, Y POR QUÉ YA NO VALE
 *
 * PE-03B1 calculaba el resumen así:
 *
 *     const { data } = await supabase.storage.from(...).download(path);
 *     const bytes = new Uint8Array(await data.arrayBuffer());
 *     await crypto.subtle.digest("SHA-256", bytes);
 *
 * Y lo documentó como el techo de aquella implementación: con un tope de 200 MB,
 * un pico de 200 MB por finalización era caro pero acotado.
 *
 * PE-03B3 retiró el tope. Ese código pasó de caro a **inaceptable**: dos
 * verificaciones simultáneas de vídeos de un giga tumbarían el servidor, y ahora
 * un vídeo de un giga es perfectamente legítimo.
 *
 *
 * LO QUE HACE ESTO
 *
 * Lee el objeto **en flujo** y va alimentando el resumen trozo a trozo. El pico
 * de memoria es un trozo, no el archivo: la diferencia entre 64 KB y lo que
 * pese el vídeo.
 *
 * `crypto.createHash` de Node es incremental por diseño, así que **no hace falta
 * ninguna dependencia** — ni ninguna criptografía escrita a mano, que era la
 * otra forma de equivocarse. SHA-256 sigue siendo el resumen canónico y sigue
 * siendo el mismo número que antes para el mismo archivo.
 *
 *
 * POR QUÉ `fetch` Y NO `.download()`
 *
 * `.download()` del SDK devuelve un `Blob`, y un `Blob` está entero en memoria
 * antes de que uno pueda mirarlo: usarlo habría dejado el problema donde estaba.
 * Con una URL firmada y `fetch`, `res.body` es un `ReadableStream` de verdad.
 */

export type IntegrityResult =
  | {
      ok: true;
      sha256: string;
      sizeBytes: number;
      detected: TutorialDetectedType;
      /** El pico de memoria observado por esta lectura, en bytes. */
      peakChunkBytes: number;
    }
  | { ok: false; reason: "unreachable" | "empty" | "signature_mismatch" };

/**
 * Lee el objeto entero **en flujo** y devuelve su resumen, su tamaño real y qué
 * es de verdad según sus primeros bytes.
 *
 * Las tres cosas en **una sola pasada**. Leer dos veces —una para la firma y
 * otra para el resumen— duplicaría el tráfico contra el almacenamiento, y en un
 * archivo grande eso se nota en la factura antes que en el reloj.
 */
export async function verifyTutorialObject(
  signedUrl: string, declaredMime: TutorialMimeType
): Promise<IntegrityResult> {
  let res: Response;
  try {
    res = await fetch(signedUrl);
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (!res.ok || !res.body) return { ok: false, reason: "unreachable" };

  const hash = createHash("sha256");
  const prefijo = new Uint8Array(TUTORIAL_SIGNATURE_PREFIX_BYTES);
  let enPrefijo = 0;
  let total = 0;
  let picoTrozo = 0;
  void TUTORIAL_HASH_CHUNK_BYTES; // el tamaño lo decide el flujo; se declara para poder comprobarlo

  const lector = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      if (!value) continue;

      // El resumen, incremental. El trozo se descarta en cuanto se consume.
      hash.update(value);
      total += value.byteLength;
      if (value.byteLength > picoTrozo) picoTrozo = value.byteLength;

      // Y de paso se guardan los primeros bytes, que son los que dicen qué es.
      if (enPrefijo < prefijo.length) {
        const cabe = Math.min(prefijo.length - enPrefijo, value.byteLength);
        prefijo.set(value.subarray(0, cabe), enPrefijo);
        enPrefijo += cabe;
      }
    }
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    lector.releaseLock();
  }

  if (total === 0) return { ok: false, reason: "empty" };

  const detected = detectTutorialSignature(prefijo.subarray(0, enPrefijo));
  if (!signatureMatchesMime(detected, declaredMime)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return {
    ok: true,
    sha256: hash.digest("hex"),
    sizeBytes: total,
    detected,
    peakChunkBytes: picoTrozo,
  };
}

/**
 * El mismo resumen, para comprobar en una prueba que la versión incremental y la
 * de toda la vida dan el mismo número.
 *
 * **No se usa en el camino de producción.** Está aquí porque «SHA-256 sigue
 * siendo SHA-256» es una afirmación que hay que poder demostrar, no repetir.
 */
export function sha256OfBuffer(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
