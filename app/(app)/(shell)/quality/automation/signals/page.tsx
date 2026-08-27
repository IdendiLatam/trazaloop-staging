export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-11 · La bandeja transversal de señales.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listSignals } from "@/lib/db/quality-automation";
import { canManageAutomation } from "@/lib/domain/quality-automation";
import { SignalsScreen } from "@/components/domain/quality/automation/signals";

export const metadata = { title: "Señales" };

export default async function AutomationSignalsPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const org = await requireQualityModule();
  const sp = await searchParams;
  const dominio = typeof sp.domain === "string" ? sp.domain : undefined;
  const gravedad = typeof sp.severity === "string" ? sp.severity : undefined;

  const signals = await listSignals(org.organizationId, {
    domain: dominio, severity: gravedad,
  });

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality · Automatización</p>
        <h1 className="text-2xl font-semibold tracking-tight">Señales</h1>
        <p className="text-sm text-ink-soft">
          Lo que la plataforma ha detectado, con la regla que lo detectó y los datos
          que miró. Una señal es un hecho: la alerta es solo cómo te enteras.
        </p>
      </header>

      <SignalsScreen signals={signals} canManage={canManageAutomation(org.roleCode)} />
    </div>
  );
}
