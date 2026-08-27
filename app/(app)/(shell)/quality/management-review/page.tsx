export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-10 · Revisiones por la dirección.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listReviews } from "@/lib/db/quality-management-review";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canManageManagementReview } from "@/lib/domain/quality-management-review";
import { ReviewsScreen } from "@/components/domain/quality/management-review/reviews";

export const metadata = { title: "Revisión por la dirección" };

export default async function ManagementReviewPage() {
  const org = await requireQualityModule();
  const [reviews, positions] = await Promise.all([
    listReviews(org.organizationId),
    listQualityPositions(org.organizationId),
  ]);

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Revisión por la dirección
        </h1>
        <p className="text-sm text-ink-soft">
          El punto donde convergen procesos, objetivos, indicadores, personas, casos,
          riesgos, proveedores, clientes y auditorías. No es un tablero: registra qué
          miró la dirección en un periodo, qué concluyó y qué decidió.
        </p>
      </header>

      <ReviewsScreen
        reviews={reviews}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, label: p.name }))}
        canManage={canManageManagementReview(org.roleCode)}
      />
    </div>
  );
}
