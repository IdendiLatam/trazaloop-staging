export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-08 · Resumen de la Voz del Cliente.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listCustomerSignals, listMetricDefinitions, listMetricSeries, listVoiceReviews, todayIso,
} from "@/lib/db/quality-customer-voice";
import { listQualityPositions } from "@/lib/db/quality-processes";
import {
  canCloseCustomerVoice, canManageCustomerVoice,
} from "@/lib/domain/quality-customer-voice";
import { CustomerVoiceSummary } from "@/components/domain/quality/customer-voice/summary";
import { VoiceSubnav } from "@/components/domain/quality/customer-voice/shared";
import { CustomerThemes } from "@/components/domain/quality/customer-voice/themes";
import { listCustomerThemes } from "@/lib/db/quality-ai";

export const metadata = { title: "Voz del cliente" };

export default async function CustomerVoicePage() {
  const org = await requireQualityModule();
  const [definitions, series, signals, reviews, positions, themes] = await Promise.all([
    listMetricDefinitions(org.organizationId),
    listMetricSeries(org.organizationId),
    listCustomerSignals(org.organizationId),
    listVoiceReviews(org.organizationId),
    listQualityPositions(org.organizationId),
    // QUALITY-12.1 · Si el Copilot está apagado o nunca se usó, esto es una
    // lista vacía y el bloque no aparece. La Voz del cliente no depende de la IA.
    listCustomerThemes(org.organizationId).catch(() => []),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Voz del cliente</h1>
        <p className="text-sm text-ink-soft">
          Qué dicen los clientes, cómo cambia y qué se hizo con ello. No es un CRM: aquí
          no hay oportunidades comerciales, ni embudos, ni campañas de marketing.
        </p>
      </header>

      <VoiceSubnav current="summary" />

      <CustomerVoiceSummary
        definitions={definitions.filter((d) => d.isActive)}
        series={series}
        signals={signals}
        reviews={reviews}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManageCustomerVoice(org.roleCode)}
        canClose={canCloseCustomerVoice(org.roleCode)}
        today={todayIso()}
      />

      <CustomerThemes themes={themes} canManage={canManageCustomerVoice(org.roleCode)} />
    </div>
  );
}
