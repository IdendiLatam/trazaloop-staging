/**
 * Trazaloop · QUALITY-10 · Puras y estáticas.
 *
 * Comprueban que las separaciones de RD existan EN EL CÓDIGO y no solo en la
 * prosa del informe:
 *
 *   REVISIÓN POR LA DIRECCIÓN ≠ TABLERO
 *   ENTRADA ≠ DECISIÓN
 *   DATO ≠ CONCLUSIÓN
 *   DECISIÓN ≠ ACCIÓN
 *   ACCIÓN ≠ TAREA
 *   ACTA ≠ BITÁCORA TÉCNICA
 *   ESTADO ACTUAL ≠ RETRATO HISTÓRICO
 *
 * y que lo que este dominio NO debe ser —un segundo motor de acciones, un
 * segundo motor documental, un módulo financiero, una IA que concluye— no se
 * haya colado por una tabla, un enum o un cálculo.
 *
 * Los bloques más importantes son el de DECISIÓN ≠ ACCIÓN, que busca la rama
 * por la que registrar una decisión podría crear trabajo solo; el de SIN DATO
 * ≠ CERO; y el de ANONIMATO, que comprueba que la entrada de voz del cliente
 * no puede leer una respuesta ni con el UUID en la mano.
 *
 * Ninguna toca base de datos ni red.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aiConcludes, canCloseManagementReview, canManageManagementReview,
  canReadManagementReview, DECISION_KINDS, decisionCreatesAction,
  describeDecisionOutcome, describeFollowUp, describeLineage, describeReadiness,
  INPUT_CODES, INPUT_MODES, INPUT_STATES, isInputAttended, MANUAL_ENTRY_KINDS,
  PARTICIPATION_ROLES, readinessBreakdown, RESOURCE_KINDS, REVIEW_KINDS,
  REVIEW_STATUSES, snapshotIsAvailable,
} from "../../lib/domain/quality-management-review";
import { EXPORT_INVENTORY, promisedKeys } from "../../lib/export/inventory";
import {
  ALERT_TYPES, ALERT_TYPE_LABEL, SUBJECT_TYPES, TASK_TYPES, TASK_TYPE_LABEL,
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

const MIG = "supabase/migrations/0128_quality_management_review.sql";
const SQL = stripSql(read(MIG));
const RAW_SQL = read(MIG);
const DOMAIN = read("lib/domain/quality-management-review.ts");
const DB = read("lib/db/quality-management-review.ts");
const ACTIONS = read("server/actions/quality-management-review.ts");
const ADAPTERS = read("lib/export/adapters/quality-management-review.ts");

const COMPONENTS_DIR = "components/domain/quality/management-review";
const componentFiles = readdirSync(join(ROOT, COMPONENTS_DIR)).filter((f) => f.endsWith(".tsx"));
const COMPONENTS = componentFiles.map((f) => read(join(COMPONENTS_DIR, f))).join("\n");

const ROUTES_DIR = "app/(app)/(shell)/quality/management-review";
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...walk(join(dir, e.name)));
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(join(dir, e.name));
  }
  return out;
}
const routeFiles = walk(ROUTES_DIR);
const ROUTES = routeFiles.map((f) => read(f)).join("\n");

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

console.log("\nQUALITY-10 · puras y estáticas\n");

// ---------------------------------------------------------------------------
console.log("A · LA REVISIÓN Y SU IDENTIDAD (§6, §7, §10, RD-01, RD-11)");

check("A1. la revisión tiene identidad estable y código único por empresa", () => {
  assert(/create table public\.quality_management_reviews/.test(SQL), "no existe la revisión");
  const cuerpo = tableBody("quality_management_reviews");
  assert(/code\s+text not null/.test(cuerpo), "la revisión no tiene código");
  assert(/unique \(organization_id, code\)/.test(SQL),
    "dos revisiones podrían llevar el mismo código en la misma empresa");
});

check("A2. la revisión DECLARA el periodo que analiza", () => {
  const cuerpo = tableBody("quality_management_reviews");
  assert(/period_start\s+date not null/.test(cuerpo), "no hay inicio de periodo");
  assert(/period_end\s+date not null/.test(cuerpo), "no hay fin de periodo");
  assert(/period_end >= period_start/.test(cuerpo), "el periodo puede terminar antes de empezar");
});

check("A3. REVISIÓN ≠ REUNIÓN: la sesión es una fecha, no otra entidad", () => {
  assert(!/create table public\.quality_management_review_meetings/.test(SQL),
    "se creó una tabla de reuniones que compite con la revisión");
  const cuerpo = tableBody("quality_management_reviews");
  assert(/session_held_on\s+date/.test(cuerpo), "la revisión no sabe cuándo fue la sesión");
  assert(!/session_held_on\s+date not null/.test(cuerpo),
    "la revisión exige fecha de sesión: no se podría preparar antes de convocarla");
  assert(/REVIEW_IS_NOT_A_MEETING/.test(DOMAIN), "no se dice que revisión ≠ reunión");
});

check("A4. tres naturalezas, y la frecuencia NO está clavada", () => {
  for (const k of REVIEW_KINDS) {
    assert(tableBody("quality_management_reviews").includes(`'${k}'`),
      `la base no admite la naturaleza «${k}»`);
  }
  assert(REVIEW_KINDS.includes("extraordinary") && REVIEW_KINDS.includes("thematic"),
    "faltan la extraordinaria o la temática");
  assert(!/annual|anual/i.test(stripSql(tableBody("quality_management_reviews"))),
    "la tabla habla de anualidad");
  assert(/FREQUENCY_IS_CONFIGURABLE/.test(DOMAIN), "no se dice que la frecuencia es configurable");
  assert(/next_review_planned_on/.test(tableBody("quality_management_reviews")),
    "no se puede programar la próxima revisión");
});

check("A5. la responsabilidad persistente es del CARGO", () => {
  const cuerpo = tableBody("quality_management_reviews");
  assert(/owner_position_id\s+uuid/.test(cuerpo), "la revisión no tiene cargo responsable");
  assert(!/owner_person_id|owner_profile_id/.test(cuerpo),
    "la responsabilidad cuelga de una persona: cambiar de titular la perdería");
});

check("A6. REVISIÓN ≠ TABLERO, dicho donde se produce la confusión", () => {
  assert(/REVIEW_IS_NOT_A_DASHBOARD/.test(DOMAIN), "no existe la advertencia");
  assert(/REVIEW_IS_NOT_A_DASHBOARD/.test(COMPONENTS), "la pantalla no lo dice");
  assert(/REVIEW_IS_NOT_A_DASHBOARD/.test(ADAPTERS), "el papel no lo dice");
});

check("A7. REVISIÓN ≠ AUDITORÍA", () => {
  assert(/REVIEW_IS_NOT_AN_AUDIT/.test(DOMAIN), "no existe la advertencia");
  assert(/REVIEW_IS_NOT_AN_AUDIT/.test(COMPONENTS), "la pantalla no lo dice");
  // La auditoría entra como ENTRADA, no como resultado.
  assert(INPUT_CODES.includes("audits"), "las auditorías no son una entrada");
});

// ---------------------------------------------------------------------------
console.log("\nB · EL CATÁLOGO DE ENTRADAS (§13, §14)");

check("B1. catorce entradas, en un catálogo estructurado", () => {
  assert(/create table public\.quality_management_review_input_catalog/.test(SQL),
    "no existe el catálogo");
  assert(INPUT_CODES.length === 14, `hay ${INPUT_CODES.length} entradas, se esperaban 14`);
  for (const c of INPUT_CODES) {
    assert(SQL.includes(`('${c}',`), `la base no siembra la entrada «${c}»`);
  }
});

check("B2. TIPO DE ENTRADA ≠ VALOR DE LA ENTRADA", () => {
  const revision = tableBody("quality_management_reviews");
  for (const c of INPUT_CODES) {
    assert(!revision.includes(c),
      `«${c}» es una columna de la revisión: catorce columnas gigantes en vez de un modelo`);
  }
  assert(/create table public\.quality_management_review_inputs/.test(SQL),
    "no existe la instancia de entrada");
  assert(/catalog_code\s+text not null/.test(tableBody("quality_management_review_inputs")),
    "la instancia no apunta al catálogo");
});

check("B3. el catálogo es GLOBAL, no por empresa", () => {
  const cuerpo = tableBody("quality_management_review_input_catalog");
  assert(!/organization_id/.test(cuerpo),
    "cada empresa podría inventarse sus entradas: dos revisiones dejarían de ser comparables");
  assert(/grant select on table public\.quality_management_review_input_catalog to authenticated/.test(SQL),
    "el catálogo no se puede leer");
  assert(!/grant (insert|update|delete)[^;]*quality_management_review_input_catalog/.test(SQL),
    "el catálogo se puede reescribir desde la aplicación");
});

check("B4. las catorce entradas obligatorias cubren lo que hay que mirar", () => {
  const esperadas = [
    "previous_actions", "changes", "system_performance", "customer_voice",
    "objectives", "process_performance", "product_conformity",
    "nonconformities_actions", "monitoring_results", "audits",
    "supplier_performance", "resources_adequacy", "risk_action_effectiveness",
    "improvement_opportunities",
  ];
  for (const e of esperadas) {
    assert((INPUT_CODES as readonly string[]).includes(e), `falta la entrada ${e}`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nC · AUTOMÁTICA ≠ MANUAL · LINAJE (§15, §16, §17, §58)");

check("C1. la entrada sabe si la trajo el sistema o una persona", () => {
  const cuerpo = tableBody("quality_management_review_inputs");
  assert(/input_mode\s+text not null/.test(cuerpo), "no se distingue automática de manual");
  for (const m of INPUT_MODES) {
    assert(cuerpo.includes(`'${m}'`), `la base no admite el modo «${m}»`);
  }
  assert(/MANUAL_INPUT_IS_DECLARED/.test(DOMAIN), "no se dice que la manual se declara");
  assert(/MANUAL_INPUT_IS_DECLARED/.test(COMPONENTS), "la pantalla no lo dice");
});

check("C2. ningún dato sin origen", () => {
  const cuerpo = tableBody("quality_management_review_inputs");
  for (const col of ["source_domain", "source_period_start", "source_period_end",
                     "prepared_at", "prepared_by", "source_fingerprint"]) {
    assert(new RegExp(`${col}\\s`).test(cuerpo), `la entrada no guarda ${col}`);
  }
  assert(/state not in \('prepared', 'reviewed'\)[\s\S]{0,200}prepared_at is not null/.test(cuerpo),
    "una entrada preparada podría no decir cuándo ni de qué periodo");
});

check("C3. cada adaptador devuelve su LINAJE", () => {
  const adaptadores = [...SQL.matchAll(/function public\.(quality_mr_src_[a-z_]+)\(/g)]
    .map((m) => m[1]);
  assert(adaptadores.length >= 12, `solo ${adaptadores.length} adaptadores`);
  for (const a of adaptadores) {
    const f = functionBody(a);
    assert(/'lineage'/.test(f), `${a} no devuelve linaje: sería un número mágico`);
  }
  assert(/NO_MAGIC_NUMBERS/.test(DOMAIN), "no se dice que no hay números mágicos");
  assert(/describeLineage/.test(COMPONENTS), "la pantalla no muestra el linaje");
});

check("C4. la entrada manual conserva autor, fecha, contenido y categoría", () => {
  assert(/create table public\.quality_management_review_manual_entries/.test(SQL),
    "no existen las entradas manuales estructuradas");
  const cuerpo = tableBody("quality_management_review_manual_entries");
  assert(/recorded_by\s+uuid/.test(cuerpo), "no guarda autor");
  assert(/recorded_on\s+date not null/.test(cuerpo), "no guarda fecha");
  assert(/entry_kind\s+text not null/.test(cuerpo), "no guarda categoría");
  assert(/body\s+text not null/.test(cuerpo), "no guarda contenido");
  for (const k of MANUAL_ENTRY_KINDS) {
    assert(cuerpo.includes(`'${k}'`), `la base no admite la categoría «${k}»`);
  }
});

check("C5. la adecuación de recursos se REGISTRA; no se calcula", () => {
  const cuerpo = tableBody("quality_management_review_manual_entries");
  for (const k of RESOURCE_KINDS) {
    assert(cuerpo.includes(`'${k}'`), `la base no admite el recurso «${k}»`);
  }
  assert(!/budget_amount|cost|currency|presupuesto_monto/i.test(SQL),
    "se coló un módulo financiero");
  assert(/RESOURCES_ARE_JUDGED_NOT_CALCULATED/.test(DOMAIN), "no se dice quién juzga");
  assert(/RESOURCES_ARE_JUDGED_NOT_CALCULATED/.test(COMPONENTS), "la pantalla no lo dice");
});

// ---------------------------------------------------------------------------
console.log("\nD · SIN DATO ≠ CERO · NO APLICA ≠ FALTANTE (§35, §36, §78)");

check("D1. cinco estados, y los tres que importan son distintos", () => {
  const cuerpo = tableBody("quality_management_review_inputs");
  for (const s of INPUT_STATES) {
    assert(cuerpo.includes(`'${s}'`), `la base no admite el estado «${s}»`);
  }
  assert((INPUT_STATES as readonly string[]).includes("missing"), "no existe «sin datos»");
  assert((INPUT_STATES as readonly string[]).includes("not_applicable"), "no existe «no aplica»");
  assert((INPUT_STATES as readonly string[]).includes("pending"), "no existe «pendiente»");
});

check("D2. «no aplica» exige razón escrita, en la base", () => {
  const cuerpo = tableBody("quality_management_review_inputs");
  assert(/state <> 'not_applicable'[\s\S]{0,160}not_applicable_reason/.test(cuerpo),
    "se puede marcar «no aplica» sin decir por qué");
});

check("D3. faltante SÍ está mirada; pendiente NO", () => {
  assert(isInputAttended("missing") === true, "«sin datos» se cuenta como no mirada");
  assert(isInputAttended("not_applicable") === true, "«no aplica» se cuenta como no mirada");
  assert(isInputAttended("pending") === false, "«pendiente» se cuenta como mirada");
});

check("D4. ningún adaptador convierte «sin dato» en cero", () => {
  const adaptadores = [...SQL.matchAll(/function public\.(quality_mr_src_[a-z_]+)\(/g)]
    .map((m) => m[1]);
  for (const a of adaptadores) {
    const f = functionBody(a);
    assert(/'available'/.test(f), `${a} no dice si había dato`);
  }
  // Y el resumen lo dice con palabras antes que con números.
  const resumen = functionBody("quality_mr_summarize");
  assert(/NO significa satisfacción cero|no se sustituye por cero|no se midió/i.test(resumen),
    "el resumen no explica que sin dato no es cero");
});

check("D5. las dos frases están en el dominio, la pantalla y el papel", () => {
  for (const src of [DOMAIN, COMPONENTS, ADAPTERS]) {
    assert(/MISSING_IS_NOT_ZERO/.test(src), "falta «sin dato no es cero»");
  }
  assert(/NOT_APPLICABLE_IS_NOT_MISSING/.test(DOMAIN), "falta «no aplica no es faltante»");
  assert(/NOT_APPLICABLE_IS_NOT_MISSING/.test(COMPONENTS), "la pantalla no lo dice");
});

// ---------------------------------------------------------------------------
console.log("\nE · DATO ≠ CONCLUSIÓN · EL ANÁLISIS NO SE PIERDE (§37, §43, §55)");

check("E1. el análisis vive en columnas propias, al lado del dato", () => {
  const cuerpo = tableBody("quality_management_review_inputs");
  assert(/snapshot\s+jsonb/.test(cuerpo), "no hay retrato del dato");
  assert(/analysis\s+text/.test(cuerpo), "no hay análisis humano");
  assert(/conclusion\s+text/.test(cuerpo), "no hay conclusión humana");
  assert(/analysis_by\s+uuid/.test(cuerpo), "el análisis no dice quién lo escribió");
});

check("E2. preparar NO borra el análisis", () => {
  const f = functionBody("quality_mr_prepare_inputs");
  const conflicto = f.slice(f.indexOf("do update"));
  for (const col of ["analysis", "conclusion", "requires_decision"]) {
    assert(!new RegExp(`\\n\\s+${col}\\s*=`).test(conflicto),
      `el «do update» reescribe ${col}: un refresco se llevaría lo que alguien escribió`);
  }
  assert(/REFRESH_KEEPS_ANALYSIS/.test(DOMAIN), "no se promete que el análisis sobrevive");
});

check("E3. refrescar tampoco", () => {
  const f = functionBody("quality_mr_refresh_input");
  const set = f.slice(f.indexOf("set "), f.indexOf("where id = p_input_id"));
  for (const col of ["analysis", "conclusion", "requires_decision"]) {
    assert(!new RegExp(`\\b${col}\\s*=`).test(set),
      `refrescar reescribe ${col}`);
  }
});

check("E4. la revisión NO modifica el dato de origen", () => {
  const adaptadores = [...SQL.matchAll(/function public\.(quality_mr_src_[a-z_]+)\(/g)]
    .map((m) => m[1]);
  for (const a of adaptadores) {
    const f = functionBody(a);
    assert(!/insert into|update |delete from/.test(f),
      `${a} escribe en el dominio de origen: la dirección estaría corrigiendo el número que le incomoda`);
  }
});

check("E5. la conclusión formal es humana", () => {
  assert(/conclusions\s+text/.test(tableBody("quality_management_reviews")),
    "la revisión no tiene conclusiones propias");
  const cerrar = functionBody("quality_mr_close_review");
  assert(/conclusions/.test(cerrar) && /raise exception/.test(cerrar),
    "se puede cerrar sin conclusiones");
  assert(!/conclusions\s*:=|set conclusions\s*=/.test(functionBody("quality_mr_issue_minutes")),
    "el sistema escribe las conclusiones solo");
});

// ---------------------------------------------------------------------------
console.log("\nF · FUENTE ACTUALIZADA (§56, §57, §85)");

check("F1. la entrada guarda la HUELLA del dato preparado", () => {
  assert(/source_fingerprint\s+text/.test(tableBody("quality_management_review_inputs")),
    "no hay huella: no se podría saber si la fuente cambió");
  assert(/md5\(/.test(SQL), "la huella no se calcula");
});

check("F2. la comprobación de frescura NO sustituye nada", () => {
  const f = functionBody("quality_mr_input_freshness");
  assert(/'source_updated'/.test(f), "no dice si la fuente cambió");
  assert(!/update quality_management_review_inputs/.test(f),
    "comprobar la frescura reescribe el retrato: sustitución silenciosa");
  assert(/stable/.test(f), "la función no está declarada estable");
});

check("F3. refrescar es un acto SEPARADO y consciente", () => {
  assert(/quality_mr_refresh_input/.test(SQL), "no existe el refresco explícito");
  assert(/refreshInputAction/.test(ACTIONS), "no hay acción de refrescar");
  assert(/SOURCE_UPDATED_IS_ANNOUNCED/.test(DOMAIN), "no se dice que se avisa");
  assert(/FUENTE ACTUALIZADA/.test(COMPONENTS), "la pantalla no lo enseña");
});

check("F4. una revisión cerrada no se refresca", () => {
  const f = functionBody("quality_mr_refresh_input");
  assert(/'closed'/.test(f) && /raise exception/.test(f),
    "se puede refrescar el retrato de una revisión cerrada");
});

// ---------------------------------------------------------------------------
console.log("\nG · PREPARACIÓN Y ESTADO DE LISTO (§34, §55)");

check("G1. la plataforma prepara de verdad", () => {
  const f = functionBody("quality_mr_prepare_inputs");
  assert(/quality_mr_source_payload/.test(f), "no llama a los adaptadores");
  assert(/quality_management_review_input_catalog/.test(f), "no recorre el catálogo");
  assert(/PREPARATION_IS_REAL_WORK/.test(DOMAIN), "no se dice por qué");
});

check("G2. el estado de listo distingue los cuatro casos", () => {
  const f = functionBody("quality_mr_readiness");
  for (const k of ["'ready'", "'missing'", "'not_applicable'", "'requires_manual_review'"]) {
    assert(f.includes(k), `el estado de listo no informa ${k}`);
  }
  assert(/'is_ready'/.test(f), "no dice si está lista");
});

check("G3. NO dice «100 %» si falta algo obligatorio", () => {
  const r = {
    requiredInputs: 14, ready: 10, missing: 1, notApplicable: 1,
    requiresManualReview: 1, pending: 1, withoutAnalysis: 3, isReady: false,
  };
  const frase = describeReadiness(r);
  assert(/no está lista/i.test(frase), `dijo «${frase}» con entradas pendientes`);
  assert(!/100|todo listo/i.test(frase), "promete que está listo");
  assert(readinessBreakdown(r).length === 5, "el desglose no explica los cinco casos");
});

check("G4. y sí lo dice cuando de verdad lo está", () => {
  const frase = describeReadiness({
    requiredInputs: 14, ready: 12, missing: 1, notApplicable: 1,
    requiresManualReview: 0, pending: 0, withoutAnalysis: 0, isReady: true,
  });
  assert(/Lista/.test(frase), `dijo «${frase}» con todo preparado`);
});

// ---------------------------------------------------------------------------
console.log("\nH · DECISIÓN ≠ ACCIÓN (§41, §42, §82) · el núcleo");

check("H1. la decisión es un objeto histórico propio", () => {
  assert(/create table public\.quality_management_review_decisions/.test(SQL),
    "no existe la decisión");
  const cuerpo = tableBody("quality_management_review_decisions");
  for (const col of ["topic", "decision", "rationale", "expected_result",
                     "decided_by", "decided_on"]) {
    assert(new RegExp(`${col}\\s`).test(cuerpo), `la decisión no guarda ${col}`);
  }
});

check("H2. la decisión NO tiene ninguna columna de acción", () => {
  const cuerpo = tableBody("quality_management_review_decisions");
  assert(!/action_id|work_action/.test(cuerpo),
    "la decisión apunta a UNA acción: una decisión puede tener muchas");
  assert(!/create table public\.quality_management_review_actions/.test(SQL),
    "se creó un motor de acciones paralelo");
});

check("H3. registrar una decisión NO crea ninguna acción", () => {
  const f = functionBody("quality_mr_record_decision");
  assert(!/insert into work_actions/.test(f),
    "REGISTRAR UNA DECISIÓN CREA UNA ACCIÓN");
  assert(!/insert into work_tasks/.test(f),
    "registrar una decisión crea una tarea");
  for (const k of DECISION_KINDS) {
    assert(decisionCreatesAction(k) === false, `la decisión ${k} crea acción`);
  }
  const a = stripTs(ACTIONS);
  const i = a.indexOf("export async function recordDecisionAction");
  const j = a.indexOf("export async function updateDecisionAction");
  assert(!/createActionFromDecision|work_actions/.test(a.slice(i, j)),
    "la acción de registrar decisión crea una acción");
});

check("H4. crear la acción es un acto SEPARADO y explícito", () => {
  assert(/quality_mr_create_action_from_decision/.test(SQL), "no existe la creación explícita");
  const f = functionBody("quality_mr_create_action_from_decision");
  assert(/insert into work_actions/.test(f), "no usa el motor de acciones");
  assert(/work_references/.test(f), "no ata la acción a la decisión");
  assert(/'management_review_decision'/.test(f), "la atadura no dice de qué decisión salió");
});

check("H5. una decisión puede tener CERO acciones, legítimamente", () => {
  assert(/DECISION_MAY_HAVE_NO_ACTIONS/.test(DOMAIN), "no se dice");
  assert(/DECISION_MAY_HAVE_NO_ACTIONS/.test(COMPONENTS), "la pantalla no lo dice");
  const frase = describeDecisionOutcome({
    actionCount: 0, openActionCount: 0, effectiveActionCount: 0,
  });
  assert(/Sin acciones/.test(frase), `dijo «${frase}» con cero acciones`);
  assert(/puede no necesitarlas/i.test(frase), "no explica que es legítimo");
});

check("H6. «1 decisión · 2 acciones» se ve como dos números", () => {
  const frase = describeDecisionOutcome({
    actionCount: 2, openActionCount: 1, effectiveActionCount: 0,
  });
  assert(/2 acciones/.test(frase), `dijo «${frase}»`);
  assert(/v_quality_management_review_decision_actions/.test(SQL),
    "no hay vista que separe decisiones de acciones");
  assert(/action_count/.test(SQL), "la vista no cuenta las acciones aparte");
});

check("H7. DECISIÓN ≠ ACCIÓN, dicho en el dominio, la pantalla y el papel", () => {
  for (const src of [DOMAIN, COMPONENTS, ADAPTERS]) {
    assert(/DECISION_IS_NOT_AN_ACTION/.test(src), "falta la advertencia");
  }
});

// ---------------------------------------------------------------------------
console.log("\nI · SE REUSA EL MOTOR TRANSVERSAL (§42, §43, §51, §52, RD-19)");

check("I1. no se creó un segundo motor de nada", () => {
  for (const t of ["quality_management_review_actions", "quality_management_review_tasks",
                   "quality_management_review_alerts", "quality_management_review_documents",
                   "quality_management_review_events"]) {
    assert(!new RegExp(`create table public\\.${t}\\b`).test(SQL),
      `se creó ${t}: un motor paralelo`);
  }
  assert(!/storage\.buckets/.test(SQL), "la migración crea un bucket propio");
});

check("I2. los catálogos transversales se AMPLÍAN, no se sustituyen", () => {
  for (const t of ["work_tasks", "work_alerts", "work_events", "work_decisions",
                   "work_references"]) {
    assert(new RegExp(`alter table public\\.${t}\\s+drop constraint`).test(SQL),
      `${t} no se amplía`);
    assert(new RegExp(`alter table public\\.${t}\\s+add constraint`).test(SQL),
      `${t} se soltó sin volver a restringirse`);
  }
});

check("I3. la bandeja conoce las tareas nuevas", () => {
  for (const t of ["management_review_preparation", "management_review_input",
                   "management_review_analysis", "management_review_closure",
                   "management_review_action_followup"]) {
    assert((TASK_TYPES as readonly string[]).includes(t), `falta la tarea ${t}`);
    assert(TASK_TYPE_LABEL[t as keyof typeof TASK_TYPE_LABEL], `${t} no tiene etiqueta`);
    assert(new RegExp(`'${t}'`).test(SQL), `la base no admite la tarea ${t}`);
  }
});

check("I4. y los avisos nuevos, en los dos lados", () => {
  for (const a of ["management_review_due", "management_review_overdue",
                   "management_review_input_pending", "management_review_source_updated",
                   "management_review_action_overdue", "management_review_followup_pending"]) {
    assert((ALERT_TYPES as readonly string[]).includes(a), `falta el aviso ${a}`);
    assert(ALERT_TYPE_LABEL[a as keyof typeof ALERT_TYPE_LABEL], `${a} no tiene etiqueta`);
    assert(new RegExp(`'${a}'`).test(SQL), `la base no admite el aviso ${a}`);
  }
});

check("I5. los tipos de asunto llevan a una pantalla que existe", () => {
  const vista = read("components/domain/quality/tasks-view.tsx");
  for (const s of ["quality_management_review", "quality_management_review_input",
                   "quality_management_review_decision"]) {
    assert((SUBJECT_TYPES as readonly string[]).includes(s), `falta el asunto ${s}`);
    assert(new RegExp(`case "${s}"`).test(vista), `${s} no tiene destino en la bandeja`);
  }
});

check("I6. §19 · las acciones de la revisión ANTERIOR se leen, no se copian", () => {
  const f = functionBody("quality_mr_src_previous_actions");
  assert(/work_actions/.test(f), "no lee el motor de acciones");
  assert(/work_references/.test(f), "no resuelve la atadura por el motor de referencias");
  assert(!/insert into|update /.test(f), "duplica las acciones anteriores");
  for (const k of ["'open'", "'completed'", "'overdue'", "'effective'", "'not_effective'"]) {
    assert(f.includes(k), `no sabe responder ${k}`);
  }
});

check("I7. el validador de referencias conoce los tres tipos nuevos", () => {
  const f = functionBody("work_reference_must_be_valid");
  for (const k of ["quality_management_review", "quality_management_review_input",
                   "quality_management_review_decision"]) {
    assert(f.includes(`'${k}'`), `el validador no conoce ${k}`);
  }
  assert(/no es de esta empresa/.test(f), "el validador no comprueba la empresa");
});

// ---------------------------------------------------------------------------
console.log("\nJ · EL ACTA Y LA VERDAD HISTÓRICA (§45, §49, §50, §75, §79)");

check("J1. el acta guarda su propia instantánea", () => {
  assert(/create table public\.quality_management_review_minutes/.test(SQL), "no existe el acta");
  assert(/snapshot\s+jsonb not null/.test(tableBody("quality_management_review_minutes")),
    "el acta no congela nada");
  const f = functionBody("quality_mr_issue_minutes");
  for (const k of ["'participants'", "'inputs'", "'decisions'", "'agenda'"]) {
    assert(f.includes(k), `la foto no incluye ${k}`);
  }
});

check("J2. el acta se DERIVA del modelo, no de un blob de notas", () => {
  const f = functionBody("quality_mr_issue_minutes");
  assert(/quality_management_review_inputs/.test(f), "el acta no lee las entradas");
  assert(/quality_management_review_decisions/.test(f), "el acta no lee las decisiones");
  assert(/quality_management_review_participants/.test(f), "el acta no lee los participantes");
  // Las notas complementan; no son el acta.
  assert(/create table public\.quality_management_review_notes/.test(SQL),
    "no existen las notas complementarias");
});

check("J3. la foto incluye el ANÁLISIS tal como se escribió", () => {
  const f = functionBody("quality_mr_issue_minutes");
  assert(/'analysis'/.test(f), "el acta no congela el análisis");
  assert(/'snapshot', i\.snapshot/.test(f), "el acta no congela el dato de cada entrada");
});

check("J4. un acta emitida NO se edita ni se borra", () => {
  assert(/supersedes_id\s+uuid/.test(tableBody("quality_management_review_minutes")),
    "no se puede corregir un acta con otra");
  assert(!/on public\.quality_management_review_minutes\s+for (all|update|delete|insert)/.test(SQL),
    "el acta tiene política de escritura: dejaría de ser un acta");
  assert(/grant select on table public\.quality_management_review_minutes to authenticated/.test(SQL),
    "el acta no se puede leer");
  assert(!/grant [a-z, ]*(insert|update|delete)[a-z, ]* on table public\.quality_management_review_minutes/.test(SQL),
    "el acta se puede escribir directamente");
});

check("J5. el PDF del acta se imprime DESDE la instantánea", () => {
  const a = ADAPTERS.slice(ADAPTERS.indexOf("qualityManagementReviewMinutes"));
  assert(/minutes\.snapshot/.test(a), "el PDF del acta no lee la instantánea");
  assert(/temporality: "historical"/.test(a), "el acta no se declara documento del pasado");
});

check("J6. RD-18 · el acta puede ser una revisión de documento controlado", () => {
  const cuerpo = tableBody("quality_management_review_minutes");
  assert(/document_revision_id\s+uuid/.test(cuerpo),
    "el acta no se puede atar a una revisión documental");
  assert(/trazadoc_document_revisions/.test(SQL), "no se usa el motor documental existente");
  assert(!/create table public\.quality_management_review_documents/.test(SQL),
    "se creó un segundo motor documental para conseguirlo");
});

check("J7. una revisión cerrada NO cambia en silencio", () => {
  assert(/quality_mr_review_is_closed/.test(SQL), "no hay guarda de revisión cerrada");
  const f = functionBody("quality_mr_review_is_closed");
  assert(/raise exception/.test(f), "la guarda no rechaza nada");
  assert(/quality_mr_closed_is_final/.test(SQL), "el periodo y las conclusiones se pueden reescribir");
  const g = functionBody("quality_mr_closed_is_final");
  for (const col of ["period_start", "period_end", "conclusions", "closure_note"]) {
    assert(g.includes(col), `${col} se puede cambiar tras cerrar`);
  }
  assert(/CLOSED_REVIEW_IS_IMMUTABLE/.test(DOMAIN), "no se dice");
});

check("J8. las cinco tablas hijas quedan congeladas al cerrar", () => {
  for (const t of ["inputs", "decisions", "participants", "manual_entries", "agenda_items"]) {
    assert(new RegExp(`on public\\.quality_management_review_${t}\\s+for each row execute function public\\.quality_mr_review_is_closed`).test(SQL),
      `quality_management_review_${t} se puede tocar con la revisión cerrada`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nK · CERRAR ≠ CERRAR LAS ACCIONES · SEGUIMIENTO VIVO (§45, §48, §84)");

check("K1. cerrar NO exige acciones terminadas", () => {
  const f = functionBody("quality_mr_close_review");
  assert(!/status in \('planned', 'in_progress'\)[\s\S]{0,200}raise exception/.test(f),
    "cerrar exige que las acciones estén terminadas");
  assert(/p_followup_note/.test(f), "cerrar no permite decir qué queda abierto");
});

check("K2. cerrar SÍ exige entradas miradas, análisis y decisiones", () => {
  const f = functionBody("quality_mr_close_review");
  assert(/state = 'pending'/.test(f), "se puede cerrar con entradas sin mirar");
  assert(/analysis/.test(f), "se puede cerrar sin análisis");
  assert(/quality_management_review_decisions/.test(f) && /raise exception/.test(f),
    "se puede cerrar sin ninguna decisión");
});

check("K3. el seguimiento se lee AHORA, del motor de acciones", () => {
  const f = functionBody("quality_mr_followup");
  assert(/work_actions/.test(f), "el seguimiento no lee las acciones");
  assert(/stable/.test(f), "el seguimiento escribe algo");
  const cuerpo = tableBody("quality_management_reviews");
  assert(!/open_action_count|action_count/.test(cuerpo),
    "el conteo de acciones está copiado en la revisión: se desincroniza el primer día");
});

check("K4. y las dos capas se dicen juntas", () => {
  for (const src of [DOMAIN, COMPONENTS, ADAPTERS]) {
    assert(/MINUTES_ARE_FROZEN_FOLLOWUP_IS_LIVE/.test(src),
      "no se dice que el acta es foto y el seguimiento es vivo");
  }
  const f = describeFollowUp({
    decisions: 2, actions: 3, open: 1, completed: 2, overdue: 0,
    effective: 1, notEffective: 0, effectivenessPending: 1,
  });
  assert(/2 decisión/.test(f) && /3 acción/.test(f), "la frase no separa los dos números");
});

check("K5. reabrir es excepcional y no destruye el cierre", () => {
  const f = functionBody("quality_mr_reopen_review");
  assert(/length\(btrim\(p_reason\)\) < 20/.test(f), "se puede reabrir con un motivo de una palabra");
  assert(/reopen_count = reopen_count \+ 1/.test(f), "reabrir no deja constancia");
  assert(!/closure_note = null/.test(f), "reabrir borra la nota de cierre original");
  assert(/closure_note_before/.test(f), "el cierre anterior no queda registrado");
  assert(/REOPEN_IS_EXCEPTIONAL/.test(DOMAIN), "no se dice");
});

// ---------------------------------------------------------------------------
console.log("\nL · PARTICIPANTES E HISTORIA (§9, §69, §70, §86)");

check("L1. asistir NO es aprobar", () => {
  const cuerpo = tableBody("quality_management_review_participants");
  assert(/attended\s+boolean/.test(cuerpo), "no se registra la asistencia");
  assert(!/approved|approval|signature|firma/i.test(cuerpo),
    "la lista de asistencia lleva aprobación: parecería una firma");
  assert(/ATTENDANCE_IS_NOT_APPROVAL/.test(DOMAIN), "no se dice");
  assert(/ATTENDANCE_IS_NOT_APPROVAL/.test(COMPONENTS), "la pantalla no lo dice");
});

check("L2. el cargo de ENTONCES se copia, no se resuelve al leer", () => {
  const cuerpo = tableBody("quality_management_review_participants");
  assert(/position_name_at_review\s+text/.test(cuerpo),
    "el cargo no se copia: la revisión de 2027 mostraría la estructura de 2029");
  assert(/position_name_at_review/.test(DB), "la capa de datos no lo guarda");
  assert(/PARTICIPANT_HISTORY_IS_FROZEN/.test(DOMAIN), "no se dice");
});

check("L3. un participante externo NO necesita cuenta", () => {
  const cuerpo = tableBody("quality_management_review_participants");
  assert(/external_name\s+text/.test(cuerpo), "no se puede invitar a alguien de fuera");
  assert(/person_id\s+uuid/.test(cuerpo), "el participante no cuelga de las personas");
  assert(!/user_id/.test(cuerpo), "el participante exige un usuario de Trazaloop");
  for (const r of PARTICIPATION_ROLES) {
    assert(cuerpo.includes(`'${r}'`), `la base no admite el papel «${r}»`);
  }
});

check("L4. quien deja la organización sigue siendo participante", () => {
  const cuerpo = tableBody("quality_management_review_participants");
  assert(!/memberships/.test(cuerpo),
    "el participante depende de la membresía vigente: desaparecería al irse");
  assert(/quality_people/.test(cuerpo), "el participante no cuelga de las personas");
});

// ---------------------------------------------------------------------------
console.log("\nM · PRIVACIDAD Y ANONIMATO (§61, §62, §63, §64, §81, §100)");

check("M1. la voz del cliente NO puede leer una respuesta", () => {
  const f = functionBody("quality_mr_src_customer_voice");
  assert(!/quality_survey_responses/.test(f),
    "la entrada de voz del cliente lee respuestas individuales");
  assert(!/quality_survey_answers/.test(f), "lee respuestas a preguntas");
  assert(!/quality_survey_invitations/.test(f),
    "lee invitaciones: cruzarlas con respuestas rompería el anonimato");
  assert(!/quality_customer_contacts/.test(f), "lee contactos");
  assert(!/respondent/.test(f), "nombra al respondente");
  assert(/anonymity_note/.test(f), "no explica por qué no trae nombres");
});

check("M2. ninguna función del dominio toca las tablas de respuestas", () => {
  // El catálogo de `work_references` sí las nombra: es el conjunto heredado de
  // 0126, y soltarlo sin volver a ponerlo rompería las filas ya escritas. Lo
  // que importa es que NINGUNA función de QUALITY-10 las lea.
  const funciones = [...SQL.matchAll(/function public\.(quality_mr[a-z0-9_]*|quality_scan_management_reviews)\(/g)]
    .map((m) => m[1]);
  assert(funciones.length >= 15, `solo ${funciones.length} funciones del dominio`);
  for (const n of [...new Set(funciones)]) {
    const f = functionBody(n);
    for (const t of ["quality_survey_responses", "quality_survey_answers",
                     "quality_survey_invitations", "quality_customer_contacts"]) {
      assert(!new RegExp(`\\b${t}\\b`).test(f),
        `${n} lee ${t}: hay un camino hacia la identidad de quien respondió`);
    }
  }
  assert(!/quality_survey_response|respondent/.test(stripTs(DB) + stripTs(ADAPTERS)),
    "la aplicación lee respuestas de encuesta desde este dominio");
});

check("M3. las notas de auditoría se quedan en auditorías", () => {
  const f = functionBody("quality_mr_src_audits");
  assert(!/quality_audit_notes/.test(f),
    "la revisión copia notas de entrevista de auditoría");
  assert(/AUDIT_NOTES_STAY_IN_AUDITS/.test(DOMAIN), "no se dice");
});

check("M4. los datos de personas son AGREGADOS", () => {
  const f = functionBody("quality_mr_src_resources");
  assert(!/full_name|person_name/.test(f),
    "la entrada de recursos devuelve nombres: sería una evaluación de empleados");
  assert(/count\(/.test(f), "no agrega nada");
  assert(/PEOPLE_DATA_IS_AGGREGATED/.test(DOMAIN), "no se dice");
  assert(/PEOPLE_DATA_IS_AGGREGATED/.test(COMPONENTS), "la pantalla no lo dice");
});

check("M5. agregado ≠ acceso al detalle", () => {
  assert(/SUMMARY_IS_NOT_RAW_ACCESS/.test(DOMAIN), "no se dice");
  assert(/SUMMARY_IS_NOT_RAW_ACCESS/.test(COMPONENTS), "la pantalla no lo dice");
});

// ---------------------------------------------------------------------------
console.log("\nN · MULTIEMPRESA Y SEGURIDAD (§65, §66, §67)");

check("N1. todas las tablas del dominio llevan RLS", () => {
  const tablas = [...SQL.matchAll(/create table public\.(quality_management_review[a-z_]*)/g)]
    .map((m) => m[1])
    .filter((t) => t !== "quality_management_review_input_catalog");
  assert(tablas.length === 8, `hay ${tablas.length} tablas de dominio, se esperaban 8`);
  for (const t of tablas) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(SQL),
      `${t} no tiene RLS`);
  }
});

check("N2. ninguna tabla del dominio concede nada a anon", () => {
  const tablas = [...SQL.matchAll(/create table public\.(quality_management_review[a-z_]*)/g)]
    .map((m) => m[1]);
  for (const t of tablas) {
    assert(!new RegExp(`grant [a-z, ]+ on (table )?public\\.${t}\\s+to [^;]*anon`).test(SQL),
      `${t} concede privilegios a anon`);
    assert(new RegExp(`revoke all on table public\\.${t}\\s+from anon`).test(SQL),
      `${t} no revoca los privilegios por defecto de Supabase`);
  }
});

check("N3. toda función SECURITY DEFINER fija su search_path", () => {
  const bloques = RAW_SQL.split(/create or replace function/).slice(1);
  for (const b of bloques) {
    if (!/security definer/.test(b)) continue;
    const cabecera = b.slice(0, b.indexOf("as $$"));
    const nombre = /public\.([a-z0-9_]+)/.exec(b)?.[1] ?? "?";
    assert(/set search_path = public/.test(cabecera),
      `${nombre} es definer y no fija search_path`);
  }
});

check("N4. ninguna función confía en el organization_id que le pasen", () => {
  const sospechosas = [...SQL.matchAll(/function public\.(quality_[a-z0-9_]+)\(\s*p_organization_id uuid/g)]
    .map((m) => m[1]);
  assert(sospechosas.length >= 12, `solo ${sospechosas.length} funciones con organización`);
  for (const n of sospechosas) {
    if (new RegExp(`revoke all on function public\\.${n}\\(uuid\\) from public, anon, authenticated`)
      .test(SQL)) continue;
    const f = functionBody(n);
    assert(/is_org_member|has_org_role/.test(f),
      `${n} acepta organization_id sin revalidar la pertenencia contra la sesión`);
  }
});

check("N5. las FK del dominio son COMPUESTAS", () => {
  const compuestas = [...SQL.matchAll(/foreign key \(organization_id, [a-z_]+\)/g)].length;
  assert(compuestas >= 12,
    `solo ${compuestas} FK compuestas: alguna relación admite otra empresa`);
});

check("N6. las vistas son security_invoker y con grant propio", () => {
  const vistas = [...SQL.matchAll(/create or replace view public\.(v_quality_management_review[a-z_]*)/g)]
    .map((m) => m[1]);
  assert(vistas.length === 3, `hay ${vistas.length} vistas, se esperaban 3`);
  for (const v of vistas) {
    const i = SQL.indexOf(`view public.${v}`);
    assert(/security_invoker/.test(SQL.slice(i, i + 200)), `${v} no es security_invoker`);
    assert(new RegExp(`grant select on public\\.${v} to authenticated`).test(SQL),
      `${v} no se puede leer`);
  }
});

check("N7. la capa de datos NUNCA usa service_role", () => {
  assert(!/service_role|createAdminClient|SERVICE_ROLE/.test(stripTs(DB)),
    "la capa de datos se salta la RLS");
  assert(!/service_role|createAdminClient/.test(stripTs(ACTIONS)),
    "las acciones se saltan la RLS");
});

check("N8. toda acción de servidor pasa por la puerta de rol", () => {
  const funciones = [...ACTIONS.matchAll(/export async function (\w+Action)\(/g)]
    .map((m) => m[1]);
  assert(funciones.length >= 25, `solo ${funciones.length} acciones`);
  for (const f of funciones) {
    const i = ACTIONS.indexOf(`export async function ${f}(`);
    const cuerpo = ACTIONS.slice(i, i + 1400);
    assert(/const g = await gate\(\)/.test(cuerpo), `${f} no pasa por la puerta`);
  }
});

check("N9. los roles distinguen leer, conducir y cerrar", () => {
  assert(canReadManagementReview("member") === true, "un miembro no puede leer");
  assert(canManageManagementReview("consultant") === true, "un consultor no puede conducir");
  assert(canCloseManagementReview("consultant") === false,
    "un consultor externo puede cerrar la revisión de la empresa");
  assert(canCloseManagementReview("admin") === true, "quien administra no puede cerrar");
  for (const f of ["quality_reads_management_review", "quality_manages_management_review",
                   "quality_closes_management_review"]) {
    assert(new RegExp(`function public\\.${f}`).test(SQL), `falta ${f} en la base`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nO · CICLO DE VIDA Y BORRADO (§68, §88)");

check("O1. la revisión entra en el ciclo de vida común", () => {
  assert((LIFECYCLE_ENTITIES as readonly string[]).includes("management_review"),
    "la revisión no está en el ciclo de vida");
});

check("O2. el dictamen lo emite la MISMA función de siempre", () => {
  const f = functionBody("quality_deletion_eligibility");
  assert(/quality_management_review_deletion_verdict/.test(f),
    "la revisión no tiene dictamen");
});

check("O3. la reescritura del dictamen NO perdió las guardas heredadas", () => {
  const f = functionBody("quality_deletion_eligibility");
  assert(/if auth\.uid\(\) is null/.test(f),
    "se perdió la guarda de sesión: un anónimo obtendría dictámenes");
  assert(/quality_can_read_person/.test(f), "se perdió la guarda de lectura de personas");
  // Y las veinte entidades anteriores siguen ahí.
  for (const e of ["'audit'", "'audit_program'", "'survey'", "'customer'", "'supplier'"]) {
    assert(f.includes(e), `la reescritura perdió la entidad ${e}`);
  }
});

check("O4. una revisión con decisiones o acta NO se borra", () => {
  const f = functionBody("quality_management_review_deletion_verdict");
  assert(/decision/.test(f) && /minutes/.test(f) && /analysis/.test(f),
    "el dictamen no mira decisiones, actas ni análisis");
  assert(/'has_history'/.test(f), "el dictamen no sabe negar el borrado");
  assert(/'retired'/.test(f), "una revisión cerrada se podría borrar");
});

check("O5. hay guarda de borrado en la BASE, no solo en la pantalla", () => {
  assert(/quality_management_review_delete_guard/.test(SQL), "no hay guarda de borrado");
  assert(/before delete on public\.quality_management_reviews/.test(SQL),
    "la guarda no está atada al borrado");
});

// ---------------------------------------------------------------------------
console.log("\nP · EL BARRIDO Y QUALITY-11 (§44, §94)");

check("P1. el barrido solo AVISA", () => {
  const f = functionBody("quality_scan_management_reviews");
  assert(!/insert into quality_management_review_decisions/.test(f),
    "el barrido decide por su cuenta");
  assert(!/insert into work_actions/.test(f), "el barrido crea acciones");
  assert(!/update quality_management_reviews\s+set status/.test(f),
    "el barrido cambia el estado de una revisión");
  assert(/insert into work_alerts/.test(f), "el barrido no produce avisos");
});

check("P2. el barrido es idempotente y devuelve lo CREADO", () => {
  const f = functionBody("quality_scan_management_reviews");
  assert(/not exists/.test(f), "no comprueba si el aviso ya existe");
  assert(/get diagnostics/.test(f),
    "devuelve el total en vez de lo creado: la segunda pasada mentiría");
});

check("P3. QUALITY-11 tiene con qué trabajar", () => {
  for (const a of ["management_review_due", "management_review_input_pending",
                   "management_review_overdue", "management_review_action_overdue",
                   "management_review_source_updated"]) {
    assert((ALERT_TYPES as readonly string[]).includes(a),
      `Q11 no podrá detectar ${a}`);
  }
  for (const e of ["management_review.inputs_prepared", "management_review.closed",
                   "management_review.decision_recorded"]) {
    assert(SQL.includes(`'${e}'`), `falta el evento ${e}`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nQ · NADA DE IA (§93, RD-10)");

check("Q1. no hay ninguna llamada a un modelo", () => {
  const todo = stripTs(DOMAIN) + stripTs(DB) + stripTs(ACTIONS) + stripTs(ADAPTERS)
    + stripTs(COMPONENTS) + stripSql(SQL);
  assert(!/openai|anthropic|gpt-|claude-|embedding|llm|copilot/i.test(todo),
    "se coló una llamada a un modelo");
});

check("Q2. y se dice explícitamente que la IA no decide", () => {
  assert(aiConcludes() === false, "la IA concluye");
  assert(/AI_DOES_NOT_DECIDE/.test(DOMAIN), "no se dice");
  assert(/AI_DOES_NOT_DECIDE/.test(COMPONENTS), "la pantalla no lo dice");
  assert(/AI_DOES_NOT_DECIDE/.test(ADAPTERS), "el papel no lo dice");
});

check("Q3. los resúmenes automáticos son deterministas y explicables", () => {
  const f = functionBody("quality_mr_summarize");
  assert(/immutable/.test(f), "el resumen no es determinista");
  assert(/case p_code/.test(f), "el resumen no depende del tipo de entrada");
  assert(snapshotIsAvailable({ available: true }) === true, "no lee la bandera de dato");
  assert(snapshotIsAvailable(null) === false, "un retrato vacío se declara disponible");
});

// ---------------------------------------------------------------------------
console.log("\nR · LOS PAPELES (§71…§76)");

const CLAVES = [
  "quality.management-review.list", "quality.management-review.detail",
  "quality.management-review-agenda.detail", "quality.management-review-inputs.detail",
  "quality.management-review-decision.list", "quality.management-review-report.detail",
  "quality.management-review-minutes.detail", "quality.management-review-followup.list",
];

check("R1. las ocho claves existen en el registro cerrado", () => {
  const registro = read("lib/export/registry.ts");
  for (const k of CLAVES) {
    assert(ADAPTERS.includes(`key: "${k}"`), `no existe el adaptador de ${k}`);
  }
  assert(/quality-management-review/.test(registro), "el registro no importa los papeles");
});

check("R2. la gramática de las claves se respeta", () => {
  for (const k of CLAVES) {
    const partes = k.split(".");
    assert(partes.length === 3, `${k} no tiene tres partes`);
    assert(partes[0] === "quality", `${k} no es de Quality`);
    assert(["detail", "list", "historical"].includes(partes[2]),
      `${k} termina en un eje inventado`);
  }
});

check("R3. los listados se llaman Listado o Reporte", () => {
  const nombres = [...ADAPTERS.matchAll(/documentName: "([^"]+)"[\s\S]{0,200}?kind: "list"/g)]
    .map((m) => m[1]);
  assert(nombres.length >= 3, `solo ${nombres.length} nombres de listado`);
  for (const n of nombres) {
    assert(/^(Listado|Lista maestra|Maestro|Reporte)/.test(n),
      `«${n}» no se llama como un listado`);
  }
});

check("R4. §74 · el informe cubre las diez secciones que el encargo pide", () => {
  const a = ADAPTERS.slice(ADAPTERS.indexOf("qualityManagementReviewReport"),
                           ADAPTERS.indexOf("qualityManagementReviewMinutes"));
  for (const s of ["Identificación", "Periodo revisado", "Participantes", "Agenda",
                   "Entradas", "Conclusiones", "Decisiones", "Acciones y seguimiento",
                   "Próxima revisión"]) {
    assert(a.includes(s), `el informe no tiene la sección «${s}»`);
  }
});

check("R5. el inventario promete exactamente lo que el registro cumple", () => {
  const prometidas = new Set(promisedKeys());
  for (const k of CLAVES) {
    assert(prometidas.has(k), `${k} no está prometida en el inventario`);
  }
  const filas = EXPORT_INVENTORY.filter((r) => /revisión por la dirección/i.test(r.entity));
  assert(filas.length >= 10, `solo ${filas.length} entidades clasificadas`);
});

// ---------------------------------------------------------------------------
console.log("\nS · LA PANTALLA (§89, §90, §91, §92)");

check("S1. el grupo de navegación existe y NO fragmenta en quince rutas", () => {
  const reg = read("lib/modules/registry.ts");
  assert(/QUALITY_REVISION_DIRECCION_GROUP/.test(reg), "no hay grupo de revisión");
  assert(/groups: \[[\s\S]*QUALITY_REVISION_DIRECCION_GROUP/.test(reg),
    "el grupo no está enganchado al módulo");
  assert(routeFiles.length <= 5,
    `hay ${routeFiles.length} rutas: el dominio se fragmentó`);
});

check("S2. las rutas existen y viven dentro del turno con sesión", () => {
  assert(routeFiles.some((f) => f.endsWith("management-review/page.tsx")), "falta el listado");
  assert(routeFiles.some((f) => /\[reviewId\]/.test(f)), "falta la ficha");
  assert(routeFiles.some((f) => /followup/.test(f)), "falta el seguimiento");
  for (const f of routeFiles) {
    assert(f.includes("(app)"), `${f} está fuera del área con sesión`);
    assert(/requireQualityModule/.test(read(f)), `${f} no comprueba el módulo`);
  }
});

check("S3. el flujo se pinta como camino, no como asistente rígido", () => {
  assert(/StageTrail/.test(COMPONENTS), "no hay recorrido de etapas");
  assert(/Preparar/.test(COMPONENTS) && /Seguimiento/.test(COMPONENTS),
    "el recorrido no nombra las etapas");
  const plano = COMPONENTS.replace(/\s+/g, " ");
  assert(/No es un asistente/i.test(plano),
    "no se dice que se puede volver a cualquier etapa");
  assert(/volver a cualquier etapa/i.test(plano),
    "no se dice que se puede volver atrás");
});

check("S4. la portada de Quality avisa, sin duplicar el tablero", () => {
  const home = read("app/(app)/(shell)/quality/page.tsx");
  assert(/getManagementReviewHomeSignals/.test(home), "la portada no lee las señales");
  assert(/reviewLines/.test(home), "la portada no pinta ninguna línea");
  assert(/sin mirar/.test(home), "la portada no avisa de entradas pendientes");
});

check("S5. las pantallas enseñan las separaciones donde se producen", () => {
  for (const c of ["REVIEW_IS_NOT_A_DASHBOARD", "REVIEW_IS_NOT_A_MEETING",
                   "DECISION_IS_NOT_AN_ACTION", "MISSING_IS_NOT_ZERO",
                   "MINUTES_ARE_FROZEN_FOLLOWUP_IS_LIVE",
                   "CLOSING_DOES_NOT_CLOSE_ACTIONS", "ATTENDANCE_IS_NOT_APPROVAL"]) {
    assert(COMPONENTS.includes(c), `la pantalla no dice ${c}`);
  }
});

check("S6. la interfaz no promete que el sistema decide", () => {
  const texto = stripTs(COMPONENTS);
  assert(!/decidid[oa] automáticamente/i.test(texto), "la pantalla dice que decide sola");
  assert(!/se creó una acción automáticamente/i.test(texto), "la pantalla crea acciones sola");
  assert(!/conclusión automática/i.test(texto), "la pantalla concluye sola");
});

// ---------------------------------------------------------------------------
console.log("\nT · LA MIGRACIÓN (§95)");

check("T1. hay UNA sola migración de revisión, y es 0128", () => {
  const migraciones = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  const deRevision = migraciones.filter((f) => /management_review/.test(f));
  assert(deRevision.length === 1 && deRevision[0] === "0128_quality_management_review.sql",
    `hay ${deRevision.length} migraciones de revisión: ${deRevision.join(", ")}`);
  assert(migraciones.includes("0127_quality_audits.sql"),
    "una migración anterior desapareció");
});

check("T2. append-only: no destruye nada de lo que ya había", () => {
  assert(!/drop table|drop column|truncate/i.test(SQL),
    "la migración destruye estructura existente");
  const drops = [...SQL.matchAll(/drop constraint ([a-z0-9_]+)/g)].length;
  const adds = [...SQL.matchAll(/add constraint ([a-z0-9_]+)/g)].length;
  assert(adds >= drops, "se soltó una restricción sin volver a ponerla");
});

check("T3. pgcrypto, si se usa, va cualificado por esquema", () => {
  const sinCualificar = /[^.\w](gen_random_bytes|digest|crypt)\s*\(/.exec(
    SQL.replace(/extensions\.(gen_random_bytes|digest|crypt)/g, "OK")
  );
  assert(sinCualificar === null,
    `«${sinCualificar?.[1]}» se llama sin cualificar: fallaría con search_path = public`);
});

check("T4. la migración no siembra ni reescribe datos de negocio", () => {
  assert(!/insert into quality_management_reviews\b/.test(SQL),
    "la migración siembra revisiones");
  assert(!/update work_cases|update quality_indicators|update quality_audits/i.test(SQL),
    "la migración reescribe datos de otro dominio");
  // Lo único que siembra es el catálogo, que es estructura.
  assert(/insert into public\.quality_management_review_input_catalog/.test(SQL),
    "el catálogo no se siembra");
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
