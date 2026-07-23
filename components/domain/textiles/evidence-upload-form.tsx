"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import {
  TEXTILE_EVIDENCE_TYPES,
  TEXTILE_EVIDENCE_TYPE_LABEL,
  TEXTILE_EVIDENCE_ALLOWED_MIME_TYPES,
  TEXTILE_EVIDENCE_FILE_RULES_MESSAGE,
  validateTextileEvidenceFile,
} from "@/lib/domain/textiles-evidences";
import type {
  BeginTextileEvidenceUploadInput,
  BeginTextileEvidenceUploadResult,
} from "@/server/actions/textiles-evidences";

/**
 * Trazaloop · Sprint T5 (Textil) · Formulario de evidencia; T9E.1 lo migra
 * a CARGA DIRECTA: los bytes del archivo van del navegador a Supabase
 * Storage con una signed upload URL emitida en servidor — JAMÁS dentro de
 * una Server Action ni de un Route Handler de Next.js.
 *
 * Flujo: (A) begin (solo metadata pequeña) → (B) PUT directo a Storage con
 * progreso real y cancelación (XHR, mismo protocolo que uploadToSignedUrl)
 * → (C) finalize (solo intentId + metadata; el servidor verifica el objeto
 * REAL antes de crear la evidencia). La UI solo guía — validación real en
 * actions, intento 0094, RLS de storage y triggers.
 */

type ActionResult = { error: string | null };

export type EvidenceFormValues = {
  title: string;
  evidenceType: string;
  description: string;
  documentDate: string;
  issuer: string;
  referenceCode: string;
  validFrom: string;
  validUntil: string;
};

const EMPTY: EvidenceFormValues = {
  title: "",
  evidenceType: "other",
  description: "",
  documentDate: "",
  issuer: "",
  referenceCode: "",
  validFrom: "",
  validUntil: "",
};

type UploadPhase = "idle" | "uploading" | "finalizing";

/** PUT directo del archivo a la signed upload URL de Supabase Storage
 * (mismo método y cabeceras que storage-js uploadToSignedUrl), con
 * progreso real y cancelación vía XMLHttpRequest. */
function uploadFileDirectly(
  signedUrl: string,
  file: File,
  onProgress: (percent: number) => void,
  register: (xhr: XMLHttpRequest) => void
): Promise<{ ok: true } | { ok: false; aborted: boolean; message: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    register(xhr);
    xhr.open("PUT", signedUrl, true);
    xhr.setRequestHeader("content-type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve({ ok: true });
      } else if (xhr.status === 403 || xhr.status === 401) {
        resolve({
          ok: false,
          aborted: false,
          message: "La autorización de carga no es válida o expiró. Intenta de nuevo.",
        });
      } else {
        resolve({
          ok: false,
          aborted: false,
          message: "No fue posible subir el archivo al almacenamiento. Intenta de nuevo.",
        });
      }
    };
    xhr.onerror = () =>
      resolve({
        ok: false,
        aborted: false,
        message: "Error de red durante la carga. Revisa tu conexión e intenta de nuevo.",
      });
    xhr.onabort = () =>
      resolve({ ok: false, aborted: true, message: "Carga cancelada." });
    xhr.send(file);
  });
}

export function TextileEvidenceForm({
  evidenceId,
  initialValues,
  beginUploadAction,
  finalizeUploadAction,
  updateAction,
}: {
  evidenceId?: string;
  initialValues?: EvidenceFormValues;
  beginUploadAction?: (
    input: BeginTextileEvidenceUploadInput
  ) => Promise<BeginTextileEvidenceUploadResult>;
  finalizeUploadAction?: (intentId: string) => Promise<ActionResult>;
  updateAction?: (id: string, formData: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [values, setValues] = useState<EvidenceFormValues>(initialValues ?? EMPTY);
  const isEdit = Boolean(evidenceId && updateAction);
  const busy = pending || phase !== "idle";

  function set(key: keyof EvidenceFormValues, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function metadataFormData(): FormData {
    const formData = new FormData();
    formData.set("title", values.title);
    formData.set("evidenceType", values.evidenceType);
    formData.set("description", values.description);
    formData.set("documentDate", values.documentDate);
    formData.set("issuer", values.issuer);
    formData.set("referenceCode", values.referenceCode);
    formData.set("validFrom", values.validFrom);
    formData.set("validUntil", values.validUntil);
    return formData;
  }

  function cancelUpload() {
    xhrRef.current?.abort();
  }

  async function runDirectUpload() {
    if (!beginUploadAction || !finalizeUploadAction) {
      setError("Acción no configurada.");
      return;
    }
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("El archivo es obligatorio.");
      return;
    }
    // Pre-validación en cliente (UX temprana) con la MISMA regla pura del
    // servidor; el servidor re-valida al iniciar Y al finalizar.
    const fileError = validateTextileEvidenceFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (fileError) {
      setError(fileError);
      return;
    }

    // Fase A: iniciar — SOLO metadata pequeña viaja a la Server Action.
    // T9E.2: la metadata FUNCIONAL completa se valida aquí, ANTES de subir
    // un solo byte, y queda canónica e inmutable en el intento.
    const begin = await beginUploadAction({
      fileName: file.name,
      fileSizeBytes: file.size,
      fileMimeType: file.type,
      metadata: metadataFormData(),
    });
    if (begin.error !== null) {
      setError(begin.error);
      return;
    }

    // Fase B: los bytes van DIRECTO a Supabase Storage (URL firmada).
    setPhase("uploading");
    setProgress(0);
    const upload = await uploadFileDirectly(begin.signedUrl, file, setProgress, (xhr) => {
      xhrRef.current = xhr;
    });
    xhrRef.current = null;
    if (!upload.ok) {
      setPhase("idle");
      setError(upload.message);
      return;
    }

    // Fase C: finalizar — SOLO el intentId: el servidor usa la metadata
    // canónica del intento, verifica el objeto REAL (tamaño + Content-Type
    // + firma binaria) y crea la evidencia ATÓMICAMENTE (idempotente).
    setPhase("finalizing");
    const res = await finalizeUploadAction(begin.intentId);
    setPhase("idle");
    if (res.error) {
      setError(res.error);
      return;
    }
    setNotice("Evidencia registrada (revisión pendiente).");
    setValues(EMPTY);
    if (fileRef.current) fileRef.current.value = "";
    router.push("/textiles/evidences");
    router.refresh();
  }

  function submit() {
    setError(null);
    setNotice(null);
    if (isEdit) {
      startTransition(async () => {
        const res = await updateAction!(evidenceId!, metadataFormData());
        if (res.error) {
          setError(res.error);
          return;
        }
        setNotice("Evidencia actualizada.");
        router.refresh();
      });
      return;
    }
    startTransition(async () => {
      await runDirectUpload();
    });
  }

  const textField = (key: keyof EvidenceFormValues, label: string, type = "text", placeholder?: string) => (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type={type}
        value={values[key]}
        disabled={busy}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
        className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5"
      />
    </label>
  );

  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <h2 className="text-sm font-semibold">{isEdit ? "Editar metadatos" : "Nueva evidencia"}</h2>
      <ErrorAlert message={error} />
      {notice ? <InfoAlert message={notice} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">
            Título <span className="text-danger">*</span>
          </span>
          <input
            type="text"
            value={values.title}
            disabled={busy}
            placeholder="p. ej. Ficha técnica Tela Oxford 65/35"
            onChange={(e) => set("title", e.target.value)}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tipo de evidencia</span>
          <select
            value={values.evidenceType}
            disabled={busy}
            onChange={(e) => set("evidenceType", e.target.value)}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5"
          >
            {TEXTILE_EVIDENCE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TEXTILE_EVIDENCE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        {textField("description", "Descripción")}
        {textField("issuer", "Emisor")}
        {textField("referenceCode", "Código de referencia")}
        {textField("documentDate", "Fecha del documento", "date")}
        {textField("validFrom", "Vigente desde", "date")}
        {textField("validUntil", "Vigente hasta", "date")}
        {!isEdit ? (
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">
              Archivo <span className="text-danger">*</span>
            </span>
            <input
              ref={fileRef}
              type="file"
              disabled={busy}
              accept={TEXTILE_EVIDENCE_ALLOWED_MIME_TYPES.join(",")}
              className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm"
            />
            <span className="block text-xs text-ink-soft">
              {TEXTILE_EVIDENCE_FILE_RULES_MESSAGE}
            </span>
            <span className="block text-xs text-ink-soft">
              El archivo se sube directamente al almacenamiento privado — nunca pasa por el
              servidor de la aplicación.
            </span>
          </label>
        ) : null}
      </div>

      {phase === "uploading" ? (
        <div className="space-y-2">
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Progreso de carga del archivo"
            className="h-2 w-full overflow-hidden rounded-full bg-paper"
          >
            <div
              className="h-full rounded-full bg-loop transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-ink-soft">
            <span>Subiendo al almacenamiento privado… {progress}%</span>
            <button
              type="button"
              onClick={cancelUpload}
              className="rounded-md border border-hairline bg-paper px-2 py-1 font-medium hover:border-danger"
            >
              Cancelar carga
            </button>
          </div>
        </div>
      ) : null}
      {phase === "finalizing" ? (
        <p className="text-xs text-ink-soft">Verificando el archivo y registrando la evidencia…</p>
      ) : null}

      <Button type="button" disabled={busy} onClick={submit} className="w-fit">
        {isEdit ? "Guardar cambios" : busy && !isEdit ? "Procesando…" : "Registrar evidencia"}
      </Button>
    </section>
  );
}
