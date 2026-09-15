"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCampaignAction, updateCampaignAction,
  openCampaignAction, closeCampaignAction, archiveCampaignAction,
  type AdminActionState,
} from "@/server/actions/public-diagnostics-admin";
import type { ConsentDocumentOption, VersionOption } from "@/lib/db/public-diagnostics";
import { suggestCampaignSlug } from "@/lib/domain/public-diagnostics";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01D · Los formularios de campaña.
 *
 * Deshabilitar un campo congelado es una cortesía: dice por qué no se puede
 * tocar en vez de dejar que alguien escriba y se lleve un error al guardar.
 * NO es la protección — esa está en la acción de servidor y, debajo, en la
 * base. Aquí solo se procura que no haga falta llegar hasta ahí.
 */

const inicial: AdminActionState = { error: null };

const campo = "w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm";
const etiqueta = "block text-sm font-medium";

function Campos({
  versions, consentDocuments, valores, congelado,
}: {
  versions: VersionOption[];
  consentDocuments: ConsentDocumentOption[];
  valores?: Partial<Record<string, string | boolean | null>>;
  /** Con participaciones o ya abierta: instrumento y evidencia no se tocan. */
  congelado: boolean;
}) {
  const [nombre, setNombre] = useState(String(valores?.name ?? ""));
  const [slug, setSlug] = useState(String(valores?.slug ?? ""));
  const [slugTocado, setSlugTocado] = useState(Boolean(valores?.slug));

  return (
    <div className="space-y-4">
      <div>
        <label className={etiqueta} htmlFor="name">Nombre</label>
        <input id="name" name="name" required maxLength={160} className={campo}
               disabled={congelado} value={nombre}
               onChange={(e) => {
                 setNombre(e.target.value);
                 if (!slugTocado) setSlug(suggestCampaignSlug(e.target.value));
               }} />
      </div>

      <div>
        <label className={etiqueta} htmlFor="slug">Dirección pública</label>
        <input id="slug" name="slug" required maxLength={80} className={campo}
               disabled={congelado} value={slug}
               onChange={(e) => { setSlugTocado(true); setSlug(e.target.value.toLowerCase()); }} />
        <p className="pt-1 text-xs text-ink-soft">
          Se sugiere desde el nombre y se puede cambiar mientras la campaña sea un
          borrador. Al recibir la primera participación queda fija.
        </p>
      </div>

      <div>
        <label className={etiqueta} htmlFor="diagnostic_version_id">Instrumento</label>
        <select id="diagnostic_version_id" name="diagnostic_version_id" required
                className={campo} disabled={congelado}
                defaultValue={String(valores?.diagnostic_version_id ?? "")}>
          <option value="">Elige una versión publicada…</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id}>PCR v{v.versionNumber} · publicada</option>
          ))}
        </select>
        {versions.length === 0 ? (
          <p className="pt-1 text-xs text-amber">
            No hay ninguna versión publicada del instrumento. Sin ella la campaña no puede abrirse.
          </p>
        ) : null}
      </div>

      <div>
        <label className={etiqueta} htmlFor="consent_document_id">Documento de consentimiento</label>
        <select id="consent_document_id" name="consent_document_id" className={campo}
                disabled={congelado}
                defaultValue={String(valores?.consent_document_id ?? "")}>
          <option value="">Sin documento…</option>
          {consentDocuments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} · v{d.version} · vigente
            </option>
          ))}
        </select>
        {consentDocuments.length === 0 ? (
          <p className="pt-1 text-xs text-amber">
            No hay documentos legales vigentes. La campaña puede quedarse en borrador,
            pero no podrá abrirse hasta que exista uno: sin él no se puede pedir el
            tratamiento de datos.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta} htmlFor="partner_name">Socio / entidad</label>
          <input id="partner_name" name="partner_name" maxLength={160} className={campo}
                 defaultValue={String(valores?.partner_name ?? "")} />
        </div>
        <div>
          <label className={etiqueta} htmlFor="public_title">Título público</label>
          <input id="public_title" name="public_title" maxLength={200} className={campo}
                 defaultValue={String(valores?.public_title ?? "")} />
        </div>
      </div>

      <div>
        <label className={etiqueta} htmlFor="public_subtitle">Subtítulo público</label>
        <input id="public_subtitle" name="public_subtitle" maxLength={300} className={campo}
               defaultValue={String(valores?.public_subtitle ?? "")} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={etiqueta} htmlFor="opens_at">Abre</label>
          <input id="opens_at" name="opens_at" type="datetime-local" className={campo}
                 defaultValue={String(valores?.opens_at ?? "")} />
        </div>
        <div>
          <label className={etiqueta} htmlFor="closes_at">Cierra</label>
          <input id="closes_at" name="closes_at" type="datetime-local" className={campo}
                 defaultValue={String(valores?.closes_at ?? "")} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allow_resume"
                 defaultChecked={valores?.allow_resume !== false} />
          Permitir retomar un diagnóstico a medias
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="allow_repeat"
                 defaultChecked={valores?.allow_repeat === true} />
          Permitir repetir a quien ya lo completó
        </label>
      </div>
    </div>
  );
}

export function CreateCampaignForm({
  versions, consentDocuments,
}: { versions: VersionOption[]; consentDocuments: ConsentDocumentOption[] }) {
  const router = useRouter();
  const [estado, accion, pendiente] = useActionState(
    async (prev: AdminActionState, fd: FormData) => {
      const r = await createCampaignAction(prev, fd);
      if (!r.error && r.campaignId) router.push(`/platform/public-diagnostics/${r.campaignId}`);
      return r;
    }, inicial);

  return (
    <form action={accion} className="space-y-4 rounded-lg border border-hairline bg-surface p-4">
      <h2 className="text-sm font-semibold">Nueva campaña</h2>
      <Campos versions={versions} consentDocuments={consentDocuments} congelado={false} />
      {estado.error ? <ErrorAlert message={estado.error} /> : null}
      <p className="text-xs text-ink-soft">
        La campaña se crea como <strong className="font-medium text-ink">borrador</strong>.
        Abrirla es un paso aparte.
      </p>
      <Button type="submit" disabled={pendiente}>
        {pendiente ? "Creando…" : "Crear borrador"}
      </Button>
    </form>
  );
}

export function EditCampaignForm({
  campaignId, versions, consentDocuments, valores, congelado, motivoCongelado,
}: {
  campaignId: string;
  versions: VersionOption[];
  consentDocuments: ConsentDocumentOption[];
  valores: Record<string, string | boolean | null>;
  congelado: boolean;
  motivoCongelado: string | null;
}) {
  const [estado, accion, pendiente] = useActionState(updateCampaignAction, inicial);
  return (
    <form action={accion} className="space-y-4 rounded-lg border border-hairline bg-surface p-4">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <h2 className="text-sm font-semibold">Configuración</h2>
      {congelado && motivoCongelado ? (
        <p role="status" className="rounded-md border border-hairline bg-paper p-3 text-xs text-ink-soft">
          {motivoCongelado}
        </p>
      ) : null}
      <Campos versions={versions} consentDocuments={consentDocuments}
              valores={valores} congelado={congelado} />
      {estado.error ? <ErrorAlert message={estado.error} /> : null}
      <Button type="submit" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

export function CampaignLifecycleActions({
  campaignId, status, puedeAbrir, motivoNoAbrir,
}: {
  campaignId: string;
  status: "draft" | "open" | "closed" | "archived";
  puedeAbrir: boolean;
  motivoNoAbrir: string | null;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const lanzar = (fn: (id: string) => Promise<AdminActionState>) => () => {
    setError(null);
    empezar(async () => {
      const r = await fn(campaignId);
      if (r.error) { setError(r.error); return; }
      router.refresh();
    });
  };

  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <h2 className="text-sm font-semibold">Estado</h2>
      {error ? <ErrorAlert message={error} /> : null}

      {status === "draft" ? (
        <>
          <Button type="button" disabled={pendiente || !puedeAbrir}
                  onClick={lanzar(openCampaignAction)}>
            {pendiente ? "Abriendo…" : "Abrir campaña"}
          </Button>
          {!puedeAbrir && motivoNoAbrir ? (
            <p className="text-xs text-ink-soft">{motivoNoAbrir}</p>
          ) : null}
        </>
      ) : null}

      {status === "open" ? (
        <Button type="button" disabled={pendiente} onClick={lanzar(closeCampaignAction)}>
          {pendiente ? "Cerrando…" : "Cerrar campaña"}
        </Button>
      ) : null}

      {status === "closed" ? (
        <>
          <Button type="button" disabled={pendiente} onClick={lanzar(archiveCampaignAction)}>
            {pendiente ? "Archivando…" : "Archivar campaña"}
          </Button>
          <p className="text-xs text-ink-soft">
            Una campaña cerrada no se reabre: quien respondiera después quedaría mezclado
            con quien respondió dentro del plazo. Si hace falta otra ronda, crea una campaña nueva.
          </p>
        </>
      ) : null}

      {status === "archived" ? (
        <p className="text-xs text-ink-soft">Archivada. No admite más cambios de estado.</p>
      ) : null}
    </section>
  );
}
