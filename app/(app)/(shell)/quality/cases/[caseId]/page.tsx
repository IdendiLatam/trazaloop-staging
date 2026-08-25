export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getCase, getClosureEligibility, listCaseActions, listCaseHistory,
  listCaseReferences, listCaseRequirements, listCauses, listFindings, listVerifications,
} from "@/lib/db/work-cases";
import { listQualityPositions, listQualityProcesses } from "@/lib/db/quality-processes";
import { listDocumentsLinkedToQuality } from "@/lib/db/quality-documents";
import { canGovernCases, canManageCases, canReopenCase } from "@/lib/domain/work-cases";
import { QualityCaseDetail } from "@/components/domain/quality/case-detail";

export const metadata = { title: "Caso" };

export default async function QualityCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const org = await requireQualityModule();
  const { caseId } = await params;

  const detail = await getCase(org.organizationId, caseId);
  if (!detail) notFound();

  const [findings, requirements, references, causes, actions, positions, processes, documents, closure] =
    await Promise.all([
      listFindings(org.organizationId, caseId),
      listCaseRequirements(org.organizationId, caseId),
      listCaseReferences(org.organizationId, caseId),
      listCauses(org.organizationId, caseId),
      listCaseActions(org.organizationId, caseId),
      listQualityPositions(org.organizationId),
      listQualityProcesses(org.organizationId),
      listDocumentsLinkedToQuality(org.organizationId),
      getClosureEligibility(caseId),
    ]);

  const actionIds = actions.map((a) => a.id);
  const [verifications, history] = await Promise.all([
    listVerifications(org.organizationId, actionIds),
    listCaseHistory(org.organizationId, caseId, actionIds),
  ]);

  // El catálogo normativo es de plataforma, no de la empresa: se lee aquí y se
  // ofrece tal cual, sin construir un segundo catálogo (§12).
  const supabase = await createServerClient();
  const { data: reqCatalog } = await supabase
    .from("requirements").select("id, code, title").order("code").limit(200);

  // Un caso es eliminable mientras siga siendo un borrador SIN historia: sin
  // evaluar, sin hallazgos, sin acciones y sin decisiones. La misma regla que
  // QUALITY-03.1 aplicó al resto del sistema.
  const untouched =
    detail.status === "draft" &&
    detail.classification === "pending" &&
    findings.length === 0 &&
    actions.length === 0 &&
    history.length === 0;
  const blockingParts: string[] = [];
  if (detail.classification !== "pending") blockingParts.push("ya fue evaluado");
  if (findings.length > 0) {
    blockingParts.push(`tiene ${findings.length} ${findings.length === 1 ? "hallazgo" : "hallazgos"}`);
  }
  if (actions.length > 0) {
    blockingParts.push(`tiene ${actions.length} ${actions.length === 1 ? "acción" : "acciones"}`);
  }
  if (history.length > 0) {
    blockingParts.push(`tiene ${history.length} ${history.length === 1 ? "decisión registrada" : "decisiones registradas"}`);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <QualityCaseDetail
      model={{
        caseId: detail.caseId, code: detail.code, title: detail.title,
        description: detail.description, caseType: detail.caseType,
        originKind: detail.originKind, originNote: detail.originNote,
        detectedOn: detail.detectedOn, classification: detail.classification,
        priority: detail.priority, status: detail.status,
        requirementText: detail.requirementText, evidenceText: detail.evidenceText,
        nonconformityText: detail.nonconformityText,
        ownerLabel: detail.ownerPositionName
          ? `${detail.ownerPositionName}${detail.ownerHolderName ? ` · ${detail.ownerHolderName}` : " · sin titular"}`
          : "Sin asignar",
        reportedByName: detail.reportedByName,
        closedAt: detail.closedAt, closureNote: detail.closureNote,
        reopenCount: detail.reopenCount, processNames: detail.processNames,
        findings, requirements, references, causes,
        actions: actions.map((a) => ({
          ...a, verifications: verifications.filter((v) => v.actionId === a.id),
        })),
        history,
        closure,
        positions: positions.filter((p) => p.isActive).map((p) => ({
          id: p.id, name: p.name, holderName: p.holderName,
        })),
        processes: processes.map((p) => ({ id: p.id, name: p.name })),
        requirementCatalog: (reqCatalog ?? []).map((r) => ({
          id: r.id as string, label: `${r.code} · ${r.title}`,
        })),
        documents: documents.map((d) => ({
          id: d.documentId, label: `${d.code ? `${d.code} · ` : ""}${d.title}`,
        })),
        canManage: canManageCases(org.roleCode),
        canGovern: canGovernCases(org.roleCode),
        canReopen: canReopenCase(org.roleCode),
        canDelete: canGovernCases(org.roleCode) && untouched,
        deleteBlockedReason: untouched
          ? null
          : `Este caso ya tiene historia y debe conservarse: ${blockingParts.join(", ")}.`,
        today,
      }}
    />
  );
}
