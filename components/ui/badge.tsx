const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  quality: "Responsable de calidad",
  consultant: "Consultor externo",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-hairline bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-soft">
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

export function ModuleBadge({
  name,
  enabled,
}: {
  name: string;
  enabled: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        enabled
          ? "border-loop/30 bg-loop/5 text-loop-deep"
          : "border-hairline bg-surface text-ink-soft"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-loop" : "bg-hairline"}`}
        aria-hidden="true"
      />
      {name}
    </span>
  );
}
