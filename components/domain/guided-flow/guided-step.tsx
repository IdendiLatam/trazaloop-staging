import type { ReactNode } from "react";

export type StepState = "completo" | "advertencia" | "pendiente";

const STATE: Record<StepState, { mark: string; tone: string; text: string }> = {
  completo: { mark: "✓", tone: "border-loop bg-loop text-white", text: "Completo" },
  advertencia: { mark: "!", tone: "border-amber bg-amber/10 text-amber", text: "Con advertencia" },
  pendiente: { mark: "·", tone: "border-hairline bg-surface text-ink-soft", text: "Pendiente" },
};

/** Paso del stepper guiado: número + estado con texto (no solo color) + contenido + acciones. */
export function GuidedStep({
  number,
  title,
  state,
  children,
  actions,
}: {
  number: number;
  title: string;
  state: StepState;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const s = STATE[state];
  return (
    <section
      aria-label={`Paso ${number}: ${title} (${s.text})`}
      className="relative rounded-lg border border-hairline bg-surface p-5 pl-14"
    >
      <span
        aria-hidden="true"
        className={`absolute left-4 top-5 flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold ${s.tone}`}
      >
        {number}
      </span>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {title}{" "}
          <span
            className={`ml-1 text-xs font-medium ${
              state === "completo" ? "text-loop-deep" : state === "advertencia" ? "text-amber" : "text-ink-soft"
            }`}
          >
            · {s.text}
          </span>
        </h2>
        {actions ? <div className="flex flex-wrap gap-2 text-sm">{actions}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
