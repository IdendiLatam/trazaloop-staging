"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveTextileDiagnosticAnswersAction,
  completeTextileDiagnosticAction,
} from "@/server/actions/textiles-diagnostic";
import {
  TEXTILE_ANSWER_LABEL,
  type TextileAnswerValue,
} from "@/lib/domain/textiles-diagnostic";
import { Button } from "@/components/ui/button";
import { ErrorAlert, InfoAlert } from "@/components/ui/alert";

/**
 * Trazaloop · Sprint T2 (Textil) · Wizard del diagnóstico textil.
 *
 * Mismo patrón del wizard CPR (dimensión por dimensión, guardado parcial,
 * finalizar con validación) con la escala propia de 4 opciones. La UI solo
 * guía: la validación y el cálculo reales ocurren en servidor.
 *
 * Regla de contexto (TQ49): al responder "No" o "No aplica" en la pregunta
 * de contexto de claims, las demás preguntas de esa dimensión se marcan
 * automáticamente como "No aplica" y se deshabilitan (el scoring del
 * servidor aplica la misma regla de forma independiente).
 */

type WizardQuestion = {
  id: string;
  code: string;
  questionText: string;
  helpText: string | null;
  standardRefs: string[];
  isCritical: boolean;
  allowsNa: boolean;
  isContext: boolean;
};

type WizardSection = {
  code: string;
  title: string;
  description: string | null;
  questions: WizardQuestion[];
};

type AnswerState = { answer: TextileAnswerValue | null; observations: string };

const ANSWER_OPTIONS: TextileAnswerValue[] = ["yes", "partial", "no", "not_applicable"];

export function TextileDiagnosticWizard({
  diagnosticId,
  sections,
  initialAnswers,
}: {
  diagnosticId: string;
  sections: WizardSection[];
  initialAnswers: Record<string, { answer: TextileAnswerValue; observations: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
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
  const progress =
    totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const section = sections[sectionIndex];

  /** ¿La dimensión tiene su pregunta de contexto en "No"/"No aplica"? */
  function contextOff(sectionCode: string): boolean {
    const s = sections.find((x) => x.code === sectionCode);
    const ctx = s?.questions.find((q) => q.isContext);
    if (!ctx) return false;
    const a = answers[ctx.id]?.answer;
    return a === "no" || a === "not_applicable";
  }

  function setAnswer(question: WizardQuestion, answer: TextileAnswerValue) {
    setSavedNotice(false);
    setAnswers((prev) => {
      const next: Record<string, AnswerState> = {
        ...prev,
        [question.id]: { ...prev[question.id], answer },
      };
      // Contexto: "No"/"No aplica" vuelve "No aplica" las demás de su dimensión.
      if (question.isContext) {
        const s = sections.find((x) => x.questions.some((q) => q.id === question.id));
        if (s) {
          for (const q of s.questions) {
            if (q.isContext) continue;
            if (answer === "no" || answer === "not_applicable") {
              next[q.id] = { ...next[q.id], answer: "not_applicable" };
            } else if (next[q.id].answer === "not_applicable") {
              next[q.id] = { ...next[q.id], answer: null };
            }
          }
        }
      }
      return next;
    });
  }

  function setObservations(questionId: string, observations: string) {
    setSavedNotice(false);
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { ...prev[questionId], observations },
    }));
  }

  function collectAnswered() {
    return Object.entries(answers)
      .filter(([, a]) => a.answer !== null)
      .map(([questionId, a]) => ({
        questionId,
        answer: a.answer as TextileAnswerValue,
        observations: a.observations || undefined,
      }));
  }

  function save(goTo?: number) {
    setError(null);
    startTransition(async () => {
      const res = await saveTextileDiagnosticAnswersAction(diagnosticId, collectAnswered());
      if (res.error) {
        setError(res.error);
        return;
      }
      setSavedNotice(true);
      if (goTo !== undefined) setSectionIndex(goTo);
      router.refresh();
    });
  }

  function finalize() {
    setError(null);
    startTransition(async () => {
      const saveRes = await saveTextileDiagnosticAnswersAction(diagnosticId, collectAnswered());
      if (saveRes.error) {
        setError(saveRes.error);
        return;
      }
      const res = await completeTextileDiagnosticAction(diagnosticId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push("/textiles/diagnostic/results");
      router.refresh();
    });
  }

  const disabledByContext = contextOff(section.code);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {sections.map((s, i) => (
            <button
              key={s.code}
              type="button"
              onClick={() => setSectionIndex(i)}
              className={`rounded-md px-2 py-1 text-xs font-medium ${
                i === sectionIndex
                  ? "bg-loop text-white"
                  : "border border-hairline bg-surface text-ink-soft hover:border-loop"
              }`}
            >
              {s.code}
            </button>
          ))}
        </div>
        <span className="text-xs text-ink-soft">
          {answeredCount}/{totalQuestions} respondidas · {progress} %
        </span>
      </div>

      <ErrorAlert message={error} />
      {savedNotice ? <InfoAlert message="Respuestas guardadas." /> : null}

      <section className="space-y-1">
        <h2 className="text-lg font-semibold">
          {section.code} · {section.title}
        </h2>
        {section.description ? (
          <p className="text-sm text-ink-soft">{section.description}</p>
        ) : null}
      </section>

      <div className="space-y-4">
        {section.questions.map((q) => {
          const state = answers[q.id];
          const lockedByContext = !q.isContext && disabledByContext;
          return (
            <div key={q.id} className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="max-w-xl text-sm font-medium">
                  <span className="text-ink-soft">{q.code} · </span>
                  {q.questionText}
                </p>
                <div className="flex gap-1">
                  {q.isCritical ? (
                    <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber">
                      Crítica
                    </span>
                  ) : null}
                  {q.standardRefs.length > 0 ? (
                    <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] text-ink-soft">
                      {q.standardRefs.join(", ")}
                    </span>
                  ) : null}
                </div>
              </div>
              {q.helpText ? <p className="text-xs text-ink-soft">{q.helpText}</p> : null}
              {lockedByContext ? (
                <p className="text-xs text-ink-soft">
                  Marcada como “No aplica” porque la empresa indicó que no hace claims
                  ambientales.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {ANSWER_OPTIONS.map((opt) => {
                  const optionDisabled =
                    pending ||
                    lockedByContext ||
                    (opt === "not_applicable" && !q.allowsNa && !q.isContext);
                  if (opt === "not_applicable" && !q.allowsNa && !q.isContext) {
                    return null; // sin "No aplica" donde no se admite
                  }
                  const selected = state.answer === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={optionDisabled}
                      onClick={() => setAnswer(q, opt)}
                      className={`rounded-md px-3 py-1.5 text-sm ${
                        selected
                          ? "bg-loop font-semibold text-white"
                          : "border border-hairline bg-paper text-ink-soft hover:border-loop"
                      } ${optionDisabled ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      {TEXTILE_ANSWER_LABEL[opt]}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={state.observations}
                onChange={(e) => setObservations(q.id, e.target.value)}
                disabled={pending}
                placeholder="Observaciones (opcional)"
                className="w-full rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm"
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="quiet" disabled={pending} onClick={() => save()}>
          Guardar
        </Button>
        {sectionIndex > 0 ? (
          <Button
            type="button"
            variant="quiet"
            disabled={pending}
            onClick={() => save(sectionIndex - 1)}
          >
            ← Anterior
          </Button>
        ) : null}
        {sectionIndex < sections.length - 1 ? (
          <Button type="button" disabled={pending} onClick={() => save(sectionIndex + 1)}>
            Guardar y continuar →
          </Button>
        ) : (
          <Button type="button" disabled={pending || !allAnswered} onClick={finalize}>
            Finalizar diagnóstico
          </Button>
        )}
        {!allAnswered && sectionIndex === sections.length - 1 ? (
          <span className="text-xs text-ink-soft">
            Responde todas las preguntas para finalizar.
          </span>
        ) : null}
      </div>
    </div>
  );
}
