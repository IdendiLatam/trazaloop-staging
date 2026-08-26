import Link from "next/link";
import { LifecycleBadge } from "@/components/domain/quality/lifecycle-badge";
import {
  LIFECYCLE_LABEL,
  LIFECYCLE_STATES,
  displayRevision,
  effectivityCaption,
  formatDate,
  orDash,
  orPending,
} from "@/lib/domain/document-control";
import {
  QUALITY_DOCUMENT_CATEGORIES,
  qualityDocumentCategoryLabel,
} from "@/lib/domain/quality-documents";
import {
  decisionLabel,
  describeFilters,
  type MasterListFilters,
  type MasterListRow,
} from "@/lib/domain/document-master-list";
import { shellModuleName, trazadocDocumentHref } from "@/lib/modules/registry";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

/**
 * Trazaloop Quality · QUALITY-02 · Lista Maestra de documentos.
 *
 * Es una PROYECCIÓN de la fuente documental, no una tabla paralela: nadie la
 * sincroniza y no puede quedarse desfasada. Los filtros viajan en la URL, de
 * modo que la lista es compartible y el PDF puede declarar exactamente los
 * mismos filtros que se ven en pantalla.
 *
 * Componente de SERVIDOR: no necesita estado de cliente. El formulario de
 * filtros es un GET normal, así que funciona con o sin JavaScript.
 */

const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-2 py-1.5 text-xs text-ink focus:border-loop";

function queryString(filters: MasterListFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && value.length > 0 && value !== "all") params.set(key, value);
  }
  const q = params.toString();
  return q.length > 0 ? `?${q}` : "";
}

export function QualityMasterListView({
  rows,
  filters,
  owners,
  processes,
  origins,
  totalBeforeFilters,
}: {
  rows: MasterListRow[];
  filters: MasterListFilters;
  owners: string[];
  processes: string[];
  origins: string[];
  totalBeforeFilters: number;
}) {
  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Link href="/quality/documents" className="text-xs text-loop hover:underline">
          ← Volver a Documentos de Quality
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Lista Maestra de documentos</h1>
        <p className="max-w-3xl text-sm text-ink-soft">
          Todos los documentos del sistema de gestión con su revisión vigente, su estado, quién
          responde por ellos y desde cuándo rigen. Se construye sola a partir de los documentos
          reales: no hay una lista aparte que alguien deba mantener al día.
        </p>
        <p className="text-xs text-ink-soft">
          {rows.length === totalBeforeFilters
            ? `${rows.length} ${rows.length === 1 ? "documento" : "documentos"}.`
            : `${rows.length} de ${totalBeforeFilters} documentos · ${describeFilters(filters)}`}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {/* EXPORT-01 · La descarga pasa por el endpoint único. El PDF sigue
              siendo EL MISMO artefacto validado (§27); lo que cambió es la
              puerta: una sola clave, una sola política de nombres y cabeceras.
              Los filtros viajan con los MISMOS nombres que la pantalla. */}
          <ExportPdfButton exportKey="quality.master-list.list" filters={filters} />
          <Link
            href={`/quality/documents/master/csv${queryString(filters)}`}
            className="inline-flex w-auto items-center justify-center rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-loop"
          >
            Descargar CSV
          </Link>
        </div>
      </header>

      <form method="get" className="grid gap-3 rounded-lg border border-hairline bg-surface p-4 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Estado</span>
          <select name="lifecycle" defaultValue={filters.lifecycle ?? "all"} className={inputClass}>
            <option value="all">Todos</option>
            {LIFECYCLE_STATES.map((s) => (
              <option key={s} value={s}>{LIFECYCLE_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Tipo</span>
          <select name="category" defaultValue={filters.category ?? "all"} className={inputClass}>
            <option value="all">Todos</option>
            {QUALITY_DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{qualityDocumentCategoryLabel(c)}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Propietario</span>
          <select name="owner" defaultValue={filters.owner ?? "all"} className={inputClass}>
            <option value="all">Todos</option>
            {owners.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Proceso</span>
          <select name="process" defaultValue={filters.process ?? "all"} className={inputClass}>
            <option value="all">Todos</option>
            {processes.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Revisor</span>
          <input name="reviewer" defaultValue={filters.reviewer ?? ""} className={inputClass} placeholder="Nombre" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Aprobador</span>
          <input name="approver" defaultValue={filters.approver ?? ""} className={inputClass} placeholder="Nombre" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Revisión periódica</span>
          <select name="review" defaultValue={filters.review ?? "all"} className={inputClass}>
            <option value="all">Sin filtrar</option>
            <option value="due">Con revisión programada</option>
            <option value="overdue">Revisión vencida</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium">Origen</span>
          <select name="origin" defaultValue={filters.origin ?? "all"} className={inputClass}>
            <option value="all">Todos</option>
            {origins.map((o) => (
              <option key={o} value={o}>{shellModuleName(o)}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-3">
          <span className="mb-1 block text-[11px] font-medium">Buscar por título o código</span>
          <input name="search" defaultValue={filters.search ?? ""} className={inputClass} />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="inline-flex w-auto items-center justify-center rounded-md bg-loop px-3 py-1.5 text-xs font-semibold text-white hover:bg-loop-deep"
          >
            Aplicar filtros
          </button>
          <Link
            href="/quality/documents/master"
            className="inline-flex w-auto items-center justify-center rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-soft hover:border-loop"
          >
            Limpiar
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-hairline bg-surface p-6 text-sm text-ink-soft">
          Ningún documento cumple los filtros aplicados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
          <table className="w-full min-w-[68rem] text-left text-xs">
            <thead className="border-b border-hairline text-ink-soft">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Título</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Revisión vigente</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Propietario</th>
                <th className="px-3 py-2 font-medium">Revisor(es)</th>
                <th className="px-3 py-2 font-medium">Aprobador(es)</th>
                <th className="px-3 py-2 font-medium">Creado</th>
                <th className="px-3 py-2 font-medium">Enviado</th>
                <th className="px-3 py-2 font-medium">Aprobado</th>
                <th className="px-3 py-2 font-medium">Vigencia</th>
                <th className="px-3 py-2 font-medium">Próxima revisión</th>
                <th className="px-3 py-2 font-medium">Procesos</th>
                <th className="px-3 py-2 font-medium">Origen</th>
                <th className="px-3 py-2 font-medium">Última decisión</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href = trazadocDocumentHref(r.moduleKey, r.documentId);
                return (
                  <tr key={r.documentId} className="border-b border-hairline last:border-0 align-top">
                    <td className="px-3 py-2 code whitespace-nowrap">{orDash(r.code)}</td>
                    <td className="px-3 py-2">
                      {href ? (
                        <Link href={href} className="font-medium text-loop hover:underline">{r.title}</Link>
                      ) : (
                        <span className="font-medium">{r.title}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.categoryLabel}</td>
                    <td className="px-3 py-2">
                      {r.effectiveRevisionNumber !== null
                        ? `Revisión ${r.effectiveRevisionNumber}`
                        : r.revisionModel === "controlled"
                          ? <span className="text-ink-soft">Ninguna vigente</span>
                          : displayRevision({
                              revisionModel: r.revisionModel,
                              currentVersion: r.currentVersion,
                              currentRevisionNumber: r.currentRevisionNumber,
                            })}
                    </td>
                    <td className="px-3 py-2"><LifecycleBadge state={r.lifecycle} compact /></td>
                    <td className="px-3 py-2">
                      {orPending(r.ownerPositionName ?? r.ownerName, "Sin asignar")}
                    </td>
                    <td className="px-3 py-2">{orPending(r.reviewers, "Sin designar")}</td>
                    <td className="px-3 py-2">{orPending(r.approvers, "Sin designar")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.submittedAt ? formatDate(r.submittedAt) : "Pendiente"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.approvedAt ? formatDate(r.approvedAt) : "Pendiente"}</td>
                    <td className="px-3 py-2">
                      {effectivityCaption({
                        lifecycle: r.lifecycle,
                        approvedAt: r.approvedAt,
                        effectiveFrom: r.effectiveFrom ?? r.currentEffectiveFrom,
                        effectiveTo: r.effectiveTo,
                      })}
                    </td>
                    <td className="px-3 py-2">
                      {r.reviewDueAt === null ? (
                        <span className="text-ink-soft">No aplica</span>
                      ) : (
                        <span className={r.reviewOverdue ? "text-danger" : ""}>
                          {formatDate(r.reviewDueAt)}{r.reviewOverdue ? " · vencida" : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{orDash(r.processNames)}</td>
                    <td className="px-3 py-2">{shellModuleName(r.moduleKey).replace(/^Trazaloop /, "")}</td>
                    <td className="px-3 py-2">
                      {r.lastDecisionAt === null ? (
                        <span className="text-ink-soft">Sin decisiones</span>
                      ) : (
                        `${decisionLabel(r.lastDecisionType)} · ${formatDate(r.lastDecisionAt)}`
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink-soft">
        Un documento aprobado no siempre está vigente: si su entrada en vigencia es posterior a hoy,
        la lista lo dice. Una revisión periódica vencida tampoco lo vuelve obsoleto — señala que
        conviene revisarlo.
      </p>
    </div>
  );
}
