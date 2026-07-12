import {
  READINESS_LABEL,
  READINESS_TONE,
  type ReadinessLevel,
} from "@/lib/domain/guided-flow";

/** El color nunca es el único indicador: el badge siempre lleva texto. */
export function ReadinessBadge({ level }: { level: ReadinessLevel }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${READINESS_TONE[level]}`}
    >
      {READINESS_LABEL[level]}
    </span>
  );
}
