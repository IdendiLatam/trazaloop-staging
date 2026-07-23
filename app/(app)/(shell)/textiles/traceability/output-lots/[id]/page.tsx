// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T6 (Textil) · Vista de trazabilidad técnica del lote
// producido/final: orden, referencia, producto, materiales y componentes
// consumidos, procesos, evidencias y brechas. El estado se calcula EN VIVO
// (el persistido es informativo).

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  getTextileOutputLot,
  getOrderTraceabilityEvaluation,
} from "@/lib/db/textiles-traceability";
import {
  TEXTILE_OUTPUT_LOT_STATUSES,
  TEXTILE_OUTPUT_LOT_STATUS_LABEL,
  TEXTILE_CONSUMPTION_ROLE_LABEL,
  TEXTILE_STEP_TYPE_LABEL,
  TEXTILE_STEP_STATUS_LABEL,
  TEXTILE_TRACEABILITY_STATUS_LABEL,
  TEXTILE_TRACEABILITY_DISCLAIMER,
  type TextileTraceabilityStatus,
} from "@/lib/domain/textiles-traceability";
import { TEXTILE_EVIDENCE_STATUS_LABEL, TEXTILE_EVIDENCE_ENTITY_TYPE_LABEL } from "@/lib/domain/textiles-evidences";
import {
  updateTextileOutputLotDetailsAction,
  type TextileOutputLotInput,
} from "@/server/actions/textiles-traceability";
import { TextileEntityForm } from "@/components/domain/textiles/entity-form";
import { listTextileCircularityAssessments } from "@/lib/db/textiles-circularity";
import { TEXTILE_READINESS_LEVEL_LABEL } from "@/lib/domain/textiles-circularity";
import { RecalculateTraceabilityButton } from "@/components/domain/textiles/recalculate-traceability-button";
import type { CatalogFieldDef } from "@/components/domain/textiles/catalog-manager";

const TRACE_TONE: Record<TextileTraceabilityStatus, string> = {
  not_started: "border-hairline bg-paper text-ink-soft",
  incomplete: "border-amber/40 bg-amber/10 text-amber",
  complete: "border-loop/30 bg-loop/5 text-loop-deep",
  needs_review: "border-danger/30 bg-danger/5 text-danger",
};

export default async function TextileOutputLotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireTextilesModule();

  const lot = await getTextileOutputLot(org.organizationId, id);
  if (!lot) notFound();
  // Evaluaciones de circularidad asociadas a este lote final (T7).
  const lotAssessments = await listTextileCircularityAssessments(org.organizationId, {
    outputLotId: lot.id,
  });
  const trace = await getOrderTraceabilityEvaluation(org.organizationId, lot.orderId);
  if (!trace) notFound();
  const { evaluation, consumptions, steps, evidenceRows } = trace;

  const materialConsumptions = consumptions.filter((c) => c.lotType === "material");
  const componentConsumptions = consumptions.filter((c) => c.lotType === "component");

  const fields: CatalogFieldDef[] = [
    { key: "outputLotCode", label: "Código del lote final", type: "text", required: true },
    { key: "quantityProduced", label: "Cantidad producida", type: "text", required: true },
    { key: "unit", label: "Unidad", type: "text" },
    { key: "producedDate", label: "Fecha de producción (AAAA-MM-DD)", type: "text" },
    {
      key: "status",
      label: "Estado",
      type: "select",
      options: TEXTILE_OUTPUT_LOT_STATUSES.map((v) => ({ value: v, label: TEXTILE_OUTPUT_LOT_STATUS_LABEL[v] })),
    },
    { key: "notes", label: "Notas", type: "text" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Trazabilidad técnica</p>
        <h1 className="text-2xl font-semibold tracking-tight">{lot.outputLotCode}</h1>
        <p className="text-sm text-ink-soft">
          {[
            `${lot.quantityProduced} ${lot.unit}`,
            lot.producedDate ? `Producido: ${lot.producedDate}` : "",
            TEXTILE_OUTPUT_LOT_STATUS_LABEL[lot.status as keyof typeof TEXTILE_OUTPUT_LOT_STATUS_LABEL] ?? lot.status,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_TRACEABILITY_DISCLAIMER}</p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link href="/textiles/traceability/output-lots" className="text-sm font-medium text-loop hover:underline">
            ← Lotes finales
          </Link>
          <Link href={`/textiles/traceability/orders/${lot.orderId}`} className="text-sm text-loop hover:underline">
            Ver orden {lot.orderCode ?? ""} →
          </Link>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${TRACE_TONE[evaluation.status]}`}>
            Trazabilidad: {TEXTILE_TRACEABILITY_STATUS_LABEL[evaluation.status]}
          </span>
          <RecalculateTraceabilityButton outputLotId={lot.id} />
        </div>
        <p className="max-w-2xl text-xs text-ink-soft">
          El estado de trazabilidad se calcula a partir de la orden, consumos, procesos,
          evidencias y relaciones registradas. No equivale a certificación ni validación
          externa.
          {lot.updatedAt ? ` Última actualización del lote: ${lot.updatedAt.slice(0, 10)}.` : ""}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-hairline bg-surface p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Orden / corrida</h2>
          <p className="mt-1 font-medium">{lot.orderCode ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Producto · Referencia</h2>
          <p className="mt-1 font-medium">
            {lot.productName ?? "—"}
            {lot.sku ? <span className="ml-2 text-xs text-ink-soft">{lot.sku}</span> : null}
          </p>
        </div>
      </section>

      {evaluation.gaps.length > 0 ? (
        <section className="space-y-2 rounded-lg border border-amber/40 bg-amber/10 p-4">
          <h2 className="text-sm font-semibold text-amber">Brechas de trazabilidad</h2>
          {evaluation.gaps.map((gap, i) => (
            <p key={`${gap.code}-${i}`} className="text-xs text-amber">
              {gap.message}
            </p>
          ))}
        </section>
      ) : null}

      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Materiales consumidos ({materialConsumptions.length})</h2>
        {materialConsumptions.length === 0 ? (
          <p className="text-xs text-ink-soft">Sin consumos de materiales registrados en la orden.</p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-soft">
            {materialConsumptions.map((c) => (
              <li key={c.id}>
                <span className="font-medium text-ink">{c.lotCode ?? c.inputLotId}</span> · {c.materialName ?? ""} ·{" "}
                {c.quantityConsumed} {c.unit} ·{" "}
                {TEXTILE_CONSUMPTION_ROLE_LABEL[c.consumptionRole as keyof typeof TEXTILE_CONSUMPTION_ROLE_LABEL] ?? c.consumptionRole}{" "}
                · {c.supplierName ? `Proveedor: ${c.supplierName}` : "Sin proveedor"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Avíos / componentes consumidos ({componentConsumptions.length})</h2>
        {componentConsumptions.length === 0 ? (
          <p className="text-xs text-ink-soft">Sin consumos de componentes registrados en la orden.</p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-soft">
            {componentConsumptions.map((c) => (
              <li key={c.id}>
                <span className="font-medium text-ink">{c.lotCode ?? c.inputLotId}</span> · {c.componentName ?? ""} ·{" "}
                {c.quantityConsumed} {c.unit} · {c.supplierName ? `Proveedor: ${c.supplierName}` : "Sin proveedor"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Procesos de la orden ({steps.length})</h2>
        {steps.length === 0 ? (
          <p className="text-xs text-ink-soft">Sin procesos registrados.</p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-soft">
            {steps.map((s) => (
              <li key={s.id}>
                <span className="font-medium text-ink">
                  {s.stepOrder !== null ? `${s.stepOrder}. ` : ""}
                  {s.name}
                </span>{" "}
                · {TEXTILE_STEP_TYPE_LABEL[s.stepType as keyof typeof TEXTILE_STEP_TYPE_LABEL] ?? s.stepType}
                {s.supplierName ? ` · ${s.supplierName}` : ""} ·{" "}
                {TEXTILE_STEP_STATUS_LABEL[s.status as keyof typeof TEXTILE_STEP_STATUS_LABEL] ?? s.status}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Evidencias de la cadena ({evidenceRows.length})</h2>
        {evidenceRows.length === 0 ? (
          <p className="text-xs text-ink-soft">
            Sin evidencias vinculadas. Vincúlalas desde el detalle de cada evidencia.
          </p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-soft">
            {evidenceRows.map((e) => (
              <li key={e.linkId}>
                <Link href={`/textiles/evidences/${e.evidence.id}`} className="text-loop hover:underline">
                  {e.evidence.title}
                </Link>{" "}
                · {TEXTILE_EVIDENCE_ENTITY_TYPE_LABEL[e.entityType as keyof typeof TEXTILE_EVIDENCE_ENTITY_TYPE_LABEL] ?? e.entityType}{" "}
                · {TEXTILE_EVIDENCE_STATUS_LABEL[e.evidence.status as keyof typeof TEXTILE_EVIDENCE_STATUS_LABEL] ?? e.evidence.status}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Evaluación de circularidad asociada</h2>
        {lotAssessments.length === 0 ? (
          <p className="text-xs text-ink-soft">
            Este lote final aún no tiene evaluación de circularidad. Puedes crearla usando este
            lote como contexto.
          </p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-soft">
            {lotAssessments.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/textiles/circularity/assessments/${a.id}`}
                  className="font-medium text-loop hover:underline"
                >
                  {a.assessmentCode}
                </Link>{" "}
                ·{" "}
                {a.circularityScore !== null
                  ? `${a.circularityScore} / 100 · ${
                      TEXTILE_READINESS_LEVEL_LABEL[
                        a.readinessLevel as keyof typeof TEXTILE_READINESS_LEVEL_LABEL
                      ] ?? a.readinessLevel ?? ""
                    }`
                  : "Sin calcular"}
              </li>
            ))}
          </ul>
        )}
        <Link href="/textiles/circularity/assessments/new" className="text-xs font-medium text-loop hover:underline">
          Crear evaluación con este lote →
        </Link>
      </section>

      <TextileEntityForm<TextileOutputLotInput>
        title="Editar lote final"
        fields={fields}
        initialValues={{
          outputLotCode: lot.outputLotCode,
          quantityProduced: String(lot.quantityProduced),
          unit: lot.unit,
          producedDate: lot.producedDate ?? "",
          status: lot.status,
          notes: lot.notes ?? "",
        }}
        submitLabel="Guardar cambios"
        entityId={lot.id}
        updateAction={updateTextileOutputLotDetailsAction}
        successMessage="Lote final actualizado."
      />
    </div>
  );
}
