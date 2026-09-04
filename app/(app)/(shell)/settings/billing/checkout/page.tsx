// Ruta protegida: depende de cookies/sesión/Supabase → nunca se prerenderiza.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createBillingQuote, QUOTE_ERROR_MESSAGE } from "@/lib/db/billing";
import { createServerClient } from "@/lib/supabase/server";
import { findLiveCheckout, getWompiPublicConfig } from "@/lib/db/billing-checkout";
import { WompiCardForm } from "@/components/domain/billing/wompi-card-form";
import { CheckoutWatcher } from "@/components/domain/billing/checkout-watcher";
import { ErrorAlert } from "@/components/ui/alert";
import {
  activeShellModuleFrom, moduleAwareHref,
} from "@/lib/modules/registry";

/**
 * Trazaloop · PE-05B2W4 · Pagar el plan elegido.
 *
 * EL ORDEN IMPORTA: primero el presupuesto, después la tarjeta.
 *
 * El importe se calcula en el servidor —plan, revisión, tipo de cambio, regla
 * fiscal— y se congela en el intento. Lo que ve quien paga es una copia de eso;
 * ningún número que salga del navegador se lee después.
 *
 * Si no se puede presupuestar —sin tipo de cambio vigente, por ejemplo— la
 * pantalla dice qué falta y no enseña ningún formulario. No se inventa un
 * precio para poder cobrar.
 */

const pesos = (minor: number) => new Intl.NumberFormat("es-CO",
  { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(minor);

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // PT-03A · Transversal: el enlace de vuelta conserva el módulo activo.
  const activeModule = activeShellModuleFrom("/settings/billing/checkout", params);
  const volver = moduleAwareHref("/settings/billing", activeModule.key);
  const plan = typeof params.plan === "string" ? params.plan : "";
  const intervalo = params.interval === "annual" ? "annual" : "monthly";

  const org = await requireActiveOrg();
  if (org.roleCode !== "admin") redirect("/settings/billing");

  // RECARGAR NO VUELVE A COBRAR. Si ya hay una contratación viva para este
  // mismo plan, es esa: si ya salió hacia el proveedor se enseña en qué quedó,
  // y si no, se sigue con ella. Un presupuesto nuevo por cada recarga abriría
  // un segundo camino de pago para lo mismo.
  const viva = await findLiveCheckout({
    organizationId: org.organizationId, planCode: plan, billingInterval: intervalo });

  if (viva?.alreadySubmitted) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <header className="space-y-1">
          <p className="eyebrow">
            <Link href={volver} className="hover:underline">
              Plan y facturación
            </Link>
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Contratar</h1>
        </header>
        <CheckoutWatcher intentId={viva.intentId} backHref={volver} />
      </div>
    );
  }

  const presupuesto = await createBillingQuote(org.organizationId, plan, intervalo);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href={volver} className="hover:underline">
            Plan y facturación
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Contratar</h1>
      </header>

      {!presupuesto.ok ? (
        <ErrorAlert message={QUOTE_ERROR_MESSAGE[presupuesto.code]} />
      ) : (
        <Contratacion
          quoteId={presupuesto.quoteId}
          planCode={presupuesto.planCode}
          intervalo={presupuesto.billingInterval}
          base={presupuesto.baseAmount}
          impuesto={presupuesto.taxAmount}
          total={presupuesto.totalAmount}
          caduca={presupuesto.expiresAt}
        />
      )}
    </div>
  );
}

async function Contratacion({
  quoteId, planCode, intervalo, base, impuesto, total, caduca,
}: {
  quoteId: string; planCode: string;
  intervalo: "monthly" | "annual"; base: number; impuesto: number;
  total: number; caduca: string;
}) {
  // El intento congela lo esperado. Un presupuesto tiene un solo intento vivo:
  // volver a esta pantalla no crea otro ni cobra dos veces.
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_open_checkout_intent", {
    p_quote_id: quoteId, p_provider: "wompi",
    p_environment: process.env.VERCEL_ENV === "production" ? "live" : "test",
  });
  if (error || !data) {
    return <ErrorAlert message="No fue posible preparar el pago. No se cobró nada." />;
  }
  const intentId = String((data as Record<string, unknown>).intent_id);

  const config = await getWompiPublicConfig();

  return (
    <>
      <section className="rounded-md border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Lo que vas a pagar</h2>
        <dl className="grid grid-cols-2 gap-2 pt-2 text-sm">
          <dt className="text-ink-soft">Plan</dt>
          <dd className="font-medium">{planCode}</dd>
          <dt className="text-ink-soft">Facturación</dt>
          <dd>{intervalo === "annual" ? "Anual" : "Mensual"}</dd>
          <dt className="text-ink-soft">Base</dt>
          <dd>{pesos(base)}</dd>
          <dt className="text-ink-soft">Impuestos</dt>
          <dd>{pesos(impuesto)}</dd>
          <dt className="font-medium">Total</dt>
          <dd className="font-medium">{pesos(total)}</dd>
        </dl>
        <p className="pt-2 text-xs text-ink-soft">
          Este importe vale hasta las{" "}
          {new Date(caduca).toLocaleTimeString("es-CO",
            { hour: "2-digit", minute: "2-digit" })}.
          Después habrá que calcularlo otra vez.
        </p>
      </section>

      {!config.ok ? (
        <ErrorAlert message={
          config.code === "PROVIDER_NOT_CONFIGURED"
            ? "El pago con tarjeta no está disponible ahora mismo. No se cobró nada."
            : "No pudimos cargar los documentos que hay que aceptar. No se cobró nada."
        } />
      ) : (
        <WompiCardForm intentId={intentId} config={config.config}
                       totalLabel={pesos(total)} />
      )}
    </>
  );
}
