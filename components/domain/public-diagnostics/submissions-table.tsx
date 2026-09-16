import Link from "next/link";
import type { SubmissionRow } from "@/lib/db/public-diagnostic-admin";
import { formatLegalVersion } from "@/lib/domain/public-diagnostics";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01H · Quiénes participaron.
 *
 *
 * LO QUE NO SE PINTA, Y ES DELIBERADO
 *
 * Ni el testigo de acceso al resultado, ni su prefijo, ni la huella del
 * documento de consentimiento. El primero abriría el informe de otra empresa
 * a quien lo copie de una pantalla; los otros dos son metadato de seguridad
 * que no ayuda a administrar nada. La capa de datos ni siquiera los trae: no
 * se filtran aquí, es que no llegan.
 *
 * Los dos consentimientos van en columnas separadas a propósito. Quien no
 * autorizó comunicaciones comerciales aparece igual en el estudio —su
 * diagnóstico es suyo y lo hizo— y eso tiene que verse de un vistazo, para que
 * nadie exporte la lista entera creyendo que es una lista de contactos.
 */

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es", { dateStyle: "short", timeStyle: "short" }) : "—";

const ESTADO: Record<string, string> = {
  in_progress: "En curso",
  completed: "Completada",
  abandoned: "Abandonada",
};

export function SubmissionsTable({
  rows, total, page, pageSize, campaignId, query,
}: {
  rows: SubmissionRow[];
  total: number;
  page: number;
  pageSize: number;
  campaignId: string;
  query: string;
}) {
  const desde = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const hasta = Math.min(page * pageSize, total);
  const páginas = Math.max(1, Math.ceil(total / pageSize));
  const enlace = (p: number) =>
    `/platform/public-diagnostics/${campaignId}?page=${p}`
    + (query ? `&q=${encodeURIComponent(query)}` : "");

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Participaciones</h2>
          <p className="pt-1 text-sm text-ink-soft">
            {total === 0
              ? "Todavía no hay participaciones en esta campaña."
              : `${desde}–${hasta} de ${total}.`}
          </p>
        </div>
        <form method="get" className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-ink-soft" htmlFor="q">Buscar</label>
            <input id="q" name="q" defaultValue={query} placeholder="Empresa o correo"
                   className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm" />
          </div>
          <button type="submit"
                  className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm hover:border-loop">
            Filtrar
          </button>
        </form>
      </div>

      {total > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
          <table className="w-full min-w-[68rem] text-left text-sm">
            <thead className="border-b border-hairline text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Participante</th>
                <th className="px-3 py-2">Contacto</th>
                <th className="px-3 py-2">Inicio</th>
                <th className="px-3 py-2">Fin</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Autorización</th>
                <th className="px-3 py-2">Comercial</th>
                <th className="px-3 py-2">Puntaje</th>
                <th className="px-3 py-2">Nivel</th>
                <th className="px-3 py-2">Repetición</th>
                <th className="px-3 py-2">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-hairline/60 align-top">
                  <td className="px-3 py-2 font-medium">{s.companyName}</td>
                  <td className="px-3 py-2">{s.participantName}</td>
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {s.participantEmail}
                    {s.participantPhone ? <span className="block">{s.participantPhone}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">{fecha(s.startedAt)}</td>
                  <td className="px-3 py-2 text-xs text-ink-soft">{fecha(s.completedAt)}</td>
                  <td className="px-3 py-2">{ESTADO[s.status] ?? s.status}</td>
                  <td className="px-3 py-2 text-xs">
                    {s.consentVersion ? formatLegalVersion(s.consentVersion) : "—"}
                    <span className="block text-ink-soft">{fecha(s.consentAt)}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {s.marketingOptIn ? "Sí" : "No"}
                    {s.marketingOptIn
                      ? <span className="block text-ink-soft">{fecha(s.marketingOptInAt)}</span>
                      : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {s.maturityPercent === null ? "—" : `${s.maturityPercent}%`}
                  </td>
                  <td className="px-3 py-2 text-xs">{s.readinessLevel ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {s.supersedesId ? "Repite una anterior" : null}
                    {s.supersededById ? "Superada por otra" : null}
                    {!s.supersedesId && !s.supersededById ? "—" : null}
                  </td>
                  {/*
                    PUBLIC-DIAGNOSTICS-01J · Solo si hay algo que ver.

                    Una participación a medias no tiene instantánea, y ofrecer
                    «Ver resultado» sobre ella sería un enlace que lleva a una
                    explicación de por qué no hay resultado. Cada fila apunta a
                    SU propia participación: si una empresa repitió, cada
                    intento conserva su enlace y el suyo.
                  */}
                  <td className="px-3 py-2">
                    {s.status === "completed" && s.maturityPercent !== null ? (
                      <Link
                        href={`/platform/public-diagnostics/${campaignId}/submissions/${s.id}/result`}
                        className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-xs font-medium hover:border-loop"
                      >
                        Ver resultado
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-soft">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {páginas > 1 ? (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 ? <Link href={enlace(page - 1)} className="underline underline-offset-4">Anterior</Link> : null}
          <span className="text-ink-soft">Página {page} de {páginas}</span>
          {page < páginas ? <Link href={enlace(page + 1)} className="underline underline-offset-4">Siguiente</Link> : null}
        </div>
      ) : null}
    </section>
  );
}
