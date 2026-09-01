"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import {
  getTutorialForPageAction, renewTutorialPlaybackAction,
  type TutorialForPage,
} from "@/server/actions/tutorials";
import { resolvePageKeyForPath } from "@/lib/modules/page-keys";
import { TUTORIAL_UNAVAILABLE_MESSAGE } from "@/lib/domain/tutorial-media";

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
  const pageKey = resolvePageKeyForPath(pathname);
  // Se guarda EN QUÉ pantalla se abrió, no un simple «está abierto».
  //
  // Así, cambiar de pantalla lo cierra solo: la comparación se hace al pintar y
  // no hace falta un efecto que lo apague. La primera versión usaba
  // `useEffect(() => setAbierto(false), [pathname])`, y React avisa de eso con
  // razón — es un cambio de estado en cascada para algo que se puede derivar.
  //
  // Sin esto, quien navega con el tutorial abierto se quedaría viendo el de la
  // pantalla anterior.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const abierto = abiertoEn === pathname;

  // En una pantalla que no admite tutorial, el botón no existe. No está
  // deshabilitado ni oculto por CSS: no se pinta.
  if (!pageKey) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbiertoEn(pathname)}
        className="text-sm font-medium text-ink-soft hover:text-loop hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
      >
        Ver video tutorial
      </button>
      {abierto ? (
        <TutorialDialog pageKey={pageKey} onClose={() => setAbiertoEn(null)} />
      ) : null}
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
  const contenedor = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const devolverFoco = useRef<Element | null>(null);

  useEffect(() => {
    devolverFoco.current = document.activeElement;
    let vivo = true;
    void getTutorialForPageAction(pageKey).then((r) => { if (vivo) setEstado(r); });
    return () => {
      vivo = false;
      // El foco vuelve a donde estaba. Perderlo deja a quien navega con teclado
      // al principio de la página, sin señal de qué acaba de pasar.
      (devolverFoco.current as HTMLElement | null)?.focus?.();
    };
  }, [pageKey]);

  // Escape cierra. Y el foco no se escapa del diálogo mientras está abierto.
  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !contenedor.current) return;
      const focos = contenedor.current.querySelectorAll<HTMLElement>(
        'button, [href], video, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focos.length === 0) return;
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault(); ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault(); primero.focus();
      }
    }
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [onClose]);

  /**
   * Renovar la autorización sin volver al principio.
   *
   * El plazo de la URL firmada es de SEGURIDAD, no de duración de vídeo. Cuando
   * está por vencer se pide otra del **mismo objeto inmutable**, se anota en qué
   * segundo iba, se sustituye la fuente y se vuelve a ese segundo.
   *
   * Lo que NO se hace es subir el plazo a un número enorme: eso dejaría el
   * enlace vivo un día entero para no tener que escribir esto.
   */
  const renovar = useCallback(async () => {
    const el = video.current;
    const segundo = el?.currentTime ?? 0;
    const reproduciendo = el ? !el.paused && !el.ended : false;
    const volumen = el?.volume ?? 1;

    const r = await renewTutorialPlaybackAction(pageKey);
    if (!r.url || !el) return false;

    el.src = r.url;
    // `load()` descarta lo que tenía almacenado; hay que volver al segundo
    // DESPUÉS de que los metadatos estén, o el navegador lo ignora.
    el.load();
    await new Promise<void>((resolver) => {
      const listo = () => { el.removeEventListener("loadedmetadata", listo); resolver(); };
      el.addEventListener("loadedmetadata", listo);
    });
    el.currentTime = segundo;
    el.volume = volumen;
    if (reproduciendo) { void el.play().catch(() => { /* el navegador decide */ }); }
    return true;
  }, [pageKey]);

  // Se renueva un poco antes de vencer, no al vencer: si se espera al fallo, la
  // persona ve un error antes de que llegue la URL nueva.
  useEffect(() => {
    if (estado.status !== "ready") return;
    const margen = Math.max(30, Math.floor(estado.expiresInSeconds * 0.1));
    const cuando = Math.max(5, estado.expiresInSeconds - margen) * 1000;
    const t = setTimeout(() => { void renovar(); }, cuando);
    return () => clearTimeout(t);
  }, [estado, renovar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={contenedor}
        role="dialog"
        aria-modal="true"
        aria-label="Vídeo tutorial de esta pantalla"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-hairline bg-surface p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold text-ink">
            {estado.status === "ready" ? estado.title : "Vídeo tutorial"}
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
          ) : (
            <div className="space-y-3">
              {/* Controles del navegador, sin librería y SIN reproducción
                  automática: un vídeo que arranca solo con sonido en una oficina
                  se cierra, no se ve. */}
              <video
                ref={video}
                controls
                preload="metadata"
                src={estado.url}
                className="w-full rounded-lg border border-hairline bg-black"
              >
                Tu navegador no puede reproducir este vídeo.
              </video>
              {estado.description ? (
                <p className="text-sm text-ink-soft">{estado.description}</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
