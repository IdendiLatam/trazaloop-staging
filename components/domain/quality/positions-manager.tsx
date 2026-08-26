"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import {
  QUALITY_ASSIGNMENT_TYPES,
  QUALITY_ASSIGNMENT_TYPE_LABEL,
  type QualityAssignmentType,
} from "@/lib/domain/quality-processes";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { describeBlocking } from "@/lib/domain/lifecycle";
import {
  createQualityPosition,
  assignPersonToQualityPosition,
  endQualityPositionAssignment,
  removeQualityPosition,
  updateQualityPosition,
} from "@/server/actions/quality-processes";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

/**
 * Trazaloop Quality · QUALITY-01 · Gestor de cargos.
 *
 * Crear un cargo, asignar a una persona con vigencia y cerrar esa vigencia
 * sin borrar el historial. Cuando el rol no permite gestionar, la pantalla se
 * muestra en solo lectura — ocultar botones no es la barrera: las actions y la
 * RLS vuelven a comprobar el rol.
 */

type PositionView = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  orgUnit: string | null;
  isActive: boolean;
  holderProfileId: string | null;
  holderName: string | null;
  holderEmail: string | null;
  holderSince: string | null;
};

type AssignmentView = {
  id: string;
  profileId: string;
  personName: string | null;
  personEmail: string | null;
  assignmentType: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
};

type MemberOption = { profileId: string; name: string; email: string | null };

/** Uso real de cada cargo, calculado en servidor: decide qué ofrece la UI. */
type PositionUsage = {
  positionId: string; processes: number; assignments: number; isDeletable: boolean;
  /** Todo lo que lo retiene, ya redactado por el servidor (QUALITY-03.1). */
  blocking?: { label: string; count: number }[];
};

const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

export function QualityPositionsManager({
  positions,
  members,
  history,
  usage,
  canManage,
}: {
  positions: PositionView[];
  members: MemberOption[];
  history: { positionId: string; assignments: AssignmentView[] }[];
  usage: PositionUsage[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [assigningTo, setAssigningTo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<PositionView | null>(null);

  const historyByPosition = new Map(history.map((h) => [h.positionId, h.assignments]));
  const usageByPosition = new Map(usage.map((u) => [u.positionId, u]));

  function run(fn: () => Promise<{ error: string | null }>, okMessage?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      setCreating(false);
      setEditing(null);
      setAssigningTo(null);
      if (okMessage) setNotice(okMessage);
      router.refresh();
    });
  }

  /**
   * Quitar un cargo. La acción de servidor decide si se borra o se desactiva
   * según el uso real; aquí solo se cuenta lo que ocurrió. Anunciarlo importa:
   * pulsar "Eliminar" y ver que el cargo sigue en la lista, desactivado, sería
   * desconcertante si nadie lo explica.
   */
  function onRemove(position: PositionView) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await removeQualityPosition(position.id);
      setConfirmRemove(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNotice(
        result.outcome === "deleted"
          ? `Se eliminó el cargo «${position.name}». No tenía información asociada.`
          : `El cargo «${position.name}» quedó desactivado en lugar de eliminarse, para conservar su historial.`
      );
      router.refresh();
    });
  }

  function onCreate(form: FormData) {
    run(() =>
      createQualityPosition({
        name: String(form.get("name") ?? ""),
        code: String(form.get("code") ?? ""),
        orgUnit: String(form.get("orgUnit") ?? ""),
        description: String(form.get("description") ?? ""),
      })
    );
  }

  function onAssign(positionId: string, form: FormData) {
    run(() =>
      assignPersonToQualityPosition({
        positionId,
        profileId: String(form.get("profileId") ?? ""),
        assignmentType: String(form.get("assignmentType") ?? "holder"),
        effectiveFrom: String(form.get("effectiveFrom") ?? ""),
        notes: String(form.get("notes") ?? ""),
      })
    );
  }

  return (
    <div className="space-y-4">
      <ErrorAlert message={error} />
      {notice ? <InfoAlert message={notice} /> : null}

      {/* La confirmación anuncia el resultado REAL, que depende del uso del
          cargo. Prometer "eliminar" y desactivar en su lugar, sin avisar, sería
          engañoso; avisar después, tarde. */}
      <ConfirmDialog
        open={confirmRemove !== null}
        destructive
        pending={pending}
        title={
          confirmRemove && (usageByPosition.get(confirmRemove.id)?.isDeletable ?? false)
            ? `¿Eliminar el cargo «${confirmRemove.name}»?`
            : `¿Desactivar el cargo «${confirmRemove?.name ?? ""}»?`
        }
        description={(() => {
          if (!confirmRemove) return "";
          const u = usageByPosition.get(confirmRemove.id);
          if (u?.isDeletable) {
            return "Este cargo no tiene nada asociado todavía, así que se eliminará por completo. La acción no se puede deshacer.";
          }
          // El servidor ya redactó QUÉ lo retiene, y cuenta las cinco
          // referencias posibles —procesos, titulares, indicadores, objetivos y
          // documentos—, no solo las dos que esta pantalla conocía.
          const detalle = u?.blocking?.length ? ` (${describeBlocking(u.blocking)})` : "";
          return (
            `Este cargo tiene información asociada${detalle}, así que se DESACTIVARÁ en lugar de eliminarse, ` +
            "para conservar el historial de quién respondía por cada proceso. Podrás reactivarlo cuando quieras."
          );
        })()}
        confirmLabel={
          confirmRemove && (usageByPosition.get(confirmRemove.id)?.isDeletable ?? false)
            ? "Eliminar definitivamente"
            : "Desactivar"
        }
        onConfirm={() => confirmRemove && onRemove(confirmRemove)}
        onCancel={() => setConfirmRemove(null)}
      />

      {!canManage ? (
        <InfoAlert message="Puedes consultar los cargos. Crearlos o asignarlos corresponde a la administración o al área de calidad." />
      ) : null}

      {canManage ? (
        creating ? (
          <form action={onCreate} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
            <h2 className="text-sm font-semibold">Nuevo cargo</h2>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Nombre del cargo</span>
              <input name="name" required maxLength={160} className={inputClass}
                     placeholder="Ej.: Director de Calidad" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Código (opcional)</span>
                <input name="code" maxLength={40} className={inputClass} placeholder="DIR-CAL" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Área (opcional)</span>
                <input name="orgUnit" maxLength={160} className={inputClass} placeholder="Dirección" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Descripción (opcional)</span>
              <textarea name="description" rows={2} className={inputClass}
                        placeholder="Qué responsabilidad asume este cargo dentro del sistema de calidad." />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Crear cargo"}
              </Button>
              <Button type="button" variant="quiet" onClick={() => setCreating(false)} disabled={pending}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button onClick={() => setCreating(true)} className="sm:w-auto">
            Crear cargo
          </Button>
        )
      ) : null}

      {positions.length === 0 ? (
        <EmptyState
          title="Todavía no hay cargos"
          description="Crea el primer cargo para poder asignarle un responsable y usarlo como propietario de un proceso."
        />
      ) : (
        <ul className="space-y-3">
          {positions.map((p) => {
            const assignments = historyByPosition.get(p.id) ?? [];
            const isOpen = expanded === p.id;
            return (
              <li key={p.id} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {p.name}
                      {p.code ? <span className="ml-2 text-xs text-ink-soft">{p.code}</span> : null}
                    </p>
                    {p.orgUnit ? <p className="text-xs text-ink-soft">{p.orgUnit}</p> : null}
                    <p className="mt-1 text-xs">
                      {p.holderName ? (
                        <>
                          <span className="font-medium">Titular actual:</span> {p.holderName}
                          {p.holderSince ? (
                            <span className="text-ink-soft"> · desde {p.holderSince}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-ink-soft">Sin titular asignado.</span>
                      )}
                    </p>
                    {p.description ? (
                      <p className="mt-1 text-xs text-ink-soft">{p.description}</p>
                    ) : null}
                    {!p.isActive ? (
                      <span className="mt-1 inline-flex rounded-full border border-hairline px-2 py-0.5 text-[11px] text-ink-soft">
                        Inactivo
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <ExportPdfButton exportKey="quality.position.detail" id={p.id} />
                    <Button
                      variant="quiet"
                      className="w-auto px-3 py-1 text-xs"
                      onClick={() => setExpanded(isOpen ? null : p.id)}
                    >
                      {isOpen ? "Ocultar historial" : `Historial (${assignments.length})`}
                    </Button>
                    {canManage ? (
                      <>
                        <Button
                          variant="quiet"
                          className="w-auto px-3 py-1 text-xs"
                          onClick={() => setEditing(editing === p.id ? null : p.id)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="quiet"
                          className="w-auto px-3 py-1 text-xs"
                          onClick={() => setAssigningTo(assigningTo === p.id ? null : p.id)}
                        >
                          Asignar persona
                        </Button>
                        <Button
                          variant="quiet"
                          className="w-auto px-3 py-1 text-xs"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () =>
                                updateQualityPosition(p.id, {
                                  name: p.name,
                                  code: p.code ?? "",
                                  orgUnit: p.orgUnit ?? "",
                                  description: p.description ?? "",
                                  isActive: !p.isActive,
                                }),
                              p.isActive
                                ? `El cargo «${p.name}» quedó desactivado.`
                                : `El cargo «${p.name}» vuelve a estar activo.`
                            )
                          }
                        >
                          {p.isActive ? "Desactivar" : "Reactivar"}
                        </Button>
                        <Button
                          variant="quiet"
                          className="w-auto px-3 py-1 text-xs text-danger"
                          disabled={pending}
                          onClick={() => setConfirmRemove(p)}
                        >
                          Eliminar
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                {canManage && editing === p.id ? (
                  <form
                    action={(form) =>
                      run(
                        () =>
                          updateQualityPosition(p.id, {
                            name: String(form.get("name") ?? ""),
                            code: String(form.get("code") ?? ""),
                            orgUnit: String(form.get("orgUnit") ?? ""),
                            description: String(form.get("description") ?? ""),
                          }),
                        "Cargo actualizado."
                      )
                    }
                    className="mt-3 space-y-3 rounded-md border border-hairline bg-paper p-3"
                  >
                    <h3 className="text-xs font-semibold">Editar cargo</h3>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium">Nombre del cargo</span>
                      <input name="name" required defaultValue={p.name} maxLength={160} className={inputClass} />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium">Código</span>
                        <input name="code" defaultValue={p.code ?? ""} maxLength={40} className={inputClass} />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium">Área</span>
                        <input name="orgUnit" defaultValue={p.orgUnit ?? ""} maxLength={160} className={inputClass} />
                      </label>
                    </div>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium">Descripción</span>
                      <textarea name="description" rows={2} defaultValue={p.description ?? ""} className={inputClass} />
                    </label>
                    <p className="text-xs text-ink-soft">
                      Cambiar el nombre no afecta a los procesos que tiene a su cargo: siguen
                      apuntando a este mismo cargo.
                    </p>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={pending} className="w-auto px-3 py-1 text-xs">
                        {pending ? "Guardando…" : "Guardar cambios"}
                      </Button>
                      <Button type="button" variant="quiet" className="w-auto px-3 py-1 text-xs"
                              onClick={() => setEditing(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : null}

                {canManage && assigningTo === p.id ? (
                  <form
                    action={(form) => onAssign(p.id, form)}
                    className="mt-3 space-y-3 rounded-md border border-hairline bg-paper p-3"
                  >
                    {members.length === 0 ? (
                      <InfoAlert message="No hay miembros activos en la empresa a quienes asignar el cargo." />
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium">Persona</span>
                        <select name="profileId" required className={inputClass}>
                          {members.map((m) => (
                            <option key={m.profileId} value={m.profileId}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium">Tipo</span>
                        <select name="assignmentType" defaultValue="holder" className={inputClass}>
                          {QUALITY_ASSIGNMENT_TYPES.map((t: QualityAssignmentType) => (
                            <option key={t} value={t}>
                              {QUALITY_ASSIGNMENT_TYPE_LABEL[t]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium">Desde</span>
                        <input type="date" name="effectiveFrom" className={inputClass} />
                      </label>
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium">Notas (opcional)</span>
                        <input name="notes" maxLength={400} className={inputClass} />
                      </label>
                    </div>
                    <p className="text-xs text-ink-soft">
                      Un cargo tiene un solo titular vigente. Si ya hay uno, cierra primero su
                      vigencia desde el historial.
                    </p>
                    <div className="flex gap-2">
                      <Button type="submit" disabled={pending || members.length === 0}
                              className="w-auto px-3 py-1 text-xs">
                        {pending ? "Guardando…" : "Asignar"}
                      </Button>
                      <Button type="button" variant="quiet" className="w-auto px-3 py-1 text-xs"
                              onClick={() => setAssigningTo(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                ) : null}

                {isOpen ? (
                  <div className="mt-3 rounded-md border border-hairline bg-paper p-3">
                    {assignments.length === 0 ? (
                      <p className="text-xs text-ink-soft">Este cargo no ha tenido asignaciones.</p>
                    ) : (
                      <ul className="space-y-2">
                        {assignments.map((a) => (
                          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span>
                              <span className="font-medium">{a.personName ?? a.personEmail ?? "—"}</span>
                              <span className="text-ink-soft">
                                {" "}· {QUALITY_ASSIGNMENT_TYPE_LABEL[a.assignmentType as QualityAssignmentType] ?? a.assignmentType}
                                {" "}· {a.effectiveFrom} → {a.effectiveTo ?? "vigente"}
                              </span>
                            </span>
                            {canManage && a.effectiveTo === null ? (
                              <Button
                                variant="quiet"
                                className="w-auto px-2 py-0.5 text-[11px]"
                                disabled={pending}
                                onClick={() => run(() => endQualityPositionAssignment(a.id))}
                              >
                                Cerrar vigencia
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
