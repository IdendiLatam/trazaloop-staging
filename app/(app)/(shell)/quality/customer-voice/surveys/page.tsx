export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-08 · Encuestas y versiones.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listSurveys, listTopics, todayIso } from "@/lib/db/quality-customer-voice";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canManageCustomerVoice } from "@/lib/domain/quality-customer-voice";
import { SurveysView } from "@/components/domain/quality/customer-voice/surveys";
import { VoiceSubnav } from "@/components/domain/quality/customer-voice/shared";

export const metadata = { title: "Encuestas" };

export default async function CustomerVoiceSurveysPage() {
  const org = await requireQualityModule();
  const [surveys, topics, positions] = await Promise.all([
    listSurveys(org.organizationId),
    listTopics(org.organizationId),
    listQualityPositions(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Encuestas</h1>
        <p className="text-sm text-ink-soft">
          Qué se pregunta y con qué escala. Cada cambio es una versión nueva, para que
          lo que ya respondieron los clientes siga significando lo mismo.
        </p>
      </header>

      <VoiceSubnav current="surveys" />

      <SurveysView
        surveys={surveys}
        topics={topics.filter((t) => t.isActive)}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManageCustomerVoice(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
