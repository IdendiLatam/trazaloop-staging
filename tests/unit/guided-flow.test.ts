/**
 * Trazaloop · Sprint 5B · Tests de la lógica PURA del flujo guiado (sin BD).
 * Los 9 casos del spec sobre resolveNextStep.
 */
import { resolveNextStep, type ReadinessFacts } from "../../lib/domain/guided-flow";

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
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const base: ReadinessFacts = {
  hasProductionOrder: true,
  hasConsumption: true,
  hasComposition: true,
  anySupportMissing: false,
  anySupportPending: false,
  hasCalculation: false,
  latestDefensibilityLevel: null,
  latestRiskFlag: false,
};

console.log("Trazaloop · flujo guiado: siguiente paso y readiness\n");

check("1. lote sin orden → complete_order / not_ready", () => {
  const r = resolveNextStep({ ...base, hasProductionOrder: false });
  assert(r.code === "complete_order" && r.readiness === "not_ready", JSON.stringify(r));
});

check("2. con orden pero sin consumo → add_consumption / needs_data", () => {
  const r = resolveNextStep({ ...base, hasConsumption: false });
  assert(r.code === "add_consumption" && r.readiness === "needs_data", JSON.stringify(r));
});

check("3. con consumo pero sin composición → add_composition / needs_data", () => {
  const r = resolveNextStep({ ...base, hasComposition: false });
  assert(r.code === "add_composition" && r.readiness === "needs_data", JSON.stringify(r));
});

check("4. con composición y sin cálculo → calculate / ready_to_calculate", () => {
  const r = resolveNextStep(base);
  assert(r.code === "calculate" && r.readiness === "ready_to_calculate", JSON.stringify(r));
});

check("5. cálculo preliminary → review_gaps / calculated_with_gaps", () => {
  const r = resolveNextStep({ ...base, hasCalculation: true, latestDefensibilityLevel: "preliminary" });
  assert(r.code === "review_gaps" && r.readiness === "calculated_with_gaps", JSON.stringify(r));
});

check("6. cálculo with_warnings → review_gaps / calculated_with_gaps", () => {
  const r = resolveNextStep({ ...base, hasCalculation: true, latestDefensibilityLevel: "with_warnings" });
  assert(r.code === "review_gaps" && r.readiness === "calculated_with_gaps", JSON.stringify(r));
});

check("7. cálculo defensible → open_dossier / calculated_ready", () => {
  const r = resolveNextStep({ ...base, hasCalculation: true, latestDefensibilityLevel: "defensible" });
  assert(r.code === "open_dossier" && r.readiness === "calculated_ready", JSON.stringify(r));
});

check("8. evidencia requerida PENDIENTE → validate_evidence / needs_evidence", () => {
  const r = resolveNextStep({ ...base, anySupportPending: true });
  assert(r.code === "validate_evidence" && r.readiness === "needs_evidence", JSON.stringify(r));
});

check("9. material elegible SIN evidencia → add_evidence / needs_evidence", () => {
  const r = resolveNextStep({ ...base, anySupportMissing: true });
  assert(r.code === "add_evidence" && r.readiness === "needs_evidence", JSON.stringify(r));
});

check("Extra: defensible con risk_flag no puede quedar como listo → review_gaps", () => {
  const r = resolveNextStep({
    ...base, hasCalculation: true, latestDefensibilityLevel: "defensible", latestRiskFlag: true,
  });
  assert(r.code === "review_gaps" && r.readiness === "calculated_with_gaps", JSON.stringify(r));
});

check("Extra: faltante gana sobre pendiente cuando coexisten", () => {
  const r = resolveNextStep({ ...base, anySupportMissing: true, anySupportPending: true });
  assert(r.code === "add_evidence", JSON.stringify(r));
});

if (failures > 0) {
  console.error(`\nResultado: ${failures} en rojo.`);
  process.exit(1);
}
console.log("\nResultado: todo en verde.");
