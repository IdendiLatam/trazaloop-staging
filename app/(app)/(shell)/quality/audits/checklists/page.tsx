export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-09 · Checklists de auditoría.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listChecklists } from "@/lib/db/quality-audits";
import { canManageAudits } from "@/lib/domain/quality-audits";
import { ChecklistsScreen } from "@/components/domain/quality/audits/checklists";

export const metadata = { title: "Checklists de auditoría" };

export default async function ChecklistsPage() {
  const org = await requireQualityModule();
  const checklists = await listChecklists(org.organizationId);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Checklists</h1>
        <p className="text-sm text-ink-soft">
          Una ayuda con versiones. La auditoría no depende de ellos, y la versión
          publicada nunca se edita.
        </p>
      </header>

      <ChecklistsScreen
        checklists={checklists}
        canManage={canManageAudits(org.roleCode)}
      />
    </div>
  );
}
