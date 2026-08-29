import {
  CALCULATION_STATE_LABEL,
  DEFENSIBILITY_LABEL,
  type CalculationState,
  type Defensibility,
} from "@/lib/domain/recycled-readiness";

/**
 * PT-02A · El estado de un lote producido, separado en sus dos preguntas.
 *
 * Sustituye a `TraceabilityStatusBadge` en las pantallas operativas. Aquel
 * medía la completitud de la metodología histórica —composición manual
 * incluida— y pintaba en rojo lotes que calculaban perfectamente.
 *
 * Aquí el estado sale de lo que la base ya guarda: `result_state` dice si el
 * número existe y `defensibility_level` si está sustentado. Sin vocabulario
 * nuevo.
 */
export function CalculationStateBadge({
  state,
  defensibility,
  percent,
}: {
  state: CalculationState;
  defensibility?: Defensibility | null;
  percent?: number | null;
}) {
  if (state === "calculated") {
    const nivel = (defensibility ?? "preliminary") as Defensibility;
    const tono =
      nivel === "defensible"
        ? "border-loop/30 bg-loop/5 text-loop-deep"
        : nivel === "with_warnings"
          ? "border-amber/40 bg-amber/10 text-amber"
          : "border-hairline bg-paper text-ink-soft";
    return (
      <span className="inline-flex items-center gap-1.5">
        {percent !== null && percent !== undefined ? (
          <span className="code text-sm font-semibold text-loop-deep">
            {percent.toFixed(2)} %
          </span>
        ) : null}
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${tono}`}>
          {DEFENSIBILITY_LABEL[nivel]}
        </span>
      </span>
    );
  }

  // «Cálculo incompleto» y no «Trazabilidad incompleta»: lo que falta impide
  // producir el número, y decir cuál es el problema es trabajo de los motivos,
  // no de un distintivo.
  const tono =
    state === "incomplete"
      ? "border-amber/40 bg-amber/10 text-amber"
      : "border-hairline bg-paper text-ink-soft";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${tono}`}>
      {CALCULATION_STATE_LABEL[state]}
    </span>
  );
}
