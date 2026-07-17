import type { PlatformOrganizationMemberRow, PlatformOrganizationInvitationRow } from "@/lib/db/platform";
import { ROLE_LABEL, isTeamRole } from "@/lib/domain/team";
import { EmptyState } from "@/components/ui/empty-state";

/** Miembros e invitaciones pendientes de una empresa (Bloqueante 6,
 *  Sprint 10A) — solo visible desde /platform/organizations/[id], nunca
 *  para usuarios normales: la vista que alimenta esto ya exige
 *  is_platform_staff() (0055). "No disponible" en vez de inventar datos
 *  cuando algo falta. */
export function PlatformOrganizationMembers({
  members,
  invitations,
}: {
  members: PlatformOrganizationMemberRow[];
  invitations: PlatformOrganizationInvitationRow[];
}) {
  const admin = members.find((m) => m.roleCode === "admin" && m.status === "active");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-hairline bg-surface p-3 text-sm">
        <span className="text-ink-soft">Administrador principal: </span>
        <span className="font-medium">
          {admin ? `${admin.fullName ?? "Sin nombre"} (${admin.email})` : "No disponible"}
        </span>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Miembros ({members.length})</h3>
        {members.length === 0 ? (
          <EmptyState title="Sin miembros activos." description="" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Correo</th>
                  <th className="px-3 py-2 font-medium">Rol</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-2">{m.fullName ?? "No disponible"}</td>
                    <td className="code px-3 py-2 text-xs">{m.email}</td>
                    <td className="px-3 py-2 text-xs">{isTeamRole(m.roleCode) ? ROLE_LABEL[m.roleCode] : m.roleCode}</td>
                    <td className="px-3 py-2 text-xs">{m.status === "active" ? "Activo" : m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Invitaciones pendientes ({invitations.length})</h3>
        {invitations.length === 0 ? (
          <EmptyState title="Sin invitaciones pendientes." description="" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="px-3 py-2 font-medium">Correo</th>
                  <th className="px-3 py-2 font-medium">Rol</th>
                  <th className="px-3 py-2 font-medium">Expira</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.email} className="border-b border-hairline last:border-0">
                    <td className="code px-3 py-2 text-xs">{inv.email}</td>
                    <td className="px-3 py-2 text-xs">{isTeamRole(inv.roleCode) ? ROLE_LABEL[inv.roleCode] : inv.roleCode}</td>
                    <td className="px-3 py-2 text-xs text-ink-soft">
                      {new Date(inv.expiresAt).toLocaleDateString("es-CO")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
