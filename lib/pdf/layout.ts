/**
 * Trazaloop · QUALITY-02 · Composición de página sobre el escritor de PDF.
 *
 * El escritor (writer.ts) sabe poner texto en un punto. Esto sabe hacer un
 * DOCUMENTO: márgenes, salto de página automático, encabezado que se repite,
 * pie con «página N de M», títulos, párrafos, fichas de datos y tablas.
 *
 * Todo se mide desde ARRIBA y en puntos tipográficos. El cursor `y` avanza
 * hacia abajo, como se lee.
 */
import {
  PdfWriter, measureText, wrapText,
  type PageSize, type PdfFont,
} from "./writer";

export type PageChrome = {
  /** Se dibuja en cada página, antes del contenido. Devuelve dónde empieza el
   *  contenido de esa página. */
  header: (doc: PdfLayout, pageIndex: number) => number;
  /** Se dibuja al final, cuando ya se conoce el total de páginas. */
  footer: (doc: PdfLayout, pageIndex: number, pageCount: number) => void;
};

export class PdfLayout {
  readonly writer: PdfWriter;
  readonly size: PageSize;
  readonly margin: number;
  private chrome: PageChrome;
  private cursor = 0;

  constructor(title: string, size: PageSize, margin: number, chrome: PageChrome) {
    this.writer = new PdfWriter(title);
    this.size = size;
    this.margin = margin;
    this.chrome = chrome;
    this.newPage();
  }

  get left(): number { return this.margin; }
  get right(): number { return this.size.width - this.margin; }
  get contentWidth(): number { return this.size.width - this.margin * 2; }
  get bottom(): number { return this.size.height - this.margin; }
  get y(): number { return this.cursor; }

  set y(value: number) { this.cursor = value; }

  newPage(): void {
    this.writer.addPage(this.size);
    this.cursor = this.chrome.header(this, this.writer.pageCount - 1);
  }

  /** Reserva vertical: si lo que viene no cabe, empieza página. */
  ensure(height: number): void {
    if (this.cursor + height > this.bottom) this.newPage();
  }

  gap(height: number): void {
    this.cursor += height;
  }

  text(content: string, opts: { font?: PdfFont; size?: number; gray?: number; x?: number } = {}): void {
    const font = opts.font ?? "regular";
    const size = opts.size ?? 9;
    this.writer.text(opts.x ?? this.left, this.cursor + size, content, font, size, opts.gray ?? 0);
  }

  /** Un párrafo con salto de línea y de página automáticos. */
  paragraph(
    content: string,
    opts: { font?: PdfFont; size?: number; gray?: number; leading?: number; x?: number; width?: number } = {}
  ): void {
    const font = opts.font ?? "regular";
    const size = opts.size ?? 9;
    const leading = opts.leading ?? size * 1.45;
    const x = opts.x ?? this.left;
    const width = opts.width ?? this.right - x;
    for (const line of wrapText(content, font, size, width)) {
      this.ensure(leading);
      if (line.length > 0) this.writer.text(x, this.cursor + size, line, font, size, opts.gray ?? 0);
      this.cursor += leading;
    }
  }

  heading(content: string, opts: { size?: number; gray?: number; spaceBefore?: number } = {}): void {
    const size = opts.size ?? 11;
    this.gap(opts.spaceBefore ?? 10);
    this.ensure(size * 1.6);
    this.paragraph(content, { font: "bold", size, gray: opts.gray ?? 0, leading: size * 1.35 });
  }

  rule(gray = 0.8): void {
    this.ensure(6);
    this.writer.line(this.left, this.cursor, this.right, this.cursor, 0.5, gray);
    this.cursor += 6;
  }

  /**
   * Ficha de datos en columnas: etiqueta arriba, valor debajo. Es la forma
   * habitual de la cabecera de un documento controlado.
   */
  fieldGrid(fields: { label: string; value: string }[], columns = 4, opts: { size?: number } = {}): void {
    const size = opts.size ?? 8;
    const colWidth = this.contentWidth / columns;
    const rowHeight = size * 2.7;
    for (let i = 0; i < fields.length; i += columns) {
      const row = fields.slice(i, i + columns);
      const maxLines = Math.max(
        ...row.map((f) => wrapText(f.value, "regular", size, colWidth - 6).length)
      );
      const height = size * 1.4 + maxLines * size * 1.3 + 6;
      this.ensure(Math.max(rowHeight, height));
      const top = this.cursor;
      row.forEach((field, col) => {
        const x = this.left + col * colWidth;
        this.writer.text(x, top + size, field.label.toUpperCase(), "bold", size - 1.5, 0.45);
        let ly = top + size * 2.1;
        for (const line of wrapText(field.value, "regular", size, colWidth - 6)) {
          this.writer.text(x, ly, line, "regular", size, 0.1);
          ly += size * 1.3;
        }
      });
      this.cursor += Math.max(rowHeight, height);
    }
  }

  /**
   * Tabla con encabezado repetido en cada página. Los anchos llegan en
   * proporciones; aquí se reparten sobre el ancho útil real.
   */
  table(
    headers: string[],
    rows: string[][],
    weights: number[],
    opts: { size?: number; headerSize?: number; zebra?: boolean } = {}
  ): void {
    const size = opts.size ?? 6.5;
    const headerSize = opts.headerSize ?? 6.5;
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * this.contentWidth);
    const padding = 3;

    // Los encabezados se ENVUELVEN, no se recortan. Un «Revisión vi…» en la
    // cabecera de una lista maestra impresa obliga a adivinar qué columna se
    // está leyendo, que es justo lo contrario de lo que una lista maestra hace.
    const headerLines = headers.map((header, i) =>
      wrapText(header, "bold", headerSize, widths[i] - padding * 2)
    );
    const headerRows = Math.max(1, ...headerLines.map((l) => l.length));

    const drawHeader = () => {
      const height = headerRows * headerSize * 1.35 + padding * 2;
      this.ensure(height + 4);
      this.writer.rect(this.left, this.cursor, this.contentWidth, height, 0.92);
      let x = this.left;
      headerLines.forEach((lines, i) => {
        let ly = this.cursor + padding + headerSize;
        for (const line of lines) {
          this.writer.text(x + padding, ly, line, "bold", headerSize, 0.15);
          ly += headerSize * 1.35;
        }
        x += widths[i];
      });
      this.cursor += height;
    };

    drawHeader();

    rows.forEach((row, rowIndex) => {
      const cellLines = row.map((cell, i) =>
        wrapText(cell, "regular", size, widths[i] - padding * 2)
      );
      const lineCount = Math.max(1, ...cellLines.map((l) => l.length));
      const height = lineCount * size * 1.35 + padding * 2;

      if (this.cursor + height > this.bottom) {
        this.newPage();
        drawHeader();
      }
      if (opts.zebra !== false && rowIndex % 2 === 1) {
        this.writer.rect(this.left, this.cursor, this.contentWidth, height, 0.975);
      }
      let x = this.left;
      cellLines.forEach((lines, i) => {
        let ly = this.cursor + padding + size;
        for (const line of lines) {
          this.writer.text(x + padding, ly, line, "regular", size, 0.1);
          ly += size * 1.35;
        }
        x += widths[i];
      });
      this.cursor += height;
      this.writer.line(this.left, this.cursor, this.right, this.cursor, 0.3, 0.88);
    });
  }

  /** Texto alineado a la derecha del área útil. */
  textRight(content: string, yFromTop: number, font: PdfFont, size: number, gray = 0): void {
    const x = this.right - measureText(content, font, size);
    this.writer.text(x, yFromTop + size, content, font, size, gray);
  }

  /** Cierra el documento: escribe los pies y serializa. */
  finish(): Buffer {
    const count = this.writer.pageCount;
    for (let i = 0; i < count; i += 1) {
      this.writer.setActivePage(i);
      this.chrome.footer(this, i, count);
    }
    return this.writer.build();
  }
}
