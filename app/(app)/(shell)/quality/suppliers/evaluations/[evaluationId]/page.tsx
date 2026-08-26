export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-07 · Una evaluación de proveedor.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getSupplierEvaluation, listScopeOptions, listSupplierDocuments, todayIso,
} from "@/lib/db/quality-suppliers";
import { canManageSuppliers } from "@/lib/domain/quality-suppliers";
import { SupplierEvaluationDetail } from "@/components/domain/quality/suppliers/evaluation-detail";

export const metadata = { title: "Evaluación de proveedor" };

export default async function QualitySupplierEvaluationPage(
  { params }: { params: Promise<{ evaluationId: string }> }
) {
  const { evaluationId } = await params;
  const org = await requireQualityModule();

  const detail = await getSupplierEvaluation(org.organizationId, evaluationId);
  if (!detail) notFound();

  const scopes = await listScopeOptions(org.organizationId);
  const scope = scopes.find((s) => s.scopeId === detail.evaluation.scopeId) ?? null;
  const documents = scope
    ? await listSupplierDocuments(org.organizationId, scope.profileId)
    : [];

  return (
    <div className="max-w-5xl">
      <SupplierEvaluationDetail
        evaluation={detail.evaluation}
        results={detail.results}
        scoringRule={detail.scoringRule}
        scopeLabel={scope?.label ?? "Alcance"}
        profileId={scope?.profileId ?? null}
        documents={documents}
        canManage={canManageSuppliers(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
