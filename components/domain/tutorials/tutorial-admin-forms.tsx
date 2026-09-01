"use client";

import { useActionState, useState } from "react";

import {
  createTutorialAction, publishTutorialVersionAction, unpublishTutorialAction,
  restoreTutorialVersionAction, discardCandidateAction, saveCandidateMetadataAction,
  previewTutorialVersionAction, reactivateTutorialAction, type TutorialAdminState,
} from "@/server/actions/tutorials-admin";
import { Field, SelectField, TextareaField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";

const inicial: TutorialAdminState = { error: null };

/**
 * Trazaloop · PE-03B2 · Los formularios de la consola.
 *
 * Todos siguen el reparto de PE-02: el botón se esconde por cortesía y la
 * barrera está en la acción y en la base. Ninguno decide nada por su cuenta.
 */

export function CreateTutorialForm({
  pages,
}: { pages: { key: string; label: string }[] }) {
  const [state, action, pending] = useActionState(createTutorialAction, inicial);

  if (pages.length === 0) {
    return (
      <p className="rounded-lg border border-hairline bg-paper p-4 text-sm text-ink-soft">
        Todas las pantallas del registro ya tienen tutorial. Para añadir otra hay
        que registrarla primero en <code className="text-xs">lib/modules/page-keys.ts</code>.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <ErrorAlert message={state.error} />
      {state.ok ? (
        <SuccessAlert message="Tutorial creado. Todavía no tiene vídeo, así que la pantalla sigue diciendo que está en actualización." />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Pantalla" name="pageKey" required placeholder="Elige la pantalla"
          options={pages.map((p) => ({ value: p.key, label: p.label }))}
          hint="Del registro de pantallas. No se escribe a mano: si la pantalla cambia de dirección, el tutorial no se mueve."
        />
        <Field
          label="Nombre del tutorial" name="title" required
          placeholder="Cómo trabajar con procesos"
          hint="Lo que se lee junto al vídeo."
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear tutorial"}
      </Button>
    </form>
  );
}

/** Título, descripción y nota de cambio de una versión sin publicar. */
export function CandidateMetadataForm({
  tutorialId, versionId, title, description, changeNote,
}: {
  tutorialId: string; versionId: string;
  title: string | null; description: string | null; changeNote: string | null;
}) {
  const [state, action, pending] = useActionState(saveCandidateMetadataAction, inicial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="tutorialId" value={tutorialId} />
      <ErrorAlert message={state.error} />
      {state.ok ? <SuccessAlert message="Guardado." /> : null}

      <Field label="Título de esta versión" name="title" defaultValue={title ?? ""}
        hint="Si se deja vacío se usa el nombre del tutorial." />
      <TextareaField label="Descripción" name="description" rows={3}
        defaultValue={description ?? ""}
        hint="Lo que se lee debajo del vídeo. Opcional." />
      <TextareaField label="Nota de cambio" name="changeNote" rows={2}
        defaultValue={changeNote ?? ""}
        hint="Por qué existe esta versión. Queda en la historia para siempre." />

      <Button type="submit" variant="quiet" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

/**
 * Publicar.
 *
 * Con confirmación explícita, porque cambia lo que ve la gente. No es
 * irreversible como una política legal —se puede retirar o publicar otra— pero
 * sí es inmediato y visible para todo el mundo.
 */
export function PublishVersionForm({
  tutorialId, versionId, versionNumber, hayVigente,
}: {
  tutorialId: string; versionId: string; versionNumber: number; hayVigente: boolean;
}) {
  const [state, action, pending] = useActionState(publishTutorialVersionAction, inicial);
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <div className="space-y-2">
        <ErrorAlert message={state.error} />
        <Button type="button" onClick={() => setConfirmando(true)}>
          Publicar la versión {versionNumber}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-loop/40 bg-loop/5 p-4">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="tutorialId" value={tutorialId} />
      <ErrorAlert message={state.error} />
      <p className="text-sm text-ink">
        {hayVigente
          ? <>Al publicar la versión {versionNumber}, la que se ve ahora pasa a
              histórica y <strong className="font-medium">todo el mundo verá esta</strong>.
              La anterior se conserva entera.</>
          : <>Al publicar, esta pantalla <strong className="font-medium">dejará de
              decir que el tutorial está en actualización</strong> y la gente verá
              este vídeo.</>}
      </p>
      <Field label="Nota de cambio" name="changeNote"
        placeholder="Por qué se publica esta versión"
        hint="Opcional, y queda en la historia." />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Publicando…" : "Sí, publicar"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * Volver a activar un tutorial retirado.
 *
 * Sin esto, retirar sería un callejón sin salida: la identidad de un tutorial es
 * única por pantalla, y esa unicidad no distingue activo de retirado. Lo
 * encontró una prueba, no una revisión.
 */
export function ReactivateTutorialForm({ tutorialId }: { tutorialId: string }) {
  const [state, action, pending] = useActionState(reactivateTutorialAction, inicial);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="tutorialId" value={tutorialId} />
      <ErrorAlert message={state.error} />
      <p className="text-sm text-ink-soft">
        Este tutorial está retirado: no se ve, y no se le pueden subir versiones.
        Volver a activarlo no publica nada — solo permite trabajar con él otra vez.
      </p>
      <Button type="submit" variant="quiet" disabled={pending}>
        {pending ? "Activando…" : "Volver a activar"}
      </Button>
    </form>
  );
}

/** Retirar: deja de verse. No borra nada. */
export function UnpublishTutorialForm({ tutorialId }: { tutorialId: string }) {
  const [state, action, pending] = useActionState(unpublishTutorialAction, inicial);
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <div className="space-y-2">
        <ErrorAlert message={state.error} />
        <Button type="button" variant="quiet" onClick={() => setConfirmando(true)}>
          Retirar el vídeo
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-hairline bg-paper p-4">
      <input type="hidden" name="tutorialId" value={tutorialId} />
      <ErrorAlert message={state.error} />
      <p className="text-sm text-ink">
        La pantalla volverá a decir que el tutorial está en actualización.
        <strong className="font-medium"> No se borra nada</strong>: la versión
        queda en la historia y se puede volver a usar.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="quiet" disabled={pending}>
          {pending ? "Retirando…" : "Sí, retirar"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * Usar nuevamente el vídeo de una versión anterior.
 *
 * Se llama así y no «reactivar esta versión», que insinuaría que la historia se
 * reescribe. Lo que ocurre es otra cosa: nace una versión NUEVA con el mismo
 * vídeo, y la historia dirá que ese vídeo se usó en dos tramos distintos.
 */
export function RestoreVersionForm({
  tutorialId, versionId, versionNumber, periodo,
}: {
  tutorialId: string; versionId: string; versionNumber: number; periodo: string;
}) {
  const [state, action, pending] = useActionState(restoreTutorialVersionAction, inicial);
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <div className="space-y-2">
        <ErrorAlert message={state.error} />
        <button type="button" onClick={() => setAbierto(true)}
          className="text-sm font-medium text-loop hover:underline">
          Usar nuevamente este vídeo
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-2 space-y-3 rounded-lg border border-hairline bg-paper p-4">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="tutorialId" value={tutorialId} />
      <ErrorAlert message={state.error} />
      <div className="space-y-1 text-sm text-ink-soft">
        <p><span className="font-medium text-ink">De dónde sale:</span> versión {versionNumber}, que estuvo publicada {periodo}.</p>
        <p><span className="font-medium text-ink">Qué va a pasar:</span> se crea una versión nueva con el mismo vídeo.</p>
        <p>
          <span className="font-medium text-ink">Lo que NO pasa:</span> el periodo
          de la versión {versionNumber} no se toca. La historia seguirá diciendo
          cuándo estuvo publicada, y añadirá cuándo se volvió a usar.
        </p>
        <p className="text-ink">La versión nueva nace <strong className="font-medium">sin publicar</strong>.</p>
      </div>
      <Field label="Nota de cambio" name="changeNote"
        placeholder="Por qué se vuelve a usar" hint="Opcional." />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear la versión nueva"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Descartar una candidata que nunca se publicó. */
export function DiscardCandidateForm({
  tutorialId, versionId, versionNumber,
}: { tutorialId: string; versionId: string; versionNumber: number }) {
  const [state, action, pending] = useActionState(discardCandidateAction, inicial);
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <div className="space-y-2">
        <ErrorAlert message={state.error} />
        <button type="button" onClick={() => setConfirmando(true)}
          className="text-sm text-ink-soft hover:text-ink hover:underline">
          Descartar
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-2 space-y-3 rounded-lg border border-hairline bg-paper p-4">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="tutorialId" value={tutorialId} />
      <ErrorAlert message={state.error} />
      <p className="text-sm text-ink">
        Se descarta la versión {versionNumber} y su archivo. Solo se puede porque
        <strong className="font-medium"> nunca se publicó</strong>: lo que llegó a
        verse no se descarta.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="quiet" disabled={pending}>
          {pending ? "Descartando…" : "Sí, descartar"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setConfirmando(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/**
 * La vista previa.
 *
 * `<video controls>` del navegador, sin librería: reproducir, pausar, adelantar,
 * volumen y pantalla completa vienen gratis, funcionan en móvil y son accesibles
 * por teclado desde el primer día.
 *
 * **Sin reproducción automática.** Un vídeo que arranca solo con sonido en una
 * oficina es una razón para cerrar la pestaña. La URL se pide al pulsar, no al
 * pintar la página: firmar cuesta, y una ficha con cinco versiones no debería
 * firmar cinco vídeos que nadie va a ver.
 */
export function VersionPreview({
  versionId, etiqueta,
}: { versionId: string; etiqueta: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  if (url) {
    return (
      <div className="space-y-2">
        <video
          controls
          preload="metadata"
          src={url}
          className="w-full max-w-2xl rounded-lg border border-hairline bg-black"
        >
          Tu navegador no puede reproducir este vídeo.
        </video>
        <p className="text-xs text-ink-soft">
          Vista previa de {etiqueta}. El enlace caduca en media hora.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ErrorAlert message={error} />
      <Button
        type="button" variant="quiet" disabled={cargando}
        onClick={async () => {
          setCargando(true); setError(null);
          const r = await previewTutorialVersionAction(versionId);
          setCargando(false);
          if (r.url) setUrl(r.url); else setError(r.error);
        }}
      >
        {cargando ? "Preparando…" : `Ver ${etiqueta}`}
      </Button>
    </div>
  );
}
