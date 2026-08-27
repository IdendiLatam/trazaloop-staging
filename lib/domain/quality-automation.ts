/**
 * Trazaloop · QUALITY-11 · El dominio de la Automatización y la Observación.
 *
 * Puro: sin base de datos, sin red, sin React. Aquí viven los catálogos, las
 * frases que la interfaz repite donde se produce cada confusión, y la
 * semántica de los operadores — la misma que aplica el evaluador de 0129, en
 * castellano y comprobable sin base de datos.
 *
 * LAS SIETE SEPARACIONES
 *
 *   EVENTO ≠ OBSERVACIÓN · OBSERVACIÓN ≠ SEÑAL · SEÑAL ≠ ALERTA
 *   ALERTA ≠ TAREA · TAREA ≠ ACCIÓN · CONDICIÓN ≠ DECISIÓN
 *   AUTOMATIZACIÓN DETERMINÍSTICA ≠ IA
 *
 * Cada una tiene aquí su constante, y cada constante aparece en la pantalla
 * donde esa confusión se produce.
 */

// ---------------------------------------------------------------------------
// Las separaciones (§5, §8, §10, §13, §15, §16, §17)
// ---------------------------------------------------------------------------

/** §10 · La distinción que obliga a tener DOS caminos y no uno. */
export const EVENT_IS_NOT_STATE =
  "Un evento dice «el certificado venció el 12 de marzo». Un estado dice «el "
  + "certificado está vencido». Son cosas distintas: lo primero ocurre una vez "
  + "y queda escrito; lo segundo sigue siendo cierto cada día hasta que alguien "
  + "lo arregla. Por eso hay dos caminos — reaccionar a lo que pasó, y observar "
  + "lo que sigue pasando.";

/** §13 · Observar no es señalar. */
export const OBSERVATION_IS_NOT_A_SIGNAL =
  "Observar es evaluar una condición sobre un sujeto: la mayoría de las veces "
  + "el resultado es «no». La señal es lo que queda cuando el resultado es «sí» "
  + "y merece la atención de alguien. Guardar los miles de «no» no explicaría "
  + "nada y costaría lo mismo que los «sí».";

/** §15 · La señal es el hecho; la alerta es el aviso. */
export const SIGNAL_IS_NOT_AN_ALERT =
  "La señal es el hecho detectado, con su explicación y su historia. La alerta "
  + "es el mecanismo por el que una persona se entera. Descartar la alerta no "
  + "borra el hecho: la condición sigue ahí hasta que se resuelva.";

/** §16 · Mirar no es hacer. */
export const ALERT_IS_NOT_A_TASK =
  "Una alerta dice «mira esto». Una tarea dice «haz esto». No toda alerta "
  + "necesita tarea: avisar a quien decide no es lo mismo que asignarle "
  + "trabajo, y crear una tarea por cada aviso llena la bandeja de cosas que "
  + "nadie pidió.";

/** §17 · La separación que QUALITY-04 defiende y esta capa no puede romper. */
export const TASK_IS_NOT_AN_ACTION =
  "La tarea es trabajo operativo. La acción es un objeto formal del sistema de "
  + "gestión, con su causa, su eficacia y su cierre. Una automatización puede "
  + "crear tareas; ninguna crea acciones correctivas.";

/** §19 · La frontera dura, que además existe en la base. */
export const CONDITION_IS_NOT_A_DECISION =
  "Que una condición se cumpla no decide nada. Ninguna regla declara una no "
  + "conformidad, aprueba o suspende un proveedor, declara competente a una "
  + "persona, acepta un riesgo residual, da una acción por eficaz, cierra una "
  + "auditoría ni cierra una revisión por la dirección. Eso lo hace una persona, "
  + "en su dominio, con su nombre.";

/** §7 · Y la que separa este sprint de QUALITY-12. */
export const AUTOMATION_IS_NOT_AI =
  "Esto no es inteligencia artificial. Una regla tiene condiciones explícitas, "
  + "operadores explícitos y salidas explícitas: los mismos datos producen "
  + "siempre el mismo resultado y la misma explicación. No hay modelos, ni "
  + "embeddings, ni prompts. Cuando la plataforma tenga IA, será otra capa y se "
  + "distinguirá de esta.";

/** §12 · Qué significa «Quality by Observation», y qué no. */
export const QUALITY_BY_OBSERVATION =
  "Trazaloop mira lo que ya está registrado y detecta condiciones que merecen "
  + "atención: un indicador que se deteriora, un certificado que caduca, un "
  + "proveedor crítico con la reevaluación vencida. Lo que NO hace es decidir "
  + "qué hacer con ellas.";

// ---------------------------------------------------------------------------
// Fuentes y dominios (§27)
// ---------------------------------------------------------------------------

export const AUTOMATION_DOMAINS = [
  "documents", "indicators", "objectives", "cases", "actions", "risks",
  "people", "suppliers", "customer", "audits", "management_review",
  "cross_domain",
] as const;
export type AutomationDomain = (typeof AUTOMATION_DOMAINS)[number];

export const AUTOMATION_DOMAIN_LABEL: Record<AutomationDomain, string> = {
  documents: "Documentos",
  indicators: "Indicadores",
  objectives: "Objetivos",
  cases: "Casos",
  actions: "Acciones",
  risks: "Riesgos y oportunidades",
  people: "Personas",
  suppliers: "Proveedores",
  customer: "Voz del cliente",
  audits: "Auditorías",
  management_review: "Revisión por la dirección",
  cross_domain: "Transversal",
};

// ---------------------------------------------------------------------------
// Operadores (§26)
// ---------------------------------------------------------------------------

export const OPERATORS = [
  "equals", "not_equals", "greater_than", "less_than", "gte", "lte",
  "in", "not_in", "is_empty", "is_not_empty",
  "days_before", "days_after", "consecutive_count", "strictly_decreasing",
] as const;
export type Operator = (typeof OPERATORS)[number];

export const OPERATOR_LABEL: Record<Operator, string> = {
  equals: "es igual a",
  not_equals: "no es igual a",
  greater_than: "es mayor que",
  less_than: "es menor que",
  gte: "es al menos",
  lte: "no pasa de",
  in: "está entre",
  not_in: "no está entre",
  is_empty: "está sin dato",
  is_not_empty: "tiene dato",
  days_before: "vence dentro de (días)",
  days_after: "pasó hace (días o más)",
  consecutive_count: "se repite (periodos seguidos)",
  strictly_decreasing: "baja (periodos seguidos)",
};

/** §26 · Qué significa exactamente cada uno. Sin esto, «vence dentro de 30» se
 *  puede leer de tres maneras distintas y dos de ellas son incorrectas. */
export const OPERATOR_SEMANTICS: Record<Operator, string> = {
  equals: "El valor coincide exactamente.",
  not_equals: "El valor no coincide, incluido el caso de estar sin dato.",
  greater_than: "Solo con dato numérico. Sin dato no dispara.",
  less_than: "Solo con dato numérico. Sin dato no dispara.",
  gte: "Mayor o igual. Sin dato no dispara.",
  lte: "Menor o igual. Sin dato no dispara.",
  in: "El valor está en la lista.",
  not_in: "El valor no está en la lista. Sin dato cuenta como «no está».",
  is_empty: "No hay dato registrado.",
  is_not_empty: "Hay dato registrado, sea el que sea.",
  days_before:
    "La fecha TODAVÍA NO ha llegado y falta ese número de días o menos. Una "
    + "fecha ya pasada no dispara este operador: para eso está el siguiente.",
  days_after:
    "La fecha YA pasó hace ese número de días o más. Con 0, incluye lo que "
    + "vence hoy.",
  consecutive_count:
    "Los últimos N periodos de la serie, todos ciertos y seguidos. Si en medio "
    + "hay uno falso, la cuenta vuelve a empezar.",
  strictly_decreasing:
    "Los últimos N valores bajan uno tras otro, cada uno estrictamente menor "
    + "que el anterior. Es aritmética, no una predicción.",
};

/** Los operadores que necesitan un número entero de días o de periodos. */
export const INTEGER_OPERATORS: readonly Operator[] = [
  "days_before", "days_after", "consecutive_count", "strictly_decreasing",
];

/** Los que no llevan valor. */
export const VALUELESS_OPERATORS: readonly Operator[] = ["is_empty", "is_not_empty"];

/** Los que llevan una lista. */
export const LIST_OPERATORS: readonly Operator[] = ["in", "not_in"];

// ---------------------------------------------------------------------------
// Salidas (§110, §111, §112)
// ---------------------------------------------------------------------------

export const OUTPUT_KINDS = ["CREATE_SIGNAL", "CREATE_ALERT", "CREATE_TASK"] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export const OUTPUT_KIND_LABEL: Record<OutputKind, string> = {
  CREATE_SIGNAL: "Emitir una señal",
  CREATE_ALERT: "Avisar a un cargo",
  CREATE_TASK: "Crear una tarea",
};

/** §110/§111/§112 · Lo que NUNCA será una salida, dicho antes de que a nadie
 *  se le ocurra pedirlo. */
export const FORBIDDEN_OUTPUTS =
  "Una regla solo puede emitir una señal, avisar a un cargo o crear una tarea. "
  + "No puede ejecutar SQL, ni llamar a una URL, ni enviar correo arbitrario, ni "
  + "crear una no conformidad, ni pedirle nada a una inteligencia artificial. El "
  + "catálogo de salidas está cerrado en la base, no en la pantalla.";

export const RECIPIENT_KINDS = [
  "rule_owner_position", "subject_owner_position", "specific_position",
] as const;
export type RecipientKind = (typeof RECIPIENT_KINDS)[number];

export const RECIPIENT_KIND_LABEL: Record<RecipientKind, string> = {
  rule_owner_position: "El cargo responsable de la regla",
  subject_owner_position: "El cargo responsable del objeto observado",
  specific_position: "Un cargo concreto",
};

/** §32/§33/§34 · Cómo se resuelve, y qué pasa cuando no se puede. */
export const RECIPIENT_IS_STRUCTURAL =
  "El destinatario es un CARGO, no un correo. Se resuelve en el momento de "
  + "ejecutar, con quien lo ocupa ese día. Si lo ocupan varias personas, se "
  + "avisa a todas: elegir la primera sería decidir por la empresa. Y si no "
  + "lo ocupa nadie con cuenta, la señal existe igual y lo dice.";

// ---------------------------------------------------------------------------
// Reglas, versiones y autonomía (§18, §20…§24, AT-06)
// ---------------------------------------------------------------------------

export const RULE_STATUSES = ["draft", "active", "inactive", "retired"] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const RULE_STATUS_LABEL: Record<RuleStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  inactive: "Desactivada",
  retired: "Retirada",
};

export const VERSION_STATUSES = ["draft", "published", "superseded"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
  superseded: "Sustituida",
};

/** AT-06 · Los cuatro niveles, tal como la arquitectura los congeló. */
export const AUTONOMY_LEVELS = ["A", "B", "C", "D"] as const;
export type AutonomyLevel = (typeof AUTONOMY_LEVELS)[number];

export const AUTONOMY_LEVEL_LABEL: Record<AutonomyLevel, string> = {
  A: "A · Observar y avisar",
  B: "B · Automático y reversible",
  C: "C · Preparar para revisión humana",
  D: "D · Decisión humana obligatoria",
};

export const AUTONOMY_LEVEL_MEANING: Record<AutonomyLevel, string> = {
  A: "La plataforma mira y avisa. No cambia nada.",
  B: "La plataforma hace algo que se puede deshacer, y queda registrado quién "
     + "lo hizo y cuándo.",
  C: "La plataforma prepara el trabajo y lo deja listo; quien decide es una "
     + "persona.",
  D: "Nada se hace solo: la regla existe para recordar que hay que decidir.",
};

/** §18/§19 · Lo que ningún nivel autoriza. */
export const NO_LEVEL_DECIDES =
  "Ningún nivel de autonomía permite tomar una decisión formal del sistema de "
  + "gestión. QUALITY-11 emite señales, avisos y tareas — nada más. Los niveles "
  + "C y D existen para que una regla pueda DECLARAR que lo suyo lo decide una "
  + "persona, no para que el motor lo decida por ella.";

/** §21/§145 · Por qué las versiones importan tanto. */
export const VERSION_IS_FROZEN =
  "Una versión publicada no se reescribe. Si la regla avisaba a 30 días y ahora "
  + "tiene que avisar a 45, eso es una versión nueva — y la señal que emitió la "
  + "primera sigue diciendo 30 para siempre. Reescribirla haría imposible "
  + "explicar por qué saltó aquel día.";

/** §23 · Y la diferencia que casi nadie modela. */
export const PUBLISHED_IS_NOT_ACTIVE =
  "Publicada no es lo mismo que vigente. Una versión puede publicarse hoy y "
  + "entrar en vigor el mes que viene: hasta entonces no se evalúa.";

/** §24 · Desactivar no borra. */
export const DEACTIVATION_KEEPS_HISTORY =
  "Desactivar una regla deja de evaluarla. No borra sus ejecuciones, ni sus "
  + "señales, ni las alertas o tareas que produjo: lo que ya observó, observado "
  + "queda.";

// ---------------------------------------------------------------------------
// Señales (§35…§41)
// ---------------------------------------------------------------------------

export const SIGNAL_STATUSES = [
  "open", "acknowledged", "in_treatment", "resolved", "dismissed", "suppressed",
] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

export const SIGNAL_STATUS_LABEL: Record<SignalStatus, string> = {
  open: "Abierta",
  acknowledged: "Reconocida",
  in_treatment: "En tratamiento",
  resolved: "Resuelta",
  dismissed: "Descartada",
  suppressed: "Silenciada",
};

export const SEVERITIES = ["info", "warning", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Informativa",
  warning: "Atención",
  critical: "Crítica",
};

/** §40 · La severidad la decide la regla, no una heurística. */
export const SEVERITY_IS_DECLARED =
  "La severidad la fija la regla al escribirse. La plataforma no deduce que "
  + "«todo lo vencido es crítico»: en una empresa un certificado vencido "
  + "detiene la producción y en otra se renueva por correo en una tarde.";

/** §39 · Las dos cosas que se confunden a diario. */
export const ACKNOWLEDGE_IS_NOT_RESOLVE =
  "«Lo vi» no es «lo resolví». Reconocer una señal deja constancia de que "
  + "alguien la miró; la condición sigue ahí hasta que se resuelva o deje de "
  + "cumplirse.";

/** §35/§36 · Idempotencia y rearme, dichos juntos porque son la misma decisión. */
export const IDEMPOTENT_AND_REARMS =
  "Mientras la condición siga cumpliéndose, la señal es UNA: el barrido de "
  + "mañana la actualiza, no la duplica. Y cuando la condición se resuelve y "
  + "vuelve a aparecer meses después, nace una señal nueva — porque es un hecho "
  + "nuevo, no el mismo de antes.";

/** §38 · La resolución automática, y sus límites. */
export const AUTO_RESOLUTION_LIMITS =
  "Cuando la condición deja de cumplirse, la señal se resuelve sola y lo dice. "
  + "Eso NO cierra la tarea que se creó, y desde luego no cierra ninguna acción: "
  + "son objetos de otro dueño, con su propio cierre.";

/** §80 · Silenciar sin esconder. */
export const SUPPRESSION_IS_NOT_RESOLUTION =
  "Silenciar evita el ruido, no el problema. Queda escrito quién lo silenció, "
  + "por qué y hasta cuándo — y la condición sigue existiendo debajo.";

// ---------------------------------------------------------------------------
// Ejecuciones (§43, §44, §45, §72)
// ---------------------------------------------------------------------------

export const RUN_KINDS = ["manual", "scheduled", "simulation"] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export const RUN_KIND_LABEL: Record<RunKind, string> = {
  manual: "Manual",
  scheduled: "Programada",
  simulation: "Simulación",
};

export const RUN_STATUSES = ["running", "success", "partial", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  running: "En curso",
  success: "Correcta",
  partial: "Con fallos parciales",
  failed: "Fallida",
};

/** §44 · La lección de QUALITY-09, aprendida antes de repetirla. */
export const RUN_COUNTS_WHAT_IT_CREATED =
  "Lo que una ejecución informa es lo que ha CREADO en esa pasada, no cuántos "
  + "objetos existen. La diferencia importa: si informara el total, la segunda "
  + "pasada seguida diría que creó cosas y nadie se enteraría de que no.";

/** §45 · Aislar el fallo. */
export const FAILURE_IS_ISOLATED =
  "Una regla defectuosa falla ella sola: queda registrada con su mensaje y el "
  + "barrido sigue con las demás. Lo que no hace es emitir salidas a medias.";

/** §72/§144 · La promesa de la simulación, comprobable. */
export const SIMULATION_CREATES_NOTHING =
  "Una simulación cuenta a cuántos sujetos alcanzaría la regla hoy y se detiene "
  + "ahí: cero señales, cero alertas, cero tareas. Lo garantiza una restricción "
  + "de la base, no la buena fe del código.";

/** §106/§107 · Un solo motor. */
export const ONE_ENGINE =
  "El barrido programado, la ejecución manual y la simulación son la MISMA "
  + "función con otro modo. Una simulación que no compartiera código con la "
  + "ejecución real dejaría de simular y pasaría a prometer.";

/** §84/§86 · Por qué los bucles son imposibles. */
export const LOOPS_ARE_IMPOSSIBLE =
  "Ninguna fuente observable es una salida de la automatización: no se pueden "
  + "observar tareas, ni alertas, ni señales. Una regla no puede reaccionar a lo "
  + "que otra regla produjo, así que la cadena tiene un solo eslabón por "
  + "construcción — no por un límite de recursión que alguien pueda subir.";

// ---------------------------------------------------------------------------
// Reloj y zona horaria (§47, §48)
// ---------------------------------------------------------------------------

export const CLOCK_IS_SERVER_SIDE =
  "El reloj es del servidor. El navegador no decide qué venció: si lo hiciera, "
  + "cambiar la hora del ordenador cambiaría lo que la plataforma observa.";

export const BUSINESS_DAY_IS_LOCAL =
  "«Vence hoy» se resuelve en la zona horaria de la empresa, no en UTC. Sin "
  + "esto, media plataforma recibiría el aviso un día antes o un día después de "
  + "lo que su calendario dice.";

// ---------------------------------------------------------------------------
// Privacidad (§91, §92, §93)
// ---------------------------------------------------------------------------

/** §92 · La promesa que esta capa no puede romper. */
export const CUSTOMER_ANONYMITY_HOLDS =
  "Una regla puede observar que el NPS bajó cinco puntos o que hay cinco quejas "
  + "sin revisar. Lo que no puede es saber quién respondió una encuesta anónima: "
  + "no hay ninguna fuente que lea respuestas, invitaciones ni contactos, y en la "
  + "señal no se guarda ninguna identidad.";

/** §93 · Y la que protege a las personas. */
export const NO_EMPLOYEE_SURVEILLANCE =
  "Las reglas sobre personas miran objetos del sistema de gestión: una evidencia "
  + "de competencia que caduca, una evaluación pendiente, un conocimiento crítico "
  + "con un solo poseedor. No hay puntuaciones de empleado, ni rankings, ni "
  + "señales disciplinarias. La automatización observa el sistema, no a la gente "
  + "(AT-45).";

/** §42/§91 · El retrato mínimo. */
export const SNAPSHOT_IS_MINIMAL =
  "La señal guarda solo los campos que la regla miró — lo justo para poder "
  + "explicar por qué saltó. No una copia de la entidad, ni datos que nadie "
  + "necesita para entenderla.";

// ---------------------------------------------------------------------------
// Funciones puras
// ---------------------------------------------------------------------------

export type Condition = { field: string; operator: Operator; value?: unknown };
export type Output = {
  kind: OutputKind;
  recipientKind?: RecipientKind;
  positionId?: string;
  taskTitle?: string;
  dueInDays?: number;
};

/** Ninguna regla, de ningún nivel, crea una acción correctiva. */
export function ruleCreatesAction(_level: AutonomyLevel): false {
  return false;
}

/** Ninguna regla toma una decisión formal. Tampoco la de nivel D. */
export function ruleMakesFormalDecision(_level: AutonomyLevel): false {
  return false;
}

/** Y no hay IA en ninguna parte de esta capa. */
export function usesArtificialIntelligence(): false {
  return false;
}

/** §144 · Lo que una simulación produce, siempre. */
export function simulationOutputs(): { signals: 0; alerts: 0; tasks: 0 } {
  return { signals: 0, alerts: 0, tasks: 0 };
}

/** §26 · ¿Este operador necesita valor, y de qué forma? */
export function operatorValueShape(op: Operator): "none" | "list" | "integer" | "scalar" {
  if (VALUELESS_OPERATORS.includes(op)) return "none";
  if (LIST_OPERATORS.includes(op)) return "list";
  if (INTEGER_OPERATORS.includes(op)) return "integer";
  return "scalar";
}

/**
 * §169 · El resumen en castellano de una condición, generado desde el árbol.
 * Es la misma frase para la misma condición, siempre: no hay ningún modelo
 * detrás, y por eso se puede comprobar en una prueba.
 */
export function describeCondition(
  c: Condition, fieldLabel?: string
): string {
  const campo = fieldLabel ?? c.field;
  const v = c.value;
  switch (c.operator) {
    case "is_empty": return `${campo} está sin dato`;
    case "is_not_empty": return `${campo} tiene dato`;
    case "in": return `${campo} está entre (${asList(v).join(", ")})`;
    case "not_in": return `${campo} no está entre (${asList(v).join(", ")})`;
    case "days_before": return `${campo} vence dentro de ${String(v)} días`;
    case "days_after": return `${campo} pasó hace ${String(v)} días o más`;
    case "consecutive_count":
      return `${campo} se repite ${String(v)} periodo(s) seguidos`;
    case "strictly_decreasing":
      return `${campo} baja ${String(v)} periodo(s) seguidos`;
    default:
      return `${campo} ${OPERATOR_LABEL[c.operator]} ${String(v)}`;
  }
}

function asList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)];
}

/** §169 · Y el de la regla entera, para enseñarlo ANTES de publicar. */
export function describeRule(
  sourceLabel: string, conditions: Condition[], outputs: Output[],
  labels: Record<string, string> = {}
): string {
  const partes = conditions.map((c) => describeCondition(c, labels[c.field]));
  const salidas = outputs.map((o) => {
    switch (o.kind) {
      case "CREATE_SIGNAL": return "emitirá una señal";
      case "CREATE_ALERT": return "avisará al cargo responsable";
      case "CREATE_TASK": return "creará una tarea";
    }
  });
  return `Esta regla revisará ${sourceLabel.toLowerCase()} y, cuando `
    + `${partes.length > 0 ? partes.join(" y ") : "se cumpla la condición"}, `
    + `${salidas.length > 0 ? salidas.join(", ") : "no hará nada"}.`;
}

/** §30 · La validación que la pantalla puede hacer antes de molestar al servidor.
 *  La de verdad está en la base y falla cerrada: esta solo evita el viaje. */
export function validateConditions(
  conditions: Condition[],
  allowed: Record<string, { operators: readonly string[]; label: string }>
): string[] {
  const errores: string[] = [];
  if (conditions.length === 0) {
    errores.push("La regla no tiene ninguna condición: marcaría a todos los sujetos.");
  }
  for (const c of conditions) {
    const campo = allowed[c.field];
    if (!campo) {
      errores.push(`El campo «${c.field}» no pertenece a esta fuente.`);
      continue;
    }
    if (!campo.operators.includes(c.operator)) {
      errores.push(`«${OPERATOR_LABEL[c.operator]}» no se puede aplicar a ${campo.label}.`);
      continue;
    }
    const forma = operatorValueShape(c.operator);
    if (forma === "none") continue;
    if (c.value === undefined || c.value === null || c.value === "") {
      errores.push(`Falta el valor de la condición sobre ${campo.label}.`);
    } else if (forma === "list" && !Array.isArray(c.value)) {
      errores.push(`La condición sobre ${campo.label} necesita una lista de valores.`);
    } else if (forma === "integer" && !/^\d+$/.test(String(c.value))) {
      errores.push(`La condición sobre ${campo.label} necesita un número entero.`);
    }
  }
  return errores;
}

/** §30/§110 · Y lo mismo para las salidas. */
export function validateOutputs(outputs: Output[]): string[] {
  const errores: string[] = [];
  if (outputs.length === 0) {
    errores.push("La regla no produce ninguna salida: no serviría de nada.");
    return errores;
  }
  if (outputs[0].kind !== "CREATE_SIGNAL") {
    errores.push("La primera salida tiene que ser la señal: la alerta y la tarea la referencian.");
  }
  for (const o of outputs) {
    if (!(OUTPUT_KINDS as readonly string[]).includes(o.kind)) {
      errores.push(`Salida no permitida: «${o.kind}».`);
      continue;
    }
    if (o.kind !== "CREATE_SIGNAL") {
      if (!o.recipientKind
          || !(RECIPIENT_KINDS as readonly string[]).includes(o.recipientKind)) {
        errores.push("El destinatario tiene que ser un cargo del catálogo.");
      }
      if (o.recipientKind === "specific_position" && !o.positionId) {
        errores.push("Falta el cargo destinatario.");
      }
    }
  }
  return errores;
}

export type RunSummary = {
  rulesEvaluated: number; subjectsEvaluated: number; matches: number;
  signalsCreated: number; alertsCreated: number; tasksCreated: number;
  failures: number;
};

/** §44 · Cómo lo diría una persona. */
export function describeRun(r: RunSummary): string {
  const partes = [
    `${r.rulesEvaluated} regla(s) sobre ${r.subjectsEvaluated} sujeto(s)`,
    `${r.matches} coincidencia(s)`,
  ];
  if (r.signalsCreated > 0) partes.push(`${r.signalsCreated} señal(es) nueva(s)`);
  if (r.alertsCreated > 0) partes.push(`${r.alertsCreated} aviso(s)`);
  if (r.tasksCreated > 0) partes.push(`${r.tasksCreated} tarea(s)`);
  if (r.signalsCreated === 0 && r.alertsCreated === 0 && r.tasksCreated === 0) {
    partes.push("nada nuevo que avisar");
  }
  if (r.failures > 0) partes.push(`${r.failures} regla(s) con fallo`);
  return partes.join(" · ") + ".";
}

/** §41 · La explicación de una señal, en líneas. */
export function explanationLines(explanation: string | null): string[] {
  if (!explanation) return [];
  return explanation.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
}

// ---------------------------------------------------------------------------
// Roles (§87)
// ---------------------------------------------------------------------------

export function canReadAutomation(roleCode: string): boolean {
  return roleCode.length > 0;
}

export function canManageAutomation(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality" || roleCode === "consultant";
}

/** Encender una regla es decidir qué observará la plataforma en nombre de la
 *  empresa. Se diseña entre varios; se enciende desde dentro. */
export function canPublishAutomation(roleCode: string): boolean {
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

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return `${formatDate(iso)} ${iso.slice(11, 16)}`;
}
