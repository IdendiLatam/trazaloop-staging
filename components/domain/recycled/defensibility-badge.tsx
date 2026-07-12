import { LEVEL_LABEL, type DefensibilityLevel } from "@/lib/db/recycled";

const TONE: Record<DefensibilityLevel, string> = {
  preliminary: "border-danger/30 bg-danger/5 text-danger",
  with_warnings: "border-amber/40 bg-amber/10 text-amber",
  defensible: "border-loop/30 bg-loop/5 text-loop-deep",
};

export function DefensibilityBadge({ level }: { level: DefensibilityLevel }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[level]}`}
    >
      {LEVEL_LABEL[level]}
    </span>
  );
}
