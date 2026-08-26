"use client";

import { useActionState, useState } from "react";
import { Wordmark } from "@/components/layout/logo";
import {
  ANONYMITY_MODE_NOTICE, scaleValues,
} from "@/lib/domain/quality-customer-voice";
import type { PublicSurvey } from "@/lib/db/quality-survey-public";
import {
  submitPublicSurveyAction, type PublicSubmitState,
} from "@/server/actions/quality-survey-public";

/**
 * Trazaloop Quality · QUALITY-08 · El formulario que ve un cliente.
 *
 * TRES COSAS QUE ESTA PANTALLA HACE Y QUE NO SON OPCIONALES
 *
 * §24 · Dice si la respuesta será anónima o identificada ANTES de enviarla, en
 * grande y arriba. Descubrirlo después es lo que hace que la gente deje de
 * responder encuestas.
 *
 * §94 · Es accesible: cada control tiene su etiqueta asociada, lo obligatorio
 * se dice con palabras y no solo con un asterisco rojo, y los errores explican
 * qué falta. Nada depende únicamente del color.
 *
 * §95 · Y funciona en un móvil, que es donde la mayoría la va a abrir.
 */

const initial: PublicSubmitState = { error: null };

type Value = {
  outcome: "answered" | "not_applicable" | "skipped";
  value_numeric?: number | null;
  value_text?: string | null;
  value_choices?: string[] | null;
};

export function PublicSurveyForm({
  token, survey,
}: {
  token: string;
  survey: PublicSurvey;
}) {
  const [state, formAction, pending] = useActionState(submitPublicSurveyAction, initial);
  const [values, setValues] = useState<Record<string, Value>>({});

  function set(questionId: string, patch: Value) {
    setValues((prev) => ({ ...prev, [questionId]: patch }));
  }

  const payload = JSON.stringify(
    survey.questions.map((q) => ({
      question_id: q.id,
      ...(values[q.id] ?? { outcome: "skipped" as const }),
    }))
  );

  if (state.success) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="mb-6 flex justify-center"><Wordmark /></div>
        <h1 className="text-lg font-semibold">Gracias por responder</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {state.closingText ?? "Tu respuesta quedó registrada."}
        </p>
        {survey.anonymityMode === "anonymous" ? (
          <p className="mt-4 rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink-soft">
            Se registró de forma anónima: el sistema no guardó quién la envió.
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <header className="mb-6 space-y-3 border-b border-hairline pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* §93 · La identidad de quien pregunta. El nombre de la empresa es
              la identidad; el logo vive en un almacenamiento privado y abrirlo
              a una página anónima sería un mal negocio por un adorno. */}
          <p className="text-lg font-semibold tracking-tight">{survey.organizationName}</p>
          <Wordmark />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{survey.surveyName}</h1>
          <p className="text-sm text-ink-soft">
            {survey.campaignName}
            {survey.periodLabel ? ` · ${survey.periodLabel}` : ""}
          </p>
          {survey.surveyPurpose ? (
            <p className="text-sm text-ink-soft">{survey.surveyPurpose}</p>
          ) : null}
        </div>
      </header>

      {/* §24 · Antes de la primera pregunta, no al final. */}
      <p
        className="mb-6 rounded-md border border-hairline bg-canvas px-4 py-3 text-sm text-ink"
        role="note"
      >
        {ANONYMITY_MODE_NOTICE[survey.anonymityMode]}
      </p>

      {survey.introText ? (
        <p className="mb-6 text-sm text-ink-soft">{survey.introText}</p>
      ) : null}

      <form action={formAction} className="space-y-8">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="answers" value={payload} />

        {survey.questions.map((q, index) => {
          const current = values[q.id];
          const na = current?.outcome === "not_applicable";
          const groupId = `q-${q.id}`;
          return (
            <fieldset key={q.id} className="space-y-3 border-0 p-0">
              <legend className="text-base font-medium text-ink">
                <span className="text-ink-soft">{index + 1}. </span>
                {q.label}
                {q.is_required ? (
                  <span className="ml-1 text-sm font-normal text-ink-soft">(obligatoria)</span>
                ) : (
                  <span className="ml-1 text-sm font-normal text-ink-soft">(opcional)</span>
                )}
              </legend>
              {q.help_text ? (
                <p id={`${groupId}-help`} className="text-sm text-ink-soft">{q.help_text}</p>
              ) : null}

              {q.question_type === "scale" && q.scale_min !== null && q.scale_max !== null ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {scaleValues(q.scale_min, q.scale_max, q.scale_step ?? 1).map((v) => {
                      const selected = !na && current?.value_numeric === v;
                      return (
                        <label
                          key={v}
                          className={
                            "flex min-w-11 cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm "
                            + (selected
                              ? "border-loop bg-loop/10 font-semibold text-loop-deep"
                              : "border-hairline bg-surface text-ink hover:border-loop")
                          }
                        >
                          <input
                            type="radio"
                            name={groupId}
                            value={v}
                            checked={selected}
                            onChange={() => set(q.id, { outcome: "answered", value_numeric: v })}
                            className="sr-only"
                            aria-describedby={q.help_text ? `${groupId}-help` : undefined}
                          />
                          {v}
                        </label>
                      );
                    })}
                  </div>
                  {q.scale_min_label || q.scale_max_label ? (
                    <p className="flex justify-between text-xs text-ink-soft">
                      <span>{q.scale_min_label ?? ""}</span>
                      <span>{q.scale_max_label ?? ""}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {q.question_type === "yes_no" ? (
                <div className="flex gap-2">
                  {[{ v: 1, l: "Sí" }, { v: 0, l: "No" }].map((o) => {
                    const selected = !na && current?.value_numeric === o.v;
                    return (
                      <label
                        key={o.v}
                        className={
                          "cursor-pointer rounded-md border px-4 py-2 text-sm "
                          + (selected
                            ? "border-loop bg-loop/10 font-semibold text-loop-deep"
                            : "border-hairline bg-surface text-ink hover:border-loop")
                        }
                      >
                        <input
                          type="radio" name={groupId} value={o.v} checked={selected}
                          onChange={() => set(q.id, { outcome: "answered", value_numeric: o.v })}
                          className="sr-only"
                        />
                        {o.l}
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {q.question_type === "single_choice" && q.options ? (
                <div className="space-y-2">
                  {q.options.map((o) => {
                    const selected = !na && current?.value_choices?.includes(o.key);
                    return (
                      <label key={o.key} className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                        <input
                          type="radio" name={groupId} value={o.key} checked={Boolean(selected)}
                          onChange={() => set(q.id, { outcome: "answered", value_choices: [o.key] })}
                          className="mt-1"
                        />
                        <span>{o.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {q.question_type === "multiple_choice" && q.options ? (
                <div className="space-y-2">
                  {q.options.map((o) => {
                    const chosen = current?.value_choices ?? [];
                    const selected = !na && chosen.includes(o.key);
                    return (
                      <label key={o.key} className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                        <input
                          type="checkbox" value={o.key} checked={Boolean(selected)}
                          onChange={() => set(q.id, {
                            outcome: "answered",
                            value_choices: selected
                              ? chosen.filter((k) => k !== o.key)
                              : [...chosen, o.key],
                          })}
                          className="mt-1"
                        />
                        <span>{o.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}

              {q.question_type === "numeric" ? (
                <label className="block">
                  <span className="sr-only">{q.label}</span>
                  <input
                    type="number"
                    value={na ? "" : (current?.value_numeric ?? "")}
                    onChange={(e) => set(q.id, {
                      outcome: "answered",
                      value_numeric: e.target.value === "" ? null : Number(e.target.value),
                    })}
                    className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-base text-ink focus:border-loop"
                  />
                </label>
              ) : null}

              {q.question_type === "text" || q.question_type === "long_text" ? (
                <label className="block">
                  <span className="sr-only">{q.label}</span>
                  <textarea
                    rows={q.question_type === "long_text" ? 5 : 2}
                    maxLength={4000}
                    value={na ? "" : (current?.value_text ?? "")}
                    onChange={(e) => set(q.id, { outcome: "answered", value_text: e.target.value })}
                    className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-base text-ink focus:border-loop"
                  />
                </label>
              ) : null}

              {/* §40 · «No aplica» es una respuesta legítima, y no un cero. */}
              {q.allows_not_applicable ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
                  <input
                    type="checkbox"
                    checked={na}
                    onChange={() => set(q.id, na
                      ? { outcome: "skipped" }
                      : { outcome: "not_applicable" })}
                  />
                  <span>No aplica en mi caso</span>
                </label>
              ) : null}
            </fieldset>
          );
        })}

        {state.error ? (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-ink">
            {state.error}
          </p>
        ) : null}

        <div className="border-t border-hairline pt-5">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-loop px-4 py-3 text-base font-medium text-white transition-colors hover:bg-loop-deep disabled:opacity-60 sm:w-auto sm:px-8"
          >
            {pending ? "Enviando…" : "Enviar respuesta"}
          </button>
          <p className="mt-3 text-xs text-ink-soft">
            Una vez enviada no se puede editar: quedará registrada tal como la mandes.
          </p>
        </div>
      </form>
    </main>
  );
}
