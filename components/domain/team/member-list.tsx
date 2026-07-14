"use client";

import { useActionState } from "react";
import {
  updateMemberRoleAction,
  deactivateMemberAction,
  reactivateMemberAction,
  type TeamActionState,
} from "@/server/actions/team";
import { TEAM_ROLES, ROLE_LABEL } from "@/lib/domain/team";
import { RoleBadge } from "@/components/ui/badge";
import type { MemberRow } from "@/lib/db/team";
import { EmptyState } from "@/components/ui/empty-state";

const initial: TeamActionState = { error: null };

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  suspended: "Desactivado",
  revoked: "Revocado",
};

const STATUS_TONE: Record<string, string> = {
  active: "border-loop/30 bg-loop/5 text-loop-deep",
  suspended: "border-amber/40 bg-amber/10 text-amber",
  revoked: "border-hairline bg-paper text-ink-soft",
};

function MemberRowActions({ member, currentUserId }: { member: MemberRow; currentUserId: string }) {
  const [roleState, roleAction, rolePending] = useActionState(updateMemberRoleAction, initial);
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(
    deactivateMemberAction,
    initial
  );
  const [reactivateState, reactivateAction, reactivatePending] = useActionState(
    reactivateMemberAction,
    initial
  );

  const error = roleState.error ?? deactivateState.error ?? reactivateState.error;
  const isSelf = member.userId === currentUserId;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <form action={roleAction} className="flex items-center gap-1.5">
          <input type="hidden" name="membership_id" value={member.membershipId} />
          <select
            name="role_code"
            defaultValue={member.roleCode}
            disabled={rolePending}
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {TEAM_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </form>
        {member.status === "active" ? (
          <form action={deactivateAction}>
            <input type="hidden" name="membership_id" value={member.membershipId} />
            <button
              type="submit"
              disabled={deactivatePending || isSelf}
              title={isSelf ? "No puedes desactivar tu propio acceso" : undefined}
              className="text-xs text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deactivatePending ? "Desactivando…" : "Desactivar"}
            </button>
          </form>
        ) : (
          <form action={reactivateAction}>
            <input type="hidden" name="membership_id" value={member.membershipId} />
            <button
              type="submit"
              disabled={reactivatePending}
              className="text-xs text-loop hover:underline disabled:opacity-60"
            >
              {reactivatePending ? "Reactivando…" : "Reactivar"}
            </button>
          </form>
        )}
      </div>
      {error ? (
        <p role="alert" className="max-w-64 text-right text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Tabla de miembros actuales (Parte 6). Sin "último acceso": el esquema no
 *  lo registra (no se inventa esa columna). Sprint 8.1: la tabla SIEMPRE se
 *  muestra (incluido el propio usuario cuando es el único miembro); el
 *  aviso de "invita a tu equipo" aparece debajo, sin ocultar la tabla. */
export function MemberList({
  members,
  canManage,
  currentUserId,
}: {
  members: MemberRow[];
  canManage: boolean;
  currentUserId: string;
}) {
  const hasOnlySelf = members.length <= 1;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-ink-soft">
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Correo</th>
              <th className="px-4 py-2 font-medium">Rol</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Vinculado desde</th>
              {canManage ? <th className="px-4 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membershipId} className="border-b border-hairline last:border-0 align-top">
                <td className="px-4 py-2">
                  {m.fullName ?? "—"}
                  {m.userId === currentUserId ? (
                    <span className="ml-1.5 text-xs text-ink-soft">(tú)</span>
                  ) : null}
                </td>
                <td className="code px-4 py-2 text-xs">{m.email || "—"}</td>
                <td className="px-4 py-2">
                  <RoleBadge role={m.roleCode} />
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[m.status]}`}
                  >
                    {STATUS_LABEL[m.status]}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-ink-soft">
                  {new Date(m.memberSince).toLocaleDateString("es-CO")}
                </td>
                {canManage ? (
                  <td className="px-4 py-2 text-right">
                    <MemberRowActions member={m} currentUserId={currentUserId} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasOnlySelf ? (
        <EmptyState
          title="Todavía no hay otros usuarios en esta empresa."
          description="Invita a tu equipo para probar el flujo con roles reales."
        />
      ) : null}
    </div>
  );
}
