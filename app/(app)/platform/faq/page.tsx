// Ruta protegida de plataforma: exige platform_staff activo, nunca empresa
// activa. Nunca se prerenderiza (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { listFaqEntriesAction, listFaqCategoriesAction }
  from "@/server/actions/faq-admin";
import { CreateFaqEntryForm } from "@/components/domain/faq/faq-admin-forms";
import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";
import { FAQ_STATUS_LABEL, FAQ_VISIBILITY_LABEL, FAQ_UNAVAILABLE_MESSAGE }
  from "@/lib/domain/faq-admin";
import { FAQ_PAGE_SIZE, type FaqEntryVisibility, type FaqEntryStatus }
  from "@/lib/db/faq-platform";

export const metadata = { title: "Preguntas frecuentes · Plataforma" };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function PlatformFaqPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await searchParams;
  const page = Math.max(1, Number(uno(params.page) || "1"));
  const filtros = {
    search: uno(params.q) || null,
    categoryCode: uno(params.categoria) || null,
    visibility: (uno(params.visibilidad) || null) as FaqEntryVisibility | null,
    status: (uno(params.estado) || null) as FaqEntryStatus | null,
    moduleKey: uno(params.modulo) || null,
    featuredOnly: uno(params.destacadas) === "1",
    page,
  };

  const [{ rows, total, canManage, unavailable }, cats] = await Promise.all([
    listFaqEntriesAction(filtros),
    listFaqCategoriesAction(),
  ]);

  const paginas = Math.max(1, Math.ceil(total / FAQ_PAGE_SIZE));
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({
      q: filtros.search ?? "", categoria: filtros.categoryCode ?? "",
      visibilidad: filtros.visibility ?? "", estado: filtros.status ?? "",
      modulo: filtros.moduleKey ?? "", destacadas: filtros.featuredOnly ? "1" : "",
      ...extra,
    })) { if (v) p.set(k, v); }
    const s = p.toString();
    return s ? `/platform/faq?${s}` : "/platform/faq";
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Plataforma</p>
        <h1 className="text-2xl font-semibold tracking-tight">Preguntas frecuentes</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          El contenido de ayuda de Trazaloop. Se administra desde aquí, sin
          desplegar: lo que se publica queda con su fecha, su autor y en qué se
          apoya.
        </p>
        <p className="pt-1 text-sm">
          <Link href="/platform/faq/categorias" className="text-loop hover:underline">
            Administrar categorías
          </Link>
        </p>
      </header>

      {/* §29 · Una lectura que falla NO se cuenta como «no hay preguntas». */}
      {unavailable ? (
        <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-ink">No se pudo consultar la lista</p>
          <p className="mt-1 text-sm text-ink-soft">{FAQ_UNAVAILABLE_MESSAGE}</p>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="eyebrow">Buscar y filtrar</h2>
        <form method="get" className="grid gap-3 rounded-lg border border-hairline bg-surface p-4 sm:grid-cols-3">
          <label className="block sm:col-span-3">
            <span className="mb-1.5 block text-sm font-medium text-ink">Identificador</span>
            <input name="q" defaultValue={filtros.search ?? ""} type="search"
              placeholder="parte del identificador de la pregunta"
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Categoría</span>
            <select name="categoria" defaultValue={filtros.categoryCode ?? ""}
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop">
              <option value="">Todas</option>
              {cats.categories.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Visibilidad</span>
            <select name="visibilidad" defaultValue={filtros.visibility ?? ""}
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop">
              <option value="">Todas</option>
              <option value="public">Pública</option>
              <option value="authenticated">Con sesión</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Estado</span>
            <select name="estado" defaultValue={filtros.status ?? ""}
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop">
              <option value="">Todos</option>
              <option value="draft">Borrador</option>
              <option value="published">Publicada</option>
              <option value="unpublished">Retirada</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Módulo</span>
            <select name="modulo" defaultValue={filtros.moduleKey ?? ""}
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop">
              <option value="">Todos</option>
              {COMMERCIAL_MODULES.map((m) => (
                <option key={m.key} value={m.key}>{m.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 text-sm text-ink">
            <input type="checkbox" name="destacadas" value="1"
              defaultChecked={filtros.featuredOnly}
              className="mb-2.5 h-4 w-4 rounded border-hairline" />
            <span className="mb-2">Solo destacadas</span>
          </label>
          <div className="flex items-end gap-2 sm:col-span-3">
            <button type="submit"
              className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium hover:border-loop">
              Aplicar
            </button>
            <Link href="/platform/faq" className="text-sm text-ink-soft hover:text-loop hover:underline">
              Quitar filtros
            </Link>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="eyebrow">
            {unavailable ? "Preguntas" : `Preguntas · ${total}`}
          </h2>
          {paginas > 1 ? (
            <p className="text-xs text-ink-soft">Página {page} de {paginas}</p>
          ) : null}
        </div>

        {!unavailable && rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hairline bg-paper p-5 text-sm text-ink-soft">
            No hay ninguna pregunta que cumpla estos filtros.
          </p>
        ) : null}

        <ul className="space-y-2">
          {rows.map((e) => (
            <li key={e.id} className="rounded-lg border border-hairline bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <Link href={`/platform/faq/${e.id}`}
                    className="block text-sm font-semibold text-ink hover:text-loop hover:underline">
                    {e.question}
                  </Link>
                  <p className="text-xs text-ink-soft">
                    {e.categoryLabel} · {FAQ_VISIBILITY_LABEL[e.visibility]}
                    {e.scope === "modules" ? ` · ${e.moduleKeys.join(", ")}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {e.isFeatured ? (
                    <span className="inline-flex rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-[11px] font-medium text-loop-deep">
                      Destacada
                    </span>
                  ) : null}
                  <span className="inline-flex rounded-full border border-hairline bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                    {FAQ_STATUS_LABEL[e.status]}
                  </span>
                  {e.hasPendingDraft ? (
                    <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Borrador con cambios
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {paginas > 1 ? (
          <nav className="flex items-center gap-3 text-sm">
            {page > 1 ? (
              <Link href={qs({ page: String(page - 1) })} className="text-loop hover:underline">
                ← Anterior
              </Link>
            ) : null}
            {page < paginas ? (
              <Link href={qs({ page: String(page + 1) })} className="text-loop hover:underline">
                Siguiente →
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>

      {canManage ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Nueva pregunta</h2>
          <div className="rounded-lg border border-hairline bg-surface p-5">
            <CreateFaqEntryForm categories={cats.categories} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-ink-soft">
          Tu cuenta puede consultar el contenido de la plataforma, no modificarlo.
        </p>
      )}
    </div>
  );
}
