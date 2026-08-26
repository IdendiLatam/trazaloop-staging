export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-09 · Resumen de Auditorías.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getAuditHomeSignals, listAudits, listPrograms, listRecurringFindings, todayIso,
} from "@/lib/db/quality-audits";
import { AuditsSummary } from "@/components/domain/quality/audits/summary";

export const metadata = { title: "Auditorías" };

export default async function AuditsPage() {
  const org = await requireQualityModule();
  const [signals, programs, audits, recurring] = await Promise.all([
    getAuditHomeSignals(org.organizationId),
    listPrograms(org.organizationId),
    listAudits(org.organizationId),
    listRecurringFindings(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Auditorías</h1>
        <p className="text-sm text-ink-soft">
          Qué se planificó auditar, qué se auditó de verdad, qué se encontró y qué quedó
          abierto después. Trazaloop administra auditorías: no concede certificación.
        </p>
      </header>

      <AuditsSummary
        signals={signals}
        programs={programs}
        audits={audits}
        recurring={recurring}
        today={todayIso()}
      />
    </div>
  );
}
