import "server-only";

import { listFamilies, listMaterials, listProducts, listSuppliers } from "@/lib/db/catalog";
import {
  listComposition, listInputBatches, listOutputBatches, listProductionOrders,
} from "@/lib/db/traceability";
import { listCustomerRequirements } from "@/lib/db/customer-requirements";
import { getCalculationDetail, LEVEL_LABEL, listLatestCalculations } from "@/lib/db/recycled";
import {
  GAP_SEVERITY_LABEL, SUPPORT_ROLE_LABEL, getDossier, listComponentRows,
  listEvidenceMatrix, listSupportGaps,
} from "@/lib/db/audit-support";
import { getAuditDossier, listAuditDossiers } from "@/lib/db/audit-dossier";
import { getTraceabilityExercise, listTraceabilityExercises } from "@/lib/db/traceability-exercise";
import { searchEvidences } from "@/lib/db/evidences";
import {
  getActiveQuestions, getDiagnosticAnswers, getDiagnosticSections, getLatestDiagnostic,
} from "@/lib/db/diagnostic";
import type { DossierSnapshot } from "@/lib/domain/audit-dossier";
import type { ExerciseSnapshot } from "@/lib/domain/traceability-exercise";
import type { ExportDefinition, ExportResult } from "../registry-types";
import {
  currentStateNote, fields, note, paragraph, requiredField, section, table,
} from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * EXPORT-01.1 · El resto de PCR.
 *
 * EXPORT-01 dejó cubierta la trazabilidad —órdenes, lotes, catálogos— y dejó
 * fuera lo que el módulo produce PARA UNA AUDITORÍA: el cálculo de contenido
 * reciclado, la matriz de evidencias, el expediente y el ejercicio.
 *
 * La razón declarada entonces fue buena —§24 prohíbe imprimir un resultado sin
 * saber qué supuestos regían—, pero la conclusión era demasiado amplia. El
 * expediente y el ejercicio SÍ guardan su propio snapshot con su hash: son
 * históricos de verdad. El cálculo y el diagnóstico no lo guardan, así que se
 * exportan como lo que son —estado actual— y lo dicen en el papel (§18, §19).
 */
const SYSTEM = "Trazaloop PCR · trazabilidad de contenido reciclado";
const SYSTEM_AUDIT = "Trazaloop PCR · preparación de auditoría";

const kg = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("es-CO")} kg`;
const pct = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${Number(v).toFixed(2)} %`;
const day = (v: string | null | undefined): string => (v ? v.slice(0, 10) : "—");

/* -------------------------------------------------------------------------
 * Catálogos · fichas que faltaban
 * ---------------------------------------------------------------------- */

export const cprProductDetail: ExportDefinition = {
  key: "cpr.product.detail",
  module: "cpr",
  entity: "Producto",
  recordType: "Producto",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El catálogo guarda el producto vigente, no la serie de cambios de su " +
    "porcentaje declarado. Lo que sí queda fechado es cada cálculo sobre sus " +
    "lotes, y eso vive en el cálculo.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const [products, org] = await Promise.all([
      listProducts(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const p = products.find((x) => x.id === req.id);
    if (!p) return null;
    const batches = (await listOutputBatches(req.organizationId)).filter((b) => b.product_id === p.id);

    return {
      filenameParts: { recordType: "Producto", title: p.name, code: p.code },
      document: {
        recordType: "Producto", title: p.name, code: p.code,
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Código", p.code),
            requiredField("Familia", p.family_name),
            requiredField("Porcentaje reciclado declarado", pct(p.declared_recycled_percent)),
            requiredField("Lotes producidos", String(batches.length)),
          ], 2)),
          section("Lotes producidos de este producto", table(
            [{ header: "Lote", width: 2 }, { header: "Orden / corrida", width: 2.5 },
             { header: "Fecha", width: 1.8 }, { header: "Cantidad", width: 2 }],
            batches.map((b) => [
              b.batch_code, b.production_order_code, day(b.produced_date), kg(b.produced_quantity_kg),
            ]),
            "Este producto todavía no tiene lotes producidos."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

export const cprMaterialDetail: ExportDefinition = {
  key: "cpr.material.detail",
  module: "cpr",
  entity: "Material",
  recordType: "Material",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El material guarda su clasificación vigente y el soporte que la sostiene " +
    "hoy. Qué clasificación se usó en un cálculo concreto se lee en ese cálculo.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const [materials, org] = await Promise.all([
      listMaterials(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const m = materials.find((x) => x.id === req.id);
    if (!m) return null;

    return {
      filenameParts: { recordType: "Material", title: m.name },
      document: {
        recordType: "Material", title: m.name,
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Clasificación", fields([
            requiredField("Clasificación", m.classification_label),
            requiredField("Código", m.classification_code),
            requiredField("Reclasificado a", m.reclassified_to_code),
          ], 2),
          paragraph(m.reclassification_justification)),
          section("Soportes", table(
            [{ header: "Soporte", width: 2.5 }, { header: "Evidencia", width: 4 },
             { header: "Estado", width: 2 }, { header: "Archivada", width: 1.8 }],
            [
              ["Origen del material", m.origin_evidence_name ?? "—",
               m.origin_evidence_status ?? "sin evidencia", day(m.origin_evidence_archived_at)],
              ["Reclasificación", m.reclassification_evidence_name ?? "—",
               m.reclassification_evidence_status ?? "sin evidencia", day(m.reclassification_evidence_archived_at)],
            ],
            "Este material no tiene soportes."
          ),
          note(
            "Una evidencia archivada conserva su estado pero deja de ser soporte " +
            "vigente. La columna «Archivada» es la que lo dice."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

export const cprSupplierDetail: ExportDefinition = {
  key: "cpr.supplier.detail",
  module: "cpr",
  entity: "Proveedor",
  recordType: "Proveedor",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El proveedor guarda sus datos vigentes. Cada lote recibido de él sí queda " +
    "fechado, y aparece en la tabla de abajo.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const [suppliers, batches, org] = await Promise.all([
      listSuppliers(req.organizationId),
      listInputBatches(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const s = suppliers.find((x) => x.id === req.id);
    if (!s) return null;
    const mine = batches.filter((b) => b.supplier_id === s.id);

    return {
      filenameParts: { recordType: "Proveedor", title: s.name },
      document: {
        recordType: "Proveedor", title: s.name,
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Identificación", s.tax_id),
            requiredField("Contacto", s.contact),
            requiredField("Lotes recibidos", String(mine.length)),
          ], 2)),
          section("Lotes de entrada recibidos", table(
            [{ header: "Lote", width: 2 }, { header: "Material", width: 3 },
             { header: "Recibido", width: 1.8 }, { header: "Cantidad", width: 2 }],
            mine.map((b) => [b.batch_code, b.material_name, day(b.received_date), kg(b.quantity_kg)]),
            "Todavía no se han recibido lotes de este proveedor."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Listados de trazabilidad que faltaban
 * ---------------------------------------------------------------------- */

export const cprInputBatchList: ExportDefinition = {
  key: "cpr.input-batch.list",
  module: "cpr",
  entity: "Lotes de entrada",
  recordType: "Lotes de entrada",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata el inventario tal como está hoy. Cada lote conserva su " +
    "fecha de recepción y su consumo acumulado.",
  filters: [{ key: "material", label: "Material", kind: "uuid" },
            { key: "proveedor", label: "Proveedor", kind: "uuid" }],
  async load(req): Promise<ExportResult | null> {
    const [all, org] = await Promise.all([
      listInputBatches(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const applied: { label: string; value: string }[] = [];
    let rows = all;
    if (req.filters.material) {
      rows = rows.filter((b) => b.material_id === req.filters.material);
      applied.push({ label: "Material", value: rows[0]?.material_name ?? "seleccionado" });
    }
    if (req.filters.proveedor) {
      rows = rows.filter((b) => b.supplier_id === req.filters.proveedor);
      applied.push({ label: "Proveedor", value: rows[0]?.supplier_name ?? "seleccionado" });
    }
    return {
      filenameParts: { recordType: "Lotes-de-entrada", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Lotes de entrada", title: "Lotes de entrada",
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Lote", width: 2 }, { header: "Proveedor", width: 3 },
           { header: "Material", width: 3 }, { header: "Recibido", width: 1.6 },
           { header: "Cantidad", width: 1.8 }, { header: "Consumido", width: 1.8 },
           { header: "Residuo", width: 1.8 }],
          rows.map((b) => [
            b.batch_code, b.supplier_name, b.material_name, day(b.received_date),
            kg(b.quantity_kg), kg(b.consumed_kg), b.residue_type ?? "—",
          ]),
          "No hay lotes de entrada con ese filtro."
        )), section(null, currentStateNote(req.generatedAt))],
      },
    };
  },
};

export const cprOutputBatchList: ExportDefinition = {
  key: "cpr.output-batch.list",
  module: "cpr",
  entity: "Lotes producidos",
  recordType: "Lotes producidos / lotes finales",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado retrata los lotes tal como están hoy. El cálculo de contenido " +
    "reciclado de cada uno queda fechado en su propio registro.",
  filters: [{ key: "orden", label: "Orden / corrida", kind: "uuid" }],
  async load(req): Promise<ExportResult | null> {
    const [all, org] = await Promise.all([
      listOutputBatches(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const applied: { label: string; value: string }[] = [];
    let rows = all;
    if (req.filters.orden) {
      rows = rows.filter((b) => b.production_order_id === req.filters.orden);
      applied.push({ label: "Orden / corrida", value: rows[0]?.production_order_code ?? "seleccionada" });
    }
    return {
      filenameParts: { recordType: "Lotes-producidos", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Lotes producidos / lotes finales",
        title: "Lotes producidos / lotes finales",
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Lote", width: 2 }, { header: "Orden / corrida", width: 2.2 },
           { header: "Producto", width: 3.2 }, { header: "Fecha", width: 1.6 },
           { header: "Cantidad", width: 1.8 }, { header: "Estado de la orden", width: 2 }],
          rows.map((b) => [
            b.batch_code, b.production_order_code, b.product_label ?? "—",
            day(b.produced_date), kg(b.produced_quantity_kg), b.production_order_status,
          ]),
          "No hay lotes producidos con ese filtro."
        )), section(null, currentStateNote(req.generatedAt))],
      },
    };
  },
};

export const cprCustomerRequirementList: ExportDefinition = {
  key: "cpr.customer-requirement.list",
  module: "cpr",
  entity: "Requisitos de cliente",
  recordType: "Requisitos de cliente",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El requisito guarda su vigencia declarada (desde / hasta), no un historial " +
    "de redacciones anteriores.",
  filters: [{ key: "q", label: "Búsqueda", kind: "text" }],
  async load(req): Promise<ExportResult | null> {
    const [result, org] = await Promise.all([
      // El listado completo: la paginación es de la pantalla, no del documento.
      listCustomerRequirements(req.organizationId, { q: req.filters.q, page: "1" }),
      organizationIdentity(req.organizationId),
    ]);
    const applied = req.filters.q ? [{ label: "Búsqueda", value: req.filters.q }] : [];
    return {
      filenameParts: { recordType: "Requisitos-de-cliente", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Requisitos de cliente", title: "Requisitos de cliente",
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: result.rows.length,
        sections: [section(null, table(
          [{ header: "Código", width: 1.5 }, { header: "Cliente", width: 2.5 },
           { header: "Requisito", width: 4 }, { header: "Desde", width: 1.5 },
           { header: "Hasta", width: 1.5 }, { header: "Vigente", width: 1.2 }],
          result.rows.map((r) => [
            r.code, r.customer_name, r.title, day(r.starts_on), day(r.ends_on),
            r.active ? "Sí" : "No",
          ]),
          "No hay requisitos de cliente con ese filtro."
        )), section(null, currentStateNote(req.generatedAt))],
      },
    };
  },
};

export const cprEvidenceList: ExportDefinition = {
  key: "cpr.evidence.list",
  module: "cpr",
  entity: "Evidencias",
  recordType: "Evidencias",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "La ficha de la evidencia describe el soporte tal como está gobernado hoy: " +
    "estado, revisión y archivado. El archivo original sigue siendo la prueba; " +
    "este PDF no lo sustituye.",
  filters: [
    { key: "q", label: "Búsqueda", kind: "text" },
    { key: "status", label: "Estado", kind: "text" },
    { key: "type", label: "Tipo", kind: "text" },
    { key: "medium", label: "Medio", kind: "text" },
  ],
  async load(req): Promise<ExportResult | null> {
    const [result, org] = await Promise.all([
      searchEvidences(req.organizationId, {
        q: req.filters.q ?? null,
        status: req.filters.status ?? null,
        type: req.filters.type ?? null,
        medium: req.filters.medium ?? null,
        page: 1,
      }),
      organizationIdentity(req.organizationId),
    ]);
    const applied: { label: string; value: string }[] = [];
    for (const [k, label] of [["q", "Búsqueda"], ["status", "Estado"], ["type", "Tipo"], ["medium", "Medio"]] as const) {
      if (req.filters[k]) applied.push({ label, value: req.filters[k] });
    }
    return {
      filenameParts: { recordType: "Evidencias", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Evidencias", title: "Evidencias",
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: result.rows.length,
        sections: [
          section(null, table(
            [{ header: "Evidencia", width: 3.5 }, { header: "Tipo", width: 2 },
             { header: "Medio", width: 1.5 }, { header: "Estado", width: 1.5 },
             { header: "Fecha", width: 1.5 }, { header: "Vence", width: 1.5 },
             { header: "Archivada", width: 1.5 }, { header: "Archivo", width: 1.3 }],
            result.rows.map((e) => [
              e.name, e.evidence_type ?? "—", e.medium, e.status,
              day(e.evidence_date), day(e.valid_until), day(e.archived_at),
              e.has_file ? "Sí" : "No",
            ]),
            "No hay evidencias con ese filtro."
          )),
          // §22 · No se convierte el adjunto a PDF: esta hoja describe la
          // evidencia, no la reemplaza. El original sigue siendo la prueba.
          section(null, note(
            "Este documento describe las evidencias registradas. Los archivos " +
            "originales siguen siendo el soporte: no se reproducen aquí."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Contenido reciclado y cálculo de soporte (§19, §20)
 * ---------------------------------------------------------------------- */

export const cprRecycledContentDetail: ExportDefinition = {
  key: "cpr.recycled-content.detail",
  module: "cpr",
  entity: "Contenido reciclado",
  recordType: "Contenido reciclado",
  kind: "detail",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El cálculo guarda su fecha, su resultado y los componentes que usó, pero " +
    "el dominio NO conserva una versión temporal de la metodología con la que " +
    "se hizo. Reconstruir «qué reglas regían aquel día» exigiría un " +
    "versionamiento que todavía no existe, y fabricarlo sería peor que no " +
    "tenerlo. El expediente de auditoría sí congela ese contexto.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const calc = await getCalculationDetail(req.organizationId, req.id);
    if (!calc) return null;
    const [batches, org] = await Promise.all([
      listOutputBatches(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    const batch = batches.find((b) => b.id === calc.output_batch_id);

    return {
      filenameParts: {
        recordType: "Contenido-reciclado",
        title: batch?.batch_code ?? "lote",
        stamp: calc.calculated_at.slice(0, 10),
      },
      document: {
        recordType: "Contenido reciclado",
        title: `Contenido reciclado · ${batch?.batch_code ?? "lote"}`,
        code: batch?.batch_code ?? null,
        subtitle: batch?.product_label ?? null,
        badges: [
          { text: pct(calc.recycled_percent), tone: "info" },
          { text: LEVEL_LABEL[calc.defensibility_level] ?? calc.defensibility_level,
            tone: calc.defensibility_level === "defensible" ? "good" : "warn" },
        ],
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Resultado", fields([
            requiredField("Masa total", kg(calc.total_mass_kg)),
            requiredField("Masa reciclada", kg(calc.recycled_mass_kg)),
            requiredField("Porcentaje calculado", pct(calc.recycled_percent)),
            requiredField("Porcentaje declarado", pct(calc.declared_percent)),
            requiredField("Nivel de defendibilidad",
              LEVEL_LABEL[calc.defensibility_level] ?? calc.defensibility_level),
            requiredField("Calculado el", day(calc.calculated_at)),
          ], 2)),
          section("Componentes del cálculo", table(
            [{ header: "Material", width: 3 }, { header: "Masa", width: 1.6 },
             { header: "Clasificación", width: 2 }, { header: "Efectiva", width: 2 },
             { header: "¿Cuenta?", width: 1.3 }, { header: "Por qué no", width: 4 }],
            calc.components.map((c) => [
              c.material_name, kg(c.mass_kg), c.classification_code,
              c.effective_classification, c.counted ? "Sí" : "No",
              c.exclusion_reason ?? "—",
            ]),
            "Este cálculo no registró componentes."
          )),
          section("Advertencias", table(
            [{ header: "Advertencia", width: 10 }],
            calc.warnings.map((w) => [w]),
            "Este cálculo no arrojó advertencias."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

export const cprRecycledContentList: ExportDefinition = {
  key: "cpr.recycled-content.list",
  module: "cpr",
  entity: "Reporte de contenido reciclado",
  recordType: "Contenido reciclado",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "Cada fila trae el ÚLTIMO cálculo de su lote. No es una serie temporal: es " +
    "una foto de lo vigente.",
  async load(req): Promise<ExportResult | null> {
    const [rows, org] = await Promise.all([
      listLatestCalculations(req.organizationId),
      organizationIdentity(req.organizationId),
    ]);
    return {
      filenameParts: { recordType: "Contenido-reciclado", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Contenido reciclado", title: "Reporte de contenido reciclado",
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Lote", width: 2 }, { header: "Producto", width: 3 },
           { header: "Producido", width: 1.5 }, { header: "Masa total", width: 1.7 },
           { header: "Reciclada", width: 1.7 }, { header: "%", width: 1.2 },
           { header: "Declarado", width: 1.3 }, { header: "Nivel", width: 2 }],
          rows.map((r) => [
            r.output_batch_code, r.product_name ?? "—", day(r.produced_date),
            kg(r.total_mass_kg), kg(r.recycled_mass_kg), pct(r.recycled_percent),
            pct(r.declared_percent), LEVEL_LABEL[r.defensibility_level] ?? r.defensibility_level,
          ]),
          "Todavía no hay cálculos de contenido reciclado."
        )), section(null, currentStateNote(req.generatedAt))],
      },
    };
  },
};

export const cprSupportCalculationDetail: ExportDefinition = {
  key: "cpr.support-calculation.detail",
  module: "cpr",
  entity: "Cálculo de soporte",
  recordType: "Cálculo de soporte",
  kind: "detail",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El dossier de soporte se arma leyendo el estado actual de las evidencias " +
    "y de la cadena. Para congelar ese contexto existe el expediente de " +
    "auditoría, que sí guarda snapshot y hash.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const d = await getDossier(req.organizationId, req.id);
    if (!d) return null;
    const [components, gaps, org] = await Promise.all([
      listComponentRows(req.organizationId, req.id),
      listSupportGaps(req.organizationId, d.output_batch_id),
      organizationIdentity(req.organizationId),
    ]);

    return {
      filenameParts: {
        recordType: "Calculo-de-soporte",
        title: d.output_batch_code,
        stamp: req.generatedAt.slice(0, 10),
      },
      document: {
        recordType: "Cálculo de soporte",
        title: `Cálculo de soporte · ${d.output_batch_code}`,
        code: d.output_batch_code,
        subtitle: d.product_name ? `${d.product_code ?? ""} ${d.product_name}`.trim() : null,
        organization: org, systemLine: SYSTEM_AUDIT, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad del cálculo", fields([
            requiredField("Metodología", `${d.methodology_name} v${d.methodology_version}`),
            requiredField("Código de metodología", d.methodology_code),
            requiredField("Masa total", kg(d.total_mass_kg)),
            requiredField("Masa reciclada", kg(d.recycled_mass_kg)),
            requiredField("Porcentaje", pct(d.recycled_percent)),
            requiredField("Declarado", pct(d.declared_percent)),
          ], 2)),
          section("Componentes explicados", table(
            [{ header: "#", width: 0.6 }, { header: "Material", width: 3 },
             { header: "Masa", width: 1.6 }, { header: "Clasificación", width: 2 },
             { header: "¿Cuenta?", width: 1.2 }, { header: "Por qué no", width: 4 }],
            components.map((c) => [
              String(c.component_index), c.material_name ?? "—", kg(c.mass_kg),
              c.classification_code ?? "—", c.counted ? "Sí" : "No",
              c.exclusion_reason ?? "—",
            ]),
            "Este cálculo no tiene componentes explicados."
          )),
          section("Brechas de soporte", table(
            [{ header: "Severidad", width: 1.5 }, { header: "Brecha", width: 3 },
             { header: "Descripción", width: 4 }, { header: "Qué hacer", width: 3.5 }],
            gaps.map((g) => [
              GAP_SEVERITY_LABEL[g.gap_severity] ?? g.gap_severity,
              g.gap_label, g.gap_description, g.suggested_action,
            ]),
            "Este lote no tiene brechas de soporte abiertas."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

export const cprEvidenceMatrixDetail: ExportDefinition = {
  key: "cpr.evidence-matrix.detail",
  module: "cpr",
  entity: "Matriz de evidencias",
  recordType: "Matriz de evidencias",
  kind: "detail",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "La matriz se calcula con el estado de gobernanza VIGENTE de cada " +
    "evidencia. Congelarla es exactamente lo que hace el expediente.",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const [batches, matrix, gaps, org] = await Promise.all([
      listOutputBatches(req.organizationId),
      listEvidenceMatrix(req.organizationId, req.id),
      listSupportGaps(req.organizationId, req.id),
      organizationIdentity(req.organizationId),
    ]);
    const batch = batches.find((b) => b.id === req.id);
    if (!batch) return null;

    return {
      filenameParts: {
        recordType: "Matriz-de-evidencias",
        title: batch.batch_code,
        stamp: req.generatedAt.slice(0, 10),
      },
      document: {
        recordType: "Matriz de evidencias",
        title: `Matriz de evidencias · ${batch.batch_code}`,
        code: batch.batch_code,
        subtitle: batch.product_label,
        organization: org, systemLine: SYSTEM_AUDIT, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        recordCount: matrix.length,
        sections: [
          section("Evidencias que soportan este lote", table(
            [{ header: "Papel", width: 3 }, { header: "Evidencia", width: 3.5 },
             { header: "Vinculada a", width: 2.5 }, { header: "Estado", width: 1.5 },
             { header: "¿Exigida?", width: 1.2 }, { header: "¿Vigente?", width: 1.2 },
             { header: "Archivada", width: 1.5 }],
            matrix.map((m) => [
              SUPPORT_ROLE_LABEL[m.support_role] ?? m.support_role,
              m.evidence_title,
              m.linked_entity_label ?? m.linked_entity_type,
              m.evidence_status,
              m.is_required_for_defensibility ? "Sí" : "No",
              m.is_valid_for_defensibility ? "Sí" : "No",
              day(m.archived_at),
            ]),
            "Este lote no tiene evidencias vinculadas."
          )),
          section("Brechas", table(
            [{ header: "Severidad", width: 1.5 }, { header: "Brecha", width: 3 },
             { header: "Qué hacer", width: 5.5 }],
            gaps.map((g) => [
              GAP_SEVERITY_LABEL[g.gap_severity] ?? g.gap_severity,
              g.gap_label, g.suggested_action,
            ]),
            "Sin brechas abiertas."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Expediente y ejercicio · históricos DE VERDAD
 * ---------------------------------------------------------------------- */

/**
 * El expediente guarda su propio snapshot y su hash. Es el único objeto de PCR
 * que puede afirmar «así estaban las cosas aquel día» sin reconstruir nada:
 * por eso es histórico y no lleva la nota de estado actual.
 */
export const cprDossierDetail: ExportDefinition = {
  key: "cpr.dossier.detail",
  module: "cpr",
  entity: "Expediente de auditoría",
  recordType: "Expediente de auditoría",
  kind: "historical",
  permission: "member",
  orientation: "landscape",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const row = await getAuditDossier(req.organizationId, req.id);
    if (!row) return null;
    const snap = row.snapshot as unknown as DossierSnapshot | null;
    if (!snap) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Expediente",
        title: snap.cover.batch_code,
        code: `${snap.cover.dossier_code}-v${snap.cover.version}`,
      },
      document: {
        recordType: "Expediente de auditoría",
        title: `${snap.cover.dossier_code} · v${snap.cover.version}`,
        code: snap.cover.batch_code,
        subtitle: snap.cover.product_label,
        badges: [{ text: String(row.status), tone: "info" }],
        organization: org, systemLine: SYSTEM_AUDIT, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identificación del expediente", fields([
            requiredField("Lote", snap.cover.batch_code),
            requiredField("Producto", snap.cover.product_label),
            requiredField("Generado el", day(snap.cover.generated_at)),
            requiredField("Generado por", snap.cover.generated_by_email),
            requiredField("Versión", String(snap.cover.version)),
            requiredField("Huella del snapshot", String(row.source_hash ?? "—").slice(0, 16)),
          ], 2)),
          section("Resumen", fields([
            requiredField("Cantidad producida", kg(snap.summary.produced_quantity_kg)),
            requiredField("Órdenes involucradas", String(snap.summary.orders)),
            requiredField("Lotes externos", String(snap.summary.external_batches)),
            requiredField("Lotes internos", String(snap.summary.internal_batches)),
            requiredField("Proveedores", String(snap.summary.suppliers)),
            requiredField("Evidencias", String(snap.summary.evidences)),
            requiredField("Brechas", String(snap.summary.gaps)),
            requiredField("Advertencias", String(snap.summary.warnings)),
          ], 2)),
          section("Genealogía congelada", table(
            [{ header: "Nivel", width: 0.8 }, { header: "Lote", width: 2 },
             { header: "Orden / corrida", width: 2 }, { header: "Entradas externas", width: 4.5 },
             { header: "Entradas internas", width: 3 }],
            snap.genealogy.map((s) => [
              String(s.depth), s.output_batch, s.order ?? "—",
              s.external_inputs.map((e) => `${e.batch_code} (${e.material ?? "—"})`).join(", ") || "—",
              s.internal_inputs.map((i) => i.batch_code).join(", ") || "—",
            ]),
            "El expediente no registró genealogía."
          )),
          section("Cálculo congelado", snap.calculation
            ? fields([
                requiredField("Porcentaje reciclado", pct(snap.calculation.recycled_percent)),
                requiredField("Calculado el", day(snap.calculation.calculated_at)),
                requiredField("Nivel", snap.calculation.level),
                requiredField("Advertencias", String(snap.calculation.warnings.length)),
              ], 2)
            : paragraph("El expediente se generó sin cálculo de contenido reciclado.")),
          section("Evidencias del expediente", table(
            [{ header: "Evidencia", width: 3.5 }, { header: "Vinculada a", width: 3 },
             { header: "Estado", width: 1.8 }, { header: "Revisión", width: 2.5 }],
            snap.evidences.map((e) => [
              e.name, e.target_label, e.status, e.review_label,
            ]),
            "El expediente no registró evidencias."
          )),
          section("Hallazgos", table(
            [{ header: "Severidad", width: 1.4 }, { header: "Origen", width: 2 },
             { header: "Hallazgo", width: 4.5 }, { header: "Recomendación", width: 4 }],
            snap.findings.map((f) => [f.severity, f.source, f.message, f.recommendation ?? "—"]),
            "El expediente no registró hallazgos."
          )),
          section(null, note(snap.disclaimer)),
        ],
      },
    };
  },
};

export const cprDossierList: ExportDefinition = {
  key: "cpr.dossier.list",
  module: "cpr",
  entity: "Expedientes de auditoría",
  recordType: "Expedientes de auditoría",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado enumera los expedientes existentes hoy. Cada expediente es " +
    "histórico por sí mismo y se descarga por separado.",
  filters: [{ key: "q", label: "Búsqueda", kind: "text" },
            { key: "status", label: "Estado", kind: "text" }],
  async load(req): Promise<ExportResult | null> {
    const [result, org] = await Promise.all([
      listAuditDossiers(req.organizationId, { q: req.filters.q, status: req.filters.status }),
      organizationIdentity(req.organizationId),
    ]);
    const applied: { label: string; value: string }[] = [];
    if (req.filters.q) applied.push({ label: "Búsqueda", value: req.filters.q });
    if (req.filters.status) applied.push({ label: "Estado", value: req.filters.status });
    return {
      filenameParts: { recordType: "Expedientes", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Expedientes de auditoría", title: "Expedientes de auditoría",
        organization: org, systemLine: SYSTEM_AUDIT, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: result.rows.length,
        sections: [section(null, table(
          [{ header: "Expediente", width: 2.2 }, { header: "Versión", width: 1 },
           { header: "Lote", width: 2 }, { header: "Producto", width: 3 },
           { header: "Generado", width: 1.6 }, { header: "Estado", width: 1.5 },
           { header: "Brechas", width: 1.2 }, { header: "Advertencias", width: 1.4 }],
          result.rows.map((d) => [
            d.dossier_code, String(d.version), d.batch_code, d.product_label ?? "—",
            day(d.generated_at), d.status, String(d.gaps_count), String(d.warnings_count),
          ]),
          "Todavía no se ha generado ningún expediente."
        )), section(null, currentStateNote(req.generatedAt))],
      },
    };
  },
};

export const cprExerciseDetail: ExportDefinition = {
  key: "cpr.exercise.detail",
  module: "cpr",
  entity: "Ejercicio de trazabilidad",
  recordType: "Ejercicio de trazabilidad",
  kind: "historical",
  permission: "member",
  orientation: "landscape",
  temporality: "historical",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const row = await getTraceabilityExercise(req.organizationId, req.id);
    if (!row) return null;
    const snap = row.snapshot as unknown as ExerciseSnapshot | null;
    if (!snap) return null;
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: {
        recordType: "Ejercicio-de-trazabilidad",
        title: snap.target.batch_code,
        stamp: String(row.started_at).slice(0, 10),
      },
      document: {
        recordType: "Ejercicio de trazabilidad",
        title: `Ejercicio · ${snap.target.batch_code}`,
        code: snap.target.batch_code,
        subtitle: snap.target.product_label,
        badges: [
          { text: String(row.status), tone: "neutral" },
          ...(row.result ? [{ text: String(row.result), tone: "info" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM_AUDIT, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identificación", fields([
            requiredField("Lote objetivo", snap.target.batch_code),
            requiredField("Producto", snap.target.product_label),
            requiredField("Iniciado", day(row.started_at as string)),
            requiredField("Completado", day(row.completed_at as string | null)),
            requiredField("Resultado", String(row.result ?? "—")),
            requiredField("Huella del snapshot", String(row.source_hash ?? "—").slice(0, 16)),
          ], 2)),
          section("Cadena reconstruida", table(
            [{ header: "Nivel", width: 0.8 }, { header: "Lote", width: 2 },
             { header: "Orden / corrida", width: 2 }, { header: "Entradas externas", width: 4.5 },
             { header: "Entradas internas", width: 3 }],
            snap.chain.map((s) => [
              String(s.depth), s.output_batch, s.order ?? "—",
              s.external_inputs.map((e) => `${e.batch_code} (${e.supplier ?? "—"})`).join(", ") || "—",
              s.internal_inputs.map((i) => i.batch_code).join(", ") || "—",
            ]),
            "El ejercicio no reconstruyó cadena."
          )),
          section("Balance de cantidades", table(
            [{ header: "Tipo", width: 1.5 }, { header: "Lote", width: 2.5 },
             { header: "Recibido / producido", width: 2.5 }, { header: "Consumido", width: 2 },
             { header: "Disponible", width: 2 }],
            [
              ...snap.balances.input_batches.map((b) => [
                "Entrada", b.batch_code, kg(b.received_kg), kg(b.consumed_kg), kg(b.available_kg),
              ]),
              ...snap.balances.output_batches.map((b) => [
                "Producido", b.batch_code, kg(b.produced_kg), kg(b.consumed_internally_kg), kg(b.available_kg),
              ]),
            ],
            "El ejercicio no registró balances."
          )),
          section("Hallazgos", table(
            [{ header: "Nivel", width: 1.2 }, { header: "Área", width: 2 },
             { header: "Hallazgo", width: 5 }, { header: "Recomendación", width: 4 }],
            snap.findings.map((f) => [f.level, f.area, f.message, f.recommendation ?? "—"]),
            "El ejercicio no arrojó hallazgos."
          )),
          section(null, note(snap.disclaimer)),
        ],
      },
    };
  },
};

export const cprExerciseList: ExportDefinition = {
  key: "cpr.exercise.list",
  module: "cpr",
  entity: "Ejercicios de trazabilidad",
  recordType: "Ejercicios de trazabilidad",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  temporality: "current",
  historicalLimitReason:
    "El listado enumera los ejercicios existentes hoy. Cada ejercicio conserva " +
    "su propio snapshot y se descarga por separado.",
  filters: [{ key: "q", label: "Búsqueda", kind: "text" },
            { key: "status", label: "Estado", kind: "text" }],
  async load(req): Promise<ExportResult | null> {
    const [result, org] = await Promise.all([
      listTraceabilityExercises(req.organizationId, { q: req.filters.q, status: req.filters.status }),
      organizationIdentity(req.organizationId),
    ]);
    const applied: { label: string; value: string }[] = [];
    if (req.filters.q) applied.push({ label: "Búsqueda", value: req.filters.q });
    if (req.filters.status) applied.push({ label: "Estado", value: req.filters.status });
    return {
      filenameParts: { recordType: "Ejercicios", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Ejercicios de trazabilidad", title: "Ejercicios de trazabilidad",
        organization: org, systemLine: SYSTEM_AUDIT, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: result.rows.length,
        sections: [section(null, table(
          [{ header: "Lote", width: 2.2 }, { header: "Estado", width: 1.6 },
           { header: "Resultado", width: 2 }, { header: "Iniciado", width: 1.6 },
           { header: "Completado", width: 1.6 }, { header: "Brechas", width: 1.2 },
           { header: "Advertencias", width: 1.4 }, { header: "Quién", width: 2.5 }],
          result.rows.map((e) => [
            e.batch_code, e.status, e.result ?? "—", day(e.started_at),
            day(e.completed_at), String(e.gaps_count), String(e.warnings_count),
            e.started_by_email ?? "—",
          ]),
          "Todavía no se ha realizado ningún ejercicio."
        )), section(null, currentStateNote(req.generatedAt))],
      },
    };
  },
};

/* -------------------------------------------------------------------------
 * Diagnóstico (§18)
 * ---------------------------------------------------------------------- */

export const cprDiagnosticDetail: ExportDefinition = {
  key: "cpr.diagnostic.detail",
  module: "cpr",
  entity: "Diagnóstico",
  recordType: "Diagnóstico",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  temporality: "current",
  historicalLimitReason:
    "El diagnóstico guarda UNA fila por empresa con su avance: no conserva las " +
    "respuestas de una autoevaluación anterior ni el cuestionario que regía " +
    "entonces. Presentarlo como histórico sería afirmar algo que la base no " +
    "puede sostener.",
  async load(req): Promise<ExportResult | null> {
    const [d, sections, questions, org] = await Promise.all([
      getLatestDiagnostic(req.organizationId),
      getDiagnosticSections(),
      getActiveQuestions(),
      organizationIdentity(req.organizationId),
    ]);
    if (!d) return null;
    const answers = await getDiagnosticAnswers(d.id);
    const sectionName = new Map(sections.map((s) => [s.code, s.title]));

    return {
      filenameParts: {
        recordType: "Diagnostico",
        title: org.name,
        stamp: req.generatedAt.slice(0, 10),
      },
      document: {
        recordType: "Diagnóstico",
        title: "Estado actual del diagnóstico",
        badges: [
          { text: d.status === "completed" ? "Completado" : "En curso", tone: "info" },
          ...(d.readiness_level ? [{ text: d.readiness_level, tone: "neutral" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Avance", fields([
            requiredField("Madurez", d.maturity_percent === null ? "—" : `${d.maturity_percent} %`),
            requiredField("Nivel de preparación", d.readiness_level),
            requiredField("Brechas críticas", String(d.critical_gaps)),
            requiredField("Iniciado el", day(d.started_at)),
            requiredField("Completado el", day(d.completed_at)),
            requiredField("Preguntas respondidas", `${answers.size} de ${questions.length}`),
          ], 2)),
          section("Resultado por sección", table(
            [{ header: "Sección", width: 4.5 }, { header: "Avance", width: 1.5 },
             { header: "Sí", width: 1.2 }, { header: "Total", width: 1.2 }],
            Object.entries(d.section_scores ?? {}).map(([code, s]) => [
              sectionName.get(code) ?? code,
              `${s.percent} %`, String(s.answeredYes), String(s.total),
            ]),
            "Este diagnóstico todavía no tiene resultados por sección."
          )),
          section("Respuestas", table(
            [{ header: "Sección", width: 2.5 }, { header: "Pregunta", width: 5.5 },
             { header: "Respuesta", width: 1.3 }, { header: "Crítica", width: 1.2 }],
            questions
              .filter((q) => answers.has(q.id))
              .map((q) => [
                sectionName.get(q.sectionCode) ?? q.sectionCode,
                q.questionText,
                answers.get(q.id)?.answer ? "Sí" : "No",
                q.isCritical ? "Sí" : "No",
              ]),
            "Todavía no se ha respondido ninguna pregunta."
          )),
          section(null, currentStateNote(req.generatedAt)),
        ],
      },
    };
  },
};
