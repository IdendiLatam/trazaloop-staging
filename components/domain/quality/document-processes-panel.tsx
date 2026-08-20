import "server-only";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { resolveModuleAccessForOrg } from "@/lib/db/module-access";
import { QUALITY_MODULE_CODE } from "@/lib/modules/catalog";
import { isQualityModuleEnabled } from "@/lib/modules/quality";
import { listQualityProcessesUsingDocument } from "@/lib/db/quality-processes";
import {
  QUALITY_DOCUMENT_RELATION_LABEL,
  QUALITY_PROCESS_STATUS_LABEL,
  type QualityDocumentRelation,
  type QualityProcessStatus,
} from "@/lib/domain/quality-processes";

/**
 * Trazaloop Quality · QUALITY-01 · Panel "Procesos que usan este documento".
 *
 * Se inserta en el detalle de un documento de TrazaDocs. Es la lectura INVERSA
 * de la relación proceso ↔ documento: desde el proceso ya se veía el documento;
 * sin esto, quien mantiene TrazaDocs no sabría a qué procesos afecta un
 * documento antes de marcarlo obsoleto.
 *
 * Componente de SERVIDOR y silencioso por diseño: si el módulo Quality no está
 * encendido o la empresa no lo tiene, no renderiza nada. Un texto del tipo
 * "Quality no está disponible" en una pantalla de TrazaDocs delataría la
 * existencia del módulo a quien no debe conocerlo.
 */
export async function DocumentQualityProcessesPanel({ documentId }: { documentId: string }) {
  if (!isQualityModuleEnabled()) return null;

  const org = await requireActiveOrg();
  const access = await resolveModuleAccessForOrg(org.organizationId, QUALITY_MODULE_CODE);
  if (!access.allowed) return null;

  const processes = await listQualityProcessesUsingDocument(org.organizationId, documentId);
  if (processes.length === 0) return null;

  return (
    <section className="rounded-lg border border-hairline bg-surface p-4">
      <h2 className="text-sm font-semibold">Procesos que usan este documento</h2>
      <p className="mt-0.5 text-xs text-ink-soft">
        Este documento está referenciado desde Trazaloop Quality. Tenlo en cuenta antes de
        marcarlo obsoleto: los procesos seguirían apuntando a él.
      </p>
      <ul className="mt-2 space-y-1">
        {processes.map((p) => (
          <li key={`${p.processId}-${p.relationType}`}>
            <Link
              href={`/quality/processes/${p.processId}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-hairline bg-paper px-2 py-1.5 text-xs transition-colors hover:border-loop"
            >
              <span className="font-medium text-loop">
                {p.processName}
                {p.processCode ? <span className="ml-2 text-ink-soft">{p.processCode}</span> : null}
              </span>
              <span className="text-ink-soft">
                {QUALITY_DOCUMENT_RELATION_LABEL[p.relationType as QualityDocumentRelation] ??
                  p.relationType}
                {" · "}
                {QUALITY_PROCESS_STATUS_LABEL[p.processStatus as QualityProcessStatus] ??
                  p.processStatus}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
