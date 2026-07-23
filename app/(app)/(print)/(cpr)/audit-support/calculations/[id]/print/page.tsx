// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Vista optimizada para impresión del
// navegador (@media print). NO genera PDF en servidor ni persiste documentos.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { getPrintableCalculationDossierAction } from "@/server/actions/audit-support";
import { listTraceabilityChain } from "@/lib/db/audit-support";
import { DossierBody } from "@/components/domain/audit-support/dossier-body";
import { PrintButton } from "@/components/domain/audit-support/print-button";

export default async function PrintableDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const org = await requireActiveOrg();
  const { id } = await params;
  const { data: bundle, generatedAt } = await getPrintableCalculationDossierAction(id);
  if (!bundle) notFound();

  const chain = bundle.dossier.production_order_id
    ? await listTraceabilityChain(org.organizationId, bundle.dossier.production_order_id)
    : [];

  return (
    <div className="print-page space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/audit-support/calculations/${id}`}
          className="text-sm text-loop hover:underline"
        >
          ← Volver al dossier
        </Link>
        <PrintButton />
      </div>

      <DossierBody bundle={bundle} chain={chain} printMode />

      <footer className="border-t border-hairline pt-4 text-xs text-ink-soft">
        <p>
          Vista generada el {new Date(generatedAt).toLocaleString("es-CO")}.
        </p>
        <p className="mt-2">
          Este dossier consolida información trazable disponible en Trazaloop
          para el cálculo seleccionado. El resultado se basa en el snapshot de
          cálculo, la metodología registrada y las evidencias asociadas al
          momento de la consulta. Este documento no constituye por sí mismo
          una certificación.
        </p>
      </footer>
    </div>
  );
}
