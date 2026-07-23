"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorAlert } from "@/components/ui/alert";

/** Trazaloop · Sprint T4 (Textil) · Botón genérico activar/desactivar. */
export function ToggleActiveButton({
  entityId,
  isActive,
  action,
}: {
  entityId: string;
  isActive: boolean;
  action: (id: string, isActive: boolean) => Promise<{ error: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <ErrorAlert message={error} />
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await action(entityId, !isActive);
            if (res.error) {
              setError(res.error);
              return;
            }
            router.refresh();
          });
        }}
        className="rounded-md border border-hairline bg-paper px-3 py-1 text-xs font-medium hover:border-loop"
      >
        {isActive ? "Desactivar" : "Activar"}
      </button>
    </div>
  );
}
