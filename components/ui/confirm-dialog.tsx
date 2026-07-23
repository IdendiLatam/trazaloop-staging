"use client";

import { useEffect, useRef } from "react";

/**
 * Trazaloop · Sprint T9E · Diálogo de confirmación reutilizable (el
 * proyecto no tenía un patrón de modal; window.confirm queda proscrito).
 * Accesible: role="dialog", aria-modal, foco inicial en "Cancelar",
 * cierre con Escape y con clic en el fondo. Sin dependencias externas.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  pending = false,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className="w-full max-w-md space-y-4 rounded-lg border border-hairline bg-surface p-5 shadow-xl"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold">
          {title}
        </h2>
        <p id="confirm-dialog-description" className="text-sm text-ink-soft">
          {description}
        </p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold text-white ${
              destructive
                ? "bg-danger hover:opacity-90 disabled:opacity-60"
                : "bg-loop hover:bg-loop-deep disabled:opacity-60"
            }`}
          >
            {pending ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
