// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-01 · Cargos y quién los ocupa (T-02).

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listQualityPositions,
  listOrganizationMembersForQuality,
  listQualityPositionAssignments,
} from "@/lib/db/quality-processes";
import { canManagePositions } from "@/lib/domain/quality-processes";
import { QualityPositionsManager } from "@/components/domain/quality/positions-manager";

export const metadata = { title: "Cargos" };

export default async function QualityPositionsPage() {
  const org = await requireQualityModule();

  const [positions, members] = await Promise.all([
    listQualityPositions(org.organizationId),
    listOrganizationMembersForQuality(org.organizationId),
  ]);

  // Historial de cada cargo: se resuelve en servidor para que la pantalla
  // pueda mostrar la vigencia sin viajes adicionales desde el navegador.
  const history = await Promise.all(
    positions.map(async (p) => ({
      positionId: p.id,
      assignments: await listQualityPositionAssignments(org.organizationId, p.id),
    }))
  );

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Cargos</h1>
        <p className="text-sm text-ink-soft">
          Un cargo es el responsable estable de un proceso. Las personas entran y salen del
          cargo con fechas de vigencia; el proceso sigue apuntando al cargo, así que nunca
          se pierde quién respondía por él en una fecha determinada.
        </p>
      </header>

      <QualityPositionsManager
        positions={positions}
        members={members}
        history={history}
        canManage={canManagePositions(org.roleCode)}
      />
    </div>
  );
}
