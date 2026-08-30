/**
 * Trazaloop · QUALITY-13B1 · El contrato de integración de Quality.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 *
 * QUALITY-13A encontró trece dominios completos y desintegrados por el eje que
 * los une: veinticinco tablas guardan `process_id` y ninguna pantalla responde
 * «qué significa esto para el proceso X». Cada dominio tiene su cargador, su
 * forma de contar y su manera de construir un enlace, y no hay un contrato
 * común.
 *
 * Esto es el contrato. Nada más: ni un almacén, ni un tablero, ni una sexta
 * tabla de atención. Cinco piezas pequeñas —tiempo, enlace, sección, atención
 * y observador— que los cargadores de los dominios rellenan y que B2, B3, B4 y
 * B5 consumirán sin volver a inventarlas.
 *
 * LAS TRES REGLAS QUE MÁS PESAN
 *
 *   · **Sin dato NO es cero.** Una sección que no se pudo leer, o que quien
 *     pregunta no puede ver, devuelve `null` y lo dice. Convertir un fallo o un
 *     permiso en «0» es la forma más limpia de mentir, y este repositorio ya la
 *     sufrió en QUALITY-12.2F.
 *   · **Cada cosa lleva a su causa.** Un aviso que dice «3 vencidas» y no lleva
 *     a ninguna de las tres es una cifra, no un aviso (QI-26).
 *   · **Todo declara su tiempo.** Presente, a una fecha o de un periodo. Nunca
 *     los tres mezclados sin decirlo (QI-29).
 *
 * NO es `server-only`: lo usan la capa de datos y, más adelante, la pantalla.
 */

// ===========================================================================
// 1 · EL TIEMPO (QI-29)
// ===========================================================================

export const TEMPORAL_MODES = ["current", "as_of", "period"] as const;
export type TemporalMode = (typeof TEMPORAL_MODES)[number];

/**
 * Qué momento describe un dato integrado.
 *
 * No todos los dominios necesitan el mismo modelo temporal, y no lo van a
 * tener: hoy ocho fuentes reconstruyen a fecha, ocho responden por periodo y
 * ocho solo el presente. Lo que no puede pasar es que una pantalla integrada
 * mezcle los tres sin decirlo.
 */
export type TemporalScope =
  | { mode: "current" }
  | { mode: "as_of"; asOf: string }
  | { mode: "period"; from: string; to: string };

export const CURRENT: TemporalScope = { mode: "current" };
export const asOf = (fecha: string): TemporalScope => ({ mode: "as_of", asOf: fecha });
export const period = (from: string, to: string): TemporalScope =>
  ({ mode: "period", from, to });

/** La etiqueta que la pantalla tiene que enseñar. Es obligatoria: un dato
 *  temporal sin etiqueta es un dato que afirma más de lo que sabe. */
export function temporalLabel(scope: TemporalScope): string {
  if (scope.mode === "as_of") return `Estado al ${scope.asOf}`;
  if (scope.mode === "period") return `Periodo del ${scope.from} al ${scope.to}`;
  return "Estado actual";
}

/**
 * ¿Se pueden enseñar juntas estas dos cosas sin etiquetarlas?
 *
 * Solo si describen el mismo momento. En cuanto difieren, la pantalla tiene que
 * decir cuál es cuál —que es exactamente lo que 12.3 aprendió y lo que QI-29
 * generaliza—.
 */
export function sameMoment(a: TemporalScope, b: TemporalScope): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === "as_of" && b.mode === "as_of") return a.asOf === b.asOf;
  if (a.mode === "period" && b.mode === "period") {
    return a.from === (b as { from: string }).from && a.to === (b as { to: string }).to;
  }
  return true;
}

// ===========================================================================
// 2 · EL ENLACE A LA CAUSA (QI-26)
// ===========================================================================

/**
 * Los sujetos que la integración sabe nombrar.
 *
 * Vocabulario CERRADO, y a propósito con los mismos nombres que ya usan
 * `work_events.subject_type`, `quality_signals.subject_type` y los contratos de
 * automatización. Inventar un tercer vocabulario para lo mismo habría obligado
 * a traducir en cada frontera.
 */
export const INTEGRATION_SUBJECTS = [
  "quality_process", "quality_position", "quality_indicator", "quality_objective",
  "quality_risk", "quality_opportunity", "quality_control",
  "work_case", "work_action",
  "trazadoc_document",
  "quality_audit", "quality_audit_finding",
  "quality_supplier_profile", "quality_supplier_scope", "quality_supplier_evaluation",
  "quality_customer_profile", "quality_customer_feedback", "quality_survey_campaign",
  "quality_person", "quality_competency", "quality_knowledge_item",
  "quality_management_review",
  "quality_stakeholder_assessment", "quality_stakeholder_requirement",
  "quality_stakeholder_strategy",
  "quality_signal", "quality_automation_rule",
] as const;
export type IntegrationSubject = (typeof INTEGRATION_SUBJECTS)[number];

/**
 * Dónde vive cada sujeto. Con identificador si tiene ficha propia; sin él, la
 * pantalla de su dominio.
 *
 * ESTO EXISTE PARA QUE NADIE VUELVA A ESCRIBIR UNA URL A MANO. Hoy los
 * adaptadores de Intelligence construyen veinte enlaces con plantillas sueltas;
 * el día que una ruta cambie habrá que encontrarlas todas. Aquí hay un sitio.
 *
 * Y son enlaces **de Quality**. Ni uno apunta a PCR ni a Textiles: este módulo
 * funciona en empresas que no los tienen, y un enlace a un módulo ausente es
 * una puerta a una pantalla que no existe.
 */
const RUTA: Record<IntegrationSubject, { base: string; detalle?: (id: string) => string }> = {
  quality_process: { base: "/quality/processes", detalle: (id) => `/quality/processes/${id}` },
  quality_position: { base: "/quality/positions", detalle: (id) => `/quality/people/positions/${id}` },
  quality_indicator: { base: "/quality/indicators", detalle: (id) => `/quality/indicators/${id}` },
  quality_objective: { base: "/quality/objectives", detalle: (id) => `/quality/objectives/${id}` },
  quality_risk: { base: "/quality/risks", detalle: (id) => `/quality/risks/${id}` },
  quality_opportunity: {
    base: "/quality/risks", detalle: (id) => `/quality/risks/opportunities/${id}` },
  // Un control vive dentro de su riesgo: no tiene ficha propia.
  quality_control: { base: "/quality/risks" },
  work_case: { base: "/quality/cases", detalle: (id) => `/quality/cases/${id}` },
  // Una acción se lee dentro de su caso; el enlace directo a la acción no
  // existe, y fingirlo llevaría a una página en blanco.
  work_action: { base: "/quality/cases" },
  trazadoc_document: { base: "/quality/documents", detalle: (id) => `/quality/documents/${id}` },
  quality_audit: { base: "/quality/audits", detalle: (id) => `/quality/audits/${id}` },
  quality_audit_finding: { base: "/quality/audits/findings" },
  quality_supplier_profile: {
    base: "/quality/suppliers", detalle: (id) => `/quality/suppliers/${id}` },
  quality_supplier_scope: { base: "/quality/suppliers" },
  quality_supplier_evaluation: {
    base: "/quality/suppliers/evaluations",
    detalle: (id) => `/quality/suppliers/evaluations/${id}` },
  quality_customer_profile: {
    base: "/quality/customer-voice/customers",
    detalle: (id) => `/quality/customer-voice/customers/${id}` },
  quality_customer_feedback: { base: "/quality/customer-voice/feedback" },
  quality_survey_campaign: {
    base: "/quality/customer-voice/campaigns",
    detalle: (id) => `/quality/customer-voice/campaigns/${id}` },
  quality_person: { base: "/quality/people", detalle: (id) => `/quality/people/${id}` },
  quality_competency: { base: "/quality/people/competencies" },
  quality_knowledge_item: { base: "/quality/people/knowledge" },
  quality_management_review: {
    base: "/quality/management-review", detalle: (id) => `/quality/management-review/${id}` },
  quality_stakeholder_assessment: {
    base: "/quality/context/interested-parties",
    detalle: (id) => `/quality/context/interested-parties/${id}` },
  quality_stakeholder_requirement: { base: "/quality/context/interested-parties" },
  quality_stakeholder_strategy: { base: "/quality/context/interested-parties" },
  quality_signal: {
    base: "/quality/automation/signals",
    detalle: (id) => `/quality/automation/signals/${id}` },
  quality_automation_rule: {
    base: "/quality/automation/rules", detalle: (id) => `/quality/automation/rules/${id}` },
};

/**
 * El enlace de un sujeto. Con identificador cuando ese sujeto tiene ficha; sin
 * él —o si no la tiene— la pantalla de su dominio, que es un destino honesto y
 * no un 404.
 */
export function deepLink(kind: IntegrationSubject, id?: string | null): string {
  const ruta = RUTA[kind];
  if (id && ruta.detalle) return ruta.detalle(id);
  return ruta.base;
}

/** ¿Este sujeto lleva a una ficha concreta, o solo a su listado? Lo necesita la
 *  pantalla para no prometer más de lo que hay. */
export function hasDetailRoute(kind: IntegrationSubject): boolean {
  return Boolean(RUTA[kind].detalle);
}

/** Todos los destinos que este contrato puede producir. Existe para que una
 *  prueba compruebe que ninguno se sale de Quality. */
export function allDeepLinks(): string[] {
  return Object.values(RUTA).flatMap((r) => [r.base, ...(r.detalle ? [r.detalle("x")] : [])]);
}

// ===========================================================================
// 3 · LA SECCIÓN DE CONTEXTO (QI-04, QI-05)
// ===========================================================================

/**
 * En qué estado llegó una sección.
 *
 *   ok            se leyó y esto es lo que hay —aunque sea nada—.
 *   unavailable   NO se pudo leer. No es cero: es que no se sabe.
 *   not_visible   quien pregunta no tiene permiso sobre ese dominio.
 *
 * La diferencia entre los tres no es cosmética. «Cero riesgos» y «no se pudo
 * leer los riesgos» son afirmaciones distintas, y solo una de las dos permite
 * dormir tranquilo.
 */
export const SECTION_STATUSES = ["ok", "unavailable", "not_visible"] as const;
export type SectionStatus = (typeof SECTION_STATUSES)[number];

/** Una fila resumida dentro de una sección. Lo justo para enseñar y enlazar;
 *  el detalle vive en el dominio dueño. */
export type ContextItem = {
  subjectKind: IntegrationSubject;
  subjectId: string;
  label: string;
  /** El estado propio del dominio, tal cual. Aquí no se traduce ni se puntúa. */
  state?: string | null;
  /** La gravedad del dominio, si el dominio tiene una. Nunca se inventa. */
  severity?: string | null;
  href: string;
  /**
   * ¿Este `href` abre la ficha de ESTA fila?
   *
   * Por omisión lo dice `hasDetailRoute` del tipo de sujeto, y con eso basta casi
   * siempre. La excepción la encontró la aceptación de QUALITY-13B2: un documento
   * de TrazaDocs **sí** tiene ficha, pero la tiene en el módulo del que es dueño.
   * Un proceso de Quality puede referenciar un documento de PCR o de Textiles
   * —la pantalla de vinculación ofrece los de cualquier módulo de la empresa— y
   * mandarlo a `/quality/documents/…` devuelve un 404.
   *
   * Cuando el cargador sabe que la ficha no está donde su tipo dice, lo pone a
   * `false` y la pantalla enseña la fila sin enlace. Ni se esconde, ni se
   * promete una puerta que no abre.
   */
  linksToDetail?: boolean;
};

export type ContextSection = {
  key: string;
  label: string;
  status: SectionStatus;
  /** Cuántos hay. `null` cuando no se sabe —fallo o permiso—, nunca 0. */
  count: number | null;
  /** Cuántos piden atención, si el dominio lo determina. `null` si no. */
  attentionCount: number | null;
  items: ContextItem[];
  /** A dónde se va para trabajar de verdad. El mirador no edita nada. */
  href: string;
  temporal: TemporalScope;
  /** Por qué no hay dato, cuando no lo hay. Se enseña. */
  reason?: string;
};

export function okSection(input: {
  key: string; label: string; count: number; items: ContextItem[]; href: string;
  attentionCount?: number | null; temporal?: TemporalScope;
}): ContextSection {
  return {
    key: input.key, label: input.label, status: "ok",
    count: input.count, attentionCount: input.attentionCount ?? null,
    items: input.items, href: input.href, temporal: input.temporal ?? CURRENT,
  };
}

export function unavailableSection(
  key: string, label: string, href: string, reason: string
): ContextSection {
  return {
    key, label, status: "unavailable", count: null, attentionCount: null,
    items: [], href, temporal: CURRENT,
    reason: reason || "No se pudo leer esta sección.",
  };
}

export function notVisibleSection(
  key: string, label: string, href: string
): ContextSection {
  return {
    key, label, status: "not_visible", count: null, attentionCount: null,
    items: [], href, temporal: CURRENT,
    reason: "Tu rol no da acceso a este dominio.",
  };
}

/** El total de una sección para enseñarlo. `null` se enseña como «sin dato»,
 *  jamás como 0. */
export function sectionCount(s: ContextSection): number | null {
  return s.status === "ok" ? s.count : null;
}

/** ¿Se puede afirmar algo con esta composición? Si alguna sección no se pudo
 *  leer, el conjunto es incompleto y hay que decirlo. */
export function compositionIsComplete(sections: ContextSection[]): boolean {
  return sections.every((s) => s.status === "ok");
}

// ===========================================================================
// 4 · LA ATENCIÓN (QI-07, QI-09, QI-10, QI-26)
// ===========================================================================

/**
 * De dónde sale una observación de atención.
 *
 * Es el vocabulario del inventario de QUALITY-13A §4.bis, puesto en código para
 * que B3 pueda distinguir sin adivinar qué es cada mecanismo.
 */
export const OBSERVER_KINDS = [
  "truth_source", "active_observer", "superseded_observer", "legacy_sweep",
] as const;
export type ObserverKind = (typeof OBSERVER_KINDS)[number];

export type Observer = {
  /** El identificador del mecanismo: código de regla, nombre de barrido, o el
   *  dominio cuando la verdad es el propio estado. */
  code: string;
  kind: ObserverKind;
  /** A quién releva, cuando releva a alguien. Es el mecanismo que QUALITY-11.1
   *  dejó construido y que B3 va a usar seis veces más. */
  supersedes?: string | null;
};

/**
 * Una cosa que pide atención.
 *
 * NO lleva una «gravedad de Quality» inventada: lleva la del dominio si el
 * dominio tiene una. Un sistema que puntúa de 1 a 100 problemas de siete
 * dominios distintos está comparando cosas que no se comparan.
 */
export type AttentionItem = {
  domain: string;
  subjectKind: IntegrationSubject;
  subjectId: string;
  label: string;
  /** Por qué pide atención, en la lengua del dominio. */
  reason: string;
  /** El estado actual del sujeto, si lo tiene. */
  state?: string | null;
  /** La del dominio, tal cual. `null` si el dominio no gradúa. */
  severity?: string | null;
  /** Desde cuándo. Sirve para ordenar por antigüedad sin inventar prioridad. */
  since?: string | null;
  href: string;
  observer: Observer;
  temporal: TemporalScope;
  /** La identidad estable del problema. Ver `attentionKey`. */
  dedupeKey: string;
};

/**
 * La identidad de un problema.
 *
 * DOS COSAS QUE NO SE PUEDEN CONFUNDIR, y que esta clave separa:
 *
 *   · El MISMO problema visto por dos observadores distintos —el estado del
 *     dominio y una regla de automatización— tiene la misma clave y se muestra
 *     una vez.
 *   · DOS problemas distintos del mismo sujeto —un riesgo con la revisión
 *     vencida y sin tratamiento— tienen claves distintas y se muestran los dos.
 *
 * Por eso la clave es `dominio:sujeto:condición` y NO incluye al observador: si
 * lo incluyera, dos observadores del mismo problema no convergerían nunca, que
 * es justo lo que hoy pasa con las cinco verdades de atención.
 *
 * Y NUNCA se deduplica por el texto que se enseña: el texto cambia al
 * traducirlo, al reescribirlo o al añadirle una fecha.
 */
export function attentionKey(input: {
  domain: string; subjectKind: IntegrationSubject; subjectId: string; condition: string;
}): string {
  const limpio = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");
  return `${limpio(input.domain)}:${input.subjectKind}:${input.subjectId}:${limpio(input.condition)}`;
}

/**
 * Une lo que es el mismo problema y conserva lo que no lo es.
 *
 * Cuando dos observadores ven lo mismo gana el primero que llegó, y se apunta
 * quién más lo vio: perder esa lista impediría después saber que el barrido
 * heredado y la regla nueva estaban diciendo lo mismo.
 */
export function dedupeAttention(
  items: AttentionItem[]
): { items: AttentionItem[]; alsoSeenBy: Map<string, string[]> } {
  const porClave = new Map<string, AttentionItem>();
  const tambien = new Map<string, string[]>();
  for (const it of items) {
    const previo = porClave.get(it.dedupeKey);
    if (!previo) { porClave.set(it.dedupeKey, it); continue; }
    if (previo.observer.code !== it.observer.code) {
      tambien.set(it.dedupeKey, [...(tambien.get(it.dedupeKey) ?? []), it.observer.code]);
    }
  }
  return { items: [...porClave.values()], alsoSeenBy: tambien };
}

// ===========================================================================
// 5 · LA FRONTERA DE LA TAREA PROPIA (QI-24)
// ===========================================================================

/**
 * Tarea propia de dominio ≠ acción transversal.
 *
 * `work_actions` se usa cuando hay una acción transversal explícita que
 * gestionar conforme a AC-01…AC-35. Una capacitación, una verificación de
 * eficacia o una actividad de desarrollo siguen siendo objetos de su dominio.
 *
 * Esta lista existe para que ningún cargador de integración dé por sentado que
 * «todo lo pendiente es una acción». Si lo diera, la bandeja de acciones se
 * convertiría en un calendario de formación y dejaría de reconocerse lo que de
 * verdad es una acción correctiva.
 */
export const DOMAIN_NATIVE_TASK_TABLES = [
  "quality_development_plan_items",
  "quality_learning_activities",
  "quality_knowledge_transfer_plans",
  "quality_measurements",
  "quality_supplier_evaluations",
  "quality_stakeholder_reviews",
] as const;

export function isDomainNativeTask(table: string): boolean {
  return (DOMAIN_NATIVE_TASK_TABLES as readonly string[]).includes(table);
}

/** Lo que una tarea propia puede hacer con una acción transversal: **citarla**.
 *  Nunca copiar su estado, que sería la segunda verdad de siempre. */
export type NativeTaskLink = {
  nativeTable: string;
  nativeId: string;
  workActionId: string;
};
