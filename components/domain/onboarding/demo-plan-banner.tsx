import Link from "next/link";
import type { CommercialTier, PlanStatus } from "@/lib/plans/types";
import type { EstadoComercial } from "@/lib/plans/commercial-display";
import { esAccesoDePrueba } from "@/lib/plans/commercial-display";

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
 *
 * STABILIZATION-01 · `tier` pasa a ser el plan CONTRATADO, y mientras haya una
 * prueba viva este aviso calla: quien está en Demo ve el suyo, que explica las
 * dos bolsas de créditos y el tiempo. Enseñar los dos a la vez sería contarle
 * a alguien que está en Free justo cuando tiene acceso de Full.
 */
export function DemoPlanBanner({
  tier, estado,
}: {
  tier: CommercialTier | null;
  estado?: EstadoComercial;
}) {
  if (tier !== "free") return null;
  if (estado && esAccesoDePrueba(estado)) return null;

  return (
    <div id="plan" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm">
      <p className="text-amber">
        Estás usando el plan Free. Puedes trabajar con los límites incluidos y consultar
        toda la información que ya creaste. Para ampliar el acceso, activa Full.
      </p>
      <div className="flex shrink-0 gap-2">
        <Link
          href="/dashboard#plan-usage"
          className="rounded-md border border-amber/40 bg-surface px-3 py-1.5 text-xs font-medium text-amber hover:bg-amber/10"
        >
          Ver límites del plan
        </Link>
        <Link
          href="/settings/billing"
          className="rounded-md bg-amber px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          Activar Full
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
