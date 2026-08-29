"use client";

import { useActionState, useRef, useState } from "react";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  interestedPartiesHint, MONITORING_METHODS, MONITORING_METHOD_LABEL, STRATEGY_SCOPE_LABEL,
  strategyScope, type MonitoringMethod,
} from "@/lib/domain/quality-interested-parties";
import type { RequirementRow, StrategyRow } from "@/lib/db/quality-interested-parties";
import {
  attachStrategyRequirementAction, createStrategyAction, detachStrategyRequirementAction,
  setStrategyStatusAction, updateStrategyAction, type IpActionState,
} from "@/server/actions/quality-interested-parties";
import { SectionHint } from "@/components/ui/section-hint";
import { ReviewStateBadge, StrategyScopeBadge, StrategyStatusBadge } from "./badges";

const inicial: IpActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

/**
 * QUALITY-12.3B3A · Estrategias de relacionamiento.
 *
 * EL ALCANCE SE ELIGE, NO SE DEDUCE A CIEGAS
 *
 * Una estrategia puede ser general para la parte —«cómo nos relacionamos con
 * este cliente»— o atender requisitos concretos. La pantalla lo pregunta con
 * esas palabras, y lo que guarda son VÍNCULOS: cero enlaces es general, uno es
 * específica, varios es multi-requisito.
 *
 * No hay un campo `requirement_id` ni un «tipo de estrategia»: sería un dato
 * que puede contradecir a los vínculos reales, y entonces habría dos verdades
 * sobre lo mismo. El alcance se cuenta, no se declara.
 *
 * El responsable es un CARGO. No una persona y no texto libre: un cargo no se
 * va de vacaciones ni cambia de empresa.
 */
export function StrategiesSection({
  assessmentId, strategies, requirements, positions, canMutate,
}: {
  assessmentId: string;
  strategies: StrategyRow[];
  requirements: RequirementRow[];
  positions: { id: string; name: string }[];
  canMutate: boolean;
}) {
  const [alta, altaAction] = useActionState(createStrategyAction, inicial);
  const [alcance, setAlcance] = useState<"general" | "specific">("general");

  const requisitos = requirements.filter((r) => r.entryKind === "requirement" && !r.effectiveTo);

  return (
    <section id="estrategias" className="space-y-4 scroll-mt-20">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Estrategias</h2>
        <SectionHint hint={interestedPartiesHint("strategies")} />
      </div>
      <p className="text-sm text-ink-soft">
        Qué se hace con esta parte interesada: para qué, cómo, quién responde y cada cuánto se
        vuelve a mirar.
      </p>

      {strategies.length === 0 ? (
        <EmptyState
          title="No hay estrategia vigente."
          description={
            canMutate
              ? "Una estrategia dice qué hace la empresa con esta parte. Puede ser general, o "
                + "atender requisitos concretos."
              : "Cuando se registre una, aparecerá aquí."
          }
        />
      ) : (
        <ul className="space-y-3">
          {strategies.map((s) => (
            <StrategyCard
              key={s.id}
              strategy={s}
              requirements={requisitos}
              positions={positions}
              canMutate={canMutate}
            />
          ))}
        </ul>
      )}

      {canMutate ? (
        <details className="rounded-lg border border-hairline bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-loop">
            Nueva estrategia
          </summary>
          <form action={altaAction} className="mt-3 space-y-3">
            <input type="hidden" name="assessment_id" value={assessmentId} />
            <ErrorAlert message={alta.error} />
            <SuccessAlert message={alta.success ? alta.message ?? null : null} />

            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Título</span>
              <input type="text" name="title" required minLength={3} className={inputClass}
                placeholder="Plan de servicio al canal institucional" />
            </label>

            <fieldset className="space-y-2 rounded-md border border-hairline p-3">
              <legend className="px-1 text-xs font-medium text-ink">Alcance</legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio" name="scope" value="general" className="mt-1"
                  checked={alcance === "general"}
                  onChange={() => setAlcance("general")}
                />
                <span>
                  <span className="font-medium">{STRATEGY_SCOPE_LABEL.general}</span>
                  <span className="block text-xs text-ink-soft">
                    Cómo nos relacionamos con ella, sin atarlo a un requisito concreto.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio" name="scope" value="specific" className="mt-1"
                  checked={alcance === "specific"}
                  onChange={() => setAlcance("specific")}
                  disabled={requisitos.length === 0}
                />
                <span>
                  <span className="font-medium">Atiende requisitos concretos</span>
                  <span className="block text-xs text-ink-soft">
                    {requisitos.length === 0
                      ? "Todavía no hay requisitos vigentes que atender."
                      : "Elige uno o varios. Puedes añadir más después."}
                  </span>
                </span>
              </label>

              {alcance === "specific" && requisitos.length > 0 ? (
                <fieldset className="space-y-1 pl-6">
                  <legend className="sr-only">Requisitos que atiende</legend>
                  {requisitos.map((r) => (
                    <label key={r.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="requirement_ids" value={r.id} className="mt-1" />
                      <span>{r.title}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
            </fieldset>

            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Propósito (opcional)</span>
              <textarea name="purpose" rows={2} className={inputClass}
                placeholder="Qué queremos conseguir con esta parte" />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Enfoque (opcional)</span>
              <textarea name="approach" rows={2} className={inputClass}
                placeholder="Cómo lo vamos a hacer" />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">Cargo responsable</span>
                <select name="owner_position_id" className={inputClass} defaultValue="">
                  <option value="">Sin asignar</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <span className="block text-xs text-ink-soft">
                  Un cargo, no una persona: la responsabilidad no se va de vacaciones.
                </span>
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">Método de seguimiento</span>
                <select name="monitoring_method" className={inputClass} defaultValue="">
                  <option value="">Sin definir</option>
                  {MONITORING_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {MONITORING_METHOD_LABEL[m as MonitoringMethod]}
                    </option>
                  ))}
                </select>
                <span className="block text-xs text-ink-soft">
                  No tiene por qué ser una encuesta: la mayoría de las partes no se miden así.
                </span>
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">
                  Cada cuántos meses se revisa (opcional)
                </span>
                <input type="number" name="review_cadence_months" min={1} max={120}
                  className={inputClass} />
                <span className="block text-xs text-ink-soft">
                  Sin cadencia no se declara nada vencido. No se presume anual.
                </span>
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">
                  Próxima revisión (opcional)
                </span>
                <input type="date" name="next_review_on" className={inputClass} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="status" value="active" />
              Activarla ya
            </label>

            <button
              type="submit"
              className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              Crear estrategia
            </button>
          </form>
        </details>
      ) : null}
    </section>
  );
}

function StrategyCard({
  strategy, requirements, positions, canMutate,
}: {
  strategy: StrategyRow;
  requirements: RequirementRow[];
  positions: { id: string; name: string }[];
  canMutate: boolean;
}) {
  const [edicion, edicionAction] = useActionState(updateStrategyAction, inicial);
  const [estado, estadoAction] = useActionState(setStrategyStatusAction, inicial);
  const [vinculo, vinculoAction] = useActionState(attachStrategyRequirementAction, inicial);
  const [desvinculo, desvinculoAction] = useActionState(detachStrategyRequirementAction, inicial);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const cierreRef = useRef<HTMLFormElement>(null);

  const scope = strategyScope(strategy.requirementIds.length);
  const atendidos = requirements.filter((r) => strategy.requirementIds.includes(r.id));
  const disponibles = requirements.filter((r) => !strategy.requirementIds.includes(r.id));
  const editable = canMutate && strategy.effectiveTo === null;

  return (
    <li className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{strategy.title}</p>
          {strategy.purpose ? (
            <p className="mt-0.5 text-xs text-ink-soft">{strategy.purpose}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1">
          <StrategyStatusBadge status={strategy.status} />
          <StrategyScopeBadge requirementCount={strategy.requirementIds.length} />
          <ReviewStateBadge state={strategy.reviewState} />
        </div>
      </div>

      <ErrorAlert message={edicion.error ?? estado.error ?? vinculo.error ?? desvinculo.error} />

      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-medium text-ink-soft">Responsable</dt>
          <dd>{strategy.ownerPositionName ?? "Sin asignar"}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink-soft">Seguimiento</dt>
          <dd>
            {strategy.monitoringMethod
              ? MONITORING_METHOD_LABEL[strategy.monitoringMethod as MonitoringMethod]
                ?? strategy.monitoringMethod
              : "Sin definir"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink-soft">Última revisión</dt>
          <dd>{strategy.lastReviewedOn ?? "Sin revisar todavía"}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink-soft">Próxima revisión</dt>
          <dd>
            {strategy.nextReviewOn ?? "Sin fecha prevista"}
            {strategy.reviewCadenceMonths ? ` · cada ${strategy.reviewCadenceMonths} meses` : ""}
          </dd>
        </div>
      </dl>

      <div className="space-y-2 rounded-md border border-hairline/70 bg-paper p-2">
        <p className="text-xs font-medium text-ink">
          {scope === "general" ? "Alcance general" : "Requisitos que atiende"}
        </p>
        {atendidos.length === 0 ? (
          <p className="text-xs text-ink-soft">
            No está atada a ningún requisito concreto: es general para esta parte.
          </p>
        ) : (
          <ul className="space-y-1">
            {atendidos.map((r) => {
              // El vínculo, no el requisito: terminar por `requirement_id`
              // cerraría todos los que hubiera habido.
              const enlace = strategy.requirementLinks.find((l) => l.requirementId === r.id);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>{r.title}</span>
                  {editable && enlace ? (
                    <form action={desvinculoAction}>
                      <input type="hidden" name="link_id" value={enlace.linkId} />
                      <button
                        type="submit"
                        className="rounded border border-hairline px-2 py-0.5 font-medium hover:border-loop"
                      >
                        Quitar
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {editable && disponibles.length > 0 ? (
          <form action={vinculoAction} className="flex flex-wrap items-end gap-2 pt-1">
            <input type="hidden" name="strategy_id" value={strategy.id} />
            <label className="space-y-1">
              <span className="block text-xs font-medium text-ink">Añadir requisito</span>
              <select name="requirement_id" required className={inputClass} defaultValue="">
                <option value="" disabled>Elige un requisito</option>
                {disponibles.map((r) => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md border border-hairline bg-surface px-3 py-2 text-xs font-medium hover:border-loop"
            >
              Añadir
            </button>
          </form>
        ) : null}
      </div>

      {editable ? (
        <div className="space-y-2 border-t border-hairline pt-2">
          <details>
            <summary className="cursor-pointer text-xs font-medium text-loop">Editar</summary>
            <form action={edicionAction} className="mt-2 space-y-2">
              <input type="hidden" name="strategy_id" value={strategy.id} />
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">Título</span>
                <input type="text" name="title" className={inputClass} defaultValue={strategy.title} />
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">Propósito</span>
                <textarea name="purpose" rows={2} className={inputClass}
                  defaultValue={strategy.purpose ?? ""} />
              </label>
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">Enfoque</span>
                <textarea name="approach" rows={2} className={inputClass}
                  defaultValue={strategy.approach ?? ""} />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-ink">Cargo responsable</span>
                  <select name="owner_position_id" className={inputClass}
                    defaultValue={strategy.ownerPositionId ?? ""}>
                    <option value="">Sin asignar</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-ink">Método de seguimiento</span>
                  <select name="monitoring_method" className={inputClass}
                    defaultValue={strategy.monitoringMethod ?? ""}>
                    <option value="">Sin definir</option>
                    {MONITORING_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {MONITORING_METHOD_LABEL[m as MonitoringMethod]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-ink">Cadencia (meses)</span>
                  <input type="number" name="review_cadence_months" min={1} max={120}
                    className={inputClass} defaultValue={strategy.reviewCadenceMonths ?? ""} />
                </label>
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-ink">Próxima revisión</span>
                  <input type="date" name="next_review_on" className={inputClass}
                    defaultValue={strategy.nextReviewOn ?? ""} />
                </label>
              </div>
              <button
                type="submit"
                className="rounded-md border border-hairline bg-surface px-3 py-2 text-xs font-medium hover:border-loop"
              >
                Guardar cambios
              </button>
            </form>
          </details>

          <div className="flex flex-wrap gap-2">
            {strategy.status === "draft" ? (
              <form action={estadoAction}>
                <input type="hidden" name="strategy_id" value={strategy.id} />
                <input type="hidden" name="status" value="active" />
                <button
                  type="submit"
                  className="rounded-md bg-loop px-3 py-1.5 text-xs font-semibold text-white hover:bg-loop-deep"
                >
                  Activar
                </button>
              </form>
            ) : null}

            <form ref={cierreRef} action={estadoAction}>
              <input type="hidden" name="strategy_id" value={strategy.id} />
              <input type="hidden" name="status" value="cancelled" />
              <button
                type="button"
                onClick={() => setConfirmandoCierre(true)}
                className="rounded-md border border-hairline px-3 py-1.5 text-xs font-medium hover:border-loop"
              >
                Cerrar estrategia
              </button>
              <ConfirmDialog
                open={confirmandoCierre}
                title="Cerrar esta estrategia"
                description={
                  "Dejará de estar vigente desde hoy y no se borra: se conserva con su periodo, "
                  + "sus requisitos y sus revisiones, para explicar qué se hacía antes. Si hace "
                  + "falta otra forma de gestionar esta parte, se crea una estrategia nueva."
                }
                confirmLabel="Cerrar"
                onCancel={() => setConfirmandoCierre(false)}
                onConfirm={() => {
                  cierreRef.current?.requestSubmit();
                  setConfirmandoCierre(false);
                }}
              />
            </form>
          </div>
        </div>
      ) : null}
    </li>
  );
}
