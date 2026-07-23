// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { listReferenceCircularityContexts } from "@/lib/db/textiles-circularity";
import { TEXTILE_CIRCULARITY_DISCLAIMER } from "@/lib/domain/textiles-circularity";
import { TextileEntityForm } from "@/components/domain/textiles/entity-form";
import type { CatalogFieldDef } from "@/components/domain/textiles/catalog-manager";
import {
  createTextileCircularityAssessmentAction,
  type TextileCircularityAssessmentInput,
} from "@/server/actions/textiles-circularity";

export default async function NewTextileCircularityAssessmentPage() {
  const org = await requireTextilesModule();
  const contexts = await listReferenceCircularityContexts(org.organizationId);

  const fields: CatalogFieldDef[] = [
    {
      key: "assessmentCode",
      label: "Código de la evaluación",
      type: "text",
      required: true,
      placeholder: "EC-2026-001",
    },
    {
      key: "referenceId",
      label: "Referencia / SKU",
      type: "select",
      required: true,
      options: contexts.map((c) => ({
        value: c.referenceId,
        label: `${c.sku}${c.productName ? ` · ${c.productName}` : ""}`,
      })),
      help: "La evaluación se calcula desde la composición, materiales, componentes, evidencias y trazabilidad de la referencia.",
    },
    {
      key: "outputLotId",
      label: "Lote producido / final (opcional)",
      type: "select",
      options: [
        { value: "", label: "— Sin lote (evaluar solo la referencia) —" },
        ...contexts.flatMap((c) =>
          c.outputLots.map((l) => ({ value: l.id, label: `${l.code} · ${c.sku}` }))
        ),
      ],
      help: "Debe pertenecer a una orden de la misma referencia evaluada (se valida en servidor).",
    },
    { key: "assessmentDate", label: "Fecha de evaluación (AAAA-MM-DD)", type: "text", placeholder: "2026-07-18" },
    { key: "notes", label: "Notas", type: "text" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Circularidad</p>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva evaluación de circularidad</h1>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_CIRCULARITY_DISCLAIMER}</p>
        <Link href="/textiles/circularity/assessments" className="text-sm font-medium text-loop hover:underline">
          ← Evaluaciones
        </Link>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Contexto disponible por referencia</h2>
        {contexts.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
            No hay referencias activas. Crea primero productos y referencias (T4).
          </p>
        ) : (
          <ul className="space-y-1">
            {contexts.map((c) => (
              <li
                key={c.referenceId}
                className="rounded-lg border border-hairline bg-surface p-3 text-xs text-ink-soft"
              >
                <span className="font-medium text-ink">{c.sku}</span>
                {c.productName ? ` · ${c.productName}` : ""} — composición: {c.fiberRows} fibra(s) ·
                materiales: {c.materialsCount} · componentes: {c.componentsCount} · evidencias
                vinculadas: {c.evidenceLinks} · lotes finales: {c.outputLots.length}
              </li>
            ))}
          </ul>
        )}
      </section>

      {contexts.length > 0 ? (
        <TextileEntityForm<TextileCircularityAssessmentInput>
          title="Crear evaluación (borrador)"
          fields={fields}
          submitLabel="Crear evaluación"
          createAction={createTextileCircularityAssessmentAction}
          successMessage="Evaluación creada como borrador. Ábrela desde el listado para responder criterios y calcular."
        />
      ) : null}
    </div>
  );
}
