import "server-only";

import { getCompanySettings } from "@/lib/db/settings";
import { getDocumentControlDetail } from "@/lib/db/document-control";
import { listQualityProcessesUsingDocument } from "@/lib/db/quality-processes";
import { QUALITY_DOC_MODULE } from "@/lib/db/quality-documents";
import { loadQualityMasterList, readMasterFilters } from "@/lib/db/quality-master-list";
import { renderDocumentPdf, renderMasterListPdf } from "@/lib/pdf/quality-documents";
import { loadCompanyLogo } from "@/lib/db/company-logo";
import {
  DECISION_TYPE_LABEL, WORKFLOW_STATE_LABEL, displayRevision, orPending,
  type DecisionType,
} from "@/lib/domain/document-control";
import { qualityDocumentCategoryLabel } from "@/lib/domain/quality-documents";
import {
  MASTER_COLUMNS, describeFilters, filterMasterList, masterListHeaders, masterListToRows,
} from "@/lib/domain/document-master-list";
import type { ExportDefinition, ExportModule, ExportResult } from "../registry-types";

/**
 * EXPORT-01 · Documento controlado y Lista Maestra.
 * EXPORT-01.1 · El MISMO motor para Quality, PCR y Textiles (§15, §49).
 *
 * ESTOS DOS SON LA EXCEPCIÓN, Y ESTÁ RAZONADA.
 *
 * Existían antes de EXPORT-01, llevan meses en uso y su contenido está
 * comprobado por 70 aserciones que abren el PDF real. §27 pide que su
 * comportamiento validado permanezca, así que aquí NO se reescribe su
 * composición: se reutilizan `renderDocumentPdf` y `renderMasterListPdf` tal
 * como están.
 *
 * Lo que sí se unifica es el ACCESO: la misma clave de registro, el mismo
 * endpoint, la misma política de nombres y de cabeceras que el resto de la
 * plataforma. Y comparten el mismo escritor y el mismo motor de página, así
 * que el «motor transversal» ya era el suyo.
 *
 * Migrarlos al Print Model queda declarado como pendiente en la matriz de
 * cobertura: es trabajo de composición sin ganancia para quien los usa hoy, y
 * con riesgo real de regresión sobre un artefacto en producción.
 */

/**
 * UNA definición de documento, parametrizada por módulo.
 *
 * §15 lo dice sin rodeos: la diferencia entre el documento de Quality, el de
 * PCR y el textil es de CONTEXTO —qué módulo, qué entitlement, qué empresa—,
 * no de motor. Escribir `pcrDocumentPdf()` y `textileDocumentPdf()` habría
 * triplicado el mismo archivo y garantizado que dentro de seis meses los tres
 * dijeran cosas distintas.
 *
 * `listQualityProcessesUsingDocument` se consulta solo para Quality: en los
 * otros módulos no hay procesos que referencien documentos, y preguntar por
 * ellos devolvería una lista vacía que ensuciaría el papel.
 */
function documentDetail(spec: {
  key: string;
  module: ExportModule;
  moduleKey: string;
  entity: string;
  documentName: string;
  withProcesses: boolean;
}): ExportDefinition {
  return {
  key: spec.key,
  module: spec.module,
  entity: spec.entity,
  recordType: "Documento",
  documentName: spec.documentName,
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const detail = await getDocumentControlDetail(req.organizationId, req.id, spec.moduleKey);
    if (!detail) return null;

    const [company, processes, logo] = await Promise.all([
      getCompanySettings(req.organizationId),
      spec.withProcesses
        ? listQualityProcessesUsingDocument(req.organizationId, req.id)
        : Promise.resolve([] as { processName: string }[]),
      loadCompanyLogo(req.organizationId),
    ]);

    const revision = detail.effectiveRevision ?? detail.currentRevision;
    const round = detail.currentRevision?.round ?? 1;
    const participants = detail.participants.filter((p) => p.round === round);
    const nameOf = (p: { positionName: string | null; profileName: string }) =>
      p.positionName ? `${p.positionName} (${p.profileName})` : p.profileName;

    const buffer = renderDocumentPdf({
      organizationName: (await orgName(req.organizationId)) ?? "Empresa",
      documentName: spec.documentName,
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
        participants.filter((p) => p.participantRole === "reviewer").map(nameOf).join(", "),
        "Sin designar"
      ),
      approversText: orPending(
        participants.filter((p) => p.participantRole === "approver").map(nameOf).join(", "),
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
      generatedAt: req.generatedAt,
    });

    const revSuffix = detail.currentRevision ? `rev${detail.currentRevision.revisionNumber}` : null;
    return {
      buffer,
      filenameParts: {
        recordType: "Documento",
        title: detail.title,
        code: [detail.code, revSuffix].filter(Boolean).join("-") || null,
      },
    };
  },
  };
}

export const qualityDocumentDetail = documentDetail({
  key: "quality.document.detail",
  documentName: "Documento controlado",
  module: "quality",
  moduleKey: QUALITY_DOC_MODULE,
  entity: "Documento controlado",
  withProcesses: true,
});

export const trazadocsDocumentDetail = documentDetail({
  key: "trazadocs.document.detail",
  documentName: "Documento controlado",
  module: "trazadocs",
  moduleKey: "cpr",
  entity: "Documento TrazaDocs",
  withProcesses: false,
});

export const textilesDocumentDetail = documentDetail({
  key: "textiles.document.detail",
  documentName: "Documento controlado",
  module: "textiles",
  moduleKey: "textiles",
  entity: "Documento TrazaDocs textil",
  withProcesses: false,
});

export const qualityMasterList: ExportDefinition = {
  key: "quality.master-list.list",
  module: "quality",
  entity: "Lista Maestra",
  recordType: "Lista Maestra",
  documentName: "Lista maestra de documentos",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  /* Los nombres de los filtros son EXACTAMENTE los que la pantalla pone en la
     URL, y se leen con `readMasterFilters`, el mismo lector que usa la
     pantalla. Si aquí se inventaran nombres propios, el usuario filtraría,
     pulsaría «Descargar PDF» y recibiría la lista COMPLETA sin que nada se lo
     dijera: el peor fallo posible en una exportación filtrada (§13).
     Todos son `text` porque sus valores son nombres de cargo, de proceso o de
     módulo tal como aparecen en pantalla, y se comparan en memoria contra la
     proyección ya cargada — nunca contra SQL. */
  filters: [
    { key: "lifecycle", label: "Estado", kind: "text" },
    { key: "category", label: "Categoría", kind: "text" },
    { key: "owner", label: "Responsable", kind: "text" },
    { key: "reviewer", label: "Revisor", kind: "text" },
    { key: "approver", label: "Aprobador", kind: "text" },
    { key: "process", label: "Proceso", kind: "text" },
    { key: "review", label: "Revisión", kind: "text" },
    { key: "origin", label: "Origen", kind: "text" },
    { key: "search", label: "Búsqueda", kind: "text" },
  ],
  async load(req): Promise<ExportResult | null> {
    // Los filtros se leen con el MISMO lector que usa la pantalla, de modo que
    // «lo que se ve» y «lo que se descarga» no pueden separarse (§13).
    const filters = readMasterFilters(req.filters);
    const [all, company, logo] = await Promise.all([
      loadQualityMasterList(req.organizationId),
      getCompanySettings(req.organizationId),
      loadCompanyLogo(req.organizationId),
    ]);
    const rows = filterMasterList(all, filters);

    const buffer = renderMasterListPdf({
      organizationName: (await orgName(req.organizationId)) ?? "Empresa",
      documentName: "Lista maestra de documentos",
      logo: logo.outcome === "ok" ? logo.image : null,
      logoUnusable: logo.outcome === "unusable",
      companyLegalName: company?.legalName ?? null,
      companyTaxId: company?.taxId ?? null,
      filtersCaption: describeFilters(filters),
      headers: masterListHeaders(),
      weights: MASTER_COLUMNS.map((c) => c.width),
      rows: masterListToRows(rows),
      totalCount: rows.length,
      generatedAt: req.generatedAt,
    });

    return {
      buffer,
      filenameParts: {
        recordType: "Lista-Maestra",
        title: "documentos",
        stamp: req.generatedAt.slice(0, 10),
      },
    };
  },
};

async function orgName(organizationId: string): Promise<string | null> {
  const { createServerClient } = await import("@/lib/supabase/server");
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("organizations").select("name").eq("id", organizationId).maybeSingle();
  return (data?.name as string | null) ?? null;
}
