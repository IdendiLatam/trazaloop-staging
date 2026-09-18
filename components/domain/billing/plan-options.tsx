import Link from "next/link";
import type { CommercialPlan } from "@/lib/plans/commercial-catalog";
import type { CommercialService } from "@/lib/plans/commercial-copy";
import {
  formatMonthlyPrice, formatStorage, formatAiCredits, formatTimeUsage,
} from "@/lib/plans/commercial-presentation";

/**
 * Trazaloop · COMMERCIAL-UX-01F · Las otras opciones, en contexto.
 *
 * NO es /planes metida dentro de facturación. Es un resumen para responder
 * «¿qué más hay?» sin salir, con un enlace a la comparación completa para quien
 * quiera el detalle. Duplicar la página pública aquí habría creado dos sitios
 * que enseñan lo mismo y que se desincronizan en cuanto uno cambie.
 *
 * Los datos salen del catálogo comercial de 01C: los mismos precios, los
 * mismos límites y los mismos formateadores que la página pública. Ni una cifra
 * escrita aquí.
 */
export function PlanOptions({
  planes, servicios, currentPlanCode, isTrial, ctaFor,
}: {
  planes: readonly CommercialPlan[];
  servicios: readonly CommercialService[];
  /** El plan CONTRATADO. Durante una prueba, no es el que se está usando. */
  currentPlanCode: string | null;
  isTrial: boolean;
  /** El botón de cada plan, ya decidido fuera. */
  ctaFor: (planCode: string) => { label: string; href: string } | null;
}) {
  return (
    <section aria-labelledby="opciones" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="opciones" className="text-lg font-semibold text-ink">
          Planes disponibles
        </h2>
        <Link
          href="/planes"
          className="text-sm text-loop underline focus-visible:outline
                     focus-visible:outline-2 focus-visible:outline-offset-2
                     focus-visible:outline-loop"
        >
          Ver la comparación completa
        </Link>
      </div>

      <ul className="grid gap-4 md:grid-cols-3">
        {planes.map((p) => {
          const esElSuyo = p.code === currentPlanCode;
          const cta = ctaFor(p.code);
          const precio = formatMonthlyPrice(p.monthlyPriceMinor, p.currency);
          const disco = formatStorage(p.storageBytes);
          const ia = formatAiCredits(p.aiCreditsMonthly);
          const tiempo = formatTimeUsage(p.timeUsage);

          return (
            <li
              key={p.code}
              className={`flex flex-col rounded-xl border p-5 ${
                esElSuyo ? "border-loop bg-surface" : "border-hairline bg-surface"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-ink">{p.headline}</h3>
                {/* Solo UNO lo lleva. Y durante una prueba dice «prueba», para
                    no afirmar un contrato que no existe. */}
                {esElSuyo ? (
                  <span className="shrink-0 rounded-full bg-loop/10 px-2.5 py-1
                                   text-xs font-medium text-loop">
                    {isTrial ? "Tu prueba actual" : "Tu plan actual"}
                  </span>
                ) : null}
              </div>

              {precio !== null ? (
                <p className="mt-2 text-sm text-ink-soft">{precio}</p>
              ) : null}

              <dl className="mt-4 space-y-1.5 text-sm">
                {disco !== null ? <Fila t="Almacenamiento" v={disco} /> : null}
                {ia !== null ? <Fila t="Intelligence" v={ia} /> : null}
                {tiempo !== null ? <Fila t="Uso" v={tiempo} /> : null}
              </dl>

              <div className="mt-auto pt-5">
                {cta !== null ? (
                  <Link
                    href={cta.href}
                    aria-label={`${cta.label} · plan ${p.headline}`}
                    className="block w-full rounded-md border border-hairline px-3 py-2
                               text-center text-sm font-medium text-ink-soft
                               hover:text-loop focus-visible:outline
                               focus-visible:outline-2 focus-visible:outline-offset-2
                               focus-visible:outline-loop"
                  >
                    {cta.label}
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {/* El Acompañamiento va aparte, y lo dice. Dentro de la parrilla sería
          un cuarto plan a ojos de cualquiera. */}
      {servicios.map((s) => (
        <div key={s.code} className="rounded-xl border border-hairline bg-canvas p-5">
          <h3 className="font-semibold text-ink">¿Necesitas acompañamiento?</h3>
          <p className="mt-1 text-sm font-medium text-ink">
            Es un complemento opcional, no un plan.
          </p>
          <p className="mt-2 text-sm text-ink-soft">{s.shortDescription}</p>
          <p className="mt-2 text-sm text-ink-soft">
            Referencia: {s.referenceScope} · {s.referencePrice}
          </p>
          <div className="mt-4">
            <a
              href="mailto:contacto@idendi.org"
              className="rounded-md border border-hairline px-4 py-2 text-sm
                         font-medium text-ink-soft hover:text-loop
                         focus-visible:outline focus-visible:outline-2
                         focus-visible:outline-offset-2 focus-visible:outline-loop"
            >
              Hablemos de Acompañamiento
            </a>
          </div>
        </div>
      ))}
    </section>
  );
}

function Fila({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-soft">{t}</dt>
      <dd className="text-right font-medium text-ink">{v}</dd>
    </div>
  );
}
