/**
 * Trazaloop · QUALITY-02 · Generador de PDF.
 *
 * POR QUÉ ESTÁ ESCRITO A MANO Y NO ES UNA DEPENDENCIA
 * ---------------------------------------------------
 * Lo que el sprint pide es un botón «Descargar PDF» que entregue un archivo
 * real, no la impresión del navegador. Las dos familias de solución habituales
 * son un motor de navegador sin cabeza (Puppeteer/Chromium: cientos de MB, no
 * cabe en el despliegue actual) o una librería de composición. Para lo que hay
 * que producir —dos documentos tipográficamente sobrios, texto y tablas— el
 * subconjunto de PDF necesario es pequeño y estable desde 1993: catálogo,
 * páginas, un flujo de contenido por página, las 14 fuentes estándar y una
 * tabla de referencias cruzadas.
 *
 * Escribirlo aquí evita una dependencia binaria en la ruta de despliegue y,
 * sobre todo, deja el resultado COMPROBABLE: los flujos de contenido se
 * emiten SIN comprimir, de modo que una prueba puede abrir el archivo
 * generado y verificar que el código, el título, la revisión y la empresa
 * están realmente dentro (Parte 22 del encargo) en lugar de conformarse con
 * un HTTP 200.
 *
 * Alcance deliberado: fuentes estándar Helvetica en WinAnsiEncoding, texto,
 * líneas y rectángulos. Sin imágenes, sin transparencias, sin fuentes
 * incrustadas, sin formularios. Si algún día hace falta el logo de la empresa
 * dentro del PDF, se añade aquí un objeto XObject de imagen; hoy no es lo que
 * se pide y no se construye por si acaso.
 */

// ---------------------------------------------------------------------------
// Métricas de las fuentes estándar (unidades de 1/1000 em)
//
// Sin estas anchuras no hay salto de línea correcto: medir «a ojo» produce
// líneas que se salen del margen, que es exactamente lo que hace que un PDF
// parezca improvisado. Solo se incluyen Helvetica y Helvetica-Bold, que son
// las dos que estos documentos usan.
// ---------------------------------------------------------------------------
const HELVETICA_WIDTHS: Record<string, number> = buildWidths(
  "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 " + // 32-47
  "556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 " + // 48-63
  "1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 " + // 64-79
  "667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 " +  // 80-95
  "333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 " +  // 96-111
  "556 556 333 500 278 556 500 722 500 500 500 334 260 334 584"         // 112-126
);

const HELVETICA_BOLD_WIDTHS: Record<string, number> = buildWidths(
  "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 " +
  "556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 " +
  "975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 " +
  "667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 " +
  "333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 " +
  "611 611 389 556 333 611 556 778 556 556 500 389 280 389 584"
);

function buildWidths(spec: string): Record<string, number> {
  const values = spec.trim().split(/\s+/).map(Number);
  const out: Record<string, number> = {};
  values.forEach((w, i) => { out[String.fromCharCode(32 + i)] = w; });
  return out;
}

/**
 * Las letras acentuadas del español tienen, en Helvetica, la anchura de su
 * letra base: la tilde no ensancha el glifo. Mapearlas así es exacto para
 * nuestro propósito y evita arrastrar la tabla AFM completa.
 */
const BASE_LETTER: Record<string, string> = {
  "á":"a","é":"e","í":"i","ó":"o","ú":"u","ü":"u","ñ":"n","ç":"c",
  "Á":"A","É":"E","Í":"I","Ó":"O","Ú":"U","Ü":"U","Ñ":"N","Ç":"C",
  "à":"a","è":"e","ì":"i","ò":"o","ù":"u","â":"a","ê":"e","î":"i","ô":"o","û":"u",
  "¿":"?","¡":"!","º":"o","ª":"a","·":".","–":"-","—":"M","«":"<","»":">",
  "\u2018":"'","\u2019":"'","\u201C":"\"","\u201D":"\"","\u2026":"...","\u2022":".","\u20AC":"E",
};

export type PdfFont = "regular" | "bold";

/** Anchura de un texto en puntos, para el tamaño de fuente dado. */
export function measureText(text: string, font: PdfFont, size: number): number {
  const table = font === "bold" ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  let total = 0;
  for (const ch of text) {
    const key = table[ch] !== undefined ? ch : (BASE_LETTER[ch] ?? "?");
    if (key.length > 1) {
      for (const sub of key) total += table[sub] ?? 500;
    } else {
      total += table[key] ?? 500;
    }
  }
  return (total * size) / 1000;
}

/** Parte un texto en líneas que caben en `maxWidth`. Respeta los saltos ya
 *  escritos por la persona: un párrafo con enters conserva su forma. */
export function wrapText(text: string, font: PdfFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (paragraph.trim().length === 0) { lines.push(""); continue; }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (measureText(candidate, font, size) <= maxWidth || current.length === 0) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
      // Una palabra sola más larga que la línea (un código, una URL) se parte
      // por caracteres en vez de desbordar el margen.
      while (measureText(current, font, size) > maxWidth && current.length > 1) {
        let cut = current.length - 1;
        while (cut > 1 && measureText(current.slice(0, cut), font, size) > maxWidth) cut -= 1;
        lines.push(current.slice(0, cut));
        current = current.slice(cut);
      }
    }
    lines.push(current);
  }
  return lines;
}

/** Recorta a una anchura máxima añadiendo puntos suspensivos. */
export function truncateToWidth(text: string, font: PdfFont, size: number, maxWidth: number): string {
  if (measureText(text, font, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && measureText(`${out}…`, font, size) > maxWidth) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Codificación WinAnsi
//
// El PDF guarda bytes, no cadenas Unicode. WinAnsiEncoding cubre el español
// completo; los pocos signos tipográficos que viven fuera de Latin-1 (comillas
// curvas, rayas, puntos suspensivos) tienen su byte propio entre 0x80 y 0x9F.
// ---------------------------------------------------------------------------
const WINANSI_SPECIALS: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
  "\u2018": 0x91, "\u2019": 0x92, "\u201C": 0x93, "\u201D": 0x94, "\u2022": 0x95, "\u2013": 0x96, "\u2014": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

function encodeWinAnsi(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    let byte: number;
    if (code < 0x80) byte = code;
    else if (WINANSI_SPECIALS[ch] !== undefined) byte = WINANSI_SPECIALS[ch];
    else if (code >= 0xa0 && code <= 0xff) byte = code;
    else byte = 0x3f; // '?'
    out += String.fromCharCode(byte);
  }
  return out;
}

/** Escapa lo que un literal de cadena PDF no admite tal cual. */
function pdfString(text: string): string {
  return `(${encodeWinAnsi(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

import type { PdfImage } from "./image";

// ---------------------------------------------------------------------------
// Construcción del archivo
// ---------------------------------------------------------------------------
export const A4_PORTRAIT = { width: 595.28, height: 841.89 } as const;
export const A4_LANDSCAPE = { width: 841.89, height: 595.28 } as const;

export type PageSize = { width: number; height: number };

type Page = { size: PageSize; ops: string[]; images: Set<string> };

export class PdfWriter {
  private pages: Page[] = [];
  private page: Page | null = null;
  /** Las imágenes se registran UNA vez y se referencian desde cada página que
   *  las usa: el logo aparece en las siete páginas de un documento y no tiene
   *  por qué viajar siete veces dentro del archivo. */
  private images = new Map<string, PdfImage>();
  readonly title: string;

  constructor(title: string) {
    this.title = title;
  }

  addPage(size: PageSize): void {
    this.page = { size, ops: [], images: new Set() };
    this.pages.push(this.page);
  }

  /** Vuelve a una página ya compuesta. Lo necesita el pie de página: «página 3
   *  de 7» no se puede escribir hasta saber cuántas páginas hubo. */
  setActivePage(index: number): void {
    const page = this.pages[index];
    if (!page) throw new Error(`La página ${index} no existe.`);
    this.page = page;
  }

  get currentSize(): PageSize {
    if (!this.page) throw new Error("No hay página abierta.");
    return this.page.size;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  private op(op: string): void {
    if (!this.page) throw new Error("No hay página abierta.");
    this.page.ops.push(op);
  }

  /** `y` se mide desde ARRIBA: la aritmética del PDF (origen abajo) se queda
   *  encapsulada aquí y no contamina el código de composición. */
  text(x: number, yFromTop: number, content: string, font: PdfFont, size: number, gray = 0): void {
    if (content.length === 0) return;
    const y = this.currentSize.height - yFromTop;
    const resource = font === "bold" ? "/F2" : "/F1";
    this.op(`BT ${resource} ${fmt(size)} Tf ${fmt(gray)} g ${fmt(x)} ${fmt(y)} Td ${pdfString(content)} Tj ET`);
  }

  line(x1: number, y1FromTop: number, x2: number, y2FromTop: number, width = 0.5, gray = 0.75): void {
    const h = this.currentSize.height;
    this.op(`${fmt(gray)} G ${fmt(width)} w ${fmt(x1)} ${fmt(h - y1FromTop)} m ${fmt(x2)} ${fmt(h - y2FromTop)} l S`);
  }

  /** Registra una imagen y devuelve el nombre con el que dibujarla. */
  addImage(name: string, image: PdfImage): string {
    this.images.set(name, image);
    return name;
  }

  /** Dibuja una imagen ya registrada. `y` se mide desde ARRIBA, como el texto. */
  image(name: string, x: number, yFromTop: number, w: number, h: number): void {
    if (!this.images.has(name)) throw new Error(`La imagen «${name}» no está registrada.`);
    if (!this.page) throw new Error("No hay página abierta.");
    this.page.images.add(name);
    const bottom = this.currentSize.height - yFromTop - h;
    // cm establece la matriz de transformación: una imagen se dibuja siempre
    // en el cuadrado unidad, así que la escala ES el tamaño final.
    this.op(`q ${fmt(w)} 0 0 ${fmt(h)} ${fmt(x)} ${fmt(bottom)} cm /${name} Do Q`);
  }

  rect(x: number, yFromTop: number, w: number, h: number, gray: number): void {
    const top = this.currentSize.height - yFromTop - h;
    this.op(`${fmt(gray)} g ${fmt(x)} ${fmt(top)} ${fmt(w)} ${fmt(h)} re f`);
  }

  /** Serializa el archivo completo, con su tabla de referencias cruzadas. */
  build(): Buffer {
    if (this.pages.length === 0) throw new Error("Un PDF necesita al menos una página.");

    const objects: string[] = [];
    const add = (body: string): number => { objects.push(body); return objects.length; };

    // 1 catálogo · 2 páginas · 3 fuente regular · 4 fuente negrita
    const catalogId = add("");     // se rellena al final (necesita el id de Pages)
    const pagesId = add("");
    const fontRegularId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const fontBoldId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

    // Las imágenes son flujos BINARIOS. El resto del archivo se compone como
    // texto latin1, así que los bytes se pasan por esa misma codificación
    // —latin1 es la única que mapea 1:1 byte a carácter— y vuelven intactos
    // en el Buffer final.
    const imageIds = new Map<string, number>();
    for (const [name, image] of this.images) {
      let smaskRef = "";
      if (image.alpha) {
        const smaskId = add(
          `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
          `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode ` +
          `/Length ${image.alpha.length} >>\nstream\n${image.alpha.toString("latin1")}\nendstream`
        );
        smaskRef = ` /SMask ${smaskId} 0 R`;
      }
      const id = add(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace /${image.colorSpace} /BitsPerComponent ${image.bitsPerComponent} ` +
        `/Filter /${image.filter}${smaskRef} /Length ${image.data.length} >>\n` +
        `stream\n${image.data.toString("latin1")}\nendstream`
      );
      imageIds.set(name, id);
    }

    const pageIds: number[] = [];
    for (const page of this.pages) {
      const stream = page.ops.join("\n");
      // SIN comprimir a propósito: es lo que permite comprobar el contenido
      // del archivo generado en una prueba.
      const contentId = add(`<< /Length ${byteLength(stream)} >>\nstream\n${stream}\nendstream`);
      const xobjects = [...page.images]
        .map((name) => `/${name} ${imageIds.get(name)} 0 R`)
        .join(" ");
      const pageId = add(
        `<< /Type /Page /Parent ${pagesId} 0 R ` +
        `/MediaBox [0 0 ${fmt(page.size.width)} ${fmt(page.size.height)}] ` +
        `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >>` +
        (xobjects ? ` /XObject << ${xobjects} >>` : "") + ` >> ` +
        `/Contents ${contentId} 0 R >>`
      );
      pageIds.push(pageId);
    }

    const infoId = add(
      `<< /Title ${pdfString(this.title)} /Producer ${pdfString("Trazaloop")} ` +
      `/Creator ${pdfString("Trazaloop Quality")} >>`
    );

    objects[pagesId - 1] =
      `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;

    let file = "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n";
    const offsets: number[] = [];
    objects.forEach((body, index) => {
      offsets.push(byteLength(file));
      file += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefOffset = byteLength(file);
    file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      file += `${offset.toString().padStart(10, "0")} 00000 n \n`;
    }
    file += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`;
    file += `startxref\n${xrefOffset}\n%%EOF\n`;

    return Buffer.from(file, "latin1");
  }
}

function byteLength(s: string): number {
  return Buffer.byteLength(s, "latin1");
}

/** Números cortos y estables: el PDF no gana nada con 15 decimales. */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
