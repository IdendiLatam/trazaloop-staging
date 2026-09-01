"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Trazaloop · PE-03B4 · El diálogo y el reproductor, UNA sola vez.
 *
 *
 * POR QUÉ ESTE FICHERO EXISTE
 *
 * PE-03B3 escribió el diálogo del tutorial de pantalla: la trampa de foco, el
 * Escape, la vuelta del foco al cerrar, el `<video>` sin reproducción
 * automática y la renovación de la URL firmada conservando el segundo.
 *
 * PE-03B4 necesita exactamente eso para el vídeo de bienvenida. Copiarlo habría
 * dado dos reproductores que se parecen hasta que uno de los dos se arregla, y
 * el encargo lo dice con todas las letras: no crear una segunda implementación.
 *
 * Así que lo de B3 sale aquí sin cambiar de comportamiento, y los dos sitios lo
 * usan. Lo que cambia entre ellos —qué se firma, qué botones hay abajo— se pasa
 * por parámetro.
 */

// ===========================================================================
// EL DIÁLOGO
// ===========================================================================

/**
 * Un diálogo accesible: modal, con Escape, con el foco atrapado dentro y
 * devuelto a donde estaba al cerrarse.
 *
 * Perder el foco al cerrar deja a quien navega con teclado al principio de la
 * página, sin señal de qué acaba de pasar.
 */
export function TutorialDialogShell({
  label, onClose, children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const devolverFoco = useRef<Element | null>(null);

  useEffect(() => {
    devolverFoco.current = document.activeElement;
    return () => {
      (devolverFoco.current as HTMLElement | null)?.focus?.();
    };
  }, []);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={contenedor}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-hairline bg-surface p-5 shadow-lg"
      >
        {children}
      </div>
    </div>
  );
}

// ===========================================================================
// EL REPRODUCTOR
// ===========================================================================

/**
 * El `<video>` y su renovación.
 *
 * SIN REPRODUCCIÓN AUTOMÁTICA. Un vídeo que arranca solo con sonido en una
 * oficina se cierra, no se ve. Vale para el tutorial de pantalla y vale para la
 * bienvenida: que sea lo primero que uno ve no lo convierte en algo que deba
 * sonar sin permiso.
 *
 * RENOVAR NO ES ALARGAR. El plazo de la URL firmada es de SEGURIDAD. Cuando
 * está por vencer se pide otra del **mismo objeto inmutable**, se anota en qué
 * segundo iba, se sustituye la fuente y se vuelve a ese segundo. Lo que NO se
 * hace es subir el plazo a un número enorme para no tener que escribir esto.
 */
export function TutorialPlayer({
  url, expiresInSeconds, onRenew,
}: {
  url: string;
  expiresInSeconds: number;
  /** Pide otra URL del mismo vídeo. Devuelve null si no se pudo. */
  onRenew: () => Promise<string | null>;
}) {
  const video = useRef<HTMLVideoElement>(null);

  const renovar = useCallback(async () => {
    const el = video.current;
    const segundo = el?.currentTime ?? 0;
    const reproduciendo = el ? !el.paused && !el.ended : false;
    const volumen = el?.volume ?? 1;

    const nueva = await onRenew();
    if (!nueva || !el) return false;

    el.src = nueva;
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
  }, [onRenew]);

  // Se renueva un poco antes de vencer, no al vencer: si se espera al fallo, la
  // persona ve un error antes de que llegue la URL nueva.
  useEffect(() => {
    const margen = Math.max(30, Math.floor(expiresInSeconds * 0.1));
    const cuando = Math.max(5, expiresInSeconds - margen) * 1000;
    const t = setTimeout(() => { void renovar(); }, cuando);
    return () => clearTimeout(t);
  }, [expiresInSeconds, renovar]);

  return (
    <video
      ref={video}
      controls
      preload="metadata"
      src={url}
      className="w-full rounded-lg border border-hairline bg-black"
    >
      Tu navegador no puede reproducir este vídeo.
    </video>
  );
}

/**
 * El estado abierto/cerrado, derivado en vez de apagado con un efecto.
 *
 * Se guarda EN QUÉ pantalla se abrió, no un simple «está abierto». Así, cambiar
 * de pantalla lo cierra solo: la comparación se hace al pintar. La primera
 * versión usaba `useEffect(() => setAbierto(false), [clave])`, y React avisa de
 * eso con razón — es un cambio de estado en cascada para algo que se deriva.
 */
export function useDialogOpenFor(clave: string | null) {
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  return {
    abierto: clave !== null && abiertoEn === clave,
    abrir: () => setAbiertoEn(clave),
    cerrar: () => setAbiertoEn(null),
  };
}
