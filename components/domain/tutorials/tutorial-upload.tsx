"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createBrowserClient } from "@/lib/supabase/browser";
import {
  reserveTutorialUploadAction, finalizeTutorialUploadAction, failTutorialUploadAction,
} from "@/server/actions/tutorials-admin";
import {
  TUTORIAL_UPLOAD_STEP_LABEL, tutorialUploadErrorMessage, humanFileSize,
  type TutorialUploadStep,
} from "@/lib/domain/tutorial-admin";
import {
  TUTORIAL_MAX_FILE_BYTES, validateTutorialFileDeclaration, isTutorialMimeType,
} from "@/lib/domain/tutorial-media";

/**
 * Trazaloop · PE-03B2 · Subir un vídeo.
 *
 * LOS BYTES NO PASAN POR NEXT.JS, Y NO ES UNA PREFERENCIA
 *
 * `next.config.ts` dejó las Server Actions en su límite por defecto de 1 MB
 * cuando T9E.1 cambió el transporte, y hay pruebas que fallan si alguien lo
 * reintroduce. Un tutorial de tres minutos son decenas de megas.
 *
 * Así que el archivo va del navegador a Storage por la URL firmada que emite la
 * reserva. Lo que atraviesa el servidor son tres mensajes cortos: reservar,
 * avisar de que terminó, y —si algo se torció— avisar de eso.
 *
 *
 * SUBIR NO ES PUBLICAR, Y AQUÍ SE DICE
 *
 * El último estado se llama «Listo para revisar», no «Publicado». Es la
 * confusión que este tramo tiene que evitar: quien sube un vídeo y ve
 * «completado» piensa que la gente ya lo está viendo.
 */
export function TutorialUploadForm({
  tutorialId,
}: {
  tutorialId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<TutorialUploadStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);

  const ocupado = step === "reserving" || step === "uploading" || step === "verifying";

  async function subir(file: File) {
    setError(null);
    setNombre(`${file.name} · ${humanFileSize(file.size)}`);

    // Validación temprana, por cortesía. La autoritativa es la del servidor y
    // la del cubo: esta solo evita un viaje inútil.
    const mime = file.type || "";
    const declarado = validateTutorialFileDeclaration({
      filename: file.name, mime, sizeBytes: file.size,
    });
    if (!declarado.ok) { setStep("error"); setError(declarado.message); return; }
    if (!isTutorialMimeType(mime)) {
      setStep("error");
      setError("Solo se admiten vídeos en formato MP4 o WebM.");
      return;
    }

    setStep("reserving");
    const reserva = await reserveTutorialUploadAction({
      tutorialId, filename: file.name, mime, sizeBytes: file.size,
    });
    if (!reserva.ok) { setStep("error"); setError(reserva.message); return; }

    setStep("uploading");
    const supabase = createBrowserClient();
    const { error: eSubida } = await supabase.storage
      .from("tutorial-media")
      .uploadToSignedUrl(reserva.objectPath, reserva.token, file, {
        contentType: mime,
      });
    if (eSubida) {
      // La reserva se marca fallida en vez de quedarse viva para siempre. Una
      // reserva viva es una ruta que sigue admitiendo escritura.
      await failTutorialUploadAction(reserva.versionId);
      setStep("error");
      setError(tutorialUploadErrorMessage(eSubida.message));
      router.refresh();
      return;
    }

    setStep("verifying");
    const fin = await finalizeTutorialUploadAction({
      versionId: reserva.versionId, objectPath: reserva.objectPath, mime,
    });
    if (!fin.ok) {
      setStep("error");
      setError(fin.message ?? "No se pudo verificar el archivo subido.");
      router.refresh();
      return;
    }

    setStep("done");
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Subir una versión nueva</h3>
        <p className="mt-1 text-sm text-ink-soft">
          MP4 o WebM, hasta {Math.floor(TUTORIAL_MAX_FILE_BYTES / (1024 * 1024))} MB.
          Subir <strong className="font-medium text-ink">no publica</strong>: la
          versión queda lista para revisar y se publica después.
        </p>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Archivo de vídeo
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/webm,.mp4,.webm"
          disabled={ocupado}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void subir(f);
          }}
          className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border file:border-hairline file:bg-paper file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:border-loop disabled:opacity-50"
        />
      </label>

      {/* El estado se anuncia, y no se dice solo con un color: quien no
          distingue el verde del ámbar tiene que poder saber qué pasó. */}
      <p role="status" aria-live="polite" className="text-sm">
        {step === "idle" ? (
          <span className="text-ink-soft">Aún no has elegido ningún archivo.</span>
        ) : step === "error" ? (
          <span className="font-medium text-red-700">
            ✕ {TUTORIAL_UPLOAD_STEP_LABEL.error}
            {error ? <> — {error}</> : null}
          </span>
        ) : step === "done" ? (
          <span className="font-medium text-loop-deep">
            ✓ {TUTORIAL_UPLOAD_STEP_LABEL.done}. Revísala abajo y publícala cuando quieras.
          </span>
        ) : (
          <span className="text-ink">
            {TUTORIAL_UPLOAD_STEP_LABEL[step]}
            {nombre ? <span className="text-ink-soft"> · {nombre}</span> : null}
          </span>
        )}
      </p>

      {step === "error" ? (
        <button
          type="button"
          onClick={() => { setStep("idle"); setError(null); if (inputRef.current) inputRef.current.value = ""; }}
          className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium hover:border-loop"
        >
          Volver a intentarlo
        </button>
      ) : null}
    </div>
  );
}
