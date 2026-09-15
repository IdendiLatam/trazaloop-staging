/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01F · El diagnóstico público, por fuera.
 *
 * Lo que vive en la base se prueba aparte contra Postgres. Aquí se comprueban
 * dos cosas que no necesitan base y que son justo donde este tramo se puede
 * romper en silencio:
 *
 *   · que la superficie pública NO entrega lo que permitiría optimizar el
 *     resultado sin cambiar la empresa —peso, criticidad, umbrales—; y
 *   · que la AUTORIDAD del resultado no está en el navegador: la acción que
 *     cierra no tiene dónde recibir un porcentaje, y la primitiva que escribe
 *     no se concede a `anon`.
 *
 * Correr: npm run test:pd01f
 */
import { readFileSync } from "node:fs";
import {
  computeDiagnosticResult, PCR_V1_SCORING, READINESS_LABEL,
  type ScoringConfig, type ScoringQuestion,
} from "../../lib/diagnostic/scoring";
import { parseScoringConfig, isPcrV1Profile } from "../../lib/diagnostic/scoring-config";
import {
  buildPublicResultSnapshot, PUBLIC_RESULT_SCHEMA,
} from "../../lib/diagnostic/public-result";

let passed = 0, failed = 0;
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function check(n: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${n}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${n}: ${e instanceof Error ? e.message : e}`); }
}
const leer = (f: string) => readFileSync(f, "utf8");
const sinTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|(^|[^:])\/\/[^\n]*/g, "$1");
/** SQL sin comentarios: este fichero HABLA de `weight` y de `is_critical`. */
const sinSql = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");

const SQL = sinSql(leer("supabase/migrations/0199_public_diagnostic_assessment.sql"));
const SQL_CRUDO = leer("supabase/migrations/0199_public_diagnostic_assessment.sql");
const ACCION = sinTs(leer("server/actions/public-diagnostic-assessment.ts"));
const DATOS = sinTs(leer("lib/db/public-diagnostic-assessment.ts"));
const UI = sinTs(leer("components/domain/public-diagnostics/assessment.tsx"));
const PAGINA = sinTs(leer("app/diagnostic/[slug]/assessment/page.tsx"));
const RESULTADO = sinTs(leer("app/diagnostic/[slug]/result/page.tsx"));
const INTAKE = sinTs(leer("server/actions/public-diagnostic-intake.ts"));

/** El cuerpo de una función SQL, para no confundirlo con el de la de al lado. */
function cuerpoSql(nombre: string): string {
  const i = SQL.indexOf(`create or replace function public.${nombre}`);
  assert(i > -1, `no existe la función ${nombre}`);
  const j = SQL.indexOf("create or replace function", i + 40);
  return SQL.slice(i, j === -1 ? undefined : j);
}

console.log("\nA · El instrumento sale de la participación");
// ===========================================================================

check("A. Todo se lee por submission.diagnostic_version_id, nunca «la vigente»", () => {
  for (const f of ["public_diagnostic_get_assessment", "public_diagnostic_save_progress",
                   "public_diagnostic_finalize_submission"]) {
    const cuerpo = cuerpoSql(f);
    assert(/s\.diagnostic_version_id|sub\.diagnostic_version_id/.test(cuerpo),
      `${f} no ata sus consultas a la versión de la participación`);
    assert(!/diagnostic_current_version/.test(cuerpo),
      `${f} pregunta cuál es la versión vigente: una v2 publicada a mitad de `
      + `un diligenciamiento cambiaría las preguntas debajo`);
    assert(!/status\s*=\s*'published'/.test(cuerpo),
      `${f} busca la versión publicada en vez de la de la participación`);
  }
  // Y en la aplicación tampoco.
  for (const [nombre, src] of [["capa de datos", DATOS], ["acción", ACCION],
                               ["página", PAGINA]] as const) {
    assert(!/getCurrentDiagnosticVersion/.test(src),
      `la ${nombre} del diagnóstico público pide la versión vigente`);
  }
  assert(/\.eq\("id", sub\.diagnostic_version_id\)/.test(DATOS),
    "el cierre no carga la versión de la participación");
});

console.log("\nB · Lo que la superficie pública NO entrega");
// ===========================================================================

check("C/D. Ni el peso ni la criticidad salen al público", () => {
  const cuerpo = cuerpoSql("public_diagnostic_get_assessment");
  for (const prohibido of ["weight", "is_critical", "recommended_action"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`).test(cuerpo),
      `la lectura pública del instrumento devuelve «${prohibido}»: con eso se `
      + `sabe exactamente qué contestar sin cambiar nada en la empresa`);
  }
  // Ni la interfaz los conoce: no puede pintarlos aunque quisiera.
  for (const prohibido of ["weight", "isCritical", "recommendedAction", "Crítica"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`).test(UI),
      `el cuestionario público conoce «${prohibido}»`);
  }
});

check("E. Del perfil de puntuación solo sale el TIPO de respuesta", () => {
  const cuerpo = cuerpoSql("public_diagnostic_get_assessment");
  // Línea entera: el perfil solo puede aparecer para TRAERLO desde la versión
  // y para sacarle el tipo de respuesta. En cualquier otro sitio sobra.
  const usos = cuerpo.split("\n").filter((l) => l.includes("scoring_config"));
  assert(usos.length > 0, "no se lee el perfil ni para saber qué control pintar");
  for (const u of usos) {
    assert(/v\.scoring_config\s*$|scoring_config->>'answer_type'/.test(u.trimEnd()),
      `la lectura pública expone el perfil de puntuación: «${u.trim()}»`);
  }
  assert(!/min_percent|max_critical_gaps|'levels'/.test(cuerpo),
    "los umbrales viajan al navegador");
  assert(!/scoringConfig|min_percent|max_critical_gaps/.test(UI),
    "el cuestionario público recibe los umbrales");
});

check("Y la instantánea no lleva peso, criticidad ni umbrales", () => {
  const q = (id: string, w: number, crit: boolean): ScoringQuestion => ({
    id, code: `Q${id}`, sectionCode: "s1", questionText: `Pregunta ${id}`,
    weight: w, isCritical: crit, recommendedAction: `Acción ${id}`,
  });
  const preguntas = [q("1", 3, true), q("2", 1, false)];
  const snapshot = buildPublicResultSnapshot({
    questions: preguntas,
    sections: [{ code: "s1", title: "Sección uno", orderIndex: 1 }],
    answers: new Map([["1", false], ["2", true]]),
    config: PCR_V1_SCORING,
    instrument: { type: "pcr", versionNumber: 1 },
  });
  const texto = JSON.stringify(snapshot.resultPayload);
  for (const prohibido of ["weight", "is_critical", "isCritical",
                           "min_percent", "max_critical_gaps"]) {
    assert(!texto.includes(prohibido), `la instantánea guarda «${prohibido}»`);
  }
  // La CIFRA de brechas críticas sí, que es un resultado. CUÁLES lo son, no.
  assert(snapshot.criticalGaps === 1, "no se cuentan las brechas críticas");
  const gaps = snapshot.resultPayload.gaps as Record<string, unknown>[];
  assert(gaps.length === 1 && gaps[0].code === "Q1", "la brecha real no se guarda");
  assert(gaps[0].recommended_action === "Acción 1",
    "la recomendación de una brecha real no se guarda");
  assert(!("is_critical" in gaps[0]), "la instantánea dice cuál era crítica");
});

console.log("\nC · Un solo motor, con las entradas de la versión");
// ===========================================================================

check("U/X. La instantánea es exactamente lo que devuelve computeDiagnosticResult", () => {
  const preguntas: ScoringQuestion[] = Array.from({ length: 12 }, (_, i) => ({
    id: `q${i}`, code: `C${i}`, sectionCode: i < 7 ? "a" : "b",
    questionText: `Pregunta ${i}`, weight: (i % 3) + 1,
    isCritical: i % 4 === 0, recommendedAction: i % 2 === 0 ? `Haz ${i}` : null,
  }));
  const respuestas = new Map(preguntas.map((p, i) => [p.id, i % 3 !== 0]));

  const motor = computeDiagnosticResult(preguntas, respuestas, PCR_V1_SCORING);
  const snapshot = buildPublicResultSnapshot({
    questions: preguntas,
    sections: [{ code: "a", title: "A", orderIndex: 1 },
               { code: "b", title: "B", orderIndex: 2 }],
    answers: respuestas, config: PCR_V1_SCORING,
    instrument: { type: "pcr", versionNumber: 1 },
  });

  assert(snapshot.maturityPercent === motor.maturityPercent,
    `porcentaje ${snapshot.maturityPercent} vs ${motor.maturityPercent}`);
  assert(snapshot.readinessLevel === motor.readinessLevel, "nivel distinto");
  assert(snapshot.criticalGaps === motor.criticalGaps, "brechas distintas");
  for (const s of motor.sectionScores) {
    const mio = snapshot.sectionScores[s.sectionCode];
    assert(mio && mio.percent === s.percent && mio.answeredYes === s.answeredYes
        && mio.total === s.total, `la sección ${s.sectionCode} no coincide`);
  }
  assert(snapshot.resultPayload.readiness_label
    === READINESS_LABEL[motor.readinessLevel], "la etiqueta no sale del motor");
  assert(snapshot.resultPayload.schema === PUBLIC_RESULT_SCHEMA,
    "la instantánea no dice qué formato es");
});

check("V. El perfil DE LA VERSIÓN cambia el nivel; el del código no manda", () => {
  const preguntas: ScoringQuestion[] = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`, code: `C${i}`, sectionCode: "a", questionText: "x",
    weight: 1, isCritical: false, recommendedAction: null,
  }));
  // 8 de 10 = 80 %. Con PCR v1 eso es «high»; con un perfil más exigente, no.
  const respuestas = new Map(preguntas.map((p, i) => [p.id, i < 8]));
  const base = buildPublicResultSnapshot({
    questions: preguntas, sections: [{ code: "a", title: "A", orderIndex: 1 }],
    answers: respuestas, config: PCR_V1_SCORING,
    instrument: { type: "pcr", versionNumber: 1 },
  });
  assert(base.readinessLevel === "high", `con v1 salió «${base.readinessLevel}»`);

  const exigente: ScoringConfig = {
    roundingDecimals: 4,
    levels: [
      { code: "audit_ready_candidate", minPercent: 95, maxCriticalGaps: 0 },
      { code: "high", minPercent: 90, maxCriticalGaps: 0 },
      { code: "medium", minPercent: 85, maxCriticalGaps: 2 },
      { code: "low", minPercent: 0, maxCriticalGaps: null },
    ],
  };
  const otro = buildPublicResultSnapshot({
    questions: preguntas, sections: [{ code: "a", title: "A", orderIndex: 1 }],
    answers: respuestas, config: exigente,
    instrument: { type: "pcr", versionNumber: 2 },
  });
  assert(otro.readinessLevel === "low",
    `el perfil de la versión no gobierna: salió «${otro.readinessLevel}»`);
  assert(otro.maturityPercent === base.maturityPercent,
    "cambiar el perfil cambió el porcentaje: eso sería otro algoritmo, no otro umbral");
});

check("El perfil guardado se lee tal cual, y uno roto NO cae en el del código", () => {
  const guardado = {
    answer_type: "yes_no", rounding_decimals: 4,
    levels: [
      { code: "audit_ready_candidate", min_percent: 90, max_critical_gaps: 0 },
      { code: "high", min_percent: 75, max_critical_gaps: 4 },
      { code: "medium", min_percent: 50, max_critical_gaps: 8 },
      { code: "low", min_percent: 0, max_critical_gaps: null },
    ],
  };
  const perfil = parseScoringConfig(guardado);
  assert(perfil !== null, "no se pudo leer el perfil de PCR v1");
  assert(isPcrV1Profile(perfil), "lo guardado en 0195 y el código han divergido");

  for (const [qué, roto] of [
    ["nulo", null],
    ["vacío", {}],
    ["sin peldaños", { rounding_decimals: 4, levels: [] }],
    ["con un nivel inventado", { rounding_decimals: 4,
      levels: [{ code: "excelente", min_percent: 0, max_critical_gaps: null }] }],
    ["sin suelo", { rounding_decimals: 4,
      levels: [{ code: "high", min_percent: 75, max_critical_gaps: 4 }] }],
    ["con redondeo absurdo", { rounding_decimals: 99,
      levels: [{ code: "low", min_percent: 0, max_critical_gaps: null }] }],
  ] as const) {
    assert(parseScoringConfig(roto) === null,
      `un perfil ${qué} se aceptó: puntuaría con umbrales que no son los suyos`);
  }
});

check("Y el diagnóstico AUTENTICADO usa el mismo motor y el mismo perfil", () => {
  const src = sinTs(leer("server/actions/diagnostic.ts"));
  const i = src.indexOf("export async function completeDiagnosticAction");
  const cuerpo = src.slice(i);
  assert(/getVersionScoringConfig\(versionId\)/.test(cuerpo),
    "el diagnóstico autenticado sigue puntuando con las constantes del código");
  assert(/computeDiagnosticResult\(questions, answers, scoringConfig\)/.test(cuerpo),
    "el motor autenticado no recibe el perfil de la versión");
  assert(/if \(!scoringConfig\)/.test(cuerpo),
    "un perfil ilegible no detiene el cierre: puntuaría con otros umbrales");
});

console.log("\nD · La autoridad del resultado no está en el navegador");
// ===========================================================================

check("W. La acción que cierra no admite NINGÚN argumento", () => {
  const i = ACCION.indexOf("export async function completePublicDiagnosticAction");
  assert(i > -1, "no existe la acción de cierre");
  const firma = ACCION.slice(i, ACCION.indexOf("{", i));
  assert(/completePublicDiagnosticAction\(\s*\)/.test(firma),
    `la acción de cierre recibe argumentos: «${firma.trim()}»`);
  for (const prohibido of ["maturity", "readiness", "criticalGaps", "critical_gaps",
                           "sectionScores", "section_scores", "resultPayload"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`).test(ACCION),
      `la acción pública maneja «${prohibido}»: el navegador podría enviarlo`);
  }
  // Y el cuestionario no calcula ni envía nada de eso.
  for (const prohibido of ["maturity", "readiness", "criticalGaps", "computeDiagnosticResult"]) {
    assert(!new RegExp(prohibido).test(UI),
      `el cuestionario público conoce «${prohibido}»`);
  }
});

check("AF. Y la primitiva que ESCRIBE el resultado no la ejecuta anon", () => {
  const concesiones = SQL.match(
    /grant execute on function public\.public_diagnostic_finalize_submission[\s\S]{0,200}?;/g) ?? [];
  assert(concesiones.length === 1, "la primitiva de cierre no se concede una sola vez");
  assert(/to service_role;\s*$/.test(concesiones[0].trim()),
    `la primitiva de cierre se concede a: «${concesiones[0].replace(/\s+/g, " ")}»`);
  assert(!/finalize_submission[\s\S]{0,300}to anon/.test(SQL),
    "la primitiva de cierre queda alcanzable por anon");
  assert(/revoke all on function public\.public_diagnostic_finalize_submission[\s\S]{0,160}from public, anon, authenticated/
    .test(SQL), "no se revoca antes de conceder");
  // Solo se alcanza por el cliente administrativo, que es server-only.
  assert(/createAdminClient/.test(DATOS) && /import "server-only"/.test(DATOS),
    "el cierre no pasa por el cliente administrativo server-only");
  assert(!/createAdminClient|service_role/.test(UI),
    "el cuestionario del navegador conoce el cliente privilegiado");
});

check("T. El número requerido se DERIVA de la versión, no es un 52 escrito", () => {
  const cuerpo = cuerpoSql("public_diagnostic_finalize_submission");
  assert(/select count\(\*\) into v_total from public\.diagnostic_questions/.test(cuerpo),
    "el cierre no cuenta las preguntas de la versión");
  assert(/v_respondidas <> v_total/.test(cuerpo),
    "el cierre no compara respondidas contra requeridas");
  assert(!/\b52\b/.test(cuerpo), "el cierre lleva un 52 escrito a mano");
  assert(!/\b52\b/.test(sinTs(leer("lib/db/public-diagnostic-assessment.ts"))),
    "la capa de datos lleva un 52 escrito a mano");
});

console.log("\nE · Autorización, continuidad y progreso");
// ===========================================================================

check("L. Ninguna acción pública acepta un identificador de participación", () => {
  for (const prohibido of ["submissionId", "submission_id", "campaignId", "campaign_id"]) {
    assert(!new RegExp(`\\b${prohibido}\\b`).test(ACCION),
      `la acción pública recibe «${prohibido}»: un uuid pasaría a ser una credencial`);
  }
  assert(/galletas\.get\(INTAKE_COOKIE\)/.test(ACCION),
    "el testigo no sale de la cookie");
  assert(!/token: string/.test(ACCION.slice(ACCION.indexOf("export async function"))),
    "el testigo viaja como argumento desde el navegador");
});

check("P. La cookie sobrevive al cierre del navegador, y la vida la dice la base", () => {
  assert(/maxAge: r\.resumeMaxAge/.test(INTAKE),
    "la cookie de continuidad vuelve a durar lo que decida la aplicación");
  assert(/httpOnly: true/.test(INTAKE) && /sameSite: "lax"/.test(INTAKE)
      && /path: "\/diagnostic"/.test(INTAKE),
    "la cookie perdió alguno de sus atributos");
  assert(/secure: process\.env\.NODE_ENV === "production"/.test(INTAKE),
    "la cookie viaja sin cifrar en producción");
  // Y la regla vive en la base, junto a la de la ventana de escritura.
  assert(/'resume_max_age', v_vida/.test(SQL), "la base no devuelve la vida del testigo");
  assert(/v_vida := 30 \* 24 \* 3600/.test(SQL), "no hay tope de vida del testigo");
  assert(/closes_at \+ interval '72 hours'/.test(SQL),
    "la cookie no contempla la gracia posterior al cierre");
  // Nunca en almacenamiento del navegador.
  for (const [nombre, src] of [["cuestionario", UI], ["formulario",
      sinTs(leer("components/domain/public-diagnostics/intake-form.tsx"))]] as const) {
    assert(!/localStorage|sessionStorage/.test(src),
      `el ${nombre} guarda algo en el almacenamiento del navegador`);
  }
});

check("N. El progreso se deriva del dato, no de por dónde dice el navegador que va", () => {
  const cuerpo = cuerpoSql("public_diagnostic_get_assessment");
  assert(/first_incomplete_section/.test(cuerpo),
    "no se calcula la primera sección incompleta");
  assert(/order by \(e->>'order'\)::int limit 1/.test(cuerpo),
    "la primera sección incompleta no es determinista");
  assert(/startSectionCode/.test(PAGINA) && /startSectionCode/.test(UI),
    "el cuestionario no arranca donde dice el servidor");
  assert(!/page_index|pageIndex|lastSection/.test(cuerpo + UI + PAGINA),
    "el avance se guarda como «por qué página iba»");
});

check("I. Sin responder NO es «No»", () => {
  const cuerpo = cuerpoSql("public_diagnostic_save_progress");
  assert(/not in \('true', 'false'\)/.test(cuerpo),
    "se acepta una respuesta que no es ni sí ni no");
  assert(/respuestas\[q\.id\]\?\.answer !== null/.test(UI),
    "el cuestionario envía también lo no respondido");
  // La forma del estado local lo dice: null es un valor distinto de false.
  assert(/answer: boolean \| null/.test(UI),
    "en el cuestionario «sin responder» no se distingue de «No»");
});

check("J. La observación es opcional, llana y acotada", () => {
  const cuerpo = cuerpoSql("public_diagnostic_save_progress");
  assert(/length\(coalesce\(e->>'observations', ''\)\) > 1000/.test(cuerpo),
    "una observación puede tener cualquier tamaño");
  assert(/nullif\(btrim\(coalesce\(e->>'observations', ''\)\), ''\)/.test(cuerpo),
    "la observación no se recorta ni se anula cuando está vacía");
  assert(/maxLength=\{MAX_OBSERVACION\}/.test(UI), "la caja no acota el texto");
  assert(/Añadir observación/.test(UI),
    "las 52 preguntas enseñan sus 52 cajas de texto");
  assert(!/dangerouslySetInnerHTML/.test(UI), "la observación se pinta como HTML");
});

console.log("\nF · La ventana, el cierre y las páginas");
// ===========================================================================

check("AA/AB. Empezar tarde no se puede; terminar dentro de la gracia, sí", () => {
  const ventana = cuerpoSql("public_intake_write_window");
  assert(/closes_at \+ interval '72 hours'/.test(ventana),
    "no hay periodo de gracia: se bloquearía en la pregunta 51 a quien empezó a tiempo");
  assert(/started_at \+ interval '30 days'/.test(ventana),
    "sin caducidad del testigo, una campaña sin cierre lo dejaría válido para siempre");
  assert(/campaign_status = 'archived'/.test(ventana),
    "una campaña archivada sigue admitiendo escrituras");
  // Y empezar sigue cerrándose EN el cierre, sin gracia: eso es 0198.
  const empezar = cuerpoSql("public_diagnostic_begin_submission");
  assert(/c\.closes_at is not null and c\.closes_at <= now\(\)/.test(empezar),
    "se puede empezar una participación después del cierre");
  assert(!/closes_at \+ interval '72 hours'[\s\S]{0,200}unavailable/.test(empezar),
    "la gracia se aplicó también a empezar");
});

check("Y/Z. Cerrar es atómico e idempotente", () => {
  const cuerpo = cuerpoSql("public_diagnostic_finalize_submission");
  const upd = cuerpo.slice(cuerpo.indexOf("update public.public_diagnostic_submissions"));
  for (const campo of ["status", "completed_at", "maturity_percent", "readiness_level",
                       "critical_gaps", "section_scores", "result_payload"]) {
    assert(new RegExp(`${campo} =`).test(upd.slice(0, 600)),
      `«${campo}» no se congela en la misma sentencia: podría quedar completada sin resultado`);
  }
  assert(/where id = s\.id and status = 'in_progress'/.test(upd),
    "la carrera no la decide la propia sentencia");
  assert(/'already_completed'/.test(cuerpo),
    "una segunda llamada no obtiene una respuesta controlada");
  assert(/get diagnostics v_filas = row_count/.test(cuerpo),
    "no se mira si la actualización llegó a tiempo");
});

check("AG. El resultado exige el testigo propio, y la ruta no lleva identificador", () => {
  assert(/galletas\.get\(INTAKE_COOKIE\)/.test(RESULTADO),
    "la página de resultado no exige testigo");
  assert(/if \(!token\) redirect\(puerta\)/.test(RESULTADO),
    "sin testigo se ve algo");
  assert(/evaluacion\.slug !== slug/.test(RESULTADO),
    "un testigo de otra campaña abre este resultado");
  assert(/submissionStatus !== "completed"/.test(RESULTADO),
    "se enseña resultado de algo que no está cerrado");
  // PD-01G hará el informe: aquí no se adelanta.
  for (const prohibido of ["maturityPercent", "maturity_percent", "readinessLevel",
                           "criticalGaps", "sectionScores"]) {
    assert(!new RegExp(prohibido).test(RESULTADO),
      `la pantalla de resultado ya enseña «${prohibido}»: eso es PD-01G`);
  }
});

check("Q/R. En curso se edita; cerrada, no, y la interfaz lo respeta", () => {
  assert(/writable/.test(PAGINA) && /disabled=\{!writable/.test(UI),
    "la interfaz deja tocar una participación que no admite cambios");
  assert(/submissionStatus === "completed"/.test(PAGINA),
    "una participación cerrada sigue abriendo el cuestionario");
  // La verdad está en la base, no en el botón.
  const guardar = cuerpoSql("public_diagnostic_save_progress");
  assert(/public_intake_write_window/.test(guardar),
    "guardar no comprueba la ventana en servidor");
});

check("K. Una pregunta de otra versión o de otra sección se rechaza", () => {
  const cuerpo = cuerpoSql("public_diagnostic_save_progress");
  assert(/q\.version_id = s\.diagnostic_version_id/.test(cuerpo),
    "se acepta una pregunta de otra versión");
  assert(/q\.section_id = v_seccion/.test(cuerpo),
    "se acepta una pregunta de otra sección en el lote de esta");
  assert(/q\.is_active/.test(cuerpo), "se acepta una pregunta retirada");
});

check("AC/AD. Guardar tiene su propio cupo, y no el de empezar", () => {
  const guardar = cuerpoSql("public_diagnostic_save_progress");
  assert(/public_intake_token_rate_ok\(\s*'save'/.test(guardar),
    "guardar consume el cupo de empezar: seis secciones parecerían abuso");
  assert(!/public_intake_rate_ok\(/.test(guardar),
    "guardar usa el contador de empezar");
  assert(/'save', s\.campaign_id, s\.id, 120, interval '1 hour'/.test(guardar),
    "el cupo de guardar no es el declarado");
  assert(/'complete', s\.campaign_id, s\.id, 10, interval '1 hour'/
    .test(cuerpoSql("public_diagnostic_finalize_submission")), "cerrar no tiene cupo propio");
  assert(/'read', s\.campaign_id, s\.id, 600, interval '1 hour'/
    .test(cuerpoSql("public_diagnostic_get_assessment")), "leer no tiene cupo propio");
  // Y la ventana sigue viviendo en la base, no en memoria del proceso.
  assert(/insert into public\.public_intake_attempts/.test(SQL),
    "el contador dejó de persistirse");
});

check("F. Se guarda una SECCIÓN por viaje, no 52 escrituras sueltas", () => {
  assert(/p_answers jsonb/.test(SQL), "no se puede enviar un lote");
  assert(/jsonb_array_length\(p_answers\) > v_cupo/.test(SQL),
    "un lote puede traer más respuestas que preguntas tiene la sección");
  assert(/on conflict \(submission_id, question_id\) do update/.test(SQL),
    "el guardado no es idempotente por pregunta");
  assert(/savePublicSectionAction\(seccion\.code, lote\)/.test(UI),
    "el cuestionario no guarda por secciones");
});

console.log("\nG · Indexación y registros");
// ===========================================================================

check("Las dos páginas nuevas no se indexan", () => {
  for (const [nombre, src] of [["cuestionario", PAGINA], ["resultado", RESULTADO]] as const) {
    assert(/robots: \{ index: false, follow: false \}/.test(src),
      `la página de ${nombre} se indexaría`);
  }
});

check("PII_LOGGING: nada personal acaba en un registro", () => {
  for (const f of ["server/actions/public-diagnostic-assessment.ts",
                   "lib/db/public-diagnostic-assessment.ts",
                   "lib/diagnostic/public-result.ts",
                   "app/diagnostic/[slug]/assessment/page.tsx",
                   "app/diagnostic/[slug]/result/page.tsx",
                   "components/domain/public-diagnostics/assessment.tsx"]) {
    assert(!/console\.(log|info|warn|error)/.test(sinTs(leer(f))),
      `${f} escribe en el registro`);
  }
  // Y la base rechaza una instantánea con el correo de quien respondió.
  assert(/position\(s\.correo in lower\(p_result_payload::text\)\)/.test(SQL),
    "no se comprueba que la instantánea esté libre de datos personales");
});

check("Y ninguna tabla se abre: la migración no concede una sola", () => {
  assert(!/grant\s+(select|insert|update|delete|all)\s+on\s+table/i.test(SQL),
    "0199 concede una tabla");
  assert(!/for select to anon|for all to anon|to anon using/i.test(SQL),
    "0199 crea una política para anon");
  const definer = (SQL.match(/security definer/g) ?? []).length;
  const paths = (SQL.match(/set search_path to 'public'/g) ?? []).length;
  assert(paths >= definer, `${definer} funciones definer y solo ${paths} fijan search_path`);
  // La migración es de este tramo y lo dice.
  assert(/PUBLIC-DIAGNOSTICS-01F/.test(SQL_CRUDO), "la migración no se identifica");
});

console.log(`\nPUBLIC-DIAGNOSTICS-01F · superficie: ${passed} en verde, ${failed} en rojo\n`);
process.exit(failed === 0 ? 0 : 1);
