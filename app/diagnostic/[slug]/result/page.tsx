// Página PÚBLICA del resultado (sin login). Solo la ve quien tiene el TESTIGO
// de SU participación: no hay identificador en la URL que se pueda probar, y
// `anon` no lee ninguna tabla.
export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPublicResult } from "@/lib/db/public-diagnostic-assessment";
import { parsePublicSnapshot, buildPublicReport } from "@/lib/domain/public-diagnostic-report";
import { isPublicRegistrationEnabled } from "@/lib/auth/public-registration";
import { INTAKE_COOKIE } from "@/lib/domain/public-intake-cookies";
import { PublicResultReport } from "@/components/domain/public-diagnostics/result-report";
import { Wordmark } from "@/components/layout/logo";

/**
 * PUBLIC-DIAGNOSTICS-01G · El informe.
 *
 *
 * LA FUENTE ES LA INSTANTÁNEA, Y SOLO ELLA
 *
 * Esta página no carga preguntas, no lee la versión del instrumento y no
 * conoce el motor de puntuación. Pide una cosa —`public_diagnostic_get_result`—
 * y pinta lo que devuelve. Es lo que garantiza que el resultado de hoy sea el
 * mismo que se congeló al cerrar, aunque el código cambie diez veces.
 *
 *
 * QUÉ NO SE INDEXA Y POR QUÉ IMPORTA AQUÍ MÁS QUE EN NINGÚN SITIO
 *
 * `noindex, nofollow`, y el título es genérico A PROPÓSITO: ni la empresa, ni
 * el porcentaje, ni el nivel. Un título con «Recicladora X — 42 %» acabaría en
 * la vista previa de WhatsApp de cualquiera a quien le reenvíen el enlace.
 */
export const metadata = {
  title: "Resultado del diagnóstico · Trazaloop",
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

  const lectura = await getPublicResult(token);

  // Todavía a medias: se sigue respondiendo, no hay resultado que enseñar.
  if (lectura.status === "not_completed") {
    redirect(lectura.slug === slug ? `${puerta}/assessment` : puerta);
  }
  // Testigo inválido, de otra campaña o caducado: la MISMA respuesta para
  // todos, y sin decir cuál de los tres fue.
  if (lectura.status !== "found" || lectura.result.slug !== slug) redirect(puerta);

  const snapshot = parsePublicSnapshot(lectura.result.snapshot);
  if (!snapshot) {
    // Una instantánea ilegible no se completa a ojo: se dice.
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Wordmark />
        <p role="status" className="rounded-lg border border-hairline bg-surface p-4 text-sm">
          Tu diagnóstico está completo, pero no pudimos preparar el informe en
          este momento. Vuelve a intentarlo más tarde desde este mismo navegador.
        </p>
      </div>
    );
  }

  /*
    EL DESTINO DEL CTA SIGUE AL RECORRIDO QUE YA EXISTE.

    La portada ofrece «Crear cuenta Demo» cuando el registro público está
    abierto y «Solicitar acceso» cuando no. Mandar a `/register` con el
    registro cerrado sería llevar a una puerta que no abre, justo después de
    haber prometido ayuda.

    Y no es un embudo: pulsar aquí NO crea cuenta, NO marca consentimiento
    comercial y NO traslada nada de lo que se autorizó para el diagnóstico.
  */
  const registroAbierto = isPublicRegistrationEnabled();

  return (
    <PublicResultReport
      report={buildPublicReport(snapshot)}
      publicTitle={lectura.result.publicTitle}
      partnerName={lectura.result.partnerName}
      companyName={lectura.result.companyName}
      completedAt={lectura.result.completedAt}
      ctaHref={registroAbierto ? "/register" : "mailto:contacto@idendi.org"}
      ctaLabel={registroAbierto ? "Conocer Trazaloop" : "Solicitar acceso"}
      repeatHref={lectura.result.allowRepeat ? `${puerta}?repetir=1` : null}
    />
  );
}
