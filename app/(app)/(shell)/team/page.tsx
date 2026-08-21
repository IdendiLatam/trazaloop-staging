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
import { resolveAppOrigin } from "@/lib/auth/invitation-link";
import {
  moduleAwareHref,
  resolveShellModuleForPath,
  SHELL_MODULE_PARAM,
} from "@/lib/modules/registry";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireSession();
  const org = await requireActiveOrg();
  // QUALITY-01.2 · Los accesos rápidos de esta cabecera eran cuatro rutas de
  // PCR (/implementation, /imports, /evidences, /traceability) puestas en una
  // pantalla TRANSVERSAL. Una empresa que solo tenga Quality los veía y, al
  // pulsarlos, el guard de PCR la devolvía al selector. Ahora salen de la
  // navegación del módulo desde el que se llegó, igual que el menú lateral.
  const params = await searchParams;
  const rawModule = params[SHELL_MODULE_PARAM];
  const activeModule = resolveShellModuleForPath(
    "/team",
    Array.isArray(rawModule) ? rawModule[0] : rawModule
  );
  const shortcuts = [...activeModule.topLevel, ...(activeModule.groups[0]?.items ?? [])].slice(0, 4);
  const [members, invitations] = await Promise.all([
    listOrganizationMembersAction(),
    listTeamInvitationsAction(),
  ]);
  const canManage = canManageTeam(org.roleCode);
  // El enlace de cada invitación pendiente se resuelve EN SERVIDOR, con el
  // origen real de esta petición. Antes solo existía en el resultado efímero
  // de crear la invitación: quien navegaba a otra pantalla lo perdía para
  // siempre y no había forma de volver a obtenerlo — el defecto que dejaba a
  // la persona invitada abriendo /accept-invite sin token.
  const appOrigin = await resolveAppOrigin();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Equipo</p>
        <h1 className="text-2xl font-semibold tracking-tight">Equipo de la empresa</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Administra usuarios, roles y accesos dentro de la empresa activa.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {shortcuts.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
            >
              Ir a {item.label}
            </Link>
          ))}
          <Link
            href={moduleAwareHref("/settings/profile", activeModule.key)}
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
        <InvitationList invitations={invitations} canManage={canManage} appOrigin={appOrigin} />
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
