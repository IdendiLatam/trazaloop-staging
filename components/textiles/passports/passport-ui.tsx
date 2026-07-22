// Trazaloop · Sprint T9C (Textil) · Componentes de presentación del pasaporte
// técnico textil. Server components puros (sin estado): leen el snapshot ya
// generado y lo muestran. Las acciones (generar/transición) viven en el
// componente cliente aparte. No exponen signed URLs ni rutas de storage.

import {
  TEXTILE_PASSPORT_COMPLETENESS_LABEL,
  TEXTILE_PASSPORT_COMPLETENESS_TONE,
  type TextilePassportCompleteness,
} from "@/lib/domain/textiles-passport";

/** Badge genérico con tono del sistema. */
export function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      {children}
    </span>
  );
}

/** Badge de estado de completitud de una sección. */
export function CompletenessBadge({ status }: { status: string }) {
  const s = (status as TextilePassportCompleteness) ?? "pending";
  const tone = TEXTILE_PASSPORT_COMPLETENESS_TONE[s] ?? TEXTILE_PASSPORT_COMPLETENESS_TONE.pending;
  const label = TEXTILE_PASSPORT_COMPLETENESS_LABEL[s] ?? "Pendiente";
  return <Badge tone={tone}>{label}</Badge>;
}

/** Contenedor de sección con título y badge de completitud. */
export function PassportSection({
  title,
  status,
  children,
  id,
}: {
  title: string;
  status?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {status ? <CompletenessBadge status={status} /> : null}
      </div>
      {children}
    </section>
  );
}

/** Fila etiqueta/valor para datos simples. */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</span>
      <span className="text-sm">{value ?? <span className="text-ink-soft">No documentado</span>}</span>
    </div>
  );
}

/** Mensaje de sección vacía (invitación a documentar, nunca "cumple/no"). */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-ink-soft">{children}</p>;
}

/** Nota de disclaimer prudente dentro de una sección. */
export function DisclaimerNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-hairline bg-paper px-3 py-2 text-xs text-ink-soft">{children}</p>;
}
