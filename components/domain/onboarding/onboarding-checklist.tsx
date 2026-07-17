import Link from "next/link";
import type { ResolvedOnboardingStep } from "@/lib/domain/onboarding";
import { ONBOARDING_STEP_STATUS_LABEL, REVIEW_PLAN_LIMITS_STEP } from "@/lib/domain/onboarding";

const STATUS_TONE: Record<string, string> = {
  pending: "border-hairline bg-paper text-ink-soft",
  in_progress: "border-amber/40 bg-amber/10 text-amber",
  completed: "border-loop/30 bg-loop/5 text-loop-deep",
};

export function OnboardingChecklist({ steps }: { steps: ResolvedOnboardingStep[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((step) => (
        <li
          key={step.key}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface p-4"
        >
          <div>
            <p className="text-sm font-medium">
              {step.order}. {step.title}
            </p>
            <p className="text-xs text-ink-soft">{step.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[step.status]}`}>
              {ONBOARDING_STEP_STATUS_LABEL[step.status]}
            </span>
            {step.status !== "completed" ? (
              <Link href={step.href} className="text-sm font-medium text-loop hover:underline">
                Ir →
              </Link>
            ) : (
              <Link href={step.href} className="text-xs text-ink-soft hover:underline">
                Ver
              </Link>
            )}
          </div>
        </li>
      ))}
      {/* Paso 8: puramente de navegación, nunca marcado completo por
          datos (lib/domain/onboarding.ts) — siempre visible como acción
          disponible. */}
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-paper p-4">
        <div>
          <p className="text-sm font-medium">
            {REVIEW_PLAN_LIMITS_STEP.order}. {REVIEW_PLAN_LIMITS_STEP.title}
          </p>
          <p className="text-xs text-ink-soft">{REVIEW_PLAN_LIMITS_STEP.description}</p>
        </div>
        <Link href={REVIEW_PLAN_LIMITS_STEP.href} className="text-sm font-medium text-loop hover:underline">
          Ver límites →
        </Link>
      </li>
    </ol>
  );
}
