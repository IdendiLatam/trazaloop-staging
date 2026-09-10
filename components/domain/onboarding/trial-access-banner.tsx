import type { EstadoComercial } from "@/lib/plans/commercial-display";
import { etiquetaComercial, esAccesoDePrueba } from "@/lib/plans/commercial-display";
import { PLAN_LABEL } from "@/lib/plans/types";

/**
 * Trazaloop · STABILIZATION-01 · Lo que la empresa en Demo tiene que entender.
 *
 * LA MENTIRA QUE ESTE AVISO SUSTITUYE
 *
 * Una empresa recién registrada recibe 48 horas con el acceso de Full. El panel
 * leía «Plan Full» y no decía nada más: quien acababa de registrarse se
 * encontraba con que tenía contratado un plan de pago. Y cuando la prueba se
 * acababa, todo se estrechaba de golpe sin que nadie lo hubiera avisado.
 *
 * QUÉ DICE, Y DE DÓNDE SALE CADA CIFRA
 *
 * Ni una cifra escrita a mano. La duración y los créditos extraordinarios
 * vienen de `commercial_trial_policy`; la bolsa mensual y lo gastado, de
 * `ai_credits_status` —que ya distingue las dos bolsas—; los minutos del plan
 * gratuito, del límite de la revisión CONTRATADA. Si mañana el producto cambia
 * una de esas cifras, este aviso cambia solo.
 *
 * Y no aparece cuando no hay prueba: una empresa que contrató Full no necesita
 * que le expliquen su Demo.
 */
export type ResumenDemo = {
  /** De la política de prueba vigente. */
  duracionHoras: number | null;
  /** Créditos extraordinarios de la prueba: cuántos son y cuántos quedan. */
  creditosPruebaTotal: number | null;
  creditosPruebaRestantes: number | null;
  /** La bolsa MENSUAL, que sale del plan contratado y se renueva. */
  creditosMensuales: number | null;
  creditosMensualesRestantes: number | null;
  /** Minutos al día del plan contratado, cuando la prueba termine. */
  minutosDiariosTrasLaPrueba: number | null;
};

export function TrialAccessBanner({
  estado, resumen,
}: {
  estado: EstadoComercial;
  resumen: ResumenDemo;
}) {
  if (!esAccesoDePrueba(estado)) return null;

  const contratado = estado.contractedPlanCode
    ? PLAN_LABEL[estado.contractedPlanCode]
    : "Free";
  const acceso = estado.effectivePlanCode ? PLAN_LABEL[estado.effectivePlanCode] : null;
  const fecha = estado.grantEndsAt
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "long", timeStyle: "short", timeZone: "America/Bogota",
      }).format(new Date(estado.grantEndsAt))
    : null;

  return (
    <div id="acceso-demo" className="space-y-3 rounded-lg border border-loop/40 bg-loop/5 p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-loop">{etiquetaComercial(estado)}</p>
        {fecha ? <p className="text-xs text-ink-soft">Termina el {fecha}</p> : null}
      </div>

      <p className="text-ink-soft">
        Estás probando {acceso ? `el acceso ${acceso}` : "el acceso completo"}
        {resumen.duracionHoras ? ` durante ${resumen.duracionHoras} horas` : ""}.{" "}
        <strong className="text-ink">No has contratado {acceso ?? "un plan de pago"}</strong>:
        tu plan es {contratado}, y es al que vuelves cuando termine la prueba.
      </p>

      <ul className="space-y-1.5 text-ink-soft">
        {resumen.creditosMensuales !== null ? (
          <li>
            <span className="text-ink">{resumen.creditosMensuales} créditos de inteligencia al mes</span>
            {" "}· son los de tu plan {contratado} y se renuevan cada mes
            {resumen.creditosMensualesRestantes !== null
              ? ` (te quedan ${resumen.creditosMensualesRestantes})`
              : ""}.
          </li>
        ) : null}
        {resumen.creditosPruebaTotal !== null ? (
          <li>
            <span className="text-ink">{resumen.creditosPruebaTotal} créditos extraordinarios</span>
            {" "}· se conceden una sola vez por el Demo y no se renuevan
            {resumen.creditosPruebaRestantes !== null
              ? ` (te quedan ${resumen.creditosPruebaRestantes})`
              : ""}.
          </li>
        ) : null}
        <li>
          <span className="text-ink">Tiempo de uso de la plataforma</span> · durante el Demo no
          se aplica el límite diario del plan {contratado}
          {resumen.minutosDiariosTrasLaPrueba !== null
            ? `; después son ${resumen.minutosDiariosTrasLaPrueba} minutos al día`
            : ""}.
        </li>
      </ul>
    </div>
  );
}
