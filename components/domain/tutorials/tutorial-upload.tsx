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
  validateTutorialFileDeclaration, isTutorialMimeType, TUTORIAL_INFRASTRUCTURE_NOTE,
} from "@/lib/domain/tutorial-media";
import { uploadResumable, type ResumableProgress } from "@/lib/storage/resumable-upload";

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
  const [avance, setAvance] = useState<ResumableProgress | null>(null);

  const ocupado = step === "reserving" || step === "uploading" || step === "verifying";

  async function subir(file: File) {
    setError(null);
    setNombre(`${file.name} · ${humanFileSize(file.size)}`);

    // Validación temprana, por cortesía. La autoritativa es la del servidor.
    // NO se comprueba el tamaño: Trazaloop no le pone tope, y comprobarlo aquí
    // volvería a poner una regla que se retiró.
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

    // El transporte es REANUDABLE, y no por comodidad: la subida estándar está
    // acotada por el límite global del proyecto, y una sola petición que falla
    // al 90 % vuelve a empezar. Ver `lib/storage/resumable-upload.ts`.
    //
    // Se autentica con la sesión de la propia persona, así que la política
    // INSERT del cubo SÍ se ejerce — al contrario que con una URL firmada, que
    // 0099 demostró que la esquiva.
    setStep("uploading");
    setAvance({ uploadedBytes: 0, totalBytes: file.size, ratio: 0 });
    const supabase = createBrowserClient();
    const { data: sesion } = await supabase.auth.getSession();
    const token = sesion.session?.access_token;
    if (!token) {
      await failTutorialUploadAction(reserva.versionId);
      setStep("error");
      setError("Tu sesión caducó. Vuelve a entrar y repite la subida.");
      return;
    }

    const subida = await uploadResumable({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      accessToken: token,
      bucketId: "tutorial-media",
      objectPath: reserva.objectPath,
      file,
      contentType: mime,
      onProgress: setAvance,
    });
    if (!subida.ok) {
      // La reserva se marca fallida en vez de quedarse viva para siempre. Una
      // reserva viva es una ruta que sigue admitiendo escritura.
      await failTutorialUploadAction(reserva.versionId);
      setStep("error");
      setError(tutorialUploadErrorMessage(subida.message));
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
    setAvance(null);
    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Subir una versión nueva</h3>
        <p className="mt-1 text-sm text-ink-soft">
          MP4 o WebM. Subir{" "}
          <strong className="font-medium text-ink">no publica</strong>: la versión
          queda lista para revisar y se publica después.
        </p>
        <p className="mt-1 text-xs text-ink-soft">{TUTORIAL_INFRASTRUCTURE_NOTE}</p>
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
            {step === "uploading" && avance
              ? <span className="text-ink-soft">
                  {" "}· {Math.round(avance.ratio * 100)} %
                  {" "}({humanFileSize(avance.uploadedBytes)} de {humanFileSize(avance.totalBytes)})
                </span>
              : null}
            {nombre ? <span className="text-ink-soft"> · {nombre}</span> : null}
          </span>
        )}
      </p>

      {/* La barra acompaña al texto; no lo sustituye. Un porcentaje que solo se
          ve en color no lo lee quien usa un lector de pantalla. */}
      {step === "uploading" && avance ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline"
          role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(avance.ratio * 100)}
          aria-label="Progreso de la subida">
          <div className="h-full bg-loop transition-all"
            style={{ width: `${Math.round(avance.ratio * 100)}%` }} />
        </div>
      ) : null}

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
