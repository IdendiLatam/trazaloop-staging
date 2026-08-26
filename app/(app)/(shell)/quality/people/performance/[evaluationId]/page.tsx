export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-06.1 · Evaluación de desempeño con su contexto.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { getPerformanceEvaluation } from "@/lib/db/quality-people";
import { getEvaluationContext } from "@/lib/db/quality-evaluation-context";
import { EvaluationDetailView } from "@/components/domain/quality/people/evaluation-detail";

export const metadata = { title: "Evaluación de desempeño" };

export default async function QualityEvaluationPage(
  { params }: { params: Promise<{ evaluationId: string }> }
) {
  const { evaluationId } = await params;
  const org = await requireQualityModule();

  // La evaluación pasa por el círculo más cerrado de QUALITY-06. Si RLS no la
  // entrega, aquí llega `null` y la respuesta es 404: el panel de contexto no
  // puede ser una puerta trasera a la evaluación.
  const evaluation = await getPerformanceEvaluation(org.organizationId, evaluationId);
  if (!evaluation) notFound();

  const context = await getEvaluationContext(org.organizationId, evaluationId);

  return (
    <div className="max-w-5xl">
      <EvaluationDetailView evaluation={evaluation} context={context} />
    </div>
  );
}
