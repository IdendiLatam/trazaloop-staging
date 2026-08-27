export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-11 · Las reglas de automatización.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listEventCatalog, listRules, listSources, listTemplates,
} from "@/lib/db/quality-automation";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canManageAutomation } from "@/lib/domain/quality-automation";
import { RulesScreen } from "@/components/domain/quality/automation/rules";

export const metadata = { title: "Reglas de automatización" };

export default async function AutomationRulesPage() {
  const org = await requireQualityModule();
  const [rules, templates, sources, positions, eventCatalog] = await Promise.all([
    listRules(org.organizationId),
    listTemplates(),
    listSources(),
    listQualityPositions(org.organizationId),
    listEventCatalog(),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality · Automatización</p>
        <h1 className="text-2xl font-semibold tracking-tight">Reglas</h1>
        <p className="text-sm text-ink-soft">
          Una regla dice cuándo mirar —cada día, o cuando ocurre un hecho—, qué
          observar, con qué condición y qué hacer cuando se cumple. Nada más:
          emite señales, avisa a un cargo y crea tareas.
        </p>
      </header>

      <RulesScreen
        rules={rules}
        templates={templates}
        sources={sources}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, label: p.name }))}
        canManage={canManageAutomation(org.roleCode)}
        eventCatalog={eventCatalog}
      />
    </div>
  );
}
