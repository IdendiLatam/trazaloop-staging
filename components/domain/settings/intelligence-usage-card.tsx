import {
  INTELLIGENCE_PRODUCT_NAME, labelForUseCase,
} from "@/lib/domain/intelligence-identity";
import type { OrganizationUsageStatus } from "@/lib/db/intelligence-usage";

/**
 * Trazaloop · QUALITY-12.2F · Cuánto ha usado esta empresa Intelligence.
 *
 * LO QUE NO ENSEÑA, Y ES LA DECISIÓN
 *
 * Dinero. Ni un dólar, ni un token suelto.
 *
 * Una empresa compra Trazaloop, no tokens de un proveedor. Enseñarle «llevas
 * gastados 0,73 USD» la invita a pensar en una economía que no es la suya y
 * abre una conversación —«¿y si uso menos?»— que no queremos tener: usar
 * Intelligence es lo que hace que su documentación mejore.
 *
 * Lo que sí necesita saber es si se está acercando a un tope, y eso se cuenta
 * en operaciones, que es lo que ella hace.
 *
 * Y el tope de hoy es TÉCNICO, de seguridad, no una cuota comercial. El copy
 * lo dice así a propósito: cuando exista una cuota comercial, será una
 * decisión tomada con datos, y esta tarjeta cambiará entonces.
 */
export function IntelligenceUsageCard({ status }: { status: OrganizationUsageStatus }) {
  const pct = Math.min(100, Math.max(0, status.percentUsed));

  const color =
    status.state === "at_limit" ? "bg-red-500"
    : status.state === "near_limit" ? "bg-amber"
    : status.state === "high" ? "bg-loop"
    : "bg-loop/60";

  const leyenda = {
    normal: "Uso normal.",
    high: "Uso alto este mes.",
    near_limit: "Cerca del máximo de este mes.",
    at_limit: "Has alcanzado el máximo de operaciones de este mes.",
  }[status.state];

  const entradas = Object.entries(status.byUseCase)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-ink">
          Uso de {INTELLIGENCE_PRODUCT_NAME}
        </h2>
        <p className="text-xs text-ink-soft">
          Mes en curso ({status.monthUtc}, hora UTC).
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold text-ink">
            {status.runsThisMonth.toLocaleString("es-CO")}
          </span>
          <span className="text-xs text-ink-soft">
            de {status.monthlyLimit.toLocaleString("es-CO")} operaciones
          </span>
        </div>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-canvas"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Uso de ${INTELLIGENCE_PRODUCT_NAME} este mes`}
        >
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-ink-soft">{leyenda}</p>
      </div>

      {entradas.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-ink-soft">
          {entradas.map(([uc, n]) => (
            <li key={uc} className="flex justify-between">
              <span>{labelForUseCase(uc)}</span>
              <span className="tabular-nums">{n.toLocaleString("es-CO")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-soft">Todavía no se ha usado este mes.</p>
      )}

      <p className="text-[11px] text-ink-soft">
        Es un límite técnico de seguridad, para que un error no consuma sin freno.
        {status.hasOverride ? " Tu empresa tiene una ampliación activa." : ""}
        {" "}Si te queda corto, escríbenos.
      </p>
    </section>
  );
}
