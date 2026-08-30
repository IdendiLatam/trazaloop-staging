import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import {
  CURRENT, INTEGRATION_SUBJECTS, attentionKey, deepLink,
  type AttentionItem, type IntegrationSubject, type ObserverKind, type SectionStatus,
} from "@/lib/domain/quality-integration";
import {
  INFORMATIONAL_ALERTS, observerForAlert, observerForTask, observerByCode,
  type ObserverRecord,
} from "@/lib/domain/quality-observers";
import { byObserverPriority, converge } from "@/lib/domain/quality-attention";

/**
 * Trazaloop · QUALITY-13B3 · «¿Qué requiere atención?», una sola vez.
 *
 * PARA QUÉ EXISTE
 *
 * La portada de hoy hace doce llamadas, una por dominio, cada una con su forma
 * de contar. Si dos cuentan el mismo problema, lo enseña dos veces sin saberlo.
 * Esto es lo que B4 preguntará en su lugar: una llamada, y un problema una vez.
 *
 * **B3 NO es la portada.** Esto no pinta nada y no cambia ninguna pantalla.
 *
 *
 * DE DÓNDE SALE LA ATENCIÓN, Y DE DÓNDE NO
 *
 * De las cinco fuentes que de verdad tienen filas, en este orden —que importa,
 * porque cuando dos ven lo mismo gana el primero—:
 *
 *   1 · `quality_signals`, la observación del motor de reglas;
 *   2 · `work_alerts`, el aviso de los barridos y de los emisores por evento;
 *   3 · `work_tasks`, el pendiente asignado;
 *   4 · las tres tablas de señal de dominio con emisor real.
 *
 * **`quality_risk_signals` no se lee**, y no por descuido: no la escribe nadie.
 * Ni una migración, ni una línea de aplicación. Leerla sería fingir que hay una
 * fuente donde solo hay una tabla vacía.
 *
 *
 * SIN DATO NO ES CERO
 *
 * Cada fuente responde por sí misma. Una que falla llega `unavailable` y una
 * denegada `not_visible`; ninguna de las dos aporta un cero al total, y el
 * resultado dice que está incompleto. Es la misma regla de B1, y la misma que
 * costó un sprint en QUALITY-12.2F.
 *
 *
 * EL COSTE
 *
 * Una consulta por fuente más una por el catálogo de reglas: SIETE, y no crecen
 * con el número de filas ni con el de dominios observados. La convergencia es
 * un `Map` en memoria sobre lo ya leído, no una consulta por observador.
 */

type Db = SupabaseClient;
/** El tope por fuente. Una portada no pinta mil líneas, y pedirlas para
 *  contarlas sería pagar por lo que no se enseña. */
const TOPE = 500;

async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

function esFaltaDePermiso(error: { code?: string; message?: string } | null): boolean {
  const c = error?.code ?? "";
  return c === "42501" || c === "PGRST301" || /permission denied/i.test(error?.message ?? "");
}

export type AttentionSourceStatus = {
  source: string;
  label: string;
  status: SectionStatus;
  /** Cuántos puntos aportó. `null` cuando no se sabe. */
  count: number | null;
};

async function fuente(
  source: string, label: string, cargar: () => Promise<AttentionItem[]>
): Promise<{ status: AttentionSourceStatus; items: AttentionItem[] }> {
  try {
    const items = await cargar();
    return { status: { source, label, status: "ok", count: items.length }, items };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return {
      status: {
        source, label,
        status: esFaltaDePermiso(err) ? "not_visible" : "unavailable",
        count: null,
      },
      items: [],
    };
  }
}

const SUJETOS = new Set<string>(INTEGRATION_SUBJECTS);

/** El sujeto que declara la fila, si el contrato sabe nombrarlo; si no, el que
 *  su observador declara. Nunca se inventa uno. */
function sujeto(fila: string | null | undefined, obs: ObserverRecord): IntegrationSubject {
  return fila && SUJETOS.has(fila) ? (fila as IntegrationSubject) : obs.subjectKind;
}

export type AttentionQuery = {
  organizationId: string;
  /** Solo lo relacionado con este proceso. */
  processId?: string | null;
  /** Solo este dominio. */
  domain?: string | null;
};

export type ConvergedAttention = {
  items: AttentionItem[];
  /** Por clave, qué otros observadores vieron el mismo problema. */
  alsoSeenBy: Record<string, string[]>;
  sources: AttentionSourceStatus[];
  /** Cuántas filas llegaron de un tipo que el inventario NO conoce. Debe ser
   *  cero; si no lo es, hay un emisor sin inventariar y hay que decirlo en vez
   *  de tragárselo. */
  unregistered: number;
  /** ¿Se leyeron todas las fuentes? Con una caída, el total es un mínimo. */
  complete: boolean;
};

// ---------------------------------------------------------------------------
// El relevo declarado por esta empresa
// ---------------------------------------------------------------------------

type Relevos = {
  /** Códigos de observador relevados: cualificados y barridos enteros. */
  superseded: Set<string>;
  /** Por identificador de regla, su código de plantilla o el suyo propio. */
  reglas: Map<string, { code: string; templateCode: string | null; supersedes: string | null }>;
};

async function relevos(supabase: Db, orgId: string): Promise<Relevos> {
  const { data, error } = await supabase.from("quality_automation_rules")
    .select("id, code, template_code, status, supersedes_observer")
    .eq("organization_id", orgId);
  if (error) throw error;
  const superseded = new Set<string>();
  const reglas = new Map<string, { code: string; templateCode: string | null; supersedes: string | null }>();
  for (const r of data ?? []) {
    reglas.set(r.id as string, {
      code: r.code as string,
      templateCode: (r.template_code as string | null) ?? null,
      supersedes: (r.supersedes_observer as string | null) ?? null,
    });
    if (r.status === "active" && r.supersedes_observer) {
      superseded.add(r.supersedes_observer as string);
    }
  }
  return { superseded, reglas };
}

/** ¿Está relevado este observador para esta empresa? Misma regla que 0153: vale
 *  el código de la condición y vale el del barrido entero. */
function estaRelevado(code: string, sup: Set<string>): boolean {
  return sup.has(code) || sup.has(code.split(".")[0]);
}

function kindDe(obs: ObserverRecord, sup: Set<string>): ObserverKind {
  if (obs.mechanism === "quality_automation_emit") return "active_observer";
  if (obs.trigger === "event") return "truth_source";
  return estaRelevado(obs.code, sup) ? "superseded_observer" : "legacy_sweep";
}

// ---------------------------------------------------------------------------
// Las fuentes
// ---------------------------------------------------------------------------

/**
 * La señal del motor de reglas.
 *
 * La CONDICIÓN de una señal es la de la regla. Cuando la regla declara a quién
 * releva, se usa la condición de ese observador: eso es lo que hace que la
 * señal nueva y el aviso viejo del barrido converjan en una sola línea en vez
 * de contarse dos veces. No es una heurística: es un dato que la empresa
 * declaró al adoptar la plantilla.
 */
async function desdeSenales(
  supabase: Db, orgId: string, rel: Relevos
): Promise<AttentionItem[]> {
  const { data, error } = await supabase.from("quality_signals")
    .select("id, rule_id, domain, subject_type, subject_id, subject_label, severity, " +
            "title, status, first_detected_at")
    .eq("organization_id", orgId).is("resolved_at", null)
    .order("first_detected_at", { ascending: true }).limit(TOPE);
  if (error) throw error;

  // PostgREST no sabe tipar un `select` compuesto en varias líneas y devuelve
  // su unión con la forma de error. Se normaliza a registro plano y cada campo
  // se lee explícito, que es el patrón que ya usa `document-control`.
  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  return filas.map((s) => {
    const regla = s.rule_id ? rel.reglas.get(s.rule_id as string) : undefined;
    const relevado = regla?.supersedes ? observerByCode(regla.supersedes) : null;
    const condicion = relevado
      ? relevado.code.split(".").slice(1).join(".")
      : `rule:${regla?.templateCode ?? regla?.code ?? "propia"}`;
    const dominio = relevado?.domain ?? (s.domain as string);
    const kind = sujeto(s.subject_type as string, relevado ?? {
      subjectKind: "quality_signal" as IntegrationSubject } as ObserverRecord);
    return {
      domain: dominio,
      subjectKind: kind,
      subjectId: s.subject_id as string,
      label: (s.subject_label as string | null) ?? (s.title as string),
      reason: s.title as string,
      state: s.status as string,
      severity: (s.severity as string | null) ?? null,
      since: (s.first_detected_at as string | null) ?? null,
      href: deepLink(kind, s.subject_id as string),
      observer: {
        code: regla?.templateCode ?? regla?.code ?? "quality_automation_emit.rule_signal",
        kind: "active_observer" as ObserverKind,
        supersedes: regla?.supersedes ?? null,
      },
      temporal: CURRENT,
      dedupeKey: attentionKey({
        domain: dominio, subjectKind: kind,
        subjectId: s.subject_id as string, condition: condicion,
      }),
    } satisfies AttentionItem;
  });
}

/**
 * Los avisos.
 *
 * Un aviso es una NOTIFICACIÓN: la misma condición produce tantos como
 * destinatarios tenga. Contarlos como problemas multiplicaría el trabajo por el
 * tamaño del equipo, y por eso convergen todos en la misma clave.
 *
 * Los informativos —«documento aprobado», «documento retirado»— NO entran. Son
 * buenas noticias con forma de aviso, y una portada que las cuenta como
 * pendientes convierte lo terminado en deuda.
 */
async function desdeAvisos(
  supabase: Db, orgId: string, rel: Relevos, sinRegistrar: { n: number }
): Promise<AttentionItem[]> {
  const { data, error } = await supabase.from("work_alerts")
    .select("id, alert_type, severity, subject_type, subject_id, title, status, created_at")
    .eq("organization_id", orgId).in("status", ["new", "seen", "acknowledged"])
    .order("created_at", { ascending: true }).limit(TOPE);
  if (error) throw error;

  const salida: AttentionItem[] = [];
  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  for (const a of filas) {
    const tipo = a.alert_type as string;
    if (INFORMATIONAL_ALERTS.includes(tipo)) continue;
    const obs = observerForAlert(tipo);
    if (!obs) { sinRegistrar.n += 1; continue; }
    if (obs.mechanism === "quality_automation_emit") continue; // ya vino como señal
    const kind = sujeto(a.subject_type as string, obs);
    salida.push({
      domain: obs.domain, subjectKind: kind, subjectId: a.subject_id as string,
      label: a.title as string, reason: obs.condition,
      state: a.status as string,
      severity: (a.severity as string | null) ?? null,
      since: (a.created_at as string | null) ?? null,
      href: deepLink(kind, a.subject_id as string),
      observer: { code: obs.code, kind: kindDe(obs, rel.superseded), supersedes: null },
      temporal: CURRENT,
      dedupeKey: attentionKey({
        domain: obs.domain, subjectKind: kind,
        subjectId: a.subject_id as string,
        condition: obs.code.split(".").slice(1).join("."),
      }),
    });
  }
  return salida;
}

/** Los pendientes asignados. Un pendiente y su aviso son la misma condición
 *  vista dos veces: convergen, no se suman. */
async function desdeTareas(
  supabase: Db, orgId: string, rel: Relevos, sinRegistrar: { n: number }
): Promise<AttentionItem[]> {
  const { data, error } = await supabase.from("work_tasks")
    .select("id, task_type, subject_type, subject_id, title, status, due_at, created_at")
    .eq("organization_id", orgId).in("status", ["open", "in_progress"])
    .order("created_at", { ascending: true }).limit(TOPE);
  if (error) throw error;

  const salida: AttentionItem[] = [];
  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  for (const t of filas) {
    const obs = observerForTask(t.task_type as string);
    if (!obs) { sinRegistrar.n += 1; continue; }
    if (obs.mechanism === "quality_automation_emit") continue;
    const kind = sujeto(t.subject_type as string, obs);
    salida.push({
      domain: obs.domain, subjectKind: kind, subjectId: t.subject_id as string,
      label: t.title as string, reason: obs.condition,
      state: t.status as string,
      // Una tarea no gradúa: su dominio no le pone gravedad, y ponérsela aquí
      // sería inventarla.
      severity: null,
      since: (t.created_at as string | null) ?? null,
      href: deepLink(kind, t.subject_id as string),
      observer: { code: obs.code, kind: kindDe(obs, rel.superseded), supersedes: null },
      temporal: CURRENT,
      dedupeKey: attentionKey({
        domain: obs.domain, subjectKind: kind,
        subjectId: t.subject_id as string,
        condition: obs.code.split(".").slice(1).join("."),
      }),
    });
  }
  return salida;
}

/** Las tres tablas de señal de dominio que SÍ tienen emisor. */
async function desdeSenalDeDominio(
  supabase: Db, orgId: string, tabla: string, columnaSujeto: string,
  observadorPorKind: Record<string, string>, rel: Relevos
): Promise<AttentionItem[]> {
  const { data, error } = await supabase.from(tabla)
    .select(`id, signal_kind, detail, status, first_seen_at, ${columnaSujeto}`)
    .eq("organization_id", orgId).eq("status", "open").limit(TOPE);
  if (error) throw error;

  const salida: AttentionItem[] = [];
  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  for (const s of filas) {
    const code = observadorPorKind[s.signal_kind as string];
    const obs = code ? observerByCode(code) : null;
    const sujetoId = s[columnaSujeto] as string | null;
    if (!obs || !sujetoId) continue;
    salida.push({
      domain: obs.domain, subjectKind: obs.subjectKind, subjectId: sujetoId,
      label: (s.detail as string | null) ?? obs.condition,
      reason: obs.condition, state: s.status as string,
      // Estas tres tablas no guardan gravedad. No se le pone una.
      severity: null,
      since: (s.first_seen_at as string | null) ?? null,
      href: deepLink(obs.subjectKind, sujetoId),
      observer: { code: obs.code, kind: kindDe(obs, rel.superseded), supersedes: null },
      temporal: CURRENT,
      dedupeKey: attentionKey({
        domain: obs.domain, subjectKind: obs.subjectKind, subjectId: sujetoId,
        condition: obs.code.split(".").slice(1).join("."),
      }),
    });
  }
  return salida;
}

const SUPPLIER_KINDS: Record<string, string> = {
  reevaluation_overdue: "quality_scan_supplier_reviews.reevaluation_overdue",
  approval_expired: "quality_scan_supplier_reviews.approval_expired",
  critical_without_approval: "quality_scan_supplier_reviews.critical_without_approval",
};
const CUSTOMER_KINDS: Record<string, string> = {
  complaint_unreviewed: "quality_scan_customer_voice.complaint_unreviewed",
  campaign_closing_low_responses: "quality_scan_customer_voice.campaign_low_responses",
  satisfaction_drop: "quality_scan_customer_voice.satisfaction_drop",
  comparability_break: "quality_scan_customer_voice.comparability_break",
};
const KNOWLEDGE_KINDS: Record<string, string> = {
  single_holder: "quality_scan_people_signals.knowledge_single_holder",
  transfer_overdue: "quality_scan_people_signals.knowledge_transfer_overdue",
};

// ---------------------------------------------------------------------------
// El proceso, cuando se pide
// ---------------------------------------------------------------------------

/**
 * Los sujetos relacionados con un proceso.
 *
 * Ocho lecturas de identificadores, todas acotadas por proceso. No se compone
 * el contexto entero de B1: aquí solo hace falta saber a QUÉ pertenece cada
 * punto de atención.
 */
async function sujetosDelProceso(
  supabase: Db, orgId: string, processId: string
): Promise<Set<string>> {
  const ids = new Set<string>();
  const añade = (filas: { [k: string]: unknown }[] | null, col: string) => {
    for (const f of filas ?? []) if (f[col]) ids.add(f[col] as string);
  };
  const q = (tabla: string, col: string) => supabase.from(tabla).select(col)
    .eq("organization_id", orgId).eq("process_id", processId);

  const [riesgos, casos, objetivos, docs, reqs, comps] = await Promise.all([
    q("quality_risk_processes", "risk_id"),
    q("work_case_processes", "case_id"),
    q("quality_objective_processes", "objective_id"),
    q("quality_process_documents", "document_id"),
    q("quality_stakeholder_requirement_processes", "requirement_id"),
    q("quality_competency_requirements", "competency_id"),
  ]);
  añade(riesgos.data as never, "risk_id");
  añade(casos.data as never, "case_id");
  añade(objetivos.data as never, "objective_id");
  añade(docs.data as never, "document_id");
  añade(reqs.data as never, "requirement_id");
  añade(comps.data as never, "competency_id");

  const [inds, halls] = await Promise.all([
    supabase.from("quality_indicators").select("id")
      .eq("organization_id", orgId).eq("scope_process_id", processId),
    supabase.from("quality_audit_findings").select("id")
      .eq("organization_id", orgId).eq("process_id", processId),
  ]);
  añade(inds.data as never, "id");
  añade(halls.data as never, "id");
  // El propio proceso también puede ser sujeto de atención.
  ids.add(processId);
  return ids;
}

// ---------------------------------------------------------------------------
// La consulta
// ---------------------------------------------------------------------------

/**
 * Lo que B4 preguntará: qué requiere atención, ya convergido.
 *
 * El orden de las fuentes decide qué observador queda visible cuando varios ven
 * lo mismo. Se ordena por cercanía a la verdad —el dominio, luego la regla,
 * luego el barrido— antes de converger.
 */
export async function loadAttention(
  query: AttentionQuery, client?: Db
): Promise<ConvergedAttention> {
  const supabase = await db(client);
  const orgId = query.organizationId;

  let rel: Relevos = { superseded: new Set(), reglas: new Map() };
  let relevoStatus: SectionStatus = "ok";
  try { rel = await relevos(supabase, orgId); }
  catch (e) {
    relevoStatus = esFaltaDePermiso(e as { code?: string }) ? "not_visible" : "unavailable";
  }

  const sinRegistrar = { n: 0 };
  const cargas = await Promise.all([
    fuente("quality_signals", "Señales de reglas",
      () => desdeSenales(supabase, orgId, rel)),
    fuente("work_alerts", "Avisos",
      () => desdeAvisos(supabase, orgId, rel, sinRegistrar)),
    fuente("work_tasks", "Pendientes",
      () => desdeTareas(supabase, orgId, rel, sinRegistrar)),
    fuente("quality_supplier_signals", "Señales de proveedores",
      () => desdeSenalDeDominio(supabase, orgId, "quality_supplier_signals",
        "profile_id", SUPPLIER_KINDS, rel)),
    fuente("quality_customer_signals", "Señales de voz del cliente",
      () => desdeSenalDeDominio(supabase, orgId, "quality_customer_signals",
        "feedback_id", CUSTOMER_KINDS, rel)),
    fuente("quality_knowledge_signals", "Señales de conocimiento",
      () => desdeSenalDeDominio(supabase, orgId, "quality_knowledge_signals",
        "knowledge_item_id", KNOWLEDGE_KINDS, rel)),
  ]);

  const sources: AttentionSourceStatus[] = [
    { source: "quality_automation_rules", label: "Catálogo de reglas",
      status: relevoStatus, count: relevoStatus === "ok" ? rel.reglas.size : null },
    ...cargas.map((c) => c.status),
  ];

  let todos = cargas.flatMap((c) => c.items).sort(byObserverPriority);

  if (query.domain) {
    todos = todos.filter((i) => i.domain === query.domain);
  }
  if (query.processId) {
    const ids = await sujetosDelProceso(supabase, orgId, query.processId);
    todos = todos.filter((i) => ids.has(i.subjectId));
  }

  const { items, alsoSeenBy } = converge(todos);
  return {
    items,
    alsoSeenBy: Object.fromEntries(alsoSeenBy),
    sources,
    unregistered: sinRegistrar.n,
    complete: sources.every((s) => s.status === "ok"),
  };
}
