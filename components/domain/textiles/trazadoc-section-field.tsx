"use client";

import { useState } from "react";
import { QuickEditPanel } from "@/components/domain/documents/quick-edit";

/**
 * Trazaloop · QUALITY-12.2C · El campo de una sección textil, con asistencia.
 *
 * Existe porque el editor textil no usa el `SectionEditor` compartido: tiene su
 * propio `textarea` con las transiciones de estado alrededor. En vez de
 * duplicar el panel de asistencia, se extrae el campo y se reutiliza el mismo
 * componente que CPR y Quality. Un solo motor, tres editores.
 *
 * El `textarea` pasa a ser controlado para que «Reemplazar» pueda escribir en
 * él. El `name` no cambia: la acción de guardado sigue leyendo `section:<id>`.
 */
export function TextileSectionField({
  sectionId, documentId, content, assistedWriting,
}: {
  sectionId: string;
  documentId: string;
  content: string;
  assistedWriting: boolean;
}) {
  const [value, setValue] = useState(content);

  return (
    <div className="space-y-2">
      <textarea
        id={`section-${sectionId}`}
        name={`section:${sectionId}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-hairline bg-paper p-2 text-sm"
      />
      {assistedWriting ? (
        <QuickEditPanel
          documentId={documentId}
          sectionId={sectionId}
          currentText={value}
          onReplace={setValue}
          disabled={false}
        />
      ) : null}
    </div>
  );
}
