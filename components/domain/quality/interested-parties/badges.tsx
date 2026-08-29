import {
  PRIORITY_LABEL_TEXT, RELEVANCE_LABEL, REVIEW_STATE_LABEL,
  STRATEGY_SCOPE_LABEL, STRATEGY_STATUS_LABEL, SUBJECT_KIND_LABEL,
  priorityView, strategyScope,
  type PriorityLabel, type RelevanceState, type ReviewState,
  type StrategyStatus, type SubjectKind,
} from "@/lib/domain/quality-interested-parties";

/**
 * QUALITY-12.3B3A · Insignias de partes interesadas.
 *
 * Ninguna comunica solo con color: el color acompaña, la palabra informa.
 * Quien no distingue rojo de verde tiene que poder auditar igual.
 *
 * Y ninguna calcula nada. `strategyScope` y `priorityView` son del dominio; si
 * la regla cambia, cambia en un sitio y estas insignias se enteran solas.
 */

const TONE = {
  neutral: "border-hairline bg-surface text-ink-soft",
  info: "border-loop/30 bg-loop/10 text-loop-deep",
  warn: "border-amber/40 bg-amber/10 text-amber-deep",
  danger: "border-rose/40 bg-rose/10 text-rose-deep",
  good: "border-emerald/40 bg-emerald/10 text-emerald-deep",
} as const;
type Tone = keyof typeof TONE;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export function SubjectKindBadge({ kind }: { kind: SubjectKind }) {
  return (
    <Badge tone={kind === "group" ? "info" : "neutral"}>
      {SUBJECT_KIND_LABEL[kind]}
    </Badge>
  );
}

export function RelevanceBadge({ status }: { status: RelevanceState }) {
  const tone: Tone =
    status === "relevant" ? "good" :
    status === "not_relevant" ? "neutral" : "warn";
  return <Badge tone={tone}>{RELEVANCE_LABEL[status]}</Badge>;
}

/**
 * El estado de revisión, tal cual lo calculó el dominio.
 *
 * «Nunca revisada» no se pinta en rojo: describe, no acusa. Y sin cadencia ni
 * fecha prevista el dominio jamás devuelve «vencida», así que esta insignia
 * tampoco puede enseñarla.
 */
export function ReviewStateBadge({ state }: { state: ReviewState }) {
  const tone: Tone =
    state === "overdue" ? "danger" :
    state === "due_soon" ? "warn" :
    state === "up_to_date" ? "good" : "neutral";
  return <Badge tone={tone}>{REVIEW_STATE_LABEL[state]}</Badge>;
}

export function StrategyStatusBadge({ status }: { status: string }) {
  const s = status as StrategyStatus;
  const tone: Tone =
    s === "active" ? "good" :
    s === "draft" ? "neutral" :
    s === "superseded" ? "warn" : "neutral";
  return <Badge tone={tone}>{STRATEGY_STATUS_LABEL[s] ?? status}</Badge>;
}

export function StrategyScopeBadge({ requirementCount }: { requirementCount: number }) {
  const scope = strategyScope(requirementCount);
  return (
    <Badge tone="info">
      {STRATEGY_SCOPE_LABEL[scope]}
      {scope === "multi" ? ` (${requirementCount})` : ""}
    </Badge>
  );
}

/**
 * La prioridad, o nada.
 *
 * Un número sin metodología NO se enseña: el dominio lo degrada a «sin
 * prioridad», y aquí eso significa no pintar insignia. Enseñar un 9 que nadie
 * puede defender es peor que no enseñar nada, y NULL nunca se convierte en 0
 * ni en «baja».
 */
export function PriorityBadge({
  priorityLabel, priorityScore, priorityMethodNote,
}: {
  priorityLabel: string | null;
  priorityScore: number | null;
  priorityMethodNote: string | null;
}) {
  const vista = priorityView({ priorityLabel, priorityScore, priorityMethodNote });
  if (vista.kind === "none") return null;
  if (vista.kind === "qualitative") {
    return <Badge tone="info">Prioridad {PRIORITY_LABEL_TEXT[vista.label as PriorityLabel]}</Badge>;
  }
  return (
    <Badge tone="info">
      <span>Prioridad {vista.score}</span>
      <span className="font-normal opacity-80">· {vista.method}</span>
    </Badge>
  );
}

/** El sello del modo histórico. Se pinta en la cabecera y en cada sección para
 *  que nadie confunda una foto del pasado con el estado de hoy. */
export function HistoricalBadge({ asOf }: { asOf: string }) {
  return <Badge tone="warn">Estado al {asOf}</Badge>;
}
