import type { UsagePresentation } from "@/lib/domain/usage-presentation";

/**
 * Trazaloop · COMMERCIAL-UX-01F · Lo que la empresa está consumiendo.
 *
 * Tres medidas, cada una con su modo ya resuelto: medida, ilimitada o
 * desconocida. Este componente NO decide cuál es cuál — si lo decidiera,
 * volvería a aparecer el «0 de ∞» que el modo existe para evitar.
 *
 * Lo desconocido no se pinta. Un contador que dice «0 MB» porque no se pudo
 * leer el consumo parece un dato y es una avería.
 */
export function UsagePanel({ medidas }: {
  medidas: readonly { titulo: string; uso: UsagePresentation; nota?: string }[];
}) {
  // Se estrecha el tipo aquí: `filter` no lo hace solo, y sin esto habría que
  // volver a preguntar por el modo en cada uso de la etiqueta.
  const visibles = medidas.flatMap((m) =>
    m.uso.mode === "unknown" ? [] : [{ ...m, uso: m.uso }]);
  if (visibles.length === 0) return null;

  return (
    <section aria-labelledby="uso" className="rounded-xl border border-hairline bg-surface p-6">
      <h2 id="uso" className="text-lg font-semibold text-ink">Tu uso</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Lo que llevas consumido de lo que incluye tu plan.
      </p>

      <dl className="mt-5 space-y-5">
        {visibles.map((m) => (
          <div key={m.titulo}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <dt className="text-sm font-medium text-ink">{m.titulo}</dt>
              <dd className="text-sm text-ink-soft">{m.uso.label}</dd>
            </div>

            {m.uso.mode === "metered" ? (
              /* La barra es decorativa: el dato ya está escrito arriba, en
                 palabras. Quien no la vea no se pierde nada, y por eso lleva
                 `aria-hidden` en vez de un `progressbar` que repetiría lo
                 mismo dos veces a un lector de pantalla. */
              <div
                aria-hidden="true"
                className="mt-2 h-2 w-full overflow-hidden rounded-full bg-hairline/50"
              >
                <div
                  className={`h-full rounded-full ${
                    m.uso.overLimit ? "bg-ink-soft" : "bg-loop"}`}
                  style={{ width: `${m.uso.percent}%` }}
                />
              </div>
            ) : null}

            {m.nota ? (
              <p className="mt-1.5 text-xs text-ink-soft">{m.nota}</p>
            ) : null}
            {m.uso.mode === "metered" && m.uso.overLimit ? (
              <p className="mt-1.5 text-xs text-ink-soft">
                Estás por encima de lo que incluye tu plan. Puedes seguir
                consultando y descargando lo que ya tienes.
              </p>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
