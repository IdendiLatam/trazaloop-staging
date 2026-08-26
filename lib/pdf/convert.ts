import "server-only";

/**
 * Trazaloop · EXPORT-01 · Conversión de formatos que el PDF no sabe leer.
 *
 * EL HUECO QUE ESTO CIERRA
 *
 * `ALLOWED_LOGO_TYPES` acepta `image/webp`, pero el escritor de PDF solo sabe
 * incrustar JPEG (paso directo) y PNG (desinflado y vuelto a inflar). Una
 * empresa podía subir un logo perfectamente válido según la plataforma y
 * encontrarse con que sus PDF salían sin él, sin que nadie le dijera por qué.
 *
 * Aceptar un formato y luego ignorarlo es peor que no aceptarlo.
 *
 * POR QUÉ `sharp` Y POR QUÉ ASÍ
 *
 * `sharp` ya venía instalado como dependencia opcional de Next para optimizar
 * imágenes. Depender de algo que está ahí «de rebote» es frágil, así que se
 * declara de forma explícita en package.json.
 *
 * Aun así se importa de forma DINÁMICA y con red de seguridad: si un día no
 * estuviera disponible, el PDF sigue saliendo con el nombre de la empresa como
 * identidad (§20). Un fallo de marca nunca puede romper un documento.
 */

/** Formatos que el escritor de PDF incrusta sin ayuda. */
const NATIVE = new Set(["image/png", "image/jpeg"]);

export type ConversionResult = {
  bytes: Buffer;
  /** Qué pasó, para poder contarlo en la matriz de cobertura y en el informe. */
  outcome: "native" | "converted" | "unconvertible";
  note: string | null;
};

/**
 * Devuelve bytes que el PDF sepa incrustar.
 *
 * Nunca lanza: un logo que no se puede convertir devuelve sus bytes originales
 * y el aviso correspondiente, y quien llama decide seguir sin logo.
 */
export async function toEmbeddableImage(
  bytes: Buffer,
  mimeType: string | null
): Promise<ConversionResult> {
  const mime = (mimeType ?? "").toLowerCase();
  if (NATIVE.has(mime)) return { bytes, outcome: "native", note: null };

  try {
    const mod = await import("sharp");
    const sharp = (mod as unknown as { default: (b: Buffer) => { png: () => { toBuffer: () => Promise<Buffer> } } }).default;
    // A PNG y no a JPEG: los logos suelen llevar transparencia, y aplanarla
    // contra blanco deja un recuadro visible sobre cualquier fondo (§19).
    const png = await sharp(bytes).png().toBuffer();
    return { bytes: png, outcome: "converted", note: `Convertido de ${mime || "formato desconocido"} a PNG.` };
  } catch {
    return {
      bytes,
      outcome: "unconvertible",
      note:
        `No fue posible convertir el logo (${mime || "formato desconocido"}). ` +
        "El PDF usa el nombre de la empresa como identidad.",
    };
  }
}

/** Si la plataforma acepta subirlo, esta función tiene que poder resolverlo.
 *  Una prueba pura compara esta lista con ALLOWED_LOGO_TYPES. */
export function canEmbed(mimeType: string | null): boolean {
  const mime = (mimeType ?? "").toLowerCase();
  return NATIVE.has(mime) || mime === "image/webp";
}
