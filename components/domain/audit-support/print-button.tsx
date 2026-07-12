"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
    >
      Imprimir / guardar como PDF
    </button>
  );
}
