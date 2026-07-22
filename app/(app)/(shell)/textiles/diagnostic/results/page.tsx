// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T2 (Textil) · Resultados del diagnóstico textil.
//
// Muestra el último diagnóstico (finalizado o en borrador): puntaje global,
// nivel de madurez, puntaje por dimensión, brechas principales,
// recomendación general y fecha de actualización — SIEMPRE con la
// advertencia de evaluación interna. En plan Demo se ve el nivel y las
// brechas; el texto de acción recomendada por pregunta se gatea con la
// feature transversal diagnostic_recommendations_enabled (patrón CPR).

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  getTextileDiagnosticSections,
  getActiveTextileQuestions,
  getLatestTextileDiagnostic,
  getTextileDiagnosticAnswers,
} from "@/lib/db/textiles-diagnostic";
import {
  computeTextileDiagnosticResult,
  TEXTILE_DIAGNOSTIC_DISCLAIMER,
  TEXTILE_LEVEL_LABEL,
  TEXTILE_LEVEL_RECOMMENDATION,
  type TextileAnswerValue,
  type TextileMaturityLevel,
} from "@/lib/domain/textiles-diagnostic";
import { checkFeatureEnabled } from "@/server/actions/plans";

const LEVEL_TONE: Record<TextileMaturityLevel, string> = {
  inicial: "border-danger/30 bg-danger/5 text-danger",
  basico: "border-amber/40 bg-amber/10 text-amber",
  intermedio: "border-hairline bg-surface text-ink",
  avanzado: "border-loop/30 bg-loop/5 text-loop-deep",
  preparado: "border-loop bg-loop text-white",
};

export default async function TextileDiagnosticResultsPage() {
  const org = await requireTextilesModule();

  const [sections, questions, latest, recommendationsFeature] = await Promise.all([
    getTextileDiagnosticSections(),
    getActiveTextileQuestions(),
    getLatestTextileDiagnostic(org.organizationId),
    checkFeatureEnabled("diagnostic_recommendations_enabled"),
  ]);
  const recommendationsEnabled = recommendationsFeature.allowed;

  if (!latest) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <p className="eyebrow">Trazaloop Textiles · Diagnóstico</p>
          <h1 className="text-2xl font-semibold tracking-tight">Resultados</h1>
        </header>
        <div className="rounded-lg border border-hairline bg-surface p-6 text-sm">
          Aún no hay un diagnóstico textil.{" "}
          <Link href="/textiles/diagnostic" className="font-medium text-loop hover:underline">
            Inícialo aquí →
          </Link>
        </div>
      </div>
    );
  }

  // El resultado se recalcula con la función pura sobre las respuestas
  // actuales — sirve tanto para el borrador (avance) como para el
  // finalizado (coincide con lo persistido).
  const answersMap = await getTextileDiagnosticAnswers(latest.id);
  const answers = new Map<string, TextileAnswerValue>();
  for (const [questionId, a] of answersMap) answers.set(questionId, a.answer);
  const result = computeTextileDiagnosticResult(sections, questions, answers);

  const isCompleted = latest.status === "completed";
  const percent = isCompleted && latest.maturityPercent !== null
    ? latest.maturityPercent
    : result.maturityPercent;
  const level: TextileMaturityLevel =
    isCompleted && latest.maturityLevel ? latest.maturityLevel : result.maturityLevel;
  const criticalGaps = isCompleted ? latest.criticalGaps : result.criticalGaps;
  const topGaps = result.gaps.slice(0, 8);
  const sectionTitle = new Map(sections.map((s) => [s.code, s.title]));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Diagnóstico</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Resultados del diagnóstico textil
        </h1>
        <p className="text-sm text-ink-soft">
          Estado:{" "}
          <span className="font-medium">{isCompleted ? "Finalizado" : "Borrador (en progreso)"}</span>
          {" · "}Última actualización:{" "}
          {new Date(latest.updatedAt).toLocaleString("es-CO")}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className={`rounded-lg border p-5 ${LEVEL_TONE[level]}`}>
          <p className="text-xs font-medium uppercase opacity-80">Nivel de madurez</p>
          <p className="text-2xl font-semibold">{TEXTILE_LEVEL_LABEL[level]}</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface p-5">
          <p className="text-xs font-medium uppercase text-ink-soft">Puntaje global</p>
          <p className="text-2xl font-semibold">{Math.round(percent)} / 100</p>
        </div>
        <div className="rounded-lg border border-hairline bg-surface p-5">
          <p className="text-xs font-medium uppercase text-ink-soft">Brechas críticas</p>
          <p className="text-2xl font-semibold">{criticalGaps}</p>
        </div>
      </section>

      <p className="max-w-2xl rounded-lg border border-amber/40 bg-amber/10 p-3 text-xs text-ink">
        {TEXTILE_DIAGNOSTIC_DISCLAIMER} El resultado no equivale a certificación ni a
        cumplimiento automático de requisito alguno.
      </p>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Puntaje por dimensión</h2>
        <div className="space-y-2">
          {result.dimensionScores.map((d) => (
            <div key={d.sectionCode} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {d.sectionCode} · {sectionTitle.get(d.sectionCode) ?? d.sectionCode}
                  {d.cappedByCritical ? (
                    <span className="ml-2 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] text-amber">
                      Limitada por brecha crítica
                    </span>
                  ) : null}
                </span>
                <span className="text-ink-soft">
                  {d.percent === null ? "No aplica" : `${Math.round(d.percent)} %`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-paper">
                <div
                  className="h-full rounded-full bg-loop"
                  style={{ width: `${d.percent ?? 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Brechas principales</h2>
        {topGaps.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Sin brechas registradas en las respuestas actuales.
          </p>
        ) : (
          <ul className="space-y-2">
            {topGaps.map((g) => (
              <li key={g.questionId} className="rounded-lg border border-hairline bg-surface p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-soft">{g.code}</span>
                  {g.isCritical ? (
                    <span className="rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] font-medium text-amber">
                      Crítica
                    </span>
                  ) : null}
                  <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] text-ink-soft">
                    {g.answer === "no" ? "No" : "Parcial"}
                  </span>
                </div>
                <p className="mt-1">{g.questionText}</p>
                {recommendationsEnabled && g.recommendedAction ? (
                  <p className="mt-1 text-xs text-ink-soft">→ {g.recommendedAction}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!recommendationsEnabled && topGaps.length > 0 ? (
          <p className="text-xs text-ink-soft">
            Las acciones recomendadas por pregunta están disponibles en planes superiores;
            el nivel, los puntajes y las brechas siempre son visibles.
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recomendación general</h2>
        <p className="max-w-2xl rounded-lg border border-hairline bg-surface p-4 text-sm">
          {TEXTILE_LEVEL_RECOMMENDATION[level]}
        </p>
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/textiles/diagnostic" className="font-medium text-loop hover:underline">
          ← Volver al diagnóstico
        </Link>
        <Link href="/textiles" className="font-medium text-loop hover:underline">
          Ir al módulo Textil
        </Link>
      </div>
    </div>
  );
}
