/**
 * Trazaloop · QUALITY-06.1 · Puras y estáticas.
 *
 * Este micro-sprint cierra dos huecos, y los dos se pueden cerrar mal de una
 * forma muy concreta:
 *
 *   · el ONBOARDING, afirmando en un papel firmado cosas que la plataforma no
 *     puede demostrar —«documento leído», «onboarding completo»—;
 *   · el CONTEXTO de la evaluación, convirtiendo un indicador de proceso en una
 *     nota sobre la persona.
 *
 * Estas comprobaciones existen para que esas dos formas de fallar no quepan.
 * Ninguna toca base de datos ni red.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHECKLIST_MARK, CHECKLIST_STATES, CONTEXT_ATTRIBUTION_NOTICE, CONTEXT_DISCLAIMER,
  CONTEXT_KIND_LABEL, CONTEXT_KINDS, CONTEXT_TEMPORALITY_LABEL, countPending,
  describePending, KNOWLEDGE_ONBOARDING_LABEL, KNOWLEDGE_ONBOARDING_STATES,
  looksLikePersonScore, NO_READ_TRACKING_NOTICE, ONBOARDING_SOURCE_LABEL, periodIsInside,
  summarizeContext, type ContextLine,
} from "../../lib/domain/quality-onboarding";
import { EXPORT_INVENTORY, promisedKeys } from "../../lib/export/inventory";
import { renderPrintDocument } from "../../lib/export/render";
import type { PrintDocument } from "../../lib/export/print-model";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DOMAIN = read("lib/domain/quality-onboarding.ts");
const ONB_DB = read("lib/db/quality-onboarding.ts");
const CTX_DB = read("lib/db/quality-evaluation-context.ts");
const ONB_PDF = read("lib/export/adapters/quality-onboarding.ts");
const EVAL_PDF = read("lib/export/adapters/quality-development.ts");
const ONB_UI = read("components/domain/quality/people/onboarding.tsx");
const EVAL_UI = read("components/domain/quality/people/evaluation-detail.tsx");

let passed = 0, failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${name}: ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

console.log("\nQUALITY-06.1 · puras y estáticas\n");

// ---------------------------------------------------------------------------
console.log("A · El onboarding es DERIVADO: no hay dominio nuevo");

check("A1. este sprint no añadió ninguna migración propia", () => {
  // La comprobación original decía «ninguna migración por encima de 0124», que
  // era cierto ese día y deja de serlo en cuanto otro sprint añade esquema. Lo
  // que QUALITY-06.1 tiene que sostener es que SUS dos funcionalidades se
  // resolvieron sin esquema: no existe ninguna migración de onboarding ni de
  // contexto de evaluación. El contenido lo comprueba A2.
  // Solo las migraciones POSTERIORES a QUALITY-06: `0067` y `0069` son el
  // onboarding de la EMPRESA en la plataforma, del Sprint 10D, y no tienen
  // nada que ver con el de una persona en un cargo.
  const files = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) > 124);
  const mias = files.filter((f) => /onboarding|evaluation[_-]context|contexto/i.test(f));
  assert(mias.length === 0,
    `QUALITY-06.1 debía resolverse sin esquema y apareció: ${mias.join(", ")}`);
});

check("A2. no existe ninguna tabla ni columna de onboarding", () => {
  const sql = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => read(join("supabase/migrations", f)))
    .join("\n");
  assert(!/create table (?:if not exists )?public\.\w*onboarding\w*/i.test(sql),
    "se creó una tabla de onboarding");
  // `v_organization_onboarding_status` viene del Sprint 10D y es el onboarding
  // de la EMPRESA en la plataforma, no el de una persona en un cargo. Lo que
  // este sprint no puede crear es estado de onboarding de personas.
  const nuevo = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) >= 123)
    .map((f) => read(join("supabase/migrations", f)))
    .join("\n");
  assert(!/onboarding/i.test(nuevo),
    "una migración de QUALITY-06 guarda algo de onboarding");
});

check("A3. el onboarding se compone con lecturas de QUALITY-06, no con datos propios", () => {
  // Las tablas que consulta tienen que ser TODAS de QUALITY-06 o anteriores.
  const tablas = [...ONB_DB.matchAll(/\.from\("(\w+)"\)/g)].map((m) => m[1]);
  assert(tablas.length >= 8, `el onboarding solo consulta ${tablas.length} tablas`);
  for (const t of tablas) {
    assert(!/onboarding/i.test(t), `consulta una tabla propia de onboarding: ${t}`);
  }
  assert(tablas.includes("quality_position_assignments"), "no parte de la asignación");
  assert(tablas.includes("quality_processes"), "no deriva los procesos");
  assert(tablas.includes("trazadoc_documents"), "no deriva los documentos");
  assert(tablas.includes("work_tasks"), "no muestra las tareas reales");
});

check("A4. ninguna escritura: el onboarding solo lee", () => {
  const src = stripTs(ONB_DB);
  for (const verbo of [".insert(", ".update(", ".delete(", ".upsert("]) {
    assert(!src.includes(verbo), `el onboarding escribe con ${verbo}`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nB · El perfil aplicable es el de la FECHA, no el último");

check("B1. el perfil se resuelve por la fecha efectiva de la asignación", () => {
  assert(/quality_position_version_on/.test(ONB_DB),
    "el onboarding no pregunta qué perfil regía en esa fecha");
  const bloque = ONB_DB.slice(ONB_DB.indexOf("const asOf ="), ONB_DB.indexOf("const versions ="));
  assert(/asOf = asg\.effective_from/.test(bloque),
    "la fecha de referencia no es la de la asignación");
  assert(/p_on: asOf/.test(bloque), "el perfil no se pide para esa fecha");
});

check("B2. y la competencia demostrada también se lee EN esa fecha", () => {
  const bloque = ONB_DB.slice(ONB_DB.indexOf("async function onboardingCompetencies"));
  assert(/quality_demonstrated_level_on/.test(bloque),
    "lo demostrado no se lee por fecha");
  assert(/p_on: asOf/.test(bloque), "lo demostrado se lee de hoy en vez de entonces");
});

check("B3. cuando hoy rige otro perfil, se DISTINGUE en vez de sustituirlo", () => {
  assert(/currentRequiredLevel/.test(ONB_DB), "no hay columna para la expectativa de hoy");
  const bloque = ONB_DB.slice(ONB_DB.indexOf("async function onboardingCompetencies"));
  // Lo de entonces se conserva; lo de hoy va en OTRA propiedad.
  assert(/requiredLevel: r\.requiredLevel/.test(bloque),
    "el nivel exigido entonces se sustituyó por el de hoy");
  assert(/Hoy se exige/.test(ONB_UI) && /Hoy se exige/.test(ONB_PDF),
    "la pantalla o el papel no distinguen la expectativa vigente");
});

// ---------------------------------------------------------------------------
console.log("\nC · Solo relaciones REALES");

check("C1. los procesos salen de dos relaciones existentes y de ninguna regla inventada", () => {
  const bloque = ONB_DB.slice(
    ONB_DB.indexOf("async function onboardingProcesses"),
    ONB_DB.indexOf("async function onboardingDocuments")
  );
  assert(/owner_position_id/.test(bloque), "no usa la propiedad del proceso");
  assert(/functions\.map\(\(f\) => f\.processId\)/.test(bloque),
    "no usa los procesos que nombra el perfil");
});

check("C2. los documentos NO se sacan de «todos deben leer todo»", () => {
  const bloque = ONB_DB.slice(
    ONB_DB.indexOf("async function onboardingDocuments"),
    ONB_DB.indexOf("async function onboardingCompetencies")
  );
  assert(/owner_position_id/.test(bloque), "no usa los documentos del cargo");
  assert(/quality_process_documents/.test(bloque), "no usa la relación proceso–documento");
  // Si consultara documentos sin filtrar por una relación, aparecería un
  // `.from("trazadoc_documents")` sin `in(` ni `eq(` de relación.
  const consultas = [...bloque.matchAll(/\.from\("trazadoc_documents"\)[\s\S]{0,300}?;/g)]
    .map((m) => m[0]);
  for (const c of consultas) {
    assert(/\.eq\("owner_position_id"|\.in\("id"/.test(c),
      "hay una consulta de documentos sin relación que la limite");
  }
});

check("C3. y cada fila dice POR QUÉ aparece", () => {
  for (const [k, v] of Object.entries(ONBOARDING_SOURCE_LABEL)) {
    assert(v.length > 5, `el motivo «${k}» no explica nada`);
  }
  assert(/ONBOARDING_SOURCE_LABEL/.test(ONB_UI) && /ONBOARDING_SOURCE_LABEL/.test(ONB_PDF),
    "la pantalla o el papel no dicen por qué aparece cada fila");
});

check("C4. el conocimiento se limita a los procesos del cargo", () => {
  const bloque = ONB_DB.slice(
    ONB_DB.indexOf("async function onboardingKnowledge"),
    ONB_DB.indexOf("async function onboardingTasks")
  );
  assert(/if \(processIds\.length === 0\) return \[\]/.test(bloque),
    "sin procesos debería no haber conocimiento relevante, y lo hay");
  assert(/\.in\("process_id", processIds\)/.test(bloque),
    "el conocimiento no se filtra por los procesos del cargo");
});

// ---------------------------------------------------------------------------
console.log("\nD · El checklist no afirma lo que no se puede demostrar");

check("D1. no existe ninguna casilla de «documento leído»", () => {
  const todo = [DOMAIN, ONB_DB, ONB_UI, ONB_PDF].map(stripTs).join("\n");
  assert(!/le[íi]do|read_confirmed|acknowledged_document|confirmaci[óo]n de lectura.*\bdone\b/i
    .test(todo.replace(NO_READ_TRACKING_NOTICE, "")),
    "aparece un check de documento leído");
  assert(NO_READ_TRACKING_NOTICE.length > 40, "no se explica por qué no hay check de lectura");
  assert(ONB_UI.includes("NO_READ_TRACKING_NOTICE") && ONB_PDF.includes("NO_READ_TRACKING_NOTICE"),
    "el aviso no se muestra en pantalla o en papel");
});

check("D2. los documentos son informativos, no pendientes", () => {
  assert(CHECKLIST_STATES.includes("informational"),
    "falta el estado que distingue información de pendiente");
  const bloque = ONB_DB.slice(ONB_DB.indexOf("function buildChecklist"));
  assert(/state: "informational"[\s\S]{0,200}documento/i.test(bloque),
    "los documentos se cuentan como pendientes");
  // Y no entran en el recuento.
  const p = countPending({
    competencyGaps: 1, developmentOpen: 0, knowledgeToReceive: 0, openTasks: 0,
  });
  assert(p.total === 1, "el recuento de pendientes no cuadra");
});

check("D3. no se declara el onboarding «completo» ni «incompleto»", () => {
  const todo = [DOMAIN, ONB_DB, ONB_UI, ONB_PDF].map(stripTs).join("\n");
  assert(!/onboarding_?(completo|complete|incompleto|incomplete)/i.test(todo),
    "se inventó un estado agregado de completitud");
  assert(describePending(countPending({
    competencyGaps: 0, developmentOpen: 0, knowledgeToReceive: 0, openTasks: 0,
  })) === "Sin pendientes del sistema de gestión.",
    "el texto de «sin pendientes» no es el esperado");
  const con = describePending(countPending({
    competencyGaps: 2, developmentOpen: 1, knowledgeToReceive: 0, openTasks: 3,
  }));
  assert(con.includes("6") && con.includes("brecha") && con.includes("tarea"),
    `el recuento no se explica: ${con}`);
});

check("D4. cada línea del checklist declara de qué entidad sale", () => {
  const bloque = ONB_DB.slice(ONB_DB.indexOf("function buildChecklist"));
  const lineas = [...bloque.matchAll(/state: "(\w+)"/g)].length;
  const origenes = [...bloque.matchAll(/origin:/g)].length;
  assert(lineas > 0 && origenes >= lineas,
    `${lineas} líneas de checklist y solo ${origenes} declaran su origen`);
  for (const s of CHECKLIST_STATES) {
    assert(CHECKLIST_MARK[s].length > 0, `el estado «${s}» no tiene marca visible`);
  }
});

check("D5. el onboarding no crea tareas ni desarrollo por su cuenta", () => {
  const src = stripTs(ONB_DB);
  assert(!/work_tasks[\s\S]{0,120}\.insert/.test(src),
    "el onboarding fabrica una tarea por cada línea que muestra");
  // Crear la necesidad de desarrollo SÍ existe, pero como acción humana en la
  // pantalla, no como efecto de abrirla.
  assert(/createNeedAction/.test(ONB_UI), "no se ofrece crear la necesidad a mano");
  assert(!/createNeedAction/.test(ONB_DB), "la capa de datos crea desarrollo sola");
});

// ---------------------------------------------------------------------------
console.log("\nE · Onboarding ≠ recursos humanos");

check("E1. no aparece nada de nómina, contrato, salario ni salud", () => {
  const todo = [ONB_DB, ONB_UI, ONB_PDF].map(stripTs).join("\n").toLowerCase();
  for (const prohibido of ["salario", "salary", "nómina", "nomina", "payroll", "contrato laboral",
                           "beneficios", "médico", "medico", "disciplinar"]) {
    assert(!todo.includes(prohibido), `el onboarding menciona «${prohibido}»`);
  }
});

check("E2. funciona sin cuenta de Trazaloop", () => {
  // La consulta de tareas cae al filtro por cargo cuando no hay perfil.
  const bloque = ONB_DB.slice(ONB_DB.indexOf("async function onboardingTasks"));
  assert(/profileId\s*\n?\s*\?/.test(bloque) || /profileId$/m.test(bloque)
    || /const filtro = profileId/.test(bloque),
    "el onboarding asume que la persona tiene cuenta");
  assert(/hasAccount/.test(ONB_DB), "no se distingue si la persona tiene cuenta");
  assert(/sin cuenta de Trazaloop/i.test(ONB_UI) && /sin cuenta de Trazaloop/i.test(ONB_PDF),
    "no se dice en pantalla ni en papel que la persona no tiene cuenta");
});

// ---------------------------------------------------------------------------
console.log("\nF · El contexto INFORMA; no decide");

check("F1. el aviso existe, es explícito y aparece en pantalla y en papel", () => {
  assert(/No determina/i.test(CONTEXT_DISCLAIMER), "el aviso no dice que no determina nada");
  assert(EVAL_UI.includes("CONTEXT_DISCLAIMER"), "la pantalla no muestra el aviso");
  assert(EVAL_PDF.includes("CONTEXT_DISCLAIMER"), "el PDF no lleva el aviso");
  assert(/miden PROCESOS, no personas/.test(CONTEXT_ATTRIBUTION_NOTICE),
    "no se explica que los indicadores miden procesos");
  assert(EVAL_UI.includes("CONTEXT_ATTRIBUTION_NOTICE")
    && EVAL_PDF.includes("CONTEXT_ATTRIBUTION_NOTICE"),
    "la explicación de no atribución falta en pantalla o en papel");
});

check("F2. el puente es SIEMPRE Persona → Asignación → Cargo → Proceso", () => {
  assert(/if \(!ev\.position_id\)/.test(CTX_DB),
    "sin cargo debería no haber contexto de proceso, y lo hay");
  const bloque = CTX_DB.slice(CTX_DB.indexOf("const { data: procesos }"));
  assert(/\.eq\("owner_position_id", ev\.position_id\)/.test(bloque),
    "los procesos no se derivan del cargo evaluado");
  // Y nunca se busca un indicador por persona.
  assert(!/quality_indicators[\s\S]{0,200}person_id/.test(CTX_DB),
    "se vincula un indicador directamente a una persona");
});

check("F3. no existe ningún puntaje, promedio ni ranking", () => {
  // Se busca el DATO, no la palabra: `looksLikePersonScore` es precisamente el
  // detector, y prohibir su nombre habría prohibido documentar la prohibición.
  const todo = [DOMAIN, CTX_DB, EVAL_UI, EVAL_PDF].map(stripTs).join("\n")
    .replace(/looksLikePersonScore/g, "");
  assert(!/operational_score|employee_score|risk_score_for_person|personScore/i.test(todo),
    "aparece un puntaje de la persona");
  assert(!/\.reduce\([^)]*=>\s*[a-z]+\s*\+\s*[a-z]/i.test(CTX_DB),
    "el contexto agrega valores en un número");
  // El resumen cuenta HECHOS por tono; no combina nada.
  const lines: ContextLine[] = [
    { kind: "indicator", subject: "Proceso X", label: "IND-1", value: "82",
      temporality: "period", tone: "bad" },
    { kind: "action", subject: "Cargo Y", label: "AC-1", value: "Completada",
      temporality: "period", tone: "good" },
  ];
  const r = summarizeContext(lines);
  assert(r.good === 1 && r.bad === 1 && r.total === 2, "el recuento de contexto no cuadra");
  assert(!looksLikePersonScore(lines), "el detector de puntajes no reconoce lo correcto");
  assert(looksLikePersonScore([
    { ...lines[0], label: "Puntaje del empleado" },
  ]), "el detector de puntajes no detectaría uno de verdad");
});

check("F4. cada línea habla de un PROCESO o de un CARGO, nunca de la persona", () => {
  // El sujeto se construye siempre con «Proceso …» o «Cargo …».
  const sujetos = [...CTX_DB.matchAll(/subject:\s*([^,\n]+)/g)].map((m) => m[1]);
  assert(sujetos.length >= 5, `solo ${sujetos.length} líneas declaran sujeto`);
  for (const s of sujetos) {
    assert(/Proceso|Cargo|Objetivo|sujeto|Desarrollo de la persona evaluada|Competencia de la persona evaluada/.test(s),
      `un sujeto de contexto no nombra un proceso ni un cargo: ${s}`);
  }
  // Y en la interfaz el sujeto va PRIMERO en la fila.
  assert(/l\.subject,\s*\n\s*l\.label/.test(EVAL_UI.replace(/\/\/.*$/gm, "")),
    "la pantalla no pone el sujeto delante");
});

check("F5. ninguna capa del contexto usa la clave de servicio", () => {
  for (const [nombre, src] of [["contexto", CTX_DB], ["onboarding", ONB_DB]] as const) {
    assert(!/service_role|SERVICE_ROLE|createAdminClient/.test(stripTs(src)),
      `la capa de ${nombre} usa la clave de servicio`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nG · El periodo evaluado, y no el de hoy");

check("G1. los indicadores se leen por mediciones DENTRO del periodo", () => {
  assert(periodIsInside({ start: "2027-01-01", end: "2027-03-31" },
                        { start: "2027-01-01", end: "2027-12-31" }),
    "una medición del periodo se declara fuera");
  assert(!periodIsInside({ start: "2028-01-01", end: "2028-03-31" },
                         { start: "2027-01-01", end: "2027-12-31" }),
    "una medición posterior se declara dentro");
  assert(/periodIsInside/.test(CTX_DB), "el contexto no filtra por periodo");
});

check("G2. sin mediciones en el periodo se DICE, no se rellena con el valor de hoy", () => {
  assert(/Sin mediciones en el periodo evaluado/.test(CTX_DB),
    "no hay un texto para el caso sin mediciones");
  // Y el valor de hoy nunca entra como si fuera del periodo.
  assert(!/last_value/.test(CTX_DB),
    "el contexto usa el último valor conocido en vez de las mediciones del periodo");
});

check("G3. lo que no se puede reconstruir se marca «Estado actual»", () => {
  assert(CONTEXT_TEMPORALITY_LABEL.current === "Estado actual",
    "la etiqueta de estado actual cambió");
  const bloque = CTX_DB.slice(CTX_DB.indexOf("v_quality_risk_overview"));
  assert(/temporality: "current"/.test(bloque),
    "los riesgos se presentan como si fueran del periodo evaluado");
  assert(EVAL_UI.includes("CONTEXT_TEMPORALITY_LABEL")
    && EVAL_PDF.includes("CONTEXT_TEMPORALITY_LABEL"),
    "la temporalidad no se imprime");
});

check("G4. las acciones y los casos se filtran por sus fechas del periodo", () => {
  assert(/fecha < period\.start \|\| fecha > period\.end/.test(CTX_DB),
    "las acciones no se filtran por el periodo");
  assert(/d < period\.start \|\| d > period\.end/.test(CTX_DB),
    "los casos no se filtran por el periodo");
});

// ---------------------------------------------------------------------------
console.log("\nH · Contexto equilibrado, no expediente");

check("H1. hay tonos favorable y desfavorable, y fuentes de los dos", () => {
  assert(/"good"/.test(CTX_DB) && /"bad"/.test(CTX_DB),
    "el contexto solo tiene un signo");
  // Fuentes explícitamente positivas: desarrollo hecho y competencia declarada.
  assert(/kind: "learning"/.test(CTX_DB), "no se muestra el desarrollo realizado");
  assert(/kind: "competence"/.test(CTX_DB), "no se muestra la competencia declarada");
  assert(/completada \? "good"/.test(CTX_DB.replace(/\s+/g, " "))
    || /completada\s*\?\s*"good"/.test(CTX_DB),
    "una acción completada no cuenta como contexto favorable");
});

check("H2. las siete clases de contexto tienen etiqueta legible", () => {
  for (const k of CONTEXT_KINDS) {
    assert(CONTEXT_KIND_LABEL[k] && CONTEXT_KIND_LABEL[k].length > 5,
      `la clase «${k}» se pintaría sin etiqueta`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nI · El contexto no toca el resultado");

check("I1. la capa de contexto no escribe NADA", () => {
  const src = stripTs(CTX_DB);
  for (const verbo of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc("]) {
    assert(!src.includes(verbo), `el contexto escribe o ejecuta con ${verbo}`);
  }
});

check("I2. ninguna migración deriva el resultado de un indicador", () => {
  const sql = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => read(join("supabase/migrations", f)))
    .join("\n");
  // No puede existir un disparador que toque la evaluación desde mediciones.
  assert(!/quality_performance_(evaluations|items)[\s\S]{0,200}quality_measurements/i.test(sql),
    "hay una relación automática entre mediciones y evaluaciones");
  assert(!/update quality_performance_items[\s\S]{0,200}indicator/i.test(sql),
    "un indicador modificaría el resultado de una línea de evaluación");
});

check("I3. cerrar una evaluación sigue exigiendo decisión humana", () => {
  const sql = read("supabase/migrations/0123_quality_people_competence_knowledge.sql");
  const rpc = sql.slice(
    sql.indexOf("function public.quality_close_performance_evaluation"),
    sql.indexOf("revoke all on function public.quality_close_performance_evaluation")
  );
  assert(/evaluator_person_id is null/.test(rpc), "se puede cerrar sin evaluador");
  assert(/v_items = 0/.test(rpc), "se puede cerrar sin criterios");
  assert(!/quality_measurements|quality_indicators/.test(rpc),
    "el cierre mira datos operacionales");
});

// ---------------------------------------------------------------------------
console.log("\nJ · Privacidad");

check("J1. el contexto se niega si RLS no entrega la evaluación", () => {
  const bloque = CTX_DB.slice(CTX_DB.indexOf("export async function getEvaluationContext"));
  assert(/if \(!ev\) return null;/.test(bloque),
    "el contexto se arma aunque no se pueda leer la evaluación");
});

check("J2. la ruta de la evaluación responde 404 cuando no se puede ver", () => {
  const page = read("app/(app)/(shell)/quality/people/performance/[evaluationId]/page.tsx");
  assert(/if \(!evaluation\) notFound\(\);/.test(page),
    "la página no responde 404 cuando RLS niega la evaluación");
  // Y el contexto se pide DESPUÉS de comprobarla.
  // Se compara con la LLAMADA, no con el import, que va siempre arriba.
  assert(page.indexOf("notFound()") < page.indexOf("await getEvaluationContext("),
    "el contexto se calcula antes de comprobar el permiso");
});

check("J3. el onboarding comprueba que la persona de la ruta sea la de la asignación", () => {
  const page = read(
    "app/(app)/(shell)/quality/people/[personId]/onboarding/[assignmentId]/page.tsx"
  );
  assert(/view\.person\.id !== personId/.test(page),
    "se puede abrir el onboarding de alguien desde la ficha de otra persona");
  assert(/notFound\(\)/.test(page), "no responde 404");
});

check("J4. el onboarding depende de poder leer la ficha de la persona", () => {
  const bloque = ONB_DB.slice(ONB_DB.indexOf("export async function getOnboarding"));
  assert(/from\("quality_people"\)[\s\S]{0,400}if \(!person\) return null;/.test(bloque),
    "el onboarding no depende del círculo de privacidad de la ficha");
});

check("J5. el papel de la evaluación separa resultado y contexto", () => {
  assert(/pageBreak/.test(EVAL_PDF),
    "el contexto no está separado del resultado en el PDF");
  const i = EVAL_PDF.indexOf("Resultado de la evaluación") >= 0
    ? EVAL_PDF.indexOf("Contra qué se evaluó") : 0;
  assert(i < EVAL_PDF.indexOf("Contexto del sistema de gestión"),
    "el contexto aparece antes que el resultado");
});

// ---------------------------------------------------------------------------
console.log("\nK · Contrato de exportación");

check("K1. el onboarding tiene su clave y su nombre documental", () => {
  assert(/key: "quality\.onboarding\.detail"/.test(ONB_PDF), "falta la clave");
  assert(/documentName: "Onboarding del sistema de gestión"/.test(ONB_PDF),
    "el nombre documental no es el que pide el encargo");
  assert(read("lib/export/registry.ts").includes("qualityOnboardingDetail"),
    "el registro no lo conoce: la descarga respondería 404");
});

check("K2. el adaptador no dibuja su propio PDF ni escribe el encabezado", () => {
  assert(!/PdfWriter|new PdfLayout/.test(ONB_PDF), "dibuja su propio PDF");
  assert(!/\bbuffer\s*:/.test(ONB_PDF), "devuelve bytes en vez de un modelo de impresión");
  const nombres = [...ONB_PDF.matchAll(/documentName\s*:/g)].length;
  assert(nombres === 1, `declara ${nombres} nombres documentales para una exportación`);
});

check("K3. el inventario clasifica el onboarding en los tres ejes", () => {
  const fila = EXPORT_INVENTORY.find((r) => r.entity === "Onboarding del sistema de gestión");
  assert(fila, "el onboarding no está en el inventario");
  assert(fila!.detail.state === "AVAILABLE", "la ficha del onboarding no está disponible");
  assert(fila!.list.state === "NOT_APPLICABLE", "el eje de listado no está resuelto");
  assert(fila!.historical.state === "HISTORICAL_NOT_SUPPORTED",
    "el eje histórico no está resuelto");
  assert("reason" in fila!.historical && fila!.historical.reason.length > 60,
    "el motivo del eje histórico no explica nada");
  assert(promisedKeys().includes("quality.onboarding.detail"),
    "el inventario no promete la clave");
});

check("K4. Q06 y Q06.1 no dejan ninguna entidad pendiente", () => {
  for (const r of EXPORT_INVENTORY) {
    for (const axis of [r.detail, r.list, r.historical]) {
      assert(
        ["AVAILABLE", "EMBEDDED", "NOT_APPLICABLE", "HISTORICAL_NOT_SUPPORTED"].includes(axis.state),
        `${r.entity} tiene un eje sin resolver`
      );
    }
  }
});

// ---------------------------------------------------------------------------
console.log("\nL · Los PDF de verdad");

function pagesText(bytes: Buffer): string[] {
  const raw = bytes.toString("latin1");
  return [...raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
    .map((m) => m[1])
    .filter((x) => x.includes("Tj"))
    .map((x) => [...x.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)]
      .map((m) => m[1].replace(/\\([()\\])/g, "$1")).join(" "));
}

function baseDoc(over: Partial<PrintDocument>): PrintDocument {
  return {
    documentName: "Documento", recordType: "Registro", title: "Título",
    organization: { name: "Industrias Ejemplo", legalName: null, taxId: null, logo: null },
    systemLine: "Trazaloop Quality · personas y competencia",
    orientation: "portrait", generatedAt: "2026-08-26T10:00:00.000Z",
    sections: [], ...over,
  };
}

check("L1. el onboarding lleva el encabezado obligatorio en TODAS las páginas", () => {
  const filas = Array.from({ length: 45 }, (_, i) => [
    `Documento PROC-${String(i + 1).padStart(2, "0")}`, `PR-${i + 1}`,
    "Por un proceso del cargo · Gestión de Compras",
  ]);
  const bytes = renderPrintDocument(baseDoc({
    documentName: "Onboarding del sistema de gestión",
    recordType: "Onboarding", title: "Ana Pérez · Coordinador de Calidad",
    sections: [
      { title: "Documentos que debe conocer", blocks: [{
        type: "table",
        columns: [
          { header: "Documento", width: 5 }, { header: "Código", width: 2 },
          { header: "Por qué aparece", width: 4 },
        ],
        rows: filas,
      }] },
      { title: null, blocks: [{ type: "note", text: NO_READ_TRACKING_NOTICE }] },
    ],
  }));
  const paginas = pagesText(bytes);
  assert(paginas.length > 1, "45 documentos cupieron en una página: la tabla no se dibujó");
  for (const [i, p] of paginas.entries()) {
    assert(p.includes("Industrias Ejemplo"), `la página ${i + 1} perdió la empresa`);
    assert(p.toUpperCase().includes("ONBOARDING DEL SISTEMA DE GESTIÓN".normalize("NFC"))
      || p.toUpperCase().includes("ONBOARDING DEL SISTEMA DE GESTI"),
      `la página ${i + 1} perdió el nombre documental`);
  }
  const texto = paginas.join(" ");
  assert(/no registra confirmaci/i.test(texto),
    "el papel no dice que no se registra confirmación de lectura");
});

check("L2. el PDF de evaluación separa físicamente resultado y contexto", () => {
  const bytes = renderPrintDocument(baseDoc({
    documentName: "Evaluación de desempeño", recordType: "Evaluación de desempeño",
    title: "Carlos López",
    sections: [
      { title: "Contra qué se evaluó", blocks: [{
        type: "table",
        columns: [{ header: "Criterio", width: 5 }, { header: "Resultado", width: 3 }],
        rows: [["Cierre de hallazgos en plazo", "Cumple parcialmente"]],
      }] },
      { title: null, blocks: [{ type: "pageBreak" }] },
      { title: "Contexto del sistema de gestión", blocks: [
        { type: "note", text: CONTEXT_DISCLAIMER },
        { type: "note", text: CONTEXT_ATTRIBUTION_NOTICE },
      ] },
      { title: "Indicadores de los procesos del cargo", blocks: [{
        type: "table",
        columns: [
          { header: "De qué habla", width: 3 }, { header: "Qué", width: 4 },
          { header: "Dato", width: 3 }, { header: "Cuándo", width: 2 },
        ],
        rows: [["Proceso Gestión de Compras", "IND-01 · Cumplimiento de entregas",
                "82 % — Meta: 95 %", "Del periodo evaluado"]],
      }] },
    ],
  }));
  const paginas = pagesText(bytes);
  assert(paginas.length >= 2, "el contexto no quedó en otra página");
  assert(paginas[0].includes("Cierre de hallazgos"), "el resultado no está en la primera página");
  assert(!paginas[0].includes("Contexto del sistema"),
    "el contexto se coló en la página del resultado");
  const contexto = paginas.slice(1).join(" ");
  assert(/No determina/.test(contexto), "el contexto no lleva su aviso");
  assert(/Proceso Gestión de Compras/.test(contexto),
    "el dato no dice de qué proceso habla");
  assert(!/Desempeño de/.test(contexto), "el papel atribuye el indicador a la persona");
});

// ---------------------------------------------------------------------------
console.log("\nM · Alcanzabilidad y navegación");

check("M1. el onboarding se abre desde la ficha de persona y desde el cargo", () => {
  const ficha = read("components/domain/quality/people/person-file.tsx");
  assert(/onboarding\/\$\{a\.id\}/.test(ficha),
    "la ficha de persona no enlaza el onboarding de cada asignación");
  const cargo = read("components/domain/quality/people/position-profile.tsx");
  assert(/onboarding\/\$\{o\.assignmentId\}/.test(cargo),
    "la ficha del cargo no enlaza el onboarding de sus ocupantes");
});

check("M2. la evaluación tiene ficha propia y se llega desde el listado", () => {
  const lista = read("components/domain/quality/people/performance.tsx");
  assert(/\/quality\/people\/performance\/\$\{e\.id\}/.test(lista),
    "el listado de desempeño no lleva a la ficha de la evaluación");
});

check("M3. el botón de descarga del onboarding existe en la pantalla", () => {
  assert(/exportKey="quality\.onboarding\.detail"/.test(ONB_UI),
    "la pantalla no ofrece la descarga: la exportación sería inalcanzable");
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
