// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { listTextileCircularityAssessments } from "@/lib/db/textiles-circularity";
import {
  TEXTILE_CIRCULARITY_STATUS_LABEL,
  TEXTILE_READINESS_LEVEL_LABEL,
  TEXTILE_CIRCULARITY_DISCLAIMER,
} from "@/lib/domain/textiles-circularity";

export default async function TextileCircularityAssessmentsPage() {
  const org = await requireTextilesModule();
  const assessments = await listTextileCircularityAssessments(org.organizationId);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Circularidad</p>
        <h1 className="text-2xl font-semibold tracking-tight">Evaluaciones de circularidad</h1>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_CIRCULARITY_DISCLAIMER}</p>
        <div className="flex gap-3">
          <Link href="/textiles/circularity" className="text-sm font-medium text-loop hover:underline">
            ← Circularidad
          </Link>
          <Link href="/textiles/circularity/assessments/new" className="text-sm text-loop hover:underline">
            Nueva evaluación →
          </Link>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Evaluaciones ({assessments.length})</h2>
        {assessments.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
            Aún no hay evaluaciones. Crea la primera desde “Nueva evaluación”.
          </p>
        ) : (
          <ul className="space-y-2">
            {assessments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/textiles/circularity/assessments/${a.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-hairline bg-surface p-3 text-sm transition-colors hover:border-loop"
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="block font-medium">
                      {a.assessmentCode}
                      {a.sku ? <span className="ml-2 text-xs text-ink-soft">{a.sku}</span> : null}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {[
                        a.productName ?? "",
                        a.outputLotCode ? `Lote: ${a.outputLotCode}` : "Sin lote",
                        a.assessmentDate ?? "",
                        `${a.gaps.length} brecha(s)`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] text-ink-soft">
                      {TEXTILE_CIRCULARITY_STATUS_LABEL[a.status as keyof typeof TEXTILE_CIRCULARITY_STATUS_LABEL] ?? a.status}
                    </span>
                    <span className="text-xs font-semibold text-loop-deep">
                      {a.circularityScore !== null
                        ? `${a.circularityScore} / 100 · ${TEXTILE_READINESS_LEVEL_LABEL[a.readinessLevel as keyof typeof TEXTILE_READINESS_LEVEL_LABEL] ?? a.readinessLevel ?? ""}`
                        : "Sin calcular"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
