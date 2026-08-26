/**
 * Trazaloop · EXPORT-01.3 · Variantes de imagen para probar la normalización.
 *
 * NO se guarda aquí el logo real de ninguna empresa. El archivo que destapó el
 * defecto es dato del cliente y no entra al repositorio (§28). Lo que sí entra
 * es un fixture SINTÉTICO con la propiedad técnica responsable —un AVIF cuyo
 * nombre y tipo declarado dicen «PNG»—, para que el defecto no pueda volver
 * aunque el archivo original no esté.
 *
 * Los fixtures se GENERAN, no se versionan como binarios: así se puede leer qué
 * tiene cada uno en vez de confiar en un blob opaco.
 */
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------------------
// PNG · construido a mano, para poder elegir cada propiedad
// ---------------------------------------------------------------------------

function crc32(buf: Buffer): number {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

type PngOptions = {
  width: number;
  height: number;
  /** 0 gris · 2 RGB · 3 paleta · 4 gris+alfa · 6 RGBA */
  colorType: 0 | 2 | 3 | 4 | 6;
  bitDepth?: number;
  interlace?: 0 | 1;
  /** Paleta, para colorType 3. */
  palette?: [number, number, number][];
  /** Transparencia por índice (tRNS), para colorType 3. */
  trns?: number[];
};

/**
 * Un PNG con las propiedades pedidas. `bitDepth` distinto de 8, `interlace` y
 * la paleta son justamente las variantes que el escritor de PDF NO sabía leer.
 */
export function makePng(opts: PngOptions): Buffer {
  const { width, height, colorType } = opts;
  const bitDepth = opts.bitDepth ?? 8;
  const interlace = opts.interlace ?? 0;
  const canales = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[10] = 0; // compresión
  ihdr[11] = 0; // filtro
  ihdr[12] = interlace;

  const partes: Buffer[] = [PNG_SIGNATURE, chunk("IHDR", ihdr)];

  if (colorType === 3) {
    const paleta = opts.palette ?? [[0, 0, 0], [255, 255, 255]];
    partes.push(chunk("PLTE", Buffer.from(paleta.flat())));
    if (opts.trns) partes.push(chunk("tRNS", Buffer.from(opts.trns)));
  }

  // Una fila por altura, cada una con su byte de filtro 0 (ninguno). Los
  // valores son deliberadamente uniformes: lo que se prueba es la ESTRUCTURA.
  //
  // En un PNG indexado el byte es un ÍNDICE de la paleta, no un color: si se
  // rellenara con un valor cualquiera apuntaría fuera de ella y el fixture
  // fallaría por un motivo que no es el que se quiere probar.
  const relleno = colorType === 3 ? 0x01 : 0x40;
  const anchoFila = Math.ceil((width * canales * bitDepth) / 8);
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(anchoFila, relleno)]);
  const crudo = Buffer.concat(Array.from({ length: height }, () => fila));

  partes.push(chunk("IDAT", deflateSync(crudo)));
  partes.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(partes);
}

// ---------------------------------------------------------------------------
// Otros formatos · se generan con sharp desde un PNG base
// ---------------------------------------------------------------------------

export type VariantName =
  | "png-rgba" | "png-rgb" | "png-gray" | "png-gray-alpha"
  | "png-palette" | "png-palette-trns" | "png-interlaced" | "png-16bit"
  | "jpeg-baseline" | "jpeg-progressive" | "jpeg-cmyk" | "jpeg-exif-rotated"
  | "webp-lossy" | "webp-lossless-alpha"
  | "avif" | "avif-named-png"
  | "gigante" | "bomba-declarada" | "corrupto" | "html-disfrazado" | "svg";

/** Genera cada variante. Devuelve bytes listos para pasar al normalizador. */
export async function makeVariant(name: VariantName): Promise<Buffer> {
  const sharpMod = await import("sharp");
  const sharp = (sharpMod as unknown as { default: typeof import("sharp") }).default;
  const base = makePng({ width: 120, height: 60, colorType: 6 });

  switch (name) {
    case "png-rgba": return base;
    case "png-rgb": return makePng({ width: 120, height: 60, colorType: 2 });
    case "png-gray": return makePng({ width: 120, height: 60, colorType: 0 });
    case "png-gray-alpha": return makePng({ width: 120, height: 60, colorType: 4 });
    case "png-palette":
      return makePng({ width: 120, height: 60, colorType: 3, palette: [[10, 20, 30], [200, 200, 200]] });
    case "png-palette-trns":
      // Paleta CON transparencia por índice: el decodificador antiguo la leía
      // como opaca y perdía el recorte del logo.
      return makePng({ width: 120, height: 60, colorType: 3, palette: [[0, 0, 0], [255, 255, 255]], trns: [0, 255] });
    case "png-interlaced":
      return sharp(base).png({ progressive: true, force: true }).toBuffer();
    case "png-16bit":
      return sharp(base).toColourspace("rgb16").png({ force: true }).toBuffer();

    case "jpeg-baseline":
      return sharp(base).flatten({ background: "#ffffff" }).jpeg({ progressive: false }).toBuffer();
    case "jpeg-progressive":
      return sharp(base).flatten({ background: "#ffffff" }).jpeg({ progressive: true }).toBuffer();
    case "jpeg-cmyk":
      return sharp(base).flatten({ background: "#ffffff" }).toColourspace("cmyk").jpeg().toBuffer();
    case "jpeg-exif-rotated":
      return sharp(base)
        .flatten({ background: "#ffffff" })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer();

    case "webp-lossy": return sharp(base).webp({ lossless: false }).toBuffer();
    case "webp-lossless-alpha": return sharp(base).webp({ lossless: true }).toBuffer();

    case "avif": return sharp(base).avif({ effort: 0 }).toBuffer();
    case "avif-named-png":
      // EL FIXTURE DEL DEFECTO: bytes AVIF que todo el mundo llama PNG.
      return sharp(base).avif({ effort: 0 }).toBuffer();

    case "gigante":
      // Muchos píxeles Y muchos bytes: se corta por peso antes de tocar nada.
      return makePng({ width: 30000, height: 30000, colorType: 2 });
    case "bomba-declarada": {
      // La bomba de verdad: 250 KB que DECLARAN 30 000 × 30 000. Si alguien
      // reservara memoria antes de mirar la cabecera, el servidor se cae.
      const pequeno = makePng({ width: 8, height: 8, colorType: 2 });
      const copia = Buffer.from(pequeno);
      // IHDR empieza en 8 (longitud) + 4 (tipo) = byte 16 del archivo.
      copia.writeUInt32BE(30000, 16);
      copia.writeUInt32BE(30000, 20);
      return copia;
    }
    case "corrupto": {
      // Un PNG de verdad al que se le destroza el bloque de datos: la cabecera
      // convence a cualquiera y el contenido no se puede descomprimir.
      const roto = Buffer.from(base);
      const idat = roto.indexOf(Buffer.from("IDAT", "latin1"));
      for (let i = idat + 4; i < Math.min(idat + 40, roto.length); i += 1) roto[i] = 0x00;
      return roto;
    }
    case "html-disfrazado":
      return Buffer.from("<!doctype html><script>alert(1)</script>", "latin1");
    case "svg":
      return Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
        "latin1"
      );
  }
}
