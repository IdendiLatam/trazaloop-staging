// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T7 (Textil) · Centro de evaluación de circularidad.

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  getActiveTextileCircularityMethodology,
  listTextileCircularityAssessments,
} from "@/lib/db/textiles-circularity";
import { TEXTILE_CIRCULARITY_DISCLAIMER } from "@/lib/domain/textiles-circularity";

export default async function TextileCircularityHubPage() {
  const org = await requireTextilesModule();
  const [methodology, assessments] = await Promise.all([
    getActiveTextileCircularityMethodology(),
    listTextileCircularityAssessments(org.organizationId),
  ]);

  const gapCounts = new Map<string, number>();
  for (const a of assessments) {
    for (const g of a.gaps) gapCounts.set(g.message, (gapCounts.get(g.message) ?? 0) + 1);
  }
  const topGaps = [...gapCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Circularidad</p>
        <h1 className="text-2xl font-semibold tracking-tight">Evaluación de circularidad textil</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Evalúa la preparación circular de referencias textiles a partir de composición,
          trazabilidad, evidencias, separabilidad y potencial de reutilización/reciclabilidad.
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_CIRCULARITY_DISCLAIMER}</p>
        <Link href="/textiles" className="text-sm font-medium text-loop hover:underline">
          ← Módulo Textil
        </Link>
        <p className="text-xs text-ink-soft">
          Procedimiento documental relacionado:{" "}
          <Link href="/textiles/trazadocs" className="text-loop hover:underline">
            Evaluación de circularidad (TXT-PRO-007) en TrazaDocs Textil →
          </Link>
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/textiles/circularity/assessments"
          className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-4 transition-colors hover:border-loop"
        >
          <span className="text-sm font-semibold">Evaluaciones</span>
          <span className="text-xs text-ink-soft">
            {assessments.length} evaluación(es) registradas, con puntaje, nivel y brechas.
          </span>
          <span className="text-sm font-medium text-loop">Ver evaluaciones →</span>
        </Link>
        <Link
          href="/textiles/circularity/assessments/new"
          className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-4 transition-colors hover:border-loop"
        >
          <span className="text-sm font-semibold">Nueva evaluación</span>
          <span className="text-xs text-ink-soft">
            Evalúa una referencia/SKU y, si quieres, un lote producido/final asociado.
          </span>
          <span className="text-sm font-medium text-loop">Crear evaluación →</span>
        </Link>
        <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-4">
          <span className="text-sm font-semibold">Metodología activa</span>
          <span className="text-xs text-ink-soft">
            {methodology
              ? `${methodology.name} (${methodology.methodCode} ${methodology.version}).`
              : "No hay metodología activa (aplica la migración 0080)."}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-4">
          <span className="text-sm font-semibold">Brechas frecuentes</span>
          {topGaps.length === 0 ? (
            <span className="text-xs text-ink-soft">Sin brechas registradas todavía.</span>
          ) : (
            <ul className="list-inside list-disc space-y-0.5 text-xs text-ink-soft">
              {topGaps.map(([message, count]) => (
                <li key={message}>
                  {message} ({count})
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
