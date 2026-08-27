export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-10 · Seguimiento transversal de lo decidido.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { listDecisions, listReviews } from "@/lib/db/quality-management-review";
import { FollowUpScreen } from "@/components/domain/quality/management-review/followup";

export const metadata = { title: "Seguimiento de la revisión por la dirección" };

export default async function ManagementReviewFollowUpPage() {
  const org = await requireQualityModule();
  const reviews = await listReviews(org.organizationId);

  // Las decisiones de todas las revisiones, con su revisión al lado. Se piden
  // por separado porque los embeds de clave compuesta no resuelven.
  const porRevision = await Promise.all(
    reviews.map(async (r) => {
      const decisiones = await listDecisions(org.organizationId, r.id);
      return decisiones.map((d) => ({
        ...d, reviewId: r.id, reviewCode: r.code, reviewPeriod: r.periodLabel,
      }));
    })
  );

  return (
    <div className="max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality · Revisión por la dirección</p>
        <h1 className="text-2xl font-semibold tracking-tight">Seguimiento</h1>
        <p className="text-sm text-ink-soft">
          De todo lo que la dirección decidió, qué sigue abierto hoy. Se lee del motor
          de acciones, en vivo: ninguna de estas cifras cambia el acta que las originó.
        </p>
      </header>

      <FollowUpScreen reviews={reviews} decisions={porRevision.flat()} />
    </div>
  );
}
