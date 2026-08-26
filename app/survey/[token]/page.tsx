// Página PÚBLICA tokenizada (sin login): el formulario de una encuesta de
// satisfacción. Resuelve el token SOLO por la RPC controlada
// `quality_resolve_survey_token`; `anon` no lee ninguna tabla del dominio.
// QUALITY-08 · §25, §26, §93, §94, §95. No indexable.
export const dynamic = "force-dynamic";

import { resolvePublicSurvey } from "@/lib/db/quality-survey-public";
import { PublicSurveyForm } from "@/components/domain/quality/customer-voice/public-survey-form";
import { Wordmark } from "@/components/layout/logo";

export const metadata = {
  title: "Encuesta",
  robots: { index: false, follow: false },
};

export default async function PublicSurveyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const survey = await resolvePublicSurvey(token);

  // §26 · Mensaje genérico. No revela si el token existió, ni a qué empresa
  // pertenecía, ni por cuál de las razones no sirve.
  if (!survey) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="mb-6 flex justify-center"><Wordmark /></div>
        <h1 className="text-lg font-semibold">Este enlace no está disponible</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Puede que la encuesta ya se haya cerrado, que el enlace haya caducado o que
          ya se haya usado. Si necesitas responder, pide un enlace nuevo a quien te lo
          envió.
        </p>
      </main>
    );
  }

  return <PublicSurveyForm token={token} survey={survey} />;
}
