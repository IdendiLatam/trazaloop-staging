"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PublicNavItem } from "@/components/layout/public-shell";

/**
 * Trazaloop · COMMERCIAL-UX-01C · El menú público en pantalla pequeña.
 *
 *
 * POR QUÉ NO SE INSTALA NADA
 *
 * Un menú desplegable accesible son tres cosas: decir qué controla, cerrarse
 * con Escape y devolver el foco a donde estaba. Eso cabe aquí. Traerse una
 * librería de navegación para esto añadiría peso al arranque de una página
 * pública —la primera que carga alguien que aún no es cliente— a cambio de
 * nada.
 *
 *
 * LAS TRES COSAS, Y POR QUÉ CADA UNA
 *
 *   · `aria-expanded` y `aria-controls`: sin ellos, quien no ve la pantalla
 *     pulsa un botón y no sabe si ha pasado algo.
 *
 *   · Escape cierra: es lo que todo el mundo intenta primero. Si no cierra, la
 *     única salida es acertar con el dedo fuera del panel.
 *
 *   · El foco vuelve al botón al cerrar: si no, vuelve al principio del
 *     documento y hay que recorrer la página otra vez.
 *
 * El panel no se esconde con CSS estando en el árbol: se desmonta. Un enlace
 * invisible pero enfocable deja el tabulador cayendo en sitios que no se ven,
 * que es de los fallos de accesibilidad más difíciles de notar mirando.
 */
export function PublicMobileNav({
  items, entryHref = "/login", entryLabel = "Iniciar sesión",
}: {
  items: readonly PublicNavItem[];
  entryHref?: string;
  entryLabel?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [abierto]);

  const cerrar = () => setAbierto(false);

  return (
    <div className="md:hidden">
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="menu-publico"
        aria-label={abierto ? "Cerrar el menú" : "Abrir el menú"}
        className="rounded-md border border-hairline px-3 py-2 text-sm text-ink-soft
                   hover:text-loop focus-visible:outline focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-loop"
      >
        <span aria-hidden="true">{abierto ? "✕" : "☰"}</span>
      </button>

      {abierto ? (
        <div
          id="menu-publico"
          className="absolute left-0 right-0 z-40 border-b border-hairline bg-paper
                     px-6 pb-4 shadow-sm"
        >
          <nav aria-label="Principal">
            <ul className="flex flex-col py-2">
              {items.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={cerrar}
                    aria-current={i.current ? "page" : undefined}
                    className={`block rounded-md px-2 py-3 text-sm
                                focus-visible:outline focus-visible:outline-2
                                focus-visible:outline-offset-2 focus-visible:outline-loop
                                ${i.current
                                  ? "font-semibold text-loop"
                                  : "text-ink-soft hover:text-loop"}`}
                  >
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Link
            href={entryHref}
            onClick={cerrar}
            className="mt-1 block rounded-md bg-loop px-4 py-2 text-center text-sm
                       font-semibold text-white hover:bg-loop-deep
                       focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-2 focus-visible:outline-loop"
          >
            {entryLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
