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
import { renewalCopyFor } from "@/lib/domain/billing-renewal-copy";
import { PlanDecisions } from "@/components/domain/billing/plan-decisions";
import { RenewalPanel } from "@/components/domain/billing/renewal-panel";
import { resolveUpgradeAvailability } from "@/lib/billing/upgrade-availability";
import { RecurringCancelPanel }
  from "@/components/domain/billing/recurring-cancel-panel";
import { findLiveRecurring } from "@/lib/db/recurring-checkout";
import { isRecurringLaneOpen } from "@/lib/billing/recurring/policy";
import { PendingCheckoutPanel } from "@/components/domain/billing/pending-checkout-panel";
import { UpgradePanel } from "@/components/domain/billing/upgrade-panel";
import { storageImpactOf } from "@/lib/db/storage-impact";
import { pendingUpgrade } from "@/lib/db/billing-upgrade";
import { findOpenOneTimeCheckout } from "@/lib/db/one-time-checkout";
import { resolvePurchaseRoutingFromEnv } from "@/lib/billing/purchase-routing";
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

/** Qué fue cada cobro. Una renovación no es una contratación, y un cambio de
 *  plan no es ninguna de las dos. */
const CONCEPTO: Record<string, string> = {
  suscripcion: "Suscripción",
  renovacion: "Renovación",
  cambio_de_plan: "Cambio de plan",
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

  /*
    PROD-LAUNCH-01E · El nombre de la pasarela llega como DATO.

    Escribirlo aquí a mano metería una marca de pasarela en un fichero de
    interfaz, y la frontera declarada es de servidor y ninguno de interfaz —hay
    un guardián de release que lo vigila, con razón—. Sale de la misma
    autoridad que decide quién cobra, así que si mañana cobra otra, este texto
    dice la verdad sin que nadie se acuerde de cambiarlo.

    Si no hay pasarela resuelta, la frase se queda sin nombrarla: lo que de
    verdad hay que declarar es a nombre de QUIÉN se cobra.
  */
  const rutaDePago = resolvePurchaseRoutingFromEnv();
  const pasarela = rutaDePago.available ? rutaDePago.displayName : null;
  const esAdministrador = org.roleCode === "admin";
  const [estado, catalogo, historial, subidaEnCurso, cobroEnCurso] = await Promise.all([
    getOrganizationBillingState(org.organizationId),
    listPublicPlanCatalog(),
    listPaymentHistory(org.organizationId),
    pendingUpgrade(org.organizationId),
    // 01B.4 · Un pago único abierto y sin confirmar. Es lo que ve quien cerró
    // la ventana de la pasarela: no tiene a dónde volver, así que el botón de
    // comprobar tiene que estar en la pantalla a la que sí vuelve.
    findOpenOneTimeCheckout(org.organizationId),
  ]);

  // Bajar de plan puede dejar a la empresa por encima del espacio del plan
  // nuevo. Las dos cifras se traen ANTES de que nadie confirme nada.
  // MP-REC-01C.2 · Con la recurrencia cancelada, la fecha NO es un próximo
  // cobro: es hasta cuándo llega lo pagado. Titularla «Siguiente cobro» en la
  // misma pantalla que confirma que no habrá más cobros es contradecirse.
  const cobrosDetenidos = Boolean(estado?.cancelAtPeriodEnd)
    || estado?.status === "cancel_at_period_end"
    || estado?.status === "ended";
  const copiaRenovacion = renewalCopyFor(estado?.renewalMode ?? null, cobrosDetenidos);
  // MP-REC-01C.1 · ¿Hay cobros programados con la pasarela? Decide DOS cosas:
  // si se ofrece cancelarlos, y si se esconde la renovación manual. Lo segundo
  // es la defensa visible contra el doble cobro; la de verdad está en el
  // servicio, que se niega aunque alguien llegue por otro camino.
  const recurrenteViva = isRecurringLaneOpen()
    ? await findLiveRecurring(org.organizationId) : null;
  // El nombre visible de la pasarela llega como DATO desde la autoridad de
  // proveedor. Esta pantalla no sabe —ni debe saber— cuál es.
  // COMMERCIAL-UX-01B · ¿Puede completarse una mejora con cobro en este
  // despliegue? El carril que la cobra no es el de la contratación, y hoy
  // pueden ser pasarelas distintas.
  const mejora = resolveUpgradeAvailability();
  const rutaCompra = recurrenteViva !== null ? resolvePurchaseRoutingFromEnv() : null;
  const providerName = rutaCompra !== null && rutaCompra.available
    ? rutaCompra.displayName : "la pasarela";

  const revisionDestino = estado?.planCode === "extra"
    ? ((catalogo ?? []).find((p) => p.planCode === "full")?.planRevisionId ?? null)
    : null;
  const espacio = revisionDestino
    ? await storageImpactOf(org.organizationId, revisionDestino) : null;

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
                {/* 01B.9 · «Siguiente cobro» solo cuando alguien va a cobrar.
                    Con pago único la fecha es un vencimiento, y prometer un
                    cargo que no llega hace que la gente se despreocupe justo
                    antes de quedarse sin plan. */}
                <dt className="text-ink-soft">{copiaRenovacion.dateLabel}</dt>
                <dd>{longDate(estado.renewsAt)}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="pt-2 text-sm text-ink-soft">
            La empresa está en el plan de entrada. No hay ningún cobro programado.
          </p>
        )}
        {estado?.hasSubscription && copiaRenovacion.note ? (
          <p className="pt-2 text-sm text-ink-soft">{copiaRenovacion.note}</p>
        ) : null}
      </section>

      {esAdministrador && cobroEnCurso !== null ? (
        <PendingCheckoutPanel
          checkoutId={cobroEnCurso.id}
          amountLabel={money(cobroEnCurso.expectedTotalAmount, cobroEnCurso.expectedCurrency)}
          initPoint={cobroEnCurso.initPoint}
        />
      ) : null}

      {/* PROD-LAUNCH-01B.1 · El plan de pago único no se renueva solo, así que
          aquí se dice cuándo vence y se ofrece renovarlo. Los avisos de siete,
          tres y un día se derivan de la fecha al pintar: no hay proceso
          programado detrás, y no hace falta. */}
      {esAdministrador && recurrenteViva === null ? (
        <RenewalPanel
          planCode={estado?.planCode ?? null}
          billingInterval={estado?.billingInterval ?? null}
          periodEndsAt={estado?.renewsAt ?? null}
          nowIso={new Date().toISOString()}
        />
      ) : null}

      {esAdministrador && recurrenteViva !== null ? (
        <RecurringCancelPanel
          authorizationId={recurrenteViva.authorizationId}
          paidThroughLabel={recurrenteViva.paidThrough
            ? longDate(recurrenteViva.paidThrough) : null}
          providerName={providerName}
        />
      ) : null}

      {/* COMMERCIAL-UX-01B · El panel TRANSACCIONAL de mejora solo aparece si el
          carril que la cobra puede cobrarla. Antes se ofrecía siempre, y con
          Mercado Pago —que no guarda medios de pago— el botón contestaba «no
          disponible» al pulsarlo. Un botón muerto en una pantalla de dinero es
          una promesa que el producto no puede cumplir. */}
      {esAdministrador && estado?.hasSubscription && estado.planCode === "full"
        && !estado.cancelAtPeriodEnd && !estado.downgradeScheduled
        && mejora.transactional ? (
        <section className="rounded-md border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Subir a Extra</h2>
          {subidaEnCurso ? (
            <InfoAlert message={
              "Estamos confirmando el pago del cambio a Extra. En cuanto se "
              + "confirme, el plan queda activo. Tu plan actual sigue funcionando "
              + "mientras tanto."} />
          ) : (
            <div className="pt-2">
              <UpgradePanel targetPlanCode="extra" renewsAt={estado.renewsAt} />
            </div>
          )}
        </section>
      ) : null}

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
            billingInterval={estado.billingInterval}
            currentPeriodEnd={estado.currentPeriodEnd}
            cancelScheduled={estado.cancelAtPeriodEnd}
            scheduledPlanLabel={estado.downgradeScheduled ? "el plan programado" : null}
            /* COMMERCIAL-UX-01B · UNA SOLA CANCELACIÓN POR ESTADO.
               Con una recurrencia viva ya existe «Cancelar renovación
               automática», que detiene los cobros en la pasarela. «Cancelar el
               plan» de aquí programa la cancelación canónica y NO toca la
               preapproval: alguien podría cancelar creyendo que deja de pagar y
               seguir siendo cobrado el mes siguiente. Dos botones que parecen lo
               mismo y hacen cosas distintas, en dinero, no pueden convivir. */
            offersCancellation={recurrenteViva !== null
              ? false : copiaRenovacion.offersCancellation}
            storageUsedBytes={espacio?.usedBytes ?? null}
            targetStorageBytes={espacio?.targetQuotaBytes ?? null}
          />
        </section>
      ) : null}

      {historial === null || historial.length === 0 ? null : (
        <section className="rounded-md border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Tus cobros</h2>
          {/* PROD-LAUNCH-01E · UNA sola vez, y aquí.

              La pantalla previa al pago ya lo dice, pero esa se lee una vez y
              en el momento de comprar. Esta es la que se abre semanas después,
              con el extracto delante, para averiguar qué fue un cargo que no
              se reconoce — y ahí el nombre que aparece en el banco no es
              «Trazaloop». Por eso no es una repetición: son dos preguntas
              distintas en dos momentos distintos.

              Va en la cabecera de la sección y no en cada fila: repetirlo por
              cobro sería ruido. */}
          <p className="pt-1 text-xs text-ink-soft">
            Los pagos de Trazaloop son procesados{pasarela ? ` por ${pasarela}` : ""} a
            nombre de IDENDI Latam.
          </p>
          <p className="pb-3 pt-1 text-sm text-ink-soft">
            Cada línea es lo que se cobró aquel día, con su descuento y sus
            impuestos de entonces. No es una factura electrónica.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Concepto</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium">Periodicidad</th>
                  <th className="py-2 pr-3 font-medium">Base</th>
                  <th className="py-2 pr-3 font-medium">Descuento</th>
                  <th className="py-2 pr-3 font-medium">Impuestos</th>
                  <th className="py-2 pr-3 font-medium">Total</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((c) => (
                  <tr key={c.id} className="border-b border-hairline/60">
                    <td className="py-2 pr-3">{longDate(c.paidAt ?? c.createdAt)}</td>
                    <td className="py-2 pr-3">
                      {CONCEPTO[c.concept]}
                      {c.changeSummary ? ` · ${c.changeSummary}` : ""}
                    </td>
                    {/* El plan de ENTONCES, no el de hoy. Si no consta, se dice. */}
                    <td className="py-2 pr-3">
                      {c.planCode ? planLabel(c.planCode) : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {c.billingInterval
                        ? (c.billingInterval === "annual" ? "Anual" : "Mensual") : "—"}
                    </td>
                    <td className="py-2 pr-3">{money(c.baseAmount, c.currency)}</td>
                    <td className="py-2 pr-3">
                      {c.discountAmount > 0 ? `−${money(c.discountAmount, c.currency)}` : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {money(c.taxAmount, c.currency)}
                      {c.taxRateBasisPoints !== null
                        ? ` (${(c.taxRateBasisPoints / 100).toFixed(0)} %)` : ""}
                    </td>
                    <td className="py-2 pr-3 font-medium">
                      {money(c.totalAmount, c.currency)}
                    </td>
                    {/* En palabras, no en código ni solo en color. */}
                    <td className="py-2 pr-3">{ESTADO_COBRO[c.status]}</td>
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
