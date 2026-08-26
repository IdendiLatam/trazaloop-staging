/**
 * Trazaloop · QUALITY-09 · Puras y estáticas.
 *
 * Comprueban que las separaciones de AR existan EN EL CÓDIGO y no solo en la
 * prosa del informe:
 *
 *   PROGRAMA ≠ AUDITORÍA INDIVIDUAL
 *   CRITERIO DE AUDITORÍA ≠ PREGUNTA DE CHECKLIST
 *   EVIDENCIA ≠ HALLAZGO
 *   HALLAZGO ≠ NO CONFORMIDAD
 *   OBSERVACIÓN ≠ NO CONFORMIDAD
 *   RESULTADO DE AUDITORÍA ≠ ACCIÓN CORRECTIVA
 *   AUDITOR ≠ RESPONSABLE DE LA AUDITORÍA
 *
 * y que lo que este dominio NO debe ser —un segundo motor de casos, un segundo
 * motor documental, un sistema que certifica— no se haya colado por una tabla,
 * un enum o un cálculo.
 *
 * El bloque más importante es el de HALLAZGO ≠ NC: busca activamente el camino
 * por el que registrar un hallazgo podría acabar creando una no conformidad.
 *
 * Ninguna toca base de datos ni red.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENDA_ACTIVITY_KINDS, AUDIT_NATURES, AUDIT_STATUSES, AUDIT_TYPES,
  canCloseAudits, canManageAudits, canReadAudits, CHECK_OUTCOMES,
  checkResultCreatesFinding, CHECKLIST_VERSION_STATUSES,
  classificationCreatesNonconformity, CONFLICT_KINDS, CONFLICT_STATUSES,
  coveragePercent, CRITERION_KINDS, declaresIndependence, describeCoverage,
  describeFollowUp, describeSample, EVIDENCE_KINDS, explainPriority,
  FINDING_CLASSIFICATIONS, FINDING_EVALUATION_STATUSES, FINDING_SEVERITIES,
  independenceReferenceDate, MEETING_KINDS, NOTE_KINDS, PROGRAM_REVISION_KINDS,
  PROGRAM_STATUSES, SCOPE_ITEM_KINDS, scopeItemNeedsReference, TEAM_ROLES,
  wasRescheduled,
} from "../../lib/domain/quality-audits";
import { EXPORT_INVENTORY, promisedKeys } from "../../lib/export/inventory";
import {
  ALERT_TYPES, ALERT_TYPE_LABEL, SUBJECT_TYPES, TASK_TYPES, TASK_TYPE_LABEL,
} from "../../lib/domain/work-inbox";
import { LIFECYCLE_ENTITIES } from "../../lib/domain/lifecycle";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
/** Sin esto, una prueba que busca «certificado» falla justamente por el
 *  comentario que explica que Trazaloop NO certifica. */
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MIG = "supabase/migrations/0127_quality_audits.sql";
const SQL = stripSql(read(MIG));
const RAW_SQL = read(MIG);
const DOMAIN = read("lib/domain/quality-audits.ts");
const DB = read("lib/db/quality-audits.ts");
const ACTIONS = read("server/actions/quality-audits.ts");
const ADAPTERS = read("lib/export/adapters/quality-audits.ts");

const COMPONENTS_DIR = "components/domain/quality/audits";
const componentFiles = readdirSync(join(ROOT, COMPONENTS_DIR)).filter((f) => f.endsWith(".tsx"));
const COMPONENTS = componentFiles.map((f) => read(join(COMPONENTS_DIR, f))).join("\n");

const ROUTES_DIR = "app/(app)/(shell)/quality/audits";
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

console.log("\nQUALITY-09 · puras y estáticas\n");

// ---------------------------------------------------------------------------
console.log("A · PROGRAMA ≠ AUDITORÍA (AR-01, §12…§17)");

check("A1. el programa y la auditoría son DOS tablas, no una con bandera", () => {
  assert(/create table public\.quality_audit_programs/.test(SQL), "no existe el programa");
  assert(/create table public\.quality_audits/.test(SQL), "no existe la auditoría");
  const prog = tableBody("quality_audit_programs");
  assert(!/is_program|es_programa/.test(tableBody("quality_audits")),
    "la auditoría lleva una bandera «es programa»: son la misma tabla disfrazada");
  assert(!/scheduled_from|executed_from/.test(prog),
    "el programa tiene fechas de ejecución: se está comportando como una auditoría");
});

check("A2. una auditoría PUEDE existir fuera de programa", () => {
  const cuerpo = tableBody("quality_audits");
  const m = /program_id\s+uuid([^,]*)/.exec(cuerpo);
  assert(m !== null, "la auditoría no referencia programa");
  assert(!/not null/.test(m![1]),
    "toda auditoría exige programa: una extraordinaria no se podría registrar");
});

check("A3. el programa lleva su propio ciclo, distinto del de la auditoría", () => {
  assert(PROGRAM_STATUSES.join(",") !== AUDIT_STATUSES.join(","),
    "el programa y la auditoría comparten estados: no son cosas distintas");
  assert(PROGRAM_STATUSES.includes("closed"), "un programa no se puede cerrar");
  assert(!(PROGRAM_STATUSES as readonly string[]).includes("executed"),
    "un programa se «ejecuta»: eso lo hace una auditoría");
});

check("A4. la cobertura sale de las auditorías reales, no de una columna", () => {
  const vista = SQL.slice(SQL.indexOf("v_quality_audit_program_coverage"));
  assert(/quality_audits/.test(vista.slice(0, 3000)),
    "la cobertura no lee las auditorías del programa");
  assert(!/coverage_pct\s+numeric/.test(tableBody("quality_audit_programs")),
    "la cobertura está guardada en una columna: se desincroniza el primer día");
});

check("A5. una auditoría cancelada SIGUE contando como planificada", () => {
  assert(describeCoverage({ planned: 4, executed: 2, cancelled: 1, pending: 1 })
    .includes("2 de 4"),
    "la cancelada se descontó del denominador y la cobertura subió sola");
  assert(coveragePercent(4, 2) === 50, "el porcentaje no sale de planificadas");
  assert(coveragePercent(0, 0) === null,
    "un programa vacío devuelve un porcentaje: 0% sugiere incumplimiento donde no hay nada");
});

check("A6. cambiar el programa deja REVISIÓN, no reescribe la anterior", () => {
  assert(/create table public\.quality_audit_program_revisions/.test(SQL),
    "no existen las revisiones del programa");
  const cuerpo = tableBody("quality_audit_program_revisions");
  assert(/snapshot\s+jsonb not null/.test(cuerpo),
    "la revisión no guarda su propia foto");
  assert(/unique \((organization_id, )?program_id, revision_number\)/.test(SQL),
    "dos revisiones podrían llevar el mismo número");
});

check("A7. las revisiones son de solo lectura: no hay política de update", () => {
  const pol = SQL.slice(SQL.indexOf("quality_audit_program_revisions"));
  assert(!/on public\.quality_audit_program_revisions\s+for update/.test(SQL),
    "una revisión del programa se puede editar: deja de ser una foto");
  assert(!/on public\.quality_audit_program_revisions\s+for delete/.test(SQL),
    "una revisión del programa se puede borrar");
  void pol;
});

// ---------------------------------------------------------------------------
console.log("\nB · REPROGRAMAR ≠ REESCRIBIR · CANCELAR ≠ BORRAR (§43…§45)");

check("B1. la fecha ORIGINAL vive en columnas propias", () => {
  const cuerpo = tableBody("quality_audits");
  assert(/planned_from\s+date/.test(cuerpo) && /planned_to\s+date/.test(cuerpo),
    "no hay fecha original");
  assert(/scheduled_from\s+date/.test(cuerpo) && /scheduled_to\s+date/.test(cuerpo),
    "no hay fecha vigente");
});

check("B2. reprogramar NO toca la fecha original", () => {
  const f = functionBody("quality_reschedule_audit");
  assert(/scheduled_from\s*=/.test(f), "reprogramar no cambia la fecha vigente");
  // Se escribe con coalesce: si ya había fecha original, se conserva; si nunca
  // la hubo —una auditoría que nació sin fecha—, se fija la primera. Lo que no
  // puede ocurrir es que una fecha original existente se sobrescriba.
  assert(/planned_from\s*=\s*coalesce\(planned_from/.test(f),
    "reprogramar reescribe la fecha original: la historia desaparece");
  assert(/planned_to\s*=\s*coalesce\(planned_to/.test(f),
    "reprogramar reescribe la fecha original de fin");
  assert(/insert into quality_audit_reschedules/.test(f),
    "reprogramar no deja rastro");
});

check("B3. reprogramar exige un motivo", () => {
  const f = functionBody("quality_reschedule_audit");
  assert(/p_reason/.test(f), "no se pide motivo");
  assert(/raise exception/.test(f), "no se rechaza nada");
  assert(/reason\s+text not null/.test(tableBody("quality_audit_reschedules")),
    "el motivo es opcional en la tabla");
});

check("B4. la ficha SABE decir que hubo reprogramación", () => {
  assert(wasRescheduled({
    plannedFrom: "2026-03-01", scheduledFrom: "2026-05-01",
    plannedTo: null, scheduledTo: null,
  }), "una auditoría movida no se declara reprogramada");
  assert(!wasRescheduled({
    plannedFrom: "2026-03-01", scheduledFrom: "2026-03-01",
    plannedTo: null, scheduledTo: null,
  }), "una auditoría intacta se declara reprogramada");
  assert(/Reprogramada/.test(COMPONENTS), "la pantalla no lo dice");
});

check("B5. cancelar es un ESTADO, no un borrado", () => {
  assert((AUDIT_STATUSES as readonly string[]).includes("cancelled"),
    "no existe el estado cancelada");
  const f = functionBody("quality_cancel_audit");
  assert(/status\s*=\s*'cancelled'/.test(f), "cancelar no marca el estado");
  assert(!/delete from quality_audits/.test(f), "cancelar borra la auditoría");
  assert(/cancel_reason/.test(f), "cancelar no exige razón");
});

check("B6. la cobertura NO mejora al cancelar", () => {
  const antes = describeCoverage({ planned: 4, executed: 2, cancelled: 0, pending: 2 });
  const despues = describeCoverage({ planned: 4, executed: 2, cancelled: 1, pending: 1 });
  assert(antes.includes("2 de 4") && despues.includes("2 de 4"),
    "cancelar cambió el denominador");
});

// ---------------------------------------------------------------------------
console.log("\nC · CRITERIO ≠ PREGUNTA DE CHECKLIST (AR-05, AR-06, §22, §35)");

check("C1. criterio y pregunta son tablas DISTINTAS", () => {
  assert(/create table public\.quality_audit_criteria/.test(SQL), "no hay criterios");
  assert(/create table public\.quality_audit_checklist_items/.test(SQL), "no hay preguntas");
  assert(!/checklist_item_id/.test(tableBody("quality_audit_criteria")),
    "el criterio apunta a una pregunta: se confundieron las dos cosas");
});

check("C2. el criterio documental resuelve la REVISIÓN auditada", () => {
  assert(/document_revision_id\s+uuid/.test(tableBody("quality_audit_criteria")),
    "el criterio no fija la revisión del documento");
  assert(/trazadoc_document_revisions/.test(SQL),
    "no se enlaza con las revisiones del motor documental");
});

check("C3. NO se creó un segundo motor documental", () => {
  assert(!/create table public\.quality_audit_documents\b/.test(SQL),
    "se creó una tabla de documentos de auditoría");
  assert(!/storage\.buckets/.test(SQL), "la migración crea un bucket propio");
  assert(/trazadoc_documents/.test(SQL), "no se usa el motor documental existente");
});

check("C4. el checklist es OPCIONAL: la auditoría no lo exige", () => {
  const cuerpo = tableBody("quality_audits");
  assert(!/checklist_id/.test(cuerpo),
    "la auditoría lleva checklist obligatorio en su propia fila");
  assert(/create table public\.quality_audit_checklist_runs/.test(SQL),
    "no existe el recorrido de checklist");
});

check("C5. una versión publicada NO se edita", () => {
  assert(/quality_checklist_version_is_published/.test(SQL),
    "no hay guarda contra editar una versión publicada");
  const f = functionBody("quality_checklist_version_is_published");
  assert(/raise exception/.test(f), "la guarda no rechaza nada");
  assert((CHECKLIST_VERSION_STATUSES as readonly string[]).includes("superseded"),
    "no existe el estado «sustituida»");
});

check("C6. la clave estable permite comparar entre versiones", () => {
  assert(/stable_key\s+text not null/.test(tableBody("quality_audit_checklist_items")),
    "las preguntas no llevan clave estable");
  assert(/stableKey: i\.stable_key/.test(DB),
    "la versión nueva no hereda las claves de la anterior");
});

check("C7. contestar una pregunta NO crea hallazgo. Nunca.", () => {
  for (const o of CHECK_OUTCOMES) {
    assert(checkResultCreatesFinding(o) === false,
      `la respuesta ${o} crea hallazgo`);
  }
  const f = SQL.slice(SQL.indexOf("quality_audit_check_results"));
  assert(!/insert into quality_audit_findings/.test(f.slice(0, 4000)),
    "guardar una respuesta inserta un hallazgo");
  assert(!/insert into quality_audit_findings/.test(stripTs(ACTIONS).slice(
    stripTs(ACTIONS).indexOf("recordCheckResultAction"))),
    "la acción de contestar crea un hallazgo");
});

// ---------------------------------------------------------------------------
console.log("\nD · EVIDENCIA ≠ HALLAZGO · NOTA ≠ EVIDENCIA (AR-15, §26…§29)");

check("D1. la evidencia REFERENCIA; no copia ni sube archivos", () => {
  const cuerpo = tableBody("quality_audit_evidence");
  assert(/document_id\s+uuid/.test(cuerpo) && /indicator_id\s+uuid/.test(cuerpo),
    "la evidencia no apunta a lo que ya existe");
  assert(!/file_path|storage_key|file_size|mime_type/.test(cuerpo),
    "la evidencia guarda archivos propios: es un segundo repositorio");
  assert(/external_evidence_id/.test(cuerpo),
    "no se puede referenciar una evidencia de PCR");
});

check("D2. evidencia y hallazgo son tablas distintas, unidas por un puente", () => {
  assert(/create table public\.quality_audit_finding_evidence/.test(SQL),
    "no hay puente entre hallazgo y evidencia");
  assert(!/finding_id\s+uuid not null/.test(tableBody("quality_audit_evidence")),
    "toda evidencia pertenece a un hallazgo: registrarla ya sería acusar");
});

check("D3. la nota de trabajo NO es evidencia ni hallazgo", () => {
  assert(/create table public\.quality_audit_notes/.test(SQL), "no hay notas");
  const cuerpo = tableBody("quality_audit_notes");
  assert(!/evidence_id|finding_id/.test(cuerpo),
    "la nota se ata a evidencia o hallazgo: formalizarla es automático");
  assert(/is_restricted\s+boolean/.test(cuerpo),
    "no se puede restringir una nota al equipo auditor");
});

check("D4. las notas restringidas se filtran EN LA BASE, no en la pantalla", () => {
  assert(/quality_can_read_audit_note/.test(SQL), "no hay guarda de lectura de notas");
  assert(/using \(quality_can_read_audit_note/.test(SQL),
    "la restricción no está en la política de RLS");
});

check("D5. la muestra dice de cuánto se revisó, y no se llama cobertura", () => {
  const cuerpo = tableBody("quality_audit_samples");
  assert(/population_size\s+integer/.test(cuerpo) && /sample_size\s+integer not null/.test(cuerpo),
    "la muestra no dice población ni tamaño");
  const d = describeSample({
    description: "Órdenes de compra", sampleSize: 10, populationSize: 400,
  });
  assert(/10/.test(d) && /400/.test(d), "la frase no dice cuántos de cuántos");
  assert(!/cobertura total|todo revisado/i.test(d),
    "la muestra se presenta como si fuera todo");
});

// ---------------------------------------------------------------------------
console.log("\nE · HALLAZGO ≠ NO CONFORMIDAD (AR-13, §30, §47)");

check("E1. el hallazgo tiene su propia tabla, no es un caso", () => {
  assert(/create table public\.quality_audit_findings/.test(SQL), "no hay hallazgos");
  assert(!/create table public\.quality_audit_nonconformities/.test(SQL),
    "se creó una tabla de no conformidades de auditoría");
});

check("E2. la clasificación del auditor se llama PROPUESTA", () => {
  const cuerpo = tableBody("quality_audit_findings");
  assert(/proposed_classification/.test(cuerpo),
    "la clasificación no se llama propuesta: se lee como firme");
  assert(!/\bclassification\s+text/.test(cuerpo),
    "hay una clasificación a secas: se confundiría con la del caso");
  assert((FINDING_CLASSIFICATIONS as readonly string[]).includes("nonconformity_suspected"),
    "no se puede proponer una posible no conformidad");
  assert(!(FINDING_CLASSIFICATIONS as readonly string[]).includes("nonconformity"),
    "el auditor puede declarar una no conformidad desde el hallazgo");
});

check("E3. NINGUNA clasificación propuesta crea una no conformidad", () => {
  for (const c of FINDING_CLASSIFICATIONS) {
    assert(classificationCreatesNonconformity(c) === false,
      `la clasificación ${c} crea una NC`);
  }
});

check("E4. registrar un hallazgo NO abre ningún caso", () => {
  const trg = SQL.slice(SQL.indexOf("create table public.quality_audit_findings"));
  const hasta = trg.slice(0, trg.indexOf("create table public.quality_audit_finding_evidence"));
  assert(!/insert into work_cases/.test(hasta),
    "la zona del hallazgo inserta un caso");
  const ts = stripTs(DB);
  const i = ts.indexOf("export async function recordFinding");
  const j = ts.indexOf("export async function updateFinding");
  assert(!/work_cases|open_case/.test(ts.slice(i, j)),
    "registrar un hallazgo desde la aplicación abre un caso");
});

check("E5. escalar es un ACTO explícito y separado", () => {
  assert(/quality_open_case_from_audit_finding/.test(SQL),
    "no existe la escalada explícita");
  assert(/openCaseFromFindingAction/.test(ACTIONS), "no hay acción de escalar");
  const a = stripTs(ACTIONS);
  const i = a.indexOf("export async function evaluateFindingAction");
  const j = a.indexOf("export async function openCaseFromFindingAction");
  assert(/status === "escalated"/.test(a.slice(i, j)),
    "evaluar permite marcar escalado sin abrir el caso");
});

check("E6. el caso que nace tampoco es todavía una NC", () => {
  const f = functionBody("quality_open_case_from_audit_finding");
  assert(/insert into work_cases/.test(f), "la escalada no abre caso");
  assert(!/classification\s*=\s*'nonconformity'/.test(f),
    "la escalada clasifica el caso como no conformidad");
  assert(!/'nonconformity'/.test(f),
    "la escalada nombra la no conformidad: la estaría decidiendo");
});

check("E7. la observación tampoco es una no conformidad", () => {
  assert((FINDING_CLASSIFICATIONS as readonly string[]).includes("observation"),
    "no existe la observación");
  assert(/OBSERVATION_IS_NOT_NC/.test(DOMAIN), "no se dice que observación ≠ NC");
  assert(/OBSERVATION_IS_NOT_NC/.test(COMPONENTS), "la pantalla no lo dice");
});

check("E8. la clasificación FORMAL se LEE del caso, no se deriva", () => {
  assert(/caseClassification/.test(DB), "no se lee la clasificación del caso");
  assert(/work_cases[\s\S]{0,200}classification/.test(DB),
    "la clasificación del caso no viene de work_cases");
});

check("E9. ningún papel llama «no conformidad» a un hallazgo", () => {
  const texto = stripTs(ADAPTERS);
  assert(!/["'][^"']*[Nn]o [Cc]onformidad detectada/.test(texto),
    "un PDF afirma que se detectó una no conformidad");
  assert(/FINDING_IS_NOT_NC/.test(ADAPTERS),
    "los papeles no llevan el aviso de que hallazgo ≠ NC");
});

// ---------------------------------------------------------------------------
console.log("\nF · AUDITOR ≠ RESPONSABLE · INDEPENDENCIA (AR-10, AR-11, §31…§34)");

check("F1. el equipo auditor y el responsable son campos distintos", () => {
  assert(/create table public\.quality_audit_team_members/.test(SQL), "no hay equipo");
  assert(/owner_position_id\s+uuid/.test(tableBody("quality_audits")),
    "la auditoría no tiene responsable");
  assert((TEAM_ROLES as readonly string[]).includes("lead"), "no hay auditor líder");
});

check("F2. solo puede haber UN líder por auditoría", () => {
  assert(/unique index[\s\S]{0,200}team_role = 'lead'/.test(SQL)
    || /where \(team_role = 'lead'\)/.test(SQL),
    "dos personas podrían ser líderes de la misma auditoría");
});

check("F3. un auditor externo NO necesita cuenta", () => {
  const cuerpo = tableBody("quality_audit_team_members");
  assert(/person_id\s+uuid not null/.test(cuerpo),
    "el equipo no cuelga de las personas del sistema");
  assert(!/user_id|profile_id/.test(cuerpo),
    "el equipo exige un usuario de Trazaloop: un externo no podría auditar");
  assert(/EXTERNAL_AUDITOR_NEEDS_NO_ACCOUNT/.test(DOMAIN), "no se dice");
});

check("F4. el sistema NUNCA declara a nadie independiente", () => {
  assert(declaresIndependence([]) === false, "sin conflictos se declara independencia");
  assert(declaresIndependence([{}, {}]) === false, "con conflictos se declara algo");
  const f = functionBody("quality_check_audit_independence");
  assert(/'declares_independence',\s*false/.test(f),
    "la función no dice explícitamente que NO declara independencia");
});

check("F5. la independencia se resuelve con los cargos de LA FECHA", () => {
  const f = functionBody("quality_audit_conflicts_on");
  assert(/quality_position_assignments/.test(f),
    "no se leen las asignaciones de cargo");
  assert(/effective_from/.test(f) && /effective_to/.test(f),
    "no se acota por vigencia: se usaría el cargo de hoy");
  assert(independenceReferenceDate({
    executedFrom: null, scheduledFrom: "2026-05-01", plannedFrom: "2026-03-01",
  }, "2026-08-21") === "2026-05-01",
    "la fecha de referencia no es la de la auditoría");
});

check("F6. un conflicto detectado exige DECISIÓN humana", () => {
  const cuerpo = tableBody("quality_audit_conflict_checks");
  assert(/status\s+text not null default 'detected'/.test(cuerpo),
    "un conflicto nace ya decidido");
  assert((CONFLICT_STATUSES as readonly string[]).includes("accepted_with_mitigation"),
    "no se puede aceptar un conflicto con mitigación");
  assert(/status <> 'accepted_with_mitigation'\s*\n?\s*or nullif/.test(cuerpo)
    || /accepted_with_mitigation[\s\S]{0,120}mitigation/.test(cuerpo),
    "se puede aceptar un conflicto sin escribir la mitigación");
});

check("F7. la competencia INFORMA, no decide", () => {
  const f = functionBody("quality_audit_preparation_dossier");
  assert(/quality_person_competencies/.test(f), "el expediente no muestra competencia");
  assert(/'decides_nothing',\s*true/.test(f),
    "el expediente no dice que no decide nada");
  assert(!/raise exception[^;]*competen/i.test(f),
    "la falta de competencia bloquea al auditor");
});

// ---------------------------------------------------------------------------
console.log("\nG · CERRAR LA AUDITORÍA ≠ CERRAR LAS ACCIONES (AR-19, §37, §81)");

check("G1. cerrar NO exige que las acciones estén cerradas", () => {
  const f = functionBody("quality_close_audit");
  assert(!/open_actions\s*>\s*0[\s\S]{0,120}raise exception/.test(f),
    "cerrar la auditoría exige cero acciones abiertas");
  assert(/p_followup_note/.test(f), "cerrar no pide decir qué queda pendiente");
});

check("G2. cerrar SÍ exige que no queden hallazgos sin evaluar", () => {
  const f = functionBody("quality_close_audit");
  assert(/evaluation_status = 'pending'/.test(f),
    "se puede cerrar dejando hallazgos sin evaluar");
  assert(/raise exception/.test(f), "no se rechaza nada al cerrar");
});

check("G3. el seguimiento se DERIVA del motor transversal", () => {
  const vista = SQL.slice(SQL.indexOf("v_quality_audit_overview"));
  assert(/work_cases/.test(vista.slice(0, 4000)), "el resumen no lee los casos");
  assert(/work_actions/.test(vista.slice(0, 4000)), "el resumen no lee las acciones");
  assert(!/open_actions\s+integer/.test(tableBody("quality_audits")),
    "el conteo de acciones está copiado en la auditoría: se desincroniza");
});

check("G4. la frase del cierre lo dice con todas las letras", () => {
  const f = describeFollowUp({ openCases: 2, openActions: 3 });
  assert(/2/.test(f) && /3/.test(f), "la frase no dice cuántos");
  assert(/CLOSING_AUDIT_IS_NOT_CLOSING_ACTIONS/.test(COMPONENTS),
    "la pantalla no dice que cerrar la auditoría no cierra las acciones");
  assert(/CLOSING_AUDIT_IS_NOT_CLOSING_ACTIONS/.test(ADAPTERS),
    "el papel no lo dice");
});

// ---------------------------------------------------------------------------
console.log("\nH · EL INFORME ES UNA FOTO (AR-16, §41, §82)");

check("H1. el informe guarda su propia instantánea", () => {
  assert(/snapshot\s+jsonb not null/.test(tableBody("quality_audit_reports")),
    "el informe no congela nada");
  const f = functionBody("quality_issue_audit_report");
  assert(/jsonb_build_object/.test(f), "el informe no arma la foto");
  assert(/'team'/.test(f) && /'criteria'/.test(f) && /'findings'/.test(f),
    "la foto no incluye equipo, criterios o hallazgos");
});

check("H2. la foto guarda la REVISIÓN auditada, no la de hoy", () => {
  const f = functionBody("quality_issue_audit_report");
  assert(/document_revision/.test(f), "la foto no guarda la revisión del documento");
  assert(/trazadoc_document_revisions/.test(f),
    "la foto no resuelve la revisión desde el motor documental");
});

check("H3. un informe emitido NO se edita: se emite otro que lo corrige", () => {
  assert(/supersedes_id\s+uuid/.test(tableBody("quality_audit_reports")),
    "no se puede corregir un informe con otro");
  assert(!/on public\.quality_audit_reports\s+for update/.test(SQL),
    "un informe se puede editar: deja de ser una foto");
  assert(!/on public\.quality_audit_reports\s+for delete/.test(SQL),
    "un informe se puede borrar");
});

check("H4. el PDF del informe se imprime DESDE la instantánea", () => {
  const a = ADAPTERS.slice(ADAPTERS.indexOf("qualityAuditReportDetail"));
  assert(/report\.snapshot/.test(a), "el PDF del informe no lee la instantánea");
  assert(/temporality: "historical"/.test(a),
    "el informe no se declara documento del pasado");
});

check("H5. el informe exige conclusiones escritas por una persona", () => {
  const f = functionBody("quality_issue_audit_report");
  assert(/conclusions/.test(f), "el informe no mira las conclusiones");
  assert(/raise exception[\s\S]{0,160}conclusiones/i.test(f),
    "se puede emitir un informe sin conclusiones");
});

check("H6. las conclusiones NO se deducen de los hallazgos", () => {
  assert(/conclusions\s+text/.test(tableBody("quality_audits")),
    "la auditoría no tiene conclusiones propias");
  const f = functionBody("quality_issue_audit_report");
  assert(!/conclusions\s*:=|set conclusions\s*=/.test(f),
    "el sistema escribe las conclusiones solo");
  assert(/CONCLUSIONS_ARE_HUMAN/.test(COMPONENTS), "la pantalla no lo dice");
});

// ---------------------------------------------------------------------------
console.log("\nI · TRAZALOOP NO CERTIFICA (§39)");

const PROHIBIDAS = [
  /\bcertificad[oa]\b/i, /\bcertificamos\b/i, /ISO compliant/i,
  /\bconforme a la norma\b/i, /\bacreditad[oa]\b/i,
];

check("I1. ningún texto de dominio promete certificación", () => {
  const texto = stripTs(DOMAIN);
  for (const re of PROHIBIDAS) {
    const m = re.exec(texto);
    // La constante que NIEGA la certificación puede nombrarla; lo prohibido es
    // afirmarla. Se comprueba que cualquier aparición esté dentro de la frase
    // que la niega.
    if (m) {
      const ctx = texto.slice(Math.max(0, m.index - 200), m.index + 200);
      assert(/no concede|no certifica|no es|nunca/i.test(ctx),
        `«${m[0]}» aparece afirmando algo en el dominio`);
    }
  }
});

check("I2. ningún PDF se presenta como certificado", () => {
  const texto = stripTs(ADAPTERS);
  for (const re of PROHIBIDAS) {
    const m = re.exec(texto);
    if (m) {
      const ctx = texto.slice(Math.max(0, m.index - 250), m.index + 250);
      assert(/no concede|no certifica|acreditado, que no es esto/i.test(ctx),
        `«${m[0]}» aparece afirmando algo en un papel`);
    }
  }
  assert(/TRAZALOOP_DOES_NOT_CERTIFY|NOT_A_CERTIFICATE/.test(ADAPTERS),
    "ningún papel lleva el aviso de que Trazaloop no certifica");
});

check("I3. ninguna pantalla ni ruta promete certificación", () => {
  const texto = stripTs(COMPONENTS) + stripTs(ROUTES);
  for (const re of PROHIBIDAS) {
    const m = re.exec(texto);
    if (m) {
      const ctx = texto.slice(Math.max(0, m.index - 250), m.index + 250);
      assert(/no concede|no certifica/i.test(ctx),
        `«${m[0]}» aparece afirmando algo en la interfaz`);
    }
  }
});

check("I4. el aviso está donde se produce la confusión", () => {
  assert(/TRAZALOOP_DOES_NOT_CERTIFY/.test(COMPONENTS),
    "la ficha de la auditoría no lo dice");
  assert(/no concede certificación/i.test(ROUTES),
    "la portada del dominio no lo dice");
});

// ---------------------------------------------------------------------------
console.log("\nJ · PRIORIZAR SUGIERE; NO PROGRAMA (AR-04, §46, §77)");

check("J1. el contexto de priorización solo LEE", () => {
  const f = functionBody("quality_audit_priority_context");
  assert(!/insert into|update |delete from/.test(f),
    "el contexto de priorización escribe algo");
  assert(/'suggests_only',\s*true/.test(f), "no se dice que solo sugiere");
  assert(/'schedules_automatically',\s*false/.test(f),
    "no se dice que no programa nada solo");
});

check("J2. el peso es EXPLICABLE: devuelve sus motivos", () => {
  const r = explainPriority({
    risks: { total: 5, aboveAppetite: 2, materialized: 1 },
    indicators: { total: 4, offTarget: 1 },
    cases: { open: 3, nonconformities: 1 },
    priorAudits: { count: 1, lastExecutedOn: "2023-01-01", priorFindings: 4 },
  }, "2026-08-21");
  assert(r.score > 0, "el peso no sube con riesgos sobre el criterio");
  assert(r.reasons.length >= 3, "el peso no explica de dónde salió");
  assert(r.reasons.some((x) => /riesgo/i.test(x)), "no se nombra el riesgo");
});

check("J3. un riesgo alto NO crea una auditoría", () => {
  const f = functionBody("quality_scan_audits");
  assert(!/insert into quality_audits/.test(f),
    "el barrido crea auditorías solo");
  assert(!/insert into quality_audit_findings/.test(f),
    "el barrido crea hallazgos");
  assert(!/insert into work_cases/.test(f), "el barrido abre casos");
});

check("J4. el barrido es idempotente", () => {
  const f = functionBody("quality_scan_audits");
  assert(/not exists/.test(f), "el barrido no comprueba si el aviso ya existe");
  assert(/insert into work_alerts/.test(f), "el barrido no produce avisos");
});

// ---------------------------------------------------------------------------
console.log("\nK · MULTIEMPRESA Y SEGURIDAD (§60…§63, §91)");

check("K1. todas las tablas del dominio llevan RLS", () => {
  const tablas = [...SQL.matchAll(/create table public\.(quality_audit[a-z_]*)/g)]
    .map((m) => m[1]);
  assert(tablas.length >= 20, `solo se encontraron ${tablas.length} tablas`);
  for (const t of tablas) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(SQL),
      `${t} no tiene RLS`);
  }
});

check("K2. ninguna tabla del dominio concede nada a anon", () => {
  const tablas = [...SQL.matchAll(/create table public\.(quality_audit[a-z_]*)/g)]
    .map((m) => m[1]);
  for (const t of tablas) {
    assert(!new RegExp(`grant [a-z, ]+ on (table )?public\\.${t}\\s+to [^;]*anon`).test(SQL),
      `${t} concede privilegios a anon`);
  }
});

check("K3. cada tabla revoca antes de conceder", () => {
  const tablas = [...SQL.matchAll(/create table public\.(quality_audit[a-z_]*)/g)]
    .map((m) => m[1]);
  for (const t of tablas) {
    assert(new RegExp(`revoke all on table public\\.${t}\\s+from anon, authenticated`).test(SQL),
      `${t} no revoca los privilegios por defecto de Supabase`);
  }
});

check("K4. toda función SECURITY DEFINER fija su search_path", () => {
  const bloques = RAW_SQL.split(/create or replace function/).slice(1);
  for (const b of bloques) {
    if (!/security definer/.test(b)) continue;
    const cabecera = b.slice(0, b.indexOf("as $$"));
    const nombre = /public\.([a-z0-9_]+)/.exec(b)?.[1] ?? "?";
    assert(/set search_path = public/.test(cabecera),
      `${nombre} es definer y no fija search_path`);
  }
});

check("K5. las FK del dominio son COMPUESTAS: no se cruza de empresa", () => {
  const compuestas = [...SQL.matchAll(/foreign key \(organization_id, [a-z_]+\)/g)].length;
  assert(compuestas >= 30,
    `solo ${compuestas} FK compuestas: alguna relación admite otra empresa`);
});

check("K6. ninguna función confía en un organization_id que le pasen", () => {
  const sospechosas = [...SQL.matchAll(/function public\.(quality_[a-z0-9_]+)\(p_organization_id uuid/g)]
    .map((m) => m[1]);
  for (const n of sospechosas) {
    // Una función revocada también a `authenticated` no tiene puerta: solo la
    // llama otra función definer del mismo dominio, que ya revalidó. Exigirle
    // la comprobación otra vez sería ruido.
    if (new RegExp(`revoke all on function public\\.${n}\\(uuid\\) from public, anon, authenticated`)
      .test(SQL)) continue;
    const f = functionBody(n);
    // `has_org_role` e `is_org_member` resuelven la pertenencia contra la
    // sesión, no contra el argumento: eso es exactamente la revalidación.
    assert(/is_org_member|has_org_role|quality_reads_audits|quality_manages_audits/.test(f),
      `${n} acepta organization_id sin revalidar la pertenencia`);
  }
});

check("K7. las vistas son security_invoker", () => {
  const vistas = [...SQL.matchAll(/create or replace view public\.(v_quality_audit[a-z_]*)/g)]
    .map((m) => m[1]);
  assert(vistas.length === 3, `hay ${vistas.length} vistas, se esperaban 3`);
  for (const v of vistas) {
    const i = SQL.indexOf(`view public.${v}`);
    assert(/security_invoker/.test(SQL.slice(i, i + 200)),
      `${v} no es security_invoker`);
  }
});

check("K8. la capa de datos NUNCA usa service_role", () => {
  assert(!/service_role|createAdminClient|SERVICE_ROLE/.test(stripTs(DB)),
    "la capa de datos se salta la RLS con la clave de servicio");
  assert(!/service_role|createAdminClient/.test(stripTs(ACTIONS)),
    "las acciones se saltan la RLS");
});

check("K9. las acciones comprueban rol ANTES de escribir", () => {
  const funciones = [...ACTIONS.matchAll(/export async function (\w+Action)\(/g)]
    .map((m) => m[1]);
  assert(funciones.length >= 30, `solo ${funciones.length} acciones`);
  for (const f of funciones) {
    const i = ACTIONS.indexOf(`export async function ${f}(`);
    const cuerpo = ACTIONS.slice(i, i + 1400);
    assert(/const g = await gate\(\)/.test(cuerpo), `${f} no pasa por la puerta`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nL · EL MOTOR TRANSVERSAL SE REUSA, NO SE DUPLICA (§36, §50)");

check("L1. no se creó un segundo motor de casos ni de acciones", () => {
  assert(!/create table public\.quality_audit_cases/.test(SQL),
    "se creó un motor de casos paralelo");
  assert(!/create table public\.quality_audit_actions/.test(SQL),
    "se creó un motor de acciones paralelo");
  assert(!/create table public\.quality_audit_tasks/.test(SQL),
    "se creó una bandeja de tareas paralela");
  assert(!/create table public\.quality_audit_alerts/.test(SQL),
    "se creó un sistema de avisos paralelo");
});

check("L2. los catálogos transversales se AMPLÍAN, no se sustituyen", () => {
  for (const t of ["work_tasks", "work_alerts", "work_events", "work_decisions",
                   "work_references"]) {
    assert(new RegExp(`alter table public\\.${t}\\s+drop constraint`).test(SQL),
      `${t} no se amplía`);
    assert(new RegExp(`alter table public\\.${t}\\s+add constraint`).test(SQL),
      `${t} se soltó sin volver a restringirse`);
  }
});

check("L3. el enumerado de la bandeja conoce los tipos nuevos", () => {
  for (const t of ["audit_preparation", "audit_plan_review", "audit_execution",
                   "audit_report_issue", "audit_finding_evaluation", "audit_followup"]) {
    assert((TASK_TYPES as readonly string[]).includes(t), `falta la tarea ${t}`);
    assert(TASK_TYPE_LABEL[t as keyof typeof TASK_TYPE_LABEL], `${t} no tiene etiqueta`);
    assert(new RegExp(`'${t}'`).test(SQL), `la base no admite la tarea ${t}`);
  }
});

check("L4. los avisos nuevos existen en los dos lados", () => {
  for (const a of ["audit_upcoming", "audit_overdue", "audit_report_pending",
                   "audit_finding_unevaluated", "audit_independence_conflict",
                   "audit_program_coverage_gap"]) {
    assert((ALERT_TYPES as readonly string[]).includes(a), `falta el aviso ${a}`);
    assert(ALERT_TYPE_LABEL[a as keyof typeof ALERT_TYPE_LABEL], `${a} no tiene etiqueta`);
    assert(new RegExp(`'${a}'`).test(SQL), `la base no admite el aviso ${a}`);
  }
});

check("L5. los tipos de asunto llevan a una pantalla que existe", () => {
  const vista = read("components/domain/quality/tasks-view.tsx");
  for (const s of ["quality_audit_program", "quality_audit", "quality_audit_finding"]) {
    assert((SUBJECT_TYPES as readonly string[]).includes(s), `falta el asunto ${s}`);
    assert(new RegExp(`case "${s}"`).test(vista), `${s} no tiene destino en la bandeja`);
  }
  const rutas = routeFiles.map((f) => f.replace(ROUTES_DIR, "/quality/audits"));
  assert(rutas.some((r) => /findings/.test(r)), "no existe la pantalla de hallazgos");
  assert(rutas.some((r) => /programs/.test(r)), "no existe la pantalla del programa");
});

check("L6. ningún aviso clasifica, abre casos ni cambia estados", () => {
  const f = functionBody("quality_scan_audits");
  assert(!/update quality_audits\s+set status/.test(f),
    "el barrido cambia el estado de una auditoría");
  assert(!/update quality_audit_findings/.test(f),
    "el barrido toca los hallazgos");
});

// ---------------------------------------------------------------------------
console.log("\nM · CICLO DE VIDA Y BORRADO (§56…§59)");

check("M1. la auditoría y el programa entran en el ciclo de vida común", () => {
  assert((LIFECYCLE_ENTITIES as readonly string[]).includes("audit"),
    "la auditoría no está en el ciclo de vida");
  assert((LIFECYCLE_ENTITIES as readonly string[]).includes("audit_program"),
    "el programa no está en el ciclo de vida");
});

check("M2. el dictamen lo emite la MISMA función de siempre", () => {
  const f = functionBody("quality_deletion_eligibility");
  assert(/quality_audit_deletion_verdict/.test(f), "la auditoría no tiene dictamen");
  assert(/quality_audit_program_deletion_verdict/.test(f),
    "el programa no tiene dictamen");
});

check("M3. la reescritura del dictamen NO perdió las guardas heredadas", () => {
  const f = functionBody("quality_deletion_eligibility");
  assert(/if auth\.uid\(\) is null/.test(f),
    "se perdió la guarda de sesión: un anónimo obtendría dictámenes");
  assert(/quality_can_read_person/.test(f),
    "se perdió la guarda de lectura de personas");
});

check("M4. una auditoría ejecutada NO se borra", () => {
  const f = functionBody("quality_audit_deletion_verdict");
  assert(/'has_history'|'in_use'/.test(f), "el dictamen no sabe negar el borrado");
  assert(/findings|evidence|reports/.test(f),
    "el dictamen no mira hallazgos, evidencia ni informes");
  assert(/'retire'|'close'|alternative/.test(f), "el dictamen no ofrece salida");
});

check("M5. hay guarda de borrado en la base, no solo en la pantalla", () => {
  assert(/quality_audit_delete_guard/.test(SQL), "no hay guarda de borrado");
  assert(/before delete on public\.quality_audits/.test(SQL),
    "la guarda no está atada al borrado");
});

// ---------------------------------------------------------------------------
console.log("\nN · INMUTABILIDAD AL CERRAR (§53, §54)");

check("N1. una auditoría cerrada no admite hallazgos nuevos", () => {
  assert(/quality_audit_is_closed/.test(SQL), "no hay guarda de auditoría cerrada");
  const f = functionBody("quality_audit_is_closed");
  assert(/raise exception/.test(f), "la guarda no rechaza nada");
});

check("N2. un hallazgo evaluado no se reescribe por la puerta de atrás", () => {
  assert(/quality_audit_finding_is_frozen/.test(SQL),
    "no hay guarda sobre los hallazgos ya evaluados");
});

check("N3. cerrar es final: el estado cerrado no se deshace en silencio", () => {
  assert(/quality_audit_closed_is_final/.test(SQL),
    "no hay guarda sobre el estado cerrado");
});

// ---------------------------------------------------------------------------
console.log("\nO · CATÁLOGOS COMPLETOS Y COHERENTES");

check("O1. cada enumerado del dominio coincide con el de la base", () => {
  const pares: [readonly string[], string][] = [
    [PROGRAM_STATUSES, "quality_audit_programs"],
    [AUDIT_TYPES, "quality_audits"],
    [AUDIT_NATURES, "quality_audits"],
    [AUDIT_STATUSES, "quality_audits"],
    [SCOPE_ITEM_KINDS, "quality_audit_scope_items"],
    [CRITERION_KINDS, "quality_audit_criteria"],
    [TEAM_ROLES, "quality_audit_team_members"],
    [CONFLICT_KINDS, "quality_audit_conflict_checks"],
    [CONFLICT_STATUSES, "quality_audit_conflict_checks"],
    [NOTE_KINDS, "quality_audit_notes"],
    [EVIDENCE_KINDS, "quality_audit_evidence"],
    [CHECK_OUTCOMES, "quality_audit_check_results"],
    [FINDING_CLASSIFICATIONS, "quality_audit_findings"],
    [FINDING_EVALUATION_STATUSES, "quality_audit_findings"],
    [FINDING_SEVERITIES, "quality_audit_findings"],
    [CHECKLIST_VERSION_STATUSES, "quality_audit_checklist_versions"],
    [AGENDA_ACTIVITY_KINDS, "quality_audit_agenda_items"],
    [MEETING_KINDS, "quality_audit_meetings"],
  ];
  for (const [valores, tabla] of pares) {
    const cuerpo = tableBody(tabla);
    for (const v of valores) {
      assert(cuerpo.includes(`'${v}'`), `${tabla} no admite «${v}»`);
    }
  }
});

check("O2. las revisiones del programa tienen su catálogo en los dos lados", () => {
  const cuerpo = tableBody("quality_audit_program_revisions");
  for (const v of PROGRAM_REVISION_KINDS) {
    assert(cuerpo.includes(`'${v}'`), `la revisión no admite «${v}»`);
  }
});

check("O3. el alcance sabe qué elementos exigen referencia", () => {
  assert(scopeItemNeedsReference("process") === true, "un proceso no exige referencia");
  assert(scopeItemNeedsReference("other") === false, "«otro» exige referencia");
  const cuerpo = tableBody("quality_audit_scope_items");
  assert(/item_kind = 'process'\s+and process_id is not null/.test(cuerpo),
    "la base no exige el proceso cuando el elemento es un proceso");
});

check("O4. los roles distinguen leer, gestionar y cerrar", () => {
  assert(canReadAudits("member") === true, "un miembro no puede leer auditorías");
  assert(canManageAudits("member") === false, "un miembro puede gestionar auditorías");
  assert(canCloseAudits("admin") === true, "quien administra no puede cerrar");
  // §33 · El consultor externo conduce el trabajo, pero el informe y el cierre
  // son actos de la empresa sobre sí misma.
  assert(canManageAudits("consultant") === true, "un consultor no puede conducir auditorías");
  assert(canCloseAudits("consultant") === false, "un consultor externo puede cerrar la auditoría");
  for (const f of ["quality_reads_audits", "quality_manages_audits", "quality_closes_audits"]) {
    assert(new RegExp(`function public\\.${f}`).test(SQL), `falta ${f} en la base`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nP · LOS PAPELES (§69, §70)");

const CLAVES = [
  "quality.audit-program.detail", "quality.audit-program.list",
  "quality.audit.detail", "quality.audit.list",
  "quality.audit-plan.detail", "quality.audit-agenda.detail",
  "quality.audit-checklist.detail", "quality.audit-execution.detail",
  "quality.audit-finding.detail", "quality.audit-finding.list",
  "quality.audit-report.detail", "quality.audit-followup.list",
];

check("P1. las doce claves existen en el registro cerrado", () => {
  const registro = read("lib/export/registry.ts");
  for (const k of CLAVES) {
    assert(ADAPTERS.includes(`key: "${k}"`), `no existe el adaptador de ${k}`);
  }
  assert(/quality-audits/.test(registro), "el registro no importa los papeles");
});

check("P2. la gramática de las claves se respeta", () => {
  for (const k of CLAVES) {
    const partes = k.split(".");
    assert(partes.length === 3, `${k} no tiene tres partes`);
    assert(partes[0] === "quality", `${k} no es de Quality`);
    assert(["detail", "list", "historical"].includes(partes[2]),
      `${k} termina en un eje inventado`);
  }
});

check("P3. los listados se llaman Listado o Reporte", () => {
  const nombres = [...ADAPTERS.matchAll(/kind: "list"[\s\S]{0,400}?documentName: "([^"]+)"/g)]
    .map((m) => m[1]);
  const nombres2 = [...ADAPTERS.matchAll(/documentName: "([^"]+)"[\s\S]{0,300}?kind: "list"/g)]
    .map((m) => m[1]);
  const todos = [...new Set([...nombres, ...nombres2])];
  assert(todos.length >= 4, `solo ${todos.length} nombres de listado`);
  for (const n of todos) {
    assert(/^(Listado|Lista maestra|Maestro|Reporte)/.test(n),
      `«${n}» no se llama como un listado`);
  }
});

check("P4. el inventario promete exactamente lo que el registro cumple", () => {
  const prometidas = new Set(promisedKeys());
  for (const k of CLAVES) {
    assert(prometidas.has(k), `${k} no está prometida en el inventario`);
  }
  const auditoria = EXPORT_INVENTORY.filter((r) => /auditor/i.test(r.entity));
  assert(auditoria.length >= 18,
    `solo ${auditoria.length} entidades de auditoría clasificadas`);
});

check("P5. ningún papel de auditoría se declara histórico sin serlo", () => {
  const bloques = ADAPTERS.split("export const ").slice(1);
  for (const b of bloques) {
    if (!/temporality: "historical"/.test(b)) continue;
    assert(/snapshot|versions/.test(b),
      `un papel se declara histórico sin leer ninguna instantánea: ${b.slice(0, 40)}`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nQ · LA PANTALLA (§64…§68)");

check("Q1. el grupo de navegación existe y tiene cinco entradas", () => {
  const reg = read("lib/modules/registry.ts");
  assert(/QUALITY_AUDITORIAS_GROUP/.test(reg), "no hay grupo de auditorías");
  const i = reg.indexOf("QUALITY_AUDITORIAS_GROUP");
  const bloque = reg.slice(i, reg.indexOf("};", i));
  const entradas = [...bloque.matchAll(/label: "/g)].length;
  assert(entradas === 5, `el grupo tiene ${entradas} entradas, se esperaban 5`);
  assert(/groups: \[[\s\S]*QUALITY_AUDITORIAS_GROUP/.test(reg),
    "el grupo no está enganchado al módulo");
});

check("Q2. las rutas del dominio existen", () => {
  const esperadas = ["page.tsx", "programs/page.tsx", "list/page.tsx",
                     "findings/page.tsx", "checklists/page.tsx"];
  for (const r of esperadas) {
    assert(routeFiles.some((f) => f.endsWith(r)), `falta la ruta ${r}`);
  }
  assert(routeFiles.some((f) => /\[auditId\]/.test(f)), "falta la ficha de la auditoría");
  assert(routeFiles.some((f) => /\[programId\]/.test(f)), "falta la ficha del programa");
});

check("Q3. las rutas viven DENTRO del turno con sesión", () => {
  for (const f of routeFiles) {
    assert(f.includes("(app)"), `${f} está fuera del área con sesión`);
    assert(/requireQualityModule/.test(read(f)), `${f} no comprueba el módulo`);
  }
});

check("Q4. la portada de Quality avisa de las auditorías", () => {
  const home = read("app/(app)/(shell)/quality/page.tsx");
  assert(/getAuditHomeSignals/.test(home), "la portada no lee las señales");
  assert(/auditLines/.test(home), "la portada no pinta ninguna línea de auditoría");
  assert(/hallazgo sin evaluar/i.test(home), "la portada no avisa de hallazgos sin evaluar");
});

check("Q5. las pantallas enseñan la separación donde se produce", () => {
  assert(/FINDING_IS_NOT_NC/.test(COMPONENTS), "no se dice que hallazgo ≠ NC");
  assert(/CHECK_IS_NOT_A_FINDING/.test(COMPONENTS), "no se dice que respuesta ≠ hallazgo");
  assert(/EVIDENCE_IS_NOT_A_FINDING/.test(COMPONENTS), "no se dice que evidencia ≠ hallazgo");
  assert(/NOTE_IS_NOT_EVIDENCE/.test(COMPONENTS), "no se dice que nota ≠ evidencia");
  assert(/PROGRAM_IS_NOT_AN_AUDIT/.test(COMPONENTS), "no se dice que programa ≠ auditoría");
  assert(/INDEPENDENCE_IS_NOT_DECLARED/.test(COMPONENTS), "no se dice quién declara la independencia");
});

check("Q6. la interfaz no promete que el sistema decide", () => {
  const texto = stripTs(COMPONENTS);
  assert(!/clasificad[oa] automáticamente/i.test(texto), "la pantalla dice que clasifica sola");
  assert(!/se abrió un caso automáticamente/i.test(texto), "la pantalla abre casos sola");
});

// ---------------------------------------------------------------------------
console.log("\nR · LA MIGRACIÓN (§88)");

check("R1. hay UNA sola migración de auditorías, y es 0127", () => {
  const migraciones = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql")).sort();
  const deAuditorias = migraciones.filter((f) => /quality_audits/.test(f));
  assert(deAuditorias.length === 1 && deAuditorias[0] === "0127_quality_audits.sql",
    `hay ${deAuditorias.length} migraciones de auditorías: ${deAuditorias.join(", ")}`);
  assert(migraciones.includes("0126_quality_customer_voice.sql"),
    "una migración anterior desapareció");
});

check("R2. append-only: no destruye nada de lo que ya había", () => {
  assert(!/drop table|drop column|truncate/i.test(SQL),
    "la migración destruye estructura existente");
  const drops = [...SQL.matchAll(/drop constraint ([a-z0-9_]+)/g)].length;
  const adds = [...SQL.matchAll(/add constraint ([a-z0-9_]+)/g)].length;
  assert(adds >= drops, "se soltó una restricción sin volver a ponerla");
});

check("R3. pgcrypto, si se usa, va cualificado por esquema", () => {
  const sinCualificar = /[^.\w](gen_random_bytes|digest|crypt)\s*\(/.exec(
    SQL.replace(/extensions\.(gen_random_bytes|digest|crypt)/g, "OK")
  );
  assert(sinCualificar === null,
    `«${sinCualificar?.[1]}» se llama sin cualificar: fallaría con search_path = public`);
});

check("R4. la migración no toca datos de otros módulos", () => {
  assert(!/update customer_requirements|update work_cases|update evidences/i.test(SQL),
    "la migración reescribe datos de otro dominio");
  assert(!/insert into quality_audits\b/.test(SQL), "la migración siembra datos");
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
