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
import { listAllOrganizationUsage, listOrganizationEffectivePlanCodes } from "@/lib/db/plans";
import { OrganizationsTable } from "@/components/domain/platform/organizations-table";
import { PlatformStaffList } from "@/components/domain/platform/staff-list";

export default async function PlatformPage() {
  await requirePlatformStaff();
  const [overview, organizations, staff, usage] = await Promise.all([
    getPlatformOverviewAction(),
    listPlatformOrganizationsAction(),
    listPlatformStaffAction(),
    listAllOrganizationUsage(),
  ]);
  // RH-01.1: el dato comercial principal de la consola es el PLAN EFECTIVO
  // (organization_modules vía 0103), no el planCode legacy de
  // organization_subscriptions — ese solo se conserva rotulado como
  // histórico/administrativo junto al uso agregado.
  const effectivePlanByOrgId = await listOrganizationEffectivePlanCodes(
    organizations.map((o) => o.organizationId)
  );
  const usageByOrgId = new Map(usage.map((u) => [u.organizationId, u]));
  // PE-04B2 · El plan efectivo puede venir como `null` = «no se pudo
  // determinar», y se pasa tal cual.
  //
  // Antes esta línea decía `?? "demo"`: un fallo de lectura se pintaba como
  // «Plan Demo», indistinguible de una empresa que de verdad está en el suelo.
  // Es la mitad del defecto que este tramo cierra; la otra mitad era leer la
  // suscripción legacy, que ya no manda.
  const planByOrgId = Object.fromEntries(
    organizations.map((o) => {
      const u = usageByOrgId.get(o.organizationId) ?? null;
      return [
        o.organizationId,
        {
          effectivePlanCode: effectivePlanByOrgId[o.organizationId] ?? null,
          legacyPlanCode: u?.planCode ?? null,
          storagePercentUsed: u?.storagePercentUsed ?? null,
        },
      ];
    })
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Plataforma</p>
        <h1 className="text-2xl font-semibold tracking-tight">Administración de plataforma</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Vista interna para acompañar empresas, revisar empresas registradas y apoyar la
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
            href="/platform/plans"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Planes y uso
          </Link>
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
            { label: "Tickets abiertos", value: overview.totalOpenTickets },
            { label: "Tickets urgentes", value: overview.totalUrgentTickets },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-hairline bg-surface p-4">
              <dd className="code text-xl font-semibold">{c.value}</dd>
              <dt className="mt-1 text-xs text-ink-soft">{c.label}</dt>
            </div>
          ))}
        </dl>
        <Link href="/platform/support" className="text-sm text-loop hover:underline">
          Ver todos los tickets de soporte →
        </Link>
      </section>

      {/* 2 y 3. Empresas registradas (con su actividad de implementación en
          las mismas columnas: materiales/evidencias/lotes/cálculos). */}
      <section className="space-y-3">
        <h2 className="eyebrow">Empresas registradas</h2>
        <OrganizationsTable organizations={organizations} planByOrgId={planByOrgId} />
      </section>

      {/* 4. Tickets de soporte — ya resumidos arriba (Sprint 10C); el
          detalle vive en /platform/support y en cada empresa (Ver
          implementación) para no duplicar el motor de tickets. */}

      {/* PE-03B4 · GAP 1 · Las consolas de contenido, a la vista.
          Existían las cinco y ninguna se nombraba en esta página: para llegar a
          los tutoriales había que encontrarlos en la barra lateral o saberse la
          dirección. Un panel que no enseña sus destinos obliga a recordarlos. */}
      <section className="space-y-3">
        <h2 className="eyebrow">Contenido de la plataforma</h2>
        <p className="text-sm text-ink-soft">
          Lo que Trazaloop publica para todas las empresas.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/platform/tutorials", title: "Tutoriales",
              hint: "Los vídeos de cada pantalla y el de bienvenida." },
            { href: "/platform/faq", title: "Preguntas frecuentes",
              hint: "Las respuestas que ve cualquiera, dentro y fuera." },
            { href: "/platform/help", title: "Ayuda del producto",
              hint: "La ayuda contextual de cada pantalla." },
            { href: "/platform/legal", title: "Documentos legales",
              hint: "Términos y política de privacidad, con su historia." },
            { href: "/platform/trazadocs", title: "Estructuras TrazaDocs",
              hint: "Las plantillas documentales que heredan las empresas." },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="block rounded-lg border border-hairline bg-surface p-4 hover:border-loop"
            >
              <span className="block text-sm font-semibold text-ink">{c.title}</span>
              <span className="mt-1 block text-xs text-ink-soft">{c.hint}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 5. Accesos rápidos + personal de plataforma. */}
      <section className="space-y-3">
        <h2 className="eyebrow">Personal de plataforma</h2>
        <PlatformStaffList staff={staff.data} canManage={staff.canManage} />
      </section>
    </div>
  );
}
