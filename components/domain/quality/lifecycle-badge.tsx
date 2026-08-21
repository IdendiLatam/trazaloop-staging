import {
  LIFECYCLE_LABEL,
  LIFECYCLE_HELP,
  lifecycleTone,
  type LifecycleState,
} from "@/lib/domain/document-control";

/**
 * Trazaloop Quality · QUALITY-02 · Estado de un documento, en una etiqueta.
 *
 * No es el distintivo de TrazaDocs (`DocumentStatusBadge`), y la diferencia es
 * deliberada: aquel muestra el estado del MOTOR (borrador / en revisión /
 * aprobado / obsoleto), que en un sistema de gestión se queda corto — no sabe
 * distinguir «aprobado» de «vigente», ni «devuelto» de «borrador». Este
 * muestra el estado que lee un responsable de calidad.
 */
const TONE: Record<ReturnType<typeof lifecycleTone>, string> = {
  neutral: "border-hairline bg-paper text-ink-soft",
  progress: "border-amber/40 bg-amber/10 text-amber",
  attention: "border-danger/30 bg-danger/5 text-danger",
  ok: "border-loop/30 bg-loop/5 text-loop-deep",
  muted: "border-hairline bg-paper text-ink-soft",
};

/** Color del punto de la variante compacta, en el mismo orden que TONE. */
const DOT: Record<ReturnType<typeof lifecycleTone>, string> = {
  neutral: "bg-ink-soft",
  progress: "bg-amber",
  attention: "bg-danger",
  ok: "bg-loop",
  muted: "bg-ink-soft/60",
};

export function LifecycleBadge({
  state,
  withHelp = false,
  compact = false,
}: {
  state: LifecycleState;
  withHelp?: boolean;
  /**
   * Variante para listas densas. Una píldora redondeada con «Aprobado ·
   * pendiente de vigencia» dentro de una columna estrecha se deforma en un
   * óvalo de tres líneas que ya no se lee como un distintivo; un punto de
   * color junto al texto dice lo mismo y ocupa lo que hay.
   */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <span className="inline-flex items-start gap-1.5" title={LIFECYCLE_HELP[state]}>
        <span
          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${DOT[lifecycleTone(state)]}`}
          aria-hidden="true"
        />
        <span>{LIFECYCLE_LABEL[state]}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        title={LIFECYCLE_HELP[state]}
        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[lifecycleTone(state)]}`}
      >
        {LIFECYCLE_LABEL[state]}
      </span>
      {withHelp ? (
        <span className="text-xs text-ink-soft">{LIFECYCLE_HELP[state]}</span>
      ) : null}
    </span>
  );
}
