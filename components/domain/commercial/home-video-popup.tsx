"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TutorialDialogShell, TutorialPlayer,
} from "@/components/domain/tutorials/tutorial-player";
import { requestPublicHomeVideoAction } from "@/server/actions/public-home-video";
import {
  publicVideoDismissKey, type PublicHomeVideoIdentity,
} from "@/lib/domain/public-video-dismiss";

/**
 * Trazaloop · COMMERCIAL-UX-01E · El vídeo de la portada.
 *
 *
 * LAS DOS RESPUESTAS NO SIGNIFICAN LO MISMO
 *
 *   «Cerrar»              → ahora no. Puede volver a salir en otra visita.
 *   «No volver a mostrar» → no me enseñes ESTE vídeo nunca más.
 *
 * La primera no persiste nada, y es deliberado: convertir «ahora no» en «nunca»
 * es responder por alguien. La segunda sí persiste, pero atada a la IDENTIDAD
 * del contenido —tutorial + versión—, no a un interruptor global.
 *
 * Esa diferencia es el defecto concreto que este componente no repite. El vídeo
 * de bienvenida de dentro del producto usa `welcome_video_suppressed`, un
 * booleano que significa «nunca más, aunque se publique otra cosa». Para un
 * saludo interno pase; para la portada sería condenar todo contenido futuro por
 * una decisión que alguien tomó sobre un vídeo que ya no existe.
 *
 * Con la clave atada a la versión, publicar la v2 hace que vuelva a aparecer
 * sin que nadie tenga que limpiar nada. Y cambiar a otro tutorial, también.
 *
 *
 * ANÓNIMO Y AUTENTICADO USAN LO MISMO, Y ESTÁ DECIDIDO
 *
 * `localStorage`, para los dos. La alternativa —guardar la preferencia en el
 * servidor para quien tiene sesión— habría necesitado una tabla, una acción,
 * una migración y una política, para recordar que alguien no quiere ver un
 * vídeo de marketing en su navegador.
 *
 * Y habría dado un resultado PEOR: la mitad de quien abre la portada no tiene
 * sesión, así que el mecanismo local hay que escribirlo igualmente. Tener dos
 * es tener uno que se prueba y otro que no.
 *
 * La clave no lleva correo, ni identificador de persona, ni empresa: solo los
 * dos identificadores del contenido, que son públicos de todos modos.
 *
 *
 * LOS BYTES SE PIDEN TARDE
 *
 * La portada solo trae la IDENTIDAD del vídeo, que es una fila. La URL firmada
 * se pide cuando el modal ya ha decidido abrirse — así quien lo descartó no
 * descarga un vídeo, y la portada no espera por él para pintarse.
 */
export function HomeVideoPopup({ video }: { video: PublicHomeVideoIdentity }) {
  // Arranca CERRADO y no se abre hasta haber mirado `localStorage`. Al revés
  // —abrir y cerrar si estaba descartado— daría un parpadeo del modal a quien
  // justamente pidió no verlo.
  const [abierto, setAbierto] = useState(false);
  const [medio, setMedio] = useState<
    { url: string; expiresInSeconds: number } | null>(null);
  const [fallo, setFallo] = useState(false);

  const clave = publicVideoDismissKey(video);

  useEffect(() => {
    let vivo = true;
    try {
      if (window.localStorage.getItem(clave) === "1") return;
    } catch {
      // Navegación privada, almacenamiento lleno o bloqueado por política. Se
      // enseña el vídeo: el modo prudente aquí es el que NO pierde la decisión
      // de nadie, porque no había ninguna guardada que perder.
    }
    void (async () => {
      const r = await requestPublicHomeVideoAction();
      if (!vivo) return;
      if (r.url === null) { setFallo(true); return; }
      setMedio({ url: r.url, expiresInSeconds: r.expiresInSeconds });
      setAbierto(true);
    })();
    return () => { vivo = false; };
  }, [clave]);

  const cerrar = useCallback(() => setAbierto(false), []);

  const noMostrarMas = useCallback(() => {
    try {
      window.localStorage.setItem(clave, "1");
    } catch {
      // Si no se puede guardar, al menos se cierra. Peor sería no cerrar.
    }
    setAbierto(false);
  }, [clave]);

  const renovar = useCallback(async () => {
    const r = await requestPublicHomeVideoAction();
    return r.url;
  }, []);

  // Si el medio no se pudo servir, la portada sigue siendo la portada. Un vídeo
  // de presentación que falla no puede llevarse por delante la página.
  if (!abierto || medio === null || fallo) return null;

  return (
    <TutorialDialogShell label={video.title} onClose={cerrar}>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-ink">{video.title}</h2>
          <button
            type="button"
            onClick={cerrar}
            className="shrink-0 rounded-md border border-hairline px-3 py-1.5
                       text-sm text-ink-soft hover:text-loop focus-visible:outline
                       focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-loop"
          >
            Cerrar
          </button>
        </div>

        {video.description ? (
          <p className="text-sm text-ink-soft">{video.description}</p>
        ) : null}

        <TutorialPlayer
          url={medio.url}
          expiresInSeconds={medio.expiresInSeconds}
          onRenew={renovar}
        />

        {/* Un botón, no una casilla. Una casilla que hay que marcar ANTES de
            cerrar obliga a entender el orden; esto es una respuesta directa. */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={noMostrarMas}
            className="rounded-md px-3 py-1.5 text-sm text-ink-soft underline
                       hover:text-loop focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-2 focus-visible:outline-loop"
          >
            No volver a mostrar
          </button>
        </div>
      </div>
    </TutorialDialogShell>
  );
}
