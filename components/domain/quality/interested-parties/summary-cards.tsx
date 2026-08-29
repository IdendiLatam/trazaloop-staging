import Link from "next/link";
import type { InterestedPartiesSummary } from "@/lib/db/quality-interested-parties";

/**
 * QUALITY-12.3B3A · El resumen.
 *
 * Seis cifras y ni una más. Todas vienen de `getSummary`, que las cuenta EN LA
 * BASE: ninguna sale de las filas que esta pantalla tiene cargadas, porque en
 * cuanto hay una segunda página esa cuenta es mentira.
 *
 * Y ninguna se llama «desempeño». Que estén registradas las estrategias no
 * dice que la empresa gestione bien a sus partes interesadas; dice que están
 * registradas. Confundir completitud administrativa con resultado es
 * exactamente lo que convierte un sistema de gestión en papeleo.
 *
 * Las tarjetas son enlaces que aplican el filtro correspondiente: sirven para
 * ir al trabajo, no solo para mirarlo.
 */
export function InterestedPartiesSummaryCards({
  summary, basePath,
}: { summary: InterestedPartiesSummary; basePath: string }) {
  const cards: {
    label: string; value: number; href?: string; hint?: string; tone?: "warn" | "danger";
  }[] = [
    {
      label: "Partes pertinentes",
      value: summary.relevant,
      href: `${basePath}?pertinencia=relevant`,
      hint: "Con análisis vigente que las declara pertinentes.",
    },
    {
      label: "En evaluación",
      value: summary.underReview,
      href: `${basePath}?pertinencia=under_review`,
      hint: "Todavía sin decidir si son pertinentes.",
    },
    {
      label: "Requisitos pertinentes",
      value: summary.requirements,
      hint: "Lo que obliga hoy, sin contar necesidades ni expectativas.",
    },
    {
      label: "Estrategias vigentes",
      value: summary.strategiesActive,
      hint: "Cómo se está gestionando la relación.",
    },
    {
      label: "Revisiones vencidas",
      value: summary.strategiesOverdue,
      href: `${basePath}?revision=overdue`,
      hint: "Tenían fecha prevista y ya pasó.",
      tone: summary.strategiesOverdue > 0 ? "danger" : undefined,
    },
    {
      label: "Pertinentes sin estrategia",
      value: summary.relevantWithoutStrategy,
      href: `${basePath}?revision=no_strategy&pertinencia=relevant`,
      hint: "Importan, y todavía nadie ha decidido qué se hace con ellas.",
      tone: summary.relevantWithoutStrategy > 0 ? "warn" : undefined,
    },
  ];

  return (
    <section aria-label="Resumen" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((c) => {
        const cuerpo = (
          <>
            <span className="block text-2xl font-semibold tabular-nums">{c.value}</span>
            <span className="mt-0.5 block text-xs font-medium text-ink">{c.label}</span>
            {c.hint ? <span className="mt-1 block text-[11px] text-ink-soft">{c.hint}</span> : null}
          </>
        );
        const borde =
          c.tone === "danger" ? "border-rose/40"
          : c.tone === "warn" ? "border-amber/40"
          : "border-hairline";
        return c.href ? (
          <Link
            key={c.label}
            href={c.href}
            className={`rounded-lg border ${borde} bg-surface p-3 text-left hover:border-loop focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop`}
          >
            {cuerpo}
          </Link>
        ) : (
          <div key={c.label} className={`rounded-lg border ${borde} bg-surface p-3`}>
            {cuerpo}
          </div>
        );
      })}
    </section>
  );
}
