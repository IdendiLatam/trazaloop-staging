// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Además exige platform_staff activo
// (requirePlatformStaff) — nunca visible ni accesible para usuarios de
// empresa normales, sin importar su rol de membership.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import {
  getPlatformOverviewAction,
  listPlatformOrganizationsAction,
  listPlatformStaffAction,
} from "@/server/actions/platform";
import { OrganizationsTable } from "@/components/domain/platform/organizations-table";
import { PlatformStaffList } from "@/components/domain/platform/staff-list";

export default async function PlatformPage() {
  await requirePlatformStaff();
  const [overview, organizations, staff] = await Promise.all([
    getPlatformOverviewAction(),
    listPlatformOrganizationsAction(),
    listPlatformStaffAction(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Plataforma</p>
        <h1 className="text-2xl font-semibold tracking-tight">Administración de plataforma</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Vista interna para acompañar empresas, revisar organizaciones registradas y apoyar la
          implementación.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          {overview.isSuperadmin ? (
            <Link
              href="/platform/organizations/new"
              className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              Nueva empresa
            </Link>
          ) : null}
          <Link
            href="/select-org"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Ir a mi empresa
          </Link>
        </div>
      </header>

      {/* 1. Resumen de plataforma */}
      <section className="space-y-3">
        <h2 className="eyebrow">Resumen de plataforma</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: "Empresas registradas", value: overview.organizationsCount },
            { label: "Empresas con implementación activa", value: overview.organizationsWithImplementationActivity },
            { label: "Miembros totales", value: overview.totalMembers },
            { label: "Feedback abierto", value: overview.totalOpenFeedback },
            { label: "Feedback crítico", value: overview.totalCriticalFeedback },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-hairline bg-surface p-4">
              <dd className="code text-xl font-semibold">{c.value}</dd>
              <dt className="mt-1 text-xs text-ink-soft">{c.label}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* 2 y 3. Empresas registradas (con su actividad de implementación en
          las mismas columnas: materiales/evidencias/lotes/cálculos). */}
      <section className="space-y-3">
        <h2 className="eyebrow">Empresas registradas</h2>
        <OrganizationsTable organizations={organizations} />
      </section>

      {/* 4. Feedback abierto — ya resumido arriba; el detalle vive en cada
          empresa (Ver implementación) para no duplicar el motor de
          feedback del Sprint 6. */}

      {/* 5. Accesos rápidos + personal de plataforma. */}
      <section className="space-y-3">
        <h2 className="eyebrow">Personal de plataforma</h2>
        <PlatformStaffList staff={staff.data} canManage={staff.canManage} />
      </section>
    </div>
  );
}
