"use client";

import { useState } from "react";
import Link from "next/link";
import { formatRemainingTrial } from "@/lib/modules/access";
import {
  DEMO_ACTIVE_PARTIAL_BODY,
  DEMO_ACTIVE_PARTIAL_TITLE,
  DEMO_BANNER_INTRO,
  DEMO_EXPIRED_BANNER,
  DEMO_PARTIAL_BANNER_BODY,
  DEMO_PARTIAL_BANNER_TITLE,
  type DemoNoticeKind,
} from "@/lib/modules/messages";

/**
 * Trazaloop · Aviso de las pruebas Demo.
 *
 * Server-driven: las fechas de vencimiento las calcula el servidor (hora de
 * la BD) y llegan como ISO. El tiempo restante mostrado es INFORMATIVO — la
 * autorización real siempre es server-side.
 *
 * El aviso habla SIEMPRE de módulos, nunca de la cuenta. Antes decía «Tu
 * periodo Demo ha finalizado» en cuanto no quedaba ninguna prueba en curso,
 * de modo que una empresa con PCR y Textiles vencidos pero Quality en Full
 * leía que su acceso había terminado —y lo leía también DENTRO de Quality,
 * mientras lo estaba usando—. El vencimiento de un módulo no es un estado de
 * la cuenta, y el texto ya no lo trata como tal.
 *
 * Accesible (role="status", aria-live), no depende solo del color, se adapta
 * a móvil. Se puede cerrar durante la sesión pero reaparece en cada carga
 * (no hay descarte permanente mientras la prueba siga activa).
 */
export type DemoTrialBannerProps = {
  /** Módulos en Demo temporal con su vencimiento ISO. */
  trials: { name: string; expiresAt: string }[];
  /** Módulos cuya prueba ya venció, por nombre. */
  expiredModules: string[];
  /** Qué aviso corresponde (lo clasifica el servidor). */
  notice: DemoNoticeKind;
  /**
   * ¿Ofrecer el enlace al selector? En el propio selector no: llevaría a la
   * página en la que ya se está, que es un botón que no hace nada.
   */
  showModulesLink?: boolean;
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

/** «PCR y Textiles», «PCR, Textiles y Quality» — como lo diría una persona. */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export function DemoTrialBanner({
  trials,
  expiredModules,
  notice,
  showModulesLink = true,
}: DemoTrialBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || notice === "none") return null;

  // ¿Todas las pruebas en curso comparten fecha? → una sola frase.
  //
  // Solo cuando NO hay nada vencido. En un aviso parcial esa frase —«Tu
  // periodo de prueba finaliza el…»— volvería a hablar en nombre de la cuenta
  // justo en el caso en que la cuenta no es la que vence, así que ahí se
  // enumeran los módulos uno por uno aunque compartan fecha.
  //
  // Tampoco en un aviso «hay pruebas, pero no todo es prueba»: ahí «Tu periodo
  // de prueba finaliza el…» diría que a la empresa se le acaba el acceso, y a
  // la empresa no se le acaba nada.
  const uniqueDates = [...new Set(trials.map((t) => t.expiresAt))];
  const sharedExpiry =
    notice === "active" && trials.length > 0 && uniqueDates.length === 1 ? uniqueDates[0] : null;
  const now = new Date();

  // Un vencimiento que deja módulos en pie es informativo; uno que no deja
  // ninguno sí pide acción. El color acompaña esa diferencia en vez de gritar
  // igual en los dos casos.
  // Una prueba que convive con acceso contratado es informativa, no urgente:
  // no se le grita a alguien por algo que no le quita nada.
  const sereno = notice === "partial" || notice === "active_partial";
  const tone = sereno ? "border-hairline bg-surface" : "border-amber/40 bg-amber/10";
  const titleTone = sereno ? "text-ink" : "text-amber";
  const bodyTone = sereno ? "text-ink-soft" : "text-amber/90";

  const title =
    notice === "all_expired"
      ? DEMO_EXPIRED_BANNER.split(" Tus datos")[0]
      : notice === "partial"
        ? DEMO_PARTIAL_BANNER_TITLE
        : notice === "active_partial"
          ? DEMO_ACTIVE_PARTIAL_TITLE
          : DEMO_BANNER_INTRO;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-start sm:justify-between ${tone}`}
    >
      <div className="space-y-1">
        <p className={`font-semibold ${titleTone}`}>{title}</p>

        {notice === "partial" && expiredModules.length > 0 && (
          <p className={bodyTone}>
            {`${listNames(expiredModules)}: la prueba terminó y los datos se conservan. ${DEMO_PARTIAL_BANNER_BODY}`}
          </p>
        )}

        {notice === "active_partial" && (
          <p className={bodyTone}>{DEMO_ACTIVE_PARTIAL_BODY}</p>
        )}

        {notice === "all_expired" && (
          <p className={bodyTone}>
            Tus datos se conservarán. Contacta al equipo de Trazaloop para reactivar el acceso.
          </p>
        )}

        {sharedExpiry && (
          <p className={bodyTone}>
            Tu periodo de prueba finaliza el {formatExpiry(sharedExpiry)}.
            {formatRemainingTrial(sharedExpiry, now) && (
              <> Queda {formatRemainingTrial(sharedExpiry, now)} de prueba.</>
            )}
          </p>
        )}

        {!sharedExpiry && trials.length > 0 && (
          <ul className={`list-disc space-y-0.5 pl-5 ${bodyTone}`}>
            {trials.map((t) => (
              <li key={t.name}>
                {t.name}: finaliza el {formatExpiry(t.expiresAt)}
                {formatRemainingTrial(t.expiresAt, now) && <> (queda {formatRemainingTrial(t.expiresAt, now)})</>}.
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {showModulesLink && (
          <Link
            href="/modules"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-paper"
          >
            Ver módulos
          </Link>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar aviso de prueba (reaparecerá más tarde)"
          className="rounded-md px-2 py-1.5 text-xs font-medium text-ink-soft hover:bg-paper"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
