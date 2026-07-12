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

export function InfoAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-loop/30 bg-loop/5 px-3 py-2 text-sm text-loop-deep">
      {message}
    </p>
  );
}
