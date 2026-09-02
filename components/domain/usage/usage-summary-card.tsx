import {
  consultationCopy,
  formatAllowance,
  formatMinutes,
  nextResetDate,
  usageBadge,
  type UsageBadge,
} from "@/lib/domain/usage-summary";
import type { AiCreditStatus, OrganizationTimeStatus } from "@/lib/db/organization-usage";

/**
 * Trazaloop · PE-04B4 · Lo que la empresa ve de su propio consumo.
 *
 * Enseña unidades del PLAN —créditos de Intelligence y minutos de uso—, nunca
 * tokens, coste del proveedor ni el peso interno de cada operación: eso es
 * economía nuestra y presentarlo como si fuera su cuota confundiría lo que se
 * vende con cómo se produce.
 *
 * Las dos bolsas de créditos se enseñan SEPARADAS a propósito. Sumarlas haría
 * leer «75 créditos» a una empresa Free con prueba activa, y cuando la prueba
 * caducara parecería que se le quitaron 50 que nunca fueron suyos.
 */
const TONO: Record<UsageBadge, string> = {
  ok: "text-loop-deep",
  warning: "text-amber-700",
  exhausted: "text-red-700",
  unknown: "text-neutral-500",
};

function Dato({ etiqueta, valor, tono = "ok", nota }: {
  etiqueta: string; valor: string; tono?: UsageBadge; nota?: string | null;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{etiqueta}</dt>
      <dd className={`text-lg font-semibold ${TONO[tono]}`}>{valor}</dd>
      {nota ? <p className="text-xs text-neutral-500">{nota}</p> : null}
    </div>
  );
}

export function UsageSummaryCard({ time, ai, titulo = "Tu consumo" }: {
  time: OrganizationTimeStatus | null;
  ai: AiCreditStatus | null;
  titulo?: string;
}) {
  // Sin dato NO es cero: si no se pudo leer, se dice, no se pinta un 0 de N.
  if (!time && !ai) {
    return (
      <section className="rounded-lg border border-neutral-200 p-4">
        <h2 className="text-sm font-semibold text-neutral-700">{titulo}</h2>
        <p className="mt-2 text-sm text-neutral-600">
          No se pudo leer el consumo de tu empresa ahora mismo. Vuelve a intentarlo en un momento.
        </p>
      </section>
    );
  }

  const aviso = consultationCopy(time?.state ?? null);
  const reinicio = nextResetDate(ai?.periodMonth ?? null);

  return (
    <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-700">{titulo}</h2>
        {ai?.planCode ? (
          <span className="text-xs uppercase tracking-wide text-neutral-500">
            Plan {ai.planCode}
          </span>
        ) : null}
      </div>

      {aviso ? (
        <div role="status" className="rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">{aviso.title}</p>
          <p className="mt-1 text-sm text-amber-900">{aviso.body}</p>
        </div>
      ) : null}

      <dl className="grid gap-4 sm:grid-cols-2">
        <Dato
          etiqueta="Créditos de Intelligence este mes"
          valor={formatAllowance(ai?.monthlyUsed ?? null, ai?.monthlyLimit ?? null)}
          tono={usageBadge(ai?.monthlyUsed ?? null, ai?.monthlyLimit ?? null)}
          nota={
            // Durante la prueba el cliente ve «Plan full» y una mensual de 25.
            // Sin esta línea parece un error del producto; con ella es lo que
            // es: la prueba trae su propia bolsa, y esta no la sustituye.
            ai?.trialActive
              ? `Los créditos de la prueba van aparte y no cambian este cupo.${
                  reinicio ? ` Vuelven a estar disponibles el ${reinicio}.` : ""
                }`
              : reinicio
                ? `Vuelven a estar disponibles el ${reinicio}.`
                : null
          }
        />

        {ai?.trialActive ? (
          <Dato
            etiqueta="Créditos de la prueba"
            valor={formatAllowance(ai.trialUsed, ai.trialTotal)}
            tono={usageBadge(ai.trialUsed, ai.trialTotal)}
            nota={
              // Se dice que CADUCAN, y no se insinúa en ningún sitio que la
              // prueba incluya los 500 créditos mensuales de Full.
              ai.trialEndsAt
                ? `Se usan primero y caducan al terminar la prueba, el ${ai.trialEndsAt.slice(0, 10)}.`
                : "Se usan primero y caducan al terminar la prueba."
            }
          />
        ) : null}

        {time?.metered ? (
          <>
            <Dato
              etiqueta="Tiempo de uso hoy"
              valor={`${formatMinutes(time.dailyUsed)} de ${formatMinutes(time.dailyLimit)}`}
              tono={usageBadge(time.dailyUsed, time.dailyLimit)}
              nota="El cupo es de toda la empresa: varias personas a la vez no lo multiplican."
            />
            <Dato
              etiqueta="Tiempo de uso este mes"
              valor={`${formatMinutes(time.monthlyUsed)} de ${formatMinutes(time.monthlyLimit)}`}
              tono={usageBadge(time.monthlyUsed, time.monthlyLimit)}
            />
          </>
        ) : (
          <Dato
            etiqueta="Tiempo de uso"
            valor="sin límite"
            nota={
              time?.grantKind === "trial" && time?.planEndsAt
                ? `Durante la prueba, hasta el ${time.planEndsAt.slice(0, 10)}.`
                : "Tu plan no tiene límite de tiempo de uso."
            }
          />
        )}
      </dl>
    </section>
  );
}
