/**
 * Trazaloop · QUALITY-03.1 · Qué se puede eliminar y qué ya no.
 *
 * LA REGLA, EN UNA FRASE
 *
 *   Un objeto puede eliminarse mientras no haya adquirido valor histórico,
 *   probatorio o referencial. Cuando lo adquiere, no se destruye: se retira,
 *   se desactiva o se corrige, según lo que signifique en su dominio.
 *
 * Ni «en Quality nunca se borra nada» —que convierte cada tecleo en piedra y
 * llena el sistema de basura que nadie puede quitar— ni «el administrador
 * borra lo que quiera» —que hace de la historia una cortesía—. Administrar es
 * decidir quién opera, no poder destruir lo ocurrido.
 *
 * DÓNDE VIVE LA VERDAD
 *
 * Aquí no. Este archivo solo sabe LEER un dictamen y escribirlo en español.
 * Quien decide es la base de datos, en quality_deletion_eligibility(), y quien
 * lo hace cumplir es un disparador BEFORE DELETE que consulta exactamente el
 * mismo dictamen. Eso importa por dos razones:
 *
 *   · el navegador no puede concluir «parece que no tiene mediciones, lo
 *     borro»: su opinión no llega a la base;
 *   · entre que alguien abre el aviso y confirma pueden pasar cosas. Si en ese
 *     rato otra persona registra una medición, el borrado falla —y falla con
 *     el mismo motivo que se habría mostrado—.
 */

/** Las entidades que hoy tienen ciclo de vida controlado. Se nombran aquí y no
 *  se infieren de una tabla genérica: cada una tiene sus propias preguntas. */
// QUALITY-04 anadio caso y accion al despachador de SQL; QUALITY-05 anade
// riesgo, oportunidad, control y version de metodologia. La lista vive aqui
// para que la aplicacion no pueda pedir un dictamen que la base no sabe dar.
export const LIFECYCLE_ENTITIES = [
  "indicator", "objective", "position", "document", "process",
  "case", "action",
  "risk", "opportunity", "control", "methodology_version",
  // QUALITY-07 · El proveedor entra AQUÍ y no en un enumerado propio: el
  // dictamen lo emite la misma función de la base que para todo lo demás.
  "supplier",
  // QUALITY-08 · Y con el mismo criterio, el cliente y la encuesta.
  "customer", "survey",
  // QUALITY-09 · Y con el mismo criterio, la auditoría y su programa.
  "audit", "audit_program",
] as const;
export type LifecycleEntity = (typeof LIFECYCLE_ENTITIES)[number];

/** Una razón concreta por la que un objeto ya no es desechable, con su cuenta.
 *  El número importa: «tiene 4 mediciones» se entiende y «tiene mediciones» se
 *  discute. */
export type BlockingReference = { label: string; count: number };

export type DeletionEligibility = {
  canHardDelete: boolean;
  reasonCode: "disposable" | "has_history" | "in_use" | "retired" | "not_found";
  reason: string;
  blocking: BlockingReference[];
  /** Qué hacer en su lugar, cuando el dominio ofrece algo. */
  alternative: "retire" | "deactivate" | "close" | null;
  alternativeLabel: string | null;
};

/** Traduce el jsonb de la base. Ante cualquier forma inesperada devuelve el
 *  dictamen más conservador: no se borra. Un fallo de lectura no puede
 *  convertirse en permiso. */
export function parseEligibility(raw: unknown): DeletionEligibility {
  const safe: DeletionEligibility = {
    canHardDelete: false,
    reasonCode: "not_found",
    reason: "No fue posible comprobar si este registro puede eliminarse.",
    blocking: [],
    alternative: null,
    alternativeLabel: null,
  };
  if (raw === null || typeof raw !== "object") return safe;
  const o = raw as Record<string, unknown>;
  const blocking = Array.isArray(o.blocking)
    ? o.blocking.flatMap((b): BlockingReference[] => {
        if (b === null || typeof b !== "object") return [];
        const item = b as Record<string, unknown>;
        const label = typeof item.label === "string" ? item.label : null;
        const count = typeof item.count === "number" ? item.count : null;
        return label && count !== null ? [{ label, count }] : [];
      })
    : [];
  const alternative = o.alternative;
  return {
    canHardDelete: o.can_hard_delete === true,
    reasonCode: isReasonCode(o.reason_code) ? o.reason_code : "not_found",
    reason: typeof o.reason === "string" ? o.reason : safe.reason,
    blocking,
    alternative:
      alternative === "retire" || alternative === "deactivate" || alternative === "close"
        ? alternative
        : null,
    alternativeLabel: typeof o.alternative_label === "string" ? o.alternative_label : null,
  };
}

function isReasonCode(v: unknown): v is DeletionEligibility["reasonCode"] {
  return v === "disposable" || v === "has_history" || v === "in_use" || v === "retired" || v === "not_found";
}

/** «4 mediciones registradas y 1 meta histórica» — como lo diría una persona. */
export function describeBlocking(blocking: BlockingReference[]): string {
  const parts = blocking.map((b) => `${b.count} ${b.label}`);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/**
 * El mensaje completo que ve alguien que no puede borrar.
 *
 * No basta con «No se puede eliminar»: eso deja a la persona sin saber qué
 * hizo mal ni qué puede hacer ahora. La frase dice el porqué, con números, y
 * termina con la salida que sí existe.
 */
export function deletionBlockedMessage(e: DeletionEligibility): string {
  const detail = describeBlocking(e.blocking);
  const because = detail ? `${e.reason} Tiene ${detail}.` : e.reason;
  return e.alternativeLabel ? `${because} ${e.alternativeLabel}.` : because;
}

// ---------------------------------------------------------------------------
// La frontera histórica, contada ANTES de cruzarla
// ---------------------------------------------------------------------------

/**
 * Avisos previos a una acción que crea historia formal.
 *
 * Se avisa solo cuando es verdad. Un modal que anuncia «esto no podrá
 * borrarse nunca» al crear un objeto que sí es desechable durante días enseña
 * a las personas a cerrar los avisos sin leerlos, y entonces el aviso que sí
 * importaba tampoco se lee.
 */
export const HISTORICAL_THRESHOLD = {
  submit_document:
    "Esta acción inicia el historial formal del documento. A partir de aquí ya no podrá eliminarse; podrá retirarse conservando su trazabilidad.",
  record_measurement:
    "La medición quedará en el histórico del indicador. Si más adelante hay que corregirla, el valor original se conserva.",
  publish_map:
    "Esta versión del mapa queda como registro histórico y no podrá eliminarse. Para cambiarla se abre una versión nueva.",
  publish_config:
    "Publicar una meta nueva cierra la anterior y abre un tramo histórico. Las evaluaciones ya hechas no se recalculan.",
  publish_revision:
    "Publicar congela esta revisión: su contenido queda fijo y no podrá eliminarse.",
} as const;
export type HistoricalThreshold = keyof typeof HISTORICAL_THRESHOLD;

/**
 * La ayuda discreta que acompaña a un objeto TODAVÍA desechable.
 *
 * Es información, no una advertencia: dice cuánta cuerda hay y qué pasa
 * después. Sin esto, la primera vez que alguien no puede borrar algo lo vive
 * como un fallo del programa.
 */
export const DISPOSABLE_HINT: Record<LifecycleEntity, string> = {
  indicator:
    "Podrás eliminar este indicador mientras no haya producido resultados. Después podrás retirarlo, conservando su histórico.",
  objective:
    "Podrás eliminar este objetivo mientras siga en borrador y sus indicadores no tengan resultados. Después podrás cerrarlo, conservando su histórico.",
  position:
    "Podrás eliminar este cargo mientras no tenga procesos, indicadores, documentos ni titulares asociados. Después podrás desactivarlo.",
  document:
    "Podrás eliminar este documento mientras siga en borrador y no haya entrado en revisión. Después podrás retirarlo, conservando su trazabilidad.",
  process:
    "Podrás eliminar este proceso mientras siga siendo un borrador sin publicar y nada dependa de él. Una vez publicado o incluido en un mapa, podrás retirarlo conservando su historia.",
  case:
    "Podrás eliminar este caso mientras siga sin evaluar y sin hallazgos. En cuanto tenga historia, se conserva.",
  action:
    "Podrás eliminar esta acción mientras siga planificada y nadie haya registrado avance sobre ella.",
  risk:
    "Podrás eliminar este riesgo mientras siga en borrador y nadie lo haya evaluado. Después podrás cerrarlo o retirarlo, conservando su histórico.",
  opportunity:
    "Podrás eliminar esta oportunidad mientras siga en borrador y sin priorizar. Después podrás descartarla dejando dicho por qué.",
  control:
    "Podrás eliminar este control mientras siga en borrador y no sustente ninguna evaluación residual. Después podrás retirarlo, conservando su historia.",
  supplier:
    "Podrás eliminar este proveedor mientras no tenga evaluaciones, decisiones ni incidentes. En cuanto tenga historia se retira, no se borra: lo que se decidió sobre él sigue haciendo falta para explicar por qué se le compró.",
  customer:
    "Podrás eliminar este cliente mientras no haya dicho nada ni se le haya invitado a ninguna encuesta. Después se retira, no se borra: lo que dijo un cliente es de las pocas cosas que un sistema de gestión no puede permitirse perder.",
  survey:
    "Podrás eliminar esta encuesta mientras siga siendo un borrador sin campañas ni respuestas. En cuanto alguien haya respondido, se retira: sus respuestas solo se interpretan con las preguntas que tenía entonces.",
  audit:
    "Podrás eliminar esta auditoría mientras siga en borrador, sin hallazgos, sin evidencia y sin informe. En cuanto se ejecuta se cancela, no se borra: una auditoría cancelada sigue contando como planificada no ejecutada, y borrarla mejoraría la cobertura del programa sin que nadie hubiera auditado nada.",
  audit_program:
    "Podrás eliminar este programa mientras no tenga auditorías ni más de una revisión. Después se cierra, no se borra: su cobertura es la prueba de qué se planificó auditar y qué se auditó de verdad.",
  methodology_version:
    "Podrás eliminar esta versión mientras siga en borrador y no se haya usado para evaluar. Una vez publicada, se sustituye por una versión nueva en lugar de reescribirla.",
};

/** Cómo se llama en español lo que se va a eliminar. */
export const ENTITY_LABEL: Record<LifecycleEntity, string> = {
  indicator: "indicador",
  objective: "objetivo",
  position: "cargo",
  document: "documento",
  process: "proceso",
  case: "caso",
  action: "acción",
  risk: "riesgo",
  opportunity: "oportunidad",
  control: "control",
  methodology_version: "versión de la metodología",
  supplier: "proveedor",
  customer: "cliente",
  survey: "encuesta",
  audit: "auditoría",
  audit_program: "programa de auditorías",
};

/**
 * Las entidades cuyo nombre es FEMENINO. Sin esto la pantalla escribe «Este
 * oportunidad», que es exactamente el tipo de descuido que hace que un sistema
 * parezca traducido a máquina.
 */
const FEMININE_ENTITIES: ReadonlySet<LifecycleEntity> = new Set([
  "action", "opportunity", "methodology_version", "survey", "audit",
]);

/** «Este proceso» / «Esta acción», según toque. */
export function entityDemonstrative(entity: LifecycleEntity): string {
  return FEMININE_ENTITIES.has(entity) ? "Esta" : "Este";
}

/** Confirmación de un borrado que SÍ va a ocurrir. Nombra el objeto: aceptar
 *  «¿Eliminar?» a ciegas es como no preguntar. */
export function hardDeleteConfirmation(entity: LifecycleEntity, name: string): string {
  const article = FEMININE_ENTITIES.has(entity) ? "la" : "el";
  return `Esta acción eliminará definitivamente ${article} ${ENTITY_LABEL[entity]} «${name}». No se puede deshacer.`;
}
