"use client";

import { useActionState, useState } from "react";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import {
  RELEVANCE_LABEL, RELEVANCE_STATES, SUGGESTED_METHOD,
  type RelevanceState,
} from "@/lib/domain/quality-interested-parties";
import type { CategoryRow, ExternalPartyOption, GroupRow } from "@/lib/db/quality-interested-parties";
import {
  createAssessmentAction, createExternalPartyAction, createGroupAction,
  type IpActionState,
} from "@/server/actions/quality-interested-parties";

const inicial: IpActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

/**
 * QUALITY-12.3B3A · Añadir una parte interesada.
 *
 * TRES CAMINOS, Y EL ORDEN IMPORTA
 *
 *   1 · Elegir una entidad externa QUE YA EXISTE. Es el camino normal y va
 *       primero: el cliente que ya está en Voz del cliente y el proveedor que
 *       ya está en Proveedores son LA MISMA empresa, y volver a escribirlos
 *       aquí produciría la tercera ficha de ACME.
 *   2 · Crear un colectivo —trabajadores, dirección, propietarios—, que no es
 *       una empresa y no tiene sitio en la identidad externa.
 *   3 · Registrar una entidad externa que de verdad no existe todavía.
 *
 * El tercero no se esconde, pero avisa: si es un cliente o un proveedor, se da
 * de alta en SU módulo, para que nazca con la ficha que allí le corresponde.
 * Aquí solo se registra a quien no es ninguna de las dos cosas —una alcaldía,
 * un ente regulador, una comunidad vecina—.
 *
 * Lo que NO se ofrece: unidades organizativas. Un área interna no es una parte
 * interesada del sistema; las personas que trabajan en ella sí, y para eso
 * está el colectivo.
 */
export function NewPartyPanel({
  categories, groups, parties, partySearch, basePath,
}: {
  categories: CategoryRow[];
  groups: GroupRow[];
  parties: ExternalPartyOption[];
  partySearch: string;
  basePath: string;
}) {
  const [analisisState, analisisAction] = useActionState(createAssessmentAction, inicial);
  const [grupoState, grupoAction] = useActionState(createGroupAction, inicial);
  const [identidadState, identidadAction] = useActionState(createExternalPartyAction, inicial);
  const [tipo, setTipo] = useState<"external_party" | "group">("external_party");
  const [pertinencia, setPertinencia] = useState<RelevanceState>("under_review");
  const [conPuntuacion, setConPuntuacion] = useState(false);

  const sinCategorias = categories.length === 0;

  return (
    <div className="space-y-3">
      <details className="rounded-lg border border-hairline bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-loop">
          Analizar una parte interesada
        </summary>

        {sinCategorias ? (
          <p className="mt-3 rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-ink">
            Todavía no hay categorías. Empieza por sembrar las iniciales en la pestaña
            Categorías: clasificar es lo que después permite filtrar y revisar por grupos.
          </p>
        ) : null}

        <form action={analisisAction} className="mt-3 space-y-3">
          <h3 className="text-sm font-semibold">Nuevo análisis</h3>
          <ErrorAlert message={analisisState.error} />
          <SuccessAlert message={analisisState.success ? analisisState.message ?? null : null} />

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-ink">¿De quién hablamos?</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio" name="subject_kind" value="external_party"
                  checked={tipo === "external_party"}
                  onChange={() => setTipo("external_party")}
                />
                Una entidad externa
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio" name="subject_kind" value="group"
                  checked={tipo === "group"}
                  onChange={() => setTipo("group")}
                />
                Un colectivo
              </label>
            </div>
          </fieldset>

          {tipo === "external_party" ? (
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Entidad externa</span>
              <select name="subject_id" required className={inputClass} defaultValue="">
                <option value="" disabled>Elige una entidad ya registrada</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.hasAssessment}>
                    {p.label}
                    {p.isSupplier ? " · proveedor" : ""}
                    {p.isCustomer ? " · cliente" : ""}
                    {p.hasAssessment ? " · ya analizada" : ""}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-ink-soft">
                Son las mismas empresas de Proveedores y Voz del cliente. Si no ves la que
                buscas, búscala arriba o regístrala más abajo.
              </span>
            </label>
          ) : (
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Colectivo</span>
              <select name="subject_id" required className={inputClass} defaultValue="">
                <option value="" disabled>Elige un colectivo</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-ink">Categoría</span>
            <select name="category_id" required className={inputClass} defaultValue="">
              <option value="" disabled>Elige la categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>

          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-ink">Pertinencia</legend>
            <div className="flex flex-wrap gap-4">
              {RELEVANCE_STATES.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="relevance_status" value={r}
                    checked={pertinencia === r}
                    onChange={() => setPertinencia(r)}
                  />
                  {RELEVANCE_LABEL[r]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-ink">
              Justificación
              {pertinencia === "not_relevant" ? " (obligatoria)" : " (opcional)"}
            </span>
            <textarea
              name="relevance_rationale" rows={2} className={inputClass}
              required={pertinencia === "not_relevant"}
              placeholder={
                pertinencia === "not_relevant"
                  ? "Por qué esta parte no es pertinente para el sistema de gestión"
                  : "Por qué importa, o qué falta por decidir"
              }
            />
          </label>

          <label className="block space-y-1">
            <span className="block text-xs font-medium text-ink">Resumen (opcional)</span>
            <textarea name="summary" rows={2} className={inputClass}
              placeholder="Qué relación tenemos con esta parte y qué está en juego" />
          </label>

          <fieldset className="space-y-2 rounded-md border border-hairline p-3">
            <legend className="px-1 text-xs font-medium text-ink">Prioridad (opcional)</legend>
            <p className="text-xs text-ink-soft">
              Priorizar no es obligatorio, y la prioridad no decide la pertinencia: una parte
              de prioridad baja puede ser perfectamente pertinente.
            </p>
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Prioridad</span>
              <select name="priority_label" className={inputClass} defaultValue="">
                <option value="">Sin prioridad</option>
                <option value="high">Alta</option>
                <option value="medium">Media</option>
                <option value="low">Baja</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox" checked={conPuntuacion}
                onChange={(e) => setConPuntuacion(e.target.checked)}
              />
              Usar una puntuación
            </label>
            {conPuntuacion ? (
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-ink">Puntuación</span>
                  <input type="number" name="priority_score" step="0.1" className={inputClass} />
                </label>
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-ink">
                    En qué se apoya (obligatorio si hay puntuación)
                  </span>
                  <input
                    type="text" name="priority_method_note" className={inputClass}
                    placeholder={`Ej.: ${SUGGESTED_METHOD.label} — influencia 3 × impacto 3`}
                  />
                  <span className="block text-xs text-ink-soft">
                    Sugerencia, no obligación: {SUGGESTED_METHOD.axes.influence}
                  </span>
                </label>
              </div>
            ) : null}
          </fieldset>

          <button
            type="submit"
            className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
          >
            Registrar análisis
          </button>
        </form>
      </details>

      <details className="rounded-lg border border-hairline bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-loop">
          Crear un colectivo
        </summary>
        <form action={grupoAction} className="mt-3 space-y-3">
          <ErrorAlert message={grupoState.error} />
          <SuccessAlert message={grupoState.success ? grupoState.message ?? null : null} />
          <p className="text-xs text-ink-soft">
            Un colectivo es un grupo de personas, no una empresa: trabajadores, dirección,
            propietarios, la comunidad del entorno.
          </p>
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-ink">Nombre</span>
            <input type="text" name="name" required minLength={2} className={inputClass}
              placeholder="Trabajadores" />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium text-ink">Descripción (opcional)</span>
            <input type="text" name="description" className={inputClass} />
          </label>
          <button
            type="submit"
            className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:border-loop"
          >
            Crear colectivo
          </button>
        </form>
      </details>

      <details className="rounded-lg border border-hairline bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-loop">
          Buscar o registrar una entidad externa
        </summary>
        <div className="mt-3 space-y-4">
          <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
            <label className="flex-1 space-y-1">
              <span className="block text-xs font-medium text-ink">Buscar entidad</span>
              <input
                type="search" name="entidad" defaultValue={partySearch} className={inputClass}
                placeholder="Nombre legal o comercial"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:border-loop"
            >
              Buscar
            </button>
          </form>

          <form action={identidadAction} className="space-y-3 border-t border-hairline pt-3">
            <ErrorAlert message={identidadState.error} />
            <SuccessAlert message={identidadState.success ? identidadState.message ?? null : null} />
            <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-ink">
              Si es un <strong>cliente</strong> o un <strong>proveedor</strong>, regístralo en su
              módulo —Voz del cliente o Proveedores— para que nazca con su ficha. Aquí se
              registra a quien no es ninguna de las dos cosas: un ente regulador, una alcaldía,
              una comunidad.
            </p>
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Nombre legal</span>
              <input type="text" name="legal_name" required minLength={2} className={inputClass} />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Nombre comercial (opcional)</span>
              <input type="text" name="trade_name" className={inputClass} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">País (opcional)</span>
                <input type="text" name="country" className={inputClass} />
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">Ciudad (opcional)</span>
                <input type="text" name="city" className={inputClass} />
              </label>
            </div>
            <button
              type="submit"
              className="rounded-md border border-hairline bg-surface px-3 py-2 text-sm font-medium hover:border-loop"
            >
              Registrar entidad
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
