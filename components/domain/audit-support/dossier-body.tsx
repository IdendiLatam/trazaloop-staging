import Link from "next/link";
import type { DossierBundle } from "@/server/actions/audit-support";
import type { ChainRow } from "@/lib/db/audit-support";
import { GAP_SEVERITY_LABEL } from "@/lib/db/audit-support";
import { EXCLUSION_LABEL, WARNING_LABEL, LEVEL_LABEL } from "@/lib/db/recycled";
import { DefensibilityBadge } from "@/components/domain/recycled/defensibility-badge";
import { TraceabilityStatusBadge } from "@/components/domain/traceability/status-badge";
import { EvidenceMatrixTable } from "@/components/domain/audit-support/evidence-matrix-table";

const kg = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : `${v.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const pct = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : `${v.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

function RuleSummary({ rules }: { rules: Record<string, unknown> }) {
  const items: string[] = [];
  if (rules.same_process_counts === false)
    items.push("El material recuperado en el mismo proceso no cuenta como reciclado (sí suma a la masa total).");
  if (rules.postindustrial_counts_by_default === false)
    items.push("El material postindustrial no cuenta por defecto.");
  if (rules.postindustrial_requires_reclassification === true)
    items.push("El postindustrial solo puede contar mediante reclasificación con justificación y soporte válido.");
  if (rules.recycled_requires_origin_support === true)
    items.push("Todo material contado como reciclado requiere evidencia de origen en estado válido.");
  if (rules.additives_pigments_fillers_count === false)
    items.push("Virgen, aditivos, pigmentos, cargas minerales y masterbatch no cuentan como reciclado.");
  if (rules.mass_balance_tolerance_percent !== undefined)
    items.push(`Tolerancia de balance de masa: ${rules.mass_balance_tolerance_percent} %.`);
  return (
    <ul className="list-inside list-disc space-y-1 text-sm text-ink-soft">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

export function DossierBody({
  bundle,
  chain,
  printMode = false,
}: {
  bundle: DossierBundle;
  chain: ChainRow[];
  printMode?: boolean;
}) {
  const d = bundle.dossier;
  const diff =
    d.declared_percent !== null ? d.recycled_percent - d.declared_percent : null;

  return (
    <div className="space-y-8">
      {/* 7.1 Encabezado */}
      <section className="print-avoid-break">
        <p className="eyebrow">Trazaloop — Dossier técnico de contenido reciclado</p>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
          <span className="code text-loop-deep">{d.output_batch_code}</span>
          <DefensibilityBadge level={d.defensibility_level} />
          {d.risk_flag ? (
            <span className="inline-flex rounded-full border border-danger/30 bg-danger/5 px-2.5 py-0.5 text-xs font-medium text-danger">
              Riesgo declarado
            </span>
          ) : null}
          {d.traceability_status ? (
            <TraceabilityStatusBadge status={d.traceability_status as "incomplete" | "complete_with_warnings" | "complete"} />
          ) : null}
        </h1>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-ink-soft">Producto</dt><dd>{d.product_name ?? "Sin producto asociado"}</dd></div>
          <div><dt className="text-xs text-ink-soft">Familia</dt><dd>{d.family_name ?? "—"}</dd></div>
          <div><dt className="text-xs text-ink-soft">Orden / corrida de producción</dt><dd className="code text-xs">{d.production_order_code ?? "—"}</dd></div>
          <div><dt className="text-xs text-ink-soft">Fecha de producción</dt><dd>{d.produced_date ?? "—"}</dd></div>
          <div><dt className="text-xs text-ink-soft">Fecha de cálculo</dt><dd>{new Date(d.calculated_at).toLocaleString("es-CO")}</dd></div>
          <div><dt className="text-xs text-ink-soft">Calculado por</dt><dd>{d.calculated_by_name ?? "—"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-ink-soft">Metodología</dt><dd>{d.methodology_name}</dd></div>
          <div><dt className="text-xs text-ink-soft">Versión</dt><dd className="code text-xs">{d.methodology_code} · v{d.methodology_version}</dd></div>
        </dl>
      </section>

      {/* 7.2 Resultado */}
      <section className="print-avoid-break rounded-lg border border-loop/30 bg-surface p-5">
        <h2 className="eyebrow mb-4">Resultado del cálculo</h2>
        <p className="text-lg font-semibold text-loop-deep">
          Contenido reciclado calculado: {pct(d.recycled_percent)}
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-ink-soft">Masa reciclada válida</dt><dd className="code">{kg(d.recycled_mass_kg)}</dd></div>
          <div><dt className="text-xs text-ink-soft">Masa total considerada</dt><dd className="code">{kg(d.total_mass_kg)}</dd></div>
          <div><dt className="text-xs text-ink-soft">Porcentaje declarado</dt><dd className="code">{pct(d.declared_percent)}</dd></div>
          <div>
            <dt className="text-xs text-ink-soft">Diferencia calculado − declarado</dt>
            <dd className={`code ${diff !== null && diff < 0 ? "text-danger" : ""}`}>
              {diff === null ? "—" : `${diff >= 0 ? "+" : ""}${pct(diff)}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Riesgo por declarado</dt>
            <dd className={`font-semibold ${d.risk_flag ? "text-danger" : ""}`}>{d.risk_flag ? "Sí" : "No"}</dd>
          </div>
          <div><dt className="text-xs text-ink-soft">Nivel de defendibilidad</dt><dd>{LEVEL_LABEL[d.defensibility_level]}</dd></div>
        </dl>
        {d.warnings.length > 0 ? (
          <div className="mt-4 rounded-md border border-amber/40 bg-amber/10 px-3 py-2">
            <p className="text-xs font-semibold text-amber">Advertencias del cálculo</p>
            <ul className="mt-1 list-inside list-disc text-xs text-amber">
              {d.warnings.map((w) => (
                <li key={w}>{WARNING_LABEL[w] ?? w}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* 7.3 Fórmula y metodología */}
      <section className="print-avoid-break rounded-lg border border-hairline bg-surface p-5">
        <h2 className="eyebrow mb-3">Fórmula y metodología</h2>
        <p className="code rounded-md bg-paper px-3 py-2 text-sm">
          masa reciclada válida / masa total considerada × 100
        </p>
        <div className="mt-3">
          <RuleSummary rules={d.methodology_rules_snapshot} />
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Reglas congeladas dentro del snapshot del cálculo ({d.methodology_code} v{d.methodology_version}).
          Esta sección no es editable.
        </p>
      </section>

      {/* 7.4 Trazabilidad */}
      <section className="print-avoid-break rounded-lg border border-hairline bg-surface p-5">
        <h2 className="eyebrow mb-3">Trazabilidad</h2>
        <p className="mb-3 text-xs text-ink-soft">
          Lote producido / lote final → Orden / corrida de producción → Lotes de entrada consumidos → Proveedores → Materiales
        </p>
        {chain.length === 0 ? (
          <p className="text-sm text-ink-soft">Sin consumos registrados para la orden.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-medium">Lote de entrada</th>
                  <th className="py-2 pr-3 font-medium">Proveedor</th>
                  <th className="py-2 pr-3 font-medium">Material</th>
                  <th className="py-2 pr-3 font-medium">Clasificación</th>
                  <th className="py-2 pr-3 font-medium">Masa consumida</th>
                  <th className="py-2 font-medium">Recepción</th>
                </tr>
              </thead>
              <tbody>
                {chain.map((c, i) => (
                  <tr key={i} className="border-b border-hairline last:border-0">
                    <td className="code py-2 pr-3 text-xs text-loop-deep">{c.input_batch_code}</td>
                    <td className="py-2 pr-3">{c.supplier_name ?? "—"}</td>
                    <td className="py-2 pr-3">{c.material_name ?? "—"}</td>
                    <td className="code py-2 pr-3 text-xs">{c.classification_code ?? "—"}</td>
                    <td className="code py-2 pr-3 text-xs">{kg(c.mass_kg)}</td>
                    <td className="py-2 text-xs text-ink-soft">{c.received_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
          <div><dt className="text-xs text-ink-soft">Masa consumida</dt><dd className="code">{kg(d.consumed_mass_kg)}</dd></div>
          <div><dt className="text-xs text-ink-soft">Masa en composición</dt><dd className="code">{kg(d.composition_mass_kg)}</dd></div>
          <div><dt className="text-xs text-ink-soft">Cantidad producida</dt><dd className="code">{kg(d.produced_quantity_kg)}</dd></div>
        </dl>
        {d.mass_balance_warning ? (
          <p className="mt-2 text-xs text-amber">El snapshot registró balance de masa fuera de tolerancia.</p>
        ) : null}
      </section>

      {/* 7.5 Componentes */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="eyebrow mb-3">Componentes del cálculo</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                <th className="py-2 pr-3 font-medium">Material</th>
                <th className="py-2 pr-3 font-medium">Masa kg</th>
                <th className="py-2 pr-3 font-medium">Clasif. base</th>
                <th className="py-2 pr-3 font-medium">Clasif. efectiva</th>
                <th className="py-2 pr-3 font-medium">Mismo proceso</th>
                <th className="py-2 pr-3 font-medium">Soporte origen</th>
                <th className="py-2 pr-3 font-medium">Soporte reclasif.</th>
                <th className="py-2 pr-3 font-medium">¿Cuenta?</th>
                <th className="py-2 font-medium">Razón / advertencias</th>
              </tr>
            </thead>
            <tbody>
              {bundle.components.map((c) => (
                <tr key={c.component_index} className="border-b border-hairline align-top last:border-0">
                  <td className="py-2 pr-3">{c.material_name ?? "—"}</td>
                  <td className="code py-2 pr-3 text-xs">{c.mass_kg ?? "—"}</td>
                  <td className="code py-2 pr-3 text-xs">{c.classification_code ?? "—"}</td>
                  <td className="code py-2 pr-3 text-xs">{c.effective_classification ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs">{c.is_same_process ? "Sí" : "No"}</td>
                  <td className="code py-2 pr-3 text-xs">{c.origin_support_status ?? "—"}</td>
                  <td className="code py-2 pr-3 text-xs">{c.reclassification_support_status ?? "—"}</td>
                  <td className={`py-2 pr-3 text-xs font-semibold ${c.counted ? "text-loop-deep" : "text-danger"}`}>
                    {c.counted ? "Sí" : "No"}
                  </td>
                  <td className="py-2 text-xs text-ink-soft">
                    {c.exclusion_reason
                      ? EXCLUSION_LABEL[c.exclusion_reason] ?? c.exclusion_reason
                      : "Incluido en el numerador"}
                    {c.warning_codes.length > 0 ? (
                      <span className="block text-[10px] text-amber">
                        {c.warning_codes.map((w) => WARNING_LABEL[w] ?? w).join(" · ")}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 7.6 Evidencias de soporte */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="eyebrow mb-3">Evidencias de soporte</h2>
        <EvidenceMatrixTable rows={bundle.evidences} />
      </section>

      {/* 7.7 Brechas */}
      <section className="print-avoid-break rounded-lg border border-hairline bg-surface p-5">
        <h2 className="eyebrow mb-3">Brechas y acciones sugeridas</h2>
        {bundle.gaps.length === 0 ? (
          <p className="text-sm text-ink-soft">No se identifican brechas críticas en este cálculo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                  <th className="py-2 pr-3 font-medium">Severidad</th>
                  <th className="py-2 pr-3 font-medium">Brecha</th>
                  <th className="py-2 pr-3 font-medium">Descripción</th>
                  <th className="py-2 pr-3 font-medium">Entidad</th>
                  <th className="py-2 font-medium">Acción sugerida</th>
                </tr>
              </thead>
              <tbody>
                {bundle.gaps.map((g, i) => (
                  <tr key={i} className="border-b border-hairline align-top last:border-0">
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          g.gap_severity === "critical"
                            ? "border-danger/30 bg-danger/5 text-danger"
                            : g.gap_severity === "warning"
                              ? "border-amber/40 bg-amber/10 text-amber"
                              : "border-hairline text-ink-soft"
                        }`}
                      >
                        {GAP_SEVERITY_LABEL[g.gap_severity]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs font-medium">{g.gap_label}</td>
                    <td className="py-2 pr-3 text-xs text-ink-soft">{g.gap_description}</td>
                    <td className="py-2 pr-3 text-xs">{g.related_entity_label ?? "—"}</td>
                    <td className="py-2 text-xs text-ink-soft">{g.suggested_action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 7.8 Historial */}
      <section className="print-avoid-break rounded-lg border border-hairline bg-surface p-5">
        <h2 className="eyebrow mb-3">Historial de cálculos del lote</h2>
        <ul className="divide-y divide-hairline text-sm">
          {bundle.history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-xs text-ink-soft">{new Date(h.calculated_at).toLocaleString("es-CO")}</span>
              <span className="code">{pct(h.recycled_percent)}</span>
              <DefensibilityBadge level={h.defensibility_level as "preliminary" | "with_warnings" | "defensible"} />
              <span className={`text-xs ${h.risk_flag ? "text-danger" : "text-ink-soft"}`}>
                {h.risk_flag ? "Riesgo" : "Sin riesgo"}
              </span>
              {!printMode ? (
                <Link href={`/audit-support/calculations/${h.id}`} className="no-print text-xs text-loop hover:underline">
                  Ver
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-soft">
          Cada recálculo crea un snapshot nuevo; los anteriores se conservan intactos.
        </p>
      </section>
    </div>
  );
}
