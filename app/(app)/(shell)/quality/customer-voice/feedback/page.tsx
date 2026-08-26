export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-08 · Retroalimentación y quejas.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listCustomerOverview, listFeedback, listTopics, todayIso,
} from "@/lib/db/quality-customer-voice";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canManageCustomerVoice } from "@/lib/domain/quality-customer-voice";
import { FeedbackView } from "@/components/domain/quality/customer-voice/feedback";
import { VoiceSubnav } from "@/components/domain/quality/customer-voice/shared";

export const metadata = { title: "Retroalimentación" };

export default async function CustomerVoiceFeedbackPage() {
  const org = await requireQualityModule();
  const [feedback, customers, topics, positions] = await Promise.all([
    listFeedback(org.organizationId, {}),
    listCustomerOverview(org.organizationId, {}),
    listTopics(org.organizationId),
    listQualityPositions(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Retroalimentación y quejas</h1>
        <p className="text-sm text-ink-soft">
          Lo que el cliente dijo sin que nadie le preguntara: una llamada, un correo,
          una queja, una felicitación. Registrarlo no lo convierte en una no conformidad.
        </p>
      </header>

      <VoiceSubnav current="feedback" />

      <FeedbackView
        feedback={feedback}
        customers={customers}
        topics={topics.filter((t) => t.isActive)}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManageCustomerVoice(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
