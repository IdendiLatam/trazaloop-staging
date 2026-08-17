// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Exige platform_staff activo.
//
// Parte 7: "El superadministrador puede ver el resumen de implementación
// de cada empresa desde la consola de plataforma, SIN CAMBIAR SU
// ORGANIZACIÓN ACTIVA." Esta página es exactamente eso — un resumen de
// solo lectura desde v_platform_organizations. No hay "entrar como
// soporte" en este sprint (opción avanzada, explícitamente opcional en el
// brief): no se cambia la cookie de organización activa del superadmin,
// no se crea membership.
//
// Sprint 10A (Bloqueante 6): se amplía con miembros/correos/roles/
// invitaciones pendientes (v_platform_organization_members/_invitations,
// 0055 — nunca accesibles para un usuario normal) y correo de
// contacto/teléfono de la empresa. "No disponible" cuando algo falta,
// nunca datos inventados.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { getPlatformOrganizationDetailAction } from "@/server/actions/platform";
import { getOrganizationPlanDetailAction } from "@/server/actions/plans";
import { getPlanLimits } from "@/lib/db/plans";
import { PLAN_LABEL } from "@/lib/plans/types";
import { PlanUsageCard } from "@/components/domain/plans/plan-usage-card";
import { PlanHistoryList } from "@/components/domain/plans/plan-history-list";
import { PlatformOrganizationMembers } from "@/components/domain/platform/platform-organization-members";
import { OrganizationModulesSection } from "@/components/domain/platform/organization-modules-section";
import { getPlatformOrganizationModulesAction } from "@/server/actions/platform-modules";
import { getOrganizationSupportSummaryAction } from "@/server/actions/support";

export default async function PlatformOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformStaff();
  const { id } = await params;
  const [{ org, members, invitations, legalAcceptances, onboarding }, planDetail, supportSummary, moduleDetail] = await Promise.all([
    getPlatformOrganizationDetailAction(id),
    getOrganizationPlanDetailAction(id),
    getOrganizationSupportSummaryAction(id),
    getPlatformOrganizationModulesAction(id),
  ]);
  if (!org) notFound();
  // RH-01.1: los límites que se muestran son los del PLAN EFECTIVO (0103),
  // no los del planCode legacy de organization_subscriptions.
  const planLimits = await getPlanLimits(planDetail.effectivePlanCode);

  const rows: [string, string | number][] = [
    ["Razón social", org.legalName ?? "No disponible"],
    ["NIT / identificación tributaria", org.taxId ?? "No disponible"],
    ["País", org.country ?? "No disponible"],
    ["Ciudad", org.city ?? "No disponible"],
    ["Correo de contacto", org.contactEmail ?? "No disponible"],
    ["Teléfono", org.phone ?? "No disponible"],
    ["Creada", new Date(org.createdAt).toLocaleDateString("es-CO")],
    ["Miembros activos", org.membersCount],
    ["Invitaciones pendientes", invitations.length],
    ["Materiales", org.materialsCount],
    ["Evidencias", org.evidencesCount],
    ["Lotes producidos / lotes finales", org.outputBatchesCount],
    ["Cálculos", org.calculationsCount],
    ["Solicitudes históricas abiertas", org.openFeedbackCount],
    ["Tickets históricos de alta prioridad", org.criticalFeedbackCount],
    ["Onboarding completado", onboarding ? `${onboarding.completedSteps} / ${onboarding.totalSteps} (${onboarding.progressPercent}%)` : "No disponible"],
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
          Resumen de implementación de solo lectura. Tu empresa activa no cambia al ver esta
          pantalla. Esta información no es visible para usuarios normales de la empresa.
        </p>
        {/* RH-01.1: el plan comercial vigente de la empresa, arriba de todo y
            derivado de organization_modules (0103) — nunca del planCode
            heredado de organization_subscriptions. */}
        <p className="flex flex-wrap items-center gap-2 pt-2 text-sm">
          <span className="text-ink-soft">Plan efectivo:</span>
          <span className="rounded-full border border-loop/30 bg-loop/5 px-2.5 py-0.5 font-semibold text-loop-deep">
            {PLAN_LABEL[planDetail.effectivePlanCode]}
          </span>
        </p>
      </header>

      {/* T9F.1: la sección OPERATIVA es "Módulos y planes de la empresa".
          El plan general legacy (organization_subscriptions) se muestra más
          abajo SOLO como información heredada: no gobierna los módulos y ya
          no es editable desde esta consola (el PlanChangeForm se retiró para
          eliminar el control comercial contradictorio). */}
      <OrganizationModulesSection
        organizationId={id}
        modules={moduleDetail.modules}
        canManage={moduleDetail.canManage}
      />

      {planDetail.usage ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Uso agregado · Plan heredado</h2>
          <p className="max-w-2xl text-xs text-ink-soft">
            El plan, los límites y la cuota de esta tarjeta son los del <strong>plan efectivo</strong>{" "}
            (derivado de los módulos, arriba): es lo mismo que aplica el servidor. El{" "}
            <strong>Plan heredado</strong> que aparece dentro de la tarjeta y el uso mostrado son el
            agregado HISTÓRICO a nivel de empresa que reporta la suscripción general
            (organization_subscriptions), conservados solo como referencia administrativa: desde
            T9F.1 <strong>no controlan</strong> el acceso ni el almacenamiento de los módulos, que se
            gestionan arriba en &ldquo;Módulos y planes de la empresa&rdquo;.
          </p>
          <PlanUsageCard
            usage={planDetail.usage}
            limits={planLimits}
            effectivePlanCode={planDetail.effectivePlanCode}
            effectiveStorageLimitBytes={planDetail.effectiveStorageLimitBytes}
          />
        </section>
      ) : null}

      <dl className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
            <dt className="text-ink-soft">{label}</dt>
            <dd className="code text-right">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="space-y-3">
        <h2 className="eyebrow">Miembros e invitaciones</h2>
        <PlatformOrganizationMembers members={members} invitations={invitations} />
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Aceptación de términos y privacidad</h2>
        {legalAcceptances.length === 0 ? (
          <p className="text-sm text-ink-soft">No disponible — ningún miembro ha aceptado todavía.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="px-3 py-2 font-medium">Usuario</th>
                  <th className="px-3 py-2 font-medium">Documento</th>
                  <th className="px-3 py-2 font-medium">Versión</th>
                  <th className="px-3 py-2 font-medium">Fecha de aceptación</th>
                </tr>
              </thead>
              <tbody>
                {legalAcceptances.map((a) => (
                  <tr key={`${a.userId}-${a.documentType}`} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-2 text-xs">{a.userName ?? a.userEmail}</td>
                    <td className="px-3 py-2 text-xs text-ink-soft">{a.documentType === "terms" ? "Términos de uso" : a.documentType === "privacy" ? "Política de privacidad" : "Tratamiento de datos"}</td>
                    <td className="code px-3 py-2 text-xs">{a.version}</td>
                    <td className="px-3 py-2 text-xs text-ink-soft">{new Date(a.acceptedAt).toLocaleString("es-CO")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Tickets de soporte</h2>
        <dl className="grid grid-cols-3 gap-3">
          {[
            { label: "Abiertos", value: supportSummary.openCount },
            { label: "Vencidos", value: supportSummary.overdueCount },
            { label: "En proceso", value: supportSummary.inProgressCount },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-hairline bg-surface p-3">
              <dd className="code text-lg font-semibold">{c.value}</dd>
              <dt className="mt-1 text-xs text-ink-soft">{c.label}</dt>
            </div>
          ))}
        </dl>
        {supportSummary.latest ? (
          <p className="text-xs text-ink-soft">
            Último ticket: {supportSummary.latest.subject} ({new Date(supportSummary.latest.createdAt).toLocaleDateString("es-CO")})
          </p>
        ) : (
          <p className="text-xs text-ink-soft">Esta empresa no ha creado tickets de soporte todavía.</p>
        )}
        <Link href={`/platform/support?org=${id}`} className="text-sm text-loop hover:underline">
          Ver todos los tickets de soporte →
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Historial de plan heredado</h2>
        <p className="text-xs text-ink-soft">
          Historial de la suscripción general anterior a los planes por módulo. Solo informativo.
        </p>
        <PlanHistoryList history={planDetail.history} />
      </section>
    </div>
  );
}
