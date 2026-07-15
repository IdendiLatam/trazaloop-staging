// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Exige platform_staff activo; el
// formulario en sí solo funciona para superadmin (el server action y la
// RPC lo vuelven a exigir).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { CreateOrganizationForm } from "@/components/domain/platform/create-organization-form";
import { InfoAlert } from "@/components/ui/alert";

export default async function NewPlatformOrganizationPage() {
  const { isSuperadmin } = await requirePlatformStaff();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/platform" className="hover:underline">
            Plataforma
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva empresa</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Crea una organización desde la consola interna y vincula o invita a su administrador
          inicial.
        </p>
      </header>

      {isSuperadmin ? (
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <CreateOrganizationForm />
        </section>
      ) : (
        <InfoAlert message="Solo un superadministrador de plataforma puede crear empresas desde esta consola." />
      )}
    </div>
  );
}
