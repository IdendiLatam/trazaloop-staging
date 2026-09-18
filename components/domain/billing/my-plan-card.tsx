import Link from "next/link";
import type { BillingSummary, BillingCta } from "@/lib/domain/billing-experience";

/**
 * Trazaloop · COMMERCIAL-UX-01F · La tarjeta de «Mi plan».
 *
 * Lo primero que se ve, y muchas veces lo único que se lee. Responde las tres
 * preguntas por las que alguien abre esta pantalla —qué tengo, hasta cuándo, y
 * qué me toca hacer— sin obligar a recorrerla entera.
 *
 * No decide nada: recibe el resumen ya resuelto. Ni un `if` de estado vive
 * aquí, porque ocho ramas en JSX no se pueden probar.
 */
export function MyPlanCard({
  planName, summary, isTrial,
}: {
  /** El nombre COMERCIAL del plan, del catálogo. No un código. */
  planName: string;
  summary: BillingSummary;
  isTrial: boolean;
}) {
  return (
    <section
      aria-labelledby="mi-plan"
      className="rounded-xl border border-hairline bg-surface p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Tu plan</p>
          <h2 id="mi-plan" className="mt-1 text-2xl font-semibold text-ink">
            {planName}
          </h2>
        </div>
        {/* El estado NO se comunica solo con color: lleva su palabra. Quien no
            distingue los tonos lee exactamente lo mismo. */}
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            isTrial
              ? "bg-loop/10 text-loop"
              : "border border-hairline text-ink-soft"}`}
        >
          {isTrial ? "Prueba" : summary.displayStatus}
        </span>
      </div>

      <p className="mt-3 max-w-2xl text-ink-soft">{summary.primaryMessage}</p>

      {summary.validUntilLabel !== null || summary.renewalMessage !== null ? (
        <dl className="mt-5 space-y-1.5 text-sm">
          {summary.validUntilLabel !== null ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="sr-only">Vigencia</dt>
              <dd className="font-medium text-ink">{summary.validUntilLabel}</dd>
            </div>
          ) : null}
          {summary.renewalMessage !== null ? (
            <div className="flex flex-wrap gap-x-2">
              <dt className="sr-only">Renovación</dt>
              <dd className="text-ink-soft">{summary.renewalMessage}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {summary.primaryCta !== null || summary.secondaryCta !== null ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Boton cta={summary.primaryCta} />
          <Boton cta={summary.secondaryCta} />
        </div>
      ) : null}
    </section>
  );
}

function Boton({ cta }: { cta: BillingCta }) {
  if (cta === null) return null;
  const clase = cta.tone === "primary"
    ? "rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
    : "rounded-md border border-hairline px-4 py-2 text-sm font-medium text-ink-soft hover:text-loop";
  const foco = " focus-visible:outline focus-visible:outline-2"
    + " focus-visible:outline-offset-2 focus-visible:outline-loop";
  return <Link href={cta.href} className={clase + foco}>{cta.label}</Link>;
}
