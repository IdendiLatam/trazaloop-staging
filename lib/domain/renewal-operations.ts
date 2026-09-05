/**
 * Trazaloop · PE-05B5F · Cómo se le cuenta a quien opera.
 *
 * A diferencia de lo que ve un cliente, aquí NO se esconde el código canónico:
 * quien investiga un cobro necesita poder buscarlo en la base. Lo que se hace
 * es ponerle delante una frase que se entienda, y dejar el código detrás.
 */

export type OperationalState =
  | "al_dia" | "por_cobrar" | "reintentando" | "medio_de_pago"
  | "revision_manual" | "gracia_agotada" | "cancelacion" | "cambio_de_plan";

export type OperationalLabel = {
  state: OperationalState;
  label: string;
  /** El valor canónico, para quien tenga que buscarlo en la base. */
  code: string;
  urgent: boolean;
};

const AHORA = () => Date.now();

export function describeOperationalState(row: {
  subscriptionStatus: string;
  periodStatus: string | null;
  dueAt: string | null;
  graceEnd: string | null;
  attemptStatus: string | null;
  failureClass: string | null;
  manualReviewRequired: boolean;
}): OperationalLabel {
  // La duda manda sobre todo lo demás: es lo único que exige que mire alguien.
  if (row.manualReviewRequired) {
    return { state: "revision_manual", label: "Revisión manual requerida",
             code: row.failureClass ?? "manual_review_required", urgent: true };
  }
  const vencido = row.dueAt !== null && new Date(row.dueAt).getTime() <= AHORA();
  const graciaAgotada = row.graceEnd !== null
    && new Date(row.graceEnd).getTime() < AHORA();

  if (row.periodStatus === "open" && graciaAgotada) {
    return { state: "gracia_agotada", label: "Gracia agotada · pendiente de caducar",
             code: "lapse_due", urgent: true };
  }
  if (row.failureClass === "payment_method_unavailable") {
    return { state: "medio_de_pago", label: "Medio de pago no disponible",
             code: "payment_method_unavailable", urgent: true };
  }
  if (row.periodStatus === "open") {
    return { state: "reintentando", label: "Reintento programado",
             code: row.failureClass ?? "retry", urgent: false };
  }
  if (row.subscriptionStatus === "cancel_at_period_end") {
    return { state: "cancelacion", label: "Cancelación al final del periodo",
             code: "cancel_due", urgent: false };
  }
  if (vencido) {
    return { state: "por_cobrar", label: "Próxima renovación · por cobrar",
             code: "renew", urgent: false };
  }
  return { state: "al_dia", label: "Al día", code: "active", urgent: false };
}

export const FILTROS: Array<{ key: "todos" | OperationalState; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "por_cobrar", label: "Por cobrar" },
  { key: "reintentando", label: "Reintentando" },
  { key: "medio_de_pago", label: "Problema de medio de pago" },
  { key: "revision_manual", label: "Revisión manual" },
  { key: "gracia_agotada", label: "Gracia agotada" },
  { key: "cancelacion", label: "Cancelación programada" },
  { key: "al_dia", label: "Al día" },
];
