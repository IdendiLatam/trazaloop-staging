import { TEAM_ROLES, ROLE_LABEL, ROLE_DESCRIPTION } from "@/lib/domain/team";

/** Explicación de roles (Parte 3 y Parte 2, sección 5). Solo los 3 roles
 *  reales del sistema — no se inventan 'user' ni 'viewer'. */
export function RoleHelp() {
  return (
    <dl className="space-y-3">
      {TEAM_ROLES.map((role) => (
        <div key={role} className="rounded-lg border border-hairline bg-surface p-4">
          <dt className="text-sm font-semibold">{ROLE_LABEL[role]}</dt>
          <dd className="mt-1 text-sm text-ink-soft">{ROLE_DESCRIPTION[role]}</dd>
        </div>
      ))}
    </dl>
  );
}
