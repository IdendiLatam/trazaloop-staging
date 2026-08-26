import "server-only";

import {
  getBackward, listConsumption, listInputBatches, listOutputBatches, listProductionOrders,
} from "@/lib/db/traceability";
import { listFamilies, listMaterials, listProducts, listSuppliers } from "@/lib/db/catalog";
import type { ExportDefinition, ExportResult } from "../registry-types";
import { fields, note, requiredField, section, table } from "../print-model";
import { organizationIdentity } from "../branding";

/**
 * EXPORT-01 · Trazaloop PCR.
 *
 * NOMENCLATURA (§41): orden/corrida de producción, lote de entrada, lote
 * producido. No se revive el vocabulario histórico que el módulo ya abandonó.
 *
 * La cadena de trazabilidad (§42) sale de `getBackward`, que es la misma
 * consulta que alimenta la pantalla de genealogía. No se reconstruye a mano:
 * un PDF que arme la cadena por su cuenta acabaría contando una historia
 * distinta de la que enseña la aplicación.
 */
const SYSTEM = "Trazaloop PCR · trazabilidad de contenido reciclado";

const kg = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("es-CO")} kg`;

export const cprProductionOrderDetail: ExportDefinition = {
  key: "cpr.production-order.detail",
  module: "cpr",
  entity: "Orden / corrida de producción",
  recordType: "Orden / corrida de producción",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const orders = await listProductionOrders(req.organizationId);
    const order = orders.find((o) => o.id === req.id);
    if (!order) return null;

    const [consumption, outputs] = await Promise.all([
      listConsumption(req.organizationId, order.id),
      listOutputBatches(req.organizationId),
    ]);
    const produced = outputs.filter((b) => b.production_order_id === order.id);
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: { recordType: "Orden-de-produccion", title: order.order_code, code: null },
      document: {
        recordType: "Orden / corrida de producción",
        title: `Orden ${order.order_code}`,
        code: order.order_code,
        subtitle: order.site_name ? `Planta: ${order.site_name}` : null,
        badges: [
          { text: order.status, tone: order.status === "closed" ? "neutral" : "info" },
          ...(order.history_locked_at ? [{ text: "Historia congelada", tone: "neutral" as const }] : []),
        ],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Fecha", order.order_date),
            requiredField("Estado", order.status),
            requiredField("Planta", order.site_name ?? "—"),
            requiredField("Pretratamiento", order.pretreatment ?? "—"),
          ], 2),
          order.notes ? { type: "fields", items: [{ label: "Observaciones", value: order.notes, wide: true }] } : null),
          section("Lotes de entrada consumidos", table(
            [{ header: "Lote", width: 2 }, { header: "Material", width: 3 },
             { header: "Proveedor", width: 3 }, { header: "Consumido", width: 1.8 }],
            consumption.map((c) => [c.input_batch_code, c.material_name, c.supplier_name, kg(c.mass_kg)]),
            "Esta orden no tiene consumos registrados."
          )),
          section("Lotes producidos", table(
            [{ header: "Lote", width: 2 }, { header: "Producto", width: 3.5 },
             { header: "Fecha", width: 1.8 }, { header: "Cantidad", width: 1.8 }],
            produced.map((b) => [
              b.batch_code, b.product_label ?? "—", b.produced_date ?? "—", kg(b.produced_quantity_kg),
            ]),
            "Esta orden todavía no ha producido lotes."
          )),
        ],
      },
    };
  },
};

export const cprProductionOrderList: ExportDefinition = {
  key: "cpr.production-order.list",
  module: "cpr",
  entity: "Órdenes / corridas de producción",
  recordType: "Órdenes / corridas de producción",
  kind: "list",
  permission: "member",
  orientation: "portrait",
  filters: [{ key: "estado", label: "Estado", kind: "text" }],
  async load(req): Promise<ExportResult | null> {
    let rows = await listProductionOrders(req.organizationId);
    const applied: { label: string; value: string }[] = [];
    if (req.filters.estado) {
      rows = rows.filter((o) => o.status === req.filters.estado);
      applied.push({ label: "Estado", value: req.filters.estado });
    }
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Ordenes-de-produccion", title: org.name, stamp: req.generatedAt.slice(0, 10) },
      document: {
        recordType: "Órdenes / corridas de producción", title: "Órdenes / corridas de producción",
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        appliedFilters: applied, recordCount: rows.length,
        sections: [section(null, table(
          [{ header: "Orden", width: 2 }, { header: "Fecha", width: 2 },
           { header: "Planta", width: 3 }, { header: "Estado", width: 2 },
           { header: "Pretratamiento", width: 3 }],
          rows.map((o) => [o.order_code, o.order_date, o.site_name ?? "—", o.status, o.pretreatment ?? "—"]),
          "No hay órdenes con ese filtro."
        ))],
      },
    };
  },
};

export const cprOutputBatchDetail: ExportDefinition = {
  key: "cpr.output-batch.detail",
  module: "cpr",
  entity: "Lote producido",
  recordType: "Lote producido",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const batches = await listOutputBatches(req.organizationId);
    const b = batches.find((x) => x.id === req.id);
    if (!b) return null;
    // §42 · La cadena completa, con la MISMA consulta que la genealogía.
    const chain = await getBackward(req.organizationId, b.id);
    const org = await organizationIdentity(req.organizationId);

    return {
      filenameParts: { recordType: "Lote-producido", title: b.batch_code, code: null },
      document: {
        recordType: "Lote producido",
        title: `Lote ${b.batch_code}`,
        code: b.batch_code,
        subtitle: b.product_label ?? null,
        badges: [{ text: b.production_order_status, tone: "neutral" }],
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Producto", b.product_label ?? "—"),
            requiredField("Orden / corrida", b.production_order_code),
            requiredField("Producido el", b.produced_date ?? "—"),
            requiredField("Cantidad", kg(b.produced_quantity_kg)),
            requiredField("Almacenamiento", b.storage_location ?? "—"),
            requiredField("Aplicación prevista", b.intended_application ?? "—"),
          ], 2),
          b.characteristics ? { type: "fields", items: [{ label: "Características", value: b.characteristics, wide: true }] } : null),
          section("Cadena de trazabilidad", table(
            [{ header: "Lote de entrada", width: 2 }, { header: "Material", width: 2.5 },
             { header: "Proveedor", width: 2.5 }, { header: "Clasificación", width: 2 },
             { header: "Consumido", width: 1.6 }],
            chain.map((c) => [
              c.input_batch_code ?? "—", c.material_name ?? "—", c.supplier_name ?? "—",
              c.classification_code ?? "—", kg(c.consumed_mass_kg),
            ]),
            "Sin cadena de trazabilidad registrada."
          ),
          note("La cadena se lee de abajo arriba: material y proveedor → lote de entrada → orden / corrida de producción → este lote.")),
        ],
      },
    };
  },
};

export const cprInputBatchDetail: ExportDefinition = {
  key: "cpr.input-batch.detail",
  module: "cpr",
  entity: "Lote de entrada",
  recordType: "Lote de entrada",
  kind: "detail",
  permission: "member",
  orientation: "portrait",
  async load(req): Promise<ExportResult | null> {
    if (!req.id) return null;
    const rows = await listInputBatches(req.organizationId);
    const b = rows.find((x) => x.id === req.id);
    if (!b) return null;
    const org = await organizationIdentity(req.organizationId);
    return {
      filenameParts: { recordType: "Lote-de-entrada", title: b.batch_code, code: null },
      document: {
        recordType: "Lote de entrada",
        title: `Lote ${b.batch_code}`,
        code: b.batch_code,
        subtitle: `${b.material_name} · ${b.supplier_name}`,
        organization: org, systemLine: SYSTEM, orientation: "portrait",
        generatedAt: req.generatedAt, generatedByName: req.generatedByName,
        sections: [
          section("Identidad", fields([
            requiredField("Material", b.material_name),
            requiredField("Proveedor", b.supplier_name),
            requiredField("Recibido el", b.received_date),
            requiredField("Cantidad recibida", kg(b.quantity_kg)),
            requiredField("Consumido", kg(b.consumed_kg)),
            requiredField("Disponible", kg((b.quantity_kg ?? 0) - b.consumed_kg)),
            requiredField("Tipo de residuo", b.residue_type ?? "—"),
            requiredField("Procedencia", b.provenance ?? "—"),
            requiredField("Ubicación", b.storage_location ?? "—"),
            requiredField("Planta", b.site_name ?? "—"),
          ], 2),
          b.notes ? { type: "fields", items: [{ label: "Observaciones", value: b.notes, wide: true }] } : null),
        ],
      },
    };
  },
};

/** Los catálogos comparten forma: son listados de referencia que una auditoría
 *  pide para comprobar que lo que se declara existe. */
function catalogList(
  key: string, entity: string, recordType: string,
  columns: { header: string; width: number }[],
  load: (orgId: string) => Promise<Record<string, unknown>[]>,
  toRow: (r: Record<string, unknown>) => string[],
  empty: string
): ExportDefinition {
  return {
    key, module: "cpr", entity, recordType, kind: "list",
    permission: "member", orientation: "portrait",
    async load(req): Promise<ExportResult | null> {
      const rows = await load(req.organizationId);
      const org = await organizationIdentity(req.organizationId);
      return {
        filenameParts: { recordType, title: org.name, stamp: req.generatedAt.slice(0, 10) },
        document: {
          recordType, title: entity,
          organization: org, systemLine: SYSTEM, orientation: "portrait",
          generatedAt: req.generatedAt, generatedByName: req.generatedByName,
          recordCount: rows.length,
          sections: [section(null, table(columns, rows.map(toRow), empty))],
        },
      };
    },
  };
}

export const cprProductList = catalogList(
  "cpr.product.list", "Productos", "Productos",
  [{ header: "Código", width: 2 }, { header: "Producto", width: 5 }, { header: "Familia", width: 3 }],
  async (o) => (await listProducts(o)) as unknown as Record<string, unknown>[],
  (r) => [String(r.code ?? "—"), String(r.name ?? "—"), String(r.family_name ?? r.familyName ?? "—")],
  "No hay productos registrados."
);

export const cprMaterialList = catalogList(
  "cpr.material.list", "Materiales", "Materiales",
  [{ header: "Código", width: 2 }, { header: "Material", width: 5 }, { header: "Clasificación", width: 3 }],
  async (o) => (await listMaterials(o)) as unknown as Record<string, unknown>[],
  (r) => [String(r.code ?? "—"), String(r.name ?? "—"), String(r.classification_code ?? r.classificationCode ?? "—")],
  "No hay materiales registrados."
);

export const cprSupplierList = catalogList(
  "cpr.supplier.list", "Proveedores", "Proveedores",
  [{ header: "Código", width: 2 }, { header: "Proveedor", width: 5 }, { header: "Contacto", width: 3 }],
  async (o) => (await listSuppliers(o)) as unknown as Record<string, unknown>[],
  (r) => [String(r.code ?? "—"), String(r.name ?? "—"), String(r.contact_name ?? r.contactName ?? "—")],
  "No hay proveedores registrados."
);

export const cprFamilyList = catalogList(
  "cpr.family.list", "Familias", "Familias de producto",
  [{ header: "Código", width: 2 }, { header: "Familia", width: 6 }],
  async (o) => (await listFamilies(o)) as unknown as Record<string, unknown>[],
  (r) => [String(r.code ?? "—"), String(r.name ?? "—")],
  "No hay familias registradas."
);
