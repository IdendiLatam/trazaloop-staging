export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-08 · Campañas.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listCampaigns, listSurveys } from "@/lib/db/quality-customer-voice";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canManageCustomerVoice } from "@/lib/domain/quality-customer-voice";
import { CampaignsView } from "@/components/domain/quality/customer-voice/campaigns";
import { VoiceSubnav } from "@/components/domain/quality/customer-voice/shared";

export const metadata = { title: "Campañas" };

export default async function CustomerVoiceCampaignsPage() {
  const org = await requireQualityModule();
  const [campaigns, surveys, positions] = await Promise.all([
    listCampaigns(org.organizationId, {}),
    listSurveys(org.organizationId),
    listQualityPositions(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Campañas</h1>
        <p className="text-sm text-ink-soft">
          Aplicar una versión de encuesta a un periodo y a unos destinatarios. La misma
          versión puede usarse en varias campañas sin que ninguna toque el resultado de
          otra.
        </p>
      </header>

      <VoiceSubnav current="campaigns" />

      <CampaignsView
        campaigns={campaigns}
        surveys={surveys.filter((s) => s.isActive)}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManageCustomerVoice(org.roleCode)}
      />
    </div>
  );
}
