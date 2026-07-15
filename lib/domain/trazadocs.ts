/**
 * Trazaloop · Sprint 9 · Lógica PURA de TrazaDocs.
 *
 * Mismo patrón que lib/domain/team.ts, settings.ts y platform.ts: esta
 * ESPECIFICACIÓN refleja las mismas reglas que ya implementan las RLS y
 * triggers de 0043 (guarda de rol vs. estado en UPDATE de
 * trazadoc_documents/trazadoc_document_sections/trazadoc_document_versions/
 * trazadoc_status_history). Es intencionalmente MÁS estricta que la RLS en
 * un punto (edición directa de un documento obsoleto, ver
 * canEditDocument): la RLS es la barrera de seguridad real; esta capa es
 * la regla de negocio que el server action aplica ANTES de intentar
 * escribir, para dar un mensaje claro.
 *
 * Sin imports de Supabase, de servidor ni de Next. No cambia la
 * metodología de cálculo de contenido reciclado: TrazaDocs es
 * documentación, no cálculo.
 */
import type { TeamRoleCode } from "./team";
import type { PlatformRoleCode } from "./platform";

// ---------------------------------------------------------------------------
// Catálogos y tipos.
// ---------------------------------------------------------------------------
export const DOCUMENT_STATUSES = ["draft", "in_review", "approved", "obsolete"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: "Borrador",
  in_review: "En revisión",
  approved: "Aprobado",
  obsolete: "Obsoleto",
};

export const BLUEPRINT_STATUSES = ["active", "inactive"] as const;
export type BlueprintStatus = (typeof BLUEPRINT_STATUSES)[number];

export const SOURCE_TYPES = ["suggested", "custom"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const DOCUMENT_TYPES = ["manual", "procedure", "instruction", "free_structure", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  manual: "Manual",
  procedure: "Procedimiento",
  instruction: "Instructivo",
  free_structure: "Estructura libre",
  other: "Otro",
};

export function isDocumentStatus(v: string | null | undefined): v is DocumentStatus {
  return !!v && (DOCUMENT_STATUSES as readonly string[]).includes(v);
}

export function isBlueprintStatus(v: string | null | undefined): v is BlueprintStatus {
  return !!v && (BLUEPRINT_STATUSES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Permisos de empresa (Parte 11). Mismo mapeo admin/quality/consultant →
// Administrador/Supervisor/Consultor ya usado en todo TrazaDocs — sin
// inventar roles nuevos, reutiliza TeamRoleCode de lib/domain/team.ts.
// ---------------------------------------------------------------------------

/** Los 3 roles de empresa pueden crear documentos (sugeridos o libres). */
export function canCreateDocument(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin" || role === "quality" || role === "consultant";
}

/**
 * ¿Puede este rol editar el CONTENIDO del documento en su estado actual?
 * Sprint 9.1 (Bloqueante 3): editar contenido directamente SOLO se
 * permite en draft/in_review — para los TRES roles por igual, incluidos
 * admin/quality. Un documento aprobado nunca se edita directamente (para
 * eso existe canCreateDraftVersionFromApproved); uno obsoleto tampoco
 * (para eso existe canReactivateDocument).
 */
export function canEditDocument(role: TeamRoleCode | null | undefined, status: DocumentStatus): boolean {
  if (status !== "draft" && status !== "in_review") return false;
  return role === "admin" || role === "quality" || role === "consultant";
}

/** Enviar a revisión (draft → in_review): los 3 roles pueden. */
export function canSubmitForReview(role: TeamRoleCode | null | undefined, status: DocumentStatus): boolean {
  return canCreateDocument(role) && status === "draft";
}

/** Aprobar: admin y quality (Supervisor) sí — consultant NUNCA (Parte 11,
 *  "Para este sprint, permitir que quality apruebe también es aceptable
 *  porque cumple rol de revisión técnica"). */
export function canApproveDocument(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin" || role === "quality";
}

/** Marcar obsoleto: mismo criterio que aprobar — admin y quality, nunca
 *  consultant. */
export function canMarkObsolete(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin" || role === "quality";
}

/** Reactivar un documento obsoleto (obsolete → draft): solo admin (Parte 9:
 *  "No debe editarse salvo que admin lo reactive o cree nueva versión"). */
export function canReactivateDocument(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin";
}

/** Crear una versión nueva en borrador A PARTIR de un documento aprobado
 *  (Sprint 9.1, Bloqueante 3): admin y quality — nunca consultant, que no
 *  puede "reabrir" un documento ya aprobado bajo ninguna circunstancia. */
export function canCreateDraftVersionFromApproved(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin" || role === "quality";
}

/** Eliminar una sección: solo admin/quality, y el server action además
 *  exige documento en draft (mismo criterio que la RLS de DELETE). */
export function canDeleteSection(role: TeamRoleCode | null | undefined): boolean {
  return role === "admin" || role === "quality";
}

// ---------------------------------------------------------------------------
// Permisos de plataforma (blueprints/hints). Nunca se mezclan con los
// roles de empresa: PlatformRoleCode viene de lib/domain/platform.ts.
// ---------------------------------------------------------------------------

/** Solo superadmin de plataforma edita blueprints y sus hints — support,
 *  aunque vea /platform/trazadocs, no puede editar (Parte 6, Parte 19). */
export function canEditBlueprint(platformRole: PlatformRoleCode | null | undefined): boolean {
  return platformRole === "superadmin";
}

/** Un blueprint inactivo nunca aparece como estructura sugerida
 *  seleccionable para crear un documento nuevo (Parte 15 de pruebas). */
export function isBlueprintSelectable(status: BlueprintStatus): boolean {
  return status === "active";
}

// ---------------------------------------------------------------------------
// Construcción de secciones al crear un documento desde blueprint (Parte
// 8.1, caso de prueba 1: "genera secciones vacías").
// ---------------------------------------------------------------------------
export type BlueprintSectionFacts = {
  id: string;
  sectionKey: string;
  title: string;
  hint: string | null;
  sortOrder: number;
  isRequired: boolean;
};

export type DraftDocumentSection = {
  blueprintSectionId: string | null;
  sectionKey: string;
  title: string;
  content: string;
  sortOrder: number;
  isRequired: boolean;
};

/** Copia las secciones de un blueprint a un documento nuevo, SIEMPRE con
 *  contenido vacío — el usuario las diligencia después dentro de la
 *  plataforma (nunca se genera contenido de relleno). */
export function buildSectionsFromBlueprint(sections: BlueprintSectionFacts[]): DraftDocumentSection[] {
  return sections
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => ({
      blueprintSectionId: s.id,
      sectionKey: s.sectionKey,
      title: s.title,
      content: "",
      sortOrder: s.sortOrder,
      isRequired: s.isRequired,
    }));
}

// ---------------------------------------------------------------------------
// Documento libre (Parte 8.2, casos de prueba 2 y 3).
// ---------------------------------------------------------------------------
export type CustomDocumentInput = {
  title: string;
  code?: string | null;
  description?: string | null;
  ownerId?: string | null;
};

export type TrazadocsValidation = { error: string | null };

export function validateCustomDocumentInput(input: CustomDocumentInput): TrazadocsValidation {
  if (!input.title || input.title.trim().length === 0) {
    return { error: "El nombre del documento no puede estar vacío." };
  }
  return { error: null };
}

export type CustomSectionInput = {
  title: string;
  content?: string | null;
  isRequired?: boolean;
};

/** section_key técnico a partir de un título libre — determinístico y
 *  legible, sin depender de ningún id externo. */
export function slugifySectionKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "seccion";
}

export function validateCustomSectionInput(input: CustomSectionInput): TrazadocsValidation {
  if (!input.title || input.title.trim().length === 0) {
    return { error: "El título de la sección no puede estar vacío." };
  }
  return { error: null };
}

export type TrustedDocumentInsert = {
  source_type: SourceType;
  blueprint_id: string | null;
  title: string;
  code: string | null;
  description: string | null;
  owner_id: string | null;
};

/**
 * Arma el payload de creación de un documento. NUNCA declara
 * organization_id ni created_by: el server action los toma siempre de la
 * empresa activa y de la sesión validadas en servidor (Parte 23, caso 13
 * — mismo patrón que buildInvitationInsertPayload / buildCompanySettingsUpdatePayload).
 */
export function buildCustomDocumentInsertPayload(input: CustomDocumentInput): TrustedDocumentInsert {
  return {
    source_type: "custom",
    blueprint_id: null,
    title: input.title.trim(),
    code: input.code?.trim() || null,
    description: input.description?.trim() || null,
    owner_id: input.ownerId || null,
  };
}

export function buildSuggestedDocumentInsertPayload(
  blueprintId: string,
  title: string,
  ownerId: string | null
): TrustedDocumentInsert {
  return {
    source_type: "suggested",
    blueprint_id: blueprintId,
    title: title.trim(),
    code: null,
    description: null,
    owner_id: ownerId,
  };
}

// ---------------------------------------------------------------------------
// Versionamiento (Parte 10, casos de prueba 10 y 11).
// ---------------------------------------------------------------------------

/** Cada versión nueva SIEMPRE incrementa — nunca reutiliza ni sobrescribe
 *  un número de versión anterior (append-only real). */
export function resolveNextVersionNumber(currentVersion: number): number {
  return currentVersion + 1;
}

/** Acciones que SIEMPRE generan una versión nueva: creación inicial,
 *  enviar a revisión, aprobar, marcar obsoleto — cualquier cambio de
 *  estado, más "guardar cambios importantes" explícito. Editar contenido
 *  sin cambiar de estado NO genera versión automáticamente (se ofrece
 *  "guardar nueva versión" como acción aparte, Parte 10). */
export function statusChangeAlwaysCreatesVersion(fromStatus: DocumentStatus | null, toStatus: DocumentStatus): boolean {
  return fromStatus === null || fromStatus !== toStatus;
}

/**
 * Snapshot de la versión inicial (Sprint 9.1, Bloqueante 1): MISMA forma
 * exacta que arma la RPC change_trazadoc_document_status (0046/0047) —
 * así cualquier versión, sea la v1 creada al momento de crear el
 * documento o una posterior generada por la RPC, se ve igual en
 * /trazadocs/[id]/versions.
 */
export type VersionSnapshot = {
  document: { title: string; code: string | null; description: string | null };
  sections: { section_key: string; title: string; content: string; sort_order: number; is_required: boolean }[];
};

export function buildInitialVersionSnapshot(
  document: { title: string; code: string | null; description: string | null },
  sections: { sectionKey: string; title: string; content: string; sortOrder: number; isRequired: boolean }[]
): VersionSnapshot {
  return {
    document: { title: document.title, code: document.code, description: document.description },
    sections: sections
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({
        section_key: s.sectionKey,
        title: s.title,
        content: s.content,
        sort_order: s.sortOrder,
        is_required: s.isRequired,
      })),
  };
}

// ---------------------------------------------------------------------------
// Checklist de Implementación (Parte 21): "Documentos técnicos mínimos
// creados". Usa los MISMOS valores que ChecklistStatus (lib/domain/implementation.ts,
// Sprint 6) a propósito — así se reutiliza ChecklistStatusBadge tal cual,
// sin crear un badge nuevo para lo mismo.
// ---------------------------------------------------------------------------
export type TrazadocsChecklistStatus = "pendiente" | "en progreso" | "completo";

export function resolveTrazadocsChecklistStatus(counts: {
  totalDocuments: number;
  draftOrInReviewCount: number;
  approvedOrInReviewCount: number;
}): TrazadocsChecklistStatus {
  if (counts.totalDocuments === 0) return "pendiente";
  if (counts.approvedOrInReviewCount > 0) return "completo";
  return "en progreso";
}
