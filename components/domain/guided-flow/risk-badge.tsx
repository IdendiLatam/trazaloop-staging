export function RiskBadge({ risk }: { risk: boolean }) {
  return risk ? (
    <span className="inline-flex rounded-full border border-danger/30 bg-danger/5 px-2.5 py-0.5 text-xs font-medium text-danger">
      Riesgo declarado
    </span>
  ) : null;
}
