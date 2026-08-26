/**
 * Trazaloop Quality · QUALITY-02 · Los dos PDF del control documental.
 *
 * Funciones PURAS: reciben un modelo ya resuelto y devuelven bytes. No leen la
 * base, no leen la sesión y no consultan el reloj —la fecha de generación
 * llega como dato— para que una prueba pueda comprobar el archivo exacto.
 *
 * D-26 · El PDF es una REPRESENTACIÓN, no la fuente de verdad. Cada archivo lo
 * dice en su pie, y un documento que no está vigente lo lleva escrito en la
 * primera página: entregar un borrador que parezca vigente es el error clásico
 * del control documental en papel, y no se va a repetir en pantalla.
 *
 * No se imprime NINGÚN identificador técnico: ni UUID, ni nombre de tabla, ni
 * ruta interna. Un documento controlado que sale de la plataforma solo lleva
 * información de negocio.
 */
import { A4_PORTRAIT, A4_LANDSCAPE, measureText } from "./writer";
import { PdfLayout } from "./layout";
import { renderCorporateHeader } from "./corporate-header";
import { type PdfImage } from "./image";
import { LIFECYCLE_LABEL, formatDate, type LifecycleState } from "@/lib/domain/document-control";

const SYSTEM_LINE = "Trazaloop Quality · control documental";

export type DocumentPdfModel = {
  organizationName: string;
  /**
   * EXPORT-01.2 · Nombre documental, del registro de exportaciones. Va en el
   * encabezado de todas las páginas, bajo el nombre de la empresa.
   */
  documentName: string;
  /** Logo ya decodificado por el servidor. Nunca una URL. */
  logo?: PdfImage | null;
  /** §10 · Hay logo configurado y NO se pudo usar. Distinto de no tenerlo. */
  logoUnusable?: boolean;
  companyLegalName: string | null;
  companyTaxId: string | null;
  code: string | null;
  title: string;
  description: string | null;
  categoryLabel: string;
  lifecycle: LifecycleState;
  /** «Revisión 2» o «v3 (histórico)», ya resuelto por el dominio. */
  revisionText: string;
  ownerText: string;
  reviewersText: string;
  approversText: string;
  createdAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  reviewDueAt: string | null;
  retirementReason: string | null;
  processNames: string;
  sections: { title: string; content: string }[];
  revisionHistory: {
    label: string;
    state: string;
    approvedAt: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    changeNote: string | null;
  }[];
  decisions: {
    label: string;
    byName: string | null;
    at: string;
    reason: string | null;
    round: number;
  }[];
  /** ISO. La resuelve quien llama; aquí no se consulta el reloj. */
  generatedAt: string;
};

/** El aviso que evita que un papel diga menos de lo que el sistema sabe. */
function statusBanner(lifecycle: LifecycleState): { text: string; gray: number } | null {
  switch (lifecycle) {
    case "effective":
      return null;
    case "draft":
      return { text: "BORRADOR · NO VIGENTE · no usar como documento del sistema de calidad", gray: 0.9 };
    case "in_review":
      return { text: "EN REVISIÓN · NO VIGENTE", gray: 0.9 };
    case "changes_requested":
      return { text: "DEVUELTO CON OBSERVACIONES · NO VIGENTE", gray: 0.9 };
    case "pending_approval":
      return { text: "PENDIENTE DE APROBACIÓN · NO VIGENTE", gray: 0.9 };
    case "approved_pending_effective":
      return { text: "APROBADO · TODAVÍA NO VIGENTE", gray: 0.93 };
    case "superseded":
      return { text: "SUSTITUIDO POR UNA REVISIÓN POSTERIOR · copia histórica", gray: 0.88 };
    case "retired":
      return { text: "RETIRADO · copia histórica, no usar", gray: 0.88 };
    default:
      return null;
  }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
  }).format(d).replace(",", " ·") + " UTC";
}


/**
 * EXPORT-01.2 · La identidad ya NO se dibuja en el cuerpo de la primera página.
 *
 * Antes el logo y el nombre iban dentro del contenido: la página 1 tenía
 * membrete y las siguientes una línea fina con el código. Una hoja suelta de la
 * página cuatro de un procedimiento no decía de qué empresa era.
 *
 * Ahora los dos motores —este y el del Print Model— llaman a la MISMA
 * primitiva desde el `header` de cada página. El cuerpo empieza debajo.
 */
function chromeHeader(model: {
  organizationName: string;
  companyLegalName?: string | null;
  companyTaxId?: string | null;
  logo?: PdfImage | null;
  logoUnusable?: boolean;
  documentName: string;
  code?: string | null;
}) {
  return (d: PdfLayout): number =>
    renderCorporateHeader(d, {
      identity: {
        organizationName: model.organizationName,
        legalName: model.companyLegalName ?? null,
        taxId: model.companyTaxId ?? null,
        logo: model.logo ?? null,
        logoUnusable: model.logoUnusable === true,
      },
      documentName: model.documentName,
      code: model.code ?? null,
      systemLine: SYSTEM_LINE,
      top: d.margin,
    });
}

export function renderDocumentPdf(model: DocumentPdfModel): Buffer {
  const doc = new PdfLayout(`${model.code ? `${model.code} · ` : ""}${model.title}`, A4_PORTRAIT, 48, {
    header: chromeHeader({ ...model, code: model.code }),
    footer: (d, pageIndex, pageCount) => {
      const y = d.size.height - d.margin + 12;
      d.writer.line(d.left, y - 8, d.right, y - 8, 0.5, 0.85);
      d.writer.text(d.left, y + 6, SYSTEM_LINE, "regular", 6.5, 0.5);
      d.writer.text(
        d.left, y + 15,
        `Representación impresa. El documento controlado vive en la plataforma; este archivo no es la fuente de verdad.`,
        "regular", 6.5, 0.55
      );
      const label = `Página ${pageIndex + 1} de ${pageCount}`;
      d.writer.text(d.right - measureText(label, "regular", 6.5), y + 6, label, "regular", 6.5, 0.5);
      const stamp = `Generado el ${formatDateTime(model.generatedAt)}`;
      d.writer.text(d.right - measureText(stamp, "regular", 6.5), y + 15, stamp, "regular", 6.5, 0.55);
    },
  });

  // --- Título real del documento. La identidad de empresa y el nombre
  // documental («Documento controlado») ya van en el encabezado de cada
  // página; aquí empieza el documento concreto (§15).
  doc.paragraph(model.title, { font: "bold", size: 16, leading: 20 });
  doc.gap(4);
  if (model.description) {
    doc.paragraph(model.description, { size: 9, gray: 0.35 });
  }
  doc.gap(6);

  const banner = statusBanner(model.lifecycle);
  if (banner) {
    doc.ensure(22);
    doc.writer.rect(doc.left, doc.y, doc.contentWidth, 18, banner.gray);
    doc.writer.text(doc.left + 8, doc.y + 12.5, banner.text, "bold", 8, 0.2);
    doc.gap(24);
  }

  // --- Ficha de control
  doc.fieldGrid([
    { label: "Estado", value: LIFECYCLE_LABEL[model.lifecycle] },
    { label: "Revisión", value: model.revisionText },
    { label: "Tipo", value: model.categoryLabel },
    { label: "Propietario", value: model.ownerText },
    { label: "Revisor(es)", value: model.reviewersText },
    { label: "Aprobador(es)", value: model.approversText },
    { label: "Aprobado el", value: model.approvedAt ? formatDate(model.approvedAt) : "Pendiente" },
    { label: "Aprobado por", value: model.approvedByName ?? "Pendiente" },
    { label: "Creado el", value: formatDate(model.createdAt) },
    { label: "Enviado el", value: model.submittedAt ? formatDate(model.submittedAt) : "Pendiente" },
    { label: "Vigente desde", value: model.effectiveFrom ? formatDate(model.effectiveFrom) : "No aplica" },
    { label: "Vigente hasta", value: model.effectiveTo ? formatDate(model.effectiveTo) : "Sin fecha de cierre" },
    { label: "Próxima revisión", value: model.reviewDueAt ? formatDate(model.reviewDueAt) : "No programada" },
    { label: "Procesos asociados", value: model.processNames.length > 0 ? model.processNames : "Ninguno" },
  ], 4);

  if (model.retirementReason) {
    doc.gap(4);
    doc.paragraph(`Motivo del retiro: ${model.retirementReason}`, { size: 8, gray: 0.3, font: "bold" });
  }

  doc.gap(4);
  doc.rule();

  // --- Contenido
  for (const section of model.sections) {
    doc.heading(section.title, { size: 10.5 });
    const content = section.content.trim();
    doc.paragraph(content.length > 0 ? content : "Sin diligenciar.", {
      size: 9, gray: content.length > 0 ? 0.05 : 0.55,
    });
  }

  // --- Control de revisión
  doc.gap(8);
  doc.heading("Control de revisión", { size: 10.5 });
  doc.table(
    ["Revisión", "Estado", "Aprobada", "Vigente desde", "Vigente hasta", "Nota de cambio"],
    model.revisionHistory.map((r) => [
      r.label, r.state,
      r.approvedAt ? formatDate(r.approvedAt) : "—",
      r.effectiveFrom ? formatDate(r.effectiveFrom) : "—",
      r.effectiveTo ? formatDate(r.effectiveTo) : "—",
      r.changeNote ?? "—",
    ]),
    [8, 10, 8, 9, 9, 20],
    { size: 7 }
  );

  doc.gap(10);
  doc.heading("Decisiones registradas", { size: 10.5 });
  if (model.decisions.length === 0) {
    doc.paragraph("Todavía no hay decisiones registradas sobre este documento.", { size: 8, gray: 0.5 });
  } else {
    doc.table(
      ["Fecha", "Decisión", "Ronda", "Quién", "Motivo / nota"],
      model.decisions.map((d) => [
        formatDate(d.at), d.label, String(d.round), d.byName ?? "—", d.reason ?? "—",
      ]),
      [9, 13, 5, 13, 24],
      { size: 7 }
    );
  }

  return doc.finish();
}

// ---------------------------------------------------------------------------
// Lista Maestra (Parte 11)
// ---------------------------------------------------------------------------
export type MasterListPdfModel = {
  organizationName: string;
  documentName: string;
  /** Logo ya decodificado por el servidor. Nunca una URL. */
  logo?: PdfImage | null;
  logoUnusable?: boolean;
  companyLegalName: string | null;
  companyTaxId: string | null;
  filtersCaption: string;
  headers: string[];
  weights: number[];
  rows: string[][];
  totalCount: number;
  generatedAt: string;
};

export function renderMasterListPdf(model: MasterListPdfModel): Buffer {
  const doc = new PdfLayout("Lista maestra de documentos", A4_LANDSCAPE, 34, {
    header: chromeHeader(model),
    footer: (d, pageIndex, pageCount) => {
      const y = d.size.height - d.margin + 10;
      d.writer.line(d.left, y - 7, d.right, y - 7, 0.5, 0.85);
      d.writer.text(d.left, y + 5, SYSTEM_LINE, "regular", 6.5, 0.5);
      d.writer.text(
        d.left, y + 14,
        "Representación impresa de una proyección dinámica. La fuente de verdad es la plataforma.",
        "regular", 6.5, 0.55
      );
      const label = `Página ${pageIndex + 1} de ${pageCount}`;
      d.writer.text(d.right - measureText(label, "regular", 6.5), y + 5, label, "regular", 6.5, 0.5);
      const stamp = `Generado el ${formatDateTime(model.generatedAt)}`;
      d.writer.text(d.right - measureText(stamp, "regular", 6.5), y + 14, stamp, "regular", 6.5, 0.55);
    },
  });

  // La identidad y el nombre del reporte ya están en el encabezado (§16); el
  // cuerpo empieza por los filtros que produjeron estas filas.
  doc.paragraph(model.filtersCaption, { size: 8, gray: 0.4 });
  doc.paragraph(
    `${model.totalCount} ${model.totalCount === 1 ? "documento" : "documentos"} · generada el ${formatDateTime(model.generatedAt)}`,
    { size: 8, gray: 0.4 }
  );
  doc.gap(8);

  if (model.rows.length === 0) {
    doc.paragraph("Ningún documento cumple los filtros aplicados.", { size: 9, gray: 0.5 });
  } else {
    doc.table(model.headers, model.rows, model.weights, { size: 6 });
  }

  return doc.finish();
}
