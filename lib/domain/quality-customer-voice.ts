/**
 * Trazaloop Quality · QUALITY-08 · El dominio de la Voz del Cliente.
 *
 * Puro: sin base de datos, sin red, sin React. Aquí viven las distinciones que
 * el módulo existe para sostener, y las frases que las explican donde se
 * producen.
 *
 * LAS SEIS SEPARACIONES
 *
 *   CLIENTE ≠ CONTACTO ≠ QUIEN RESPONDE
 *   ENCUESTA ≠ VERSIÓN ≠ CAMPAÑA ≠ RESPUESTA
 *   RETROALIMENTACIÓN ≠ QUEJA
 *   QUEJA ≠ NO CONFORMIDAD
 *   RESULTADO DE SATISFACCIÓN ≠ DECISIÓN FORMAL
 *   SEÑAL ≠ CASO ≠ NC
 */

// ---------------------------------------------------------------------------
// El cliente, como papel de la empresa externa (VC-03)
// ---------------------------------------------------------------------------

export const CUSTOMER_RELATIONSHIP_STATUSES =
  ["prospect", "active", "inactive", "retired"] as const;
export type CustomerRelationshipStatus = (typeof CUSTOMER_RELATIONSHIP_STATUSES)[number];

export const CUSTOMER_RELATIONSHIP_STATUS_LABEL: Record<CustomerRelationshipStatus, string> = {
  prospect: "Posible cliente",
  active: "Cliente activo",
  inactive: "Sin actividad",
  retired: "Relación terminada",
};

/**
 * VC-03 · El cliente no es una ficha nueva: es un PAPEL de la misma empresa
 * externa que puede ser, a la vez, proveedor. Decirlo en la pantalla evita el
 * duplicado antes de que alguien lo cree.
 */
export const CUSTOMER_IS_A_ROLE =
  "Un cliente es un papel de una empresa externa, no una ficha aparte. La misma "
  + "empresa puede ser cliente y proveedor a la vez, con una sola identidad.";

// ---------------------------------------------------------------------------
// Fuentes de la voz (VC-01, VC-04, §8)
// ---------------------------------------------------------------------------

export const VOICE_SOURCES =
  ["relational", "periodic", "transactional", "spontaneous"] as const;
export type VoiceSource = (typeof VOICE_SOURCES)[number];

export const VOICE_SOURCE_LABEL: Record<VoiceSource, string> = {
  relational: "Relacional",
  periodic: "Periódica",
  transactional: "Transaccional",
  spontaneous: "Espontánea",
};

export const VOICE_SOURCE_HINT: Record<VoiceSource, string> = {
  relational: "Cómo ve el cliente la relación en conjunto, más allá de una entrega concreta.",
  periodic: "La medición del trimestre, del semestre o del año.",
  transactional: "Justo después de una entrega, un servicio o una interacción.",
  spontaneous: "Lo que el cliente dijo sin que nadie le preguntara.",
};

/** VC-01 · La satisfacción NO es solo una encuesta, y forzarlo produce
 *  encuestas de una sola respuesta que nadie diseñó. */
export const SATISFACTION_IS_MULTISOURCE =
  "La voz del cliente llega por muchos caminos: encuestas, llamadas, quejas, "
  + "felicitaciones, devoluciones, renovaciones. Registrar lo que llegó no exige "
  + "montar una encuesta.";

// ---------------------------------------------------------------------------
// Encuestas y versiones (VC-07, §9, §10, §16)
// ---------------------------------------------------------------------------

export const SURVEY_VERSION_STATUSES = ["draft", "published", "superseded"] as const;
export type SurveyVersionStatus = (typeof SURVEY_VERSION_STATUSES)[number];

export const SURVEY_VERSION_STATUS_LABEL: Record<SurveyVersionStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
  superseded: "Sustituida",
};

export const VERSION_IS_FROZEN =
  "Una versión publicada no se reescribe. Cambiar una pregunta que ya tiene "
  + "respuestas cambiaría lo que aquella persona contestó, y eso no lo arregla "
  + "ninguna pantalla: si hace falta otra cosa, se publica una versión nueva.";

export const QUESTION_TYPES = [
  "single_choice", "multiple_choice", "scale", "numeric", "yes_no", "text", "long_text",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single_choice: "Una opción",
  multiple_choice: "Varias opciones",
  scale: "Escala",
  numeric: "Número",
  yes_no: "Sí / No",
  text: "Texto corto",
  long_text: "Texto largo",
};

/** §11 · Siete tipos y ni uno más: Trazaloop no es un constructor de
 *  formularios, es un sistema de gestión que necesita preguntar bien. */
export const QUESTION_TYPES_ARE_ENOUGH =
  "Siete tipos de pregunta cubren lo que un sistema de gestión necesita "
  + "analizar. No hay lógica condicional ni saltos: un formulario que se "
  + "ramifica produce datos que después nadie sabe comparar.";

export function questionNeedsOptions(type: QuestionType): boolean {
  return type === "single_choice" || type === "multiple_choice";
}

export function questionNeedsScale(type: QuestionType): boolean {
  return type === "scale";
}

/** §13 · Ninguna escala está cableada. 1–5, 1–10, 0–10 o lo que la empresa
 *  decida; lo único obligatorio es que el máximo supere al mínimo. */
export function scaleIsValid(min: number | null, max: number | null): boolean {
  return min !== null && max !== null && Number.isInteger(min) && Number.isInteger(max) && max > min;
}

export function scaleValues(min: number, max: number, step = 1): number[] {
  const s = step > 0 ? step : 1;
  const out: number[] = [];
  for (let v = min; v <= max; v += s) out.push(v);
  return out;
}

// ---------------------------------------------------------------------------
// Campañas (VC-26, VC-27, §17, §18)
// ---------------------------------------------------------------------------

export const CAMPAIGN_STATUSES = ["draft", "open", "closed", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Borrador",
  open: "Abierta",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

export const ANONYMITY_MODES = ["identified", "anonymous"] as const;
export type AnonymityMode = (typeof ANONYMITY_MODES)[number];

export const ANONYMITY_MODE_LABEL: Record<AnonymityMode, string> = {
  identified: "Identificada",
  anonymous: "Anónima",
};

/** §24 · Quien responde tiene que saberlo ANTES de enviar, no después. */
export const ANONYMITY_MODE_NOTICE: Record<AnonymityMode, string> = {
  identified:
    "Esta respuesta quedará asociada a tu empresa y a tu contacto. Quien la lea "
    + "sabrá de quién viene.",
  anonymous:
    "Esta respuesta es anónima. El sistema no guarda quién la envió: ni tu "
    + "nombre, ni tu correo, ni el enlace por el que llegaste.",
};

/** §22 · Y la promesa es estructural: no depende de que la pantalla lo oculte. */
export const ANONYMITY_IS_STRUCTURAL =
  "Cuando una campaña es anónima, la base de datos se queda sin ninguna columna "
  + "que permita reconstruir quién respondió qué. No es que se oculte: es que el "
  + "dato no existe.";

export const ANONYMITY_IS_FINAL =
  "El anonimato se decide antes de invitar a nadie y ya no se cambia. Prometer "
  + "anonimato y revelarlo después sería traicionar a quien confió.";

export const RESPONSE_STATUSES = ["draft", "submitted", "void"] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export const RESPONSE_STATUS_LABEL: Record<ResponseStatus, string> = {
  draft: "Sin enviar",
  submitted: "Enviada",
  void: "Anulada",
};

/** VC-11/§20 · Una respuesta enviada es un hecho. */
export const RESPONSE_IS_FINAL =
  "Una respuesta enviada no se edita. Si hiciera falta corregirla, se registra "
  + "una respuesta nueva que sustituye a la anterior, y las dos se conservan.";

export const RESPONDENT_KINDS =
  ["anonymous", "contact", "customer", "named", "user"] as const;
export type RespondentKind = (typeof RESPONDENT_KINDS)[number];

export const RESPONDENT_KIND_LABEL: Record<RespondentKind, string> = {
  anonymous: "Anónima",
  contact: "Contacto registrado",
  customer: "Cliente",
  named: "Persona identificada sin ficha",
  user: "Usuario de Trazaloop",
};

/** §7 · Quien responde NO tiene que ser un contacto registrado, y obligar a
 *  crearlo antes es la forma más segura de no recibir respuestas. */
export const RESPONDENT_IS_NOT_CONTACT =
  "Quien responde puede ser un contacto registrado, alguien identificado sin "
  + "ficha o nadie en absoluto. Responder no crea un contacto.";

// ---------------------------------------------------------------------------
// Respuestas a una pregunta (§40)
// ---------------------------------------------------------------------------

export const ANSWER_OUTCOMES = ["answered", "not_applicable", "skipped"] as const;
export type AnswerOutcome = (typeof ANSWER_OUTCOMES)[number];

export const ANSWER_OUTCOME_LABEL: Record<AnswerOutcome, string> = {
  answered: "Respondida",
  not_applicable: "No aplica",
  skipped: "Sin responder",
};

export const ANSWER_OUTCOME_HINT: Record<AnswerOutcome, string> = {
  answered: "Se contestó y su valor entra en el cálculo.",
  not_applicable: "No se le puede preguntar eso a este cliente. Sale del cálculo; NO es un cero.",
  skipped: "Se dejó en blanco. Tampoco es un cero: es una ausencia.",
};

export function answerCounts(outcome: AnswerOutcome): boolean {
  return outcome === "answered";
}

/** §40 · La frase que impide el error más caro del análisis. */
export const NOT_APPLICABLE_IS_NOT_ZERO =
  "«No aplica» no es un cero. Un cero dice «lo hizo mal»; «no aplica» dice «esto "
  + "no se le puede preguntar». Contar lo segundo como lo primero hunde un "
  + "resultado por algo que nadie contestó.";

// ---------------------------------------------------------------------------
// Métricas (VC-12, VC-13, §14, §15, §36, §37, §38, §39)
// ---------------------------------------------------------------------------

export const METRIC_METHODS =
  ["nps", "csat", "average", "top_box", "response_count", "custom"] as const;
export type MetricMethod = (typeof METRIC_METHODS)[number];

export const METRIC_METHOD_LABEL: Record<MetricMethod, string> = {
  nps: "NPS",
  csat: "CSAT",
  average: "Promedio",
  top_box: "Porcentaje favorable",
  response_count: "Número de respuestas",
  custom: "A medida",
};

export const METRIC_METHOD_HINT: Record<MetricMethod, string> = {
  nps: "Solo con escala 0–10. Promotores 9–10, pasivos 7–8, detractores 0–6; el resultado es %promotores − %detractores.",
  csat: "Promedio de una pregunta de satisfacción, en la escala que la empresa haya definido.",
  average: "Promedio simple de lo respondido.",
  top_box: "Porcentaje de respuestas iguales o superiores a un umbral que define la empresa.",
  response_count: "Cuántas respuestas se recibieron. Es un recuento, no una satisfacción.",
  custom: "Una definición propia de la empresa. Trazaloop no finge conocerla.",
};

/**
 * VC-13 · Trazaloop NO impone ninguna metodología. Pero §14 · si algo se llama
 * NPS tiene que serlo: escala 0–10 y la fórmula correcta. Llamar NPS a un
 * promedio cualquiera es el error que sobrevive años porque nadie vuelve a
 * mirar la fórmula.
 */
export const NO_IMPOSED_METHODOLOGY =
  "Trazaloop no obliga a usar NPS ni CSAT. La empresa define qué mide y cómo. Lo "
  + "único que el sistema no permite es llamar NPS a algo que no lo es.";

export function npsScaleIsValid(min: number | null, max: number | null): boolean {
  return min === 0 && max === 10;
}

export type NpsBand = "promoter" | "passive" | "detractor";

/** §14 · Las tres bandas, tal como las define la metodología. */
export function npsBand(score: number): NpsBand | null {
  if (!Number.isFinite(score) || score < 0 || score > 10) return null;
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export const NPS_BAND_LABEL: Record<NpsBand, string> = {
  promoter: "Promotor",
  passive: "Pasivo",
  detractor: "Detractor",
};

/**
 * §14/§78 · %promotores − %detractores, sobre las respuestas VÁLIDAS.
 *
 * Devuelve `null` sin respuestas: cero promotores y cero detractores dan cero,
 * y un NPS de 0 es un resultado real —tantos promotores como detractores— que
 * no significa lo mismo que «nadie contestó».
 */
export function npsScore(scores: readonly number[]): number | null {
  const valid = scores.filter((s) => npsBand(s) !== null);
  if (valid.length === 0) return null;
  const promoters = valid.filter((s) => npsBand(s) === "promoter").length;
  const detractors = valid.filter((s) => npsBand(s) === "detractor").length;
  return Math.round(((promoters * 100) / valid.length - (detractors * 100) / valid.length) * 100) / 100;
}

export function averageScore(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 100) / 100;
}

export function topBoxPercent(values: readonly number[], threshold: number): number | null {
  if (values.length === 0) return null;
  const favorable = values.filter((v) => v >= threshold).length;
  return Math.round((favorable * 100 / values.length) * 100) / 100;
}

/**
 * §37 · LA CLAVE DE COMPARABILIDAD.
 *
 * Dos mediciones solo son la misma serie si midieron la misma pregunta, en la
 * misma escala, con el mismo método. Cuando la clave cambia, la gráfica tiene
 * que cortarse: unir los puntos afirmaría una tendencia que no existe.
 */
export function comparabilityKey(input: {
  method: MetricMethod;
  questionStableKey: string | null;
  scaleMin: number | null;
  scaleMax: number | null;
}): string {
  if (input.method === "response_count") return "responses";
  return `${input.method}|${input.questionStableKey ?? "-"}|`
    + `${input.scaleMin ?? "-"}-${input.scaleMax ?? "-"}`;
}

export const COMPARABILITY_BROKEN =
  "Esta medición no se puede comparar con la anterior: cambió la pregunta, la "
  + "escala o el método. La serie se corta aquí; unir los puntos afirmaría una "
  + "tendencia que no existe.";

/** §36 · Una serie se parte donde cambia la clave. Devuelve tramos que SÍ son
 *  comparables entre sí. */
export function splitComparableSeries<T extends { comparabilityKey: string }>(
  points: readonly T[]
): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let key: string | null = null;
  for (const p of points) {
    if (key !== null && p.comparabilityKey !== key) {
      out.push(current);
      current = [];
    }
    key = p.comparabilityKey;
    current.push(p);
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * §38 · LA TASA DE RESPUESTA SOLO EXISTE CON DENOMINADOR.
 *
 * En una campaña abierta sin población conocida no hay porcentaje que calcular,
 * y fabricarlo produce un número que nadie puede defender. El recuento de
 * respuestas sigue estando: son dos cosas distintas.
 */
export function responseRate(
  responses: number,
  denominator: number | null
): { rate: number | null; reason: string } {
  if (denominator === null || denominator <= 0) {
    return {
      rate: null,
      reason: "No se conoce a cuántos se preguntó, así que no hay tasa de respuesta. "
        + "Lo que sí se sabe es cuántas respuestas llegaron.",
    };
  }
  return {
    rate: Math.round((responses * 100 / denominator) * 100) / 100,
    reason: `${responses} de ${denominator}.`,
  };
}

/** §39 · Cero respuestas NO es cero satisfacción. */
export const ZERO_RESPONSES_IS_NOT_ZERO =
  "Sin respuestas no hay satisfacción que mostrar. Cero respuestas no es cero "
  + "satisfacción: es que nadie contestó.";

export function describeResult(value: number | null, sampleSize: number): string {
  if (sampleSize === 0) return "Sin respuestas";
  if (value === null) return "Sin datos suficientes";
  return String(value);
}

// ---------------------------------------------------------------------------
// Retroalimentación y quejas (VC-16, VC-22, VC-30, VC-31, §29, §30)
// ---------------------------------------------------------------------------

export const FEEDBACK_KINDS =
  ["complaint", "claim", "suggestion", "compliment", "comment", "other"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_KIND_LABEL: Record<FeedbackKind, string> = {
  complaint: "Queja",
  claim: "Reclamo",
  suggestion: "Sugerencia",
  compliment: "Felicitación",
  comment: "Comentario",
  other: "Otro",
};

/** §29 · No se reduce todo a positivo/negativo: una felicitación es
 *  información gestionable (VC-31) y una sugerencia no es una queja. */
export const FEEDBACK_IS_NOT_BINARY =
  "La voz del cliente no se reparte entre «positiva» y «negativa». Una "
  + "sugerencia no es una queja, y una felicitación es información que puede "
  + "alimentar lo que se hace bien.";

export const COMPLAINT_KINDS: readonly FeedbackKind[] = ["complaint", "claim"];

export function isComplaint(kind: FeedbackKind): boolean {
  return COMPLAINT_KINDS.includes(kind);
}

export const FEEDBACK_STATUSES =
  ["open", "under_review", "answered", "closed", "dismissed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "Sin revisar",
  under_review: "En revisión",
  answered: "Respondida al cliente",
  closed: "Cerrada",
  dismissed: "Descartada",
};

export const FEEDBACK_SEVERITIES = ["low", "normal", "high", "critical"] as const;
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

export const FEEDBACK_SEVERITY_LABEL: Record<FeedbackSeverity, string> = {
  low: "Menor",
  normal: "Normal",
  high: "Alta",
  critical: "Crítica",
};

/**
 * §30 · OBLIGATORIO · LA FRASE QUE SOSTIENE EL DOMINIO.
 *
 * Una queja es un hecho. Una no conformidad es una CLASIFICACIÓN que alguien
 * decide, con las consecuencias que QUALITY-04 definió. Convertir lo primero en
 * lo segundo automáticamente infla el recuento de no conformidades con hechos
 * que no lo eran, y le quita a una persona la decisión que le corresponde.
 */
export const COMPLAINT_IS_NOT_NC =
  "Una queja del cliente NO es una no conformidad. Es un hecho que alguien tiene "
  + "que mirar. Si merece tratamiento se abre un caso, y es allí —y solo allí— "
  + "donde se decide si es una no conformidad.";

/** §31 · Y tampoco abre un caso sola. */
export const COMPLAINT_IS_NOT_AUTOMATIC_CASE =
  "Registrar una queja no abre ningún caso. Abrirlo es una decisión, y a veces "
  + "la decisión correcta es responder al cliente y cerrarla.";

/** §34 · Un resultado bajo tampoco decide nada. */
export const LOW_SATISFACTION_IS_A_SIGNAL =
  "Una satisfacción que baja es una señal, no una no conformidad. No abre "
  + "riesgos, no crea acciones correctivas y no clasifica nada: dice que hay "
  + "algo que mirar.";

// ---------------------------------------------------------------------------
// Señales (VC-17, §35)
// ---------------------------------------------------------------------------

export const CUSTOMER_SIGNAL_KINDS = [
  "satisfaction_drop", "complaints_increase", "high_detractors",
  "low_campaign_result", "campaign_closing_low_responses",
  "complaint_unreviewed", "comparability_break",
] as const;
export type CustomerSignalKind = (typeof CUSTOMER_SIGNAL_KINDS)[number];

export const CUSTOMER_SIGNAL_LABEL: Record<CustomerSignalKind, string> = {
  satisfaction_drop: "La satisfacción bajó",
  complaints_increase: "Las quejas aumentaron",
  high_detractors: "Hay muchos detractores",
  low_campaign_result: "Una campaña dio un resultado bajo",
  campaign_closing_low_responses: "Una campaña cierra con pocas respuestas",
  complaint_unreviewed: "Una queja lleva días sin revisar",
  comparability_break: "La serie dejó de ser comparable",
};

export const SIGNAL_DECIDES_NOTHING =
  "Una señal dice «mira esto». No abre casos, no clasifica no conformidades, no "
  + "crea riesgos y no cambia ninguna decisión: eso lo hace una persona.";

// ---------------------------------------------------------------------------
// Cierre del periodo (VC-05, VC-06)
// ---------------------------------------------------------------------------

export const METHODOLOGY_VERDICTS = ["adequate", "needs_change", "changed"] as const;
export type MethodologyVerdict = (typeof METHODOLOGY_VERDICTS)[number];

export const METHODOLOGY_VERDICT_LABEL: Record<MethodologyVerdict, string> = {
  adequate: "La metodología sigue sirviendo",
  needs_change: "Hay que cambiarla",
  changed: "Ya se cambió durante el periodo",
};

/** VC-06 · Revisar la metodología es parte del cierre, no un extra. */
export const CLOSE_REVIEWS_METHODOLOGY =
  "Cerrar el periodo incluye decir si el instrumento sigue sirviendo. Una "
  + "medición que se repite sin revisarse acaba midiendo lo que ya no importa.";

// ---------------------------------------------------------------------------
// Permisos (§62)
// ---------------------------------------------------------------------------

export function canManageCustomerVoice(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality" || roleCode === "consultant";
}

export function canReadCustomerVoice(roleCode: string): boolean {
  return roleCode.length > 0;
}

/** VC-05 · Cerrar el periodo es una afirmación de la EMPRESA sobre sus
 *  clientes: no la firma un consultor externo. */
export function canCloseCustomerVoice(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality";
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** §45 · El umbral por debajo del cual un agregado puede reidentificar a quien
 *  respondió. No es estadística fina: es no publicar «la única respuesta
 *  anónima del departamento X». */
export const SMALL_GROUP_THRESHOLD = 3;

export function aggregateIsSafeToShow(
  sampleSize: number,
  anonymity: AnonymityMode,
  threshold = SMALL_GROUP_THRESHOLD
): boolean {
  if (anonymity === "identified") return true;
  return sampleSize >= threshold;
}

export const SMALL_GROUP_NOTICE =
  "Hay muy pocas respuestas para mostrarlas desglosadas sin arriesgar el "
  + "anonimato que se prometió. El resultado se enseña cuando haya suficientes.";
