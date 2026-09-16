import type { XlsxSheet } from "@/lib/xlsx";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01H · Los datos de una campaña, para llevar.
 *
 *
 * QUÉ SALE DE AQUÍ Y DE DÓNDE VIENE
 *
 * Todo lo que se exporta está CONGELADO: el resultado sale de la instantánea
 * que se escribió al cerrar, y el texto de las preguntas sale de la versión
 * del instrumento, que 0195 hizo inmutable. No se lee «el catálogo de hoy»
 * en ningún sitio. Un fichero entregado a una cámara en marzo tiene que poder
 * regenerarse igual en noviembre.
 *
 *
 * EL NÚMERO DE PREGUNTAS NO ESTÁ ESCRITO EN NINGUNA PARTE
 *
 * Las columnas de respuestas se derivan de las preguntas de la versión, por su
 * CLAVE ESTABLE (`S1Q01`…). Hoy PCR v1 tiene 52; una v2 con otro número
 * exporta con otro número y nadie toca esto.
 *
 *
 * INYECCIÓN DE FÓRMULAS: EN CSV SÍ, EN XLSX NO
 *
 * Excel interpreta como fórmula cualquier celda de un CSV que empiece por
 * `=`, `+`, `-` o `@`. Una empresa que se llame «=SUMA(...)» —o un atacante
 * que la registre así— acabaría ejecutando algo en el equipo de quien abre el
 * fichero. En CSV se antepone un apóstrofo, que Excel muestra y no ejecuta.
 *
 * En `.xlsx` NO se hace, y no es un olvido: allí el tipo de la celda es
 * explícito (`inlineStr`), y una fórmula necesita un elemento `<f>` que este
 * proyecto no escribe nunca. Neutralizar ahí añadiría un apóstrofo visible a
 * un dato que nadie iba a ejecutar — corromper el dato para prevenir algo que
 * no puede pasar.
 *
 * Lógica PURA: sin base de datos, para poder comprobar cada columna.
 */

export type ExportQuestion = {
  code: string;
  text: string;
  sectionCode: string;
  sectionTitle: string;
};

export type ExportDimension = { code: string; title: string; percent: number };

export type ExportRecommendation = {
  dimension: string | null;
  dimensionTitle: string | null;
  order: number;
  text: string;
};

export type ExportSubmission = {
  submissionId: string;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  participantName: string;
  participantEmail: string;
  participantPhone: string | null;
  companyName: string;
  /** El consentimiento OBLIGATORIO del diagnóstico. */
  requiredConsentVersion: string | null;
  requiredConsentAt: string | null;
  /** El COMERCIAL, que es otra cosa y va aparte. */
  marketingConsent: boolean;
  marketingConsentAt: string | null;
  maturityPercent: number | null;
  readinessLevel: string | null;
  snapshotSchema: string | null;
  supersedesId: string | null;
  supersededById: string | null;
  dimensions: ExportDimension[];
  /**
   * PUBLIC-DIAGNOSTICS-01J · Las recomendaciones CONGELADAS, en el orden en
   * que quedaron escritas. No se derivan del catálogo de hoy: si mañana se
   * publica una PCR v2 con otras acciones, este archivo sigue diciendo lo que
   * se le entregó a esa empresa aquel día.
   */
  recommendations: ExportRecommendation[];
  /** Por clave estable de pregunta. Lo que nadie respondió no está. */
  answers: Record<string, boolean>;
};

export type ExportDataset = {
  campaign: {
    name: string; slug: string; diagnosticType: string;
    versionNumber: number | null; status: string;
    opensAt: string | null; closesAt: string | null;
  };
  questions: ExportQuestion[];
  sections: { code: string; title: string }[];
  submissions: ExportSubmission[];
};

/** Cómo se dice una respuesta. Sin responder es vacío, no «No». */
export function answerLabel(v: boolean | undefined): string {
  if (v === true) return "Sí";
  if (v === false) return "No";
  return "";
}

/**
 * Una celda que Excel no va a ejecutar.
 *
 * Se cubren los cuatro arranques clásicos y además el tabulador y el retorno
 * de carro, que algunas versiones usan para separar y permiten colar una
 * segunda celda dentro de la primera.
 */
export function neutralizeFormula(valor: string): string {
  if (valor === "") return valor;
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

const SI_NO = (b: boolean) => (b ? "Sí" : "No");
const texto = (v: string | null | undefined) => (v ?? "").toString();
const numero = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

/** La cabecera del CSV, derivada de la versión. */
export function csvHeaders(dataset: ExportDataset): string[] {
  return [
    "campaign_name", "campaign_slug", "diagnostic_type", "diagnostic_version",
    "submission_id", "started_at", "completed_at",
    "participant_name", "participant_email", "participant_phone", "company_name",
    "required_consent", "required_consent_at",
    "marketing_consent", "marketing_consent_at",
    "global_score", "readiness_level",
    "result_snapshot_version", "supersedes_submission_id", "superseded_by_submission_id",
    ...dataset.sections.map((s) => `dimension_${s.code}`),
    ...dataset.questions.map((q) => q.code),
  ];
}

/**
 * Una fila por participación COMPLETADA.
 *
 * Las que siguen a medias no entran: no tienen resultado, y mezclarlas daría
 * un fichero donde la mitad de las filas tiene el porcentaje vacío y alguien
 * acabaría promediando sobre el total equivocado. Su recuento sí aparece en el
 * resumen del libro.
 */
export function csvRows(dataset: ExportDataset): string[][] {
  const completadas = dataset.submissions.filter((s) => s.status === "completed");
  return completadas.map((s) => {
    const porDimension = new Map(s.dimensions.map((d) => [d.code, d.percent]));
    const fila = [
      dataset.campaign.name, dataset.campaign.slug, dataset.campaign.diagnosticType,
      numero(dataset.campaign.versionNumber),
      s.submissionId, texto(s.startedAt), texto(s.completedAt),
      s.participantName, s.participantEmail, texto(s.participantPhone), s.companyName,
      texto(s.requiredConsentVersion), texto(s.requiredConsentAt),
      SI_NO(s.marketingConsent), texto(s.marketingConsentAt),
      numero(s.maturityPercent), texto(s.readinessLevel),
      texto(s.snapshotSchema), texto(s.supersedesId), texto(s.supersededById),
      ...dataset.sections.map((sec) => {
        const p = porDimension.get(sec.code);
        return p === undefined ? "" : String(p);
      }),
      ...dataset.questions.map((q) => answerLabel(s.answers[q.code])),
    ];
    return fila.map(neutralizeFormula);
  });
}

export function csvTable(dataset: ExportDataset): string[][] {
  return [csvHeaders(dataset), ...csvRows(dataset)];
}

// ---------------------------------------------------------------------------
// El libro de Excel
// ---------------------------------------------------------------------------

/**
 * Cuatro hojas, y ninguna comparativa.
 *
 * El resumen dice cuántos empezaron, cuántos terminaron y en qué proporción.
 * NO dice quién va mejor, ni sitúa a nadie frente al promedio: para eso hace
 * falta un referente gobernado que todavía no existe, y una cifra así se cita
 * en una junta como si fuera un hecho.
 */
export function workbookSheets(dataset: ExportDataset): XlsxSheet[] {
  const iniciadas = dataset.submissions.length;
  const completadas = dataset.submissions.filter((s) => s.status === "completed").length;
  const incompletas = iniciadas - completadas;
  const tasa = iniciadas > 0 ? Math.round((completadas / iniciadas) * 1000) / 10 : 0;

  const resumen: XlsxSheet = {
    name: "Resumen",
    rows: [
      ["Campo", "Valor"],
      ["Campaña", dataset.campaign.name],
      ["Enlace público", dataset.campaign.slug],
      ["Diagnóstico", dataset.campaign.diagnosticType],
      ["Versión del instrumento", dataset.campaign.versionNumber],
      ["Estado", dataset.campaign.status],
      ["Abre", dataset.campaign.opensAt],
      ["Cierra", dataset.campaign.closesAt],
      ["Participaciones iniciadas", iniciadas],
      ["Participaciones completadas", completadas],
      ["Participaciones incompletas", incompletas],
      ["Tasa de finalización (%)", tasa],
      ["Preguntas del instrumento", dataset.questions.length],
    ],
  };

  const participantes: XlsxSheet = {
    name: "Participantes",
    rows: [
      ["submission_id", "started_at", "completed_at", "estado",
       "participante", "correo", "teléfono", "empresa",
       "consentimiento_requerido", "consentimiento_requerido_en",
       "consentimiento_comercial", "consentimiento_comercial_en",
       "puntaje_global", "nivel", "formato_resultado",
       "repite_a", "superada_por"],
      ...dataset.submissions.map((s) => [
        s.submissionId, s.startedAt, s.completedAt, s.status,
        s.participantName, s.participantEmail, s.participantPhone, s.companyName,
        s.requiredConsentVersion, s.requiredConsentAt,
        SI_NO(s.marketingConsent), s.marketingConsentAt,
        s.maturityPercent, s.readinessLevel, s.snapshotSchema,
        s.supersedesId, s.supersededById,
      ]),
    ],
  };

  // Formato largo: una fila por respuesta. Es lo que se puede pivotar sin
  // pelearse con 52 columnas, y lo que aguanta que una versión futura tenga
  // otro número de preguntas.
  const respuestas: XlsxSheet = {
    name: "Respuestas",
    rows: [
      ["submission_id", "empresa", "seccion", "seccion_nombre",
       "pregunta", "pregunta_texto", "respuesta"],
      ...dataset.submissions
        .filter((s) => s.status === "completed")
        .flatMap((s) => dataset.questions.map((q) => [
          s.submissionId, s.companyName, q.sectionCode, q.sectionTitle,
          q.code, q.text, answerLabel(s.answers[q.code]),
        ])),
    ],
  };

  const dimensiones: XlsxSheet = {
    name: "Dimensiones",
    rows: [
      ["submission_id", "empresa", "dimension", "dimension_nombre", "puntaje"],
      ...dataset.submissions
        .filter((s) => s.status === "completed")
        .flatMap((s) => s.dimensions.map((d) => [
          s.submissionId, s.companyName, d.code, d.title, d.percent,
        ])),
    ],
  };

  /*
    PUBLIC-DIAGNOSTICS-01J · La quinta hoja, que es la que se usa.

    El resto del libro describe lo que pasó; esta dice qué hacer. Va en formato
    largo —una fila por acción— porque así se filtra por dimensión, se reparte
    entre responsables y se convierte en un plan sin pelearse con celdas que
    contienen párrafos.

    La alternativa era meter todas las recomendaciones de una empresa en una
    sola celda gigante. Cabría, y sería inservible: nadie ordena ni cuenta por
    una celda con quince frases dentro.
  */
  const recomendaciones: XlsxSheet = {
    name: "Recomendaciones",
    rows: [
      ["campaign_name", "submission_id", "company_name", "participant_name",
       "completed_at", "global_score", "readiness_level",
       "dimension", "dimension_nombre", "recommendation_order", "recommendation_text"],
      ...dataset.submissions
        .filter((s) => s.status === "completed")
        .flatMap((s) => s.recommendations.map((r) => [
          dataset.campaign.name, s.submissionId, s.companyName, s.participantName,
          s.completedAt, s.maturityPercent, s.readinessLevel,
          // Sin dimensión se deja vacío. No se inventa.
          r.dimension, r.dimensionTitle, r.order, r.text,
        ])),
    ],
  };

  return [resumen, participantes, respuestas, dimensiones, recomendaciones];
}

/** El nombre del fichero, sin nada que sorprenda a un sistema de archivos. */
export function exportFilename(slug: string, ext: "csv" | "xlsx"): string {
  const limpio = slug.replace(/[^a-z0-9-]/gi, "-").slice(0, 60) || "campana";
  return `diagnostico-${limpio}.${ext}`;
}
