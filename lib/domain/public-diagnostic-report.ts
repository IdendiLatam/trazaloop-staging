import { READINESS_LABEL, type ReadinessLevel } from "@/lib/diagnostic/scoring";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01G · Cómo se presenta una instantánea.
 *
 *
 * AQUÍ NO SE PUNTÚA NADA
 *
 * Todo lo que sigue recibe la instantánea YA CONGELADA y decide cómo
 * enseñarla: qué frase acompaña al nivel, qué dimensiones se destacan, qué
 * brechas van primero y cómo se agrupan las recomendaciones. Ni una de esas
 * decisiones cambia un número.
 *
 * Es lógica PURA a propósito. La pantalla no puede recalcular lo que no sabe
 * calcular, y las reglas de presentación se pueden probar sin base de datos.
 *
 *
 * POR QUÉ LOS UMBRALES DE PRESENTACIÓN NO SALEN DEL PERFIL DE PUNTUACIÓN
 *
 * Sería tentador destacar una dimensión usando el 75 que el perfil llama
 * «alto». No se hace, y es deliberado: ese 75 vive en `scoring_config`, que
 * está CONGELADO POR VERSIÓN. Si la presentación lo leyera, publicar una PCR
 * v2 con otros umbrales reescribiría de golpe el aspecto de todos los informes
 * históricos sin que nadie hubiera tocado una respuesta — exactamente el
 * defecto que 0195 cerró, reaparecido por la puerta de atrás.
 *
 * Así que el umbral de presentación es suyo, explícito y de este módulo.
 */

/** ¿Qué significa, en una frase, el nivel que salió? Sin umbrales ni reglas. */
export const READINESS_EXPLANATION: Record<ReadinessLevel, string> = {
  low:
    "Tu empresa todavía no cuenta con controles suficientes para "
    + "demostrar el origen y el seguimiento del material reciclado. Es un buen "
    + "punto de partida: lo que falta está identificado abajo, y casi todo "
    + "empieza por registrar de forma ordenada lo que ya se hace.",
  medium:
    "Tu empresa cuenta con algunos controles de trazabilidad, pero "
    + "todavía existen brechas que dificultan demostrar de forma consistente "
    + "el origen y el seguimiento del material reciclado. Cerrarlas es, sobre "
    + "todo, cuestión de método y de registro.",
  high:
    "Tu empresa tiene una base sólida de trazabilidad y puede sustentar "
    + "buena parte de lo que afirma. Quedan brechas puntuales que conviene "
    + "cerrar para que la evidencia sea completa y esté siempre disponible.",
  audit_ready_candidate:
    "Tu empresa cubre los controles que permiten sustentar el origen y "
    + "el seguimiento del material reciclado. Lo que queda es mantener la "
    + "evidencia al día y ordenada, que es lo que sostiene el nivel en el "
    + "tiempo.",
};

/**
 * A partir de aquí una dimensión se puede llamar FORTALEZA sin faltar a la
 * verdad. Por debajo, destacarla sería vender como logro lo que todavía no lo
 * es — y quien lea el informe lo notaría.
 */
export const STRENGTH_THRESHOLD = 70;

/**
 * Y por debajo de esto ni siquiera «mejor desempeño relativo» describe nada
 * útil: si la mejor dimensión anda por el suelo, decir que es la mejor es un
 * consuelo, no una información.
 */
export const RELATIVE_FLOOR = 40;

/** Cuántas brechas se enseñan de entrada. El resto queda a un clic. */
export const GAPS_VISIBLE = 6;

export type SnapshotSection = {
  code: string; title: string; percent: number;
  answered_yes: number; total: number;
};
export type SnapshotGap = {
  code: string; section: string | null; question: string;
  recommended_action: string | null;
};

export type PublicSnapshot = {
  schema: string;
  instrument: { type: string; version: number };
  answered: number;
  questions: number;
  maturity_percent: number;
  readiness_level: ReadinessLevel;
  readiness_label: string;
  critical_gaps: number;
  sections: SnapshotSection[];
  gaps: SnapshotGap[];
};

export type Destacadas = {
  /** `strengths` cuando de verdad lo son; `relative` cuando solo son las mejores. */
  kind: "strengths" | "relative" | "none";
  items: SnapshotSection[];
};

export type GrupoRecomendaciones = {
  sectionCode: string | null;
  sectionTitle: string;
  actions: string[];
};

export type PublicReport = {
  maturityPercent: number;
  readinessLevel: ReadinessLevel;
  readinessLabel: string;
  explanation: string;
  dimensions: SnapshotSection[];
  destacadas: Destacadas;
  /** Brechas ordenadas por prioridad: primero las de la dimensión más floja. */
  gapsPriority: SnapshotGap[];
  gapsRest: SnapshotGap[];
  recommendations: GrupoRecomendaciones[];
  totalGaps: number;
};

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

const NIVELES: readonly ReadinessLevel[] = [
  "low", "medium", "high", "audit_ready_candidate",
];

/**
 * La instantánea tal como llegó, o `null` si no se puede confiar en ella.
 *
 * Falla cerrado por la misma razón de siempre: enseñar un informe a medias, o
 * con ceros inventados donde faltaba un dato, es peor que decir que no se
 * pudo.
 */
export function parsePublicSnapshot(raw: unknown): PublicSnapshot | null {
  if (!esObjeto(raw)) return null;
  const nivel = raw.readiness_level;
  if (typeof nivel !== "string" || !NIVELES.includes(nivel as ReadinessLevel)) return null;
  const pct = raw.maturity_percent;
  if (typeof pct !== "number" || pct < 0 || pct > 100) return null;
  if (!Array.isArray(raw.sections) || !Array.isArray(raw.gaps)) return null;

  const sections: SnapshotSection[] = [];
  for (const s of raw.sections) {
    if (!esObjeto(s)) return null;
    if (typeof s.code !== "string" || typeof s.title !== "string") return null;
    if (typeof s.percent !== "number") return null;
    sections.push({
      code: s.code, title: s.title, percent: s.percent,
      answered_yes: Number(s.answered_yes ?? 0), total: Number(s.total ?? 0),
    });
  }

  const gaps: SnapshotGap[] = [];
  for (const g of raw.gaps) {
    if (!esObjeto(g)) return null;
    if (typeof g.question !== "string") return null;
    gaps.push({
      code: typeof g.code === "string" ? g.code : "",
      // `v1` no lo traía. Se acepta ausente en vez de romper un informe viejo.
      section: typeof g.section === "string" ? g.section : null,
      question: g.question,
      recommended_action:
        typeof g.recommended_action === "string" ? g.recommended_action : null,
    });
  }

  return {
    schema: String(raw.schema ?? ""),
    instrument: {
      type: String((esObjeto(raw.instrument) ? raw.instrument.type : "") ?? ""),
      version: Number((esObjeto(raw.instrument) ? raw.instrument.version : 0) ?? 0),
    },
    answered: Number(raw.answered ?? 0),
    questions: Number(raw.questions ?? 0),
    maturity_percent: pct,
    readiness_level: nivel as ReadinessLevel,
    readiness_label: typeof raw.readiness_label === "string"
      ? raw.readiness_label : READINESS_LABEL[nivel as ReadinessLevel],
    critical_gaps: Number(raw.critical_gaps ?? 0),
    sections, gaps,
  };
}

/**
 * Qué dimensiones se destacan, y con qué nombre.
 *
 * Tres casos y ninguna trampa: las que de verdad van bien se llaman
 * fortalezas; si no hay ninguna pero alguna se sostiene, se dicen como lo que
 * son —las mejores de las suyas—; y si no hay nada que destacar, no se destaca
 * nada. Rellenar el hueco con la menos mala sería mentirle a quien ya sabe
 * cómo está su empresa.
 */
export function seleccionarDestacadas(sections: SnapshotSection[]): Destacadas {
  const ordenadas = [...sections].sort((a, b) => b.percent - a.percent);
  const fuertes = ordenadas.filter((s) => s.percent >= STRENGTH_THRESHOLD);
  if (fuertes.length > 0) return { kind: "strengths", items: fuertes.slice(0, 3) };

  const relativas = ordenadas.filter((s) => s.percent >= RELATIVE_FLOOR);
  if (relativas.length > 0) return { kind: "relative", items: relativas.slice(0, 2) };

  return { kind: "none", items: [] };
}

/**
 * Las brechas, ordenadas por dónde más duelen.
 *
 * Primero las de la dimensión con peor porcentaje: si un área está al 20 %, es
 * ahí donde una hora de trabajo rinde más. Dentro de cada dimensión se respeta
 * el orden del instrumento, que es el orden en que se preguntó.
 *
 * NO se ordena por criticidad ni por peso: eso es la regla de puntuación, y no
 * sale de la instantánea a propósito.
 */
export function ordenarBrechas(
  gaps: SnapshotGap[], sections: SnapshotSection[]
): SnapshotGap[] {
  const pct = new Map(sections.map((s) => [s.code, s.percent]));
  const orden = new Map(sections.map((s, i) => [s.code, i]));
  return gaps
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      const pa = a.g.section !== null ? pct.get(a.g.section) ?? 101 : 101;
      const pb = b.g.section !== null ? pct.get(b.g.section) ?? 101 : 101;
      if (pa !== pb) return pa - pb;
      const oa = a.g.section !== null ? orden.get(a.g.section) ?? 999 : 999;
      const ob = b.g.section !== null ? orden.get(b.g.section) ?? 999 : 999;
      if (oa !== ob) return oa - ob;
      return a.i - b.i;
    })
    .map((x) => x.g);
}

/**
 * Las recomendaciones, agrupadas por dimensión y sin repetirse.
 *
 * Varias brechas de la misma área suelen apuntar a la misma acción. Repetirla
 * cinco veces no la hace más urgente: hace que el informe parezca relleno.
 */
export function agruparRecomendaciones(
  gaps: SnapshotGap[], sections: SnapshotSection[]
): GrupoRecomendaciones[] {
  const titulo = new Map(sections.map((s) => [s.code, s.title]));
  const grupos: GrupoRecomendaciones[] = [];
  const porSeccion = new Map<string, GrupoRecomendaciones>();

  for (const g of gaps) {
    const accion = g.recommended_action?.trim();
    if (!accion) continue;
    const clave = g.section ?? "";
    let grupo = porSeccion.get(clave);
    if (!grupo) {
      grupo = {
        sectionCode: g.section,
        sectionTitle: (g.section !== null ? titulo.get(g.section) : null)
          ?? "Otras acciones",
        actions: [],
      };
      porSeccion.set(clave, grupo);
      grupos.push(grupo);
    }
    // El texto original, sin retocar. Solo se evita el duplicado exacto.
    if (!grupo.actions.includes(accion)) grupo.actions.push(accion);
  }
  return grupos.filter((g) => g.actions.length > 0);
}

/** Todo lo anterior, en el orden en que se lee la pantalla. */
export function buildPublicReport(snapshot: PublicSnapshot): PublicReport {
  const ordenadas = ordenarBrechas(snapshot.gaps, snapshot.sections);
  return {
    maturityPercent: snapshot.maturity_percent,
    readinessLevel: snapshot.readiness_level,
    readinessLabel: snapshot.readiness_label,
    explanation: READINESS_EXPLANATION[snapshot.readiness_level],
    // El orden del instrumento, tal como vino congelado.
    dimensions: snapshot.sections,
    destacadas: seleccionarDestacadas(snapshot.sections),
    gapsPriority: ordenadas.slice(0, GAPS_VISIBLE),
    gapsRest: ordenadas.slice(GAPS_VISIBLE),
    recommendations: agruparRecomendaciones(ordenadas, snapshot.sections),
    totalGaps: snapshot.gaps.length,
  };
}


/**
 * PUBLIC-DIAGNOSTICS-01J · Las recomendaciones tal como quedaron congeladas.
 *
 *
 * POR QUÉ NO SIRVE `agruparRecomendaciones`
 *
 * Aquella ordena las brechas por la dimensión más floja, porque en la pantalla
 * pública eso ayuda a quien tiene que decidir por dónde empezar. Para la
 * administración y para el archivo que se entrega, reordenar es justamente lo
 * que no se quiere: el orden del snapshot ES un dato, y dos exportaciones de
 * la misma participación tienen que salir idénticas aunque mañana se cambie el
 * criterio de presentación.
 *
 * Así que aquí se respeta el orden en que las brechas quedaron escritas -que
 * es el orden del instrumento- y no se toca el texto.
 *
 *
 * QUÉ SE DEDUPLICA Y QUÉ NO
 *
 * Varias brechas de la misma dimensión suelen apuntar a la misma acción. Se
 * conserva la PRIMERA aparición y se descartan las repeticiones EXACTAS dentro
 * de la misma dimensión: una fila por acción a realizar, que es lo que se pidió
 * y lo que se puede convertir en un plan de trabajo. La misma acción en dos
 * dimensiones distintas sí son dos filas, porque son dos trabajos distintos.
 */
export type SnapshotRecommendation = {
  /** `null` si la brecha venía sin dimensión (instantáneas v1). */
  dimension: string | null;
  dimensionTitle: string | null;
  order: number;
  text: string;
};

export function snapshotRecommendations(
  snapshot: PublicSnapshot
): SnapshotRecommendation[] {
  const titulo = new Map(snapshot.sections.map((s) => [s.code, s.title]));
  const vistas = new Set<string>();
  const salida: SnapshotRecommendation[] = [];
  for (const g of snapshot.gaps) {
    const texto = g.recommended_action?.trim();
    if (!texto) continue;
    const clave = `${g.section ?? ""} ${texto}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push({
      dimension: g.section,
      dimensionTitle: g.section !== null ? titulo.get(g.section) ?? null : null,
      order: salida.length + 1,
      text: texto,
    });
  }
  return salida;
}
