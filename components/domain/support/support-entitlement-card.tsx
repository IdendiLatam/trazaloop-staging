import type { SupportEntitlement } from "@/lib/db/support-entitlements";

/**
 * Trazaloop · PE-04B5 · Qué soporte incluye tu plan.
 *
 * Los dos ejes se enseñan SEPARADOS y siempre. Mezclarlos —contar los reportes
 * técnicos dentro de «1 de 2 casos»— haría creer a una empresa que avisar de una
 * avería le gasta algo, y entonces dejaría de avisar. Que un cliente no reporte
 * un fallo por miedo a gastar su cupo es el peor resultado posible.
 */
export function SupportEntitlementCard({ entitlement }: { entitlement: SupportEntitlement | null }) {
  const noSeSabe = entitlement === null || entitlement.state === "UNAVAILABLE";
  const incluida = entitlement?.functionalGuidanceAllowed === true;

  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <h2 className="eyebrow">Soporte incluido en tu plan</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Problemas técnicos</p>
          <p className="text-sm text-loop-deep">Disponible</p>
          <p className="text-xs text-ink-soft">
            Si Trazaloop falla, repórtalo siempre. Está en todos los planes y{" "}
            <strong>no consume</strong> casos de orientación.
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Orientación funcional</p>
          {noSeSabe ? (
            <>
              <p className="text-sm text-ink-soft">No se pudo comprobar</p>
              <p className="text-xs text-ink-soft">
                Vuelve a intentarlo en un momento. Reportar un problema técnico sigue disponible.
              </p>
            </>
          ) : incluida ? (
            <>
              <p className="text-sm text-loop-deep">
                {entitlement!.functionalCasesUsed ?? 0} de {entitlement!.functionalCasesLimit ?? 0}{" "}
                casos usados este mes
              </p>
              <p className="text-xs text-ink-soft">
                Quedan {entitlement!.functionalCasesRemaining ?? 0}. Se renuevan al empezar el mes
                siguiente y no se acumulan. Objetivo de respuesta inicial:{" "}
                <strong>1 día hábil</strong> — es un objetivo de primera respuesta, no un plazo de
                resolución.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-soft">Disponible con el plan Extra</p>
              <p className="text-xs text-ink-soft">
                Mientras tanto tienes la FAQ, la ayuda de cada pantalla, los tutoriales e
                Intelligence dentro de tu cuota.
              </p>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-ink-soft">
        La revisión de tu sistema de gestión, el diseño de procesos o la implantación de la norma
        son <strong>Acompañamiento especializado</strong>, un servicio aparte: no es un plan y no
        está incluido en ninguno.
      </p>
    </section>
  );
}
