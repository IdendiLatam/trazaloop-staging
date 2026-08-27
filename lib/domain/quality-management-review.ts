/**
 * Trazaloop · QUALITY-10 · El dominio de la Revisión por la Dirección.
 *
 * Puro: sin base de datos, sin red, sin React. Aquí viven los catálogos, las
 * frases que la interfaz repite donde se produce cada confusión, y las cuatro
 * o cinco funciones que convierten datos en algo que una persona entiende.
 *
 * LAS SIETE SEPARACIONES
 *
 *   REVISIÓN ≠ TABLERO · ENTRADA ≠ DECISIÓN · DATO ≠ CONCLUSIÓN
 *   DECISIÓN ≠ ACCIÓN · ACCIÓN ≠ TAREA · ACTA ≠ BITÁCORA
 *   ESTADO ACTUAL ≠ RETRATO HISTÓRICO
 *
 * Cada una tiene aquí su constante, y cada constante aparece en la pantalla
 * donde esa confusión se produce. No están para el informe: están para que
 * alguien que usa el módulo por primera vez entienda qué acaba de hacer.
 */

// ---------------------------------------------------------------------------
// La revisión (§6, §7, §12, RD-01, RD-11)
// ---------------------------------------------------------------------------

export const REVIEW_KINDS = ["full", "extraordinary", "thematic"] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  full: "Completa",
  extraordinary: "Extraordinaria",
  thematic: "Temática",
};

/** RD-01 · La frecuencia la decide la empresa. Nada aquí dice «anual». */
export const FREQUENCY_IS_CONFIGURABLE =
  "La frecuencia de la revisión la decide la empresa. Trazaloop no obliga "
  + "a que sea anual: una revisión semestral, trimestral o convocada por un "
  + "cambio de contexto es igual de legítima, y se declara al programar la "
  + "siguiente.";

export const REVIEW_STATUSES = [
  "draft", "preparing", "ready_for_review", "in_review", "closed", "cancelled",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Borrador",
  preparing: "En preparación",
  ready_for_review: "Lista para revisar",
  in_review: "En revisión",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

/** §54 · La confusión que este módulo existe para evitar. */
export const REVIEW_IS_NOT_A_DASHBOARD =
  "Un tablero dice cómo va todo AHORA. Una revisión por la dirección registra "
  + "qué miró la dirección, qué concluyó y qué decidió, en un periodo concreto. "
  + "Por eso la revisión de 2027 sigue mostrando 2027 aunque hoy sea 2029: si "
  + "mostrara el presente, dejaría de ser la prueba de que el sistema se revisó.";

/** §7 · Y la segunda, que se nota en cuanto alguien intenta usarlo. */
export const REVIEW_IS_NOT_A_MEETING =
  "La revisión no es la reunión. Se prepara durante semanas y suele terminar "
  + "en una sesión formal, que es una fecha de esta misma ficha. Obligar a que "
  + "todo nazca y muera en una reunión de dos horas tira el trabajo previo.";

/** §53 · Y la tercera, que confunde a quien viene de auditorías. */
export const REVIEW_IS_NOT_AN_AUDIT =
  "Una auditoría comprueba conformidad contra criterios. La revisión por la "
  + "dirección evalúa el sistema completo y decide sobre él. La auditoría es "
  + "una ENTRADA de la revisión, no su resultado.";

// ---------------------------------------------------------------------------
// El catálogo de entradas (§13, §14)
// ---------------------------------------------------------------------------

export const INPUT_CODES = [
  "previous_actions", "changes", "system_performance", "customer_voice",
  "objectives", "process_performance", "product_conformity",
  "nonconformities_actions", "monitoring_results", "audits",
  "supplier_performance", "resources_adequacy", "risk_action_effectiveness",
  "improvement_opportunities",
] as const;
export type InputCode = (typeof INPUT_CODES)[number];

export const INPUT_LABEL: Record<InputCode, string> = {
  previous_actions: "Estado de las acciones de revisiones anteriores",
  changes: "Cambios relevantes internos y externos",
  system_performance: "Desempeño y eficacia del sistema de gestión",
  customer_voice: "Satisfacción del cliente y retroalimentación",
  objectives: "Grado de cumplimiento de los objetivos de calidad",
  process_performance: "Desempeño de los procesos",
  product_conformity: "Conformidad de los productos y servicios",
  nonconformities_actions: "No conformidades y acciones correctivas",
  monitoring_results: "Resultados de seguimiento y medición",
  audits: "Resultados de auditorías",
  supplier_performance: "Desempeño de los proveedores externos",
  resources_adequacy: "Adecuación de los recursos",
  risk_action_effectiveness: "Eficacia de las acciones frente a riesgos y oportunidades",
  improvement_opportunities: "Oportunidades de mejora",
};

/** De qué dominio de Trazaloop sale cada una. `null` = la aporta la dirección. */
export const INPUT_SOURCE_DOMAIN: Record<InputCode, string | null> = {
  previous_actions: "QUALITY-04 · acciones",
  changes: "QUALITY-01/02 · procesos y documentos",
  system_performance: "QUALITY-10 · agregación",
  customer_voice: "QUALITY-08 · voz del cliente",
  objectives: "QUALITY-03 · objetivos",
  process_performance: "QUALITY-01 · procesos",
  product_conformity: "QUALITY-04 · casos",
  nonconformities_actions: "QUALITY-04 · casos y acciones",
  monitoring_results: "QUALITY-03 · indicadores",
  audits: "QUALITY-09 · auditorías",
  supplier_performance: "QUALITY-07 · proveedores",
  resources_adequacy: "QUALITY-06 · personas",
  risk_action_effectiveness: "QUALITY-05 · riesgos",
  improvement_opportunities: "QUALITY-05/08/09 · varias",
};

export const INPUT_MODES = ["automatic", "manual"] as const;
export type InputMode = (typeof INPUT_MODES)[number];

export const INPUT_MODE_LABEL: Record<InputMode, string> = {
  automatic: "Automática",
  manual: "Manual",
};

/** §16/§17 · Y por qué la distinción importa al leer el acta. */
export const MANUAL_INPUT_IS_DECLARED =
  "Una entrada manual la aporta una persona y así queda marcada. No se presenta "
  + "como dato del sistema: convertir cualquier texto en «evidencia objetiva» es "
  + "lo que hace que un acta no valga delante de nadie.";

export const INPUT_STATES = [
  "pending", "prepared", "reviewed", "not_applicable", "missing",
] as const;
export type InputState = (typeof INPUT_STATES)[number];

export const INPUT_STATE_LABEL: Record<InputState, string> = {
  pending: "Pendiente de mirar",
  prepared: "Preparada",
  reviewed: "Revisada",
  not_applicable: "No aplica",
  missing: "Sin datos en el periodo",
};

/** §35/§36 · Las dos frases que impiden los dos errores clásicos. */
export const MISSING_IS_NOT_ZERO =
  "«Sin datos» significa que se comprobó y no había medición en el periodo. NO "
  + "significa cero. Escribir «satisfacción = 0» donde no hubo campaña afirma "
  + "un mal resultado que nadie midió.";

export const NOT_APPLICABLE_IS_NOT_MISSING =
  "«No aplica» es una decisión con razón escrita: alguien miró y resolvió que "
  + "esa entrada no corresponde a esta empresa o a este periodo. «Sin "
  + "datos» es haber mirado y no encontrar. «Pendiente» es no haber mirado.";

/** §36 · Una entrada faltante SÍ está revisada; una pendiente, no. */
export function isInputAttended(state: InputState): boolean {
  return state === "prepared" || state === "reviewed"
    || state === "missing" || state === "not_applicable";
}

// ---------------------------------------------------------------------------
// Entradas manuales (§17, §30, §31)
// ---------------------------------------------------------------------------

export const MANUAL_ENTRY_KINDS = [
  "change_internal", "change_external", "regulatory", "strategic",
  "resource_need", "improvement_opportunity", "context", "other",
] as const;
export type ManualEntryKind = (typeof MANUAL_ENTRY_KINDS)[number];

export const MANUAL_ENTRY_KIND_LABEL: Record<ManualEntryKind, string> = {
  change_internal: "Cambio interno",
  change_external: "Cambio externo",
  regulatory: "Cambio regulatorio",
  strategic: "Decisión estratégica de la empresa",
  resource_need: "Necesidad de recursos",
  improvement_opportunity: "Oportunidad de mejora",
  context: "Contexto de la empresa",
  other: "Otro",
};

export const RESOURCE_KINDS = [
  "people", "infrastructure", "technology", "budget", "knowledge", "capacity",
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  people: "Personas",
  infrastructure: "Infraestructura",
  technology: "Tecnología",
  budget: "Presupuesto",
  knowledge: "Conocimiento",
  capacity: "Capacidad",
};

/** §30 · Lo que la adecuación de recursos NO es. */
export const RESOURCES_ARE_JUDGED_NOT_CALCULATED =
  "La plataforma cuenta personas, cargos vacantes, brechas de competencia y "
  + "conocimientos críticos. Si esos recursos son SUFICIENTES lo juzga la "
  + "dirección: no hay ninguna fórmula que convierta «doce personas» en "
  + "«bastantes». Y no se construye un módulo financiero para tenerla.";

// ---------------------------------------------------------------------------
// Participantes (§9, §69, §70)
// ---------------------------------------------------------------------------

export const PARTICIPATION_ROLES = [
  "chair", "secretary", "member", "guest", "invited_expert",
] as const;
export type ParticipationRole = (typeof PARTICIPATION_ROLES)[number];

export const PARTICIPATION_ROLE_LABEL: Record<ParticipationRole, string> = {
  chair: "Preside",
  secretary: "Secretaría",
  member: "Miembro",
  guest: "Invitado",
  invited_expert: "Experto invitado",
};

/** §9 · La distinción que evita que una lista de asistencia parezca una firma. */
export const ATTENDANCE_IS_NOT_APPROVAL =
  "Haber asistido no es haber aprobado. La lista de participantes dice quién "
  + "estuvo; quién cerró la revisión es otro dato, con su propio nombre y su "
  + "propia fecha.";

/** §69/§70 · Por qué el cargo se copia en vez de resolverse al leer. */
export const PARTICIPANT_HISTORY_IS_FROZEN =
  "Quien participó en la revisión de 2027 sigue apareciendo en ella —con el "
  + "cargo que ocupaba entonces— aunque hoy tenga otro puesto o haya dejado la "
  + "empresa. Resolver el cargo al leer haría que un acta de 2027 mostrara "
  + "la estructura de 2029.";

// ---------------------------------------------------------------------------
// Decisiones y salidas (§39, §40, §41, RD-06, RD-13)
// ---------------------------------------------------------------------------

export const DECISION_KINDS = [
  "improvement", "system_change", "resource", "strategic",
  "objective", "risk", "opportunity", "followup", "other",
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

export const DECISION_KIND_LABEL: Record<DecisionKind, string> = {
  improvement: "Oportunidad de mejora",
  system_change: "Cambio en el sistema de gestión",
  resource: "Necesidad de recursos",
  strategic: "Decisión estratégica del sistema",
  objective: "Objetivo",
  risk: "Riesgo",
  opportunity: "Oportunidad",
  followup: "Seguimiento",
  other: "Otra",
};

/** §41/§82 · La separación más fácil de romper de todo el dominio. */
export const DECISION_IS_NOT_AN_ACTION =
  "«Aumentar la capacidad de inspección del proveedor crítico» es UNA decisión. "
  + "Comprar el equipo, capacitar al inspector y actualizar el procedimiento "
  + "son TRES acciones. Registrar la decisión no crea ninguna acción, y crear "
  + "tres acciones no convierte la decisión en tres decisiones.";

/** §41 · Y una decisión puede no producir ninguna acción, legítimamente. */
export const DECISION_MAY_HAVE_NO_ACTIONS =
  "Una decisión puede vivir sin acciones: «se acepta el nivel actual y se "
  + "mantiene el control» es una decisión completa. Forzar una acción por "
  + "decisión llenaría el motor de trabajo de tareas que nadie pidió.";

/** Registrar una decisión NUNCA crea una acción. Nunca. */
export function decisionCreatesAction(_kind: DecisionKind): false {
  return false;
}

/** §41 · «1 decisión · 2 acciones» — la frase que lo hace visible. */
export function describeDecisionOutcome(d: {
  actionCount: number; openActionCount: number; effectiveActionCount: number;
}): string {
  if (d.actionCount === 0) {
    return "Sin acciones. Una decisión puede no necesitarlas.";
  }
  const partes = [d.actionCount === 1 ? "1 acción" : `${d.actionCount} acciones`];
  if (d.openActionCount > 0) partes.push(`${d.openActionCount} abierta(s)`);
  if (d.effectiveActionCount > 0) partes.push(`${d.effectiveActionCount} eficaz(ces)`);
  return partes.join(" · ") + ".";
}

// ---------------------------------------------------------------------------
// Preparación, frescura y estado de listo (§34, §55, §56, §57)
// ---------------------------------------------------------------------------

/** §55/RD-03/RD-09 · Por qué la plataforma prepara y no pide teclear. */
export const PREPARATION_IS_REAL_WORK =
  "La plataforma reúne las catorce entradas leyendo lo que ya está en el "
  + "sistema: objetivos, indicadores, casos, riesgos, proveedores, clientes y "
  + "auditorías. Volver a teclear a mano un número que ya existe es la forma "
  + "más rápida de que la revisión mienta sin que nadie lo note.";

/** §43/§55 · La promesa que hace que refrescar sea seguro. */
export const REFRESH_KEEPS_ANALYSIS =
  "Refrescar una entrada actualiza el dato y deja intacto lo que ya escribiste. "
  + "Un refresco que borrara el análisis enseñaría a no refrescar nunca — y "
  + "entonces la revisión se cerraría con datos viejos.";

/** §56/§85 · Y la que hace que no refrescar tampoco sea un riesgo silencioso. */
export const SOURCE_UPDATED_IS_ANNOUNCED =
  "Si la fuente cambió después de preparar la entrada, se avisa: FUENTE "
  + "ACTUALIZADA. No se sustituye sola. Cambiar por debajo un retrato que "
  + "alguien ya revisó es peor que dejarlo viejo, porque nadie se entera.";

export type Readiness = {
  requiredInputs: number;
  ready: number;
  missing: number;
  notApplicable: number;
  requiresManualReview: number;
  pending: number;
  withoutAnalysis: number;
  isReady: boolean;
};

/**
 * §34 · La frase de preparación. NO dice «100 % listo» si falta algo: un
 * indicador que siempre dice que sí solo enseña a ignorarlo.
 */
export function describeReadiness(r: Readiness): string {
  if (r.pending > 0 || r.requiresManualReview > 0) {
    const partes: string[] = [];
    if (r.pending > 0) partes.push(`${r.pending} entrada(s) sin preparar`);
    if (r.requiresManualReview > 0) {
      partes.push(`${r.requiresManualReview} esperan aportación de la dirección`);
    }
    return `Todavía no está lista: ${partes.join(" y ")}.`;
  }
  if (r.withoutAnalysis > 0) {
    return `Las entradas están preparadas, pero ${r.withoutAnalysis} sigue(n) sin `
      + "análisis. El dato no es la conclusión.";
  }
  return `Lista: ${r.ready} entrada(s) revisadas, ${r.missing} sin datos en el `
    + `periodo y ${r.notApplicable} no aplicables.`;
}

/** §34 · Y el detalle, para que «no está lista» no sea un misterio. */
export function readinessBreakdown(r: Readiness): string[] {
  return [
    `${r.ready} preparada(s) o revisada(s)`,
    `${r.missing} sin datos en el periodo — que no es cero`,
    `${r.notApplicable} marcada(s) como no aplicable, con razón`,
    `${r.requiresManualReview} esperando aportación manual`,
    `${r.pending} sin mirar`,
  ];
}

// ---------------------------------------------------------------------------
// Cierre, seguimiento y verdad histórica (§45, §48, §49, §84)
// ---------------------------------------------------------------------------

/** §48/§83 · Qué exige el cierre y qué NO exige. */
export const CLOSING_DOES_NOT_CLOSE_ACTIONS =
  "Cerrar la revisión por la dirección no cierra las acciones que decidió. "
  + "Cerrar exige que las entradas se hayan mirado, que haya análisis y que "
  + "haya al menos una decisión. Exigir además que todas las acciones estén "
  + "terminadas produce revisiones abiertas durante años por una acción de nadie.";

/** §45/§84 · Las dos capas, dichas donde se ven a la vez. */
export const MINUTES_ARE_FROZEN_FOLLOWUP_IS_LIVE =
  "El acta es una foto: dice lo que la dirección revisó y decidió aquel día. El "
  + "seguimiento es lo contrario: se lee ahora, del motor de acciones. Que una "
  + "acción pase a completada y luego a eficaz se ve en el seguimiento y no "
  + "cambia ni una letra del acta.";

/** §49 · Y qué queda congelado al cerrar. */
export const CLOSED_REVIEW_IS_IMMUTABLE =
  "Después de cerrar no se modifican en silencio el periodo, el retrato de las "
  + "entradas, el análisis, las decisiones, los participantes ni las "
  + "conclusiones. Si hay que corregir algo, se emite un acta que corrija a la "
  + "anterior — y las dos se conservan.";

/** §47 · Reabrir, cuando de verdad hace falta. */
export const REOPEN_IS_EXCEPTIONAL =
  "Reabrir una revisión cerrada es excepcional y exige decir por qué con "
  + "detalle. No borra el cierre anterior: lo cuenta. La vía preferente es "
  + "emitir un acta que corrija a la anterior, que no obliga a tocar nada.";

export type FollowUp = {
  decisions: number; actions: number; open: number; completed: number;
  overdue: number; effective: number; notEffective: number;
  effectivenessPending: number;
};

/** §45 · Cómo lo diría una persona. */
export function describeFollowUp(f: FollowUp): string {
  if (f.decisions === 0) return "Esta revisión todavía no ha registrado decisiones.";
  if (f.actions === 0) {
    return `${f.decisions} decisión(es) y ninguna acción todavía. Una decisión `
      + "puede no necesitarlas.";
  }
  const partes = [`${f.decisions} decisión(es) · ${f.actions} acción(es)`];
  if (f.open > 0) partes.push(`${f.open} abierta(s)`);
  if (f.overdue > 0) partes.push(`${f.overdue} vencida(s)`);
  if (f.effective > 0) partes.push(`${f.effective} eficaz(ces)`);
  if (f.notEffective > 0) partes.push(`${f.notEffective} no eficaz(ces)`);
  return partes.join(" · ") + ".";
}

// ---------------------------------------------------------------------------
// Linaje y explicabilidad (§58, §59, §60)
// ---------------------------------------------------------------------------

export type Lineage = { domain: string; entity: string; filter?: string; via?: string; note?: string };

/** §58 · Ningún número mágico. */
export const NO_MAGIC_NUMBERS =
  "Cada número de esta revisión sabe de dónde vino: de qué dominio, de qué "
  + "entidad y de qué periodo. Un dato sin origen no se puede discutir en una "
  + "reunión, y tampoco se puede defender delante de un auditor.";

/** §58 · Convierte el linaje guardado en frases legibles. */
export function describeLineage(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r): string[] => {
    if (r === null || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const dominio = typeof o.domain === "string" ? o.domain : null;
    const entidad = typeof o.entity === "string" ? o.entity : null;
    if (!dominio || !entidad) return [];
    const extra = [o.filter, o.via, o.note]
      .filter((x): x is string => typeof x === "string" && x.length > 0);
    return [`${dominio} → ${entidad}${extra.length > 0 ? ` · ${extra.join(" · ")}` : ""}`];
  });
}

/** §36 · ¿El retrato trae dato, o solo dice que no había? */
export function snapshotIsAvailable(snapshot: unknown): boolean {
  if (snapshot === null || typeof snapshot !== "object") return false;
  return (snapshot as Record<string, unknown>).available === true;
}

// ---------------------------------------------------------------------------
// Privacidad (§61, §62, §63, §64)
// ---------------------------------------------------------------------------

/** §63 · La promesa que este dominio no puede romper. */
export const CUSTOMER_ANONYMITY_HOLDS =
  "La entrada de voz del cliente publica SIEMPRE agregados: métricas de "
  + "campaña, conteos de manifestaciones y tendencias. No lee respuestas "
  + "individuales, ni invitaciones, ni contactos. No hay ninguna vía por la que "
  + "la identidad de quien respondió una encuesta anónima llegue hasta aquí.";

/** §62 · Y la de las personas. */
export const PEOPLE_DATA_IS_AGGREGATED =
  "La entrada de recursos devuelve cuántos, no quiénes: tres evaluaciones "
  + "pendientes, dos brechas de competencia obligatoria. La revisión por la "
  + "dirección no es una evaluación de empleados, y los nombres siguen detrás "
  + "de los permisos de Personas.";

/** §64 · Y la de las auditorías. */
export const AUDIT_NOTES_STAY_IN_AUDITS =
  "De las auditorías entran resultados formales: cobertura, hallazgos, "
  + "escaladas y seguimientos. No entran las notas de entrevista, que están "
  + "restringidas a quien audita y ahí se quedan.";

/** §61 · Agregado ≠ acceso al detalle. */
export const SUMMARY_IS_NOT_RAW_ACCESS =
  "Ver un agregado en la revisión no concede acceso al detalle. Los enlaces de "
  + "profundización llevan a la ficha del dominio de origen, y allí decide la "
  + "política de ese dominio: quien no podía verla antes, sigue sin poder.";

// ---------------------------------------------------------------------------
// Inteligencia artificial (§93, RD-10)
// ---------------------------------------------------------------------------

/** RD-10 · Lo que la IA NO hace, dicho antes de que exista. */
export const AI_DOES_NOT_DECIDE =
  "Trazaloop no usa inteligencia artificial para concluir, decidir, crear "
  + "acciones ni aprobar actas en una revisión por la dirección. Todo lo que "
  + "esta pantalla resume sale de consultas deterministas sobre datos reales, y "
  + "todo lo que concluye lo escribe una persona.";

/** Ninguna función de este dominio invoca modelo alguno. */
export function aiConcludes(): false {
  return false;
}

// ---------------------------------------------------------------------------
// Roles (§66)
// ---------------------------------------------------------------------------

export function canReadManagementReview(roleCode: string): boolean {
  return roleCode.length > 0;
}

export function canManageManagementReview(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality" || roleCode === "consultant";
}

/** Cerrar y emitir el acta es un acto de la EMPRESA sobre sí misma. */
export function canCloseManagementReview(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality";
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatRange(from: string | null, to: string | null): string {
  if (!from && !to) return "Sin fechas";
  if (from && to) return `${formatDate(from)} — ${formatDate(to)}`;
  return formatDate(from ?? to);
}

/** El periodo, como lo diría alguien: «2027» o «01/01/2027 — 31/12/2027». */
export function describePeriod(label: string, from: string, to: string): string {
  return `${label} · ${formatDate(from)} — ${formatDate(to)}`;
}
