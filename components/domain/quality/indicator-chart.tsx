import {
  formatValue,
  type Direction, type Evaluation,
} from "@/lib/domain/quality-indicators";

/**
 * Trazaloop Quality · QUALITY-03 · Serie temporal de un indicador.
 *
 * SVG en línea, renderizado en el servidor. Sin librerías: lo que hay que
 * dibujar son unos puntos, una línea y una referencia de meta, y añadir un
 * paquete de gráficas por eso engordaría el despliegue sin mejorar nada.
 *
 * La gráfica NO es la única forma de leer los datos: debajo va siempre la
 * tabla con los mismos números. Una imagen sin alternativa textual deja fuera
 * a quien usa lector de pantalla, y aquí los números son el contenido.
 *
 * Los periodos SIN DATO no se dibujan como cero (OI-21): se saltan, y la línea
 * se interrumpe. Un cero dibujado donde no hubo medición es una mentira
 * gráfica.
 */

export type ChartPoint = {
  periodLabel: string;
  value: number | null;
  evaluation: Evaluation;
};

const W = 720;
const H = 200;
const PAD_L = 46;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 28;

const COLOR: Record<Evaluation, string> = {
  complies: "#1f7a5a",
  attention: "#b47100",
  not_met: "#b3261e",
  no_target: "#6b7280",
  no_data: "#9ca3af",
};

export function IndicatorChart({
  points, direction, targetValue, targetMin, targetMax, unitCode, unitLabel,
}: {
  points: ChartPoint[];
  direction: Direction;
  targetValue: number | null;
  targetMin: number | null;
  targetMax: number | null;
  unitCode: string | null;
  unitLabel: string | null;
}) {
  const withData = points.filter((p) => p.value !== null);
  if (withData.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-hairline bg-surface px-4 py-6 text-center text-sm text-ink-soft">
        Todavía no hay mediciones con resultado para dibujar la serie.
      </p>
    );
  }

  const values = withData.map((p) => p.value as number);
  const refs = [targetValue, targetMin, targetMax].filter((v): v is number => v !== null);
  const lo = Math.min(...values, ...refs);
  const hi = Math.max(...values, ...refs);
  // Un margen del 10 % evita que el punto más alto toque el borde y que una
  // serie plana se dibuje como una línea pegada al eje.
  const span = hi - lo === 0 ? Math.max(Math.abs(hi) * 0.2, 1) : (hi - lo) * 0.1;
  // El eje no baja de cero cuando ningún dato es negativo: un «−9,6 %» en la
  // esquina de una gráfica de porcentajes es ruido que invita a preguntarse
  // qué significa, y no significa nada.
  const min = lo >= 0 ? Math.max(0, lo - span) : lo - span;
  const max = hi + span;

  const x = (i: number) =>
    points.length === 1
      ? PAD_L + (W - PAD_L - PAD_R) / 2
      : PAD_L + (i * (W - PAD_L - PAD_R)) / (points.length - 1);
  const y = (v: number) => PAD_T + ((max - v) / (max - min)) * (H - PAD_T - PAD_B);

  // La línea se parte donde no hay dato: cada tramo continuo es un path.
  const segments: { i: number; v: number }[][] = [];
  let current: { i: number; v: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
    } else {
      current.push({ i, v: p.value });
    }
  });
  if (current.length > 0) segments.push(current);

  const fmt = (v: number) => formatValue(v, unitCode, unitLabel);
  const showBand = direction === "within_range" && targetMin !== null && targetMax !== null;

  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Evolución del indicador entre ${points[0].periodLabel} y ${points[points.length - 1].periodLabel}. Los valores exactos están en la tabla siguiente.`}
      >
        {/* Banda de la meta cuando es un rango */}
        {showBand ? (
          <rect
            x={PAD_L} y={y(targetMax as number)}
            width={W - PAD_L - PAD_R}
            height={Math.max(y(targetMin as number) - y(targetMax as number), 1)}
            fill="#1f7a5a" opacity="0.08"
          />
        ) : null}

        {/* Línea de meta */}
        {targetValue !== null ? (
          <>
            <line
              x1={PAD_L} y1={y(targetValue)} x2={W - PAD_R} y2={y(targetValue)}
              stroke="#1f7a5a" strokeWidth="1" strokeDasharray="4 3" opacity="0.8"
            />
            {/*
              Debajo de la línea y a la izquierda. Ninguna posición es
              perfecta —una serie que ronda su meta pasa por todas—, pero
              encima y a la derecha choca justo con los puntos que más
              interesan: los que están cumpliendo.
            */}
            <text x={PAD_L + 2} y={y(targetValue) + 11} fontSize="9" fill="#1f7a5a">
              meta {fmt(targetValue)}
            </text>
          </>
        ) : null}

        {/* Ejes mínimos: solo el suelo y los dos extremos del eje vertical */}
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#d4d4d8" strokeWidth="1" />
        <text x={4} y={PAD_T + 4} fontSize="9" fill="#6b7280">{fmt(max)}</text>
        <text x={4} y={H - PAD_B} fontSize="9" fill="#6b7280">{fmt(min)}</text>

        {segments.map((seg, k) => (
          <polyline
            key={k}
            fill="none" stroke="#3f6f5f" strokeWidth="1.5"
            points={seg.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
          />
        ))}

        {points.map((p, i) =>
          p.value === null ? (
            // Un periodo sin dato se marca con una cruz tenue en el eje: se ve
            // que el periodo existió y que no se midió.
            <text key={i} x={x(i)} y={H - PAD_B - 4} fontSize="9" fill="#9ca3af" textAnchor="middle">×</text>
          ) : (
            <circle key={i} cx={x(i)} cy={y(p.value)} r="3.5" fill={COLOR[p.evaluation]} />
          )
        )}

        {points.map((p, i) => (
          <text
            key={`l-${i}`} x={x(i)} y={H - 8} fontSize="9" fill="#6b7280" textAnchor="middle"
          >
            {points.length > 12 && i % 2 === 1 ? "" : p.periodLabel}
          </text>
        ))}
      </svg>
      <figcaption className="text-xs text-ink-soft">
        Cada punto es un periodo medido; su color indica la evaluación. Los periodos sin dato se
        marcan con «×» y no se dibujan como cero.
      </figcaption>
    </figure>
  );
}
