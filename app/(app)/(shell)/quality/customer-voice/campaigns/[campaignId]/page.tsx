export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-08 · Una campaña por dentro.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getCampaign, getCampaignDistribution, listCustomerOverview, listInvitations,
  listMetricSeries, listResponses,
} from "@/lib/db/quality-customer-voice";
import {
  canCloseCustomerVoice, canManageCustomerVoice,
} from "@/lib/domain/quality-customer-voice";
import { CampaignDetailView } from "@/components/domain/quality/customer-voice/campaign-detail";

export const metadata = { title: "Campaña" };

export default async function CampaignDetailPage(
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await params;
  const org = await requireQualityModule();

  const campaign = await getCampaign(org.organizationId, campaignId);
  if (!campaign) notFound();

  const [invitations, responses, series, distribution, customers] = await Promise.all([
    listInvitations(org.organizationId, campaignId),
    listResponses(org.organizationId, campaignId),
    listMetricSeries(org.organizationId, { campaignId }),
    getCampaignDistribution(org.organizationId, campaignId),
    listCustomerOverview(org.organizationId, {}),
  ]);

  return (
    <div className="max-w-5xl">
      <CampaignDetailView
        campaign={campaign}
        invitations={invitations}
        responses={responses}
        metrics={series}
        distribution={distribution}
        customers={customers}
        canManage={canManageCustomerVoice(org.roleCode)}
        canReopen={canCloseCustomerVoice(org.roleCode)}
      />
    </div>
  );
}
