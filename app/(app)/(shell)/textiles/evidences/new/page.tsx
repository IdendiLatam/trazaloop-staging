// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  TEXTILE_EVIDENCES_DISCLAIMER,
  canUploadTextileEvidence,
} from "@/lib/domain/textiles-evidences";
import {
  beginTextileEvidenceUploadAction,
  finalizeTextileEvidenceUploadAction,
} from "@/server/actions/textiles-evidences";
import { TextileEvidenceForm } from "@/components/domain/textiles/evidence-upload-form";

export default async function NewTextileEvidencePage() {
  const org = await requireTextilesModule();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Evidencias</p>
        <h1 className="text-2xl font-semibold tracking-tight">Cargar evidencia</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          El archivo se sube DIRECTAMENTE al bucket privado de la organización (nunca
          atraviesa el servidor de la aplicación) y queda en revisión pendiente. Después podrás vincularlo a proveedores, materiales,
          productos, referencias o fibras.
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_EVIDENCES_DISCLAIMER}</p>
        <Link href="/textiles/evidences" className="text-sm font-medium text-loop hover:underline">
          ← Evidencias textiles
        </Link>
      </header>
      {canUploadTextileEvidence(org.roleCode) ? (
        <TextileEvidenceForm
          beginUploadAction={beginTextileEvidenceUploadAction}
          finalizeUploadAction={finalizeTextileEvidenceUploadAction}
        />
      ) : (
        <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
          La carga de evidencias corresponde a administrador, calidad o consultor. Puedes
          consultar las evidencias existentes desde el listado.
        </p>
      )}
    </div>
  );
}
