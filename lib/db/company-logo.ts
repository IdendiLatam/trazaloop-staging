import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { decodeImage, MAX_LOGO_BYTES, type PdfImage } from "@/lib/pdf/image";

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
 * Y si algo falla —no hay logo, el formato no se puede incrustar, el archivo
 * está corrupto, el bucket no responde— se devuelve `null` y el PDF se genera
 * igual, con el nombre de la empresa. Un adorno no puede impedir que alguien
 * descargue su procedimiento.
 */
export type CompanyLogo = { image: PdfImage; storagePath: string };

export async function loadCompanyLogoForPdf(organizationId: string): Promise<CompanyLogo | null> {
  const supabase = await createServerClient();

  // La ruta sale de la FILA de la empresa, jamás de la petición. El `.eq` la
  // ata al identificador ya validado en servidor.
  const { data: org } = await supabase
    .from("organizations")
    .select("logo_storage_path, logo_size_bytes")
    .eq("id", organizationId)
    .maybeSingle();

  const storagePath = (org?.logo_storage_path as string | null) ?? null;
  if (!storagePath) return null;

  // Segundo cinturón: la ruta guardada debe pertenecer a ESTA empresa. Si una
  // fila quedara con una ruta ajena —por un error de datos o por una escritura
  // maliciosa— no se leería igualmente.
  if (!storagePath.startsWith(`${organizationId}/`)) return null;

  const declaredSize = (org?.logo_size_bytes as number | null) ?? null;
  if (declaredSize !== null && declaredSize > MAX_LOGO_BYTES) return null;

  const { data: file, error } = await supabase.storage
    .from("organization-assets")
    .download(storagePath);
  if (error || !file) return null;

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_LOGO_BYTES) return null;

  const decoded = decodeImage(bytes);
  if (decoded.error !== null) return null;

  return { image: decoded.image, storagePath };
}
