import type { MethodologyVersionRow, ScaleRow } from "@/lib/db/risks";

/**
 * QUALITY-05 · §61 · La matriz.
 *
 * NO está cableada. Se dibuja a partir de la versión de metodología: sus dos
 * primeras dimensiones son los ejes, su regla de combinación calcula cada
 * celda y su escala de resultado dice en qué banda cae. Si mañana la empresa
 * publica una versión con otras escalas, esta matriz cambia sola.
 *
 * Dos consecuencias deliberadas:
 *
 * · Con una sola dimensión, o con tres o más, no se dibuja rejilla. Fingir una
 *   cuadrícula de dos ejes cuando la metodología tiene tres mentiría sobre
 *   cómo se calculó el nivel.
 * · El color nunca va solo: cada celda lleva la etiqueta del nivel, y la
 *   posición actual se marca además con un anillo y con texto.
 */

const BAND_STYLE: Record<string, string> = {
  low: "bg-emerald/10 text-emerald-deep",
  medium: "bg-amber/10 text-amber-deep",
  high: "bg-rose/10 text-rose-deep",
  extreme: "bg-rose/20 text-rose-deep",
};

/** Reparte tonos por ORDEN de banda, no por su nombre: una metodología puede
 *  llamar a sus niveles como quiera. */
function toneFor(index: number, total: number): string {
  if (total <= 1) return BAND_STYLE.medium;
  const r = index / (total - 1);
  if (r < 0.34) return BAND_STYLE.low;
  if (r < 0.67) return BAND_STYLE.medium;
  if (r < 0.9) return BAND_STYLE.high;
  return BAND_STYLE.extreme;
}

function combine(aggregation: string, a: number, b: number, wa: number, wb: number): number {
  switch (aggregation) {
    case "sum": return a + b;
    case "weighted_sum": return a * wa + b * wb;
    case "max": return Math.max(a, b);
    case "min": return Math.min(a, b);
    default: return a * b;
  }
}

export function RiskMatrix({
  version,
  currentScore,
  currentFactors,
}: {
  version: MethodologyVersionRow;
  currentScore?: number | null;
  /** Los niveles elegidos en la evaluación vigente, por código de dimensión.
   *  Sin esto la celda actual se buscaría por puntaje, y 3×4 y 4×3 dan el
   *  mismo 12: se marcarían DOS celdas y ninguna sería la evaluada. */
  currentFactors?: { scale_code: string; level_label: string }[] | null;
}) {
  const dims = version.scales.filter((s) => s.scaleKind === "dimension");
  const result = version.scales.find((s) => s.scaleKind === "result");
  if (!result || result.levels.length === 0) return null;

  const bands = [...result.levels].sort(
    (a, b) => (a.minScore ?? 0) - (b.minScore ?? 0)
  );
  const bandOf = (score: number) => {
    const i = bands.findIndex(
      (l) => (l.minScore == null || score >= l.minScore) && (l.maxScore == null || score <= l.maxScore)
    );
    return i < 0 ? null : { level: bands[i], tone: toneFor(i, bands.length) };
  };

  if (dims.length !== 2) {
    // Sin dos ejes no hay cuadrícula honesta. Se enseñan las bandas, que es la
    // parte de la metodología que sí se puede mostrar tal cual.
    return (
      <div className="space-y-2">
        <p className="text-xs text-ink-soft">
          Esta metodología combina {dims.length}{" "}
          {dims.length === 1 ? "dimensión" : "dimensiones"}, así que no se dibuja como una
          cuadrícula de dos ejes. Estas son sus bandas de resultado:
        </p>
        <BandLegend bands={bands} currentScore={currentScore} />
      </div>
    );
  }

  const [x, y] = dims as [ScaleRow, ScaleRow];
  const cols = [...x.levels].sort((a, b) => a.value - b.value);
  const rows = [...y.levels].sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-center text-xs">
          <caption className="sr-only">
            Matriz de {y.label} por {x.label}. Cada celda muestra el nivel que resulta de
            combinar los dos valores.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-24 text-left text-[11px] font-medium text-ink-soft">
                {y.label} ↓ / {x.label} →
              </th>
              {cols.map((c) => (
                <th key={c.levelId} scope="col" className="px-1 py-1 text-[11px] font-medium text-ink-soft">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.levelId}>
                <th scope="row" className="pr-2 text-left text-[11px] font-medium text-ink-soft">
                  {r.label}
                </th>
                {cols.map((c) => {
                  const score = combine(version.aggregation, c.value, r.value, x.weight, y.weight);
                  const b = bandOf(score);
                  const pickedX = currentFactors?.find((f) => f.scale_code === x.code)?.level_label;
                  const pickedY = currentFactors?.find((f) => f.scale_code === y.code)?.level_label;
                  const here =
                    pickedX != null && pickedY != null
                      ? pickedX === c.label && pickedY === r.label
                      : false;
                  return (
                    <td
                      key={c.levelId}
                      className={`rounded-md px-1 py-2 ${b?.tone ?? "bg-surface"} ${
                        here ? "ring-2 ring-ink" : ""
                      }`}
                    >
                      <span className="block font-medium">{b?.level.label ?? "—"}</span>
                      <span className="block text-[10px] opacity-70">{fmt(score)}</span>
                      {here ? (
                        <span className="block text-[10px] font-semibold">evaluación vigente</span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BandLegend bands={bands} currentScore={currentScore} />
    </div>
  );
}

function BandLegend({
  bands, currentScore,
}: {
  bands: { levelId: string; label: string; minScore: number | null; maxScore: number | null; isAcceptable: boolean; reviewMonths: number | null }[];
  currentScore?: number | null;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {bands.map((b, i) => {
        const here =
          currentScore != null &&
          (b.minScore == null || currentScore >= b.minScore) &&
          (b.maxScore == null || currentScore <= b.maxScore);
        return (
          <li
            key={b.levelId}
            className={`rounded-md px-2 py-1 text-[11px] ${toneFor(i, bands.length)} ${
              here ? "ring-2 ring-ink" : ""
            }`}
          >
            <span className="font-medium">{b.label}</span>{" "}
            <span className="opacity-70">
              {fmt(b.minScore)}–{fmt(b.maxScore)}
            </span>
            <span className="ml-1 opacity-70">
              · {b.isAcceptable ? "aceptable" : "sobre el criterio"}
              {b.reviewMonths ? ` · revisar cada ${b.reviewMonths} m` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}
