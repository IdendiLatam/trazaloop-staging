"use client";

import { useEffect, useRef, useState } from "react";
import { HintText } from "@/components/ui/hint-text";
import { hasHintContent } from "@/lib/domain/hint-links";

/**
 * Trazaloop · Sprint T9G · Botón "i" COMPARTIDO de tips/hints. Un solo
 * componente para TrazaDocs CPR (Parte 5/18) y TrazaDocs Textiles: mismo
 * icono, tamaño, posición, estilos, apertura/cierre y accesibilidad.
 *
 * - `type="button"`: jamás envía el formulario donde vive.
 * - Sin contenido no renderiza nada: ni botón, ni panel vacío, ni error.
 * - Accesible: operable con teclado, foco visible, `aria-expanded`,
 *   `aria-label="Más información"`, cierre con Escape y cierre visible.
 * - Contenido largo: el panel permite desplazamiento (max-h + overflow).
 * - El contenido pasa por el renderizador seguro compartido (HintText):
 *   admite saltos de línea y enlaces seguros; nunca interpreta HTML.
 */
export function SectionHint({ hint }: { hint: string | null }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!hasHintContent(hint)) return null;

  return (
    <div className="inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Más información"
        title="Más información"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-loop/40 text-[11px] font-semibold text-loop hover:bg-loop/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
      >
        i
      </button>
      {open ? (
        <div className="mt-1.5 max-w-xl rounded-md border border-loop/20 bg-loop/5 px-3 py-2">
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs text-ink-soft">
            <HintText text={hint as string} />
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
            className="mt-1.5 text-[11px] font-medium text-loop hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
          >
            Cerrar
          </button>
        </div>
      ) : null}
    </div>
  );
}
