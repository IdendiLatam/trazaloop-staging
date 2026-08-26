import "server-only";

import {
  listTextileOrderConsumptions, listTextileOrderProcessSteps, listTextileOutputLots,
  listTextileProductionOrders,
} from "@/lib/db/textiles-traceability";
import { listTextileProducts } from "@/lib/db/textiles-products";
import { listTextileSuppliers } from "@/lib/db/textiles-catalogs";
import { listTextileEvidences } from "@/lib/db/textiles-evidences";
import type { ExportDefinition, ExportResult } from "../registry-types";
import { fields, note, requiredField, section, table } from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * EXPORT-01 · Trazaloop Textiles.
 *
 * Entidades REALES del módulo (§43): producto, orden de producción, lote de
 * salida, proveedor, evidencia. No se copia el vocabulario de PCR: aquí no hay
 * «lote producido» ni «material reciclado», hay referencias, órdenes y lotes de
 * salida con su cadena de consumos.
 */
const SYSTEM = "Trazaloop Textiles · trazabilidad textil";

const qty = (v: number | null | undefined, unit?: string | null): string =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("es-CO")}${unit ? ` ${unit}` : ""}`;

export const textileProductDetail: ExportDefinition = {
  key: "textiles.product.detail",
  module: "textiles",
  entity: "Producto textil",
  recordType: "Producto",
  documentName: "Ficha de producto textil",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const products = await listTextileProducts(req.organizationId);
    const p = products.find((x) => x.id === req.id);
    if (!p) return null;
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Producto", title: p.name, code: p.productCode },
      document: {
        recordType: "Producto textil",
        title: p.name,
        code: p.productCode,
        subtitle: p.collectionName ? `Colección: ${p.collectionName}` : null,
        badges: [
          { text: p.status, tone: "neutral" },
          { text: p.isActive ? "Activo" : "Inactivo", tone: p.isActive ? "good" : "neutral" },
        ],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Categoría", p.category),
            requiredField("Colección", p.collectionName ?? "—"),
            requiredField("Uso previsto", p.intendedUse ?? "—"),
            requiredField("Mercado objetivo", p.targetMarket ?? "—"),
            requiredField("Referencias", String(p.referenceCount)),
          ], 2),
          p.description ? { type: "fields", items: [{ label: "Descripción", value: p.description, wide: true }] } : null,
          p.notes ? { type: "fields", items: [{ label: "Observaciones", value: p.notes, wide: true }] } : null),
        ],
      },
    };
  },
};

export const textileProductList: ExportDefinition = {
  key: "textiles.product.list",
  module: "textiles",
  entity: "Productos textiles",
  recordType: "Productos",
  documentName: "Listado de productos textiles",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  filters: [{ key: "estado", label: "Estado", kind: "enum", values: ["activos", "todos"] }],
  async load(req): Promise<ExportResult | null> {
    let rows = await listTextileProducts(req.organizationId);
    const applied: { label: string; value: string }[] = [];
    if ((req.filters.estado ?? "todos") === "activos") {
      rows = rows.filter((p) => p.isActive);
      applied.push({ label: "Estado", value: "Activos" });
    }
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Productos", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Productos textiles", title: "Productos",
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Código", width: 2 }, { header: "Producto", width: 4 },
           { header: "Categoría", width: 2 }, { header: "Colección", width: 2.5 },
           { header: "Referencias", width: 1.5 }],
          rows.map((p) => [
            p.productCode ?? "—", p.name, p.category, p.collectionName ?? "—", String(p.referenceCount),
          ]),
          "No hay productos con ese filtro."
        ))],
      },
    };
  },
};

export const textileProductionOrderDetail: ExportDefinition = {
  key: "textiles.production-order.detail",
  module: "textiles",
  entity: "Orden / corrida de producción textil",
  recordType: "Orden / corrida de producción",
  documentName: "Orden / corrida de producción",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const orders = await listTextileProductionOrders(req.organizationId);
    const o = orders.find((x) => x.id === req.id);
    if (!o) return null;
    const [consumptions, steps, lots] = await Promise.all([
      listTextileOrderConsumptions(req.organizationId, o.id),
      listTextileOrderProcessSteps(req.organizationId, o.id),
      listTextileOutputLots(req.organizationId, { orderId: o.id }),
    ]);
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Orden-textil", title: o.orderCode, code: null },
      document: {
        recordType: "Orden / corrida de producción",
        title: `Orden ${o.orderCode}`,
        code: o.orderCode,
        subtitle: o.productName ? `${o.productName}${o.sku ? ` · ${o.sku}` : ""}` : null,
        badges: [{ text: o.status, tone: "neutral" }],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Producto", o.productName ?? "—"),
            requiredField("SKU", o.sku ?? "—"),
            requiredField("Cantidad planificada", qty(o.plannedQuantity, o.unit)),
            requiredField("Cantidad producida", qty(o.producedQuantity, o.unit)),
            requiredField("Inicio previsto", o.plannedStartDate ?? "—"),
            requiredField("Fin previsto", o.plannedEndDate ?? "—"),
            requiredField("Inicio real", o.actualStartDate ?? "—"),
            requiredField("Fin real", o.actualEndDate ?? "—"),
            requiredField("Área responsable", o.responsibleArea ?? "—"),
          ], 2),
          o.notes ? { type: "fields", items: [{ label: "Observaciones", value: o.notes, wide: true }] } : null),
          section("Consumos de entrada", table(
            [{ header: "Lote", width: 2 }, { header: "Material o componente", width: 3 },
             { header: "Proveedor", width: 2.5 }, { header: "Consumido", width: 1.6 },
             { header: "Rol", width: 1.6 }],
            consumptions.map((c) => [
              c.lotCode ?? "—",
              c.materialName ?? c.componentName ?? "—",
              c.supplierName ?? "—",
              qty(c.quantityConsumed, c.unit),
              c.consumptionRole,
            ]),
            "Esta orden no tiene consumos registrados."
          )),
          section("Etapas del proceso", table(
            [{ header: "Etapa", width: 3 }, { header: "Proceso", width: 3 },
             { header: "Responsable", width: 2.5 }, { header: "Estado", width: 1.8 }],
            steps.map((s) => [
              String((s as Record<string, unknown>).stepName ?? (s as Record<string, unknown>).processName ?? "—"),
              String((s as Record<string, unknown>).processName ?? "—"),
              String((s as Record<string, unknown>).supplierName ?? (s as Record<string, unknown>).responsible ?? "—"),
              String((s as Record<string, unknown>).status ?? "—"),
            ]),
            "Sin etapas registradas."
          )),
          section("Lotes producidos", table(
            [{ header: "Lote", width: 2 }, { header: "Producto", width: 3 },
             { header: "Producido el", width: 2 }, { header: "Cantidad", width: 1.8 },
             { header: "Trazabilidad", width: 2 }],
            lots.map((l) => [
              l.outputLotCode, l.productName ?? "—", l.producedDate ?? "—",
              qty(l.quantityProduced, l.unit), l.traceabilityStatus,
            ]),
            "Esta orden todavía no ha producido lotes."
          )),
        ],
      },
    };
  },
};

export const textileOutputLotDetail: ExportDefinition = {
  key: "textiles.output-lot.detail",
  module: "textiles",
  entity: "Lote producido",
  recordType: "Lote producido",
  documentName: "Lote producido / lote final",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const lots = await listTextileOutputLots(req.organizationId);
    const l = lots.find((x) => x.id === req.id);
    if (!l) return null;
    const consumptions = await listTextileOrderConsumptions(req.organizationId, l.orderId);
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Lote-producido", title: l.outputLotCode, code: null },
      document: {
        recordType: "Lote producido",
        title: `Lote ${l.outputLotCode}`,
        code: l.outputLotCode,
        subtitle: l.productName ?? null,
        badges: [
          { text: l.status, tone: "neutral" },
          { text: `Trazabilidad: ${l.traceabilityStatus}`,
            tone: l.traceabilityStatus === "complete" ? "good" : "warn" },
        ],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Producto", l.productName ?? "—"),
            requiredField("SKU", l.sku ?? "—"),
            requiredField("Orden", l.orderCode ?? "—"),
            requiredField("Producido el", l.producedDate ?? "—"),
            requiredField("Cantidad", qty(l.quantityProduced, l.unit)),
            requiredField("Evidencias enlazadas", String(l.evidenceLinksCount)),
          ], 2),
          l.notes ? { type: "fields", items: [{ label: "Observaciones", value: l.notes, wide: true }] } : null),
          section("De qué se hizo", table(
            [{ header: "Lote de entrada", width: 2 }, { header: "Material o componente", width: 3 },
             { header: "Proveedor", width: 2.5 }, { header: "Consumido", width: 1.8 }],
            consumptions.map((c) => [
              c.lotCode ?? "—", c.materialName ?? c.componentName ?? "—",
              c.supplierName ?? "—", qty(c.quantityConsumed, c.unit),
            ]),
            "Sin consumos registrados en la orden de origen."
          ),
          note("Los consumos son los de la orden que produjo este lote: es la cadena que conecta el producto con sus proveedores.")),
        ],
      },
    };
  },
};

export const textileSupplierList: ExportDefinition = {
  key: "textiles.supplier.list",
  module: "textiles",
  entity: "Proveedores textiles",
  recordType: "Proveedores",
  documentName: "Listado de proveedores",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  filters: [{ key: "criticos", label: "Solo críticos", kind: "enum", values: ["si", "no"] }],
  async load(req): Promise<ExportResult | null> {
    let rows = await listTextileSuppliers(req.organizationId);
    const applied: { label: string; value: string }[] = [];
    if (req.filters.criticos === "si") {
      rows = rows.filter((s) => s.isCritical);
      applied.push({ label: "Solo críticos", value: "Sí" });
    }
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Proveedores", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Proveedores textiles", title: "Proveedores",
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Proveedor", width: 3.5 }, { header: "Tipo", width: 2 },
           { header: "País", width: 1.6 }, { header: "Ciudad", width: 1.8 },
           { header: "Contacto", width: 2.4 }, { header: "Crítico", width: 1.2 }],
          rows.map((s) => [
            s.name, s.supplierType, s.country ?? "—", s.city ?? "—",
            s.contactName ?? "—", s.isCritical ? "Sí" : "No",
          ]),
          "No hay proveedores con ese filtro."
        ))],
      },
    };
  },
};

export const textileEvidenceList: ExportDefinition = {
  key: "textiles.evidence.list",
  module: "textiles",
  entity: "Evidencias textiles",
  recordType: "Evidencias",
  documentName: "Listado de evidencias",
  kind: "list",
  permission: "member",
  orientation: "landscape",
  filters: [
    { key: "tipo", label: "Tipo", kind: "text" },
    { key: "estado", label: "Estado", kind: "text" },
  ],
  async load(req): Promise<ExportResult | null> {
    const rows = await listTextileEvidences(req.organizationId, {
      evidenceType: req.filters.tipo || undefined,
      status: req.filters.estado || undefined,
    });
    const applied: { label: string; value: string }[] = [];
    if (req.filters.tipo) applied.push({ label: "Tipo", value: req.filters.tipo });
    if (req.filters.estado) applied.push({ label: "Estado", value: req.filters.estado });
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Evidencias", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Evidencias textiles", title: "Evidencias documentales",
        organization: org, systemLine: SYSTEM, orientation: "landscape",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Título", width: 4 }, { header: "Tipo", width: 2.4 },
           { header: "Emisor", width: 2.4 }, { header: "Referencia", width: 2 },
           { header: "Fecha", width: 1.8 }, { header: "Vigencia", width: 2.4 },
           { header: "Estado", width: 1.8 }],
          rows.map((e) => [
            e.title, e.evidenceType, e.issuer ?? "—", e.referenceCode ?? "—",
            e.documentDate ?? "—",
            e.validFrom || e.validUntil ? `${e.validFrom ?? "—"} → ${e.validUntil ?? "—"}` : "—",
            e.status,
          ]),
          "No hay evidencias con ese filtro."
        )),
        section(null, note(
          "Este listado describe las evidencias; los archivos siguen en su almacenamiento privado " +
          "y no se incrustan en el PDF."
        ))],
      },
    };
  },
};
