// Ruta de plataforma: exige platform_staff activo. Nunca visible para una
// empresa. Ver `requirePlatformStaff`.
export const dynamic = "force-dynamic";

import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import {
  listPlatformUsage, listUsageByUseCase, getCurrentRates,
} from "@/lib/db/intelligence-usage";
import {
  forecastOrganization, forecastFleet, formatUsd, SCENARIOS, FLEET_SIZES, USD,
  type ModelRate,
} from "@/lib/domain/intelligence-cost";
import { INTELLIGENCE_PRODUCT_NAME } from "@/lib/domain/intelligence-identity";

export const metadata = { title: `Consumo de ${INTELLIGENCE_PRODUCT_NAME}` };

const num = (n: number) => n.toLocaleString("es-CO");

/**
 * Consumo de Trazaloop Intelligence · consola de plataforma.
 *
 * Existe para responder a una pregunta concreta: **¿alguna empresa está
 * consumiendo mucho más que las demás?** No es una herramienta de análisis: es
 * un sitio donde eso se ve sin tener que escribir SQL.
 *
 * Tres bloques, y la separación entre ellos es deliberada:
 *
 *   OBSERVADO   lo que pasó. Sale de los runs.
 *   OBSERVADO   por capacidad. Lo mismo, desglosado.
 *   PREVISIÓN   lo que costaría un escenario. NO ha pasado.
 *
 * Mezclar el tercero con los dos primeros convertiría una hipótesis en un
 * informe de consumo, así que van con títulos distintos y etiquetados.
 *
 * No se muestra ni una letra de lo que nadie escribió: para ver cuánto cuesta
 * una consulta no hace falta leerla.
 */
export default async function IntelligenceUsagePage() {
  await requirePlatformStaff();

  const [porEmpresa, porCapacidad, tarifas] = await Promise.all([
    listPlatformUsage({ months: 3 }),
    listUsageByUseCase({ months: 3 }),
    getCurrentRates(),
  ]);

  const tarifa = tarifas["openai:gpt-5.4-mini"];
  const paraPrevision: Record<string, ModelRate> = tarifa
    ? { "document.quick_edit": tarifa, "document.contextual_review": tarifa, "ask": tarifa }
    : {};

  const totalCoste = porEmpresa.reduce((a, r) => a + r.estimatedCostUsd, 0);
  const totalRuns = porEmpresa.reduce((a, r) => a + r.runs, 0);
  // La media sirve para detectar el caso raro, que es para lo que existe esta
  // pantalla. Con una sola empresa no significa nada, y se dice.
  const media = porEmpresa.length > 0 ? totalCoste / porEmpresa.length : 0;

  return (
    <div className="max-w-6xl space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">Plataforma</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Consumo de {INTELLIGENCE_PRODUCT_NAME}
        </h1>
        <p className="text-sm text-ink-soft">
          Últimos tres meses. El coste es una <strong>estimación</strong> calculada con
          la tarifa que estaba vigente cuando ocurrió cada operación, no un importe
          facturado.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Dato titulo="Operaciones" valor={num(totalRuns)} pie="observado · 3 meses" />
        <Dato titulo="Coste estimado" valor={formatUsd(Math.round(totalCoste * USD))}
              pie="observado · 3 meses" />
        <Dato titulo="Media por empresa"
              valor={porEmpresa.length > 1 ? formatUsd(Math.round(media * USD)) : "—"}
              pie={porEmpresa.length > 1
                ? `${porEmpresa.length} empresas con actividad`
                : "hace falta más de una empresa"} />
      </section>

      {/* ------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Observado · por empresa</h2>
        {porEmpresa.length === 0 ? (
          <p className="text-sm text-ink-soft">Todavía no hay consumo registrado.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-xs">
              <thead className="bg-paper text-ink-soft">
                <tr>
                  <Th>Empresa</Th><Th>Mes</Th><Th n>Operaciones</Th><Th n>Llamadas</Th>
                  <Th n>Personas</Th><Th n>Entrada</Th><Th n>Salida</Th>
                  <Th n>Latencia</Th><Th n>Coste est.</Th>
                </tr>
              </thead>
              <tbody>
                {porEmpresa.map((r) => {
                  // «Veinte veces la media» es literalmente lo que hay que ver.
                  const anomalo = porEmpresa.length > 2 && media > 0
                    && r.estimatedCostUsd > media * 5;
                  return (
                    <tr key={`${r.organizationId}-${r.monthUtc}`}
                        className={`border-t border-hairline ${anomalo ? "bg-amber/10" : ""}`}>
                      <Td>{r.organizationName}</Td>
                      <Td>{r.monthUtc.slice(0, 7)}</Td>
                      <Td n>{num(r.runs)}</Td>
                      <Td n>{num(r.providerCalls)}</Td>
                      <Td n>{num(r.actors)}</Td>
                      <Td n>{num(r.inputTokens)}</Td>
                      <Td n>{num(r.outputTokens)}</Td>
                      <Td n>{r.avgLatencyMs === null ? "—" : `${num(r.avgLatencyMs)} ms`}</Td>
                      <Td n>
                        {formatUsd(Math.round(r.estimatedCostUsd * USD))}
                        {anomalo ? <span className="ml-1 text-amber">▲</span> : null}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">Observado · por capacidad</h2>
        <p className="text-xs text-ink-soft">
          Lo que de verdad cuesta cada una. Es la tabla que hará falta el día que se
          decida qué se incluye en cada plan.
        </p>
        {porCapacidad.length === 0 ? (
          <p className="text-sm text-ink-soft">Sin datos todavía.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-xs">
              <thead className="bg-paper text-ink-soft">
                <tr>
                  <Th>Capacidad</Th><Th>Clase</Th><Th n>Operaciones</Th><Th n>Llamadas</Th>
                  <Th n>Fallos</Th><Th n>Entrada media</Th><Th n>Salida media</Th>
                  <Th n>Latencia media</Th><Th n>Coste est.</Th>
                </tr>
              </thead>
              <tbody>
                {porCapacidad.map((r) => (
                  <tr key={r.useCase} className="border-t border-hairline">
                    <Td>{r.label ?? r.useCase}</Td>
                    <Td>{r.costClass ?? "—"}</Td>
                    <Td n>{num(r.runs)}</Td>
                    <Td n>{num(r.providerCalls)}</Td>
                    <Td n>{num(r.failed)}</Td>
                    <Td n>{r.avgInput === null ? "—" : num(r.avgInput)}</Td>
                    <Td n>{r.avgOutput === null ? "—" : num(r.avgOutput)}</Td>
                    <Td n>{r.avgLatencyMs === null ? "—" : `${num(r.avgLatencyMs)} ms`}</Td>
                    <Td n>{formatUsd(Math.round(r.estimatedCostUsd * USD))}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">
          Previsión · lo que costaría, no lo que costó
        </h2>
        <p className="text-xs text-ink-soft">
          Escenarios de <strong>implantación completa</strong> de una empresa —350
          secciones documentales— con el consumo medido de cada capacidad. No es
          consumo real y no debe leerse como tal.
        </p>
        {!tarifa ? (
          <p className="text-sm text-ink-soft">
            No hay tarifa vigente para el modelo en uso: sin ella no se puede prever.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-dashed border-hairline">
            <table className="w-full text-xs">
              <thead className="bg-paper text-ink-soft">
                <tr>
                  <Th>Escenario</Th><Th n>Operaciones</Th><Th n>Una empresa</Th>
                  {FLEET_SIZES.map((k) => <Th key={k} n>{num(k)}</Th>)}
                </tr>
              </thead>
              <tbody>
                {(["low", "normal", "intensive"] as const).map((nombre) => {
                  const una = forecastOrganization(SCENARIOS[nombre], paraPrevision);
                  return (
                    <tr key={nombre} className="border-t border-hairline">
                      <Td>{{ low: "Bajo", normal: "Normal", intensive: "Intensivo" }[nombre]}</Td>
                      <Td n>{num(una.operations)}</Td>
                      <Td n>{formatUsd(una.costMicros)}</Td>
                      {FLEET_SIZES.map((k) => (
                        <Td key={k} n>{formatUsd(forecastFleet(una, k).costMicros)}</Td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-ink-soft">
          Las columnas son <strong>empresas</strong>, no personas usándolo a la vez.
          Y la implantación es un esfuerzo que ocurre una vez: el primer mes de una
          empresa cuesta mucho más que el sexto.
        </p>
      </section>
    </div>
  );
}

function Dato({ titulo, valor, pie }: { titulo: string; valor: string; pie: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4">
      <p className="text-[11px] uppercase tracking-wide text-ink-soft">{titulo}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{valor}</p>
      <p className="text-[11px] text-ink-soft">{pie}</p>
    </div>
  );
}

function Th({ children, n }: { children: React.ReactNode; n?: boolean }) {
  return <th className={`px-2 py-1.5 font-medium ${n ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, n }: { children: React.ReactNode; n?: boolean }) {
  return <td className={`px-2 py-1.5 ${n ? "text-right tabular-nums" : ""}`}>{children}</td>;
}
