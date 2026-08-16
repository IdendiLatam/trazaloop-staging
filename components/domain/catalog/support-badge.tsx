/**
 * Badge de soporte de un material (Sprint 5C fix): texto siempre presente
 * (el color nunca es el único indicador).
 * - Sin soporte: falta la evidencia requerida o está rechazada/vencida.
 * - Soporte pendiente: la evidencia existe pero no está validada.
 * - Soporte válido: la evidencia requerida está VIGENTE (aceptada
 *   internamente y NO archivada — regla canónica PCR-03.1).
 * - Soporte archivado / no vigente: la evidencia sigue 'valid' pero fue
 *   archivada; NUNCA se muestra como "Soporte válido".
 * Solo aplica a materiales cuya clasificación efectiva es elegible como
 * reciclado (para el resto no se muestra: el motor no les exige soporte).
 */
export function SupportBadge({
  evidenceId,
  status,
  archivedAt = null,
}: {
  evidenceId: string | null;
  status: string | null;
  archivedAt?: string | null;
}) {
  const kind =
    !evidenceId || status === "rejected" || status === "expired"
      ? ("none" as const)
      : archivedAt
        ? ("archived" as const)
        : status === "valid"
          ? ("valid" as const)
          : ("pending" as const);
  const view = {
    none: { label: "Sin soporte", tone: "border-danger/30 bg-danger/5 text-danger" },
    pending: { label: "Soporte pendiente", tone: "border-amber/40 bg-amber/10 text-amber" },
    valid: { label: "Soporte válido", tone: "border-loop/30 bg-loop/5 text-loop-deep" },
    archived: { label: "Soporte archivado · no vigente", tone: "border-hairline bg-surface-2 text-ink-soft" },
  }[kind];
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${view.tone}`}
    >
      {view.label}
    </span>
  );
}
