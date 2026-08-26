import "server-only";

import {
  isSupportedLogoKind, sniffImageKind, type ImageKind, type SupportedLogoKind,
} from "./image-kind";

/**
 * Trazaloop · EXPORT-01.3 · El logo canónico.
 *
 * LA REGLA CONGELADA
 *
 *   Todo logo válido que Trazaloop acepta se NORMALIZA en servidor antes de
 *   llegar al escritor de PDF.
 *
 * POR QUÉ
 *
 * El escritor de PDF de este repositorio está hecho a mano y sabe incrustar dos
 * cosas: JPEG tal cual, y PNG de 8 bits sin entrelazar. Eso cubre la mayoría de
 * los archivos… y deja fuera todo lo demás: un PNG entrelazado, uno de 16 bits,
 * uno indexado con transparencia, un JPEG CMYK, un WebP, un AVIF.
 *
 * La alternativa —enseñarle al escritor todas las variantes de tres o cuatro
 * formatos— es escribir un decodificador de imágenes completo dentro de un
 * generador de PDF. Cada variante que faltara volvería a manifestarse igual:
 * una empresa ve su logo en pantalla y no lo ve en el papel, sin saber por qué.
 *
 * Así que el escritor deja de interpretar variantes. Recibe SIEMPRE lo mismo:
 * PNG, 8 bits, RGBA, sRGB, sin entrelazar, ya orientado. Una sola forma.
 *
 * LO QUE ESTO NO HACE
 *
 * No toca el archivo original. El logo que la empresa subió sigue intacto en su
 * almacenamiento privado y sigue siendo la fuente de su marca; la normalización
 * ocurre EN MEMORIA, durante la generación, y no se guarda en ninguna parte.
 */

/** Lado mayor del logo canónico, en píxeles.
 *
 *  En el papel el logo ocupa una caja de 92 × 30 puntos, es decir unos 32 × 10
 *  milímetros. A 300 ppp eso son ~380 píxeles de ancho. Se deja 1400 —casi
 *  cuatro veces— para que quepan logos apaisados muy anchos y para no notar el
 *  recorte si mañana la caja crece; por encima de eso solo se añaden bytes al
 *  PDF que nadie va a ver. Incrustar 12000 × 8000 para dibujarlo a 30 mm es
 *  regalar quince megas por página. */
export const MAX_CANONICAL_SIDE = 1400;

/** Techo de píxeles de ENTRADA. Un archivo de 300 KB puede declarar 40 000 ×
 *  40 000 y reventar la memoria del servidor al descomprimirlo. libvips corta
 *  antes de asignar nada. */
export const MAX_INPUT_PIXELS = 40_000_000; // 40 Mpx ≈ 6300 × 6300

/** Bytes máximos de entrada, alineado con lo que la plataforma acepta subir. */
export const MAX_LOGO_INPUT_BYTES = 2 * 1024 * 1024;

export type NormalizeFailure =
  /** El contenido no es ninguna imagen que sepamos normalizar. */
  | "unsupported_format"
  /** Es un raster reconocible pero el decodificador no pudo con él. */
  | "decode_failed"
  /** Declara más píxeles de los que se pueden procesar sin riesgo. */
  | "too_many_pixels"
  /** Pesa más de lo admitido. */
  | "too_large"
  /** `sharp` no está disponible en este despliegue. */
  | "no_normalizer";

/**
 * Lo que el renderizador recibe. Siempre la misma forma: por eso se llama
 * canónico.
 */
export type CanonicalLogo = {
  /** PNG 8 bits, RGBA, sRGB, sin entrelazar, con la orientación ya aplicada. */
  png: Buffer;
  width: number;
  height: number;
  /** Metadata TÉCNICA del original, para diagnóstico. Sin nada del negocio. */
  source: {
    kind: SupportedLogoKind;
    format: string | null;
    width: number | null;
    height: number | null;
    channels: number | null;
    space: string | null;
    depth: string | null;
    hasAlpha: boolean | null;
    hasIcc: boolean;
    orientation: number | null;
    pages: number | null;
  };
  /** Si hubo que reducir el tamaño para no incrustar una imagen enorme. */
  resized: boolean;
};

export type NormalizeResult =
  | { outcome: "ok"; logo: CanonicalLogo }
  | { outcome: "unusable"; reason: NormalizeFailure; detail: string };

type SharpModule = typeof import("sharp");

async function loadSharp(): Promise<SharpModule | null> {
  try {
    const mod = await import("sharp");
    return (mod as unknown as { default: SharpModule }).default ?? (mod as unknown as SharpModule);
  } catch {
    return null;
  }
}

/**
 * Convierte cualquier logo admitido en el logo canónico.
 *
 * Nunca lanza: devuelve un veredicto. Un fallo de marca no puede impedir que
 * alguien descargue su procedimiento.
 */
export async function normalizeLogo(bytes: Buffer): Promise<NormalizeResult> {
  if (bytes.length === 0) {
    return { outcome: "unusable", reason: "unsupported_format", detail: "archivo vacío" };
  }
  if (bytes.length > MAX_LOGO_INPUT_BYTES) {
    return { outcome: "unusable", reason: "too_large", detail: `${bytes.length} bytes` };
  }

  // PRIMERO el contenido, nunca el tipo declarado. Esto es lo que impide que un
  // AVIF llamado `logo.png` tome el camino de un PNG, y también lo que impide
  // que un HTML o un SVG con scripts llegue siquiera al decodificador (§23).
  const kind: ImageKind = sniffImageKind(bytes);
  if (!isSupportedLogoKind(kind)) {
    return { outcome: "unusable", reason: "unsupported_format", detail: kind };
  }

  const sharp = await loadSharp();
  if (!sharp) {
    return { outcome: "unusable", reason: "no_normalizer", detail: "sharp no disponible" };
  }

  try {
    // `animated: false` toma el PRIMER fotograma. Un logo corporativo animado
    // es un caso raro y una decisión explícita: se imprime su primer cuadro, no
    // se rechaza el documento entero por eso (§16).
    const entrada = sharp(bytes, {
      animated: false,
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    });

    const meta = await entrada.metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w <= 0 || h <= 0) {
      return { outcome: "unusable", reason: "decode_failed", detail: "sin dimensiones" };
    }
    if (w * h > MAX_INPUT_PIXELS) {
      return { outcome: "unusable", reason: "too_many_pixels", detail: `${w}×${h}` };
    }

    const debeReducir = Math.max(w, h) > MAX_CANONICAL_SIDE;

    let tuberia = sharp(bytes, {
      animated: false,
      limitInputPixels: MAX_INPUT_PIXELS,
      failOn: "error",
    })
      // 1 · Orientación. El EXIF de un JPEG puede decir «esto va girado 90°»; el
      //     PDF no entiende de EXIF, así que se aplica ANTES (§12).
      .rotate()
      // 2 · Espacio de color. Un JPEG CMYK o un PNG con perfil raro se llevan a
      //     sRGB, que es lo único que el PDF va a interpretar igual (§13).
      .toColourspace("srgb")
      // 3 · Alfa siempre presente. Así el escritor tiene UNA forma que tratar, y
      //     un logo recortado conserva su transparencia en vez de aparecer sobre
      //     un rectángulo negro (§10).
      .ensureAlpha();

    if (debeReducir) {
      tuberia = tuberia.resize({
        width: w >= h ? MAX_CANONICAL_SIDE : undefined,
        height: h > w ? MAX_CANONICAL_SIDE : undefined,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // 4 · PNG sin entrelazar y sin paleta: exactamente lo que el escritor sabe
    //     incrustar, y con la máscara de transparencia separable.
    const png = await tuberia
      .png({ compressionLevel: 9, progressive: false, palette: false, force: true })
      .toBuffer();

    // Se releen las dimensiones del RESULTADO: son las que manda al dibujar.
    const salida = await sharp(png).metadata();

    return {
      outcome: "ok",
      logo: {
        png,
        width: salida.width ?? w,
        height: salida.height ?? h,
        resized: debeReducir,
        source: {
          kind,
          format: meta.format ?? null,
          width: meta.width ?? null,
          height: meta.height ?? null,
          channels: meta.channels ?? null,
          space: meta.space ?? null,
          depth: meta.depth ?? null,
          hasAlpha: meta.hasAlpha ?? null,
          hasIcc: Boolean(meta.icc),
          orientation: meta.orientation ?? null,
          pages: meta.pages ?? null,
        },
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const reason: NormalizeFailure = /pixel|limitInputPixels/i.test(msg)
      ? "too_many_pixels"
      : "decode_failed";
    return { outcome: "unusable", reason, detail: msg.slice(0, 120) };
  }
}
