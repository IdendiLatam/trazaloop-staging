// Ruta protegida: depende de cookies/sesión/Supabase → nunca se prerenderiza.
export const dynamic = "force-dynamic";

import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getOrganizationBillingState } from "@/lib/db/billing";
import { listPaymentHistory } from "@/lib/db/billing-history";
import { readCommercialCatalog } from "@/lib/db/commercial-catalog";
import { getOrganizationCommercialState } from "@/lib/db/commercial-state";
import {
  getOrganizationTimeStatus, getAiCreditStatus,
} from "@/lib/db/organization-usage";
import { summarizeBilling } from "@/lib/domain/billing-experience";
import {
  presentStorage, presentAiCredits, presentTrialAi, presentTime,
} from "@/lib/domain/usage-presentation";
import { MyPlanCard } from "@/components/domain/billing/my-plan-card";
import { UsagePanel } from "@/components/domain/billing/usage-panel";
import { PlanOptions } from "@/components/domain/billing/plan-options";
import { InfoAlert } from "@/components/ui/alert";
import { planLabel, money, longDate } from "@/lib/domain/billing-display";
import { renewalCopyFor } from "@/lib/domain/billing-renewal-copy";
import { PlanDecisions } from "@/components/domain/billing/plan-decisions";
import { RenewalPanel } from "@/components/domain/billing/renewal-panel";
import { resolveUpgradeAvailability } from "@/lib/billing/upgrade-availability";
import {
  resolveExtraAction, extraActionNote, extraActionNeedsContact, CONTACT_HREF,
} from "@/lib/billing/extra-action";
import { RecurringCancelPanel }
  from "@/components/domain/billing/recurring-cancel-panel";
import { findLiveRecurring } from "@/lib/db/recurring-checkout";
import { isRecurringLaneOpen } from "@/lib/billing/recurring/policy";
import { PendingCheckoutPanel } from "@/components/domain/billing/pending-checkout-panel";
import { UpgradePanel } from "@/components/domain/billing/upgrade-panel";
import { storageImpactOf } from "@/lib/db/storage-impact";
import {
  pendingUpgrade, upgradeNeedingAction,
} from "@/lib/db/billing-upgrade";
import Link from "next/link";
import { findOpenOneTimeCheckout } from "@/lib/db/one-time-checkout";
import { resolvePurchaseRoutingFromEnv, paymentFlowOf } from "@/lib/billing/purchase-routing";
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
  const [estado, catalogo, historial, subidaEnCurso, subidaRequiereAccion,
         cobroEnCurso, comercial, tiempo, creditos, espacioActual]
    = await Promise.all([
    getOrganizationBillingState(org.organizationId),
    // COMMERCIAL-UX-01F · El MISMO catálogo que /planes. No hay un segundo
    // sitio donde vivan los precios y los límites.
    readCommercialCatalog(),
    listPaymentHistory(org.organizationId),
    pendingUpgrade(org.organizationId),
    // BILLING-EXTRA-01D · Y lo que tiene dinero SIN resolver, que no es lo
    // mismo: ahí no se le ofrece a nadie pagar otra vez.
    upgradeNeedingAction(org.organizationId),
    // 01B.4 · Un pago único abierto y sin confirmar. Es lo que ve quien cerró
    // la ventana de la pasarela: no tiene a dónde volver, así que el botón de
    // comprobar tiene que estar en la pantalla a la que sí vuelve.
    findOpenOneTimeCheckout(org.organizationId),
    getOrganizationCommercialState(org.organizationId),
    getOrganizationTimeStatus(org.organizationId),
    getAiCreditStatus(org.organizationId),
    storageImpactOf(org.organizationId, null),
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

  // Bajar de Extra a Full puede dejar a la empresa por encima del espacio del
  // plano nuevo. Se comprueba ANTES de que nadie confirme nada.
  const espacio = estado?.planCode === "extra"
    ? await storageImpactOf(org.organizationId, null) : null;

  // ── COMMERCIAL-UX-01F · El resumen de «Mi plan» ───────────────────────────
  //
  // Toda la decisión de QUÉ se cuenta vive en una función pura y probada. Aquí
  // solo se le pasan los hechos que las autoridades ya dijeron.
  const enPrueba = comercial.grantKind === "trial";
  const resumen = summarizeBilling({
    hasSubscription: estado === null ? null : estado.hasSubscription,
    contractedPlanCode: comercial.contractedPlanCode,
    effectivePlanCode: comercial.effectivePlanCode,
    grantKind: comercial.grantKind,
    grantEndsAt: comercial.grantEndsAt,
    currentPeriodEnd: estado?.currentPeriodEnd ?? null,
    renewsAt: estado?.renewsAt ?? null,
    cancelAtPeriodEnd: estado?.cancelAtPeriodEnd ?? false,
    hasLiveRecurring: recurrenteViva !== null,
    renewalMode: estado?.renewalMode ?? null,
    subscriptionStatus: estado?.status ?? null,
    manualReview: estado?.manualReview ?? false,
    downgradeScheduled: estado?.downgradeScheduled ?? false,
    paymentMethodMissing: estado?.paymentMethodMissing ?? false,
    pendingCheckout: cobroEnCurso !== null,
    isAdmin: esAdministrador,
  }, longDate);

  // El nombre COMERCIAL del plan efectivo, del catálogo. Nunca un código.
  // BILLING-EXTRA-01D · QUÉ SE PUEDE OFRECER SOBRE EXTRA, y por qué camino.
  //
  // Una sola autoridad. La pantalla no decide entre comprar, subir o no ofrecer
  // nada: pregunta, y pinta lo que le digan. Las mismas reglas gobiernan
  // `/planes`, así que no pueden contradecirse.
  const accionExtra = resolveExtraAction({
    billingState: resumen.state,
    effectivePlanCode: comercial.effectivePlanCode,
    renewalMode: estado?.renewalMode ?? null,
    // La FORMA de cobro de ESTA suscripción, no la del despliegue: conviven
    // empresas de las dos pasarelas y migrarlas por comodidad sería moverle a
    // alguien su medio de pago sin pedírselo. Se traduce aquí para que el
    // resolutor no tenga que saber cómo se llama ninguna.
    paymentFlow: paymentFlowOf(estado?.provider ?? null),
    upgradeInFlight: subidaEnCurso !== null,
    upgradeNeedsAction: subidaRequiereAccion !== null,
    isAdmin: esAdministrador,
    storedSourceUpgradeAvailable: mejora.transactional,
  });

  const planEfectivo = comercial.effectivePlanCode ?? estado?.planCode ?? "free";
  const fichaPlan = catalogo?.saasPlans.find((p) => p.code === planEfectivo) ?? null;
  const nombrePlan = fichaPlan?.headline
    ?? planLabel(planEfectivo);

  // ── El consumo, con su modo ya resuelto ───────────────────────────────────
  const usoEspacio = presentStorage(
    espacioActual?.usedBytes ?? null, espacioActual?.currentQuotaBytes ?? null);
  const usoCreditos = presentAiCredits(
    creditos?.monthlyUsed ?? null, creditos?.monthlyLimit ?? null,
    creditos?.limitState ?? null);
  const usoPrueba = enPrueba && creditos?.trialActive
    ? presentTrialAi(creditos.trialTotal, creditos.trialUsed)
    : { mode: "unknown" as const };
  const usoTiempo = presentTime(tiempo === null ? null : {
    metered: tiempo.metered,
    dailyLimit: tiempo.dailyLimit, monthlyLimit: tiempo.monthlyLimit,
    dailyUsed: tiempo.dailyUsed, monthlyUsed: tiempo.monthlyUsed,
    isTrial: enPrueba,
  });

  /**
   * El botón de cada plan en la comparación contextual.
   *
   * COMMERCIAL-UX-01B/01D · Extra NO ofrece una acción transaccional mientras
   * el carril que la cobra no pueda cobrarla. Se ofrece hablar, que es lo único
   * que de verdad se puede cumplir.
   */
  const ctaDePlan = (code: string): { label: string; href: string } | null => {
    if (!esAdministrador) return null;
    if (code === comercial.contractedPlanCode && !enPrueba) return null;
    if (code === "free") return null;
    if (code === "extra" && !mejora.transactional) {
      return { label: "Hablemos de Extra", href: "mailto:contacto@idendi.org" };
    }
    return {
      label: enPrueba ? "Contratar" : "Cambiar a este plan",
      href: moduleAwareHref(
        `/settings/billing/checkout?plan=${code}&interval=monthly`, activeModule.key),
    };
  };


  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Configuración</p>
        <h1 className="text-2xl font-semibold tracking-tight">Mi plan</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Qué tiene {org.organizationName}, qué está usando y qué opciones hay.
        </p>
      </header>

      {/* 1 · RESUMEN · lo primero, y muchas veces lo único que se lee. */}
      <MyPlanCard planName={nombrePlan} summary={resumen} isTrial={enPrueba} />

      {/* 2 · CONSUMO · con «ilimitado» dicho como ilimitado, nunca como cero. */}
      <UsagePanel
        medidas={[
          { titulo: "Almacenamiento", uso: usoEspacio },
          { titulo: "Créditos de Intelligence", uso: usoCreditos },
          ...(usoPrueba.mode !== "unknown"
            ? [{ titulo: "Créditos de la prueba", uso: usoPrueba,
                 nota: "La prueba trae su propia bolsa: no se suma a la mensual "
                     + "de un plan contratado." }]
            : []),
          { titulo: "Uso de la plataforma", uso: usoTiempo },
        ]}
      />

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
      {/* COMMERCIAL-UX-01G · Y NO se ofrece renovar a mano lo que se va a
          cobrar solo. `recurrenteViva` solo ve el carril del proveedor: una
          suscripción del carril de la plataforma pasaba el filtro y leía
          «Renovar Full» justo debajo de «se renueva solo». Alguien podía pagar
          dos veces por el mismo mes.

          La pregunta la responde el resumen, que ya distingue los dos carriles;
          preguntarla otra vez aquí sería una tercera copia de la misma regla. */}
      {esAdministrador && recurrenteViva === null
        && resumen.state !== "PROVIDER_ACTIVE" ? (
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

      {/* BILLING-EXTRA-01D · La acción sobre Extra, decidida en un solo sitio.
          Antes esto eran seis condiciones encadenadas aquí mismo, y cada estado
          nuevo —una subida en el aire, un cobro sin resolver— obligaba a añadir
          otra y a acordarse de las cinco anteriores. */}
      {accionExtra.kind === "upgrade" ? (
        <section className="rounded-md border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Pasar a Extra</h2>
          <div className="pt-2">
            <UpgradePanel targetPlanCode="extra" renewsAt={estado?.renewsAt ?? null} />
          </div>
        </section>
      ) : accionExtra.kind === "purchase" ? (
        <section className="rounded-md border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Pasar a Extra</h2>
          <p className="pb-3 pt-1 text-sm text-ink-soft">
            Extra se contrata como cualquier otro plan: verás el importe exacto
            antes de pagar.
          </p>
          <Link href={moduleAwareHref("/settings/billing/checkout?plan=extra",
                                      activeModule.key)}
                className="inline-flex rounded-md bg-loop px-4 py-2 text-sm
                           font-medium text-white">
            Empezar con Extra
          </Link>
        </section>
      ) : extraActionNote(accionExtra) !== null ? (
        <section className="rounded-md border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Extra</h2>
          <p className="pt-1 text-sm text-ink-soft">
            {extraActionNote(accionExtra)}
          </p>
          {extraActionNeedsContact(accionExtra) ? (
            <a href={CONTACT_HREF}
               className="inline-flex pt-2 text-sm font-medium text-loop-deep
                          underline">
              Escríbenos
            </a>
          ) : null}
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

      {/* COMMERCIAL-UX-01F · Las otras opciones, con el catálogo de 01C. No se
          duplica /planes: esto es un resumen contextual con enlace al detalle. */}
      {catalogo === null ? (
        <p className="text-sm text-ink-soft">
          No pudimos leer el catálogo de planes. Vuelve a intentarlo en un momento.
        </p>
      ) : (
        <PlanOptions
          planes={catalogo.saasPlans}
          servicios={catalogo.services}
          currentPlanCode={comercial.contractedPlanCode ?? estado?.planCode ?? "free"}
          isTrial={enPrueba}
          ctaFor={ctaDePlan}
        />
      )}

    </div>
  );
}
