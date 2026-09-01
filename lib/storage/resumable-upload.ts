"use client";

/**
 * Trazaloop · PE-03B3 · Subir un vídeo grande sin empezar de cero cada vez.
 *
 *
 * POR QUÉ HACE FALTA
 *
 * PE-03B1 subía con `uploadToSignedUrl`: una sola petición. Con un tope de
 * 200 MB era razonable. Sin tope no lo es, por dos motivos distintos:
 *
 *   1 · La subida estándar de Supabase está acotada por el `file_size_limit`
 *       GLOBAL del proyecto —50 MiB en el stack local—. Ese techo no lo pone
 *       Trazaloop, pero lo pone, y con él «sin límite» sería una frase vacía.
 *
 *   2 · Una sola petición que falla al 90 % vuelve a empezar. En un vídeo de
 *       tres minutos es molesto; en uno de dos horas por una red de oficina es
 *       la diferencia entre poder subirlo y no.
 *
 * El servicio anuncia soporte de TUS —lo comprobado en PE-03B3 contra el stack
 * local: `tus-resumable: 1.0.0`, `tus-max-size: 52428800000`, es decir
 * **≈ 48,8 GiB**— y por ahí sí cabe un tutorial largo.
 *
 *
 * POR QUÉ NO SE INSTALA `tus-js-client`
 *
 * Por lo mismo que este repositorio no instaló el SDK de Anthropic para hacer
 * una llamada HTTP ni un intérprete de Markdown para pintar un documento legal:
 * lo que hace falta es un subconjunto cerrado del protocolo —crear, enviar
 * trozos, preguntar por dónde iba— y la biblioteca trae mucho más.
 *
 * Y hay una razón concreta además de la del tamaño: lo delicado de reanudar no
 * es el protocolo, es **de dónde se saca el desplazamiento**. Aquí se saca del
 * servidor con `HEAD`, nunca de una cuenta local. Es el mismo principio que
 * arregló la sonda de QA: la verdad la tiene la base, no el flujo.
 *
 *
 * DÓNDE ESTÁ LA AUTORIZACIÓN, Y POR QUÉ ESTO LA MEJORA
 *
 * TUS **no admite** el testigo de una URL de subida firmada: se autentica con
 * el JWT de la sesión. Así que, a diferencia del transporte de B1 —que 0099
 * demostró que se salta la política INSERT—, aquí la política **sí se ejerce**:
 *
 *     bucket_id = 'tutorial-media'
 *     and is_platform_superadmin()
 *     and tutorial_media_has_reservation(name)
 *
 * La reserva la sigue creando el servidor, y sin ella no hay ruta que valga.
 * Quien no sea superadministrador no consigue reserva y, si lo intentara igual,
 * la política lo rechaza. La frontera no se debilita: se refuerza.
 *
 * Ninguna credencial de servicio baja al navegador. Lo que viaja es la sesión de
 * la propia persona, que ya tenía.
 */

/** Lo que se envía de una vez. Seis megas es el tamaño de trozo que Supabase
 *  recomienda para su extremo reanudable. */
export const RESUMABLE_CHUNK_BYTES = 6 * 1024 * 1024;

/** Cuántas veces se reintenta un trozo antes de rendirse. */
const REINTENTOS_POR_TROZO = 3;

export type ResumableProgress = {
  uploadedBytes: number;
  totalBytes: number;
  /** Entre 0 y 1. */
  ratio: number;
};

export type ResumableOutcome =
  | { ok: true }
  | { ok: false; message: string; resumable: boolean };

function base64(texto: string): string {
  return btoa(unescape(encodeURIComponent(texto)));
}

/**
 * Sube un archivo al extremo reanudable, trozo a trozo.
 *
 * `onProgress` se llama tras cada trozo confirmado por el servidor — no tras
 * cada trozo enviado. La diferencia importa: una barra que avanza con lo enviado
 * miente cuando la red se traga los bytes y el servidor no los recibe.
 */
export async function uploadResumable(input: {
  supabaseUrl: string;
  accessToken: string;
  bucketId: string;
  objectPath: string;
  file: File;
  contentType: string;
  onProgress?: (p: ResumableProgress) => void;
  signal?: AbortSignal;
}): Promise<ResumableOutcome> {
  const base = `${input.supabaseUrl}/storage/v1/upload/resumable`;
  const cabeceras = {
    Authorization: `Bearer ${input.accessToken}`,
    "Tus-Resumable": "1.0.0",
  };

  // ── 1 · Crear la subida. La ruta va en los metadatos, no en la URL: es el
  //        servidor quien la asocia al objeto.
  const metadata = [
    `bucketName ${base64(input.bucketId)}`,
    `objectName ${base64(input.objectPath)}`,
    `contentType ${base64(input.contentType)}`,
    // Sin sobrescribir: un reemplazo es SIEMPRE un objeto nuevo. Es la misma
    // regla que la ruta con el id de versión dentro.
    `cacheControl ${base64("3600")}`,
  ].join(",");

  let creacion: Response;
  try {
    creacion = await fetch(base, {
      method: "POST",
      headers: {
        ...cabeceras,
        "Upload-Length": String(input.file.size),
        "Upload-Metadata": metadata,
      },
      signal: input.signal,
    });
  } catch {
    return { ok: false, message: "No se pudo contactar con el almacenamiento.", resumable: true };
  }

  if (creacion.status !== 201) {
    const cuerpo = await creacion.text().catch(() => "");
    return {
      ok: false,
      message: cuerpo || `El almacenamiento rechazó la subida (${creacion.status}).`,
      resumable: false,
    };
  }
  const ubicacion = creacion.headers.get("location");
  if (!ubicacion) {
    return { ok: false, message: "El almacenamiento no devolvió dónde subir.", resumable: false };
  }
  const destino = new URL(ubicacion, base).toString();

  // ── 2 · Enviar los trozos, preguntando siempre por dónde iba el SERVIDOR.
  let offset = 0;
  let intentos = 0;

  while (offset < input.file.size) {
    if (input.signal?.aborted) {
      return { ok: false, message: "Subida cancelada.", resumable: true };
    }

    const fin = Math.min(offset + RESUMABLE_CHUNK_BYTES, input.file.size);
    // `slice` de un File NO lee el archivo: devuelve una vista perezosa. El
    // navegador solo materializa el trozo que se está enviando, así que la
    // memoria no crece con el tamaño del vídeo.
    const trozo = input.file.slice(offset, fin);

    let respuesta: Response | null = null;
    try {
      respuesta = await fetch(destino, {
        method: "PATCH",
        headers: {
          ...cabeceras,
          "Content-Type": "application/offset+octet-stream",
          "Upload-Offset": String(offset),
        },
        body: trozo,
        signal: input.signal,
      });
    } catch {
      respuesta = null;
    }

    if (respuesta && respuesta.status >= 200 && respuesta.status < 300) {
      const nuevo = Number(respuesta.headers.get("upload-offset"));
      // El desplazamiento lo dice el SERVIDOR. Sumar el tamaño del trozo por
      // nuestra cuenta sería creerle al cliente, y es justo lo que no se hace.
      offset = Number.isFinite(nuevo) && nuevo > offset ? nuevo : fin;
      intentos = 0;
      input.onProgress?.({
        uploadedBytes: offset,
        totalBytes: input.file.size,
        ratio: input.file.size > 0 ? offset / input.file.size : 1,
      });
      continue;
    }

    // Un trozo falló. Antes de reintentar se le pregunta al servidor por dónde
    // va de verdad: puede haber recibido parte, o todo, o nada.
    intentos += 1;
    if (intentos > REINTENTOS_POR_TROZO) {
      return {
        ok: false,
        message: "La subida se interrumpió y no se pudo reanudar.",
        resumable: true,
      };
    }

    const real = await consultarOffset(destino, cabeceras, input.signal);
    if (real === null) {
      await esperar(500 * intentos);
      continue;
    }
    offset = real;
    input.onProgress?.({
      uploadedBytes: offset,
      totalBytes: input.file.size,
      ratio: input.file.size > 0 ? offset / input.file.size : 1,
    });
    await esperar(500 * intentos);
  }

  return { ok: true };
}

/** Le pregunta al servidor cuántos bytes tiene ya. La verdad está ahí. */
async function consultarOffset(
  destino: string, cabeceras: Record<string, string>, signal?: AbortSignal
): Promise<number | null> {
  try {
    const r = await fetch(destino, { method: "HEAD", headers: cabeceras, signal });
    if (!r.ok) return null;
    const n = Number(r.headers.get("upload-offset"));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
