export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getHelpItemDetailAction } from "@/server/actions/help-admin";
import {
  HelpDraftForm, PublishHelpForm, UnpublishHelpForm, RestoreHelpRevisionForm,
} from "@/components/domain/help/help-admin-forms";
import { SectionHint } from "@/components/ui/section-hint";
import { PAGE_KEYS } from "@/lib/modules/page-keys";
import {
  helpToHint, helpSectionsToRender, HELP_TARGET_KIND_LABEL, HELP_STATUS_LABEL,
  HELP_STATUS_HINT, HELP_UNAVAILABLE_MESSAGE, HELP_NORMATIVE_LABEL,
} from "@/lib/domain/contextual-help";

export const metadata = { title: "Ayuda · Plataforma" };

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default async function PlatformHelpItemPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { detail, canManage, unavailable } = await getHelpItemDetailAction(id);

  if (unavailable) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="eyebrow">Plataforma</p>
        <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
          <h1 className="text-lg font-semibold text-ink">No se pudo abrir esta ayuda</h1>
          <p className="mt-1 text-sm text-ink-soft">{HELP_UNAVAILABLE_MESSAGE}</p>
        </div>
        <Link href="/platform/help" className="text-sm text-loop hover:underline">
          ← Volver a la lista
        </Link>
      </div>
    );
  }
  if (!detail) notFound();

  const { item, draft, current, history } = detail;
  const pantalla = PAGE_KEYS.find((p) => p.key === item.pageKey);
  const previa = draft ? helpToHint({
    title: draft.title, explanation: draft.explanation,
    example: draft.example, technicalReference: draft.technicalReference,
  }) : null;
  const partes = draft ? helpSectionsToRender({
    title: draft.title, explanation: draft.explanation,
    example: draft.example, technicalReference: draft.technicalReference,
  }) : [];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">
          <Link href="/platform/help" className="hover:text-loop hover:underline">
            Ayuda del producto
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex rounded-full border border-hairline bg-surface px-2 py-0.5 font-medium text-ink-soft">
            {HELP_STATUS_LABEL[item.status]}
          </span>
          {item.hasPendingDraft ? (
            <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 font-medium text-amber-700">
              Borrador con cambios sin publicar
            </span>
          ) : null}
          <span className="text-ink-soft">{HELP_STATUS_HINT[item.status]}</span>
        </div>
        <p className="text-xs text-ink-soft">
          {pantalla?.label ?? item.pageKey} ·{" "}
          {HELP_TARGET_KIND_LABEL[item.targetKind as keyof typeof HELP_TARGET_KIND_LABEL]}
          {item.targetKind !== "page" ? ` «${item.targetKey}»` : ""}
          {pantalla ? ` · hoy en ${pantalla.route}` : ""}
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="eyebrow">Publicado ahora</h2>
          {current ? (
            <div className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
              <p className="text-sm font-semibold text-ink">{current.title}</p>
              <p className="whitespace-pre-wrap text-sm text-ink">{current.explanation}</p>
              {current.example ? (
                <p className="whitespace-pre-wrap text-sm text-ink-soft">{current.example}</p>
              ) : null}
              {current.technicalReference ? (
                <p className="whitespace-pre-wrap text-sm text-ink-soft">
                  {current.technicalReference}
                </p>
              ) : null}
              <p className="pt-1 text-xs text-ink-soft">
                Versión {current.revisionNumber} · desde el {fecha(current.effectiveFrom)}
                {current.createdByName ? ` · ${current.createdByName}` : ""}
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-hairline bg-paper p-4 text-sm text-ink-soft">
              Todavía no se ha publicado. El botón «i» no aparece en esa pantalla.
            </p>
          )}
        </div>

        {/* La vista previa usa EL MISMO componente que el producto: si aquí se
            ve bien, allí también, porque es literalmente el mismo panel. */}
        <div className="space-y-2">
          <h2 className="eyebrow">Vista previa del borrador</h2>
          {draft ? (
            <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{draft.title}</span>
                <SectionHint hint={previa} />
                <span className="text-xs text-ink-soft">← pulsa la «i»</span>
              </div>
              <div className="space-y-2 rounded-md border border-dashed border-hairline bg-paper p-3">
                {partes.map((p) => (
                  <div key={p.label ?? "explicacion"}>
                    {p.label ? (
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                        {p.label}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-sm text-ink">{p.body}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-soft">
                Esto es el borrador. Todavía no lo ve nadie fuera de esta consola.
              </p>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-hairline bg-paper p-4 text-sm text-ink-soft">
              No hay borrador.
            </p>
          )}
        </div>
      </section>

      {canManage ? (
        <>
          <section className="space-y-3">
            <h2 className="eyebrow">Editar el borrador</h2>
            <div className="rounded-lg border border-hairline bg-surface p-5">
              <HelpDraftForm helpItemId={item.id} draft={draft} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="eyebrow">Publicar</h2>
            <div className="rounded-lg border border-hairline bg-surface p-5">
              <PublishHelpForm helpItemId={item.id} hasPendingDraft={item.hasPendingDraft} />
            </div>
          </section>

          {item.status === "published" ? (
            <section className="space-y-3">
              <h2 className="eyebrow">Retirar</h2>
              <div className="rounded-lg border border-hairline bg-surface p-5">
                <UnpublishHelpForm helpItemId={item.id} />
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-ink-soft">
          Tu cuenta puede consultar esta ayuda y su historia, no modificarla.
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
                    Versión {r.revisionNumber}{r.effectiveTo === null ? " · vigente" : ""}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {fecha(r.effectiveFrom)} → {r.effectiveTo ? fecha(r.effectiveTo) : "hoy"}
                  </p>
                </div>
                <p className="mt-1 text-sm text-ink-soft">{r.title}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  {HELP_NORMATIVE_LABEL[r.normativeClass as keyof typeof HELP_NORMATIVE_LABEL]}
                  {r.createdByName ? ` · ${r.createdByName}` : ""}
                  {r.changeNote ? ` · «${r.changeNote}»` : ""}
                </p>
                {canManage && r.effectiveTo !== null ? (
                  <p className="mt-2">
                    <RestoreHelpRevisionForm helpItemId={item.id} revisionId={r.id}
                      revisionNumber={r.revisionNumber} />
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink-soft">
          Una versión publicada no se edita ni se borra. Recuperar una antigua la
          copia al borrador y se publica como versión nueva.
        </p>
      </section>
    </div>
  );
}
