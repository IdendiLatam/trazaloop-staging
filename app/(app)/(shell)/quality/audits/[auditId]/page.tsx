export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-09 · La auditoría entera en una pantalla.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getAudit, getAuditDetail, getPreparationDossier, listAgenda, listAuditees,
  listCheckResults, listChecklists, listConflicts, listCriteria, listEvidence,
  listFindings, listMeetings, listNotes, listPrograms, listReports, listReschedules,
  listSamples, listScopeItems, listTeam, todayIso,
} from "@/lib/db/quality-audits";
import { listPeople } from "@/lib/db/quality-people";
import { listDocumentsLinkableFromQuality } from "@/lib/db/quality-documents";
import { listQualityPositions, listQualityProcesses } from "@/lib/db/quality-processes";
import { canCloseAudits, canManageAudits } from "@/lib/domain/quality-audits";
import { AuditFile } from "@/components/domain/quality/audits/audit-file";
import { AuditSubnav } from "@/components/domain/quality/audits/shared";

export const metadata = { title: "Auditoría" };

export default async function AuditFilePage(
  { params }: { params: Promise<{ auditId: string }> }
) {
  const { auditId } = await params;
  const org = await requireQualityModule();
  const audit = await getAudit(org.organizationId, auditId);
  if (!audit) notFound();

  const [
    detail, programs, reschedules, scope, criteria, team, conflicts, agenda,
    auditees, meetings, notes, samples, evidence, findings, reports, checkRun,
    dossier, positions, processes, people, documents, checklists,
  ] = await Promise.all([
    getAuditDetail(org.organizationId, auditId),
    listPrograms(org.organizationId),
    listReschedules(org.organizationId, auditId),
    listScopeItems(org.organizationId, auditId),
    listCriteria(org.organizationId, auditId),
    listTeam(org.organizationId, auditId),
    listConflicts(org.organizationId, auditId),
    listAgenda(org.organizationId, auditId),
    listAuditees(org.organizationId, auditId),
    listMeetings(org.organizationId, auditId),
    listNotes(org.organizationId, auditId),
    listSamples(org.organizationId, auditId),
    listEvidence(org.organizationId, auditId),
    listFindings(org.organizationId, { auditId }),
    listReports(org.organizationId, auditId),
    listCheckResults(org.organizationId, auditId),
    getPreparationDossier(auditId),
    listQualityPositions(org.organizationId),
    listQualityProcesses(org.organizationId),
    listPeople(org.organizationId, { status: "active" }),
    listDocumentsLinkableFromQuality(org.organizationId),
    listChecklists(org.organizationId),
  ]);

  const publishedChecklists = checklists.flatMap((c) =>
    c.versions
      .filter((v) => v.status === "published")
      .map((v) => ({
        checklistId: c.id, versionId: v.id,
        label: `${c.name} · versión ${v.versionNumber}`,
      }))
  );

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality · Auditoría</p>
        <h1 className="text-2xl font-semibold tracking-tight">{audit.title}</h1>
      </header>

      <AuditSubnav current="audits" />

      <AuditFile
        data={{
          audit, detail,
          program: programs.find((p) => p.id === audit.programId) ?? null,
          reschedules, scope, criteria, team, conflicts, agenda, auditees, meetings,
          notes, samples, evidence, findings, reports, checkRun, dossier,
        }}
        options={{
          positions: positions.filter((p) => p.isActive)
            .map((p) => ({ id: p.id, label: p.name })),
          processes: processes.map((p) => ({
            id: p.id, label: p.code ? `${p.code} · ${p.name}` : p.name,
          })),
          people: people.map((p) => ({ id: p.id, label: p.fullName })),
          documents: documents.map((d) => ({
            id: d.id, label: d.code ? `${d.code} · ${d.title}` : d.title,
          })),
          publishedChecklists,
        }}
        canManage={canManageAudits(org.roleCode)}
        canClose={canCloseAudits(org.roleCode)}
        today={todayIso()}
      />
    </div>
  );
}
