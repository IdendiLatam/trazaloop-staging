export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { activeVersion, getOpportunity, listMethodologies } from "@/lib/db/risks";
import { getDeletionEligibility } from "@/lib/db/lifecycle";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canGovernRisks, canManageRisks } from "@/lib/domain/risks";
import { QualityOpportunityDetail } from "@/components/domain/quality/opportunity-detail";

export const metadata = { title: "Oportunidad" };

export default async function QualityOpportunityPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const org = await requireQualityModule();
  const { opportunityId } = await params;

  const [opportunity, methodologies, positions, eligibility] = await Promise.all([
    getOpportunity(opportunityId),
    listMethodologies(org.organizationId, "opportunity"),
    listQualityPositions(org.organizationId),
    getDeletionEligibility("opportunity", opportunityId),
  ]);

  if (!opportunity || opportunity.organizationId !== org.organizationId) notFound();

  const published = methodologies.map((m) => activeVersion(m)).find(Boolean) ?? null;

  return (
    <QualityOpportunityDetail
      opportunity={opportunity}
      version={published}
      positions={positions.map((p) => ({ id: p.id, name: p.name, holderName: p.holderName }))}
      eligibility={eligibility}
      canManage={canManageRisks(org.roleCode)}
      canGovern={canGovernRisks(org.roleCode)}
    />
  );
}
