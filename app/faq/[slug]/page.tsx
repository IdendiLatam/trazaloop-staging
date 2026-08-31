// Pública: se lee SIN sesión. El enlace es estable —el identificador de la
// pregunta no se deriva de su texto—, así que reformular la pregunta no rompe
// un marcador guardado.
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { Wordmark } from "@/components/layout/logo";
import {
  getFaqAnswerBySlug, listRelatedFaq, type FaqAudience,
} from "@/lib/db/faq-public";
import {
  FAQ_TITLE, FAQ_NOT_FOUND_TITLE, FAQ_NOT_FOUND_BODY,
  FAQ_UNAVAILABLE_TITLE, FAQ_UNAVAILABLE_BODY, FAQ_SIGN_IN_HINT,
  moduleDisplayNames,
} from "@/lib/domain/faq-reader";
import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";

const catalogo = COMMERCIAL_MODULES.map((m) => ({ key: m.key, name: m.name }));

/**
 * El título de la pestaña sale de la pregunta PUBLICADA, y solo si es pública.
 *
 * Componer los metadatos con la vista de quien tiene sesión filtraría por el
 * título una respuesta que la página no va a enseñar. Y un borrador no llega
 * aquí de ninguna manera: las vistas no lo contienen.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const res = await getFaqAnswerBySlug("public", slug);
  if (res.status !== "ok" || !res.data) {
    return { title: "Preguntas frecuentes · Trazaloop", robots: { index: false } };
  }
  return {
    title: `${res.data.question} · Trazaloop`,
    description: res.data.answerShort.slice(0, 200),
  };
}

export default async function FaqAnswerPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const audience: FaqAudience = user ? "authenticated" : "public";

  const res = await getFaqAnswerBySlug(audience, slug);
  const answer = res.status === "ok" ? res.data : null;
  const relacionadas = answer
    ? await listRelatedFaq(audience, answer.categoryCode, answer.slug)
    : null;
  const modulos = answer ? moduleDisplayNames(answer.moduleKeys, catalogo) : [];

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="Trazaloop"><Wordmark /></Link>
        <nav className="text-sm">
          <Link href="/faq" className="text-ink-soft hover:text-loop hover:underline">
            {FAQ_TITLE}
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-6 pb-20">
        {/* Una avería y un «no existe» son cosas distintas, y se dicen distinto. */}
        {res.status === "unavailable" ? (
          <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
            <h1 className="text-lg font-semibold text-ink">{FAQ_UNAVAILABLE_TITLE}</h1>
            <p className="mt-1 text-sm text-ink-soft">{FAQ_UNAVAILABLE_BODY}</p>
          </div>
        ) : null}

        {res.status === "ok" && !answer ? (
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {FAQ_NOT_FOUND_TITLE}
            </h1>
            <p className="max-w-xl text-sm text-ink-soft">{FAQ_NOT_FOUND_BODY}</p>
            <p className="pt-1 text-sm">
              <Link href="/faq" className="font-medium text-loop hover:underline">
                Ver todas las preguntas
              </Link>
            </p>
            {!user ? (
              <p className="text-sm text-ink-soft">
                {FAQ_SIGN_IN_HINT}{" "}
                <Link href="/login" className="font-medium text-loop hover:underline">
                  Iniciar sesión
                </Link>
              </p>
            ) : null}
          </div>
        ) : null}

        {answer ? (
          <>
            <article className="space-y-4">
              <p className="eyebrow">
                <Link href={`/faq?tema=${answer.categoryCode}`}
                  className="hover:text-loop hover:underline">
                  {answer.categoryLabel}
                </Link>
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-ink">
                {answer.question}
              </h1>
              <p className="text-base leading-relaxed text-ink">{answer.answerShort}</p>
              {answer.answerLong ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                  {answer.answerLong}
                </p>
              ) : null}
              {modulos.length > 0 ? (
                <p className="flex flex-wrap gap-2 pt-1 text-xs text-ink-soft">
                  {modulos.map((n) => (
                    <span key={n} className="inline-flex rounded-full border border-hairline bg-surface px-2 py-0.5">
                      {n}
                    </span>
                  ))}
                </p>
              ) : null}
            </article>

            {relacionadas?.status === "ok" && relacionadas.data.length > 0 ? (
              <section className="space-y-3">
                <h2 className="eyebrow">Más sobre {answer.categoryLabel}</h2>
                <ul className="space-y-2">
                  {relacionadas.data.map((r) => (
                    <li key={r.slug}>
                      <Link href={`/faq/${r.slug}`}
                        className="text-sm text-loop hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop">
                        {r.question}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <p className="text-sm">
              <Link href="/faq" className="text-ink-soft hover:text-loop hover:underline">
                ← Todas las preguntas
              </Link>
            </p>
          </>
        ) : null}
      </main>

      <footer className="mx-auto max-w-3xl border-t border-hairline px-6 py-6 text-xs text-ink-soft">
        <p>
          <Link href="/" className="text-loop hover:underline">Trazaloop</Link>
          {" · "}
          <Link href="/terms" className="text-loop hover:underline">Términos de uso</Link>
          {" · "}
          <Link href="/privacy" className="text-loop hover:underline">Política de privacidad</Link>
        </p>
      </footer>
    </div>
  );
}
