export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { activeVersion, getRisk, listControls, listMethodologies } from "@/lib/db/risks";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { getDeletionEligibility } from "@/lib/db/lifecycle";
import { canGovernMethodology, canGovernRisks, canManageRisks } from "@/lib/domain/risks";
import { QualityRiskDetail } from "@/components/domain/quality/risk-detail";

export const metadata = { title: "Riesgo" };

export default async function QualityRiskPage({
  params,
}: {
  params: Promise<{ riskId: string }>;
}) {
  const org = await requireQualityModule();
  const { user } = await requireSession();
  const { riskId } = await params;

  const [risk, methodologies, controls, positions, eligibility] = await Promise.all([
    getRisk(riskId),
    listMethodologies(org.organizationId, "risk"),
    listControls(org.organizationId),
    listQualityPositions(org.organizationId),
    getDeletionEligibility("risk", riskId),
  ]);

  // La ficha de otra empresa no existe: no se distingue de un identificador
  // inventado (§53). RLS ya la habría ocultado; esto lo hace explícito.
  if (!risk || risk.organizationId !== org.organizationId) notFound();

  const versions = methodologies.flatMap((m) => m.versions);
  const published = methodologies.flatMap((m) => (activeVersion(m) ? [activeVersion(m)!] : []));

  return (
    <QualityRiskDetail
      risk={risk}
      versions={published.length > 0 ? published : versions}
      allControls={controls}
      positions={positions.map((p) => ({ id: p.id, name: p.name, holderName: p.holderName }))}
      eligibility={eligibility}
      canManage={canManageRisks(org.roleCode)}
      canGovern={canGovernRisks(org.roleCode)}
      canApprove={canGovernMethodology(org.roleCode)}
      currentUserId={user.id}
    />
  );
}
