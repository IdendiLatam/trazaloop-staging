// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T4 (Textil) · Detalle de referencia/SKU: edición,
// composición de fibras (con estado de completitud calculado en vivo),
// materiales asociados y avíos/componentes asociados.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  getTextileReference,
  listReferenceFiberComposition,
  listReferenceMaterials,
  listReferenceComponents,
  listTextileProducts,
} from "@/lib/db/textiles-products";
import {
  listTextileFiberTypes,
  listTextileMaterials,
  listTextileComponents,
} from "@/lib/db/textiles-catalogs";
import {
  TEXTILE_PRODUCT_STATUSES,
  TEXTILE_PRODUCT_STATUS_LABEL,
  TEXTILE_COMPOSITION_STATUS_LABEL,
  TEXTILE_FIBER_SCOPES,
  TEXTILE_FIBER_SCOPE_LABEL,
  TEXTILE_REFERENCE_MATERIAL_ROLES,
  TEXTILE_REFERENCE_MATERIAL_ROLE_LABEL,
  TEXTILE_REFERENCE_COMPONENT_ROLES,
  TEXTILE_REFERENCE_COMPONENT_ROLE_LABEL,
  TEXTILE_PRODUCTS_DISCLAIMER,
  computeReferenceComposition,
  summarizeReferenceAssociations,
  type TextileCompositionStatus,
} from "@/lib/domain/textiles-products";
import {
  TEXTILE_SEPARABILITY_VALUES,
  TEXTILE_SEPARABILITY_LABEL,
} from "@/lib/domain/textiles-catalogs";
import { listEntityTextileEvidences } from "@/lib/db/textiles-evidences";
import { listTextileProductionOrders, listTextileOutputLots } from "@/lib/db/textiles-traceability";
import { listTextileCircularityAssessments } from "@/lib/db/textiles-circularity";
import { TEXTILE_READINESS_LEVEL_LABEL } from "@/lib/domain/textiles-circularity";
import {
  computeReferenceEvidenceGaps,
  TEXTILE_EVIDENCE_STATUS_LABEL,
} from "@/lib/domain/textiles-evidences";
import {
  updateTextileReferenceAction,
  setTextileReferenceActiveAction,
  addReferenceFiberAction,
  updateReferenceFiberAction,
  removeReferenceFiberAction,
  addReferenceMaterialAction,
  updateReferenceMaterialAction,
  removeReferenceMaterialAction,
  addReferenceComponentAction,
  updateReferenceComponentAction,
  removeReferenceComponentAction,
  type TextileReferenceInput,
  type ReferenceFiberInput,
  type ReferenceMaterialInput,
  type ReferenceComponentInput,
} from "@/server/actions/textiles-products";
import { TextileEntityForm } from "@/components/domain/textiles/entity-form";
import { ToggleActiveButton } from "@/components/domain/textiles/toggle-active-button";
import {
  ReferenceAssociationManager,
  type AssociationRowView,
} from "@/components/domain/textiles/reference-association-manager";
import type { CatalogFieldDef } from "@/components/domain/textiles/catalog-manager";

const STATUS_TONE: Record<TextileCompositionStatus, string> = {
  not_started: "border-hairline bg-paper text-ink-soft",
  incomplete: "border-amber/40 bg-amber/10 text-amber",
  complete: "border-loop/30 bg-loop/5 text-loop-deep",
  needs_review: "border-danger/30 bg-danger/5 text-danger",
};

export default async function TextileReferenceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const org = await requireTextilesModule();

  const reference = await getTextileReference(org.organizationId, id);
  if (!reference) notFound();

  const [fiberRows, materialRows, componentRows, products, fiberTypes, materials, components, referenceOrders] =
    await Promise.all([
      listReferenceFiberComposition(org.organizationId, id),
      listReferenceMaterials(org.organizationId, id),
      listReferenceComponents(org.organizationId, id),
      listTextileProducts(org.organizationId),
      listTextileFiberTypes(),
      listTextileMaterials(org.organizationId),
      listTextileComponents(org.organizationId),
      listTextileProductionOrders(org.organizationId, { referenceId: id }),
    ]);
  // Evaluaciones de circularidad de esta referencia (T7).
  const circularityAssessments = await listTextileCircularityAssessments(org.organizationId, {
    referenceId: reference.id,
  });
  const lastAssessment = circularityAssessments[0] ?? null;

  // Lotes finales de las órdenes de esta referencia (T6).
  const allOutputLots = await listTextileOutputLots(org.organizationId);
  const referenceOrderIds = new Set(referenceOrders.map((o) => o.id));
  const referenceOutputLots = allOutputLots.filter((l) => referenceOrderIds.has(l.orderId));

  // Estado de completitud calculado EN VIVO desde las filas (el campo
  // persistido se recalcula en cada mutación; describe completitud, no
  // cumplimiento).
  const evaluation = computeReferenceComposition(
    fiberRows.map((f) => ({ scope: f.scope, percentage: f.percentage }))
  );

  // T5: evidencias que tocan esta referencia (directas + de sus fibras) y
  // brechas simples informativas (nunca bloquean la composición).
  const evidenceRows = await listEntityTextileEvidences(org.organizationId, [
    { entityType: "reference", entityId: reference.id },
    ...fiberRows.map((f) => ({ entityType: "fiber_composition", entityId: f.id })),
  ]);
  const evidenceGaps = computeReferenceEvidenceGaps({
    fibers: fiberRows.map((f) => ({
      id: f.id,
      fiberName: f.fiberName,
      isRecycledDeclared: f.isRecycledDeclared,
      isOrganicDeclared: f.isOrganicDeclared,
    })),
    links: evidenceRows.map((e) => ({
      entityType: e.entityType,
      entityId: e.entityId,
      linkType: e.linkType,
    })),
  });
  const associations = summarizeReferenceAssociations({
    materialRoles: materialRows.map((m) => m.role),
    componentCount: componentRows.length,
  });

  const referenceFields: CatalogFieldDef[] = [
    { key: "sku", label: "SKU", type: "text", required: true },
    { key: "name", label: "Nombre comercial", type: "text" },
    {
      key: "productId",
      label: "Producto",
      type: "select",
      options: products.map((p) => ({ value: p.id, label: p.name })),
    },
    {
      key: "status",
      label: "Estado",
      type: "select",
      options: TEXTILE_PRODUCT_STATUSES.map((v) => ({ value: v, label: TEXTILE_PRODUCT_STATUS_LABEL[v] })),
    },
    { key: "color", label: "Color", type: "text" },
    { key: "sizeRange", label: "Rango de tallas", type: "text" },
    { key: "genderOrFit", label: "Género / fit", type: "text" },
    { key: "versionLabel", label: "Versión", type: "text" },
    { key: "description", label: "Descripción", type: "text" },
    { key: "notes", label: "Notas", type: "text" },
  ];

  const activeFibers = fiberTypes.filter((f) => f.isActive);
  const fiberFields: CatalogFieldDef[] = [
    {
      key: "fiberTypeId",
      label: "Fibra",
      type: "select",
      required: true,
      options: [
        { value: "", label: "— Selecciona una fibra —" },
        ...activeFibers.map((f) => ({
          value: f.id,
          label: f.organizationId ? `${f.name} (personalizada)` : f.name,
        })),
      ],
    },
    { key: "percentage", label: "Porcentaje (%)", type: "text", required: true, placeholder: "p. ej. 95" },
    {
      key: "scope",
      label: "Alcance",
      type: "select",
      options: TEXTILE_FIBER_SCOPES.map((v) => ({ value: v, label: TEXTILE_FIBER_SCOPE_LABEL[v] })),
    },
    {
      key: "sourceMaterialId",
      label: "Material fuente",
      type: "select",
      options: [
        { value: "", label: "— Sin material fuente —" },
        ...materials.map((m) => ({ value: m.id, label: m.name })),
      ],
    },
    { key: "isRecycledDeclared", label: "Reciclado (declarado)", type: "checkbox", help: "Declaración preliminar sin evidencia todavía" },
    { key: "isOrganicDeclared", label: "Orgánico (declarado)", type: "checkbox", help: "Declaración preliminar sin evidencia todavía" },
    { key: "notes", label: "Notas", type: "text" },
  ];

  const fiberAssocRows: AssociationRowView[] = fiberRows.map((f) => ({
    id: f.id,
    title: `${f.fiberName ?? "Fibra"} · ${f.percentage} %`,
    display: [
      TEXTILE_FIBER_SCOPE_LABEL[f.scope as keyof typeof TEXTILE_FIBER_SCOPE_LABEL] ?? f.scope,
      f.sourceMaterialName ? `Fuente: ${f.sourceMaterialName}` : "",
      f.isRecycledDeclared ? "Reciclado (declarado)" : "",
      f.isOrganicDeclared ? "Orgánico (declarado)" : "",
    ].filter(Boolean),
    formValues: {
      fiberTypeId: f.fiberTypeId,
      percentage: String(f.percentage),
      scope: f.scope,
      sourceMaterialId: f.sourceMaterialId ?? "",
      isRecycledDeclared: f.isRecycledDeclared,
      isOrganicDeclared: f.isOrganicDeclared,
      notes: f.notes ?? "",
    },
  }));

  const materialFields: CatalogFieldDef[] = [
    {
      key: "materialId",
      label: "Material",
      type: "select",
      required: true,
      options: [
        { value: "", label: "— Selecciona un material —" },
        ...materials.map((m) => ({ value: m.id, label: m.name })),
      ],
      help: "Se administran en Catálogos → Materiales e insumos",
    },
    {
      key: "role",
      label: "Rol",
      type: "select",
      options: TEXTILE_REFERENCE_MATERIAL_ROLES.map((v) => ({ value: v, label: TEXTILE_REFERENCE_MATERIAL_ROLE_LABEL[v] })),
    },
    { key: "estimatedPercentage", label: "Porcentaje estimado (%)", type: "text", help: "Opcional" },
    { key: "quantityDescription", label: "Cantidad / consumo", type: "text", placeholder: "p. ej. 1.4 m por unidad" },
    { key: "notes", label: "Notas", type: "text" },
  ];

  const materialAssocRows: AssociationRowView[] = materialRows.map((m) => ({
    id: m.id,
    title: m.materialName ?? "Material",
    display: [
      TEXTILE_REFERENCE_MATERIAL_ROLE_LABEL[m.role as keyof typeof TEXTILE_REFERENCE_MATERIAL_ROLE_LABEL] ?? m.role,
      m.estimatedPercentage !== null ? `${m.estimatedPercentage} % estimado` : "",
      m.quantityDescription ?? "",
    ].filter(Boolean),
    formValues: {
      materialId: m.materialId,
      role: m.role,
      estimatedPercentage: m.estimatedPercentage !== null ? String(m.estimatedPercentage) : "",
      quantityDescription: m.quantityDescription ?? "",
      notes: m.notes ?? "",
    },
  }));

  const componentFields: CatalogFieldDef[] = [
    {
      key: "componentId",
      label: "Componente / avío",
      type: "select",
      required: true,
      options: [
        { value: "", label: "— Selecciona un componente —" },
        ...components.map((c) => ({ value: c.id, label: c.name })),
      ],
      help: "Se administran en Catálogos → Avíos / componentes",
    },
    {
      key: "role",
      label: "Rol",
      type: "select",
      options: TEXTILE_REFERENCE_COMPONENT_ROLES.map((v) => ({ value: v, label: TEXTILE_REFERENCE_COMPONENT_ROLE_LABEL[v] })),
    },
    { key: "quantityDescription", label: "Cantidad / descripción", type: "text", placeholder: "p. ej. 8 botones por unidad" },
    {
      key: "separabilityOverride",
      label: "Separabilidad en esta referencia",
      type: "select",
      options: [
        { value: "", label: "— La del catálogo —" },
        ...TEXTILE_SEPARABILITY_VALUES.map((v) => ({ value: v, label: TEXTILE_SEPARABILITY_LABEL[v] })),
      ],
    },
    { key: "replacementPossibleOverride", label: "Reemplazable en esta referencia", type: "checkbox" },
    { key: "notes", label: "Notas", type: "text" },
  ];

  const componentAssocRows: AssociationRowView[] = componentRows.map((c) => ({
    id: c.id,
    title: c.componentName ?? "Componente",
    display: [
      TEXTILE_REFERENCE_COMPONENT_ROLE_LABEL[c.role as keyof typeof TEXTILE_REFERENCE_COMPONENT_ROLE_LABEL] ?? c.role,
      c.quantityDescription ?? "",
      c.separabilityOverride
        ? `Separabilidad: ${TEXTILE_SEPARABILITY_LABEL[c.separabilityOverride as keyof typeof TEXTILE_SEPARABILITY_LABEL] ?? c.separabilityOverride}`
        : "",
      c.replacementPossibleOverride ? "Reemplazable" : "",
    ].filter(Boolean),
    formValues: {
      componentId: c.componentId,
      role: c.role,
      quantityDescription: c.quantityDescription ?? "",
      separabilityOverride: c.separabilityOverride ?? "",
      replacementPossibleOverride: Boolean(c.replacementPossibleOverride),
      notes: c.notes ?? "",
    },
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Referencias</p>
        <h1 className="text-2xl font-semibold tracking-tight">{reference.sku}</h1>
        <p className="text-sm text-ink-soft">
          {[
            reference.name ?? "",
            reference.productName ? `Producto: ${reference.productName}` : "",
            reference.color ?? "",
            reference.sizeRange ?? "",
            TEXTILE_PRODUCT_STATUS_LABEL[reference.status as keyof typeof TEXTILE_PRODUCT_STATUS_LABEL] ?? reference.status,
            reference.isActive ? "Activa" : "Inactiva",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_PRODUCTS_DISCLAIMER}</p>
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <Link
            href={`/textiles/products/${reference.productId}`}
            className="text-sm font-medium text-loop hover:underline"
          >
            ← Volver al producto
          </Link>
          <ToggleActiveButton
            entityId={reference.id}
            isActive={reference.isActive}
            action={setTextileReferenceActiveAction}
          />
        </div>
      </header>

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Composición de fibras</h2>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_TONE[evaluation.status]}`}
          >
            {TEXTILE_COMPOSITION_STATUS_LABEL[evaluation.status]}
          </span>
        </div>
        {evaluation.scopeTotals.length > 0 ? (
          <ul className="flex flex-wrap gap-2 text-xs text-ink-soft">
            {evaluation.scopeTotals.map((st) => (
              <li key={st.scope} className="rounded-full border border-hairline bg-paper px-2 py-0.5">
                {(TEXTILE_FIBER_SCOPE_LABEL[st.scope as keyof typeof TEXTILE_FIBER_SCOPE_LABEL] ?? st.scope)}: {st.total} %
              </li>
            ))}
          </ul>
        ) : null}
        {evaluation.warnings.map((w) => (
          <p key={w} className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
            {w}
          </p>
        ))}
        <ReferenceAssociationManager<ReferenceFiberInput>
          referenceId={reference.id}
          entityLabel="fibra"
          fields={fiberFields}
          rows={fiberAssocRows}
          addAction={addReferenceFiberAction}
          updateAction={updateReferenceFiberAction}
          removeAction={removeReferenceFiberAction}
        />
      </section>

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Evidencias asociadas</h2>
          <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] text-ink-soft">
            {evidenceRows.length} vínculo{evidenceRows.length === 1 ? "" : "s"}
          </span>
        </div>
        {evidenceGaps.map((gap) => (
          <p key={gap.code + gap.message} className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
            {gap.message}
          </p>
        ))}
        {evidenceRows.length > 0 ? (
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
        ) : (
          <p className="text-xs text-ink-soft">Sin evidencias vinculadas todavía.</p>
        )}
        <Link href="/textiles/evidences" className="text-xs font-medium text-loop hover:underline">
          Gestionar evidencias →
        </Link>
      </section>

      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Trazabilidad de esta referencia</h2>
        <p className="text-xs text-ink-soft">
          {referenceOrders.length === 0
            ? "Sin órdenes/corridas asociadas todavía."
            : `${referenceOrders.length} orden(es)/corrida(s) y ${referenceOutputLots.length} lote(s) final(es) asociados.`}
        </p>
        {referenceOrders.length > 0 ? (
          <ul className="space-y-1 text-xs text-ink-soft">
            {referenceOrders.slice(0, 5).map((o) => (
              <li key={o.id}>
                <Link href={`/textiles/traceability/orders/${o.id}`} className="text-loop hover:underline">
                  {o.orderCode}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <Link href="/textiles/traceability/orders" className="text-xs font-medium text-loop hover:underline">
          Ir a trazabilidad →
        </Link>
      </section>

      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Evaluaciones de circularidad</h2>
        <p className="text-xs text-ink-soft">
          {circularityAssessments.length === 0
            ? "Sin evaluaciones de circularidad todavía."
            : `${circularityAssessments.length} evaluación(es). Última: ${lastAssessment?.assessmentCode ?? ""}${
                lastAssessment?.circularityScore !== null && lastAssessment
                  ? ` · ${lastAssessment.circularityScore} / 100 · ${
                      TEXTILE_READINESS_LEVEL_LABEL[
                        lastAssessment.readinessLevel as keyof typeof TEXTILE_READINESS_LEVEL_LABEL
                      ] ?? lastAssessment.readinessLevel ?? "sin nivel"
                    }`
                  : " · sin calcular"
              }.`}
        </p>
        {lastAssessment ? (
          <Link
            href={`/textiles/circularity/assessments/${lastAssessment.id}`}
            className="text-xs font-medium text-loop hover:underline"
          >
            Ver última evaluación →
          </Link>
        ) : null}
        <Link href="/textiles/circularity/assessments/new" className="text-xs font-medium text-loop hover:underline">
          Crear evaluación de circularidad →
        </Link>
      </section>

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Materiales asociados</h2>
        {associations.notes.map((n) => (
          <p key={n} className="text-xs text-ink-soft">{n}</p>
        ))}
        <ReferenceAssociationManager<ReferenceMaterialInput>
          referenceId={reference.id}
          entityLabel="material"
          fields={materialFields}
          rows={materialAssocRows}
          addAction={addReferenceMaterialAction}
          updateAction={updateReferenceMaterialAction}
          removeAction={removeReferenceMaterialAction}
        />
      </section>

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Avíos / componentes asociados</h2>
        <ReferenceAssociationManager<ReferenceComponentInput>
          referenceId={reference.id}
          entityLabel="componente"
          fields={componentFields}
          rows={componentAssocRows}
          addAction={addReferenceComponentAction}
          updateAction={updateReferenceComponentAction}
          removeAction={removeReferenceComponentAction}
        />
      </section>

      <TextileEntityForm<TextileReferenceInput>
        title="Editar referencia"
        fields={referenceFields}
        initialValues={{
          sku: reference.sku,
          name: reference.name ?? "",
          productId: reference.productId,
          status: reference.status,
          color: reference.color ?? "",
          sizeRange: reference.sizeRange ?? "",
          genderOrFit: reference.genderOrFit ?? "",
          versionLabel: reference.versionLabel ?? "",
          description: reference.description ?? "",
          notes: reference.notes ?? "",
        }}
        submitLabel="Guardar cambios"
        entityId={reference.id}
        updateAction={updateTextileReferenceAction}
        successMessage="Referencia actualizada."
      />
    </div>
  );
}
