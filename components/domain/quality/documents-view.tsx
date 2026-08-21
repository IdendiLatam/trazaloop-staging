"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { DocumentStatusBadge } from "@/components/domain/trazadocs/document-status-badge";
import {
  QUALITY_DOCUMENT_CATEGORIES,
  qualityDocumentCategoryLabel,
} from "@/lib/domain/quality-documents";
import { shellModuleName, trazadocDocumentHref } from "@/lib/modules/registry";
import {
  createQualityDocumentAction,
  type QualityDocumentActionState,
} from "@/server/actions/quality-documents";

/**
 * Trazaloop Quality · QUALITY-01.1 · Documentos de Quality.
 *
 * Dos listas, deliberadamente separadas:
 *
 *  · «Documentos de Quality» — nacieron aquí. Se editan aquí.
 *  · «Documentos vinculados» — nacieron en otro módulo y Quality los
 *    referencia desde un proceso. Se muestran con su origen para que nadie
 *    los confunda con propios: editarlos afecta también a ese módulo, y se
 *    hace desde allí.
 */

type OwnDocument = {
  id: string;
  title: string;
  code: string | null;
  status: string;
  updatedAt: string;
  currentVersion: number;
  sectionsCount: number;
  filledSectionsCount: number;
  processNames: string[];
};

type LinkedDocument = {
  documentId: string;
  title: string;
  code: string | null;
  status: string;
  moduleKey: string;
  processes: { id: string; name: string; relationType: string }[];
};

const initial: QualityDocumentActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

export function QualityDocumentsView({
  own,
  linked,
  hasProcesses,
  canCreate,
}: {
  own: OwnDocument[];
  linked: LinkedDocument[];
  hasProcesses: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [state, formAction, pending] = useActionState(createQualityDocumentAction, initial);

  // Tras crear, se abre el documento: lo natural es empezar a escribirlo.
  //
  // En un EFECTO, no durante el render. Navegar mientras React está pintando
  // actualiza el Router desde dentro de otro componente, que en React 19 es un
  // error y no un aviso: el segundo defecto de esta pantalla, latente detrás
  // del primero.
  useEffect(() => {
    if (state.success && state.documentId) {
      router.push(`/quality/documents/${state.documentId}`);
    }
  }, [state.success, state.documentId, router]);

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
        <p className="text-sm text-ink-soft">
          El espacio documental de Quality. Usa el mismo motor que TrazaDocs —estados,
          versiones y aprobaciones son los de siempre— pero vive dentro de Quality y no
          requiere ningún otro módulo.
        </p>
      </header>

      <ErrorAlert message={state.error} />

      {canCreate ? (
        creating ? (
          <form action={formAction} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
            <h2 className="text-sm font-semibold">Nuevo documento de Quality</h2>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Título</span>
              <input name="title" required maxLength={200} className={inputClass}
                     placeholder="Ej.: Procedimiento de auditoría interna" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Código (opcional)</span>
                <input name="code" maxLength={40} className={inputClass} placeholder="PR-CAL-01" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Tipo</span>
                <select name="category_code" defaultValue="procedure" className={inputClass}>
                  {QUALITY_DOCUMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {qualityDocumentCategoryLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Descripción (opcional)</span>
              <textarea name="description" rows={2} className={inputClass}
                        placeholder="De qué trata, en una línea." />
            </label>
            <p className="text-xs text-ink-soft">
              El documento nace en borrador con cinco secciones de partida (objetivo, alcance,
              responsabilidades, desarrollo y registros). Podrás cambiarlas al escribirlo.
            </p>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Creando…" : "Crear documento"}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setCreating(false)} disabled={pending}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button onClick={() => setCreating(true)} className="sm:w-auto">
            Crear documento
          </Button>
        )
      ) : (
        <InfoAlert message="Puedes consultar los documentos. Crearlos corresponde a la administración, al área de calidad o a un consultor." />
      )}

      {/* ------------------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Documentos de Quality</h2>
        {own.length === 0 ? (
          <EmptyState
            title="Todavía no hay documentos de Quality"
            description="Crea aquí la documentación de tu sistema de gestión: procedimientos, políticas, instructivos. No necesitas ningún otro módulo."
          />
        ) : (
          <ul className="space-y-2">
            {own.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/quality/documents/${d.id}`}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-hairline bg-surface p-4 transition-colors hover:border-loop"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {d.title}
                      {d.code ? <span className="ml-2 text-xs text-ink-soft">{d.code}</span> : null}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {d.filledSectionsCount} de {d.sectionsCount} secciones diligenciadas · versión v
                      {d.currentVersion}
                    </p>
                    {d.processNames.length > 0 ? (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        Asociado a: {d.processNames.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <DocumentStatusBadge status={d.status as never} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------------- */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Documentos vinculados</h2>
        <p className="text-xs text-ink-soft">
          Documentos que nacieron en otro módulo y que tus procesos de Quality referencian. No se
          copian: se apunta a ellos, de modo que solo existe una versión y se edita desde su
          módulo de origen.
        </p>
        {linked.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hairline bg-surface px-4 py-6 text-center text-sm text-ink-soft">
            {hasProcesses
              ? "Ningún documento de otro módulo está vinculado todavía. Puedes vincular uno desde el detalle de un proceso."
              : "Cuando tengas procesos, podrás vincularles documentos que ya existan en la empresa."}
          </p>
        ) : (
          <ul className="space-y-2">
            {linked.map((d) => {
              // El documento se abre en SU módulo, no en el de PCR: la ruta la
              // declara el registro de módulos (QUALITY-01.2).
              const documentHref = trazadocDocumentHref(d.moduleKey, d.documentId);
              return (
                <li
                  key={d.documentId}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-hairline bg-paper p-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {d.title}
                      {d.code ? <span className="ml-2 text-xs text-ink-soft">{d.code}</span> : null}
                    </p>
                    <p className="text-xs text-ink-soft">
                      Origen: {shellModuleName(d.moduleKey)} · usado por{" "}
                      {d.processes.map((p) => p.name).join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <DocumentStatusBadge status={d.status as never} />
                    {documentHref ? (
                      <Link
                        href={documentHref}
                        className="text-xs font-medium text-loop hover:underline"
                      >
                        Abrir documento →
                      </Link>
                    ) : null}
                    {d.processes[0] ? (
                      <Link
                        href={`/quality/processes/${d.processes[0].id}`}
                        className="text-xs font-medium text-loop hover:underline"
                      >
                        Ver proceso →
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
