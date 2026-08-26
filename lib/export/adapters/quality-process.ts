import "server-only";

import {
  getQualityMapDetail, getQualityProcessDetail, listQualityPositions,
  listQualityProcesses,
} from "@/lib/db/quality-processes";
import {
  QUALITY_CATEGORY_LABEL as CATEGORY_LABEL,
  QUALITY_PROCESS_STATUS_LABEL as PROCESS_STATUS_LABEL,
  QUALITY_REVISION_STATUS_LABEL as REVISION_STATUS_LABEL,
  QUALITY_IO_KIND_LABEL as IO_KIND_LABEL,
  QUALITY_DOCUMENT_RELATION_LABEL as DOC_RELATION_LABEL,
} from "@/lib/domain/quality-processes";
import { getDefaultQualityMapId } from "@/lib/db/quality-processes";
import type { ExportDefinition, ExportRequest, ExportResult } from "../registry-types";
import {
  field, fields, note, requiredField, section, table, type PrintBlock,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * EXPORT-01 · Procesos, cargos y mapa.
 *
 * Un PDF de proceso no es la pantalla en papel: es el documento que alguien
 * lleva a una auditoría. Por eso incluye lo que se pregunta —quién responde,
 * qué entra, qué sale, con quién se relaciona— y NO incluye ningún
 * identificador técnico.
 */

const SYSTEM = "Trazaloop Quality · sistema de gestión";

export const qualityProcessDetail: ExportDefinition = {
  key: "quality.process.detail",
  module: "quality",
  entity: "Proceso",
  recordType: "Proceso",
  documentName: "Ficha de proceso",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req: ExportRequest): Promise<ExportResult | null> {
    if (!req.id) return null;
    const detail = await getQualityProcessDetail(req.organizationId, req.id);
    if (!detail) return null;

    const p = detail.process;
    // La revisión que manda es la publicada; si solo hay borrador, se dice.
    const rev = detail.currentRevision ?? detail.draftRevision;
    const inputs = detail.io.filter((i) => i.direction === "input");
    const outputs = detail.io.filter((i) => i.direction === "output");
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: { recordType: "Proceso", title: p.name, code: p.code },
      document: {
        recordType: "Proceso",
        title: p.name,
        code: p.code,
        subtitle: CATEGORY_LABEL[p.categoryCode as never] ?? p.categoryCode,
        badges: [
          { text: PROCESS_STATUS_LABEL[p.status as never] ?? p.status,
            tone: p.status === "active" ? "good" : p.status === "draft" ? "warn" : "neutral" },
          ...(rev ? [{ text: `Revisión ${rev.revisionNumber}`, tone: "info" as const }] : []),
        ],
        organization: org,
        systemLine: SYSTEM,
        orientation: "portrait",
        generatedAt: req.generatedAt,
        generatedByName: req.generatedByName,
        sections: [
          section("Identidad",
            fields([
              requiredField("Responsable", p.ownerPositionName ?? "Sin asignar"),
              requiredField("Categoría", CATEGORY_LABEL[p.categoryCode as never] ?? p.categoryCode),
              requiredField("Estado", PROCESS_STATUS_LABEL[p.status as never] ?? p.status),
              field("Revisión vigente desde", rev?.effectiveFrom),
            ], 2),
            rev?.purpose ? { type: "fields", items: [{ label: "Propósito", value: rev.purpose, wide: true }] } : null,
            rev?.scope ? { type: "fields", items: [{ label: "Alcance", value: rev.scope, wide: true }] } : null,
          ),
          section("Entradas",
            table(
              [{ header: "Entrada", width: 4 }, { header: "Tipo", width: 2 }, { header: "Descripción", width: 5 }],
              inputs.map((i) => [i.name, IO_KIND_LABEL[i.ioKind as never] ?? i.ioKind, i.description ?? "—"]),
              "Este proceso no tiene entradas declaradas."
            )),
          section("Salidas",
            table(
              [{ header: "Salida", width: 4 }, { header: "Tipo", width: 2 }, { header: "Descripción", width: 5 }],
              outputs.map((o) => [o.name, IO_KIND_LABEL[o.ioKind as never] ?? o.ioKind, o.description ?? "—"]),
              "Este proceso no tiene salidas declaradas."
            )),
          section("Relaciones con otros procesos",
            table(
              [{ header: "Desde", width: 3 }, { header: "Hacia", width: 3 },
               { header: "Qué fluye", width: 4 }],
              detail.interactions.map((r) => [
                r.sourceProcessName + (r.sourceOutputName ? ` · ${r.sourceOutputName}` : ""),
                r.targetProcessName + (r.targetInputName ? ` · ${r.targetInputName}` : ""),
                r.informationItem ?? r.description ?? "—",
              ]),
              "Sin relaciones registradas."
            )),
          section("Documentos asociados",
            table(
              [{ header: "Código", width: 2 }, { header: "Documento", width: 6 }, { header: "Relación", width: 2 }],
              detail.documents.map((d) => [d.documentCode ?? "—", d.documentTitle, DOC_RELATION_LABEL[d.relationType as never] ?? d.relationType]),
              "Sin documentos asociados."
            )),
          section("Historial de revisiones",
            table(
              [{ header: "Revisión", width: 1.4 }, { header: "Estado", width: 2 },
               { header: "Vigente desde", width: 2 }, { header: "Hasta", width: 2 },
               { header: "Qué cambió", width: 5 }],
              detail.revisions.map((r) => [
                String(r.revisionNumber), REVISION_STATUS_LABEL[r.status as never] ?? r.status, r.effectiveFrom ?? "—",
                r.effectiveTo ?? "—", r.changeNote ?? "—",
              ]),
              "Sin revisiones."
            )),
        ],
      },
    };
  },
};

export const qualityProcessList: ExportDefinition = {
  key: "quality.process.list",
  module: "quality",
  entity: "Procesos",
  recordType: "Procesos",
  documentName: "Listado de procesos",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  filters: [
    { key: "categoria", label: "Categoría", kind: "enum",
      values: ["strategic", "core", "support"] },
    { key: "estado", label: "Estado", kind: "enum", values: ["draft", "active", "retired"] },
  ],
  async load(req): Promise<ExportResult | null> {
    let rows = await listQualityProcesses(req.organizationId);
    const applied: { label: string; value: string }[] = [];
    if (req.filters.categoria) {
      rows = rows.filter((r) => r.categoryCode === req.filters.categoria);
      applied.push({ label: "Categoría", value: CATEGORY_LABEL[req.filters.categoria as never] ?? req.filters.categoria });
    }
    if (req.filters.estado) {
      rows = rows.filter((r) => r.status === req.filters.estado);
      applied.push({ label: "Estado", value: PROCESS_STATUS_LABEL[req.filters.estado as never] ?? req.filters.estado });
    }
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Procesos", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Procesos", title: "Procesos del sistema de gestión",
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [
          section(null, table(
            [{ header: "Código", width: 1.6 }, { header: "Proceso", width: 5 },
             { header: "Categoría", width: 2 }, { header: "Responsable", width: 3 },
             { header: "Estado", width: 1.8 }, { header: "Rev.", width: 1 }],
            rows.map((r) => [
              r.code ?? "—", r.name,
              CATEGORY_LABEL[r.categoryCode as never] ?? r.categoryCode,
              r.ownerPositionName ?? "Sin asignar",
              PROCESS_STATUS_LABEL[r.status as never] ?? r.status,
              String(r.currentRevision),
            ]),
            "No hay procesos con ese filtro."
          )),
        ],
      },
    };
  },
};

export const qualityPositionList: ExportDefinition = {
  key: "quality.position.list",
  module: "quality",
  entity: "Cargos",
  recordType: "Cargos",
  documentName: "Listado de cargos",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  filters: [{ key: "estado", label: "Estado", kind: "enum", values: ["activos", "todos"] }],
  async load(req): Promise<ExportResult | null> {
    let rows = await listQualityPositions(req.organizationId);
    const applied: { label: string; value: string }[] = [];
    if (req.filters.estado === "activos") {
      rows = rows.filter((r) => r.isActive);
      applied.push({ label: "Estado", value: "Solo activos" });
    }
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Cargos", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Cargos", title: "Cargos del sistema de gestión",
        subtitle: "El responsable de un proceso es un cargo, no una persona.",
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [
          section(null, table(
            [{ header: "Código", width: 1.5 }, { header: "Cargo", width: 4 },
             { header: "Área", width: 2.5 }, { header: "Titular actual", width: 3 },
             { header: "Estado", width: 1.5 }],
            rows.map((r) => [
              r.code ?? "—", r.name, r.orgUnit ?? "—",
              r.holderName ?? "Vacante", r.isActive ? "Activo" : "Inactivo",
            ]),
            "No hay cargos definidos."
          )),
          section(null, note(
            "El titular es la persona que ocupa el cargo HOY. La responsabilidad " +
            "pertenece al cargo: cuando alguien cambia de puesto, los procesos, " +
            "riesgos y acciones conservan su dueño."
          )),
        ],
      },
    };
  },
};

export const qualityPositionDetail: ExportDefinition = {
  key: "quality.position.detail",
  module: "quality",
  entity: "Cargo",
  recordType: "Cargo",
  documentName: "Ficha de cargo",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const rows = await listQualityPositions(req.organizationId);
    const pos = rows.find((r) => r.id === req.id);
    if (!pos) return null;
    const processes = (await listQualityProcesses(req.organizationId))
      .filter((p) => p.ownerPositionId === pos.id);
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Cargo", title: pos.name, code: pos.code },
      document: {
        recordType: "Cargo", title: pos.name, code: pos.code,
        badges: [{ text: pos.isActive ? "Activo" : "Inactivo", tone: pos.isActive ? "good" : "neutral" }],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Área", pos.orgUnit ?? "—"),
            requiredField("Titular actual", pos.holderName ?? "Vacante"),
          ], 2),
          pos.description ? { type: "fields", items: [{ label: "Descripción", value: pos.description, wide: true }] } as PrintBlock : null),
          section("Procesos de los que responde", table(
            [{ header: "Código", width: 2 }, { header: "Proceso", width: 6 }, { header: "Estado", width: 2 }],
            processes.map((p) => [p.code ?? "—", p.name, PROCESS_STATUS_LABEL[p.status as never] ?? p.status]),
            "Este cargo no es responsable de ningún proceso."
          )),
        ],
      },
    };
  },
};

export const qualityMapDetail: ExportDefinition = {
  key: "quality.map.detail",
  module: "quality",
  entity: "Mapa de procesos",
  recordType: "Mapa de procesos",
  documentName: "Mapa de procesos",
  kind: "detail",
  permission: "member",
  // Apaisado: un mapa con categorías y relaciones no cabe cómodo en vertical.
  orientation: "landscape",
  async load(req): Promise<ExportResult | null> {
    // Sin identificador se toma el mapa por defecto de la empresa; con él, ese.
    const mapId = req.id ?? (await getDefaultQualityMapId(req.organizationId));
    if (!mapId) return null;
    const map = await getQualityMapDetail(req.organizationId, mapId);
    if (!map) return null;
    const shown = map.publishedVersion ?? map.shownVersion ?? map.draftVersion;
    const versionLabel = shown ? `v${shown.versionNumber}` : "sin versión";
    const publishedAt = map.publishedVersion?.publishedAt ?? null;
    const org = await organizationIdentity(req.organizationId);

    // §29 · Se respeta el SNAPSHOT de la versión publicada. Dibujar el mapa
    // con los procesos de hoy sería contar el presente como si fuera el
    // pasado.
    const groups = ["strategic", "core", "support"].map((cat) => ({
      title: CATEGORY_LABEL[cat as never] ?? cat,
      nodes: map.nodes
        .filter((n) => n.categoryCode === cat)
        .map((n) => ({ id: n.processId, label: n.processName, sublabel: n.processCode ?? null })),
    })).filter((g) => g.nodes.length > 0);

    return {
      filenameParts: { recordType: "Mapa-de-procesos", title: org.name, code: versionLabel },
      document: {
        recordType: "Mapa de procesos",
        title: "Mapa de procesos",
        code: versionLabel,
        subtitle: publishedAt
          ? `Versión publicada · ${publishedAt.slice(0, 10)}`
          : "Borrador sin publicar",
        badges: [{ text: publishedAt ? "Publicado" : "Borrador",
                   tone: publishedAt ? "good" : "warn" }],
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section(null, {
            type: "graph",
            graph: {
              groups,
              edges: map.edges.map((e) => ({
                from: e.sourceProcessId, to: e.targetProcessId,
                label: e.informationItem ?? ([e.sourceOutputName, e.targetInputName].filter(Boolean).join(" → ") || null),
              })),
            },
          }),
          section(null, note(
            publishedAt
              ? "Este mapa refleja la versión publicada tal como quedó al publicarla. Los cambios posteriores en los procesos no la modifican."
              : "Este mapa es un borrador: todavía no es la versión oficial."
          )),
        ],
      },
    };
  },
};
