"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getWelcomeForUserAction, renewWelcomePlaybackAction, suppressWelcomeVideoAction,
  type WelcomeForUser,
} from "@/server/actions/welcome";
import {
  TutorialDialogShell, TutorialPlayer,
} from "@/components/domain/tutorials/tutorial-player";

/**
 * Trazaloop · PE-03B4 · El vídeo de bienvenida.
 *
 *
 * DÓNDE APARECE, Y POR QUÉ SOLO AHÍ
 *
 * En la puerta —`/modules`—, que es la primera pantalla normal después de
 * entrar. Y en ninguna otra: un modal de bienvenida montado en cada pantalla de
 * cada módulo reaparecería al navegar, que es la forma de convertir un saludo
 * en una molestia.
 *
 * Las puertas obligatorias van antes y esto no las toca. `/modules` ya exige
 * sesión y aceptación legal antes de pintar nada, y este componente solo se
 * monta si además hay empresa activa. Un vídeo encima de un texto legal que hay
 * que aceptar competiría con el texto; encima del selector de empresa
 * escondería el único paso que quedaba.
 *
 *
 * LAS DOS FORMAS DE CERRARLO NO SIGNIFICAN LO MISMO
 *
 *   «Cerrar»               → por hoy. Puede volver a salir en otra sesión.
 *   «No volver a mostrar»  → nunca más, aunque se publique otra versión.
 *
 * La primera no escribe en la base: sería convertir «ahora no» en «nunca», y
 * son dos respuestas distintas. Se recuerda en una cookie de SESIÓN —sin fecha
 * de caducidad, así que muere al cerrar el navegador— y va marcada con el
 * identificador de la persona, para que la decisión de quien usó este ordenador
 * antes no se aplique a quien entra después.
 *
 * Se usa una cookie y no `sessionStorage` porque `sessionStorage` es por
 * pestaña: abrir una segunda pestaña habría vuelto a enseñar el vídeo dentro de
 * la misma sesión.
 *
 * La segunda sí se guarda, y 0161 la hace irreversible: no hay política de
 * DELETE, así que nadie —tampoco un superadministrador— puede reiniciarla.
 *
 *
 * SI ALGO FALLA, NO PASA NADA
 *
 * No hay estado de avería, y es deliberado. Si no hay vídeo publicado, si no se
 * pudo firmar o si no se pudo leer la preferencia, este componente no pinta
 * nada y la persona sigue trabajando. La bienvenida es acompañamiento, no una
 * puerta: fallar aquí no puede impedir entrar a Trazaloop.
 */

const COOKIE = "tl_welcome_off";

function cerradoEstaSesion(userId: string): boolean {
  try {
    return document.cookie.split("; ").some((c) => c === `${COOKIE}=${userId}`);
  } catch {
    // Un navegador que no deja leer cookies no es motivo para no saludar.
    return false;
  }
}

function marcarCerradoEstaSesion(userId: string) {
  try {
    // Sin `max-age` ni `expires`: es una cookie de sesión y desaparece al
    // cerrar el navegador. `SameSite=Lax` porque no tiene que viajar a nadie.
    document.cookie = `${COOKIE}=${userId}; path=/; SameSite=Lax`;
  } catch {
    // Si no se puede recordar, volverá a salir. Es el fallo barato.
  }
}

export function WelcomeVideo({ userId }: { userId: string }) {
  const [estado, setEstado] = useState<WelcomeForUser | { status: "loading" }>(
    { status: "loading" });
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    // Si ya se cerró en esta sesión, NO SE PREGUNTA NADA: ni se consulta la
    // preferencia ni se firma una URL. Y se sale sin tocar el estado —React
    // avisa, con razón, de un cambio de estado síncrono dentro de un efecto—:
    // `estado` se queda como estaba y este componente no pinta nada, que es
    // justo lo que se quería.
    //
    // La cookie se lee aquí y no al pintar: leerla durante el render daría un
    // resultado distinto en el servidor y en el navegador.
    if (cerradoEstaSesion(userId)) return;
    let vivo = true;
    void getWelcomeForUserAction().then((r) => { if (vivo) setEstado(r); });
    return () => { vivo = false; };
  }, [userId]);

  const renovar = useCallback(async () => {
    const r = await renewWelcomePlaybackAction();
    return r.url;
  }, []);

  const cerrarPorAhora = useCallback(() => {
    marcarCerradoEstaSesion(userId);
    setCerrado(true);
  }, [userId]);

  const noVolverAMostrar = useCallback(async () => {
    // Se cierra primero. Si la escritura fallara, volvería a salir en otra
    // sesión — molesto, pero honesto: lo que no puede pasar es que la pantalla
    // diga que se guardó algo que no se guardó.
    setCerrado(true);
    await suppressWelcomeVideoAction();
  }, []);

  if (cerrado || estado.status !== "ready") return null;

  return (
    <TutorialDialogShell label="Vídeo de bienvenida a Trazaloop" onClose={cerrarPorAhora}>
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-ink">{estado.title}</h2>
        <button
          type="button" onClick={cerrarPorAhora} autoFocus
          className="shrink-0 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium hover:border-loop"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <TutorialPlayer
          url={estado.url}
          expiresInSeconds={estado.expiresInSeconds}
          onRenew={renovar}
        />
        {estado.description ? (
          <p className="text-sm text-ink-soft">{estado.description}</p>
        ) : null}

        {/* Las dos salidas, y se distinguen. «Cerrar» es la de arriba y es la
            normal; esta se lee como lo que es, una decisión definitiva. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
          {/* Se dice lo que hace el botón, y no se suaviza: no hay pantalla
              para deshacerlo, y la base tampoco lo permite. Prometer que se
              puede recuperar sería mentir. */}
          <p className="text-xs text-ink-soft">
            Si eliges no volver a mostrarlo, no aparecerá más — tampoco cuando se
            publique una versión nueva.
          </p>
          <button
            type="button"
            onClick={() => { void noVolverAMostrar(); }}
            className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink-soft hover:border-loop hover:text-ink"
          >
            No volver a mostrar
          </button>
        </div>
      </div>
    </TutorialDialogShell>
  );
}
