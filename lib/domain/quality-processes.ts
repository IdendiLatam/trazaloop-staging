/**
 * Trazaloop Quality · QUALITY-01 · Lógica de dominio de Procesos.
 *
 * PURA: sin BD, sin React, sin Next, sin process.env. Todo lo que aquí se
 * decide vuelve a decidirse en BD (constraints, triggers, RLS) — esta capa
 * existe para dar mensajes en español antes de tocar la base, nunca para
 * sustituir la barrera real.
 *
 * Vocabulario congelado del sprint:
 *   · Cargo (position)      — sujeto ESTABLE de la responsabilidad (T-02).
 *   · Proceso (process)     — identidad; su contenido vive en revisiones.
 *   · Revisión (revision)   — contenido versionado con vigencia empresarial.
 *   · Mapa (map)            — vista organizada por categoría, versionada.
 */

// ---------------------------------------------------------------------------
// Categorías de proceso (DA-03). El catálogo REAL vive en
// quality_process_categories; estas etiquetas son solo presentación.
// ---------------------------------------------------------------------------

export const QUALITY_BASE_CATEGORY_CODES = [
  "strategic",
  "core",
  "support",
  "system",
] as const;

export type QualityBaseCategoryCode = (typeof QUALITY_BASE_CATEGORY_CODES)[number];

/** Orden de lectura del mapa: de la dirección hacia el soporte. */
export const QUALITY_CATEGORY_UI_ORDER: readonly QualityBaseCategoryCode[] = [
  "strategic",
  "core",
  "support",
  "system",
];

/**
 * Etiquetas de las cuatro categorías congeladas.
 *
 * Deben coincidir EXACTAMENTE con el nombre que tienen en
 * `quality_process_categories` (catálogo global). Este mapa solo se usa cuando
 * la pantalla conoce el código pero no ha cargado la fila — el mapa de
 * procesos, por ejemplo. Que dijeran cosas distintas («Apoyo» aquí, «De apoyo»
 * allá) hacía que la misma categoría se llamara de dos maneras según dónde se
 * mirara; una prueba comprueba ahora que sigan de acuerdo.
 */
export const QUALITY_CATEGORY_LABEL: Record<string, string> = {
  strategic: "Estratégicos",
  core: "Misionales",
  support: "Apoyo",
  system: "Sistema",
};

export function qualityCategoryLabel(code: string | null | undefined): string {
  if (!code) return "Sin categoría";
  return QUALITY_CATEGORY_LABEL[code] ?? code;
}

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

export const QUALITY_PROCESS_STATUSES = ["draft", "active", "retired"] as const;
export type QualityProcessStatus = (typeof QUALITY_PROCESS_STATUSES)[number];

export const QUALITY_PROCESS_STATUS_LABEL: Record<QualityProcessStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  retired: "Retirado",
};

/** draft | published | superseded — común a revisiones y versiones de mapa. */
export const QUALITY_REVISION_STATUSES = ["draft", "published", "superseded"] as const;
export type QualityRevisionStatus = (typeof QUALITY_REVISION_STATUSES)[number];

export const QUALITY_REVISION_STATUS_LABEL: Record<QualityRevisionStatus, string> = {
  draft: "Borrador",
  published: "Publicada",
  superseded: "Reemplazada",
};

export const QUALITY_IO_DIRECTIONS = ["input", "output"] as const;
export type QualityIoDirection = (typeof QUALITY_IO_DIRECTIONS)[number];

export const QUALITY_IO_DIRECTION_LABEL: Record<QualityIoDirection, string> = {
  input: "Entrada",
  output: "Salida",
};

export const QUALITY_IO_KINDS = [
  "information",
  "material",
  "document",
  "record",
  "resource",
  "other",
] as const;
export type QualityIoKind = (typeof QUALITY_IO_KINDS)[number];

export const QUALITY_IO_KIND_LABEL: Record<QualityIoKind, string> = {
  information: "Información",
  material: "Material",
  document: "Documento",
  record: "Registro",
  resource: "Recurso",
  other: "Otro",
};

export const QUALITY_ASSIGNMENT_TYPES = ["holder", "acting", "delegate"] as const;
export type QualityAssignmentType = (typeof QUALITY_ASSIGNMENT_TYPES)[number];

export const QUALITY_ASSIGNMENT_TYPE_LABEL: Record<QualityAssignmentType, string> = {
  holder: "Titular",
  acting: "Encargado",
  delegate: "Delegado",
};

export const QUALITY_DOCUMENT_RELATIONS = [
  "governs",
  "supports",
  "records",
  "reference",
] as const;
export type QualityDocumentRelation = (typeof QUALITY_DOCUMENT_RELATIONS)[number];

export const QUALITY_DOCUMENT_RELATION_LABEL: Record<QualityDocumentRelation, string> = {
  governs: "Rige el proceso",
  supports: "Apoya el proceso",
  records: "Registro del proceso",
  reference: "Referencia",
};

// ---------------------------------------------------------------------------
// Validación de entrada (misma familia de helpers que lib/domain/textiles-*)
// ---------------------------------------------------------------------------

export const QUALITY_NAME_MAX = 160;
export const QUALITY_CODE_MAX = 40;
export const QUALITY_TEXT_MAX = 4000;

export function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export type Validated<T> = { value: T; error: null } | { value: null; error: string };

export function validateQualityName(raw: unknown, what = "nombre"): Validated<string> {
  const name = cleanText(typeof raw === "string" ? raw : null);
  if (!name) return { value: null, error: `Escribe un ${what}.` };
  if (name.length > QUALITY_NAME_MAX) {
    return { value: null, error: `El ${what} no puede superar ${QUALITY_NAME_MAX} caracteres.` };
  }
  return { value: name, error: null };
}

export function validateQualityCode(raw: unknown): Validated<string | null> {
  const code = cleanText(typeof raw === "string" ? raw : null);
  if (!code) return { value: null, error: null };
  if (code.length > QUALITY_CODE_MAX) {
    return { value: null, error: `El código no puede superar ${QUALITY_CODE_MAX} caracteres.` };
  }
  return { value: code, error: null };
}

export function validateLongText(raw: unknown, what: string): Validated<string | null> {
  const text = cleanText(typeof raw === "string" ? raw : null);
  if (text && text.length > QUALITY_TEXT_MAX) {
    return { value: null, error: `El campo "${what}" no puede superar ${QUALITY_TEXT_MAX} caracteres.` };
  }
  return { value: text, error: null };
}

/** Fecha ISO (YYYY-MM-DD) o nada. Las vigencias son fechas, no timestamps. */
export function validateIsoDate(raw: unknown, what = "fecha"): Validated<string | null> {
  const value = cleanText(typeof raw === "string" ? raw : null);
  if (!value) return { value: null, error: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { value: null, error: `La ${what} debe tener el formato AAAA-MM-DD.` };
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { value: null, error: `La ${what} no es válida.` };
  }
  return { value, error: null };
}

/** UUID v4-ish: suficiente para rechazar basura antes de ir a la BD. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuid(raw: unknown, what = "identificador"): Validated<string> {
  const value = cleanText(typeof raw === "string" ? raw : null);
  if (!value || !UUID_RE.test(value)) {
    return { value: null, error: `El ${what} no es válido.` };
  }
  return { value, error: null };
}

/** Igual, pero admite "sin asignar" (cadena vacía → null). */
export function validateOptionalUuid(raw: unknown, what = "identificador"): Validated<string | null> {
  const value = cleanText(typeof raw === "string" ? raw : null);
  if (!value) return { value: null, error: null };
  if (!UUID_RE.test(value)) return { value: null, error: `El ${what} no es válido.` };
  return { value, error: null };
}

// ---------------------------------------------------------------------------
// Reglas de vigencia (T-01) — puras, para la UI y para las pruebas
// ---------------------------------------------------------------------------

export type PeriodLike = { effectiveFrom: string | null; effectiveTo: string | null };

/**
 * ¿El periodo está vigente en la fecha dada? Un `effectiveTo` marca el día en
 * que la vigencia TERMINA (la siguiente versión empieza ese mismo día), así que
 * la comparación de cierre es estricta: nunca hay dos versiones vigentes el
 * mismo día.
 */
export function isEffectiveOn(period: PeriodLike, onDate: string): boolean {
  if (period.effectiveFrom && period.effectiveFrom > onDate) return false;
  if (period.effectiveTo && period.effectiveTo <= onDate) return false;
  return true;
}

/** La versión que regía en una fecha, de un conjunto de versiones publicadas. */
export function findEffectiveAt<T extends PeriodLike>(items: readonly T[], onDate: string): T | null {
  return items.find((i) => isEffectiveOn(i, onDate)) ?? null;
}

// ---------------------------------------------------------------------------
// Reglas de edición y publicación
// ---------------------------------------------------------------------------

/**
 * Una revisión (o versión de mapa) SOLO se edita en borrador. Es la regla que
 * la UI debe respetar para no ofrecer botones que la BD va a rechazar; el
 * trigger de la migración 0112 es quien realmente la impone.
 */
export function canEditRevision(status: string | null | undefined): boolean {
  return status === "draft";
}

/** Publicar exige rol admin o quality (la RPC lo re-verifica en BD). */
export const QUALITY_PUBLISHER_ROLES: readonly string[] = ["admin", "quality"];
export const QUALITY_EDITOR_ROLES: readonly string[] = ["admin", "quality", "consultant"];
/** Los cargos los administra la dirección de calidad, no cualquier editor. */
export const QUALITY_POSITION_ADMIN_ROLES: readonly string[] = ["admin", "quality"];

export function canPublishQuality(roleCode: string | null | undefined): boolean {
  return !!roleCode && QUALITY_PUBLISHER_ROLES.includes(roleCode);
}

export function canEditQuality(roleCode: string | null | undefined): boolean {
  return !!roleCode && QUALITY_EDITOR_ROLES.includes(roleCode);
}

export function canManagePositions(roleCode: string | null | undefined): boolean {
  return !!roleCode && QUALITY_POSITION_ADMIN_ROLES.includes(roleCode);
}

/** Un mapa vacío no se publica: publicar un mapa sin procesos no dice nada. */
export function canPublishMap(nodeCount: number): { ok: boolean; error: string | null } {
  if (nodeCount < 1) {
    return { ok: false, error: "Añade al menos un proceso al mapa antes de publicarlo." };
  }
  return { ok: true, error: null };
}

// ---------------------------------------------------------------------------
// Agrupación del mapa por categoría (DA-04: cada bloque es un Proceso REAL)
// ---------------------------------------------------------------------------

export type MapNodeLike = {
  processId: string;
  processName: string;
  categoryCode: string;
  sortOrder: number;
};

export type MapCategoryBand<T extends MapNodeLike = MapNodeLike> = {
  categoryCode: string;
  label: string;
  nodes: T[];
};

/**
 * Ordena los nodos en bandas por categoría, en el orden de lectura del mapa.
 * Las categorías propias de la empresa (fuera del catálogo base) se muestran
 * después de las cuatro base, alfabéticamente, en lugar de desaparecer.
 *
 * Genérica (QUALITY-01.2) para que el dibujo del mapa conserve el código, el
 * estado y el cargo propietario de cada bloque en vez de perderlos aquí.
 */
export function groupMapNodesByCategory<T extends MapNodeLike>(
  nodes: readonly T[]
): MapCategoryBand<T>[] {
  const byCategory = new Map<string, T[]>();
  for (const node of nodes) {
    const list = byCategory.get(node.categoryCode) ?? [];
    list.push(node);
    byCategory.set(node.categoryCode, list);
  }

  const base = QUALITY_CATEGORY_UI_ORDER as readonly string[];
  const extra = [...byCategory.keys()].filter((c) => !base.includes(c)).sort();

  return [...base, ...extra]
    .filter((code) => byCategory.has(code))
    .map((code) => ({
      categoryCode: code,
      label: qualityCategoryLabel(code),
      nodes: [...(byCategory.get(code) ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.processName.localeCompare(b.processName, "es")
      ),
    }));
}

// ---------------------------------------------------------------------------
// Interacciones — presentación de la relación estructurada (DA-06)
// ---------------------------------------------------------------------------

export type InteractionLike = {
  id: string;
  sourceProcessId: string;
  sourceProcessName: string;
  targetProcessId: string;
  targetProcessName: string;
  informationItem: string | null;
  description: string | null;
};

/**
 * Separa las relaciones de un proceso en las que SALEN y las que ENTRAN.
 *
 * Es la función que hace posible la promesa del modelo: una sola fila leída
 * desde sus dos extremos. «Recibe de» no es un registro distinto de «entrega
 * a» — es la MISMA relación mirada desde el otro lado.
 *
 * Genérica a propósito (QUALITY-01.2): quien la llama conserva los campos
 * añadidos —la salida de origen y la entrada de destino— en lugar de perderlos
 * al estrecharse a InteractionLike.
 */
export function splitInteractions<T extends InteractionLike>(
  processId: string,
  interactions: readonly T[]
): { outgoing: T[]; incoming: T[] } {
  return {
    outgoing: interactions.filter((i) => i.sourceProcessId === processId),
    incoming: interactions.filter((i) => i.targetProcessId === processId),
  };
}

// ---------------------------------------------------------------------------
// Mensajes de error compartidos (nunca se filtran detalles internos de la BD)
// ---------------------------------------------------------------------------

export const QUALITY_ERRORS = {
  generic: "No se pudo completar la operación. Inténtalo de nuevo.",
  duplicateName: "Ya existe un registro con ese nombre en tu empresa.",
  duplicateCode: "Ya existe un registro con ese código en tu empresa.",
  notFound: "El registro no existe o no pertenece a tu empresa.",
  publishedImmutable:
    "Esta versión está publicada y no se puede modificar. Abre una nueva revisión para cambiarla.",
  needsPublisher: "Solo la administración o el área de calidad pueden publicar.",
  holderAlreadyExists: "Este cargo ya tiene un titular vigente. Cierra su vigencia primero.",
  memberRequired: "La persona debe ser miembro activo de tu empresa.",
  ownerMustBePosition: "El propietario de un proceso es un cargo, nunca una persona.",
} as const;
