/**
 * Trazaloop · Sprint T5 (Textil) · Dominio PURO de evidencias textiles.
 * Sin BD ni sesión; testeable en tests/evidences/textiles-evidences.test.ts.
 * Los valores espejan los CHECK de la migración 0075.
 *
 * LENGUAJE: una evidencia es un SOPORTE DOCUMENTAL declarado y organizado
 * por la empresa. "Aceptada" = aceptación INTERNA como soporte; jamás
 * certificación externa ni promesas normativas de ningún tipo.
 */

export const TEXTILE_EVIDENCE_TYPES = [
  "supplier_datasheet",
  "composition_certificate",
  "supplier_declaration",
  "purchase_document",
  "recycled_content_support",
  "organic_material_support",
  "care_instruction_support",
  "process_record",
  "outsourced_process_support",
  "quality_record",
  "traceability_support",
  "photo_record",
  "other",
] as const;
export type TextileEvidenceType = (typeof TEXTILE_EVIDENCE_TYPES)[number];

export const TEXTILE_EVIDENCE_TYPE_LABEL: Record<TextileEvidenceType, string> = {
  supplier_datasheet: "Ficha técnica de proveedor",
  composition_certificate: "Soporte de composición",
  supplier_declaration: "Declaración de proveedor",
  purchase_document: "Documento de compra",
  recycled_content_support: "Soporte de contenido reciclado",
  organic_material_support: "Soporte de material orgánico",
  care_instruction_support: "Soporte de recomendaciones de cuidado",
  process_record: "Registro de proceso interno",
  outsourced_process_support: "Soporte de proceso tercerizado",
  quality_record: "Registro de calidad",
  traceability_support: "Soporte de trazabilidad",
  photo_record: "Registro fotográfico",
  other: "Otro soporte",
};

export const TEXTILE_EVIDENCE_STATUSES = [
  "pending_review",
  "accepted",
  "rejected",
  "expired",
  "archived",
] as const;
export type TextileEvidenceStatus = (typeof TEXTILE_EVIDENCE_STATUSES)[number];

export const TEXTILE_EVIDENCE_STATUS_LABEL: Record<TextileEvidenceStatus, string> = {
  pending_review: "Revisión pendiente",
  accepted: "Aceptada internamente",
  rejected: "Rechazada internamente",
  expired: "Vencida",
  archived: "Archivada",
};

export const TEXTILE_EVIDENCE_ENTITY_TYPES = [
  "supplier",
  "material",
  "component",
  "process",
  "outsourced_process",
  "collection",
  "product",
  "reference",
  "fiber_composition",
  "reference_material",
  "reference_component",
  // T6: entidades de trazabilidad (encargo §10)
  "production_order",
  "input_lot",
  "order_consumption",
  "order_process_step",
  "output_lot",
  // T7: evaluación de circularidad (encargo §12)
  "circularity_assessment",
] as const;
export type TextileEvidenceEntityType = (typeof TEXTILE_EVIDENCE_ENTITY_TYPES)[number];

export const TEXTILE_EVIDENCE_ENTITY_TYPE_LABEL: Record<TextileEvidenceEntityType, string> = {
  supplier: "Proveedor",
  material: "Material / insumo",
  component: "Avío / componente",
  process: "Proceso interno",
  outsourced_process: "Proceso tercerizado",
  collection: "Colección / línea",
  product: "Producto",
  reference: "Referencia / SKU",
  fiber_composition: "Fibra de composición",
  reference_material: "Material de referencia",
  reference_component: "Componente de referencia",
  production_order: "Orden / corrida de confección",
  input_lot: "Lote de entrada",
  order_consumption: "Consumo de lote",
  order_process_step: "Proceso de orden",
  output_lot: "Lote producido / final",
  circularity_assessment: "Evaluación de circularidad",
};

export const TEXTILE_EVIDENCE_LINK_TYPES = [
  "general_support",
  "composition_support",
  "origin_support",
  "recycled_claim_support",
  "organic_claim_support",
  "care_support",
  "supplier_support",
  "process_support",
  "outsourced_process_support",
  "traceability_support",
  "review_support",
  "other",
  // T6: tipos de soporte de trazabilidad (encargo §10)
  "production_order_support",
  "input_lot_support",
  "consumption_support",
  "process_execution_support",
  "output_lot_support",
  // T7: soportes de circularidad (encargo §12; care_support existe desde T5)
  "circularity_support",
  "recyclability_support",
  "repairability_support",
  "separation_support",
  "reuse_support",
  "end_of_life_support",
] as const;
export type TextileEvidenceLinkType = (typeof TEXTILE_EVIDENCE_LINK_TYPES)[number];

export const TEXTILE_EVIDENCE_LINK_TYPE_LABEL: Record<TextileEvidenceLinkType, string> = {
  general_support: "Soporte general",
  composition_support: "Soporte de composición",
  origin_support: "Soporte de origen",
  recycled_claim_support: "Soporte de declaración de reciclado",
  organic_claim_support: "Soporte de declaración de orgánico",
  care_support: "Soporte de cuidado",
  supplier_support: "Soporte de proveedor",
  process_support: "Soporte de proceso",
  outsourced_process_support: "Soporte de proceso tercerizado",
  traceability_support: "Soporte de trazabilidad",
  review_support: "Soporte de revisión",
  other: "Otro",
  production_order_support: "Soporte de orden / corrida",
  input_lot_support: "Soporte de lote de entrada",
  consumption_support: "Soporte de consumo",
  process_execution_support: "Soporte de ejecución de proceso",
  output_lot_support: "Soporte de lote producido / final",
  circularity_support: "Soporte de circularidad",
  recyclability_support: "Soporte de reciclabilidad",
  repairability_support: "Soporte de reparabilidad",
  separation_support: "Soporte de separación",
  reuse_support: "Soporte de reutilización",
  end_of_life_support: "Soporte de fin de vida",
};

/** MIME permitidos (encargo T5): documentos e imágenes; jamás ejecutables. */
export const TEXTILE_EVIDENCE_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
] as const;

/** Extensiones permitidas (T9E): espejo de los MIME — segunda barrera
 * declarativa; la validación por MIME sigue siendo obligatoria. */
export const TEXTILE_EVIDENCE_ALLOWED_EXTENSIONS = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "docx",
  "xlsx",
  "csv",
] as const;

/** Límite de tamaño razonable por archivo (20 MB). */
export const TEXTILE_EVIDENCE_MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Límite legible para UX y mensajes (siempre derivado del límite real). */
export const TEXTILE_EVIDENCE_MAX_FILE_MB = TEXTILE_EVIDENCE_MAX_FILE_BYTES / (1024 * 1024);

/**
 * T9E · Mensaje único de condiciones de carga (UX): se muestra ANTES de
 * subir y acompaña los errores. El almacenamiento es un bucket privado por
 * organización; los archivos solo se abren con enlaces firmados de corta
 * vida.
 */
export const TEXTILE_EVIDENCE_FILE_RULES_MESSAGE =
  `Formatos permitidos: PDF, imagen (PNG/JPG/WebP), Word (.docx), Excel (.xlsx) o CSV · ` +
  `tamaño máximo ${TEXTILE_EVIDENCE_MAX_FILE_MB} MB · almacenamiento privado de tu organización ` +
  `(apertura solo con enlaces firmados temporales).`;

export function isAllowedTextileEvidenceExtension(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return (TEXTILE_EVIDENCE_ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * T9E · Validación PURA del archivo de evidencia — la MISMA regla corre en
 * el cliente (mensaje temprano, sin viaje de red) y en la server action
 * (barrera real). Devuelve el primer error o null.
 */
export function validateTextileEvidenceFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (!file.name || file.size === 0) return "El archivo es obligatorio.";
  if (!isAllowedTextileEvidenceMime(file.type)) {
    return "Tipo de archivo no permitido (PDF, imagen, Word, Excel o CSV).";
  }
  if (!isAllowedTextileEvidenceExtension(file.name)) {
    return "Extensión de archivo no permitida (.pdf, .png, .jpg, .jpeg, .webp, .docx, .xlsx o .csv).";
  }
  if (file.size > TEXTILE_EVIDENCE_MAX_FILE_BYTES) {
    return `El archivo supera el tamaño máximo permitido (${TEXTILE_EVIDENCE_MAX_FILE_MB} MB).`;
  }
  return null;
}

export const TEXTILE_EVIDENCES_DISCLAIMER =
  "Las evidencias registradas no equivalen por sí solas a certificación ni validación " +
  "externa. Son soportes documentales declarados y organizados por la empresa.";

export const TEXTILE_EVIDENCE_ACCEPTED_NOTE =
  "Evidencia aceptada internamente como soporte documental. No equivale a certificación externa.";

export const TEXTILE_EVIDENCE_UNLINKED_WARNING =
  "Esta evidencia aún no está vinculada a ningún producto, referencia, material o proveedor.";

export function isAllowedTextileEvidenceMime(mime: string): boolean {
  return (TEXTILE_EVIDENCE_ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

/** ¿La vigencia terminó? (comparación de fechas en UTC, sin horas) */
export function isTextileEvidenceExpired(validUntil: string | null, today: Date = new Date()): boolean {
  if (!validUntil) return false;
  const limit = new Date(`${validUntil}T23:59:59Z`);
  return limit.getTime() < today.getTime();
}

/** Los estados que un revisor interno puede fijar manualmente. */
export const TEXTILE_EVIDENCE_REVIEW_TARGETS: readonly TextileEvidenceStatus[] = [
  "accepted",
  "rejected",
  "expired",
  "archived",
  "pending_review",
];

/** ¿El rol puede fijar este estado? (espejo del guard SQL: solo admin/quality) */
export function canSetTextileEvidenceStatus(roleCode: string): boolean {
  return roleCode === "admin" || roleCode === "quality";
}

/** Roles que pueden cargar/editar/vincular evidencias (T5.1: espejo de la
 * política de subida del bucket 0015/0016 y de la RLS endurecida 0076). */
export const TEXTILE_EVIDENCE_UPLOAD_ROLES = ["admin", "quality", "consultant"] as const;

export function canUploadTextileEvidence(roleCode: string): boolean {
  return (TEXTILE_EVIDENCE_UPLOAD_ROLES as readonly string[]).includes(roleCode);
}

/** T5.1 (defensa en profundidad): una ruta de archivo textil solo es válida
 * si vive bajo el prefijo de la organización — jamás se firma otra cosa. */
export function isTextileEvidencePathForOrg(filePath: string, organizationId: string): boolean {
  return filePath.startsWith(`${organizationId}/textiles/`);
}

// ---------------------------------------------------------------------------
// Brechas simples de evidencia (encargo T5 §15) — lógica pura.
// ---------------------------------------------------------------------------

export type ReferenceGapInput = {
  /** Filas de composición de la referencia. */
  fibers: Array<{
    id: string;
    fiberName: string | null;
    isRecycledDeclared: boolean;
    isOrganicDeclared: boolean;
  }>;
  /**
   * Vínculos de evidencia que tocan la referencia: los directos
   * (entity_type='reference') y los de sus fibras
   * (entity_type='fiber_composition' con entity_id de una fila propia).
   */
  links: Array<{ entityType: string; entityId: string; linkType: string }>;
};

export type EvidenceGap = { code: string; message: string };

/**
 * Brechas simples de la referencia:
 *  · fibra declarada reciclada sin soporte recycled_claim_support;
 *  · fibra declarada orgánica sin soporte organic_claim_support;
 *  · composición registrada sin ningún composition_support.
 * Informativas: nunca bloquean la composición (la matriz completa y el
 * scoring quedan para sprints posteriores).
 */
export function computeReferenceEvidenceGaps(input: ReferenceGapInput): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  const linksFor = (fiberId: string) =>
    input.links.filter(
      (l) =>
        l.entityType === "reference" ||
        (l.entityType === "fiber_composition" && l.entityId === fiberId)
    );

  for (const fiber of input.fibers) {
    const fiberLinks = linksFor(fiber.id);
    if (fiber.isRecycledDeclared && !fiberLinks.some((l) => l.linkType === "recycled_claim_support")) {
      gaps.push({
        code: "recycled_without_support",
        message: `Brecha de evidencia: la fibra ${fiber.fiberName ?? ""} está declarada reciclada sin soporte de declaración de reciclado vinculado.`.replace("  ", " "),
      });
    }
    if (fiber.isOrganicDeclared && !fiberLinks.some((l) => l.linkType === "organic_claim_support")) {
      gaps.push({
        code: "organic_without_support",
        message: `Brecha de evidencia: la fibra ${fiber.fiberName ?? ""} está declarada orgánica sin soporte de declaración de orgánico vinculado.`.replace("  ", " "),
      });
    }
  }

  if (
    input.fibers.length > 0 &&
    !input.links.some((l) => l.linkType === "composition_support")
  ) {
    gaps.push({
      code: "composition_without_support",
      message: "Brecha de evidencia: la referencia tiene composición registrada sin soporte de composición vinculado.",
    });
  }

  return gaps;
}

/** Brecha simple de material: ficha declarada sin evidencia de ficha vinculada. */
export function computeMaterialEvidenceGaps(input: {
  hasSupplierDatasheet: boolean;
  links: Array<{ evidenceType: string }>;
}): EvidenceGap[] {
  if (
    input.hasSupplierDatasheet &&
    !input.links.some((l) => l.evidenceType === "supplier_datasheet")
  ) {
    return [
      {
        code: "datasheet_without_support",
        message: "Brecha de evidencia: el material declara ficha técnica de proveedor sin evidencia de ficha vinculada.",
      },
    ];
  }
  return [];
}

/** Nombre de archivo saneado para Storage: el original se conserva SOLO
 * como metadata de UI (original_filename / file_name). */
export function sanitizeTextileEvidenceFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Ruta de storage textil dentro del bucket privado `evidences` (D-T5-01). */
export function buildTextileEvidencePath(
  organizationId: string,
  evidenceId: string,
  fileName: string
): string {
  return `${organizationId}/textiles/${evidenceId}/${sanitizeTextileEvidenceFileName(fileName)}`;
}

// ---------------------------------------------------------------------------
// T9E.1 · Carga DIRECTA a Storage (los bytes jamás atraviesan Next.js)
// ---------------------------------------------------------------------------

/** TTL corto del intento de carga: vencido y sin finalizar → limpieza. */
export const TEXTILE_EVIDENCE_UPLOAD_INTENT_TTL_MINUTES = 30;

/** T9E.3 · Ventana de gracia para re-barrido de intentos YA expirados: el
 * token de subida firmado de Storage vive ~2 h (mayor que el TTL del
 * intento) y NO es de un solo uso tras un remove — una subida tardía puede
 * re-crear el objeto en una ruta expirada. Dentro de esta ventana, la
 * limpieza vuelve a revisar expirados recientes y retira objetos
 * reaparecidos (jamás finalizables: la RPC exige status pending). */
export const TEXTILE_EVIDENCE_UPLOAD_TOKEN_GRACE_HOURS = 3;

/** Máquina de estados del intento (espejo del CHECK de 0094). */
export const TEXTILE_EVIDENCE_UPLOAD_INTENT_STATUSES = [
  "pending",
  "consumed",
  "expired",
  "failed",
] as const;
export type TextileEvidenceUploadIntentStatus =
  (typeof TEXTILE_EVIDENCE_UPLOAD_INTENT_STATUSES)[number];

/** ¿El intento ya venció? (regla pura, testeable) */
export function isTextileUploadIntentExpired(
  expiresAt: string,
  now: Date = new Date()
): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

/**
 * Verificación de FINALIZACIÓN contra la metadata REAL del objeto en
 * Storage (nunca solo la declarada por el cliente). Devuelve el primer
 * error o null. Regla pura compartida por action y tests.
 */
export function validateTextileEvidenceUploadedObject(input: {
  expectedSizeBytes: number;
  expectedMimeType: string;
  realSizeBytes: number | null | undefined;
  realMimeType: string | null | undefined;
}): string | null {
  if (input.realSizeBytes === null || input.realSizeBytes === undefined) {
    return "El archivo no se encontró en el almacenamiento. Sube el archivo de nuevo.";
  }
  if (input.realSizeBytes <= 0 || input.realSizeBytes > TEXTILE_EVIDENCE_MAX_FILE_BYTES) {
    return `El archivo supera el tamaño máximo permitido (${TEXTILE_EVIDENCE_MAX_FILE_MB} MB).`;
  }
  if (input.realSizeBytes !== input.expectedSizeBytes) {
    return "El archivo subido no coincide con el declarado (tamaño). Sube el archivo de nuevo.";
  }
  const realMime = input.realMimeType ?? "";
  if (!isAllowedTextileEvidenceMime(realMime)) {
    return "Tipo de archivo no permitido (PDF, imagen, Word, Excel o CSV).";
  }
  if (realMime !== input.expectedMimeType) {
    return "El archivo subido no coincide con el declarado (tipo). Sube el archivo de nuevo.";
  }
  return null;
}

/**
 * T9E.4 · Forma CANÓNICA de la ruta de un objeto textil en el bucket
 * `evidences`, verificada antes de cualquier retirada FÍSICA:
 *
 *     {organization_id}/textiles/{intent_id}/{archivo}
 *
 * Exactamente cuatro segmentos, sin traversal (`..`), sin backslashes, sin
 * segmentos vacíos y con los UUID esperados en su sitio. La ruta que se valida
 * SIEMPRE proviene de la base (columna `object_path` del intento), nunca del
 * cliente: esta comprobación es defensa en profundidad, no la única barrera.
 */
export function isCanonicalTextileObjectPath(
  objectPath: string,
  organizationId: string,
  intentId: string
): boolean {
  if (typeof objectPath !== "string" || objectPath.length === 0) return false;
  if (objectPath.includes("\\") || objectPath.includes("\0")) return false;
  if (objectPath.startsWith("/")) return false;
  const segments = objectPath.split("/");
  if (segments.length !== 4) return false;
  const [org, prefix, intent, fileName] = segments;
  if (segments.some((s) => s.length === 0 || s === "." || s === "..")) return false;
  if (prefix !== "textiles") return false;
  if (org !== organizationId || intent !== intentId) return false;
  return fileName.length > 0;
}
