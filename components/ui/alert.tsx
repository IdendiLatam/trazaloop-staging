export function ErrorAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
    >
      {message}
    </p>
  );
}

/** PCR-01 (puntos 2 y 7): confirmación inequívoca de creación/edición.
 *  Mismo lenguaje visual del sistema (verde loop), rol status para lectores
 *  de pantalla. Se usa junto a ErrorAlert en todos los formularios PCR. */
export function SuccessAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="rounded-md border border-loop/30 bg-loop/5 px-3 py-2 text-sm font-medium text-loop-deep"
    >
      {message}
    </p>
  );
}

export function InfoAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-loop/30 bg-loop/5 px-3 py-2 text-sm text-loop-deep">
      {message}
    </p>
  );
}
