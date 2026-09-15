export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignAction } from "@/server/actions/public-diagnostics-admin";
import {
  EditCampaignForm, CampaignLifecycleActions,
} from "@/components/domain/public-diagnostics/campaign-forms";
import {
  AVAILABILITY_LABEL, CAMPAIGN_STATUS_LABEL, campaignAvailability,
  evaluateCampaignReadiness, publicCampaignUrl,
} from "@/lib/domain/public-diagnostics";
import { resolveAppOrigin } from "@/lib/auth/invitation-link";

export const metadata = { title: "Campaña · Diagnósticos públicos" };

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" }) : "—";
/** `datetime-local` no acepta zona: se recorta a minutos. */
const paraInput = (iso: string | null) => (iso ? iso.slice(0, 16) : "");

export default async function CampaignDetailPage({
  params,
}: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const { campaign, versions, consentDocuments, canManage } =
    await getCampaignAction(campaignId);
  if (!campaign) notFound();

  const readiness = evaluateCampaignReadiness({
    name: campaign.name, slug: campaign.slug,
    diagnosticVersionId: campaign.diagnosticVersionId,
    diagnosticVersionStatus: campaign.diagnosticVersionStatus,
    consentDocumentId: campaign.consentDocumentId,
    consentContentHash: campaign.consentContentHash,
    opensAt: campaign.opensAt, closesAt: campaign.closesAt,
  });
  const disponibilidad = campaignAvailability(
    campaign.status, campaign.opensAt, campaign.closesAt, new Date());
  const urlFutura = publicCampaignUrl(await resolveAppOrigin(), campaign.slug);
  const congelado = campaign.startedCount > 0 || campaign.status !== "draft";
  const motivo = campaign.startedCount > 0
    ? "Esta campaña ya tiene participaciones: el instrumento, la dirección pública y el "
      + "documento de consentimiento quedaron fijos. Cambiarlos ahora dejaría dos "
      + "instrumentos dentro del mismo estudio."
    : campaign.status !== "draft"
      ? "La campaña ya no es un borrador: solo se pueden ajustar presentación y fechas."
      : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/platform/public-diagnostics" className="hover:underline">
            Diagnósticos públicos
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
        <p className="text-sm text-ink-soft">
          {CAMPAIGN_STATUS_LABEL[campaign.status]} · {AVAILABILITY_LABEL[disponibilidad]}
        </p>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Resumen</h2>
        <dl className="grid grid-cols-2 gap-2 pt-2 text-sm">
          <dt className="text-ink-soft">Entidad</dt>
          <dd>{campaign.partnerName ?? "—"}</dd>
          <dt className="text-ink-soft">Instrumento</dt>
          <dd>
            {campaign.diagnosticType.toUpperCase()}
            {campaign.diagnosticVersionNumber ? ` v${campaign.diagnosticVersionNumber}` : ""}
            {campaign.diagnosticVersionStatus
              && campaign.diagnosticVersionStatus !== "published"
              ? ` · ${campaign.diagnosticVersionStatus}` : ""}
          </dd>
          <dt className="text-ink-soft">Consentimiento</dt>
          <dd>
            {campaign.consentDocumentId
              ? `v${campaign.consentVersion ?? "—"}${campaign.consentContentHash ? " · con huella" : ""}`
              : "Sin documento"}
          </dd>
          <dt className="text-ink-soft">Abre</dt><dd>{fecha(campaign.opensAt)}</dd>
          <dt className="text-ink-soft">Cierra</dt><dd>{fecha(campaign.closesAt)}</dd>
          <dt className="text-ink-soft">Retomar</dt>
          <dd>{campaign.allowResume ? "Permitido" : "No"}</dd>
          <dt className="text-ink-soft">Repetir</dt>
          <dd>{campaign.allowRepeat ? "Permitido" : "No"}</dd>
          <dt className="text-ink-soft">Participantes</dt>
          <dd>{campaign.startedCount} iniciadas · {campaign.completedCount} completadas</dd>
        </dl>
        {/* PD-01D · La dirección se enseña, pero NO como enlace: la ruta
            pública todavía no existe y un enlace roto promete algo que no hay. */}
        <p className="pt-3 text-xs text-ink-soft">
          Dirección pública prevista:{" "}
          <code className="rounded bg-paper px-1 py-0.5">{urlFutura}</code>
          <span className="block pt-1">Todavía no está publicada.</span>
        </p>
      </section>

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">
          {readiness.ready ? "Lista para abrir" : "Qué falta para abrir"}
        </h2>
        {readiness.blockers.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 pt-2 text-sm text-ink">
            {readiness.blockers.map((b) => <li key={b}>{b}</li>)}
          </ul>
        ) : (
          <p className="pt-2 text-sm text-ink-soft">
            No falta nada: instrumento publicado, consentimiento y fechas coherentes.
          </p>
        )}
        {readiness.warnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 pt-3 text-sm text-ink-soft">
            {readiness.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        ) : null}
      </section>

      {canManage ? (
        <>
          <CampaignLifecycleActions
            campaignId={campaign.id} status={campaign.status}
            puedeAbrir={readiness.ready}
            motivoNoAbrir={readiness.ready ? null : "Resuelve lo de arriba para poder abrirla."}
          />
          {campaign.status !== "archived" ? (
            <EditCampaignForm
              campaignId={campaign.id} versions={versions} consentDocuments={consentDocuments}
              congelado={congelado} motivoCongelado={motivo}
              valores={{
                name: campaign.name, slug: campaign.slug,
                diagnostic_version_id: campaign.diagnosticVersionId,
                consent_document_id: campaign.consentDocumentId,
                partner_name: campaign.partnerName,
                public_title: campaign.publicTitle,
                public_subtitle: campaign.publicSubtitle,
                opens_at: paraInput(campaign.opensAt),
                closes_at: paraInput(campaign.closesAt),
                allow_resume: campaign.allowResume,
                allow_repeat: campaign.allowRepeat,
              }}
            />
          ) : null}
        </>
      ) : (
        <p className="text-sm text-ink-soft">
          Administrar campañas es de la superadministración de plataforma.
        </p>
      )}
    </div>
  );
}
