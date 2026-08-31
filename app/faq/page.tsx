// Pública: se lee SIN sesión. Lee la sesión de forma NO bloqueante —igual que
// la portada— y solo la usa para ampliar lo que se muestra, nunca para
// redirigir. Nunca se prerenderiza: el contenido lo administra la plataforma y
// cambia sin desplegar.
export const dynamic = "force-dynamic";

import Link from "next/link";
import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { Wordmark } from "@/components/layout/logo";
import {
  searchFaq, listFaqCategoriesForReaders, listFeaturedFaq, type FaqAudience,
} from "@/lib/db/faq-public";
import {
  FaqSearch, FaqCategoryNav, FaqAnswerCard, FaqEmptyState,
} from "@/components/domain/faq/faq-reader";
import {
  FAQ_TITLE, FAQ_HEADLINE, FAQ_INTRO, FAQ_FEATURED_TITLE,
  FAQ_CATEGORIES_TITLE, FAQ_SIGN_IN_HINT, faqListOutcome,
} from "@/lib/domain/faq-reader";
import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";

export const metadata: Metadata = {
  title: "Preguntas frecuentes · Trazaloop",
  description:
    "Respuestas cortas sobre Trazaloop: cómo empezar, la cuenta y la empresa, "
    + "los módulos, los documentos y el soporte.",
};

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function FaqPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await searchParams;
  const search = uno(params.q).trim();
  const categoria = uno(params.tema) || null;
  const modulo = uno(params.modulo) || null;
  const page = Math.max(1, Number(uno(params.pagina) || "1"));

  // La sesión SOLO amplía lo que se lee. Nunca redirige, nunca bloquea: quien
  // llega sin haber entrado tiene que poder leer.
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const audience: FaqAudience = user ? "authenticated" : "public";

  const [resultado, categorias, destacadas, total] = await Promise.all([
    searchFaq({ audience, search, categoryCode: categoria, moduleKey: modulo, page }),
    listFaqCategoriesForReaders(audience),
    listFeaturedFaq(audience),
    searchFaq({ audience, pageSize: 1 }),
  ]);

  const filas = resultado.status === "ok" ? resultado.data.rows : [];
  const cuantas = resultado.status === "ok" ? resultado.data.total : 0;
  const outcome = faqListOutcome({
    unavailable: resultado.status === "unavailable",
    total: cuantas,
    hasSearch: search.length > 0,
    hasCategory: Boolean(categoria),
    anyPublishedAtAll: total.status === "ok" && total.data.total > 0,
  });
  const hayFiltro = search.length > 0 || Boolean(categoria) || Boolean(modulo);
  const moduloNombre = modulo
    ? COMMERCIAL_MODULES.find((m) => m.key === modulo)?.name ?? null : null;

  return (
    <div className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="Trazaloop">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <Link href="/modules" className="text-ink-soft hover:text-loop hover:underline">
              Entrar a Trazaloop
            </Link>
          ) : (
            <Link href="/login" className="text-ink-soft hover:text-loop hover:underline">
              Iniciar sesión
            </Link>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 pb-20">
        <section className="space-y-3">
          <p className="eyebrow">{FAQ_TITLE}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{FAQ_HEADLINE}</h1>
          <p className="max-w-2xl text-sm text-ink-soft">{FAQ_INTRO}</p>
          <FaqSearch action="/faq" defaultValue={search}
            categoryCode={categoria} moduleKey={modulo} />
        </section>

        {categorias.status === "ok" && categorias.data.length > 0 ? (
          <section className="space-y-3">
            <h2 className="eyebrow">{FAQ_CATEGORIES_TITLE}</h2>
            <FaqCategoryNav base="/faq" categories={categorias.data}
              active={categoria} search={search} />
          </section>
        ) : null}

        {/* Las destacadas solo cuando no se está buscando: si alguien busca,
            lo que quiere es su resultado, no lo que solemos destacar. */}
        {!hayFiltro && destacadas.status === "ok" && destacadas.data.length > 0 ? (
          <section className="space-y-3">
            <h2 className="eyebrow">{FAQ_FEATURED_TITLE}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {destacadas.data.map((a) => (
                <FaqAnswerCard key={a.slug} answer={a} base="/faq" />
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <h2 className="eyebrow">
            {hayFiltro
              ? `Resultados${cuantas > 0 ? ` · ${cuantas}` : ""}`
              : "Todas las preguntas"}
            {moduloNombre ? ` · ${moduloNombre}` : ""}
          </h2>

          {outcome !== "ok" ? <FaqEmptyState outcome={outcome} /> : null}

          <div className="space-y-3">
            {filas.map((a) => (
              <FaqAnswerCard key={a.slug} answer={a} base="/faq" />
            ))}
          </div>

          {cuantas > filas.length ? (
            <nav className="flex gap-4 text-sm">
              {page > 1 ? (
                <Link href={`/faq?${new URLSearchParams({
                  ...(search ? { q: search } : {}),
                  ...(categoria ? { tema: categoria } : {}),
                  pagina: String(page - 1),
                })}`} className="text-loop hover:underline">← Anterior</Link>
              ) : null}
              {page * filas.length < cuantas || filas.length === 20 ? (
                <Link href={`/faq?${new URLSearchParams({
                  ...(search ? { q: search } : {}),
                  ...(categoria ? { tema: categoria } : {}),
                  pagina: String(page + 1),
                })}`} className="text-loop hover:underline">Siguiente →</Link>
              ) : null}
            </nav>
          ) : null}
        </section>

        {/* A quien no ha entrado se le dice que hay más, sin prometerle
            respuestas concretas que después no encuentre. */}
        {!user ? (
          <p className="rounded-lg border border-hairline bg-surface p-4 text-sm text-ink-soft">
            {FAQ_SIGN_IN_HINT}{" "}
            <Link href="/login" className="font-medium text-loop hover:underline">
              Iniciar sesión
            </Link>
          </p>
        ) : null}
      </main>

      <footer className="mx-auto max-w-4xl border-t border-hairline px-6 py-6 text-xs text-ink-soft">
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
