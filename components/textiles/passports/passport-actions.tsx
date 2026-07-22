"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  generateTextilePassportSnapshotAction,
  changeTextilePassportStatusAction,
} from "@/server/actions/textiles-passport";
import {
  allowedTextilePassportTransitions,
  canGenerateTextilePassport,
  type TextilePassportStatus,
} from "@/lib/domain/textiles-passport";

/**
 * Trazaloop · Sprint T9C (Textil) · Acciones del pasaporte (cliente). Solo
 * dispara server actions seguras: generar/regenerar snapshot vía RPC controlada
 * y transiciones de estado vía RPC controlada. NO envía snapshot/hash/estado
 * arbitrario: solo el id del pasaporte y, en transición, el estado destino
 * (validado en servidor). La BD sigue siendo la autoridad de permisos.
 */
export function PassportActions({
  passportId,
  status,
  roleCode,
}: {
  passportId: string;
  status: TextilePassportStatus;
  roleCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canGenerate = canGenerateTextilePassport(status);
  const transitions = allowedTextilePassportTransitions(status).filter((t) => {
    // admin/quality pueden todo; consultant solo las marcadas allowConsultant.
    if (roleCode === "admin" || roleCode === "quality") return true;
    if (roleCode === "consultant") return t.allowConsultant;
    return false;
  });

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canGenerate ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => generateTextilePassportSnapshotAction(passportId))}
            className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep disabled:opacity-50"
          >
            {status === "draft" ? "Generar snapshot técnico" : "Regenerar snapshot"}
          </button>
        ) : null}
        {transitions.map((t) => (
          <button
            key={t.to}
            type="button"
            disabled={pending}
            onClick={() => run(() => changeTextilePassportStatusAction(passportId, t.to))}
            className="rounded-md border border-loop/40 bg-loop/5 px-3 py-1.5 text-sm font-medium text-loop-deep hover:border-loop disabled:opacity-50"
          >
            {t.label}
          </button>
        ))}
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
