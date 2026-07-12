import Link from "next/link";

export type ProgressStatus = "pendiente" | "en progreso" | "completo" | "con advertencias";

const STATUS_TONE: Record<ProgressStatus, string> = {
  pendiente: "border-hairline text-ink-soft",
  "en progreso": "border-loop/30 bg-loop/5 text-loop-deep",
  completo: "border-loop/30 bg-loop/5 text-loop-deep",
  "con advertencias": "border-amber/40 bg-amber/10 text-amber",
};

/** Tarjeta de avance del flujo guiado: estado con texto, contadores y CTA. */
export function ProgressStepCard({
  step,
  title,
  status,
  lines,
  actionLabel,
  actionHref,
}: {
  step: number;
  title: string;
  status: ProgressStatus;
  lines: string[];
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <div className="flex flex-col justify-between rounded-lg border border-hairline bg-surface p-4">
      <div>
        <p className="flex items-center justify-between gap-2">
          <span className="eyebrow">
            {step}. {title}
          </span>
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status]}`}
          >
            {status}
          </span>
        </p>
        <ul className="mt-2 space-y-0.5 text-sm text-ink-soft">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      <Link
        href={actionHref}
        className="mt-3 inline-block text-sm font-medium text-loop hover:underline"
      >
        {actionLabel} →
      </Link>
    </div>
  );
}
