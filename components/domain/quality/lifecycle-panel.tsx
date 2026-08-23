"use client";

import { useActionState } from "react";
import {
  deletionBlockedMessage,
  describeBlocking,
  DISPOSABLE_HINT,
  ENTITY_LABEL,
  hardDeleteConfirmation,
  type DeletionEligibility,
  type LifecycleEntity,
} from "@/lib/domain/lifecycle";

/**
 * Trazaloop · QUALITY-03.1 · Eliminar, o entender por qué ya no.
 *
 * Dos estados y ningún término medio:
 *
 *   · el objeto todavía es desechable → se ofrece eliminarlo, con una
 *     confirmación que lo NOMBRA (aceptar «¿Eliminar?» a ciegas es casi lo
 *     mismo que no preguntar), y una nota discreta que cuenta hasta cuándo;
 *
 *   · el objeto ya tiene historia → se explica con números qué la produjo y se
 *     ofrece la salida real del dominio: retirar, desactivar o cerrar.
 *
 * El dictamen llega RESUELTO desde el servidor. Este componente no cuenta
 * mediciones ni interpreta estados: si lo hiciera, tarde o temprano diría algo
 * distinto de lo que hace la base, y el usuario creería a la pantalla.
 *
 * La confirmación es un `<details>`, no un `confirm()` del navegador: se ve
 * dentro de la página, con el mismo lenguaje que el resto, y funciona sin
 * JavaScript —el formulario existe en el HTML—.
 */
export function LifecyclePanel({
  entity,
  name,
  eligibility,
  idFieldName,
  idValue,
  deleteAction,
  alternativeSlot,
  canManage,
}: {
  entity: LifecycleEntity;
  name: string;
  eligibility: DeletionEligibility;
  idFieldName: string;
  idValue: string;
  deleteAction: (prev: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>;
  /** La acción alternativa del dominio (retirar, desactivar, cerrar), si la
   *  página ya la ofrece en otro sitio se pasa `null`. */
  alternativeSlot?: React.ReactNode;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(deleteAction, { error: null as string | null });

  if (!canManage) return null;

  if (!eligibility.canHardDelete) {
    return (
      <section className="rounded-lg border border-hairline bg-surface p-4">
        <h3 className="text-sm font-semibold">Este {ENTITY_LABEL[entity]} ya no puede eliminarse</h3>
        <p className="mt-1 text-sm text-ink-soft">{eligibility.reason}</p>
        {eligibility.blocking.length > 0 && (
          <p className="mt-1 text-sm text-ink">
            Tiene {describeBlocking(eligibility.blocking)}.
          </p>
        )}
        {eligibility.alternativeLabel && (
          <p className="mt-2 text-sm text-ink-soft">{eligibility.alternativeLabel}.</p>
        )}
        {alternativeSlot}
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <h3 className="text-sm font-semibold">Eliminar este {ENTITY_LABEL[entity]}</h3>
      <p className="mt-1 text-xs text-ink-soft">{DISPOSABLE_HINT[entity]}</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm font-medium text-amber">
          Eliminar {ENTITY_LABEL[entity]}
        </summary>
        <form action={formAction} className="mt-2 space-y-2">
          <input type="hidden" name={idFieldName} value={idValue} />
          <p className="text-sm text-ink">{hardDeleteConfirmation(entity, name)}</p>
          {state.error && <p className="text-sm text-amber">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-amber/40 bg-amber/10 px-3 py-1.5 text-sm font-medium text-amber hover:bg-amber/20 disabled:opacity-60"
          >
            {pending ? "Eliminando…" : `Sí, eliminar definitivamente`}
          </button>
        </form>
      </details>
    </section>
  );
}

/** El mismo dictamen, en una línea, para listados donde no cabe un panel. */
export function LifecycleNote({ eligibility }: { eligibility: DeletionEligibility }) {
  if (eligibility.canHardDelete) return null;
  return <p className="text-xs text-ink-soft">{deletionBlockedMessage(eligibility)}</p>;
}
