"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/ui/alert";
import {
  QUALITY_DOCUMENT_RELATIONS,
  QUALITY_DOCUMENT_RELATION_LABEL,
  QUALITY_IO_KINDS,
  QUALITY_IO_KIND_LABEL,
  QUALITY_PROCESS_STATUS_LABEL,
  QUALITY_REVISION_STATUS_LABEL,
  canEditRevision,
  qualityCategoryLabel,
  splitInteractions,
  type QualityDocumentRelation,
  type QualityIoKind,
  type QualityProcessStatus,
  type QualityRevisionStatus,
} from "@/lib/domain/quality-processes";
import {
  addQualityProcessIo,
  deleteQualityInteraction,
  deleteQualityProcessIo,
  linkTrazadocToQualityProcess,
  openQualityProcessRevision,
  publishQualityProcessRevision,
  relateQualityProcesses,
  setQualityProcessRetired,
  unlinkTrazadocFromQualityProcess,
  updateQualityProcess,
  updateQualityRevisionContent,
} from "@/server/actions/quality-processes";

/**
 * Trazaloop Quality · QUALITY-01 · Detalle del proceso.
 *
 * La pantalla se organiza alrededor de una idea: solo el BORRADOR se edita.
 * Cuando se muestra una revisión publicada, los formularios desaparecen y en
 * su lugar aparece la explicación de por qué y qué hacer (abrir una revisión
 * nueva). Esto no es la barrera —los triggers de 0112 lo son— pero evita
 * ofrecer acciones que la base va a rechazar.
 */

type RevisionView = {
  id: string;
  revisionNumber: number;
  status: string;
  purpose: string | null;
  scope: string | null;
  changeNote: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
};

type IoView = {
  id: string;
  direction: string;
  name: string;
  description: string | null;
  ioKind: string;
  sortOrder: number;
};

type InteractionView = {
  id: string;
  sourceProcessId: string;
  sourceProcessName: string;
  targetProcessId: string;
  targetProcessName: string;
  informationItem: string | null;
  description: string | null;
};

type DocumentView = {
  id: string;
  documentId: string;
  documentTitle: string;
  documentCode: string | null;
  documentStatus: string;
  relationType: string;
};

type Detail = {
  process: {
    id: string;
    code: string | null;
    name: string;
    categoryCode: string;
    status: string;
    currentRevision: number;
    ownerPositionId: string | null;
    ownerPositionName: string | null;
  };
  revisions: RevisionView[];
  currentRevision: RevisionView | null;
  draftRevision: RevisionView | null;
  io: IoView[];
  interactions: InteractionView[];
  documents: DocumentView[];
};

const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

/** Módulo de origen de un documento vinculable, para que quede claro que
 *  asociarlo no lo mueve a Quality: sigue viviendo donde nació. */
const MODULE_ORIGIN_LABEL: Record<string, string> = {
  cpr: "PCR",
  textiles: "Textiles",
  quality: "Quality",
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-ink-soft">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function QualityProcessDetailView({
  detail,
  shownRevisionId,
  positions,
  categories,
  otherProcesses,
  availableDocuments,
  canPublish,
}: {
  detail: Detail;
  shownRevisionId: string | null;
  positions: { id: string; name: string }[];
  categories: { code: string; name: string }[];
  otherProcesses: { id: string; name: string }[];
  /** Documentos vinculables: de CUALQUIER módulo de la misma empresa. */
  availableDocuments: { id: string; title: string; code: string | null; status: string; moduleKey: string }[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [addingIo, setAddingIo] = useState<"input" | "output" | null>(null);
  const [relating, setRelating] = useState(false);
  const [linkingDoc, setLinkingDoc] = useState(false);

  const { process, revisions, currentRevision, draftRevision, io, interactions, documents } = detail;
  const shown = revisions.find((r) => r.id === shownRevisionId) ?? null;
  const editable = shown !== null && canEditRevision(shown.status);
  const viewingHistory = shown !== null && shown.id !== draftRevision?.id && shown.id !== currentRevision?.id;

  const inputs = io.filter((i) => i.direction === "input");
  const outputs = io.filter((i) => i.direction === "output");
  const { outgoing, incoming } = splitInteractions(process.id, interactions);

  function run(fn: () => Promise<{ error: string | null }>, okMessage?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditingIdentity(false);
      setAddingIo(null);
      setRelating(false);
      setLinkingDoc(false);
      if (okMessage) setNotice(okMessage);
      router.refresh();
    });
  }

  return (
    <div className="max-w-4xl space-y-5">
      <header className="space-y-2">
        <Link href="/quality/processes" className="text-xs text-loop hover:underline">
          ← Volver a procesos
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{process.name}</h1>
            <p className="text-sm text-ink-soft">
              {process.code ? `${process.code} · ` : ""}
              {qualityCategoryLabel(process.categoryCode)}
              {" · "}
              {process.ownerPositionName
                ? `Propietario: ${process.ownerPositionName}`
                : "Sin cargo propietario"}
            </p>
          </div>
          <span className="inline-flex shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[11px]">
            {QUALITY_PROCESS_STATUS_LABEL[process.status as QualityProcessStatus] ?? process.status}
          </span>
        </div>
      </header>

      <ErrorAlert message={error} />
      <SuccessAlert message={notice} />

      {/* --------------------------------------------------------------- */}
      {/* Estado de la versión que se está viendo                          */}
      {/* --------------------------------------------------------------- */}
      {shown === null ? (
        <InfoAlert message="Este proceso todavía no tiene contenido. Abre una revisión para describir su propósito, alcance, entradas y salidas." />
      ) : viewingHistory ? (
        <InfoAlert
          message={`Estás viendo la revisión ${shown.revisionNumber}, que rigió del ${shown.effectiveFrom ?? "—"} al ${shown.effectiveTo ?? "—"}. Se muestra tal como se publicó.`}
        />
      ) : editable ? (
        <InfoAlert message={`Estás editando el borrador (revisión ${shown.revisionNumber}). Nada de lo que cambies aquí afecta a la versión publicada hasta que lo publiques.`} />
      ) : (
        <InfoAlert
          message={`Versión oficial: revisión ${shown.revisionNumber}, vigente desde ${shown.effectiveFrom ?? "—"}. No es editable. Para cambiarla, abre una revisión nueva.`}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {draftRevision === null ? (
          <Button
            className="w-auto px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => run(() => openQualityProcessRevision(process.id), "Borrador abierto.")}
          >
            Abrir nueva revisión
          </Button>
        ) : shown?.id !== draftRevision.id ? (
          <Link
            href={`/quality/processes/${process.id}?revision=${draftRevision.id}`}
            className="inline-flex items-center rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold hover:border-loop"
          >
            Ir al borrador (revisión {draftRevision.revisionNumber})
          </Link>
        ) : null}

        {currentRevision && shown?.id !== currentRevision.id ? (
          <Link
            href={`/quality/processes/${process.id}?revision=${currentRevision.id}`}
            className="inline-flex items-center rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold hover:border-loop"
          >
            Ver versión oficial (revisión {currentRevision.revisionNumber})
          </Link>
        ) : null}

        {editable && canPublish ? (
          <Button
            className="w-auto px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() =>
              run(() => publishQualityProcessRevision(shown!.id), "Revisión publicada.")
            }
          >
            Publicar esta revisión
          </Button>
        ) : null}
        {editable && !canPublish ? (
          <span className="inline-flex items-center text-xs text-ink-soft">
            Publicar corresponde a la administración o al área de calidad.
          </span>
        ) : null}
      </div>

      {/* --------------------------------------------------------------- */}
      {/* Identidad                                                        */}
      {/* --------------------------------------------------------------- */}
      <Section
        title="Identidad del proceso"
        hint="El nombre, el código, la categoría y el cargo propietario pertenecen al proceso, no a una revisión: cambiarlos no requiere publicar."
      >
        {editingIdentity ? (
          <form
            action={(form) =>
              run(() =>
                updateQualityProcess(process.id, {
                  name: String(form.get("name") ?? ""),
                  code: String(form.get("code") ?? ""),
                  categoryCode: String(form.get("categoryCode") ?? ""),
                  ownerPositionId: String(form.get("ownerPositionId") ?? ""),
                })
              )
            }
            className="space-y-3"
          >
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Nombre</span>
              <input name="name" required defaultValue={process.name} maxLength={160} className={inputClass} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Código</span>
                <input name="code" defaultValue={process.code ?? ""} maxLength={40} className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Categoría</span>
                <select name="categoryCode" defaultValue={process.categoryCode} className={inputClass}>
                  {categories.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Cargo propietario</span>
                <select
                  name="ownerPositionId"
                  defaultValue={process.ownerPositionId ?? ""}
                  className={inputClass}
                >
                  <option value="">Sin asignar</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="w-auto px-3 py-1 text-xs">
                Guardar
              </Button>
              <Button type="button" variant="quiet" className="w-auto px-3 py-1 text-xs"
                      onClick={() => setEditingIdentity(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" className="w-auto px-3 py-1 text-xs" onClick={() => setEditingIdentity(true)}>
              Editar identidad
            </Button>
            {canPublish ? (
              <Button
                variant="quiet"
                className="w-auto px-3 py-1 text-xs"
                disabled={pending}
                onClick={() =>
                  run(
                    () => setQualityProcessRetired(process.id, process.status !== "retired"),
                    process.status === "retired" ? "Proceso devuelto al servicio." : "Proceso retirado."
                  )
                }
              >
                {process.status === "retired" ? "Devolver al servicio" : "Retirar proceso"}
              </Button>
            ) : null}
          </div>
        )}
        {process.status === "retired" ? (
          <p className="text-xs text-ink-soft">
            Este proceso está retirado. Sus revisiones publicadas se conservan: siguen siendo la
            respuesta a qué regía en una fecha pasada.
          </p>
        ) : null}
      </Section>

      {/* --------------------------------------------------------------- */}
      {/* Propósito y alcance                                              */}
      {/* --------------------------------------------------------------- */}
      <Section title="Propósito y alcance">
        {shown === null ? (
          <p className="text-xs text-ink-soft">Abre una revisión para escribirlos.</p>
        ) : editable ? (
          <form
            action={(form) =>
              run(() =>
                updateQualityRevisionContent(shown.id, {
                  purpose: String(form.get("purpose") ?? ""),
                  scope: String(form.get("scope") ?? ""),
                  changeNote: String(form.get("changeNote") ?? ""),
                })
              )
            }
            className="space-y-3"
          >
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Propósito</span>
              <textarea name="purpose" rows={3} defaultValue={shown.purpose ?? ""} className={inputClass}
                        placeholder="Para qué existe este proceso." />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Alcance</span>
              <textarea name="scope" rows={3} defaultValue={shown.scope ?? ""} className={inputClass}
                        placeholder="Qué abarca y qué queda fuera." />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Motivo del cambio (opcional)</span>
              <input name="changeNote" defaultValue={shown.changeNote ?? ""} maxLength={400} className={inputClass} />
            </label>
            <Button type="submit" disabled={pending} className="w-auto px-3 py-1 text-xs">
              Guardar borrador
            </Button>
          </form>
        ) : (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-ink-soft">Propósito</dt>
              <dd className="whitespace-pre-line">{shown.purpose ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-ink-soft">Alcance</dt>
              <dd className="whitespace-pre-line">{shown.scope ?? "—"}</dd>
            </div>
          </dl>
        )}
      </Section>

      {/* --------------------------------------------------------------- */}
      {/* Entradas y salidas                                               */}
      {/* --------------------------------------------------------------- */}
      <Section
        title="Entradas y salidas"
        hint="Pertenecen a la revisión: una versión publicada conserva exactamente las que tenía el día en que se publicó."
      >
        {shown === null ? (
          <p className="text-xs text-ink-soft">Abre una revisión para registrarlas.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["input", "Entradas", inputs],
              ["output", "Salidas", outputs],
            ] as const).map(([direction, label, items]) => (
              <div key={direction} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</h3>
                {items.length === 0 ? (
                  <p className="text-xs text-ink-soft">Sin registrar.</p>
                ) : (
                  <ul className="space-y-1">
                    {items.map((i) => (
                      <li key={i.id} className="flex items-start justify-between gap-2 rounded-md border border-hairline bg-paper px-2 py-1.5">
                        <span className="min-w-0 text-xs">
                          <span className="font-medium">{i.name}</span>
                          <span className="text-ink-soft">
                            {" "}· {QUALITY_IO_KIND_LABEL[i.ioKind as QualityIoKind] ?? i.ioKind}
                          </span>
                          {i.description ? (
                            <span className="block text-ink-soft">{i.description}</span>
                          ) : null}
                        </span>
                        {editable ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => deleteQualityProcessIo(i.id, process.id))}
                            className="shrink-0 text-[11px] text-ink-soft hover:text-ink"
                          >
                            Quitar
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                {editable ? (
                  addingIo === direction ? (
                    <form
                      action={(form) =>
                        run(() =>
                          addQualityProcessIo({
                            revisionId: shown.id,
                            processId: process.id,
                            direction,
                            name: String(form.get("name") ?? ""),
                            ioKind: String(form.get("ioKind") ?? "information"),
                            description: String(form.get("description") ?? ""),
                            sortOrder: items.length + 1,
                          })
                        )
                      }
                      className="space-y-2 rounded-md border border-hairline bg-paper p-2"
                    >
                      <input name="name" required maxLength={160} className={inputClass}
                             placeholder={direction === "input" ? "Qué entra" : "Qué sale"} />
                      <select name="ioKind" defaultValue="information" className={inputClass}>
                        {QUALITY_IO_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {QUALITY_IO_KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      <input name="description" maxLength={400} className={inputClass}
                             placeholder="Detalle (opcional)" />
                      <div className="flex gap-2">
                        <Button type="submit" disabled={pending} className="w-auto px-2 py-1 text-[11px]">
                          Añadir
                        </Button>
                        <Button type="button" variant="quiet" className="w-auto px-2 py-1 text-[11px]"
                                onClick={() => setAddingIo(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Button variant="quiet" className="w-auto px-2 py-1 text-[11px]"
                            onClick={() => setAddingIo(direction)}>
                      Añadir {direction === "input" ? "entrada" : "salida"}
                    </Button>
                  )
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* --------------------------------------------------------------- */}
      {/* Relaciones con otros procesos                                    */}
      {/* --------------------------------------------------------------- */}
      <Section
        title="Relación con otros procesos"
        hint="Una relación se guarda una sola vez y se lee desde ambos procesos: no es una flecha decorativa del mapa."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Este proceso entrega a
            </h3>
            {outgoing.length === 0 ? (
              <p className="text-xs text-ink-soft">Sin relaciones de salida.</p>
            ) : (
              <ul className="space-y-1">
                {outgoing.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2 rounded-md border border-hairline bg-paper px-2 py-1.5 text-xs">
                    <span className="min-w-0">
                      <span className="font-medium">{r.targetProcessName}</span>
                      {r.informationItem ? (
                        <span className="block text-ink-soft">{r.informationItem}</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => deleteQualityInteraction(r.id, process.id))}
                      className="shrink-0 text-[11px] text-ink-soft hover:text-ink"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Este proceso recibe de
            </h3>
            {incoming.length === 0 ? (
              <p className="text-xs text-ink-soft">Sin relaciones de entrada.</p>
            ) : (
              <ul className="space-y-1">
                {incoming.map((r) => (
                  <li key={r.id} className="rounded-md border border-hairline bg-paper px-2 py-1.5 text-xs">
                    <span className="font-medium">{r.sourceProcessName}</span>
                    {r.informationItem ? (
                      <span className="block text-ink-soft">{r.informationItem}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {relating ? (
          <form
            action={(form) =>
              run(() =>
                relateQualityProcesses({
                  sourceProcessId: process.id,
                  targetProcessId: String(form.get("targetProcessId") ?? ""),
                  informationItem: String(form.get("informationItem") ?? ""),
                  description: String(form.get("description") ?? ""),
                })
              )
            }
            className="space-y-2 rounded-md border border-hairline bg-paper p-3"
          >
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Proceso que recibe</span>
              <select name="targetProcessId" required className={inputClass} defaultValue="">
                <option value="" disabled>
                  Seleccione una opción…
                </option>
                {otherProcesses.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Qué se entrega</span>
              <input name="informationItem" required maxLength={160} className={inputClass}
                     placeholder="Ej.: Informe de revisión" />
            </label>
            <input name="description" maxLength={400} className={inputClass}
                   placeholder="Detalle (opcional)" />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="w-auto px-2 py-1 text-[11px]">
                Relacionar
              </Button>
              <Button type="button" variant="quiet" className="w-auto px-2 py-1 text-[11px]"
                      onClick={() => setRelating(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : otherProcesses.length > 0 ? (
          <Button variant="quiet" className="w-auto px-3 py-1 text-xs" onClick={() => setRelating(true)}>
            Relacionar con otro proceso
          </Button>
        ) : (
          <p className="text-xs text-ink-soft">
            Crea otro proceso para poder registrar una relación entre ambos.
          </p>
        )}
      </Section>

      {/* --------------------------------------------------------------- */}
      {/* Documentos de TrazaDocs                                          */}
      {/* --------------------------------------------------------------- */}
      <Section
        title="Documentos asociados"
        hint="El documento sigue viviendo en TrazaDocs; aquí solo se referencia. Quitar la asociación no borra el documento."
      >
        {documents.length === 0 ? (
          <p className="text-xs text-ink-soft">Sin documentos asociados.</p>
        ) : (
          <ul className="space-y-1">
            {documents.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-2 rounded-md border border-hairline bg-paper px-2 py-1.5 text-xs">
                <span className="min-w-0">
                  <Link href={`/trazadocs/${d.documentId}`} className="font-medium text-loop hover:underline">
                    {d.documentTitle}
                  </Link>
                  <span className="text-ink-soft">
                    {d.documentCode ? ` · ${d.documentCode}` : ""}
                    {" · "}
                    {QUALITY_DOCUMENT_RELATION_LABEL[d.relationType as QualityDocumentRelation] ??
                      d.relationType}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => unlinkTrazadocFromQualityProcess(d.id, process.id))}
                  className="shrink-0 text-[11px] text-ink-soft hover:text-ink"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}

        {linkingDoc ? (
          <form
            action={(form) =>
              run(() =>
                linkTrazadocToQualityProcess({
                  processId: process.id,
                  documentId: String(form.get("documentId") ?? ""),
                  relationType: String(form.get("relationType") ?? "governs"),
                })
              )
            }
            className="space-y-2 rounded-md border border-hairline bg-paper p-3"
          >
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Documento</span>
              <select name="documentId" required className={inputClass} defaultValue="">
                <option value="" disabled>
                  Seleccione una opción…
                </option>
                {availableDocuments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                    {d.code ? ` (${d.code})` : ""}
                    {d.moduleKey !== "quality" ? ` — de ${MODULE_ORIGIN_LABEL[d.moduleKey] ?? d.moduleKey}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Relación</span>
              <select name="relationType" defaultValue="governs" className={inputClass}>
                {QUALITY_DOCUMENT_RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {QUALITY_DOCUMENT_RELATION_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="w-auto px-2 py-1 text-[11px]">
                Asociar
              </Button>
              <Button type="button" variant="quiet" className="w-auto px-2 py-1 text-[11px]"
                      onClick={() => setLinkingDoc(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : availableDocuments.length > 0 ? (
          <Button variant="quiet" className="w-auto px-3 py-1 text-xs" onClick={() => setLinkingDoc(true)}>
            Asociar documento de TrazaDocs
          </Button>
        ) : (
          <p className="text-xs text-ink-soft">
            Todavía no hay documentos en la empresa.{" "}
            {/* El destino es Documentos de QUALITY, no TrazaDocs de PCR: una
                empresa que solo tenga Quality no puede entrar allí. */}
            <Link href="/quality/documents" className="text-loop hover:underline">
              Crea el primero en Documentos
            </Link>{" "}
            y vuelve para asociarlo.
          </p>
        )}
      </Section>

      {/* --------------------------------------------------------------- */}
      {/* Historial de revisiones                                          */}
      {/* --------------------------------------------------------------- */}
      <Section
        title="Historial de revisiones"
        hint="Las versiones anteriores no se borran: permiten responder qué regía en una fecha determinada."
      >
        {revisions.length === 0 ? (
          <p className="text-xs text-ink-soft">Este proceso aún no tiene revisiones.</p>
        ) : (
          <ul className="space-y-1">
            {revisions.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/quality/processes/${process.id}?revision=${r.id}`}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors hover:border-loop ${
                    r.id === shownRevisionId ? "border-loop bg-loop/5" : "border-hairline bg-paper"
                  }`}
                >
                  <span className="font-medium">Revisión {r.revisionNumber}</span>
                  <span className="text-ink-soft">
                    {QUALITY_REVISION_STATUS_LABEL[r.status as QualityRevisionStatus] ?? r.status}
                    {r.effectiveFrom ? ` · ${r.effectiveFrom} → ${r.effectiveTo ?? "vigente"}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
