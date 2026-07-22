"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  createPassportShareLinkAction,
  revokePassportShareLinkAction,
} from "@/server/actions/textiles-passport-share";
import {
  TEXTILE_SHARE_LINK_STATUS_LABEL,
  TEXTILE_SHARE_LINK_STATUS_TONE,
  TEXTILE_SHARE_LINK_EXPIRY_OPTIONS,
  TEXTILE_SHARE_LINK_SECURITY_NOTE,
  effectiveShareLinkStatus,
  type TextileShareLinkStatus,
} from "@/lib/domain/textiles-passport";

type LinkRow = {
  id: string;
  tokenPrefix: string | null;
  label: string | null;
  status: TextileShareLinkStatus;
  expiresAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
};

/**
 * Trazaloop · Sprint T9D (Textil) · Gestión de enlaces privados del pasaporte.
 * Crear (admin/quality) devuelve el enlace completo UNA sola vez; después solo
 * se ve el prefijo. Revocar es irreversible. La resolución del token la hace la
 * ruta pública vía RPC controlada; aquí no se maneja el token en claro salvo el
 * recién creado.
 */
export function ShareLinkManager({
  passportId,
  links,
  shareBaseUrl,
  canManage,
}: {
  passportId: string;
  links: LinkRow[];
  shareBaseUrl: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [expiry, setExpiry] = useState("30");
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const freshUrl = freshToken ? `${shareBaseUrl}/${freshToken}` : null;

  useEffect(() => {
    if (!freshUrl) return;
    let active = true;
    QRCode.toDataURL(freshUrl, { margin: 1, width: 160, errorCorrectionLevel: "M" })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [freshUrl]);

  function create() {
    setError(null);
    setFreshToken(null);
    setQrDataUrl(null);
    setCopied(false);
    startTransition(async () => {
      const res = await createPassportShareLinkAction({
        passportId,
        label: label || null,
        expiryChoice: expiry,
      });
      if (res.error || !res.token) {
        setError(res.error ?? "No se pudo crear el enlace.");
        return;
      }
      setFreshToken(res.token);
      setLabel("");
      router.refresh();
    });
  }

  function revoke(linkId: string) {
    setError(null);
    startTransition(async () => {
      const res = await revokePassportShareLinkAction(passportId, linkId);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  async function copyFresh() {
    if (!freshUrl) return;
    try {
      await navigator.clipboard.writeText(freshUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-hairline bg-surface p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Compartir / QR</h2>
        <p className="text-xs text-ink-soft">
          Genere un enlace privado, revocable y con expiración para consultar una vista reducida de
          este pasaporte. No es un pasaporte oficial ni una certificación.
        </p>
      </div>

      {/* Enlace recién creado: se muestra completo UNA sola vez */}
      {freshUrl ? (
        <div className="space-y-2 rounded-md border border-loop/30 bg-loop/5 p-3">
          <p className="text-xs font-medium text-loop-deep">
            Enlace creado. Cópielo ahora: por seguridad no se volverá a mostrar completo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all rounded bg-surface px-2 py-1 text-xs">{freshUrl}</code>
            <button
              type="button"
              onClick={copyFresh}
              className="rounded-md border border-loop/40 bg-surface px-2 py-1 text-xs font-medium text-loop-deep hover:border-loop"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          {qrDataUrl ? (
            <div className="flex flex-col items-center gap-1 pt-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Código QR del enlace del pasaporte"
                width={160}
                height={160}
                className="rounded-md border border-hairline bg-white p-2"
              />
              <span className="text-[11px] text-ink-soft">Escanee para abrir la vista compartida</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Crear enlace (solo admin/quality) */}
      {canManage ? (
        <div className="space-y-2 rounded-md border border-hairline bg-paper p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-soft">Etiqueta (opcional)</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="rounded-md border border-hairline bg-surface px-2 py-1 text-sm"
                placeholder="p. ej. Cliente X"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-xs">
              <span className="text-ink-soft">Expiración</span>
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="rounded-md border border-hairline bg-surface px-2 py-1 text-sm"
              >
                {TEXTILE_SHARE_LINK_EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={create}
              className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep disabled:opacity-50"
            >
              Crear enlace privado
            </button>
          </div>
          <p className="text-[11px] text-ink-soft">{TEXTILE_SHARE_LINK_SECURITY_NOTE}</p>
        </div>
      ) : (
        <p className="text-xs text-ink-soft">Solo administradores o calidad pueden crear o revocar enlaces.</p>
      )}

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {/* Enlaces existentes */}
      {links.length === 0 ? (
        <p className="text-xs text-ink-soft">No hay enlaces compartibles para este pasaporte.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-hairline text-left text-ink-soft">
                <th className="py-1.5 pr-3 font-medium">Enlace</th>
                <th className="py-1.5 pr-3 font-medium">Etiqueta</th>
                <th className="py-1.5 pr-3 font-medium">Estado</th>
                <th className="py-1.5 pr-3 font-medium">Expira</th>
                <th className="py-1.5 pr-3 font-medium">Accesos</th>
                <th className="py-1.5 pr-3 font-medium">Último acceso</th>
                <th className="py-1.5 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {links.map((l) => {
                const eff = effectiveShareLinkStatus(l.status, l.expiresAt);
                return (
                  <tr key={l.id} className="border-b border-hairline/60 align-middle">
                    <td className="py-1.5 pr-3">
                      <code className="text-[11px]">{l.tokenPrefix ? `${l.tokenPrefix}…` : "—"}</code>
                    </td>
                    <td className="py-1.5 pr-3">{l.label ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${TEXTILE_SHARE_LINK_STATUS_TONE[eff]}`}>
                        {TEXTILE_SHARE_LINK_STATUS_LABEL[eff]}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-ink-soft">{l.expiresAt ? l.expiresAt.slice(0, 10) : "Sin expiración"}</td>
                    <td className="py-1.5 pr-3 text-ink-soft">{l.accessCount}</td>
                    <td className="py-1.5 pr-3 text-ink-soft">{l.lastAccessedAt ? l.lastAccessedAt.slice(0, 10) : "—"}</td>
                    <td className="py-1.5 pr-3">
                      {canManage && eff !== "revoked" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => revoke(l.id)}
                          className="rounded-md border border-danger/30 bg-danger/5 px-2 py-1 text-[11px] font-medium text-danger hover:border-danger disabled:opacity-50"
                        >
                          Revocar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
