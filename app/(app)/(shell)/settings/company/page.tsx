// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanySettingsAction } from "@/server/actions/settings";
import { CompanySettingsForm } from "@/components/domain/settings/company-settings-form";

export default async function CompanySettingsPage() {
  const { data: company, canManage } = await getCompanySettingsAction();
  if (!company) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/settings/profile" className="hover:underline">
            Configuración
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Datos de empresa</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Actualiza la información básica de la organización activa.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link
            href="/settings/profile"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a Mi perfil
          </Link>
          <Link
            href="/team"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a Equipo
          </Link>
        </div>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <CompanySettingsForm company={company} canManage={canManage} />
      </section>
    </div>
  );
}
