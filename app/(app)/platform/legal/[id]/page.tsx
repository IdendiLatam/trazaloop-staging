export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getLegalDocumentAction, listLegalDocumentsAction }
  from "@/server/actions/legal-admin";
import { LegalContent } from "@/components/legal/legal-content";
import { LEGAL_UNAVAILABLE_MESSAGE } from "@/lib/domain/legal";
import {
  EditLegalDraftForm, PublishLegalForm, DiscardLegalDraftForm,
  CreateLegalVersionForm,
} from "@/components/domain/legal-admin/legal-admin-forms";
import { LEGAL_DOCUMENT_TYPE_LABEL } from "@/lib/domain/legal";

export const metadata = { title: "Versión legal · Plataforma" };

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default async function PlatformLegalDocumentPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [{ document, canManage, unavailable }, lista] = await Promise.all([
    getLegalDocumentAction(id),
    listLegalDocumentsAction(),
  ]);

  if (unavailable) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="eyebrow">Plataforma</p>
        <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
          <h1 className="text-lg font-semibold text-ink">No se pudo abrir esta versión</h1>
          <p className="mt-1 text-sm text-ink-soft">{LEGAL_UNAVAILABLE_MESSAGE}</p>
        </div>
        <Link href="/platform/legal" className="text-sm text-loop hover:underline">
          ← Volver a los documentos legales
        </Link>
      </div>
    );
  }
  if (!document) notFound();

  const etiqueta = LEGAL_DOCUMENT_TYPE_LABEL[document.documentType];
  const vigente = lista.documents.find(
    (d) => d.documentType === document.documentType && d.status === "active") ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">
          <Link href="/platform/legal" className="hover:text-loop hover:underline">
            Documentos legales
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {etiqueta} · versión {document.version}
        </h1>
        <p className="text-sm text-ink-soft">
          {document.status === "active"
            ? `Vigente desde el ${fecha(document.publishedAt)}. Esta es la redacción que se acepta hoy.`
            : document.status === "archived"
              ? `Estuvo vigente del ${fecha(document.publishedAt)} al ${fecha(document.retiredAt)}. Se conserva porque hay personas que aceptaron ESTE texto.`
              : "Es un borrador: no está vigente, no se puede aceptar y no lo ve nadie fuera de esta consola."}
        </p>
        <p className="text-xs text-ink-soft">
          {document.acceptances} aceptación(es)
          {document.createdByName ? ` · redactada por ${document.createdByName}` : ""}
          {document.publishedByName ? ` · publicada por ${document.publishedByName}` : ""}
          {document.changeNote ? ` · «${document.changeNote}»` : ""}
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="eyebrow">Texto</h2>
        <div className="rounded-lg border border-hairline bg-surface p-5">
          <h3 className="text-base font-semibold text-ink">{document.title}</h3>
          {/* PE-02B6.2 · El mismo componente que ve el cliente. Si la consola
              pintara el texto de otra forma, se aprobaría una cosa y se
              publicaría otra. */}
          <div className="mt-3">
            <LegalContent content={document.content} />
          </div>
        </div>
      </section>

      {document.status !== "draft" ? (
        <p className="rounded-lg border border-hairline bg-paper p-4 text-sm text-ink-soft">
          Esta versión ya se publicó, así que su texto{" "}
          <strong className="font-medium text-ink">no se puede modificar</strong>.
          Para cambiar lo que dice, se publica una versión nueva — y a quien la
          había aceptado se le vuelve a pedir.
        </p>
      ) : null}

      {canManage && document.status === "draft" ? (
        <>
          <section className="space-y-3">
            <h2 className="eyebrow">Editar el borrador</h2>
            <div className="rounded-lg border border-hairline bg-surface p-5">
              <EditLegalDraftForm document={document} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="eyebrow">Publicar</h2>
            <div className="rounded-lg border border-hairline bg-surface p-5">
              <PublishLegalForm documentId={document.id} documentTypeLabel={etiqueta}
                currentVersion={vigente?.version ?? null} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="eyebrow">Descartar</h2>
            <div className="rounded-lg border border-hairline bg-surface p-5">
              <DiscardLegalDraftForm documentId={document.id} />
            </div>
          </section>
        </>
      ) : null}

      {canManage && document.status === "active" ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Publicar una versión nueva</h2>
          <div className="rounded-lg border border-hairline bg-surface p-5">
            <CreateLegalVersionForm defaultType={document.documentType}
              previousContent={document.content} />
          </div>
          <p className="text-xs text-ink-soft">
            El texto de la versión vigente viene copiado para partir de él. Editarlo
            aquí no toca la versión que está publicada.
          </p>
        </section>
      ) : null}
    </div>
  );
}
