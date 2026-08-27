"use server";

import { revalidatePath } from "next/cache";
import { requireQualityForAction } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { checkQualityCanMutate } from "@/server/actions/module-plans";
import {
  acknowledgeSignal, createRule, createVersion, deleteRule, instantiateTemplate,
  publishVersion, resolveSignal, runAutomation, setRuleStatus, simulateVersion,
  suppress, updateDraftVersion, updateRule, updateSettings, validateVersion,
} from "@/lib/db/quality-automation";
import {
  AUTOMATION_DOMAINS, AUTONOMY_LEVELS, canManageAutomation,
  canPublishAutomation, OPERATORS, OUTPUT_KINDS, RECIPIENT_KINDS, RULE_STATUSES,
  SEVERITIES, validateConditions, validateOutputs,
  type Condition, type Operator, type Output,
} from "@/lib/domain/quality-automation";

/**
 * Trazaloop · QUALITY-11 · Acciones de servidor de la Automatización.
 *
 * EL REPARTO
 *
 * · Crear y editar BORRADORES es escritura normal bajo RLS.
 * · Publicar, ejecutar, simular, reconocer, resolver y silenciar pasan por una
 *   RPC de 0129, que comprueba rol, empresa e invariante en el mismo acto.
 *
 * LO QUE NINGUNA DE ESTAS FUNCIONES HACE
 *
 * Ninguna evalúa condiciones: el motor está entero en la base, y tenerlo en dos
 * sitios significaría dos semánticas del mismo operador. Ninguna crea acciones
 * correctivas. Ninguna declara no conformidades, aprueba proveedores, declara
 * competente a nadie, acepta riesgos, cierra auditorías ni cierra revisiones por
 * la dirección. Ninguna acepta una tabla, una columna, un SQL ni una expresión
 * que venga del navegador. Y ninguna invoca ningún modelo.
 */

export type AutomationActionState = {
  error: string | null;
  success?: boolean;
  message?: string | null;
  id?: string;
  /** §70 · Lo que la simulación encontró, para pintarlo. */
  simulation?: Record<string, unknown>;
  /** §30 · Los errores de validación, en frases. */
  validation?: string[];
};

const OK: AutomationActionState = { error: null, success: true, message: null };

type Gate = { organizationId: string; roleCode: string; userId: string };

async function gate(): Promise<{ ok: Gate | null; error: string | null }> {
  const access = await requireQualityForAction();
  if (access.org === null) return { ok: null, error: access.error };
  const mutate = await checkQualityCanMutate();
  if (!mutate.allowed) return { ok: null, error: mutate.error };
  const { user } = await requireSession();
  return {
    ok: {
      organizationId: access.org.organizationId,
      roleCode: access.org.roleCode,
      userId: user.id,
    },
    error: null,
  };
}

function text(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}
function optional(form: FormData, name: string): string | null {
  const v = text(form, name);
  return v.length > 0 ? v : null;
}
function bool(form: FormData, name: string): boolean {
  return form.get(name) === "on" || form.get(name) === "true";
}
function num(form: FormData, name: string): number | null {
  const v = text(form, name);
  if (v.length === 0) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pick<T extends readonly string[]>(
  form: FormData, name: string, allowed: T, fallback?: T[number]
): T[number] | null {
  const v = text(form, name);
  if ((allowed as readonly string[]).includes(v)) return v as T[number];
  return fallback ?? null;
}

function revalidateAutomation(extra?: string | null) {
  revalidatePath("/quality");
  revalidatePath("/quality/automation");
  revalidatePath("/quality/automation/rules");
  revalidatePath("/quality/automation/signals");
  revalidatePath("/quality/automation/runs");
  revalidatePath("/quality/tasks");
  if (extra) revalidatePath(extra);
}

async function run(
  fn: () => Promise<void | string>,
  after: () => void,
  message: string
): Promise<AutomationActionState> {
  try {
    const id = await fn();
    after();
    return { ...OK, message, id: typeof id === "string" ? id : undefined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo completar la operación." };
  }
}

/**
 * §29 · Las condiciones llegan del formulario como triples (campo, operador,
 * valor) y se reconstruyen AQUÍ. El navegador nunca manda una tabla, una
 * columna ni una expresión: manda un código de campo, que el servidor validará
 * contra el catálogo antes de publicar nada.
 */
function readConditions(form: FormData): Condition[] {
  const campos = form.getAll("condition_field")
    .filter((v): v is string => typeof v === "string");
  const ops = form.getAll("condition_operator")
    .filter((v): v is string => typeof v === "string");
  const vals = form.getAll("condition_value")
    .filter((v): v is string => typeof v === "string");

  const out: Condition[] = [];
  for (let i = 0; i < campos.length; i++) {
    const field = campos[i].trim();
    const operator = (ops[i] ?? "").trim();
    if (field.length === 0 || operator.length === 0) continue;
    if (!(OPERATORS as readonly string[]).includes(operator)) continue;
    const bruto = (vals[i] ?? "").trim();
    let value: unknown = bruto;
    if (operator === "is_empty" || operator === "is_not_empty") {
      value = undefined;
    } else if (operator === "in" || operator === "not_in") {
      value = bruto.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
    } else if (bruto === "true" || bruto === "false") {
      value = bruto === "true";
    } else if (/^-?\d+(\.\d+)?$/.test(bruto)) {
      value = Number(bruto);
    }
    out.push({ field, operator: operator as Operator, value });
  }
  return out;
}

function readOutputs(form: FormData): Output[] {
  // La señal siempre va primero: la alerta y la tarea la referencian.
  const out: Output[] = [{ kind: "CREATE_SIGNAL" }];
  const destinatario = pick(form, "recipient_kind", RECIPIENT_KINDS, "rule_owner_position")!;
  const posicion = optional(form, "recipient_position_id");

  if (bool(form, "output_alert")) {
    out.push({
      kind: "CREATE_ALERT", recipientKind: destinatario,
      ...(destinatario === "specific_position" && posicion ? { positionId: posicion } : {}),
    });
  }
  if (bool(form, "output_task")) {
    out.push({
      kind: "CREATE_TASK", recipientKind: destinatario,
      ...(destinatario === "specific_position" && posicion ? { positionId: posicion } : {}),
      ...(optional(form, "task_title") ? { taskTitle: text(form, "task_title") } : {}),
      ...(num(form, "due_in_days") !== null ? { dueInDays: num(form, "due_in_days")! } : {}),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reglas (§20…§25, §66, §125)
// ---------------------------------------------------------------------------

/** §66/§170 · Instanciar una plantilla. Nace en BORRADOR: nada se enciende solo. */
export async function instantiateTemplateAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear reglas de automatización." };
  }
  const code = text(formData, "template_code");
  if (!code) return { error: "Falta la plantilla." };

  return run(
    () => instantiateTemplate(g.ok!.organizationId, code,
      optional(formData, "owner_position_id"), null),
    () => revalidateAutomation(),
    "Regla creada como BORRADOR desde la plantilla. Nada se ha encendido: "
      + "revísala, simúlala y publícala cuando estés conforme."
  );
}

export async function createRuleAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear reglas de automatización." };
  }
  const code = text(formData, "code");
  const name = text(formData, "name");
  const sourceCode = text(formData, "source_code");
  const signalTitle = text(formData, "signal_title");
  if (code.length < 1) return { error: "Escribe el código de la regla." };
  if (name.length < 3) return { error: "Escribe el nombre de la regla." };
  if (!sourceCode) return { error: "Elige qué va a observar la regla." };
  if (signalTitle.length < 5) return { error: "Escribe qué dirá la señal cuando salte." };

  const conditions = readConditions(formData);
  const outputs = readOutputs(formData);
  const errores = [...validateConditions(conditions, {}), ...validateOutputs(outputs)]
    // La validación de campos y operadores contra el catálogo la hace la base:
    // aquí solo se comprueba la forma, para no viajar en balde.
    .filter((e) => !e.includes("no pertenece a esta fuente")
                && !e.includes("no se puede aplicar a"));
  if (errores.length > 0) return { error: errores[0], validation: errores };

  return run(
    () => createRule(g.ok!.organizationId, {
      code, name,
      description: optional(formData, "description"),
      category: pick(formData, "category", AUTOMATION_DOMAINS, "indicators")!,
      sourceCode,
      ownerPositionId: optional(formData, "owner_position_id"),
      autonomyLevel: pick(formData, "autonomy_level", AUTONOMY_LEVELS, "A")!,
      severity: pick(formData, "severity", SEVERITIES, "warning")!,
      signalTitle, conditions, outputs,
    }),
    () => revalidateAutomation(),
    "Regla creada como borrador. Todavía no observa nada: simúlala primero y "
      + "publícala cuando el resultado te convenza."
  );
}

export async function updateRuleAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar reglas." };
  }
  const ruleId = text(formData, "rule_id");
  const name = text(formData, "name");
  if (!ruleId) return { error: "Falta la regla." };
  if (name.length < 3) return { error: "Escribe el nombre de la regla." };

  return run(
    () => updateRule(g.ok!.organizationId, ruleId, {
      name,
      description: optional(formData, "description"),
      ownerPositionId: optional(formData, "owner_position_id"),
    }),
    () => revalidateAutomation(`/quality/automation/rules/${ruleId}`),
    "Regla actualizada. Su lógica no cambió: para eso hace falta una versión nueva."
  );
}

/** §24 · Desactivar deja de evaluar y conserva todo lo observado. */
export async function setRuleStatusAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  const ruleId = text(formData, "rule_id");
  const status = pick(formData, "status", RULE_STATUSES);
  if (!ruleId || !status) return { error: "Falta la regla o el estado." };
  if (status === "active" && !canPublishAutomation(g.ok.roleCode)) {
    return { error: "Activar una regla es decidir qué observará la plataforma en nombre de la empresa: eso lo hace quien responde por ella." };
  }
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite cambiar el estado de una regla." };
  }
  const reason = optional(formData, "reason");
  if (status === "retired" && (reason === null || reason.length < 10)) {
    return { error: "Escribe por qué se retira la regla." };
  }

  return run(
    () => setRuleStatus(g.ok!.organizationId, ruleId, status, reason),
    () => revalidateAutomation(`/quality/automation/rules/${ruleId}`),
    status === "inactive" || status === "retired"
      ? "Regla desactivada. Deja de evaluar; sus ejecuciones, señales, alertas y "
        + "tareas se conservan."
      : "Estado actualizado."
  );
}

export async function deleteRuleAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite eliminar reglas." };
  }
  const ruleId = text(formData, "rule_id");
  if (!ruleId) return { error: "Falta la regla." };

  return run(
    () => deleteRule(g.ok!.organizationId, ruleId),
    () => revalidateAutomation(),
    "Regla eliminada."
  );
}

/** §21 · Editar una regla publicada es crear la versión siguiente. */
export async function createVersionAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite crear versiones de regla." };
  }
  const ruleId = text(formData, "rule_id");
  const signalTitle = text(formData, "signal_title");
  if (!ruleId) return { error: "Falta la regla." };
  if (signalTitle.length < 5) return { error: "Escribe qué dirá la señal cuando salte." };

  const conditions = readConditions(formData);
  const outputs = readOutputs(formData);
  if (conditions.length === 0) {
    return { error: "La regla no tiene ninguna condición: marcaría a todos los sujetos." };
  }

  return run(
    () => createVersion(g.ok!.organizationId, ruleId, {
      conditions, outputs,
      severity: pick(formData, "severity", SEVERITIES, "warning")!,
      signalTitle,
      triggerKind: "schedule",
      scheduleFrequency: text(formData, "schedule_frequency") || "daily",
      changeNote: optional(formData, "change_note"),
    }),
    () => revalidateAutomation(`/quality/automation/rules/${ruleId}`),
    "Versión nueva creada como borrador. La versión publicada NO se tocó: las "
      + "señales que emitió siguen explicándose con ella."
  );
}

export async function updateDraftVersionAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite editar borradores de regla." };
  }
  const versionId = text(formData, "version_id");
  const signalTitle = text(formData, "signal_title");
  if (!versionId) return { error: "Falta la versión." };
  if (signalTitle.length < 5) return { error: "Escribe qué dirá la señal cuando salte." };

  return run(
    () => updateDraftVersion(g.ok!.organizationId, versionId, {
      conditions: readConditions(formData),
      outputs: readOutputs(formData),
      severity: pick(formData, "severity", SEVERITIES, "warning")!,
      signalTitle,
    }),
    () => revalidateAutomation(optional(formData, "rule_id")
      ? `/quality/automation/rules/${text(formData, "rule_id")}` : null),
    "Borrador guardado."
  );
}

/** §70/§144 · Simular sobre datos reales. No crea nada, y lo dice con cifras. */
export async function simulateVersionAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite simular reglas." };
  }
  const versionId = text(formData, "version_id");
  if (!versionId) return { error: "Falta la versión." };

  try {
    const validacion = await validateVersion(versionId);
    if (!validacion.valid) {
      return {
        error: validacion.errors[0] ?? "La regla no es válida.",
        validation: validacion.errors,
      };
    }
    const resultado = await simulateVersion(versionId, null);
    revalidateAutomation();
    const n = Number(resultado?.matches ?? 0);
    return {
      ...OK, simulation: resultado ?? undefined,
      message: n > 0
        ? `Esta regla encontraría ${n} coincidencia(s) hoy. No se creó ninguna `
          + "señal, ninguna alerta y ninguna tarea: era una simulación."
        : "Esta regla no encontraría ninguna coincidencia hoy. Eso no significa "
          + "que esté mal: puede que la condición todavía no se dé.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo simular la regla." };
  }
}

/** §22/§23 · Publicar valida primero y falla cerrada. */
export async function publishVersionAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canPublishAutomation(g.ok.roleCode)) {
    return { error: "Publicar una regla es decidir qué observará la plataforma en nombre de la empresa. Un consultor externo la puede diseñar; encenderla es de la empresa." };
  }
  const versionId = text(formData, "version_id");
  if (!versionId) return { error: "Falta la versión." };

  try {
    const validacion = await validateVersion(versionId);
    if (!validacion.valid) {
      return {
        error: validacion.errors[0] ?? "La regla no es válida.",
        validation: validacion.errors,
      };
    }
    const r = await publishVersion(versionId, optional(formData, "effective_from"),
      optional(formData, "change_note"));
    revalidateAutomation(optional(formData, "rule_id")
      ? `/quality/automation/rules/${text(formData, "rule_id")}` : null);
    return {
      ...OK,
      message: `Versión publicada, vigente desde ${String(r.effective_from ?? "hoy")}. `
        + "A partir de ahora esta versión no se edita: si hay que cambiarla, se "
        + "crea la siguiente.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo publicar la versión." };
  }
}

// ---------------------------------------------------------------------------
// Ejecución (§105, §106)
// ---------------------------------------------------------------------------

export async function runAutomationAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite ejecutar la automatización." };
  }

  return run(
    () => runAutomation(g.ok!.organizationId, "live", optional(formData, "rule_id")),
    () => revalidateAutomation(),
    "Barrido ejecutado. Abre «Ejecuciones» para ver qué evaluó y qué creó: lo "
      + "que informa es lo NUEVO de esta pasada, no cuántas señales existen."
  );
}

// ---------------------------------------------------------------------------
// Señales (§39, §79, §80)
// ---------------------------------------------------------------------------

export async function acknowledgeSignalAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite gestionar señales." };
  }
  const signalId = text(formData, "signal_id");
  if (!signalId) return { error: "Falta la señal." };

  return run(
    () => acknowledgeSignal(signalId),
    () => revalidateAutomation(`/quality/automation/signals/${signalId}`),
    "Señal reconocida. «Lo vi» no es «lo resolví»: la condición sigue ahí hasta "
      + "que se resuelva o deje de cumplirse."
  );
}

export async function resolveSignalAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite gestionar señales." };
  }
  const signalId = text(formData, "signal_id");
  const kind = text(formData, "kind") === "dismissed" ? "dismissed" : "manual";
  const note = text(formData, "note");
  if (!signalId) return { error: "Falta la señal." };
  if (note.length < 10) {
    return { error: "Escribe por qué se cierra esta señal. Sin razón, cerrar es esconder." };
  }

  return run(
    () => resolveSignal(signalId, kind, note),
    () => revalidateAutomation(`/quality/automation/signals/${signalId}`),
    kind === "dismissed"
      ? "Señal descartada, con su razón. Las tareas que hubiera creado siguen su "
        + "propio curso."
      : "Señal resuelta. Si la condición vuelve a darse, nacerá una señal nueva: "
        + "será un hecho nuevo, no el mismo."
  );
}

export async function suppressAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canManageAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite silenciar señales ni reglas." };
  }
  const scope = text(formData, "scope") === "rule" ? "rule" : "signal";
  const targetId = text(formData, "target_id");
  const reason = text(formData, "reason");
  if (!targetId) return { error: "Falta qué silenciar." };
  if (reason.length < 10) {
    return { error: "Silenciar exige decir por qué, y hasta cuándo si procede." };
  }

  return run(
    () => suppress(scope, targetId, reason, optional(formData, "until")),
    () => revalidateAutomation(),
    "Silenciado, con tu nombre y tu razón. La condición sigue existiendo debajo: "
      + "silenciar evita el ruido, no el problema."
  );
}

// ---------------------------------------------------------------------------
// Configuración (§48, §67)
// ---------------------------------------------------------------------------

export async function updateSettingsAction(
  _prev: AutomationActionState, formData: FormData
): Promise<AutomationActionState> {
  const g = await gate();
  if (!g.ok) return { error: g.error };
  if (!canPublishAutomation(g.ok.roleCode)) {
    return { error: "Tu rol no permite cambiar la configuración del motor." };
  }
  const tz = text(formData, "business_timezone") || "UTC";
  // Solo se aceptan zonas horarias reales, y la lista la resuelve el servidor.
  if (!/^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+){0,2}$/.test(tz)) {
    return { error: "Esa zona horaria no tiene forma de zona horaria." };
  }

  return run(
    () => updateSettings(g.ok!.organizationId, {
      isEnabled: bool(formData, "is_enabled"),
      businessTimezone: tz,
    }),
    () => revalidateAutomation(),
    "Configuración guardada. «Vence hoy» se resolverá en esta zona horaria: el "
      + "reloj sigue siendo del servidor, pero el día es el de tu calendario."
  );
}
