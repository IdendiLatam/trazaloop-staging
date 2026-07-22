"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  upsertTextileCircularityAnswerAction,
  recalculateTextileCircularityAssessmentAction,
  finalizeTextileCircularityAssessmentAction,
} from "@/server/actions/textiles-circularity";

/**
 * Trazaloop · Sprint T7 (Textil) · Respuestas por criterio + acciones de
 * cálculo/finalización. El usuario responde criterios MANUALES (0 / 0,5 /
 * 1 / N/A); los derivados los calcula la base de datos desde los datos
 * reales. El puntaje, nivel, brechas y recomendaciones NUNCA se envían
 * desde el cliente.
 */

type CriterionView = {
  id: string;
  code: string;
  dimensionKey: string;
  dimensionLabel: string;
  question: string;
  helpText: string | null;
  responseType: string;
  allowsNa: boolean;
};

type AnswerView = { criterionId: string; answerValue: number | null; notApplicable: boolean };

export function CircularityCriteriaForm({
  assessmentId,
  isDraft,
  canFinalize,
  criteria,
  answers,
}: {
  assessmentId: string;
  isDraft: boolean;
  canFinalize: boolean;
  criteria: CriterionView[];
  answers: AnswerView[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const a of answers) {
      initial[a.criterionId] = a.notApplicable ? "na" : String(a.answerValue ?? "");
    }
    return initial;
  });

  const manual = criteria.filter((c) => c.responseType === "scale" || c.responseType === "yes_no");
  const derived = criteria.filter((c) => !(c.responseType === "scale" || c.responseType === "yes_no"));
  const dimensions = [...new Set(criteria.map((c) => c.dimensionKey))];

  function save(criterion: CriterionView) {
    const raw = values[criterion.id] ?? "";
    if (raw === "") {
      setMessage("Selecciona una respuesta antes de guardar.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await upsertTextileCircularityAnswerAction(assessmentId, {
        criterionId: criterion.id,
        answerValue: raw === "na" ? undefined : raw,
        notApplicable: raw === "na",
      });
      setMessage(result.error ?? `Respuesta guardada (${criterion.code}).`);
      if (!result.error) router.refresh();
    });
  }

  function recalculate() {
    setMessage(null);
    startTransition(async () => {
      const result = await recalculateTextileCircularityAssessmentAction(assessmentId);
      setMessage(result.error ?? `Evaluación calculada: ${result.score ?? "—"} / 100.`);
      if (!result.error) router.refresh();
    });
  }

  function finalize() {
    if (!window.confirm("Al finalizar, la evaluación queda como registro histórico inmutable. ¿Continuar?")) {
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await finalizeTextileCircularityAssessmentAction(assessmentId);
      setMessage(result.error ?? `Evaluación finalizada: ${result.score ?? "—"} / 100.`);
      if (!result.error) router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {dimensions.map((dim) => {
        const dimManual = manual.filter((c) => c.dimensionKey === dim);
        const dimDerived = derived.filter((c) => c.dimensionKey === dim);
        if (dimManual.length === 0 && dimDerived.length === 0) return null;
        const label = criteria.find((c) => c.dimensionKey === dim)?.dimensionLabel ?? dim;
        return (
          <section key={dim} className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
            <h3 className="text-sm font-semibold">{label}</h3>
            {dimManual.map((c) => (
              <div key={c.id} className="space-y-1 rounded-md border border-hairline bg-paper p-3">
                <p className="text-xs font-medium">
                  {c.code} · {c.question}
                </p>
                {c.helpText ? <p className="text-[11px] text-ink-soft">{c.helpText}</p> : null}
                {isDraft ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <select
                      value={values[c.id] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}
                      className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs"
                    >
                      <option value="">— Sin responder (cuenta como 0) —</option>
                      <option value="1">Sí / completo (1)</option>
                      <option value="0.5">Parcial (0,5)</option>
                      <option value="0">No / sin soporte (0)</option>
                      {c.allowsNa ? <option value="na">No aplica</option> : null}
                    </select>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => save(c)}
                      className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs font-medium hover:border-loop disabled:opacity-60"
                    >
                      Guardar
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-ink-soft">
                    Respuesta registrada:{" "}
                    {values[c.id] === "na" ? "No aplica" : values[c.id] === "" || values[c.id] === undefined ? "Sin responder (0)" : values[c.id]}
                  </p>
                )}
              </div>
            ))}
            {dimDerived.length > 0 ? (
              <div className="space-y-1 rounded-md border border-hairline bg-paper p-3">
                <p className="text-[11px] font-medium text-ink-soft">
                  Criterios derivados automáticamente al calcular (desde composición, materiales,
                  componentes, evidencias y trazabilidad):
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-[11px] text-ink-soft">
                  {dimDerived.map((c) => (
                    <li key={c.id}>
                      {c.code} · {c.question}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        {isDraft ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={recalculate}
              className="rounded-md bg-loop px-3 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-loop-deep disabled:opacity-60"
            >
              {pending ? "Trabajando…" : "Calcular / recalcular"}
            </button>
            {canFinalize ? (
              <button
                type="button"
                disabled={pending}
                onClick={finalize}
                className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop disabled:opacity-60"
              >
                Finalizar evaluación
              </button>
            ) : (
              <span className="text-xs text-ink-soft">
                Finaliza un rol administrador o calidad (el consultor prepara y propone).
              </span>
            )}
          </>
        ) : null}
        {message ? <span className="text-xs text-ink-soft">{message}</span> : null}
      </div>
    </div>
  );
}
