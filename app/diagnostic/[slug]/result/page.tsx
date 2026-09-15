// Página PÚBLICA del resultado (sin login). Solo la ve quien tiene el TESTIGO
// de SU participación: no hay identificador en la URL que se pueda probar.
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPublicAssessment } from "@/lib/db/public-diagnostic-assessment";
import { INTAKE_COOKIE } from "@/lib/domain/public-intake-cookies";
import { Wordmark } from "@/components/layout/logo";

/**
 * PUBLIC-DIAGNOSTICS-01F · «Ya está». El informe llega en PD-01G.
 *
 * Esta pantalla existe ahora para que el recorrido termine en algún sitio y
 * para dejar puesta la regla de acceso: el resultado lo ve QUIEN TIENE EL
 * TESTIGO de esa participación, y nadie más. Enseñar el informe con lo que ya
 * está calculado habría sido fácil; también habría sido diseñar a medias la
 * experiencia que tiene su propio tramo.
 */
export const metadata = {
  title: "Diagnóstico completado · Trazaloop",
  robots: { index: false, follow: false },
};

export default async function PublicResultPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const galletas = await cookies();
  const token = galletas.get(INTAKE_COOKIE)?.value ?? null;
  const puerta = `/diagnostic/${encodeURIComponent(slug)}`;
  if (!token) redirect(puerta);

  const evaluacion = await getPublicAssessment(token);
  if (!evaluacion || evaluacion.slug !== slug) redirect(puerta);
  // Todavía a medias: se sigue respondiendo, no hay resultado que enseñar.
  if (evaluacion.submissionStatus !== "completed") redirect(`${puerta}/assessment`);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-2">
        <Wordmark />
        <p className="eyebrow">
          {evaluacion.partnerName ? `Con ${evaluacion.partnerName}` : "Diagnóstico"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {evaluacion.publicTitle}
        </h1>
      </header>

      <section role="status" className="rounded-lg border border-loop/30 bg-loop/5 p-5">
        <h2 className="text-sm font-semibold">Diagnóstico completado</h2>
        <p className="pt-1 text-sm text-ink-soft">
          Recibimos tus {evaluacion.progress.total} respuestas y ya calculamos tu
          resultado. Muy pronto podrás verlo aquí mismo, desde este navegador.
        </p>
      </section>

      <p className="text-xs text-ink-soft">
        Trazaloop es un producto de IDENDI Latam.
      </p>
    </div>
  );
}
