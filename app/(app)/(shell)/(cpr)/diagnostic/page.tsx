// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireCprModule } from "@/lib/auth/require-cpr-module";
import {
  getDiagnosticSections,
  getActiveQuestions,
  getLatestDiagnostic,
  getDiagnosticAnswers,
} from "@/lib/db/diagnostic";
import { READINESS_LABEL, type ReadinessLevel } from "@/lib/diagnostic/scoring";
import { startDiagnosticFormAction } from "@/server/actions/diagnostic";
import { checkCprFeatureEnabled } from "@/server/actions/module-plans";
import { DiagnosticWizard } from "@/components/domain/diagnostic/wizard";
import { Button } from "@/components/ui/button";
import { InfoAlert } from "@/components/ui/alert";

const LEVEL_TONE: Record<ReadinessLevel, string> = {
  low: "border-danger/30 bg-danger/5 text-danger",
  medium: "border-amber/40 bg-amber/10 text-amber",
  high: "border-loop/30 bg-loop/5 text-loop-deep",
  audit_ready_candidate: "border-loop bg-loop text-white",
};

export default async function DiagnosticPage() {
  const org = await requireCprModule();
  const [sections, questions, latest, recommendationsFeature] = await Promise.all([
    getDiagnosticSections(),
    getActiveQuestions(),
    getLatestDiagnostic(org.organizationId),
    checkCprFeatureEnabled("diagnostic_recommendations_enabled"),
  ]);
  // Bloqueante 1 (Sprint 10A, corrección): Demo SIEMPRE puede tomar y ver
  // el resultado del diagnóstico (respuestas "No", nivel de preparación,
  // % por sección) — lo único que se oculta es el texto de acción
  // recomendada por pregunta, gateado por diagnostic_recommendations_enabled.
  const recommendationsEnabled = recommendationsFeature.allowed;

  const header = (
    <header className="space-y-1">
      <p className="eyebrow">Diagnóstico de preparación</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Grado de preparación de {org.organizationName}
      </h1>
      <p className="max-w-2xl text-sm text-ink-soft">
        Este diagnóstico estima el grado de preparación frente a NTC 6632:2022 y
        UNE-EN 15343:2008. Son preguntas de Sí o No, en lenguaje sencillo;
        responder “Sí” refleja mayor preparación.
      </p>
    </header>
  );

  // Sin diagnóstico o listo para empezar uno nuevo.
  if (!latest) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        {header}
        <div className="rounded-lg border border-hairline bg-surface p-6">
          <p className="mb-4 text-sm text-ink-soft">
            {questions.length} preguntas en {sections.length} secciones. Puedes
            guardar el avance y continuar después. El resultado muestra tu
            nivel de alistamiento, las brechas críticas y acciones recomendadas.
          </p>
          <form action={startDiagnosticFormAction}>
            <Button type="submit" className="!w-auto">
              Iniciar diagnóstico
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Diagnóstico en progreso → wizard.
  if (latest.status === "in_progress") {
    const answers = await getDiagnosticAnswers(latest.id);
    const initialAnswers = Object.fromEntries(
      [...answers.entries()].map(([questionId, a]) => [questionId, a])
    );
    const wizardSections = sections.map((s) => ({
      code: s.code,
      title: s.title,
      description: s.description,
      questions: questions
        .filter((q) => q.sectionCode === s.code)
        .map((q) => ({
          id: q.id,
          code: q.code,
          questionText: q.questionText,
          helpText: q.helpText,
          standardRefs: q.standardRefs,
          isCritical: q.isCritical,
        })),
    }));

    return (
      <div className="mx-auto max-w-3xl space-y-8">
        {header}
        <DiagnosticWizard
          diagnosticId={latest.id}
          sections={wizardSections}
          initialAnswers={initialAnswers}
        />
      </div>
    );
  }

  // Diagnóstico completado → resultado.
  const answers = await getDiagnosticAnswers(latest.id);
  const noAnswers = questions.filter((q) => answers.get(q.id)?.answer === false);
  const level = (latest.readiness_level ?? "low") as ReadinessLevel;
  const sectionScores = latest.section_scores ?? {};

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {header}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-hairline bg-surface p-5">
          <p className="eyebrow mb-2">Preparación total</p>
          <p className="code text-3xl font-semibold">
            {Number(latest.maturity_percent ?? 0).toFixed(1)}%
          </p>
        </div>
        <div className={`rounded-lg border p-5 ${LEVEL_TONE[level]}`}>
          <p className="eyebrow mb-2 !text-current opacity-80">Nivel de alistamiento</p>
          <p className="text-sm font-semibold leading-snug">{READINESS_LABEL[level]}</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface p-5">
          <p className="eyebrow mb-2">Brechas críticas</p>
          <p className="code text-3xl font-semibold">{latest.critical_gaps}</p>
          <p className="mt-1 text-xs text-ink-soft">
            Preguntas críticas respondidas “No”.
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="eyebrow mb-4">Puntaje por sección</h2>
        <ul className="space-y-3">
          {sections.map((s) => {
            const score = sectionScores[s.code];
            const percent = score ? Number(score.percent) : 0;
            return (
              <li key={s.code}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span>{s.title}</span>
                  <span className="code text-ink-soft">{percent.toFixed(0)}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
                  <div
                    className="h-full rounded-full bg-loop"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {noAnswers.length > 0 ? (
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="eyebrow mb-1">Respuestas “No” y acciones recomendadas</h2>
          <p className="mb-4 text-xs text-ink-soft">
            {noAnswers.length} pregunta(s) respondidas “No”. Empieza por las críticas.
          </p>
          {!recommendationsEnabled ? (
            <div className="mb-4">
              <InfoAlert message="Las recomendaciones avanzadas están disponibles en los planes Full y Extra." />
            </div>
          ) : null}
          <ul className="space-y-3">
            {noAnswers.map((q) => (
              <li key={q.id} className="rounded-md border border-hairline p-3">
                <p className="text-sm font-medium">
                  <span className="code mr-2 text-xs text-ink-soft">{q.code}</span>
                  {q.questionText}
                  {q.isCritical ? (
                    <span className="ml-2 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber">
                      Crítica
                    </span>
                  ) : null}
                </p>
                {recommendationsEnabled && q.recommendedAction ? (
                  <p className="mt-1 text-sm text-ink-soft">
                    <span className="font-medium text-loop-deep">Acción: </span>
                    {q.recommendedAction}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="rounded-lg border border-loop/30 bg-loop/5 p-5 text-sm text-loop-deep">
          Todas las preguntas fueron respondidas “Sí”. Mantén los registros al día
          para conservar el nivel de alistamiento.
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/catalog"
          className="inline-flex items-center rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
        >
          Ir a catálogos (siguiente paso)
        </Link>
        <form action={startDiagnosticFormAction}>
          <Button variant="quiet" type="submit" className="!w-auto">
            Iniciar un nuevo diagnóstico
          </Button>
        </form>
      </div>
    </div>
  );
}
