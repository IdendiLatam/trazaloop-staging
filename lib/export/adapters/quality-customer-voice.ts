import "server-only";

import {
  getCampaign, getCampaignDistribution, getResponseDetail, getVersionStructure,
  listCustomerContacts, listCustomerOverview, listCampaigns, listFeedback,
  listMetricDefinitions, listMetricSeries, listResponses, listSurveys, listTopics,
  listVoiceReviews, todayIso,
} from "@/lib/db/quality-customer-voice";
import {
  aggregateIsSafeToShow, ANONYMITY_MODE_LABEL, ANSWER_OUTCOME_LABEL,
  CAMPAIGN_STATUS_LABEL, COMPARABILITY_BROKEN, COMPLAINT_IS_NOT_NC,
  CUSTOMER_RELATIONSHIP_STATUS_LABEL, FEEDBACK_KIND_LABEL, FEEDBACK_SEVERITY_LABEL,
  FEEDBACK_STATUS_LABEL, formatDate, METHODOLOGY_VERDICT_LABEL, METRIC_METHOD_LABEL,
  NOT_APPLICABLE_IS_NOT_ZERO, QUESTION_TYPE_LABEL, RESPONDENT_KIND_LABEL,
  SMALL_GROUP_NOTICE, SURVEY_VERSION_STATUS_LABEL, VOICE_SOURCE_LABEL,
  ZERO_RESPONSES_IS_NOT_ZERO,
} from "@/lib/domain/quality-customer-voice";
import type { ExportDefinition, ExportResult } from "../registry-types";
import { currentStateNote, field, fields, note, paragraph, requiredField, section, table } from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * Trazaloop · QUALITY-08 · Los papeles de la Voz del Cliente.
 *
 * LA REGLA QUE ATRAVIESA LOS CATORCE
 *
 * §71 · UN PDF NO CONCEDE PRIVILEGIOS, Y NO ROMPE UNA PROMESA.
 *
 * El informe de una campaña anónima no lleva ninguna identidad: ni cliente, ni
 * contacto, ni correo, ni de qué invitación vino cada respuesta. No es que el
 * generador lo omita por prudencia — es que esos datos no existen en la fila.
 * Y los comentarios libres se imprimen sin atribución y solo cuando hay
 * respuestas suficientes para que agregarlos no reidentifique a nadie.
 *
 * Y la segunda, que se repite en todos los que tocan una queja: un papel que
 * dijera «no conformidad» donde el sistema dice «queja» convertiría un hecho en
 * una clasificación que nadie decidió.
 */

const SYSTEM = "Trazaloop Quality · voz del cliente";
const NOT_NC_NOTE = COMPLAINT_IS_NOT_NC;
const RESULT_NOTE =
  "Un resultado de satisfacción NO es una decisión formal. No abre casos, no "
  + "clasifica no conformidades y no crea riesgos: informa a quien decide.";

function stamp(iso: string): string {
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// 1 · Cliente
// ---------------------------------------------------------------------------

export const qualityCustomerDetail: ExportDefinition = {
  key: "quality.customer.detail",
  module: "quality",
  entity: "Cliente del sistema de gestión",
  recordType: "Cliente",
  documentName: "Ficha de cliente",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La ficha reúne lo que el cliente ha dicho hasta hoy. Cada manifestación y cada "
    + "respuesta, por separado, sí llevan su fecha y su versión.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const all = await listCustomerOverview(req.organizationId, {});
    const customer = all.find((c) => c.profileId === req.id);
    if (!customer) return null;

    const [contacts, feedback, org] = await Promise.all([
      listCustomerContacts(req.organizationId, customer.partyId),
      listFeedback(req.organizationId, { customerId: req.id }),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Cliente", title: customer.legalName,
        code: customer.taxId, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Cliente",
        title: customer.legalName,
        code: customer.taxId,
        subtitle: CUSTOMER_RELATIONSHIP_STATUS_LABEL[customer.relationshipStatus],
        badges: [
          ...(customer.openComplaintCount > 0
            ? [{ text: `${customer.openComplaintCount} queja(s) abierta(s)`, tone: "warn" as const }]
            : []),
          ...(customer.isAlsoSupplier
            ? [{ text: "También es proveedor", tone: "info" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Este documento recoge SOLO lo que este cliente dijo con identidad. Las "
            + "respuestas de campañas anónimas no aparecen aquí aunque se le hubiera "
            + "invitado: atribuirlas rompería la promesa que se le hizo a quien respondió."
          ), currentStateNote(req.generatedAt)),
          section("Quién es", fields([
            requiredField("Razón social", customer.legalName),
            field("Nombre comercial", customer.tradeName),
            field("Identificación fiscal", customer.taxId),
            field("Ubicación", [customer.city, customer.country].filter(Boolean).join(", ")),
            requiredField("Relación", CUSTOMER_RELATIONSHIP_STATUS_LABEL[customer.relationshipStatus]),
            field("Segmento", customer.segment),
            requiredField("Responsable interno", customer.ownerPositionName ?? "Sin asignar"),
            requiredField("También proveedor", customer.isAlsoSupplier ? "Sí" : "No"),
          ])),
          section("Qué ha dicho", table(
            [
              { header: "Fecha", width: 2 },
              { header: "Tipo", width: 2 },
              { header: "Qué dijo", width: 4 },
              { header: "Tema", width: 2 },
              { header: "Estado", width: 2 },
            ],
            feedback.map((f) => [
              formatDate(f.receivedOn),
              FEEDBACK_KIND_LABEL[f.feedbackKind],
              f.title,
              f.topicName ?? "—",
              FEEDBACK_STATUS_LABEL[f.status],
            ]),
            "Todavía no se ha registrado nada que este cliente haya dicho."
          ), note(NOT_NC_NOTE)),
          section("En resumen", fields([
            requiredField("Manifestaciones", String(customer.feedbackCount)),
            requiredField("Quejas y reclamos", String(customer.complaintCount)),
            requiredField("Quejas abiertas", String(customer.openComplaintCount)),
            requiredField("Felicitaciones", String(customer.complimentCount)),
            requiredField("Respuestas identificadas", String(customer.identifiedResponseCount)),
            requiredField("Última manifestación",
              customer.lastFeedbackOn ? formatDate(customer.lastFeedbackOn) : "Nunca"),
          ])),
          section("Contactos", table(
            [
              { header: "Nombre", width: 4 },
              { header: "Función", width: 3 },
              { header: "Correo", width: 3 },
              { header: "Teléfono", width: 2 },
            ],
            contacts.map((c) => [c.fullName, c.roleTitle ?? "—", c.email ?? "—", c.phone ?? "—"]),
            "Sin contactos registrados."
          ), note(
            "Un cliente puede tener varios contactos y cambiarlos no borra nada de lo "
            + "que ya dijo: la voz queda contra la empresa, no contra la persona."
          )),
        ],
      },
    };
  },
};

export const qualityCustomerList: ExportDefinition = {
  key: "quality.customer.list",
  module: "quality",
  entity: "Listado de clientes del sistema de gestión",
  recordType: "Clientes",
  documentName: "Listado de clientes",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata la situación de hoy. Lo fechado son las manifestaciones y las "
    + "campañas, que llevan su propia fecha.",
  filters: [
    {
      key: "status", label: "Relación", kind: "enum",
      values: ["prospect", "active", "inactive", "retired"],
    },
    { key: "search", label: "Búsqueda", kind: "text" },
  ],
  async load(req): Promise<ExportResult | null> {
    const [customers, org] = await Promise.all([
      listCustomerOverview(req.organizationId, {
        status: req.filters.status, search: req.filters.search,
      }),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Clientes", title: "Listado de clientes", stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Clientes",
        title: "Listado de clientes",
        subtitle: `${customers.length} registro${customers.length === 1 ? "" : "s"}`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "La columna de respuestas cuenta solo las IDENTIFICADAS. Una respuesta "
            + "anónima no se cuenta contra ningún cliente, ni siquiera para decir "
            + "cuántas hay."
          ), currentStateNote(req.generatedAt)),
          section(null, table(
            [
              { header: "Cliente", width: 4 },
              { header: "Identificación", width: 2 },
              { header: "Relación", width: 2 },
              { header: "Segmento", width: 2 },
              { header: "Manifestaciones", width: 2 },
              { header: "Quejas abiertas", width: 2 },
              { header: "Respuestas identificadas", width: 2 },
              { header: "Última", width: 2 },
            ],
            customers.map((c) => [
              c.legalName + (c.isAlsoSupplier ? " (también proveedor)" : ""),
              c.taxId ?? "—",
              CUSTOMER_RELATIONSHIP_STATUS_LABEL[c.relationshipStatus],
              c.segment ?? "—",
              String(c.feedbackCount),
              String(c.openComplaintCount),
              String(c.identifiedResponseCount),
              c.lastFeedbackOn ? formatDate(c.lastFeedbackOn) : "Nunca",
            ]),
            "No hay clientes registrados."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 2 · Encuesta y versión
// ---------------------------------------------------------------------------

export const qualitySurveyDetail: ExportDefinition = {
  key: "quality.survey.detail",
  module: "quality",
  entity: "Encuesta de satisfacción",
  recordType: "Encuesta",
  documentName: "Ficha de encuesta",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La encuesta es la identidad estable; lo que se congela son sus VERSIONES, y cada "
    + "una tiene su propio documento.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const surveys = await listSurveys(req.organizationId);
    const survey = surveys.find((s) => s.id === req.id);
    if (!survey) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Encuesta", title: survey.name,
        code: survey.code, stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Encuesta",
        title: survey.name,
        code: survey.code,
        subtitle: survey.isActive ? "Activa" : "Retirada",
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Para qué existe",
            paragraph(survey.purpose) ?? paragraph("No se escribió su propósito.", true),
            paragraph(survey.description)),
          section("Versiones", table(
            [
              { header: "Versión", width: 1 },
              { header: "Estado", width: 2 },
              { header: "Desde", width: 2 },
              { header: "Hasta", width: 2 },
              { header: "Preguntas", width: 1 },
              { header: "Qué cambió", width: 4 },
            ],
            survey.versions.map((v) => [
              String(v.versionNumber),
              SURVEY_VERSION_STATUS_LABEL[v.status],
              v.effectiveFrom ? formatDate(v.effectiveFrom) : "—",
              v.effectiveTo ? formatDate(v.effectiveTo) : (v.status === "published" ? "Vigente" : "—"),
              String(v.questions.length),
              v.changeNote ?? "—",
            ]),
            "Esta encuesta todavía no tiene ninguna versión."
          ), note(
            "Cada versión se conserva. Una respuesta a la v1 se interpreta siempre con "
            + "las preguntas de la v1, aunque después se hayan publicado otras."
          )),
        ],
      },
    };
  },
};

export const qualitySurveyList: ExportDefinition = {
  key: "quality.survey.list",
  module: "quality",
  entity: "Listado de encuestas de satisfacción",
  recordType: "Encuestas",
  documentName: "Listado de encuestas",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado enumera las encuestas tal como están hoy; sus versiones sí conservan "
    + "vigencia y se leen por separado.",
  async load(req): Promise<ExportResult | null> {
    const [surveys, org] = await Promise.all([
      listSurveys(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    return {
      filenameParts: {
        recordType: "Encuestas", title: "Listado de encuestas", stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Encuestas",
        title: "Listado de encuestas",
        subtitle: `${surveys.length} encuesta${surveys.length === 1 ? "" : "s"}`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, currentStateNote(req.generatedAt)),
          section(null, table(
            [
              { header: "Encuesta", width: 4 },
              { header: "Código", width: 2 },
              { header: "Para qué", width: 5 },
              { header: "Versiones", width: 1 },
              { header: "Vigente", width: 2 },
              { header: "Activa", width: 1 },
            ],
            surveys.map((s) => {
              const publicada = s.versions.find((v) => v.status === "published");
              return [
                s.name, s.code ?? "—", s.purpose ?? "—",
                String(s.versions.length),
                publicada ? `v${publicada.versionNumber}` : "Ninguna",
                s.isActive ? "Sí" : "No",
              ];
            }),
            "No hay encuestas registradas."
          )),
        ],
      },
    };
  },
};

/**
 * §73 · La versión, EXACTAMENTE como fue. Este documento existe para que se
 * pueda enseñar en una auditoría qué se preguntó en 2027 sin que la v2 de 2028
 * contamine ni una línea.
 */
export const qualitySurveyVersionDetail: ExportDefinition = {
  key: "quality.survey-version.detail",
  module: "quality",
  entity: "Versión de encuesta",
  recordType: "Versión de encuesta",
  documentName: "Versión de encuesta",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  // La versión congela su estructura y no se puede reescribir: es un documento
  // del pasado de verdad.
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const structure = await getVersionStructure(req.organizationId, req.id);
    if (!structure) return null;

    const surveys = await listSurveys(req.organizationId);
    const survey = surveys.find((s) => s.versions.some((v) => v.id === req.id));
    const org = await organizationIdentity(req.organizationId);
    const questions = (structure.questions as Record<string, unknown>[]) ?? [];
    const status = String(structure.status);

    return {
      filenameParts: {
        recordType: "Versión de encuesta",
        title: `${survey?.name ?? "Encuesta"} v${structure.version_number}`,
        stamp: (structure.effective_from as string | null) ?? stamp(req.generatedAt),
      },
      document: {
        recordType: "Versión de encuesta",
        title: survey?.name ?? "Encuesta",
        subtitle: `Versión ${structure.version_number} · `
          + SURVEY_VERSION_STATUS_LABEL[status as keyof typeof SURVEY_VERSION_STATUS_LABEL],
        badges: [{
          text: SURVEY_VERSION_STATUS_LABEL[status as keyof typeof SURVEY_VERSION_STATUS_LABEL],
          tone: status === "published" ? "info" : "neutral",
        }],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Esta es la estructura EXACTA de esta versión. No se reconstruye con las "
            + "preguntas de hoy: si después se publicó otra versión, aquella tiene su "
            + "propio documento."
          )),
          section("Vigencia", fields([
            requiredField("Versión", String(structure.version_number)),
            requiredField("Estado",
              SURVEY_VERSION_STATUS_LABEL[status as keyof typeof SURVEY_VERSION_STATUS_LABEL]),
            requiredField("En vigor desde",
              structure.effective_from ? formatDate(String(structure.effective_from)) : "Sin publicar"),
            requiredField("Hasta",
              structure.effective_to ? formatDate(String(structure.effective_to)) : "Vigente"),
          ])),
          section("Presentación",
            paragraph(structure.intro_text as string | null)
              ?? paragraph("Sin texto de presentación.", true)),
          section("Preguntas", table(
            [
              { header: "#", width: 1 },
              { header: "Clave estable", width: 2 },
              { header: "Pregunta", width: 4 },
              { header: "Tipo", width: 2 },
              { header: "Escala", width: 1 },
              { header: "Obligatoria", width: 1 },
              { header: "Admite N/A", width: 1 },
            ],
            questions.map((q) => [
              String(q.position_order ?? ""),
              String(q.stable_key ?? ""),
              String(q.label ?? ""),
              QUESTION_TYPE_LABEL[q.question_type as keyof typeof QUESTION_TYPE_LABEL]
                ?? String(q.question_type),
              q.scale_min !== null && q.scale_min !== undefined
                ? `${q.scale_min}–${q.scale_max}` : "—",
              q.is_required ? "Sí" : "No",
              q.allows_not_applicable ? "Sí" : "No",
            ]),
            "Esta versión no tiene preguntas."
          )),
          section("Opciones de cada pregunta", table(
            [
              { header: "Pregunta", width: 4 },
              { header: "Opciones", width: 8 },
            ],
            questions
              .filter((q) => Array.isArray(q.options) && (q.options as unknown[]).length > 0)
              .map((q) => [
                String(q.label ?? ""),
                ((q.options as { label: string }[]) ?? []).map((o) => o.label).join(" · "),
              ]),
            "Ninguna pregunta de esta versión tiene opciones cerradas."
          )),
          section("Cierre",
            paragraph(structure.closing_text as string | null)
              ?? paragraph("Sin texto de agradecimiento.", true)),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 3 · Campañas
// ---------------------------------------------------------------------------

export const qualityCampaignList: ExportDefinition = {
  key: "quality.survey-campaign.list",
  module: "quality",
  entity: "Listado de campañas de satisfacción",
  recordType: "Campañas",
  documentName: "Listado de campañas de satisfacción",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado enumera las campañas tal como están hoy. El informe de cada una, por "
    + "separado, sí retrata su periodo cerrado.",
  filters: [
    {
      key: "status", label: "Estado", kind: "enum",
      values: ["draft", "open", "closed", "cancelled"],
    },
  ],
  async load(req): Promise<ExportResult | null> {
    const [campaigns, org] = await Promise.all([
      listCampaigns(req.organizationId, { status: req.filters.status }),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Campañas", title: "Campañas de satisfacción", stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Campañas",
        title: "Campañas de satisfacción",
        subtitle: `${campaigns.length} campaña${campaigns.length === 1 ? "" : "s"}`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(ZERO_RESPONSES_IS_NOT_ZERO), currentStateNote(req.generatedAt)),
          section(null, table(
            [
              { header: "Campaña", width: 3 },
              { header: "Encuesta", width: 3 },
              { header: "Fuente", width: 2 },
              { header: "Periodo", width: 2 },
              { header: "Modo", width: 2 },
              { header: "Respuestas", width: 2 },
              { header: "Tasa de respuesta", width: 3 },
              { header: "Estado", width: 2 },
            ],
            campaigns.map((c) => [
              c.name,
              `${c.surveyName} v${c.versionNumber}`,
              VOICE_SOURCE_LABEL[c.voiceSource],
              c.periodLabel ?? formatDate(c.periodStart),
              ANONYMITY_MODE_LABEL[c.anonymityMode],
              c.responsesCount === 0 ? "Sin respuestas" : String(c.responsesCount),
              c.responseRate === null
                ? "Sin denominador"
                : `${c.responseRate} % (${c.responseRateBasis === "population" ? "población" : "invitados"})`,
              CAMPAIGN_STATUS_LABEL[c.status],
            ]),
            "No hay campañas registradas."
          ), note(
            "«Sin denominador» no es un fallo: en una campaña abierta no se sabe a "
            + "cuántos se preguntó, así que no hay porcentaje que calcular."
          )),
        ],
      },
    };
  },
};

/**
 * §74 · El informe de campaña. Es el documento que se enseña, y por eso es el
 * que más cuidado exige con el anonimato.
 */
export const qualityCampaignReport: ExportDefinition = {
  key: "quality.survey-campaign.detail",
  module: "quality",
  entity: "Informe de campaña de satisfacción",
  recordType: "Informe de campaña",
  documentName: "Informe de campaña de satisfacción",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  // La campaña ata su versión y sus respuestas son inmutables: el informe de
  // una campaña cerrada es un documento del pasado.
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const campaign = await getCampaign(req.organizationId, req.id);
    if (!campaign) return null;

    const [metrics, distribution, responses, org] = await Promise.all([
      listMetricSeries(req.organizationId, { campaignId: req.id }),
      getCampaignDistribution(req.organizationId, req.id),
      listResponses(req.organizationId, req.id),
      organizationIdentity(req.organizationId),
    ]);

    const anonima = campaign.anonymityMode === "anonymous";
    const enviadas = responses.filter((r) => r.status === "submitted");
    // §45 · Con muy pocas respuestas, un desglose puede reidentificar a quien
    // respondió. No se publica.
    const seguroDesglosar = aggregateIsSafeToShow(enviadas.length, campaign.anonymityMode);

    return {
      filenameParts: {
        recordType: "Informe de campaña", title: campaign.name,
        code: campaign.code, stamp: campaign.periodStart ?? stamp(req.generatedAt),
      },
      document: {
        recordType: "Informe de campaña",
        title: campaign.name,
        code: campaign.code,
        subtitle: `${campaign.surveyName} · v${campaign.versionNumber} · `
          + ANONYMITY_MODE_LABEL[campaign.anonymityMode],
        badges: [
          { text: CAMPAIGN_STATUS_LABEL[campaign.status], tone: "info" },
          ...(anonima ? [{ text: "Anónima", tone: "neutral" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(RESULT_NOTE),
            anonima ? note(
              "Esta campaña se aplicó de forma ANÓNIMA. Este documento no contiene —ni "
              + "puede contener— la identidad de quien respondió: esos datos no existen "
              + "en el registro."
            ) : null),
          section("Qué se midió", fields([
            requiredField("Encuesta", `${campaign.surveyName} · versión ${campaign.versionNumber}`),
            requiredField("Fuente de la voz", VOICE_SOURCE_LABEL[campaign.voiceSource]),
            requiredField("Modo", ANONYMITY_MODE_LABEL[campaign.anonymityMode]),
            field("Periodo medido", campaign.periodLabel),
            field("Desde", campaign.periodStart ? formatDate(campaign.periodStart) : null),
            field("Hasta", campaign.periodEnd ? formatDate(campaign.periodEnd) : null),
            requiredField("Estado", CAMPAIGN_STATUS_LABEL[campaign.status]),
          ])),
          section("Cobertura", fields([
            requiredField("Respuestas recibidas",
              campaign.responsesCount === 0 ? "Sin respuestas" : String(campaign.responsesCount)),
            requiredField("Enlaces emitidos", String(campaign.invitedCount)),
            requiredField("Población declarada",
              campaign.populationSize === null ? "No se declaró" : String(campaign.populationSize)),
            // §38 · La tasa SOLO con denominador verdadero, y diciendo cuál.
            requiredField("Tasa de respuesta",
              campaign.responseRate === null
                ? "No se puede calcular: no se conoce a cuántos se preguntó"
                : `${campaign.responseRate} % sobre `
                  + (campaign.responseRateBasis === "population"
                     ? "la población declarada" : "los enlaces emitidos")),
          ]), campaign.responsesCount === 0 ? note(ZERO_RESPONSES_IS_NOT_ZERO) : null),
          section("Resultados", table(
            [
              { header: "Métrica", width: 3 },
              { header: "Método", width: 2 },
              { header: "Resultado", width: 2 },
              { header: "Respuestas", width: 1 },
              { header: "No aplica", width: 1 },
              { header: "Sin responder", width: 1 },
              { header: "Comparable con la anterior", width: 2 },
            ],
            metrics.map((m) => [
              m.definitionName,
              METRIC_METHOD_LABEL[m.method],
              m.value === null
                ? (m.sampleSize === 0 ? "Sin respuestas" : "Sin datos suficientes")
                : String(m.value),
              String(m.sampleSize),
              String(m.notApplicable),
              String(m.skipped),
              m.breaksComparability ? "No — la serie se corta aquí" : "Sí",
            ]),
            "Todavía no se han calculado métricas para esta campaña."
          ),
            note(NOT_APPLICABLE_IS_NOT_ZERO),
            metrics.some((m) => m.breaksComparability) ? note(COMPARABILITY_BROKEN) : null),
          section("Qué contestaron",
            seguroDesglosar
              ? table(
                  [
                    { header: "Pregunta", width: 5 },
                    { header: "Respondida", width: 1 },
                    { header: "No aplica", width: 1 },
                    { header: "Sin responder", width: 1 },
                    { header: "Promedio", width: 1 },
                    { header: "Reparto", width: 3 },
                  ],
                  distribution.map((d) => [
                    d.label,
                    String(d.answered),
                    String(d.notApplicable),
                    String(d.skipped),
                    d.average === null ? "—" : String(d.average),
                    d.buckets.map((b) => `${b.value}: ${b.count}`).join(" · ") || "—",
                  ]),
                  "Sin respuestas que desglosar."
                )
              : paragraph(SMALL_GROUP_NOTICE, true)),
          section("Comentarios",
            seguroDesglosar
              ? table(
                  [
                    { header: "Pregunta", width: 4 },
                    { header: "Comentario", width: 8 },
                  ],
                  distribution.flatMap((d) => d.comments.map((c) => [d.label, c])),
                  "No se recibieron comentarios en texto libre."
                )
              : paragraph(SMALL_GROUP_NOTICE, true),
            note(
              anonima
                ? "Los comentarios se imprimen SIN atribución. Si alguno permitiera "
                  + "reconocer a quien lo escribió, eso es una razón para tratarlo con "
                  + "cuidado, no para buscarle dueño."
                : "Los comentarios corresponden a respuestas identificadas y se leen "
                  + "junto con su remitente en el documento de cada respuesta."
            )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 4 · Respuesta identificada (§71)
// ---------------------------------------------------------------------------

/**
 * §71 · Este documento existe SOLO para respuestas identificadas. Si el
 * identificador corresponde a una respuesta de campaña anónima, no se genera:
 * devolver un papel «anónimo» con la fecha exacta y el contenido completo sería
 * el primer paso para cruzarlo con la lista de invitaciones.
 */
export const qualityResponseDetail: ExportDefinition = {
  key: "quality.survey-response.detail",
  module: "quality",
  entity: "Respuesta identificada de encuesta",
  recordType: "Respuesta de encuesta",
  documentName: "Respuesta de encuesta",
  kind: "detail",
  permission: "manager",
  orientation: "portrait",
  // La respuesta enviada es inmutable y lleva su versión: documento del pasado.
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const detail = await getResponseDetail(req.organizationId, req.id);
    if (!detail) return null;

    const campaign = await getCampaign(req.organizationId, detail.response.campaignId);
    if (!campaign) return null;
    // La negativa que sostiene la promesa.
    if (campaign.anonymityMode === "anonymous") return null;

    const org = await organizationIdentity(req.organizationId);
    const r = detail.response;

    return {
      filenameParts: {
        recordType: "Respuesta de encuesta",
        title: `${r.customerName ?? "Respuesta"} · ${campaign.name}`,
        stamp: r.submittedAt ? stamp(r.submittedAt) : stamp(req.generatedAt),
      },
      document: {
        recordType: "Respuesta de encuesta",
        title: campaign.name,
        subtitle: `${campaign.surveyName} · v${campaign.versionNumber}`,
        badges: [{ text: "Identificada", tone: "info" }],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Esta respuesta se recogió en una campaña IDENTIFICADA: quien la envió "
            + "sabía que quedaría asociada a su empresa. Las respuestas de campañas "
            + "anónimas no tienen documento individual."
          )),
          section("Quién y cuándo", fields([
            requiredField("Cliente", r.customerName ?? "—"),
            requiredField("Quién respondió",
              r.contactName ?? r.respondentName ?? RESPONDENT_KIND_LABEL[r.respondentKind]),
            requiredField("Enviada el",
              r.submittedAt ? formatDate(stamp(r.submittedAt)) : "Sin enviar"),
            requiredField("Origen", r.source === "public_link" ? "Enlace público"
              : r.source === "internal" ? "Captura interna" : "Importada"),
            field("Periodo", campaign.periodLabel),
          ])),
          section("Qué contestó", table(
            [
              { header: "#", width: 1 },
              { header: "Pregunta", width: 5 },
              { header: "Resultado", width: 2 },
              { header: "Respuesta", width: 4 },
            ],
            detail.answers.map((a) => [
              String(a.order),
              a.label,
              ANSWER_OUTCOME_LABEL[a.outcome],
              a.outcome !== "answered"
                ? "—"
                : (a.valueText
                   ?? (a.valueChoices ? a.valueChoices.join(", ") : null)
                   ?? (a.valueNumeric !== null ? String(a.valueNumeric) : "—")),
            ]),
            "Esta versión de la encuesta no tenía preguntas."
          ), note(NOT_APPLICABLE_IS_NOT_ZERO)),
          ...(r.supersededBy
            ? [section(null, note(
                "Esta respuesta fue SUSTITUIDA por una corrección posterior. Se conserva "
                + "porque es lo que el cliente contestó en su momento."
              ))]
            : []),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 5 · Retroalimentación y quejas (§75)
// ---------------------------------------------------------------------------

function feedbackDocument(
  f: Awaited<ReturnType<typeof listFeedback>>[number],
  org: Awaited<ReturnType<typeof organizationIdentity>>,
  req: { generatedAt: string; generatedByName: string | null },
  recordType: string
) {
  return {
    recordType,
    title: f.title,
    subtitle: `${FEEDBACK_KIND_LABEL[f.feedbackKind]} · ${formatDate(f.receivedOn)}`,
    badges: [
      { text: FEEDBACK_STATUS_LABEL[f.status], tone: "info" as const },
      ...(f.severity === "critical" || f.severity === "high"
        ? [{ text: FEEDBACK_SEVERITY_LABEL[f.severity], tone: "warn" as const }] : []),
    ],
    organization: org,
    systemLine: SYSTEM,
    orientation: "portrait" as const,
    generatedAt: req.generatedAt,
    generatedByName: req.generatedByName,
    sections: [
      section(null, note(NOT_NC_NOTE)),
      section("Qué pasó", fields([
        requiredField("Tipo", FEEDBACK_KIND_LABEL[f.feedbackKind]),
        requiredField("Recibida el", formatDate(f.receivedOn)),
        requiredField("Cliente",
          f.fromAnonymousCampaign
            ? "Campaña anónima — sin identidad"
            : (f.customerName ?? f.reporterName ?? "Sin identificar")),
        field("Por dónde llegó", f.channel),
        requiredField("Fuente", VOICE_SOURCE_LABEL[f.voiceSource]),
        field("Tema", f.topicName),
        requiredField("Gravedad", FEEDBACK_SEVERITY_LABEL[f.severity]),
        requiredField("Estado", FEEDBACK_STATUS_LABEL[f.status]),
      ])),
      section("Con sus palabras",
        paragraph(f.description) ?? paragraph("No se transcribió el detalle.", true)),
      section("Qué se hizo", fields([
        requiredField("Caso abierto", f.caseCode ?? "Ninguno"),
        field("Cerrada el", f.closedAt ? formatDate(stamp(f.closedAt)) : null),
      ]), paragraph(f.resolutionNote), note(
        f.caseId
          ? "El caso se abrió SIN clasificar. Si es o no una no conformidad se decide "
            + "en su ficha, con el flujo de casos del sistema de gestión."
          : "No se abrió ningún caso. Abrirlo es una decisión, y a veces la decisión "
            + "correcta es responder al cliente y cerrar."
      )),
      ...(f.fromAnonymousCampaign
        ? [section(null, note(
            "Esta manifestación salió de un comentario de una campaña ANÓNIMA. No "
            + "lleva cliente ni persona, y la base impide ponérselos."
          ))]
        : []),
    ],
  };
}

export const qualityFeedbackDetail: ExportDefinition = {
  key: "quality.customer-feedback.detail",
  module: "quality",
  entity: "Manifestación de cliente",
  recordType: "Manifestación de cliente",
  documentName: "Registro de retroalimentación del cliente",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El registro se conserva con su fecha de recepción, pero su estado y su nota de "
    + "resolución reflejan cómo está hoy la atención.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const all = await listFeedback(req.organizationId, {});
    const f = all.find((x) => x.id === req.id);
    if (!f) return null;
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: {
        recordType: "Manifestación de cliente", title: f.title, stamp: f.receivedOn,
      },
      document: feedbackDocument(f, org, req, "Manifestación de cliente"),
    };
  },
};

/** §75 · La queja tiene su propio papel, y NO se llama «no conformidad». */
export const qualityComplaintDetail: ExportDefinition = {
  key: "quality.customer-complaint.detail",
  module: "quality",
  entity: "Queja o reclamo de cliente",
  recordType: "Queja de cliente",
  documentName: "Queja o reclamo de cliente",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La queja se conserva con su fecha, pero su estado y su tratamiento reflejan cómo "
    + "está hoy. Lo que sí es del pasado es el caso al que dio lugar, si lo hubo.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const all = await listFeedback(req.organizationId, {});
    const f = all.find((x) => x.id === req.id);
    if (!f) return null;
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: {
        recordType: "Queja de cliente", title: f.title, stamp: f.receivedOn,
      },
      document: feedbackDocument(f, org, req, "Queja de cliente"),
    };
  },
};

export const qualityFeedbackList: ExportDefinition = {
  key: "quality.customer-feedback.list",
  module: "quality",
  entity: "Listado de retroalimentación de clientes",
  recordType: "Retroalimentación de clientes",
  documentName: "Listado de retroalimentación de clientes",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata el estado de atención de hoy; cada registro conserva su fecha "
    + "de recepción.",
  filters: [
    {
      key: "kind", label: "Tipo", kind: "enum",
      values: ["complaint", "claim", "suggestion", "compliment", "comment", "other"],
    },
    {
      key: "status", label: "Estado", kind: "enum",
      values: ["open", "under_review", "answered", "closed", "dismissed"],
    },
  ],
  async load(req): Promise<ExportResult | null> {
    const [feedback, org] = await Promise.all([
      listFeedback(req.organizationId, { kind: req.filters.kind, status: req.filters.status }),
      organizationIdentity(req.organizationId),
    ]);
    return {
      filenameParts: {
        recordType: "Retroalimentación de clientes", title: "Retroalimentación de clientes",
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Retroalimentación de clientes",
        title: "Retroalimentación de clientes",
        subtitle: `${feedback.length} registro${feedback.length === 1 ? "" : "s"}`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(NOT_NC_NOTE), currentStateNote(req.generatedAt)),
          section(null, table(
            [
              { header: "Fecha", width: 2 },
              { header: "Tipo", width: 2 },
              { header: "Qué dijo", width: 4 },
              { header: "Cliente", width: 3 },
              { header: "Tema", width: 2 },
              { header: "Gravedad", width: 1 },
              { header: "Estado", width: 2 },
              { header: "Caso", width: 2 },
            ],
            feedback.map((f) => [
              formatDate(f.receivedOn),
              FEEDBACK_KIND_LABEL[f.feedbackKind],
              f.title,
              f.fromAnonymousCampaign
                ? "Campaña anónima"
                : (f.customerName ?? f.reporterName ?? "Sin identificar"),
              f.topicName ?? "—",
              FEEDBACK_SEVERITY_LABEL[f.severity],
              FEEDBACK_STATUS_LABEL[f.status],
              f.caseCode ?? "Sin caso",
            ]),
            "Todavía no se ha registrado nada."
          )),
        ],
      },
    };
  },
};

export const qualityComplaintList: ExportDefinition = {
  key: "quality.customer-complaint.list",
  module: "quality",
  entity: "Listado de quejas y reclamos de clientes",
  recordType: "Quejas y reclamos",
  documentName: "Listado de quejas y reclamos",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata el estado de atención de hoy; cada queja conserva su fecha de "
    + "recepción y el caso al que dio lugar, si lo hubo.",
  async load(req): Promise<ExportResult | null> {
    const [all, org] = await Promise.all([
      listFeedback(req.organizationId, {}),
      organizationIdentity(req.organizationId),
    ]);
    const quejas = all.filter((f) => f.feedbackKind === "complaint" || f.feedbackKind === "claim");
    const abiertas = quejas.filter((f) => f.status === "open" || f.status === "under_review");

    return {
      filenameParts: {
        recordType: "Quejas y reclamos", title: "Quejas y reclamos de clientes",
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Quejas y reclamos",
        title: "Quejas y reclamos de clientes",
        subtitle: `${quejas.length} en total · ${abiertas.length} sin cerrar`,
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(NOT_NC_NOTE), note(
            "Este listado NO es un listado de no conformidades. Contarlo como tal "
            + "inflaría un indicador con hechos que nadie clasificó."
          ), currentStateNote(req.generatedAt)),
          section(null, table(
            [
              { header: "Fecha", width: 2 },
              { header: "Tipo", width: 2 },
              { header: "Queja", width: 4 },
              { header: "Cliente", width: 3 },
              { header: "Gravedad", width: 1 },
              { header: "Estado", width: 2 },
              { header: "Caso abierto", width: 2 },
            ],
            quejas.map((f) => [
              formatDate(f.receivedOn),
              FEEDBACK_KIND_LABEL[f.feedbackKind],
              f.title,
              f.fromAnonymousCampaign
                ? "Campaña anónima"
                : (f.customerName ?? f.reporterName ?? "Sin identificar"),
              FEEDBACK_SEVERITY_LABEL[f.severity],
              FEEDBACK_STATUS_LABEL[f.status],
              f.caseCode ?? "No",
            ]),
            "No hay quejas ni reclamos registrados."
          )),
        ],
      },
    };
  },
};

// ---------------------------------------------------------------------------
// 6 · Satisfacción, tendencia y cierre del periodo
// ---------------------------------------------------------------------------

/** §72 · El informe de satisfacción: el retrato del periodo, con su cobertura
 *  y sus advertencias de comparabilidad. */
export const qualitySatisfactionReport: ExportDefinition = {
  key: "quality.customer-satisfaction.list",
  module: "quality",
  entity: "Informe de satisfacción del cliente",
  recordType: "Informe de satisfacción",
  // La nomenclatura de la plataforma manda sobre la del dominio: todo listado
  // empieza por «Listado» o «Reporte».
  documentName: "Reporte de satisfacción del cliente",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El informe consolida lo medido hasta hoy. El cierre formal de un periodo sí "
    + "congela su retrato y tiene su propio documento.",
  async load(req): Promise<ExportResult | null> {
    const [definitions, series, feedback, campaigns, org] = await Promise.all([
      listMetricDefinitions(req.organizationId),
      listMetricSeries(req.organizationId),
      listFeedback(req.organizationId, {}),
      listCampaigns(req.organizationId, {}),
      organizationIdentity(req.organizationId),
    ]);
    const quejas = feedback.filter((f) => f.feedbackKind === "complaint" || f.feedbackKind === "claim");
    const felicitaciones = feedback.filter((f) => f.feedbackKind === "compliment");
    const cerradas = campaigns.filter((c) => c.status === "closed");

    return {
      filenameParts: {
        recordType: "Informe de satisfacción", title: "Satisfacción del cliente",
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Informe de satisfacción",
        title: "Satisfacción del cliente",
        subtitle: `${cerradas.length} campaña${cerradas.length === 1 ? "" : "s"} cerrada`
          + `${cerradas.length === 1 ? "" : "s"} · ${quejas.length} queja`
          + `${quejas.length === 1 ? "" : "s"}`,
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(RESULT_NOTE), note(NOT_NC_NOTE), currentStateNote(req.generatedAt)),
          section("Qué se mide", table(
            [
              { header: "Métrica", width: 4 },
              { header: "Método", width: 2 },
              { header: "Sobre qué pregunta", width: 3 },
              { header: "Escala esperada", width: 3 },
            ],
            definitions.filter((d) => d.isActive).map((d) => [
              d.name,
              METRIC_METHOD_LABEL[d.method],
              d.questionStableKey ?? "—",
              d.expectsScaleMin !== null ? `${d.expectsScaleMin}–${d.expectsScaleMax}` : "—",
            ]),
            "Esta empresa todavía no ha definido ninguna métrica de satisfacción."
          ), note(
            "Trazaloop no impone NPS ni CSAT. La empresa define qué mide y cómo; lo "
            + "único que el sistema no permite es llamar NPS a algo que no lo es."
          )),
          section("Últimos resultados", table(
            [
              { header: "Periodo", width: 2 },
              { header: "Campaña", width: 3 },
              { header: "Métrica", width: 3 },
              { header: "Resultado", width: 2 },
              { header: "Respuestas", width: 1 },
              { header: "Comparable", width: 1 },
            ],
            series.map((s) => [
              s.periodLabel ?? formatDate(s.periodStart),
              s.campaignName,
              s.definitionName,
              s.value === null
                ? (s.sampleSize === 0 ? "Sin respuestas" : "Sin datos")
                : String(s.value),
              String(s.sampleSize),
              s.breaksComparability ? "No" : "Sí",
            ]),
            "Todavía no se ha calculado ninguna métrica."
          ),
            series.some((s) => s.breaksComparability) ? note(COMPARABILITY_BROKEN) : null,
            note(ZERO_RESPONSES_IS_NOT_ZERO)),
          section("Lo que llegó sin encuesta", fields([
            requiredField("Quejas y reclamos", String(quejas.length)),
            requiredField("Sin cerrar",
              String(quejas.filter((f) => f.status === "open" || f.status === "under_review").length)),
            requiredField("Con caso abierto",
              String(quejas.filter((f) => f.caseId !== null).length)),
            requiredField("Felicitaciones", String(felicitaciones.length)),
            requiredField("Sugerencias",
              String(feedback.filter((f) => f.feedbackKind === "suggestion").length)),
          ]), note(
            "La satisfacción no es solo una encuesta: una llamada, una devolución o "
            + "una felicitación también son voz del cliente."
          )),
        ],
      },
    };
  },
};

/** §36/§37 · La tendencia, con los cortes de serie marcados. */
export const qualityVoiceTrend: ExportDefinition = {
  key: "quality.customer-voice-trend.list",
  module: "quality",
  entity: "Tendencia de la voz del cliente",
  recordType: "Tendencia de voz del cliente",
  documentName: "Reporte de tendencia de la voz del cliente",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "La tendencia se compone con las mediciones existentes hoy. Cada medición, por "
    + "separado, sí lleva su método y su periodo congelados.",
  async load(req): Promise<ExportResult | null> {
    const [definitions, series, org] = await Promise.all([
      listMetricDefinitions(req.organizationId),
      listMetricSeries(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);

    const cortes = series.filter((s) => s.breaksComparability).length;

    return {
      filenameParts: {
        recordType: "Tendencia de voz del cliente", title: "Tendencia de la voz del cliente",
        stamp: stamp(req.generatedAt),
      },
      document: {
        recordType: "Tendencia de voz del cliente",
        title: "Tendencia de la voz del cliente",
        subtitle: `${definitions.length} métrica${definitions.length === 1 ? "" : "s"}`
          + (cortes > 0 ? ` · ${cortes} corte${cortes === 1 ? "" : "s"} de serie` : ""),
        organization: org, systemLine: SYSTEM,
        orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "Dos mediciones solo forman una serie si midieron la misma pregunta, en la "
            + "misma escala y con el mismo método. Donde eso cambia, la serie SE CORTA: "
            + "unir los puntos afirmaría una tendencia que no existe."
          ), currentStateNote(req.generatedAt)),
          ...definitions.map((d) => {
            const puntos = series.filter((s) => s.definitionId === d.id);
            return section(`${d.name} · ${METRIC_METHOD_LABEL[d.method]}`, table(
              [
                { header: "Periodo", width: 2 },
                { header: "Campaña", width: 3 },
                { header: "Resultado", width: 2 },
                { header: "Respuestas", width: 1 },
                { header: "No aplica", width: 1 },
                { header: "Clave de comparabilidad", width: 3 },
                { header: "¿Sigue la serie?", width: 2 },
              ],
              puntos.map((p) => [
                p.periodLabel ?? formatDate(p.periodStart),
                p.campaignName,
                p.value === null
                  ? (p.sampleSize === 0 ? "Sin respuestas" : "Sin datos")
                  : String(p.value),
                String(p.sampleSize),
                String(p.notApplicable),
                p.comparabilityKey,
                p.breaksComparability ? "NO — corte de serie" : "Sí",
              ]),
              "Esta métrica todavía no tiene mediciones."
            ));
          }),
        ],
      },
    };
  },
};

/** VC-05/VC-06 · El cierre formal del periodo, con su retrato congelado. */
export const qualityVoiceReviewDetail: ExportDefinition = {
  key: "quality.customer-voice-review.detail",
  module: "quality",
  entity: "Cierre del periodo de satisfacción",
  recordType: "Cierre de periodo",
  documentName: "Cierre del periodo de satisfacción",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  // Cerrado es inmutable y lleva su retrato congelado: documento del pasado.
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const reviews = await listVoiceReviews(req.organizationId);
    const review = reviews.find((r) => r.id === req.id);
    if (!review) return null;
    const org = await organizationIdentity(req.organizationId);
    const snap = review.summarySnapshot ?? {};
    const metricas = (snap.metrics as Record<string, unknown>[]) ?? [];

    return {
      filenameParts: {
        recordType: "Cierre de periodo", title: review.periodLabel,
        stamp: review.periodEnd,
      },
      document: {
        recordType: "Cierre de periodo",
        title: `Satisfacción del cliente · ${review.periodLabel}`,
        subtitle: `${formatDate(review.periodStart)} → ${formatDate(review.periodEnd)}`,
        badges: [
          { text: review.status === "closed" ? "Cerrado" : "Abierto",
            tone: review.status === "closed" ? "info" : "neutral" },
          ...(review.methodologyVerdict
            ? [{ text: METHODOLOGY_VERDICT_LABEL[review.methodologyVerdict], tone: "neutral" as const }]
            : []),
        ],
        organization: org, systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, note(
            "El cierre del periodo es un acto formal de la empresa sobre sus clientes. "
            + "Una vez cerrado no se reescribe: el retrato que aparece aquí es el que "
            + "había el día que se firmó."
          )),
          section("Alcance", fields([
            requiredField("Periodo", review.periodLabel),
            requiredField("Desde", formatDate(review.periodStart)),
            requiredField("Hasta", formatDate(review.periodEnd)),
            field("Segmentos", review.scopeNote),
            requiredField("Estado", review.status === "closed" ? "Cerrado" : "Abierto"),
            field("Cerrado el", review.closedAt ? formatDate(stamp(review.closedAt)) : null),
          ])),
          section("Lo que se consolidó", fields([
            requiredField("Campañas del periodo", String(snap.campaigns ?? "—")),
            requiredField("Respuestas recibidas", String(snap.responses ?? "—")),
            requiredField("Quejas y reclamos", String(snap.complaints ?? "—")),
            requiredField("Felicitaciones", String(snap.compliments ?? "—")),
            requiredField("Señales abiertas", String(snap.open_signals ?? "—")),
          ]), review.status === "draft"
            ? note("Este periodo sigue abierto: el retrato se congela al cerrarlo.")
            : null),
          section("Resultados del periodo", table(
            [
              { header: "Métrica", width: 4 },
              { header: "Resultado", width: 2 },
              { header: "Respuestas", width: 2 },
              { header: "Clave de comparabilidad", width: 4 },
            ],
            metricas.map((m) => [
              String(m.definition ?? "—"),
              m.value === null || m.value === undefined ? "Sin datos" : String(m.value),
              String(m.sample_size ?? "—"),
              String(m.comparability_key ?? "—"),
            ]),
            "No se calcularon métricas en este periodo."
          )),
          // VC-06 · Revisar la metodología es parte del acto, no un extra.
          section("Revisión de la metodología", fields([
            requiredField("Veredicto",
              review.methodologyVerdict
                ? METHODOLOGY_VERDICT_LABEL[review.methodologyVerdict]
                : "Todavía sin decidir"),
          ]), paragraph(review.methodologyNote), note(
            "Una medición que se repite sin revisarse acaba midiendo lo que ya no "
            + "importa. Por eso el cierre incluye decir si el instrumento sigue sirviendo."
          )),
          section("Conclusiones",
            paragraph(review.conclusions)
              ?? paragraph("El periodo todavía no tiene conclusiones escritas.", true)),
        ],
      },
    };
  },
};
