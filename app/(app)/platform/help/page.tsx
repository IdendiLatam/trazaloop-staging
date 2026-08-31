export const dynamic = "force-dynamic";

import Link from "next/link";
import { listHelpItemsAction } from "@/server/actions/help-admin";
import { CreateHelpItemForm } from "@/components/domain/help/help-admin-forms";
import { PAGE_KEYS } from "@/lib/modules/page-keys";
import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";
import {
  HELP_TARGET_KIND_LABEL, HELP_UNAVAILABLE_MESSAGE, HELP_STATUS_LABEL,
} from "@/lib/domain/contextual-help";

export const metadata = { title: "Ayuda del producto · Plataforma" };

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function PlatformHelpPage(
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await searchParams;
  const filtros = {
    search: uno(params.q) || null,
    moduleKey: uno(params.modulo) || null,
    pageKey: uno(params.pantalla) || null,
    status: uno(params.estado) || null,
  };
  const { items, canManage, unavailable } = await listHelpItemsAction(filtros);

  const porPantalla = new Map<string, typeof items>();
  for (const i of items) {
    porPantalla.set(i.pageKey, [...(porPantalla.get(i.pageKey) ?? []), i]);
  }
  const nombrePantalla = (key: string) =>
    PAGE_KEYS.find((p) => p.key === key)?.label ?? key;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Plataforma</p>
        <h1 className="text-2xl font-semibold tracking-tight">Ayuda del producto</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Lo que se lee al pulsar el botón «i» dentro de Trazaloop. Se corrige
          desde aquí, sin desplegar, y lo publicado queda con su fecha y su autor.
        </p>
      </header>

      {unavailable ? (
        <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-ink">No se pudo consultar la lista</p>
          <p className="mt-1 text-sm text-ink-soft">{HELP_UNAVAILABLE_MESSAGE}</p>
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="eyebrow">Buscar y filtrar</h2>
        <form method="get" className="grid gap-3 rounded-lg border border-hairline bg-surface p-4 sm:grid-cols-3">
          <label className="block sm:col-span-3">
            <span className="mb-1.5 block text-sm font-medium text-ink">Pantalla o elemento</span>
            <input name="q" type="search" defaultValue={filtros.search ?? ""}
              placeholder="parte de la clave de pantalla o del elemento"
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Módulo</span>
            <select name="modulo" defaultValue={filtros.moduleKey ?? ""}
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop">
              <option value="">Todos</option>
              {COMMERCIAL_MODULES.map((m) => (
                <option key={m.key} value={m.key}>{m.name}</option>
              ))}
              <option value="platform">Transversal</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Pantalla</span>
            <select name="pantalla" defaultValue={filtros.pageKey ?? ""}
              className="block w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink focus:border-loop">
              <option value="">Todas</option>
              {PAGE_KEYS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
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
          <div className="flex items-end gap-2 sm:col-span-3">
            <button type="submit"
              className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium hover:border-loop">
              Aplicar
            </button>
            <Link href="/platform/help" className="text-sm text-ink-soft hover:text-loop hover:underline">
              Quitar filtros
            </Link>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="eyebrow">
          {unavailable ? "Ayudas" : `Ayudas · ${items.length}`}
        </h2>

        {!unavailable && items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-hairline bg-paper p-5 text-sm text-ink-soft">
            No hay ninguna ayuda que cumpla estos filtros.
          </p>
        ) : null}

        {[...porPantalla.entries()].map(([pageKey, deEsaPantalla]) => (
          <div key={pageKey} className="space-y-2">
            <h3 className="text-sm font-semibold text-ink">{nombrePantalla(pageKey)}</h3>
            <ul className="space-y-2">
              {deEsaPantalla.map((i) => (
                <li key={i.id} className="rounded-lg border border-hairline bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/platform/help/${i.id}`}
                        className="text-sm font-semibold text-ink hover:text-loop hover:underline">
                        {i.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {HELP_TARGET_KIND_LABEL[i.targetKind as keyof typeof HELP_TARGET_KIND_LABEL]}
                        {i.targetKind !== "page" ? ` · ${i.targetKey}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-hairline bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                        {HELP_STATUS_LABEL[i.status]}
                      </span>
                      {i.hasPendingDraft ? (
                        <span className="inline-flex rounded-full border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          Borrador con cambios
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {canManage ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Nueva ayuda</h2>
          <div className="rounded-lg border border-hairline bg-surface p-5">
            <CreateHelpItemForm pages={PAGE_KEYS.map((p) => ({ key: p.key, label: p.label }))} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-ink-soft">
          Tu cuenta puede consultar la ayuda del producto y su historia, no modificarla.
        </p>
      )}
    </div>
  );
}
