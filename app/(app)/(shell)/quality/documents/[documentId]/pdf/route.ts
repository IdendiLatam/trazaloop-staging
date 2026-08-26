import { NextResponse } from "next/server";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { getCompanySettings } from "@/lib/db/settings";
import { getDocumentControlDetail } from "@/lib/db/document-control";
import { listQualityProcessesUsingDocument } from "@/lib/db/quality-processes";
import { QUALITY_DOC_MODULE } from "@/lib/db/quality-documents";
import { renderDocumentPdf } from "@/lib/pdf/quality-documents";
import {
  DECISION_TYPE_LABEL,
  WORKFLOW_STATE_LABEL,
  displayRevision,
  orPending,
  type DecisionType,
} from "@/lib/domain/document-control";
import { qualityDocumentCategoryLabel } from "@/lib/domain/quality-documents";
import { loadCompanyLogo } from "@/lib/db/company-logo";

/**
 * Trazaloop Quality · QUALITY-02 · PDF de UN documento controlado.
 *
 * Es una descarga real, no la impresión del navegador: `Content-Disposition:
 * attachment` con un nombre de archivo que identifica documento y revisión.
 *
 * El guard va EXPLÍCITO aquí. Los layouts de Next no envuelven a los route
 * handlers, así que la protección del namespace /quality que aplica a las
 * páginas no alcanza a este archivo: sin esta llamada, el PDF sería una puerta
 * abierta al contenido documental de cualquier empresa.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const access = await requireQualityForAction();
  if (access.org === null) {
    return NextResponse.json({ error: access.error }, { status: 403 });
  }
  const { documentId } = await params;

  const detail = await getDocumentControlDetail(
    access.org.organizationId,
    documentId,
    QUALITY_DOC_MODULE
  );
  if (!detail) {
    return NextResponse.json({ error: "El documento no existe." }, { status: 404 });
  }

  const [company, processes, logo] = await Promise.all([
    getCompanySettings(access.org.organizationId),
    listQualityProcessesUsingDocument(access.org.organizationId, documentId),
    // El logo se resuelve en SERVIDOR desde la empresa ya autorizada; si no
    // hay o no se puede incrustar, `null` y el PDF sale igual (§14).
    loadCompanyLogo(access.org.organizationId),
  ]);

  // La revisión que se imprime es la VIGENTE si la hay; si no, la que está en
  // curso. Un PDF de un documento sin nada vigente es legítimo —hay que poder
  // repartir un borrador para comentarlo— y por eso lleva su aviso.
  const revision = detail.effectiveRevision ?? detail.currentRevision;
  const round = detail.currentRevision?.round ?? 1;
  const currentParticipants = detail.participants.filter((p) => p.round === round);
  const nameOf = (p: { positionName: string | null; profileName: string }) =>
    p.positionName ? `${p.positionName} (${p.profileName})` : p.profileName;

  const pdf = renderDocumentPdf({
    documentName: "Documento controlado",
    organizationName: access.org.organizationName,
    logo: logo.outcome === "ok" ? logo.image : null,
    logoUnusable: logo.outcome === "unusable",
    companyLegalName: company?.legalName ?? null,
    companyTaxId: company?.taxId ?? null,
    code: detail.code,
    title: detail.title,
    description: detail.description,
    categoryLabel: qualityDocumentCategoryLabel(detail.categoryCode),
    lifecycle: detail.lifecycle,
    revisionText: displayRevision({
      revisionModel: detail.revisionModel,
      currentVersion: detail.currentVersion,
      currentRevisionNumber: detail.currentRevision?.revisionNumber ?? null,
    }),
    ownerText: orPending(detail.ownerPositionName ?? detail.ownerName, "Sin asignar"),
    reviewersText: orPending(
      currentParticipants.filter((p) => p.participantRole === "reviewer").map(nameOf).join(", "),
      "Sin designar"
    ),
    approversText: orPending(
      currentParticipants.filter((p) => p.participantRole === "approver").map(nameOf).join(", "),
      "Sin designar"
    ),
    createdAt: detail.createdAt,
    submittedAt: detail.currentRevision?.submittedAt ?? null,
    approvedAt: revision?.approvedAt ?? null,
    approvedByName: revision?.approvedByName ?? null,
    effectiveFrom: revision?.effectiveFrom ?? null,
    effectiveTo: revision?.effectiveTo ?? null,
    reviewDueAt: revision?.reviewDueAt ?? detail.currentRevision?.reviewDueAt ?? null,
    retirementReason: detail.retirementReason,
    processNames: processes.map((p) => p.processName).join(", "),
    sections: [...detail.sections]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ title: s.title, content: s.content })),
    revisionHistory: detail.revisions.map((r) => ({
      label: r.revisionLabel,
      state: WORKFLOW_STATE_LABEL[r.workflowState],
      approvedAt: r.approvedAt,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      changeNote: r.changeNote,
    })),
    decisions: detail.decisions.map((d) => ({
      label: DECISION_TYPE_LABEL[d.decisionType as DecisionType] ?? d.decisionType,
      byName: d.decidedByName,
      at: d.decidedAt,
      reason: d.reason,
      round: d.round,
    })),
    generatedAt: new Date().toISOString(),
  });

  const slug = (detail.code ?? detail.title)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "documento";
  const revisionSuffix = detail.currentRevision
    ? `-rev${detail.currentRevision.revisionNumber}`
    : "";

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${slug}${revisionSuffix}.pdf"`,
      "content-length": String(pdf.length),
      "cache-control": "no-store",
    },
  });
}
