import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type {
  AnonymityMode, AnswerOutcome, CampaignStatus, CustomerRelationshipStatus,
  FeedbackKind, FeedbackSeverity, FeedbackStatus, MethodologyVerdict, MetricMethod,
  QuestionType, RespondentKind, ResponseStatus, SurveyVersionStatus, VoiceSource,
} from "@/lib/domain/quality-customer-voice";

/**
 * Trazaloop · QUALITY-08 · Lectura y escritura de la Voz del Cliente.
 *
 * CUATRO DECISIONES QUE EXPLICAN CÓMO ESTÁ ESCRITO ESTE ARCHIVO
 *
 * 1 · Lo que crea HISTORIA pasa por una RPC de 0126: publicar una versión,
 *     abrir o cerrar una campaña, emitir un enlace, enviar una respuesta,
 *     calcular métricas, escalar una queja a caso y cerrar el periodo. Todos
 *     comprueban rol, estado e invariante en el MISMO acto en que registran.
 *
 * 2 · Las respuestas NO se escriben desde aquí. No hay `createResponse`, ni
 *     `updateAnswer`, ni nada parecido: la RLS tampoco lo permitiría. La única
 *     puerta es `submitSurveyResponse`, que decide qué identidad lleva la
 *     respuesta según el anonimato de su campaña. Si esta capa pudiera
 *     insertar, la promesa dependería de que se acordara.
 *
 * 3 · Las relaciones se resuelven con consultas separadas y se cruzan en
 *     memoria: las FK son compuestas `(organization_id, id)` y los embeds de
 *     PostgREST no las resuelven —fallan en silencio devolviendo lista vacía—.
 *
 * 4 · Nunca `service_role`. Ni siquiera para la superficie pública: allí se
 *     usa el cliente ANÓNIMO contra dos RPC que son la única puerta.
 */

type Db = SupabaseClient;

function fail(error: { message?: string; code?: string } | null, fallback: string): string {
  const raw = error?.message ?? "";
  if (error?.code === "P0001" && raw.length > 0) return raw;
  return raw.length > 0 ? raw : fallback;
}

async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ===========================================================================
// CLIENTES
// ===========================================================================

export type CustomerOverviewRow = {
  profileId: string; partyId: string;
  legalName: string; tradeName: string | null; taxId: string | null;
  country: string | null; city: string | null;
  relationshipStatus: CustomerRelationshipStatus;
  segment: string | null;
  ownerPositionId: string | null; ownerPositionName: string | null;
  feedbackCount: number; complaintCount: number; openComplaintCount: number;
  complimentCount: number; lastFeedbackOn: string | null;
  identifiedResponseCount: number;
  isAlsoSupplier: boolean;
};

export async function listCustomerOverview(
  organizationId: string,
  filters: { status?: string; search?: string } = {},
  client?: Db
): Promise<CustomerOverviewRow[]> {
  const supabase = await db(client);
  let q = supabase
    .from("v_quality_customer_overview")
    .select("*")
    .eq("organization_id", organizationId)
    .order("legal_name");
  if (filters.status) q = q.eq("relationship_status", filters.status);
  if (filters.search && filters.search.trim().length > 0) {
    q = q.ilike("legal_name", `%${filters.search.trim()}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(fail(error, "No se pudieron leer los clientes."));
  return (data ?? []).map((r) => ({
    profileId: r.profile_id, partyId: r.party_id,
    legalName: r.legal_name, tradeName: r.trade_name, taxId: r.tax_id,
    country: r.country, city: r.city,
    relationshipStatus: r.relationship_status as CustomerRelationshipStatus,
    segment: r.segment,
    ownerPositionId: r.owner_position_id, ownerPositionName: r.owner_position_name,
    feedbackCount: Number(r.feedback_count ?? 0),
    complaintCount: Number(r.complaint_count ?? 0),
    openComplaintCount: Number(r.open_complaint_count ?? 0),
    complimentCount: Number(r.compliment_count ?? 0),
    lastFeedbackOn: r.last_feedback_on,
    identifiedResponseCount: Number(r.identified_response_count ?? 0),
    isAlsoSupplier: Boolean(r.is_also_supplier),
  }));
}

/** §5 · Empresas externas que TODAVÍA no tienen papel de cliente. Es la lista
 *  que hace posible reutilizar la identidad en vez de crear otra: si ACME ya
 *  existe como proveedor, aquí aparece para darle también el papel de cliente. */
export type AdoptableParty = {
  partyId: string; legalName: string; taxId: string | null; isSupplier: boolean;
};

export async function listPartiesWithoutCustomerRole(
  organizationId: string, client?: Db
): Promise<AdoptableParty[]> {
  const supabase = await db(client);
  const [parties, customers, suppliers] = await Promise.all([
    supabase.from("quality_external_parties")
      .select("id, legal_name, tax_id")
      .eq("organization_id", organizationId).eq("status", "active").order("legal_name"),
    supabase.from("quality_customer_profiles")
      .select("party_id").eq("organization_id", organizationId),
    supabase.from("quality_supplier_profiles")
      .select("party_id").eq("organization_id", organizationId),
  ]);
  const taken = new Set((customers.data ?? []).map((c) => c.party_id as string));
  const isSupplier = new Set((suppliers.data ?? []).map((s) => s.party_id as string));
  return (parties.data ?? [])
    .filter((p) => !taken.has(p.id as string))
    .map((p) => ({
      partyId: p.id as string,
      legalName: p.legal_name as string,
      taxId: (p.tax_id as string | null) ?? null,
      isSupplier: isSupplier.has(p.id as string),
    }));
}

export type CustomerContactRow = {
  id: string; fullName: string; roleTitle: string | null;
  email: string | null; phone: string | null; isPrimary: boolean;
};

export async function listCustomerContacts(
  organizationId: string, partyId: string, client?: Db
): Promise<CustomerContactRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_external_party_contacts")
    .select("id, full_name, role_title, email, phone, is_primary")
    .eq("organization_id", organizationId).eq("party_id", partyId)
    .order("is_primary", { ascending: false }).order("full_name");
  if (error) throw new Error(fail(error, "No se pudieron leer los contactos."));
  return (data ?? []).map((c) => ({
    id: c.id, fullName: c.full_name, roleTitle: c.role_title,
    email: c.email, phone: c.phone, isPrimary: Boolean(c.is_primary),
  }));
}

// ===========================================================================
// ENCUESTAS
// ===========================================================================

export type SurveyQuestionRow = {
  id: string; stableKey: string; label: string; helpText: string | null;
  questionType: QuestionType; isRequired: boolean; allowsNotApplicable: boolean;
  scaleMin: number | null; scaleMax: number | null; scaleStep: number | null;
  scaleMinLabel: string | null; scaleMaxLabel: string | null;
  options: { key: string; label: string }[] | null;
  order: number; topicId: string | null;
};

export type SurveyVersionRow = {
  id: string; versionNumber: number; status: SurveyVersionStatus;
  introText: string | null; closingText: string | null;
  effectiveFrom: string | null; effectiveTo: string | null;
  changeNote: string | null;
  questions: SurveyQuestionRow[];
};

export type SurveyRow = {
  id: string; code: string | null; name: string; description: string | null;
  purpose: string | null; ownerPositionId: string | null; isActive: boolean;
  versions: SurveyVersionRow[];
};

export async function listSurveys(
  organizationId: string, client?: Db
): Promise<SurveyRow[]> {
  const supabase = await db(client);
  const [surveys, versions, questions] = await Promise.all([
    supabase.from("quality_surveys")
      .select("id, code, name, description, purpose, owner_position_id, is_active")
      .eq("organization_id", organizationId).order("name"),
    supabase.from("quality_survey_versions")
      .select("id, survey_id, version_number, status, intro_text, closing_text, effective_from, effective_to, change_note")
      .eq("organization_id", organizationId).order("version_number", { ascending: false }),
    supabase.from("quality_survey_questions")
      .select("id, version_id, stable_key, label, help_text, question_type, is_required, allows_not_applicable, scale_min, scale_max, scale_step, scale_min_label, scale_max_label, options, position_order, topic_id")
      .eq("organization_id", organizationId).order("position_order"),
  ]);
  if (surveys.error) throw new Error(fail(surveys.error, "No se pudieron leer las encuestas."));

  return (surveys.data ?? []).map((s) => ({
    id: s.id, code: s.code, name: s.name, description: s.description,
    purpose: s.purpose, ownerPositionId: s.owner_position_id, isActive: Boolean(s.is_active),
    versions: (versions.data ?? [])
      .filter((v) => v.survey_id === s.id)
      .map((v) => ({
        id: v.id as string,
        versionNumber: Number(v.version_number),
        status: v.status as SurveyVersionStatus,
        introText: v.intro_text as string | null,
        closingText: v.closing_text as string | null,
        effectiveFrom: v.effective_from as string | null,
        effectiveTo: v.effective_to as string | null,
        changeNote: v.change_note as string | null,
        questions: (questions.data ?? [])
          .filter((q) => q.version_id === v.id)
          .map(mapQuestion),
      })),
  }));
}

function mapQuestion(q: Record<string, unknown>): SurveyQuestionRow {
  return {
    id: q.id as string,
    stableKey: q.stable_key as string,
    label: q.label as string,
    helpText: (q.help_text as string | null) ?? null,
    questionType: q.question_type as QuestionType,
    isRequired: Boolean(q.is_required),
    allowsNotApplicable: Boolean(q.allows_not_applicable),
    scaleMin: q.scale_min === null || q.scale_min === undefined ? null : Number(q.scale_min),
    scaleMax: q.scale_max === null || q.scale_max === undefined ? null : Number(q.scale_max),
    scaleStep: q.scale_step === null || q.scale_step === undefined ? null : Number(q.scale_step),
    scaleMinLabel: (q.scale_min_label as string | null) ?? null,
    scaleMaxLabel: (q.scale_max_label as string | null) ?? null,
    options: (q.options as { key: string; label: string }[] | null) ?? null,
    order: Number(q.position_order ?? 1),
    topicId: (q.topic_id as string | null) ?? null,
  };
}

/** §73 · La estructura EXACTA de una versión, tal como fue. La lee la RPC, no
 *  se reconstruye con las preguntas de hoy. */
export async function getVersionStructure(
  organizationId: string, versionId: string, client?: Db
): Promise<Record<string, unknown> | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_survey_version_structure", {
    p_organization_id: organizationId, p_version_id: versionId,
  });
  if (error) throw new Error(fail(error, "No se pudo leer la estructura de esa versión."));
  return (data as Record<string, unknown> | null) ?? null;
}

export async function surveyVersionOn(
  organizationId: string, surveyId: string, on: string, client?: Db
): Promise<{ versionId: string; versionNumber: number; status: string;
             effectiveFrom: string | null; effectiveTo: string | null } | null> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_survey_version_on", {
    p_organization_id: organizationId, p_survey_id: surveyId, p_on: on,
  });
  if (error) throw new Error(fail(error, "No se pudo leer la versión de esa fecha."));
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    versionId: row.version_id, versionNumber: Number(row.version_number),
    status: row.status, effectiveFrom: row.effective_from, effectiveTo: row.effective_to,
  };
}

// ===========================================================================
// CAMPAÑAS
// ===========================================================================

export type CampaignRow = {
  id: string; surveyId: string; versionId: string;
  code: string | null; name: string;
  surveyName: string; versionNumber: number;
  voiceSource: VoiceSource; status: CampaignStatus; anonymityMode: AnonymityMode;
  periodLabel: string | null; periodStart: string | null; periodEnd: string | null;
  opensOn: string | null; closesOn: string | null;
  ownerPositionId: string | null;
  populationSize: number | null;
  invitedCount: number; responsesCount: number; draftResponsesCount: number;
  /** §38 · Nulo cuando NO hay denominador de verdad. */
  responseRate: number | null;
  responseRateBasis: "population" | "invitations" | null;
};

export async function listCampaigns(
  organizationId: string,
  filters: { status?: string; surveyId?: string } = {},
  client?: Db
): Promise<CampaignRow[]> {
  const supabase = await db(client);
  let q = supabase
    .from("v_quality_campaign_summary")
    .select("*")
    .eq("organization_id", organizationId)
    .order("period_start", { ascending: false, nullsFirst: false });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.surveyId) q = q.eq("survey_id", filters.surveyId);
  const { data, error } = await q;
  if (error) throw new Error(fail(error, "No se pudieron leer las campañas."));
  return (data ?? []).map(mapCampaign);
}

export async function getCampaign(
  organizationId: string, campaignId: string, client?: Db
): Promise<CampaignRow | null> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("v_quality_campaign_summary")
    .select("*")
    .eq("organization_id", organizationId).eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw new Error(fail(error, "No se pudo leer la campaña."));
  return data ? mapCampaign(data) : null;
}

function mapCampaign(r: Record<string, unknown>): CampaignRow {
  return {
    id: r.campaign_id as string,
    surveyId: r.survey_id as string,
    versionId: r.version_id as string,
    code: (r.code as string | null) ?? null,
    name: r.name as string,
    surveyName: r.survey_name as string,
    versionNumber: Number(r.version_number),
    voiceSource: r.voice_source as VoiceSource,
    status: r.status as CampaignStatus,
    anonymityMode: r.anonymity_mode as AnonymityMode,
    periodLabel: (r.period_label as string | null) ?? null,
    periodStart: (r.period_start as string | null) ?? null,
    periodEnd: (r.period_end as string | null) ?? null,
    opensOn: (r.opens_on as string | null) ?? null,
    closesOn: (r.closes_on as string | null) ?? null,
    ownerPositionId: (r.owner_position_id as string | null) ?? null,
    populationSize: r.population_size === null || r.population_size === undefined
      ? null : Number(r.population_size),
    invitedCount: Number(r.invited_count ?? 0),
    responsesCount: Number(r.responses_count ?? 0),
    draftResponsesCount: Number(r.draft_responses_count ?? 0),
    responseRate: r.response_rate === null || r.response_rate === undefined
      ? null : Number(r.response_rate),
    responseRateBasis: (r.response_rate_basis as "population" | "invitations" | null) ?? null,
  };
}

/** §66 · Lo que la sesión puede ver de una invitación. El hash del token NO
 *  está entre las columnas concedidas: no se puede pedir aunque se quiera. */
export type InvitationRow = {
  id: string; tokenPrefix: string | null;
  customerId: string | null; contactId: string | null; sentToEmail: string | null;
  status: "pending" | "used" | "revoked" | "expired";
  sentAt: string | null; expiresAt: string | null; usedAt: string | null;
};

export async function listInvitations(
  organizationId: string, campaignId: string, client?: Db
): Promise<InvitationRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_survey_invitations")
    .select("id, token_prefix, customer_id, contact_id, sent_to_email, status, sent_at, expires_at, used_at")
    .eq("organization_id", organizationId).eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las invitaciones."));
  return (data ?? []).map((i) => ({
    id: i.id, tokenPrefix: i.token_prefix,
    customerId: i.customer_id, contactId: i.contact_id, sentToEmail: i.sent_to_email,
    status: i.status as InvitationRow["status"],
    sentAt: i.sent_at, expiresAt: i.expires_at, usedAt: i.used_at,
  }));
}

// ===========================================================================
// RESPUESTAS
// ===========================================================================

export type ResponseRow = {
  id: string; campaignId: string; versionId: string;
  status: ResponseStatus; submittedAt: string | null;
  respondentKind: RespondentKind;
  /** Nulo SIEMPRE en campaña anónima. No es que se oculte: no existe. */
  customerId: string | null; customerName: string | null;
  contactId: string | null; contactName: string | null;
  respondentName: string | null;
  source: string;
  supersededBy: string | null;
};

export async function listResponses(
  organizationId: string, campaignId: string, client?: Db
): Promise<ResponseRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_survey_responses")
    .select("id, campaign_id, version_id, status, submitted_at, respondent_kind, customer_id, contact_id, respondent_name, source, superseded_by")
    .eq("organization_id", organizationId).eq("campaign_id", campaignId)
    .order("submitted_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las respuestas."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // Los nombres se resuelven aparte: el embed compuesto no resuelve y falla en
  // silencio. Y solo se piden para las respuestas que SÍ llevan identidad.
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))] as string[];
  const [customers, contacts] = await Promise.all([
    customerIds.length > 0
      ? supabase.from("v_quality_customer_overview").select("profile_id, legal_name")
          .eq("organization_id", organizationId).in("profile_id", customerIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    contactIds.length > 0
      ? supabase.from("quality_external_party_contacts").select("id, full_name")
          .eq("organization_id", organizationId).in("id", contactIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const customerName = new Map((customers.data ?? []).map(
    (c) => [c.profile_id as string, c.legal_name as string]));
  const contactName = new Map((contacts.data ?? []).map(
    (c) => [c.id as string, c.full_name as string]));

  return rows.map((r) => ({
    id: r.id as string,
    campaignId: r.campaign_id as string,
    versionId: r.version_id as string,
    status: r.status as ResponseStatus,
    submittedAt: (r.submitted_at as string | null) ?? null,
    respondentKind: r.respondent_kind as RespondentKind,
    customerId: (r.customer_id as string | null) ?? null,
    customerName: r.customer_id ? (customerName.get(r.customer_id as string) ?? null) : null,
    contactId: (r.contact_id as string | null) ?? null,
    contactName: r.contact_id ? (contactName.get(r.contact_id as string) ?? null) : null,
    respondentName: (r.respondent_name as string | null) ?? null,
    source: r.source as string,
    supersededBy: (r.superseded_by as string | null) ?? null,
  }));
}

export type AnswerRow = {
  questionId: string; stableKey: string; label: string; questionType: QuestionType;
  order: number;
  outcome: AnswerOutcome;
  valueNumeric: number | null; valueText: string | null; valueChoices: string[] | null;
};

/** El detalle de UNA respuesta, con las preguntas de SU versión. Se recorren
 *  las preguntas, no las answers: una pregunta sin fila es «sin responder», y
 *  si se recorrieran las answers desaparecería del papel. */
export async function getResponseDetail(
  organizationId: string, responseId: string, client?: Db
): Promise<{ response: ResponseRow; answers: AnswerRow[] } | null> {
  const supabase = await db(client);
  const { data: r } = await supabase
    .from("quality_survey_responses")
    .select("id, campaign_id, version_id, status, submitted_at, respondent_kind, customer_id, contact_id, respondent_name, source, superseded_by")
    .eq("organization_id", organizationId).eq("id", responseId).maybeSingle();
  if (!r) return null;

  const all = await listResponses(organizationId, r.campaign_id as string, supabase);
  const response = all.find((x) => x.id === responseId);
  if (!response) return null;

  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabase.from("quality_survey_questions")
      .select("id, stable_key, label, question_type, position_order")
      .eq("organization_id", organizationId).eq("version_id", r.version_id)
      .order("position_order"),
    supabase.from("quality_survey_answers")
      .select("question_id, outcome, value_numeric, value_text, value_choices")
      .eq("organization_id", organizationId).eq("response_id", responseId),
  ]);

  return {
    response,
    answers: (questions ?? []).map((q) => {
      const a = (answers ?? []).find((x) => x.question_id === q.id);
      return {
        questionId: q.id as string,
        stableKey: q.stable_key as string,
        label: q.label as string,
        questionType: q.question_type as QuestionType,
        order: Number(q.position_order),
        outcome: (a?.outcome as AnswerOutcome) ?? "skipped",
        valueNumeric: a?.value_numeric === null || a?.value_numeric === undefined
          ? null : Number(a.value_numeric),
        valueText: (a?.value_text as string | null) ?? null,
        valueChoices: (a?.value_choices as string[] | null) ?? null,
      };
    }),
  };
}

/**
 * §44 · La distribución de una pregunta, AGREGADA. Es la única forma en que se
 * enseñan las respuestas de una campaña anónima, y ni siquiera esta lleva nada
 * que apunte a una persona.
 */
export type QuestionDistribution = {
  questionId: string; stableKey: string; label: string; questionType: QuestionType;
  answered: number; notApplicable: number; skipped: number;
  average: number | null;
  buckets: { value: string; count: number }[];
  comments: string[];
};

export async function getCampaignDistribution(
  organizationId: string, campaignId: string, client?: Db
): Promise<QuestionDistribution[]> {
  const supabase = await db(client);
  const { data: campaign } = await supabase
    .from("quality_survey_campaigns").select("version_id")
    .eq("organization_id", organizationId).eq("id", campaignId).maybeSingle();
  if (!campaign) return [];

  const [{ data: questions }, { data: answers }] = await Promise.all([
    supabase.from("quality_survey_questions")
      .select("id, stable_key, label, question_type, position_order")
      .eq("organization_id", organizationId).eq("version_id", campaign.version_id)
      .order("position_order"),
    supabase.from("quality_survey_answers")
      .select("question_id, outcome, value_numeric, value_text, value_choices, response_id")
      .eq("organization_id", organizationId),
  ]);

  const { data: responses } = await supabase
    .from("quality_survey_responses").select("id")
    .eq("organization_id", organizationId).eq("campaign_id", campaignId)
    .eq("status", "submitted").is("superseded_by", null);
  const valid = new Set((responses ?? []).map((r) => r.id as string));

  return (questions ?? []).map((q) => {
    const mine = (answers ?? []).filter(
      (a) => a.question_id === q.id && valid.has(a.response_id as string));
    const answered = mine.filter((a) => a.outcome === "answered");
    const numeric = answered
      .map((a) => (a.value_numeric === null ? null : Number(a.value_numeric)))
      .filter((v): v is number => v !== null);
    const buckets = new Map<string, number>();
    for (const a of answered) {
      const keys = a.value_choices && Array.isArray(a.value_choices)
        ? (a.value_choices as string[])
        : [a.value_numeric !== null && a.value_numeric !== undefined
            ? String(Number(a.value_numeric)) : null].filter(Boolean) as string[];
      for (const k of keys) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    return {
      questionId: q.id as string,
      stableKey: q.stable_key as string,
      label: q.label as string,
      questionType: q.question_type as QuestionType,
      answered: answered.length,
      notApplicable: mine.filter((a) => a.outcome === "not_applicable").length,
      skipped: mine.filter((a) => a.outcome === "skipped").length,
      average: numeric.length > 0
        ? Math.round((numeric.reduce((s, v) => s + v, 0) / numeric.length) * 100) / 100
        : null,
      buckets: [...buckets.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value, "es", { numeric: true })),
      comments: answered
        .map((a) => (a.value_text as string | null) ?? "")
        .filter((t) => t.trim().length > 0),
    };
  });
}

// ===========================================================================
// MÉTRICAS
// ===========================================================================

export type MetricDefinitionRow = {
  id: string; code: string | null; name: string; description: string | null;
  method: MetricMethod; questionStableKey: string | null;
  expectsScaleMin: number | null; expectsScaleMax: number | null;
  topBoxMin: number | null;
  unit: string; direction: string; formulaNote: string | null; isActive: boolean;
};

export async function listMetricDefinitions(
  organizationId: string, client?: Db
): Promise<MetricDefinitionRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_customer_metric_definitions")
    .select("id, code, name, description, method, question_stable_key, expects_scale_min, expects_scale_max, top_box_min, unit, direction, formula_note, is_active")
    .eq("organization_id", organizationId).order("name");
  if (error) throw new Error(fail(error, "No se pudieron leer las métricas."));
  return (data ?? []).map((d) => ({
    id: d.id, code: d.code, name: d.name, description: d.description,
    method: d.method as MetricMethod,
    questionStableKey: d.question_stable_key,
    expectsScaleMin: d.expects_scale_min === null ? null : Number(d.expects_scale_min),
    expectsScaleMax: d.expects_scale_max === null ? null : Number(d.expects_scale_max),
    topBoxMin: d.top_box_min === null ? null : Number(d.top_box_min),
    unit: d.unit, direction: d.direction, formulaNote: d.formula_note,
    isActive: Boolean(d.is_active),
  }));
}

export type MetricResultRow = {
  id: string; campaignId: string; campaignName: string;
  definitionId: string; definitionName: string; method: MetricMethod;
  periodLabel: string | null; periodStart: string | null;
  value: number | null; sampleSize: number;
  notApplicable: number; skipped: number;
  distribution: Record<string, unknown> | null;
  comparabilityKey: string;
  /** §37 · true cuando esta medición NO se puede unir con la anterior. */
  breaksComparability: boolean;
  computedAt: string;
};

export async function listMetricSeries(
  organizationId: string,
  filters: { definitionId?: string; campaignId?: string } = {},
  client?: Db
): Promise<MetricResultRow[]> {
  const supabase = await db(client);
  let q = supabase
    .from("v_quality_metric_series")
    .select("*")
    .eq("organization_id", organizationId)
    .order("period_start", { ascending: true, nullsFirst: true })
    .order("computed_at", { ascending: true });
  if (filters.definitionId) q = q.eq("definition_id", filters.definitionId);
  if (filters.campaignId) q = q.eq("campaign_id", filters.campaignId);
  const { data, error } = await q;
  if (error) throw new Error(fail(error, "No se pudo leer la serie de la métrica."));

  const { data: raw } = await supabase
    .from("quality_customer_metric_results")
    .select("id, campaign_id, definition_id, distribution")
    .eq("organization_id", organizationId);

  return (data ?? []).map((r) => {
    const extra = (raw ?? []).find(
      (x) => x.campaign_id === r.campaign_id && x.definition_id === r.definition_id);
    return {
      id: (extra?.id as string) ?? `${r.campaign_id}:${r.definition_id}`,
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      definitionId: r.definition_id,
      definitionName: r.definition_name,
      method: r.method as MetricMethod,
      periodLabel: r.period_label,
      periodStart: r.period_start,
      value: r.value === null || r.value === undefined ? null : Number(r.value),
      sampleSize: Number(r.sample_size ?? 0),
      notApplicable: Number(r.not_applicable ?? 0),
      skipped: Number(r.skipped ?? 0),
      distribution: (extra?.distribution as Record<string, unknown> | null) ?? null,
      comparabilityKey: r.comparability_key,
      breaksComparability: Boolean(r.breaks_comparability),
      computedAt: r.computed_at,
    };
  });
}

// ===========================================================================
// RETROALIMENTACIÓN Y QUEJAS
// ===========================================================================

export type FeedbackRow = {
  id: string;
  customerId: string | null; customerName: string | null;
  contactId: string | null; reporterName: string | null;
  feedbackKind: FeedbackKind; voiceSource: VoiceSource;
  channel: string | null; topicId: string | null; topicName: string | null;
  receivedOn: string; title: string; description: string | null;
  severity: FeedbackSeverity; status: FeedbackStatus;
  ownerPositionId: string | null;
  responseId: string | null; caseId: string | null; caseCode: string | null;
  resolutionNote: string | null; closedAt: string | null;
  /** §32 · Cuando vino de una campaña anónima, ni el cliente ni el nombre
   *  existen — y esta bandera dice por qué. */
  fromAnonymousCampaign: boolean;
};

export async function listFeedback(
  organizationId: string,
  filters: { kind?: string; status?: string; customerId?: string } = {},
  client?: Db
): Promise<FeedbackRow[]> {
  const supabase = await db(client);
  let q = supabase
    .from("quality_customer_feedback")
    .select("id, customer_id, contact_id, reporter_name, feedback_kind, voice_source, channel, topic_id, received_on, title, description, severity, status, owner_position_id, response_id, case_id, resolution_note, closed_at")
    .eq("organization_id", organizationId)
    .order("received_on", { ascending: false });
  if (filters.kind) q = q.eq("feedback_kind", filters.kind);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.customerId) q = q.eq("customer_id", filters.customerId);
  const { data, error } = await q;
  if (error) throw new Error(fail(error, "No se pudo leer la retroalimentación."));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
  const topicIds = [...new Set(rows.map((r) => r.topic_id).filter(Boolean))] as string[];
  const caseIds = [...new Set(rows.map((r) => r.case_id).filter(Boolean))] as string[];
  const responseIds = [...new Set(rows.map((r) => r.response_id).filter(Boolean))] as string[];

  const [customers, topics, cases, responses] = await Promise.all([
    customerIds.length > 0
      ? supabase.from("v_quality_customer_overview").select("profile_id, legal_name")
          .eq("organization_id", organizationId).in("profile_id", customerIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    topicIds.length > 0
      ? supabase.from("quality_customer_topics").select("id, name")
          .eq("organization_id", organizationId).in("id", topicIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    caseIds.length > 0
      ? supabase.from("work_cases").select("id, code")
          .eq("organization_id", organizationId).in("id", caseIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    responseIds.length > 0
      ? supabase.from("quality_survey_responses").select("id, campaign_id")
          .eq("organization_id", organizationId).in("id", responseIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const anonCampaigns = new Set<string>();
  const campaignIds = [...new Set((responses.data ?? []).map((r) => r.campaign_id as string))];
  if (campaignIds.length > 0) {
    const { data: camps } = await supabase
      .from("quality_survey_campaigns").select("id, anonymity_mode")
      .eq("organization_id", organizationId).in("id", campaignIds);
    for (const c of camps ?? []) {
      if (c.anonymity_mode === "anonymous") anonCampaigns.add(c.id as string);
    }
  }
  const responseCampaign = new Map((responses.data ?? []).map(
    (r) => [r.id as string, r.campaign_id as string]));
  const customerName = new Map((customers.data ?? []).map(
    (c) => [c.profile_id as string, c.legal_name as string]));
  const topicName = new Map((topics.data ?? []).map(
    (t) => [t.id as string, t.name as string]));
  const caseCode = new Map((cases.data ?? []).map(
    (c) => [c.id as string, c.code as string]));

  return rows.map((r) => ({
    id: r.id as string,
    customerId: (r.customer_id as string | null) ?? null,
    customerName: r.customer_id ? (customerName.get(r.customer_id as string) ?? null) : null,
    contactId: (r.contact_id as string | null) ?? null,
    reporterName: (r.reporter_name as string | null) ?? null,
    feedbackKind: r.feedback_kind as FeedbackKind,
    voiceSource: r.voice_source as VoiceSource,
    channel: (r.channel as string | null) ?? null,
    topicId: (r.topic_id as string | null) ?? null,
    topicName: r.topic_id ? (topicName.get(r.topic_id as string) ?? null) : null,
    receivedOn: r.received_on as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    severity: r.severity as FeedbackSeverity,
    status: r.status as FeedbackStatus,
    ownerPositionId: (r.owner_position_id as string | null) ?? null,
    responseId: (r.response_id as string | null) ?? null,
    caseId: (r.case_id as string | null) ?? null,
    caseCode: r.case_id ? (caseCode.get(r.case_id as string) ?? null) : null,
    resolutionNote: (r.resolution_note as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
    fromAnonymousCampaign: r.response_id
      ? anonCampaigns.has(responseCampaign.get(r.response_id as string) ?? "")
      : false,
  }));
}

export type TopicRow = { id: string; code: string | null; name: string; isActive: boolean };

export async function listTopics(
  organizationId: string, client?: Db
): Promise<TopicRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_customer_topics").select("id, code, name, is_active")
    .eq("organization_id", organizationId).order("name");
  if (error) throw new Error(fail(error, "No se pudieron leer los temas."));
  return (data ?? []).map((t) => ({
    id: t.id, code: t.code, name: t.name, isActive: Boolean(t.is_active),
  }));
}

// ===========================================================================
// SEÑALES Y CIERRE
// ===========================================================================

export type CustomerSignalRow = {
  id: string; kind: string; detail: string | null;
  status: "open" | "resolved" | "dismissed";
  customerId: string | null; campaignId: string | null;
  definitionId: string | null; feedbackId: string | null;
  firstSeenAt: string; lastSeenAt: string;
};

export async function listCustomerSignals(
  organizationId: string, client?: Db
): Promise<CustomerSignalRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_customer_signals")
    .select("id, signal_kind, detail, status, customer_id, campaign_id, definition_id, feedback_id, first_seen_at, last_seen_at")
    .eq("organization_id", organizationId)
    .order("last_seen_at", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer las señales."));
  return (data ?? []).map((s) => ({
    id: s.id, kind: s.signal_kind, detail: s.detail,
    status: s.status as CustomerSignalRow["status"],
    customerId: s.customer_id, campaignId: s.campaign_id,
    definitionId: s.definition_id, feedbackId: s.feedback_id,
    firstSeenAt: s.first_seen_at, lastSeenAt: s.last_seen_at,
  }));
}

export type VoiceReviewRow = {
  id: string; periodLabel: string; periodStart: string; periodEnd: string;
  scopeNote: string | null; status: "draft" | "closed";
  methodologyNote: string | null; methodologyVerdict: MethodologyVerdict | null;
  conclusions: string | null;
  summarySnapshot: Record<string, unknown> | null;
  ownerPositionId: string | null; closedAt: string | null;
};

export async function listVoiceReviews(
  organizationId: string, client?: Db
): Promise<VoiceReviewRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_customer_voice_reviews")
    .select("id, period_label, period_start, period_end, scope_note, status, methodology_note, methodology_verdict, conclusions, summary_snapshot, owner_position_id, closed_at")
    .eq("organization_id", organizationId)
    .order("period_start", { ascending: false });
  if (error) throw new Error(fail(error, "No se pudieron leer los cierres de periodo."));
  return (data ?? []).map((v) => ({
    id: v.id, periodLabel: v.period_label,
    periodStart: v.period_start, periodEnd: v.period_end,
    scopeNote: v.scope_note, status: v.status as "draft" | "closed",
    methodologyNote: v.methodology_note,
    methodologyVerdict: (v.methodology_verdict as MethodologyVerdict | null) ?? null,
    conclusions: v.conclusions,
    summarySnapshot: (v.summary_snapshot as Record<string, unknown> | null) ?? null,
    ownerPositionId: v.owner_position_id, closedAt: v.closed_at,
  }));
}

/** §91 · Lo que Quality Home necesita saber, y nada más. */
export type CustomerVoiceSignals = {
  openComplaints: number;
  unreviewedComplaints: number;
  campaignsClosingSoon: number;
  openSignals: number;
  satisfactionDrops: number;
};

export async function getCustomerVoiceHomeSignals(
  organizationId: string, client?: Db
): Promise<CustomerVoiceSignals> {
  const supabase = await db(client);
  const [feedback, campaigns, signals] = await Promise.all([
    supabase.from("quality_customer_feedback")
      .select("status, feedback_kind, received_on")
      .eq("organization_id", organizationId)
      .in("feedback_kind", ["complaint", "claim"]),
    supabase.from("quality_survey_campaigns")
      .select("closes_on").eq("organization_id", organizationId).eq("status", "open"),
    supabase.from("quality_customer_signals")
      .select("signal_kind").eq("organization_id", organizationId).eq("status", "open"),
  ]);
  const today = todayIso();
  const inAWeek = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const fb = feedback.data ?? [];
  return {
    openComplaints: fb.filter((f) => f.status === "open" || f.status === "under_review").length,
    unreviewedComplaints: fb.filter((f) => f.status === "open").length,
    campaignsClosingSoon: (campaigns.data ?? []).filter(
      (c) => c.closes_on !== null && c.closes_on >= today && c.closes_on <= inAWeek).length,
    openSignals: (signals.data ?? []).length,
    satisfactionDrops: (signals.data ?? []).filter(
      (s) => s.signal_kind === "satisfaction_drop").length,
  };
}

// ===========================================================================
// ESCRITURA
// ---------------------------------------------------------------------------
// Lo que solo REGISTRA es escritura normal bajo RLS. Lo que crea HISTORIA
// —publicar, abrir, cerrar, invitar, enviar, calcular, escalar— pasa por su
// RPC. Y las RESPUESTAS no se escriben desde aquí en ningún caso.
// ===========================================================================

export async function createCustomerFromParty(
  organizationId: string,
  input: { partyId: string; segment: string | null; ownerPositionId: string | null },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  // El papel de cliente en la identidad externa: si ya lo tenía, no se duplica.
  const { data: existing } = await supabase
    .from("quality_external_party_roles").select("id")
    .eq("organization_id", organizationId).eq("party_id", input.partyId)
    .eq("role_code", "customer").maybeSingle();
  if (!existing) {
    const { error } = await supabase.from("quality_external_party_roles").insert({
      organization_id: organizationId, party_id: input.partyId, role_code: "customer",
    });
    if (error) throw new Error(fail(error, "No se pudo dar el papel de cliente."));
  }

  const { data, error } = await supabase
    .from("quality_customer_profiles")
    .insert({
      organization_id: organizationId, party_id: input.partyId,
      segment: input.segment, owner_position_id: input.ownerPositionId,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar el cliente."));
  return data!.id as string;
}

export async function createCustomer(
  organizationId: string,
  input: {
    legalName: string; tradeName: string | null; taxId: string | null;
    country: string | null; city: string | null;
    segment: string | null; ownerPositionId: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data: party, error: e1 } = await supabase
    .from("quality_external_parties")
    .insert({
      organization_id: organizationId, legal_name: input.legalName,
      trade_name: input.tradeName, tax_id: input.taxId,
      country: input.country, city: input.city,
    })
    .select("id").single();
  if (e1 || !party) throw new Error(fail(e1, "No se pudo registrar la empresa."));
  return createCustomerFromParty(organizationId, {
    partyId: party.id as string, segment: input.segment,
    ownerPositionId: input.ownerPositionId,
  }, supabase);
}

export async function updateCustomer(
  organizationId: string, profileId: string,
  input: { relationshipStatus: CustomerRelationshipStatus; segment: string | null;
           ownerPositionId: string | null },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_customer_profiles")
    .update({
      relationship_status: input.relationshipStatus,
      segment: input.segment, owner_position_id: input.ownerPositionId,
    })
    .eq("organization_id", organizationId).eq("id", profileId);
  if (error) throw new Error(fail(error, "No se pudo actualizar el cliente."));
}

export async function retireCustomer(
  organizationId: string, profileId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_customer_profiles")
    .update({ relationship_status: "retired" })
    .eq("organization_id", organizationId).eq("id", profileId);
  if (error) throw new Error(fail(error, "No se pudo retirar el cliente."));
}

export async function deleteCustomer(
  organizationId: string, profileId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_customer_profiles").delete()
    .eq("organization_id", organizationId).eq("id", profileId);
  if (error) throw new Error(fail(error, "No se pudo eliminar el cliente."));
}

export async function createContact(
  organizationId: string, partyId: string,
  input: { fullName: string; roleTitle: string | null; email: string | null;
           phone: string | null },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_external_party_contacts").insert({
    organization_id: organizationId, party_id: partyId,
    full_name: input.fullName, role_title: input.roleTitle,
    email: input.email, phone: input.phone,
  });
  if (error) throw new Error(fail(error, "No se pudo registrar el contacto."));
}

// --------------------------------------------------------------------------
// Encuestas
// --------------------------------------------------------------------------

export async function createSurvey(
  organizationId: string,
  input: { name: string; code: string | null; description: string | null;
           purpose: string | null; ownerPositionId: string | null },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_surveys")
    .insert({
      organization_id: organizationId, name: input.name, code: input.code,
      description: input.description, purpose: input.purpose,
      owner_position_id: input.ownerPositionId,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la encuesta."));

  // Nace con su primera versión en borrador: una encuesta sin versión no sirve
  // para nada y obligar a crearla aparte es un paso vacío.
  const { error: e2 } = await supabase.from("quality_survey_versions").insert({
    organization_id: organizationId, survey_id: data!.id,
    version_number: 1, change_note: "Versión inicial",
  });
  if (e2) throw new Error(fail(e2, "No se pudo crear la primera versión."));
  return data!.id as string;
}

export async function createSurveyVersion(
  organizationId: string, surveyId: string, changeNote: string | null, client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data: last } = await supabase
    .from("quality_survey_versions").select("version_number, id")
    .eq("organization_id", organizationId).eq("survey_id", surveyId)
    .order("version_number", { ascending: false }).limit(1).maybeSingle();

  const next = last ? Number(last.version_number) + 1 : 1;
  const { data, error } = await supabase
    .from("quality_survey_versions")
    .insert({
      organization_id: organizationId, survey_id: surveyId,
      version_number: next, change_note: changeNote,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la versión."));

  // Se copian las preguntas de la versión anterior como punto de partida:
  // empezar de cero invita a reescribir una encuesta que ya funcionaba, y con
  // ella la clave estable que hace comparables las series.
  if (last) {
    const { data: prev } = await supabase
      .from("quality_survey_questions")
      .select("stable_key, label, help_text, question_type, is_required, allows_not_applicable, scale_min, scale_max, scale_step, scale_min_label, scale_max_label, options, position_order, topic_id")
      .eq("organization_id", organizationId).eq("version_id", last.id)
      .order("position_order");
    if ((prev ?? []).length > 0) {
      const { error: e2 } = await supabase.from("quality_survey_questions").insert(
        (prev ?? []).map((q) => ({ ...q, organization_id: organizationId, version_id: data!.id }))
      );
      if (e2) throw new Error(fail(e2, "No se pudieron copiar las preguntas."));
    }
  }
  return data!.id as string;
}

export async function addQuestion(
  organizationId: string, versionId: string,
  input: {
    stableKey: string; label: string; helpText: string | null;
    questionType: QuestionType; isRequired: boolean; allowsNotApplicable: boolean;
    scaleMin: number | null; scaleMax: number | null; scaleStep: number | null;
    scaleMinLabel: string | null; scaleMaxLabel: string | null;
    options: { key: string; label: string }[] | null;
    order: number; topicId: string | null;
  },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_survey_questions").insert({
    organization_id: organizationId, version_id: versionId,
    stable_key: input.stableKey, label: input.label, help_text: input.helpText,
    question_type: input.questionType, is_required: input.isRequired,
    allows_not_applicable: input.allowsNotApplicable,
    scale_min: input.scaleMin, scale_max: input.scaleMax, scale_step: input.scaleStep,
    scale_min_label: input.scaleMinLabel, scale_max_label: input.scaleMaxLabel,
    options: input.options, position_order: input.order, topic_id: input.topicId,
  });
  if (error) throw new Error(fail(error, "No se pudo añadir la pregunta."));
}

export async function deleteQuestion(
  organizationId: string, questionId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_survey_questions").delete()
    .eq("organization_id", organizationId).eq("id", questionId);
  if (error) throw new Error(fail(error, "No se pudo quitar la pregunta."));
}

export async function publishSurveyVersion(
  versionId: string, effectiveFrom: string, changeNote: string | null, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_publish_survey_version", {
    p_version_id: versionId, p_effective_from: effectiveFrom, p_change_note: changeNote,
  });
  if (error) throw new Error(fail(error, "No se pudo publicar la versión."));
}

export async function retireSurvey(
  organizationId: string, surveyId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_surveys")
    .update({ is_active: false, retired_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("id", surveyId);
  if (error) throw new Error(fail(error, "No se pudo retirar la encuesta."));
}

export async function deleteSurvey(
  organizationId: string, surveyId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_surveys").delete()
    .eq("organization_id", organizationId).eq("id", surveyId);
  if (error) throw new Error(fail(error, "No se pudo eliminar la encuesta."));
}

// --------------------------------------------------------------------------
// Campañas
// --------------------------------------------------------------------------

export async function createCampaign(
  organizationId: string,
  input: {
    surveyId: string; versionId: string; name: string; code: string | null;
    description: string | null; voiceSource: VoiceSource;
    anonymityMode: AnonymityMode;
    periodLabel: string | null; periodStart: string | null; periodEnd: string | null;
    opensOn: string | null; closesOn: string | null;
    ownerPositionId: string | null; populationSize: number | null;
    audienceNote: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_survey_campaigns")
    .insert({
      organization_id: organizationId, survey_id: input.surveyId,
      version_id: input.versionId, name: input.name, code: input.code,
      description: input.description, voice_source: input.voiceSource,
      anonymity_mode: input.anonymityMode,
      period_label: input.periodLabel, period_start: input.periodStart,
      period_end: input.periodEnd, opens_on: input.opensOn, closes_on: input.closesOn,
      owner_position_id: input.ownerPositionId,
      population_size: input.populationSize, audience_note: input.audienceNote,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo crear la campaña."));
  return data!.id as string;
}

export async function openCampaign(campaignId: string, client?: Db): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_open_survey_campaign", {
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(fail(error, "No se pudo abrir la campaña."));
}

export async function closeCampaign(
  campaignId: string, note: string | null, client?: Db
): Promise<{ responses: number; invited: number; responseRate: number | null;
             responseRateBasis: string | null }> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_close_survey_campaign", {
    p_campaign_id: campaignId, p_note: note,
  });
  if (error) throw new Error(fail(error, "No se pudo cerrar la campaña."));
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    responses: Number(r.responses ?? 0),
    invited: Number(r.invited ?? 0),
    responseRate: r.response_rate === null || r.response_rate === undefined
      ? null : Number(r.response_rate),
    responseRateBasis: (r.response_rate_basis as string | null) ?? null,
  };
}

export async function reopenCampaign(
  campaignId: string, reason: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("quality_reopen_survey_campaign", {
    p_campaign_id: campaignId, p_reason: reason,
  });
  if (error) throw new Error(fail(error, "No se pudo reabrir la campaña."));
}

/** §66 · Devuelve el token UNA vez. Quien lo llama es responsable de
 *  entregarlo; la base ya no lo puede reconstruir. */
export async function issueInvitation(
  input: { campaignId: string; customerId: string | null; contactId: string | null;
           email: string | null; expiresAt: string | null },
  client?: Db
): Promise<{ invitationId: string; token: string; prefix: string }> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_issue_survey_invitation", {
    p_campaign_id: input.campaignId,
    p_customer_id: input.customerId,
    p_contact_id: input.contactId,
    p_email: input.email,
    p_expires_at: input.expiresAt,
  });
  if (error) throw new Error(fail(error, "No se pudo emitir el enlace."));
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    invitationId: r.invitation_id as string,
    token: r.token as string,
    prefix: r.prefix as string,
  };
}

export async function revokeInvitation(
  organizationId: string, invitationId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_survey_invitations")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("id", invitationId);
  if (error) throw new Error(fail(error, "No se pudo revocar el enlace."));
}

export async function computeCampaignMetrics(
  campaignId: string, client?: Db
): Promise<{ definition: string; value: number | null; sampleSize: number }[]> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_compute_campaign_metrics", {
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(fail(error, "No se pudieron calcular las métricas."));
  const r = (data ?? {}) as Record<string, unknown>;
  return ((r.results as Record<string, unknown>[]) ?? []).map((x) => ({
    definition: x.definition as string,
    value: x.value === null || x.value === undefined ? null : Number(x.value),
    sampleSize: Number(x.sample_size ?? 0),
  }));
}

// --------------------------------------------------------------------------
// Métricas, retroalimentación, quejas y cierre
// --------------------------------------------------------------------------

export async function createMetricDefinition(
  organizationId: string,
  input: {
    name: string; code: string | null; description: string | null;
    method: MetricMethod; questionStableKey: string | null;
    expectsScaleMin: number | null; expectsScaleMax: number | null;
    topBoxMin: number | null; unit: string; direction: string;
    formulaNote: string | null;
  },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_customer_metric_definitions").insert({
    organization_id: organizationId, name: input.name, code: input.code,
    description: input.description, method: input.method,
    question_stable_key: input.questionStableKey,
    expects_scale_min: input.expectsScaleMin, expects_scale_max: input.expectsScaleMax,
    top_box_min: input.topBoxMin, unit: input.unit, direction: input.direction,
    formula_note: input.formulaNote,
  });
  if (error) throw new Error(fail(error, "No se pudo crear la métrica."));
}

export async function createTopic(
  organizationId: string, input: { name: string; code: string | null }, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase.from("quality_customer_topics").insert({
    organization_id: organizationId, name: input.name, code: input.code,
  });
  if (error) throw new Error(fail(error, "No se pudo crear el tema."));
}

export async function recordFeedback(
  organizationId: string,
  input: {
    customerId: string | null; contactId: string | null; reporterName: string | null;
    feedbackKind: FeedbackKind; voiceSource: VoiceSource; channel: string | null;
    topicId: string | null; receivedOn: string; title: string;
    description: string | null; severity: FeedbackSeverity;
    ownerPositionId: string | null; responseId: string | null;
  },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_customer_feedback")
    .insert({
      organization_id: organizationId,
      customer_id: input.customerId, contact_id: input.contactId,
      reporter_name: input.reporterName,
      feedback_kind: input.feedbackKind, voice_source: input.voiceSource,
      channel: input.channel, topic_id: input.topicId,
      received_on: input.receivedOn, title: input.title,
      description: input.description, severity: input.severity,
      owner_position_id: input.ownerPositionId, response_id: input.responseId,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo registrar la manifestación."));
  return data!.id as string;
}

export async function updateFeedbackStatus(
  organizationId: string, feedbackId: string,
  input: { status: FeedbackStatus; resolutionNote: string | null },
  client?: Db
): Promise<void> {
  const supabase = await db(client);
  const closing = input.status === "closed" || input.status === "dismissed";
  const { error } = await supabase
    .from("quality_customer_feedback")
    .update({
      status: input.status,
      resolution_note: input.resolutionNote,
      answered_at: input.status === "answered" ? new Date().toISOString() : undefined,
      closed_at: closing ? new Date().toISOString() : null,
    })
    .eq("organization_id", organizationId).eq("id", feedbackId);
  if (error) throw new Error(fail(error, "No se pudo actualizar la manifestación."));
}

/** §31 · Escalar es una DECISIÓN, y por eso vive en su propia RPC. El caso nace
 *  sin clasificar: que un cliente se queje no lo convierte en no conformidad. */
export async function openCaseFromFeedback(
  feedbackId: string, title: string | null, description: string | null, client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_open_case_from_customer_feedback", {
    p_feedback_id: feedbackId, p_title: title, p_description: description,
  });
  if (error) throw new Error(fail(error, "No se pudo abrir el caso."));
  return data as string;
}

export async function createVoiceReview(
  organizationId: string,
  input: { periodLabel: string; periodStart: string; periodEnd: string;
           scopeNote: string | null; methodologyNote: string | null;
           ownerPositionId: string | null },
  client?: Db
): Promise<string> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_customer_voice_reviews")
    .insert({
      organization_id: organizationId, period_label: input.periodLabel,
      period_start: input.periodStart, period_end: input.periodEnd,
      scope_note: input.scopeNote, methodology_note: input.methodologyNote,
      owner_position_id: input.ownerPositionId,
    })
    .select("id").single();
  if (error) throw new Error(fail(error, "No se pudo abrir el periodo."));
  return data!.id as string;
}

export async function closeVoiceReview(
  reviewId: string, verdict: MethodologyVerdict, conclusions: string, client?: Db
): Promise<Record<string, unknown>> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_close_customer_voice_review", {
    p_review_id: reviewId, p_verdict: verdict, p_conclusions: conclusions,
  });
  if (error) throw new Error(fail(error, "No se pudo cerrar el periodo."));
  return (data ?? {}) as Record<string, unknown>;
}

export async function dismissCustomerSignal(
  organizationId: string, signalId: string, client?: Db
): Promise<void> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("quality_customer_signals")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("organization_id", organizationId).eq("id", signalId);
  if (error) throw new Error(fail(error, "No se pudo descartar la señal."));
}

export async function scanCustomerVoice(
  organizationId: string, client?: Db
): Promise<number> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_scan_customer_voice", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(fail(error, "No se pudo revisar la voz del cliente."));
  return Number(data ?? 0);
}
