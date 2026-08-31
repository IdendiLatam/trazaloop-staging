"use client";

import { useActionState, useRef, useState } from "react";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  interestedPartiesHint, RELEVANCE_LABEL, RELEVANCE_STATES, SUGGESTED_METHOD, priorityView,
  type RelevanceState,
} from "@/lib/domain/quality-interested-parties";
import type { InterestedPartiesHelp } from "@/lib/domain/quality-interested-parties";
import type { AssessmentRow } from "@/lib/db/quality-interested-parties";
import { supersedeAssessmentAction, type IpActionState } from "@/server/actions/quality-interested-parties";
import { SectionHint } from "@/components/ui/section-hint";
import { RelevanceBadge } from "./badges";

const inicial: IpActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

/**
 * QUALITY-12.3B3A · El análisis vigente, y cómo se sustituye.
 *
 * NO HAY BOTÓN DE EDITAR, y su ausencia es la funcionalidad.
 *
 * Un análisis es una lectura fechada: dice qué pensábamos en una fecha. Si se
 * pudiera corregir, dejaría de servir para lo único que sirve —responder «qué
 * decíais entonces»— y la respuesta pasaría a ser «lo que decidimos decir
 * ahora». Por eso la única operación es SUSTITUIR: el anterior se conserva
 * entero y se cierra su vigencia; el nuevo nace apuntándolo.
 *
 * Y la confirmación lo dice con esas palabras antes de hacerlo, porque quien
 * pulsa «Guardar» en cualquier otra pantalla espera sobrescribir.
 */
export function AssessmentSection({
  assessment, canMutate, historyCount,
  help,
}: {
  assessment: AssessmentRow;
  canMutate: boolean;
  historyCount: number;
  /** PE-02B4 · La ayuda administrada de la pantalla, ya cargada. */
  help?: InterestedPartiesHelp;
}) {
  const [estado, accion] = useActionState(supersedeAssessmentAction, inicial);
  const [confirmando, setConfirmando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [pertinencia, setPertinencia] = useState<RelevanceState>(assessment.relevanceStatus);
  const [conPuntuacion, setConPuntuacion] = useState(assessment.priorityScore !== null);

  const prioridad = priorityView({
    priorityLabel: assessment.priorityLabel,
    priorityScore: assessment.priorityScore,
    priorityMethodNote: assessment.priorityMethodNote,
  });

  return (
    <section id="resumen" className="space-y-4 scroll-mt-20">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Resumen del análisis</h2>
        <SectionHint hint={interestedPartiesHint("overview", help)} />
      </div>

      <dl className="grid gap-3 rounded-lg border border-hairline bg-surface p-4 sm:grid-cols-2">
        <div>
          <dt className="flex items-center gap-1 text-xs font-medium text-ink-soft">
            Pertinencia
            <SectionHint hint={interestedPartiesHint("relevance", help)} />
          </dt>
          <dd className="mt-1"><RelevanceBadge status={assessment.relevanceStatus} /></dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-soft">Analizada el</dt>
          <dd className="mt-1 text-sm">{assessment.assessedOn}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-ink-soft">Justificación</dt>
          <dd className="mt-1 text-sm">
            {assessment.relevanceRationale ?? (
              <span className="text-ink-soft">Sin justificación registrada.</span>
            )}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-medium text-ink-soft">Prioridad</dt>
          <dd className="mt-1 text-sm">
            {prioridad.kind === "none" ? (
              <span className="text-ink-soft">Sin prioridad. Priorizar no es obligatorio.</span>
            ) : prioridad.kind === "qualitative" ? (
              prioridad.text
            ) : (
              <>
                {prioridad.score}
                <span className="block text-xs text-ink-soft">
                  Metodología: {prioridad.method}
                </span>
              </>
            )}
          </dd>
        </div>
        {assessment.summary ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-ink-soft">Resumen</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm">{assessment.summary}</dd>
          </div>
        ) : null}
        <div className="sm:col-span-2 text-xs text-ink-soft">
          Vigente desde el {assessment.effectiveFrom}
          {historyCount > 1 ? ` · ${historyCount} lecturas registradas` : " · primera lectura"}.
        </div>
      </dl>

      {canMutate ? (
        <details className="rounded-lg border border-hairline bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-loop">
            Sustituir este análisis
          </summary>
          <form ref={formRef} action={accion} className="mt-3 space-y-3">
            <input type="hidden" name="assessment_id" value={assessment.id} />
            <ErrorAlert message={estado.error} />
            <SuccessAlert message={estado.success ? estado.message ?? null : null} />

            <p className="rounded-md border border-loop/30 bg-loop/5 p-2 text-xs text-ink">
              Un análisis no se edita: se sustituye. El actual se conservará completo como
              histórico, con su fecha y su justificación, y el nuevo empezará a regir desde la
              fecha que indiques.
            </p>

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
                Justificación{pertinencia === "not_relevant" ? " (obligatoria)" : ""}
              </span>
              <textarea
                name="relevance_rationale" rows={2} className={inputClass}
                required={pertinencia === "not_relevant"}
                defaultValue={assessment.relevanceRationale ?? ""}
              />
            </label>

            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Resumen</span>
              <textarea name="summary" rows={2} className={inputClass}
                defaultValue={assessment.summary ?? ""} />
            </label>

            <fieldset className="space-y-2 rounded-md border border-hairline p-3">
              <legend className="px-1 text-xs font-medium text-ink">
                <span className="inline-flex items-center gap-1">
                  Prioridad (opcional)
                  <SectionHint hint={interestedPartiesHint("influence", help)} />
                  <SectionHint hint={interestedPartiesHint("impact", help)} />
                </span>
              </legend>
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">Prioridad</span>
                <select name="priority_label" className={inputClass}
                  defaultValue={assessment.priorityLabel ?? ""}>
                  <option value="">Sin prioridad</option>
                  <option value="high">Alta</option>
                  <option value="medium">Media</option>
                  <option value="low">Baja</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={conPuntuacion}
                  onChange={(e) => setConPuntuacion(e.target.checked)} />
                Usar una puntuación
              </label>
              {conPuntuacion ? (
                <div className="space-y-2">
                  <label className="block space-y-1">
                    <span className="block text-xs font-medium text-ink">Puntuación</span>
                    <input type="number" step="0.1" name="priority_score" className={inputClass}
                      defaultValue={assessment.priorityScore ?? ""} />
                  </label>
                  <label className="block space-y-1">
                    <span className="block text-xs font-medium text-ink">
                      En qué se apoya (obligatorio si hay puntuación)
                    </span>
                    <input type="text" name="priority_method_note" className={inputClass}
                      defaultValue={assessment.priorityMethodNote ?? ""}
                      placeholder={`Ej.: ${SUGGESTED_METHOD.label}`} />
                  </label>
                </div>
              ) : null}
            </fieldset>

            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">
                El nuevo análisis rige desde (opcional)
              </span>
              <input type="date" name="effective_from" className={inputClass} />
            </label>

            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              Sustituir análisis
            </button>

            <ConfirmDialog
              open={confirmando}
              title="Sustituir el análisis vigente"
              description={
                "El análisis actual se conservará completo como histórico —con su fecha, su "
                + "pertinencia y su justificación— y dejará de regir. El nuevo pasará a ser el "
                + "vigente. Esta operación no borra nada y no se puede deshacer editando: "
                + "para volver atrás habría que registrar otro análisis."
              }
              confirmLabel="Sustituir"
              onCancel={() => setConfirmando(false)}
              onConfirm={() => {
                // `requestSubmit` y no un submit implícito: el botón que abre
                // el diálogo es `type="button"` a propósito, para que el
                // formulario NUNCA se envíe sin pasar por aquí.
                formRef.current?.requestSubmit();
                setConfirmando(false);
              }}
            />
          </form>
        </details>
      ) : null}
    </section>
  );
}
