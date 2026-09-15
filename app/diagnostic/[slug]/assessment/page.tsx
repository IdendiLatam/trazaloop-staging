// Página PÚBLICA del cuestionario (sin login). Todo lo que se pinta sale de la
// RPC acotada `public_diagnostic_get_assessment`, autorizada por el TESTIGO de
// la cookie. `anon` no lee ninguna tabla.
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPublicAssessment } from "@/lib/db/public-diagnostic-assessment";
import { INTAKE_COOKIE } from "@/lib/domain/public-intake-cookies";
import { PublicAssessment } from "@/components/domain/public-diagnostics/assessment";
import { Wordmark } from "@/components/layout/logo";

/**
 * PUBLIC-DIAGNOSTICS-01F · El instrumento, para quien tiene el testigo.
 *
 * `noindex` por lo mismo que la puerta: estas direcciones se reparten por
 * enlace institucional y llevan el nombre de la entidad convocante.
 *
 * Sin testigo no hay nada que ver, y se vuelve a la puerta en vez de enseñar
 * un error: quien llega aquí de más suele ser alguien que borró sus cookies.
 */
export const metadata = {
  title: "Diagnóstico · Trazaloop",
  robots: { index: false, follow: false },
};

const MOTIVO: Record<string, string> = {
  window: "La campaña finalizó. Puedes revisar tus respuestas, pero ya no se "
    + "pueden modificar.",
  campaign: "La campaña finalizó. Puedes revisar tus respuestas, pero ya no se "
    + "pueden modificar.",
  expired: "El plazo para continuar este diagnóstico terminó.",
  abandoned: "Este diagnóstico ya no está activo.",
};

export default async function PublicAssessmentPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const galletas = await cookies();
  const token = galletas.get(INTAKE_COOKIE)?.value ?? null;
  const puerta = `/diagnostic/${encodeURIComponent(slug)}`;
  if (!token) redirect(puerta);

  const evaluacion = await getPublicAssessment(token);
  // El testigo manda: si es de OTRA campaña, aquí no autoriza nada. Y se
  // devuelve a la puerta de ESTA, no a la de la otra — decirle a alguien en
  // qué otra convocatoria participó sería contar lo que no le toca a esa URL.
  if (!evaluacion || evaluacion.slug !== slug) redirect(puerta);

  if (evaluacion.submissionStatus === "completed") {
    redirect(`${puerta}/result`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-2">
        <Wordmark />
        <p className="eyebrow">
          {evaluacion.partnerName ? `Con ${evaluacion.partnerName}` : "Diagnóstico"}
        </p>
        <h1 className="text-xl font-semibold tracking-tight">
          {evaluacion.publicTitle}
        </h1>
      </header>

      <PublicAssessment
        slug={slug}
        sections={evaluacion.sections.map((s) => ({
          code: s.code,
          title: s.title,
          description: s.description,
          questions: s.questions.map((q) => ({
            id: q.id, code: q.code, text: q.text, help: q.help,
            refs: q.refs, answer: q.answer, observations: q.observations,
          })),
        }))}
        startSectionCode={evaluacion.firstIncompleteSection}
        writable={evaluacion.writable}
        lockedMessage={evaluacion.writable
          ? null
          : (MOTIVO[evaluacion.lockedReason ?? ""] ?? "Este diagnóstico ya no admite cambios.")}
      />

      <p className="text-xs text-ink-soft">
        Tu avance se guarda al pulsar «Guardar y continuar». Puedes cerrar esta
        página y volver desde el mismo navegador.
      </p>
    </div>
  );
}
