"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  QUALITY_PROCESS_STATUS_LABEL,
  qualityCategoryLabel,
  type QualityProcessStatus,
} from "@/lib/domain/quality-processes";
import { createQualityProcess } from "@/server/actions/quality-processes";

/**
 * Trazaloop Quality · QUALITY-01 · Listado de procesos y alta.
 *
 * El desplegable de propietario ofrece SOLO cargos: es la forma de que la
 * pantalla exprese la regla T-02 (el propietario nunca es una persona) sin
 * necesidad de explicarla dos veces.
 */

type ProcessView = {
  id: string;
  code: string | null;
  name: string;
  categoryCode: string;
  status: string;
  currentRevision: number;
  ownerPositionId: string | null;
  ownerPositionName: string | null;
};

type PositionOption = { id: string; name: string };
type CategoryOption = { code: string; name: string };

const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

export function QualityProcessList({
  processes,
  positions,
  categories,
}: {
  processes: ProcessView[];
  positions: PositionOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function onCreate(form: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createQualityProcess({
        name: String(form.get("name") ?? ""),
        code: String(form.get("code") ?? ""),
        categoryCode: String(form.get("categoryCode") ?? ""),
        ownerPositionId: String(form.get("ownerPositionId") ?? ""),
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setCreating(false);
      if (result.processId) router.push(`/quality/processes/${result.processId}`);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <ErrorAlert message={error} />

      {positions.length === 0 ? (
        <InfoAlert message="Aún no hay cargos activos. Puedes crear un proceso sin propietario y asignárselo después, pero lo natural es definir primero el cargo responsable." />
      ) : null}

      {creating ? (
        <form action={onCreate} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Nuevo proceso</h2>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Nombre del proceso</span>
            <input name="name" required maxLength={160} className={inputClass}
                   placeholder="Ej.: Gestión de la calidad" />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Código (opcional)</span>
              <input name="code" maxLength={40} className={inputClass} placeholder="P-SIS-01" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Categoría</span>
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
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Cargo propietario</span>
              <select name="ownerPositionId" className={inputClass} defaultValue="">
                <option value="">Sin asignar por ahora</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-ink-soft">
            El propietario de un proceso es siempre un cargo. Así, cuando cambia la persona
            que lo ocupa, el proceso no queda huérfano.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear proceso"}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setCreating(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button onClick={() => setCreating(true)} className="sm:w-auto">
          Crear proceso
        </Button>
      )}

      {processes.length === 0 ? (
        <EmptyState
          title="Todavía no hay procesos"
          description="Crea el primer proceso para definir su propósito, sus entradas y sus salidas, y llevarlo después al mapa."
        />
      ) : (
        <ul className="space-y-2">
          {processes.map((p) => (
            <li key={p.id}>
              <Link
                href={`/quality/processes/${p.id}`}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-hairline bg-surface p-4 transition-colors hover:border-loop"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {p.name}
                    {p.code ? <span className="ml-2 text-xs text-ink-soft">{p.code}</span> : null}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {qualityCategoryLabel(p.categoryCode)}
                    {" · "}
                    {p.ownerPositionName
                      ? `Propietario: ${p.ownerPositionName}`
                      : "Sin cargo propietario"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="inline-flex rounded-full border border-hairline px-2 py-0.5 text-[11px]">
                    {QUALITY_PROCESS_STATUS_LABEL[p.status as QualityProcessStatus] ?? p.status}
                  </span>
                  <p className="mt-1 text-[11px] text-ink-soft">
                    {p.currentRevision > 0
                      ? `Revisión ${p.currentRevision} publicada`
                      : "Sin publicar"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
