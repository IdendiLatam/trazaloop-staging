import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { listPositionVersions } from "@/lib/db/quality-people";
import type {
  ChecklistLine, KnowledgeOnboardingState, OnboardingPending, OnboardingSource,
} from "@/lib/domain/quality-onboarding";
import {
  countPending, KNOWLEDGE_ONBOARDING_LABEL, NO_READ_TRACKING_NOTICE,
  ONBOARDING_SOURCE_LABEL,
} from "@/lib/domain/quality-onboarding";
import type {
  AssignmentType, CompetenceMethod, Criticality, NeedOrigin, NeedStatus, PersonRelationship,
  PersonStatus, PositionFunctionKind, PositionVersionStatus,
} from "@/lib/domain/quality-people";

/**
 * Trazaloop · QUALITY-06.1 · El onboarding del sistema de gestión, DERIVADO.
 *
 * No hay ninguna tabla de onboarding. Todo lo que esta pantalla enseña sale de
 * lo que QUALITY-06 ya guarda: la asignación, la versión del perfil que regía
 * en su fecha, las funciones de esa versión, los procesos del cargo, los
 * documentos relacionados por una relación REAL, los requisitos de competencia
 * de esa versión, lo que la persona había demostrado, el desarrollo abierto, el
 * conocimiento de esos procesos y las tareas que de verdad existen.
 *
 * DOS DECISIONES QUE VALE LA PENA DEJAR ESCRITAS
 *
 * 1 · El perfil aplicable se resuelve por la FECHA EFECTIVA de la asignación,
 *     no por «el último publicado». Si alguien entró bajo la v1, su onboarding
 *     es el de la v1 aunque hoy rija la v2 — y si además hoy rige otra, la
 *     pantalla lo dice aparte en vez de reescribir lo que se le pidió.
 *
 * 2 · Los documentos se listan, pero NO se cuentan como pendientes. Trazaloop
 *     no registra confirmación de lectura, así que una casilla «leído» sería
 *     una afirmación que el sistema no puede sostener. Se dice en la pantalla y
 *     en el papel.
 *
 * SOBRE EL CLIENTE INYECTABLE
 *
 * `getOnboarding` acepta un cliente opcional. En la aplicación no se pasa
 * nunca: usa la sesión del usuario como todo lo demás. Existe para que la
 * suite contra base real pueda ejercitar ESTA derivación con la sesión de un
 * usuario concreto, en vez de reimplementarla en el archivo de pruebas — que
 * es como se acaba probando una copia que no es la que corre en producción.
 * Sigue sin haber ninguna vía que use `service_role`.
 */

type Db = SupabaseClient;

function fail(error: { message?: string } | null, fallback: string): string {
  return error?.message && error.message.length > 0 ? error.message : fallback;
}

export type OnboardingProcess = {
  id: string; code: string | null; name: string; status: string;
  source: OnboardingSource;
};

export type OnboardingDocument = {
  id: string; code: string | null; title: string; status: string;
  source: OnboardingSource;
  /** Por qué proceso llega, cuando llega por un proceso. */
  via: string | null;
  relationType: string | null;
};

export type OnboardingCompetency = {
  competencyId: string; name: string;
  requiredLevel: number; isMandatory: boolean;
  demonstratedLevel: number | null; demonstratedOn: string | null;
  method: CompetenceMethod | null;
  gap: number;
  /** Lo que el cargo exige HOY, cuando difiere de lo que exigía al entrar. */
  currentRequiredLevel: number | null;
};

export type OnboardingDevelopment = {
  kind: "need" | "plan_item";
  id: string; title: string; status: string;
  origin: NeedOrigin | null; developmentKind: string | null;
  targetDate: string | null;
};

export type OnboardingKnowledge = {
  id: string; title: string; criticality: Criticality;
  state: KnowledgeOnboardingState;
  processName: string | null;
  transferTitle: string | null;
};

export type OnboardingTask = {
  id: string; taskType: string; title: string;
  dueAt: string | null; status: string;
  assignedTo: "position" | "person";
};

export type OnboardingView = {
  person: {
    id: string; fullName: string; employeeCode: string | null;
    relationship: PersonRelationship; status: PersonStatus;
    hasAccount: boolean;
  };
  assignment: {
    id: string; assignmentType: AssignmentType;
    effectiveFrom: string; effectiveTo: string | null; notes: string | null;
  };
  position: { id: string; code: string | null; name: string; isCritical: boolean };
  /** La versión que regía en la fecha efectiva de la asignación. */
  profile: {
    versionId: string; versionNumber: number; status: PositionVersionStatus;
    purpose: string | null; scope: string | null; authority: string | null;
    education: string | null; experience: string | null;
    effectiveFrom: string | null; effectiveTo: string | null;
  } | null;
  /** La versión vigente HOY, cuando NO es la misma. `null` si coinciden. */
  currentProfile: { versionId: string; versionNumber: number } | null;
  functions: { id: string; description: string; kind: PositionFunctionKind; processName: string | null }[];
  processes: OnboardingProcess[];
  documents: OnboardingDocument[];
  competencies: OnboardingCompetency[];
  development: OnboardingDevelopment[];
  knowledge: OnboardingKnowledge[];
  tasks: OnboardingTask[];
  pending: OnboardingPending;
  checklist: ChecklistLine[];
};

/**
 * Construye el onboarding de UNA asignación.
 *
 * Devuelve `null` si la asignación no existe o si quien pregunta no puede verla
 * —que es la misma respuesta, a propósito—. Todo se lee con la sesión del
 * usuario: si RLS no entrega la ficha de la persona, aquí no llega nada.
 */
export async function getOnboarding(
  organizationId: string,
  assignmentId: string,
  client?: Db
): Promise<OnboardingView | null> {
  const supabase: Db = client ?? (await createServerClient());

  const { data: asg, error: eAsg } = await supabase
    .from("quality_position_assignments")
    .select("id, position_id, person_id, profile_id, assignment_type, effective_from, effective_to, notes")
    .eq("organization_id", organizationId)
    .eq("id", assignmentId)
    .maybeSingle();
  if (eAsg) throw new Error(fail(eAsg, "No se pudo leer la asignación."));
  if (!asg || !asg.person_id) return null;

  // La ficha de la persona pasa por el círculo de privacidad de QUALITY-06: si
  // quien mira no puede abrirla, tampoco puede abrir su onboarding.
  const { data: person } = await supabase
    .from("quality_people")
    .select("id, full_name, employee_code, relationship, status, profile_id")
    .eq("organization_id", organizationId)
    .eq("id", asg.person_id)
    .maybeSingle();
  if (!person) return null;

  const { data: position } = await supabase
    .from("quality_positions")
    .select("id, code, name, is_critical")
    .eq("organization_id", organizationId)
    .eq("id", asg.position_id)
    .maybeSingle();
  if (!position) return null;

  // §6 · El perfil aplicable es el que regía en la FECHA EFECTIVA, no el
  // último publicado.
  const asOf = asg.effective_from as string;
  const { data: versionId } = await supabase.rpc("quality_position_version_on", {
    p_organization_id: organizationId, p_position_id: asg.position_id, p_on: asOf,
  });
  const today = new Date().toISOString().slice(0, 10);
  const { data: currentVersionId } = await supabase.rpc("quality_position_version_on", {
    p_organization_id: organizationId, p_position_id: asg.position_id, p_on: today,
  });

  const versions = await listPositionVersions(organizationId, asg.position_id as string, supabase);
  const applicable = versions.find((v) => v.id === versionId) ?? null;
  const current = versions.find((v) => v.id === currentVersionId) ?? null;

  const processes = await onboardingProcesses(
    supabase, organizationId, asg.position_id as string, applicable?.functions ?? []
  );
  const documents = await onboardingDocuments(
    supabase, organizationId, asg.position_id as string, processes
  );
  const competencies = await onboardingCompetencies(
    supabase, organizationId, asg.person_id as string, applicable, current, asOf
  );
  const development = await onboardingDevelopment(
    supabase, organizationId, asg.person_id as string, asg.position_id as string
  );
  const knowledge = await onboardingKnowledge(
    supabase, organizationId, asg.person_id as string, processes
  );
  const tasks = await onboardingTasks(
    supabase, organizationId, asg.position_id as string, person.profile_id as string | null
  );

  const gaps = competencies.filter((c) => c.gap > 0);
  const toReceive = knowledge.filter((k) => k.state === "to_receive");
  const pending = countPending({
    competencyGaps: gaps.length,
    developmentOpen: development.length,
    knowledgeToReceive: toReceive.length,
    openTasks: tasks.length,
  });

  return {
    person: {
      id: person.id, fullName: person.full_name,
      employeeCode: person.employee_code,
      relationship: person.relationship as PersonRelationship,
      status: person.status as PersonStatus,
      hasAccount: Boolean(person.profile_id),
    },
    assignment: {
      id: asg.id, assignmentType: asg.assignment_type as AssignmentType,
      effectiveFrom: asg.effective_from, effectiveTo: asg.effective_to, notes: asg.notes,
    },
    position: {
      id: position.id, code: position.code, name: position.name,
      isCritical: Boolean(position.is_critical),
    },
    profile: applicable
      ? {
          versionId: applicable.id, versionNumber: applicable.versionNumber,
          status: applicable.status, purpose: applicable.purpose, scope: applicable.scope,
          authority: applicable.authority, education: applicable.education,
          experience: applicable.experience,
          effectiveFrom: applicable.effectiveFrom, effectiveTo: applicable.effectiveTo,
        }
      : null,
    currentProfile:
      current && current.id !== applicable?.id
        ? { versionId: current.id, versionNumber: current.versionNumber }
        : null,
    functions: (applicable?.functions ?? []).map((f) => ({
      id: f.id, description: f.description, kind: f.kind,
      processName: f.processId
        ? processes.find((p) => p.id === f.processId)?.name ?? null
        : null,
    })),
    processes, documents, competencies, development, knowledge, tasks, pending,
    checklist: buildChecklist({
      applicable: Boolean(applicable), gaps, development, toReceive, tasks, documents,
    }),
  };
}

/**
 * §7 · Los procesos salen de DOS relaciones reales y de ninguna regla
 * inventada: los que el cargo posee, y los que nombran las funciones de su
 * perfil.
 */
async function onboardingProcesses(
  supabase: Db,
  organizationId: string,
  positionId: string,
  functions: readonly { processId: string | null }[]
): Promise<OnboardingProcess[]> {
  const { data: owned } = await supabase
    .from("quality_processes")
    .select("id, code, name, status")
    .eq("organization_id", organizationId)
    .eq("owner_position_id", positionId);

  const fromFunctions = [...new Set(
    functions.map((f) => f.processId).filter((v): v is string => Boolean(v))
  )];
  const ownedIds = new Set((owned ?? []).map((p) => p.id as string));
  const missing = fromFunctions.filter((id) => !ownedIds.has(id));

  const { data: referenced } = missing.length > 0
    ? await supabase.from("quality_processes").select("id, code, name, status")
        .eq("organization_id", organizationId).in("id", missing)
    : { data: [] };

  return [
    ...(owned ?? []).map((p) => ({
      id: p.id as string, code: p.code as string | null, name: p.name as string,
      status: p.status as string, source: "position" as const,
    })),
    ...(referenced ?? []).map((p) => ({
      id: p.id as string, code: p.code as string | null, name: p.name as string,
      status: p.status as string, source: "function" as const,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * §7 · Los documentos llegan por dos caminos reales: los que el cargo posee, y
 * los que están relacionados con sus procesos. No existe la regla «todo el
 * mundo debe leerlo todo», y añadirla habría convertido el onboarding en una
 * lista de cien documentos que nadie mira.
 */
async function onboardingDocuments(
  supabase: Db,
  organizationId: string,
  positionId: string,
  processes: readonly OnboardingProcess[]
): Promise<OnboardingDocument[]> {
  const { data: owned } = await supabase
    .from("trazadoc_documents")
    .select("id, code, title, status")
    .eq("organization_id", organizationId)
    .eq("owner_position_id", positionId);

  const processIds = processes.map((p) => p.id);
  const { data: links } = processIds.length > 0
    ? await supabase.from("quality_process_documents")
        .select("document_id, process_id, relation_type")
        .eq("organization_id", organizationId).in("process_id", processIds)
    : { data: [] };

  const linkIds = [...new Set((links ?? []).map((l) => l.document_id as string))];
  const ownedIds = new Set((owned ?? []).map((d) => d.id as string));
  const missing = linkIds.filter((id) => !ownedIds.has(id));
  const { data: linked } = missing.length > 0
    ? await supabase.from("trazadoc_documents").select("id, code, title, status")
        .eq("organization_id", organizationId).in("id", missing)
    : { data: [] };

  const byProcess = new Map(processes.map((p) => [p.id, p.name]));

  return [
    ...(owned ?? []).map((d) => ({
      id: d.id as string, code: d.code as string | null, title: d.title as string,
      status: d.status as string, source: "position" as const, via: null, relationType: null,
    })),
    ...(linked ?? []).map((d) => {
      const link = (links ?? []).find((l) => l.document_id === d.id);
      return {
        id: d.id as string, code: d.code as string | null, title: d.title as string,
        status: d.status as string, source: "process" as const,
        via: link ? byProcess.get(link.process_id as string) ?? null : null,
        relationType: (link?.relation_type as string | null) ?? null,
      };
    }),
  ].sort((a, b) => (a.code ?? a.title).localeCompare(b.code ?? b.title));
}

/**
 * §8 · Requerido, demostrado y brecha. Lo demostrado se lee EN LA FECHA de la
 * asignación, no hoy: el onboarding responde qué se le pedía a esta persona al
 * asumir el cargo.
 *
 * Cuando hoy rige otro perfil, se añade lo que exige HOY en una columna aparte
 * —nunca sustituyendo lo anterior—, que es la forma de distinguir sin
 * reescribir el pasado (§32).
 */
async function onboardingCompetencies(
  supabase: Db,
  organizationId: string,
  personId: string,
  applicable: Awaited<ReturnType<typeof listPositionVersions>>[number] | null,
  current: Awaited<ReturnType<typeof listPositionVersions>>[number] | null,
  asOf: string
): Promise<OnboardingCompetency[]> {
  if (!applicable) return [];

  const out: OnboardingCompetency[] = [];
  for (const r of applicable.requirements) {
    const { data: demostrado } = await supabase.rpc("quality_demonstrated_level_on", {
      p_organization_id: organizationId, p_person_id: personId,
      p_competency_id: r.competencyId, p_on: asOf,
    });
    const level = demostrado === null || demostrado === undefined ? null : Number(demostrado);

    const { data: decision } = await supabase
      .from("quality_person_competencies")
      .select("assessed_on, method")
      .eq("organization_id", organizationId)
      .eq("person_id", personId)
      .eq("competency_id", r.competencyId)
      .lte("assessed_on", asOf)
      .order("assessed_on", { ascending: false })
      .limit(1)
      .maybeSingle();

    const hoy = current
      ? current.requirements.find((x) => x.competencyId === r.competencyId)?.requiredLevel ?? null
      : null;

    out.push({
      competencyId: r.competencyId, name: r.competencyName,
      requiredLevel: r.requiredLevel, isMandatory: r.isMandatory,
      demonstratedLevel: level,
      demonstratedOn: (decision?.assessed_on as string | null) ?? null,
      method: (decision?.method as CompetenceMethod | null) ?? null,
      gap: Math.max(r.requiredLevel - (level ?? 0), 0),
      currentRequiredLevel:
        current && current.id !== applicable.id && hoy !== r.requiredLevel ? hoy : null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** §9 · Se muestra el desarrollo que YA existe. Crear uno nuevo es un acto
 *  humano explícito desde la pantalla; esta función no crea nada. */
async function onboardingDevelopment(
  supabase: Db, organizationId: string, personId: string, positionId: string
): Promise<OnboardingDevelopment[]> {
  const { data: needs } = await supabase
    .from("quality_development_needs")
    .select("id, title, status, origin_kind, person_id, position_id")
    .eq("organization_id", organizationId)
    .in("status", ["open", "planned", "in_progress"])
    .or(`person_id.eq.${personId},position_id.eq.${positionId}`);

  const { data: items } = await supabase
    .from("quality_development_plan_items")
    .select("id, title, status, development_kind, target_date, person_id, position_id")
    .eq("organization_id", organizationId)
    .in("status", ["planned", "in_progress"])
    .or(`person_id.eq.${personId},position_id.eq.${positionId}`);

  return [
    ...(needs ?? []).map((n) => ({
      kind: "need" as const, id: n.id as string, title: n.title as string,
      status: n.status as NeedStatus, origin: n.origin_kind as NeedOrigin,
      developmentKind: null, targetDate: null,
    })),
    ...(items ?? []).map((i) => ({
      kind: "plan_item" as const, id: i.id as string, title: i.title as string,
      status: i.status as string, origin: null,
      developmentKind: i.development_kind as string,
      targetDate: i.target_date as string | null,
    })),
  ];
}

/**
 * §10 · El conocimiento relevante es el de los procesos del cargo. Se
 * distingue lo que la persona ya sostiene, lo que está en transferencia y lo
 * que debería recibir. Lo que no tiene relación con esos procesos no aparece:
 * enseñarlo todo sería ruido, no onboarding.
 */
async function onboardingKnowledge(
  supabase: Db,
  organizationId: string,
  personId: string,
  processes: readonly OnboardingProcess[]
): Promise<OnboardingKnowledge[]> {
  const processIds = processes.map((p) => p.id);
  if (processIds.length === 0) return [];

  const { data: items } = await supabase
    .from("quality_knowledge_items")
    .select("id, title, criticality, process_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("process_id", processIds);
  const rows = items ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((k) => k.id as string);
  const { data: holders } = await supabase
    .from("quality_knowledge_holders")
    .select("knowledge_item_id, person_id, until_on")
    .eq("organization_id", organizationId)
    .eq("person_id", personId)
    .in("knowledge_item_id", ids);

  const { data: plans } = await supabase
    .from("quality_knowledge_transfer_plans")
    .select("id, knowledge_item_id, title, status")
    .eq("organization_id", organizationId)
    .in("status", ["draft", "active"])
    .in("knowledge_item_id", ids);
  const planIds = (plans ?? []).map((p) => p.id as string);
  const { data: transferItems } = planIds.length > 0
    ? await supabase.from("quality_knowledge_transfer_items")
        .select("transfer_plan_id, target_person_id, status")
        .eq("organization_id", organizationId)
        .eq("target_person_id", personId)
        .in("transfer_plan_id", planIds)
    : { data: [] };

  const byProcess = new Map(processes.map((p) => [p.id, p.name]));
  const holds = new Set(
    (holders ?? [])
      .filter((h) => h.until_on === null)
      .map((h) => h.knowledge_item_id as string)
  );

  return rows.map((k) => {
    const id = k.id as string;
    const planParaMi = (plans ?? []).find((p) =>
      p.knowledge_item_id === id
      && (transferItems ?? []).some((t) => t.transfer_plan_id === p.id));
    const state: KnowledgeOnboardingState = holds.has(id)
      ? "holder"
      : planParaMi ? "transfer_in_progress" : "to_receive";
    return {
      id, title: k.title as string, criticality: k.criticality as Criticality,
      state, processName: byProcess.get(k.process_id as string) ?? null,
      transferTitle: (planParaMi?.title as string | null) ?? null,
    };
  }).sort((a, b) => a.title.localeCompare(b.title));
}

/** §14 · Se muestran las tareas que YA existen, del motor transversal. No se
 *  crea una tarea por cada línea visual del onboarding. */
async function onboardingTasks(
  supabase: Db, organizationId: string, positionId: string, profileId: string | null
): Promise<OnboardingTask[]> {
  const filtro = profileId
    ? `assignee_position_id.eq.${positionId},assignee_profile_id.eq.${profileId}`
    : `assignee_position_id.eq.${positionId}`;
  const { data } = await supabase
    .from("work_tasks")
    .select("id, task_type, title, due_at, status, assignee_position_id, assignee_profile_id")
    .eq("organization_id", organizationId)
    .in("status", ["open", "in_progress"])
    .or(filtro);
  return (data ?? []).map((t) => ({
    id: t.id as string, taskType: t.task_type as string, title: t.title as string,
    dueAt: t.due_at as string | null, status: t.status as string,
    assignedTo: t.assignee_position_id === positionId ? "position" as const : "person" as const,
  }));
}

/**
 * §11 · El checklist. Cada línea viene de una entidad real y ninguna afirma
 * algo que el sistema no pueda demostrar.
 */
function buildChecklist(input: {
  applicable: boolean;
  gaps: readonly OnboardingCompetency[];
  development: readonly OnboardingDevelopment[];
  toReceive: readonly OnboardingKnowledge[];
  tasks: readonly OnboardingTask[];
  documents: readonly OnboardingDocument[];
}): ChecklistLine[] {
  const lines: ChecklistLine[] = [
    { state: "done", text: "Cargo asignado", origin: "Asignación persona–cargo" },
    input.applicable
      ? { state: "done", text: "Perfil aplicable identificado", origin: "Versión del perfil del cargo" }
      : {
          state: "attention",
          text: "El cargo no tiene un perfil publicado",
          origin: "Versión del perfil del cargo",
          detail: "Sin perfil no se puede decir qué se le exige a quien lo ocupa.",
        },
  ];

  for (const c of input.gaps) {
    lines.push({
      state: "attention",
      text: `Competencia «${c.name}»: brecha ${c.gap}`,
      origin: "Requisito del perfil y competencia demostrada",
      detail: `Requerido ${c.requiredLevel} · demostrado ${c.demonstratedLevel ?? "sin evaluar"}.`,
    });
  }

  for (const d of input.development) {
    lines.push({
      state: "pending",
      text: `Desarrollo: ${d.title}`,
      origin: d.kind === "need" ? "Necesidad de desarrollo" : "Item del plan de desarrollo",
      detail: d.targetDate ? `Fecha objetivo ${d.targetDate}.` : null,
    });
  }

  for (const k of input.toReceive) {
    lines.push({
      state: "pending",
      text: `Conocimiento por recibir: ${k.title}`,
      origin: "Elemento de conocimiento del proceso del cargo",
      detail: k.processName ? `Del proceso ${k.processName}.` : null,
    });
  }

  for (const t of input.tasks) {
    lines.push({
      state: "pending",
      text: `Tarea abierta: ${t.title}`,
      origin: t.assignedTo === "position" ? "Tarea del cargo" : "Tarea de la persona",
      detail: t.dueAt ? `Vence el ${t.dueAt}.` : null,
    });
  }

  if (input.documents.length > 0) {
    lines.push({
      state: "informational",
      text: `${input.documents.length} documento(s) relacionados con el cargo y sus procesos`,
      origin: "Documentos del cargo y de sus procesos",
      detail: NO_READ_TRACKING_NOTICE,
    });
  }

  return lines;
}

export { ONBOARDING_SOURCE_LABEL, KNOWLEDGE_ONBOARDING_LABEL };
