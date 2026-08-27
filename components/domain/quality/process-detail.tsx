"use client";

import { useState, useTransition } from "react";
import { AskCopilotButton } from "@/components/domain/quality/copilot/ask-button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { shellModuleName, trazadocDocumentHref } from "@/lib/modules/registry";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/ui/alert";
import { LifecyclePanel } from "@/components/domain/quality/lifecycle-panel";
import type { DeletionEligibility } from "@/lib/domain/lifecycle";
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
  deleteProcessAction,
} from "@/server/actions/quality-processes";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

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
  sourceOutputId: string | null;
  sourceOutputName: string | null;
  targetInputId: string | null;
  targetInputName: string | null;
  informationItem: string | null;
  description: string | null;
};

type DocumentView = {
  id: string;
  documentId: string;
  documentTitle: string;
  documentCode: string | null;
  documentStatus: string;
  documentModuleKey: string;
  relationType: string;
  ioId: string | null;
};

/** Otro proceso de la empresa, con sus entradas y salidas vigentes: es lo que
 *  permite construir la relación desde cualquiera de sus dos extremos. */
type ProcessIoOption = { id: string; name: string };
type OtherProcess = {
  processId: string;
  processName: string;
  processCode: string | null;
  inputs: ProcessIoOption[];
  outputs: ProcessIoOption[];
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

/** Lista de documentos asociados (al proceso o a una entrada/salida), con el
 *  enlace al módulo del que el documento es dueño — nunca al de PCR por
 *  defecto, que era el enlace roto para una empresa que solo tiene Quality. */
function DocumentLinks({
  items,
  emptyLabel,
  pending,
  onUnlink,
}: {
  items: DocumentView[];
  emptyLabel: string;
  pending: boolean;
  onUnlink: (linkId: string) => void;
}) {
  if (items.length === 0) return <p className="text-[11px] text-ink-soft">{emptyLabel}</p>;
  return (
    <ul className="space-y-1">
      {items.map((d) => {
        const href = trazadocDocumentHref(d.documentModuleKey, d.documentId);
        return (
          <li key={d.id} className="flex items-start justify-between gap-2 text-[11px]">
            <span className="min-w-0">
              {href ? (
                <Link href={href} className="font-medium text-loop hover:underline">
                  {d.documentTitle}
                </Link>
              ) : (
                <span className="font-medium">{d.documentTitle}</span>
              )}
              <span className="text-ink-soft">
                {d.documentCode ? ` · ${d.documentCode}` : ""}
                {" · "}
                {QUALITY_DOCUMENT_RELATION_LABEL[d.relationType as QualityDocumentRelation] ??
                  d.relationType}
                {d.documentModuleKey !== "quality"
                  ? ` · de ${shellModuleName(d.documentModuleKey)}`
                  : ""}
              </span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => onUnlink(d.id)}
              className="shrink-0 text-ink-soft hover:text-ink"
            >
              Desvincular
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Formulario de vinculación, reutilizado para el proceso y para cada entrada
 *  o salida: la estructura que se escribe es exactamente la misma fila. */
function LinkDocumentForm({
  ioId,
  availableDocuments,
  pending,
  onCancel,
  onSubmit,
}: {
  ioId: string | null;
  availableDocuments: { id: string; title: string; code: string | null; moduleKey: string }[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (ioId: string | null, form: FormData) => void;
}) {
  return (
    <form
      action={(form) => onSubmit(ioId, form)}
      className="space-y-2 rounded-md border border-hairline bg-paper p-2"
    >
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium">Documento</span>
        <select name="documentId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            Seleccione una opción…
          </option>
          {availableDocuments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
              {d.code ? ` (${d.code})` : ""}
              {d.moduleKey !== "quality" ? ` — de ${shellModuleName(d.moduleKey)}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] font-medium">Relación</span>
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
          Vincular
        </Button>
        <Button
          type="button"
          variant="quiet"
          className="w-auto px-2 py-1 text-[11px]"
          onClick={onCancel}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * Formulario de relación, en sus dos puntos de vista.
 *
 * Es UN solo componente porque es UNA sola operación: cambia el orden de las
 * preguntas y quién ocupa el papel de origen, no la estructura que se guarda.
 * Tenerlo duplicado habría sido la primera grieta por la que «entrega a» y
 * «recibe de» acabarían comportándose distinto.
 */
function RelateForm({
  mode,
  processes,
  ownIo,
  pending,
  onCancel,
  onSubmit,
}: {
  mode: "incoming" | "outgoing";
  processes: OtherProcess[];
  /** Entradas de este proceso (incoming) o salidas de este proceso (outgoing). */
  ownIo: IoView[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: {
    otherProcessId: string;
    otherIoId: string;
    ownIoId: string;
    description: string;
  }) => void;
}) {
  const [otherProcessId, setOtherProcessId] = useState("");
  const other = processes.find((p) => p.processId === otherProcessId) ?? null;
  const otherIo = mode === "incoming" ? other?.outputs ?? [] : other?.inputs ?? [];

  const otherProcessLabel = mode === "incoming" ? "Proceso del que recibe" : "Proceso al que entrega";
  const otherIoLabel = mode === "incoming" ? "Salida de ese proceso" : "Entrada del proceso destino";
  const ownIoLabel = mode === "incoming" ? "Entrada en este proceso" : "Salida de este proceso";

  if (ownIo.length === 0) {
    return (
      <div className="space-y-2 rounded-md border border-hairline bg-paper p-3">
        <p className="text-xs text-ink-soft">
          Este proceso todavía no tiene {mode === "incoming" ? "entradas" : "salidas"} registradas.
          Añádelas arriba: una relación conecta una salida concreta con una entrada concreta, y sin
          ellas la flecha del mapa no diría qué fluye.
        </p>
        <Button type="button" variant="quiet" className="w-auto px-2 py-1 text-[11px]" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    );
  }

  const processField = (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium">{otherProcessLabel}</span>
      <select
        required
        className={inputClass}
        value={otherProcessId}
        onChange={(e) => setOtherProcessId(e.target.value)}
      >
        <option value="" disabled>
          Seleccione una opción…
        </option>
        {processes.map((p) => (
          <option key={p.processId} value={p.processId}>
            {p.processName}
            {p.processCode ? ` (${p.processCode})` : ""}
          </option>
        ))}
      </select>
    </label>
  );

  const otherIoField = (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium">{otherIoLabel}</span>
      <select name="otherIoId" required className={inputClass} defaultValue="" key={otherProcessId}>
        <option value="" disabled>
          {other === null ? "Elige antes el proceso…" : "Seleccione una opción…"}
        </option>
        {otherIo.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );

  const ownIoField = (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium">{ownIoLabel}</span>
      <select name="ownIoId" required className={inputClass} defaultValue="">
        <option value="" disabled>
          Seleccione una opción…
        </option>
        {ownIo.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form
      action={(form) =>
        onSubmit({
          otherProcessId,
          otherIoId: String(form.get("otherIoId") ?? ""),
          ownIoId: String(form.get("ownIoId") ?? ""),
          description: String(form.get("description") ?? ""),
        })
      }
      className="space-y-2 rounded-md border border-hairline bg-paper p-3"
    >
      <p className="text-xs font-semibold">
        {mode === "incoming" ? "Añadir proceso del que recibe" : "Añadir proceso al que entrega"}
      </p>
      {mode === "incoming" ? (
        <>
          {processField}
          {otherIoField}
          {ownIoField}
        </>
      ) : (
        <>
          {ownIoField}
          {processField}
          {otherIoField}
        </>
      )}
      <input
        name="description"
        maxLength={400}
        className={inputClass}
        placeholder="Descripción (opcional)"
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || otherProcessId === ""}
                className="w-auto px-2 py-1 text-[11px]">
          Registrar relación
        </Button>
        <Button type="button" variant="quiet" className="w-auto px-2 py-1 text-[11px]" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      {processes.length === 0 ? (
        <p className="text-[11px] text-ink-soft">
          Ningún otro proceso tiene {mode === "incoming" ? "salidas" : "entradas"} registradas
          todavía.
        </p>
      ) : null}
    </form>
  );
}

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
  canManage,
  eligibility,
}: {
  detail: Detail;
  shownRevisionId: string | null;
  positions: { id: string; name: string }[];
  categories: { code: string; name: string }[];
  otherProcesses: OtherProcess[];
  /** Documentos vinculables: de CUALQUIER módulo de la misma empresa. */
  availableDocuments: { id: string; title: string; code: string | null; status: string; moduleKey: string }[];
  canPublish: boolean;
  canManage: boolean;
  /** Dictamen de eliminación, resuelto en servidor (QUALITY-03.1a). */
  eligibility: DeletionEligibility;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [addingIo, setAddingIo] = useState<"input" | "output" | null>(null);
  /** Desde qué punto de vista se está creando la relación. */
  const [relating, setRelating] = useState<"incoming" | "outgoing" | null>(null);
  /** A qué se está vinculando un documento: al proceso o a una entrada/salida. */
  const [linkingDocFor, setLinkingDocFor] = useState<string | null>(null);

  const { process, revisions, currentRevision, draftRevision, io, interactions, documents } = detail;
  const shown = revisions.find((r) => r.id === shownRevisionId) ?? null;
  const editable = shown !== null && canEditRevision(shown.status);
  const viewingHistory = shown !== null && shown.id !== draftRevision?.id && shown.id !== currentRevision?.id;

  const inputs = io.filter((i) => i.direction === "input");
  const outputs = io.filter((i) => i.direction === "output");
  const { outgoing, incoming } = splitInteractions(process.id, interactions);

  // Los documentos se reparten en dos ámbitos: los del proceso entero y los de
  // una entrada o salida concreta (0114).
  const processDocuments = documents.filter((d) => d.ioId === null);
  const documentsByIo = new Map<string, DocumentView[]>();
  for (const d of documents) {
    if (d.ioId === null) continue;
    documentsByIo.set(d.ioId, [...(documentsByIo.get(d.ioId) ?? []), d]);
  }

  const relatableSources = otherProcesses.filter((p) => p.outputs.length > 0);
  const relatableTargets = otherProcesses.filter((p) => p.inputs.length > 0);

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
      setRelating(null);
      setLinkingDocFor(null);
      if (okMessage) setNotice(okMessage);
      router.refresh();
    });
  }

  const unlinkDocument = (linkId: string) =>
    run(() => unlinkTrazadocFromQualityProcess(linkId, process.id));

  const linkDocument = (ioId: string | null, form: FormData) =>
    run(() =>
      linkTrazadocToQualityProcess({
        processId: process.id,
        documentId: String(form.get("documentId") ?? ""),
        relationType: String(form.get("relationType") ?? "governs"),
        ioId: ioId ?? undefined,
      })
    );

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
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex rounded-full border border-hairline px-2 py-0.5 text-[11px]">
              {QUALITY_PROCESS_STATUS_LABEL[process.status as QualityProcessStatus] ?? process.status}
            </span>
            <ExportPdfButton exportKey="quality.process.detail" id={process.id} />
            <AskCopilotButton type="quality_process" id={process.id}
              label={`Proceso: ${process.name}`} />
          </div>
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
                      <li key={i.id} className="space-y-1.5 rounded-md border border-hairline bg-paper px-2 py-1.5">
                        <div className="flex items-start justify-between gap-2">
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
                        </div>

                        {/* QUALITY-01.2 · Documentos de ESTA entrada o salida.
                            Una entrada suele venir definida por una
                            especificación o un requisito; una salida deja un
                            registro o un certificado. El documento sigue
                            viviendo en TrazaDocs: aquí solo se referencia. */}
                        <div className="space-y-1 border-t border-hairline/60 pt-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                            Documentos asociados
                          </p>
                          <DocumentLinks
                            items={documentsByIo.get(i.id) ?? []}
                            emptyLabel="Sin documentos."
                            pending={pending}
                            onUnlink={unlinkDocument}
                          />
                          {linkingDocFor === i.id ? (
                            <LinkDocumentForm
                              ioId={i.id}
                              availableDocuments={availableDocuments}
                              pending={pending}
                              onCancel={() => setLinkingDocFor(null)}
                              onSubmit={linkDocument}
                            />
                          ) : availableDocuments.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => setLinkingDocFor(i.id)}
                              className="text-[11px] font-medium text-loop hover:underline"
                            >
                              Vincular documento
                            </button>
                          ) : (
                            <Link
                              href="/quality/documents"
                              className="text-[11px] font-medium text-loop hover:underline"
                            >
                              Crea un documento para poder vincularlo
                            </Link>
                          )}
                        </div>
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
        title="Relaciones con otros procesos"
        hint="Cada relación se guarda UNA sola vez y se lee desde sus dos extremos: lo que aquí es «entrega a», en el otro proceso es «recibe de». No hay dos registros, y por eso no pueden discrepar."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* ---------------------------- RECIBE DE ---------------------------- */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Recibe de
            </h3>
            {incoming.length === 0 ? (
              <p className="text-xs text-ink-soft">Ningún proceso alimenta a este todavía.</p>
            ) : (
              <ul className="space-y-1">
                {incoming.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-2 rounded-md border border-hairline bg-paper px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0">
                      <Link
                        href={`/quality/processes/${r.sourceProcessId}`}
                        className="font-medium text-loop hover:underline"
                      >
                        {r.sourceProcessName}
                      </Link>
                      <span className="block text-ink-soft">
                        Salida origen: {r.sourceOutputName ?? r.informationItem ?? "—"}
                      </span>
                      <span className="block text-ink-soft">
                        Entrada en este proceso: {r.targetInputName ?? "sin especificar"}
                      </span>
                      {r.description ? (
                        <span className="block text-ink-soft">{r.description}</span>
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

          {/* ---------------------------- ENTREGA A ---------------------------- */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              Entrega a
            </h3>
            {outgoing.length === 0 ? (
              <p className="text-xs text-ink-soft">Este proceso no alimenta a ninguno todavía.</p>
            ) : (
              <ul className="space-y-1">
                {outgoing.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-2 rounded-md border border-hairline bg-paper px-2 py-1.5 text-xs"
                  >
                    <span className="min-w-0">
                      <Link
                        href={`/quality/processes/${r.targetProcessId}`}
                        className="font-medium text-loop hover:underline"
                      >
                        {r.targetProcessName}
                      </Link>
                      <span className="block text-ink-soft">
                        Salida de este proceso: {r.sourceOutputName ?? r.informationItem ?? "—"}
                      </span>
                      <span className="block text-ink-soft">
                        Entrada destino: {r.targetInputName ?? "sin especificar"}
                      </span>
                      {r.description ? (
                        <span className="block text-ink-soft">{r.description}</span>
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
        </div>

        {/* Crear la relación desde CUALQUIERA de los dos puntos de vista. Las
            dos formas producen exactamente la misma fila: cambia quién es el
            origen y quién el destino, nada más. */}
        {relating === "incoming" ? (
          <RelateForm
            mode="incoming"
            processes={relatableSources}
            ownIo={inputs}
            pending={pending}
            onCancel={() => setRelating(null)}
            onSubmit={(values) =>
              run(
                () =>
                  relateQualityProcesses({
                    sourceProcessId: values.otherProcessId,
                    sourceOutputId: values.otherIoId,
                    targetProcessId: process.id,
                    targetInputId: values.ownIoId,
                    description: values.description,
                  }),
                "Relación registrada."
              )
            }
          />
        ) : relating === "outgoing" ? (
          <RelateForm
            mode="outgoing"
            processes={relatableTargets}
            ownIo={outputs}
            pending={pending}
            onCancel={() => setRelating(null)}
            onSubmit={(values) =>
              run(
                () =>
                  relateQualityProcesses({
                    sourceProcessId: process.id,
                    sourceOutputId: values.ownIoId,
                    targetProcessId: values.otherProcessId,
                    targetInputId: values.otherIoId,
                    description: values.description,
                  }),
                "Relación registrada."
              )
            }
          />
        ) : otherProcesses.length === 0 ? (
          <p className="text-xs text-ink-soft">
            Crea otro proceso para poder registrar una relación entre ambos.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="quiet"
              className="w-auto px-3 py-1 text-xs"
              onClick={() => setRelating("incoming")}
            >
              Añadir proceso del que recibe
            </Button>
            <Button
              variant="quiet"
              className="w-auto px-3 py-1 text-xs"
              onClick={() => setRelating("outgoing")}
            >
              Añadir proceso al que entrega
            </Button>
          </div>
        )}
        {relating === null && otherProcesses.length > 0 && io.length === 0 ? (
          <p className="text-xs text-ink-soft">
            Registra primero las entradas y salidas de este proceso: una relación conecta una
            salida concreta con una entrada concreta.
          </p>
        ) : null}
      </Section>

      {/* --------------------------------------------------------------- */}
      {/* Documentos de TrazaDocs                                          */}
      {/* --------------------------------------------------------------- */}
      <Section
        title="Documentos del proceso"
        hint="Los que gobiernan el proceso ENTERO. Los que definen o evidencian una entrada o una salida concreta se vinculan arriba, en esa entrada o salida. El documento sigue viviendo en TrazaDocs: aquí solo se referencia, y desvincularlo no lo borra."
      >
        <DocumentLinks
          items={processDocuments}
          emptyLabel="Sin documentos asociados al proceso."
          pending={pending}
          onUnlink={unlinkDocument}
        />

        {linkingDocFor === "__process__" ? (
          <LinkDocumentForm
            ioId={null}
            availableDocuments={availableDocuments}
            pending={pending}
            onCancel={() => setLinkingDocFor(null)}
            onSubmit={linkDocument}
          />
        ) : availableDocuments.length > 0 ? (
          <Button
            variant="quiet"
            className="w-auto px-3 py-1 text-xs"
            onClick={() => setLinkingDocFor("__process__")}
          >
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
              <li key={r.id} className="flex items-center gap-2">
                {/* Cada revisión se descarga sola: el proceso cambia, la
                    revisión que se aprobó aquel día no. */}
                <ExportPdfButton exportKey="quality.process-revision.detail" id={r.id} />
                <Link
                  href={`/quality/processes/${process.id}?revision=${r.id}`}
                  className={`flex flex-1 flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors hover:border-loop ${
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

      {/* Eliminar, o entender por qué ya no. Mismo patrón y mismo dictamen que
          el resto de Quality: esta pantalla no cuenta revisiones ni mapas. */}
      <LifecyclePanel
        entity="process"
        name={process.name}
        eligibility={eligibility}
        idFieldName="process_id"
        idValue={process.id}
        deleteAction={deleteProcessAction}
        canManage={canManage}
      />
    </div>
  );
}
