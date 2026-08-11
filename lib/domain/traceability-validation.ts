/**
 * Trazaloop · Sprint PCR-01 · Validación PURA de trazabilidad PCR.
 *
 * Extraída de server/actions/traceability.ts (los archivos "use server" solo
 * pueden exportar funciones async, por lo que la lógica pura vive aquí, en la
 * misma capa que lib/domain/* — testeable sin BD).
 */

export const INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE =
  "La cantidad del lote es obligatoria y debe ser mayor que 0 kg.";

export type InputBatchFormValues = {
  batch_code: string;
  supplier_id: string | null;
  material_id: string | null;
  received_date: string | null;
  quantity_kg: string;
};

/**
 * PCR-01 (punto 10): la cantidad del lote de entrada es OBLIGATORIA y > 0
 * para todo lote nuevo o editado desde el formulario. Los lotes históricos
 * con NULL en BD no se tocan (el trigger 0103 solo aplica en INSERT), pero
 * al editarlos el formulario pedirá completar la cantidad real.
 */
export function validateInputBatchValues(v: InputBatchFormValues): string | null {
  if (!v.batch_code) return "El código del lote es obligatorio.";
  if (!v.supplier_id) return "El proveedor es obligatorio.";
  if (!v.material_id) return "El material es obligatorio.";
  if (!v.received_date) return "La fecha de recepción es obligatoria.";
  if (v.quantity_kg.trim() === "") return INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE;
  const n = Number(v.quantity_kg);
  if (Number.isNaN(n) || n <= 0) return INPUT_BATCH_QUANTITY_REQUIRED_MESSAGE;
  return null;
}
