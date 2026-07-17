import Link from "next/link";
import type { PlanCode, PlanStatus } from "@/lib/plans/types";

/** Banner discreto de plan Demo (Parte 8) — solo en Demo, nunca en
 *  Full/Extra. Nunca menciona pagos. */
export function DemoPlanBanner({ planCode }: { planCode: PlanCode }) {
  if (planCode !== "demo") return null;

  return (
    <div id="plan" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm">
      <p className="text-amber">
        Estás usando el plan Demo. Puedes explorar la plataforma con límites de uso. Para ampliar
        el acceso, contacta al equipo de Trazaloop desde el Centro de soporte.
      </p>
      <div className="flex shrink-0 gap-2">
        <Link
          href="/dashboard#plan-usage"
          className="rounded-md border border-amber/40 bg-surface px-3 py-1.5 text-xs font-medium text-amber hover:bg-amber/10"
        >
          Ver límites del plan
        </Link>
        <Link
          href="/support/new?category=plan"
          className="rounded-md bg-amber px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          Crear ticket sobre plan
        </Link>
      </div>
    </div>
  );
}

/** Aviso de cuenta suspendida/cancelada (Parte 16) — distinto del banner
 *  Demo: aparece en CUALQUIER plan si la suscripción no está activa. */
export function AccountStatusBanner({ planStatus }: { planStatus: PlanStatus }) {
  if (planStatus === "active") return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm">
      <p className="text-danger">
        La cuenta de esta empresa no está activa. Puedes contactar al equipo de Trazaloop desde el
        Centro de soporte.
      </p>
      <Link
        href="/support/new?category=account"
        className="shrink-0 rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
      >
        Crear ticket sobre cuenta
      </Link>
    </div>
  );
}
