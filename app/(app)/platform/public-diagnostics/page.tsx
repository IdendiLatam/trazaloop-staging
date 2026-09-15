export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  listCampaignsAction, listCampaignFormOptionsAction,
} from "@/server/actions/public-diagnostics-admin";
import { CreateCampaignForm } from "@/components/domain/public-diagnostics/campaign-forms";
import {
  AVAILABILITY_LABEL, CAMPAIGN_STATUS_LABEL, campaignAvailability,
} from "@/lib/domain/public-diagnostics";

export const metadata = { title: "Diagnósticos públicos · Plataforma" };

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default async function PublicDiagnosticsPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [{ campaigns, canManage, unavailable }, opciones] = await Promise.all([
    listCampaignsAction({ status: sp.status ?? null, search: sp.q ?? null }),
    listCampaignFormOptionsAction(),
  ]);
  const ahora = new Date();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Plataforma</p>
        <h1 className="text-2xl font-semibold tracking-tight">Diagnósticos públicos</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Convocatorias para que empresas hagan un diagnóstico sin cuenta de Trazaloop.
          Cada campaña queda fijada a una versión del instrumento: lo que se responda
          hoy seguirá significando lo mismo dentro de un año.
        </p>
      </header>

      {unavailable ? (
        <div role="status" className="rounded-lg border border-amber/40 bg-amber/10 p-4">
          <p className="text-sm font-medium text-ink">No se pudieron consultar las campañas</p>
          <p className="mt-1 text-sm text-ink-soft">Es un problema temporal. Vuelve a intentarlo.</p>
        </div>
      ) : null}

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="block text-sm font-medium" htmlFor="q">Buscar</label>
          <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Nombre o entidad"
                 className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="status">Estado</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""}
                  className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm">
            <option value="">Todas</option>
            {(["draft", "open", "closed", "archived"] as const).map((s) => (
              <option key={s} value={s}>{CAMPAIGN_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <button type="submit"
                className="rounded-md border border-hairline px-3 py-2 text-sm hover:border-loop">
          Filtrar
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Campañas</h2>
        {campaigns.length === 0 ? (
          <p className="text-sm text-ink-soft">
            {unavailable ? "—" : "Todavía no hay ninguna campaña."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-hairline text-xs uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="py-2 pr-3">Campaña</th>
                  <th className="py-2 pr-3">Entidad</th>
                  <th className="py-2 pr-3">Instrumento</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3">Ventana</th>
                  <th className="py-2 pr-3">Iniciadas</th>
                  <th className="py-2 pr-3">Completadas</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-hairline/60">
                    <td className="py-2 pr-3">
                      <Link href={`/platform/public-diagnostics/${c.id}`}
                            className="font-medium text-loop hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-xs text-ink-soft">/{c.slug}</span>
                    </td>
                    <td className="py-2 pr-3">{c.partnerName ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {c.diagnosticType.toUpperCase()}
                      {c.diagnosticVersionNumber ? ` v${c.diagnosticVersionNumber}` : ""}
                    </td>
                    <td className="py-2 pr-3">
                      {CAMPAIGN_STATUS_LABEL[c.status]}
                      <span className="block text-xs text-ink-soft">
                        {AVAILABILITY_LABEL[campaignAvailability(c.status, c.opensAt, c.closesAt, ahora)]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-ink-soft">
                      {fecha(c.opensAt)} → {fecha(c.closesAt)}
                    </td>
                    <td className="py-2 pr-3">{c.startedCount}</td>
                    <td className="py-2 pr-3">{c.completedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage ? (
        <CreateCampaignForm versions={opciones.versions}
                            consentDocuments={opciones.consentDocuments} />
      ) : (
        <p className="text-sm text-ink-soft">
          Crear y administrar campañas es de la superadministración de plataforma.
        </p>
      )}
    </div>
  );
}
