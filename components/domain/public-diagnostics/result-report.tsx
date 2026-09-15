import Link from "next/link";
import type { PublicReport, SnapshotGap } from "@/lib/domain/public-diagnostic-report";
import { PrintResultButton } from "@/components/domain/public-diagnostics/print-button";
import { Wordmark } from "@/components/layout/logo";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01G · El informe que recibe la empresa.
 *
 *
 * QUÉ ES ESTA PANTALLA
 *
 * La recompensa de 52 preguntas. Quien llega aquí acaba de dedicar veinte
 * minutos y no tiene cuenta, ni ha pagado, ni ha aceptado recibir nada: el
 * resultado completo —porcentaje, dimensiones, brechas y recomendaciones— se
 * entrega entero, sin pedir nada más. El CTA va al final, después de haber
 * dado todo lo que se prometió.
 *
 *
 * NO SE CALCULA NADA AQUÍ
 *
 * Todo sale de la instantánea congelada al cerrar. Este componente no conoce
 * el motor, ni los pesos, ni los umbrales, ni qué preguntas eran críticas. Lo
 * que enseña hoy es literalmente lo que se generó aquel día.
 *
 *
 * ACCESIBILIDAD
 *
 * Ninguna barra dice nada que no diga también su número: el color y la
 * longitud acompañan, no informan. Quien lea esto con un lector de pantalla, o
 * en blanco y negro sobre papel, recibe lo mismo.
 */

function BarraDimension({ titulo, porcentaje }: { titulo: string; porcentaje: number }) {
  const ancho = Math.max(0, Math.min(100, porcentaje));
  return (
    <li className="print-avoid-break">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span>{titulo}</span>
        {/* El número SIEMPRE visible: la barra es un apoyo, no el dato. */}
        <span className="code shrink-0 tabular-nums text-ink-soft">
          {ancho.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-hairline"
           role="img" aria-label={`${titulo}: ${ancho.toFixed(0)} por ciento`}>
        <div className="h-full rounded-full bg-loop" style={{ width: `${ancho}%` }} />
      </div>
    </li>
  );
}

function Brecha({ brecha, dimension }: { brecha: SnapshotGap; dimension: string | null }) {
  return (
    <li className="print-avoid-break rounded-md border border-hairline p-3">
      {dimension ? <p className="eyebrow mb-1">{dimension}</p> : null}
      <p className="text-sm font-medium">{brecha.question}</p>
      {brecha.recommended_action ? (
        <p className="mt-1 text-sm text-ink-soft">
          <span className="font-medium text-loop-deep">Qué hacer: </span>
          {brecha.recommended_action}
        </p>
      ) : null}
    </li>
  );
}

export function PublicResultReport({
  report, publicTitle, partnerName, companyName, completedAt,
  ctaHref, ctaLabel, repeatHref,
}: {
  report: PublicReport;
  publicTitle: string;
  partnerName: string | null;
  /** La suministró quien está mirando, y está viendo SU resultado. */
  companyName: string;
  completedAt: string | null;
  ctaHref: string;
  ctaLabel: string;
  /** Solo si la campaña permite repetir. `null` si no. */
  repeatHref: string | null;
}) {
  const titulos = new Map(report.dimensions.map((d) => [d.code, d.title]));
  const fecha = completedAt
    ? new Date(completedAt).toLocaleDateString("es-CO",
        { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <div className="print-page mx-auto max-w-3xl space-y-8 p-6">
      <header className="space-y-2">
        <Wordmark />
        <p className="eyebrow">
          {partnerName ? `Con ${partnerName}` : "Diagnóstico"} · {publicTitle}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Resultado de tu diagnóstico PCR
        </h1>
        <p className="text-sm text-ink-soft">
          {companyName}{fecha ? ` · ${fecha}` : ""}
        </p>
      </header>

      {/* 1 · El resultado global ------------------------------------------- */}
      <section className="print-avoid-break rounded-lg border border-hairline bg-surface p-6">
        <p className="eyebrow">Preparación total</p>
        <p className="code pt-1 text-5xl font-semibold tabular-nums">
          {report.maturityPercent.toFixed(0)}%
        </p>
        <p className="pt-2 text-base font-semibold">{report.readinessLabel}</p>
        <p className="max-w-2xl pt-2 text-sm text-ink-soft">{report.explanation}</p>
      </section>

      {/* 2 · Las dimensiones ------------------------------------------------ */}
      <section className="print-avoid-break space-y-3">
        <h2 className="text-sm font-semibold">Tu desempeño por dimensión</h2>
        <ul className="space-y-3">
          {report.dimensions.map((d) => (
            <BarraDimension key={d.code} titulo={d.title} porcentaje={d.percent} />
          ))}
        </ul>
      </section>

      {/* 3 · Lo que ya funciona --------------------------------------------- */}
      {report.destacadas.kind !== "none" ? (
        <section className="print-avoid-break rounded-lg border border-loop/30 bg-loop/5 p-5">
          <h2 className="text-sm font-semibold">
            {report.destacadas.kind === "strengths"
              ? "Tus fortalezas"
              : "Áreas con mejor desempeño relativo"}
          </h2>
          {report.destacadas.kind === "relative" ? (
            <p className="pt-1 text-sm text-ink-soft">
              Ninguna dimensión alcanza todavía un nivel que podamos llamar
              fortaleza, pero estas son las que mejor se sostienen hoy.
            </p>
          ) : null}
          <ul className="list-disc space-y-1 pl-5 pt-2 text-sm">
            {report.destacadas.items.map((s) => (
              <li key={s.code}>
                {s.title} — <span className="code tabular-nums">{s.percent.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 4 · Las brechas ---------------------------------------------------- */}
      {report.totalGaps > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Brechas prioritarias</h2>
            <p className="pt-1 text-sm text-ink-soft">
              Encontramos {report.totalGaps} punto(s) por resolver. Empezamos por
              las dimensiones donde hoy hay menos cobertura: es donde cada hora
              de trabajo rinde más.
            </p>
          </div>
          <ul className="space-y-2">
            {report.gapsPriority.map((g) => (
              <Brecha key={g.code || g.question} brecha={g}
                      dimension={g.section ? titulos.get(g.section) ?? null : null} />
            ))}
          </ul>

          {report.gapsRest.length > 0 ? (
            <>
              {/* En pantalla, a un clic. */}
              <details className="no-print rounded-md border border-hairline bg-surface p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Ver las {report.gapsRest.length} restantes
                </summary>
                <ul className="space-y-2 pt-3">
                  {report.gapsRest.map((g) => (
                    <Brecha key={g.code || g.question} brecha={g}
                            dimension={g.section ? titulos.get(g.section) ?? null : null} />
                  ))}
                </ul>
              </details>
              {/* En papel no hay dónde pulsar: van todas. */}
              <div className="print-only">
                <h3 className="pt-2 text-sm font-semibold">Resto de brechas</h3>
                <ul className="space-y-2 pt-2">
                  {report.gapsRest.map((g) => (
                    <Brecha key={g.code || g.question} brecha={g}
                            dimension={g.section ? titulos.get(g.section) ?? null : null} />
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </section>
      ) : (
        <section className="print-avoid-break rounded-lg border border-loop/30 bg-loop/5 p-5 text-sm">
          Respondiste «Sí» a todas las preguntas del diagnóstico. Mantén los
          registros al día: es lo que sostiene el nivel en el tiempo.
        </section>
      )}

      {/* 5 · Qué hacer ------------------------------------------------------ */}
      {report.recommendations.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Recomendaciones</h2>
            <p className="pt-1 text-sm text-ink-soft">
              Agrupadas por dimensión. Son las acciones que corresponden a las
              brechas que encontramos, sin repetir las que coinciden.
            </p>
          </div>
          {report.recommendations.map((grupo) => (
            <div key={grupo.sectionCode ?? "otras"}
                 className="print-avoid-break rounded-md border border-hairline bg-surface p-4">
              <h3 className="text-sm font-semibold">{grupo.sectionTitle}</h3>
              <ul className="list-disc space-y-1 pl-5 pt-2 text-sm text-ink-soft">
                {grupo.actions.map((a) => <li key={a}>{a}</li>)}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {/* 6 · Y solo ahora, la invitación ------------------------------------ */}
      <section className="no-print rounded-lg border border-hairline bg-paper p-5">
        <h2 className="text-sm font-semibold">¿Quieres trabajar estas brechas?</h2>
        <p className="pt-1 text-sm text-ink-soft">
          Trazaloop te ayuda a convertir estas recomendaciones en un sistema de
          trazabilidad gestionable y documentado.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-3">
          <Link href={ctaHref}
                className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep">
            {ctaLabel}
          </Link>
          <PrintResultButton />
        </div>
        <p className="pt-3 text-xs text-ink-soft">
          Tu resultado ya está completo: entrar en Trazaloop es opcional y no
          cambia nada de lo que acabas de leer.
        </p>
      </section>

      {repeatHref ? (
        <section className="no-print rounded-lg border border-hairline p-4">
          <h2 className="text-sm font-semibold">¿Volver a diligenciarlo?</h2>
          <p className="pt-1 text-sm text-ink-soft">
            Esta convocatoria admite repetir el diagnóstico. Empezarás uno
            nuevo, con sus datos y su autorización; el resultado que acabas de
            ver se conserva tal cual.
          </p>
          <Link href={repeatHref}
                className="mt-3 inline-block rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-medium hover:border-loop">
            Volver a diligenciar el diagnóstico
          </Link>
        </section>
      ) : null}

      <p className="text-xs text-ink-soft">
        Trazaloop es un producto de IDENDI Latam.
      </p>
    </div>
  );
}
