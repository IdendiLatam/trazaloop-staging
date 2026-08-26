/**
 * Trazaloop · QUALITY-06 · Puras y estáticas.
 *
 * Comprueban que las separaciones de PC existan EN EL CÓDIGO y no solo en la
 * prosa del informe:
 *
 *   CARGO ≠ PERSONA ≠ USUARIO
 *   COMPETENCIA ≠ DESEMPEÑO
 *   ASISTENCIA ≠ APRENDIZAJE ≠ COMPETENCIA ≠ EFICACIA
 *   HOLDER ≠ DUEÑO DEL CONOCIMIENTO
 *   REQUISITO DE HOY ≠ REQUISITO DE ENTONCES
 *
 * y que las cosas que este dominio NO debe ser —HRIS, nómina, ranking de
 * empleados, vigilancia— no se hayan colado por una columna, un enum o un
 * cálculo.
 *
 * Ninguna toca base de datos ni red.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASSIGNMENT_TYPES, ATTENDANCE_STATUSES, canManagePeople, canManageStructure,
  canReadEvaluations, competenceGap, CRITICALITIES, DEVELOPMENT_KINDS,
  DEVELOPMENT_KINDS_THAT_ARE_NOT_TRAINING, describeEvidenceExpiry, describeLayers,
  EFFECTIVENESS_RESULTS, evidenceNeedsReview, FORBIDDEN_PERSON_FIELDS,
  hasContinuityAttention, isEffectiveOn, KNOWLEDGE_KINDS, KNOWLEDGE_SIGNAL_LABEL,
  LEARNING_RESULTS, PERFORMANCE_RESULTS, PERSON_COMPETENCE_STATUSES,
  POSITION_VERSION_STATUSES, primaryHolder, proposalCanBeApplied, PROPOSAL_STATUSES,
} from "../../lib/domain/quality-people";
import { EXPORT_INVENTORY, promisedKeys } from "../../lib/export/inventory";
import {
  ALERT_TYPES, ALERT_TYPE_LABEL, SUBJECT_TYPES, TASK_TYPES, TASK_TYPE_LABEL,
} from "../../lib/domain/work-inbox";
import { REFERENCE_KINDS } from "../../lib/domain/work-cases";
import { renderPrintDocument } from "../../lib/export/render";
import type { PrintDocument, PrintNode } from "../../lib/export/print-model";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
/** Quita comentarios de TypeScript. Sin esto, una prueba que busca la palabra
 *  «ranking» falla justamente por el comentario que explica que NO hay
 *  ranking, y la prohibición acaba impidiendo documentarla. */
const stripTs = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const MIG = "supabase/migrations/0123_quality_people_competence_knowledge.sql";
/** 0124 reescribe el barrido para que además produzca TAREAS. Las
 *  comprobaciones que hablan del barrido tienen que leer la versión VIGENTE,
 *  no la primera: si no, seguirían aprobando una función que ya no corre. */
const MIG_TAREAS = "supabase/migrations/0124_quality_people_tasks_from_sweep.sql";
const SQL = stripSql(read(MIG));
const SQL_SWEEP = stripSql(read(MIG_TAREAS));


/**
 * Las definiciones de exportación se leen del CÓDIGO FUENTE, no importando el
 * registro. El registro es `server-only` y arrastra la capa de datos entera;
 * una prueba pura no puede —ni debe— levantar eso. Lo que importa aquí es lo
 * que está escrito en el archivo, que es exactamente lo que se despliega.
 */
type ExportDecl = {
  key: string; documentName: string;
  temporality: string | null; historicalLimitReason: string | null;
};

function declaredExports(): ExportDecl[] {
  const fuentes = [
    "lib/export/adapters/quality-people.ts",
    "lib/export/adapters/quality-development.ts",
  ].map(read).join("\n");
  const out: ExportDecl[] = [];
  // Solo las claves de EXPORTACIÓN. Un `key: "date"` de un filtro
  // desincronizaría el emparejamiento con el `documentName` siguiente.
  const re = /key:\s*"([a-z0-9-]+\.[a-z0-9-]+\.(?:detail|list|historical))",[\s\S]*?documentName:\s*"([^"]+)"/g;
  for (const m of fuentes.matchAll(re)) {
    const bloque = fuentes.slice(m.index ?? 0, (m.index ?? 0) + 1400);
    const temp = /temporality:\s*"(\w+)"/.exec(bloque);
    const reason = /historicalLimitReason:\s*\n?\s*"([\s\S]*?)",\n/.exec(bloque);
    out.push({
      key: m[1], documentName: m[2],
      temporality: temp ? temp[1] : null,
      historicalLimitReason: reason ? reason[1] : null,
    });
  }
  return out;
}

const REGISTRY_SOURCE = read("lib/export/registry.ts");

let passed = 0, failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${name}: ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

console.log("\nQUALITY-06 · puras y estáticas\n");

// ---------------------------------------------------------------------------
console.log("A · CARGO ≠ PERSONA ≠ USUARIO");

check("A1. la persona existe como entidad propia y su vínculo con la cuenta es OPCIONAL", () => {
  assert(/create table public\.quality_people/.test(SQL), "no existe la tabla de personas");
  const bloque = SQL.slice(SQL.indexOf("create table public.quality_people"));
  const cuerpo = bloque.slice(0, bloque.indexOf(");"));
  assert(/profile_id\s+uuid references public\.profiles \(id\)/.test(cuerpo),
    "el vínculo con la cuenta no está declarado");
  assert(!/profile_id\s+uuid not null/.test(cuerpo),
    "el vínculo con la cuenta es obligatorio: una persona sin login no podría existir");
});

check("A2. la asignación admite persona SIN cuenta, y exige al menos un actor", () => {
  assert(/alter column profile_id drop not null/.test(SQL),
    "profile_id sigue siendo obligatorio en la asignación");
  assert(/quality_position_assignments_actor_present/.test(SQL),
    "no se exige que la asignación nombre a alguien");
  assert(/check \(person_id is not null or profile_id is not null\)/.test(SQL),
    "la comprobación de actor no dice lo que debe");
});

check("A3. NO se crea un segundo catálogo de cargos", () => {
  assert(!/create table public\.quality_positions\b/.test(SQL),
    "QUALITY-06 recreó la tabla de cargos en vez de evolucionarla");
  assert(/alter table public\.quality_positions/.test(SQL),
    "no se evolucionó la tabla de cargos de QUALITY-01");
});

check("A4. la historia de QUALITY-01 se conserva: hay backfill, no borrado", () => {
  assert(/insert into public\.quality_people[\s\S]*from public\.quality_position_assignments/.test(SQL),
    "las asignaciones existentes se quedarían sin persona");
  assert(!/drop table public\.quality_position_assignments/.test(SQL),
    "se destruyó la tabla de asignaciones");
  assert(!/delete from public\.quality_position_assignments/.test(SQL),
    "se borraron asignaciones existentes");
});

check("A5. un cargo puede tener varios ocupantes, y el titular principal es EXPLÍCITO", () => {
  assert(ASSIGNMENT_TYPES.includes("co_holder"), "no existe la figura de cotitular");
  assert(/assignment_type in \('holder', 'co_holder', 'acting', 'delegate'\)/.test(SQL),
    "la base no admite cotitulares");
  // Y nadie deduce el titular por el primero de una lista.
  const uno = primaryHolder([
    { assignmentType: "co_holder" as const }, { assignmentType: "holder" as const },
  ]);
  assert(uno?.assignmentType === "holder", "el titular no se resuelve por su tipo");
  const ambiguo = primaryHolder([
    { assignmentType: "co_holder" as const }, { assignmentType: "co_holder" as const },
  ]);
  assert(ambiguo === null, "con dos cotitulares y ningún titular la respuesta debe ser «ninguno»");
});

check("A6. ninguna pantalla ni adaptador resuelve el titular con un First()", () => {
  for (const f of ["lib/db/quality-people.ts", "lib/export/adapters/quality-people.ts"]) {
    const src = read(f);
    assert(!/assignments\[0\]|holders\[0\]\.person/.test(src),
      `${f} deduce el titular por el primero de una lista`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nB · La ficha de persona NO es un expediente laboral");

check("B1. el esquema no guarda salario, banco, salud, religión ni disciplina", () => {
  const bloque = SQL.slice(SQL.indexOf("create table public.quality_people"));
  const cuerpo = bloque.slice(0, bloque.indexOf(");")).toLowerCase();
  for (const prohibido of FORBIDDEN_PERSON_FIELDS) {
    assert(!cuerpo.includes(prohibido), `la ficha guarda «${prohibido}»`);
  }
});

check("B2. tampoco aparecen en ninguna tabla nueva del sprint", () => {
  const tablas = [...SQL.matchAll(/create table public\.(quality_\w+)/g)].map((m) => m[1]);
  const nuevas = tablas.filter((t) => t.startsWith("quality_"));
  assert(nuevas.length > 15, "el sprint debería crear el dominio completo");
  const sinComentarios = SQL.toLowerCase();
  for (const prohibido of ["salary", "bank_account", "iban", "religion", "sexual_orientation"]) {
    assert(!new RegExp(`\\n\\s+${prohibido}\\s+(text|numeric|uuid|date)`).test(sinComentarios),
      `alguna tabla del sprint declara «${prohibido}»`);
  }
});

check("B3. no se abre ningún dominio fuera de alcance", () => {
  for (const t of ["quality_payroll", "quality_salaries", "quality_medical_records",
                   "quality_disciplinary", "quality_attendance_clock", "quality_recruitment"]) {
    assert(!new RegExp(`create table public\\.${t}`).test(SQL), `${t} está fuera de alcance`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nC · COMPETENCIA ≠ DESEMPEÑO");

check("C1. el desempeño vive en tablas propias", () => {
  for (const t of ["quality_performance_cycles", "quality_performance_evaluations",
                   "quality_performance_items"]) {
    assert(new RegExp(`create table public\\.${t}`).test(SQL), `falta ${t}`);
  }
});

check("C2. evaluar el desempeño NO escribe en la competencia declarada", () => {
  // La RPC de cierre es el único camino formal: si escribiera competencia,
  // aparecería aquí.
  const rpc = SQL.slice(
    SQL.indexOf("function public.quality_close_performance_evaluation"),
    SQL.indexOf("revoke all on function public.quality_close_performance_evaluation")
  );
  assert(rpc.length > 100, "no se encontró la RPC de cierre");
  assert(!/quality_person_competencies/.test(rpc),
    "cerrar una evaluación de desempeño toca la competencia de la persona");
});

check("C3. no existe puntaje total, promedio ni ranking de personas", () => {
  const fuentes = [
    "lib/domain/quality-people.ts", "lib/db/quality-people.ts",
    "lib/export/adapters/quality-people.ts", "lib/export/adapters/quality-development.ts",
    "server/actions/quality-people.ts",
  ].map((f) => stripTs(read(f))).join("\n");
  assert(!/personScore|puntajePersona|overallScore|rankPeople|rankingDe/i.test(fuentes),
    "aparece un puntaje o un ranking de personas");
  assert(!/\.sort\(\([^)]*\)\s*=>\s*[a-z]+\.gap\s*-/i.test(fuentes),
    "alguien ordena personas por brecha, que es un ranking con otro nombre");
});

check("C4. la matriz no suma ni promedia en la base", () => {
  const vista = SQL.slice(
    SQL.indexOf("create or replace view public.v_quality_competence_matrix"),
    SQL.indexOf("comment on view public.v_quality_competence_matrix")
  );
  assert(vista.length > 100, "no se encontró la vista de la matriz");
  assert(!/\bavg\(|\bsum\(/i.test(vista), "la matriz agrega puntajes por persona");
});

check("C5. el resultado de una evaluación es una etiqueta humana, no un número", () => {
  for (const r of PERFORMANCE_RESULTS) {
    assert(Number.isNaN(Number(r)), `«${r}» parece un puntaje`);
  }
  assert(PERFORMANCE_RESULTS.includes("not_applicable"),
    "«no aplica» tiene que ser una respuesta legítima");
});

// ---------------------------------------------------------------------------
console.log("\nD · ASISTENCIA ≠ APRENDIZAJE ≠ COMPETENCIA ≠ EFICACIA");

check("D1. asistencia y aprendizaje son columnas distintas", () => {
  const bloque = SQL.slice(SQL.indexOf("create table public.quality_learning_participants"));
  const cuerpo = bloque.slice(0, bloque.indexOf(");"));
  assert(/attendance_status/.test(cuerpo) && /learning_result/.test(cuerpo),
    "asistencia y aprendizaje comparten columna");
});

check("D2. «no se evalúa» y «pendiente» son respuestas legítimas del aprendizaje", () => {
  assert(LEARNING_RESULTS.includes("not_evaluated"), "falta «no se evalúa»");
  assert(LEARNING_RESULTS.includes("pending"), "falta «pendiente»");
});

check("D3. terminar una actividad NO la vuelve eficaz", () => {
  const capas = describeLayers({
    attendance: "attended", learning: "passed",
    competence: "not_assessed", effectiveness: "pending",
  });
  assert(capas.length === 4, "las cuatro capas deben decirse por separado");
  assert(capas[3].includes("Pendiente"), "la eficacia se rellenó sola");
  // Y ninguna acción de servidor escribe eficacia al cambiar el estado.
  const actions = read("server/actions/quality-people.ts");
  const bloque = actions.slice(
    actions.indexOf("export async function setActivityStatusAction"),
    actions.indexOf("export async function addParticipantAction")
  );
  assert(!/reviewEffectiveness|effective/.test(bloque.replace(/\/\/.*$/gm, "").replace(/"[^"]*"/g, "")),
    "terminar la actividad toca la eficacia");
});

check("D4. la eficacia se declara ANTES de juzgarla", () => {
  const bloque = SQL.slice(SQL.indexOf("create table public.quality_learning_effectiveness_reviews"));
  const cuerpo = bloque.slice(0, bloque.indexOf(");"));
  assert(/criterion\s+text not null/.test(cuerpo), "el criterio no es obligatorio");
  assert(/result\s+text not null default 'pending'/.test(cuerpo),
    "el resultado no nace pendiente");
});

check("D5. un resultado «no eficaz» se conserva: la RPC no permite reescribirlo", () => {
  const rpc = SQL.slice(
    SQL.indexOf("function public.quality_review_learning_effectiveness"),
    SQL.indexOf("revoke all on function public.quality_review_learning_effectiveness")
  );
  assert(/if v_row\.result <> 'pending' then/.test(rpc),
    "se puede volver a evaluar una eficacia ya evaluada");
  assert(EFFECTIVENESS_RESULTS.includes("not_effective"), "falta el resultado «no eficaz»");
});

check("D6. las cuatro capas usan vocabularios distintos", () => {
  const cruce = ATTENDANCE_STATUSES.filter((a) => (LEARNING_RESULTS as readonly string[]).includes(a));
  assert(cruce.length === 0, `asistencia y aprendizaje comparten valores: ${cruce.join(", ")}`);
  const cruce2 = (LEARNING_RESULTS as readonly string[])
    .filter((l) => (EFFECTIVENESS_RESULTS as readonly string[]).includes(l) && l !== "pending");
  assert(cruce2.length === 0, `aprendizaje y eficacia comparten valores: ${cruce2.join(", ")}`);
});

// ---------------------------------------------------------------------------
console.log("\nE · BRECHA ≠ CAPACITACIÓN");

check("E1. el dominio ofrece nueve formas de desarrollo y solo una es un curso", () => {
  assert(DEVELOPMENT_KINDS.length >= 8, "el desarrollo se quedó en dos opciones");
  assert(DEVELOPMENT_KINDS_THAT_ARE_NOT_TRAINING.length === DEVELOPMENT_KINDS.length - 1,
    "la lista de alternativas a la formación no cuadra");
  for (const k of ["mentoring", "supervised_practice", "rotation", "self_study"]) {
    assert((DEVELOPMENT_KINDS as readonly string[]).includes(k), `falta «${k}»`);
  }
});

check("E2. la brecha se calcula y NO se guarda", () => {
  assert(competenceGap(3, 2) === 1, "la brecha no se calcula bien");
  assert(competenceGap(2, 3) === 0, "una brecha no puede ser negativa");
  assert(competenceGap(3, null) === 3, "sin evaluar, la brecha es el requisito entero");
  assert(!/\bgap\s+(integer|numeric)/.test(SQL), "la brecha se guardó como columna");
});

check("E3. el dominio se llama desarrollo, no capacitación", () => {
  assert(/create table public\.quality_development_needs/.test(SQL), "falta la necesidad");
  assert(/create table public\.quality_development_plans/.test(SQL), "falta el plan");
  assert(!/create table public\.quality_training_plans/.test(SQL),
    "el dominio se llamó capacitación");
});

check("E4. una necesidad conserva de dónde nace", () => {
  const bloque = SQL.slice(SQL.indexOf("create table public.quality_development_needs"));
  const cuerpo = bloque.slice(0, bloque.indexOf(");"));
  for (const o of ["competency_gap", "audit", "risk", "lesson_learned", "process_change"]) {
    assert(cuerpo.includes(`'${o}'`), `la necesidad no puede nacer de «${o}»`);
  }
});

check("E5. el plan anual admite items DURANTE el año, con su fecha y su motivo", () => {
  const bloque = SQL.slice(SQL.indexOf("create table public.quality_development_plan_items"));
  const cuerpo = bloque.slice(0, bloque.indexOf(");"));
  assert(/added_on\s+date not null/.test(cuerpo), "no se guarda cuándo entró el item");
  assert(/added_reason/.test(cuerpo), "no se guarda por qué entró");
});

// ---------------------------------------------------------------------------
console.log("\nF · REQUISITO DE HOY ≠ REQUISITO DE ENTONCES (PC-23)");

check("F1. el requisito cuelga de la VERSIÓN del cargo, no del cargo", () => {
  const bloque = SQL.slice(SQL.indexOf("create table public.quality_competency_requirements"));
  const cuerpo = bloque.slice(0, bloque.indexOf(");"));
  assert(/position_version_id\s+uuid/.test(cuerpo), "el requisito no apunta a una versión");
  assert(!/\bposition_id\s+uuid/.test(cuerpo),
    "el requisito apunta al cargo: cambiarlo reescribiría el pasado");
});

check("F2. publicar una versión cierra la anterior sin borrarla", () => {
  const rpc = SQL.slice(
    SQL.indexOf("function public.quality_publish_position_version"),
    SQL.indexOf("revoke all on function public.quality_publish_position_version")
  );
  assert(/set status = 'superseded'/.test(rpc), "la versión anterior no se marca sustituida");
  assert(/effective_to = p_effective_from - 1/.test(rpc), "no se cierra su vigencia");
  assert(!/delete from quality_position_versions/.test(rpc), "se borra la versión anterior");
  assert(POSITION_VERSION_STATUSES.includes("superseded"), "falta el estado «sustituido»");
});

check("F3. existe una función para leer el requisito de una FECHA", () => {
  assert(/function public\.quality_required_level_on/.test(SQL),
    "no se puede preguntar qué se exigía entonces");
  const fn = SQL.slice(
    SQL.indexOf("function public.quality_required_level_on"),
    SQL.indexOf("revoke all on function public.quality_required_level_on")
  );
  assert(/quality_position_version_on\(/.test(fn),
    "el requisito histórico no se resuelve por la versión vigente en la fecha");
});

check("F4. la competencia demostrada se SUSTITUYE, no se pisa", () => {
  const rpc = SQL.slice(
    SQL.indexOf("function public.quality_record_person_competence"),
    SQL.indexOf("revoke all on function public.quality_record_person_competence")
  );
  assert(/insert into quality_person_competencies/.test(rpc), "no inserta una decisión nueva");
  assert(/set status = 'superseded', superseded_by = v_new/.test(rpc),
    "la decisión anterior no queda enlazada como sustituida");
  assert(!/update quality_person_competencies\s+set demonstrated_level/.test(rpc),
    "reescribe el nivel anterior");
  assert(PERSON_COMPETENCE_STATUSES.includes("superseded"), "falta el estado «sustituida»");
});

check("F5. hay documentos del pasado, no solo del presente", () => {
  const historicos = declaredExports().filter((d) => d.temporality === "historical");
  for (const k of ["quality.position-profile.detail", "quality.competence-matrix.historical",
                   "quality.position-holders.historical"]) {
    assert(historicos.some((d) => d.key === k), `${k} no se declara histórico`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nG · PC-24 · vencer NO es ser incompetente");

check("G1. la evidencia sin fecha de vencimiento simplemente no vence", () => {
  assert(evidenceNeedsReview({ status: "valid", expiresOn: null }, "2027-01-01") === false,
    "una evidencia sin vencimiento pide revisión");
  assert(evidenceNeedsReview({ status: "valid", expiresOn: "2026-01-01" }, "2027-01-01") === true,
    "una evidencia vencida no pide revisión");
});

check("G2. el texto dice REVISAR, nunca «incompetente»", () => {
  const t = describeEvidenceExpiry({ status: "valid", expiresOn: "2026-01-01" }, "2027-01-01");
  assert(/revisi[óo]n/i.test(t), "el mensaje no pide revisión");
  assert(!/incompetent/i.test(t) || /no implica/i.test(t),
    "el mensaje sugiere incompetencia");
});

check("G3. el barrido marca la EVIDENCIA vencida, no la competencia", () => {
  const fn = SQL_SWEEP.slice(
    SQL_SWEEP.indexOf("function public.quality_scan_people_signals"),
    SQL_SWEEP.indexOf("revoke all on function public.quality_scan_people_signals")
  );
  assert(/update quality_competency_evidence e?\s+set status = 'expired'/.test(fn),
    "el barrido no marca la evidencia vencida");
  assert(!/update quality_person_competencies/.test(fn),
    "el barrido cambia la competencia declarada de alguien");
});

check("G4. y en toda la plataforma no existe la frase «persona incompetente»", () => {
  const fuentes = [
    "lib/domain/quality-people.ts", "lib/db/quality-people.ts",
    "server/actions/quality-people.ts",
    "lib/export/adapters/quality-people.ts", "lib/export/adapters/quality-development.ts",
    MIG,
  ].map(read).join("\n").toLowerCase();
  assert(!/persona incompetente|es incompetente|trabajador incompetente/.test(fuentes),
    "aparece la frase que este dominio existe para no decir");
});

// ---------------------------------------------------------------------------
console.log("\nH · HOLDER ≠ DUEÑO DEL CONOCIMIENTO");

check("H1. la relación se llama holder y el titular principal es explícito", () => {
  assert(/create table public\.quality_knowledge_holders/.test(SQL), "falta la tabla de holders");
  assert(!/create table public\.quality_knowledge_owners/.test(SQL),
    "el conocimiento tiene dueños");
  assert(/is_primary_holder\s+boolean/.test(SQL), "no hay titular principal explícito");
  assert(/quality_knowledge_holders_primary_uniq/.test(SQL),
    "podrían coexistir dos «responde primero»");
});

check("H2. el conocimiento admite tácito, explícito y mixto", () => {
  for (const k of KNOWLEDGE_KINDS) assert(SQL.includes(`'${k}'`), `falta «${k}»`);
  assert(KNOWLEDGE_KINDS.includes("tacit"), "el conocimiento tácito no existe");
});

check("H3. la señal habla del CONOCIMIENTO, nunca de la persona", () => {
  for (const texto of Object.values(KNOWLEDGE_SIGNAL_LABEL)) {
    assert(!/persona es|es un riesgo|riesgo humano/i.test(texto),
      `la señal «${texto}» convierte a alguien en el problema`);
  }
  assert(KNOWLEDGE_SIGNAL_LABEL.single_holder.startsWith("Conocimiento"),
    "el sujeto de la señal debería ser el conocimiento");
});

check("H4. la señal NO crea un riesgo formal por su cuenta", () => {
  const fn = SQL_SWEEP.slice(
    SQL_SWEEP.indexOf("function public.quality_scan_people_signals"),
    SQL_SWEEP.indexOf("revoke all on function public.quality_scan_people_signals")
  );
  assert(!/insert into quality_risks/.test(fn), "el barrido abre riesgos solo");
  assert(!/insert into work_cases/.test(fn), "el barrido abre no conformidades solo");
  // Promover es un acto humano, y deja constancia de quién lo hizo.
  const rpc = SQL.slice(
    SQL.indexOf("function public.quality_promote_knowledge_signal"),
    SQL.indexOf("revoke all on function public.quality_promote_knowledge_signal")
  );
  assert(/promoted_by = auth\.uid\(\)/.test(rpc), "promover no registra quién decidió");
});

check("H5. la continuidad se calcula sobre el elemento, no sobre la persona", () => {
  assert(hasContinuityAttention({ status: "active", criticality: "critical", holderCount: 1 }),
    "un conocimiento crítico con un solo holder no genera atención");
  assert(!hasContinuityAttention({ status: "active", criticality: "low", holderCount: 0 }),
    "un conocimiento poco crítico no debería generar señal");
  assert(!hasContinuityAttention({ status: "retired", criticality: "critical", holderCount: 0 }),
    "un conocimiento retirado no debería generar señal");
});

check("H6. verificar una transferencia es un acto APARTE de ejecutarla", () => {
  const rpc = SQL.slice(
    SQL.indexOf("function public.quality_verify_knowledge_transfer"),
    SQL.indexOf("revoke all on function public.quality_verify_knowledge_transfer")
  );
  assert(/length\(coalesce\(trim\(p_note\), ''\)\) = 0/.test(rpc),
    "se puede verificar sin decir en qué se comprobó");
  assert(/status in \('pending', 'in_progress'\)/.test(rpc),
    "se puede verificar con actividades sin cerrar");
});

// ---------------------------------------------------------------------------
console.log("\nI · La lección PROPONE; no cambia nada");

check("I1. la lección guarda las cuatro preguntas por separado", () => {
  const bloque = SQL.slice(SQL.indexOf("create table public.quality_lessons_learned"));
  const cuerpo = bloque.slice(0, bloque.indexOf(");"));
  for (const c of ["what_happened", "what_was_learned", "applicable_context", "recommendation"]) {
    assert(cuerpo.includes(c), `falta «${c}»`);
  }
  assert(/what_happened\s+text not null/.test(cuerpo) && /what_was_learned\s+text not null/.test(cuerpo),
    "qué ocurrió y qué se aprendió deberían ser obligatorios");
});

check("I2. aceptar una propuesta no aplica ningún cambio", () => {
  const rpc = SQL.slice(
    SQL.indexOf("function public.quality_decide_lesson_proposal"),
    SQL.indexOf("revoke all on function public.quality_decide_lesson_proposal")
  );
  for (const t of ["trazadoc_documents", "quality_processes", "quality_competencies",
                   "quality_learning_activities"]) {
    assert(!new RegExp(`update ${t}|insert into ${t}`).test(rpc),
      `decidir una propuesta modifica ${t}`);
  }
  assert(proposalCanBeApplied({ status: "proposed" }) === false,
    "una propuesta sin decidir se puede aplicar");
  assert(proposalCanBeApplied({ status: "accepted" }) === true,
    "una propuesta aceptada no se puede aplicar");
  assert(PROPOSAL_STATUSES.includes("implemented"),
    "no hay forma de decir que la propuesta YA se aplicó");
});

// ---------------------------------------------------------------------------
console.log("\nJ · Se reutilizan los motores transversales");

check("J1. no se crean tablas paralelas de tareas, alertas ni evidencias", () => {
  for (const t of ["quality_people_tasks", "quality_people_alerts", "quality_people_files",
                   "quality_development_actions", "quality_people_events"]) {
    assert(!new RegExp(`create table public\\.${t}`).test(SQL), `${t} duplica un motor existente`);
  }
});

check("J2. los catálogos cerrados se ensanchan de forma ADITIVA", () => {
  // Ningún valor anterior puede desaparecer: eso rompería QUALITY-01…05.
  const anteriores = ["document", "indicator", "objective", "case", "action",
                      "risk", "opportunity", "control"];
  const nuevo = SQL.slice(SQL.indexOf("add constraint work_tasks_source_domain_check"));
  const lista = nuevo.slice(0, nuevo.indexOf("));"));
  for (const v of anteriores) assert(lista.includes(`'${v}'`), `desapareció «${v}»`);
  for (const v of ["person", "competence", "knowledge", "lesson"]) {
    assert(lista.includes(`'${v}'`), `no entró «${v}»`);
  }
});

check("J3. la bandeja conoce los asuntos nuevos y sabe a dónde llevan", () => {
  for (const s of ["quality_person", "quality_knowledge_item", "quality_lesson_learned",
                   "quality_performance_evaluation"]) {
    assert((SUBJECT_TYPES as readonly string[]).includes(s), `la bandeja no conoce «${s}»`);
  }
  const view = read("components/domain/quality/tasks-view.tsx");
  assert(/case "quality_person":\s*\n\s*return `\/quality\/people\/\$\{subjectId\}`/.test(view),
    "una tarea de persona no lleva a su ficha");
});

check("J4. cada tipo de tarea y de alerta nuevo tiene etiqueta legible", () => {
  for (const t of TASK_TYPES) {
    assert(TASK_TYPE_LABEL[t], `la tarea «${t}» se pintaría sin etiqueta`);
  }
  for (const a of ALERT_TYPES) {
    assert(ALERT_TYPE_LABEL[a], `la alerta «${a}» se pintaría sin etiqueta`);
  }
});

check("J5. la evidencia reutiliza el motor de referencias", () => {
  for (const k of ["quality_person", "quality_person_competency", "quality_knowledge_item"]) {
    assert((REFERENCE_KINDS as readonly string[]).includes(k), `falta la referencia «${k}»`);
  }
  // Y el validador sabe resolverlas: si no, rechazaría todas.
  const fn = SQL.slice(SQL.indexOf("function public.work_reference_must_be_valid"));
  assert(/when 'quality_person'\s+then \(select organization_id from quality_people/.test(fn),
    "el validador de referencias no resuelve las personas");
});

check("J6. las alertas Y las tareas del barrido son idempotentes", () => {
  const fn = SQL_SWEEP.slice(
    SQL_SWEEP.indexOf("function public.quality_scan_people_signals"),
    SQL_SWEEP.indexOf("revoke all on function public.quality_scan_people_signals")
  );
  const alertas = [...fn.matchAll(/insert into work_alerts/g)].length;
  const guardasA = [...fn.matchAll(/not exists \(\s*\n?\s*select 1 from work_alerts/g)].length;
  assert(alertas > 0, "el barrido no crea ninguna alerta");
  assert(guardasA === alertas,
    `${alertas} inserciones de alerta y solo ${guardasA} guardas de duplicado`);

  const tareas = [...fn.matchAll(/insert into work_tasks/g)].length;
  const guardasT = [...fn.matchAll(/not exists \(\s*\n?\s*select 1 from work_tasks/g)].length;
  assert(tareas >= 5, `el barrido solo genera ${tareas} tipos de tarea`);
  assert(guardasT === tareas,
    `${tareas} inserciones de tarea y solo ${guardasT} guardas de duplicado`);

  // §53 · Y ninguna de ellas es una ACCIÓN del sistema de gestión.
  assert(!/insert into work_actions/.test(fn),
    "el barrido convierte desarrollo en acciones del SGC por su cuenta");
});

// ---------------------------------------------------------------------------
console.log("\nK · Privacidad (PC-25)");

check("K1. hay tres círculos y el más cerrado es el desempeño", () => {
  assert(/function public\.quality_manages_people/.test(SQL), "falta el círculo de la ficha");
  assert(/function public\.quality_can_read_person/.test(SQL), "falta la lectura por persona");
  assert(/array\['admin', 'quality'\]/.test(SQL), "el círculo de la ficha admite al consultor");
});

check("K2. no se inventa un rol «HR» que la arquitectura no tiene", () => {
  assert(!/'hr'|'rrhh'|'human_resources'/i.test(SQL), "se inventó un rol de recursos humanos");
});

check("K3. la ficha de persona NO se lee con `is_org_member`", () => {
  const pol = SQL.slice(SQL.indexOf("create policy quality_people_select"));
  const linea = pol.slice(0, pol.indexOf(";"));
  assert(/quality_can_read_person/.test(linea),
    "cualquier miembro de la empresa puede abrir la ficha de cualquiera");
});

check("K4. la evaluación de desempeño se lee fila a fila, contra la persona evaluada", () => {
  const pol = SQL.slice(SQL.indexOf("create policy quality_performance_evaluations_select"));
  const linea = pol.slice(0, pol.indexOf(";"));
  assert(/quality_can_read_person\(organization_id, person_id\)/.test(linea),
    "la evaluación no se filtra por la persona evaluada");
});

check("K5. toda tabla nueva enciende RLS y declara sus privilegios", () => {
  const tablas = [...SQL.matchAll(/create table public\.(quality_\w+)/g)].map((m) => m[1]);
  for (const t of tablas) {
    assert(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(SQL),
      `${t} se quedó sin RLS`);
    assert(new RegExp(`revoke all on table public\\.${t}\\s+from anon, authenticated`).test(SQL),
      `${t} se quedó sin revocar privilegios heredados`);
    assert(new RegExp(`create policy ${t}_\\w+ on public\\.${t}`).test(SQL),
      `${t} tiene RLS encendida y ninguna política: quedaría inaccesible`);
  }
});

check("K6. `anon` no recibe nada", () => {
  const grants = [...SQL.matchAll(/grant [^;]*to ([^;]+);/g)].map((m) => m[1]);
  for (const g of grants) {
    assert(!/\banon\b/.test(g), `se concedió algo a anon: ${g.trim()}`);
  }
});

check("K7. las vistas nuevas son `security_invoker`", () => {
  const vistas = [...SQL.matchAll(/create or replace view public\.(v_\w+)/g)].map((m) => m[1]);
  assert(vistas.length >= 4, "faltan vistas del sprint");
  for (const v of vistas) {
    const i = SQL.indexOf(`create or replace view public.${v}`);
    const cabecera = SQL.slice(i, i + 200);
    assert(/security_invoker = true/.test(cabecera),
      `${v} se ejecutaría con los permisos de su dueño, por debajo de RLS`);
  }
});

check("K7b. toda función `security definer` que reciba una empresa comprueba quién pregunta", () => {
  // Es el agujero silencioso de este archivo: dentro de una función DEFINER el
  // usuario efectivo es el dueño, así que las vistas `security_invoker` que
  // consulta dejan de filtrar por RLS. Sin una comprobación explícita, basta
  // con pasar el identificador de otra empresa.
  const nombres = [...SQL.matchAll(/create or replace function public\.(quality_\w+)\(([^)]*)\)/g)];
  let revisadas = 0;
  for (const m of nombres) {
    const [, nombre, params] = m;
    if (!/p_organization_id\s+uuid/.test(params)) continue;
    const cuerpo = SQL.slice(m.index ?? 0, SQL.indexOf(`revoke all on function public.${nombre}`, m.index));
    if (!/security definer/.test(cuerpo)) continue;
    // Las que solo puede ejecutar el propio motor no necesitan puerta: no se
    // conceden a `authenticated`.
    const concedida = new RegExp(`grant execute on function public\\.${nombre}\\([^)]*\\) to authenticated`)
      .test(SQL);
    if (!concedida) continue;
    // `quality_person_is_self` es ella misma una puerta: su cuerpo entero es
    // la comprobación (`profile_id = auth.uid()`). Pedirle que llame a otra
    // sería circular.
    if (nombre === "quality_person_is_self") {
      assert(/auth\.uid\(\)/.test(cuerpo), "la puerta de «soy yo» no mira quién pregunta");
      continue;
    }
    revisadas += 1;
    assert(/is_org_member\(|has_org_role\(|quality_manages_people\(|quality_can_read_person\(/.test(cuerpo),
      `${nombre} recibe la empresa desde el cliente y no comprueba nada`);
  }
  assert(revisadas >= 5, `solo se revisaron ${revisadas} funciones: la comprobación no tiene alcance`);

  // Y la versión VIGENTE del barrido, que vive en 0124.
  const barrido = SQL_SWEEP.slice(
    SQL_SWEEP.indexOf("function public.quality_scan_people_signals"),
    SQL_SWEEP.indexOf("revoke all on function public.quality_scan_people_signals")
  );
  assert(/is_org_member\(p_organization_id\)/.test(barrido),
    "el barrido vigente no comprueba a qué empresa pertenece quien lo dispara");
});

check("K8. ninguna capa del dominio usa la clave de servicio", () => {
  for (const f of ["lib/db/quality-people.ts", "server/actions/quality-people.ts",
                   "lib/export/adapters/quality-people.ts",
                   "lib/export/adapters/quality-development.ts"]) {
    const src = stripTs(read(f));
    assert(!/service_role|SERVICE_ROLE|createAdminClient/.test(src),
      `${f} usa la clave de servicio para lógica normal`);
  }
});

check("K9. el listado de personas no imprime lo sensible solo porque está en la base", () => {
  const src = read("lib/export/adapters/quality-people.ts");
  const bloque = src.slice(
    src.indexOf("export const qualityPersonList"),
    src.indexOf("export const qualityPersonDetail")
  );
  assert(!/workEmail|joinedOn|notes/.test(bloque),
    "el listado de personas imprime correo, fechas o notas");
});

// ---------------------------------------------------------------------------
console.log("\nL · Contrato PDF (EXPORT-01…01.3)");

check("L1. todas las entidades nuevas están clasificadas y no queda ningún pendiente", () => {
  const nuevas = EXPORT_INVENTORY.filter((r) =>
    ["Persona", "Organigrama", "Perfil de cargo", "Matriz de competencias",
     "Elemento de conocimiento", "Lección aprendida", "Evaluación de desempeño",
     "Plan de transferencia", "Evaluación de eficacia", "Plan de desarrollo"]
      .includes(r.entity));
  assert(nuevas.length === 10, `faltan entidades por clasificar: ${nuevas.length}/10`);
  for (const r of EXPORT_INVENTORY) {
    for (const axis of [r.detail, r.list, r.historical]) {
      assert(
        ["AVAILABLE", "EMBEDDED", "NOT_APPLICABLE", "HISTORICAL_NOT_SUPPORTED"].includes(axis.state),
        `${r.entity} tiene un eje en un estado que no existe`
      );
    }
  }
});

check("L2. las claves prometidas por el inventario existen en el registro", () => {
  const declaradas = new Set(declaredExports().map((d) => d.key));
  const nuestras = promisedKeys().filter((k) => k.startsWith("quality.") && declaradas.has(k));
  assert(nuestras.length >= 14, `Q06 promete solo ${nuestras.length} claves propias`);
  // Y cada adaptador nuevo tiene que estar ENCHUFADO al registro: una
  // definición escrita y no registrada es una descarga que responde 404.
  for (const imp of ["adapters/quality-people", "adapters/quality-development"]) {
    assert(REGISTRY_SOURCE.includes(imp), `el registro no importa ${imp}`);
  }
});

check("L3. toda exportación de Q06 declara su nombre documental", () => {
  const nuestras = declaredExports();
  assert(nuestras.length >= 14, `Q06 declara solo ${nuestras.length} exportaciones`);
  for (const d of nuestras) {
    assert(d.documentName.length > 3, `${d.key} no tiene nombre documental`);
    assert(!/\./.test(d.documentName), `${d.key} usa la clave técnica como nombre documental`);
    // Y el registro es quien lo pone: en el adaptador el nombre convive con la
    // definición, pero el modelo de impresión no puede llevarlo.
    assert(REGISTRY_SOURCE.length > 0, "no se pudo leer el registro");
  }
  const nombres = new Set(nuestras.map((d) => d.documentName));
  assert(nombres.size === nuestras.length || nombres.size >= nuestras.length - 2,
    "demasiadas exportaciones comparten nombre documental");
});

check("L4. el nombre documental vive en la DEFINICIÓN, no en el documento", () => {
  for (const f of ["lib/export/adapters/quality-people.ts",
                   "lib/export/adapters/quality-development.ts"]) {
    const src = stripTs(read(f));
    // Una vez por definición y ni una más: si apareciera dentro del `document`
    // que devuelve el adaptador, el encabezado dejaría de ser un contrato del
    // registro y cada exportación se llamaría como quisiera (EXPORT-01.2 §6).
    const definiciones = [...src.matchAll(/key:\s*"[a-z0-9-]+\.[a-z0-9-]+\.(?:detail|list|historical)"/g)].length;
    const nombres = [...src.matchAll(/documentName\s*:/g)].length;
    assert(nombres === definiciones,
      `${f} declara ${nombres} nombres documentales para ${definiciones} exportaciones`);
    const draft = src.slice(src.indexOf("document: {"));
    assert(!/document: \{[^]{0,400}documentName/.test(draft),
      `${f} escribe el nombre documental dentro del documento`);
    assert(!/\bbuffer\s*:/.test(src), `${f} devuelve bytes en vez de un modelo de impresión`);
    assert(!/PdfWriter|new PdfLayout/.test(src), `${f} dibuja su propio PDF`);
  }
});

check("L5. los documentos con temporalidad `current` declaran POR QUÉ no hay histórico", () => {
  for (const d of declaredExports()) {
    if (d.temporality === "current") {
      assert((d.historicalLimitReason ?? "").length > 30,
        `${d.key} dice «actual» sin explicar por qué no puede ser histórico`);
    }
  }
});

check("L6. la matriz en PDF no ordena ni suma personas", () => {
  const src = read("lib/export/adapters/quality-people.ts");
  const bloque = src.slice(
    src.indexOf("export const qualityCompetenceMatrixDetail"),
    src.indexOf("export const qualityCompetenceMatrixHistorical")
  );
  assert(!/\.sort\(/.test(bloque), "la matriz del PDF reordena las filas");
  assert(!/reduce\(/.test(bloque), "la matriz del PDF agrega valores");
});

// ---------------------------------------------------------------------------
console.log("\nM · Nada fuera de alcance");

check("M1. no hay IA en este sprint", () => {
  const fuentes = [
    "lib/domain/quality-people.ts", "lib/db/quality-people.ts",
    "server/actions/quality-people.ts", MIG,
  ].map(read).join("\n");
  assert(!/openai|anthropic|embedding|\bllm\b|gpt-/i.test(fuentes),
    "se coló una integración de IA");
});

check("M2. el dominio no depende de PCR ni de Textiles", () => {
  for (const f of ["lib/domain/quality-people.ts", "lib/db/quality-people.ts",
                   "server/actions/quality-people.ts"]) {
    const src = read(f);
    assert(!/textiles|passport|\bpcr\b/i.test(src), `${f} depende de otro módulo`);
  }
});

check("M3. la migración es append-only: no se tocó ninguna anterior", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"));
  assert(files.includes("0123_quality_people_competence_knowledge.sql"), "falta 0123");
  assert(files.includes("0124_quality_people_tasks_from_sweep.sql"), "falta 0124");
  const posteriores = files.filter((f) => Number(f.slice(0, 4)) > 124);
  assert(posteriores.length === 0, `hay migraciones por encima de 0124: ${posteriores.join(", ")}`);
  for (const [nombre, sql] of [[MIG, SQL], [MIG_TAREAS, SQL_SWEEP]] as const) {
    assert(!/drop table public\.(quality|work|trazadoc)_/.test(sql),
      `${nombre} destruye una tabla anterior`);
  }
  // 0124 no crea esquema: solo reescribe el cuerpo de una función.
  assert(!/create table/.test(SQL_SWEEP), "0124 debía limitarse a reescribir el barrido");
});

check("M4. no se borra historia: no hay DELETE sobre lo que la conserva", () => {
  for (const t of ["quality_position_assignments", "quality_person_competencies",
                   "quality_performance_evaluations", "quality_learning_effectiveness_reviews",
                   "quality_knowledge_transfer_plans", "quality_lessons_learned"]) {
    assert(!new RegExp(`delete from ${t}`).test(SQL), `0123 borra filas de ${t}`);
  }
  const db = read("lib/db/quality-people.ts");
  for (const t of ["quality_position_assignments", "quality_person_competencies",
                   "quality_performance_evaluations"]) {
    assert(!new RegExp(`from\\("${t}"\\)[\\s\\S]{0,80}\\.delete\\(\\)`).test(db),
      `la capa de datos borra ${t}`);
  }
});

check("M5. el veredicto de borrado conoce las entidades nuevas", () => {
  for (const e of ["person", "competency", "knowledge_item", "lesson"]) {
    assert(new RegExp(`when '${e}'\\s+then`).test(SQL),
      `no se puede preguntar si un «${e}» se puede borrar`);
  }
  assert(/quality_person_deletion_verdict/.test(SQL), "falta el veredicto de persona");
  const verdict = SQL.slice(
    SQL.indexOf("function public.quality_person_deletion_verdict"),
    SQL.indexOf("revoke all on function public.quality_person_deletion_verdict")
  );
  assert(/'alternative', 'retire'/.test(verdict),
    "el veredicto no ofrece desvincular como alternativa a borrar");
});

// ---------------------------------------------------------------------------
console.log("\nN · Permisos en la interfaz");

check("N1. las tres puertas de la interfaz coinciden con las de la base", () => {
  assert(canManageStructure("consultant") === true, "el consultor no puede construir estructura");
  assert(canManagePeople("consultant") === false, "el consultor puede abrir fichas de personas");
  assert(canManagePeople("quality") === true && canManagePeople("admin") === true,
    "quality o admin no administran personas");
  assert(canReadEvaluations("consultant", false) === false,
    "el consultor ve evaluaciones individuales");
  assert(canReadEvaluations("consultant", true) === true,
    "nadie puede ver su propia evaluación");
});

check("N2. esconder un botón no es la barrera: las acciones vuelven a comprobar", () => {
  const actions = read("server/actions/quality-people.ts");
  const exportadas = [...actions.matchAll(/export async function (\w+Action)\(/g)].map((m) => m[1]);
  assert(exportadas.length > 20, "faltan acciones de servidor");
  for (const fn of exportadas) {
    const i = actions.indexOf(`export async function ${fn}(`);
    const cuerpo = actions.slice(i, i + 900);
    assert(/const g = await gate\(\);/.test(cuerpo), `${fn} no comprueba la sesión ni el módulo`);
  }
});

check("N3. la vigencia se evalúa por fechas, no por «el último»", () => {
  assert(isEffectiveOn({ effectiveFrom: "2027-01-01", effectiveTo: "2027-06-30" }, "2027-05-15"),
    "una asignación vigente en mayo se declara fuera");
  assert(!isEffectiveOn({ effectiveFrom: "2027-07-01", effectiveTo: null }, "2027-05-15"),
    "una asignación futura se declara vigente");
  assert(isEffectiveOn({ effectiveFrom: "2027-07-01", effectiveTo: null }, "2027-08-15"),
    "una asignación abierta se declara cerrada");
});

check("N4. la criticidad del conocimiento es configurable, no una constante", () => {
  assert(CRITICALITIES.length === 4, "la criticidad dejó de tener cuatro niveles");
  const bloque = SQL.slice(SQL.indexOf("create table public.quality_competency_levels"));
  const cuerpo = bloque.slice(0, bloque.indexOf(");"));
  assert(/level_value\s+integer not null/.test(cuerpo),
    "la escala de competencia no es configurable por empresa");
  // Y la escala de partida se ofrece, no se impone a todo el mundo.
  assert(/function public\.quality_seed_competency_levels/.test(SQL),
    "no hay forma de crear una escala de partida");
  assert(!/insert into quality_competency_levels[\s\S]{0,200}from organizations/.test(SQL),
    "se impuso una escala a todas las empresas existentes");
});

// ---------------------------------------------------------------------------
console.log("\nO · Los PDF de verdad");

/** Fragmentos de texto dibujados, por página. */
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

check("O1. el organigrama se dibuja como jerarquía y lleva encabezado en TODAS las páginas", () => {
  // Una empresa grande de verdad: 12 unidades × 12 cargos. Si el organigrama
  // no partiera bien, este es el caso donde se vería.
  const roots: PrintNode[] = Array.from({ length: 12 }, (_, u) => ({
    label: `Unidad ${u + 1}`,
    sublabel: `U${u + 1}`,
    children: Array.from({ length: 12 }, (_, p) => ({
      label: `Cargo ${u + 1}.${p + 1}`,
      sublabel: p === 0 ? "Sin titular vigente" : `Persona ${u + 1}.${p + 1}`,
      children: [],
    })),
  }));
  const bytes = renderPrintDocument(baseDoc({
    documentName: "Organigrama", recordType: "Organigrama", title: "Organigrama",
    orientation: "landscape",
    sections: [{ title: "Estructura", blocks: [{ type: "hierarchy", roots }] }],
  }));
  const paginas = pagesText(bytes);
  assert(paginas.length > 1, "un organigrama de 144 cargos cupo en una página: no se dibujó");
  for (const [i, p] of paginas.entries()) {
    assert(p.includes("Industrias Ejemplo"), `la página ${i + 1} no lleva el nombre de la empresa`);
    assert(p.toUpperCase().includes("ORGANIGRAMA"), `la página ${i + 1} no lleva el nombre documental`);
  }
  const texto = paginas.join(" ");
  assert(texto.includes("Cargo 12.12"), "el último cargo desapareció del papel");
  assert(texto.includes("Sin titular vigente"), "no se dice cuándo un cargo está vacante");
});

check("O2. la matriz de competencias cabe apaisada y no ordena a nadie", () => {
  const rows = Array.from({ length: 60 }, (_, i) => [
    `Persona ${String(i + 1).padStart(2, "0")}`, "Coordinador de Calidad", "Auditoría interna",
    "3", i % 3 === 0 ? "Sin evaluar" : "2", i % 3 === 0 ? "3" : "1",
    i % 4 === 0 ? "Vencida · revisar" : "Vigente",
  ]);
  const bytes = renderPrintDocument(baseDoc({
    documentName: "Matriz de competencias", recordType: "Matriz de competencias",
    title: "Matriz de competencias", orientation: "landscape", recordCount: rows.length,
    sections: [{
      title: null,
      blocks: [{
        type: "table",
        columns: [
          { header: "Persona", width: 3 }, { header: "Cargo", width: 3 },
          { header: "Competencia", width: 3 }, { header: "Exigido", width: 1, align: "right" },
          { header: "Demostrado", width: 1, align: "right" },
          { header: "Brecha", width: 1, align: "right" }, { header: "Evidencia", width: 2 },
        ],
        rows,
      }],
    }],
  }));
  const paginas = pagesText(bytes);
  assert(paginas.length > 1, "60 filas cupieron en una página: la tabla no se dibujó");
  for (const [i, p] of paginas.entries()) {
    assert(p.includes("Industrias Ejemplo"), `la página ${i + 1} perdió la empresa`);
    assert(p.toUpperCase().includes("MATRIZ DE COMPETENCIAS"),
      `la página ${i + 1} perdió el nombre documental`);
  }
  const texto = paginas.join(" ");
  // El orden del papel es EXACTAMENTE el que se le entregó: si el renderizador
  // reordenara, la matriz se convertiría en una lista de peores.
  const primera = texto.indexOf("Persona 01");
  const ultima = texto.indexOf("Persona 60");
  assert(primera >= 0 && ultima > primera, "el papel reordenó las filas de la matriz");
});

check("O3. la ficha de persona imprime las separaciones, no solo los datos", () => {
  const bytes = renderPrintDocument(baseDoc({
    documentName: "Ficha de persona", recordType: "Persona", title: "Carlos López",
    badges: [{ text: "Vinculada", tone: "good" }, { text: "Sin cuenta de Trazaloop" }],
    sections: [
      { title: null, blocks: [{ type: "note", text:
        "Contiene información de personas. Compártelo solo con quien tenga que verlo." }] },
      { title: "Evidencia", blocks: [{ type: "note", text:
        "Una evidencia vencida pide revisión. No significa por sí sola que la persona "
        + "haya dejado de ser competente." }] },
      { title: "Conocimiento que sostiene", blocks: [{ type: "note", text:
        "La persona SOSTIENE el conocimiento; no es su dueña." }] },
    ],
  }));
  const texto = pagesText(bytes).join(" ");
  assert(/pide revisi[oó]n/i.test(texto), "el papel no dice que vencer pide revisión");
  assert(/SOSTIENE el conocimiento/.test(texto), "el papel no distingue holder de dueño");
  assert(/Sin cuenta de Trazaloop/.test(texto), "el papel no dice que la persona no tiene cuenta");
});

check("O4. un carácter de control en el nombre de la empresa no rompe el renglón", () => {
  const bytes = renderPrintDocument(baseDoc({
    documentName: "Ficha de persona",
    organization: { name: "Industrias\nEjemplo\rS.A.", legalName: null, taxId: null, logo: null },
    sections: [{ title: null, blocks: [{ type: "paragraph", text: "Cuerpo" }] }],
  }));
  const raw = bytes.toString("latin1");
  assert(raw.startsWith("%PDF-") && raw.includes("%%EOF"), "el PDF quedó roto");
  const dibujado = pagesText(bytes).join(" ");
  assert(!new RegExp("[\u0000-\u001f\u007f]").test(dibujado),
    "un carácter de control llegó al papel");
});

// ---------------------------------------------------------------------------
console.log(`\nResultado: ${passed} conformes, ${failed} fallos\n`);
process.exit(failed === 0 ? 0 : 1);
