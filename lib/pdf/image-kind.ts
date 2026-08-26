/**
 * Trazaloop · EXPORT-01.3 · Qué es DE VERDAD un archivo de imagen.
 *
 * POR QUÉ ESTO EXISTE
 *
 * Una empresa subió su logo, lo vio perfectamente en la interfaz y sus PDF
 * salían sin él. El archivo se llamaba `logo.png`, el almacenamiento lo tenía
 * registrado como `image/png`… y por dentro era AVIF. El navegador lo mostraba
 * porque los navegadores miran el CONTENIDO; la tubería del PDF preguntaba por
 * el tipo declarado, se creía la respuesta y tomaba el camino equivocado.
 *
 * Un tipo declarado es una AFIRMACIÓN DE QUIEN SUBE EL ARCHIVO. Puede estar
 * equivocada sin mala intención —renombrar un archivo basta— y puede estar
 * equivocada a propósito. En los dos casos la única fuente fiable son los
 * primeros bytes.
 *
 * Esta función es PURA y no depende de nada: se puede llamar antes de decidir
 * si un archivo entra siquiera al decodificador.
 */

/** Las familias que Trazaloop sabe normalizar para un PDF. */
export const SUPPORTED_LOGO_KINDS = ["png", "jpeg", "webp", "avif"] as const;
export type SupportedLogoKind = (typeof SUPPORTED_LOGO_KINDS)[number];

/** Lo que puede haber dentro de un archivo. `unknown` incluye a propósito
 *  cualquier cosa que no sea un raster reconocible: HTML, SVG, un script, un
 *  binario cualquiera. Se falla CERRADO. */
export type ImageKind = SupportedLogoKind | "gif" | "bmp" | "tiff" | "heic" | "svg" | "unknown";

const ascii = (b: Buffer, from: number, to: number): string => b.toString("latin1", from, to);

/**
 * Reconoce el formato por sus bytes mágicos. No abre el archivo ni lo
 * decodifica: solo mira la cabecera, que es lo que hace un navegador.
 */
export function sniffImageKind(bytes: Buffer): ImageKind {
  if (bytes.length < 12) return "unknown";

  // PNG · firma de 8 bytes.
  if (bytes.readUInt32BE(0) === 0x89504e47 && bytes.readUInt32BE(4) === 0x0d0a1a0a) return "png";

  // JPEG · SOI. No se exige el EOI final: un JPEG con basura al final sigue
  // siendo un JPEG y los navegadores lo pintan.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";

  // WebP · contenedor RIFF con la marca WEBP.
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";

  // AVIF y HEIC · contenedor ISO-BMFF. La marca principal está en `ftyp`, y
  // las compatibles vienen detrás; se miran las dos porque hay codificadores
  // que ponen `mif1` como marca principal y `avif` como compatible.
  if (ascii(bytes, 4, 8) === "ftyp") {
    const cabecera = ascii(bytes, 8, Math.min(bytes.length, 8 + 64)).toLowerCase();
    if (cabecera.includes("avif") || cabecera.includes("avis")) return "avif";
    if (cabecera.includes("heic") || cabecera.includes("heix") || cabecera.includes("heif")
        || cabecera.includes("mif1") || cabecera.includes("msf1")) return "heic";
    return "unknown";
  }

  if (ascii(bytes, 0, 3) === "GIF") return "gif";
  if (ascii(bytes, 0, 2) === "BM") return "bmp";
  if (bytes.readUInt32BE(0) === 0x49492a00 || bytes.readUInt32BE(0) === 0x4d4d002a) return "tiff";

  // SVG y compañía. Se reconoce para poder RECHAZARLO con un motivo claro, no
  // para admitirlo: un SVG es un documento con scripts, no un raster.
  const inicio = ascii(bytes, 0, Math.min(bytes.length, 256)).trimStart().toLowerCase();
  if (inicio.startsWith("<svg") || (inicio.startsWith("<?xml") && inicio.includes("<svg"))) return "svg";

  return "unknown";
}

export function isSupportedLogoKind(kind: ImageKind): kind is SupportedLogoKind {
  return (SUPPORTED_LOGO_KINDS as readonly string[]).includes(kind);
}

/** El tipo MIME que corresponde a lo que el archivo ES, no a lo que dice ser. */
export function mimeForKind(kind: ImageKind): string | null {
  switch (kind) {
    case "png": return "image/png";
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "avif": return "image/avif";
    case "heic": return "image/heic";
    case "gif": return "image/gif";
    case "bmp": return "image/bmp";
    case "tiff": return "image/tiff";
    case "svg": return "image/svg+xml";
    default: return null;
  }
}

/** La extensión con la que se guarda, derivada del CONTENIDO. */
export function extensionForKind(kind: SupportedLogoKind): string {
  return kind === "jpeg" ? "jpg" : kind;
}
