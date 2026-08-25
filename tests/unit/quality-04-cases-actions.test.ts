/**
 * Trazaloop · QUALITY-04 · Puras y estáticas.
 *
 * Comprueban que las separaciones del dominio existan en el código y no solo
 * en la prosa, y que la migración diga lo que dice el baseline.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACTION_KINDS, ACTION_KIND_HELP, ACTION_KIND_LABEL,
  CASE_STATUSES, CASE_STATUS_LABEL, CASE_THRESHOLD, CASE_TYPES, CASE_TYPE_LABEL,
  CLASSIFICATIONS, CLASSIFICATION_HELP, CLASSIFICATION_LABEL, DECIDABLE_CLASSIFICATIONS,
  EFFECTIVENESS, EFFECTIVENESS_LABEL, REFERENCE_KINDS, REFERENCE_KIND_LABEL,
  actionStanding, canGovernCases, canManageCases, canReopenCase,
  describeDecision, describeDue, isOverdue, parseClosure, referenceHref,
} from "../../lib/domain/work-cases";
import { TASK_TYPES, ALERT_TYPES, SUBJECT_TYPES, TASK_TYPE_LABEL, ALERT_TYPE_LABEL } from "../../lib/domain/work-inbox";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
const MIG = "supabase/migrations/0121_work_cases_and_actions_engine.sql";

let passed = 0, failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.log(`  ✘ ${name}: ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

console.log("\nQUALITY-04 · puras y estáticas\n");
console.log("A · Las separaciones del dominio");

check("A1. clasificación y estado son vocabularios DISTINTOS", () => {
  // Un caso abierto puede no ser no conformidad; una no conformidad puede estar
  // cerrada. Compartir valores los haría indistinguibles en pantalla.
  const overlap = (CLASSIFICATIONS as readonly string[])
    .filter((c) => (CASE_STATUSES as readonly string[]).includes(c));
  assert(overlap.length === 0, `comparten valores: ${overlap.join(", ")}`);
  for (const c of CLASSIFICATIONS) assert(CLASSIFICATION_LABEL[c]?.length > 0, `${c} sin etiqueta`);
  for (const s of CASE_STATUSES) assert(CASE_STATUS_LABEL[s]?.length > 0, `${s} sin etiqueta`);
});

check("A2. «sin evaluar» NO se puede elegir: se deja de ser", () => {
  assert(!DECIDABLE_CLASSIFICATIONS.includes("pending"),
    "«sin evaluar» aparece como una opción que alguien podría elegir");
  assert(DECIDABLE_CLASSIFICATIONS.length === CLASSIFICATIONS.length - 1,
    "faltan clasificaciones decidibles");
  assert(/nadie ha decidido/i.test(CLASSIFICATION_HELP.pending),
    "«sin evaluar» debe explicar que la decisión todavía no existe");
});

check("A3. los cuatro tipos de acción se explican por lo que HACEN", () => {
  for (const k of ACTION_KINDS) {
    assert(ACTION_KIND_LABEL[k]?.length > 0, `${k} sin etiqueta`);
    assert(ACTION_KIND_HELP[k]?.length > 10, `${k} sin explicación`);
  }
  // Corrección y acción correctiva no pueden explicarse igual: confundirlas es
  // el error clásico del dominio.
  assert(ACTION_KIND_HELP.correction !== ACTION_KIND_HELP.corrective,
    "corrección y acción correctiva comparten explicación");
  assert(/no impide/i.test(ACTION_KIND_HELP.correction), "la corrección debe decir qué NO hace");
  assert(/causa/i.test(ACTION_KIND_HELP.corrective), "la acción correctiva debe hablar de la causa");
  assert(/ahora/i.test(ACTION_KIND_HELP.containment), "la contención debe hablar del ahora");
});

check("A4. COMPLETADA no es EFICAZ (AC-13)", () => {
  const pending = actionStanding({ status: "completed", effectiveness: "pending" });
  assert(pending.done === false, "una acción con eficacia pendiente no puede darse por terminada");
  assert(/verificar|sirvió/i.test(pending.label), `la etiqueta no lo dice: ${pending.label}`);

  const bad = actionStanding({ status: "completed", effectiveness: "not_effective" });
  assert(bad.done === false, "una acción NO eficaz no puede darse por terminada");
  assert(bad.tone === "bad", "una acción no eficaz no puede pintarse como buena");
  assert(/NO eficaz/i.test(bad.label), `la etiqueta no lo dice: ${bad.label}`);

  const good = actionStanding({ status: "completed", effectiveness: "effective" });
  assert(good.done === true && good.tone === "good", "una acción eficaz sí terminó");

  const plain = actionStanding({ status: "completed", effectiveness: "not_required" });
  assert(plain.done === true, "una acción que no exige verificación termina al completarse");
});

check("A5. cada resultado de eficacia tiene nombre propio", () => {
  for (const e of EFFECTIVENESS) assert(EFFECTIVENESS_LABEL[e]?.length > 0, `${e} sin etiqueta`);
  assert(new Set(Object.values(EFFECTIVENESS_LABEL)).size === EFFECTIVENESS.length,
    "dos resultados de eficacia comparten etiqueta");
});

check("A6. el vencimiento se cuenta con el signo correcto", () => {
  assert(describeDue("2026-08-30", "2026-08-25") === "Vence en 5 días", "adelanto mal contado");
  assert(describeDue("2026-08-25", "2026-08-25") === "Vence hoy", "hoy mal contado");
  assert(describeDue("2026-08-20", "2026-08-25") === "Venció hace 5 días", "atraso mal contado");
  assert(describeDue(null, "2026-08-25") === null, "sin fecha no hay nada que decir");
  assert(describeDue("2026-08-24", "2026-08-25") === "Venció hace 1 día", "singular mal escrito");
});

check("A7. solo está vencido lo que aún NO se hizo", () => {
  assert(isOverdue({ status: "planned", dueOn: "2026-08-20" }, "2026-08-25"), "no detecta el atraso");
  assert(!isOverdue({ status: "completed", dueOn: "2026-08-20" }, "2026-08-25"),
    "una acción completada tarde no sigue «vencida»");
  assert(!isOverdue({ status: "cancelled", dueOn: "2026-08-20" }, "2026-08-25"),
    "una acción cancelada no está vencida");
  assert(!isOverdue({ status: "planned", dueOn: null }, "2026-08-25"), "sin fecha no hay vencimiento");
});

console.log("\nB · Permisos, historial y enlaces");

check("B1. registrar es trabajo; clasificar y cerrar es gobierno", () => {
  assert(canManageCases("consultant"), "un consultor debe poder registrar");
  assert(!canGovernCases("consultant"), "un consultor NO clasifica ni cierra");
  assert(canGovernCases("quality") && canGovernCases("admin"), "calidad y administración gobiernan");
  assert(!canReopenCase("quality"), "reabrir es solo de administración");
  assert(canReopenCase("admin"), "la administración sí reabre");
  for (const r of [null, undefined, "", "viewer"]) {
    assert(!canManageCases(r) && !canGovernCases(r), `«${r}» no debería poder nada`);
  }
});

check("B2. el historial se cuenta en español y en pasado", () => {
  assert(/no conformidad/i.test(describeDecision("classification", "nonconformity")),
    "no dice en qué se clasificó");
  assert(/NO eficaz/i.test(describeDecision("effectiveness", "not_effective")),
    "una eficacia negativa debe leerse como tal");
  assert(/eficaz/i.test(describeDecision("effectiveness", "effective")), "falta el caso positivo");
  for (const k of ["case_opened", "cause_approved", "closure", "reopen"] as const) {
    assert(describeDecision(k, null).length > 5, `${k} sin descripción`);
  }
});

check("B3. un dictamen de cierre ilegible se interpreta como NO se cierra", () => {
  for (const raw of [null, undefined, 42, "sí", {}, { can_close: "true" }]) {
    assert(parseClosure(raw).canClose === false,
      `«${JSON.stringify(raw)}» se leyó como permiso para cerrar`);
  }
  const good = parseClosure({ can_close: false, missing: ["Aprobar la causa", 7], reason: "falta" });
  assert(good.missing.length === 1, "coló una entrada que no era texto");
});

check("B4. una referencia solo enlaza donde de verdad hay página", () => {
  assert(referenceHref("quality_indicator", "x") === "/quality/indicators/x", "indicador mal enlazado");
  assert(referenceHref("work_case", "x") === "/quality/cases/x", "caso mal enlazado");
  // Una medición se ve dentro de su indicador: enlazar a una ruta inventada
  // sería peor que no enlazar.
  assert(referenceHref("quality_measurement", "x") === null,
    "inventó una ruta para algo que no tiene página propia");
  for (const k of REFERENCE_KINDS) {
    assert(REFERENCE_KIND_LABEL[k]?.length > 0, `${k} sin nombre visible`);
  }
});

check("B5. la bandeja transversal conoce los tipos nuevos", () => {
  // El defecto histórico: una tarea de un dominio nuevo sin etiqueta y con el
  // enlace apuntando a Documentos.
  for (const t of ["case_evaluation", "case_closure", "action_execution", "action_effectiveness"]) {
    assert((TASK_TYPES as readonly string[]).includes(t), `falta el tipo de tarea ${t}`);
    assert((TASK_TYPE_LABEL as Record<string, string>)[t]?.length > 0, `${t} sin etiqueta`);
  }
  for (const a of ["case_assigned", "action_assigned", "action_overdue", "effectiveness_due"]) {
    assert((ALERT_TYPES as readonly string[]).includes(a), `falta el tipo de alerta ${a}`);
    assert((ALERT_TYPE_LABEL as Record<string, string>)[a]?.length > 0, `${a} sin etiqueta`);
  }
  for (const s of ["work_case", "work_action"]) {
    assert((SUBJECT_TYPES as readonly string[]).includes(s), `falta el tipo de asunto ${s}`);
  }
  const view = read("components/domain/quality/tasks-view.tsx");
  assert(/case "work_case":\s*\n\s*return `\/quality\/cases\//.test(view),
    "una tarea de caso no lleva a su caso");
});

check("B6. los avisos de frontera se dan ANTES, y no mienten", () => {
  for (const [k, t] of Object.entries(CASE_THRESHOLD)) {
    assert(t.length > 40, `${k}: el aviso es demasiado corto para explicar nada`);
  }
  assert(/no significa que haya funcionado/i.test(CASE_THRESHOLD.complete_action),
    "completar debe advertir que no es lo mismo que haber servido");
  assert(/no se sobrescribe/i.test(CASE_THRESHOLD.verify_effectiveness),
    "la verificación debe decir que no se sobrescribe");
  assert(/decisión nueva/i.test(CASE_THRESHOLD.classify),
    "clasificar debe explicar qué pasa si la conclusión cambia");
});

check("B7. cada tipo de caso tiene nombre propio", () => {
  for (const t of CASE_TYPES) assert(CASE_TYPE_LABEL[t]?.length > 0, `${t} sin etiqueta`);
  assert(new Set(Object.values(CASE_TYPE_LABEL)).size === CASE_TYPES.length,
    "dos tipos de caso comparten etiqueta");
});

console.log("\nM · Migración 0121");

check("M1. es append-only y no destruye nada", () => {
  const sql = stripSql(read(MIG));
  assert(!/^\s*(drop table|truncate|delete from)/im.test(sql), "0121 no puede destruir datos");
  // Ensanchar los CHECK de 0116 es aditivo: se recrean con MÁS valores.
  assert(/alter table public\.work_tasks\s+drop constraint work_tasks_type_check/.test(sql),
    "no ensancha el CHECK de tareas");
  assert(/'case_evaluation'/.test(sql) && /'action_execution'/.test(sql),
    "los tipos nuevos no entran en work_tasks");
});

check("M2. NO crea un sistema paralelo de alertas", () => {
  // Sin comentarios: la propia migración NOMBRA las tablas prohibidas para
  // explicar que no las crea, y buscarlas en la prosa daría un falso positivo.
  const sql = stripSql(read(MIG));
  for (const forbidden of ["quality_nc_alerts", "quality_nonconformity_tasks",
                           "corrective_action_notifications", "action_alerts", "case_alerts"]) {
    assert(!sql.includes(forbidden), `creó la tabla paralela ${forbidden}`);
  }
  assert(/insert into work_alerts/.test(sql), "debe reutilizar work_alerts");
  assert(/insert into work_events/.test(sql), "debe reutilizar work_events");
  // Las tareas las crea la ACCIÓN al planificarse, que es escritura normal bajo
  // RLS, no una RPC: por eso se comprueba en la capa de aplicación. Lo que la
  // migración sí hace es CERRARLAS cuando el trabajo se completa.
  assert(/update work_tasks set status = 'done'/.test(sql),
    "completar una acción debe cerrar su tarea");
  const actions = read("server/actions/work-cases.ts");
  assert(/insertRow\("work_tasks"/.test(actions), "las tareas deben ir a work_tasks");
  assert(!/insertRow\("(case|action)_tasks"/.test(actions), "creó una bandeja paralela");
});

check("M3. el motor de acciones es UNO solo (AC-01)", () => {
  const sql = stripSql(read(MIG));
  assert(/create table public\.work_actions/.test(sql), "falta el motor de acciones");
  for (const k of ["containment", "correction", "corrective", "improvement"]) {
    assert(sql.includes(`'${k}'`), `el motor no conoce ${k}`);
  }
  assert(!/create table public\.(quality|audit|supplier)_\w*actions/.test(sql),
    "creó un motor de acciones por dominio");
});

check("M4. la referencia tipada se VALIDA de verdad (§57)", () => {
  const sql = stripSql(read(MIG));
  assert(/create table public\.work_references/.test(sql), "falta la tabla de referencias");
  const fn = sql.slice(sql.indexOf("function public.work_reference_must_be_valid"));
  // Existencia Y empresa: lo segundo importa tanto como lo primero.
  assert(/no existe/i.test(fn), "no comprueba que la referencia exista");
  assert(/no es de esta empresa/i.test(fn), "no comprueba la empresa de la referencia");
  for (const kind of ["quality_indicator", "quality_measurement", "trazadoc_document", "work_case"]) {
    assert(fn.includes(kind), `el validador no conoce ${kind}`);
  }
});

check("M5. las decisiones formales son inmutables (AC-22)", () => {
  const sql = stripSql(read(MIG));
  assert(/create trigger work_decisions_no_update/.test(sql), "una decisión se puede editar");
  assert(/create trigger work_decisions_no_delete/.test(sql), "una decisión se puede borrar");
  assert(/create trigger work_action_verifications_no_update/.test(sql),
    "una verificación de eficacia se puede editar");
  assert(/create trigger work_case_causes_protect/.test(sql), "una causa aprobada se puede reescribir");
});

check("M6. el cierre se CONDICIONA, no se declara (AC-18)", () => {
  const sql = stripSql(read(MIG));
  const fn = sql.slice(sql.indexOf("function public.work_case_closure_eligibility"));
  assert(/Evaluar el caso/.test(fn), "no exige la evaluación");
  assert(/Aprobar el análisis de causa/.test(fn), "no exige la causa aprobada");
  assert(/acción correctiva/.test(fn), "no exige la acción correctiva");
  assert(/sin completar/.test(fn), "no exige que las acciones estén completadas");
  assert(/eficacia pendiente/.test(fn), "no exige verificar la eficacia");
  // Y la profundidad es PROPORCIONAL: causa y correctiva solo si es NC (AC-07).
  assert(/if v_case\.classification = 'nonconformity' then/.test(fn),
    "exige el mismo tratamiento a todo, contra AC-07 y AC-08");
});

check("M7. una eficacia negativa devuelve el caso a análisis (AC-17)", () => {
  const sql = stripSql(read(MIG));
  const fn = sql.slice(sql.indexOf("function public.work_verify_effectiveness"));
  assert(/if p_result = 'not_effective' then/.test(fn), "no reacciona a una eficacia negativa");
  assert(/status = 'in_analysis'/.test(fn), "no devuelve el caso a análisis");
  // Y NO borra la acción fallida.
  assert(!/delete from work_actions/.test(fn), "borró la acción que no funcionó");
});

check("M8. el criterio de eficacia se exige ANTES (AC-16)", () => {
  const sql = stripSql(read(MIG));
  assert(/work_actions_criteria_when_required/.test(sql),
    "se puede exigir eficacia sin decir contra qué se comprobará");
  assert(/original_due_on/.test(sql), "prorrogar borraría la fecha original (AC-15)");
});

check("M9. la historia es de SOLO LECTURA para el cliente", () => {
  const sql = stripSql(read(MIG));
  // Sin política de escritura Y sin privilegio: la lección de 0115/0118.
  assert(!/create policy work_decisions_(insert|update|delete)/.test(sql),
    "las decisiones tienen política de escritura");
  assert(!/create policy work_action_verifications_(insert|update|delete)/.test(sql),
    "las verificaciones tienen política de escritura");
  assert(/revoke insert, update, delete, truncate, references, trigger on table[\s\S]*work_decisions/.test(sql),
    "no retira el privilegio que el entorno concede de más");
  assert(/revoke all on table[\s\S]*from anon/.test(sql), "anon no puede conservar nada");
});

check("M10. una NC formalizada NO se elimina, ni por un administrador", () => {
  const sql = stripSql(read(MIG));
  assert(/create trigger work_cases_guard_delete/.test(sql), "el caso no tiene puerta de borrado");
  assert(/create trigger work_actions_guard_delete/.test(sql), "la acción no tiene puerta de borrado");
  const fn = sql.slice(sql.indexOf("function public.work_case_deletion_verdict"));
  for (const t of ["work_decisions", "work_case_findings", "work_case_causes"]) {
    assert(fn.includes(t), `la frontera no mira ${t}`);
  }
  // Y el despachador de 0119/0120 aprende las dos entidades nuevas.
  assert(/when 'case'\s+then work_case_deletion_verdict\(p_id\)/.test(sql),
    "el despachador no conoce los casos");
  for (const ent of ["indicator", "objective", "position", "document", "process"]) {
    assert(new RegExp(`when '${ent}'\\s+then`).test(sql), `el despachador perdió ${ent}`);
  }
});

check("M11. el número de caso no se recicla", () => {
  const sql = stripSql(read(MIG));
  assert(/create table public\.work_case_codes/.test(sql), "falta la reserva de números");
  assert(/no puede reutilizarse/.test(read(MIG)), "el rechazo debe explicarse");
  assert(/after delete on public\.work_cases/.test(sql),
    "eliminar un borrador debe dejar la lápida, no liberar el número");
});

check("M12. la migración explica el porqué y ancla sus decisiones", () => {
  const comments = read(MIG).split("\n").filter((l) => l.trim().startsWith("--"));
  assert(comments.length > 150, `solo ${comments.length} líneas de comentario`);
  const text = comments.join("\n");
  for (const d of ["AC-01", "AC-02", "AC-04", "AC-05", "AC-13", "AC-16", "AC-17", "AC-22", "MDR-33"]) {
    assert(text.includes(d), `no ancla la decisión ${d}`);
  }
});

console.log("\nN · Coherencia entre capas");

check("N1. los enumerados del dominio y los de la BASE coinciden", () => {
  const sql = stripSql(read(MIG));
  const enumOf = (constraint: string): string[] => {
    const i = sql.indexOf(constraint);
    assert(i > 0, `no encontré ${constraint}`);
    const seg = sql.slice(i, i + 600);
    return [...seg.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  };
  for (const k of ACTION_KINDS) {
    assert(enumOf("check (action_kind in (").includes(k), `la base no conoce la acción ${k}`);
  }
  for (const c of CLASSIFICATIONS) {
    assert(enumOf("check (classification in (").includes(c), `la base no conoce la clasificación ${c}`);
  }
  for (const s of CASE_STATUSES) {
    assert(enumOf("check (status in ('draft','open'").includes(s), `la base no conoce el estado ${s}`);
  }
});

check("N2. las server actions NO deciden nada por su cuenta", () => {
  const src = read("server/actions/work-cases.ts");
  // Clasificar, aprobar, verificar y cerrar SIEMPRE pasan por una RPC.
  for (const [fn, rpc] of [
    ["classifyCaseAction", "work_classify_case"],
    ["approveCauseAction", "work_approve_cause"],
    ["completeActionAction", "work_complete_action"],
    ["verifyEffectivenessAction", "work_verify_effectiveness"],
    ["closeCaseAction", "work_close_case"],
    ["reopenCaseAction", "work_reopen_case"],
  ] as const) {
    const i = src.indexOf(`export async function ${fn}`);
    assert(i > 0, `falta ${fn}`);
    const body = src.slice(i, src.indexOf("export async function", i + 10));
    assert(body.includes(rpc), `${fn} no pasa por ${rpc}`);
  }
  // Y ninguna escribe una clasificación directamente.
  assert(!/\.from\("work_cases"\)[\s\S]{0,200}classification:/.test(src),
    "una acción de servidor escribe la clasificación a mano");
  assert(!/\.from\("work_decisions"\)[\s\S]{0,200}decision_kind: "classification"/.test(src),
    "una acción de servidor fabrica una decisión de clasificación");
});

check("N3. la pantalla no decide: pinta lo que el servidor resolvió", () => {
  const detail = read("components/domain/quality/case-detail.tsx");
  assert(/model\.closure\.canClose/.test(detail), "el cierre no obedece al dictamen del servidor");
  assert(!/actions\.filter\([^)]*status === "completed"[^)]*\)\.length ===/.test(detail),
    "la pantalla está calculando la elegibilidad de cierre por su cuenta");
  // Y la NC se redacta en TRES campos, no en un textarea gigante (§15).
  assert(/name="requirement_text"/.test(detail), "falta el campo de requisito");
  assert(/name="evidence_text"/.test(detail), "falta el campo de evidencia");
  assert(/name="nonconformity_text"/.test(detail), "falta el campo de incumplimiento");
});

check("N4. la ficha se lee como una historia, no como un formulario", () => {
  const detail = read("components/domain/quality/case-detail.tsx");
  for (const stage of ["Hallazgo", "Evaluación", "Causa", "Acciones", "Cierre"]) {
    assert(detail.includes(`title="${stage}"`), `falta la etapa ${stage}`);
  }
  assert(/Historial/.test(detail), "falta el historial de negocio");
  // Cada etapa hace una pregunta en lenguaje humano.
  assert((detail.match(/question="/g) ?? []).length >= 5, "las etapas no plantean su pregunta");
});

console.log(`\nQUALITY-04 · puras y estáticas: ${passed} correctas, ${failed} fallidas\n`);
if (failed > 0) process.exit(1);
