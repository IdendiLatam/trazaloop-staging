/**
 * Trazaloop · Sprint 2 · Pruebas de la puntuación del diagnóstico (Sí/No).
 * Función PURA: estas pruebas corren sin base de datos → `npm run test:diagnostic`.
 *
 * Casos obligatorios:
 *  1. No se puede completar si falta una pregunta activa.
 *  2. Sí = 1, No = 0.
 *  3. El porcentaje ponderado se calcula correctamente.
 *  4. Una brecha crítica impide audit_ready_candidate.
 *  5. 100% y 0 brechas críticas → audit_ready_candidate.
 *  6. El resultado incluye secciones, brechas y acciones recomendadas.
 */
import {
  computeDiagnosticResult,
  resolveReadinessLevel,
  READINESS_LABEL,
  type ScoringQuestion,
} from "../../lib/diagnostic/scoring";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✘ ${name}:`, e instanceof Error ? e.message : e);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function q(
  id: string,
  sectionCode: string,
  opts: Partial<Pick<ScoringQuestion, "weight" | "isCritical" | "recommendedAction">> = {}
): ScoringQuestion {
  return {
    id,
    code: id.toUpperCase(),
    sectionCode,
    questionText: `Pregunta ${id}`,
    weight: opts.weight ?? 1,
    isCritical: opts.isCritical ?? false,
    recommendedAction: opts.recommendedAction ?? `Acción para ${id}`,
  };
}

console.log("\nTrazaloop · pruebas de puntuación del diagnóstico\n");

check("1. No se puede completar si falta una pregunta activa", () => {
  const questions = [q("a1", "s1"), q("a2", "s1"), q("a3", "s2")];
  const answers = new Map<string, boolean>([
    ["a1", true],
    ["a2", false],
    // a3 sin responder
  ]);
  const result = computeDiagnosticResult(questions, answers);
  assert(!result.complete, "marcó completo con preguntas sin responder");
  assert(
    result.missingQuestionIds.length === 1 && result.missingQuestionIds[0] === "a3",
    "no reportó la pregunta faltante correcta"
  );
});

check("2. Sí = 1 y No = 0", () => {
  const questions = [q("a1", "s1"), q("a2", "s1")];
  const yes = computeDiagnosticResult(questions, new Map([["a1", true], ["a2", true]]));
  const no = computeDiagnosticResult(questions, new Map([["a1", false], ["a2", false]]));
  assert(yes.maturityPercent === 100, `todo Sí debería ser 100, fue ${yes.maturityPercent}`);
  assert(no.maturityPercent === 0, `todo No debería ser 0, fue ${no.maturityPercent}`);
});

check("3. El porcentaje ponderado se calcula correctamente", () => {
  // Pesos: 3 (Sí) + 1 (No) + 1 (Sí) + 1 (No) → Sí=4 de 6 → 66.6667%
  const questions = [
    q("a1", "s1", { weight: 3 }),
    q("a2", "s1", { weight: 1 }),
    q("a3", "s2", { weight: 1 }),
    q("a4", "s2", { weight: 1 }),
  ];
  const answers = new Map<string, boolean>([
    ["a1", true],
    ["a2", false],
    ["a3", true],
    ["a4", false],
  ]);
  const result = computeDiagnosticResult(questions, answers);
  assert(
    result.maturityPercent === 66.6667,
    `esperado 66.6667, fue ${result.maturityPercent}`
  );
  const s1 = result.sectionScores.find((s) => s.sectionCode === "s1");
  assert(s1?.percent === 75, `sección s1 esperaba 75, fue ${s1?.percent}`);
  const s2 = result.sectionScores.find((s) => s.sectionCode === "s2");
  assert(s2?.percent === 50, `sección s2 esperaba 50, fue ${s2?.percent}`);
});

check("4. Una brecha crítica impide audit_ready_candidate", () => {
  // 19 Sí + 1 No crítica = 95% pero con 1 brecha crítica.
  const questions = Array.from({ length: 20 }, (_, i) =>
    q(`a${i}`, "s1", { isCritical: i === 0 })
  );
  const answers = new Map<string, boolean>(
    questions.map((question, i) => [question.id, i !== 0])
  );
  const result = computeDiagnosticResult(questions, answers);
  assert(result.maturityPercent === 95, `esperado 95, fue ${result.maturityPercent}`);
  assert(result.criticalGaps === 1, `esperada 1 brecha crítica, fue ${result.criticalGaps}`);
  assert(
    result.readinessLevel !== "audit_ready_candidate",
    "con una brecha crítica jamás debe ser audit_ready_candidate"
  );
  assert(result.readinessLevel === "high", `debió caer a high, fue ${result.readinessLevel}`);
  // Regla directa también:
  assert(
    resolveReadinessLevel(99.9, 1) !== "audit_ready_candidate",
    "resolveReadinessLevel permitió audit_ready con brecha crítica"
  );
});

check("5. 100% y 0 brechas críticas → audit_ready_candidate", () => {
  const questions = Array.from({ length: 10 }, (_, i) =>
    q(`a${i}`, "s1", { isCritical: i < 3 })
  );
  const answers = new Map<string, boolean>(questions.map((question) => [question.id, true]));
  const result = computeDiagnosticResult(questions, answers);
  assert(result.maturityPercent === 100, "esperado 100%");
  assert(result.criticalGaps === 0, "esperadas 0 brechas");
  assert(
    result.readinessLevel === "audit_ready_candidate",
    `esperado audit_ready_candidate, fue ${result.readinessLevel}`
  );
  assert(
    READINESS_LABEL[result.readinessLevel] === "Candidato a preparación para auditoría",
    "la etiqueta no debe hablar de certificación"
  );
});

check("6. El resultado incluye secciones, brechas y acciones recomendadas", () => {
  const questions = [
    q("a1", "s1", { isCritical: true, recommendedAction: "Implemente registro de lotes." }),
    q("a2", "s1"),
    q("a3", "s2", { recommendedAction: "Documente el procedimiento." }),
  ];
  const answers = new Map<string, boolean>([
    ["a1", false],
    ["a2", true],
    ["a3", false],
  ]);
  const result = computeDiagnosticResult(questions, answers);

  assert(result.sectionScores.length === 2, "faltan secciones en el resultado");
  assert(result.criticalGaps === 1, "conteo de brechas críticas incorrecto");
  assert(result.noAnswers.length === 2, "faltan respuestas No en el resultado");
  const critical = result.noAnswers.find((n) => n.questionId === "a1");
  assert(critical?.isCritical === true, "no marcó la brecha crítica");
  assert(
    critical?.recommendedAction === "Implemente registro de lotes.",
    "no incluyó la acción recomendada de la brecha"
  );
});

// Bordes de la cascada de niveles.
check("Extra. Cascada de niveles: límites 50/75/90 y brechas 4/8", () => {
  assert(resolveReadinessLevel(49.9, 0) === "low", "49.9% debe ser low");
  assert(resolveReadinessLevel(50, 0) === "medium", "50% debe ser medium");
  assert(resolveReadinessLevel(74.9, 8) === "medium", "74.9% con 8 brechas debe ser medium");
  assert(resolveReadinessLevel(74.9, 9) === "low", "más de 8 brechas debe ser low");
  assert(resolveReadinessLevel(75, 4) === "high", "75% con 4 brechas debe ser high");
  assert(resolveReadinessLevel(75, 5) === "medium", "75% con 5 brechas debe ser medium");
  assert(resolveReadinessLevel(90, 0) === "audit_ready_candidate", "90% sin brechas debe ser candidato");
  assert(resolveReadinessLevel(90, 1) === "high", "90% con 1 brecha debe ser high");
});

console.log(`\nResultado: ${passed} en verde, ${failed} en rojo.\n`);
process.exit(failed === 0 ? 0 : 1);
