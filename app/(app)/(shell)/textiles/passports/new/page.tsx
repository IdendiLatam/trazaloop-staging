// Ruta protegida (guard del módulo Textil). Nunca se prerenderiza.
// Sprint T9C (Textil) · Crear pasaporte técnico (borrador + generación).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { listTextileReferences } from "@/lib/db/textiles-products";
import { listOutputLotsForPassport } from "@/lib/db/textiles-passport";
import { listTextileCircularityAssessments } from "@/lib/db/textiles-circularity";
import { TEXTILE_PASSPORT_DISCLAIMER } from "@/lib/domain/textiles-passport";
import { PassportCreateForm } from "@/components/textiles/passports/passport-create-form";

export default async function NewTextilePassportPage() {
  const org = await requireTextilesModule();
  const [references, lots, assessments] = await Promise.all([
    listTextileReferences(org.organizationId),
    listOutputLotsForPassport(org.organizationId),
    listTextileCircularityAssessments(org.organizationId),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Pasaportes</p>
        <h1 className="text-2xl font-semibold tracking-tight">Crear pasaporte técnico textil</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Seleccione la referencia/SKU y, si aplica, un lote producido/final y una evaluación de
          circularidad. El snapshot técnico se genera desde los datos existentes mediante el flujo
          controlado; no se editan datos calculados a mano.
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_PASSPORT_DISCLAIMER}</p>
        <div className="pt-1 text-sm font-medium">
          <Link href="/textiles/passports" className="text-loop hover:underline">
            ← Volver al listado
          </Link>
        </div>
      </header>

      {references.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface p-8 text-center">
          <p className="text-sm text-ink-soft">
            No hay referencias/SKU registradas. Cree primero un producto y su referencia en el
            catálogo de productos textiles.
          </p>
          <Link
            href="/textiles/products"
            className="mt-3 inline-block rounded-md border border-loop/40 bg-loop/5 px-4 py-2 text-sm font-medium text-loop-deep hover:border-loop"
          >
            Ir a productos textiles
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-hairline bg-surface p-5">
          <PassportCreateForm
            references={references.map((r) => ({
              id: r.id,
              sku: r.sku,
              name: r.name,
              productName: r.productName,
            }))}
            lots={lots.map((l) => ({ id: l.id, code: l.code, referenceId: l.referenceId }))}
            assessments={assessments.map((a) => ({
              id: a.id,
              code: a.assessmentCode,
              status: a.status,
              referenceId: a.referenceId,
            }))}
          />
        </div>
      )}
    </div>
  );
}
