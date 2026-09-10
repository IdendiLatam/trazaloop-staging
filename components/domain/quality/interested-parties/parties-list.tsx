import Link from "next/link";
import { ListPagination, ListSearchForm } from "@/components/ui/list-controls";
import { EmptyState } from "@/components/ui/empty-state";
import {
  MONITORING_METHOD_LABEL, RELEVANCE_LABEL, RELEVANCE_STATES, REVIEW_STATES,
  REVIEW_STATE_LABEL, SUBJECT_KINDS, SUBJECT_KIND_LABEL,
  type MonitoringMethod, type RelevanceState, type ReviewState, type SubjectKind,
} from "@/lib/domain/quality-interested-parties";
import type {
  AssessmentRow, CategoryRow, ListRowMonitoring,
} from "@/lib/db/quality-interested-parties";
import {
  PriorityBadge, RelevanceBadge, ReviewStateBadge, SubjectKindBadge,
} from "./badges";

/**
 * QUALITY-12.3B3A · El listado.
 *
 * UNA lista con entidades externas y colectivos juntos, porque la pregunta de
 * la 4.2 es «quién importa», no «quién importa de los que facturan». Se
 * distinguen con una insignia, no con dos pestañas: separarlos obligaría a
 * mirar dos sitios para responder una sola pregunta.
 *
 * Y no es una hoja de cálculo. Seis datos por fila: quién es, de qué tipo, de
 * qué categoría, si es pertinente, con qué prioridad si la hay, y cómo va su
 * seguimiento. Lo demás está en la ficha, que es donde se trabaja.
 *
 * Búsqueda, filtros, conteo y paginación son de SERVIDOR. Filtrar la página ya
 * cargada encontraría solo lo que cupo en ella, que es la forma más limpia de
 * mentir sin darse cuenta.
 */
export function InterestedPartiesList({
  rows, monitoring, categories, total, page, pageSize, basePath, params, canManage,
}: {
  rows: AssessmentRow[];
  monitoring: Map<string, ListRowMonitoring>;
  categories: CategoryRow[];
  total: number;
  page: number;
  pageSize: number;
  basePath: string;
  params: {
    q: string; categoria?: string; tipo?: string; pertinencia?: string;
    revision?: string; prioridad?: string;
  };
  canManage: boolean;
}) {
  const hidden = {
    categoria: params.categoria, tipo: params.tipo, pertinencia: params.pertinencia,
    revision: params.revision, prioridad: params.prioridad,
  };
  const extra = { ...hidden, q: params.q || undefined };

  return (
    <section className="space-y-4">
      {/* STABILIZATION-03 · Este buscador consulta ANÁLISIS, no identidades, y
          la etiqueta lo dice. Prometía «buscar por nombre de la parte» y una
          parte recién dada de alta y todavía sin analizar era invisible: quien
          la buscaba no la encontraba y la volvía a crear. Buscar identidades
          está donde se crean, en el panel de alta. */}
      <ListSearchForm
        basePath={basePath}
        q={params.q}
        placeholder="Buscar en los análisis por nombre de la parte o del colectivo"
        hiddenParams={hidden}
      />

      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
        {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
        <Filtro name="categoria" label="Categoría" value={params.categoria}
          options={categories.map((c) => ({ value: c.id, label: c.name }))} />
        <Filtro name="tipo" label="Tipo" value={params.tipo}
          options={SUBJECT_KINDS.map((k) => ({ value: k, label: SUBJECT_KIND_LABEL[k as SubjectKind] }))} />
        <Filtro name="pertinencia" label="Pertinencia" value={params.pertinencia}
          options={RELEVANCE_STATES.map((r) => ({ value: r, label: RELEVANCE_LABEL[r as RelevanceState] }))} />
        <Filtro name="revision" label="Estado de revisión" value={params.revision}
          options={[
            ...REVIEW_STATES.map((r) => ({ value: r, label: REVIEW_STATE_LABEL[r as ReviewState] })),
            { value: "no_strategy", label: "Sin estrategia" },
          ]} />
        <button
          type="submit"
          className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:border-loop"
        >
          Filtrar
        </button>
        {params.categoria || params.tipo || params.pertinencia || params.revision ? (
          <Link href={basePath} className="px-1 py-2 text-sm text-ink-soft hover:underline">
            Quitar filtros
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={
            params.q || params.categoria || params.tipo || params.pertinencia || params.revision
              ? "Ninguna parte interesada coincide con lo que buscas."
              : "Todavía no hay partes interesadas analizadas."
          }
          description={
            canManage
              ? "Empieza por quien más condiciona el trabajo: un cliente, un ente regulador, "
                + "el personal. Analizar una parte es decir si es pertinente y por qué."
              : "Cuando alguien de tu empresa registre el primer análisis, aparecerá aquí."
          }
        />
      ) : (
        <>
          {/* Móvil: tarjetas. Una tabla de siete columnas en un teléfono no se
              lee, se adivina. */}
          <ul className="space-y-2 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`${basePath}/${r.id}`}
                  className="block rounded-lg border border-hairline bg-surface p-3 hover:border-loop"
                >
                  <span className="block text-sm font-medium">{r.subjectLabel}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <SubjectKindBadge kind={r.subjectKind} />
                    <RelevanceBadge status={r.relevanceStatus} />
                    <PriorityBadge
                      priorityLabel={r.priorityLabel} priorityScore={r.priorityScore}
                      priorityMethodNote={r.priorityMethodNote} />
                  </span>
                  <span className="mt-1 block text-xs text-ink-soft">
                    {r.categoryName ?? "Sin categoría"} · {seguimientoTexto(monitoring.get(r.id))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Partes interesadas con análisis vigente
              </caption>
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th scope="col" className="py-2 pr-3 font-medium">Parte interesada</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Tipo</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Categoría</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Pertinencia</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Prioridad</th>
                  <th scope="col" className="py-2 font-medium">Seguimiento</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const m = monitoring.get(r.id);
                  return (
                    <tr key={r.id} className="border-b border-hairline/60 align-top">
                      <td className="py-2 pr-3">
                        <Link href={`${basePath}/${r.id}`} className="font-medium text-loop hover:underline">
                          {r.subjectLabel}
                        </Link>
                      </td>
                      <td className="py-2 pr-3"><SubjectKindBadge kind={r.subjectKind} /></td>
                      <td className="py-2 pr-3 text-ink-soft">{r.categoryName ?? "Sin categoría"}</td>
                      <td className="py-2 pr-3"><RelevanceBadge status={r.relevanceStatus} /></td>
                      <td className="py-2 pr-3">
                        <PriorityBadge
                          priorityLabel={r.priorityLabel} priorityScore={r.priorityScore}
                          priorityMethodNote={r.priorityMethodNote} />
                      </td>
                      <td className="py-2">
                        {m && m.activeStrategies > 0 ? (
                          <span className="flex flex-wrap items-center gap-1">
                            {m.reviewState ? <ReviewStateBadge state={m.reviewState} /> : null}
                            <span className="text-xs text-ink-soft">
                              {m.activeStrategies === 1
                                ? "1 estrategia"
                                : `${m.activeStrategies} estrategias`}
                              {m.monitoringMethods.length > 0
                                ? ` · ${m.monitoringMethods
                                    .map((x) => MONITORING_METHOD_LABEL[x as MonitoringMethod] ?? x)
                                    .join(", ")}`
                                : ""}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-ink-soft">Sin estrategia</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ListPagination
            basePath={basePath} page={page} pageSize={pageSize} total={total} extraParams={extra} />
        </>
      )}
    </section>
  );
}

function seguimientoTexto(m: ListRowMonitoring | undefined): string {
  if (!m || m.activeStrategies === 0) return "Sin estrategia";
  const estado = m.reviewState ? REVIEW_STATE_LABEL[m.reviewState] : "";
  return `${m.activeStrategies === 1 ? "1 estrategia" : `${m.activeStrategies} estrategias`}`
    + (estado ? ` · ${estado}` : "");
}

function Filtro({
  name, label, value, options,
}: {
  name: string; label: string; value?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-ink">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ""}
        className="block rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
      >
        <option value="">Todas</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
