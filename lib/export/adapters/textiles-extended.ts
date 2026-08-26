import "server-only";

import {
  listTextileCollections, listTextileReferences, listReferenceComponents,
  listReferenceFiberComposition, listReferenceMaterials,
} from "@/lib/db/textiles-products";
import {
  listTextileComponents, listTextileFiberTypes, listTextileMaterials,
  listTextileOutsourcedProcesses, listTextileProcesses,
} from "@/lib/db/textiles-catalogs";
import {
  listTextileInputLots, listTextileOutputLots, listTextileProductionOrders,
} from "@/lib/db/textiles-traceability";
import {
  getActiveTextileCircularityMethodology, getTextileCircularityAssessment,
  listTextileCircularityAnswers, listTextileCircularityAssessments,
  listTextileCircularityCriteria,
} from "@/lib/db/textiles-circularity";
import { getTechnicalPassport, listTechnicalPassports } from "@/lib/db/textiles-passport";
import {
  getLatestTextileDiagnostic, getTextileDiagnosticAnswers, getActiveTextileQuestions,
  getTextileDiagnosticSections,
} from "@/lib/db/textiles-diagnostic";
import { getTextileEvidence, listTextileEvidenceLinks } from "@/lib/db/textiles-evidences";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  currentStateNote, fields, note, paragraph, requiredField, section, table,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * EXPORT-01.1 · El resto de Textiles.
 *
 * §23 pide auditar las filas pendientes reales y NO extrapolar la estructura de
 * PCR. Textiles tiene objetos que PCR no tiene —la referencia con su
 * composición por fibra, la evaluación de circularidad, el pasaporte— y cada
 * uno se imprime como lo que es.
 */
const SYSTEM = "Trazaloop Textiles";
const SYSTEM_CIRC = "Trazaloop Textiles · circularidad";

const day = (v: string | null | undefined): string => (v ? v.slice(0, 10) : "—");
const qty = (v: number | null | undefined, unit?: string | null): string =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("es-CO")}${unit ? ` ${unit}` : ""}`;
const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(1)} %`;
const yesNo = (v: boolean | null | undefined): string =>
  v === null || v === undefined ? "—" : v ? "Sí" : "No";

/** Las fichas y los listados de catálogo textil comparten forma. */
function catalogList(spec: {
  key: string;
  entity: string;
  documentName: string;
  columns: { header: string; width: number }[];
  load: (orgId: string) => Promise<Record<string, unknown>[]>;
  toRow: (r: Record<string, unknown>) => string[];
  empty: string;
  reason: string;
}): ExportDefinition {
  return {
    key: spec.key,
    module: "textiles",
    entity: spec.entity,
    recordType: spec.entity,
    documentName: spec.documentName,
    kind: "list",
    permission: "member",
    orientation: "landscape",
    temporality: "current",
    historicalLimitReason: spec.reason,
    async load(req): Promise<ExportResult | null> {
      const [rows, org] = await Promise.all([
        spec.load(req.organizationId),
        organizationIdentity(req.organizationId),
      ]);
      return {
        filenameParts: { recordType: spec.entity, title: org.name, stamp: req.generatedAt.slice(0, 10) },
        document: {
          recordType: spec.entity, title: spec.entity,
          organization: org, systemLine: SYSTEM, orientation: "landscape",
          generatedAt: req.generatedAt, generatedByName: req.generatedByName,
          recordCount: rows.length,
          sections: [
            section(null, table(spec.columns, rows.map(spec.toRow), spec.empty)),
            section(null, currentStateNote(req.generatedAt)),
          ],
        },
      };
    },
  };
}

const CATALOG_REASON =
  "El catálogo guarda la ficha vigente de cada elemento, no la serie de sus " +
  "versiones anteriores.";

/* -------------------------------------------------------------------------
 * Referencia y colección
 * ---------------------------------------------------------------------- */

export const textilesReferenceDetail: ExportDefinition = {
  key: "textiles.reference.detail",
  module: "textiles",
  entity: "Referencia",
  recordType: "Referencia",
  documentName: "Ficha de referencia",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La referencia guarda su composición vigente. Cuando una evaluación de " +
    "circularidad o un pasaporte la usan, congelan por su cuenta lo que decía " +
    "en ese momento; esta ficha describe lo que dice hoy.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const refs = await listTextileReferences(req.organizationId);
    const r = refs.find((x) => x.id === req.id);
    if (!r) return null;

    const [fibers, materials, components, org] = await Promise.all([
      listReferenceFiberComposition(req.organizationId, r.id),
      listReferenceMaterials(req.organizationId, r.id),
      listReferenceComponents(req.organizationId, r.id),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: { recordType: "Referencia", title: r.name ?? r.sku, code: r.sku },
      document: {
        recordType: "Referencia",
        title: r.name ?? r.sku,
        code: r.sku,
        subtitle: r.productName,
        badges: [
          { text: r.status, tone: "info" },
          { text: `Composición: ${r.compositionStatus}`, tone: "neutral" },
        ],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("SKU", r.sku),
            requiredField("Producto", r.productName),
            requiredField("Versión", r.versionLabel),
            requiredField("Color", r.color),
            requiredField("Tallas", r.sizeRange),
            requiredField("Género / horma", r.genderOrFit),
          ], 2),
          paragraph(r.description)),
          section("Composición por fibra", table(
            [{ header: "Fibra", width: 3 }, { header: "%", width: 1.2 },
             { header: "Ámbito", width: 2 }, { header: "Material origen", width: 2.5 },
             { header: "Reciclada", width: 1.2 }, { header: "Orgánica", width: 1.2 }],
            fibers.map((f) => [
              f.fiberName ?? "—", pct(f.percentage), f.scope,
              f.sourceMaterialName ?? "—",
              yesNo(f.isRecycledDeclared), yesNo(f.isOrganicDeclared),
            ]),
            "Esta referencia no declara composición por fibra."
          )),
          section("Materiales", table(
            [{ header: "Material", width: 3.5 }, { header: "Papel", width: 2 },
             { header: "% estimado", width: 1.5 }, { header: "Cantidad", width: 3 }],
            materials.map((m) => [
              m.materialName ?? "—", m.role, pct(m.estimatedPercentage),
              m.quantityDescription ?? "—",
            ]),
            "Esta referencia no declara materiales."
          )),
          section("Componentes", table(
            [{ header: "Componente", width: 3.5 }, { header: "Papel", width: 2 },
             { header: "Cantidad", width: 2.5 }, { header: "Separabilidad", width: 2 }],
            components.map((c) => [
              c.componentName ?? "—", c.role, c.quantityDescription ?? "—",
              c.separabilityOverride ?? "—",
            ]),
            "Esta referencia no declara componentes."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

export const textilesCollectionList = catalogList({
  key: "textiles.collection.list",
  documentName: "Listado de colecciones",
  entity: "Colecciones",
  columns: [
    { header: "Colección", width: 3 }, { header: "Código", width: 1.5 },
    { header: "Temporada", width: 1.8 }, { header: "Año", width: 1 },
    { header: "Cliente / programa", width: 2.5 }, { header: "Estado", width: 1.5 },
  ],
  load: async (o) => (await listTextileCollections(o)) as unknown as Record<string, unknown>[],
  toRow: (r) => [
    String(r.name ?? "—"), String(r.code ?? "—"), String(r.season ?? "—"),
    r.year === null || r.year === undefined ? "—" : String(r.year),
    String(r.customerOrProgram ?? "—"), String(r.status ?? "—"),
  ],
  empty: "No hay colecciones registradas.",
  reason: CATALOG_REASON,
});

/* -------------------------------------------------------------------------
 * Catálogos textiles
 * ---------------------------------------------------------------------- */

export const textilesFiberList = catalogList({
  key: "textiles.fiber.list",
  documentName: "Listado de fibras",
  entity: "Fibras",
  columns: [
    { header: "Fibra", width: 3 }, { header: "Código", width: 1.5 },
    { header: "Familia", width: 2 }, { header: "Natural", width: 1.2 },
    { header: "Sintética", width: 1.2 }, { header: "Regenerada", width: 1.4 },
    { header: "Reciclable", width: 1.4 },
  ],
  // Las fibras del catálogo BASE son globales; la RLS de la tabla ya
  // limita las personalizadas a la empresa de la sesión.
  load: async () => (await listTextileFiberTypes()) as unknown as Record<string, unknown>[],
  toRow: (r) => [
    String(r.name ?? "—"), String(r.code ?? "—"), String(r.fiberFamily ?? "—"),
    yesNo(r.isNatural as boolean), yesNo(r.isSynthetic as boolean),
    yesNo(r.isRegenerated as boolean), yesNo(r.isRecycledOption as boolean),
  ],
  empty: "No hay fibras disponibles.",
  reason: CATALOG_REASON,
});

export const textilesMaterialList = catalogList({
  key: "textiles.material.list",
  documentName: "Listado de materiales e insumos",
  entity: "Materiales textiles",
  columns: [
    { header: "Material", width: 3 }, { header: "Código", width: 1.5 },
    { header: "Tipo", width: 1.8 }, { header: "Fibra principal", width: 2 },
    { header: "Proveedor", width: 2.5 }, { header: "Reciclado", width: 1.2 },
    { header: "Orgánico", width: 1.2 },
  ],
  load: async (o) => (await listTextileMaterials(o)) as unknown as Record<string, unknown>[],
  toRow: (r) => [
    String(r.name ?? "—"), String(r.internalCode ?? "—"), String(r.materialType ?? "—"),
    String(r.primaryFiberName ?? "—"), String(r.supplierName ?? "—"),
    yesNo(r.recycledClaim as boolean), yesNo(r.organicClaim as boolean),
  ],
  empty: "No hay materiales registrados.",
  reason: CATALOG_REASON,
});

export const textilesComponentList = catalogList({
  key: "textiles.component.list",
  documentName: "Listado de avíos / componentes",
  entity: "Componentes",
  columns: [
    { header: "Componente", width: 3 }, { header: "Tipo", width: 2 },
    { header: "Material", width: 3 }, { header: "Proveedor", width: 2.5 },
    { header: "Separabilidad", width: 2 },
  ],
  load: async (o) => (await listTextileComponents(o)) as unknown as Record<string, unknown>[],
  toRow: (r) => [
    String(r.name ?? "—"), String(r.componentType ?? "—"),
    String(r.materialDescription ?? "—"), String(r.supplierName ?? "—"),
    String(r.separability ?? "—"),
  ],
  empty: "No hay componentes registrados.",
  reason: CATALOG_REASON,
});

export const textilesProcessList = catalogList({
  key: "textiles.process.list",
  documentName: "Listado de procesos internos",
  entity: "Procesos textiles",
  columns: [
    { header: "Proceso", width: 3 }, { header: "Tipo", width: 2 },
    { header: "Área responsable", width: 2.5 }, { header: "Riesgo de trazabilidad", width: 2.2 },
    { header: "Registros esperados", width: 3 },
  ],
  load: async (o) => (await listTextileProcesses(o)) as unknown as Record<string, unknown>[],
  toRow: (r) => [
    String(r.name ?? "—"), String(r.processType ?? "—"), String(r.responsibleArea ?? "—"),
    String(r.traceabilityRisk ?? "—"), String(r.recordsExpected ?? "—"),
  ],
  empty: "No hay procesos registrados.",
  reason: CATALOG_REASON,
});

export const textilesOutsourcedProcessList = catalogList({
  key: "textiles.outsourced-process.list",
  documentName: "Listado de procesos tercerizados",
  entity: "Procesos tercerizados",
  columns: [
    { header: "Proceso", width: 3 }, { header: "Tipo", width: 2 },
    { header: "Proveedor", width: 2.5 }, { header: "Riesgo de trazabilidad", width: 2.2 },
    { header: "Registros esperados", width: 3 },
  ],
  load: async (o) => (await listTextileOutsourcedProcesses(o)) as unknown as Record<string, unknown>[],
  toRow: (r) => [
    String(r.name ?? "—"), String(r.processType ?? "—"), String(r.supplierName ?? "—"),
    String(r.traceabilityRisk ?? "—"), String(r.recordsExpected ?? "—"),
  ],
  empty: "No hay procesos tercerizados registrados.",
  reason: CATALOG_REASON,
});

/* -------------------------------------------------------------------------
 * Trazabilidad textil
 * ---------------------------------------------------------------------- */

export const textilesInputLotDetail: ExportDefinition = {
  key: "textiles.input-lot.detail",
  module: "textiles",
  entity: "Lote de entrada",
  recordType: "Lote de entrada",
  documentName: "Ficha de lote de entrada",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El lote guarda su fecha de recepción y su balance acumulado; no una serie " +
    "temporal de saldos.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const [lots, org] = await Promise.all([
      listTextileInputLots(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const l = lots.find((x) => x.id === req.id);
    if (!l) return null;

    return {
      filenameParts: { recordType: "Lote-de-entrada", title: l.lotCode, code: l.lotCode },
      document: {
        recordType: "Lote de entrada",
        title: l.lotCode,
        code: l.lotCode,
        badges: [{ text: l.status, tone: "info" }],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Tipo de lote", l.lotType),
            requiredField("Material", l.materialName),
            requiredField("Componente", l.componentName),
            requiredField("Proveedor", l.supplierName),
            requiredField("Recibido el", day(l.receivedDate)),
            requiredField("Documento de referencia", l.documentReference),
          ], 2),
          paragraph(l.notes)),
          section("Balance", fields([
            requiredField("Recibido", qty(l.quantityReceived, l.unit)),
            requiredField("Consumido", qty(l.quantityConsumed, l.unit)),
            requiredField("Disponible", qty(l.quantityRemaining, l.unit)),
            requiredField("Consumos en otra unidad", String(l.otherUnitConsumptions)),
          ], 2)),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

export const textilesInputLotList = catalogList({
  key: "textiles.input-lot.list",
  documentName: "Listado de lotes de entrada",
  entity: "Lotes de entrada",
  columns: [
    { header: "Lote", width: 2 }, { header: "Tipo", width: 1.5 },
    { header: "Material / componente", width: 3 }, { header: "Proveedor", width: 2.5 },
    { header: "Recibido", width: 1.5 }, { header: "Cantidad", width: 1.6 },
    { header: "Disponible", width: 1.6 },
  ],
  load: async (o) => (await listTextileInputLots(o)) as unknown as Record<string, unknown>[],
  toRow: (r) => [
    String(r.lotCode ?? "—"), String(r.lotType ?? "—"),
    String(r.materialName ?? r.componentName ?? "—"), String(r.supplierName ?? "—"),
    day(r.receivedDate as string | null),
    qty(r.quantityReceived as number | null, r.unit as string | null),
    qty(r.quantityRemaining as number | null, r.unit as string | null),
  ],
  empty: "No hay lotes de entrada registrados.",
  reason:
    "El listado retrata el inventario textil de hoy. Cada lote conserva su " +
    "fecha de recepción.",
});

export const textilesProductionOrderList = catalogList({
  key: "textiles.production-order.list",
  documentName: "Listado de órdenes / corridas de producción",
  entity: "Órdenes / corridas de producción",
  columns: [
    { header: "Orden", width: 2 }, { header: "Referencia", width: 2 },
    { header: "Producto", width: 3 }, { header: "Planeado", width: 1.6 },
    { header: "Producido", width: 1.6 }, { header: "Estado", width: 1.6 },
    { header: "Inicio real", width: 1.5 },
  ],
  load: async (o) => (await listTextileProductionOrders(o)) as unknown as Record<string, unknown>[],
  toRow: (r) => [
    String(r.orderCode ?? "—"), String(r.sku ?? "—"), String(r.productName ?? "—"),
    qty(r.plannedQuantity as number | null, r.unit as string | null),
    qty(r.producedQuantity as number | null, r.unit as string | null),
    String(r.status ?? "—"), day(r.actualStartDate as string | null),
  ],
  empty: "No hay órdenes de producción registradas.",
  reason:
    "El listado retrata las órdenes tal como están hoy. Cada orden conserva sus " +
    "fechas reales.",
});

export const textilesOutputLotList = catalogList({
  key: "textiles.output-lot.list",
  documentName: "Listado de lotes producidos / lotes finales",
  entity: "Lotes producidos",
  columns: [
    { header: "Lote", width: 2 }, { header: "Orden", width: 2 },
    { header: "Referencia", width: 1.8 }, { header: "Producto", width: 2.8 },
    { header: "Producido", width: 1.6 }, { header: "Fecha", width: 1.5 },
    { header: "Trazabilidad", width: 1.8 },
  ],
  load: async (o) => (await listTextileOutputLots(o)) as unknown as Record<string, unknown>[],
  toRow: (r) => [
    String(r.outputLotCode ?? "—"), String(r.orderCode ?? "—"), String(r.sku ?? "—"),
    String(r.productName ?? "—"),
    qty(r.quantityProduced as number | null, r.unit as string | null),
    day(r.producedDate as string | null), String(r.traceabilityStatus ?? "—"),
  ],
  empty: "No hay lotes producidos registrados.",
  reason:
    "El listado retrata los lotes de hoy. El pasaporte de cada referencia sí " +
    "congela su propio snapshot.",
});

/* -------------------------------------------------------------------------
 * Evidencia textil · ficha (§22)
 * ---------------------------------------------------------------------- */

export const textilesEvidenceDetail: ExportDefinition = {
  key: "textiles.evidence.detail",
  module: "textiles",
  entity: "Evidencia textil",
  recordType: "Evidencia",
  documentName: "Ficha de evidencia",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "La ficha describe el estado de gobernanza vigente de la evidencia. El " +
    "archivo original sigue siendo la prueba y no se reproduce aquí.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const e = await getTextileEvidence(req.organizationId, req.id);
    if (!e) return null;
    const [links, org] = await Promise.all([
      listTextileEvidenceLinks(req.organizationId, e.id),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: { recordType: "Evidencia", title: e.title, code: e.referenceCode },
      document: {
        recordType: "Evidencia",
        title: e.title,
        code: e.referenceCode,
        badges: [{ text: e.status, tone: "info" }],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Tipo", e.evidenceType),
            requiredField("Emisor", e.issuer),
            requiredField("Fecha del documento", day(e.documentDate)),
            requiredField("Vigente desde", day(e.validFrom)),
            requiredField("Vigente hasta", day(e.validUntil)),
            requiredField("Revisada el", day(e.reviewedAt)),
          ], 2),
          paragraph(e.description),
          paragraph(e.reviewNotes)),
          section("Archivo asociado", fields([
            requiredField("Nombre", e.fileName),
            requiredField("Tipo", e.fileMimeType),
            requiredField("Tamaño", e.fileSizeBytes === null ? "—" : `${Math.round(e.fileSizeBytes / 1024)} KB`),
          ], 2),
          // §22 · No se convierte el adjunto: esta hoja habla DE la evidencia.
          note(
            "Este documento describe la evidencia. El archivo original sigue " +
            "siendo el soporte y no se reproduce aquí."
          )),
          section("Dónde está vinculada", table(
            [{ header: "Entidad", width: 2.5 }, { header: "Registro", width: 4 },
             { header: "Vínculo", width: 2 }, { header: "Nota", width: 2.5 }],
            links.map((l) => [
              l.entityType, l.entityLabel ?? "—", l.linkType, l.notes ?? "—",
            ]),
            "Esta evidencia no está vinculada a ningún registro."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Circularidad (§24)
 * ---------------------------------------------------------------------- */

export const textilesCircularityDetail: ExportDefinition = {
  key: "textiles.circularity.detail",
  module: "textiles",
  entity: "Evaluación de circularidad",
  recordType: "Evaluación de circularidad",
  documentName: "Evaluación de circularidad",
  kind: "detail",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "La evaluación guarda su fecha, su puntaje y sus respuestas, pero apunta a " +
    "la metodología ACTIVA, no a una versión congelada de ella. Mientras el " +
    "dominio no conserve esa versión, presentar el resultado como documento " +
    "histórico afirmaría que sabemos con qué criterios se calculó, y no lo " +
    "sabemos. El PDF actual sí es correcto y útil.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const a = await getTextileCircularityAssessment(req.organizationId, req.id);
    if (!a) return null;
    const [methodology, answers, org] = await Promise.all([
      getActiveTextileCircularityMethodology(),
      listTextileCircularityAnswers(req.organizationId, a.id),
      organizationIdentity(req.organizationId),
    ]);
    const criteria = a.methodologyId
      ? await listTextileCircularityCriteria(a.methodologyId)
      : [];
    const byId = new Map(criteria.map((c) => [c.id, c]));

    return {
      filenameParts: {
        recordType: "Circularidad",
        title: a.sku ?? a.assessmentCode,
        code: a.assessmentCode,
      },
      document: {
        recordType: "Evaluación de circularidad",
        title: `${a.assessmentCode}${a.sku ? ` · ${a.sku}` : ""}`,
        code: a.assessmentCode,
        subtitle: a.productName,
        badges: [
          { text: a.status, tone: "neutral" },
          ...(a.readinessLevel ? [{ text: a.readinessLevel, tone: "info" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM_CIRC, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Resultado", fields([
            requiredField("Puntaje de circularidad",
              a.circularityScore === null ? "—" : String(a.circularityScore)),
            requiredField("Nivel", a.readinessLevel),
            requiredField("Referencia", a.sku),
            requiredField("Lote producido", a.outputLotCode),
            requiredField("Evaluado el", day(a.assessmentDate)),
            requiredField("Calculado el", day(a.calculatedAt)),
          ], 2),
          paragraph(a.notes)),
          section("Metodología usada", {
            type: "references",
            items: [{
              kind: "live",
              label: "METODOLOGÍA · REFERENCIA VIVA",
              value: methodology
                ? `${methodology.name} ${methodology.version}`
                : "no disponible",
            }],
          }, note(
            "La evaluación apunta a la metodología activa. El dominio todavía no " +
            "conserva una copia congelada de sus criterios, así que esta hoja " +
            "describe el resultado con la metodología vigente hoy."
          )),
          section("Puntaje por dimensión", table(
            [{ header: "Dimensión", width: 4 }, { header: "Puntaje", width: 1.5 },
             { header: "Peso", width: 1.5 }, { header: "Peso aplicable", width: 2 }],
            Object.entries(a.dimensionScores ?? {}).map(([k, v]) => [
              k, v.score === null ? "—" : String(v.score),
              String(v.weight), String(v.applicable_weight),
            ]),
            "Esta evaluación todavía no tiene puntajes por dimensión."
          )),
          section("Respuestas", table(
            [{ header: "Criterio", width: 5 }, { header: "Dimensión", width: 2 },
             { header: "Respuesta", width: 1.5 }, { header: "N/A", width: 1 },
             { header: "Evidencia declarada", width: 3 }],
            answers.map((ans) => {
              const c = byId.get(ans.criterionId);
              return [
                c?.question ?? ans.criterionId,
                c?.dimensionKey ?? "—",
                ans.answerValue === null ? (ans.answerText ?? "—") : String(ans.answerValue),
                yesNo(ans.notApplicable),
                ans.evidenceNotes ?? "—",
              ];
            }),
            "Esta evaluación todavía no tiene respuestas."
          )),
          section("Brechas y recomendaciones", table(
            [{ header: "Tipo", width: 1.5 }, { header: "Dimensión", width: 2 },
             { header: "Detalle", width: 7 }],
            [
              ...a.gaps.map((g) => ["Brecha", g.dimension, g.message]),
              ...a.recommendations.map((r) => ["Recomendación", "—", r.text]),
            ],
            "Esta evaluación no arrojó brechas ni recomendaciones."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

export const textilesCircularityList = catalogList({
  key: "textiles.circularity.list",
  documentName: "Listado de evaluaciones de circularidad",
  entity: "Evaluaciones de circularidad",
  columns: [
    { header: "Evaluación", width: 2 }, { header: "Referencia", width: 2 },
    { header: "Producto", width: 3 }, { header: "Lote", width: 2 },
    { header: "Puntaje", width: 1.3 }, { header: "Nivel", width: 2 },
    { header: "Estado", width: 1.5 },
  ],
  load: async (o) => (await listTextileCircularityAssessments(o)) as unknown as Record<string, unknown>[],
  toRow: (r) => [
    String(r.assessmentCode ?? "—"), String(r.sku ?? "—"), String(r.productName ?? "—"),
    String(r.outputLotCode ?? "—"),
    r.circularityScore === null || r.circularityScore === undefined ? "—" : String(r.circularityScore),
    String(r.readinessLevel ?? "—"), String(r.status ?? "—"),
  ],
  empty: "No hay evaluaciones de circularidad.",
  reason:
    "Cada evaluación apunta a la metodología activa, no a una versión congelada " +
    "de ella. El listado retrata lo que hay hoy.",
});

/* -------------------------------------------------------------------------
 * Pasaporte técnico (§25)
 * ---------------------------------------------------------------------- */

/**
 * El pasaporte SÍ guarda snapshot y hash: es histórico de verdad.
 *
 * §25 pide además cuidado con el lenguaje: Trazaloop no certifica nada. El
 * documento se llama «Pasaporte técnico», describe lo que la empresa declaró, y
 * no usa vocabulario de certificación ni se presenta como un Digital Product
 * Passport normativo.
 */
export const textilesPassportDetail: ExportDefinition = {
  key: "textiles.passport.detail",
  module: "textiles",
  entity: "Pasaporte técnico",
  recordType: "Pasaporte técnico",
  documentName: "Pasaporte de producto",
  kind: "historical",
  permission: "member",
  orientation: "portrait",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const [row, summaries, org] = await Promise.all([
      getTechnicalPassport(req.organizationId, req.id),
      listTechnicalPassports(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    if (!row) return null;
    const s = summaries.find((x) => x.id === req.id);

    const snapshot = (row.snapshot_json as Record<string, unknown> | null) ?? null;
    const gaps = Array.isArray(row.gaps_json) ? (row.gaps_json as Record<string, unknown>[]) : [];
    const warnings = Array.isArray(row.warnings_json)
      ? (row.warnings_json as Record<string, unknown>[])
      : [];
    const composition = Array.isArray(snapshot?.composition)
      ? (snapshot!.composition as Record<string, unknown>[])
      : [];

    return {
      filenameParts: {
        recordType: "Pasaporte-tecnico",
        title: s?.sku ?? String(row.passport_code ?? "pasaporte"),
        code: String(row.passport_code ?? ""),
      },
      document: {
        recordType: "Pasaporte técnico",
        title: `${row.passport_code} · v${row.passport_version}`,
        code: s?.sku ?? null,
        subtitle: s?.productName ?? null,
        badges: [{ text: String(row.status), tone: "info" }],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Referencia", s?.sku),
            requiredField("Producto", s?.productName),
            requiredField("Versión", String(row.passport_version ?? "—")),
            requiredField("Generado el", day(row.generated_at as string | null)),
            requiredField("Huella del snapshot", String(row.source_hash ?? "—").slice(0, 16)),
            requiredField("Brechas / advertencias", `${gaps.length} / ${warnings.length}`),
          ], 2)),
          section("Composición declarada", table(
            [{ header: "Fibra", width: 3.5 }, { header: "%", width: 1.5 },
             { header: "Ámbito", width: 2.5 }],
            composition.map((c) => [
              String(c.fiber_name ?? c.fiber ?? "—"),
              c.percentage === null || c.percentage === undefined ? "—" : `${c.percentage} %`,
              String(c.component_scope ?? "—"),
            ]),
            "El pasaporte no registró composición."
          )),
          section("Brechas y advertencias", table(
            [{ header: "Tipo", width: 1.5 }, { header: "Detalle", width: 8 }],
            [
              ...gaps.map((g) => ["Brecha", String(g.message ?? g.code ?? "—")]),
              ...warnings.map((w) => ["Advertencia", String(w.message ?? w.code ?? "—")]),
            ],
            "El pasaporte no registró brechas ni advertencias."
          )),
          // §25 · Sin lenguaje de certificación. Lo que hay es una declaración
          // de la empresa, con la trazabilidad que la sostiene.
          section(null, note(
            "Este pasaporte técnico reúne la información declarada por la empresa " +
            "y la trazabilidad que la respalda en Trazaloop. No constituye una " +
            "certificación ni una verificación por un tercero."
          )),
        ],
      },
    };
  },
};

export const textilesPassportList = catalogList({
  key: "textiles.passport.list",
  documentName: "Listado de pasaportes de producto",
  entity: "Pasaportes técnicos",
  columns: [
    { header: "Pasaporte", width: 2.2 }, { header: "Versión", width: 1 },
    { header: "Referencia", width: 2 }, { header: "Producto", width: 3 },
    { header: "Estado", width: 1.6 }, { header: "Generado", width: 1.5 },
    { header: "Brechas", width: 1.2 }, { header: "Advertencias", width: 1.4 },
  ],
  load: async (o) => (await listTechnicalPassports(o)) as unknown as Record<string, unknown>[],
  toRow: (r) => [
    String(r.passportCode ?? "—"), String(r.passportVersion ?? "—"),
    String(r.sku ?? "—"), String(r.productName ?? "—"),
    String(r.status ?? "—"), day(r.generatedAt as string | null),
    String(r.gapCount ?? 0), String(r.warningCount ?? 0),
  ],
  empty: "Todavía no se ha generado ningún pasaporte.",
  reason:
    "El listado enumera los pasaportes existentes hoy. Cada pasaporte conserva " +
    "su propio snapshot y se descarga por separado.",
});

/* -------------------------------------------------------------------------
 * Diagnóstico textil (§26)
 * ---------------------------------------------------------------------- */

export const textilesDiagnosticDetail: ExportDefinition = {
  key: "textiles.diagnostic.detail",
  module: "textiles",
  entity: "Diagnóstico textil",
  recordType: "Diagnóstico textil",
  documentName: "Diagnóstico textil",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El diagnóstico textil guarda una fila por empresa con su avance. No " +
    "conserva las respuestas de una autoevaluación anterior ni el cuestionario " +
    "que regía entonces.",
  async load(req): Promise<ExportResult | null> {
    const [d, sections, questions, org] = await Promise.all([
      getLatestTextileDiagnostic(req.organizationId),
      getTextileDiagnosticSections(),
      getActiveTextileQuestions(),
      organizationIdentity(req.organizationId),
    ]);
    if (!d) return null;
    const answers = await getTextileDiagnosticAnswers(d.id);
    const sectionTitle = new Map(sections.map((s) => [s.code, s.title]));

    return {
      filenameParts: {
        recordType: "Diagnostico-textil",
        title: org.name,
        stamp: req.generatedAt.slice(0, 10),
      },
      document: {
        recordType: "Diagnóstico textil",
        title: "Estado actual del diagnóstico textil",
        badges: [
          { text: d.status === "completed" ? "Completado" : "En curso", tone: "info" },
          ...(d.maturityLevel ? [{ text: d.maturityLevel, tone: "neutral" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Avance", fields([
            requiredField("Madurez", d.maturityPercent === null ? "—" : `${d.maturityPercent} %`),
            requiredField("Nivel", d.maturityLevel),
            requiredField("Brechas críticas", String(d.criticalGaps)),
            requiredField("Iniciado el", day(d.startedAt)),
            requiredField("Completado el", day(d.completedAt)),
            requiredField("Preguntas respondidas", `${answers.size} de ${questions.length}`),
          ], 2)),
          section("Resultado por dimensión", table(
            [{ header: "Dimensión", width: 4 }, { header: "Avance", width: 1.5 },
             { header: "Aplicables", width: 1.5 }, { header: "Total", width: 1.2 },
             { header: "Limitado por crítica", width: 2 }],
            Object.entries(d.dimensionScores ?? {}).map(([code, s]) => [
              sectionTitle.get(code) ?? code,
              s.percent === null ? "—" : `${s.percent} %`,
              String(s.applicableCount), String(s.totalCount),
              yesNo(s.cappedByCritical),
            ]),
            "Este diagnóstico todavía no tiene resultados por dimensión."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};
