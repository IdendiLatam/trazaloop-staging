export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-12 · El Copilot.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { getSettings, getUsage, listRuns, listSuggestions } from "@/lib/db/quality-ai";
import { copilotConfigured } from "@/lib/ai/copilot";
import {
  INTELLIGENCE_PRODUCT_NAME, INTELLIGENCE_SHORT_NAME,
} from "@/lib/domain/intelligence-identity";
import { providerIsLive } from "@/lib/ai/provider";
import { CopilotPanel } from "@/components/domain/quality/copilot/copilot";
import { CopilotAdmin } from "@/components/domain/quality/copilot/admin";

export const metadata = { title: INTELLIGENCE_PRODUCT_NAME };

export default async function CopilotPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const org = await requireQualityModule();
  const sp = await searchParams;

  const [ajustes, uso, consultas, borradores] = await Promise.all([
    getSettings(org.organizationId),
    getUsage(org.organizationId).catch(() => null),
    listRuns(org.organizationId, 25).catch(() => []),
    listSuggestions(org.organizationId).catch(() => []),
  ]);

  // §49 · Si se llega desde una entidad, el contexto empieza ahí y se dice.
  const pinned = sp.type && sp.id
    ? { type: sp.type, id: sp.id, label: sp.label ?? sp.type }
    : null;

  const canConfigure = ["admin", "quality"].includes(org.roleCode);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        {/* QUALITY-12.2E · «Trazaloop Intelligence», sin el módulo delante.
            Nació dentro de Quality y hoy funciona también en PCR, en Textiles y
            sobre los documentos: llamarlo «Quality Intelligence» contaría mal
            dónde se puede usar. */}
        <p className="eyebrow">{INTELLIGENCE_PRODUCT_NAME}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {INTELLIGENCE_SHORT_NAME}
        </h1>
        <p className="text-sm text-ink-soft">
          Pregunta sobre lo que ya está registrado en Trazaloop. Lee lo que tu rol
          puede ver, cita de dónde sale cada cosa y no decide nada por su cuenta.
        </p>
      </header>

      <CopilotPanel
        enabled={ajustes.isEnabled}
        configured={copilotConfigured()}
        providerLive={providerIsLive()}
        canConfigure={canConfigure}
        pinned={pinned}
        usage={uso}
        defaultUseCase={defaultUseCaseFor(pinned?.type ?? null)}
      />

      <CopilotAdmin
        canConfigure={canConfigure}
        settings={ajustes}
        runs={consultas}
        suggestions={borradores}
      />
    </div>
  );
}

function defaultUseCaseFor(pinnedType: string | null): string {
  switch (pinnedType) {
    case "quality_signal": return "explain_signal";
    case "work_case": return "root_cause";
    case "quality_audit": return "audit_prep";
    case "quality_management_review": return "review_summary";
    case "quality_process": return "risk_candidates";
    default: return "ask";
  }
}
