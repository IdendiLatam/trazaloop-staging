// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-02 · Ficha de un documento controlado.
//
// La página resuelve TODOS los permisos en servidor y le pasa a la vista
// booleanos ya decididos. El componente no vuelve a razonar sobre roles: si
// alguna vez alguien lo manipulara, la base seguiría diciendo que no.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { getDocumentControlDetail } from "@/lib/db/document-control";
import { QUALITY_DOC_MODULE } from "@/lib/db/quality-documents";
import {
  listQualityProcessesUsingDocument,
  listQualityPositions,
  listOrganizationMembersForQuality,
} from "@/lib/db/quality-processes";
import {
  canAttemptHardDelete,
  canCreateNextRevision,
  canDecideNow,
  canEditRevisionContent,
  canRetireDocument,
  canSubmitRevision,
  displayRevision,
  type ParticipantRole,
} from "@/lib/domain/document-control";
import {
  QualityDocumentControlDetail,
  type ResponsibleOption,
} from "@/components/domain/quality/document-control-detail";
import { getDeletionEligibility } from "@/lib/db/lifecycle";
import { deletionBlockedMessage } from "@/lib/domain/lifecycle";

export const metadata = { title: "Documento" };

export default async function QualityDocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const org = await requireQualityModule();
  const { user } = await requireSession();
  const { documentId } = await params;

  const detail = await getDocumentControlDetail(org.organizationId, documentId, QUALITY_DOC_MODULE);
  if (!detail) notFound();

  const [processes, positions, members] = await Promise.all([
    listQualityProcessesUsingDocument(org.organizationId, documentId),
    listQualityPositions(org.organizationId),
    listOrganizationMembersForQuality(org.organizationId),
  ]);

  const role = org.roleCode as never;
  const round = detail.currentRevision?.round ?? 1;
  const routeMode = detail.currentRevision?.routeMode ?? "sequential";

  const canDecide = canDecideNow({
    userId: user.id,
    lifecycle: detail.lifecycle,
    routeMode,
    round,
    participants: detail.participants.map((p) => ({
      profileId: p.profileId,
      participantRole: p.participantRole,
      stepOrder: p.stepOrder,
      round: p.round,
      decision: p.decision,
    })),
  });
  const myPendingRole: ParticipantRole | null = !canDecide
    ? null
    : detail.lifecycle === "pending_approval"
      ? "approver"
      : "reviewer";

  // El motivo de la última devolución, que es lo que el autor necesita leer
  // ANTES que ninguna otra cosa de la pantalla.
  const lastRejectionDecision = [...detail.decisions]
    .reverse()
    .find((d) => d.decisionType === "changes_requested");

  // QUALITY-03.1 · El dictamen lo emite la BASE, con las mismas preguntas que
  // hace trazadoc_delete_document_safely al ejecutar. Antes se recalculaba aquí
  // a partir de los datos ya cargados; funcionaba, pero eran dos copias de la
  // misma regla y nada garantizaba que dijeran lo mismo el día que una cambiara.
  const eligibility = await getDeletionEligibility("document", documentId);
  const canDelete = canAttemptHardDelete(role) && eligibility.canHardDelete;
  const deleteBlockedReason = eligibility.canHardDelete ? null : deletionBlockedMessage(eligibility);

  // Un cargo sin titular vigente no puede recibir una tarea: no hay persona a
  // quien asignársela. Se ofrece igualmente, pero la base lo rechaza con un
  // mensaje claro si se elige — y el desplegable ya lo anuncia.
  const responsibleOptions: ResponsibleOption[] = [
    ...positions
      .filter((p) => p.isActive)
      .map((p) => ({
        value: `position:${p.id}`,
        label: p.holderName ? `${p.name} · ${p.holderName}` : `${p.name} · sin titular`,
        group: "Cargos" as const,
      })),
    ...members.map((m) => ({
      value: `profile:${m.profileId}`,
      label: m.name,
      group: "Personas" as const,
    })),
  ];

  return (
    <QualityDocumentControlDetail
      model={{
        documentId: detail.documentId,
        code: detail.code,
        title: detail.title,
        description: detail.description,
        categoryCode: detail.categoryCode,
        lifecycle: detail.lifecycle,
        revisionText: displayRevision({
          revisionModel: detail.revisionModel,
          currentVersion: detail.currentVersion,
          currentRevisionNumber: detail.currentRevision?.revisionNumber ?? null,
        }),
        revisionModel: detail.revisionModel,
        ownerName: detail.ownerName,
        ownerPositionId: detail.ownerPositionId,
        ownerPositionName: detail.ownerPositionName,
        createdByName: detail.createdByName,
        createdAt: detail.createdAt,
        retirementReason: detail.retirementReason,
        approvedAt: detail.effectiveRevision?.approvedAt ?? detail.currentRevision?.approvedAt ?? null,
        effectiveFrom:
          detail.effectiveRevision?.effectiveFrom ?? detail.currentRevision?.effectiveFrom ?? null,
        effectiveTo: detail.effectiveRevision?.effectiveTo ?? null,
        reviewDueAt:
          detail.effectiveRevision?.reviewDueAt ?? detail.currentRevision?.reviewDueAt ?? null,
        routeMode,
        currentRound: round,
        sections: detail.sections.map((s) => ({
          id: s.id,
          blueprintSectionId: null,
          sectionKey: s.sectionKey,
          title: s.title,
          content: s.content,
          sortOrder: s.sortOrder,
          isRequired: s.isRequired,
        })),
        participants: detail.participants.map((p) => ({
          id: p.id,
          participantRole: p.participantRole,
          stepOrder: p.stepOrder,
          round: p.round,
          profileName: p.profileName,
          positionName: p.positionName,
          decision: p.decision,
          decidedAt: p.decidedAt,
          decisionComment: p.decisionComment,
        })),
        revisions: detail.revisions.map((r) => ({
          id: r.id,
          revisionNumber: r.revisionNumber,
          revisionLabel: r.revisionLabel,
          workflowState: r.workflowState,
          round: r.round,
          changeNote: r.changeNote,
          effectiveFrom: r.effectiveFrom,
          effectiveTo: r.effectiveTo,
          reviewDueAt: r.reviewDueAt,
          approvedAt: r.approvedAt,
          approvedByName: r.approvedByName,
          createdAt: r.createdAt,
        })),
        decisions: detail.decisions.map((d) => ({
          id: d.id,
          revisionNumber: d.revisionNumber,
          round: d.round,
          decisionType: d.decisionType,
          reason: d.reason,
          decidedByName: d.decidedByName,
          decidedAt: d.decidedAt,
        })),
        processes,
        positions: positions
          .filter((p) => p.isActive)
          .map((p) => ({ id: p.id, name: p.name, holderName: p.holderName })),
        responsibleOptions,
        canEdit: canEditRevisionContent(role, detail.lifecycle),
        canSubmit: canSubmitRevision(role, detail.lifecycle) && detail.currentRevision !== null,
        canDecide,
        myPendingRole,
        canCreateNextRevision: canCreateNextRevision(role, detail.lifecycle),
        canRetire: canRetireDocument(role),
        canDelete,
        deleteBlockedReason: canAttemptHardDelete(role) ? deleteBlockedReason : null,
        lastRejection: lastRejectionDecision
          ? {
              reason: lastRejectionDecision.reason,
              byName: lastRejectionDecision.decidedByName,
              at: lastRejectionDecision.decidedAt,
            }
          : null,
      }}
    />
  );
}
