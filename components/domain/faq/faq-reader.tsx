import Link from "next/link";
import type { FaqAnswer, FaqCategoryForReaders } from "@/lib/db/faq-public";
import {
  FAQ_SEARCH_LABEL, FAQ_SEARCH_PLACEHOLDER, FAQ_ALL_CATEGORIES,
  FAQ_EMPTY_NOTHING_PUBLISHED_TITLE, FAQ_EMPTY_NOTHING_PUBLISHED_BODY,
  FAQ_EMPTY_SEARCH_TITLE, FAQ_EMPTY_SEARCH_BODY,
  FAQ_EMPTY_CATEGORY_TITLE, FAQ_EMPTY_CATEGORY_BODY,
  FAQ_UNAVAILABLE_TITLE, FAQ_UNAVAILABLE_BODY,
  moduleDisplayNames, type FaqListOutcome,
} from "@/lib/domain/faq-reader";
import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";

/**
 * Trazaloop · PE-02B3 · Las piezas de la FAQ que lee el cliente.
 *
 * Se pintan en el servidor: la búsqueda y los filtros viajan por la URL, no por
 * estado del navegador. Así una búsqueda se puede compartir, el botón de atrás
 * hace lo que se espera, y quien llega sin ejecutar JavaScript lee igual.
 *
 * Sin acordeones: una respuesta corta cabe entera. Plegarla añadiría estado,
 * `aria-expanded` y una pulsación para leer dos líneas.
 */

const catalogo = COMMERCIAL_MODULES.map((m) => ({ key: m.key, name: m.name }));

/** El buscador. Un `form` normal: funciona con teclado y sin JavaScript. */
export function FaqSearch({
  action, defaultValue, categoryCode, moduleKey,
}: {
  action: string;
  defaultValue: string;
  categoryCode: string | null;
  moduleKey: string | null;
}) {
  return (
    <form action={action} role="search" className="flex flex-wrap gap-2">
      {/* Buscar no debe perder el tema en el que estabas. */}
      {categoryCode ? <input type="hidden" name="tema" value={categoryCode} /> : null}
      {moduleKey ? <input type="hidden" name="modulo" value={moduleKey} /> : null}
      <label className="min-w-0 flex-1">
        <span className="sr-only">{FAQ_SEARCH_LABEL}</span>
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          placeholder={FAQ_SEARCH_PLACEHOLDER}
          aria-label={FAQ_SEARCH_LABEL}
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop"
        />
      </label>
      <button
        type="submit"
        className="rounded-md bg-loop px-4 py-2.5 text-sm font-semibold text-white hover:bg-loop-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
      >
        Buscar
      </button>
    </form>
  );
}

/** Los temas. Enlaces, no pestañas con estado: cada uno es una dirección. */
export function FaqCategoryNav({
  base, categories, active, search,
}: {
  base: string;
  categories: FaqCategoryForReaders[];
  active: string | null;
  search: string;
}) {
  const href = (code: string | null) => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (code) p.set("tema", code);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <nav aria-label="Temas de las preguntas frecuentes">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={href(null)}
            aria-current={active === null ? "page" : undefined}
            className={`inline-flex rounded-full border px-3 py-1 text-sm ${
              active === null
                ? "border-loop bg-loop/10 font-medium text-loop-deep"
                : "border-hairline bg-surface text-ink-soft hover:border-loop"
            }`}
          >
            {FAQ_ALL_CATEGORIES}
          </Link>
        </li>
        {categories.map((c) => (
          <li key={c.code}>
            <Link
              href={href(c.code)}
              aria-current={active === c.code ? "page" : undefined}
              className={`inline-flex rounded-full border px-3 py-1 text-sm ${
                active === c.code
                  ? "border-loop bg-loop/10 font-medium text-loop-deep"
                  : "border-hairline bg-surface text-ink-soft hover:border-loop"
              }`}
            >
              {c.label}{" "}
              <span className="ml-1.5 text-xs text-ink-soft">{c.entries}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Una respuesta en un listado: pregunta, respuesta corta y a dónde seguir. */
export function FaqAnswerCard({ answer, base }: { answer: FaqAnswer; base: string }) {
  const modulos = moduleDisplayNames(answer.moduleKeys, catalogo);
  return (
    <article className="rounded-lg border border-hairline bg-surface p-4">
      <h3 className="text-base font-semibold text-ink">
        <Link
          href={`${base}/${answer.slug}`}
          className="hover:text-loop hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-loop"
        >
          {answer.question}
        </Link>
      </h3>
      <p className="mt-1.5 text-sm text-ink">{answer.answerShort}</p>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        <span className="inline-flex rounded-full border border-hairline bg-paper px-2 py-0.5">
          {answer.categoryLabel}
        </span>
        {modulos.map((n) => (
          <span key={n} className="inline-flex rounded-full border border-hairline bg-paper px-2 py-0.5">
            {n}
          </span>
        ))}
      </p>
    </article>
  );
}

/**
 * El vacío, contado por lo que es.
 *
 * Cuatro situaciones distintas y cuatro textos distintos. La que importa es la
 * primera: una avería no puede leerse como «no hay respuestas», porque quien lo
 * lee deja de buscar.
 */
export function FaqEmptyState({ outcome }: { outcome: FaqListOutcome }) {
  const textos: Record<Exclude<FaqListOutcome, "ok">, { titulo: string; cuerpo: string }> = {
    unavailable: { titulo: FAQ_UNAVAILABLE_TITLE, cuerpo: FAQ_UNAVAILABLE_BODY },
    nothing_published: {
      titulo: FAQ_EMPTY_NOTHING_PUBLISHED_TITLE, cuerpo: FAQ_EMPTY_NOTHING_PUBLISHED_BODY },
    no_search_results: { titulo: FAQ_EMPTY_SEARCH_TITLE, cuerpo: FAQ_EMPTY_SEARCH_BODY },
    empty_category: { titulo: FAQ_EMPTY_CATEGORY_TITLE, cuerpo: FAQ_EMPTY_CATEGORY_BODY },
  };
  if (outcome === "ok") return null;
  const t = textos[outcome];
  const esAveria = outcome === "unavailable";

  return (
    <div
      role="status"
      className={`rounded-lg border p-5 ${
        esAveria
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-dashed border-hairline bg-paper"
      }`}
    >
      <p className="text-sm font-medium text-ink">{t.titulo}</p>
      <p className="mt-1 text-sm text-ink-soft">{t.cuerpo}</p>
    </div>
  );
}
