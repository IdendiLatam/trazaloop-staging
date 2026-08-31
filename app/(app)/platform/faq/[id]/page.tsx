export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getFaqEntryDetailAction, listFaqCategoriesAction }
  from "@/server/actions/faq-admin";
import {
  FaqDraftForm, FaqEntryMetaForm, PublishFaqForm, UnpublishFaqForm,
  RestoreFaqRevisionForm,
} from "@/components/domain/faq/faq-admin-forms";
import { FaqPreview, FaqGovernancePanel } from "@/components/domain/faq/faq-preview";
import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";
import {
  FAQ_STATUS_LABEL, FAQ_STATUS_HINT, FAQ_VERIFICATION_LABEL,
  faqPublishBlockReason, isSecurityCategory, FAQ_UNAVAILABLE_MESSAGE,
  type FaqVerification,
} from "@/lib/domain/faq-admin";

export const metadata = { title: "Pregunta · Plataforma" };

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default async function PlatformFaqEntryPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [{ detail, canManage, unavailable }, cats] = await Promise.all([
    getFaqEntryDetailAction(id),
    listFaqCategoriesAction(),
  ]);

  // Una avería NO es un «no existe». Se distinguen porque significan cosas
  // distintas y porque la segunda hace cerrar la pestaña (§29).
  if (unavailable) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="eyebrow">Plataforma</p>
        <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
          <h1 className="text-lg font-semibold text-ink">No se pudo abrir esta pregunta</h1>
          <p className="mt-1 text-sm text-ink-soft">{FAQ_UNAVAILABLE_MESSAGE}</p>
        </div>
        <Link href="/platform/faq" className="text-sm text-loop hover:underline">
          ← Volver a la lista
        </Link>
      </div>
    );
  }
  if (!detail) notFound();

  const { entry, draft, current, history } = detail;
  const bloqueo = faqPublishBlockReason(draft ? {
    verificationStatus: draft.verificationStatus as FaqVerification,
    verificationNote: draft.verificationNote,
    externalSourceUrl: draft.externalSourceUrl,
    externalSourceCheckedOn: draft.externalSourceCheckedOn,
  } : null);
  const nombresDeModulo = entry.moduleKeys
    .map((k) => COMMERCIAL_MODULES.find((m) => m.key === k)?.name ?? k);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">
          <Link href="/platform/faq" className="hover:text-loop hover:underline">
            Preguntas frecuentes
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{entry.question}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex rounded-full border border-hairline bg-surface px-2 py-0.5 font-medium text-ink-soft">
            {FAQ_STATUS_LABEL[entry.status]}
          </span>
          {entry.hasPendingDraft ? (
            <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 font-medium text-amber-700">
              Borrador con cambios sin publicar
            </span>
          ) : null}
          <span className="text-ink-soft">{FAQ_STATUS_HINT[entry.status]}</span>
        </div>
        <p className="text-xs text-ink-soft">
          Identificador: <code className="rounded bg-paper px-1">{entry.slug}</code>
          {current ? ` · publicada el ${fecha(current.effectiveFrom)}` : ""}
        </p>
      </header>

      {/* Lo publicado y el borrador, uno al lado del otro: es la pregunta que
          se hace quien edita —«¿esto ya se ve?»— y merece respuesta a la vista. */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="eyebrow">Publicado ahora</h2>
          {current ? (
            <div className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
              <p className="text-sm font-semibold text-ink">{current.question}</p>
              <p className="whitespace-pre-wrap text-sm text-ink">{current.answerShort}</p>
              {current.answerLong ? (
                <p className="whitespace-pre-wrap text-sm text-ink-soft">{current.answerLong}</p>
              ) : null}
              <p className="pt-1 text-xs text-ink-soft">
                Versión {current.revisionNumber} · desde el {fecha(current.effectiveFrom)}
                {current.createdByName ? ` · ${current.createdByName}` : ""}
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-hairline bg-paper p-4 text-sm text-ink-soft">
              Todavía no se ha publicado nada. Nadie de fuera ve esta pregunta.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="eyebrow">Vista previa del borrador</h2>
          {draft ? (
            <FaqPreview view={{
              question: draft.question, answerShort: draft.answerShort,
              answerLong: draft.answerLong, categoryLabel: entry.categoryLabel,
              visibility: entry.visibility, isFeatured: entry.isFeatured,
              moduleNames: nombresDeModulo,
            }} />
          ) : (
            <p className="rounded-lg border border-dashed border-hairline bg-paper p-4 text-sm text-ink-soft">
              No hay borrador.
            </p>
          )}
        </div>
      </section>

      {draft ? (
        <FaqGovernancePanel
          verificationStatus={draft.verificationStatus as FaqVerification}
          sourceBasis={draft.sourceBasis}
          verificationNote={draft.verificationNote}
          externalSourceUrl={draft.externalSourceUrl}
          externalSourceCheckedOn={draft.externalSourceCheckedOn}
          blockReason={bloqueo} />
      ) : null}

      {canManage ? (
        <>
          <section className="space-y-3">
            <h2 className="eyebrow">Editar el borrador</h2>
            <div className="rounded-lg border border-hairline bg-surface p-5">
              <FaqDraftForm entryId={entry.id} draft={draft}
                isSecurity={isSecurityCategory(entry.categoryCode)} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="eyebrow">Publicar</h2>
            <div className="rounded-lg border border-hairline bg-surface p-5">
              <PublishFaqForm entryId={entry.id} blockReason={bloqueo}
                hasPendingDraft={entry.hasPendingDraft} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="eyebrow">Cómo se presenta</h2>
            <div className="rounded-lg border border-hairline bg-surface p-5">
              <FaqEntryMetaForm entry={entry} categories={cats.categories}
                modules={COMMERCIAL_MODULES.map((m) => ({ key: m.key, name: m.name }))} />
            </div>
          </section>

          {entry.status === "published" ? (
            <section className="space-y-3">
              <h2 className="eyebrow">Retirar</h2>
              <div className="rounded-lg border border-hairline bg-surface p-5">
                <UnpublishFaqForm entryId={entry.id} />
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-ink-soft">
          Tu cuenta puede consultar este contenido y su historia, no modificarlo.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="eyebrow">Historia</h2>
        {history.length === 0 && !current ? (
          <p className="text-sm text-ink-soft">Todavía no hay ninguna versión publicada.</p>
        ) : (
          <ul className="space-y-2">
            {[...(current ? [current] : []), ...history].map((r) => (
              <li key={r.id} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink">
                    Versión {r.revisionNumber}
                    {r.effectiveTo === null ? " · vigente" : ""}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {fecha(r.effectiveFrom)} → {r.effectiveTo ? fecha(r.effectiveTo) : "hoy"}
                  </p>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{r.question}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {FAQ_VERIFICATION_LABEL[r.verificationStatus]}
                  {r.createdByName ? ` · ${r.createdByName}` : ""}
                  {r.changeNote ? ` · «${r.changeNote}»` : ""}
                </p>
                {r.sourceBasis ? (
                  <p className="mt-1 text-xs text-ink-soft">Se apoya en: {r.sourceBasis}</p>
                ) : null}
                {canManage && r.effectiveTo !== null ? (
                  <p className="mt-2">
                    <RestoreFaqRevisionForm entryId={entry.id} revisionId={r.id}
                      revisionNumber={r.revisionNumber} />
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-soft">
          Una versión publicada no se edita ni se borra. Recuperar una antigua la
          copia al borrador y se publica como versión nueva: así queda escrito lo
          que decía, lo que dijo después y que se volvió a lo primero.
        </p>
      </section>
    </div>
  );
}
