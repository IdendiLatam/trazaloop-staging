/**
 * Trazaloop Quality · QUALITY-02 · Lógica PURA de la Lista Maestra.
 *
 * D-13 y MDR-16: la lista maestra es una PROYECCIÓN de la fuente documental
 * real, nunca una tabla paralela. La proyección la hace la vista
 * v_trazadoc_document_control (0116 §8); lo que vive aquí es el FILTRADO y la
 * presentación —lógica pura, comprobable sin base de datos y compartida por la
 * pantalla, el CSV y el PDF, para que los tres digan exactamente lo mismo.
 */
import { shellModuleName } from "../modules/registry";
import {
  LIFECYCLE_LABEL,
  displayRevision,
  effectivityCaption,
  formatDate,
  orDash,
  orPending,
  type LifecycleState,
  type RevisionModel,
} from "./document-control";

export type MasterListRow = {
  documentId: string;
  moduleKey: string;
  code: string | null;
  title: string;
  categoryCode: string;
  categoryLabel: string;
  lifecycle: LifecycleState;
  revisionModel: RevisionModel;
  currentVersion: number;
  currentRevisionNumber: number | null;
  effectiveRevisionNumber: number | null;
  legacyRevisionUncertain: boolean;
  ownerName: string | null;
  ownerPositionName: string | null;
  reviewers: string | null;
  approvers: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  reviewDueAt: string | null;
  reviewOverdue: boolean;
  processNames: string;
  processCount: number;
  lastDecisionType: string | null;
  lastDecisionAt: string | null;
  disposition: string;
  /** Avance del diligenciamiento, para la lista de documentos. */
  sectionsCount: number;
  filledSectionsCount: number;
};

export type MasterListFilters = {
  lifecycle?: string | null;
  category?: string | null;
  owner?: string | null;
  reviewer?: string | null;
  approver?: string | null;
  process?: string | null;
  /** "overdue" | "due" — atención sobre la revisión periódica. */
  review?: string | null;
  origin?: string | null;
  search?: string | null;
};

function contains(haystack: string | null | undefined, needle: string): boolean {
  return (haystack ?? "").toLowerCase().includes(needle.toLowerCase());
}

/**
 * Filtra la lista. Un filtro vacío o "all" no filtra: es lo que permite que la
 * URL de la lista maestra sea compartible y que el PDF pueda declarar
 * exactamente qué filtros se aplicaron.
 */
export function filterMasterList(rows: MasterListRow[], f: MasterListFilters): MasterListRow[] {
  const active = <T extends string>(v: T | null | undefined) =>
    v && v.length > 0 && v !== "all" ? v : null;

  const lifecycle = active(f.lifecycle);
  const category = active(f.category);
  const owner = active(f.owner);
  const reviewer = active(f.reviewer);
  const approver = active(f.approver);
  const process = active(f.process);
  const review = active(f.review);
  const origin = active(f.origin);
  const search = active(f.search);

  return rows.filter((r) => {
    if (lifecycle && r.lifecycle !== lifecycle) return false;
    if (category && r.categoryCode !== category) return false;
    if (owner && !contains(r.ownerName, owner) && !contains(r.ownerPositionName, owner)) return false;
    if (reviewer && !contains(r.reviewers, reviewer)) return false;
    if (approver && !contains(r.approvers, approver)) return false;
    if (process && !contains(r.processNames, process)) return false;
    if (origin && r.moduleKey !== origin) return false;
    if (review === "overdue" && !r.reviewOverdue) return false;
    if (review === "due" && r.reviewDueAt === null) return false;
    if (search && !contains(r.title, search) && !contains(r.code, search)) return false;
    return true;
  });
}

/** Etiquetas de los filtros aplicados, para el encabezado del PDF (Parte 11). */
export function describeFilters(f: MasterListFilters): string {
  const parts: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (value && value.length > 0 && value !== "all") parts.push(`${label}: ${value}`);
  };
  if (f.lifecycle && f.lifecycle !== "all") {
    const key = f.lifecycle as LifecycleState;
    push("Estado", LIFECYCLE_LABEL[key] ?? f.lifecycle);
  }
  push("Tipo", f.category);
  push("Propietario", f.owner);
  push("Revisor", f.reviewer);
  push("Aprobador", f.approver);
  push("Proceso", f.process);
  push("Origen", f.origin);
  if (f.review === "overdue") parts.push("Solo revisión vencida");
  if (f.review === "due") parts.push("Solo con revisión programada");
  push("Búsqueda", f.search);
  return parts.length === 0 ? "Sin filtros: todos los documentos" : parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Columnas · una sola definición para pantalla, CSV y PDF
// ---------------------------------------------------------------------------
export type MasterColumn = {
  key: string;
  header: string;
  /** Ancho relativo, usado por el PDF para repartir la página. */
  width: number;
  value: (row: MasterListRow) => string;
};

/**
 * Las columnas mínimas del encargo (Parte 9). Cuando un dato todavía no
 * aplica se dice «—» o «Pendiente»: nunca un cero, que se leería como una
 * medición.
 */
export const MASTER_COLUMNS: MasterColumn[] = [
  { key: "code", header: "Código", width: 8, value: (r) => orDash(r.code) },
  { key: "title", header: "Título", width: 16, value: (r) => r.title },
  { key: "category", header: "Tipo", width: 11, value: (r) => r.categoryLabel },
  {
    key: "revision",
    header: "Revisión vigente",
    width: 10,
    value: (r) =>
      r.effectiveRevisionNumber !== null
        ? `Revisión ${r.effectiveRevisionNumber}`
        : r.revisionModel === "controlled"
          ? "Ninguna vigente"
          : displayRevision({
              revisionModel: r.revisionModel,
              currentVersion: r.currentVersion,
              currentRevisionNumber: r.currentRevisionNumber,
            }),
  },
  { key: "state", header: "Estado", width: 11, value: (r) => LIFECYCLE_LABEL[r.lifecycle] },
  {
    key: "owner",
    header: "Propietario",
    width: 11,
    value: (r) => orPending(r.ownerPositionName ?? r.ownerName, "Sin asignar"),
  },
  { key: "reviewers", header: "Revisor(es)", width: 10, value: (r) => orPending(r.reviewers, "Sin designar") },
  { key: "approvers", header: "Aprobador(es)", width: 10, value: (r) => orPending(r.approvers, "Sin designar") },
  { key: "created", header: "Creado", width: 10, value: (r) => formatDate(r.createdAt) },
  { key: "submitted", header: "Enviado", width: 10, value: (r) => (r.submittedAt ? formatDate(r.submittedAt) : "Pendiente") },
  { key: "approved", header: "Aprobado", width: 10, value: (r) => (r.approvedAt ? formatDate(r.approvedAt) : "Pendiente") },
  {
    key: "effective",
    header: "Vigencia",
    width: 13,
    value: (r) =>
      effectivityCaption({
        lifecycle: r.lifecycle,
        approvedAt: r.approvedAt,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo,
      }),
  },
  {
    key: "review_due",
    header: "Próxima revisión",
    width: 10,
    value: (r) =>
      r.reviewDueAt === null
        ? "No aplica"
        : `${formatDate(r.reviewDueAt)}${r.reviewOverdue ? " · vencida" : ""}`,
  },
  { key: "processes", header: "Procesos", width: 10, value: (r) => orDash(r.processNames) },
  {
    // El nombre comercial lleva el prefijo de marca ("Trazaloop Quality"), que
    // en una columna estrecha no aporta nada: dentro de Trazaloop, todo lo es.
    key: "origin", header: "Origen", width: 8,
    value: (r) => shellModuleName(r.moduleKey).replace(/^Trazaloop /, ""),
  },
  {
    key: "last_decision",
    header: "Última decisión",
    width: 12,
    value: (r) =>
      r.lastDecisionAt === null
        ? "Sin decisiones"
        : `${orDash(r.lastDecisionType)} · ${formatDate(r.lastDecisionAt)}`,
  },
];

export function masterListToRows(rows: MasterListRow[]): string[][] {
  return rows.map((r) => MASTER_COLUMNS.map((c) => c.value(r)));
}

export function masterListHeaders(): string[] {
  return MASTER_COLUMNS.map((c) => c.header);
}
