import type { CommercialPlan } from "@/lib/plans/commercial-catalog";
import { formatLimitForCustomer } from "@/lib/plans/commercial-presentation";

/**
 * Trazaloop · COMMERCIAL-UX-01D · La comparación, fila a fila.
 *
 *
 * DE DÓNDE SALEN LAS FILAS
 *
 * De la autoridad, no de una lista escrita aquí. Se recorre lo que
 * `plan_revision_limits` declara para los planes publicados y se pinta cada
 * recurso que exista. Si mañana se publica un recurso nuevo, aparece solo; si
 * uno deja de ser público, desaparece solo.
 *
 * Eso resuelve el encargo de «no inventar diferencias» de la única forma que de
 * verdad lo resuelve: no teniendo dónde inventarlas.
 *
 *
 * LO QUE SÍ ES CRITERIO DE PRESENTACIÓN
 *
 * El ORDEN de las filas y sus etiquetas. El orden es el de 01C —primero lo que
 * de verdad separa los planes— y las etiquetas vienen de `plan_resources`, que
 * es donde una persona de producto puede cambiarlas sin tocar código.
 *
 *
 * UNA FILA QUE NADIE PUEDE RESPONDER NO SE PINTA
 *
 * Si un recurso no está declarado para ningún plan, o su estado es
 * `not_configured`, la celda queda vacía. No se escribe «0», ni «—», ni «sin
 * configurar»: lo primero miente, lo segundo no dice nada y lo tercero le
 * enseña a un cliente un hueco del catálogo interno.
 */

/** El orden en que una persona quiere leerlo: primero lo que separa planes. */
const ORDEN: readonly string[] = [
  "storage_bytes",
  "ai_weighted_credits_monthly",
  "active_minutes_daily",
  "active_minutes_monthly",
  "team_members",
  "roles_enabled",
  "products",
  "materials",
  "suppliers",
  "production_orders",
  "input_batches",
  "output_batches",
  "documents_trazadocs",
  "evidences",
  "imports_enabled",
  "technical_report_enabled",
  "diagnostic_recommendations_enabled",
  "functional_support_enabled",
  "functional_support_cases_monthly",
];

export function PlanComparison({ planes }: { planes: readonly CommercialPlan[] }) {
  // Todos los recursos que algún plan publicado declara, en el orden de arriba
  // y con los desconocidos al final —para que un recurso nuevo se vea en vez de
  // desaparecer por no estar en una lista—.
  const codigos = [...new Set(planes.flatMap((p) => p.limits.map((l) => l.resourceCode)))]
    .sort((a, b) => {
      const ia = ORDEN.indexOf(a), ib = ORDEN.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

  const etiqueta = (code: string) =>
    planes.flatMap((p) => p.limits).find((l) => l.resourceCode === code)?.label ?? code;

  const celda = (plan: CommercialPlan, code: string) => {
    const l = plan.limits.find((x) => x.resourceCode === code);
    if (l === undefined) return null;
    return formatLimitForCustomer(l.resourceCode, l.state, l.value);
  };

  // Una fila donde ningún plan tiene nada que decir no aporta y ocupa.
  const filas = codigos.filter((c) => planes.some((p) => celda(p, c) !== null));

  return (
    // En móvil la tabla se desplaza DENTRO de su caja; la página nunca se mueve
    // en horizontal. Es la diferencia entre una tabla incómoda y una página rota.
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">
          Comparación de lo que incluye cada plan de Trazaloop
        </caption>
        <thead>
          <tr className="border-b border-hairline">
            {/* `scope` es lo que permite a un lector de pantalla decir, en cada
                celda, a qué plan y a qué concepto pertenece. Sin eso una tabla
                de comparación es una lista de números sueltos. */}
            <th scope="col" className="py-3 pr-4 text-left font-medium text-ink-soft">
              Concepto
            </th>
            {planes.map((p) => (
              <th key={p.code} scope="col"
                  className="px-4 py-3 text-left font-semibold text-ink">
                {p.headline}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((code) => (
            <tr key={code} className="border-b border-hairline/60">
              <th scope="row" className="py-3 pr-4 text-left font-normal text-ink-soft">
                {etiqueta(code)}
              </th>
              {planes.map((p) => {
                const v = celda(p, code);
                return (
                  <td key={p.code} className="px-4 py-3 text-ink">
                    {v ?? <span className="sr-only">Sin dato</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
