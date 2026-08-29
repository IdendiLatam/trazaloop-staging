"use client";

import { useActionState, useState } from "react";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import type { CategoryRow } from "@/lib/db/quality-interested-parties";
import {
  createCategoryAction, seedCategoriesAction, setCategoryActiveAction,
  type IpActionState,
} from "@/server/actions/quality-interested-parties";

const inicial: IpActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

/**
 * QUALITY-12.3B3A · Categorías de partes interesadas.
 *
 * Las quince iniciales se SIEMBRAN en la base de cada empresa; no son
 * constantes del frontend. La diferencia importa: una constante no se puede
 * desactivar, no se puede renombrar y no se puede complementar, y la decisión
 * humana de 12.3A.1 fue exactamente que la empresa pudiera hacer las tres
 * cosas.
 *
 * Y ninguna se borra. Una categoría con historia desaparecería de análisis que
 * la usaron, y esos análisis son la respuesta a «cómo clasificábamos
 * entonces». Se desactiva: deja de ofrecerse y sigue explicando el pasado.
 */
export function CategoriesManager({
  categories, canManage,
}: { categories: CategoryRow[]; canManage: boolean }) {
  const [semilla, semillaAction] = useActionState(seedCategoriesAction, inicial);
  const [creacion, crearAction] = useActionState(createCategoryAction, inicial);
  const [estado, estadoAction] = useActionState(setCategoryActiveAction, inicial);
  const [porDesactivar, setPorDesactivar] = useState<CategoryRow | null>(null);

  const activas = categories.filter((c) => c.isActive);
  const inactivas = categories.filter((c) => !c.isActive);

  return (
    <div className="space-y-5">
      <ErrorAlert message={semilla.error ?? creacion.error ?? estado.error} />
      <SuccessAlert
        message={
          (semilla.success ? semilla.message : null)
          ?? (creacion.success ? creacion.message : null)
          ?? (estado.success ? estado.message : null)
          ?? null
        }
      />

      {categories.length === 0 ? (
        <EmptyState
          title="Todavía no hay categorías."
          description={
            canManage
              ? "Puedes empezar con las quince iniciales y ajustarlas después: todas se pueden "
                + "renombrar, desactivar o complementar con las tuyas."
              : "Cuando alguien de tu empresa las cree, aparecerán aquí."
          }
        />
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap gap-3">
          <form action={semillaAction}>
            <button
              type="submit"
              className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:border-loop"
            >
              {categories.length === 0 ? "Sembrar las categorías iniciales" : "Completar las iniciales"}
            </button>
          </form>
        </div>
      ) : null}

      {activas.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Categorías activas</h2>
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {activas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.name}</p>
                  {c.description ? (
                    <p className="text-xs text-ink-soft">{c.description}</p>
                  ) : null}
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setPorDesactivar(c)}
                    className="rounded-md border border-hairline px-3 py-1.5 text-xs font-medium hover:border-loop"
                  >
                    Desactivar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inactivas.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Categorías desactivadas</h2>
          <p className="text-xs text-ink-soft">
            No se ofrecen al clasificar, y siguen explicando los análisis que las usaron.
          </p>
          <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
            {inactivas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <p className="text-sm text-ink-soft">{c.name}</p>
                {canManage ? (
                  <form action={estadoAction}>
                    <input type="hidden" name="category_id" value={c.id} />
                    <input type="hidden" name="is_active" value="true" />
                    <button
                      type="submit"
                      className="rounded-md border border-hairline px-3 py-1.5 text-xs font-medium hover:border-loop"
                    >
                      Reactivar
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canManage ? (
        <details className="rounded-lg border border-hairline bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-loop">
            Crear una categoría propia
          </summary>
          <form action={crearAction} className="mt-3 space-y-3">
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Nombre</span>
              <input type="text" name="name" required minLength={2} className={inputClass}
                placeholder="Junta de acción comunal" />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Descripción (opcional)</span>
              <input type="text" name="description" className={inputClass} />
            </label>
            <button
              type="submit"
              className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              Crear categoría
            </button>
          </form>
        </details>
      ) : null}

      <form action={estadoAction} id="desactivar-categoria">
        <input type="hidden" name="category_id" value={porDesactivar?.id ?? ""} />
        <input type="hidden" name="is_active" value="false" />
        <ConfirmDialog
          open={porDesactivar !== null}
          title={`Desactivar «${porDesactivar?.name ?? ""}»`}
          description={
            "Deja de ofrecerse al clasificar partes interesadas. Los análisis que ya la usan "
            + "la conservan: su historia no cambia. Puedes reactivarla cuando quieras."
          }
          confirmLabel="Desactivar"
          onCancel={() => setPorDesactivar(null)}
          onConfirm={() => {
            (document.getElementById("desactivar-categoria") as HTMLFormElement | null)
              ?.requestSubmit();
            setPorDesactivar(null);
          }}
        />
      </form>
    </div>
  );
}
