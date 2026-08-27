export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-11 · La ficha de una señal.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { getSignal } from "@/lib/db/quality-automation";
import { canManageAutomation } from "@/lib/domain/quality-automation";
import { SignalFile } from "@/components/domain/quality/automation/signals";
import { AutomationSubnav } from "@/components/domain/quality/automation/shared";

export const metadata = { title: "Señal" };

export default async function AutomationSignalPage(
  { params }: { params: Promise<{ signalId: string }> }
) {
  const { signalId } = await params;
  const org = await requireQualityModule();
  const signal = await getSignal(org.organizationId, signalId);
  if (!signal) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality · Automatización</p>
        <h1 className="text-2xl font-semibold tracking-tight">{signal.title}</h1>
      </header>

      <AutomationSubnav current="signals" />

      <SignalFile signal={signal} canManage={canManageAutomation(org.roleCode)} />
    </div>
  );
}
