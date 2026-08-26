/**
 * Trazaloop · EXPORT-01 · Del Print Model a los bytes.
 *
 * Esta es la ÚNICA función que sabe dibujar un PDF de Trazaloop. Todo lo que
 * salga de la plataforma —una ficha de riesgo, un lote textil, una lista
 * maestra— pasa por aquí, y por eso todos los archivos comparten márgenes,
 * encabezado, pie y numeración sin que nadie tenga que acordarse (§21).
 *
 * Es PURA: recibe un modelo ya resuelto y devuelve bytes. No lee la base, no
 * lee la sesión y no consulta el reloj —`generatedAt` llega como dato— para
 * que una prueba pueda comprobar el archivo exacto, byte a byte.
 */
import { A4_LANDSCAPE, A4_PORTRAIT, measureText, wrapText } from "@/lib/pdf/writer";
import { PdfLayout } from "@/lib/pdf/layout";
import { fitWithin, type PdfImage } from "@/lib/pdf/image";
import type {
  PrintBadge, PrintBlock, PrintDocument, PrintGraph, PrintMatrix, PrintNode,
} from "./print-model";

const MARGIN = 40;

/** Los tonos. El color ACOMPAÑA a la palabra; nunca la sustituye (§38). */
const TONE_RGB: Record<NonNullable<PrintBadge["tone"]>, [number, number, number]> = {
  neutral: [0.93, 0.93, 0.92],
  info: [0.87, 0.92, 0.90],
  good: [0.86, 0.94, 0.88],
  warn: [0.99, 0.94, 0.83],
  danger: [0.99, 0.89, 0.88],
};

export function renderPrintDocument(doc: PrintDocument): Buffer {
  const size = doc.orientation === "landscape" ? A4_LANDSCAPE : A4_PORTRAIT;
  const logo = (doc.organization.logo ?? null) as PdfImage | null;

  const layout = new PdfLayout(`${doc.recordType} · ${doc.title}`, size, MARGIN, {
    header: (d, pageIndex) => drawHeader(d, doc, logo, pageIndex),
    footer: (d, pageIndex, pageCount) => drawFooter(d, doc, pageIndex, pageCount),
  });

  for (const s of doc.sections) {
    if (s.blocks.length === 0) continue;
    if (s.title) {
      layout.heading(s.title, { size: 10, spaceBefore: 12 });
    }
    for (const b of s.blocks) drawBlock(layout, b);
  }

  return layout.finish();
}

// ---------------------------------------------------------------------------
// Encabezado y pie · idénticos en TODA la plataforma
// ---------------------------------------------------------------------------

function drawHeader(d: PdfLayout, doc: PrintDocument, logo: PdfImage | null, pageIndex: number): number {
  let y = MARGIN;

  // El logo solo en la primera página: repetirlo en un listado de doce
  // páginas gasta espacio sin añadir nada.
  let textLeft = d.left;
  if (logo && pageIndex === 0) {
    const box = fitWithin(logo, 92, 34);
    const name = d.writer.addImage("LogoOrg", logo);
    d.writer.image(name, d.left, y, box.width, box.height);
    textLeft = d.left + box.width + 14;
  }

  const org = doc.organization;
  d.writer.text(textLeft, y + 9, org.name, "bold", 10, 0);
  d.writer.text(textLeft, y + 21, doc.systemLine, "regular", 7.5, 0.45);
  if (org.legalName || org.taxId) {
    const line = [org.legalName, org.taxId ? `NIT ${org.taxId}` : null].filter(Boolean).join(" · ");
    d.writer.text(textLeft, y + 31, line, "regular", 6.5, 0.55);
  }

  // Tipo de registro, a la derecha. Es lo que permite reconocer un papel
  // suelto encima de una mesa.
  d.textRight(doc.recordType.toUpperCase(), y + 9, "bold", 7.5, 0.45);
  if (doc.code) d.textRight(doc.code, y + 21, "bold", 9, 0.1);

  y += logo && pageIndex === 0 ? 44 : 40;
  d.writer.line(d.left, y, d.right, y, 0.7, 0.82);
  y += 12;

  if (pageIndex === 0) {
    // El título, solo en la primera página.
    for (const line of wrapText(doc.title, "bold", 15, d.contentWidth)) {
      d.writer.text(d.left, y + 15, line, "bold", 15, 0);
      y += 19;
    }
    if (doc.subtitle) {
      for (const line of wrapText(doc.subtitle, "regular", 8.5, d.contentWidth)) {
        d.writer.text(d.left, y + 8.5, line, "regular", 8.5, 0.4);
        y += 12;
      }
    }
    y += 4;
    if (doc.badges && doc.badges.length > 0) {
      y = drawBadgeRow(d, doc.badges, y);
      y += 6;
    }

    // §44 · Un listado tiene que declarar QUÉ filtro produjo estas filas y
    // CUÁNTAS son. Un reporte de «12 riesgos» sin decir de qué conjunto salen
    // parece completo y no lo es: quien lo recibe no puede reproducirlo ni
    // discutirlo.
    const filtros = doc.appliedFilters ?? [];
    if (filtros.length > 0 || doc.recordCount !== null && doc.recordCount !== undefined) {
      const partes: string[] = [];
      if (filtros.length > 0) {
        partes.push(filtros.map((f) => `${f.label}: ${f.value}`).join(" · "));
      } else if (doc.recordCount !== null && doc.recordCount !== undefined) {
        partes.push("Sin filtros aplicados");
      }
      if (doc.recordCount !== null && doc.recordCount !== undefined) {
        partes.push(
          doc.recordCount === 1 ? "1 registro" : `${doc.recordCount} registros`
        );
      }
      const linea = partes.join(" — ");
      for (const l of wrapText(linea, "regular", 7.5, d.contentWidth)) {
        d.writer.text(d.left, y + 7.5, l, "regular", 7.5, 0.35);
        y += 11;
      }
      y += 2;
    }
    y += 4;
  }
  return y;
}

function drawFooter(d: PdfLayout, doc: PrintDocument, pageIndex: number, pageCount: number): void {
  const y = d.size.height - MARGIN + 6;
  d.writer.line(d.left, y - 6, d.right, y - 6, 0.5, 0.85);
  const left = doc.footerNote ?? "Trazaloop · este PDF es una representación; la fuente de verdad es la plataforma.";
  d.writer.text(d.left, y + 6, left, "regular", 6.5, 0.5);
  const right = `Generado el ${doc.generatedAt} · Página ${pageIndex + 1} de ${pageCount}`;
  const w = measureText(right, "regular", 6.5);
  d.writer.text(d.right - w, y + 6, right, "regular", 6.5, 0.5);
}

function drawBadgeRow(d: PdfLayout, badges: PrintBadge[], yStart: number): number {
  let x = d.left;
  const h = 14;
  for (const b of badges) {
    const w = measureText(b.text, "bold", 7.5) + 14;
    if (x + w > d.right) { x = d.left; yStart += h + 4; }
    d.writer.rectRgb(x, yStart, w, h, TONE_RGB[b.tone ?? "neutral"]);
    d.writer.text(x + 7, yStart + 9.8, b.text, "bold", 7.5, 0.12);
    x += w + 5;
  }
  return yStart + h;
}

// ---------------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------------

function drawBlock(d: PdfLayout, b: PrintBlock): void {
  switch (b.type) {
    case "heading":
      d.heading(b.text, { size: b.level === 2 ? 8.5 : 10, spaceBefore: b.level === 2 ? 8 : 12 });
      return;

    case "paragraph":
      d.ensure(12);
      d.paragraph(b.text, { size: 8.5, gray: b.muted ? 0.45 : 0.1 });
      d.gap(4);
      return;

    case "fields":
      if (b.items.length === 0) return;
      // Los campos anchos van aparte: meter una descripción de tres líneas en
      // una columna de rejilla la vuelve ilegible.
      {
        const narrow = b.items.filter((f) => !f.wide);
        const wide = b.items.filter((f) => f.wide);
        if (narrow.length > 0) d.fieldGrid(narrow, b.columns ?? 2, { size: 8 });
        for (const f of wide) {
          d.ensure(20);
          d.text(f.label.toUpperCase(), { font: "bold", size: 6.5, gray: 0.45 });
          d.gap(9);
          d.paragraph(f.value, { size: 8.5, gray: 0.1 });
          d.gap(4);
        }
      }
      d.gap(4);
      return;

    case "table":
      if (b.rows.length === 0) {
        d.ensure(14);
        d.paragraph(b.emptyText ?? "Sin registros.", { size: 8, gray: 0.5 });
        d.gap(4);
        return;
      }
      d.table(
        b.columns.map((c) => c.header),
        b.rows,
        b.columns.map((c) => c.width),
        { size: 7 }
      );
      d.gap(6);
      return;

    case "badges":
      if (b.items.length === 0) return;
      d.ensure(20);
      d.y = drawBadgeRow(d, b.items, d.y);
      d.gap(8);
      return;

    case "timeline":
      drawTimeline(d, b);
      return;

    case "references":
      for (const r of b.items) {
        d.ensure(22);
        // La distinción viva/histórica se ESCRIBE. Un lector no puede
        // adivinar si «Indicador IND-003» era el de entonces o el de hoy.
        const tag = r.kind === "snapshot" ? "COMO ESTABA ENTONCES" : "REFERENCIA VIVA";
        d.text(`${r.label.toUpperCase()} · ${tag}`, { font: "bold", size: 6.5, gray: 0.45 });
        d.gap(9);
        d.paragraph(r.value, { size: 8.5, gray: 0.1 });
        if (r.context) d.paragraph(r.context, { size: 7.5, gray: 0.45 });
        d.gap(5);
      }
      return;

    case "matrix":
      drawMatrix(d, b.matrix);
      return;

    case "hierarchy":
      for (const root of b.roots) drawNode(d, root, 0);
      d.gap(6);
      return;

    case "graph":
      drawGraph(d, b.graph);
      return;

    case "note":
      {
        const lines = wrapText(b.text, "regular", 7.5, d.contentWidth - 16);
        const h = lines.length * 10 + 12;
        d.ensure(h + 4);
        d.writer.rectRgb(d.left, d.y, d.contentWidth, h, [0.96, 0.97, 0.96]);
        let ly = d.y + 6 + 7.5;
        for (const line of lines) {
          d.writer.text(d.left + 8, ly, line, "regular", 7.5, 0.25);
          ly += 10;
        }
        d.gap(h + 6);
      }
      return;

    case "rule":
      d.rule();
      return;

    case "spacer":
      d.gap(b.height ?? 8);
      return;

    case "pageBreak":
      d.newPage();
      return;
  }

  /* Un bloque que no encaje en ningún caso desaparecería del papel SIN decir
     nada, y un documento incompleto que parece completo es peor que un fallo.
     El tipo lo impide en compilación; esto lo impide también en ejecución, y
     el endpoint lo convierte en un 500 en vez de en una descarga engañosa. */
  const desconocido: never = b;
  throw new Error(
    `bloque de impresión desconocido: ${JSON.stringify(desconocido).slice(0, 120)}`
  );
}

function drawTimeline(d: PdfLayout, b: Extract<PrintBlock, { type: "timeline" }>): void {
  if (b.entries.length === 0) {
    d.ensure(14);
    d.paragraph(b.emptyText ?? "Sin historial.", { size: 8, gray: 0.5 });
    d.gap(4);
    return;
  }
  for (const e of b.entries) {
    d.ensure(26);
    const top = d.y;
    d.writer.rect(d.left, top + 2, 2, 11, 0.75);
    d.writer.text(d.left + 9, top + 9, e.title, "bold", 8.5, 0.05);
    const meta = [e.when, e.who].filter(Boolean).join(" · ");
    d.writer.text(d.left + 9, top + 20, meta, "regular", 7, 0.45);
    d.y = top + 24;
    if (e.detail) {
      d.paragraph(e.detail, { size: 7.5, gray: 0.25, x: d.left + 9, width: d.contentWidth - 9 });
    }
    d.gap(5);
  }
  d.gap(2);
}

/**
 * La matriz. Sale de la configuración que le pasen —dimensiones, celdas,
 * bandas—; aquí no hay ninguna 5×5 escrita (§38).
 */
function drawMatrix(d: PdfLayout, m: PrintMatrix): void {
  const rowHeaderW = 74;
  const cols = m.colHeaders.length;
  if (cols === 0 || m.rowHeaders.length === 0) return;
  const cellW = (d.contentWidth - rowHeaderW) / cols;
  const cellH = 30;

  d.ensure(cellH * (m.rowHeaders.length + 1) + 30);

  d.text(`${m.rowsLabel} ↓ / ${m.colsLabel} →`, { font: "bold", size: 6.5, gray: 0.45 });
  d.gap(11);

  // Cabecera de columnas
  let x = d.left + rowHeaderW;
  for (const h of m.colHeaders) {
    const lines = wrapText(h, "bold", 6.5, cellW - 4);
    let ly = d.y + 7;
    for (const line of lines.slice(0, 2)) {
      d.writer.text(x + 2, ly, line, "bold", 6.5, 0.35);
      ly += 8;
    }
    x += cellW;
  }
  d.gap(18);

  m.rowHeaders.forEach((rh, r) => {
    const top = d.y;
    for (const line of wrapText(rh, "bold", 6.5, rowHeaderW - 4).slice(0, 3)) {
      d.writer.text(d.left, top + 10, line, "bold", 6.5, 0.35);
    }
    let cx = d.left + rowHeaderW;
    (m.cells[r] ?? []).forEach((cell) => {
      d.writer.rectRgb(cx + 1, top, cellW - 2, cellH - 2, TONE_RGB[cell.tone ?? "neutral"]);
      if (cell.current) d.writer.strokeRect(cx + 1, top, cellW - 2, cellH - 2, 1.4, 0.1);
      d.writer.text(cx + 4, top + 10, cell.label, "bold", 6.5, 0.12);
      d.writer.text(cx + 4, top + 19, cell.score, "regular", 6, 0.4);
      if (cell.current) d.writer.text(cx + 4, top + 27, "evaluación vigente", "bold", 5, 0.12);
      cx += cellW;
    });
    d.y = top + cellH;
  });

  d.gap(8);
  for (const l of m.legend ?? []) {
    d.ensure(13);
    d.writer.rectRgb(d.left, d.y, 10, 9, TONE_RGB[l.tone ?? "neutral"]);
    d.writer.text(d.left + 15, d.y + 7.5, `${l.label} · ${l.detail}`, "regular", 7, 0.3);
    d.gap(12);
  }
  d.gap(4);
}

function drawNode(d: PdfLayout, n: PrintNode, depth: number): void {
  d.ensure(16);
  const x = d.left + depth * 16;
  d.writer.text(x, d.y + 8, depth === 0 ? n.label : `· ${n.label}`, depth === 0 ? "bold" : "regular", 8.5, 0.08);
  if (n.sublabel) {
    const w = measureText(depth === 0 ? n.label : `· ${n.label}`, depth === 0 ? "bold" : "regular", 8.5);
    d.writer.text(x + w + 8, d.y + 8, n.sublabel, "regular", 7, 0.45);
  }
  d.gap(13);
  for (const c of n.children ?? []) drawNode(d, c, depth + 1);
}

/**
 * El mapa de procesos. No es una captura del navegador (§29): se dibuja como
 * categorías con sus nodos y, debajo, las relaciones en forma legible. Un
 * grafo de cajas y flechas en A4 acaba ilegible en cuanto hay quince procesos;
 * una lista de relaciones con origen y destino se lee y se audita.
 */
function drawGraph(d: PdfLayout, g: PrintGraph): void {
  const labelOf = new Map<string, string>();
  for (const grp of g.groups) for (const n of grp.nodes) labelOf.set(n.id, n.label);

  for (const grp of g.groups) {
    d.ensure(26);
    d.text(grp.title.toUpperCase(), { font: "bold", size: 7, gray: 0.4 });
    d.gap(11);
    // Los nodos como cajas en filas.
    let x = d.left;
    let rowTop = d.y;
    const boxH = 24;
    for (const n of grp.nodes) {
      const w = Math.min(d.contentWidth, measureText(n.label, "bold", 7.5) + 20);
      if (x + w > d.right) { x = d.left; rowTop += boxH + 5; d.ensure(boxH + 5); }
      d.writer.rectRgb(x, rowTop, w, boxH, [0.95, 0.96, 0.95]);
      d.writer.strokeRect(x, rowTop, w, boxH, 0.6, 0.75);
      d.writer.text(x + 8, rowTop + 11, n.label, "bold", 7.5, 0.1);
      if (n.sublabel) d.writer.text(x + 8, rowTop + 20, n.sublabel, "regular", 6, 0.45);
      x += w + 6;
    }
    d.y = rowTop + boxH + 10;
  }

  if (g.edges.length > 0) {
    d.gap(4);
    d.heading("Relaciones entre procesos", { size: 8.5, spaceBefore: 6 });
    d.table(
      ["Desde", "Hacia", "Qué fluye"],
      g.edges.map((e) => [
        labelOf.get(e.from) ?? e.from,
        labelOf.get(e.to) ?? e.to,
        e.label ?? "—",
      ]),
      [3, 3, 4],
      { size: 7 }
    );
    d.gap(6);
  }
}
