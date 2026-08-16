// Ruta protegida CPR (layout (cpr) aplica requireCprModule).
export const dynamic = "force-dynamic";

/**
 * PCR-03.3 (7.2/7.5) · Detalle del expediente: secciones A–K renderizadas
 * desde el SNAPSHOT CONGELADO, con vista de impresión limpia vía navegador
 * (window.print(), patrón PrintButton existente; los controles llevan la
 * clase no-print). Sin PDF server-side. Si los datos cambiaron después de
 * esta versión, se avisa sin tocar el histórico.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCprModule } from "@/lib/auth/require-cpr-module";
import { getAuditDossier, detectChangesAfterDossier } from "@/lib/db/audit-dossier";
import { DOSSIER_STATUS_LABEL, type DossierSnapshot } from "@/lib/domain/audit-dossier";
import {
  EXERCISE_RESULT_LABEL,
  FINDING_LEVEL_LABEL,
  type ExerciseResult,
} from "@/lib/domain/traceability-exercise";
import { PrintButton } from "@/components/domain/audit-support/print-button";

const SEVERITY_TONE: Record<string, string> = {
  info: "border-hairline bg-canvas text-ink-soft",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  gap: "border-danger/40 bg-danger/5 text-danger",
};

export default async function DossierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const org = await requireCprModule();
  const { id } = await params;
  const dossier = await getAuditDossier(org.organizationId, id);
  if (!dossier) notFound();
  const snapshot = dossier.snapshot as unknown as DossierSnapshot;
  const hasChangesAfter = await detectChangesAfterDossier(org.organizationId, {
    generated_at: dossier.generated_at as string,
    output_batch_id: dossier.output_batch_id as string,
    exercise_id: (dossier.exercise_id as string | null) ?? null,
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 print:max-w-none">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          <Link href="/audit-prep/dossiers" className="hover:underline">
            Preparación para auditoría · Expedientes
          </Link>
        </p>
        <PrintButton />
      </div>

      {hasChangesAfter ? (
        <p className="no-print rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          Existen cambios posteriores a esta versión (datos del lote, de su
          orden o un ejercicio más reciente). Esta versión permanece congelada;
          genera una versión nueva para reflejarlos.
        </p>
      ) : null}

      {/* A · Portada / identificación */}
      <header className="rounded-lg border border-hairline bg-surface p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Expediente interno de preparación para auditoría
        </p>
        <h1 className="code mt-1 text-2xl font-semibold">
          {snapshot.cover.dossier_code} · v{snapshot.cover.version}
        </h1>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-soft">Empresa</dt>
            <dd>{snapshot.cover.organization_name}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Lote producido / lote final</dt>
            <dd className="code">{snapshot.cover.batch_code}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Producto</dt>
            <dd>{snapshot.cover.product_label ?? "Sin producto asociado"}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Estado</dt>
            <dd>{DOSSIER_STATUS_LABEL[dossier.status as string] ?? dossier.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Generado</dt>
            <dd>
              {new Date(snapshot.cover.generated_at).toLocaleString("es")}
              {snapshot.cover.generated_by_email ? ` · ${snapshot.cover.generated_by_email}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Huella (SHA-256)</dt>
            <dd className="code break-all text-[11px]">{(dossier.source_hash as string) ?? "—"}</dd>
          </div>
        </dl>
      </header>

      {/* B · Resumen */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">B · Resumen</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            ["Ejercicio asociado", snapshot.exercise.exercise_id ? (snapshot.summary.exercise_result ? EXERCISE_RESULT_LABEL[snapshot.summary.exercise_result as ExerciseResult] : "Sí") : "Sin ejercicio"],
            ["Cantidad producida", snapshot.summary.produced_quantity_kg !== null ? `${snapshot.summary.produced_quantity_kg} kg` : "—"],
            ["Órdenes involucradas", String(snapshot.summary.orders)],
            ["Lotes externos", String(snapshot.summary.external_batches)],
            ["Lotes internos / intermedios", String(snapshot.summary.internal_batches)],
            ["Proveedores", String(snapshot.summary.suppliers)],
            ["Evidencias", String(snapshot.summary.evidences)],
            ["Brechas / advertencias", `${snapshot.summary.gaps} / ${snapshot.summary.warnings}`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-ink-soft">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* C · Genealogía */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">C · Genealogía (cadena hacia atrás)</h2>
        {snapshot.genealogy.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Sin ejercicio de trazabilidad asociado: genera uno para incluir la
            cadena reconstruida.
          </p>
        ) : (
          <ol className="space-y-2">
            {snapshot.genealogy.map((s, i) => (
              <li key={i} className="rounded-md border border-hairline p-3" style={{ marginLeft: `${Math.min(s.depth, 6) * 12}px` }}>
                <p className="code text-sm font-medium">
                  Nivel {s.depth} · Lote {s.output_batch}
                  {s.order ? ` ← Orden ${s.order}` : ""}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                  {s.external_inputs.map((e, j) => (
                    <li key={`e${j}`}>
                      ← Entrada <span className="code">{e.batch_code}</span> · {e.material ?? "material s/i"} · {e.supplier ?? "proveedor s/i"} · <span className="code">{e.mass_kg} kg</span>
                    </li>
                  ))}
                  {s.internal_inputs.map((e, j) => (
                    <li key={`i${j}`}>
                      ← Lote reutilizado <span className="code">{e.batch_code}</span> · <span className="code">{e.mass_kg} kg</span>
                    </li>
                  ))}
                </ul>
                {s.truncated ? (
                  <p className="mt-1 text-xs text-amber-700">Profundidad máxima alcanzada.</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* D · Balance de cantidades */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">D · Balance de cantidades</h2>
        {snapshot.balances.input_batches.length + snapshot.balances.output_batches.length === 0 ? (
          <p className="text-sm text-ink-soft">Sin balances (requiere ejercicio asociado).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-ink-soft">
                  <th className="py-1.5 pr-3 font-medium">Evidencia</th>
                  <th className="py-1.5 pr-3 font-medium">Tipo / fecha</th>
                  <th className="py-1.5 pr-3 font-medium">Soporta</th>
                  <th className="py-1.5 pr-3 font-medium">Revisión interna</th>
                  <th className="py-1.5 font-medium">Medio / localización / responsable</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.evidences.map((e, i) => (
                  <tr key={i} className="border-b border-hairline align-top last:border-0">
                    <td className="py-1.5 pr-3 text-xs">{e.name}</td>
                    <td className="py-1.5 pr-3 text-xs text-ink-soft">
                      {[e.evidence_type, e.evidence_date].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-xs text-ink-soft">{e.target_label}</td>
                    <td className="py-1.5 pr-3 text-xs">
                      {e.review_label}
                      {e.reviewed_at ? (
                        <span className="block text-ink-soft">
                          {e.reviewed_by_email ? `${e.reviewed_by_email} · ` : ""}
                          {new Date(e.reviewed_at).toLocaleDateString("es-CO")}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-xs text-ink-soft">
                      {e.medium === "digital"
                        ? "Archivo digital (se abre desde Evidencias con enlace privado temporal)"
                        : e.medium === "physical"
                          ? `Registro físico${e.physical_reference ? ` · ${e.physical_reference}` : ""}`
                          : `Digital + físico${e.physical_reference ? ` · ${e.physical_reference}` : ""}`}
                      {[
                        e.physical_location ? `Ubicación: ${e.physical_location}` : null,
                        e.physical_custodian ? `Custodia: ${e.physical_custodian}` : null,
                        e.responsible ? `Responsable: ${e.responsible}` : null,
                      ]
                        .filter(Boolean)
                        .map((line, j) => (
                          <span key={j} className="block">
                            {line}
                          </span>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* E · Cálculo PCR */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">E · Cálculo de contenido reciclado (PCR)</h2>
        {snapshot.calculation ? (
          <>
            <p className="text-sm">
              <span className="text-lg font-semibold">{snapshot.calculation.recycled_percent}%</span>{" "}
              según la metodología vigente · calculado el{" "}
              {new Date(snapshot.calculation.calculated_at).toLocaleDateString("es")}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              El efecto de la evidencia sobre el cálculo sigue la metodología
              existente (la masa sin soporte permanece en la masa total y no
              suma al numerador). El detalle completo por componente vive en{" "}
              <Link href="/recycled-content" className="no-print text-loop underline">
                Contenido reciclado
              </Link>
              <span className="hidden print:inline">Contenido reciclado</span>.
            </p>
            {snapshot.calculation.warnings.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-amber-900">
                {snapshot.calculation.warnings.map((w, i) => (
                  <li key={i}>Advertencia del cálculo: {w}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-soft">Sin cálculo disponible para este lote.</p>
        )}
      </section>

      {/* F · Matriz de evidencias */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">F · Matriz de evidencias</h2>
        {snapshot.evidences.length === 0 ? (
          <p className="text-sm text-ink-soft">Sin evidencias vinculadas a la cadena.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-ink-soft">
                  <th className="py-1.5 pr-3 font-medium">Evidencia</th>
                  <th className="py-1.5 pr-3 font-medium">Soporta</th>
                  <th className="py-1.5 pr-3 font-medium">Revisión interna</th>
                  <th className="py-1.5 font-medium">Medio / localización</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.evidences.map((e, i) => (
                  <tr key={i} className="border-b border-hairline align-top last:border-0">
                    <td className="py-1.5 pr-3 text-xs">{e.name}</td>
                    <td className="py-1.5 pr-3 text-xs text-ink-soft">{e.target_label}</td>
                    <td className="py-1.5 pr-3 text-xs">{e.review_label}</td>
                    <td className="py-1.5 text-xs text-ink-soft">
                      {e.medium === "digital"
                        ? "Archivo digital (se abre desde Evidencias con enlace privado temporal)"
                        : e.medium === "physical"
                          ? `Registro físico${e.physical_reference ? ` · ${e.physical_reference}` : ""}`
                          : `Digital + físico${e.physical_reference ? ` · ${e.physical_reference}` : ""}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* G · Cliente */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">G · Acuerdos / requisitos de cliente</h2>
        {snapshot.requirements.length === 0 ? (
          <p className="text-sm text-ink-soft">Sin acuerdos o requisitos aplicables registrados.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {snapshot.requirements.map((r, i) => (
              <li key={i}>
                <span className="code">{r.code}</span> · {r.customer_name} — {r.title}{" "}
                <span className="text-xs text-ink-soft">({r.active ? "vigente" : "inactivo"})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* H · Calidad */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">H · Calidad, no conformidades y reclamaciones</h2>
        {snapshot.quality_evidences.length === 0 ? (
          <p className="text-sm text-ink-soft">Sin evidencias de calidad, NC o reclamaciones asociadas.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {snapshot.quality_evidences.map((e, i) => (
              <li key={i}>
                {e.name} <span className="text-xs text-ink-soft">({e.review_label} · {e.target_label})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* I · Ejercicio pre-auditoría */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">I · Ejercicio de trazabilidad pre-auditoría</h2>
        {snapshot.exercise.exercise_id ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-soft">Resultado interno</dt>
              <dd>
                {snapshot.exercise.result
                  ? EXERCISE_RESULT_LABEL[snapshot.exercise.result as ExerciseResult]
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Finalizado</dt>
              <dd>
                {snapshot.exercise.completed_at
                  ? new Date(snapshot.exercise.completed_at).toLocaleString("es")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-soft">Duración</dt>
              <dd>
                {snapshot.exercise.duration_seconds !== null
                  ? `${snapshot.exercise.duration_seconds} s`
                  : "—"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-ink-soft">
            Esta versión se generó sin ejercicio completado: se recomienda
            ejecutar uno y generar una versión nueva.
          </p>
        )}
      </section>

      {/* J · Brechas */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">J · Brechas y advertencias consolidadas</h2>
        {snapshot.findings.filter((f) => f.severity !== "info").length === 0 ? (
          <p className="text-sm text-ink-soft">Sin brechas ni advertencias registradas en el ejercicio.</p>
        ) : (
          <ul className="space-y-2">
            {snapshot.findings
              .filter((f) => f.severity !== "info")
              .map((f, i) => (
                <li key={i} className={`rounded-md border p-2 text-sm ${SEVERITY_TONE[f.severity]}`}>
                  <p>
                    <span className="text-xs font-semibold uppercase">{FINDING_LEVEL_LABEL[f.severity]}</span>{" "}
                    · <span className="text-xs uppercase text-ink-soft">{f.source}</span> · {f.message}
                  </p>
                  {f.recommendation ? (
                    <p className="mt-0.5 text-xs">Recomendación: {f.recommendation}</p>
                  ) : null}
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* K · Disclaimer */}
      <section className="rounded-lg border border-hairline bg-canvas p-5">
        <p className="text-xs text-ink-soft">{snapshot.disclaimer}</p>
      </section>
    </div>
  );
}
