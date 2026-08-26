"use server";

import { revalidatePath } from "next/cache";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  addQuestion, closeCampaign, closeVoiceReview, computeCampaignMetrics, createCampaign,
  createContact, createCustomer, createCustomerFromParty, createMetricDefinition,
  createSurvey, createSurveyVersion, createTopic, createVoiceReview, deleteCustomer,
  deleteQuestion, deleteSurvey, dismissCustomerSignal, issueInvitation,
  openCaseFromFeedback, openCampaign, publishSurveyVersion, recordFeedback,
  reopenCampaign, retireCustomer, retireSurvey, revokeInvitation, scanCustomerVoice,
  updateCustomer, updateFeedbackStatus,
} from "@/lib/db/quality-customer-voice";
import {
  ANONYMITY_MODES, canCloseCustomerVoice, canManageCustomerVoice,
  CUSTOMER_RELATIONSHIP_STATUSES, FEEDBACK_KINDS, FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES, METHODOLOGY_VERDICTS, METRIC_METHODS, QUESTION_TYPES,
  VOICE_SOURCES,
} from "@/lib/domain/quality-customer-voice";

/**
 * Trazaloop · QUALITY-08 · Acciones de servidor de la Voz del Cliente.
 *
 * EL REPARTO
 *
 * · Lo que solo REGISTRA —un cliente, un contacto, una manifestación, un tema,
 *   una definición de métrica— es escritura normal bajo RLS.
 * · Lo que crea HISTORIA —publicar una versión, abrir o cerrar una campaña,
 *   emitir un enlace, calcular métricas, escalar una queja, cerrar el periodo—
 *   pasa por una RPC de 0126.
 *
 * LO QUE NINGUNA DE ESTAS FUNCIONES HACE
 *
 * Ninguna convierte una queja en una no conformidad. Ninguna abre un caso al
 * registrar una queja. Ninguna crea un riesgo porque una métrica baje. Ninguna
 * escribe una respuesta de encuesta —eso solo ocurre por la puerta pública, que
 * es donde vive la regla del anonimato—. Y ninguna puede atribuir una respuesta
 * anónima a un cliente: la base lo impediría igual.
 */

export type VoiceActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
  id?: string;
  /** §66 · El enlace recién emitido. Viaja UNA vez hasta la pantalla y no se
   *  guarda en ninguna parte: la base solo tiene su hash. */
  token?: string;
};

const OK: VoiceActionState = { error: null, success: true, message: null };

type Gate = { organizationId: string; roleCode: string; userId: string };

async function gate(): Promise<{ ok: Gate | null; error: string | null }> {
  const access = await requireQualityForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutate = await checkQualityCanMutate();
  if (!mutate.allowed) return { ok: null, error: mutate.error };
  const { user } = await requireSession();
  return {
    ok: {
      organizationId: access.org.organizationId,
      roleCode: access.org.roleCode,
      userId: user.id,
    },
    error: null,
  };
}

function text(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}
function optional(form: FormData, name: string): string | null {
  const v = text(form, name);
  return v.length > 0 ? v : null;
}
function bool(form: FormData, name: string): boolean {
  return form.get(name) === "on" || form.get(name) === "true";
}
function num(form: FormData, name: string): number | null {
  const v = text(form, name);
  if (v.length === 0) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pick<T extends readonly string[]>(
  form: FormData, name: string, allowed: T, fallback?: T[number]
): T[number] | null {
  const v = text(form, name);
  if ((allowed as readonly string[]).includes(v)) return v as T[number];
  return fallback ?? null;
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function revalidateVoice(extra?: string) {
  revalidatePath("/quality");
  revalidatePath("/quality/customer-voice");
  revalidatePath("/quality/customer-voice/surveys");
  revalidatePath("/quality/customer-voice/campaigns");
  revalidatePath("/quality/customer-voice/feedback");
  revalidatePath("/quality/tasks");
  if (extra) revalidatePath(extra);
}

async function run(
  fn: () => Promise<void | string>,
  after: () => void,
  message: string
): Promise<VoiceActionState> {
  try {
    const id = await fn();
    after();
    return { ...OK, message, id: typeof id === "string" ? id : undefined };
  } catch (e) {
    // El mensaje viene de la base y ya está escrito para una persona: si dice
    // «esta campaña es anónima: su respuesta no puede llevar cliente», eso es
    // exactamente lo que hay que leer.
    return { error: e instanceof Error ? e.message : "No se pudo completar la operación." };
  }
}

// ---------------------------------------------------------------------------
// Clientes (VC-03, §5, §6)
// ---------------------------------------------------------------------------

export async function createCustomerAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar clientes." };
  }
  const legalName = text(formData, "legal_name");
  if (legalName.length < 2) return { error: "Escribe la razón social del cliente." };

  return run(
    () => createCustomer(g.ok!.organizationId, {
      legalName,
      tradeName: optional(formData, "trade_name"),
      taxId: optional(formData, "tax_id"),
      country: optional(formData, "country"),
      city: optional(formData, "city"),
      segment: optional(formData, "segment"),
      ownerPositionId: optional(formData, "owner_position_id"),
    }),
    () => revalidateVoice(),
    "Cliente registrado."
  );
}

/** §5 · Dar el papel de cliente a una empresa que YA existe —normalmente
 *  porque es proveedor—. Es lo que impide el duplicado. */
export async function adoptCustomerAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar clientes." };
  }
  const partyId = text(formData, "party_id");
  if (!partyId) return { error: "Falta la empresa." };

  return run(
    () => createCustomerFromParty(g.ok!.organizationId, {
      partyId,
      segment: optional(formData, "segment"),
      ownerPositionId: optional(formData, "owner_position_id"),
    }),
    () => revalidateVoice(),
    "Cliente registrado sobre la empresa que ya existía. Es la MISMA identidad: "
      + "no se creó ninguna ficha nueva."
  );
}

export async function updateCustomerAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar clientes." };
  }
  const profileId = text(formData, "profile_id");
  if (!profileId) return { error: "Falta el cliente." };

  return run(
    () => updateCustomer(g.ok!.organizationId, profileId, {
      relationshipStatus: pick(formData, "relationship_status",
        CUSTOMER_RELATIONSHIP_STATUSES, "active")!,
      segment: optional(formData, "segment"),
      ownerPositionId: optional(formData, "owner_position_id"),
    }),
    () => revalidateVoice(`/quality/customer-voice/customers/${profileId}`),
    "Cliente actualizado."
  );
}

export async function retireCustomerAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite retirar clientes." };
  }
  const profileId = text(formData, "profile_id");
  if (!profileId) return { error: "Falta el cliente." };

  return run(
    () => retireCustomer(g.ok!.organizationId, profileId),
    () => revalidateVoice(`/quality/customer-voice/customers/${profileId}`),
    "Cliente retirado. La empresa sigue existiendo: lo que termina es la relación comercial."
  );
}

export async function deleteCustomerAction(
  _prev: { error: string | null }, formData: FormData
): Promise<{ error: string | null }> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite eliminar clientes." };
  }
  const profileId = text(formData, "profile_id");
  if (!profileId) return { error: "Falta el cliente." };
  try {
    await deleteCustomer(g.ok.organizationId, profileId);
    revalidateVoice();
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar." };
  }
}

export async function createContactAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar contactos." };
  }
  const partyId = text(formData, "party_id");
  const fullName = text(formData, "full_name");
  if (!partyId) return { error: "Falta la empresa." };
  if (fullName.length < 2) return { error: "Escribe el nombre del contacto." };

  return run(
    () => createContact(g.ok!.organizationId, partyId, {
      fullName,
      roleTitle: optional(formData, "role_title"),
      email: optional(formData, "email"),
      phone: optional(formData, "phone"),
    }),
    () => revalidateVoice(`/quality/customer-voice/customers/${text(formData, "profile_id")}`),
    "Contacto registrado. Un cliente puede tener varios, y cambiarlos no borra "
      + "nada de lo que ya dijo."
  );
}

// ---------------------------------------------------------------------------
// Encuestas y versiones (VC-07, §9, §10, §11)
// ---------------------------------------------------------------------------

export async function createSurveyAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear encuestas." };
  }
  const name = text(formData, "name");
  if (name.length < 3) return { error: "Ponle nombre a la encuesta." };

  return run(
    () => createSurvey(g.ok!.organizationId, {
      name,
      code: optional(formData, "code"),
      description: optional(formData, "description"),
      purpose: optional(formData, "purpose"),
      ownerPositionId: optional(formData, "owner_position_id"),
    }),
    () => revalidateVoice(),
    "Encuesta creada con su primera versión en borrador. Añade preguntas y publícala."
  );
}

export async function createVersionAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite versionar encuestas." };
  }
  const surveyId = text(formData, "survey_id");
  if (!surveyId) return { error: "Falta la encuesta." };

  return run(
    () => createSurveyVersion(g.ok!.organizationId, surveyId, optional(formData, "change_note")),
    () => revalidateVoice(),
    "Versión nueva en borrador, con las preguntas de la anterior como punto de "
      + "partida. Las respuestas ya recogidas siguen con su versión."
  );
}

export async function addQuestionAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar encuestas." };
  }
  const versionId = text(formData, "version_id");
  const label = text(formData, "label");
  const stableKey = text(formData, "stable_key");
  if (!versionId) return { error: "Falta la versión." };
  if (label.length < 3) return { error: "Escribe la pregunta." };
  if (!/^[a-z0-9_.-]{2,60}$/.test(stableKey)) {
    return {
      error: "La clave estable identifica esta pregunta a través de las versiones. "
        + "Usa minúsculas, números, guiones o puntos (por ejemplo: entrega.puntualidad).",
    };
  }

  const questionType = pick(formData, "question_type", QUESTION_TYPES, "scale")!;
  const scaleMin = num(formData, "scale_min");
  const scaleMax = num(formData, "scale_max");
  if (questionType === "scale" && (scaleMin === null || scaleMax === null || scaleMax <= scaleMin)) {
    return { error: "Una escala necesita un mínimo y un máximo, y el máximo tiene que ser mayor." };
  }

  let options: { key: string; label: string }[] | null = null;
  if (questionType === "single_choice" || questionType === "multiple_choice") {
    const raw = text(formData, "options");
    const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) {
      return { error: "Una pregunta de opciones necesita al menos dos, una por línea." };
    }
    options = lines.map((l, i) => ({ key: `o${i + 1}`, label: l }));
  }

  return run(
    () => addQuestion(g.ok!.organizationId, versionId, {
      stableKey, label,
      helpText: optional(formData, "help_text"),
      questionType,
      isRequired: bool(formData, "is_required"),
      allowsNotApplicable: bool(formData, "allows_not_applicable"),
      scaleMin, scaleMax,
      scaleStep: num(formData, "scale_step"),
      scaleMinLabel: optional(formData, "scale_min_label"),
      scaleMaxLabel: optional(formData, "scale_max_label"),
      options,
      order: num(formData, "position_order") ?? 1,
      topicId: optional(formData, "topic_id"),
    }),
    () => revalidateVoice(),
    "Pregunta añadida."
  );
}

export async function deleteQuestionAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar encuestas." };
  }
  const questionId = text(formData, "question_id");
  if (!questionId) return { error: "Falta la pregunta." };

  return run(
    () => deleteQuestion(g.ok!.organizationId, questionId),
    () => revalidateVoice(),
    "Pregunta quitada del borrador."
  );
}

export async function publishVersionAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const versionId = text(formData, "version_id");
  if (!versionId) return { error: "Falta la versión." };

  return run(
    () => publishSurveyVersion(
      versionId, optional(formData, "effective_from") ?? todayIso(),
      optional(formData, "change_note")
    ),
    () => revalidateVoice(),
    "Versión publicada. A partir de aquí no se reescribe: las respuestas que "
      + "reciba se interpretarán siempre con estas preguntas."
  );
}

export async function retireSurveyAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite retirar encuestas." };
  }
  const surveyId = text(formData, "survey_id");
  if (!surveyId) return { error: "Falta la encuesta." };

  return run(
    () => retireSurvey(g.ok!.organizationId, surveyId),
    () => revalidateVoice(),
    "Encuesta retirada. Deja de usarse y todo lo que produjo sigue consultable."
  );
}

export async function deleteSurveyAction(
  _prev: { error: string | null }, formData: FormData
): Promise<{ error: string | null }> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite eliminar encuestas." };
  }
  const surveyId = text(formData, "survey_id");
  if (!surveyId) return { error: "Falta la encuesta." };
  try {
    await deleteSurvey(g.ok.organizationId, surveyId);
    revalidateVoice();
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo eliminar." };
  }
}

// ---------------------------------------------------------------------------
// Campañas (VC-26, §17, §18, §23)
// ---------------------------------------------------------------------------

export async function createCampaignAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear campañas." };
  }
  const surveyId = text(formData, "survey_id");
  const versionId = text(formData, "version_id");
  const name = text(formData, "name");
  if (!surveyId || !versionId) return { error: "Falta la encuesta o su versión." };
  if (name.length < 3) return { error: "Ponle nombre a la campaña." };

  const population = num(formData, "population_size");
  if (population !== null && population <= 0) {
    return {
      error: "Si declaras a cuántos vas a preguntar, tiene que ser un número mayor que cero. "
        + "Déjalo en blanco si no lo sabes: sin denominador no se calcula tasa de respuesta.",
    };
  }

  return run(
    () => createCampaign(g.ok!.organizationId, {
      surveyId, versionId, name,
      code: optional(formData, "code"),
      description: optional(formData, "description"),
      voiceSource: pick(formData, "voice_source", VOICE_SOURCES, "periodic")!,
      anonymityMode: pick(formData, "anonymity_mode", ANONYMITY_MODES, "identified")!,
      periodLabel: optional(formData, "period_label"),
      periodStart: optional(formData, "period_start"),
      periodEnd: optional(formData, "period_end"),
      opensOn: optional(formData, "opens_on"),
      closesOn: optional(formData, "closes_on"),
      ownerPositionId: optional(formData, "owner_position_id"),
      populationSize: population,
      audienceNote: optional(formData, "audience_note"),
    }),
    () => revalidateVoice(),
    "Campaña creada en borrador. El anonimato ya no se puede cambiar una vez "
      + "abras la campaña o invites a alguien."
  );
}

export async function openCampaignAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const campaignId = text(formData, "campaign_id");
  if (!campaignId) return { error: "Falta la campaña." };

  return run(
    () => openCampaign(campaignId),
    () => revalidateVoice(`/quality/customer-voice/campaigns/${campaignId}`),
    "Campaña abierta. Ya se pueden emitir enlaces y recibir respuestas."
  );
}

export async function closeCampaignAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const campaignId = text(formData, "campaign_id");
  if (!campaignId) return { error: "Falta la campaña." };

  try {
    const outcome = await closeCampaign(campaignId, optional(formData, "note"));
    revalidateVoice(`/quality/customer-voice/campaigns/${campaignId}`);
    // §38/§39 · Se dice cuántas respuestas hubo. La tasa SOLO si hay
    // denominador de verdad, y diciendo cuál es.
    const tasa = outcome.responseRate === null
      ? "No se puede calcular tasa de respuesta: no se sabe a cuántos se preguntó."
      : `Tasa de respuesta: ${outcome.responseRate} % `
        + `(sobre ${outcome.responseRateBasis === "population" ? "la población declarada" : "los enlaces enviados"}).`;
    const cero = outcome.responses === 0
      ? " Cero respuestas no es cero satisfacción: es que nadie contestó."
      : "";
    return {
      ...OK,
      message: `Campaña cerrada con ${outcome.responses} respuesta`
        + `${outcome.responses === 1 ? "" : "s"}. ${tasa}${cero}`
        + " Cerrar no mide nada por sí solo: las métricas se calculan aparte.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cerrar la campaña." };
  }
}

export async function reopenCampaignAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canCloseCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite reabrir una campaña cerrada." };
  }
  const campaignId = text(formData, "campaign_id");
  const reason = text(formData, "reason");
  if (!campaignId) return { error: "Falta la campaña." };
  if (reason.length < 5) return { error: "Reabrir una campaña cerrada exige decir por qué." };

  return run(
    () => reopenCampaign(campaignId, reason),
    () => revalidateVoice(`/quality/customer-voice/campaigns/${campaignId}`),
    "Campaña reabierta, con el motivo registrado. Queda constancia de que se reabrió."
  );
}

/** §66 · El enlace se devuelve UNA vez. Si se pierde, se emite otro: la base
 *  guarda solo su hash y nadie puede reconstruirlo. */
export async function issueInvitationAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite emitir enlaces." };
  }
  const campaignId = text(formData, "campaign_id");
  if (!campaignId) return { error: "Falta la campaña." };

  try {
    const invitation = await issueInvitation({
      campaignId,
      customerId: optional(formData, "customer_id"),
      contactId: optional(formData, "contact_id"),
      email: optional(formData, "email"),
      expiresAt: optional(formData, "expires_at"),
    });
    revalidateVoice(`/quality/customer-voice/campaigns/${campaignId}`);
    return {
      ...OK,
      token: invitation.token,
      message: "Enlace emitido. Cópialo ahora: el sistema guarda solo su huella y "
        + "no podrá volver a mostrártelo.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo emitir el enlace." };
  }
}

export async function revokeInvitationAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite revocar enlaces." };
  }
  const invitationId = text(formData, "invitation_id");
  if (!invitationId) return { error: "Falta el enlace." };

  return run(
    () => revokeInvitation(g.ok!.organizationId, invitationId),
    () => revalidateVoice(`/quality/customer-voice/campaigns/${text(formData, "campaign_id")}`),
    "Enlace revocado. Deja de servir en el mismo momento."
  );
}

export async function computeMetricsAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const campaignId = text(formData, "campaign_id");
  if (!campaignId) return { error: "Falta la campaña." };

  try {
    const results = await computeCampaignMetrics(campaignId);
    revalidateVoice(`/quality/customer-voice/campaigns/${campaignId}`);
    const conValor = results.filter((r) => r.value !== null);
    const detalle = conValor.length > 0
      ? conValor.map((r) => `${r.definition}: ${r.value} (${r.sampleSize} respuestas)`).join(" · ")
      : "Ninguna métrica se pudo calcular con las respuestas recibidas.";
    return {
      ...OK,
      message: `${detalle} Un resultado NO es una decisión: no abre casos, no `
        + "clasifica no conformidades y no crea riesgos.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron calcular las métricas." };
  }
}

// ---------------------------------------------------------------------------
// Retroalimentación y quejas (VC-16, VC-30, §28, §30, §31)
// ---------------------------------------------------------------------------

export async function recordFeedbackAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar la voz del cliente." };
  }
  const title = text(formData, "title");
  if (title.length < 3) return { error: "Escribe qué dijo el cliente." };

  const kind = pick(formData, "feedback_kind", FEEDBACK_KINDS, "comment")!;

  return run(
    () => recordFeedback(g.ok!.organizationId, {
      customerId: optional(formData, "customer_id"),
      contactId: optional(formData, "contact_id"),
      reporterName: optional(formData, "reporter_name"),
      feedbackKind: kind,
      voiceSource: pick(formData, "voice_source", VOICE_SOURCES, "spontaneous")!,
      channel: optional(formData, "channel"),
      topicId: optional(formData, "topic_id"),
      receivedOn: optional(formData, "received_on") ?? todayIso(),
      title,
      description: optional(formData, "description"),
      severity: pick(formData, "severity", FEEDBACK_SEVERITIES, "normal")!,
      ownerPositionId: optional(formData, "owner_position_id"),
      responseId: optional(formData, "response_id"),
    }),
    () => revalidateVoice(),
    // §30 · La frase obligatoria, exactamente donde se produce la confusión.
    kind === "complaint" || kind === "claim"
      ? "Queja registrada. NO es una no conformidad y no ha abierto ningún caso: "
        + "si merece tratamiento, abrir un caso es una decisión aparte."
      : "Registrado. Una sugerencia o una felicitación también son voz del cliente."
  );
}

export async function updateFeedbackStatusAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite atender la voz del cliente." };
  }
  const feedbackId = text(formData, "feedback_id");
  if (!feedbackId) return { error: "Falta la manifestación." };

  return run(
    () => updateFeedbackStatus(g.ok!.organizationId, feedbackId, {
      status: pick(formData, "status", FEEDBACK_STATUSES, "under_review")!,
      resolutionNote: optional(formData, "resolution_note"),
    }),
    () => revalidateVoice(),
    "Actualizada."
  );
}

/** §31 · Escalar es una DECISIÓN. Y el caso nace sin clasificar. */
export async function openCaseFromFeedbackAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite abrir casos." };
  }
  const feedbackId = text(formData, "feedback_id");
  if (!feedbackId) return { error: "Falta la manifestación." };

  return run(
    () => openCaseFromFeedback(
      feedbackId, optional(formData, "title"), optional(formData, "description")
    ),
    () => { revalidateVoice(); revalidatePath("/quality/cases"); },
    "Caso abierto SIN clasificar, con las referencias a la manifestación. "
      + "Clasificarlo como no conformidad —o no— es la decisión de siempre, en la "
      + "ficha del caso."
  );
}

export async function createTopicAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite definir temas." };
  }
  const name = text(formData, "name");
  if (name.length < 2) return { error: "Ponle nombre al tema." };

  return run(
    () => createTopic(g.ok!.organizationId, { name, code: optional(formData, "code") }),
    () => revalidateVoice(),
    "Tema creado."
  );
}

// ---------------------------------------------------------------------------
// Métricas, señales y cierre del periodo
// ---------------------------------------------------------------------------

export async function createMetricAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite definir métricas." };
  }
  const name = text(formData, "name");
  if (name.length < 3) return { error: "Ponle nombre a la métrica." };

  const method = pick(formData, "method", METRIC_METHODS, "average")!;
  const stableKey = optional(formData, "question_stable_key");
  const min = num(formData, "expects_scale_min");
  const max = num(formData, "expects_scale_max");

  if (method !== "response_count" && method !== "custom" && !stableKey) {
    return { error: "Una métrica sobre una pregunta necesita saber cuál: indica su clave estable." };
  }
  // §14 · La única metodología que el sistema se niega a falsificar.
  if (method === "nps" && !(min === 0 && max === 10)) {
    return {
      error: "NPS solo se llama NPS con escala 0–10. Si tu pregunta usa otra escala, "
        + "elige «Promedio» o «Porcentaje favorable»: llamarlo NPS haría que el "
        + "número significara algo que no es.",
    };
  }
  if (method === "top_box" && num(formData, "top_box_min") === null) {
    return { error: "El porcentaje favorable necesita un umbral: a partir de qué valor cuenta." };
  }

  return run(
    () => createMetricDefinition(g.ok!.organizationId, {
      name,
      code: optional(formData, "code"),
      description: optional(formData, "description"),
      method,
      questionStableKey: stableKey,
      expectsScaleMin: min,
      expectsScaleMax: max,
      topBoxMin: num(formData, "top_box_min"),
      unit: text(formData, "unit") || "score",
      direction: text(formData, "direction") || "higher_is_better",
      formulaNote: optional(formData, "formula_note"),
    }),
    () => revalidateVoice(),
    "Métrica definida. Trazaloop no impone ninguna metodología: esta es la de tu empresa."
  );
}

export async function dismissSignalAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite descartar señales." };
  }
  const signalId = text(formData, "signal_id");
  if (!signalId) return { error: "Falta la señal." };

  return run(
    () => dismissCustomerSignal(g.ok!.organizationId, signalId),
    () => revalidateVoice(),
    "Señal descartada."
  );
}

export async function scanCustomerVoiceAction(
  _prev: VoiceActionState, _formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };

  return run(
    async () => { await scanCustomerVoice(g.ok!.organizationId); },
    () => revalidateVoice(),
    "Revisión hecha. Los avisos que ya existían no se duplican, y ninguno abre "
      + "casos, clasifica no conformidades ni crea riesgos por su cuenta."
  );
}

export async function createVoiceReviewAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageCustomerVoice(g.ok.roleCode)) {
    return { error: "Tu rol no permite abrir el periodo." };
  }
  const periodLabel = text(formData, "period_label");
  const start = text(formData, "period_start");
  const end = text(formData, "period_end");
  if (periodLabel.length < 2) return { error: "Ponle nombre al periodo." };
  if (!start || !end) return { error: "El periodo necesita fecha de inicio y de fin." };

  return run(
    () => createVoiceReview(g.ok!.organizationId, {
      periodLabel, periodStart: start, periodEnd: end,
      scopeNote: optional(formData, "scope_note"),
      methodologyNote: optional(formData, "methodology_note"),
      ownerPositionId: optional(formData, "owner_position_id"),
    }),
    () => revalidateVoice(),
    "Periodo abierto. Al cerrarlo tendrás que decir si la metodología sigue sirviendo."
  );
}

/** VC-05/VC-06 · Cerrar el periodo es una afirmación de la EMPRESA. */
export async function closeVoiceReviewAction(
  _prev: VoiceActionState, formData: FormData
): Promise<VoiceActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canCloseCustomerVoice(g.ok.roleCode)) {
    return {
      error: "Tu rol no permite cerrar el periodo de satisfacción. Es una "
        + "afirmación de la empresa sobre sus clientes.",
    };
  }
  const reviewId = text(formData, "review_id");
  const verdict = pick(formData, "methodology_verdict", METHODOLOGY_VERDICTS);
  const conclusions = text(formData, "conclusions");
  if (!reviewId) return { error: "Falta el periodo." };
  if (!verdict) return { error: "Di si la metodología sigue sirviendo." };
  if (conclusions.length < 10) return { error: "Un cierre sin conclusiones escritas no es una revisión." };

  try {
    const snapshot = await closeVoiceReview(reviewId, verdict, conclusions);
    revalidateVoice();
    return {
      ...OK,
      message: `Periodo cerrado: ${snapshot.responses ?? 0} respuestas, `
        + `${snapshot.complaints ?? 0} quejas y ${snapshot.compliments ?? 0} felicitaciones. `
        + "El retrato queda congelado y no se reescribe.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cerrar el periodo." };
  }
}
