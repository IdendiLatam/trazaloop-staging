// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getCalculationDossierAction } from "@/server/actions/audit-support";
import { listTraceabilityChain } from "@/lib/db/audit-support";
import { DossierBody } from "@/components/domain/audit-support/dossier-body";
import { ExportDossierJsonButton, ExportMatrixCsvButton } from "@/components/domain/audit-support/export-buttons";

export default async function CalculationDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const org = await requireActiveOrg();
  const { id } = await params;
  const { data: bundle } = await getCalculationDossierAction(id);
  if (!bundle) notFound();

  const chain = bundle.dossier.production_order_id
    ? await listTraceabilityChain(org.organizationId, bundle.dossier.production_order_id)
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow">
          <Link href="/audit-support" className="hover:underline">Soporte técnico</Link> · Dossier
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/audit-support/calculations/${id}/print`}
            className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
          >
            Imprimir / guardar como PDF
          </Link>
          <ExportDossierJsonButton calculationId={id} />
          <ExportMatrixCsvButton outputBatchId={bundle.dossier.output_batch_id} />
          <Link
            href={`/audit-support/output-batches/${bundle.dossier.output_batch_id}/evidence-matrix`}
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Matriz de evidencias
          </Link>
        </div>
      </div>

      <DossierBody bundle={bundle} chain={chain} />
    </div>
  );
}
