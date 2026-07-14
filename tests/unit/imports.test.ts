/**
 * Trazaloop · Sprint 7 · Tests de la lógica PURA de la carga masiva por CSV
 * (sin BD). Cubre parseo/encabezado, normalizadores y validadores por
 * entidad. Correr: npm run test:imports
 */
import { toCsv } from "../../lib/csv";
import { parseImportCsv } from "../../lib/imports/parse";
import { validateRows } from "../../lib/imports/validators";
import { templateHeader, requiredHeader } from "../../lib/imports/templates";
import type { ReferenceData } from "../../lib/imports/types";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function emptyRef(): ReferenceData {
  return { existingKeys: new Set() };
}

console.log("Trazaloop · importaciones: parseo y encabezado\n");

// ---------------------------------------------------------------------------
// 1. CSV válido de proveedores.
// ---------------------------------------------------------------------------
check("1. CSV válido de proveedores → sin error, una fila válida", () => {
  const csv = toCsv([
    ["supplier_name", "tax_id", "contact"],
    ["Recicladora Real S.A.S.", "900123456-1", "contacto@recicladora.co"],
  ]);
  const parsed = parseImportCsv("supplier", csv);
  assert(parsed.error === null, `no debía haber error: ${parsed.error}`);
  assert(parsed.rows.length === 1, `esperaba 1 fila, hubo ${parsed.rows.length}`);
  const results = validateRows("supplier", parsed.rows, emptyRef());
  assert(results[0].status === "valid", `esperaba valid, fue ${results[0].status}`);
  assert(results[0].normalized.name === "Recicladora Real S.A.S.", "nombre normalizado incorrecto");
});

// ---------------------------------------------------------------------------
// 2. CSV sin encabezado requerido.
// ---------------------------------------------------------------------------
check("2. CSV sin encabezado requerido → error de encabezado", () => {
  const csv = toCsv([
    ["tax_id", "contact"],
    ["900123456-1", "contacto@recicladora.co"],
  ]);
  const parsed = parseImportCsv("supplier", csv);
  assert(parsed.error !== null, "debía rechazar por encabezado incompleto");
  assert(parsed.error!.includes("supplier_name"), `el error debía mencionar supplier_name: ${parsed.error}`);
});

// ---------------------------------------------------------------------------
// 3. CSV con organization_id debe rechazarse.
// ---------------------------------------------------------------------------
check("3. CSV con columna organization_id → archivo rechazado", () => {
  const csv = toCsv([
    ["supplier_name", "tax_id", "contact", "organization_id"],
    ["Recicladora Real", "900123456-1", "", "11111111-1111-1111-1111-111111111111"],
  ]);
  const parsed = parseImportCsv("supplier", csv);
  assert(parsed.error !== null, "debía rechazar el archivo completo");
  assert(parsed.error!.toLowerCase().includes("organization"), `el error debía mencionar organization_id: ${parsed.error}`);
});

console.log("\nTrazaloop · importaciones: validadores por entidad\n");

// ---------------------------------------------------------------------------
// 4. Masa negativa debe rechazarse (batch_consumption).
// ---------------------------------------------------------------------------
check("4. Masa negativa (mass_kg) → error", () => {
  const ref: ReferenceData = {
    existingKeys: new Set(),
    productionOrderCodes: new Set(["ord-001"]),
    inputBatchCodes: new Set(["lote-001"]),
  };
  const results = validateRows(
    "batch_consumption",
    [{ production_order_code: "ORD-001", input_batch_code: "LOTE-001", mass_kg: "-5", notes: "" }],
    ref
  );
  assert(results[0].status === "error", `esperaba error, fue ${results[0].status}`);
  assert(
    results[0].errors.some((e) => e.field === "mass_kg"),
    "el error debía estar en el campo mass_kg"
  );
});

// ---------------------------------------------------------------------------
// 5. Porcentaje declarado mayor a 100 debe rechazarse (products).
// ---------------------------------------------------------------------------
check("5. declared_recycled_percent > 100 → error", () => {
  const ref: ReferenceData = { existingKeys: new Set(), productFamilyNames: new Set() };
  const results = validateRows(
    "product",
    [
      {
        product_name: "Resina reciclada",
        product_code: "RES-001",
        product_family_name: "",
        declared_recycled_percent: "150",
      },
    ],
    ref
  );
  assert(results[0].status === "error", `esperaba error, fue ${results[0].status}`);
  assert(
    results[0].errors.some((e) => e.field === "declared_recycled_percent"),
    "el error debía estar en declared_recycled_percent"
  );
});

// ---------------------------------------------------------------------------
// 6. Fecha inválida debe rechazarse (input_batches).
// ---------------------------------------------------------------------------
check("6. received_date inválida → error", () => {
  const ref: ReferenceData = {
    existingKeys: new Set(),
    supplierNames: new Set(["proveedor real"]),
    materialNames: new Set(["pet reciclado"]),
  };
  const results = validateRows(
    "input_batch",
    [
      {
        batch_code: "LOTE-001",
        supplier_name: "Proveedor Real",
        material_name: "PET reciclado",
        residue_type: "",
        provenance: "",
        received_date: "31-13-2026",
        quantity_kg: "",
        storage_location: "",
        notes: "",
      },
    ],
    ref
  );
  assert(results[0].status === "error", `esperaba error, fue ${results[0].status}`);
  assert(
    results[0].errors.some((e) => e.field === "received_date"),
    "el error debía estar en received_date"
  );
});

// ---------------------------------------------------------------------------
// 7. Clasificación de material inválida debe rechazarse.
// ---------------------------------------------------------------------------
check("7. classification_code inválido → error", () => {
  const ref: ReferenceData = {
    existingKeys: new Set(),
    evidenceNames: new Set(),
    materialClassifications: new Set(["preconsumer_valid", "postconsumer_valid"]),
  };
  const results = validateRows(
    "material",
    [{ material_name: "PET reciclado", classification_code: "no_existe", origin_evidence_name: "" }],
    ref
  );
  assert(results[0].status === "error", `esperaba error, fue ${results[0].status}`);
  assert(
    results[0].errors.some((e) => e.field === "classification_code"),
    "el error debía estar en classification_code"
  );
});

// ---------------------------------------------------------------------------
// 8. Duplicado interno en CSV → error (regla elegida: dentro del mismo
//    archivo no hay forma segura de saber cuál fila debe ganar).
// ---------------------------------------------------------------------------
check("8. Duplicado interno en el archivo → error en la segunda aparición", () => {
  const ref: ReferenceData = { existingKeys: new Set() };
  const results = validateRows(
    "supplier",
    [
      { supplier_name: "Proveedor Real", tax_id: "", contact: "" },
      { supplier_name: "proveedor real", tax_id: "", contact: "otra fila" },
    ],
    ref
  );
  assert(results[0].status === "valid", `la primera fila debía ser valid, fue ${results[0].status}`);
  assert(results[1].status === "error", `la segunda fila (duplicada) debía ser error, fue ${results[1].status}`);
});

// ---------------------------------------------------------------------------
// 9. Fila vacía debe ignorarse.
// ---------------------------------------------------------------------------
check("9. Fila completamente vacía → se ignora, no se valida ni cuenta", () => {
  const csv =
    toCsv([
      ["supplier_name", "tax_id", "contact"],
      ["Proveedor Uno", "", ""],
    ]) +
    "\n,,\n" + // fila vacía (solo comas)
    toCsv([["Proveedor Dos", "", ""]]);
  const parsed = parseImportCsv("supplier", csv);
  assert(parsed.error === null, `no debía haber error: ${parsed.error}`);
  assert(parsed.rows.length === 2, `esperaba 2 filas (la vacía se ignora), hubo ${parsed.rows.length}`);
});

// ---------------------------------------------------------------------------
// 10. Evidencia importada por CSV no queda valid automáticamente.
// ---------------------------------------------------------------------------
check("10. Evidencia importada: el resultado normalizado NUNCA propone status", () => {
  const results = validateRows(
    "evidence",
    [
      {
        evidence_name: "Ficha técnica proveedor",
        evidence_type: "ficha técnica",
        evidence_date: "2026-01-15",
        responsible: "Ana Admin",
        valid_until: "",
        observations: "",
      },
    ],
    emptyRef()
  );
  assert(results[0].status === "valid", `esperaba valid, fue ${results[0].status}`);
  assert(
    !("status" in results[0].normalized),
    "el validador de evidencias NUNCA debe proponer un status (queda en el default 'pending' de la BD)"
  );
});

// ---------------------------------------------------------------------------
// 11. Consumo con cantidad 0 debe rechazarse.
// ---------------------------------------------------------------------------
check("11. batch_consumption con mass_kg = 0 → error", () => {
  const ref: ReferenceData = {
    existingKeys: new Set(),
    productionOrderCodes: new Set(["ord-001"]),
    inputBatchCodes: new Set(["lote-001"]),
  };
  const results = validateRows(
    "batch_consumption",
    [{ production_order_code: "ORD-001", input_batch_code: "LOTE-001", mass_kg: "0", notes: "" }],
    ref
  );
  assert(results[0].status === "error", `esperaba error, fue ${results[0].status}`);
});

// ---------------------------------------------------------------------------
// 12. Composición con masa 0 debe rechazarse.
// ---------------------------------------------------------------------------
check("12. batch_composition con mass_kg = 0 → error", () => {
  const ref: ReferenceData = {
    existingKeys: new Set(),
    outputBatchCodes: new Set(["salida-001"]),
    materialNames: new Set(["pet reciclado"]),
  };
  const results = validateRows(
    "batch_composition",
    [{ output_batch_code: "SALIDA-001", material_name: "PET reciclado", mass_kg: "0", is_same_process: "", notes: "" }],
    ref
  );
  assert(results[0].status === "error", `esperaba error, fue ${results[0].status}`);
});

// ---------------------------------------------------------------------------
// 13. Output batch con produced_quantity_kg negativo debe rechazarse.
// ---------------------------------------------------------------------------
check("13. output_batch con produced_quantity_kg negativo → error", () => {
  const ref: ReferenceData = {
    existingKeys: new Set(),
    productionOrderCodes: new Set(["ord-001"]),
    productCodes: new Set(),
  };
  const results = validateRows(
    "output_batch",
    [
      {
        output_batch_code: "SALIDA-001",
        production_order_code: "ORD-001",
        product_code: "",
        production_date: "",
        produced_quantity_kg: "-10",
        notes: "",
      },
    ],
    ref
  );
  assert(results[0].status === "error", `esperaba error, fue ${results[0].status}`);
  assert(
    results[0].errors.some((e) => e.field === "produced_quantity_kg"),
    "el error debía estar en produced_quantity_kg"
  );
});

console.log("\nTrazaloop · importaciones: preview sin escritura y commit revalida\n");

// ---------------------------------------------------------------------------
// 14. Preview no escribe datos: la validación pura es determinista y sin
//     efectos secundarios (misma entrada → misma salida, siempre).
// ---------------------------------------------------------------------------
check("14. Preview (validateRows) es puro: mismo input → mismo resultado, sin estado oculto", () => {
  const ref: ReferenceData = { existingKeys: new Set() };
  const rows = [{ supplier_name: "Proveedor Real", tax_id: "900123456-1", contact: "" }];
  const first = validateRows("supplier", rows, ref);
  const second = validateRows("supplier", rows, ref);
  assert(JSON.stringify(first) === JSON.stringify(second), "dos corridas con el mismo input debían ser idénticas");
});

// ---------------------------------------------------------------------------
// 15. Commit repite validación antes de escribir: revalidar con datos de
//     referencia FRESCOS (estado actual de la BD) cambia el resultado si
//     algo cambió entre el paso de validar y el de confirmar.
// ---------------------------------------------------------------------------
check("15. Revalidar con referencia fresca detecta cambios ocurridos entre validar y confirmar", () => {
  const rawRow = [{ supplier_name: "Proveedor Real", tax_id: "", contact: "" }];

  const beforeRef: ReferenceData = { existingKeys: new Set() }; // en el paso 1, no existía.
  const before = validateRows("supplier", rawRow, beforeRef);
  assert(before[0].status === "valid" && !before[0].skipExisting, "antes del cambio debía ser valid y no omitirse");

  // Entre el paso 1 y el paso 2 alguien más creó el mismo proveedor.
  const afterRef: ReferenceData = { existingKeys: new Set(["proveedor real"]) };
  const after = validateRows("supplier", rawRow, afterRef);
  assert(after[0].status === "warning" && after[0].skipExisting, "tras el cambio debía quedar warning + omitir (no duplicar)");
});

console.log("\nTrazaloop · importaciones: encabezado — obligatorias vs. opcionales (Sprint 7.1)\n");

// ---------------------------------------------------------------------------
// 16a. CSV con plantilla completa (todas las columnas, incluidas las
//      opcionales) → sigue validando igual que siempre.
// ---------------------------------------------------------------------------
check("16a. CSV con plantilla COMPLETA (obligatorias + opcionales) → válido", () => {
  const csv = toCsv([
    ["material_name", "classification_code", "origin_evidence_name"],
    ["PET reciclado", "preconsumer_valid", "Ficha proveedor"],
  ]);
  const parsed = parseImportCsv("material", csv);
  assert(parsed.error === null, `no debía haber error de encabezado: ${parsed.error}`);
  const ref = {
    existingKeys: new Set<string>(),
    evidenceNames: new Set(["ficha proveedor"]),
    materialClassifications: new Set(["preconsumer_valid"]),
  };
  const results = validateRows("material", parsed.rows, ref);
  assert(results[0].status === "valid", `esperaba valid, fue ${results[0].status}`);
  assert(results[0].normalized.origin_evidence_name === "Ficha proveedor", "debía tomar el soporte de origen opcional informado");
});

// ---------------------------------------------------------------------------
// 16b. CSV con SOLO columnas obligatorias (las opcionales ni siquiera
//      aparecen en el encabezado) → sigue validando; las opcionales quedan
//      como valor vacío/null, no como error de encabezado.
// ---------------------------------------------------------------------------
check("16b. CSV con SOLO columnas obligatorias (opcionales ausentes del encabezado) → válido", () => {
  // "material" solo trae material_name (obligatoria) y classification_code
  // (obligatoria); origin_evidence_name (opcional) NO aparece en absoluto.
  const csv = toCsv([
    ["material_name", "classification_code"],
    ["PET reciclado", "preconsumer_valid"],
  ]);
  const parsed = parseImportCsv("material", csv);
  assert(parsed.error === null, `una plantilla con solo columnas obligatorias debía aceptarse: ${parsed.error}`);
  assert(!("origin_evidence_name" in parsed.rows[0]), "la columna opcional ausente no debía aparecer en la fila parseada");

  const ref = {
    existingKeys: new Set<string>(),
    evidenceNames: new Set<string>(),
    materialClassifications: new Set(["preconsumer_valid"]),
  };
  const results = validateRows("material", parsed.rows, ref);
  assert(results[0].status === "valid", `esperaba valid, fue ${results[0].status}: ${JSON.stringify(results[0].errors)}`);
  assert(
    results[0].normalized.origin_evidence_name === undefined,
    "el soporte de origen opcional ausente debía quedar sin informar (undefined/null), nunca un error"
  );
});

check("16c. Entidad con varias opcionales ausentes (evidence: solo evidence_name) → válido", () => {
  const csv = toCsv([
    ["evidence_name"],
    ["Ficha técnica proveedor"],
  ]);
  const parsed = parseImportCsv("evidence", csv);
  assert(parsed.error === null, `debía aceptar el archivo con solo la columna obligatoria: ${parsed.error}`);
  const results = validateRows("evidence", parsed.rows, emptyRef());
  assert(results[0].status === "valid", `esperaba valid, fue ${results[0].status}: ${JSON.stringify(results[0].errors)}`);
  assert(results[0].normalized.evidence_type === null, "evidence_type ausente debía normalizarse a null");
  assert(results[0].normalized.valid_until === null, "valid_until ausente debía normalizarse a null");
});

check("16d. Plantilla oficial sigue trayendo TODAS las columnas (obligatorias + opcionales)", () => {
  // requiredHeader (validación) es un subconjunto de templateHeader
  // (descarga); la plantilla descargable no se recorta.
  const full = templateHeader("material");
  const required = requiredHeader("material");
  assert(full.length === 3, `la plantilla de materiales debía tener 3 columnas, tiene ${full.length}`);
  assert(required.length === 2, `materiales debía tener 2 columnas obligatorias, tiene ${required.length}`);
  assert(full.includes("origin_evidence_name"), "la plantilla descargable debía seguir incluyendo la columna opcional");
  assert(!required.includes("origin_evidence_name"), "origin_evidence_name no debía ser obligatoria");
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
