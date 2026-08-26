"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  approveTreatment, assessOpportunity, assessRisk, closeRisk, createControl,
  createMethodologyDraft, createNextVersion, createOpportunity, createRisk,
  decideOpportunity, decideTreatment, deleteOpportunity, deleteRisk, linkControlToRisk,
  materializeRisk, openCaseFromMaterialization, publishMethodologyVersion,
  reopenRisk, reviewControl, reviewRisk,
} from "@/lib/db/risks";
import {
  ASSESSMENT_KINDS, CAUSE_SOURCES, canGovernMethodology, canGovernRisks, canManageRisks,
  CONTROL_NATURES, DESIGN_VERDICTS, EFFECTIVENESS_VERDICTS, IMPACT_AREAS,
  IMPLEMENTATION_VERDICTS, MATERIALIZATION_SEVERITIES, OPERATION_MODES,
  OPPORTUNITY_ASSESSMENT_KINDS, OPPORTUNITY_DECISIONS, OPPORTUNITY_KINDS,
  RISK_ORIGINS, RISK_STRATEGIES,
} from "@/lib/domain/risks";

/**
 * Trazaloop · QUALITY-05 · Acciones de servidor de riesgos y oportunidades.
 *
 * El reparto es el mismo de QUALITY-04 y por la misma razón:
 *
 * · lo que solo REGISTRA —identificar un riesgo, describir una causa, dar de
 *   alta un control— es escritura normal bajo RLS;
 * · lo que DECIDE —evaluar, tratar, aprobar una aceptación, materializar,
 *   revisar, cerrar— pasa por una RPC que comprueba rol, estado, versión de
 *   metodología y pertenencia de cada referencia en el mismo acto.
 *
 * Ninguna de estas funciones deduce un nivel ni abre una no conformidad por su
 * cuenta. El nivel lo deriva la metodología; la no conformidad la decide una
 * persona (RO-27, AC-01).
 */

export type RiskActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
  riskId?: string;
  opportunityId?: string;
};

const OK: RiskActionState = { error: null, success: true, message: null };

type Gate = { organizationId: string; roleCode: string; userId: string };

async function gate(): Promise<{ ok: Gate | null; error: string | null }> {
  const access = await requireQualityForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutate = await checkQualityCanMutate();
  if (!mutate.allowed) return { ok: null, error: mutate.error };
  // Quién actúa se toma de la SESIÓN, nunca del formulario.
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
function many(form: FormData, name: string): string[] {
  return form.getAll(name).flatMap((v) => (typeof v === "string" && v.length > 0 ? [v] : []));
}

function revalidateRisk(riskId?: string) {
  revalidatePath("/quality");
  revalidatePath("/quality/risks");
  revalidatePath("/quality/tasks");
  if (riskId) revalidatePath(`/quality/risks/${riskId}`);
}
function revalidateOpportunity(id?: string) {
  revalidatePath("/quality");
  revalidatePath("/quality/risks");
  if (id) revalidatePath(`/quality/risks/opportunities/${id}`);
}

// ---------------------------------------------------------------------------
// Metodología
// ---------------------------------------------------------------------------

export async function createMethodologyAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernMethodology(g.ok.roleCode)) {
    return { error: "Tu rol no permite definir metodologías." };
  }

  const name = text(formData, "name");
  if (name.length < 3) return { error: "Ponle un nombre a la metodología." };
  const code = text(formData, "code") || name.slice(0, 12).toUpperCase().replace(/\s+/g, "-");
  const appliesTo = text(formData, "applies_to");
  if (appliesTo !== "risk" && appliesTo !== "opportunity") {
    return { error: "Hay que decir si valora riesgos u oportunidades." };
  }
  const approach = text(formData, "approach") || "qualitative";
  const aggregation = text(formData, "aggregation") || "product";

  const { error } = await createMethodologyDraft({
    organizationId: g.ok.organizationId, code, name,
    description: optional(formData, "description"),
    appliesTo, approach: approach as never, aggregation: aggregation as never,
  });
  if (error) return { error };
  revalidatePath("/quality/risks/methodology");
  return { ...OK, message: "Metodología creada como borrador. Define sus escalas y publícala." };
}

export async function createVersionAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernMethodology(g.ok.roleCode)) {
    return { error: "Tu rol no permite versionar una metodología." };
  }
  const methodologyId = text(formData, "methodology_id");
  if (!methodologyId) return { error: "Falta la metodología." };

  const { error } = await createNextVersion(
    g.ok.organizationId, methodologyId, optional(formData, "change_note")
  );
  if (error) return { error };
  revalidatePath("/quality/risks/methodology");
  return {
    ...OK,
    message:
      "Versión nueva creada como borrador, con las escalas de la vigente como punto de partida. " +
      "Las evaluaciones ya hechas siguen explicándose con la versión anterior.",
  };
}

export async function publishVersionAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernMethodology(g.ok.roleCode)) {
    return { error: "Tu rol no permite publicar una metodología." };
  }
  const versionId = text(formData, "version_id");
  if (!versionId) return { error: "Falta la versión." };

  const { error } = await publishMethodologyVersion(
    versionId, optional(formData, "effective_from"), optional(formData, "change_note")
  );
  if (error) return { error };
  revalidatePath("/quality/risks/methodology");
  return { ...OK, message: "Metodología publicada. A partir de ahora las evaluaciones nuevas usan esta versión." };
}

// ---------------------------------------------------------------------------
// Riesgo
// ---------------------------------------------------------------------------

export async function createRiskAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) return { error: "Tu rol no permite identificar riesgos." };

  const title = text(formData, "title");
  if (title.length < 3) return { error: "Escribe un título que diga de qué riesgo se trata." };
  const eventDescription = text(formData, "event_description");
  if (eventDescription.length < 5) {
    return { error: "Describe QUÉ podría pasar: sin el evento, esto es una preocupación, no un riesgo." };
  }
  const originKind = text(formData, "origin_kind") || "manual";
  if (!RISK_ORIGINS.includes(originKind as never)) return { error: "Origen no válido." };

  // Causa y consecuencia se piden en el mismo formulario porque el riesgo se
  // entiende con las tres partes juntas (RO-13.1), pero solo el evento es
  // obligatorio: forzar las otras dos produce texto de relleno.
  const causeText = optional(formData, "cause_description");
  const consequenceText = optional(formData, "consequence_description");
  const causeSource = text(formData, "cause_source") || "internal";
  const impactArea = text(formData, "impact_area") || "operational";
  if (!CAUSE_SOURCES.includes(causeSource as never)) return { error: "Origen de la causa no válido." };
  if (!IMPACT_AREAS.includes(impactArea as never)) return { error: "Área de impacto no válida." };

  const { riskId, error } = await createRisk({
    organizationId: g.ok.organizationId,
    title,
    eventDescription,
    contextNote: optional(formData, "context_note"),
    originKind: originKind as never,
    ownerPositionId: optional(formData, "owner_position_id"),
    identifiedOn: optional(formData, "identified_on") ?? new Date().toISOString().slice(0, 10),
    processIds: many(formData, "process_ids"),
    objectiveIds: many(formData, "objective_ids"),
    causes: causeText ? [{ description: causeText, sourceKind: causeSource as never }] : [],
    consequences: consequenceText
      ? [{ description: consequenceText, impactArea: impactArea as never }] : [],
  });
  if (error || !riskId) return { error: error ?? "No fue posible registrar el riesgo." };

  revalidateRisk(riskId);
  redirect(`/quality/risks/${riskId}`);
}

export async function assessRiskAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) return { error: "Tu rol no permite evaluar riesgos." };

  const riskId = text(formData, "risk_id");
  const kind = text(formData, "assessment_kind");
  if (!ASSESSMENT_KINDS.includes(kind as never)) return { error: "Tipo de evaluación no válido." };
  const versionId = text(formData, "version_id");
  if (!versionId) {
    return { error: "No hay una metodología publicada con la que evaluar. Publica una primero." };
  }

  // Un nivel por dimensión. La base vuelve a comprobarlo: aquí solo se evita
  // un viaje inútil.
  const levelIds = many(formData, "level_ids").filter(Boolean);
  if (levelIds.length === 0) return { error: "Elige un valor en cada dimensión." };

  const controlIds = many(formData, "control_ids");
  if (kind === "residual" && controlIds.length === 0) {
    return {
      error:
        "Una evaluación residual tiene que decir qué controles se tuvieron en cuenta. " +
        "Sin controles, la residual sería la inherente con otro nombre.",
    };
  }

  const { error } = await assessRisk({
    riskId, kind: kind as never, versionId, levelIds,
    rationale: optional(formData, "rationale"),
    controlIds: kind === "residual" ? controlIds : null,
  });
  if (error) return { error };
  revalidateRisk(riskId);
  return { ...OK, riskId, message: "Evaluación registrada." };
}

export async function decideTreatmentAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernRisks(g.ok.roleCode)) {
    return { error: "Tu rol no permite decidir el tratamiento de un riesgo." };
  }
  const riskId = text(formData, "risk_id");
  const strategy = text(formData, "strategy");
  if (!RISK_STRATEGIES.includes(strategy as never)) return { error: "Estrategia no válida." };
  const rationale = text(formData, "rationale");
  if (rationale.length < 5) return { error: "Explica por qué se decide eso." };

  const { error } = await decideTreatment({
    riskId, strategy: strategy as never, rationale,
    reviewOn: optional(formData, "review_on"),
  });
  if (error) return { error };
  revalidateRisk(riskId);
  return { ...OK, riskId, message: "Decisión registrada." };
}

export async function approveTreatmentAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernMethodology(g.ok.roleCode)) {
    return { error: "Tu rol no permite aprobar la aceptación de un riesgo." };
  }
  const planId = text(formData, "plan_id");
  const riskId = text(formData, "risk_id");
  const { error } = await approveTreatment(planId, optional(formData, "approval_note"));
  if (error) return { error };
  revalidateRisk(riskId);
  return { ...OK, riskId, message: "Aceptación aprobada." };
}

export async function materializeRiskAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) {
    return { error: "Tu rol no permite registrar la materialización de un riesgo." };
  }
  const riskId = text(formData, "risk_id");
  const occurredOn = text(formData, "occurred_on");
  if (!occurredOn) return { error: "¿Cuándo ocurrió?" };
  const description = text(formData, "description");
  if (description.length < 5) return { error: "Describe qué ocurrió." };
  const severity = text(formData, "severity") || "moderate";
  if (!MATERIALIZATION_SEVERITIES.includes(severity as never)) return { error: "Gravedad no válida." };

  const { error } = await materializeRisk({
    riskId, occurredOn, description, severity: severity as never,
    consequence: optional(formData, "observed_consequence"),
  });
  if (error) return { error };
  revalidateRisk(riskId);
  return {
    ...OK, riskId,
    message:
      "Queda registrado como hecho. No se ha abierto ninguna no conformidad: " +
      "eso se decide después, evaluando el caso.",
  };
}

export async function openCaseFromMaterializationAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) return { error: "Tu rol no permite abrir casos." };

  const materializationId = text(formData, "materialization_id");
  const { caseId, error } = await openCaseFromMaterialization(
    materializationId, optional(formData, "case_title"), text(formData, "priority") || "normal"
  );
  if (error || !caseId) return { error: error ?? "No fue posible abrir el caso." };
  revalidateRisk(text(formData, "risk_id"));
  revalidatePath("/quality/cases");
  redirect(`/quality/cases/${caseId}`);
}

export async function reviewRiskAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) return { error: "Tu rol no permite revisar riesgos." };

  const riskId = text(formData, "risk_id");
  const note = text(formData, "note");
  if (note.length < 3) return { error: "Deja constancia de qué se miró." };

  const { error } = await reviewRisk(riskId, note, optional(formData, "next_review_on"));
  if (error) return { error };
  revalidateRisk(riskId);
  return { ...OK, riskId, message: "Revisión registrada." };
}

export async function closeRiskAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernRisks(g.ok.roleCode)) return { error: "Tu rol no permite cerrar un riesgo." };

  const riskId = text(formData, "risk_id");
  const mode = text(formData, "mode");
  if (mode !== "closed" && mode !== "retired" && mode !== "superseded") {
    return { error: "Modo de cierre no válido." };
  }
  const reason = text(formData, "reason");
  if (reason.length < 5) return { error: "Cerrar un riesgo exige decir por qué." };

  const { error } = await closeRisk(riskId, mode, reason, optional(formData, "superseded_by"));
  if (error) return { error };
  revalidateRisk(riskId);
  return { ...OK, riskId, message: "Riesgo cerrado." };
}

export async function reopenRiskAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernRisks(g.ok.roleCode)) return { error: "Tu rol no permite reabrir un riesgo." };

  const riskId = text(formData, "risk_id");
  const reason = text(formData, "reason");
  if (reason.length < 5) return { error: "Reabrir exige decir por qué." };

  const { error } = await reopenRisk(riskId, reason);
  if (error) return { error };
  revalidateRisk(riskId);
  return { ...OK, riskId, message: "Riesgo reabierto." };
}

export async function deleteRiskAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) return { error: "Tu rol no permite eliminar riesgos." };

  // No se comprueba aquí si «se puede»: lo comprueba el disparador de 0122 en
  // el instante del DELETE. Preguntar antes y borrar después dejaría una
  // ventana entre las dos cosas.
  const { error } = await deleteRisk(text(formData, "risk_id"));
  if (error) return { error };
  revalidateRisk();
  redirect("/quality/risks");
}

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------

export async function createControlAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) return { error: "Tu rol no permite registrar controles." };

  const title = text(formData, "title");
  if (title.length < 3) return { error: "Escribe qué control es." };
  const controlNature = text(formData, "control_nature") || "preventive";
  if (!CONTROL_NATURES.includes(controlNature as never)) return { error: "Naturaleza no válida." };
  const operationMode = text(formData, "operation_mode") || "manual";
  if (!OPERATION_MODES.includes(operationMode as never)) return { error: "Modo de operación no válido." };

  const riskId = optional(formData, "risk_id");
  const { error } = await createControl({
    organizationId: g.ok.organizationId, title,
    description: optional(formData, "description"),
    controlNature: controlNature as never, operationMode: operationMode as never,
    frequency: optional(formData, "frequency"),
    ownerPositionId: optional(formData, "owner_position_id"),
    riskId,
    documentId: optional(formData, "document_id"),
    indicatorId: optional(formData, "indicator_id"),
    processIds: many(formData, "process_ids"),
  });
  if (error) return { error };
  revalidateRisk(riskId ?? undefined);
  return { ...OK, riskId: riskId ?? undefined, message: "Control registrado." };
}

export async function linkControlAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) return { error: "Tu rol no permite asociar controles." };

  const riskId = text(formData, "risk_id");
  const controlId = text(formData, "control_id");
  if (!controlId) return { error: "Elige un control." };
  const { error } = await linkControlToRisk(g.ok.organizationId, riskId, controlId);
  if (error) return { error };
  revalidateRisk(riskId);
  return { ...OK, riskId, message: "Control asociado." };
}

export async function reviewControlAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) return { error: "Tu rol no permite evaluar controles." };

  const design = text(formData, "design_verdict");
  const implementation = text(formData, "implementation_verdict");
  const effectiveness = text(formData, "effectiveness_verdict");
  if (!DESIGN_VERDICTS.includes(design as never)) return { error: "Veredicto de diseño no válido." };
  if (!IMPLEMENTATION_VERDICTS.includes(implementation as never)) {
    return { error: "Veredicto de implementación no válido." };
  }
  if (!EFFECTIVENESS_VERDICTS.includes(effectiveness as never)) {
    return { error: "Veredicto de eficacia no válido." };
  }

  const { error } = await reviewControl({
    controlId: text(formData, "control_id"),
    design: design as never, implementation: implementation as never,
    effectiveness: effectiveness as never,
    criterion: optional(formData, "criterion"), note: optional(formData, "note"),
  });
  if (error) return { error };
  const riskId = optional(formData, "risk_id");
  revalidateRisk(riskId ?? undefined);
  return { ...OK, riskId: riskId ?? undefined, message: "Evaluación del control registrada." };
}

// ---------------------------------------------------------------------------
// Oportunidades
// ---------------------------------------------------------------------------

export async function createOpportunityAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) return { error: "Tu rol no permite identificar oportunidades." };

  const title = text(formData, "title");
  if (title.length < 3) return { error: "Escribe un título." };
  const situation = text(formData, "situation");
  if (situation.length < 5) {
    return { error: "Describe la situación observada: sin ella esto es un deseo, no una oportunidad." };
  }
  const kind = text(formData, "opportunity_kind") || "improvement";
  if (!OPPORTUNITY_KINDS.includes(kind as never)) return { error: "Tipo no válido." };

  const { opportunityId, error } = await createOpportunity({
    organizationId: g.ok.organizationId, title, situation,
    expectedBenefit: optional(formData, "expected_benefit"),
    opportunityKind: kind as never,
    ownerPositionId: optional(formData, "owner_position_id"),
    processIds: many(formData, "process_ids"),
    objectiveIds: many(formData, "objective_ids"),
  });
  if (error || !opportunityId) return { error: error ?? "No fue posible registrarla." };
  revalidateOpportunity(opportunityId);
  redirect(`/quality/risks/opportunities/${opportunityId}`);
}

export async function assessOpportunityAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) return { error: "Tu rol no permite evaluar oportunidades." };

  const opportunityId = text(formData, "opportunity_id");
  const kind = text(formData, "assessment_kind") || "prioritization";
  if (!OPPORTUNITY_ASSESSMENT_KINDS.includes(kind as never)) return { error: "Tipo no válido." };
  const versionId = text(formData, "version_id");
  if (!versionId) {
    return {
      error:
        "No hay una metodología de oportunidades publicada. Las oportunidades se priorizan con la suya, " +
        "no con la de riesgos.",
    };
  }
  const levelIds = many(formData, "level_ids").filter(Boolean);
  if (levelIds.length === 0) return { error: "Elige un valor en cada dimensión." };

  const { error } = await assessOpportunity({
    opportunityId, kind: kind as never, versionId, levelIds,
    rationale: optional(formData, "rationale"),
  });
  if (error) return { error };
  revalidateOpportunity(opportunityId);
  return { ...OK, opportunityId, message: "Evaluación registrada." };
}

export async function decideOpportunityAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canGovernRisks(g.ok.roleCode)) return { error: "Tu rol no permite decidir sobre una oportunidad." };

  const opportunityId = text(formData, "opportunity_id");
  const decision = text(formData, "decision");
  if (!OPPORTUNITY_DECISIONS.includes(decision as never)) return { error: "Decisión no válida." };
  const rationale = text(formData, "rationale");
  if (rationale.length < 5) return { error: "Explica por qué." };

  const { error } = await decideOpportunity(opportunityId, decision as never, rationale);
  if (error) return { error };
  revalidateOpportunity(opportunityId);
  return {
    ...OK, opportunityId,
    message:
      decision === "pursue"
        ? "Decidido. La oportunidad sigue existiendo; las acciones se crean aparte."
        : "Decisión registrada.",
  };
}

export async function deleteOpportunityAction(
  _prev: RiskActionState, formData: FormData
): Promise<RiskActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageRisks(g.ok.roleCode)) return { error: "Tu rol no permite eliminar oportunidades." };
  const { error } = await deleteOpportunity(text(formData, "opportunity_id"));
  if (error) return { error };
  revalidateOpportunity();
  redirect("/quality/risks?vista=oportunidades");
}
