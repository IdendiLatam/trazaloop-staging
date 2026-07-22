"use client";

import { useState } from "react";
import Link from "next/link";
import { formatRemainingTrial } from "@/lib/modules/access";

/**
 * Trazaloop · Sprint T9F · Aviso del Demo TEMPORAL de 2 días.
 *
 * Server-driven: las fechas de vencimiento las calcula el servidor (hora de
 * la BD) y llegan como ISO. El tiempo restante mostrado es INFORMATIVO — la
 * autorización real siempre es server-side.
 *
 * Accesible (role="status", aria-live), no depende solo del color, se adapta
 * a móvil. Se puede cerrar durante la sesión pero reaparece en cada carga
 * (no hay descarte permanente mientras la prueba siga activa).
 */
export type DemoTrialBannerProps = {
  /** Módulos en Demo temporal con su vencimiento ISO. */
  trials: { name: string; expiresAt: string }[];
  /** ¿Hay algún módulo con la prueba ya finalizada? */
  hasExpired: boolean;
};

function formatExpiry(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DemoTrialBanner({ trials, hasExpired }: DemoTrialBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (trials.length === 0 && !hasExpired) return null;

  // ¿Todas las pruebas comparten la misma fecha? → un solo aviso general.
  const uniqueDates = [...new Set(trials.map((t) => t.expiresAt))];
  const sharedExpiry = trials.length > 0 && uniqueDates.length === 1 ? uniqueDates[0] : null;
  const now = new Date();

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="space-y-1">
        <p className="font-semibold text-amber">
          {trials.length > 0
            ? "Tu empresa está utilizando Trazaloop en modo Demo. El acceso de prueba estará disponible durante 2 días."
            : "Tu periodo Demo ha finalizado."}
        </p>

        {sharedExpiry && (
          <p className="text-amber/90">
            Tu periodo de prueba finaliza el {formatExpiry(sharedExpiry)}.
            {formatRemainingTrial(sharedExpiry, now) && (
              <> Queda {formatRemainingTrial(sharedExpiry, now)} de prueba.</>
            )}
          </p>
        )}

        {!sharedExpiry && trials.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-amber/90">
            {trials.map((t) => (
              <li key={t.name}>
                {t.name}: finaliza el {formatExpiry(t.expiresAt)}
                {formatRemainingTrial(t.expiresAt, now) && <> (queda {formatRemainingTrial(t.expiresAt, now)})</>}.
              </li>
            ))}
          </ul>
        )}

        {hasExpired && (
          <p className="text-amber/90">
            Algún módulo tiene la prueba finalizada. Tus datos se conservarán. Contacta al equipo de
            Trazaloop para reactivar el acceso.
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/modules"
          className="rounded-md border border-amber/40 bg-surface px-3 py-1.5 text-xs font-medium text-amber hover:bg-amber/10"
        >
          Ver módulos
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar aviso de prueba (reaparecerá más tarde)"
          className="rounded-md px-2 py-1.5 text-xs font-medium text-amber hover:bg-amber/10"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
