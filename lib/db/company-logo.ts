import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { decodeImage, MAX_LOGO_BYTES, type PdfImage } from "@/lib/pdf/image";
import { toEmbeddableImage } from "@/lib/pdf/convert";

/**
 * Trazaloop · QUALITY-03.1 · El logo de la empresa, para incrustarlo en un PDF.
 *
 * REUTILIZA la fuente que ya existe desde el Sprint 9.2: el bucket privado
 * `organization-assets` y la columna `organizations.logo_storage_path`. No hay
 * un logo «de Quality», ni una segunda carga, ni una tabla nueva. La empresa
 * sube su logo una vez, en Datos de empresa, y aparece en sus PDF.
 *
 * SEGURIDAD — el generador NUNCA recibe una URL.
 *
 * La tentación evidente sería aceptar la dirección del logo desde el navegador
 * y descargarla. Eso convertiría el servidor en un cliente HTTP que va a donde
 * le digan: un atacante podría apuntarlo a la red interna, a un endpoint de
 * metadatos de la nube o al bucket de otra empresa, y el PDF le devolvería el
 * resultado. Es una SSRF de manual.
 *
 * Aquí el único dato que entra es un `organizationId` que el servidor ya
 * validó contra la sesión. De ahí sale la ruta guardada en la propia fila de
 * la empresa, y esa ruta se lee del bucket con la sesión del usuario, de modo
 * que la RLS del Storage vuelve a comprobarlo. En ningún punto de la cadena
 * hay un valor que venga del cliente.
 *
 * Y si algo falla el PDF se genera igual, con el nombre de la empresa. Un
 * adorno no puede impedir que alguien descargue su procedimiento.
 *
 * EXPORT-01.2 (§10) · PERO «no hay logo» y «hay logo y no sirve» NO son lo
 * mismo.
 *
 * Antes las dos situaciones devolvían `null`, así que una empresa que había
 * subido su logo y cuyo archivo estaba dañado veía exactamente lo mismo que una
 * que nunca subió nada: un PDF sin logo y ninguna explicación. El resultado es
 * que el problema podía durar años sin que nadie lo supiera.
 *
 * Ahora se devuelve un VEREDICTO. El motivo es interno —nunca se enseña la ruta
 * de Storage ni el error del bucket—, pero el encabezado sí puede decir, en una
 * línea, que el logo configurado no se pudo usar.
 */
export type LogoFailure =
  | "path_mismatch"
  | "too_large"
  | "download_failed"
  | "unsupported_format";

export type CompanyLogoResult =
  /** La empresa no ha cargado ningún logo. Es un estado normal. */
  | { outcome: "none" }
  /** Hay logo y se puede incrustar. */
  | { outcome: "ok"; image: PdfImage; storagePath: string }
  /** Hay un logo DECLARADO que no se pudo usar. Esto hay que decirlo. */
  | { outcome: "unusable"; reason: LogoFailure };

export type CompanyLogo = { image: PdfImage; storagePath: string };

export async function loadCompanyLogo(organizationId: string): Promise<CompanyLogoResult> {
  const supabase = await createServerClient();

  // La ruta sale de la FILA de la empresa, jamás de la petición. El `.eq` la
  // ata al identificador ya validado en servidor.
  const { data: org } = await supabase
    .from("organizations")
    .select("logo_storage_path, logo_size_bytes")
    .eq("id", organizationId)
    .maybeSingle();

  const storagePath = (org?.logo_storage_path as string | null) ?? null;
  if (!storagePath) return { outcome: "none" };

  // Segundo cinturón: la ruta guardada debe pertenecer a ESTA empresa. Si una
  // fila quedara con una ruta ajena —por un error de datos o por una escritura
  // maliciosa— no se leería igualmente.
  if (!storagePath.startsWith(`${organizationId}/`)) return { outcome: "unusable", reason: "path_mismatch" };

  const declaredSize = (org?.logo_size_bytes as number | null) ?? null;
  if (declaredSize !== null && declaredSize > MAX_LOGO_BYTES) {
    return { outcome: "unusable", reason: "too_large" };
  }

  const { data: file, error } = await supabase.storage
    .from("organization-assets")
    .download(storagePath);
  if (error || !file) return { outcome: "unusable", reason: "download_failed" };

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_LOGO_BYTES) return { outcome: "unusable", reason: "too_large" };

  // EXPORT-01 · Si el formato no se incrusta directamente —WebP es el caso
  // real, porque la plataforma lo acepta al subir— se convierte en servidor
  // antes de rendirse. Antes esto devolvía `null` en silencio y la empresa
  // veía sus PDF sin logo sin saber por qué.
  let decoded = decodeImage(bytes);
  if (decoded.error !== null) {
    const converted = await toEmbeddableImage(bytes, file.type ?? null);
    if (converted.outcome === "converted") decoded = decodeImage(converted.bytes);
  }
  if (decoded.error !== null) return { outcome: "unusable", reason: "unsupported_format" };

  return { outcome: "ok", image: decoded.image, storagePath };
}

/**
 * Compatibilidad: los dos artefactos documentales heredados y las pruebas de
 * QUALITY-03.1 piden «el logo o nada». Se conserva como envoltorio del
 * veredicto para no tener dos lecturas del bucket.
 */
export async function loadCompanyLogoForPdf(organizationId: string): Promise<CompanyLogo | null> {
  const r = await loadCompanyLogo(organizationId);
  return r.outcome === "ok" ? { image: r.image, storagePath: r.storagePath } : null;
}
