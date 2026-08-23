/**
 * Trazaloop · QUALITY-03.1 · Imágenes rasterizadas para el motor PDF propio.
 *
 * El generador de PDF del repositorio se escribió a mano y solo sabía dibujar
 * texto, líneas y rectángulos. Este archivo le añade lo mínimo para incrustar
 * el logo de la empresa, y lo hace SIN dependencias nuevas: PDF ya entiende de
 * forma nativa los dos formatos que hacen falta.
 *
 * · JPEG → se incrusta TAL CUAL. PDF tiene el filtro /DCTDecode, que es
 *   exactamente JPEG, así que los bytes del archivo son ya el contenido del
 *   flujo. No hay que decodificar nada.
 *
 * · PNG → PDF no conoce PNG, pero sí conoce su compresión: /FlateDecode es
 *   zlib. Aun así no basta con copiar el IDAT, porque un PNG con transparencia
 *   necesita separar el canal alfa en una máscara (/SMask) —si no, el logo se
 *   dibuja sobre un rectángulo negro—. Así que se descomprime con `node:zlib`,
 *   que viene con Node, se deshacen los filtros por línea y se recomprimen el
 *   color y el alfa por separado.
 *
 * · WebP → no se soporta. No hay decodificador en la plataforma y traer uno
 *   sería una dependencia grande para un caso que el respaldo ya cubre con
 *   dignidad. Un logo en WebP hace que el PDF muestre el nombre de la empresa,
 *   igual que si no hubiera logo. Queda declarado como brecha.
 *
 * Nada de esto acepta una URL: la función recibe BYTES que el servidor ya
 * obtuvo del bucket de la empresa autorizada.
 */
import { inflateSync, deflateSync } from "node:zlib";

export type PdfImage = {
  /** Ancho y alto en píxeles. */
  width: number;
  height: number;
  /** Contenido del flujo, ya en la forma que PDF espera. */
  data: Buffer;
  /** `/DCTDecode` para JPEG, `/FlateDecode` para PNG. */
  filter: "DCTDecode" | "FlateDecode";
  colorSpace: "DeviceRGB" | "DeviceGray";
  bitsPerComponent: number;
  /** Canal alfa separado, cuando el original lo traía. */
  alpha?: Buffer;
};

/** Tamaño máximo aceptado. Un logo es un logo: por encima de esto casi seguro
 *  es una fotografía subida por error, y un PDF de la Lista Maestra no debe
 *  pesar quince megas por un encabezado. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** Píxeles máximos por lado. Descomprimir un PNG declarado de 30 000 × 30 000
 *  reventaría la memoria del servidor: se rechaza antes de tocar zlib. */
const MAX_DIMENSION = 4096;

export type DecodeResult = { image: PdfImage; error: null } | { image: null; error: string };

export function decodeImage(bytes: Buffer): DecodeResult {
  if (bytes.length === 0) return { image: null, error: "El archivo está vacío." };
  if (bytes.length > MAX_LOGO_BYTES) {
    return { image: null, error: "El logo pesa más de lo que admite el PDF." };
  }
  if (isPng(bytes)) return decodePng(bytes);
  if (isJpeg(bytes)) return decodeJpeg(bytes);
  return { image: null, error: "Formato de imagen no soportado en el PDF." };
}

function isPng(b: Buffer): boolean {
  return b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a;
}
function isJpeg(b: Buffer): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;
}

// ---------------------------------------------------------------------------
// JPEG — las dimensiones viven en el marcador SOF; el resto se copia tal cual.
// ---------------------------------------------------------------------------
function decodeJpeg(bytes: Buffer): DecodeResult {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    // SOF0…SOF15 salvo los que no son «start of frame» (DHT, JPG, DAC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      const components = bytes[offset + 9];
      if (width === 0 || height === 0) return { image: null, error: "El JPEG declara un tamaño inválido." };
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        return { image: null, error: "El logo tiene demasiados píxeles para incrustarlo." };
      }
      if (components !== 1 && components !== 3) {
        return { image: null, error: "El JPEG usa un espacio de color que el PDF no puede incrustar." };
      }
      return {
        image: {
          width, height, data: bytes, filter: "DCTDecode",
          colorSpace: components === 1 ? "DeviceGray" : "DeviceRGB",
          bitsPerComponent: 8,
        },
        error: null,
      };
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return { image: null, error: "El JPEG está mal formado." };
    offset += 2 + length;
  }
  return { image: null, error: "No fue posible leer el tamaño del JPEG." };
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------
function decodePng(bytes: Buffer): DecodeResult {
  let width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = 0;
  const idat: Buffer[] = [];
  let palette: Buffer | null = null;
  let offset = 8;

  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const body = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      bitDepth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === "PLTE") {
      palette = Buffer.from(body);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(body));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length; // longitud + tipo + datos + CRC
  }

  if (width === 0 || height === 0) return { image: null, error: "El PNG está mal formado." };
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return { image: null, error: "El logo tiene demasiados píxeles para incrustarlo." };
  }
  if (interlace !== 0) return { image: null, error: "El PDF no admite un PNG entrelazado." };
  if (bitDepth !== 8) return { image: null, error: "El PDF solo admite PNG de 8 bits por canal." };
  if (idat.length === 0) return { image: null, error: "El PNG no tiene datos de imagen." };

  // 0=gris 2=RGB 3=paleta 4=gris+alfa 6=RGB+alfa
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (channels === 0) return { image: null, error: "El PNG usa un tipo de color no soportado." };
  if (colorType === 3 && palette === null) return { image: null, error: "El PNG con paleta no la incluye." };

  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return { image: null, error: "No fue posible descomprimir el PNG." };
  }

  const pixels = unfilter(raw, width, height, channels);
  if (pixels === null) return { image: null, error: "El PNG tiene líneas mal filtradas." };

  // Separar color y alfa. La transparencia va como /SMask; sin ella, un logo
  // recortado se dibujaría sobre un rectángulo negro.
  const hasAlpha = colorType === 4 || colorType === 6;
  const colorChannels = colorType === 3 ? 3 : colorType === 4 ? 1 : colorType === 6 ? 3 : channels;
  const color = Buffer.alloc(width * height * colorChannels);
  const alpha = hasAlpha ? Buffer.alloc(width * height) : null;

  for (let i = 0; i < width * height; i += 1) {
    const src = i * channels;
    const dst = i * colorChannels;
    if (colorType === 3) {
      const index = pixels[src] * 3;
      if (index + 2 >= palette!.length) return { image: null, error: "El PNG referencia un color fuera de su paleta." };
      color[dst] = palette![index];
      color[dst + 1] = palette![index + 1];
      color[dst + 2] = palette![index + 2];
    } else if (colorType === 4) {
      color[dst] = pixels[src];
      alpha![i] = pixels[src + 1];
    } else if (colorType === 6) {
      color[dst] = pixels[src];
      color[dst + 1] = pixels[src + 1];
      color[dst + 2] = pixels[src + 2];
      alpha![i] = pixels[src + 3];
    } else {
      for (let c = 0; c < colorChannels; c += 1) color[dst + c] = pixels[src + c];
    }
  }

  return {
    image: {
      width, height,
      data: deflateSync(color),
      filter: "FlateDecode",
      colorSpace: colorChannels === 1 ? "DeviceGray" : "DeviceRGB",
      bitsPerComponent: 8,
      alpha: alpha ? deflateSync(alpha) : undefined,
    },
    error: null,
  };
}

/** Deshace los cinco filtros por línea del PNG. Cada línea empieza con un byte
 *  que dice cómo se predijo, y la predicción mira al píxel de la izquierda y a
 *  la línea de arriba. */
function unfilter(raw: Buffer, width: number, height: number, channels: number): Buffer | null {
  const stride = width * channels;
  if (raw.length < height * (stride + 1)) return null;
  const out = Buffer.alloc(height * stride);
  let pos = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos]; pos += 1;
    const rowStart = y * stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[pos + x];
      const left = x >= channels ? out[rowStart + x - channels] : 0;
      const up = y > 0 ? out[prevStart + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[prevStart + x - channels] : 0;
      let restored: number;
      switch (filter) {
        case 0: restored = value; break;
        case 1: restored = value + left; break;
        case 2: restored = value + up; break;
        case 3: restored = value + ((left + up) >> 1); break;
        case 4: restored = value + paeth(left, up, upLeft); break;
        default: return null;
      }
      out[rowStart + x] = restored & 0xff;
    }
    pos += stride;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Encaja la imagen dentro de una caja sin deformarla. Un logo estirado es
 *  peor que ningún logo: la identidad de una empresa incluye sus proporciones. */
export function fitWithin(
  image: { width: number; height: number },
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return { width: image.width * scale, height: image.height * scale };
}
