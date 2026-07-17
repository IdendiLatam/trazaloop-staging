export function OnboardingProgressCard({
  completedSteps,
  totalSteps,
  progressPercent,
}: {
  completedSteps: number;
  totalSteps: number;
  progressPercent: number;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Progreso de onboarding</span>
        <span className="code text-ink-soft">
          {completedSteps} / {totalSteps} pasos ({progressPercent}%)
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper">
        <div
          className="h-full rounded-full bg-loop"
          style={{ width: `${Math.min(100, progressPercent)}%` }}
        />
      </div>
    </div>
  );
}
