import Link from "next/link";

/**
 * Estado vacío útil (Sprint 5B): explica qué hacer y ofrece un CTA claro.
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-surface px-6 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{description}</p>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-4 inline-block rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
