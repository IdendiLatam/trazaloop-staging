import Link from "next/link";
import type { CommercialTier, PlanStatus } from "@/lib/plans/types";

/**
 * Aviso discreto del plan gratuito — solo en Free, nunca en Full ni Extra.
 * Nunca menciona pagos.
 *
 * PE-04B6 · Decía «Estás usando el plan Demo» y lo decidía con
 * `organization_subscriptions.plan_code`, la copia administrativa heredada. Un
 * cliente Full cuya fila heredada siguiera diciendo `demo` leía en su panel que
 * estaba en Demo: es exactamente el defecto que PE-04B2 cerró en la consola y
 * que sobrevivía aquí, en la pantalla del propio cliente.
 *
 * Ahora se decide con el nivel comercial CANÓNICO y se llama por su nombre:
 * Free. Y `null` —«no se pudo determinar»— no pinta nada: afirmar un plan que
 * no se pudo leer es la mitad del defecto original.
 */
export function DemoPlanBanner({ tier }: { tier: CommercialTier | null }) {
  if (tier !== "free") return null;

  return (
    <div id="plan" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm">
      <p className="text-amber">
        Estás usando el plan Free. Puedes trabajar con los límites incluidos. Para ampliar
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
