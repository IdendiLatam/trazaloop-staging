/**
 * Trazaloop · QUALITY-13B2 · Cómo se lee el mirador de proceso.
 *
 * POR QUÉ ESTO NO ESTÁ EN EL COMPONENTE
 *
 * Porque §2 del encargo dice lo que 12.3 aprendió a golpes: la pantalla
 * **renderiza**, no decide. El orden de los bloques, qué frase se enseña cuando
 * una sección viene vacía, cuál cuando no se pudo leer, qué pide atención y
 * cuándo hay que avisar de que se están mezclando dos momentos distintos: todo
 * eso son decisiones, se prueban sin montar un DOM, y por eso viven aquí.
 *
 * El componente recibe estructuras y las pinta. Si alguna vez hay que cambiar
 * el orden de las secciones o el texto de un estado vacío, se cambia en este
 * archivo y la prueba lo ve.
 *
 * LO QUE ESTE ARCHIVO NO HACE, Y NO VA A HACER
 *
 *   · No consulta nada. Recibe lo que compuso B1.
 *   · No inventa una gravedad de Quality. Si el dominio no gradúa, no se
 *     gradúa.
 *   · No convierte un hallazgo en no conformidad ni un indicador fuera de meta
 *     en un incumplimiento. Esas dos traducciones son de sus dominios, y
 *     hacerlas aquí sería afirmar en nombre de otro.
 *
 * NO es `server-only`: lo usan el cargador, la pantalla y las pruebas.
 */

import {
  CURRENT, attentionKey, sameMoment, temporalLabel,
  type AttentionItem, type ContextSection, type TemporalScope,
} from "@/lib/domain/quality-integration";
import { LINK_KIND_LABEL, RELEVANCE_LABEL } from "@/lib/domain/quality-interested-parties";
import { OPPORTUNITY_STATUS_LABEL, RISK_STATUS_LABEL } from "@/lib/domain/risks";
import {
  INDICATOR_ADMIN_STATE_LABEL, OBJECTIVE_ADMIN_STATE_LABEL,
} from "@/lib/domain/quality-indicators";
import { DOCUMENT_STATUS_LABEL } from "@/lib/domain/trazadocs";
import {
  FINDING_EVALUATION_STATUS_LABEL, FINDING_SEVERITY_LABEL,
} from "@/lib/domain/quality-audits";
import { CASE_STATUS_LABEL } from "@/lib/domain/work-cases";

// ===========================================================================
// 1 · EL ORDEN, QUE ES LA LÓGICA DE GESTIÓN Y NO LA DEL CARGADOR
// ===========================================================================

/**
 * B1 devuelve las nueve secciones en el orden en que le convino leerlas. Ese no
 * es el orden en que se piensa un proceso.
 *
 * Aquí se agrupan siguiendo el recorrido real: qué se le exige → qué puede
 * pasar → qué se espera y cómo se mide → con qué se opera → con qué se gobierna
 * → qué encontró la verificación → qué se está atendiendo.
 *
 * Cada bloque agrupa **visualmente**. Los datos siguen separados: objetivo e
 * indicador comparten bloque y NO se funden, porque su semántica temporal y su
 * capacidad de automatización son distintas y fundirlos escondería eso (§12).
 */
export type CockpitBlock = {
  key: string;
  title: string;
  hint: string;
  /** Las secciones de B1 que caen aquí, en el orden en que se enseñan. */
  sectionKeys: readonly string[];
};

export const COCKPIT_BLOCKS: readonly CockpitBlock[] = [
  {
    key: "expectations",
    title: "Qué se le exige",
    hint: "Los requisitos de partes interesadas que este proceso atiende. Se gestionan en Partes interesadas.",
    sectionKeys: ["requirements"],
  },
  {
    key: "planning",
    title: "Qué puede pasar",
    hint: "Riesgos y oportunidades identificados sobre este proceso. Son objetos distintos, no dos filtros de lo mismo.",
    sectionKeys: ["risks", "opportunities"],
  },
  {
    key: "performance",
    title: "Qué se espera y cómo se mide",
    hint: "Objetivos e indicadores relacionados. Un indicador puede medir el proceso sin colgar de ningún objetivo, y un objetivo se mide con varios indicadores.",
    sectionKeys: ["objectives", "indicators"],
  },
  {
    key: "capability",
    title: "Con qué se opera",
    hint: "Las competencias que este proceso requiere de quien lo ejecuta.",
    sectionKeys: ["competencies"],
  },
  {
    key: "evidence",
    title: "Con qué se gobierna y qué lo evidencia",
    hint: "Documentos vinculados. Viven en Documentos: aquí solo se referencian.",
    sectionKeys: ["documents"],
  },
  {
    key: "verification",
    title: "Qué ha encontrado la verificación",
    hint: "Hallazgos de auditoría levantados sobre este proceso.",
    sectionKeys: ["audit_findings"],
  },
  {
    key: "followup",
    title: "Qué se está atendiendo",
    hint: "Casos y acciones transversales relacionados con este proceso.",
    sectionKeys: ["cases"],
  },
] as const;

/**
 * Los bloques con las secciones que de verdad llegaron.
 *
 * Un bloque cuyas secciones no vinieron **no se enseña**. Una sección vacía de
 * un dominio que sí está relacionado sí se enseña, porque «no hay riesgos» es
 * información; una sección de un dominio que no guarda relación con el proceso
 * no aparece nunca, y ese es el «no fake empty section» del encargo.
 */
export function arrangeCockpit(
  sections: readonly ContextSection[]
): { block: CockpitBlock; sections: ContextSection[] }[] {
  const porClave = new Map(sections.map((s) => [s.key, s]));
  return COCKPIT_BLOCKS
    .map((block) => ({
      block,
      sections: block.sectionKeys
        .map((k) => porClave.get(k))
        .filter((s): s is ContextSection => Boolean(s)),
    }))
    .filter((b) => b.sections.length > 0);
}

// ===========================================================================
// 2 · LO QUE SE DICE CUANDO NO HAY FILAS
// ===========================================================================

/**
 * Vacío de verdad, y útil. Ni «0» a secas ni un aviso rojo: que no haya riesgos
 * registrados sobre un proceso no es un problema, es un hecho.
 */
const VACIO: Record<string, string> = {
  requirements: "No hay requisitos de partes interesadas relacionados con este proceso.",
  risks: "No hay riesgos relacionados con este proceso.",
  opportunities: "No hay oportunidades relacionadas con este proceso.",
  objectives: "No hay objetivos relacionados con este proceso.",
  indicators: "Ningún indicador mide este proceso.",
  documents: "No hay documentos vinculados a este proceso.",
  audit_findings: "Ninguna auditoría ha registrado hallazgos sobre este proceso.",
  cases: "No hay casos ni acciones transversales relacionados.",
  competencies: "No se han declarado competencias requeridas para este proceso.",
};

/**
 * La aclaración que evita que dos números correctos parezcan contradecirse, y
 * las dos que evitan que la pantalla afirme en nombre de otro dominio.
 */
export const SECTION_NOTE: Record<string, string> = {
  documents:
    "Incluye los vinculados a una entrada o salida concreta, además de los del proceso entero.",
  indicators:
    "Un indicador fuera de meta pide mirarlo. No es por sí mismo una no conformidad.",
  audit_findings:
    "Un hallazgo es lo que la auditoría observó. Que sea o no una no conformidad lo decide su evaluación.",
  cases:
    "Una tarea propia de otro dominio —una capacitación, una evaluación de proveedor— no es una acción transversal y no se cuenta aquí.",
  requirements:
    "La parte interesada se muestra a través de su requisito: es de donde viene la relación.",
};

export type SectionDisplay =
  | { kind: "items" }
  | { kind: "empty"; text: string }
  | { kind: "no_access"; text: string }
  | { kind: "unavailable"; text: string };

/**
 * En qué estado se enseña una sección.
 *
 * LAS CUATRO SON DISTINTAS, y esa distinción es media razón de ser de B1:
 *
 *   items         hay filas.
 *   empty         se leyó y no hay nada. Un hecho, no un aviso.
 *   no_access     el rol no llega. NI recuento, NI etiquetas, NI existencia.
 *   unavailable   no se pudo leer. Tampoco es cero.
 *
 * `reason` NO se enseña nunca. Trae dentro el mensaje del motor —PostgREST, un
 * código SQL, una traza— y §20 lo prohíbe con razón: quien mira la pantalla no
 * puede hacer nada con «PGRST116», y quien no debería verlo tampoco.
 */
export function sectionDisplay(s: ContextSection): SectionDisplay {
  if (s.status === "not_visible") {
    return { kind: "no_access", text: "Tu rol no da acceso a este dominio." };
  }
  if (s.status === "unavailable") {
    return { kind: "unavailable", text: "No fue posible cargar esta sección." };
  }
  if ((s.count ?? 0) === 0) {
    return { kind: "empty", text: VACIO[s.key] ?? "Sin elementos relacionados." };
  }
  return { kind: "items" };
}

/** El recuento que se puede enseñar. `null` se enseña como nada, jamás como 0. */
export function visibleCount(s: ContextSection): number | null {
  return s.status === "ok" ? s.count : null;
}

// ===========================================================================
// 3 · LA ATENCIÓN DEL PROCESO (§19)
// ===========================================================================

/**
 * Las tres condiciones que HOY se pueden afirmar sin interpretar nada.
 *
 * Salen del recuento que el propio dominio calcula en B1 —no de las filas
 * cargadas—, así que la cifra es la de la empresa entera y no la de la muestra.
 * Esa distinción es la que rompió la portada vieja: contar lo que se pintó en
 * pantalla y llamarlo total.
 *
 * Y no hay una cuarta inventada. Un indicador fuera de meta no entra: B1 no lo
 * determina, y determinarlo aquí sería que la pantalla decidiera qué es un
 * problema en un dominio que no es suyo.
 */
const CONDICIONES: Record<string, { domain: string; condition: string; frase: (n: number) => string }> = {
  risks: {
    domain: "risks", condition: "risk_active",
    frase: (n) => n === 1 ? "1 riesgo sigue activo" : `${n} riesgos siguen activos`,
  },
  audit_findings: {
    domain: "audits", condition: "finding_unevaluated",
    frase: (n) => n === 1 ? "1 hallazgo sin evaluar" : `${n} hallazgos sin evaluar`,
  },
  cases: {
    domain: "cases", condition: "case_open",
    frase: (n) => n === 1 ? "1 caso sin cerrar" : `${n} casos sin cerrar`,
  },
};

/**
 * Qué requiere atención alrededor de este proceso.
 *
 * B4 hará la portada y B3 la convergencia global; esto es lo que se puede decir
 * hoy sobre UN proceso sin adelantar ninguna de las dos.
 *
 * El sujeto es **el proceso**, no cada riesgo suelto: el recuento es del
 * dominio y la muestra son cuatro filas, así que atribuirlo a filas concretas
 * enseñaría tres cuando el dominio dice cinco. El enlace lleva al dominio, que
 * es donde están las cinco.
 *
 * El observador es `truth_source` —el estado del propio dominio— porque eso es
 * exactamente lo que es: ninguna regla de automatización interviene aquí.
 */
export function processAttention(
  processId: string, sections: readonly ContextSection[]
): AttentionItem[] {
  const salida: AttentionItem[] = [];
  for (const s of sections) {
    const cond = CONDICIONES[s.key];
    if (!cond) continue;
    // `attentionCount` solo se mira si la sección se leyó. Una sección
    // denegada o rota no aporta atención: no se sabe.
    if (s.status !== "ok") continue;
    const n = s.attentionCount;
    if (n === null || n <= 0) continue;
    salida.push({
      domain: cond.domain,
      subjectKind: "quality_process",
      subjectId: processId,
      label: s.label,
      reason: cond.frase(n),
      state: null,
      severity: null,
      since: null,
      href: s.href,
      observer: { code: cond.domain, kind: "truth_source" },
      temporal: s.temporal,
      dedupeKey: attentionKey({
        domain: cond.domain, subjectKind: "quality_process",
        subjectId: processId, condition: cond.condition,
      }),
    });
  }
  return salida;
}

// ===========================================================================
// 4 · EL TIEMPO, CUANDO NO ES EL MISMO (§17, §18)
// ===========================================================================

/**
 * El aviso que impide la mentira más fácil de esta pantalla.
 *
 * Cuando alguien abre la revisión que rigió en 2024, el proceso se muestra tal
 * como se publicó. Lo de alrededor **no**: los riesgos, los documentos y los
 * casos son los de hoy, porque ninguno de esos dominios reconstruye a fecha.
 *
 * Enseñar las dos cosas juntas y calladas sería afirmar que aquel proceso tenía
 * estos riesgos. Así que si los momentos no coinciden, se dice.
 */
export function temporalNotice(
  view: TemporalScope, sections: readonly ContextSection[]
): string | null {
  if (sections.length === 0) return null;
  const distintas = sections.filter((s) => !sameMoment(view, s.temporal));
  if (distintas.length === 0) return null;
  return (
    `El proceso se muestra tal como rigió · ${temporalLabel(view)}. ` +
    `Lo que aparece alrededor es el ${temporalLabel(CURRENT).toLowerCase()}: ` +
    `estos dominios no se reconstruyen a una fecha pasada.`
  );
}

/** La etiqueta temporal de una sección, siempre visible. Un dato temporal sin
 *  etiqueta afirma más de lo que sabe. */
export function sectionTemporalLabel(s: ContextSection): string {
  return temporalLabel(s.temporal);
}

// ===========================================================================
// 5 · EL VOCABULARIO DE CADA DOMINIO, CONSERVADO (§5, §11)
// ===========================================================================

/**
 * Cada estado se enseña con la palabra de SU dominio.
 *
 * No hay un vocabulario del mirador. «active» en un riesgo se dice «Vigente»
 * porque así lo dice Riesgos; «pending» en un hallazgo se dice «Sin evaluar»
 * porque así lo dice Auditorías. Traducirlos a una escala propia haría dos
 * daños: enseñaría jerga de base de datos, y haría que la misma palabra
 * significara cosas distintas según de dónde viniera la fila.
 *
 * Si un dominio añade un estado y todavía no lo ha etiquetado, se enseña el
 * código tal cual: es feo y se nota, que es justo lo que hace que se arregle.
 */
const ESTADOS: Record<string, Record<string, string>> = {
  requirements: RELEVANCE_LABEL,
  risks: RISK_STATUS_LABEL,
  opportunities: OPPORTUNITY_STATUS_LABEL,
  objectives: OBJECTIVE_ADMIN_STATE_LABEL,
  indicators: INDICATOR_ADMIN_STATE_LABEL,
  documents: DOCUMENT_STATUS_LABEL,
  audit_findings: FINDING_EVALUATION_STATUS_LABEL,
  cases: CASE_STATUS_LABEL,
};

export function stateLabel(sectionKey: string, state: string | null | undefined): string | null {
  if (!state) return null;
  return ESTADOS[sectionKey]?.[state] ?? state;
}

/** La gravedad, solo donde el dominio gradúa. Hoy: los hallazgos. */
export function severityLabel(
  sectionKey: string, severity: string | null | undefined
): string | null {
  if (!severity) return null;
  if (sectionKey !== "audit_findings") return severity;
  return FINDING_SEVERITY_LABEL[severity as keyof typeof FINDING_SEVERITY_LABEL] ?? severity;
}

/** Cómo se relaciona un requisito con el proceso, en la palabra de 12.3. */
export function requirementLinkLabel(linkKind: string): string {
  return LINK_KIND_LABEL[linkKind as keyof typeof LINK_KIND_LABEL] ?? linkKind;
}
