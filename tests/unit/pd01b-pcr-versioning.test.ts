/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01B · El instrumento PCR tiene versiones.
 *
 *
 * EL DEFECTO QUE ESTO CIERRA
 *
 * El catálogo no estaba versionado: `diagnostic_questions` tenía `is_active` y
 * nada más. Cambiar el texto, el peso o la criticidad de una pregunta
 * reescribía retroactivamente el significado de todos los diagnósticos ya
 * completados —incluidos los de empresas que pagan—, porque el resultado
 * guardado seguía apuntando a un catálogo que ya no era el mismo.
 *
 *
 * LO QUE SE CONGELA NO SON SOLO LAS PREGUNTAS
 *
 * El resultado depende también de reglas que vivían solo en código: los
 * umbrales de nivel, el redondeo y la regla de brecha crítica. Versionar las
 * preguntas y dejar los umbrales sueltos habría dado una falsa sensación de
 * inmutabilidad: bastaría mover el 75 al 80 para que un diagnóstico cerrado
 * cambiara de nivel sin que nadie tocara una respuesta.
 *
 *
 * LA PROMESA QUE MÁS IMPORTA
 *
 * Versionar NO puede cambiar ningún resultado actual. Por eso la mitad de esta
 * batería es paridad: las mismas respuestas, exactamente el mismo resultado.
 *
 * Correr: npm run test:pd01b
 */
import { readFileSync } from "node:fs";
import {
  computeDiagnosticResult, resolveReadinessLevel,
  PCR_V1_SCORING, type ScoringQuestion, type ScoringConfig,
} from "../../lib/diagnostic/scoring";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, "$1");

/** Un instrumento de juguete con la forma del real: pesos 1, críticas mezcladas. */
function instrumento(n: number, criticas: number[]): ScoringQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`,
    code: `S${Math.floor(i / 10) + 1}Q${String((i % 10) + 1).padStart(2, "0")}`,
    sectionCode: `s${Math.floor(i / 10) + 1}`,
    questionText: `Pregunta ${i + 1}`,
    weight: 1,
    isCritical: criticas.includes(i + 1),
    recommendedAction: `Acción ${i + 1}`,
  }));
}
const responder = (n: number, sies: number) =>
  new Map(Array.from({ length: n }, (_, i) => [`q${i + 1}`, i < sies]));

console.log("\nA · PARIDAD: versionar no cambió ningún resultado");
// ===========================================================================

/**
 * La cascada EXACTA que había en el código antes de 01B, escrita a mano aquí
 * para poder compararla. Si el motor y esto divergen, es que el perfil por
 * omisión dejó de reproducir el comportamiento anterior.
 */
function nivelAntiguo(pct: number, gaps: number): string {
  if (pct >= 90 && gaps === 0) return "audit_ready_candidate";
  if (pct >= 75 && gaps <= 4) return "high";
  if (pct >= 50 && gaps <= 8) return "medium";
  return "low";
}

check("El nivel coincide en las 4 fronteras y alrededor de ellas", () => {
  for (const pct of [0, 49.9999, 50, 74.9999, 75, 89.9999, 90, 100]) {
    for (const gaps of [0, 1, 4, 5, 8, 9, 27]) {
      const antes = nivelAntiguo(pct, gaps);
      const ahora = resolveReadinessLevel(pct, gaps);
      assert(antes === ahora,
        `${pct}% con ${gaps} brechas: antes «${antes}», ahora «${ahora}»`);
    }
  }
});

check("Una sola brecha crítica sigue impidiendo el nivel más alto", () => {
  assert(resolveReadinessLevel(100, 0) === "audit_ready_candidate", "100% sin brechas");
  assert(resolveReadinessLevel(100, 1) === "high",
    "una brecha crítica con 100% dejó de bajar el nivel");
});

check("El redondeo a 4 decimales no se movió", () => {
  // 52 preguntas, 17 síes: 32.692307...% → 32.6923
  const q = instrumento(52, []);
  const r = computeDiagnosticResult(q, responder(52, 17));
  assert(r.maturityPercent === 32.6923, `dio ${r.maturityPercent}`);
});

check("Resultado completo idéntico sobre un instrumento de 52 con 27 críticas", () => {
  // 27 críticas DENTRO de 1..52 — las 26 impares más la 52. El primer intento
  // generaba una crítica en la pregunta 53, que no existe: el instrumento tiene
  // 52 y la expectativa contaba una brecha imposible.
  const criticas = [...Array.from({ length: 26 }, (_, i) => i * 2 + 1), 52];
  const q = instrumento(52, criticas);
  for (const sies of [0, 13, 26, 39, 47, 52]) {
    const r = computeDiagnosticResult(q, responder(52, sies));
    const esperadoPct = Math.round((sies / 52) * 100 * 10000) / 10000;
    const esperadasBrechas = criticas.filter((c) => c > sies).length;
    assert(r.maturityPercent === esperadoPct, `${sies} síes → ${r.maturityPercent}`);
    assert(r.criticalGaps === esperadasBrechas,
      `${sies} síes → ${r.criticalGaps} brechas, esperadas ${esperadasBrechas}`);
    assert(r.readinessLevel === nivelAntiguo(esperadoPct, esperadasBrechas),
      `${sies} síes → nivel «${r.readinessLevel}»`);
    assert(r.sectionScores.length === 6, `${r.sectionScores.length} secciones`);
  }
});

check("Y las respuestas sin contestar siguen tratándose igual", () => {
  const q = instrumento(10, [1]);
  const parcial = new Map([["q1", true], ["q2", false]]);
  const r = computeDiagnosticResult(q, parcial);
  assert(r.complete === false, "se dio por completo faltando respuestas");
  assert(r.missingQuestionIds.length === 8, `faltan ${r.missingQuestionIds.length}`);
  assert(r.maturityPercent === 10, `sin responder sumó: ${r.maturityPercent}`);
  assert(r.criticalGaps === 0, "una pregunta sin responder contó como brecha crítica");
  assert(r.noAnswers.length === 1, "las no contestadas se colaron en los «No»");
});

console.log("\nB · UN motor, entradas versionadas");
// ===========================================================================

const MOTOR = sinComentarios(leer("lib/diagnostic/scoring.ts"));

check("No hay un algoritmo por versión", () => {
  for (const prohibido of ["computeDiagnosticResultV1", "computeDiagnosticResultV2",
                           "computeDiagnosticResultPublic", "resolveReadinessLevelV2"]) {
    assert(!MOTOR.includes(prohibido), `apareció «${prohibido}»: eso es duplicar el motor`);
  }
  const motores = (MOTOR.match(/export function computeDiagnosticResult/g) ?? []).length;
  assert(motores === 1, `hay ${motores} motores de puntuación`);
});

check("Los umbrales dejaron de estar sueltos en el código", () => {
  assert(/config\.levels/.test(MOTOR), "el nivel no se resuelve con el perfil recibido");
  assert(!/maturityPercent >= 90 && criticalGaps === 0/.test(MOTOR),
    "la cascada de umbrales sigue escrita a mano en el motor");
  assert(/roundingDecimals/.test(MOTOR), "el redondeo sigue fijo en el motor");
});

check("Un perfil distinto produce un nivel distinto: el perfil MANDA", () => {
  const exigente: ScoringConfig = {
    roundingDecimals: 4,
    levels: [
      { code: "audit_ready_candidate", minPercent: 99, maxCriticalGaps: 0 },
      { code: "high", minPercent: 95, maxCriticalGaps: 0 },
      { code: "medium", minPercent: 80, maxCriticalGaps: 2 },
      { code: "low", minPercent: 0, maxCriticalGaps: null },
    ],
  };
  assert(resolveReadinessLevel(92, 0) === "audit_ready_candidate", "el perfil v1 cambió");
  assert(resolveReadinessLevel(92, 0, exigente) === "medium",
    "el perfil recibido no gobierna el nivel: entonces no está versionado de verdad");
});

check("Y el perfil por omisión ES el de la v1", () => {
  assert(PCR_V1_SCORING.roundingDecimals === 4, "el redondeo de la v1 cambió");
  assert(PCR_V1_SCORING.levels.length === 4, "la v1 dejó de tener cuatro niveles");
  const orden = PCR_V1_SCORING.levels.map((l) => l.minPercent);
  assert(JSON.stringify(orden) === JSON.stringify([90, 75, 50, 0]),
    `los umbrales de la v1 son ${orden.join(", ")}`);
});

console.log("\nC · Nadie carga preguntas sin decir de qué versión");
// ===========================================================================

const CARGA = sinComentarios(leer("lib/db/diagnostic.ts"));

check("La carga de preguntas exige versión", () => {
  assert(/getVersionQuestions\(versionId: string\)/.test(CARGA),
    "la carga de preguntas no exige versión");
  assert(!/getActiveQuestions/.test(CARGA),
    "sigue existiendo la carga sin versión: con dos versiones devolvería las de ambas");
  assert(/\.eq\("version_id", versionId\)/.test(CARGA),
    "la consulta no filtra por versión");
});

check("Y ninguno de sus tres consumidores la llama sin versión", () => {
  for (const f of ["app/(app)/(shell)/(cpr)/diagnostic/page.tsx",
                   "server/actions/diagnostic.ts",
                   "lib/export/adapters/cpr-extended.ts"]) {
    const src = sinComentarios(leer(f));
    assert(!/getActiveQuestions\(/.test(src), `${f} sigue cargando sin versión`);
    assert(!/getVersionQuestions\(\)/.test(src), `${f} llama sin argumento`);
  }
});

console.log("\nD · Un diagnóstico empezado no cambia de versión");
// ===========================================================================

const ACCION = sinComentarios(leer("server/actions/diagnostic.ts"));
const PAGINA = sinComentarios(leer("app/(app)/(shell)/(cpr)/diagnostic/page.tsx"));

check("Empezar ata el diagnóstico a la versión vigente", () => {
  const i = ACCION.indexOf("export async function startDiagnosticAction");
  const cuerpo = ACCION.slice(i, ACCION.indexOf("export async function", i + 10));
  assert(/getCurrentDiagnosticVersion\("pcr"\)/.test(cuerpo),
    "empezar no resuelve la versión vigente");
  assert(/diagnostic_version_id: versionId/.test(cuerpo),
    "el diagnóstico nace sin versión");
  assert(/if \(!versionId\)/.test(cuerpo),
    "sin instrumento publicado se empieza igual: debe fallar cerrado");
});

check("Completar puntúa con la versión CON LA QUE SE RESPONDIÓ", () => {
  const i = ACCION.indexOf("export async function completeDiagnosticAction");
  const cuerpo = ACCION.slice(i);
  assert(/diagnostic_version_id/.test(cuerpo),
    "completar no lee la versión del propio diagnóstico");
  assert(/getVersionQuestions\(versionId\)/.test(cuerpo),
    "completar carga preguntas de otra versión");
  assert(!/getCurrentDiagnosticVersion/.test(cuerpo.slice(0, cuerpo.indexOf("computeDiagnosticResult"))),
    "completar usa la versión VIGENTE: si se publicó una v2 a mitad, puntuaría con preguntas que nadie vio");
});

check("Y la pantalla muestra la versión del diagnóstico en curso", () => {
  assert(/latest\?\.diagnostic_version_id \?\? versionVigente/.test(PAGINA),
    "la pantalla usa siempre la versión vigente: cambiaría las preguntas a mitad");
});

console.log("\nE · Lo publicado es historia");
// ===========================================================================

const SQL = leer("supabase/migrations/0195_pcr_diagnostic_versioning.sql");

check("Las guardas de inmutabilidad viven en la BASE", () => {
  assert(/before insert or update or delete on public\.diagnostic_sections/.test(SQL),
    "las secciones publicadas se pueden mutar");
  assert(/before insert or update or delete on public\.diagnostic_questions/.test(SQL),
    "las preguntas publicadas se pueden mutar");
  assert(/before update or delete on public\.diagnostic_versions/.test(SQL),
    "una versión publicada se puede reescribir");
  assert(/DIAGNOSTIC_VERSION_FROZEN/.test(SQL), "no hay error de congelación");
});

check("La configuración de puntuación también queda congelada", () => {
  assert(/new\.scoring_config is distinct from old\.scoring_config/.test(SQL),
    "el perfil de puntuación de una versión publicada se puede reescribir");
});

check("Una sola versión vigente por tipo, sin ambigüedad", () => {
  assert(/unique index[\s\S]{0,120}diagnostic_versions \(diagnostic_type\)[\s\S]{0,60}where status = 'published'/.test(SQL),
    "puede haber dos versiones publicadas a la vez: «la vigente» sería ambigua");
});

check("El borrador SÍ se puede editar", () => {
  assert(/v_status = 'draft'/.test(SQL) && /return coalesce\(new, old\)/.test(SQL),
    "un borrador tampoco se puede editar: entonces no se puede preparar una v2");
});

check("La clave estable es el código, y es única POR VERSIÓN", () => {
  assert(/drop constraint if exists diagnostic_questions_code_key/.test(SQL),
    "el código sigue siendo único global: la v2 no podría reutilizar «S1Q01»");
  assert(/diagnostic_questions \(version_id, code\)/.test(SQL),
    "el código no es único por versión");
});

check("Y este tramo no abre nada al público", () => {
  assert(/revoke all on table public\.diagnostic_versions from anon/.test(SQL),
    "la tabla de versiones nace con las concesiones por omisión de anon");
  assert(/revoke all on function public\.diagnostic_current_version\(text\) from public, anon/.test(SQL),
    "la función de versión vigente queda ejecutable por anon");
  assert(!/to anon/.test(SQL), "la migración concede algo a anon");
});

console.log(`\nPUBLIC-DIAGNOSTICS-01B · versionado: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
