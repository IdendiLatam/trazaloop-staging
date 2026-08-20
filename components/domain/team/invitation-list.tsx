"use client";

import { useActionState, useState } from "react";
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

/**
 * Enlace copiable de una invitación pendiente.
 *
 * Es la pieza que faltaba. El token existía en la base y la página de
 * aceptación lo leía bien, pero el enlace solo aparecía UNA vez, en el
 * resultado de crear la invitación. Quien cambiaba de pantalla lo perdía y no
 * tenía manera de recuperarlo, así que acababa abriendo `/accept-invite` a
 * secas — y recibía «El enlace no incluye un token de invitación válido».
 */
function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-1 flex items-center gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Enlace de invitación"
        className="code w-full min-w-0 rounded-md border border-hairline bg-paper px-2 py-1 text-[11px]"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Sin permiso de portapapeles el campo sigue siendo seleccionable.
          }
        }}
        className="shrink-0 rounded-md border border-hairline bg-surface px-2 py-1 text-[11px] font-medium hover:border-loop"
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

/** Tabla de invitaciones (Parte 2, sección 3; Parte 6). */
export function InvitationList({
  invitations,
  canManage,
  appOrigin,
}: {
  invitations: InvitationRow[];
  canManage: boolean;
  /** Origen real de la aplicación, resuelto en servidor. */
  appOrigin: string;
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
              <td className="px-4 py-2 text-xs">
                <span className="code">{inv.email}</span>
                {inv.status === "pending" && canManage ? (
                  <InviteLink url={`${appOrigin}/accept-invite?token=${encodeURIComponent(inv.token)}`} />
                ) : null}
              </td>
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
