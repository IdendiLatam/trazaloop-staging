"use client";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01G · «Guardar como PDF», sin generar PDF.
 *
 * El diálogo de impresión del navegador ya sabe hacer un PDF, y hacerlo así no
 * añade una dependencia, ni una ruta, ni una plantilla que mantener en dos
 * sitios. Cuando el informe tenga que salir con membrete y firmarse, será un
 * generador de verdad; hoy sería construir la mitad de uno.
 *
 * El botón mismo no se imprime: una hoja con un botón dibujado es ruido.
 */
export function PrintResultButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-md border border-hairline bg-surface px-4 py-2 text-sm font-medium hover:border-loop"
    >
      Imprimir o guardar como PDF
    </button>
  );
}
