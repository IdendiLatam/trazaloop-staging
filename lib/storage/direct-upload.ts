"use client";

import { createBrowserClient } from "@/lib/supabase/browser";

/**
 * Trazaloop · T9F.5B.1 · CARGA DIRECTA de archivos CPR/TrazaDocs.
 *
 * Los bytes van del navegador a Supabase Storage SIN atravesar ninguna Server
 * Action ni Route Handler de Next.js. Se usa la SESIÓN AUTENTICADA del usuario
 * (anon key + JWT), de modo que la subida queda sujeta a la política INSERT
 * ligada a intent de 0101 §12: si el objeto no corresponde exactamente a un
 * `storage_upload_intent` propio, vigente y con la ruta reservada, Storage lo
 * rechaza.
 *
 * Nota deliberada: NO se usa una signed upload URL. Una URL firmada autoriza
 * por sí misma y NO pasa por la política INSERT de `authenticated` (hallazgo
 * documentado en 0099), de modo que no ejercería la barrera que cierra A01 y
 * A02. Textiles conserva su propio transporte con URL firmada y NO se toca.
 */
export type DirectUploadOutcome =
  | { ok: true }
  | { ok: false; message: string };

export async function uploadFileToIntentPath(input: {
  bucketId: string;
  objectPath: string;
  file: File;
}): Promise<DirectUploadOutcome> {
  const supabase = createBrowserClient();
  const { error } = await supabase.storage
    .from(input.bucketId)
    .upload(input.objectPath, input.file, {
      contentType: input.file.type || "application/octet-stream",
      // upsert:false — un reemplazo es SIEMPRE un objeto nuevo (A03).
      upsert: false,
    });
  if (!error) return { ok: true };

  if (/row-level security|violates|not authorized|Unauthorized/i.test(error.message)) {
    return {
      ok: false,
      message: "El almacenamiento rechazó la subida: la reserva no es válida o expiró. Intenta de nuevo.",
    };
  }
  if (/exists/i.test(error.message)) {
    return { ok: false, message: "Ya existe un archivo en esa ruta. Intenta de nuevo." };
  }
  return { ok: false, message: "No fue posible subir el archivo al almacenamiento. Intenta de nuevo." };
}
