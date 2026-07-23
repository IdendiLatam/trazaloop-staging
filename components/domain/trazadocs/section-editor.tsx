"use client";

import { useState } from "react";
import { SectionHint } from "@/components/ui/section-hint";
import type { DocumentSectionRow } from "@/lib/db/trazadocs";

/** Una sección dentro del editor (Parte 18): título, textarea, botón "i",
 *  indicador de obligatoria e indicador de contenido vacío. El nombre del
 *  campo (`section:<id>`) lo lee updateDocumentSectionsAction en bloque. */
export function SectionEditor({
  section,
  hint,
  readOnly,
}: {
  section: DocumentSectionRow;
  hint: string | null;
  readOnly: boolean;
}) {
  const [value, setValue] = useState(section.content);
  const isEmpty = value.trim().length === 0;

  return (
    <div className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{section.title}</h3>
        {section.isRequired ? (
          <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[11px] font-medium text-amber">
            Obligatoria
          </span>
        ) : (
          <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[11px] text-ink-soft">
            Sugerida
          </span>
        )}
        {isEmpty ? (
          <span className="text-[11px] text-ink-soft">Sin diligenciar</span>
        ) : (
          <span className="text-[11px] text-loop-deep">Diligenciada</span>
        )}
        <SectionHint hint={hint} />
      </div>
      <textarea
        name={`section:${section.id}`}
        defaultValue={section.content}
        onChange={(e) => setValue(e.target.value)}
        readOnly={readOnly}
        rows={5}
        className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
        disabled={readOnly}
        placeholder={readOnly ? "" : "Escribe el contenido de esta sección…"}
      />
    </div>
  );
}
