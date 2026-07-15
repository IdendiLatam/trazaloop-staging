// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/require-session";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getTrazadocDocumentAction } from "@/server/actions/trazadocs";
import { getBlueprintSections } from "@/lib/db/trazadocs";
import { canDeleteDraftDocument } from "@/lib/domain/trazadocs";
import { DocumentStatusBadge } from "@/components/domain/trazadocs/document-status-badge";
import { DocumentStatusActions } from "@/components/domain/trazadocs/document-status-actions";
import { DocumentEditor } from "@/components/domain/trazadocs/document-editor";
import { DeleteDraftButton } from "@/components/domain/trazadocs/delete-draft-button";
import { InfoAlert } from "@/components/ui/alert";

export default async function TrazaDocEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const org = await requireActiveOrg();
  const { user } = await requireSession();
  const {
    data: doc,
    canEdit,
    canApprove,
    canMarkObsolete,
    canReactivate,
    canCreateDraftVersion,
  } = await getTrazadocDocumentAction(id);
  if (!doc) notFound();
  const canDeleteDraft = canDeleteDraftDocument(org.roleCode, doc.status, doc.createdBy, user.id);

  // Los hints viven en las secciones del blueprint, no en las del
  // documento (que solo guardan contenido vivo) — se resuelven aparte
  // solo si el documento viene de una estructura sugerida.
  const hints: Record<string, string | null> = {};
  if (doc.blueprintId) {
    const blueprintSections = await getBlueprintSections(doc.blueprintId);
    for (const s of blueprintSections) hints[s.id] = s.hint;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">
          <Link href={`/trazadocs/${doc.id}`} className="hover:underline">
            {doc.title}
          </Link>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Editar documento</h1>
          <DocumentStatusBadge status={doc.status} />
        </div>
        {canEdit ? (
          <p className="text-xs text-ink-soft">
            Usa el botón <span className="code">i</span> junto a cada sección para ver cómo
            diligenciarla.
          </p>
        ) : null}
      </header>

      {/* Sprint 9.2 (Parte 2): "no dejar al usuario en una pantalla donde
          parezca que no ocurrió nada" — mensaje claro justo después de
          crear, ya dentro de la propia edición. */}
      {created === "1" ? <InfoAlert message="Documento creado. Puedes empezar a diligenciarlo." /> : null}

      {/* Sprint 9.1 (Bloqueante 3): un documento aprobado u obsoleto no se
          edita directamente aquí — se muestran los botones de transición
          (crear versión en borrador / reactivar) en vez del editor
          habilitado. */}
      {!canEdit ? (
        <DocumentStatusActions
          documentId={doc.id}
          status={doc.status}
          canSubmitForReview={false}
          canApprove={canApprove}
          canMarkObsolete={canMarkObsolete}
          canReactivate={canReactivate}
          canCreateDraftVersion={canCreateDraftVersion}
          canSaveNewVersion={false}
        />
      ) : null}

      <DocumentEditor document={doc} hints={hints} readOnly={!canEdit} />

      {/* Sprint 9.2 (Parte 4): eliminar borrador — solo visible cuando
          aplica, con confirmación clara. */}
      {canDeleteDraft ? <DeleteDraftButton documentId={doc.id} redirectAfterDelete /> : null}
    </div>
  );
}
