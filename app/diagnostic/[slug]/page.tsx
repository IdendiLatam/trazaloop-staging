// Página PÚBLICA de campaña (sin login). Resuelve el slug SOLO por la RPC
// acotada `public_diagnostic_resolve_campaign`; `anon` no lee ninguna tabla.
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  resolvePublicCampaign, resumePublicSubmission,
} from "@/lib/db/public-diagnostic-intake";
import { INTAKE_COOKIE } from "@/lib/domain/public-intake-cookies";
import { PublicIntakeForm } from "@/components/domain/public-diagnostics/intake-form";
import { Wordmark } from "@/components/layout/logo";

/**
 * PUBLIC-DIAGNOSTICS-01E · La puerta pública de una convocatoria.
 *
 * `noindex` como el resto de páginas públicas tokenizadas del proyecto: estas
 * direcciones se reparten por enlace institucional y llevan el nombre de la
 * entidad convocante. Que aparezcan en un buscador no ayuda a nadie y expone a
 * un socio. No es la única defensa —no hay sitemap y no se enlazan desde
 * ningún sitio—, pero es la que corresponde.
 */
export const metadata = {
  title: "Diagnóstico · Trazaloop",
  robots: { index: false, follow: false },
};

/** Un diagnóstico de 52 preguntas de sí/no. Se dice el tiempo para que nadie
 *  lo empiece creyendo que son dos minutos y lo abandone a la mitad. */
const PREGUNTAS = 52;
const MINUTOS = "15 a 20 minutos";

export default async function PublicDiagnosticPage({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  /*
    PUBLIC-DIAGNOSTICS-01F · QUIEN YA EMPEZÓ NO VUELVE A PRESENTARSE.

    Si en este navegador hay un testigo de ESTA campaña, la puerta sobra: se
    va directo a donde se quedó. Pedirle otra vez el nombre y el correo a
    alguien que ya está a mitad del cuestionario sería, además de molesto,
    engañoso — el formulario le respondería «ya hay un diagnóstico con ese
    correo» y parecería que perdió el suyo.

    La autorización es el TESTIGO. Que exista otro intento con el mismo correo
    no autoriza nada, y no se mira aquí.
  */
  const galletas = await cookies();
  const token = galletas.get(INTAKE_COOKIE)?.value ?? null;
  if (token) {
    const enCurso = await resumePublicSubmission(token);
    if (enCurso.status === "found" && enCurso.slug === slug) {
      redirect(enCurso.submissionStatus === "completed"
        ? `/diagnostic/${encodeURIComponent(slug)}/result`
        : `/diagnostic/${encodeURIComponent(slug)}/assessment`);
    }
  }

  const campaña = await resolvePublicCampaign(slug);

  // Inexistente, borrador y archivada responden IGUAL: distinguirlas dejaría
  // adivinar el slug de una convocatoria que todavía no se ha anunciado.
  if (!campaña) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-3">
        <Wordmark />
        <p className="eyebrow">
          {campaña.partnerName ? `Con ${campaña.partnerName}` : "Diagnóstico"}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{campaña.publicTitle}</h1>
        {campaña.publicSubtitle ? (
          <p className="max-w-xl text-sm text-ink-soft">{campaña.publicSubtitle}</p>
        ) : null}
      </header>

      {campaña.availability === "scheduled" ? (
        <p role="status" className="rounded-lg border border-hairline bg-surface p-4 text-sm">
          Este diagnóstico estará disponible próximamente.
        </p>
      ) : null}

      {campaña.availability === "window_closed" || campaña.availability === "closed" ? (
        <p role="status" className="rounded-lg border border-hairline bg-surface p-4 text-sm">
          Esta campaña ya finalizó. Gracias por tu interés.
        </p>
      ) : null}

      {campaña.availability === "available" ? (
        <>
          <section className="rounded-lg border border-hairline bg-surface p-4">
            <h2 className="text-sm font-semibold">Qué vas a hacer</h2>
            <ul className="list-disc space-y-1 pl-5 pt-2 text-sm text-ink-soft">
              <li>
                Un diagnóstico de preparación de <strong className="font-medium text-ink">
                {PREGUNTAS} preguntas</strong> de sí o no.
              </li>
              <li>Toma unos <strong className="font-medium text-ink">{MINUTOS}</strong>.</li>
              <li>No necesitas cuenta ni contraseña.</li>
              <li>Al terminar verás tu resultado de inmediato.</li>
            </ul>
            {!campaña.hasConsentDocument ? (
              <p className="pt-3 text-sm text-amber">
                Esta campaña todavía no está lista para recibir participaciones.
              </p>
            ) : null}
          </section>

          {campaña.hasConsentDocument ? (
            <PublicIntakeForm
              slug={slug}
              nonce={campaña.formNonce}
              consentTitle={campaña.consentDocumentTitle}
              consentVersion={campaña.consentDocumentVersion}
            />
          ) : null}
        </>
      ) : null}

      <p className="text-xs text-ink-soft">
        Trazaloop es un producto de IDENDI Latam.
      </p>
    </div>
  );
}
