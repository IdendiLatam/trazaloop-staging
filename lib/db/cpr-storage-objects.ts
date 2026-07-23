import "server-only";

// Trazaloop · T9F.5B · A05/A06/A07 · VERIFICACIÓN FÍSICA de los objetos
// CPR/TrazaDocs antes de finalizar.
//
// T9F.5A demostró que los finalizers CPR/TrazaDocs eran CLIENT-TRUSTING: no
// consultaban `storage.objects`, de modo que se podía finalizar sin haber
// subido nada (A05), declarando menos bytes de los reales (A06) o un MIME que
// el contenido no respalda (A07).
//
// Este módulo replica —sin alterarlo— el patrón que Textiles ya usa desde
// T9E.2/T9E.3 (`getTextileEvidenceObjectInfo` + firma binaria): el SERVIDOR
// consulta la metadata real del objeto y descarga sus bytes para validar la
// firma. El cliente no aporta tamaño, MIME, ruta ni existencia.
//
// `import "server-only"` garantiza que este módulo jamás entre en un bundle de
// cliente. La lectura usa la SESIÓN DEL USUARIO (política SELECT de Storage),
// no service_role: el servidor no necesita privilegios para leer lo que el
// propio usuario acaba de subir, y así la lectura sigue sujeta a RLS.
import { createServerClient } from "@/lib/supabase/server";

export type CprStorageBucketId = "evidences" | "trazadocs-documents";

export type CprObjectInfo = {
  sizeBytes: number;
  mimeType: string | null;
};

/**
 * Metadata REAL del objeto en Storage: existencia, tamaño y Content-Type
 * almacenado. Devuelve null si el objeto NO existe, si el bucket o la ruta no
 * coinciden, o si la metadata no puede consultarse — en los tres casos el
 * llamador debe FALLAR CERRADO y no finalizar (A05).
 *
 * ADVERTENCIA (misma que en Textiles): el Content-Type almacenado proviene del
 * header del PUT del navegador; NUNCA es prueba del formato real. Por eso la
 * finalización exige además la verificación de FIRMA BINARIA.
 */
export async function getCprStorageObjectInfo(
  bucketId: CprStorageBucketId,
  objectPath: string
): Promise<CprObjectInfo | null> {
  if (!objectPath || objectPath.includes("..")) return null;
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage.from(bucketId).info(objectPath);
  if (error || !data) return null;
  const size = typeof data.size === "number" ? data.size : null;
  // Un tamaño ausente o no positivo es tan inutilizable como la inexistencia:
  // sin tamaño físico verificable no se finaliza (A06, fail-closed).
  if (size === null || size <= 0) return null;
  return {
    sizeBytes: size,
    mimeType: (data.contentType as string | undefined) ?? null,
  };
}

/**
 * Bytes REALES del objeto para la verificación de firma binaria en servidor
 * (A07). El archivo JAMÁS viaja por la Server Action desde el navegador: se
 * lee de Storage, que es la única fuente de verdad sobre lo que se subió.
 */
export async function downloadCprStorageObjectBytes(
  bucketId: CprStorageBucketId,
  objectPath: string
): Promise<Uint8Array | null> {
  if (!objectPath || objectPath.includes("..")) return null;
  const supabase = await createServerClient();
  const { data, error } = await supabase.storage.from(bucketId).download(objectPath);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
