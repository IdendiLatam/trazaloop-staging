"use client";

import { useActionState, useState } from "react";
import {
  uploadCompanyLogoAction,
  removeCompanyLogoAction,
  type SettingsActionState,
} from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

const initial: SettingsActionState = { error: null };

/** Logo de empresa (Sprint 9.2, Parte 6). Aparece en los documentos
 *  TrazaDocs al imprimir / guardar como PDF (Parte 8) — nunca PDF
 *  server-side, sigue siendo impresión del navegador. */
export function LogoUploadForm({
  logoUrl,
  logoStoragePath,
  canManage,
}: {
  logoUrl: string | null;
  logoStoragePath: string | null;
  canManage: boolean;
}) {
  const [uploadState, uploadAction, uploadPending] = useActionState(uploadCompanyLogoAction, initial);
  const [removeState, removeAction, removePending] = useActionState(removeCompanyLogoAction, initial);
  const [preview, setPreview] = useState<string | null>(null);

  if (!canManage) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">Logo de empresa</h2>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo de la empresa" className="max-h-24 max-w-xs rounded-md border border-hairline bg-surface p-2" />
        ) : (
          <p className="text-sm text-ink-soft">Esta empresa todavía no tiene logo cargado.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold">Logo de empresa</h2>
      <p className="text-xs text-ink-soft">
        Este logo aparecerá en los documentos TrazaDocs al imprimir o guardar como PDF desde el
        navegador. Recomendado: ancho mínimo 300&nbsp;px, proporción horizontal o cuadrada, máximo
        2&nbsp;MB.
      </p>

      {(preview ?? logoUrl) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview ?? logoUrl ?? undefined}
          alt="Vista previa del logo"
          className="max-h-24 max-w-xs rounded-md border border-hairline bg-surface p-2"
        />
      ) : (
        <p className="text-sm text-ink-soft">Todavía no has cargado un logo.</p>
      )}

      <ErrorAlert message={uploadState.error ?? removeState.error} />
      {uploadState.success ? <InfoAlert message="Logo actualizado correctamente." /> : null}
      {removeState.success ? <InfoAlert message="Logo eliminado." /> : null}

      <form action={uploadAction} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          name="logo"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
          className="text-sm"
        />
        <Button type="submit" disabled={uploadPending} className="!w-auto">
          {uploadPending ? "Subiendo…" : "Guardar logo"}
        </Button>
      </form>

      {logoStoragePath ? (
        <form action={removeAction}>
          <input type="hidden" name="storage_path" value={logoStoragePath} />
          <button
            type="submit"
            disabled={removePending}
            className="text-xs text-danger hover:underline disabled:opacity-60"
          >
            {removePending ? "Eliminando…" : "Eliminar logo"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
