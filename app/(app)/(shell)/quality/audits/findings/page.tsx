export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-09 · Hallazgos de todas las auditorías.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listAudits, listFindings, listRecurringFindings } from "@/lib/db/quality-audits";
import { FindingsScreen } from "@/components/domain/quality/audits/findings";

export const metadata = { title: "Hallazgos de auditoría" };

export default async function FindingsPage() {
  const org = await requireQualityModule();
  const [findings, audits, recurring] = await Promise.all([
    listFindings(org.organizationId),
    listAudits(org.organizationId),
    listRecurringFindings(org.organizationId),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Hallazgos de auditoría</h1>
        <p className="text-sm text-ink-soft">
          Qué se encontró y qué se hizo con ello. Cuántas no conformidades hay se
          responde en Casos, que es donde vive la clasificación formal.
        </p>
      </header>

      <FindingsScreen findings={findings} audits={audits} recurring={recurring} />
    </div>
  );
}
