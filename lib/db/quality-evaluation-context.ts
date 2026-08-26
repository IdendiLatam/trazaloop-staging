import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type { ContextLine, ContextTemporality, ContextTone } from "@/lib/domain/quality-onboarding";
import { periodIsInside } from "@/lib/domain/quality-onboarding";

/**
 * Trazaloop · QUALITY-06.1 · El contexto operacional de una evaluación.
 *
 * LO QUE ESTE ARCHIVO HACE
 *
 * Reúne, para el periodo evaluado, lo que el sistema de gestión sabe de los
 * PROCESOS y del CARGO que la persona ocupaba. Nada más.
 *
 * LO QUE SE NIEGA A HACER, Y POR QUÉ
 *
 * · No vincula un indicador a una persona. El puente es siempre
 *   Persona → Asignación → Cargo → Proceso → Dato (§20). Un indicador mide un
 *   proceso; atribuírselo a quien lo coordina es el paso que convierte un
 *   panel informativo en un expediente.
 *
 * · No devuelve ningún número agregado. Ni media, ni porcentaje de
 *   cumplimiento «de la persona», ni total ponderado. En cuanto existe un
 *   número único, se lee como la nota (§25).
 *
 * · No enseña el valor de HOY dentro de un informe fechado. Los indicadores se
 *   leen por las mediciones cuyo periodo cae DENTRO del periodo evaluado; lo
 *   que no se puede reconstruir se marca «Estado actual» y se dice (§21).
 *
 * · No usa `service_role`. Todo se lee con la sesión de quien mira, así que el
 *   panel nunca enseña una fuente que esa persona no pudiera consultar por su
 *   cuenta (§23). Si RLS no la entrega, sencillamente no aparece.
 *
 * El cliente inyectable de la firma existe por lo mismo que en el onboarding:
 * para que la suite contra base real ejercite ESTA proyección con la sesión de
 * un usuario concreto, en vez de reimplementarla y acabar probando una copia.
 * La aplicación nunca lo pasa.
 */

type Db = SupabaseClient;

export type EvaluationContext = {
  /** El periodo del ciclo. Todo lo que se afirma del pasado se afirma de aquí. */
  period: { start: string; end: string; label: string };
  position: { id: string; name: string } | null;
  processes: { id: string; name: string; code: string | null }[];
  lines: ContextLine[];
  /** Fuentes que no se pudieron leer con los permisos de quien mira. Se dice
   *  cuántas, nunca cuáles: el detalle sería la información que se negó. */
  restrictedSources: number;
};

const EMPTY: EvaluationContext = {
  period: { start: "", end: "", label: "" },
  position: null, processes: [], lines: [], restrictedSources: 0,
};

/**
 * §24 · Nada de esto acepta identificadores arbitrarios. La única entrada es
 * el identificador de la EVALUACIÓN, y la empresa sale de la sesión. Persona,
 * cargo, procesos e indicadores se derivan de ahí; el cliente no elige ninguno.
 */
export async function getEvaluationContext(
  organizationId: string,
  evaluationId: string,
  client?: Db
): Promise<EvaluationContext | null> {
  const supabase: Db = client ?? (await createServerClient());

  // Si RLS no entrega la evaluación, no hay contexto. Es la misma respuesta que
  // si no existiera: el panel no puede ser una puerta trasera a la evaluación.
  const { data: ev } = await supabase
    .from("quality_performance_evaluations")
    .select("id, cycle_id, person_id, position_id")
    .eq("organization_id", organizationId)
    .eq("id", evaluationId)
    .maybeSingle();
  if (!ev) return null;

  const { data: cycle } = await supabase
    .from("quality_performance_cycles")
    .select("name, period_start, period_end")
    .eq("organization_id", organizationId)
    .eq("id", ev.cycle_id)
    .maybeSingle();
  if (!cycle) return { ...EMPTY };

  const period = {
    start: cycle.period_start as string,
    end: cycle.period_end as string,
    label: cycle.name as string,
  };

  // §20 · El puente. Sin cargo no hay contexto de proceso: no se inventa uno
  // mirando qué tocó la persona.
  if (!ev.position_id) {
    return { period, position: null, processes: [], lines: [], restrictedSources: 0 };
  }

  const { data: position } = await supabase
    .from("quality_positions").select("id, name")
    .eq("organization_id", organizationId).eq("id", ev.position_id).maybeSingle();

  const { data: procesos } = await supabase
    .from("quality_processes").select("id, code, name")
    .eq("organization_id", organizationId).eq("owner_position_id", ev.position_id);
  const processes = (procesos ?? []).map((p) => ({
    id: p.id as string, code: p.code as string | null, name: p.name as string,
  }));
  const processIds = processes.map((p) => p.id);

  let restricted = 0;
  const lines: ContextLine[] = [];

  // --- Indicadores de esos procesos, POR PERIODO --------------------------
  const { data: indicadores, error: eInd } = await supabase
    .from("quality_indicators")
    .select("id, code, name, scope_process_id, owner_position_id, admin_state")
    .eq("organization_id", organizationId)
    .eq("admin_state", "active");
  if (eInd) restricted += 1;

  const relevantes = (indicadores ?? []).filter((i) =>
    (i.scope_process_id && processIds.includes(i.scope_process_id as string))
    || i.owner_position_id === ev.position_id);

  if (relevantes.length > 0) {
    const { data: mediciones } = await supabase
      .from("quality_measurements")
      .select("indicator_id, period_label, period_start, period_end, value, evaluation, is_current")
      .eq("organization_id", organizationId)
      .in("indicator_id", relevantes.map((i) => i.id as string))
      .eq("is_current", true)
      .order("period_start", { ascending: true });

    const { data: configs } = await supabase
      .from("quality_indicator_configs")
      .select("indicator_id, unit_label, target_value, target_min, target_max, effective_from")
      .eq("organization_id", organizationId)
      .in("indicator_id", relevantes.map((i) => i.id as string))
      .order("effective_from", { ascending: false });

    for (const ind of relevantes) {
      const proceso = processes.find((p) => p.id === ind.scope_process_id);
      const sujeto = proceso ? `Proceso ${proceso.name}` : `Cargo ${position?.name ?? "—"}`;
      const cfg = (configs ?? []).find((c) => c.indicator_id === ind.id);
      const meta = describeTarget(cfg);

      const delPeriodo = (mediciones ?? []).filter((m) =>
        m.indicator_id === ind.id
        && periodIsInside(
          { start: m.period_start as string, end: m.period_end as string }, period
        ));

      if (delPeriodo.length === 0) {
        lines.push({
          kind: "indicator", subject: sujeto,
          label: `${ind.code ? `${ind.code} · ` : ""}${ind.name}`,
          value: "Sin mediciones en el periodo evaluado",
          temporality: "period", tone: "neutral",
          detail: meta,
        });
        continue;
      }
      for (const m of delPeriodo) {
        lines.push({
          kind: "indicator", subject: sujeto,
          label: `${ind.code ? `${ind.code} · ` : ""}${ind.name} · ${m.period_label}`,
          value: `${formatNumber(m.value)}${cfg?.unit_label ? ` ${cfg.unit_label}` : ""}`,
          temporality: "period",
          tone: toneForEvaluation(m.evaluation as string | null),
          detail: [meta, describeEvaluation(m.evaluation as string | null)]
            .filter(Boolean).join(" · ") || null,
        });
      }
    }
  }

  // --- Objetivos relacionados con esos procesos ---------------------------
  if (processIds.length > 0) {
    const { data: enlaces } = await supabase
      .from("quality_objective_processes")
      .select("objective_id, process_id")
      .eq("organization_id", organizationId)
      .in("process_id", processIds);
    const objectiveIds = [...new Set((enlaces ?? []).map((x) => x.objective_id as string))];
    if (objectiveIds.length > 0) {
      const { data: objetivos } = await supabase
        .from("v_quality_objective_performance")
        .select("objective_id, code, name, performance, performance_explanation, period_start, period_end")
        .eq("organization_id", organizationId)
        .in("objective_id", objectiveIds);
      for (const o of objetivos ?? []) {
        const dentro = periodIsInside(
          { start: o.period_start as string, end: o.period_end as string }, period
        );
        lines.push({
          kind: "objective",
          subject: "Objetivo del sistema de gestión",
          label: `${o.code ? `${o.code} · ` : ""}${o.name}`,
          value: describePerformance(o.performance as string | null),
          // El objetivo tiene periodo propio: si no cae dentro del evaluado, se
          // dice que es el estado actual en vez de fingir que es del periodo.
          temporality: dentro ? "period" : "current",
          tone: toneForPerformance(o.performance as string | null),
          detail: (o.performance_explanation as string | null) ?? null,
        });
      }
    }
  }

  // --- Acciones a cargo del puesto, dentro del periodo --------------------
  const { data: acciones } = await supabase
    .from("work_actions")
    .select("code, title, status, due_on, completed_on, owner_position_id")
    .eq("organization_id", organizationId)
    .eq("owner_position_id", ev.position_id);
  for (const a of acciones ?? []) {
    const fecha = (a.completed_on as string | null) ?? (a.due_on as string | null);
    if (!fecha || fecha < period.start || fecha > period.end) continue;
    const completada = a.status === "completed" || a.status === "verified";
    lines.push({
      kind: "action",
      subject: `Cargo ${position?.name ?? "—"}`,
      label: `${a.code ? `${a.code} · ` : ""}${a.title}`,
      value: completada ? "Completada" : describeActionStatus(a.status as string),
      temporality: "period",
      tone: completada ? "good" : a.status === "overdue" ? "bad" : "neutral",
      detail: a.completed_on
        ? `Completada el ${a.completed_on}.`
        : a.due_on ? `Vencía el ${a.due_on}.` : null,
    });
  }

  // --- Casos del puesto, detectados dentro del periodo --------------------
  const { data: casos } = await supabase
    .from("work_cases")
    .select("code, title, classification, status, detected_on, owner_position_id")
    .eq("organization_id", organizationId)
    .eq("owner_position_id", ev.position_id);
  for (const c of casos ?? []) {
    const d = c.detected_on as string | null;
    if (!d || d < period.start || d > period.end) continue;
    lines.push({
      kind: "case",
      subject: `Cargo ${position?.name ?? "—"}`,
      label: `${c.code ? `${c.code} · ` : ""}${c.title}`,
      value: describeCase(c.classification as string | null, c.status as string),
      temporality: "period",
      tone: c.status === "closed" ? "good" : "neutral",
      detail: `Detectado el ${d}.`,
    });
  }

  // --- Riesgos a cargo del puesto ----------------------------------------
  // El riesgo NO conserva estado por periodo: lo que hay es su situación de
  // hoy, y la línea lo declara en vez de disfrazarla de dato del periodo.
  const { data: riesgos } = await supabase
    .from("v_quality_risk_overview")
    .select("code, title, current_level, status, owner_position_id, review_overdue")
    .eq("organization_id", organizationId)
    .eq("owner_position_id", ev.position_id);
  for (const r of riesgos ?? []) {
    lines.push({
      kind: "risk",
      subject: `Cargo ${position?.name ?? "—"}`,
      label: `${r.code ? `${r.code} · ` : ""}${r.title}`,
      value: (r.current_level as string | null) ?? "Sin evaluar",
      temporality: "current",
      tone: r.review_overdue ? "bad" : "neutral",
      detail: r.review_overdue ? "Su revisión está vencida." : null,
    });
  }

  // --- Desarrollo realizado en el periodo (contexto POSITIVO) -------------
  const { data: participaciones } = await supabase
    .from("quality_learning_participants")
    .select("activity_id, attendance_status, learning_result, evaluated_on")
    .eq("organization_id", organizationId)
    .eq("person_id", ev.person_id);
  const activityIds = [...new Set((participaciones ?? []).map((p) => p.activity_id as string))];
  const { data: actividades } = activityIds.length > 0
    ? await supabase.from("quality_learning_activities")
        .select("id, title, starts_on, ends_on, status")
        .eq("organization_id", organizationId).in("id", activityIds)
    : { data: [] };
  for (const p of participaciones ?? []) {
    const act = (actividades ?? []).find((a) => a.id === p.activity_id);
    if (!act) continue;
    const fecha = (act.ends_on as string | null) ?? (act.starts_on as string | null);
    if (!fecha || fecha < period.start || fecha > period.end) continue;
    lines.push({
      kind: "learning",
      subject: "Desarrollo de la persona evaluada",
      label: act.title as string,
      value: `Asistencia: ${p.attendance_status} · Aprendizaje: ${p.learning_result}`,
      temporality: "period",
      tone: p.learning_result === "passed" ? "good" : "neutral",
      detail: null,
    });
  }

  // --- Competencia declarada en el periodo (contexto POSITIVO) ------------
  const { data: competencias } = await supabase
    .from("quality_person_competencies")
    .select("competency_id, demonstrated_level, assessed_on")
    .eq("organization_id", organizationId)
    .eq("person_id", ev.person_id)
    .gte("assessed_on", period.start)
    .lte("assessed_on", period.end);
  const compIds = [...new Set((competencias ?? []).map((c) => c.competency_id as string))];
  const { data: catalogo } = compIds.length > 0
    ? await supabase.from("quality_competencies").select("id, name")
        .eq("organization_id", organizationId).in("id", compIds)
    : { data: [] };
  for (const c of competencias ?? []) {
    lines.push({
      kind: "competence",
      subject: "Competencia de la persona evaluada",
      label: (catalogo ?? []).find((x) => x.id === c.competency_id)?.name as string ?? "—",
      value: `Nivel ${c.demonstrated_level} · declarado el ${c.assessed_on}`,
      temporality: "period",
      tone: "good",
      detail: null,
    });
  }

  return { period, position: position ? { id: position.id, name: position.name } : null,
           processes, lines, restrictedSources: restricted };
}

// ---------------------------------------------------------------------------
// Traducciones. Ninguna produce un número sobre la persona.
// ---------------------------------------------------------------------------

function formatNumber(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "—";
}

function describeTarget(cfg: Record<string, unknown> | undefined): string | null {
  if (!cfg) return null;
  const unidad = (cfg.unit_label as string | null) ?? "";
  if (cfg.target_value !== null && cfg.target_value !== undefined) {
    return `Meta: ${formatNumber(cfg.target_value)}${unidad ? ` ${unidad}` : ""}`;
  }
  if (cfg.target_min !== null && cfg.target_min !== undefined) {
    return `Meta: entre ${formatNumber(cfg.target_min)} y ${formatNumber(cfg.target_max)}`;
  }
  return null;
}

function toneForEvaluation(evaluation: string | null): ContextTone {
  if (evaluation === "complies") return "good";
  if (evaluation === "not_met") return "bad";
  return "neutral";
}

function describeEvaluation(evaluation: string | null): string {
  switch (evaluation) {
    case "complies": return "Cumple la meta";
    case "attention": return "En atención";
    case "not_met": return "No cumple la meta";
    case "no_target": return "Sin meta definida";
    case "no_data": return "Sin dato";
    default: return "";
  }
}

function toneForPerformance(p: string | null): ContextTone {
  if (p === "on_track" || p === "achieved") return "good";
  if (p === "at_risk" || p === "not_achieved") return "bad";
  return "neutral";
}

function describePerformance(p: string | null): string {
  switch (p) {
    case "achieved": return "Logrado";
    case "on_track": return "En camino";
    case "at_risk": return "En riesgo";
    case "not_achieved": return "No logrado";
    default: return p ?? "Sin evaluar";
  }
}

function describeActionStatus(status: string): string {
  switch (status) {
    case "planned": return "Planificada";
    case "in_progress": return "En curso";
    case "overdue": return "Vencida";
    case "cancelled": return "Cancelada";
    default: return status;
  }
}

function describeCase(classification: string | null, status: string): string {
  const c = classification === "nonconformity" ? "No conformidad" : classification ?? "Caso";
  return `${c} · ${status === "closed" ? "cerrado" : status}`;
}

/** El temporalidad de una línea, para pintar la etiqueta. */
export type { ContextTemporality };
