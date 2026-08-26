/**
 * Trazaloop · EXPORT-01 · El Print Model.
 *
 * Un PDF de Trazaloop no se escribe: se DESCRIBE. Un adaptador de dominio
 * produce este modelo —datos ya resueltos y autorizados— y el renderizador lo
 * convierte en bytes sin saber nada de riesgos, lotes ni documentos.
 *
 * POR QUÉ ESTA CAPA EXISTE
 *
 * Sin ella, cada pantalla acabaría con su propio PDF artesanal: catorce
 * encabezados distintos, catorce formas de paginar una tabla, y catorce sitios
 * donde arreglar el mismo defecto. Con ella hay UN renderizador y N
 * descripciones.
 *
 * Y hay una segunda razón, menos obvia y más importante: este modelo es
 * SERIALIZABLE y no sabe de React, de la sesión ni de la base. Eso permite que
 * una prueba construya un modelo a mano y compruebe el archivo resultante sin
 * levantar nada, y que el adaptador se pueda probar sin generar un PDF.
 *
 * Es deliberadamente PURO: sin fechas del reloj, sin `process.env`, sin
 * consultas. Lo que no está en el modelo no sale en el papel.
 */

// ---------------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------------

/** Una etiqueta con su valor. La unidad mínima de una ficha. */
export type PrintField = {
  label: string;
  value: string;
  /** Ocupa el ancho completo en vez de una columna de la rejilla. */
  wide?: boolean;
};

export type PrintTableColumn = {
  header: string;
  /** Peso relativo del ancho. La suma se normaliza al ancho disponible. */
  width: number;
  align?: "left" | "right";
};

/** Un estado, una clasificación, un nivel. */
export type PrintBadge = {
  text: string;
  /** El tono ACOMPAÑA; nunca informa por sí solo (§38). El texto siempre
   *  dice lo que hay que saber. */
  tone?: "neutral" | "info" | "good" | "warn" | "danger";
};

/** Un momento del historial: qué pasó, quién y por qué. */
export type PrintTimelineEntry = {
  title: string;
  when: string;
  who?: string | null;
  detail?: string | null;
};

/** Una referencia a otro objeto. La distinción entre VIVA e HISTÓRICA no es
 *  cosmética (§25): decir «Indicador IND-003» cuando lo que se usó fue su
 *  configuración de marzo es afirmar algo falso. */
export type PrintReference = {
  kind: "live" | "snapshot";
  label: string;
  value: string;
  /** Solo para `snapshot`: qué decía en aquel momento. */
  context?: string | null;
};

/** Una matriz de dos ejes derivada de una configuración, no cableada. */
export type PrintMatrix = {
  rowsLabel: string;
  colsLabel: string;
  rowHeaders: string[];
  colHeaders: string[];
  /** `cells[fila][columna]`. */
  cells: {
    label: string;
    score: string;
    tone?: PrintBadge["tone"];
    /** La celda que corresponde al registro que se está imprimiendo. */
    current?: boolean;
  }[][];
  legend?: { label: string; detail: string; tone?: PrintBadge["tone"] }[];
};

/** Un nodo de una jerarquía o de un mapa. */
export type PrintNode = {
  label: string;
  sublabel?: string | null;
  children?: PrintNode[];
};

/** Un grafo dirigido sencillo, para el mapa de procesos. */
export type PrintGraph = {
  groups: { title: string; nodes: { id: string; label: string; sublabel?: string | null }[] }[];
  edges: { from: string; to: string; label?: string | null }[];
};

export type PrintBlock =
  | { type: "heading"; text: string; level?: 1 | 2 }
  | { type: "paragraph"; text: string; muted?: boolean }
  | { type: "fields"; items: PrintField[]; columns?: number }
  | { type: "table"; columns: PrintTableColumn[]; rows: string[][]; emptyText?: string }
  | { type: "badges"; items: PrintBadge[] }
  | { type: "timeline"; entries: PrintTimelineEntry[]; emptyText?: string }
  | { type: "references"; items: PrintReference[] }
  | { type: "matrix"; matrix: PrintMatrix }
  | { type: "hierarchy"; roots: PrintNode[] }
  | { type: "graph"; graph: PrintGraph }
  | { type: "note"; text: string }
  | { type: "rule" }
  | { type: "spacer"; height?: number }
  | { type: "pageBreak" };

/**
 * Lo que un ADAPTADOR construye: el documento entero menos su nombre
 * documental, que pone el registro. Es una garantía de compilación, no una
 * convención: un adaptador no puede inventarse el encabezado ni olvidarlo.
 */
export type PrintDocumentDraft = Omit<PrintDocument, "documentName">;

/** Una sección con título. Agrupar importa: un PDF sin secciones es una pared
 *  de texto que nadie audita. */
export type PrintSection = {
  title?: string | null;
  /** Se mantiene junta si cabe; si no, parte. */
  blocks: PrintBlock[];
};

// ---------------------------------------------------------------------------
// El documento
// ---------------------------------------------------------------------------

/** La identidad de la empresa, resuelta EN SERVIDOR (§18, §52). El logo llega
 *  decodificado; nunca una URL. */
export type PrintOrganization = {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  /** Bytes ya decodificados por el servidor desde el Storage privado de ESA
   *  empresa. Si es null, el nombre hace de identidad (§20). */
  logo?: unknown | null;
  /**
   * EXPORT-01.2 (§10) · `true` cuando la empresa SÍ tiene un logo configurado
   * y ese archivo no se pudo usar. No es lo mismo que no tener logo, y el
   * encabezado lo dice.
   */
  logoUnusable?: boolean;
};

export type PrintDocument = {
  /**
   * EXPORT-01.2 (§5, §6) · El NOMBRE DOCUMENTAL, en lenguaje humano:
   * «Ficha de proceso», «Listado de riesgos», «Lista maestra de documentos».
   *
   * No es el título de la entidad ni el nombre técnico de la exportación. Es lo
   * que va bajo el nombre de la empresa en el encabezado de todas las páginas,
   * y por eso lo declara el REGISTRO, no el adaptador: si cada adaptador
   * escribiera el suyo, dos exportaciones del mismo tipo acabarían llamándose
   * distinto.
   *
   * El adaptador no puede ponerlo —su tipo lo excluye— y el endpoint lo
   * completa desde la definición.
   */
  documentName: string;
  /** Qué clase de registro es: «Riesgo», «Proceso», «Casos abiertos». */
  recordType: string;
  /** El título principal. */
  title: string;
  /** El código legible, si el dominio lo tiene. */
  code?: string | null;
  subtitle?: string | null;
  /** Estados o clasificaciones que deben verse en la primera línea. */
  badges?: PrintBadge[];

  organization: PrintOrganization;
  /** «Trazaloop Quality · gestión de riesgos». */
  systemLine: string;

  orientation: "portrait" | "landscape";
  /** Momento de generación. Llega como DATO para que una prueba pueda
   *  comprobar el archivo exacto. */
  generatedAt: string;
  /** Quién lo descargó, cuando el registro lo justifique. */
  generatedByName?: string | null;

  /** Los filtros que produjeron un listado (§44). Sin esto, un reporte de
   *  «12 riesgos» no se puede volver a obtener ni discutir. */
  appliedFilters?: { label: string; value: string }[];
  /** Cuántos registros contiene un listado. */
  recordCount?: number | null;

  sections: PrintSection[];

  /** El aviso del pie. D-26: el PDF es una representación, no la fuente. */
  footerNote?: string | null;
};

// ---------------------------------------------------------------------------
// Ayudas de construcción
// ---------------------------------------------------------------------------

export function section(title: string | null, ...blocks: (PrintBlock | null | undefined)[]): PrintSection {
  return { title, blocks: blocks.filter(Boolean) as PrintBlock[] };
}

export function fields(items: (PrintField | null | undefined)[], columns = 2): PrintBlock {
  return { type: "fields", items: items.filter(Boolean) as PrintField[], columns };
}

export function field(label: string, value: string | null | undefined, wide = false): PrintField | null {
  const v = (value ?? "").toString().trim();
  return v.length > 0 ? { label, value: v, wide } : null;
}

/** Un campo que se muestra AUNQUE esté vacío, porque su ausencia es
 *  información: «Responsable: sin asignar» dice algo que omitir la línea no
 *  dice. */
export function requiredField(label: string, value: string | null | undefined, empty = "—"): PrintField {
  const v = (value ?? "").toString().trim();
  return { label, value: v.length > 0 ? v : empty };
}

export function paragraph(text: string | null | undefined, muted = false): PrintBlock | null {
  const v = (text ?? "").toString().trim();
  return v.length > 0 ? { type: "paragraph", text: v, muted } : null;
}

export function table(
  columns: PrintTableColumn[],
  rows: string[][],
  emptyText = "Sin registros."
): PrintBlock {
  return { type: "table", columns, rows, emptyText };
}

export function timeline(entries: PrintTimelineEntry[], emptyText = "Sin historial."): PrintBlock {
  return { type: "timeline", entries, emptyText };
}

export function note(text: string): PrintBlock {
  return { type: "note", text };
}

/**
 * EXPORT-01.1 (§41) · El aviso de estado actual.
 *
 * Va en los PDF de entidades cuyo dominio todavía NO conserva una versión
 * temporal suficiente para reconstruir el pasado con verdad. Decirlo no es una
 * disculpa: es la diferencia entre un documento honesto y uno que aparenta ser
 * una prueba de lo que ocurrió.
 *
 * No lleva tono alarmista. Un lector que sabe qué tiene en la mano puede
 * usarlo; uno que cree tener otra cosa, no.
 */
export const CURRENT_STATE_TITLE = "Representación del estado actual";

export function currentStateNote(generatedAt: string): PrintBlock {
  return {
    type: "note",
    text:
      `${CURRENT_STATE_TITLE}. Este PDF refleja la información vigente en ` +
      `Trazaloop al momento de su generación (${formatStamp(generatedAt)}). ` +
      "No es una reconstrucción histórica.",
  };
}

/** Fecha y hora legibles a partir de un ISO. Puro: el instante llega como
 *  dato, nunca del reloj. */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** Cuenta los bloques que de verdad pintan algo. Sirve para decidir si una
 *  sección entera sobra. */
export function isEmptySection(s: PrintSection): boolean {
  return s.blocks.length === 0;
}
