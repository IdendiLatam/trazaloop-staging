/**
 * Trazaloop · Sprint T2 (Textil) · Tests del scoring PURO del diagnóstico
 * textil (sin BD) + invariantes de fuente del sprint.
 *
 * Correr: npx tsx tests/diagnostic/textiles-scoring.test.ts
 * (Sin script en package.json a propósito: T2 no modifica package.json.)
 */
import fs from "node:fs";
import path from "node:path";
import {
  computeTextileDiagnosticResult,
  resolveEffectiveAnswers,
  resolveTextileMaturityLevel,
  isTextileAnswerValue,
  CRITICAL_DIMENSION_CAP,
  TEXTILE_DIAGNOSTIC_DISCLAIMER,
  type TextileAnswerValue,
  type TextileScoringQuestion,
  type TextileScoringSection,
} from "../../lib/domain/textiles-diagnostic";

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
function readSource(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, relPath), "utf8");
}

// Fixture mínima: 3 dimensiones (pesos 10/5/5), con crítica y contexto.
const SECTIONS: TextileScoringSection[] = [
  { code: "TD1", title: "Identificación", weight: 10 },
  { code: "TD9", title: "Circularidad", weight: 5 },
  { code: "TD10", title: "Claims", weight: 5 },
];

function q(
  id: string,
  sectionCode: string,
  opts: Partial<TextileScoringQuestion> = {}
): TextileScoringQuestion {
  return {
    id,
    code: id.toUpperCase(),
    sectionCode,
    questionText: `Pregunta ${id}`,
    weight: 1,
    isCritical: false,
    allowsNa: true,
    isContext: false,
    recommendedAction: `Acción ${id}`,
    ...opts,
  };
}

const QUESTIONS: TextileScoringQuestion[] = [
  q("q1", "TD1", { isCritical: true, allowsNa: false }),
  q("q2", "TD1"),
  q("q3", "TD1"),
  q("q4", "TD9"),
  q("q5", "TD9"),
  q("ctx", "TD10", { isContext: true, recommendedAction: null }),
  q("q6", "TD10"),
  q("q7", "TD10"),
];

function ans(entries: [string, TextileAnswerValue][]): Map<string, TextileAnswerValue> {
  return new Map(entries);
}

console.log("Trazaloop · Textil T2: escala y valores\n");

check("1. Escala válida: yes/partial/no/not_applicable y nada más", () => {
  for (const v of ["yes", "partial", "no", "not_applicable"]) {
    assert(isTextileAnswerValue(v), `${v} debía ser válido`);
  }
  for (const v of ["si", "true", "1", "", null, undefined, "NO"]) {
    assert(!isTextileAnswerValue(v), `${String(v)} no debía ser válido`);
  }
});

check("2. Sí=1, Parcial=0.5, No=0: dimensión con [yes,partial,no] da 50 %", () => {
  const r = computeTextileDiagnosticResult(SECTIONS, QUESTIONS, ans([
    ["q1", "yes"], ["q2", "partial"], ["q3", "no"],
    ["q4", "yes"], ["q5", "yes"],
    ["ctx", "yes"], ["q6", "yes"], ["q7", "yes"],
  ]));
  const td1 = r.dimensionScores.find((d) => d.sectionCode === "TD1")!;
  assert(td1.percent === 50, `TD1 debía dar 50 (dio ${td1.percent})`);
  assert(r.complete, "debía estar completo");
});

check("3. 'No aplica' sale del denominador (no penaliza ni suma)", () => {
  const r = computeTextileDiagnosticResult(SECTIONS, QUESTIONS, ans([
    ["q1", "yes"], ["q2", "not_applicable"], ["q3", "yes"],
    ["q4", "yes"], ["q5", "yes"],
    ["ctx", "yes"], ["q6", "yes"], ["q7", "yes"],
  ]));
  const td1 = r.dimensionScores.find((d) => d.sectionCode === "TD1")!;
  assert(td1.percent === 100, `TD1 debía dar 100 con q2 NA (dio ${td1.percent})`);
  assert(td1.applicableCount === 2, "TD1 debía tener 2 aplicables");
});

console.log("\nTrazaloop · Textil T2: regla de contexto (claims, TQ49)\n");

check("4. Contexto en 'No' vuelve 'No aplica' las demás de su dimensión (aunque tengan respuesta)", () => {
  const eff = resolveEffectiveAnswers(QUESTIONS, ans([
    ["ctx", "no"], ["q6", "yes"], ["q7", "no"],
  ]));
  assert(eff.get("q6") === "not_applicable" && eff.get("q7") === "not_applicable", "q6/q7 debían quedar NA");
});

check("5. Dimensión con contexto en 'No' queda No aplica y sale del puntaje global", () => {
  const r = computeTextileDiagnosticResult(SECTIONS, QUESTIONS, ans([
    ["q1", "yes"], ["q2", "yes"], ["q3", "yes"],
    ["q4", "yes"], ["q5", "yes"],
    ["ctx", "no"], ["q6", "not_applicable"], ["q7", "not_applicable"],
  ]));
  const td10 = r.dimensionScores.find((d) => d.sectionCode === "TD10")!;
  assert(td10.percent === null, "TD10 debía quedar No aplica");
  assert(r.maturityPercent === 100, `el global debía excluir TD10 y dar 100 (dio ${r.maturityPercent})`);
});

check("6. El contexto jamás puntúa: con contexto 'yes', solo puntúan q6/q7", () => {
  const r = computeTextileDiagnosticResult(SECTIONS, QUESTIONS, ans([
    ["q1", "yes"], ["q2", "yes"], ["q3", "yes"],
    ["q4", "yes"], ["q5", "yes"],
    ["ctx", "yes"], ["q6", "no"], ["q7", "no"],
  ]));
  const td10 = r.dimensionScores.find((d) => d.sectionCode === "TD10")!;
  assert(td10.percent === 0, `TD10 debía dar 0 (el 'yes' del contexto no suma; dio ${td10.percent})`);
  assert(td10.applicableCount === 2, "solo q6/q7 debían ser aplicables");
});

console.log("\nTrazaloop · Textil T2: críticas y niveles\n");

check("7. Crítica en 'No' limita la dimensión al techo de Básico (49)", () => {
  const r = computeTextileDiagnosticResult(SECTIONS, QUESTIONS, ans([
    ["q1", "no"], ["q2", "yes"], ["q3", "yes"],
    ["q4", "yes"], ["q5", "yes"],
    ["ctx", "yes"], ["q6", "yes"], ["q7", "yes"],
  ]));
  const td1 = r.dimensionScores.find((d) => d.sectionCode === "TD1")!;
  assert(td1.rawPercent !== null && Math.abs(td1.rawPercent - 66.6667) < 0.001, "el crudo debía ser 66.67");
  assert(td1.percent === CRITICAL_DIMENSION_CAP && td1.cappedByCritical, `TD1 debía quedar en ${CRITICAL_DIMENSION_CAP}`);
  assert(r.criticalGaps === 1, "debía contar 1 brecha crítica");
});

check("8. Brecha crítica limita el NIVEL global a 'basico' aunque el promedio dé más", () => {
  const r = computeTextileDiagnosticResult(SECTIONS, QUESTIONS, ans([
    ["q1", "no"], ["q2", "yes"], ["q3", "yes"],
    ["q4", "yes"], ["q5", "yes"],
    ["ctx", "yes"], ["q6", "yes"], ["q7", "yes"],
  ]));
  assert(r.maturityPercent > 49, "el global debía superar 49 por las otras dimensiones");
  assert(r.maturityLevel === "basico", `el nivel debía quedar en 'basico' (dio ${r.maturityLevel})`);
});

check("9. Umbrales de nivel: 0-24 inicial · 25-49 basico · 50-69 intermedio · 70-84 avanzado · 85-100 preparado", () => {
  assert(resolveTextileMaturityLevel(0) === "inicial" && resolveTextileMaturityLevel(24.9) === "inicial", "inicial");
  assert(resolveTextileMaturityLevel(25) === "basico" && resolveTextileMaturityLevel(49.9) === "basico", "basico");
  assert(resolveTextileMaturityLevel(50) === "intermedio" && resolveTextileMaturityLevel(69.9) === "intermedio", "intermedio");
  assert(resolveTextileMaturityLevel(70) === "avanzado" && resolveTextileMaturityLevel(84.9) === "avanzado", "avanzado");
  assert(resolveTextileMaturityLevel(85) === "preparado" && resolveTextileMaturityLevel(100) === "preparado", "preparado");
});

check("10. Global pondera por peso de dimensión (TD1=10 domina sobre TD9=5)", () => {
  const r = computeTextileDiagnosticResult(SECTIONS, QUESTIONS, ans([
    ["q1", "yes"], ["q2", "yes"], ["q3", "yes"],
    ["q4", "no"], ["q5", "no"],
    ["ctx", "no"], ["q6", "not_applicable"], ["q7", "not_applicable"],
  ]));
  // TD1=100 (peso 10), TD9=0 (peso 5), TD10 NA → (100*10+0*5)/15 = 66.6667
  assert(Math.abs(r.maturityPercent - 66.6667) < 0.001, `global debía ser 66.67 (dio ${r.maturityPercent})`);
});

console.log("\nTrazaloop · Textil T2: completitud y validación\n");

check("11. Falta una respuesta → incompleto con la pregunta identificada", () => {
  const r = computeTextileDiagnosticResult(SECTIONS, QUESTIONS, ans([
    ["q1", "yes"], ["q2", "yes"], ["q3", "yes"],
    ["q4", "yes"],
    ["ctx", "yes"], ["q6", "yes"], ["q7", "yes"],
  ]));
  assert(!r.complete && r.missingQuestionIds.length === 1 && r.missingQuestionIds[0] === "q5", "debía faltar q5");
});

check("12. 'No aplica' guardado en pregunta que no lo admite → inválido", () => {
  const r = computeTextileDiagnosticResult(SECTIONS, QUESTIONS, ans([
    ["q1", "not_applicable"], ["q2", "yes"], ["q3", "yes"],
    ["q4", "yes"], ["q5", "yes"],
    ["ctx", "yes"], ["q6", "yes"], ["q7", "yes"],
  ]));
  assert(!r.complete && r.invalidNaQuestionIds.includes("q1"), "q1 (allows_na=false) debía marcarse inválida");
});

check("13. Brechas ordenadas: críticas primero, luego 'No', luego 'Parcial'", () => {
  const r = computeTextileDiagnosticResult(SECTIONS, QUESTIONS, ans([
    ["q1", "no"], ["q2", "partial"], ["q3", "yes"],
    ["q4", "no"], ["q5", "yes"],
    ["ctx", "yes"], ["q6", "yes"], ["q7", "yes"],
  ]));
  assert(r.gaps[0].questionId === "q1" && r.gaps[0].isCritical, "la crítica debía ir primero");
  assert(r.gaps[1].questionId === "q4" && r.gaps[1].answer === "no", "luego el 'No' no crítico");
  assert(r.gaps[2].questionId === "q2" && r.gaps[2].answer === "partial", "luego el 'Parcial'");
});

console.log("\nTrazaloop · Textil T2: invariantes de fuente del sprint\n");

check("14. La migración 0071 siembra 12 dimensiones y 58 preguntas propias, sin tocar CPR", () => {
  const mig = readSource("../../supabase/migrations/0071_textile_diagnostic.sql");
  const allTdRows = (mig.match(/\('TD\d+',/g) ?? []).length;
  const questions = (mig.match(/\('TD\d+',\s*'TQ\d\d'/g) ?? []).length;
  assert(questions === 58, `debían sembrarse 58 preguntas (hay ${questions})`);
  const sections = allTdRows - questions;
  assert(sections === 12, `debían sembrarse 12 dimensiones (hay ${sections})`);
  const criticals = (mig.match(/true, {2}false, false/g) ?? []).length;
  assert(criticals === 6, `debían ser 6 críticas sin NA (hay ${criticals})`);
  assert(mig.includes("is_context") && mig.includes("'TQ49'"), "TQ49 debía existir como contexto");
  assert(!/NTC 6632|UNE-EN 15343|recicladora|pel[eé]tiz/i.test(mig), "el seed textil no debía citar normas ni vocabulario CPR");
  assert(!/create table public\.(?!textile_)/.test(mig), "0071 solo debía crear tablas textile_");
  assert(!/drop |alter table public\.(?!textile_)/.test(mig), "0071 no debía alterar/borrar objetos existentes");
});

check("15. Ninguna pregunta textil reutiliza texto del seed CPR (0022)", () => {
  const cpr = readSource("../../supabase/migrations/0022_seed_sprint2.sql");
  const textil = readSource("../../supabase/migrations/0071_textile_diagnostic.sql");
  const cprQuestions = [...cpr.matchAll(/'¿[^']{20,}?'/g)].map((m) => m[0]);
  assert(cprQuestions.length > 0, "el seed CPR debía tener preguntas para comparar");
  for (const qt of cprQuestions) {
    assert(!textil.includes(qt), `pregunta CPR reutilizada: ${qt.slice(0, 60)}…`);
  }
});

check("16. Las rutas del diagnóstico viven bajo el namespace protegido y usan el guard", () => {
  const page = readSource("../../app/(app)/(shell)/textiles/diagnostic/page.tsx");
  const results = readSource("../../app/(app)/(shell)/textiles/diagnostic/results/page.tsx");
  assert(page.includes("requireTextilesModule") && results.includes("requireTextilesModule"), "ambas páginas debían usar el guard del módulo");
  assert(page.includes("force-dynamic") && results.includes("force-dynamic"), "ambas debían ser force-dynamic");
});

check("17. El resultado siempre lleva la advertencia obligatoria", () => {
  assert(
    TEXTILE_DIAGNOSTIC_DISCLAIMER.includes("No constituye") &&
      TEXTILE_DIAGNOSTIC_DISCLAIMER.includes("preparación"),
    "el texto de advertencia debía hablar de preparación y negar certificación"
  );
  const results = readSource("../../app/(app)/(shell)/textiles/diagnostic/results/page.tsx");
  const page = readSource("../../app/(app)/(shell)/textiles/diagnostic/page.tsx");
  assert(results.includes("TEXTILE_DIAGNOSTIC_DISCLAIMER"), "resultados debía mostrar la advertencia");
  assert(page.includes("TEXTILE_DIAGNOSTIC_DISCLAIMER"), "el diagnóstico debía mostrar la advertencia");
});

check("18. Las actions exigen módulo habilitado además de empresa activa", () => {
  const actions = readSource("../../server/actions/textiles-diagnostic.ts");
  // Actualizado en T4: la triple guarda vive encapsulada en
  // requireTextilesForAction desde T2.1; se verifica siguiendo la indirección.
  assert(actions.includes("requireTextilesForAction"), "las actions debían pasar por el guard del módulo");
  const guard = readSource("../../lib/auth/require-textiles-module.ts");
  assert(
    guard.includes("isTextilesModuleEnabled") && guard.includes("organizationHasTextiles"),
    "el guard debía validar flag + habilitación"
  );
  assert(guard.includes("requireActiveOrg"), "el guard debía validar la empresa activa");
  // T9F.1: el bloqueo se conserva vía checkTextilesCanMutate (incluye estado de cuenta).
  assert(actions.includes("checkTextilesCanMutate"), "las actions debían respetar el modo solo lectura de plataforma");
});

if (failures > 0) {
  console.error(`\n${failures} fallo(s).`);
  process.exit(1);
}
console.log("\nTodo verde.");
