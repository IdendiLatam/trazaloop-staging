"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert, SuccessAlert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  QUALITY_REVISION_STATUS_LABEL,
  canEditRevision,
  groupMapNodesByCategory,
  type QualityRevisionStatus,
} from "@/lib/domain/quality-processes";
import {
  addProcessToQualityMap,
  createQualityMap,
  openQualityMapVersion,
  publishQualityMapVersion,
  removeProcessFromQualityMap,
} from "@/server/actions/quality-processes";

/**
 * Trazaloop Quality · QUALITY-01 · Mapa de procesos.
 *
 * El agrupamiento por categoría se calcula con groupMapNodesByCategory, que es
 * lógica pura y está probada sin React. Aquí solo se pinta.
 */

type MapRow = { id: string; name: string; isDefault: boolean; currentVersion: number };

type VersionRow = {
  id: string;
  versionNumber: number;
  status: string;
  changeNote: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

type NodeRow = {
  id: string;
  processId: string;
  processName: string;
  processCode: string | null;
  processStatus: string;
  ownerPositionName: string | null;
  categoryCode: string;
  sortOrder: number;
};

type Detail = {
  map: MapRow;
  versions: VersionRow[];
  publishedVersion: VersionRow | null;
  draftVersion: VersionRow | null;
  shownVersion: VersionRow | null;
  nodes: NodeRow[];
};

const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

export function QualityMapView({
  maps,
  detail,
  categories,
  processes,
  canPublish,
}: {
  maps: MapRow[];
  detail: Detail | null;
  categories: { code: string; name: string }[];
  processes: { id: string; name: string; categoryCode: string }[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creatingMap, setCreatingMap] = useState(false);
  const [addingNode, setAddingNode] = useState(false);

  function run(fn: () => Promise<{ error: string | null }>, okMessage?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setCreatingMap(false);
      setAddingNode(false);
      if (okMessage) setNotice(okMessage);
      router.refresh();
    });
  }

  // ------------------------------------------------------------------ //
  // Todavía no hay mapa                                                  //
  // ------------------------------------------------------------------ //
  if (maps.length === 0 || detail === null) {
    return (
      <div className="space-y-4">
        <ErrorAlert message={error} />
        {creatingMap ? (
          <form
            action={(form) =>
              run(() =>
                createQualityMap({
                  name: String(form.get("name") ?? ""),
                  description: String(form.get("description") ?? ""),
                  isDefault: maps.length === 0,
                }).then((r) => ({ error: r.error }))
              )
            }
            className="space-y-3 rounded-lg border border-hairline bg-surface p-4"
          >
            <h2 className="text-sm font-semibold">Nuevo mapa</h2>
            <input name="name" required maxLength={160} className={inputClass}
                   defaultValue="Mapa de procesos" />
            <input name="description" maxLength={400} className={inputClass}
                   placeholder="Descripción (opcional)" />
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="w-auto px-3 py-1.5 text-xs">
                Crear mapa
              </Button>
              <Button type="button" variant="quiet" className="w-auto px-3 py-1.5 text-xs"
                      onClick={() => setCreatingMap(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <>
            <EmptyState
              title="Todavía no hay mapa de procesos"
              description="Crea el mapa para organizar los procesos por categoría y publicarlo como versión oficial."
            />
            <Button onClick={() => setCreatingMap(true)} className="sm:w-auto">
              Crear mapa
            </Button>
          </>
        )}
      </div>
    );
  }

  const { map, versions, publishedVersion, draftVersion, shownVersion, nodes } = detail;
  const editable = shownVersion !== null && canEditRevision(shownVersion.status);
  const bands = groupMapNodesByCategory(
    nodes.map((n) => ({
      processId: n.processId,
      processName: n.processName,
      categoryCode: n.categoryCode,
      sortOrder: n.sortOrder,
    }))
  );
  const nodeByProcess = new Map(nodes.map((n) => [n.processId, n]));
  const placeable = processes.filter((p) => !nodeByProcess.has(p.id));

  return (
    <div className="space-y-5">
      <ErrorAlert message={error} />
      <SuccessAlert message={notice} />

      {shownVersion === null ? (
        <InfoAlert message="El mapa aún no tiene ninguna versión. Abre una para empezar a colocar procesos." />
      ) : editable ? (
        <InfoAlert message={`Estás editando el borrador (versión ${shownVersion.versionNumber}). La versión publicada no cambia hasta que publiques.`} />
      ) : (
        <InfoAlert
          message={`Versión oficial del mapa: versión ${shownVersion.versionNumber}, vigente desde ${shownVersion.effectiveFrom ?? "—"}. No es editable.`}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{map.name}</span>
        {draftVersion === null ? (
          <Button
            className="w-auto px-3 py-1.5 text-xs"
            disabled={pending}
            onClick={() => run(() => openQualityMapVersion(map.id), "Versión abierta.")}
          >
            Abrir nueva versión
          </Button>
        ) : shownVersion?.id !== draftVersion.id ? (
          <Link
            href={`/quality/map?map=${map.id}&version=${draftVersion.id}`}
            className="inline-flex items-center rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold hover:border-loop"
          >
            Ir al borrador (versión {draftVersion.versionNumber})
          </Link>
        ) : null}

        {publishedVersion && shownVersion?.id !== publishedVersion.id ? (
          <Link
            href={`/quality/map?map=${map.id}&version=${publishedVersion.id}`}
            className="inline-flex items-center rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold hover:border-loop"
          >
            Ver versión oficial
          </Link>
        ) : null}

        {editable && canPublish ? (
          <Button
            className="w-auto px-3 py-1.5 text-xs"
            disabled={pending || nodes.length === 0}
            onClick={() =>
              run(() => publishQualityMapVersion(shownVersion!.id), "Mapa publicado.")
            }
          >
            Publicar mapa
          </Button>
        ) : null}
        {editable && !canPublish ? (
          <span className="text-xs text-ink-soft">
            Publicar corresponde a la administración o al área de calidad.
          </span>
        ) : null}
      </div>

      {/* --------------------------------------------------------------- */}
      {/* El mapa                                                          */}
      {/* --------------------------------------------------------------- */}
      {nodes.length === 0 ? (
        <EmptyState
          title="El mapa está vacío"
          description="Coloca procesos en el mapa para poder publicarlo. Un mapa sin procesos no dice nada."
        />
      ) : (
        <div className="space-y-3">
          {bands.map((band) => (
            <section key={band.categoryCode} className="rounded-lg border border-hairline bg-surface p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {band.label}
              </h2>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {band.nodes.map((n) => {
                  const node = nodeByProcess.get(n.processId)!;
                  return (
                    <li key={n.processId} className="rounded-md border border-loop/30 bg-loop/5 p-3">
                      <Link
                        href={`/quality/processes/${n.processId}`}
                        className="text-sm font-medium text-loop hover:underline"
                      >
                        {n.processName}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-ink-soft">
                        {node.processCode ? `${node.processCode} · ` : ""}
                        {node.ownerPositionName ?? "Sin cargo propietario"}
                      </p>
                      {editable ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => removeProcessFromQualityMap(node.id))}
                          className="mt-1 text-[11px] text-ink-soft hover:text-ink"
                        >
                          Quitar del mapa
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* --------------------------------------------------------------- */}
      {/* Colocar procesos                                                 */}
      {/* --------------------------------------------------------------- */}
      {editable ? (
        addingNode ? (
          <form
            action={(form) =>
              run(() =>
                addProcessToQualityMap({
                  mapVersionId: shownVersion!.id,
                  processId: String(form.get("processId") ?? ""),
                  categoryCode: String(form.get("categoryCode") ?? ""),
                  sortOrder: nodes.length + 1,
                })
              )
            }
            className="space-y-3 rounded-lg border border-hairline bg-surface p-4"
          >
            <h2 className="text-sm font-semibold">Colocar un proceso en el mapa</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Proceso</span>
                <select name="processId" required className={inputClass} defaultValue="">
                  <option value="" disabled>
                    Seleccione una opción…
                  </option>
                  {placeable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium">Categoría en el mapa</span>
                <select name="categoryCode" required className={inputClass} defaultValue="">
                  <option value="" disabled>
                    Seleccione una opción…
                  </option>
                  {categories.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending || placeable.length === 0}
                      className="w-auto px-3 py-1.5 text-xs">
                Colocar
              </Button>
              <Button type="button" variant="quiet" className="w-auto px-3 py-1.5 text-xs"
                      onClick={() => setAddingNode(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : placeable.length > 0 ? (
          <Button variant="quiet" className="sm:w-auto" onClick={() => setAddingNode(true)}>
            Colocar un proceso en el mapa
          </Button>
        ) : processes.length === 0 ? (
          <p className="text-xs text-ink-soft">
            No hay procesos todavía.{" "}
            <Link href="/quality/processes" className="text-loop hover:underline">
              Crea el primero
            </Link>
            .
          </p>
        ) : (
          <p className="text-xs text-ink-soft">Todos los procesos ya están en el mapa.</p>
        )
      ) : null}

      {/* --------------------------------------------------------------- */}
      {/* Versiones del mapa                                               */}
      {/* --------------------------------------------------------------- */}
      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Versiones del mapa</h2>
        <p className="text-xs text-ink-soft">
          Publicar fija la versión: sus bloques quedan como estaban ese día. Para cambiar el
          mapa se abre una versión nueva, que parte de una copia de la vigente.
        </p>
        <ul className="space-y-1">
          {versions.map((v) => (
            <li key={v.id}>
              <Link
                href={`/quality/map?map=${map.id}&version=${v.id}`}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors hover:border-loop ${
                  v.id === shownVersion?.id ? "border-loop bg-loop/5" : "border-hairline bg-paper"
                }`}
              >
                <span className="font-medium">Versión {v.versionNumber}</span>
                <span className="text-ink-soft">
                  {QUALITY_REVISION_STATUS_LABEL[v.status as QualityRevisionStatus] ?? v.status}
                  {v.effectiveFrom ? ` · ${v.effectiveFrom} → ${v.effectiveTo ?? "vigente"}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
