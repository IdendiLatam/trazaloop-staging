// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/lib/auth/require-session";
import { getUserOrganizations } from "@/lib/db/organizations";
import {
  selectActiveOrganizationAction,
} from "@/server/actions/organizations";
import { listMyPendingInvitationsAction } from "@/server/actions/team";
import { signOutAction } from "@/server/actions/auth";
import { CreateOrgForm } from "@/components/layout/create-org-form";
import { AcceptInviteForm } from "@/components/domain/team/accept-invite-form";
import { Wordmark } from "@/components/layout/logo";
import { RoleBadge } from "@/components/ui/badge";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import { ROLE_LABEL } from "@/lib/domain/team";

export default async function SelectOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireSession();
  const [organizations, pendingInvitations] = await Promise.all([
    getUserOrganizations(),
    listMyPendingInvitationsAction(),
  ]);
  const { error, notice } = await searchParams;

  // Corrección de onboarding (Parte 6, "implementación mínima aceptable"):
  // sin empresas y con UNA sola invitación pendiente, ir directo a
  // aceptarla en vez de mostrar una pantalla de "crear empresa" que
  // ignoraría la invitación. Con 2+ invitaciones, se listan abajo para
  // elegir. Nunca se hace este salto si el usuario YA tiene empresas: en
  // ese caso /select-org es su pantalla estable de cambio de empresa y no
  // debe redirigir sola.
  if (organizations.length === 0 && pendingInvitations.length === 1) {
    redirect(`/accept-invite?token=${encodeURIComponent(pendingInvitations[0].token)}`);
  }

  const hasOrganizations = organizations.length > 0;
  const hasInvitations = pendingInvitations.length > 0;
  const heading = hasOrganizations
    ? "Selecciona tu empresa"
    : hasInvitations
      ? "Tienes invitaciones pendientes"
      : "Crea tu primera empresa";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-8 p-6">
      <header className="space-y-4">
        <Wordmark />
        <div>
          <p className="eyebrow">Espacio de trabajo</p>
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        </div>
      </header>

      {notice === "invitation-already-accepted" ? (
        <InfoAlert message="Esa invitación ya había sido aceptada. Continúa desde aquí." />
      ) : null}
      {error === "not-member" ? (
        <ErrorAlert message="No perteneces a esa empresa. Selecciona una de tu lista." />
      ) : null}

      {hasOrganizations ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Tus empresas</h2>
          <ul className="space-y-2">
            {organizations.map((org) => (
              <li key={org.organizationId}>
                <form action={selectActiveOrganizationAction}>
                  <input type="hidden" name="organization_id" value={org.organizationId} />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-between rounded-lg border border-hairline bg-surface px-4 py-3 text-left transition-colors hover:border-loop"
                  >
                    <span className="font-medium">{org.organizationName}</span>
                    <RoleBadge role={org.roleCode} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasInvitations ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Invitaciones pendientes</h2>
          <p className="text-xs text-ink-soft">
            Tienes una invitación pendiente para unirte a una empresa en Trazaloop.
          </p>
          <ul className="space-y-2">
            {pendingInvitations.map((inv) => (
              <li
                key={inv.id}
                className="rounded-lg border border-hairline bg-surface px-4 py-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">{inv.organizationName}</span>
                  <RoleBadge role={inv.roleCode} />
                </div>
                <p className="mb-2 text-xs text-ink-soft">
                  Expira el {new Date(inv.expiresAt).toLocaleDateString("es-CO")} · como{" "}
                  {ROLE_LABEL[inv.roleCode]}
                </p>
                <AcceptInviteForm token={inv.token} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!hasOrganizations && !hasInvitations ? (
        <InfoAlert message="No perteneces todavía a ninguna empresa. Puedes crear una empresa o aceptar una invitación pendiente." />
      ) : null}

      {!hasOrganizations && !hasInvitations ? null : (
        <p className="text-xs text-ink-soft">
          Antes de crear una empresa, revisa si ya fuiste invitado a una organización existente.
        </p>
      )}

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">
          {hasOrganizations || hasInvitations ? "O crea una empresa nueva" : "Nueva empresa"}
        </h2>
        <CreateOrgForm />
      </section>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/settings/profile" className="text-loop hover:underline">
          Mi perfil
        </Link>
        <span className="text-ink-soft">·</span>
        <form action={signOutAction}>
          <button type="submit" className="text-ink-soft hover:underline">
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
