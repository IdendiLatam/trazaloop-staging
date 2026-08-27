"use client";

import { useState } from "react";
import { SectionHint } from "@/components/ui/section-hint";
import { QuickEditPanel } from "@/components/domain/documents/quick-edit";
import { ContextualReviewPanel } from "@/components/domain/documents/contextual-review";
import type { DocumentSectionRow } from "@/lib/db/trazadocs";
import type { ResolvedHint } from "@/lib/domain/hint-access";

/** Una sección dentro del editor (Parte 18): título, textarea, botón "i",
 *  indicador de obligatoria e indicador de contenido vacío. El nombre del
 *  campo (`section:<id>`) lo lee updateDocumentSectionsAction en bloque. */
export function SectionEditor({
  section,
  hint,
  readOnly,
  documentId,
  assistedWriting = false,
}: {
  section: DocumentSectionRow;
  /** Hint YA AUTORIZADO en servidor (Demo recibe solo el aviso fijo). */
  hint: ResolvedHint | null;
  readOnly: boolean;
  /** QUALITY-12.2C · Hace falta para pedir asistencia de redacción. */
  documentId?: string;
  /** ¿Se ofrece «Mejorar con Intelligence»? Lo decide el servidor: depende del
   *  plan del módulo del documento, y aquí no se resuelve nada. */
  assistedWriting?: boolean;
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
        value={value}
        onChange={(e) => setValue(e.target.value)}
        readOnly={readOnly}
        rows={5}
        className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-70"
        disabled={readOnly}
        placeholder={readOnly ? "" : "Escribe el contenido de esta sección…"}
      />

      {/* QUALITY-12.2C · La asistencia solo aparece si se puede editar: sobre
          una revisión aprobada en modo lectura no se ofrece un botón que
          insinúe que se puede cambiar algo. */}
      {assistedWriting && documentId && !readOnly ? (
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <QuickEditPanel
            documentId={documentId}
            sectionId={section.id}
            currentText={value}
            onReplace={setValue}
            disabled={readOnly}
          />
          {/* QUALITY-12.2D · La otra pregunta. Va al lado y no dentro: mejorar
              la redacción y contrastar con lo registrado son dos cosas
              distintas, y mezclar sus respuestas haría leer un hallazgo como
              si fuera una propuesta de texto. */}
          <ContextualReviewPanel
            documentId={documentId}
            sectionId={section.id}
            currentText={value}
            onApply={setValue}
            disabled={readOnly}
          />
        </div>
      ) : null}
    </div>
  );
}
