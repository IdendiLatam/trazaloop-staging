/**
 * Trazaloop · QUALITY-11 · Puras y estáticas.
 *
 * Comprueban que las SIETE separaciones existan EN EL CÓDIGO, y no solamente
 * en la prosa del informe:
 *
 *   EVENTO ≠ OBSERVACIÓN
 *   OBSERVACIÓN ≠ SEÑAL
 *   SEÑAL ≠ ALERTA
 *   ALERTA ≠ TAREA
 *   TAREA ≠ ACCIÓN
 *   CONDICIÓN ≠ DECISIÓN
 *   AUTOMATIZACIÓN DETERMINÍSTICA ≠ IA
 *
 * y que lo que esta capa NO puede ser —un segundo motor de tareas, un segundo
 * motor de alertas, una bitácora paralela, un intérprete de SQL enviado por el
 * cliente, o un modelo de lenguaje disfrazado de regla— no se haya colado por
 * una tabla, un enum, una cadena de texto o una llamada a la red.
 *
 * Los bloques que más importan:
 *
 *   · D · el evaluador: catorce operadores y NINGUNA construcción dinámica;
 *   · G · idempotencia: el índice único parcial es lo que hace imposible el
 *     duplicado bajo concurrencia, y su predicado es lo que permite rearmar;
 *   · J · los bucles: NINGUNA fuente observa lo que la automatización produce,
 *     así que el grafo tiene profundidad uno por construcción;
 *   · K · las nueve decisiones formales que la automatización no toma, buscadas
 *     como escrituras reales dentro del motor;
 *   · N · el anonimato de QUALITY-08, que no se rompe ni con una regla.
 *
 * Ninguna toca base de datos ni red.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACKNOWLEDGE_IS_NOT_RESOLVE, ALERT_IS_NOT_A_TASK, AUTOMATION_DOMAINS,
  AUTOMATION_IS_NOT_AI, AUTONOMY_LEVELS, AUTONOMY_LEVEL_MEANING,
  BUSINESS_DAY_IS_LOCAL, canManageAutomation, canPublishAutomation, canReadAutomation,
  CLOCK_IS_SERVER_SIDE, CONDITION_IS_NOT_A_DECISION, CUSTOMER_ANONYMITY_HOLDS,
  DEACTIVATION_KEEPS_HISTORY, describeCondition, describeRule, describeRun,
  EVENT_IS_NOT_STATE, explanationLines, FAILURE_IS_ISOLATED, FORBIDDEN_OUTPUTS,
  IDEMPOTENT_AND_REARMS, INTEGER_OPERATORS, LIST_OPERATORS, LOOPS_ARE_IMPOSSIBLE,
  NO_EMPLOYEE_SURVEILLANCE, NO_LEVEL_DECIDES, OBSERVATION_IS_NOT_A_SIGNAL,
  ONE_ENGINE, OPERATORS, OPERATOR_SEMANTICS, operatorValueShape, OUTPUT_KINDS,
  PUBLISHED_IS_NOT_ACTIVE, QUALITY_BY_OBSERVATION, RECIPIENT_IS_STRUCTURAL,
  RECIPIENT_KINDS, ruleCreatesAction, ruleMakesFormalDecision, RULE_STATUSES,
  RUN_COUNTS_WHAT_IT_CREATED, RUN_KINDS, SEVERITIES, SIGNAL_IS_NOT_AN_ALERT,
  SIGNAL_STATUSES, SIMULATION_CREATES_NOTHING, simulationOutputs, SNAPSHOT_IS_MINIMAL,
  SEVERITY_IS_DECLARED, SUPPRESSION_IS_NOT_RESOLUTION, TASK_IS_NOT_AN_ACTION,
  usesArtificialIntelligence, VALUELESS_OPERATORS,
  validateConditions, validateOutputs, VERSION_IS_FROZEN, VERSION_STATUSES,
} from "../../lib/domain/quality-automation";
import { EXPORT_INVENTORY, promisedKeys } from "../../lib/export/inventory";
import {
  ALERT_TYPES, SUBJECT_TYPES, TASK_TYPES,
} from "../../lib/domain/work-inbox";
import { LIFECYCLE_ENTITIES } from "../../lib/domain/lifecycle";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
/** Sin esto, una prueba que busca «IA» falla justamente por el comentario que
 *  explica que NO se implementa IA. */
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MIG = "supabase/migrations/0129_quality_automation_observation.sql";
/** La corrección posterior a Staging (§158): append-only, nunca editando 0129. */
const MIG_FIX = "supabase/migrations/0130_quality_automation_scheduled_observers.sql";
const SQL = stripSql(read(MIG));
const RAW_SQL = read(MIG);
const SQL_FIX = stripSql(read(MIG_FIX));
const DOMAIN = read("lib/domain/quality-automation.ts");
const DB = read("lib/db/quality-automation.ts");
const ACTIONS = read("server/actions/quality-automation.ts");
const ADAPTERS = read("lib/export/adapters/quality-automation.ts");
const RUNNER = read("app/api/automation/run/route.ts");

const COMPONENTS_DIR = "components/domain/quality/automation";
const componentFiles = readdirSync(join(ROOT, COMPONENTS_DIR)).filter((f) => f.endsWith(".tsx"));
const COMPONENTS = componentFiles.map((f) => read(join(COMPONENTS_DIR, f))).join("\n");

const ROUTES_DIR = "app/(app)/(shell)/quality/automation";
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...walk(join(dir, e.name)));
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(join(dir, e.name));
  }
  return out;
}
const ROUTES = walk(ROUTES_DIR).map((f) => read(f)).join("\n");

let passed = 0, failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${name}: ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

function tableBody(name: string): string {
  const i = SQL.indexOf(`create table public.${name} (`);
  assert(i >= 0, `no existe la tabla ${name}`);
  const rest = SQL.slice(i);
  return rest.slice(0, rest.indexOf("\n);"));
}

function functionBody(name: string): string {
  const i = SQL.indexOf(`function public.${name}`);
  assert(i >= 0, `no existe la función ${name}`);
  const rest = SQL.slice(i);
  return rest.slice(0, rest.indexOf("$$;") + 3);
}

/** El cuerpo del motor, que es donde vive casi todo lo que hay que vigilar. */
/** El motor VIGENTE vive en la 0130: es la última que lo reescribe. */
const RUN = (() => {
  const i = SQL_FIX.indexOf("function public.quality_automation_run");
  assert(i >= 0, "la 0130 no reescribe el motor");
  const rest = SQL_FIX.slice(i);
  return rest.slice(0, rest.indexOf("$$;") + 3);
})();
const SUBJECTS = functionBody("quality_automation_subjects");
const CHECKER = functionBody("quality_automation_check");
const EVALUATOR = functionBody("quality_automation_evaluate");
const SIMULATE = functionBody("quality_automation_simulate");
const VALIDATE = functionBody("quality_automation_validate_version");

console.log("\nQUALITY-11 · puras y estáticas\n");

// ---------------------------------------------------------------------------
console.log("A · EL CATÁLOGO OBSERVABLE (§27, §28, §29, AT-05)");

check("A1. las fuentes son un catálogo TIPADO, no un nombre de tabla", () => {
  const t = tableBody("quality_automation_sources");
  assert(/code\s+text/.test(t), "la fuente no tiene código propio");
  assert(/domain\s+text/.test(t) && /subject_type\s+text/.test(t),
    "la fuente no declara dominio ni tipo de sujeto");
  // Lo importante es lo que NO tiene: la fuente no guarda la tabla ni la
  // columna que hay detrás. Si las guardara, alguien acabaría concatenándolas.
  assert(!/table_name|column_name|sql_expression|query\s+text/.test(t),
    "el catálogo de fuentes guarda nombres de tabla o columna: eso es SQL dinámico esperando a ocurrir");
});

check("A2. hay 18 fuentes sembradas y cubren los diez dominios", () => {
  const bloque = SQL.slice(SQL.indexOf("insert into public.quality_automation_sources"));
  const filas = bloque.slice(0, bloque.indexOf(";")).split("\n").filter((l) => /^\s*\('/.test(l));
  assert(filas.length === 18, `se sembraron ${filas.length} fuentes, no 18`);
  for (const d of ["documents", "indicators", "objectives", "cases", "actions", "risks",
                   "people", "suppliers", "customer", "audits", "management_review"]) {
    assert(bloque.includes(`'${d}'`), `ningún origen observa el dominio ${d}`);
  }
});

check("A3. cada campo declara tipo, operadores permitidos y, si aplica, sus valores", () => {
  const t = tableBody("quality_automation_source_fields");
  assert(/data_type\s+text\s+not null/.test(t), "un campo sin tipo no se puede validar");
  assert(/allowed_operators\s+text\[\]\s+not null/.test(t),
    "un campo sin operadores permitidos aceptaría cualquiera");
  assert(/enum_values\s+text\[\]/.test(t), "no hay dónde declarar los valores posibles");
  assert(/allowed_operators <@ array\[/.test(t.toLowerCase()),
    "los operadores permitidos no están acotados por el catálogo cerrado");
});

check("A4. los catálogos son de PLATAFORMA: ninguna empresa los edita", () => {
  const fuentes = tableBody("quality_automation_sources");
  assert(!/organization_id/.test(fuentes),
    "el catálogo de fuentes es por empresa: entonces una empresa podría inventarse una fuente");
  assert(/grant select on table public\.quality_automation_sources to authenticated/.test(SQL),
    "el catálogo no se puede leer");
  assert(/revoke all on table public\.quality_automation_sources from anon, authenticated/.test(SQL),
    "el catálogo no revoca los privilegios que Supabase concede por omisión");
  assert(!/grant (insert|update|delete)[^;]*quality_automation_sources/.test(SQL),
    "alguien puede escribir en el catálogo de fuentes");
});

check("A5. el cliente NUNCA envía tabla, columna, SQL ni cláusula where (§29)", () => {
  for (const [n, src] of [["acciones", ACTIONS], ["db", DB], ["componentes", COMPONENTS]] as const) {
    const code = stripTs(src);
    assert(!/table_name|column_name|\bwhere_clause\b|raw_sql|p_sql\b/.test(code),
      `${n}: se está enviando estructura de base de datos desde el cliente`);
  }
  // Lo que el formulario envía son TRIPLES del catálogo, y se rearman en el
  // servidor: campo, operador y valor. Nada más.
  assert(/condition_field/.test(ACTIONS) && /condition_operator/.test(ACTIONS)
    && /condition_value/.test(ACTIONS),
    "las condiciones no se rearman desde campos del catálogo");
});

check("A6. NO hay SQL dinámico en el proveedor de sujetos", () => {
  // Es la decisión que hace imposible la inyección: los sujetos se materializan
  // con consultas escritas a mano, y el evaluador solo lee `facts ->> campo`.
  assert(!/execute\s+format|execute\s+'|execute\s+v_/.test(SUBJECTS),
    "el proveedor de sujetos construye SQL en tiempo de ejecución");
  assert(!/execute\s+format|execute\s+'/.test(CHECKER + EVALUATOR),
    "el evaluador construye SQL en tiempo de ejecución");
  assert(/facts\s*->>|facts\s*->/.test(CHECKER),
    "el comparador no lee los hechos materializados");
});

check("A7. el único `execute` del motor invoca barridos del propio esquema", () => {
  const ejecuta = [...RUN.matchAll(/execute\s+format\([^)]*\)/g)].map((m) => m[0]);
  assert(ejecuta.length === 1, `hay ${ejecuta.length} construcciones dinámicas en el motor`);
  assert(/%I/.test(ejecuta[0]) && /\$1/.test(ejecuta[0]),
    "el nombre no se cualifica como identificador o el argumento no va parametrizado");
  // Y el nombre sale de una lista literal escrita en la migración, no de datos.
  assert(/foreach v_obs in array array\[/.test(RUN),
    "los observadores no salen de una lista literal");
});

// ---------------------------------------------------------------------------
console.log("\nB · REGLA, IDENTIDAD Y VERSIONADO (§21…§26, AT-08, AT-09)");

check("B1. la regla tiene identidad estable y la versión guarda el contenido", () => {
  const r = tableBody("quality_automation_rules");
  const v = tableBody("quality_automation_rule_versions");
  assert(/code\s+text/.test(r) && /name\s+text/.test(r), "la regla no tiene identidad propia");
  assert(!/conditions|outputs/.test(r),
    "la regla guarda condiciones: cambiarlas reescribiría el pasado");
  assert(/conditions\s+jsonb/.test(v) && /outputs\s+jsonb/.test(v),
    "la versión no guarda el contenido formal");
  assert(/version_number\s+integer/.test(v), "las versiones no se numeran");
});

check("B2. una versión publicada NO se edita, y la guarda vive en la base", () => {
  const g = functionBody("quality_automation_version_is_published");
  assert(/status\s*=\s*'published'|old\.status\s*(=|<>)/.test(g),
    "la guarda no distingue publicada de borrador");
  assert(/raise exception/.test(g), "la guarda no impide nada");
  assert(/before update on public\.quality_automation_rule_versions/.test(SQL),
    "la guarda no está enganchada a la tabla");
});

check("B3. publicar exige validar, y validar falla cerrado", () => {
  const p = functionBody("quality_automation_publish_version");
  assert(/quality_automation_validate_version/.test(p),
    "se puede publicar una versión sin validarla");
  assert(/exception when others/.test(VALIDATE) && /'valid', false/.test(VALIDATE),
    "la validación no falla cerrado ante una configuración ilegible");
  assert(/no tiene ninguna condición/.test(VALIDATE),
    "una regla sin condiciones pasaría la validación y marcaría a TODOS");
  assert(/no produce ninguna salida/.test(VALIDATE),
    "una regla sin salidas pasaría la validación");
});

check("B4. la validación comprueba campo, operador y forma del valor contra el catálogo", () => {
  assert(/no pertenece a la fuente/.test(VALIDATE), "no se comprueba que el campo sea de la fuente");
  assert(/no se puede aplicar a/.test(VALIDATE), "no se comprueba que el operador esté permitido");
  assert(/necesita una lista de valores/.test(VALIDATE), "`in` aceptaría un escalar");
  assert(/necesita un número entero de días o periodos/.test(VALIDATE),
    "`days_before` aceptaría cualquier cosa");
  assert(/no es un valor posible de/.test(VALIDATE), "un enum aceptaría un valor inventado");
});

check("B5. el número de versión es único por regla y no se recicla", () => {
  const v = tableBody("quality_automation_rule_versions");
  assert(/unique \(organization_id, rule_id, version_number\)/.test(v),
    "dos versiones podrían llamarse igual");
});

check("B6. una señal apunta a SU versión, y ese origen está congelado", () => {
  const s = tableBody("quality_signals");
  assert(/rule_version_id\s+uuid/.test(s), "la señal no sabe con qué versión se emitió");
  const f = functionBody("quality_signal_origin_is_frozen");
  for (const col of ["rule_id", "rule_version_id", "run_id", "dedupe_key"]) {
    assert(new RegExp(`new\\.${col}`).test(f) || new RegExp(`old\\.${col}`).test(f),
      `el origen de la señal deja cambiar ${col}`);
  }
  assert(/raise exception/.test(f), "el origen se puede reescribir");
});

// ---------------------------------------------------------------------------
console.log("\nC · PUBLICADA ≠ ACTIVA · VIGENCIA · DESACTIVAR CONSERVA HISTORIA (§23, §24, §26)");

check("C1. el estado de la regla y el de la versión son cosas distintas", () => {
  assert(RULE_STATUSES.join() === "draft,active,inactive,retired",
    "los estados de la regla cambiaron sin querer");
  assert(VERSION_STATUSES.join() === "draft,published,superseded",
    "los estados de la versión cambiaron sin querer");
  assert(PUBLISHED_IS_NOT_ACTIVE.length > 40,
    "no está escrito por qué publicada no es activa");
});

check("C2. el motor exige regla ACTIVA y versión PUBLICADA vigente HOY", () => {
  assert(/r\.status = 'active'/.test(RUN), "el motor evalúa reglas que no están activas");
  assert(/status in \('published', 'superseded'\)/.test(RUN),
    "el motor evalúa borradores, o deja a la regla sin versión mientras el relevo espera");
  assert(!/status = 'draft'/.test(RUN), "el motor evalúa borradores");
  assert(/effective_from <= v_today/.test(RUN), "una versión futura ya estaría evaluando");
  assert(/effective_to is null or effective_to >= v_today/.test(RUN),
    "una versión caducada seguiría evaluando");
});

check("C3. una regla sin versión vigente se OMITE y lo dice, no falla", () => {
  assert(/'skipped'/.test(RUN) && /Sin versión publicada vigente hoy/.test(RUN),
    "una regla sin versión vigente no deja rastro de por qué no se evaluó");
});

check("C4. desactivar una regla no borra ni sus versiones ni sus señales", () => {
  const acciones = stripTs(ACTIONS);
  assert(/setRuleStatus/.test(acciones), "no existe la acción de cambiar el estado");
  assert(!/delete from quality_signals|deleteSignal/.test(acciones + stripTs(DB)),
    "hay una vía para borrar señales");
  assert(DEACTIVATION_KEEPS_HISTORY.length > 40,
    "no está escrito que desactivar conserva la historia");
});

check("C5. publicar SUPERSEDE la anterior en lugar de reescribirla", () => {
  const p = functionBody("quality_automation_publish_version");
  assert(/'superseded'/.test(p), "la versión anterior no se marca como sustituida");
  assert(!/delete from quality_automation_rule_versions/.test(p),
    "publicar borra la versión anterior: el pasado dejaría de explicarse");
  assert(VERSION_IS_FROZEN.length > 40, "no está escrito que la versión queda congelada");
});

// ---------------------------------------------------------------------------
console.log("\nD · EL EVALUADOR Y SUS CATORCE OPERADORES (§25, §30, §31, AT-06)");

check("D1. el catálogo de operadores es cerrado y coincide en los tres sitios", () => {
  assert(OPERATORS.length === 14, `hay ${OPERATORS.length} operadores en el dominio`);
  for (const op of OPERATORS) {
    assert(new RegExp(`when '${op}' then`).test(CHECKER),
      `el comparador de la base no implementa «${op}»`);
    assert(new RegExp(`'${op}'`).test(SQL.slice(0, SQL.indexOf("create table public.quality_automation_rules"))),
      `«${op}» no está en la restricción del catálogo de campos`);
    assert(OPERATOR_SEMANTICS[op].length > 20, `«${op}» no explica qué significa`);
  }
});

check("D2. un operador desconocido NO coincide: no coincide por defecto", () => {
  assert(/else\s*\n\s*v_ok := false;/.test(CHECKER),
    "la rama por omisión del comparador no es «no coincide»");
  assert(/Operador no reconocido/.test(CHECKER),
    "un operador inventado no deja explicación");
});

check("D3. un dato con forma inesperada falla CERRADO (§30, §45)", () => {
  assert(/exception when others/.test(CHECKER), "el comparador no captura el dato malformado");
  const cola = CHECKER.slice(CHECKER.indexOf("exception when others"));
  assert(/'matched', false/.test(cola), "al fallar, el comparador podría decir que sí coincide");
  assert(/no tiene la forma esperada/.test(cola), "el fallo no se explica en castellano");
});

check("D4. entre condiciones hay AND, y una lista vacía NO coincide", () => {
  assert(/jsonb_array_length\(p_conditions\) = 0/.test(EVALUATOR),
    "el evaluador no contempla la lista vacía");
  const vacia = EVALUATOR.slice(EVALUATOR.indexOf("jsonb_array_length(p_conditions) = 0"));
  assert(/'matched', false/.test(vacia.slice(0, 400)),
    "sin condiciones el evaluador marcaría a todos los sujetos");
  assert(!/\bor\b\s+coalesce\(\(v_r ->> 'matched'\)/.test(EVALUATOR),
    "las condiciones se combinan con O en algún punto");
});

check("D5. los operadores de fecha se resuelven contra el día del NEGOCIO", () => {
  for (const op of ["days_before", "days_after"]) {
    const i = CHECKER.indexOf(`when '${op}' then`);
    const bloque = CHECKER.slice(i, i + 600);
    assert(/p_today/.test(bloque), `«${op}» no usa el día de negocio recibido`);
    assert(!/now\(\)|current_date/.test(bloque),
      `«${op}» lee el reloj por su cuenta en vez de recibir el día`);
  }
});

check("D6. el comparador es INMUTABLE: mismas entradas, misma respuesta", () => {
  assert(/\nimmutable/.test(CHECKER), "el comparador no se declara inmutable");
  assert(/\nimmutable/.test(EVALUATOR), "el evaluador no se declara inmutable");
  assert(!/random\(\)|now\(\)|clock_timestamp/.test(CHECKER + EVALUATOR),
    "el evaluador consulta el reloj o el azar: dejaría de ser determinístico");
});

check("D7. `consecutive_count` mira la COLA de la serie, no el total", () => {
  const i = CHECKER.indexOf("when 'consecutive_count' then");
  const bloque = CHECKER.slice(i, i + 900);
  assert(/reverse/.test(bloque), "no recorre la serie desde el final");
  assert(/exit when/.test(bloque),
    "no corta al primer periodo que no cumple: contaría periodos sueltos como consecutivos");
});

check("D8. `strictly_decreasing` exige bajar de verdad, uno tras otro", () => {
  const i = CHECKER.indexOf("when 'strictly_decreasing' then");
  const bloque = CHECKER.slice(i, i + 900);
  assert(/<\s*\(v_arr -> \(v_i - 1\)\)/.test(bloque),
    "no compara cada valor con el anterior");
  assert(/v_n >= 2/.test(bloque), "aceptaría «tendencia» con un solo valor");
});

// ---------------------------------------------------------------------------
console.log("\nE · LAS SEIS SEPARACIONES, EN EL CÓDIGO (§16, §17, §18, AT-02…AT-04)");

check("E1. EVENTO ≠ OBSERVACIÓN · el motor no inventa una bitácora nueva", () => {
  assert(EVENT_IS_NOT_STATE.length > 40 && OBSERVATION_IS_NOT_A_SIGNAL.length > 40,
    "las dos primeras separaciones no están escritas");
  assert(/insert into work_events/.test(RUN),
    "el motor no escribe en la bitácora transversal");
  assert(!/create table public\.quality_automation_events|create table public\.automation_log/.test(SQL),
    "se creó una bitácora paralela");
});

check("E2. OBSERVACIÓN ≠ SEÑAL · observar no emite nada por sí mismo", () => {
  // El proveedor de sujetos SOLO lee. Ni una escritura.
  assert(!/insert into|update\s+\w+\s+set|delete from/.test(SUBJECTS),
    "el proveedor de sujetos escribe: observar dejaría de ser gratis");
});

check("E3. SEÑAL ≠ ALERTA · la alerta es una salida opcional de la señal", () => {
  assert(SIGNAL_IS_NOT_AN_ALERT.length > 40, "no está escrito");
  // La alerta se emite dentro del bucle de salidas, no junto a la señal.
  const salidas = RUN.slice(RUN.indexOf("for v_out in select * from jsonb_array_elements(v_ver.outputs)"));
  assert(/'CREATE_ALERT'/.test(salidas), "la alerta no depende de una salida declarada");
  assert(/insert into work_alerts/.test(salidas), "la alerta no usa el motor transversal");
  assert(!/create table public\.quality_automation_alerts/.test(SQL),
    "se creó un segundo motor de alertas");
});

check("E4. ALERTA ≠ TAREA · son dos salidas distintas y se cuentan aparte", () => {
  assert(ALERT_IS_NOT_A_TASK.length > 40, "no está escrito");
  assert(/alerts_created/.test(RUN) && /tasks_created/.test(RUN),
    "no se cuentan por separado");
  assert(/insert into work_tasks/.test(RUN), "la tarea no usa el motor transversal");
  assert(!/create table public\.quality_automation_tasks/.test(SQL),
    "se creó un segundo motor de tareas");
});

check("E5. TAREA ≠ ACCIÓN · el motor NO crea acciones correctivas", () => {
  assert(TASK_IS_NOT_AN_ACTION.length > 40, "no está escrito");
  assert(!/insert into work_actions/.test(RUN),
    "el motor crea acciones: eso lo decide una persona");
  assert(!/insert into work_actions/.test(SQL),
    "la migración crea acciones en algún punto");
  assert(ruleCreatesAction("A") === false && ruleCreatesAction("D") === false,
    "algún nivel de autonomía crearía acciones");
});

check("E6. CONDICIÓN ≠ DECISIÓN · ningún nivel de autonomía decide", () => {
  assert(CONDITION_IS_NOT_A_DECISION.length > 40, "no está escrito");
  for (const n of AUTONOMY_LEVELS) {
    assert(ruleMakesFormalDecision(n) === false, `el nivel ${n} tomaría una decisión formal`);
    assert(AUTONOMY_LEVEL_MEANING[n].length > 20, `el nivel ${n} no explica qué significa`);
  }
  assert(NO_LEVEL_DECIDES.length > 40, "no está escrito que ningún nivel decide");
});

// ---------------------------------------------------------------------------
console.log("\nF · EXPLICABILIDAD (§41, §42, §88, AT-13)");

check("F1. cada condición devuelve su propia frase, con el valor observado", () => {
  assert(/'observed', v_shown/.test(CHECKER), "no se guarda lo que se observó");
  assert(/'explanation', v_frase/.test(CHECKER), "una condición no se explica");
  assert(/'field', p_field/.test(CHECKER) && /'operator', p_operator/.test(CHECKER),
    "la explicación no dice qué campo ni con qué operador");
});

check("F2. la señal nace ya explicada: regla, versión, sujeto, condición y fecha", () => {
  const i = RUN.indexOf("insert into quality_signals");
  const bloque = RUN.slice(i, i + 2000);
  for (const trozo of ["'Regla: '", "'\\nVersión: '", "'\\nSujeto: '", "'\\nCondición:", "Detectado el"]) {
    assert(bloque.includes(trozo.replace("\\n", "\\n")),
      `la explicación de la señal no incluye ${trozo}`);
  }
});

check("F3. el retrato de la fuente guarda SOLO los campos que la regla miró", () => {
  const i = RUN.indexOf("insert into quality_signals");
  const bloque = RUN.slice(i, i + 2500);
  assert(/jsonb_object_agg\(c ->> 'field', v_subject\.facts -> \(c ->> 'field'\)\)/.test(bloque),
    "el retrato no se recorta a los campos de las condiciones");
  assert(!/v_subject\.facts\s*\)/.test(bloque.replace(/facts -> \(c[^)]*\)/g, "")),
    "se guarda el sujeto entero: eso es más de lo necesario");
  assert(SNAPSHOT_IS_MINIMAL.length > 40, "no está escrito por qué el retrato es mínimo");
});

check("F4. la explicación se lee línea a línea en la pantalla y en el papel", () => {
  assert(explanationLines("Regla: X\nSujeto: Y").length === 2,
    "la explicación no se parte en líneas");
  assert(explanationLines(null).length === 0, "sin explicación se inventan líneas");
  assert(/explanationLines/.test(ADAPTERS), "el PDF no imprime la explicación");
  assert(/explanationLines/.test(COMPONENTS), "la pantalla no muestra la explicación");
});

check("F5. el resumen legible de una regla se genera SIN modelo, siempre igual", () => {
  const d = functionBody("quality_automation_describe_version");
  assert(!/http|openai|embedding|llm/i.test(d), "el resumen consulta algo externo");
  const args = () => [
    "Indicadores",
    [{ field: "last_evaluation", operator: "equals" as const, value: "out_of_target" }],
    [{ kind: "CREATE_SIGNAL" as const }],
    { last_evaluation: "Evaluación" },
  ] as const;
  const [a1, b1, c1, d1] = args();
  const [a2, b2, c2, d2] = args();
  const uno = describeRule(a1, [...b1], [...c1], d1);
  const dos = describeRule(a2, [...b2], [...c2], d2);
  assert(uno === dos && uno.length > 10, "el mismo dato produce dos frases distintas");
});

// ---------------------------------------------------------------------------
console.log("\nG · IDEMPOTENCIA, DEDUPE, REARME Y RECURRENCIA (§34…§40, AT-20…AT-24)");

check("G1. la unicidad de la señal abierta es un ÍNDICE, no un `select` previo", () => {
  // Comprobar antes de insertar no sirve: dos barridos simultáneos pasan los
  // dos por el hueco. La única defensa real es la base de datos.
  assert(/create unique index quality_signals_open_dedupe_uniq[\s\S]{0,200}?where resolved_at is null/.test(SQL),
    "no existe el índice único parcial sobre la señal abierta");
  assert(/on conflict \(organization_id, dedupe_key\) where resolved_at is null/.test(RUN),
    "el motor no se apoya en el índice para desduplicar");
});

check("G2. el mismo barrido dos veces NO crea una segunda señal: actualiza la que hay", () => {
  const i = RUN.indexOf("on conflict (organization_id, dedupe_key)");
  const bloque = RUN.slice(i, i + 400);
  assert(/do update set last_detected_at = now\(\)/.test(bloque),
    "la segunda detección no actualiza la fecha");
  assert(/detection_count = quality_signals\.detection_count \+ 1/.test(bloque),
    "no se cuenta cuántas veces se ha vuelto a ver");
  assert(/xmax = 0/.test(bloque),
    "no se distingue la señal creada de la reencontrada: el informe contaría mal");
});

check("G3. la clave de dedupe incluye la VERSIÓN y el sujeto, y nada más", () => {
  assert(/'auto:' \|\| v_ver\.id::text \|\| ':' \|\| v_subject\.subject_id::text/.test(RUN),
    "la clave determinística cambió de forma");
  // No lleva la fecha: si la llevara, cada día abriría una señal nueva.
  const i = RUN.indexOf("v_dedupe := ");
  assert(!/v_today/.test(RUN.slice(i, i + 200)),
    "la clave incluye el día: el motor duplicaría cada mañana");
});

check("G4. el predicado parcial es lo que permite REARMAR (§59, §60)", () => {
  // Cerrada la señal, la fila deja de ocupar el índice: si la condición vuelve
  // a cumplirse, entra una señal NUEVA. Ni dedupe eterno, ni duplicado.
  assert(/where resolved_at is null/.test(SQL.slice(SQL.indexOf("create unique index quality_signals_open_dedupe_uniq"))),
    "el índice no es parcial: la señal resuelta bloquearía la reaparición para siempre");
  assert(IDEMPOTENT_AND_REARMS.includes("rearm") || /rearma|vuelve a/.test(IDEMPOTENT_AND_REARMS),
    "no está escrito que la condición se rearma");
});

check("G5. alerta y tarea también son idempotentes, con su propia clave", () => {
  assert(/'auto_alert:' \|\| v_signal::text \|\| ':' \|\| v_rec\.profile_id::text/.test(RUN),
    "la alerta no tiene clave por señal y destinatario");
  assert(/'auto_task:' \|\| v_signal::text \|\| ':' \|\| v_rec\.profile_id::text/.test(RUN),
    "la tarea no tiene clave por señal y destinatario");
  assert((RUN.match(/where not exists \(\s*\n?\s*select 1 from work_(alerts|tasks)/g) ?? []).length === 2,
    "alerta o tarea se insertan sin comprobar la clave");
});

check("G6. un reintento completa lo que faltó y NO repite lo que ya existía (§147)", () => {
  // La señal entra por `on conflict`; alerta y tarea por `where not exists`.
  // Reintentar después de un fallo a medias termina el trabajo exactamente una
  // vez, que es lo que pide el escenario 12.
  assert(/if found then v_alert_n := v_alert_n \+ 1; end if;/.test(RUN),
    "no se distingue la alerta creada de la que ya existía");
  assert(/if found then v_task_n := v_task_n \+ 1; end if;/.test(RUN),
    "no se distingue la tarea creada de la que ya existía");
});

check("G7. la resolución automática es determinística y NO cierra el trabajo ajeno", () => {
  const i = RUN.indexOf("update quality_signals s");
  const bloque = RUN.slice(i, i + 800);
  assert(/resolution_kind = 'auto'/.test(bloque), "la resolución automática no se marca como tal");
  assert(/s\.subject_id = any \(v_vistos\)/.test(bloque),
    "se resolverían señales de sujetos que ni siquiera se evaluaron");
  assert(/not \(s\.dedupe_key = any \(v_claves\)\)/.test(bloque),
    "se resolverían señales cuya condición sigue cumpliéndose");
  assert(!/update work_tasks[\s\S]{0,200}status = 'done'/.test(bloque),
    "resolver la señal cierra la tarea");
  assert(!/work_actions/.test(bloque), "resolver la señal toca una acción");
});

check("G8. reconocer ≠ resolver, y silenciar ≠ resolver", () => {
  const ack = functionBody("quality_signal_acknowledge");
  assert(!/resolved_at\s*=\s*now\(\)/.test(ack),
    "reconocer cierra la señal: «lo vi» pasaría por «lo arreglé»");
  assert(ACKNOWLEDGE_IS_NOT_RESOLVE.length > 40 && SUPPRESSION_IS_NOT_RESOLUTION.length > 40,
    "las dos distinciones no están escritas");
  const sup = functionBody("quality_signal_suppress");
  assert(/'suppressed'/.test(sup), "silenciar no se distingue de resolver en el estado");
  assert(/Silenciar exige decir por qué/.test(sup), "se puede silenciar sin motivo");
});

// ---------------------------------------------------------------------------
console.log("\nH · SIMULACIÓN (§50…§53, §72, §144, AT-19)");

check("H1. la simulación usa EL MISMO evaluador que la ejecución real", () => {
  assert(/quality_automation_evaluate\(/.test(SIMULATE) && /quality_automation_evaluate\(/.test(RUN),
    "simulación y ejecución no comparten evaluador");
  assert(/quality_automation_subjects\(/.test(SIMULATE),
    "la simulación no mira los sujetos reales");
});

check("H2. la simulación NO escribe nada, y eso lo garantiza también la tabla", () => {
  assert(!/insert into quality_signals|insert into work_alerts|insert into work_tasks/.test(SIMULATE),
    "la simulación crea salidas");
  assert(/\nstable/.test(SIMULATE), "la simulación no se declara `stable`");
  assert(/if p_mode = 'simulation' then\s*\n\s*continue;/.test(RUN),
    "el motor no corta antes de escribir cuando simula");
  const t = tableBody("quality_automation_runs");
  assert(/run_kind <> 'simulation'\s*\n?\s*or \(signals_created = 0 and alerts_created = 0 and tasks_created = 0\)/.test(t),
    "una ejecución de simulación podría declarar salidas");
});

check("H3. la simulación devuelve las coincidencias y ceros explícitos", () => {
  assert(/'signals_created', 0/.test(SIMULATE) && /'alerts_created', 0/.test(SIMULATE)
    && /'tasks_created', 0/.test(SIMULATE), "la simulación no declara sus ceros");
  const s = simulationOutputs();
  assert(s.signals === 0 && s.alerts === 0 && s.tasks === 0, "el dominio no promete lo mismo");
  assert(SIMULATION_CREATES_NOTHING.length > 40, "no está escrito");
});

check("H4. simular exige sesión: no es una puerta de servicio", () => {
  assert(/p_mode = 'simulation' and auth\.uid\(\) is null/.test(RUN),
    "una simulación sin sesión sería posible");
});

// ---------------------------------------------------------------------------
console.log("\nI · EL RELOJ Y EL DÍA DE NEGOCIO (§47, §48, §67, §68, AT-25)");

check("I1. el reloj es del SERVIDOR: el cliente no manda la fecha", () => {
  const acciones = stripTs(ACTIONS);
  assert(!/p_today/.test(acciones),
    "alguna acción envía el día al motor: se podría adelantar un vencimiento a voluntad");
  assert(/now\(\)/.test(functionBody("quality_automation_business_today")),
    "el día de negocio no sale del reloj del servidor");
  assert(CLOCK_IS_SERVER_SIDE.length > 40, "no está escrito");
});

check("I2. el día de negocio se resuelve en la zona horaria de la EMPRESA", () => {
  const f = functionBody("quality_automation_business_today");
  assert(/at time zone coalesce\(/.test(f), "no se aplica la zona horaria de la empresa");
  assert(/'UTC'/.test(f), "no hay zona por omisión: una empresa sin ajuste rompería el barrido");
  assert(/business_timezone/.test(tableBody("quality_automation_settings")),
    "la empresa no puede declarar su zona horaria");
  assert(BUSINESS_DAY_IS_LOCAL.length > 40, "no está escrito");
});

check("I3. el motor resuelve el día UNA vez y lo pasa a todo el barrido", () => {
  assert(/v_today\s*:=\s*coalesce\(p_today, quality_automation_business_today\(p_organization_id\)\)/
    .test(RUN), "el día no se resuelve una sola vez al principio");
  assert(/quality_automation_evaluate\(\s*\n?\s*v_subject\.facts, v_ver\.conditions, v_today/.test(RUN),
    "el evaluador no recibe el día de negocio");
  // Y ninguna condición vuelve a mirar el reloj por su cuenta.
  assert(!/current_date/.test(CHECKER + EVALUATOR),
    "una condición lee `current_date`: dos condiciones podrían caer en días distintos");
});

// ---------------------------------------------------------------------------
console.log("\nJ · LOS BUCLES SON IMPOSIBLES POR CONSTRUCCIÓN (§64, §66, §84, §86, §148)");

check("J1. NINGUNA fuente observa tareas, alertas, señales ni ejecuciones", () => {
  // Es la comprobación que sostiene todo el bloque: si nada de lo que la
  // automatización produce se puede observar, el grafo de reglas tiene
  // profundidad uno y no hay recursión que acotar.
  const bloque = SQL.slice(SQL.indexOf("insert into public.quality_automation_sources"));
  const filas = bloque.slice(0, bloque.indexOf(";"));
  for (const prohibido of ["work_task", "work_alert", "quality_signal",
                           "quality_automation_run", "quality_automation_rule"]) {
    assert(!new RegExp(`'${prohibido}'`).test(filas),
      `hay una fuente que observa «${prohibido}»: eso es un bucle esperando a ocurrir`);
  }
  assert(LOOPS_ARE_IMPOSSIBLE.length > 60, "no está escrito por qué no puede haber bucles");
});

check("J2. el proveedor de sujetos no lee ninguna tabla de salidas", () => {
  for (const t of ["work_tasks", "work_alerts", "quality_signals"]) {
    assert(!new RegExp(`from ${t}\\b`).test(SUBJECTS),
      `los sujetos se sacan de ${t}: una salida se convertiría en entrada`);
  }
});

check("J3. el motor no se llama a sí mismo, ni directa ni indirectamente", () => {
  const cuerpo = RUN.slice(RUN.indexOf("begin"));
  assert((cuerpo.match(/quality_automation_run\s*\(/g) ?? []).length === 0,
    "el motor se invoca a sí mismo");
  // Y los disparadores de las tablas de salida no vuelven a llamarlo.
  assert(!/execute function public\.quality_automation_run/.test(SQL),
    "hay un disparador que ejecuta el motor");
});

check("J4. crear una tarea NO dispara otra evaluación", () => {
  const desde = RUN.indexOf("for v_out in select * from jsonb_array_elements(v_ver.outputs)");
  const salidas = RUN.slice(desde, RUN.indexOf("end loop;", RUN.indexOf("if not v_hubo_rec")));
  assert(!/quality_automation_run\s*\(|perform quality_automation/.test(salidas),
    "emitir una salida vuelve a arrancar el motor");
  assert(/insert into work_tasks/.test(salidas), "el trozo comprobado no es el de las salidas");
});

// ---------------------------------------------------------------------------
console.log("\nK · LAS NUEVE DECISIONES QUE LA AUTOMATIZACIÓN NO TOMA (§19, AT-14…AT-18)");

/** Las escrituras que, si aparecieran dentro del motor, significarían que la
 *  plataforma decidió algo que solo una persona puede decidir. */
const PROHIBIDO: [string, RegExp][] = [
  ["declarar una no conformidad",
   /update work_cases[\s\S]{0,300}classification\s*=|insert into work_cases/],
  ["aprobar o rechazar un proveedor",
   /update quality_supplier_scopes[\s\S]{0,300}approval_status\s*=/],
  ["declarar una competencia",
   /update quality_person_competencies|insert into quality_competency_evidences/],
  ["cerrar una acción como eficaz",
   /update work_actions[\s\S]{0,300}effectiveness_result\s*=/],
  ["aceptar un riesgo residual",
   /update quality_risk_assessments|update quality_risks[\s\S]{0,300}accepted/],
  ["cerrar una auditoría",
   /update quality_audits[\s\S]{0,300}status\s*=\s*'(closed|cancelled)'/],
  ["cerrar la revisión por la dirección",
   /update quality_management_reviews[\s\S]{0,300}status\s*=\s*'closed'/],
  ["suspender un proveedor",
   /update quality_suppliers[\s\S]{0,300}status\s*=\s*'suspended'/],
  ["emitir una conclusión de dirección",
   /insert into quality_management_review_decisions/],
];

check("K1. el motor no ejecuta NINGUNA de las nueve decisiones formales", () => {
  for (const [nombre, patron] of PROHIBIDO) {
    assert(!patron.test(RUN), `el motor podría ${nombre}`);
  }
});

check("K2. tampoco lo hace ninguna otra función de la migración", () => {
  // La barrera tiene que existir server-side, no solo en la pantalla (§19).
  for (const [nombre, patron] of PROHIBIDO) {
    assert(!patron.test(SQL), `alguna función de QUALITY-11 podría ${nombre}`);
  }
});

check("K3. las salidas posibles son EXACTAMENTE tres, y están acotadas en la base", () => {
  assert(OUTPUT_KINDS.join() === "CREATE_SIGNAL,CREATE_ALERT,CREATE_TASK",
    "el catálogo de salidas cambió");
  assert(/not in \('CREATE_SIGNAL', 'CREATE_ALERT', 'CREATE_TASK'\)/.test(VALIDATE),
    "la base no acota las salidas al catálogo cerrado");
  assert(/Salida no permitida/.test(VALIDATE), "una salida inventada no se rechaza");
  assert(FORBIDDEN_OUTPUTS.length > 40, "no está escrito qué NO puede emitir una regla");
});

check("K4. ninguna salida manda correo arbitrario, HTTP ni SQL", () => {
  for (const veneno of ["http", "net.http", "pg_net", "dblink", "copy ", "execute immediate"]) {
    assert(!new RegExp(veneno.replace(".", "\\.")).test(RUN.toLowerCase()),
      `el motor podría ejecutar «${veneno}»`);
  }
});

check("K5. el nivel de autonomía describe cuánto prepara, nunca cuánto decide", () => {
  for (const n of AUTONOMY_LEVELS) {
    const t = AUTONOMY_LEVEL_MEANING[n].toLowerCase();
    assert(!/decide por|aprueba|declara la no conformidad|cierra la acción/.test(t),
      `el nivel ${n} promete decidir algo`);
  }
  // Y el motor no lee el nivel para hacer más cosas: hace las mismas siempre.
  assert(!/autonomy_level/.test(RUN.slice(RUN.indexOf("insert into quality_signals"))),
    "el nivel de autonomía cambia lo que el motor escribe");
});

// ---------------------------------------------------------------------------
console.log("\nL · UN SOLO MOTOR · LOS BARRIDOS VIEJOS (§126, §127, §128, §177, AT-31)");

/** Los ocho barridos que QUALITY-03…10 ya traían. */
const BARRIDOS = [
  "quality_scan_pending_measurements", "work_scan_pending_actions",
  "quality_scan_risk_reviews", "quality_scan_people_signals",
  "quality_scan_supplier_reviews", "quality_scan_customer_voice",
  "quality_scan_audits", "quality_scan_management_reviews",
];

check("L1. los ocho barridos siguen existiendo con su contrato intacto", () => {
  // §127 · Compatibilidad: Q09 y Q10 llaman a estos nombres y no se han de
  // enterar de nada. Por eso QUALITY-11 no los reescribe.
  for (const b of BARRIDOS) {
    assert(!new RegExp(`drop function[^;]*${b}`).test(SQL), `${b} se eliminó`);
    assert(!new RegExp(`create or replace function public\\.${b}`).test(SQL),
      `${b} se reescribió: eso rompería el contrato que Q03…Q10 dan por bueno`);
  }
});

check("L2. los ocho se ejecutan DENTRO del barrido de QUALITY-11", () => {
  for (const b of BARRIDOS) {
    assert(RUN.includes(`'${b}'`), `${b} quedó fuera de la única puerta`);
  }
  assert(/platform_observer/.test(RUN), "no se registran como observadores de plataforma");
  assert(ONE_ENGINE.length > 40, "no está escrito que hay un solo motor");
});

check("L2b. lo que se cuenta de un observador es lo que CREÓ, no lo que dijo", () => {
  // Algún barrido heredado devuelve el total de la condición y no las filas
  // nuevas. Contar el delta real de avisos es fiel sin tocar su contrato.
  const i = RUN.indexOf("foreach v_obs in array array[");
  const bloque = RUN.slice(i, i + 1600);
  assert(/select count\(\*\) into v_antes from work_alerts/.test(bloque),
    "el motor se fía del número que devuelve el barrido heredado");
  assert(/greatest\(v_despues - v_antes, 0\)/.test(bloque),
    "no se mide el delta real de avisos creados");
});

check("L3. cada observador se cuenta y su fallo NO tumba el barrido", () => {
  const i = RUN.indexOf("foreach v_obs in array array[");
  const bloque = RUN.slice(i, i + 2600);
  assert(/exception when others/.test(bloque), "un barrido viejo que falle tumbaría todo");
  assert(/'failed', sqlerrm/.test(bloque), "el fallo no queda escrito con su mensaje");
  // Y una precondición conocida NO se cuenta como avería (0130).
  assert(/'skipped'/.test(bloque), "un barrido que exige sesión se contaría como fallo cada noche");
  assert(/alerts_created, status, duration_ms/.test(bloque),
    "no se registra cuántas alertas creó ni cuánto tardó");
});

check("L4. las plantillas cubren lo que los barridos NO cubrían", () => {
  // Dos mecanismos mirando la misma condición producirían dos avisos: es
  // exactamente la regresión de duplicado que §128 prohíbe.
  const bloque = SQL.slice(SQL.indexOf("insert into public.quality_automation_rule_templates"));
  const plantillas = bloque.slice(0, bloque.indexOf("\n;"));
  assert(/indicator_consecutive_out_of_target/.test(plantillas),
    "falta la plantilla de periodos consecutivos fuera de meta");
  assert(/indicator_strictly_decreasing/.test(plantillas),
    "falta la plantilla de tendencia descendente");
  // Y ninguna repite el barrido de mediciones pendientes, que ya existe.
  assert(!/pending_measurement/.test(plantillas),
    "una plantilla observa lo mismo que `quality_scan_pending_measurements`");
});

check("L5. NINGUNA plantilla se activa sola (§125)", () => {
  const bloque = SQL.slice(SQL.indexOf("insert into public.quality_automation_rule_templates"));
  const plantillas = bloque.slice(0, bloque.indexOf("\n;"));
  assert(!/,\s*true\s*\)/.test(plantillas) || /is_enabled_by_default/.test(plantillas) === false,
    "alguna plantilla podría venir encendida");
  const inst = functionBody("quality_automation_instantiate_template");
  assert(/'draft'/.test(inst),
    "instanciar una plantilla la deja activa: encender cincuenta reglas el primer día es ruido");
});

check("L6. no hay una segunda bitácora, ni un segundo motor de nada", () => {
  const tablas = [...SQL.matchAll(/create table public\.([a-z0-9_]+)/g)].map((m) => m[1]);
  assert(tablas.length === 10, `QUALITY-11 crea ${tablas.length} tablas`);
  for (const t of tablas) {
    assert(!/_audit_log$|_events$|_notifications$|_inbox$/.test(t),
      `la tabla ${t} huele a bitácora o bandeja paralela`);
  }
  assert(/insert into work_events/.test(RUN) && /insert into work_alerts/.test(RUN)
    && /insert into work_tasks/.test(RUN),
    "el motor no reutiliza los tres mecanismos transversales");
});

// ---------------------------------------------------------------------------
console.log("\nM · SEGURIDAD Y AISLAMIENTO (§87, §98…§111, AT-36…AT-40)");

check("M1. toda función `security definer` fija su `search_path`", () => {
  const defs = [...SQL.matchAll(/create or replace function public\.([a-z0-9_]+)[\s\S]{0,600}?\$\$/g)];
  for (const d of defs) {
    if (!/security definer/.test(d[0])) continue;
    assert(/set search_path = public/.test(d[0]),
      `${d[1]} es security definer y no fija el search_path`);
  }
});

check("M2. las siete tablas de dominio tienen RLS y ninguna la abre a `anon`", () => {
  for (const t of ["quality_automation_settings", "quality_automation_rules",
                   "quality_automation_rule_versions", "quality_automation_runs",
                   "quality_automation_run_rules", "quality_signals",
                   "quality_signal_suppressions"]) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(SQL),
      `${t} sin RLS`);
    assert(new RegExp(`revoke all on table public\\.${t}\\s+from anon, authenticated`).test(SQL),
      `${t} no revoca los privilegios por omisión de Supabase`);
    assert(!new RegExp(`grant [^;]*on table public\\.${t}[^;]*to anon`).test(SQL),
      `${t} concede algo a anon`);
  }
});

check("M3. las ejecuciones son de SOLO LECTURA para cualquier sesión", () => {
  assert(/grant select on table public\.quality_automation_runs\s+to authenticated/.test(SQL),
    "las ejecuciones no se pueden leer");
  assert(!/grant [^;]*(insert|update|delete)[^;]*quality_automation_runs\b/.test(SQL),
    "una sesión podría escribir una ejecución: dejaría de probar nada");
  assert(!/create policy [^;]*quality_automation_runs[^;]*for (all|insert|update|delete)/.test(SQL),
    "hay una política de escritura sobre las ejecuciones");
});

check("M4. las señales se leen y se actualizan; no se insertan ni se borran a mano", () => {
  assert(/grant select, update on table public\.quality_signals to authenticated/.test(SQL),
    "los privilegios de la señal no son solo lectura y actualización");
  assert(/create policy quality_signals_update/.test(SQL), "no hay política de actualización");
  assert(!/create policy quality_signals_(insert|delete|write)/.test(SQL),
    "alguien puede insertar o borrar señales a mano");
  assert(/before delete on public\.quality_signals/.test(SQL), "las señales se pueden borrar");
  assert(/before delete on public\.quality_automation_runs/.test(SQL),
    "las ejecuciones se pueden borrar");
});

check("M5. las reglas de PLATAFORMA no las puede tocar una empresa", () => {
  assert(/quality_manages_automation\(organization_id\) and not is_platform/.test(SQL),
    "una empresa podría editar o borrar una regla de plataforma");
});

check("M6. el motor comprueba el rol cuando hay sesión, y el modo siempre", () => {
  assert(/if auth\.uid\(\) is not null then\s*\n\s*if not quality_manages_automation/.test(RUN),
    "el motor no comprueba el rol de quien lo dispara");
  assert(/p_mode not in \('live', 'simulation'\)/.test(RUN),
    "el motor aceptaría un modo inventado");
});

check("M7. no se usa `service_role` para saltarse la semántica de negocio (§87)", () => {
  for (const [n, src] of [["db", DB], ["acciones", ACTIONS], ["papeles", ADAPTERS]] as const) {
    assert(!/createAdminClient|SUPABASE_SECRET_KEY|SERVICE_ROLE/.test(stripTs(src)),
      `${n}: se salta la RLS con la clave de servicio`);
  }
});

check("M8. el destinatario se resuelve por ESTRUCTURA, nunca por un id del cliente", () => {
  assert(RECIPIENT_KINDS.join() === "rule_owner_position,subject_owner_position,specific_position",
    "el catálogo de destinatarios cambió");
  assert(/El cargo destinatario no es de esta empresa/.test(VALIDATE),
    "se puede apuntar a un cargo de otra empresa");
  const r = functionBody("quality_automation_recipients");
  assert(/a\.organization_id = p_organization_id/.test(r),
    "los destinatarios no se acotan a la empresa");
  assert(/effective_from <= p_today/.test(r),
    "avisaría a quien ya no ocupa el cargo, o a quien todavía no lo ocupa");
  assert(RECIPIENT_IS_STRUCTURAL.length > 40, "no está escrito");
});

check("M9. una persona sin cuenta no rompe nada: la señal existe y lo dice (§33)", () => {
  assert(/recipient_unresolved/.test(tableBody("quality_signals")),
    "no hay dónde anotar que nadie recibió el aviso");
  assert(/if not v_hubo_rec then/.test(RUN), "el motor no contempla el cargo vacante");
  const r = functionBody("quality_automation_recipients");
  assert(/pe\.profile_id is not null/.test(r),
    "se intentaría avisar a una persona que no tiene cuenta");
});

// ---------------------------------------------------------------------------
console.log("\nN · PRIVACIDAD, ANONIMATO Y NO VIGILANCIA (§92, §95, §96, §97, §150)");

check("N1. la voz del cliente se observa como AGREGADO, nunca como respuesta", () => {
  const i = SUBJECTS.indexOf("elsif p_source_code = 'customer_metric'");
  const bloque = SUBJECTS.slice(i, i + 1800);
  for (const t of ["quality_survey_responses", "quality_survey_answers",
                   "quality_survey_invitations", "quality_survey_contacts"]) {
    assert(!bloque.includes(t), `la fuente de métrica lee ${t}: rompería el anonimato de Q08`);
  }
  assert(/campaign_id/.test(bloque), "el sujeto no es la campaña");
  assert(CUSTOMER_ANONYMITY_HOLDS.length > 40, "no está escrito");
});

check("N2. ninguna fuente de QUALITY-11 toca las respuestas ni las invitaciones", () => {
  for (const t of ["quality_survey_responses", "quality_survey_answers",
                   "quality_survey_invitations"]) {
    assert(!new RegExp(`from ${t}\\b`).test(SQL), `QUALITY-11 lee ${t}`);
  }
});

check("N3. las personas se observan por VENCIMIENTO, no por rendimiento", () => {
  const i = SUBJECTS.indexOf("elsif p_source_code = 'competency_evidence'");
  const bloque = SUBJECTS.slice(i, i + 900);
  assert(/valid_until/.test(bloque), "no se observa la caducidad de la evidencia");
  assert(!/score|rating|ranking|productivity/.test(bloque),
    "se está observando el desempeño de una persona");
  assert(NO_EMPLOYEE_SURVEILLANCE.length > 40, "no está escrito");
});

check("N4. el retrato de la señal no arrastra datos personales de más", () => {
  // El retrato son los campos de las condiciones, y los campos del catálogo de
  // personas son fechas y estados: ni un nombre, ni un correo, ni un documento.
  const campos = SQL.slice(SQL.indexOf("insert into public.quality_automation_source_fields"));
  const filas = campos.slice(0, campos.indexOf("\n;"));
  for (const prohibido of ["'email'", "'phone'", "'national_id'", "'document_number'",
                           "'salary'", "'birth_date'"]) {
    assert(!filas.includes(prohibido), `el catálogo permite observar ${prohibido}`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nO · CICLO DE VIDA Y BORRADO (§151, AT-41)");

check("O1. la regla entra en el ciclo de vida transversal", () => {
  assert(LIFECYCLE_ENTITIES.includes("automation_rule"),
    "la regla no está declarada en el ciclo de vida");
  assert(/when 'automation_rule'/.test(functionBody("quality_deletion_eligibility")),
    "el veredicto de borrado no conoce la regla");
});

check("O2. un borrador que nunca observó nada se puede borrar", () => {
  const v = functionBody("quality_automation_rule_deletion_verdict");
  assert(/'can_hard_delete', true/.test(v), "ni siquiera un borrador se puede borrar");
  assert(/'disposable'/.test(v), "no se distingue el borrador desechable");
});

check("O3. una regla con historia NO se borra: se retira", () => {
  const v = functionBody("quality_automation_rule_deletion_verdict");
  assert(/señal\(es\) emitidas/.test(v), "las señales emitidas no bloquean el borrado");
  assert(/versión\(es\) publicadas/.test(v), "las versiones publicadas no bloquean el borrado");
  assert(/'alternative', 'retire'/.test(v), "no se ofrece retirar como alternativa");
  assert(/dejaría señales sin poder /.test(v), "no se explica por qué no se puede borrar");
});

check("O4. el veredicto de borrado sigue exigiendo sesión (regresión de Q06.1)", () => {
  const e = functionBody("quality_deletion_eligibility");
  assert(/if auth\.uid\(\) is null then/.test(e),
    "la reescritura del veredicto perdió la guarda de sesión");
  assert(/quality_can_read_person/.test(e),
    "la reescritura del veredicto perdió la guarda de lectura de personas");
});

check("O5. el veredicto cubre las 22 entidades, no solo la nueva", () => {
  const e = functionBody("quality_deletion_eligibility");
  const casos = [...e.matchAll(/when '([a-z_]+)'/g)].map((m) => m[1]);
  assert(new Set(casos).size >= 22,
    `el veredicto solo conoce ${new Set(casos).size} entidades: se perdieron por el camino`);
});

// ---------------------------------------------------------------------------
console.log("\nP · LAS SALIDAS Y SUS DESTINATARIOS (§110…§113, §33, AT-11, AT-12)");

check("P1. la primera salida es SIEMPRE la señal", () => {
  assert(/La primera salida tiene que ser la señal/.test(VALIDATE),
    "una regla podría avisar sin haber emitido la señal que explica el aviso");
  assert(/CREATE_SIGNAL/.test(ACTIONS),
    "el formulario no antepone la señal a las demás salidas");
});

check("P2. alerta y tarea EXIGEN destinatario del catálogo", () => {
  assert(/El destinatario tiene que ser un cargo del catálogo/.test(VALIDATE),
    "se puede pedir una alerta sin decir a quién");
  const errores = validateOutputs([
    { kind: "CREATE_SIGNAL" },
    { kind: "CREATE_ALERT" },
  ]);
  assert(errores.length > 0, "el dominio acepta una alerta sin destinatario");
});

check("P3. la señal por sí sola es una salida válida y suficiente", () => {
  assert(validateOutputs([{ kind: "CREATE_SIGNAL" }]).length === 0,
    "una regla que solo observa y deja constancia se rechaza");
});

check("P4. la tarea nace ABIERTA, con su vencimiento y su cargo", () => {
  const i = RUN.indexOf("insert into work_tasks");
  const bloque = RUN.slice(i, i + 1200);
  assert(/'open'/.test(bloque), "la tarea no nace abierta");
  assert(/due_in_days/.test(bloque), "la tarea no puede traer vencimiento");
  assert(/assignee_position_id/.test(bloque), "la tarea no recuerda a qué cargo se dirigía");
  assert(/'automation_follow_up'/.test(bloque), "la tarea no se distingue como de automatización");
});

check("P5. los catálogos transversales conocen lo nuevo SIN perder lo viejo", () => {
  assert(TASK_TYPES.includes("automation_follow_up"), "falta el tipo de tarea");
  assert(ALERT_TYPES.includes("automation_signal")
    && ALERT_TYPES.includes("automation_engine_failure"), "faltan los tipos de alerta");
  assert(SUBJECT_TYPES.includes("quality_signal")
    && SUBJECT_TYPES.includes("quality_automation_rule"), "faltan los tipos de sujeto");
  // Y la migración no ESTRECHA ninguna de las restricciones transversales:
  // fue exactamente la regresión que QUALITY-10 estuvo a punto de introducir.
  for (const tipo of ["quality.audit_report_issued", "management_review.closed",
                      "quality.survey_published", "supplier.evaluated"]) {
    if (!RAW_SQL.includes("work_events_type_check")) break;
    const i = RAW_SQL.indexOf("work_events_type_check");
    const bloque = RAW_SQL.slice(i, RAW_SQL.indexOf(");", i));
    assert(bloque.includes(tipo) || !new RegExp(`'${tipo}'`).test(read("supabase/migrations/0128_quality_management_review.sql")),
      `la migración estrecha el catálogo de eventos: desaparecería «${tipo}»`);
  }
});

check("P6. los eventos nuevos describen el hecho, no el estado", () => {
  for (const e of ["automation.rule_published", "automation.rule_retired",
                   "automation.run_completed", "automation.signal_raised",
                   "automation.signal_resolved"]) {
    assert(RAW_SQL.includes(`'${e}'`), `falta el evento ${e}`);
  }
  // Un evento se nombra en pasado: es algo que ocurrió, no una situación.
  assert(!/'automation\.(rule_is|signal_is|run_is)/.test(RAW_SQL),
    "hay un «evento» que en realidad describe un estado");
});

// ---------------------------------------------------------------------------
console.log("\nQ · NADA DE IA (§7, §14, AT-01)");

check("Q1. ni la migración ni el código llaman a ningún modelo", () => {
  // Se busca la INTEGRACIÓN, no la palabra: el dominio menciona «embeddings»
  // justamente en la frase que explica que no se usan.
  const PROHIBIDO = /api\.openai|new OpenAI|@anthropic|anthropic\.|api\.anthropic|gpt-[0-9]|pgvector|create extension[^;]*vector|llm_(call|client)|huggingface/i;
  for (const [n, src] of [["migración", stripSql(RAW_SQL)], ["dominio", stripTs(DOMAIN)],
                          ["db", stripTs(DB)], ["acciones", stripTs(ACTIONS)],
                          ["papeles", stripTs(ADAPTERS)], ["pantalla", stripTs(COMPONENTS)],
                          ["planificador", stripTs(RUNNER)]] as const) {
    const m = PROHIBIDO.exec(src);
    assert(m === null, `${n}: aparece «${m?.[0]}»`);
  }
  assert(/embeddings/.test(AUTOMATION_IS_NOT_AI),
    "la negación explícita de IA se perdió del dominio");
  assert(usesArtificialIntelligence() === false, "el dominio no lo niega explícitamente");
  assert(AUTOMATION_IS_NOT_AI.length > 60, "no está escrito por qué esto no es IA");
});

check("Q2. no se hace ninguna llamada de red desde el motor ni desde el dominio", () => {
  for (const [n, src] of [["dominio", stripTs(DOMAIN)], ["db", stripTs(DB)]] as const) {
    assert(!/\bfetch\(|axios|XMLHttpRequest/.test(src), `${n}: hace una llamada de red`);
  }
  assert(!/pg_net|http_post|http_get/.test(SQL), "la migración llama a la red");
});

check("Q3. la observación por calidad se define por lo que NO hace", () => {
  assert(QUALITY_BY_OBSERVATION.length > 80, "no está escrito qué es Quality by Observation");
  assert(/NO hace|no decide|no concluye/i.test(QUALITY_BY_OBSERVATION),
    "la definición no dice lo que la automatización NO hace");
});

// ---------------------------------------------------------------------------
console.log("\nR · LOS PAPELES (§130…§135, AT-44)");

const CLAVES_Q11 = [
  "quality.automation-rule.list", "quality.automation-rule.detail",
  "quality.automation-signal.list", "quality.automation-signal.detail",
  "quality.automation-run.list", "quality.automation-run.detail",
];

check("R1. las seis exportaciones existen y están en el registro", () => {
  const registradas = promisedKeys();
  for (const k of CLAVES_Q11) {
    assert(ADAPTERS.includes(`key: "${k}"`), `no existe el adaptador de ${k}`);
    assert(registradas.includes(k), `${k} no está clasificada en el inventario`);
  }
});

check("R2. QUALITY-11 no deja ninguna entidad sin clasificar (§130)", () => {
  const filas = EXPORT_INVENTORY.filter((r) =>
    /automatización|Señal|Supresión de señal|Fuente observable|Campo observable/i.test(r.entity));
  assert(filas.length >= 10, `solo se clasificaron ${filas.length} entidades de QUALITY-11`);
  for (const r of filas) {
    for (const eje of [r.detail, r.list, r.historical]) {
      assert(eje.state !== undefined, `«${r.entity}» tiene un eje sin estado`);
    }
  }
});

check("R3. la ficha de regla imprime TODAS las versiones, no solo la vigente", () => {
  const i = ADAPTERS.indexOf('key: "quality.automation-rule.detail"');
  const bloque = ADAPTERS.slice(i, i + 4000);
  assert(/temporality: "historical"/.test(bloque), "la ficha de regla no es un documento histórico");
  assert(/versions/.test(bloque), "la ficha no recorre las versiones");
  assert(/describeCondition/.test(bloque), "las condiciones no se imprimen en castellano");
});

check("R4. la ficha de señal dice qué, por qué, con qué versión y en qué acabó (§133)", () => {
  const i = ADAPTERS.indexOf('key: "quality.automation-signal.detail"');
  const bloque = ADAPTERS.slice(i, i + 6000);
  for (const trozo of ["Qué se detectó", "Con qué regla", "Por qué se generó",
                       "Datos que la regla miró", "Qué hizo el sistema", "Resolución"]) {
    assert(bloque.includes(trozo), `la ficha de señal no trae «${trozo}»`);
  }
  assert(/Versión de la regla/.test(bloque), "la ficha no dice con qué versión se emitió");
});

check("R5. el informe de ejecución trae alcance, tiempos, reglas, salidas y fallos (§134)", () => {
  const i = ADAPTERS.indexOf('key: "quality.automation-run.detail"');
  const bloque = ADAPTERS.slice(i, i + 6000);
  for (const trozo of ["Alcance", "Empezó", "Terminó", "Sujetos evaluados",
                       "Coincidencias", "Fallos"]) {
    assert(bloque.includes(trozo), `el informe de ejecución no trae «${trozo}»`);
  }
  // §134 · Y ningún secreto.
  const codigo = stripTs(ADAPTERS);
  const j = codigo.indexOf('key: "quality.automation-run.detail"');
  assert(!/AUTOMATION_RUNNER_SECRET|secret|token/i.test(codigo.slice(j, j + 6000)),
    "el informe de ejecución imprime un secreto");
});

check("R6. no hay PDF por evaluación que NO coincidió (§131)", () => {
  assert(!/evaluation\.detail|automation-evaluation/.test(ADAPTERS),
    "se exporta cada evaluación: la inmensa mayoría son «no coincide» y no documentan nada");
});

check("R7. los listados avisan de que retratan el estado de hoy", () => {
  for (const k of ["quality.automation-rule.list", "quality.automation-signal.list",
                   "quality.automation-run.list"]) {
    const i = ADAPTERS.indexOf(`key: "${k}"`);
    const bloque = ADAPTERS.slice(i, i + 5000);
    assert(/historicalLimitReason/.test(bloque), `${k} no explica por qué no es histórico`);
    assert(/currentStateNote/.test(bloque), `${k} no lleva el aviso de estado actual`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nS · LA PANTALLA (§166…§172, AT-42, AT-43)");

check("S1. la automatización tiene su grupo en el menú, con las cuatro vistas", () => {
  const reg = read("lib/modules/registry.ts");
  assert(/QUALITY_AUTOMATIZACION_GROUP/.test(reg), "no hay grupo de automatización");
  for (const href of ["/quality/automation", "/quality/automation/rules",
                      "/quality/automation/signals", "/quality/automation/runs"]) {
    assert(reg.includes(`"${href}"`), `falta la entrada ${href}`);
  }
});

check("S2. el constructor de reglas ofrece CAMPOS del catálogo, no un cuadro de texto", () => {
  assert(/condition_field/.test(COMPONENTS), "no se elige el campo desde una lista");
  assert(!/<textarea[^>]*name="conditions"|dangerouslySetInnerHTML/.test(COMPONENTS),
    "hay un cuadro libre para escribir condiciones");
});

check("S3. la pantalla explica lo que la regla hará ANTES de publicarla (§169)", () => {
  assert(/describeVersion|describeRule/.test(COMPONENTS + DB),
    "no hay vista previa legible de la regla");
  assert(/simulate|Simular/i.test(COMPONENTS), "no se puede simular antes de publicar");
});

check("S4. la señal se lee con su explicación y su origen a la vista", () => {
  assert(/explanationLines/.test(COMPONENTS), "la explicación no se muestra");
  assert(/sourceSnapshot|Datos observados|source_snapshot/.test(COMPONENTS),
    "no se muestra qué datos miró la regla");
});

check("S5. el inicio de Calidad consolida lo que requiere atención (§171)", () => {
  const home = read("app/(app)/(shell)/quality/page.tsx");
  assert(/getAutomationHomeSignals/.test(home), "el inicio no lee las señales abiertas");
  assert(/Requieren atención/.test(home), "no existe la tarjeta consolidada");
  assert(/quality\/automation\/signals/.test(home), "la tarjeta no lleva a las señales");
});

check("S6. un fallo del motor se muestra como avería, no como hallazgo de calidad (§173)", () => {
  const h = functionBody("quality_automation_health");
  assert(/'runs_failed_last_7d'/.test(h) && /'rules_failing'/.test(h),
    "la salud del motor no cuenta sus propios fallos");
  assert(/problema operativo/.test(h),
    "no se distingue la avería del motor de una condición de calidad");
  assert(/automation_engine_failure/.test(RAW_SQL),
    "no existe un tipo de alerta para la avería del motor");
});

check("S7. las cuatro rutas existen y son server components del shell", () => {
  for (const r of ["page.tsx", "rules/page.tsx", "signals/page.tsx", "runs/page.tsx"]) {
    assert(walk(ROUTES_DIR).some((f) => f.endsWith(r)), `falta la ruta ${r}`);
  }
  assert(!/"use client"/.test(ROUTES),
    "alguna ruta de automatización se ejecuta en el navegador");
});

// ---------------------------------------------------------------------------
console.log("\nT · EL PLANIFICADOR (§49, §105, §155, §163, AT-26…AT-28)");

check("T1. el barrido programado entra por el MISMO motor", () => {
  assert(/quality_automation_run/.test(RUNNER), "el planificador no llama al motor único");
  assert(!/insert into quality_signals|from\("quality_signals"\)/.test(RUNNER),
    "el planificador escribe señales por su cuenta");
  assert(/p_mode: "live"/.test(RUNNER), "el planificador no declara el modo");
});

check("T2. sin secreto, el endpoint NO existe: falla cerrado y sin pistas", () => {
  assert(/secreto\.length < 16/.test(RUNNER), "se acepta un secreto trivial");
  assert(/status: 404/.test(RUNNER), "el endpoint distingue «no autorizado» de «no existe»");
  assert((RUNNER.match(/unauthorized\(\)/g) ?? []).length >= 5,
    "hay caminos de salida que no pasan por el rechazo mudo");
});

check("T3. el planificador NO acepta reglas, condiciones ni sujetos por la petición", () => {
  const cuerpo = stripTs(RUNNER);
  assert(!/conditions|rule_id:|p_rule_id: *[^n]/.test(cuerpo.replace(/p_rule_id: null/g, "")),
    "la petición puede elegir qué regla se evalúa o con qué condiciones");
  assert(/UUID\.test/.test(cuerpo), "no se valida la forma de la empresa recibida");
  assert(/FECHA\.test/.test(cuerpo), "no se valida la forma del día recibido");
});

check("T4. una empresa que falle no arrastra a las demás", () => {
  assert(/for \(const org of orgs\)/.test(RUNNER), "no se barre empresa por empresa");
  assert(/failures:/.test(RUNNER), "el resultado no distingue cuántas fallaron");
  assert(FAILURE_IS_ISOLATED.length > 40, "no está escrito");
});

check("T5. la ejecución sin sesión se registra como PROGRAMADA, no como manual", () => {
  assert(/when auth\.uid\(\) is null then 'scheduled' else 'manual' end/.test(RUN),
    "no se distingue el barrido programado del disparado a mano");
  assert(RUN_KINDS.join() === "manual,scheduled,simulation", "los tipos de ejecución cambiaron");
});

check("T5b. el barrido programado NO se queda ciego sin sesión", () => {
  // El proveedor de sujetos comprueba la pertenencia contra la sesión. Sin
  // esta salvedad, el cron entraría, evaluaría cero sujetos y escribiría una
  // ejecución «correcta» que no miró nada: la peor forma de fallar.
  assert(/if auth\.uid\(\) is not null and not is_org_member\(p_organization_id\) then/
    .test(SUBJECTS), "el proveedor de sujetos deja ciego al barrido programado");
});

check("T5c. la duración se mide con el reloj de pared, no con el de la transacción", () => {
  // `now()` es constante dentro de una transacción: usarla daría siempre cero.
  assert(/finished_at = clock_timestamp\(\)/.test(RUN),
    "la ejecución se cierra con la hora de la transacción: la duración sería siempre cero");
  assert(/'running', clock_timestamp\(\)\)/.test(RUN),
    "la ejecución no anota su hora de arranque con el reloj de pared");
});

check("T6. el barrido acota lo que mira: no hay lectura ilimitada (§72, §156)", () => {
  assert(/p_limit/.test(SUBJECTS), "el proveedor de sujetos no tiene tope");
  assert(/limit p_limit/.test(SUBJECTS), "hay ramas que devuelven sujetos sin tope");
  const ramas = (SUBJECTS.match(/limit p_limit/g) ?? []).length;
  const fuentes = (SUBJECTS.match(/elsif p_source_code = '/g) ?? []).length + 1;
  assert(ramas >= fuentes, `${fuentes} fuentes y solo ${ramas} topes`);
});

// ---------------------------------------------------------------------------
console.log("\nU · LA MIGRACIÓN (§158)");

check("U1. QUALITY-11 son DOS migraciones: la 0129 y su corrección 0130", () => {
  // §158 · La 0129 llegó a Staging antes de que apareciera la corrección del
  // barrido programado. A partir de ahí solo se añade: la 0129 no se toca.
  const migraciones = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  assert(migraciones.includes("0129_quality_automation_observation.sql"), "falta la 0129");
  assert(migraciones.includes("0130_quality_automation_scheduled_observers.sql"),
    "falta la corrección 0130");
  assert(migraciones[migraciones.length - 1] === "0130_quality_automation_scheduled_observers.sql",
    "la 0130 no es la última: alguien añadió algo por encima");
});

check("U1b. la corrección toca UNA cosa y no reescribe la 0129", () => {
  assert(!/create table|drop |alter table/.test(SQL_FIX),
    "la corrección cambia el esquema: eso ya no es una corrección");
  const funciones = [...SQL_FIX.matchAll(/create or replace function public\.([a-z0-9_]+)/g)]
    .map((m) => m[1]);
  assert(funciones.length === 1 && funciones[0] === "quality_automation_run",
    `la corrección reescribe ${funciones.join(", ")}`);
  assert(/'skipped'/.test(SQL_FIX) && /No autenticado/.test(SQL_FIX),
    "la corrección no distingue el barrido que exige sesión");
});

check("U2. la migración no reescribe migraciones anteriores", () => {
  assert(!/drop table public\.(quality_|work_)/.test(SQL), "se elimina una tabla existente");
  assert(!/drop function public\.(quality_scan|work_scan)/.test(SQL),
    "se elimina un barrido de un sprint anterior");
  const drops = [...SQL.matchAll(/drop constraint( if exists)? ([a-z0-9_]+)/g)].length;
  const adds = [...SQL.matchAll(/add constraint ([a-z0-9_]+)/g)].length;
  assert(adds >= drops, "se soltó una restricción sin volver a ponerla");
});

check("U3. pgcrypto, si se usa, va cualificado por esquema", () => {
  const sinCualificar = /[^.\w](gen_random_bytes|digest|crypt)\s*\(/.exec(
    SQL.replace(/extensions\.(gen_random_bytes|digest|crypt)/g, "OK")
  );
  assert(sinCualificar === null,
    `«${sinCualificar?.[1]}» se llama sin cualificar: fallaría con search_path = public`);
});

check("U4. la migración siembra CATÁLOGO, no datos de empresa", () => {
  assert(/insert into public\.quality_automation_sources/.test(SQL), "no se siembra el catálogo");
  assert(!/insert into public\.quality_automation_rules\b/.test(SQL),
    "la migración crea reglas de alguna empresa");
  const motorDe0129 = (() => {
    const i = SQL.indexOf("function public.quality_automation_run");
    return SQL.slice(i, SQL.indexOf("$$;", i) + 3);
  })();
  assert(!/insert into quality_signals/.test(SQL.replace(motorDe0129, "")),
    "la migración siembra señales");
});

check("U5. las vistas van como INVOKER: no se saltan la RLS de quien mira", () => {
  const vistas = [...SQL.matchAll(/create or replace view public\.([a-z0-9_]+)/g)].map((m) => m[1]);
  assert(vistas.length === 3, `QUALITY-11 crea ${vistas.length} vistas`);
  for (const v of vistas) {
    const i = SQL.indexOf(`create or replace view public.${v}`);
    assert(/with \(security_invoker = true\)/.test(SQL.slice(i, i + 200)),
      `la vista ${v} no es de invocador`);
    assert(new RegExp(`grant select on public\\.${v} to authenticated`).test(SQL)
      || new RegExp(`grant select on table public\\.${v} to authenticated`).test(SQL),
      `la vista ${v} no concede lectura explícita`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nV · EL DOMINIO PURO (las mismas reglas, en TypeScript)");

check("V1. la forma del valor depende del operador, y solo de él", () => {
  assert(operatorValueShape("is_empty") === "none", "`is_empty` pide valor");
  assert(operatorValueShape("in") === "list", "`in` no pide lista");
  assert(operatorValueShape("days_before") === "integer", "`days_before` no pide entero");
  assert(operatorValueShape("equals") === "scalar", "`equals` no pide escalar");
  for (const op of VALUELESS_OPERATORS) {
    assert(operatorValueShape(op) === "none", `${op} debería no pedir valor`);
  }
  for (const op of INTEGER_OPERATORS) {
    assert(operatorValueShape(op) === "integer", `${op} debería pedir un entero`);
  }
  for (const op of LIST_OPERATORS) {
    assert(operatorValueShape(op) === "list", `${op} debería pedir una lista`);
  }
});

check("V2. la validación del navegador rechaza campo y operador fuera del catálogo", () => {
  const permitidos = { due_on: { operators: ["days_before"], label: "Vence el" } };
  assert(validateConditions([{ field: "inventado", operator: "equals", value: "x" }],
    permitidos).length > 0, "acepta un campo que no existe");
  assert(validateConditions([{ field: "due_on", operator: "equals", value: "x" }],
    permitidos).length > 0, "acepta un operador no permitido para ese campo");
  assert(validateConditions([{ field: "due_on", operator: "days_before", value: 7 }],
    permitidos).length === 0, "rechaza una condición correcta");
  assert(validateConditions([], permitidos).length > 0,
    "acepta una regla sin condiciones: marcaría a todos");
});

check("V3. una condición se explica en castellano, sin jerga de base de datos", () => {
  const frase = describeCondition(
    { field: "due_on", operator: "days_before", value: 7 }, "Vence el");
  assert(/Vence el/.test(frase), "la frase no usa la etiqueta del campo");
  assert(!/due_on|days_before|SELECT|jsonb/i.test(frase),
    "la frase filtra nombres técnicos a la pantalla");
});

check("V4. el resumen de una ejecución cuenta lo que hizo, no lo que miró", () => {
  const frase = describeRun({
    rulesEvaluated: 5, subjectsEvaluated: 120, matches: 3,
    signalsCreated: 2, alertsCreated: 2, tasksCreated: 1, failures: 0,
  });
  assert(/5/.test(frase) && /2/.test(frase), "el resumen no dice cuántas reglas ni cuántas señales");
  assert(RUN_COUNTS_WHAT_IT_CREATED.length > 40, "no está escrito");
});

check("V5. los permisos son los tres roles del dominio, y publicar es más estrecho", () => {
  for (const rol of ["admin", "quality", "consultant"]) {
    assert(canReadAutomation(rol), `${rol} no puede leer`);
    assert(canManageAutomation(rol), `${rol} no puede gestionar`);
  }
  assert(canPublishAutomation("admin") && canPublishAutomation("quality"),
    "quien conduce el sistema no puede publicar");
  assert(!canPublishAutomation("consultant"),
    "el consultor externo puede publicar reglas que observan a la empresa");
  // Leer lo puede hacer cualquier miembro —es lo mismo que dice la política de
  // la base, `is_org_member`—; gestionar y publicar, no.
  assert(canReadAutomation("member"), "un miembro de la empresa no puede leer");
  assert(!canManageAutomation("member") && !canPublishAutomation("member"),
    "un miembro cualquiera puede crear o publicar reglas");
  assert(/is_org_member\(organization_id\)/.test(
    SQL.slice(SQL.indexOf("create policy quality_signals_select"), SQL.indexOf("create policy quality_signals_select") + 200)),
    "la lectura de señales no se apoya en la pertenencia a la empresa");
  // Y lo mismo en la base.
  assert(/'admin', 'quality'\]/.test(functionBody("quality_publishes_automation")),
    "la base no acota quién publica");
});

check("V6. los catálogos del dominio y los de la base dicen lo mismo", () => {
  for (const s of SEVERITIES) assert(RAW_SQL.includes(`'${s}'`), `falta la gravedad ${s}`);
  for (const s of SIGNAL_STATUSES) assert(RAW_SQL.includes(`'${s}'`), `falta el estado ${s}`);
  for (const d of AUTOMATION_DOMAINS) assert(RAW_SQL.includes(`'${d}'`), `falta el dominio ${d}`);
  assert(SEVERITY_IS_DECLARED.length > 40,
    "la gravedad no se explica como declaración de la regla");
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
