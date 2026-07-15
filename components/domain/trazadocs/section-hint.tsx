"use client";

import { useState } from "react";

/** Botón "i" con el tip/hint de la sección (Parte 5, Parte 18). Bloque
 *  desplegable simple — sin librerías nuevas de tooltip/popover. */
export function SectionHint({ hint }: { hint: string | null }) {
  const [open, setOpen] = useState(false);
  if (!hint) return null;

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Ver ayuda para esta sección"
        title="Ver ayuda para esta sección"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-loop/40 text-[11px] font-semibold text-loop hover:bg-loop/10"
      >
        i
      </button>
      {open ? (
        <p className="mt-1.5 max-w-xl rounded-md border border-loop/20 bg-loop/5 px-3 py-2 text-xs text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
