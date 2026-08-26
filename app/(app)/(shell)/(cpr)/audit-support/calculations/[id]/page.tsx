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
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

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
          {/* EXPORT-01.1 (§54) · La descarga real sustituye a la vista de
              impresión del navegador: un solo nombre en toda la plataforma, y
              un PDF generado EN SERVIDOR en vez de una captura de pantalla. */}
          <ExportPdfButton exportKey="cpr.support-calculation.detail" id={id} />
          <ExportDossierJsonButton calculationId={id} />
          <ExportMatrixCsvButton outputBatchId={bundle.dossier.output_batch_id} />
          <Link
            href={`/audit-support/output-batches/${bundle.dossier.output_batch_id}/evidence-matrix`}
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop"
          >
            Matriz de evidencias
          </Link>
          <Link
            href="/support/new?module=diagnostic"
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-ink-soft hover:border-loop"
          >
            Crear ticket de soporte sobre este dossier
          </Link>
        </div>
      </div>

      <DossierBody bundle={bundle} chain={chain} />
    </div>
  );
}
