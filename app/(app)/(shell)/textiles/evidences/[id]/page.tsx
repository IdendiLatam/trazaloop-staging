// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T5 (Textil) · Detalle de evidencia: metadatos, apertura
// por signed URL, edición, revisión interna (roles) y vínculos a entidades.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  getTextileEvidence,
  listTextileEvidenceLinks,
  listLinkableEntities,
} from "@/lib/db/textiles-evidences";
import {
  TEXTILE_EVIDENCE_TYPE_LABEL,
  TEXTILE_EVIDENCE_STATUS_LABEL,
  TEXTILE_EVIDENCES_DISCLAIMER,
  TEXTILE_EVIDENCE_ACCEPTED_NOTE,
  canSetTextileEvidenceStatus,
  isTextileEvidenceExpired,
} from "@/lib/domain/textiles-evidences";
import {
  updateTextileEvidenceAction,
  updateTextileEvidenceStatusAction,
  getTextileEvidenceSignedUrlAction,
  addTextileEvidenceLinkAction,
  removeTextileEvidenceLinkAction,
} from "@/server/actions/textiles-evidences";
import { TextileEvidenceForm } from "@/components/domain/textiles/evidence-upload-form";
import {
  TextileEvidenceStatusPanel,
  TextileEvidenceOpenButton,
} from "@/components/domain/textiles/evidence-status-panel";
import { TextileEvidenceLinkManager } from "@/components/domain/textiles/evidence-link-manager";

export default async function TextileEvidenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireTextilesModule();

  const evidence = await getTextileEvidence(org.organizationId, id);
  if (!evidence) notFound();

  const [links, entityOptions] = await Promise.all([
    listTextileEvidenceLinks(org.organizationId, id),
    listLinkableEntities(org.organizationId),
  ]);

  const canReview = canSetTextileEvidenceStatus(org.roleCode);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Evidencias</p>
        <h1 className="text-2xl font-semibold tracking-tight">{evidence.title}</h1>
        <p className="text-sm text-ink-soft">
          {[
            TEXTILE_EVIDENCE_TYPE_LABEL[evidence.evidenceType as keyof typeof TEXTILE_EVIDENCE_TYPE_LABEL] ?? evidence.evidenceType,
            `Estado: ${TEXTILE_EVIDENCE_STATUS_LABEL[evidence.status as keyof typeof TEXTILE_EVIDENCE_STATUS_LABEL] ?? evidence.status}`,
            evidence.issuer ? `Emisor: ${evidence.issuer}` : "",
            evidence.documentDate ? `Fecha: ${evidence.documentDate}` : "",
            evidence.referenceCode ? `Código: ${evidence.referenceCode}` : "",
            evidence.validFrom || evidence.validUntil
              ? `Vigencia: ${evidence.validFrom ?? "—"} → ${evidence.validUntil ?? "—"}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {evidence.description ? (
          <p className="max-w-2xl text-sm text-ink-soft">{evidence.description}</p>
        ) : null}
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_EVIDENCES_DISCLAIMER}</p>
        {evidence.status === "accepted" ? (
          <p className="max-w-2xl rounded-md border border-loop/30 bg-loop/5 px-3 py-2 text-xs text-loop-deep">
            {TEXTILE_EVIDENCE_ACCEPTED_NOTE}
          </p>
        ) : null}
        {evidence.reviewNotes ? (
          <p className="max-w-2xl text-xs text-ink-soft">Notas de revisión: {evidence.reviewNotes}</p>
        ) : null}
        {isTextileEvidenceExpired(evidence.validUntil) && evidence.status !== "expired" ? (
          <p className="max-w-2xl rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
            La vigencia de este soporte terminó; considera marcarlo como vencido.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <Link href="/textiles/evidences" className="text-sm font-medium text-loop hover:underline">
            ← Evidencias textiles
          </Link>
          <TextileEvidenceOpenButton
            evidenceId={evidence.id}
            fileName={evidence.fileName}
            urlAction={getTextileEvidenceSignedUrlAction}
          />
        </div>
      </header>

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Vínculos a entidades textiles</h2>
        <TextileEvidenceLinkManager
          evidenceId={evidence.id}
          entityOptions={entityOptions}
          links={links.map((l) => ({
            id: l.id,
            entityType: l.entityType,
            entityLabel: l.entityLabel,
            linkType: l.linkType,
            notes: l.notes,
          }))}
          addAction={addTextileEvidenceLinkAction}
          removeAction={removeTextileEvidenceLinkAction}
        />
      </section>

      {canReview ? (
        <TextileEvidenceStatusPanel
          evidenceId={evidence.id}
          currentStatus={evidence.status}
          statusAction={updateTextileEvidenceStatusAction}
        />
      ) : (
        <p className="rounded-lg border border-hairline bg-surface p-3 text-xs text-ink-soft">
          El cambio de estado (aceptar/rechazar) corresponde a administrador o calidad.
        </p>
      )}

      <TextileEvidenceForm
        evidenceId={evidence.id}
        initialValues={{
          title: evidence.title,
          evidenceType: evidence.evidenceType,
          description: evidence.description ?? "",
          documentDate: evidence.documentDate ?? "",
          issuer: evidence.issuer ?? "",
          referenceCode: evidence.referenceCode ?? "",
          validFrom: evidence.validFrom ?? "",
          validUntil: evidence.validUntil ?? "",
        }}
        updateAction={updateTextileEvidenceAction}
      />
    </div>
  );
}
