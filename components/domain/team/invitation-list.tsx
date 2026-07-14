"use client";

import { useActionState } from "react";
import { revokeTeamInvitationAction, type TeamActionState } from "@/server/actions/team";
import { ROLE_LABEL } from "@/lib/domain/team";
import type { InvitationRow } from "@/lib/db/team";
import { EmptyState } from "@/components/ui/empty-state";

const initial: TeamActionState = { error: null };

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  expired: "Expirada",
  revoked: "Revocada",
};

const STATUS_TONE: Record<string, string> = {
  pending: "border-amber/40 bg-amber/10 text-amber",
  accepted: "border-loop/30 bg-loop/5 text-loop-deep",
  expired: "border-hairline bg-paper text-ink-soft",
  revoked: "border-hairline bg-paper text-ink-soft",
};

function RevokeButton({ invitationId }: { invitationId: string }) {
  const [state, formAction, pending] = useActionState(revokeTeamInvitationAction, initial);
  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="invitation_id" value={invitationId} />
        <button
          type="submit"
          disabled={pending}
          className="text-xs text-danger hover:underline disabled:opacity-60"
        >
          {pending ? "Revocando…" : "Revocar"}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

/** Tabla de invitaciones (Parte 2, sección 3; Parte 6). */
export function InvitationList({
  invitations,
  canManage,
}: {
  invitations: InvitationRow[];
  canManage: boolean;
}) {
  if (invitations.length === 0) {
    return (
      <EmptyState
        title="No hay invitaciones pendientes."
        description="Las invitaciones que crees aparecerán aquí con su estado."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-soft">
            <th className="px-4 py-2 font-medium">Correo</th>
            <th className="px-4 py-2 font-medium">Rol</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium">Invitado por</th>
            <th className="px-4 py-2 font-medium">Expira</th>
            {canManage ? <th className="px-4 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {invitations.map((inv) => (
            <tr key={inv.id} className="border-b border-hairline last:border-0 align-top">
              <td className="code px-4 py-2 text-xs">{inv.email}</td>
              <td className="px-4 py-2 text-xs">{ROLE_LABEL[inv.roleCode]}</td>
              <td className="px-4 py-2">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[inv.status]}`}
                >
                  {STATUS_LABEL[inv.status]}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-ink-soft">{inv.invitedByName ?? "—"}</td>
              <td className="px-4 py-2 text-xs text-ink-soft">
                {new Date(inv.expiresAt).toLocaleDateString("es-CO")}
              </td>
              {canManage ? (
                <td className="px-4 py-2 text-right">
                  {inv.status === "pending" ? <RevokeButton invitationId={inv.id} /> : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
