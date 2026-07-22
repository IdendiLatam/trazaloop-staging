// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T6 (Textil) · Detalle de orden/corrida: edición,
// consumos de lotes, procesos, lotes finales, evidencias y brechas (estado
// de trazabilidad calculado en vivo).

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  getTextileProductionOrder,
  getOrderTraceabilityEvaluation,
  listTextileInputLots,
} from "@/lib/db/textiles-traceability";
import { listTextileReferences } from "@/lib/db/textiles-products";
import {
  listTextileProcesses,
  listTextileOutsourcedProcesses,
  listTextileSuppliers,
} from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_ORDER_STATUSES,
  TEXTILE_ORDER_STATUS_LABEL,
  TEXTILE_CONSUMPTION_ROLES,
  TEXTILE_CONSUMPTION_ROLE_LABEL,
  TEXTILE_STEP_TYPES,
  TEXTILE_STEP_TYPE_LABEL,
  TEXTILE_STEP_STATUSES,
  TEXTILE_STEP_STATUS_LABEL,
  TEXTILE_OUTPUT_LOT_STATUSES,
  TEXTILE_OUTPUT_LOT_STATUS_LABEL,
  TEXTILE_TRACEABILITY_STATUS_LABEL,
  TEXTILE_TRACEABILITY_DISCLAIMER,
  type TextileTraceabilityStatus,
} from "@/lib/domain/textiles-traceability";
import { TEXTILE_EVIDENCE_STATUS_LABEL } from "@/lib/domain/textiles-evidences";
import {
  updateTextileProductionOrderAction,
  addTextileOrderConsumptionAction,
  updateTextileOrderConsumptionAction,
  removeTextileOrderConsumptionAction,
  addTextileOrderProcessStepAction,
  updateTextileOrderProcessStepAction,
  removeTextileOrderProcessStepAction,
  createTextileOutputLotAction,
  type TextileOrderInput,
  type TextileConsumptionInput,
  type TextileStepInput,
  type TextileOutputLotInput,
} from "@/server/actions/textiles-traceability";
import { TextileEntityForm } from "@/components/domain/textiles/entity-form";
import {
  ReferenceAssociationManager,
  type AssociationRowView,
} from "@/components/domain/textiles/reference-association-manager";
import type { CatalogFieldDef } from "@/components/domain/textiles/catalog-manager";

const TRACE_TONE: Record<TextileTraceabilityStatus, string> = {
  not_started: "border-hairline bg-paper text-ink-soft",
  incomplete: "border-amber/40 bg-amber/10 text-amber",
  complete: "border-loop/30 bg-loop/5 text-loop-deep",
  needs_review: "border-danger/30 bg-danger/5 text-danger",
};

export default async function TextileOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireTextilesModule();

  const order = await getTextileProductionOrder(org.organizationId, id);
  if (!order) notFound();

  const [trace, references, inputLots, processes, outsourced, suppliers] = await Promise.all([
    getOrderTraceabilityEvaluation(org.organizationId, id),
    listTextileReferences(org.organizationId),
    listTextileInputLots(org.organizationId),
    listTextileProcesses(org.organizationId),
    listTextileOutsourcedProcesses(org.organizationId),
    listTextileSuppliers(org.organizationId),
  ]);
  if (!trace) notFound();
  const { evaluation, consumptions, steps, outputLots, evidenceRows } = trace;

  const orderFields: CatalogFieldDef[] = [
    { key: "orderCode", label: "Código de la orden", type: "text", required: true },
    {
      key: "referenceId",
      label: "Referencia / SKU",
      type: "select",
      options: references.map((r) => ({ value: r.id, label: r.sku })),
    },
    { key: "plannedQuantity", label: "Cantidad planeada", type: "text" },
    { key: "producedQuantity", label: "Cantidad producida", type: "text" },
    { key: "unit", label: "Unidad", type: "text" },
    { key: "plannedStartDate", label: "Inicio planeado (AAAA-MM-DD)", type: "text" },
    { key: "plannedEndDate", label: "Fin planeado (AAAA-MM-DD)", type: "text" },
    { key: "actualStartDate", label: "Inicio real (AAAA-MM-DD)", type: "text" },
    { key: "actualEndDate", label: "Fin real (AAAA-MM-DD)", type: "text" },
    {
      key: "status",
      label: "Estado",
      type: "select",
      options: TEXTILE_ORDER_STATUSES.map((v) => ({ value: v, label: TEXTILE_ORDER_STATUS_LABEL[v] })),
    },
    { key: "responsibleArea", label: "Área responsable", type: "text" },
    { key: "notes", label: "Notas", type: "text" },
  ];

  const lotLabel = (l: (typeof inputLots)[number]) =>
    `${l.lotCode} · ${l.materialName ?? l.componentName ?? ""}${l.quantityRemaining !== null ? ` (saldo ${l.quantityRemaining} ${l.unit ?? ""})` : ""}`;

  const consumptionFields: CatalogFieldDef[] = [
    {
      key: "inputLotId",
      label: "Lote de entrada",
      type: "select",
      required: true,
      options: [
        { value: "", label: "— Selecciona un lote —" },
        ...inputLots
          .filter((l) => l.isActive && l.status !== "blocked" && l.status !== "archived")
          .map((l) => ({ value: l.id, label: lotLabel(l) })),
      ],
    },
    { key: "quantityConsumed", label: "Cantidad consumida", type: "text", required: true },
    { key: "unit", label: "Unidad", type: "text", required: true, help: "Debe coincidir con la del lote para controlar saldo" },
    {
      key: "consumptionRole",
      label: "Rol del consumo",
      type: "select",
      options: TEXTILE_CONSUMPTION_ROLES.map((v) => ({ value: v, label: TEXTILE_CONSUMPTION_ROLE_LABEL[v] })),
    },
    { key: "consumedAt", label: "Fecha (AAAA-MM-DD)", type: "text" },
    { key: "notes", label: "Notas", type: "text" },
  ];

  const consumptionRows: AssociationRowView[] = consumptions.map((c) => ({
    id: c.id,
    title: `${c.lotCode ?? "Lote"} · ${c.quantityConsumed} ${c.unit}`,
    display: [
      c.materialName ?? c.componentName ?? "",
      TEXTILE_CONSUMPTION_ROLE_LABEL[c.consumptionRole as keyof typeof TEXTILE_CONSUMPTION_ROLE_LABEL] ?? c.consumptionRole,
      c.supplierName ? `Proveedor: ${c.supplierName}` : "Sin proveedor",
      c.consumedAt ?? "",
    ].filter(Boolean),
    formValues: {
      inputLotId: c.inputLotId,
      quantityConsumed: String(c.quantityConsumed),
      unit: c.unit,
      consumptionRole: c.consumptionRole,
      consumedAt: c.consumedAt ?? "",
      notes: c.notes ?? "",
    },
  }));

  const stepFields: CatalogFieldDef[] = [
    {
      key: "stepType",
      label: "Tipo de proceso",
      type: "select",
      options: TEXTILE_STEP_TYPES.map((v) => ({ value: v, label: TEXTILE_STEP_TYPE_LABEL[v] })),
    },
    {
      key: "processId",
      label: "Proceso interno (si aplica)",
      type: "select",
      options: [
        { value: "", label: "—" },
        ...processes.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name })),
      ],
    },
    {
      key: "outsourcedProcessId",
      label: "Proceso tercerizado (si aplica)",
      type: "select",
      options: [
        { value: "", label: "—" },
        ...outsourced.filter((p) => p.isActive).map((p) => ({ value: p.id, label: p.name })),
      ],
    },
    { key: "name", label: "Nombre del paso", type: "text", required: true, placeholder: "p. ej. Corte, Estampado externo" },
    { key: "stepOrder", label: "Orden del paso", type: "text", placeholder: "1, 2, 3…" },
    {
      key: "supplierId",
      label: "Proveedor (tercerizados)",
      type: "select",
      options: [
        { value: "", label: "—" },
        ...suppliers.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name })),
      ],
    },
    { key: "responsibleName", label: "Responsable", type: "text" },
    { key: "plannedDate", label: "Fecha planeada (AAAA-MM-DD)", type: "text" },
    { key: "completedDate", label: "Fecha de cierre (AAAA-MM-DD)", type: "text" },
    {
      key: "status",
      label: "Estado",
      type: "select",
      options: TEXTILE_STEP_STATUSES.map((v) => ({ value: v, label: TEXTILE_STEP_STATUS_LABEL[v] })),
    },
    { key: "notes", label: "Notas", type: "text" },
  ];

  const stepRows: AssociationRowView[] = steps.map((s) => ({
    id: s.id,
    title: `${s.stepOrder !== null ? `${s.stepOrder}. ` : ""}${s.name}`,
    display: [
      TEXTILE_STEP_TYPE_LABEL[s.stepType as keyof typeof TEXTILE_STEP_TYPE_LABEL] ?? s.stepType,
      s.processName ?? s.outsourcedProcessName ?? "",
      s.supplierName ? `Proveedor: ${s.supplierName}` : "",
      TEXTILE_STEP_STATUS_LABEL[s.status as keyof typeof TEXTILE_STEP_STATUS_LABEL] ?? s.status,
    ].filter(Boolean),
    formValues: {
      stepType: s.stepType,
      processId: s.processId ?? "",
      outsourcedProcessId: s.outsourcedProcessId ?? "",
      name: s.name,
      stepOrder: s.stepOrder !== null ? String(s.stepOrder) : "",
      supplierId: s.supplierId ?? "",
      responsibleName: s.responsibleName ?? "",
      plannedDate: s.plannedDate ?? "",
      completedDate: s.completedDate ?? "",
      status: s.status,
      notes: s.notes ?? "",
    },
  }));

  const outputFields: CatalogFieldDef[] = [
    { key: "outputLotCode", label: "Código del lote final", type: "text", required: true, placeholder: "p. ej. LF-2026-001" },
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
        <p className="eyebrow">Trazaloop Textiles · Trazabilidad</p>
        <h1 className="text-2xl font-semibold tracking-tight">{order.orderCode}</h1>
        <p className="text-sm text-ink-soft">
          {[
            order.sku ? `Referencia: ${order.sku}` : "",
            order.productName ?? "",
            order.plannedQuantity !== null ? `Planeado: ${order.plannedQuantity} ${order.unit}` : "",
            TEXTILE_ORDER_STATUS_LABEL[order.status as keyof typeof TEXTILE_ORDER_STATUS_LABEL] ?? order.status,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_TRACEABILITY_DISCLAIMER}</p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link href="/textiles/traceability/orders" className="text-sm font-medium text-loop hover:underline">
            ← Órdenes
          </Link>
          {order.sku ? (
            <Link href={`/textiles/references/${order.referenceId}`} className="text-sm text-loop hover:underline">
              Ver referencia →
            </Link>
          ) : null}
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${TRACE_TONE[evaluation.status]}`}>
            Trazabilidad: {TEXTILE_TRACEABILITY_STATUS_LABEL[evaluation.status]}
          </span>
        </div>
      </header>

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

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Consumos de lotes de entrada</h2>
        <ReferenceAssociationManager<TextileConsumptionInput>
          referenceId={order.id}
          entityLabel="consumo"
          fields={consumptionFields}
          rows={consumptionRows}
          addAction={addTextileOrderConsumptionAction}
          updateAction={updateTextileOrderConsumptionAction}
          removeAction={removeTextileOrderConsumptionAction}
        />
      </section>

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Procesos internos y tercerizados</h2>
        <ReferenceAssociationManager<TextileStepInput>
          referenceId={order.id}
          entityLabel="proceso"
          fields={stepFields}
          rows={stepRows}
          addAction={addTextileOrderProcessStepAction}
          updateAction={updateTextileOrderProcessStepAction}
          removeAction={removeTextileOrderProcessStepAction}
        />
      </section>

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Lotes producidos / finales ({outputLots.length})</h2>
        {outputLots.length === 0 ? (
          <p className="text-xs text-ink-soft">Aún no hay lotes finales para esta orden.</p>
        ) : (
          <ul className="space-y-2">
            {outputLots.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/textiles/traceability/output-lots/${l.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-paper p-3 text-sm transition-colors hover:border-loop"
                >
                  <span className="font-medium">
                    {l.outputLotCode}
                    <span className="ml-2 text-xs text-ink-soft">
                      {l.quantityProduced} {l.unit}
                    </span>
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TRACE_TONE[l.traceabilityStatus as TextileTraceabilityStatus] ?? TRACE_TONE.not_started}`}>
                    {TEXTILE_TRACEABILITY_STATUS_LABEL[l.traceabilityStatus as TextileTraceabilityStatus] ?? l.traceabilityStatus}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <TextileEntityForm<TextileOutputLotInput>
          title="Nuevo lote final"
          fields={outputFields}
          fixedValues={{}}
          initialValues={{ status: "produced", unit: order.unit }}
          submitLabel="Crear lote final"
          createAction={createTextileOutputLotAction.bind(null, order.id)}
          successMessage="Lote final creado."
        />
      </section>

      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Evidencias vinculadas a la cadena ({evidenceRows.length})</h2>
        {evidenceRows.length === 0 ? (
          <p className="text-xs text-ink-soft">Sin evidencias vinculadas todavía.</p>
        ) : (
          <ul className="space-y-1 text-xs text-ink-soft">
            {evidenceRows.map((e) => (
              <li key={e.linkId}>
                <Link href={`/textiles/evidences/${e.evidence.id}`} className="text-loop hover:underline">
                  {e.evidence.title}
                </Link>{" "}
                · {TEXTILE_EVIDENCE_STATUS_LABEL[e.evidence.status as keyof typeof TEXTILE_EVIDENCE_STATUS_LABEL] ?? e.evidence.status}
              </li>
            ))}
          </ul>
        )}
        <Link href="/textiles/evidences" className="text-xs font-medium text-loop hover:underline">
          Gestionar evidencias →
        </Link>
      </section>

      <TextileEntityForm<TextileOrderInput>
        title="Editar orden"
        fields={orderFields}
        initialValues={{
          orderCode: order.orderCode,
          referenceId: order.referenceId,
          plannedQuantity: order.plannedQuantity !== null ? String(order.plannedQuantity) : "",
          producedQuantity: order.producedQuantity !== null ? String(order.producedQuantity) : "",
          unit: order.unit,
          plannedStartDate: order.plannedStartDate ?? "",
          plannedEndDate: order.plannedEndDate ?? "",
          actualStartDate: order.actualStartDate ?? "",
          actualEndDate: order.actualEndDate ?? "",
          status: order.status,
          responsibleArea: order.responsibleArea ?? "",
          notes: order.notes ?? "",
        }}
        submitLabel="Guardar cambios"
        entityId={order.id}
        updateAction={updateTextileProductionOrderAction}
        successMessage="Orden actualizada."
      />
    </div>
  );
}
