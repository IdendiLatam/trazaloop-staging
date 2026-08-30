/**
 * Trazaloop · QUALITY-13B4 · Cómo se lee la portada de Quality.
 *
 * QUÉ CAMBIA RESPECTO DE LA PORTADA VIEJA
 *
 * La de antes preguntaba a doce dominios, cada uno con su forma de contar, y
 * enseñaba diez bloques del mismo tamaño. Si dos dominios contaban el mismo
 * problema, lo enseñaba dos veces sin saberlo, y quien entraba tenía que leer
 * las diez cajas para averiguar qué importaba.
 *
 * La nueva pregunta UNA cosa —qué requiere atención— a la consulta convergida
 * de B3, y deja los recuentos administrativos donde deben estar: debajo, y en
 * pequeño. Un total de registros no es una señal.
 *
 * LO QUE ESTE ARCHIVO DECIDE, Y POR ESO NO ESTÁ EN EL COMPONENTE
 *
 * El agrupado de la atención, el orden de los dominios, los textos de cada
 * estado y —lo que más pesa— **cuándo se puede decir que no hay nada**. Esa
 * última decisión tiene una regla y no admite matices: solo si TODAS las
 * fuentes se leyeron. Con una caída, callar sería decir «todo bien» sin
 * saberlo.
 *
 * NO es `server-only`: lo usan el cargador, la pantalla y las pruebas.
 */

import { temporalLabel, type AttentionItem } from "@/lib/domain/quality-integration";
import {
  DUE_SOON_OBSERVERS, OVERDUE_OBSERVERS, observerByCode,
} from "@/lib/domain/quality-observers";
import {
  AUTOMATION_DOMAIN_LABEL, type AutomationDomain,
} from "@/lib/domain/quality-automation";
import type { AttentionSummary } from "@/lib/domain/quality-attention";

// ===========================================================================
// 1 · EL NOMBRE DE CADA DOMINIO (§22)
// ===========================================================================

/**
 * Vocabulario de producto, nunca de base de datos.
 *
 * Se reutiliza el del motor de automatización porque ya existe, ya está
 * traducido y ya es el que la empresa ve al escribir una regla. Tener dos
 * listas de nombres para las mismas trece cosas es cómo empiezan a divergir.
 */
const EXTRA_LABEL: Record<string, string> = {
  // Los observadores nombran su dominio con la palabra de su barrido; el
  // catálogo de automatización usa la del módulo. Son la misma cosa.
  customer: "Voz del cliente",
  actions: "Casos y acciones",
  cases: "Casos y acciones",
  automation: "Automatización",
};

export function domainLabel(domain: string): string {
  return EXTRA_LABEL[domain]
    ?? AUTOMATION_DOMAIN_LABEL[domain as AutomationDomain]
    ?? domain;
}

// ===========================================================================
// 2 · EL AGRUPADO DE LA ATENCIÓN (§3)
// ===========================================================================

/**
 * Tres grupos, y ni uno inventado.
 *
 *   overdue    la condición habla de una fecha que ya pasó
 *   due_soon   habla de una que se acerca
 *   state      no habla de fechas: es un estado del dominio
 *
 * Quién cae en cuál lo dice B3, observador por observador y declarado a mano.
 * Inventar «alta / media / baja» encima de trece dominios que gradúan distinto
 * sería la escala global que QI-09 prohíbe.
 */
export const ATTENTION_GROUPS = ["overdue", "due_soon", "state"] as const;
export type AttentionGroup = (typeof ATTENTION_GROUPS)[number];

export const GROUP_LABEL: Record<AttentionGroup, string> = {
  overdue: "Vencido",
  due_soon: "Se acerca",
  state: "Por su estado",
};

export const GROUP_HINT: Record<AttentionGroup, string> = {
  overdue: "La fecha ya pasó.",
  due_soon: "Todavía se puede hacer algo.",
  state: "No depende de una fecha: es cómo está la cosa ahora.",
};

export function groupOf(item: AttentionItem): AttentionGroup {
  if (OVERDUE_OBSERVERS.includes(item.observer.code)) return "overdue";
  if (DUE_SOON_OBSERVERS.includes(item.observer.code)) return "due_soon";
  return "state";
}

export type AttentionGrouping = { group: AttentionGroup; items: AttentionItem[] }[];

/** Agrupa conservando el orden de llegada y sin grupos vacíos. */
export function groupAttention(items: AttentionItem[]): AttentionGrouping {
  return ATTENTION_GROUPS
    .map((group) => ({ group, items: items.filter((i) => groupOf(i) === group) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Lo que se enseña de cada punto: la cosa afectada, su dominio, por qué, cuándo
 * y a dónde se va.
 *
 * `reason` viene del dominio —no se reescribe aquí— y el observador NO se
 * enseña: «barrido», «releva» y «clave de deduplicación» son vocabulario de
 * dentro (§14).
 */
export type AttentionLine = {
  key: string;
  subject: string;
  domain: string;
  reason: string;
  severity: string | null;
  temporal: string;
  href: string;
  /** La aclaración que impide leer esto como una no conformidad, si aplica. */
  note: string | null;
};

export function toLine(item: AttentionItem): AttentionLine {
  return {
    key: item.dedupeKey,
    note: attentionNote(item.observer.code),
    subject: item.label,
    domain: domainLabel(item.domain),
    reason: item.reason,
    severity: item.severity ?? null,
    temporal: temporalLabel(item.temporal),
    href: item.href,
  };
}

/** El tope de líneas que se pintan. Una portada no es un listado: para verlos
 *  todos está el dominio dueño. */
export const HOME_SAMPLE = 8;

/**
 * La aclaración que va DEBAJO de ciertos puntos, y no en un pie de página.
 *
 * Un indicador fuera de meta y un hallazgo sin evaluar son las dos cosas que
 * más fácilmente se leen como «no conformidad» en una portada. Decirlo en la
 * línea, justo donde aparece la cifra, es lo único que funciona: una nota al
 * final la lee quien ya se ha hecho la idea equivocada.
 *
 * La clasificación la hace su dominio, no esta pantalla.
 */
export const ATTENTION_NOTE: Record<string, string> = {
  "quality_emit_performance_signals.indicator_target_missed":
    "Estar fuera de meta no es por sí mismo una no conformidad.",
  "quality_scan_audits.audit_finding_unevaluated":
    "Un hallazgo no es una no conformidad hasta que la auditoría lo evalúa.",
  "quality_scan_customer_voice.complaint_unreviewed":
    "Una queja sin revisar no es una no conformidad: alguien decide si abre un caso.",
};

export function attentionNote(observerCode: string): string | null {
  return ATTENTION_NOTE[observerCode] ?? null;
}

// ===========================================================================
// 3 · CUÁNDO SE PUEDE DECIR QUE NO HAY NADA (§15, §16)
// ===========================================================================

export type SourceState = { source: string; label: string; status: string };

export type HomeAttentionState =
  /** Hay cosas que atender. */
  | { kind: "items" }
  /** Todo se leyó y no hay nada. Es la ÚNICA situación en la que se puede
   *  decir que no hay nada. */
  | { kind: "all_clear"; text: string }
  /** No hay nada A LA VISTA, pero falta por leer. No es lo mismo. */
  | { kind: "incomplete_empty"; text: string };

/**
 * La decisión más delicada de la portada.
 *
 * Decir «no hay asuntos» cuando una fuente falló es exactamente la mentira de
 * QUALITY-12.2F, y en una portada pesa más: quien la lee cierra el navegador
 * tranquilo.
 *
 * Y el texto del despejado **no afirma conformidad**. Dice qué se miró y
 * cuándo; no dice que la empresa cumpla nada. Trazaloop no certifica.
 */
export function attentionState(
  total: number, sources: SourceState[]
): HomeAttentionState {
  if (total > 0) return { kind: "items" };
  const completo = sources.every((s) => s.status === "ok");
  if (completo) {
    return {
      kind: "all_clear",
      text: "No hay asuntos que requieran atención según la información observada ahora mismo.",
    };
  }
  return {
    kind: "incomplete_empty",
    text: "No hay asuntos a la vista, pero falta información por leer: esto no es un «todo en orden».",
  };
}

/** Las fuentes que no se pudieron leer, para decirlo sin jerga. */
export function incompleteSources(sources: SourceState[]): SourceState[] {
  return sources.filter((s) => s.status !== "ok");
}

export function incompleteNotice(sources: SourceState[]): string | null {
  const rotas = incompleteSources(sources);
  if (rotas.length === 0) return null;
  const sinAcceso = rotas.filter((s) => s.status === "not_visible");
  const caidas = rotas.filter((s) => s.status !== "not_visible");
  const partes: string[] = [];
  if (caidas.length > 0) {
    partes.push(
      `No fue posible cargar ${caidas.length === 1 ? "una parte" : `${caidas.length} partes`} de la información.`);
  }
  if (sinAcceso.length > 0) {
    partes.push("Tu rol no da acceso a alguno de los dominios.");
  }
  partes.push("Lo que se ve es cierto; no está todo.");
  return partes.join(" ");
}

// ===========================================================================
// 4 · LOS DOMINIOS DE LA PORTADA (§9)
// ===========================================================================

/**
 * El orden es el del menú, no el de la norma ni el del cargador.
 *
 * Cada baldosa dice DOS cosas y las distingue: cuánto hay —contexto
 * administrativo— y cuánto pide atención —de B3—. Ni una sola baldosa cuenta
 * la atención por su cuenta: eso reintroduciría la duplicación que B3 quitó.
 */
export type HomeDomain = {
  key: string;
  label: string;
  href: string;
  /** Los dominios de atención que caen en esta baldosa. Varias claves para una
   *  baldosa es lo normal: «Casos y acciones» recibe dos. */
  attentionDomains: readonly string[];
};

export const HOME_DOMAINS: readonly HomeDomain[] = [
  { key: "context", label: "Contexto", href: "/quality/context/interested-parties",
    attentionDomains: ["interested_parties"] },
  { key: "processes", label: "Procesos", href: "/quality/processes",
    attentionDomains: ["processes"] },
  { key: "risks", label: "Riesgos y oportunidades", href: "/quality/risks",
    attentionDomains: ["risks"] },
  { key: "performance", label: "Objetivos e indicadores", href: "/quality/objectives",
    attentionDomains: ["objectives", "indicators"] },
  { key: "cases", label: "Casos y acciones", href: "/quality/cases",
    attentionDomains: ["cases", "actions"] },
  { key: "documents", label: "Documentos", href: "/quality/documents",
    attentionDomains: ["documents"] },
  { key: "people", label: "Personas", href: "/quality/people",
    attentionDomains: ["people"] },
  { key: "suppliers", label: "Proveedores", href: "/quality/suppliers",
    attentionDomains: ["suppliers"] },
  { key: "customer", label: "Voz del cliente", href: "/quality/customer-voice/feedback",
    attentionDomains: ["customer"] },
  { key: "audits", label: "Auditorías", href: "/quality/audits",
    attentionDomains: ["audits"] },
  { key: "management_review", label: "Revisión por la dirección",
    href: "/quality/management-review", attentionDomains: ["management_review"] },
  { key: "automation", label: "Automatización", href: "/quality/automation/rules",
    attentionDomains: ["automation"] },
];

/** Cuánta atención le toca a una baldosa, sumando SUS dominios del resumen ya
 *  deduplicado. Nunca se cuenta nada aquí. */
export function domainAttention(tile: HomeDomain, summary: AttentionSummary): number {
  return tile.attentionDomains.reduce((n, d) => n + (summary.byDomain[d] ?? 0), 0);
}

/** Los dominios de atención que ninguna baldosa recoge. Debe estar vacío: si
 *  no, hay atención que la portada no sabe dónde poner, y callarla sería
 *  perderla. */
export function unplacedDomains(summary: AttentionSummary): string[] {
  const colocados = new Set(HOME_DOMAINS.flatMap((d) => d.attentionDomains));
  return Object.keys(summary.byDomain).filter((d) => !colocados.has(d));
}

// ===========================================================================
// 5 · LOS FILTROS (§20, §21, §22)
// ===========================================================================

/**
 * Los filtros se resuelven EN SERVIDOR, con los parámetros de B3.
 *
 * Filtrar en el navegador sobre una muestra daría un total que no es un total:
 * se enseñarían ocho líneas y se filtrarían ocho, no las doscientas que hay.
 */
export type HomeFilters = { domain: string | null; processId: string | null };

export function parseFilters(params: {
  dominio?: string | string[]; proceso?: string | string[];
}): HomeFilters {
  const uno = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v)?.trim() || null;
  const dominio = uno(params.dominio);
  const conocidos = new Set(HOME_DOMAINS.flatMap((d) => d.attentionDomains));
  return {
    // Un dominio que no existe se ignora en vez de devolver vacío: un filtro
    // roto por una URL mal copiada no puede parecer «no hay nada».
    domain: dominio && conocidos.has(dominio) ? dominio : null,
    processId: uno(params.proceso),
  };
}

export function filterHref(base: string, filters: HomeFilters): string {
  const q = new URLSearchParams();
  if (filters.domain) q.set("dominio", filters.domain);
  if (filters.processId) q.set("proceso", filters.processId);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Qué se está mirando, dicho en una frase. */
export function filterSummary(filters: HomeFilters, processName: string | null): string | null {
  const partes: string[] = [];
  if (filters.domain) partes.push(domainLabel(filters.domain));
  if (filters.processId) partes.push(processName ?? "un proceso");
  return partes.length > 0 ? partes.join(" · ") : null;
}

// ===========================================================================
// 6 · LO QUE NO SE ENSEÑA
// ===========================================================================

/**
 * Vocabulario de dentro. Si alguna de estas palabras llega a la pantalla, la
 * portada está contando cómo está hecha en vez de qué pasa (§14).
 */
export const INTERNAL_VOCABULARY: readonly string[] = [
  "observador", "observer", "barrido", "sweep", "supersedes", "dedupe",
  "dedupe_key", "quality_signals", "work_alerts", "work_tasks",
];

/** El nombre legible de la condición de un punto, para agrupar sin jerga. */
export function conditionLabel(item: AttentionItem): string {
  return observerByCode(item.observer.code)?.condition ?? item.reason;
}
