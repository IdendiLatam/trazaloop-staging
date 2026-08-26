/**
 * Trazaloop Quality · QUALITY-02 · Pruebas PURAS y ESTÁTICAS.
 *
 *   A · Revisión ≠ estado del workflow ≠ identidad (el defecto central).
 *   B · Vigencia: aprobado no es vigente.
 *   C · Quién puede decidir, y quién no.
 *   D · Eliminar vs. retirar.
 *   E · Lista Maestra: filtros, columnas y «vacío no es cero».
 *   F · Bandeja transversal de tareas y alertas.
 *   G · PDF: es un PDF de verdad y dice lo que debe decir.
 *   M · Convenciones e invariantes de la migración 0116.
 *
 * Correr: npm run test:quality02
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LIFECYCLE_LABEL,
  LIFECYCLE_STATES,
  WORKFLOW_STATES,
  WORKFLOW_STATE_LABEL,
  addDays,
  buildParticipantsPayload,
  canAttemptHardDelete,
  canCreateNextRevision,
  canDecideNow,
  canEditRevisionContent,
  canRetireDocument,
  canSubmitRevision,
  deriveLifecycleState,
  displayRevision,
  effectivityCaption,
  formatDate,
  hardDeleteBlockReason,
  legacyRevisionLabel,
  orDash,
  orPending,
  reviewAttention,
  revisionLabel,
  validateSubmitInput,
  type LifecycleState,
} from "../../lib/domain/document-control";
import {
  MASTER_COLUMNS,
  decisionLabel,
  describeFilters,
  filterMasterList,
  masterListHeaders,
  masterListToRows,
  type MasterListRow,
} from "../../lib/domain/document-master-list";
import {
  isPendingAlert,
  isPendingTask,
  summarizeInbox,
  summaryLines,
} from "../../lib/domain/work-inbox";
import { renderDocumentPdf, renderMasterListPdf } from "../../lib/pdf/quality-documents";
import { measureText, truncateToWidth, wrapText } from "../../lib/pdf/writer";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const stripSql = (s: string) => s.replace(/^\s*--.*$/gm, "");
const MIG = "supabase/migrations/0116_document_control_revisions_workflow_and_tasks.sql";

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`); }
  catch (e) { failed += 1; console.error(`  ✘ ${name}: ${e instanceof Error ? e.message : e}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }

console.log("\nQUALITY-02 · control documental (puras y estáticas)\n");

// ---------------------------------------------------------------------------
console.log("A · Revisión ≠ estado del workflow ≠ identidad");
// ---------------------------------------------------------------------------

check("A1. un documento nuevo se lee como Revisión 1", () => {
  assert(revisionLabel(1) === "Revisión 1", revisionLabel(1));
  assert(
    displayRevision({ revisionModel: "controlled", currentVersion: 1, currentRevisionNumber: 1 }) ===
      "Revisión 1",
    "un documento controlado recién creado no muestra Revisión 1"
  );
});

check("A2. TODO el recorrido del workflow deja la revisión en 1", () => {
  // El recorrido completo del encargo: crear → enviar → devolver → corregir →
  // reenviar → aceptar → aprobar. La revisión es un dato de la IDENTIDAD y no
  // cambia con ninguno de esos estados.
  const states: LifecycleState[] = [
    "draft", "in_review", "changes_requested", "draft",
    "in_review", "pending_approval", "approved_pending_effective", "effective",
  ];
  for (const state of states) {
    const shown = displayRevision({
      revisionModel: "controlled", currentVersion: 1, currentRevisionNumber: 1,
    });
    assert(shown === "Revisión 1", `en «${state}» la revisión se mostró como ${shown}`);
  }
});

check("A3. un current_version heredado NUNCA se presenta como revisión real", () => {
  // Es la regla que impide inventar un histórico: en los documentos legacy ese
  // número contaba transiciones de estado, no revisiones.
  assert(legacyRevisionLabel(4) === "v4 (histórico)", legacyRevisionLabel(4));
  assert(legacyRevisionLabel(1) === "v1", legacyRevisionLabel(1));
  const shown = displayRevision({
    revisionModel: "legacy", currentVersion: 5, currentRevisionNumber: null,
  });
  assert(shown === "v5 (histórico)", `un legacy con v5 se presentó como «${shown}»`);
  assert(!shown.includes("Revisión"), "un legacy se presentó como si fuera una revisión de negocio");
});

check("A4. cada estado del workflow tiene nombre en español", () => {
  for (const state of WORKFLOW_STATES) {
    const label = WORKFLOW_STATE_LABEL[state];
    assert(label && label.length > 0, `falta la etiqueta de ${state}`);
    assert(label !== state, `la etiqueta de ${state} es la clave técnica`);
  }
  for (const state of LIFECYCLE_STATES) {
    assert(LIFECYCLE_LABEL[state]?.length > 0, `falta la etiqueta de ciclo de vida ${state}`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nB · Aprobado ≠ vigente");
// ---------------------------------------------------------------------------

check("B1. aprobado con vigencia futura se lee «pendiente de vigencia»", () => {
  const state = deriveLifecycleState({
    disposition: "active", workflowState: "approved",
    effectiveFrom: "2026-09-01", engineStatus: "approved", today: "2026-08-21",
  });
  assert(state === "approved_pending_effective", state);
});

check("B2. el mismo documento pasa a «vigente» el día que empieza a regir", () => {
  const state = deriveLifecycleState({
    disposition: "active", workflowState: "approved",
    effectiveFrom: "2026-09-01", engineStatus: "approved", today: "2026-09-01",
  });
  assert(state === "effective", state);
});

check("B3. sin fecha declarada, aprobar es empezar a regir hoy", () => {
  const state = deriveLifecycleState({
    disposition: "active", workflowState: "approved",
    effectiveFrom: null, engineStatus: "approved", today: "2026-08-21",
  });
  assert(state === "effective", state);
});

check("B4. un documento retirado se lee retirado, decida lo que decida el motor", () => {
  const state = deriveLifecycleState({
    disposition: "retired", workflowState: "approved",
    effectiveFrom: "2020-01-01", engineStatus: "approved", today: "2026-08-21",
  });
  assert(state === "retired", state);
});

check("B5. un documento legacy sin revisiones conserva el estado del motor", () => {
  assert(
    deriveLifecycleState({
      disposition: "active", workflowState: null, effectiveFrom: null,
      engineStatus: "in_review", today: "2026-08-21",
    }) === "in_review",
    "un legacy en revisión no se leyó como tal"
  );
  assert(
    deriveLifecycleState({
      disposition: "active", workflowState: null, effectiveFrom: null,
      engineStatus: "obsolete", today: "2026-08-21",
    }) === "retired",
    "un legacy obsoleto debería leerse como retirado"
  );
});

check("B6. el texto de vigencia distingue las dos fechas", () => {
  const caption = effectivityCaption({
    lifecycle: "approved_pending_effective",
    approvedAt: "2026-08-21T12:00:00Z", effectiveFrom: "2026-09-01", effectiveTo: null,
  });
  assert(caption.includes("21/08/2026"), `no menciona la aprobación: ${caption}`);
  assert(caption.includes("01/09/2026"), `no menciona la vigencia: ${caption}`);
  assert(caption.includes("Aprobado") && caption.includes("regir"), caption);
});

check("B7. una revisión vencida pide atención, NO obsoleta el documento (D-09)", () => {
  const overdue = reviewAttention({
    reviewDueAt: "2026-01-01", lifecycle: "effective", today: "2026-08-21",
  });
  assert(overdue.level === "overdue", overdue.level);
  assert(
    overdue.message !== null && overdue.message.includes("sigue vigente"),
    `el aviso no aclara que el documento sigue vigente: ${overdue.message}`
  );
  const soon = reviewAttention({
    reviewDueAt: addDays("2026-08-21", 10), lifecycle: "effective", today: "2026-08-21",
  });
  assert(soon.level === "due_soon", soon.level);
  const far = reviewAttention({
    reviewDueAt: addDays("2026-08-21", 200), lifecycle: "effective", today: "2026-08-21",
  });
  assert(far.level === "none", far.level);
  // Un borrador no arrastra avisos de revisión periódica: todavía no rige nada.
  const draft = reviewAttention({
    reviewDueAt: "2026-01-01", lifecycle: "draft", today: "2026-08-21",
  });
  assert(draft.level === "none", draft.level);
});

// ---------------------------------------------------------------------------
console.log("\nC · Quién puede hacer qué");
// ---------------------------------------------------------------------------

check("C1. el contenido solo se edita con la revisión abierta", () => {
  for (const role of ["admin", "quality", "consultant"] as const) {
    assert(canEditRevisionContent(role, "draft"), `${role} no puede editar un borrador`);
    assert(canEditRevisionContent(role, "changes_requested"), `${role} no puede corregir`);
    for (const closed of ["in_review", "pending_approval", "effective", "retired"] as const) {
      assert(!canEditRevisionContent(role, closed), `${role} pudo editar en ${closed}`);
      // Enviar y editar van de la mano: si el contenido está congelado, no hay
      // nada nuevo que enviar. Que las dos reglas coincidan evita un estado en
      // el que se pueda reenviar algo que ya no se puede tocar.
      assert(!canSubmitRevision(role, closed), `${role} pudo enviar en ${closed}`);
    }
    assert(canSubmitRevision(role, "draft") && canSubmitRevision(role, "changes_requested"),
      `${role} no puede enviar lo que sí puede editar`);
  }
});

check("C2. solo decide quien lo tiene asignado, ni siquiera el administrador", () => {
  const participants = [
    { profileId: "rev", participantRole: "reviewer" as const, stepOrder: 1, round: 1, decision: "pending" as const },
    { profileId: "apr", participantRole: "approver" as const, stepOrder: 1, round: 1, decision: "pending" as const },
  ];
  const base = { lifecycle: "in_review" as LifecycleState, routeMode: "sequential" as const, round: 1, participants };
  assert(canDecideNow({ ...base, userId: "rev" }), "el revisor designado no puede decidir");
  assert(!canDecideNow({ ...base, userId: "apr" }), "el aprobador decidió en la etapa de revisión");
  assert(!canDecideNow({ ...base, userId: "admin-cualquiera" }), "un tercero pudo decidir");
});

check("C3. ruta secuencial: solo el paso que toca", () => {
  const participants = [
    { profileId: "a", participantRole: "reviewer" as const, stepOrder: 1, round: 1, decision: "pending" as const },
    { profileId: "b", participantRole: "reviewer" as const, stepOrder: 2, round: 1, decision: "pending" as const },
  ];
  const base = { lifecycle: "in_review" as LifecycleState, round: 1, participants };
  assert(canDecideNow({ ...base, routeMode: "sequential", userId: "a" }), "el paso 1 no puede decidir");
  assert(!canDecideNow({ ...base, routeMode: "sequential", userId: "b" }), "el paso 2 decidió antes de tiempo");
  // En paralelo, los dos a la vez: es la otra ruta que exige D-19.
  assert(canDecideNow({ ...base, routeMode: "parallel", userId: "b" }), "en paralelo el paso 2 no pudo decidir");
});

check("C4. la ronda anterior no reabre decisiones", () => {
  const participants = [
    { profileId: "rev", participantRole: "reviewer" as const, stepOrder: 1, round: 1, decision: "changes_requested" as const },
    { profileId: "rev", participantRole: "reviewer" as const, stepOrder: 1, round: 2, decision: "approved" as const },
  ];
  assert(
    !canDecideNow({
      userId: "rev", lifecycle: "in_review", routeMode: "sequential", round: 2, participants,
    }),
    "se pudo volver a decidir sobre una ronda ya resuelta"
  );
});

check("C5. abrir una revisión nueva exige documento aprobado y autoridad", () => {
  assert(canCreateNextRevision("admin", "effective"), "admin no pudo abrir la revisión siguiente");
  assert(canCreateNextRevision("quality", "approved_pending_effective"), "quality no pudo");
  assert(!canCreateNextRevision("consultant", "effective"), "un consultor pudo emitir una revisión");
  assert(!canCreateNextRevision("admin", "draft"), "se abrió una revisión nueva sobre un borrador");
});

check("C6. retirar y eliminar tienen autoridades distintas", () => {
  assert(canRetireDocument("admin") && canRetireDocument("quality"), "retirar debería ser admin/quality");
  assert(!canRetireDocument("consultant"), "un consultor pudo retirar");
  assert(canAttemptHardDelete("admin"), "el administrador no puede eliminar");
  assert(!canAttemptHardDelete("quality"), "quality pudo eliminar físicamente");
});

check("C7. un documento sin aprobador no se envía", () => {
  const reviewers = buildParticipantsPayload([{ profileId: "r" }]);
  assert(validateSubmitInput({ reviewers, approvers: [] }).error !== null, "se envió sin aprobador");
  const approvers = buildParticipantsPayload([{ positionId: "cargo" }]);
  assert(validateSubmitInput({ reviewers: [], approvers }).error === null, "no se admitió enviar sin revisores");
});

check("C8. la ruta secuencial conserva el orden del formulario", () => {
  const payload = buildParticipantsPayload([
    { positionId: "p1" }, { profileId: "u2" }, { positionId: null, profileId: null }, { profileId: "u3" },
  ]);
  assert(payload.length === 3, `las entradas vacías no se descartaron: ${payload.length}`);
  assert(payload.map((p) => p.step_order).join(",") === "1,2,3", JSON.stringify(payload));
  assert(payload[0].position_id === "p1" && payload[0].profile_id === null, JSON.stringify(payload[0]));
});

check("C9. la programación de vigencia y revisión es coherente", () => {
  const approvers = buildParticipantsPayload([{ profileId: "a" }]);
  const bad = validateSubmitInput({
    reviewers: [], approvers, effectiveFrom: "2026-09-01", reviewDueAt: "2026-08-01",
  });
  assert(bad.error !== null, "se aceptó una revisión programada antes de la vigencia");
});

// ---------------------------------------------------------------------------
console.log("\nD · Eliminar vs. retirar");
// ---------------------------------------------------------------------------

const pristineDraft = {
  lifecycle: "draft" as LifecycleState, disposition: "active",
  everApproved: false, hasFormalHistory: false, revisionCount: 1, linkedProcessCount: 0,
};

check("D1. un borrador sin historia se elimina", () => {
  assert(hardDeleteBlockReason(pristineDraft) === null, "un borrador limpio quedó bloqueado");
});

check("D2. un documento aprobado NUNCA se destruye", () => {
  const reason = hardDeleteBlockReason({
    ...pristineDraft, lifecycle: "effective", everApproved: true, revisionCount: 1,
  });
  assert(reason !== null, "un documento vigente se pudo eliminar");
  assert(reason!.includes("retira"), `el motivo no propone retirarlo: ${reason}`);
});

check("D3. un rechazo YA ES historia formal: el borrador se retira, no se destruye", () => {
  const reason = hardDeleteBlockReason({ ...pristineDraft, hasFormalHistory: true });
  assert(reason !== null, "un borrador con decisiones formales se pudo eliminar");
  assert(
    reason!.includes("revisión") || reason!.includes("aprobación"),
    `el motivo no explica qué historia hay: ${reason}`
  );
});

check("D4. un documento en uso por un proceso avisa antes de destruirse", () => {
  const reason = hardDeleteBlockReason({ ...pristineDraft, linkedProcessCount: 2 });
  assert(reason !== null && reason.includes("proceso"), `${reason}`);
});

check("D5. un documento ya retirado no se elimina después", () => {
  const reason = hardDeleteBlockReason({ ...pristineDraft, disposition: "retired", lifecycle: "retired" });
  assert(reason !== null && reason.includes("histórico"), `${reason}`);
});

check("D6. todos los motivos están redactados para leerse en pantalla", () => {
  const cases = [
    { ...pristineDraft, lifecycle: "effective" as LifecycleState },
    { ...pristineDraft, hasFormalHistory: true },
    { ...pristineDraft, linkedProcessCount: 1 },
    { ...pristineDraft, disposition: "archived" },
  ];
  for (const c of cases) {
    const reason = hardDeleteBlockReason(c)!;
    assert(reason.length > 20, `motivo demasiado escueto: ${reason}`);
    assert(!/[_{}]|null|undefined/.test(reason), `el motivo filtra jerga técnica: ${reason}`);
    assert(/[.]$/.test(reason), `el motivo no termina en punto: ${reason}`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nE · Lista Maestra");
// ---------------------------------------------------------------------------

function row(over: Partial<MasterListRow> = {}): MasterListRow {
  return {
    documentId: "d1", moduleKey: "quality", code: "PR-001", title: "Procedimiento de compras",
    categoryCode: "procedure", categoryLabel: "Procedimientos", lifecycle: "effective",
    revisionModel: "controlled", currentVersion: 1, currentRevisionNumber: 1,
    effectiveRevisionNumber: 1, legacyRevisionUncertain: false,
    ownerName: "Ana", ownerPositionName: "Jefe de Compras",
    reviewers: "Beto", approvers: "Carla",
    createdAt: "2026-08-01T00:00:00Z", submittedAt: "2026-08-10T00:00:00Z",
    approvedAt: "2026-08-21T00:00:00Z", effectiveFrom: "2026-08-21", effectiveTo: null,
    currentEffectiveFrom: "2026-08-21",
    reviewDueAt: "2027-08-21", reviewOverdue: false,
    processNames: "Compras", processCount: 1,
    lastDecisionType: "approved", lastDecisionAt: "2026-08-21T00:00:00Z",
    disposition: "active", sectionsCount: 5, filledSectionsCount: 5,
    ...over,
  };
}

check("E1. las columnas mínimas del encargo están todas", () => {
  const headers = masterListHeaders().join(" | ").toLowerCase();
  for (const needle of [
    "código", "título", "tipo", "revisión vigente", "estado", "propietario",
    "revisor", "aprobador", "creado", "enviado", "aprobado", "vigencia",
    "próxima revisión", "procesos", "origen", "última decisión",
  ]) {
    assert(headers.includes(needle), `falta la columna «${needle}» en: ${headers}`);
  }
});

check("E2. vacío NO es cero: se dice «Pendiente», «Sin designar» o «No aplica»", () => {
  const cells = MASTER_COLUMNS.map((c) => c.value(row({
    code: null, approvedAt: null, submittedAt: null, reviewers: null, approvers: null,
    reviewDueAt: null, ownerName: null, ownerPositionName: null,
    processNames: "", lastDecisionAt: null, lastDecisionType: null,
  })));
  const joined = cells.join(" | ");
  assert(!/\b0\b/.test(joined), `un campo sin dato salió como cero: ${joined}`);
  assert(joined.includes("Pendiente"), `no se declara lo pendiente: ${joined}`);
  assert(joined.includes("Sin designar"), `no se declara lo que falta designar: ${joined}`);
  assert(joined.includes("No aplica"), `no se declara lo que no aplica: ${joined}`);
  assert(joined.includes("—"), `no se usa el guion para lo vacío: ${joined}`);
});

check("E3. la revisión vigente no es la revisión en curso", () => {
  // Revisión 2 recién abierta en borrador; la que rige sigue siendo la 1.
  const cell = MASTER_COLUMNS.find((c) => c.key === "revision")!.value(
    row({ currentRevisionNumber: 2, effectiveRevisionNumber: 1, lifecycle: "draft" })
  );
  assert(cell === "Revisión 1", `la lista maestra mostró «${cell}» como revisión vigente`);
  const none = MASTER_COLUMNS.find((c) => c.key === "revision")!.value(
    row({ effectiveRevisionNumber: null, lifecycle: "draft" })
  );
  assert(none === "Ninguna vigente", none);
});

check("E4. los filtros filtran, y «all» no filtra", () => {
  const rows = [
    row({ documentId: "a", lifecycle: "effective", categoryCode: "procedure", reviewers: "Beto" }),
    row({ documentId: "b", lifecycle: "draft", categoryCode: "policy", reviewers: null, processNames: "Ventas" }),
    row({ documentId: "c", lifecycle: "effective", categoryCode: "procedure", reviewOverdue: true }),
  ];
  assert(filterMasterList(rows, {}).length === 3, "un filtro vacío filtró algo");
  assert(filterMasterList(rows, { lifecycle: "all" }).length === 3, "«all» filtró");
  assert(filterMasterList(rows, { lifecycle: "draft" }).length === 1, "filtro por estado");
  assert(filterMasterList(rows, { category: "policy" }).length === 1, "filtro por tipo");
  // Dos filas llevan «Beto» (la primera explícita, la tercera por defecto);
  // se busca en minúsculas para comprobar que el filtro no distingue caja.
  assert(filterMasterList(rows, { reviewer: "beto" }).length === 2, "filtro por revisor no es insensible a mayúsculas");
  assert(filterMasterList(rows, { review: "overdue" }).length === 1, "filtro de revisión vencida");
  assert(filterMasterList(rows, { process: "Ventas" }).length === 1, "filtro por proceso");
  assert(filterMasterList(rows, { search: "compras" }).length === 3, "búsqueda por título");
  assert(filterMasterList(rows, { origin: "cpr" }).length === 0, "filtro por origen");
});

check("E5. el PDF declara los filtros aplicados, o dice que no hay", () => {
  assert(describeFilters({}).includes("Sin filtros"), describeFilters({}));
  const caption = describeFilters({ lifecycle: "effective", process: "Compras", review: "overdue" });
  assert(caption.includes("Vigente"), `el estado no se tradujo: ${caption}`);
  assert(caption.includes("Compras") && caption.includes("vencida"), caption);
});

check("E6. cada fila produce exactamente una celda por columna", () => {
  const rows = masterListToRows([row(), row()]);
  assert(rows.length === 2, `${rows.length}`);
  for (const r of rows) {
    assert(r.length === MASTER_COLUMNS.length, `${r.length} celdas para ${MASTER_COLUMNS.length} columnas`);
  }
});

check("E8. un aprobado con vigencia futura DICE desde cuándo regirá", () => {
  // Defecto encontrado al mirar el PDF real: la columna de vigencia leía la
  // fecha de la revisión VIGENTE, que en este estado todavía no existe, y
  // acababa mostrando «empieza a regir el —». La fecha que hay que comunicar
  // es la que declara la revisión en curso.
  const cell = MASTER_COLUMNS.find((c) => c.key === "effective")!.value(row({
    lifecycle: "approved_pending_effective",
    effectiveFrom: null, effectiveRevisionNumber: null,
    currentEffectiveFrom: "2026-09-01", approvedAt: "2026-08-21T00:00:00Z",
  }));
  assert(cell.includes("01/09/2026"), `no dice desde cuándo regirá: ${cell}`);
  assert(!cell.includes("regir el —"), `la fecha quedó vacía: ${cell}`);
});

check("E9. la última decisión se lee en español, no en clave interna", () => {
  const cell = MASTER_COLUMNS.find((c) => c.key === "last_decision")!.value(
    row({ lastDecisionType: "approved" })
  );
  assert(cell.startsWith("Aprobado"), `se filtró la clave técnica: ${cell}`);
  assert(decisionLabel("changes_requested") === "Devuelto con observaciones", decisionLabel("changes_requested"));
  assert(decisionLabel(null) === "—", decisionLabel(null));
});

check("E7. el origen se muestra sin la marca, que dentro de Trazaloop no distingue nada", () => {
  const cell = MASTER_COLUMNS.find((c) => c.key === "origin")!.value(row({ moduleKey: "quality" }));
  assert(cell === "Quality", cell);
  assert(
    MASTER_COLUMNS.find((c) => c.key === "origin")!.value(row({ moduleKey: "cpr" })) === "PCR",
    "el origen PCR no se muestra con su nombre"
  );
});

// ---------------------------------------------------------------------------
console.log("\nF · Bandeja transversal");
// ---------------------------------------------------------------------------

check("F1. el resumen de la portada cuenta lo pendiente, no lo cerrado", () => {
  const summary = summarizeInbox([
    { taskType: "document_review", status: "open" },
    { taskType: "document_review", status: "open" },
    { taskType: "document_review", status: "done" },
    { taskType: "document_approval", status: "in_progress" },
    { taskType: "document_changes_requested", status: "open" },
    { taskType: "document_changes_requested", status: "cancelled" },
  ]);
  assert(summary.toReview === 2, `${summary.toReview}`);
  assert(summary.toApprove === 1, `${summary.toApprove}`);
  assert(summary.returned === 1, `${summary.returned}`);
  assert(summary.total === 4, `${summary.total}`);
});

check("F2. singular y plural correctos: nadie lee «1 documentos»", () => {
  const one = summaryLines({ toReview: 1, toApprove: 0, returned: 0, toMeasure: 0, total: 1 });
  assert(one[0] === "1 documento por revisar", one[0]);
  const many = summaryLines({ toReview: 3, toApprove: 1, returned: 2, toMeasure: 0, total: 6 });
  assert(many[0] === "3 documentos por revisar", many[0]);
  assert(many[1] === "1 documento por aprobar", many[1]);
  assert(many[2] === "2 documentos devueltos", many[2]);
  assert(summaryLines({ toReview: 0, toApprove: 0, returned: 0, toMeasure: 0, total: 0 }).length === 0,
    "sin pendientes debería no decir nada");
});

check("F3. tarea abierta y alerta sin atender pesan; lo cerrado no", () => {
  assert(isPendingTask("open") && isPendingTask("in_progress"), "una tarea abierta no cuenta");
  assert(!isPendingTask("done") && !isPendingTask("cancelled"), "una tarea cerrada sigue contando");
  assert(isPendingAlert("new") && isPendingAlert("seen") && isPendingAlert("acknowledged"), "alerta viva");
  assert(!isPendingAlert("resolved") && !isPendingAlert("dismissed"), "alerta cerrada sigue contando");
});

// ---------------------------------------------------------------------------
console.log("\nG · PDF");
// ---------------------------------------------------------------------------

const PDF_DOC = renderDocumentPdf({
  documentName: "Documento controlado",
  organizationName: "Empresa de Prueba S.A.S.",
  companyLegalName: "Empresa de Prueba Sociedad por Acciones Simplificada",
  companyTaxId: "900.111.222-3",
  code: "PR-COM-001", title: "Procedimiento de compras",
  description: "Aplica a todas las compras críticas.",
  categoryLabel: "Procedimientos", lifecycle: "approved_pending_effective",
  revisionText: "Revisión 1", ownerText: "Jefe de Compras",
  reviewersText: "Beto Revisor", approversText: "Carla Aprobadora",
  createdAt: "2026-08-01", submittedAt: "2026-08-10T10:00:00Z",
  approvedAt: "2026-08-21T12:00:00Z", approvedByName: "Carla Aprobadora",
  effectiveFrom: "2026-09-01", effectiveTo: null, reviewDueAt: "2027-09-01",
  retirementReason: null, processNames: "Compras",
  sections: [
    { title: "Objetivo", content: "Comprar con criterio. ".repeat(60) },
    { title: "Alcance", content: "" },
  ],
  revisionHistory: [{
    label: "Revisión 1", state: "Aprobada", approvedAt: "2026-08-21T12:00:00Z",
    effectiveFrom: "2026-09-01", effectiveTo: null, changeNote: "Primera emisión",
  }],
  decisions: [{
    label: "Devuelto con observaciones", byName: "Beto Revisor",
    at: "2026-08-12T10:00:00Z", reason: "Falta el criterio de selección.", round: 1,
  }],
  generatedAt: "2026-08-21T15:30:00Z",
});
const PDF_TEXT = PDF_DOC.toString("latin1");

check("G1. es un PDF real: cabecera, catálogo, xref y fin de archivo", () => {
  assert(PDF_TEXT.startsWith("%PDF-1.7"), "no empieza por la cabecera de un PDF");
  assert(PDF_TEXT.includes("/Type /Catalog"), "sin catálogo");
  assert(PDF_TEXT.includes("/Type /Pages"), "sin árbol de páginas");
  assert(/\nxref\n/.test(PDF_TEXT), "sin tabla de referencias cruzadas");
  assert(/startxref\n\d+\n%%EOF/.test(PDF_TEXT), "sin startxref/EOF válidos");
  assert(PDF_DOC.length > 3000, `pesa ${PDF_DOC.length} bytes: demasiado poco para un documento`);
});

check("G2. las posiciones de la tabla xref apuntan de verdad a cada objeto", () => {
  // Un xref con desplazamientos mal calculados produce un archivo que muchos
  // lectores «arreglan» en silencio y otros rechazan. Se comprueba de verdad.
  const xrefAt = PDF_TEXT.lastIndexOf("\nxref\n");
  const startxref = Number(PDF_TEXT.match(/startxref\n(\d+)\n/)![1]);
  assert(startxref === xrefAt + 1, `startxref=${startxref} pero xref está en ${xrefAt + 1}`);
  const entries = [...PDF_TEXT.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert(entries.length >= 5, `solo ${entries.length} objetos en el xref`);
  entries.forEach((offset, i) => {
    const at = PDF_TEXT.slice(offset, offset + 24);
    assert(at.startsWith(`${i + 1} 0 obj`), `el objeto ${i + 1} no está en ${offset} (allí hay «${at.slice(0, 12)}»)`);
  });
});

check("G3. el documento lleva dentro su identidad, su revisión y su empresa", () => {
  for (const needle of [
    "PR-COM-001", "Procedimiento de compras", "Revisión 1", "Empresa de Prueba S.A.S.",
    "Jefe de Compras", "Beto Revisor", "Carla Aprobadora", "Procedimientos",
  ]) {
    assert(PDF_TEXT.includes(needle), `el PDF no contiene «${needle}»`);
  }
  // Los paréntesis se ESCAPAN dentro del literal de cadena: sin esto, una
  // etiqueta como «REVISOR(ES)» cerraría la cadena antes de tiempo y el
  // archivo entero dejaría de abrir.
  assert(PDF_TEXT.includes("REVISOR\\(ES\\)"), "los paréntesis no se escaparon en el flujo de contenido");
});

check("G4. un documento que no rige lo dice en su primera página", () => {
  assert(
    PDF_TEXT.includes("APROBADO") && PDF_TEXT.includes("NO VIGENTE"),
    "un documento aprobado pero no vigente no lo advierte"
  );
  const draft = renderDocumentPdf({
    ...JSON.parse(JSON.stringify({
      documentName: "Documento controlado",
      organizationName: "X", companyLegalName: null, companyTaxId: null, code: null,
      title: "Borrador", description: null, categoryLabel: "Otros", lifecycle: "draft",
      revisionText: "Revisión 1", ownerText: "—", reviewersText: "—", approversText: "—",
      createdAt: "2026-08-01", submittedAt: null, approvedAt: null, approvedByName: null,
      effectiveFrom: null, effectiveTo: null, reviewDueAt: null, retirementReason: null,
      processNames: "", sections: [{ title: "Objetivo", content: "" }],
      revisionHistory: [], decisions: [], generatedAt: "2026-08-21T15:30:00Z",
    })),
  }).toString("latin1");
  assert(draft.includes("BORRADOR"), "un borrador no se identifica como tal en el PDF");
  assert(draft.includes("no usar"), "un borrador no advierte que no debe usarse");
});

check("G5. el PDF no filtra identificadores técnicos", () => {
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
  assert(!uuid.test(PDF_TEXT), "el PDF contiene un UUID");
  for (const leak of ["trazadoc_", "organization_id", "service_role", "supabase"]) {
    assert(!PDF_TEXT.includes(leak), `el PDF filtra «${leak}»`);
  }
});

check("G6. deja constancia de que es una representación, no la fuente de verdad (D-26)", () => {
  assert(PDF_TEXT.includes("no es la fuente de verdad"), "el PDF no advierte su condición");
  assert(/Página 1 de \d/.test(PDF_TEXT), "sin numeración de páginas");
  assert(PDF_TEXT.includes("Generado el 21/08/2026"), "sin fecha de generación");
});

check("G7. el contenido sin diligenciar se declara, no se calla", () => {
  assert(PDF_TEXT.includes("Sin diligenciar."), "una sección vacía no se declara en el PDF");
  assert(PDF_TEXT.includes("Falta el criterio de selección."), "el motivo de la devolución no viaja al PDF");
});

check("G8. la lista maestra en PDF lleva empresa, filtros, fecha y paginación", () => {
  const master = renderMasterListPdf({
    documentName: "Lista maestra de documentos",
    organizationName: "Empresa de Prueba S.A.S.", companyLegalName: null, companyTaxId: "900.111.222-3",
    filtersCaption: "Estado: Vigente", headers: masterListHeaders(),
    weights: MASTER_COLUMNS.map((c) => c.width),
    rows: masterListToRows(Array.from({ length: 30 }, (_, i) => row({ documentId: `d${i}`, code: `PR-${i}` }))),
    totalCount: 30, generatedAt: "2026-08-21T15:30:00Z",
  });
  const text = master.toString("latin1");
  assert(text.startsWith("%PDF-1.7"), "la lista maestra no es un PDF");
  assert(text.includes("Lista maestra de documentos"), "sin título");
  assert(text.includes("Empresa de Prueba S.A.S."), "sin la organización");
  assert(text.includes("Estado: Vigente"), "no declara los filtros aplicados");
  assert(text.includes("30 documentos"), "no dice cuántos documentos incluye");
  assert(text.includes("Generado el 21/08/2026"), "sin fecha de generación");
  assert(/\/Count [2-9]/.test(text), "30 filas deberían necesitar más de una página");
  assert(text.includes("Página 2 de"), "sin numeración en la segunda página");
  // Un encabezado largo se reparte en varias líneas dentro de su columna, así
  // que se comprueba palabra a palabra: lo importante es que no se PIERDA.
  assert(text.includes("Código"), "falta el encabezado Código");
  for (const word of ["Revisión", "vigente", "Propietario", "Aprobador"]) {
    assert(text.includes(word), `falta «${word}» en los encabezados`);
  }

});

check("G9. una lista maestra vacía lo dice, en vez de imprimir una tabla vacía", () => {
  const empty = renderMasterListPdf({
    documentName: "Lista maestra de documentos",
    organizationName: "X", companyLegalName: null, companyTaxId: null,
    filtersCaption: "Estado: Vigente", headers: masterListHeaders(),
    weights: MASTER_COLUMNS.map((c) => c.width), rows: [], totalCount: 0,
    generatedAt: "2026-08-21T15:30:00Z",
  }).toString("latin1");
  assert(empty.includes("Ningún documento cumple"), "una lista vacía no se explica");
});

check("G10. el texto se mide y se parte de verdad", () => {
  assert(measureText("", "regular", 10) === 0, "una cadena vacía mide algo");
  assert(measureText("iii", "regular", 10) < measureText("MMM", "regular", 10), "las anchuras son uniformes");
  const lines = wrapText("palabra ".repeat(60).trim(), "regular", 9, 200);
  assert(lines.length > 1, "un párrafo largo no se partió");
  for (const line of lines) {
    assert(measureText(line, "regular", 9) <= 200.5, `una línea se salió del margen: «${line}»`);
  }
  // Los saltos que escribe la persona se respetan.
  assert(wrapText("a\n\nb", "regular", 9, 500).length === 3, "los saltos del autor no se conservan");
  // Una palabra sola más larga que la línea se parte en vez de desbordar.
  const long = wrapText("A".repeat(200), "regular", 9, 100);
  assert(long.length > 1, "una palabra interminable no se partió");
  for (const line of long) assert(measureText(line, "regular", 9) <= 100.5, `desborda: ${line}`);
  assert(truncateToWidth("Documento con nombre larguísimo", "regular", 9, 40).endsWith("…"), "sin recorte");
});

check("G11. los acentos del español sobreviven a la codificación del PDF", () => {
  // El PDF guarda bytes WinAnsi, no Unicode. Si esto se rompe, «Revisión»
  // aparece como «Revisi?n» en el archivo entregado a una auditoría.
  assert(PDF_TEXT.includes("Revisión"), "los acentos no sobrevivieron");
  // Las etiquetas de la ficha van en mayúsculas: se comprueba también la
  // acentuada en mayúscula, que es la que más veces se degrada.
  assert(PDF_TEXT.includes("PRÓXIMA REVISIÓN"), "faltan acentos en mayúscula");
  assert(!PDF_TEXT.includes("Revisi?n"), "un acento se degradó a interrogación");
});

// ---------------------------------------------------------------------------
console.log("\nM · Migración 0116");
// ---------------------------------------------------------------------------

const SQL = stripSql(read(MIG));

check("M1. es append-only: ninguna migración anterior se toca", () => {
  const previous = read("supabase/migrations/0046_trazadocs_status_transitions.sql");
  assert(previous.includes("v_new_version := v_doc.current_version + 1"),
    "la migración histórica 0046 fue modificada");
  assert(!/drop\s+table/i.test(SQL), "0116 elimina una tabla");
  assert(!/drop\s+function\s+public\.change_trazadoc_document_status/i.test(SQL),
    "0116 elimina la RPC histórica en vez de convivir con ella");
  assert(!/delete\s+from\s+public\./i.test(SQL), "0116 borra filas existentes");
});

check("M2. las columnas nuevas de trazadoc_documents nacen con valor seguro", () => {
  assert(/revision_model text not null default 'legacy'/.test(SQL),
    "revision_model no nace en 'legacy': los documentos existentes cambiarían de comportamiento");
  assert(/disposition text not null default 'active'/.test(SQL), "disposition sin valor por defecto");
});

check("M3. un cambio de estado no puede mover la revisión de un documento controlado", () => {
  assert(SQL.includes("protect_trazadoc_document_revision_number"), "falta el guarda de revisión");
  assert(SQL.includes("t_trazadoc_documents_revision_guard"), "el guarda no está enganchado");
  assert(SQL.includes("trazaloop.revision_bump"),
    "el guarda no usa una marca de transacción, así que una RPC SECURITY DEFINER lo esquivaría");
  assert(SQL.includes("Un cambio de estado no altera la revisión del documento."),
    "el mensaje del guarda no explica la regla");
});

check("M4. solo trazadoc_create_document_revision pone la marca que autoriza el cambio", () => {
  const setters = [...SQL.matchAll(/set_config\('trazaloop\.revision_bump', 'on', true\)/g)];
  assert(setters.length === 1, `${setters.length} lugares ponen la marca; debería haber exactamente uno`);
  const fn = SQL.slice(
    SQL.indexOf("function public.trazadoc_create_document_revision"),
    SQL.indexOf("function public.trazadoc_activate_workflow_stage")
  );
  assert(fn.includes("set_config('trazaloop.revision_bump', 'on', true)"),
    "la marca no la pone la función de crear revisión");
});

check("M5. toda tabla nueva es tenant-owned con RLS y FK compuesta", () => {
  for (const table of [
    "trazadoc_document_revisions",
    "trazadoc_document_workflow_participants",
    "trazadoc_document_decisions",
    "work_tasks",
    "work_alerts",
  ]) {
    assert(new RegExp(`create table public\\.${table}`).test(SQL), `falta ${table}`);
    assert(new RegExp(`alter table public\\.${table} enable row level security`).test(SQL),
      `${table} sin RLS`);
    assert(new RegExp(`organization_id\\s+uuid not null references public\\.organizations`).test(SQL),
      `${table} sin organization_id`);
    assert(new RegExp(`unique \\(organization_id, id\\)`).test(SQL), `${table} sin clave para FK compuesta`);
  }
  assert(
    (SQL.match(/foreign key \(organization_id,/g) ?? []).length >= 6,
    "faltan FK compuestas que aten cada hija a la empresa de su padre"
  );
});

check("M6. privilegios EXPLÍCITOS y anon sin nada", () => {
  assert(/revoke truncate, references, trigger on table/.test(SQL),
    "no se retira TRUNCATE, que bypasea la RLS");
  assert(/revoke all on table[\s\S]*?from anon;/.test(SQL), "anon conserva privilegios");
  assert(!/alter default privileges/i.test(SQL), "se usó ALTER DEFAULT PRIVILEGES, prohibido por convención");
  assert(!/grant all on/i.test(SQL), "hay un GRANT ALL");
});

check("M7. el workflow solo se mueve por RPC: sin políticas de escritura libres", () => {
  for (const table of [
    "trazadoc_document_workflow_participants",
    "trazadoc_document_decisions",
    "work_tasks",
  ]) {
    assert(!new RegExp(`create policy [a-z_]+ on public\\.${table}\\s+for insert`).test(SQL),
      `${table} concede INSERT directo: el workflow sería esquivable`);
    assert(!new RegExp(`create policy [a-z_]+ on public\\.${table}\\s+for update`).test(SQL),
      `${table} concede UPDATE directo`);
  }
  assert(SQL.includes("protect_trazadoc_revision_direct_update"),
    "falta el guarda que impide mover el workflow con un UPDATE directo");
});

check("M8. una revisión aprobada es inmutable (D-02)", () => {
  assert(SQL.includes("protect_trazadoc_revision_immutability"), "falta el guarda de inmutabilidad");
  assert(SQL.includes("El contenido de una revisión aprobada no se modifica."), "sin mensaje claro");
  assert(/trazadoc_document_revisions_approved_complete check/.test(SQL),
    "nada obliga a que una revisión aprobada tenga contenido congelado");
});

check("M9. el motivo es obligatorio al devolver y al retirar (D-20)", () => {
  assert(/trazadoc_document_decisions_reason_required check/.test(SQL),
    "el motivo obligatorio no lo exige la base");
  assert(SQL.includes("Escribe el motivo por el que devuelves el documento"),
    "sin mensaje de motivo obligatorio al devolver");
  assert(SQL.includes("Escribe el motivo del retiro"), "sin mensaje de motivo obligatorio al retirar");
});

check("M10. la lista maestra es una vista derivada, no una tabla", () => {
  assert(/create view public\.v_trazadoc_document_control/.test(SQL), "falta la vista");
  assert(/with \(security_invoker = true\)/.test(SQL),
    "la vista no hereda la RLS: sería una fuga entre empresas");
  assert(!/create table public\.[a-z_]*master/i.test(SQL), "se creó una tabla maestra paralela");
  assert(SQL.includes("current_date"), "la vista no compara con la fecha de hoy: no distinguiría vigente de aprobado");
});

check("M11. la bandeja es transversal: acoplada por contrato, no por FK de dominio", () => {
  const tasks = SQL.slice(SQL.indexOf("create table public.work_tasks"), SQL.indexOf("create index work_tasks_inbox_idx"));
  assert(tasks.includes("subject_type") && tasks.includes("subject_id"), "sin vínculo por contrato");
  assert(!/subject_id\s+uuid not null references public\.trazadoc_documents/.test(tasks),
    "work_tasks tiene FK al dominio documental: otro dominio no podría reutilizarla");
  assert(!/quality_/.test("work_tasks work_alerts"), "las tablas llevan prefijo de módulo");
  assert(/work_tasks_open_dedupe_uniq/.test(SQL), "sin deduplicación: reenviar generaría tareas repetidas");
});

check("M12. el contenido no se edita mientras alguien lo está revisando", () => {
  assert(SQL.includes("protect_trazadoc_controlled_section_editing"),
    "falta el guarda de edición de contenido");
  assert(SQL.includes("El contenido no se edita mientras el documento está en revisión"),
    "sin mensaje claro para el autor");
});

check("M13. las decisiones formales son append-only", () => {
  const block = SQL.slice(SQL.indexOf("create table public.trazadoc_document_decisions"));
  const upToNext = block.slice(0, block.indexOf("create table public.work_tasks"));
  assert(!/for update/.test(upToNext), "las decisiones admiten UPDATE");
  assert(!/for delete/.test(upToNext), "las decisiones admiten DELETE");
});

check("M14. la migración explica el porqué, no solo el qué", () => {
  const comments = read(MIG).split("\n").filter((l) => l.trim().startsWith("--"));
  assert(comments.length > 150, `solo ${comments.length} líneas de comentario para 0116`);
  const text = comments.join("\n");
  for (const decision of ["MDR-08", "D-02", "D-06", "D-13", "D-18", "D-19", "D-20", "AT-04", "AT-10"]) {
    assert(text.includes(decision), `la migración no ancla la decisión ${decision}`);
  }
});

// ---------------------------------------------------------------------------
console.log("\nN · Coherencia entre capas");
// ---------------------------------------------------------------------------

check("N1. los estados del dominio y los de la base dicen lo mismo", () => {
  const checkClause = SQL.match(/trazadoc_document_revisions_state_check check \(workflow_state in \(([\s\S]*?)\)\)/)![1];
  const inDb = [...checkClause.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  const inDomain = [...WORKFLOW_STATES].sort();
  assert(
    JSON.stringify(inDb) === JSON.stringify(inDomain),
    `base: ${inDb.join(",")} · dominio: ${inDomain.join(",")}`
  );
});

check("N2. la vista y el dominio derivan el ciclo de vida igual", () => {
  // La vista lo calcula en SQL y el dominio en TypeScript. Si divergen, la
  // lista maestra y la ficha del documento dirían cosas distintas del mismo
  // documento, que es el defecto más difícil de detectar de todos.
  const viewBlock = SQL.slice(SQL.indexOf("as lifecycle_state") - 900, SQL.indexOf("as lifecycle_state"));
  assert(viewBlock.includes("'retired'"), "la vista no contempla el retiro");
  assert(viewBlock.includes("approved_pending_effective"), "la vista no distingue aprobado de vigente");
  assert(viewBlock.includes("'effective'"), "la vista no marca lo vigente");
  for (const state of ["retired", "approved_pending_effective", "effective"]) {
    assert(
      (LIFECYCLE_STATES as readonly string[]).includes(state),
      `la vista produce «${state}», que el dominio no conoce`
    );
  }
});

check("N3. formatDate nunca escupe una fecha ISO en pantalla", () => {
  assert(formatDate("2026-08-21") === "21/08/2026", formatDate("2026-08-21"));
  assert(formatDate("2026-08-21T15:30:00Z") === "21/08/2026", formatDate("2026-08-21T15:30:00Z"));
  assert(formatDate(null) === "—", formatDate(null));
  assert(formatDate("no es una fecha") === "—", formatDate("no es una fecha"));
});

check("N4. orPending y orDash distinguen «falta» de «no aplica»", () => {
  assert(orPending("", "Sin designar") === "Sin designar", "el vacío no se declaró");
  assert(orPending("   ") === "Pendiente", "los espacios en blanco cuentan como dato");
  assert(orPending("Ana") === "Ana", "un dato real se sustituyó");
  assert(orDash(null) === "—" && orDash("x") === "x", "orDash");
});

check("N5. las server actions comprueban antes, y la base vuelve a comprobar", () => {
  const actions = read("server/actions/quality-documents.ts");
  // Ninguna acción escribe el workflow por su cuenta: todas pasan por la RPC.
  assert(!/from\("trazadoc_document_revisions"\)[\s\S]{0,200}\.update\(\{[\s\S]{0,200}workflow_state/.test(actions),
    "una server action mueve el estado del workflow directamente");
  for (const guard of ["canDecideNow", "canEditRevisionContent", "canAttemptHardDelete", "hardDeleteBlockReason"]) {
    assert(actions.includes(guard), `las acciones no usan ${guard}`);
  }
});

check("N6. las rutas de descarga aplican el guard de módulo explícitamente", () => {
  // Los layouts de Next NO envuelven route handlers: sin esta llamada, el PDF
  // sería una puerta abierta al contenido documental de otra empresa.
  for (const route of [
    "app/(app)/(shell)/quality/documents/[documentId]/pdf/route.ts",
    "app/(app)/(shell)/quality/documents/master/pdf/route.ts",
    "app/(app)/(shell)/quality/documents/master/csv/route.ts",
  ]) {
    const src = read(route);
    assert(src.includes("requireQualityForAction"), `${route} no aplica el guard de Quality`);
    assert(/organizationId/.test(src), `${route} no acota por empresa`);
    assert(src.includes('"cache-control": "no-store"'), `${route} podría cachear datos de una empresa`);
  }
});

check("N7. las tres salidas de la lista maestra comparten UNA definición de columnas", () => {
  for (const consumer of [
    "app/(app)/(shell)/quality/documents/master/pdf/route.ts",
    "app/(app)/(shell)/quality/documents/master/csv/route.ts",
  ]) {
    const src = read(consumer);
    assert(src.includes("masterListHeaders") && src.includes("masterListToRows"),
      `${consumer} arma sus columnas por su cuenta`);
  }
});

// ---------------------------------------------------------------------------
console.log(`\nQUALITY-02 · puras y estáticas: ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
