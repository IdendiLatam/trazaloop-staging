// Ruta protegida: depende de cookies/sesión/Supabase → nunca se prerenderiza.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getOrganizationBillingState } from "@/lib/db/billing";
import { listPaymentHistory } from "@/lib/db/billing-history";
import { listPublicPlanCatalog } from "@/lib/db/commercial-plans";
import { InfoAlert } from "@/components/ui/alert";
import { planLabel, money, longDate } from "@/lib/domain/billing-display";
import { describeBillingState } from "@/lib/domain/billing-state";
import { PlanDecisions } from "@/components/domain/billing/plan-decisions";
import {
  activeShellModuleFrom, moduleAwareHref,
} from "@/lib/modules/registry";

/**
 * Trazaloop · PE-05B2W4 · Plan y facturación de la empresa.
 *
 * No hay un segundo catálogo ni una segunda verdad de precios: el catálogo
 * público sale de la vista que ya publica PE-04, y el estado de facturación
 * de la primitiva de B1. Esta pantalla solo los junta.
 *
 * Free no entra en la contratación con tarjeta: es el plan de entrada.
 */

/** En palabras. Nunca el estado interno ni una clase de fallo. */
const ESTADO_COBRO: Record<string, string> = {
  pagado: "Pagado",
  rechazado: "Rechazado",
  no_completado: "No se completó",
  en_revision: "En verificación",
};

const dinero = (minor: number | null, moneda: string | null) =>
  minor === null || moneda === null ? null : money(minor, moneda);

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // PT-03A · Esta pantalla es transversal: sus enlaces tienen que devolver el
  // shell al módulo desde el que se entró, no a PCR.
  const activeModule = activeShellModuleFrom("/settings/billing", await searchParams);
  const org = await requireActiveOrg();
  const esAdministrador = org.roleCode === "admin";
  const [estado, catalogo, historial] = await Promise.all([
    getOrganizationBillingState(org.organizationId),
    listPublicPlanCatalog(),
    listPaymentHistory(org.organizationId),
  ]);

  // Sin dato NO es «no hay planes»: es que no se pudo leer.
  const dePago = (catalogo ?? []).filter((p) => p.planCode !== "free");

  const situacion = describeBillingState({
    status: estado?.status ?? null,
    hasSubscription: estado?.hasSubscription ?? false,
    graceUntil: estado?.graceUntil ?? null,
    cancelScheduled: estado?.cancelAtPeriodEnd ?? false,
    downgradeScheduled: estado?.downgradeScheduled ?? false,
    manualReview: estado?.manualReview ?? false,
    paymentMethodMissing: estado?.paymentMethodMissing ?? false,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Configuración</p>
        <h1 className="text-2xl font-semibold tracking-tight">Plan y facturación</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Qué plan tiene {org.organizationName} y cómo cambiarlo.
        </p>
      </header>

      <section className="rounded-md border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Ahora mismo</h2>
        {estado !== null && estado.hasSubscription && situacion.state !== "active" ? (
          <p className="pt-2 text-sm text-ink-soft">{situacion.detail}</p>
        ) : null}
        {estado === null ? (
          <p className="pt-2 text-sm text-ink-soft">
            No pudimos leer el estado de facturación. Vuelve a intentarlo en un momento.
          </p>
        ) : estado.hasSubscription ? (
          <dl className="grid grid-cols-2 gap-2 pt-2 text-sm">
            <dt className="text-ink-soft">Plan</dt>
            <dd className="font-medium">{planLabel(estado.planCode)}</dd>
            <dt className="text-ink-soft">Facturación</dt>
            <dd>{estado.billingInterval === "annual" ? "Anual" : "Mensual"}</dd>
            <dt className="text-ink-soft">Estado</dt>
            {/*
              Nunca el estado interno. `past_due` no le dice nada a nadie, y
              «rechazado» sería una afirmación que a veces no podemos sostener.
            */}
            <dd>{situacion.title}</dd>
            {estado.renewsAt ? (
              <>
                <dt className="text-ink-soft">Siguiente cobro</dt>
                <dd>{longDate(estado.renewsAt)}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="pt-2 text-sm text-ink-soft">
            La empresa está en el plan de entrada. No hay ningún cobro programado.
          </p>
        )}
      </section>

      {!esAdministrador ? (
        <InfoAlert message="Tu rol permite consultar el plan, pero no contratarlo." />
      ) : estado?.hasSubscription ? (
        <section className="rounded-md border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Cambiar o cancelar</h2>
          <p className="pb-3 pt-1 text-sm text-ink-soft">
            Ninguna de las dos cosas corta nada hoy: surten efecto cuando termina
            el periodo que ya pagaste.
          </p>
          <PlanDecisions
            planCode={estado.planCode}
            currentPeriodEnd={estado.currentPeriodEnd}
            cancelScheduled={estado.cancelAtPeriodEnd}
            scheduledPlanLabel={estado.downgradeScheduled ? "el plan programado" : null}
          />
        </section>
      ) : null}

      {historial === null || historial.length === 0 ? null : (
        <section className="rounded-md border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Tus cobros</h2>
          <p className="pb-3 pt-1 text-sm text-ink-soft">
            Cada línea es lo que se cobró aquel día, con su descuento y sus
            impuestos de entonces. No es una factura electrónica.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 pr-3 font-medium">Descuento</th>
                  <th className="py-2 pr-3 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((c) => (
                  <tr key={c.id} className="border-b border-hairline/60">
                    <td className="py-2 pr-3">{longDate(c.paidAt ?? c.createdAt)}</td>
                    <td className="py-2 pr-3">
                      {planLabel(c.planCode)}
                      {c.billingInterval
                        ? ` · ${c.billingInterval === "annual" ? "anual" : "mensual"}` : ""}
                    </td>
                    {/* En palabras, no en código ni solo en color. */}
                    <td className="py-2 pr-3">{ESTADO_COBRO[c.status]}</td>
                    <td className="py-2 pr-3">
                      {c.discountAmount > 0 ? `−${money(c.discountAmount, c.currency)}` : "—"}
                    </td>
                    <td className="py-2 pr-3 font-medium">
                      {money(c.totalAmount, c.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Planes de pago</h2>
        {catalogo === null ? (
          <p className="text-sm text-ink-soft">
            No pudimos leer el catálogo de planes. Vuelve a intentarlo en un momento.
          </p>
        ) : dePago.length === 0 ? (
          <p className="text-sm text-ink-soft">No hay planes de pago publicados.</p>
        ) : (
          dePago.map((p) => (
            <article key={p.planCode}
                     className="rounded-md border border-hairline bg-surface p-4">
              <h3 className="font-medium">{p.displayName}</h3>
              {p.description ? (
                <p className="pt-1 text-sm text-ink-soft">{p.description}</p>
              ) : null}
              {p.priceState !== "configured" ? (
                <p className="pt-2 text-sm text-ink-soft">
                  Este plan todavía no tiene precio publicado.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 pt-3">
                  {([["monthly", p.monthlyPriceMinor, "Mensual"],
                     ["annual", p.annualPriceMinor, "Anual"]] as const)
                    .filter(([, minor]) => minor !== null)
                    .map(([intervalo, minor, etiqueta]) => (
                      <Link
                        key={intervalo}
                        href={esAdministrador
                          ? moduleAwareHref(
                              `/settings/billing/checkout?plan=${p.planCode}`
                              + `&interval=${intervalo}`, activeModule.key)
                          : moduleAwareHref("/settings/billing", activeModule.key)}
                        aria-disabled={!esAdministrador}
                        className={"rounded-md border border-hairline px-3 py-1.5 text-sm "
                          + (esAdministrador
                            ? "hover:border-loop"
                            : "pointer-events-none opacity-50")}
                      >
                        {etiqueta} · {dinero(minor, p.currency)} + impuestos
                      </Link>
                    ))}
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
