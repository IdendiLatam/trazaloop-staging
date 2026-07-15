// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Exige platform_staff activo.
//
// Parte 7: "El superadministrador puede ver el resumen de implementación
// de cada empresa desde la consola de plataforma, SIN CAMBIAR SU
// ORGANIZACIÓN ACTIVA." Esta página es exactamente eso — un resumen de
// solo lectura desde v_platform_organizations. No hay "entrar como
// soporte" en este sprint (opción avanzada, explícitamente opcional en el
// brief): no se cambia la cookie de organización activa del superadmin,
// no se crea membership, no se accede a datos fila por fila de la
// empresa — solo a los conteos agregados ya expuestos por la vista.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { getPlatformOrganizationDetailAction } from "@/server/actions/platform";

export default async function PlatformOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformStaff();
  const { id } = await params;
  const org = await getPlatformOrganizationDetailAction(id);
  if (!org) notFound();

  const rows: [string, string | number][] = [
    ["Razón social", org.legalName ?? "—"],
    ["NIT / identificación tributaria", org.taxId ?? "—"],
    ["País", org.country ?? "—"],
    ["Ciudad", org.city ?? "—"],
    ["Creada", new Date(org.createdAt).toLocaleDateString("es-CO")],
    ["Miembros activos", org.membersCount],
    ["Materiales", org.materialsCount],
    ["Evidencias", org.evidencesCount],
    ["Lotes producidos / lotes finales", org.outputBatchesCount],
    ["Cálculos", org.calculationsCount],
    ["Feedback abierto", org.openFeedbackCount],
    ["Feedback crítico", org.criticalFeedbackCount],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/platform" className="hover:underline">
            Plataforma
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{org.organizationName}</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Resumen de implementación de solo lectura. Tu organización activa no cambia al ver esta
          pantalla.
        </p>
      </header>

      <dl className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
            <dt className="text-ink-soft">{label}</dt>
            <dd className="code text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
