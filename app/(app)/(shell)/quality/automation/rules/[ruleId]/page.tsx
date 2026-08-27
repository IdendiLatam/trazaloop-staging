export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-11 · La regla entera en una pantalla.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  describeVersion, getRule, listSignals, listSources, listVersions,
} from "@/lib/db/quality-automation";
import { listQualityPositions } from "@/lib/db/quality-processes";
import {
  canManageAutomation, canPublishAutomation,
} from "@/lib/domain/quality-automation";
import { RuleFile } from "@/components/domain/quality/automation/rule-file";
import { AutomationSubnav } from "@/components/domain/quality/automation/shared";

export const metadata = { title: "Regla de automatización" };

export default async function AutomationRulePage(
  { params }: { params: Promise<{ ruleId: string }> }
) {
  const { ruleId } = await params;
  const org = await requireQualityModule();
  const rule = await getRule(org.organizationId, ruleId);
  if (!rule) notFound();

  const [versions, sources, signals, positions] = await Promise.all([
    listVersions(org.organizationId, ruleId),
    listSources(),
    listSignals(org.organizationId, { ruleId }),
    listQualityPositions(org.organizationId),
  ]);

  // §169 · El resumen legible sale de la base, del árbol de la propia regla.
  const vigente = versions.find((v) => v.status === "published")
    ?? versions.find((v) => v.status === "draft") ?? null;
  const summary = vigente ? await describeVersion(vigente.id) : null;

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality · Automatización</p>
        <h1 className="text-2xl font-semibold tracking-tight">{rule.name}</h1>
      </header>

      <AutomationSubnav current="rules" />

      <RuleFile
        rule={rule}
        versions={versions}
        source={sources.find((s) => s.code === rule.sourceCode) ?? null}
        signals={signals}
        summary={summary}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, label: p.name }))}
        canManage={canManageAutomation(org.roleCode)}
        canPublish={canPublishAutomation(org.roleCode)}
      />
    </div>
  );
}
