// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import {
  listOrganizationMembersAction,
  listTeamInvitationsAction,
} from "@/server/actions/team";
import { canManageTeam } from "@/lib/domain/team";
import { MemberList } from "@/components/domain/team/member-list";
import { InvitationList } from "@/components/domain/team/invitation-list";
import { InviteUserForm } from "@/components/domain/team/invite-user-form";
import { RoleHelp } from "@/components/domain/team/role-help";

export default async function TeamPage() {
  const { user } = await requireSession();
  const org = await requireActiveOrg();
  const [members, invitations] = await Promise.all([
    listOrganizationMembersAction(),
    listTeamInvitationsAction(),
  ]);
  const canManage = canManageTeam(org.roleCode);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Equipo</p>
        <h1 className="text-2xl font-semibold tracking-tight">Equipo de la empresa</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Administra usuarios, roles y accesos dentro de la empresa activa.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/implementation"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a Implementación
          </Link>
          <Link
            href="/imports"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a Importaciones
          </Link>
          <Link
            href="/evidences"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a Evidencias
          </Link>
          <Link
            href="/traceability"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a Trazabilidad
          </Link>
          <Link
            href="/settings/profile"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Mi perfil
          </Link>
        </div>
      </header>

      {/* 1. Organización activa */}
      <section className="rounded-lg border border-loop/30 bg-loop/5 p-4">
        <p className="eyebrow mb-1">Empresa activa</p>
        <p className="text-lg font-semibold text-loop-deep">{org.organizationName}</p>
      </section>

      {/* 2. Miembros actuales */}
      <section className="space-y-3">
        <h2 className="eyebrow">Miembros actuales</h2>
        <MemberList members={members} canManage={canManage} currentUserId={user.id} />
      </section>

      {/* 3. Invitaciones pendientes */}
      <section className="space-y-3">
        <h2 className="eyebrow">Invitaciones</h2>
        <InvitationList invitations={invitations} canManage={canManage} />
      </section>

      {/* 4. Invitar usuario */}
      <section className="space-y-3">
        <h2 className="eyebrow">Invitar usuario</h2>
        {canManage ? (
          <div className="rounded-lg border border-hairline bg-surface p-5">
            <InviteUserForm />
          </div>
        ) : (
          <p className="rounded-md border border-hairline bg-surface px-4 py-3 text-sm text-ink-soft">
            Tu rol no permite administrar usuarios de esta empresa.
          </p>
        )}
      </section>

      {/* 5. Explicación de roles */}
      <section className="space-y-3">
        <h2 className="eyebrow">Roles</h2>
        <RoleHelp />
      </section>
    </div>
  );
}
