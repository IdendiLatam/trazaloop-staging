export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-10 · La revisión entera en una pantalla.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getFollowUp, getInputFreshness, getReadiness, getReview, getReviewDetail,
  listAgenda, listDecisions, listInputs, listMinutes, listNotes, listParticipants,
} from "@/lib/db/quality-management-review";
import { listPeople } from "@/lib/db/quality-people";
import { listQualityPositions } from "@/lib/db/quality-processes";
import {
  canCloseManagementReview, canManageManagementReview, type Readiness,
} from "@/lib/domain/quality-management-review";
import { ReviewFile } from "@/components/domain/quality/management-review/review-file";
import { ReviewSubnav } from "@/components/domain/quality/management-review/shared";

export const metadata = { title: "Revisión por la dirección" };

export default async function ManagementReviewFilePage(
  { params }: { params: Promise<{ reviewId: string }> }
) {
  const { reviewId } = await params;
  const org = await requireQualityModule();
  const review = await getReview(org.organizationId, reviewId);
  if (!review) notFound();

  const [
    detail, participants, agenda, inputs, decisions, minutes, notes,
    readinessRaw, followUp, positions, people,
  ] = await Promise.all([
    getReviewDetail(org.organizationId, reviewId),
    listParticipants(org.organizationId, reviewId),
    listAgenda(org.organizationId, reviewId),
    listInputs(org.organizationId, reviewId),
    listDecisions(org.organizationId, reviewId),
    listMinutes(org.organizationId, reviewId),
    listNotes(org.organizationId, reviewId),
    getReadiness(reviewId),
    getFollowUp(reviewId),
    listQualityPositions(org.organizationId),
    listPeople(org.organizationId, { status: "active" }),
  ]);

  // §56 · Por entrada: ¿cambió la fuente desde que se preparó? Se pregunta una
  // vez por entrada automática, y no sustituye nada.
  const frescuras = await Promise.all(
    inputs.filter((i) => i.inputMode === "automatic")
      .map(async (i) => [i.id, await getInputFreshness(i.id)] as const)
  );
  const freshness: Record<string, boolean> = {};
  for (const [id, f] of frescuras) {
    freshness[id] = (f as Record<string, unknown> | null)?.source_updated === true;
  }

  const readiness: Readiness | null = readinessRaw
    ? {
        requiredInputs: Number(readinessRaw.required_inputs ?? 0),
        ready: Number(readinessRaw.ready ?? 0),
        missing: Number(readinessRaw.missing ?? 0),
        notApplicable: Number(readinessRaw.not_applicable ?? 0),
        requiresManualReview: Number(readinessRaw.requires_manual_review ?? 0),
        pending: Number(readinessRaw.pending ?? 0),
        withoutAnalysis: Number(readinessRaw.without_analysis ?? 0),
        isReady: readinessRaw.is_ready === true,
      }
    : null;

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality · Revisión por la dirección</p>
        <h1 className="text-2xl font-semibold tracking-tight">{review.title}</h1>
      </header>

      <ReviewSubnav current="reviews" />

      <ReviewFile
        data={{
          review, detail, participants, agenda, inputs, decisions, minutes,
          notes, readiness, followUp, freshness,
        }}
        options={{
          positions: positions.filter((p) => p.isActive)
            .map((p) => ({ id: p.id, label: p.name })),
          people: people.map((p) => ({ id: p.id, label: p.fullName })),
        }}
        canManage={canManageManagementReview(org.roleCode)}
        canClose={canCloseManagementReview(org.roleCode)}
      />
    </div>
  );
}
