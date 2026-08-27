export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-11 · Resumen de la Automatización.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getHealth, listRules, listRuns, listSignals,
} from "@/lib/db/quality-automation";
import {
  canManageAutomation, canPublishAutomation,
} from "@/lib/domain/quality-automation";
import { AutomationHome } from "@/components/domain/quality/automation/home";

export const metadata = { title: "Automatización" };

export default async function AutomationPage() {
  const org = await requireQualityModule();
  const [health, rules, signals, runs] = await Promise.all([
    getHealth(org.organizationId),
    listRules(org.organizationId),
    listSignals(org.organizationId, { open: true }),
    listRuns(org.organizationId, 10),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Automatización</h1>
        <p className="text-sm text-ink-soft">
          Trazaloop mira lo que ya está registrado y avisa cuando una condición merece
          atención. Reglas explícitas, resultados explicables y ninguna decisión tomada
          por la plataforma.
        </p>
      </header>

      <AutomationHome
        health={health}
        rules={rules}
        signals={signals}
        runs={runs}
        canManage={canManageAutomation(org.roleCode)}
        canPublish={canPublishAutomation(org.roleCode)}
      />
    </div>
  );
}
