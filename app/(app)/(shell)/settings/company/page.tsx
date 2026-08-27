// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCompanySettingsAction, getOrganizationProfileAction,
} from "@/server/actions/settings";
import { CompanySettingsForm } from "@/components/domain/settings/company-settings-form";
import { OrganizationProfileForm } from "@/components/domain/settings/organization-profile-form";
import { LogoUploadForm } from "@/components/domain/settings/logo-upload-form";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

export default async function CompanySettingsPage() {
  const [{ data: company, canManage }, perfil] = await Promise.all([
    getCompanySettingsAction(),
    getOrganizationProfileAction(),
  ]);
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
        <div className="pt-1">
          <ExportPdfButton exportKey="core.company.detail" />
        </div>
        <p className="max-w-2xl text-sm text-ink-soft">
          Actualiza la información básica de la empresa activa.
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
        <LogoUploadForm logoUrl={company.logoUrl} logoStoragePath={company.logoStoragePath} canManage={canManage} />
      </section>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <CompanySettingsForm company={company} canManage={canManage} />
      </section>

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-ink">A qué se dedica la empresa</h2>
          <p className="text-xs text-ink-soft">
            Opcional, y se puede completar en cualquier momento.
          </p>
        </div>
        <OrganizationProfileForm
          profile={perfil.profile} sectors={perfil.sectors} canManage={perfil.canManage} />
      </section>
    </div>
  );
}
