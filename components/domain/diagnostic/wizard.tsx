"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveDiagnosticAnswersAction,
  completeDiagnosticAction,
} from "@/server/actions/diagnostic";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

type WizardQuestion = {
  id: string;
  code: string;
  questionText: string;
  helpText: string | null;
  standardRefs: string[];
  isCritical: boolean;
};

type WizardSection = {
  code: string;
  title: string;
  description: string | null;
  questions: WizardQuestion[];
};

type AnswerState = { answer: boolean | null; observations: string };

export function DiagnosticWizard({
  diagnosticId,
  sections,
  initialAnswers,
}: {
  diagnosticId: string;
  sections: WizardSection[];
  initialAnswers: Record<string, { answer: boolean; observations: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => {
    const initial: Record<string, AnswerState> = {};
    for (const s of sections) {
      for (const q of s.questions) {
        const existing = initialAnswers[q.id];
        initial[q.id] = existing
          ? { answer: existing.answer, observations: existing.observations ?? "" }
          : { answer: null, observations: "" };
      }
    }
    return initial;
  });

  const totalQuestions = useMemo(
    () => sections.reduce((acc, s) => acc + s.questions.length, 0),
    [sections]
  );
  const answeredCount = useMemo(
    () => Object.values(answers).filter((a) => a.answer !== null).length,
    [answers]
  );
  const allAnswered = answeredCount === totalQuestions;
  const progress = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const section = sections[sectionIndex];

  function setAnswer(questionId: string, answer: boolean) {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], answer } }));
  }
  function setObservations(questionId: string, observations: string) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], observations },
    }));
  }

  function collectAnswered(sectionOnly: WizardSection | null) {
    const source = sectionOnly ? sectionOnly.questions : sections.flatMap((s) => s.questions);
    return source
      .filter((q) => answers[q.id]?.answer !== null)
      .map((q) => ({
        questionId: q.id,
        answer: answers[q.id].answer as boolean,
        observations: answers[q.id].observations,
      }));
  }

  function saveSection(then?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await saveDiagnosticAnswersAction(
        diagnosticId,
        collectAnswered(section)
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      then?.();
    });
  }

  function complete() {
    setError(null);
    startTransition(async () => {
      const saved = await saveDiagnosticAnswersAction(diagnosticId, collectAnswered(null));
      if (saved.error) {
        setError(saved.error);
        return;
      }
      const result = await completeDiagnosticAction(diagnosticId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  const sectionUnanswered = section.questions.filter(
    (q) => answers[q.id]?.answer === null
  ).length;

  return (
    <div className="space-y-6">
      {/* Progreso */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-ink-soft">
          <span>
            Sección {sectionIndex + 1} de {sections.length} · {section.title}
          </span>
          <span className="code">
            {answeredCount}/{totalQuestions} respondidas
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
          <div
            className="h-full rounded-full bg-loop transition-all"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      <ErrorAlert message={error} />

      {section.description ? (
        <p className="text-sm text-ink-soft">{section.description}</p>
      ) : null}

      {/* Preguntas Sí/No */}
      <ol className="space-y-4">
        {section.questions.map((q) => {
          const state = answers[q.id];
          return (
            <li
              key={q.id}
              className="rounded-lg border border-hairline bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                  <span className="code mr-2 text-xs text-ink-soft">{q.code}</span>
                  {q.questionText}
                </p>
                {q.isCritical ? (
                  <span
                    className="shrink-0 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber"
                    title="Pregunta crítica para el nivel de preparación"
                  >
                    Crítica
                  </span>
                ) : null}
              </div>

              {q.helpText ? (
                <p className="mt-1 text-xs text-ink-soft">{q.helpText}</p>
              ) : null}
              {q.standardRefs.length > 0 ? (
                <p className="code mt-1 text-[11px] text-ink-soft/70">
                  {q.standardRefs.join(" · ")}
                </p>
              ) : null}

              <div className="mt-3 flex gap-2" role="radiogroup" aria-label={q.questionText}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={state.answer === true}
                  onClick={() => setAnswer(q.id, true)}
                  className={`rounded-md border px-4 py-1.5 text-sm font-semibold transition-colors ${
                    state.answer === true
                      ? "border-loop bg-loop text-white"
                      : "border-hairline bg-surface text-ink hover:border-loop"
                  }`}
                >
                  Sí
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={state.answer === false}
                  onClick={() => setAnswer(q.id, false)}
                  className={`rounded-md border px-4 py-1.5 text-sm font-semibold transition-colors ${
                    state.answer === false
                      ? "border-ink bg-ink text-white"
                      : "border-hairline bg-surface text-ink hover:border-ink"
                  }`}
                >
                  No
                </button>
              </div>

              <label className="mt-3 block">
                <span className="mb-1 block text-xs text-ink-soft">
                  Observaciones (opcional)
                </span>
                <textarea
                  value={state.observations}
                  onChange={(e) => setObservations(q.id, e.target.value)}
                  rows={2}
                  className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
                />
              </label>
            </li>
          );
        })}
      </ol>

      {sectionUnanswered > 0 ? (
        <p className="text-xs text-ink-soft">
          Faltan {sectionUnanswered} pregunta(s) por responder en esta sección.
        </p>
      ) : null}

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="quiet"
          className="!w-auto"
          disabled={pending || sectionIndex === 0}
          onClick={() => saveSection(() => setSectionIndex((i) => i - 1))}
        >
          Anterior
        </Button>
        <Button
          variant="quiet"
          className="!w-auto"
          disabled={pending}
          onClick={() => saveSection()}
        >
          {pending ? "Guardando…" : "Guardar avance"}
        </Button>
        {sectionIndex < sections.length - 1 ? (
          <Button
            className="!w-auto"
            disabled={pending}
            onClick={() => saveSection(() => setSectionIndex((i) => i + 1))}
          >
            Guardar y continuar
          </Button>
        ) : (
          <Button
            className="!w-auto"
            disabled={pending || !allAnswered}
            title={
              allAnswered
                ? undefined
                : "Responde todas las preguntas para completar el diagnóstico"
            }
            onClick={complete}
          >
            {pending ? "Calculando…" : "Completar diagnóstico"}
          </Button>
        )}
      </div>
    </div>
  );
}
