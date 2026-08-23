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
export const LIFECYCLE_ENTITIES = ["indicator", "objective", "position", "document"] as const;
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
};

/** Cómo se llama en español lo que se va a eliminar. */
export const ENTITY_LABEL: Record<LifecycleEntity, string> = {
  indicator: "indicador",
  objective: "objetivo",
  position: "cargo",
  document: "documento",
};

/** Confirmación de un borrado que SÍ va a ocurrir. Nombra el objeto: aceptar
 *  «¿Eliminar?» a ciegas es como no preguntar. */
export function hardDeleteConfirmation(entity: LifecycleEntity, name: string): string {
  return `Esta acción eliminará definitivamente el ${ENTITY_LABEL[entity]} «${name}». No se puede deshacer.`;
}
