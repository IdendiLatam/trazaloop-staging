/**
 * Trazaloop · Sprint 7 · Validadores PUROS por entidad.
 *
 * Reciben la fila cruda + datos de referencia (nombres/códigos que YA
 * existen en la empresa activa, armados por el server action) y devuelven
 * un resultado normalizado con errores (bloquean el commit) y advertencias
 * (no bloquean). Nada aquí llama a Supabase: son funciones puras,
 * testeables con `npm run test:imports`.
 *
 * Modo "crear solamente" (Parte 6, regla 5, documentado también en
 * docs/IMPORTS_GUIDE.md): si el natural key YA EXISTE en la empresa, la
 * fila se marca como ADVERTENCIA "ya existe" y se OMITE al confirmar — no
 * se sobrescribe nada. Un duplicado DENTRO del mismo archivo sí es ERROR
 * (no hay forma segura de saber cuál de las dos filas debería ganar).
 */
import { RESIDUE_TYPES } from "./types";
import {
  normalizeText,
  normalizeMassKg,
  normalizeOptionalPositiveNumber,
  normalizePercent,
  normalizeRequiredDate,
  normalizeOptionalDate,
  normalizeOptionalBoolean,
} from "./normalizers";
import type { ImportEntityType, ReferenceData, RowIssue, RowValidationResult } from "./types";

type Draft = {
  raw: Record<string, string>;
  normalized: Record<string, unknown>;
  errors: RowIssue[];
  warnings: RowIssue[];
};

function newDraft(raw: Record<string, string>): Draft {
  return { raw, normalized: {}, errors: [], warnings: [] };
}

function err(d: Draft, field: string, message: string) {
  d.errors.push({ field, message });
}
function warn(d: Draft, field: string, message: string) {
  d.warnings.push({ field, message });
}

function finish(rowNumber: number, d: Draft, skipExisting: boolean): RowValidationResult {
  const status = d.errors.length > 0 ? "error" : d.warnings.length > 0 ? "warning" : "valid";
  return {
    rowNumber,
    status,
    raw: d.raw,
    normalized: d.normalized,
    errors: d.errors,
    warnings: d.warnings,
    skipExisting,
  };
}

// ---------------------------------------------------------------------------
// Validadores por entidad (una fila).
// ---------------------------------------------------------------------------
function validateSupplier(row: Record<string, string>, ref: ReferenceData): Draft {
  const d = newDraft(row);
  const name = normalizeText(row.supplier_name);
  if (!name) {
    err(d, "supplier_name", 'El campo "supplier_name" es obligatorio.');
    return d;
  }
  d.normalized.name = name;
  d.normalized.tax_id = normalizeText(row.tax_id);
  d.normalized.contact = normalizeText(row.contact);
  if (ref.existingKeys.has(name.toLowerCase())) {
    warn(d, "supplier_name", `El proveedor "${name}" ya existe en tu empresa: se omite.`);
  }
  return d;
}

function validateMaterial(row: Record<string, string>, ref: ReferenceData): Draft {
  const d = newDraft(row);
  const name = normalizeText(row.material_name);
  const classification = normalizeText(row.classification_code);
  if (!name) err(d, "material_name", 'El campo "material_name" es obligatorio.');
  if (!classification) {
    err(d, "classification_code", 'El campo "classification_code" es obligatorio.');
  } else if (!ref.materialClassifications?.has(classification)) {
    err(
      d,
      "classification_code",
      `La clasificación "${classification}" no existe. Usa un código del catálogo.`
    );
  }
  if (d.errors.length > 0) return d;

  d.normalized.name = name;
  d.normalized.classification_code = classification;

  const originEvidence = normalizeText(row.origin_evidence_name);
  if (originEvidence) {
    if (ref.evidenceNames?.has(originEvidence.toLowerCase())) {
      d.normalized.origin_evidence_name = originEvidence;
    } else {
      warn(
        d,
        "origin_evidence_name",
        `La evidencia "${originEvidence}" no existe en tu empresa: el material se crea sin soporte de origen.`
      );
    }
  }

  if (name && ref.existingKeys.has(name.toLowerCase())) {
    warn(d, "material_name", `El material "${name}" ya existe en tu empresa: se omite.`);
  }
  return d;
}

function validateEvidence(row: Record<string, string>): Draft {
  const d = newDraft(row);
  const name = normalizeText(row.evidence_name);
  if (!name) {
    err(d, "evidence_name", 'El campo "evidence_name" es obligatorio.');
    return d;
  }
  const date = normalizeOptionalDate(row.evidence_date, "La fecha de la evidencia");
  if (!date.ok) {
    err(d, "evidence_date", date.error);
    return d;
  }
  const validUntil = normalizeOptionalDate(row.valid_until, "La vigencia (valid_until)");
  if (!validUntil.ok) {
    err(d, "valid_until", validUntil.error);
    return d;
  }
  d.normalized.name = name;
  d.normalized.evidence_type = normalizeText(row.evidence_type);
  d.normalized.evidence_date = date.value;
  d.normalized.responsible = normalizeText(row.responsible);
  d.normalized.valid_until = validUntil.value;
  d.normalized.observations = normalizeText(row.observations);
  // Sin natural key único (evidences no tiene unique(organization_id,name)):
  // cada evidencia importada se crea de forma independiente, aunque el
  // nombre se repita — igual que crear varias evidencias desde la UI.
  return d;
}

function validateProductFamily(row: Record<string, string>, ref: ReferenceData): Draft {
  const d = newDraft(row);
  const name = normalizeText(row.family_name);
  if (!name) {
    err(d, "family_name", 'El campo "family_name" es obligatorio.');
    return d;
  }
  d.normalized.name = name;
  d.normalized.description = normalizeText(row.description);
  if (ref.existingKeys.has(name.toLowerCase())) {
    warn(d, "family_name", `La familia "${name}" ya existe en tu empresa: se omite.`);
  }
  return d;
}

function validateProduct(row: Record<string, string>, ref: ReferenceData): Draft {
  const d = newDraft(row);
  const name = normalizeText(row.product_name);
  const code = normalizeText(row.product_code);
  if (!name) err(d, "product_name", 'El campo "product_name" es obligatorio.');
  if (!code) err(d, "product_code", 'El campo "product_code" es obligatorio.');

  const percent = normalizePercent(row.declared_recycled_percent);
  if (!percent.ok) {
    err(d, "declared_recycled_percent", percent.error);
  }

  const familyName = normalizeText(row.product_family_name);
  if (familyName && !ref.productFamilyNames?.has(familyName.toLowerCase())) {
    err(
      d,
      "product_family_name",
      `La familia "${familyName}" no existe. Créala o impórtala primero.`
    );
  }

  if (d.errors.length > 0) return d;

  d.normalized.name = name;
  d.normalized.code = code;
  d.normalized.declared_recycled_percent = percent.ok ? percent.value : null;
  d.normalized.product_family_name = familyName;

  if (code && ref.existingKeys.has(code.toLowerCase())) {
    warn(d, "product_code", `El producto "${code}" ya existe en tu empresa: se omite.`);
  }
  return d;
}

function validateInputBatch(row: Record<string, string>, ref: ReferenceData): Draft {
  const d = newDraft(row);
  const code = normalizeText(row.batch_code);
  const supplier = normalizeText(row.supplier_name);
  const material = normalizeText(row.material_name);
  const residue = normalizeText(row.residue_type);
  const received = normalizeRequiredDate(row.received_date, "La fecha de recepción (received_date)");
  const quantity = normalizeOptionalPositiveNumber(row.quantity_kg, '"quantity_kg"');

  if (!code) err(d, "batch_code", 'El campo "batch_code" es obligatorio.');
  if (!supplier) {
    err(d, "supplier_name", 'El campo "supplier_name" es obligatorio.');
  } else if (!ref.supplierNames?.has(supplier.toLowerCase())) {
    err(d, "supplier_name", `El proveedor "${supplier}" no existe. Créalo o impórtalo primero.`);
  }
  if (!material) {
    err(d, "material_name", 'El campo "material_name" es obligatorio.');
  } else if (!ref.materialNames?.has(material.toLowerCase())) {
    err(d, "material_name", `El material "${material}" no existe. Créalo o impórtalo primero.`);
  }
  if (residue && !RESIDUE_TYPES.includes(residue as (typeof RESIDUE_TYPES)[number])) {
    err(d, "residue_type", `"residue_type" debe ser uno de: ${RESIDUE_TYPES.join(", ")}.`);
  }
  if (!received.ok) err(d, "received_date", received.error);
  if (!quantity.ok) err(d, "quantity_kg", quantity.error);

  if (d.errors.length > 0) return d;

  d.normalized.batch_code = code;
  d.normalized.supplier_name = supplier;
  d.normalized.material_name = material;
  d.normalized.residue_type = residue;
  d.normalized.provenance = normalizeText(row.provenance);
  d.normalized.received_date = received.ok ? received.value : null;
  d.normalized.quantity_kg = quantity.ok ? quantity.value : null;
  d.normalized.storage_location = normalizeText(row.storage_location);
  d.normalized.notes = normalizeText(row.notes);

  if (code && ref.existingKeys.has(code.toLowerCase())) {
    warn(d, "batch_code", `El lote de entrada "${code}" ya existe en tu empresa: se omite.`);
  }
  return d;
}

function validateProductionOrder(row: Record<string, string>, ref: ReferenceData): Draft {
  const d = newDraft(row);
  const code = normalizeText(row.production_order_code);
  const date = normalizeRequiredDate(row.production_date, "La fecha de la orden / corrida (production_date)");

  if (!code) err(d, "production_order_code", 'El campo "production_order_code" es obligatorio.');
  if (!date.ok) err(d, "production_date", date.error);
  if (d.errors.length > 0) return d;

  d.normalized.order_code = code;
  d.normalized.order_date = date.ok ? date.value : null;
  d.normalized.pretreatment = normalizeText(row.pretreatment);
  d.normalized.notes = normalizeText(row.notes);

  if (code && ref.existingKeys.has(code.toLowerCase())) {
    warn(d, "production_order_code", `La orden / corrida "${code}" ya existe en tu empresa: se omite.`);
  }
  return d;
}

function validateBatchConsumption(row: Record<string, string>, ref: ReferenceData): Draft {
  const d = newDraft(row);
  const orderCode = normalizeText(row.production_order_code);
  const batchCode = normalizeText(row.input_batch_code);
  const mass = normalizeMassKg(row.mass_kg);

  if (!orderCode) {
    err(d, "production_order_code", 'El campo "production_order_code" es obligatorio.');
  } else if (!ref.productionOrderCodes?.has(orderCode.toLowerCase())) {
    err(d, "production_order_code", `La orden / corrida "${orderCode}" no existe. Créala o impórtala primero.`);
  }
  if (!batchCode) {
    err(d, "input_batch_code", 'El campo "input_batch_code" es obligatorio.');
  } else if (!ref.inputBatchCodes?.has(batchCode.toLowerCase())) {
    err(d, "input_batch_code", `El lote de entrada "${batchCode}" no existe. Créalo o impórtalo primero.`);
  }
  if (!mass.ok) err(d, "mass_kg", mass.error);

  if (d.errors.length > 0) return d;

  d.normalized.production_order_code = orderCode;
  d.normalized.input_batch_code = batchCode;
  d.normalized.mass_kg = mass.ok ? mass.value : null;
  d.normalized.notes = normalizeText(row.notes);

  const key = `${orderCode?.toLowerCase()}::${batchCode?.toLowerCase()}`;
  if (ref.existingKeys.has(key)) {
    warn(d, "input_batch_code", `Ya existe un consumo de "${batchCode}" en la orden "${orderCode}": se omite.`);
  }
  return d;
}

function validateOutputBatch(row: Record<string, string>, ref: ReferenceData): Draft {
  const d = newDraft(row);
  const code = normalizeText(row.output_batch_code);
  const orderCode = normalizeText(row.production_order_code);
  const productCode = normalizeText(row.product_code);
  const date = normalizeOptionalDate(row.production_date, "La fecha de producción (production_date)");
  const quantity = normalizeOptionalPositiveNumber(row.produced_quantity_kg, '"produced_quantity_kg"');

  if (!code) err(d, "output_batch_code", 'El campo "output_batch_code" es obligatorio.');
  if (!orderCode) {
    err(d, "production_order_code", 'El campo "production_order_code" es obligatorio.');
  } else if (!ref.productionOrderCodes?.has(orderCode.toLowerCase())) {
    err(d, "production_order_code", `La orden / corrida "${orderCode}" no existe. Créala o impórtala primero.`);
  }
  if (!date.ok) err(d, "production_date", date.error);
  if (!quantity.ok) err(d, "produced_quantity_kg", quantity.error);

  if (d.errors.length > 0) return d;

  d.normalized.batch_code = code;
  d.normalized.production_order_code = orderCode;
  d.normalized.produced_date = date.ok ? date.value : null;
  d.normalized.produced_quantity_kg = quantity.ok ? quantity.value : null;
  d.normalized.notes = normalizeText(row.notes);

  if (productCode) {
    if (ref.productCodes?.has(productCode.toLowerCase())) {
      d.normalized.product_code = productCode;
    } else {
      warn(d, "product_code", `El producto "${productCode}" no existe: el lote se crea sin producto asociado.`);
    }
  }

  if (code && ref.existingKeys.has(code.toLowerCase())) {
    warn(d, "output_batch_code", `El lote producido / lote final "${code}" ya existe en tu empresa: se omite.`);
  }
  return d;
}

function validateBatchComposition(row: Record<string, string>, ref: ReferenceData): Draft {
  const d = newDraft(row);
  const batchCode = normalizeText(row.output_batch_code);
  const materialName = normalizeText(row.material_name);
  const mass = normalizeMassKg(row.mass_kg);
  const sameProcess = normalizeOptionalBoolean(row.is_same_process, '"is_same_process"');

  if (!batchCode) {
    err(d, "output_batch_code", 'El campo "output_batch_code" es obligatorio.');
  } else if (!ref.outputBatchCodes?.has(batchCode.toLowerCase())) {
    err(d, "output_batch_code", `El lote producido / lote final "${batchCode}" no existe. Créalo o impórtalo primero.`);
  }
  if (!materialName) {
    err(d, "material_name", 'El campo "material_name" es obligatorio.');
  } else if (!ref.materialNames?.has(materialName.toLowerCase())) {
    err(d, "material_name", `El material "${materialName}" no existe. Créalo o impórtalo primero.`);
  }
  if (!mass.ok) err(d, "mass_kg", mass.error);
  if (!sameProcess.ok) err(d, "is_same_process", sameProcess.error);

  if (d.errors.length > 0) return d;

  d.normalized.output_batch_code = batchCode;
  d.normalized.material_name = materialName;
  d.normalized.mass_kg = mass.ok ? mass.value : null;
  d.normalized.is_same_process = sameProcess.ok ? sameProcess.value : false;
  d.normalized.notes = normalizeText(row.notes);

  const key = `${batchCode?.toLowerCase()}::${materialName?.toLowerCase()}`;
  if (ref.existingKeys.has(key)) {
    warn(
      d,
      "material_name",
      `Ya existe composición de "${materialName}" en el lote "${batchCode}": se omite.`
    );
  }
  return d;
}

/** Clave natural de una fila YA VALIDADA (post-normalización), usada para
 *  detectar duplicados DENTRO del mismo archivo. Devuelve null cuando la
 *  entidad no tiene un natural key comparable (evidences). */
function naturalKey(entity: ImportEntityType, normalized: Record<string, unknown>): string | null {
  switch (entity) {
    case "supplier":
      return typeof normalized.name === "string" ? normalized.name.toLowerCase() : null;
    case "material":
      return typeof normalized.name === "string" ? normalized.name.toLowerCase() : null;
    case "evidence":
      return null;
    case "product_family":
      return typeof normalized.name === "string" ? normalized.name.toLowerCase() : null;
    case "product":
      return typeof normalized.code === "string" ? normalized.code.toLowerCase() : null;
    case "input_batch":
      return typeof normalized.batch_code === "string" ? normalized.batch_code.toLowerCase() : null;
    case "production_order":
      return typeof normalized.order_code === "string" ? normalized.order_code.toLowerCase() : null;
    case "batch_consumption":
      return typeof normalized.production_order_code === "string" &&
        typeof normalized.input_batch_code === "string"
        ? `${normalized.production_order_code.toLowerCase()}::${normalized.input_batch_code.toLowerCase()}`
        : null;
    case "output_batch":
      return typeof normalized.batch_code === "string" ? normalized.batch_code.toLowerCase() : null;
    case "batch_composition":
      return typeof normalized.output_batch_code === "string" && typeof normalized.material_name === "string"
        ? `${normalized.output_batch_code.toLowerCase()}::${normalized.material_name.toLowerCase()}`
        : null;
  }
}

function validateOne(entity: ImportEntityType, row: Record<string, string>, ref: ReferenceData): Draft {
  switch (entity) {
    case "supplier":
      return validateSupplier(row, ref);
    case "material":
      return validateMaterial(row, ref);
    case "evidence":
      return validateEvidence(row);
    case "product_family":
      return validateProductFamily(row, ref);
    case "product":
      return validateProduct(row, ref);
    case "input_batch":
      return validateInputBatch(row, ref);
    case "production_order":
      return validateProductionOrder(row, ref);
    case "batch_consumption":
      return validateBatchConsumption(row, ref);
    case "output_batch":
      return validateOutputBatch(row, ref);
    case "batch_composition":
      return validateBatchComposition(row, ref);
  }
}

/**
 * Valida TODAS las filas de un archivo para una entidad: cada fila por
 * separado + detección de duplicados INTERNOS del archivo (misma clave
 * natural repetida → error en la segunda aparición en adelante). Pura:
 * ref ya trae todo lo que hace falta saber de la empresa activa.
 */
export function validateRows(
  entity: ImportEntityType,
  rawRows: Record<string, string>[],
  ref: ReferenceData
): RowValidationResult[] {
  const seenInFile = new Set<string>();
  return rawRows.map((raw, i) => {
    const rowNumber = i + 2; // 1 = encabezado
    const d = validateOne(entity, raw, ref);

    if (d.errors.length === 0) {
      const key = naturalKey(entity, d.normalized);
      if (key) {
        if (seenInFile.has(key)) {
          err(d, "_row", `Esta fila está duplicada dentro del archivo (clave "${key}").`);
        } else {
          seenInFile.add(key);
        }
      }
    }

    const skipExisting =
      d.errors.length === 0 && d.warnings.some((w) => w.message.includes("se omite"));
    return finish(rowNumber, d, skipExisting);
  });
}
