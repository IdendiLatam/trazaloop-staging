"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { CommercialPlan } from "@/lib/plans/commercial-catalog";
import type { PlanCta } from "@/lib/plans/pricing-cta";
import {
  formatUsdPrice, formatStorage, formatAiCredits, formatTimeUsage,
} from "@/lib/plans/commercial-presentation";

/**
 * Trazaloop · COMMERCIAL-UX-01D · Las tres tarjetas.
 *
 *
 * POR QUÉ ESTE COMPONENTE NO SABE NADA
 *
 * Recibe planes ya leídos de la autoridad y botones ya decididos. No consulta,
 * no calcula y no elige: si tuviera una sola cifra dentro, el día que cambie el
 * precio habría que acordarse de venir aquí, y nadie se acuerda.
 *
 * Los formateadores son los de 01C, los mismos que usará la ficha de
 * facturación. Un «500 MB» que se escriba de dos maneras en dos pantallas es
 * una incoherencia que el cliente sí nota.
 *
 *
 * MENSUAL O ANUAL: DOS PRECIOS, NINGUNA CUENTA
 *
 * El selector cambia CUÁL de los dos precios de la autoridad se enseña. No
 * multiplica, no divide y no calcula ahorro: si algún día quiere decirse «dos
 * meses gratis», tendrá que salir de una decisión comercial explícita, no de
 * una resta hecha en un componente.
 *
 * Y el ahorro que sí se muestra se deriva ÚNICAMENTE de los dos precios
 * autoritativos, sin inventar una regla: se dice cuánto se paga al año de cada
 * forma y se deja que el número hable.
 */
export function PricingPlans({ planes }: {
  planes: readonly { plan: CommercialPlan; cta: PlanCta }[];
}) {
  const [periodo, setPeriodo] = useState<"monthly" | "annual">("monthly");
  const grupo = useId();

  return (
    <div className="mt-6">
      {/* El selector es un grupo de radios de verdad, no dos botones que
          simulan uno. Un lector de pantalla anuncia «1 de 2» y las flechas
          funcionan solas; con dos botones habría que reimplementar las dos
          cosas y quedarían a medias. */}
      <fieldset className="inline-flex rounded-lg border border-hairline p-1">
        <legend className="sr-only">Periodicidad del precio</legend>
        {([["monthly", "Mensual"], ["annual", "Anual"]] as const).map(([v, t]) => (
          <label
            key={v}
            className={`cursor-pointer rounded-md px-4 py-1.5 text-sm
                        focus-within:outline focus-within:outline-2
                        focus-within:outline-offset-2 focus-within:outline-loop
                        ${periodo === v
                          ? "bg-loop font-semibold text-white"
                          : "text-ink-soft hover:text-loop"}`}
          >
            <input
              type="radio"
              name={`periodo-${grupo}`}
              value={v}
              checked={periodo === v}
              onChange={() => setPeriodo(v)}
              className="sr-only"
            />
            {t}
          </label>
        ))}
      </fieldset>

      {/* Una columna en móvil, tres a partir de pantalla mediana. Sin anchos
          fijos: un precio largo estira la tarjeta, no desborda la página. */}
      <ul className="mt-6 grid gap-6 md:grid-cols-3">
        {planes.map(({ plan, cta }) => (
          <Tarjeta key={plan.code} plan={plan} cta={cta} periodo={periodo} />
        ))}
      </ul>
    </div>
  );
}

function Tarjeta({ plan, cta, periodo }: {
  plan: CommercialPlan; cta: PlanCta; periodo: "monthly" | "annual";
}) {
  const minor = periodo === "monthly" ? plan.monthlyPriceMinor : plan.annualPriceMinor;
  const precio = formatUsdPrice(minor, plan.currency);
  const sufijo = periodo === "monthly" ? "al mes" : "al año";
  const tiempo = formatTimeUsage(plan.timeUsage);
  const disco = formatStorage(plan.storageBytes);
  const creditos = formatAiCredits(plan.aiCreditsMonthly);

  return (
    <li
      className={`flex flex-col rounded-xl border p-6
                  ${plan.featured
                    ? "border-loop bg-paper shadow-sm"
                    : "border-hairline bg-paper"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xl font-semibold text-ink">{plan.headline}</h3>
        {/* «Recomendado», no «el más vendido». Lo segundo sería una afirmación
            sobre el comportamiento de otros clientes que no tenemos medido, y
            fabricarla es mentir, aunque sea una mentira habitual. */}
        {plan.featured ? (
          <span className="shrink-0 rounded-full bg-loop/10 px-3 py-1 text-xs
                           font-medium text-loop">
            Recomendado
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-ink-soft">{plan.shortDescription}</p>

      <p className="mt-5">
        {precio === null ? (
          // Un precio ausente NO se escribe como cero: eso sería inventarse una
          // oferta que nadie aprobó.
          <span className="text-ink-soft">Precio a consultar</span>
        ) : (
          <>
            <span className="text-3xl font-semibold tracking-tight text-ink">
              {precio}
            </span>
            <span className="ml-2 text-sm text-ink-soft">{sufijo}</span>
          </>
        )}
      </p>

      {plan.idealFor ? (
        <p className="mt-3 text-sm text-ink-soft">{plan.idealFor}</p>
      ) : null}

      {/* Lo que la autoridad declara. Cada fila desaparece si no hay dato: una
          página de precios no rellena huecos con guiones. */}
      <dl className="mt-5 space-y-2 text-sm">
        {disco !== null ? <Fila termino="Almacenamiento" valor={disco} /> : null}
        {creditos !== null ? <Fila termino="Intelligence" valor={creditos} /> : null}
        {tiempo !== null ? <Fila termino="Uso de la plataforma" valor={tiempo} /> : null}
      </dl>

      {plan.bullets.length > 0 ? (
        <ul className="mt-5 space-y-1 text-sm text-ink-soft">
          {plan.bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span aria-hidden="true" className="text-loop">·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* El botón se queda abajo aunque las tarjetas tengan distinto alto. */}
      <div className="mt-auto pt-6">
        {cta.label !== null && cta.href !== null ? (
          <Boton href={cta.href} tono={cta.tone} etiqueta={cta.label}
                 plan={plan.headline} />
        ) : null}
        {cta.note ? (
          <p className="mt-2 text-xs text-ink-soft">{cta.note}</p>
        ) : null}
      </div>
    </li>
  );
}

function Fila({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-soft">{termino}</dt>
      <dd className="text-right font-medium text-ink">{valor}</dd>
    </div>
  );
}

function Boton({ href, tono, etiqueta, plan }: {
  href: string; tono: "primary" | "quiet"; etiqueta: string; plan: string;
}) {
  const clase = tono === "primary"
    ? "block w-full rounded-md bg-loop px-4 py-2.5 text-center text-sm "
      + "font-semibold text-white hover:bg-loop-deep"
    : "block w-full rounded-md border border-hairline px-4 py-2.5 text-center "
      + "text-sm font-medium text-ink-soft hover:text-loop";
  const foco = " focus-visible:outline focus-visible:outline-2 "
    + "focus-visible:outline-offset-2 focus-visible:outline-loop";
  // Tres botones que dicen «Pasar a Full» suenan iguales fuera de contexto. El
  // nombre accesible lleva el plan para que se distingan al tabular.
  const nombre = `${etiqueta} · plan ${plan}`;
  return href.startsWith("mailto:")
    ? <a href={href} aria-label={nombre} className={clase + foco}>{etiqueta}</a>
    : <Link href={href} aria-label={nombre} className={clase + foco}>{etiqueta}</Link>;
}
