// Ruta protegida: depende de cookies/sesión/Supabase → nunca se prerenderiza.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getOrganizationBillingState } from "@/lib/db/billing";
import { listPublicPlanCatalog } from "@/lib/db/commercial-plans";
import { InfoAlert } from "@/components/ui/alert";
import { planLabel, money, longDate } from "@/lib/domain/billing-display";
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
  const [estado, catalogo] = await Promise.all([
    getOrganizationBillingState(org.organizationId),
    listPublicPlanCatalog(),
  ]);

  // Sin dato NO es «no hay planes»: es que no se pudo leer.
  const dePago = (catalogo ?? []).filter((p) => p.planCode !== "free");

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
            <dd>{estado.status}</dd>
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
      ) : null}

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
