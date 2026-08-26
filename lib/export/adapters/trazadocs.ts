import "server-only";

import { listDocumentMaster } from "@/lib/db/trazadocs-master";
import {
  CATEGORY_LABEL, describeDocumentMasterFilters, filterDocumentMaster,
} from "@/lib/domain/trazadocs-master";
import { DOCUMENT_STATUS_LABEL, type DocumentStatus } from "@/lib/domain/trazadocs";
import type { ExportDefinition, ExportModule, ExportResult } from "../registry-types";
import { currentStateNote, section, table } from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * EXPORT-01.1 · Maestro de documentos de TrazaDocs (PCR y Textil).
 *
 * Quality ya tenía su Lista Maestra descargable; PCR y Textiles no. La
 * asimetría no venía de una decisión: venía de que nadie la había cerrado.
 *
 * §16 · Los filtros llevan EXACTAMENTE los nombres que la pantalla pone en la
 * URL (`q`, `category`, `status`, `type`) y se aplican con la misma función
 * del dominio. Es la lección directa del defecto que EXPORT-01 encontró en la
 * Lista Maestra de Quality: inventar nombres propios hace que el usuario
 * filtre, descargue y reciba la lista completa sin que nada se lo diga.
 */
const SOURCE_LABEL: Record<string, string> = {
  live_document: "Documento vivo",
  file_document: "Archivo cargado",
};

function masterList(spec: {
  key: string;
  module: ExportModule;
  moduleKey: string;
  entity: string;
  documentName: string;
  systemLine: string;
}): ExportDefinition {
  return {
    key: spec.key,
    module: spec.module,
    entity: spec.entity,
    recordType: "Maestro de documentos",
    documentName: spec.documentName,
    kind: "list",
    permission: "member",
    orientation: "landscape",
    temporality: "current",
    historicalLimitReason:
      "El maestro retrata qué documentos existen y en qué estado están hoy. La " +
      "historia de cada documento vive en su ficha, que sí conserva sus " +
      "revisiones y decisiones.",
    filters: [
      { key: "q", label: "Búsqueda", kind: "text" },
      { key: "category", label: "Categoría", kind: "text" },
      { key: "status", label: "Estado", kind: "text" },
      { key: "type", label: "Tipo", kind: "text" },
    ],
    async load(req): Promise<ExportResult | null> {
      const filters = {
        search: req.filters.q ?? null,
        categoryCode: req.filters.category ?? null,
        status: req.filters.status ?? null,
        sourceType: req.filters.type ?? null,
      };
      const [all, org] = await Promise.all([
        listDocumentMaster(req.organizationId, spec.moduleKey),
        organizationIdentity(req.organizationId),
      ]);
      const rows = filterDocumentMaster(all, filters);

      return {
        filenameParts: {
          recordType: "Maestro-de-documentos",
          title: org.name,
          stamp: req.generatedAt.slice(0, 10),
        },
        document: {
          recordType: "Maestro de documentos",
          title: spec.entity,
          organization: org,
          systemLine: spec.systemLine,
          orientation: "landscape",
          generatedAt: req.generatedAt,
          generatedByName: req.generatedByName,
          appliedFilters: describeDocumentMasterFilters(filters),
          recordCount: rows.length,
          sections: [
            section(null, table(
              [{ header: "Código", width: 1.5 }, { header: "Documento", width: 4 },
               { header: "Categoría", width: 2.5 }, { header: "Tipo", width: 2 },
               { header: "Versión", width: 1.5 }, { header: "Estado", width: 1.8 },
               { header: "Responsable", width: 2.5 }, { header: "Aprobado", width: 1.5 }],
              rows.map((r) => [
                r.code ?? "—",
                r.title,
                CATEGORY_LABEL[r.categoryCode as keyof typeof CATEGORY_LABEL] ?? r.categoryCode,
                SOURCE_LABEL[r.sourceType] ?? r.sourceType,
                r.versionLabel,
                DOCUMENT_STATUS_LABEL[r.status as DocumentStatus] ?? r.status,
                r.responsibleName ?? "—",
                r.approvedAt ? r.approvedAt.slice(0, 10) : "—",
              ]),
              "No hay documentos con esos filtros."
            )),
            section(null, currentStateNote(req.generatedAt)),
          ],
        },
      };
    },
  };
}

export const trazadocsMasterList = masterList({
  key: "trazadocs.master-list.list",
  documentName: "Maestro de documentos",
  module: "trazadocs",
  moduleKey: "cpr",
  entity: "Maestro de documentos",
  systemLine: "Trazaloop TrazaDocs · control documental",
});

export const textilesMasterList = masterList({
  key: "textiles.master-list.list",
  documentName: "Maestro de documentos textil",
  module: "textiles",
  moduleKey: "textiles",
  entity: "Maestro de documentos textil",
  systemLine: "Trazaloop Textiles · TrazaDocs",
});
