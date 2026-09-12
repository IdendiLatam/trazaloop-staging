"use client";

import Link from "next/link";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import {
  getTutorialForPageAction, renewTutorialPlaybackAction,
  type TutorialForPage,
} from "@/server/actions/tutorials";
import { resolvePageKeyForPath } from "@/lib/modules/page-keys";
import { TUTORIAL_UNAVAILABLE_MESSAGE } from "@/lib/domain/tutorial-media";
import {
  TutorialDialogShell, TutorialPlayer, useDialogOpenFor,
} from "@/components/domain/tutorials/tutorial-player";

/**
 * Trazaloop · PE-03B3 · «Ver video tutorial», en la barra superior.
 *
 *
 * POR QUÉ AQUÍ Y NO EN 147 CABECERAS
 *
 * PE-03A encontró que no existe ningún componente de cabecera compartido: cada
 * una de las 147 páginas del shell escribe la suya a mano. Poner el botón ahí
 * significaría tocar 147 ficheros — y que la 148 naciera sin él.
 *
 * La barra superior ya tiene el sitio, y PE-02B4 lo dejó reservado por escrito
 * cuando puso «Ayuda»: «PE-03 sumará el tutorial de la pantalla al mismo sitio».
 *
 *
 * LA RUTA SIRVE PARA SABER DÓNDE ESTAMOS, NO PARA IDENTIFICAR EL TUTORIAL
 *
 * Es la distinción que PE-02 congeló. Este componente mira `usePathname()` para
 * averiguar en qué pantalla está, y consulta el registro para saber qué CLAVE le
 * corresponde. La identidad del tutorial sigue siendo la clave.
 *
 * Si mañana una pantalla cambia de dirección, se actualiza su `route` en el
 * registro y el tutorial no se entera: misma clave, mismas versiones, misma
 * historia.
 *
 *
 * NO SE FIRMA NADA AL PINTAR
 *
 * El botón aparece siempre en una pantalla registrada, tenga vídeo o no. Lo que
 * NO hace es preguntar por el vídeo: eso ocurre al pulsarlo. Una pantalla que
 * nadie abre no gasta ni una consulta ni una firma.
 */
export function PageTutorialAction() {
  const pathname = usePathname() ?? "";
  // PE-03B4 · Los parámetros hacen falta para DOS pantallas del producto entero:
  // `/quality/risks?vista=` y `/traceability/inventory?vista=`, donde dos
  // superficies funcionales distintas comparten dirección. En las demás no
  // cambian nada — y por eso no se inventó una ruta falsa para que el tutorial
  // pudiera distinguirlas: se enseñó al resolutor a mirar el parámetro.
  const searchParams = useSearchParams();
  const pageKey = resolvePageKeyForPath(pathname, searchParams);

  // Se compara con la CLAVE, no con la ruta: en las dos pantallas con pestañas
  // cambiar de pestaña no cambia el `pathname`, y el diálogo se habría quedado
  // enseñando el tutorial de los riesgos encima de las oportunidades.
  const { abierto, abrir, cerrar } = useDialogOpenFor(pageKey);

  // En una pantalla que no admite tutorial, el botón no existe. No está
  // deshabilitado ni oculto por CSS: no se pinta.
  if (!pageKey) return null;

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="text-sm font-medium text-ink-soft hover:text-loop hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
      >
        Ver video tutorial
      </button>
      {abierto ? <TutorialDialog pageKey={pageKey} onClose={cerrar} /> : null}
    </>
  );
}

/**
 * El diálogo.
 *
 * Se monta al pulsar, así que su carga —y su firma— ocurren entonces. Al
 * desmontarse, el vídeo se va con él y la URL firmada deja de usarse.
 */
function TutorialDialog({
  pageKey, onClose,
}: { pageKey: string; onClose: () => void }) {
  const [estado, setEstado] = useState<TutorialForPage | { status: "loading" }>(
    { status: "loading" });

  useEffect(() => {
    let vivo = true;
    void getTutorialForPageAction(pageKey).then((r) => { if (vivo) setEstado(r); });
    return () => { vivo = false; };
  }, [pageKey]);

  const renovar = useCallback(async () => {
    const r = await renewTutorialPlaybackAction(pageKey);
    return r.url;
  }, [pageKey]);

  return (
    <TutorialDialogShell label="Vídeo tutorial de esta pantalla" onClose={onClose}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-ink">
          {estado.status === "ready" || estado.status === "plan_required"
            ? estado.title : "Vídeo tutorial"}
        </h2>
        <button
          type="button" onClick={onClose} autoFocus
          className="shrink-0 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium hover:border-loop"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-4">
        {estado.status === "loading" ? (
          <p role="status" className="text-sm text-ink-soft">Preparando el vídeo…</p>
        ) : estado.status === "no_video" ? (
          <p role="status" className="text-sm text-ink">
            {TUTORIAL_UNAVAILABLE_MESSAGE}
          </p>
        ) : estado.status === "unavailable" ? (
          <p role="status" className="text-sm text-ink">{estado.message}</p>
        ) : estado.status === "plan_required" ? (
          /* PROD-LAUNCH-01B.1 · El tutorial existe y no está incluido.
             Se muestra la oferta AQUÍ, dentro del diálogo que la persona
             acaba de abrir: el botón de la barra no se esconde nunca, porque
             quien no sabe que el tutorial existe no lo echa de menos. */
          <div className="space-y-3">
            <p role="status" className="text-sm text-ink">{estado.body}</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/settings/billing"
                className="inline-flex items-center rounded-md bg-loop px-4 py-2 text-sm font-medium text-paper hover:opacity-90"
              >
                {estado.ctaLabel}
              </Link>
              <button
                type="button" onClick={onClose}
                className="inline-flex items-center rounded-md border border-hairline bg-paper px-4 py-2 text-sm font-medium hover:border-loop"
              >
                {estado.dismissLabel}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Controles del navegador, sin librería y SIN reproducción
                automática. El reproductor y su renovación son los mismos que
                usa la bienvenida: ver `tutorial-player.tsx`. */}
            <TutorialPlayer
              url={estado.url}
              expiresInSeconds={estado.expiresInSeconds}
              onRenew={renovar}
            />
            {estado.description ? (
              <p className="text-sm text-ink-soft">{estado.description}</p>
            ) : null}
          </div>
        )}
      </div>
    </TutorialDialogShell>
  );
}
