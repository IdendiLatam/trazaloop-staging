const STATUS: Record<string, { label: string; tone: string }> = {
  incomplete: {
    label: "Trazabilidad incompleta",
    tone: "border-danger/30 bg-danger/5 text-danger",
  },
  complete_with_warnings: {
    label: "Completa con advertencias",
    tone: "border-amber/40 bg-amber/10 text-amber",
  },
  complete: {
    label: "Completa",
    tone: "border-loop/30 bg-loop/5 text-loop-deep",
  },
};

export function TraceabilityStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.incomplete;
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.tone}`}>
      {s.label}
    </span>
  );
}
