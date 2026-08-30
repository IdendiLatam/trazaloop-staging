import Link from "next/link";
import type { QualityHome } from "@/lib/db/quality-home";
import { AskCopilotButton } from "@/components/domain/quality/copilot/ask-button";
import {
  GROUP_HINT, GROUP_LABEL, HOME_DOMAINS, HOME_SAMPLE, attentionState, domainAttention,
  filterHref, filterSummary, groupAttention, incompleteNotice, toLine,
  type HomeFilters,
} from "@/lib/domain/quality-home";

/**
 * Trazaloop · QUALITY-13B4 · La portada de Quality.
 *
 * RESPONDE UNA PREGUNTA, Y LO DEMÁS VA DEBAJO
 *
 *   ¿qué requiere atención en mi empresa?
 *
 * Y en segundo lugar, en pequeño: ¿dónde entro? La portada vieja enseñaba diez
 * cajas del mismo tamaño y siete tarjetas de «cómo se construye»; había que
 * leerlas todas para saber qué importaba. Aquí lo que importa está arriba y
 * ocupa el sitio que le corresponde.
 *
 * LO QUE ESTA PANTALLA NO HACE
 *
 *   · **No cuenta.** Todos los números vienen del resumen ya deduplicado de B3
 *     o de un cargador de contexto. Contar aquí sería reintroducir la
 *     duplicación que B3 quitó.
 *   · **No edita.** Ni un formulario. Se entiende y se navega; se resuelve en
 *     el dominio dueño.
 *   · **No enseña cómo está hecha.** Ni «observador», ni «barrido», ni «clave
 *     de deduplicación». Eso es vocabulario de dentro.
 *   · **No afirma conformidad.** Ni con todo en verde.
 */

function Count({ n, tone }: { n: number; tone?: "attention" }) {
  if (n <= 0) return null;
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${
      tone === "attention"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300"
        : "border-hairline bg-paper text-ink-soft"
    }`}>
      {n}
    </span>
  );
}

// ---------------------------------------------------------------------------
// La atención
// ---------------------------------------------------------------------------

function AttentionArea({ home, filters }: { home: QualityHome; filters: HomeFilters }) {
  const estado = attentionState(home.summary.total, home.sources);
  const aviso = incompleteNotice(home.sources);
  const grupos = groupAttention(home.items);
  const restantes = home.summary.total - home.items.length;

  return (
    <section
      aria-labelledby="atencion-title"
      className="space-y-3 rounded-lg border border-hairline bg-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="atencion-title" className="text-lg font-semibold tracking-tight">
          Necesita atención
        </h2>
        {estado.kind === "items" ? (
          <p className="text-sm tabular-nums text-ink-soft">
            <span className="text-2xl font-semibold text-ink">{home.summary.total}</span>
            {home.summary.total === 1 ? " asunto" : " asuntos"}
          </p>
        ) : null}
      </div>

      {/* El aviso de información incompleta va ARRIBA: leerlo después de los
          números sería leerlo tarde. */}
      {aviso ? (
        <p className="rounded-md border border-hairline bg-paper px-3 py-2 text-xs text-ink-soft">
          {aviso}
        </p>
      ) : null}

      {home.structure.engineFailing.status === "ok" && home.structure.engineFailing.data ? (
        <p className="rounded-md border border-hairline bg-paper px-3 py-2 text-xs text-ink-soft">
          La automatización falló en los últimos días. Es una avería técnica, no una
          condición de calidad — pero mientras dure, puede faltar información aquí.
        </p>
      ) : null}

      {estado.kind !== "items" ? (
        <p className="text-sm text-ink-soft">{estado.text}</p>
      ) : (
        <>
          {/* Cuántos de cada clase. Vencido y Se acerca solo cuando la
              condición de verdad habla de fechas; el resto es «por su estado». */}
          <div className="flex flex-wrap gap-2">
            {home.summary.overdue > 0 ? (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                {home.summary.overdue} {GROUP_LABEL.overdue.toLowerCase()}
              </span>
            ) : null}
            {home.summary.dueSoon > 0 ? (
              <span className="rounded-full border border-hairline bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                {home.summary.dueSoon} se acerca
              </span>
            ) : null}
            {home.summary.timingUnknown > 0 ? (
              <span className="rounded-full border border-hairline bg-paper px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                {home.summary.timingUnknown} sin fecha clara
              </span>
            ) : null}
          </div>

          {grupos.map(({ group, items }) => (
            <div key={group} className="space-y-1.5">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {GROUP_LABEL[group]}
                </h3>
                <p className="text-[11px] text-ink-soft">{GROUP_HINT[group]}</p>
              </div>
              <ul className="space-y-1">
                {items.map((item) => {
                  const l = toLine(item);
                  return (
                    <li key={l.key} className="rounded-md border border-hairline bg-paper px-3 py-2">
                      <Link href={l.href} className="block min-w-0 text-sm font-medium text-loop hover:underline">
                        {l.subject}
                      </Link>
                      <p className="text-xs text-ink-soft">
                        {l.domain} · {l.reason}
                        {l.severity ? ` · ${l.severity}` : ""}
                      </p>
                      <p className="text-[11px] text-ink-soft">{l.temporal}</p>
                      {l.note ? (
                        <p className="text-[11px] text-ink-soft">{l.note}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {restantes > 0 ? (
            <p className="text-xs text-ink-soft">
              Se muestran {HOME_SAMPLE} de {home.summary.total}. Filtra por dominio o entra al
              dominio para verlos todos.
            </p>
          ) : null}
        </>
      )}

      {/* Los filtros, siempre visibles: también cuando no hay nada, porque
          entonces es cuando alguien quiere comprobar si filtró de más. */}
      <nav aria-label="Filtros de atención" className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] text-ink-soft">Ver:</span>
        <Link
          href={filterHref("/quality", { domain: null, processId: filters.processId })}
          aria-current={filters.domain === null ? "true" : undefined}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
            filters.domain === null
              ? "border-loop bg-loop/10 font-medium text-loop-deep"
              : "border-hairline bg-paper text-ink-soft hover:border-loop"
          }`}
        >
          Todo
        </Link>
        {HOME_DOMAINS.flatMap((d) => d.attentionDomains.slice(0, 1).map((dom) => (
          <Link
            key={dom}
            href={filterHref("/quality", { domain: dom, processId: filters.processId })}
            aria-current={filters.domain === dom ? "true" : undefined}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
              filters.domain === dom
                ? "border-loop bg-loop/10 font-medium text-loop-deep"
                : "border-hairline bg-paper text-ink-soft hover:border-loop"
            }`}
          >
            {d.label}
          </Link>
        )))}
      </nav>
    </section>
  );
}

// ---------------------------------------------------------------------------
// El contexto administrativo
// ---------------------------------------------------------------------------

/** Una línea de contexto, o lo que se dice cuando no se pudo leer. */
function Structural({ block, children }: {
  block: { status: string }; children: React.ReactNode;
}) {
  if (block.status === "not_visible") {
    return <p className="text-[11px] text-ink-soft">Tu rol no da acceso a este dominio.</p>;
  }
  if (block.status !== "ok") {
    return <p className="text-[11px] text-ink-soft">No fue posible cargar esta información.</p>;
  }
  return <p className="text-[11px] text-ink-soft">{children}</p>;
}

function DomainTiles({ home }: { home: QualityHome }) {
  const s = home.structure;
  const contexto: Record<string, React.ReactNode> = {
    context: (
      <Structural block={s.context}>
        {s.context.status === "ok"
          ? `${s.context.data.relevant} pertinentes · ${s.context.data.requirements} requisitos`
          : null}
      </Structural>
    ),
    processes: (
      <Structural block={s.quality}>
        {s.quality.status === "ok"
          ? `${s.quality.data.processes} procesos · ${s.quality.data.publishedProcesses} con versión publicada`
          : null}
      </Structural>
    ),
    risks: (
      <Structural block={s.risks}>
        {s.risks.status === "ok"
          ? (s.risks.data.aboveAppetite > 0 || s.risks.data.pendingApproval > 0
              ? [
                  s.risks.data.aboveAppetite > 0
                    ? `${s.risks.data.aboveAppetite} por encima del criterio aceptable` : null,
                  s.risks.data.pendingApproval > 0
                    ? `${s.risks.data.pendingApproval} aceptación por aprobar` : null,
                ].filter(Boolean).join(" · ")
              : "Ninguno por encima del criterio aceptable")
          : null}
      </Structural>
    ),
    performance: (
      <Structural block={s.performance}>
        {s.performance.status === "ok"
          ? `${s.performance.data.objectives} objetivos activos · ${s.performance.data.indicators} indicadores`
            + (s.performance.data.inAttentionZone > 0
              ? ` · ${s.performance.data.inAttentionZone} en zona de atención`
              : "")
          : null}
      </Structural>
    ),
    cases: (
      <Structural block={s.cases}>
        {s.cases.status === "ok"
          ? (s.cases.data.openCases === 0
              ? "No hay casos abiertos"
              : `${s.cases.data.openCases} casos abiertos`
                + (s.cases.data.openNonconformities > 0
                  ? ` · ${s.cases.data.openNonconformities} no conformidades` : ""))
          : null}
      </Structural>
    ),
    documents: (
      <Structural block={s.quality}>
        {s.quality.status === "ok" ? `${s.quality.data.documents} documentos de Quality` : null}
      </Structural>
    ),
    suppliers: (
      <Structural block={s.suppliers}>
        {s.suppliers.status === "ok"
          ? (s.suppliers.data.openIncidents > 0
              ? `${s.suppliers.data.openIncidents} incidentes abiertos`
              : "Sin incidentes abiertos")
          : null}
      </Structural>
    ),
    management_review: (
      <Structural block={s.managementReview}>
        {s.managementReview.status === "ok"
          ? (s.managementReview.data.upcoming > 0 || s.managementReview.data.inPreparation > 0
              ? [
                  s.managementReview.data.upcoming > 0
                    ? `${s.managementReview.data.upcoming} próxima` : null,
                  s.managementReview.data.inPreparation > 0
                    ? `${s.managementReview.data.inPreparation} en preparación` : null,
                ].filter(Boolean).join(" · ")
              : "Ninguna programada")
          : null}
      </Structural>
    ),
  };

  return (
    <section aria-labelledby="dominios-title" className="space-y-2">
      <div>
        <h2 id="dominios-title" className="text-sm font-semibold">Dónde entrar</h2>
        <p className="text-xs text-ink-soft">
          Cada dominio con lo que tiene pendiente. Los asuntos se resuelven dentro; aquí
          solo se llega a ellos.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {HOME_DOMAINS.map((d) => {
          const n = domainAttention(d, home.summary);
          return (
            <Link
              key={d.key}
              href={d.href}
              className="flex flex-col gap-0.5 rounded-lg border border-hairline bg-surface p-3 transition-colors hover:border-loop"
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm font-medium">{d.label}</span>
                <Count n={n} tone="attention" />
              </span>
              {contexto[d.key] ?? null}
              {n > 0 ? (
                <span className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                  {n === 1 ? "1 asunto que atender" : `${n} asuntos que atender`}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// La portada
// ---------------------------------------------------------------------------

export function QualityHomeView({
  home, filters, personalLines,
}: {
  home: QualityHome;
  filters: HomeFilters;
  /** Lo asignado a esta persona. Es OTRA pregunta —qué me toca a mí— y por eso
   *  va aparte y NO suma al total de la empresa. */
  personalLines: string[];
}) {
  const filtro = filterSummary(filters, home.processName);

  return (
    <div className="max-w-4xl space-y-5">
      <header className="space-y-1">
        <p className="eyebrow">Módulos · Trazaloop Quality</p>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Trazaloop Quality</h1>
          {/* QUALITY-13B5 · §6 · UNA entrada, y es un enlace: abre el mismo
              Intelligence de siempre con el contexto fijado a la portada. Ni un
              chat incrustado aquí, ni un motor aparte. */}
          <AskCopilotButton type="quality_home" label="Portada de Quality" />
        </div>
        <p className="text-sm text-ink-soft">
          Qué requiere atención hoy en el sistema de gestión, y desde dónde se atiende.
        </p>
      </header>

      {filtro ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <span>Filtrado por: <span className="font-medium text-ink">{filtro}</span></span>
          <Link href="/quality" className="text-loop hover:underline">Quitar el filtro</Link>
          {filters.processId ? (
            <Link
              href={`/quality/processes/${filters.processId}`}
              className="text-loop hover:underline"
            >
              Ver mirador del proceso
            </Link>
          ) : null}
        </p>
      ) : null}

      <AttentionArea home={home} filters={filters} />

      {personalLines.length > 0 ? (
        <section
          aria-labelledby="mio-title"
          className="rounded-lg border border-hairline bg-surface p-4"
        >
          <h2 id="mio-title" className="text-sm font-semibold">Asignado a ti</h2>
          <p className="text-[11px] text-ink-soft">
            Lo que tienes tú, que no es lo mismo que lo que tiene la empresa: estos
            pendientes ya están contados arriba.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {personalLines.map((l) => (
              <li key={l} className="text-xs text-ink-soft">{l}</li>
            ))}
          </ul>
          <Link
            href="/quality/tasks"
            className="mt-2 inline-flex text-xs font-medium text-loop hover:underline"
          >
            Ver mis tareas
          </Link>
        </section>
      ) : null}

      <DomainTiles home={home} />

      <section
        aria-labelledby="nota-title"
        className="rounded-lg border border-hairline bg-surface p-4"
      >
        <h2 id="nota-title" className="text-sm font-semibold">Qué se está mirando</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Lo de arriba sale de lo que cada dominio sabe ahora mismo: fechas que pasaron,
          estados que piden una decisión y lo que las reglas de la empresa observan. Un
          mismo asunto visto por varios sitios se cuenta una vez. Nada de esto es un
          dictamen de cumplimiento: es lo que hay registrado hoy.
        </p>
      </section>
    </div>
  );
}
