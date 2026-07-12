// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import { requireSession } from "@/lib/auth/require-session";
import { getUserOrganizations } from "@/lib/db/organizations";
import { selectActiveOrganizationAction } from "@/server/actions/organizations";
import { signOutAction } from "@/server/actions/auth";
import { CreateOrgForm } from "@/components/layout/create-org-form";
import { Wordmark } from "@/components/layout/logo";
import { RoleBadge } from "@/components/ui/badge";
import { ErrorAlert } from "@/components/ui/alert";

export default async function SelectOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSession();
  const organizations = await getUserOrganizations();
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-8 p-6">
      <header className="space-y-4">
        <Wordmark />
        <div>
          <p className="eyebrow">Espacio de trabajo</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {organizations.length > 0
              ? "Selecciona tu empresa"
              : "Crea tu primera empresa"}
          </h1>
        </div>
      </header>

      {error === "not-member" ? (
        <ErrorAlert message="No perteneces a esa empresa. Selecciona una de tu lista." />
      ) : null}

      {organizations.length > 0 ? (
        <ul className="space-y-2">
          {organizations.map((org) => (
            <li key={org.organizationId}>
              <form action={selectActiveOrganizationAction}>
                <input
                  type="hidden"
                  name="organization_id"
                  value={org.organizationId}
                />
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
      ) : null}

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">
          {organizations.length > 0 ? "O crea una empresa nueva" : "Nueva empresa"}
        </h2>
        <CreateOrgForm />
      </section>

      <form action={signOutAction}>
        <button type="submit" className="text-sm text-ink-soft hover:underline">
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
