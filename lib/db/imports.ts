import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { ENTITY_TABLE, type ImportEntityType, type ReferenceData } from "@/lib/imports/types";

type Supabase = Awaited<ReturnType<typeof createServerClient>>;

/**
 * Trazaloop · Sprint 7 · Capa de datos de la carga masiva.
 *
 * Arma los datos de referencia (qué existe ya en la empresa activa) que los
 * validadores PUROS de lib/imports/validators.ts necesitan, y resuelve los
 * nombres/códigos a ids reales al momento de escribir. Se llama DOS VECES
 * por diseño: una en el paso de validar (vista previa) y otra, fresca, en
 * el paso de confirmar (Parte 9: "commit repite validación antes de
 * escribir") — así un cambio de datos entre ambos pasos nunca cuela.
 */

/** Firma mínima usada por los helpers genéricos de abajo: alcanza para
 *  `.from(table).select(col).eq(...)` con un nombre de columna dinámico,
 *  sin recurrir a `any` ni pelear con el tipado literal de supabase-js
 *  (que intenta parsear el string de select como plantilla). */
type MinimalQuery = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => Promise<{ data: Record<string, unknown>[] | null }>;
    };
  };
};

async function namesOf(
  supabase: Supabase,
  table: string,
  column: string,
  orgId: string
): Promise<Set<string>> {
  // .select() con nombre de columna DINÁMICO: el tipado generado de
  // supabase-js intenta parsear el string de select como literal de
  // plantilla, lo que falla en compilación para strings no literales.
  // MinimalQuery documenta exactamente la forma que se usa aquí (sin `any`).
  const { data } = await (supabase as unknown as MinimalQuery).from(table).select(column).eq("organization_id", orgId);
  return new Set((data ?? []).map((r) => String(r[column]).toLowerCase()));
}

async function nameToId(
  supabase: Supabase,
  table: string,
  column: string,
  orgId: string
): Promise<Map<string, string>> {
  const { data } = await (supabase as unknown as MinimalQuery)
    .from(table)
    .select(`id, ${column}`)
    .eq("organization_id", orgId);
  return new Map((data ?? []).map((r) => [String(r[column]).toLowerCase(), String(r.id)]));
}

/** Claves naturales YA existentes de la entidad destino, en el formato que
 *  esperan los validadores (Set en minúsculas; pares compuestos con "::"). */
async function existingKeysOf(
  supabase: Supabase,
  entity: ImportEntityType,
  orgId: string
): Promise<Set<string>> {
  switch (entity) {
    case "supplier":
      return namesOf(supabase, "suppliers", "name", orgId);
    case "material":
      return namesOf(supabase, "materials", "name", orgId);
    case "evidence":
      return new Set(); // sin natural key único.
    case "product_family":
      return namesOf(supabase, "product_families", "name", orgId);
    case "product":
      return namesOf(supabase, "products", "code", orgId);
    case "input_batch":
      return namesOf(supabase, "input_batches", "batch_code", orgId);
    case "production_order":
      return namesOf(supabase, "production_orders", "order_code", orgId);
    case "output_batch":
      return namesOf(supabase, "output_batches", "batch_code", orgId);
    case "batch_consumption": {
      const { data } = await supabase
        .from("batch_consumption")
        .select("production_orders(order_code), input_batches(batch_code)")
        .eq("organization_id", orgId);
      return new Set(
        (data ?? []).map((r) => {
          const row = r as unknown as {
            production_orders: { order_code: string } | null;
            input_batches: { batch_code: string } | null;
          };
          return `${(row.production_orders?.order_code ?? "").toLowerCase()}::${(row.input_batches?.batch_code ?? "").toLowerCase()}`;
        })
      );
    }
    case "batch_composition": {
      const { data } = await supabase
        .from("batch_composition")
        .select("output_batches(batch_code), materials(name)")
        .eq("organization_id", orgId);
      return new Set(
        (data ?? []).map((r) => {
          const row = r as unknown as {
            output_batches: { batch_code: string } | null;
            materials: { name: string } | null;
          };
          return `${(row.output_batches?.batch_code ?? "").toLowerCase()}::${(row.materials?.name ?? "").toLowerCase()}`;
        })
      );
    }
  }
}

/** Arma el ReferenceData completo (natural keys propias + referencias
 *  cruzadas necesarias) para una entidad, siempre desde la empresa activa. */
export async function getReferenceData(orgId: string, entity: ImportEntityType): Promise<ReferenceData> {
  const supabase = await createServerClient();
  const existingKeys = await existingKeysOf(supabase, entity, orgId);

  const ref: ReferenceData = { existingKeys };

  if (entity === "material") {
    const [evidenceNames, classifications] = await Promise.all([
      namesOf(supabase, "evidences", "name", orgId),
      supabase.from("material_classifications").select("code"),
    ]);
    ref.evidenceNames = evidenceNames;
    ref.materialClassifications = new Set(
      (classifications.data ?? []).map((r) => String((r as { code: string }).code))
    );
  }
  if (entity === "product") {
    ref.productFamilyNames = await namesOf(supabase, "product_families", "name", orgId);
  }
  if (entity === "input_batch") {
    const [supplierNames, materialNames] = await Promise.all([
      namesOf(supabase, "suppliers", "name", orgId),
      namesOf(supabase, "materials", "name", orgId),
    ]);
    ref.supplierNames = supplierNames;
    ref.materialNames = materialNames;
  }
  if (entity === "batch_consumption") {
    const [productionOrderCodes, inputBatchCodes] = await Promise.all([
      namesOf(supabase, "production_orders", "order_code", orgId),
      namesOf(supabase, "input_batches", "batch_code", orgId),
    ]);
    ref.productionOrderCodes = productionOrderCodes;
    ref.inputBatchCodes = inputBatchCodes;
  }
  if (entity === "output_batch") {
    const [productionOrderCodes, productCodes] = await Promise.all([
      namesOf(supabase, "production_orders", "order_code", orgId),
      namesOf(supabase, "products", "code", orgId),
    ]);
    ref.productionOrderCodes = productionOrderCodes;
    ref.productCodes = productCodes;
  }
  if (entity === "batch_composition") {
    const [outputBatchCodes, materialNames] = await Promise.all([
      namesOf(supabase, "output_batches", "batch_code", orgId),
      namesOf(supabase, "materials", "name", orgId),
    ]);
    ref.outputBatchCodes = outputBatchCodes;
    ref.materialNames = materialNames;
  }

  return ref;
}

/** Mapas nombre/código → id, para resolver relaciones al momento de
 *  escribir (solo se piden los que la entidad realmente necesita). */
export type LookupMaps = {
  supplierIdByName?: Map<string, string>;
  materialIdByName?: Map<string, string>;
  evidenceIdByName?: Map<string, string>;
  familyIdByName?: Map<string, string>;
  productIdByCode?: Map<string, string>;
  inputBatchIdByCode?: Map<string, string>;
  productionOrderIdByCode?: Map<string, string>;
  outputBatchIdByCode?: Map<string, string>;
};

export async function getLookupMaps(orgId: string, entity: ImportEntityType): Promise<LookupMaps> {
  const supabase = await createServerClient();
  const maps: LookupMaps = {};

  if (entity === "material") {
    maps.evidenceIdByName = await nameToId(supabase, "evidences", "name", orgId);
  }
  if (entity === "product") {
    maps.familyIdByName = await nameToId(supabase, "product_families", "name", orgId);
  }
  if (entity === "input_batch") {
    const [suppliers, materials] = await Promise.all([
      nameToId(supabase, "suppliers", "name", orgId),
      nameToId(supabase, "materials", "name", orgId),
    ]);
    maps.supplierIdByName = suppliers;
    maps.materialIdByName = materials;
  }
  if (entity === "batch_consumption") {
    const [orders, batches] = await Promise.all([
      nameToId(supabase, "production_orders", "order_code", orgId),
      nameToId(supabase, "input_batches", "batch_code", orgId),
    ]);
    maps.productionOrderIdByCode = orders;
    maps.inputBatchIdByCode = batches;
  }
  if (entity === "output_batch") {
    const [orders, products] = await Promise.all([
      nameToId(supabase, "production_orders", "order_code", orgId),
      nameToId(supabase, "products", "code", orgId),
    ]);
    maps.productionOrderIdByCode = orders;
    maps.productIdByCode = products;
  }
  if (entity === "batch_composition") {
    const [batches, materials] = await Promise.all([
      nameToId(supabase, "output_batches", "batch_code", orgId),
      nameToId(supabase, "materials", "name", orgId),
    ]);
    maps.outputBatchIdByCode = batches;
    maps.materialIdByName = materials;
  }

  return maps;
}

/** Inserta el registro de negocio de UNA fila ya normalizada y validada.
 *  organization_id SIEMPRE es el parámetro explícito (empresa activa). */
/**
 * T9F.3: constructor PURO del payload por entidad (una tabla por entidad).
 * Separado del insert para que la confirmación de importaciones pueda emitir
 * UN ÚNICO INSERT multi-fila (una sola transacción en PostgreSQL): si el
 * trigger de límites rechaza CUALQUIER fila, se revierte TODO — jamás una
 * inserción parcial.
 */
export function buildBusinessRowPayload(
  orgId: string,
  entity: ImportEntityType,
  normalized: Record<string, unknown>,
  maps: LookupMaps
): { table: string; payload: Record<string, unknown> } {
  const table = ENTITY_TABLE[entity];

  let payload: Record<string, unknown>;
  switch (entity) {
    case "supplier":
      payload = {
        organization_id: orgId,
        name: normalized.name,
        tax_id: normalized.tax_id,
        contact: normalized.contact,
      };
      break;
    case "material": {
      const evidenceId = normalized.origin_evidence_name
        ? maps.evidenceIdByName?.get(String(normalized.origin_evidence_name).toLowerCase()) ?? null
        : null;
      payload = {
        organization_id: orgId,
        name: normalized.name,
        classification_code: normalized.classification_code,
        origin_support_evidence_id: evidenceId,
      };
      break;
    }
    case "evidence":
      payload = {
        organization_id: orgId,
        name: normalized.name,
        evidence_type: normalized.evidence_type,
        evidence_date: normalized.evidence_date,
        responsible: normalized.responsible,
        valid_until: normalized.valid_until,
        observations: normalized.observations,
        // status NUNCA viene del CSV: siempre queda en el default ('pending').
        // storage_path NUNCA se informa por CSV: son solo metadatos (Parte 4).
      };
      break;
    case "product_family":
      payload = {
        organization_id: orgId,
        name: normalized.name,
        description: normalized.description,
      };
      break;
    case "product": {
      const familyId = normalized.product_family_name
        ? maps.familyIdByName?.get(String(normalized.product_family_name).toLowerCase()) ?? null
        : null;
      payload = {
        organization_id: orgId,
        code: normalized.code,
        name: normalized.name,
        family_id: familyId,
        declared_recycled_percent: normalized.declared_recycled_percent,
      };
      break;
    }
    case "input_batch":
      payload = {
        organization_id: orgId,
        batch_code: normalized.batch_code,
        supplier_id: maps.supplierIdByName?.get(String(normalized.supplier_name).toLowerCase()) ?? null,
        material_id: maps.materialIdByName?.get(String(normalized.material_name).toLowerCase()) ?? null,
        residue_type: normalized.residue_type,
        provenance: normalized.provenance,
        received_date: normalized.received_date,
        quantity_kg: normalized.quantity_kg,
        storage_location: normalized.storage_location,
        notes: normalized.notes,
      };
      break;
    case "production_order":
      payload = {
        organization_id: orgId,
        order_code: normalized.order_code,
        order_date: normalized.order_date,
        pretreatment: normalized.pretreatment,
        notes: normalized.notes,
      };
      break;
    case "batch_consumption":
      payload = {
        organization_id: orgId,
        production_order_id: maps.productionOrderIdByCode?.get(
          String(normalized.production_order_code).toLowerCase()
        ),
        input_batch_id: maps.inputBatchIdByCode?.get(String(normalized.input_batch_code).toLowerCase()),
        mass_kg: normalized.mass_kg,
        notes: normalized.notes,
      };
      break;
    case "output_batch": {
      const productId = normalized.product_code
        ? maps.productIdByCode?.get(String(normalized.product_code).toLowerCase()) ?? null
        : null;
      payload = {
        organization_id: orgId,
        batch_code: normalized.batch_code,
        production_order_id: maps.productionOrderIdByCode?.get(
          String(normalized.production_order_code).toLowerCase()
        ),
        product_id: productId,
        produced_date: normalized.produced_date,
        produced_quantity_kg: normalized.produced_quantity_kg,
        notes: normalized.notes,
      };
      break;
    }
    case "batch_composition":
      payload = {
        organization_id: orgId,
        output_batch_id: maps.outputBatchIdByCode?.get(String(normalized.output_batch_code).toLowerCase()),
        material_id: maps.materialIdByName?.get(String(normalized.material_name).toLowerCase()),
        mass_kg: normalized.mass_kg,
        is_same_process: normalized.is_same_process ?? false,
        notes: normalized.notes,
      };
      break;
  }

  return { table, payload };
}

export async function insertBusinessRow(
  orgId: string,
  entity: ImportEntityType,
  normalized: Record<string, unknown>,
  maps: LookupMaps
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { table, payload } = buildBusinessRowPayload(orgId, entity, normalized, maps);

  const { data, error } = await supabase.from(table).insert(payload).select("id").single();
  if (error || !data) {
    return { id: null, error: error?.message ?? "No fue posible crear el registro." };
  }
  return { id: data.id as string, error: null };
}

/**
 * T9F.3 · §11: inserción MASIVA ATÓMICA. Un único statement multi-fila =
 * una única transacción: el trigger BEFORE INSERT de límites (0101 §5) ve el
 * acumulado de la propia transacción y, si el plan no admite TODAS las filas,
 * PostgreSQL revierte la operación completa (cero filas). El error de
 * Supabase se inspecciona SIEMPRE; los ids conservan el orden de entrada.
 */
export async function insertBusinessRows(
  orgId: string,
  entity: ImportEntityType,
  normalizedRows: Array<Record<string, unknown>>,
  maps: LookupMaps
): Promise<{ ids: string[] | null; error: string | null; limitExceeded: boolean }> {
  if (normalizedRows.length === 0) {
    return { ids: [], error: null, limitExceeded: false };
  }
  const supabase = await createServerClient();
  const table = ENTITY_TABLE[entity];
  const payloads = normalizedRows.map(
    (normalized) => buildBusinessRowPayload(orgId, entity, normalized, maps).payload
  );

  const { data, error } = await supabase.from(table).insert(payloads).select("id");
  if (error || !data || data.length !== payloads.length) {
    const message = error?.message ?? "No fue posible crear los registros.";
    return {
      ids: null,
      error: message,
      limitExceeded: message.includes("RESOURCE_LIMIT_EXCEEDED"),
    };
  }
  return { ids: data.map((d) => d.id as string), error: null, limitExceeded: false };
}
