import Link from "next/link";
import type { PlatformOrganizationRow } from "@/lib/db/platform";
import { PLAN_LABEL, type PlanCode } from "@/lib/plans/types";
import { EmptyState } from "@/components/ui/empty-state";

type PlanInfo = { planCode: PlanCode; storagePercentUsed: number };

/** Tabla de empresas registradas (Parte 6). No hay "entrar como soporte"
 *  en este sprint (Parte 7: opción avanzada, explícitamente opcional) —
 *  "Ver implementación" abre un resumen de solo lectura DENTRO de la
 *  consola de plataforma, sin cambiar la organización activa del
 *  superadmin ni crear ningún acceso silencioso.
 *  Sprint 10A: columna de Plan, con el % de almacenamiento usado. */
export function OrganizationsTable({
  organizations,
  planByOrgId = {},
}: {
  organizations: PlatformOrganizationRow[];
  planByOrgId?: Record<string, PlanInfo>;
}) {
  if (organizations.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay empresas registradas."
        description="Crea la primera desde “Nueva empresa”."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-xs text-ink-soft">
            <th className="px-3 py-2 font-medium">Empresa</th>
            {/* T9F.1: el plan mostrado es el LEGACY org-wide (informativo). Los
                planes reales por módulo se gestionan en el detalle de la empresa. */}
            <th className="px-3 py-2 font-medium">Plan heredado</th>
            <th className="px-3 py-2 font-medium">Razón social</th>
            <th className="px-3 py-2 font-medium">NIT</th>
            <th className="px-3 py-2 font-medium">País / ciudad</th>
            <th className="px-3 py-2 font-medium">Miembros</th>
            <th className="px-3 py-2 font-medium">Materiales</th>
            <th className="px-3 py-2 font-medium">Evidencias</th>
            <th className="px-3 py-2 font-medium">Lotes producidos</th>
            <th className="px-3 py-2 font-medium">Cálculos</th>
            <th className="px-3 py-2 font-medium">Solicitudes históricas</th>
            <th className="px-3 py-2 font-medium">Creada</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {organizations.map((org) => {
            const plan = planByOrgId[org.organizationId];
            return (
            <tr key={org.organizationId} className="border-b border-hairline last:border-0 align-top">
              <td className="px-3 py-2 font-medium">{org.organizationName}</td>
              <td className="px-3 py-2 text-xs">
                {plan ? (
                  <span className="inline-flex flex-col">
                    <span className="font-medium">{PLAN_LABEL[plan.planCode]}</span>
                    <span className="text-ink-soft">{plan.storagePercentUsed}% almacenamiento</span>
                    <span className="text-[10px] text-ink-soft">No gobierna los módulos</span>
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-2 text-xs text-ink-soft">{org.legalName ?? "—"}</td>
              <td className="code px-3 py-2 text-xs">{org.taxId ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-ink-soft">
                {[org.city, org.country].filter(Boolean).join(" / ") || "—"}
              </td>
              <td className="code px-3 py-2 text-xs">{org.membersCount}</td>
              <td className="code px-3 py-2 text-xs">{org.materialsCount}</td>
              <td className="code px-3 py-2 text-xs">{org.evidencesCount}</td>
              <td className="code px-3 py-2 text-xs">{org.outputBatchesCount}</td>
              <td className="code px-3 py-2 text-xs">{org.calculationsCount}</td>
              <td className="px-3 py-2">
                {org.openFeedbackCount > 0 ? (
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      org.criticalFeedbackCount > 0
                        ? "border-danger/30 bg-danger/5 text-danger"
                        : "border-amber/40 bg-amber/10 text-amber"
                    }`}
                  >
                    {org.openFeedbackCount}
                  </span>
                ) : (
                  <span className="text-xs text-ink-soft">0</span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-ink-soft">
                {new Date(org.createdAt).toLocaleDateString("es-CO")}
              </td>
              <td className="px-3 py-2 text-right text-xs">
                <Link href={`/platform/organizations/${org.organizationId}`} className="text-loop hover:underline">
                  Ver implementación
                </Link>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
