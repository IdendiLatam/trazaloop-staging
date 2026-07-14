/**
 * Trazaloop · Sprint 6 · Tests de la lógica PURA de "Implementación con
 * empresa" (sin BD). Cubre la cadena de prioridad de la siguiente acción
 * recomendada (misma cadena que v_implementation_next_actions, 0034) y la
 * validación de feedback (misma lista de enums que el CHECK de 0033).
 *
 * Correr: npm run test:implementation
 */
import {
  resolveNextAction,
  type NextActionFacts,
  resolveChecklist,
  type ChecklistFacts,
  validateFeedbackDraft,
  buildFeedbackInsertPayload,
  isFeedbackStatusGuard,
} from "../../lib/domain/implementation";

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

console.log("Trazaloop · implementación: siguiente acción recomendada\n");

// ---------------------------------------------------------------------------
// resolveNextAction — 12 casos mínimos del Sprint 6 (Parte 10).
// ---------------------------------------------------------------------------
const baseFacts: NextActionFacts = {
  suppliersCount: 1,
  materialsCount: 1,
  materialsWithoutOriginSupportCount: 0,
  pendingEvidencesCount: 0,
  inputBatchesCount: 1,
  productionOrdersCount: 1,
  hasOrderWithoutConsumption: false,
  hasOutputBatchWithoutComposition: false,
  hasReadyToCalculate: false,
  criticalGapsCount: 0,
  defensibleCalculationsCount: 0,
};

check("1. Sin proveedores → create_supplier", () => {
  const r = resolveNextAction({ ...baseFacts, suppliersCount: 0 });
  assert(r === "create_supplier", r);
});

check("2. Con proveedores pero sin materiales → create_material", () => {
  const r = resolveNextAction({ ...baseFacts, materialsCount: 0 });
  assert(r === "create_material", r);
});

check("3. Material reciclado sin soporte → add_origin_evidence", () => {
  const r = resolveNextAction({ ...baseFacts, materialsWithoutOriginSupportCount: 1 });
  assert(r === "add_origin_evidence", r);
});

check("4. Evidencia pendiente → validate_evidence", () => {
  const r = resolveNextAction({ ...baseFacts, pendingEvidencesCount: 1 });
  assert(r === "validate_evidence", r);
});

check("5. Sin lotes de entrada → create_input_batch", () => {
  const r = resolveNextAction({ ...baseFacts, inputBatchesCount: 0 });
  assert(r === "create_input_batch", r);
});

check("6. Sin órdenes/corridas → create_production_order", () => {
  const r = resolveNextAction({ ...baseFacts, productionOrdersCount: 0 });
  assert(r === "create_production_order", r);
});

check("7. Orden sin consumo → add_consumption", () => {
  const r = resolveNextAction({ ...baseFacts, hasOrderWithoutConsumption: true });
  assert(r === "add_consumption", r);
});

check("8. Lote producido sin composición → add_composition", () => {
  const r = resolveNextAction({ ...baseFacts, hasOutputBatchWithoutComposition: true });
  assert(r === "add_composition", r);
});

check("9. Lote listo (con composición, sin cálculo) → calculate_recycled_content", () => {
  const r = resolveNextAction({ ...baseFacts, hasReadyToCalculate: true });
  assert(r === "calculate_recycled_content", r);
});

check("10. Cálculo con brechas críticas → review_gaps", () => {
  const r = resolveNextAction({ ...baseFacts, criticalGapsCount: 1 });
  assert(r === "review_gaps", r);
});

check("11. Cálculo defendible → open_dossier", () => {
  const r = resolveNextAction({ ...baseFacts, defensibleCalculationsCount: 1 });
  assert(r === "open_dossier", r);
});

check("12. Todo completo → record_feedback", () => {
  const r = resolveNextAction(baseFacts);
  assert(r === "record_feedback", r);
});

check("Prioridad: sin proveedores gana aunque también falten materiales", () => {
  const r = resolveNextAction({ ...baseFacts, suppliersCount: 0, materialsCount: 0 });
  assert(r === "create_supplier", r);
});

check("Prioridad: brecha crítica gana sobre cálculo defendible previo", () => {
  const r = resolveNextAction({ ...baseFacts, criticalGapsCount: 2, defensibleCalculationsCount: 3 });
  assert(r === "review_gaps", r);
});

// ---------------------------------------------------------------------------
// resolveChecklist — sanity check de los 17 ítems y algunos estados clave.
// ---------------------------------------------------------------------------
const baseChecklistFacts: ChecklistFacts = {
  hasOrganization: true,
  suppliersCount: 0,
  materialsCount: 0,
  recycledMaterialsCount: 0,
  materialsWithoutOriginSupportCount: 0,
  evidencesCount: 0,
  validEvidencesCount: 0,
  pendingEvidencesCount: 0,
  inputBatchesCount: 0,
  productionOrdersCount: 0,
  hasOrderWithoutConsumption: false,
  outputBatchesCount: 0,
  outputBatchesWithCompositionCount: 0,
  hasReadyToCalculate: false,
  calculatedOutputBatchesCount: 0,
  criticalGapsCount: 0,
  defensibleCalculationsCount: 0,
  guidedFlowTouched: false,
  feedbackCount: 0,
};

check("Checklist: siempre devuelve exactamente 17 ítems", () => {
  const items = resolveChecklist(baseChecklistFacts);
  assert(items.length === 17, `esperaba 17, obtuve ${items.length}`);
});

check("Checklist: empresa vacía → todos los pasos de datos quedan pendientes", () => {
  const items = resolveChecklist(baseChecklistFacts);
  const suppliers = items.find((i) => i.id === 2)!;
  assert(suppliers.status === "pendiente", suppliers.status);
});

check("Checklist: evidencias pendientes con evidencias cargadas → con advertencias", () => {
  const items = resolveChecklist({
    ...baseChecklistFacts,
    evidencesCount: 2,
    pendingEvidencesCount: 1,
  });
  const validate = items.find((i) => i.id === 5)!;
  assert(validate.status === "con advertencias", validate.status);
});

check("Checklist: cálculo defendible → dossier técnico completo", () => {
  const items = resolveChecklist({
    ...baseChecklistFacts,
    calculatedOutputBatchesCount: 1,
    defensibleCalculationsCount: 1,
  });
  const dossier = items.find((i) => i.id === 14)!;
  assert(dossier.status === "completo", dossier.status);
});

// ---------------------------------------------------------------------------
// Validación de feedback (Parte 10): crear válido, rechazar severidad
// inválida, rechazar módulo inválido, rechazar título vacío, cambiar
// estado, no aceptar organization_id desde cliente.
// ---------------------------------------------------------------------------
console.log("\nTrazaloop · implementación: validación de feedback\n");

const validDraft = {
  module: "recycled_content",
  category: "question",
  severity: "low",
  title: "Duda sobre el balance de masa",
  description: "¿Por qué aparece la advertencia de balance en este lote?",
};

check("1. Crear feedback válido → sin error", () => {
  const r = validateFeedbackDraft(validDraft);
  assert(r.error === null, String(r.error));
});

check("2. Rechazar severidad inválida", () => {
  const r = validateFeedbackDraft({ ...validDraft, severity: "urgentísimo" });
  assert(r.error !== null, "debía rechazar la severidad");
});

check("3. Rechazar módulo inválido", () => {
  const r = validateFeedbackDraft({ ...validDraft, module: "facturacion" });
  assert(r.error !== null, "debía rechazar el módulo");
});

check("4. Rechazar título vacío", () => {
  const r = validateFeedbackDraft({ ...validDraft, title: "   " });
  assert(r.error !== null, "debía rechazar el título vacío");
});

check("5. Cambiar estado: solo se aceptan los 4 estados del CHECK", () => {
  assert(isFeedbackStatusGuard("open"), "open debía ser válido");
  assert(isFeedbackStatusGuard("in_review"), "in_review debía ser válido");
  assert(isFeedbackStatusGuard("resolved"), "resolved debía ser válido");
  assert(isFeedbackStatusGuard("closed"), "closed debía ser válido");
  assert(!isFeedbackStatusGuard("archived"), "archived NO debía ser válido");
});

check("6. No aceptar organization_id desde cliente", () => {
  // Simula un intento de manipular el input con un organization_id ajeno:
  // como el tipo de entrada no declara ese campo, TypeScript ya lo impide en
  // compilación; en runtime, buildFeedbackInsertPayload de todos modos SOLO
  // usa el organizationId explícito (la empresa activa validada en
  // servidor), nunca ningún campo del objeto `input`.
  const maliciousInput = { ...validDraft, organization_id: "org-ajena" } as typeof validDraft & {
    organization_id: string;
  };
  const payload = buildFeedbackInsertPayload("org-activa-real", maliciousInput);
  assert(
    payload.organization_id === "org-activa-real",
    `organization_id debía ser 'org-activa-real', fue '${payload.organization_id}'`
  );
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
