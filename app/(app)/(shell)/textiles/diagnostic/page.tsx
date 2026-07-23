// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T2 (Textil) · Diagnóstico inicial de Trazaloop Textiles.
//
// Estados: sin diagnóstico → introducción + iniciar; en progreso → wizard
// por dimensiones; completado → resumen + enlace a resultados + iniciar uno
// nuevo. El resultado SIEMPRE va acompañado de la advertencia de evaluación
// interna (nunca certificación ni cumplimiento).

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  getTextileDiagnosticSections,
  getActiveTextileQuestions,
  getLatestTextileDiagnostic,
  getTextileDiagnosticAnswers,
} from "@/lib/db/textiles-diagnostic";
import {
  TEXTILE_DIAGNOSTIC_DISCLAIMER,
  TEXTILE_LEVEL_LABEL,
} from "@/lib/domain/textiles-diagnostic";
import { startTextileDiagnosticFormAction } from "@/server/actions/textiles-diagnostic";
import { TextileDiagnosticWizard } from "@/components/domain/textiles/diagnostic-wizard";
import { Button } from "@/components/ui/button";

export default async function TextileDiagnosticPage() {
  const org = await requireTextilesModule();

  const [sections, questions, latest] = await Promise.all([
    getTextileDiagnosticSections(),
    getActiveTextileQuestions(),
    getLatestTextileDiagnostic(org.organizationId),
  ]);

  const header = (
    <header className="space-y-1">
      <p className="eyebrow">Trazaloop Textiles · Diagnóstico</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Diagnóstico textil de {org.organizationName}
      </h1>
      <p className="max-w-2xl text-sm text-ink-soft">
        Evaluación interna de preparación en trazabilidad, composición de fibras,
        evidencias, proveedores, procesos, circularidad y control documental del
        sector confección. Escala: Sí · Parcial · No · No aplica — el sector tiene
        niveles de madurez muy distintos y la información parcial también cuenta.
      </p>
      <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_DIAGNOSTIC_DISCLAIMER}</p>
    </header>
  );

  // Sin diagnóstico todavía → introducción + iniciar.
  if (!latest) {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        {header}
        <div className="space-y-4 rounded-lg border border-hairline bg-surface p-6">
          <p className="text-sm">
            El diagnóstico recorre <span className="font-medium">12 dimensiones</span> con{" "}
            <span className="font-medium">{questions.length} preguntas</span> propias de la
            confección textil. Puedes guardarlo por partes y retomarlo cuando quieras; al
            finalizar obtendrás un nivel de madurez, el puntaje por dimensión y las brechas
            principales para priorizar tu preparación.
          </p>
          <ul className="grid gap-1 text-xs text-ink-soft sm:grid-cols-2">
            {sections.map((s) => (
              <li key={s.code}>
                {s.code} · {s.title}
              </li>
            ))}
          </ul>
          <form action={startTextileDiagnosticFormAction}>
            <Button type="submit" className="w-fit">
              Iniciar diagnóstico textil
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Completado → resumen y opción de iniciar uno nuevo.
  if (latest.status === "completed") {
    return (
      <div className="mx-auto max-w-3xl space-y-8">
        {header}
        <div className="space-y-4 rounded-lg border border-loop/30 bg-loop/5 p-6">
          <p className="text-sm">
            Último diagnóstico finalizado el{" "}
            {latest.completedAt ? new Date(latest.completedAt).toLocaleDateString("es-CO") : "—"}{" "}
            con nivel{" "}
            <span className="font-semibold">
              {latest.maturityLevel ? TEXTILE_LEVEL_LABEL[latest.maturityLevel] : "—"}
            </span>{" "}
            ({latest.maturityPercent !== null ? `${Math.round(latest.maturityPercent)} %` : "—"}).
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/textiles/diagnostic/results"
              className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              Ver resultados
            </Link>
            <form action={startTextileDiagnosticFormAction}>
              <Button type="submit" variant="quiet" className="w-fit">
                Iniciar un nuevo diagnóstico
              </Button>
            </form>
          </div>
          <p className="text-xs text-ink-soft">
            Los diagnósticos finalizados quedan como histórico: no se editan ni se borran.
          </p>
        </div>
      </div>
    );
  }

  // En progreso → wizard.
  const answersMap = await getTextileDiagnosticAnswers(latest.id);
  const initialAnswers: Record<
    string,
    { answer: (typeof answersMap extends Map<string, infer V> ? V : never)["answer"]; observations: string | null }
  > = {};
  for (const [questionId, a] of answersMap) {
    initialAnswers[questionId] = { answer: a.answer, observations: a.observations };
  }

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
        allowsNa: q.allowsNa,
        isContext: q.isContext,
      })),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {header}
      <TextileDiagnosticWizard
        diagnosticId={latest.id}
        sections={wizardSections}
        initialAnswers={initialAnswers}
      />
    </div>
  );
}
